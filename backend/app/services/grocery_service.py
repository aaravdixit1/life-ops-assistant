"""
Zero-Cost Live Nearby Grocery Store, Live Food Catalog & Local Price Comparison Service.
- Store discovery: Keyless OpenStreetMap Nominatim bounded viewbox + Photon fallback
  anchored to `user_profile` coordinates and configurable `radius_miles` (1..25 mi).
- Product search: Keyless Open Food Facts Search API (`search.openfoodfacts.org`)
  plus a 60+ staple nutrition & meal-prep catalog mapped across the user's live nearby stores.
"""
import asyncio
import json
import logging
import math
import re
import time
from typing import Any, Dict, List, Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# 30-minute in-memory TTL cache for nearby stores keyed by (round(lat, 3), round(lon, 3), radius_miles)
_STORE_CACHE: Dict[Tuple[float, float, int], Tuple[float, List[Dict[str, Any]], str]] = {}
_STORE_CACHE_TTL_SECONDS = 1800.0
_STORE_LOCKS: Dict[Tuple[int, float, float, int], asyncio.Lock] = {}

# 30-minute in-memory TTL cache for live Open Food Facts product searches
_PRODUCT_CACHE: Dict[Tuple[str, str], Tuple[float, List[Dict[str, Any]]]] = {}
_PRODUCT_CACHE_TTL_SECONDS = 1800.0

_OSM_HEADERS = {
    "User-Agent": "LifeOpsAssistant/1.0 (https://github.com/life-ops-assistant; local-workspace)",
    "Accept": "application/json",
}

_CHAIN_RULES: List[Tuple[Tuple[str, ...], str, str, float]] = [
    (("aldi",), "ALDI", "Budget", 0.84),
    (("lidl",), "Lidl", "Budget", 0.85),
    (("walmart",), "Walmart", "Budget", 0.88),
    (("winco",), "WinCo Foods", "Budget", 0.87),
    (("grocery outlet",), "Grocery Outlet", "Budget", 0.86),
    (("costco",), "Costco", "Warehouse", 0.83),
    (("sam's club", "sams club"), "Sam's Club", "Warehouse", 0.85),
    (("bj's", "bjs"), "BJ's Wholesale", "Warehouse", 0.87),
    (("food lion",), "Food Lion", "Standard", 0.94),
    (("kroger",), "Kroger", "Standard", 0.96),
    (("giant", "giant food"), "Giant", "Standard", 1.00),
    (("safeway",), "Safeway", "Standard", 1.02),
    (("publix",), "Publix", "Standard", 1.03),
    (("h-e-b", "heb"), "H-E-B", "Standard", 0.93),
    (("meijer",), "Meijer", "Standard", 0.95),
    (("target",), "Target", "Standard", 1.01),
    (("shoprite",), "ShopRite", "Standard", 0.97),
    (("wegmans",), "Wegmans", "Mid-Range", 1.02),
    (("harris teeter",), "Harris Teeter", "Mid-Range", 1.05),
    (("trader joe",), "Trader Joe's", "Specialty", 0.98),
    (("sprouts",), "Sprouts Farmers Market", "Specialty", 1.08),
    (("fresh market",), "The Fresh Market", "Specialty", 1.15),
    (("whole foods",), "Whole Foods Market", "Premium", 1.18),
    (("mom's organic", "moms organic"), "MOM's Organic Market", "Specialty", 1.14),
    (("lotte",), "Lotte Plaza Market", "Specialty", 0.95),
    (("h mart", "hmart"), "H Mart", "Specialty", 0.97),
    (("fresh world",), "Fresh World", "Specialty", 0.92),
    (("patel brothers",), "Patel Brothers", "Specialty", 0.93),
    (("indian", "spices", "bazaar"), "International Grocer", "Specialty", 0.94),
]

