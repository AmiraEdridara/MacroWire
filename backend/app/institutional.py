"""
Institutional endpoints — built for funds that consume signals programmatically
rather than reading the UI.

    GET /api/institutional/snapshot          - consolidated JSON (markets + vol + calibration)
    GET /api/institutional/signals           - ranked composite signals
    GET /api/institutional/calibration       - reliability curve / Brier / log-loss
    GET /api/institutional/markets.csv       - markets table as CSV
    GET /api/institutional/volatility.csv    - volatility ranking as CSV
    GET /api/institutional/signals.csv       - signals as CSV
"""

from __future__ import annotations

import io
import math
from typing import Optional

import numpy as np
import pandas as pd
from fastapi import APIRouter, Query
from fastapi.responses import Response

from app.econprob_api import (
    _sanitize_records,
    implied_return,
    load_candles,
    load_markets,
    volatility_ranking,
)
from app.signals import compute_signals

router = APIRouter(prefix="/api/institutional", tags=["institutional"])


def _outcome_from_result(val) -> int | None:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    s = str(val).lower().strip()
    if s == "yes":
        return 1
    if s == "no":
        return 0
    return None


def _prediction_at_lead(
    g: pd.DataFrame,
    lead_days: int,
    close_time,
    *,
    clear_hi: float,
    clear_lo: float,
    use_lock_zone: bool,
) -> float | None:
    """Last pre-resolution price `lead_days` before close (or lock-in zone)."""
    probs = g["close_prob"].to_numpy(dtype=float)
    dates = pd.to_datetime(g["date"])

    if close_time is not None and not pd.isna(close_time):
        close_date = pd.to_datetime(close_time).normalize()
        in_window = dates < close_date
        if not in_window.any():
            return None
        idxs = g.index[in_window].tolist()
        anchor = idxs[-1]
        pos = g.index.get_loc(anchor)
        if isinstance(pos, slice):
            pos = pos.stop - 1
        pred_idx = pos - lead_days
        if pred_idx < 0:
            return None
        pred = probs[pred_idx]
    elif use_lock_zone:
        terminal = probs[-1]
        if terminal is None or math.isnan(terminal):
            return None
        if terminal >= clear_hi:
            in_zone = probs >= clear_hi
        elif terminal <= clear_lo:
            in_zone = probs <= clear_lo
        else:
            return None
        lock_idx = len(probs) - 1
        while lock_idx > 0 and in_zone[lock_idx - 1]:
            lock_idx -= 1
        pred_idx = lock_idx - lead_days
        if pred_idx < 0:
            return None
        pred = probs[pred_idx]
    else:
        return None

    if pred is None or math.isnan(pred):
        return None
    return float(min(0.999, max(0.001, pred)))


