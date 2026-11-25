"""
Daily Briefing Service & Router
Aggregates live local weather, academic priorities,
structured narrative schedule, local/campus events, and deals into a morning/daily brief.
"""
from datetime import datetime, timezone, timedelta
from zoneinfo import ZoneInfo
import re
import random
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
import json
import uuid
from ..db import get_conn
from ..services import assistant_sessions
from ..services.profile_service import fetch_live_weather, get_profile

router = APIRouter()


def _resolve_tz(tz_name: Optional[str]) -> ZoneInfo:
    try:
        return ZoneInfo(tz_name or "America/New_York")
    except Exception:
        return ZoneInfo("America/New_York")


def _parse_hhmm(value: Optional[str], default_h: int = 8, default_m: int = 30) -> tuple[int, int]:
    try:
        parts = (value or "").strip().split(":")
        if len(parts) == 2:
            h, m = int(parts[0]), int(parts[1])
            if 0 <= h <= 23 and 0 <= m <= 59:
                return h, m
    except Exception:
        pass
    return default_h, default_m


class AdoptPlanRequest(BaseModel):
    plan_id: str


class ChatMessage(BaseModel):
    role: str
    content: str


class DirectLineRequest(BaseModel):
    message: str
    category: Optional[str] = None
    history: Optional[List[ChatMessage]] = None
    session_id: Optional[str] = None
    persist: bool = True


class CreateSessionRequest(BaseModel):
    title: Optional[str] = None


class RenameSessionRequest(BaseModel):
    title: str


class CommitEventRequest(BaseModel):
    summary: str
    start_time: datetime
    end_time: datetime
    location: Optional[str] = "Workspace"
    description: Optional[str] = None
    color: str = "#d97706"
    source: str = "life_ops_study_block"


class CreateKnowledgeRequest(BaseModel):
    category: str = "note"
    title: str
    content: Optional[str] = ""
    metadata: Optional[Dict[str, Any]] = None


class UpdateKnowledgeRequest(BaseModel):
    category: Optional[str] = None
    title: Optional[str] = None
    content: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


@router.get("/sessions")
async def list_assistant_sessions_endpoint() -> Dict[str, Any]:
    """List saved assistant conversations ordered by most recently updated."""
    sessions = await assistant_sessions.list_sessions(limit=50)
    return {"sessions": sessions}


@router.post("/sessions")
async def create_assistant_session_endpoint(req: Optional[CreateSessionRequest] = None) -> Dict[str, Any]:
    """Create a fresh persistent assistant chat thread."""
    sess = await assistant_sessions.create_session(title=req.title if req else None)
    return {"status": "success", "session": sess}


@router.get("/sessions/{session_id}")
async def get_assistant_session_endpoint(session_id: str) -> Dict[str, Any]:
    """Retrieve a saved conversation and its ordered messages + interactive card payloads."""
    sess = await assistant_sessions.get_session_with_messages(session_id)
    if not sess:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return {"session": sess}


@router.patch("/sessions/{session_id}")
async def rename_assistant_session_endpoint(session_id: str, req: RenameSessionRequest) -> Dict[str, Any]:
    """Rename a saved assistant chat thread."""
    sess = await assistant_sessions.rename_session(session_id, req.title)
    if not sess:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return {"status": "success", "session": sess}


