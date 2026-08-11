"""
Fetch Kalshi markets across Politics, Economics, and World — macro series prioritized.
"""

from __future__ import annotations

import os
import re
import time
from datetime import datetime
from typing import Any
from zoneinfo import ZoneInfo

import httpx

from app.forexfactory import load_calendar

KALSHI_BASE = os.environ.get("KALSHI_API_BASE", "https://external-api.kalshi.com")
NY = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")

SHELF_CATEGORIES = ["Economics", "Politics", "World"]
DEFAULT_DAYS = int(os.environ.get("KALSHI_HISTORY_DAYS", "120"))
MAX_MARKETS = int(os.environ.get("KALSHI_MAX_MARKETS", "48"))
CHART_MARKETS = int(os.environ.get("KALSHI_CHART_MARKETS", "16"))
SERIES_PER_SHELF = int(os.environ.get("KALSHI_SERIES_PER_SHELF", "80"))
MARKETS_PER_SERIES = int(os.environ.get("KALSHI_MARKETS_PER_SERIES", "6"))

# High-priority macro series (always fetched first)
PRIORITY_MACRO_SERIES = [
    "KXECONSTATCPI",
    "KXCPI",
    "KXCPICORE",
    "KXFED",
    "KXFOMC",
    "KXGDP",
    "KXGDPCN",
    "KXUNRATE",
    "KXJOBLESS",
    "KXNONFARM",
    "KXPCE",
    "KXIPMOM",
    "KX3MTBILL",
    "KX10YEAR",
    "KXRECESSION",
    "KXINFLATION",
]

MACRO_KEYWORDS: list[tuple[str, int]] = [
    (r"\bcpi\b", 40),
    (r"\bgdp\b", 38),
    (r"\bfed\b|\bfomc\b|\bfederal funds\b|\brate decision\b", 36),
    (r"\bnfp\b|\bnon-?farm\b|\bpayroll\b|\bjobless\b|\bunemployment\b", 34),
    (r"\binflation\b|\bpce\b|\bcore pce\b", 32),
    (r"\brecession\b|\bip\b|\bpmi\b|\bretail sales\b", 28),
    (r"\btreasury\b|\byield\b|\b10-?year\b|\b3m\b", 22),
    (r"\btrade\b|\btariff\b|\bdebt ceiling\b", 14),
    (r"\belection\b|\bpresident\b|\bcongress\b|\bsenate\b", 12),
    (r"\bwar\b|\bukraine\b|\bgaza\b|\bchina\b|\btaiwan\b", 10),
]


def _fp(v: str | float | None) -> float | None:
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def kalshi_get(path: str, params: dict[str, Any] | None = None) -> Any:
    with httpx.Client(base_url=KALSHI_BASE, timeout=45.0) as client:
        r = client.get(path, params=params or {})
        r.raise_for_status()
        return r.json()


def macro_score_text(text: str) -> int:
    t = (text or "").lower()
    score = 0
    for pattern, weight in MACRO_KEYWORDS:
        if re.search(pattern, t):
            score += weight
    return score


def infer_series_ticker(market_ticker: str, event_ticker: str | None = None) -> str:
    if event_ticker:
        parts = event_ticker.split("-")
        if len(parts) >= 2:
            return parts[0]
    parts = (market_ticker or "").split("-")
    return parts[0] if parts else market_ticker


def fetch_series_for_shelf(category: str, limit: int) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    cursor: str | None = None
    while len(out) < limit:
        params: dict[str, Any] = {"category": category, "limit": min(200, limit - len(out))}
        if cursor:
            params["cursor"] = cursor
        data = kalshi_get("/trade-api/v2/series", params)
        batch = data.get("series") or []
        if not batch:
            break
        for s in batch:
            s["_shelf"] = category
        out.extend(batch)
        cursor = data.get("cursor") or ""
        if not cursor:
            break
    return out


def fetch_markets_for_series(series_ticker: str, cap: int) -> list[dict[str, Any]]:
    markets: list[dict[str, Any]] = []
    cursor: str | None = None
    for status in ("open", "closed"):
        while len(markets) < cap:
            params: dict[str, Any] = {
                "series_ticker": series_ticker,
                "status": status,
                "limit": min(100, cap - len(markets)),
            }
            if cursor:
                params["cursor"] = cursor
            data = kalshi_get("/trade-api/v2/markets", params)
            batch = data.get("markets") or []
            markets.extend(batch)
            cursor = data.get("cursor") or ""
            if not cursor or not batch:
                break
        if len(markets) >= cap:
            break
    return markets[:cap]


