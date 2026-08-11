import { useMemo } from 'react';
import { performanceStats } from '../lib/data';

/**
 * Path-aware performance of buy-and-hold YES on this contract. Endpoint delta hides
 * the path — funds want time-weighted return, drawdown and a risk-adjusted ratio.
 */
export default function PerformancePanel({ candles }) {
  const stats = useMemo(() => performanceStats(candles), [candles]);

  return (
    <div>
      <div className="dateline" style={{ marginBottom: 10 }}>Performance (hold YES)</div>

      {!stats ? (
        <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--ink3)', margin: 0 }}>
          Not enough price history for performance stats.
        </p>
      ) : (
        <>
          <Row label="Time-weighted return" value={pct(stats.totalReturn)} color={signColor(stats.totalReturn)} bold />
          <Row label="Annualized" value={pct(stats.annualized)} color={signColor(stats.annualized)} />
          <Row label="Max drawdown" value={pct(stats.maxDrawdown)} color="var(--accent)" />
          <Row
            label="Sharpe (ann.)"
            value={stats.sharpe != null ? stats.sharpe.toFixed(2) : '—'}
            color={stats.sharpe != null ? signColor(stats.sharpe) : 'var(--ink3)'}
          />
          <Row label="Up days" value={`${stats.upDayPct}%`} />
          <p style={{
            marginTop: 8, fontFamily: 'var(--serif)', fontStyle: 'italic',
            fontSize: 11, color: 'var(--ink3)', lineHeight: 1.45,
          }}>
            Geometrically-linked daily returns over {stats.days} trading days, treating the
            YES price as the asset. Path-aware — not endpoint-to-endpoint.
          </p>
        </>
      )}
    </div>
  );
}

function pct(v) {
  return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;
}

function signColor(v) {
  if (v > 0) return 'var(--green)';
  if (v < 0) return 'var(--accent)';
  return 'var(--ink)';
}

function Row({ label, value, color, bold }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '3px 0',
    }}>
      <span style={{ fontFamily: 'var(--sans)', fontSize: 10, color: 'var(--ink3)', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{
        fontFamily: 'var(--mono)', fontSize: 13, fontWeight: bold ? 700 : 500,
        color: color || 'var(--ink)',
      }}>
        {value}
      </span>
    </div>
  );
}
