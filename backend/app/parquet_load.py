"""
Load Kalshi markets and ForexFactory calendar from Parquet snapshots.
"""

from __future__ import annotations

import os
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import pyarrow.parquet as pq

from app.forexfactory import classify_event
from app.kalshi_fetch import (
    CHART_MARKETS,
    MAX_MARKETS,
    PRIORITY_MACRO_SERIES,
    SHELF_CATEGORIES,
    macro_score_text,
)
from app.duckdb_load import use_duckdb, read_table_rows, query_df, table_stats as duckdb_table_stats
from app.duckdb_load import TABLE_MARKETS, TABLE_CANDLES, TABLE_NEWS, duckdb_path

NY = ZoneInfo("America/New_York")

DATA_FILES_DIR = Path.home() / "files"
DEFAULT_KALSHI_PARQUET = DATA_FILES_DIR / "kalshi_markets.parquet"
DEFAULT_FF_PARQUET = DATA_FILES_DIR / "forexfactory_events.parquet"
DEFAULT_CANDLES_PARQUET = DATA_FILES_DIR / "kalshi_candlesticks.parquet"
DEFAULT_FINNHUB_NEWS_PARQUET = DATA_FILES_DIR / "finnhub_news.parquet"

KALSHI_PARQUET = Path(
    os.environ.get("KALSHI_PARQUET", str(DEFAULT_KALSHI_PARQUET))
).expanduser()
FF_PARQUET = Path(os.environ.get("FF_PARQUET", str(DEFAULT_FF_PARQUET))).expanduser()
CANDLES_PARQUET = Path(
    os.environ.get("KALSHI_CANDLESTICKS_PARQUET", str(DEFAULT_CANDLES_PARQUET))
).expanduser()
FINNHUB_NEWS_PARQUET = Path(
    os.environ.get("FINNHUB_NEWS_PARQUET", str(DEFAULT_FINNHUB_NEWS_PARQUET))
).expanduser()

# 0 = include every market in the parquet file (all series). Set e.g. 48 to cap.
_max_raw = os.environ.get("KALSHI_MAX_MARKETS", "0").strip()
PARQUET_MAX_MARKETS = int(_max_raw) if _max_raw.isdigit() else MAX_MARKETS
_corr_raw = os.environ.get("CORRELATION_PEER_LIMIT", "12").strip()
CORRELATION_PEER_LIMIT = int(_corr_raw) if _corr_raw.isdigit() else 12


def _fp(v: Any) -> float | None:
    if v is None or v == "":
        return None
    try:
        n = float(v)
    except (TypeError, ValueError):
        return None
    if n != n:  # NaN
        return None
    return n


def _week_year(week: str) -> int | None:
    if not week or "." not in week:
        return None
    try:
        return int(week.rsplit(".", 1)[-1])
    except ValueError:
        return None


def _parse_ff_date(date_text: str, time_text: str, week: str) -> str | None:
    year = _week_year(week)
    if year is None:
        return None
    clean = (date_text or "").replace("\n", " ").strip()
    if not clean:
        return None
    try:
        day = datetime.strptime(f"{clean} {year}", "%a %b %d %Y")
    except ValueError:
        return None
    time_s = (time_text or "").strip()
    if time_s and time_s.lower() != "all day":
        try:
            t = datetime.strptime(time_s, "%I:%M%p")
            day = day.replace(hour=t.hour, minute=t.minute)
        except ValueError:
            pass
    return day.replace(tzinfo=NY).date().isoformat()


def _impact_label(impact: str) -> str:
    value = (impact or "").strip().lower()
    if value == "high":
        return "High"
    if value == "medium":
        return "Medium"
    if value == "non-economic":
        return "Non-Economic"
    return impact or "Medium"


