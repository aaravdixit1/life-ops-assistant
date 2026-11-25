"""
Gemini + Local Heuristic Assignment Analyzer & Task Structurer
Separates Canvas assignment descriptions into structured sections:
- summary
- estimated_effort
- general
- deliverables
- rubric
- resources_and_policies

Enforces strict Free-Tier rate limits, content-hash caching, and graceful fallback
to a deterministic local parser when GEMINI_API_KEY is missing or rate-limited.
"""
import asyncio
import hashlib
import html
import json
import logging
import re
import time
from collections import deque
from typing import Any, Deque, Dict, List, Optional, Tuple

from google import genai
from google.genai import types

from ..config import settings
from ..db import get_conn
from .profile_service import get_effective_gemini_api_key

logger = logging.getLogger(__name__)

# Free-tier rate limiters (module-level)
_GEMINI_SEMAPHORE = asyncio.Semaphore(2)
_RATE_LOCK = asyncio.Lock()
_REQUEST_TIMESTAMPS: Deque[float] = deque()
_MAX_RPM = 10
_MIN_INTERVAL_SEC = 1.5
_LAST_REQUEST_AT = 0.0


def compute_content_hash(title: str, description: str) -> str:
    payload = f"{(title or '').strip()}\n{(description or '').strip()}"
    return hashlib.sha256(payload.encode("utf-8", errors="ignore")).hexdigest()


