import { useMemo, useState, useEffect } from 'react';
import { format, parseISO, isBefore, differenceInDays } from 'date-fns';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { EVENT_COLORS } from '../lib/data';
import { fetchCandles } from '../lib/data';

// Economic chain map: event type → { direct: [...keywords], downstream: [...keywords] }
const ECONOMIC_CHAINS = {
  fed: {
    label: 'Fed Policy',
    direct: ['fed decision', 'federal funds', 'fomc', 'rate cut', 'rate hike', 'rate change', 'fed funds'],
    downstream: ['cpi', 'inflation', 'unemployment', 'gdp', 'housing', 'mortgage', 'recession', 'rate cuts in'],
  },
  cpi: {
    label: 'Inflation',
    direct: ['cpi', 'consumer price', 'inflation', 'pce', 'core pce'],
    downstream: ['fed decision', 'rate cut', 'rate hike', 'federal funds', 'fomc', 'recession'],
  },
  nfp: {
    label: 'Labour',
    direct: ['payroll', 'nfp', 'nonfarm', 'jobs', 'employment', 'unemployment rate'],
    downstream: ['fed decision', 'rate cut', 'rate hike', 'federal funds', 'recession', 'gdp'],
  },
  gdp: {
    label: 'Growth',
    direct: ['gdp', 'gross domestic', 'growth'],
    downstream: ['recession', 'fed', 'rate cut', 'unemployment', 'cpi'],
  },
  pce: {
    label: 'Inflation',
    direct: ['pce', 'personal consumption', 'core pce'],
    downstream: ['fed', 'rate cut', 'cpi', 'inflation'],
  },
  pmi: {
    label: 'Activity',
    direct: ['pmi', 'ism', 'manufacturing', 'services pmi'],
    downstream: ['gdp', 'recession', 'fed', 'employment'],
  },
};

function linkedContracts(event, markets) {
  const series = (event.series || 'pmi').toLowerCase();
  const chain = ECONOMIC_CHAINS[series] || ECONOMIC_CHAINS.pmi;
  const all = [...(chain.direct || []), ...(chain.downstream || [])];

  const score = (m) => {
    const title = (m.event_title || '').toLowerCase();
    let s = 0;
    for (const kw of chain.direct) if (title.includes(kw)) s += 3;
    for (const kw of chain.downstream) if (title.includes(kw)) s += 1;
    return s;
  };

  return (markets || [])
    .filter(m => score(m) > 0)
    .sort((a, b) => score(b) - score(a))
    .slice(0, 10);
}

