#!/usr/bin/env python3
"""Generate PDF: macroeconomics-only product explanation for Econ Prob."""

from pathlib import Path

from fpdf import FPDF

OUT = Path(__file__).resolve().parents[1] / "docs" / "Econ-Prob-Macro-Series-Explanation.pdf"
FONT = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


class Doc(FPDF):
    def footer(self):
        self.set_y(-15)
        self.set_font("DejaVu", size=9)
        self.set_text_color(100, 100, 100)
        self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")


def section(pdf: Doc, title: str, body: str) -> None:
    pdf.set_font("DejaVu", "B", 13)
    pdf.set_text_color(30, 30, 30)
    pdf.multi_cell(0, 8, title)
    pdf.ln(2)
    pdf.set_font("DejaVu", size=11)
    pdf.set_text_color(50, 50, 50)
    pdf.multi_cell(0, 6, body)
    pdf.ln(4)


def main() -> None:
    pdf = Doc()
    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=18)
    pdf.add_font("DejaVu", "", FONT)
    pdf.add_font("DejaVu", "B", FONT_BOLD)
    pdf.add_page()

    pdf.set_font("DejaVu", "B", 20)
    pdf.set_text_color(20, 20, 20)
    pdf.multi_cell(0, 10, "Wanting Only Macroeconomics Series\non the Econ Prob Website")
    pdf.ln(2)
    pdf.set_font("DejaVu", size=11)
    pdf.set_text_color(80, 80, 80)
    pdf.multi_cell(
        0,
        6,
        "A plain-language guide for someone new to the project who has been given the full codebase.",
    )
    pdf.ln(6)

    section(
        pdf,
        "What this project is",
        "Econ Prob is a small web dashboard that combines two kinds of real-world information:\n\n"
        "1. Prediction-market prices from Kalshi — contracts like \"Will the Fed cut rates in June?\" "
        "where the price is roughly a crowd probability (e.g. 67 cents ≈ 67% chance).\n\n"
        "2. A macro economic calendar from ForexFactory — scheduled releases such as CPI, jobs reports, "
        "and FOMC meetings.\n\n"
        "The browser app (src/App.jsx) draws charts and runs simple models (regimes, volatility, "
        "news clustering, etc.) on a time series of probabilities for whichever market you pick. "
        "A Python API (backend/) fetches Kalshi data and the calendar, caches it in Redis, and serves "
        "one bundled JSON payload the frontend polls.\n\n"
        "The header says: \"Kalshi prices & macro calendar.\" That is the intent: economics-focused "
        "probability tracking around macro events.",
    )

    section(
        pdf,
        "How data moves (plain English)",
        "1. You open the site → React calls GET /api/v1/bundle (about every minute when live).\n\n"
        "2. The backend loads one Kalshi market's historical yes-price bars and this week's macro calendar.\n\n"
        "3. It marks each chart day as \"Fed day\" or \"big news day\" by matching calendar dates.\n\n"
        "4. The frontend runs analytics on that chart and shows a horizontal list of markets you can click.\n\n"
        "If the API is down, the app falls back to fake demo data so the UI still works.\n\n"
        "Flow: Kalshi (markets + candlesticks) + ForexFactory (calendar) → Python backend (/api/v1/bundle) "
        "→ React (charts + market ticker strip).",
    )

    section(
        pdf,
        "What \"macroeconomics series\" means on Kalshi",
        "On Kalshi, content is organized in layers:\n\n"
        "• Series — a family of related contracts (e.g. Fed funds rate decisions, CPI prints).\n"
        "• Event — one specific situation (e.g. June 2025 FOMC).\n"
        "• Market — one tradable yes/no contract (e.g. Fed cuts in June 2025 — Yes).\n\n"
        "Macroeconomics series = series about the real economy and policy: inflation, jobs, GDP, "
        "recession, Fed rates, etc.\n\n"
        "Not macro = sports parlays, elections unrelated to economics, entertainment, etc.\n\n"
        "Your product goal: every chart and every name in the market strip should come from those "
        "macro/econ families — not from whatever Kalshi returns first in a giant list.",
    )

    section(
        pdf,
        "What the code does today (the important gap)",
        "The macro calendar is already economics-oriented. ForexFactory events are classified into Fed, "
        "inflation, GDP, employment, etc., and those flags drive isFedDay / isNewsDay on the chart.\n\n"
        "The Kalshi market list is NOT filtered the same way.\n\n"
        "In backend/app/kalshi_client.py:\n"
        "• fetch_markets_up_to() walks paginated /trade-api/v2/markets with no category or series filter.\n"
        "• pick_default_market_ticker() picks the first active market with a non-zero price from that list.\n"
        "• build_watchlist() takes the first N markets from the same list for the ticker strip.\n\n"
        "So in live mode you can easily get a default chart on a sports multi-game contract and a ticker "
        "strip mixing unrelated markets.\n\n"
        "The analytics tabs (HMM, Hawkes, Kalman, etc.) only see numbers over time. They do not know "
        "about macro. If the underlying market is unrelated to economics, the math still runs but the "
        "product story is wrong.",
    )

    section(
        pdf,
        "Why you would want macro-only",
        "Think of the site as a macro research cockpit, not a general Kalshi browser.\n\n"
        "If you allow any market:\n"
        "• Headlines and charts disagree with the brand (\"econ prob\" showing sports).\n"
        "• Calendar overlays (CPI week) may not match the contract you are viewing.\n"
        "• News clustering and event study read as gimmicks on unrelated prices.\n"
        "• Users must hunt for the right tickers.\n\n"
        "If you restrict to macro series:\n"
        "• Every view is about rates, inflation, growth, jobs.\n"
        "• Kalshi moves and ForexFactory events belong together.\n"
        "• Same tools read as \"how does the market react around macro releases?\"\n"
        "• The ticker strip becomes a curated macro watchlist.\n\n"
        "You are not asking for a different app — you are asking for data source selection to match "
        "what the UI copy and calendar already promise.",
    )

    section(
        pdf,
        "Two \"macro\" layers (do not confuse them)",
        "Layer A — Calendar (already macro)\n"
        "backend/app/forexfactory.py → high-impact US macro events → isFedDay / isNewsDay on each chart bar. "
        "This is real macro scheduling data, independent of which Kalshi market is selected.\n\n"
        "Layer B — Kalshi markets (not macro-filtered yet)\n"
        "kalshi_client.py + main.py bundle endpoint → any markets from the generic markets API. "
        "This is what you want to narrow to macro/economics series only.\n\n"
        "The app is half-aligned: macro calendar on top, random Kalshi series underneath.",
    )

    section(
        pdf,
        "What fixing it would mean in this codebase",
        "1. Define an allowlist — Kalshi series_ticker values or categories for macro (Fed, CPI, GDP, "
        "recession, rates, etc.), either hardcoded or from Kalshi's series/events API.\n\n"
        "2. Filter in the backend — When building the watchlist and picking the default market, only "
        "include markets whose series/event passes that filter (in fetch_markets_up_to, build_watchlist, "
        "pick_default_market_ticker).\n\n"
        "3. Optional env config — e.g. KALSHI_DEFAULT_MARKET_TICKER or macro series prefixes in "
        "backend/.env so you can pin a Fed contract without code changes.\n\n"
        "4. Frontend — Mostly unchanged; it already switches markets via ?market_ticker=. It would "
        "just receive a pre-filtered watchlist and sensible default titles.\n\n"
        "You would not need to rewrite the React charts — only which tickers feed them.",
    )

    section(
        pdf,
        "One-sentence summary",
        "This project is built to visualize macro-linked prediction-market probabilities with a real "
        "economic calendar, but today it pulls generic Kalshi markets unless you manually pick a macro "
        "ticker; wanting \"macroeconomics series only\" means filtering Kalshi at the API layer so every "
        "default chart and market chip is an economics/policy contract, which matches the product name "
        "and makes the analytics meaningful.",
    )

    section(
        pdf,
        "Files that matter for this goal",
        "• src/App.jsx — UI, charts, polls /api/v1/bundle, shows market strip\n"
        "• backend/app/main.py — dashboard_bundle merges Kalshi OHLCV + calendar\n"
        "• backend/app/kalshi_client.py — where market list and default ticker are chosen (no macro filter today)\n"
        "• backend/app/forexfactory.py — macro calendar only\n"
        "• backend/.env.example — optional KALSHI_DEFAULT_MARKET_TICKER to force one market",
    )

    pdf.ln(4)
    pdf.set_font("DejaVu", size=9)
    pdf.set_text_color(120, 120, 120)
    pdf.multi_cell(
        0,
        5,
        "Generated for the economic-probability-platform repository. "
        "Implementation of macro-only filtering is a backend market-selection change plus a defined list "
        "of which Kalshi series count as macro.",
    )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    pdf.output(str(OUT))
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
