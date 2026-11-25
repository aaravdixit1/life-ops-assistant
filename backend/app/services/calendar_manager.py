"""
Calendar Manager Service
Handles local calendar operations, event scheduling, conflict detection,
and .ics import/export out of the box without requiring Google Cloud.
"""
from datetime import date, datetime, timezone, timedelta
import hashlib
from typing import List, Dict, Any, Optional
from zoneinfo import ZoneInfo
import icalendar
import uuid
from uuid import UUID
from ..db import get_conn
from .calendar_feeds import (
    expand_vevent_occurrences,
    slugify_calendar_id,
    upsert_uploaded_calendar_feed,
)
from .profile_service import get_profile
import logging

logger = logging.getLogger(__name__)


def _parse_json_field(val: Any) -> Any:
    if isinstance(val, str):
        try:
            import json
            return json.loads(val)
        except Exception:
            return None
    return val


async def get_events(
    start_time: Optional[datetime] = None,
    end_time: Optional[datetime] = None,
    calendar_id: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = 500,
) -> List[Dict[str, Any]]:
    """Retrieve calendar events with optional filtering and joined Canvas task metadata."""
    conditions = []
    params = []
    idx = 1

    if start_time:
        conditions.append(f"ce.end_time >= ${idx}")
        params.append(start_time)
        idx += 1
    if end_time:
        conditions.append(f"ce.start_time <= ${idx}")
        params.append(end_time)
        idx += 1
    if calendar_id and calendar_id != "all":
        conditions.append(f"ce.calendar_id = ${idx}")
        params.append(calendar_id)
        idx += 1
    if source:
        conditions.append(f"ce.source = ${idx}")
        params.append(source)
        idx += 1

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = f"""
        SELECT ce.id, ce.google_event_id, ce.calendar_id, ce.calendar_name, ce.summary,
               ce.description, ce.location, ce.start_time, ce.end_time, ce.source, ce.status,
               ce.recurring_rule, ce.color, ce.external_uid, ce.created_at, ce.updated_at,
               COALESCE(
                   ce.item_type,
                   CASE WHEN ce.source IN ('canvas_inferred', 'life_ops_study_block') THEN 'task' ELSE 'event' END
               ) AS item_type,
               ca.id::text AS assignment_id,
               ca.course_name,
               ca.is_submitted,
               ca.submission_status,
               ca.ai_summary,
               ca.ai_sections,
               ca.ai_model,
               ca.syllabus_notes,
               ca.due_at
        FROM calendar_events ce
        LEFT JOIN canvas_assignments ca
          ON ce.external_uid = 'canvas:' || ca.canvas_uid
        {where_clause}
        ORDER BY ce.start_time ASC
        LIMIT ${idx}
    """
    params.append(limit)

    async with get_conn() as conn:
        rows = await conn.fetch(query, *params)
        results = []
        for r in rows:
            item = dict(r)
            item["ai_sections"] = _parse_json_field(item.get("ai_sections"))
            results.append(item)
        return results


