#!/usr/bin/env python3
"""
Backfill SETTLED/closed economics Kalshi markets + full daily candle history.

Why
---
kalshi_markets currently holds only status='active' snapshots (close_time in the
future or the last ~3 weeks). The calibration analysis therefore had to *infer*
settlement from candles and could cleanly label only 483 of 1,094 contracts.

The /markets endpoint with status=settled returns finalized contracts that carry a
real `result` field ('yes'/'no') -- the gold-standard outcome. This script pulls
every settled market for each economics series already known to the DB, adds a
`result` column, inserts the new market rows, and fetches each one's full daily
candlestick history into kalshi_candlesticks (same schema as the existing rows).

It is idempotent: markets/candles already present are skipped.

After running, rerun:  python scripts/calibration_macro_event.py
"""
import time
import datetime as dt
import duckdb
import httpx

DB = "/home/amirae/kalshi.duckdb"
BASE = "https://external-api.kalshi.com"
# Kalshi candle feed only goes back ~1yr; skip candle fetch for older markets
# (they'd return empty and be dropped by the calibration join anyway).
CANDLE_FLOOR = dt.date(2025, 5, 1)
SLEEP = 0.06

client = httpx.Client(base_url=BASE, timeout=45.0)


def get(path, params, retries=6):
    for i in range(retries):
        r = client.get(path, params=params)
        if r.status_code == 429:
            wait = 2 ** i * 0.5
            print(f"    429 backoff {wait}s")
            time.sleep(wait)
            continue
        r.raise_for_status()
        return r.json()
    return {}


def fp(v):
    if v is None or v == "":
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def ts(s):
    return int(dt.datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp())


def fetch_settled_markets(series):
    out, cursor = [], None
    while True:
        p = {"series_ticker": series, "status": "settled", "limit": 100}
        if cursor:
            p["cursor"] = cursor
        d = get("/trade-api/v2/markets", p)
        b = d.get("markets") or []
        out.extend(b)
        cursor = d.get("cursor") or ""
        if not cursor or not b:
            break
        time.sleep(SLEEP)
    return out


def fetch_candles(series, ticker, open_time, close_time):
    start = ts(open_time)
    end = ts(close_time) + 2 * 86400  # include settlement day
    try:
        d = get(
            f"/trade-api/v2/series/{series}/markets/{ticker}/candlesticks",
            {"start_ts": start, "end_ts": end, "period_interval": 1440},
        )
    except httpx.HTTPError:
        return []
    return d.get("candlesticks") or []


def candle_row(c, ticker, series, event_title, fetched_at):
    end_ts = int(c.get("end_period_ts", 0))
    if not end_ts:
        return None
    date = dt.datetime.fromtimestamp(end_ts, tz=dt.timezone.utc).date()
    price = c.get("price") or {}
    yb = c.get("yes_bid") or {}
    ya = c.get("yes_ask") or {}
    bid = fp(yb.get("close_dollars"))
    ask = fp(ya.get("close_dollars"))
    mid = (bid + ask) / 2 if bid is not None and ask is not None else None
    close = fp(price.get("close_dollars")) or fp(price.get("mean_dollars")) \
        or mid or fp(price.get("previous_dollars"))
    if close is None:
        return None
    opn = fp(price.get("open_dollars")) or close
    hi = fp(price.get("high_dollars")) or fp(ya.get("high_dollars")) or close
    lo = fp(price.get("low_dollars")) or fp(yb.get("low_dollars")) or close
    spread = (ask - bid) * 100 if bid is not None and ask is not None else None
    try:
        vol = int(float(c.get("volume_fp") or 0))
    except ValueError:
        vol = 0
    try:
        oi = int(float(c.get("open_interest_fp") or 0))
    except ValueError:
        oi = 0
    return (ticker, series, event_title, date, opn, close, hi, lo,
            bid, ask, spread, vol, oi, fetched_at)


