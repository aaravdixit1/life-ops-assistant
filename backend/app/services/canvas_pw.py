"""
Canvas Playwright Connector (Layer B)
Provides persistent browser context with storageState.json for SSO authentication
across any Canvas LMS host (university custom domains or canvas.instructure.com).
Fails gracefully to Layer A (.ics-only) mode when session cookies expire.
"""
import json
import logging
import time
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse

from playwright.async_api import async_playwright

from .profile_service import get_effective_canvas_config

logger = logging.getLogger(__name__)

STORAGE_STATE_PATH = Path(__file__).resolve().parent.parent.parent / "storageState.json"


def _cookie_matches_canvas_host(cookie_domain: str, target_host: str) -> bool:
    """Return True if a cookie domain applies to the configured Canvas hostname."""
    dom = (cookie_domain or "").lstrip(".").lower()
    host = (target_host or "").lower()
    if not dom or not host:
        return False

    if dom == host or host.endswith("." + dom) or dom.endswith("." + host):
        return True

    # Canvas Instructure-hosted institutions also set *.instructure.com session cookies
    if "instructure.com" in dom:
        return True

    # Check shared institution root domain (e.g. .stanford.edu for canvas.stanford.edu)
    host_parts = host.split(".")
    if len(host_parts) >= 2:
        root_domain = ".".join(host_parts[-2:])
        if dom == root_domain:
            return True

    return False


async def is_session_valid(base_url_override: Optional[str] = None) -> bool:
    """Check if storageState.json exists and contains active cookies for the configured Canvas host."""
    if not STORAGE_STATE_PATH.exists():
        return False
    try:
        data = json.loads(STORAGE_STATE_PATH.read_text(encoding="utf-8"))
        cookies = data.get("cookies", [])
        if not cookies:
            return False

        if base_url_override:
            base_url = base_url_override
        else:
            base_url, _ = await get_effective_canvas_config()

        target_host = (urlparse(base_url).hostname or "canvas.instructure.com").lower()
        now_ts = time.time()

        matching_cookies = [
            c
            for c in cookies
            if _cookie_matches_canvas_host(c.get("domain", ""), target_host)
            and (not c.get("expires") or float(c["expires"]) <= 0 or float(c["expires"]) > now_ts)
        ]
        return len(matching_cookies) > 0
    except Exception as e:
        logger.warning(f"Error checking storageState.json: {e}")
        return False


async def launch_login_flow(timeout_ms: int = 300_000) -> Dict[str, Any]:
    """
    Launch a headed browser for manual Canvas SSO login (university SSO / 2FA).
    Waits for successful redirect to the configured Canvas host, saves storageState.json, and closes browser.
    """
    base_url, _ = await get_effective_canvas_config()
    base_url = base_url.rstrip("/")
    target_host = (urlparse(base_url).hostname or "canvas.instructure.com").lower()
    login_url = f"{base_url}/login/canvas" if "login" not in base_url else base_url

    logger.info(f"Launching headed Chromium for Canvas SSO login at {login_url}")
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        context = await browser.new_context()
        page = await context.new_page()

        try:
            await page.goto(login_url)
            # Wait for user to complete SSO/2FA and land back on Canvas dashboard
            await page.wait_for_url(
                lambda url: (urlparse(url).hostname or "").lower() == target_host
                and "login" not in url.lower()
                and "cas" not in url.lower(),
                timeout=timeout_ms,
            )
            await context.storage_state(path=str(STORAGE_STATE_PATH))
            logger.info("Canvas SSO session cookies saved successfully to storageState.json")
            return {"status": "success", "message": "SSO session captured successfully", "host": target_host}
        except Exception as e:
            logger.error(f"Canvas login flow error or timeout: {e}")
            return {"status": "error", "message": str(e)}
        finally:
            await browser.close()


async def deep_fetch_assignment(assignment_url: str) -> Optional[Dict[str, Any]]:
    """
    Fetch full assignment rubric, HTML description, and submission details using Playwright.
    Falls back gracefully to None if cookies are expired.
    """
    if not await is_session_valid():
        logger.info("Canvas session not valid; skipping deep fetch (operating in .ics-only mode)")
        return None

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            context = await browser.new_context(storage_state=str(STORAGE_STATE_PATH))
            page = await context.new_page()

            await page.goto(assignment_url, timeout=30_000)

            current_url = page.url.lower()
            if "login" in current_url or "cas" in current_url:
                logger.warning("Session expired during deep fetch. Switching to .ics-only mode.")
                await browser.close()
                return None

            title = ""
            description_html = ""
            rubric_html = ""

            title_elem = await page.query_selector("h1.title, .assignment-title")
            if title_elem:
                title = (await title_elem.text_content() or "").strip()

            desc_elem = await page.query_selector(".description.user_content, #assignment_show .user_content")
            if desc_elem:
                description_html = await desc_elem.inner_html()

            rubric_elem = await page.query_selector("#rubrics.rubric_container, .rubric_container")
            if rubric_elem:
                rubric_html = await rubric_elem.inner_html()

            await browser.close()
            return {
                "title": title,
                "description_html": description_html,
                "rubric_html": rubric_html,
            }
    except Exception as e:
        logger.error(f"Playwright deep fetch failed for {assignment_url}: {e}")
        return None


if __name__ == "__main__":
    import asyncio
    import sys

    if "--login" in sys.argv:
        print("Launching headed browser for Canvas SSO login. Complete login & 2FA in the browser window...")
        res = asyncio.run(launch_login_flow())
        print(f"Canvas login result: {res.get('status')} - {res.get('message')}")
    else:
        print("Usage: python -m app.services.canvas_pw --login")
