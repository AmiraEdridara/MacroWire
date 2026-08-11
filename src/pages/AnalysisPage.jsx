import { useState } from 'react';
import ForecastPage from './ForecastPage';
import CorrelationPage from './CorrelationPage';

const TABS = [
  { id: 'forecast', label: 'Forecast' },
  { id: 'correlation', label: 'Correlation' },
];

export default function AnalysisPage({ candles, markets, calendar }) {
  const [tab, setTab] = useState('forecast');

  return (
    <div className="app-shell">
      <div style={{
        display: 'flex',
        gap: 0,
        borderBottom: '2px solid var(--ink)',
        marginBottom: 0,
        paddingTop: 16,
      }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 20px',
              fontFamily: 'var(--sans)',
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              border: 'none',
              borderBottom: tab === t.id ? '2px solid var(--ink)' : '2px solid transparent',
              marginBottom: -2,
              background: 'transparent',
              color: tab === t.id ? 'var(--ink)' : 'var(--ink3)',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'forecast' ? (
        <ForecastPage candles={candles} markets={markets} calendar={calendar} />
      ) : (
        <CorrelationPage candles={candles} markets={markets} />
      )}
    </div>
  );
}
