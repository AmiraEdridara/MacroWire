import { HOW_TO_READ_SECTIONS } from "../content/explainer";

export default function HowToReadPage({ colors, styles, fontSerif, fontSans }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={styles.panel}>
        <div style={styles.panelTitle}>How to read MacroWire</div>
        <div style={{ fontSize: 14, color: colors.muted, lineHeight: 1.65, marginBottom: 8 }}>
          A one-page guide for students, journalists, and desks who want{" "}
          <strong style={{ color: colors.text }}>market-implied macro odds</strong> without Bloomberg or a trading
          account.
        </div>
        <div
          style={{
            display: "inline-block",
            fontSize: 12,
            color: colors.green,
            fontWeight: 600,
            padding: "6px 10px",
            background: "rgba(77, 115, 86, 0.1)",
            border: `1px solid ${colors.border}`,
          }}
        >
          Free · No login · Not investment advice
        </div>
      </div>

      {HOW_TO_READ_SECTIONS.map((sec) => (
        <div key={sec.title} style={styles.panel}>
          <div style={{ fontFamily: fontSerif, fontSize: 17, fontWeight: 600, color: colors.text, marginBottom: 10 }}>
            {sec.title}
          </div>
          <p style={{ fontSize: 14, color: colors.muted, lineHeight: 1.65, fontFamily: fontSans }}>{sec.body}</p>
        </div>
      ))}
    </div>
  );
}
