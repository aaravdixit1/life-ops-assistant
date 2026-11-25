"""
Strictly Scoped Life-Ops Assistant Engine.
Processes natural-language queries over the user's live workspace:
- Calendar events & appointment/study-block proposals
- Canvas assignments & academic deadlines (classified as tasks)
- Personal memory / reading shelf / notes (`user_knowledge_base`)
- Daily nutrition & grocery budget context
- Career / resume summary context

Enforces domain boundaries cleanly:
- Pure greetings respond warmly with a live workspace pulse (never canned/random noise).
- Out-of-scope world trivia (e.g. "what is the population of china in 2024") returns a clear,
  polite scope refusal without web-searching or hallucinating.
- Uses Gemini JSON mode (`response_mime_type="application/json"`) when an API key is configured,
  with a deterministic intent & date/time parser fallback when offline or unconfigured.
"""
import asyncio
import json
import logging
import re
import uuid
from datetime import date, datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
from zoneinfo import ZoneInfo

from google import genai
from google.genai import types

from ..db import get_conn
from .profile_service import get_effective_gemini_api_key

logger = logging.getLogger(__name__)

_GREETING_RE = re.compile(
    r"^(?:hi+|hey+|hello+|yo+|sup|what'?s\s+up|good\s+(?:morning|afternoon|evening)|how\s+are\s+you|howdy)(?:\s+(?:there|assistant|life-ops|bot))?[!.?\s]*$",
    re.IGNORECASE,
)

_WORKSPACE_DOMAIN_KEYWORDS = (
    "schedule", "calendar", "event", "events", "appointment", "dentist", "doctor",
    "meeting", "call", "class", "classes", "course", "courses", "syllabus", "canvas",
    "assignment", "assignments", "homework", "hw", "due", "deadline", "deadlines",
    "task", "tasks", "project", "quiz", "exam", "test", "midterm", "final", "lab",
    "grade", "study", "focus", "block", "gym", "workout", "meal", "meals", "macro",
    "macros", "protein", "calorie", "calories", "carb", "carbs", "fat", "grocery",
    "groceries", "store", "stores", "supermarket", "budget", "shop", "shopping",
    "resume", "cv", "career", "internship", "internships", "job", "interview",
    "leetcode", "major", "minor", "college", "university", "graduation", "wake",
    "sleep", "live", "address", "sanctuary", "note", "notes", "memory", "vault",
    "remember", "book", "books", "reading", "philosophy", "fiction", "recommend",
    "errand", "errands", "brief", "briefing", "today", "tomorrow", "week", "weekend",
    "my ", "i have", "do i", "did i", "add ", "create ", "book ", "move ", "remove ",
    "delete ", "cancel ", "reschedule ",
)

_OUT_OF_SCOPE_PATTERNS = (
    re.compile(r"\b(?:population|gdp|president|prime\s+minister|capital|currency|flag|area|king|queen)\s+of\b", re.I),
    re.compile(r"\b(?:who\s+won|who\s+is\s+the\s+(?:ceo|president|richest|tallest)|what\s+year\s+did|when\s+was\s+.+born)\b", re.I),
    re.compile(r"\b(?:stock\s+price|bitcoin|crypto|exchange\s+rate|nba|nfl|mlb|world\s+cup|super\s+bowl|election)\b", re.I),
    re.compile(r"\b(?:translate|write\s+(?:a\s+)?(?:poem|story|essay|song)|tell\s+me\s+a\s+joke|trivia|riddle)\b", re.I),
    re.compile(r"\b(?:how\s+(?:tall|old|far|many\s+people)|what\s+is\s+the\s+(?:distance|height|boiling\s+point|speed\s+of))\b", re.I),
)


def is_pure_greeting(text: str) -> bool:
    return bool(_GREETING_RE.match((text or "").strip()))


def is_out_of_scope_trivia(text: str) -> bool:
    """Return True when the prompt clearly asks general world trivia outside Life-Ops."""
    clean = (text or "").strip()
    if not clean or is_pure_greeting(clean):
        return False
    low = clean.lower()
    if any(kw in low for kw in _WORKSPACE_DOMAIN_KEYWORDS):
        return False
    return any(pat.search(clean) for pat in _OUT_OF_SCOPE_PATTERNS)


def _format_assignment_row(row: Any, now: datetime, user_tz: ZoneInfo, tz_abbr: str) -> Dict[str, Any]:
    due_at = row["due_at"]
    today = now.date()
    due_label = "No due date"
    formatted_due = "No due date"
    is_due_today = False
    is_overdue = False

    if due_at:
        due_dt = (
            due_at.astimezone(user_tz)
            if due_at.tzinfo
            else due_at.replace(tzinfo=timezone.utc).astimezone(user_tz)
        )
        if due_dt.hour in (18, 19) and due_dt.minute == 59:
            due_dt = due_dt.replace(hour=23, minute=59, second=59)
        formatted_due = due_dt.strftime(f"%a, %b %d at %I:%M %p {tz_abbr}")
        due_date = due_dt.date()
        time_str = due_dt.strftime("%I:%M %p").lstrip("0")

        if row["is_submitted"]:
            due_label = "Submitted"
        elif due_date < today or (due_date == today and due_dt < now):
            is_overdue = True
            if due_date == today:
                is_due_today = True
                due_label = f"Due Today · {time_str} {tz_abbr}"
            else:
                due_label = f"Overdue · {due_dt.strftime('%b %d')}"
        elif due_date == today:
            is_due_today = True
            due_label = f"Due Today · {time_str} {tz_abbr}"
        elif due_date == today + timedelta(days=1):
            due_label = f"Due Tomorrow · {time_str} {tz_abbr}"
        else:
            due_label = f"Due {due_dt.strftime('%a %b %d')} · {time_str}"

    return {
        "id": str(row["id"]),
        "course_name": row["course_name"],
        "title": row["title"],
        "description": row["description"],
        "due_at": row["due_at"].isoformat() if row["due_at"] else None,
        "formatted_due": formatted_due,
        "due_label": due_label,
        "is_due_today": is_due_today,
        "is_overdue": is_overdue,
        "is_submitted": bool(row["is_submitted"]),
        "submission_status": row["submission_status"],
        "is_tentative": bool(row["is_tentative"]),
        "syllabus_notes": row["syllabus_notes"],
        "ai_summary": row.get("ai_summary"),
    }


