"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Utensils,
  DollarSign,
  Flame,
  Dumbbell,
  ShoppingCart,
  Check,
  Search,
  Plus,
  Trash2,
  Calendar,
  Clock,
  Sparkles,
  ArrowRight,
  RefreshCw,
  Tag,
  ListChecks,
  ChevronDown,
  Layers,
  Store,
  CheckCircle2,
  AlertCircle,
  X,
  TrendingUp,
  BarChart2,
  PieChart,
  BookOpen,
  Eye,
  PlusCircle,
  Info,
  MapPin,
  ExternalLink,
  Navigation,
} from "lucide-react";
import {
  getMeals,
  getWeeklyBudget,
  getDailyMacroLog,
  logMeal,
  deleteLoggedMeal,
  resetDailyLog,
  searchIngredients,
  getNearbyGroceryStores,
  updateUserProfile,
  scheduleMealPrep,
  getMacroHistory,
  createRecipe,
  deleteRecipe,
  logRecipe,
  type NearbyStoresResponse,
} from "@/lib/api";
import { PERSONA } from "@/lib/persona";
import { useProfile } from "@/components/profile-provider";
import { toInputDate } from "@/lib/formatters";
import { ThemedTimeSelect } from "@/components/calendar/event-modals";
import { ThemedSelect } from "@/components/ui/themed-select";

function getUpcomingSundayIso(): string {
  const d = new Date();
  const daysToSun = (7 - d.getDay()) % 7 || 7;
  d.setDate(d.getDate() + daysToSun);
  return toInputDate(d.toISOString());
}

type TabMode = "macros" | "mealprep" | "search" | "basket";
type MacroSubView = "today" | "trends";

interface CartItem {
  id: string;
  name: string;
  category: string;
  store: string;
  unit: string;
  priceCents: number;
  qty: number;
}

interface IngredientItem {
  name: string;
  qty: number;
  unit: string;
  protein_g: number;
  est_cost_cents: number;
}

const COMMON_INGREDIENTS: IngredientItem[] = [
  { name: "Boneless Skinless Chicken Thighs", qty: 8, unit: "oz", protein_g: 48, est_cost_cents: 200 },
  { name: "Boneless Skinless Chicken Breast", qty: 8, unit: "oz", protein_g: 52, est_cost_cents: 175 },
  { name: "93/7 Lean Ground Turkey", qty: 8, unit: "oz", protein_g: 44, est_cost_cents: 250 },
  { name: "90/10 Lean Ground Beef", qty: 8, unit: "oz", protein_g: 46, est_cost_cents: 300 },
  { name: "Atlantic Salmon Fillet", qty: 6, unit: "oz", protein_g: 38, est_cost_cents: 375 },
  { name: "Extra Firm Organic Tofu", qty: 7, unit: "oz", protein_g: 21, est_cost_cents: 125 },
  { name: "Jasmine Rice (cooked)", qty: 1.5, unit: "cup", protein_g: 6, est_cost_cents: 40 },
  { name: "Sweet Potatoes (baked)", qty: 1.5, unit: "cup", protein_g: 3, est_cost_cents: 60 },
  { name: "Old Fashioned Rolled Oats", qty: 1, unit: "cup", protein_g: 10, est_cost_cents: 45 },
  { name: "High-Protein Chickpea Pasta", qty: 2, unit: "oz", protein_g: 12, est_cost_cents: 90 },
  { name: "Fresh Broccoli Florets", qty: 1.5, unit: "cup", protein_g: 4, est_cost_cents: 60 },
  { name: "Fresh Baby Spinach", qty: 2, unit: "cup", protein_g: 2, est_cost_cents: 65 },
  { name: "Plain Nonfat Greek Yogurt", qty: 1, unit: "cup", protein_g: 22, est_cost_cents: 100 },
  { name: "Low-Fat Cottage Cheese", qty: 1, unit: "cup", protein_g: 28, est_cost_cents: 115 },
  { name: "Ultra-Filtered Protein Milk", qty: 1, unit: "cup", protein_g: 13, est_cost_cents: 90 },
  { name: "Large Grade A Eggs", qty: 2, unit: "large", protein_g: 12, est_cost_cents: 55 },
  { name: "Liquid Egg Whites", qty: 0.75, unit: "cup", protein_g: 20, est_cost_cents: 75 },
  { name: "Canned Black Beans", qty: 0.5, unit: "cup", protein_g: 7, est_cost_cents: 35 },
  { name: "Creamy Peanut Butter", qty: 2, unit: "tbsp", protein_g: 7, est_cost_cents: 35 },
  { name: "Extra Virgin Olive Oil", qty: 1, unit: "tbsp", protein_g: 0, est_cost_cents: 35 },
];

