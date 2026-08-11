/** Dashboard analytics — P&L, regime jumps, release windows, alerts. */

export function daysToExpiry(resolution) {
  if (!resolution) return null;
  const end = new Date(resolution);
  if (Number.isNaN(end.getTime())) return null;
  const now = new Date();
  return Math.ceil((end.getTime() - now.getTime()) / 86400000);
}

export function formatExpiry(resolution) {
  const d = daysToExpiry(resolution);
  if (d == null) return "—";
  if (d < 0) return "Expired";
  if (d === 0) return "Today";
  if (d === 1) return "1 day";
  return `${d} days`;
}

export function classifyTopic(market) {
  const text = `${market.name || ""} ${market.seriesTicker || ""} ${market.id || ""}`.toLowerCase();
  if (/\bcpi\b|\bpce\b|inflation|core cpi/.test(text)) return "cpi";
  if (/\bfed\b|\bfomc\b|federal funds|rate decision|rate cut|rate hike/.test(text)) return "fed";
  if (/unemployment|jobless|nfp|non-?farm|payroll/.test(text)) return "jobs";
  if (/\bgdp\b|growth/.test(text)) return "gdp";
  if (/inflation|pce/.test(text)) return "inflation";
  return "other";
}

export const TOPIC_FILTERS = [
  { id: "all", label: "All" },
  { id: "cpi", label: "CPI" },
  { id: "fed", label: "Fed" },
  { id: "jobs", label: "Jobs" },
  { id: "gdp", label: "GDP" },
  { id: "inflation", label: "Inflation" },
];

export function filterByTopic(markets, topicId) {
  if (!topicId || topicId === "all") return markets;
  return markets.filter((m) => classifyTopic(m) === topicId);
}

export function impliedReturnYes(askProb) {
  if (askProb == null || askProb <= 0 || askProb >= 1) return null;
  return 1 / askProb - 1;
}

export function pnlYes(entryProb, outcomeYes, contracts = 1) {
  const entry = Number(entryProb);
  if (!Number.isFinite(entry) || entry <= 0) return null;
  const cost = entry * contracts;
  const payout = outcomeYes ? contracts : 0;
  return { cost, payout, profit: payout - cost, returnPct: ((payout - cost) / cost) * 100 };
}

/** Unrealized P&L from entry to current mid (per side). */
export function markToMarket(entryPrice, currentYesProb, side = "yes", contracts = 1) {
  const entry = Number(entryPrice);
  const yes = Number(currentYesProb);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(yes)) return null;
  const current = side === "no" ? 1 - yes : yes;
  const profit = (current - entry) * contracts;
  return { current, profit, returnPct: (profit / (entry * contracts)) * 100 };
}

export function impliedReturnNo(yesBid) {
  if (yesBid == null || yesBid <= 0 || yesBid >= 1) return null;
  const noAsk = 1 - yesBid;
  if (noAsk <= 0) return null;
  return 1 / noAsk - 1;
}

export function marketEdge(kalshiProb, userProb) {
  if (kalshiProb == null || userProb == null) return null;
  const gap = userProb - kalshiProb;
  return { gap, gapPp: gap * 100, kalshiPct: kalshiProb * 100, userPct: userProb * 100 };
}

export function dailyProbVolatility(points) {
  if (!points || points.length < 2) return null;
  const deltas = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].prob;
    const b = points[i].prob;
    if (a != null && b != null) deltas.push(b - a);
  }
  if (!deltas.length) return null;
  const mean = deltas.reduce((s, x) => s + x, 0) / deltas.length;
  const variance = deltas.reduce((s, x) => s + (x - mean) ** 2, 0) / deltas.length;
  return Math.sqrt(variance);
}

export function detectRegimeJumps(points, threshold = 0.1) {
  if (!points?.length) return [];
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1].prob;
    const curr = points[i].prob;
    if (prev == null || curr == null) continue;
    const delta = curr - prev;
    if (Math.abs(delta) >= threshold) {
      out.push({
        date: points[i].date,
        delta,
        deltaPp: delta * 100,
        prob: curr,
        direction: delta > 0 ? "up" : "down",
      });
    }
  }
  return out;
}

function dayDiff(dateA, dateB) {
  const a = new Date(`${dateA.slice(0, 10)}T12:00:00`);
  const b = new Date(`${dateB.slice(0, 10)}T12:00:00`);
  return Math.round((a - b) / 86400000);
}

export function nearestEvent(jumps, events, maxDays = 2) {
  return jumps.map((jump) => {
    let best = null;
    let bestDist = Infinity;
    for (const e of events) {
      const d = Math.abs(dayDiff(jump.date, e.date));
      if (d <= maxDays && d < bestDist) {
        bestDist = d;
        best = e;
      }
    }
    return { ...jump, event: best, eventDistance: bestDist === Infinity ? null : bestDist };
  });
}

