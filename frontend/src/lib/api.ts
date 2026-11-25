/**
 * API Client for FastAPI Life-Ops Backend
 *
 * In Standalone Demo Mode (NEXT_PUBLIC_DEMO_MODE=true), all calls are intercepted
 * and served client-side with zero external network requests.
 */

import { isDemoMode } from "./demo-mode";
import { assertNoDemoNetworkCall, installDemoNetworkGuard } from "./demo-guard";
import * as demo from "./demo-service";
import { queryDemoRag } from "./demo-data";

// Install runtime network fetch guard when in browser
if (typeof window !== "undefined" && isDemoMode()) {
  installDemoNetworkGuard();
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

async function request<T>(endpoint: string, options?: RequestInit): Promise<T> {
  // Hard Invariant Guard: Throw and log loudly if any network call is attempted in demo mode
  if (isDemoMode()) {
    assertNoDemoNetworkCall(endpoint);
  }

  const url = `${API_BASE}${endpoint}`;
  try {
    const res = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      cache: "no-store",
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || `Request failed with status ${res.status}`);
    }
    return (await res.json()) as T;
  } catch (err: any) {
    console.error(`API Error on ${endpoint}:`, err);
    throw err;
  }
}

// ── Canvas & Academics ──────────────────────────────────────────────

export const getAssignments = async (status = "active", course?: string) => {
  if (isDemoMode()) {
    return demo.getDemoAssignments(status, course);
  }
  return request<any[]>(`/api/canvas/assignments?status=${status}${course ? `&course=${course}` : ""}`);
};

export const getCanvasStatus = async () => {
  if (isDemoMode()) {
    return { session_valid: true, mode: "demo_standalone" };
  }
  return request<{ session_valid: boolean; mode: string }>("/api/canvas/session-status");
};

export const pollCanvasNow = async () => {
  if (isDemoMode()) {
    return { status: "success", stats: { active: 4, completed: 2, updated: 0 } };
  }
  return request<{ status: string; stats?: any; message?: string; code?: number; reason?: string }>("/api/canvas/poll-now", { method: "POST" });
};

export const toggleAssignmentSubmission = async (assignmentId: string) => {
  if (isDemoMode()) {
    return demo.toggleDemoAssignmentSubmission(assignmentId);
  }
  return request<any>(`/api/canvas/assignments/${assignmentId}/toggle-submit`, { method: "POST" });
};

export const refreshCanvasSession = async () => {
  if (isDemoMode()) {
    return { status: "simulated", message: "Demo mode: Canvas authentication is simulated." };
  }
  return request<any>("/api/canvas/refresh-session", { method: "POST" });
};

export interface AssignmentSections {
  summary?: string;
  estimated_effort?: string;
  general?: string;
  deliverables?: string[];
  rubric?: string[];
  resources_and_policies?: string[];
}

export const analyzeAssignment = async (assignmentId: string, force = false) => {
  if (isDemoMode()) {
    return demo.analyzeDemoAssignment(assignmentId, force);
  }
  return request<{
    status: string;
    cached?: boolean;
    rate_limited?: boolean;
    key_source?: string;
    assignment_id: string;
    ai_summary: string;
    ai_sections: AssignmentSections;
    ai_model: string;
    ai_analyzed_at?: string | null;
    message?: string | null;
  }>(`/api/canvas/assignments/${assignmentId}/analyze?force=${force ? "true" : "false"}`, {
    method: "POST",
  });
};

export const analyzeAssignmentsBatch = async (limit = 8, force = false) => {
  if (isDemoMode()) {
    return demo.analyzeDemoAssignmentsBatch(limit);
  }
  return request<{
    status: string;
    analyzed_count: number;
    gemini_count: number;
    local_count: number;
    rate_limited: boolean;
    key_source: string;
    remaining_candidates: number;
    message: string;
    results: Array<{
      assignment_id: string;
      ai_model?: string;
      ai_summary?: string;
      cached?: boolean;
      rate_limited?: boolean;
    }>;
  }>("/api/canvas/assignments/analyze-batch", {
    method: "POST",
    body: JSON.stringify({ limit, force }),
  });
};

// ── Calendar & Scheduling ───────────────────────────────────────────