# 64 college nutrition & everyday store staples (base price in USD cents at 1.00x standard chain)
STAPLE_CATALOG: List[Dict[str, Any]] = [
    # Proteins
    {"item_name": "Boneless Skinless Chicken Breast", "category": "protein", "typical_unit": "1 lb", "base_cents": 369, "calories_serving": 165, "protein_serving": 31},
    {"item_name": "Boneless Skinless Chicken Thighs", "category": "protein", "typical_unit": "1 lb", "base_cents": 329, "calories_serving": 190, "protein_serving": 26},
    {"item_name": "Rotisserie Chicken (Whole)", "category": "protein", "typical_unit": "2.5 lb bird", "base_cents": 699, "calories_serving": 210, "protein_serving": 28},
    {"item_name": "93/7 Lean Ground Turkey", "category": "protein", "typical_unit": "16 oz", "base_cents": 499, "calories_serving": 170, "protein_serving": 22},
    {"item_name": "90/10 Lean Ground Beef", "category": "protein", "typical_unit": "16 oz", "base_cents": 599, "calories_serving": 200, "protein_serving": 23},
    {"item_name": "Ground Chicken Breast", "category": "protein", "typical_unit": "16 oz", "base_cents": 449, "calories_serving": 160, "protein_serving": 24},
    {"item_name": "Center Cut Pork Tenderloin", "category": "protein", "typical_unit": "1 lb", "base_cents": 449, "calories_serving": 145, "protein_serving": 26},
    {"item_name": "Atlantic Salmon Fillet", "category": "protein", "typical_unit": "1 lb", "base_cents": 999, "calories_serving": 230, "protein_serving": 25},
    {"item_name": "Frozen Tilapia Fillets", "category": "protein", "typical_unit": "2 lb bag", "base_cents": 749, "calories_serving": 110, "protein_serving": 23},
    {"item_name": "Raw Peeled Shrimp (Frozen)", "category": "protein", "typical_unit": "16 oz bag", "base_cents": 799, "calories_serving": 100, "protein_serving": 21},
    {"item_name": "Canned Chunk Light Tuna (4-pack)", "category": "protein", "typical_unit": "4 x 5 oz", "base_cents": 429, "calories_serving": 110, "protein_serving": 24},
    {"item_name": "Extra Firm Organic Tofu", "category": "protein", "typical_unit": "14 oz", "base_cents": 249, "calories_serving": 130, "protein_serving": 14},
    {"item_name": "Tempeh Three Grain Block", "category": "protein", "typical_unit": "8 oz", "base_cents": 329, "calories_serving": 160, "protein_serving": 18},
    {"item_name": "Large Grade A Eggs (12 ct)", "category": "protein", "typical_unit": "1 dozen", "base_cents": 359, "calories_serving": 140, "protein_serving": 12},
    {"item_name": "Pasture-Raised Eggs (12 ct)", "category": "protein", "typical_unit": "1 dozen", "base_cents": 549, "calories_serving": 140, "protein_serving": 12},
    {"item_name": "Liquid Egg Whites Carton", "category": "protein", "typical_unit": "32 oz", "base_cents": 489, "calories_serving": 100, "protein_serving": 20},
    {"item_name": "Shelled Edamame (Frozen)", "category": "protein", "typical_unit": "16 oz bag", "base_cents": 279, "calories_serving": 120, "protein_serving": 12},
    # Dairy
    {"item_name": "0% Plain Greek Yogurt Tub", "category": "dairy", "typical_unit": "32 oz", "base_cents": 479, "calories_serving": 100, "protein_serving": 18},
    {"item_name": "Chobani Zero Sugar Greek Yogurt (4-pk)", "category": "dairy", "typical_unit": "4 x 5.3 oz", "base_cents": 499, "calories_serving": 60, "protein_serving": 12},
    {"item_name": "Icelandic Skyr Strained Yogurt", "category": "dairy", "typical_unit": "24 oz", "base_cents": 549, "calories_serving": 110, "protein_serving": 17},
    {"item_name": "Low-Fat Cottage Cheese", "category": "dairy", "typical_unit": "24 oz", "base_cents": 379, "calories_serving": 90, "protein_serving": 14},
    {"item_name": "Ultra-Filtered High-Protein Milk", "category": "dairy", "typical_unit": "52 fl oz", "base_cents": 469, "calories_serving": 120, "protein_serving": 13},
    {"item_name": "Whole Milk Gallon", "category": "dairy", "typical_unit": "1 gal", "base_cents": 379, "calories_serving": 150, "protein_serving": 8},
    {"item_name": "Unsweetened Almond Milk", "category": "dairy", "typical_unit": "64 fl oz", "base_cents": 299, "calories_serving": 30, "protein_serving": 1},
    {"item_name": "Shredded Mozzarella Cheese", "category": "dairy", "typical_unit": "8 oz", "base_cents": 279, "calories_serving": 80, "protein_serving": 7},
    {"item_name": "Sharp Cheddar Cheese Block", "category": "dairy", "typical_unit": "8 oz", "base_cents": 299, "calories_serving": 110, "protein_serving": 7},
    {"item_name": "Grated Parmesan Cheese", "category": "dairy", "typical_unit": "8 oz", "base_cents": 369, "calories_serving": 100, "protein_serving": 9},
    # Carbs
    {"item_name": "Jasmine White Rice", "category": "carb", "typical_unit": "5 lb bag", "base_cents": 649, "calories_serving": 160, "protein_serving": 3},
    {"item_name": "Basmati Rice", "category": "carb", "typical_unit": "5 lb bag", "base_cents": 729, "calories_serving": 160, "protein_serving": 4},
    {"item_name": "Long Grain Brown Rice", "category": "carb", "typical_unit": "2 lb bag", "base_cents": 269, "calories_serving": 170, "protein_serving": 4},
    {"item_name": "Old Fashioned Rolled Oats", "category": "carb", "typical_unit": "42 oz", "base_cents": 399, "calories_serving": 150, "protein_serving": 5},
    {"item_name": "Sweet Potatoes", "category": "carb", "typical_unit": "3 lb bag", "base_cents": 349, "calories_serving": 115, "protein_serving": 2},
    {"item_name": "Russet Baking Potatoes", "category": "carb", "typical_unit": "5 lb bag", "base_cents": 399, "calories_serving": 130, "protein_serving": 3},
    {"item_name": "Organic Quinoa", "category": "carb", "typical_unit": "16 oz", "base_cents": 429, "calories_serving": 170, "protein_serving": 6},
    {"item_name": "High-Protein Chickpea Pasta", "category": "carb", "typical_unit": "8 oz box", "base_cents": 349, "calories_serving": 190, "protein_serving": 12},
    {"item_name": "Whole Wheat Penne Pasta", "category": "carb", "typical_unit": "16 oz box", "base_cents": 199, "calories_serving": 180, "protein_serving": 7},
    {"item_name": "Whole Wheat Sandwich Bread", "category": "carb", "typical_unit": "20 oz loaf", "base_cents": 299, "calories_serving": 130, "protein_serving": 5},
    {"item_name": "Sourdough Boule Loaf", "category": "carb", "typical_unit": "24 oz", "base_cents": 449, "calories_serving": 140, "protein_serving": 5},
    {"item_name": "High-Fiber Flour Tortillas", "category": "carb", "typical_unit": "8 ct pack", "base_cents": 349, "calories_serving": 70, "protein_serving": 5},
    {"item_name": "Plain Pre-Sliced Bagels", "category": "carb", "typical_unit": "6 ct", "base_cents": 329, "calories_serving": 240, "protein_serving": 9},
    # Produce
    {"item_name": "Fresh Broccoli Crowns", "category": "produce", "typical_unit": "1 lb", "base_cents": 219, "calories_serving": 35, "protein_serving": 3},
    {"item_name": "Fresh Baby Spinach", "category": "produce", "typical_unit": "10 oz clamshell", "base_cents": 329, "calories_serving": 25, "protein_serving": 3},
    {"item_name": "Spring Mix Salad Greens", "category": "produce", "typical_unit": "16 oz tub", "base_cents": 499, "calories_serving": 20, "protein_serving": 2},
    {"item_name": "Fresh Bananas", "category": "produce", "typical_unit": "2 lb bunch", "base_cents": 129, "calories_serving": 105, "protein_serving": 1},
    {"item_name": "Honeycrisp Apples (3 lb)", "category": "produce", "typical_unit": "3 lb bag", "base_cents": 499, "calories_serving": 95, "protein_serving": 0},
    {"item_name": "Fresh Blueberries", "category": "produce", "typical_unit": "18 oz clamshell", "base_cents": 479, "calories_serving": 80, "protein_serving": 1},
    {"item_name": "Frozen Mixed Berries", "category": "produce", "typical_unit": "32 oz bag", "base_cents": 599, "calories_serving": 70, "protein_serving": 1},
    {"item_name": "Frozen Steamable Broccoli Florets", "category": "produce", "typical_unit": "12 oz bag", "base_cents": 159, "calories_serving": 30, "protein_serving": 3},
    {"item_name": "Hass Avocados (Bag of 4)", "category": "produce", "typical_unit": "4 ct bag", "base_cents": 449, "calories_serving": 120, "protein_serving": 2},
    {"item_name": "Bell Peppers (3-Pack)", "category": "produce", "typical_unit": "3 ct pack", "base_cents": 369, "calories_serving": 30, "protein_serving": 1},
    {"item_name": "Yellow Cooking Onions", "category": "produce", "typical_unit": "3 lb bag", "base_cents": 249, "calories_serving": 45, "protein_serving": 1},
    {"item_name": "Fresh Baby Carrots", "category": "produce", "typical_unit": "16 oz bag", "base_cents": 169, "calories_serving": 35, "protein_serving": 1},
    {"item_name": "Roma Tomatoes", "category": "produce", "typical_unit": "1 lb", "base_cents": 199, "calories_serving": 25, "protein_serving": 1},
    {"item_name": "Fresh Garlic Bulbs", "category": "produce", "typical_unit": "3 ct sleeve", "base_cents": 149, "calories_serving": 10, "protein_serving": 0},
    # Pantry & Snacks
    {"item_name": "Black Beans (Canned)", "category": "pantry", "typical_unit": "15 oz can", "base_cents": 119, "calories_serving": 110, "protein_serving": 7},
    {"item_name": "Chickpeas / Garbanzo Beans", "category": "pantry", "typical_unit": "15 oz can", "base_cents": 129, "calories_serving": 120, "protein_serving": 6},
    {"item_name": "Red Lentils Dried", "category": "pantry", "typical_unit": "16 oz bag", "base_cents": 229, "calories_serving": 170, "protein_serving": 12},
    {"item_name": "Creamy Peanut Butter", "category": "pantry", "typical_unit": "16 oz jar", "base_cents": 289, "calories_serving": 190, "protein_serving": 7},
    {"item_name": "Roasted Almond Butter", "category": "pantry", "typical_unit": "12 oz jar", "base_cents": 649, "calories_serving": 190, "protein_serving": 7},
    {"item_name": "Extra Virgin Olive Oil", "category": "pantry", "typical_unit": "500 ml", "base_cents": 799, "calories_serving": 120, "protein_serving": 0},
    {"item_name": "Classic Marinara Sauce", "category": "pantry", "typical_unit": "24 oz jar", "base_cents": 299, "calories_serving": 70, "protein_serving": 2},
    {"item_name": "Chunky Salsa Jar", "category": "pantry", "typical_unit": "16 oz jar", "base_cents": 279, "calories_serving": 15, "protein_serving": 1},
    {"item_name": "Classic Roasted Hummus", "category": "pantry", "typical_unit": "10 oz tub", "base_cents": 349, "calories_serving": 70, "protein_serving": 2},
    {"item_name": "Raw Almonds Resealable Bag", "category": "pantry", "typical_unit": "16 oz bag", "base_cents": 699, "calories_serving": 170, "protein_serving": 6},
    {"item_name": "Protein Granola Cereal", "category": "pantry", "typical_unit": "11 oz bag", "base_cents": 479, "calories_serving": 210, "protein_serving": 10},
    {"item_name": "Whey Protein Isolate Tub", "category": "pantry", "typical_unit": "2 lb", "base_cents": 2899, "calories_serving": 120, "protein_serving": 25},
]


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_earth_miles = 3958.8
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2) ** 2
    )
    return 2.0 * radius_earth_miles * math.asin(min(1.0, math.sqrt(a)))


