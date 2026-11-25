import uuid
from datetime import datetime, timedelta, timezone
import pytest
from app.routers.ai import ai_query_endpoint, QueryRequest
from app.routers.autopilot import list_pending_actions, approve_pending_action, undo_autopilot_action
from app.db import get_conn


@pytest.mark.asyncio
async def test_ai_remove_course_stages_pending_action_and_approves():
    # 0. Ensure at least one COMM 1014 session exists for hermetic testing
    created_temp_id = None
    async with get_conn() as conn:
        initial_count = await conn.fetchval("SELECT count(*) FROM calendar_events WHERE summary ILIKE '%COMM 1014%'")
        if initial_count == 0:
            now = datetime.now(timezone.utc)
            row = await conn.fetchrow(
                """
                INSERT INTO calendar_events (calendar_id, calendar_name, summary, location, start_time, end_time, source, color)
                VALUES ('academics', 'Academics', 'COMM 1014 - Public Speaking', 'Hall 1008', $1, $2, 'life_ops_manual', '#38bdf8')
                RETURNING id
                """,
                now + timedelta(days=1),
                now + timedelta(days=1, hours=1),
            )
            created_temp_id = row["id"]
            initial_count = 1
    assert initial_count > 0

    try:
        # 1. User asks AI command bar to remove COMM 1014
        req = QueryRequest(query="remove COMM 1014")
        res = await ai_query_endpoint(req)

        assert "action_staged" in res
        assert res["action_staged"]["type"] == "delete_event"
        assert "COMM 1014" in res["action_staged"]["summary"]
        action_id = res["action_staged"]["action_id"]

        # 2. Check that pending_actions contains the gated proposal
        pending = await list_pending_actions()
        staged = [p for p in pending if str(p["id"]) == action_id]
        assert len(staged) == 1
        assert "COMM 1014" in staged[0]["description"]

        # 3. Approve the deletion
        appr = await approve_pending_action(action_id)
        assert appr["status"] == "approved"
        assert appr["applied"] is True

        # 4. Verify COMM 1014 sessions are now removed from calendar_events
        async with get_conn() as conn:
            count = await conn.fetchval("SELECT count(*) FROM calendar_events WHERE summary ILIKE '%COMM 1014%'")
            assert count == 0

            # Verify autopilot_logs has the deletion rollback payload
            log = await conn.fetchrow("SELECT id, action_type, affected_ids, undone FROM autopilot_logs WHERE action_type = 'delete_event' ORDER BY created_at DESC LIMIT 1")
            assert log is not None
            assert not log["undone"]
            log_id = str(log["id"])

        # 5. Test 1-click Undo: Roll back the deletion!
        rollback = await undo_autopilot_action(log_id)
        assert rollback["status"] == "success"

        # 6. Verify COMM 1014 sessions are restored to calendar_events and clean up test records
        async with get_conn() as conn:
            restored_count = await conn.fetchval("SELECT count(*) FROM calendar_events WHERE summary ILIKE '%COMM 1014%'")
            assert restored_count == initial_count
            await conn.execute("DELETE FROM pending_actions WHERE id = $1", uuid.UUID(action_id))
            await conn.execute("DELETE FROM autopilot_logs WHERE id = $1", uuid.UUID(log_id))
    finally:
        if created_temp_id is not None:
            async with get_conn() as conn:
                await conn.execute("DELETE FROM calendar_events WHERE id = $1", created_temp_id)
