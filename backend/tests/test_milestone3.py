"""
Milestone 3 Verification Tests
Tests: Calendar Manager, Conflict Detection, Action Gatekeeper Guardrails & 1-Click Rollback,
768-dim RAG Indexer with pgvector, and FastAPI Calendar/RAG endpoints.
"""
import uuid
import pytest
from datetime import datetime, timezone, timedelta
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import get_conn, close_db
from app.services import calendar_manager, gatekeeper, rag_indexer


@pytest.fixture(autouse=True)
async def cleanup_db():
    yield
    await close_db()


@pytest.mark.asyncio
async def test_calendar_crud_and_export():
    # 1. Create new event (hermetic regardless of cleared sample data)
    now = datetime.now(timezone.utc)
    new_event = await calendar_manager.create_event({
        "summary": "Orthodontist Appointment",
        "start_time": now + timedelta(days=1),
        "end_time": now + timedelta(days=1, hours=1),
        "calendar_name": "Personal",
        "source": "life_ops_manual"
    })
    assert new_event["id"] is not None
    event_id = str(new_event["id"])

    try:
        events = await calendar_manager.get_events(limit=50)
        assert len(events) >= 1

        # 2. Update event
        updated = await calendar_manager.update_event(event_id, {"summary": "Orthodontist - Annual Checkup"})
        assert updated["summary"] == "Orthodontist - Annual Checkup"

        # 3. Export ICS
        ics_text = await calendar_manager.export_ics()
        assert "BEGIN:VCALENDAR" in ics_text
        assert "Orthodontist - Annual Checkup" in ics_text
    finally:
        # 4. Delete event
        deleted = await calendar_manager.delete_event(event_id)
        assert deleted is True


@pytest.mark.asyncio
async def test_conflict_detection_against_classes():
    temp_class = await calendar_manager.create_event({
        "summary": "CS 3114 - Data Structures",
        "start_time": datetime.fromisoformat("2026-11-09T21:00:00+00:00"),
        "end_time": datetime.fromisoformat("2026-11-09T22:15:00+00:00"),
        "calendar_id": "academics",
        "calendar_name": "Academics",
        "source": "life_ops_manual",
    })
    try:
        overlap_start = datetime.fromisoformat("2026-11-09T21:10:00+00:00")
        overlap_end = datetime.fromisoformat("2026-11-09T21:40:00+00:00")

        conflicts = await calendar_manager.detect_conflicts(overlap_start, overlap_end)
        assert len(conflicts) > 0
        conflict_names = [c["summary"] for c in conflicts]
        assert any("CS 3114" in name for name in conflict_names)

        # Check free window (e.g. 23:00 to 23:30 UTC)
        free_start = datetime.fromisoformat("2026-11-09T23:00:00+00:00")
        free_end = datetime.fromisoformat("2026-11-09T23:30:00+00:00")
        no_conflicts = await calendar_manager.detect_conflicts(free_start, free_end)
        assert len(no_conflicts) == 0
    finally:
        await calendar_manager.delete_event(str(temp_class["id"]))


@pytest.mark.asyncio
async def test_gatekeeper_guardrails_and_rollback():
    # Ensure both a study block and a manual class event exist hermetically
    now = datetime.now(timezone.utc)
    temp_study = await calendar_manager.create_event({
        "summary": "Hermetic Study Block",
        "start_time": now + timedelta(days=2, hours=1),
        "end_time": now + timedelta(days=2, hours=2),
        "calendar_id": "academics",
        "calendar_name": "Academics",
        "source": "life_ops_study_block",
    })
    temp_class = await calendar_manager.create_event({
        "summary": "Hermetic Fixed Class",
        "start_time": now + timedelta(days=2, hours=4),
        "end_time": now + timedelta(days=2, hours=5),
        "calendar_id": "academics",
        "calendar_name": "Academics",
        "source": "life_ops_manual",
    })
    try:
        study_id = str(temp_study["id"])
        orig_start = temp_study["start_time"]
        new_start = orig_start + timedelta(hours=1)
        new_end = temp_study["end_time"] + timedelta(hours=1)

        result = await gatekeeper.request_schedule_adjustment(
            event_id=study_id,
            new_start=new_start,
            new_end=new_end,
            reason="Canvas due date shifted by 1 hour"
        )
        assert result["status"] == "auto_applied"
        log_id = result["log_id"]

        async with get_conn() as conn:
            updated_event = await conn.fetchrow("SELECT start_time FROM calendar_events WHERE id = $1", study_id)
            assert updated_event["start_time"] == new_start

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            undo_resp = await ac.post(f"/api/autopilot/undo/{log_id}")
            assert undo_resp.status_code == 200
            assert undo_resp.json()["status"] == "success"

        async with get_conn() as conn:
            reverted_event = await conn.fetchrow("SELECT start_time FROM calendar_events WHERE id = $1", study_id)
            assert reverted_event["start_time"] == orig_start
            await conn.execute("DELETE FROM autopilot_logs WHERE id = $1", uuid.UUID(log_id))

        class_id = str(temp_class["id"])
        gated_result = await gatekeeper.request_schedule_adjustment(
            event_id=class_id,
            new_start=temp_class["start_time"] + timedelta(days=1),
            new_end=temp_class["end_time"] + timedelta(days=1),
            reason="Proposed reschedule"
        )
        assert gated_result["status"] == "pending_approval"
        assert "diff_preview" in gated_result
        assert gated_result["diff_preview"]["summary"] == temp_class["summary"]

        action_id = gated_result.get("action_id")
        if action_id:
            async with get_conn() as conn:
                await conn.execute("DELETE FROM pending_actions WHERE id = $1", uuid.UUID(action_id))
    finally:
        await calendar_manager.delete_event(str(temp_study["id"]))
        await calendar_manager.delete_event(str(temp_class["id"]))


