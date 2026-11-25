"""
Tests for Dual Model Router, Exam Mode, and Complexity Classification
"""
import pytest
from unittest.mock import patch
from app.services.model_router import classify_complexity, route_query, exclude_knowledge_base_from_prompt


def test_classify_complexity_simple():
    assert classify_complexity("What chicken recipe is quickest to make?") == "local"
    assert classify_complexity("Read my notes for LeetCode") == "local"
    assert classify_complexity("Where is my COMM 1014 class located?") == "local"


def test_classify_complexity_complex():
    assert classify_complexity("I want to go home on Friday, what schedule conflicts and deadlines do I need to look out for?") == "gemini"
    assert classify_complexity("How do I reschedule my study blocks around my exam week?") == "gemini"
    assert classify_complexity("Optimize my weekly grocery budget and meal prep and workout split") == "gemini"


@pytest.mark.asyncio
async def test_route_query_execution():
    """Verify route_query returns a valid response with telemetry."""
    res = await route_query("What are the key topics in Data Structures CS 3114?", exam_mode=True)
    assert res is not None
    assert "response" in res
    assert len(res["response"]) > 20
    assert res["routed_to"] == "gemini"
    assert res["exam_mode"] is True
    assert res["latency_ms"] > 0


@pytest.mark.asyncio
async def test_route_query_cloud_disabled_overrides_exam_mode():
    """Verify CLOUD_LLM_ENABLED=false plus EXAM_MODE=true never calls Gemini."""
    from app.config import settings
    orig = settings.cloud_llm_enabled
    try:
        settings.cloud_llm_enabled = False
        with patch("app.services.model_router.query_gemini") as mock_gemini:
            res = await route_query("What is the exam schedule for CS 3114?", exam_mode=True)
            mock_gemini.assert_not_called()
            assert res["routed_to"] == "local"
    finally:
        settings.cloud_llm_enabled = orig


@pytest.mark.asyncio
async def test_route_query_cloud_disabled_offline_returns_error():
    """Verify CLOUD_LLM_ENABLED=false with Ollama unreachable raises an error and makes no Gemini request."""
    from app.config import settings
    orig_cloud = settings.cloud_llm_enabled
    orig_url = settings.local_model_base_url
    try:
        settings.cloud_llm_enabled = False
        # Point to an unreachable port to simulate offline Ollama
        settings.local_model_base_url = "http://127.0.0.1:59999/v1"
        with patch("app.services.model_router.query_gemini") as mock_gemini:
            res = await route_query("What are my tasks for tomorrow?", force_gemini=True)
            mock_gemini.assert_not_called()
            assert res["routed_to"] == "local"
            assert "offline and cloud LLM fallback is disabled" in res["response"]
            assert "CLOUD_LLM_ENABLED=false" in res["response"]
    finally:
        settings.cloud_llm_enabled = orig_cloud
        settings.local_model_base_url = orig_url


def test_cloud_llm_enabled_present_in_config_and_env_example():
    """Verify CLOUD_LLM_ENABLED is present in config.py and .env.example."""
    from app.config import settings, ROOT_DIR
    assert hasattr(settings, "cloud_llm_enabled")
    assert isinstance(settings.cloud_llm_enabled, bool)

    env_example = (ROOT_DIR / ".env.example").read_text(encoding="utf-8")
    assert "CLOUD_LLM_ENABLED" in env_example


def test_exclude_knowledge_base_from_cloud_prompts():
    """Verify personal memory dossier is stripped from cloud prompts."""
    raw_prompt = (
        "=== VERIFIED LIFE-OPS MEMORY DOSSIER ===\n"
        "[PERSONAL PROFILE & ESSENTIAL FACTS]\n"
        "Lives at 120 College Park Ave\n\n"
        "=== TODAY'S SCHEDULE (EST) ===\n"
        "- CS 3114 at 9:00 AM\n"
    )
    sanitized = exclude_knowledge_base_from_prompt(raw_prompt)
    assert "120 College Park Ave" not in sanitized
    assert "EXCLUDED FROM CLOUD PROMPTS" in sanitized
    assert "CS 3114 at 9:00 AM" in sanitized

