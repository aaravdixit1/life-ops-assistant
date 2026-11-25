/**
 * Formatting and cleanup utilities for calm, readable UI
 */

export function cleanAssignmentTitle(rawTitle: string): string {
  if (!rawTitle) return "";
  return rawTitle
    .replace(/\s*(\([A-Za-z0-9_\s-]+\)|\[[^\]]+\])\s*$/g, "")
    .replace(/\s*(\([A-Za-z0-9_\s-]+\)|\[[A-Za-z0-9_\s-]+\])/g, "")
    .trim();
}

export function formatTime(isoString?: string): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
}

export function formatDate(isoString?: string): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function formatDateTime(isoString?: string): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  const weekday = d.toLocaleDateString("en-US", { weekday: "short" });
  const monthDay = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${weekday}, ${monthDay} · ${time}`;
}

export function formatDaysRemaining(isoString?: string): string {
  if (!isoString) return "";
  const target = new Date(isoString);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();
  const targetMidnight = new Date(target.getFullYear(), target.getMonth(), target.getDate()).getTime();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((targetMidnight - nowMidnight) / (1000 * 60 * 60 * 24));

  if (diffMs < 0) {
    const overdueHours = Math.round(Math.abs(diffMs) / (1000 * 60 * 60));
    if (overdueHours < 1) return "Overdue just now";
    if (overdueHours < 24) return `Overdue by ${overdueHours}h`;
    return `Overdue by ${Math.round(overdueHours / 24)}d`;
  }

  const hoursLeft = Math.round(diffMs / (1000 * 60 * 60));
  if (hoursLeft < 1) {
    const minsLeft = Math.max(1, Math.round(diffMs / (1000 * 60)));
    return `Due in ${minsLeft}m`;
  }
  if (diffDays === 0) {
    return `Due in ${hoursLeft}h (Today)`;
  }
  if (diffDays === 1) {
    return `Due tomorrow (${hoursLeft}h)`;
  }
  return `in ${diffDays}d`;
}

export function formatTimeUntil(targetIso?: string): string {
  if (!targetIso) return "";
  const target = new Date(targetIso);
  const now = new Date();
  const diffMs = target.getTime() - now.getTime();

  if (diffMs <= 0) return "Now";
  const mins = Math.floor(diffMs / (1000 * 60));
  const hours = Math.floor(mins / 60);
  const remMins = mins % 60;

  if (hours === 0) return `in ${mins}m`;
  if (remMins === 0) return `in ${hours}h`;
  return `in ${hours}h ${remMins}m`;
}

export function toInputDate(isoString?: string): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function toInputTime(isoString?: string): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  const hours = String(d.getHours()).padStart(2, "0");
  const minutes = String(d.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function fromInputDateTime(dateStr: string, timeStr: string): string {
  const d = new Date(`${dateStr}T${timeStr}:00`);
  return d.toISOString();
}

