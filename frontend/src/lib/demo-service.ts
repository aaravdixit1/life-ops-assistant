/**
 * Standalone Demo Service Layer
 *
 * Implements client-side, zero-backend, zero-network mock handlers
 * for all Life-Ops frontend features. Persists changes in localStorage so
 * interactions (logging meals, toggling submissions, editing calendar events,
 * approving autopilot diffs) work realistically during demo reviews.
 */

import {
  generateDemoCalendarEvents,
  generateDemoAssignments,
  generateDemoAutopilotLogs,
  generateDemoPendingActions,
  generateDemoDailyBrief,
  DEMO_CURIOSITIES,
  generateDemoHealthData,
  generateDemoKnowledge,
  queryDemoRag,
  getRelativeDateTime,
} from "./demo-data";

const STORAGE_KEYS = {
  EVENTS: "lifeops_demo_events",
  ASSIGNMENTS: "lifeops_demo_assignments",
  AUTOPILOT_LOGS: "lifeops_demo_autopilot_logs",
  PENDING_ACTIONS: "lifeops_demo_pending_actions",
  HEALTH_LOG: "lifeops_demo_health_log",
  RECIPES: "lifeops_demo_recipes",
  KNOWLEDGE: "lifeops_demo_knowledge",
  EXAM_MODE: "lifeops_demo_exam_mode",
  PROFILE: "lifeops_demo_profile",
  FEEDS: "lifeops_demo_feeds",
};

// In-memory fallback caches for SSR or environments without localStorage
let memEvents: any[] | null = null;
let memAssignments: any[] | null = null;
let memAutopilotLogs: any[] | null = null;
let memPendingActions: any[] | null = null;
let memHealthData: any | null = null;
let memKnowledge: any[] | null = null;
let memProfile: any | null = null;
let memFeeds: any[] | null = null;
let memGoogleCredsUploaded = false;

if (typeof window !== "undefined") {
  window.addEventListener("lifeops-demo-reset", () => {
    memEvents = null;
    memAssignments = null;
    memAutopilotLogs = null;
    memPendingActions = null;
    memHealthData = null;
    memKnowledge = null;
    memProfile = null;
    memFeeds = null;
    memGoogleCredsUploaded = false;
  });
}

function loadStored<T>(key: string, fallback: () => T): T {
  if (typeof window === "undefined") return fallback();
  try {
    const raw = localStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch {
    // Ignore JSON errors and fallback
  }
  const fresh = fallback();
  try {
    localStorage.setItem(key, JSON.stringify(fresh));
  } catch {
    // Ignore quota errors
  }
  return fresh;
}

function saveStored<T>(key: string, data: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(data));
  } catch {
    // Ignore quota errors
  }
}

/* -------------------------------------------------------------------------- */
/*                               CALENDAR EVENTS                              */
/* -------------------------------------------------------------------------- */

export function getDemoEvents(): any[] {
  if (!memEvents) {
    memEvents = loadStored(STORAGE_KEYS.EVENTS, generateDemoCalendarEvents);
  }
  return memEvents;
}

