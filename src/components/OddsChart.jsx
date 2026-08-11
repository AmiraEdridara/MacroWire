import { useMemo } from 'react';
import {
  ComposedChart, Line, Bar, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ResponsiveContainer
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { EVENT_COLORS, rollingVolatility, trimPostSettlementCandles } from '../lib/data';

function ChartTooltip({ active, payload, calendar = [] }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  const event = calendar.find((e) => (e.date || '').slice(0, 10) === d.date);

  return (
    <div style={{
      background: 'var(--paper)',
      border: '1px solid var(--ink2)',
      padding: '10px 14px',
      fontFamily: 'var(--mono)',
      fontSize: 11,
      minWidth: 200,
      boxShadow: '4px 4px 0 rgba(26,24,20,0.08)',
    }}>
      <div style={{
        fontFamily: 'var(--sans)', textTransform: 'uppercase',
        fontSize: 9, letterSpacing: '0.1em', color: 'var(--ink3)',
        marginBottom: 8, fontWeight: 600,
      }}>
        {format(parseISO(d.date), 'EEE, d MMM yyyy')}
      </div>

      <Row label="YES close" value={`${(d.close_prob * 100).toFixed(1)}¢`} bold accent />
      <Row label="High / Low" value={`${(d.high_prob * 100).toFixed(1)} / ${(d.low_prob * 100).toFixed(1)}¢`} />
      <Row label="Bid / Ask" value={`${(d.yes_bid * 100).toFixed(1)} / ${(d.yes_ask * 100).toFixed(1)}¢`} />
      <Row label="Spread" value={`${(d.spread * 100).toFixed(1)}¢`} />
      <Row label="Volume" value={d.volume.toLocaleString()} />
      {d.vol != null && <Row label="14d Vol" value={`${(d.vol * 100).toFixed(2)}pp`} muted />}

      {event && (
        <div style={{
          marginTop: 8, paddingTop: 8,
          borderTop: '1px solid var(--rule)',
          fontFamily: 'var(--serif)', fontSize: 11, color: 'var(--ink)', lineHeight: 1.4,
        }}>
          <div style={{ color: EVENT_COLORS[event.series], fontFamily: 'var(--sans)', fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', marginBottom: 2 }}>
            {event.event_name.toUpperCase()}
          </div>
          {event.actual && (
            <span><strong>{event.actual}</strong> (est {event.forecast})</span>
          )}
          {!event.actual && (
            <span style={{ color: 'var(--ink3)', fontStyle: 'italic' }}>upcoming · est {event.forecast}</span>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value, bold, accent, muted }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, marginBottom: 3 }}>
      <span style={{ color: 'var(--ink3)' }}>{label}</span>
      <span style={{
        color: accent ? 'var(--accent)' : muted ? 'var(--ink3)' : 'var(--ink)',
        fontWeight: bold ? 600 : 400,
      }}>{value}</span>
    </div>
  );
}

export default function OddsChart({ candles, market, overlays, calendar = [] }) {
  const data = useMemo(
    () => rollingVolatility(trimPostSettlementCandles(candles), 14),
    [candles],
  );

  if (!data?.length) {
    return <div className="skeleton" style={{ height: 320 }} />;
  }

  const latest = data[data.length - 1];
  const first = data[0];
  const change = latest.close_prob - first.close_prob;
  const probColor = latest.close_prob >= 0.6 ? 'var(--green)' : latest.close_prob <= 0.3 ? 'var(--accent)' : 'var(--ink)';

  // Mark only the major *scheduled releases* (legend series), high-impact, and
  // never speeches — otherwise the full ForexFactory calendar barcodes the plot.
  // One marker per date (FOMC prints Statement + Press Conf + Funds Rate same day).
  const MAJOR_EVENTS = ['fed', 'cpi', 'nfp', 'pce'];
  const dataDates = new Set(data.map((d) => d.date));
  const seenDate = new Set();
  const relevantEvents = calendar
    .map((e) => ({ ...e, date: (e.date || '').slice(0, 10) }))
    .filter((e) => {
      if (!MAJOR_EVENTS.includes(e.series)) return false;
      if ((e.impact || '').trim().toLowerCase() !== 'high') return false;
      const name = (e.event_name || '').toLowerCase();
      if (name.includes('speak') || name.includes('member') || name.includes('testif')) return false;
      if (!dataDates.has(e.date)) return false;
      if (seenDate.has(e.date)) return false;
      seenDate.add(e.date);
      return true;
    });

  return (
    <div>
      {/* Hero stat */}
      <div style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 24,
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: '1px solid var(--rule)',
      }}>
        <div>
          <div className="dateline" style={{ marginBottom: 4 }}>
            Implied YES Probability
          </div>
          <div style={{
            fontFamily: 'var(--serif)',
            fontSize: 56,
            fontWeight: 700,
            color: probColor,
            lineHeight: 0.95,
            letterSpacing: '-0.03em',
          }}>
            {(latest.close_prob * 100).toFixed(1)}¢
          </div>
          <div style={{
            marginTop: 4,
            fontFamily: 'var(--mono)',
            fontSize: 12,
            color: change >= 0 ? 'var(--green)' : 'var(--accent)',
          }}>
            {change >= 0 ? '▲' : '▼'} {Math.abs(change * 100).toFixed(2)}pp · 90d
          </div>
        </div>

        <div style={{ textAlign: 'right' }}>
          <Row label="Bid" value={`${(latest.yes_bid * 100).toFixed(1)}¢`} />
          <Row label="Ask" value={`${(latest.yes_ask * 100).toFixed(1)}¢`} />
          <Row label="Spread" value={`${(latest.spread * 100).toFixed(1)}¢`} muted />
          <Row label="Volume" value={latest.volume.toLocaleString()} muted />
        </div>
      </div>

      {/* Main chart */}
      <ResponsiveContainer width="100%" height={300}>
        <ComposedChart data={data} margin={{ top: 8, right: 0, bottom: 0, left: -4 }}>
          <defs>
            <linearGradient id="probFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={probColor} stopOpacity={0.28} />
              <stop offset="85%" stopColor={probColor} stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid stroke="var(--rule)" strokeDasharray="2 4" vertical={false} />

          <XAxis
            dataKey="date"
            tickFormatter={v => { try { return format(parseISO(v), 'd MMM'); } catch { return v; } }}
            tickLine={false}
            interval={Math.floor(data.length / 8)}
          />
          <YAxis
            yAxisId="prob"
            domain={[0, 1]}
            tickFormatter={v => `${(v * 100).toFixed(0)}¢`}
            tickLine={false}
            width={40}
          />
          {overlays.volume && (
            <YAxis
              yAxisId="vol"
              orientation="right"
              tickFormatter={v => (v >= 1000 ? `${(v/1000).toFixed(0)}K` : v)}
              tickLine={false}
              width={40}
            />
          )}

          <Tooltip content={<ChartTooltip calendar={calendar} />} cursor={{ stroke: 'var(--ink2)', strokeDasharray: '2 4' }} />

          {/* 50% line */}
          <ReferenceLine yAxisId="prob" y={0.5} stroke="var(--ink4)" strokeDasharray="4 6" />

          {/* Event lines — majors only, subtle, with a small ticker label */}
          {relevantEvents.map(ev => (
            <ReferenceLine
              key={ev.date + ev.event_name}
              yAxisId="prob"
              x={ev.date}
              stroke={EVENT_COLORS[ev.series] || 'var(--ink3)'}
              strokeWidth={1.2}
              strokeOpacity={0.45}
              strokeDasharray="3 5"
              label={{
                value: ev.series.toUpperCase(),
                position: 'insideTop',
                fontSize: 8,
                fontFamily: 'var(--sans)',
                fill: EVENT_COLORS[ev.series] || 'var(--ink3)',
                opacity: 0.8,
              }}
            />
          ))}

          {/* Volume bars */}
          {overlays.volume && (
            <Bar yAxisId="vol" dataKey="volume" fill="rgba(74,107,63,0.25)" />
          )}

          {/* Spread overlay area */}
          {overlays.spread && (
            <Area
              yAxisId="prob"
              type="monotone"
              dataKey="spread"
              stroke="var(--gold)"
              fill="rgba(184,134,11,0.15)"
              strokeWidth={1}
            />
          )}

          {/* Gradient fill under the probability line */}
          <Area
            yAxisId="prob"
            type="monotone"
            dataKey="close_prob"
            stroke="none"
            fill="url(#probFill)"
            connectNulls
            isAnimationActive={false}
          />

          {/* Main probability line — the hero of the chart */}
          <Line
            yAxisId="prob"
            type="monotone"
            dataKey="close_prob"
            stroke={probColor}
            strokeWidth={2.75}
            dot={false}
            connectNulls
            activeDot={{ r: 4.5, fill: probColor, stroke: 'var(--paper)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div style={{ marginTop: 12, display: 'flex', gap: 18, flexWrap: 'wrap', fontFamily: 'var(--sans)', fontSize: 9, color: 'var(--ink3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
        <LegendDot color={probColor} label="YES close" />
        {overlays.volume && <LegendDot color="rgba(74,107,63,0.5)" label="Volume" square />}
        {overlays.spread && <LegendDot color="var(--gold)" label="Spread" />}
        <span style={{ color: 'var(--ink4)' }}>· events:</span>
        <LegendDot color={EVENT_COLORS.fed} label="FOMC" dashed />
        <LegendDot color={EVENT_COLORS.cpi} label="CPI" dashed />
        <LegendDot color={EVENT_COLORS.nfp} label="NFP" dashed />
        <LegendDot color={EVENT_COLORS.pce} label="PCE" dashed />
      </div>
    </div>
  );
}

function LegendDot({ color, label, square, dashed }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
      {square ? (
        <span style={{ width: 8, height: 8, background: color, display: 'inline-block' }} />
      ) : dashed ? (
        <span style={{
          width: 14, height: 2, display: 'inline-block',
          background: `repeating-linear-gradient(90deg, ${color} 0 4px, transparent 4px 8px)`,
        }} />
      ) : (
        <span style={{ width: 14, height: 2, background: color, display: 'inline-block' }} />
      )}
      <span>{label}</span>
    </span>
  );
}
