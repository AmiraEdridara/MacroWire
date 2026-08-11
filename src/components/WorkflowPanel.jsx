import { useState } from 'react';
import {
  getSavedViews,
  getWatchlist,
  saveView,
  deleteView,
} from '../lib/workflow';

export default function WorkflowPanel({ selected, overlays, page, onApplyView, onSelectMarket }) {
  const [views, setViews] = useState(getSavedViews);
  const [watchlist, setWatchlist] = useState(getWatchlist);
  const [viewName, setViewName] = useState('');
  const [status, setStatus] = useState('');

  const refresh = () => {
    setViews(getSavedViews());
    setWatchlist(getWatchlist());
  };

  const handleSaveView = () => {
    const name = viewName.trim() || `View ${views.length + 1}`;
    saveView(name, {
      page,
      ticker: selected?.market_ticker,
      overlays: { ...overlays },
    });
    setViewName('');
    refresh();
    setStatus(`Saved “${name}”`);
  };

  return (
    <section className="panel panel-compact" style={{ marginTop: 16 }}>
      <div className="dateline" style={{ marginBottom: 10 }}>Workflow</div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 600, color: 'var(--ink3)', marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Watchlist ({watchlist.length})
        </div>
        {watchlist.length === 0 ? (
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--ink3)' }}>
            Star markets in the list to track them here.
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {watchlist.slice(0, 8).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => onSelectMarket?.(t)}
                style={{
                  textAlign: 'left',
                  padding: '4px 8px',
                  background: 'var(--paper2)',
                  border: '1px solid var(--rule)',
                  borderRadius: 2,
                  fontFamily: 'var(--mono)',
                  fontSize: 10,
                  cursor: 'pointer',
                  color: 'var(--ink2)',
                }}
              >
                ★ {t}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: 14 }}>
        <div style={{ fontFamily: 'var(--sans)', fontSize: 10, fontWeight: 600, color: 'var(--ink3)', marginBottom: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Saved views
        </div>
        <div style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
          <input
            value={viewName}
            onChange={(e) => setViewName(e.target.value)}
            placeholder="View name…"
            style={{ flex: 1, padding: '6px 8px', border: '1px solid var(--rule)', background: 'var(--paper2)', fontSize: 11 }}
          />
          <button type="button" onClick={handleSaveView} className="btn-secondary" style={{ fontSize: 10 }}>
            Save
          </button>
        </div>
        {views.length === 0 ? (
          <p style={{ fontFamily: 'var(--serif)', fontStyle: 'italic', fontSize: 12, color: 'var(--ink3)' }}>No saved views yet.</p>
        ) : (
          views.slice(0, 5).map((v) => (
            <div key={v.id} style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 4 }}>
              <button type="button" onClick={() => onApplyView?.(v)} style={{ flex: 1, textAlign: 'left', padding: '4px 8px', background: 'transparent', border: '1px solid var(--rule)', fontSize: 11, cursor: 'pointer' }}>
                {v.name}
              </button>
              <button type="button" onClick={() => { deleteView(v.id); refresh(); }} style={{ border: 'none', background: 'none', color: 'var(--ink3)', cursor: 'pointer', fontSize: 12 }}>×</button>
            </div>
          ))
        )}
      </div>

      {status && (
        <p style={{ marginTop: 10, fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--green)' }}>{status}</p>
      )}
    </section>
  );
}
