from fastapi import APIRouter, Query, HTTPException, Path as FPath
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo
import uuid
import json
from ..db import get_conn
from ..services.grocery_service import (
    build_local_ingredient_comparisons,
    clamp_radius_miles,
    enrich_meals_with_live_stores,
    fetch_nearby_grocery_stores,
    search_live_store_products,
)
from ..services.profile_service import geocode_location, get_profile

router = APIRouter()


def _get_user_tz(profile: Dict[str, Any]) -> ZoneInfo:
    try:
        return ZoneInfo(profile.get("timezone") or "America/New_York")
    except Exception:
        return ZoneInfo("America/New_York")


class LogMealRequest(BaseModel):
    meal_name: str
    meal_type: Optional[str] = "lunch"
    calories: int
    protein_g: float
    carbs_g: Optional[float] = 0.0
    fat_g: Optional[float] = 0.0
    cost_estimate_cents: Optional[int] = 0
    date: Optional[str] = None  # YYYY-MM-DD, defaults to 2026-11-13 or current date


class ScheduleMealPrepRequest(BaseModel):
    prep_date: Optional[str] = "2026-11-15"  # Sunday
    start_time: Optional[str] = "15:00"      # 3:00 PM
    end_time: Optional[str] = "16:30"        # 4:30 PM
    meals: List[str] = ["Chipotle Marinated Chicken Rice Bowl (4x)", "High-Protein Greek Yogurt Parfait (4x)"]
    notes: Optional[str] = "Batch cook: 32 oz chicken, 6 cups jasmine rice, portion into 4 glass containers."


class CreateRecipeRequest(BaseModel):
    name: str
    meal_type: str = "lunch"
    ingredients: List[Dict[str, Any]]
    prep_time_min: int = 25
    calories: int = 650
    protein_g: float = 60.0
    cost_estimate_cents: int = 300
    instructions: str = "Cook ingredients to internal temperature, serve hot or pack for meal prep."
    tags: Optional[List[str]] = ["high-protein", "chicken", "meal-prep"]


@router.get("/meals")
async def list_meal_templates(
    meal_type: Optional[str] = Query(None, description="breakfast, lunch, dinner, snack"),
    radius_miles: Optional[int] = Query(None, ge=1, le=25),
) -> List[Dict[str, Any]]:
    """List deduplicated high-protein recipes enriched with live nearby store pricing."""
    profile = await get_profile()
    effective_radius = clamp_radius_miles(
        radius_miles if radius_miles is not None else profile.get("grocery_radius_miles"),
        default=5,
    )
    lat, lon, _ = await _resolve_profile_coords(profile)
    nearby_stores, _ = await fetch_nearby_grocery_stores(lat, lon, radius_miles=effective_radius)

    async with get_conn() as conn:
        if meal_type:
            rows = await conn.fetch("""
                SELECT DISTINCT ON (lower(name))
                    id, name, meal_type, ingredients, prep_time_min, calories, protein_g, cost_estimate_cents, instructions, tags
                FROM meal_templates
                WHERE meal_type = $1
                ORDER BY lower(name), name
            """, meal_type)
        else:
            rows = await conn.fetch("""
                SELECT DISTINCT ON (lower(name))
                    id, name, meal_type, ingredients, prep_time_min, calories, protein_g, cost_estimate_cents, instructions, tags
                FROM meal_templates
                ORDER BY lower(name), meal_type, name
            """)
        out = []
        for r in rows:
            d = dict(r)
            d["id"] = str(d["id"])
            out.append(d)
        out.sort(key=lambda m: (m.get("meal_type") or "", m.get("name") or ""))
        return enrich_meals_with_live_stores(out, nearby_stores)