export const getCalendarEvents = async (
  limitOrOptions:
    | number
    | {
        limit?: number;
        start_time?: string;
        end_time?: string;
        calendar_id?: string;
      } = 500
) => {
  const opts =
    typeof limitOrOptions === "number"
      ? { limit: limitOrOptions }
      : limitOrOptions || {};
  const limit = opts.limit ?? 500;

  if (isDemoMode()) {
    let items = demo.getDemoEvents();
    if (opts.calendar_id && opts.calendar_id !== "all") {
      items = items.filter((e) => (e.calendar_id || "primary") === opts.calendar_id);
    }
    if (opts.start_time) {
      const startMs = new Date(opts.start_time).getTime();
      items = items.filter((e) => new Date(e.end_time).getTime() >= startMs);
    }
    if (opts.end_time) {
      const endMs = new Date(opts.end_time).getTime();
      items = items.filter((e) => new Date(e.start_time).getTime() <= endMs);
    }
    return items.slice(0, limit);
  }

  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (opts.start_time) params.set("start_time", opts.start_time);
  if (opts.end_time) params.set("end_time", opts.end_time);
  if (opts.calendar_id) params.set("calendar_id", opts.calendar_id);
  return request<any[]>(`/api/calendar/events?${params.toString()}`);
};

export const getCalendars = async () => {
  if (isDemoMode()) {
    return demo.getDemoCalendars();
  }
  return request<
    Array<{
      calendar_id: string;
      calendar_name: string;
      color: string;
      source?: string;
      event_count: number;
      feed_id?: string | null;
      provider?: string | null;
    }>
  >("/api/calendar/calendars");
};

export const deleteCalendarById = async (calendarId: string) => {
  if (isDemoMode()) {
    return demo.deleteDemoCalendar(calendarId);
  }
  return request<{
    status: string;
    calendar_id: string;
    events_deleted: number;
    feeds_deleted: number;
  }>(`/api/calendar/calendars/${encodeURIComponent(calendarId)}`, {
    method: "DELETE",
  });
};

