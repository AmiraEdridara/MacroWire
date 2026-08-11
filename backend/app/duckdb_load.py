"""Read Kalshi / FF / Finnhub tables from a local DuckDB file."""

from __future__ import annotations

import os
import time
from functools import lru_cache
from pathlib import Path
from typing import Any

import duckdb
import pandas as pd

DUCKDB_PATH = Path(os.environ.get("DUCKDB_PATH", str(Path.home() / "kalshi.duckdb"))).expanduser()
DATA_SOURCE = os.environ.get("DATA_SOURCE", "parquet").strip().lower()

TABLE_MARKETS = os.environ.get("DUCKDB_MARKETS_TABLE", "kalshi_markets")
TABLE_CANDLES = os.environ.get("DUCKDB_CANDLES_TABLE", "kalshi_candlesticks")
TABLE_EVENTS = os.environ.get("DUCKDB_EVENTS_TABLE", "forexfactory_events")
TABLE_NEWS = os.environ.get("DUCKDB_NEWS_TABLE", "finnhub_news")
TABLE_POLY_MARKETS = os.environ.get("DUCKDB_POLY_MARKETS_TABLE", "polymarket_markets")
TABLE_POLY_CANDLES = os.environ.get("DUCKDB_POLY_CANDLES_TABLE", "polymarket_candlesticks")

_mtime_seen: float = 0.0


def use_duckdb() -> bool:
    return DATA_SOURCE == "duckdb"


def duckdb_path() -> Path:
    return DUCKDB_PATH


def duckdb_mtime() -> float:
    if not DUCKDB_PATH.is_file():
        return 0.0
    return DUCKDB_PATH.stat().st_mtime


def _maybe_bust_caches() -> None:
    """Clear cached reads when the DuckDB file changes (daily refresh)."""
    global _mtime_seen
    mtime = duckdb_mtime()
    if mtime and mtime != _mtime_seen:
        _mtime_seen = mtime
        read_table_df.cache_clear()
        table_stats.cache_clear()
        try:
            from app import econprob_api

            econprob_api.load_markets.cache_clear()
            econprob_api.load_candles.cache_clear()
            econprob_api.load_events.cache_clear()
            econprob_api.load_news.cache_clear()
            econprob_api.load_polymarket_markets.cache_clear()
            econprob_api.load_polymarket_candles.cache_clear()
        except Exception:
            pass
        try:
            from app import parquet_load

            parquet_load._candles_cache = None
            parquet_load._news_cache = None
        except Exception:
            pass


@lru_cache(maxsize=8)
def read_table_df(table: str) -> pd.DataFrame:
    if not DUCKDB_PATH.is_file():
        raise FileNotFoundError(f"DuckDB not found: {DUCKDB_PATH}")
    con = duckdb.connect(str(DUCKDB_PATH), read_only=True)
    try:
        return con.execute(f"SELECT * FROM {table}").df()
    finally:
        con.close()


def read_table_rows(table: str) -> list[dict[str, Any]]:
    _maybe_bust_caches()
    return read_table_df(table).to_dict(orient="records")


def query_df(sql: str, params: list[Any] | None = None) -> pd.DataFrame:
    if not DUCKDB_PATH.is_file():
        raise FileNotFoundError(f"DuckDB not found: {DUCKDB_PATH}")
    _maybe_bust_caches()
    con = duckdb.connect(str(DUCKDB_PATH), read_only=True)
    try:
        if params:
            return con.execute(sql, params).df()
        return con.execute(sql).df()
    finally:
        con.close()


@lru_cache(maxsize=8)
def table_stats(table: str, id_column: str | None = None) -> dict[str, Any]:
    if not DUCKDB_PATH.is_file():
        return {"exists": False, "path": str(DUCKDB_PATH)}
    _maybe_bust_caches()
    rows = int(query_df(f"SELECT COUNT(*) AS n FROM {table}").iloc[0]["n"])
    stats: dict[str, Any] = {
        "exists": True,
        "path": str(DUCKDB_PATH.resolve()),
        "rows": rows,
        "mtime": duckdb_mtime(),
    }
    if id_column:
        markets = int(query_df(f"SELECT COUNT(DISTINCT {id_column}) AS n FROM {table}").iloc[0]["n"])
        stats["markets"] = markets
    return stats
