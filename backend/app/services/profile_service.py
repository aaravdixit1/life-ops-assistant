"""
User Profile, Setup Status, Geocoding, and Live Weather Service.
Manages the single-user local workspace configuration in Postgres `user_profile`
with zero-config defaults hydrated from environment settings.
"""
import json
import logging
import time
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

import httpx

from ..config import settings
from ..db import get_conn
from .google_auth import is_google_configured

logger = logging.getLogger(__name__)

# 15-minute in-memory TTL cache for Open-Meteo responses keyed by (round(lat, 2), round(lon, 2))
_WEATHER_CACHE: Dict[Tuple[float, float], Tuple[float, Dict[str, Any]]] = {}
_WEATHER_CACHE_TTL_SECONDS = 900.0

_COMPASS_DIRS = [
    "N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE",
    "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW",
]


def _is_placeholder(url: Optional[str]) -> bool:
    return not url or not url.strip() or "PLACEHOLDER" in url.upper()


def _derive_first_name_and_initials(full_name: str, first_name: str) -> Tuple[str, str]:
    full_clean = (full_name or "").strip()
    first_clean = (first_name or "").strip()
    if not first_clean and full_clean:
        first_clean = full_clean.split()[0]

    parts = [p for p in full_clean.split() if p]
    if parts:
        initials = "".join(p[0].upper() for p in parts[:2])
    elif first_clean:
        initials = first_clean[0].upper()
    else:
        initials = "LO"

    return first_clean, initials


def _mask_api_key(raw_key: Optional[str]) -> str:
    key = (raw_key or "").strip()
    if not key or "PLACEHOLDER" in key.upper():
        return ""
    if len(key) <= 8:
        return "•" * len(key)
    return f"{key[:4]}••••{key[-4:]}"


def _with_gemini_meta(d: Dict[str, Any], raw_profile_key: Optional[str] = None) -> Dict[str, Any]:
    d.pop("gemini_api_key", None)
    p_key = (raw_profile_key or "").strip()
    env_key = (settings.gemini_api_key or "").strip()
    if p_key and "PLACEHOLDER" not in p_key.upper():
        d["has_gemini_api_key"] = True
        d["gemini_api_key_source"] = "profile"
        d["gemini_api_key_masked"] = _mask_api_key(p_key)
    elif env_key and "PLACEHOLDER" not in env_key.upper():
        d["has_gemini_api_key"] = True
        d["gemini_api_key_source"] = "env"
        d["gemini_api_key_masked"] = _mask_api_key(env_key)
    else:
        d["has_gemini_api_key"] = False
        d["gemini_api_key_source"] = "none"
        d["gemini_api_key_masked"] = ""
    return d


def _parse_string_list(val: Any) -> List[str]:
    """Normalize JSONB/list/comma-delimited strings into a clean deduplicated list of strings."""
    if val is None:
        return []
    raw_items: List[Any] = []
    if isinstance(val, list):
        raw_items = val
    elif isinstance(val, str):
        stripped = val.strip()
        if not stripped:
            return []
        if stripped.startswith("["):
            try:
                parsed = json.loads(stripped)
                if isinstance(parsed, list):
                    raw_items = parsed
                else:
                    raw_items = [stripped]
            except Exception:
                raw_items = [s for s in stripped.split(",")]
        else:
            raw_items = [s for s in stripped.split(",")]
    else:
        return []

    seen = set()
    cleaned: List[str] = []
    for item in raw_items:
        s = str(item or "").strip()
        if not s:
            continue
        low = s.lower()
        if low not in seen:
            seen.add(low)
            cleaned.append(s)
    return cleaned


