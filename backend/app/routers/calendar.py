from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Response, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List, Dict, Any, Literal
from ..services import calendar_manager, gatekeeper
from ..services.google_auth import is_google_configured
from ..services.google_sync import sync_google_calendar

router = APIRouter()


class EventCreate(BaseModel):
    summary: str
    start_time: datetime
    end_time: datetime
    calendar_id: str = "primary"
    calendar_name: str = "Personal"
    description: Optional[str] = None
    location: Optional[str] = None
    color: str = "#38bdf8"
    source: str = "life_ops_manual"
    recurring_rule: Optional[str] = None
    repeat: Optional[str] = None


class EventUpdate(BaseModel):
    summary: Optional[str] = None
    description: Optional[str] = None
    location: Optional[str] = None
    start_time: Optional[datetime] = None
    end_time: Optional[datetime] = None
    color: Optional[str] = None
    status: Optional[str] = None
    source: Optional[str] = None
    calendar_name: Optional[str] = None


class ScheduleAdjustmentRequest(BaseModel):
    event_id: str
    new_start: datetime
    new_end: datetime
    reason: str


class ConflictCheckRequest(BaseModel):
    start_time: datetime
    end_time: datetime
    exclude_id: Optional[str] = None


@router.get("/events")
async def list_events(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    calendar_id: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = Query(500, ge=1, le=2000),
) -> List[Dict[str, Any]]:
    """List calendar events with optional time-range and calendar filtering."""
    return await calendar_manager.get_events(
        start_time=start_time,
        end_time=end_time,
        calendar_id=calendar_id,
        source=source,
        limit=limit,
    )


@router.post("/events")
async def create_calendar_event(payload: EventCreate) -> Dict[str, Any]:
    """Create a new event in the local calendar."""
    return await calendar_manager.create_event(payload.model_dump())


@router.put("/events/{event_id}")
async def update_calendar_event(event_id: str, payload: EventUpdate) -> Dict[str, Any]:
    """Update an existing calendar event."""
    updated = await calendar_manager.update_event(event_id, payload.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="Event not found")
    return updated


@router.delete("/events/{event_id}")
async def delete_calendar_event(
    event_id: str,
    mode: Literal["single", "week", "series"] = Query("single")
) -> Dict[str, Any]:
    """Delete a calendar event (single instance, this week's instances, or entire recurring series)."""
    count = await calendar_manager.delete_event_with_mode(event_id, mode=mode)
    if count == 0:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"status": "success", "deleted_count": count, "mode": mode, "event_id": event_id}


@router.post("/detect-conflicts")
async def check_conflicts(payload: ConflictCheckRequest) -> List[Dict[str, Any]]:
    """Detect overlapping events within the proposed time range."""
    return await calendar_manager.detect_conflicts(
        start_time=payload.start_time,
        end_time=payload.end_time,
        exclude_id=payload.exclude_id,
    )


@router.post("/request-adjustment")
async def request_adjustment(payload: ScheduleAdjustmentRequest) -> Dict[str, Any]:
    """
    Action Gatekeeper endpoint:
    - Auto-adjusts and logs to autopilot_logs IF event is tagged 'life_ops_study_block'.
    - Returns structured diff preview in pending_actions IF touching classes or appointments.
    """
    return await gatekeeper.request_schedule_adjustment(
        event_id=payload.event_id,
        new_start=payload.new_start,
        new_end=payload.new_end,
        reason=payload.reason,
    )


@router.get("/export-ics")
async def export_calendar_ics(calendar_id: Optional[str] = None):
    """Download calendar events as standard .ics file."""
    ics_text = await calendar_manager.export_ics(calendar_id=calendar_id)
    return Response(
        content=ics_text,
        media_type="text/calendar",
        headers={"Content-Disposition": 'attachment; filename="life_ops_calendar.ics"'},
    )


@router.post("/import-ics")
async def import_calendar_ics(
    file: UploadFile = File(...),
    calendar_name: Optional[str] = Form(None),
    provider: str = Form("ics_file"),
    color: str = Form("#38bdf8"),
) -> Dict[str, Any]:
    """Import events from an uploaded .ics file into Postgres and register it as a removable calendar."""
    content = (await file.read()).decode("utf-8", errors="ignore")
    fallback_name = (file.filename or "Imported").rsplit(".", 1)[0].replace("_", " ").strip() or "Imported"
    clean_name = (calendar_name or "").strip() or fallback_name
    try:
        res = await calendar_manager.import_ics(
            content,
            calendar_name=clean_name,
            provider=provider,
            color=color,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid .ics calendar file: {e}")
    return {"status": "success", "provider": provider, **res}


@router.get("/calendars")
async def list_calendars_endpoint() -> List[Dict[str, Any]]:
    """List distinct calendars present in Postgres with event counts and feed metadata."""
    return await calendar_manager.list_calendars()


@router.delete("/calendars/{calendar_id:path}")
async def delete_calendar_endpoint(calendar_id: str) -> Dict[str, Any]:
    """Delete an uploaded, subscribed, or local calendar and all of its events."""
    return await calendar_manager.delete_calendar_by_id(calendar_id)


@router.get("/sync-status")
async def get_sync_status() -> Dict[str, Any]:
    """Check whether Google Cloud sync is active or running local-first."""
    is_google = is_google_configured()
    return {
        "mode": "google_workspace" if is_google else "local_first",
        "google_configured": is_google,
        "message": "Connected to Google Workspace" if is_google else "Operating in standalone local calendar mode.",
    }


@router.post("/trigger-google-sync")
async def trigger_google_sync() -> Dict[str, Any]:
    """Manually trigger Google Calendar sync (if credentials configured)."""
    return await sync_google_calendar()
