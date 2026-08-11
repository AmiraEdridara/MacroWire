/** Short “what this means” callout — no model jargon. */

export default function MeaningBox({ title = "What this means", children, styles, colors }) {
  return (
    <div
      style={{
        background: colors.surfaceAlt,
        borderLeft: `3px solid ${colors.accent}`,
        padding: "12px 14px",
        marginBottom: 14,
        borderRadius: 2,
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: colors.accent,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: 6,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 13, color: colors.muted, lineHeight: 1.6 }}>{children}</div>
    </div>
  );
}

export function StoryStepNav({ tabs, activeTab, setActiveTab, styles, colors, fontSans }) {
  const idx = tabs.findIndex((t) => t.id === activeTab);
  const prev = idx > 0 ? tabs[idx - 1] : null;
  const next = idx >= 0 && idx < tabs.length - 1 ? tabs[idx + 1] : null;
  if (!prev && !next) return null;
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        marginTop: 8,
        paddingTop: 16,
        borderTop: `1px solid ${colors.border}`,
        fontFamily: fontSans,
      }}
    >
      {prev ? (
        <button
          type="button"
          onClick={() => setActiveTab(prev.id)}
          style={{
            ...styles.tab(false),
            flex: 1,
            textAlign: "left",
            fontSize: 12,
          }}
        >
          ← {prev.label}
        </button>
      ) : (
        <span />
      )}
      {next ? (
        <button
          type="button"
          onClick={() => setActiveTab(next.id)}
          style={{
            ...styles.tab(false),
            flex: 1,
            textAlign: "right",
            fontSize: 12,
          }}
        >
          {next.label} →
        </button>
      ) : (
        <span />
      )}
    </div>
  );
}
