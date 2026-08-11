# Calibration: macro-event-driven vs. no-event-shift contracts

**Data:** `/home/amirae/kalshi.duckdb` · `kalshi_markets` + `kalshi_candlesticks`
**Script:** `scripts/calibration_macro_event.py` (reproduces every number below)
**As of:** 2026-06-22

> ⚠️ **2026-06-23 UPDATE — superseded by the backfill below.** The original cut
> ran on a DB that held only `active` snapshots (1,094 inferred-closed contracts,
> 483 labelable). `scripts/backfill_settled_economics.py` added **7,073 settled
> economics markets** (markets 2,992→10,065; +53k candles) carrying the gold-standard
> `result` field. On the larger, properly-settled data **the headline conclusion does
> NOT hold**: G1 macro-moved is *not* better calibrated than no-event contracts, and
> the continuous-market favorite–longshot bias largely washes out. See
> **"v2 — backfilled (2026-06-23)"** at the bottom; the v1 sections below are kept
> for the record.

## Question
Do settled Kalshi contracts calibrate differently when their price was clearly
repriced by a linked macro release (CPI, Core CPI, NFP/Payrolls, U3, FOMC/Fed,
GDP…) than contracts with **no clear event-driven shift** (the continuously-settled
oil / nat-gas / retail-gas markets, plus macro tail strikes that never moved)?

## Method (and why)
- Every `kalshi_markets` row is a stale `active` snapshot, so **settlement is
  inferred from candles**: a contract is settled if `close_time < today`; outcome
  = YES if the last candle **on/before the close date** is ≥0.90, NO if ≤0.10.
  - ⚠️ A delisting artifact prints a `close_prob = 0.0` candle the *day after*
    close for **every** contract (YES winners included). Using it as the outcome
    mislabels ~150 YES winners as NO — the first cut of this analysis hit exactly
    that and showed impossible "90¢ → 26% YES" rows. Fixed by ignoring post-close
    rows.
- Observation price = `close_prob` (market YES probability). Buckets are 10¢-wide.
- **Group split**
  - family by series prefix: **MACRO** (scheduled release) vs **CONTINUOUS** (oil/gas).
  - "price moved" = max single-day |Δprob| in the active window ≥ 0.15.
  - **G1 MACRO_MOVED** = macro & moved → *price moved around a linked macro event*.
  - **G2 MACRO_FLAT** = macro, never moved (dead tail strikes).
  - **G3 CONTINUOUS** = oil / nat-gas / retail-gas. **No-event = G2 + G3.**
- Two complementary calibration views:
  - **View A — day-weighted:** every contract-day is an obs. Rich per-bucket n but
    autocorrelated; a YES-resolver's whole pre-event path counts as YES (inflates
    mid-bucket "underpricing").
  - **View B — per-contract final forecast:** one obs/contract = the last pre-event
    price. Independent obs; this is the cleaner adjudicator.

### Coverage / limitations
- 1,094 contracts closed; 744 traded before close; **483 cleanly labeled**.
- **261 contracts (35%) are unlabelable** — their last candle is mid-range and the
  candle feed never prints a 0/1 settlement (bid/ask also mid). Concentrated in
  fast markets (nat-gas 92, WTI 38, Brent 25) and short-fuse labor prints
  (Payrolls 15, NFP 6). They are dropped, not guessed (a 0.5 cutoff would be
  circular). This trims the most down-to-the-wire **continuous** contracts, so
  G3's true calibration is likely a bit *worse* than shown.
- Samples are small (G1 = 47 contracts). Mid-bucket per-contract cells are noisy.

## Results

### View B — per-contract final forecast (the clean comparison), 10¢+ buckets
| Group | contracts | mean \|actual−pred\| (10¢+) | pattern |
|---|---|---|---|
| **G1 macro, price moved** | 47 | **8.9 pp** | well calibrated; extremes ~perfect (20/20 ≥90¢ → YES, 0/20 ≤10¢ → NO) |
| **No-event (G2+G3)** | 436 | **18.2 pp** | ~2× worse |
| · G2 macro-flat | 172 | 4.9 pp | trivially good — 151/172 are dead ~1¢ tails → NO |
| · G3 continuous | 264 | **19.6 pp** | worst; clear favorite–longshot bias |

**G3 continuous reliability (per-contract):**
```
 bucket   pred%  actual%   gap     #contr
 30-40c    34.8    11.1   -23.7      9
 40-50c    44.7    66.7   +22.0      3
 50-60c    52.5    75.0   +22.5      8
 60-70c    64.2    77.8   +13.6      9
 70-80c    74.2    92.3   +18.2     13
 80-90c    85.7   100.0   +14.3     16
 90-100c   97.6    89.2    -8.5    111   <- overconfident near-certainties
```
Oil/gas daily markets **under-price moderate favorites (40–90¢ resolve YES well
above price)** and are **over-confident at 90¢+ (89% actual vs 98% priced)**.

### View A — day-weighted, 10¢+ aggregate (corroborates, with caveat)
| Group | pred% | actual% | gap | contract-days |
|---|---|---|---|---|
| G1 macro, moved | 61.4 | 75.3 | +13.8 | 2,232 |
| No-event (G2+G3) | 58.7 | 52.0 | −6.8 | 1,882 |
| · G3 continuous | 72.4 | 58.5 | −13.9 | 576 |

G1's large +13.8 is mostly the path artifact (pre-event days of YES-resolvers).
The durable signal that survives both views: **continuous 90¢+ contracts slip
well below their price** (View A 90–100¢ → 74.5% YES; View B → 89.2%).