def load_ff_parquet(path: Path | None = None) -> list[dict[str, Any]]:
    parquet_path = path or FF_PARQUET
    if not parquet_path.is_file():
        raise FileNotFoundError(f"ForexFactory parquet not found: {parquet_path}")

    table = pq.read_table(parquet_path)
    rows = table.to_pylist()
    out: list[dict[str, Any]] = []

    for row in rows:
        impact = (row.get("impact") or "").strip().lower()
        if impact != "high":
            continue
        title = (row.get("event_name") or "").strip()
        ny_date_iso = _parse_ff_date(
            row.get("date_text") or "",
            row.get("time_text") or "",
            row.get("week") or "",
        )
        if not title or not ny_date_iso:
            continue
        etype = classify_event(title)
        short = title.split("(")[0].strip()[:48]
        out.append(
            {
                "date": ny_date_iso,
                "label": short,
                "type": etype,
                "detail": title,
                "impact": _impact_label(impact),
                "title": title,
                "is_fed": etype == "fed",
                "is_macro": etype in ("fed", "cpi", "gdp", "jobs", "macro"),
            }
        )

    out.sort(key=lambda e: (e["date"], e["label"]))
    return out


def _score_parquet_market(row: dict[str, Any]) -> tuple[int, bool]:
    series_ticker = row.get("series_ticker") or ""
    market_ticker = row.get("market_ticker") or ""
    title = row.get("market_title") or ""
    shelf = (row.get("category") or "economics").title()
    text = f"{series_ticker} {market_ticker} {title}"
    score = macro_score_text(text)
    if series_ticker in PRIORITY_MACRO_SERIES:
        score += 50
    if shelf == "Economics":
        score += 8
    vol = int(row.get("volume") or 0)
    score += min(20, vol // 5000)
    is_macro = score >= 35 or series_ticker in PRIORITY_MACRO_SERIES
    return score, is_macro


def _parquet_row_to_market(row: dict[str, Any], macro_rank: int, is_macro: bool) -> dict[str, Any]:
    ticker = row.get("market_ticker") or ""
    bid = _fp(row.get("yes_bid"))
    ask = _fp(row.get("yes_ask"))
    last = _fp(row.get("last_price"))
    prob = last
    if prob is None and bid is not None and ask is not None:
        prob = (bid + ask) / 2
    prob = max(0.0, min(1.0, prob if prob is not None else 0.5))

    spread_raw = _fp(row.get("spread"))
    spread_pp = spread_raw * 100 if spread_raw is not None else None
    if spread_pp is None and bid is not None and ask is not None:
        spread_pp = (ask - bid) * 100

    shelf = (row.get("category") or "economics").title()
    close_time = row.get("close_time")
    resolution = close_time.isoformat() if hasattr(close_time, "isoformat") else str(close_time or "")

    return {
        "marketId": ticker,
        "ticker": ticker,
        "label": row.get("market_title") or row.get("event_title") or ticker,
        "category": shelf,
        "shelf": shelf,
        "seriesTicker": row.get("series_ticker") or "",
        "macroRank": macro_rank,
        "isMacro": is_macro,
        "description": row.get("event_title") or "",
        "resolution": resolution,
        "prob": prob,
        "bid": bid,
        "ask": ask,
        "spread": spread_pp,
        "volume": int(row.get("volume") or 0),
    }


def _candle_row_to_point(row: dict[str, Any]) -> dict[str, Any] | None:
    bid = _fp(row.get("yes_bid"))
    ask = _fp(row.get("yes_ask"))
    prob = _fp(row.get("close_prob"))
    if prob is None:
        prob = _fp(row.get("open_prob"))
    if prob is None and bid is not None and ask is not None:
        prob = (bid + ask) / 2
    if prob is None:
        return None

    raw_date = row.get("date")
    if hasattr(raw_date, "isoformat"):
        date_iso = raw_date.isoformat()
    else:
        date_iso = str(raw_date or "")[:10]
    if not date_iso:
        return None

    spread_raw = _fp(row.get("spread"))
    spread_pp = spread_raw * 100 if spread_raw is not None else None
    if spread_pp is None and bid is not None and ask is not None:
        spread_pp = (ask - bid) * 100

    return {
        "marketId": row.get("market_ticker") or "",
        "date": date_iso,
        "prob": max(0.0, min(1.0, prob)),
        "bid": bid,
        "ask": ask,
        "spread": spread_pp,
        "volume": int(row.get("volume") or 0),
    }


_candles_cache: dict[str, list[dict[str, Any]]] | None = None


def load_candlesticks_parquet(
    path: Path | None = None,
    *,
    market_ticker: str | None = None,
) -> list[dict[str, Any]]:
    """Load chart history from kalshi_candlesticks.parquet or DuckDB."""
    global _candles_cache

    if use_duckdb():
        if market_ticker:
            rows = query_df(
                f"SELECT * FROM {TABLE_CANDLES} WHERE market_ticker = ? ORDER BY date",
                [market_ticker],
            ).to_dict(orient="records")
            points = [_candle_row_to_point(r) for r in rows]
            points = [p for p in points if p]
            first_trade = next((i for i, p in enumerate(points) if p.get("volume", 0) > 0), 0)
            if first_trade > 0:
                points = points[first_trade:]
            return points

        if _candles_cache is not None:
            out: list[dict[str, Any]] = []
            for pts in _candles_cache.values():
                out.extend(pts)
            return out

        rows = read_table_rows(TABLE_CANDLES)
        by_market: dict[str, list[dict[str, Any]]] = {}
        for row in rows:
            ticker = row.get("market_ticker") or ""
            point = _candle_row_to_point(row)
            if not ticker or not point:
                continue
            by_market.setdefault(ticker, []).append(point)
        for ticker in by_market:
            by_market[ticker].sort(key=lambda p: p["date"])
            pts = by_market[ticker]
            first_trade = next((i for i, p in enumerate(pts) if p.get("volume", 0) > 0), 0)
            if first_trade > 0:
                by_market[ticker] = pts[first_trade:]
        _candles_cache = by_market
        out = []
        for pts in by_market.values():
            out.extend(pts)
        return out

    parquet_path = path or CANDLES_PARQUET
    if not parquet_path.is_file():
        return []

    if market_ticker:
        try:
            table = pq.read_table(
                parquet_path,
                filters=[("market_ticker", "=", market_ticker)],
            )
            rows = table.to_pylist()
        except Exception:
            rows = [
                r
                for r in pq.read_table(parquet_path).to_pylist()
                if (r.get("market_ticker") or "") == market_ticker
            ]
        points = [_candle_row_to_point(r) for r in rows]
        points = [p for p in points if p]
        points.sort(key=lambda p: p["date"])
        first_trade = next((i for i, p in enumerate(points) if p.get("volume", 0) > 0), 0)
        if first_trade > 0:
            points = points[first_trade:]
        return points

    if _candles_cache is not None:
        out: list[dict[str, Any]] = []
        for pts in _candles_cache.values():
            out.extend(pts)
        return out

    table = pq.read_table(parquet_path)
    by_market: dict[str, list[dict[str, Any]]] = {}
    for row in table.to_pylist():
        ticker = row.get("market_ticker") or ""
        point = _candle_row_to_point(row)
        if not ticker or not point:
            continue
        by_market.setdefault(ticker, []).append(point)

    for ticker in by_market:
        by_market[ticker].sort(key=lambda p: p["date"])
        first_trade = next((i for i, p in enumerate(by_market[ticker]) if p.get("volume", 0) > 0), 0)
        if first_trade > 0:
            by_market[ticker] = by_market[ticker][first_trade:]

    if market_ticker is None:
        _candles_cache = by_market

    out = []
    for pts in by_market.values():
        out.extend(pts)
    return out


def top_volume_tickers(n: int = CORRELATION_PEER_LIMIT, path: Path | None = None) -> list[str]:
    """Top market tickers by volume from the markets parquet."""
    parquet_path = path or KALSHI_PARQUET
    if not parquet_path.is_file() or n <= 0:
        return []
    table = pq.read_table(parquet_path, columns=["market_ticker", "volume"])
    rows = table.to_pylist()
    rows.sort(key=lambda r: int(r.get("volume") or 0), reverse=True)
    out: list[str] = []
    seen: set[str] = set()
    for row in rows:
        ticker = row.get("market_ticker") or ""
        if not ticker or ticker in seen:
            continue
        seen.add(ticker)
        out.append(ticker)
        if len(out) >= n:
            break
    return out


def load_candlesticks_for_tickers(
    tickers: list[str],
    path: Path | None = None,
) -> list[dict[str, Any]]:
    """Load candlestick history for a set of markets (for correlation prefetch)."""
    unique = list(dict.fromkeys(t for t in tickers if t))
    if not unique:
        return []

    if _candles_cache is not None:
        out: list[dict[str, Any]] = []
        for ticker in unique:
            out.extend(_candles_cache.get(ticker, []))
        return out

    parquet_path = path or CANDLES_PARQUET
    if not parquet_path.is_file():
        return []

    try:
        table = pq.read_table(parquet_path, filters=[("market_ticker", "in", unique)])
        rows = table.to_pylist()
    except Exception:
        rows = [
            r
            for r in pq.read_table(parquet_path).to_pylist()
            if (r.get("market_ticker") or "") in unique
        ]

    by_market: dict[str, list[dict[str, Any]]] = {}
    for row in rows:
        ticker = row.get("market_ticker") or ""
        point = _candle_row_to_point(row)
        if not ticker or not point:
            continue
        by_market.setdefault(ticker, []).append(point)

    out: list[dict[str, Any]] = []
    for ticker in unique:
        pts = by_market.get(ticker, [])
        pts.sort(key=lambda p: p["date"])
        first_trade = next((i for i, p in enumerate(pts) if p.get("volume", 0) > 0), 0)
        if first_trade > 0:
            pts = pts[first_trade:]
        out.extend(pts)
    return out


def candlesticks_parquet_stats(path: Path | None = None) -> dict[str, Any]:
    if use_duckdb():
        return duckdb_table_stats(TABLE_CANDLES, "market_ticker")
    parquet_path = path or CANDLES_PARQUET
    if not parquet_path.is_file():
        return {"exists": False, "path": str(parquet_path)}
    table = pq.read_table(parquet_path, columns=["market_ticker"])
    markets = table.column("market_ticker").to_pylist()
    return {
        "exists": True,
        "path": str(parquet_path.resolve()),
        "rows": table.num_rows,
        "markets": len(set(markets)),
    }


_news_cache: list[dict[str, Any]] | None = None


def load_finnhub_news_parquet(
    path: Path | None = None,
    *,
    limit: int = 80,
    query: str | None = None,
) -> list[dict[str, Any]]:
    global _news_cache
    if use_duckdb():
        if _news_cache is None:
            rows = read_table_rows(TABLE_NEWS)
            out: list[dict[str, Any]] = []
            for row in rows:
                published = row.get("published_at")
                published_iso = published.isoformat() if hasattr(published, "isoformat") else str(published or "")
                out.append(
                    {
                        "id": row.get("news_id"),
                        "ticker": row.get("ticker") or "",
                        "headline": row.get("headline") or "",
                        "summary": row.get("summary") or "",
                        "source": row.get("source") or "",
                        "url": row.get("url") or "",
                        "published_at": published_iso,
                    }
                )
            out.sort(key=lambda x: x.get("published_at") or "", reverse=True)
            _news_cache = out
        rows = _news_cache
        if query:
            q = query.strip().lower()
            rows = [
                r
                for r in rows
                if q in (r.get("headline") or "").lower() or q in (r.get("summary") or "").lower()
            ]
        if limit > 0:
            rows = rows[:limit]
        return rows

    parquet_path = path or FINNHUB_NEWS_PARQUET
    if not parquet_path.is_file():
        return []

    if _news_cache is None:
        table = pq.read_table(parquet_path)
        rows = table.to_pylist()
        out: list[dict[str, Any]] = []
        for row in rows:
            published = row.get("published_at")
            published_iso = published.isoformat() if hasattr(published, "isoformat") else str(published or "")
            out.append(
                {
                    "id": row.get("news_id"),
                    "ticker": row.get("ticker") or "",
                    "headline": row.get("headline") or "",
                    "summary": row.get("summary") or "",
                    "source": row.get("source") or "",
                    "url": row.get("url") or "",
                    "published_at": published_iso,
                }
            )
        out.sort(key=lambda x: x.get("published_at") or "", reverse=True)
        _news_cache = out

    rows = _news_cache
    if query:
        q = query.strip().lower()
        rows = [
            r
            for r in rows
            if q in (r.get("headline") or "").lower() or q in (r.get("summary") or "").lower()
        ]
    if limit > 0:
        rows = rows[:limit]
    return rows


def finnhub_news_parquet_stats(path: Path | None = None) -> dict[str, Any]:
    if use_duckdb():
        return duckdb_table_stats(TABLE_NEWS, "news_id")
    parquet_path = path or FINNHUB_NEWS_PARQUET
    if not parquet_path.is_file():
        return {"exists": False, "path": str(parquet_path)}
    table = pq.read_table(parquet_path, columns=["news_id"])
    return {
        "exists": True,
        "path": str(parquet_path.resolve()),
        "rows": table.num_rows,
    }


def load_kalshi_parquet(
    path: Path | None = None,
    *,
    series_points: list[dict[str, Any]] | None = None,
    calendar_events: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    if use_duckdb():
        rows = read_table_rows(TABLE_MARKETS)
        if not rows:
            raise RuntimeError("kalshi_markets table is empty in DuckDB")
        source_label = "duckdb"
        db_path = str(duckdb_path().resolve())
    else:
        parquet_path = path or KALSHI_PARQUET
        if not parquet_path.is_file():
            raise FileNotFoundError(f"Kalshi parquet not found: {parquet_path}")
        table = pq.read_table(parquet_path)
        rows = table.to_pylist()
        if not rows:
            raise RuntimeError("Kalshi parquet is empty")
        source_label = "parquet"
        db_path = str(parquet_path.resolve())

    scored: list[tuple[int, bool, dict[str, Any]]] = []
    for row in rows:
        rank, is_macro = _score_parquet_market(row)
        scored.append((rank, is_macro, row))

    scored.sort(
        key=lambda item: (
            -int(item[1]),
            -item[0],
            -int(item[2].get("volume") or 0),
        )
    )

    if PARQUET_MAX_MARKETS > 0:
        selected_rows = scored[:PARQUET_MAX_MARKETS]
    else:
        selected_rows = scored

    markets_out = [
        _parquet_row_to_market(row, rank, is_macro)
        for rank, is_macro, row in selected_rows
    ]

    series_count = len({m["seriesTicker"] for m in markets_out if m.get("seriesTicker")})

    if series_points is None:
        series_points = []

    points_out: list[dict[str, Any]] = []
    series_source = None
    if use_duckdb() or CANDLES_PARQUET.is_file():
        stats = candlesticks_parquet_stats()
        if stats.get("markets", 0) > 0:
            series_source = "duckdb_candlesticks" if use_duckdb() else "parquet_candlesticks"
        else:
            series_source = "duckdb_candlesticks_empty" if use_duckdb() else "parquet_candlesticks_empty"
    elif series_points:
        points_out = list(series_points)
        series_source = "file"

    fetched_at = rows[0].get("fetched_at")
    fetched_iso = fetched_at.isoformat() if hasattr(fetched_at, "isoformat") else None

    shelves = {s: 0 for s in SHELF_CATEGORIES}
    for m in markets_out:
        shelf = m.get("shelf") or "Economics"
        if shelf in shelves:
            shelves[shelf] += 1
        else:
            shelves["Economics"] += 1

    return {
        "markets": markets_out,
        "series_points": points_out,
        "calendar_events": calendar_events or [],
        "source": source_label,
        "series_source": series_source,
        "series_ticker": "multi",
        "series_count": series_count,
        "shelves": shelves,
        "macro_markets": sum(1 for m in markets_out if m["isMacro"]),
        "fetched_at": fetched_iso,
        "parquet_path": db_path,
        "duckdb_path": db_path if use_duckdb() else None,
    }
