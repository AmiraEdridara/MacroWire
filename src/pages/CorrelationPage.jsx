// src/pages/CorrelationPage.jsx
// Cross-market correlation: which contracts move together?
//
// Pearson correlation of daily prob changes across the most liquid markets.
// Lets users see — e.g. when Fed-hold odds rise, what else moves with them?
//
// Drop into src/pages/. Register route in App.jsx hash router: '#correlation'

import { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import { formatMarketLabel } from "../lib/data";

// ----- correlation helpers -----
const pearson = (a, b) => {
  // a, b are aligned arrays of equal length; returns r ∈ [-1, 1]
  const n = a.length;
  if (n < 3) return null;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  if (!denom) return null;
  return num / denom;
};

const dailyChanges = (rows) => {
  // rows sorted by date, returns array of daily Δ in prob
  const out = [];
  for (let i = 1; i < rows.length; i++) {
    out.push({ date: rows[i].date, delta: rows[i].prob - rows[i - 1].prob });
  }
  return out;
};

// Align two date->value maps on common dates
const alignSeries = (a, b) => {
  const keys = [...a.keys()].filter((k) => b.has(k)).sort();
  return {
    a: keys.map((k) => a.get(k)),
    b: keys.map((k) => b.get(k)),
    dates: keys,
  };
};

const corrColor = (r) => {
  if (r == null) return "#e8e0d0";
  const intensity = Math.min(Math.abs(r), 1);
  if (r > 0) {
    // green/blue tint for positive
    const a = Math.round(intensity * 220);
    return `rgba(74, 107, 63, ${0.15 + intensity * 0.6})`;
  } else {
    // rust for negative
    const a = Math.round(intensity * 220);
    return `rgba(139, 58, 30, ${0.15 + intensity * 0.6})`;
  }
};

const fmtMatrixLabel = (entry) => {
  if (!entry) return "";
  const label = entry.label || entry.ticker || "";
  return label.length > 32 ? label.slice(0, 32) + "…" : label;
};

const contractLabel = (markets, ticker) => {
  const m = (markets || []).find((x) => x.market_ticker === ticker);
  return m ? formatMarketLabel(m) : ticker;
};

export default function CorrelationPage({ candles, markets }) {
  const [matrixSize, setMatrixSize] = useState(8);
  const [pairA, setPairA] = useState("");
  const [pairB, setPairB] = useState("");

  // Group candles by market_ticker → Map<date, prob>
  const byTicker = useMemo(() => {
    const map = new Map();
    (candles || []).forEach((c) => {
      if (c.close_prob == null) return;
      if (!map.has(c.market_ticker)) map.set(c.market_ticker, new Map());
      map.get(c.market_ticker).set(c.date, +(c.close_prob * 100));
    });
    return map;
  }, [candles]);

  // Liquid tickers with enough history
  const candidateTickers = useMemo(() => {
    const list = [];
    byTicker.forEach((dateMap, ticker) => {
      if (dateMap.size >= 30) {
        const m = (markets || []).find((x) => x.market_ticker === ticker);
        list.push({
          ticker,
          n: dateMap.size,
          volume: m?.volume || 0,
          title: m?.event_title || ticker,
          label: m ? formatMarketLabel(m) : ticker,
          series: m?.series_ticker || "",
        });
      }
    });
    list.sort((a, b) => b.volume - a.volume);
    return list;
  }, [byTicker, markets]);

  // Default pair selection
  useEffect(() => {
    if (candidateTickers.length >= 2) {
      if (!pairA) setPairA(candidateTickers[0].ticker);
      if (!pairB) setPairB(candidateTickers[1].ticker);
    }
  }, [candidateTickers, pairA, pairB]);

  // Build matrix
  const matrixTickers = candidateTickers.slice(0, matrixSize);
  const matrix = useMemo(() => {
    const out = [];
    for (const ra of matrixTickers) {
      const row = [];
      for (const rb of matrixTickers) {
        if (ra.ticker === rb.ticker) {
          row.push(1);
          continue;
        }
        const a = byTicker.get(ra.ticker);
        const b = byTicker.get(rb.ticker);
        if (!a || !b) {
          row.push(null);
          continue;
        }
        // Use changes (not levels) for correlation — co-movement, not co-level
        const aligned = alignSeries(a, b);
        if (aligned.a.length < 10) {
          row.push(null);
          continue;
        }
        const dA = [], dB = [];
        for (let i = 1; i < aligned.a.length; i++) {
          dA.push(aligned.a[i] - aligned.a[i - 1]);
          dB.push(aligned.b[i] - aligned.b[i - 1]);
        }
        row.push(pearson(dA, dB));
      }
      out.push(row);
    }
    return out;
  }, [matrixTickers, byTicker]);

  // Pair detail: overlay chart + correlation summary
  const pairData = useMemo(() => {
    if (!pairA || !pairB) return { rows: [], r: null, labelA: "", labelB: "" };
    const a = byTicker.get(pairA);
    const b = byTicker.get(pairB);
    if (!a || !b) return { rows: [], r: null, labelA: "", labelB: "" };
    const labelA = contractLabel(markets, pairA);
    const labelB = contractLabel(markets, pairB);
    const dates = [...a.keys()].filter((k) => b.has(k)).sort();
    const rows = dates.map((d) => ({ date: d, [labelA]: a.get(d), [labelB]: b.get(d) }));
    const dA = [], dB = [];
    for (let i = 1; i < dates.length; i++) {
      dA.push(a.get(dates[i]) - a.get(dates[i - 1]));
      dB.push(b.get(dates[i]) - b.get(dates[i - 1]));
    }
    return { rows, r: pearson(dA, dB), labelA, labelB };
  }, [pairA, pairB, byTicker, markets]);

  // Top co-movers for a chosen anchor
  const topMovers = useMemo(() => {
    if (!pairA) return [];
    const a = byTicker.get(pairA);
    if (!a) return [];
    const results = [];
    candidateTickers.forEach((c) => {
      if (c.ticker === pairA) return;
      const b = byTicker.get(c.ticker);
      const aligned = alignSeries(a, b);
      if (aligned.a.length < 15) return;
      const dA = [], dB = [];
      for (let i = 1; i < aligned.a.length; i++) {
        dA.push(aligned.a[i] - aligned.a[i - 1]);
        dB.push(aligned.b[i] - aligned.b[i - 1]);
      }
      const r = pearson(dA, dB);
      if (r != null) results.push({ ticker: c.ticker, title: c.title, label: c.label, series: c.series, r });
    });
    results.sort((x, y) => Math.abs(y.r) - Math.abs(x.r));
    return results.slice(0, 12);
  }, [pairA, candidateTickers, byTicker]);

  return (
    <div className="corr-page">
      <div className="page-header">
        <p className="kicker">Cross-market correlation</p>
        <h2 className="page-title">What moves together</h2>
        <p className="page-sub">
          Pearson correlation on daily probability changes (not levels). Positive ρ means contracts that rise and fall on the same days; negative means they trade against each other.
        </p>
      </div>

      <div className="corr-controls">
        <div className="ctrl">
          <label>Matrix size</label>
          <select value={matrixSize} onChange={(e) => setMatrixSize(+e.target.value)}>
            <option value={6}>Top 6</option>
            <option value={8}>Top 8</option>
            <option value={12}>Top 12</option>
            <option value={16}>Top 16</option>
          </select>
        </div>
        <div className="ctrl">
          <label>Anchor contract (A)</label>
          <select value={pairA} onChange={(e) => setPairA(e.target.value)}>
            {candidateTickers.map((t) => (
              <option key={t.ticker} value={t.ticker}>{t.label}</option>
            ))}
          </select>
        </div>
        <div className="ctrl">
          <label>Compared with (B)</label>
          <select value={pairB} onChange={(e) => setPairB(e.target.value)}>
            {candidateTickers.map((t) => (
              <option key={t.ticker} value={t.ticker}>{t.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="matrix-card">
        <p className="kicker">Correlation matrix · top {matrixSize} liquid markets</p>
        <div className="matrix-scroll">
          <table className="corr-matrix">
            <thead>
              <tr>
                <th></th>
                {matrixTickers.map((t) => (
                  <th key={t.ticker} className="diag">
                    <div className="diag-text">{fmtMatrixLabel(t)}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {matrix.map((row, i) => (
                <tr key={i}>
                  <th className="row-label">{fmtMatrixLabel(matrixTickers[i])}</th>
                  {row.map((r, j) => (
                    <td key={j}
                        className="cell"
                        style={{ background: corrColor(r) }}
                        onClick={() => { setPairA(matrixTickers[i].ticker); setPairB(matrixTickers[j].ticker); }}
                        title={`${matrixTickers[i].label} vs ${matrixTickers[j].label}: ${r == null ? "—" : r.toFixed(2)}`}>
                      {r == null ? "—" : r.toFixed(2)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="legend-line">
          <span className="sw" style={{ background: "rgba(74,107,63,0.7)" }}></span> Strong positive
          <span className="sw" style={{ background: "rgba(74,107,63,0.25)" }}></span> Weak positive
          <span className="sw" style={{ background: "#e8e0d0" }}></span> ~0
          <span className="sw" style={{ background: "rgba(139,58,30,0.25)" }}></span> Weak negative
          <span className="sw" style={{ background: "rgba(139,58,30,0.7)" }}></span> Strong negative
        </p>
      </div>

      {pairData.rows.length > 0 && (
        <div className="pair-card">
          <p className="kicker">Pair detail</p>
          <h3 className="chart-h">
            {pairData.labelA} <span className="vs">vs</span> {pairData.labelB}
            <span className="r-badge" style={{ background: corrColor(pairData.r) }}>
              ρ = {pairData.r == null ? "—" : pairData.r.toFixed(3)}
            </span>
          </h3>
          <div style={{ height: 280 }}>
            <ResponsiveContainer>
              <LineChart data={pairData.rows} margin={{ top: 16, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke="#e8e0d0" strokeDasharray="3 3" />
                <XAxis dataKey="date" stroke="#6e685f" tick={{ fontSize: 11 }} minTickGap={40} />
                <YAxis domain={[0, 100]} stroke="#6e685f" tick={{ fontSize: 11 }} tickFormatter={(v) => v + "¢"} />
                <Tooltip
                  contentStyle={{ background: "#faf6ef", border: "1px solid #d9d2c4", fontFamily: "Newsreader, serif" }}
                  formatter={(v) => (v != null ? v.toFixed(1) + "¢" : "—")}
                />
                <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Sans, sans-serif" }} />
                <Line type="monotone" dataKey={pairData.labelA} name={pairData.labelA} stroke="#1a1814" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey={pairData.labelB} name={pairData.labelB} stroke="#4a6fa5" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {topMovers.length > 0 && (
        <div className="movers-card">
          <p className="kicker">Markets that move most with {contractLabel(markets, pairA)}</p>
          <table className="movers-table">
            <thead>
              <tr>
                <th>Contract</th>
                <th>Series</th>
                <th style={{ textAlign: "right" }}>ρ</th>
                <th>Strength</th>
              </tr>
            </thead>
            <tbody>
              {topMovers.map((m, i) => (
                <tr key={i} onClick={() => setPairB(m.ticker)} className="row-click">
                  <td>
                    <div className="mover-label">{m.label}</div>
                    {m.title !== m.label && <div className="mover-sub">{m.title}</div>}
                  </td>
                  <td className="dim">{m.title}</td>
                  <td className="mono" style={{ textAlign: "right", color: m.r > 0 ? "#4a6b3f" : "#8b3a1e" }}>
                    {m.r.toFixed(2)}
                  </td>
                  <td>
                    <div className="bar-wrap">
                      <div className="bar"
                           style={{
                             width: Math.abs(m.r) * 100 + "%",
                             background: m.r > 0 ? "#4a6b3f" : "#8b3a1e",
                           }} />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .corr-page { padding: 24px 0; }
        .page-header { margin-bottom: 24px; }
        .kicker { font-family: "IBM Plex Sans", sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #8b3a1e; margin: 0 0 4px; }
        .page-title { font-family: "Newsreader", serif; font-size: 28px; font-weight: 600; margin: 0 0 6px; color: #1a1814; }
        .page-sub { font-family: "Newsreader", serif; font-style: italic; color: #6e685f; margin: 0; max-width: 60ch; }
        .corr-controls { display: flex; gap: 24px; padding: 12px 0; border-top: 1px solid #d9d2c4; border-bottom: 1px solid #d9d2c4; margin-bottom: 20px; flex-wrap: wrap; }
        .ctrl { display: flex; flex-direction: column; gap: 4px; }
        .ctrl label { font-family: "IBM Plex Sans", sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e685f; }
        .ctrl select { font-family: "IBM Plex Sans", sans-serif; font-size: 13px; padding: 4px 8px; border: 1px solid #d9d2c4; background: #faf6ef; min-width: 220px; }
        .matrix-card, .pair-card, .movers-card { border: 1px solid #d9d2c4; padding: 16px 20px; background: #faf6ef; margin-bottom: 20px; }
        .matrix-scroll { overflow-x: auto; margin-top: 12px; }
        .corr-matrix { border-collapse: collapse; font-family: "IBM Plex Mono", monospace; font-size: 11px; }
        .corr-matrix th { padding: 4px 6px; font-weight: 400; color: #6e685f; }
        .corr-matrix .row-label { text-align: right; padding-right: 10px; white-space: nowrap; max-width: 220px; overflow: hidden; text-overflow: ellipsis; font-family: "Newsreader", serif; font-size: 11px; font-weight: 500; }
        .corr-matrix .diag { writing-mode: vertical-rl; transform: rotate(180deg); height: 120px; vertical-align: bottom; padding-bottom: 6px; }
        .corr-matrix .diag-text { max-width: 110px; overflow: hidden; text-overflow: ellipsis; font-family: "Newsreader", serif; font-size: 10px; font-weight: 500; }
        .corr-matrix .cell { width: 56px; height: 32px; text-align: center; vertical-align: middle; cursor: pointer; border: 1px solid #faf6ef; color: #1a1814; font-weight: 500; }
        .corr-matrix .cell:hover { outline: 2px solid #1a1814; }
        .legend-line { display: flex; gap: 14px; align-items: center; flex-wrap: wrap; font-family: "IBM Plex Sans", sans-serif; font-size: 11px; color: #6e685f; margin: 12px 0 0; }
        .sw { display: inline-block; width: 16px; height: 12px; border: 1px solid #d9d2c4; margin-right: 4px; vertical-align: middle; }
        .chart-h { font-family: "Newsreader", serif; font-size: 16px; font-weight: 600; margin: 8px 0 12px; color: #1a1814; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .vs { color: #6e685f; font-style: italic; font-weight: 400; }
        .r-badge { padding: 3px 10px; font-size: 12px; font-family: "IBM Plex Mono", monospace; border: 1px solid #d9d2c4; color: #1a1814; }
        .mover-label { font-family: "Newsreader", serif; font-size: 13px; font-weight: 500; }
        .mover-sub { font-size: 11px; color: #6e685f; font-style: italic; margin-top: 2px; }
        .movers-table { width: 100%; border-collapse: collapse; font-family: "IBM Plex Sans", sans-serif; font-size: 12px; margin-top: 10px; }
        .movers-table th { text-align: left; padding: 6px 10px; border-bottom: 2px solid #1a1814; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; color: #6e685f; font-weight: 500; }
        .movers-table td { padding: 8px 10px; border-bottom: 1px solid #e8e0d0; }
        .row-click { cursor: pointer; }
        .row-click:hover td { background: #f3ede0; }
        .mono { font-family: "IBM Plex Mono", monospace; }
        .dim { color: #6e685f; }
        .bar-wrap { width: 100%; max-width: 180px; height: 6px; background: #e8e0d0; }
        .bar { height: 100%; }
      `}</style>
    </div>
  );
}
