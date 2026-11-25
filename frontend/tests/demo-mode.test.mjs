/**
 * Standalone Demo Mode Invariant and Behavior Tests
 * Runs with Node.js built-in test runner: `node --test frontend/tests/demo-mode.test.mjs`
 */

import { test, describe, before, beforeEach } from "node:test";
import assert from "node:assert/strict";

// Set environment variable to enable demo mode for testing
process.env.NEXT_PUBLIC_DEMO_MODE = "true";

describe("Demo Mode Invariants & Persona Isolation", async () => {
  const { isDemoMode, IS_DEMO_MODE } = await import("../src/lib/demo-mode.ts");
  const { PERSONA } = await import("../src/lib/persona.ts");
  const {
    assertNoDemoNetworkCall,
    isAllowedStaticAsset,
    isAllowedInternalNextRequest,
  } = await import("../src/lib/demo-guard.ts");
  const demoData = await import("../src/lib/demo-data.ts");
  const demoService = await import("../src/lib/demo-service.ts");

  test("IS_DEMO_MODE and isDemoMode() return true when NEXT_PUBLIC_DEMO_MODE=true", () => {
    assert.equal(IS_DEMO_MODE, true);
    assert.equal(isDemoMode(), true);
  });

  test("Persona profile strictly resolves to fictional persona Alex Chen", () => {
    assert.equal(PERSONA.name, "Alex Chen");
    assert.equal(PERSONA.firstName, "Alex");
    assert.equal(PERSONA.initials, "AC");
    assert.match(PERSONA.careerHeadline, /Alex Chen/);
    assert.match(PERSONA.healthHeadline, /Alex Chen/);
    assert.match(PERSONA.assistantGreeting, /Good morning, Alex/);
    assert.match(PERSONA.appTitle, /Alex Chen/);

    // Verify absolutely no personal names or institutions exist in PERSONA
    const personaString = JSON.stringify(PERSONA);
    assert.doesNotMatch(personaString, /Aarav/i);
    assert.doesNotMatch(personaString, /Dixit/i);
  });

  test("Network guard throws loudly when network request is attempted in demo mode", () => {
    // Prohibited URLs
    assert.throws(() => assertNoDemoNetworkCall("http://localhost:8000/api/canvas/assignments"), {
      message: /\[DEMO MODE GUARD VIOLATION\]/,
    });
    assert.throws(() => assertNoDemoNetworkCall("/api/calendar/events"), {
      message: /\[DEMO MODE GUARD VIOLATION\]/,
    });
    assert.throws(() => assertNoDemoNetworkCall("https://api.external-service.com/data"), {
      message: /\[DEMO MODE GUARD VIOLATION\]/,
    });
  });

  test("Network guard allows static assets and Next.js internal chunks", () => {
    assert.equal(isAllowedStaticAsset("/_next/static/chunks/main.js"), true);
    assert.equal(isAllowedStaticAsset("/favicon.ico"), true);
    assert.equal(isAllowedStaticAsset("/vercel.svg"), true);
    assert.equal(isAllowedStaticAsset("data:image/png;base64,123"), true);
    assert.equal(isAllowedStaticAsset("blob:http://localhost:3000/123"), true);
    assert.equal(isAllowedStaticAsset("http://localhost:3000/brief?_rsc=VBV5fpFAEZI-pstq"), true);
    assert.equal(isAllowedStaticAsset("https://demo.vercel.app/assistant?_rsc=6przR1Gkr1I_E69N"), true);
    assert.equal(isAllowedStaticAsset("http://localhost:8000/api/calendar"), false);

    assert.equal(isAllowedInternalNextRequest("/brief"), true);
    assert.equal(isAllowedInternalNextRequest("/schedule"), true);
    assert.equal(isAllowedInternalNextRequest("/api/calendar/events"), false);
  });

  test("Calendar events are generated dynamically covering classes, study blocks, and workouts", () => {
    const events = demoService.getDemoEvents();
    assert.ok(events.length >= 10, "Expected at least 10 sample calendar events");

    const hasCS3114 = events.some((e) => e.summary.includes("CS 3114"));
    const hasStudyBlock = events.some((e) => e.source === "life_ops_study_block");
    const hasGym = events.some((e) => e.summary.includes("Gym") || e.summary.includes("Conditioning"));

    assert.ok(hasCS3114, "Expected CS 3114 lecture");
    assert.ok(hasStudyBlock, "Expected life_ops_study_block event");
    assert.ok(hasGym, "Expected gym workout event");
  });

  test("Interactive calendar event CRUD works in memory", () => {
    const created = demoService.createDemoEvent({
      summary: "Interview with Tech Recruiter",
      start_time: new Date().toISOString(),
      end_time: new Date(Date.now() + 3600000).toISOString(),
      location: "Virtual",
    });
    assert.ok(created.id);
    assert.equal(created.summary, "Interview with Tech Recruiter");

    const updated = demoService.updateDemoEvent(created.id, { summary: "Updated Recruiter Chat" });
    assert.equal(updated.summary, "Updated Recruiter Chat");

    const deleted = demoService.deleteDemoEvent(created.id);
    assert.equal(deleted.status, "success");
    const eventsAfter = demoService.getDemoEvents();
    assert.ok(!eventsAfter.some((e) => e.id === created.id));
  });

  test("Academic assignments and toggle submission behavior", () => {
    const active = demoService.getDemoAssignments("active");
    assert.ok(active.length > 0);

    const first = active[0];
    const initialStatus = first.is_submitted;
    const toggled = demoService.toggleDemoAssignmentSubmission(first.id);
    assert.equal(toggled.is_submitted, !initialStatus);
  });

  test("Autopilot logs and rollback / undo action", () => {
    const logs = demoService.getDemoAutopilotLogs();
    assert.ok(logs.length > 0);

    const logToUndo = logs[0];
    const undoRes = demoService.undoDemoAutopilotAction(logToUndo.id);
    assert.equal(undoRes.status, "success");
    assert.equal(logToUndo.is_undone, true);
  });

  test("Pending actions approval applies proposed diff to event and creates log", () => {
    const pending = demoService.getDemoPendingActions();
    assert.ok(pending.length > 0);

    const action = pending[0];
    const res = demoService.approveDemoAction(action.id);
    assert.equal(res.status, "success");

    const remainingPending = demoService.getDemoPendingActions();
    assert.ok(!remainingPending.some((p) => p.id === action.id));
  });

  test("Direct line assistant simulates intelligent schedule, deadline, and macro responses", () => {
    const scheduleReply = demoService.simulateDirectLineMessage("What is my next class?");
    assert.equal(scheduleReply.status, "success");
    assert.match(scheduleReply.message, /upcoming session|classes/i);

    const deadlineReply = demoService.simulateDirectLineMessage("What assignments are due soon?");
    assert.equal(deadlineReply.status, "success");
    assert.ok(deadlineReply.mentioned_assignments?.length > 0);

    const macroReply = demoService.simulateDirectLineMessage("What are my macros for today?");
    assert.equal(macroReply.status, "success");
    assert.match(macroReply.message, /protein/i);

    const focusReply = demoService.simulateDirectLineMessage("Schedule a focus block for algorithms tomorrow");
    assert.equal(focusReply.status, "success");
    assert.ok(focusReply.proposed_event);
    assert.equal(focusReply.proposed_event.source, "life_ops_study_block");
  });

  test("Health and nutrition macros logging and resetting", () => {
    const initialLog = demoService.getDemoDailyMacroLog();
    const initialCalories = initialLog.calories;

    const loggedMeal = demoService.logDemoMeal({
      meal_name: "Protein Shake",
      calories: 200,
      protein_g: 30,
      carbs_g: 10,
      fat_g: 2,
    });
    assert.ok(loggedMeal.id);

    const updatedLog = demoService.getDemoDailyMacroLog();
    assert.equal(updatedLog.calories, initialCalories + 200);

    demoService.deleteDemoLoggedMeal(loggedMeal.id);
    const restoredLog = demoService.getDemoDailyMacroLog();
    assert.equal(restoredLog.calories, initialCalories);
  });

  test("RAG semantic search returns syllabus and resume chunks for Alex Chen", () => {
    const syllabusResults = demoData.queryDemoRag("grading policy for CS 3114", 3, "canvas_syllabus");
    assert.ok(syllabusResults.length > 0);
    assert.match(syllabusResults[0].content, /penalty|grade|autograder/i);

    const resumeResults = demoData.queryDemoRag("work experience and technical skills", 3, "resume");
    assert.ok(resumeResults.length > 0);
    assert.match(resumeResults[0].content, /Alex Chen/);
    assert.doesNotMatch(resumeResults[0].content, /Aarav/i);
  });

  test("Weekly budget includes finite weekly_grocery_estimate_usd and macro targets", () => {
    const budget = demoService.getDemoWeeklyBudget();
    assert.equal(typeof budget.weekly_grocery_estimate_usd, "number");
    assert.ok(Number.isFinite(budget.weekly_grocery_estimate_usd));
    assert.ok(budget.weekly_grocery_estimate_usd > 0);
    assert.equal(budget.target_daily_protein_g, 155);
    assert.equal(budget.target_daily_calories, 2600);
    assert.ok(typeof budget.primary_protein === "string" && budget.primary_protein.length > 0);
    assert.equal(budget.benchmark_items_count, 8);
  });

  test("Demo user profile and calendar feeds CRUD work cleanly in memory", () => {
    const initial = demoService.getDemoUserProfile();
    assert.equal(initial.profile.full_name, "Alex Chen");
    assert.equal(initial.profile.onboarding_completed, true);
    assert.ok(initial.setup_status);

    const updated = demoService.updateDemoUserProfile({
      full_name: "Taylor Reed",
      city: "Seattle",
      region: "WA",
      timezone: "America/Los_Angeles",
    });
    assert.equal(updated.profile.full_name, "Taylor Reed");
    assert.equal(updated.profile.first_name, "Taylor");
    assert.equal(demoService.getDemoUserProfile().profile.city, "Seattle");

    const geo = demoService.geocodeDemoLocation("Seattle");
    assert.ok(Array.isArray(geo.results) && geo.results.length > 0);
    assert.equal(geo.results[0].timezone, "America/Los_Angeles");

    const initialFeeds = demoService.getDemoCalendarFeeds();
    assert.ok(Array.isArray(initialFeeds));

    const added = demoService.addDemoCalendarFeed({
      name: "iCloud Personal",
      provider: "apple",
      feed_url: "webcal://p01-calendars.icloud.com/published/2/demo_feed",
      color: "#6366f1",
    });
    assert.equal(added.feed_url, "https://p01-calendars.icloud.com/published/2/demo_feed");
    assert.equal(
      demoService.getDemoCalendarFeeds().some((f) => f.id === added.id),
      true
    );

    const synced = demoService.syncDemoCalendarFeed(added.id);
    assert.equal(synced.status, "success");

    const deleted = demoService.deleteDemoCalendarFeed(added.id);
    assert.equal(deleted.status, "success");
    assert.equal(
      demoService.getDemoCalendarFeeds().some((f) => f.id === added.id),
      false
    );

    // Restore default persona name after mutation
    demoService.updateDemoUserProfile({
      full_name: "Alex Chen",
      first_name: "Alex",
      city: "Campus District",
      region: "",
      timezone: "America/New_York",
    });
  });

  test("All new api.ts profile and calendar-feed functions short-circuit in Demo Mode without throwing guard errors", async () => {
    const api = await import("../src/lib/api.ts");

    const prof = await api.getUserProfile();
    assert.equal(prof.profile.full_name, "Alex Chen");

    const updated = await api.updateUserProfile({ term_label: "Spring 2027 Ops" });
    assert.equal(updated.profile.term_label, "Spring 2027 Ops");

    const geo = await api.geocodeLocation("Boston, MA");
    assert.ok(Array.isArray(geo.results) && geo.results.length > 0);

    const feeds = await api.getCalendarFeeds();
    assert.ok(Array.isArray(feeds));

    const added = await api.addCalendarFeed({
      name: "Demo Outlook",
      provider: "outlook",
      feed_url: "webcal://outlook.office365.com/owa/calendar/demo.ics",
    });
    assert.equal(added.feed_url, "https://outlook.office365.com/owa/calendar/demo.ics");

    const syncedOne = await api.syncCalendarFeed(added.id);
    assert.equal(syncedOne.status, "success");

    const syncedAll = await api.syncAllCalendarFeeds();
    assert.equal(syncedAll.status, "success");

    const deleted = await api.deleteCalendarFeed(added.id);
    assert.equal(deleted.status, "success");

    const fdCreds = new FormData();
    const credsRes = await api.uploadGoogleCredentials(fdCreds);
    assert.equal(credsRes.status, "success");

    const fdSyl = new FormData();
    const sylRes = await api.uploadSyllabusDocument(fdSyl);
    assert.equal(sylRes.status, "success");

    const syncStatus = await api.getCalendarSyncStatus();
    assert.equal(syncStatus.google_configured, true);

    const gSync = await api.triggerGoogleSync();
    assert.equal(gSync.status, "success");

    const cleared = await api.clearSampleData();
    assert.equal(cleared.status, "success");

    const fdIcs = new FormData();
    const imported = await api.importIcsCalendar(fdIcs);
    assert.equal(imported.status, "success");
    assert.ok(imported.calendar_id);

    const cals = await api.getCalendars();
    assert.ok(Array.isArray(cals) && cals.some((c) => c.calendar_id === imported.calendar_id));

    const delCal = await api.deleteCalendarById(imported.calendar_id);
    assert.equal(delCal.status, "success");
    assert.ok(delCal.events_deleted >= 1);
  });
});
