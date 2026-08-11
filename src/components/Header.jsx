import { format } from "date-fns";

export default function Header({ market, status, isLive }) {
  return (
    <header
      style={{
        borderBottom: "1px solid var(--border)",
        background: "var(--surface)",
        position: "sticky",
        top: 0,
        zIndex: 50,
      }}
    >
      <div
        style={{
          maxWidth: 1400,
          margin: "0 auto",
          padding: "0 24px",
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 20,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div
            style={{
              width: 30,
              height: 30,
              borderRadius: 7,
              background: "linear-gradient(135deg, var(--amber), var(--accent))",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 15,
            }}
          >
            ∫
          </div>
          <div>
            <span
              style={{
                fontFamily: "Bricolage Grotesque",
                fontWeight: 800,
                fontSize: 16,
                letterSpacing: "-0.02em",
              }}
            >
              Kalshi Analytics
            </span>
            <span
              style={{
                fontSize: 10,
                color: "var(--text3)",
                marginLeft: 8,
                letterSpacing: "0.08em",
              }}
            >
              MacroWire
            </span>
          </div>
        </div>

        {market && (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                padding: "4px 12px",
                background: "var(--surface2)",
                border: "1px solid var(--border2)",
                borderRadius: 20,
                fontSize: 11,
                color: "var(--text2)",
                fontFamily: "IBM Plex Mono",
              }}
            >
              {market.ticker}
            </div>
          </div>
        )}

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            fontSize: 11,
            color: "var(--text3)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isLive && <span className="live-dot" />}
            <span>{status}</span>
          </div>
          <span>{format(new Date(), "dd MMM yyyy HH:mm")}</span>
        </div>
      </div>
    </header>
  );
}
