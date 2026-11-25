"""
Persistent Assistant Chat Sessions & Message History Service.
Stores multi-turn conversations and rich interactive cards in PostgreSQL
so users can switch between saved conversations, resume after page navigation,
delete old threads, and pull prior chat context into new turns.
"""
import json
import re
import uuid
from typing import Any, Dict, List, Optional

import asyncpg

from ..db import get_conn


def _strip_markdown_preview(text: str) -> str:
    """Strip common markdown markers from a 1-line sidebar snippet."""
    if not text:
        return ""
    cleaned = re.sub(r"^\s{0,3}#{1,6}\s+", "", text, flags=re.MULTILINE)
    cleaned = re.sub(r"^\s*[-*•]\s+", "", cleaned, flags=re.MULTILINE)
    cleaned = cleaned.replace("**", "").replace("__", "").replace("`", "")
    cleaned = re.sub(r"(?<!\w)\*|\*(?!\w)", "", cleaned)
    return " ".join(cleaned.replace("\n", " ").split())


def derive_session_title(first_message: str) -> str:
    """Create a concise 2-7 word title (max 56 chars) from the opening prompt."""
    clean = " ".join((first_message or "").strip().split())
    if not clean:
        return "New Conversation"
    if len(clean) <= 52:
        return clean
    words = clean.split(" ")
    out = ""
    for w in words[:7]:
        cand = f"{out} {w}".strip()
        if len(cand) > 52:
            break
        out = cand
    if not out:
        out = clean[:52]
    return f"{out}..." if len(clean) > len(out) else out


def _parse_payload(val: Any) -> Dict[str, Any]:
    if isinstance(val, dict):
        return val
    if isinstance(val, str):
        try:
            parsed = json.loads(val)
            return parsed if isinstance(parsed, dict) else {}
        except Exception:
            return {}
    return {}


async def list_sessions(limit: int = 50) -> List[Dict[str, Any]]:
    """List saved assistant chat sessions ordered by most recently updated."""
    async with get_conn() as conn:
        rows = await conn.fetch(
            """
            SELECT
                s.id,
                s.title,
                s.created_at,
                s.updated_at,
                COUNT(m.id)::int AS message_count,
                (
                    SELECT m2.content
                    FROM assistant_messages m2
                    WHERE m2.session_id = s.id
                    ORDER BY m2.created_at DESC
                    LIMIT 1
                ) AS last_message
            FROM assistant_sessions s
            LEFT JOIN assistant_messages m ON m.session_id = s.id
            GROUP BY s.id
            ORDER BY s.updated_at DESC
            LIMIT $1
            """,
            limit,
        )

    out: List[Dict[str, Any]] = []
    for r in rows:
        last_msg = _strip_markdown_preview(r["last_message"] or "")
        preview = last_msg[:110] + ("..." if len(last_msg) > 110 else "")
        out.append({
            "id": str(r["id"]),
            "title": r["title"],
            "message_count": int(r["message_count"] or 0),
            "preview": preview,
            "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            "updated_at": r["updated_at"].isoformat() if r["updated_at"] else None,
        })
    return out


