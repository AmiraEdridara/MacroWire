"""
EconProb API — Kalshi + ForexFactory from Parquet (default), live REST, or kalshi.json.
"""

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from datetime import date, timedelta
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from app.econprob_api import router as econprob_router
from app.institutional import router as institutional_router
from app.forexfactory import load_calendar
from app.notifications import dispatch_digests, run_alert_cycle
from app.workflow_api import router as workflow_router
from app.kalshi_fetch import fetch_chart_series, fetch_live_bundle
from app.parquet_load import (
    CANDLES_PARQUET,
    CORRELATION_PEER_LIMIT,
    FINNHUB_NEWS_PARQUET,
    KALSHI_PARQUET,
    candlesticks_parquet_stats,
    finnhub_news_parquet_stats,
    load_candlesticks_for_tickers,
    load_candlesticks_parquet,
    load_finnhub_news_parquet,
    load_kalshi_parquet,
    top_volume_tickers,
)
from app.duckdb_load import use_duckdb, duckdb_path

DATA_FILE = Path(__file__).resolve().parent.parent / "data" / "kalshi.json"
CHARTS_ROOT = Path(__file__).resolve().parent.parent.parent / "analytics" / "output"

DATA_SOURCE = os.environ.get("DATA_SOURCE", "parquet").strip().lower()
# Live Kalshi REST when DATA_SOURCE=live, or as candlestick fallback when parquet/json lacks history.
KALSHI_LIVE = os.environ.get("KALSHI_LIVE", "0" if DATA_SOURCE in ("parquet", "duckdb") else "1").strip().lower() not in (
    "0",
    "false",
    "no",
)
CACHE_TTL_SEC = int(os.environ.get("KALSHI_CACHE_TTL", "300"))
KALSHI_FETCH_CHARTS = os.environ.get(
    "KALSHI_FETCH_CHARTS",
    "0" if CANDLES_PARQUET.is_file() else "1",
).strip().lower() not in (
    "0",
    "false",
    "no",
)

_live_cache: dict | None = None
_live_cache_at: float = 0.0

ALERT_CHECK_INTERVAL_SEC = int(os.environ.get("ALERT_CHECK_INTERVAL_SEC", "300"))
DIGEST_HOUR_UTC = int(os.environ.get("DIGEST_HOUR_UTC", "12"))
logger = logging.getLogger("macrowire")


async def _alert_loop() -> None:
    last_digest_day: str | None = None
    while True:
        try:
            await asyncio.to_thread(run_alert_cycle)
            today = date.today().isoformat()
            now_hour = __import__("datetime").datetime.utcnow().hour
            if now_hour == DIGEST_HOUR_UTC and last_digest_day != today:
                n = await asyncio.to_thread(dispatch_digests, DIGEST_HOUR_UTC)
                if n:
                    logger.info("Sent %d morning digests", n)
                last_digest_day = today
        except Exception as exc:
            logger.warning("Alert loop error: %s", exc)
        await asyncio.sleep(ALERT_CHECK_INTERVAL_SEC)


@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(_alert_loop())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="EconProb API", version="2.4.0", lifespan=lifespan)

app.include_router(econprob_router)
app.include_router(workflow_router)
app.include_router(institutional_router)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://localhost:3000",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def load_kalshi_file() -> dict:
    if not DATA_FILE.exists():
        return {"markets": [], "series_points": []}
    data = json.loads(DATA_FILE.read_text())
    data.setdefault("source", "file")
    return data


def _series_points_from_file() -> list[dict]:
    return load_kalshi_file().get("series_points") or []


def _load_parquet_bundle() -> dict:
    calendar_events = load_calendar()
    bundle = load_kalshi_parquet(
        series_points=_series_points_from_file(),
        calendar_events=calendar_events,
    )
    chart_markets = bundle["markets"][:16]
    chart_ids = {m["ticker"] for m in chart_markets}
    covered = {p.get("marketId") for p in bundle["series_points"] if p.get("marketId") in chart_ids}
    missing = chart_ids - covered
    if missing and KALSHI_FETCH_CHARTS:
        try:
            fetched = fetch_chart_series(
                [m for m in chart_markets if m["ticker"] in missing]
            )
            if fetched:
                bundle["series_points"].extend(fetched)
                bundle["series_source"] = "kalshi_charts"
        except Exception as exc:
            bundle["series_error"] = str(exc)
    return bundle


