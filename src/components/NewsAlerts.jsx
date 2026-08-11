import { format, parseISO, differenceInDays } from 'date-fns';
import { EVENT_COLORS } from '../lib/data';
export default function NewsAlerts({ candles, calendar = [], news = [], onNavigate }) {
  const today = new Date();

  // Generate alerts from candles
  const alerts = [];

  // Large move alert (yesterday)
  if (candles.length >= 2) {
    const latest = candles[candles.length - 1];
    const prev = candles[candles.length - 2];
    const delta = latest.close_prob - prev.close_prob;
    if (Math.abs(delta) >= 0.05) {
      alerts.push({
        type: 'move',
        severity: Math.abs(delta) >= 0.10 ? 'high' : 'medium',
        title: `Large move detected`,
        detail: `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}pp in 24h`,
        date: latest.date,
      });
    }
  }

  // Pre-release alerts (events within 48h)
  calendar.forEach((ev) => {
    const evDate = parseISO(ev.date);
    const daysAway = differenceInDays(evDate, today);
    if (daysAway >= 0 && daysAway <= 2 && !ev.actual) {
      alerts.push({
        type: 'pre',
        severity: 'medium',
        title: `${ev.event_name} in ${daysAway}d`,
        detail: `${ev.time} ET · est ${ev.forecast} · prev ${ev.previous}`,
        date: ev.date,
        series: ev.series,
      });
    }
  });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Alerts */}
      <section>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div className="dateline">Alerts</div>
          {onNavigate && (
            <button type="button" onClick={() => onNavigate('briefs')} style={{ border: 'none', background: 'none', fontFamily: 'var(--sans)', fontSize: 9, color: 'var(--blue)', cursor: 'pointer', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              Briefs →
            </button>
          )}
        </div>
        {alerts.length === 0 ? (
          <div style={{
            padding: '10px 0', textAlign: 'center',
            fontFamily: 'var(--serif)', fontStyle: 'italic',
            color: 'var(--ink3)', fontSize: 12,
          }}>
            No active alerts.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {alerts.map((a, i) => {
              const color = a.severity === 'high' ? 'var(--accent)' : 'var(--gold)';
              const icon = a.type === 'pre' ? '◷' : '▲';
              return (
                <div key={i} style={{
                  padding: '7px 9px',
                  borderLeft: `3px solid ${a.series ? EVENT_COLORS[a.series] : color}`,
                  background: 'var(--paper2)',
                }}>
                  <div style={{
                    fontFamily: 'var(--sans)', fontSize: 10,
                    color, fontWeight: 700,
                    letterSpacing: '0.08em', textTransform: 'uppercase',
                  }}>
                    {icon} {a.title}
                  </div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink2)', marginTop: 2 }}>
                    {a.detail}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* News sidebar */}
      <section>
        <div className="dateline" style={{ marginBottom: 8 }}>Latest Headlines</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {news.slice(0, 8).map((n, i) => (
            <article
              key={i}
              style={{
                padding: '8px 0',
                borderBottom: i < 7 ? '1px solid var(--rule)' : 'none',
              }}
            >
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                fontFamily: 'var(--sans)', fontSize: 9, color: 'var(--ink3)',
                marginBottom: 3, letterSpacing: '0.04em',
              }}>
                <span style={{ fontWeight: 600 }}>{n.source.toUpperCase()}</span>
                <span>{format(parseISO(n.published_at.replace(' ', 'T')), 'd MMM HH:mm')}</span>
              </div>
              <a
                href={n.url || '#'}
                target="_blank"
                rel="noopener"
                style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 13,
                  color: 'var(--ink)',
                  textDecoration: 'none',
                  lineHeight: 1.35,
                  fontWeight: 500,
                  display: 'block',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--accent)'}
                onMouseLeave={e => e.currentTarget.style.color = 'var(--ink)'}
              >
                {n.headline}
              </a>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
