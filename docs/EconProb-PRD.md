# EconProb PRD (v1.0)

∫  EconProb
Macro Prediction Market Dashboard
Product Requirements Document  ·  v1.0
Document Type
Product Requirements Document (PRD)
Product
EconProb — Macro Prediction Market Dashboard
Version
1.0  (Initial)
Status
Draft
Date
22 May 2026
Prepared By
Claude (Anthropic)
Audience
Engineering, Product, Research, Stakeholders


"A macro-focused lens on Kalshi prices — market-implied probabilities, calendar context, and simple quantitative overlays in one place."

1. Overview
EconProb is a read-only, research-style dashboard that bridges Kalshi prediction market prices with a structured macro economic calendar. It is built for economists, analysts, and informed observers who want to read crowd-implied probabilities next to the scheduled macro releases that drive them — without needing a Kalshi account in many regions.

The product is not a trading application. It does not allow order placement, portfolio management, or account operations. Its sole purpose is presenting Kalshi contract prices (e.g. Fed decisions, CPI brackets) as time series of implied YES probability, with overlays that add analytical context: smoothing, volatility estimation, regime flagging, and event marking.

2. Problem Statement
The gap
Prediction market prices encode genuine crowd forecasts about macro outcomes, but they are typically presented as raw bid/ask snapshots. Connecting those prices to the economic calendar — and understanding how they evolve over time relative to data releases — requires manual work across multiple tools.

What users currently lack
A single view that shows Kalshi YES-probability over time next to the macro events that move it
Simple quant overlays (moving average, rolling volatility, regime flags) without needing Python notebooks
No-account access to Kalshi data in regions where trading is unavailable
A way to compare multiple contracts (Fed hold, CPI bracket, NFP outcome) side by side in a consistent UI

3. Goals & Success Metrics
3.1 Goals
Display time-series of Kalshi-implied YES probability for macro contracts
Layer a macro economic calendar (FOMC, CPI, NFP, PCE dates) on the same time axis
Provide toggle-able quantitative overlays: 7-day MA, 14-day rolling volatility, regime detection, volume bars
Serve data via a cached Python backend so the UI never calls Kalshi directly
Work without a Kalshi account in supported regions (public data endpoints)
Ship an MVP in a single-page React app deployable on Vercel or any static host

3.2 Non-Goals
No trading, order entry, or account management
No user authentication or login
No ML forecasting or predictive models
No paid data sources beyond Kalshi public API
No real-time WebSocket streaming in the MVP (polling acceptable)

3.3 Success Metrics
Metric
Target
Data freshness
Probability series ≤ 5 minutes stale (backend cache TTL)
Initial load time
Dashboard renders in &lt; 2 seconds on a mid-range connection
Market switching
Switching contracts updates chart in &lt; 300ms (client-side)
Calendar coverage
All FOMC, CPI, NFP, PCE dates visible ±90 days
Demo usability
Simulated data mode works fully offline — no backend required
Backend uptime
Python API returns 200 for /api/bundle in ≥ 99% of requests in demo mode

4. User Personas
Persona
Profile
Core Need
The Macro Analyst
Fixed-income or FX desk analyst tracking Fed expectations and inflation surprises
See how market-implied probabilities shift around CPI and FOMC — without switching between Kalshi, Bloomberg, and a spreadsheet
The Economist Researcher
Academic or think-tank economist studying crowd forecasting accuracy
Download or inspect the probability time series next to actual macro release dates to study forecast error patterns
The Informed Observer
Non-professional who follows macro news closely and trades no prediction markets
Quickly understand what the crowd thinks about the next Fed decision, with enough context to assess whether the price makes sense
The Quant Tinkerer
Developer or data scientist exploring prediction market data
Connect the Python backend to their own scripts; inspect the /api/bundle response; extend overlays

5. User Flow
EconProb has no login step. The flow is entirely within a single page:

User opens the app (Vercel URL or localhost:5173)
The left sidebar lists available Kalshi markets grouped by category (Fed Policy, Inflation, Labour, Macro)
Each market card shows the current YES probability and a mini probability bar — fetched from the backend or generated from demo data
User clicks a market — the main chart updates to show the 90-day YES probability time series
The macro calendar strip (top center) shows past and upcoming events; FOMC/CPI/NFP dates appear as vertical reference lines on the chart
User toggles overlays in the right panel: 7-day MA (cyan), 14-day volatility (purple), volume bars
Hovering any chart point shows a tooltip with date, exact probability, MA, vol, volume, regime, and any calendar event on that date
The right panel also shows statistics: 90d change, 30d high/low, regime breakdown
No action required to refresh — backend polling updates data every 5 minutes

6. Feature Specification

