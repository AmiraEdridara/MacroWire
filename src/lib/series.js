export function movingAverage(data, window = 7) {
  return data.map((d, i) => {
    if (i < window - 1) return { ...d, ma: null };
    const slice = data.slice(i - window + 1, i + 1);
    const avg = slice.reduce((s, x) => s + x.prob, 0) / window;
    return { ...d, ma: parseFloat(avg.toFixed(4)) };
  });
}

export function rollingVol(data, window = 14) {
  const changes = data.map((d, i) => (i === 0 ? 0 : d.prob - data[i - 1].prob));
  return data.map((d, i) => {
    if (i < window - 1) return { ...d, vol: null };
    const slice = changes.slice(i - window + 1, i + 1);
    const mean = slice.reduce((s, x) => s + x, 0) / window;
    const variance = slice.reduce((s, x) => s + (x - mean) ** 2, 0) / window;
    return { ...d, vol: parseFloat(Math.sqrt(variance).toFixed(5)) };
  });
}

export function detectRegimes(data) {
  return data.map((d, i) => {
    if (i < 14) return { ...d, regime: "neutral" };
    const delta = d.prob - data[i - 14].prob;
    const regime =
      delta > 0.08 ? "repricing-up" : delta < -0.08 ? "repricing-down" : "neutral";
    return { ...d, regime };
  });
}

/** Raw {date, prob, volume?} points → chart-ready series with overlays. */
export function enrichSeries(rawPoints, calendarEvents = []) {
  const sorted = [...rawPoints].sort((a, b) => a.date.localeCompare(b.date));
  const withEvents = sorted.map((d) => ({
    ...d,
    prob: Number(d.prob),
    volume: d.volume ?? 0,
    event: calendarEvents.find((e) => e.date === d.date) || null,
  }));
  return detectRegimes(rollingVol(movingAverage(withEvents, 7), 14));
}
