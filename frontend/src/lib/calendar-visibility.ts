/**
 * Shared client-side calendar visibility filter (Google Calendar-style toggle).
 * Persists hidden calendar IDs in localStorage and broadcasts updates across pages.
 */

const STORAGE_KEY = "lifeops-hidden-calendars:v1";

export function getCalendarKey(item: { calendar_id?: string | null; calendar_name?: string | null }): string {
  return (item.calendar_id || item.calendar_name || "primary").trim() || "primary";
}

export function getHiddenCalendarIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function setHiddenCalendarIds(ids: string[]): void {
  if (typeof window === "undefined") return;
  try {
    const unique = Array.from(new Set(ids));
    if (unique.length === 0) {
      localStorage.removeItem(STORAGE_KEY);
    } else {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(unique));
    }
    window.dispatchEvent(new Event("lifeops-calendar-filter-changed"));
  } catch {
    // Ignore storage quota errors
  }
}

export function toggleCalendarVisibility(calendarId: string): string[] {
  const current = new Set(getHiddenCalendarIds());
  if (current.has(calendarId)) {
    current.delete(calendarId);
  } else {
    current.add(calendarId);
  }
  const next = Array.from(current);
  setHiddenCalendarIds(next);
  return next;
}

export function isCalendarVisible(
  event: { calendar_id?: string | null; calendar_name?: string | null },
  hiddenIds: string[]
): boolean {
  if (!hiddenIds || hiddenIds.length === 0) return true;
  const key = getCalendarKey(event);
  return !hiddenIds.includes(key);
}
