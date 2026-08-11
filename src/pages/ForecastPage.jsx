// src/pages/ForecastPage.jsx
// Log-odds AR(1) + OU mean reversion + event-conditional nudges from historical release days.

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, Legend,
} from "recharts";
import { formatMarketLabel, groupMarketsBySeries } from "../lib/data";
import {
  estimateEventNudges,
  logOdds,
  runForecast,
  upcomingLinkedEvents,
} from "../lib/forecastModel";
import { forecastGarchVariance } from "../lib/volatilityModel";

function contractOptionLabel(market, ticker) {
  if (!market) return ticker;
  const bin = formatMarketLabel(market);
  const event = (market.event_title || "").trim();
  if (event && event !== bin) return `${bin} — ${event}`;
  return bin;
}

export default function ForecastPage({ candles, markets, calendar }) {
  const [ticker, setTicker] = useState("");
  const [filterSeries, setFilterSeries] = useState('all');
  const [horizonDays, setHorizonDays] = useState(30);
  const [fullCalendar, setFullCalendar] = useState(calendar || []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/calendar?days_back=400&days_forward=120");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setFullCalendar(data.events || []);
      } catch {
        if (!cancelled) setFullCalendar(calendar || []);
      }
    })();
    return () => { cancelled = true; };
  }, [calendar]);

  const seriesGroups = useMemo(() => groupMarketsBySeries(markets), [markets]);

  const tickersWithHistory = useMemo(() => {
    if (!candles) return [];
    const set = new Set();
    candles.forEach((c) => {
      if (c.market_ticker) set.add(c.market_ticker);
      if (c.condition_id) set.add(c.condition_id);
    });
    return [...set];
  }, [candles]);

  const availableMarkets = useMemo(() => {
    const withHistory = markets.filter(m => tickersWithHistory.includes(m.market_ticker));
    if (filterSeries === 'all') return withHistory;
    return withHistory.filter(m => m.series_ticker === filterSeries);
  }, [markets, tickersWithHistory, filterSeries]);

  // When series filter changes, auto-select the first contract in that series.
  useEffect(() => {
    if (!availableMarkets.length) return;
    setTicker(availableMarkets[0].market_ticker);
  }, [filterSeries]);

  // Initial pick once candle history has loaded.
  useEffect(() => {
    if (!ticker && availableMarkets.length) setTicker(availableMarkets[0].market_ticker);
  }, [availableMarkets, ticker]);

  const history = useMemo(() => {
    if (!candles || !ticker) return [];
    return candles
      .filter((c) => c.market_ticker === ticker && c.close_prob != null)
      .map((c) => ({ date: c.date, p: c.close_prob }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [candles, ticker]);

  const market = useMemo(
    () => (markets || []).find((m) => m.market_ticker === ticker),
    [markets, ticker],
  );

  const seriesKey = market?.series_ticker || "";

  const { byDate: eventNudgesByDate, byType: eventNudgeStats } = useMemo(
    () => estimateEventNudges(history, fullCalendar, seriesKey),
    [history, fullCalendar, seriesKey],
  );

  const relevantEvents = useMemo(
    () => upcomingLinkedEvents(fullCalendar, market, horizonDays),
    [fullCalendar, market, horizonDays],
  );

  // GARCH(1,1) variance propagation for the confidence band — vol clusters around
  // releases, so iid σ·√t understates near-term uncertainty and overstates the tail.
  const garchVar = useMemo(() => {
    if (history.length < 32) return null;
    const ys = history.map((h) => logOdds(h.p));
    const logReturns = [];
    for (let i = 1; i < ys.length; i++) logReturns.push(ys[i] - ys[i - 1]);
    return forecastGarchVariance(logReturns, horizonDays);
  }, [history, horizonDays]);

  const forecast = useMemo(
    () => runForecast(history, horizonDays, eventNudgesByDate, { bandSd: garchVar?.cumSd }),
    [history, horizonDays, eventNudgesByDate, garchVar],
  );

  const chartData = useMemo(() => {
    const histRows = history.map((h) => ({
      date: h.date,
      actual: +(h.p * 100).toFixed(2),
    }));
    const fcRows = forecast.trend.map((f) => ({
      date: f.date,
      forecast: f.forecast,
      upper: f.upper,
      lower: f.lower,
    }));
    return [...histRows, ...fcRows];
  }, [history, forecast]);

  const lastCandle = history.length ? history[history.length - 1] : null;
  const currentProb = lastCandle ? +(lastCandle.p * 100).toFixed(1) : market?.prob;
  const lastCandleDate = lastCandle?.date ?? null;
  const projectedProb = forecast.finalProb;
  const projectedChange = projectedProb != null && currentProb != null
    ? +(projectedProb - currentProb).toFixed(1) : null;
  const projectionBase = lastCandleDate ? `vs ${lastCandleDate}` : "vs last known";

  const params = forecast.params;
  const betaLabel = params?.beta != null
    ? (Math.abs(params.beta) < 0.05 ? "≈ random" : params.beta > 0 ? "momentum" : "mean revert")
    : "—";

  return (
    <div className="forecast-page">
      <div className="page-header">
        <p className="kicker">Probability forecast</p>
        <h2 className="page-title">Where the market may move next</h2>
        <p className="page-sub">
          Price projections based on historical patterns and upcoming macro events. Shows where the market might 
          move over different time periods with confidence bands. Filter by series or view all contracts. Not financial advice.
        </p>
      </div>

      <div className="forecast-controls">
        <div className="ctrl">
          <label>Series Filter</label>
          <select value={filterSeries} onChange={(e) => setFilterSeries(e.target.value)}>
            <option value="all">All Series ({tickersWithHistory.length} contracts)</option>
            {seriesGroups.map((g) => {
              const withHistory = g.markets.filter(m => tickersWithHistory.includes(m.market_ticker));
              if (withHistory.length === 0) return null;
              return (
                <option key={g.series_ticker} value={g.series_ticker}>
                  {g.event_title} ({withHistory.length})
                </option>
              );
            })}
          </select>
        </div>
        <div className="ctrl">
          <label>Contract</label>
          <select value={ticker} onChange={(e) => setTicker(e.target.value)}>
            {availableMarkets.map((m) => (
              <option key={m.market_ticker} value={m.market_ticker}>
                {formatMarketLabel(m)}
              </option>
            ))}
          </select>
        </div>
        <div className="ctrl">
          <label>Horizon</label>
          <select value={horizonDays} onChange={(e) => setHorizonDays(+e.target.value)}>
            <option value={14}>14 days</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
          </select>
        </div>
      </div>

      {market && params && (
        <div className="forecast-summary">
          <div className="summary-block">
            <p className="kicker">Last Known Price</p>
            <p className="summary-val">{currentProb?.toFixed(1)}¢</p>
            <p className="summary-sub" style={{ color: "#8b3a1e" }}>as of {lastCandleDate ?? "—"}</p>
          </div>
          <div className="summary-block">
            <p className="kicker">{horizonDays}-Day Projection</p>
            <p className="summary-val" style={{ color: projectedChange > 0 ? "#4a6b3f" : "#8b3a1e" }}>
              {projectedProb?.toFixed(1)}¢
            </p>
            <p className="summary-sub">
              {projectedChange != null ? (projectedChange > 0 ? "+" : "") + projectedChange + "pp" : "—"} {projectionBase}
            </p>
          </div>
          <div className="summary-block">
            <p className="kicker">Confidence Band</p>
            <p className="summary-val">
              {(() => {
                const last = forecast.trend[forecast.trend.length - 1];
                return last ? `±${(((last.upper - last.lower) / 2)).toFixed(0)}¢` : "—";
              })()}
            </p>
            <p className="summary-sub">
              90% range · {forecast.bandMethod === "garch" ? "GARCH(1,1)" : "iid σ√t"}
            </p>
          </div>
          <div className="summary-block">
            <p className="kicker">Market Pattern</p>
            <p className="summary-val">{betaLabel}</p>
            <p className="summary-sub">Based on recent moves</p>
          </div>
          <div className="summary-block">
            <p className="kicker">Linked Releases</p>
            <p className="summary-val">{relevantEvents.length}</p>
            <p className="summary-sub">in {horizonDays}-day period</p>
          </div>
        </div>
      )}

      <div className="forecast-chart-card">
        <p className="kicker">{market?.event_title || "Select a contract"}</p>
        <h3 className="chart-h">{market ? formatMarketLabel(market) : "—"}</h3>
        <div style={{ height: 340 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 20, right: 20, left: 0, bottom: 8 }}>
              <CartesianGrid stroke="#e8e0d0" strokeDasharray="3 3" />
              <XAxis dataKey="date" stroke="#6e685f" tick={{ fontSize: 11 }} minTickGap={40} />
              <YAxis domain={[0, 100]} stroke="#6e685f" tick={{ fontSize: 11 }} tickFormatter={(v) => v + "¢"} />
              <Tooltip
                contentStyle={{ background: "#faf6ef", border: "1px solid #d9d2c4", fontFamily: "Newsreader, serif" }}
                formatter={(v) => (v != null ? v.toFixed(1) + "¢" : "—")}
              />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "IBM Plex Sans, sans-serif" }} />
              <Line type="monotone" dataKey="actual" stroke="#1a1814" strokeWidth={2} dot={false} name="Historical YES" connectNulls />
              <Line type="monotone" dataKey="forecast" stroke="#4a6fa5" strokeWidth={2} strokeDasharray="5 4" dot={false} name="Forecast" connectNulls />
              <Line type="monotone" dataKey="upper" stroke="#b8860b" strokeWidth={1} strokeDasharray="2 3" dot={false} name="Upper band" connectNulls />
              <Line type="monotone" dataKey="lower" stroke="#b8860b" strokeWidth={1} strokeDasharray="2 3" dot={false} name="Lower band" connectNulls />
              {history.length > 0 && (
                <ReferenceLine x={history[history.length - 1].date} stroke="#8b3a1e" strokeDasharray="2 2" label={{ value: "today", position: "top", fill: "#8b3a1e", fontSize: 10 }} />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {Object.keys(eventNudgeStats).length > 0 && (
        <div className="event-list-card" style={{ marginBottom: 16 }}>
          <p className="kicker">Historical release-day moves (from your data)</p>
          <table className="event-table">
            <thead>
              <tr><th>Event type</th><th>Past dates</th><th>Avg Δ (log-odds)</th><th>Avg Δ (pp)</th></tr>
            </thead>
            <tbody>
              {Object.entries(eventNudgeStats).map(([id, s]) => (
                <tr key={id}>
                  <td>{id.toUpperCase()}</td>
                  <td className="mono">{s.n}</td>
                  <td className="mono">{s.meanDeltaY >= 0 ? "+" : ""}{s.meanDeltaY.toFixed(3)}</td>
                  <td className="mono">{s.meanDeltaPp >= 0 ? "+" : ""}{s.meanDeltaPp}pp</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {relevantEvents.length > 0 && (
        <div className="event-list-card">
          <p className="kicker">Upcoming releases that move this series</p>
          <table className="event-table">
            <thead>
              <tr><th>Event</th><th>Date</th><th>Impact</th><th>Hist. nudge</th><th>Forecast</th><th>Previous</th></tr>
            </thead>
            <tbody>
              {relevantEvents.map((e, i) => {
                const dKey = (e.date || "").slice(0, 10);
                const nudge = eventNudgesByDate.get(dKey);
                return (
                  <tr key={i}>
                    <td>{e.event_name}</td>
                    <td>{e.date} {e.time || e.time_text || ""}</td>
                    <td><span className={"imp imp-" + String(e.impact || "none").toLowerCase()}>{e.impact || "—"}</span></td>
                    <td className="mono">{nudge != null ? `${nudge >= 0 ? "+" : ""}${nudge.toFixed(3)} y` : "—"}</td>
                    <td className="mono">{e.forecast || "—"}</td>
                    <td className="mono">{e.previous || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <style>{`
        .forecast-page { padding: 24px 0; }
        .page-header { margin-bottom: 24px; }
        .kicker { font-family: "IBM Plex Sans", sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #8b3a1e; margin: 0 0 4px; }
        .page-title { font-family: "Newsreader", serif; font-size: 28px; font-weight: 600; margin: 0 0 6px; color: #1a1814; }
        .page-sub { font-family: "Newsreader", serif; font-style: italic; color: #6e685f; margin: 0; max-width: 72ch; }
        .forecast-controls { display: flex; gap: 24px; padding: 12px 0; border-top: 1px solid #d9d2c4; border-bottom: 1px solid #d9d2c4; margin-bottom: 20px; }
        .ctrl { display: flex; flex-direction: column; gap: 4px; }
        .ctrl label { font-family: "IBM Plex Sans", sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e685f; }
        .ctrl select { font-family: "IBM Plex Sans", sans-serif; font-size: 13px; padding: 4px 8px; border: 1px solid #d9d2c4; background: #faf6ef; min-width: 240px; }
        .forecast-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 24px; padding: 16px; background: #f3ede0; border: 1px solid #d9d2c4; }
        .summary-block .kicker { margin-bottom: 6px; }
        .summary-val { font-family: "Newsreader", serif; font-size: 26px; font-weight: 600; color: #1a1814; margin: 0; }
        .summary-sub { font-family: "IBM Plex Sans", sans-serif; font-size: 11px; color: #6e685f; margin: 4px 0 0; }
        .forecast-chart-card { border: 1px solid #d9d2c4; padding: 20px; background: #faf6ef; margin-bottom: 20px; }
        .chart-h { font-family: "Newsreader", serif; font-size: 18px; font-weight: 600; margin: 0 0 12px; color: #1a1814; }
        .event-list-card { border: 1px solid #d9d2c4; padding: 16px 20px; background: #faf6ef; }
        .event-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-family: "IBM Plex Sans", sans-serif; font-size: 12px; }
        .event-table th { text-align: left; padding: 6px 10px; border-bottom: 2px solid #1a1814; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; color: #6e685f; font-weight: 500; }
        .event-table td { padding: 8px 10px; border-bottom: 1px solid #e8e0d0; }
        .mono { font-family: "IBM Plex Mono", monospace; }
        .imp { display: inline-block; padding: 1px 6px; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; border-radius: 2px; }
        .imp-high { background: #f5d6cb; color: #8b3a1e; }
        .imp-medium { background: #f3e8c8; color: #7d5c0b; }
        .imp-low { background: #d4e0c4; color: #4a6b3f; }
      `}</style>
    </div>
  );
}
