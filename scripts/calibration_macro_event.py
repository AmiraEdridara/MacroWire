#!/usr/bin/env python3
"""
Calibration of settled Kalshi contracts: macro-event-driven vs. no-event-shift.

Question
--------
Do settled Kalshi contracts calibrate differently when their price was clearly
repriced by a linked macro release (CPI, Core CPI, NFP/Payrolls, U3 unemployment,
FOMC/Fed, GDP, PCE...) than contracts that never showed a discrete event-driven
shift (the continuously-settled oil / nat-gas / retail-gas markets, plus macro
tail strikes whose price never moved)?

Method
------
* Settlement is inferred from candlesticks because every row in kalshi_markets is
  a stale "active" snapshot. A contract is SETTLED if close_time < TODAY and it has
  candles; outcome = YES if the last candle close_prob >= 0.90, NO if <= 0.10,
  else dropped as ambiguous.
* Observation unit = one contract-day candle (a market-implied YES probability),
  restricted to the genuine trading window:
      - date >= first date the market traded (volume > 0)   [drop pre-listing zeros]
      - date <  close_time date                             [drop settlement snap]
* price p = close_prob (cents = 100*p). Buckets are 10c wide: [0,10),...,[90,100].
* Per group, per bucket we report:
      predicted = mean price in bucket (what the market said)
      actual    = share of contract-days whose contract resolved YES
      gap       = actual - predicted   (>0 => market underpriced YES)
      n         = contract-days,  contracts = distinct settled markets

Grouping
--------
family type by series prefix:  MACRO (linked to a scheduled macro release) vs
CONTINUOUS (oil / nat-gas / AAA retail gas -- no discrete event).
"price moved" = max single-day |delta close_prob| inside the active window >= JUMP.

  G1 MACRO_MOVED   : macro family AND a clear event-driven jump  -> "price moved
                     around a linked macro event"
  G2 MACRO_FLAT    : macro family, no clear jump (dead tail strikes)
  G3 CONTINUOUS    : oil / gas markets
  "No clear event shift" = G2 + G3.
"""
import duckdb

DB = "/home/amirae/kalshi.duckdb"
TODAY = "2026-06-22"
JUMP = 0.15            # min single-day |dprob| in active window to count as "moved"
YES_HI, NO_LO = 0.90, 0.10

MACRO_FAMS = {
    # CPI complex
    'KXECONSTATCPIYOY','KXECONSTATCORECPIYOY','KXECONSTATCPI','KXECONSTATCPICORE',
    'KXCPI','KXCPICORE','KXUSGASCPI','KXAIRFARECPI','KXSHELTERCPI','KXUSEDCARCPI',
    # labor
    'KXECONSTATU3','KXU3','KXUE','KXPAYROLLS','KXUSNFP',
    # Fed / FOMC
    'KXFED','KXFEDDECISION','KXFEDDISSENT','KXFEDLEADJUNE','KXFEDTWEETS',
    'KXFEDCOMBO','KXDOTPLOT','KXFEDERALCHARGE',
    # growth / other scheduled releases
    'KXHOUSINGSTART','KXUKGDPMOM','KXSAGDPQOQ','KXGDPNOM',
    'KXCBDECISIONBRAZIL','KXCBDECISIONEU',
}

con = duckdb.connect(DB, read_only=True)
con.execute("CREATE TEMP TABLE macro_fam(fam VARCHAR)")
con.executemany("INSERT INTO macro_fam VALUES (?)", [(f,) for f in MACRO_FAMS])