def clean_html_and_entities(raw_text: str) -> str:
    """Convert raw Canvas/Google Calendar HTML snippets into clean readable text/markdown."""
    if not raw_text:
        return ""

    text = raw_text.replace("\r\n", "\n").replace("\r", "\n")

    # Convert <a href="url"...>label</a> into markdown links
    def _replace_anchor(match: re.Match) -> str:
        href = (match.group(1) or "").strip()
        inner = re.sub(r"<[^>]+>", "", match.group(2) or "").strip()
        if href.startswith(("http://", "https://", "mailto:")):
            label = html.unescape(inner) or href
            return f"[{label}]({href})"
        return html.unescape(inner)

    text = re.sub(
        r'<a\b[^>]*href=["\']([^"\']+)["\'][^>]*>(.*?)</a>',
        _replace_anchor,
        text,
        flags=re.IGNORECASE | re.DOTALL,
    )
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    text = re.sub(r"</(?:p|div|tr|h[1-6])>", "\n\n", text, flags=re.IGNORECASE)
    text = re.sub(r"<li[^>]*>", "\n- ", text, flags=re.IGNORECASE)
    text = re.sub(r"</li>", "", text, flags=re.IGNORECASE)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text).replace("\xa0", " ")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def heuristic_parse_assignment(title: str, course_name: Optional[str], description: str) -> Dict[str, Any]:
    """Deterministic fallback parser when Gemini is unavailable or description is short."""
    cleaned = clean_html_and_entities(description)
    clean_title = re.sub(r"\s*(\([A-Za-z0-9_\s-]+\)|\[[^\]]+\])\s*", " ", title or "").strip()
    course_prefix = f"{course_name}: " if course_name and course_name.lower() not in clean_title.lower() else ""

    if not cleaned:
        return {
            "summary": f"{course_prefix}{clean_title}. No extended description was provided in the Canvas feed.",
            "estimated_effort": "TBD",
            "general": f"Tracked assignment task for **{course_name or 'Coursework'}**.",
            "deliverables": ["Submit required deliverable on Canvas before the due date."],
            "rubric": [],
            "resources_and_policies": [],
        }

    lines = cleaned.split("\n")
    raw_sections: List[Tuple[str, List[str]]] = []
    curr_heading = "Overview"
    curr_lines: List[str] = []

    i = 0
    while i < len(lines):
        line = lines[i]
        trimmed = line.strip()
        is_divider = bool(re.match(r"^[-*=]{3,}$", trimmed))
        if is_divider and i + 1 < len(lines) and lines[i + 1].strip():
            candidate = lines[i + 1].strip()
            has_bottom = i + 2 < len(lines) and bool(re.match(r"^[-*=]{3,}$", lines[i + 2].strip()))
            if has_bottom and 2 < len(candidate) < 80:
                if curr_lines:
                    raw_sections.append((curr_heading, curr_lines))
                curr_heading = candidate.rstrip(":")
                curr_lines = []
                i += 3
                continue
        if re.match(r"^#{1,4}\s+", trimmed):
            if curr_lines:
                raw_sections.append((curr_heading, curr_lines))
            curr_heading = re.sub(r"^#+\s*", "", trimmed).rstrip(":")
            curr_lines = []
            i += 1
            continue
        if re.match(r"^(?:Overview|Assignment|Deliverables?|Submission|Submit|Grading|Rubric|Points|Evaluation|Policy|Policies|Resources|Starter Code|Requirements?|Warnings?|Common Traps?)\s*:?\s*$", trimmed, re.IGNORECASE):
            if curr_lines:
                raw_sections.append((curr_heading, curr_lines))
            curr_heading = trimmed.rstrip(":")
            curr_lines = []
            i += 1
            continue
        curr_lines.append(line)
        i += 1

    if curr_lines:
        raw_sections.append((curr_heading, curr_lines))

    general_parts: List[str] = []
    deliverables: List[str] = []
    rubric: List[str] = []
    policies: List[str] = []

    def _to_bullets(sec_lines: List[str], limit: int = 8) -> List[str]:
        items: List[str] = []
        for raw_line in sec_lines:
            s = raw_line.strip()
            if not s or re.match(r"^[-*=]{3,}$", s):
                continue
            s = re.sub(r"^[-*•\d.)]+\s+", "", s).strip()
            if len(s) > 4:
                items.append(s[:260])
            if len(items) >= limit:
                break
        return items

    for heading, sec_lines in raw_sections:
        body = "\n".join(sec_lines).strip()
        if not body:
            continue
        h = heading.lower()
        if any(k in h for k in ("submit", "deliver", "file", "upload", "turn in", "template", "artifact", "requirement")):
            deliverables.extend(_to_bullets(sec_lines))
        elif any(k in h for k in ("rubric", "grad", "point", "weight", "score", "evaluat")):
            rubric.extend(_to_bullets(sec_lines))
        elif any(k in h for k in ("policy", "policies", "trap", "warning", "partner", "integrity", "ai ", "late", "resource", "note", "build", "starter")):
            policies.extend(_to_bullets(sec_lines))
        else:
            general_parts.append(f"**{heading}**\n{body}" if heading != "Overview" else body)

    # Scan for inline point/file hints if buckets are empty
    if not deliverables:
        for line in lines:
            if any(k in line.lower() for k in ("submit", "upload", "submission", ".pdf", ".docx", ".zip", ".tar", ".py", ".java", ".cpp")):
                s = re.sub(r"^[-*•]\s+", "", line.strip())
                if 8 <= len(s) <= 240 and s not in deliverables:
                    deliverables.append(s)
                if len(deliverables) >= 5:
                    break

    if not rubric:
        for line in lines:
            if re.search(r"\b\d+\s*(?:pts?|points?|%)\b", line, re.IGNORECASE):
                s = re.sub(r"^[-*•]\s+", "", line.strip())
                if 6 <= len(s) <= 220 and s not in rubric:
                    rubric.append(s)
                if len(rubric) >= 6:
                    break

    general_text = "\n\n".join(general_parts).strip()
    if not general_text:
        general_text = cleaned[:1800]

    # Build concise 1-2 sentence summary from general text
    plain_for_summary = re.sub(r"\*\*([^*]+)\*\*", r"\1", general_text)
    plain_for_summary = re.sub(r"\s+", " ", plain_for_summary).strip()
    sentences = re.split(r"(?<=[.!?])\s+", plain_for_summary)
    summary_text = " ".join(sentences[:2]).strip()
    if len(summary_text) > 260:
        summary_text = summary_text[:257].rstrip() + "..."
    if not summary_text:
        summary_text = f"{course_prefix}{clean_title}."

    # Heuristic effort estimate from length / project keywords
    lower_all = f"{clean_title} {cleaned}".lower()
    if "project" in lower_all or len(cleaned) > 4500:
        effort = "6–12 hours"
    elif "report" in lower_all or "paper" in lower_all or len(cleaned) > 1800:
        effort = "2–5 hours"
    else:
        effort = "30–90 mins"

    return {
        "summary": summary_text,
        "estimated_effort": effort,
        "general": general_text[:4000],
        "deliverables": deliverables[:10],
        "rubric": rubric[:10],
        "resources_and_policies": policies[:10],
    }