function MiniChart({ ticker, market }) {
  const [candles, setCandles] = useState(null);

  useEffect(() => {
    setCandles(null);
    fetchCandles(ticker, 90).then(data => setCandles(data)).catch(() => setCandles([]));
  }, [ticker]);

  if (candles === null) return (
    <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontFamily: 'var(--sans)', fontSize: 11 }}>
      Loading…
    </div>
  );
  if (!candles.length) return (
    <div style={{ height: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink3)', fontFamily: 'var(--sans)', fontSize: 11 }}>
      No candle history available.
    </div>
  );

  const data = candles.map(c => ({ date: c.date, p: +(c.close_prob * 100).toFixed(1) }));
  const latest = data[data.length - 1]?.p;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)', marginBottom: 4 }}>
        {candles.length} days · last <strong style={{ color: 'var(--accent)' }}>{latest}¢</strong>
      </div>
      <ResponsiveContainer width="100%" height={100}>
        <LineChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 0 }}>
          <XAxis dataKey="date" hide />
          <YAxis domain={['auto', 'auto']} hide />
          <Tooltip
            contentStyle={{ background: 'var(--paper)', border: '1px solid var(--rule)', fontSize: 10, fontFamily: 'var(--mono)' }}
            formatter={(v) => [`${v}¢`, 'YES']}
            labelFormatter={(l) => l}
          />
          <Line type="monotone" dataKey="p" stroke="var(--accent)" dot={false} strokeWidth={1.5} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export default function CalendarStrip({ calendar = [], markets = [] }) {
  const today = new Date();
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [selectedTicker, setSelectedTicker] = useState(null);

  const sorted = useMemo(() => {
    const cutoffPast = new Date(today);
    cutoffPast.setDate(cutoffPast.getDate() - 10);
    return [...calendar]
      .filter(ev => parseISO(ev.date) >= cutoffPast)
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [calendar]);

  const contracts = useMemo(
    () => selectedEvent ? linkedContracts(selectedEvent, markets) : [],
    [selectedEvent, markets]
  );

  const selectedMarket = useMemo(
    () => markets.find(m => m.market_ticker === selectedTicker),
    [markets, selectedTicker]
  );

  return (
    <section style={{ background: 'var(--paper)', border: '1px solid var(--rule)', padding: '14px 18px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
        <h2 style={{ fontFamily: 'var(--serif)', fontSize: 18, fontWeight: 700, color: 'var(--ink)', letterSpacing: '-0.01em' }}>
          Macro Release Calendar
        </h2>
        <span className="dateline">Medium + High impact USD events</span>
      </div>

      {/* Event strip */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
        {sorted.map(ev => {
          const evDate = parseISO(ev.date);
          const isPast = isBefore(evDate, today) && differenceInDays(today, evDate) > 0;
          const isTodayEv = format(evDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
          const daysAway = differenceInDays(evDate, today);
          const isImminent = daysAway >= 0 && daysAway <= 2;
          const color = EVENT_COLORS[ev.series] || 'var(--ink3)';
          const isSelected = selectedEvent?.date === ev.date && selectedEvent?.event_name === ev.event_name;

          return (
            <div
              key={ev.date + ev.event_name}
              onClick={() => { setSelectedEvent(isSelected ? null : ev); setSelectedTicker(null); }}
              style={{
                flexShrink: 0, minWidth: 140, padding: '8px 12px',
                background: isSelected ? 'rgba(139,58,30,0.08)' : isPast ? 'var(--paper2)' : isImminent ? 'rgba(139,58,30,0.05)' : 'var(--paper)',
                border: `1px solid ${isSelected ? 'var(--accent)' : isImminent ? 'var(--accent)' : 'var(--rule)'}`,
                borderLeft: `3px solid ${color}`,
                opacity: isPast ? 0.7 : 1,
                position: 'relative', cursor: 'pointer',
              }}
            >
              {isImminent && <div style={{ position: 'absolute', top: 4, right: 6, fontSize: 8, fontFamily: 'var(--sans)', color: 'var(--accent)', fontWeight: 700, letterSpacing: '0.1em' }}>▲ SOON</div>}
              <div className="dateline" style={{ color, marginBottom: 2 }}>{ev.event_name}</div>
              <div style={{ fontFamily: 'var(--serif)', fontWeight: 600, fontSize: 14, color: 'var(--ink)' }}>{format(evDate, 'd MMM')}</div>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 9, color: 'var(--ink3)' }}>{ev.time} ET</div>
              <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px dotted var(--rule)', fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink2)' }}>
                {ev.actual ? (
                  <><div><span style={{ color: 'var(--ink3)' }}>act</span> <strong>{ev.actual}</strong></div><div style={{ color: 'var(--ink3)' }}>est {ev.forecast}</div></>
                ) : (
                  <><div><span style={{ color: 'var(--ink3)' }}>est</span> {ev.forecast || '—'}</div><div style={{ color: 'var(--ink3)' }}>prev {ev.previous || '—'}</div></>
                )}
              </div>
              {isPast && <div style={{ marginTop: 4, fontFamily: 'var(--sans)', fontSize: 8, color: 'var(--ink3)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>· past</div>}
              {isTodayEv && <div style={{ marginTop: 4, fontFamily: 'var(--sans)', fontSize: 8, color: 'var(--accent)', letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700 }}>· today</div>}
            </div>
          );
        })}
      </div>

      {/* Linked contracts panel */}
      {selectedEvent && (
        <div style={{ marginTop: 14, borderTop: '1px solid var(--rule)', paddingTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 10 }}>
            <div>
              <span style={{ fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink2)' }}>
                Contracts linked to {selectedEvent.event_name}
              </span>
              <span style={{ marginLeft: 8, fontFamily: 'var(--sans)', fontSize: 10, color: 'var(--ink3)' }}>
                — direct + economically downstream · click to see chart
              </span>
            </div>
            <span style={{ fontFamily: 'var(--sans)', fontSize: 10, color: 'var(--ink3)', cursor: 'pointer' }} onClick={() => { setSelectedEvent(null); setSelectedTicker(null); }}>✕ close</span>
          </div>

          {contracts.length === 0 ? (
            <p style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--ink3)' }}>No matching contracts found.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {contracts.map(m => {
                const isChartOpen = selectedTicker === m.market_ticker;
                const chain = ECONOMIC_CHAINS[selectedEvent.series] || ECONOMIC_CHAINS.pmi;
                const title = (m.event_title || '').toLowerCase();
                const isDirect = chain.direct.some(kw => title.includes(kw));
                return (
                  <div key={m.market_ticker}>
                    <div
                      onClick={() => setSelectedTicker(isChartOpen ? null : m.market_ticker)}
                      style={{
                        display: 'grid', gridTemplateColumns: '16px 1fr auto auto auto',
                        gap: 10, alignItems: 'center',
                        padding: '7px 10px',
                        background: isChartOpen ? 'rgba(139,58,30,0.06)' : 'var(--paper2)',
                        border: `1px solid ${isChartOpen ? 'var(--accent)' : 'var(--rule)'}`,
                        cursor: 'pointer',
                      }}
                    >
                      <span style={{ fontFamily: 'var(--sans)', fontSize: 8, fontWeight: 700, color: isDirect ? 'var(--accent)' : 'var(--ink3)', letterSpacing: '0.05em' }} title={isDirect ? 'Direct' : 'Downstream'}>
                        {isDirect ? '●' : '○'}
                      </span>
                      <span style={{ fontFamily: 'var(--sans)', fontSize: 12, color: 'var(--ink)' }}>{m.event_title}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)' }}>{m.market_ticker}</span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 700, color: 'var(--accent)', minWidth: 32, textAlign: 'right' }}>
                        {m.yes_bid != null ? `${(m.yes_bid * 100).toFixed(0)}¢` : '—'}
                      </span>
                      <span style={{ fontFamily: 'var(--sans)', fontSize: 9, color: isChartOpen ? 'var(--accent)' : 'var(--ink3)' }}>
                        {isChartOpen ? '▲' : '▼'}
                      </span>
                    </div>

                    {isChartOpen && (
                      <div style={{ padding: '10px 12px', background: 'var(--paper)', border: '1px solid var(--rule)', borderTop: 'none' }}>
                        <div style={{ fontFamily: 'var(--serif)', fontSize: 13, fontWeight: 600, color: 'var(--ink)', marginBottom: 2 }}>
                          {m.event_title}
                        </div>
                        <MiniChart ticker={m.market_ticker} market={m} />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
