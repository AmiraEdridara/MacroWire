// src/pages/DataTablePage.jsx
import { useMemo, useState } from "react";
import ExportBar from "../components/ExportBar";
import { isActiveMarket, isSettledMarket } from "../lib/data";

const SORT_FIELDS = [
  { key: "volume", label: "Volume" },
  { key: "prob", label: "YES %" },
  { key: "spread", label: "Spread" },
  { key: "imp_ret", label: "If YES wins" },
  { key: "close_time", label: "Expiry" },
  { key: "open_interest", label: "Open interest" },
];

const fmtCents = (v) => (v == null ? "—" : v.toFixed(1) + "¢");

/** Plain-language YES payoff: what you pay at ask vs $1 if YES settles. */
function fmtYesPayoff(ask) {
  if (ask == null || ask <= 0 || ask >= 1) return "—";
  const cents = ask * 100;
  const cost = cents >= 1 ? `${cents.toFixed(1)}¢` : `${cents.toFixed(2)}¢`;
  return `${cost} → $1`;
}

function yesPayoffTitle(ask) {
  if (ask == null || ask <= 0 || ask >= 1) return undefined;
  const profit = ((1 - ask) * 100).toFixed(1);
  return `Pay ${(ask * 100).toFixed(2)}¢ per contract · profit +${profit}¢ if YES settles · ${((1 / ask)).toFixed(1)}× stake`;
}
const fmtNum = (v) => {
  if (v == null) return "—";
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "K";
  return v.toLocaleString();
};
const daysLeft = (ct) => {
  if (!ct) return null;
  return Math.ceil((new Date(ct) - new Date()) / 86400000);
};

