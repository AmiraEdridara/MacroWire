import { format, parseISO } from 'date-fns';

const SIGNAL_COLORS = {
  MOVE_SPIKE: 'var(--accent)',
  VOL_ELEVATED: 'var(--gold)',
  PRE_RELEASE_DRIFT: 'var(--green)',
  DRIFT_DOWN: 'var(--accent)',
  LIQUIDITY_SQUEEZE: 'var(--blue)',
  REGIME_FLIP: 'var(--blue)',
};

export default function EventBrief({ brief, loading, error, compact = false, onNavigate }) {
  if (loading) {
    return (
      <section className={compact ? 'panel panel-compact' : 'panel'}>
        <div className="dateline">Event brief</div>
        <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', color: 'var(--ink3)', marginTop: 12, fontSize: compact ? 12 : 14 }}>Generating brief…</p>
      </section>
    );
  }

  if (error) {
    return (
      <section className={compact ? 'panel panel-compact' : 'panel'}>
        <div className="dateline">Event brief</div>
        <p style={{ color: 'var(--accent)', marginTop: 12, fontSize: 13 }}>{error}</p>
      </section>
    );
  }

  if (!brief?.paragraphs?.length) return null;

  const ev = brief.event;
  const titleSize = compact ? 16 : 22;
  const bodySize = compact ? 13 : 15;

  return (
    <section className={compact ? 'panel panel-compact' : 'panel'}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <div className="dateline">Event brief</div>
        {ev && (
          <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)' }}>
            {ev.days_away === 0 ? 'TODAY' : `${ev.days_away}d`}
          </span>
        )}
      </div>

      <h2 style={{ fontFamily: 'var(--serif)', fontSize: titleSize, fontWeight: 700, marginBottom: 8, lineHeight: 1.2 }}>
        {brief.title}
      </h2>

      {ev && (
        <div style={{
          padding: '8px 10px',
          background: 'var(--paper2)',
          borderLeft: '3px solid var(--accent)',
          marginBottom: 14,
          fontFamily: 'var(--sans)',
          fontSize: 11,
          color: 'var(--ink2)',
        }}>
          {ev.event_name} · {ev.date} {ev.time} ET · Est {ev.forecast || '—'} · Prev {ev.previous || '—'}
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 12 }}>
        {brief.paragraphs.slice(0, compact ? 2 : undefined).map((p, i) => (
          <p key={i} style={{ fontFamily: 'var(--serif)', fontSize: bodySize, lineHeight: 1.55, color: 'var(--ink)' }}>
            {i === 0 && !compact ? <span className="drop-cap">{p.charAt(0)}</span> : null}
            {i === 0 && !compact ? p.slice(1) : p}
          </p>
        ))}
      </div>

      {!compact && brief.movers?.length > 0 && (
        <div style={{ marginTop: 16, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
          <div className="dateline" style={{ marginBottom: 8 }}>Related movers</div>
          {brief.movers.map((m) => (
            <div key={m.ticker} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontFamily: 'var(--mono)', fontSize: 11 }}>
              <span style={{ color: 'var(--ink2)' }}>{m.label}</span>
              <span style={{ color: m.week_delta_pp >= 0 ? 'var(--green)' : 'var(--accent)' }}>
                {m.week_delta_pp >= 0 ? '+' : ''}{m.week_delta_pp}pp / 7d
              </span>
            </div>
          ))}
        </div>
      )}
      {compact && onNavigate && (
        <button type="button" onClick={() => onNavigate('briefs')} className="btn-secondary" style={{ marginTop: 10, fontSize: 10, width: '100%' }}>
          Full brief & digest →
        </button>
      )}
    </section>
  );
}

export function SignalsPanel({ signals = [], onSelect }) {
  if (!signals.length) {
    return (
      <section className="panel panel-compact">
        <div className="dateline" style={{ marginBottom: 8 }}>MacroWire signals</div>
        <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--ink3)' }}>
          No active signals above threshold.
        </p>
      </section>
    );
  }

  return (
    <section className="panel panel-compact">
      <div className="dateline" style={{ marginBottom: 10 }}>MacroWire signals</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {signals.map((s) => (
          <button
            key={s.ticker}
            type="button"
            onClick={() => onSelect?.(s.ticker)}
            style={{
              textAlign: 'left',
              padding: '8px 10px',
              background: 'var(--paper2)',
              border: '1px solid var(--rule)',
              borderLeft: `3px solid ${SIGNAL_COLORS[s.signal_type] || 'var(--gold)'}`,
              borderRadius: 2,
              cursor: 'pointer',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
              <span style={{ fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', color: SIGNAL_COLORS[s.signal_type] || 'var(--gold)' }}>
                {s.signal_type.replace(/_/g, ' ')}
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)' }}>{s.score}</span>
            </div>
            <div style={{ fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--ink)', marginTop: 4 }}>{s.label}</div>
            <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)', marginTop: 4 }}>
              {(s.latest_prob * 100).toFixed(1)}% · {s.delta_pp >= 0 ? '+' : ''}{s.delta_pp}pp · {s.regime}
            </div>
            {s.reasons?.[0] && (
              <div style={{ fontFamily: 'var(--sans)', fontSize: 10, color: 'var(--ink3)', marginTop: 4 }}>{s.reasons[0]}</div>
            )}
          </button>
        ))}
      </div>
    </section>
  );
}

export function DigestPanel({ digest, onSendNow, sending }) {
  if (!digest) return null;

  return (
    <section className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div className="dateline">Morning digest</div>
        {onSendNow && (
          <button type="button" disabled={sending} onClick={onSendNow} className="btn-secondary" style={{ fontSize: 10 }}>
            {sending ? 'Sending…' : 'Send to email'}
          </button>
        )}
      </div>
      <h3 style={{ fontFamily: 'var(--serif)', fontSize: 18, marginBottom: 10 }}>{digest.title}</h3>
      {digest.paragraphs.map((p, i) => (
        <p key={i} style={{ fontFamily: 'var(--serif)', fontSize: 14, lineHeight: 1.5, color: 'var(--ink2)', marginBottom: 8 }}>{p}</p>
      ))}
    </section>
  );
}

export function UpcomingEventsList({ events = [] }) {
  if (!events.length) return null;
  return (
    <section className="panel panel-compact">
      <div className="dateline" style={{ marginBottom: 8 }}>Upcoming releases</div>
      {events.map((e) => (
        <div key={`${e.date}-${e.event_name}`} style={{ padding: '6px 0', borderBottom: '1px solid var(--rule)' }}>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 13, fontWeight: 600 }}>{e.event_name}</div>
          <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)' }}>
            {format(parseISO(e.date), 'd MMM')} · {e.days_away}d · est {e.forecast || '—'}
          </div>
        </div>
      ))}
    </section>
  );
}
