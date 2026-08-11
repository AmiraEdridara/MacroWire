/** Plain-English copy for students, journalists, and research desks. */

export const STORY_TABS = [
  { id: "overview", label: "Market view", step: 1 },
  { id: "calendar", label: "Release calendar", step: 2 },
  { id: "release", label: "Around release", step: 3 },
  { id: "regime", label: "Regime change", step: 4 },
  { id: "returns", label: "Returns & edge", step: 5 },
  { id: "analytics", label: "Analytics", step: 6 },
  { id: "alerts", label: "Alerts", step: 7 },
  { id: "howtoread", label: "How to read", step: 8 },
];

export const OVERLAY_SECTIONS = [
  {
    id: "mood",
    title: "Mood by period",
    badge: "Bear · Neutral · Bull",
    means:
      "Each day is tagged as downside, flat, or upside based on how smoothed odds moved vs a few days earlier. Coloured bands show stretches (e.g. neutral in April, firmer in May). The sidebar badge is only the latest day.",
  },
  {
    id: "smooth",
    title: "Smoothed odds line",
    badge: "Noise filter",
    means:
      "A light smoothing of the raw Kalshi line to see the underlying drift without day-to-day wiggles. Not a forecast — just easier to eyeball trend.",
  },
  {
    id: "vol",
    title: "How jumpy prices are",
    badge: "Volatility lens",
    means:
      "When daily moves in implied probability are larger than usual. Spikes often cluster around macro news. Fixed demo formula, not fitted to this contract.",
  },
  {
    id: "shifts",
    title: "Big level shifts",
    badge: "Step changes",
    means:
      "Days where the market repriced to a new level (not just a one-day wiggle). Useful for spotting when the narrative changed.",
  },
];

export const HOW_TO_READ_SECTIONS = [
  {
    title: "What is this?",
    body:
      "MacroWire is a free macro research viewer. It shows Kalshi contract prices as implied probabilities (YES %), plus a high-impact economic calendar. No login, no paywall — read-only exploration.",
  },
  {
    title: "Reading YES price",
    body:
      "Kalshi quotes YES contracts in cents (0–100¢). 67¢ ≈ 67% implied chance the event happens. Bid and ask show the live two-sided quote; spread is how wide the market is.",
  },
  {
    title: "Story path (tabs)",
    body:
      "1) Market view — quote, history, volume & spread. 2) Release calendar — CPI, Fed, jobs, GDP. 3) Around release — odds ±7 days and event study. 4) Regime change — large one-day reprices tagged to releases. 5) Returns & edge — implied return and P&L scenarios. 6) Analytics — volatility, liquidity, correlation. 7) Alerts — moves, pre-release, headlines.",
  },
  {
    title: "Calendar vs Kalshi",
    body:
      "The calendar is a schedule of macro releases (ForexFactory). Kalshi prices are what traders are willing to pay. Together they answer: “What is priced?” and “What is about to print?”",
  },
  {
    title: "Around release day",
    body:
      "We anchor on the nearest CPI or Fed date on the chart (or the middle of the sample if none). Bars show abnormal moves vs a simple prior average — a textbook-style event study, not a trading signal.",
  },
  {
    title: "Overlays disclaimer",
    body:
      "Regime bands, smoothing, and volatility views use fixed demo parameters. They are not machine-learned from your data and are not investment advice.",
  },
  {
    title: "Data coming from DuckDB",
    body:
      "Kalshi macro series and ForexFactory load into DuckDB, then export to Parquet/JSON for this site — no hand-running fetch in the browser. Until that export is wired, the backend can refresh from API or read cached files.",
  },
  {
    title: "Sharing this page",
    body:
      "This viewer is free with no paywall. Send anyone the page URL (same link after you deploy). They do not need an account to read charts and the guide.",
  },
];