@pytest.mark.asyncio
async def test_rag_indexer_768_dimensions():
    # 1. Verify embedding dimensionality matches pgvector vector(768)
    emb = await rag_indexer.embed_text("Test embedding dimensionality for Life-Ops Assistant.")
    assert len(emb) == 768

    # 2. Index a sample resume / project document
    doc_path = "sample_resume.md"
    doc_text = """
    Alex Rivera - Software Engineer & Computer Science
    Skills: Python, FastAPI, Next.js, TypeScript, PostgreSQL, pgvector, PyTorch, Docker.
    Projects:
    - Life-Ops Assistant: Autonomous operations monorepo with APScheduler, Playwright SSO, and Gemini Flash.
    - HoopMap: Interactive basketball analytics platform built on Supabase.
    """
    indexed_count = await rag_indexer.index_document(
        source_path=doc_path,
        source_type="resume",
        content=doc_text,
        metadata={"category": "resume", "owner": "Alex Rivera"}
    )
    assert indexed_count >= 1

    # 3. Perform semantic search
    matches = await rag_indexer.semantic_search(
        query="Who worked on autonomous operations monorepo and HoopMap?",
        limit=3
    )
    assert len(matches) > 0
    top_match = matches[0]
    assert top_match["source_type"] == "resume"
    assert top_match["similarity"] > 0.4
    assert "Life-Ops Assistant" in top_match["content"]


@pytest.mark.asyncio
async def test_calendar_and_rag_api_endpoints():
    temp_ev = await calendar_manager.create_event({
        "summary": "Hermetic Endpoint Check Event",
        "start_time": datetime.fromisoformat("2026-11-09T21:00:00+00:00"),
        "end_time": datetime.fromisoformat("2026-11-09T22:00:00+00:00"),
        "calendar_id": "academics",
        "calendar_name": "Academics",
        "source": "life_ops_manual",
    })
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            # Calendar events
            events_resp = await ac.get("/api/calendar/events?limit=10")
            assert events_resp.status_code == 200
            assert len(events_resp.json()) > 0

            # Calendar sync status (local mode out of the box)
            status_resp = await ac.get("/api/calendar/sync-status")
            assert status_resp.status_code == 200
            assert status_resp.json()["mode"] == "local_first"

            # Conflict check endpoint
            conflict_resp = await ac.post("/api/calendar/detect-conflicts", json={
                "start_time": "2026-11-09T21:10:00+00:00",
                "end_time": "2026-11-09T21:40:00+00:00"
            })
            assert conflict_resp.status_code == 200
            assert len(conflict_resp.json()) > 0

            # RAG index text endpoint
            index_resp = await ac.post("/api/rag/index-text", json={
                "source_path": "notes.txt",
                "content": "LeetCode daily study routine focuses on dynamic programming, two pointers, and graph traversals in Python.",
                "source_type": "project_repo"
            })
            assert index_resp.status_code == 200
            assert index_resp.json()["chunks_indexed"] >= 1

            # RAG search endpoint
            rag_resp = await ac.post("/api/rag/search", json={
                "query": "dynamic programming algorithms and graph traversals",
                "limit": 2
            })
            assert rag_resp.status_code == 200
            assert len(rag_resp.json()) > 0
    finally:
        await calendar_manager.delete_event(str(temp_ev["id"]))
