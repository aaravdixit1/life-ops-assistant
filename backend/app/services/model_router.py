"""
Dual-Model Router with Exam Mode & Resilient Fallback
Routes queries between local Ollama (Apple Silicon) and Google Gemini (Free Tier).
- Simple file queries / schedule lookups -> Ollama (llama3.2:3b)
- Multi-source reasoning / rescheduling / conflict analysis -> Gemini 3.5/3.8 Flash
- Exam Mode: Forces 100% cloud routing to keep local CPU/GPU completely idle.
- Seamless Fallback: If Ollama is offline/stopped, automatically falls back to Gemini.
"""
import time
import httpx
from typing import Dict, Any, Optional
from google import genai
from google.genai import types
from ..config import settings
from ..db import get_conn
from .profile_service import get_effective_gemini_api_key
import logging

logger = logging.getLogger(__name__)

COMPLEX_KEYWORDS = [
    "schedule", "conflict", "replan", "reschedule", "optimize",
    "compare", "between", "priority", "deadline", "exam", "test",
    "upcoming", "assignment", "assignments", "hw", "homework", "due", "deliverable",
    "what should i", "what do i need", "plan my week", "plan my day",
    "triage", "balance", "recommend", "how should i",
]


def classify_complexity(query: str) -> str:
    """Return 'gemini' for complex multi-source queries, 'local' otherwise."""
    q_lower = query.lower()
    if any(kw in q_lower for kw in COMPLEX_KEYWORDS):
        return "gemini"
    # Queries with multiple 'and' connecting different domains
    if q_lower.count(" and ") >= 2:
        return "gemini"
    return "local"


async def query_local(prompt: str, system: str = "") -> Dict[str, Any]:
    """Query local OpenAI-compatible endpoint (Ollama / MLX)."""
    start = time.time()
    endpoint = f"{settings.local_model_base_url.rstrip('/')}/chat/completions"
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.post(
                endpoint,
                json={
                    "model": settings.local_model_name,
                    "messages": messages,
                    "temperature": 0.3,
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                content = data["choices"][0]["message"]["content"]
                latency = int((time.time() - start) * 1000)
                return {
                    "response": content,
                    "routed_to": "local",
                    "model": settings.local_model_name,
                    "latency_ms": latency,
                }
            if not settings.cloud_llm_enabled:
                logger.error(f"Local model returned status {resp.status_code} and cloud routing is disabled (CLOUD_LLM_ENABLED=false).")
                return {
                    "response": f"Local model returned status {resp.status_code} and cloud LLM fallback is disabled via CLOUD_LLM_ENABLED=false.",
                    "routed_to": "local",
                    "model": settings.local_model_name,
                    "latency_ms": int((time.time() - start) * 1000),
                }
            logger.warning(f"Local model returned status {resp.status_code}, falling back to Gemini")
    except Exception as e:
        if not settings.cloud_llm_enabled:
            logger.error(f"Local model unreachable ({e}) and cloud routing is disabled (CLOUD_LLM_ENABLED=false).")
            return {
                "response": "Local model (Ollama) is offline and cloud LLM fallback is disabled via CLOUD_LLM_ENABLED=false.",
                "routed_to": "local",
                "model": settings.local_model_name,
                "latency_ms": int((time.time() - start) * 1000),
            }
        logger.info(f"Local model unreachable ({e}). Gracefully falling back to Gemini.")

    # Graceful fallback to Gemini
    return await query_gemini(prompt, system)


def exclude_knowledge_base_from_prompt(text: str) -> str:
    """
    Excludes user_knowledge_base personal profile, residence, and cadence entries from prompts
    sent to cloud models (Google Gemini), preserving 100% local privacy by default.
    """
    import re
    if not text:
        return ""
    # Strip any memory dossier / knowledge base section matching header markers
    pattern = r'=== [A-Z\s\'-]*MEMOR[A-Z\s\'-]*DOSSIER ===.*?(?=\n===|\nUser Message|\nSystem Context|$)'
    cleaned = re.sub(
        pattern,
        '=== PERSONAL KNOWLEDGE BASE (EXCLUDED FROM CLOUD PROMPTS) ===\n[Personal profile and memory entries are kept local-only by default]\n',
        text,
        flags=re.DOTALL | re.IGNORECASE
    )
    return cleaned


async def query_gemini(prompt: str, system: str = "") -> Dict[str, Any]:
    """Query Google Gemini via google-genai SDK (Free Tier)."""
    if not settings.cloud_llm_enabled:
        return {
            "response": "Cloud LLM queries are disabled via CLOUD_LLM_ENABLED=false.",
            "routed_to": "gemini",
            "model": "disabled",
            "latency_ms": 0,
        }

    api_key, _ = await get_effective_gemini_api_key()
    if not api_key:
        return {
            "response": "Gemini API key is not configured. Please add your free key in Setup & Integrations or set GEMINI_API_KEY in .env.",
            "routed_to": "gemini",
            "model": "none",
            "latency_ms": 0,
        }

    start = time.time()
    client = genai.Client(api_key=api_key)

    # Sanitize prompts for cloud: exclude personal knowledge base entries by default
    clean_prompt = exclude_knowledge_base_from_prompt(prompt)
    clean_system = exclude_knowledge_base_from_prompt(system) if system else ""

    full_prompt = f"System Context:\n{clean_system}\n\nUser Request:\n{clean_prompt}" if clean_system else clean_prompt

    # Primary model with fallback
    models_to_try = [settings.gemini_model, "gemini-2.5-flash-lite", "gemini-2.0-flash"]
    last_error = None

    for model_name in models_to_try:
        try:
            response = client.models.generate_content(
                model=model_name,
                contents=full_prompt,
                config=types.GenerateContentConfig(
                    temperature=0.4,
                    max_output_tokens=1500,
                ),
            )
            latency = int((time.time() - start) * 1000)
            return {
                "response": response.text or "",
                "routed_to": "gemini",
                "model": model_name,
                "latency_ms": latency,
            }
        except Exception as e:
            last_error = e
            logger.warning(f"Gemini model {model_name} failed: {e}. Trying fallback...")

    logger.error(f"All Gemini models failed: {last_error}")
    return {
        "response": f"Gemini query failed: {last_error}",
        "routed_to": "gemini",
        "model": "failed",
        "latency_ms": int((time.time() - start) * 1000),
    }


async def route_query(
    query: str,
    system_context: str = "",
    force_gemini: bool = False,
    exam_mode: Optional[bool] = None,
) -> Dict[str, Any]:
    """
    Main routing entrypoint.
    Inspects query complexity, exam mode state, and executes query.
    Logs telemetry to Postgres ai_query_logs.
    """
    is_exam = exam_mode if exam_mode is not None else settings.exam_mode

    # When cloud routing is disabled, enforce local routing regardless of Exam Mode or complexity
    if not settings.cloud_llm_enabled:
        target = "local"
    elif is_exam or force_gemini:
        target = "gemini"
    else:
        target = classify_complexity(query)

    if target == "local":
        result = await query_local(query, system_context)
    else:
        result = await query_gemini(query, system_context)

    result["exam_mode"] = is_exam

    # Record telemetry into Postgres
    try:
        async with get_conn() as conn:
            await conn.execute("""
                INSERT INTO ai_query_logs (query, routed_to, model_name, response, latency_ms, exam_mode)
                VALUES ($1, $2, $3, $4, $5, $6)
            """, query, result.get("routed_to", target), result.get("model", "unknown"),
               result.get("response", "")[:2000], result.get("latency_ms", 0), is_exam)
    except Exception as e:
        logger.warning(f"Failed to record ai_query_log: {e}")

    return result
