const TYPE_COLORS = {
  fed:  '#f59e0b',
  cpi:  '#22d3ee',
  jobs: '#34d399',
  pce:  '#a78bfa',
};

export default function ProbTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const pct = (d.prob * 100).toFixed(1);
  const ma  = d.ma != null ? (d.ma * 100).toFixed(1) : null;
  const vol = d.vol != null ? (d.vol * 100).toFixed(2) : null;

  return (
    <div style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border2)',
      borderRadius: 10,
      padding: '12px 16px',
      minWidth: 200,
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 12,
    }}>
      <div style={{ color: 'var(--text2)', marginBottom: 8, fontSize: 11, letterSpacing: '0.06em' }}>
        {d.date}
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ color: 'var(--text2)' }}>YES prob</span>
        <span style={{
          fontWeight: 600,
          color: d.prob >= 0.6 ? 'var(--yes)' : d.prob <= 0.4 ? 'var(--no)' : 'var(--text)',
          fontSize: 15,
        }}>
          {pct}%
        </span>
      </div>

      {ma && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'var(--text2)' }}>7d MA</span>
          <span style={{ color: 'var(--cyan)' }}>{ma}%</span>
        </div>
      )}

      {vol && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'var(--text2)' }}>14d vol</span>
          <span style={{ color: 'var(--purple)' }}>{vol}pp</span>
        </div>
      )}

      {d.vol != null && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
          <span style={{ color: 'var(--text2)' }}>volume</span>
          <span style={{ color: 'var(--text)' }}>{d.volume?.toLocaleString()}</span>
        </div>
      )}

      {d.regime && d.regime !== 'neutral' && (
        <div style={{
          marginTop: 8,
          padding: '4px 8px',
          background: d.regime === 'repricing-up' ? 'rgba(52,211,153,0.12)' : 'rgba(248,113,113,0.12)',
          borderRadius: 6,
          color: d.regime === 'repricing-up' ? 'var(--yes)' : 'var(--no)',
          fontSize: 11,
          letterSpacing: '0.06em',
        }}>
          ⚡ {d.regime === 'repricing-up' ? 'REPRICING UP' : 'REPRICING DOWN'}
        </div>
      )}

      {d.event && (
        <div style={{
          marginTop: 8,
          padding: '6px 8px',
          background: `${TYPE_COLORS[d.event.type] || '#888'}20`,
          borderLeft: `3px solid ${TYPE_COLORS[d.event.type] || '#888'}`,
          borderRadius: '0 6px 6px 0',
          fontSize: 11,
          color: 'var(--text)',
          lineHeight: 1.5,
        }}>
          <strong style={{ color: TYPE_COLORS[d.event.type] }}>{d.event.label}</strong>
          {' — '}{d.event.detail}
        </div>
      )}
    </div>
  );
}
