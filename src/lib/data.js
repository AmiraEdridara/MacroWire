import { parseISO } from 'date-fns';

export const CAT_LABELS = {
  inflation: { label: 'INFLATION', color: 'var(--accent)', tone: 'accent' },
  fed: { label: 'FED POLICY', color: 'var(--blue)', tone: 'blue' },
  unemployment: { label: 'LABOUR', color: 'var(--green)', tone: 'green' },
  gdp: { label: 'GROWTH', color: 'var(--gold)', tone: 'gold' },
};

export const EVENT_COLORS = {
  fed: 'var(--blue)',
  cpi: 'var(--accent)',
  nfp: 'var(--green)',
  pce: 'var(--gold)',
  pmi: 'var(--ink3)',
};

export function getCategoryMeta(cat) {
  return CAT_LABELS[cat] || { label: (cat || 'other').toUpperCase(), color: 'var(--ink3)', tone: '' };
}

/** Human-readable label for a contract bin (e.g. T3.9 → "≥ 3.9%"). */
export function formatMarketLabel(market) {
  if (!market) return '—';

  const title = (market.market_title || '').trim();
  const event = (market.event_title || '').trim();
  const ticker = market.market_ticker || '';
  const series = market.series_ticker || '';
  const category = market.category || '';

  if (title && event && title !== event) {
    return title;
  }

  const suffix =
    series && ticker.startsWith(`${series}-`)
      ? ticker.slice(series.length + 1)
      : ticker.split('-').slice(-1)[0] || ticker;

  const tMatch = suffix.match(/^T([\d.]+)$/i);
  if (tMatch) {
    return `≥ ${tMatch[1]}%`;
  }

  if (/^\d+$/.test(suffix)) {
    if (category === 'unemployment' || /U3|UNEMP|JOBLESS|MAX/i.test(`${series} ${event}`)) {
      return `≥ ${suffix}% unemployment`;
    }
    return `≥ ${suffix}%`;
  }

  if (/^\d+\.\d+$/.test(suffix)) {
    if (category === 'fed' || /FED|RATE|FUND/i.test(`${series} ${event}`)) {
      return `${suffix}% funds rate`;
    }
    return `${suffix}%`;
  }

  if (/below/i.test(suffix)) {
    const v = suffix.match(/([\d.]+)/);
    return v ? `< ${v[1]}%` : suffix.replace(/-/g, ' ');
  }
  if (/above/i.test(suffix)) {
    const v = suffix.match(/([\d.]+)/);
    return v ? `> ${v[1]}%` : suffix.replace(/-/g, ' ');
  }

  const rangeMatch = suffix.match(/^([\d.]+)-to-([\d.]+)$/i);
  if (rangeMatch) {
    return `${rangeMatch[1]}% – ${rangeMatch[2]}%`;
  }

  if (/^hold$/i.test(suffix)) return 'Hold rates';
  const cutMatch = suffix.match(/^cut-?(\d+)$/i);
  if (cutMatch) return `${cutMatch[1]}bp rate cut`;
  const hikeMatch = suffix.match(/^hike-?(\d+)$/i);
  if (hikeMatch) return `${hikeMatch[1]}bp rate hike`;

  return suffix.replace(/-/g, ' ');
}

export function formatMarketHeadline(market) {
  const bin = formatMarketLabel(market);
  const event = market?.event_title || '';
  if (!event || bin === event) return bin;
  return `${bin} — ${event}`;
}

export function enrichMarket(m) {
  if (!m) return m;
  const bid = m.yes_bid;
  const ask = m.yes_ask;
  const mid = bid != null && ask != null
    ? (bid + ask) / 2
    : m.last_price ?? ask ?? bid;
  const spreadRaw = m.spread;
  return {
    ...m,
    prob: mid != null ? +(mid * 100).toFixed(1) : null,
    imp_ret: ask > 0 ? impliedReturn(ask) : (m.implied_return ?? null),
    spread: spreadRaw != null && spreadRaw <= 1 ? +(spreadRaw * 100).toFixed(2) : spreadRaw,
    yes_bid: bid,
    yes_ask: ask,
    result: m.result ? String(m.result).toLowerCase() : null,
  };
}

