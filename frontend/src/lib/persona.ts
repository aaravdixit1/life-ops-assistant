/**
 * Persona profile configuration.
 *
 * In standalone demo mode or when no private profile is supplied via env,
 * identity defaults strictly to the fictional persona "Alex Chen".
 * Real personal data is never hardcoded in source code, fixtures, or demo bundles.
 */

const isDemo =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  process.env.NEXT_PUBLIC_DEMO_MODE === "1";

const name = isDemo ? "Alex Chen" : process.env.NEXT_PUBLIC_USER_NAME || "Alex Chen";
const firstName = isDemo ? "Alex" : process.env.NEXT_PUBLIC_USER_FIRST_NAME || "Alex";
const initials = isDemo ? "AC" : process.env.NEXT_PUBLIC_USER_INITIALS || "AC";
const termLabel = isDemo ? "Fall 2026 Ops" : process.env.NEXT_PUBLIC_TERM_LABEL || "Fall 2026 Ops";
const academicProfile = isDemo ? "Tech Institute · Fall 2026" : process.env.NEXT_PUBLIC_ACADEMIC_PROFILE || "Tech Institute · Fall 2026";
const campusTown = isDemo ? "Campus District" : process.env.NEXT_PUBLIC_CAMPUS_TOWN || "Campus District";
const canvasUrl = isDemo ? "https://canvas.instructure.com" : process.env.NEXT_PUBLIC_CANVAS_URL || "https://canvas.instructure.com";
const studySanctuary = isDemo ? "The Daily Grind Cafe & Roastery" : process.env.NEXT_PUBLIC_STUDY_SANCTUARY || "The Daily Grind Cafe & Roastery";
const newsDispatch = isDemo ? "The Campus Dispatch" : process.env.NEXT_PUBLIC_NEWS_DISPATCH || "The Campus Dispatch";
const healthHeadline = isDemo
  ? "Alex Chen · 5'10\", 165 lbs · Lean-Bulk Architecture (High Protein, Macro Balanced)"
  : process.env.NEXT_PUBLIC_HEALTH_HEADLINE || "Alex Chen · 5'10\", 165 lbs · Lean-Bulk Architecture (High Protein, Macro Balanced)";
const careerHeadline = isDemo
  ? "Alex Chen · Systems & SWE Internship Architecture · Summer 2027 Cycle"
  : process.env.NEXT_PUBLIC_CAREER_HEADLINE || "Alex Chen · Systems & SWE Internship Architecture · Summer 2027 Cycle";

export const PERSONA = {
  name,
  firstName,
  initials,
  termLabel,
  academicProfile,
  scheduleMonthlyHeadline: `${name} · ${termLabel} · Monthly Overview & Deadlines`,
  scheduleWeeklyHeadline: (range: string) => `${name} · ${termLabel} · ${range}`,
  healthHeadline,
  careerHeadline,
  assistantGreeting: `Good morning, ${firstName}. How can I help you today?\n\nAsk me anything about your schedule, upcoming deadlines, or reading shelf—or let me know if you want to block out focus time or remember a new preference.`,
  appTitle: `Life-Ops Assistant · ${name} (${termLabel})`,
  canvasUrl,
  campusTown,
  studySanctuary,
  newsDispatch,
};
