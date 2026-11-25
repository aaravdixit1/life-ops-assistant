"""
Tests for User Profile, Setup Status, Multi-Domain Canvas Auth,
External Calendar Feeds (webcal/ICS), ICS Upload Deduplication, and Credential Validation.
"""
import json
import uuid
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

from app.config import settings
from app.db import close_db, get_conn
from app.main import app
from app.services import calendar_feeds, canvas_pw


@pytest.fixture(autouse=True)
async def cleanup_db():
    yield
    await close_db()


@pytest.mark.asyncio
async def test_profile_get_and_update_roundtrip():
    """Verify GET /api/profile and PUT /api/profile round-trip, restoring original DB state."""
    async with get_conn() as conn:
        orig_profile = await conn.fetchrow("SELECT * FROM user_profile WHERE id = 'default'")
        orig_cal_rule = await conn.fetchrow("SELECT id, value FROM dietary_rules WHERE rule_type = 'calorie_target' LIMIT 1")
        orig_macro_rule = await conn.fetchrow("SELECT id, value FROM dietary_rules WHERE rule_type = 'macro_target' LIMIT 1")

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            get_resp = await ac.get("/api/profile")
            assert get_resp.status_code == 200
            initial = get_resp.json()
            assert "profile" in initial
            assert "setup_status" in initial
            for key in (
                "onboarding_completed",
                "canvas_configured",
                "canvas_session_valid",
                "calendar_feeds_count",
                "google_oauth_configured",
                "active_assignments_count",
                "calendar_events_count",
            ):
                assert key in initial["setup_status"]

            with patch(
                "app.services.profile_service.geocode_location",
                new=AsyncMock(
                    return_value=[
                        {
                            "label": "Seattle, Washington, United States",
                            "city": "Seattle",
                            "region": "Washington",
                            "country": "United States",
                            "latitude": 47.6062,
                            "longitude": -122.3321,
                            "timezone": "America/Los_Angeles",
                        }
                    ]
                ),
            ):
                put_resp = await ac.put(
                    "/api/profile",
                    json={
                        "full_name": "Alex Rivera",
                        "institution": "University of Washington",
                        "major_or_role": "Computer Science",
                        "city": "Seattle",
                        "region": "Washington",
                        "daily_calories_target": 2800,
                        "daily_protein_g": 175,
                        "onboarding_completed": True,
                    },
                )
            assert put_resp.status_code == 200
            updated = put_resp.json()
            assert updated["status"] == "success"
            assert updated["profile"]["first_name"] == "Alex"
            assert updated["profile"]["initials"] == "AR"
            assert updated["profile"]["latitude"] == pytest.approx(47.6062, abs=1e-3)
            assert updated["profile"]["timezone"] == "America/Los_Angeles"
            assert updated["setup_status"]["onboarding_completed"] is True

            # Verify macro targets synced into health endpoint
            health_resp = await ac.get("/api/health/daily-log?date=2026-11-13")
            assert health_resp.status_code == 200
            assert health_resp.json()["target_calories"] == 2800
            assert health_resp.json()["target_protein_g"] == 175.0
    finally:
        async with get_conn() as conn:
            if orig_profile is None:
                await conn.execute("DELETE FROM user_profile WHERE id = 'default'")
            else:
                await conn.execute(
                    """
                    UPDATE user_profile SET
                        full_name = $1, first_name = $2, institution = $3, term_label = $4,
                        major_or_role = $5, city = $6, region = $7, timezone = $8,
                        latitude = $9, longitude = $10, wake_time = $11, sleep_time = $12,
                        study_sanctuary = $13, canvas_base_url = $14, canvas_ics_url = $15,
                        daily_calories_target = $16, daily_protein_g = $17,
                        daily_carbs_g = $18, daily_fats_g = $19, dietary_notes = $20,
                        onboarding_completed = $21
                    WHERE id = 'default'
                    """,
                    orig_profile["full_name"],
                    orig_profile["first_name"],
                    orig_profile["institution"],
                    orig_profile["term_label"],
                    orig_profile["major_or_role"],
                    orig_profile["city"],
                    orig_profile["region"],
                    orig_profile["timezone"],
                    orig_profile["latitude"],
                    orig_profile["longitude"],
                    orig_profile["wake_time"],
                    orig_profile["sleep_time"],
                    orig_profile["study_sanctuary"],
                    orig_profile["canvas_base_url"],
                    orig_profile["canvas_ics_url"],
                    orig_profile["daily_calories_target"],
                    orig_profile["daily_protein_g"],
                    orig_profile["daily_carbs_g"],
                    orig_profile["daily_fats_g"],
                    orig_profile["dietary_notes"],
                    orig_profile["onboarding_completed"],
                )
            if orig_cal_rule is not None:
                val = orig_cal_rule["value"] if isinstance(orig_cal_rule["value"], str) else json.dumps(orig_cal_rule["value"])
                await conn.execute("UPDATE dietary_rules SET value = $1 WHERE id = $2", val, orig_cal_rule["id"])
            if orig_macro_rule is not None:
                val = orig_macro_rule["value"] if isinstance(orig_macro_rule["value"], str) else json.dumps(orig_macro_rule["value"])
                await conn.execute("UPDATE dietary_rules SET value = $1 WHERE id = $2", val, orig_macro_rule["id"])


