"""Email alerts, digest delivery, and outbox fallback."""

from __future__ import annotations

import json
import logging
import os
import smtplib
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from pathlib import Path
from typing import Any

from app.briefs import build_morning_digest
from app.signals import compute_signals
from app.subscriptions import list_subscriptions

logger = logging.getLogger("macrowire.notifications")

OUTBOX = Path(__file__).resolve().parent.parent / "data" / "alert_outbox.jsonl"
SENT_HASHES = Path(__file__).resolve().parent.parent / "data" / "alert_sent.json"


def _smtp_configured() -> bool:
    return bool(os.environ.get("SMTP_HOST") and os.environ.get("SMTP_FROM"))


def send_email(to: str, subject: str, body_text: str, body_html: str | None = None) -> bool:
    if not _smtp_configured():
        _write_outbox({"to": to, "subject": subject, "body": body_text, "at": datetime.now(timezone.utc).isoformat()})
        logger.info("SMTP not configured — queued to outbox: %s", subject)
        return False

    host = os.environ["SMTP_HOST"]
    port = int(os.environ.get("SMTP_PORT", "587"))
    user = os.environ.get("SMTP_USER", "")
    password = os.environ.get("SMTP_PASS", "")
    from_addr = os.environ["SMTP_FROM"]

    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = from_addr
    msg["To"] = to
    msg.attach(MIMEText(body_text, "plain", "utf-8"))
    if body_html:
        msg.attach(MIMEText(body_html, "html", "utf-8"))

    with smtplib.SMTP(host, port, timeout=30) as server:
        if os.environ.get("SMTP_TLS", "1") not in ("0", "false", "no"):
            server.starttls()
        if user and password:
            server.login(user, password)
        server.sendmail(from_addr, [to], msg.as_string())
    return True


def _write_outbox(record: dict[str, Any]) -> None:
    OUTBOX.parent.mkdir(parents=True, exist_ok=True)
    with OUTBOX.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record) + "\n")


def _load_sent() -> dict[str, str]:
    if not SENT_HASHES.exists():
        return {}
    try:
        return json.loads(SENT_HASHES.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def _save_sent(data: dict[str, str]) -> None:
    SENT_HASHES.parent.mkdir(parents=True, exist_ok=True)
    SENT_HASHES.write_text(json.dumps(data, indent=2), encoding="utf-8")


def _alert_fingerprint(kind: str, payload: str) -> str:
    return f"{kind}:{hash(payload) & 0xFFFFFFFF:x}"


def collect_live_alerts(watchlist: list[str] | None = None, move_threshold_pp: float = 5.0) -> list[dict[str, Any]]:
    """Alerts that would fire right now."""
    from app.briefs import _upcoming_events, _market_moves

    alerts: list[dict[str, Any]] = []
    for ev in _upcoming_events(days_forward=3):
        if ev["days_away"] <= 2:
            alerts.append({
                "type": "pre_release",
                "severity": "medium",
                "title": f"{ev['event_name']} in {ev['days_away']}d",
                "detail": f"{ev['date']} {ev['time']} ET · est {ev['forecast'] or 'n/a'}",
                "event": ev,
            })

    tickers = watchlist or []
    if not tickers:
        signals = compute_signals(limit=10)
        tickers = [s["ticker"] for s in signals]

    for t in tickers[:25]:
        snap = _market_moves(t)
        delta = snap.get("delta_pp")
        if delta is not None and abs(delta) >= move_threshold_pp:
            alerts.append({
                "type": "move",
                "severity": "high" if abs(delta) >= 10 else "medium",
                "title": f"Large move on {t}",
                "detail": f"{delta:+.1f}pp in 24h · now {snap['latest_prob'] * 100:.1f}%",
                "ticker": t,
            })

    return alerts


def dispatch_subscription_alerts(sub: dict[str, Any]) -> int:
    """Send new alerts to one subscriber. Returns count sent."""
    watchlist = sub.get("watchlist") or []
    threshold = float(sub.get("move_threshold_pp") or 5.0)
    alerts = collect_live_alerts(watchlist=watchlist or None, move_threshold_pp=threshold)

    if sub.get("alert_pre_release") is False:
        alerts = [a for a in alerts if a["type"] != "pre_release"]
    if sub.get("alert_moves") is False:
        alerts = [a for a in alerts if a["type"] != "move"]

    if not alerts:
        return 0

    sent_map = _load_sent()
    sub_id = sub["id"]
    new_alerts = []
    for a in alerts:
        fp = _alert_fingerprint(a["type"], f"{sub_id}:{a.get('title')}:{a.get('detail')}")
        if sent_map.get(fp):
            continue
        new_alerts.append((fp, a))

    if not new_alerts:
        return 0

    lines = [f"• [{a['severity'].upper()}] {a['title']} — {a['detail']}" for _, a in new_alerts]
    body = "MacroWire alerts\n\n" + "\n".join(lines) + "\n\n— MacroWire (not financial advice)"
    subject = f"MacroWire: {len(new_alerts)} new alert{'s' if len(new_alerts) != 1 else ''}"

    send_email(sub["email"], subject, body)

    for fp, _ in new_alerts:
        sent_map[fp] = datetime.now(timezone.utc).isoformat()
    _save_sent(sent_map)
    return len(new_alerts)


def dispatch_digests(hour: int | None = None) -> int:
    """Send morning digest to subscribers whose digest_hour matches (UTC)."""
    now_hour = hour if hour is not None else datetime.now(timezone.utc).hour
    count = 0
    for sub in list_subscriptions():
        if not sub.get("digest_enabled", True):
            continue
        if int(sub.get("digest_hour", 7)) != now_hour:
            continue
        digest = build_morning_digest(sub.get("watchlist") or [])
        body = digest["title"] + "\n\n" + "\n\n".join(digest["paragraphs"]) + "\n\n— MacroWire"
        send_email(sub["email"], digest["title"], body)
        count += 1
    return count


def run_alert_cycle() -> dict[str, int]:
    sent = 0
    for sub in list_subscriptions():
        sent += dispatch_subscription_alerts(sub)
    return {"alerts_sent": sent}
