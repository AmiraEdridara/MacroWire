"""Auto-generated event briefs and morning digests."""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

import pandas as pd

from app.econprob_api import SERIES_BY_EVENT, load_candles, load_events, load_markets


def _num(v: Any) -> float | None:
    if v is None:
        return None
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    f = float(v)
    if f != f:
        return None
    return f


def _sanitize_market_val(v: Any) -> Any:
    if isinstance(v, (int, float)):
        return _num(v)
    try:
        if pd.isna(v):
            return None
    except (TypeError, ValueError):
        pass
    if hasattr(v, "isoformat"):
        return str(v)[:10]
    return v


def _fmt_pct(prob: float | None) -> str:
    if prob is None or (isinstance(prob, float) and pd.isna(prob)):
        return "—"
    return f"{float(prob) * 100:.1f}%"


def _related_markets(event_name: str, limit: int = 6) -> pd.DataFrame:
    markets = load_markets()
    if markets.empty:
        return markets
    prefixes: list[str] = []
    name_upper = (event_name or "").upper()
    for key, pfxs in SERIES_BY_EVENT.items():
        if key.upper() in name_upper:
            prefixes.extend(pfxs)
    if not prefixes:
        return markets.head(limit)
    mask = pd.Series(False, index=markets.index)
    for pfx in prefixes:
        mask |= markets["series_ticker"].astype(str).str.startswith(pfx, na=False)
    hit = markets[mask].sort_values("volume", ascending=False).head(limit)
    return hit if not hit.empty else markets.sort_values("volume", ascending=False).head(limit)


def _market_moves(ticker: str, days: int = 7) -> dict[str, Any]:
    df = load_candles()
    sub = df[df["market_ticker"] == ticker].sort_values("date").tail(days + 1)
    if len(sub) < 2:
        return {"ticker": ticker, "delta_pp": None, "vol_pp": None, "latest_prob": None}
    sub = sub.reset_index(drop=True)
    latest = sub.iloc[-1]
    prev = sub.iloc[-2]
    delta = float(latest["close_prob"]) - float(prev["close_prob"])
    deltas = sub["close_prob"].diff().dropna()
    vol = float(deltas.std()) if len(deltas) > 1 else 0.0
    week_ago = sub.iloc[0]
    week_delta = float(latest["close_prob"]) - float(week_ago["close_prob"])
    lp = _num(latest["close_prob"])
    return {
        "ticker": ticker,
        "latest_prob": lp,
        "delta_pp": round(delta * 100, 1) if lp is not None else None,
        "week_delta_pp": round(week_delta * 100, 1) if lp is not None else None,
        "vol_pp": round(vol * 100, 2),
        "volume": int(_num(latest.get("volume")) or 0),
    }


def _upcoming_events(days_forward: int = 14) -> list[dict[str, Any]]:
    from app.econprob_api import _parse_ff_date, _series_key

    df = load_events()
    if df.empty:
        return []
    today = date.today()
    out = []
    for _, row in df.iterrows():
        row_dict = row.to_dict()
        if str(row_dict.get("impact", "")).lower() != "high":
            continue
        if str(row_dict.get("currency", "USD")).upper() != "USD":
            continue
        date_iso = _parse_ff_date(
            str(row_dict.get("date_text") or ""),
            str(row_dict.get("time_text") or ""),
            str(row_dict.get("week") or ""),
        )
        if not date_iso:
            continue
        ev_date = datetime.fromisoformat(date_iso).date()
        if ev_date < today or (ev_date - today).days > days_forward:
            continue
        out.append({
            "event_name": str(row_dict.get("event_name") or ""),
            "date": date_iso,
            "time": str(row_dict.get("time_text") or "08:30"),
            "forecast": str(row_dict.get("forecast") or ""),
            "previous": str(row_dict.get("previous") or ""),
            "series": _series_key(str(row_dict.get("event_name") or "")),
            "days_away": (ev_date - today).days,
        })
    out.sort(key=lambda e: e["date"])
    return out


def build_event_brief(event_date: str | None = None, series: str | None = None) -> dict[str, Any]:
    """Pre-release brief for the next (or specified) macro event."""
    events = _upcoming_events(days_forward=30)
    if not events:
        return {"title": "No upcoming events", "sections": [], "generated_at": datetime.utcnow().isoformat()}

    target = None
    if event_date:
        target = next((e for e in events if e["date"] == event_date), None)
    if not target and series:
        target = next((e for e in events if e["series"] == series), None)
    if not target:
        target = events[0]

    related = _related_markets(target["event_name"])
    market_snapshots = []
    for _, row in related.iterrows():
        snap = _market_moves(str(row["market_ticker"]))
        snap["label"] = str(row.get("market_title") or row.get("event_title") or row["market_ticker"])
        snap["event_title"] = str(row.get("event_title") or "")
        market_snapshots.append(snap)

    movers = sorted(
        [m for m in market_snapshots if m.get("week_delta_pp") is not None],
        key=lambda x: abs(x["week_delta_pp"]),
        reverse=True,
    )[:4]

    headline = f"Pre-{target['event_name']} brief"
    days = target["days_away"]
    when = "today" if days == 0 else ("tomorrow" if days == 1 else f"in {days} days")

    paragraphs = [
        f"{target['event_name']} prints {when} ({target['date']} {target['time']} ET). "
        f"Consensus: {target['forecast'] or 'n/a'} · Prior: {target['previous'] or 'n/a'}.",
    ]

    if movers:
        move_lines = []
        for m in movers:
            sign = "+" if m["week_delta_pp"] >= 0 else ""
            move_lines.append(
                f"{m['label']} now {_fmt_pct(m['latest_prob'])} ({sign}{m['week_delta_pp']:.1f}pp over 7d)"
            )
        paragraphs.append("Related Kalshi contracts repriced this week: " + "; ".join(move_lines) + ".")
    else:
        paragraphs.append("Related Kalshi contracts show limited recent movement in the run-up.")

    avg_vol = sum(m.get("vol_pp") or 0 for m in market_snapshots) / max(len(market_snapshots), 1)
    if avg_vol >= 2.5:
        paragraphs.append(
            f"Implied-probability volatility is elevated (~{avg_vol:.1f}pp daily std). "
            "Markets are actively repricing ahead of the release."
        )
    elif avg_vol > 0:
        paragraphs.append(
            f"Daily volatility is moderate (~{avg_vol:.1f}pp). Positioning may still shift closer to the print."
        )

    paragraphs.append(
        "MacroWire signal: watch for spread widening and volume spikes in the 48h window before the release."
    )

    return {
        "title": headline,
        "event": target,
        "markets": market_snapshots,
        "movers": movers,
        "paragraphs": paragraphs,
        "generated_at": datetime.utcnow().isoformat(),
    }