@pytest.mark.asyncio
async def test_canvas_pw_multi_domain_cookie_validation(tmp_path, monkeypatch):
    """Verify Playwright storageState cookie validation works across arbitrary Canvas domains."""
    fake_state = tmp_path / "storageState.json"
    monkeypatch.setattr(canvas_pw, "STORAGE_STATE_PATH", fake_state)

    assert await canvas_pw.is_session_valid("https://canvas.instructure.com") is False

    fake_state.write_text(
        json.dumps({"cookies": [{"name": "canvas_session", "domain": ".instructure.com", "expires": -1}]}),
        encoding="utf-8",
    )
    assert await canvas_pw.is_session_valid("https://canvas.instructure.com") is True

    fake_state.write_text(
        json.dumps({"cookies": [{"name": "canvas_session", "domain": "canvas.stanford.edu", "expires": -1}]}),
        encoding="utf-8",
    )
    assert await canvas_pw.is_session_valid("https://canvas.stanford.edu") is True

    fake_state.write_text(
        json.dumps({"cookies": [{"name": "other", "domain": "unrelated.example.com", "expires": -1}]}),
        encoding="utf-8",
    )
    assert await canvas_pw.is_session_valid("https://canvas.stanford.edu") is False


def test_normalize_feed_url():
    """Verify webcal:// normalization and SSRF/non-HTTP rejection."""
    assert (
        calendar_feeds.normalize_feed_url("  webcal://p123-caldav.icloud.com/published/2/abc  ")
        == "https://p123-caldav.icloud.com/published/2/abc"
    )
    assert (
        calendar_feeds.normalize_feed_url("webcals://calendar.example.com/feed.ics")
        == "https://calendar.example.com/feed.ics"
    )
    assert (
        calendar_feeds.normalize_feed_url("https://calendar.google.com/calendar/ical/demo/basic.ics")
        == "https://calendar.google.com/calendar/ical/demo/basic.ics"
    )

    for bad_url in (
        "file:///etc/passwd",
        "ftp://example.com/feed.ics",
        "http://169.254.169.254/latest/meta-data/",
        "http://metadata.google.internal/computeMetadata/v1/",
        "http://localhost:8000/cal.ics",
        "http://127.0.0.1/cal.ics",
        "http://0.0.0.0/cal.ics",
    ):
        with pytest.raises(ValueError):
            calendar_feeds.normalize_feed_url(bad_url)