export const createCalendarEvent = async (data: {
  summary: string;
  start_time: string;
  end_time: string;
  calendar_id?: string;
  calendar_name?: string;
  description?: string;
  location?: string;
  color?: string;
  source?: string;
  recurring_rule?: string;
  repeat?: string;
}) => {
  if (isDemoMode()) {
    return demo.createDemoEvent(data);
  }
  return request<any>("/api/calendar/events", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const updateCalendarEvent = async (
  id: string,
  data: {
    summary?: string;
    description?: string;
    location?: string;
    start_time?: string;
    end_time?: string;
    color?: string;
    status?: string;
    source?: string;
    calendar_name?: string;
  }
) => {
  if (isDemoMode()) {
    return demo.updateDemoEvent(id, data);
  }
  return request<any>(`/api/calendar/events/${id}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

export const deleteCalendarEvent = async (
  id: string,
  mode: "single" | "week" | "series" = "single"
) => {
  if (isDemoMode()) {
    return demo.deleteDemoEvent(id);
  }
  return request<any>(`/api/calendar/events/${id}?mode=${mode}`, {
    method: "DELETE",
  });
};

export const requestAdjustment = async (data: {
  event_id: string;
  new_start: string;
  new_end: string;
  reason: string;
}) => {
  if (isDemoMode()) {
    return { status: "staged", message: "Adjustment proposal staged for review." };
  }
  return request<any>("/api/calendar/request-adjustment", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const detectConflicts = async (data: {
  start_time: string;
  end_time: string;
  exclude_id?: string;
}) => {
  if (isDemoMode()) {
    return demo.detectDemoConflicts(data);
  }
  return request<any[]>("/api/calendar/detect-conflicts", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const exportIcsCalendar = () => {
  if (isDemoMode()) {
    demo.exportDemoIcsFile();
    return;
  }
  window.open(`${API_BASE}/api/calendar/export-ics`, "_blank");
};

export const importIcsCalendar = async (formData: FormData) => {
  if (isDemoMode()) {
    return demo.importDemoIcs();
  }
  const res = await fetch(`${API_BASE}/api/calendar/import-ics`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    throw new Error(`Import failed with status ${res.status}`);
  }
  return res.json();
};

// ── Autopilot & Schedule Rebalancer ─────────────────────────────────

export const getAutopilotLogs = async (limit = 30) => {
  if (isDemoMode()) {
    return demo.getDemoAutopilotLogs().slice(0, limit);
  }
  return request<any[]>(`/api/autopilot/logs?limit=${limit}`);
};

export const undoAutopilotAction = async (logId: string) => {
  if (isDemoMode()) {
    return demo.undoDemoAutopilotAction(logId);
  }
  return request<any>(`/api/autopilot/undo/${logId}`, { method: "POST" });
};

export const getPendingActions = async () => {
  if (isDemoMode()) {
    return demo.getDemoPendingActions();
  }
  return request<any[]>("/api/autopilot/pending");
};

export const approveAction = async (id: string) => {
  if (isDemoMode()) {
    return demo.approveDemoAction(id);
  }
  return request<any>(`/api/autopilot/pending/${id}/approve`, { method: "POST" });
};

export const rejectAction = async (id: string) => {
  if (isDemoMode()) {
    return demo.rejectDemoAction(id);
  }
  return request<any>(`/api/autopilot/pending/${id}/reject`, { method: "POST" });
};

// ── Health & Nutrition ──────────────────────────────────────────────

export const getMeals = async (mealType?: string, radiusMiles?: number) => {
  if (isDemoMode()) {
    return demo.getDemoMeals();
  }
  const params = new URLSearchParams();
  if (mealType) params.set("meal_type", mealType);
  if (radiusMiles) params.set("radius_miles", String(radiusMiles));
  const qs = params.toString();
  return request<any[]>(`/api/health/meals${qs ? `?${qs}` : ""}`);
};

export const deleteRecipe = async (recipeId: string) => {
  if (isDemoMode()) {
    return demo.deleteDemoRecipe(recipeId);
  }
  return request<{ status: string; id: string; name?: string }>(`/api/health/recipes/${recipeId}`, {
    method: "DELETE",
  });
};

export const getWeeklyBudget = async (radiusMiles?: number) => {
  if (isDemoMode()) {
    return demo.getDemoWeeklyBudget();
  }
  const qs = radiusMiles ? `?radius_miles=${encodeURIComponent(String(radiusMiles))}` : "";
  return request<any>(`/api/health/weekly-budget${qs}`);
};

export interface NearbyGroceryStore {
  id: string;
  name: string;
  chain: string;
  price_tier: string;
  price_multiplier: number;
  distance_miles: number;
  address: string;
  opening_hours?: string | null;
  latitude: number;
  longitude: number;
  category: string;
  maps_url: string;
  source: string;
}

export interface NearbyStoresResponse {
  location_label: string;
  city: string;
  region: string;
  latitude: number | null;
  longitude: number | null;
  radius_miles: number;
  source: string;
  store_count: number;
  stores: NearbyGroceryStore[];
}

export const getNearbyGroceryStores = async (radiusMiles?: number): Promise<NearbyStoresResponse> => {
  if (isDemoMode()) {
    return demo.getDemoNearbyStores(radiusMiles);
  }
  const qs = radiusMiles ? `?radius_miles=${encodeURIComponent(String(radiusMiles))}` : "";
  return request<NearbyStoresResponse>(`/api/health/nearby-stores${qs}`);
};

export const getDailyMacroLog = async (date?: string) => {
  if (isDemoMode()) {
    return demo.getDemoDailyMacroLog();
  }
  return request<any>(`/api/health/daily-log${date ? `?date=${encodeURIComponent(date)}` : ""}`);
};

export const logMeal = async (data: {
  meal_name: string;
  calories: number;
  protein_g: number;
  carbs_g?: number;
  fat_g?: number;
  cost_estimate_cents?: number;
  meal_type?: string;
  date?: string;
}) => {
  if (isDemoMode()) {
    return demo.logDemoMeal(data);
  }
  return request<any>("/api/health/log-meal", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const deleteLoggedMeal = async (logId: string) => {
  if (isDemoMode()) {
    return demo.deleteDemoLoggedMeal(logId);
  }
  return request<any>(`/api/health/log-meal/${logId}`, { method: "DELETE" });
};

export const resetDailyLog = async (date?: string) => {
  if (isDemoMode()) {
    return demo.resetDemoDailyLog();
  }
  return request<any>(`/api/health/reset-daily-log${date ? `?date=${encodeURIComponent(date)}` : ""}`, {
    method: "POST",
  });
};

export const searchIngredients = async (
  q?: string,
  category?: string,
  radiusMiles?: number,
  store?: string
) => {
  if (isDemoMode()) {
    return demo.searchDemoIngredients(q, category);
  }
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (category && category !== "all") params.set("category", category);
  if (radiusMiles) params.set("radius_miles", String(radiusMiles));
  if (store) params.set("store", store);
  const qs = params.toString();
  return request<any[]>(`/api/health/ingredient-search${qs ? `?${qs}` : ""}`);
};

export const getGroceryPrices = async (category?: string) => {
  if (isDemoMode()) {
    return demo.getDemoGroceryPrices();
  }
  return request<any[]>(`/api/health/grocery-prices${category ? `?category=${encodeURIComponent(category)}` : ""}`);
};

export const scheduleMealPrep = async (data: {
  prep_date?: string;
  start_time?: string;
  end_time?: string;
  meals: string[];
  notes?: string;
}) => {
  if (isDemoMode()) {
    return demo.createDemoEvent({
      summary: "Meal Prep: " + data.meals.join(", "),
      start_time: data.start_time || new Date().toISOString(),
      end_time: data.end_time || new Date(Date.now() + 7200000).toISOString(),
      calendar_name: "Health & Fitness",
      color: "#10b981",
      description: data.notes || "Scheduled via Health & Meal Prep",
    });
  }
  return request<any>("/api/health/schedule-meal-prep", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const getMacroHistory = async (days = 7, endDate?: string) => {
  if (isDemoMode()) {
    return demo.getDemoMacroHistory();
  }
  const params = new URLSearchParams();
  if (days) params.set("days", String(days));
  if (endDate) params.set("end_date", endDate);
  const qs = params.toString();
  return request<any>(`/api/health/macro-history${qs ? `?${qs}` : ""}`);
};

export const createRecipe = async (data: {
  name: string;
  meal_type: string;
  ingredients: any[];
  prep_time_min?: number;
  calories: number;
  protein_g: number;
  cost_estimate_cents?: number;
  instructions: string;
  tags?: string[];
}) => {
  if (isDemoMode()) {
    return demo.createDemoRecipe(data);
  }
  return request<any>("/api/health/recipes", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const logRecipe = async (recipeId: string, date?: string) => {
  if (isDemoMode()) {
    return demo.logDemoRecipe(recipeId);
  }
  return request<any>(`/api/health/log-recipe/${recipeId}${date ? `?date=${encodeURIComponent(date)}` : ""}`, {
    method: "POST",
  });
};

// ── AI Command Bar ──────────────────────────────────────────────────

export const sendAiQuery = async (data: { query: string; exam_mode?: boolean }) => {
  if (isDemoMode()) {
    return demo.simulateAiQuery(data);
  }
  return request<{
    response: string;
    routed_to: string;
    model: string;
    latency_ms: number;
    exam_mode: boolean;
    action_staged?: {
      action_id: string;
      action_type: string;
      summary: string;
      count: number;
    };
  }>("/api/ai/query", {
    method: "POST",
    body: JSON.stringify(data),
  });
};

export const toggleExamMode = async (enabled: boolean) => {
  if (isDemoMode()) {
    return demo.toggleDemoExamMode(enabled);
  }
  return request<{ status: string; exam_mode: boolean }>("/api/ai/exam-mode", {
    method: "POST",
    body: JSON.stringify({ enabled }),
  });
};

// ── Daily Briefing & Direct Line AI ─────────────────────────────────

export const getDailyBrief = async () => {
  if (isDemoMode()) {
    return demo.getDemoDailyBrief();
  }
  return request<any>("/api/brief/daily");
};

export const getRandomCuriosity = async () => {
  if (isDemoMode()) {
    return demo.getRandomDemoCuriosity();
  }
  return request<{
    id: string;
    category: string;
    tag: string;
    title: string;
    did_you_know: string;
    reflection: string;
    footnote?: string;
  }>("/api/brief/curiosity/random");
};

export const adoptDailyPlan = async (planId: string) => {
  if (isDemoMode()) {
    return demo.adoptDemoDailyPlan(planId);
  }
  return request<{ status: string; plan_id: string; plan_name: string; events_created: number; message: string }>(
    "/api/brief/adopt-plan",
    {
      method: "POST",
      body: JSON.stringify({ plan_id: planId }),
    }
  );
};

export interface AssistantSessionSummary {
  id: string;
  title: string;
  message_count: number;
  preview: string;
  created_at?: string | null;
  updated_at?: string | null;
}

export interface AssistantSavedMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  payload?: Record<string, any>;
  created_at?: string | null;
}

export interface AssistantSessionDetail {
  id: string;
  title: string;
  created_at?: string | null;
  updated_at?: string | null;
  messages: AssistantSavedMessage[];
}

export const getAssistantSessions = async (): Promise<AssistantSessionSummary[]> => {
  if (isDemoMode()) {
    return demo.getDemoAssistantSessions();
  }
  const res = await request<{ sessions: AssistantSessionSummary[] }>("/api/brief/sessions");
  return Array.isArray(res?.sessions) ? res.sessions : [];
};

export const createAssistantSession = async (title?: string): Promise<AssistantSessionSummary> => {
  if (isDemoMode()) {
    return demo.createDemoAssistantSession(title);
  }
  const res = await request<{ session: AssistantSessionSummary }>("/api/brief/sessions", {
    method: "POST",
    body: JSON.stringify({ title }),
  });
  return res.session;
};

export const getAssistantSession = async (sessionId: string): Promise<AssistantSessionDetail> => {
  if (isDemoMode()) {
    return demo.getDemoAssistantSession(sessionId);
  }
  const res = await request<{ session: AssistantSessionDetail }>(`/api/brief/sessions/${encodeURIComponent(sessionId)}`);
  return res.session;
};

export const renameAssistantSession = async (sessionId: string, title: string) => {
  if (isDemoMode()) {
    return demo.renameDemoAssistantSession(sessionId, title);
  }
  return request<{ status: string; session: AssistantSessionSummary }>(
    `/api/brief/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ title }),
    }
  );
};