def build_market_brief(ticker: str) -> dict[str, Any]:
    markets = load_markets()
    row = markets[markets["market_ticker"] == ticker]
    if row.empty:
        return {"title": f"Unknown market {ticker}", "paragraphs": [], "generated_at": datetime.utcnow().isoformat()}

    m = row.iloc[0].to_dict()
    moves = _market_moves(ticker, days=14)
    label = str(m.get("market_title") or m.get("event_title") or ticker)

    paragraphs = [
        f"{label} ({ticker}) trades at {_fmt_pct(moves['latest_prob'])} YES.",
    ]
    if moves.get("delta_pp") is not None:
        sign = "+" if moves["delta_pp"] >= 0 else ""
        paragraphs.append(f"Last session: {sign}{moves['delta_pp']:.1f}pp. 7-day change: {moves.get('week_delta_pp', 0):+.1f}pp.")
    if moves.get("vol_pp"):
        paragraphs.append(f"14-day daily vol: {moves['vol_pp']:.2f}pp.")

    events = _upcoming_events(days_forward=21)
    series = str(m.get("series_ticker") or "")
    near = [e for e in events if any(series.startswith(p) for p in sum(SERIES_BY_EVENT.values(), []))]
    if near:
        e = near[0]
        paragraphs.append(
            f"Next macro catalyst: {e['event_name']} in {e['days_away']}d ({e['date']})."
        )

    return {
        "title": f"Market brief — {label}",
        "ticker": ticker,
        "market": {k: _sanitize_market_val(v) for k, v in m.items()},
        "moves": moves,
        "paragraphs": paragraphs,
        "generated_at": datetime.utcnow().isoformat(),
    }


def build_morning_digest(watchlist: list[str] | None = None) -> dict[str, Any]:
    """Daily digest: calendar + top moves + watchlist."""
    from app.signals import compute_signals

    events = _upcoming_events(days_forward=7)
    signals = compute_signals(limit=8, tickers=watchlist or None)

    markets = load_markets()
    top = markets.sort_values("volume", ascending=False).head(12)
    moves = []
    for _, row in top.iterrows():
        snap = _market_moves(str(row["market_ticker"]))
        if snap.get("delta_pp") is not None and abs(snap["delta_pp"]) >= 2:
            snap["label"] = str(row.get("market_title") or row["market_ticker"])
            moves.append(snap)
    moves.sort(key=lambda x: abs(x["delta_pp"]), reverse=True)

    watchlist_moves = []
    if watchlist:
        for t in watchlist[:20]:
            snap = _market_moves(t)
            if snap.get("latest_prob") is not None:
                mrow = markets[markets["market_ticker"] == t]
                snap["label"] = str(mrow.iloc[0]["market_title"]) if not mrow.empty else t
                watchlist_moves.append(snap)

    today_str = date.today().strftime("%A, %d %B %Y")
    paragraphs = [f"MacroWire morning digest — {today_str}."]

    if events:
        e = events[0]
        paragraphs.append(
            f"Next release: {e['event_name']} ({e['days_away']}d) — est {e['forecast'] or 'n/a'}, prev {e['previous'] or 'n/a'}."
        )

    if moves:
        lines = [f"{m['label']} {m['delta_pp']:+.1f}pp" for m in moves[:5]]
        paragraphs.append("Overnight movers: " + ", ".join(lines) + ".")

    if signals:
        top_sig = signals[0]
        paragraphs.append(
            f"Top MacroWire signal: {top_sig['label']} — {top_sig['signal_type']} (score {top_sig['score']:.0f})."
        )

    if watchlist_moves:
        wl = [f"{m['label']} at {_fmt_pct(m['latest_prob'])}" for m in watchlist_moves[:5]]
        paragraphs.append("Your watchlist: " + "; ".join(wl) + ".")

    return {
        "title": f"Morning digest — {today_str}",
        "events": events[:5],
        "movers": moves[:8],
        "signals": signals[:5],
        "watchlist": watchlist_moves,
        "paragraphs": paragraphs,
        "generated_at": datetime.utcnow().isoformat(),
    }