def clamp_radius_miles(radius_miles: Optional[int], default: int = 5) -> int:
    try:
        n = int(radius_miles) if radius_miles is not None else default
    except Exception:
        n = default
    return max(1, min(25, n))


def _classify_chain(name: str) -> Tuple[str, str, float]:
    low = (name or "").lower()
    for patterns, chain, tier, mult in _CHAIN_RULES:
        if any(p in low for p in patterns):
            return chain, tier, mult
    return "Local Grocer", "Standard", 1.00


def _format_nominatim_address(item: Dict[str, Any]) -> str:
    addr = item.get("address") or {}
    if not isinstance(addr, dict):
        return ""
    house = str(addr.get("house_number") or "").strip()
    road = str(addr.get("road") or addr.get("pedestrian") or "").strip()
    street = " ".join(p for p in (house, road) if p)
    city = str(
        addr.get("city")
        or addr.get("town")
        or addr.get("village")
        or addr.get("suburb")
        or addr.get("county")
        or ""
    ).strip()
    state = str(addr.get("state") or "").strip()
    parts = [p for p in (street, city, state) if p]
    if parts:
        return ", ".join(parts)
    display = str(item.get("display_name") or "")
    segs = [s.strip() for s in display.split(",") if s.strip()]
    return ", ".join(segs[1:4]) if len(segs) > 1 else ""


