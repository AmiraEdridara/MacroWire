"""MacroWire composite signals — ranked overlays on Kalshi data."""

from __future__ import annotations

from datetime import datetime
from typing import Any

import pandas as pd

from app.econprob_api import load_candles, load_markets


def _num(v) -> float | None:
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    f = float(v)
    return None if f != f else f


def _regime(close_probs: pd.Series) -> str:
    if len(close_probs) < 4:
        return "neutral"
    smooth = close_probs.rolling(3, min_periods=1).mean()
    delta = float(smooth.iloc[-1]) - float(smooth.iloc[-4])
    if delta >= 0.03:
        return "bull"
    if delta <= -0.03:
        return "bear"
    return "neutral"


def _signal_for_ticker(ticker: str, market_row: dict | None) -> dict[str, Any] | None:
    df = load_candles()
    sub = df[df["market_ticker"] == ticker].sort_values("date")
    if len(sub) < 5:
        return None

    sub = sub.tail(30).reset_index(drop=True)
    latest = sub.iloc[-1]
    prev = sub.iloc[-2]

    deltas = sub["close_prob"].diff().dropna()
    vol = float(deltas.std()) if len(deltas) > 2 else 0.01
    last_delta = float(latest["close_prob"]) - float(prev["close_prob"])
    z_move = last_delta / vol if vol > 0 else 0.0

    week_delta = float(latest["close_prob"]) - float(sub.iloc[max(0, len(sub) - 6)]["close_prob"])
    spread = _num(latest.get("spread")) or 0.0
    spread_prev = _num(sub.iloc[-6].get("spread")) if len(sub) >= 6 else spread
    spread_prev = spread_prev if spread_prev is not None else spread
    vol_ratio = float(_num(latest.get("volume")) or 0) / max(float(sub["volume"].mean()), 1)

    regime_now = _regime(sub["close_prob"])
    regime_prev = _regime(sub["close_prob"].iloc[:-1]) if len(sub) > 5 else regime_now

    score = 0.0
    reasons: list[str] = []
    signal_type = "NEUTRAL"

    if abs(z_move) >= 1.5:
        score += min(abs(z_move) * 18, 45)
        signal_type = "MOVE_SPIKE"
        reasons.append(f"Unusual {last_delta * 100:+.1f}pp move (z={z_move:.1f})")

    if vol >= 0.025:
        score += 20
        if signal_type == "NEUTRAL":
            signal_type = "VOL_ELEVATED"
        reasons.append(f"Elevated vol ({vol * 100:.1f}pp daily std)")

    if abs(week_delta) >= 0.05:
        score += min(abs(week_delta) * 200, 25)
        if signal_type == "NEUTRAL":
            signal_type = "PRE_RELEASE_DRIFT" if week_delta > 0 else "DRIFT_DOWN"
        reasons.append(f"7d drift {week_delta * 100:+.1f}pp")

    if spread > spread_prev * 1.3 and spread > 0.02:
        score += 15
        if signal_type == "NEUTRAL":
            signal_type = "LIQUIDITY_SQUEEZE"
        reasons.append("Spread widening vs recent average")

    if vol_ratio >= 1.8:
        score += 12
        reasons.append(f"Volume {vol_ratio:.1f}× recent average")

    if regime_now != regime_prev and regime_now != "neutral":
        score += 18
        signal_type = "REGIME_FLIP"
        reasons.append(f"Regime shift → {regime_now.upper()}")

    if score < 15:
        return None

    label = str(market_row.get("market_title") or market_row.get("event_title") or ticker) if market_row else ticker

    return {
        "ticker": ticker,
        "label": label,
        "event_title": market_row.get("event_title") if market_row else "",
        "signal_type": signal_type,
        "score": round(min(score, 100), 1),
        "regime": regime_now,
        "latest_prob": round(_num(latest["close_prob"]) or 0, 4),
        "delta_pp": round(last_delta * 100, 1),
        "week_delta_pp": round(week_delta * 100, 1),
        "vol_pp": round(vol * 100, 2),
        "reasons": reasons,
        "generated_at": datetime.utcnow().isoformat(),
    }


def compute_signals(limit: int = 20, tickers: list[str] | None = None) -> list[dict[str, Any]]:
    markets = load_markets()
    if markets.empty:
        return []

    if tickers:
        subset = markets[markets["market_ticker"].isin(tickers)]
    else:
        subset = markets.sort_values("volume", ascending=False).head(80)

    lookup = subset.drop_duplicates("market_ticker").set_index("market_ticker")
    out: list[dict[str, Any]] = []
    for ticker in lookup.index:
        row = lookup.loc[ticker].to_dict() if ticker in lookup.index else None
        sig = _signal_for_ticker(str(ticker), row)
        if sig:
            out.append(sig)

    out.sort(key=lambda x: x["score"], reverse=True)
    return out[:limit]