export default function HealthPage() {
  const { profile, isDemo, displayName, locationLabel } = useProfile();
  const [activeTab, setActiveTab] = useState<TabMode>("macros");
  const [macroSubView, setMacroSubView] = useState<MacroSubView>("today");
  const [meals, setMeals] = useState<any[]>([]);
  const [budget, setBudget] = useState<any | null>(null);
  const [dailyLog, setDailyLog] = useState<any | null>(null);
  const [macroHistory, setMacroHistory] = useState<any | null>(null);
  const [loadingLog, setLoadingLog] = useState<boolean>(true);

  // Recipe detail modal state
  const [activeRecipeModal, setActiveRecipeModal] = useState<any | null>(null);
  const [recipeLoggedNotice, setRecipeLoggedNotice] = useState<string | null>(null);
  const [mealFeedback, setMealFeedback] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Create recipe modal state
  const [showCreateRecipeModal, setShowCreateRecipeModal] = useState<boolean>(false);
  const [newRecipeName, setNewRecipeName] = useState<string>("");
  const [newRecipeMealType, setNewRecipeMealType] = useState<string>("lunch");
  const [newRecipePrepTime, setNewRecipePrepTime] = useState<number>(25);
  const [newRecipeInstructions, setNewRecipeInstructions] = useState<string>("");
  const [newRecipeIngredients, setNewRecipeIngredients] = useState<IngredientItem[]>([
    { name: "Boneless Skinless Chicken Thighs", qty: 8, unit: "oz", protein_g: 48, est_cost_cents: 200 },
    { name: "Sweet Potatoes (baked)", qty: 1.5, unit: "cup", protein_g: 3, est_cost_cents: 60 },
  ]);
  const [selectedIngredientPreset, setSelectedIngredientPreset] = useState<string>(COMMON_INGREDIENTS[0].name);
  const [customIngName, setCustomIngName] = useState<string>("");
  const [customIngProt, setCustomIngProt] = useState<number>(20);
  const [customIngCostCents, setCustomIngCostCents] = useState<number>(150);
  const [savingRecipe, setSavingRecipe] = useState<boolean>(false);

  // Meal Prep State
  const [selectedMealId, setSelectedMealId] = useState<string>("");
  const [portionMultiplier, setPortionMultiplier] = useState<number>(4);
  const [checklist, setChecklist] = useState<Record<string, boolean>>({});
  const [prepDate, setPrepDate] = useState<string>("");
  const [prepStartTime, setPrepStartTime] = useState<string>("15:00");
  const [prepEndTime, setPrepEndTime] = useState<string>("16:30");
  const [schedulingStatus, setSchedulingStatus] = useState<string | null>(null);
  const [isScheduling, setIsScheduling] = useState<boolean>(false);

  // Ingredient Search & Live Nearby Grocery Stores State
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStoreFilter, setSelectedStoreFilter] = useState<string | null>(null);
  const [showAllStores, setShowAllStores] = useState<boolean>(false);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [loadingSearch, setLoadingSearch] = useState<boolean>(false);
  const [radiusMiles, setRadiusMiles] = useState<number>(5);
  const [nearbyData, setNearbyData] = useState<NearbyStoresResponse | null>(null);
  const [loadingStores, setLoadingStores] = useState<boolean>(false);
  const [savingRadius, setSavingRadius] = useState<boolean>(false);

  // Shopping Basket State
  const [cart, setCart] = useState<CartItem[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem("lifeops_health_cart");
        if (saved) return JSON.parse(saved);
      } catch (e) {
        console.error("Failed to parse cart", e);
      }
    }
    return [
      {
        id: "default-1",
        name: "Boneless Skinless Chicken Breast",
        category: "protein",
        store: "Regional Supermarket",
        unit: "lb",
        priceCents: 349,
        qty: 4,
      },
      {
        id: "default-2",
        name: "Plain Nonfat Greek Yogurt (32 oz)",
        category: "dairy",
        store: "Campus Grocery",
        unit: "tub (32oz)",
        priceCents: 349,
        qty: 2,
      },
      {
        id: "default-3",
        name: "Large Brown Eggs (Dozen)",
        category: "protein",
        store: "Discount Market",
        unit: "dozen",
        priceCents: 249,
        qty: 1,
      },
    ];
  });

  // Custom meal logging form state
  const [showCustomForm, setShowCustomForm] = useState<boolean>(false);
  const [customName, setCustomName] = useState<string>("");
  const [customType, setCustomType] = useState<string>("lunch");
  const [customCalories, setCustomCalories] = useState<number>(500);
  const [customProtein, setCustomProtein] = useState<number>(45);
  const [customCarbs, setCustomCarbs] = useState<number>(50);
  const [customFat, setCustomFat] = useState<number>(12);
  const [customCost, setCustomCost] = useState<number>(300);
  const [logSubmitting, setLogSubmitting] = useState<boolean>(false);

  // Sync cart to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("lifeops_health_cart", JSON.stringify(cart));
    } catch (e) {
      console.error("Failed to persist cart", e);
    }
  }, [cart]);

  const [todayDateStr, setTodayDateStr] = useState<string>("");

  // Keep radius synchronized if changed in /setup
  useEffect(() => {
    if (typeof profile?.grocery_radius_miles === "number") {
      setRadiusMiles(profile.grocery_radius_miles);
    }
  }, [profile?.grocery_radius_miles]);

  // Load initial data + listen for profile & location target updates
  useEffect(() => {
    const todayIso = toInputDate(new Date().toISOString());
    setTodayDateStr(todayIso);
    setPrepDate((prev) => prev || getUpcomingSundayIso());

    async function loadData(dateArg?: string) {
      const targetDate = dateArg || todayIso;
      setLoadingStores(true);
      try {
        const [m, b, logData, history, storesRes] = await Promise.all([
          getMeals(undefined, radiusMiles),
          getWeeklyBudget(radiusMiles),
          getDailyMacroLog(targetDate),
          getMacroHistory(7, targetDate),
          getNearbyGroceryStores(radiusMiles).catch(() => null),
        ]);
        setMeals(m);
        if (m.length > 0 && !selectedMealId) {
          setSelectedMealId(m[0].id);
        }
        setBudget(b);
        setDailyLog(logData);
        setMacroHistory(history);
        if (storesRes) setNearbyData(storesRes);
      } catch (e) {
        console.error("Failed to load health/meal data", e);
      } finally {
        setLoadingLog(false);
        setLoadingStores(false);
      }
    }
    loadData(todayIso);

    const handleProfileRefresh = () => loadData(todayIso);
    window.addEventListener("lifeops-profile-updated", handleProfileRefresh);
    return () => window.removeEventListener("lifeops-profile-updated", handleProfileRefresh);
  }, [profile?.city, profile?.region, profile?.latitude, profile?.longitude, profile?.daily_calories_target, profile?.daily_protein_g, radiusMiles]);

  // ESC key support for Health modals
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (activeRecipeModal) {
          setActiveRecipeModal(null);
          setRecipeLoggedNotice(null);
        }
        if (showCreateRecipeModal) {
          setShowCreateRecipeModal(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [activeRecipeModal, showCreateRecipeModal]);

  // Search ingredients when query, category, store filter, radius, or location changes
  useEffect(() => {
    let active = true;
    async function doSearch() {
      setLoadingSearch(true);
      try {
        const res = await searchIngredients(
          searchQuery,
          selectedCategory,
          radiusMiles,
          selectedStoreFilter || undefined
        );
        if (active) {
          setSearchResults(res);
        }
      } catch (e) {
        console.error("Failed to search ingredients", e);
      } finally {
        if (active) setLoadingSearch(false);
      }
    }
    const timer = setTimeout(doSearch, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [searchQuery, selectedCategory, selectedStoreFilter, radiusMiles, profile?.city, profile?.region, profile?.latitude, profile?.longitude]);

  const handlePersistRadius = async (nextRadius: number) => {
    const clamped = Math.max(1, Math.min(25, Math.round(nextRadius)));
    setRadiusMiles(clamped);
    setSavingRadius(true);
    try {
      await updateUserProfile({ grocery_radius_miles: clamped });
      window.dispatchEvent(new Event("lifeops-profile-updated"));
    } catch (e) {
      console.error("Failed to save grocery radius", e);
    } finally {
      setSavingRadius(false);
    }
  };

  const activeMeal = useMemo(() => {
    return meals.find((m) => m.id === selectedMealId) || meals[0] || null;
  }, [meals, selectedMealId]);

  // Refresh logs and history
  const refreshLogsAndHistory = async () => {
    try {
      const [logData, history] = await Promise.all([
        getDailyMacroLog(todayDateStr),
        getMacroHistory(7, todayDateStr),
      ]);
      setDailyLog(logData);
      setMacroHistory(history);
    } catch (e) {
      console.error("Failed to refresh logs", e);
    }
  };

  // Quick-log meal from template
  const handleQuickLog = async (meal: any) => {
    setLogSubmitting(true);
    setMealFeedback(null);
    try {
      const costCents = meal.cost_estimate_cents || 0;
      const res = await logMeal({
        meal_name: meal.name,
        meal_type: meal.meal_type || "lunch",
        calories: meal.calories,
        protein_g: Number(meal.protein_g),
        cost_estimate_cents: costCents,
        date: todayDateStr,
      });
      if (res?.summary) {
        setDailyLog(res.summary);
      }
      await refreshLogsAndHistory();
      setMealFeedback({
        type: "success",
        text: `Logged "${meal.name}" (+${meal.protein_g}g protein, ${meal.calories} kcal).`,
      });
    } catch (e: any) {
      console.error("Failed to quick-log meal", e);
      setMealFeedback({
        type: "error",
        text: e?.message || "Failed to log meal to today's tracker.",
      });
    } finally {
      setLogSubmitting(false);
    }
  };

  // Log recipe from recipe modal
  const handleLogActiveRecipe = async () => {
    if (!activeRecipeModal) return;
    setRecipeLoggedNotice(null);
    try {
      const res = await logRecipe(activeRecipeModal.id, todayDateStr);
      setRecipeLoggedNotice(`✓ Logged "${activeRecipeModal.name}" to today's macros!`);
      setMealFeedback({
        type: "success",
        text: `Logged "${activeRecipeModal.name}" (+${activeRecipeModal.protein_g}g protein).`,
      });
      if (res?.summary) {
        setDailyLog(res.summary);
      }
      await refreshLogsAndHistory();
      setTimeout(() => setRecipeLoggedNotice(null), 3500);
    } catch (e) {
      console.error("Failed to log recipe", e);
      setRecipeLoggedNotice("Failed to log recipe.");
    }
  };

  // Delete a recipe template
  const handleDeleteActiveRecipe = async () => {
    if (!activeRecipeModal) return;
    try {
      await deleteRecipe(activeRecipeModal.id);
      setMeals((prev) => prev.filter((m) => m.id !== activeRecipeModal.id));
      setMealFeedback({
        type: "success",
        text: `Deleted recipe "${activeRecipeModal.name}".`,
      });
      setActiveRecipeModal(null);
    } catch (e: any) {
      setRecipeLoggedNotice(e?.message || "Failed to delete recipe.");
    }
  };

  // Add all recipe ingredients to shopping basket using live nearby stores
  const handleAddRecipeIngredientsToBasket = (recipe: any) => {
    if (!recipe?.ingredients) return;
    let ings = recipe.ingredients;
    if (typeof ings === "string") {
      try {
        ings = JSON.parse(ings);
      } catch {
        return;
      }
    }
    const defaultStore =
      nearbyData?.stores?.[0]
        ? `${nearbyData.stores[0].name} (${nearbyData.stores[0].distance_miles} mi)`
        : "Local Grocer";
    const newItems: CartItem[] = (ings as any[]).map((ing, idx) => ({
      id: `recipe-cart-${Date.now()}-${idx}`,
      name: ing.name,
      category: "protein",
      store: ing.best_store || defaultStore,
      unit: ing.unit || "serving",
      priceCents: ing.live_est_cost_cents || ing.est_cost_cents || 150,
      qty: 1,
    }));

    setCart((prev) => [...prev, ...newItems]);
    setRecipeLoggedNotice(`✓ Added ${newItems.length} recipe ingredients to your Shopping Basket!`);
    setTimeout(() => setRecipeLoggedNotice(null), 3500);
  };

  // Log a searched store product directly to Today's Macros
  const handleLogStoreProduct = async (item: any) => {
    setLogSubmitting(true);
    try {
      const cals = Number(item.calories_100g || 150);
      const prot = Number(item.protein_100g || 12);
      const res = await logMeal({
        meal_name: item.item_name,
        meal_type: "snack",
        calories: cals,
        protein_g: prot,
        carbs_g: Number(item.carbs_100g || 0),
        fat_g: Number(item.fat_100g || 0),
        cost_estimate_cents: Number(item.cheapest_price_cents || 300),
        date: todayDateStr,
      });
      if (res?.summary) {
        setDailyLog(res.summary);
      }
      await refreshLogsAndHistory();
      setMealFeedback({
        type: "success",
        text: `Logged "${item.item_name}" (+${prot}g protein, ${cals} kcal) to Today's Macros.`,
      });
    } catch (e: any) {
      setMealFeedback({
        type: "error",
        text: e?.message || "Could not log product.",
      });
    } finally {
      setLogSubmitting(false);
    }
  };

  // Custom meal submission
  const handleCustomLogSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!customName.trim()) return;
    setLogSubmitting(true);
    setMealFeedback(null);
    try {
      const res = await logMeal({
        meal_name: customName.trim(),
        meal_type: customType,
        calories: Number(customCalories),
        protein_g: Number(customProtein),
        carbs_g: Number(customCarbs),
        fat_g: Number(customFat),
        cost_estimate_cents: Number(customCost),
        date: todayDateStr,
      });
      if (res?.summary) {
        setDailyLog(res.summary);
      }
      await refreshLogsAndHistory();
      setMealFeedback({
        type: "success",
        text: `Logged "${customName.trim()}" (+${customProtein}g protein, ${customCalories} kcal).`,
      });
      setShowCustomForm(false);
      setCustomName("");
    } catch (err: any) {
      console.error("Failed to submit custom meal log", err);
      setMealFeedback({
        type: "error",
        text: err?.message || "Failed to log custom meal.",
      });
    } finally {
      setLogSubmitting(false);
    }
  };

  // Delete logged meal
  const handleDeleteLog = async (logId: string) => {
    try {
      const res = await deleteLoggedMeal(logId);
      if (res?.summary) {
        setDailyLog(res.summary);
      }
      await refreshLogsAndHistory();
    } catch (e) {
      console.error("Failed to delete log entry", e);
    }
  };

  // Reset daily log
  const handleResetLog = async () => {
    try {
      const res = await resetDailyLog(todayDateStr);
      if (res?.summary) {
        setDailyLog(res.summary);
      }
      await refreshLogsAndHistory();
    } catch (e) {
      console.error("Failed to reset daily log", e);
    }
  };

  // Recipe builder additions
  const handleAddIngredientToNewRecipe = () => {
    if (customIngName.trim()) {
      setNewRecipeIngredients((prev) => [
        ...prev,
        {
          name: customIngName.trim(),
          qty: 1,
          unit: "serving",
          protein_g: Number(customIngProt || 0),
          est_cost_cents: Number(customIngCostCents || 100),
        },
      ]);
      setCustomIngName("");
      return;
    }
    const preset = COMMON_INGREDIENTS.find((i) => i.name === selectedIngredientPreset);
    if (preset) {
      setNewRecipeIngredients((prev) => [...prev, { ...preset }]);
    }
  };

  const handleRemoveIngredientFromNewRecipe = (index: number) => {
    setNewRecipeIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  const computedNewRecipeTotals = useMemo(() => {
    const totalProt = newRecipeIngredients.reduce((sum, i) => sum + i.protein_g, 0);
    const totalCost = newRecipeIngredients.reduce((sum, i) => sum + i.est_cost_cents, 0);
    // Standard rule: ~10 kcal per gram of protein in balanced meal, plus base calories
    const totalCals = Math.round(totalProt * 8 + 180);
    return {
      protein_g: Math.round(totalProt),
      cost_estimate_cents: totalCost,
      calories: totalCals,
    };
  }, [newRecipeIngredients]);

  const handleSaveCustomRecipe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecipeName.trim() || newRecipeIngredients.length === 0) return;
    setSavingRecipe(true);
    try {
      const res = await createRecipe({
        name: newRecipeName.trim(),
        meal_type: newRecipeMealType,
        ingredients: newRecipeIngredients,
        prep_time_min: newRecipePrepTime,
        calories: computedNewRecipeTotals.calories,
        protein_g: computedNewRecipeTotals.protein_g,
        cost_estimate_cents: computedNewRecipeTotals.cost_estimate_cents,
        instructions: newRecipeInstructions || "Sear and cook ingredients, portion into containers.",
        tags: ["high-protein", "custom", "chicken"],
      });
      if (res?.recipe) {
        setMeals((prev) => [res.recipe, ...prev]);
        setSelectedMealId(res.recipe.id);
      }
      setShowCreateRecipeModal(false);
      setNewRecipeName("");
      setNewRecipeInstructions("");
    } catch (e) {
      console.error("Failed to save recipe", e);
    } finally {
      setSavingRecipe(false);
    }
  };

  // Schedule meal prep session
  const handleScheduleMealPrep = async () => {
    if (!activeMeal) return;
    setIsScheduling(true);
    setSchedulingStatus(null);
    try {
      const res = await scheduleMealPrep({
        prep_date: prepDate,
        start_time: prepStartTime,
        end_time: prepEndTime,
        meals: [`${activeMeal.name} (${portionMultiplier}x Batch)`],
        notes: `Prep yield: ${portionMultiplier} containers. Target: ${(Number(activeMeal.protein_g) * portionMultiplier).toFixed(0)}g total protein.`,
      });
      setSchedulingStatus(res.message || "Scheduled successfully!");
    } catch (e: any) {
      console.error("Failed to schedule meal prep", e);
      setSchedulingStatus("Failed to schedule prep session. Please check time slot.");
    } finally {
      setIsScheduling(false);
    }
  };

  // Add item to shopping cart
  const handleAddToCart = (item: any, storeName?: string, priceCents?: number) => {
    const selectedStore = storeName || item.cheapest_store || "Kroger";
    const selectedPrice = priceCents || item.cheapest_price_cents || 349;
    
    setCart((prev) => {
      const existing = prev.find(
        (c) => c.name === item.item_name && c.store === selectedStore
      );
      if (existing) {
        return prev.map((c) =>
          c.name === item.item_name && c.store === selectedStore
            ? { ...c, qty: c.qty + 1 }
            : c
        );
      }
      return [
        ...prev,
        {
          id: `cart-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
          name: item.item_name,
          category: item.category,
          store: selectedStore,
          unit: item.typical_unit,
          priceCents: selectedPrice,
          qty: 1,
        },
      ];
    });
  };

  const updateCartQty = (id: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((c) => (c.id === id ? { ...c, qty: Math.max(0, c.qty + delta) } : c))
        .filter((c) => c.qty > 0)
    );
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((c) => c.id !== id));
  };

  const clearCart = () => setCart([]);

  // Compute Cart Statistics
  const cartStats = useMemo(() => {
    const totalCents = cart.reduce((acc, c) => acc + c.priceCents * c.qty, 0);
    const totalItems = cart.reduce((acc, c) => acc + c.qty, 0);

    const storeBreakdown: Record<string, { count: number; cents: number }> = {};
    cart.forEach((c) => {
      const storeShort = c.store.split(" ")[0]; // Kroger, Food, Trader
      if (!storeBreakdown[storeShort]) {
        storeBreakdown[storeShort] = { count: 0, cents: 0 };
      }
      storeBreakdown[storeShort].count += c.qty;
      storeBreakdown[storeShort].cents += c.priceCents * c.qty;
    });

    return {
      totalCents,
      totalUsd: `$${(totalCents / 100).toFixed(2)}`,
      totalItems,
      storeBreakdown,
    };
  }, [cart]);

  // Scaled ingredients for active meal prep recipe
  const scaledIngredients = useMemo(() => {
    if (!activeMeal || !activeMeal.ingredients) return [];
    let ings = activeMeal.ingredients;
    if (typeof ings === "string") {
      try {
        ings = JSON.parse(ings);
      } catch {
        return [];
      }
    }
    return (ings as any[]).map((ing) => ({
      ...ing,
      scaledQty: (ing.qty * portionMultiplier).toFixed(ing.unit === "tbsp" || ing.unit === "large" ? 0 : 1),
      scaledProtein: (ing.protein_g * portionMultiplier).toFixed(0),
      scaledCostUsd: `$${(((ing.est_cost_cents || 50) * portionMultiplier) / 100).toFixed(2)}`,
    }));
  }, [activeMeal, portionMultiplier]);

  const prepChecklistItems = useMemo(() => {
    if (!activeMeal) return [];
    return [
      { id: "step-1", label: `Weigh & portion ingredients for ${portionMultiplier}x yield` },
      { id: "step-2", label: `Season / marinate chicken (high protein core)` },
      { id: "step-3", label: `Cook complex carbs (batch jasmine rice or oats)` },
      { id: "step-4", label: `Sear / bake chicken to 165°F internal temperature` },
      { id: "step-5", label: `Steam vegetables / prep side macros` },
      { id: "step-6", label: `Evenly divide into ${portionMultiplier} glass meal containers and chill` },
    ];
  }, [activeMeal, portionMultiplier]);

  const checklistCompletedCount = useMemo(() => {
    return prepChecklistItems.filter((i) => checklist[i.id]).length;
  }, [prepChecklistItems, checklist]);

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="pb-4 border-b border-[var(--border-hairline)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] font-sans">
            Health & Nutrition Ops
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 font-sans flex flex-wrap items-center gap-x-2 gap-y-1">
            <span>
              {isDemo
                ? PERSONA.healthHeadline
                : `${displayName} · ${profile?.daily_calories_target || 2600} kcal · ${profile?.daily_protein_g || 155}g Protein Target${profile?.dietary_notes ? ` · ${profile.dietary_notes}` : ""}`}
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[11px] text-[var(--text-secondary)]">
              <MapPin className="w-3 h-3 text-[var(--accent-primary)]" />
              <span>{nearbyData?.location_label || locationLabel}</span>
              <span className="font-mono text-[10px] text-[var(--text-muted)]">· {radiusMiles} mi</span>
            </span>
          </p>
        </div>

        <div className="flex items-center gap-2">
          {budget && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium font-sans border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
              <DollarSign className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>
                Est.{" "}
                <strong className="font-mono tabular-nums text-[var(--text-primary)] font-semibold">
                  ${Number(budget.weekly_grocery_estimate_usd).toFixed(2)}
                </strong>
                /wk benchmark
              </span>
            </div>
          )}

          <button
            onClick={() => setActiveTab("basket")}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium font-sans border transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
              activeTab === "basket"
                ? "bg-[var(--accent-primary)] text-[var(--bg-base)] border-[var(--accent-primary)]"
                : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--text-muted)]"
            }`}
          >
            <ShoppingCart className="w-3.5 h-3.5" />
            <span>Basket ({cartStats.totalItems})</span>
            {cartStats.totalItems > 0 && (
              <span className="font-mono tabular-nums font-semibold ml-0.5">
                {cartStats.totalUsd}
              </span>
            )}
          </button>
        </div>
      </div>

      {mealFeedback && (
        <div
          className={`px-3.5 py-2.5 rounded-md border text-xs flex items-center justify-between gap-2 ${
            mealFeedback.type === "success"
              ? "border-[var(--semantic-success,#10b981)]/40 bg-[var(--semantic-success,#10b981)]/10 text-[var(--semantic-success,#10b981)]"
              : "border-[var(--semantic-danger,#ef4444)]/40 bg-[var(--semantic-danger,#ef4444)]/10 text-[var(--semantic-danger,#ef4444)]"
          }`}
        >
          <span className="font-medium">{mealFeedback.text}</span>
          <button
            type="button"
            onClick={() => setMealFeedback(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Operational Segmented Tabs */}
      <div className="flex items-center gap-1 p-1 bg-[var(--bg-elevated)] rounded-lg border border-[var(--border-hairline)] max-w-fit overflow-x-auto">
        <button
          onClick={() => setActiveTab("macros")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium font-sans transition-colors duration-75 active:scale-[0.98] whitespace-nowrap cursor-pointer ${
            activeTab === "macros"
              ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-hairline)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Flame className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>Daily Macros & Log</span>
          {dailyLog && (
            <span className="font-mono tabular-nums text-[10px] px-1.5 py-0.2 rounded bg-[var(--bg-base)] text-[var(--accent-primary)] border border-[var(--border-hairline)]">
              {Number(dailyLog.total_protein_g ?? dailyLog.protein_g ?? 0).toFixed(0)}g /{" "}
              {Number(dailyLog.target_protein_g ?? profile?.daily_protein_g ?? 155).toFixed(0)}g
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("mealprep")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium font-sans transition-colors duration-75 active:scale-[0.98] whitespace-nowrap cursor-pointer ${
            activeTab === "mealprep"
              ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-hairline)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Utensils className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>Meal Prep Architect</span>
          <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-[var(--bg-base)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
            {portionMultiplier}x Yield
          </span>
        </button>

        <button
          onClick={() => setActiveTab("search")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium font-sans transition-colors duration-75 active:scale-[0.98] whitespace-nowrap cursor-pointer ${
            activeTab === "search"
              ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-hairline)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <Store className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>Nearby Stores & Prices</span>
          {nearbyData && (
            <span className="font-mono tabular-nums text-[10px] px-1.5 py-0.2 rounded bg-[var(--bg-base)] text-[var(--accent-primary)] border border-[var(--border-hairline)]">
              {nearbyData.store_count} · {radiusMiles}m
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab("basket")}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-medium font-sans transition-colors duration-75 active:scale-[0.98] whitespace-nowrap cursor-pointer ${
            activeTab === "basket"
              ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-sm border border-[var(--border-hairline)]"
              : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
        >
          <ShoppingCart className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>Shopping Basket ({cartStats.totalItems})</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* TAB 1: DAILY MACROS & LOGGING / 7-DAY GRAPHS                              */}
      {/* ========================================================================= */}
      {activeTab === "macros" && (
        <div className="space-y-6">
          {/* Sub-View Switcher: Today's Log vs 7-Day Macro Graphs */}
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setMacroSubView("today")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
                  macroSubView === "today"
                    ? "bg-[var(--accent-primary)] text-[var(--bg-base)] font-semibold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                <span>Today&apos;s Live Tracking</span>
              </button>

              <button
                onClick={() => setMacroSubView("trends")}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
                  macroSubView === "trends"
                    ? "bg-[var(--accent-primary)] text-[var(--bg-base)] font-semibold"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5" />
                <span>7-Day Macro Trends & Graphs</span>
                <span className="text-[10px] px-1 py-0.2 rounded bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--accent-primary)] font-mono">
                  {macroHistory?.adherence_pct || 100}%
                </span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowCreateRecipeModal(true)}
                className="flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-medium bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] transition-colors duration-75 active:scale-[0.98] cursor-pointer"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>+ Create Recipe with Ingredients</span>
              </button>
            </div>
          </div>

          {/* VIEW A: TODAY'S LIVE TRACKING */}
          {macroSubView === "today" && (
            <div className="space-y-6">
              {/* Daily Progress Gauge Strip */}
              {(() => {
                const tCals = Number(dailyLog?.target_calories ?? profile?.daily_calories_target ?? 2600);
                const tProt = Number(dailyLog?.target_protein_g ?? profile?.daily_protein_g ?? 155);
                const tCarbs = Number(dailyLog?.target_carbs_g ?? profile?.daily_carbs_g ?? 320);
                const loggedCals = Number(dailyLog?.total_calories ?? dailyLog?.calories ?? 0);
                const loggedProt = Number(dailyLog?.total_protein_g ?? dailyLog?.protein_g ?? 0);
                const loggedCarbs = Number(dailyLog?.total_carbs_g ?? 0);
                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Calories Card */}
                    <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-muted)] font-medium">Daily Energy</span>
                        <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                          {loggedCals} / {tCals.toLocaleString()} kcal
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                          {Math.max(0, tCals - loggedCals)}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">kcal remaining</span>
                      </div>
                      <div className="w-full bg-[var(--bg-surface)] rounded-full h-2 overflow-hidden border border-[var(--border-hairline)]">
                        <div
                          className="bg-[var(--accent-primary)] h-2 rounded-full transition-all duration-300"
                          style={{ width: `${dailyLog?.pct_calories || 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Protein Card */}
                    <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-muted)] font-medium">Protein Floor</span>
                        <span className="font-mono tabular-nums text-[var(--accent-primary)] font-semibold">
                          {loggedProt}g / {tProt}g
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xl font-bold font-mono tabular-nums text-[var(--accent-primary)]">
                          {Math.max(0, tProt - loggedProt).toFixed(1)}g
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">remaining floor</span>
                      </div>
                      <div className="w-full bg-[var(--bg-surface)] rounded-full h-2 overflow-hidden border border-[var(--border-hairline)]">
                        <div
                          className="bg-[var(--accent-primary)] h-2 rounded-full transition-all duration-300"
                          style={{ width: `${dailyLog?.pct_protein || 0}%` }}
                        />
                      </div>
                    </div>

                    {/* Carbs Card */}
                    <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-muted)] font-medium">Carbohydrates</span>
                        <span className="font-mono tabular-nums text-[var(--text-secondary)]">
                          {loggedCarbs}g / {tCarbs}g
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                          {loggedCarbs}g
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">clean fuel consumed</span>
                      </div>
                      <div className="w-full bg-[var(--bg-surface)] rounded-full h-2 overflow-hidden border border-[var(--border-hairline)]">
                        <div
                          className="bg-[var(--accent-secondary,var(--accent-primary))] h-2 rounded-full opacity-80 transition-all duration-300"
                          style={{
                            width: `${Math.min(100, tCarbs > 0 ? Math.round((loggedCarbs / tCarbs) * 100) : 0)}%`,
                          }}
                        />
                      </div>
                    </div>

                    {/* Daily Food Spend */}
                    <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-2">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[var(--text-muted)] font-medium">Daily Food Spend</span>
                        <span className="font-mono tabular-nums text-[var(--semantic-success,#10b981)] font-medium">
                          {dailyLog?.total_cost_usd || "$0.00"}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between">
                        <span className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                          {dailyLog?.total_cost_usd || "$0.00"}
                        </span>
                        <span className="text-xs text-[var(--text-muted)]">budget efficiency</span>
                      </div>
                      <p className="text-[11px] text-[var(--text-muted)]">
                        Target: &lt; $8.00/day high-protein prep
                      </p>
                    </div>
                  </div>
                );
              })()}

              {/* High-Protein Recipes & Templates */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[var(--accent-primary)]" />
                      High-Protein Recipes & Macro Templates ({meals.length})
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Click any recipe to inspect full ingredients, cooking instructions, or log.
                    </p>
                  </div>

                  <button
                    onClick={() => setShowCustomForm(!showCustomForm)}
                    className="text-xs text-[var(--accent-primary)] hover:underline flex items-center gap-1.5 font-medium"
                  >
                    {showCustomForm ? (
                      <>
                        <X className="w-3.5 h-3.5" />
                        <span>Cancel Custom</span>
                      </>
                    ) : (
                      <>
                        <Plus className="w-3.5 h-3.5" />
                        <span>Custom Meal Entry</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {meals.map((meal) => (
                    <div
                      key={meal.id}
                      className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:border-[var(--accent-primary)] transition-all flex flex-col justify-between space-y-3 cursor-pointer group"
                      onClick={() => setActiveRecipeModal(meal)}
                    >
                      <div>
                        <div className="flex items-start justify-between gap-1">
                          <span className="text-xs font-semibold text-[var(--text-primary)] line-clamp-1 group-hover:text-[var(--accent-primary)] transition-colors">
                            {meal.name}
                          </span>
                          <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] shrink-0">
                            {meal.meal_type}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 mt-2 text-xs">
                          <span className="text-[var(--accent-primary)] font-mono font-semibold">
                            {meal.protein_g}g Protein
                          </span>
                          <span className="text-[var(--text-muted)] font-mono">
                            {meal.calories} kcal
                          </span>
                          <span className="text-[var(--text-secondary)] font-mono">
                            ${(meal.cost_estimate_cents / 100).toFixed(2)}
                          </span>
                        </div>

                        <p className="text-[11px] text-[var(--text-muted)] line-clamp-2 mt-2 leading-relaxed">
                          {meal.instructions || "Click to inspect ingredients and directions."}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveRecipeModal(meal);
                          }}
                          className="flex-1 py-1 px-2 rounded text-[11px] font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)] flex items-center justify-center gap-1"
                        >
                          <Eye className="w-3 h-3" />
                          <span>Inspect</span>
                        </button>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleQuickLog(meal);
                          }}
                          disabled={logSubmitting}
                          className="flex-1 py-1 px-2 rounded text-[11px] font-medium bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 transition-opacity flex items-center justify-center gap-1 font-semibold"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Quick Log</span>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Custom Meal Log Form (Collapsible) */}
              {showCustomForm && (
                <form
                  onSubmit={handleCustomLogSubmit}
                  className="p-4 rounded-lg border border-[var(--accent-primary)] bg-[var(--bg-elevated)] space-y-3"
                >
                  <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                    Log Custom Meal / Snack
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-6 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                        Meal Name
                      </label>
                      <input
                        type="text"
                        value={customName}
                        onChange={(e) => setCustomName(e.target.value)}
                        placeholder="e.g. Fairlife Shake & Banana"
                        required
                        className="w-full px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                        Type
                      </label>
                      <ThemedSelect
                        variant="surface"
                        value={customType}
                        onChange={(e) => setCustomType(e.target.value)}
                        selectClassName="px-2.5 py-1.5"
                      >
                        <option value="breakfast">Breakfast</option>
                        <option value="lunch">Lunch</option>
                        <option value="dinner">Dinner</option>
                        <option value="snack">Snack</option>
                        <option value="post_workout">Post-Workout</option>
                      </ThemedSelect>
                    </div>

                    <div>
                      <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                        Calories (kcal)
                      </label>
                      <input
                        type="number"
                        value={customCalories}
                        onChange={(e) => setCustomCalories(Number(e.target.value))}
                        min={0}
                        className="w-full px-2.5 py-1.5 rounded-md text-xs font-mono bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                        Protein (g)
                      </label>
                      <input
                        type="number"
                        value={customProtein}
                        onChange={(e) => setCustomProtein(Number(e.target.value))}
                        min={0}
                        step="0.5"
                        className="w-full px-2.5 py-1.5 rounded-md text-xs font-mono bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>

                    <div>
                      <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                        Cost ($ Cents)
                      </label>
                      <input
                        type="number"
                        value={customCost}
                        onChange={(e) => setCustomCost(Number(e.target.value))}
                        min={0}
                        className="w-full px-2.5 py-1.5 rounded-md text-xs font-mono bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent-primary)]"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setShowCustomForm(false)}
                      className="px-3 py-1.5 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={logSubmitting}
                      className="px-4 py-1.5 rounded-md text-xs font-medium bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 transition-opacity"
                    >
                      {logSubmitting ? "Logging..." : "Confirm & Add to Log"}
                    </button>
                  </div>
                </form>
              )}

              {/* Today's Logged Items List */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <ListChecks className="w-4 h-4 text-[var(--accent-primary)]" />
                    Meals Logged Today (
                    {todayDateStr
                      ? new Date(`${todayDateStr}T12:00:00`).toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })
                      : "Today"}
                    )
                  </h2>

                  <button
                    onClick={handleResetLog}
                    className="text-xs text-[var(--text-muted)] hover:text-[var(--text-secondary)] flex items-center gap-1"
                    title="Reset log to morning baseline"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Reset to Baseline</span>
                  </button>
                </div>

                <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] divide-y divide-[var(--border-hairline)]">
                  {(dailyLog?.logs || dailyLog?.meals || []).length > 0 ? (
                    (dailyLog?.logs || dailyLog?.meals || []).map((item: any) => (
                      <div
                        key={item.id}
                        className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)] shrink-0" />
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm text-[var(--text-primary)]">
                                {item.meal_name}
                              </span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded uppercase tracking-wider bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                                {item.meal_type}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-5">
                          <div className="flex items-center gap-3 font-mono">
                            <span className="text-[var(--accent-primary)] font-semibold">
                              {item.protein_g}g Protein
                            </span>
                            <span className="text-[var(--text-secondary)]">
                              {item.calories} kcal
                            </span>
                            <span className="text-[var(--text-muted)]">
                              {item.cost_estimate_usd}
                            </span>
                          </div>

                          <button
                            onClick={() => handleDeleteLog(item.id)}
                            className="text-[var(--text-muted)] hover:text-[var(--semantic-danger,#ef4444)] p-1 rounded transition-colors"
                            title="Remove logged meal"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-6 text-center text-xs text-[var(--text-muted)]">
                      No meals logged yet today. Click any quick-log button above!
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* VIEW B: 7-DAY MACRO TRENDS & VISUAL GRAPHS */}
          {macroSubView === "trends" && macroHistory && (
            <div className="space-y-6">
              {/* Trends Summary KPI Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1">
                  <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block font-sans">
                    Protein Floor Adherence
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold font-mono tabular-nums text-[var(--accent-primary)]">
                      {macroHistory.protein_hit_days} / {macroHistory.active_days}
                    </span>
                    <span className="text-xs text-[var(--semantic-success,#10b981)] font-semibold">
                      ({macroHistory.adherence_pct}%)
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] block">
                    ≥ 155g daily goal hit
                  </span>
                </div>

                <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1">
                  <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block font-sans">
                    7-Day Avg Protein
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                      {macroHistory.avg_daily_protein_g}g
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">/ day</span>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] block">
                    +{(macroHistory.avg_daily_protein_g - 155).toFixed(1)}g over target floor
                  </span>
                </div>

                <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1">
                  <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block font-sans">
                    7-Day Avg Calories
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold font-mono tabular-nums text-[var(--text-primary)]">
                      {macroHistory.avg_daily_calories}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">kcal</span>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] block">
                    Target: 2,600 kcal (+250 surplus)
                  </span>
                </div>

                <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1">
                  <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block font-sans">
                    Weekly Grocery Cost
                  </span>
                  <div className="flex items-baseline gap-1.5">
                    <span className="text-xl font-bold font-mono tabular-nums text-[var(--semantic-success,#10b981)]">
                      {macroHistory.total_spend_usd}
                    </span>
                  </div>
                  <span className="text-[11px] text-[var(--text-muted)] block">
                    Avg ~${((parseFloat(macroHistory.total_spend_usd.replace("$", "")) || 45) / macroHistory.active_days).toFixed(2)}/day
                  </span>
                </div>
              </div>

              {/* GRAPH 1: DAILY PROTEIN INTAKE VS FLOOR TARGET (155g) */}
              <div className="p-5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <BarChart2 className="w-4 h-4 text-[var(--accent-primary)]" />
                      Daily Protein Intake Horizon (155g Target Floor)
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Ensures minimum 1.03g protein per lb of bodyweight to power lean-bulk recovery.
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-1.5 text-xs text-[var(--accent-primary)] font-mono font-medium">
                      <span className="w-3 h-0.5 bg-[var(--accent-primary)]" />
                      155g Target Floor
                    </span>
                  </div>
                </div>

                {/* Protein Bar Chart */}
                <div className="relative pt-6 pb-2">
                  {/* Target Reference Line at 155g (scaled to max 200g = 77.5% height) */}
                  <div className="absolute left-0 right-0 top-[28%] border-t border-dashed border-[var(--accent-primary)]/60 z-10 pointer-events-none flex items-center justify-end pr-2">
                    <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-[var(--bg-base)] text-[var(--accent-primary)] border border-[var(--accent-primary)]/40 -mt-3">
                      155g Floor
                    </span>
                  </div>

                  {/* Bars Container */}
                  <div className="grid grid-cols-7 gap-2 sm:gap-4 items-end h-52 pt-4 px-2 border-b border-[var(--border-hairline)]">
                    {macroHistory.days.map((d: any) => {
                      const maxVal = 200; // max scale
                      const barHeight = Math.min(100, Math.round((d.protein_g / maxVal) * 100));
                      const isHit = d.protein_g >= 155.0;

                      return (
                        <div key={d.date} className="flex flex-col items-center h-full justify-end group">
                          {/* Value on Hover / Top */}
                          <span className="text-[11px] font-mono font-semibold text-[var(--text-primary)] mb-1.5 transition-opacity">
                            {d.protein_g}g
                          </span>

                          {/* Bar */}
                          <div className="w-full max-w-[42px] bg-[var(--bg-surface)] rounded-t-md h-full flex items-end overflow-hidden border border-[var(--border-hairline)]">
                            <div
                              className={`w-full rounded-t-sm transition-all duration-300 ${
                                isHit
                                  ? "bg-[var(--accent-primary)]"
                                  : d.is_today
                                  ? "bg-[var(--accent-primary)]/70 animate-pulse"
                                  : "bg-[var(--text-muted)]"
                              }`}
                              style={{ height: `${barHeight}%` }}
                            />
                          </div>

                          {/* Day Label */}
                          <span
                            className={`text-xs mt-2 font-mono ${
                              d.is_today
                                ? "text-[var(--accent-primary)] font-bold"
                                : "text-[var(--text-muted)]"
                            }`}
                          >
                            {d.short_label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* GRAPH 2 & 3: CALORIE TRACKING & MACRO ENERGY SPLIT */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Calorie Intake Graph */}
                <div className="p-5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                        <Flame className="w-4 h-4 text-[var(--accent-primary)]" />
                        Daily Calorie Target ({Number(dailyLog?.target_calories || profile?.daily_calories_target || 2600).toLocaleString()} kcal Target)
                      </h3>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Caloric intake vs profile boundary.
                      </p>
                    </div>
                  </div>

                  <div className="relative pt-6 pb-2">
                    {/* Target kcal Reference Line */}
                    <div className="absolute left-0 right-0 top-[22%] border-t border-dashed border-[var(--text-muted)]/60 z-10 pointer-events-none flex items-center justify-end pr-2">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--bg-base)] text-[var(--text-secondary)] border border-[var(--border-hairline)] -mt-3">
                        {Number(dailyLog?.target_calories || profile?.daily_calories_target || 2600).toLocaleString()} kcal Target
                      </span>
                    </div>

                    <div className="grid grid-cols-7 gap-2 items-end h-40 pt-4 px-2 border-b border-[var(--border-hairline)]">
                      {macroHistory.days.map((d: any) => {
                        const targetCals = Number(dailyLog?.target_calories || profile?.daily_calories_target || 2600);
                        const maxVal = Math.max(3200, Math.round(targetCals * 1.25));
                        const barHeight = Math.min(100, Math.round((d.calories / maxVal) * 100));

                        return (
                          <div key={d.date} className="flex flex-col items-center h-full justify-end">
                            <span className="text-[10px] font-mono text-[var(--text-secondary)] mb-1">
                              {d.calories}
                            </span>
                            <div className="w-full max-w-[36px] bg-[var(--bg-surface)] rounded-t h-full flex items-end overflow-hidden border border-[var(--border-hairline)]">
                              <div
                                className={`w-full rounded-t-sm transition-all duration-300 ${
                                  d.is_today
                                    ? "bg-[var(--accent-secondary,#38bdf8)]/80"
                                    : "bg-[var(--text-secondary)]"
                                }`}
                                style={{ height: `${barHeight}%` }}
                              />
                            </div>
                            <span
                              className={`text-[11px] mt-1.5 font-mono ${
                                d.is_today ? "text-[var(--accent-primary)] font-bold" : "text-[var(--text-muted)]"
                              }`}
                            >
                              {d.short_label}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Macro Nutrient Energy Distribution Ratio */}
                <div className="p-5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-4">
                  <div>
                    <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                      <PieChart className="w-4 h-4 text-[var(--accent-primary)]" />
                      Macro Nutrient Energy Ratio (% Calories)
                    </h3>
                    <p className="text-xs text-[var(--text-muted)] mt-0.5">
                      Lean bulk target: ~25% Protein, ~50% Carbohydrates, ~25% Healthy Fats.
                    </p>
                  </div>

                  <div className="space-y-4 pt-2">
                    {/* Visual Segmented Progress Bar */}
                    <div className="h-5 w-full rounded-lg overflow-hidden flex border border-[var(--border-hairline)]">
                      <div
                        className="bg-[var(--accent-primary)] h-full flex items-center justify-center text-[10px] font-mono font-bold text-[var(--bg-base)]"
                        style={{ width: `${macroHistory.macro_energy_pct.protein}%` }}
                        title={`Protein: ${macroHistory.macro_energy_pct.protein}%`}
                      >
                        {macroHistory.macro_energy_pct.protein}%
                      </div>
                      <div
                        className="bg-[var(--accent-secondary,#38bdf8)] h-full flex items-center justify-center text-[10px] font-mono font-bold text-white"
                        style={{ width: `${macroHistory.macro_energy_pct.carbs}%` }}
                        title={`Carbs: ${macroHistory.macro_energy_pct.carbs}%`}
                      >
                        {macroHistory.macro_energy_pct.carbs}%
                      </div>
                      <div
                        className="bg-[var(--semantic-warning,#eab308)] h-full flex items-center justify-center text-[10px] font-mono font-bold text-white"
                        style={{ width: `${macroHistory.macro_energy_pct.fat}%` }}
                        title={`Fats: ${macroHistory.macro_energy_pct.fat}%`}
                      >
                        {macroHistory.macro_energy_pct.fat}%
                      </div>
                    </div>

                    {/* Breakdown Badges */}
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="p-2.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                          <span className="font-semibold text-[var(--text-primary)]">Protein</span>
                        </div>
                        <span className="font-mono text-xs text-[var(--accent-primary)] font-bold block">
                          {macroHistory.macro_energy_pct.protein}% of kcal
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">4 kcal / g</span>
                      </div>

                      <div className="p-2.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[var(--accent-secondary,#38bdf8)]" />
                          <span className="font-semibold text-[var(--text-primary)]">Carbs</span>
                        </div>
                        <span className="font-mono text-xs text-[var(--accent-secondary,#38bdf8)] font-bold block">
                          {macroHistory.macro_energy_pct.carbs}% of kcal
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">4 kcal / g</span>
                      </div>

                      <div className="p-2.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] space-y-0.5">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full bg-[var(--semantic-warning,#eab308)]" />
                          <span className="font-semibold text-[var(--text-primary)]">Fats</span>
                        </div>
                        <span className="font-mono text-xs text-[var(--semantic-warning,#eab308)] font-bold block">
                          {macroHistory.macro_energy_pct.fat}% of kcal
                        </span>
                        <span className="text-[10px] text-[var(--text-muted)]">9 kcal / g</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: MEAL PREP ARCHITECT                                                */}
      {/* ========================================================================= */}
      {activeTab === "mealprep" && (
        <div className="space-y-6">
          {/* Batch Selector & Portion Multiplier Bar */}
          <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block">
                Active Batch Recipe
              </span>
              <div className="flex items-center gap-2 mt-1">
                <ThemedSelect
                  variant="surface"
                  value={selectedMealId}
                  onChange={(e) => setSelectedMealId(e.target.value)}
                  containerClassName="min-w-[240px]"
                  selectClassName="text-sm font-medium py-1.5"
                >
                  {meals.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.meal_type})
                    </option>
                  ))}
                </ThemedSelect>
              </div>
            </div>

            {/* Portion Multiplier Pill Selector */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">Portion Yield Multiplier:</span>
              <div className="flex items-center gap-1 bg-[var(--bg-surface)] p-1 rounded-md border border-[var(--border-hairline)]">
                {[
                  { mult: 1, label: "1x (Single)" },
                  { mult: 2, label: "2x (Couple)" },
                  { mult: 4, label: "4x (Batch)" },
                  { mult: 6, label: "6x (Full Week)" },
                ].map((item) => (
                  <button
                    key={item.mult}
                    onClick={() => setPortionMultiplier(item.mult)}
                    className={`px-3 py-1 rounded text-xs font-medium transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
                      portionMultiplier === item.mult
                        ? "bg-[var(--accent-primary)] text-[var(--bg-base)] font-semibold shadow-sm"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Scaled Yield Overview Metrics */}
          {activeMeal && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1">
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block">
                  Total Batch Yield
                </span>
                <span className="text-xl font-bold font-mono text-[var(--text-primary)]">
                  {portionMultiplier} Containers
                </span>
                <span className="text-[11px] text-[var(--text-muted)] block">
                  Airtight glass meal prep
                </span>
              </div>

              <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1">
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block">
                  Total Protein Yield
                </span>
                <span className="text-xl font-bold font-mono text-[var(--accent-primary)]">
                  {(Number(activeMeal.protein_g) * portionMultiplier).toFixed(0)}g
                </span>
                <span className="text-[11px] text-[var(--text-muted)] block">
                  {activeMeal.protein_g}g per container
                </span>
              </div>

              <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1">
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block">
                  Total Batch Cost
                </span>
                <span className="text-xl font-bold font-mono text-[var(--semantic-success,#10b981)]">
                  ${(((activeMeal.cost_estimate_cents || 275) * portionMultiplier) / 100).toFixed(2)}
                </span>
                <span className="text-[11px] text-[var(--text-muted)] block">
                  ${((activeMeal.cost_estimate_cents || 275) / 100).toFixed(2)} / serving
                </span>
              </div>

              <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1">
                <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block">
                  Prep & Cook Duration
                </span>
                <span className="text-xl font-bold font-mono text-[var(--text-primary)]">
                  {activeMeal.prep_time_min ? activeMeal.prep_time_min + (portionMultiplier > 2 ? 15 : 0) : 35} min
                </span>
                <span className="text-[11px] text-[var(--text-muted)] block">
                  One clean batch sprint
                </span>
              </div>
            </div>
          )}

          {/* Scaled Ingredients Table & Recipe Instructions */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Ingredients Scaled */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[var(--accent-primary)]" />
                  Scaled Ingredients for {portionMultiplier}x Batch
                </h3>
                <span className="text-xs text-[var(--text-muted)]">
                  Local store pricing
                </span>
              </div>

              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] divide-y divide-[var(--border-hairline)]">
                {scaledIngredients.map((ing, idx) => (
                  <div
                    key={idx}
                    className="p-3 flex items-center justify-between text-xs"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                      <span className="font-medium text-[var(--text-primary)]">
                        {ing.name}
                      </span>
                    </div>

                    <div className="flex items-center gap-4 font-mono">
                      <span className="text-[var(--text-secondary)] font-semibold">
                        {ing.scaledQty} {ing.unit}
                      </span>
                      <span className="text-[var(--accent-primary)]">
                        {ing.scaledProtein}g prot
                      </span>
                      <span className="text-[var(--text-muted)] w-12 text-right">
                        {ing.scaledCostUsd}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Step-by-Step Cooking Checklist */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-[var(--accent-primary)]" />
                  Batch Execution Checklist ({checklistCompletedCount}/{prepChecklistItems.length})
                </h3>
                <span className="text-xs font-mono text-[var(--accent-primary)]">
                  {Math.round((checklistCompletedCount / (prepChecklistItems.length || 1)) * 100)}% Complete
                </span>
              </div>

              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-3 space-y-2">
                {prepChecklistItems.map((step) => {
                  const done = !!checklist[step.id];
                  return (
                    <button
                      key={step.id}
                      onClick={() => setChecklist((prev) => ({ ...prev, [step.id]: !prev[step.id] }))}
                      className={`w-full text-left p-2.5 rounded-md flex items-center gap-3 text-xs transition-colors border ${
                        done
                          ? "bg-[var(--bg-surface)] border-[var(--semantic-success,#10b981)]/40 text-[var(--text-muted)] line-through"
                          : "border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
                      }`}
                    >
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                          done
                            ? "bg-[var(--semantic-success,#10b981)] border-[var(--semantic-success,#10b981)] text-white"
                            : "border-[var(--border-hairline)] bg-[var(--bg-surface)]"
                        }`}
                      >
                        {done && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                      <span className="flex-1">{step.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Autonomous Sunday Calendar Scheduling Card */}
          <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-3">
            {schedulingStatus && (
              <div className="p-2.5 rounded-md bg-[var(--bg-surface)] border border-[var(--semantic-success,#10b981)]/40 text-xs flex items-center justify-between text-[var(--text-primary)] animate-in fade-in">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-[var(--semantic-success,#10b981)] shrink-0" />
                  <span className="font-medium">{schedulingStatus}</span>
                </div>
                <Link
                  href="/schedule"
                  className="text-xs font-semibold text-[var(--accent-primary)] hover:underline flex items-center gap-1 shrink-0 ml-3"
                >
                  <span>View on Calendar</span>
                  <ArrowRight className="w-3 h-3" />
                </Link>
              </div>
            )}

            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[var(--accent-primary)]" />
                  Lock Meal Prep Session on Google Calendar
                </h3>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Synchronizes with your Sunday routine. Tagged as flexible block for autopilot safety.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs">
                  <span className="text-[var(--text-muted)]">Date:</span>
                  <input
                    type="date"
                    value={prepDate}
                    onChange={(e) => setPrepDate(e.target.value)}
                    className="px-2 py-1 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] font-mono text-xs focus:outline-none"
                  />
                </div>

                <div className="flex items-center gap-1.5 text-xs">
                  <ThemedTimeSelect
                    ariaLabel="Meal prep start time"
                    value={prepStartTime}
                    onChange={setPrepStartTime}
                    className="w-32"
                  />
                  <span className="text-[var(--text-muted)]">–</span>
                  <ThemedTimeSelect
                    ariaLabel="Meal prep end time"
                    value={prepEndTime}
                    onChange={setPrepEndTime}
                    className="w-32"
                  />
                </div>

                <button
                  onClick={handleScheduleMealPrep}
                  disabled={isScheduling}
                  className="flex items-center gap-2 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 transition-all shrink-0"
                >
                  <Calendar className="w-3.5 h-3.5" />
                  <span>
                    {isScheduling
                      ? "Scheduling..."
                      : `Schedule Sunday Prep Block`}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: LIVE NEARBY STORES & INGREDIENT PRICE COMPARE                      */}
      {/* ========================================================================= */}
      {activeTab === "search" && (
        <div className="space-y-6">
          {/* Live Nearby Stores + Configurable Distance Radius Panel */}
          <div className="p-4 sm:p-5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-[var(--accent-primary)]" />
                    <span>Live Grocery Stores Near {nearbyData?.location_label || locationLabel}</span>
                  </h2>
                  {nearbyData?.source && (
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-hairline)]">
                      {nearbyData.source}
                    </span>
                  )}
                </div>
                <p className="text-xs text-[var(--text-muted)]">
                  Synced to your profile location. Adjust radius or click any store card to browse its catalog &amp; live products.{" "}
                  <Link href="/setup" className="text-[var(--accent-primary)] hover:underline">
                    Change city in Setup →
                  </Link>
                </p>
              </div>

              {/* Distance Radius Control */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 shrink-0">
                <div className="flex items-center gap-2.5">
                  <label htmlFor="health-radius-slider" className="text-xs text-[var(--text-secondary)] whitespace-nowrap">
                    Radius:
                  </label>
                  <input
                    id="health-radius-slider"
                    type="range"
                    min={1}
                    max={25}
                    step={1}
                    value={radiusMiles}
                    onChange={(e) => setRadiusMiles(Number(e.target.value))}
                    onMouseUp={() => handlePersistRadius(radiusMiles)}
                    onTouchEnd={() => handlePersistRadius(radiusMiles)}
                    className="w-28 accent-[var(--accent-primary)] cursor-pointer"
                  />
                  <span className="text-xs font-mono tabular-nums font-semibold text-[var(--accent-primary)] w-11">
                    {radiusMiles} mi
                  </span>
                </div>

                <div className="flex items-center gap-1">
                  {[2, 5, 10, 15, 25].map((mi) => (
                    <button
                      key={mi}
                      type="button"
                      disabled={savingRadius}
                      onClick={() => handlePersistRadius(mi)}
                      className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                        radiusMiles === mi
                          ? "bg-[var(--accent-primary)] text-[var(--bg-base)] border-[var(--accent-primary)] font-semibold"
                          : "bg-[var(--bg-base)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {mi}m
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {loadingStores ? (
              <div className="py-4 text-xs text-[var(--text-muted)] flex items-center gap-2">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary)]" />
                <span>Scanning live supermarkets within {radiusMiles} miles of {nearbyData?.location_label || locationLabel}...</span>
              </div>
            ) : nearbyData && nearbyData.stores.length > 0 ? (
              <div className="space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {(showAllStores ? nearbyData.stores : nearbyData.stores.slice(0, 9)).map((st) => {
                    const isSelectedStore = selectedStoreFilter === st.name;
                    return (
                      <div
                        key={st.id}
                        onClick={() =>
                          setSelectedStoreFilter((prev) => (prev === st.name ? null : st.name))
                        }
                        className={`p-3 rounded-md border flex flex-col justify-between gap-2 transition-colors cursor-pointer ${
                          isSelectedStore
                            ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/10"
                            : "border-[var(--border-hairline)] bg-[var(--bg-base)] hover:border-[var(--accent-primary)]/50"
                        }`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <span className="text-xs font-semibold text-[var(--text-primary)] leading-snug">
                              {st.name}
                            </span>
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono tabular-nums bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 shrink-0">
                              {st.distance_miles} mi
                            </span>
                          </div>
                          <p className="text-[11px] text-[var(--text-muted)] leading-snug">
                            {st.address}
                          </p>
                        </div>

                        <div className="flex items-center justify-between gap-2 pt-1 border-t border-[var(--border-hairline)]/60 text-[10px]">
                          <div className="flex items-center gap-1.5">
                            <span className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                              {st.price_tier}
                            </span>
                            <span className="text-[var(--accent-primary)] font-medium">
                              {isSelectedStore ? "Showing catalog ✓" : "Browse items →"}
                            </span>
                          </div>
                          <a
                            href={st.maps_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={(e) => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[var(--text-secondary)] hover:text-[var(--accent-primary)] hover:underline font-medium"
                          >
                            <Navigation className="w-2.5 h-2.5" />
                            <span>Map</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {nearbyData.stores.length > 9 && (
                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="text-[var(--text-muted)]">
                      Showing {showAllStores ? nearbyData.stores.length : 9} of {nearbyData.stores.length} stores within {radiusMiles} miles
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowAllStores((prev) => !prev)}
                      className="px-3 py-1 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors cursor-pointer"
                    >
                      {showAllStores ? "Show top 9 stores" : `Show all ${nearbyData.stores.length} stores`}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="p-4 rounded-md border border-dashed border-[var(--border-hairline)] bg-[var(--bg-base)]/60 text-xs text-[var(--text-muted)] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span>
                  No live supermarkets found within {radiusMiles} miles. Try expanding your radius (e.g. 15–25 mi) or verify your city in Setup.
                </span>
                <button
                  type="button"
                  onClick={() => handlePersistRadius(Math.min(25, Math.max(15, radiusMiles + 10)))}
                  className="px-2.5 py-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] text-xs cursor-pointer shrink-0"
                >
                  Expand to {Math.min(25, Math.max(15, radiusMiles + 10))} mi
                </button>
              </div>
            )}
          </div>

          {/* Search Header Bar */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* Live Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Compare staple prices at nearby stores (e.g. chicken, eggs, rice, yogurt, salmon)..."
                className="w-full pl-9 pr-4 py-2 rounded-lg text-xs bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent-primary)] placeholder-[var(--text-muted)]"
              />
            </div>

            {/* Category Filter Pills */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
              {[
                { id: "all", label: "All Items" },
                { id: "protein", label: "Protein" },
                { id: "carb", label: "Carbs" },
                { id: "dairy", label: "Dairy" },
                { id: "produce", label: "Produce" },
                { id: "pantry", label: "Pantry" },
              ].map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium font-sans whitespace-nowrap transition-colors border ${
                    selectedCategory === cat.id
                      ? "bg-[var(--accent-primary)] text-[var(--bg-base)] border-[var(--accent-primary)] font-semibold"
                      : "bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Ingredient Probe Chips + Store Filter Badge */}
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            {selectedStoreFilter && (
              <button
                type="button"
                onClick={() => setSelectedStoreFilter(null)}
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/35 font-medium cursor-pointer"
              >
                <Store className="w-3 h-3" />
                <span>Store: {selectedStoreFilter}</span>
                <X className="w-3 h-3" />
              </button>
            )}
            <span className="text-[var(--text-muted)]">Search live brands or staples:</span>
            {["Chicken", "Fairlife", "Chobani", "Eggs", "Greek Yogurt", "Rice", "Salmon", "Oats"].map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setSearchQuery(chip)}
                className="px-2 py-0.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                {chip}
              </button>
            ))}
            {(searchQuery || selectedStoreFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setSelectedStoreFilter(null);
                }}
                className="px-2 py-0.5 rounded text-[var(--accent-primary)] hover:underline cursor-pointer"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Search Results with Multi-Store Comparison */}
          <div className="space-y-3">
            {loadingSearch ? (
              <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                Comparing prices across local stores...
              </div>
            ) : searchResults.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {searchResults.map((item, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-3 flex flex-col justify-between hover:border-[var(--text-muted)] transition-colors"
                  >
                    <div>
                      {/* Top Item Title & Unit */}
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                              {item.item_name}
                            </h3>
                            <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                              {item.is_live_product ? "Live Store Product" : item.category}
                            </span>
                          </div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)] mt-0.5">
                            <span>Unit: {item.typical_unit}</span>
                            {item.protein_100g != null && (
                              <span className="font-mono text-[11px] text-[var(--accent-primary)]">
                                · {item.protein_100g}g prot
                              </span>
                            )}
                            {item.calories_100g != null && (
                              <span className="font-mono text-[11px]">
                                · {item.calories_100g} kcal
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Savings Badge */}
                        {item.savings_cents > 0 && (
                          <div className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--semantic-success,#10b981)]/15 text-[var(--semantic-success,#10b981)] border border-[var(--semantic-success,#10b981)]/30 shrink-0">
                            <Tag className="w-3 h-3" />
                            <span>Saves {item.savings_usd}</span>
                          </div>
                        )}
                      </div>

                      {/* Store Price Breakdown */}
                      <div className="mt-3 space-y-1.5">
                        {item.stores.map((s: any, sIdx: number) => (
                          <div
                            key={sIdx}
                            className={`p-2 rounded flex items-center justify-between text-xs border ${
                              s.is_cheapest
                                ? "bg-[var(--bg-surface)] border-[var(--semantic-success,#10b981)]/40 text-[var(--text-primary)]"
                                : "border-[var(--border-hairline)] text-[var(--text-secondary)]"
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <Store className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                              <span className="font-medium">{s.store}</span>
                              {s.is_cheapest && (
                                <span className="text-[10px] px-1.5 py-0.2 rounded font-semibold bg-[var(--semantic-success,#10b981)] text-[var(--bg-base)]">
                                  Cheapest Pick
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-3">
                              <span className="font-mono tabular-nums font-semibold text-[var(--text-primary)]">
                                {s.price_usd}
                              </span>
                              <button
                                onClick={() => handleAddToCart(item, s.store, s.price_cents)}
                                className="text-[11px] px-2 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] hover:text-[var(--accent-primary)] transition-colors"
                              >
                                + Add
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Quick 1-Click Add Cheapest to Basket + Log to Today */}
                    <div className="flex items-center gap-2 mt-2">
                      <button
                        onClick={() => handleAddToCart(item)}
                        className="flex-1 py-1.5 px-3 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 transition-opacity flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <ShoppingCart className="w-3.5 h-3.5" />
                        <span>
                          Add ({item.cheapest_store ? item.cheapest_store.split(" (")[0] : "Store"} ·{" "}
                          ${((item.cheapest_price_cents || 0) / 100).toFixed(2)})
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleLogStoreProduct(item)}
                        disabled={logSubmitting}
                        className="py-1.5 px-2.5 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] transition-colors cursor-pointer shrink-0"
                        title="Log 1 serving of this product to Today's Macros"
                      >
                        + Log Macro
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center text-xs text-[var(--text-muted)] border border-dashed border-[var(--border-hairline)] rounded-lg">
                No grocery items found for &ldquo;{searchQuery}&rdquo;. Try &ldquo;chicken thighs&rdquo;, &ldquo;eggs&rdquo;, &ldquo;rice&rdquo;, or &ldquo;yogurt&rdquo;.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 4: SHOPPING BASKET & GROCERY PLANNER                                   */}
      {/* ========================================================================= */}
      {activeTab === "basket" && (
        <div className="space-y-6">
          {/* Basket Overview Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1">
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block">
                Total Basket Items
              </span>
              <span className="text-2xl font-bold font-mono text-[var(--text-primary)]">
                {cartStats.totalItems} Units
              </span>
              <span className="text-[11px] text-[var(--text-muted)] block">
                High-protein meal prep run
              </span>
            </div>

            <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1">
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block">
                Total Estimated Spend
              </span>
              <span className="text-2xl font-bold font-mono text-[var(--accent-primary)]">
                {cartStats.totalUsd}
              </span>
              <span className="text-[11px] text-[var(--text-muted)] block">
                Optimized across cheapest local stores
              </span>
            </div>

            <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1">
              <span className="text-xs text-[var(--text-muted)] uppercase tracking-wider block">
                Store Route Breakdown
              </span>
              <div className="flex flex-wrap gap-2 pt-1">
                {Object.entries(cartStats.storeBreakdown).map(([store, info]) => (
                  <span
                    key={store}
                    className="text-xs px-2 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] font-mono"
                  >
                    {store}: {info.count} items (${(info.cents / 100).toFixed(2)})
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Cart Table */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-[var(--accent-primary)]" />
                Active Grocery Shopping List
              </h3>
              {cart.length > 0 && (
                <button
                  onClick={clearCart}
                  className="text-xs text-[var(--text-muted)] hover:text-[var(--semantic-danger,#ef4444)] flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Clear Entire Basket</span>
                </button>
              )}
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] divide-y divide-[var(--border-hairline)]">
              {cart.length > 0 ? (
                cart.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-sm text-[var(--text-primary)]">
                          {item.name}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                          {item.category}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-xs text-[var(--text-muted)]">
                        <Store className="w-3 h-3" />
                        <span>{item.store}</span>
                        <span>·</span>
                        <span>Unit: {item.unit}</span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-5">
                      {/* Quantity Controller */}
                      <div className="flex items-center gap-1 bg-[var(--bg-surface)] border border-[var(--border-hairline)] rounded-md px-1 py-0.5">
                        <button
                          onClick={() => updateCartQty(item.id, -1)}
                          className="w-5 h-5 flex items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                        >
                          -
                        </button>
                        <span className="w-6 text-center font-mono font-semibold text-[var(--text-primary)]">
                          {item.qty}
                        </span>
                        <button
                          onClick={() => updateCartQty(item.id, 1)}
                          className="w-5 h-5 flex items-center justify-center rounded text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                        >
                          +
                        </button>
                      </div>

                      {/* Line Item Total */}
                      <div className="text-right font-mono w-16">
                        <span className="font-semibold text-sm text-[var(--text-primary)]">
                          ${((item.priceCents * item.qty) / 100).toFixed(2)}
                        </span>
                        <span className="block text-[10px] text-[var(--text-muted)]">
                          ${(item.priceCents / 100).toFixed(2)} / ea
                        </span>
                      </div>

                      <button
                        onClick={() => removeFromCart(item.id)}
                        className="text-[var(--text-muted)] hover:text-[var(--semantic-danger,#ef4444)] p-1 rounded"
                        title="Remove item"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-8 text-center text-xs text-[var(--text-muted)]">
                  Your basket is empty. Browse the &ldquo;Ingredient Search&rdquo; tab to add the cheapest items near you!
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 1: RECIPE & INGREDIENTS INSPECTOR MODAL                             */}
      {/* ========================================================================= */}
      {activeRecipeModal && (
        <div
          onClick={() => {
            setActiveRecipeModal(null);
            setRecipeLoggedNotice(null);
          }}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl max-w-2xl w-full p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-hairline)] pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-bold text-[var(--text-primary)]">
                    {activeRecipeModal.name}
                  </h2>
                  <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                    {activeRecipeModal.meal_type}
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-1">
                  Prep & Cook Time: ~{activeRecipeModal.prep_time_min || 25} minutes · High Protein Lean-Bulk Blueprint
                </p>
              </div>

              <button
                onClick={() => {
                  setActiveRecipeModal(null);
                  setRecipeLoggedNotice(null);
                }}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)] p-1 rounded-md transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Notification Banner */}
            {recipeLoggedNotice && (
              <div className="p-2.5 rounded-md bg-[var(--bg-surface)] border border-[var(--semantic-success,#10b981)]/40 text-xs flex items-center gap-2 text-[var(--semantic-success,#10b981)] font-medium animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{recipeLoggedNotice}</span>
              </div>
            )}

            {/* Macro Breakdown Strip */}
            <div className="grid grid-cols-4 gap-3">
              <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-center">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block">Protein</span>
                <span className="text-base font-bold font-mono text-[var(--accent-primary)]">
                  {activeRecipeModal.protein_g}g
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-center">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block">Energy</span>
                <span className="text-base font-bold font-mono text-[var(--text-primary)]">
                  {activeRecipeModal.calories} kcal
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-center">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block">Est. Cost</span>
                <span className="text-base font-bold font-mono text-[var(--semantic-success,#10b981)]">
                  ${(activeRecipeModal.cost_estimate_cents / 100).toFixed(2)}
                </span>
              </div>
              <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-center">
                <span className="text-[10px] uppercase tracking-wider text-[var(--text-muted)] block">Cost/Protein</span>
                <span className="text-base font-bold font-mono text-[var(--text-secondary)]">
                  ${((activeRecipeModal.cost_estimate_cents / 100) / (activeRecipeModal.protein_g || 1)).toFixed(2)}/10g
                </span>
              </div>
            </div>

            {/* Detailed Ingredients Breakdown */}
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Ingredients Breakdown (Per Serving)
              </h3>

              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] divide-y divide-[var(--border-hairline)]">
                {(() => {
                  let ings = activeRecipeModal.ingredients;
                  if (typeof ings === "string") {
                    try {
                      ings = JSON.parse(ings);
                    } catch {
                      ings = [];
                    }
                  }
                  return (ings as any[]).map((ing, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
                        <span className="font-medium text-[var(--text-primary)]">
                          {ing.name}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 font-mono">
                        {ing.best_store && (
                          <span className="text-[11px] font-sans text-[var(--text-muted)]">
                            {ing.best_store}
                          </span>
                        )}
                        <span className="text-[var(--text-secondary)]">
                          {ing.qty} {ing.unit}
                        </span>
                        <span className="text-[var(--accent-primary)] font-semibold">
                          {ing.protein_g}g prot
                        </span>
                        <span className="text-[var(--text-muted)] w-12 text-right">
                          ${(((ing.live_est_cost_cents || ing.est_cost_cents || 40)) / 100).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Cooking Instructions */}
            <div className="space-y-1.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)] flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                Step-by-Step Cooking Instructions
              </h3>
              <div className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] leading-relaxed">
                {activeRecipeModal.instructions || "Pan sear chicken to 165°F internal temperature. Combine with carbs and veggies."}
              </div>
            </div>

            {/* Modal Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-3 border-t border-[var(--border-hairline)]">
              <button
                onClick={() => handleAddRecipeIngredientsToBasket(activeRecipeModal)}
                className="w-full sm:w-auto px-4 py-2 rounded-md text-xs font-medium bg-[var(--bg-surface)] hover:bg-[var(--bg-base)] text-[var(--text-primary)] border border-[var(--border-hairline)] flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Add Ingredients to Shopping Basket</span>
              </button>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={handleDeleteActiveRecipe}
                  className="px-3 py-2 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--semantic-danger,#ef4444)] border border-[var(--border-hairline)] bg-[var(--bg-surface)] cursor-pointer flex items-center gap-1"
                  title="Delete recipe template"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>

                <button
                  onClick={() => {
                    setActiveRecipeModal(null);
                    setRecipeLoggedNotice(null);
                  }}
                  className="px-4 py-2 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                >
                  Close
                </button>

                <button
                  onClick={handleLogActiveRecipe}
                  className="flex-1 sm:flex-none px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Log to Today&apos;s Macros</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL 2: CREATE CUSTOM RECIPE WITH INGREDIENTS BUILDER                     */}
      {/* ========================================================================= */}
      {showCreateRecipeModal && (
        <div
          onClick={() => setShowCreateRecipeModal(false)}
          className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4"
        >
          <form
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleSaveCustomRecipe}
            className="bg-[var(--bg-elevated)] border border-[var(--border-hairline)] rounded-xl max-w-2xl w-full p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between border-b border-[var(--border-hairline)] pb-3">
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)] flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-[var(--accent-primary)]" />
                  Create Recipe with Real Ingredients
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Build a custom high-protein meal template. Ingredients calculate macros and cost automatically.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateRecipeModal(false)}
                className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Recipe Meta Details */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2">
                <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                  Recipe Name
                </label>
                <input
                  type="text"
                  value={newRecipeName}
                  onChange={(e) => setNewRecipeName(e.target.value)}
                  placeholder="e.g. Chicken Thigh & Sweet Potato Skillet"
                  required
                  className="w-full px-3 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent-primary)]"
                />
              </div>

              <div>
                <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                  Meal Category
                </label>
                <ThemedSelect
                  variant="surface"
                  value={newRecipeMealType}
                  onChange={(e) => setNewRecipeMealType(e.target.value)}
                  selectClassName="py-1.5"
                >
                  <option value="lunch">Lunch</option>
                  <option value="dinner">Dinner</option>
                  <option value="breakfast">Breakfast</option>
                  <option value="snack">Snack</option>
                  <option value="post_workout">Post-Workout</option>
                </ThemedSelect>
              </div>
            </div>

            {/* Ingredients Table */}
            <div className="space-y-2">
              <label className="text-[11px] text-[var(--text-muted)] block font-semibold uppercase tracking-wider">
                Recipe Ingredients ({newRecipeIngredients.length})
              </label>

              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] divide-y divide-[var(--border-hairline)] max-h-48 overflow-y-auto">
                {newRecipeIngredients.map((ing, idx) => (
                  <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                    <span className="font-medium text-[var(--text-primary)]">{ing.name}</span>
                    <div className="flex items-center gap-3 font-mono">
                      <span className="text-[var(--text-secondary)]">{ing.qty} {ing.unit}</span>
                      <span className="text-[var(--accent-primary)] font-semibold">{ing.protein_g}g prot</span>
                      <span className="text-[var(--text-muted)]">${(ing.est_cost_cents / 100).toFixed(2)}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveIngredientFromNewRecipe(idx)}
                        className="text-[var(--text-muted)] hover:text-[var(--semantic-danger,#ef4444)] ml-1"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Add Ingredient Row */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2">
                  <ThemedSelect
                    variant="surface"
                    value={selectedIngredientPreset}
                    onChange={(e) => setSelectedIngredientPreset(e.target.value)}
                    containerClassName="flex-1"
                    selectClassName="py-1.5"
                  >
                    {COMMON_INGREDIENTS.map((ing) => (
                      <option key={ing.name} value={ing.name}>
                        {ing.name} ({ing.qty} {ing.unit} · {ing.protein_g}g protein)
                      </option>
                    ))}
                  </ThemedSelect>

                  <button
                    type="button"
                    onClick={() => {
                      const preset = COMMON_INGREDIENTS.find((i) => i.name === selectedIngredientPreset);
                      if (preset) setNewRecipeIngredients((prev) => [...prev, { ...preset }]);
                    }}
                    className="px-3 py-1.5 rounded-md text-xs font-medium bg-[var(--bg-surface)] text-[var(--accent-primary)] border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] shrink-0 flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Preset</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={customIngName}
                    onChange={(e) => setCustomIngName(e.target.value)}
                    placeholder="Or type custom ingredient (e.g. Chobani Yogurt)"
                    className="flex-1 min-w-[180px] px-2.5 py-1.5 rounded-md text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none"
                  />
                  <input
                    type="number"
                    min={0}
                    value={customIngProt}
                    onChange={(e) => setCustomIngProt(Number(e.target.value))}
                    title="Protein (g)"
                    className="w-16 px-2 py-1.5 rounded-md text-xs font-mono bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)]"
                  />
                  <span className="text-[11px] text-[var(--text-muted)]">g prot</span>
                  <button
                    type="button"
                    onClick={handleAddIngredientToNewRecipe}
                    disabled={!customIngName.trim()}
                    className="px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] disabled:opacity-40 cursor-pointer"
                  >
                    + Add Custom
                  </button>
                </div>
              </div>
            </div>

            {/* Computed Aggregates Preview */}
            <div className="p-3 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex items-center justify-around text-xs font-mono">
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block uppercase">Calculated Protein</span>
                <span className="text-sm font-bold text-[var(--accent-primary)]">
                  {computedNewRecipeTotals.protein_g}g
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block uppercase">Calculated Energy</span>
                <span className="text-sm font-bold text-[var(--text-primary)]">
                  {computedNewRecipeTotals.calories} kcal
                </span>
              </div>
              <div>
                <span className="text-[10px] text-[var(--text-muted)] block uppercase">Estimated Cost</span>
                <span className="text-sm font-bold text-[var(--semantic-success,#10b981)]">
                  ${(computedNewRecipeTotals.cost_estimate_cents / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Instructions */}
            <div>
              <label className="text-[11px] text-[var(--text-muted)] block mb-1">
                Step-by-Step Cooking Instructions
              </label>
              <textarea
                value={newRecipeInstructions}
                onChange={(e) => setNewRecipeInstructions(e.target.value)}
                placeholder="e.g. Dice chicken thighs. Pan fry with garlic and olive oil until browned. Steam broccoli and combine over jasmine rice."
                rows={3}
                className="w-full px-3 py-2 rounded-md text-xs bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] focus:outline-none focus:border-[var(--accent-primary)] leading-relaxed"
              />
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
              <button
                type="button"
                onClick={() => setShowCreateRecipeModal(false)}
                className="px-4 py-1.5 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={savingRecipe}
                className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 transition-opacity"
              >
                {savingRecipe ? "Saving Recipe..." : "Save Recipe to Database"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
