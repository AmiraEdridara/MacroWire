const STORAGE_KEY = 'macrowire.workflow.v1';

const DEFAULT_STATE = {
  watchlist: [],
  savedViews: [],
  alertPrefs: {
    browserEnabled: false,
    moveThresholdPp: 5,
    alertMoves: true,
    alertPreRelease: true,
    digestEnabled: true,
    digestHour: 7,
    email: '',
    subscriptionId: null,
  },
  lastSeenAlertKeys: [],
};

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_STATE, watchlist: [], savedViews: [] };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_STATE,
      ...parsed,
      alertPrefs: { ...DEFAULT_STATE.alertPrefs, ...(parsed.alertPrefs || {}) },
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getWorkflowState() {
  return loadState();
}

export function toggleWatchlist(ticker) {
  const state = loadState();
  const set = new Set(state.watchlist);
  if (set.has(ticker)) set.delete(ticker);
  else set.add(ticker);
  state.watchlist = [...set];
  saveState(state);
  return state.watchlist;
}

export function isWatchlisted(ticker) {
  return loadState().watchlist.includes(ticker);
}

export function getWatchlist() {
  return loadState().watchlist;
}

export function saveView(name, snapshot) {
  const state = loadState();
  const view = {
    id: `view-${Date.now()}`,
    name,
    createdAt: new Date().toISOString(),
    ...snapshot,
  };
  state.savedViews = [view, ...state.savedViews.filter((v) => v.name !== name)].slice(0, 12);
  saveState(state);
  return view;
}

export function deleteView(id) {
  const state = loadState();
  state.savedViews = state.savedViews.filter((v) => v.id !== id);
  saveState(state);
}

export function getSavedViews() {
  return loadState().savedViews;
}

export function updateAlertPrefs(prefs) {
  const state = loadState();
  state.alertPrefs = { ...state.alertPrefs, ...prefs };
  saveState(state);
  return state.alertPrefs;
}

export function getAlertPrefs() {
  return loadState().alertPrefs;
}

export function markAlertsSeen(keys) {
  const state = loadState();
  state.lastSeenAlertKeys = keys.slice(-100);
  saveState(state);
}

export function getLastSeenAlertKeys() {
  return loadState().lastSeenAlertKeys;
}

export async function syncSubscription(watchlist, prefs) {
  const email = (prefs.email || '').trim();
  if (!email) return null;
  const res = await fetch('/api/subscriptions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      watchlist,
      alert_moves: prefs.alertMoves,
      alert_pre_release: prefs.alertPreRelease,
      digest_enabled: prefs.digestEnabled,
      digest_hour: prefs.digestHour,
      move_threshold_pp: prefs.moveThresholdPp,
    }),
  });
  if (!res.ok) throw new Error(await res.text());
  const sub = await res.json();
  updateAlertPrefs({ subscriptionId: sub.id, email: sub.email });
  return sub;
}

export async function fetchEventBrief({ date, series } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (series) params.set('series', series);
  const res = await fetch(`/api/brief/event?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchMarketBrief(ticker) {
  const res = await fetch(`/api/brief/market/${encodeURIComponent(ticker)}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchDigest(watchlist = []) {
  const params = new URLSearchParams();
  if (watchlist.length) params.set('tickers', watchlist.join(','));
  const res = await fetch(`/api/digest?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchSignals(watchlist = [], limit = 20) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (watchlist.length) params.set('tickers', watchlist.join(','));
  const res = await fetch(`/api/signals?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchLiveAlerts(watchlist = [], moveThresholdPp = 5) {
  const params = new URLSearchParams({ move_threshold_pp: String(moveThresholdPp) });
  if (watchlist.length) params.set('tickers', watchlist.join(','));
  const res = await fetch(`/api/alerts/live?${params}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function sendTestAlert(subscriptionId) {
  const res = await fetch(`/api/subscriptions/${subscriptionId}/test`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function sendDigestNow(subscriptionId) {
  const res = await fetch(`/api/subscriptions/${subscriptionId}/digest`, { method: 'POST' });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
