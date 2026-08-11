import { performanceStats } from '../lib/data';

export default function StatsPanel({ data, market, overlays, onToggleOverlay }) {
  if (!data?.length) return null;

  const latest = data[data.length - 1];

  // Path-aware time-weighted return instead of endpoint-to-endpoint delta.
  const perf = performanceStats(data.map((d) => ({ date: d.date, close_prob: d.prob })));

  // 30d high/low
  const slice30 = data.slice(-30);
  const high30 = Math.max(...slice30.map(d => d.prob));
  const low30  = Math.min(...slice30.map(d => d.prob));

  // Count regime days
  const repricingUpDays   = data.filter(d => d.regime === 'repricing-up').length;
  const repricingDownDays = data.filter(d => d.regime === 'repricing-down').length;

  const probColor = latest.prob >= 0.6 ? 'var(--yes)' : latest.prob <= 0.4 ? 'var(--no)' : 'var(--amber)';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Stats grid */}
      <div>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
          Statistics
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Stat label="Current YES" value={`${(latest.prob * 100).toFixed(1)}%`} color={probColor} />
          <Stat label="Time-wtd return" value={perf ? `${perf.totalReturn >= 0 ? '+' : ''}${perf.totalReturn}%` : '—'} color={perf && perf.totalReturn >= 0 ? 'var(--yes)' : 'var(--no)'} />
          <Stat label="Max drawdown" value={perf ? `${perf.maxDrawdown}%` : '—'} color="var(--no)" />
          <Stat label="Sharpe (ann.)" value={perf?.sharpe != null ? perf.sharpe.toFixed(2) : '—'} color="var(--cyan)" />
          <Stat label="30d High"   value={`${(high30 * 100).toFixed(1)}%`} />
          <Stat label="30d Low"    value={`${(low30  * 100).toFixed(1)}%`} />
          <Stat label="14d Vol"    value={latest.vol ? `${(latest.vol * 100).toFixed(2)}pp` : '—'} color="var(--purple)" />
          <Stat label="7d MA"      value={latest.ma  ? `${(latest.ma  * 100).toFixed(1)}%`  : '—'} color="var(--cyan)" />
        </div>
      </div>

      {/* Regime summary */}
      <div>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
          Regime (90d)
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <RegimeBar label="Repricing Up" days={repricingUpDays} total={90} color="var(--yes)" />
          <RegimeBar label="Neutral"      days={90 - repricingUpDays - repricingDownDays} total={90} color="var(--text3)" />
          <RegimeBar label="Repricing ↓"  days={repricingDownDays} total={90} color="var(--no)" />
        </div>
      </div>

      {/* Overlay toggles */}
      <div>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
          Overlays
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OverlayToggle label="7-day moving avg" id="ma" active={overlays.ma} color="var(--cyan)" onToggle={onToggleOverlay} />
          <OverlayToggle label="14d volatility"   id="vol" active={overlays.vol} color="var(--purple)" onToggle={onToggleOverlay} />
          <OverlayToggle label="Volume bars"      id="volume" active={overlays.volume} color="rgba(167,139,250,0.6)" onToggle={onToggleOverlay} />
        </div>
      </div>

      {/* Market info */}
      <div>
        <div style={{ fontSize: 9, letterSpacing: '0.14em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
          Contract
        </div>
        <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.7 }}>
          <div><span style={{ color: 'var(--text3)' }}>Ticker</span> {market?.ticker}</div>
          <div style={{ marginTop: 4 }}>{market?.description}</div>
          <div style={{ marginTop: 8 }}><span style={{ color: 'var(--text3)' }}>Resolves</span> {market?.resolution}</div>
        </div>
      </div>

    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color: color || 'var(--text)', fontFamily: 'IBM Plex Mono' }}>{value}</span>
    </div>
  );
}

function RegimeBar({ label, days, total, color }) {
  const pct = (days / total) * 100;
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>{label}</span>
        <span style={{ fontSize: 10, color }}>{days}d</span>
      </div>
      <div style={{ height: 4, background: 'var(--border)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2 }} />
      </div>
    </div>
  );
}

function OverlayToggle({ label, id, active, color, onToggle }) {
  return (
    <button
      onClick={() => onToggle(id)}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        background: 'transparent', border: 'none', cursor: 'pointer',
        padding: '6px 0', width: '100%', textAlign: 'left',
      }}
    >
      <div style={{
        width: 28, height: 16, borderRadius: 8,
        background: active ? color : 'var(--border2)',
        position: 'relative', flexShrink: 0,
        transition: 'background 0.2s',
      }}>
        <div style={{
          position: 'absolute', top: 2,
          left: active ? 14 : 2,
          width: 12, height: 12,
          borderRadius: '50%',
          background: active ? '#000' : 'var(--text3)',
          transition: 'left 0.2s',
        }} />
      </div>
      <span style={{ fontSize: 11, color: active ? 'var(--text)' : 'var(--text3)', transition: 'color 0.2s' }}>
        {label}
      </span>
    </button>
  );
}
