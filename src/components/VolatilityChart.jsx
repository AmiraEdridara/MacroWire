import { useMemo } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { format, parseISO } from 'date-fns';

export default function VolatilityChart({ analysis, window = 14, market }) {
  const data = useMemo(() => {
    if (!analysis?.series?.length) return [];
    return analysis.series.filter((d) => d.realized_pp != null);
  }, [analysis]);

  if (!data.length) {
    return (
      <div className="vol-chart-empty">
        Not enough history for a {window}-day volatility chart.
      </div>
    );
  }

  const lastHist = analysis.series.filter((d) => d.realized_pp != null).slice(-1)[0];

  return (
    <div>
      <div className="vol-chart-meta">
        <span className="dateline">{window}d realised σ · GARCH(1,1) · log-odds returns</span>
        <span className="vol-chart-latest">
          {lastHist ? `${lastHist.realized_pp.toFixed(2)}pp realised` : '—'}
          {analysis.garchNow != null ? ` · ${analysis.garchNow.toFixed(2)}pp GARCH` : ''}
        </span>
      </div>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke="var(--rule)" strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(d) => format(parseISO(d), 'd MMM')}
            tickLine={false}
            axisLine={{ stroke: 'var(--rule)' }}
            tick={{ fill: 'var(--ink3)', fontSize: 10, fontFamily: 'var(--mono)' }}
            minTickGap={28}
          />
          <YAxis
            tickFormatter={(v) => `${v}pp`}
            tickLine={false}
            axisLine={false}
            width={44}
            tick={{ fill: 'var(--ink3)', fontSize: 10, fontFamily: 'var(--mono)' }}
          />
          <Tooltip content={<VolTooltip window={window} market={market} />} />
          <Legend wrapperStyle={{ fontSize: 10, fontFamily: 'var(--sans)' }} />
          <Line type="monotone" dataKey="realized_pp" stroke="var(--blue)" strokeWidth={2} dot={false} name="Realised σ" connectNulls />
          <Line type="monotone" dataKey="garch_pp" stroke="var(--green)" strokeWidth={1.5} dot={false} name="GARCH σ" connectNulls />
          <Line type="monotone" dataKey="implied_pp" stroke="var(--gold)" strokeWidth={1} strokeDasharray="4 3" dot={false} name="Implied (spread)" connectNulls />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function VolTooltip({ active, payload, window, market }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  return (
    <div className="chart-tooltip">
      <div className="chart-tooltip-date">{format(parseISO(d.date), 'EEE, d MMM yyyy')}</div>
      {market?.market_ticker && (
        <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--accent)', marginBottom: 6 }}>
          {market.market_ticker}
        </div>
      )}
      {d.realized_pp != null && (
        <Row label={`${window}d realised σ`} value={`${d.realized_pp.toFixed(2)}pp`} color="var(--blue)" />
      )}
      {d.garch_pp != null && <Row label="GARCH σ" value={`${d.garch_pp.toFixed(2)}pp`} color="var(--green)" />}
      {d.implied_pp != null && <Row label="Implied σ" value={`${d.implied_pp.toFixed(2)}pp`} color="var(--gold)" />}
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginTop: 4 }}>
      <span style={{ color: 'var(--ink3)' }}>{label}</span>
      <span style={{ color, fontWeight: 600 }}>{value}</span>
    </div>
  );
}
