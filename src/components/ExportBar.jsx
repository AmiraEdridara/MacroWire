import { EXPORT_URLS } from '../lib/data';

/**
 * Surfaces the server-side export endpoints so funds can pull signals
 * programmatically (curl / scheduled jobs) instead of scraping the UI.
 */
export default function ExportBar({ kind = 'markets', window = 14 }) {
  const links = [];
  if (kind === 'markets') {
    links.push({ label: 'Markets CSV', href: EXPORT_URLS.markets });
  }
  if (kind === 'volatility') {
    links.push({ label: `Volatility CSV (${window}d)`, href: EXPORT_URLS.volatility(window) });
    links.push({ label: 'Signals CSV', href: EXPORT_URLS.signals });
  }
  links.push({ label: 'Snapshot JSON', href: EXPORT_URLS.snapshot });

  return (
    <div className="export-bar">
      <span className="export-bar-label">API export</span>
      {links.map((l) => (
        <a key={l.href} className="export-bar-link" href={l.href} target="_blank" rel="noreferrer">
          ↓ {l.label}
        </a>
      ))}
      <code className="export-bar-curl">curl {EXPORT_URLS.snapshot}</code>
      <style>{`
        .export-bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 10px 0; }
        .export-bar-label { font-family: "IBM Plex Sans", sans-serif; font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #6e685f; }
        .export-bar-link { font-family: "IBM Plex Sans", sans-serif; font-size: 12px; color: #4a6fa5; text-decoration: none; border: 1px solid #d9d2c4; padding: 4px 10px; border-radius: 2px; background: #faf6ef; }
        .export-bar-link:hover { background: #f3ede0; }
        .export-bar-curl { font-family: "IBM Plex Mono", monospace; font-size: 10px; color: #8b7e6a; background: #f3ede0; padding: 4px 8px; border-radius: 2px; }
      `}</style>
    </div>
  );
}
