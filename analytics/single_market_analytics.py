#!/usr/bin/env python3
"""
Single Kalshi market — replicate Econ Prob web charts in pure Python.

Default: CPI MoM > 0.7% in April 2026 (KXECONSTATCPI-26APR-T0.7)

  pip install -r requirements.txt
  python single_market_analytics.py
  python single_market_analytics.py --ticker KXECONSTATCPI-26APR-T0.7 --days 120 --fetch

Outputs: output/<ticker>/01_overview.png … 10_macro_events.png + summary.txt

See docs/CHART-PRD.md (platform) and kalshi-single-market-analytics/docs/MATH-PRD.md
"""

from __future__ import annotations

import argparse
import csv
import io
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any
from zoneinfo import ZoneInfo

import httpx
import numpy as np

import charts
from math_overlays import (
    HMM_STATE_LABELS,
    bayesian_update,
    detect_change_points,
    event_study,
    garch_model,
    hawkes_intensity,
    likelihood_from_returns,
    pick_event_study_index,
    price_from_prob,
    hawkes_shock_times,
    resolve_regime_path,
    run_kalman,
    simple_returns,
    state_space_model,
)

KALSHI_BASE = "https://external-api.kalshi.com"
FF_CSV = "https://nfs.faireconomy.media/ff_calendar_thisweek.csv"
NY = ZoneInfo("America/New_York")
UTC = ZoneInfo("UTC")

DEFAULT_TICKER = "KXECONSTATCPI-26APR-T0.7"
CALENDAR_CACHE = Path(__file__).resolve().parent / "data" / "ff_calendar.csv"


@dataclass
class Bar:
    t: int
    date: str
    ny_date_iso: str
    prob: float
    price: float
    volume: int
    is_fed_day: bool
    is_news_day: bool


# ── Kalshi + calendar (public REST) ─────────────────────────────────────────


def kalshi_get(path: str, params: dict[str, Any] | None = None) -> Any:
    with httpx.Client(base_url=KALSHI_BASE, timeout=45.0) as c:
        r = c.get(path, params=params or {})
        r.raise_for_status()
        return r.json()


def resolve_series_ticker(market_ticker: str) -> tuple[str, dict[str, Any]]:
    m = kalshi_get(f"/trade-api/v2/markets/{market_ticker}")["market"]
    ev = kalshi_get(f"/trade-api/v2/events/{m['event_ticker']}")["event"]
    return ev["series_ticker"], m


def fetch_candlesticks(
    series_ticker: str, market_ticker: str, start_ts: int, end_ts: int, period: int = 1440
) -> list[dict[str, Any]]:
    path = f"/trade-api/v2/series/{series_ticker}/markets/{market_ticker}/candlesticks"
    data = kalshi_get(path, {"start_ts": start_ts, "end_ts": end_ts, "period_interval": period})
    return data.get("candlesticks") or []


def fp(v: str | None) -> float | None:
    if v is None:
        return None
    try:
        return float(v)
    except ValueError:
        return None


def candle_to_bar(i: int, c: dict[str, Any]) -> dict[str, Any] | None:
    price = c.get("price") or {}
    end_ts = int(c.get("end_period_ts", 0))
    cl = fp(price.get("close_dollars"))
    mean = fp(price.get("mean_dollars"))
    prob = cl if cl is not None else mean
    if prob is None:
        return None
    dt_ny = datetime.fromtimestamp(end_ts, tz=UTC).astimezone(NY)
    vol_raw = c.get("volume_fp") or "0"
    try:
        volume = int(float(vol_raw))
    except ValueError:
        volume = 0
    return {
        "t": i,
        "date": dt_ny.strftime("%b %d"),
        "ny_date_iso": dt_ny.date().isoformat(),
        "prob": max(0.0, min(1.0, prob)),
        "price": (mean or cl or 0) * 100,
        "volume": volume,
    }