@router.delete("/sessions/{session_id}")
async def delete_assistant_session_endpoint(session_id: str) -> Dict[str, Any]:
    """Delete a saved assistant chat thread and cascade-remove its messages."""
    deleted = await assistant_sessions.delete_session(session_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Chat session not found")
    return {"status": "deleted", "id": session_id}


@router.post("/direct-line")
async def direct_line_endpoint(req: DirectLineRequest) -> Dict[str, Any]:
    """Intelligently process thoughts, memory facts, reading list updates, preferences, deletions, and schedule requests."""
    raw = req.message.strip()
    if not raw:
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    # Resolve or create persistent chat session when persist=True
    active_session: Optional[Dict[str, Any]] = None
    stored_session_history: List[Dict[str, str]] = []
    prior_sessions_context: List[Dict[str, str]] = []
    if req.persist:
        if req.session_id:
            existing_detail = await assistant_sessions.get_session_with_messages(req.session_id)
            if existing_detail:
                active_session = {
                    "id": existing_detail["id"],
                    "title": existing_detail["title"],
                }
                stored_session_history = [
                    {"role": m["role"], "content": m["content"]}
                    for m in existing_detail.get("messages", [])[-12:]
                ]
        if not active_session:
            active_session = await assistant_sessions.create_session()
        prior_sessions_context = await assistant_sessions.get_recent_cross_session_context(
            exclude_session_id=active_session["id"],
            limit_turns=6,
        )
        saved_user_msg = await assistant_sessions.append_message(
            session_id=active_session["id"],
            role="user",
            content=raw,
        )
        if saved_user_msg:
            active_session["title"] = saved_user_msg["session_title"]

    async def _finalize(res: Dict[str, Any]) -> Dict[str, Any]:
        if active_session and req.persist:
            payload = {
                "action": res.get("action"),
                "scope_status": res.get("scope_status", "in_scope"),
                "source_model": res.get("source_model"),
                "proposed_event": res.get("proposed_event"),
                "action_staged": res.get("action_staged"),
                "deleted_events": res.get("deleted_events"),
                "recommendations": res.get("recommendations"),
                "curated_reading": res.get("curated_reading"),
                "mentioned_assignments": res.get("mentioned_assignments"),
                "mentioned_events": res.get("mentioned_events"),
                "saved_facts": res.get("saved_facts"),
                "actions_taken": res.get("actions_taken"),
                "deleted_count": res.get("deleted_count"),
                "added_count": res.get("added_count"),
            }
            saved_asst = await assistant_sessions.append_message(
                session_id=active_session["id"],
                role="assistant",
                content=str(res.get("message") or ""),
                payload=payload,
            )
            if saved_asst:
                res["session_id"] = active_session["id"]
                res["session_title"] = active_session["title"]
        return res

    profile = await get_profile()
    user_tz = _resolve_tz(profile.get("timezone"))
    now = datetime.now(user_tz)
    tz_abbr = now.tzname() or "LOCAL"
    today = now.date()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    first_name = (profile.get("first_name") or "").strip()
    full_name = (profile.get("full_name") or "").strip()
    display_name = full_name or first_name or "the user"
    default_loc = (profile.get("study_sanctuary") or profile.get("institution") or "Workspace").strip()
    calendar_owner = full_name or "Personal"

    async with get_conn() as conn:
        # 1. Fetch current knowledge items to provide full conversational memory context
        rows = await conn.fetch("""
            SELECT id, category, title, content, metadata
            FROM user_knowledge_base
            ORDER BY created_at DESC
            LIMIT 50
        """)
        current_items = []
        for r in rows:
            meta = r["metadata"]
            if isinstance(meta, str):
                try:
                    meta = json.loads(meta)
                except Exception:
                    meta = {}
            current_items.append({
                "id": str(r["id"]),
                "category": r["category"],
                "title": r["title"],
                "content": r["content"] or "",
                "metadata": meta or {},
            })

        # Fetch today's schedule events for situational awareness (converted to user's local time)
        cal_events = await conn.fetch("""
            SELECT id, summary, start_time, end_time, location, description, source, calendar_name
            FROM calendar_events
            WHERE start_time >= $1 AND start_time < $2
            ORDER BY start_time ASC
        """, today_start, today_end)
        events_summary = []
        for e in cal_events:
            st = e["start_time"].astimezone(user_tz) if e["start_time"].tzinfo else e["start_time"].replace(tzinfo=timezone.utc).astimezone(user_tz)
            et = e["end_time"].astimezone(user_tz) if e["end_time"].tzinfo else e["end_time"].replace(tzinfo=timezone.utc).astimezone(user_tz)
            events_summary.append(
                f"- {e['summary']} ({st.strftime('%I:%M %p')} – {et.strftime('%I:%M %p')} {tz_abbr}) at {e['location'] or default_loc}"
            )

        # Fetch upcoming 7-day schedule events for multi-day awareness (including Sunday routine)
        upcoming_events = await conn.fetch("""
            SELECT id, summary, start_time, end_time, location, description, source, calendar_name
            FROM calendar_events
            WHERE start_time >= $1 AND start_time < $2
            ORDER BY start_time ASC
        """, today_start, today_start + timedelta(days=7))
        upcoming_summary = []
        for e in upcoming_events:
            st = e["start_time"].astimezone(user_tz) if e["start_time"].tzinfo else e["start_time"].replace(tzinfo=timezone.utc).astimezone(user_tz)
            et = e["end_time"].astimezone(user_tz) if e["end_time"].tzinfo else e["end_time"].replace(tzinfo=timezone.utc).astimezone(user_tz)
            upcoming_summary.append(
                f"- [{st.strftime('%a, %b %d')}] {e['summary']} ({st.strftime('%I:%M %p')} – {et.strftime('%I:%M %p')} {tz_abbr}) at {e['location'] or default_loc}"
            )

        # Fetch active assignments for academic awareness (converted to user's local time)
        assignments = await conn.fetch("""
            SELECT course_name, title, due_at, is_submitted
            FROM canvas_assignments
            WHERE (due_at >= $1 AND due_at < $2)
               OR (due_at < $1 AND is_submitted = false AND due_at >= $3)
            ORDER BY due_at ASC
        """, today_start, today_start + timedelta(days=3), today_start - timedelta(days=2))
        assignments_summary = []
        for a in assignments:
            due_str = "No due date"
            if a["due_at"]:
                due_dt = a["due_at"].astimezone(user_tz) if a["due_at"].tzinfo else a["due_at"].replace(tzinfo=timezone.utc).astimezone(user_tz)
                if due_dt.hour in (18, 19) and due_dt.minute == 59:
                    due_dt = due_dt.replace(hour=23, minute=59, second=59)
                due_str = due_dt.strftime(f"%a, %b %d at %I:%M %p {tz_abbr}")
            assignments_summary.append(
                f"- [{a['course_name']}] {a['title']} (Due: {due_str}, Submitted: {a['is_submitted']})"
            )

        raw_l = raw.lower().strip()

        # =========================================================================
        # AUTONOMY & SAFETY GUARDRAILS (GEMINI.md): CALENDAR EVENT LIFECYCLE
        # =========================================================================

        # A. Conversational Confirmation of Recent Pending Action ("yes", "confirm", "approve", "do it")
        confirm_match = re.search(r'^(?:yes|yep|yeah|sure|confirm|approve|do\s+it|go\s+ahead|please\s+do|yes\s+please)\b', raw_l)
        if confirm_match and len(raw_l.split()) <= 6:
            pending_row = await conn.fetchrow("""
                SELECT id, action_type, description, diff_preview, status
                FROM pending_actions
                WHERE status = 'pending' AND created_at > now() - interval '15 minutes'
                ORDER BY created_at DESC
                LIMIT 1
            """)
            if pending_row:
                from ..routers.autopilot import approve_pending_action
                await approve_pending_action(str(pending_row["id"]))
                diff = json.loads(pending_row["diff_preview"]) if isinstance(pending_row["diff_preview"], str) else (pending_row["diff_preview"] or {})
                sum_name = diff.get("summary", "the scheduled event")
                return await _finalize({
                    "status": "success",
                    "action": "action_approved",
                    "message": f"Confirmed! I've removed **{sum_name}** from your schedule for today. 1-click Undo rollback is recorded in your Autopilot feed.",
                    "recommendations": [],
                    "curated_reading": None,
                    "proposed_event": None,
                    "action_staged": None,
                    "deleted_events": [],
                    "mentioned_assignments": [],
                    "mentioned_events": [],
                    "saved_facts": [],
                    "actions_taken": [f"Approved removal of {sum_name}"],
                    "deleted_count": 1,
                    "added_count": 0,
                })

        # B. Conversational Rejection of Recent Pending Action ("no", "cancel", "keep it", "reject")
        reject_match = re.search(r'^(?:no|cancel|keep\s+it|reject|nevermind|don\'?t\s+remove)\b', raw_l)
        if reject_match and len(raw_l.split()) <= 6:
            pending_row = await conn.fetchrow("""
                SELECT id, action_type, description, diff_preview, status
                FROM pending_actions
                WHERE status = 'pending' AND created_at > now() - interval '15 minutes'
                ORDER BY created_at DESC
                LIMIT 1
            """)
            if pending_row:
                from ..routers.autopilot import reject_pending_action
                await reject_pending_action(str(pending_row["id"]))
                return await _finalize({
                    "status": "success",
                    "action": "action_rejected",
                    "message": "Cancelled. I've kept the event on your schedule.",
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
                })

        # C. Schedule De-clogging & Sunday Errand Preference Reconciliation
        is_q = bool(re.search(r'^(?:what|when|where|do i|is there|show me|can i see|any)\b', raw_l)) or '?' in raw_l
        is_declog_or_sunday_errands = (
            any(k in raw_l for k in ["clogged", "declog", "de-clog", "unclog", "overlap", "overlapping", "conflict", "too packed", "congested", "messy"])
            or ("sunday" in raw_l and any(k in raw_l for k in ["prefer", "move", "shift", "put", "reschedule", "do those", "do errands", "run errands", "not reflected", "wasn't reflected", "did not reflect"]))
            or (not is_q and any(k in raw_l for k in ["errand", "grocery", "groceries", "supermarket", "shopping"]) and any(w in raw_l for w in ["move to sunday", "on sunday", "reschedule to sunday", "to sunday", "for sunday"]))
        )

        if is_declog_or_sunday_errands:
            # 1. Calculate upcoming Sunday
            days_until_sunday = (6 - today.weekday()) % 7
            if days_until_sunday == 0 and now.hour >= 18:
                days_until_sunday = 7
            sunday_date = today + timedelta(days=days_until_sunday if days_until_sunday > 0 else 2)
            sun_start = datetime(sunday_date.year, sunday_date.month, sunday_date.day, 13, 45, tzinfo=user_tz)
            sun_end = datetime(sunday_date.year, sunday_date.month, sunday_date.day, 14, 45, tzinfo=user_tz)

            actions_taken = []
            deleted_ids = []
            rollback_payload = {}

            # 2. Query today's Grocery/Errand events
            errand_events = await conn.fetch("""
                SELECT id, summary, start_time, end_time, location, description, source, color, calendar_id, calendar_name
                FROM calendar_events
                WHERE (summary ILIKE '%Grocery%' OR summary ILIKE '%Errand%')
                  AND start_time >= $1 AND start_time < $2
                ORDER BY start_time ASC
            """, today_start, today_end)

            if errand_events:
                main_errand = errand_events[0]
                rollback_payload[str(main_errand["id"])] = {
                    "summary": main_errand["summary"],
                    "start_time": main_errand["start_time"].isoformat(),
                    "end_time": main_errand["end_time"].isoformat(),
                    "source": main_errand["source"],
                }
                await conn.execute("""
                    UPDATE calendar_events
                    SET start_time = $2, end_time = $3, updated_at = now()
                    WHERE id = $1
                """, main_errand["id"], sun_start, sun_end)
                actions_taken.append(f"Moved '{main_errand['summary']}' to Sunday, {sunday_date.strftime('%b %d')} (1:45 PM – 2:45 PM {tz_abbr})")

                for dup in errand_events[1:]:
                    deleted_ids.append(dup["id"])
                    rollback_payload[str(dup["id"])] = {
                        "_restorable_event": True,
                        "id": str(dup["id"]),
                        "calendar_id": dup.get("calendar_id", "primary"),
                        "calendar_name": dup.get("calendar_name", calendar_owner),
                        "summary": dup["summary"],
                        "description": dup.get("description"),
                        "location": dup.get("location"),
                        "start_time": dup["start_time"].isoformat(),
                        "end_time": dup["end_time"].isoformat(),
                        "source": dup["source"],
                        "color": dup.get("color", "#10b981"),
                    }
                    await conn.execute("DELETE FROM calendar_events WHERE id = $1", dup["id"])
                    actions_taken.append(f"Removed duplicate errand window '{dup['summary']}'")
            else:
                sun_existing = await conn.fetchrow("""
                    SELECT id FROM calendar_events
                    WHERE (summary ILIKE '%Grocery%' OR summary ILIKE '%Errand%')
                      AND start_time >= $1 AND start_time < $2
                """, sun_start.replace(hour=0, minute=0, second=0), sun_start.replace(hour=23, minute=59, second=59))
                if not sun_existing:
                    row = await conn.fetchrow("""
                        INSERT INTO calendar_events (calendar_id, calendar_name, summary, description, location, start_time, end_time, source, color)
                        VALUES ('primary', 'Personal', 'Smart Errand Window: Grocery Run', 'Rescheduled to match Sunday routine: weekly groceries + essentials.', 'Local Supermarket', $1, $2, 'life_ops_study_block', '#10b981')
                        RETURNING id
                    """, sun_start, sun_end)
                    rollback_payload[str(row["id"])] = {"_deleted": True}
                    actions_taken.append(f"Scheduled Grocery Run on Sunday, {sunday_date.strftime('%b %d')} (1:45 PM – 2:45 PM {tz_abbr})")

            # 3. Resolve Overlapping Focus/Study Blocks today
            study_blocks = await conn.fetch("""
                SELECT id, summary, start_time, end_time, location, description, source, color, calendar_id, calendar_name
                FROM calendar_events
                WHERE source = 'life_ops_study_block'
                  AND summary ILIKE '%Focus Block%'
                  AND start_time >= $1 AND start_time < $2
                ORDER BY start_time ASC
            """, today_start, today_end)

            if len(study_blocks) >= 2:
                conflicting_block = study_blocks[0]
                deleted_ids.append(conflicting_block["id"])
                rollback_payload[str(conflicting_block["id"])] = {
                    "_restorable_event": True,
                    "id": str(conflicting_block["id"]),
                    "calendar_id": conflicting_block.get("calendar_id", "primary"),
                    "calendar_name": conflicting_block.get("calendar_name", calendar_owner),
                    "summary": conflicting_block["summary"],
                    "description": conflicting_block.get("description"),
                    "location": conflicting_block.get("location"),
                    "start_time": conflicting_block["start_time"].isoformat(),
                    "end_time": conflicting_block["end_time"].isoformat(),
                    "source": conflicting_block["source"],
                    "color": conflicting_block.get("color", "#d97706"),
                }
                await conn.execute("DELETE FROM calendar_events WHERE id = $1", conflicting_block["id"])

                clean_start = datetime(today.year, today.month, today.day, 16, 0, tzinfo=user_tz)
                clean_end = datetime(today.year, today.month, today.day, 18, 0, tzinfo=user_tz)
                remaining_block = study_blocks[1]
                rollback_payload[str(remaining_block["id"])] = {
                    "summary": remaining_block["summary"],
                    "start_time": remaining_block["start_time"].isoformat(),
                    "end_time": remaining_block["end_time"].isoformat(),
                    "source": remaining_block["source"],
                }
                await conn.execute("""
                    UPDATE calendar_events
                    SET summary = 'Focus Block: Priority Sprint',
                        start_time = $2, end_time = $3, updated_at = now()
                    WHERE id = $1
                """, remaining_block["id"], clean_start, clean_end)
                actions_taken.append("Consolidated deep work focus block to 4:00 PM – 6:00 PM")

            # 4. Log to autopilot_logs for 1-click Undo
            if rollback_payload:
                await conn.execute("""
                    INSERT INTO autopilot_logs (action_type, description, affected_ids, rollback_payload)
                    VALUES ('schedule_declog', $1, $2, $3)
                """,
                    f"De-clogged schedule & synced Sunday errand routine ({len(actions_taken)} adjustments).",
                    [uuid.UUID(k) for k in rollback_payload.keys()],
                    json.dumps(rollback_payload)
                )

            # 5. Persist the Sunday routine preference in knowledge base
            await conn.execute("""
                INSERT INTO user_knowledge_base (category, title, content, metadata)
                VALUES ('personal_fact', 'Errand & Meal Prep Schedule', 'Prefers to run errands and do meal prep on Sundays.', '{\"type\": \"routine\", \"preferred_day\": \"Sunday\"}')
                ON CONFLICT DO NOTHING
            """)

            greet_prefix = f"I completely understand, {first_name}." if first_name else "I completely understand."
            return await _finalize({
                "status": "success",
                "action": "schedule_declogged",
                "message": (
                    f"{greet_prefix} I've synced your Sunday errand preference and de-clogged your schedule!\n\n"
                    f"• 🛒 **Moved to Sunday, {sunday_date.strftime('%B %d')} (1:45 PM – 2:45 PM {tz_abbr})**: *Smart Errand Window: Grocery Run* is now locked in for Sunday afternoon.\n"
                    f"• 🧹 **Eliminated Duplicates**: Cleared duplicate errand blocks from today.\n"
                    f"• 🎯 **Resolved Overlaps**: Consolidated study blocks cleanly. 1-click Undo rollback is recorded in your Autopilot feed."
                ),
                "action_staged": None,
                "deleted_events": [],
                "recommendations": [],
                "curated_reading": None,
                "proposed_event": None,
                "mentioned_assignments": [],
                "mentioned_events": [],
                "saved_facts": [],
                "actions_taken": actions_taken,
                "deleted_count": len(deleted_ids),
                "added_count": 0,
            })

        # D. Calendar Event Removal / Cancellation Intent Detection
        is_book_intent = any(b in raw_l for b in ["book", "books", "reading", "textbook", "author", "clean code", "ddia", "reading list", "reading shelf"])
        del_event_pattern = re.search(
            r'''(?ix)
            (?:there\'?s?\s+no|don\'?t\s+have|no)\s+([a-z0-9\s-]+?)\s+(?:today|on\s+(?:my\s+)?schedule|class) |
            (?:remove|drop|delete|cancel|clear|get\s+rid\s+of)\s+(?:that|this|my|the\s+)?([a-z0-9\s-]+?)(?:\s+(?:from|on|in)\s+today|\s+today|\s+class|\s+course|\s+from\s+(?:my\s+)?schedule)?$ |
            (?:remove|drop|delete|cancel|clear|get\s+rid\s+of)\s+(?:that|this|my|the\s+)?([a-z0-9\s-]+)
            ''',
            raw
        )
        is_cal_removal = (not is_book_intent) and (
            bool(del_event_pattern)
            or (
                any(k in raw_l for k in ["no stats", "no stat", "no class", "get rid of", "cancel", "clear stats"])
                and any(c in raw_l for c in ["stat", "comm", "cs", "session", "grocery", "errand", "leetcode"])
            )
        )

        if is_cal_removal:
            target_raw = next((g for g in del_event_pattern.groups() if g is not None), raw).strip() if del_event_pattern else raw.strip()
            clean_target = re.sub(r'^(?:my|the|that|this)\s+', '', target_raw, flags=re.I).strip().lower()
            stop_words = {'class', 'course', 'today', 'from', 'on', 'session', 'schedule', 'there', 'no', 'can', 'you', 'get', 'rid', 'of', 'that', 'please', 'for'}
            tokens = [w for w in re.split(r'\s+', clean_target) if w not in stop_words]

            if not tokens:
                for c in ["stat", "comm", "cs 2506", "cs 3114", "grocery", "errand", "leetcode", "study session"]:
                    if c in raw_l:
                        tokens = [c]
                        break

            matching_events = []
            for e in cal_events:
                e_sum = e["summary"].lower()
                score = 0
                for tok in tokens:
                    if len(tok) >= 3:
                        if tok in e_sum:
                            score += 100
                        elif tok.rstrip('s') in e_sum or e_sum.startswith(tok[:4]):
                            score += 80
                if score > 0:
                    matching_events.append((score, e))

            matching_events.sort(key=lambda x: x[0], reverse=True)
            matched_events = [m[1] for m in matching_events]

            is_series_drop = "drop" in raw_l and not any(t in raw_l for t in ["today", "this session", "single"])
            if is_series_drop and matched_events:
                matched_events = await conn.fetch("""
                    SELECT id, summary, start_time, end_time, location, description, source, calendar_name
                    FROM calendar_events
                    WHERE summary ILIKE $1 AND start_time >= $2
                    ORDER BY start_time ASC
                """, f"%{tokens[0] if tokens else clean_target}%", today_start)

            if matched_events:
                from ..services.gatekeeper import propose_event_deletion
                gate_res = await propose_event_deletion(
                    event_ids=[str(e["id"]) for e in matched_events],
                    reason=f"Requested via Assistant: '{raw}'"
                )

                first_e = matched_events[0]
                st = first_e["start_time"].astimezone(user_tz) if first_e["start_time"].tzinfo else first_e["start_time"].replace(tzinfo=timezone.utc).astimezone(user_tz)
                et = first_e["end_time"].astimezone(user_tz) if first_e["end_time"].tzinfo else first_e["end_time"].replace(tzinfo=timezone.utc).astimezone(user_tz)

                if gate_res.get("status") == "pending_approval":
                    action_staged_payload = {
                        "action_id": str(gate_res["action_id"]),
                        "action_type": "delete_event",
                        "summary": first_e["summary"],
                        "date": st.strftime("%A, %b %d"),
                        "time": f"{st.strftime('%I:%M %p')} – {et.strftime('%I:%M %p')} {tz_abbr}",
                        "location": first_e["location"] or default_loc,
                        "source": first_e["source"],
                        "count": len(matched_events),
                        "diff_preview": gate_res.get("diff_preview", {}),
                    }
                    return await _finalize({
                        "status": "success",
                        "action": "action_staged",
                        "message": (
                            f"Because **{first_e['summary']}** is a scheduled academic or fixed block, "
                            f"safety guardrails require your confirmation before modifying your calendar.\n\n"
                            f"I have staged a proposal to remove today's session ({st.strftime('%I:%M %p')} – {et.strftime('%I:%M %p')} {tz_abbr}). "
                            f"Click **Confirm & Remove** below to apply the change, or confirm in the Schedule Approval Queue."
                        ),
                        "action_staged": action_staged_payload,
                        "recommendations": [],
                        "curated_reading": None,
                        "proposed_event": None,
                        "deleted_events": [],
                        "mentioned_assignments": [],
                        "mentioned_events": [],
                        "saved_facts": [],
                        "actions_taken": [f"Staged deletion proposal for {first_e['summary']}"],
                        "deleted_count": 0,
                        "added_count": 0,
                    })
                elif gate_res.get("status") == "auto_applied":
                    return await _finalize({
                        "status": "success",
                        "action": "event_deleted",
                        "message": (
                            f"Done! I've removed **{first_e['summary']}** from your schedule for today. "
                            f"1-click Undo rollback is recorded in your Autopilot feed."
                        ),
                        "deleted_events": [
                            {
                                "summary": first_e["summary"],
                                "start_time": st.isoformat(),
                                "end_time": et.isoformat(),
                            }
                        ],
                        "action_staged": None,
                        "recommendations": [],
                        "curated_reading": None,
                        "proposed_event": None,
                        "mentioned_assignments": [],
                        "mentioned_events": [],
                        "saved_facts": [],
                        "actions_taken": [f"Auto-removed {first_e['summary']}"],
                        "deleted_count": len(matched_events),
                        "added_count": 0,
                    })
            else:
                return await _finalize({
                    "status": "success",
                    "action": "no_event_found",
                    "message": f"I checked your schedule for today, and didn't find any session matching '{clean_target or raw}'.",
                    "action_staged": None,
                    "deleted_events": [],
                    "recommendations": [],
                    "curated_reading": None,
                    "proposed_event": None,
                    "mentioned_assignments": [],
                    "mentioned_events": [],
                    "saved_facts": [],
                    "actions_taken": [],
                    "deleted_count": 0,
                    "added_count": 0,
                })

        # Delegate main scoped assistant reasoning, card hydration & event proposals
        from ..services.assistant_engine import process_direct_line

        client_history = (
            [{"role": h.role, "content": h.content} for h in req.history]
            if req.history
            else []
        )
        effective_history = stored_session_history if stored_session_history else client_history
        res = await process_direct_line(
            conn=conn,
            raw=raw,
            history=effective_history,
            profile=profile,
            user_tz=user_tz,
            now=now,
            current_items=current_items,
            category_hint=req.category,
            prior_sessions_context=prior_sessions_context,
        )
        return await _finalize(res)


@router.get("/knowledge")
async def get_user_knowledge(category: Optional[str] = None) -> List[Dict[str, Any]]:
    """Retrieve items from the user's personal knowledge base."""
    async with get_conn() as conn:
        if category:
            rows = await conn.fetch("""
                SELECT id, category, title, content, metadata, is_completed, created_at
                FROM user_knowledge_base
                WHERE category = $1
                ORDER BY created_at DESC
                LIMIT 50
            """, category)
        else:
            rows = await conn.fetch("""
                SELECT id, category, title, content, metadata, is_completed, created_at
                FROM user_knowledge_base
                ORDER BY created_at DESC
                LIMIT 50
            """)
        results = []
        for r in rows:
            d = dict(r)
            if isinstance(d.get("metadata"), str):
                try:
                    d["metadata"] = json.loads(d["metadata"])
                except Exception:
                    pass
            results.append(d)
        return results


@router.delete("/knowledge/{item_id}")
async def delete_user_knowledge(item_id: str) -> Dict[str, Any]:
    """Delete an item from the user's personal knowledge base."""
    async with get_conn() as conn:
        await conn.execute("DELETE FROM user_knowledge_base WHERE id = $1", uuid.UUID(item_id))
        await conn.execute("DELETE FROM document_embeddings WHERE source_path = $1", f"knowledge:{item_id}")
        return {"status": "success", "message": "Knowledge entry removed."}


@router.post("/knowledge")
async def create_user_knowledge(req: CreateKnowledgeRequest) -> Dict[str, Any]:
    """Add a new item to the user's personal knowledge base."""
    async with get_conn() as conn:
        meta_json = json.dumps(req.metadata or {})
        row = await conn.fetchrow("""
            INSERT INTO user_knowledge_base (category, title, content, metadata)
            VALUES ($1, $2, $3, $4)
            RETURNING id, category, title, content, metadata, created_at
        """, req.category, req.title.strip(), req.content or "", meta_json)

        try:
            from ..services.rag_indexer import index_document
            await index_document(
                source_path=f"knowledge:{row['id']}",
                source_type="user_knowledge",
                content=f"{req.category.upper()}: {req.title}. {req.content or ''}"
            )
        except Exception:
            pass

        d = dict(row)
        if isinstance(d.get("metadata"), str):
            try:
                d["metadata"] = json.loads(d["metadata"])
            except Exception:
                pass
        return {"status": "success", "item": d}


@router.put("/knowledge/{item_id}")
async def update_user_knowledge(item_id: str, req: UpdateKnowledgeRequest) -> Dict[str, Any]:
    """Update an existing item in the user's personal knowledge base."""
    async with get_conn() as conn:
        try:
            u_id = uuid.UUID(item_id)
        except Exception:
            raise HTTPException(status_code=400, detail="Invalid UUID format for item_id")

        existing = await conn.fetchrow(
            "SELECT id, category, title, content, metadata FROM user_knowledge_base WHERE id = $1",
            u_id
        )
        if not existing:
            raise HTTPException(status_code=404, detail="Knowledge item not found")

        new_cat = req.category if req.category is not None else existing["category"]
        new_title = req.title.strip() if req.title is not None else existing["title"]
        new_content = req.content if req.content is not None else existing["content"]

        if req.metadata is not None:
            new_meta_json = json.dumps(req.metadata)
        else:
            new_meta_json = json.dumps(existing["metadata"]) if isinstance(existing["metadata"], dict) else (existing["metadata"] or "{}")

        row = await conn.fetchrow("""
            UPDATE user_knowledge_base
            SET category = $1, title = $2, content = $3, metadata = $4, updated_at = now()
            WHERE id = $5
            RETURNING id, category, title, content, metadata, created_at, updated_at
        """, new_cat, new_title, new_content, new_meta_json, u_id)

        try:
            from ..services.rag_indexer import index_document
            await index_document(
                source_path=f"knowledge:{row['id']}",
                source_type="user_knowledge",
                content=f"{new_cat.upper()}: {new_title}. {new_content}"
            )
        except Exception:
            pass

        d = dict(row)
        if isinstance(d.get("metadata"), str):
            try:
                d["metadata"] = json.loads(d["metadata"])
            except Exception:
                pass
        return {"status": "success", "item": d}


@router.post("/commit-event")
async def commit_assistant_event(req: CommitEventRequest) -> Dict[str, Any]:
    """Commit an assistant-proposed calendar event with Autopilot logging for 1-click Undo."""
    profile = await get_profile()
    cal_owner = (profile.get("full_name") or "Personal").strip()
    default_loc = (profile.get("study_sanctuary") or profile.get("institution") or "Workspace").strip()
    valid_sources = {"life_ops_study_block", "life_ops_manual", "external", "canvas_inferred"}
    source = req.source if req.source in valid_sources else "life_ops_study_block"

    async with get_conn() as conn:
        row = await conn.fetchrow("""
            INSERT INTO calendar_events (calendar_id, calendar_name, summary, description, location, start_time, end_time, source, color)
            VALUES ('primary', $1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, summary, description, location, start_time, end_time, source, color
        """, cal_owner, req.summary, req.description or "Scheduled via Life-Ops Assistant", req.location or default_loc, req.start_time, req.end_time, source, req.color)

        event_id = str(row["id"])
        rollback_payload = {event_id: {"_deleted": True}}
        await conn.execute("""
            INSERT INTO autopilot_logs (action_type, description, affected_ids, rollback_payload)
            VALUES ('study_block_create', $1, $2, $3)
        """, f"Assistant scheduled '{req.summary}' onto calendar.", [row["id"]], json.dumps(rollback_payload))

        return {
            "status": "success",
            "event_id": event_id,
            "event": {
                "id": event_id,
                "summary": row["summary"],
                "start_time": row["start_time"].isoformat(),
                "end_time": row["end_time"].isoformat(),
                "location": row["location"],
                "color": row["color"],
                "source": row["source"],
            },
            "message": f"Successfully added '{req.summary}' to your calendar with 1-click Undo available in Logs.",
        }


@router.post("/adopt-plan")
async def adopt_plan_endpoint(req: AdoptPlanRequest) -> Dict[str, Any]:
    """Adopt a proactive strategy from the Daily Briefing into the live schedule with Autopilot logging."""
    plan_id = req.plan_id
    profile = await get_profile()
    user_tz = _resolve_tz(profile.get("timezone"))
    now = datetime.now(user_tz)
    today = now.date()
    cal_owner = (profile.get("full_name") or "Personal").strip()
    sanctuary = (profile.get("study_sanctuary") or "Study Desk").strip()
    institution = (profile.get("institution") or "Campus Hub").strip()

    created_events = []
    rollback_ids = []

    async with get_conn() as conn:
        if plan_id == "plan-a":
            # Plan A: Early Priority Sprint (3:00 PM – 5:00 PM)
            start_dt = datetime(today.year, today.month, today.day, 15, 0, tzinfo=user_tz)
            end_dt = datetime(today.year, today.month, today.day, 17, 0, tzinfo=user_tz)

            row = await conn.fetchrow("""
                INSERT INTO calendar_events (calendar_id, calendar_name, summary, description, location, start_time, end_time, source, color)
                VALUES ('primary', $1, 'Focus Block: Priority Sprint', 'Adopted via Daily Briefing Plan A: early deep sprint to wrap up priority work before evening.', $2, $3, $4, 'life_ops_study_block', '#d97706')
                RETURNING id, summary, start_time, end_time
            """, cal_owner, sanctuary, start_dt, end_dt)
            created_events.append(dict(row))
            rollback_ids.append(str(row["id"]))
            plan_name = "Plan A: Early Priority Sprint"

        elif plan_id == "plan-b":
            # Plan B: Tech Talk / Community Event (5:30 PM - 6:45 PM) + Evening Submission Block (8:00 PM - 9:30 PM)
            tt_start = datetime(today.year, today.month, today.day, 17, 30, tzinfo=user_tz)
            tt_end = datetime(today.year, today.month, today.day, 18, 45, tzinfo=user_tz)
            sub_start = datetime(today.year, today.month, today.day, 20, 0, tzinfo=user_tz)
            sub_end = datetime(today.year, today.month, today.day, 21, 30, tzinfo=user_tz)

            r1 = await conn.fetchrow("""
                INSERT INTO calendar_events (calendar_id, calendar_name, summary, description, location, start_time, end_time, source, color)
                VALUES ('primary', $1, 'Community Tech Talk: Systems & AI', 'Adopted via Daily Briefing Plan B: guest lecture + networking.', $2, $3, $4, 'life_ops_manual', '#38bdf8')
                RETURNING id, summary, start_time, end_time
            """, cal_owner, institution, tt_start, tt_end)
            r2 = await conn.fetchrow("""
                INSERT INTO calendar_events (calendar_id, calendar_name, summary, description, location, start_time, end_time, source, color)
                VALUES ('primary', $1, 'Focus Block: Evening Wrap-Up', 'Adopted via Daily Briefing Plan B: final review and submit before midnight.', $2, $3, $4, 'life_ops_study_block', '#d97706')
                RETURNING id, summary, start_time, end_time
            """, cal_owner, sanctuary, sub_start, sub_end)
            created_events.extend([dict(r1), dict(r2)])
            rollback_ids.extend([str(r1["id"]), str(r2["id"])])
            plan_name = "Plan B: Tech Talk & Evening Submission"

        elif plan_id == "errands-window":
            # Check user preferences for preferred errand day
            pref_row = await conn.fetchrow("""
                SELECT content FROM user_knowledge_base
                WHERE (category = 'preference' OR category = 'personal_fact')
                  AND (title ILIKE '%errand%' OR title ILIKE '%grocery%' OR content ILIKE '%sunday%')
                LIMIT 1
            """)
            target_date = today
            if pref_row and "sunday" in pref_row["content"].lower():
                days_until_sunday = (6 - today.weekday()) % 7
                if days_until_sunday == 0 and now.hour >= 18:
                    days_until_sunday = 7
                elif days_until_sunday > 0:
                    target_date = today + timedelta(days=days_until_sunday)

            # Smart Errand Window: Grocery Run (1:45 PM – 2:45 PM)
            k_start = datetime(target_date.year, target_date.month, target_date.day, 13, 45, tzinfo=user_tz)
            k_end = datetime(target_date.year, target_date.month, target_date.day, 14, 45, tzinfo=user_tz)

            existing = await conn.fetchrow("""
                SELECT id, summary, start_time, end_time FROM calendar_events
                WHERE (summary ILIKE '%Grocery Run%' OR summary ILIKE '%Errand%')
                  AND start_time >= $1 AND start_time < $2
                LIMIT 1
            """, k_start.replace(hour=0, minute=0, second=0), k_start.replace(hour=23, minute=59, second=59))

            if existing:
                return {
                    "status": "success",
                    "plan_id": plan_id,
                    "plan_name": "Smart Errand Window: Grocery Run",
                    "events_created": 0,
                    "events": [dict(existing)],
                    "message": f"Smart Errand Window: Grocery Run is already scheduled on {target_date.strftime('%A, %b %d')} (1:45 PM – 2:45 PM).",
                }

            row = await conn.fetchrow("""
                INSERT INTO calendar_events (calendar_id, calendar_name, summary, description, location, start_time, end_time, source, color)
                VALUES ('primary', 'Personal', 'Smart Errand Window: Grocery Run', 'Adopted via Daily Briefing: restock weekly protein & fresh staples.', 'Local Supermarket', $1, $2, 'life_ops_study_block', '#10b981')
                RETURNING id, summary, start_time, end_time
            """, k_start, k_end)
            created_events.append(dict(row))
            rollback_ids.append(str(row["id"]))
            plan_name = f"Smart Errand Window: Grocery Run ({target_date.strftime('%A')})"

        else:
            raise HTTPException(status_code=400, detail="Unknown plan identifier")

        # Record to autopilot_logs for 1-click Undo rollback
        rollback_payload = {
            rid: {"_deleted": True} for rid in rollback_ids
        }
        await conn.execute("""
            INSERT INTO autopilot_logs (
                action_type, description, affected_ids, rollback_payload
            ) VALUES ('study_block_create', $1, $2, $3)
        """,
            f"Scheduled '{plan_name}' ({len(created_events)} block(s)) onto today's calendar.",
            [uuid.UUID(rid) for rid in rollback_ids],
            json.dumps(rollback_payload)
        )

    return {
        "status": "success",
        "plan_id": plan_id,
        "plan_name": plan_name,
        "events_created": len(created_events),
        "events": created_events,
        "message": f"Successfully adopted '{plan_name}' to today's schedule with 1-click Undo available in Logs.",
    }


# Comprehensive, diverse catalog of daily curiosities, systems trivia, cognitive science, and philosophy
CURIOSITY_CATALOG = [
    {
        "id": "atlas-virtual-memory",
        "category": "Systems Architecture",
        "tag": "Systems Architecture",
        "title": "The 1962 Origins of Virtual Memory",
        "did_you_know": "The concept of virtual memory—paging and address translation—was first invented for the Atlas computer at Manchester University in 1962.",
        "reflection": "Before paging, if a program exceeded physical magnetic core memory, the machine literally halted and developers had to manually partition punch cards. That breakthrough still underpins every modern operating system.",
        "footnote": "Systems Trivia · Atlas Computer, 1962"
    },
    {
        "id": "page-size-4kb",
        "category": "Operating Systems",
        "tag": "Hardware & OS",
        "title": "Why Page Sizes Are Universally 4KB",
        "did_you_know": "Ever wonder why almost every modern operating system and CPU architecture defaults to 4,096-byte pages?",
        "reflection": "In the 1980s, the DEC VAX used 512-byte pages, which flooded page table entries. 4KB was chosen for the Intel 80386 as the optimal mathematical sweet spot between TLB cache reach and wasted internal fragmentation for typical process sizes.",
        "footnote": "Hardware Architecture · Intel 80386 & DEC VAX Heritage"
    },
    {
        "id": "first-computer-bug",
        "category": "Computing Lore",
        "tag": "Computing History",
        "title": "The 1947 Moth in Relay #70",
        "did_you_know": "The word 'bug' for technical glitches preceded computers, but the first actual computer bug was an unfortunate insect.",
        "reflection": "On September 9, 1947, Grace Hopper's team at Harvard found an actual moth trapped between the contacts of Relay #70 in the electromechanical Mark II computer. The moth was taped into the logbook with the note: 'First actual case of bug being found.'",
        "footnote": "Smithsonian National Museum of American History · Harvard Mark II Log"
    },
    {
        "id": "c-zero-indexing",
        "category": "Language Design",
        "tag": "C Programming",
        "title": "Why Array Indices Start at 0 in C",
        "did_you_know": "0-indexed arrays weren't a stylistic choice—they were an unyielding memory address calculation.",
        "reflection": "In Dennis Ritchie's C compiler, an array name is simply a pointer to the memory location of the first element. a[i] is defined as *(a + i). Index 0 means offset by 0 bytes from the base address. Using 1 would have required a redundant subtraction instruction on every array access.",
        "footnote": "The Development of the C Language · Dennis M. Ritchie, Bell Labs"
    },
    {
        "id": "claude-shannon-juggling",
        "category": "Information Theory",
        "tag": "Pioneers of Computing",
        "title": "Claude Shannon's Unicycle at Bell Labs",
        "did_you_know": "The father of digital circuit design and information theory spent his Bell Labs afternoons riding a unicycle while juggling.",
        "reflection": "Claude Shannon, whose 1937 master's thesis proved that electrical switches could implement Boolean logic, also built a motorized pogo stick, a gasoline-powered frisbee, and proved the mathematical Juggling Theorem linking toss height, flight time, and hand count.",
        "footnote": "A Mind at Play: How Claude Shannon Invented the Future"
    },
    {
        "id": "quake-fast-inverse-sqrt",
        "category": "Systems Graphics",
        "tag": "Low-Level Math",
        "title": "The Magic Constant: 0x5f3759df",
        "did_you_know": "In 1999, Quake III computed 1/√x four times faster than hardware floating-point division using a single mysterious bit manipulation.",
        "reflection": "By reinterpreting an IEEE 754 float bit pattern as a 32-bit integer, shifting it right by 1, and subtracting from the hex constant 0x5f3759df, John Carmack and Gary Tarolli achieved an astonishingly accurate initial guess for Newton-Raphson approximation without expensive division.",
        "footnote": "Fast Inverse Square Root · id Software Quake III Engine"
    },
    {
        "id": "year-2038-overflow",
        "category": "Systems Architecture",
        "tag": "Time & Systems",
        "title": "The Unix 2038 Epoch Overflow",
        "did_you_know": "At exactly 03:14:07 UTC on Tuesday, January 19, 2038, standard 32-bit Unix time will break.",
        "reflection": "Represented as a signed 32-bit integer counting seconds since January 1, 1970, the timestamp will hit its maximum positive value (2,147,483,647) and wrap around to -2,147,483,648, resetting clocks to December 13, 1901. Modern 64-bit systems extend this limit to 292 billion years.",
        "footnote": "POSIX Time Standard · 32-bit vs 64-bit time_t"
    },
    {
        "id": "belady-fifo-anomaly",
        "category": "Memory Management",
        "tag": "Paging Algorithms",
        "title": "Belády's Anomaly: When More RAM Causes More Faults",
        "did_you_know": "In virtual memory paging, you would assume giving a process more physical frames always reduces page faults. Under FIFO, that is false.",
        "reflection": "Discovered by László Belády in 1969, FIFO page replacement can actually suffer more page faults with 4 frames than with 3 for identical access patterns. This anomaly led directly to the development of stack-based replacement algorithms like LRU and Clock.",
        "footnote": "IBM Systems Journal · Anomaly in Space-Time Characteristics of Certain Programs"
    },
    {
        "id": "apollo-guidance-lol",
        "category": "Aerospace Systems",
        "tag": "Embedded Systems",
        "title": "The Apollo 11 'LOL' Core Rope Memory",
        "did_you_know": "The software that landed Neil Armstrong on the Moon was physically woven by hand into copper wires and magnetic rings.",
        "reflection": "The Apollo Guidance Computer (AGC) stored 36K words of ROM in 'core rope memory'. Wires threaded through a magnetic core represented a 1; wires bypassing it represented a 0. Because textile workers wove it on factory floors, engineers fondly nicknamed it the 'LOL method' (Little Old Lady).",
        "footnote": "MIT Instrumentation Laboratory · Apollo Guidance Computer Software"
    },
    {
        "id": "first-wooden-mouse",
        "category": "Human-Computer Interaction",
        "tag": "Hardware Roots",
        "title": "The 1964 Hand-Carved Wooden Mouse",
        "did_you_know": "The first computer mouse was carved out of a block of Douglas fir wood with two perpendicular metal wheels.",
        "reflection": "Invented by Doug Engelbart and Bill English at Stanford Research Institute in 1964, the device was patented as an 'X-Y Position Indicator for a Display System'. They called it a mouse simply because the cord exiting the back looked like a tail.",
        "footnote": "The Mother of All Demos · Doug Engelbart, San Francisco, 1968"
    },
    {
        "id": "camus-goalkeeper",
        "category": "Philosophy & Literature",
        "tag": "Philosophy & Mindset",
        "title": "Albert Camus: The Absurdist Championship Goalie",
        "did_you_know": "Before writing 'The Stranger' and 'The Myth of Sisyphus', Albert Camus was the star goalkeeper for Racing Universitaire d'Alger.",
        "reflection": "Camus famously wrote: 'After many years during which I saw many things, what I know most surely about morality and the duty of man I owe to sport and learned it in the RUA.' He believed the goalkeeper's solitary vigilance under pressure was the purest metaphor for maintaining composure in an unpredictable world.",
        "footnote": "Albert Camus: A Life · Herbert R. Lottman"
    },
    {
        "id": "marcus-aurelius-danube",
        "category": "Philosophy & Literature",
        "tag": "Stoic Wisdom",
        "title": "Meditations Written in Frontline War Tents",
        "did_you_know": "Marcus Aurelius did not write 'Meditations' in an imperial palace—he wrote it by candlelight in military tents on the frozen Danube.",
        "reflection": "While commanding Roman legions during the Marcomannic Wars along modern-day Hungary and Austria between 170 and 180 AD, the Roman Emperor kept a private journal to remind himself not to let stress, betrayal, or cold exhaustion conquer his internal peace.",
        "footnote": "Meditations · Book II: 'Written among the Quadi on the Granua'"
    },
    {
        "id": "ishiguro-songwriting",
        "category": "Philosophy & Literature",
        "tag": "Literary Craft",
        "title": "Kazuo Ishiguro Wrote 100+ Folk Songs First",
        "did_you_know": "Nobel laureate Kazuo Ishiguro dreamed of becoming a traveling folk singer like Bob Dylan before writing a single novel.",
        "reflection": "In his twenties, Ishiguro submitted demo tapes to record companies across London. He credited his signature literary restraint—leaving profound emotion unsaid between lines—to the tight syllabic discipline of acoustic songwriting.",
        "footnote": "Nobel Lecture in Literature, 2017 · 'My Twentieth-Century Evening'"
    },
    {
        "id": "kafka-insurance-clerk",
        "category": "Philosophy & Literature",
        "tag": "Creative Discipline",
        "title": "Kafka: Industrial Safety Officer by Day",
        "did_you_know": "Franz Kafka spent his days calculating industrial disability compensation for the Workers' Accident Insurance Institute of Prague.",
        "reflection": "From 8:00 AM to 2:00 PM, Kafka investigated machine accidents in steel mills and sawmills, advocating for protective gear for factory workers. He retreated to his desk at midnight to write his surrealist classics, embodying the discipline of balancing a daily career with deep personal craft.",
        "footnote": "Franz Kafka: The Office Writings · Corngold, Gross, and Churchill"
    },
    {
        "id": "wittgenstein-steel-fortune",
        "category": "Philosophy & Literature",
        "tag": "Radical Integrity",
        "title": "Wittgenstein's Renunciation of Industrial Millions",
        "did_you_know": "Ludwig Wittgenstein, whose 'Tractatus' reshaped modern logic, inherited one of Europe's largest steel fortunes and gave away every penny.",
        "reflection": "Son of Austrian industrialist Karl Wittgenstein, Ludwig gave his inheritance to Austrian artists and his siblings, arguing that unearned wealth corrupted philosophical clarity. He worked as an elementary school teacher in rural mountain villages before returning to Cambridge to lecture on logic.",
        "footnote": "Ludwig Wittgenstein: The Duty of Genius · Ray Monk"
    },
    {
        "id": "seneca-on-time",
        "category": "Philosophy & Literature",
        "tag": "Stoic Wisdom",
        "title": "Seneca on the Illusion of Limited Time",
        "did_you_know": "In 'On the Shortness of Life', Seneca argued that humans complain about life being brief only because we squander the vast majority of it.",
        "reflection": "'It is not that we have a short time to live, but that we waste a lot of it. Life is long enough, and a sufficiently generous estimate has been given to us for the highest achievements if it were all well invested.' Focus isn't about working more hours—it's about removing frivolous dissipation.",
        "footnote": "De Brevitate Vitae · Lucius Annaeus Seneca, 49 AD"
    },
    {
        "id": "circadian-melanopsin",
        "category": "Cognitive Science & Physics",
        "tag": "Circadian Biology",
        "title": "Melanopsin Retinal Cells & Blue Light",
        "did_you_know": "Your eyes have a specialized set of retinal cells whose only job is detecting sunrise—and computer screens.",
        "reflection": "Discovered only in 2002, intrinsically photosensitive retinal ganglion cells (ipRGCs) contain the photopigment melanopsin, which is maximally sensitive to 460–480 nm blue light. A mere 8 minutes of late-night screen exposure signals the suprachiasmatic nucleus to halt melatonin synthesis for up to 90 minutes.",
        "footnote": "Science Magazine · Melanopsin-Expressing Retinal Ganglion Cells"
    },
    {
        "id": "zeigarnik-working-memory",
        "category": "Cognitive Science & Physics",
        "tag": "Cognitive Psychology",
        "title": "The Zeigarnik Effect: Clearing Cognitive RAM",
        "did_you_know": "In 1927, psychologist Bluma Zeigarnik noticed Berlin waiters remembered unpaid restaurant tabs perfectly, but forgot them the second they were paid.",
        "reflection": "Unfinished tasks remain active in subconscious working memory loops, continuously consuming cognitive stamina. Research shows that simply writing out a concrete plan for when and how you'll tackle tomorrow's tasks (like an upcoming project or paper) immediately unloads the working memory buffer so you can sleep deeply.",
        "footnote": "Psychological Research · Das Behalten erledigter und unerledigter Handlungen"
    },
    {
        "id": "sleep-spindles-memory",
        "category": "Cognitive Science & Physics",
        "tag": "Neuroscience",
        "title": "Sleep Spindles & Logic Consolidation",
        "did_you_know": "Your brain transfers complex programming logic from short-term RAM to long-term storage during Stage 2 NREM sleep.",
        "reflection": "Short bursts of oscillatory brain activity (11–16 Hz) called 'sleep spindles' occur thousands of times during non-REM sleep. Neuroscience demonstrates that sleep spindle density directly predicts recall improvement for hierarchical rules, algorithms, and complex systems architecture learned during the day.",
        "footnote": "Nature Neuroscience · Sleep Spindles and Declarative Memory Consolidation"
    },
    {
        "id": "caffeine-adenosine-half-life",
        "category": "Cognitive Science & Physics",
        "tag": "Neurochemistry",
        "title": "The 6-Hour Half-Life of Afternoon Caffeine",
        "did_you_know": "Caffeine doesn't actually give you energy—it temporarily impersonates an exhausted neurotransmitter.",
        "reflection": "Caffeine has a chemical structure nearly identical to adenosine, the molecule that accumulates in your brain throughout the day to create 'sleep pressure'. Caffeine parks in adenosine receptors without activating them, masking your fatigue. Because its hepatic half-life is 5 to 7 hours, a 3 PM coffee still occupies 25% of your receptors at midnight.",
        "footnote": "Pharmacological Reviews · Actions of Caffeine on the Brain"
    },
    {
        "id": "diogenes-lantern",
        "category": "Philosophy & Literature",
        "tag": "Ancient Philosophy",
        "title": "Diogenes Carrying a Lantern in Bright Daylight",
        "did_you_know": "The Greek cynic Diogenes was famous for walking through the crowded Athens marketplace at high noon holding a lit lantern.",
        "reflection": "When citizens asked him what he was doing, he famously replied: 'I am looking for an honest human being.' Diogenes lived in a large ceramic storage jar, practiced absolute minimalism, and taught that true freedom came from stripping away pretense, social performance, and unnecessary possessions.",
        "footnote": "Lives and Opinions of Eminent Philosophers · Diogenes Laërtius"
    },
    {
        "id": "turing-bletchley-bicycle",
        "category": "Systems & Computer Science",
        "tag": "Computing History",
        "title": "Alan Turing's Broken Bicycle Chain Pattern",
        "did_you_know": "Alan Turing, who cracked the Enigma cipher and formulated modern computation, commuted at Bletchley Park on a faulty bicycle he calculated rather than fixed.",
        "reflection": "His bicycle had a bent cog that caused the chain to slip off after a specific number of pedal revolutions. Rather than take it to a repair shop, Turing mentally counted his pedal strokes while riding through the English countryside, stopping his pedaling at stroke 213 to tap the chain back into position without dismounting.",
        "footnote": "Alan Turing: The Enigma · Andrew Hodges"
    }
]


@router.get("/curiosity/random")
async def get_random_curiosity() -> Dict[str, Any]:
    """Return a fresh random curiosity fact from the curated catalog."""
    return random.choice(CURIOSITY_CATALOG)


@router.get("/daily")
async def get_daily_brief() -> Dict[str, Any]:
    """Retrieve full daily briefing payload dynamically hydrated from user profile, DB state, and live weather."""
    profile = await get_profile()
    tz_name = profile.get("timezone") or "America/New_York"
    user_tz = _resolve_tz(tz_name)
    now = datetime.now(user_tz)
    tz_abbr = now.tzname() or "LOCAL"
    today = now.date()
    current_minutes = now.hour * 60 + now.minute
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    first_name = (profile.get("first_name") or "").strip()
    city = (profile.get("city") or "").strip()
    region = (profile.get("region") or "").strip()
    institution = (profile.get("institution") or "").strip()
    sanctuary = (profile.get("study_sanctuary") or "Study Desk").strip()
    location_label = ", ".join(p for p in (city, region) if p) or institution or "Local Workspace"
    default_event_loc = sanctuary or institution or "Local"

    weather_data = await fetch_live_weather(
        profile.get("latitude"),
        profile.get("longitude"),
        tz_name,
        location_label,
    )

    today_events: List[Dict[str, Any]] = []
    raw_today_events: List[Dict[str, Any]] = []
    due_today_assignments: List[Dict[str, Any]] = []
    upcoming_milestones: List[Dict[str, Any]] = []

    three_days_out = today_start + timedelta(days=3)
    two_days_ago = today_start - timedelta(days=2)

    async with get_conn() as conn:
        events = await conn.fetch("""
            SELECT ce.id, ce.calendar_id, ce.calendar_name, ce.summary, ce.description, ce.location,
                   ce.start_time, ce.end_time, ce.source, ce.color,
                   COALESCE(
                       ce.item_type,
                       CASE WHEN ce.source IN ('canvas_inferred', 'life_ops_study_block') THEN 'task' ELSE 'event' END
                   ) AS item_type,
                   ca.id::text AS assignment_id,
                   ca.is_submitted
            FROM calendar_events ce
            LEFT JOIN canvas_assignments ca
              ON ce.external_uid = 'canvas:' || ca.canvas_uid
            WHERE ce.start_time >= $1 AND ce.start_time < $2
              AND ce.status != 'cancelled'
            ORDER BY ce.start_time ASC
        """, today_start, today_end)
        for e in events:
            st = e["start_time"].astimezone(user_tz) if e["start_time"].tzinfo else e["start_time"].replace(tzinfo=timezone.utc).astimezone(user_tz)
            et = e["end_time"].astimezone(user_tz) if e["end_time"].tzinfo else e["end_time"].replace(tzinfo=timezone.utc).astimezone(user_tz)
            raw_today_events.append({
                "id": str(e["id"]),
                "calendar_id": e["calendar_id"] or "primary",
                "calendar_name": e["calendar_name"] or "Schedule",
                "summary": e["summary"],
                "description": e["description"] or "",
                "location": e["location"] or default_event_loc,
                "st": st,
                "et": et,
                "start_time": e["start_time"].isoformat(),
                "end_time": e["end_time"].isoformat(),
                "source": e["source"],
                "color": e["color"],
                "item_type": e["item_type"],
                "assignment_id": e["assignment_id"],
                "is_submitted": e["is_submitted"],
            })
            today_events.append({
                "id": str(e["id"]),
                "calendar_id": e["calendar_id"] or "primary",
                "summary": e["summary"],
                "location": e["location"] or default_event_loc,
                "start_time": e["start_time"].isoformat(),
                "end_time": e["end_time"].isoformat(),
                "source": e["source"],
                "color": e["color"],
                "item_type": e["item_type"],
                "assignment_id": e["assignment_id"],
                "is_submitted": e["is_submitted"],
                "calendar_name": e["calendar_name"],
            })

        assignments = await conn.fetch("""
            SELECT id, course_name, title, description, syllabus_notes, due_at,
                   is_submitted, submission_status, ai_summary, ai_sections, ai_model
            FROM canvas_assignments
            WHERE status = 'active'
              AND ((due_at >= $1 AND due_at < $2)
                   OR (due_at >= $3 AND due_at < $1 AND is_submitted = false))
            ORDER BY due_at ASC
        """, today_start, three_days_out, two_days_ago)
        for a in assignments:
            due_at_val = a["due_at"]
            is_recent_unsubmitted = False
            if due_at_val and not a["is_submitted"]:
                is_recent_unsubmitted = due_at_val < now and due_at_val >= (now - timedelta(days=2))
            parsed_sections = a["ai_sections"]
            if isinstance(parsed_sections, str):
                try:
                    parsed_sections = json.loads(parsed_sections)
                except Exception:
                    parsed_sections = None

            due_today_assignments.append({
                "id": str(a["id"]),
                "course_name": a["course_name"],
                "title": a["title"],
                "description": a["description"],
                "syllabus_notes": a["syllabus_notes"],
                "due_at": a["due_at"].isoformat() if a["due_at"] else None,
                "is_submitted": a["is_submitted"],
                "submission_status": a["submission_status"],
                "ai_summary": a["ai_summary"],
                "ai_sections": parsed_sections,
                "ai_model": a["ai_model"],
                "item_type": "task",
                "is_grace_window": is_recent_unsubmitted,
            })

        knowledge_rows = await conn.fetch("""
            SELECT id, category, title, content, metadata, is_completed, created_at
            FROM user_knowledge_base
            ORDER BY created_at DESC
            LIMIT 15
        """)
        knowledge_items = [
            {
                "id": str(r["id"]),
                "category": r["category"],
                "title": r["title"],
                "content": r["content"],
                "metadata": json.loads(r["metadata"]) if isinstance(r["metadata"], str) else (r["metadata"] or {}),
                "is_completed": r["is_completed"],
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            }
            for r in knowledge_rows
        ]

        milestone_rows = await conn.fetch("""
            SELECT term, label, category, start_date, notes
            FROM university_dates
            WHERE start_date >= $1
            ORDER BY start_date ASC
            LIMIT 2
        """, today)
        for mr in milestone_rows:
            upcoming_milestones.append({
                "term": mr["term"],
                "label": mr["label"],
                "category": mr["category"],
                "start_date": mr["start_date"].isoformat(),
                "notes": mr["notes"] or "",
            })

        # Determine curated reading recommendation from user preference or active reading list
        curated_reading = {
            "title": "The Myth of Sisyphus",
            "author": "Albert Camus",
            "tag": "Philosophy & Resilience",
            "note": "A powerful philosophical meditation on purpose, perseverance, and freedom in the face of demanding endeavors.",
            "is_user_choice": False,
        }
        user_pick = next((k for k in knowledge_items if k["category"] == "reading_list"), None)
        if user_pick:
            author_val = user_pick.get("metadata", {}).get("author")
            if not author_val or "selected by" in str(author_val).lower():
                if "klara" in user_pick["title"].lower():
                    author_val = "Kazuo Ishiguro"
                elif "stranger" in user_pick["title"].lower():
                    author_val = "Albert Camus"
                elif "meditations" in user_pick["title"].lower():
                    author_val = "Marcus Aurelius"
                else:
                    author_val = "Literature Pick"
            curated_reading = {
                "title": user_pick["title"],
                "author": author_val,
                "tag": "From Your Shelf",
                "note": user_pick["content"] or "A thoughtful exploration selected for your personal reading horizons.",
                "is_user_choice": True,
            }
        else:
            for k in knowledge_items:
                if k["category"] == "preference":
                    meta = k.get("metadata") or {}
                    if "curated_pick" in meta:
                        curated_reading = {**meta["curated_pick"], "is_user_choice": False}
                        break

    pending_assignments = [a for a in due_today_assignments if not a.get("is_submitted")]
    top_hw = pending_assignments[0] if pending_assignments else None
    top_hw_label = (
        f"{top_hw['course_name'] + ' ' if top_hw.get('course_name') else ''}{top_hw['title']}"
        if top_hw
        else "your top priority deliverable"
    )

    wake_h, wake_m = _parse_hhmm(profile.get("wake_time"), 8, 30)
    sleep_h_cfg, sleep_m_cfg = _parse_hhmm(profile.get("sleep_time"), 23, 30)

    # Build narrative timeline strictly from live DB events so empty/cleared calendars stay honest
    raw_timeline: List[Dict[str, Any]] = []
    if raw_today_events:
        for ev in raw_today_events:
            st = ev["st"]
            et = ev["et"]
            start_m = st.hour * 60 + st.minute
            end_m = et.hour * 60 + et.minute
            if end_m < start_m:
                end_m = 23 * 60 + 59
            cal_lower = (ev["calendar_name"] or "").lower()
            sum_lower = ev["summary"].lower()
            if ev["source"] == "life_ops_study_block" or "focus" in sum_lower or "study" in sum_lower:
                ev_type = "study"
                tag = "Deep Work"
            elif "academic" in cal_lower or re.search(r"\b[a-z]{2,5}\s*\d{3,4}\b", sum_lower):
                ev_type = "class"
                tag = "Class"
            elif any(w in sum_lower for w in ("gym", "workout", "meal", "lunch", "dinner")):
                ev_type = "health"
                tag = "Health"
            elif any(w in sum_lower for w in ("leetcode", "career", "interview", "application")):
                ev_type = "career"
                tag = "Career"
            else:
                ev_type = "routine"
                tag = ev["calendar_name"] or "Scheduled"

            raw_timeline.append({
                "id": ev["id"],
                "calendar_id": ev["calendar_id"],
                "calendar_name": ev["calendar_name"],
                "start_time": ev["start_time"],
                "end_time": ev["end_time"],
                "source": ev["source"],
                "color": ev["color"],
                "item_type": ev["item_type"],
                "assignment_id": ev["assignment_id"],
                "is_submitted": ev["is_submitted"],
                "start_m": start_m,
                "end_m": end_m,
                "time": f"{st.strftime('%I:%M %p')} – {et.strftime('%I:%M %p')}",
                "title": ev["summary"],
                "summary": ev["summary"],
                "tag": tag,
                "description": ev["description"] or f"Scheduled block ({ev['calendar_name']}).",
                "type": ev_type,
                "location": ev["location"],
            })

    narrative_timeline = []
    found_next = False
    for item in raw_timeline:
        start_m = item["start_m"]
        end_m = item["end_m"]

        if current_minutes > end_m:
            status = "completed"
            time_until = "Completed"
        elif start_m <= current_minutes <= end_m:
            status = "in_progress"
            rem = end_m - current_minutes
            time_until = f"In Progress ({rem}m remaining)"
        else:
            diff = start_m - current_minutes
            h = diff // 60
            m = diff % 60
            if not found_next:
                status = "next_up"
                found_next = True
                time_until = f"Next up in {h}h {m}m" if h > 0 else f"Next up in {m}m"
            else:
                status = "upcoming"
                time_until = f"Starts in {h}h {m}m" if h > 0 else f"Starts in {m}m"

        timeline_entry = {**item, "status": status, "time_until": time_until}
        narrative_timeline.append(timeline_entry)

    current_hour = now.hour
    name_suffix = f", {first_name}" if first_name else ""
    loc_phrase = f" in {location_label}" if location_label != "Local Workspace" else ""
    pending_count = len(pending_assignments)
    events_count = len(today_events)

    if pending_count > 0:
        priority_sentence = f"Top priority today: {top_hw_label} ({pending_count} pending deliverable{'s' if pending_count != 1 else ''})."
    else:
        priority_sentence = "Your deliverable queue is clear—ideal window to get ahead or build."

    # Dynamic greeting tailored to current time & profile
    if current_hour < 5:
        greeting_title = f"Night Owl Briefing{name_suffix}"
        greeting_lead = f"It's {now.strftime('%I:%M %p')}{loc_phrase}. {priority_sentence} Protect your rest before tomorrow's schedule begins."
        readiness_pulse = f"Late Night · {pending_count} Deliverables · {events_count} Blocks Today"
    elif current_hour < 12:
        greeting_title = f"Rise & Shine{name_suffix}"
        greeting_lead = f"Good morning! It's {now.strftime('%I:%M %p')}{loc_phrase}. {priority_sentence} You have {events_count} scheduled block{'s' if events_count != 1 else ''} today."
        readiness_pulse = f"Morning Focus · {pending_count} Deliverables · {events_count} Blocks Today"
    elif current_hour < 17:
        greeting_title = f"Midday Briefing{name_suffix}"
        greeting_lead = f"Afternoon check-in at {now.strftime('%I:%M %p')}{loc_phrase}. {priority_sentence}"
        readiness_pulse = f"Midday Track · {pending_count} Deliverables · {events_count} Blocks Today"
    else:
        greeting_title = f"Evening Priorities{name_suffix}"
        greeting_lead = f"Evening briefing at {now.strftime('%I:%M %p')}{loc_phrase}. {priority_sentence}"
        readiness_pulse = f"Evening Focus · {pending_count} Deliverables · {events_count} Blocks Today"

    possible_plans = [
        {
            "id": "plan-a",
            "title": f"Plan A: Early Sprint on {top_hw['title'][:28]} (Recommended)" if top_hw else "Plan A: Early Deep Work Sprint (Recommended)",
            "badge": "Recommended",
            "badge_type": "accent",
            "strategy": (
                f"Run a focused 3:00 PM – 5:00 PM sprint on {top_hw_label} to wrap up early and keep your evening free."
                if top_hw
                else "Lock in a focused 3:00 PM – 5:00 PM sprint on your highest-leverage project and protect a relaxed evening."
            ),
            "actions": [
                f"Focus sprint on {top_hw['title'][:40]}" if top_hw else "Start 2-hour uninterrupted deep work block",
                "Silence notifications & complete core milestone",
                "Review tomorrow's calendar & wind down early",
            ],
        },
        {
            "id": "plan-b",
            "title": "Plan B: Community Talk & Evening Submission",
            "badge": "Balanced",
            "badge_type": "surface",
            "strategy": "Attend a campus or community tech session at 5:30 PM, then finish final review and submissions at 8:00 PM.",
            "actions": [
                "Outline key deliverables before 5:00 PM",
                "Attend evening session / networking @ 5:30 PM",
                "Final polish & submit @ 8:00 PM",
            ],
        },
        {
            "id": "errands-window",
            "title": "Smart Errand Window: Grocery Run @ 1:45 PM",
            "badge": "60-Min Slot",
            "badge_type": "neutral",
            "strategy": "Clean midday window for a quick grocery restock matched against your nutrition & meal-prep targets.",
            "actions": [
                f"Restock protein staples (target: {profile.get('daily_protein_g', 155)}g/day)",
                "Pick up fresh produce & complex carbs",
                "Back at desk by 2:45 PM",
            ],
        },
    ]

    deals = [
        {
            "store": "Regional Supermarket",
            "deal": "Rotisserie Chicken & Greek Yogurt Weekly Special",
            "details": "High-protein staples discounted for weekly meal prep batches.",
            "tag": "Groceries",
            "expires": "This Week",
        },
        {
            "store": "Campus / Neighborhood Cafe",
            "deal": "Reusable Mug Drip Coffee Discount",
            "details": "Bring a travel mug for discounted hot or iced brew during morning focus.",
            "tag": "Coffee",
            "expires": "Ongoing",
        },
        {
            "store": "GitHub Student Developer Pack",
            "deal": "Free JetBrains IDE Suite + Cloud Credits",
            "details": "Complimentary academic license for JetBrains tools, domains, and cloud sandboxes.",
            "tag": "Dev Tools",
            "expires": "Active Term",
        },
        {
            "store": "Local Farmers & Bulk Co-op",
            "deal": "Seasonal Produce & Pantry Bulk Bins",
            "details": "Stock up on oats, jasmine rice, and fresh greens at lower unit cost.",
            "tag": "Nutrition",
            "expires": "Weekend",
        },
    ]

    inst_loc = institution or "Campus / Community Hub"
    nearby_events = [
        {
            "title": "Systems & AI Engineering Tech Talk",
            "location": inst_loc,
            "time": "Today · 5:30 PM – 6:45 PM",
            "perks": "Networking & Refreshments",
            "category": "Tech & Career",
            "description": "Evening technical talk on distributed systems, LLM tooling, and engineering workflows.",
        },
        {
            "title": "Local Arts & Cultural Showcase",
            "location": location_label,
            "time": "Box Office opens 10:00 AM",
            "perks": "Discounted Student / Community Entry",
            "category": "Arts & Culture",
            "description": "Live evening performance and visual exhibition for an unplugged break.",
        },
        {
            "title": "Open Lab & Study Hall Session",
            "location": sanctuary,
            "time": "Tonight · 7:00 PM – 8:30 PM",
            "perks": "Collaborative Focus",
            "category": "Academics",
            "description": "Quiet peer co-working block for algorithms, systems debugging, and problem sets.",
        },
        {
            "title": "Evening Open Rec & Fitness Hour",
            "location": "Recreation Center",
            "time": "6:00 PM – 9:00 PM",
            "perks": "Open Access",
            "category": "Recreation",
            "description": "Pickup basketball, indoor track, and strength conditioning recovery.",
        },
    ]

    # Circadian & Sleep Opportunity Intelligence anchored to profile wake_time
    wakeup_dt = datetime(today.year, today.month, today.day, wake_h, wake_m, tzinfo=user_tz)
    wake_label = wakeup_dt.strftime("%I:%M %p").lstrip("0")

    is_late_night = 0 <= current_hour < 6
    sleep_opportunity = None
    sleep_h = 8
    if is_late_night:
        sleep_delta = wakeup_dt - now
        total_minutes = max(0, int(sleep_delta.total_seconds() / 60))
        sleep_h = total_minutes // 60
        sleep_m = total_minutes % 60
        hey_prefix = f"Hey {first_name}, " if first_name else "Hey, "
        sleep_opportunity = {
            "target_wakeup": wake_label,
            "hours_remaining": round(total_minutes / 60.0, 1),
            "time_str": f"{sleep_h}h {sleep_m:02d}m",
            "is_critical": total_minutes < (6 * 60 + 45),
            "headline": "It's late. Everything will feel so much easier after real sleep.",
            "warning": (
                f"{hey_prefix}if you're aiming to wake up at {wake_label}, you're looking at about {sleep_h}h {sleep_m:02d}m of sleep right now. "
                "Pushing through tired hours slows down problem-solving. Close your laptop, get real rest, and tackle tomorrow with a clear head."
            ),
        }

    editorial_headline = (
        "It's late. Everything will feel so much easier after real sleep."
        if is_late_night and sleep_opportunity
        else "Before the day's noise begins, decide what done looks like."
        if current_hour < 12
        else "The afternoon belongs to execution, not second-guessing."
        if current_hour < 18
        else "Close the open loops so you can step into tomorrow clear-headed."
    )

    if is_late_night and sleep_opportunity:
        hey_prefix = f"Hey {first_name}, " if first_name else ""
        editorial_reflection = (
            f"{hey_prefix}it's {now.strftime('%I:%M %p')}. If you want to get up at {wake_label}, you've got {sleep_h}h left if you wind down now. "
            "Late-night debugging or writing drains focus fast—get proper sleep and tackle your priorities with fresh energy."
        )
    elif top_hw:
        editorial_reflection = (
            f"Today is {now.strftime('%A')}, {now.strftime('%I:%M %p')}. "
            f"Your top deliverable is {top_hw_label}. "
            "The trap is trying to juggle everything simultaneously—pick one clear sprint, finish the core milestone, and the rest falls into place."
        )
    else:
        editorial_reflection = (
            f"Today is {now.strftime('%A')}, {now.strftime('%I:%M %p')}. "
            "With no overdue deadlines pressing right now, use a clean focus block to build momentum on long-term projects and protect your evening rest."
        )

    editorial_do = (
        [
            f"Head to bed soon (protect {sleep_opportunity['time_str']} sleep for {wake_label})",
            "Let your mind recharge for tomorrow",
            "Schedule an afternoon deep-work sprint once rested",
            "Start with a crisp 20-minute priority outline in the morning",
        ]
        if is_late_night and sleep_opportunity
        else [
            f"Focused sprint on {top_hw['title'][:36]}" if top_hw else "One 90-minute uninterrupted deep work block",
            "Take a 20-minute outdoor walk between sessions",
            f"Hit {profile.get('daily_protein_g', 155)}g protein target across meals",
            "Review tomorrow's schedule before shutting down",
        ]
    )

    editorial_dont = (
        [
            f"Staying up past 2:30 AM before a {wake_label} wakeup",
            "Forcing complex work while exhausted",
            "Staring at late-night blue light in the dark",
            "Trading tomorrow's clarity for late-night fatigue",
        ]
        if is_late_night and sleep_opportunity
        else [
            "Context-switching every 10 minutes",
            "Checking inbox notifications during deep sprints",
            "Skipping meals while rushing deliverables",
            "Overcomplicating the first draft before testing",
        ]
    )

    dispatch_title = (
        f"{institution} Dispatch · {profile.get('term_label') or 'Current Term'}"
        if institution
        else f"Daily Dispatch · {location_label}"
    )
    dispatch_items = [
        {
            "tag": "Local Weather",
            "headline": f"{weather_data['temp_f']}°F · {weather_data['short_condition']} in {location_label}",
            "detail": weather_data["commute_advice"],
        },
        {
            "tag": "Workload Pulse",
            "headline": f"{pending_count} Active Deliverable{'s' if pending_count != 1 else ''} & {events_count} Calendar Block{'s' if events_count != 1 else ''}",
            "detail": priority_sentence,
        },
    ]
    if upcoming_milestones:
        m = upcoming_milestones[0]
        dispatch_items.append({
            "tag": "Academic Horizon",
            "headline": f"{m['label']} ({m['start_date']})",
            "detail": m["notes"] or f"Upcoming milestone for {m['term']}.",
        })
    else:
        dispatch_items.append({
            "tag": "Rhythm & Recovery",
            "headline": f"Target Wake {wake_label} · Sanctuary: {sanctuary}",
            "detail": "Keep focus blocks separated from rest blocks so evening wind-down stays protected.",
        })

    return {
        "greeting": {
            "title": greeting_title,
            "subtitle": f"{now.strftime('%A, %B %d, %Y')} · {now.strftime('%I:%M %p')} {tz_abbr} · {location_label}",
            "lead": greeting_lead,
            "readiness_pulse": readiness_pulse,
            "current_time_str": f"{now.strftime('%I:%M %p')} {tz_abbr}",
            "current_date_str": now.strftime("%A, %B %d, %Y"),
        },
        "editorial": {
            "headline": editorial_headline,
            "reflection": editorial_reflection,
            "do": editorial_do,
            "dont": editorial_dont,
            "reading": curated_reading,
            "transit": f"{location_label} · {weather_data['temp_f']}°F, {weather_data['short_condition']}",
        },
        "sleep_opportunity": sleep_opportunity,
        "knowledge_items": knowledge_items,
        "weather": weather_data,
        "narrative_schedule": narrative_timeline,
        "possible_plans": possible_plans,
        "deals": deals,
        "nearby_events": nearby_events,
        "assignments_due_soon": due_today_assignments,
        "calendar_events_today": today_events,
        "campus_dispatch": {
            "title": dispatch_title,
            "items": dispatch_items,
        },
        "curiosity": random.choice(CURIOSITY_CATALOG),
    }