def _format_event_row(row: Any, user_tz: ZoneInfo, tz_abbr: str) -> Dict[str, Any]:
    st = (
        row["start_time"].astimezone(user_tz)
        if row["start_time"].tzinfo
        else row["start_time"].replace(tzinfo=timezone.utc).astimezone(user_tz)
    )
    et = (
        row["end_time"].astimezone(user_tz)
        if row["end_time"].tzinfo
        else row["end_time"].replace(tzinfo=timezone.utc).astimezone(user_tz)
    )
    return {
        "id": str(row["id"]),
        "summary": row["summary"],
        "date": st.strftime("%Y-%m-%d"),
        "start_time": st.isoformat(),
        "end_time": et.isoformat(),
        "formatted_time": f"{st.strftime('%a, %b %d · %I:%M %p').replace(' 0', ' ')} – {et.strftime('%I:%M %p').lstrip('0')} {tz_abbr}",
        "location": row["location"],
        "description": row["description"],
        "source": row["source"],
        "calendar_name": row["calendar_name"],
    }


def parse_schedule_request(raw: str, now: datetime, user_tz: ZoneInfo) -> Tuple[date, int, int, int, str, str]:
    """
    Parse target date, start hour/minute, duration minutes, clean summary, and event source
    from natural language (e.g. "add a dentist appointment tomorrow at 2pm to my calendar").
    """
    low = raw.lower()
    today = now.date()
    target_date = today

    if "day after tomorrow" in low:
        target_date = today + timedelta(days=2)
    elif "tomorrow" in low:
        target_date = today + timedelta(days=1)
    elif "next week" in low:
        target_date = today + timedelta(days=7)
    else:
        weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"]
        for idx, wd in enumerate(weekdays):
            if re.search(rf"\b(?:next\s+)?{wd}\b", low):
                delta = (idx - today.weekday()) % 7
                if delta == 0 and f"next {wd}" in low:
                    delta = 7
                elif delta == 0:
                    delta = 0
                target_date = today + timedelta(days=delta)
                break
        else:
            date_slash = re.search(r"\b(\d{1,2})/(\d{1,2})(?:/(\d{2,4}))?\b", low)
            if date_slash:
                m_num = int(date_slash.group(1))
                d_num = int(date_slash.group(2))
                y_raw = date_slash.group(3)
                y_num = int(y_raw) + (2000 if y_raw and len(y_raw) == 2 else 0) if y_raw else today.year
                try:
                    cand = date(y_num, m_num, d_num)
                    if not y_raw and cand < today - timedelta(days=2):
                        cand = date(y_num + 1, m_num, d_num)
                    target_date = cand
                except ValueError:
                    pass

    # Parse time
    target_h = min(21, max(9, now.hour + 1))
    target_m = 0
    time_match = re.search(r"\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?|am|pm)\b", low)
    if time_match:
        raw_h = int(time_match.group(1))
        target_m = int(time_match.group(2) or 0)
        ampm = time_match.group(3).replace(".", "").lower()
        if ampm == "pm" and raw_h < 12:
            target_h = raw_h + 12
        elif ampm == "am" and raw_h == 12:
            target_h = 0
        else:
            target_h = raw_h
    else:
        mil_match = re.search(r"\bat\s+(\d{1,2})(?::(\d{2}))?\b", low)
        if mil_match:
            raw_h = int(mil_match.group(1))
            target_m = int(mil_match.group(2) or 0)
            target_h = raw_h + 12 if 1 <= raw_h <= 7 else raw_h

    target_h = max(0, min(23, target_h))
    target_m = max(0, min(59, target_m))

    # Duration
    duration_min = 60
    dur_hr = re.search(r"\b(\d+(?:\.\d+)?)\s*(?:hr|hrs|hour|hours)\b", low)
    dur_mn = re.search(r"\b(\d+)\s*(?:min|mins|minute|minutes)\b", low)
    if dur_hr:
        duration_min = max(15, min(360, int(float(dur_hr.group(1)) * 60)))
    elif dur_mn:
        duration_min = max(15, min(360, int(dur_mn.group(1))))

    # Event source (fixed appointments use life_ops_manual; study/focus blocks use life_ops_study_block)
    is_study_block = any(k in low for k in ("study", "focus block", "prep", "homework", "leetcode", "review session"))
    source = "life_ops_study_block" if is_study_block else "life_ops_manual"

    # Extract clean summary
    cleaned = raw.strip()
    cleaned = re.sub(
        r"^(?:can\s+you\s+|could\s+you\s+|please\s+|hey\s+|hi\s+)?(?:add|schedule|book|create|put|set\s+up)\s+(?:this\s+|an?\s+|the\s+|my\s+)?",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\b(?:to|onto|on|in)\s+(?:my\s+|the\s+)?(?:calendar|schedule)\b.*$",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(
        r"\b(?:today|tomorrow|day\s+after\s+tomorrow|next\s+week|on\s+(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"\b(?:at|from|around)\s+\d{1,2}(?::\d{2})?\s*(?:a\.?m\.?|p\.?m\.?|am|pm)?\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"\bfor\s+\d+(?:\.\d+)?\s*(?:hr|hrs|hour|hours|min|mins|minute|minutes)\b", "", cleaned, flags=re.IGNORECASE)
    cleaned = re.sub(r"[?!.]+$", "", cleaned).strip(" ,-")

    if not cleaned:
        cleaned = "Focus Block" if is_study_block else "Scheduled Appointment"
    else:
        cleaned = " ".join(w if w.isupper() and len(w) <= 5 else w.capitalize() for w in cleaned.split())

    return target_date, target_h, target_m, duration_min, cleaned, source


