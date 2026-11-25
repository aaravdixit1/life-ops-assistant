import pytest
import uuid
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import get_conn, close_db


@pytest.fixture(autouse=True)
async def cleanup_db():
    yield
    await close_db()


@pytest.mark.asyncio
async def test_get_daily_brief():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.get("/api/brief/daily")
        assert res.status_code == 200
        data = res.json()
        assert "greeting" in data
        assert "weather" in data
        assert "narrative_schedule" in data
        assert "possible_plans" in data
        assert "assignments_due_soon" in data
        assert len(data["possible_plans"]) >= 3


@pytest.mark.asyncio
async def test_adopt_plan_and_undo():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Adopt Plan A
        adopt_res = await client.post("/api/brief/adopt-plan", json={"plan_id": "plan-a"})
        assert adopt_res.status_code == 200
        adopt_data = adopt_res.json()
        assert adopt_data["status"] == "success"
        assert adopt_data["events_created"] >= 1
        created_event_id = adopt_data["events"][0]["id"]

        # Verify event was inserted in DB
        async with get_conn() as conn:
            event = await conn.fetchrow("SELECT * FROM calendar_events WHERE id = $1", created_event_id)
            assert event is not None
            assert "Focus Block" in event["summary"]

            # Verify autopilot log was written
            log = await conn.fetchrow(
                "SELECT * FROM autopilot_logs WHERE description ILIKE '%Scheduled%Plan A%' ORDER BY created_at DESC LIMIT 1"
            )
            assert log is not None
            log_id = str(log["id"])

        # 2. Undo the adoption via autopilot rollback endpoint
        undo_res = await client.post(f"/api/autopilot/undo/{log_id}")
        assert undo_res.status_code == 200
        undo_data = undo_res.json()
        assert undo_data["status"] == "success"

        # Verify the event was rolled back (deleted)
        async with get_conn() as conn:
            deleted_event = await conn.fetchrow("SELECT * FROM calendar_events WHERE id = $1", created_event_id)
            assert deleted_event is None


@pytest.mark.asyncio
async def test_rag_semantic_search():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # Index sample syllabus chunk so search is hermetic and independent of prior DB state
        await client.post("/api/rag/index-text", json={
            "source_path": "canvas:stat3005:syllabus",
            "content": "STAT 3005 homework grading policy: weekly homework assignments count for 20% of final grade.",
            "source_type": "canvas_syllabus"
        })
        res = await client.post("/api/rag/search", json={"query": "STAT 3005 homework grading", "limit": 2})
        assert res.status_code == 200
        results = res.json()
        assert isinstance(results, list)
        assert len(results) >= 1
        assert "similarity" in results[0]
        assert results[0]["similarity"] > 0.3


@pytest.mark.asyncio
async def test_direct_line_intelligence():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        res = await client.post("/api/brief/direct-line", json={
            "message": "i dont read coding books lol, take all those out, im interested in philosophy and fiction any recs?"
        })
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "success"
        assert len(data.get("recommendations", [])) >= 2
        assert "message" in data

        # Verify preference was saved in DB
        async with get_conn() as conn:
            pref = await conn.fetchrow("SELECT * FROM user_knowledge_base WHERE category = 'preference'")
            assert pref is not None

        # Verify get_daily_brief returns the updated curated reading
        brief_res = await client.get("/api/brief/daily")
        assert brief_res.status_code == 200
        brief_data = brief_res.json()
        reading = brief_data["editorial"]["reading"]
        assert "Clean Code" not in reading["title"]
        assert "Designing Data-Intensive" not in reading["title"]


@pytest.mark.asyncio
async def test_assistant_personal_memory_and_commit_event():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Tell assistant personal memory (address)
        mem_res = await client.post("/api/brief/direct-line", json={
            "message": "I live at 120 College Park Ave, Campus District. Remember this."
        })
        assert mem_res.status_code == 200
        mem_data = mem_res.json()
        assert mem_data["status"] == "success"

        # Verify fact was saved to user_knowledge_base
        async with get_conn() as conn:
            fact = await conn.fetchrow("""
                SELECT * FROM user_knowledge_base 
                WHERE category = 'personal_fact' AND (title ILIKE '%residence%' OR title ILIKE '%address%')
                LIMIT 1
            """)
            assert fact is not None
            assert "College Park" in fact["content"]

        # 2. Ask assistant where the user lives
        q_res = await client.post("/api/brief/direct-line", json={
            "message": "Where do I live?"
        })
        assert q_res.status_code == 200
        q_data = q_res.json()
        assert "120 College Park" in q_data["message"]

        # 3. Test proposed event scheduling via direct-line
        sched_res = await client.post("/api/brief/direct-line", json={
            "message": "Schedule a study block for Algorithms today at 4 PM"
        })
        assert sched_res.status_code == 200
        sched_data = sched_res.json()
        assert sched_data["proposed_event"] is not None
        assert "Algorithms" in sched_data["proposed_event"]["summary"] or "Study" in sched_data["proposed_event"]["summary"]

        # 4. Commit the proposed event
        commit_res = await client.post("/api/brief/commit-event", json={
            "summary": sched_data["proposed_event"]["summary"],
            "start_time": sched_data["proposed_event"]["start_time"],
            "end_time": sched_data["proposed_event"]["end_time"],
            "location": sched_data["proposed_event"].get("location", "Campus"),
            "description": "Test commit from pytest",
        })
        assert commit_res.status_code == 200
        commit_data = commit_res.json()
        assert commit_data["status"] == "success"
        event_id = commit_data["event_id"]

        # 5. Clean up created test event
        async with get_conn() as conn:
            await conn.execute("DELETE FROM calendar_events WHERE id = $1", int(event_id) if event_id.isdigit() else uuid.UUID(event_id))