def get_kalshi_data(*, live: bool | None = None) -> dict:
    global _live_cache, _live_cache_at
    use_live = KALSHI_LIVE if live is None else live

    if DATA_SOURCE in ("parquet", "duckdb") and live is not True:
        now = time.time()
        if _live_cache and (now - _live_cache_at) < CACHE_TTL_SEC:
            return _live_cache
        if DATA_SOURCE == "parquet" and not KALSHI_PARQUET.is_file():
            file_data = load_kalshi_file()
            if file_data.get("markets"):
                file_data["source"] = "file"
                file_data["parquet_missing"] = str(KALSHI_PARQUET)
                return file_data
            raise FileNotFoundError(f"Kalshi parquet not found: {KALSHI_PARQUET}")
        if DATA_SOURCE == "duckdb" and not duckdb_path().is_file():
            raise FileNotFoundError(f"DuckDB not found: {duckdb_path()}")
        bundle = _load_parquet_bundle()
        _live_cache = bundle
        _live_cache_at = now
        return bundle

    if use_live:
        now = time.time()
        if _live_cache and (now - _live_cache_at) < CACHE_TTL_SEC:
            return _live_cache
        try:
            bundle = fetch_live_bundle()
            _live_cache = bundle
            _live_cache_at = now
            DATA_FILE.parent.mkdir(parents=True, exist_ok=True)
            DATA_FILE.write_text(json.dumps(bundle, indent=2), encoding="utf-8")
            return bundle
        except Exception as exc:
            if DATA_SOURCE == "parquet" and KALSHI_PARQUET.is_file():
                bundle = _load_parquet_bundle()
                bundle["live_error"] = str(exc)
                return bundle
            file_data = load_kalshi_file()
            if file_data.get("markets") or file_data.get("series_points"):
                file_data["source"] = "file_fallback"
                file_data["live_error"] = str(exc)
                return file_data
            raise
    return load_kalshi_file()


def get_macro_calendar() -> list[dict]:
    events = load_calendar()
    if events:
        return events
    today = date.today()
    return sorted(
        [
            {"date": str(today + timedelta(days=8)), "label": "CPI", "type": "cpi", "detail": "CPI (est.)", "impact": "High"},
            {"date": str(today + timedelta(days=15)), "label": "FOMC", "type": "fed", "detail": "FOMC decision", "impact": "High"},
        ],
        key=lambda x: x["date"],
    )


@app.get("/")
def root():
    cached = _live_cache is not None and (time.time() - _live_cache_at) < CACHE_TTL_SEC
    return {
        "service": "EconProb API",
        "version": "2.3.0",
        "status": "ok",
        "data_source": DATA_SOURCE,
        "kalshi_live": KALSHI_LIVE,
        "kalshi_cached": cached,
        "kalshi_parquet": str(KALSHI_PARQUET),
        "duckdb_path": str(duckdb_path()),
        "data_source": DATA_SOURCE,
        "candlesticks_parquet": str(CANDLES_PARQUET),
        "candlesticks_stats": candlesticks_parquet_stats(),
        "finnhub_news_parquet": str(FINNHUB_NEWS_PARQUET),
        "finnhub_news_stats": finnhub_news_parquet_stats(),
        "data_file": str(DATA_FILE),
    }


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "data_source": DATA_SOURCE,
        "kalshi_live": KALSHI_LIVE,
        "kalshi_parquet_exists": KALSHI_PARQUET.is_file(),
        "duckdb_exists": duckdb_path().is_file(),
        "duckdb_path": str(duckdb_path()),
        "candlesticks_parquet_exists": CANDLES_PARQUET.is_file(),
        "finnhub_news_parquet_exists": FINNHUB_NEWS_PARQUET.is_file(),
    }


