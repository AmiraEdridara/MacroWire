#!/usr/bin/env python3
"""Lightweight local API server — reads directly from kalshi.duckdb.

Usage:
    python cli/api.py
    DUCKDB_PATH=~/kalshi.duckdb python cli/api.py
"""

from __future__ import annotations

import os
from pathlib import Path

import duckdb
import pandas as pd
import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

DUCKDB_PATH = Path(os.getenv("DUCKDB_PATH", str(Path.home() / "kalshi.duckdb"))).expanduser()

app = FastAPI(title="MacroWire local API")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


def _con() -> duckdb.DuckDBPyConnection:
    return duckdb.connect(str(DUCKDB_PATH), read_only=True)


# ── /api/markets ──────────────────────────────────────────────────────────────

@app.get("/api/markets")
def get_markets(search: str = "", limit: int = 300):
    with _con() as con:
        base = """
            SELECT
                market_ticker,
                market_title,
                event_title,
                yes_bid,
                yes_ask,
                spread,
                last_price,
                volume,
                close_time
            FROM kalshi_markets
            WHERE status = 'active'
        """
        if search:
            base += f" AND (market_ticker ILIKE '%{search}%' OR event_title ILIKE '%{search}%' OR market_title ILIKE '%{search}%')"
        base += f" ORDER BY volume DESC NULLS LAST LIMIT {limit}"
        rows = con.execute(base).fetchdf()

    now = pd.Timestamp.now("UTC").tz_localize(None)
    markets = []
    for _, r in rows.iterrows():
        close = r.get("close_time")
        dte = None
        if pd.notna(close):
            try:
                ct = pd.Timestamp(close)
                if ct.tzinfo is not None:
                    ct = ct.tz_localize(None)
                dte = max(0, (ct - now).days)
            except Exception:
                pass
        markets.append({
            "market_ticker": r["market_ticker"],
            "market_title":  r.get("market_title") or "",
            "event_title":   r.get("event_title") or "",
            "yes_bid":       float(r["yes_bid"])   if pd.notna(r.get("yes_bid"))   else None,
            "last_price":    float(r["last_price"]) if pd.notna(r.get("last_price")) else None,
            "spread":        float(r["spread"])     if pd.notna(r.get("spread"))     else None,
            "volume":        int(r["volume"])       if pd.notna(r.get("volume"))     else 0,
            "days_to_expiry": dte,
        })
    return {"markets": markets}


# ── /api/institutional/snapshot ──────────────────────────────────────────────

@app.get("/api/institutional/snapshot")
def get_snapshot():
    with _con() as con:
        df = con.execute("""
            SELECT market_ticker, date, close_prob, yes_bid, volume
            FROM kalshi_candlesticks
            ORDER BY market_ticker, date
        """).fetchdf()

    if df.empty:
        return {"volatility": {"ranking": []}, "signals": []}

    df = df.sort_values("date")
    grp = df.groupby("market_ticker")

    last      = grp["close_prob"].last()
    prev      = grp["close_prob"].nth(-2)
    lag7      = grp["close_prob"].nth(-8)
    vol_1d    = (last - prev).fillna(0)
    vol_7d    = (last - lag7).fillna(0)
    last_vol  = grp["volume"].last().fillna(0)
    mean_vol  = grp["volume"].mean().fillna(1).clip(lower=1)
    vol_ratio = last_vol / mean_vol
    last_bid  = grp["yes_bid"].last().fillna(0)

    df["_delta"] = df.groupby("market_ticker")["close_prob"].diff()
    sigma = df.groupby("market_ticker")["_delta"].std().fillna(0.01).clip(lower=0.001)
    z     = vol_1d / sigma

    counts = grp.size()
    valid  = counts[counts >= 5].index

    vol_df = pd.DataFrame({
        "market_ticker": valid,
        "vol_1d":        vol_1d.reindex(valid).fillna(0),
        "vol_7d":        vol_7d.reindex(valid).fillna(0),
        "last_price":    last.reindex(valid).fillna(0),
        "days_to_expiry": None,
    })
    vol_df = vol_df.reindex(vol_df["vol_1d"].abs().sort_values(ascending=False).index).head(50)
    vol_rows = vol_df.to_dict("records")

    z_v  = z.reindex(valid).fillna(0)
    vr_v = vol_ratio.reindex(valid).fillna(0)
    sig_idx = valid[(z_v.abs() >= 1.5) | (vr_v >= 2.0)]

    sig_rows = []
    for ticker in sig_idx:
        zv = float(z_v.get(ticker, 0))
        vr = float(vr_v.get(ticker, 0))
        reasons = []
        if abs(zv) >= 1.5:
            reasons.append(f"z={zv:+.1f}")
        if vr >= 2.0:
            reasons.append(f"vol×{vr:.1f}")
        sig_rows.append({
            "market_ticker": ticker,
            "signal":        "bull" if zv > 0 else "bear",
            "yes_bid":       float(last_bid.get(ticker, 0)),
            "edge":          float(vol_1d.get(ticker, 0)),
            "reasons":       reasons,
        })
    sig_rows.sort(key=lambda r: abs(r["edge"]), reverse=True)

    return {"volatility": {"ranking": vol_rows}, "signals": sig_rows[:30]}


# ── /api/news ─────────────────────────────────────────────────────────────────

@app.get("/api/news")
def get_news(limit: int = 60):
    with _con() as con:
        rows = con.execute(f"""
            SELECT published_at, headline, source
            FROM finnhub_news
            ORDER BY published_at DESC
            LIMIT {limit}
        """).fetchdf()

    news = [
        {
            "published_at": str(r["published_at"])[:10],
            "headline":     str(r["headline"] or "")[:72],
            "source":       str(r["source"]   or "")[:22],
        }
        for _, r in rows.iterrows()
    ]
    return {"news": news}


if __name__ == "__main__":
    port = int(os.getenv("PORT", 8000))
    print(f"MacroWire local API → http://localhost:{port}  (DuckDB: {DUCKDB_PATH})")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="warning")
