import { useMemo } from 'react';
import { differenceInDays, parseISO } from 'date-fns';

import Masthead from '../components/Masthead';
import MarketList from '../components/MarketList';
import CalendarStrip from '../components/CalendarStrip';
import OddsChart from '../components/OddsChart';
import ReturnsPanel from '../components/ReturnsPanel';
import PerformancePanel from '../components/PerformancePanel';
import BreaksPanel from '../components/BreaksPanel';
import NewsAlerts from '../components/NewsAlerts';
import WorkflowPanel from '../components/WorkflowPanel';
import CorrelatePanel from '../components/CorrelatePanel';
import { getCategoryMeta, formatMarketLabel } from '../lib/data';
import { APP_NAME } from '../lib/brand';

export default function MarketsPage({
  markets,
  calendar,
  news,
  selected,
  candles,
  onSelect,
  overlays,
  onToggleOverlay,
  onApplyView,
  onNavigate,
}) {
  const daysToExpiry = useMemo(() => {
    if (!selected?.close_time) return null;
    try {
      return differenceInDays(parseISO(String(selected.close_time).slice(0, 10)), new Date());
    } catch {
      return null;
    }
  }, [selected]);

  const catMeta = getCategoryMeta(selected?.category);

  if (!selected) {
    return (
      <div className="app-shell" style={{ padding: 48, textAlign: 'center', fontFamily: 'var(--serif)', color: 'var(--ink3)' }}>
        No markets found in parquet.
      </div>
    );
  }

  return (
    <>
      <Masthead market={selected} />

      <div className="app-shell">
        <main className="dashboard">
          <aside className="col-markets fade-in">
            <MarketList markets={markets} selected={selected} onSelect={onSelect} />
          </aside>

          <div className="col-main">
            <div className="fade-in-1">
              <CalendarStrip calendar={calendar} markets={markets} />
            </div>

            <article className="panel fade-in-3">
              <div style={{ marginBottom: 16, paddingBottom: 14, borderBottom: '2px solid var(--ink)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
                  <div className="dateline">
                    {catMeta.label} · {selected.series_subtitle || selected.series_ticker}
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    {daysToExpiry != null && (
                      <span className={`tag tag-${catMeta.tone}`}>
                        {daysToExpiry < 7 ? `${daysToExpiry}D LEFT` : `${daysToExpiry}D`}
                      </span>
                    )}
                    <span className="tag">{(selected.status || 'active').toUpperCase()}</span>
                  </div>
                </div>

                <h2 style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 28,
                  fontWeight: 700,
                  color: 'var(--ink)',
                  letterSpacing: '-0.02em',
                  lineHeight: 1.1,
                  marginBottom: 4,
                }}>
                  {selected.event_title}
                </h2>

                <div style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 16,
                  color: 'var(--ink3)',
                }}>
                  <strong style={{ color: 'var(--ink)', fontStyle: 'normal' }}>
                    {formatMarketLabel(selected)}
                  </strong>
                  {' · '}
                  resolves {String(selected.close_time).slice(0, 10)}
                </div>

                <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
                  {Object.entries(overlays).map(([k, v]) => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => onToggleOverlay(k)}
                      style={{
                        padding: '3px 10px',
                        background: v ? 'var(--ink2)' : 'transparent',
                        color: v ? 'var(--paper)' : 'var(--ink3)',
                        border: `1px solid ${v ? 'var(--ink2)' : 'var(--rule)'}`,
                        fontFamily: 'var(--sans)',
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: '0.08em',
                        textTransform: 'uppercase',
                        cursor: 'pointer',
                        borderRadius: 2,
                      }}
                    >
                      {v ? '✓ ' : ''}{k}
                    </button>
                  ))}
                </div>
              </div>

              <OddsChart candles={candles} market={selected} overlays={overlays} calendar={calendar} />

              <div style={{
                marginTop: 18,
                padding: '8px 12px',
                background: 'var(--paper2)',
                borderLeft: '3px solid var(--gold)',
                fontFamily: 'var(--serif)',
                fontStyle: 'italic',
                fontSize: 12,
                color: 'var(--ink3)',
                lineHeight: 1.5,
              }}>
                {APP_NAME} is a research viewer. Probabilities from Kalshi parquet snapshots — not financial advice.
              </div>
            </article>

            <div className="bottom-panels bottom-panels-3 fade-in-3">
              <section className="panel panel-compact">
                <ReturnsPanel market={selected} candles={candles} />
              </section>
              <section className="panel panel-compact">
                <PerformancePanel candles={candles} />
              </section>
              <section className="panel panel-compact">
                <BreaksPanel candles={candles} calendar={calendar} />
              </section>
            </div>
          </div>

          <aside className="col-news fade-in-2">
            <NewsAlerts candles={candles} calendar={calendar} news={news} onNavigate={onNavigate} />
            <CorrelatePanel
              selected={selected}
              markets={markets}
              onSelect={(ticker) => {
                const m = markets.find((x) => x.market_ticker === ticker);
                if (m) onSelect(m);
              }}
            />
            <WorkflowPanel
              selected={selected}
              overlays={overlays}
              page="markets"
              onApplyView={onApplyView}
              onSelectMarket={(ticker) => {
                const m = markets.find((x) => x.market_ticker === ticker);
                if (m) onSelect(m);
              }}
            />
          </aside>
        </main>
      </div>
    </>
  );
}
