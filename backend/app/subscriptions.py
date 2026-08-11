"""Persist alert / digest subscriptions (JSON file)."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

STORE = Path(__file__).resolve().parent.parent / "data" / "subscriptions.json"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load() -> list[dict[str, Any]]:
    if not STORE.exists():
        return []
    try:
        data = json.loads(STORE.read_text(encoding="utf-8"))
        return data if isinstance(data, list) else []
    except (json.JSONDecodeError, OSError):
        return []


def _save(rows: list[dict[str, Any]]) -> None:
    STORE.parent.mkdir(parents=True, exist_ok=True)
    STORE.write_text(json.dumps(rows, indent=2), encoding="utf-8")


def list_subscriptions() -> list[dict[str, Any]]:
    return _load()


def get_subscription(sub_id: str) -> dict[str, Any] | None:
    for row in _load():
        if row.get("id") == sub_id:
            return row
    return None


def upsert_subscription(payload: dict[str, Any]) -> dict[str, Any]:
    rows = _load()
    email = (payload.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise ValueError("Valid email required")

    existing = next((r for r in rows if r.get("email") == email), None)
    if existing:
        sub = existing
    else:
        sub = {"id": str(uuid.uuid4()), "email": email, "created_at": _now()}

    sub.update({
        "email": email,
        "watchlist": payload.get("watchlist") or sub.get("watchlist") or [],
        "alert_moves": bool(payload.get("alert_moves", sub.get("alert_moves", True))),
        "alert_pre_release": bool(payload.get("alert_pre_release", sub.get("alert_pre_release", True))),
        "digest_enabled": bool(payload.get("digest_enabled", sub.get("digest_enabled", True))),
        "digest_hour": int(payload.get("digest_hour", sub.get("digest_hour", 7))),
        "move_threshold_pp": float(payload.get("move_threshold_pp", sub.get("move_threshold_pp", 5.0))),
        "updated_at": _now(),
    })

    if existing:
        rows = [sub if r.get("id") == sub["id"] else r for r in rows]
    else:
        rows.append(sub)
    _save(rows)
    return sub


def delete_subscription(sub_id: str) -> bool:
    rows = _load()
    kept = [r for r in rows if r.get("id") != sub_id]
    if len(kept) == len(rows):
        return False
    _save(kept)
    return True