con.execute(f"""
CREATE TEMP TABLE contracts AS
WITH closed AS (
  SELECT market_ticker, series_ticker, close_time,
         regexp_replace(series_ticker,'-.*','') AS fam
  FROM kalshi_markets
  WHERE close_time < TIMESTAMP '{TODAY}'
),
cand AS (
  SELECT cl.market_ticker, cl.fam, cl.close_time, k.date, k.close_prob, k.volume,
         -- last candle ON OR BEFORE the close date; the day-after-close row is a
         -- delisting artifact that resets to 0.0 and must be ignored for outcomes.
         ROW_NUMBER() OVER (
           PARTITION BY k.market_ticker
           ORDER BY (k.date <= CAST(cl.close_time AS DATE)) DESC, k.date DESC
         ) AS rn_last
  FROM kalshi_candlesticks k JOIN closed cl USING(market_ticker)
),
firstact AS (   -- first day the market actually traded
  SELECT market_ticker, MIN(date) AS first_active
  FROM cand WHERE volume > 0 GROUP BY market_ticker
),
outc AS (       -- settlement outcome from last in-window candle
  SELECT market_ticker, close_prob AS last_prob,
         CASE WHEN close_prob >= {YES_HI} THEN 1
              WHEN close_prob <= {NO_LO} THEN 0 ELSE NULL END AS yes
  FROM cand WHERE rn_last = 1
),
active AS (     -- candles inside the genuine trading window
  SELECT c.market_ticker, c.fam, c.close_time, c.date, c.close_prob, c.volume,
         c.close_prob - LAG(c.close_prob) OVER (PARTITION BY c.market_ticker ORDER BY c.date) AS dprob
  FROM cand c JOIN firstact f USING(market_ticker)
  WHERE c.date >= f.first_active
    AND c.date <  CAST(c.close_time AS DATE)
),
jump AS (
  SELECT market_ticker, MAX(ABS(dprob)) AS max_jump
  FROM active GROUP BY market_ticker
)
SELECT a.market_ticker, a.fam, a.close_time, a.date, a.close_prob,
       o.yes,
       (mf.fam IS NOT NULL) AS is_macro,
       COALESCE(j.max_jump,0) AS max_jump,
       (COALESCE(j.max_jump,0) >= {JUMP}) AS moved
FROM active a
JOIN outc o USING(market_ticker)
LEFT JOIN macro_fam mf ON mf.fam = a.fam
LEFT JOIN jump j USING(market_ticker)
WHERE o.yes IS NOT NULL
""")

# assign group label + 10c bucket
con.execute("""
CREATE TEMP TABLE obs AS
SELECT *,
  CASE WHEN is_macro AND moved THEN 'G1_MACRO_MOVED'
       WHEN is_macro            THEN 'G2_MACRO_FLAT'
       ELSE                          'G3_CONTINUOUS' END AS grp,
  CAST(FLOOR(LEAST(close_prob,0.9999)*10) AS INT) AS bkt   -- 0..9 -> 10c buckets
FROM contracts
""")


def bucket_label(b):
    return f"{b*10:>2d}-{b*10+10:>3d}c"


def calib(where, title):
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)
    tot = con.execute(f"""
        SELECT COUNT(*) cd, COUNT(DISTINCT market_ticker) nc, AVG(yes) ybase
        FROM obs WHERE {where}""").fetchone()
    if not tot[0]:
        print("  (no observations)")
        return
    print(f"  contracts={tot[1]}   contract-days={tot[0]}   base YES rate(day-wtd)={tot[2]*100:5.1f}%")
    print(f"  {'bucket':>9} | {'pred%':>6} {'actual%':>7} {'gap(pp)':>8} | {'cont-days':>9} {'#contr':>6}")
    print("  " + "-" * 60)
    rows = con.execute(f"""
        SELECT bkt, AVG(close_prob)*100 pred, AVG(yes)*100 act,
               COUNT(*) n, COUNT(DISTINCT market_ticker) nc
        FROM obs WHERE {where}
        GROUP BY bkt ORDER BY bkt""").fetchall()
    for bkt, pred, act, n, nc in rows:
        gap = act - pred
        star = "  <- 10c+" if bkt >= 1 and abs(gap) >= 5 else ""
        print(f"  {bucket_label(bkt):>9} | {pred:6.1f} {act:7.1f} {gap:+8.1f} | {n:9d} {nc:6d}{star}")
    # aggregate gap over 10c+ buckets (exclude 0-10c dust), day-weighted
    agg = con.execute(f"""
        SELECT AVG(close_prob)*100 pred, AVG(yes)*100 act, COUNT(*) n
        FROM obs WHERE {where} AND bkt >= 1""").fetchone()
    if agg[2]:
        print("  " + "-" * 60)
        print(f"  {'10c+ ALL':>9} | {agg[0]:6.1f} {agg[1]:7.1f} {agg[1]-agg[0]:+8.1f} | {agg[2]:9d}")