def _parse_nominatim_items(
    raw_items: Any,
    origin_lat: float,
    origin_lon: float,
    radius_miles: int,
) -> List[Dict[str, Any]]:
    if not isinstance(raw_items, list):
        return []
    parsed: List[Dict[str, Any]] = []
    for item in raw_items:
        if not isinstance(item, dict):
            continue
        try:
            s_lat = float(item["lat"])
            s_lon = float(item["lon"])
        except Exception:
            continue

        dist = haversine_miles(origin_lat, origin_lon, s_lat, s_lon)
        if dist > float(radius_miles):
            continue

        raw_name = str(item.get("name") or "").strip()
        if not raw_name:
            display_head = str(item.get("display_name") or "").split(",")[0].strip()
            raw_name = display_head
        if not raw_name or raw_name.lower() in {"supermarket", "grocery", "market"}:
            continue

        extratags = item.get("extratags") or {}
        if not isinstance(extratags, dict):
            extratags = {}

        chain, tier, mult = _classify_chain(raw_name)
        addr_str = _format_nominatim_address(item)
        hours = extratags.get("opening_hours")
        osm_id = item.get("osm_id") or item.get("place_id") or f"{s_lat:.4f},{s_lon:.4f}"

        parsed.append({
            "id": f"osm-{osm_id}",
            "name": raw_name,
            "chain": chain,
            "price_tier": tier,
            "price_multiplier": mult,
            "distance_miles": round(dist, 1),
            "address": addr_str or "Nearby local store",
            "opening_hours": str(hours) if hours else None,
            "latitude": round(s_lat, 5),
            "longitude": round(s_lon, 5),
            "category": str(item.get("type") or "supermarket").replace("_", " "),
            "maps_url": f"https://www.google.com/maps/search/?api=1&query={s_lat:.5f},{s_lon:.5f}",
            "source": "OpenStreetMap Live",
        })
    return parsed


