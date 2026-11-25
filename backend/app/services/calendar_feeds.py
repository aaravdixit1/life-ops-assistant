"""
External Calendar Feeds Service (Google / Apple iCloud / Outlook / Generic ICS / Webcal).
Supports read-only `.ics` and `webcal://` URL polling with SSRF validation and
deduplicated `external_uid` upserts into `calendar_events`.
"""
import hashlib
import ipaddress
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

from dateutil.rrule import rrulestr
import httpx
import icalendar

from ..db import get_conn
from .profile_service import get_profile

logger = logging.getLogger(__name__)

VALID_PROVIDERS = {"google", "apple", "outlook", "canvas", "ics_url", "ics_file"}


def slugify_calendar_id(name: str, prefix: str = "upload") -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    slug = slug[:40] or "calendar"
    return f"{prefix}:{slug}"


def _extract_exdates(component: Any, user_tz: ZoneInfo) -> set[datetime]:
    """Collect EXDATE timestamps normalized to UTC for filtering recurring events."""
    exdates: set[datetime] = set()
    raw_ex = component.get("EXDATE")
    if not raw_ex:
        return exdates
    items = raw_ex if isinstance(raw_ex, list) else [raw_ex]
    for prop in items:
        dts = getattr(prop, "dts", None)
        if dts:
            for item in dts:
                norm = _normalize_dt(getattr(item, "dt", item), user_tz)
                if norm:
                    exdates.add(norm)
        else:
            norm = _normalize_dt(getattr(prop, "dt", prop), user_tz)
            if norm:
                exdates.add(norm)
    return exdates


def expand_vevent_occurrences(
    component: Any,
    user_tz: ZoneInfo,
    window_start: Optional[datetime] = None,
    window_end: Optional[datetime] = None,
    max_occurrences: int = 250,
) -> List[Tuple[datetime, datetime, str]]:
    """
    Expand a VEVENT into (start_utc, end_utc, uid_suffix) tuples.
    Handles single timed events, all-day DATE events, DURATION, EXDATE, and RRULE recurrences.
    """
    dtstart = component.get("DTSTART")
    if not dtstart:
        return []

    raw_start = dtstart.dt
    start_dt = _normalize_dt(raw_start, user_tz)
    if start_dt is None:
        return []

    dtend = component.get("DTEND")
    if dtend:
        end_dt = _normalize_dt(dtend.dt, user_tz)
    else:
        duration_prop = component.get("DURATION")
        if duration_prop is not None:
            end_dt = start_dt + duration_prop.dt
        elif isinstance(raw_start, date) and not isinstance(raw_start, datetime):
            end_dt = start_dt + timedelta(days=1)
        else:
            end_dt = start_dt + timedelta(hours=1)

    if end_dt is None or end_dt <= start_dt:
        end_dt = start_dt + (
            timedelta(days=1)
            if isinstance(raw_start, date) and not isinstance(raw_start, datetime)
            else timedelta(hours=1)
        )

    dur = end_dt - start_dt
    rrule_prop = component.get("RRULE")
    if not rrule_prop:
        return [(start_dt, end_dt, "")]

    now_utc = datetime.now(timezone.utc)
    w_start = window_start or (now_utc - timedelta(days=45))
    w_end = window_end or (now_utc + timedelta(days=180))

    try:
        rrule_bytes = rrule_prop.to_ical() if hasattr(rrule_prop, "to_ical") else str(rrule_prop).encode()
        rrule_text = rrule_bytes.decode("utf-8", errors="ignore").strip()
        if not rrule_text.upper().startswith("RRULE:"):
            rrule_text = f"RRULE:{rrule_text}"

        # Normalize dtstart to local tz-aware datetime for consistent RRULE expansion
        if isinstance(raw_start, datetime):
            local_start = raw_start.replace(tzinfo=user_tz) if raw_start.tzinfo is None else raw_start.astimezone(user_tz)
        else:
            local_start = datetime(raw_start.year, raw_start.month, raw_start.day, 0, 0, 0, tzinfo=user_tz)

        # Ensure UNTIL in rrule matches tz-awareness of dtstart
        rule = None
        try:
            rule = rrulestr(rrule_text, dtstart=local_start)
        except Exception:
            # Strip Z / align naive if UNTIL tz mismatch occurs
            rule = rrulestr(rrule_text, dtstart=local_start.replace(tzinfo=None))

        exdates = _extract_exdates(component, user_tz)
        w_start_cmp = w_start if getattr(rule, "_dtstart", None) and rule._dtstart.tzinfo else w_start.astimezone(user_tz).replace(tzinfo=None)
        w_end_cmp = w_end if getattr(rule, "_dtstart", None) and rule._dtstart.tzinfo else w_end.astimezone(user_tz).replace(tzinfo=None)

        occurrences: List[Tuple[datetime, datetime, str]] = []
        for occ in rule.between(w_start_cmp, w_end_cmp, inc=True):
            occ_utc = (
                occ.astimezone(timezone.utc)
                if occ.tzinfo is not None
                else occ.replace(tzinfo=user_tz).astimezone(timezone.utc)
            )
            if occ_utc in exdates:
                continue
            occurrences.append((occ_utc, occ_utc + dur, f"#{occ_utc.strftime('%Y%m%dT%H%M%SZ')}"))
            if len(occurrences) >= max_occurrences:
                break

        # If RRULE exists solely in the past relative to window, keep base occurrence if it fell inside window or return empty
        if not occurrences and w_start <= start_dt <= w_end:
            return [(start_dt, end_dt, "")]
        return occurrences
    except Exception as e:
        logger.warning(f"Failed to expand RRULE ({e}); keeping single base event.")
        return [(start_dt, end_dt, "")]