def market_prob_and_quotes(m: dict[str, Any]) -> tuple[float, float | None, float | None]:
    bid = _fp(m.get("yes_bid_dollars") or m.get("yes_bid"))
    ask = _fp(m.get("yes_ask_dollars") or m.get("yes_ask"))
    if bid is not None and bid > 1:
        bid /= 100
    if ask is not None and ask > 1:
        ask /= 100
    last = _fp(m.get("last_price_dollars") or m.get("last_price"))
    if last is not None and last > 1:
        last /= 100
    prob = last
    if prob is None and bid is not None and ask is not None:
        prob = (bid + ask) / 2
    prob = prob if prob is not None else 0.5
    return max(0.0, min(1.0, prob)), bid, ask


def score_market(m: dict[str, Any], shelf: str, series_ticker: str) -> int:
    title = m.get("title") or ""
    ticker = m.get("ticker") or ""
    text = f"{series_ticker} {ticker} {title} {m.get('rules_primary') or ''}"
    score = macro_score_text(text)
    if series_ticker in PRIORITY_MACRO_SERIES:
        score += 50
    if shelf == "Economics":
        score += 8
    vol = int(m.get("volume") or m.get("volume_24h") or m.get("liquidity") or 0)
    score += min(20, vol // 5000)
    return score


def fetch_candlesticks(
    series_ticker: str,
    market_ticker: str,
    start_ts: int,
    end_ts: int,
    period: int = 1440,
) -> list[dict[str, Any]]:
    path = f"/trade-api/v2/series/{series_ticker}/markets/{market_ticker}/candlesticks"
    data = kalshi_get(
        path,
        {"start_ts": start_ts, "end_ts": end_ts, "period_interval": period},
    )
    return data.get("candlesticks") or []


def candle_to_point(c: dict[str, Any], market_id: str) -> dict[str, Any] | None:
    price = c.get("price") or {}
    end_ts = int(c.get("end_period_ts", 0))
    cl = _fp(price.get("close_dollars"))
    mean = _fp(price.get("mean_dollars"))
    prob = cl if cl is not None else mean
    if prob is None:
        yes_bid = c.get("yes_bid") or {}
        yes_ask = c.get("yes_ask") or {}
        bid = _fp(yes_bid.get("close_dollars") if isinstance(yes_bid, dict) else yes_bid)
        ask = _fp(yes_ask.get("close_dollars") if isinstance(yes_ask, dict) else yes_ask)
        if bid is not None and ask is not None:
            prob = (bid + ask) / 2
    if prob is None:
        return None
    dt_ny = datetime.fromtimestamp(end_ts, tz=UTC).astimezone(NY)
    vol_raw = c.get("volume_fp") or "0"
    try:
        volume = int(float(vol_raw))
    except ValueError:
        volume = 0
    bid = _fp((c.get("yes_bid") or {}).get("close_dollars") if isinstance(c.get("yes_bid"), dict) else None)
    ask = _fp((c.get("yes_ask") or {}).get("close_dollars") if isinstance(c.get("yes_ask"), dict) else None)
    spread_pp = (ask - bid) * 100 if bid is not None and ask is not None else None
    return {
        "marketId": market_id,
        "date": dt_ny.date().isoformat(),
        "prob": max(0.0, min(1.0, prob)),
        "bid": bid,
        "ask": ask,
        "spread": spread_pp,
        "volume": volume,
    }


def build_series_for_market(series_ticker: str, m: dict[str, Any], days: int) -> list[dict[str, Any]]:
    ticker = m["ticker"]
    end_ts = int(time.time())
    start_ts = end_ts - days * 86400
    sticks = fetch_candlesticks(series_ticker, ticker, start_ts, end_ts, 1440)
    points: list[dict[str, Any]] = []
    for c in sticks:
        row = candle_to_point(c, ticker)
        if row:
            points.append(row)
    if not points:
        short = end_ts - 14 * 86400
        sticks = fetch_candlesticks(series_ticker, ticker, short, end_ts, 60)
        for c in sticks:
            row = candle_to_point(c, ticker)
            if row:
                points.append(row)
    first_trade = next((i for i, p in enumerate(points) if p.get("volume", 0) > 0), 0)
    if first_trade > 0:
        points = points[first_trade:]
    return points


def discover_series_tickers() -> list[tuple[str, str, int]]:
    """(series_ticker, shelf, macro_score) ranked."""
    seen: set[str] = set()
    ranked: list[tuple[str, str, int]] = []

    for st in PRIORITY_MACRO_SERIES:
        if st not in seen:
            seen.add(st)
            ranked.append((st, "Economics", 1000 + macro_score_text(st)))

    for shelf in SHELF_CATEGORIES:
        series_list = fetch_series_for_shelf(shelf, SERIES_PER_SHELF)
        scored = []
        for s in series_list:
            st = s.get("ticker")
            if not st or st in seen:
                continue
            title = s.get("title") or st
            sc = macro_score_text(f"{st} {title}")
            if shelf == "Economics":
                sc += 5
            scored.append((st, shelf, sc))
        scored.sort(key=lambda x: -x[2])
        for item in scored[: max(12, SERIES_PER_SHELF // 4)]:
            seen.add(item[0])
            ranked.append(item)

    ranked.sort(key=lambda x: -x[2])
    return ranked


def fetch_events_for_shelf(category: str, limit: int = 36) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    cursor: str | None = None
    while len(events) < limit:
        params: dict[str, Any] = {
            "category": category,
            "status": "open",
            "limit": min(100, limit - len(events)),
        }
        if cursor:
            params["cursor"] = cursor
        data = kalshi_get("/trade-api/v2/events", params)
        batch = data.get("events") or []
        events.extend(batch)
        cursor = data.get("cursor") or ""
        if not cursor or not batch:
            break
    events.sort(
        key=lambda e: -macro_score_text(
            f"{e.get('series_ticker', '')} {e.get('title', '')} {e.get('sub_title', '')}"
        )
    )
    return events


def fetch_markets_for_event(event_ticker: str, cap: int = 12) -> list[dict[str, Any]]:
    data = kalshi_get(
        "/trade-api/v2/markets",
        {"event_ticker": event_ticker, "limit": min(100, cap)},
    )
    return (data.get("markets") or [])[:cap]


def _upsert_market(
    by_ticker: dict[str, dict[str, Any]],
    m: dict[str, Any],
    shelf: str,
    series_ticker: str,
    series_score: int = 0,
) -> None:
    t = m.get("ticker")
    if not t:
        return
    m_rank = score_market(m, shelf, series_ticker)
    rank = m_rank + series_score // 10
    entry = {
        **m,
        "_series_ticker": series_ticker,
        "_shelf": shelf,
        "_macro_rank": rank,
        "_is_macro": rank >= 35 or series_ticker in PRIORITY_MACRO_SERIES,
    }
    prev = by_ticker.get(t)
    if prev is None or entry["_macro_rank"] > prev["_macro_rank"]:
        by_ticker[t] = entry


def collect_markets(ranked_series: list[tuple[str, str, int]]) -> list[dict[str, Any]]:
    """Gather markets with shelf + macroRank metadata."""
    by_ticker: dict[str, dict[str, Any]] = {}
    per_shelf_cap = max(12, MAX_MARKETS // len(SHELF_CATEGORIES))

    for series_ticker, shelf, series_score in ranked_series:
        try:
            raw = fetch_markets_for_series(series_ticker, MARKETS_PER_SERIES)
        except httpx.HTTPError:
            continue
        for m in raw:
            st = infer_series_ticker(m.get("ticker", ""), m.get("event_ticker"))
            _upsert_market(by_ticker, m, shelf, st, series_score)

    for shelf in SHELF_CATEGORIES:
        shelf_count = sum(1 for m in by_ticker.values() if m.get("_shelf") == shelf)
        if shelf_count >= per_shelf_cap:
            continue
        try:
            events = fetch_events_for_shelf(shelf, limit=28)
        except httpx.HTTPError:
            continue
        for ev in events:
            if sum(1 for m in by_ticker.values() if m.get("_shelf") == shelf) >= per_shelf_cap:
                break
            et = ev.get("event_ticker")
            st = ev.get("series_ticker") or infer_series_ticker("", et)
            ev_score = macro_score_text(f"{st} {ev.get('title', '')}")
            try:
                mkts = fetch_markets_for_event(et, MARKETS_PER_SERIES)
            except httpx.HTTPError:
                continue
            for m in mkts:
                _upsert_market(by_ticker, m, shelf, st, ev_score)

    by_shelf: dict[str, list[dict[str, Any]]] = {s: [] for s in SHELF_CATEGORIES}
    for m in by_ticker.values():
        by_shelf[m.get("_shelf") or "Economics"].append(m)

    def sort_key(x: dict[str, Any]) -> tuple:
        return (
            -int(x.get("_is_macro", False)),
            -x["_macro_rank"],
            -(int(x.get("volume") or x.get("volume_24h") or 0)),
        )

    for shelf in SHELF_CATEGORIES:
        by_shelf[shelf].sort(key=sort_key)

    per_shelf = max(8, MAX_MARKETS // len(SHELF_CATEGORIES))
    out: list[dict[str, Any]] = []
    seen: set[str] = set()
    for shelf in SHELF_CATEGORIES:
        for m in by_shelf[shelf][:per_shelf]:
            t = m.get("ticker")
            if t and t not in seen:
                seen.add(t)
                out.append(m)

    pool: list[dict[str, Any]] = []
    for shelf in SHELF_CATEGORIES:
        for m in by_shelf[shelf][per_shelf:]:
            t = m.get("ticker")
            if t and t not in seen:
                pool.append(m)
    pool.sort(key=sort_key)
    for m in pool:
        if len(out) >= MAX_MARKETS:
            break
        t = m.get("ticker")
        if t and t not in seen:
            seen.add(t)
            out.append(m)

    return out[:MAX_MARKETS]


def market_to_json(m: dict[str, Any]) -> dict[str, Any]:
    ticker = m["ticker"]
    prob, bid, ask = market_prob_and_quotes(m)
    spread_pp = (ask - bid) * 100 if bid is not None and ask is not None else None
    vol = int(m.get("volume") or m.get("volume_24h") or 0)
    shelf = m.get("_shelf") or "Economics"
    return {
        "marketId": ticker,
        "ticker": ticker,
        "label": m.get("title") or ticker,
        "category": shelf,
        "shelf": shelf,
        "seriesTicker": m.get("_series_ticker") or infer_series_ticker(ticker, m.get("event_ticker")),
        "macroRank": m.get("_macro_rank", 0),
        "isMacro": bool(m.get("_is_macro")),
        "description": m.get("rules_primary") or m.get("subtitle") or "",
        "resolution": m.get("close_time") or m.get("expiration_time") or "",
        "prob": prob,
        "bid": bid,
        "ask": ask,
        "spread": spread_pp,
        "volume": vol,
    }


def fetch_chart_series(markets: list[dict[str, Any]], days: int | None = None) -> list[dict[str, Any]]:
    """Fetch candlestick history for a small chart set (used with Parquet market snapshots)."""
    history_days = days or DEFAULT_DAYS
    series_points: list[dict[str, Any]] = []
    for m in markets[:CHART_MARKETS]:
        ticker = m.get("ticker") or m.get("marketId")
        if not ticker:
            continue
        series_ticker = m.get("seriesTicker") or infer_series_ticker(ticker, m.get("event_ticker"))
        try:
            series_points.extend(
                build_series_for_market(series_ticker, {"ticker": ticker}, history_days)
            )
        except httpx.HTTPError:
            continue
    return series_points


def fetch_live_bundle(series_ticker: str | None = None, days: int | None = None) -> dict[str, Any]:
    """Multi-shelf Kalshi bundle + ForexFactory calendar."""
    history_days = days or DEFAULT_DAYS

    if series_ticker:
        ranked = [(series_ticker, "Economics", 999)]
    else:
        ranked = discover_series_tickers()

    raw_markets = collect_markets(ranked)
    if not raw_markets:
        raise RuntimeError("No markets returned from Kalshi")

    markets_out = [market_to_json(m) for m in raw_markets]
    chart_ids = {m["ticker"] for m in markets_out[:CHART_MARKETS]}

    series_points: list[dict[str, Any]] = []
    lookup = {m["ticker"]: m for m in raw_markets}
    for ticker in chart_ids:
        m = lookup.get(ticker)
        if not m:
            continue
        st = m.get("_series_ticker") or infer_series_ticker(ticker, m.get("event_ticker"))
        try:
            series_points.extend(build_series_for_market(st, m, history_days))
        except httpx.HTTPError:
            continue

    calendar_events = load_calendar()

    shelves = {s: sum(1 for m in markets_out if m["shelf"] == s) for s in SHELF_CATEGORIES}
    macro_count = sum(1 for m in markets_out if m["isMacro"])

    return {
        "markets": markets_out,
        "series_points": series_points,
        "calendar_events": calendar_events,
        "source": "kalshi_live",
        "series_ticker": series_ticker or "multi",
        "shelves": shelves,
        "macro_markets": macro_count,
        "fetched_at": datetime.now(tz=UTC).isoformat(),
    }