def _compose_major_or_role(
    majors: List[str],
    minors: List[str],
    academic_year: str,
    career_role: str,
    fallback: str = "",
) -> str:
    """Build a readable summary string for legacy consumers of `major_or_role`."""
    parts: List[str] = []
    if majors:
        major_str = " & ".join(majors)
        if minors:
            minor_label = "Minors" if len(minors) > 1 else "Minor"
            major_str = f"{major_str} ({minor_label}: {', '.join(minors)})"
        parts.append(major_str)
    elif minors:
        minor_label = "Minors" if len(minors) > 1 else "Minor"
        parts.append(f"{minor_label}: {', '.join(minors)}")

    if academic_year.strip():
        parts.append(academic_year.strip())
    if career_role.strip():
        parts.append(career_role.strip())

    return " · ".join(parts) if parts else fallback.strip()


def _clamp_radius_miles(val: Any, default: int = 5) -> int:
    try:
        n = int(val)
    except Exception:
        n = default
    return max(1, min(25, n))


def _default_profile_dict() -> Dict[str, Any]:
    full_name = (settings.user_name or "").strip()
    first_name, initials = _derive_first_name_and_initials(full_name, "")
    canvas_ics = "" if _is_placeholder(settings.canvas_ics_url) else (settings.canvas_ics_url or "").strip()
    canvas_base = "https://canvas.instructure.com" if _is_placeholder(settings.canvas_base_url) else settings.canvas_base_url.strip()

    return _with_gemini_meta({
        "id": "default",
        "full_name": full_name,
        "first_name": first_name,
        "initials": initials,
        "institution": "",
        "term_label": "Current Term",
        "major_or_role": "",
        "majors": [],
        "minors": [],
        "academic_year": "",
        "expected_graduation": "",
        "career_role": "",
        "city": (settings.user_city or "").strip(),
        "region": "",
        "timezone": (settings.user_timezone or "America/New_York").strip(),
        "latitude": None,
        "longitude": None,
        "grocery_radius_miles": 5,
        "wake_time": "08:30",
        "sleep_time": "23:30",
        "study_sanctuary": "",
        "canvas_base_url": canvas_base,
        "canvas_ics_url": canvas_ics,
        "daily_calories_target": 2600,
        "daily_protein_g": 155,
        "daily_carbs_g": 320,
        "daily_fats_g": 75,
        "dietary_notes": "",
        "onboarding_completed": False,
    })


def _row_to_profile_dict(row: Any) -> Dict[str, Any]:
    d = dict(row)
    raw_key = d.pop("gemini_api_key", "")
    full_name = (d.get("full_name") or "").strip()
    first_name, initials = _derive_first_name_and_initials(full_name, d.get("first_name") or "")
    d["first_name"] = first_name
    d["initials"] = initials
    d["majors"] = _parse_string_list(d.get("majors"))
    d["minors"] = _parse_string_list(d.get("minors"))
    d["academic_year"] = (d.get("academic_year") or "").strip()
    d["expected_graduation"] = (d.get("expected_graduation") or "").strip()
    d["career_role"] = (d.get("career_role") or "").strip()
    d["grocery_radius_miles"] = _clamp_radius_miles(d.get("grocery_radius_miles"), default=5)
    if not d.get("major_or_role") and (d["majors"] or d["minors"] or d["academic_year"] or d["career_role"]):
        d["major_or_role"] = _compose_major_or_role(
            d["majors"], d["minors"], d["academic_year"], d["career_role"]
        )
    if not d.get("timezone"):
        d["timezone"] = settings.user_timezone or "America/New_York"
    if not d.get("term_label"):
        d["term_label"] = "Current Term"
    if not d.get("wake_time"):
        d["wake_time"] = "08:30"
    if not d.get("sleep_time"):
        d["sleep_time"] = "23:30"
    if d.get("created_at") is not None:
        d["created_at"] = d["created_at"].isoformat()
    if d.get("updated_at") is not None:
        d["updated_at"] = d["updated_at"].isoformat()
    return _with_gemini_meta(d, raw_profile_key=raw_key)


async def get_effective_gemini_api_key() -> Tuple[Optional[str], str]:
    """Resolve effective Gemini API key, preferring user-supplied profile key over .env settings."""
    try:
        async with get_conn() as conn:
            row = await conn.fetchrow("SELECT gemini_api_key FROM user_profile WHERE id = 'default'")
            if row:
                p_key = (row["gemini_api_key"] or "").strip()
                if p_key and "PLACEHOLDER" not in p_key.upper():
                    return p_key, "profile"
    except Exception:
        pass

    env_key = (settings.gemini_api_key or "").strip()
    if env_key and "PLACEHOLDER" not in env_key.upper():
        return env_key, "env"
    return None, "none"


