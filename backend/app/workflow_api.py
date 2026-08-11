"""Workflow API — briefs, signals, subscriptions, outbound alerts."""

from __future__ import annotations

from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from app.briefs import build_event_brief, build_market_brief, build_morning_digest
from app.notifications import collect_live_alerts, dispatch_digests, dispatch_subscription_alerts, run_alert_cycle, send_email
from app.signals import compute_signals
from app.subscriptions import delete_subscription, get_subscription, list_subscriptions, upsert_subscription

router = APIRouter()


class SubscriptionIn(BaseModel):
    email: str
    watchlist: list[str] = Field(default_factory=list)
    alert_moves: bool = True
    alert_pre_release: bool = True
    digest_enabled: bool = True
    digest_hour: int = Field(default=7, ge=0, le=23)
    move_threshold_pp: float = Field(default=5.0, ge=1.0, le=30.0)


@router.get("/api/brief/event")
def event_brief(
    date: Optional[str] = Query(None, description="Event date YYYY-MM-DD"),
    series: Optional[str] = Query(None, description="Event series key (cpi, fed, nfp, …)"),
):
    return build_event_brief(event_date=date, series=series)


@router.get("/api/brief/market/{ticker}")
def market_brief(ticker: str):
    return build_market_brief(ticker)


@router.get("/api/digest")
def morning_digest(tickers: Optional[str] = Query(None, description="Comma-separated watchlist tickers")):
    watchlist = [t.strip() for t in tickers.split(",") if t.strip()] if tickers else []
    return build_morning_digest(watchlist=watchlist or None)


@router.get("/api/signals")
def list_signals(
    limit: int = Query(20, ge=1, le=50),
    tickers: Optional[str] = Query(None, description="Comma-separated tickers to scan"),
):
    ticker_list = [t.strip() for t in tickers.split(",") if t.strip()] if tickers else None
    return {"signals": compute_signals(limit=limit, tickers=ticker_list), "count": limit}


@router.get("/api/alerts/live")
def live_alerts(
    tickers: Optional[str] = Query(None),
    move_threshold_pp: float = Query(5.0, ge=1.0, le=30.0),
):
    watchlist = [t.strip() for t in tickers.split(",") if t.strip()] if tickers else None
    alerts = collect_live_alerts(watchlist=watchlist, move_threshold_pp=move_threshold_pp)
    return {"alerts": alerts, "count": len(alerts)}


@router.get("/api/subscriptions")
def get_subscriptions():
    return {"subscriptions": list_subscriptions(), "count": len(list_subscriptions())}


@router.post("/api/subscriptions")
def create_or_update_subscription(body: SubscriptionIn):
    try:
        sub = upsert_subscription(body.model_dump())
        return sub
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.delete("/api/subscriptions/{sub_id}")
def remove_subscription(sub_id: str):
    if not delete_subscription(sub_id):
        raise HTTPException(status_code=404, detail="Subscription not found")
    return {"ok": True}


@router.post("/api/subscriptions/{sub_id}/test")
def test_subscription(sub_id: str):
    sub = get_subscription(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    n = dispatch_subscription_alerts(sub)
    return {"ok": True, "alerts_sent": n}


@router.post("/api/subscriptions/{sub_id}/digest")
def send_digest_now(sub_id: str):
    sub = get_subscription(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")
    digest = build_morning_digest(sub.get("watchlist") or [])
    body = digest["title"] + "\n\n" + "\n\n".join(digest["paragraphs"]) + "\n\n— MacroWire"
    send_email(sub["email"], digest["title"], body)
    return {"ok": True, "digest": digest}


@router.post("/api/notifications/run")
def run_notifications():
    """Manually trigger alert cycle (also runs on a timer)."""
    return run_alert_cycle()