export function linkEventToMarkets(event, markets, cap = 12) {
  const type = event.type || "macro";
  const label = (event.label || event.title || "").toLowerCase();
  return markets
    .filter((m) => {
      const text = `${m.name} ${m.seriesTicker} ${m.id}`.toLowerCase();
      if (type === "cpi" || /cpi/.test(label)) return /cpi|pce|inflation/.test(text);
      if (type === "fed" || /fomc|fed/.test(label)) return /fed|fomc|rate/.test(text);
      if (type === "jobs" || /nfp|payroll|jobless/.test(label)) return /nfp|payroll|jobless|unemployment/.test(text);
      if (type === "gdp") return /gdp/.test(text);
      return m.isMacro;
    })
    .slice(0, cap);
}

export function releaseWindowSeries(points, eventDate, windowDays = 7) {
  if (!eventDate || !points?.length) return [];
  const anchor = eventDate.slice(0, 10);
  return points
    .filter((p) => {
      const d = dayDiff(p.date, anchor);
      return d >= -windowDays && d <= windowDays;
    })
    .map((p) => ({
      ...p,
      dayOffset: dayDiff(p.date, anchor),
      date: p.date,
    }))
    .sort((a, b) => a.dayOffset - b.dayOffset);
}

export function rankByVolume(markets, n = 20) {
  return [...markets].sort((a, b) => (b.volume || 0) - (a.volume || 0)).slice(0, n);
}

export function correlationMatrix(marketSeries, tickers, maxPoints = 90) {
  const series = tickers
    .map((t) => ({
      ticker: t,
      returns: marketSeries[t]
        ?.slice(-maxPoints)
        .map((p, i, arr) => (i === 0 ? 0 : (p.prob ?? 0) - (arr[i - 1].prob ?? 0)))
        .slice(1) || [],
    }))
    .filter((s) => s.returns.length >= 10);

  const matrix = [];
  for (const a of series) {
    const row = { ticker: a.ticker, values: {} };
    for (const b of series) {
      row.values[b.ticker] = pearson(a.returns, b.returns);
    }
    matrix.push(row);
  }
  return matrix;
}

/** Rank highest positive correlations (excluding self). */
export function topCorrelatedPairs(matrix, tickers, limit = 8) {
  const pairs = [];
  for (let i = 0; i < matrix.length; i++) {
    for (let j = i + 1; j < tickers.length; j++) {
      const corr = matrix[i].values[tickers[j]];
      if (corr == null) continue;
      pairs.push({ a: tickers[i], b: tickers[j], corr });
    }
  }
  pairs.sort((x, y) => y.corr - x.corr);
  return pairs.slice(0, limit);
}

export function mergeSeriesPoints(existing, incoming) {
  const seen = new Set();
  const out = [];
  for (const p of [...(existing || []), ...(incoming || [])]) {
    const id = p.marketId || p.market_id;
    const key = `${id}|${p.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
  }
  return out;
}

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 5) return null;
  const x = xs.slice(0, n);
  const y = ys.slice(0, n);
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = x[i] - mx;
    const b = y[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  return num / Math.sqrt(dx * dy);
}

export function buildAlerts({ points, calendarEvents, newsItems, moveThreshold = 0.05, preReleaseHours = 48 }) {
  const alerts = [];
  const now = Date.now();

  if (points?.length >= 2) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    if (last.prob != null && prev.prob != null) {
      const delta = last.prob - prev.prob;
      if (Math.abs(delta) >= moveThreshold) {
        alerts.push({
          type: "move",
          severity: Math.abs(delta) >= 0.1 ? "high" : "medium",
          message: `Daily move ${(delta * 100).toFixed(1)} pts (${prev.date} → ${last.date})`,
        });
      }
    }
  }

  for (const e of calendarEvents || []) {
    const eventMs = new Date(`${e.date.slice(0, 10)}T12:00:00`).getTime();
    const hours = (eventMs - now) / 3600000;
    if (hours >= 0 && hours <= preReleaseHours) {
      alerts.push({
        type: "pre_release",
        severity: "medium",
        message: `${e.label} in ${Math.round(hours)}h (${e.date})`,
      });
    }
  }

  if (points?.length >= 2 && newsItems?.length) {
    const last = points[points.length - 1];
    const prev = points[points.length - 2];
    const delta = (last.prob ?? 0) - (prev.prob ?? 0);
    if (Math.abs(delta) >= moveThreshold && newsItems[0]) {
      alerts.push({
        type: "news",
        severity: "low",
        message: `Same-day move ${(delta * 100).toFixed(1)} pts · "${newsItems[0].headline?.slice(0, 60)}…"`,
      });
    }
  }

  return alerts;
}