async def create_event(data: Dict[str, Any]) -> Dict[str, Any]:
    """Create a new calendar event or task (single or recurring series)."""
    repeat = data.get("repeat")
    start_time = data["start_time"]
    end_time = data["end_time"]
    duration = end_time - start_time
    src = data.get("source", "life_ops_manual")
    item_type = "task" if src in ("life_ops_study_block", "canvas_inferred") else "event"

    recurring_rule = data.get("recurring_rule")
    if repeat and repeat in ["weekly", "daily_weekdays"]:
        series_id = str(uuid.uuid4())[:8]
        recurring_rule = f"FREQ={'WEEKLY' if repeat == 'weekly' else 'DAILY'};SERIES={series_id}"

        semester_end = datetime(2026, 12, 16, 23, 59, 59, tzinfo=start_time.tzinfo)
        occurrences = []
        curr_start = start_time
        while curr_start <= semester_end:
            if repeat == "daily_weekdays":
                if curr_start.weekday() < 5:
                    occurrences.append((curr_start, curr_start + duration))
                curr_start = curr_start + timedelta(days=1)
            elif repeat == "weekly":
                occurrences.append((curr_start, curr_start + duration))
                curr_start = curr_start + timedelta(weeks=1)

        async with get_conn() as conn:
            first_row = None
            for s_time, e_time in occurrences:
                row = await conn.fetchrow("""
                    INSERT INTO calendar_events (
                        calendar_id, calendar_name, summary, description, location,
                        start_time, end_time, source, item_type, status, color, recurring_rule
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                    RETURNING *
                """,
                    data.get("calendar_id", "primary"),
                    data.get("calendar_name", "Personal"),
                    data["summary"],
                    data.get("description"),
                    data.get("location"),
                    s_time,
                    e_time,
                    src,
                    item_type,
                    data.get("status", "confirmed"),
                    data.get("color", "#38bdf8"),
                    recurring_rule
                )
                if not first_row:
                    first_row = dict(row)
            return first_row or {}
    else:
        async with get_conn() as conn:
            row = await conn.fetchrow("""
                INSERT INTO calendar_events (
                    calendar_id, calendar_name, summary, description, location,
                    start_time, end_time, source, item_type, status, color, recurring_rule
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING *
            """,
                data.get("calendar_id", "primary"),
                data.get("calendar_name", "Personal"),
                data["summary"],
                data.get("description"),
                data.get("location"),
                start_time,
                end_time,
                src,
                item_type,
                data.get("status", "confirmed"),
                data.get("color", "#38bdf8"),
                recurring_rule
            )
            return dict(row)


