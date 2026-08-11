import { useEffect, useState } from 'react';
import Masthead from '../components/Masthead';
import EventBrief, { DigestPanel, SignalsPanel, UpcomingEventsList } from '../components/EventBrief';
import WorkflowPanel from '../components/WorkflowPanel';
import {
  fetchDigest,
  fetchEventBrief,
  fetchSignals,
  getWatchlist,
} from '../lib/workflow';
import { APP_NAME } from '../lib/brand';

export default function BriefsPage({ markets, selected, onSelect, overlays, page, onApplyView, onNavigate }) {
  const [brief, setBrief] = useState(null);
  const [digest, setDigest] = useState(null);
  const [signals, setSignals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const watchlist = getWatchlist();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const wl = getWatchlist();
        const [b, d, s] = await Promise.all([
          fetchEventBrief(),
          fetchDigest(wl),
          fetchSignals(wl, 12),
        ]);
        if (cancelled) return;
        setBrief(b);
        setDigest(d);
        setSignals(s.signals || []);
        setError(null);
      } catch (err) {
        if (!cancelled) setError(err.message || 'Failed to load briefs');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [watchlist.length]);

  const handleSelectTicker = (ticker) => {
    const m = markets.find((x) => x.market_ticker === ticker);
    if (m) {
      onSelect(m);
      onNavigate?.('markets');
    }
  };


  return (
    <>
      <Masthead market={selected} />
      <div className="app-shell">
        <main className="dashboard briefs-layout">
          <div className="col-main briefs-main">
            <EventBrief brief={brief} loading={loading} error={error} />
            <DigestPanel digest={digest} />
          </div>
          <aside className="col-news">
            <SignalsPanel signals={signals} onSelect={handleSelectTicker} />
            <UpcomingEventsList events={digest?.events?.length ? digest.events : (brief?.event ? [brief.event] : [])} />
            <WorkflowPanel
              selected={selected}
              overlays={overlays}
              page={page}
              onApplyView={onApplyView}
              onSelectMarket={handleSelectTicker}
            />
          </aside>
        </main>
        <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--ink3)', marginTop: 16, textAlign: 'center' }}>
          {APP_NAME} briefs are auto-generated from Kalshi + calendar data — not investment advice.
        </p>
      </div>
    </>
  );
}