async def get_profile() -> Dict[str, Any]:
    """Read `user_profile WHERE id = 'default'`, returning settings-hydrated defaults if missing."""
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT * FROM user_profile WHERE id = 'default'")
        if row:
            return _row_to_profile_dict(row)
    return _default_profile_dict()


async def get_effective_canvas_config() -> Tuple[str, Optional[str]]:
    """
    Resolve effective (canvas_base_url, canvas_ics_url).
    Prefers non-empty `user_profile` values, falling back to `settings`.
    Treats URLs containing `PLACEHOLDER` as None.
    """
    profile_base = ""
    profile_ics = ""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT canvas_base_url, canvas_ics_url FROM user_profile WHERE id = 'default'"
        )
        if row:
            profile_base = (row["canvas_base_url"] or "").strip()
            profile_ics = (row["canvas_ics_url"] or "").strip()

    if not _is_placeholder(profile_base):
        effective_base = profile_base
    elif not _is_placeholder(settings.canvas_base_url):
        effective_base = settings.canvas_base_url.strip()
    else:
        effective_base = "https://canvas.instructure.com"

    if not _is_placeholder(profile_ics):
        effective_ics: Optional[str] = profile_ics
    elif not _is_placeholder(settings.canvas_ics_url):
        effective_ics = (settings.canvas_ics_url or "").strip()
    else:
        effective_ics = None

    return effective_base, effective_ics


async def get_setup_status() -> Dict[str, Any]:
    """Return onboarding & integration readiness status counts."""
    from .canvas_pw import is_session_valid

    profile = await get_profile()
    _, effective_ics = await get_effective_canvas_config()
    _, gemini_source = await get_effective_gemini_api_key()
    canvas_session_valid = await is_session_valid()
    google_oauth_configured = is_google_configured()

    async with get_conn() as conn:
        calendar_feeds_count = await conn.fetchval("SELECT COUNT(*) FROM calendar_feeds") or 0
        active_assignments_count = await conn.fetchval(
            "SELECT COUNT(*) FROM canvas_assignments WHERE status = 'active'"
        ) or 0
        calendar_events_count = await conn.fetchval("SELECT COUNT(*) FROM calendar_events") or 0

    return {
        "onboarding_completed": bool(profile.get("onboarding_completed", False)),
        "profile_configured": bool((profile.get("full_name") or "").strip() or profile.get("onboarding_completed")),
        "canvas_configured": bool(effective_ics) or bool(canvas_session_valid),
        "canvas_session_valid": bool(canvas_session_valid),
        "calendar_feeds_count": int(calendar_feeds_count),
        "google_oauth_configured": bool(google_oauth_configured),
        "active_assignments_count": int(active_assignments_count),
        "calendar_events_count": int(calendar_events_count),
        "has_gemini_api_key": gemini_source != "none",
        "gemini_api_key_source": gemini_source,
    }


async def geocode_location(query: str) -> List[Dict[str, Any]]:
    """
    Geocode a city/location string via keyless Open-Meteo Geocoding API (5s timeout).
    Returns [] if empty, invalid, or offline.
    """
    clean_query = (query or "").strip()
    if not clean_query:
        return []

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": clean_query, "count": 5, "language": "en", "format": "json"},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            raw_results = data.get("results") or []
            results: List[Dict[str, Any]] = []
            for item in raw_results:
                city = (item.get("name") or "").strip()
                region = (item.get("admin1") or "").strip()
                country = (item.get("country") or item.get("country_code") or "").strip()
                label = ", ".join(p for p in [city, region, country] if p)
                results.append({
                    "label": label,
                    "city": city,
                    "region": region,
                    "country": country,
                    "latitude": item.get("latitude"),
                    "longitude": item.get("longitude"),
                    "timezone": item.get("timezone") or "America/New_York",
                })
            return results
    except Exception as e:
        logger.debug(f"Geocoding lookup failed for '{clean_query}': {e}")
        return []


