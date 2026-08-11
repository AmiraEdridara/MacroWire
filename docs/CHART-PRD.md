# Kalshi Single-Market Analytics — Chart PRD (short)

## 1. Purpose

One Kalshi macro contract → static PNG charts for exploratory analysis. No frontend, no live trading.

**Default market:** `KXECONSTATCPI-26APR-T0.7` (April 2026 CPI > 0.7% m/m).

**Run:** `python analytics/single_market_analytics.py` → `analytics/output/<ticker>/` (10 PNGs + `summary.txt`).

From the repo root you can also use `npm run charts` (see [README](../README.md)).

## 2. Shared (stated once)

| Item | Spec |
|------|------|
| **Primary series** | Daily implied YES probability \(p_t\) from Kalshi candlesticks (traded price preferred; else bid/ask mid). |
| **Volume** | Daily contract volume per bar. |
| **Sample start** | First day with non-zero volume (drop quote-only lead-in). |
| **Returns** | \(r_t\) = day-over-day % change in implied YES (used by vol/Bayesian/event-study models). |
| **Macro calendar** | ForexFactory high-impact CSV → Fed days + macro release days (CPI, NFP, GDP, etc.), matched to bar dates. Cached in CSV on `--fetch`. |
| **Chart shell** | 200 DPI PNG, cream canvas, market title in header, smart y-zoom on probability, date-labelled x-axis. |
| **Models** | Fixed demo constants (`math_overlays.py`); not MLE-fitted unless noted. |
| **Summary** | `summary.txt`: ticker, title, bar count, latest prob, regime label, last GARCH vol, regime engine mode. |

## 3. Charts (unique purpose only)

| File | Purpose |
|------|---------|
| `01_overview.png` | **Market story** — Raw implied YES % (line) + daily volume (bars, right axis). No smoothing. |
| `02_hawkes.png` | **Activity clustering** — Hawkes λ(t) vs baseline μ; parameter callout; λ vs probability scatter. Standalone (not a macro-event detector). |
| `03_garch.png` | **Volatility** — GARCH(1,1) annualised vol from daily returns; returns vs σ scatter. Skipped if &lt; 2 return bars. |
| `04_hmm_regimes.png` | **Mood / regime bands** — YES path with Bear / Neutral / Bull bands and current-regime badge. |
| `05_kalman.png` | **Smoothed vs raw** — Raw odds, Kalman line, uncertainty band, gain and residual panels. Secondary view. |
| `06_changepoints.png` | **Sudden level shifts** — Flagged days where pre/post window means diverge (green up, red down). |
| `07_bayesian.png` | **Belief accumulation** — Sequential posterior from 50% prior vs raw path; daily update-magnitude bars. |
| `08_ssm.png` | **Level, trend, forecast** — Observed, Holt level, trend (ℓ + ½b), one-step forecast; 5-bar extrapolation callout. |
| `09_event_study.png` | **Reaction around one day** — AR and CAR in ±10-bar window around anchor (first macro/Fed bar, else midpoint). Skipped if window doesn’t fit. |
| `10_macro_events.png` | **Calendar overlay** — Raw odds + volume; red = Fed day, orange = macro release. Not duplicated on overview, Bayesian, or Hawkes. |

### Regime engine

**Regime changes by period, not one flat label forever.**

- Each day gets Bear / Neutral / Bull.
- Chart 04 colours **stretches** where mood stays the same (e.g. Neutral in April, Bull in early May).
- `summary.txt` **Regime: Bull** = **last day only**, not the whole series.
- **No parameter estimation** from your Kalshi data — means, vols, and transition matrix are fixed constants in code.

| Mode | When | Method |
|------|------|--------|
| **Demo / cached** | Default (`python single_market_analytics.py` without `--fetch`), short history | **3-day Kalman rule:** compare smoothed YES today vs 3 days ago; up enough → Bull, down enough → Bear, else Neutral. |
| **API / live** | `--fetch` with ≥ 30 bars | **3-state HMM + Viterbi** on daily returns — Markov-style decode with **preset** transition/emission matrices (`run_hmm`). |

The web app uses the same split: demo data → 3-day rule; live JSON with enough bars → HMM path.

## 4. Non-goals

- Multi-market portfolio, live streaming, parameter estimation from data, formal inference (p-values).
- ForexFactory flags beyond cached/fetch window (calendar is “this week” on fetch; historical flags may be sparse).

## 5. Success criteria

- One command produces all 10 charts + summary for a real cached macro series.
- Overview and macro chart tell the full price/volume/calendar story without smoothing.
- Regime chart documents both demo (3-day rule) and API (HMM) paths clearly.

See also: `analytics/math_overlays.py` (formulas), `kalshi-single-market-analytics/docs/MATH-PRD.md` (extended math notes).