export function createDemoEvent(data: {
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
}): any {
  const events = getDemoEvents();
  const newEvent = {
    id: `demo-event-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    calendar_name: data.calendar_name || "Personal Schedule",
    color: data.color || "#0284c7",
    source: data.source || "user_created",
    ...data,
  };
  events.push(newEvent);
  memEvents = [...events];
  saveStored(STORAGE_KEYS.EVENTS, memEvents);
  return newEvent;
}

export function updateDemoEvent(id: string, data: any): any {
  const events = getDemoEvents();
  const idx = events.findIndex((e) => e.id === id);
  if (idx !== -1) {
    events[idx] = { ...events[idx], ...data };
    memEvents = [...events];
    saveStored(STORAGE_KEYS.EVENTS, memEvents);
    return events[idx];
  }
  return { id, ...data };
}

export function deleteDemoEvent(id: string): { status: string; id: string } {
  let events = getDemoEvents();
  events = events.filter((e) => e.id !== id);
  memEvents = events;
  saveStored(STORAGE_KEYS.EVENTS, memEvents);
  return { status: "success", id };
}

export function detectDemoConflicts(data: { start_time: string; end_time: string; exclude_id?: string }): any[] {
  const events = getDemoEvents();
  const reqStart = new Date(data.start_time).getTime();
  const reqEnd = new Date(data.end_time).getTime();

  return events.filter((e) => {
    if (data.exclude_id && e.id === data.exclude_id) return false;
    const eStart = new Date(e.start_time).getTime();
    const eEnd = new Date(e.end_time).getTime();
    return Math.max(reqStart, eStart) < Math.min(reqEnd, eEnd);
  });
}

export function exportDemoIcsFile(): void {
  if (typeof window === "undefined") return;

  const events = getDemoEvents();

  const pad = (n: number) => String(n).padStart(2, "0");
  const toIcsDate = (isoStr: string) => {
    const d = new Date(isoStr);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Life-Ops//Demo Standalone Calendar//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
  ];

  events.forEach((ev) => {
    lines.push("BEGIN:VEVENT");
    lines.push(`UID:${ev.id}@lifeops.demo`);
    lines.push(`DTSTAMP:${toIcsDate(new Date().toISOString())}`);
    lines.push(`DTSTART:${toIcsDate(ev.start_time)}`);
    lines.push(`DTEND:${toIcsDate(ev.end_time)}`);
    lines.push(`SUMMARY:${ev.summary || "Untitled Event"}`);
    if (ev.location) lines.push(`LOCATION:${ev.location}`);
    if (ev.description) lines.push(`DESCRIPTION:${ev.description.replace(/\n/g, "\\n")}`);
    lines.push("END:VEVENT");
  });

  lines.push("END:VCALENDAR");

  const icsBlob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const downloadUrl = URL.createObjectURL(icsBlob);
  const a = document.createElement("a");
  a.href = downloadUrl;
  a.download = "life_ops_schedule_demo.ics";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(downloadUrl);
}

export function importDemoIcs(calendarName = "Imported Schedule"): {
  status: string;
  imported_count: number;
  calendar_id: string;
  calendar_name: string;
  feed: any;
} {
  const calId = `upload:${calendarName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "imported"}`;
  const now = new Date();
  const sampleStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 11, 0, 0);
  const sampleEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
  createDemoEvent({
    summary: `${calendarName}: Synced Event`,
    start_time: sampleStart.toISOString(),
    end_time: sampleEnd.toISOString(),
    calendar_id: calId,
    calendar_name: calendarName,
    color: "#38bdf8",
    source: "external",
  });

  const feeds = getDemoCalendarFeeds();
  const existingIdx = feeds.findIndex((f) => f.calendar_id === calId && f.provider === "ics_file");
  const feed = {
    id: existingIdx >= 0 ? feeds[existingIdx].id : `feed-upload-${Date.now()}`,
    name: calendarName,
    provider: "ics_file",
    feed_url: "",
    calendar_id: calId,
    color: "#38bdf8",
    sync_enabled: false,
    last_synced_at: new Date().toISOString(),
    last_event_count: 1,
    last_error: null,
  };
  if (existingIdx >= 0) {
    feeds[existingIdx] = feed;
  } else {
    feeds.push(feed);
  }
  memFeeds = feeds;
  saveStored(STORAGE_KEYS.FEEDS, feeds);
  return { status: "success", imported_count: 1, calendar_id: calId, calendar_name: calendarName, feed };
}

export function getDemoCalendars(): Array<{
  calendar_id: string;
  calendar_name: string;
  color: string;
  source?: string;
  event_count: number;
  feed_id?: string | null;
  provider?: string | null;
}> {
  const events = getDemoEvents();
  const feeds = getDemoCalendarFeeds();
  const byCal = new Map<
    string,
    {
      calendar_id: string;
      calendar_name: string;
      color: string;
      source?: string;
      event_count: number;
      feed_id?: string | null;
      provider?: string | null;
    }
  >();

  for (const ev of events) {
    const calId = ev.calendar_id || ev.calendar_name || "primary";
    const existing = byCal.get(calId);
    if (existing) {
      existing.event_count += 1;
    } else {
      const feed = feeds.find((f) => f.calendar_id === calId);
      byCal.set(calId, {
        calendar_id: calId,
        calendar_name: feed?.name || ev.calendar_name || calId,
        color: feed?.color || ev.color || "#38bdf8",
        source: ev.source,
        event_count: 1,
        feed_id: feed?.id || null,
        provider: feed?.provider || null,
      });
    }
  }

  for (const feed of feeds) {
    if (!byCal.has(feed.calendar_id)) {
      byCal.set(feed.calendar_id, {
        calendar_id: feed.calendar_id,
        calendar_name: feed.name,
        color: feed.color || "#38bdf8",
        source: "external",
        event_count: 0,
        feed_id: feed.id,
        provider: feed.provider,
      });
    }
  }

  return Array.from(byCal.values());
}

export function deleteDemoCalendar(calendarId: string): {
  status: string;
  calendar_id: string;
  events_deleted: number;
  feeds_deleted: number;
} {
  const events = getDemoEvents();
  const remaining = events.filter((e) => (e.calendar_id || e.calendar_name || "primary") !== calendarId);
  const eventsDeleted = events.length - remaining.length;
  memEvents = remaining;
  saveStored(STORAGE_KEYS.EVENTS, remaining);

  const feeds = getDemoCalendarFeeds();
  const remainingFeeds = feeds.filter((f) => f.calendar_id !== calendarId);
  const feedsDeleted = feeds.length - remainingFeeds.length;
  memFeeds = remainingFeeds;
  saveStored(STORAGE_KEYS.FEEDS, remainingFeeds);

  return {
    status: "success",
    calendar_id: calendarId,
    events_deleted: eventsDeleted,
    feeds_deleted: feedsDeleted,
  };
}

/* -------------------------------------------------------------------------- */
/*                               CANVAS & ACADEMICS                           */
/* -------------------------------------------------------------------------- */

export function getDemoAssignments(status = "active", course?: string): any[] {
  if (!memAssignments) {
    memAssignments = loadStored(STORAGE_KEYS.ASSIGNMENTS, generateDemoAssignments);
  }
  let list = memAssignments;
  if (course && course !== "All") {
    list = list.filter((a) => (a.course_id || "").toLowerCase() === course.toLowerCase());
  }
  if (status === "active") {
    list = list.filter((a) => !a.is_submitted);
  }
  return list;
}

export function toggleDemoAssignmentSubmission(id: string): any {
  if (!memAssignments) {
    memAssignments = loadStored(STORAGE_KEYS.ASSIGNMENTS, generateDemoAssignments);
  }
  const assignment = memAssignments.find((a) => a.id === id);
  if (assignment) {
    assignment.is_submitted = !assignment.is_submitted;
    assignment.submission_status = assignment.is_submitted ? "submitted" : "pending";
    if (assignment.is_submitted && !assignment.grade) {
      assignment.grade = assignment.points_possible;
    }
    saveStored(STORAGE_KEYS.ASSIGNMENTS, memAssignments);
    return assignment;
  }
  return { id, is_submitted: true, submission_status: "submitted" };
}

/* -------------------------------------------------------------------------- */
/*                                AUTOPILOT                                   */
/* -------------------------------------------------------------------------- */

export function getDemoAutopilotLogs(): any[] {
  if (!memAutopilotLogs) {
    memAutopilotLogs = loadStored(STORAGE_KEYS.AUTOPILOT_LOGS, generateDemoAutopilotLogs);
  }
  return memAutopilotLogs;
}

export function undoDemoAutopilotAction(logId: string): any {
  const logs = getDemoAutopilotLogs();
  const log = logs.find((l) => l.id === logId);
  if (log) {
    log.is_undone = true;
    saveStored(STORAGE_KEYS.AUTOPILOT_LOGS, logs);

    // Rollback event if event_id is present
    if (log.rollback_payload?.event_id) {
      const events = getDemoEvents();
      const ev = events.find((e) => e.id === log.rollback_payload.event_id);
      if (ev) {
        ev.start_time = log.rollback_payload.original_start;
        ev.end_time = log.rollback_payload.original_end;
        saveStored(STORAGE_KEYS.EVENTS, events);
      }
    }
    return { status: "success", message: `Rolled back action: ${log.summary}` };
  }
  return { status: "success", message: "Action reverted." };
}

export function getDemoPendingActions(): any[] {
  if (!memPendingActions) {
    memPendingActions = loadStored(STORAGE_KEYS.PENDING_ACTIONS, generateDemoPendingActions);
  }
  return memPendingActions;
}

export function approveDemoAction(id: string): any {
  let pending = getDemoPendingActions();
  const action = pending.find((a) => a.id === id);
  if (action?.diff_preview?.event_id) {
    // Apply the proposed start/end to calendar event
    const events = getDemoEvents();
    const ev = events.find((e) => e.id === action.diff_preview.event_id);
    if (ev) {
      ev.start_time = action.diff_preview.new_start;
      ev.end_time = action.diff_preview.new_end;
      saveStored(STORAGE_KEYS.EVENTS, events);
    }
  }

  // Remove from pending
  pending = pending.filter((a) => a.id !== id);
  memPendingActions = pending;
  saveStored(STORAGE_KEYS.PENDING_ACTIONS, pending);

  // Add an autopilot log entry
  const logs = getDemoAutopilotLogs();
  logs.unshift({
    id: `log-demo-approved-${Date.now()}`,
    action_type: "manual_approval",
    summary: `Approved: ${action?.summary || "Schedule Adjustment"}`,
    details: "User approved the proposed diff. Calendar schedule updated.",
    created_at: new Date().toISOString(),
    is_undone: false,
  });
  saveStored(STORAGE_KEYS.AUTOPILOT_LOGS, logs);

  return { status: "success", approved_id: id };
}

export function rejectDemoAction(id: string): any {
  let pending = getDemoPendingActions();
  pending = pending.filter((a) => a.id !== id);
  memPendingActions = pending;
  saveStored(STORAGE_KEYS.PENDING_ACTIONS, pending);
  return { status: "success", rejected_id: id };
}

/* -------------------------------------------------------------------------- */
/*                               DAILY BRIEFING                               */
/* -------------------------------------------------------------------------- */

export function getDemoDailyBrief(): any {
  return generateDemoDailyBrief();
}

export function getRandomDemoCuriosity(): any {
  const idx = Math.floor(Math.random() * DEMO_CURIOSITIES.length);
  return DEMO_CURIOSITIES[idx];
}

export function adoptDemoDailyPlan(planId: string): any {
  const events = getDemoEvents();
  const newBlock = {
    id: `demo-plan-block-${Date.now()}`,
    summary: "Deep Focus Protocol: High-Priority Deliverables",
    calendar_name: "Life-Ops Autopilot",
    start_time: getRelativeDateTime(0, 16, 0),
    end_time: getRelativeDateTime(0, 18, 30),
    location: "Library Quiet Floor",
    description: "Scheduled via Daily Briefing Plan adoption.",
    color: "#d97706",
    source: "life_ops_study_block",
  };
  events.push(newBlock);
  memEvents = [...events];
  saveStored(STORAGE_KEYS.EVENTS, memEvents);

  return {
    status: "success",
    plan_id: planId,
    plan_name: "Deep Focus Protocol",
    events_created: 1,
    message: "Adopted Deep Focus Protocol. 2.5h study block added to calendar.",
  };
}

/* -------------------------------------------------------------------------- */
/*                               HEALTH & NUTRITION                           */
/* -------------------------------------------------------------------------- */

function normalizeDailyLog(log: any) {
  if (!log) return log;
  const logs = log.logs || log.meals || [];
  let tot_cals = 0;
  let tot_prot = 0;
  let tot_carbs = 0;
  let tot_fat = 0;
  let tot_cost = 0;

  for (const m of logs) {
    tot_cals += Number(m.calories || 0);
    tot_prot += Number(m.protein_g || 0);
    tot_carbs += Number(m.carbs_g || 0);
    tot_fat += Number(m.fat_g || 0);
    tot_cost += Number(m.cost_estimate_cents || 0);
  }

  // Fallback to top-level numbers if logs array was empty but numbers were set
  if (tot_cals === 0 && (log.total_calories || log.calories)) {
    tot_cals = Number(log.total_calories || log.calories || 0);
  }
  if (tot_prot === 0 && (log.total_protein_g || log.protein_g)) {
    tot_prot = Number(log.total_protein_g || log.protein_g || 0);
  }
  if (tot_carbs === 0 && (log.total_carbs_g || log.carbs_g)) {
    tot_carbs = Number(log.total_carbs_g || log.carbs_g || 0);
  }
  if (tot_fat === 0 && (log.total_fat_g || log.fat_g)) {
    tot_fat = Number(log.total_fat_g || log.fat_g || 0);
  }

  const target_cals = Number(log.target_calories || 2600);
  const target_prot = Number(log.target_protein_g || 155);
  const target_carbs = Number(log.target_carbs_g || 320);
  const target_fat = Number(log.target_fat_g || 75);

  log.target_calories = target_cals;
  log.target_protein_g = target_prot;
  log.target_carbs_g = target_carbs;
  log.target_fat_g = target_fat;

  log.total_calories = tot_cals;
  log.total_protein_g = Math.round(tot_prot * 10) / 10;
  log.total_carbs_g = Math.round(tot_carbs * 10) / 10;
  log.total_fat_g = Math.round(tot_fat * 10) / 10;
  log.total_cost_cents = tot_cost;
  log.total_cost_usd = `$${(tot_cost / 100).toFixed(2)}`;
  log.pct_calories = Math.min(100, Math.round((tot_cals / target_cals) * 100));
  log.pct_protein = Math.min(100, Math.round((tot_prot / target_prot) * 100));

  log.logs = logs;
  log.meals = logs;
  log.calories = tot_cals;
  log.protein_g = log.total_protein_g;
  log.carbs_g = log.total_carbs_g;
  log.fat_g = log.total_fat_g;
  return log;
}

function getHealthState(): any {
  if (!memHealthData) {
    memHealthData = loadStored(STORAGE_KEYS.HEALTH_LOG, generateDemoHealthData);
  }
  if (memHealthData?.dailyLog) {
    normalizeDailyLog(memHealthData.dailyLog);
  }
  return memHealthData;
}

export function getDemoMeals(): any[] {
  return getHealthState().recipes;
}

export function getDemoWeeklyBudget(): any {
  return getHealthState().budget;
}

export function getDemoDailyMacroLog(): any {
  const state = getHealthState();
  return normalizeDailyLog(state.dailyLog);
}

export function logDemoMeal(data: {
  meal_name: string;
  calories: number;
  protein_g: number;
  carbs_g?: number;
  fat_g?: number;
  cost_estimate_cents?: number;
  meal_type?: string;
  date?: string;
}): any {
  const state = getHealthState();
  const logs = state.dailyLog.logs || state.dailyLog.meals || [];
  const newMeal = {
    id: `meal-${Date.now()}`,
    logged_date: data.date || new Date().toISOString().split("T")[0],
    meal_name: data.meal_name,
    meal_type: data.meal_type || "lunch",
    calories: Number(data.calories || 0),
    protein_g: Number(data.protein_g || 0),
    carbs_g: Number(data.carbs_g || 0),
    fat_g: Number(data.fat_g || 0),
    cost_estimate_cents: Number(data.cost_estimate_cents || 0),
    cost_estimate_usd: `$${(Number(data.cost_estimate_cents || 0) / 100).toFixed(2)}`,
    created_at: new Date().toISOString(),
  };
  logs.push(newMeal);
  state.dailyLog.logs = logs;
  state.dailyLog.meals = logs;
  normalizeDailyLog(state.dailyLog);

  saveStored(STORAGE_KEYS.HEALTH_LOG, state);
  return { ...newMeal, message: "Meal logged successfully", log_id: newMeal.id, summary: state.dailyLog };
}

export function deleteDemoLoggedMeal(logId: string): any {
  const state = getHealthState();
  let logs = state.dailyLog.logs || state.dailyLog.meals || [];
  const foundMeal = logs.find((m: any) => m.id === logId);
  logs = logs.filter((m: any) => m.id !== logId);
  state.dailyLog.logs = logs;
  state.dailyLog.meals = logs;
  normalizeDailyLog(state.dailyLog);

  saveStored(STORAGE_KEYS.HEALTH_LOG, state);
  return { status: "success", message: "Meal log removed", deleted_id: logId, summary: state.dailyLog, ...foundMeal };
}

export function resetDemoDailyLog(): any {
  const state = getHealthState();
  state.dailyLog.logs = [];
  state.dailyLog.meals = [];
  normalizeDailyLog(state.dailyLog);

  saveStored(STORAGE_KEYS.HEALTH_LOG, state);
  return { message: "Daily log reset", summary: state.dailyLog };
}

export function searchDemoIngredients(q?: string, category?: string): any[] {
  const state = getHealthState();
  let list = state.groceryPrices || [];
  if (q) {
    const query = q.toLowerCase();
    list = list.filter((item: any) => item.name.toLowerCase().includes(query));
  }
  if (category && category !== "all") {
    list = list.filter((item: any) => item.category === category);
  }
  return list;
}

export function getDemoGroceryPrices(): any[] {
  return getHealthState().groceryPrices;
}

export function getDemoMacroHistory(): any {
  return getHealthState().macroHistory;
}

export function createDemoRecipe(data: any): any {
  const state = getHealthState();
  const newRecipe = {
    id: `recipe-${Date.now()}`,
    ...data,
  };
  state.recipes.push(newRecipe);
  saveStored(STORAGE_KEYS.HEALTH_LOG, state);
  return { message: `Recipe '${newRecipe.name}' created`, recipe: newRecipe };
}

export function deleteDemoRecipe(recipeId: string): any {
  const state = getHealthState();
  state.recipes = (state.recipes || []).filter((r: any) => r.id !== recipeId);
  saveStored(STORAGE_KEYS.HEALTH_LOG, state);
  return { status: "deleted", id: recipeId };
}

export function logDemoRecipe(recipeId: string): any {
  const state = getHealthState();
  const recipe = state.recipes.find((r: any) => r.id === recipeId);
  if (recipe) {
    return logDemoMeal({
      meal_name: recipe.name,
      calories: recipe.calories,
      protein_g: recipe.protein_g,
      carbs_g: recipe.carbs_g,
      fat_g: recipe.fat_g,
      cost_estimate_cents: recipe.cost_estimate_cents,
      meal_type: recipe.meal_type,
    });
  }
  return { status: "not_found" };
}

/* -------------------------------------------------------------------------- */
/*                            USER KNOWLEDGE BASE                             */
/* -------------------------------------------------------------------------- */

export function getDemoUserKnowledge(category?: string): any[] {
  if (!memKnowledge) {
    memKnowledge = loadStored(STORAGE_KEYS.KNOWLEDGE, generateDemoKnowledge);
  }
  if (category) {
    return memKnowledge.filter((k) => k.category === category);
  }
  return memKnowledge;
}

export function createDemoUserKnowledge(item: { category: string; title: string; content?: string; metadata?: any }): any {
  const list = getDemoUserKnowledge();
  const newItem = {
    id: `fact-${Date.now()}`,
    ...item,
  };
  list.push(newItem);
  memKnowledge = [...list];
  saveStored(STORAGE_KEYS.KNOWLEDGE, memKnowledge);
  return { status: "success", item: newItem };
}

export function updateDemoUserKnowledge(itemId: string, data: any): any {
  const list = getDemoUserKnowledge();
  const idx = list.findIndex((k) => k.id === itemId);
  if (idx !== -1) {
    list[idx] = { ...list[idx], ...data };
    memKnowledge = [...list];
    saveStored(STORAGE_KEYS.KNOWLEDGE, memKnowledge);
    return { status: "success", item: list[idx] };
  }
  return { status: "not_found" };
}

export function deleteDemoUserKnowledge(itemId: string): any {
  let list = getDemoUserKnowledge();
  list = list.filter((k) => k.id !== itemId);
  memKnowledge = list;
  saveStored(STORAGE_KEYS.KNOWLEDGE, memKnowledge);
  return { status: "success", message: "Deleted" };
}

/* -------------------------------------------------------------------------- */
/*                         DIRECT LINE ASSISTANT AI                           */
/* -------------------------------------------------------------------------- */

const DEMO_SESSIONS_KEY = "lifeops_demo_assistant_sessions";

function loadDemoSessions(): any[] {
  return loadStored(DEMO_SESSIONS_KEY, () => []);
}

function saveDemoSessions(sessions: any[]): void {
  saveStored(DEMO_SESSIONS_KEY, sessions);
}

function stripDemoMarkdown(raw: string): string {
  return (raw || "")
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*[-*•]\s+/gm, "")
    .replace(/\*\*/g, "")
    .replace(/__/g, "")
    .replace(/`/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function getDemoAssistantSessions(): any[] {
  return loadDemoSessions().map((s) => {
    const rawPreview = stripDemoMarkdown((s.messages || []).slice(-1)[0]?.content || "");
    return {
      id: s.id,
      title: s.title,
      message_count: (s.messages || []).length,
      preview: rawPreview.slice(0, 110) + (rawPreview.length > 110 ? "..." : ""),
      created_at: s.created_at,
      updated_at: s.updated_at,
    };
  });
}

export function createDemoAssistantSession(title?: string): any {
  const sessions = loadDemoSessions();
  const nowIso = new Date().toISOString();
  const sess = {
    id: `demo-sess-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title: title?.trim() || "New Conversation",
    created_at: nowIso,
    updated_at: nowIso,
    messages: [],
  };
  saveDemoSessions([sess, ...sessions]);
  return { ...sess, message_count: 0, preview: "" };
}

export function getDemoAssistantSession(sessionId: string): any {
  const sessions = loadDemoSessions();
  return sessions.find((s) => s.id === sessionId) || { id: sessionId, title: "Conversation", messages: [] };
}

export function renameDemoAssistantSession(sessionId: string, title: string): any {
  const sessions = loadDemoSessions();
  const next = sessions.map((s) => (s.id === sessionId ? { ...s, title: title.trim() || s.title } : s));
  saveDemoSessions(next);
  const target = next.find((s) => s.id === sessionId);
  return { status: "success", session: target };
}

export function deleteDemoAssistantSession(sessionId: string): any {
  const sessions = loadDemoSessions().filter((s) => s.id !== sessionId);
  saveDemoSessions(sessions);
  return { status: "deleted", id: sessionId };
}

export function simulateDirectLineMessage(message: string, sessionId?: string): any {
  const sessions = loadDemoSessions();
  let targetSess = sessionId ? sessions.find((s) => s.id === sessionId) : null;
  if (!targetSess) {
    targetSess = {
      id: `demo-sess-${Date.now()}`,
      title: message.trim().slice(0, 48) || "Conversation",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      messages: [],
    };
    sessions.unshift(targetSess);
  } else if (targetSess.title === "New Conversation") {
    targetSess.title = message.trim().slice(0, 48) || "Conversation";
  }

  const lower = message.toLowerCase();
  let responseObj: any;

  // 1. Time Blocking / Focus Request
  if (lower.includes("block") || lower.includes("focus session") || lower.includes("study session")) {
    const proposed = {
      summary: "CS 3114 Focus Session: B-Tree Buffer Pool",
      date: new Date().toISOString().split("T")[0],
      start_time: getRelativeDateTime(1, 15, 0),
      end_time: getRelativeDateTime(1, 17, 30),
      formatted_time: "Tomorrow, 3:00 PM – 5:30 PM",
      location: "Library 3rd Floor Quiet Zone",
      description: "Dedicated block for B+ tree latch crabbing and buffer pool eviction logic.",
      color: "#d97706",
      source: "life_ops_study_block",
    };

    responseObj = {
      status: "success",
      action: "propose_event",
      message: `I've prepared a **2.5-hour focus block** for **CS 3114 B-Tree implementation** tomorrow from **3:00 PM to 5:30 PM**. Review the proposed event below to commit it to your schedule.`,
      proposed_event: proposed,
    };
  } else if (lower.includes("remember") || lower.includes("note") || lower.includes("prefer")) {
    const fact = {
      category: "preferences",
      title: "User Preference Saved",
      content: message.replace(/^remember (that )?/i, "").trim(),
    };
    createDemoUserKnowledge(fact);

    responseObj = {
      status: "success",
      action: "save_fact",
      message: `Noted and saved to your Life-Ops Knowledge Base:\n> "${fact.content}"\n\nAutopilot and Daily Briefing will respect this guideline during schedule and habit recommendations.`,
      saved_facts: [fact],
    };
  } else if (lower.includes("macro") || lower.includes("protein") || lower.includes("eat") || lower.includes("dinner") || lower.includes("food")) {
    const health = getHealthState();
    const logged = health.dailyLog.protein_g;
    const target = health.dailyLog.target_protein_g;
    const remaining = Math.max(0, target - logged);

    responseObj = {
      status: "success",
      action: "nutrition_status",
      message: `You have logged **${logged}g of protein** so far today against your **${target}g target** (**${remaining}g remaining**).\n\nRecommendation for dinner: **Chipotle Grilled Chicken Bowl** or **Pan-Seared Salmon** to close out the remaining protein target without exceeding your caloric budget.`,
    };
  } else if (lower.includes("due") || lower.includes("assignment") || lower.includes("deadline") || lower.includes("project")) {
    const assigns = getDemoAssignments("active");
    const top = assigns.slice(0, 3);

    responseObj = {
      status: "success",
      action: "deadline_lookup",
      message: `Here are your immediate active deliverables:\n\n* **[CS 2506]** Lab 7 — Cache Simulator (due tomorrow)\n* **[CS 3114]** Project 3 — Disk-Backed B+ Tree (due in 3 days, 150 pts)\n* **[MATH 3134]** Problem Set 8 — Generating Functions (due in 5 days)`,
      mentioned_assignments: top,
    };
  } else if (lower.includes("next class") || lower.includes("class") || lower.includes("schedule") || lower.includes("today")) {
    const events = getDemoEvents();
    const nowMs = Date.now();
    const upcoming = events
      .filter((e) => new Date(e.start_time).getTime() > nowMs)
      .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime())[0];

    const upcomingTitle = upcoming ? `**${upcoming.summary}** at **${new Date(upcoming.start_time).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}** (${upcoming.location || "Campus"})` : "No further classes scheduled for today.";

    responseObj = {
      status: "success",
      action: "schedule_lookup",
      message: `Your upcoming session today is ${upcomingTitle}.\n\nYou have **3 scheduled commitments** and **1 deep focus study block** reserved for this afternoon.`,
      mentioned_events: upcoming ? [upcoming] : [],
    };
  } else {
    responseObj = {
      status: "success",
      action: "general_chat",
      message: `I'm monitoring your academic deadlines, schedule shifts, and daily macro targets. Feel free to ask about upcoming deadlines, request a study block, or check your nutrition progress.`,
    };
  }

  targetSess.updated_at = new Date().toISOString();
  targetSess.messages.push(
    { id: `u-${Date.now()}`, role: "user", content: message, payload: {}, created_at: targetSess.updated_at },
    { id: `a-${Date.now() + 1}`, role: "assistant", content: responseObj.message, payload: responseObj, created_at: targetSess.updated_at }
  );
  saveDemoSessions([targetSess, ...sessions.filter((s) => s.id !== targetSess.id)]);

  return {
    ...responseObj,
    session_id: targetSess.id,
    session_title: targetSess.title,
  };
}