async def _sync_dietary_rules(
    conn: Any,
    calories_target: int,
    protein_g: int,
    carbs_g: int,
    fats_g: int,
) -> None:
    """Keep `dietary_rules` calorie_target and macro_target rows synced with profile targets."""
    cal_row = await conn.fetchrow(
        "SELECT id, value FROM dietary_rules WHERE rule_type = 'calorie_target' LIMIT 1"
    )
    if cal_row:
        existing_val = cal_row["value"]
        if isinstance(existing_val, str):
            try:
                existing_val = json.loads(existing_val)
            except Exception:
                existing_val = {}
        val_dict = dict(existing_val or {})
        val_dict["target_kcal"] = calories_target
        await conn.execute(
            "UPDATE dietary_rules SET value = $1 WHERE id = $2",
            json.dumps(val_dict),
            cal_row["id"],
        )
    else:
        await conn.execute(
            """
            INSERT INTO dietary_rules (rule_name, rule_type, value, notes)
            VALUES ('Daily Calorie Target', 'calorie_target', $1, 'Synced from user profile')
            """,
            json.dumps({"target_kcal": calories_target}),
        )

    macro_row = await conn.fetchrow(
        "SELECT id, value FROM dietary_rules WHERE rule_type = 'macro_target' LIMIT 1"
    )
    if macro_row:
        existing_val = macro_row["value"]
        if isinstance(existing_val, str):
            try:
                existing_val = json.loads(existing_val)
            except Exception:
                existing_val = {}
        val_dict = dict(existing_val or {})
        val_dict.update({
            "protein_g": protein_g,
            "carbs_g": carbs_g,
            "fats_g": fats_g,
        })
        await conn.execute(
            "UPDATE dietary_rules SET value = $1 WHERE id = $2",
            json.dumps(val_dict),
            macro_row["id"],
        )
    else:
        await conn.execute(
            """
            INSERT INTO dietary_rules (rule_name, rule_type, value, notes)
            VALUES ('Daily Macro Targets', 'macro_target', $1, 'Synced from user profile')
            """,
            json.dumps({"protein_g": protein_g, "carbs_g": carbs_g, "fats_g": fats_g}),
        )


