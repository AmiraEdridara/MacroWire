/** Log-odds AR(1) + OU mean reversion + event-conditional nudges. */

const EPS = 1e-4;

export const EVENT_IMPACT = [
  { id: 'cpi', match: /\bcpi\b|inflation|consumer price/i, series: ['KXCPI', 'KXECONSTATCPI', 'KXECONSTATCPIYOY', 'KXECONSTATCPICORE', 'KXECONSTATCORECPIYOY', 'KXCPICORE', 'KXHIGHINFLATION'] },
  { id: 'fed', match: /\bfomc\b|federal reserve|fed funds|rate decision|powell|fed chairman/i, series: ['KXFED', 'KXFEDDECISION', 'FEDHIKE', 'KXRATECUTCOUNT', 'KXLARGECUT', 'KXRATECUT', 'KXEMERCUTS'] },
  { id: 'jobs', match: /nonfarm|payroll|\bnfp\b|unemployment|jolts|jobs/i, series: ['KXPAYROLLS', 'KXU3MAX', 'KXECONSTATU3', 'KXBRAZILU'] },
  { id: 'gdp', match: /\bgdp\b|gross domestic/i, series: ['KXGDP', 'KXGDPYEAR', 'KXGDPNOM', 'KXBRAZILGDP', 'KXNFPROD'] },
  { id: 'pce', match: /\bpce\b/i, series: ['KXPCECORE'] },
];

export function logOdds(p) {
  const clipped = Math.min(1 - EPS, Math.max(EPS, p));
  return Math.log(clipped / (1 - clipped));
}

export function invLogOdds(y) {
  return 1 / (1 + Math.exp(-y));
}

export function probToPct(p) {
  return +(p * 100).toFixed(2);
}

export function seriesMatchesEvent(seriesKey, eventName) {
  return EVENT_IMPACT.some(
    (r) => r.match.test(eventName) && r.series.some((s) => seriesKey.startsWith(s)),
  );
}

export function eventImpactId(eventName) {
  return EVENT_IMPACT.find((r) => r.match.test(eventName))?.id ?? null;
}

function ols(y, x) {
  const n = Math.min(y.length, x.length);
  if (n < 3) return { alpha: 0, beta: 0 };
  let sx = 0; let sy = 0; let sxy = 0; let sx2 = 0;
  for (let i = 0; i < n; i++) {
    sx += x[i];
    sy += y[i];
    sxy += x[i] * y[i];
    sx2 += x[i] * x[i];
  }
  const denom = n * sx2 - sx * sx;
  if (Math.abs(denom) < 1e-12) return { alpha: sy / n, beta: 0 };
  const beta = (n * sxy - sx * sy) / denom;
  const alpha = (sy - beta * sx) / n;
  return { alpha, beta };
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const m = arr.reduce((a, v) => a + v, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, v) => a + (v - m) ** 2, 0) / (arr.length - 1));
}

