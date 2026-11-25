"""
Tests for Canvas ICS Parsing and Ingestion Engine (Layer A)
"""
import pytest
from datetime import datetime, date, timezone
from app.jobs.canvas_ics import extract_course_name, to_utc_datetime, poll_canvas_ics
from app.services.profile_service import get_effective_canvas_config


def test_extract_course_name():
    assert extract_course_name("CS_3114_83568_202609 Project 2", "") == "CS 3114"
    assert extract_course_name("Weekly Meeting Minutes", "ENGE_2724_92471_202609") == "ENGE 2724"
    assert extract_course_name("COMM 1014 - Speech 1", "") == "COMM 1014"
    assert extract_course_name("EECS-280 Lab 1", "") == "EECS 280"
    assert extract_course_name("MATH240 Homework 1", "") == "MATH 240"
    assert extract_course_name("Generic Event without code", "No description") is None


def test_to_utc_datetime():
    # Naive datetime (interpreted as America/New_York time, EST = UTC-5 in November)
    dt_naive = datetime(2026, 11, 20, 14, 30)
    utc = to_utc_datetime(dt_naive)
    assert utc.tzinfo == timezone.utc
    assert utc.hour == 19  # 14:30 EST + 5h = 19:30 UTC
    assert utc.minute == 30

    # Date object (e.g. all-day event, defaults to 23:59:59 EST -> 04:59:59 UTC next day)
    d = date(2026, 11, 20)
    utc_from_date = to_utc_datetime(d)
    assert utc_from_date.tzinfo == timezone.utc
    assert utc_from_date.hour == 4
    assert utc_from_date.minute == 59
    assert utc_from_date.day == 21


@pytest.mark.asyncio
async def test_live_canvas_ics_poll():
    """Verify live polling when a non-placeholder CANVAS_ICS_URL is configured."""
    _, effective_ics = await get_effective_canvas_config()
    if not effective_ics or "PLACEHOLDER" in effective_ics.upper():
        pytest.skip("CANVAS_ICS_URL is unset or PLACEHOLDER; skipping live Canvas ICS poll.")

    result = await poll_canvas_ics()
    assert result["status"] == "success"
    stats = result["stats"]
    assert stats["active"] >= 0
