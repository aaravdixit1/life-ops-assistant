"""
Google Workspace Sync Service (Passive Sync by Default)
Syncs Google Calendar events, Google Tasks, and Gmail priority inbox.
Fails gracefully to local-first mode when Google OAuth credentials are not provided.
"""
from typing import Dict, Any, List
from googleapiclient.discovery import build
from .google_auth import get_google_credentials, is_google_configured
from ..db import get_conn
import logging

logger = logging.getLogger(__name__)


async def sync_google_calendar() -> Dict[str, Any]:
    """Passive sync of Google Calendar events into Postgres."""
    if not is_google_configured():
        return {
            "status": "local_mode",
            "message": "Google Cloud credentials not found. Local calendar database active.",
            "synced": 0,
        }

    creds = get_google_credentials()
    if not creds:
        return {"status": "error", "message": "Failed to authenticate with Google Calendar."}

    synced_count = 0
    try:
        service = build("calendar", "v3", credentials=creds)
        cals_res = service.calendarList().list().execute()
        calendars = cals_res.get("items", [])

        async with get_conn() as conn:
            for cal in calendars:
                cal_id = cal["id"]
                cal_name = cal.get("summary", "Unknown")
                events_res = service.events().list(
                    calendarId=cal_id,
                    maxResults=250,
                    singleEvents=True,
                    orderBy="startTime",
                ).execute()

                for item in events_res.get("items", []):
                    start = item.get("start", {}).get("dateTime") or item.get("start", {}).get("date")
                    end = item.get("end", {}).get("dateTime") or item.get("end", {}).get("date")
                    if not start or not end:
                        continue

                    await conn.execute("""
                        INSERT INTO calendar_events (
                            google_event_id, calendar_id, calendar_name, summary,
                            description, location, start_time, end_time, source, status
                        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'external', $9)
                        ON CONFLICT (google_event_id) DO UPDATE SET
                            summary = $4, description = $5, location = $6,
                            start_time = $7, end_time = $8, status = $9, updated_at = now()
                    """, item["id"], cal_id, cal_name, item.get("summary", "Untitled"),
                       item.get("description"), item.get("location"), start, end, item.get("status", "confirmed"))
                    synced_count += 1

        return {"status": "success", "synced": synced_count}
    except Exception as e:
        logger.error(f"Error syncing Google Calendar: {e}")
        return {"status": "error", "message": str(e)}


async def sync_google_tasks() -> Dict[str, Any]:
    """Passive sync of Google Tasks into Postgres."""
    if not is_google_configured():
        return {
            "status": "local_mode",
            "message": "Google Cloud credentials not found. Local tasks database active.",
            "synced": 0,
        }

    creds = get_google_credentials()
    if not creds:
        return {"status": "error", "message": "Failed to authenticate with Google Tasks."}

    try:
        service = build("tasks", "v1", credentials=creds)
        lists = service.tasklists().list().execute().get("items", [])
        synced_count = 0

        async with get_conn() as conn:
            for tlist in lists:
                list_id = tlist["id"]
                tasks = service.tasks().list(tasklist=list_id, maxResults=100).execute().get("items", [])
                for t in tasks:
                    status = "completed" if t.get("status") == "completed" else "needsAction"
                    due = t.get("due")[:10] if t.get("due") else None
                    await conn.execute("""
                        INSERT INTO google_tasks (
                            google_task_id, task_list_id, title, notes, due_date, status, source
                        ) VALUES ($1, $2, $3, $4, $5, $6, 'external')
                        ON CONFLICT (google_task_id) DO UPDATE SET
                            title = $3, notes = $4, due_date = $5, status = $6, updated_at = now()
                    """, t["id"], list_id, t.get("title", "Untitled"), t.get("notes"), due, status)
                    synced_count += 1

        return {"status": "success", "synced": synced_count}
    except Exception as e:
        logger.error(f"Error syncing Google Tasks: {e}")
        return {"status": "error", "message": str(e)}
