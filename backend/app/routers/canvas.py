import json
import re
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from ..db import get_conn
from ..services.canvas_pw import is_session_valid, launch_login_flow, deep_fetch_assignment
from ..services.assignment_analyzer import analyze_assignment, analyze_assignments_batch
from ..jobs.canvas_ics import poll_canvas_ics

router = APIRouter()


class BatchAnalyzeRequest(BaseModel):
    limit: int = 8
    force: bool = False


def _serialize_assignment_row(r: Any) -> Dict[str, Any]:
    item = dict(r)
    item["raw_title"] = item["title"]
    item["title"] = clean_assignment_title(item["title"])
    item["item_type"] = "task"
    raw_sections = item.get("ai_sections")
    if isinstance(raw_sections, str):
        try:
            item["ai_sections"] = json.loads(raw_sections)
        except Exception:
            item["ai_sections"] = None
    return item


def clean_assignment_title(raw_title: str) -> str:
    """Strip Canvas section/CRN tags e.g. (CS_3114_91741_202609) [CS_3114_83568_202609] and course brackets [CS 2506]."""
    if not raw_title:
        return ""
    cleaned = re.sub(r'\s*(\([A-Za-z0-9_\s-]+\)|\[[^\]]+\])\s*$', '', raw_title)
    cleaned = re.sub(r'\s*(\([A-Za-z0-9_\s-]+\)|\[[A-Za-z0-9_\s-]+\])', '', cleaned)
    return cleaned.strip()


@router.get("/assignments")
async def list_assignments(
    status: str = Query("active", description="Filter by status: active, completed, deleted, all"),
    course: Optional[str] = Query(None, description="Filter by course name (e.g. 'CS 3114')"),
    limit: int = Query(100, ge=1, le=500),
) -> List[Dict[str, Any]]:
    """List Canvas assignments as structured tasks ordered by upcoming due dates."""
    async with get_conn() as conn:
        conditions = []
        params = []
        param_idx = 1

        if status != "all":
            conditions.append(f"status = ${param_idx}")
            params.append(status)
            param_idx += 1

        if course:
            conditions.append(f"course_name ILIKE ${param_idx}")
            params.append(f"%{course}%")
            param_idx += 1

        where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
        query = f"""
            SELECT id, canvas_uid, course_name, title, description,
                   due_at, previous_due_at, status, deep_fetched, is_tentative,
                   is_submitted, submission_status, submitted_at,
                   ai_summary, ai_sections, ai_analyzed_at, ai_model, syllabus_notes,
                   created_at, updated_at
            FROM canvas_assignments
            {where_clause}
            ORDER BY due_at ASC NULLS LAST
            LIMIT ${param_idx}
        """
        params.append(limit)

        rows = await conn.fetch(query, *params)
        return [_serialize_assignment_row(r) for r in rows]


@router.post("/assignments/{assignment_id}/toggle-submit")
async def toggle_assignment_submission(assignment_id: str) -> Dict[str, Any]:
    """Toggle submission status for an assignment task."""
    async with get_conn() as conn:
        row = await conn.fetchrow("SELECT id, is_submitted FROM canvas_assignments WHERE id = $1", assignment_id)
        if not row:
            raise HTTPException(status_code=404, detail="Assignment not found")
        new_submitted = not row["is_submitted"]
        new_status = "submitted" if new_submitted else "unsubmitted"
        updated = await conn.fetchrow("""
            UPDATE canvas_assignments
            SET is_submitted = $1,
                submission_status = $2,
                submitted_at = CASE WHEN $1 THEN now() ELSE NULL END,
                updated_at = now()
            WHERE id = $3
            RETURNING id, canvas_uid, course_name, title, description, due_at, previous_due_at,
                      status, deep_fetched, is_tentative, is_submitted, submission_status, submitted_at,
                      ai_summary, ai_sections, ai_analyzed_at, ai_model, syllabus_notes, created_at, updated_at
        """, new_submitted, new_status, assignment_id)
        return _serialize_assignment_row(updated)


@router.post("/assignments/{assignment_id}/analyze")
async def analyze_single_assignment(
    assignment_id: str,
    force: bool = Query(False),
) -> Dict[str, Any]:
    """Analyze & structure an assignment's spec into summary, general, deliverables, rubric, and policies."""
    res = await analyze_assignment(assignment_id, force=force)
    if res.get("status") == "not_found":
        raise HTTPException(status_code=404, detail="Assignment not found")
    return res


@router.post("/assignments/analyze-batch")
async def analyze_batch_assignments(payload: BatchAnalyzeRequest = BatchAnalyzeRequest()) -> Dict[str, Any]:
    """Batch-analyze upcoming unsubmitted assignment tasks with Free-Tier rate-limiting."""
    return await analyze_assignments_batch(limit=payload.limit, force=payload.force)


@router.get("/session-status")
async def get_session_status() -> Dict[str, Any]:
    """Check if Playwright persistent Canvas SSO session is valid."""
    valid = await is_session_valid()
    return {
        "session_valid": valid,
        "mode": "playwright_deep_fetch" if valid else "ics_feed_only",
    }


@router.post("/refresh-session")
async def trigger_refresh_session() -> Dict[str, Any]:
    """Launch headed Chromium login window for Canvas SSO / 2FA authentication."""
    result = await launch_login_flow()
    if result.get("status") == "error":
        raise HTTPException(status_code=500, detail=result.get("message"))
    return result


@router.post("/poll-now")
async def trigger_poll_now() -> Dict[str, Any]:
    """Manually poll the private Canvas .ics feed and reconcile changes."""
    result = await poll_canvas_ics()
    return result


@router.post("/deep-fetch/{assignment_id}")
async def trigger_deep_fetch(assignment_id: str) -> Dict[str, Any]:
    """Deep fetch rubric and details for a specific assignment via Playwright."""
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT id, canvas_uid, title FROM canvas_assignments WHERE id = $1", assignment_id
        )
        if not row:
            raise HTTPException(status_code=404, detail="Assignment not found")

    valid = await is_session_valid()
    if not valid:
        return {
            "status": "skipped",
            "message": "Playwright session not valid. Please log in via /api/canvas/refresh-session first.",
        }

    return {"status": "queued", "assignment_id": assignment_id}