async def _resolve_profile_coords(profile: Dict[str, Any]) -> tuple[Optional[float], Optional[float], str]:
    lat = profile.get("latitude")
    lon = profile.get("longitude")
    city = (profile.get("city") or "").strip()
    region = (profile.get("region") or "").strip()
    if (lat is None or lon is None) and city:
        geo = await geocode_location(f"{city} {region}".strip())
        if geo:
            lat = geo[0].get("latitude")
            lon = geo[0].get("longitude")
    loc_label = ", ".join(p for p in (city, region) if p) or "Location not set"
    return lat, lon, loc_label


@router.get("/nearby-stores")
async def get_nearby_stores(
    radius_miles: Optional[int] = Query(None, ge=1, le=25, description="Search radius in miles (1-25)"),
) -> Dict[str, Any]:
    """Discover live nearby supermarkets & grocery stores within `radius_miles` of the user's profile location."""
    profile = await get_profile()
    effective_radius = clamp_radius_miles(
        radius_miles if radius_miles is not None else profile.get("grocery_radius_miles"),
        default=5,
    )
    lat, lon, loc_label = await _resolve_profile_coords(profile)
    stores, source = await fetch_nearby_grocery_stores(lat, lon, radius_miles=effective_radius)

    return {
        "location_label": loc_label,
        "city": profile.get("city") or "",
        "region": profile.get("region") or "",
        "latitude": lat,
        "longitude": lon,
        "radius_miles": effective_radius,
        "source": source,
        "store_count": len(stores),
        "stores": stores,
    }


@router.get("/grocery-prices")
async def list_grocery_prices(
    category: Optional[str] = Query(None, description="protein, carb, dairy, produce, pantry")
) -> List[Dict[str, Any]]:
    """Get active local grocery store price estimates."""
    async with get_conn() as conn:
        if category:
            rows = await conn.fetch("""
                SELECT id, item_name, category, typical_unit, price_cents, store, city, updated_at
                FROM grocery_prices
                WHERE category = $1
                ORDER BY item_name, price_cents ASC
            """, category)
        else:
            rows = await conn.fetch("""
                SELECT id, item_name, category, typical_unit, price_cents, store, city, updated_at
                FROM grocery_prices
                ORDER BY category, item_name, price_cents ASC
            """)
        return [dict(r) for r in rows]