async def update_profile(data: Dict[str, Any]) -> Dict[str, Any]:
    """
    Upsert `user_profile (id='default')`, auto-geocoding `city` if coordinates are omitted,
    and syncing macro/calorie targets into `dietary_rules`.
    """
    current = await get_profile()
    merged = {**current}

    allowed_fields = {
        "full_name", "first_name", "institution", "term_label", "major_or_role",
        "majors", "minors", "academic_year", "expected_graduation", "career_role",
        "city", "region", "timezone", "latitude", "longitude", "grocery_radius_miles",
        "wake_time", "sleep_time", "study_sanctuary",
        "canvas_base_url", "canvas_ics_url",
        "daily_calories_target", "daily_protein_g", "daily_carbs_g", "daily_fats_g",
        "dietary_notes", "onboarding_completed",
    }

    old_city = (current.get("city") or "").strip().lower()
    old_region = (current.get("region") or "").strip().lower()

    for key in allowed_fields:
        if key in data:
            merged[key] = data[key]

    merged["majors"] = _parse_string_list(merged.get("majors"))
    merged["minors"] = _parse_string_list(merged.get("minors"))
    merged["academic_year"] = (merged.get("academic_year") or "").strip()
    merged["expected_graduation"] = (merged.get("expected_graduation") or "").strip()
    merged["career_role"] = (merged.get("career_role") or "").strip()
    merged["grocery_radius_miles"] = _clamp_radius_miles(merged.get("grocery_radius_miles"), default=5)

    structured_academic_updated = any(
        k in data for k in ("majors", "minors", "academic_year", "career_role")
    )
    if structured_academic_updated and "major_or_role" not in data:
        merged["major_or_role"] = _compose_major_or_role(
            merged["majors"],
            merged["minors"],
            merged["academic_year"],
            merged["career_role"],
            fallback=merged.get("major_or_role") or "",
        )
    elif not (merged.get("major_or_role") or "").strip() and (
        merged["majors"] or merged["minors"] or merged["academic_year"] or merged["career_role"]
    ):
        merged["major_or_role"] = _compose_major_or_role(
            merged["majors"],
            merged["minors"],
            merged["academic_year"],
            merged["career_role"],
        )

    new_city = (merged.get("city") or "").strip()
    new_region = (merged.get("region") or "").strip()
    city_changed = (new_city.lower() != old_city) or (new_region.lower() != old_region)

    if "latitude" not in data and "longitude" not in data and city_changed:
        merged["latitude"] = None
        merged["longitude"] = None

    if new_city and merged.get("latitude") is None and merged.get("longitude") is None:
        query = f"{new_city} {new_region}".strip()
        geo_results = await geocode_location(query)
        if geo_results:
            top = geo_results[0]
            merged["latitude"] = top.get("latitude")
            merged["longitude"] = top.get("longitude")
            if ("timezone" not in data or not data.get("timezone")) and top.get("timezone"):
                merged["timezone"] = top["timezone"]

    full_name = (merged.get("full_name") or "").strip()
    explicit_first = (data.get("first_name") or "").strip() if "first_name" in data else (
        "" if ("full_name" in data and data.get("full_name") != current.get("full_name"))
        else (merged.get("first_name") or "").strip()
    )
    first_name, _ = _derive_first_name_and_initials(full_name, explicit_first)
    merged["full_name"] = full_name
    merged["first_name"] = first_name

    # Normalize PLACEHOLDER canvas ICS URL to empty string on save
    if _is_placeholder(merged.get("canvas_ics_url")):
        merged["canvas_ics_url"] = ""
    else:
        merged["canvas_ics_url"] = (merged.get("canvas_ics_url") or "").strip()

    merged["canvas_base_url"] = (merged.get("canvas_base_url") or "").strip()
    merged["timezone"] = (merged.get("timezone") or settings.user_timezone or "America/New_York").strip()
    merged["daily_calories_target"] = int(merged.get("daily_calories_target") or 2600)
    merged["daily_protein_g"] = int(merged.get("daily_protein_g") or 155)
    merged["daily_carbs_g"] = int(merged.get("daily_carbs_g") or 320)
    merged["daily_fats_g"] = int(merged.get("daily_fats_g") or 75)

    if data.get("clear_gemini_api_key"):
        gemini_key_param: Optional[str] = ""
    elif isinstance(data.get("gemini_api_key"), str) and data["gemini_api_key"].strip():
        raw_input_key = data["gemini_api_key"].strip()
        gemini_key_param = "" if _is_placeholder(raw_input_key) else raw_input_key
    else:
        gemini_key_param = None

    async with get_conn() as conn:
        await conn.execute(
            """
            INSERT INTO user_profile (
                id, full_name, first_name, institution, term_label, major_or_role,
                majors, minors, academic_year, expected_graduation, career_role,
                city, region, timezone, latitude, longitude, grocery_radius_miles,
                wake_time, sleep_time, study_sanctuary,
                canvas_base_url, canvas_ics_url,
                daily_calories_target, daily_protein_g, daily_carbs_g, daily_fats_g,
                dietary_notes, onboarding_completed, gemini_api_key, updated_at
            ) VALUES (
                'default', $1, $2, $3, $4, $5,
                $6::jsonb, $7::jsonb, $8, $9, $10,
                $11, $12, $13, $14, $15, $16,
                $17, $18, $19,
                $20, $21,
                $22, $23, $24, $25,
                $26, $27, COALESCE($28, ''), now()
            )
            ON CONFLICT (id) DO UPDATE SET
                full_name = EXCLUDED.full_name,
                first_name = EXCLUDED.first_name,
                institution = EXCLUDED.institution,
                term_label = EXCLUDED.term_label,
                major_or_role = EXCLUDED.major_or_role,
                majors = EXCLUDED.majors,
                minors = EXCLUDED.minors,
                academic_year = EXCLUDED.academic_year,
                expected_graduation = EXCLUDED.expected_graduation,
                career_role = EXCLUDED.career_role,
                city = EXCLUDED.city,
                region = EXCLUDED.region,
                timezone = EXCLUDED.timezone,
                latitude = EXCLUDED.latitude,
                longitude = EXCLUDED.longitude,
                grocery_radius_miles = EXCLUDED.grocery_radius_miles,
                wake_time = EXCLUDED.wake_time,
                sleep_time = EXCLUDED.sleep_time,
                study_sanctuary = EXCLUDED.study_sanctuary,
                canvas_base_url = EXCLUDED.canvas_base_url,
                canvas_ics_url = EXCLUDED.canvas_ics_url,
                daily_calories_target = EXCLUDED.daily_calories_target,
                daily_protein_g = EXCLUDED.daily_protein_g,
                daily_carbs_g = EXCLUDED.daily_carbs_g,
                daily_fats_g = EXCLUDED.daily_fats_g,
                dietary_notes = EXCLUDED.dietary_notes,
                onboarding_completed = EXCLUDED.onboarding_completed,
                gemini_api_key = COALESCE($28, user_profile.gemini_api_key),
                updated_at = now()
            """,
            merged["full_name"],
            merged["first_name"],
            merged.get("institution") or "",
            merged.get("term_label") or "Current Term",
            merged.get("major_or_role") or "",
            json.dumps(merged["majors"]),
            json.dumps(merged["minors"]),
            merged["academic_year"],
            merged["expected_graduation"],
            merged["career_role"],
            new_city,
            new_region,
            merged["timezone"],
            merged.get("latitude"),
            merged.get("longitude"),
            merged["grocery_radius_miles"],
            merged.get("wake_time") or "08:30",
            merged.get("sleep_time") or "23:30",
            merged.get("study_sanctuary") or "",
            merged["canvas_base_url"],
            merged["canvas_ics_url"],
            merged["daily_calories_target"],
            merged["daily_protein_g"],
            merged["daily_carbs_g"],
            merged["daily_fats_g"],
            merged.get("dietary_notes") or "",
            bool(merged.get("onboarding_completed", False)),
            gemini_key_param,
        )

        await _sync_dietary_rules(
            conn,
            merged["daily_calories_target"],
            merged["daily_protein_g"],
            merged["daily_carbs_g"],
            merged["daily_fats_g"],
        )

    return await get_profile()


