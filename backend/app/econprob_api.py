"""
EconProb Backend — FastAPI service reading parquet snapshots.

Endpoints:
    GET /api/markets                     - filterable list of markets
    GET /api/markets/{ticker}            - single market detail
    GET /api/candles/{ticker}            - daily OHLC probability series
    GET /api/calendar                    - macro calendar events
    GET /api/news                        - recent headlines
    GET /api/breaks/{ticker}             - detected structural breaks
    GET /api/returns/{ticker}            - implied return + mark-to-market
    GET /api/correlation                 - correlation matrix for selected tickers
    GET /api/event/{event_id}/study      - event-study window

Run:
    pip install -r requirements.txt
    DATA_DIR=./data uvicorn main:app --reload --port 8000
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta
from functools import lru_cache
from pathlib import Path
from typing import Any, Optional

import math

import numpy as np
import pandas as pd
from fastapi import APIRouter, HTTPException, Query

from app.forexfactory import classify_event
from app.parquet_load import _parse_ff_date

# ── Configuration ──────────────────────────────────────────────────────────
_default_dir = Path(os.getenv("KALSHI_PARQUET", str(Path.home() / "files" / "kalshi_markets.parquet"))).parent
DATA_DIR = Path(os.getenv("DATA_DIR", str(_default_dir)))
DATA_SOURCE = os.getenv("DATA_SOURCE", "parquet").strip().lower()

from app.duckdb_load import (
    use_duckdb, read_table_df, duckdb_path, _maybe_bust_caches,
    TABLE_POLY_MARKETS, TABLE_POLY_CANDLES,
)

router = APIRouter()


# ── Cached parquet loaders ─────────────────────────────────────────────────
@lru_cache(maxsize=1)
def load_markets() -> pd.DataFrame:
    if use_duckdb():
        _maybe_bust_caches()
        from app.duckdb_load import TABLE_MARKETS
        return read_table_df(TABLE_MARKETS)
    path = DATA_DIR / "kalshi_markets.parquet"
    if not path.exists():
        raise HTTPException(503, f"Markets parquet not found at {path}")
    return pd.read_parquet(path)


@lru_cache(maxsize=1)
def load_candles() -> pd.DataFrame:
    if use_duckdb():
        _maybe_bust_caches()
        from app.duckdb_load import TABLE_CANDLES
        df = read_table_df(TABLE_CANDLES)
        if "date" in df.columns:
            df = df.copy()
            df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
        return df
    path = DATA_DIR / "kalshi_candlesticks.parquet"
    if not path.exists():
        raise HTTPException(503, f"Candles parquet not found at {path}")
    df = pd.read_parquet(path)
    df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
    return df


@lru_cache(maxsize=1)
def load_events() -> pd.DataFrame:
    if use_duckdb():
        _maybe_bust_caches()
        from app.duckdb_load import TABLE_EVENTS
        return read_table_df(TABLE_EVENTS)
    path = DATA_DIR / "forexfactory_events.parquet"
    if not path.exists():
        return pd.DataFrame()
    return pd.read_parquet(path)


@lru_cache(maxsize=1)
def load_news() -> pd.DataFrame:
    if use_duckdb():
        _maybe_bust_caches()
        from app.duckdb_load import TABLE_NEWS
        return read_table_df(TABLE_NEWS)
    path = DATA_DIR / "finnhub_news.parquet"
    if not path.exists():
        return pd.DataFrame()
    return pd.read_parquet(path)


@lru_cache(maxsize=1)
def load_polymarket_markets() -> pd.DataFrame:
    if use_duckdb():
        _maybe_bust_caches()
        return read_table_df(TABLE_POLY_MARKETS)
    return pd.DataFrame()


@lru_cache(maxsize=1)
def load_polymarket_candles() -> pd.DataFrame:
    if use_duckdb():
        _maybe_bust_caches()
        df = read_table_df(TABLE_POLY_CANDLES).copy()
        if "date" in df.columns:
            df["date"] = pd.to_datetime(df["date"]).dt.strftime("%Y-%m-%d")
        # Normalise single price column → OHLC shape so the frontend can reuse
        # the same chart components as Kalshi candles.
        if "price" in df.columns:
            df["close_prob"] = df["price"]
            df["open_prob"] = df["price"]
            df["high_prob"] = df["price"]
            df["low_prob"] = df["price"]
        return df
    return pd.DataFrame()


# ── Event → Kalshi market series matching heuristics ────────────────────────
SERIES_BY_EVENT: dict[str, list[str]] = {
    "CPI": ["KXECONSTATCPIYOY", "KXCPI"],
    "Core CPI": ["KXECONSTATCPIYOY", "KXCPICORE"],
    "Federal Funds Rate": ["KXFEDRATE", "KXFEDHIKE"],
    "FOMC": ["KXFEDRATE", "KXFEDHIKE"],
    "Non-Farm Payrolls": ["KXECONSTATNFP", "KXECONSTATU3"],
    "NFP": ["KXECONSTATNFP", "KXECONSTATU3"],
    "Unemployment": ["KXECONSTATU3", "KXU3MAX"],
    "GDP": ["KXGDP"],
    "PCE": ["KXECONSTATPCE"],
    "ISM": ["KXISM"],
}


def match_event_to_markets(event_name: str) -> list[str]:
    """Return list of series ticker prefixes for a calendar event."""
    name_upper = event_name.upper()
    matched = []
    for key, prefixes in SERIES_BY_EVENT.items():
        if key.upper() in name_upper:
            matched.extend(prefixes)
    return matched


# ── Analytics helpers ──────────────────────────────────────────────────────
def detect_breaks(candles: pd.DataFrame, threshold: float = 0.10, min_volume: int = 100) -> list[dict]:
    """Detect single-day probability moves above threshold."""
    if len(candles) < 2:
        return []
    candles = candles.sort_values("date").reset_index(drop=True)
    candles["prev_prob"] = candles["close_prob"].shift(1)
    candles["delta"] = candles["close_prob"] - candles["prev_prob"]

    breaks = candles[
        (candles["delta"].abs() >= threshold) & (candles["volume"] >= min_volume)
    ].copy()

    events = load_events()
    high_impact = events[events["impact"] == "high"] if not events.empty else pd.DataFrame()

    result = []
    for _, row in breaks.iterrows():
        nearest_event = None
        if not high_impact.empty:
            # Attempt date-based match within ±2 days
            row_date = pd.to_datetime(row["date"])
            for _, ev in high_impact.iterrows():
                try:
                    ev_date_str = ev["date_text"].split("\\n")[-1] if "\\n" in str(ev["date_text"]) else ev["date_text"]
                    # ForexFactory dates are tricky — skip if can't parse
                    continue
                except Exception:
                    continue

        result.append({
            "date": row["date"],
            "delta": round(float(row["delta"]), 4),
            "from_prob": round(float(row["prev_prob"]), 4),
            "to_prob": round(float(row["close_prob"]), 4),
            "volume": int(row["volume"]),
            "event": nearest_event,
        })
    return result


def implied_return(yes_ask: float) -> float | None:
    if yes_ask is None or (isinstance(yes_ask, float) and (math.isnan(yes_ask) or math.isinf(yes_ask))):
        return None
    try:
        if pd.isna(yes_ask):
            return None
    except TypeError:
        pass
    yes_ask = float(yes_ask)
    if yes_ask <= 0 or yes_ask >= 1:
        return None
    return (1.0 / yes_ask) - 1.0


def _sanitize_value(value: Any) -> Any:
    if value is None:
        return None
    try:
        if pd.isna(value):
            return None
    except (TypeError, ValueError):
        pass
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    if isinstance(value, (np.floating, np.integer)):
        v = value.item()
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            return None
        return v
    if hasattr(value, "isoformat"):
        return str(value)[:10]
    return value


def _sanitize_records(records: list[dict]) -> list[dict]:
    return [{k: _sanitize_value(v) for k, v in row.items()} for row in records]


# ── Routes ─────────────────────────────────────────────────────────────────
def _v2_category(row: dict) -> str:
    text = " ".join(
        str(row.get(k) or "")
        for k in ("series_ticker", "event_title", "market_title", "category")
    ).lower()
    if any(x in text for x in ("fed", "fomc", "funds rate")):
        return "fed"
    if any(x in text for x in ("cpi", "pce", "inflation")):
        return "inflation"
    if any(x in text for x in ("nfp", "payroll", "jobless", "unemployment", "u3")):
        return "unemployment"
    if "gdp" in text:
        return "gdp"
    return "other"


def _normalize_close_prob(row: dict) -> float | None:
    """Use yes_bid; when market is clearly settled YES (bid high, ask at 100), use ask."""
    bid = row.get("yes_bid")
    ask = row.get("yes_ask")
    close = row.get("close_prob")
    if bid is None and close is None:
        return None
    bid = float(bid if bid is not None else close)
    if ask is not None:
        ask = float(ask)
        if bid >= 0.95 and ask >= 0.99:
            return ask
    return bid


def _safe_int(val: Any, default: int = 0) -> int:
    if val is None:
        return default
    try:
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return default
        return int(f)
    except (TypeError, ValueError):
        return default


def _trim_post_settlement_candles(records: list[dict]) -> list[dict]:
    """Drop trailing days after settlement (bid=0, no volume, after meaningful trading)."""
    if len(records) < 2:
        return records
    rows = sorted(records, key=lambda r: str(r.get("date", "")))
    while len(rows) > 1:
        last, prev = rows[-1], rows[-2]
        bid = last.get("yes_bid")
        if bid is None:
            bid = last.get("close_prob")
        prev_bid = prev.get("yes_bid")
        if prev_bid is None:
            prev_bid = prev.get("close_prob")
        vol = _safe_int(last.get("volume"))
        if bid == 0 and vol == 0 and (prev_bid or 0) >= 0.5:
            rows.pop()
            continue
        break
    return rows


def _prepare_candle_series(records: list[dict]) -> list[dict]:
    """Normalize close_prob and trim post-settlement junk for chart display."""
    out = []
    for row in records:
        r = dict(row)
        norm = _normalize_close_prob(r)
        if norm is not None:
            r["close_prob"] = norm
        out.append(r)
    return _trim_post_settlement_candles(out)


def _series_key(event_name: str) -> str:
    name = (event_name or "").lower()
    if "fomc" in name or "fed" in name or "federal funds" in name:
        return "fed"
    if "pce" in name:
        return "pce"
    if "cpi" in name or "consumer price" in name:
        return "cpi"
    if (
        "payroll" in name
        or "nfp" in name
        or "non-farm" in name
        or "nonfarm" in name
        or "non farm" in name
        or "employment change" in name
        or "unemployment rate" in name
    ):
        return "nfp"
    if "gdp" in name:
        return "gdp"
    if "ism" in name or "pmi" in name:
        return "pmi"
    return "pmi"


@router.get("/api/markets")
def list_markets(
    category: Optional[str] = Query(None),
    series: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    limit: int = Query(500, le=15000),
):
    """Filterable list of Kalshi markets (active + backfilled settled)."""
    df = load_markets().copy()
    df["category"] = df.apply(lambda r: _v2_category(r.to_dict()), axis=1)

    if status and "status" in df.columns:
        st = status.lower()
        if st in ("settled", "finalized"):
            df = df[df["status"].str.lower().isin(["settled", "finalized"])]
        else:
            df = df[df["status"].str.lower() == st]
    if category:
        df = df[df["category"] == category]
    if series:
        df = df[df["series_ticker"].str.contains(series, case=False, na=False)]
    if search:
        s = search.lower()
        mask = (
            df["event_title"].str.lower().str.contains(s, na=False)
            | df["market_title"].str.lower().str.contains(s, na=False)
            | df["market_ticker"].str.lower().str.contains(s, na=False)
        )
        df = df[mask]

    df = df.head(limit)

    # Compute days_to_expiry
    now = pd.Timestamp.now()
    df = df.copy()
    df["days_to_expiry"] = (pd.to_datetime(df["close_time"]) - now).dt.days

    # Add implied_return
    df["implied_return"] = df["yes_ask"].apply(implied_return)

    cols = [
        "market_ticker", "series_ticker", "event_title", "market_title",
        "status", "result", "yes_bid", "yes_ask", "no_bid", "no_ask", "spread",
        "last_price", "volume", "open_interest", "liquidity",
        "open_time", "close_time", "days_to_expiry", "implied_return", "category",
    ]
    cols = [c for c in cols if c in df.columns]
    records = _sanitize_records(df[cols].to_dict(orient="records"))
    for row in records:
        row["series_subtitle"] = row.get("series_ticker") or ""
    return {
        "count": len(records),
        "markets": records,
    }


@router.get("/api/markets/{ticker}")
def get_market(ticker: str):
    df = load_markets()
    row = df[df["market_ticker"] == ticker]
    if row.empty:
        raise HTTPException(404, f"Market {ticker} not found")
    m = {k: _sanitize_value(v) for k, v in row.iloc[0].to_dict().items()}
    m["days_to_expiry"] = int((pd.to_datetime(m["close_time"]) - pd.Timestamp.now()).days)
    m["implied_return"] = implied_return(m["yes_ask"])
    return m


@router.get("/api/candles/bulk")
def get_candles_bulk(
    days: int = Query(120, le=400),
    limit: int = Query(200, le=500),
):
    """Candle history for top-volume Kalshi + Polymarket markets (correlation / forecast pages)."""
    _maybe_bust_caches()
    series_frames: list[pd.DataFrame] = []
    all_tickers: list[str] = []

    # ── Kalshi ────────────────────────────────────────────────────────────────
    markets_df = load_markets()
    if not markets_df.empty:
        top = markets_df.sort_values("volume", ascending=False).head(limit)
        tickers = top["market_ticker"].tolist()
        all_tickers.extend(tickers)
        df = load_candles()
        if not df.empty:
            sub = df[df["market_ticker"].isin(tickers)].sort_values(["market_ticker", "date"])
            if not sub.empty:
                sub = sub.groupby("market_ticker", group_keys=False).tail(days)
                series_frames.append(sub)

    # ── Polymarket ────────────────────────────────────────────────────────────
    try:
        poly_markets = load_polymarket_markets()
        if not poly_markets.empty:
            poly_top = poly_markets.sort_values("volume", ascending=False).head(limit)
            cids = poly_top["condition_id"].tolist()
            poly_df = load_polymarket_candles()
            if not poly_df.empty:
                poly_sub = poly_df[poly_df["condition_id"].isin(cids)].copy()
                if not poly_sub.empty:
                    # Normalise: frontend expects market_ticker
                    if "market_ticker" not in poly_sub.columns:
                        poly_sub["market_ticker"] = poly_sub["condition_id"]
                    poly_sub = poly_sub.sort_values(["market_ticker", "date"])
                    poly_sub = poly_sub.groupby("market_ticker", group_keys=False).tail(days)
                    all_tickers.extend(poly_sub["market_ticker"].unique().tolist())
                    series_frames.append(poly_sub)
    except Exception:
        pass  # polymarket unavailable — Kalshi-only graceful fallback

    if not series_frames:
        return {"series": [], "tickers": all_tickers, "count": 0}

    combined = pd.concat(series_frames, ignore_index=True)
    prepared = []
    for ticker, grp in combined.groupby("market_ticker"):
        prepared.extend(_prepare_candle_series(grp.to_dict(orient="records")))
    return {
        "tickers": all_tickers,
        "count": len(prepared),
        "series": _sanitize_records(prepared),
    }


@router.get("/api/candles/{ticker}")
def get_candles(ticker: str, days: int = Query(90, le=400)):
    """Daily OHLC probability series."""
    _maybe_bust_caches()
    df = load_candles()
    sub = df[df["market_ticker"] == ticker].sort_values("date")
    if sub.empty:
        return {"ticker": ticker, "series": []}
    sub = sub.tail(days)
    series = _prepare_candle_series(sub.to_dict(orient="records"))
    return {
        "ticker": ticker,
        "series": _sanitize_records(series),
    }


@router.get("/api/calendar")
def get_calendar(
    currency: Optional[str] = Query("USD"),
    impact: Optional[str] = Query(None),
    days_back: int = Query(60),
    days_forward: int = Query(60),
):
    df = load_events()
    if df.empty:
        return {"events": [], "count": 0}

    today = datetime.now().date()
    events = []

    # Support both new schema (event_date) and old schema (date_text/week)
    has_new_schema = "event_date" in df.columns

    for _, row in df.iterrows():
        row_dict = row.to_dict()
        if currency and str(row_dict.get("currency", "")).upper() != currency.upper():
            continue

        row_impact = str(row_dict.get("impact", "")).lower()
        if impact:
            if row_impact != impact.lower():
                continue
        else:
            # Default: exclude Low and Holiday events
            if row_impact in ("low", "holiday", "non-economic", ""):
                continue

        if has_new_schema and row_dict.get("event_date") is not None:
            try:
                ev_date = pd.to_datetime(row_dict["event_date"]).date()
                time_text = str(row_dict.get("event_time") or "08:30").strip()
                date_iso = f"{ev_date}T{time_text or '08:30'}:00"
            except Exception:
                continue
        else:
            date_iso = _parse_ff_date(
                str(row_dict.get("date_text") or ""),
                str(row_dict.get("time_text") or ""),
                str(row_dict.get("week") or ""),
            )
            if not date_iso:
                continue
            ev_date = datetime.fromisoformat(date_iso).date()
            time_text = str(row_dict.get("time_text") or "08:30").strip()

        if (today - ev_date).days > days_back:
            continue
        if (ev_date - today).days > days_forward:
            continue

        name = str(row_dict.get("event_name") or "")
        events.append(
            {
                "event_name": name,
                "date": date_iso,
                "time": time_text if time_text else "08:30",
                "currency": row_dict.get("currency") or "USD",
                "impact": row_dict.get("impact") or "high",
                "actual": str(row_dict.get("actual") or ""),
                "forecast": str(row_dict.get("forecast") or ""),
                "previous": str(row_dict.get("previous") or ""),
                "series": _series_key(name),
            }
        )

    events.sort(key=lambda e: e["date"])
    return {"events": events, "count": len(events)}


@router.get("/api/news")
def get_news(limit: int = Query(20, le=100)):
    df = load_news()
    if df.empty:
        return {"news": []}
    df = df.sort_values("published_at", ascending=False).head(limit)
    return {"news": _sanitize_records(df.to_dict(orient="records"))}


@router.get("/api/breaks/{ticker}")
def get_breaks(
    ticker: str,
    threshold: float = Query(0.10, ge=0.01, le=0.5),
    min_volume: int = Query(100, ge=0),
):
    df = load_candles()
    sub = df[df["market_ticker"] == ticker]
    if sub.empty:
        return {"ticker": ticker, "breaks": []}
    breaks = detect_breaks(sub, threshold=threshold, min_volume=min_volume)
    return {"ticker": ticker, "breaks": breaks, "count": len(breaks)}


@router.get("/api/returns/{ticker}")
def get_returns(
    ticker: str,
    entry_date: Optional[str] = Query(None),
    side: str = Query("yes", pattern="^(yes|no)$"),
    size: float = Query(100.0),
    user_prob: Optional[float] = Query(None, ge=0.0, le=1.0),
):
    """Implied return, mark-to-market, edge, and YES/NO scenario payoffs."""
    df = load_candles()
    sub = df[df["market_ticker"] == ticker].sort_values("date").reset_index(drop=True)
    if sub.empty:
        raise HTTPException(404, f"No candles for {ticker}")

    latest = sub.iloc[-1]
    yes_ask = float(latest["yes_ask"])
    no_ask = 1.0 - float(latest["yes_bid"])
    entry_price = yes_ask if side == "yes" else no_ask

    # Scenarios
    if side == "yes":
        if_yes = (1 - entry_price) * size
        if_no = -entry_price * size
    else:
        if_yes = -entry_price * size
        if_no = (1 - entry_price) * size

    # Mark to market series
    mtm = []
    if entry_date:
        entry_row = sub[sub["date"] == entry_date]
        if not entry_row.empty:
            ep = float(entry_row.iloc[0]["yes_ask"]) if side == "yes" else (1 - float(entry_row.iloc[0]["yes_bid"]))
            for _, row in sub[sub["date"] >= entry_date].iterrows():
                exit_p = float(row["yes_bid"]) if side == "yes" else (1 - float(row["yes_ask"]))
                pnl = exit_p - ep
                mtm.append({
                    "date": row["date"],
                    "pnl": round(pnl, 4),
                    "pnl_pct": round(pnl / ep * 100 if ep > 0 else 0, 2),
                    "dollar_pnl": round(pnl * size, 2),
                })

    # Edge
    edge = None
    ev_per_dollar = None
    if user_prob is not None:
        market_prob = yes_ask if side == "yes" else (1 - yes_ask)
        edge = user_prob - market_prob
        ev_per_dollar = user_prob * (1 - entry_price) - (1 - user_prob) * entry_price

    return {
        "ticker": ticker,
        "side": side,
        "entry_price": round(entry_price, 4),
        "implied_return": round(implied_return(entry_price), 4),
        "scenarios": {
            "if_yes": round(if_yes, 2),
            "if_no": round(if_no, 2),
            "break_even": round(entry_price, 4),
        },
        "edge": {
            "user_prob": user_prob,
            "market_prob": round(yes_ask if side == "yes" else (1 - yes_ask), 4),
            "edge_pp": round(edge, 4) if edge is not None else None,
            "ev_per_dollar": round(ev_per_dollar, 4) if ev_per_dollar is not None else None,
        },
        "mtm": mtm,
    }


@router.get("/api/correlation")
def correlation(
    tickers: str = Query(..., description="Comma-separated market tickers"),
    days: int = Query(30, le=180),
):
    """Pairwise correlation matrix of daily close_prob changes."""
    requested = [t.strip() for t in tickers.split(",") if t.strip()]
    df = load_candles()
    sub = df[df["market_ticker"].isin(requested)].copy()
    if sub.empty:
        raise HTTPException(404, "No data for given tickers")

    sub = sub.sort_values(["market_ticker", "date"])
    pivot = sub.pivot(index="date", columns="market_ticker", values="close_prob")
    changes = pivot.diff().tail(days)
    corr = changes.corr().round(3).fillna(0)

    return {
        "tickers": list(corr.columns),
        "matrix": corr.to_dict(orient="split"),
        "window_days": days,
    }


@router.get("/api/analytics/volatility")
def volatility_ranking(
    window: int = Query(14, ge=2, le=60),
    limit: int = Query(500, le=5000),
    series: Optional[str] = Query(None),
):
    """Rank markets by recent daily-change volatility."""
    df = load_candles()
    if df.empty:
        return {"window_days": window, "ranking": []}

    markets = load_markets()
    if series and "series_ticker" in markets.columns:
        tickers = set(markets[markets["series_ticker"] == series]["market_ticker"])
        df = df[df["market_ticker"].isin(tickers)]

    df = df.sort_values(["market_ticker", "date"])
    df["delta"] = df.groupby("market_ticker")["close_prob"].diff()

    # Only include markets with sufficient history for proper volatility calculation
    df["row_rank"] = df.groupby("market_ticker").cumcount(ascending=False)
    
    # Filter to markets that have at least `window` data points
    market_counts = df.groupby("market_ticker").size()
    sufficient_markets = market_counts[market_counts >= window].index
    df_sufficient = df[df["market_ticker"].isin(sufficient_markets)]
    
    # Take last `window` rows per market and compute std
    recent = df_sufficient[df_sufficient["row_rank"] < window]
    vol = recent.groupby("market_ticker")["delta"].std().sort_values(ascending=False)

    if limit > 0:
        vol = vol.head(limit)

    market_cols = ["market_ticker", "series_ticker", "event_title", "market_title", "category", "yes_ask", "volume"]
    market_cols = [c for c in market_cols if c in markets.columns]
    market_lookup = markets[market_cols].drop_duplicates("market_ticker").set_index("market_ticker")

    out = []
    for ticker, v in vol.items():
        row = {"market_ticker": ticker, "vol_pp": round(float(v) * 100, 2)}
        if ticker in market_lookup.index:
            m = market_lookup.loc[ticker]
            row.update({
                "series_ticker": _sanitize_value(m.get("series_ticker")),
                "event_title": _sanitize_value(m.get("event_title")),
                "market_title": _sanitize_value(m.get("market_title")),
                "category": _sanitize_value(m.get("category")),
                "yes_ask": _sanitize_value(m.get("yes_ask")),
                "volume": int(m.get("volume") or 0),
            })
        else:
            row.update({
                "series_ticker": "",
                "event_title": "",
                "market_title": "",
                "category": "",
                "yes_ask": None,
                "volume": 0,
            })
        out.append(row)

    return {"window_days": window, "series": series, "ranking": out}


# ── Polymarket endpoints ────────────────────────────────────────────────────

@router.get("/api/polymarket/markets")
def list_polymarket_markets(
    category: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    limit: int = Query(500, le=2000),
):
    """Filterable list of Polymarket markets."""
    df = load_polymarket_markets()
    if df.empty:
        return {"count": 0, "markets": []}

    if category and "category" in df.columns:
        df = df[df["category"].str.lower() == category.lower()]
    if search and "question" in df.columns:
        df = df[df["question"].str.lower().str.contains(search.lower(), na=False)]

    df = df.head(limit)

    now = pd.Timestamp.now()
    df = df.copy()
    if "end_date" in df.columns:
        df["days_to_expiry"] = (pd.to_datetime(df["end_date"], errors="coerce") - now).dt.days

    cols = [
        "condition_id", "token_id", "question", "category", "slug",
        "end_date", "yes_price", "no_price", "spread",
        "best_bid", "best_ask", "volume", "volume_24h", "liquidity",
        "days_to_expiry",
    ]
    cols = [c for c in cols if c in df.columns]
    records = _sanitize_records(df[cols].to_dict(orient="records"))
    return {"count": len(records), "markets": records}


@router.get("/api/polymarket/markets/{condition_id}")
def get_polymarket_market(condition_id: str):
    df = load_polymarket_markets()
    row = df[df["condition_id"] == condition_id]
    if row.empty:
        raise HTTPException(404, f"Polymarket condition {condition_id} not found")
    m = {k: _sanitize_value(v) for k, v in row.iloc[0].to_dict().items()}
    if "end_date" in m and m["end_date"]:
        m["days_to_expiry"] = int((pd.to_datetime(m["end_date"]) - pd.Timestamp.now()).days)
    return m


@router.get("/api/polymarket/candles/bulk")
def get_polymarket_candles_bulk(
    days: int = Query(120, le=400),
    limit: int = Query(24, le=50),
):
    """Candle history for top-volume Polymarket markets."""
    markets_df = load_polymarket_markets()
    if markets_df.empty:
        return {"series": [], "condition_ids": [], "count": 0}

    top = markets_df.sort_values("volume", ascending=False).head(limit)
    cids = top["condition_id"].tolist()

    df = load_polymarket_candles()
    if df.empty:
        return {"series": [], "condition_ids": cids, "count": 0}

    sub = df[df["condition_id"].isin(cids)].sort_values(["condition_id", "date"])
    sub = sub.groupby("condition_id", group_keys=False).tail(days)
    return {
        "condition_ids": cids,
        "count": len(sub),
        "series": _sanitize_records(sub.to_dict(orient="records")),
    }


@router.get("/api/polymarket/candles/{condition_id}")
def get_polymarket_candles(condition_id: str, days: int = Query(90, le=400)):
    """Daily price series for a Polymarket condition (OHLC-normalised)."""
    df = load_polymarket_candles()
    sub = df[df["condition_id"] == condition_id].sort_values("date")
    if sub.empty:
        return {"condition_id": condition_id, "series": []}
    sub = sub.tail(days)
    return {
        "condition_id": condition_id,
        "series": _sanitize_records(sub.to_dict(orient="records")),
    }
