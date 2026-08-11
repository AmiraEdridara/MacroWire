import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { format, parseISO } from "date-fns";
import AnalyticsTooltip from "./AnalyticsTooltip";

export default function MarketAnalyticsChart({ data, chartMode, marketLabel }) {
  if (!data?.length) {
    return (
      <div
        style={{
          height: 360,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--text3)",
          fontSize: 12,
          border: "1px dashed var(--border2)",
          borderRadius: 12,
        }}
      >
        No time series for this market yet. Add data to backend/data/kalshi.json.
      </div>
    );
  }

  const latest = data[data.length - 1];
  const tickFormatter = (val) => {
    try {
      return format(parseISO(val), "MMM d");
    } catch {
      return val;
    }
  };

  const showProb = chartMode === "prob" || chartMode === "all";
  const showVol = chartMode === "volume" || chartMode === "all";
  const showSpread = chartMode === "spread" || chartMode === "all";

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: 11,
            letterSpacing: "0.1em",
            color: "var(--text3)",
            textTransform: "uppercase",
          }}
        >
          {marketLabel} · Kalshi series
        </div>
        <div
          style={{
            fontSize: 10,
            color: "var(--text3)",
            marginTop: 4,
          }}
        >
          Hover for probability, bid/ask, volume, and spread
        </div>
      </div>

      <ResponsiveContainer width="100%" height={340}>
        <ComposedChart data={data} margin={{ top: 8, right: showSpread ? 48 : 8, bottom: 0, left: -4 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={tickFormatter}
            tick={{ fill: "var(--text3)", fontSize: 10, fontFamily: "IBM Plex Mono" }}
            tickLine={false}
            axisLine={false}
            interval={Math.max(0, Math.floor(data.length / 8))}
          />
          <YAxis
            yAxisId="prob"
            domain={[0, 1]}
            tickFormatter={(v) => `${(v * 100).toFixed(0)}%`}
            tick={{ fill: "var(--text3)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={40}
            hide={!showProb}
          />
          <YAxis
            yAxisId="vol"
            orientation="right"
            tick={{ fill: "var(--text3)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={44}
            hide={!showVol}
          />
          <YAxis
            yAxisId="spread"
            orientation="right"
            tick={{ fill: "var(--text3)", fontSize: 10 }}
            tickLine={false}
            axisLine={false}
            width={36}
            hide={!showSpread || showVol}
          />
          <Tooltip content={<AnalyticsTooltip />} />
          <ReferenceLine yAxisId="prob" y={0.5} stroke="var(--border2)" strokeDasharray="4 4" />

          {showVol && (
            <Bar
              yAxisId="vol"
              dataKey="volume"
              fill="rgba(61, 122, 92, 0.2)"
              radius={[2, 2, 0, 0]}
            />
          )}
          {showProb && (
            <Line
              yAxisId="prob"
              type="monotone"
              dataKey="prob"
              stroke="var(--green)"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 4, fill: "var(--green)" }}
            />
          )}
          {showSpread && (
            <Line
              yAxisId={showVol ? "spread" : "vol"}
              type="monotone"
              dataKey="spreadPp"
              stroke="var(--amber)"
              strokeWidth={1.5}
              dot={false}
              strokeDasharray="4 3"
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>

      {latest.prob != null && (
        <div style={{ marginTop: 12, fontSize: 11, color: "var(--text3)" }}>
          Latest:{" "}
          <span style={{ color: "var(--green)", fontWeight: 600 }}>
            {(latest.prob * 100).toFixed(1)}%
          </span>
          {latest.spreadPp != null && (
            <>
              {" "}
              · spread{" "}
              <span style={{ color: "var(--amber)" }}>{latest.spreadPp.toFixed(1)} pts</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