export default function DataTablePage({ markets, onNavigate, onSelect }) {
  const [search, setSearch] = useState("");
  const [seriesFilter, setSeriesFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [minVol, setMinVol] = useState(0);
  const [sortBy, setSortBy] = useState("volume");
  const [sortDir, setSortDir] = useState("desc");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const series = useMemo(() => {
    const labelMap = new Map();
    (markets || []).forEach((m) => {
      if (m.series_ticker && !labelMap.has(m.series_ticker)) {
        labelMap.set(m.series_ticker, m.event_title || m.series_ticker);
      }
    });
    return [...labelMap.entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([ticker, label]) => ({ ticker, label }));
  }, [markets]);

  const filtered = useMemo(() => {
    let rows = (markets || []).filter((m) => {
      if (statusFilter) {
        if (statusFilter === "finalized") {
          if (!isSettledMarket(m)) return false;
        } else if (statusFilter === "closed") {
          const dte = m.days_to_expiry ?? m.days_left;
          const isExpired = dte != null && dte < 0;
          const isClosed = ["closed", "expired"].includes(m.status);
          if (!isExpired && !isClosed && !isSettledMarket(m)) return false;
        } else if (statusFilter === "active") {
          if (!isActiveMarket(m)) return false;
        } else if (m.status !== statusFilter) {
          return false;
        }
      }
      if (seriesFilter && m.series_ticker !== seriesFilter) return false;
      if (minVol && (m.volume || 0) < minVol) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          (m.event_title || "").toLowerCase().includes(q) ||
          (m.market_ticker || "").toLowerCase().includes(q) ||
          (m.series_ticker || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
    rows.sort((a, b) => {
      const av = a[sortBy], bv = b[sortBy];
      if (av == null) return 1;
      if (bv == null) return -1;
      if (sortBy === "close_time") {
        return sortDir === "asc"
          ? new Date(av) - new Date(bv)
          : new Date(bv) - new Date(av);
      }
      return sortDir === "asc" ? av - bv : bv - av;
    });
    return rows;
  }, [markets, search, seriesFilter, statusFilter, minVol, sortBy, sortDir]);

  const paged = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  const handleSort = (key) => {
    if (sortBy === key) setSortDir(sortDir === "desc" ? "asc" : "desc");
    else { setSortBy(key); setSortDir("desc"); }
    setPage(0);
  };

  const handleRowClick = (market) => {
    if (!isActiveMarket(market)) return;
    if (onSelect) onSelect(market);
    if (onNavigate) onNavigate('markets');
  };

  const exportCsv = () => {
    const headers = ["event_title", "market_ticker", "series_ticker", "status", "result", "prob", "yes_bid", "yes_ask", "spread", "volume", "open_interest", "yes_payoff_if_wins", "close_time"];
    const escape = (v) => {
      if (v == null) return "";
      const s = String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(","),
      ...filtered.map((r) => headers.map((h) => {
        if (h === "yes_payoff_if_wins") return escape(fmtYesPayoff(r.yes_ask));
        return escape(r[h]);
      }).join(",")),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `macrowire-markets-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="data-page">
      <div className="page-header">
        <p className="kicker">All markets · data table</p>
        <h2 className="page-title">The numbers</h2>
        <p className="page-sub">
          Active and backfilled settled economics contracts ({markets?.length?.toLocaleString() ?? 0} total).
          &ldquo;If YES wins&rdquo; shows ask vs $1 payout for open markets; settled rows show the official result.
        </p>
      </div>

      <div className="filter-bar">
        <input
          className="search"
          placeholder="Search by title or ticker…"
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(0); }}
        />
        <select value={seriesFilter} onChange={(e) => { setSeriesFilter(e.target.value); setPage(0); }}>
          <option value="">All series ({series.length})</option>
          {series.map(({ ticker, label }) => <option key={ticker} value={ticker}>{label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(0); }}>
          <option value="">All statuses</option>
          <option value="active">Active ({markets?.filter(isActiveMarket).length ?? 0})</option>
          <option value="finalized">Settled / finalized ({markets?.filter(isSettledMarket).length ?? 0})</option>
          <option value="closed">Closed / Expired</option>
        </select>
        <select value={minVol} onChange={(e) => { setMinVol(+e.target.value); setPage(0); }}>
          <option value={0}>Any volume</option>
          <option value={100}>≥ 100</option>
          <option value={1000}>≥ 1K</option>
          <option value={10000}>≥ 10K</option>
          <option value={100000}>≥ 100K</option>
        </select>
        <button className="export-btn" onClick={exportCsv}>↓ Export CSV</button>
      </div>

      <ExportBar kind="markets" />

      <div className="result-meta">
        <span>{filtered.length.toLocaleString()} contracts</span>
        <span className="dim">
          {paged.length > 0 && (
            <>Showing {page * pageSize + 1}–{page * pageSize + paged.length} of {filtered.length.toLocaleString()}</>
          )}
        </span>
      </div>

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Contract</th>
              <th>Ticker</th>
              <th>Series</th>
              <th>Status</th>
              <th>Result</th>
              <th onClick={() => handleSort("prob")} className="sortable">
                YES % {sortBy === "prob" && (sortDir === "desc" ? "↓" : "↑")}
              </th>
              <th className="num">Bid</th>
              <th className="num">Ask</th>
              <th onClick={() => handleSort("spread")} className="sortable num">
                Spread {sortBy === "spread" && (sortDir === "desc" ? "↓" : "↑")}
              </th>
              <th onClick={() => handleSort("volume")} className="sortable num">
                Volume {sortBy === "volume" && (sortDir === "desc" ? "↓" : "↑")}
              </th>
              <th onClick={() => handleSort("open_interest")} className="sortable num">
                OI {sortBy === "open_interest" && (sortDir === "desc" ? "↓" : "↑")}
              </th>
              <th onClick={() => handleSort("imp_ret")} className="sortable" title="Cost to buy YES (ask) and payout if the event happens">
                If YES wins {sortBy === "imp_ret" && (sortDir === "desc" ? "↓" : "↑")}
              </th>
              <th onClick={() => handleSort("close_time")} className="sortable">
                Days left {sortBy === "close_time" && (sortDir === "desc" ? "↓" : "↑")}
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((m) => {
              const d = daysLeft(m.close_time);
              const dlClass = d == null ? "" : d < 7 ? "d-soon" : d < 30 ? "d-mid" : "";
              const st = (m.status || "active").toLowerCase();
              const statusClass = ["finalized", "settled"].includes(st) ? "settled" : st;
              const resultLabel = m.result === "yes" ? "YES" : m.result === "no" ? "NO" : "—";
              return (
                <tr key={m.market_ticker} onClick={() => handleRowClick(m)} className="clickable-row">
                  <td className="title" title={m.event_title}>{m.event_title}</td>
                  <td className="mono">{m.market_ticker}</td>
                  <td className="mono dim">{m.series_ticker}</td>
                  <td><span className={"status status-" + statusClass}>{m.status}</span></td>
                  <td className={"mono bold " + (m.result === "yes" ? "res-yes" : m.result === "no" ? "res-no" : "dim")}>
                    {resultLabel}
                  </td>
                  <td className="num bold">{fmtCents(m.prob)}</td>
                  <td className="num mono">{fmtCents(m.yes_bid != null ? m.yes_bid * 100 : null)}</td>
                  <td className="num mono">{fmtCents(m.yes_ask != null ? m.yes_ask * 100 : null)}</td>
                  <td className="num mono">{fmtCents(m.spread)}</td>
                  <td className="num mono">{fmtNum(m.volume)}</td>
                  <td className="num mono dim">{fmtNum(m.open_interest)}</td>
                  <td className="mono payoff-cell" title={yesPayoffTitle(m.yes_ask)}>
                    {fmtYesPayoff(m.yes_ask)}
                  </td>
                  <td className={"num mono " + dlClass}>{d == null ? "—" : d < 0 ? "expired" : d + "d"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="pager">
          <button onClick={() => setPage(0)} disabled={page === 0}>« First</button>
          <button onClick={() => setPage(page - 1)} disabled={page === 0}>‹ Prev</button>
          <span className="page-info">Page {page + 1} of {totalPages}</span>
          <button onClick={() => setPage(page + 1)} disabled={page >= totalPages - 1}>Next ›</button>
          <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1}>Last »</button>
        </div>
      )}

      <style>{`
        .data-page { padding: 24px 0; }
        .page-header { margin-bottom: 24px; }
        .kicker { font-family: "IBM Plex Sans", sans-serif; font-size: 11px; text-transform: uppercase; letter-spacing: 0.12em; color: #8b3a1e; margin: 0 0 4px; }
        .page-title { font-family: "Newsreader", serif; font-size: 28px; font-weight: 600; margin: 0 0 6px; color: #1a1814; }
        .page-sub { font-family: "Newsreader", serif; font-style: italic; color: #6e685f; margin: 0; max-width: 60ch; }
        .filter-bar { display: flex; gap: 12px; padding: 12px 0; border-top: 1px solid #d9d2c4; border-bottom: 1px solid #d9d2c4; flex-wrap: wrap; align-items: center; }
        .filter-bar input, .filter-bar select { font-family: "IBM Plex Sans", sans-serif; font-size: 13px; padding: 6px 10px; border: 1px solid #d9d2c4; background: #faf6ef; color: #1a1814; }
        .filter-bar .search { flex: 1; min-width: 220px; }
        .export-btn { font-family: "IBM Plex Sans", sans-serif; font-size: 12px; padding: 6px 14px; background: #1a1814; color: #faf6ef; border: 0; cursor: pointer; letter-spacing: 0.04em; }
        .export-btn:hover { background: #8b3a1e; }
        .result-meta { display: flex; justify-content: space-between; align-items: center; padding: 12px 2px; font-family: "IBM Plex Sans", sans-serif; font-size: 12px; }
        .result-meta .dim { color: #6e685f; }
        .table-scroll { overflow-x: auto; border: 1px solid #d9d2c4; background: #faf6ef; }
        .data-table { width: 100%; border-collapse: collapse; font-family: "IBM Plex Sans", sans-serif; font-size: 12px; }
        .data-table th { text-align: left; padding: 10px 12px; border-bottom: 2px solid #1a1814; background: #f3ede0; text-transform: uppercase; font-size: 10px; letter-spacing: 0.08em; color: #1a1814; font-weight: 500; white-space: nowrap; position: sticky; top: 0; }
        .data-table th.num { text-align: right; }
        .data-table th.sortable { cursor: pointer; user-select: none; }
        .data-table th.sortable:hover { background: #e8e0d0; }
        .data-table td { padding: 8px 12px; border-bottom: 1px solid #e8e0d0; white-space: nowrap; }
        .data-table td.num { text-align: right; }
        .data-table td.payoff-cell { font-size: 11px; color: #4a6b3f; font-weight: 500; }
        .data-table td.title { max-width: 280px; overflow: hidden; text-overflow: ellipsis; }
        .data-table tr:hover td { background: #f3ede0; }
        .clickable-row { cursor: pointer; }
        .clickable-row:hover td { background: #e8e0d0 !important; }
        .mono { font-family: "IBM Plex Mono", monospace; font-size: 11.5px; }
        .dim { color: #6e685f; }
        .bold { font-weight: 600; color: #1a1814; }
        .d-soon { color: #8b3a1e; font-weight: 500; }
        .d-mid { color: #b8860b; }
        .status { display: inline-block; padding: 2px 7px; font-size: 9px; text-transform: uppercase; letter-spacing: 0.08em; border-radius: 2px; font-family: "IBM Plex Sans", sans-serif; }
        .status-active { background: #d4e0c4; color: #4a6b3f; }
        .status-closed { background: #e0d4c4; color: #6e685f; }
        .status-settled { background: #d4d4e8; color: #4a6fa5; }
        .res-yes { color: #4a6b3f; }
        .res-no { color: #8b3a1e; }
        .pager { display: flex; gap: 8px; justify-content: center; padding: 16px 0; align-items: center; font-family: "IBM Plex Sans", sans-serif; font-size: 12px; }
        .pager button { font-family: "IBM Plex Sans", sans-serif; font-size: 12px; padding: 4px 10px; background: #faf6ef; color: #1a1814; border: 1px solid #d9d2c4; cursor: pointer; }
        .pager button:hover:not(:disabled) { background: #1a1814; color: #faf6ef; }
        .pager button:disabled { opacity: 0.4; cursor: not-allowed; }
        .page-info { padding: 0 12px; color: #6e685f; }
      `}</style>
    </div>
  );
}