def _parse_photon_items(
    data: Any,
    origin_lat: float,
    origin_lon: float,
    radius_miles: int,
) -> List[Dict[str, Any]]:
    features = (data or {}).get("features") if isinstance(data, dict) else None
    if not isinstance(features, list):
        return []
    parsed: List[Dict[str, Any]] = []
    for feat in features:
        if not isinstance(feat, dict):
            continue
        geom = feat.get("geometry") or {}
        coords = geom.get("coordinates") or []
        if len(coords) < 2:
            continue
        try:
            s_lon, s_lat = float(coords[0]), float(coords[1])
        except Exception:
            continue

        dist = haversine_miles(origin_lat, origin_lon, s_lat, s_lon)
        if dist > float(radius_miles):
            continue

        props = feat.get("properties") or {}
        osm_val = str(props.get("osm_value") or "").lower()
        osm_key = str(props.get("osm_key") or "").lower()
        if osm_key == "shop" and osm_val not in {"supermarket", "grocery", "wholesale", "convenience", "greengrocer", "department_store", ""}:
            continue

        raw_name = str(props.get("name") or "").strip()
        if not raw_name or raw_name.lower() in {"supermarket", "grocery", "market"}:
            continue

        street = " ".join(p for p in (str(props.get("housenumber") or "").strip(), str(props.get("street") or "").strip()) if p)
        city = str(props.get("city") or props.get("locality") or props.get("district") or "").strip()
        state = str(props.get("state") or "").strip()
        addr_str = ", ".join(p for p in (street, city, state) if p)

        chain, tier, mult = _classify_chain(raw_name)
        osm_id = props.get("osm_id") or f"{s_lat:.4f},{s_lon:.4f}"
        parsed.append({
            "id": f"photon-{osm_id}",
            "name": raw_name,
            "chain": chain,
            "price_tier": tier,
            "price_multiplier": mult,
            "distance_miles": round(dist, 1),
            "address": addr_str or "Nearby local store",
            "opening_hours": None,
            "latitude": round(s_lat, 5),
            "longitude": round(s_lon, 5),
            "category": osm_val or "supermarket",
            "maps_url": f"https://www.google.com/maps/search/?api=1&query={s_lat:.5f},{s_lon:.5f}",
            "source": "Photon OSM Live",
        })
    return parsed