async def create_session(title: Optional[str] = None) -> Dict[str, Any]:
    """Create a new persistent assistant chat session."""
    clean_title = derive_session_title(title) if title and title.strip() else "New Conversation"
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            INSERT INTO assistant_sessions (title)
            VALUES ($1)
            RETURNING id, title, created_at, updated_at
            """,
            clean_title,
        )
    return {
        "id": str(row["id"]),
        "title": row["title"],
        "message_count": 0,
        "preview": "",
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


async def session_exists(session_id: str) -> Optional[Dict[str, Any]]:
    try:
        uid = uuid.UUID(str(session_id))
    except Exception:
        return None
    async with get_conn() as conn:
        row = await conn.fetchrow(
            "SELECT id, title, created_at, updated_at FROM assistant_sessions WHERE id = $1",
            uid,
        )
        if not row:
            return None
        return {
            "id": str(row["id"]),
            "title": row["title"],
            "created_at": row["created_at"].isoformat() if row["created_at"] else None,
            "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
        }


async def get_session_with_messages(session_id: str) -> Optional[Dict[str, Any]]:
    """Load a chat session and all ordered messages + saved interactive card payloads."""
    try:
        uid = uuid.UUID(str(session_id))
    except Exception:
        return None

    async with get_conn() as conn:
        s_row = await conn.fetchrow(
            "SELECT id, title, created_at, updated_at FROM assistant_sessions WHERE id = $1",
            uid,
        )
        if not s_row:
            return None

        m_rows = await conn.fetch(
            """
            SELECT id, role, content, payload, created_at
            FROM assistant_messages
            WHERE session_id = $1
            ORDER BY created_at ASC
            """,
            uid,
        )

    messages: List[Dict[str, Any]] = []
    for m in m_rows:
        messages.append({
            "id": str(m["id"]),
            "role": m["role"],
            "content": m["content"],
            "payload": _parse_payload(m["payload"]),
            "created_at": m["created_at"].isoformat() if m["created_at"] else None,
        })

    return {
        "id": str(s_row["id"]),
        "title": s_row["title"],
        "created_at": s_row["created_at"].isoformat() if s_row["created_at"] else None,
        "updated_at": s_row["updated_at"].isoformat() if s_row["updated_at"] else None,
        "messages": messages,
    }


async def rename_session(session_id: str, title: str) -> Optional[Dict[str, Any]]:
    try:
        uid = uuid.UUID(str(session_id))
    except Exception:
        return None
    clean_title = (title or "").strip()[:80] or "Conversation"
    async with get_conn() as conn:
        row = await conn.fetchrow(
            """
            UPDATE assistant_sessions
            SET title = $1, updated_at = now()
            WHERE id = $2
            RETURNING id, title, created_at, updated_at
            """,
            clean_title,
            uid,
        )
    if not row:
        return None
    return {
        "id": str(row["id"]),
        "title": row["title"],
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
        "updated_at": row["updated_at"].isoformat() if row["updated_at"] else None,
    }


async def delete_session(session_id: str) -> bool:
    try:
        uid = uuid.UUID(str(session_id))
    except Exception:
        return False
    async with get_conn() as conn:
        res = await conn.execute("DELETE FROM assistant_sessions WHERE id = $1", uid)
    try:
        return int(res.split()[-1]) > 0
    except Exception:
        return False


async def append_message(
    session_id: str,
    role: str,
    content: str,
    payload: Optional[Dict[str, Any]] = None,
) -> Optional[Dict[str, Any]]:
    """Append a message to a session and auto-title the thread on its first user turn."""
    uid = uuid.UUID(str(session_id))
    payload_json = json.dumps(payload or {}, default=str)
    try:
        async with get_conn() as conn:
            row = await conn.fetchrow(
                """
                INSERT INTO assistant_messages (session_id, role, content, payload)
                VALUES ($1, $2, $3, $4::jsonb)
                RETURNING id, role, content, payload, created_at
                """,
                uid,
                role,
                content,
                payload_json,
            )
            if role == "user":
                auto_title = derive_session_title(content)
                await conn.execute(
                    """
                    UPDATE assistant_sessions
                    SET updated_at = now(),
                        title = CASE WHEN title = 'New Conversation' THEN $1 ELSE title END
                    WHERE id = $2
                    """,
                    auto_title,
                    uid,
                )
            else:
                await conn.execute(
                    "UPDATE assistant_sessions SET updated_at = now() WHERE id = $1",
                    uid,
                )
            s_row = await conn.fetchrow("SELECT title FROM assistant_sessions WHERE id = $1", uid)
    except asyncpg.ForeignKeyViolationError:
        # Session was deleted mid-flight before message persistence completed.
        return None

    return {
        "id": str(row["id"]),
        "session_id": str(uid),
        "session_title": s_row["title"] if s_row else "Conversation",
        "role": row["role"],
        "content": row["content"],
        "payload": _parse_payload(row["payload"]),
        "created_at": row["created_at"].isoformat() if row["created_at"] else None,
    }


async def get_recent_cross_session_context(
    exclude_session_id: Optional[str] = None,
    limit_turns: int = 6,
) -> List[Dict[str, str]]:
    """Fetch recent messages from OTHER saved sessions so the assistant recalls prior chat context."""
    async with get_conn() as conn:
        if exclude_session_id:
            try:
                ex_uid = uuid.UUID(str(exclude_session_id))
                rows = await conn.fetch(
                    """
                    SELECT s.title AS session_title, m.role, m.content
                    FROM assistant_messages m
                    JOIN assistant_sessions s ON s.id = m.session_id
                    WHERE m.session_id <> $1
                    ORDER BY m.created_at DESC
                    LIMIT $2
                    """,
                    ex_uid,
                    limit_turns,
                )
            except Exception:
                rows = []
        else:
            rows = await conn.fetch(
                """
                SELECT s.title AS session_title, m.role, m.content
                FROM assistant_messages m
                JOIN assistant_sessions s ON s.id = m.session_id
                ORDER BY m.created_at DESC
                LIMIT $1
                """,
                limit_turns,
            )

    items = [
        {
            "session_title": r["session_title"] or "Previous Chat",
            "role": r["role"],
            "content": (r["content"] or "")[:240],
        }
        for r in reversed(rows)
    ]
    return items
