# Using Kalshi data without a Kalshi account (e.g. UK)

Kalshi accounts and API keys are limited to eligible US users. **You do not need an account** for this project’s main features.

## What works with no keys (public REST)

Kalshi’s **public** API base is `https://external-api.kalshi.com/trade-api/v2`. Unauthenticated `GET` requests work for:

- Market lists and market detail (prices, bid/ask)
- Events and series (including `category=Economics` for macro markets)
- Candlesticks (OHLCV history for charts)
- Exchange status

This app uses those endpoints for:

- **Charts** and default market selection
- **Macro watchlist** (economics series only)
- **Activity quotes** via **public REST polling** (~every 20 seconds) when API keys are not set

ForexFactory calendar data is a separate public CSV — also no Kalshi account.

## What needs a US Kalshi API key

Only the **authenticated WebSocket** path (faster, sub-second ticker stream). If you cannot create an account, leave `KALSHI_ACCESS_KEY` empty; the server uses public polling instead.

## Recommended `backend/.env` (no account)

```env
REDIS_URL=redis://127.0.0.1:6379/0

# Leave empty — public REST is enough
KALSHI_ACCESS_KEY=
KALSHI_PRIVATE_KEY_PATH=

KALSHI_MACRO_ONLY=true
KALSHI_SERIES_CATEGORIES=Economics
KALSHI_PUBLIC_POLL_ENABLED=true
KALSHI_PUBLIC_POLL_INTERVAL_S=20
```

Restart the API and open the app. `/api/health` should show:

```json
"kalshi_ws_configured": false,
"kalshi_live_feed_mode": "public_poll"
```

## Legal note

Public market data is still subject to **Kalshi’s terms** and is for research/education in this app — not financial advice. Kalshi may change rate limits or endpoints; respect their documentation.
