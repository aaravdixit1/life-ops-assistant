"""
Canvas .ics Ingestion Engine (Layer A)
Polls the user's private Canvas calendar feed to detect:
- New assignments
- Deleted / cancelled assignments
- Due-date shifts (preserving previous_due_at for timeline diffs)
"""
import logging
import re
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, Optional
from zoneinfo import ZoneInfo

import httpx
import icalendar

from ..db import get_conn
from ..services.profile_service import get_effective_canvas_config, get_profile

logger = logging.getLogger(__name__)

_COURSE_CODE_RE = re.compile(r"([A-Z]{2,5}[_\s-]?\d{3,4})")


def _clean_canvas_summary(title: str, course_name: Optional[str]) -> str:
    cleaned = re.sub(r"\s*(\([A-Za-z0-9_\s-]+\)|\[[^\]]+\])\s*$", "", title or "")
    cleaned = re.sub(r"\s*(\([A-Za-z0-9_\s-]+\)|\[[A-Za-z0-9_\s-]+\])", "", cleaned).strip()
    base = cleaned or title or "Canvas Assignment"
    if course_name and course_name.lower() not in base.lower():
        return f"{course_name}: {base}"
    return base


def extract_course_name(summary: str, description: str) -> Optional[str]:
    """Extract human-readable course name e.g. 'CS 3114', 'COMM 1014', 'MATH 101'."""
    for text in (summary or "", description or ""):
        match = _COURSE_CODE_RE.search(text)
        if match:
            normalized = re.sub(r"([A-Z]{2,5})[_\s-]?(\d{3,4})", r"\1 \2", match.group(1))
            return normalized.strip()
    return None


def to_utc_datetime(dt_val: Any, tz_name: str = "America/New_York") -> Optional[datetime]:
    """Normalize date or datetime into a UTC datetime object, localizing naive times to tz_name."""
    if dt_val is None:
        return None
    try:
        user_tz = ZoneInfo(tz_name or "America/New_York")
    except Exception:
        user_tz = ZoneInfo("America/New_York")

    if isinstance(dt_val, datetime):
        if dt_val.tzinfo is None:
            return dt_val.replace(tzinfo=user_tz).astimezone(timezone.utc)
        return dt_val.astimezone(timezone.utc)
    if isinstance(dt_val, date):
        # Full-day event: default to end of day (11:59:59 PM) in user's local timezone
        return datetime(dt_val.year, dt_val.month, dt_val.day, 23, 59, 59, tzinfo=user_tz).astimezone(timezone.utc)
    return None


