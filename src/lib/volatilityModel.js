/** Log-odds returns, rolling σ, GARCH(1,1), event vol multipliers, implied vs realised. */

import { EVENT_IMPACT, logOdds, seriesMatchesEvent } from './forecastModel';

const EPS = 1e-4;
const DEFAULT_WINDOW = 14;

export function logOddsReturns(candles) {
  const sorted = [...candles]
    .filter((c) => c.close_prob != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  const out = [];
  for (let i = 1; i < sorted.length; i++) {
    const y0 = logOdds(sorted[i - 1].close_prob);
    const y1 = logOdds(sorted[i].close_prob);
    out.push({
      date: sorted[i].date,
      r: y1 - y0,
      p: sorted[i].close_prob,
      yes_bid: sorted[i].yes_bid,
      yes_ask: sorted[i].yes_ask,
      spread: spreadProb(sorted[i]),
    });
  }
  return out;
}

function spreadProb(candle) {
  const bid = candle.yes_bid;
  const ask = candle.yes_ask;
  if (bid != null && ask != null) return Math.max(0, ask - bid);
  const s = candle.spread;
  if (s != null && s <= 1) return s;
  return null;
}

export function rollingStd(values, window, startIdx) {
  const i = startIdx;
  if (i < window) return null;
  const slice = values.slice(i - window + 1, i + 1);
  const m = slice.reduce((a, v) => a + v, 0) / slice.length;
  const v = slice.reduce((a, x) => a + (x - m) ** 2, 0) / (slice.length - 1);
  return Math.sqrt(Math.max(0, v));
}

function garchSig2Path(returns, omega, alpha, beta) {
  const n = returns.length;
  if (!n) return [];
  const var0 = returns.reduce((a, r) => a + r * r, 0) / n;
  const sig2 = new Array(n);
  sig2[0] = Math.max(var0, 1e-10);
  for (let t = 1; t < n; t++) {
    sig2[t] = omega + alpha * returns[t - 1] ** 2 + beta * sig2[t - 1];
    sig2[t] = Math.max(sig2[t], 1e-10);
  }
  return sig2;
}

function garchLogLik(returns, omega, alpha, beta) {
  const sig2 = garchSig2Path(returns, omega, alpha, beta);
  let ll = 0;
  for (let t = 0; t < returns.length; t++) {
    ll -= 0.5 * (Math.log(sig2[t]) + (returns[t] ** 2) / sig2[t]);
  }
  return ll;
}

export function fitGarch11(returns) {
  if (returns.length < 30) return null;
  const unconditional = returns.reduce((a, r) => a + r * r, 0) / returns.length;
  let best = null;
  for (let alpha = 0.04; alpha <= 0.35; alpha += 0.04) {
    for (let beta = 0.55; beta <= 0.94; beta += 0.03) {
      if (alpha + beta >= 0.998) continue;
      const omega = unconditional * Math.max(0.01, 1 - alpha - beta);
      const ll = garchLogLik(returns, omega, alpha, beta);
      if (!best || ll > best.ll) {
        best = { omega, alpha, beta, ll, persistence: alpha + beta };
      }
    }
  }
  if (!best) return null;
  const sig2 = garchSig2Path(returns, best.omega, best.alpha, best.beta);
  return {
    ...best,
    sig2Path: sig2,
    lastSig2: sig2[sig2.length - 1],
    lastReturn: returns[returns.length - 1],
    unconditional,
  };
}

/**
 * Multi-step GARCH(1,1) variance forecast → cumulative SD per day in log-odds units.
 * E[σ²(t+k)] = σ̄² + (α+β)^(k-1)·(σ²(t+1) − σ̄²); cumulative variance over h sums these.
 * Use this instead of σ·√t when returns are not iid (vol clusters around releases).
 */
export function forecastGarchVariance(logReturns, horizon) {
  const garch = fitGarch11(logReturns);
  if (!garch) return null;
  const { omega, alpha, beta, lastSig2, lastReturn } = garch;
  const persistence = alpha + beta;
  const uncond = persistence < 0.999 ? omega / (1 - persistence) : garch.unconditional;
  const sig2Next = omega + alpha * lastReturn ** 2 + beta * lastSig2;
  const cumSd = [];
  let cumVar = 0;
  for (let k = 1; k <= horizon; k++) {
    const stepVar = uncond + persistence ** (k - 1) * (sig2Next - uncond);
    cumVar += Math.max(stepVar, 1e-12);
    cumSd.push(Math.sqrt(cumVar));
  }
  return { cumSd, garch, sig2Next, uncond };
}

/** σ on release days / σ on normal days, by event type. */
export function estimateEventVolMultipliers(returns, calendar, seriesKey, window = DEFAULT_WINDOW) {
  if (!returns.length || !calendar?.length) return {};

  const rolling = returns.map((_, i) => rollingStd(returns.map((x) => x.r), window, i));

  const byType = {};
  for (const rule of EVENT_IMPACT) {
    const releaseDates = new Set(
      calendar
        .filter((e) => rule.match.test(e.event_name || '') && seriesMatchesEvent(seriesKey, e.event_name))
        .map((e) => (e.date || '').slice(0, 10)),
    );
    const releaseVols = [];
    const baseVols = [];
    for (let i = window; i < returns.length; i++) {
      const d = returns[i].date.slice(0, 10);
      const vol = rolling[i];
      if (vol == null) continue;
      if (releaseDates.has(d)) releaseVols.push(vol);
      else baseVols.push(vol);
    }
    if (releaseVols.length >= 2 && baseVols.length >= 5) {
      const rel = releaseVols.reduce((a, v) => a + v, 0) / releaseVols.length;
      const base = baseVols.reduce((a, v) => a + v, 0) / baseVols.length;
      if (base > 1e-8) {
        byType[rule.id] = {
          n: releaseVols.length,
          multiplier: +(rel / base).toFixed(2),
          releaseVolPp: +(rel * 100).toFixed(2),
          baselineVolPp: +(base * 100).toFixed(2),
        };
      }
    }
  }
  return byType;
}

export function impliedVolFromSpread(yesBid, yesAsk, prob) {
  if (yesBid == null || yesAsk == null) return null;
  const spread = yesAsk - yesBid;
  if (spread <= 0) return null;
  const p = prob ?? (yesBid + yesAsk) / 2;
  const delta = Math.max(p * (1 - p), 0.02);
  return spread / (2 * delta);
}

export function runVolatilityAnalysis(candles, calendar, seriesKey, options = {}) {
  const window = options.window ?? DEFAULT_WINDOW;
  const returns = logOddsReturns(candles);
  if (returns.length < window + 2) {
    return { returns: [], series: [], garch: null, eventMultipliers: {}, implied: null, realized: null };
  }

  const rs = returns.map((x) => x.r);
  const series = returns.map((row, i) => ({
    date: row.date,
    realized_pp: rollingStd(rs, window, i) != null ? +(rollingStd(rs, window, i) * 100).toFixed(3) : null,
    implied_pp: row.yes_bid != null && row.yes_ask != null
      ? +((impliedVolFromSpread(row.yes_bid, row.yes_ask, row.p) ?? 0) * 100).toFixed(3)
      : null,
  }));

  const garch = fitGarch11(rs);
  if (garch) {
    garch.sig2Path.forEach((s2, i) => {
      if (series[i]) series[i].garch_pp = +(Math.sqrt(s2) * 100).toFixed(3);
    });
  }

  const eventMultipliers = estimateEventVolMultipliers(returns, calendar, seriesKey, window);

  const last = series[series.length - 1];
  const realized = last?.realized_pp ?? null;
  const garchNow = last?.garch_pp ?? null;
  const implied = last?.implied_pp ?? null;
  const spreadSignal = implied != null && garchNow != null ? +(implied - garchNow).toFixed(2) : null;

  return {
    returns,
    series,
    garch,
    eventMultipliers,
    implied,
    realized,
    garchNow,
    spreadSignal,
    window,
  };
}

export { EVENT_IMPACT };