_BLOCKED_HOSTS = {
    "169.254.169.254",
    "metadata.google.internal",
    "metadata.goog",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
    "::1",
}


def normalize_feed_url(url: str) -> str:
    """
    Normalize a calendar feed URL (converting webcal:// and webcals:// to https://)
    and reject non-HTTP(S) schemes or obvious SSRF targets.
    """
    if not url or not isinstance(url, str):
        raise ValueError("Feed URL cannot be empty")

    cleaned = url.strip()
    if not cleaned:
        raise ValueError("Feed URL cannot be empty")

    # Convert Apple iCloud / Outlook webcal(s):// links to https://
    cleaned = re.sub(r"^webcals?://", "https://", cleaned, flags=re.IGNORECASE)

    parsed = urlparse(cleaned)
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise ValueError(f"Unsupported URL scheme '{scheme}': only http, https, webcal, and webcals are allowed")

    hostname = (parsed.hostname or "").strip().lower()
    if not hostname:
        raise ValueError("Feed URL must contain a valid hostname")

    if hostname in _BLOCKED_HOSTS or hostname.endswith(".localhost") or hostname.endswith(".internal"):
        raise ValueError(f"Blocked feed hostname: '{hostname}'")

    try:
        ip = ipaddress.ip_address(hostname)
        if ip.is_loopback or ip.is_link_local or ip.is_unspecified or ip.is_reserved:
            raise ValueError(f"Blocked feed IP address: '{hostname}'")
    except ValueError as ip_err:
        # Either not an IP literal (normal domain name) or an explicitly raised blocked IP error
        if "Blocked feed IP" in str(ip_err):
            raise

    return cleaned


def _serialize_feed(row: Any) -> Dict[str, Any]:
    d = dict(row)
    d["id"] = str(d["id"])
    for ts_field in ("last_synced_at", "created_at", "updated_at"):
        if d.get(ts_field) is not None:
            d[ts_field] = d[ts_field].isoformat()
    return d


def _normalize_dt(val: Any, user_tz: ZoneInfo) -> Optional[datetime]:
    """Normalize a VEVENT date or datetime value into UTC."""
    if val is None:
        return None
    if isinstance(val, datetime):
        if val.tzinfo is None:
            return val.replace(tzinfo=user_tz).astimezone(timezone.utc)
        return val.astimezone(timezone.utc)
    if isinstance(val, date):
        return datetime(val.year, val.month, val.day, 0, 0, 0, tzinfo=user_tz).astimezone(timezone.utc)
    return None


async def list_feeds() -> List[Dict[str, Any]]:
    """Return all configured external calendar feeds."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT id, name, provider, feed_url, calendar_id, color, sync_enabled,
                   last_synced_at, last_event_count, last_error, created_at, updated_at
            FROM calendar_feeds
            ORDER BY created_at ASC
            """
        )
        return [_serialize_feed(r) for r in rows]


