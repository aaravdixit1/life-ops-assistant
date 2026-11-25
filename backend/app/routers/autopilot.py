import json
import uuid
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Any
from ..db import get_conn
import logging

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/logs")
async def list_autopilot_logs(limit: int = Query(50, ge=1, le=200)) -> List[Dict[str, Any]]:
    """Fetch autopilot modification logs with rollback payloads."""
    async with get_conn() as conn:
        rows = await conn.fetch("""
            SELECT id, action_type, description, affected_ids, rollback_payload, undone, created_at
            FROM autopilot_logs
            ORDER BY created_at DESC
            LIMIT $1
        """, limit)
        return [dict(r) for r in rows]


@router.post("/undo/{log_id}")
async def undo_autopilot_action(log_id: str) -> Dict[str, Any]:
    """Execute 1-click rollback of an automated schedule modification."""
    async with get_conn() as conn:
        row = await conn.fetchrow("""
            SELECT id, action_type, description, affected_ids, rollback_payload, undone
            FROM autopilot_logs
            WHERE id = $1
        """, log_id)

        if not row:
            raise HTTPException(status_code=404, detail="Autopilot log entry not found")
        if row["undone"]:
            raise HTTPException(status_code=400, detail="Action has already been undone")

        payload = row["rollback_payload"]
        if isinstance(payload, str):
            payload = json.loads(payload)

        # Restore affected records
        for event_id_str, prev_state in payload.items():
            if prev_state.get("_restorable_event"):
                # Re-insert the deleted event
                start_val = prev_state.get("start_time")
                end_val = prev_state.get("end_time")
                if isinstance(start_val, str):
                    start_val = datetime.fromisoformat(start_val)
                if isinstance(end_val, str):
                    end_val = datetime.fromisoformat(end_val)

                await conn.execute("""
                    INSERT INTO calendar_events (
                        id, calendar_id, calendar_name, summary, description, location, start_time, end_time, source, color
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
                    ON CONFLICT (id) DO UPDATE
                    SET summary = EXCLUDED.summary, start_time = EXCLUDED.start_time, end_time = EXCLUDED.end_time
                """,
                    uuid.UUID(prev_state["id"]),
                    prev_state.get("calendar_id", "academics"),
                    prev_state.get("calendar_name", "Academics"),
                    prev_state["summary"],
                    prev_state.get("description"),
                    prev_state.get("location"),
                    start_val,
                    end_val,
                    prev_state.get("source", "life_ops_manual"),
                    prev_state.get("color", "#38bdf8")
                )
            elif prev_state.get("_deleted"):
                # If the action created an event, rollback deletes it
                await conn.execute("DELETE FROM calendar_events WHERE id = $1", uuid.UUID(event_id_str))
            else:
                # Convert ISO string to datetime if needed
                start_val = prev_state.get("start_time")
                end_val = prev_state.get("end_time")
                if isinstance(start_val, str):
                    start_val = datetime.fromisoformat(start_val)
                if isinstance(end_val, str):
                    end_val = datetime.fromisoformat(end_val)

                # Restore previous start_time, end_time, summary
                await conn.execute("""
                    UPDATE calendar_events
                    SET summary = COALESCE($2, summary),
                        start_time = $3,
                        end_time = $4,
                        updated_at = now()
                    WHERE id = $1
                """, uuid.UUID(event_id_str), prev_state.get("summary"), start_val, end_val)

        await conn.execute("""
            UPDATE autopilot_logs
            SET undone = TRUE
            WHERE id = $1
        """, log_id)

        logger.info(f"Successfully rolled back autopilot action {log_id}: {row['description']}")
        return {
            "status": "success",
            "message": f"Successfully reverted: {row['description']}",
            "log_id": log_id,
        }


@router.get("/pending")
async def list_pending_actions() -> List[Dict[str, Any]]:
    """List pending actions requiring user confirmation (diff previews)."""
    async with get_conn() as conn:
        rows = await conn.fetch("""
            SELECT id, action_type, description, diff_preview, status, created_at
            FROM pending_actions
            WHERE status = 'pending'
            ORDER BY created_at DESC
        """)
        return [dict(r) for r in rows]