@app.get("/api/kalshi/series/bulk")
def kalshi_series_bulk(
    limit: int = Query(CORRELATION_PEER_LIMIT, ge=2, le=30, description="Top markets by volume"),
):
    """Daily histories for the most liquid markets — used for correlation on first load."""
    if DATA_SOURCE in ("parquet", "duckdb") and (DATA_SOURCE == "duckdb" or CANDLES_PARQUET.is_file()):
        tickers = top_volume_tickers(limit)
        points = load_candlesticks_for_tickers(tickers)
        return {
            "tickers": tickers,
            "points": points,
            "source": "duckdb_candlesticks" if use_duckdb() else "parquet_candlesticks",
            "markets_loaded": len({p.get("marketId") for p in points if p.get("marketId")}),
        }
    return {"tickers": [], "points": [], "source": "none", "markets_loaded": 0}


@app.get("/api/kalshi/series/{ticker}")
def kalshi_series(ticker: str):
    """Daily candlestick history for one market from parquet (or live fallback)."""
    if DATA_SOURCE in ("parquet", "duckdb") and (DATA_SOURCE == "duckdb" or CANDLES_PARQUET.is_file()):
        points = load_candlesticks_parquet(market_ticker=ticker)
        if points:
            return {"marketId": ticker, "points": points, "source": "duckdb_candlesticks" if use_duckdb() else "parquet_candlesticks"}
    if KALSHI_FETCH_CHARTS:
        try:
            from app.kalshi_fetch import fetch_chart_series, infer_series_ticker

            hit = {
                "ticker": ticker,
                "seriesTicker": infer_series_ticker(ticker, None),
            }
            points = fetch_chart_series([hit])
            if points:
                return {"marketId": ticker, "points": points, "source": "kalshi_charts"}
        except Exception as exc:
            raise HTTPException(status_code=502, detail=str(exc)) from exc
    return {"marketId": ticker, "points": [], "source": "none"}


@app.get("/api/kalshi/data")
def kalshi_data(live: bool | None = Query(None, description="Force live Kalshi fetch")):
    """Markets + series_points from Parquet (default), Kalshi REST, or kalshi.json."""
    try:
        return get_kalshi_data(live=live)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Kalshi fetch failed: {exc}") from exc


@app.post("/api/kalshi/refresh")
def kalshi_refresh():
    """Bypass cache; re-read Parquet or refetch from Kalshi when live."""
    global _live_cache, _live_cache_at
    _live_cache = None
    _live_cache_at = 0.0
    if DATA_SOURCE in ("parquet", "duckdb"):
        return get_kalshi_data()
    return get_kalshi_data(live=True)


def _chart_dir(ticker: str) -> Path:
    safe = ticker.replace("/", "_").replace("..", "")
    return CHARTS_ROOT / safe


@app.get("/api/charts/{ticker}")
def list_charts(ticker: str):
    """List PNG chart exports for a ticker (see docs/CHART-PRD.md)."""
    d = _chart_dir(ticker)
    if not d.is_dir():
        return {"ticker": ticker, "charts": [], "summary": None, "regime_engine": None}
    charts = sorted(p.name for p in d.glob("*.png"))
    summary_path = d / "summary.txt"
    summary = summary_path.read_text(encoding="utf-8") if summary_path.exists() else None
    regime_engine = None
    if summary:
        for line in summary.splitlines():
            if line.startswith("regime_engine:"):
                regime_engine = line.split(":", 1)[1].strip()
    return {"ticker": ticker, "charts": charts, "summary": summary, "regime_engine": regime_engine}


@app.get("/api/charts/{ticker}/{filename}")
def get_chart_png(ticker: str, filename: str):
    if ".." in filename or "/" in filename or not filename.endswith(".png"):
        raise HTTPException(status_code=404, detail="Not found")
    path = _chart_dir(ticker) / filename
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Chart not found")
    return FileResponse(path, media_type="image/png")