@pytest.mark.asyncio
async def test_calendar_feed_sync_deduplication_and_delete():
    """Verify POST /api/profile/calendar-feeds + repeated sync deduplicates by external_uid."""
    ics_v1 = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//Test//Test//EN\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:feed-evt-1\r\n"
        "SUMMARY:Team Standup v1\r\n"
        "DTSTART:20261202T150000Z\r\n"
        "DTEND:20261202T153000Z\r\n"
        "END:VEVENT\r\n"
        "BEGIN:VEVENT\r\n"
        "UID:feed-evt-2\r\n"
        "SUMMARY:Winter Holiday\r\n"
        "DTSTART;VALUE=DATE:20261224\r\n"
        "DTEND;VALUE=DATE:20261225\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    )
    ics_v2 = ics_v1.replace("Team Standup v1", "Team Standup v2")

    current_payload = {"text": ics_v1}

    def make_mock_client(*args, **kwargs):
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.text = current_payload["text"]
        mock_client = AsyncMock()
        mock_client.__aenter__.return_value = mock_client
        mock_client.__aexit__.return_value = False
        mock_client.get.return_value = mock_resp
        return mock_client

    created_feed_id = None
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            with patch("app.services.calendar_feeds.httpx.AsyncClient", side_effect=make_mock_client):
                create_resp = await ac.post(
                    "/api/profile/calendar-feeds",
                    json={
                        "name": "Apple Family",
                        "provider": "apple",
                        "feed_url": "webcal://p12-caldav.icloud.com/published/2/demo",
                        "color": "#38bdf8",
                        "sync_now": True,
                    },
                )
                assert create_resp.status_code == 200
                body = create_resp.json()
                assert body["status"] == "success"
                created_feed_id = body["feed"]["id"]
                assert body["feed"]["feed_url"] == "https://p12-caldav.icloud.com/published/2/demo"
                assert body["sync_result"]["events_synced"] == 2

                # Sync again with updated event summary -> verify upsert deduplication
                current_payload["text"] = ics_v2
                resync_resp = await ac.post(f"/api/profile/calendar-feeds/{created_feed_id}/sync")
                assert resync_resp.status_code == 200
                assert resync_resp.json()["events_synced"] == 2

            async with get_conn() as conn:
                rows = await conn.fetch(
                    "SELECT external_uid, summary FROM calendar_events WHERE external_uid LIKE $1 ORDER BY external_uid",
                    f"feed:{created_feed_id}:%",
                )
                assert len(rows) == 2
                by_uid = {r["external_uid"]: r["summary"] for r in rows}
                assert by_uid[f"feed:{created_feed_id}:feed-evt-1"] == "Team Standup v2"
                assert by_uid[f"feed:{created_feed_id}:feed-evt-2"] == "Winter Holiday"

            del_resp = await ac.delete(f"/api/profile/calendar-feeds/{created_feed_id}")
            assert del_resp.status_code == 200
            assert del_resp.json()["events_deleted"] == 2
            created_feed_id = None
    finally:
        if created_feed_id:
            async with get_conn() as conn:
                await conn.execute("DELETE FROM calendar_events WHERE external_uid LIKE $1", f"feed:{created_feed_id}:%")
                await conn.execute("DELETE FROM calendar_feeds WHERE id = $1", uuid.UUID(created_feed_id))


@pytest.mark.asyncio
async def test_calendar_import_ics_timed_and_allday():
    """Verify POST /api/calendar/import-ics handles timed, all-day DATE, RRULE recurring events, and removal."""
    from datetime import datetime, timedelta, timezone

    uid_prefix = uuid.uuid4().hex[:8]
    today_utc = datetime.now(timezone.utc)
    rrule_start = (today_utc - timedelta(days=7)).strftime("%Y%m%dT140000Z")
    rrule_end = (today_utc - timedelta(days=7)).strftime("%Y%m%dT150000Z")
    cal_name = f"Apple Personal {uid_prefix}"
    expected_cal_id = f"upload:apple-personal-{uid_prefix}"

    ics_payload = (
        "BEGIN:VCALENDAR\r\n"
        "VERSION:2.0\r\n"
        "PRODID:-//Apple Inc.//macOS Calendar//EN\r\n"
        "BEGIN:VEVENT\r\n"
        f"UID:timed-{uid_prefix}\r\n"
        "SUMMARY:Dentist Appointment\r\n"
        "LOCATION:Downtown Clinic\r\n"
        "DTSTART:20261205T140000\r\n"
        "DTEND:20261205T150000\r\n"
        "END:VEVENT\r\n"
        "BEGIN:VEVENT\r\n"
        f"UID:allday-{uid_prefix}\r\n"
        "SUMMARY:Study Break Day\r\n"
        "DTSTART;VALUE=DATE:20261206\r\n"
        "DTEND;VALUE=DATE:20261207\r\n"
        "END:VEVENT\r\n"
        "BEGIN:VEVENT\r\n"
        f"UID:weekly-{uid_prefix}\r\n"
        "SUMMARY:Weekly Sync Meeting\r\n"
        f"DTSTART:{rrule_start}\r\n"
        f"DTEND:{rrule_end}\r\n"
        "RRULE:FREQ=WEEKLY;COUNT=4\r\n"
        "END:VEVENT\r\n"
        "END:VCALENDAR\r\n"
    ).encode("utf-8")

    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp1 = await ac.post(
                "/api/calendar/import-ics",
                files={"file": ("calendar.ics", ics_payload, "text/calendar")},
                data={"calendar_name": cal_name, "provider": "apple", "color": "#10b981"},
            )
            assert resp1.status_code == 200
            body1 = resp1.json()
            assert body1["imported_count"] == 6  # 1 timed + 1 all-day + 4 weekly RRULE occurrences
            assert body1["calendar_id"] == expected_cal_id
            assert body1["feed"]["provider"] == "ics_file"

            # Re-import same UIDs -> must upsert cleanly without duplicates
            resp2 = await ac.post(
                "/api/calendar/import-ics",
                files={"file": ("calendar.ics", ics_payload, "text/calendar")},
                data={"calendar_name": cal_name, "provider": "apple", "color": "#10b981"},
            )
            assert resp2.status_code == 200
            assert resp2.json()["imported_count"] == 6

            # Verify GET /api/calendar/calendars lists this uploaded calendar
            cals_resp = await ac.get("/api/calendar/calendars")
            assert cals_resp.status_code == 200
            matched = [c for c in cals_resp.json() if c["calendar_id"] == expected_cal_id]
            assert len(matched) == 1
            assert matched[0]["event_count"] == 6
            assert matched[0]["feed_id"] == body1["feed"]["id"]

            # Verify DELETE /api/calendar/calendars/{calendar_id} removes events & feed cleanly
            del_resp = await ac.delete(f"/api/calendar/calendars/{expected_cal_id}")
            assert del_resp.status_code == 200
            assert del_resp.json()["events_deleted"] == 6
            assert del_resp.json()["feeds_deleted"] == 1

            cals_after = await ac.get("/api/calendar/calendars")
            assert not any(c["calendar_id"] == expected_cal_id for c in cals_after.json())
    finally:
        async with get_conn() as conn:
            await conn.execute("DELETE FROM calendar_events WHERE calendar_id = $1", expected_cal_id)
            await conn.execute("DELETE FROM calendar_feeds WHERE calendar_id = $1", expected_cal_id)


