# Macro / economics markets only

This implements the product direction described in **[Econ-Prob-Macro-Series-Explanation.pdf](./Econ-Prob-Macro-Series-Explanation.pdf)**.

## Behavior

When `KALSHI_MACRO_ONLY=true` (default):

1. The backend loads Kalshi **series** with `category=Economics` (configurable).
2. For each series it fetches **active** markets via `GET /markets?series_ticker=…`.
3. Multivariate combo markets (`mve_collection_ticker`, sports-style `MULTIGAME` tickers) are dropped.
4. The **watchlist** and **auto-selected default chart** use only those markets, sorted by recent volume.

The **ForexFactory** macro calendar is unchanged and still drives Fed / news day flags on the chart.

Explicit `?market_ticker=` in the URL still loads that contract (user override). Set `KALSHI_DEFAULT_MARKET_TICKER` to pin a default.

## Configuration (`backend/.env`)

| Variable | Default | Meaning |
|----------|---------|---------|
| `KALSHI_MACRO_ONLY` | `true` | Restrict watchlist + default to economics series |
| `KALSHI_SERIES_CATEGORIES` | `Economics` | Comma-separated Kalshi series categories |
| `KALSHI_DEFAULT_MARKET_TICKER` | *(empty)* | Force one market ticker for the main chart |

Set `KALSHI_MACRO_ONLY=false` to restore the old unfiltered Kalshi market list.

## Code

- `backend/app/macro_filter.py` — series discovery and macro market aggregation
- `backend/app/main.py` — cached watchlist uses macro filter
- `backend/app/kalshi_client.py` — default ticker picks macro when enabled

## Regenerate the PDF

```bash
python scripts/generate_macro_explanation_pdf.py
```