def _wmo_to_weather_meta(code: Optional[int], is_day: bool) -> Tuple[str, str, str]:
    """Map WMO weather code to (condition, short_condition, icon)."""
    c = int(code) if code is not None else 0
    if c == 0:
        return (
            "Clear Skies" if is_day else "Clear Night",
            "Clear" if is_day else "Clear Night",
            "sun" if is_day else "moon",
        )
    if c in (1, 2):
        return (
            "Partly Cloudy" if is_day else "Partly Cloudy Night",
            "Partly Cloudy",
            "cloud-sun" if is_day else "moon",
        )
    if c == 3:
        return "Overcast Skies", "Overcast", "cloud"
    if c in (45, 48):
        return "Foggy & Misty", "Foggy", "cloud"
    if c in (51, 53, 55, 56, 57):
        return "Light Drizzle", "Drizzle", "rain"
    if c in (61, 63, 65, 66, 67, 80, 81, 82):
        return "Rain Showers", "Rain", "rain"
    if c in (71, 73, 75, 77, 85, 86):
        return "Snowfall", "Snow", "snow"
    if c in (95, 96, 99):
        return "Thunderstorms", "Storms", "rain"
    return (
        "Mild & Clear" if is_day else "Clear Night",
        "Mild" if is_day else "Clear Night",
        "sun" if is_day else "moon",
    )