@pytest.mark.asyncio
async def test_upload_google_credentials_validation(tmp_path, monkeypatch):
    """Verify POST /api/profile/upload-google-credentials rejects invalid JSON and accepts OAuth payloads."""
    creds_target = tmp_path / "credentials.json"
    monkeypatch.setattr(settings, "google_credentials_path", str(creds_target))

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        bad_json_resp = await ac.post(
            "/api/profile/upload-google-credentials",
            files={"file": ("credentials.json", b"{not valid json", "application/json")},
        )
        assert bad_json_resp.status_code == 400

        missing_key_resp = await ac.post(
            "/api/profile/upload-google-credentials",
            files={"file": ("credentials.json", json.dumps({"hello": "world"}).encode("utf-8"), "application/json")},
        )
        assert missing_key_resp.status_code == 400

        valid_payload = {"installed": {"client_id": "demo-client.apps.googleusercontent.com", "project_id": "demo"}}
        ok_resp = await ac.post(
            "/api/profile/upload-google-credentials",
            files={"file": ("credentials.json", json.dumps(valid_payload).encode("utf-8"), "application/json")},
        )
        assert ok_resp.status_code == 200
        assert ok_resp.json()["google_configured"] is True
        assert creds_target.exists()


@pytest.mark.asyncio
async def test_upload_document_and_weather_fallback():
    """Verify POST /api/profile/upload-document indexes markdown and fetch_live_weather handles fallback/cache."""
    from app.services import profile_service

    # 1. Weather fallback when coordinates are missing
    neutral = await profile_service.fetch_live_weather(None, None, "America/Chicago", "Chicago, IL")
    assert neutral["location"] == "Chicago, IL"
    assert isinstance(neutral["hourly"], list)
    assert len(neutral["hourly"]) >= 6
    assert "icon" in neutral["hourly"][0]

    # 2. Upload document endpoint + cleanup
    source_path = "upload:canvas_syllabus:test_syllabus_upload.md"
    transport = ASGITransport(app=app)
    try:
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            resp = await ac.post(
                "/api/profile/upload-document",
                files={"file": ("test_syllabus_upload.md", b"# Course Policy\nMidterm is worth 25% of total grade.", "text/markdown")},
                data={"source_type": "canvas_syllabus", "course": "CS 101"},
            )
            assert resp.status_code == 200
            data = resp.json()
            assert data["status"] == "success"
            assert data["chunks_indexed"] >= 1
    finally:
        async with get_conn() as conn:
            await conn.execute("DELETE FROM document_embeddings WHERE source_path = $1", source_path)
