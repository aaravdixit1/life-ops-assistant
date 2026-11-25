"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  User,
  MapPin,
  GraduationCap,
  Calendar,
  Utensils,
  Check,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Trash2,
  Upload,
  ExternalLink,
  Search,
  Globe,
  Clock,
  BookOpen,
  ArrowRight,
  ArrowLeft,
  Link2,
  FileText,
  Sparkles,
  Plus,
  X,
} from "lucide-react";
import {
  useProfile,
} from "@/components/profile-provider";
import { ThemedTimeSelect } from "@/components/calendar/event-modals";
import { ThemedSelect } from "@/components/ui/themed-select";
import {
  getUserProfile,
  updateUserProfile,
  geocodeLocation,
  getCalendarFeeds,
  addCalendarFeed,
  syncCalendarFeed,
  syncAllCalendarFeeds,
  deleteCalendarFeed,
  uploadGoogleCredentials,
  uploadSyllabusDocument,
  clearSampleData,
  getCalendarSyncStatus,
  triggerGoogleSync,
  getCanvasStatus,
  pollCanvasNow,
  refreshCanvasSession,
  importIcsCalendar,
  type UserProfile,
  type CalendarFeed,
  type CalendarFeedProvider,
  type GeocodeCandidate,
} from "@/lib/api";

type StepId = 1 | 2 | 3 | 4;
type CalendarTab = "google" | "apple" | "outlook" | "upload";

const COMMON_TIMEZONES = [
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Phoenix",
  "America/Anchorage",
  "Pacific/Honolulu",
  "America/Toronto",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Asia/Singapore",
  "Australia/Sydney",
  "UTC",
];

const FEED_COLORS = [
  { hex: "#0284c7", label: "Sky" },
  { hex: "#d97706", label: "Amber" },
  { hex: "#10b981", label: "Emerald" },
  { hex: "#6366f1", label: "Indigo" },
  { hex: "#ec4899", label: "Rose" },
  { hex: "#8b5cf6", label: "Violet" },
];

const PROVIDER_LABELS: Record<string, string> = {
  google: "Google Calendar",
  apple: "Apple iCloud",
  outlook: "Outlook",
  canvas: "Canvas LMS",
  ics_url: "ICS URL",
  ics_file: "ICS File",
};

const CLASS_STANDING_OPTIONS = [
  "Freshman",
  "Sophomore",
  "Junior",
  "Senior",
  "5th Year",
  "Master's",
  "PhD",
  "Other",
];

const RADIUS_PRESETS = [2, 5, 10, 15, 25];

function normalizeWebcalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.toLowerCase().startsWith("webcal://")) {
    return `https://${trimmed.slice("webcal://".length)}`;
  }
  return trimmed;
}

