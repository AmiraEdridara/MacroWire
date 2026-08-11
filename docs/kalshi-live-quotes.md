# Kalshi live quotes (Activity log)

The **Activity** panel can show bid/ask/last updates in two ways:

| Mode | Needs Kalshi account? | How |
|------|------------------------|-----|
| **Public poll** (default without keys) | **No** | Server polls Kalshi public REST every ~20s |
| **WebSocket** | **Yes** (US API keys) | Real-time ticker stream |

Charts and the watchlist always use **public REST** — no keys required. See [kalshi-without-account.md](./kalshi-without-account.md) if you cannot sign up (e.g. UK).

---

## Option A — No account (public API)

Leave `KALSHI_ACCESS_KEY` empty. Ensure:

```env
KALSHI_PUBLIC_POLL_ENABLED=true
KALSHI_PUBLIC_POLL_INTERVAL_S=20
```

Restart the API. Activity lines are prefixed **Quote (public API)**.

---

## Option B — US account + WebSocket (faster)

## Setup

1. In [Kalshi](https://kalshi.com) → **Account** → **API**, create an API key. Download the **private key** `.pem` file once (you cannot re-download it).

2. Put the key file somewhere outside git, for example:

   ```text
   backend/secrets/kalshi-private.pem
   ```

3. Edit `backend/.env`:

   ```env
   KALSHI_ACCESS_KEY=your-key-id-from-kalshi
   KALSHI_PRIVATE_KEY_PATH=./secrets/kalshi-private.pem
   ```

   Or paste the PEM inline (escape newlines as `\n`):

   ```env
   KALSHI_PRIVATE_KEY_PEM=-----BEGIN RSA PRIVATE KEY-----\n...
   ```

4. **Restart** the API (`uvicorn`). In the server log you should see:

   `Kalshi WebSocket subscribed to N ticker(s)`

5. Reload the site. The Activity panel should fill with live quote lines (not only the “stream off” hint).

## Which markets are streamed?

| Setting | Behavior |
|---------|----------|
| `KALSHI_WS_MARKET_TICKERS` | Comma-separated list (max 40). Use this to pin exact contracts. |
| *(empty)* | Subscribes to `KALSHI_DEFAULT_MARKET_TICKER` (if set) plus up to `KALSHI_WS_MAX_TICKERS` (default 12) from the macro economics watchlist. |

## Verify

```bash
curl -s http://127.0.0.1:8000/api/health | python3 -m json.tool
```

Expect `"kalshi_ws_configured": true` and `"kalshi_ws_worker": true` while the server is running.

## Troubleshooting

- **Hint still shows in Activity** — keys missing, wrong path, or API not restarted after editing `.env`.
- **No quote lines but configured** — macro watchlist may still be loading; check API logs for WebSocket errors or “no tickers to subscribe”.
- **Never commit** `.env` or `.pem` files (see `.gitignore`).
