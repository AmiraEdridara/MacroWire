import { formatVolume } from "../lib/kalshi";

export default function AnalyticsTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  if (!d) return null;

  return (
    <div
      style={{
        background: "var(--surface2)",
        border: "1px solid var(--border2)",
        borderRadius: 10,
        padding: "12px 16px",
        fontFamily: "IBM Plex Mono, monospace",
        fontSize: 12,
        minWidth: 180,
      }}
    >
      <div style={{ color: "var(--text2)", marginBottom: 8, fontSize: 11 }}>{d.date}</div>
      {d.prob != null && (
        <Row label="Probability" value={`${(d.prob * 100).toFixed(1)}%`} color="var(--green)" />
      )}
      {d.bid != null && d.ask != null && (
        <Row
          label="Bid / Ask"
          value={`${(d.bid * 100).toFixed(1)} / ${(d.ask * 100).toFixed(1)}`}
          color="var(--cyan)"
        />
      )}
      <Row label="Volume" value={d.volume?.toLocaleString() ?? "0"} />
      {d.spreadPp != null && (
        <Row label="Spread" value={`${d.spreadPp.toFixed(1)} pts`} color="var(--amber)" />
      )}
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, gap: 12 }}>
      <span style={{ color: "var(--text2)" }}>{label}</span>
      <span style={{ fontWeight: 600, color: color || "var(--text)" }}>{value}</span>
    </div>
  );
}
