"""
Tests for College Profile Setup, Multi-Format Resume Upload/RAG,
Strictly Scoped Assistant, and Location-Synced Live Nearby Grocery Service.
"""
import io
import zipfile
from datetime import datetime
from zoneinfo import ZoneInfo

import pytest
from httpx import ASGITransport, AsyncClient

from app.db import close_db
from app.main import app
from app.services import assistant_engine, assistant_sessions, grocery_service, profile_service, rag_indexer


@pytest.fixture(autouse=True)
async def cleanup_db():
    yield
    await close_db()


def _make_sample_docx(text: str) -> bytes:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        xml = (
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
            f"<w:body><w:p><w:r><w:t>{text}</w:t></w:r></w:p></w:body>"
            "</w:document>"
        )
        zf.writestr("word/document.xml", xml)
    return buf.getvalue()


def _make_sample_pdf(text: str) -> bytes:
    # Minimal valid 1-page PDF containing uncompressed Helvetica text stream
    safe = text.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
    stream = f"BT /F1 12 Tf 72 720 Td ({safe}) Tj ET\n".encode("latin-1")
    objs = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
        f"4 0 obj << /Length {len(stream)} >>\nstream\n".encode("latin-1") + stream + b"endstream\nendobj\n",
        b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
    ]
    out = bytearray(b"%PDF-1.4\n")
    offsets = [0]
    for o in objs:
        offsets.append(len(out))
        out.extend(o)
    xref_pos = len(out)
    out.extend(f"xref\n0 {len(offsets)}\n0000000000 65535 f \n".encode("latin-1"))
    for off in offsets[1:]:
        out.extend(f"{off:010d} 00000 n \n".encode("latin-1"))
    out.extend(
        f"trailer << /Size {len(offsets)} /Root 1 0 R >>\nstartxref\n{xref_pos}\n%%EOF\n".encode("latin-1")
    )
    return bytes(out)


def test_extract_text_from_upload_formats():
    assert "Distributed Systems" in rag_indexer.extract_text_from_upload(
        "resume.md", b"# Skills\nDistributed Systems & Python"
    )
    assert "PyTorch" in rag_indexer.extract_text_from_upload(
        "resume.docx", _make_sample_docx("Undergraduate Researcher PyTorch")
    )
    assert "FastAPI" in rag_indexer.extract_text_from_upload(
        "resume.pdf", _make_sample_pdf("Software Engineering Intern FastAPI")
    )
    with pytest.raises(ValueError):
        rag_indexer.extract_text_from_upload("resume.exe", b"binary")


@pytest.mark.asyncio
async def test_college_profile_fields_round_trip():
    before = await profile_service.get_profile()
    try:
        updated = await profile_service.update_profile({
            "majors": ["Computer Science", "Mathematics"],
            "minors": ["Economics"],
            "academic_year": "Junior",
            "expected_graduation": "May 2027",
            "career_role": "Systems Software Intern",
            "grocery_radius_miles": 12,
        })
        assert updated["majors"] == ["Computer Science", "Mathematics"]
        assert updated["minors"] == ["Economics"]
        assert updated["academic_year"] == "Junior"
        assert updated["expected_graduation"] == "May 2027"
        assert updated["career_role"] == "Systems Software Intern"
        assert updated["grocery_radius_miles"] == 12
        assert "Computer Science & Mathematics" in updated["major_or_role"]
    finally:
        await profile_service.update_profile({
            "majors": before.get("majors") or [],
            "minors": before.get("minors") or [],
            "academic_year": before.get("academic_year") or "",
            "expected_graduation": before.get("expected_graduation") or "",
            "career_role": before.get("career_role") or "",
            "major_or_role": before.get("major_or_role") or "",
            "grocery_radius_miles": before.get("grocery_radius_miles") or 5,
        })


@pytest.mark.asyncio
async def test_resume_upload_list_and_delete_round_trip():
    transport = ASGITransport(app=app)
    pdf_bytes = _make_sample_pdf("Senior CS Student - C++ Buffer Pool & FastAPI Backend")
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        up = await ac.post(
            "/api/profile/upload-document",
            data={"source_type": "resume"},
            files={"file": ("pytest_sample_resume.pdf", pdf_bytes, "application/pdf")},
        )
        assert up.status_code == 200
        up_json = up.json()
        assert up_json["chunks_indexed"] >= 1
        source_path = up_json["source_path"]

        docs_res = await ac.get("/api/rag/documents?source_type=resume")
        assert docs_res.status_code == 200
        docs = docs_res.json()["documents"]
        assert any(d["source_path"] == source_path for d in docs)

        search_res = await ac.post(
            "/api/rag/search",
            json={"query": "Buffer Pool FastAPI", "limit": 3, "source_type": "resume"},
        )
        assert search_res.status_code == 200
        assert len(search_res.json()) >= 1

        del_res = await ac.delete(
            "/api/rag/documents",
            params={"source_path": source_path, "source_type": "resume"},
        )
        assert del_res.status_code == 200
        assert del_res.json()["chunks_deleted"] >= 1


def test_assistant_scope_and_schedule_parser():
    assert assistant_engine.is_pure_greeting("hi")
    assert assistant_engine.is_pure_greeting("Hello there!")
    assert not assistant_engine.is_pure_greeting("what is on my schedule?")

    assert assistant_engine.is_out_of_scope_trivia("what is the population of china in 2024")
    assert assistant_engine.is_out_of_scope_trivia("who won the super bowl in 2023")
    assert not assistant_engine.is_out_of_scope_trivia("what assignments do i have due today?")
    assert not assistant_engine.is_out_of_scope_trivia("can you add a dentist appointment tomorrow at 2pm to the calendar?")

    tz = ZoneInfo("America/New_York")
    now = datetime(2026, 11, 25, 10, 0, tzinfo=tz)
    t_date, hour, minute, duration, summary, source = assistant_engine.parse_schedule_request(
        "can you add a dentist appointment tomorrow at 2:30pm to my calendar?",
        now,
        tz,
    )
    assert t_date.isoformat() == "2026-11-26"
    assert hour == 14
    assert minute == 30
    assert duration == 60
    assert "Dentist" in summary
    assert source == "life_ops_manual"