@router.get("/ingredient-search")
async def search_ingredients(
    q: Optional[str] = Query(None, description="Search term for item or product name"),
    category: Optional[str] = Query(None, description="protein, carb, dairy, produce, pantry"),
    radius_miles: Optional[int] = Query(None, ge=1, le=25, description="Store radius in miles (1-25)"),
    store: Optional[str] = Query(None, description="Optional store name or chain filter"),
) -> List[Dict[str, Any]]:
    """
    Search staples AND live Open Food Facts products with store price comparisons
    across nearby grocers in the user's configured radius.
    """
    profile = await get_profile()
    effective_radius = clamp_radius_miles(
        radius_miles if radius_miles is not None else profile.get("grocery_radius_miles"),
        default=5,
    )
    lat, lon, _ = await _resolve_profile_coords(profile)
    nearby_stores, _ = await fetch_nearby_grocery_stores(lat, lon, radius_miles=effective_radius)

    async with get_conn() as conn:
        db_rows = await conn.fetch(
            "SELECT id, item_name, category, typical_unit, price_cents, store, city FROM grocery_prices ORDER BY category, item_name"
        )
        custom_rows = [dict(r) for r in db_rows]

        if nearby_stores:
            staples = build_local_ingredient_comparisons(
                stores=nearby_stores,
                q=q,
                category=category,
                custom_db_rows=custom_rows,
                store_filter=store,
            )
            live_products: List[Dict[str, Any]] = []
            clean_q = (q or "").strip()
            if len(clean_q) >= 2 and (not category or category.lower() == "all"):
                live_products = await search_live_store_products(
                    clean_q,
                    nearby_stores=nearby_stores,
                    store_filter=store,
                    limit=10,
                )
            elif store and store.strip() and (not clean_q) and (not category or category.lower() == "all"):
                # Clicking a store without typing a query also fetches popular live chain items
                live_products = await search_live_store_products(
                    store.strip(),
                    nearby_stores=nearby_stores,
                    store_filter=store,
                    limit=8,
                )

            existing_titles = {s["item_name"].lower() for s in staples}
            merged = list(staples)
            for prod in live_products:
                if prod["item_name"].lower() not in existing_titles:
                    merged.append(prod)
            return merged

        # Fallback only if user coordinates/live OSM unavailable
        query = "SELECT id, item_name, category, typical_unit, price_cents, store, city FROM grocery_prices WHERE 1=1"
        params: List[Any] = []
        if q:
            words = q.strip().split()
            for w in words:
                term = w.rstrip("s") if len(w) > 3 and w.lower().endswith("s") else w
                params.append(f"%{term}%")
                query += f" AND item_name ILIKE ${len(params)}"
        if category and category.lower() != "all":
            params.append(category.lower())
            query += f" AND category = ${len(params)}"

        query += " ORDER BY category, item_name, price_cents ASC"
        rows = await conn.fetch(query, *params)

        grouped: Dict[str, Dict[str, Any]] = {}
        for r in rows:
            name = r["item_name"]
            if name not in grouped:
                grouped[name] = {
                    "item_name": name,
                    "category": r["category"],
                    "typical_unit": r["typical_unit"],
                    "stores": [],
                    "cheapest_store": None,
                    "cheapest_price_cents": None,
                    "max_price_cents": None,
                    "savings_cents": 0,
                    "savings_usd": "$0.00",
                }
            grouped[name]["stores"].append({
                "id": str(r["id"]),
                "store": r["store"],
                "price_cents": r["price_cents"],
                "price_usd": f"${r['price_cents'] / 100:.2f}",
            })

        results = []
        for name, data in grouped.items():
            stores = data["stores"]
            stores.sort(key=lambda s: s["price_cents"])
            for idx, s in enumerate(stores):
                s["is_cheapest"] = (idx == 0)

            if stores:
                data["cheapest_store"] = stores[0]["store"]
                data["cheapest_price_cents"] = stores[0]["price_cents"]
                data["max_price_cents"] = stores[-1]["price_cents"]
                data["savings_cents"] = max(0, stores[-1]["price_cents"] - stores[0]["price_cents"])
                data["savings_usd"] = f"${data['savings_cents'] / 100:.2f}"
            results.append(data)

        return results


@router.get("/dietary-rules")
async def list_dietary_rules() -> List[Dict[str, Any]]:
    """Get active dietary goals and restrictions from the database."""
    async with get_conn() as conn:
        rows = await conn.fetch("""
            SELECT id, rule_name, rule_type, value, notes, active
            FROM dietary_rules
            WHERE active = TRUE
            ORDER BY rule_type
        """)
        return [dict(r) for r in rows]