/** Open/tradeable contract (excludes backfilled finalized rows). */
export function isActiveMarket(m) {
  if (!m) return false;
  const st = String(m.status || 'active').toLowerCase();
  if (['finalized', 'settled', 'closed', 'expired'].includes(st)) return false;
  const dte = m.days_to_expiry;
  if (dte != null && dte < 0) return false;
  return true;
}

export function isSettledMarket(m) {
  if (!m) return false;
  const st = String(m.status || '').toLowerCase();
  if (['finalized', 'settled'].includes(st)) return true;
  if (m.result === 'yes' || m.result === 'no') return true;
  const dte = m.days_to_expiry;
  return dte != null && dte < 0;
}

export async function fetchMarkets(limit = 12000, status = null) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set('status', status);
  const res = await fetch(`/api/markets?${params}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return (data.markets || []).map(enrichMarket);
}

export async function fetchCandles(ticker, days = 90) {
  const res = await fetch(`/api/candles/${encodeURIComponent(ticker)}?days=${days}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return trimPostSettlementCandles(data.series || []);
}

/** Drop trailing post-settlement days (bid=0, no volume after meaningful trading). */
export function trimPostSettlementCandles(candles) {
  if (!candles?.length || candles.length < 2) return candles || [];
  const rows = [...candles].sort((a, b) => a.date.localeCompare(b.date));
  while (rows.length > 1) {
    const last = rows[rows.length - 1];
    const prev = rows[rows.length - 2];
    const bid = last.yes_bid ?? last.close_prob ?? 0;
    const prevBid = prev.yes_bid ?? prev.close_prob ?? 0;
    const vol = last.volume || 0;
    if (bid === 0 && vol === 0 && prevBid >= 0.5) {
      rows.pop();
      continue;
    }
    break;
  }
  return rows;
}