def main():
    con = duckdb.connect(DB)
    cols = [r[0] for r in con.execute("DESCRIBE kalshi_markets").fetchall()]
    if "result" not in cols:
        con.execute("ALTER TABLE kalshi_markets ADD COLUMN result VARCHAR")
        print("added result column")

    prefixes = [r[0] for r in con.execute(
        "SELECT DISTINCT regexp_replace(series_ticker,'-.*','') "
        "FROM kalshi_markets ORDER BY 1").fetchall()]
    have_mkt = {r[0] for r in con.execute(
        "SELECT market_ticker FROM kalshi_markets").fetchall()}
    have_cand = {r[0] for r in con.execute(
        "SELECT DISTINCT market_ticker FROM kalshi_candlesticks").fetchall()}
    print(f"{len(prefixes)} series, {len(have_mkt)} markets, "
          f"{len(have_cand)} candle tickers already in DB")

    now = dt.datetime.now(dt.timezone.utc)
    new_markets, candle_rows = [], []
    n_settled = n_new = n_candfetch = 0

    for i, series in enumerate(prefixes, 1):
        try:
            mkts = fetch_settled_markets(series)
        except httpx.HTTPError as e:
            print(f"[{i}/{len(prefixes)}] {series}: fetch error {e}")
            continue
        n_settled += len(mkts)
        fresh = [m for m in mkts if m.get("ticker") not in have_mkt]
        print(f"[{i}/{len(prefixes)}] {series}: {len(mkts)} settled, "
              f"{len(fresh)} new")

        for m in mkts:
            tk = m.get("ticker")
            if not tk:
                continue
            ct = m.get("close_time")
            ot = m.get("open_time")
            ev = m.get("event_ticker") or series
            # insert new market row (result is the gold outcome)
            if tk not in have_mkt:
                new_markets.append((
                    now, "economics", ev, ev, m.get("title"), tk,
                    m.get("title"), m.get("status"), ot, ct,
                    fp(m.get("yes_bid")), fp(m.get("yes_ask")),
                    fp(m.get("no_bid")), fp(m.get("no_ask")), None,
                    fp(m.get("last_price")), int(m.get("volume") or 0),
                    int(m.get("open_interest") or 0), fp(m.get("liquidity")),
                    m.get("result"),
                ))
                have_mkt.add(tk)
                n_new += 1
            # fetch candles if missing and within feed window
            if tk in have_cand or not (ot and ct):
                continue
            try:
                cdate = dt.datetime.fromisoformat(ct.replace("Z", "+00:00")).date()
            except ValueError:
                continue
            if cdate < CANDLE_FLOOR:
                continue
            cs = fetch_candles(series, tk, ot, ct)
            n_candfetch += 1
            for c in cs:
                row = candle_row(c, tk, series, m.get("title"), now)
                if row:
                    candle_rows.append(row)
            have_cand.add(tk)
            time.sleep(SLEEP)

        # flush periodically to bound memory / persist progress
        if new_markets:
            con.executemany(
                "INSERT INTO kalshi_markets VALUES "
                "(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)", new_markets)
            new_markets = []
        if candle_rows:
            con.executemany(
                "INSERT INTO kalshi_candlesticks VALUES "
                "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)", candle_rows)
            candle_rows = []

    print(f"\nDONE  settled_seen={n_settled}  new_markets={n_new}  "
          f"candle_fetches={n_candfetch}")
    tot_m = con.execute("SELECT COUNT(*) FROM kalshi_markets").fetchone()[0]
    tot_c = con.execute("SELECT COUNT(*) FROM kalshi_candlesticks").fetchone()[0]
    by_status = con.execute(
        "SELECT status, COUNT(*) FROM kalshi_markets GROUP BY status").fetchall()
    print(f"markets total={tot_m}  candles total={tot_c}  status={by_status}")
    con.close()


if __name__ == "__main__":
    main()