@pytest.mark.asyncio
async def test_assistant_direct_line_greetings_scope_and_cards():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        greet = await ac.post("/api/brief/direct-line", json={"message": "hi", "persist": False})
        assert greet.status_code == 200
        g_data = greet.json()
        assert g_data["scope_status"] == "in_scope"
        assert "Hey" in g_data["message"]

        oos = await ac.post(
            "/api/brief/direct-line",
            json={"message": "what is the population of china in 2024", "persist": False},
        )
        assert oos.status_code == 200
        oos_data = oos.json()
        assert oos_data["scope_status"] == "out_of_scope"
        assert oos_data["mentioned_assignments"] == []
        assert oos_data["mentioned_events"] == []
        assert "life-ops" in oos_data["message"].lower()

        appt = await ac.post(
            "/api/brief/direct-line",
            json={"message": "can you add a dentist appointment tomorrow at 2pm to the calendar?", "persist": False},
        )
        assert appt.status_code == 200
        appt_data = appt.json()
        assert appt_data["proposed_event"] is not None
        assert "dentist" in appt_data["proposed_event"]["summary"].lower()


@pytest.mark.asyncio
async def test_health_meals_dedup_and_local_grocery_comparison():
    sample_stores = [
        {
            "id": "s1",
            "name": "ALDI",
            "chain": "ALDI",
            "price_tier": "Budget",
            "price_multiplier": 0.84,
            "distance_miles": 2.4,
            "address": "123 Market St, Springfield, VA",
        },
        {
            "id": "s2",
            "name": "Wegmans",
            "chain": "Wegmans",
            "price_tier": "Mid-Range",
            "price_multiplier": 1.02,
            "distance_miles": 3.6,
            "address": "450 Oak Ave, Springfield, VA",
        },
    ]
    comps = grocery_service.build_local_ingredient_comparisons(sample_stores, q="chicken")
    assert len(comps) >= 2
    assert any("ALDI" in s["store"] for s in comps[0]["stores"])
    assert not any("University City" in s["store"] for s in comps[0]["stores"])

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        meals = await ac.get("/api/health/meals")
        assert meals.status_code == 200
        m_list = meals.json()
        names = [m["name"].lower() for m in m_list]
        assert len(names) == len(set(names)), "Meal templates should be deduplicated by name"
        assert isinstance(m_list[0]["ingredients"], list)

        # Expanded staple catalog count
        assert len(grocery_service.STAPLE_CATALOG) >= 60

        # Store filter narrows results to that store
        filtered = grocery_service.build_local_ingredient_comparisons(sample_stores, store_filter="Wegmans")
        assert len(filtered) >= 60
        assert all(s["store_name"] == "Wegmans" for s in filtered[0]["stores"])

        # Open Food Facts live product parser
        parsed_off = grocery_service._parse_openfoodfacts_hits(
            [
                {
                    "code": "123456",
                    "product_name": "Greek Yogurt",
                    "brands": ["chobani"],
                    "stores": ["aldi"],
                    "quantity": "32 oz",
                    "nutriments": {"energy-kcal_100g": 77.0, "proteins_100g": 8.1},
                }
            ],
            sample_stores,
        )
        assert len(parsed_off) == 1
        assert parsed_off[0]["is_live_product"] is True
        assert parsed_off[0]["protein_100g"] == 8.1
        assert parsed_off[0]["stores"][0]["chain"] == "ALDI"


@pytest.mark.asyncio
async def test_assistant_persistent_chat_sessions_and_context():
    transport = ASGITransport(app=app)
    created_ids = []
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # 1. Start Chat 1 via direct-line (persist=True)
        r1 = await ac.post("/api/brief/direct-line", json={"message": "hi", "persist": True})
        assert r1.status_code == 200
        d1 = r1.json()
        s1_id = d1.get("session_id")
        assert s1_id
        created_ids.append(s1_id)

        # 2. Verify session appears in /sessions with 2 messages (user + assistant)
        list_res = await ac.get("/api/brief/sessions")
        assert list_res.status_code == 200
        sessions = list_res.json()["sessions"]
        assert any(s["id"] == s1_id and s["message_count"] >= 2 for s in sessions)

        # 3. Verify GET /sessions/{id} returns saved turns & card payload
        det_res = await ac.get(f"/api/brief/sessions/{s1_id}")
        assert det_res.status_code == 200
        msgs = det_res.json()["session"]["messages"]
        assert len(msgs) >= 2
        assert msgs[0]["role"] == "user"
        assert msgs[1]["role"] == "assistant"

        # 4. Create Chat 2 explicitly and verify cross-session context pulls from Chat 1
        c2 = await ac.post("/api/brief/sessions", json={"title": "Second Chat"})
        assert c2.status_code == 200
        s2_id = c2.json()["session"]["id"]
        created_ids.append(s2_id)

        cross = await assistant_sessions.get_recent_cross_session_context(exclude_session_id=s2_id, limit_turns=4)
        assert isinstance(cross, list) and len(cross) >= 1

        # 5. Delete both test sessions cleanly
        for sid in created_ids:
            del_r = await ac.delete(f"/api/brief/sessions/{sid}")
            assert del_r.status_code == 200
        gone = await ac.get(f"/api/brief/sessions/{s1_id}")
        assert gone.status_code == 404
