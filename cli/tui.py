#!/usr/bin/env python3
"""MacroWire TUI — terminal dashboard for macro probability markets.

Usage:
    python cli/tui.py
    MACROWIRE_API=http://your-server:8000 python cli/tui.py

Keys:
    1  Markets      2  Volatility    3  Signals    4  News
    r  Refresh      q  Quit
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

import asyncio

import httpx
from textual import on
from textual.app import App, ComposeResult
from textual.binding import Binding
from textual.widgets import (
    DataTable, Footer, Header, Input,
    Static, TabbedContent, TabPane,
)

BASE_URL = os.getenv("MACROWIRE_API", "http://localhost:8000")

# Candidate paths for local parquet/csv data (checked in order)
_HERE = Path(__file__).parent.parent
_CANDLES_PATHS = [
    _HERE / "kalshi_candlesticks.parquet",
    Path.home() / "kalshi_candlesticks.parquet",
]
_FF_PATHS = [
    _HERE / "backend" / "data" / "ff_calendar.csv",
]


def _find(paths: list[Path]) -> Path | None:
    return next((p for p in paths if p.exists()), None)


def _load_candles():
    import pandas as pd
    p = _find(_CANDLES_PATHS)
    if p is None:
        return pd.DataFrame()
    return pd.read_parquet(p)


# ── offline fallbacks ─────────────────────────────────────────────────────────

def _offline_markets(search: str = "", limit: int = 300) -> dict:
    import pandas as pd
    df = _load_candles()
    if df.empty:
        return {"markets": []}
    latest = df.sort_values("date").groupby("market_ticker").last().reset_index()
    if search:
        mask = (
            latest["market_ticker"].str.contains(search, case=False, na=False)
            | latest["event_title"].str.contains(search, case=False, na=False)
        )
        latest = latest[mask]
    latest = latest.sort_values("volume", ascending=False).head(limit)
    markets = []
    for _, row in latest.iterrows():
        markets.append({
            "market_ticker": row.get("market_ticker"),
            "event_title":   row.get("event_title"),
            "yes_bid":       row.get("yes_bid") if pd.notna(row.get("yes_bid")) else row.get("close_prob"),
            "spread":        row.get("spread") if pd.notna(row.get("spread")) else None,
            "volume":        int(row.get("volume") or 0),
            "days_to_expiry": None,
        })
    return {"markets": markets}


def _offline_snapshot() -> dict:
    import pandas as pd
    df = _load_candles()
    if df.empty:
        return {"volatility": {"ranking": []}, "signals": []}

    df = df.sort_values("date")
    grp = df.groupby("market_ticker")

    # vectorized: latest and prev close_prob per ticker
    last  = grp["close_prob"].last()
    prev  = grp["close_prob"].nth(-2)
    lag7  = grp["close_prob"].nth(-8)
    vol_1d = (last - prev).fillna(0)
    vol_7d = (last - lag7).fillna(0)
    last_price = last.fillna(0)

    # std of daily deltas per ticker (needs groupby transform)
    df["_delta"] = df.groupby("market_ticker")["close_prob"].diff()
    sigma = df.groupby("market_ticker")["_delta"].std().fillna(0.01).clip(lower=0.001)

    # volume ratio: last vs mean
    last_vol = grp["volume"].last().fillna(0)
    mean_vol = grp["volume"].mean().fillna(1).clip(lower=1)
    vol_ratio = last_vol / mean_vol

    z = vol_1d / sigma

    # filter tickers with enough history
    counts = grp.size()
    valid = counts[counts >= 5].index

    vol_df = pd.DataFrame({
        "market_ticker": valid,
        "vol_1d":        vol_1d.reindex(valid).fillna(0),
        "vol_7d":        vol_7d.reindex(valid).fillna(0),
        "last_price":    last_price.reindex(valid).fillna(0),
        "days_to_expiry": None,
    })
    vol_df["_abs_vol"] = vol_df["vol_1d"].abs()
    vol_df = vol_df.sort_values("_abs_vol", ascending=False).head(50)
    vol_rows = vol_df.drop(columns="_abs_vol").to_dict("records")

    z_valid = z.reindex(valid).fillna(0)
    vr_valid = vol_ratio.reindex(valid).fillna(0)
    sig_mask = (z_valid.abs() >= 1.5) | (vr_valid >= 2.0)
    sig_idx = sig_mask[sig_mask].index

    last_yes_bid = grp["yes_bid"].last().fillna(0)
    sig_rows = []
    for ticker in sig_idx:
        zv = float(z_valid.get(ticker, 0))
        vr = float(vr_valid.get(ticker, 0))
        reasons = []
        if abs(zv) >= 1.5:
            reasons.append(f"z={zv:+.1f}")
        if vr >= 2.0:
            reasons.append(f"vol×{vr:.1f}")
        sig_rows.append({
            "market_ticker": ticker,
            "signal":        "bull" if zv > 0 else "bear",
            "yes_bid":       float(last_yes_bid.get(ticker, 0)),
            "edge":          float(vol_1d.get(ticker, 0)),
            "reasons":       reasons,
        })
    sig_rows.sort(key=lambda r: abs(r["edge"]), reverse=True)

    return {
        "volatility": {"ranking": vol_rows},
        "signals":    sig_rows[:30],
    }


def _offline_news(limit: int = 60) -> dict:
    import pandas as pd
    p = _find(_FF_PATHS)
    if p is None:
        return {"news": []}
    df = pd.read_csv(p)
    df = df[df.get("is_macro", pd.Series(dtype=bool)) | df.get("is_fed", pd.Series(dtype=bool))]
    df = df.sort_values("date", ascending=False).head(limit)
    news = []
    for _, row in df.iterrows():
        news.append({
            "published_at": str(row.get("date") or ""),
            "headline":     str(row.get("title") or row.get("label") or ""),
            "source":       "ForexFactory",
        })
    return {"news": news}


# ── HTTP with offline fallback ────────────────────────────────────────────────

async def _get(path: str, params: dict | None = None) -> Any:
    import asyncio
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            r = await client.get(f"{BASE_URL}{path}", params=params or {})
            r.raise_for_status()
            return r.json()
    except Exception:
        p = params or {}
        if path == "/api/markets":
            return await asyncio.to_thread(
                _offline_markets, p.get("search", ""), int(p.get("limit", 300))
            )
        if path == "/api/institutional/snapshot":
            return await asyncio.to_thread(_offline_snapshot)
        if path == "/api/news":
            return await asyncio.to_thread(_offline_news, int(p.get("limit", 60)))
        return {}


class MacroWireApp(App[None]):
    TITLE = "MacroWire"
    SUB_TITLE = "macro probability terminal"

    CSS = """
    Screen {
        background: #0f0e0c;
    }
    TabbedContent {
        height: 1fr;
    }
    TabPane {
        padding: 0;
    }
    #market-search {
        margin: 0 0 1 0;
        border: tall #3b3833;
        background: #1a1814;
        color: #c8bfaa;
    }
    DataTable {
        height: 1fr;
        background: #0f0e0c;
    }
    DataTable > .datatable--header {
        background: #1a1814;
        color: #d4b85a;
    }
    DataTable > .datatable--cursor {
        background: #2a2520;
    }
    #status {
        height: 1;
        padding: 0 1;
        background: #1a1814;
        color: #575148;
        dock: bottom;
    }
    """

    BINDINGS = [
        Binding("1", "switch_tab('markets')",    "Markets",    show=True),
        Binding("2", "switch_tab('volatility')", "Volatility", show=True),
        Binding("3", "switch_tab('signals')",    "Signals",    show=True),
        Binding("4", "switch_tab('news')",       "News",       show=True),
        Binding("r", "refresh_all",              "Refresh",    show=True),
        Binding("q", "quit",                     "Quit",       show=True),
    ]

    def compose(self) -> ComposeResult:
        yield Header(show_clock=True)
        with TabbedContent(id="tabs"):
            with TabPane("Markets [1]", id="markets"):
                yield Input(placeholder="/ search markets…", id="market-search")
                yield DataTable(
                    id="markets-table",
                    zebra_stripes=True,
                    cursor_type="row",
                )
            with TabPane("Volatility [2]", id="volatility"):
                yield DataTable(
                    id="vol-table",
                    zebra_stripes=True,
                    cursor_type="row",
                )
            with TabPane("Signals [3]", id="signals"):
                yield DataTable(
                    id="signals-table",
                    zebra_stripes=True,
                    cursor_type="row",
                )
            with TabPane("News [4]", id="news"):
                yield DataTable(
                    id="news-table",
                    zebra_stripes=True,
                    cursor_type="row",
                )
        yield Static("connecting…", id="status")
        yield Footer()

    _search_gen: int = 0  # incremented on each new search to cancel stale results

    def on_mount(self) -> None:
        self._init_columns()
        self.set_timer(0.4, self._initial_load)

    def _initial_load(self) -> None:
        asyncio.ensure_future(self._load_markets())
        asyncio.ensure_future(self._load_snapshot())
        asyncio.ensure_future(self._load_news())

    # ── column setup ─────────────────────────────────────────────────────────

    def _init_columns(self) -> None:
        self.query_one("#markets-table", DataTable).add_columns(
            "Ticker", "Title", "Prob", "Spread", "Volume", "Expires",
        )
        self.query_one("#vol-table", DataTable).add_columns(
            "Rank", "Ticker", "Vol 1d", "Vol 7d", "Last", "Expires",
        )
        self.query_one("#signals-table", DataTable).add_columns(
            "Ticker", "Signal", "Prob", "Edge", "Reasons",
        )
        self.query_one("#news-table", DataTable).add_columns(
            "Date", "Headline", "Source",
        )

    # ── data loaders ─────────────────────────────────────────────────────────

    def load_markets(self, search: str = "") -> None:
        self._search_gen += 1
        asyncio.ensure_future(self._load_markets(search, self._search_gen))

    async def _load_markets(self, search: str = "", gen: int = 0) -> None:
        self._set_status("loading markets…")
        try:
            params: dict = {"limit": 300}
            if search:
                params["search"] = search
            data = await _get("/api/markets", params)
            if gen and gen != self._search_gen:
                return  # superseded by a newer search
            markets = data.get("markets", [])

            table = self.query_one("#markets-table", DataTable)
            table.clear()
            for m in markets:
                prob   = m.get("yes_bid") or m.get("last_price") or 0
                spread = m.get("spread") or 0
                vol    = m.get("volume") or 0
                dte    = m.get("days_to_expiry")
                table.add_row(
                    m.get("market_ticker", "—"),
                    (m.get("market_title") or m.get("event_title") or "")[:52],
                    f"{prob * 100:.0f}%",
                    f"{spread * 100:.1f}pp" if spread else "—",
                    f"{int(vol):,}" if vol else "—",
                    f"{dte}d" if dte is not None else "—",
                )
            src = BASE_URL if _find(_CANDLES_PATHS) is None else "offline (parquet)"
            self._set_status(f"{len(markets)} markets  ·  {src}")
        except Exception as exc:
            self._set_status(f"markets error: {exc}")

    async def _load_snapshot(self) -> None:
        try:
            data = await _get("/api/institutional/snapshot")

            # volatility
            ranking = data.get("volatility", {}).get("ranking", [])
            vtable = self.query_one("#vol-table", DataTable)
            vtable.clear()
            for i, v in enumerate(ranking, 1):
                dte = v.get("days_to_expiry")
                vtable.add_row(
                    str(i),
                    v.get("market_ticker", "—"),
                    f"{(v.get('vol_1d') or 0) * 100:+.1f}pp",
                    f"{(v.get('vol_7d') or 0) * 100:+.1f}pp",
                    f"{(v.get('last_price') or 0) * 100:.0f}%",
                    f"{dte}d" if dte is not None else "—",
                )

            # signals
            signals = data.get("signals", [])
            stable = self.query_one("#signals-table", DataTable)
            stable.clear()
            for s in signals:
                reasons = " · ".join(s.get("reasons", []))[:65]
                stable.add_row(
                    s.get("market_ticker", "—"),
                    s.get("signal", "—"),
                    f"{(s.get('yes_bid') or 0) * 100:.0f}%",
                    f"{(s.get('edge') or 0) * 100:+.1f}pp",
                    reasons,
                )
        except Exception as exc:
            self._set_status(f"snapshot error: {exc}")

    async def _load_news(self) -> None:
        try:
            data = await _get("/api/news", {"limit": 60})
            items = data.get("news", [])
            ntable = self.query_one("#news-table", DataTable)
            ntable.clear()
            for item in items:
                date     = str(item.get("published_at") or "")[:10]
                headline = str(item.get("headline") or "")[:72]
                source   = str(item.get("source") or "")[:22]
                ntable.add_row(date, headline, source)
        except Exception as exc:
            self._set_status(f"news error: {exc}")

    # ── events ───────────────────────────────────────────────────────────────

    @on(Input.Changed, "#market-search")
    def _on_search(self, event: Input.Changed) -> None:
        self.load_markets(search=event.value)

    # ── actions ──────────────────────────────────────────────────────────────

    def action_switch_tab(self, tab_id: str) -> None:
        self.query_one("#tabs", TabbedContent).active = tab_id

    def action_refresh_all(self) -> None:
        search = self.query_one("#market-search", Input).value
        self.load_markets(search=search)
        asyncio.ensure_future(self._load_snapshot())
        asyncio.ensure_future(self._load_news())

    def _set_status(self, msg: str) -> None:
        self.query_one("#status", Static).update(msg)


if __name__ == "__main__":
    MacroWireApp().run()
