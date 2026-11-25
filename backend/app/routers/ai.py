from datetime import datetime, timezone
from zoneinfo import ZoneInfo
from pathlib import Path
import re
import logging
from fastapi import APIRouter, Query, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from ..services.model_router import route_query
from ..services.gatekeeper import propose_event_deletion
from ..services.rag_indexer import semantic_search
from ..config import settings
from ..db import get_conn

logger = logging.getLogger(__name__)

router = APIRouter()


class QueryRequest(BaseModel):
    query: str
    system_context: Optional[str] = None
    force_gemini: bool = False
    exam_mode: Optional[bool] = None


class ExamModeToggle(BaseModel):
    enabled: bool


@router.post("/query")
async def ai_query_endpoint(req: QueryRequest) -> Dict[str, Any]:
    """Execute query via Model Router with automated contextual grounding and Action Gatekeeper detection."""
    clean_query = req.query.strip()

    # 1. Intent Detection: Check for schedule removal / drop course requests
    remove_match = re.search(
        r'\b(?:remove|drop|delete|cancel|clear)\s+(?:my\s+)?([a-zA-Z]{2,6}\s*\d{3,4}|study\s+session\s*\d*|[a-zA-Z0-9\s-]+?)(?:\s+(?:from|on|in)\s+.*|\s+class|\s+course)?$',
        clean_query,
        re.IGNORECASE
    )

    if remove_match:
        target_term = remove_match.group(1).strip()
        # Clean up course code query e.g. "comm2004" -> "comm%2004", "comm 2004" -> "%comm%2004%"
        code_parts = re.split(r'(\d+)', target_term)
        clean_search = "%".join([p.strip() for p in code_parts if p.strip()])

        async with get_conn() as conn:
            matching_events = await conn.fetch("""
                SELECT id, summary, location, start_time, end_time, source, calendar_name
                FROM calendar_events
                WHERE summary ILIKE $1
                ORDER BY start_time ASC
            """, f"%{clean_search}%")

            if matching_events:
                event_ids = [str(e["id"]) for e in matching_events]
                gate_res = await propose_event_deletion(
                    event_ids=event_ids,
                    reason=f"Requested via AI Command Bar: '{clean_query}'"
                )

                if gate_res.get("status") == "pending_approval":
                    return {
                        "response": (
                            f"I identified {len(matching_events)} session(s) for **{matching_events[0]['summary']}** on your schedule.\n\n"
                            f"Per your **GEMINI.md safety guardrails**, modifying or dropping academic courses requires explicit user confirmation. "
                            f"I have staged a drop proposal in the **Conflict & Approval Queue** above.\n\n"
                            f"Review the sessions and click **Approve** to execute the removal (or Reject to cancel). 1-click Undo rollback is recorded automatically."
                        ),
                        "routed_to": "gatekeeper_guardrail",
                        "model": "rule_based_gatekeeper",
                        "latency_ms": 15,
                        "exam_mode": settings.exam_mode,
                        "action_staged": {
                            "action_id": gate_res.get("action_id"),
                            "action_type": "delete_event",
                            "type": "delete_event",
                            "summary": matching_events[0]["summary"],
                            "count": len(matching_events),
                        }
                    }
                elif gate_res.get("status") == "auto_applied":
                    return {
                        "response": f"Successfully auto-removed {len(matching_events)} session(s) of **{matching_events[0]['summary']}** (tagged as study block). 1-click Undo rollback is logged in the Autopilot feed.",
                        "routed_to": "gatekeeper_auto",
                        "model": "rule_based_gatekeeper",
                        "latency_ms": 10,
                        "exam_mode": settings.exam_mode,
                    }

    # Build light grounding context from DB for general reasoning queries
    now_ny = datetime.now(ZoneInfo("America/New_York"))
    is_early_morning = now_ny.hour < 9
    context_chunks = [
        f"Current Local System Time: {now_ny.strftime('%A, %B %d, %Y at %I:%M %p EST')}.",
        (
            f"Temporal instruction: The current time is {now_ny.strftime('%I:%M %p')}. "
            "Classes or study sessions scheduled for later hours today (e.g. 10:10 AM, 12:20 PM, 3:00 PM) "
            "have NOT happened yet—they are upcoming later today. Always accurately compare event start times against the current time."
            if is_early_morning
            else f"Current time is {now_ny.strftime('%I:%M %p')}. Compare event times against this to determine if they are in progress, upcoming, or past."
        )
    ]
    if req.system_context:
        context_chunks.append(req.system_context)

    try:
        async with get_conn() as conn:
            def to_local_str(dt):
                if not dt:
                    return ""
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(ZoneInfo("America/New_York")).strftime("%I:%M %p")

            def to_local_datetime_str(dt):
                if not dt:
                    return ""
                if dt.tzinfo is None:
                    dt = dt.replace(tzinfo=timezone.utc)
                return dt.astimezone(ZoneInfo("America/New_York")).strftime("%b %d at %I:%M %p")

            # Check if query targets a specific course
            course_match = re.search(r'\b(stat|stats|stat\s*3005|stat\s*4604|statistics|cs\s*3114|cs\s*2505|cs\s*2506|enge\s*2724|engl\s*3764|comm\s*1014|comm\s*2004)\b', clean_query, re.I)
            if course_match:
                term = course_match.group(1).lower()
                course_code = 'STAT' if ('stat' in term or 'statistic' in term) else 'CS 3114' if '3114' in term else 'CS 2505' if '2505' in term else 'CS 2506' if '2506' in term else 'ENGE 2724' if '2724' in term else 'COMM 1014' if '1014' in term else 'COMM 2004' if '2004' in term else 'ENGL 3764'
                course_hw = await conn.fetch("""
                    SELECT course_name, title, due_at, is_submitted, submission_status, is_tentative
                    FROM canvas_assignments
                    WHERE course_name ILIKE $1
                    ORDER BY 
                        CASE WHEN (due_at >= now() OR is_tentative = true) AND is_submitted = false THEN 0 ELSE 1 END,
                        due_at ASC
                    LIMIT 8
                """, f"%{course_code}%")
                if course_hw:
                    def format_hw_item(r):
                        tentative_tag = " [Tentative Schedule]" if r["is_tentative"] else ""
                        status_tag = "Submitted" if r["is_submitted"] else r["submission_status"]
                        return f"[{r['course_name']}] {r['title']}{tentative_tag} (due: {to_local_datetime_str(r['due_at'])}, status: {status_tag})"
                    
                    course_summary = "; ".join([format_hw_item(r) for r in course_hw])
                    context_chunks.append(f"Assignments & tentative deliverables for {course_code}: {course_summary}")

            # Add upcoming assignments across courses (including tentative upcoming deliverables)
            upcoming_hw = await conn.fetch("""
                SELECT course_name, title, due_at, is_tentative
                FROM canvas_assignments
                WHERE status = 'active' AND (due_at >= now() OR is_tentative = true) AND is_submitted = false
                ORDER BY due_at ASC LIMIT 10
            """)
            if upcoming_hw:
                hw_summary = "; ".join([f"[{r['course_name']}] {r['title']}{' [Tentative]' if r['is_tentative'] else ''} due {to_local_datetime_str(r['due_at'])}" for r in upcoming_hw])
                context_chunks.append(f"Upcoming Active & Tentative Assignments: {hw_summary}")

            # Add today's schedule events
            events = await conn.fetch("""
                SELECT summary, location, start_time, end_time
                FROM calendar_events
                WHERE start_time >= CURRENT_DATE AND start_time < CURRENT_DATE + INTERVAL '1 day'
                ORDER BY start_time ASC LIMIT 8
            """)
            if events:
                events_summary = "; ".join([f"{r['summary']} at {r['location'] or 'TBD'} ({to_local_str(r['start_time'])} – {to_local_str(r['end_time'])})" for r in events])
                context_chunks.append(f"Today's Schedule: {events_summary}")
    except Exception as e:
        logger.error(f"Error building AI query DB context: {e}")

    # Query RAG syllabus embeddings if academic/course/syllabus query
    if re.search(r'\b(syllabus|hw|homework|assignment|assignments|project|exam|test|grade|stat|cs|enge|engl|comm)\b', clean_query, re.I):
        try:
            rag_docs = await semantic_search(query=clean_query, limit=2, min_similarity=0.35, source_type="canvas_syllabus")
            if rag_docs:
                rag_snippets = "\n".join([f"- From {Path(r.get('source_path', '')).name}: {r['content'][:350]}" for r in rag_docs])
                context_chunks.append(f"Authoritative Course Syllabus & Policy Notes:\n{rag_snippets}")
        except Exception as e:
            logger.debug(f"Syllabus semantic search skipped: {e}")

    context_chunks.append(
        "Response formatting requirement:\n"
        "- If the user asks about a specific course (e.g. STAT 4604), provide the accurate list of upcoming and tentative assignments for that course.\n"
        "- Format EVERY assignment on its own single bullet line starting with: * [Course Code] Title (Due: Month Day at Time) or * [Course Code] Title — Details (Due: Month Day at Time).\n"
        "- Group items under clean markdown headers like '### Upcoming Assignments' or bold date headers like '**Dec 4 at 11:59 PM:**'.\n"
        "- Do not use multiple nested asterisks or raw bullet symbols. Keep each assignment clean so it can be parsed into an interactive UI card."
    )

    full_context = "\n".join(context_chunks)
    result = await route_query(
        query=req.query,
        system_context=full_context,
        force_gemini=req.force_gemini,
        exam_mode=req.exam_mode,
    )
    return result


@router.get("/logs")
async def get_query_logs(limit: int = Query(20, ge=1, le=100)) -> List[Dict[str, Any]]:
    """Get recent AI query routing telemetry."""
    async with get_conn() as conn:
        rows = await conn.fetch("""
            SELECT id, query, routed_to, model_name, response, latency_ms, exam_mode, created_at
            FROM ai_query_logs
            ORDER BY created_at DESC
            LIMIT $1
        """, limit)
        return [dict(r) for r in rows]


@router.post("/exam-mode")
async def toggle_exam_mode(toggle: ExamModeToggle) -> Dict[str, Any]:
    """Toggle Exam Mode (when enabled, local inference is bypassed for 0% CPU/GPU overhead)."""
    settings.exam_mode = toggle.enabled
    return {
        "status": "success",
        "exam_mode": settings.exam_mode,
        "message": "Exam Mode active: All queries routed to Gemini cloud free tier." if settings.exam_mode else "Exam Mode disabled: Dual model routing active."
    }