def _build_proposed_event_payload(
    summary: str,
    target_date: date,
    hour: int,
    minute: int,
    duration_min: int,
    user_tz: ZoneInfo,
    tz_abbr: str,
    location: str,
    description: str,
    source: str,
) -> Dict[str, Any]:
    start_dt = datetime(target_date.year, target_date.month, target_date.day, hour, minute, tzinfo=user_tz)
    end_dt = start_dt + timedelta(minutes=duration_min)
    date_label = start_dt.strftime("%a, %b %d")
    time_span = f"{start_dt.strftime('%I:%M %p').lstrip('0')} – {end_dt.strftime('%I:%M %p').lstrip('0')} {tz_abbr}"
    return {
        "summary": summary,
        "date": target_date.isoformat(),
        "start_time": start_dt.isoformat(),
        "end_time": end_dt.isoformat(),
        "formatted_time": f"{date_label} · {time_span}",
        "location": location,
        "description": description,
        "color": "#d97706" if source == "life_ops_study_block" else "#38bdf8",
        "source": source,
    }


def _scope_refusal_message(first_name: str) -> str:
    prefix = f"I can't answer that, {first_name} — " if first_name else "I can't answer that — "
    return (
        f"{prefix}I'm strictly scoped to your **Life-Ops workspace** and don't perform open-ended web searches "
        "or general world trivia.\n\n"
        "Ask me about your **Canvas assignments**, **upcoming calendar schedule**, **adding or updating appointments**, "
        "**health macros & nearby groceries**, **uploaded resume**, or **personal notes**."
    )


def _greeting_response(
    first_name: str,
    due_today: List[Dict[str, Any]],
    upcoming_today_events: List[Dict[str, Any]],
) -> str:
    name_part = f"Hey {first_name}!" if first_name else "Hey there!"
    if due_today or upcoming_today_events:
        pulse_parts: List[str] = []
        if due_today:
            pulse_parts.append(f"**{len(due_today)}** unsubmitted assignment{'s' if len(due_today) != 1 else ''} due today")
        if upcoming_today_events:
            next_ev = upcoming_today_events[0]
            pulse_parts.append(f"**{len(upcoming_today_events)}** calendar event{'s' if len(upcoming_today_events) != 1 else ''} today (next: *{next_ev['summary']}*)")
        pulse = " On your radar: " + " and ".join(pulse_parts) + "."
    else:
        pulse = " Your schedule and assignment queue for today look clear."

    return (
        f"{name_part}{pulse}\n\n"
        "How can I help with your workspace today? You can ask:\n"
        "- *\"What assignments do I have due today?\"*\n"
        "- *\"Can you add a dentist appointment tomorrow at 2 PM to my calendar?\"*\n"
        "- *\"What's on my schedule this week?\"*"
    )


async def _call_gemini_assistant_json(prompt: str, api_key: str) -> Optional[Dict[str, Any]]:
    """Invoke Gemini API directly in strict JSON mode without stripping workspace context."""
    def _invoke() -> Optional[Dict[str, Any]]:
        client = genai.Client(api_key=api_key, http_options=types.HttpOptions(timeout=12000))
        for model_name in ("gemini-3.5-flash", "gemini-3.8-flash", "gemini-2.5-flash"):
            for use_thinking_zero in (True, False):
                try:
                    cfg_kwargs: Dict[str, Any] = {
                        "temperature": 0.2,
                        "max_output_tokens": 1500,
                        "response_mime_type": "application/json",
                    }
                    if use_thinking_zero:
                        cfg_kwargs["thinking_config"] = types.ThinkingConfig(thinking_budget=0)
                    resp = client.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config=types.GenerateContentConfig(**cfg_kwargs),
                    )
                    txt = (resp.text or "").strip()
                    if not txt:
                        continue
                    if txt.startswith("```json"):
                        txt = txt[7:]
                    elif txt.startswith("```"):
                        txt = txt[3:]
                    if txt.endswith("```"):
                        txt = txt[:-3]
                    parsed = json.loads(txt.strip())
                    if isinstance(parsed, dict) and parsed.get("reply"):
                        parsed["_model"] = model_name
                        return parsed
                    break
                except Exception as err:
                    msg = str(err)
                    if use_thinking_zero and ("thinking" in msg.lower() or "INVALID_ARGUMENT" in msg):
                        continue
                    logger.warning("Assistant Gemini call on %s failed: %s", model_name, err)
                    break
        return None

    try:
        return await asyncio.wait_for(asyncio.to_thread(_invoke), timeout=14.0)
    except asyncio.TimeoutError:
        logger.warning("Assistant Gemini call timed out after 14s; falling back to deterministic engine.")
        return None