async def _wait_for_rate_slot() -> None:
    """Enforce sliding-window RPM cap and minimum spacing between Gemini requests."""
    global _LAST_REQUEST_AT
    while True:
        wait_for = 0.0
        async with _RATE_LOCK:
            now = time.monotonic()
            while _REQUEST_TIMESTAMPS and now - _REQUEST_TIMESTAMPS[0] >= 60.0:
                _REQUEST_TIMESTAMPS.popleft()

            since_last = now - _LAST_REQUEST_AT
            if since_last < _MIN_INTERVAL_SEC:
                wait_for = _MIN_INTERVAL_SEC - since_last
            elif len(_REQUEST_TIMESTAMPS) >= _MAX_RPM:
                wait_for = max(0.25, 60.0 - (now - _REQUEST_TIMESTAMPS[0]) + 0.1)
            else:
                _REQUEST_TIMESTAMPS.append(now)
                _LAST_REQUEST_AT = now
                return
        await asyncio.sleep(wait_for)


def _call_gemini_sync(api_key: str, model_name: str, prompt: str) -> str:
    client = genai.Client(api_key=api_key)
    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
        config=types.GenerateContentConfig(
            temperature=0.2,
            max_output_tokens=1800,
            response_mime_type="application/json",
        ),
    )
    return response.text or ""


def _parse_gemini_json(raw_text: str) -> Optional[Dict[str, Any]]:
    text = (raw_text or "").strip()
    if not text:
        return None
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        data = json.loads(text)
    except Exception:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if not match:
            return None
        try:
            data = json.loads(match.group(0))
        except Exception:
            return None

    if not isinstance(data, dict):
        return None

    def _as_str_list(val: Any) -> List[str]:
        if isinstance(val, list):
            return [str(x).strip() for x in val if str(x).strip()]
        if isinstance(val, str) and val.strip():
            return [line.strip("-• ").strip() for line in val.splitlines() if line.strip()]
        return []

    summary = str(data.get("summary") or "").strip()
    general = str(data.get("general") or "").strip()
    if not summary and not general:
        return None

    return {
        "summary": summary or general[:240],
        "estimated_effort": str(data.get("estimated_effort") or "1–3 hours").strip(),
        "general": general or summary,
        "deliverables": _as_str_list(data.get("deliverables")),
        "rubric": _as_str_list(data.get("rubric")),
        "resources_and_policies": _as_str_list(data.get("resources_and_policies")),
    }


def _normalize_sections_field(raw: Any) -> Optional[Dict[str, Any]]:
    if raw is None:
        return None
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
        except Exception:
            return None
    return None


