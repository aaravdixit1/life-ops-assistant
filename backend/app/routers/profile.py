"""
User Profile, Setup & Onboarding, External Calendar Feeds, and File Upload Router.
"""
import json
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel

from ..config import settings
from ..db import get_conn
from ..jobs.canvas_ics import poll_canvas_ics
from ..services import calendar_feeds, profile_service, rag_indexer
from ..services.google_auth import is_google_configured

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_DOC_SOURCE_TYPES = {"canvas_syllabus", "resume", "local_file"}


class ProfileUpdateRequest(BaseModel):
    full_name: Optional[str] = None
    first_name: Optional[str] = None
    institution: Optional[str] = None
    term_label: Optional[str] = None
    major_or_role: Optional[str] = None
    majors: Optional[List[str]] = None
    minors: Optional[List[str]] = None
    academic_year: Optional[str] = None
    expected_graduation: Optional[str] = None
    career_role: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    timezone: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    grocery_radius_miles: Optional[int] = None
    wake_time: Optional[str] = None
    sleep_time: Optional[str] = None
    study_sanctuary: Optional[str] = None
    canvas_base_url: Optional[str] = None
    canvas_ics_url: Optional[str] = None
    daily_calories_target: Optional[int] = None
    daily_protein_g: Optional[int] = None
    daily_carbs_g: Optional[int] = None
    daily_fats_g: Optional[int] = None
    dietary_notes: Optional[str] = None
    onboarding_completed: Optional[bool] = None
    gemini_api_key: Optional[str] = None
    clear_gemini_api_key: bool = False
    sync_canvas: bool = False


class GeocodeRequest(BaseModel):
    query: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None


class CalendarFeedCreateRequest(BaseModel):
    name: str
    provider: str = "ics_url"
    feed_url: Optional[str] = None
    color: str = "#38bdf8"
    calendar_id: Optional[str] = None
    sync_now: bool = True


@router.get("")
async def get_user_profile() -> Dict[str, Any]:
    """Retrieve the user profile and current onboarding/integration setup status."""
    profile = await profile_service.get_profile()
    setup_status = await profile_service.get_setup_status()
    return {"profile": profile, "setup_status": setup_status}


@router.put("")
async def update_user_profile(payload: ProfileUpdateRequest) -> Dict[str, Any]:
    """Upsert user profile, optionally syncing Canvas ICS immediately."""
    update_data = payload.model_dump(exclude={"sync_canvas"}, exclude_unset=True)
    updated_profile = await profile_service.update_profile(update_data)

    canvas_sync: Optional[Dict[str, Any]] = None
    if payload.sync_canvas:
        _, effective_ics = await profile_service.get_effective_canvas_config()
        if effective_ics:
            try:
                canvas_sync = await poll_canvas_ics()
            except Exception as e:
                logger.warning(f"Canvas sync after profile update failed: {e}")
                canvas_sync = {"status": "error", "message": str(e)}

    setup_status = await profile_service.get_setup_status()
    return {
        "status": "success",
        "profile": updated_profile,
        "setup_status": setup_status,
        "canvas_sync": canvas_sync,
    }


@router.post("/geocode")
async def geocode_city(payload: GeocodeRequest) -> Dict[str, Any]:
    """Search matching cities via keyless Open-Meteo Geocoding API."""
    lookup = (payload.query or " ".join(p for p in [payload.city, payload.region] if p)).strip()
    results = await profile_service.geocode_location(lookup)
    return {"results": results}


@router.get("/calendar-feeds")
async def list_calendar_feeds() -> List[Dict[str, Any]]:
    """List all configured external calendar feeds."""
    return await calendar_feeds.list_feeds()