print("\n#" * 1, "GROUP SIZES (settled contracts, after cleaning)")
for r in con.execute("""
    SELECT grp, COUNT(DISTINCT market_ticker) contracts, COUNT(*) contract_days,
           AVG(yes)*100 yes_rate_daywtd
    FROM obs GROUP BY grp ORDER BY grp""").fetchall():
    print(f"  {r[0]:16s} contracts={r[1]:4d}  contract-days={r[2]:6d}  dayYES={r[3]:5.1f}%")

print("\n\n##### VIEW A — DAY-WEIGHTED reliability (every contract-day at price p) #####")
print("    answers: of all market-days a group traded at p, how often did the")
print("    contract resolve YES.  Rich per-bucket n, but days are autocorrelated")
print("    and a YES-resolving contract's whole pre-event path counts as YES.")
calib("grp='G1_MACRO_MOVED'",
      "G1  MACRO, PRICE MOVED AROUND THE EVENT  (event-driven)")
calib("grp IN ('G2_MACRO_FLAT','G3_CONTINUOUS')",
      "NO CLEAR EVENT SHIFT  (G2 macro-flat + G3 continuous)")
calib("grp='G2_MACRO_FLAT'",
      "  (detail) G2  MACRO but no clear shift (dead tail strikes)")
calib("grp='G3_CONTINUOUS'",
      "  (detail) G3  CONTINUOUS oil / nat-gas / retail-gas")

# ---------------------------------------------------------------------------
# VIEW B — one observation per contract: the market's FINAL pre-event forecast
# (last active candle strictly before close). Independent obs, no time-weighting.
# ---------------------------------------------------------------------------
con.execute("""
CREATE TEMP TABLE snap AS
SELECT market_ticker, grp, yes, close_prob,
       CAST(FLOOR(LEAST(close_prob,0.9999)*10) AS INT) AS bkt
FROM (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY market_ticker ORDER BY date DESC) rn
  FROM obs
) WHERE rn = 1
""")


def calib_snap(where, title):
    print("\n" + "=" * 78)
    print(title)
    print("=" * 78)
    tot = con.execute(f"SELECT COUNT(*), AVG(yes) FROM snap WHERE {where}").fetchone()
    if not tot[0]:
        print("  (no observations)"); return
    print(f"  contracts={tot[0]}   base YES rate={tot[1]*100:5.1f}%")
    print(f"  {'bucket':>9} | {'pred%':>6} {'actual%':>7} {'gap(pp)':>8} | {'#contr':>6}")
    print("  " + "-" * 47)
    for bkt, pred, act, n in con.execute(f"""
        SELECT bkt, AVG(close_prob)*100, AVG(yes)*100, COUNT(*)
        FROM snap WHERE {where} GROUP BY bkt ORDER BY bkt""").fetchall():
        print(f"  {bucket_label(bkt):>9} | {pred:6.1f} {act:7.1f} {act-pred:+8.1f} | {n:6d}")
    agg = con.execute(f"""
        SELECT AVG(close_prob)*100, AVG(yes)*100, COUNT(*),
               AVG(ABS(yes - close_prob))*100
        FROM snap WHERE {where} AND bkt >= 1""").fetchone()
    if agg[2]:
        print("  " + "-" * 47)
        print(f"  {'10c+ ALL':>9} | {agg[0]:6.1f} {agg[1]:7.1f} {agg[1]-agg[0]:+8.1f} | {agg[2]:6d}"
              f"   (mean |actual-pred| per contract = {agg[3]:.1f}pp)")


print("\n\n##### VIEW B — PER-CONTRACT final pre-event forecast (1 obs/contract) #####")
print("    answers: did the market's last pre-event price predict the outcome.")
print("    independent observations; mid-buckets are thin because by the eve of")
print("    the release most strikes have already converged toward 0/1.")
calib_snap("grp='G1_MACRO_MOVED'",
           "G1  MACRO, PRICE MOVED AROUND THE EVENT  (event-driven)")
calib_snap("grp IN ('G2_MACRO_FLAT','G3_CONTINUOUS')",
           "NO CLEAR EVENT SHIFT  (G2 macro-flat + G3 continuous)")
calib_snap("grp='G2_MACRO_FLAT'", "  (detail) G2  MACRO but no clear shift")
calib_snap("grp='G3_CONTINUOUS'", "  (detail) G3  CONTINUOUS oil / nat-gas / retail-gas")
