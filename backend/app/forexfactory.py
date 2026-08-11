"""
ForexFactory high-impact economic calendar (public weekly CSV).
"""

from __future__ import annotations

import csv
import io
import os
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx

FF_CSV = os.environ.get(
    "FOREXFACTORY_CSV_URL",
    "https://nfs.faireconomy.media/ff_calendar_thisweek.csv",
)
CACHE_FILE = Path(__file__).resolve().parent.parent / "data" / "ff_calendar.csv"
NY = ZoneInfo("America/New_York")
CACHE_TTL_SEC = int(os.environ.get("FF_CACHE_TTL", "3600"))
DATA_SOURCE = os.environ.get("DATA_SOURCE", "parquet").strip().lower()
FF_PARQUET = Path(
    os.environ.get("FF_PARQUET", str(Path.home() / "files" / "forexfactory_events.parquet"))
).expanduser()

_cache_events: list[dict[str, Any]] | None = None
_cache_at: float = 0.0


def classify_event(title: str) -> str:
    u = (title or "").upper()
    if (
        "FOMC" in u
        or "FED INTEREST" in u
        or "FED RATE" in u
        or "FED " in u
        or u.startswith("FED")
        or "INTEREST RATE" in u
        or " RATE DECISION" in u
    ):
        return "fed"
    if "CPI" in u or "PCE" in u or "INFLATION" in u:
        return "cpi"
    if "GDP" in u:
        return "gdp"
    if "NFP" in u or "NON-FARM" in u or "NONFARM" in u or "PAYROLL" in u or "JOBLESS" in u:
        return "jobs"
    return "macro"


def _parse_row(row: dict[str, str]) -> dict[str, Any] | None:
    title = (row.get("Title") or "").strip()
    date_s = (row.get("Date") or "").strip()
    time_s = (row.get("Time") or "").strip()
    impact = (row.get("Impact") or "").strip()
    if impact != "High":
        return None
    ny_date_iso = None
    try:
        if date_s and time_s and time_s.lower() != "all day":
            event_dt = datetime.strptime(f"{date_s} {time_s}", "%m-%d-%Y %I:%M%p").replace(tzinfo=NY)
        elif date_s:
            event_dt = datetime.strptime(date_s, "%m-%d-%Y").replace(hour=12, minute=0, tzinfo=NY)
        else:
            event_dt = None
        if event_dt:
            ny_date_iso = event_dt.date().isoformat()
    except ValueError:
        return None
    if not ny_date_iso or not title:
        return None
    etype = classify_event(title)
    short = title.split("(")[0].strip()[:48]
    return {
        "date": ny_date_iso,
        "label": short,
        "type": etype,
        "detail": title,
        "impact": impact,
        "title": title,
        "is_fed": etype == "fed",
        "is_macro": etype in ("fed", "cpi", "gdp", "jobs", "macro"),
    }


def fetch_forexfactory_csv() -> list[dict[str, Any]]:
    with httpx.Client(timeout=45.0, headers={"User-Agent": "EconProb/1.0"}) as client:
        r = client.get(FF_CSV)
        r.raise_for_status()
        text = r.text
    out: list[dict[str, Any]] = []
    for row in csv.DictReader(io.StringIO(text)):
        ev = _parse_row(row)
        if ev:
            out.append(ev)
    out.sort(key=lambda e: (e["date"], e["label"]))
    return out


def _load_parquet_calendar() -> list[dict[str, Any]] | None:
    if DATA_SOURCE == "duckdb":
        from app.duckdb_load import TABLE_EVENTS, read_table_rows
        from app.parquet_load import _parse_ff_date, _impact_label

        try:
            rows = read_table_rows(TABLE_EVENTS)
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
        except FileNotFoundError:
            return None

    if DATA_SOURCE not in ("parquet", "auto"):
        return None
    if not FF_PARQUET.is_file():
        return None
    from app.parquet_load import load_ff_parquet

    return load_ff_parquet(FF_PARQUET)


def load_calendar(*, force: bool = False) -> list[dict[str, Any]]:
    global _cache_events, _cache_at
    import time

    now = time.time()
    if not force and _cache_events and (now - _cache_at) < CACHE_TTL_SEC:
        return _cache_events

    parquet_events = _load_parquet_calendar()
    if parquet_events is not None:
        _cache_events = parquet_events
        _cache_at = now
        return parquet_events

    if not force and CACHE_FILE.exists():
        try:
            age = now - CACHE_FILE.stat().st_mtime
            if age < CACHE_TTL_SEC:
                rows = list(csv.DictReader(CACHE_FILE.open(encoding="utf-8")))
                _cache_events = [
                    {
                        "date": r["date"],
                        "label": r.get("label", ""),
                        "type": r.get("type", "macro"),
                        "detail": r.get("detail", ""),
                        "impact": r.get("impact", "High"),
                        "title": r.get("title", ""),
                        "is_fed": r.get("is_fed", "").lower() == "true",
                        "is_macro": r.get("is_macro", "").lower() == "true",
                    }
                    for r in rows
                ]
                _cache_at = now
                return _cache_events
        except OSError:
            pass

    try:
        events = fetch_forexfactory_csv()
    except httpx.HTTPError:
        if CACHE_FILE.exists():
            return load_calendar(force=False)
        return []

    CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
    with CACHE_FILE.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=["date", "label", "type", "detail", "impact", "title", "is_fed", "is_macro"],
        )
        w.writeheader()
        for e in events:
            w.writerow(
                {
                    "date": e["date"],
                    "label": e["label"],
                    "type": e["type"],
                    "detail": e["detail"],
                    "impact": e["impact"],
                    "title": e["title"],
                    "is_fed": str(e["is_fed"]),
                    "is_macro": str(e["is_macro"]),
                }
            )

    _cache_events = events
    _cache_at = now
    return events
