// src/pages/CalibrationPage.jsx
// Reliability diagram: are Kalshi prices well calibrated? For every market that
// resolved inside the candle history, the price `lead_days` before lock-in is the
// prediction and the terminal state is the outcome. Brier / log-loss vs base rate.

import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis, CartesianGrid,
  Tooltip, ReferenceLine, ZAxis,
} from "recharts";
import { fetchCalibration } from "../lib/data";

const LEAD_OPTIONS = [3, 7, 14, 30];

export default function CalibrationPage() {
  const [leadDays, setLeadDays] = useState(7);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetchCalibration({ leadDays });
        if (!cancelled) { setData(res); setError(null); }
      } catch (e) {
        if (!cancelled) setError(e.message || "Failed to load calibration");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [leadDays]);

  const points = useMemo(
    () => (data?.reliability || []).map((b) => ({
      x: +(b.predicted * 100).toFixed(1),
      y: +(b.actual * 100).toFixed(1),
      n: b.count,
    })),
    [data],
  );

  const skill = data?.brier != null && data?.base_rate_brier != null
    ? data.base_rate_brier - data.brier
    : null;

  return (
    <div className="forecast-page">
      <div className="page-header">
        <p className="kicker">Calibration</p>
        <h2 className="page-title">Do prices mean what they say?</h2>
        <p className="page-sub">
          Settled economics contracts from the backfilled DuckDB snapshot (~7k finalized).
          We take the price {leadDays} days before close and compare it to the official
          Kalshi result (YES/NO). A perfectly calibrated market sits on the diagonal —
          70¢ contracts resolve YES 70% of the time. Not financial advice.
        </p>
      </div>

      <div className="forecast-controls">
        <div className="ctrl">
          <label>Lead time before resolution</label>
          <select value={leadDays} onChange={(e) => setLeadDays(+e.target.value)}>
            {LEAD_OPTIONS.map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <p className="page-sub">Computing calibration over resolved markets…</p>}
      {error && <p style={{ color: "#8b3a1e" }}>{error}</p>}

      {data && !loading && (
        <>
          <div className="forecast-summary">
            <div className="summary-block">
              <p className="kicker">Sample</p>
              <p className="summary-val">{data.points.toLocaleString()}</p>
              <p className="summary-sub">resolved markets</p>
            </div>
            <div className="summary-block">
              <p className="kicker">Outcomes</p>
              <p className="summary-val" style={{ fontSize: 18 }}>
                {data.outcome_gold != null
                  ? `${data.outcome_gold.toLocaleString()} official`
                  : "—"}
              </p>
              <p className="summary-sub">
                {data.outcome_inferred != null && data.outcome_inferred > 0
                  ? `${data.outcome_inferred} inferred from candles`
                  : "gold result column"}
              </p>
            </div>
            <div className="summary-block">
              <p className="kicker">Brier score</p>
              <p className="summary-val">{data.brier ?? "—"}</p>
              <p className="summary-sub">lower is better (0 = perfect)</p>
            </div>
            <div className="summary-block">
              <p className="kicker">Log loss</p>
              <p className="summary-val">{data.log_loss ?? "—"}</p>
              <p className="summary-sub">penalises confident misses</p>
            </div>
            <div className="summary-block">
              <p className="kicker">Base-rate Brier</p>
              <p className="summary-val">{data.base_rate_brier ?? "—"}</p>
              <p className="summary-sub">naive "always quote base rate"</p>
            </div>
            <div className="summary-block">
              <p className="kicker">Skill vs base rate</p>
              <p className="summary-val" style={{ color: skill > 0 ? "#4a6b3f" : "#8b3a1e" }}>
                {skill != null ? (skill > 0 ? "+" : "") + skill.toFixed(4) : "—"}
              </p>
              <p className="summary-sub">{skill > 0 ? "market adds information" : "no edge over base rate"}</p>
            </div>
          </div>

          <div className="forecast-chart-card">
            <p className="kicker">Reliability diagram</p>
            <h3 className="chart-h">Predicted vs realized probability ({leadDays}d lead)</h3>
            <div style={{ height: 380 }}>
              <ResponsiveContainer>
                <ScatterChart margin={{ top: 20, right: 24, left: 8, bottom: 16 }}>
                  <CartesianGrid stroke="#e8e0d0" strokeDasharray="3 3" />
                  <XAxis
                    type="number" dataKey="x" domain={[0, 100]} name="Predicted"
                    stroke="#6e685f" tick={{ fontSize: 11 }} tickFormatter={(v) => v + "¢"}
                    label={{ value: "Market price", position: "insideBottom", offset: -8, fontSize: 11, fill: "#6e685f" }}
                  />
                  <YAxis
                    type="number" dataKey="y" domain={[0, 100]} name="Actual"
                    stroke="#6e685f" tick={{ fontSize: 11 }} tickFormatter={(v) => v + "%"}
                    label={{ value: "Resolved YES", angle: -90, position: "insideLeft", fontSize: 11, fill: "#6e685f" }}
                  />
                  <ZAxis type="number" dataKey="n" range={[40, 400]} name="markets" />
                  <Tooltip
                    cursor={{ strokeDasharray: "3 3" }}
                    contentStyle={{ background: "#faf6ef", border: "1px solid #d9d2c4", fontFamily: "IBM Plex Mono, monospace", fontSize: 12 }}
                    formatter={(v, name) => name === "markets" ? [v, "markets"] : [v + (name === "Predicted" ? "¢" : "%"), name]}
                  />
                  {/* Perfect-calibration diagonal */}
                  <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#8b3a1e" strokeDasharray="4 4" />
                  <Scatter data={points} fill="#4a6fa5" fillOpacity={0.75} />
                </ScatterChart>
              </ResponsiveContainer>
            </div>
            <p className="summary-sub" style={{ marginTop: 10 }}>
              Bubble size = number of markets in that price bucket. The dashed line is perfect
              calibration. Points sitting below it are buckets where the market over-priced YES.
            </p>
          </div>

          <div className="event-list-card" style={{ marginTop: 16 }}>
            <p className="kicker">Per-bucket detail</p>
            <table className="event-table">
              <thead>
                <tr><th>Price bucket</th><th>Avg predicted</th><th>Actual YES rate</th><th>Markets</th><th>Gap</th></tr>
              </thead>
              <tbody>
                {(data.reliability || []).map((b, i) => {
                  const gap = (b.actual - b.predicted) * 100;
                  return (
                    <tr key={i}>
                      <td className="mono">{(b.bin_lo * 100).toFixed(0)}–{(b.bin_hi * 100).toFixed(0)}¢</td>
                      <td className="mono">{(b.predicted * 100).toFixed(1)}¢</td>
                      <td className="mono">{(b.actual * 100).toFixed(1)}%</td>
                      <td className="mono">{b.count}</td>
                      <td className="mono" style={{ color: gap >= 0 ? "#4a6b3f" : "#8b3a1e" }}>
                        {gap >= 0 ? "+" : ""}{gap.toFixed(1)}pp
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <style>{`
        .forecast-page { padding: 24px 0; }
        .page-header { margin-bottom: 24px; }
        .kicker { font-family: "IBM Plex Sans", sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #8b3a1e; margin: 0 0 4px; }
        .page-title { font-family: "Newsreader", serif; font-size: 28px; font-weight: 600; margin: 0 0 6px; color: #1a1814; }
        .page-sub { font-family: "Newsreader", serif; font-style: italic; color: #6e685f; margin: 0; max-width: 78ch; }
        .forecast-controls { display: flex; gap: 24px; padding: 12px 0; border-top: 1px solid #d9d2c4; border-bottom: 1px solid #d9d2c4; margin-bottom: 20px; }
        .ctrl { display: flex; flex-direction: column; gap: 4px; }
        .ctrl label { font-family: "IBM Plex Sans", sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e685f; }
        .ctrl select { font-family: "IBM Plex Sans", sans-serif; font-size: 13px; padding: 4px 8px; border: 1px solid #d9d2c4; background: #faf6ef; min-width: 200px; }
        .forecast-summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 16px; margin-bottom: 24px; padding: 16px; background: #f3ede0; border: 1px solid #d9d2c4; }
        .summary-val { font-family: "Newsreader", serif; font-size: 26px; font-weight: 600; color: #1a1814; margin: 0; }
        .summary-sub { font-family: "IBM Plex Sans", sans-serif; font-size: 11px; color: #6e685f; margin: 4px 0 0; }
        .forecast-chart-card { border: 1px solid #d9d2c4; padding: 20px; background: #faf6ef; margin-bottom: 20px; }
        .chart-h { font-family: "Newsreader", serif; font-size: 18px; font-weight: 600; margin: 0 0 12px; color: #1a1814; }
        .event-list-card { border: 1px solid #d9d2c4; padding: 16px 20px; background: #faf6ef; }
        .event-table { width: 100%; border-collapse: collapse; margin-top: 10px; font-family: "IBM Plex Sans", sans-serif; font-size: 12px; }
        .event-table th { text-align: left; padding: 6px 10px; border-bottom: 2px solid #1a1814; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; color: #6e685f; font-weight: 500; }
        .event-table td { padding: 8px 10px; border-bottom: 1px solid #e8e0d0; }
        .mono { font-family: "IBM Plex Mono", monospace; }
      `}</style>
    </div>
  );
}
