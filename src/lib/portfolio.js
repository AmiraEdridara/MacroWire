// Portfolio aggregation: net exposure, correlation-weighted risk, concentration.
// Positions are stored locally; risk uses per-ticker σ (volatility endpoint) and the
// correlation matrix of daily changes (correlation endpoint).

const KEY = 'macrowire.portfolio.v1';

export function getPositions() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function save(positions) {
  localStorage.setItem(KEY, JSON.stringify(positions));
  return positions;
}

export function addPosition(pos) {
  const positions = getPositions();
  // One row per ticker+side; adding again replaces it.
  const filtered = positions.filter((p) => !(p.ticker === pos.ticker && p.side === pos.side));
  return save([{ id: `pos-${Date.now()}`, ...pos }, ...filtered]);
}

export function removePosition(id) {
  return save(getPositions().filter((p) => p.id !== id));
}

/** Side-aware entry (ask) and current exit (bid) prices in 0–1. */
export function sidePrices(market, side) {
  if (!market) return { entry: null, exit: null };
  const yesBid = market.yes_bid;
  const yesAsk = market.yes_ask;
  if (side === 'yes') {
    return { entry: yesAsk ?? null, exit: yesBid ?? null };
  }
  return {
    entry: yesBid != null ? 1 - yesBid : null,
    exit: yesAsk != null ? 1 - yesAsk : null,
  };
}

/**
 * @param positions  [{ticker, side, size, entryPrice}]
 * @param marketByTicker  { ticker: market }
 * @param sigmaByTicker   { ticker: dailySigmaPp }  (YES-prob daily σ, pp)
 * @param corr  { tickers:[...], matrix:[[...]] }  Pearson of daily changes
 */
export function computePortfolio(positions, marketByTicker, sigmaByTicker, corr) {
  const rows = positions.map((p) => {
    const m = marketByTicker[p.ticker];
    const { exit } = sidePrices(m, p.side);
    const entry = p.entryPrice;
    const pnlPct = entry != null && exit != null && entry > 0 ? (exit - entry) / entry : null;
    const dollarPnl = pnlPct != null ? p.size * pnlPct : null;
    const sigma = sigmaByTicker[p.ticker] ?? null;
    return {
      ...p,
      market: m,
      entry,
      exit,
      pnlPct: pnlPct != null ? +(pnlPct * 100).toFixed(2) : null,
      dollarPnl: dollarPnl != null ? +dollarPnl.toFixed(2) : null,
      sigma,
      // YES-equivalent direction: a NO position is short the YES probability.
      sign: p.side === 'yes' ? 1 : -1,
    };
  });

  const gross = rows.reduce((s, r) => s + r.size, 0);
  const net = rows.reduce((s, r) => s + r.sign * r.size, 0);
  const totalPnl = rows.reduce((s, r) => s + (r.dollarPnl ?? 0), 0);

  // Concentration
  const hhi = gross > 0 ? rows.reduce((s, r) => s + (r.size / gross) ** 2, 0) : 0;
  const effectiveBets = hhi > 0 ? 1 / hhi : 0;

  // Correlation-weighted portfolio σ (in $ of daily move).
  // weightedVar = ΣΣ (sign_i·size_i·σ_i)(sign_j·size_j·σ_j) ρ_ij , σ in fraction.
  let portfolioSigmaDollar = null;
  let standaloneSigmaDollar = null;
  let diversification = null;
  if (corr?.tickers?.length && corr?.matrix?.length) {
    const idx = Object.fromEntries(corr.tickers.map((t, i) => [t, i]));
    const exposures = rows
      .filter((r) => r.sigma != null && idx[r.ticker] != null)
      .map((r) => ({ ticker: r.ticker, e: r.sign * r.size * (r.sigma / 100) }));
    if (exposures.length) {
      let varSum = 0;
      for (const a of exposures) {
        for (const b of exposures) {
          const rho = a.ticker === b.ticker ? 1 : (corr.matrix[idx[a.ticker]]?.[idx[b.ticker]] ?? 0);
          varSum += a.e * b.e * rho;
        }
      }
      portfolioSigmaDollar = Math.sqrt(Math.max(0, varSum));
      standaloneSigmaDollar = exposures.reduce((s, x) => s + Math.abs(x.e), 0);
      diversification = portfolioSigmaDollar > 1e-9
        ? +(standaloneSigmaDollar / portfolioSigmaDollar).toFixed(2)
        : null;
    }
  }

  return {
    rows,
    gross: +gross.toFixed(2),
    net: +net.toFixed(2),
    totalPnl: +totalPnl.toFixed(2),
    hhi: +hhi.toFixed(3),
    effectiveBets: +effectiveBets.toFixed(1),
    portfolioSigmaDollar: portfolioSigmaDollar != null ? +portfolioSigmaDollar.toFixed(2) : null,
    standaloneSigmaDollar: standaloneSigmaDollar != null ? +standaloneSigmaDollar.toFixed(2) : null,
    diversification,
  };
}
