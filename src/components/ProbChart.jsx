import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer, Area
} from 'recharts';
import { format, parseISO } from 'date-fns';
import ProbTooltip from './ProbTooltip';

const TYPE_COLORS = {
  fed:  '#f59e0b',
  cpi:  '#22d3ee',
  jobs: '#34d399',
  pce:  '#a78bfa',
};

const REGIME_BG = {
  'repricing-up':   'rgba(52,211,153,0.06)',
  'repricing-down': 'rgba(248,113,113,0.06)',
  'neutral': 'transparent',
};

export default function ProbChart({ data, overlays, market }) {
  if (!data?.length) {
    return (
      <div style={{ height: 380, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)' }}>
        <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: 12 }} />
      </div>
    );
  }

  const events = data.filter(d => d.event);
  const latest = data[data.length - 1];

  // Tick formatter: show only some dates
  const tickFormatter = (val) => {
    try { return format(parseISO(val), 'MMM d'); } catch { return val; }
  };

  const probColor = latest.prob >= 0.6 ? '#34d399' : latest.prob <= 0.4 ? '#f87171' : '#f59e0b';

  return (
    <div style={{ width: '100%' }}>
      {/* Chart header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 20 }}>
        <div>
          <div style={{ fontSize: 11, letterSpacing: '0.1em', color: 'var(--text3)', textTransform: 'uppercase', marginBottom: 4 }}>
            implied yes probability
          </div>
          <div style={{ fontFamily: 'Bricolage Grotesque', fontSize: 40, fontWeight: 800, color: probColor, lineHeight: 1 }}>
            {(latest.prob * 100).toFixed(1)}%
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 11, color: 'var(--text3)' }}>
          <div>14d vol: <span style={{ color: 'var(--purple)' }}>{latest.vol ? (latest.vol * 100).toFixed(2) + 'pp' : '—'}</span></div>
          <div style={{ marginTop: 4 }}>regime: <span style={{
            color: latest.regime === 'repricing-up' ? 'var(--yes)' : latest.regime === 'repricing-down' ? 'var(--no)' : 'var(--text3)',
          }}>{latest.regime}</span></div>
        </div>
      </div>

      {/* Main chart */}
      <ResponsiveContainer width="100%" height={320}>
        <ComposedChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={tickFormatter}
            tick={{ fill: 'var(--text3)', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
            tickLine={false}
            axisLine={false}
            interval={Math.floor(data.length / 8)}
          />
          <YAxis
            domain={[0, 1]}
            tickFormatter={v => `${(v * 100).toFixed(0)}%`}
            tick={{ fill: 'var(--text3)', fontSize: 10, fontFamily: 'IBM Plex Mono' }}
            tickLine={false}
            axisLine={false}
            width={36}
          />

          <Tooltip content={<ProbTooltip />} />

          {/* 50% reference */}
          <ReferenceLine y={0.5} stroke="var(--border2)" strokeDasharray="4 4" />

          {/* Event reference lines */}
          {events.map(d => (
            <ReferenceLine
              key={d.date}
              x={d.date}
              stroke={TYPE_COLORS[d.event.type] || '#888'}
              strokeWidth={1}
              strokeDasharray="2 4"
              strokeOpacity={0.7}
            />
          ))}

          {/* Volume bars (bottom layer) */}
          {overlays.volume && (
            <Bar
              dataKey="volume"
              yAxisId="vol"
              fill="rgba(167,139,250,0.18)"
              radius={[2, 2, 0, 0]}
            />
          )}

          {/* Prob area */}
          <Area
            dataKey="prob"
            stroke={probColor}
            strokeWidth={2}
            fill={`${probColor}10`}
            dot={false}
            activeDot={{ r: 4, fill: probColor, strokeWidth: 0 }}
            type="monotone"
          />

          {/* 7d MA overlay */}
          {overlays.ma && (
            <Line
              dataKey="ma"
              stroke="var(--cyan)"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="5 3"
              type="monotone"
            />
          )}

          {/* Volatility secondary axis */}
          {overlays.vol && (
            <Line
              dataKey="vol"
              yAxisId="vol"
              stroke="var(--purple)"
              strokeWidth={1}
              dot={false}
              type="monotone"
              strokeOpacity={0.7}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ display: 'flex', gap: 20, marginTop: 12, flexWrap: 'wrap' }}>
        <LegendItem color={probColor} label="YES prob" />
        {overlays.ma && <LegendItem color="var(--cyan)" label="7d MA" dashed />}
        {overlays.vol && <LegendItem color="var(--purple)" label="14d vol" />}
        {overlays.volume && <LegendItem color="rgba(167,139,250,0.5)" label="Volume" square />}
        <LegendItem color="var(--amber)" label="FOMC" line />
        <LegendItem color="var(--cyan)" label="CPI" line />
        <LegendItem color="var(--green)" label="NFP" line />
      </div>
    </div>
  );
}

function LegendItem({ color, label, dashed, square, line }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, color: 'var(--text3)', letterSpacing: '0.06em' }}>
      {square ? (
        <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
      ) : line ? (
        <div style={{ width: 16, height: 1, background: color, opacity: 0.7 }} />
      ) : (
        <div style={{
          width: 20, height: 2,
          background: dashed ? `repeating-linear-gradient(90deg, ${color} 0, ${color} 4px, transparent 4px, transparent 8px)` : color,
        }} />
      )}
      {label}
    </div>
  );
}
