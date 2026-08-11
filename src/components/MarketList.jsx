import { useState, useMemo, useCallback } from 'react';
import { differenceInDays, parseISO } from 'date-fns';
import { getCategoryMeta, formatMarketLabel, isActiveMarket } from '../lib/data';
import { isWatchlisted, toggleWatchlist } from '../lib/workflow';

const CATEGORIES = [
  { id: 'all',          label: 'All' },
  { id: 'watchlist',    label: '★ Watch' },
  { id: 'inflation',    label: 'Inflation' },
  { id: 'fed',          label: 'Fed' },
  { id: 'unemployment', label: 'Labour' },
  { id: 'gdp',          label: 'Growth' },
];

export default function MarketList({ markets = [], selected, onSelect }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [watchTick, setWatchTick] = useState(0);

  const handleWatch = useCallback((e, ticker) => {
    e.stopPropagation();
    toggleWatchlist(ticker);
    setWatchTick((n) => n + 1);
  }, []);

  const tradeable = useMemo(
    () => (markets || []).filter(isActiveMarket),
    [markets],
  );

  const filtered = useMemo(() => {
    let m = tradeable;
    if (filter === 'watchlist') {
      m = m.filter((x) => isWatchlisted(x.market_ticker));
    } else if (filter !== 'all') m = m.filter(x => x.category === filter);
    if (search) {
      const s = search.toLowerCase().trim();
      // Split search into words for better matching
      const words = s.split(/\s+/).filter(w => w.length > 1);
      
      m = m.filter(x => {
        const searchText = [
          x.event_title || '',
          x.market_title || '', 
          x.market_ticker || '',
          x.series_title || '',
          x.series_subtitle || '',
        ].join(' ').toLowerCase();
        
        // Match if all words are found somewhere in the combined text
        if (words.length > 1) {
          return words.every(word => searchText.includes(word));
        }
        // Single word/phrase search
        return searchText.includes(s);
      });
    }
    return m;
  }, [filter, search, tradeable, watchTick]);

  // Group by series
  const grouped = useMemo(() => {
    const g = {};
    filtered.forEach(m => {
      if (!g[m.series_ticker]) g[m.series_ticker] = { event_title: m.event_title, subtitle: m.series_subtitle, category: m.category, close_time: m.close_time, items: [] };
      g[m.series_ticker].items.push(m);
    });
    return Object.entries(g);
  }, [filtered]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Filters */}
      <div style={{ marginBottom: 14 }}>
        <div className="dateline" style={{ marginBottom: 8 }}>Contracts</div>
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search markets..."
          style={{
            width: '100%',
            padding: '8px 10px',
            background: 'var(--paper2)',
            border: '1px solid var(--rule)',
            borderRadius: 2,
            color: 'var(--ink)',
            outline: 'none',
            marginBottom: 8,
          }}
        />
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              style={{
                padding: '4px 10px',
                background: filter === c.id ? 'var(--ink)' : 'transparent',
                color: filter === c.id ? 'var(--paper)' : 'var(--ink3)',
                border: `1px solid ${filter === c.id ? 'var(--ink)' : 'var(--rule)'}`,
                borderRadius: 2,
                fontFamily: 'var(--sans)',
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      <hr className="rule" style={{ marginBottom: 12 }} />

      {/* List */}
      <div style={{ 
        flex: 1, 
        overflowY: 'auto', 
        paddingRight: 4, 
        maxHeight: 'calc(100vh - 200px)',
        minHeight: '300px'
      }}>
        {grouped.map(([series, group]) => {
          const meta = getCategoryMeta(group.category);
          const daysToExpiry = differenceInDays(parseISO(group.close_time), new Date());
          return (
            <div key={series} style={{ marginBottom: 18 }}>
              {/* Series header */}
              <div style={{
                paddingBottom: 4,
                borderBottom: `1px solid var(--rule)`,
                marginBottom: 6,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{
                    fontFamily: 'var(--sans)',
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: '0.1em',
                    color: meta.color,
                    textTransform: 'uppercase',
                  }}>
                    {meta.label}
                  </span>
                  <span style={{
                    fontFamily: 'var(--mono)',
                    fontSize: 9,
                    color: daysToExpiry < 7 ? 'var(--accent)' : 'var(--ink3)',
                  }}>
                    {daysToExpiry}d
                  </span>
                </div>
                <div style={{
                  fontFamily: 'var(--serif)',
                  fontSize: 12,
                  color: 'var(--ink)',
                  fontWeight: 600,
                  marginTop: 2,
                  lineHeight: 1.25,
                }}>
                  {group.event_title}
                </div>
                <div style={{
                  fontFamily: 'var(--sans)',
                  fontSize: 9,
                  color: 'var(--ink3)',
                  marginTop: 4,
                  letterSpacing: '0.04em',
                }}>
                  Separate contracts per threshold
                </div>
              </div>

              {/* Market rows */}
              {group.items.map(m => {
                const isSelected = selected?.market_ticker === m.market_ticker;
                const yesPct = (m.yes_ask * 100).toFixed(0);
                const yesColor = m.yes_ask >= 0.6 ? 'var(--green)' : m.yes_ask <= 0.3 ? 'var(--accent)' : 'var(--ink2)';

                return (
                  <button
                    key={m.market_ticker}
                    onClick={() => onSelect(m)}
                    style={{
                      display: 'block',
                      width: '100%',
                      textAlign: 'left',
                      background: isSelected ? 'var(--paper3)' : 'transparent',
                      border: `1px solid ${isSelected ? 'var(--rule2)' : 'transparent'}`,
                      borderLeft: `3px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                      borderRadius: 2,
                      padding: '6px 8px 6px 10px',
                      marginBottom: 2,
                      cursor: 'pointer',
                      transition: 'background 0.1s',
                      position: 'relative',
                      boxShadow: isSelected ? '2px 2px 0 rgba(26,24,20,0.06)' : 'none',
                    }}
                    onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--paper2)'; }}
                    onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
                  >
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => handleWatch(e, m.market_ticker)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleWatch(e, m.market_ticker); }}
                      title={isWatchlisted(m.market_ticker) ? 'Remove from watchlist' : 'Add to watchlist'}
                      style={{
                        position: 'absolute',
                        top: 6,
                        right: 6,
                        fontSize: 12,
                        color: isWatchlisted(m.market_ticker) ? 'var(--gold)' : 'var(--ink4)',
                        cursor: 'pointer',
                        lineHeight: 1,
                      }}
                    >
                      {isWatchlisted(m.market_ticker) ? '★' : '☆'}
                    </span>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, paddingRight: 16 }}>
                      <span style={{
                        fontFamily: 'var(--serif)',
                        fontSize: 13,
                        color: 'var(--ink)',
                        fontWeight: isSelected ? 600 : 400,
                      }}>
                        {formatMarketLabel(m)}
                      </span>
                      <span style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 13,
                        fontWeight: 600,
                        color: yesColor,
                      }}>
                        {yesPct}¢
                      </span>
                    </div>
                    <div style={{
                      fontFamily: 'var(--mono)',
                      fontSize: 9,
                      color: 'var(--ink3)',
                      marginTop: 2,
                    }}>
                      {m.market_ticker.replace(`${m.series_ticker}-`, '')}
                    </div>

                    {/* Mini prob bar */}
                    <div style={{
                      height: 2,
                      background: 'var(--rule)',
                      marginTop: 4,
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${m.yes_ask * 100}%`,
                        background: yesColor,
                      }} />
                    </div>

                    {/* Spread + vol */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      marginTop: 3,
                      fontFamily: 'var(--mono)',
                      fontSize: 9,
                      color: 'var(--ink3)',
                    }}>
                      <span>sp {(m.spread * 100).toFixed(1)}¢</span>
                      <span>{(m.volume / 1000).toFixed(1)}K vol</span>
                    </div>
                  </button>
                );
              })}
            </div>
          );
        })}

        {grouped.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: 'var(--ink3)', fontFamily: 'var(--serif)', fontStyle: 'italic' }}>
            No contracts match these filters.
          </div>
        )}
      </div>

      {/* Footer count */}
      <div style={{
        marginTop: 10, paddingTop: 8,
        borderTop: '1px solid var(--rule)',
        fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--ink3)',
        textAlign: 'center',
      }}>
        {filtered.length} of {tradeable.length} open contracts
        {(markets?.length || 0) > tradeable.length && (
          <span className="dim"> · {(markets.length - tradeable.length).toLocaleString()} settled in Data tab</span>
        )}
      </div>
    </div>
  );
}
