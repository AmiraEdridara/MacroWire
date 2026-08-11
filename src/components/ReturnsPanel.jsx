import { useState, useMemo } from 'react';
import { positionPnl } from '../lib/data';

export default function ReturnsPanel({ market, candles }) {
  const [size, setSize] = useState(100);
  const [side, setSide] = useState('yes');
  const [entryDate, setEntryDate] = useState(() => candles[Math.floor(candles.length / 2)]?.date ?? '');

  const pnl = useMemo(
    () => positionPnl(candles, entryDate, side, market),
    [candles, entryDate, side, market],
  );

  const isOpen = pnl?.mode === 'open';
  const dollarPnl = pnl ? (size * pnl.pnl_pct) / 100 : null;

  return (
    <div>
      <div className="dateline" style={{ marginBottom: 10 }}>Mark-to-Market</div>

      <div style={{ display: 'flex', gap: 4, marginBottom: 10 }}>
        {['yes', 'no'].map(s => (
          <button
            key={s}
            onClick={() => setSide(s)}
            style={{
              flex: 1,
              padding: '6px 0',
              background: side === s ? 'var(--ink)' : 'transparent',
              color: side === s ? 'var(--paper)' : 'var(--ink3)',
              border: `1px solid ${side === s ? 'var(--ink)' : 'var(--rule)'}`,
              fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600,
              letterSpacing: '0.1em', textTransform: 'uppercase',
              cursor: 'pointer', borderRadius: 2,
            }}
          >
            BUY {s}
          </button>
        ))}
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontFamily: 'var(--sans)', color: 'var(--ink3)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Position size ($)
        </label>
        <input
          type="number"
          value={size}
          onChange={e => setSize(parseFloat(e.target.value) || 0)}
          style={{
            width: '100%', marginTop: 4, padding: '6px 8px',
            background: 'var(--paper2)', border: '1px solid var(--rule)',
            color: 'var(--ink)', outline: 'none', borderRadius: 2,
          }}
        />
      </div>

      <div style={{ marginBottom: 10 }}>
        <label style={{ fontSize: 10, fontFamily: 'var(--sans)', color: 'var(--ink3)' }}>
          Entry date
        </label>
        <select
          value={entryDate}
          onChange={e => setEntryDate(e.target.value)}
          style={{
            width: '100%', marginTop: 4, padding: '5px 6px',
            background: 'var(--paper2)', border: '1px solid var(--rule)',
            color: 'var(--ink)', outline: 'none', borderRadius: 2,
          }}
        >
          {candles.slice().reverse().map(c => (
            <option key={c.date} value={c.date}>{c.date}</option>
          ))}
        </select>
      </div>

      {pnl ? (
        <>
          <Stat label="Entry (ask)" value={`${(pnl.entryPrice * 100).toFixed(1)}¢`} mono />
          <Stat
            label={isOpen ? 'Exit (bid)' : 'Settlement'}
            value={
              isOpen
                ? `${(pnl.exitPrice * 100).toFixed(1)}¢`
                : pnl.settlement === 'yes'
                  ? 'YES'
                  : pnl.settlement === 'no'
                    ? 'NO'
                    : '—'
            }
            mono
          />
          <Stat
            label="Status"
            value={isOpen ? 'Open' : `Settled · ${pnl.settlement?.toUpperCase() || '—'}`}
          />

          {pnl.pnl != null && (
            <>
              <hr className="rule" style={{ margin: '10px 0' }} />

              <div style={{
                fontFamily: 'var(--sans)', fontSize: 9,
                color: 'var(--ink3)', letterSpacing: '0.1em',
                textTransform: 'uppercase', marginBottom: 6,
              }}>
                {isOpen ? 'Current position' : 'Realized P&L'}
              </div>

              <p style={{
                margin: '0 0 8px',
                fontFamily: 'var(--sans)',
                fontSize: 11,
                color: 'var(--ink3)',
                lineHeight: 1.45,
              }}>
                {isOpen
                  ? 'Buy at the ask on entry day, sell at today\'s bid — includes the spread.'
                  : 'Buy at the ask on entry day, hold to settlement at $1 or $0.'}
              </p>

              <Stat
                label="P&L (pts)"
                value={`${pnl.pnl >= 0 ? '+' : ''}${(pnl.pnl * 100).toFixed(2)}¢`}
                mono
                color={pnlColor(pnl.pnl)}
              />
              <Stat
                label="P&L (%)"
                value={`${pnl.pnl_pct >= 0 ? '+' : ''}${pnl.pnl_pct}%`}
                mono
                color={pnlColor(pnl.pnl_pct)}
              />
              <Stat
                label={`On $${size}`}
                value={`${dollarPnl >= 0 ? '+' : '-'}$${Math.abs(dollarPnl).toFixed(2)}`}
                mono
                bold
                color={pnlColor(dollarPnl)}
              />
            </>
          )}
        </>
      ) : (
        <p style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--ink3)', margin: 0 }}>
          Pick an entry date to see P&L.
        </p>
      )}

      {pnl?.mode === 'closed' && pnl.pnl == null ? (
        <p style={{
          marginTop: 10,
          fontFamily: 'var(--sans)',
          fontSize: 11,
          color: 'var(--ink3)',
          fontStyle: 'italic',
        }}>
          Contract is closed but settlement outcome is not in the data.
        </p>
      ) : null}
    </div>
  );
}

function pnlColor(value) {
  if (value > 0) return 'var(--green)';
  if (value < 0) return 'var(--accent)';
  return 'var(--ink3)';
}

function Stat({ label, value, mono, bold, color }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      padding: '3px 0', fontSize: 12,
    }}>
      <span style={{ fontFamily: 'var(--sans)', fontSize: 10, color: 'var(--ink3)', letterSpacing: '0.04em' }}>
        {label}
      </span>
      <span style={{
        fontFamily: mono ? 'var(--mono)' : 'var(--serif)',
        fontWeight: bold ? 700 : 500,
        color: color || 'var(--ink)',
      }}>
        {value}
      </span>
    </div>
  );
}
