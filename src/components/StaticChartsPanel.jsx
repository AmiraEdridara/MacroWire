import { useEffect, useState } from "react";

/** Matches analytics/output — see docs/CHART-PRD.md */
export const CHART_EXPORTS = [
  { file: "01_overview.png", label: "Market story", hint: "Raw YES % + volume" },
  { file: "02_hawkes.png", label: "Hawkes clustering", hint: "λ(t) vs probability" },
  { file: "03_garch.png", label: "Volatility", hint: "GARCH(1,1)" },
  { file: "04_hmm_regimes.png", label: "Regimes", hint: "Bear / neutral / bull" },
  { file: "05_kalman.png", label: "Kalman smooth", hint: "Trend vs noise" },
  { file: "06_changepoints.png", label: "Level shifts", hint: "Sudden moves" },
  { file: "07_bayesian.png", label: "Bayesian belief", hint: "Sequential updates" },
  { file: "08_ssm.png", label: "SSM forecast", hint: "Level + trend" },
  { file: "09_event_study.png", label: "Event study", hint: "CAR around anchor" },
  { file: "10_macro_events.png", label: "Macro calendar", hint: "Fed + releases" },
];

export default function StaticChartsPanel({ ticker, colors, styles, fontSerif, fontMono }) {
  const [manifest, setManifest] = useState({ charts: [], summary: null, regime_engine: null });
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(CHART_EXPORTS[0].file);

  const safeTicker = (ticker || "").replace(/\//g, "_");

  useEffect(() => {
    if (!safeTicker) {
      setManifest({ charts: [], summary: null, regime_engine: null });
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/charts/${encodeURIComponent(safeTicker)}`)
      .then((r) => (r.ok ? r.json() : { charts: [], summary: null }))
      .then((data) => {
        if (!cancelled) {
          setManifest(data);
          if (data.charts?.length && !data.charts.includes(active)) {
            setActive(data.charts[0]);
          }
        }
      })
      .catch(() => {
        if (!cancelled) setManifest({ charts: [], summary: null });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [safeTicker]);

  const hasCharts = manifest.charts?.length > 0;
  const imgSrc = hasCharts && active
    ? `/api/charts/${encodeURIComponent(safeTicker)}/${active}`
  : null;

  return (
  <>
    <div style={styles.panel}>
      <div style={styles.panelTitle}>
        Static chart exports
        <span style={styles.badge(colors.green)}>PNG · 200 DPI</span>
      </div>
      <div style={styles.panelSubtitle}>
        Kalshi single-market analytics per{" "}
        <code style={{ fontSize: 12 }}>docs/CHART-PRD.md</code>. Generate with{" "}
        <code style={{ fontSize: 12 }}>npm run charts</code> (or{" "}
        <code style={{ fontSize: 12 }}>python analytics/single_market_analytics.py --ticker {safeTicker || "TICKER"}</code>
        ).
      </div>

      {!safeTicker && (
        <div style={{ fontSize: 14, color: colors.muted }}>Select a market above to load its chart folder.</div>
      )}

      {safeTicker && loading && (
        <div style={{ fontSize: 14, color: colors.muted }}>Checking analytics/output/{safeTicker}/…</div>
      )}

      {safeTicker && !loading && !hasCharts && (
        <div
          style={{
            padding: 16,
            borderRadius: 8,
            background: colors.surfaceAlt,
            border: `1px dashed ${colors.border}`,
            fontSize: 14,
            color: colors.muted,
            lineHeight: 1.55,
          }}
        >
          <strong style={{ color: colors.text }}>No PNGs yet for {safeTicker}.</strong>
          <br />
          From the repo root:
          <pre
            style={{
              marginTop: 10,
              padding: 12,
              background: colors.bg,
              borderRadius: 6,
              fontFamily: fontMono,
              fontSize: 12,
              overflowX: "auto",
            }}
          >
{`cd analytics
pip install -r requirements.txt
python single_market_analytics.py --ticker ${safeTicker} --fetch`}
          </pre>
        </div>
      )}

      {hasCharts && (
        <>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            {CHART_EXPORTS.filter((c) => manifest.charts.includes(c.file)).map((c) => (
              <button
                key={c.file}
                type="button"
                onClick={() => setActive(c.file)}
                style={{
                  ...styles.tab(active === c.file),
                  padding: "8px 12px",
                  fontSize: 12,
                }}
                title={c.hint}
              >
                {c.label}
              </button>
            ))}
          </div>

          {manifest.summary && (
            <pre
              style={{
                fontSize: 11,
                fontFamily: fontMono,
                color: colors.muted,
                background: colors.surfaceAlt,
                padding: 12,
                borderRadius: 6,
                marginBottom: 14,
                whiteSpace: "pre-wrap",
              }}
            >
              {manifest.summary}
            </pre>
          )}

          {imgSrc && (
            <div
              style={{
                borderRadius: 8,
                overflow: "hidden",
                border: `1px solid ${colors.border}`,
                background: colors.bg,
              }}
            >
              <img
                src={imgSrc}
                alt={active}
                style={{ width: "100%", height: "auto", display: "block" }}
              />
            </div>
          )}
        </>
      )}
    </div>

    <div style={{ ...styles.panel, fontFamily: fontSerif, fontSize: 14, color: colors.muted, lineHeight: 1.6 }}>
      <strong style={{ color: colors.text }}>Chart map</strong> — overview &amp; macro tell price/volume/calendar;
      Hawkes/GARCH/regimes/Kalman/Bayesian/SSM/event-study are separate exploratory views (fixed demo parameters, not live trading).
    </div>
  </>
  );
}
