"""
Integration Tests for FastAPI Endpoints
"""
import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.db import close_db


@pytest.fixture(autouse=True)
async def cleanup_db():
    yield
    await close_db()


@pytest.mark.asyncio
async def test_healthz():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/healthz")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"


@pytest.mark.asyncio
async def test_canvas_assignments_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/canvas/assignments")
        assert resp.status_code == 200
        items = resp.json()
        assert isinstance(items, list)
        assert len(items) > 0


@pytest.mark.asyncio
async def test_canvas_session_status():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/canvas/session-status")
        assert resp.status_code == 200
        data = resp.json()
        assert "session_valid" in data
        assert "mode" in data


@pytest.mark.asyncio
async def test_health_endpoints():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        # Meals
        meals_resp = await ac.get("/api/health/meals")
        assert meals_resp.status_code == 200
        assert len(meals_resp.json()) >= 4

        # Grocery prices
        prices_resp = await ac.get("/api/health/grocery-prices")
        assert prices_resp.status_code == 200
        assert len(prices_resp.json()) >= 8

        # Dietary rules
        rules_resp = await ac.get("/api/health/dietary-rules")
        assert rules_resp.status_code == 200
        assert len(rules_resp.json()) >= 4

        # Weekly budget
        budget_resp = await ac.get("/api/health/weekly-budget")
        assert budget_resp.status_code == 200
        budget = budget_resp.json()
        assert budget["target_daily_protein_g"] == 155
        assert budget["weekly_grocery_estimate_usd"] > 0

        # Daily Macro Log
        daily_resp = await ac.get("/api/health/daily-log?date=2026-11-13")
        assert daily_resp.status_code == 200
        daily_data = daily_resp.json()
        assert "target_calories" in daily_data
        assert daily_data["target_calories"] == 2600
        assert daily_data["target_protein_g"] == 155.0

        # Log a meal
        log_payload = {
            "date": "2026-11-13",
            "meal_name": "Test Chipotle Bowl",
            "meal_type": "lunch",
            "calories": 680,
            "protein_g": 65.0,
            "carbs_g": 70.0,
            "fat_g": 15.0,
            "cost_estimate_cents": 275
        }
        log_resp = await ac.post("/api/health/log-meal", json=log_payload)
        assert log_resp.status_code == 200
        log_res = log_resp.json()
        assert log_res["log"]["meal_name"] == "Test Chipotle Bowl"
        created_id = log_res["log"]["id"]

        # Delete logged meal
        del_resp = await ac.delete(f"/api/health/log-meal/{created_id}")
        assert del_resp.status_code == 200

        # Ingredient search with store comparisons
        search_resp = await ac.get("/api/health/ingredient-search?q=chicken")
        assert search_resp.status_code == 200
        search_data = search_resp.json()
        assert len(search_data) >= 1
        assert "cheapest_store" in search_data[0]
        assert len(search_data[0]["stores"]) >= 1

        # Schedule meal prep
        prep_payload = {
            "prep_date": "2026-11-15",
            "start_time": "15:00",
            "end_time": "16:30",
            "meals": ["Chipotle Bowls (4x)", "Greek Yogurt Parfait (4x)"]
        }
        prep_resp = await ac.post("/api/health/schedule-meal-prep", json=prep_payload)
        assert prep_resp.status_code == 200
        assert "event" in prep_resp.json()

        # Macro history for graphs
        history_resp = await ac.get("/api/health/macro-history?days=7")
        assert history_resp.status_code == 200
        history_data = history_resp.json()
        assert "days" in history_data
        assert len(history_data["days"]) == 7
        assert "avg_daily_protein_g" in history_data
        assert "macro_energy_pct" in history_data

        # Create custom recipe with ingredients
        recipe_payload = {
            "name": "Chicken Thigh & Sweet Potato Skillet",
            "meal_type": "dinner",
            "prep_time_min": 25,
            "calories": 680,
            "protein_g": 62.0,
            "cost_estimate_cents": 320,
            "instructions": "Pan sear chicken thighs, roast sweet potatoes, combine with olive oil and spices.",
            "ingredients": [
                {"name": "Boneless Skinless Chicken Thighs", "qty": 8, "unit": "oz", "protein_g": 52, "est_cost_cents": 200},
                {"name": "Sweet Potatoes", "qty": 1.5, "unit": "cup", "protein_g": 3, "est_cost_cents": 80},
                {"name": "Extra Virgin Olive Oil", "qty": 1, "unit": "tbsp", "protein_g": 0, "est_cost_cents": 40}
            ],
            "tags": ["high-protein", "chicken-thighs", "lean-bulk"]
        }
        recipe_resp = await ac.post("/api/health/recipes", json=recipe_payload)
        assert recipe_resp.status_code == 200
        created_recipe = recipe_resp.json()["recipe"]
        assert created_recipe["name"] == "Chicken Thigh & Sweet Potato Skillet"
        recipe_id = created_recipe["id"]

        # 1-click log recipe
        log_recipe_resp = await ac.post(f"/api/health/log-recipe/{recipe_id}?date=2026-11-13")
        assert log_recipe_resp.status_code == 200
        assert log_recipe_resp.json()["log"]["meal_name"] == "Chicken Thigh & Sweet Potato Skillet"


@pytest.mark.asyncio
async def test_autopilot_logs_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.get("/api/autopilot/logs")
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_ai_exam_mode_endpoint():
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        resp = await ac.post("/api/ai/exam-mode", json={"enabled": True})
        assert resp.status_code == 200
        data = resp.json()
        assert data["exam_mode"] is True