@router.get("/weekly-budget")
async def calculate_weekly_budget(
    radius_miles: Optional[int] = Query(None, ge=1, le=25),
) -> Dict[str, Any]:
    """Calculate estimated weekly grocery budget synced to profile targets & nearby stores."""
    profile = await get_profile()
    target_protein = int(profile.get("daily_protein_g") or 155)
    target_calories = int(profile.get("daily_calories_target") or 2600)
    effective_radius = clamp_radius_miles(
        radius_miles if radius_miles is not None else profile.get("grocery_radius_miles"),
        default=5,
    )
    lat, lon, loc_label = await _resolve_profile_coords(profile)
    nearby_stores, _ = await fetch_nearby_grocery_stores(lat, lon, radius_miles=effective_radius)

    async with get_conn() as conn:
        meals = await conn.fetch("""
            SELECT DISTINCT ON (lower(name)) cost_estimate_cents, protein_g, calories
            FROM meal_templates
            ORDER BY lower(name), meal_type
        """)
        total_meal_cost = sum(m["cost_estimate_cents"] for m in meals) * 3
        weekly_est_dollars = round((total_meal_cost or 5500) / 100, 2)

        if nearby_stores:
            comps = build_local_ingredient_comparisons(nearby_stores, q="chicken breast")
            if comps and comps[0]["stores"]:
                best = comps[0]["stores"][0]
                primary_protein = f"Chicken Breast ({best['price_usd']}/lb at {best['store_name']}, {best['distance_miles']} mi)"
            else:
                primary_protein = f"Boneless Skinless Chicken Breast (near {loc_label})"
        else:
            prices = await conn.fetch("SELECT price_cents, item_name, typical_unit, store FROM grocery_prices ORDER BY price_cents ASC")
            top_protein = next((p for p in prices if "chicken" in (p["item_name"] or "").lower()), None)
            if top_protein:
                primary_protein = f"{top_protein['item_name']} (${top_protein['price_cents'] / 100:.2f}/{top_protein['typical_unit']} at {top_protein['store']})"
            else:
                primary_protein = "Boneless Skinless Chicken Breast ($3.49/lb)"

        return {
            "weekly_grocery_estimate_usd": weekly_est_dollars,
            "target_daily_protein_g": target_protein,
            "target_daily_calories": target_calories,
            "primary_protein": primary_protein,
            "location_label": loc_label,
            "radius_miles": effective_radius,
            "nearby_stores_count": len(nearby_stores),
            "benchmark_items_count": len(comps) if nearby_stores else 26,
        }


@router.get("/daily-log")
async def get_daily_macro_log(
    date_str: Optional[str] = Query(None, alias="date", description="YYYY-MM-DD")
) -> Dict[str, Any]:
    """Get logged meals and computed macro progress for a given day."""
    profile = await get_profile()
    user_tz = _get_user_tz(profile)
    default_date = datetime.now(user_tz).date()
    target_date_str = date_str or default_date.isoformat()
    try:
        parsed_date = date.fromisoformat(target_date_str)
    except ValueError:
        parsed_date = default_date
        target_date_str = default_date.isoformat()

    async with get_conn() as conn:
        rows = await conn.fetch("""
            SELECT id, logged_date, meal_name, meal_type, calories, protein_g, carbs_g, fat_g, cost_estimate_cents, created_at
            FROM daily_macro_logs
            WHERE logged_date = $1
            ORDER BY created_at ASC
        """, parsed_date)

        logs = []
        tot_cals = 0
        tot_prot = 0.0
        tot_carbs = 0.0
        tot_fat = 0.0
        tot_cost = 0

        for r in rows:
            tot_cals += r["calories"]
            tot_prot += float(r["protein_g"])
            tot_carbs += float(r["carbs_g"] or 0)
            tot_fat += float(r["fat_g"] or 0)
            tot_cost += (r["cost_estimate_cents"] or 0)
            logs.append({
                "id": str(r["id"]),
                "logged_date": str(r["logged_date"]),
                "meal_name": r["meal_name"],
                "meal_type": r["meal_type"],
                "calories": r["calories"],
                "protein_g": float(r["protein_g"]),
                "carbs_g": float(r["carbs_g"] or 0),
                "fat_g": float(r["fat_g"] or 0),
                "cost_estimate_cents": r["cost_estimate_cents"] or 0,
                "cost_estimate_usd": f"${(r['cost_estimate_cents'] or 0) / 100:.2f}",
                "created_at": r["created_at"].isoformat() if r["created_at"] else None,
            })

        target_cals = int(profile.get("daily_calories_target") or 2600)
        target_prot = float(profile.get("daily_protein_g") or 155.0)
        target_carbs = float(profile.get("daily_carbs_g") or 320.0)
        target_fat = float(profile.get("daily_fats_g") or 75.0)

        return {
            "date": target_date_str,
            "target_calories": target_cals,
            "target_protein_g": target_prot,
            "target_carbs_g": target_carbs,
            "target_fat_g": target_fat,
            "total_calories": tot_cals,
            "total_protein_g": round(tot_prot, 1),
            "total_carbs_g": round(tot_carbs, 1),
            "total_fat_g": round(tot_fat, 1),
            "total_cost_usd": f"${tot_cost / 100:.2f}",
            "remaining_calories": max(0, target_cals - tot_cals),
            "remaining_protein_g": max(0.0, round(target_prot - tot_prot, 1)),
            "pct_calories": min(100, round((tot_cals / target_cals) * 100)) if target_cals > 0 else 0,
            "pct_protein": min(100, round((tot_prot / target_prot) * 100)) if target_prot > 0 else 0,
            "logs": logs,
        }