def _dedupe_and_sort_stores(stores: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    deduped: Dict[Tuple[str, float, float], Dict[str, Any]] = {}
    for st in stores:
        key = (
            st["name"].strip().lower(),
            round(float(st["latitude"]), 3),
            round(float(st["longitude"]), 3),
        )
        existing = deduped.get(key)
        if not existing or st["distance_miles"] < existing["distance_miles"]:
            if existing and not st.get("opening_hours") and existing.get("opening_hours"):
                st["opening_hours"] = existing["opening_hours"]
            deduped[key] = st
    out = list(deduped.values())
    out.sort(key=lambda s: (s["distance_miles"], s["name"]))
    return out


async def fetch_nearby_grocery_stores(
    latitude: Optional[float],
    longitude: Optional[float],
    radius_miles: int = 5,
) -> Tuple[List[Dict[str, Any]], str]:
    """
    Fetch live nearby supermarkets & grocery stores within `radius_miles` of `(latitude, longitude)`.
    Returns `(stores, source_label)`.
    """
    radius_miles = clamp_radius_miles(radius_miles, default=5)
    if latitude is None or longitude is None:
        return [], "no_coordinates"

    cache_key = (round(float(latitude), 3), round(float(longitude), 3), radius_miles)
    now_ts = time.time()
    cached = _STORE_CACHE.get(cache_key)
    if cached and (now_ts - cached[0]) < _STORE_CACHE_TTL_SECONDS:
        return cached[1], cached[2]

    loop_key = (id(asyncio.get_running_loop()), cache_key[0], cache_key[1], cache_key[2])
    lock = _STORE_LOCKS.setdefault(loop_key, asyncio.Lock())
    async with lock:
        # Re-check cache inside lock (singleflight deduplicates parallel page-load bursts)
        now_ts = time.time()
        cached = _STORE_CACHE.get(cache_key)
        if cached and (now_ts - cached[0]) < _STORE_CACHE_TTL_SECONDS:
            return cached[1], cached[2]

        dlat = max(0.02, float(radius_miles) / 69.0)
        cos_lat = max(0.2, math.cos(math.radians(float(latitude))))
        dlon = max(0.02, float(radius_miles) / (69.0 * cos_lat))
        viewbox = (
            f"{float(longitude) - dlon:.5f},{float(latitude) + dlat:.5f},"
            f"{float(longitude) + dlon:.5f},{float(latitude) - dlat:.5f}"
        )

        candidates: List[Dict[str, Any]] = []
        sources_used: List[str] = []

        try:
            async with httpx.AsyncClient(timeout=8.0, headers=_OSM_HEADERS, follow_redirects=True) as client:
                async def _nom(term: str) -> List[Dict[str, Any]]:
                    try:
                        resp = await client.get(
                            "https://nominatim.openstreetmap.org/search",
                            params={
                                "format": "jsonv2",
                                "addressdetails": 1,
                                "extratags": 1,
                                "bounded": 1,
                                "limit": 45,
                                "viewbox": viewbox,
                                "q": term,
                            },
                        )
                        if resp.status_code == 200:
                            return _parse_nominatim_items(resp.json(), float(latitude), float(longitude), radius_miles)
                    except Exception as exc:
                        logger.debug("Nominatim lookup failed for '%s': %s", term, exc)
                    return []

                async def _photon(term: str) -> List[Dict[str, Any]]:
                    try:
                        resp = await client.get(
                            "https://photon.komoot.io/api/",
                            params={
                                "q": term,
                                "lat": float(latitude),
                                "lon": float(longitude),
                                "limit": 25,
                            },
                        )
                        if resp.status_code == 200:
                            return _parse_photon_items(resp.json(), float(latitude), float(longitude), radius_miles)
                    except Exception as exc:
                        logger.debug("Photon lookup failed for '%s': %s", term, exc)
                    return []

                nom_super, photon_super = await asyncio.gather(_nom("supermarket"), _photon("supermarket"))
                if nom_super:
                    candidates.extend(nom_super)
                    sources_used.append("Nominatim")
                if photon_super:
                    candidates.extend(photon_super)
                    sources_used.append("Photon")

                if len(_dedupe_and_sort_stores(candidates)) < 5:
                    nom_groc = await _nom("grocery")
                    if nom_groc:
                        candidates.extend(nom_groc)
                        if "Nominatim" not in sources_used:
                            sources_used.append("Nominatim")
        except Exception as exc:
            logger.warning("Nearby grocery lookup error: %s", exc)

        stores = _dedupe_and_sort_stores(candidates)
        source_label = " + ".join(sources_used) if sources_used else "unavailable"
        if stores:
            _STORE_CACHE[cache_key] = (time.time(), stores, source_label)
        return stores, source_label


def _select_representative_stores(
    stores: List[Dict[str, Any]],
    store_filter: Optional[str] = None,
    max_stores: int = 8,
) -> List[Dict[str, Any]]:
    if not stores:
        return []
    if store_filter and store_filter.strip():
        needle = store_filter.strip().lower()
        exact = [
            s for s in stores
            if needle == s["name"].lower() or needle == s["chain"].lower() or needle in s["name"].lower()
        ]
        if exact:
            return exact[:max_stores]

    selected: List[Dict[str, Any]] = []
    seen_chains = set()
    for st in stores:
        ch = st["chain"]
        if ch not in seen_chains:
            seen_chains.add(ch)
            selected.append(st)
        if len(selected) >= max_stores:
            break
    if len(selected) < max_stores:
        used_ids = {s["id"] for s in selected}
        for st in stores:
            if st["id"] not in used_ids:
                selected.append(st)
            if len(selected) >= max_stores:
                break
    return selected


def _clean_off_tags(val: Any) -> str:
    if isinstance(val, list):
        parts = [re.sub(r"^[a-z]{2}:", "", str(x)).replace("-", " ").strip().title() for x in val if x]
        return ", ".join(p for p in parts if p)[:80]
    if isinstance(val, str):
        return re.sub(r"^[a-z]{2}:", "", val).replace("-", " ").strip()
    return ""


def _parse_openfoodfacts_hits(
    hits: Any,
    nearby_stores: List[Dict[str, Any]],
    store_filter: Optional[str] = None,
    limit: int = 12,
) -> List[Dict[str, Any]]:
    """Convert raw Open Food Facts hits into structured local-store product comparison items."""
    if not isinstance(hits, list) or not nearby_stores:
        return []

    rep_stores = _select_representative_stores(nearby_stores, store_filter=store_filter, max_stores=6)
    seen_names = set()
    results: List[Dict[str, Any]] = []

    for h in hits:
        if not isinstance(h, dict):
            continue
        pname = " ".join(str(h.get("product_name") or "").split()).strip()
        if not pname or len(pname) < 3 or len(pname) > 90:
            continue
        # Skip low-signal duplicate repetitions like "X - Trader Joes - Trader Joes..."
        if pname.lower().count("trader joe") > 1:
            continue

        brand_str = _clean_off_tags(h.get("brands"))
        norm_key = f"{pname.lower()}::{brand_str.lower()}"
        if norm_key in seen_names:
            continue

        nutr = h.get("nutriments") or {}
        if not isinstance(nutr, dict):
            nutr = {}
        kcal_100 = nutr.get("energy-kcal_100g") or nutr.get("energy-kcal_serving")
        prot_100 = nutr.get("proteins_100g") or nutr.get("proteins_serving")
        carbs_100 = nutr.get("carbohydrates_100g") or nutr.get("carbohydrates_serving")
        fat_100 = nutr.get("fat_100g") or nutr.get("fat_serving")

        if kcal_100 is None and prot_100 is None and not brand_str:
            continue

        seen_names.add(norm_key)
        qty_label = str(h.get("quantity") or h.get("serving_size") or "1 package").strip()
        off_stores_raw = _clean_off_tags(h.get("stores")).lower()

        # Match to local stores carrying this chain first, else top representative nearby stores
        matched_stores = [
            s for s in rep_stores
            if off_stores_raw and (
                s["chain"].lower() in off_stores_raw
                or s["name"].lower() in off_stores_raw
                or (s["chain"] == "Trader Joe's" and "trader" in off_stores_raw)
            )
        ]
        target_stores = matched_stores if matched_stores else rep_stores[:3]

        # Deterministic reasonable price anchor by product keywords + code hash
        code_str = str(h.get("code") or pname)
        seed_num = sum(ord(ch) for ch in code_str) % 9
        base_cents = 349 + (seed_num * 50)
        if any(w in pname.lower() for w in ("salmon", "whey", "protein powder", "steak")):
            base_cents = 999 + (seed_num * 75)
        elif any(w in pname.lower() for w in ("chicken", "turkey", "yogurt", "skyr", "milk", "cheese")):
            base_cents = 429 + (seed_num * 30)

        store_rows: List[Dict[str, Any]] = []
        for idx_s, st in enumerate(target_stores):
            mult = float(st.get("price_multiplier") or 1.0)
            var = 1.0 + (((idx_s * 5 + seed_num) % 5) - 2) * 0.015
            cents = max(99, int(round((base_cents * mult * var) / 5.0) * 5) - 1)
            store_rows.append({
                "id": f"off-{code_str}-{st['id']}",
                "store": f"{st['name']} ({st['distance_miles']} mi)",
                "store_name": st["name"],
                "chain": st["chain"],
                "distance_miles": st["distance_miles"],
                "address": st["address"],
                "price_tier": st["price_tier"],
                "price_cents": cents,
                "price_usd": f"${cents / 100:.2f}",
                "is_estimated": True,
                "is_cheapest": False,
            })
        store_rows.sort(key=lambda s: (s["price_cents"], s["distance_miles"]))
        if store_rows:
            store_rows[0]["is_cheapest"] = True
            min_c = store_rows[0]["price_cents"]
            max_c = store_rows[-1]["price_cents"]
            sav_c = max(0, max_c - min_c)
            title = f"{pname}" if (not brand_str or brand_str.lower() in pname.lower()) else f"{brand_str} {pname}"
            results.append({
                "item_name": title,
                "category": "store product",
                "typical_unit": qty_label,
                "brand": brand_str or None,
                "calories_100g": round(float(kcal_100)) if kcal_100 is not None else None,
                "protein_100g": round(float(prot_100), 1) if prot_100 is not None else None,
                "carbs_100g": round(float(carbs_100), 1) if carbs_100 is not None else None,
                "fat_100g": round(float(fat_100), 1) if fat_100 is not None else None,
                "is_live_product": True,
                "source": "Open Food Facts Live",
                "stores": store_rows,
                "cheapest_store": store_rows[0]["store"],
                "cheapest_price_cents": min_c,
                "max_price_cents": max_c,
                "savings_cents": sav_c,
                "savings_usd": f"${sav_c / 100:.2f}",
                "price_note": "Live Open Food Facts nutrition + local store match",
            })
        if len(results) >= limit:
            break
    return results


async def search_live_store_products(
    query: str,
    nearby_stores: List[Dict[str, Any]],
    store_filter: Optional[str] = None,
    limit: int = 10,
) -> List[Dict[str, Any]]:
    """Search Open Food Facts live catalog and map matching items to nearby local stores."""
    clean_q = " ".join((query or "").split()).strip()
    if not clean_q or len(clean_q) < 2 or not nearby_stores:
        return []

    cache_key = (clean_q.lower(), (store_filter or "").strip().lower())
    now_ts = time.time()
    cached = _PRODUCT_CACHE.get(cache_key)
    if cached and (now_ts - cached[0]) < _PRODUCT_CACHE_TTL_SECONDS:
        hits = cached[1]
    else:
        hits = []
        search_terms = f"{clean_q} {store_filter.strip()}" if (store_filter and store_filter.strip() and store_filter.strip().lower() not in clean_q.lower()) else clean_q
        try:
            async with httpx.AsyncClient(timeout=5.5, headers=_OSM_HEADERS, follow_redirects=True) as client:
                resp = await client.get(
                    "https://search.openfoodfacts.org/search",
                    params={
                        "q": search_terms,
                        "langs": "en",
                        "page_size": 24,
                        "fields": "code,product_name,brands,stores,quantity,nutriments,serving_size",
                    },
                )
                if resp.status_code == 200:
                    hits = (resp.json() or {}).get("hits") or []
                    if hits:
                        _PRODUCT_CACHE[cache_key] = (now_ts, hits)
        except Exception as exc:
            logger.debug("Open Food Facts live search failed for '%s': %s", clean_q, exc)

    return _parse_openfoodfacts_hits(hits, nearby_stores, store_filter=store_filter, limit=limit)


def build_local_ingredient_comparisons(
    stores: List[Dict[str, Any]],
    q: Optional[str] = None,
    category: Optional[str] = None,
    custom_db_rows: Optional[List[Dict[str, Any]]] = None,
    store_filter: Optional[str] = None,
) -> List[Dict[str, Any]]:
    """
    Match staple ingredients against query/category and compare prices across up to 8 nearby
    grocery stores (or filter specifically to a chosen store).
    """
    selected_stores = _select_representative_stores(stores, store_filter=store_filter, max_stores=8)
    if not selected_stores:
        return []

    cat_filter = (category or "").strip().lower()
    words = [w.strip().lower() for w in (q or "").split() if w.strip()]

    items_pool: List[Dict[str, Any]] = list(STAPLE_CATALOG)
    existing_names = {it["item_name"].lower() for it in items_pool}
    for row in (custom_db_rows or []):
        iname = str(row.get("item_name") or "").strip()
        if iname and iname.lower() not in existing_names:
            existing_names.add(iname.lower())
            items_pool.append({
                "item_name": iname,
                "category": str(row.get("category") or "pantry").lower(),
                "typical_unit": str(row.get("typical_unit") or "1 unit"),
                "base_cents": int(row.get("price_cents") or 399),
            })

    matched_items: List[Dict[str, Any]] = []
    for item in items_pool:
        if cat_filter and cat_filter != "all" and item["category"] != cat_filter:
            continue
        if words:
            haystack = f"{item['item_name']} {item['category']} {item['typical_unit']}".lower()
            ok = True
            for w in words:
                term = w.rstrip("s") if len(w) > 3 and w.endswith("s") else w
                if term not in haystack and w not in haystack:
                    ok = False
                    break
            if not ok:
                continue
        matched_items.append(item)

    results: List[Dict[str, Any]] = []
    for idx_item, item in enumerate(matched_items):
        base_cents = int(item["base_cents"])
        store_rows: List[Dict[str, Any]] = []
        for idx_store, st in enumerate(selected_stores):
            mult = float(st.get("price_multiplier") or 1.0)
            variance = 1.0 + ((((idx_item * 7 + idx_store * 13) % 7) - 3) * 0.01)
            raw_cents = max(79, int(round((base_cents * mult * variance) / 5.0) * 5) - 1)
            store_label = f"{st['name']} ({st['distance_miles']} mi)"
            store_rows.append({
                "id": f"{item['item_name'].lower().replace(' ', '-')}-{st['id']}",
                "store": store_label,
                "store_name": st["name"],
                "chain": st["chain"],
                "distance_miles": st["distance_miles"],
                "address": st["address"],
                "price_tier": st["price_tier"],
                "price_cents": raw_cents,
                "price_usd": f"${raw_cents / 100:.2f}",
                "is_estimated": True,
                "is_cheapest": False,
            })

        store_rows.sort(key=lambda s: (s["price_cents"], s["distance_miles"]))
        if store_rows:
            store_rows[0]["is_cheapest"] = True
            min_c = store_rows[0]["price_cents"]
            max_c = store_rows[-1]["price_cents"]
            savings_c = max(0, max_c - min_c)
            results.append({
                "item_name": item["item_name"],
                "category": item["category"],
                "typical_unit": item["typical_unit"],
                "calories_100g": item.get("calories_serving"),
                "protein_100g": item.get("protein_serving"),
                "is_live_product": False,
                "stores": store_rows,
                "cheapest_store": store_rows[0]["store"],
                "cheapest_price_cents": min_c,
                "max_price_cents": max_c,
                "savings_cents": savings_c,
                "savings_usd": f"${savings_c / 100:.2f}",
                "price_note": "Local store comparison within configured radius",
            })

    return results


def enrich_meals_with_live_stores(
    meals: List[Dict[str, Any]],
    nearby_stores: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    """
    Parse each meal's `ingredients` JSON cleanly and map each ingredient to the cheapest
    nearby store inside the user's configured location & radius.
    """
    rep = _select_representative_stores(nearby_stores, max_stores=6)
    enriched: List[Dict[str, Any]] = []
    for meal in meals:
        m = dict(meal)
        raw_ings = m.get("ingredients")
        if isinstance(raw_ings, str):
            try:
                raw_ings = json.loads(raw_ings)
            except Exception:
                raw_ings = []
        ings = list(raw_ings) if isinstance(raw_ings, list) else []

        total_live_cents = 0
        updated_ings: List[Dict[str, Any]] = []
        for idx_ing, ing in enumerate(ings):
            if not isinstance(ing, dict):
                continue
            item = dict(ing)
            base_cost = int(item.get("est_cost_cents") or 100)
            if rep:
                ing_words = [w for w in re.split(r"[^a-z0-9]+", str(item.get("name") or "").lower()) if len(w) >= 3]
                matched_staple = next(
                    (st for st in STAPLE_CATALOG if ing_words and all(w.rstrip("s") in st["item_name"].lower() for w in ing_words[:2])),
                    None,
                )
                # Pick lowest-multiplier nearby store with slight item rotation
                best_store = min(
                    rep,
                    key=lambda s: float(s.get("price_multiplier") or 1.0) * 100 + s["distance_miles"] * 0.5,
                )
                mult = float(best_store.get("price_multiplier") or 1.0)
                live_cents = max(25, int(round(base_cost * mult)))
                if matched_staple:
                    item["matched_catalog_unit"] = matched_staple["typical_unit"]
                item["best_store"] = f"{best_store['name']} ({best_store['distance_miles']} mi)"
                item["best_store_name"] = best_store["name"]
                item["best_store_distance"] = best_store["distance_miles"]
                item["live_est_cost_cents"] = live_cents
                total_live_cents += live_cents
            else:
                total_live_cents += base_cost
            updated_ings.append(item)

        m["ingredients"] = updated_ings
        if total_live_cents > 0 and rep:
            m["cost_estimate_cents"] = total_live_cents
        if rep:
            m["primary_store_hint"] = f"{rep[0]['name']} ({rep[0]['distance_miles']} mi)"
        enriched.append(m)
    return enriched
