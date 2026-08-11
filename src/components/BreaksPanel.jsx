import { format, parseISO } from 'date-fns';
import { detectBreaks, EVENT_COLORS } from '../lib/data';

export default function BreaksPanel({ candles, calendar = [] }) {
  const breaks = detectBreaks(candles, calendar, 0.08);

  if (!breaks.length) {
    return (
      <div>
        <div className="dateline" style={{ marginBottom: 8 }}>Regime Changes</div>
        <div style={{
          padding: '12px 0', textAlign: 'center',
          fontFamily: 'var(--serif)', fontStyle: 'italic',
          color: 'var(--ink3)', fontSize: 13,
        }}>
          No structural breaks detected (±8pp threshold).
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
        <span className="dateline">Regime Changes</span>
        <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)' }}>
          ±8pp · {breaks.length} flag{breaks.length !== 1 ? 's' : ''}
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {breaks.slice().reverse().map((b, i) => {
          const isUp = b.delta > 0;
          const color = isUp ? 'var(--green)' : 'var(--accent)';
          return (
            <div
              key={i}
              style={{
                padding: '8px 10px',
                background: 'var(--paper2)',
                borderLeft: `3px solid ${color}`,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                <span style={{
                  fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--ink)', fontWeight: 600,
                }}>
                  {format(parseISO(b.date), 'd MMM yyyy')}
                </span>
                <span style={{
                  fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 600, color,
                }}>
                  {isUp ? '▲' : '▼'} {Math.abs(b.delta * 100).toFixed(1)}pp
                </span>
              </div>

              <div style={{
                marginTop: 2, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)',
              }}>
                {(b.from_prob * 100).toFixed(1)}¢ → {(b.to_prob * 100).toFixed(1)}¢ ·{' '}
                vol {b.volume.toLocaleString()}
              </div>

              {b.event && (
                <div style={{
                  marginTop: 5,
                  paddingTop: 5,
                  borderTop: '1px dotted var(--rule)',
                  fontFamily: 'var(--serif)', fontStyle: 'italic',
                  fontSize: 11, color: 'var(--ink2)', lineHeight: 1.4,
                }}>
                  <span style={{
                    color: EVENT_COLORS[b.event.series], fontStyle: 'normal',
                    fontFamily: 'var(--sans)', fontSize: 9, fontWeight: 600,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>
                    {b.event.event_name}
                  </span>
                  {' — '}
                  {b.event.actual && <span>{b.event.actual} (est {b.event.forecast})</span>}
                </div>
              )}

              {!b.event && (
                <div style={{
                  marginTop: 4, fontFamily: 'var(--serif)', fontStyle: 'italic',
                  fontSize: 11, color: 'var(--ink3)',
                }}>
                  No nearby release · likely news-driven
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
