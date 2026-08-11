# EconProb — Kalshi Analytics

Dashboard for **YES probability**, **bid/ask**, **spread (pts)**, and **trade volume** across **Economics, Politics, and World** Kalshi markets (macro series ranked first), plus **ForexFactory** calendar overlays and static PNG chart exports ([Chart PRD](docs/CHART-PRD.md)). No InstantDB; the browser loads data via the backend Kalshi REST fetch.

## Quick start

**Terminal 1 — API** (serves `backend/data/kalshi.json`):

```bash
cd backend && pip install -r requirements.txt
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

**Terminal 2 — UI**:

```bash
npm install
npm run dev
```

Open http://localhost:5173

## Static chart exports (single Kalshi market)

Python pipeline in `analytics/` — 10 cream-theme PNGs + `summary.txt` per ticker ([spec](docs/CHART-PRD.md)):

```bash
cd analytics
pip install -r requirements.txt   # or: uv pip install -r requirements.txt
python single_market_analytics.py --ticker KXECONSTATCPI-26APR-T0.7 --fetch
```

From repo root: `npm run charts` or `npm run charts:fetch`.

Outputs land in `analytics/output/<ticker>/`. The web app **Chart exports** tab loads them via `GET /api/charts/{ticker}/…` when the API is running.

## Data

Your colleague’s Parquet pipeline should export JSON into:

`backend/data/kalshi.json`

```json
{
  "markets": [
    {
      "marketId": "fed-hold-jun",
      "ticker": "FED-HOLD-JUN25",
      "label": "Fed holds Jun 25",
      "category": "Fed Policy",
      "description": "...",
      "resolution": "2025-06-15",
      "prob": 0.67,
      "bid": 0.65,
      "ask": 0.69,
      "spread": 4.0,
      "volume": 12000
    }
  ],
  "series_points": [
    {
      "marketId": "fed-hold-jun",
      "date": "2025-05-01",
      "prob": 0.62,
      "bid": 0.60,
      "ask": 0.64,
      "volume": 8000
    }
  ]
}
```

Field names are normalized in `src/lib/kalshi.js` (supports cents 0–100 or fractions 0–1).

## Deploy

- **UI:** `npm run build` → deploy `dist/`
- **API:** run FastAPI + ship updated `kalshi.json` on refresh

Not financial advice — read-only research tool.
