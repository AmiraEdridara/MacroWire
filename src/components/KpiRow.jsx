import { formatVolume } from "../lib/kalshi";

function Kpi({ label, value, sub, accent }) {
  return (
    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 12,
        padding: "16px 18px",
        flex: "1 1 160px",
        minWidth: 140,
      }}
    >
      <div
        style={{
          fontSize: 9,
          letterSpacing: "0.12em",
          color: "var(--text3)",
          textTransform: "uppercase",
          marginBottom: 8,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: "Bricolage Grotesque, sans-serif",
          fontSize: 28,
          fontWeight: 800,
          color: accent || "var(--text)",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      {sub && (
        <div style={{ fontSize: 10, color: "var(--text3)", marginTop: 6 }}>{sub}</div>
      )}
    </div>
  );
}

export default function KpiRow({ kpis }) {
  const bidAsk =
    kpis.bidPct != null && kpis.askPct != null
      ? `${kpis.bidPct.toFixed(1)} / ${kpis.askPct.toFixed(1)}`
      : kpis.bidPct != null
        ? `${kpis.bidPct.toFixed(1)} / —`
        : kpis.askPct != null
          ? `— / ${kpis.askPct.toFixed(1)}`
          : "—";

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
      <Kpi
        label="YES probability"
        value={kpis.probPct != null ? `${kpis.probPct.toFixed(1)}%` : "—"}
        sub="mid / last print"
        accent="var(--yes)"
      />
      <Kpi
        label="Bid / Ask"
        value={bidAsk}
        sub="YES side (¢ implied %)"
        accent="var(--cyan)"
      />
      <Kpi
        label="Trade volume"
        value={formatVolume(kpis.totalVolume)}
        sub="selected window"
      />
      <Kpi
        label="Avg spread"
        value={kpis.avgSpreadPp != null ? `${kpis.avgSpreadPp.toFixed(1)} pts` : "—"}
        sub="lower is tighter"
        accent="var(--amber)"
      />
    </div>
  );
}
