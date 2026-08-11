import { APP_NAME, APP_TAGLINE } from '../lib/brand';

/* ─── small reusable pieces ─────────────────────────────── */

function CodeBlock({ lines }) {
  return (
    <pre style={{
      background: '#0f0e0c',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 4,
      padding: '16px 18px',
      fontFamily: 'var(--mono)',
      fontSize: 11.5,
      lineHeight: 1.7,
      color: '#c8bfaa',
      overflowX: 'auto',
      margin: 0,
    }}>
      {lines.map((l, i) => (
        <div key={i} style={{ color: l.color || '#c8bfaa' }}>{l.text}</div>
      ))}
    </pre>
  );
}

/* ─── feature sections ───────────────────────────────────── */

const FEATURE_SECTIONS = [
  {
    headline: '12,000 markets. One probability chart.',
    sub: 'Every active Kalshi macro contract — Fed rates, CPI, payrolls, elections — in a searchable list with 90-day candlestick probability history and live bid-ask spread.',
    code: [
      { text: '// Markets · KXFEDRATE-26JUL30' },
      { text: '' },
      { text: '{', color: '#c8bfaa' },
      { text: '  ticker:     "KXFEDRATE-26JUL30",', color: '#8fa8c9' },
      { text: '  event:      "Fed rate at or below 4.25% — Jul 30",', color: '#8fa8c9' },
      { text: '  yes_bid:    0.71,', color: '#8aa57e' },
      { text: '  yes_ask:    0.73,', color: '#8aa57e' },
      { text: '  last_price: 0.72,', color: '#d4b85a' },
      { text: '  volume_24h: 48200,', color: '#c8bfaa' },
      { text: '  close_time: "2026-07-30",', color: '#c8bfaa' },
      { text: '  status:     "active"', color: '#c8bfaa' },
      { text: '}', color: '#c8bfaa' },
    ],
  },
  {
    headline: 'Volatility ranking across every market.',
    sub: 'Sort every active contract by realised probability swing, daily range, or days-to-expiry. Find which macro markets are repricing before the headlines catch up.',
    code: [
      { text: '// Volatility · top movers last 24h' },
      { text: '' },
      { text: 'rank  ticker                    vol_1d   vol_7d', color: '#847c70' },
      { text: '─────────────────────────────────────────────────', color: '#3b3833' },
      { text: ' 01   KXCPI-JUN26-B             +14.2pp  +8.7pp', color: '#c97a5e' },
      { text: ' 02   KXFEDRATE-26JUL30          +9.1pp  +5.3pp', color: '#c97a5e' },
      { text: ' 03   KXPAYROLLS-JUN26-B         +7.8pp  +3.2pp', color: '#d4b85a' },
      { text: ' 04   KXGDP-Q226-ABOVE-2PCT      +4.4pp  +6.1pp', color: '#d4b85a' },
      { text: ' 05   KXUNRATE-JUN26-ABOVE-4      +3.9pp  +2.8pp', color: '#8aa57e' },
    ],
  },
  {
    headline: 'Market briefs written around the data.',
    sub: 'AI-assisted dispatches that surface the macro context behind probability shifts — Fed speak, release surprises, positioning changes — in editorial form, not a firehose.',
    code: [
      { text: '// Brief · Jun 12 2026 · CPI Reaction' },
      { text: '' },
      { text: 'KXCPI-JUN26-B jumped 18pp in 40 minutes after', color: '#c8bfaa' },
      { text: 'the BLS print came in at +0.1% MoM vs +0.2%', color: '#c8bfaa' },
      { text: 'consensus. Volume spiked to 3.2× the 30-day', color: '#c8bfaa' },
      { text: 'average. Spread compressed from 6pp → 2pp,', color: '#c8bfaa' },
      { text: 'consistent with informed buying.', color: '#c8bfaa' },
      { text: '' },
      { text: 'Related: KXFEDRATE-26JUL30 +4pp on the move.', color: '#8fa8c9' },
      { text: 'Calibration score for CPI markets: 0.83', color: '#8aa57e' },
    ],
  },
  {
    headline: 'Cross-market forecast view.',
    sub: 'Compare probability trajectories across up to 200 markets over user-selected windows. Detect cross-market divergence and consensus formation ahead of key events.',
    code: [
      { text: '// Forecast · 30-day window · Fed cluster' },
      { text: '' },
      { text: 'market                  t-30   t-15   t-0', color: '#847c70' },
      { text: '──────────────────────────────────────────', color: '#3b3833' },
      { text: 'KXFEDRATE-26JUL30-CUT   0.31   0.44   0.72', color: '#8fa8c9' },
      { text: 'KXFEDRATE-26SEP17-CUT   0.55   0.61   0.79', color: '#8fa8c9' },
      { text: 'KXFEDRATE-26NOV04-CUT   0.62   0.70   0.84', color: '#8aa57e' },
      { text: 'KXDXY-Q326-BELOW-103    0.48   0.52   0.58', color: '#d4b85a' },
    ],
  },
];