@router.post("/calendar-feeds")
async def create_calendar_feed(payload: CalendarFeedCreateRequest) -> Dict[str, Any]:
    """Validate URL (converting webcal:// -> https://), create feed, and optionally sync immediately."""
    try:
        feed = await calendar_feeds.create_feed(
            name=payload.name,
            provider=payload.provider,
            feed_url=payload.feed_url,
            color=payload.color,
            calendar_id=payload.calendar_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    sync_result: Optional[Dict[str, Any]] = None
    if payload.sync_now and feed.get("feed_url"):
        sync_result = await calendar_feeds.sync_calendar_feed(feed["id"])
        # Refresh feed metadata after initial sync
        refreshed = [f for f in await calendar_feeds.list_feeds() if f["id"] == feed["id"]]
        if refreshed:
            feed = refreshed[0]

    return {
        "status": "success",
        "feed": feed,
        "sync_result": sync_result,
    }


@router.post("/calendar-feeds/sync-all")
async def sync_all_feeds_endpoint() -> Dict[str, Any]:
    """Trigger immediate sync across all enabled calendar feeds."""
    return await calendar_feeds.sync_all_calendar_feeds()


@router.post("/calendar-feeds/{feed_id}/sync")
async def sync_single_feed_endpoint(feed_id: str) -> Dict[str, Any]:
    """Sync a single configured calendar feed."""
    res = await calendar_feeds.sync_calendar_feed(feed_id)
    if res.get("error") == "Feed not found" or res.get("error") == "Invalid feed ID":
        raise HTTPException(status_code=404, detail=res["error"])
    return res


@router.delete("/calendar-feeds/{feed_id}")
async def delete_calendar_feed(
    feed_id: str,
    delete_events: bool = Query(True),
) -> Dict[str, Any]:
    """Delete an external calendar feed and optionally remove its imported events."""
    try:
        res = await calendar_feeds.delete_feed(feed_id, delete_events=delete_events)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not res.get("deleted"):
        raise HTTPException(status_code=404, detail="Calendar feed not found")
    return {"status": "success", **res}


@router.post("/upload-google-credentials")
async def upload_google_credentials(file: UploadFile = File(...)) -> Dict[str, Any]:
    """Validate and save a Google OAuth desktop/web client credentials JSON file."""
    raw = await file.read()
    try:
        data = json.loads(raw.decode("utf-8"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON file uploaded.")

    if not isinstance(data, dict) or ("installed" not in data and "web" not in data):
        raise HTTPException(
            status_code=400,
            detail="Invalid Google OAuth credentials JSON: expected 'installed' or 'web' key.",
        )

    creds_path = Path(settings.google_credentials_path)
    creds_path.parent.mkdir(parents=True, exist_ok=True)
    creds_path.write_text(json.dumps(data, indent=2), encoding="utf-8")

    return {
        "status": "success",
        "google_configured": is_google_configured(),
        "path": str(creds_path),
    }


@router.post("/upload-document")
async def upload_rag_document(
    file: UploadFile = File(...),
    source_type: str = Form("local_file"),
    course: Optional[str] = Form(None),
) -> Dict[str, Any]:
    """Upload a .pdf, .docx, .md, or .txt document and index it into pgvector RAG storage."""
    if source_type not in ALLOWED_DOC_SOURCE_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid source_type '{source_type}'. Must be one of: {sorted(ALLOWED_DOC_SOURCE_TYPES)}",
        )

    raw_bytes = await file.read()
    max_bytes = 10 * 1024 * 1024
    if len(raw_bytes) > max_bytes:
        raise HTTPException(status_code=400, detail="File exceeds 10 MB upload limit.")

    filename = Path(file.filename or "uploaded_document.txt").name
    try:
        content = rag_indexer.extract_text_from_upload(filename, raw_bytes)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    source_path = f"uploads/{source_type}/{filename}"
    meta: Dict[str, Any] = {
        "filename": filename,
        "extension": Path(filename).suffix.lower(),
        "uploaded": True,
        "characters": len(content),
    }
    if course and course.strip():
        meta["course"] = course.strip()
    try:
        chunks = await rag_indexer.index_document(
            source_path=source_path,
            source_type=source_type,
            content=content,
            metadata=meta,
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to index document: {e}")

    preview = content[:180].strip() + ("..." if len(content) > 180 else "")
    return {
        "status": "success",
        "filename": filename,
        "source_type": source_type,
        "source_path": source_path,
        "chunks_indexed": chunks,
        "characters_extracted": len(content),
        "preview": preview,
    }


@router.post("/clear-sample-data")
async def clear_sample_data() -> Dict[str, Any]:
    """Delete seeded/existing calendar events, tracked calendar feeds, and Canvas assignments for a clean workspace."""
    async with get_conn() as conn:
        cal_res = await conn.execute("DELETE FROM calendar_events")
        assign_res = await conn.execute("DELETE FROM canvas_assignments")
        feeds_res = await conn.execute("DELETE FROM calendar_feeds")

    cal_deleted = int(cal_res.split()[-1]) if cal_res else 0
    assign_deleted = int(assign_res.split()[-1]) if assign_res else 0
    feeds_deleted = int(feeds_res.split()[-1]) if feeds_res else 0
    return {
        "status": "success",
        "calendar_events_deleted": cal_deleted,
        "canvas_assignments_deleted": assign_deleted,
        "calendar_feeds_deleted": feeds_deleted,
    }
