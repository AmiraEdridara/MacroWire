const PAGES = [
  { id: 'markets', label: 'Markets' },
  { id: 'briefs', label: 'Briefs' },
  { id: 'volatility', label: 'Volatility' },
  { id: 'forecast', label: 'Forecast' },
  { id: 'portfolio', label: 'Portfolio' },
  { id: 'calibration', label: 'Calibration' },
  { id: 'data', label: 'Data' },
];

export default function AppNav({ page, onNavigate, auth, onSignOut }) {
  return (
    <nav className="app-nav" aria-label="Main">
      <div className="app-shell app-nav-inner" style={{ justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {PAGES.map((p) => {
            const active = page === p.id;
            return (
              <button
                key={p.id}
                type="button"
                className={`app-nav-link${active ? ' app-nav-link-active' : ''}`}
                onClick={() => onNavigate(p.id)}
              >
                {p.label}
              </button>
            );
          })}
        </div>

        {auth && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <span style={{
              fontFamily: 'var(--mono)',
              fontSize: 10,
              color: 'var(--ink4)',
              letterSpacing: '0.04em',
            }}>
              {auth.email}
            </span>
            <button
              type="button"
              className="app-nav-link"
              onClick={onSignOut}
              style={{ padding: '4px 10px' }}
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}

const PAGE_IDS = new Set(PAGES.map((p) => p.id));

export function readPageFromHash() {
  const hash = window.location.hash.replace(/^#\/?/, '');
  if (PAGE_IDS.has(hash)) return hash;
  return 'markets';
}

export function navigateToPage(page) {
  window.location.hash = page === 'markets' ? '' : page;
}