Feature / Component
Description
Scope
Priority
Market Selector Sidebar
Lists all available Kalshi contracts grouped by category (Fed, Inflation, Labour, Macro) with live YES% and probability bar
MVP
P0
Probability Time Series Chart
90-day line/area chart of implied YES probability using Recharts; renders within 300ms on market switch
MVP
P0
Macro Calendar Strip
Horizontal scrollable strip of FOMC / CPI / NFP / PCE events, past and future, colour-coded by type
MVP
P0
Calendar Event Overlays
Vertical reference lines on the chart at each event date, matching the colour of the event type
MVP
P0
Chart Tooltip
On hover: date, YES prob, 7d MA, 14d vol, volume, regime, and event detail if present
MVP
P0
7-Day Moving Average
Cyan dashed overlay smoothing the raw probability series; toggle in right panel
MVP
P1
14-Day Rolling Volatility
Purple secondary-axis line showing daily-change standard deviation over 14 days; toggle
MVP
P1
Regime Detection
Flags "repricing-up" or "repricing-down" when 14d probability change exceeds ±8pp; shown in tooltip and stats panel
MVP
P1
Volume Bars
Contract volume as semi-transparent bar chart on secondary axis; toggle
MVP
P2
Statistics Panel
90d change, 30d H/L, 14d vol, 7d MA, regime day counts — updated on market switch
MVP
P1
Contract Info Panel
Ticker, description, resolution date shown in right sidebar
MVP
P1
Demo Mode (Simulated Data)
Fully offline mode using deterministic Brownian-motion price series; enables usage with no backend
MVP
P0
Python FastAPI Backend
Fetches Kalshi API; caches responses for 5 min; exposes /api/markets, /api/bundle/:ticker, /api/calendar
MVP
P0
Response Caching
File-based JSON cache (5 min TTL) so repeated renders do not hammer Kalshi API
MVP
P0
Auth Fallback
If Kalshi requires auth, backend returns curated fallback market list and empty history with informative message
MVP
P1
Kalshi API Key Support
Set KALSHI_API_KEY env var to unlock history and authenticated endpoints
MVP
P1
Market Comparison View
Show two contracts overlaid on the same axis for side-by-side comparison
Post-MVP
—
CSV / JSON Export
Download the probability series for the selected market
Post-MVP
—
User-defined Events
Allow user to annotate the chart with custom event markers
Post-MVP
—
WebSocket Live Feed
Replace polling with a real-time Kalshi WebSocket subscription
Post-MVP
—
Account / Login
User authentication, saved preferences, watchlists
Out of Scope
—
Trading / Order Entry
Placing or cancelling Kalshi orders
Out of Scope
—
ML Forecasting
Predicted probability bands or model-based overlays
Out of Scope
—

7. Technical Architecture
7.1 Stack
Layer
Technology
Rationale
UI Framework
React 18 + Vite
Fast HMR, minimal build config, SPA for single-page layout
Charts
Recharts
Composable React charting with ComposedChart for multi-overlay rendering
Dates
date-fns
Lightweight, tree-shakeable date utilities for series generation
Styling
CSS Variables + inline styles
Zero-dependency design token system; dark terminal aesthetic
Backend
Python FastAPI
Async HTTP, automatic OpenAPI docs, easy deployment on Railway/Render
HTTP Client
httpx (async)
Native async support in FastAPI; handles Kalshi API calls
Caching
File-based JSON (.cache/)
Simple, zero-dependency cache — no Redis needed for MVP
Hosting (UI)
Vercel
One-command deploy; free tier suitable for SPA
Hosting (API)
Railway / Render / Fly.io
Free-tier Python hosting with persistent filesystem for cache
Data Source
Kalshi Public API v2
No account required for public market data in many regions

7.2 Data Flow
React UI starts in demo mode: client-side deterministic Brownian-motion series (no network)
When backend URL is configured, UI polls /api/bundle/:ticker every 5 minutes
/api/bundle returns: Kalshi history series + macro calendar events in one response
Backend checks file cache; if miss, calls Kalshi API, transforms prices to [0,1] probability, writes cache
If Kalshi requires auth and no key is set, backend returns empty series + auth note; UI falls back to demo data
All quant overlays (MA, vol, regime) are computed client-side on the received series

7.3 API Endpoints
Endpoint
Method
Description
/
GET
Health check — returns service name and status
/api/calendar
GET
Returns macro calendar events (FOMC, CPI, NFP, PCE) ±90 days from today
/api/markets
GET
Lists open Kalshi markets; falls back to curated list if auth fails
/api/markets/{ticker}/history
GET
Price history for one contract as time series of YES probability (0–1)
/api/bundle/{ticker}
GET
Combined: history series + calendar events for a single market — primary UI endpoint

