// src/pages/PortfolioPage.jsx
// Aggregate book view: net exposure, correlation-weighted risk, concentration, MTM.

import { useEffect, useMemo, useState } from "react";
import {
  fetchVolatilityRanking,
  fetchCorrelation,
  formatMarketLabel,
  formatMarketHeadline,
} from "../lib/data";
import {
  getPositions,
  addPosition,
  removePosition,
  sidePrices,
  computePortfolio,
} from "../lib/portfolio";

export default function PortfolioPage({ markets }) {
  const [positions, setPositions] = useState(getPositions);
  const [sigmaByTicker, setSigmaByTicker] = useState({});
  const [corr, setCorr] = useState({ tickers: [], matrix: [] });
  const [search, setSearch] = useState("");
  const [chosen, setChosen] = useState(null);
  const [side, setSide] = useState("yes");
  const [size, setSize] = useState(1000);

  const marketByTicker = useMemo(
    () => Object.fromEntries(markets.map((m) => [m.market_ticker, m])),
    [markets],
  );

  // Per-ticker daily σ (pp) from the volatility endpoint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await fetchVolatilityRanking({ window: 14, limit: 2000 });
        if (cancelled) return;
        const map = {};
        (data.ranking || []).forEach((r) => { map[r.market_ticker] = r.vol_pp; });
        setSigmaByTicker(map);
      } catch { /* leave empty — risk just shows — */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // Correlation matrix across held tickers.
  useEffect(() => {
    const tickers = [...new Set(positions.map((p) => p.ticker))];
    if (tickers.length < 2) { setCorr({ tickers, matrix: [] }); return undefined; }
    let cancelled = false;
    (async () => {
      try {
        const c = await fetchCorrelation(tickers, 60);
        if (!cancelled) setCorr(c);
      } catch {
        if (!cancelled) setCorr({ tickers, matrix: [] });
      }
    })();
    return () => { cancelled = true; };
  }, [positions]);

  const port = useMemo(
    () => computePortfolio(positions, marketByTicker, sigmaByTicker, corr),
    [positions, marketByTicker, sigmaByTicker, corr],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return markets
      .filter((m) =>
        `${m.event_title} ${m.market_title} ${m.market_ticker}`.toLowerCase().includes(q))
      .slice(0, 30);
  }, [search, markets]);

  const handleAdd = () => {
    if (!chosen) return;
    const { entry } = sidePrices(chosen, side);
    if (entry == null) return;
    setPositions(addPosition({
      ticker: chosen.market_ticker,
      side,
      size: Number(size) || 0,
      entryPrice: +entry.toFixed(4),
      label: formatMarketHeadline(chosen),
    }));
    setChosen(null);
    setSearch("");
  };

  const handleRemove = (id) => setPositions(removePosition(id));

  return (
    <div className="forecast-page">
      <div className="page-header">
        <p className="kicker">Portfolio</p>
        <h2 className="page-title">Your book, aggregated</h2>
        <p className="page-sub">
          Net exposure, mark-to-market, and correlation-weighted risk across every position.
          Two contracts that move together aren't real diversification — the daily σ here
          accounts for how correlated your positions actually are. Stored in your browser only.
          Not financial advice.
        </p>
      </div>

      {/* Risk summary */}
      <div className="forecast-summary">
        <Block label="Gross notional" val={`$${port.gross.toLocaleString()}`} />
        <Block label="Net YES exposure" val={`${port.net >= 0 ? "+" : ""}$${port.net.toLocaleString()}`}
          color={port.net >= 0 ? "#4a6b3f" : "#8b3a1e"} sub="YES long − NO short" />
        <Block label="Open P&L" val={`${port.totalPnl >= 0 ? "+" : "-"}$${Math.abs(port.totalPnl).toLocaleString()}`}
          color={port.totalPnl >= 0 ? "#4a6b3f" : "#8b3a1e"} />
        <Block label="Daily σ (1σ)" val={port.portfolioSigmaDollar != null ? `$${port.portfolioSigmaDollar.toLocaleString()}` : "—"}
          sub="correlation-adjusted" />
        <Block label="Diversification" val={port.diversification != null ? `${port.diversification}×` : "—"}
          sub={port.diversification > 1.3 ? "well spread" : "concentrated / correlated"} />
        <Block label="Effective bets" val={port.effectiveBets || "—"} sub={`HHI ${port.hhi}`} />
      </div>

      {/* Position builder */}
      <div className="forecast-chart-card">
        <p className="kicker">Add position</p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end", marginTop: 8 }}>
          <div style={{ flex: "2 1 280px", position: "relative" }}>
            <label className="pf-label">Contract</label>
            <input
              className="pf-input"
              value={chosen ? formatMarketHeadline(chosen) : search}
              onChange={(e) => { setChosen(null); setSearch(e.target.value); }}
              placeholder="Search markets…"
            />
            {!chosen && filtered.length > 0 && (
              <div className="pf-dropdown">
                {filtered.map((m) => (
                  <button key={m.market_ticker} type="button" className="pf-option"
                    onClick={() => { setChosen(m); setSearch(""); }}>
                    {formatMarketHeadline(m)}
                    <span className="pf-option-ticker">{m.market_ticker}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div style={{ flex: "0 0 auto" }}>
            <label className="pf-label">Side</label>
            <div style={{ display: "flex", gap: 4 }}>
              {["yes", "no"].map((s) => (
                <button key={s} type="button" onClick={() => setSide(s)}
                  className={`pf-side ${side === s ? "pf-side-active" : ""}`}>
                  BUY {s.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
          <div style={{ flex: "0 1 140px" }}>
            <label className="pf-label">Size ($)</label>
            <input className="pf-input" type="number" value={size}
              onChange={(e) => setSize(e.target.value)} />
          </div>
          <button type="button" className="pf-add" onClick={handleAdd} disabled={!chosen}>
            Add
          </button>
        </div>
        {chosen && (
          <p className="summary-sub" style={{ marginTop: 8 }}>
            Entry at {(sidePrices(chosen, side).entry * 100 || 0).toFixed(1)}¢ ({side.toUpperCase()} ask).
          </p>
        )}
      </div>

      {/* Positions table */}
      <div className="event-list-card" style={{ marginTop: 16 }}>
        <p className="kicker">Positions ({port.rows.length})</p>
        {port.rows.length === 0 ? (
          <p className="page-sub" style={{ marginTop: 8 }}>No positions yet — add one above.</p>
        ) : (
          <table className="event-table">
            <thead>
              <tr>
                <th>Contract</th><th>Side</th><th>Size</th><th>Entry</th><th>Now</th>
                <th>P&L</th><th>σ (14d)</th><th></th>
              </tr>
            </thead>
            <tbody>
              {port.rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.market ? formatMarketLabel(r.market) : r.label || r.ticker}</td>
                  <td className="mono">{r.side.toUpperCase()}</td>
                  <td className="mono">${r.size.toLocaleString()}</td>
                  <td className="mono">{r.entry != null ? `${(r.entry * 100).toFixed(1)}¢` : "—"}</td>
                  <td className="mono">{r.exit != null ? `${(r.exit * 100).toFixed(1)}¢` : "—"}</td>
                  <td className="mono" style={{ color: (r.dollarPnl ?? 0) >= 0 ? "#4a6b3f" : "#8b3a1e" }}>
                    {r.dollarPnl != null ? `${r.dollarPnl >= 0 ? "+" : "-"}$${Math.abs(r.dollarPnl).toFixed(0)} (${r.pnlPct}%)` : "—"}
                  </td>
                  <td className="mono">{r.sigma != null ? `${r.sigma.toFixed(2)}pp` : "—"}</td>
                  <td>
                    <button type="button" className="pf-remove" onClick={() => handleRemove(r.id)}>×</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Correlation matrix */}
      {corr.tickers.length >= 2 && corr.matrix.length > 0 && (
        <div className="event-list-card" style={{ marginTop: 16 }}>
          <p className="kicker">Correlation of held positions (60d daily changes)</p>
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="corr-table">
              <thead>
                <tr>
                  <th></th>
                  {corr.tickers.map((t) => (
                    <th key={t} className="corr-head">{shortTicker(t, marketByTicker)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {corr.tickers.map((rowT, i) => (
                  <tr key={rowT}>
                    <th className="corr-row-head">{shortTicker(rowT, marketByTicker)}</th>
                    {corr.tickers.map((colT, j) => {
                      const v = corr.matrix[i]?.[j] ?? 0;
                      return (
                        <td key={colT} className="corr-cell" style={{ background: corrColor(v), color: Math.abs(v) > 0.6 ? "#fff" : "#1a1814" }}>
                          {v.toFixed(2)}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="summary-sub" style={{ marginTop: 8 }}>
            Deep blue = strongly co-moving (crowded into one bet); red = hedging each other.
          </p>
        </div>
      )}

      <style>{`
        .forecast-page { padding: 24px 0; }
        .page-header { margin-bottom: 24px; }
        .kicker { font-family: "IBM Plex Sans", sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #8b3a1e; margin: 0 0 4px; }
        .page-title { font-family: "Newsreader", serif; font-size: 28px; font-weight: 600; margin: 0 0 6px; color: #1a1814; }
        .page-sub { font-family: "Newsreader", serif; font-style: italic; color: #6e685f; margin: 0; max-width: 80ch; }
        .forecast-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px; padding: 16px; background: #f3ede0; border: 1px solid #d9d2c4; }
        .summary-val { font-family: "Newsreader", serif; font-size: 24px; font-weight: 600; color: #1a1814; margin: 0; }
        .summary-sub { font-family: "IBM Plex Sans", sans-serif; font-size: 11px; color: #6e685f; margin: 4px 0 0; }
        .forecast-chart-card { border: 1px solid #d9d2c4; padding: 20px; background: #faf6ef; margin-bottom: 4px; }
        .event-list-card { border: 1px solid #d9d2c4; padding: 16px 20px; background: #faf6ef; }
        .event-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-family: "IBM Plex Sans", sans-serif; font-size: 12px; }
        .event-table th { text-align: left; padding: 6px 10px; border-bottom: 2px solid #1a1814; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; color: #6e685f; font-weight: 500; }
        .event-table td { padding: 8px 10px; border-bottom: 1px solid #e8e0d0; }
        .mono { font-family: "IBM Plex Mono", monospace; }
        .pf-label { display: block; font-family: "IBM Plex Sans", sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e685f; margin-bottom: 4px; }
        .pf-input { width: 100%; box-sizing: border-box; font-family: "IBM Plex Sans", sans-serif; font-size: 13px; padding: 7px 9px; border: 1px solid #d9d2c4; background: #fff; }
        .pf-dropdown { position: absolute; z-index: 20; left: 0; right: 0; background: #fff; border: 1px solid #d9d2c4; max-height: 260px; overflow-y: auto; box-shadow: 0 6px 20px rgba(0,0,0,0.1); }
        .pf-option { display: flex; justify-content: space-between; gap: 10px; width: 100%; text-align: left; padding: 8px 10px; border: none; border-bottom: 1px solid #f0eadd; background: #fff; cursor: pointer; font-family: "Newsreader", serif; font-size: 13px; }
        .pf-option:hover { background: #f3ede0; }
        .pf-option-ticker { font-family: "IBM Plex Mono", monospace; font-size: 10px; color: #6e685f; flex-shrink: 0; }
        .pf-side { padding: 7px 12px; border: 1px solid #d9d2c4; background: #fff; font-family: "IBM Plex Sans", sans-serif; font-size: 11px; font-weight: 600; letter-spacing: 0.06em; cursor: pointer; }
        .pf-side-active { background: #1a1814; color: #faf6ef; border-color: #1a1814; }
        .pf-add { padding: 8px 18px; background: #4a6fa5; color: #fff; border: none; font-family: "IBM Plex Sans", sans-serif; font-size: 12px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; cursor: pointer; }
        .pf-add:disabled { opacity: 0.4; cursor: not-allowed; }
        .pf-remove { border: none; background: none; color: #8b3a1e; font-size: 16px; cursor: pointer; line-height: 1; }
        .corr-table { border-collapse: collapse; font-family: "IBM Plex Mono", monospace; font-size: 11px; }
        .corr-head, .corr-row-head { padding: 6px 8px; font-size: 10px; color: #6e685f; white-space: nowrap; }
        .corr-row-head { text-align: right; border-right: 1px solid #d9d2c4; }
        .corr-cell { padding: 8px 12px; text-align: center; min-width: 52px; }
      `}</style>
    </div>
  );
}

function Block({ label, val, sub, color }) {
  return (
    <div>
      <p className="kicker" style={{ marginBottom: 6 }}>{label}</p>
      <p className="summary-val" style={color ? { color } : undefined}>{val}</p>
      {sub && <p className="summary-sub">{sub}</p>}
    </div>
  );
}

function shortTicker(t, marketByTicker) {
  const m = marketByTicker[t];
  if (m) {
    const lbl = formatMarketLabel(m);
    return lbl.length > 16 ? lbl.slice(0, 15) + "…" : lbl;
  }
  return t.length > 16 ? t.slice(0, 15) + "…" : t;
}

function corrColor(v) {
  // blue for positive co-movement, red for negative
  if (v >= 0) {
    const a = Math.min(1, v);
    return `rgba(74,111,165,${0.12 + 0.78 * a})`;
  }
  const a = Math.min(1, -v);
  return `rgba(139,58,30,${0.12 + 0.78 * a})`;
}