def build_ohlcv_bars(market_ticker: str, days: int = 120) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    end_ts = int(time.time())
    start_ts = end_ts - days * 86400
    series_ticker, market = resolve_series_ticker(market_ticker)
    sticks = fetch_candlesticks(series_ticker, market_ticker, start_ts, end_ts, 1440)
    bars: list[dict[str, Any]] = []
    for i, c in enumerate(sticks):
        row = candle_to_bar(i, c)
        if row:
            bars.append(row)
    if not bars:
        short = end_ts - 14 * 86400
        sticks = fetch_candlesticks(series_ticker, market_ticker, short, end_ts, 60)
        for i, c in enumerate(sticks):
            row = candle_to_bar(i, c)
            if row:
                bars.append(row)
    for i, b in enumerate(bars):
        b["t"] = i
    # Sample start: first day with non-zero volume (CHART-PRD §2)
    first_trade = next((i for i, b in enumerate(bars) if b.get("volume", 0) > 0), 0)
    if first_trade > 0:
        bars = bars[first_trade:]
        for i, b in enumerate(bars):
            b["t"] = i
    return bars, market


def fetch_calendar() -> list[dict[str, Any]]:
    with httpx.Client(timeout=45.0, headers={"User-Agent": "EconProbAnalytics/1.0"}) as c:
        r = c.get(FF_CSV)
        r.raise_for_status()
        text = r.text
    out: list[dict[str, Any]] = []
    for row in csv.DictReader(io.StringIO(text)):
        title = (row.get("Title") or "").strip()
        date_s = (row.get("Date") or "").strip()
        time_s = (row.get("Time") or "").strip()
        impact = (row.get("Impact") or "").strip()
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
            ny_date_iso = None
        out.append({"title": title, "impact": impact, "ny_date_iso": ny_date_iso})
    return out


def load_calendar(*, fetch: bool) -> list[dict[str, Any]]:
    if not fetch and CALENDAR_CACHE.exists():
        out: list[dict[str, Any]] = []
        with CALENDAR_CACHE.open(newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                out.append(
                    {
                        "title": row.get("title", ""),
                        "impact": row.get("impact", ""),
                        "ny_date_iso": row.get("ny_date_iso") or None,
                    }
                )
        return out
    events = fetch_calendar()
    CALENDAR_CACHE.parent.mkdir(parents=True, exist_ok=True)
    with CALENDAR_CACHE.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["title", "impact", "ny_date_iso"])
        w.writeheader()
        for e in events:
            w.writerow({k: e.get(k, "") for k in ("title", "impact", "ny_date_iso")})
    return events


def classify_event(title: str) -> str | None:
    u = title.upper()
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
        return "inflation"
    if "GDP" in u:
        return "gdp"
    if "NFP" in u or "NON-FARM" in u or "NONFARM" in u:
        return "employment"
    return None


def calendar_flags(ny_date_iso: str, events: list[dict[str, Any]]) -> tuple[bool, bool]:
    is_fed = is_news = False
    for e in events:
        if e.get("impact") != "High":
            continue
        if e.get("ny_date_iso") != ny_date_iso:
            continue
        cat = classify_event(e.get("title") or "")
        if cat == "fed":
            is_fed = True
        is_news = True
    return is_fed, is_news


def merge_calendar(bars: list[dict[str, Any]], events: list[dict[str, Any]]) -> list[Bar]:
    rows: list[Bar] = []
    for b in bars:
        fed, news = calendar_flags(b["ny_date_iso"], events)
        rows.append(
            Bar(
                t=b["t"],
                date=b["date"],
                ny_date_iso=b["ny_date_iso"],
                prob=b["prob"],
                price=b["price"],
                volume=b["volume"],
                is_fed_day=fed,
                is_news_day=news,
            )
        )
    return rows