export const deleteAssistantSession = async (sessionId: string) => {
  if (isDemoMode()) {
    return demo.deleteDemoAssistantSession(sessionId);
  }
  return request<{ status: string; id: string }>(
    `/api/brief/sessions/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
    }
  );
};

export const sendDirectLineMessage = async (
  message: string,
  category?: string,
  history?: Array<{ role: string; content: string }>,
  sessionId?: string | null
) => {
  if (isDemoMode()) {
    return demo.simulateDirectLineMessage(message, sessionId || undefined);
  }
  return request<any>("/api/brief/direct-line", {
    method: "POST",
    body: JSON.stringify({
      message,
      category,
      history,
      session_id: sessionId || undefined,
      persist: true,
    }),
  });
};

export const getUserKnowledge = async (category?: string) => {
  if (isDemoMode()) {
    return demo.getDemoUserKnowledge(category);
  }
  return request<any[]>(`/api/brief/knowledge${category ? `?category=${category}` : ""}`);
};

export const createUserKnowledge = async (item: {
  category: string;
  title: string;
  content?: string;
  metadata?: any;
}) => {
  if (isDemoMode()) {
    return demo.createDemoUserKnowledge(item);
  }
  return request<{
    status: string;
    item: any;
  }>("/api/brief/knowledge", {
    method: "POST",
    body: JSON.stringify(item),
  });
};

export const updateUserKnowledge = async (
  itemId: string,
  data: {
    category?: string;
    title?: string;
    content?: string;
    metadata?: any;
  }
) => {
  if (isDemoMode()) {
    return demo.updateDemoUserKnowledge(itemId, data);
  }
  return request<{
    status: string;
    item: any;
  }>(`/api/brief/knowledge/${itemId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
};

export const deleteUserKnowledge = async (itemId: string) => {
  if (isDemoMode()) {
    return demo.deleteDemoUserKnowledge(itemId);
  }
  return request<{ status: string; message: string }>(`/api/brief/knowledge/${itemId}`, {
    method: "DELETE",
  });
};

export const commitAssistantEvent = async (eventData: {
  summary: string;
  start_time: string;
  end_time: string;
  location?: string;
  description?: string;
  color?: string;
  source?: string;
}) => {
  if (isDemoMode()) {
    const created = demo.createDemoEvent(eventData);
    return {
      status: "success",
      event_id: created.id,
      event: created,
      message: `Committed "${eventData.summary}" to schedule.`,
    };
  }
  return request<{
    status: string;
    event_id: string;
    event: any;
    message: string;
  }>("/api/brief/commit-event", {
    method: "POST",
    body: JSON.stringify(eventData),
  });
};

// ── RAG Semantic Search ─────────────────────────────────────────────

export const searchRag = async (query: string, limit = 4, sourceType?: string) => {
  if (isDemoMode()) {
    return queryDemoRag(query, limit, sourceType);
  }
  return request<any[]>("/api/rag/search", {
    method: "POST",
    body: JSON.stringify({ query, limit, source_type: sourceType }),
  });
};

export interface IndexedDocumentItem {
  source_type: string;
  source_path: string;
  filename: string;
  chunk_count: number;
  preview: string;
  updated_at?: string | null;
}

export const getIndexedDocuments = async (sourceType?: string): Promise<IndexedDocumentItem[]> => {
  if (isDemoMode()) {
    return demo.getDemoIndexedDocuments(sourceType);
  }
  const qs = sourceType ? `?source_type=${encodeURIComponent(sourceType)}` : "";
  const res = await request<{ documents: IndexedDocumentItem[] }>(`/api/rag/documents${qs}`);
  return Array.isArray(res?.documents) ? res.documents : [];
};

export const deleteIndexedDocument = async (sourcePath: string, sourceType?: string) => {
  if (isDemoMode()) {
    return demo.deleteDemoIndexedDocument(sourcePath);
  }
  const params = new URLSearchParams({ source_path: sourcePath });
  if (sourceType) params.set("source_type", sourceType);
  return request<{ status: string; source_path: string; chunks_deleted: number }>(
    `/api/rag/documents?${params.toString()}`,
    { method: "DELETE" }
  );
};

export const uploadResumeDocument = async (file: File) => {
  if (isDemoMode()) {
    return demo.uploadDemoResumeDocument(file.name);
  }
  const fd = new FormData();
  fd.append("file", file);
  fd.append("source_type", "resume");
  const res = await fetch(`${API_BASE}/api/profile/upload-document`, {
    method: "POST",
    body: fd,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Resume upload failed with status ${res.status}`);
  }
  return res.json();
};

// ── User Profile, Onboarding & External Calendar Feeds ──────────────

export interface UserProfile {
  id?: string;
  full_name: string;
  first_name: string;
  institution: string;
  term_label: string;
  major_or_role: string;
  majors?: string[];
  minors?: string[];
  academic_year?: string;
  expected_graduation?: string;
  career_role?: string;
  city: string;
  region: string;
  timezone: string;
  latitude: number | null;
  longitude: number | null;
  grocery_radius_miles?: number;
  wake_time: string;
  sleep_time: string;
  study_sanctuary: string;
  canvas_base_url: string;
  canvas_ics_url: string;
  daily_calories_target: number;
  daily_protein_g: number;
  daily_carbs_g: number;
  daily_fats_g: number;
  dietary_notes: string;
  onboarding_completed: boolean;
  gemini_api_key?: string;
  clear_gemini_api_key?: boolean;
  has_gemini_api_key?: boolean;
  gemini_api_key_source?: "profile" | "env" | "none";
  gemini_api_key_masked?: string;
  created_at?: string;
  updated_at?: string;
}

export interface SetupStatus {
  profile_configured?: boolean;
  canvas_configured?: boolean;
  calendar_feeds_count?: number;
  google_oauth_configured?: boolean;
  active_assignments_count?: number;
  calendar_events_count?: number;
  onboarding_completed?: boolean;
  has_gemini_api_key?: boolean;
  gemini_api_key_source?: "profile" | "env" | "none";
}

export interface GeocodeCandidate {
  label?: string;
  name?: string;
  city?: string;
  region?: string;
  country?: string;
  latitude: number;
  longitude: number;
  timezone: string;
}

export type CalendarFeedProvider =
  | "google"
  | "apple"
  | "outlook"
  | "canvas"
  | "ics_url"
  | "ics_file";

export interface CalendarFeed {
  id: string;
  name: string;
  provider: CalendarFeedProvider;
  feed_url?: string | null;
  calendar_id?: string;
  color?: string;
  sync_enabled?: boolean;
  last_synced_at?: string | null;
  last_event_count?: number;
  last_error?: string | null;
  created_at?: string;
  updated_at?: string;
}

export const getUserProfile = async () => {
  if (isDemoMode()) {
    return demo.getDemoUserProfile();
  }
  return request<{ profile?: UserProfile; setup_status?: SetupStatus } & Partial<UserProfile>>(
    "/api/profile"
  );
};

export const updateUserProfile = async (data: Partial<UserProfile>) => {
  if (isDemoMode()) {
    return demo.updateDemoUserProfile(data);
  }
  return request<{ status?: string; profile?: UserProfile; setup_status?: SetupStatus } & Partial<UserProfile>>(
    "/api/profile",
    {
      method: "PUT",
      body: JSON.stringify(data),
    }
  );
};

export const geocodeLocation = async (
  queryOrPayload: string | { query?: string; city?: string; region?: string }
) => {
  const payload =
    typeof queryOrPayload === "string"
      ? (() => {
          const parts = queryOrPayload.split(",").map((s) => s.trim());
          return {
            query: queryOrPayload,
            city: parts[0] || queryOrPayload,
            region: parts[1] || "",
          };
        })()
      : {
          query:
            queryOrPayload.query ||
            [queryOrPayload.city, queryOrPayload.region].filter(Boolean).join(", "),
          city: queryOrPayload.city || queryOrPayload.query || "",
          region: queryOrPayload.region || "",
        };

  if (isDemoMode()) {
    return demo.geocodeDemoLocation(payload.query);
  }
  return request<{ results?: GeocodeCandidate[] } | GeocodeCandidate[]>("/api/profile/geocode", {
    method: "POST",
    body: JSON.stringify(payload),
  });
};

export const getCalendarFeeds = async () => {
  if (isDemoMode()) {
    return demo.getDemoCalendarFeeds();
  }
  return request<CalendarFeed[] | { feeds?: CalendarFeed[] }>("/api/profile/calendar-feeds");
};

export const addCalendarFeed = async (data: {
  name: string;
  provider: CalendarFeedProvider;
  feed_url: string;
  calendar_id?: string;
  color?: string;
}) => {
  if (isDemoMode()) {
    return demo.addDemoCalendarFeed(data);
  }
  return request<CalendarFeed & { feed?: CalendarFeed; status?: string }>(
    "/api/profile/calendar-feeds",
    {
      method: "POST",
      body: JSON.stringify(data),
    }
  );
};

export const syncCalendarFeed = async (id: string) => {
  if (isDemoMode()) {
    return demo.syncDemoCalendarFeed(id);
  }
  return request<any>(`/api/profile/calendar-feeds/${id}/sync`, {
    method: "POST",
  });
};

export const syncAllCalendarFeeds = async () => {
  if (isDemoMode()) {
    return demo.syncAllDemoCalendarFeeds();
  }
  return request<any>("/api/profile/calendar-feeds/sync-all", {
    method: "POST",
  });
};

export const deleteCalendarFeed = async (id: string) => {
  if (isDemoMode()) {
    return demo.deleteDemoCalendarFeed(id);
  }
  return request<{ status: string; id?: string }>(`/api/profile/calendar-feeds/${id}`, {
    method: "DELETE",
  });
};

export const uploadGoogleCredentials = async (formData: FormData) => {
  if (isDemoMode()) {
    return demo.uploadDemoGoogleCredentials();
  }
  const res = await fetch(`${API_BASE}/api/profile/upload-google-credentials`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Upload failed with status ${res.status}`);
  }
  return res.json();
};

export const uploadSyllabusDocument = async (formData: FormData) => {
  if (isDemoMode()) {
    const file = formData.get("file");
    const filename = file && typeof file === "object" && "name" in file ? String((file as File).name) : "syllabus.md";
    return demo.uploadDemoSyllabusDocument(filename);
  }
  const res = await fetch(`${API_BASE}/api/profile/upload-document`, {
    method: "POST",
    body: formData,
    cache: "no-store",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Upload failed with status ${res.status}`);
  }
  return res.json();
};

export const clearSampleData = async () => {
  if (isDemoMode()) {
    return demo.clearDemoSampleData();
  }
  return request<any>("/api/profile/clear-sample-data", {
    method: "POST",
  });
};

export const getCalendarSyncStatus = async () => {
  if (isDemoMode()) {
    return demo.getDemoCalendarSyncStatus();
  }
  return request<{
    mode: string;
    google_configured: boolean;
    message: string;
  }>("/api/calendar/sync-status");
};

export const triggerGoogleSync = async () => {
  if (isDemoMode()) {
    return demo.triggerDemoGoogleSync();
  }
  return request<any>("/api/calendar/trigger-google-sync", {
    method: "POST",
  });
};