@router.post("/pending/{action_id}/approve")
async def approve_pending_action(action_id: str) -> Dict[str, Any]:
    """Approve and execute a proposed schedule change, logging full rollback state to autopilot_logs."""
    async with get_conn() as conn:
        row = await conn.fetchrow("""
            SELECT id, action_type, description, diff_preview, status
            FROM pending_actions
            WHERE id = $1
        """, uuid.UUID(action_id) if isinstance(action_id, str) and len(action_id) == 36 else action_id)

        if not row:
            raise HTTPException(status_code=404, detail="Pending action not found")
        if row["status"] != "pending":
            raise HTTPException(status_code=400, detail=f"Action is already {row['status']}")

        raw_diff = row["diff_preview"]
        diff = json.loads(raw_diff) if isinstance(raw_diff, str) else (raw_diff or {})

        # Handle Course / Event Deletion
        if row["action_type"] == "delete_event" or diff.get("action") == "delete" or diff.get("proposed", {}).get("action") == "delete":
            event_ids = diff.get("event_ids", [])
            if not event_ids and diff.get("event_id"):
                event_ids = [diff.get("event_id")]

            parsed_ids = [uuid.UUID(eid) if isinstance(eid, str) else eid for eid in event_ids]
            events = await conn.fetch("""
                SELECT id, calendar_id, calendar_name, summary, description, location, start_time, end_time, source, color
                FROM calendar_events
                WHERE id = ANY($1::uuid[])
            """, parsed_ids)

            rollback_payload = {}
            for e in events:
                rollback_payload[str(e["id"])] = {
                    "_restorable_event": True,
                    "id": str(e["id"]),
                    "calendar_id": e["calendar_id"],
                    "calendar_name": e["calendar_name"],
                    "summary": e["summary"],
                    "description": e["description"],
                    "location": e["location"],
                    "start_time": e["start_time"].isoformat(),
                    "end_time": e["end_time"].isoformat(),
                    "source": e["source"],
                    "color": e["color"],
                }

            # Delete the events from the calendar
            await conn.execute("DELETE FROM calendar_events WHERE id = ANY($1::uuid[])", parsed_ids)

            # Log to autopilot_logs for 1-click Undo
            await conn.execute("""
                INSERT INTO autopilot_logs (
                    action_type, description, affected_ids, rollback_payload
                ) VALUES ('delete_event', $1, $2, $3)
            """, f"Removed {len(events)} session(s) of '{diff.get('summary', 'Course')}'", [e["id"] for e in events], json.dumps(rollback_payload))

        # Handle Reschedule Shift
        elif row["action_type"] == "reschedule_event":
            eid = diff.get("event_id")
            if eid:
                parsed_eid = uuid.UUID(eid) if isinstance(eid, str) else eid
                event = await conn.fetchrow("SELECT * FROM calendar_events WHERE id = $1", parsed_eid)
                if event and "proposed" in diff:
                    rollback_payload = {
                        str(event["id"]): {
                            "summary": event["summary"],
                            "start_time": event["start_time"].isoformat(),
                            "end_time": event["end_time"].isoformat(),
                            "source": event["source"],
                        }
                    }
                    new_start = datetime.fromisoformat(diff["proposed"]["start_time"])
                    new_end = datetime.fromisoformat(diff["proposed"]["end_time"])

                    await conn.execute("""
                        UPDATE calendar_events
                        SET start_time = $2, end_time = $3, updated_at = now()
                        WHERE id = $1
                    """, parsed_eid, new_start, new_end)

                    await conn.execute("""
                        INSERT INTO autopilot_logs (
                            action_type, description, affected_ids, rollback_payload
                        ) VALUES ('reschedule_event', $1, $2, $3)
                    """, f"Shifted '{event['summary']}'", [event["id"]], json.dumps(rollback_payload))

        # Mark pending action as approved
        await conn.execute("""
            UPDATE pending_actions
            SET status = 'approved', resolved_at = now()
            WHERE id = $1
        """, row["id"])

        return {"status": "approved", "action_id": str(row["id"]), "applied": True}


@router.post("/pending/{action_id}/reject")
async def reject_pending_action(action_id: str) -> Dict[str, Any]:
    """Reject a proposed schedule change."""
    async with get_conn() as conn:
        await conn.execute("""
            UPDATE pending_actions
            SET status = 'rejected', resolved_at = now()
            WHERE id = $1
        """, action_id)
        return {"status": "rejected", "action_id": action_id}
