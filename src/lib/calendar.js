/** Merge ForexFactory / API calendar onto chart rows by ISO date. */

export function mergeCalendarIntoSeries(rows, events) {
  if (!events?.length || !rows?.length) return rows;
  const byDate = new Map();
  for (const e of events) {
    const d = e.date?.slice?.(0, 10) || e.date;
    if (!d) continue;
    if (!byDate.has(d)) byDate.set(d, { isFedDay: false, isNewsDay: false, eventLabel: null });
    const slot = byDate.get(d);
    if (e.is_fed || e.type === "fed") slot.isFedDay = true;
    if (e.is_macro || e.is_fed || e.type) slot.isNewsDay = true;
    if (!slot.eventLabel) slot.eventLabel = e.label || e.title;
  }
  return rows.map((row) => {
    const d = row.date?.slice?.(0, 10) || row.date;
    const hit = byDate.get(d);
    if (!hit) return row;
    return {
      ...row,
      isFedDay: hit.isFedDay,
      isNewsDay: hit.isNewsDay,
      eventLabel: hit.eventLabel,
    };
  });
}

export function sortMarketsByMacro(markets) {
  return [...markets].sort((a, b) => {
    const ma = a.isMacro ? 1 : 0;
    const mb = b.isMacro ? 1 : 0;
    if (mb !== ma) return mb - ma;
    return (b.macroRank || 0) - (a.macroRank || 0);
  });
}

export function filterMarkets(markets, filter) {
  if (!filter || filter === "all") return markets;
  if (filter === "macro") return markets.filter((m) => m.isMacro);
  return markets.filter((m) => m.shelf === filter || m.category === filter);
}

export const SHELF_FILTERS = [
  { id: "all", label: "All" },
  { id: "macro", label: "Macro" },
  { id: "Economics", label: "Economics" },
  { id: "Politics", label: "Politics" },
  { id: "World", label: "World" },
];
