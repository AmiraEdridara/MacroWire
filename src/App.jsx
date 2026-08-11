import { useState, useEffect, useCallback } from 'react';

import AppNav, { readPageFromHash, navigateToPage } from './components/AppNav';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import MarketsPage from './pages/MarketsPage';
import BriefsPage from './pages/BriefsPage';
import VolatilityPage from './pages/VolatilityPage';
import ForecastPage from './pages/ForecastPage';
import PortfolioPage from './pages/PortfolioPage';
import CalibrationPage from './pages/CalibrationPage';
import DataTablePage from './pages/DataTablePage';
import {
  fetchMarkets,
  fetchCandles,
  fetchBulkCandles,
  fetchCalendar,
  fetchNews,
  pickDefaultMarket,
} from './lib/data';
import { APP_NAME, APP_TAGLINE } from './lib/brand';
import { getAuth, clearAuth } from './lib/auth';

import './index.css';

const BULK_CANDLE_PAGES = new Set(['forecast']);

export default function App() {
  const [auth, setAuth] = useState(getAuth);
  const [showLogin, setShowLogin] = useState(false);
  const [page, setPage] = useState(readPageFromHash);
  const [pageKey, setPageKey] = useState(0);
  const [pageTransitioning, setPageTransitioning] = useState(false);
  const [markets, setMarkets] = useState([]);
  const [calendar, setCalendar] = useState([]);
  const [news, setNews] = useState([]);
  const [selected, setSelected] = useState(null);
  const [candles, setCandles] = useState([]);
  const [bulkCandles, setBulkCandles] = useState([]);
  const [bulkLoading, setBulkLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overlays, setOverlays] = useState({ volume: true, spread: false });

  useEffect(() => {
    const onHash = () => setPage(readPageFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const [m, cal, n] = await Promise.all([
          fetchMarkets(12000),
          fetchCalendar(),
          fetchNews(),
        ]);
        if (cancelled) return;
        setMarkets(m);
        setCalendar(cal);
        setNews(n);
        setSelected(pickDefaultMarket(m));
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load data');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (page !== 'markets' || !selected?.market_ticker) return undefined;
    let cancelled = false;
    (async () => {
      try {
        const series = await fetchCandles(selected.market_ticker, 90);
        if (!cancelled) setCandles(series);
      } catch {
        if (!cancelled) setCandles([]);
      }
    })();
    return () => { cancelled = true; };
  }, [page, selected?.market_ticker]);

  useEffect(() => {
    if (!BULK_CANDLE_PAGES.has(page)) return undefined;
    let cancelled = false;
    (async () => {
      try {
        setBulkLoading(true);
        const series = await fetchBulkCandles(120, 200);
        if (!cancelled) setBulkCandles(series);
      } catch {
        if (!cancelled) setBulkCandles([]);
      } finally {
        if (!cancelled) setBulkLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [page]);

  const handleNavigate = useCallback((next) => {
    navigateToPage(next);
    setPageTransitioning(true);
    setTimeout(() => {
      setPage(next);
      setPageKey((k) => k + 1);
      setPageTransitioning(false);
    }, 180);
  }, []);

  const handleToggleOverlay = useCallback((key) => {
    setOverlays((o) => ({ ...o, [key]: !o[key] }));
  }, []);

  const handleSignOut = useCallback(() => {
    clearAuth();
    setAuth(null);
  }, []);

  const handleApplyView = useCallback((view) => {
    if (view.page) {
      navigateToPage(view.page);
      setPage(view.page);
    }
    if (view.overlays) setOverlays(view.overlays);
    if (view.ticker && markets.length) {
      const m = markets.find((x) => x.market_ticker === view.ticker);
      if (m) setSelected(m);
    }
  }, [markets]);


  if (!auth) {
    if (showLogin) {
      return <LoginPage onLogin={() => { setAuth(getAuth()); setShowLogin(false); }} onBack={() => setShowLogin(false)} />;
    }
    return <LandingPage onGetStarted={() => setShowLogin(true)} />;
  }

  if (loading || pageTransitioning) {
    return (
      <>
        <AppNav page={page} onNavigate={handleNavigate} auth={auth} onSignOut={handleSignOut} />
        <div className="page-spinner-wrap">
          <div className="page-spinner" />
        </div>
      </>
    );
  }

  if (error) {
    return (
      <div className="app-shell" style={{ padding: 48, textAlign: 'center', fontFamily: 'var(--serif)', color: 'var(--accent)' }}>
        {error}
        <div style={{ marginTop: 12, fontSize: 13, color: 'var(--ink3)' }}>
          Start the backend: <code>cd backend && uvicorn app.main:app --reload --port 8000</code>
        </div>
      </div>
    );
  }

  let content;
  if (page === 'volatility') {
    content = (
      <VolatilityPage
        markets={markets}
        selected={selected}
        onSelect={setSelected}
      />
    );
  } else if (page === 'forecast') {
    content = bulkLoading && bulkCandles.length === 0 ? (
      <div className="app-shell">
        <p style={{ padding: 48, textAlign: 'center', fontFamily: 'var(--serif)', color: 'var(--ink3)' }}>
          Loading candle history…
        </p>
      </div>
    ) : (
      <div className="app-shell">
        <ForecastPage candles={bulkCandles} markets={markets} calendar={calendar} />
      </div>
    );
  } else if (page === 'briefs') {
    content = (
      <BriefsPage
        markets={markets}
        selected={selected}
        onSelect={setSelected}
        overlays={overlays}
        page={page}
        onApplyView={handleApplyView}
        onNavigate={handleNavigate}
      />
    );
  } else if (page === 'portfolio') {
    content = (
      <div className="app-shell">
        <PortfolioPage markets={markets} />
      </div>
    );
  } else if (page === 'calibration') {
    content = (
      <div className="app-shell">
        <CalibrationPage />
      </div>
    );
  } else if (page === 'data') {
    content = (
      <div className="app-shell">
        <DataTablePage
          markets={markets} 
          onNavigate={handleNavigate}
          onSelect={setSelected}
        />
      </div>
    );
  } else {
    content = (
      <MarketsPage
        markets={markets}
        calendar={calendar}
        news={news}
        selected={selected}
        candles={candles}
        onSelect={setSelected}
        overlays={overlays}
        onToggleOverlay={handleToggleOverlay}
        onApplyView={handleApplyView}
        onNavigate={handleNavigate}
      />
    );
  }

  return (
    <>
      <AppNav page={page} onNavigate={handleNavigate} auth={auth} onSignOut={handleSignOut} />
      <div key={pageKey} className="page-enter">{content}</div>
      <footer className="site-footer">
        <div className="app-shell">
          <span>{APP_NAME} · {APP_TAGLINE}</span>
          <span>Data: Kalshi · ForexFactory · Finnhub</span>
          <span>Not financial advice</span>
        </div>
      </footer>
    </>
  );
}