async def analyze_assignment(assignment_id: str, force: bool = False) -> Dict[str, Any]:
    """
    Analyze a single Canvas assignment into structured task sections + summary.
    Uses content-hash caching, rate-limited Gemini API calls, and deterministic local fallback.
    """
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, course_name, title, description, ai_summary, ai_sections,
                   ai_content_hash, ai_analyzed_at, ai_model
            FROM canvas_assignments
            WHERE id = $1
            """,
            assignment_id,
        )
        if not row:
            return {"status": "not_found", "message": "Assignment not found"}

        title = row["title"] or ""
        course_name = row["course_name"]
        description = row["description"] or ""
        content_hash = compute_content_hash(title, description)
        existing_sections = _normalize_sections_field(row["ai_sections"])

        # Return cached result when content hasn't changed and caller didn't force refresh
        if (
            not force
            and row["ai_content_hash"] == content_hash
            and existing_sections
            and row["ai_summary"]
        ):
            return {
                "status": "success",
                "cached": True,
                "rate_limited": False,
                "assignment_id": str(row["id"]),
                "ai_summary": row["ai_summary"],
                "ai_sections": existing_sections,
                "ai_model": row["ai_model"] or "cached",
                "ai_analyzed_at": row["ai_analyzed_at"].isoformat() if row["ai_analyzed_at"] else None,
            }

    cleaned_desc = clean_html_and_entities(description)
    api_key, key_source = await get_effective_gemini_api_key()
    use_gemini = (
        settings.cloud_llm_enabled
        and bool(api_key)
        and len(cleaned_desc) >= 40
    )

    sections: Optional[Dict[str, Any]] = None
    model_used = "heuristic_local"
    rate_limited = False
    fallback_reason: Optional[str] = None

    if use_gemini and api_key:
        prompt = (
            "You are organizing a university assignment into clean, actionable study-task sections.\n"
            "Return STRICT JSON with exactly these keys:\n"
            '{\n'
            '  "summary": "2-3 concise sentences summarizing the core goal, deliverable, and critical constraints.",\n'
            '  "estimated_effort": "short string like 1-2 hours or 6-10 hours",\n'
            '  "general": "clean markdown overview of objectives, context, and technical requirements",\n'
            '  "deliverables": ["list of exact files, forms, evaluations, or submission artifacts required"],\n'
            '  "rubric": ["list of grading weights, point breakdowns, or evaluation criteria"],\n'
            '  "resources_and_policies": ["list of late/grace policies, partner rules, honor code, tools, or starter links"]\n'
            '}\n\n'
            f"Course: {course_name or 'Coursework'}\n"
            f"Title: {title}\n\n"
            f"Assignment Specification:\n{cleaned_desc[:10000]}"
        )

        models_to_try = [settings.gemini_model, "gemini-2.5-flash-lite", "gemini-2.0-flash"]
        for candidate_model in models_to_try:
            if not candidate_model:
                continue
            try:
                async with _GEMINI_SEMAPHORE:
                    await _wait_for_rate_slot()
                    raw_out = await asyncio.to_thread(_call_gemini_sync, api_key, candidate_model, prompt)
                parsed = _parse_gemini_json(raw_out)
                if parsed:
                    sections = parsed
                    model_used = candidate_model
                    break
            except Exception as e:
                err_str = str(e)
                if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str or "quota" in err_str.lower():
                    rate_limited = True
                    fallback_reason = (
                        "Gemini Free Tier rate limit reached. Saved local structured breakdown instead; "
                        "retry shortly or add your own Gemini API key in Setup."
                    )
                    logger.warning(f"Gemini rate limit during assignment analysis ({candidate_model}): {e}")
                    break
                logger.warning(f"Gemini model {candidate_model} failed during assignment analysis: {e}")
                fallback_reason = f"Gemini error: {err_str[:140]}"

    # If Gemini was rate-limited and we already have a cached Gemini result, keep it
    if rate_limited and existing_sections and (row["ai_model"] or "").startswith("gemini"):
        return {
            "status": "rate_limited",
            "cached": True,
            "rate_limited": True,
            "assignment_id": str(row["id"]),
            "ai_summary": row["ai_summary"],
            "ai_sections": existing_sections,
            "ai_model": row["ai_model"],
            "ai_analyzed_at": row["ai_analyzed_at"].isoformat() if row["ai_analyzed_at"] else None,
            "message": fallback_reason,
        }

    if sections is None:
        sections = heuristic_parse_assignment(title, course_name, description)
        model_used = "heuristic_local"
        if not api_key and len(cleaned_desc) >= 40:
            fallback_reason = (
                "No Gemini API key configured — structured using local parser. "
                "Add a free Gemini API key in Setup for AI summaries."
            )

    summary_text = sections.get("summary") or ""

    async with get_conn() as conn:
        updated = await conn.fetchrow(
            """
            UPDATE canvas_assignments
            SET ai_summary = $2,
                ai_sections = $3::jsonb,
                ai_content_hash = $4,
                ai_model = $5,
                ai_analyzed_at = now(),
                updated_at = now()
            WHERE id = $1
            RETURNING ai_analyzed_at
            """,
            assignment_id,
            summary_text,
            json.dumps(sections),
            content_hash,
            model_used,
        )

    return {
        "status": "rate_limited" if rate_limited else "success",
        "cached": False,
        "rate_limited": rate_limited,
        "key_source": key_source,
        "assignment_id": assignment_id,
        "ai_summary": summary_text,
        "ai_sections": sections,
        "ai_model": model_used,
        "ai_analyzed_at": updated["ai_analyzed_at"].isoformat() if updated and updated["ai_analyzed_at"] else None,
        "message": fallback_reason,
    }


async def analyze_assignments_batch(limit: int = 8, force: bool = False) -> Dict[str, Any]:
    """
    Batch-analyze active assignments (prioritizing upcoming & unsubmitted ones).
    Respects Free Tier rate limits (caps at 15 per call and stops early on 429).
    """
    safe_limit = max(1, min(int(limit or 8), 15))
    api_key, key_source = await get_effective_gemini_api_key()

    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT id, title, description, ai_content_hash, ai_model, ai_sections
            FROM canvas_assignments
            WHERE status = 'active'
            ORDER BY
                is_submitted ASC,
                CASE WHEN due_at >= now() - interval '2 days' THEN 0 ELSE 1 END ASC,
                due_at ASC NULLS LAST
            LIMIT 100
            """
        )

    candidates: List[str] = []
    for r in rows:
        content_hash = compute_content_hash(r["title"] or "", r["description"] or "")
        sections = _normalize_sections_field(r["ai_sections"])
        has_gemini = (r["ai_model"] or "").startswith("gemini")
        needs_upgrade = bool(api_key) and not has_gemini and len(clean_html_and_entities(r["description"] or "")) >= 40
        if force or r["ai_content_hash"] != content_hash or not sections or needs_upgrade:
            candidates.append(str(r["id"]))
        if len(candidates) >= safe_limit:
            break

    analyzed_count = 0
    gemini_count = 0
    local_count = 0
    rate_limited = False
    results: List[Dict[str, Any]] = []

    for aid in candidates:
        res = await analyze_assignment(aid, force=force)
        results.append({
            "assignment_id": aid,
            "ai_model": res.get("ai_model"),
            "ai_summary": res.get("ai_summary"),
            "cached": res.get("cached", False),
            "rate_limited": res.get("rate_limited", False),
        })
        if res.get("status") in ("success", "rate_limited"):
            analyzed_count += 1
            if str(res.get("ai_model") or "").startswith("gemini"):
                gemini_count += 1
            else:
                local_count += 1
        if res.get("rate_limited"):
            rate_limited = True
            break

    remaining_est = max(0, len(rows) - analyzed_count)
    msg = (
        f"Structured {analyzed_count} assignment task(s) "
        f"({gemini_count} via Gemini, {local_count} via local parser)."
    )
    if rate_limited:
        msg += " Stopped early due to Gemini Free Tier rate limit — remaining tasks can be analyzed shortly."
    elif not api_key:
        msg += " Add a free Gemini API key in Setup for richer AI summaries."

    return {
        "status": "rate_limited" if rate_limited else "success",
        "analyzed_count": analyzed_count,
        "gemini_count": gemini_count,
        "local_count": local_count,
        "rate_limited": rate_limited,
        "key_source": key_source,
        "remaining_candidates": remaining_est,
        "message": msg,
        "results": results,
    }