@router.get("/macro-history")
async def get_macro_history(
    days: int = Query(7, ge=1, le=30, description="Number of days to analyze"),
    end_date_str: Optional[str] = Query(None, alias="end_date", description="YYYY-MM-DD")
) -> Dict[str, Any]:
    """Retrieve multi-day macro tracking history with metrics for visual graphs."""
    profile = await get_profile()
    user_tz = _get_user_tz(profile)
    default_end = datetime.now(user_tz).date()
    target_end_str = end_date_str or default_end.isoformat()
    try:
        end_d = date.fromisoformat(target_end_str)
    except ValueError:
        end_d = default_end

    target_cals = int(profile.get("daily_calories_target") or 2600)
    target_prot = float(profile.get("daily_protein_g") or 155.0)
    
    start_d = end_d - timedelta(days=days - 1)

    async with get_conn() as conn:
        rows = await conn.fetch("""
            SELECT logged_date,
                   COALESCE(SUM(calories), 0) AS total_cals,
                   COALESCE(SUM(protein_g), 0) AS total_protein,
                   COALESCE(SUM(carbs_g), 0) AS total_carbs,
                   COALESCE(SUM(fat_g), 0) AS total_fat,
                   COALESCE(SUM(cost_estimate_cents), 0) AS total_cost_cents,
                   COUNT(*) AS meal_count
            FROM daily_macro_logs
            WHERE logged_date >= $1 AND logged_date <= $2
            GROUP BY logged_date
            ORDER BY logged_date ASC
        """, start_d, end_d)

        by_date = {r["logged_date"]: r for r in rows}

        history = []
        cals_sum = 0
        prot_sum = 0.0
        carbs_sum = 0.0
        fat_sum = 0.0
        total_cents = 0
        protein_hit_days = 0

        for i in range(days):
            cur_date = start_d + timedelta(days=i)
            r = by_date.get(cur_date)
            cals = int(r["total_cals"]) if r else 0
            prot = round(float(r["total_protein"]), 1) if r else 0.0
            carbs = round(float(r["total_carbs"]), 1) if r else 0.0
            fat = round(float(r["total_fat"]), 1) if r else 0.0
            cents = int(r["total_cost_cents"]) if r else 0
            count = int(r["meal_count"]) if r else 0

            cals_sum += cals
            prot_sum += prot
            carbs_sum += carbs
            fat_sum += fat
            total_cents += cents

            is_hit = prot >= target_prot
            if is_hit:
                protein_hit_days += 1

            history.append({
                "date": cur_date.isoformat(),
                "day_label": cur_date.strftime("%a %b %d"),
                "short_label": cur_date.strftime("%a"),
                "calories": cals,
                "protein_g": prot,
                "carbs_g": carbs,
                "fat_g": fat,
                "cost_estimate_cents": cents,
                "cost_usd": f"${cents / 100:.2f}",
                "meal_count": count,
                "protein_target": int(target_prot),
                "calorie_target": target_cals,
                "protein_hit": is_hit,
                "pct_protein": min(120, round((prot / target_prot) * 100)) if target_prot > 0 else 0,
                "pct_calories": min(120, round((cals / float(target_cals)) * 100)) if target_cals > 0 else 0,
                "is_today": (cur_date == end_d),
            })

        active_days = max(1, len([h for h in history if h["meal_count"] > 0]))
        avg_prot = round(prot_sum / active_days, 1)
        avg_cals = round(cals_sum / active_days)

        # Macro Energy Breakdown (% of calories)
        # Protein: 4 kcal/g, Carbs: 4 kcal/g, Fat: 9 kcal/g
        total_energy_kcal = (prot_sum * 4) + (carbs_sum * 4) + (fat_sum * 9)
        if total_energy_kcal > 0:
            pct_p = round(((prot_sum * 4) / total_energy_kcal) * 100)
            pct_c = round(((carbs_sum * 4) / total_energy_kcal) * 100)
            pct_f = 100 - pct_p - pct_c
        else:
            pct_p, pct_c, pct_f = 25, 50, 25

        return {
            "days": history,
            "period_days": days,
            "start_date": start_d.isoformat(),
            "end_date": end_d.isoformat(),
            "avg_daily_protein_g": avg_prot,
            "avg_daily_calories": avg_cals,
            "protein_floor_target": int(target_prot),
            "calorie_surplus_target": target_cals,
            "protein_hit_days": protein_hit_days,
            "active_days": active_days,
            "adherence_pct": round((protein_hit_days / active_days) * 100) if active_days > 0 else 0,
            "total_spend_usd": f"${total_cents / 100:.2f}",
            "macro_energy_pct": {
                "protein": pct_p,
                "carbs": pct_c,
                "fat": pct_f,
            }
        }


