/** Normalize API / Parquet JSON rows into consistent 0–1 prices and pp spreads. */

function toProb01(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  if (n > 1 && n <= 100) return n / 100;
  return n;
}

function toSpreadPp(v, bid01, ask01) {
  if (v != null && v !== "") {
    const n = Number(v);
    if (Number.isFinite(n)) return n > 1 ? n : n * 100;
  }
  if (bid01 != null && ask01 != null) return (ask01 - bid01) * 100;
  return null;
}

export function normalizePoint(row) {
  const bid = toProb01(row.bid ?? row.yes_bid ?? row.yesBid);
  const ask = toProb01(row.ask ?? row.yes_ask ?? row.yesAsk);
  const prob =
    toProb01(row.prob ?? row.yes_price ?? row.yesPrice ?? row.mid ?? row.price) ??
    (bid != null && ask != null ? (bid + ask) / 2 : bid ?? ask);

  return {
    date: row.date ?? row.ts?.slice?.(0, 10) ?? "",
    prob,
    bid,
    ask,
    spreadPp: toSpreadPp(row.spread ?? row.spread_pp ?? row.spreadPp, bid, ask),
    volume: Number(row.volume ?? row.trade_volume ?? row.tradeVolume ?? 0) || 0,
  };
}

export function normalizeMarket(row) {
  const id = row.marketId ?? row.market_id ?? row.id ?? row.ticker;
  const bid = toProb01(row.bid ?? row.yes_bid);
  const ask = toProb01(row.ask ?? row.yes_ask);
  const prob =
    toProb01(row.prob ?? row.yes_price ?? row.last_price) ??
    (bid != null && ask != null ? (bid + ask) / 2 : null);

  return {
    id,
    ticker: row.ticker ?? id,
    label: row.label ?? row.title ?? row.ticker ?? id,
    category: row.category ?? row.series_ticker ?? row.seriesTicker ?? "Macro",
    description: row.description ?? "",
    resolution: row.resolution ?? row.close_time ?? "",
    seriesTicker: row.seriesTicker ?? row.series_ticker ?? "",
    prob,
    bid,
    ask,
    spreadPp: toSpreadPp(row.spread ?? row.spread_pp, bid, ask),
    volume: Number(row.volume ?? 0) || 0,
  };
}

export function filterByRange(points, days) {
  if (!points.length || !days) return points;
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  const cut = cutoff.toISOString().slice(0, 10);
  return points.filter((p) => p.date >= cut);
}

export function computeKpis(points, rangeDays) {
  if (!points.length) {
    return {
      probPct: null,
      bidPct: null,
      askPct: null,
      totalVolume: 0,
      avgSpreadPp: null,
      coveragePct: null,
    };
  }
  const latest = points[points.length - 1];
  const spreads = points.map((p) => p.spreadPp).filter((s) => s != null);
  const withProb = points.filter((p) => p.prob != null);

  return {
    probPct: latest.prob != null ? latest.prob * 100 : null,
    bidPct: latest.bid != null ? latest.bid * 100 : null,
    askPct: latest.ask != null ? latest.ask * 100 : null,
    totalVolume: points.reduce((s, p) => s + (p.volume || 0), 0),
    avgSpreadPp: spreads.length
      ? spreads.reduce((a, b) => a + b, 0) / spreads.length
      : null,
    coveragePct: rangeDays
      ? Math.min(100, (withProb.length / rangeDays) * 100)
      : null,
  };
}

export function formatVolume(n) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return String(Math.round(n));
}
