"""
Milestone 1 Verification Tests
Tests config loading, google-genai import, asyncpg pool, and seeded tables.
"""
import pytest
import asyncpg
from app.config import settings


def test_config_loaded():
    assert settings.canvas_base_url.startswith("https://")
    assert "gemini" in settings.gemini_model
    assert settings.backend_port == 8000
    assert settings.user_timezone


def test_google_genai_import():
    from google import genai
    assert genai is not None


@pytest.mark.asyncio
async def test_database_connection_and_seeds():
    dsn = settings.database_url.replace("postgresql://", "postgres://", 1)
    conn = await asyncpg.connect(dsn)
    try:
        # Check extensions
        exts = await conn.fetch("SELECT extname FROM pg_extension WHERE extname IN ('vector', 'uuid-ossp')")
        ext_names = {r["extname"] for r in exts}
        assert "vector" in ext_names
        assert "uuid-ossp" in ext_names

        # Check university_dates (Fall 2026 / Spring 2027 academic calendar)
        univ_dates = await conn.fetchval("SELECT COUNT(*) FROM university_dates")
        assert univ_dates >= 20

        # Check core tables exist (user may clear sample calendar_events in /setup)
        tables = await conn.fetch(
            "SELECT tablename FROM pg_tables WHERE schemaname = 'public'"
        )
        table_names = {r["tablename"] for r in tables}
        for required in (
            "calendar_events",
            "calendar_feeds",
            "user_profile",
            "user_knowledge_base",
            "canvas_assignments",
        ):
            assert required in table_names

        # Check dietary rules
        diet_rules = await conn.fetchval("SELECT COUNT(*) FROM dietary_rules")
        assert diet_rules >= 4

        # Check meal templates
        meals = await conn.fetchval("SELECT COUNT(*) FROM meal_templates")
        assert meals >= 4

        # Check local grocery prices
        prices = await conn.fetchval("SELECT COUNT(*) FROM grocery_prices")
        assert prices >= 8

    finally:
        await conn.close()