export default function SetupPage() {
  const router = useRouter();
  const { refreshProfile, activeAssignmentsCount } = useProfile();

  const [activeStep, setActiveStep] = useState<StepId>(1);
  const [initialLoading, setInitialLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusNotice, setStatusNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Profile Form State
  const [form, setForm] = useState<UserProfile>({
    full_name: "",
    first_name: "",
    institution: "",
    term_label: "Fall 2026",
    major_or_role: "",
    majors: [],
    minors: [],
    academic_year: "",
    expected_graduation: "",
    career_role: "",
    city: "",
    region: "",
    timezone: "America/New_York",
    latitude: null,
    longitude: null,
    grocery_radius_miles: 5,
    wake_time: "08:30",
    sleep_time: "23:30",
    study_sanctuary: "",
    canvas_base_url: "https://canvas.instructure.com",
    canvas_ics_url: "",
    daily_calories_target: 2600,
    daily_protein_g: 155,
    daily_carbs_g: 320,
    daily_fats_g: 75,
    dietary_notes: "",
    onboarding_completed: false,
  });

  // College Major / Minor Chip Builder Inputs
  const [majorInput, setMajorInput] = useState("");
  const [minorInput, setMinorInput] = useState("");

  // Step 1: Geocoding & Custom Timezone
  const [customTimezoneMode, setCustomTimezoneMode] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geocodeResults, setGeocodeResults] = useState<GeocodeCandidate[]>([]);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

  // Step 2: Canvas & Syllabus Upload
  const [canvasStatus, setCanvasStatus] = useState<{
    session_valid: boolean;
    mode: string;
  } | null>(null);
  const [canvasSyncing, setCanvasSyncing] = useState(false);
  const [canvasSyncMessage, setCanvasSyncMessage] = useState<string | null>(null);
  const [ssoLaunching, setSsoLaunching] = useState(false);
  const [syllabusCourse, setSyllabusCourse] = useState("");
  const [syllabusUploading, setSyllabusUploading] = useState(false);
  const [syllabusFeedback, setSyllabusFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Step 3: Calendars & Feeds
  const [calendarTab, setCalendarTab] = useState<CalendarTab>("google");
  const [feeds, setFeeds] = useState<CalendarFeed[]>([]);
  const [feedsLoading, setFeedsLoading] = useState(false);
  const [syncingFeedId, setSyncingFeedId] = useState<string | null>(null);
  const [syncingAllFeeds, setSyncingAllFeeds] = useState(false);

  // Feed creation inputs
  const [feedUrlInput, setFeedUrlInput] = useState("");
  const [feedNameInput, setFeedNameInput] = useState("Google Calendar");
  const [feedColorInput, setFeedColorInput] = useState(FEED_COLORS[0].hex);
  const [outlookProviderChoice, setOutlookProviderChoice] = useState<"outlook" | "ics_url">("outlook");
  const [addingFeed, setAddingFeed] = useState(false);
  const [feedFeedback, setFeedFeedback] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  // Google Workspace OAuth status & upload
  const [googleSyncStatus, setGoogleSyncStatus] = useState<{
    mode: string;
    google_configured: boolean;
    message: string;
  } | null>(null);
  const [uploadingGoogleCreds, setUploadingGoogleCreds] = useState(false);
  const [triggeringGoogleSync, setTriggeringGoogleSync] = useState(false);

  // ICS File upload
  const [icsCalendarName, setIcsCalendarName] = useState("Imported Schedule");
  const [icsUploading, setIcsUploading] = useState(false);

  // Clear Sample Seed Data inline 2-step confirmation
  const [confirmClearStep, setConfirmClearStep] = useState(false);
  const [clearingSample, setClearingSample] = useState(false);

  // Step 4: BYO Gemini API Key
  const [geminiKeyInput, setGeminiKeyInput] = useState("");
  const [savingGeminiKey, setSavingGeminiKey] = useState(false);
  const [geminiKeyNotice, setGeminiKeyNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const loadAllSetupData = useCallback(async () => {
    try {
      const [profileRes, feedsRes, syncStat, cStatus] = await Promise.all([
        getUserProfile().catch(() => null),
        getCalendarFeeds().catch(() => []),
        getCalendarSyncStatus().catch(() => null),
        getCanvasStatus().catch(() => null),
      ]);

      const rawProf = (profileRes?.profile ?? profileRes ?? null) as Partial<UserProfile> | null;
      if (rawProf) {
        setForm((prev) => ({
          ...prev,
          ...rawProf,
          full_name: rawProf.full_name ?? prev.full_name,
          first_name: rawProf.first_name ?? prev.first_name,
          institution: rawProf.institution ?? prev.institution,
          term_label: rawProf.term_label || prev.term_label,
          major_or_role: rawProf.major_or_role ?? prev.major_or_role,
          majors: Array.isArray(rawProf.majors) ? rawProf.majors : prev.majors ?? [],
          minors: Array.isArray(rawProf.minors) ? rawProf.minors : prev.minors ?? [],
          academic_year: rawProf.academic_year ?? prev.academic_year ?? "",
          expected_graduation: rawProf.expected_graduation ?? prev.expected_graduation ?? "",
          career_role: rawProf.career_role ?? prev.career_role ?? "",
          city: rawProf.city ?? prev.city,
          region: rawProf.region ?? prev.region,
          timezone: rawProf.timezone || prev.timezone,
          latitude: rawProf.latitude ?? null,
          longitude: rawProf.longitude ?? null,
          grocery_radius_miles: rawProf.grocery_radius_miles ?? prev.grocery_radius_miles ?? 5,
          wake_time: rawProf.wake_time || prev.wake_time,
          sleep_time: rawProf.sleep_time || prev.sleep_time,
          study_sanctuary: rawProf.study_sanctuary ?? prev.study_sanctuary,
          canvas_base_url: rawProf.canvas_base_url || prev.canvas_base_url,
          canvas_ics_url: rawProf.canvas_ics_url ?? prev.canvas_ics_url,
          daily_calories_target: rawProf.daily_calories_target ?? prev.daily_calories_target,
          daily_protein_g: rawProf.daily_protein_g ?? prev.daily_protein_g,
          daily_carbs_g: rawProf.daily_carbs_g ?? prev.daily_carbs_g,
          daily_fats_g: rawProf.daily_fats_g ?? prev.daily_fats_g,
          dietary_notes: rawProf.dietary_notes ?? prev.dietary_notes,
          onboarding_completed: Boolean(rawProf.onboarding_completed),
          has_gemini_api_key: Boolean(rawProf.has_gemini_api_key),
          gemini_api_key_source: rawProf.gemini_api_key_source || "none",
          gemini_api_key_masked: rawProf.gemini_api_key_masked || "",
        }));
        if (rawProf.timezone && !COMMON_TIMEZONES.includes(rawProf.timezone)) {
          setCustomTimezoneMode(true);
        }
      }

      const feedList = Array.isArray(feedsRes) ? feedsRes : (feedsRes as any)?.feeds || [];
      setFeeds(feedList);
      if (syncStat) setGoogleSyncStatus(syncStat);
      if (cStatus) setCanvasStatus(cStatus);
    } finally {
      setInitialLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAllSetupData();
  }, [loadAllSetupData]);

  const handleTabSwitch = (tab: CalendarTab) => {
    setCalendarTab(tab);
    setFeedFeedback(null);
    setFeedUrlInput("");
    if (tab === "google") {
      setFeedNameInput("Google Calendar");
      setFeedColorInput("#0284c7");
    } else if (tab === "apple") {
      setFeedNameInput("Apple iCloud Calendar");
      setFeedColorInput("#6366f1");
    } else if (tab === "outlook") {
      setFeedNameInput("Outlook Calendar");
      setFeedColorInput("#10b981");
    }
  };

  const handleAddProgramChip = (field: "majors" | "minors", rawValue: string) => {
    const clean = rawValue.trim();
    if (!clean) return;
    setForm((prev) => {
      const current = Array.isArray(prev[field]) ? prev[field]! : [];
      if (current.some((item) => item.toLowerCase() === clean.toLowerCase())) {
        return prev;
      }
      return { ...prev, [field]: [...current, clean] };
    });
    if (field === "majors") setMajorInput("");
    else setMinorInput("");
  };

  const handleRemoveProgramChip = (field: "majors" | "minors", valueToRemove: string) => {
    setForm((prev) => ({
      ...prev,
      [field]: (prev[field] || []).filter((item) => item !== valueToRemove),
    }));
  };

  const persistProfile = async (
    overrides?: Partial<UserProfile>,
    nextStep?: StepId,
    successMessage?: string
  ) => {
    setSaving(true);
    setStatusNotice(null);
    try {
      const pendingMajor = majorInput.trim();
      const pendingMinor = minorInput.trim();
      const nextMajors = [
        ...(form.majors || []),
        ...(pendingMajor && !(form.majors || []).some((m) => m.toLowerCase() === pendingMajor.toLowerCase())
          ? [pendingMajor]
          : []),
      ];
      const nextMinors = [
        ...(form.minors || []),
        ...(pendingMinor && !(form.minors || []).some((m) => m.toLowerCase() === pendingMinor.toLowerCase())
          ? [pendingMinor]
          : []),
      ];
      if (pendingMajor) setMajorInput("");
      if (pendingMinor) setMinorInput("");

      const payload: Partial<UserProfile> = {
        ...form,
        majors: nextMajors,
        minors: nextMinors,
        ...overrides,
        first_name:
          (overrides?.full_name ?? form.full_name).trim().split(/\s+/)[0] ||
          form.first_name ||
          "",
      };
      const res: any = await updateUserProfile(payload);
      const savedProfile = res?.profile || payload;
      setForm((prev) => ({ ...prev, ...savedProfile }));
      window.dispatchEvent(new Event("lifeops-profile-updated"));
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      window.dispatchEvent(new Event("lifeops-refresh-assignments"));
      await refreshProfile();
      setStatusNotice({
        type: "success",
        text: successMessage || "Profile settings saved.",
      });
      if (nextStep) {
        setActiveStep(nextStep);
      }
      return true;
    } catch (err: any) {
      setStatusNotice({
        type: "error",
        text: `Could not save profile: ${err?.message || "Check backend connection and try again."}`,
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleGeocodeLookup = async () => {
    const query = [form.city, form.region].filter((s) => s.trim()).join(", ");
    if (!query) {
      setGeocodeError("Enter a city name first, or set coordinates and timezone manually below.");
      return;
    }
    setGeocoding(true);
    setGeocodeError(null);
    setGeocodeResults([]);
    try {
      const res = await geocodeLocation({ query, city: form.city, region: form.region });
      const results: GeocodeCandidate[] = Array.isArray(res) ? res : res?.results || [];
      if (results.length === 0) {
        setGeocodeError("No matching cities found. Try adding a state/country or enter timezone manually.");
      } else {
        setGeocodeResults(results);
      }
    } catch (err: any) {
      setGeocodeError(`Location lookup failed: ${err?.message || "Enter coordinates manually below."}`);
    } finally {
      setGeocoding(false);
    }
  };

  const handleSelectGeocode = (item: GeocodeCandidate) => {
    const tz = item.timezone || form.timezone;
    if (tz && !COMMON_TIMEZONES.includes(tz)) {
      setCustomTimezoneMode(true);
    } else {
      setCustomTimezoneMode(false);
    }
    setForm((prev) => ({
      ...prev,
      city: item.city || item.name || prev.city,
      region: item.region ?? prev.region,
      latitude: Number(item.latitude),
      longitude: Number(item.longitude),
      timezone: tz,
    }));
    setGeocodeResults([]);
    setGeocodeError(null);
  };

  const handleSaveAndSyncCanvas = async () => {
    setCanvasSyncing(true);
    setCanvasSyncMessage(null);
    setStatusNotice(null);
    try {
      const saved = await persistProfile(
        {
          canvas_base_url: form.canvas_base_url.trim(),
          canvas_ics_url: form.canvas_ics_url.trim(),
        },
        undefined,
        "Canvas settings saved."
      );
      if (!saved) return;

      const res = await pollCanvasNow();
      if (res?.status === "error") {
        setStatusNotice({
          type: "error",
          text: `Canvas feed sync failed (${res?.message || `HTTP ${res?.code || "error"}`}). Verify your Calendar Feed .ics URL.`,
        });
        return;
      }
      if (res?.status === "skipped") {
        setCanvasSyncMessage("Saved settings. Add your private Canvas Calendar Feed .ics URL to sync assignments.");
      } else {
        const activeCount = res?.stats?.active;
        setCanvasSyncMessage(
          typeof activeCount === "number"
            ? `Canvas synced successfully (${activeCount} active assignments & calendar deadlines).`
            : "Canvas feed sync completed."
        );
      }
      await reloadFeeds();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      window.dispatchEvent(new Event("lifeops-refresh-assignments"));
      window.dispatchEvent(new Event("lifeops-profile-updated"));
      await refreshProfile();
    } catch (err: any) {
      setStatusNotice({
        type: "error",
        text: `Canvas sync failed: ${err?.message || "Verify your .ics Calendar Feed URL and retry."}`,
      });
    } finally {
      setCanvasSyncing(false);
    }
  };

  const handleLaunchCanvasSso = async () => {
    setSsoLaunching(true);
    setStatusNotice(null);
    try {
      const res = await refreshCanvasSession();
      setStatusNotice({
        type: "success",
        text:
          res?.message ||
          "Browser SSO session window launched. Complete login in the browser window to enable deep rubric extraction.",
      });
      const cStatus = await getCanvasStatus().catch(() => null);
      if (cStatus) setCanvasStatus(cStatus);
    } catch (err: any) {
      setStatusNotice({
        type: "error",
        text: `Could not launch SSO browser: ${err?.message || "Playwright may not be installed; .ics polling still works unattended."}`,
      });
    } finally {
      setSsoLaunching(false);
    }
  };

  const handleSyllabusUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSyllabusUploading(true);
    setSyllabusFeedback(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("source_type", "canvas_syllabus");
      if (syllabusCourse.trim()) {
        fd.append("course", syllabusCourse.trim());
      }
      const res = await uploadSyllabusDocument(fd);
      setSyllabusFeedback({
        type: "success",
        text:
          res?.message ||
          `Indexed "${file.name}" into local pgvector syllabus memory.`,
      });
    } catch (err: any) {
      setSyllabusFeedback({
        type: "error",
        text: `Syllabus upload failed: ${err?.message || "Ensure file is .md or .txt and backend is running."}`,
      });
    } finally {
      setSyllabusUploading(false);
      e.target.value = "";
    }
  };

  const reloadFeeds = async () => {
    setFeedsLoading(true);
    try {
      const res = await getCalendarFeeds();
      const feedList = Array.isArray(res) ? res : (res as any)?.feeds || [];
      setFeeds(feedList);
    } catch (err) {
      console.error("Failed to reload feeds:", err);
    } finally {
      setFeedsLoading(false);
    }
  };

  const handleConnectFeed = async (e: React.FormEvent, provider: CalendarFeedProvider) => {
    e.preventDefault();
    const normalizedUrl = normalizeWebcalUrl(feedUrlInput);
    if (!normalizedUrl) {
      setFeedFeedback({
        type: "error",
        text: "Paste a calendar subscription URL (.ics or webcal://) before connecting.",
      });
      return;
    }

    setAddingFeed(true);
    setFeedFeedback(null);
    try {
      const res: any = await addCalendarFeed({
        name: feedNameInput.trim() || PROVIDER_LABELS[provider] || "External Calendar",
        provider,
        feed_url: normalizedUrl,
        color: feedColorInput,
      });
      setFeedUrlInput("");
      await reloadFeeds();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      window.dispatchEvent(new Event("lifeops-refresh-assignments"));
      window.dispatchEvent(new Event("lifeops-profile-updated"));
      await refreshProfile();
      if (res?.sync_result?.status === "error") {
        setFeedFeedback({
          type: "error",
          text: `Feed saved, but initial sync reported: ${res.sync_result.error || "Unable to fetch feed URL."}`,
        });
      } else {
        setFeedFeedback({
          type: "success",
          text: `Connected "${feedNameInput.trim() || PROVIDER_LABELS[provider]}" and synced initial events.`,
        });
      }
    } catch (err: any) {
      setFeedFeedback({
        type: "error",
        text: `Failed to connect calendar feed: ${err?.message || "Verify the URL points to a valid .ics feed."}`,
      });
    } finally {
      setAddingFeed(false);
    }
  };

  const handleSyncSingleFeed = async (id: string) => {
    setSyncingFeedId(id);
    setFeedFeedback(null);
    try {
      const res = await syncCalendarFeed(id);
      await reloadFeeds();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      setFeedFeedback({
        type: "success",
        text: res?.message || "Calendar feed refreshed.",
      });
    } catch (err: any) {
      setFeedFeedback({
        type: "error",
        text: `Feed sync error: ${err?.message || "Could not reach feed URL."}`,
      });
    } finally {
      setSyncingFeedId(null);
    }
  };

  const handleSyncAllFeeds = async () => {
    setSyncingAllFeeds(true);
    setFeedFeedback(null);
    try {
      const res = await syncAllCalendarFeeds();
      await reloadFeeds();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      setFeedFeedback({
        type: "success",
        text: res?.message || "Synced all connected calendar feeds.",
      });
    } catch (err: any) {
      setFeedFeedback({
        type: "error",
        text: `Sync all failed: ${err?.message || "One or more feeds failed to respond."}`,
      });
    } finally {
      setSyncingAllFeeds(false);
    }
  };

  const handleDeleteFeed = async (id: string) => {
    setFeedFeedback(null);
    try {
      await deleteCalendarFeed(id);
      await reloadFeeds();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      window.dispatchEvent(new Event("lifeops-refresh-assignments"));
      window.dispatchEvent(new Event("lifeops-profile-updated"));
      await refreshProfile();
    } catch (err: any) {
      setFeedFeedback({
        type: "error",
        text: `Could not remove feed: ${err?.message || "Unknown error."}`,
      });
    }
  };

  const handleGoogleCredsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingGoogleCreds(true);
    setFeedFeedback(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await uploadGoogleCredentials(fd);
      const syncStat = await getCalendarSyncStatus().catch(() => null);
      if (syncStat) setGoogleSyncStatus(syncStat);
      setFeedFeedback({
        type: "success",
        text: res?.message || "Uploaded Google OAuth credentials.json.",
      });
    } catch (err: any) {
      setFeedFeedback({
        type: "error",
        text: `Google credentials upload failed: ${err?.message || "Ensure file is valid OAuth client JSON."}`,
      });
    } finally {
      setUploadingGoogleCreds(false);
      e.target.value = "";
    }
  };

  const handleTriggerGoogleSync = async () => {
    setTriggeringGoogleSync(true);
    setFeedFeedback(null);
    try {
      const res = await triggerGoogleSync();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      setFeedFeedback({
        type: "success",
        text: res?.message || "Google Workspace sync triggered.",
      });
    } catch (err: any) {
      setFeedFeedback({
        type: "error",
        text: `Google sync error: ${err?.message || "Authorize credentials.json first."}`,
      });
    } finally {
      setTriggeringGoogleSync(false);
    }
  };

  const handleIcsFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIcsUploading(true);
    setFeedFeedback(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const cleanName =
        icsCalendarName.trim() ||
        file.name.replace(/\.ics$/i, "").replace(/[_-]+/g, " ").trim() ||
        "Imported Schedule";
      fd.append("calendar_name", cleanName);
      fd.append("provider", "ics_file");
      fd.append("color", feedColorInput);
      const res = await importIcsCalendar(fd);
      await reloadFeeds();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      window.dispatchEvent(new Event("lifeops-refresh-assignments"));
      window.dispatchEvent(new Event("lifeops-profile-updated"));
      await refreshProfile();
      setFeedFeedback({
        type: "success",
        text: `Imported ${res?.imported_count ?? 0} events from "${file.name}" into "${res?.calendar_name || cleanName}".`,
      });
    } catch (err: any) {
      setFeedFeedback({
        type: "error",
        text: `ICS import failed: ${err?.message || "Verify the file is a valid .ics calendar export."}`,
      });
    } finally {
      setIcsUploading(false);
      e.target.value = "";
    }
  };

  const handleClearSampleData = async () => {
    setClearingSample(true);
    setFeedFeedback(null);
    try {
      const res = await clearSampleData();
      setConfirmClearStep(false);
      await reloadFeeds();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      window.dispatchEvent(new Event("lifeops-refresh-assignments"));
      window.dispatchEvent(new Event("lifeops-profile-updated"));
      await refreshProfile();
      const deletedSummary =
        typeof res?.calendar_events_deleted === "number"
          ? `Cleared ${res.calendar_events_deleted} calendar events, ${res.calendar_feeds_deleted ?? 0} feeds, and ${res.canvas_assignments_deleted ?? 0} assignments.`
          : res?.message || "Sample seed data cleared.";
      setFeedFeedback({
        type: "success",
        text: deletedSummary,
      });
    } catch (err: any) {
      setFeedFeedback({
        type: "error",
        text: `Failed to clear sample data: ${err?.message || "Retry in a moment."}`,
      });
    } finally {
      setClearingSample(false);
    }
  };

  const handleCompleteOnboarding = async () => {
    const ok = await persistProfile(
      { onboarding_completed: true },
      undefined,
      "Setup complete. Opening Daily Brief..."
    );
    if (ok) {
      router.push("/brief");
    }
  };

  const handleSaveGeminiKey = async () => {
    const trimmed = geminiKeyInput.trim();
    if (!trimmed) {
      setGeminiKeyNotice({ type: "error", text: "Paste a valid Gemini API key first." });
      return;
    }
    setSavingGeminiKey(true);
    setGeminiKeyNotice(null);
    try {
      await updateUserProfile({ gemini_api_key: trimmed });
      setGeminiKeyInput("");
      await loadAllSetupData();
      await refreshProfile();
      window.dispatchEvent(new Event("lifeops-profile-updated"));
      setGeminiKeyNotice({
        type: "success",
        text: "Gemini API key saved to your local workspace. Assignment AI summaries are enabled.",
      });
    } catch (err: any) {
      setGeminiKeyNotice({
        type: "error",
        text: err?.message || "Failed to save Gemini API key.",
      });
    } finally {
      setSavingGeminiKey(false);
    }
  };

  const handleClearGeminiKey = async () => {
    setSavingGeminiKey(true);
    setGeminiKeyNotice(null);
    try {
      await updateUserProfile({ clear_gemini_api_key: true });
      setGeminiKeyInput("");
      await loadAllSetupData();
      await refreshProfile();
      window.dispatchEvent(new Event("lifeops-profile-updated"));
      setGeminiKeyNotice({
        type: "success",
        text: "Cleared workspace Gemini API key.",
      });
    } catch (err: any) {
      setGeminiKeyNotice({
        type: "error",
        text: err?.message || "Failed to clear Gemini API key.",
      });
    } finally {
      setSavingGeminiKey(false);
    }
  };

  const steps: Array<{
    id: StepId;
    title: string;
    detail: string;
    icon: React.ComponentType<{ className?: string }>;
    complete: boolean;
  }> = [
    {
      id: 1,
      title: "Profile & Location",
      detail: form.full_name.trim()
        ? `${form.full_name} · ${form.timezone}`
        : "Name, institution, timezone",
      icon: User,
      complete: Boolean(form.full_name.trim() && form.timezone.trim()),
    },
    {
      id: 2,
      title: "Canvas LMS",
      detail: form.canvas_ics_url.trim()
        ? "Private .ics feed linked"
        : "ICS feed & optional SSO",
      icon: GraduationCap,
      complete: Boolean(form.canvas_ics_url.trim() || form.canvas_base_url.trim()),
    },
    {
      id: 3,
      title: "Calendars",
      detail:
        feeds.length > 0
          ? `${feeds.length} feed${feeds.length === 1 ? "" : "s"} connected`
          : "Google, Apple, Outlook, .ics",
      icon: Calendar,
      complete: feeds.length > 0 || Boolean(googleSyncStatus?.google_configured),
    },
    {
      id: 4,
      title: "Nutrition & Finalize",
      detail: `${form.daily_calories_target} kcal · ${form.daily_protein_g}g protein`,
      icon: Utensils,
      complete: Boolean(form.onboarding_completed),
    },
  ];

  const inputClass =
    "w-full px-3 py-2 text-xs rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-[var(--accent-primary)] transition-colors font-sans";
  const labelClass = "block text-xs font-medium text-[var(--text-secondary)] mb-1.5 font-sans";

  return (
    <div className="space-y-8 font-sans">
      {/* Page Header */}
      <header className="pb-5 border-b border-[var(--border-hairline)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold text-[var(--text-primary)] tracking-tight">
            Setup & Integrations
          </h1>
          <p className="text-xs text-[var(--text-muted)] max-w-[65ch]">
            Configure your personal profile, local timezone, Canvas LMS feed, external calendar subscriptions, and daily macro targets.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <span
            className={`px-2.5 py-1 rounded-md text-xs font-medium border flex items-center gap-1.5 ${
              form.onboarding_completed
                ? "bg-[var(--semantic-success)]/12 text-[var(--semantic-success)] border-[var(--semantic-success)]/30"
                : "bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] border-[var(--accent-primary)]/30"
            }`}
          >
            {form.onboarding_completed ? (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Ready</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" />
                <span>Setup in Progress</span>
              </>
            )}
          </span>

          <Link
            href="/brief"
            className="px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors flex items-center gap-1.5"
          >
            <span>Open Brief</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
      </header>

      {statusNotice && (
        <div
          className={`px-4 py-3 rounded-md border text-xs flex items-center gap-2.5 ${
            statusNotice.type === "success"
              ? "border-[var(--semantic-success)]/35 bg-[var(--semantic-success)]/10 text-[var(--semantic-success)]"
              : "border-[var(--semantic-danger)]/35 bg-[var(--semantic-danger)]/10 text-[var(--semantic-danger)]"
          }`}
        >
          {statusNotice.type === "success" ? (
            <CheckCircle2 className="w-4 h-4 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 shrink-0" />
          )}
          <span>{statusNotice.text}</span>
        </div>
      )}

      {/* Asymmetric 2-Column Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Step Rail */}
        <aside className="lg:col-span-4 space-y-6 lg:sticky lg:top-6">
          <nav
            aria-label="Setup steps"
            className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] divide-y divide-[var(--border-hairline)] overflow-hidden"
          >
            {steps.map((step) => {
              const isCurrent = activeStep === step.id;
              const StepIcon = step.icon;
              return (
                <button
                  key={step.id}
                  type="button"
                  onClick={() => {
                    setActiveStep(step.id);
                    setStatusNotice(null);
                  }}
                  className={`w-full text-left px-4 py-3.5 flex items-start gap-3 transition-colors cursor-pointer ${
                    isCurrent
                      ? "bg-[var(--bg-surface)]"
                      : "hover:bg-[var(--bg-hover)]/50"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium shrink-0 mt-0.5 border ${
                      isCurrent
                        ? "bg-[var(--accent-primary)] text-[var(--bg-base)] border-[var(--accent-primary)]"
                        : step.complete
                        ? "bg-[var(--semantic-success)]/15 text-[var(--semantic-success)] border-[var(--semantic-success)]/30"
                        : "bg-[var(--bg-base)] text-[var(--text-muted)] border-[var(--border-hairline)]"
                    }`}
                  >
                    {step.complete && !isCurrent ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      <span className="tabular-nums">{step.id}</span>
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-xs font-semibold truncate ${
                          isCurrent ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"
                        }`}
                      >
                        {step.title}
                      </span>
                      <StepIcon
                        className={`w-3.5 h-3.5 shrink-0 ${
                          isCurrent ? "text-[var(--accent-primary)]" : "text-[var(--text-muted)]"
                        }`}
                      />
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5">
                      {step.detail}
                    </p>
                  </div>
                </button>
              );
            })}
          </nav>

          {/* Live System Readiness */}
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4 space-y-3">
            <h3 className="text-xs font-semibold text-[var(--text-primary)]">
              Integration Readiness
            </h3>
            <div className="divide-y divide-[var(--border-hairline)] text-xs">
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[var(--text-muted)]">Timezone</span>
                <span className="font-mono text-[11px] text-[var(--text-primary)] truncate">
                  {form.timezone || "Not set"}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[var(--text-muted)]">Canvas Ingestion</span>
                <span className="font-mono text-[11px] text-[var(--text-primary)]">
                  {form.canvas_ics_url.trim()
                    ? canvasStatus?.session_valid
                      ? "ICS + SSO"
                      : "ICS Active"
                    : "Not Linked"}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[var(--text-muted)]">Active Deliverables</span>
                <span className="font-mono tabular-nums text-[11px] text-[var(--text-primary)]">
                  {activeAssignmentsCount}
                </span>
              </div>
              <div className="py-2 flex items-center justify-between gap-2">
                <span className="text-[var(--text-muted)]">External Feeds</span>
                <span className="font-mono tabular-nums text-[11px] text-[var(--text-primary)]">
                  {feeds.length}
                </span>
              </div>
              <div className="pt-2 flex items-center justify-between gap-2">
                <span className="text-[var(--text-muted)]">Google OAuth</span>
                <span className="font-mono text-[11px] text-[var(--text-secondary)]">
                  {googleSyncStatus?.google_configured ? "Configured" : "Optional"}
                </span>
              </div>
            </div>
          </div>
        </aside>

        {/* Right Focused Form Workspace */}
        <section className="lg:col-span-8 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-6 sm:p-7">
          {initialLoading ? (
            <div className="py-16 flex items-center justify-center gap-2.5 text-xs text-[var(--text-muted)]">
              <RefreshCw className="w-4 h-4 animate-spin text-[var(--accent-primary)]" />
              <span>Loading configuration...</span>
            </div>
          ) : (
            <>
              {/* ============================================================ */}
              {/* STEP 1: PROFILE & LOCATION                                   */}
              {/* ============================================================ */}
              {activeStep === 1 && (
                <div className="space-y-7">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
                      Profile & Location
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] max-w-[65ch]">
                      Personalize greetings, weather horizons, and local calendar scheduling boundaries.
                    </p>
                  </div>

                  {/* Student Identity */}
                  <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Student Identity
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="setup-full-name" className={labelClass}>
                          Full Name
                        </label>
                        <input
                          id="setup-full-name"
                          type="text"
                          value={form.full_name}
                          onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                          placeholder="e.g. Jordan Taylor"
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label htmlFor="setup-institution" className={labelClass}>
                          University / College
                        </label>
                        <input
                          id="setup-institution"
                          type="text"
                          value={form.institution}
                          onChange={(e) => setForm({ ...form, institution: e.target.value })}
                          placeholder="e.g. State University"
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label htmlFor="setup-term" className={labelClass}>
                          Current Term / Semester
                        </label>
                        <input
                          id="setup-term"
                          type="text"
                          value={form.term_label}
                          onChange={(e) => setForm({ ...form, term_label: e.target.value })}
                          placeholder="e.g. Fall 2026"
                          className={inputClass}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label htmlFor="setup-year" className={labelClass}>
                            Class Standing
                          </label>
                          <ThemedSelect
                            id="setup-year"
                            value={form.academic_year || ""}
                            onChange={(e) => setForm({ ...form, academic_year: e.target.value })}
                          >
                            <option value="">Select year...</option>
                            {CLASS_STANDING_OPTIONS.map((yr) => (
                              <option key={yr} value={yr}>
                                {yr}
                              </option>
                            ))}
                          </ThemedSelect>
                        </div>

                        <div>
                          <label htmlFor="setup-grad" className={labelClass}>
                            Expected Grad
                          </label>
                          <input
                            id="setup-grad"
                            type="text"
                            value={form.expected_graduation || ""}
                            onChange={(e) =>
                              setForm({ ...form, expected_graduation: e.target.value })
                            }
                            placeholder="e.g. May 2027"
                            className={inputClass}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Academic Program: Majors & Minors */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] space-y-5">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        Academic Program (Majors & Minors)
                      </h3>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Add single, double, or triple majors separately from optional minors and your target career role.
                      </p>
                    </div>

                    {/* Majors Chip Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor="setup-major-input" className={`${labelClass} mb-0`}>
                          Major(s)
                        </label>
                        <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
                          {(form.majors || []).length} added
                        </span>
                      </div>

                      {(form.majors || []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {(form.majors || []).map((maj) => (
                            <span
                              key={maj}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30"
                            >
                              <GraduationCap className="w-3 h-3" />
                              <span>{maj}</span>
                              <button
                                type="button"
                                aria-label={`Remove major ${maj}`}
                                onClick={() => handleRemoveProgramChip("majors", maj)}
                                className="hover:opacity-75 cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          id="setup-major-input"
                          type="text"
                          value={majorInput}
                          onChange={(e) => setMajorInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddProgramChip("majors", majorInput);
                            }
                          }}
                          placeholder="e.g. Computer Science (press Enter to add a 2nd major like Mathematics)"
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddProgramChip("majors", majorInput)}
                          className="px-3 py-2 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span>Add Major</span>
                        </button>
                      </div>
                    </div>

                    {/* Minors Chip Section */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <label htmlFor="setup-minor-input" className={`${labelClass} mb-0`}>
                          Minor(s) <span className="text-[var(--text-muted)] font-normal">(Optional)</span>
                        </label>
                        <span className="text-[11px] font-mono tabular-nums text-[var(--text-muted)]">
                          {(form.minors || []).length} added
                        </span>
                      </div>

                      {(form.minors || []).length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {(form.minors || []).map((minItem) => (
                            <span
                              key={minItem}
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]"
                            >
                              <BookOpen className="w-3 h-3 text-[var(--text-muted)]" />
                              <span>{minItem}</span>
                              <button
                                type="button"
                                aria-label={`Remove minor ${minItem}`}
                                onClick={() => handleRemoveProgramChip("minors", minItem)}
                                className="hover:text-[var(--text-primary)] cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex items-center gap-2">
                        <input
                          id="setup-minor-input"
                          type="text"
                          value={minorInput}
                          onChange={(e) => setMinorInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddProgramChip("minors", minorInput);
                            }
                          }}
                          placeholder="e.g. Economics, Cybersecurity, or Statistics"
                          className={inputClass}
                        />
                        <button
                          type="button"
                          onClick={() => handleAddProgramChip("minors", minorInput)}
                          className="px-3 py-2 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span>Add Minor</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Career Track / Target Role */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        Career Track & Target Role
                      </h3>
                      <p className="text-xs text-[var(--text-muted)] mt-0.5">
                        Separate from your degree — used by the Career hub and Assistant to tailor opportunity insights.
                      </p>
                    </div>
                    <div>
                      <label htmlFor="setup-career-role" className={labelClass}>
                        Target Role / Focus
                      </label>
                      <input
                        id="setup-career-role"
                        type="text"
                        value={form.career_role || ""}
                        onChange={(e) => setForm({ ...form, career_role: e.target.value })}
                        placeholder="e.g. Software Engineering Intern, Quantitative Research Assistant, Pre-Med"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  {/* Location & Coordinate Lookup */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          Location & Timezone
                        </h3>
                        <p className="text-xs text-[var(--text-muted)]">
                          Used for accurate local weather and day-boundary rollover.
                        </p>
                      </div>

                      <button
                        type="button"
                        onClick={handleGeocodeLookup}
                        disabled={geocoding}
                        className="px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 self-start sm:self-auto"
                      >
                        {geocoding ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary)]" />
                        ) : (
                          <Search className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        )}
                        <span>{geocoding ? "Looking up..." : "Lookup Coordinates & Timezone"}</span>
                      </button>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label htmlFor="setup-city" className={labelClass}>
                          City
                        </label>
                        <input
                          id="setup-city"
                          type="text"
                          value={form.city}
                          onChange={(e) => setForm({ ...form, city: e.target.value })}
                          placeholder="e.g. Boston"
                          className={inputClass}
                        />
                      </div>

                      <div>
                        <label htmlFor="setup-region" className={labelClass}>
                          Region / State
                        </label>
                        <input
                          id="setup-region"
                          type="text"
                          value={form.region}
                          onChange={(e) => setForm({ ...form, region: e.target.value })}
                          placeholder="e.g. MA"
                          className={inputClass}
                        />
                      </div>
                    </div>

                    {geocodeError && (
                      <div className="px-3 py-2 rounded-md border border-[var(--semantic-danger)]/35 bg-[var(--semantic-danger)]/10 text-xs text-[var(--semantic-danger)] flex items-center gap-2">
                        <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        <span>{geocodeError}</span>
                      </div>
                    )}

                    {geocodeResults.length > 0 && (
                      <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] divide-y divide-[var(--border-hairline)]">
                        {geocodeResults.map((cand, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleSelectGeocode(cand)}
                            className="w-full px-3.5 py-2.5 text-left flex items-center justify-between gap-3 hover:bg-[var(--bg-hover)]/60 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <MapPin className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                              <span className="text-xs font-medium text-[var(--text-primary)] truncate">
                                {cand.label ||
                                  [cand.city || cand.name, cand.region, cand.country]
                                    .filter(Boolean)
                                    .join(", ")}
                              </span>
                            </div>
                            <span className="font-mono text-[11px] text-[var(--text-muted)] shrink-0">
                              {Number(cand.latitude).toFixed(2)}, {Number(cand.longitude).toFixed(2)} · {cand.timezone}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="setup-timezone" className={labelClass}>
                          IANA Timezone
                        </label>
                        {!customTimezoneMode ? (
                          <ThemedSelect
                            id="setup-timezone"
                            value={COMMON_TIMEZONES.includes(form.timezone) ? form.timezone : "__custom__"}
                            onChange={(e) => {
                              if (e.target.value === "__custom__") {
                                setCustomTimezoneMode(true);
                              } else {
                                setForm({ ...form, timezone: e.target.value });
                              }
                            }}
                          >
                            {COMMON_TIMEZONES.map((tz) => (
                              <option key={tz} value={tz}>
                                {tz}
                              </option>
                            ))}
                            <option value="__custom__">Custom IANA timezone...</option>
                          </ThemedSelect>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input
                              id="setup-timezone"
                              type="text"
                              value={form.timezone}
                              onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                              placeholder="Area/Location"
                              className={`${inputClass} font-mono`}
                            />
                            <button
                              type="button"
                              onClick={() => setCustomTimezoneMode(false)}
                              className="px-2 py-2 text-[11px] rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] shrink-0 cursor-pointer"
                            >
                              List
                            </button>
                          </div>
                        )}
                      </div>

                      <div>
                        <label htmlFor="setup-lat" className={labelClass}>
                          Latitude
                        </label>
                        <input
                          id="setup-lat"
                          type="number"
                          step="0.0001"
                          value={form.latitude ?? ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              latitude: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          placeholder="42.3601"
                          className={`${inputClass} font-mono tabular-nums`}
                        />
                      </div>

                      <div>
                        <label htmlFor="setup-lon" className={labelClass}>
                          Longitude
                        </label>
                        <input
                          id="setup-lon"
                          type="number"
                          step="0.0001"
                          value={form.longitude ?? ""}
                          onChange={(e) =>
                            setForm({
                              ...form,
                              longitude: e.target.value === "" ? null : Number(e.target.value),
                            })
                          }
                          placeholder="-71.0589"
                          className={`${inputClass} font-mono tabular-nums`}
                        />
                      </div>
                    </div>

                    {/* Nearby Grocery Store Radius */}
                    <div className="pt-2 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label htmlFor="setup-grocery-radius" className={`${labelClass} mb-0`}>
                          Grocery Store Search Radius (for Health Hub)
                        </label>
                        <span className="text-xs font-mono tabular-nums text-[var(--accent-primary)] font-semibold">
                          {form.grocery_radius_miles ?? 5} miles
                        </span>
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                        <input
                          id="setup-grocery-radius"
                          type="range"
                          min={1}
                          max={25}
                          step={1}
                          value={form.grocery_radius_miles ?? 5}
                          onChange={(e) =>
                            setForm({ ...form, grocery_radius_miles: Number(e.target.value) })
                          }
                          className="flex-1 accent-[var(--accent-primary)] cursor-pointer"
                        />
                        <div className="flex items-center gap-1.5 shrink-0">
                          {RADIUS_PRESETS.map((mi) => (
                            <button
                              key={mi}
                              type="button"
                              onClick={() => setForm({ ...form, grocery_radius_miles: mi })}
                              className={`px-2 py-1 rounded text-[11px] font-mono border transition-colors cursor-pointer ${
                                (form.grocery_radius_miles ?? 5) === mi
                                  ? "bg-[var(--accent-primary)] text-[var(--bg-base)] border-[var(--accent-primary)] font-semibold"
                                  : "bg-[var(--bg-base)] text-[var(--text-secondary)] border-[var(--border-hairline)] hover:text-[var(--text-primary)]"
                              }`}
                            >
                              {mi} mi
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Daily Cadence */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] space-y-4">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Daily Cadence & Study Spot
                    </h3>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div>
                        <label htmlFor="setup-wake" className={labelClass}>
                          Wake Time
                        </label>
                        <ThemedTimeSelect
                          id="setup-wake"
                          ariaLabel="Wake Time"
                          value={form.wake_time}
                          onChange={(val) => setForm({ ...form, wake_time: val })}
                        />
                      </div>

                      <div>
                        <label htmlFor="setup-sleep" className={labelClass}>
                          Sleep Time
                        </label>
                        <ThemedTimeSelect
                          id="setup-sleep"
                          ariaLabel="Sleep Time"
                          value={form.sleep_time}
                          onChange={(val) => setForm({ ...form, sleep_time: val })}
                        />
                      </div>

                      <div>
                        <label htmlFor="setup-sanctuary" className={labelClass}>
                          Favorite Study / Work Spot
                        </label>
                        <input
                          id="setup-sanctuary"
                          type="text"
                          value={form.study_sanctuary}
                          onChange={(e) => setForm({ ...form, study_sanctuary: e.target.value })}
                          placeholder="e.g. North Library Quiet Floor"
                          className={inputClass}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Step 1 Actions */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => persistProfile(undefined, undefined, "Profile & location saved.")}
                      className="px-4 py-2 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors cursor-pointer disabled:opacity-50"
                    >
                      {saving ? "Saving..." : "Save Profile"}
                    </button>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => persistProfile(undefined, 2, "Profile & location saved.")}
                      className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    >
                      <span>Save & Continue to Canvas</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* STEP 2: CANVAS LMS                                           */}
              {/* ============================================================ */}
              {activeStep === 2 && (
                <div className="space-y-7">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
                      Canvas LMS Ingestion
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] max-w-[65ch]">
                      Connect your private Canvas calendar feed for unattended deadline tracking. No static API token is required.
                    </p>
                  </div>

                  {/* Canvas Host Presets + URL */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <label htmlFor="setup-canvas-base" className={labelClass + " mb-0"}>
                        Canvas Base URL
                      </label>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setForm({ ...form, canvas_base_url: "https://canvas.instructure.com" })
                          }
                          className="px-2 py-1 rounded text-[11px] font-mono border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        >
                          canvas.instructure.com
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setForm({ ...form, canvas_base_url: "https://canvas.university.edu" });
                          }}
                          className="px-2 py-1 rounded text-[11px] border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
                        >
                          Custom University Host
                        </button>
                      </div>
                    </div>

                    <input
                      id="setup-canvas-base"
                      type="url"
                      value={form.canvas_base_url}
                      onChange={(e) => setForm({ ...form, canvas_base_url: e.target.value })}
                      placeholder="https://canvas.instructure.com"
                      className={`${inputClass} font-mono`}
                    />
                  </div>

                  {/* Private Canvas ICS URL */}
                  <div className="space-y-2.5">
                    <label htmlFor="setup-canvas-ics" className={labelClass}>
                      Private Canvas .ics Feed URL
                    </label>
                    <input
                      id="setup-canvas-ics"
                      type="url"
                      value={form.canvas_ics_url}
                      onChange={(e) => setForm({ ...form, canvas_ics_url: e.target.value })}
                      placeholder="https://canvas.instructure.com/feeds/calendars/user_xxxx.ics"
                      className={`${inputClass} font-mono`}
                    />

                    <ol className="text-xs text-[var(--text-muted)] space-y-1 pl-4 list-decimal">
                      <li>Open <strong className="text-[var(--text-secondary)] font-medium">Canvas → Calendar</strong></li>
                      <li>Select <strong className="text-[var(--text-secondary)] font-medium">Calendar Feed</strong> in the right sidebar</li>
                      <li>Copy the private <code className="font-mono text-[11px] text-[var(--text-primary)]">.ics</code> link and paste it above</li>
                    </ol>

                    <div className="pt-2 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        disabled={canvasSyncing || saving}
                        onClick={handleSaveAndSyncCanvas}
                        className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${canvasSyncing ? "animate-spin" : ""}`} />
                        <span>{canvasSyncing ? "Saving & Syncing..." : "Save & Sync Canvas Now"}</span>
                      </button>

                      {canvasSyncMessage && (
                        <span className="text-xs text-[var(--semantic-success)] flex items-center gap-1.5">
                          <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                          <span>{canvasSyncMessage}</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Optional Playwright SSO Login */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          Optional Browser SSO Session
                        </h3>
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                          {canvasStatus?.session_valid ? "Session Active" : "ICS-Only Mode"}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--text-muted)] max-w-[55ch]">
                        Launch a local Playwright browser to capture SSO cookies for deep rubrics, announcements, and course files. Fails back gracefully to .ics-only polling if skipped or expired.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={ssoLaunching}
                      onClick={handleLaunchCanvasSso}
                      className="px-3.5 py-2 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] transition-colors flex items-center gap-1.5 shrink-0 cursor-pointer disabled:opacity-50"
                    >
                      <ExternalLink className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                      <span>{ssoLaunching ? "Launching..." : "Launch Browser SSO Login"}</span>
                    </button>
                  </div>

                  {/* Optional Syllabi / Course Notes RAG Upload */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] space-y-3">
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        Upload Syllabi or Course Notes (.md, .txt)
                      </h3>
                      <p className="text-xs text-[var(--text-muted)]">
                        Optional: index course policies, grading breakdowns, and exam schedules into local pgvector RAG.
                      </p>
                    </div>

                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
                      <input
                        type="text"
                        value={syllabusCourse}
                        onChange={(e) => setSyllabusCourse(e.target.value)}
                        placeholder="Course code (optional, e.g. CS 3114)"
                        className={`${inputClass} sm:w-56`}
                      />

                      <label className="px-3.5 py-2 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] transition-colors flex items-center justify-center gap-2 cursor-pointer">
                        {syllabusUploading ? (
                          <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary)]" />
                        ) : (
                          <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                        )}
                        <span>{syllabusUploading ? "Indexing..." : "Choose .md or .txt File"}</span>
                        <input
                          type="file"
                          accept=".md,.txt,text/markdown,text/plain"
                          onChange={handleSyllabusUpload}
                          disabled={syllabusUploading}
                          className="sr-only"
                        />
                      </label>
                    </div>

                    {syllabusFeedback && (
                      <div
                        className={`px-3 py-2 rounded-md border text-xs flex items-center gap-2 ${
                          syllabusFeedback.type === "success"
                            ? "border-[var(--semantic-success)]/35 bg-[var(--semantic-success)]/10 text-[var(--semantic-success)]"
                            : "border-[var(--semantic-danger)]/35 bg-[var(--semantic-danger)]/10 text-[var(--semantic-danger)]"
                        }`}
                      >
                        {syllabusFeedback.type === "success" ? (
                          <FileText className="w-3.5 h-3.5 shrink-0" />
                        ) : (
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                        )}
                        <span>{syllabusFeedback.text}</span>
                      </div>
                    )}
                  </div>

                  {/* Step 2 Navigation */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveStep(1)}
                      className="px-3.5 py-2 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveStep(3)}
                      className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Continue to Calendars</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* STEP 3: CALENDARS (GOOGLE, APPLE, OUTLOOK & .ICS)            */}
              {/* ============================================================ */}
              {activeStep === 3 && (
                <div className="space-y-7">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
                      External Calendars & Feeds
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] max-w-[65ch]">
                      Subscribe to read-only calendar feeds or import `.ics` schedules. Background polling never alters your external calendar events.
                    </p>
                  </div>

                  {/* Provider Segmented Tabs */}
                  <div className="flex flex-wrap items-center gap-1 p-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-base)]">
                    {(
                      [
                        { id: "google", label: "Google Calendar" },
                        { id: "apple", label: "Apple Calendar (iCloud)" },
                        { id: "outlook", label: "Outlook / Other URL" },
                        { id: "upload", label: "Upload .ics File" },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => handleTabSwitch(tab.id)}
                        className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                          calendarTab === tab.id
                            ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)]"
                            : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {feedFeedback && (
                    <div
                      className={`px-3.5 py-2.5 rounded-md border text-xs flex items-center gap-2 ${
                        feedFeedback.type === "success"
                          ? "border-[var(--semantic-success)]/35 bg-[var(--semantic-success)]/10 text-[var(--semantic-success)]"
                          : "border-[var(--semantic-danger)]/35 bg-[var(--semantic-danger)]/10 text-[var(--semantic-danger)]"
                      }`}
                    >
                      {feedFeedback.type === "success" ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                      ) : (
                        <AlertCircle className="w-4 h-4 shrink-0" />
                      )}
                      <span>{feedFeedback.text}</span>
                    </div>
                  )}

                  {/* TAB: GOOGLE CALENDAR */}
                  {calendarTab === "google" && (
                    <div className="space-y-6">
                      <form
                        onSubmit={(e) => handleConnectFeed(e, "google")}
                        className="space-y-4"
                      >
                        <div className="space-y-1">
                          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                            Google Secret iCal Address (Recommended)
                          </h3>
                          <p className="text-xs text-[var(--text-muted)]">
                            Open Google Calendar → Settings → Select calendar → Integrate calendar → Copy &ldquo;Secret address in iCal format&rdquo;.
                          </p>
                        </div>

                        <div>
                          <label htmlFor="feed-google-url" className={labelClass}>
                            Secret Address in iCal Format
                          </label>
                          <input
                            id="feed-google-url"
                            type="url"
                            value={feedUrlInput}
                            onChange={(e) => setFeedUrlInput(e.target.value)}
                            placeholder="https://calendar.google.com/calendar/ical/.../private-.../basic.ics"
                            className={`${inputClass} font-mono`}
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div>
                            <label htmlFor="feed-google-name" className={labelClass}>
                              Calendar Name
                            </label>
                            <input
                              id="feed-google-name"
                              type="text"
                              value={feedNameInput}
                              onChange={(e) => setFeedNameInput(e.target.value)}
                              placeholder="Google Calendar"
                              className={inputClass}
                            />
                          </div>

                          <div>
                            <span className={labelClass}>Color</span>
                            <div className="flex items-center gap-2 h-[34px]">
                              {FEED_COLORS.map((c) => (
                                <button
                                  key={c.hex}
                                  type="button"
                                  onClick={() => setFeedColorInput(c.hex)}
                                  title={c.label}
                                  className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                                    feedColorInput === c.hex
                                      ? "scale-110 ring-2 ring-[var(--accent-primary)] ring-offset-2 ring-offset-[var(--bg-elevated)] border-white/40"
                                      : "border-[var(--border-hairline)] opacity-80 hover:opacity-100"
                                  }`}
                                  style={{ backgroundColor: c.hex }}
                                />
                              ))}
                              <input
                                type="color"
                                value={feedColorInput}
                                onChange={(e) => setFeedColorInput(e.target.value)}
                                aria-label="Custom feed color"
                                className="w-7 h-7 rounded bg-transparent border border-[var(--border-hairline)] cursor-pointer p-0.5"
                              />
                            </div>
                          </div>
                        </div>

                        <button
                          type="submit"
                          disabled={addingFeed}
                          className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <Link2 className="w-3.5 h-3.5" />
                          <span>{addingFeed ? "Connecting..." : "Connect & Sync"}</span>
                        </button>
                      </form>

                      {/* Optional Google Workspace OAuth */}
                      <div className="pt-6 border-t border-[var(--border-hairline)] space-y-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                              Optional Google Workspace OAuth (credentials.json)
                            </h3>
                            <p className="text-xs text-[var(--text-muted)]">
                              {googleSyncStatus?.message || "Required only for two-way Google Calendar & Tasks sync."}
                            </p>
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-mono border ${
                              googleSyncStatus?.google_configured
                                ? "border-[var(--semantic-success)]/35 bg-[var(--semantic-success)]/12 text-[var(--semantic-success)]"
                                : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)]"
                            }`}
                          >
                            {googleSyncStatus?.google_configured ? "Configured" : "Not Configured"}
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-3">
                          <label className="px-3.5 py-2 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] transition-colors flex items-center gap-2 cursor-pointer">
                            {uploadingGoogleCreds ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin text-[var(--accent-primary)]" />
                            ) : (
                              <Upload className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                            )}
                            <span>
                              {uploadingGoogleCreds ? "Uploading..." : "Upload credentials.json"}
                            </span>
                            <input
                              type="file"
                              accept=".json,application/json"
                              onChange={handleGoogleCredsUpload}
                              disabled={uploadingGoogleCreds}
                              className="sr-only"
                            />
                          </label>

                          <button
                            type="button"
                            disabled={triggeringGoogleSync}
                            onClick={handleTriggerGoogleSync}
                            className="px-3.5 py-2 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <RefreshCw className={`w-3.5 h-3.5 ${triggeringGoogleSync ? "animate-spin" : ""}`} />
                            <span>
                              {triggeringGoogleSync ? "Syncing..." : "Sync Google Workspace"}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* TAB: APPLE CALENDAR (ICLOUD) */}
                  {calendarTab === "apple" && (
                    <form
                      onSubmit={(e) => handleConnectFeed(e, "apple")}
                      className="space-y-4"
                    >
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          Apple Calendar (iCloud Public Link)
                        </h3>
                        <p className="text-xs text-[var(--text-muted)]">
                          iCloud Calendar or macOS Calendar → Share Calendar → Public Calendar → Copy Link. Links beginning with <code className="font-mono text-[11px] text-[var(--text-primary)]">webcal://</code> are automatically normalized to <code className="font-mono text-[11px] text-[var(--text-primary)]">https://</code>.
                        </p>
                      </div>

                      <div>
                        <label htmlFor="feed-apple-url" className={labelClass}>
                          iCloud Calendar URL (webcal:// or https://)
                        </label>
                        <input
                          id="feed-apple-url"
                          type="text"
                          value={feedUrlInput}
                          onChange={(e) => setFeedUrlInput(e.target.value)}
                          placeholder="webcal://p01-calendars.icloud.com/published/2/..."
                          className={`${inputClass} font-mono`}
                        />
                        {feedUrlInput.trim().toLowerCase().startsWith("webcal://") && (
                          <p className="text-[11px] font-mono text-[var(--accent-primary)] mt-1">
                            Will connect as: {normalizeWebcalUrl(feedUrlInput)}
                          </p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="feed-apple-name" className={labelClass}>
                            Calendar Name
                          </label>
                          <input
                            id="feed-apple-name"
                            type="text"
                            value={feedNameInput}
                            onChange={(e) => setFeedNameInput(e.target.value)}
                            placeholder="Apple iCloud Calendar"
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <span className={labelClass}>Color</span>
                          <div className="flex items-center gap-2 h-[34px]">
                            {FEED_COLORS.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => setFeedColorInput(c.hex)}
                                title={c.label}
                                className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                                  feedColorInput === c.hex
                                    ? "scale-110 ring-2 ring-[var(--accent-primary)] ring-offset-2 ring-offset-[var(--bg-elevated)] border-white/40"
                                    : "border-[var(--border-hairline)] opacity-80 hover:opacity-100"
                                }`}
                                style={{ backgroundColor: c.hex }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={addingFeed}
                        className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>{addingFeed ? "Connecting..." : "Connect & Sync"}</span>
                      </button>
                    </form>
                  )}

                  {/* TAB: OUTLOOK / OTHER URL */}
                  {calendarTab === "outlook" && (
                    <form
                      onSubmit={(e) => handleConnectFeed(e, outlookProviderChoice)}
                      className="space-y-4"
                    >
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          Outlook or Any .ics / webcal:// Feed
                        </h3>
                        <p className="text-xs text-[var(--text-muted)]">
                          Outlook Web → Settings → Calendar → Shared calendars → Publish a calendar → Copy ICS link, or paste any standard .ics subscription feed.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setOutlookProviderChoice("outlook")}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer ${
                            outlookProviderChoice === "outlook"
                              ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/12 text-[var(--text-primary)]"
                              : "border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-muted)]"
                          }`}
                        >
                          Outlook / Office 365
                        </button>
                        <button
                          type="button"
                          onClick={() => setOutlookProviderChoice("ics_url")}
                          className={`px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer ${
                            outlookProviderChoice === "ics_url"
                              ? "border-[var(--accent-primary)] bg-[var(--accent-primary)]/12 text-[var(--text-primary)]"
                              : "border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-muted)]"
                          }`}
                        >
                          Other .ics URL
                        </button>
                      </div>

                      <div>
                        <label htmlFor="feed-outlook-url" className={labelClass}>
                          Subscription Feed URL (.ics or webcal://)
                        </label>
                        <input
                          id="feed-outlook-url"
                          type="text"
                          value={feedUrlInput}
                          onChange={(e) => setFeedUrlInput(e.target.value)}
                          placeholder="https://outlook.office365.com/owa/calendar/.../reachcalendar.ics"
                          className={`${inputClass} font-mono`}
                        />
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                          <label htmlFor="feed-outlook-name" className={labelClass}>
                            Calendar Name
                          </label>
                          <input
                            id="feed-outlook-name"
                            type="text"
                            value={feedNameInput}
                            onChange={(e) => setFeedNameInput(e.target.value)}
                            placeholder="Work / Outlook Schedule"
                            className={inputClass}
                          />
                        </div>

                        <div>
                          <span className={labelClass}>Color</span>
                          <div className="flex items-center gap-2 h-[34px]">
                            {FEED_COLORS.map((c) => (
                              <button
                                key={c.hex}
                                type="button"
                                onClick={() => setFeedColorInput(c.hex)}
                                title={c.label}
                                className={`w-5 h-5 rounded-full border transition-transform cursor-pointer ${
                                  feedColorInput === c.hex
                                    ? "scale-110 ring-2 ring-[var(--accent-primary)] ring-offset-2 ring-offset-[var(--bg-elevated)] border-white/40"
                                    : "border-[var(--border-hairline)] opacity-80 hover:opacity-100"
                                }`}
                                style={{ backgroundColor: c.hex }}
                              />
                            ))}
                          </div>
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={addingFeed}
                        className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Link2 className="w-3.5 h-3.5" />
                        <span>{addingFeed ? "Connecting..." : "Connect & Sync"}</span>
                      </button>
                    </form>
                  )}

                  {/* TAB: UPLOAD .ICS FILE */}
                  {calendarTab === "upload" && (
                    <div className="space-y-4">
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                          Import Local .ics File
                        </h3>
                        <p className="text-xs text-[var(--text-muted)]">
                          Import a one-time snapshot exported from Apple Calendar, Google Calendar, Outlook, or university timetable tools.
                        </p>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                        <div>
                          <label htmlFor="ics-upload-name" className={labelClass}>
                            Target Calendar Name
                          </label>
                          <input
                            id="ics-upload-name"
                            type="text"
                            value={icsCalendarName}
                            onChange={(e) => setIcsCalendarName(e.target.value)}
                            placeholder="Imported Schedule"
                            className={inputClass}
                          />
                        </div>

                        <label className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 transition-opacity flex items-center justify-center gap-2 cursor-pointer">
                          {icsUploading ? (
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Upload className="w-3.5 h-3.5" />
                          )}
                          <span>{icsUploading ? "Importing..." : "Select & Import .ics File"}</span>
                          <input
                            type="file"
                            accept=".ics,text/calendar"
                            onChange={handleIcsFileUpload}
                            disabled={icsUploading}
                            className="sr-only"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Connected Calendar Feeds List */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        Connected Calendar Feeds ({feeds.length})
                      </h3>

                      {feeds.length > 0 && (
                        <button
                          type="button"
                          disabled={syncingAllFeeds || feedsLoading}
                          onClick={handleSyncAllFeeds}
                          className="px-3 py-1 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--text-primary)] transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${syncingAllFeeds ? "animate-spin text-[var(--accent-primary)]" : ""}`} />
                          <span>{syncingAllFeeds ? "Syncing All..." : "Sync All"}</span>
                        </button>
                      )}
                    </div>

                    {feeds.length === 0 ? (
                      <div className="py-6 px-4 rounded-md border border-dashed border-[var(--border-hairline)] text-center text-xs text-[var(--text-muted)]">
                        No external calendar feeds connected yet. Add one using the tabs above.
                      </div>
                    ) : (
                      <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] divide-y divide-[var(--border-hairline)]">
                        {feeds.map((feed) => (
                          <div
                            key={feed.id}
                            className="px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="min-w-0 space-y-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span
                                  className="w-2.5 h-2.5 rounded-full shrink-0"
                                  style={{ backgroundColor: feed.color || "var(--accent-primary)" }}
                                />
                                <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                  {feed.name}
                                </span>
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                                  {PROVIDER_LABELS[feed.provider] || feed.provider}
                                </span>
                              </div>

                              <div className="flex items-center gap-3 text-[11px] text-[var(--text-muted)] flex-wrap">
                                <span className="font-mono tabular-nums">
                                  {feed.last_event_count ?? 0} events
                                </span>
                                <span>
                                  {feed.last_synced_at
                                    ? `Synced ${new Date(feed.last_synced_at).toLocaleString([], {
                                        month: "short",
                                        day: "numeric",
                                        hour: "numeric",
                                        minute: "2-digit",
                                      })}`
                                    : "Not synced yet"}
                                </span>
                              </div>

                              {feed.last_error && (
                                <p className="text-[11px] text-[var(--semantic-danger)]">
                                  {feed.last_error}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              <button
                                type="button"
                                disabled={syncingFeedId === feed.id}
                                onClick={() => handleSyncSingleFeed(feed.id)}
                                className="px-2.5 py-1 rounded text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                                title="Re-sync this feed"
                              >
                                <RefreshCw
                                  className={`w-3 h-3 ${
                                    syncingFeedId === feed.id ? "animate-spin text-[var(--accent-primary)]" : ""
                                  }`}
                                />
                                <span>Re-sync</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDeleteFeed(feed.id)}
                                className="p-1.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--semantic-danger)] hover:border-[var(--semantic-danger)]/40 transition-colors cursor-pointer"
                                title="Remove calendar feed"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Subtle Clear Sample Seed Data with 2-Step Confirmation */}
                  <div className="pt-5 border-t border-[var(--border-hairline)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="text-xs text-[var(--text-muted)]">
                      {confirmClearStep
                        ? "Remove sample seed events and assignments? Your profile and connected feeds remain intact."
                        : "Replace sample seed data once your real calendars and Canvas feed are connected."}
                    </div>

                    {!confirmClearStep ? (
                      <button
                        type="button"
                        onClick={() => setConfirmClearStep(true)}
                        className="px-3 py-1.5 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--semantic-danger)] border border-[var(--border-hairline)] hover:border-[var(--semantic-danger)]/40 transition-colors shrink-0 cursor-pointer"
                      >
                        Clear Sample Seed Data
                      </button>
                    ) : (
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setConfirmClearStep(false)}
                          className="px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={clearingSample}
                          onClick={handleClearSampleData}
                          className="px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--semantic-danger)] text-white hover:opacity-90 cursor-pointer disabled:opacity-50"
                        >
                          {clearingSample ? "Clearing..." : "Confirm Clear"}
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Step 3 Navigation */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] flex items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveStep(2)}
                      className="px-3.5 py-2 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveStep(4)}
                      className="px-4 py-2 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Continue to Nutrition</span>
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}

              {/* ============================================================ */}
              {/* STEP 4: NUTRITION & FINALIZE                                 */}
              {/* ============================================================ */}
              {activeStep === 4 && (
                <div className="space-y-7">
                  <div className="space-y-1">
                    <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
                      Nutrition & Finalize
                    </h2>
                    <p className="text-xs text-[var(--text-muted)] max-w-[65ch]">
                      Set your daily energy and macronutrient targets, review integration readiness, and launch your workspace.
                    </p>
                  </div>

                  {/* Macro Target Fields */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div>
                      <label htmlFor="setup-kcal" className={labelClass}>
                        Daily Calories (kcal)
                      </label>
                      <input
                        id="setup-kcal"
                        type="number"
                        min={800}
                        max={8000}
                        value={form.daily_calories_target}
                        onChange={(e) =>
                          setForm({ ...form, daily_calories_target: Number(e.target.value) || 0 })
                        }
                        className={`${inputClass} font-mono tabular-nums`}
                      />
                    </div>

                    <div>
                      <label htmlFor="setup-protein" className={labelClass}>
                        Protein (g)
                      </label>
                      <input
                        id="setup-protein"
                        type="number"
                        min={20}
                        max={500}
                        value={form.daily_protein_g}
                        onChange={(e) =>
                          setForm({ ...form, daily_protein_g: Number(e.target.value) || 0 })
                        }
                        className={`${inputClass} font-mono tabular-nums`}
                      />
                    </div>

                    <div>
                      <label htmlFor="setup-carbs" className={labelClass}>
                        Carbs (g)
                      </label>
                      <input
                        id="setup-carbs"
                        type="number"
                        min={0}
                        max={1000}
                        value={form.daily_carbs_g}
                        onChange={(e) =>
                          setForm({ ...form, daily_carbs_g: Number(e.target.value) || 0 })
                        }
                        className={`${inputClass} font-mono tabular-nums`}
                      />
                    </div>

                    <div>
                      <label htmlFor="setup-fats" className={labelClass}>
                        Fats (g)
                      </label>
                      <input
                        id="setup-fats"
                        type="number"
                        min={0}
                        max={400}
                        value={form.daily_fats_g}
                        onChange={(e) =>
                          setForm({ ...form, daily_fats_g: Number(e.target.value) || 0 })
                        }
                        className={`${inputClass} font-mono tabular-nums`}
                      />
                    </div>
                  </div>

                  <div>
                    <label htmlFor="setup-dietary-notes" className={labelClass}>
                      Dietary Notes & Restrictions
                    </label>
                    <textarea
                      id="setup-dietary-notes"
                      rows={3}
                      value={form.dietary_notes}
                      onChange={(e) => setForm({ ...form, dietary_notes: e.target.value })}
                      placeholder="e.g. High-protein lean bulk, no beef, prefer meal prep on Sundays"
                      className={`${inputClass} resize-none leading-relaxed`}
                    />
                  </div>

                  {/* BYO Gemini API Key (Optional) */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3 className="text-sm font-semibold text-[var(--text-primary)] flex items-center gap-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                          <span>AI & Gemini API Key (Optional)</span>
                        </h3>
                        <p className="text-xs text-[var(--text-muted)] mt-0.5">
                          Used to summarize assignments and organize specifications into General, Deliverables, and Rubric sections. Cached per assignment & throttled to stay within the Google AI Studio Free Tier.
                        </p>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded text-[11px] font-mono border shrink-0 ${
                          form.has_gemini_api_key
                            ? "bg-emerald-500/12 text-emerald-400 border-emerald-500/30"
                            : "bg-[var(--bg-base)] text-[var(--text-muted)] border-[var(--border-hairline)]"
                        }`}
                      >
                        {form.gemini_api_key_source === "profile"
                          ? `Workspace Key (${form.gemini_api_key_masked})`
                          : form.gemini_api_key_source === "env"
                          ? `Configured via .env (${form.gemini_api_key_masked})`
                          : "Local Parser Fallback"}
                      </span>
                    </div>

                    <div className="flex flex-col sm:flex-row gap-2">
                      <input
                        type="password"
                        value={geminiKeyInput}
                        onChange={(e) => setGeminiKeyInput(e.target.value)}
                        placeholder={
                          form.has_gemini_api_key
                            ? "Enter new AIza... key to override workspace key"
                            : "Paste your free Google AI Studio API key (AIza...)"
                        }
                        className={`${inputClass} flex-1 font-mono`}
                      />
                      <button
                        type="button"
                        disabled={savingGeminiKey || !geminiKeyInput.trim()}
                        onClick={handleSaveGeminiKey}
                        className="px-3.5 py-2 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 disabled:opacity-50 cursor-pointer shrink-0"
                      >
                        {savingGeminiKey ? "Saving..." : "Save Key"}
                      </button>
                      {form.gemini_api_key_source === "profile" && (
                        <button
                          type="button"
                          disabled={savingGeminiKey}
                          onClick={handleClearGeminiKey}
                          className="px-3 py-2 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--semantic-danger)] cursor-pointer shrink-0"
                        >
                          Clear Key
                        </button>
                      )}
                    </div>

                    {geminiKeyNotice && (
                      <p
                        className={`text-xs ${
                          geminiKeyNotice.type === "error"
                            ? "text-[var(--semantic-danger)]"
                            : "text-emerald-400"
                        }`}
                      >
                        {geminiKeyNotice.text}
                      </p>
                    )}
                  </div>

                  {/* Readiness Summary */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] space-y-3">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                      Readiness Summary
                    </h3>

                    <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] divide-y divide-[var(--border-hairline)] text-xs">
                      <div className="px-4 py-3 flex items-center justify-between gap-4">
                        <span className="text-[var(--text-muted)]">Identity & Term</span>
                        <span className="text-[var(--text-primary)] font-medium text-right">
                          {[form.full_name || "Unset", form.institution, form.term_label]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </div>

                      <div className="px-4 py-3 flex items-center justify-between gap-4">
                        <span className="text-[var(--text-muted)]">Location & Timezone</span>
                        <span className="text-[var(--text-primary)] font-mono text-[11px] text-right">
                          {[form.city, form.region].filter(Boolean).join(", ") || "City unset"} ·{" "}
                          {form.timezone}
                        </span>
                      </div>

                      <div className="px-4 py-3 flex items-center justify-between gap-4">
                        <span className="text-[var(--text-muted)]">Canvas LMS</span>
                        <span className="text-[var(--text-primary)] font-mono text-[11px] text-right truncate max-w-[320px]">
                          {form.canvas_ics_url.trim()
                            ? `${form.canvas_base_url} (.ics linked)`
                            : `${form.canvas_base_url} (No .ics feed yet)`}
                        </span>
                      </div>

                      <div className="px-4 py-3 flex items-center justify-between gap-4">
                        <span className="text-[var(--text-muted)]">Connected Calendars</span>
                        <span className="text-[var(--text-primary)] font-mono tabular-nums text-[11px]">
                          {feeds.length} feed{feeds.length === 1 ? "" : "s"}
                          {googleSyncStatus?.google_configured ? " + Google Workspace OAuth" : ""}
                        </span>
                      </div>

                      <div className="px-4 py-3 flex items-center justify-between gap-4">
                        <span className="text-[var(--text-muted)]">Daily Macro Floor</span>
                        <span className="text-[var(--text-primary)] font-mono tabular-nums text-[11px]">
                          {form.daily_calories_target} kcal · {form.daily_protein_g}g P ·{" "}
                          {form.daily_carbs_g}g C · {form.daily_fats_g}g F
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Step 4 Actions */}
                  <div className="pt-6 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => setActiveStep(3)}
                      className="px-3.5 py-2 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] flex items-center gap-1.5 cursor-pointer"
                    >
                      <ArrowLeft className="w-3.5 h-3.5" />
                      <span>Back</span>
                    </button>

                    <button
                      type="button"
                      disabled={saving}
                      onClick={handleCompleteOnboarding}
                      className="px-5 py-2.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 transition-opacity flex items-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      <span>
                        {saving ? "Completing Setup..." : "Complete Setup & Open Daily Brief"}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