async def update_event(event_id: str, data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
    """Update an existing calendar event."""
    next_source = data.get("source")
    next_item_type = (
        ("task" if next_source in ("life_ops_study_block", "canvas_inferred") else "event")
        if next_source is not None
        else None
    )
    async with get_conn() as conn:
        row = await conn.fetchrow("""
            UPDATE calendar_events
            SET summary = COALESCE($2, summary),
                description = COALESCE($3, description),
                location = COALESCE($4, location),
                start_time = COALESCE($5, start_time),
                end_time = COALESCE($6, end_time),
                color = COALESCE($7, color),
                status = COALESCE($8, status),
                source = COALESCE($9, source),
                item_type = COALESCE($10, item_type),
                calendar_name = COALESCE($11, calendar_name),
                updated_at = now()
            WHERE id = $1
            RETURNING *
        """,
            event_id,
            data.get("summary"),
            data.get("description"),
            data.get("location"),
            data.get("start_time"),
            data.get("end_time"),
            data.get("color"),
            data.get("status"),
            next_source,
            next_item_type,
            data.get("calendar_name")
        )
        return dict(row) if row else None


async def delete_event_with_mode(event_id: str, mode: str = "single") -> int:
    """
    Delete calendar event(s) according to mode:
    - 'single': deletes only this event
    - 'week': deletes all instances of this event/series in the same week
    - 'series': deletes all events in this recurring series
    """
    async with get_conn() as conn:
        target = await conn.fetchrow("SELECT * FROM calendar_events WHERE id = $1", event_id)
        if not target:
            return 0

        target_dict = dict(target)
        rule = target_dict.get("recurring_rule")
        summary = target_dict.get("summary")
        st = target_dict["start_time"]

        if mode == "series":
            if rule:
                res = await conn.execute(
                    "DELETE FROM calendar_events WHERE recurring_rule = $1", rule
                )
            else:
                res = await conn.execute(
                    "DELETE FROM calendar_events WHERE summary = $1", summary
                )
            return int(res.replace("DELETE ", ""))

        elif mode == "week":
            weekday = st.weekday()
            monday = st - timedelta(days=weekday)
            monday_start = monday.replace(hour=0, minute=0, second=0, microsecond=0)
            sunday_end = monday_start + timedelta(days=7)

            if rule:
                res = await conn.execute("""
                    DELETE FROM calendar_events 
                    WHERE recurring_rule = $1 AND start_time >= $2 AND start_time < $3
                """, rule, monday_start, sunday_end)
            else:
                res = await conn.execute("""
                    DELETE FROM calendar_events 
                    WHERE summary = $1 AND start_time >= $2 AND start_time < $3
                """, summary, monday_start, sunday_end)
            return int(res.replace("DELETE ", ""))

        else: # "single"
            res = await conn.execute("DELETE FROM calendar_events WHERE id = $1", event_id)
            return int(res.replace("DELETE ", ""))


async def delete_event(event_id: str) -> bool:
    """Delete a calendar event (compatibility method)."""
    count = await delete_event_with_mode(event_id, mode="single")
    return count > 0


async def detect_conflicts(
    start_time: datetime,
    end_time: datetime,
    exclude_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Detect overlapping events within the given window.
    Particularly checks against fixed class schedules.
    """
    async with get_conn() as conn:
        query = """
            SELECT id, summary, location, start_time, end_time, calendar_name, source
            FROM calendar_events
            WHERE status != 'cancelled'
              AND COALESCE(source, '') != 'canvas_inferred'
              AND COALESCE(calendar_id, '') != 'canvas_deadlines'
              AND (start_time < $2 AND end_time > $1)
        """
        params = [start_time, end_time]
        if exclude_id:
            query += " AND id != $3"
            params.append(exclude_id)

        rows = await conn.fetch(query, *params)
        return [dict(r) for r in rows]


async def export_ics(calendar_id: Optional[str] = None) -> str:
    """Export calendar events as standard iCalendar format."""
    events = await get_events(calendar_id=calendar_id, limit=500)
    cal = icalendar.Calendar()
    cal.add("prodid", "-//Life-Ops Assistant//Calendar//EN")
    cal.add("version", "2.0")

    for ev in events:
        event = icalendar.Event()
        event.add("summary", ev["summary"])
        if ev.get("description"):
            event.add("description", ev["description"])
        if ev.get("location"):
            event.add("location", ev["location"])
        event.add("dtstart", ev["start_time"])
        event.add("dtend", ev["end_time"])
        event.add("uid", f"lifeops-{ev['id']}@assistant")
        cal.add_component(event)

    return cal.to_ical().decode("utf-8")


def _normalize_ics_dt(val: Any, user_tz: ZoneInfo) -> Optional[datetime]:
    """Normalize iCalendar date or datetime to UTC datetime using user_tz for naive/date values."""
    if val is None:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=user_tz).astimezone(timezone.utc)
        return val.astimezone(timezone.utc)
    if isinstance(val, date):
        return datetime(val.year, val.month, val.day, 0, 0, 0, tzinfo=user_tz).astimezone(timezone.utc)
    return None


async def import_ics(
    ics_content: str,
    calendar_id: Optional[str] = None,
    calendar_name: str = "Imported",
    provider: str = "ics_file",
    color: str = "#38bdf8",
) -> Dict[str, Any]:
    """
    Import events from an .ics string into Postgres, expanding RRULEs & all-day dates,
    upserting via external_uid, and recording a removable calendar_feeds entry.
    """
    profile = await get_profile()
    tz_name = profile.get("timezone") or "America/New_York"
    try:
        user_tz = ZoneInfo(tz_name)
    except Exception:
        user_tz = ZoneInfo("America/New_York")

    clean_name = (calendar_name or "Imported").strip() or "Imported"
    clean_cal_id = (calendar_id or "").strip()
    if not clean_cal_id or clean_cal_id == "imported":
        clean_cal_id = slugify_calendar_id(clean_name, prefix="upload")
    clean_color = (color or "#38bdf8").strip()

    cal = icalendar.Calendar.from_ical(ics_content)
    count = 0
    async with get_conn() as conn:
        for component in cal.walk("VEVENT"):
            summary = str(component.get("SUMMARY", "Untitled Event")).strip() or "Untitled Event"
            desc = str(component.get("DESCRIPTION", "") or "").strip() or None
            loc = str(component.get("LOCATION", "") or "").strip() or None
            raw_uid = str(component.get("UID", "") or "").strip()

            raw_status = str(component.get("STATUS", "CONFIRMED")).strip().upper()
            if raw_status == "CANCELLED":
                status = "cancelled"
            elif raw_status == "TENTATIVE":
                status = "tentative"
            else:
                status = "confirmed"

            occurrences = expand_vevent_occurrences(component, user_tz)
            for start, end, occ_suffix in occurrences:
                base_uid = raw_uid or hashlib.sha256(
                    f"{summary}:{start.isoformat()}:{end.isoformat()}".encode()
                ).hexdigest()[:24]
                external_uid = f"upload:{clean_cal_id}:{base_uid}{occ_suffix}"

                await conn.execute(
                    """
                    INSERT INTO calendar_events (
                        external_uid, calendar_id, calendar_name, summary, description, location,
                        start_time, end_time, source, status, color
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'external', $9, $10)
                    ON CONFLICT (external_uid) WHERE external_uid IS NOT NULL DO UPDATE SET
                        calendar_id = EXCLUDED.calendar_id,
                        calendar_name = EXCLUDED.calendar_name,
                        summary = EXCLUDED.summary,
                        description = EXCLUDED.description,
                        location = EXCLUDED.location,
                        start_time = EXCLUDED.start_time,
                        end_time = EXCLUDED.end_time,
                        status = EXCLUDED.status,
                        color = EXCLUDED.color,
                        updated_at = now()
                    """,
                    external_uid,
                    clean_cal_id,
                    clean_name,
                    summary,
                    desc,
                    loc,
                    start,
                    end,
                    status,
                    clean_color,
                )
                count += 1

    feed_record = await upsert_uploaded_calendar_feed(
        name=clean_name,
        calendar_id=clean_cal_id,
        color=clean_color,
        event_count=count,
    )
    return {
        "imported_count": count,
        "calendar_id": clean_cal_id,
        "calendar_name": clean_name,
        "feed": feed_record,
    }


async def list_calendars() -> List[Dict[str, Any]]:
    """Return distinct calendars present in calendar_events enriched with calendar_feeds metadata."""
    async with get_conn() as conn:
        event_rows = await conn.fetch(
            """
            SELECT calendar_id,
                   COALESCE(MAX(NULLIF(calendar_name, '')), calendar_id) AS calendar_name,
                   COALESCE(MAX(NULLIF(color, '')), '#38bdf8') AS color,
                   MAX(source) AS source,
                   COUNT(*)::int AS event_count
            FROM calendar_events
            WHERE status != 'cancelled'
            GROUP BY calendar_id
            ORDER BY event_count DESC, calendar_id ASC
            """
        )
        feed_rows = await conn.fetch(
            """
            SELECT id, name, provider, calendar_id, color, last_synced_at, last_event_count
            FROM calendar_feeds
            ORDER BY created_at ASC
            """
        )

    feeds_by_cal = {r["calendar_id"]: dict(r) for r in feed_rows}
    calendars: List[Dict[str, Any]] = []
    seen_ids: set[str] = set()

    for r in event_rows:
        cal_id = r["calendar_id"] or "primary"
        seen_ids.add(cal_id)
        feed = feeds_by_cal.get(cal_id)
        calendars.append({
            "calendar_id": cal_id,
            "calendar_name": (feed["name"] if feed else None) or r["calendar_name"] or cal_id,
            "color": (feed["color"] if feed else None) or r["color"] or "#38bdf8",
            "source": r["source"],
            "event_count": r["event_count"],
            "feed_id": str(feed["id"]) if feed else None,
            "provider": feed["provider"] if feed else None,
        })

    # Include any configured feed whose events haven't been synced yet or fell outside range
    for cal_id, feed in feeds_by_cal.items():
        if cal_id not in seen_ids:
            calendars.append({
                "calendar_id": cal_id,
                "calendar_name": feed["name"],
                "color": feed["color"] or "#38bdf8",
                "source": "external",
                "event_count": 0,
                "feed_id": str(feed["id"]),
                "provider": feed["provider"],
            })

    return calendars


async def delete_calendar_by_id(calendar_id: str) -> Dict[str, Any]:
    """Delete all calendar_events belonging to calendar_id and any linked calendar_feeds row."""
    async with get_conn() as conn:
        ev_res = await conn.execute("DELETE FROM calendar_events WHERE calendar_id = $1", calendar_id)
        feed_res = await conn.execute("DELETE FROM calendar_feeds WHERE calendar_id = $1", calendar_id)
    events_deleted = int(ev_res.split()[-1]) if ev_res else 0
    feeds_deleted = int(feed_res.split()[-1]) if feed_res else 0
    return {
        "status": "success",
        "calendar_id": calendar_id,
        "events_deleted": events_deleted,
        "feeds_deleted": feeds_deleted,
    }
