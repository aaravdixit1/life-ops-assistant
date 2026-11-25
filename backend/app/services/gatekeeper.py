"""
Action Gatekeeper Service
Enforces GEMINI.md safety guardrails:
1. Passive sync by default - no unprompted calendar writes.
2. Scoped Auto-Edits - ONLY events tagged with source='life_ops_study_block' may be auto-modified.
3. Every automated modification logs a full rollback_payload to autopilot_logs for 1-click Undo.
4. Confirmation Required - Any change touching fixed classes, exams, or appointments requires
   a structured diff preview in pending_actions and waits for user approval.
"""
import json
from datetime import datetime
from typing import Dict, Any, Optional, List
from ..db import get_conn
import logging

logger = logging.getLogger(__name__)


async def request_schedule_adjustment(
    event_id: str,
    new_start: datetime,
    new_end: datetime,
    reason: str,
) -> Dict[str, Any]:
    """
    Attempt to adjust an event's schedule.
    - If source == 'life_ops_study_block': auto-applied, rollback payload logged to autopilot_logs.
    - If source != 'life_ops_study_block': gated! Stored in pending_actions with diff preview for user review.
    """
    async with get_conn() as conn:
        event = await conn.fetchrow("""
            SELECT id, summary, location, start_time, end_time, source, calendar_name
            FROM calendar_events
            WHERE id = $1
        """, event_id)

        if not event:
            return {"status": "error", "message": f"Event {event_id} not found"}

        # Check guardrail: ONLY life_ops_study_block is eligible for autonomous adjustment
        if event["source"] != "life_ops_study_block":
            logger.info(f"Guardrail Gated: Modification of '{event['summary']}' (source={event['source']}) requires user confirmation.")
            diff_preview = {
                "event_id": str(event["id"]),
                "summary": event["summary"],
                "calendar_name": event["calendar_name"],
                "source": event["source"],
                "current": {
                    "start_time": event["start_time"].isoformat(),
                    "end_time": event["end_time"].isoformat(),
                },
                "proposed": {
                    "start_time": new_start.isoformat(),
                    "end_time": new_end.isoformat(),
                },
                "reason": reason,
            }

            pending_row = await conn.fetchrow("""
                INSERT INTO pending_actions (
                    action_type, description, diff_preview, status
                ) VALUES ('reschedule_event', $1, $2, 'pending')
                RETURNING id, created_at
            """, f"Reschedule '{event['summary']}': {reason}", json.dumps(diff_preview))

            return {
                "status": "pending_approval",
                "action_id": str(pending_row["id"]),
                "message": f"Modification of '{event['summary']}' requires your confirmation.",
                "diff_preview": diff_preview,
            }

        # Auto-adjustment permitted for study blocks
        rollback_payload = {
            str(event["id"]): {
                "summary": event["summary"],
                "start_time": event["start_time"].isoformat(),
                "end_time": event["end_time"].isoformat(),
                "source": event["source"],
            }
        }

        # Apply update
        await conn.execute("""
            UPDATE calendar_events
            SET start_time = $2, end_time = $3, updated_at = now()
            WHERE id = $1
        """, event_id, new_start, new_end)

        # Log to autopilot_logs for 1-click undo
        log_row = await conn.fetchrow("""
            INSERT INTO autopilot_logs (
                action_type, description, affected_ids, rollback_payload
            ) VALUES ('study_block_shift', $1, $2, $3)
            RETURNING id, created_at
        """,
            f"Auto-shifted '{event['summary']}' ({reason})",
            [event["id"]],
            json.dumps(rollback_payload)
        )

        logger.info(f"Autopilot applied: Shifted '{event['summary']}' (Log ID: {log_row['id']})")
        return {
            "status": "auto_applied",
            "log_id": str(log_row["id"]),
            "message": f"Auto-adjusted study block '{event['summary']}'",
            "rollback_available": True,
        }


async def propose_event_deletion(
    event_ids: List[str],
    reason: str,
) -> Dict[str, Any]:
    """
    Attempt to delete one or more events.
    - If ALL events have source == 'life_ops_study_block': auto-deleted, rollback logged to autopilot_logs.
    - If ANY event has source != 'life_ops_study_block' (e.g. fixed class, exam, appointment):
      GATED! Stored in pending_actions with structured diff preview for user confirmation.
    """
    if not event_ids:
        return {"status": "error", "message": "No events specified for deletion"}

    async with get_conn() as conn:
        events = await conn.fetch("""
            SELECT id, summary, location, start_time, end_time, source, calendar_name, calendar_id, description, color
            FROM calendar_events
            WHERE id = ANY($1::uuid[])
            ORDER BY start_time ASC
        """, event_ids)

        if not events:
            return {"status": "error", "message": "No matching events found"}

        summary = events[0]["summary"]
        all_study_blocks = all(e["source"] == "life_ops_study_block" for e in events)

        if not all_study_blocks:
            logger.info(f"Guardrail Gated: Deletion of '{summary}' ({len(events)} session(s)) requires user confirmation.")
            diff_preview = {
                "action": "delete",
                "event_ids": [str(e["id"]) for e in events],
                "summary": summary,
                "calendar_name": events[0]["calendar_name"],
                "source": events[0]["source"],
                "count": len(events),
                "sessions": [
                    {
                        "id": str(e["id"]),
                        "start_time": e["start_time"].isoformat(),
                        "end_time": e["end_time"].isoformat(),
                        "location": e["location"],
                    }
                    for e in events
                ],
                "current": {
                    "start_time": events[0]["start_time"].isoformat(),
                    "end_time": events[0]["end_time"].isoformat(),
                    "location": events[0]["location"],
                    "count": len(events),
                },
                "proposed": {
                    "action": "delete",
                    "label": (
                        f"Remove Session ({events[0]['start_time'].strftime('%b %d')})"
                        if len(events) == 1
                        else f"Drop Course / Permanent Removal ({len(events)} sessions)"
                    ),
                },
                "reason": reason,
            }

            desc_text = (
                f"Remove session of '{summary}' ({events[0]['start_time'].strftime('%b %d')})"
                if len(events) == 1
                else f"Drop Course: Remove {len(events)} session(s) of '{summary}'"
            )

            pending_row = await conn.fetchrow("""
                INSERT INTO pending_actions (
                    action_type, description, diff_preview, status
                ) VALUES ('delete_event', $1, $2, 'pending')
                RETURNING id, created_at
            """, desc_text, json.dumps(diff_preview))

            return {
                "status": "pending_approval",
                "action_id": str(pending_row["id"]),
                "message": f"Removing {len(events)} session(s) of '{summary}' touches fixed schedule and requires your confirmation.",
                "diff_preview": diff_preview,
            }

        # Auto-deletion permitted for study blocks
        rollback_payload = {
            str(e["id"]): {
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
            for e in events
        }

        await conn.execute("DELETE FROM calendar_events WHERE id = ANY($1::uuid[])", event_ids)

        log_row = await conn.fetchrow("""
            INSERT INTO autopilot_logs (
                action_type, description, affected_ids, rollback_payload
            ) VALUES ('delete_event', $1, $2, $3)
            RETURNING id, created_at
        """,
            f"Auto-removed {len(events)} session(s) of '{summary}' ({reason})",
            [e["id"] for e in events],
            json.dumps(rollback_payload)
        )

        return {
            "status": "auto_applied",
            "log_id": str(log_row["id"]),
            "message": f"Auto-removed study block '{summary}'",
            "rollback_available": True,
        }