## Conclusion
1. **Yes — they calibrate differently.** Contracts repriced by a scheduled macro
   release (G1) are roughly **twice as well calibrated** as no-event contracts:
   ~9 pp mean error vs ~18 pp. Once the release lands, the price snaps to a
   confident value that is essentially always right at the extremes.
2. **The miscalibration lives in the continuously-settled markets (G3).** Oil /
   nat-gas / retail-gas exhibit a textbook **favorite–longshot bias**: moderate
   favorites (40–90¢) resolve YES *more* often than priced, while 90¢+
   near-certainties are over-confident and resolve YES only ~89%.
3. **Macro tail strikes (G2)** look "calibrated" only trivially — they sit at ~1¢
   and resolve NO; there's almost no mid-range price at risk.
4. **Trade-relevant takeaway:** the edge is in continuous commodity contracts, not
   the macro-event ones — lean toward buying 50–90¢ favorites and fading 95¢+
   near-locks in daily oil/gas markets. Treat magnitudes as directional given the
   small samples and the 35% of fast-market contracts the candle feed can't settle.

---

# v2 — backfilled (2026-06-23)

**Backfill:** `scripts/backfill_settled_economics.py` pulled every `status=settled`
economics market for the 106 series already in the DB, added a `result` column
(gold-standard 'yes'/'no'), and fetched full daily candle history for each.
Result: **markets 2,992 → 10,065** (7,073 finalized), **candles 181,815 → 234,945**,
**7,072 finalized contracts now carry a real outcome** (3,410 YES / 3,662 NO).

## Why the v1 conclusion broke

Candle-inference (last candle ≥0.90 → YES) was the weak link. Checked against the
real `result` on the 7,072 finalized contracts that have candles:

- **37.1% (2,627) are "ambiguous"** to candle-inference — last candle sits mid-range
  — *even though the real result is known.* v1 silently dropped all of these.
- Of the contracts candle-inference *did* label, **69 were outright mislabeled** vs
  the real result.

The dropped 37% are exactly the down-to-the-wire contracts (fast oil/gas, short-fuse
labor prints, and macro strikes still uncertain at the last pre-event candle). They
are not missing at random, so dropping them biased v1.

## Sample sizes: v1 → v2 (same candle-inferred methodology, more data)

| Group | v1 contracts | v2 contracts |
|---|---|---|
| G1 macro, moved | 47 | 133 |
| G2 macro-flat | 172 | 349 |
| G3 continuous | 264 | 1,518 |

## Calibration — per-contract View B, mean \|actual−pred\| (10¢+)

| Group | v1 (n=47 G1) | v2 candle-inferred | v2 **gold result** (recovers dropped 37%) |
|---|---|---|---|
| **G1 macro, moved** | **8.9 pp** | 18.7 pp | **34.0 pp** (n=150) |
| No-event (G2+G3) | 18.2 pp | 13.6 pp | 26.7 pp (n=2,138) |
| · G2 macro-flat | 4.9 pp | 7.5 pp | 24.9 pp (n=235) |
| · G3 continuous | 19.6 pp | 14.1 pp | 26.9 pp (n=1,903) |

The v1 ordering (**G1 ≪ no-event**, "~2× better") **reverses**: with 3× the data G1
is no better, and on gold-standard results it is *worse* on this metric. Caveat:
per-contract mean \|actual−pred\| is dominated by how many contracts sit mid-range at
their last pre-event candle — event-driven (G1) contracts are mid-range *by
construction* (the release lands at close), which inflates the metric. On a **bucketed
aggregate** basis both groups are close (G1 pred 59.2 / act 65.0, +5.8 pp; no-event
61.7 / 64.1, +2.4 pp) — i.e. nobody has a large edge.

## G3 continuous reliability — the favorite–longshot bias washes out

Result-based, per bucket (n=1,903 contracts vs 264 in v1):

```
 bucket   pred%  actual%   gap     n
 30-40c    34.5    42.5    +8.0    120
 40-50c    44.5    52.4    +7.9    103
 50-60c    54.4    59.6    +5.2     89
 60-70c    64.8    72.6    +7.8    113
 70-80c    74.7    74.8    +0.1    103
 80-90c    84.5    87.8    +3.3    156
 90-100c   96.6    97.9    +1.2    419   <- now well-calibrated
```

v1 reported huge gaps here (50–90¢ resolving +13 to +22 pp above price; 90¢+ at 89%
vs 98% priced). With 7× the contracts the gaps collapse to ~+2 to +8 pp and **90¢+ is
well-calibrated (97.9% vs 96.6%)**. The v1 "textbook favorite–longshot bias" was
small-sample noise (it sat on 111 contracts at 90¢+; now 419).

## Conclusion (v2)

1. **G1 macro-moved does NOT hold up.** Its apparent ~2× calibration edge was a
   47-contract artifact. At 133–150 contracts it is no better than no-event contracts,
   and worse on per-contract absolute error.
2. **The continuous-market mispricing largely disappears with data.** G3 mid-favorites
   resolve only slightly above price (+5 to +8 pp) and 90¢+ near-locks are fine — no
   exploitable favorite–longshot edge at this sample size.
3. **Methodology lesson:** infer-from-candles dropped 37% of *settleable* contracts
   and that drop was outcome-correlated. The `result` column should be the outcome of
   record going forward; `calibration_macro_event.py` should be migrated to read it.
4. **Net:** with the full settled history, settled Kalshi economics contracts are
   broadly well-calibrated in aggregate, and neither "macro-event-driven" nor
   "continuous" markets show a robust, large calibration gap. The earlier edges were
   sample-size mirages.