def _deg_to_compass(degrees: Optional[float]) -> str:
    if degrees is None:
        return "W"
    idx = int((float(degrees) + 11.25) // 22.5) % 16
    return _COMPASS_DIRS[idx]


def _format_hour_label(hour: int) -> str:
    if hour == 0:
        return "12 AM"
    if hour < 12:
        return f"{hour} AM"
    if hour == 12:
        return "12 PM"
    return f"{hour - 12} PM"


def _build_neutral_weather(now: datetime, tz_abbr: str, location_label: str) -> Dict[str, Any]:
    """Clean neutral weather fallback when location coordinates are absent or offline."""
    current_hour = now.hour
    is_daytime = 6 <= current_hour < 18
    slots = [1, 4, 7, 10, 13, 16, 19, 22]
    hourly = []
    for hr in slots:
        slot_day = 6 <= hr < 18
        temp = 66 if 11 <= hr <= 17 else (58 if 7 <= hr < 11 or 18 <= hr <= 20 else 52)
        cond = "Mild Sun" if slot_day else "Clear Night"
        icon = "sun" if (10 <= hr <= 16) else ("cloud-sun" if slot_day else "moon")
        hourly.append({
            "hour": hr,
            "time": _format_hour_label(hr),
            "temp": temp,
            "condition": cond,
            "icon": icon,
            "is_now": (hr <= current_hour < hr + 3) or (current_hour < 1 and hr == 1),
        })

    loc_text = location_label or "Local Workspace"
    return {
        "location": loc_text,
        "current_time": f"{now.strftime('%I:%M %p')} {tz_abbr}".strip(),
        "temp_f": 64 if is_daytime else 54,
        "feels_like_f": 63 if is_daytime else 52,
        "high_f": 68,
        "low_f": 50,
        "condition": "Mild & Clear (Estimated)" if is_daytime else "Clear Night (Estimated)",
        "short_condition": "Mild & Clear" if is_daytime else "Clear Night",
        "is_daytime": is_daytime,
        "humidity": 48,
        "wind_mph": 5,
        "wind_dir": "W",
        "precip_pct": 0,
        "air_quality": "Good",
        "commute_advice": (
            "Set your city in Setup & Profile to unlock live Open-Meteo local forecasts and commute guidance."
        ),
        "hourly": hourly,
    }


async def fetch_live_weather(
    lat: Optional[float],
    lon: Optional[float],
    tz_name: str,
    location_label: str,
) -> Dict[str, Any]:
    """
    Fetch live weather from keyless Open-Meteo API with a 15-min TTL cache keyed by (round(lat, 2), round(lon, 2)).
    Falls back cleanly to a neutral estimate if coordinates are missing or offline.
    """
    try:
        user_tz = ZoneInfo(tz_name or "America/New_York")
    except Exception:
        user_tz = ZoneInfo("America/New_York")

    now = datetime.now(user_tz)
    tz_abbr = now.tzname() or ""
    loc_text = location_label or "Local Workspace"

    if lat is None or lon is None:
        return _build_neutral_weather(now, tz_abbr, loc_text)

    cache_key = (round(float(lat), 2), round(float(lon), 2))
    cached = _WEATHER_CACHE.get(cache_key)
    payload: Optional[Dict[str, Any]] = None
    if cached and (time.monotonic() - cached[0]) < _WEATHER_CACHE_TTL_SECONDS:
        payload = cached[1]

    if payload is None:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(
                    "https://api.open-meteo.com/v1/forecast",
                    params={
                        "latitude": float(lat),
                        "longitude": float(lon),
                        "current": "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
                        "hourly": "temperature_2m,weather_code,precipitation_probability,is_day",
                        "daily": "temperature_2m_max,temperature_2m_min",
                        "temperature_unit": "fahrenheit",
                        "wind_speed_unit": "mph",
                        "timezone": tz_name or "auto",
                        "forecast_days": 1,
                    },
                )
                if resp.status_code == 200:
                    payload = resp.json()
                    _WEATHER_CACHE[cache_key] = (time.monotonic(), payload)
        except Exception as e:
            logger.debug(f"Open-Meteo fetch failed for {cache_key}: {e}")
            payload = None

    if not payload or "current" not in payload:
        return _build_neutral_weather(now, tz_abbr, loc_text)

    current = payload.get("current") or {}
    daily = payload.get("daily") or {}
    hourly_data = payload.get("hourly") or {}

    is_day = bool(current.get("is_day", 1 if 6 <= now.hour < 18 else 0))
    temp_f = round(float(current.get("temperature_2m", 62)))
    feels_like_f = round(float(current.get("apparent_temperature", temp_f)))
    humidity = round(float(current.get("relative_humidity_2m", 50)))
    wind_mph = round(float(current.get("wind_speed_10m", 5)))
    wind_dir = _deg_to_compass(current.get("wind_direction_10m"))

    highs = daily.get("temperature_2m_max") or [temp_f + 4]
    lows = daily.get("temperature_2m_min") or [temp_f - 6]
    high_f = round(float(highs[0]))
    low_f = round(float(lows[0]))

    condition, short_condition, icon = _wmo_to_weather_meta(current.get("weather_code"), is_day)

    times = hourly_data.get("time") or []
    temps = hourly_data.get("temperature_2m") or []
    codes = hourly_data.get("weather_code") or []
    precips = hourly_data.get("precipitation_probability") or []
    is_days = hourly_data.get("is_day") or []

    current_hour = now.hour
    precip_pct = 0
    if 0 <= current_hour < len(precips) and precips[current_hour] is not None:
        precip_pct = int(round(float(precips[current_hour])))

    target_hours = [1, 4, 7, 10, 13, 16, 19, 22]
    hourly_list: List[Dict[str, Any]] = []
    for hr in target_hours:
        if hr < len(times) and hr < len(temps):
            h_temp = round(float(temps[hr]))
            h_code = codes[hr] if hr < len(codes) else current.get("weather_code")
            h_day = bool(is_days[hr]) if hr < len(is_days) else (6 <= hr < 18)
            _, h_short, h_icon = _wmo_to_weather_meta(h_code, h_day)
            hourly_list.append({
                "hour": hr,
                "time": _format_hour_label(hr),
                "temp": h_temp,
                "condition": h_short,
                "icon": h_icon,
                "is_now": (hr <= current_hour < hr + 3) or (current_hour < 1 and hr == 1),
            })

    if not hourly_list:
        hourly_list = _build_neutral_weather(now, tz_abbr, loc_text)["hourly"]

    if icon in ("rain", "snow") or precip_pct >= 45:
        commute_advice = (
            f"Currently {temp_f}°F ({condition.lower()}) with a {precip_pct}% chance of precipitation. "
            f"Bring a waterproof layer or umbrella for your commute today."
        )
    elif temp_f < 48:
        commute_advice = (
            f"Crisp {temp_f}°F outdoors (feels like {feels_like_f}°F, high {high_f}°F). "
            f"Wear a warm jacket or layered fleece when heading out."
        )
    elif temp_f > 82:
        commute_advice = (
            f"Warm {temp_f}°F today (high {high_f}°F). Stay hydrated and favor shaded routes between blocks."
        )
    else:
        commute_advice = (
            f"Comfortable {temp_f}°F ({short_condition.lower()}) in {loc_text} with {wind_mph} mph {wind_dir} breeze; "
            f"temperatures ranging from {low_f}°F to {high_f}°F today."
        )

    return {
        "location": loc_text,
        "current_time": f"{now.strftime('%I:%M %p')} {tz_abbr}".strip(),
        "temp_f": temp_f,
        "feels_like_f": feels_like_f,
        "high_f": high_f,
        "low_f": low_f,
        "condition": condition,
        "short_condition": short_condition,
        "is_daytime": is_day,
        "humidity": humidity,
        "wind_mph": wind_mph,
        "wind_dir": wind_dir,
        "precip_pct": precip_pct,
        "air_quality": "Good",
        "commute_advice": commute_advice,
        "hourly": hourly_list,
    }