/* -------------------------------------------------------------------------- */
/*                               AI COMMAND BAR                               */
/* -------------------------------------------------------------------------- */

export function simulateAiQuery(data: { query: string; exam_mode?: boolean }): any {
  const q = data.query.toLowerCase();

  if (q.includes("assignment") || q.includes("due") || q.includes("hw") || q.includes("project")) {
    return {
      response: `### Upcoming Deliverables\n\n* [CS 2506] Lab 7 — Multi-Level Cache Simulator\n  * **Due:** Tomorrow at 23:59\n  * **Weight:** 50 points\n\n* [CS 3114] Project 3 — Disk-Backed B+ Tree Storage Engine\n  * **Due:** In 3 days at 23:59\n  * **Weight:** 150 points (High Priority)\n\n* [MATH 3134] Problem Set 8 — Generating Functions\n  * **Due:** In 5 days at 17:00`,
      routed_to: "local_cache",
      model: "gemini-2.5-flash (demo-mode)",
      latency_ms: 110,
      exam_mode: !!data.exam_mode,
    };
  }

  if (q.includes("schedule") || q.includes("class") || q.includes("today")) {
    return {
      response: `### Today's Schedule Overview\n\n* **09:00 AM – 10:15 AM:** CS 3114 Lecture (Science Hall 102)\n* **11:00 AM – 12:15 PM:** MATH 3134 Lecture (Engineering 210)\n* **02:00 PM – 03:00 PM:** LeetCode Practice (Sliding Window)\n* **04:30 PM – 06:30 PM:** CS 3114 Study Block (North Commons)\n* **07:00 PM – 08:15 PM:** Evening Gym Conditioning`,
      routed_to: "local_cache",
      model: "gemini-2.5-flash (demo-mode)",
      latency_ms: 95,
      exam_mode: !!data.exam_mode,
    };
  }

  return {
    response: `Life-Ops Assistant is active in standalone demo mode. You have **4 upcoming deliverables** and all systems are running with zero external network dependencies.`,
    routed_to: "local_cache",
    model: "gemini-2.5-flash (demo-mode)",
    latency_ms: 85,
    exam_mode: !!data.exam_mode,
  };
}