function addDays(dateStr, days) {
  const d = new Date(`${dateStr.slice(0, 10)}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function dateIndex(dates) {
  const map = new Map();
  dates.forEach((d, i) => map.set(d.slice(0, 10), i));
  return map;
}

/** Average log-odds change on past release days matching event type. */
export function estimateEventNudges(history, calendar, seriesKey) {
  if (!history.length || !calendar?.length) return { byDate: new Map(), byType: {} };

  const idx = dateIndex(history.map((h) => h.date));
  const y = history.map((h) => logOdds(h.p));
  const byType = {};

  for (const rule of EVENT_IMPACT) {
    const pastEvents = calendar.filter(
      (e) => rule.match.test(e.event_name || '') && seriesMatchesEvent(seriesKey, e.event_name),
    );
    const deltas = [];
    const deltasPp = [];
    for (const ev of pastEvents) {
      const d = (ev.date || '').slice(0, 10);
      const i = idx.get(d);
      if (i == null || i < 1) continue;
      deltas.push(y[i] - y[i - 1]);
      deltasPp.push((history[i].p - history[i - 1].p) * 100);
    }
    if (deltas.length) {
      byType[rule.id] = {
        n: deltas.length,
        meanDeltaY: deltas.reduce((a, v) => a + v, 0) / deltas.length,
        meanDeltaPp: +(deltasPp.reduce((a, v) => a + v, 0) / deltasPp.length).toFixed(2),
      };
    }
  }

  const byDate = new Map();
  for (const ev of calendar) {
    if (!seriesMatchesEvent(seriesKey, ev.event_name)) continue;
    const id = eventImpactId(ev.event_name);
    if (id && byType[id]) {
      byDate.set(ev.date.slice(0, 10), byType[id].meanDeltaY);
    }
  }
  return { byDate, byType };
}

/**
 * @param {Array<{date:string, p:number}>} history - sorted, p in 0-1
 * @param {number} horizonDays
 * @param {Map<string, number>} eventNudgesByDate - log-odds nudge on release day
 * @param {{bandSd?: number[]}} options - optional GARCH cumulative-SD path (log-odds);
 *        when present the band uses propagated variance instead of iid σ·√t.
 */
export function runForecast(history, horizonDays, eventNudgesByDate = new Map(), options = {}) {
  if (history.length < 5) {
    return { trend: [], finalProb: null, stdev: 0, params: null };
  }
  const bandSd = options.bandSd || null;

  const y = history.map((h) => logOdds(h.p));
  const dy = y.slice(1).map((v, i) => v - y[i]);
  const dyLag = dy.slice(0, -1);
  const dyCur = dy.slice(1);
  const { alpha, beta } = ols(dyCur, dyLag);

  const residuals = dyCur.map((v, i) => v - (alpha + beta * dyLag[i]));
  const sigma = stdDev(residuals);

  const mu = y.reduce((a, v) => a + v, 0) / y.length;
  const gaps = y.slice(0, -1).map((yi) => mu - yi);
  const pulls = dy;
  let theta = 0;
  const gapSq = gaps.reduce((a, g) => a + g * g, 0);
  if (gapSq > 1e-12) {
    theta = Math.max(0, gaps.reduce((a, g, i) => a + g * pulls[i], 0) / gapSq);
    theta = Math.min(theta, 0.5);
  }

  let yHat = y[y.length - 1];
  let dyPrev = dy[dy.length - 1] ?? 0;
  const lastDate = history[history.length - 1].date;
  const trend = [];

  for (let d = 1; d <= horizonDays; d++) {
    const dateStr = addDays(lastDate, d);

    const dyAr = alpha + beta * dyPrev;
    const dyOu = theta * (mu - yHat);
    let dyTotal = dyAr + dyOu;

    const eventNudge = eventNudgesByDate.get(dateStr);
    if (eventNudge != null) dyTotal += eventNudge;

    yHat += dyTotal;
    dyPrev = dyTotal;

    const sdY = bandSd && bandSd[d - 1] != null ? bandSd[d - 1] : sigma * Math.sqrt(d);
    const bandY = sdY * 1.645;
    const pHat = invLogOdds(yHat);
    const pUpper = invLogOdds(yHat + bandY);
    const pLower = invLogOdds(yHat - bandY);

    trend.push({
      date: dateStr,
      forecast: probToPct(pHat),
      upper: probToPct(pUpper),
      lower: probToPct(pLower),
      yHat,
    });
  }

  return {
    trend,
    finalProb: trend[trend.length - 1]?.forecast ?? null,
    stdev: +(sigma * 100).toFixed(3),
    bandMethod: bandSd ? 'garch' : 'iid',
    params: {
      alpha: +alpha.toFixed(4),
      beta: +beta.toFixed(4),
      theta: +theta.toFixed(4),
      mu: +mu.toFixed(4),
      sigma: +sigma.toFixed(4),
    },
  };
}

export function upcomingLinkedEvents(calendar, market, horizonDays) {
  if (!calendar || !market) return [];
  const seriesKey = market.series_ticker || '';
  const now = new Date();
  const cutoff = new Date(now.getTime() + horizonDays * 86400000);

  return calendar
    .filter((e) => {
      const evDate = new Date(e.date);
      if (Number.isNaN(evDate.getTime()) || evDate < now) return false;
      if (evDate > cutoff) return false;
      return seriesMatchesEvent(seriesKey, e.event_name);
    })
    .slice(0, 12);
}