# ── Calibration ─────────────────────────────────────────────────────────────
def compute_calibration(
    lead_days: int = 7,
    bins: int = 10,
    clear_hi: float = 0.90,
    clear_lo: float = 0.10,
    min_history: int = 15,
) -> dict:
    """
    Are Kalshi prices well calibrated? Uses the gold-standard `result` column when
    present (settled economics backfill); falls back to candle terminal inference
    for older rows without a result. Prediction = close_prob `lead_days` before
    resolution.
    """
    candles = load_candles()
    if candles.empty:
        return {"points": 0, "reliability": [], "brier": None, "log_loss": None}

    markets_df = load_markets()
    mkt_lookup: dict[str, dict] = {}
    if not markets_df.empty and "market_ticker" in markets_df.columns:
        for row in markets_df.to_dict(orient="records"):
            mkt_lookup[str(row["market_ticker"])] = row

    today = pd.Timestamp.now().normalize()
    preds: list[float] = []
    outcomes: list[int] = []
    n_gold = n_inferred = n_skipped = 0

    for ticker, grp in candles.groupby("market_ticker"):
        g = grp.sort_values("date").reset_index(drop=True)
        if len(g) < max(min_history, lead_days + 2):
            n_skipped += 1
            continue

        mkt = mkt_lookup.get(str(ticker), {})
        outcome = _outcome_from_result(mkt.get("result"))
        close_time = mkt.get("close_time")

        if outcome is not None:
            pred = _prediction_at_lead(
                g, lead_days, close_time,
                clear_hi=clear_hi, clear_lo=clear_lo, use_lock_zone=False,
            )
        else:
            last_date = pd.to_datetime(g["date"].iloc[-1])
            if (today - last_date).days < 3:
                n_skipped += 1
                continue
            probs = g["close_prob"].to_numpy(dtype=float)
            terminal = probs[-1]
            if terminal is None or math.isnan(terminal):
                n_skipped += 1
                continue
            if terminal >= clear_hi:
                outcome = 1
            elif terminal <= clear_lo:
                outcome = 0
            else:
                n_skipped += 1
                continue
            pred = _prediction_at_lead(
                g, lead_days, close_time,
                clear_hi=clear_hi, clear_lo=clear_lo, use_lock_zone=True,
            )

        if pred is None:
            n_skipped += 1
            continue
        if mkt.get("result") is not None and _outcome_from_result(mkt.get("result")) is not None:
            n_gold += 1
        else:
            n_inferred += 1
        preds.append(pred)
        outcomes.append(outcome)

    n = len(preds)
    if n == 0:
        return {
            "points": 0,
            "reliability": [],
            "brier": None,
            "log_loss": None,
            "outcome_gold": n_gold,
            "outcome_inferred": n_inferred,
            "outcome_skipped": n_skipped,
        }

    p = np.array(preds)
    y = np.array(outcomes)

    brier = float(np.mean((p - y) ** 2))
    log_loss = float(-np.mean(y * np.log(p) + (1 - y) * np.log(1 - p)))

    # Reliability bins
    edges = np.linspace(0, 1, bins + 1)
    reliability = []
    for i in range(bins):
        lo, hi = edges[i], edges[i + 1]
        mask = (p >= lo) & (p < hi) if i < bins - 1 else (p >= lo) & (p <= hi)
        cnt = int(mask.sum())
        if cnt == 0:
            continue
        reliability.append({
            "bin_lo": round(float(lo), 3),
            "bin_hi": round(float(hi), 3),
            "predicted": round(float(p[mask].mean()), 4),
            "actual": round(float(y[mask].mean()), 4),
            "count": cnt,
        })

    return {
        "points": n,
        "lead_days": lead_days,
        "brier": round(brier, 4),
        "log_loss": round(log_loss, 4),
        # Brier of a market that just quotes the base rate — the bar to beat.
        "base_rate": round(float(y.mean()), 4),
        "base_rate_brier": round(float(y.mean() * (1 - y.mean())), 4),
        "reliability": reliability,
        "outcome_gold": n_gold,
        "outcome_inferred": n_inferred,
        "outcome_skipped": n_skipped,
    }


@router.get("/calibration")
def calibration(
    lead_days: int = Query(7, ge=1, le=60),
    bins: int = Query(10, ge=4, le=20),
):
    return compute_calibration(lead_days=lead_days, bins=bins)


# ── Signals ─────────────────────────────────────────────────────────────────
@router.get("/signals")
def signals(limit: int = Query(40, ge=1, le=200)):
    return {"signals": compute_signals(limit=limit), "count": limit}


# ── Consolidated snapshot ─────────────────────────────────────────────────────
@router.get("/snapshot")
def snapshot(
    vol_window: int = Query(14, ge=2, le=60),
    vol_limit: int = Query(100, ge=1, le=1000),
    signal_limit: int = Query(40, ge=1, le=200),
):
    """One JSON pull: liquid markets, volatility ranking, signals, calibration."""
    vol = volatility_ranking(window=vol_window, limit=vol_limit, series=None)
    return {
        "generated_at": pd.Timestamp.utcnow().isoformat(),
        "volatility": vol,
        "signals": compute_signals(limit=signal_limit),
        "calibration": compute_calibration(),
    }


# ── CSV exports ───────────────────────────────────────────────────────────────
def _csv_response(df: pd.DataFrame, filename: str) -> Response:
    buf = io.StringIO()
    df.to_csv(buf, index=False)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.get("/markets.csv")
def markets_csv(limit: int = Query(2000, le=5000)):
    df = load_markets().copy().head(limit)
    df["implied_return"] = df["yes_ask"].apply(implied_return)
    cols = [
        "market_ticker", "series_ticker", "event_title", "market_title", "status",
        "yes_bid", "yes_ask", "spread", "last_price", "volume", "open_interest",
        "liquidity", "close_time", "implied_return",
    ]
    cols = [c for c in cols if c in df.columns]
    return _csv_response(df[cols], "macrowire_markets.csv")


@router.get("/volatility.csv")
def volatility_csv(
    window: int = Query(14, ge=2, le=60),
    limit: int = Query(1000, le=5000),
):
    data = volatility_ranking(window=window, limit=limit, series=None)
    df = pd.DataFrame(data.get("ranking", []))
    return _csv_response(df, f"macrowire_volatility_{window}d.csv")


@router.get("/signals.csv")
def signals_csv(limit: int = Query(100, ge=1, le=300)):
    rows = compute_signals(limit=limit)
    for r in rows:
        r["reasons"] = " | ".join(r.get("reasons", []))
    df = pd.DataFrame(rows)
    return _csv_response(df, "macrowire_signals.csv")