export async function fetchBulkCandles(days = 120, limit = 200) {
  const res = await fetch(`/api/candles/bulk?days=${days}&limit=${limit}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.series || [];
}

export async function fetchCalendar() {
  const res = await fetch('/api/calendar?days_back=400&days_forward=90&currency=USD');
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.events || [];
}

export async function fetchNews(limit = 20) {
  const res = await fetch(`/api/news?limit=${limit}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.news || [];
}

export async function fetchVolatilityRanking({ window = 14, limit = 500, series = null } = {}) {
  const params = new URLSearchParams({ window: String(window), limit: String(limit) });
  if (series) params.set('series', series);
  const res = await fetch(`/api/analytics/volatility?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchCalibration({ leadDays = 7, bins = 10 } = {}) {
  const params = new URLSearchParams({ lead_days: String(leadDays), bins: String(bins) });
  const res = await fetch(`/api/institutional/calibration?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

/** Pairwise correlation of daily close_prob changes. Normalises pandas split format. */
export async function fetchCorrelation(tickers, days = 60) {
  if (!tickers?.length || tickers.length < 2) return { tickers: tickers || [], matrix: [] };
  const params = new URLSearchParams({ tickers: tickers.join(','), days: String(days) });
  const res = await fetch(`/api/correlation?${params}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  // split format: { columns:[...], data:[[...]] }
  return {
    tickers: data.matrix?.columns || data.tickers || [],
    matrix: data.matrix?.data || [],
    window_days: data.window_days,
  };
}

export async function fetchSignals(limit = 40) {
  const res = await fetch(`/api/institutional/signals?limit=${limit}`);
  if (!res.ok) throw new Error(await res.text());
  const data = await res.json();
  return data.signals || [];
}

/** Download URLs for programmatic / CSV consumption (institutional). */
export const EXPORT_URLS = {
  markets: '/api/institutional/markets.csv',
  volatility: (window = 14) => `/api/institutional/volatility.csv?window=${window}`,
  signals: '/api/institutional/signals.csv',
  snapshot: '/api/institutional/snapshot',
};

const TRADING_DAYS = 252;

/**
 * Path-aware performance of holding YES from the first candle, treating close_prob
 * as the asset price. Endpoint-to-endpoint return hides the path; funds want the
 * geometrically-linked (time-weighted) return plus drawdown and a risk-adjusted ratio.
 */
export function performanceStats(candles) {
  const series = (candles || [])
    .filter((c) => c.close_prob != null && c.close_prob > 0 && c.close_prob < 1)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (series.length < 3) return null;

  const dailyReturns = [];
  let twr = 1;
  let peak = series[0].close_prob;
  let maxDrawdown = 0;
  let upDays = 0;

  for (let i = 1; i < series.length; i++) {
    const prev = series[i - 1].close_prob;
    const cur = series[i].close_prob;
    const r = cur / prev - 1;
    dailyReturns.push(r);
    twr *= 1 + r;
    if (r > 0) upDays += 1;
    if (cur > peak) peak = cur;
    const dd = cur / peak - 1;
    if (dd < maxDrawdown) maxDrawdown = dd;
  }

  const n = dailyReturns.length;
  const mean = dailyReturns.reduce((s, x) => s + x, 0) / n;
  const variance = dailyReturns.reduce((s, x) => s + (x - mean) ** 2, 0) / (n - 1 || 1);
  const sd = Math.sqrt(variance);
  const totalReturn = twr - 1;
  const annualized = (1 + totalReturn) ** (TRADING_DAYS / n) - 1;
  const sharpe = sd > 1e-9 ? (mean / sd) * Math.sqrt(TRADING_DAYS) : null;

  return {
    days: n,
    totalReturn: +(totalReturn * 100).toFixed(1),
    annualized: +(annualized * 100).toFixed(1),
    maxDrawdown: +(maxDrawdown * 100).toFixed(1),
    sharpe: sharpe != null ? +sharpe.toFixed(2) : null,
    upDayPct: +((upDays / n) * 100).toFixed(0),
  };
}

export function groupMarketsBySeries(markets = []) {
  const map = new Map();
  for (const m of markets) {
    const key = m.series_ticker || m.market_ticker;
    if (!map.has(key)) {
      map.set(key, {
        series_ticker: key,
        event_title: m.event_title,
        category: m.category,
        markets: [],
      });
    }
    map.get(key).markets.push(m);
  }
  return [...map.values()].sort((a, b) => a.event_title.localeCompare(b.event_title));
}

/** Std dev of daily close_prob changes over the last `window` days (pp). */
export function dailyChangeVolatility(candles, window = 14) {
  if (!candles?.length || candles.length < 3) return null;
  const end = candles.length;
  const start = Math.max(1, end - window);
  const deltas = [];
  for (let i = start; i < end; i++) {
    const delta = candles[i].close_prob - candles[i - 1].close_prob;
    if (Number.isFinite(delta)) deltas.push(delta);
  }
  if (deltas.length < 2) return null;
  const mean = deltas.reduce((s, x) => s + x, 0) / deltas.length;
  const variance = deltas.reduce((s, x) => s + (x - mean) ** 2, 0) / (deltas.length - 1);
  return parseFloat((Math.sqrt(variance) * 100).toFixed(2));
}

export function pickDefaultMarket(markets) {
  if (!markets?.length) return null;
  const active = markets.filter(isActiveMarket);
  const pool = active.length ? active : markets;
  const fed = pool.find((m) => m.category === 'fed');
  return fed || pool.sort((a, b) => (b.volume || 0) - (a.volume || 0))[0];
}

export function detectBreaks(candles, calendar = [], threshold = 0.10, minVolume = 100) {
  const breaks = [];
  for (let i = 1; i < candles.length; i++) {
    const delta = candles[i].close_prob - candles[i - 1].close_prob;
    if (Math.abs(delta) >= threshold && candles[i].volume >= minVolume) {
      const targetDate = parseISO(candles[i].date);
      const nearest = calendar
        .map((e) => ({ ...e, distance: Math.abs(parseISO(e.date) - targetDate) }))
        .filter((e) => e.distance <= 2 * 24 * 3600 * 1000)
        .sort((a, b) => a.distance - b.distance)[0];

      breaks.push({
        date: candles[i].date,
        delta,
        from_prob: candles[i - 1].close_prob,
        to_prob: candles[i].close_prob,
        volume: candles[i].volume,
        event: nearest || null,
      });
    }
  }
  return breaks;
}

export function rollingVolatility(candles, window = 14) {
  return candles.map((c, i) => {
    if (i < window) return { ...c, vol: null };
    const slice = candles.slice(i - window, i);
    const changes = slice.map((x, j) => (j === 0 ? 0 : x.close_prob - slice[j - 1].close_prob));
    const mean = changes.reduce((s, x) => s + x, 0) / changes.length;
    const variance = changes.reduce((s, x) => s + (x - mean) ** 2, 0) / changes.length;
    return { ...c, vol: parseFloat(Math.sqrt(variance).toFixed(5)) };
  });
}

export function impliedReturn(yesAsk) {
  if (yesAsk <= 0 || yesAsk >= 1) return 0;
  return 1 / yesAsk - 1;
}

function sideAsk(candle, side = 'yes') {
  if (!candle) return null;
  if (side === 'yes') return candle.yes_ask ?? null;
  return candle.no_ask ?? (candle.yes_bid != null ? 1 - candle.yes_bid : null);
}

function sideBid(candle, side = 'yes') {
  if (!candle) return null;
  if (side === 'yes') return candle.yes_bid ?? null;
  return candle.no_bid ?? (candle.yes_ask != null ? 1 - candle.yes_ask : null);
}

export function entryPriceAt(candles, entryDate, side = 'yes') {
  const candle = candles.find((c) => c.date === entryDate);
  return sideAsk(candle, side);
}

export function exitPriceAt(candles, exitDate, side = 'yes') {
  const candle = candles.find((c) => c.date === exitDate);
  return sideBid(candle, side);
}

export function inferSettlement(candles, market) {
  const raw = market?.result ?? market?.settlement;
  if (raw != null && raw !== '') {
    const r = String(raw).toLowerCase();
    if (r === 'yes' || r === '1' || r === 'true') return 'yes';
    if (r === 'no' || r === '0' || r === 'false') return 'no';
  }

  const status = (market?.status || '').toLowerCase();
  const expired = market?.days_to_expiry != null && market.days_to_expiry < 0;
  const closed = status === 'closed' || status === 'settled' || expired;
  if (!closed || !candles.length) return null;

  const last = candles[candles.length - 1];
  if (last.close_prob >= 0.95 || last.yes_bid >= 0.95) return 'yes';
  if (last.close_prob <= 0.05 || last.yes_ask <= 0.05) return 'no';
  return null;
}

export function isMarketClosed(market) {
  const status = (market?.status || '').toLowerCase();
  if (status === 'closed' || status === 'settled') return true;
  if (market?.days_to_expiry != null && market.days_to_expiry < 0) return true;
  return false;
}

function settlementExitPrice(side, outcome) {
  const won = (side === 'yes' && outcome === 'yes') || (side === 'no' && outcome === 'no');
  return won ? 1 : 0;
}

/** Unrealized (open) or realized (settled) P&L for a hypothetical position. */
export function positionPnl(candles, entryDate, side = 'yes', market = null) {
  const entryPrice = entryPriceAt(candles, entryDate, side);
  if (entryPrice == null || entryPrice <= 0) return null;

  const settlement = inferSettlement(candles, market);
  const closed = isMarketClosed(market);

  let exitPrice;
  let mode;
  if (closed) {
    mode = 'closed';
    if (!settlement) {
      return {
        mode,
        settlement: null,
        entryPrice,
        exitPrice: null,
        pnl: null,
        pnl_pct: null,
      };
    }
    exitPrice = settlementExitPrice(side, settlement);
  } else if (candles.length) {
    const last = candles[candles.length - 1];
    exitPrice = sideBid(last, side);
    if (exitPrice == null) return null;
    mode = 'open';
  } else {
    return null;
  }

  const pnl = exitPrice - entryPrice;
  return {
    mode,
    settlement,
    entryPrice,
    exitPrice,
    pnl: parseFloat(pnl.toFixed(4)),
    pnl_pct: parseFloat(((pnl / entryPrice) * 100).toFixed(2)),
  };
}

export function markToMarket(candles, entryDate, side = 'yes') {
  const entryIdx = candles.findIndex((c) => c.date === entryDate);
  if (entryIdx < 0) return [];
  const entryPrice = entryPriceAt(candles, entryDate, side);
  if (entryPrice == null) return [];
  return candles.slice(entryIdx).map((c) => {
    const exitPrice = sideBid(c, side);
    if (exitPrice == null) return null;
    const pnl = exitPrice - entryPrice;
    return {
      date: c.date,
      pnl: parseFloat(pnl.toFixed(4)),
      pnl_pct: parseFloat(((pnl / entryPrice) * 100).toFixed(2)),
    };
  }).filter(Boolean);
}