7.4 Quant Overlays (Client-Side)
Overlay
Method
Interpretation
7-Day Moving Average
Simple rolling mean (window=7)
Smooths short-term noise; gap between MA and raw price can signal momentum
14-Day Rolling Volatility
Std dev of daily probability changes (window=14)
High vol before a release signals market uncertainty; low vol post-release signals consensus
Regime Detection
14d cumulative change threshold ±8pp
"Repricing-up" or "repricing-down" flags periods of sustained probability shift
Volume Bars
Raw Kalshi contract volume per day
Volume spikes often coincide with calendar events or surprise data releases

8. Component Structure
Component / File
Responsibility
App.jsx
Root: state machine for selected market, overlay toggles, data memoisation; 3-column grid layout
Header.jsx
Sticky top bar: brand, current market ticker, live status dot, date, Kalshi link
MarketSelector.jsx
Left sidebar: markets grouped by category with YES% badge and mini probability bar
CalendarStrip.jsx
Horizontal scrollable strip of macro events; colour-coded by type (Fed=amber, CPI=cyan, NFP=green)
ProbChart.jsx
Main chart: Recharts ComposedChart with area, line, bar, reference lines; renders all active overlays
ProbTooltip.jsx
Custom Recharts tooltip showing date, prob, MA, vol, volume, regime, event detail
StatsPanel.jsx
Right sidebar: stats grid, regime bar chart, overlay toggle switches, contract info
lib/mockData.js
Deterministic series generator using seeded Brownian motion; movingAverage, rollingVol, detectRegimes

9. Macro Calendar Coverage
The calendar covers the following event types. All dates are computed relative to today at runtime, so the ±90d window is always current:

Type
Label
UI Colour
Example Event
fed
FOMC
Amber  (#F59E0B)
Fed holds 5.25–5.50% — June 2025
cpi
CPI
Cyan   (#22D3EE)
CPI 3.5% YoY (est 3.4%) — HOT
jobs
NFP
Green  (#34D399)
Payrolls +303K (est +200K) — BEAT
pce
PCE
Purple (#A78BFA)
Core PCE 2.8% (est 2.7%)

10. Deployment
Frontend (React / Vite)
npm install && npm run dev — local on http://localhost:5173
npm run build — produces dist/ folder
Deploy dist/ to Vercel: npx vercel --prod or connect GitHub repo
No environment variables required in demo mode

Backend (Python FastAPI)
pip install -r requirements.txt
uvicorn main:app --reload --port 8000 — local
Deploy to Railway, Render, or Fly.io — persistent disk needed for .cache/ directory
Optional: set KALSHI_API_KEY env var to unlock authenticated Kalshi endpoints

CORS
Backend is pre-configured to allow http://localhost:5173 and http://localhost:3000
Add your Vercel production URL to CORS origins before deploying

11. Constraints & Risks
Constraint / Risk
Severity
Mitigation
Kalshi API may require auth for history data
Medium
Demo mode with simulated data works fully offline; fallback list returned on 401
Kalshi API is unavailable in some jurisdictions
Medium
Demo mode unblocks all users; real data only requires Kalshi access
Kalshi API schema may change
Low
Backend isolates transformation logic; update one normalisation function
No real-time WebSocket in MVP
Low
5-minute polling is sufficient for research use; WebSocket can be added post-MVP
File cache not suitable for multi-instance hosting
Low
Replace with Redis or SQLite for scaled deployment; MVP single-instance is fine
Not a trading product — legal risk if misread as advice
High
Clear "not financial advice" disclaimer in UI and documentation

12. Glossary
Term
Definition
YES Probability
The implied probability that a Kalshi contract resolves YES, derived from the mid-price (price in cents / 100)
Kalshi
A US-regulated prediction market exchange offering contracts on economic, political, and financial outcomes
FOMC
Federal Open Market Committee — the Fed body that sets the federal funds rate
CPI
Consumer Price Index — the primary US inflation measure; released monthly by the BLS
NFP
Non-Farm Payrolls — monthly US jobs report from BLS; a key macro surprise driver
PCE
Personal Consumption Expenditures deflator — the Fed's preferred inflation gauge
Moving Average (MA)
7-day simple rolling mean of the YES probability series; smooths noise
Rolling Volatility
Standard deviation of daily probability changes over a 14-day window; expressed in percentage points
Regime
A labeled period: "repricing-up" (14d cumulative gain &gt; 8pp), "repricing-down" (&lt; −8pp), or "neutral"
Demo Mode
Fully client-side operation using deterministic seeded Brownian-motion price series; no network required
Bundle Endpoint
/api/bundle/:ticker — the primary API call returning history + calendar in one response