def _normalize_proposed_event(
    pe: Any,
    user_tz: ZoneInfo,
    tz_abbr: str,
    default_loc: str,
    raw_query: str,
) -> Optional[Dict[str, Any]]:
    if not isinstance(pe, dict):
        return None
    summary = str(pe.get("summary") or "").strip()
    start_raw = str(pe.get("start_time") or "").strip()
    end_raw = str(pe.get("end_time") or "").strip()
    if not summary or not start_raw:
        return None
    try:
        st = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
        if st.tzinfo is None:
            st = st.replace(tzinfo=user_tz)
        else:
            st = st.astimezone(user_tz)
        if end_raw:
            et = datetime.fromisoformat(end_raw.replace("Z", "+00:00"))
            if et.tzinfo is None:
                et = et.replace(tzinfo=user_tz)
            else:
                et = et.astimezone(user_tz)
        else:
            et = st + timedelta(hours=1)
        if et <= st:
            et = st + timedelta(hours=1)
    except Exception:
        return None

    valid_sources = {"life_ops_study_block", "life_ops_manual", "external", "canvas_inferred"}
    src = pe.get("source") if pe.get("source") in valid_sources else "life_ops_manual"
    date_label = st.strftime("%a, %b %d")
    time_span = f"{st.strftime('%I:%M %p').lstrip('0')} – {et.strftime('%I:%M %p').lstrip('0')} {tz_abbr}"
    return {
        "summary": summary,
        "date": st.date().isoformat(),
        "start_time": st.isoformat(),
        "end_time": et.isoformat(),
        "formatted_time": pe.get("formatted_time") or f"{date_label} · {time_span}",
        "location": str(pe.get("location") or default_loc).strip() or default_loc,
        "description": str(pe.get("description") or f"Proposed via Life-Ops Assistant: '{raw_query}'").strip(),
        "color": "#d97706" if src == "life_ops_study_block" else "#38bdf8",
        "source": src,
    }


