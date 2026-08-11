const CAT_COLORS = {
  "Fed Policy": "var(--amber)",
  Inflation: "var(--cyan)",
  Labour: "var(--green)",
  Macro: "var(--purple)",
};

export default function MarketSelector({ markets, selected, onSelect, latestByMarket = {} }) {
  if (!markets.length) {
    return (
      <p style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.6 }}>
        No markets in database yet.
      </p>
    );
  }

  const grouped = markets.reduce((acc, m) => {
    const cat = m.category || "Macro";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(m);
    return acc;
  }, {});

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {Object.entries(grouped).map(([cat, items]) => (
        <div key={cat}>
          <div
            style={{
              fontSize: 9,
              letterSpacing: "0.14em",
              color: "var(--text3)",
              textTransform: "uppercase",
              marginBottom: 8,
              borderBottom: "1px solid var(--border)",
              paddingBottom: 6,
            }}
          >
            {cat}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {items.map((m) => {
              const snap = latestByMarket[m.id] || m;
              const prob = snap.prob;
              const spread = snap.spreadPp;
              const isSelected = selected?.id === m.id;
              const catColor = CAT_COLORS[cat] || "var(--text2)";
              const probColor =
                prob == null
                  ? "var(--text3)"
                  : prob >= 0.6
                    ? "var(--yes)"
                    : prob <= 0.4
                      ? "var(--no)"
                      : "var(--amber)";

              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onSelect(m)}
                  style={{
                    background: isSelected ? "var(--surface3)" : "transparent",
                    border: `1px solid ${isSelected ? `${catColor}55` : "transparent"}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                    cursor: "pointer",
                    textAlign: "left",
                    width: "100%",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 4,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontFamily: "Bricolage Grotesque",
                        fontWeight: isSelected ? 700 : 500,
                        color: isSelected ? "var(--text)" : "var(--text2)",
                      }}
                    >
                      {m.label}
                    </span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: probColor }}>
                      {prob != null ? `${(prob * 100).toFixed(0)}%` : "—"}
                    </span>
                  </div>
                  <div style={{ fontSize: 9, color: "var(--text3)", lineHeight: 1.5 }}>
                    <div>{m.ticker}</div>
                    {snap.bid != null && snap.ask != null && (
                      <div>
                        bid/ask {(snap.bid * 100).toFixed(1)} / {(snap.ask * 100).toFixed(1)}
                        {spread != null ? ` · ${spread.toFixed(1)}pt` : ""}
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