async def poll_canvas_ics(feed_url_override: Optional[str] = None) -> Dict[str, Any]:
    """
    Fetch and parse the live Canvas ICS feed.
    Reconciles with Postgres canvas_assignments table.
    """
    _, effective_feed_url = await get_effective_canvas_config()
    feed_url = (feed_url_override or effective_feed_url or "").strip()

    if not feed_url or "PLACEHOLDER" in feed_url.upper():
        logger.info("No Canvas ICS feed URL configured (or PLACEHOLDER). Skipping poll.")
        return {"status": "skipped", "reason": "No feed URL"}

    profile = await get_profile()
    tz_name = profile.get("timezone") or "America/New_York"

    logger.info(f"Polling Canvas ICS feed: {feed_url[:50]}...")
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        resp = await client.get(feed_url)
        if resp.status_code != 200:
            logger.error(f"Canvas ICS poll failed with status {resp.status_code}")
            return {"status": "error", "code": resp.status_code}
        ics_text = resp.text

    try:
        cal = icalendar.Calendar.from_ical(ics_text)
    except Exception as e:
        logger.error(f"Failed to parse ICS payload: {e}")
        return {"status": "error", "message": str(e)}

    feed_events: Dict[str, Dict[str, Any]] = {}
    for component in cal.walk("VEVENT"):
        uid = str(component.get("UID", "")).strip()
        if not uid:
            continue

        summary = str(component.get("SUMMARY", "")).strip()
        description = str(component.get("DESCRIPTION", "")).strip()
        dtstart = component.get("DTSTART")
        dtend = component.get("DTEND")

        due_at = to_utc_datetime(
            dtstart.dt if dtstart else (dtend.dt if dtend else None),
            tz_name=tz_name,
        )
        course_name = extract_course_name(summary, description)

        feed_events[uid] = {
            "title": summary,
            "description": description,
            "due_at": due_at,
            "course_name": course_name,
            "ics_raw": component.to_ical().decode(errors="ignore"),
        }

    stats = {"new": 0, "shifted": 0, "deleted": 0, "active": 0}

    async with get_conn() as conn:
        rows = await conn.fetch("SELECT id, canvas_uid, title, due_at, status FROM canvas_assignments")
        db_assignments = {r["canvas_uid"]: r for r in rows}

        # 1. Insert new or detect shifts
        for uid, event in feed_events.items():
            if uid not in db_assignments:
                await conn.execute(
                    """
                    INSERT INTO canvas_assignments (
                        canvas_uid, course_name, title, description, due_at, status, ics_raw
                    ) VALUES ($1, $2, $3, $4, $5, 'active', $6)
                    ON CONFLICT (canvas_uid) DO NOTHING
                    """,
                    uid,
                    event["course_name"],
                    event["title"],
                    event["description"],
                    event["due_at"],
                    event["ics_raw"],
                )
                stats["new"] += 1
                logger.info(f"Added new assignment: [{event['course_name']}] {event['title']}")
            else:
                existing = db_assignments[uid]
                old_due = existing["due_at"]
                new_due = event["due_at"]
                if old_due and new_due and abs((old_due - new_due).total_seconds()) > 60:
                    await conn.execute(
                        """
                        UPDATE canvas_assignments
                        SET previous_due_at = $2, due_at = $3, status = 'active', updated_at = now()
                        WHERE canvas_uid = $1
                        """,
                        uid,
                        old_due,
                        new_due,
                    )
                    stats["shifted"] += 1
                    logger.info(f"Due date shifted for {existing['title']}: {old_due} -> {new_due}")
                elif existing["status"] != "active":
                    await conn.execute(
                        """
                        UPDATE canvas_assignments
                        SET status = 'active', updated_at = now()
                        WHERE canvas_uid = $1
                        """,
                        uid,
                    )

        # 2. Detect deletions (present in active DB, missing from feed)
        for uid, existing in db_assignments.items():
            if existing["status"] == "active" and uid not in feed_events:
                await conn.execute(
                    """
                    UPDATE canvas_assignments
                    SET status = 'deleted', updated_at = now()
                    WHERE canvas_uid = $1
                    """,
                    uid,
                )
                await conn.execute(
                    "DELETE FROM calendar_events WHERE external_uid = $1",
                    f"canvas:{uid}",
                )
                stats["deleted"] += 1
                logger.info(f"Marked assignment deleted: {existing['title']}")

        # 3. Project assignments with due_at into toggleable 'Canvas Deadlines' calendar_events
        cal_synced = 0
        for uid, event in feed_events.items():
            due_at = event.get("due_at")
            if not due_at:
                continue
            end_dt = due_at
            start_dt = end_dt - timedelta(minutes=30)
            summary = _clean_canvas_summary(event["title"], event.get("course_name"))
            await conn.execute(
                """
                INSERT INTO calendar_events (
                    external_uid, calendar_id, calendar_name, summary, description, location,
                    start_time, end_time, source, item_type, status, color
                ) VALUES ($1, 'canvas_deadlines', 'Canvas Deadlines', $2, $3, $4, $5, $6, 'canvas_inferred', 'task', 'confirmed', '#0284c7')
                ON CONFLICT (external_uid) WHERE external_uid IS NOT NULL DO UPDATE SET
                    calendar_id = EXCLUDED.calendar_id,
                    calendar_name = EXCLUDED.calendar_name,
                    summary = EXCLUDED.summary,
                    description = EXCLUDED.description,
                    location = EXCLUDED.location,
                    start_time = EXCLUDED.start_time,
                    end_time = EXCLUDED.end_time,
                    item_type = 'task',
                    color = EXCLUDED.color,
                    updated_at = now()
                """,
                f"canvas:{uid}",
                summary,
                event.get("description") or None,
                event.get("course_name") or "Canvas LMS",
                start_dt,
                end_dt,
            )
            cal_synced += 1

        # 4. Track 'Canvas Deadlines' inside calendar_feeds so users can view/remove it consistently
        existing_canvas_feed = await conn.fetchrow(
            "SELECT id FROM calendar_feeds WHERE calendar_id = 'canvas_deadlines' AND provider = 'canvas' LIMIT 1"
        )
        if existing_canvas_feed:
            await conn.execute(
                """
                UPDATE calendar_feeds
                SET feed_url = $2,
                    last_synced_at = now(),
                    last_event_count = $3,
                    last_error = NULL,
                    updated_at = now()
                WHERE id = $1
                """,
                existing_canvas_feed["id"],
                feed_url,
                cal_synced,
            )
        else:
            await conn.execute(
                """
                INSERT INTO calendar_feeds (
                    name, provider, feed_url, calendar_id, color, sync_enabled,
                    last_synced_at, last_event_count
                ) VALUES ('Canvas Deadlines', 'canvas', $1, 'canvas_deadlines', '#0284c7', TRUE, now(), $2)
                """,
                feed_url,
                cal_synced,
            )

        total_active = await conn.fetchval("SELECT COUNT(*) FROM canvas_assignments WHERE status = 'active'")
        stats["active"] = total_active
        stats["calendar_events_synced"] = cal_synced

    logger.info(f"Canvas poll complete: {stats}")
    return {"status": "success", "stats": stats}