@router.post("/recipes")
async def create_recipe(payload: CreateRecipeRequest) -> Dict[str, Any]:
    """Create a new custom high-protein recipe with detailed ingredients list."""
    async with get_conn() as conn:
        row = await conn.fetchrow("""
            INSERT INTO meal_templates (
                name, meal_type, ingredients, prep_time_min, calories, protein_g, cost_estimate_cents, instructions, tags
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id, name, meal_type, ingredients, prep_time_min, calories, protein_g, cost_estimate_cents, instructions, tags
        """, payload.name, payload.meal_type, json.dumps(payload.ingredients), payload.prep_time_min, payload.calories, payload.protein_g, payload.cost_estimate_cents, payload.instructions, payload.tags or ["high-protein", "custom"])
        
        recipe_dict = dict(row)
        recipe_dict["id"] = str(recipe_dict["id"])
        return {
            "message": f"Recipe '{payload.name}' created successfully!",
            "recipe": recipe_dict
        }


@router.delete("/recipes/{recipe_id}")
async def delete_recipe(recipe_id: str = FPath(..., description="UUID of recipe/meal template")) -> Dict[str, Any]:
    """Delete a meal template/recipe from meal_templates."""
    try:
        uid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid recipe ID")

    async with get_conn() as conn:
        row = await conn.fetchrow("DELETE FROM meal_templates WHERE id = $1 RETURNING id, name", uid)
        if not row:
            raise HTTPException(status_code=404, detail="Recipe not found")
    return {"status": "deleted", "id": str(row["id"]), "name": row["name"]}