async def process_direct_line(
    conn: Any,
    raw: str,
    history: Optional[List[Dict[str, str]]],
    profile: Dict[str, Any],
    user_tz: ZoneInfo,
    now: datetime,
    current_items: List[Dict[str, Any]],
    category_hint: Optional[str] = None,
    prior_sessions_context: Optional[List[Dict[str, str]]] = None,
) -> Dict[str, Any]:
    """Run strictly scoped Life-Ops reasoning over live DB state and return UI response + cards."""
    tz_abbr = now.tzname() or "LOCAL"
    today = now.date()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    first_name = (profile.get("first_name") or "").strip()
    full_name = (profile.get("full_name") or "").strip()
    display_name = full_name or first_name or "there"
    default_loc = (profile.get("study_sanctuary") or profile.get("institution") or "Workspace").strip()

    # Load 14-day + overdue unsubmitted Canvas assignments
    assignment_rows = await conn.fetch("""
        SELECT id, course_name, title, description, due_at, status,
               is_submitted, submission_status, is_tentative, syllabus_notes, ai_summary
        FROM canvas_assignments
        WHERE status = 'active'
          AND (
            (due_at >= $1 AND due_at < $2)
            OR (due_at < $1 AND is_submitted = false AND due_at >= $3)
          )
        ORDER BY due_at ASC NULLS LAST
        LIMIT 30
    """, today_start, today_start + timedelta(days=14), today_start - timedelta(days=5))

    assignments_by_id: Dict[str, Dict[str, Any]] = {}
    formatted_assignments: List[Dict[str, Any]] = []
    for row in assignment_rows:
        item = _format_assignment_row(dict(row), now, user_tz, tz_abbr)
        assignments_by_id[item["id"]] = item
        formatted_assignments.append(item)

    due_today = [a for a in formatted_assignments if a["is_due_today"] and not a["is_submitted"]]

    # Load 14-day calendar events (excluding canvas_inferred duplicates since assignments are tasks)
    event_rows = await conn.fetch("""
        SELECT id, summary, start_time, end_time, location, description, source, calendar_name
        FROM calendar_events
        WHERE start_time >= $1 AND start_time < $2
          AND COALESCE(calendar_id, '') <> 'canvas_deadlines'
          AND COALESCE(source, '') <> 'canvas_inferred'
        ORDER BY start_time ASC
        LIMIT 40
    """, today_start, today_start + timedelta(days=14))

    events_by_id: Dict[str, Dict[str, Any]] = {}
    formatted_events: List[Dict[str, Any]] = []
    for row in event_rows:
        ev = _format_event_row(dict(row), user_tz, tz_abbr)
        events_by_id[ev["id"]] = ev
        formatted_events.append(ev)

    today_events = [e for e in formatted_events if e["date"] == today.isoformat()]

    # Load today's nutrition summary
    macro_row = await conn.fetchrow("""
        SELECT COALESCE(SUM(calories), 0)::int AS total_cals,
               COALESCE(SUM(protein_g), 0)::float AS total_protein,
               COUNT(*)::int AS meal_count
        FROM daily_macro_logs
        WHERE logged_date = $1
    """, today)
    macro_summary = (
        f"Today logged: {macro_row['total_cals']} / {profile.get('daily_calories_target', 2600)} kcal, "
        f"{macro_row['total_protein']:.0f}g / {profile.get('daily_protein_g', 155)}g protein "
        f"({macro_row['meal_count']} meals logged)"
        if macro_row
        else "No meals logged today."
    )

    # 1. Pure greeting fast-path (eliminates random/canned greeting responses)
    if is_pure_greeting(raw):
        return {
            "status": "success",
            "action": "greeting",
            "scope_status": "in_scope",
            "message": _greeting_response(first_name, due_today, today_events),
            "recommendations": [],
            "curated_reading": None,
            "proposed_event": None,
            "action_staged": None,
            "deleted_events": [],
            "mentioned_assignments": due_today[:2],
            "mentioned_events": today_events[:2],
            "saved_facts": [],
            "actions_taken": [],
            "deleted_count": 0,
            "added_count": 0,
        }

    # 2. Strict out-of-scope world trivia guard (no web search, clear polite boundary)
    if is_out_of_scope_trivia(raw):
        return {
            "status": "success",
            "action": "out_of_scope",
            "scope_status": "out_of_scope",
            "message": _scope_refusal_message(first_name),
            "recommendations": [],
            "curated_reading": None,
            "proposed_event": None,
            "action_staged": None,
            "deleted_events": [],
            "mentioned_assignments": [],
            "mentioned_events": [],
            "saved_facts": [],
            "actions_taken": [],
            "deleted_count": 0,
            "added_count": 0,
        }

    # 3. Try Gemini structured JSON reasoning if an API key is configured
    llm_parsed: Optional[Dict[str, Any]] = None
    api_key, _ = await get_effective_gemini_api_key()
    if api_key:
        majors = profile.get("majors") or []
        minors = profile.get("minors") or []
        academic_desc = ", ".join(majors) if majors else (profile.get("major_or_role") or "college student")
        if minors:
            academic_desc += f" (Minor: {', '.join(minors)})"
        if profile.get("academic_year"):
            academic_desc = f"{profile['academic_year']} studying {academic_desc}"
        loc_desc = ", ".join(p for p in (profile.get("city"), profile.get("region")) if p) or "local campus"

        dossier_lines = [
            f"- [{it['id']}] ({it['category']}) {it['title']}: {it['content']}"
            for it in current_items[:20]
        ]
        assign_lines = [
            f"- id={a['id']} | {a['course_name']} | {a['title']} | {a['due_label']} | submitted={a['is_submitted']}"
            for a in formatted_assignments[:25]
        ]
        event_lines = [
            f"- id={e['id']} | {e['summary']} | {e['formatted_time']} | loc={e['location'] or 'TBD'} | source={e['source']}"
            for e in formatted_events[:30]
        ]
        hist_lines = []
        for h in (history or [])[-8:]:
            speaker = first_name or "User" if h.get("role") == "user" else "Assistant"
            hist_lines.append(f"{speaker}: {(h.get('content') or '')[:400]}")

        prior_lines = []
        for p in (prior_sessions_context or [])[-6:]:
            who = first_name or "User" if p.get("role") == "user" else "Assistant"
            prior_lines.append(f"[{p.get('session_title', 'Past Chat')}] {who}: {(p.get('content') or '')[:220]}")

        sample_start = datetime(today.year, today.month, today.day, 14, 0, tzinfo=user_tz).isoformat()
        sample_end = datetime(today.year, today.month, today.day, 15, 0, tzinfo=user_tz).isoformat()

        prompt = f"""
You are the Life-Ops Workspace Assistant for {display_name} ({academic_desc}, {loc_desc}).
Current Local Time: {now.strftime(f"%A, %B %d, %Y %I:%M %p {tz_abbr}")} (Timezone: {user_tz.key})

STRICT OPERATING RULES:
1. STRICT DOMAIN SCOPE: You assist ONLY with {display_name}'s Life-Ops workspace:
   - Calendar events & adding/adjusting appointments or study blocks
   - Canvas assignments & coursework deadlines
   - Personal memory vault / reading shelf / notes
   - Daily nutrition macros, meal prep & local grocery planning
   - College profile, majors/minors & resume/career prep
   If the user asks general world knowledge, current events, population/statistics trivia, celebrities, stock prices, or external facts not in their workspace, set "out_of_scope": true and politely state that you cannot answer general trivia and do not search the web — invite them to ask about their assignments, schedule, health, career, or notes.
2. NEVER INVENT DATA: Only cite assignments, calendar events, and facts present in the live context below. If none exist for the requested timeframe, say so clearly and helpfully.
3. CARD HYDRATION (CRITICAL):
   - Whenever you mention or answer about Canvas assignments (e.g. "what assignments do i have due today?"), put their exact `id` values into `"assignment_ids"`.
   - Whenever you mention or answer about calendar events, put their exact `id` values into `"event_ids"`.
4. SCHEDULING & APPOINTMENTS (CRITICAL):
   - Whenever the user asks to add, book, schedule, or put an appointment/meeting/errand/study block on the calendar (e.g. "can you add this appointment tomorrow at 2pm to the calendar?"), populate `"proposed_event"` with accurate ISO 8601 `start_time` and `end_time` in `{user_tz.key}` so the user gets an interactive confirmation card.
   - Use `source: "life_ops_manual"` for external/personal appointments (dentist, doctor, coffee, interviews, meetings) and `source: "life_ops_study_block"` for study/focus blocks.
   - Never fabricate a deletion or silent modification; only propose cards.
5. FACTS MEMORY & PREFERENCES:
   - When the user shares personal info to remember (e.g. "I live at ...", "Remember ..."), emit `{{"action": "remember_fact", "category": "personal_fact", "title": "Residence / Address" (if an address, else a short descriptor), "content": "..."}}` in `"actions"`.
   - When the user shares reading preferences or asks to remove items from their Knowledge Vault, emit `{{"action": "save_preference", "title": "...", "content": "..."}}` and `{{"action": "delete", "ids": ["exact-uuid"]}}`.
   - When the user asks for book/reading recommendations in their reading preferences, return 2-3 objects in `"recommendations"` (`{{"title": "...", "author": "...", "category": "...", "reason": "..."}}`).

LIVE WORKSPACE CONTEXT:
[PROFILE & NUTRITION]
- Institution: {profile.get('institution') or 'Not set'} | Term: {profile.get('term_label') or 'Current Term'}
- Target Role: {profile.get('career_role') or 'Not set'} | Study Sanctuary: {default_loc}
- Nutrition: {macro_summary}

[CANVAS ASSIGNMENTS (NEXT 14 DAYS & RECENT OVERDUE)]
{chr(10).join(assign_lines) if assign_lines else "No active assignments in this window."}

[CALENDAR EVENTS (NEXT 14 DAYS)]
{chr(10).join(event_lines) if event_lines else "No calendar events scheduled in the next 14 days."}

[KNOWLEDGE VAULT]
{chr(10).join(dossier_lines) if dossier_lines else "No stored memories yet."}

[RECENT CONVERSATION]
{chr(10).join(hist_lines) if hist_lines else "No previous turns."}

[RECENT PAST CONVERSATIONS CONTEXT]
{chr(10).join(prior_lines) if prior_lines else "No prior saved chat logs."}

User Message: "{raw}"

Return ONLY valid JSON with these keys:
{{
  "out_of_scope": false,
  "reply": "Clear, helpful markdown response grounded in the workspace data.",
  "assignment_ids": ["exact-uuid-if-relevant"],
  "event_ids": ["exact-uuid-if-relevant"],
  "proposed_event": null,
  "actions": [],
  "recommendations": [],
  "curated_reading": null
}}
(Example proposed_event when scheduling: {{"summary": "Dentist Appointment", "start_time": "{sample_start}", "end_time": "{sample_end}", "location": "Clinic / TBD", "description": "Scheduled via Life-Ops Assistant", "source": "life_ops_manual"}})
(Example recommendations when asked for books: [{{"title": "The Myth of Sisyphus", "author": "Albert Camus", "category": "Philosophy", "reason": "..."}}])
"""
        llm_parsed = await _call_gemini_assistant_json(prompt, api_key)

    # Check if Gemini flagged out-of-scope
    if llm_parsed and llm_parsed.get("out_of_scope"):
        return {
            "status": "success",
            "action": "out_of_scope",
            "scope_status": "out_of_scope",
            "message": llm_parsed.get("reply") or _scope_refusal_message(first_name),
            "recommendations": [],
            "curated_reading": None,
            "proposed_event": None,
            "action_staged": None,
            "deleted_events": [],
            "mentioned_assignments": [],
            "mentioned_events": [],
            "saved_facts": [],
            "actions_taken": [],
            "deleted_count": 0,
            "added_count": 0,
        }

    # Safety-net enrichment when LLM responded in_scope but omitted structured fields
    raw_l = raw.lower()
    if llm_parsed:
        addr_match_llm = re.search(
            r"(?:i live at|my address is|remember (?:that )?i live at|keep in mind (?:that )?i live at)\s+([^\n\.]+(?:\s*,\s*[^\n\.]+)*)",
            raw,
            re.IGNORECASE,
        )
        if addr_match_llm and not any(
            isinstance(a, dict) and a.get("action") == "remember_fact"
            for a in (llm_parsed.get("actions") or [])
        ):
            address_str = addr_match_llm.group(1).strip()
            llm_parsed.setdefault("actions", []).append({
                "action": "remember_fact",
                "category": "personal_fact",
                "title": "Residence / Address",
                "content": f"Lives at {address_str}",
                "metadata": {"type": "residence", "raw_statement": raw},
            })
        if ("philosophy" in raw_l or "fiction" in raw_l) and any(
            k in raw_l for k in ("rec", "recommend", "book", "read")
        ) and len(llm_parsed.get("recommendations") or []) < 2:
            llm_parsed["recommendations"] = [
                {
                    "title": "The Myth of Sisyphus",
                    "author": "Albert Camus",
                    "category": "Philosophy",
                    "reason": "An invigorating meditation on perseverance and clarity during demanding semesters.",
                },
                {
                    "title": "Meditations",
                    "author": "Marcus Aurelius",
                    "category": "Philosophy",
                    "reason": "Timeless reflections on composure, duty, and daily focus.",
                },
                {
                    "title": "Klara and the Sun",
                    "author": "Kazuo Ishiguro",
                    "category": "Fiction",
                    "reason": "A thoughtful literary exploration of consciousness and empathy.",
                },
            ]
            if not llm_parsed.get("curated_reading"):
                llm_parsed["curated_reading"] = {
                    "title": "The Myth of Sisyphus",
                    "author": "Albert Camus",
                    "tag": "Philosophy & Meaning",
                    "note": "Saved to your reading preference profile.",
                }

    # 4. Deterministic intelligent fallback if LLM was unavailable/unconfigured
    fallback_assignment_ids: List[str] = []
    fallback_event_ids: List[str] = []

    if not llm_parsed:
        actions: List[Dict[str, Any]] = []
        recs: List[Dict[str, Any]] = []
        prop_event: Optional[Dict[str, Any]] = None
        curated_reading = None
        scope_status = "in_scope"
        reply_text = ""

        # A. Remember or recall address / personal fact
        addr_match = re.search(
            r"(?:i live at|my address is|remember (?:that )?i live at|keep in mind (?:that )?i live at|remember my address is)\s+([^\n\.,]+(?:\s*,\s*[^\n\.,]+)*)",
            raw,
            re.IGNORECASE,
        )
        rem_match = re.search(r"^(?:remember(?:\s+that)?|keep\s+in\s+mind(?:\s+that)?|save\s+note:?)\s+(.+)$", raw, re.IGNORECASE)
        if addr_match:
            address_str = addr_match.group(1).strip()
            actions.append({
                "action": "remember_fact",
                "category": "personal_fact",
                "title": "Residence / Address",
                "content": f"Lives at {address_str}",
                "metadata": {"type": "residence", "raw_statement": raw},
            })
            reply_text = f"Got it — I've saved your address (**{address_str}**) in your Memory Vault."
        elif any(p in raw_l for p in ("where do i live", "what is my address", "what's my address", "where is my apartment", "where's my house")):
            addr_item = next(
                (it for it in current_items if "residence" in it["title"].lower() or "address" in it["title"].lower() or "lives at" in it["content"].lower()),
                None,
            )
            if addr_item:
                clean_addr = addr_item["content"].replace("Lives at ", "").strip()
                reply_text = f"According to your Memory Vault, you live at **{clean_addr}**."
            else:
                reply_text = "I don't have your address stored in your Memory Vault yet. Tell me `'I live at [address]'` and I'll save it."
        elif rem_match:
            fact_body = rem_match.group(1).strip()
            actions.append({
                "action": "remember_fact",
                "category": "personal_fact",
                "title": fact_body[:48] + ("..." if len(fact_body) > 48 else ""),
                "content": fact_body,
                "metadata": {"raw_statement": raw},
            })
            reply_text = f"Saved to your Memory Vault: **{fact_body}**."

        # B. Add / Schedule appointment or study block
        elif re.search(r"\b(?:add|schedule|book|put|create|set\s+up)\b", raw_l) and any(
            k in raw_l for k in ("calendar", "schedule", "appointment", "dentist", "doctor", "meeting", "event", "block", "study", "gym", "call", "tomorrow", "today", "at ")
        ):
            target_date, target_h, target_m, duration_min, summary, source = parse_schedule_request(raw, now, user_tz)
            loc_hint = default_loc if source == "life_ops_study_block" else (profile.get("city") or "TBD")
            prop_event = _build_proposed_event_payload(
                summary=summary,
                target_date=target_date,
                hour=target_h,
                minute=target_m,
                duration_min=duration_min,
                user_tz=user_tz,
                tz_abbr=tz_abbr,
                location=loc_hint,
                description=f"Requested via Life-Ops Assistant: '{raw}'",
                source=source,
            )
            reply_text = (
                f"I've drafted **{prop_event['summary']}** for **{prop_event['formatted_time']}**. "
                "Review the details on the card below and click **Add to Calendar** to confirm."
            )

        # C. Assignments query
        elif any(k in raw_l for k in ("assignment", "assignments", "homework", "hw", "due", "deadline", "deadlines", "deliverable", "tasks")):
            unsubmitted = [a for a in formatted_assignments if not a["is_submitted"]]
            if "today" in raw_l or "tonight" in raw_l:
                matched = [a for a in unsubmitted if a["is_due_today"]]
                window_desc = "due today"
            elif "tomorrow" in raw_l:
                tom = (today + timedelta(days=1)).isoformat()
                matched = [a for a in unsubmitted if (a["due_at"] or "").startswith(tom)]
                window_desc = "due tomorrow"
            else:
                matched = unsubmitted[:5]
                window_desc = "upcoming on Canvas"

            if matched:
                lines = [f"- **{a['title']}** ({a['course_name']}) — {a['due_label']}" for a in matched[:5]]
                reply_text = f"You have **{len(matched)}** active Canvas assignment{'s' if len(matched) != 1 else ''} {window_desc}:\n\n" + "\n".join(lines)
                fallback_assignment_ids = [a["id"] for a in matched[:4]]
            else:
                if unsubmitted:
                    next_up = unsubmitted[0]
                    reply_text = (
                        f"You have **no unsubmitted Canvas assignments {window_desc}**.\n\n"
                        f"Your next active deadline is **{next_up['title']}** ({next_up['course_name']}, {next_up['due_label']})."
                    )
                    fallback_assignment_ids = [next_up["id"]]
                else:
                    reply_text = f"You're all caught up — there are **no active Canvas assignments {window_desc}** right now."

        # D. Calendar / Schedule query
        elif any(k in raw_l for k in ("schedule", "calendar", "events", "what do i have", "am i free", "busy", "classes")):
            if "tomorrow" in raw_l:
                target_iso = (today + timedelta(days=1)).isoformat()
                matched_ev = [e for e in formatted_events if e["date"] == target_iso]
                day_desc = "tomorrow"
            elif "today" in raw_l or "tonight" in raw_l:
                matched_ev = today_events
                day_desc = "today"
            else:
                matched_ev = formatted_events[:5]
                day_desc = "over the next 2 weeks"

            if matched_ev:
                lines = [f"- **{e['summary']}** — {e['formatted_time']}" for e in matched_ev[:5]]
                reply_text = f"Here is what's on your calendar {day_desc}:\n\n" + "\n".join(lines)
                fallback_event_ids = [e["id"] for e in matched_ev[:4]]
            else:
                reply_text = f"Your calendar looks open {day_desc}. Want me to schedule a study block or appointment?"

        # E. Delete / philosophy book preferences
        elif "philosophy" in raw_l or "fiction" in raw_l:
            actions.append({
                "action": "save_preference",
                "title": "Reading Preferences: Philosophy & Fiction",
                "content": "Prefers philosophy and literary fiction.",
                "metadata": {"interests": ["philosophy", "literary fiction"]},
            })
            recs = [
                {
                    "title": "The Myth of Sisyphus",
                    "author": "Albert Camus",
                    "category": "Philosophy",
                    "reason": "An invigorating meditation on perseverance and clarity during demanding semesters.",
                },
                {
                    "title": "Meditations",
                    "author": "Marcus Aurelius",
                    "category": "Philosophy",
                    "reason": "Timeless reflections on composure, duty, and daily focus.",
                },
            ]
            curated_reading = {
                "title": "The Myth of Sisyphus",
                "author": "Albert Camus",
                "tag": "Philosophy & Meaning",
                "note": "Saved to your reading preference profile.",
            }
            reply_text = "I've noted your preference for philosophy and literary fiction and picked two titles for your shelf."
        else:
            # Check if related to workspace keywords; if not, refuse out-of-scope cleanly
            if not any(kw in raw_l for kw in _WORKSPACE_DOMAIN_KEYWORDS):
                scope_status = "out_of_scope"
                reply_text = _scope_refusal_message(first_name)
            else:
                reply_text = (
                    "I can check your **Canvas assignments**, look up your **calendar events**, "
                    "or draft a **new calendar appointment or study block**. What would you like me to do?"
                )

        llm_parsed = {
            "reply": reply_text,
            "actions": actions,
            "recommendations": recs,
            "curated_reading": curated_reading,
            "proposed_event": prop_event,
            "assignment_ids": fallback_assignment_ids,
            "event_ids": fallback_event_ids,
            "scope_status": scope_status,
            "_model": "deterministic",
        }

    # 5. Execute knowledge-base actions against Postgres (never silent calendar deletes)
    actions_taken: List[str] = []
    deleted_count = 0
    added_count = 0
    saved_facts: List[Dict[str, Any]] = []

    for act in llm_parsed.get("actions") or []:
        if not isinstance(act, dict):
            continue
        action_type = act.get("action")
        if action_type == "delete":
            ids = list(act.get("ids") or [])
            if isinstance(act.get("id"), str):
                ids.append(act["id"])
            for item_id in ids:
                try:
                    u_id = uuid.UUID(str(item_id))
                    await conn.execute("DELETE FROM user_knowledge_base WHERE id = $1", u_id)
                    await conn.execute("DELETE FROM document_embeddings WHERE source_path = $1", f"knowledge:{item_id}")
                    deleted_count += 1
                except Exception:
                    pass
            if ids:
                actions_taken.append(f"Deleted {deleted_count} item(s)")

        elif action_type in ("remember_fact", "save_preference", "add"):
            cat = act.get("category") or ("preference" if action_type == "save_preference" else "personal_fact")
            title = str(act.get("title") or "Workspace Note").strip()
            content = str(act.get("content") or title).strip()
            meta = act.get("metadata") if isinstance(act.get("metadata"), dict) else {}
            if act.get("author"):
                meta["author"] = act["author"]

            row = await conn.fetchrow("""
                INSERT INTO user_knowledge_base (category, title, content, metadata)
                VALUES ($1, $2, $3, $4)
                RETURNING id, category, title, content
            """, cat, title, content, json.dumps(meta))
            added_count += 1
            actions_taken.append(f"Saved: {title}")
            saved_facts.append({
                "id": str(row["id"]),
                "category": row["category"],
                "title": row["title"],
                "content": row["content"],
            })

    # 6. Hydrate exact interactive cards for assignments, events, and proposed_event
    mentioned_assignments: List[Dict[str, Any]] = []
    seen_assign = set()
    for aid in (llm_parsed.get("assignment_ids") or []):
        item = assignments_by_id.get(str(aid))
        if item and item["id"] not in seen_assign:
            seen_assign.add(item["id"])
            mentioned_assignments.append(item)

    if not mentioned_assignments and llm_parsed.get("scope_status", "in_scope") == "in_scope":
        # Check if LLM used old referenced_assignments title field or query directly asks about due items
        for ref in (llm_parsed.get("referenced_assignments") or []):
            ref_l = str(ref).lower()
            for a in formatted_assignments:
                if a["id"] not in seen_assign and (ref_l in a["title"].lower() or ref_l in (a["course_name"] or "").lower()):
                    seen_assign.add(a["id"])
                    mentioned_assignments.append(a)
        if not mentioned_assignments and any(k in raw_l for k in ("assignment", "assignments", "due today", "due tonight", "homework", "deadlines")):
            pool = due_today if ("today" in raw_l or "tonight" in raw_l) else [a for a in formatted_assignments if not a["is_submitted"]]
            mentioned_assignments = pool[:4]

    mentioned_events: List[Dict[str, Any]] = []
    seen_ev = set()
    for eid in (llm_parsed.get("event_ids") or []):
        ev = events_by_id.get(str(eid))
        if ev and ev["id"] not in seen_ev:
            seen_ev.add(ev["id"])
            mentioned_events.append(ev)

    if not mentioned_events and llm_parsed.get("scope_status", "in_scope") == "in_scope":
        for ref in (llm_parsed.get("referenced_events") or []):
            ref_l = str(ref).lower()
            for e in formatted_events:
                if e["id"] not in seen_ev and ref_l in e["summary"].lower():
                    seen_ev.add(e["id"])
                    mentioned_events.append(e)
        if not mentioned_events and any(k in raw_l for k in ("schedule", "calendar", "what do i have today", "events today")):
            mentioned_events = (today_events if "today" in raw_l else formatted_events)[:4]

    normalized_proposed = _normalize_proposed_event(
        llm_parsed.get("proposed_event"),
        user_tz=user_tz,
        tz_abbr=tz_abbr,
        default_loc=default_loc,
        raw_query=raw,
    )

    # Also catch explicit scheduling requests if Gemini returned a proposal message without proposed_event
    if not normalized_proposed and re.search(r"\b(?:add|schedule|book|put|create)\b", raw_l) and any(
        k in raw_l for k in ("calendar", "schedule", "appointment", "dentist", "doctor", "meeting", "event", "study block")
    ):
        target_date, target_h, target_m, duration_min, summary, source = parse_schedule_request(raw, now, user_tz)
        loc_hint = default_loc if source == "life_ops_study_block" else (profile.get("city") or "TBD")
        normalized_proposed = _build_proposed_event_payload(
            summary=summary,
            target_date=target_date,
            hour=target_h,
            minute=target_m,
            duration_min=duration_min,
            user_tz=user_tz,
            tz_abbr=tz_abbr,
            location=loc_hint,
            description=f"Requested via Life-Ops Assistant: '{raw}'",
            source=source,
        )

    return {
        "status": "success",
        "action": "out_of_scope" if llm_parsed.get("scope_status") == "out_of_scope" else "intelligent_response",
        "scope_status": llm_parsed.get("scope_status", "in_scope"),
        "source_model": llm_parsed.get("_model", "deterministic"),
        "message": llm_parsed.get("reply") or "Here is what I found in your workspace.",
        "recommendations": llm_parsed.get("recommendations") or [],
        "curated_reading": llm_parsed.get("curated_reading"),
        "proposed_event": normalized_proposed,
        "action_staged": None,
        "deleted_events": [],
        "mentioned_assignments": mentioned_assignments[:4],
        "mentioned_events": mentioned_events[:4],
        "saved_facts": saved_facts,
        "actions_taken": actions_taken,
        "deleted_count": deleted_count,
        "added_count": added_count,
    }
