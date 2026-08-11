import { useState, useEffect, useMemo } from 'react';

import Masthead from '../components/Masthead';
import VolatilityChart from '../components/VolatilityChart';
import ExportBar from '../components/ExportBar';
import {
  fetchVolatilityRanking,
  fetchCandles,
  groupMarketsBySeries,
  formatMarketLabel,
  getCategoryMeta,
} from '../lib/data';
import { runVolatilityAnalysis } from '../lib/volatilityModel';

const SORT_OPTIONS = [
  { id: 'desc', label: 'Highest σ first' },
  { id: 'asc', label: 'Lowest σ first' },
];

export default function VolatilityPage({ markets, selected, onSelect }) {
  const seriesGroups = useMemo(() => groupMarketsBySeries(markets), [markets]);
  const [filterSeries, setFilterSeries] = useState('all');
  const [sortDir, setSortDir] = useState('desc');
  const [ranking, setRanking] = useState([]);
  const [windowDays, setWindowDays] = useState(14);
  const [loadingRank, setLoadingRank] = useState(false);
  const [candles, setCandles] = useState([]);
  const [loadingCandles, setLoadingCandles] = useState(false);
  const [fullCalendar, setFullCalendar] = useState([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/calendar?days_back=400&days_forward=120');
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setFullCalendar(data.events || []);
      } catch { /* keep empty */ }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoadingRank(true);
        // Fetch all series data, not filtered by series
        const data = await fetchVolatilityRanking({ limit: 1000, window: windowDays });
        if (cancelled) return;
        setRanking(data.ranking || []);
      } catch {
        if (!cancelled) setRanking([]);
      } finally {
        if (!cancelled) setLoadingRank(false);
      }
    })();
    return () => { cancelled = true; };
  }, [windowDays]);

  const marketByTicker = useMemo(
    () => Object.fromEntries(markets.map((m) => [m.market_ticker, m])),
    [markets],
  );

  const sortedRows = useMemo(() => {
    let rows = ranking.map((row) => ({
      ...row,
      market: marketByTicker[row.market_ticker] || null,
    }));
    
    // Filter by series if not 'all'
    if (filterSeries !== 'all') {
      rows = rows.filter((row) => row.market?.series_ticker === filterSeries);
    }
    
    rows.sort((a, b) => (sortDir === 'desc' ? b.vol_pp - a.vol_pp : a.vol_pp - b.vol_pp));
    return rows;
  }, [ranking, marketByTicker, sortDir, filterSeries]);

  const seriesGroup = filterSeries !== 'all' 
    ? seriesGroups.find((g) => g.series_ticker === filterSeries)
    : null;
  const seriesMeta = getCategoryMeta(seriesGroup?.category || selected?.category);

  useEffect(() => {
    if (!sortedRows.length) return;
    // Auto-select top contract when filter changes or no selection
    const needsSelection = !selected || (filterSeries !== 'all' && selected?.series_ticker !== filterSeries);
    if (needsSelection) {
      const top = sortedRows[0]?.market;
      if (top) onSelect(top);
    }
  }, [filterSeries, sortedRows, selected, onSelect]);

  useEffect(() => {
    if (!selected?.market_ticker) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setLoadingCandles(true);
        const series = await fetchCandles(selected.market_ticker, 120);
        if (!cancelled) setCandles(series);
      } catch {
        if (!cancelled) setCandles([]);
      } finally {
        if (!cancelled) setLoadingCandles(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selected?.market_ticker]);

  const analysis = useMemo(() => {
    if (!candles.length || !selected) return null;
    return runVolatilityAnalysis(candles, fullCalendar, selected.series_ticker || '', {
      window: windowDays,
    });
  }, [candles, fullCalendar, selected, windowDays]);

  const chartSeries = useMemo(() => {
    if (!analysis) return null;
    return {
      ...analysis,
      series: analysis.series.map((d) => ({ ...d })),
    };
  }, [analysis]);

  const topInSeries = sortedRows[0];
  const garch = analysis?.garch;
  const spreadPremium = analysis?.spreadSignal;

  return (
    <>
      <Masthead market={selected} />

      <div className="app-shell vol-page">
        <header className="vol-page-header panel">
          <div className="dateline" style={{ marginBottom: 8 }}>Volatility by series</div>
          <p className="vol-page-lede">
            Log-odds daily returns, {windowDays}-day realised σ, GARCH(1,1), event-day multipliers,
            and implied σ from the bid/ask spread. Filter by series or view all contracts. Implied above GARCH = vol premium in the spread.
          </p>

          <div className="vol-filters">
            <label className="vol-filter">
              <span>Series Filter</span>
              <select value={filterSeries} onChange={(e) => setFilterSeries(e.target.value)}>
                <option value="all">All Series ({ranking.length} contracts)</option>
                {seriesGroups.map((g) => (
                  <option key={g.series_ticker} value={g.series_ticker}>
                    {g.event_title} ({g.markets.length})
                  </option>
                ))}
              </select>
            </label>

            <label className="vol-filter">
              <span>Sort</span>
              <select value={sortDir} onChange={(e) => setSortDir(e.target.value)}>
                {SORT_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </label>

            {topInSeries && (
              <div className="vol-filter-summary">
                <span className="vol-filter-summary-label">Most volatile in series</span>
                <strong>{formatMarketLabel(topInSeries.market || topInSeries)}</strong>
                <span className="vol-filter-summary-val">{topInSeries.vol_pp.toFixed(2)}pp</span>
              </div>
            )}
          </div>

          <ExportBar kind="volatility" window={windowDays} />
        </header>

        <div className="vol-layout">
          <section className="panel vol-chart-panel">
            {selected ? (
              <>
                <div className="vol-chart-head">
                  <div>
                    <div className="dateline" style={{ color: seriesMeta.color }}>
                      {seriesMeta.label} {filterSeries !== 'all' ? `· ${filterSeries}` : ''}
                    </div>
                    <h2 className="vol-chart-title">{formatMarketLabel(selected)}</h2>
                    <div className="vol-chart-sub">{selected.event_title}</div>
                  </div>
                  {analysis && (
                    <div className="vol-chart-stat">
                      <span className="vol-chart-stat-label">GARCH σ now</span>
                      <span className="vol-chart-stat-value">
                        {analysis.garchNow?.toFixed(2) ?? '—'}pp
                      </span>
                    </div>
                  )}
                </div>

                {analysis && garch && (
                  <div className="vol-summary-grid">
                    <div className="vol-summary-item">
                      <span className="vol-summary-label">GARCH α</span>
                      <span className="vol-summary-val">{garch.alpha.toFixed(3)}</span>
                      <span className="vol-summary-hint">news sensitivity</span>
                    </div>
                    <div className="vol-summary-item">
                      <span className="vol-summary-label">GARCH β</span>
                      <span className="vol-summary-val">{garch.beta.toFixed(3)}</span>
                      <span className="vol-summary-hint">persistence</span>
                    </div>
                    <div className="vol-summary-item">
                      <span className="vol-summary-label">α+β</span>
                      <span className="vol-summary-val">{garch.persistence.toFixed(3)}</span>
                      <span className="vol-summary-hint">{garch.persistence > 0.95 ? 'sticky shocks' : 'fades faster'}</span>
                    </div>
                    <div className="vol-summary-item">
                      <span className="vol-summary-label">Implied σ</span>
                      <span className="vol-summary-val">{analysis.implied?.toFixed(2) ?? '—'}pp</span>
                      <span className="vol-summary-hint">from spread / 2Δ</span>
                    </div>
                    <div className="vol-summary-item">
                      <span className="vol-summary-label">Implied − GARCH</span>
                      <span className="vol-summary-val" style={{ color: spreadPremium > 0 ? 'var(--accent)' : 'var(--green)' }}>
                        {spreadPremium != null ? `${spreadPremium >= 0 ? '+' : ''}${spreadPremium.toFixed(2)}pp` : '—'}
                      </span>
                      <span className="vol-summary-hint">{spreadPremium > 0 ? 'vol premium' : 'implied ≤ realised'}</span>
                    </div>
                  </div>
                )}

                {loadingCandles ? (
                  <div className="vol-chart-empty">Loading chart…</div>
                ) : (
                  <VolatilityChart analysis={chartSeries} window={windowDays} market={selected} />
                )}

                {analysis && Object.keys(analysis.eventMultipliers).length > 0 && (
                  <div className="vol-event-table-wrap">
                    <p className="dateline" style={{ marginBottom: 8 }}>Event vol multipliers (from your history)</p>
                    <table className="vol-table vol-event-table">
                      <thead>
                        <tr>
                          <th>Release</th>
                          <th>Days</th>
                          <th>Multiplier</th>
                          <th>Release σ</th>
                          <th>Baseline σ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Object.entries(analysis.eventMultipliers).map(([id, s]) => (
                          <tr key={id}>
                            <td>{id.toUpperCase()}</td>
                            <td className="vol-table-rank">{s.n}</td>
                            <td className="vol-table-vol">{s.multiplier.toFixed(2)}×</td>
                            <td>{s.releaseVolPp.toFixed(2)}pp</td>
                            <td>{s.baselineVolPp.toFixed(2)}pp</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <div className="vol-chart-empty">Select a contract from the table.</div>
            )}
          </section>

          <section className="panel vol-table-panel">
            <div className="vol-table-head">
              <span className="dateline">
                {filterSeries === 'all' ? 'All Contracts' : 'Contracts in Series'}
              </span>
              <span className="vol-table-count">
                {loadingRank ? 'Loading…' : `${sortedRows.length} contracts`}
              </span>
            </div>

            <div className="vol-table-wrap">
              <table className="vol-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Contract</th>
                    <th>{windowDays}d σ</th>
                    <th>YES</th>
                    <th>Vol</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRows.map((row, i) => {
                    const m = row.market;
                    const active = selected?.market_ticker === row.market_ticker;
                    return (
                      <tr
                        key={row.market_ticker}
                        className={active ? 'vol-table-row-active' : ''}
                        onClick={() => m && onSelect(m)}
                      >
                        <td className="vol-table-rank">{String(i + 1).padStart(2, '0')}</td>
                        <td>
                          <div className="vol-table-label">{formatMarketLabel(m || row)}</div>
                          <div className="vol-table-ticker">{row.market_ticker}</div>
                        </td>
                        <td className="vol-table-vol">{row.vol_pp.toFixed(2)}pp</td>
                        <td>{m?.yes_ask != null ? `${(m.yes_ask * 100).toFixed(0)}¢` : '—'}</td>
                        <td>{row.volume ? `${(row.volume / 1000).toFixed(1)}K` : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!loadingRank && !sortedRows.length && (
                <div className="vol-chart-empty">No volatility data for this series.</div>
              )}
            </div>
          </section>
        </div>
      </div>

      <style>{`
        .vol-summary-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
          gap: 12px;
          margin-bottom: 16px;
          padding: 12px;
          background: var(--paper2);
          border: 1px solid var(--rule);
        }
        .vol-summary-item { display: flex; flex-direction: column; gap: 2px; }
        .vol-summary-label {
          font-family: var(--sans); font-size: 9px; text-transform: uppercase;
          letter-spacing: 0.08em; color: var(--ink3);
        }
        .vol-summary-val { font-family: var(--mono); font-size: 16px; font-weight: 600; color: var(--ink); }
        .vol-summary-hint { font-family: var(--serif); font-size: 10px; font-style: italic; color: var(--ink3); }
        .vol-event-table-wrap { margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--rule); }
        .vol-event-table { margin-top: 0; }
      `}</style>
    </>
  );
}
