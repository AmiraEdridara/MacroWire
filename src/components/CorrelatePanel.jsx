import { useState, useMemo, useCallback } from 'react';
import { fetchBulkCandles, formatMarketHeadline } from '../lib/data';

function pearson(a, b) {
  const n = a.length;
  if (n < 3) return null;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  return denom ? num / denom : null;
}

export default function CorrelatePanel({ selected, markets, onSelect }) {
  const [open, setOpen] = useState(false);
  const [candles, setCandles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleOpen = useCallback(async () => {
    setOpen(true);
    if (candles.length > 0) return;
    setLoading(true);
    setError(null);
    try {
      const series = await fetchBulkCandles(120, 200);
      setCandles(series);
    } catch (err) {
      setError(err.message || 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [candles.length]);

  const byTicker = useMemo(() => {
    const map = new Map();
    candles.forEach((c) => {
      if (c.close_prob == null) return;
      if (!map.has(c.market_ticker)) map.set(c.market_ticker, new Map());
      map.get(c.market_ticker).set(c.date, +(c.close_prob * 100));
    });
    return map;
  }, [candles]);

  // anchor resolution: exact match first, then fallback to another contract
  // from the same series that IS in the bulk dataset
  const { anchor, anchorTicker, anchorLabel } = useMemo(() => {
    if (!selected?.market_ticker || !byTicker.size) return {};

    const exact = byTicker.get(selected.market_ticker);
    if (exact) return { anchor: exact, anchorTicker: selected.market_ticker, anchorLabel: null };

    // Fallback: find the most data-rich contract from the same series
    if (selected.series_ticker) {
      let best = null;
      byTicker.forEach((dateMap, ticker) => {
        if (ticker.startsWith('0x')) return;
        const m = markets.find((x) => x.market_ticker === ticker);
        if (m?.series_ticker !== selected.series_ticker) return;
        if (!best || dateMap.size > byTicker.get(best.ticker).size) {
          best = { ticker, dateMap };
        }
      });
      if (best) {
        const m = markets.find((x) => x.market_ticker === best.ticker);
        return {
          anchor: best.dateMap,
          anchorTicker: best.ticker,
          anchorLabel: m ? formatMarketHeadline(m) : best.ticker,
        };
      }
    }

    return {};
  }, [selected?.market_ticker, selected?.series_ticker, byTicker, markets]);

  const coMovers = useMemo(() => {
    if (!anchor || !anchorTicker) return [];

    const results = [];
    byTicker.forEach((dateMap, ticker) => {
      if (ticker === anchorTicker) return;
      if (ticker.startsWith('0x')) return;
      const dates = [...anchor.keys()].filter((k) => dateMap.has(k)).sort();
      if (dates.length < 10) return;
      const dA = [], dB = [];
      for (let i = 1; i < dates.length; i++) {
        dA.push(anchor.get(dates[i]) - anchor.get(dates[i - 1]));
        dB.push(dateMap.get(dates[i]) - dateMap.get(dates[i - 1]));
      }
      const r = pearson(dA, dB);
      if (r == null) return;
      const m = markets.find((x) => x.market_ticker === ticker);
      const headline = m ? formatMarketHeadline(m) : ticker;
      results.push({ ticker, r, headline });
    });

    results.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
    return results.slice(0, 10);
  }, [anchor, anchorTicker, byTicker, markets]);

  if (!open) {
    return (
      <button
        type="button"
        onClick={handleOpen}
        style={{
          width: '100%',
          marginTop: 16,
          padding: '14px 16px',
          background: 'rgba(74,111,165,0.07)',
          border: '1px solid rgba(74,111,165,0.3)',
          borderLeft: '3px solid var(--blue)',
          borderRadius: 2,
          cursor: 'pointer',
          textAlign: 'left',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          transition: 'background 0.15s',
        }}
        onMouseEnter={e => e.currentTarget.style.background = 'rgba(74,111,165,0.13)'}
        onMouseLeave={e => e.currentTarget.style.background = 'rgba(74,111,165,0.07)'}
      >
        <div>
          <div style={{
            fontFamily: 'var(--sans)',
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: 'var(--blue)',
            marginBottom: 4,
          }}>
            Correlate
          </div>
          <div style={{
            fontFamily: 'var(--serif)',
            fontSize: 13,
            color: 'var(--ink)',
            lineHeight: 1.3,
          }}>
            See which markets move with this contract
          </div>
        </div>
        <span style={{ color: 'var(--blue)', fontSize: 18, flexShrink: 0 }}>→</span>
      </button>
    );
  }

  return (
    <section className="panel panel-compact" style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <div className="dateline">Markets that move with this</div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          style={{ border: 'none', background: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}
        >
          ×
        </button>
      </div>

      {loading && (
        <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--ink3)' }}>
          Computing correlations…
        </p>
      )}

      {error && (
        <p style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--sans)' }}>{error}</p>
      )}

      {!loading && !error && candles.length > 0 && !anchor && (
        <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--ink3)' }}>
          This contract doesn't have enough trading history for correlation. Try selecting an active market from the Fed, CPI, or unemployment series.
        </p>
      )}

      {!loading && !error && anchorLabel && (
        <p style={{ fontFamily: 'var(--sans)', fontSize: 10, color: 'var(--ink3)', marginBottom: 8, letterSpacing: '0.04em' }}>
          Correlating via: <em>{anchorLabel}</em>
        </p>
      )}

      {!loading && !error && anchor && coMovers.length === 0 && (
        <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--ink3)' }}>
          No co-movers found with sufficient shared history.
        </p>
      )}

      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {coMovers.map((m, i) => (
          <button
            key={m.ticker}
            type="button"
            onClick={() => onSelect(m.ticker)}
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '8px 0',
              background: 'none',
              border: 'none',
              borderTop: i > 0 ? '1px solid var(--rule)' : 'none',
              cursor: 'pointer',
              textAlign: 'left',
              width: '100%',
            }}
          >
            <span style={{
              flexShrink: 0,
              width: 38,
              fontFamily: 'var(--mono)',
              fontSize: 11,
              fontWeight: 700,
              color: m.r > 0 ? 'var(--green)' : 'var(--accent)',
              paddingTop: 2,
            }}>
              {m.r > 0 ? '+' : ''}{m.r.toFixed(2)}
            </span>
            <span style={{
              fontFamily: 'var(--serif)',
              fontSize: 13,
              color: 'var(--ink)',
              lineHeight: 1.35,
            }}>
              {m.headline}
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}