def run_pipeline(ticker: str, days: int, out_dir: Path, *, fetch: bool = False) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    print(f"Fetching {ticker} …")
    raw_bars, market = build_ohlcv_bars(ticker, days)
    if not raw_bars:
        raise SystemExit("No candlesticks returned — market may be inactive or rate-limited.")
    events = load_calendar(fetch=fetch)
    bars = merge_calendar(raw_bars, events)
    n = len(bars)
    print(f"Bars: {n}  |  {market.get('title', ticker)}")

    probs = np.array([b.prob for b in bars])
    prices = price_from_prob(probs)
    returns = simple_returns(prices)
    shock_times = hawkes_shock_times(returns, n)

    kalman = run_kalman(probs)
    lik = likelihood_from_returns(returns)
    bayes = bayesian_update(0.5, lik)
    garch = garch_model(returns) if len(returns) else np.zeros(0)
    hmm_path, regime_engine = resolve_regime_path(probs, prices, use_hmm=fetch)
    hawkes = hawkes_intensity(shock_times, n)
    cps = detect_change_points(probs)
    ssm_level, ssm_fc = state_space_model(probs)
    ev_bar = pick_event_study_index(bars)
    ev_idx = min(ev_bar, len(returns) - 1) if len(returns) else 0
    es_t, es_car = event_study(returns, ev_idx)
    event_label = next(
        (b.date for b in bars if b.t == ev_bar and (b.is_news_day or b.is_fed_day)),
        f"return index {ev_idx}",
    )

    market_title = market.get("title", ticker)
    regime = HMM_STATE_LABELS[hmm_path[-1]] if len(hmm_path) else "Neutral"
    meta = charts.ChartMeta(
        ticker=ticker,
        title=market_title,
        n_bars=n,
        latest_prob=float(probs[-1]),
        regime=regime,
        regime_engine=regime_engine,
    )

    charts.chart_overview(out_dir / "01_overview.png", bars, probs, market_title, meta)
    charts.chart_hawkes(out_dir / "02_hawkes.png", bars, probs, hawkes, meta)
    if len(garch):
        charts.chart_garch(out_dir / "03_garch.png", bars, garch, meta)
    charts.chart_hmm(out_dir / "04_hmm_regimes.png", bars, probs, hmm_path, meta)
    charts.chart_kalman(out_dir / "05_kalman.png", bars, probs, kalman, meta)
    charts.chart_changepoints(out_dir / "06_changepoints.png", bars, probs, cps, meta)
    charts.chart_bayesian(out_dir / "07_bayesian.png", bars, bayes, meta)
    charts.chart_ssm(out_dir / "08_ssm.png", bars, probs, ssm_level, ssm_fc, meta)
    if len(es_car):
        charts.chart_event_study(out_dir / "09_event_study.png", es_t, es_car, event_label, meta)
    charts.chart_macro_events(out_dir / "10_macro_events.png", bars, probs, market_title, meta)
    summary = (
        f"ticker: {ticker}\n"
        f"title: {market.get('title', '')}\n"
        f"bars: {n}\n"
        f"latest_prob: {probs[-1]:.4f} ({probs[-1]*100:.1f}% / {round(probs[-1]*100)}¢)\n"
        f"regime: {regime}\n"
        f"regime_engine: {regime_engine}\n"
        + (f"garch_last: {garch[-1]:.4f}\n" if len(garch) else "")
    )
    (out_dir / "summary.txt").write_text(summary, encoding="utf-8")
    print(summary)
    print(f"Wrote charts to {out_dir}/")


def main() -> None:
    p = argparse.ArgumentParser(description="Single-market Econ Prob analytics (Python)")
    p.add_argument("--ticker", default=DEFAULT_TICKER, help=f"Kalshi market ticker (default: {DEFAULT_TICKER})")
    p.add_argument("--days", type=int, default=120, help="History window for daily candles")
    p.add_argument(
        "--out",
        type=Path,
        default=None,
        help="Output directory (default: analytics/output/<ticker>)",
    )
    p.add_argument(
        "--fetch",
        action="store_true",
        help="Refresh ForexFactory calendar cache; use HMM regimes when enough bars",
    )
    args = p.parse_args()
    root = Path(__file__).resolve().parent
    out = args.out or root / "output" / args.ticker.replace("/", "_")
    run_pipeline(args.ticker, args.days, out, fetch=args.fetch)


if __name__ == "__main__":
    main()