@router.post("/log-recipe/{recipe_id}")
async def log_recipe_to_daily(
    recipe_id: str = FPath(..., description="UUID of recipe/meal template"),
    date_str: Optional[str] = Query(None, alias="date")
) -> Dict[str, Any]:
    """1-click log an entire recipe to today's macro tracking log."""
    try:
        uid = uuid.UUID(recipe_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid recipe ID")

    profile = await get_profile()
    user_tz = _get_user_tz(profile)
    target_date_str = date_str or datetime.now(user_tz).date().isoformat()
    try:
        parsed_date = date.fromisoformat(target_date_str)
    except ValueError:
        parsed_date = datetime.now(user_tz).date()

    async with get_conn() as conn:
        recipe = await conn.fetchrow("""
            SELECT id, name, meal_type, calories, protein_g, cost_estimate_cents
            FROM meal_templates WHERE id = $1
        """, uid)
        if not recipe:
            raise HTTPException(status_code=404, detail="Recipe not found")

        # Estimate carbs and fat from calories and protein
        cal = recipe["calories"]
        prot = float(recipe["protein_g"])
        rem_cal = max(0, cal - int(prot * 4))
        est_carbs = round((rem_cal * 0.65) / 4, 1)
        est_fat = round((rem_cal * 0.35) / 9, 1)

        row = await conn.fetchrow("""
            INSERT INTO daily_macro_logs (
                logged_date, meal_name, meal_type, calories, protein_g, carbs_g, fat_g, cost_estimate_cents
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, logged_date, meal_name, meal_type, calories, protein_g, carbs_g, fat_g, cost_estimate_cents, created_at
        """, parsed_date, recipe["name"], recipe["meal_type"], recipe["calories"], recipe["protein_g"], est_carbs, est_fat, recipe["cost_estimate_cents"])

    summary = await get_daily_macro_log(target_date_str)
    return {
        "message": f"Logged {recipe['name']} to daily tracker!",
        "log": dict(row),
        "summary": summary
    }


@router.post("/log-meal")
async def log_meal(payload: LogMealRequest) -> Dict[str, Any]:
    """Add a meal item to the daily macro log."""
    profile = await get_profile()
    user_tz = _get_user_tz(profile)
    target_date_str = payload.date or datetime.now(user_tz).date().isoformat()
    try:
        parsed_date = date.fromisoformat(target_date_str)
    except ValueError:
        parsed_date = datetime.now(user_tz).date()

    async with get_conn() as conn:
        row = await conn.fetchrow("""
            INSERT INTO daily_macro_logs (
                logged_date, meal_name, meal_type, calories, protein_g, carbs_g, fat_g, cost_estimate_cents
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING id, logged_date, meal_name, meal_type, calories, protein_g, carbs_g, fat_g, cost_estimate_cents, created_at
        """, parsed_date, payload.meal_name, payload.meal_type, payload.calories, payload.protein_g, payload.carbs_g or 0, payload.fat_g or 0, payload.cost_estimate_cents or 0)

        created_log = {
            "id": str(row["id"]),
            "logged_date": str(row["logged_date"]),
            "meal_name": row["meal_name"],
            "meal_type": row["meal_type"],
            "calories": row["calories"],
            "protein_g": float(row["protein_g"]),
            "carbs_g": float(row["carbs_g"] or 0),
            "fat_g": float(row["fat_g"] or 0),
            "cost_estimate_cents": row["cost_estimate_cents"] or 0,
            "cost_estimate_usd": f"${(row['cost_estimate_cents'] or 0) / 100:.2f}",
        }

    summary = await get_daily_macro_log(target_date_str)
    return {"message": "Meal logged successfully", "log": created_log, "summary": summary}


@router.delete("/log-meal/{log_id}")
async def delete_logged_meal(log_id: str = FPath(..., description="UUID of logged meal")) -> Dict[str, Any]:
    """Delete a logged meal item from the daily log."""
    try:
        uid = uuid.UUID(log_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid log ID")

    async with get_conn() as conn:
        row = await conn.fetchrow("DELETE FROM daily_macro_logs WHERE id = $1 RETURNING id, logged_date", uid)
        if not row:
            raise HTTPException(status_code=404, detail="Log entry not found")
        date_str = str(row["logged_date"])

    summary = await get_daily_macro_log(date_str)
    return {"message": "Meal log removed", "deleted_id": log_id, "summary": summary}


@router.post("/reset-daily-log")
async def reset_daily_log(
    date_str: Optional[str] = Query(None, alias="date", description="YYYY-MM-DD")
) -> Dict[str, Any]:
    """Reset daily macro log for testing/clearing."""
    profile = await get_profile()
    user_tz = _get_user_tz(profile)
    target_date_str = date_str or datetime.now(user_tz).date().isoformat()
    try:
        parsed_date = date.fromisoformat(target_date_str)
    except ValueError:
        parsed_date = datetime.now(user_tz).date()
        target_date_str = parsed_date.isoformat()

    async with get_conn() as conn:
        await conn.execute("DELETE FROM daily_macro_logs WHERE logged_date = $1", parsed_date)
        # Re-seed baseline breakfast
        await conn.execute("""
            INSERT INTO daily_macro_logs (logged_date, meal_name, meal_type, calories, protein_g, carbs_g, fat_g, cost_estimate_cents)
            VALUES ($1, 'Egg White & Chicken Breast Breakfast Scramble', 'breakfast', 520, 60.0, 28.0, 14.0, 230)
        """, parsed_date)

    summary = await get_daily_macro_log(target_date_str)
    return {"message": "Daily log reset to baseline", "summary": summary}


@router.post("/schedule-meal-prep")
async def schedule_meal_prep(payload: ScheduleMealPrepRequest) -> Dict[str, Any]:
    """
    Schedule an autonomous Sunday (or custom) Meal Prep batch cooking block on Google Calendar.
    Tagged as life_ops_study_block for autopilot awareness and rollback logging.
    """
    profile = await get_profile()
    user_tz = _get_user_tz(profile)
    prep_date = payload.prep_date or datetime.now(user_tz).date().isoformat()
    start_time_str = payload.start_time or "15:00"
    end_time_str = payload.end_time or "16:30"
    
    try:
        d = date.fromisoformat(prep_date)
        sh, sm = map(int, start_time_str.split(":"))
        eh, em = map(int, end_time_str.split(":"))
        start_dt = datetime(d.year, d.month, d.day, sh, sm, tzinfo=user_tz)
        end_dt = datetime(d.year, d.month, d.day, eh, em, tzinfo=user_tz)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid date/time format: {e}")

    summary_text = f"Smart Meal Prep: {', '.join(payload.meals[:2])}"
    description_text = (
        f"Weekly High-Protein Lean-Bulk Meal Prep Batch.\n"
        f"Recipes: {', '.join(payload.meals)}\n"
        f"Notes: {payload.notes or 'Portion into airtight containers.'}\n"
        f"Scheduled via Life-Ops Health Hub."
    )

    async with get_conn() as conn:
        # Check if already scheduled in that slot
        existing = await conn.fetchrow("""
            SELECT id, summary, start_time, end_time FROM calendar_events
            WHERE start_time >= $1 AND end_time <= $2
              AND summary ILIKE '%Meal Prep%'
        """, start_dt, end_dt)

        if existing:
            return {
                "message": f"Meal prep block already exists at {start_time_str} – {end_time_str} on {prep_date}.",
                "event": dict(existing),
                "is_new": False,
            }

        row = await conn.fetchrow("""
            INSERT INTO calendar_events (
                calendar_id, calendar_name, summary, description, location, start_time, end_time, source, color
            )
            VALUES ('primary', 'Personal', $1, $2, 'Home Kitchen', $3, $4, 'life_ops_study_block', '#10b981')
            RETURNING id, summary, description, location, start_time, end_time, source, color
        """, summary_text, description_text, start_dt, end_dt)

        event_dict = dict(row)
        event_dict["id"] = str(event_dict["id"])
        event_dict["start_time"] = event_dict["start_time"].isoformat()
        event_dict["end_time"] = event_dict["end_time"].isoformat()

        # Insert into autopilot_logs for rollback guardrail
        await conn.execute("""
            INSERT INTO autopilot_logs (action_type, description, affected_ids, rollback_payload)
            VALUES ('meal_prep_scheduled', $1, $2, $3)
        """, f"Scheduled Sunday meal prep: {summary_text}", [row["id"]], json.dumps({str(row["id"]): {"_deleted": True}}))

        return {
            "message": f"Successfully scheduled Meal Prep session for {prep_date} ({start_time_str} - {end_time_str})!",
            "event": event_dict,
            "is_new": True,
        }