export function toggleDemoExamMode(enabled: boolean): { status: string; exam_mode: boolean } {
  saveStored(STORAGE_KEYS.EXAM_MODE, enabled);
  return { status: "success", exam_mode: enabled };
}

/* -------------------------------------------------------------------------- */
/*                     PROFILE, ONBOARDING & CALENDAR FEEDS                   */
/* -------------------------------------------------------------------------- */

function getDefaultDemoProfile() {
  return {
    id: "default",
    full_name: "Alex Chen",
    first_name: "Alex",
    institution: "Tech Institute",
    term_label: "Fall 2026 Ops",
    major_or_role: "B.S. Computer Science & Systems Engineering",
    majors: ["Computer Science", "Systems Engineering"],
    minors: ["Mathematics"],
    academic_year: "Junior",
    expected_graduation: "May 2027",
    career_role: "Software Engineering Intern",
    city: "Boston",
    region: "MA",
    timezone: "America/New_York",
    latitude: 42.3601,
    longitude: -71.0589,
    grocery_radius_miles: 5,
    wake_time: "08:30",
    sleep_time: "23:30",
    study_sanctuary: "The Daily Grind Cafe & Roastery",
    canvas_base_url: "https://canvas.instructure.com",
    canvas_ics_url: "https://canvas.instructure.com/feeds/calendars/demo_feed.ics",
    daily_calories_target: 2600,
    daily_protein_g: 155,
    daily_carbs_g: 320,
    daily_fats_g: 75,
    dietary_notes: "High-protein lean bulk · No beef · Rare pork",
    onboarding_completed: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

function getDefaultDemoFeeds(): any[] {
  return [
    {
      id: "demo-feed-canvas",
      name: "Canvas LMS Assignments",
      provider: "canvas",
      feed_url: "https://canvas.instructure.com/feeds/calendars/demo_feed.ics",
      calendar_id: "academics",
      color: "#0284c7",
      sync_enabled: true,
      last_synced_at: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
      last_event_count: 7,
      last_error: null,
    },
    {
      id: "demo-feed-google",
      name: "Personal & Career",
      provider: "google",
      feed_url: "https://calendar.google.com/calendar/ical/demo_alex_chen/private-demo/basic.ics",
      calendar_id: "primary",
      color: "#d97706",
      sync_enabled: true,
      last_synced_at: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
      last_event_count: 14,
      last_error: null,
    },
  ];
}

function loadDemoProfileRecord() {
  if (!memProfile) {
    memProfile = loadStored(STORAGE_KEYS.PROFILE, getDefaultDemoProfile);
  }
  return memProfile;
}

export function getDemoCalendarFeeds(): any[] {
  if (!memFeeds) {
    memFeeds = loadStored(STORAGE_KEYS.FEEDS, getDefaultDemoFeeds);
  }
  return memFeeds;
}

function buildDemoSetupStatus(profile: any) {
  const feeds = getDemoCalendarFeeds();
  const activeAssignments = getDemoAssignments("active");
  const events = getDemoEvents();
  return {
    profile_configured: Boolean(profile.full_name?.trim()),
    canvas_configured: Boolean(profile.canvas_ics_url?.trim() || profile.canvas_base_url?.trim()),
    calendar_feeds_count: feeds.length,
    google_oauth_configured: memGoogleCredsUploaded,
    active_assignments_count: activeAssignments.length,
    calendar_events_count: events.length,
    onboarding_completed: Boolean(profile.onboarding_completed),
  };
}

export function getDemoUserProfile(): any {
  const profile = loadDemoProfileRecord();
  return {
    profile,
    setup_status: buildDemoSetupStatus(profile),
  };
}

export function updateDemoUserProfile(data: Record<string, any>): any {
  const current = loadDemoProfileRecord();
  const nextFullName =
    typeof data.full_name === "string" ? data.full_name : current.full_name;
  const derivedFirstName =
    typeof data.first_name === "string" && data.first_name.trim()
      ? data.first_name.trim()
      : nextFullName.trim().split(/\s+/)[0] || current.first_name || "Alex";

  memProfile = {
    ...current,
    ...data,
    first_name: derivedFirstName,
    updated_at: new Date().toISOString(),
  };
  saveStored(STORAGE_KEYS.PROFILE, memProfile);

  return {
    status: "success",
    profile: memProfile,
    setup_status: buildDemoSetupStatus(memProfile),
  };
}

const DEMO_GEOCODE_CITIES = [
  { name: "Boston", city: "Boston", region: "MA", country: "United States", latitude: 42.3601, longitude: -71.0589, timezone: "America/New_York" },
  { name: "New York", city: "New York", region: "NY", country: "United States", latitude: 40.7128, longitude: -74.006, timezone: "America/New_York" },
  { name: "San Francisco", city: "San Francisco", region: "CA", country: "United States", latitude: 37.7749, longitude: -122.4194, timezone: "America/Los_Angeles" },
  { name: "Seattle", city: "Seattle", region: "WA", country: "United States", latitude: 47.6062, longitude: -122.3321, timezone: "America/Los_Angeles" },
  { name: "Austin", city: "Austin", region: "TX", country: "United States", latitude: 30.2672, longitude: -97.7431, timezone: "America/Chicago" },
  { name: "Chicago", city: "Chicago", region: "IL", country: "United States", latitude: 41.8781, longitude: -87.6298, timezone: "America/Chicago" },
  { name: "Atlanta", city: "Atlanta", region: "GA", country: "United States", latitude: 33.749, longitude: -84.388, timezone: "America/New_York" },
  { name: "Denver", city: "Denver", region: "CO", country: "United States", latitude: 39.7392, longitude: -104.9903, timezone: "America/Denver" },
  { name: "London", city: "London", region: "England", country: "United Kingdom", latitude: 51.5072, longitude: -0.1276, timezone: "Europe/London" },
  { name: "Toronto", city: "Toronto", region: "ON", country: "Canada", latitude: 43.6532, longitude: -79.3832, timezone: "America/Toronto" },
];

export function geocodeDemoLocation(query: string): { results: any[] } {
  const q = (query || "").trim().toLowerCase();
  if (!q) {
    return { results: DEMO_GEOCODE_CITIES.slice(0, 4) };
  }
  const matches = DEMO_GEOCODE_CITIES.filter(
    (c) =>
      c.name.toLowerCase().includes(q) ||
      c.region.toLowerCase().includes(q) ||
      `${c.name}, ${c.region}`.toLowerCase().includes(q)
  );
  if (matches.length > 0) {
    return { results: matches };
  }
  const cleanName = query.split(",")[0].trim() || "Custom City";
  const cleanRegion = query.split(",")[1]?.trim() || "";
  return {
    results: [
      {
        name: cleanName,
        city: cleanName,
        region: cleanRegion,
        country: "Demo Geocode",
        latitude: 42.3601,
        longitude: -71.0589,
        timezone: "America/New_York",
      },
    ],
  };
}

function normalizeFeedUrl(url: string): string {
  const trimmed = (url || "").trim();
  if (trimmed.toLowerCase().startsWith("webcal://")) {
    return `https://${trimmed.slice("webcal://".length)}`;
  }
  return trimmed;
}

export function addDemoCalendarFeed(data: {
  name: string;
  provider: string;
  feed_url: string;
  calendar_id?: string;
  color?: string;
}): any {
  const feeds = getDemoCalendarFeeds();
  const normalizedUrl = normalizeFeedUrl(data.feed_url);
  const newFeed = {
    id: `demo-feed-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
    name: data.name?.trim() || `${data.provider} Calendar`,
    provider: data.provider || "ics_url",
    feed_url: normalizedUrl,
    calendar_id: data.calendar_id || "external",
    color: data.color || "#38bdf8",
    sync_enabled: true,
    last_synced_at: new Date().toISOString(),
    last_event_count: 6,
    last_error: null,
  };
  memFeeds = [...feeds, newFeed];
  saveStored(STORAGE_KEYS.FEEDS, memFeeds);
  return {
    status: "success",
    feed: newFeed,
    ...newFeed,
    synced_count: newFeed.last_event_count,
  };
}

export function syncDemoCalendarFeed(id: string): any {
  const feeds = getDemoCalendarFeeds();
  const idx = feeds.findIndex((f) => f.id === id);
  if (idx === -1) {
    return { status: "not_found", message: "Calendar feed not found." };
  }
  const updated = {
    ...feeds[idx],
    last_synced_at: new Date().toISOString(),
    last_event_count: feeds[idx].last_event_count || 6,
    last_error: null,
  };
  memFeeds = feeds.map((f, i) => (i === idx ? updated : f));
  saveStored(STORAGE_KEYS.FEEDS, memFeeds);
  return {
    status: "success",
    feed: updated,
    events_synced: updated.last_event_count,
    synced_count: updated.last_event_count,
    message: `Synced ${updated.last_event_count} events from ${updated.name}.`,
  };
}

export function syncAllDemoCalendarFeeds(): any {
  const feeds = getDemoCalendarFeeds();
  const now = new Date().toISOString();
  let totalEvents = 0;
  memFeeds = feeds.map((f) => {
    const count = f.last_event_count || 6;
    totalEvents += count;
    return { ...f, last_synced_at: now, last_event_count: count, last_error: null };
  });
  saveStored(STORAGE_KEYS.FEEDS, memFeeds);
  return {
    status: "success",
    synced_feeds: memFeeds.length,
    total_events: totalEvents,
    message: `Synced ${memFeeds.length} calendar feeds (${totalEvents} events).`,
  };
}

export function deleteDemoCalendarFeed(id: string): any {
  const feeds = getDemoCalendarFeeds();
  memFeeds = feeds.filter((f) => f.id !== id);
  saveStored(STORAGE_KEYS.FEEDS, memFeeds);
  return { status: "success", id };
}

export function uploadDemoGoogleCredentials(): any {
  memGoogleCredsUploaded = true;
  return {
    status: "success",
    google_configured: true,
    message: "Demo mode: Google OAuth credentials accepted locally (no network upload performed).",
  };
}

export function uploadDemoSyllabusDocument(filename = "syllabus.md"): any {
  return {
    status: "success",
    filename,
    chunks_indexed: 12,
    message: `Demo mode: Indexed 12 chunks from "${filename}" into simulated local vector store.`,
  };
}

export function clearDemoSampleData(): any {
  const eventsCount = getDemoEvents().length;
  const assignsCount = getDemoAssignments("all").length;
  memEvents = [];
  memAssignments = [];
  memAutopilotLogs = [];
  memPendingActions = [];
  saveStored(STORAGE_KEYS.EVENTS, memEvents);
  saveStored(STORAGE_KEYS.ASSIGNMENTS, memAssignments);
  saveStored(STORAGE_KEYS.AUTOPILOT_LOGS, memAutopilotLogs);
  saveStored(STORAGE_KEYS.PENDING_ACTIONS, memPendingActions);
  return {
    status: "success",
    cleared_events: eventsCount,
    cleared_assignments: assignsCount,
    message: `Cleared ${eventsCount} sample events and ${assignsCount} sample assignments.`,
  };
}

export function getDemoCalendarSyncStatus(): {
  mode: string;
  google_configured: boolean;
  message: string;
} {
  return {
    mode: memGoogleCredsUploaded ? "google_workspace" : "local_first",
    google_configured: memGoogleCredsUploaded,
    message: memGoogleCredsUploaded
      ? "Demo mode: Simulated Google Workspace connection active."
      : "Operating in standalone local calendar mode.",
  };
}

export function triggerDemoGoogleSync(): any {
  return {
    status: memGoogleCredsUploaded ? "success" : "skipped",
    synced_events: memGoogleCredsUploaded ? 8 : 0,
    message: memGoogleCredsUploaded
      ? "Demo mode: Simulated Google Workspace calendar sync complete."
      : "Google credentials.json not configured; operating in standalone local mode.",
  };
}

export function analyzeDemoAssignment(assignmentId: string, _force = false): any {
  const assignments = getDemoAssignments("all");
  const target = assignments.find((a) => a.id === assignmentId);
  const title = target?.title || "Assignment Task";
  const course = target?.course_name || "Coursework";
  const aiSections = {
    summary: `Complete ${course} deliverable "${title}" following specification constraints and rubric checks.`,
    estimated_effort: "3–5 hours",
    general: target?.description || `Complete core requirements for ${title}.`,
    deliverables: [
      `Primary submission for ${title}`,
      "Verify build/output passes all test checks before upload",
    ],
    rubric: ["Correctness & specification compliance (70%)", "Code/writing clarity & documentation (30%)"],
    resources_and_policies: ["Submit on Canvas prior to the deadline."],
  };
  return {
    status: "success",
    cached: false,
    rate_limited: false,
    key_source: "demo",
    assignment_id: assignmentId,
    ai_summary: aiSections.summary,
    ai_sections: aiSections,
    ai_model: "demo_structured",
    ai_analyzed_at: new Date().toISOString(),
  };
}

export function analyzeDemoAssignmentsBatch(limit = 8): any {
  const assignments = getDemoAssignments("active").slice(0, limit);
  const results = assignments.map((a) => analyzeDemoAssignment(a.id));
  return {
    status: "success",
    analyzed_count: results.length,
    gemini_count: 0,
    local_count: results.length,
    rate_limited: false,
    key_source: "demo",
    remaining_candidates: 0,
    message: `Structured ${results.length} demo assignment task(s).`,
    results,
  };
}

let memDemoDocs: Array<{
  source_type: string;
  source_path: string;
  filename: string;
  chunk_count: number;
  preview: string;
  updated_at: string;
}> = [
  {
    source_type: "resume",
    source_path: "uploads/resume/Alex_Chen_Resume.pdf",
    filename: "Alex_Chen_Resume.pdf",
    chunk_count: 6,
    preview: "B.S. Computer Science & Systems Engineering · Systems, C++, FastAPI, Distributed Storage...",
    updated_at: new Date().toISOString(),
  },
];

export function getDemoIndexedDocuments(sourceType?: string) {
  if (!sourceType) return memDemoDocs;
  return memDemoDocs.filter((d) => d.source_type === sourceType);
}

export function uploadDemoResumeDocument(filename = "resume.pdf") {
  const doc = {
    source_type: "resume",
    source_path: `uploads/resume/${filename}`,
    filename,
    chunk_count: 5,
    preview: `Demo mode: Indexed "${filename}" locally for resume RAG search.`,
    updated_at: new Date().toISOString(),
  };
  memDemoDocs = [doc, ...memDemoDocs.filter((d) => d.source_path !== doc.source_path)];
  return {
    status: "success",
    filename,
    source_type: "resume",
    source_path: doc.source_path,
    chunks_indexed: 5,
    characters_extracted: 1840,
    preview: doc.preview,
  };
}

export function deleteDemoIndexedDocument(sourcePath: string) {
  const before = memDemoDocs.length;
  memDemoDocs = memDemoDocs.filter((d) => d.source_path !== sourcePath);
  return { status: "deleted", source_path: sourcePath, chunks_deleted: before - memDemoDocs.length };
}

export function getDemoNearbyStores(radiusMiles?: number) {
  const prof = loadDemoProfileRecord();
  const radius = Math.max(1, Math.min(25, Number(radiusMiles ?? prof.grocery_radius_miles ?? 5)));
  const allStores = [
    {
      id: "demo-store-1",
      name: "Trader Joe's",
      chain: "Trader Joe's",
      price_tier: "Specialty",
      price_multiplier: 0.98,
      distance_miles: 1.2,
      address: `899 Boylston St, ${prof.city || "Boston"}`,
      opening_hours: "Mo-Su 08:00-21:00",
      latitude: prof.latitude || 42.3601,
      longitude: prof.longitude || -71.0589,
      category: "supermarket",
      maps_url: "https://www.openstreetmap.org",
      source: "Demo Local",
    },
    {
      id: "demo-store-2",
      name: "ALDI",
      chain: "ALDI",
      price_tier: "Budget",
      price_multiplier: 0.84,
      distance_miles: 3.4,
      address: `630 American Legion Hwy, ${prof.city || "Boston"}`,
      opening_hours: "Mo-Su 09:00-20:00",
      latitude: (prof.latitude || 42.3601) + 0.02,
      longitude: (prof.longitude || -71.0589) - 0.02,
      category: "supermarket",
      maps_url: "https://www.openstreetmap.org",
      source: "Demo Local",
    },
    {
      id: "demo-store-3",
      name: "Wegmans",
      chain: "Wegmans",
      price_tier: "Mid-Range",
      price_multiplier: 1.02,
      distance_miles: 7.8,
      address: `200 Boylston St, Chestnut Hill`,
      opening_hours: "Mo-Su 06:00-24:00",
      latitude: (prof.latitude || 42.3601) - 0.03,
      longitude: (prof.longitude || -71.0589) - 0.05,
      category: "supermarket",
      maps_url: "https://www.openstreetmap.org",
      source: "Demo Local",
    },
  ].filter((s) => s.distance_miles <= radius);

  return {
    location_label: [prof.city, prof.region].filter(Boolean).join(", ") || "Boston, MA",
    city: prof.city || "Boston",
    region: prof.region || "MA",
    latitude: prof.latitude ?? 42.3601,
    longitude: prof.longitude ?? -71.0589,
    radius_miles: radius,
    source: "Demo Local",
    store_count: allStores.length,
    stores: allStores,
  };
}