const FOOTER_COLS = [
  {
    head: 'Markets',
    links: ['Fed Rate Watch', 'CPI Tracker', 'Payrolls Monitor', 'GDP Probability', 'Unemployment Rate'],
  },
  {
    head: 'Views',
    links: ['Markets', 'Volatility', 'Briefs', 'Forecast', 'Portfolio', 'Calibration', 'Data'],
  },
  {
    head: 'Product',
    links: ['Changelog', 'Docs', 'Data sources'],
  },
  {
    head: 'Legal',
    links: ['Privacy policy', 'Terms of service'],
  },
];

/* ─── main component ─────────────────────────────────────── */

export default function LandingPage({ onGetStarted }) {
  return (
    <div style={{ background: 'var(--paper)', minHeight: '100vh' }}>

      {/* ══ NAV ══════════════════════════════════════════════ */}
      <header style={{
        position: 'sticky', top: 0, zIndex: 100,
        background: 'var(--paper)',
        borderBottom: '3px double var(--ink)',
      }}>
        <div style={{
          maxWidth: 1120, margin: '0 auto', padding: '0 24px',
          height: 54, display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 16,
        }}>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, flexShrink: 0 }}>
            <div style={{
              width: 30, height: 30, borderRadius: 2,
              background: 'var(--ink)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 15, color: 'var(--paper)', fontWeight: 700,
            }}>∫</div>
            <span style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 16, letterSpacing: '-0.02em' }}>
              {APP_NAME}
            </span>
          </div>

          {/* Links */}
          <nav style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
            {['Features', 'Data'].map((l) => (
              <a key={l} href={`#${l.toLowerCase()}`} style={{
                fontFamily: 'var(--sans)', fontSize: 11, fontWeight: 600,
                letterSpacing: '0.07em', textTransform: 'uppercase',
                color: 'var(--ink3)', textDecoration: 'none',
                padding: '6px 12px', borderRadius: 2,
              }}>{l}</a>
            ))}
          </nav>

          <button type="button" className="btn-primary" onClick={onGetStarted}
            style={{ padding: '7px 18px', fontSize: 11, flexShrink: 0 }}>
            Sign in
          </button>
        </div>
      </header>

      {/* ══ HERO ═════════════════════════════════════════════ */}
      <section style={{
        background: 'var(--paper)',
        padding: '80px 24px 88px',
        borderBottom: '1px solid var(--rule)',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            background: 'var(--paper2)',
            border: '1px solid var(--rule)',
            borderRadius: 2, padding: '4px 14px',
            fontFamily: 'var(--sans)', fontSize: 10,
            fontWeight: 600, letterSpacing: '0.1em',
            textTransform: 'uppercase', color: 'var(--ink3)',
            marginBottom: 32,
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--green)', flexShrink: 0 }} />
            Kalshi · ForexFactory · Finnhub
          </div>

          <h1 style={{
            fontFamily: 'var(--serif)',
            fontSize: 'clamp(38px, 5.5vw, 64px)',
            fontWeight: 700,
            color: 'var(--ink)',
            letterSpacing: '-0.03em',
            lineHeight: 1.07,
            marginBottom: 22,
          }}>
            Read the probability behind every macro event.
          </h1>

          <p style={{
            fontFamily: 'var(--serif)', fontStyle: 'italic',
            fontSize: 'clamp(15px, 2vw, 19px)',
            color: 'var(--ink3)', lineHeight: 1.6,
            maxWidth: 600, margin: '0 auto 40px',
          }}>
            {APP_NAME} turns Kalshi prediction-market data into a research dashboard —
            probability charts, volatility signals, briefs, and calibrated forecasts in one place.
          </p>

          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button type="button" onClick={onGetStarted} className="btn-primary"
              style={{ padding: '12px 34px', fontSize: 12 }}>
              Get started
            </button>
            <a href="#features" className="btn-secondary" style={{
              padding: '12px 34px', fontSize: 12,
              fontFamily: 'var(--sans)', fontWeight: 600,
              letterSpacing: '0.07em', textTransform: 'uppercase',
              textDecoration: 'none', display: 'inline-block',
            }}>
              See how it works
            </a>
          </div>
        </div>
      </section>

      {/* ══ STAT STRIP ═══════════════════════════════════════ */}
      <div style={{ borderBottom: '1px solid var(--rule)' }}>
        <div style={{
          maxWidth: 1120, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        }}>
          {[
            { n: '12,000+', l: 'active Kalshi markets' },
            { n: '90 days', l: 'candle history per contract' },
            { n: '8 views', l: 'built for macro traders' },
            { n: '3 feeds', l: 'Kalshi · ForexFactory · Finnhub' },
          ].map(({ n, l }, i) => (
            <div key={l} style={{
              padding: '28px 24px', textAlign: 'center',
              borderRight: i < 3 ? '1px solid var(--rule)' : 'none',
            }}>
              <div style={{ fontFamily: 'var(--mono)', fontSize: 26, fontWeight: 600, color: 'var(--ink)', letterSpacing: '-0.02em' }}>{n}</div>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink4)', marginTop: 4 }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ══ PROBLEM SECTION ══════════════════════════════════ */}
      <section style={{ padding: '72px 24px', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <p className="dateline" style={{ marginBottom: 12 }}>The problem</p>
          <h2 style={{
            fontFamily: 'var(--serif)', fontSize: 'clamp(26px, 3.5vw, 42px)',
            fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--ink)',
            lineHeight: 1.1, marginBottom: 14, maxWidth: 600,
          }}>
            Kalshi data is raw.<br />MacroWire makes it readable.
          </h2>
          <p style={{
            fontFamily: 'var(--serif)', fontStyle: 'italic',
            fontSize: 15, color: 'var(--ink3)', lineHeight: 1.6,
            maxWidth: 560, marginBottom: 48,
          }}>
            Raw parquet snapshots are useful if you write Python for a living.
            Most macro traders just want to know: is the market moving, why, and what does it mean?
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, background: 'var(--rule)' }}>
            <div style={{ background: 'var(--paper)', padding: '28px 28px 32px' }}>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: 16 }}>
                Without MacroWire
              </div>
              <CodeBlock lines={[
                { text: '$ python3 read_kalshi.py' },
                { text: '' },
                { text: 'Traceback (most recent call last):', color: '#c97a5e' },
                { text: '  File "read_kalshi.py", line 4', color: '#c97a5e' },
                { text: '    df = pd.read_parquet("kalshi_candlesticks.parquet")', color: '#c97a5e' },
                { text: 'KeyError: column "yes_price" not found', color: '#c97a5e' },
                { text: '' },
                { text: '# 847 columns. No docs. Good luck.', color: '#575148' },
              ]} />
            </div>
            <div style={{ background: 'var(--paper)', padding: '28px 28px 32px' }}>
              <div style={{ fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--green)', marginBottom: 16 }}>
                With MacroWire
              </div>
              <CodeBlock lines={[
                { text: '// Open MacroWire → select market' },
                { text: '' },
                { text: 'KXCPI-JUN26-B', color: '#d4b85a' },
                { text: 'CPI below 3.0% — Jun 2026', color: '#c8bfaa' },
                { text: '' },
                { text: 'Probability:  72%  ▲ +14pp (24h)', color: '#8aa57e' },
                { text: 'Volume:       48,200 contracts', color: '#8fa8c9' },
                { text: 'Spread:       2pp  (tight — liquid)', color: '#8fa8c9' },
                { text: 'Resolves:     2026-06-30', color: '#c8bfaa' },
              ]} />
            </div>
          </div>
        </div>
      </section>

      {/* ══ FEATURES ═════════════════════════════════════════ */}
      <section id="features" style={{ padding: '72px 24px', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <p className="dateline" style={{ marginBottom: 12 }}>What's inside</p>
          <h2 style={{
            fontFamily: 'var(--serif)', fontSize: 'clamp(26px, 3.5vw, 42px)',
            fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--ink)',
            lineHeight: 1.1, marginBottom: 56,
          }}>
            Eight views. Every angle covered.
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)' }}>
            {FEATURE_SECTIONS.map(({ headline, sub, code }, i) => (
              <div key={i} style={{
                background: 'var(--paper)',
                display: 'grid', gridTemplateColumns: '1fr 1fr',
                gap: 0,
              }}>
                <div style={{ padding: '36px 40px', borderRight: '1px solid var(--rule)' }}>
                  <h3 style={{
                    fontFamily: 'var(--serif)', fontSize: 22,
                    fontWeight: 700, color: 'var(--ink)',
                    letterSpacing: '-0.02em', lineHeight: 1.2,
                    margin: '0 0 12px',
                  }}>{headline}</h3>
                  <p style={{
                    fontFamily: 'var(--serif)', fontStyle: 'italic',
                    fontSize: 14, color: 'var(--ink3)', lineHeight: 1.65, margin: 0,
                  }}>{sub}</p>
                </div>
                <div style={{ padding: '24px 28px', background: '#0f0e0c', display: 'flex', alignItems: 'center' }}>
                  <CodeBlock lines={code} />
                </div>
              </div>
            ))}
          </div>

          {/* additional smaller feature tiles */}
          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
            gap: 1, background: 'var(--rule)', border: '1px solid var(--rule)',
            borderTop: 'none', marginTop: 1,
          }}>
            {[
              { icon: '◷', label: 'Economic Calendar', sub: 'ForexFactory release times overlaid on every chart.' },
              { icon: '⊡', label: 'Portfolio Tracker', sub: 'Log positions and watch P&L against realised probs.' },
              { icon: '◈', label: 'Calibration Curves', sub: 'Backtested accuracy scores for every market category.' },
              { icon: '⊞', label: 'Raw Data Table', sub: 'Filter, sort, and inspect every tick. Export-ready.' },
            ].map(({ icon, label, sub }) => (
              <div key={label} style={{ background: 'var(--paper)', padding: '22px 22px' }}>
                <div style={{ fontSize: 20, marginBottom: 10, color: 'var(--ink3)' }}>{icon}</div>
                <div style={{ marginBottom: 8 }}>
                  <span style={{ fontFamily: 'var(--serif)', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{label}</span>
                </div>
                <p style={{ fontFamily: 'var(--serif)', fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6, margin: 0 }}>{sub}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ DATA SOURCES ═════════════════════════════════════ */}
      <section id="data" style={{ padding: '72px 24px', borderBottom: '1px solid var(--rule)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto' }}>
          <p className="dateline" style={{ marginBottom: 12 }}>Data sources</p>
          <h2 style={{
            fontFamily: 'var(--serif)', fontSize: 'clamp(26px, 3.5vw, 42px)',
            fontWeight: 700, letterSpacing: '-0.025em', color: 'var(--ink)',
            lineHeight: 1.1, marginBottom: 48,
          }}>Three feeds. One dashboard.</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, background: 'var(--rule)' }}>
            {[
              {
                name: 'Kalshi',
                tone: 'var(--accent)',
                desc: 'Regulated US prediction market exchange. 12,000+ active macro contracts across Fed policy, inflation, employment, and elections.',
                tags: ['Candlestick history', 'Bid/ask spread', 'Volume', 'Settlement data'],
              },
              {
                name: 'ForexFactory',
                tone: 'var(--blue)',
                desc: 'Economic calendar with release times, analyst forecasts, prior readings, and surprise classifications for every major macro event.',
                tags: ['Release timestamps', 'Consensus forecasts', 'Prior readings', 'Surprise flags'],
              },
              {
                name: 'Finnhub',
                tone: 'var(--gold)',
                desc: 'Real-time financial news headlines scoped to the macro events you\'re tracking. Filtered by market relevance.',
                tags: ['News headlines', 'Sentiment signals', 'Source attribution', 'Event tagging'],
              },
            ].map(({ name, tone, desc, tags }) => (
              <div key={name} style={{ background: 'var(--paper)', padding: '28px 28px 32px' }}>
                <div style={{
                  fontFamily: 'var(--mono)', fontSize: 13, fontWeight: 700,
                  color: tone, letterSpacing: '-0.01em', marginBottom: 12,
                }}>{name}</div>
                <p style={{
                  fontFamily: 'var(--serif)', fontSize: 13, color: 'var(--ink3)',
                  lineHeight: 1.65, marginBottom: 20,
                }}>{desc}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {tags.map((t) => (
                    <span key={t} className="tag">{t}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ══ CTA ══════════════════════════════════════════════ */}
      <section style={{
        background: 'var(--paper2)',
        borderTop: '3px double var(--ink)',
        borderBottom: '3px double var(--ink)',
        padding: '80px 24px',
        textAlign: 'center',
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <h2 style={{
            fontFamily: 'var(--serif)',
            fontSize: 'clamp(28px, 4vw, 46px)',
            fontWeight: 700, color: 'var(--ink)',
            letterSpacing: '-0.03em', lineHeight: 1.08, marginBottom: 18,
          }}>
            Start reading the market.
          </h2>
          <p style={{
            fontFamily: 'var(--serif)', fontStyle: 'italic',
            fontSize: 15, color: 'var(--ink3)', marginBottom: 36, lineHeight: 1.5,
          }}>
            Research viewer — not financial advice.
          </p>
          <button type="button" onClick={onGetStarted} className="btn-primary"
            style={{ padding: '13px 44px', fontSize: 12 }}>
            Open dashboard
          </button>
        </div>
      </section>

      {/* ══ FOOTER ═══════════════════════════════════════════ */}
      <footer style={{ background: 'var(--paper)', borderTop: '1px solid var(--rule)' }}>
        <div style={{ maxWidth: 1120, margin: '0 auto', padding: '48px 24px 32px' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr repeat(4, 1fr)', gap: 32, marginBottom: 48 }}>
            {/* Brand col */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 2,
                  background: 'var(--ink)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 13, color: 'var(--paper)',
                }}>∫</div>
                <span style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>
                  {APP_NAME}
                </span>
              </div>
              <p style={{
                fontFamily: 'var(--serif)', fontStyle: 'italic',
                fontSize: 12, color: 'var(--ink3)', lineHeight: 1.6, maxWidth: 200,
              }}>
                {APP_TAGLINE}. Built on Kalshi, ForexFactory, and Finnhub.
              </p>
            </div>

            {/* Link cols */}
            {FOOTER_COLS.map(({ head, links }) => (
              <div key={head}>
                <div style={{
                  fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 700,
                  letterSpacing: '0.1em', textTransform: 'uppercase',
                  color: 'var(--ink3)', marginBottom: 14,
                }}>{head}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {links.map((l) => (
                    <span key={l} style={{
                      fontFamily: 'var(--sans)', fontSize: 11,
                      color: 'var(--ink4)', cursor: 'default',
                    }}>{l}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div style={{
            borderTop: '1px solid var(--rule)',
            paddingTop: 20,
            display: 'flex', justifyContent: 'space-between',
            flexWrap: 'wrap', gap: 8,
            fontFamily: 'var(--sans)', fontSize: 10,
            color: 'var(--ink4)', letterSpacing: '0.06em',
          }}>
            <span>© 2026 {APP_NAME}</span>
            <span>Not financial advice</span>
          </div>
        </div>
      </footer>

    </div>
  );
}
