import { format } from 'date-fns';
import { formatMarketLabel } from '../lib/data';
import { APP_NAME, APP_TAGLINE } from '../lib/brand';

export default function Masthead({ market }) {
  const now = new Date();

  return (
    <header className="site-header">
      <div className="app-shell">
        <div style={{
          borderBottom: '1px solid var(--rule)',
          padding: '8px 0',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: 10,
          color: 'var(--ink3)',
          fontFamily: 'var(--sans)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span className="live-dot" />
            <span>Vol. 1 · No. {String(Math.floor((now - new Date('2026-01-01')) / 86400000) + 1).padStart(3, '0')}</span>
            <span style={{ color: 'var(--rule2)' }}>·</span>
            <span>{format(now, 'EEEE, d MMMM yyyy').toUpperCase()}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span>Snapshot: parquet · 12h cadence</span>
            <span style={{ color: 'var(--rule2)' }}>·</span>
            <span>{format(now, 'HH:mm')} ET</span>
          </div>
        </div>

        <div style={{
          padding: '14px 0 10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-end',
          gap: 32,
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{
                width: 40,
                height: 40,
                borderRadius: 9,
                background: 'var(--ink)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 22,
                color: 'var(--paper)',
                flexShrink: 0,
              }}>
                ∫
              </div>
              <div>
                <h1 style={{
                  fontSize: 44,
                  fontFamily: 'var(--serif)',
                  fontWeight: 700,
                  letterSpacing: '-0.02em',
                  color: 'var(--ink)',
                  lineHeight: 1,
                }}>
                  {APP_NAME}
                </h1>
                <div style={{
                  fontFamily: 'var(--serif)',
                  fontStyle: 'italic',
                  fontSize: 14,
                  color: 'var(--ink3)',
                  marginTop: 2,
                }}>
                  {APP_TAGLINE}
                </div>
              </div>
            </div>
          </div>

          {market && (
            <div style={{
              textAlign: 'right',
              paddingLeft: 24,
              borderLeft: '1px solid var(--rule)',
              maxWidth: 480,
            }}>
              <div className="dateline" style={{ marginBottom: 4 }}>
                CURRENT CONTRACT
              </div>
              <div style={{
                fontFamily: 'var(--mono)',
                fontSize: 11,
                color: 'var(--accent)',
                letterSpacing: '0.04em',
              }}>
                {market.market_ticker}
              </div>
              <div style={{
                fontFamily: 'var(--serif)',
                fontSize: 16,
                color: 'var(--ink)',
                marginTop: 2,
                fontWeight: 600,
              }}>
                {formatMarketLabel(market)}
              </div>
              <div style={{
                fontFamily: 'var(--serif)',
                fontSize: 12,
                color: 'var(--ink3)',
                marginTop: 2,
                fontStyle: 'italic',
              }}>
                {market.event_title}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