async def create_feed(
    name: str,
    provider: str,
    feed_url: Optional[str],
    color: str = "#38bdf8",
    calendar_id: Optional[str] = None,
) -> Dict[str, Any]:
    """Validate and insert a new external calendar feed."""
    clean_name = (name or "").strip()
    if not clean_name:
        raise ValueError("Feed name cannot be empty")

    clean_provider = (provider or "ics_url").strip().lower()
    if clean_provider not in VALID_PROVIDERS:
        raise ValueError(f"Unsupported provider '{provider}'. Must be one of: {sorted(VALID_PROVIDERS)}")

    normalized_url: Optional[str] = None
    if feed_url is not None and feed_url.strip():
        normalized_url = normalize_feed_url(feed_url)
    elif clean_provider != "ics_file":
        raise ValueError("Feed URL is required for URL-based calendar feeds")

    cal_id = (calendar_id or "").strip()
    if not cal_id or cal_id == "external":
        cal_id = f"{slugify_calendar_id(clean_name, prefix='feed')}-{str(uuid.uuid4())[:6]}"
    clean_color = (color or "#38bdf8").strip()

    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO calendar_feeds (name, provider, feed_url, calendar_id, color)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id, name, provider, feed_url, calendar_id, color, sync_enabled,
                      last_synced_at, last_event_count, last_error, created_at, updated_at
            """,
            clean_name,
            clean_provider,
            normalized_url,
            cal_id,
            clean_color,
        )
        return _serialize_feed(row)


async def upsert_uploaded_calendar_feed(
    name: str,
    calendar_id: str,
    color: str = "#38bdf8",
    event_count: int = 0,
) -> Dict[str, Any]:
    """Create or update a tracked calendar_feeds row for an uploaded .ics file."""
    clean_name = (name or "Imported Schedule").strip() or "Imported Schedule"
    clean_cal_id = (calendar_id or slugify_calendar_id(clean_name)).strip()
    clean_color = (color or "#38bdf8").strip()

    async with get_conn() as conn:
        existing = await conn.fetchrow(
            "SELECT id FROM calendar_feeds WHERE calendar_id = $1 AND provider = 'ics_file' LIMIT 1",
            clean_cal_id,
        )
        if existing:
            row = await conn.fetchrow(
                """
                UPDATE calendar_feeds
                SET name = $2,
                    color = $3,
                    last_synced_at = now(),
                    last_event_count = $4,
                    last_error = NULL,
                    updated_at = now()
                WHERE id = $1
                RETURNING id, name, provider, feed_url, calendar_id, color, sync_enabled,
                          last_synced_at, last_event_count, last_error, created_at, updated_at
                """,
                existing["id"],
                clean_name,
                clean_color,
                event_count,
            )
        else:
            row = await conn.fetchrow(
                """
                INSERT INTO calendar_feeds (
                    name, provider, feed_url, calendar_id, color, sync_enabled,
                    last_synced_at, last_event_count
                ) VALUES ($1, 'ics_file', NULL, $2, $3, FALSE, now(), $4)
                RETURNING id, name, provider, feed_url, calendar_id, color, sync_enabled,
                          last_synced_at, last_event_count, last_error, created_at, updated_at
                """,
                clean_name,
                clean_cal_id,
                clean_color,
                event_count,
            )
        return _serialize_feed(row)


async def delete_feed(feed_id: str, delete_events: bool = True) -> Dict[str, Any]:
    """Delete a calendar feed (URL subscription or uploaded .ics) and optionally its synced events."""
    try:
        uid = uuid.UUID(str(feed_id))
    except ValueError as e:
        raise ValueError("Invalid feed ID") from e

    async with get_conn() as conn:
        existing = await conn.fetchrow(
            "SELECT id, calendar_id, provider FROM calendar_feeds WHERE id = $1",
            uid,
        )
        if not existing:
            return {"deleted": False, "feed_id": str(feed_id), "events_deleted": 0}

        events_deleted = 0
        if delete_events:
            cal_id = existing["calendar_id"]
            if existing["provider"] in ("ics_file", "canvas") or (cal_id and (cal_id.startswith("upload:") or cal_id.startswith("feed:"))):
                res = await conn.execute(
                    "DELETE FROM calendar_events WHERE external_uid LIKE $1 OR calendar_id = $2",
                    f"feed:{uid}:%",
                    cal_id,
                )
            else:
                res = await conn.execute(
                    "DELETE FROM calendar_events WHERE external_uid LIKE $1",
                    f"feed:{uid}:%",
                )
            events_deleted = int(res.split()[-1]) if res else 0

        await conn.execute("DELETE FROM calendar_feeds WHERE id = $1", uid)
        return {
            "deleted": True,
            "feed_id": str(uid),
            "calendar_id": existing["calendar_id"],
            "events_deleted": events_deleted,
        }


async def sync_calendar_feed(feed_id: str) -> Dict[str, Any]:
    """Fetch and parse a single calendar feed's `.ics` payload and upsert into `calendar_events`."""
    try:
        uid = uuid.UUID(str(feed_id))
    except ValueError:
        return {"status": "error", "feed_id": str(feed_id), "error": "Invalid feed ID"}

    async with get_conn() as conn:
        feed = await conn.fetchrow(
            "SELECT id, name, provider, feed_url, calendar_id, color, sync_enabled FROM calendar_feeds WHERE id = $1",
            uid,
        )
        if not feed:
            return {"status": "error", "feed_id": str(feed_id), "error": "Feed not found"}

    feed_url = (feed["feed_url"] or "").strip()
    if not feed_url:
        return {"status": "skipped", "feed_id": str(uid), "reason": "No feed_url configured"}

    profile = await get_profile()
    tz_name = profile.get("timezone") or "America/New_York"
    try:
        user_tz = ZoneInfo(tz_name)
    except Exception:
        user_tz = ZoneInfo("America/New_York")

    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(feed_url)
            if resp.status_code != 200:
                err_msg = f"HTTP {resp.status_code} fetching feed"
                async with get_conn() as conn:
                    await conn.execute(
                        "UPDATE calendar_feeds SET last_error = $2, updated_at = now() WHERE id = $1",
                        uid,
                        err_msg,
                    )
                return {"status": "error", "feed_id": str(uid), "error": err_msg}
            ics_text = resp.text
    except Exception as e:
        err_msg = f"Fetch error: {e}"
        async with get_conn() as conn:
            await conn.execute(
                "UPDATE calendar_feeds SET last_error = $2, updated_at = now() WHERE id = $1",
                uid,
                err_msg,
            )
        return {"status": "error", "feed_id": str(uid), "error": err_msg}

    try:
        cal = icalendar.Calendar.from_ical(ics_text)
    except Exception as e:
        err_msg = f"ICS parse error: {e}"
        async with get_conn() as conn:
            await conn.execute(
                "UPDATE calendar_feeds SET last_error = $2, updated_at = now() WHERE id = $1",
                uid,
                err_msg,
            )
        return {"status": "error", "feed_id": str(uid), "error": err_msg}

    synced_count = 0
    async with get_conn() as conn:
        for component in cal.walk("VEVENT"):
            summary = str(component.get("SUMMARY", "Untitled Event")).strip() or "Untitled Event"
            description = str(component.get("DESCRIPTION", "") or "").strip() or None
            location = str(component.get("LOCATION", "") or "").strip() or None
            raw_uid = str(component.get("UID", "")).strip()

            raw_status = str(component.get("STATUS", "CONFIRMED")).strip().upper()
            if raw_status == "CANCELLED":
                status = "cancelled"
            elif raw_status == "TENTATIVE":
                status = "tentative"
            else:
                status = "confirmed"

            occurrences = expand_vevent_occurrences(component, user_tz)
            for start_dt, end_dt, occ_suffix in occurrences:
                base_uid = raw_uid or hashlib.sha256(
                    f"{summary}:{start_dt.isoformat()}:{end_dt.isoformat()}".encode()
                ).hexdigest()[:24]
                external_uid = f"feed:{uid}:{base_uid}{occ_suffix}"

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
                    feed["calendar_id"],
                    feed["name"],
                    summary,
                    description,
                    location,
                    start_dt,
                    end_dt,
                    status,
                    feed["color"],
                )
                synced_count += 1

        await conn.execute(
            """
            UPDATE calendar_feeds
            SET last_synced_at = now(),
                last_event_count = $2,
                last_error = NULL,
                updated_at = now()
            WHERE id = $1
            """,
            uid,
            synced_count,
        )

    logger.info(f"Synced calendar feed '{feed['name']}' ({uid}): {synced_count} events")
    return {
        "status": "success",
        "feed_id": str(uid),
        "feed_name": feed["name"],
        "events_synced": synced_count,
    }


async def sync_all_calendar_feeds() -> Dict[str, Any]:
    """Sync all enabled external calendar feeds that have a feed URL configured."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT id
            FROM calendar_feeds
            WHERE sync_enabled = TRUE
              AND feed_url IS NOT NULL
              AND trim(feed_url) != ''
            ORDER BY created_at ASC
            """
        )

    results = []
    for row in rows:
        res = await sync_calendar_feed(str(row["id"]))
        results.append(res)

    return {
        "status": "success",
        "feeds_synced": len(results),
        "results": results,
    }
