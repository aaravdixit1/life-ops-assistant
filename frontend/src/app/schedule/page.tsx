"use client";

import React, { useState, useEffect, useRef, useMemo } from "react";
import {
  Calendar as CalendarIcon,
  Download,
  Upload,
  ShieldAlert,
  History,
  X,
  Clock,
  MapPin,
  ArrowRight,
  Check,
  AlertTriangle,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Eye,
} from "lucide-react";
import {
  getCalendarEvents,
  getCalendars,
  deleteCalendarById,
  getPendingActions,
  approveAction,
  rejectAction,
  getAutopilotLogs,
  undoAutopilotAction,
  requestAdjustment,
  exportIcsCalendar,
  importIcsCalendar,
} from "@/lib/api";
import {
  getCalendarKey,
  getHiddenCalendarIds,
  setHiddenCalendarIds,
  toggleCalendarVisibility,
  isCalendarVisible,
} from "@/lib/calendar-visibility";
import { useProfile } from "@/components/profile-provider";
import { formatTime, formatDate, formatDateTime, toInputDate } from "@/lib/formatters";
import { EventDetailModal, AddEventModal } from "@/components/calendar/event-modals";
import { AssignmentDetailModal, AcademicAssignment } from "@/components/academics/assignment-modal";

function formatDateToIso(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekDays(anchorDate: Date) {
  const d = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), anchorDate.getDate());
  const day = d.getDay(); // 0 is Sunday, 1 is Monday...
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diffToMonday);

  return Array.from({ length: 7 }, (_, i) => {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    const isoDate = formatDateToIso(current);
    const dateStr = current.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const name = current.toLocaleDateString("en-US", { weekday: "long" });
    const short = current.toLocaleDateString("en-US", { weekday: "short" });
    return { name, short, dateStr, isoDate, dayIdx: i, fullDate: current };
  });
}

function getMonthGridDays(anchorDate: Date) {
  const year = anchorDate.getFullYear();
  const month = anchorDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);

  // Monday = 0, Sunday = 6
  const firstDayWeekday = (firstDayOfMonth.getDay() + 6) % 7;

  const days: {
    isoDate: string;
    dayNumber: number;
    isCurrentMonth: boolean;
    fullDate: Date;
  }[] = [];

  // Leading days from previous month
  for (let i = firstDayWeekday - 1; i >= 0; i--) {
    const prevDate = new Date(year, month, -i);
    days.push({
      isoDate: formatDateToIso(prevDate),
      dayNumber: prevDate.getDate(),
      isCurrentMonth: false,
      fullDate: prevDate,
    });
  }

  // Days of current month
  for (let d = 1; d <= lastDayOfMonth.getDate(); d++) {
    const currentDate = new Date(year, month, d);
    days.push({
      isoDate: formatDateToIso(currentDate),
      dayNumber: d,
      isCurrentMonth: true,
      fullDate: currentDate,
    });
  }

  // Trailing days to fill the final week (multiple of 7)
  const remainder = days.length % 7;
  if (remainder !== 0) {
    const daysToAdd = 7 - remainder;
    for (let d = 1; d <= daysToAdd; d++) {
      const nextDate = new Date(year, month + 1, d);
      days.push({
        isoDate: formatDateToIso(nextDate),
        dayNumber: d,
        isCurrentMonth: false,
        fullDate: nextDate,
      });
    }
  }

  return days;
}

const START_HOUR = 6;
const END_HOUR = 24;
const TOTAL_HOURS = END_HOUR - START_HOUR;
const HOUR_HEIGHT = 44;
const TOTAL_HEIGHT = TOTAL_HOURS * HOUR_HEIGHT;
const HOURS = Array.from({ length: TOTAL_HOURS + 1 }, (_, i) => START_HOUR + i);

const formatHourLabel = (h: number) => {
  if (h === 0 || h === 24) return "12 AM";
  if (h === 12) return "12 PM";
  return h < 12 ? `${h} AM` : `${h - 12} PM`;
};

function isCanvasEvent(ev: any): boolean {
  return ev?.source === "canvas_inferred" || ev?.calendar_id === "canvas_deadlines";
}

function isAllDayEvent(ev: any): boolean {
  return Boolean(
    ev?.start_time &&
      ev?.end_time &&
      new Date(ev.end_time).getTime() - new Date(ev.start_time).getTime() >= 23 * 3600 * 1000
  );
}

function isBannerEvent(ev: any): boolean {
  return isCanvasEvent(ev) || isAllDayEvent(ev);
}

function getEventDisplayTime(ev: any): string {
  if (isAllDayEvent(ev)) return "All day";
  if (isCanvasEvent(ev)) return formatTime(ev.end_time || ev.start_time);
  return formatTime(ev.start_time);
}

export default function SchedulePage() {
  const { displayName, termLabel } = useProfile();
  const [events, setEvents] = useState<any[]>([]);
  const [calendars, setCalendars] = useState<
    Array<{
      calendar_id: string;
      calendar_name: string;
      color: string;
      source?: string;
      event_count: number;
      feed_id?: string | null;
      provider?: string | null;
    }>
  >([]);
  const [hiddenCalendarIds, setHiddenCalIds] = useState<string[]>([]);
  const [confirmRemoveCalId, setConfirmRemoveCalId] = useState<string | null>(null);
  const [removingCalId, setRemovingCalId] = useState<string | null>(null);
  const [pendingActions, setPendingActions] = useState<any[]>([]);
  const [autopilotLogs, setAutopilotLogs] = useState<any[]>([]);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [drawerTab, setDrawerTab] = useState<"pending" | "logs">("pending");
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<AcademicAssignment | null>(null);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date("2026-11-13T12:00:00"));
  const currentDateRef = useRef<Date>(currentDate);
  currentDateRef.current = currentDate;
  const [nowIsoDate, setNowIsoDate] = useState<string>("");
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalInitialDate, setAddModalInitialDate] = useState<string | undefined>(undefined);
  const [shiftMsg, setShiftMsg] = useState<string | null>(null);
  const [shiftingId, setShiftingId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<"weekdays" | "full" | "month">("weekdays");
  const [isWeekendOpen, setIsWeekendOpen] = useState(false);
  const [expandedBannerDays, setExpandedBannerDays] = useState<Record<string, boolean>>({});
  const [nowTime, setNowTime] = useState<Date | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handlePrev = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "month") {
        next.setMonth(next.getMonth() - 1);
      } else {
        next.setDate(next.getDate() - 7);
      }
      return next;
    });
  };

  const handleNext = () => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      if (viewMode === "month") {
        next.setMonth(next.getMonth() + 1);
      } else {
        next.setDate(next.getDate() + 7);
      }
      return next;
    });
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const handleEventUpdated = (updated: any) => {
    setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
    setSelectedEvent(updated);
    window.dispatchEvent(new Event("lifeops-refresh-calendar"));
  };

  const handleEventDeleted = async (deletedId: string) => {
    setSelectedEvent(null);
    setIsDetailModalOpen(false);
    await loadData();
    window.dispatchEvent(new Event("lifeops-refresh-calendar"));
  };

  const handleEventCreated = async (created: any) => {
    await loadData();
    setSelectedEvent(created);
    setIsDetailModalOpen(true);
    window.dispatchEvent(new Event("lifeops-refresh-calendar"));
  };

  const handleOpenScheduleItem = (ev: any) => {
    if (isCanvasEvent(ev) && ev.assignment_id) {
      setSelectedAssignment({
        id: ev.assignment_id,
        course_name: ev.course_name || ev.location,
        title: ev.summary,
        description: ev.description || "",
        due_at: ev.due_at || ev.end_time,
        is_submitted: Boolean(ev.is_submitted),
        submission_status: ev.submission_status,
        syllabus_notes: ev.syllabus_notes || undefined,
        ai_summary: ev.ai_summary || null,
        ai_sections: ev.ai_sections || null,
        ai_model: ev.ai_model || null,
        item_type: "task",
      });
      setIsAssignmentModalOpen(true);
      return;
    }
    setSelectedEvent(ev);
    setIsDetailModalOpen(true);
  };

  const loadData = async (anchorDate?: Date) => {
    const anchor = anchorDate || currentDateRef.current;
    const rangeStart = new Date(anchor);
    rangeStart.setDate(rangeStart.getDate() - 45);
    const rangeEnd = new Date(anchor);
    rangeEnd.setDate(rangeEnd.getDate() + 45);

    try {
      const [evs, cals, pending, logs] = await Promise.all([
        getCalendarEvents({
          limit: 1000,
          start_time: rangeStart.toISOString(),
          end_time: rangeEnd.toISOString(),
        }),
        getCalendars().catch(() => []),
        getPendingActions(),
        getAutopilotLogs(25),
      ]);
      setEvents(evs);
      setCalendars(Array.isArray(cals) ? cals : []);
      setPendingActions(pending);
      setAutopilotLogs(logs);
    } catch (e) {
      console.error("Failed to load schedule data", e);
    }
  };

  useEffect(() => {
    const today = new Date();
    setNowTime(today);
    setNowIsoDate(formatDateToIso(today));
    setCurrentDate(today);
    setHiddenCalIds(getHiddenCalendarIds());
    loadData(today);

    const handleRefresh = () => loadData();
    const handleFilterSync = () => setHiddenCalIds(getHiddenCalendarIds());
    window.addEventListener("lifeops-refresh-calendar", handleRefresh);
    window.addEventListener("lifeops-refresh-assignments", handleRefresh);
    window.addEventListener("lifeops-profile-updated", handleRefresh);
    window.addEventListener("lifeops-refresh-pending", handleRefresh);
    window.addEventListener("lifeops-refresh-logs", handleRefresh);
    window.addEventListener("lifeops-calendar-filter-changed", handleFilterSync);

    const clockTimer = setInterval(() => {
      setNowTime(new Date());
    }, 60000);

    return () => {
      window.removeEventListener("lifeops-refresh-calendar", handleRefresh);
      window.removeEventListener("lifeops-refresh-assignments", handleRefresh);
      window.removeEventListener("lifeops-profile-updated", handleRefresh);
      window.removeEventListener("lifeops-refresh-pending", handleRefresh);
      window.removeEventListener("lifeops-refresh-logs", handleRefresh);
      window.removeEventListener("lifeops-calendar-filter-changed", handleFilterSync);
      clearInterval(clockTimer);
    };
  }, []);

  // Re-fetch date window when navigating months/weeks
  useEffect(() => {
    loadData(currentDate);
  }, [currentDate.getFullYear(), currentDate.getMonth()]);

  const handleExportIcs = () => {
    exportIcsCalendar();
  };

  const handleImportIcs = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const cleanName =
      file.name.replace(/\.ics$/i, "").replace(/[_-]+/g, " ").trim() || "Imported";
    const formData = new FormData();
    formData.append("file", file);
    formData.append("calendar_name", cleanName);
    formData.append("provider", "ics_file");

    try {
      const data = await importIcsCalendar(formData);
      setShiftMsg(`Imported ${data.imported_count || 0} events into "${data.calendar_name || cleanName}".`);
      setTimeout(() => setShiftMsg(null), 5000);
      await loadData();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      window.dispatchEvent(new Event("lifeops-profile-updated"));
    } catch (err: any) {
      setShiftMsg(`Import failed: ${err.message}`);
    } finally {
      e.target.value = "";
    }
  };

  const handleToggleCalendar = (calId: string) => {
    const next = toggleCalendarVisibility(calId);
    setHiddenCalIds(next);
  };

  const handleShowAllCalendars = () => {
    setHiddenCalendarIds([]);
    setHiddenCalIds([]);
  };

  const handleRemoveCalendar = async (calId: string, calName: string) => {
    setRemovingCalId(calId);
    try {
      const res = await deleteCalendarById(calId);
      setConfirmRemoveCalId(null);
      // Also clear from hidden filter if present
      const currentHidden = getHiddenCalendarIds().filter((id) => id !== calId);
      setHiddenCalendarIds(currentHidden);
      setHiddenCalIds(currentHidden);
      await loadData();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      window.dispatchEvent(new Event("lifeops-profile-updated"));
      setShiftMsg(
        `Removed calendar "${calName}" (${res.events_deleted ?? 0} event${res.events_deleted === 1 ? "" : "s"} removed).`
      );
      setTimeout(() => setShiftMsg(null), 5000);
    } catch (err: any) {
      setShiftMsg(`Could not remove calendar: ${err.message}`);
    } finally {
      setRemovingCalId(null);
    }
  };

  const handleApprove = async (id: string) => {
    try {
      await approveAction(id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleReject = async (id: string) => {
    try {
      await rejectAction(id);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleUndo = async (logId: string) => {
    try {
      await undoAutopilotAction(logId);
      await loadData();
    } catch (e) {
      console.error(e);
    }
  };

  const handleShiftStudyBlock = async (event: any) => {
    setShiftingId(event.id);
    setShiftMsg(null);

    const start = new Date(event.start_time);
    const end = new Date(event.end_time);
    start.setHours(start.getHours() + 1);
    end.setHours(end.getHours() + 1);

    try {
      const res = await requestAdjustment({
        event_id: event.id,
        new_start: start.toISOString(),
        new_end: end.toISOString(),
        reason: "User requested schedule shift in Weekly Calendar",
      });

      if (res.status === "auto_applied") {
        setShiftMsg(`Auto-shifted '${event.summary}' +1 hr. Rollback available in Logs.`);
        await loadData();
      } else if (res.status === "pending_approval") {
        setShiftMsg(`Action Gated: '${event.summary}' touches fixed schedule. Staged in Review Drawer.`);
        await loadData();
        setIsDrawerOpen(true);
        setDrawerTab("pending");
      }
    } catch (err: any) {
      setShiftMsg(`Error: ${err.message}`);
    } finally {
      setShiftingId(null);
      setTimeout(() => setShiftMsg(null), 5000);
    }
  };

  // Filter events by visible calendars (Google Calendar-style toggle)
  const visibleEvents = useMemo(() => {
    return events.filter((e) => isCalendarVisible(e, hiddenCalendarIds));
  }, [events, hiddenCalendarIds]);

  // Pre-index events by local ISO date for O(1) day lookups
  const eventsByDate = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const e of visibleEvents) {
      if (!e.start_time) continue;
      const d = toInputDate(e.start_time);
      if (!map.has(d)) map.set(d, []);
      map.get(d)!.push(e);
    }
    return map;
  }, [visibleEvents]);

  // Group events by local ISO date string (YYYY-MM-DD)
  const getEventsForDay = (isoDate: string) => {
    const rawEvents = eventsByDate.get(isoDate) || [];

    // Deduplicate Study Session 1 (keep one clean block per day on Wed/Thu/Fri and throughout the week)
    const seenStudySessions = new Set<string>();
    return rawEvents.filter((e) => {
      if (e.summary === "Study Session 1") {
        if (seenStudySessions.has("Study Session 1")) {
          return false;
        }
        seenStudySessions.add("Study Session 1");
      }
      return true;
    });
  };

  // Overlap-aware N-column cluster event layout
  const layoutDayEvents = (dayEvents: any[]) => {
    const prepared = [...dayEvents]
      .map((ev) => {
        const s = new Date(ev.start_time);
        const e = new Date(ev.end_time || ev.start_time);
        const startMs = s.getTime();
        const endMs = Math.max(e.getTime(), startMs + 60_000);

        const isAllDay = endMs - startMs >= 23 * 3600 * 1000;
        const startHour = isAllDay ? START_HOUR : s.getHours() + s.getMinutes() / 60;
        let endHour = isAllDay ? START_HOUR + 0.7 : e.getHours() + e.getMinutes() / 60;
        if (!isAllDay && endHour <= startHour && endMs > startMs) {
          endHour = END_HOUR;
        }

        const minBlockHours = 34 / HOUR_HEIGHT;
        const clampedStart = Math.max(START_HOUR, Math.min(END_HOUR - minBlockHours, startHour));
        const clampedEnd = Math.max(clampedStart + minBlockHours, Math.min(END_HOUR, endHour));

        const top = (clampedStart - START_HOUR) * HOUR_HEIGHT;
        const height = Math.max(34, (clampedEnd - clampedStart) * HOUR_HEIGHT);

        return { event: ev, startMs, endMs, top, height };
      })
      .sort((a, b) => a.startMs - b.startMs || b.endMs - a.endMs);

    if (prepared.length === 0) return [];

    // Group overlapping events into sweep-line clusters
    const clusters: Array<typeof prepared> = [];
    let currentCluster: typeof prepared = [];
    let clusterMaxEndMs = -Infinity;

    for (const item of prepared) {
      if (currentCluster.length === 0 || item.startMs < clusterMaxEndMs) {
        currentCluster.push(item);
        clusterMaxEndMs = Math.max(clusterMaxEndMs, item.endMs);
      } else {
        clusters.push(currentCluster);
        currentCluster = [item];
        clusterMaxEndMs = item.endMs;
      }
    }
    if (currentCluster.length > 0) {
      clusters.push(currentCluster);
    }

    const laidOut: Array<{
      event: any;
      top: number;
      height: number;
      leftPercent: number;
      widthPercent: number;
    }> = [];

    for (const cluster of clusters) {
      const colEndMs: number[] = [];
      const placed: Array<{ item: (typeof prepared)[number]; colIndex: number }> = [];

      for (const item of cluster) {
        let colIndex = colEndMs.findIndex((colEnd) => colEnd <= item.startMs);
        if (colIndex === -1) {
          colIndex = colEndMs.length;
          colEndMs.push(item.endMs);
        } else {
          colEndMs[colIndex] = item.endMs;
        }
        placed.push({ item, colIndex });
      }

      const totalCols = Math.max(1, colEndMs.length);
      const colWidth = 96 / totalCols;

      for (const { item, colIndex } of placed) {
        laidOut.push({
          event: item.event,
          top: item.top,
          height: item.height,
          leftPercent: 2 + colIndex * colWidth,
          widthPercent: colWidth,
        });
      }
    }

    return laidOut;
  };

  const renderDrawerContent = () => {
    if (drawerTab === "pending") {
      if (pendingActions.length === 0) {
        return (
          <div className="py-12 text-center text-xs text-[var(--text-muted)] font-sans">
            No pending schedule conflicts. Fixed academic classes and exams remain protected.
          </div>
        );
      }
      return pendingActions.map((act) => {
        const diff =
          typeof act.diff_preview === "string"
            ? JSON.parse(act.diff_preview)
            : act.diff_preview;
        const isDelete =
          act.action_type === "delete_event" ||
          diff?.action === "delete" ||
          diff?.proposed?.action === "delete";

        return (
          <div
            key={act.id}
            className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-base)] space-y-3"
          >
            <div>
              <span className="px-2 py-0.5 rounded text-xs font-medium font-sans bg-[var(--semantic-warning)]/15 text-[var(--semantic-warning)] border border-[var(--semantic-warning)]/30">
                Requires Approval
              </span>
              <h3 className="text-sm font-medium text-[var(--text-primary)] mt-1.5 font-sans">
                {act.description}
              </h3>
              {diff?.reason && (
                <p className="text-xs text-[var(--text-muted)] mt-0.5 font-sans">
                  {diff.reason}
                </p>
              )}
            </div>

            {diff && (
              <div className="p-3 rounded-md bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-xs space-y-2 font-sans">
                {isDelete ? (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[var(--text-muted)] font-sans">
                      <span>Current Schedule</span>
                      <span className="font-sans tabular-nums text-[var(--text-primary)] tracking-tight">
                        {formatDateTime(diff.current?.start_time)} –{" "}
                        {formatTime(diff.current?.end_time)}
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-[var(--border-hairline)] flex items-center justify-between text-[var(--semantic-danger)] font-medium font-sans">
                      <span>Proposed Action</span>
                      <span>
                        Drop Course ({diff.count || 1} session{diff.count === 1 ? "" : "s"} removed)
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-[var(--text-muted)] font-sans">
                      <span>Current</span>
                      <span className="font-sans tabular-nums text-[var(--text-secondary)] tracking-tight">
                        {formatDateTime(diff.current?.start_time)} –{" "}
                        {formatTime(diff.current?.end_time)}
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-[var(--border-hairline)] flex items-center justify-between text-[var(--semantic-success)] font-medium font-sans">
                      <span>Proposed Shift</span>
                      <span className="font-sans tabular-nums tracking-tight">
                        {formatDateTime(diff.proposed?.start_time)} –{" "}
                        {formatTime(diff.proposed?.end_time)}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1 border-t border-[var(--border-hairline)]">
              <button
                onClick={() => handleReject(act.id)}
                className="px-3 py-1 text-xs font-medium rounded-md border border-[var(--border-hairline)] text-[var(--semantic-danger)] hover:bg-[var(--semantic-danger)]/10 font-sans transition-colors"
              >
                Reject
              </button>
              <button
                onClick={() => handleApprove(act.id)}
                className={`px-3 py-1 text-xs font-medium rounded-md text-white font-sans transition-opacity ${
                  isDelete
                    ? "bg-[var(--semantic-danger)] hover:opacity-90"
                    : "bg-[var(--semantic-success)] hover:opacity-90"
                }`}
              >
                {isDelete ? "Confirm Removal" : "Approve Shift"}
              </button>
            </div>
          </div>
        );
      });
    }

    // Logs tab
    if (autopilotLogs.length === 0) {
      return (
        <div className="py-12 text-center text-xs text-[var(--text-muted)] font-sans">
          No automated modifications logged yet.
        </div>
      );
    }

    return autopilotLogs.map((log) => (
      <div
        key={log.id}
        className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-base)] flex items-center justify-between gap-3 text-xs"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-medium font-sans bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] capitalize">
              {log.action_type.replace(/_/g, " ")}
            </span>
            <span className="font-sans tabular-nums text-xs text-[var(--text-muted)] tracking-tight">
              {formatDateTime(log.created_at)}
            </span>
          </div>
          <p className="text-sm font-medium text-[var(--text-primary)] mt-1.5 font-sans">
            {log.description}
          </p>
        </div>

        <div>
          {log.undone ? (
            <span className="text-xs text-[var(--text-muted)] flex items-center gap-1 font-sans">
              <Check className="w-3.5 h-3.5 text-[var(--semantic-success)]" />
              Reverted
            </span>
          ) : (
            <button
              onClick={() => handleUndo(log.id)}
              className="px-2.5 py-1 text-xs font-medium rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] font-sans"
            >
              1-Click Undo
            </button>
          )}
        </div>
      </div>
    ));
  };

  const weekDays = useMemo(() => getWeekDays(currentDate), [currentDate]);
  const visibleDays = useMemo(
    () => (viewMode === "weekdays" ? weekDays.slice(0, 5) : weekDays),
    [viewMode, weekDays]
  );
  const weekendEventsCount = useMemo(() => {
    return getEventsForDay(weekDays[5].isoDate).length + getEventsForDay(weekDays[6].isoDate).length;
  }, [weekDays, eventsByDate]);
  const monthGridDays = useMemo(() => getMonthGridDays(currentDate), [currentDate]);

  // Split banner events (Canvas deadlines & all-day items) from hourly timed events
  const weekBannerEventsMap = useMemo(() => {
    const map = new Map<string, any[]>();
    for (const day of visibleDays) {
      const items = getEventsForDay(day.isoDate)
        .filter(isBannerEvent)
        .sort(
          (a, b) =>
            new Date(a.end_time || a.start_time).getTime() -
            new Date(b.end_time || b.start_time).getTime()
        );
      map.set(day.isoDate, items);
    }
    return map;
  }, [visibleDays, eventsByDate]);

  const hasAnyWeekBannerEvents = useMemo(() => {
    return visibleDays.some((day) => (weekBannerEventsMap.get(day.isoDate)?.length || 0) > 0);
  }, [visibleDays, weekBannerEventsMap]);

  // Memoized day layouts map for timed events only (excludes top banner items)
  const dayLayoutsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof layoutDayEvents>>();
    for (const day of visibleDays) {
      const dayEvents = getEventsForDay(day.isoDate).filter((ev) => !isBannerEvent(ev));
      map.set(day.isoDate, layoutDayEvents(dayEvents));
    }
    return map;
  }, [visibleDays, eventsByDate]);

  // Now indicator calculation
  const currentDayIdx = nowTime ? (nowTime.getDay() + 6) % 7 : -1;
  const nowHour = nowTime ? nowTime.getHours() + nowTime.getMinutes() / 60 : -1;
  const isNowVisible = nowTime !== null && nowHour >= START_HOUR && nowHour <= END_HOUR;
  const nowTop = nowTime ? (nowHour - START_HOUR) * HOUR_HEIGHT : 0;

  return (
    <div className="space-y-6">
      {/* Page Header with Action Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-hairline)]">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] font-sans">
            {viewMode === "month"
              ? currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })
              : "Weekly Schedule"}
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 font-sans">
            {viewMode === "month"
              ? `${displayName} · ${termLabel} · Monthly Overview & Deadlines`
              : `${displayName} · ${termLabel} · ${weekDays[0].short}, ${weekDays[0].dateStr} – ${
                  weekDays[viewMode === "weekdays" ? 4 : 6].short
                }, ${weekDays[viewMode === "weekdays" ? 4 : 6].dateStr}`}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Live System Time Chip */}
          {nowTime && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-elevated)] font-sans text-[var(--text-secondary)] shadow-2xs">
              <Clock className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span className="font-semibold text-[var(--text-primary)] tabular-nums tracking-tight">
                {nowTime.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} EST
              </span>
            </div>
          )}

          {/* Date Navigation Controls (<, Today, >) */}
          <div className="flex items-center gap-0.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-0.5 text-xs font-sans">
            <button
              type="button"
              onClick={handlePrev}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title={viewMode === "month" ? "Previous month" : "Previous week"}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 rounded text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title="Jump to current week"
            >
              Today
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors"
              title={viewMode === "month" ? "Next month" : "Next week"}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* M–F vs 7-Day vs Month View Toggle */}
          <div className="flex items-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-0.5 text-xs font-sans">
            <button
              type="button"
              onClick={() => setViewMode("weekdays")}
              className={`px-2.5 py-1 rounded transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
                viewMode === "weekdays"
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Mon–Fri
            </button>
            <button
              type="button"
              onClick={() => setViewMode("full")}
              className={`px-2.5 py-1 rounded transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
                viewMode === "full"
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              7 Days
            </button>
            <button
              type="button"
              onClick={() => setViewMode("month")}
              className={`px-2.5 py-1 rounded transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
                viewMode === "month"
                  ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-xs"
                  : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
            >
              Month
            </button>
          </div>

          {/* Export / Import ICS */}
          <button
            onClick={handleExportIcs}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-sans"
            title="Download standard .ics file"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export .ics</span>
          </button>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImportIcs}
            accept=".ics"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-sans"
            title="Import external .ics file"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Import .ics</span>
          </button>

          {/* Add Event / Task Modal Trigger */}
          <button
            onClick={() => {
              setAddModalInitialDate(toInputDate(new Date().toISOString()));
              setIsAddModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-stone-950 hover:opacity-90 transition-all shadow-xs font-sans"
            title="Create a new fixed event or flexible task"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Event / Task</span>
          </button>

          {/* Drawer Trigger (Approvals & Logs) */}
          <button
            onClick={() => setIsDrawerOpen(true)}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-md text-xs font-medium transition-colors font-sans ${
              pendingActions.length > 0
                ? "bg-[var(--semantic-warning)]/15 border border-[var(--semantic-warning)]/40 text-[var(--semantic-warning)]"
                : "border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Reviews & Logs</span>
            {pendingActions.length > 0 && (
              <span className="min-w-4 h-4 px-1.5 rounded-full flex items-center justify-center text-[10px] bg-[var(--accent-primary)] text-stone-950 font-bold font-sans tabular-nums shadow-xs">
                {pendingActions.length}
              </span>
            )}
          </button>
        </div>
      </div>

      {shiftMsg && (
        <div className="p-3 rounded-md text-xs border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/10 text-[var(--text-primary)] font-sans">
          {shiftMsg}
        </div>
      )}

      {/* Google Calendar-style Calendar Visibility & Upload Management Strip */}
      {calendars.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-sans">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-[var(--text-muted)] flex items-center gap-1.5 mr-1">
              <Eye className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>Calendars:</span>
            </span>
            {calendars.map((cal) => {
              const isVisible = !hiddenCalendarIds.includes(cal.calendar_id);
              const isConfirming = confirmRemoveCalId === cal.calendar_id;
              return (
                <div
                  key={cal.calendar_id}
                  className={`inline-flex items-center gap-1 rounded-md border transition-colors ${
                    isVisible
                      ? "bg-[var(--bg-surface)] border-[var(--border-hairline)] text-[var(--text-primary)]"
                      : "bg-[var(--bg-base)] border-[var(--border-hairline)]/60 text-[var(--text-muted)] opacity-65"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => handleToggleCalendar(cal.calendar_id)}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs cursor-pointer"
                    title={isVisible ? `Hide ${cal.calendar_name}` : `Show ${cal.calendar_name}`}
                  >
                    <span
                      className="w-3.5 h-3.5 rounded flex items-center justify-center border shrink-0 transition-colors"
                      style={{
                        backgroundColor: isVisible ? cal.color || "#38bdf8" : "transparent",
                        borderColor: cal.color || "#38bdf8",
                      }}
                    >
                      {isVisible && <Check className="w-2.5 h-2.5 text-stone-950 stroke-[3]" />}
                    </span>
                    <span className="font-medium max-w-[160px] truncate">{cal.calendar_name}</span>
                    <span className="text-[10px] font-mono tabular-nums text-[var(--text-muted)]">
                      {cal.event_count}
                    </span>
                  </button>

                  {isConfirming ? (
                    <div className="flex items-center gap-1 pr-1.5 pl-1 border-l border-[var(--border-hairline)]">
                      <button
                        type="button"
                        disabled={removingCalId === cal.calendar_id}
                        onClick={() => handleRemoveCalendar(cal.calendar_id, cal.calendar_name)}
                        className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-[var(--semantic-danger)] text-white hover:opacity-90 cursor-pointer"
                      >
                        {removingCalId === cal.calendar_id ? "..." : "Remove"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRemoveCalId(null)}
                        className="p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer"
                        title="Cancel"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmRemoveCalId(cal.calendar_id)}
                      className="pr-1.5 pl-1 py-1 border-l border-[var(--border-hairline)]/60 text-[var(--text-muted)] hover:text-[var(--semantic-danger)] transition-colors cursor-pointer"
                      title={`Remove "${cal.calendar_name}" and its events`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {hiddenCalendarIds.length > 0 && (
            <button
              type="button"
              onClick={handleShowAllCalendars}
              className="px-2 py-1 rounded text-[11px] font-medium text-[var(--accent-primary)] hover:underline cursor-pointer shrink-0"
            >
              Show all ({hiddenCalendarIds.length} hidden)
            </button>
          )}
        </div>
      )}

      {/* VIEW CONDITIONAL: Month View vs Timeline Week View */}
      {viewMode === "month" ? (
        /* Monthly Calendar Grid */
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] overflow-hidden shadow-xs">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 border-b border-[var(--border-hairline)] bg-[var(--bg-base)]/50">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((dayName) => (
              <div
                key={dayName}
                className="py-2.5 px-3 text-center text-xs font-semibold text-[var(--text-muted)] font-sans uppercase tracking-wider border-r border-[var(--border-hairline)] last:border-r-0"
              >
                {dayName}
              </div>
            ))}
          </div>

          {/* Month Days Grid */}
          <div className="grid grid-cols-7 bg-[var(--border-hairline)]/30 gap-px">
            {monthGridDays.map((cell) => {
              const dayEvents = getEventsForDay(cell.isoDate);
              const isToday = nowIsoDate === cell.isoDate;

              return (
                <div
                  key={cell.isoDate}
                  onClick={() => {
                    setAddModalInitialDate(cell.isoDate);
                    setIsAddModalOpen(true);
                  }}
                  className={`min-h-[115px] p-2 flex flex-col justify-between group transition-colors cursor-pointer select-none ${
                    cell.isCurrentMonth
                      ? isToday
                        ? "bg-[var(--accent-primary)]/[0.04] ring-1 ring-inset ring-[var(--accent-primary)]/40"
                        : "bg-[var(--bg-elevated)] hover:bg-[var(--bg-surface)]/80"
                      : "bg-[var(--bg-base)]/40 opacity-40 hover:opacity-80"
                  }`}
                  title={`Click to add event on ${cell.isoDate}`}
                >
                  {/* Top Bar: Date Number + Quick Add '+' button */}
                  <div className="flex items-center justify-between">
                    <span
                      className={`text-xs font-semibold tabular-nums font-sans ${
                        isToday
                          ? "px-1.5 py-0.2 rounded-full bg-[var(--accent-primary)] text-stone-950 font-bold"
                          : cell.isCurrentMonth
                          ? "text-[var(--text-primary)]"
                          : "text-[var(--text-muted)]"
                      }`}
                    >
                      {cell.dayNumber}
                    </span>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setAddModalInitialDate(cell.isoDate);
                        setIsAddModalOpen(true);
                      }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                      title="Add event/task"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  {/* Events in Cell */}
                  <div className="space-y-1 my-1 flex-1 overflow-hidden">
                    {dayEvents.slice(0, 3).map((ev) => {
                      const isStudy = ev.source === "life_ops_study_block";
                      const isCanvas = isCanvasEvent(ev);
                      const displayTime = getEventDisplayTime(ev).replace(" ", "");
                      return (
                        <div
                          key={ev.id}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenScheduleItem(ev);
                          }}
                          className={`px-1.5 py-0.5 rounded text-micro font-sans truncate cursor-pointer transition-all border flex items-center gap-1 ${
                            isStudy
                              ? "bg-[var(--accent-primary)]/15 border-[var(--accent-primary)]/30 text-[var(--text-primary)] hover:border-[var(--accent-primary)]"
                              : isCanvas
                              ? "bg-sky-500/[0.08] border-sky-500/35 text-[var(--text-primary)] hover:border-sky-400"
                              : "bg-[var(--bg-surface)] border-[var(--border-hairline)] text-[var(--text-primary)] hover:border-[var(--text-muted)]"
                          }`}
                          title={`${getEventDisplayTime(ev)} ${ev.summary}${
                            ev.location ? ` (${ev.location})` : ""
                          }`}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ backgroundColor: ev.color || (isCanvas ? "#0284c7" : "var(--accent-primary)") }}
                          />
                          <span className="tabular-nums text-[10px] text-[var(--text-muted)] shrink-0 font-medium">
                            {displayTime}
                          </span>
                          <span
                            className={`truncate font-medium ${
                              isCanvas && ev.is_submitted ? "line-through opacity-60" : ""
                            }`}
                          >
                            {ev.summary}
                          </span>
                        </div>
                      );
                    })}

                    {dayEvents.length > 3 && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation();
                          setCurrentDate(cell.fullDate);
                          setViewMode("full");
                        }}
                        className="text-micro text-[var(--text-muted)] hover:text-[var(--accent-primary)] font-medium font-sans pl-1 cursor-pointer"
                        title="View all events in week view"
                      >
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>

                  {dayEvents.length === 0 && <div className="h-3" />}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        /* Hourly Timeline Calendar Grid */
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <div className="min-w-[760px]">
              {/* Days Header Row */}
              <div
                className="grid border-b border-[var(--border-hairline)] bg-[var(--bg-base)]/50"
                style={{
                  gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))`,
                }}
              >
                {/* Left Corner Axis Placeholder */}
                <div className="py-2.5 px-2 border-r border-[var(--border-hairline)] flex items-center justify-center">
                  <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                </div>

                {/* Day Headers */}
                {visibleDays.map((day) => {
                  const dayEvents = getEventsForDay(day.isoDate);
                  const isToday = nowIsoDate === day.isoDate;

                  return (
                    <div
                      key={day.name}
                      className={`py-2 px-3 border-r border-[var(--border-hairline)] last:border-r-0 flex items-center justify-between ${
                        isToday ? "bg-[var(--accent-primary)]/5" : ""
                      }`}
                    >
                      <div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-semibold text-[var(--text-primary)] font-sans">
                            {day.name}
                          </span>
                          {isToday && (
                            <span className="px-1 py-0.2 text-micro rounded bg-[var(--accent-primary)] text-stone-950 font-semibold font-sans">
                              Today
                            </span>
                          )}
                        </div>
                        <span className="text-xs text-[var(--text-muted)] font-sans">
                          {day.dateStr}
                        </span>
                      </div>
                      <span className="text-xs font-sans tabular-nums text-[var(--text-muted)]">
                        {dayEvents.length}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* Pinned Due / All-Day Banner Row (Canvas deadlines & all-day events above the fold) */}
              {hasAnyWeekBannerEvents && (
                <div
                  className="grid border-b border-[var(--border-hairline)] bg-[var(--bg-base)]/40"
                  style={{
                    gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))`,
                  }}
                >
                  <div className="py-2 px-1 border-r border-[var(--border-hairline)] flex items-start justify-center pt-2.5 select-none bg-[var(--bg-base)]/30">
                    <span className="text-[10px] font-medium text-[var(--text-muted)] uppercase tracking-wider font-sans">
                      Due
                    </span>
                  </div>

                  {visibleDays.map((day) => {
                    const bannerItems = weekBannerEventsMap.get(day.isoDate) || [];
                    const isExpanded = Boolean(expandedBannerDays[day.isoDate]);
                    const visibleBannerItems = isExpanded ? bannerItems : bannerItems.slice(0, 3);
                    const hiddenCount = bannerItems.length - visibleBannerItems.length;
                    const isToday = nowIsoDate === day.isoDate;

                    return (
                      <div
                        key={`banner-${day.isoDate}`}
                        onClick={() => {
                          setAddModalInitialDate(day.isoDate);
                          setIsAddModalOpen(true);
                        }}
                        className={`p-1.5 border-r border-[var(--border-hairline)] last:border-r-0 space-y-1 cursor-pointer min-w-0 ${
                          isToday ? "bg-[var(--accent-primary)]/[0.02]" : ""
                        }`}
                        title={`Click to add event or deadline on ${day.name}`}
                      >
                        {visibleBannerItems.map((ev) => {
                          const isCanvas = isCanvasEvent(ev);
                          const isSelected = selectedEvent?.id === ev.id;
                          const displayTime = getEventDisplayTime(ev);

                          return (
                            <button
                              key={ev.id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleOpenScheduleItem(ev);
                              }}
                              className={`w-full text-left px-2 py-1 rounded border transition-all flex items-center gap-1.5 text-[11px] font-sans cursor-pointer ${
                                isSelected
                                  ? "border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)] bg-[var(--bg-surface)]"
                                  : isCanvas
                                  ? "border-sky-500/35 bg-sky-500/[0.08] hover:border-sky-400"
                                  : "border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--text-muted)]"
                              }`}
                              title={`${displayTime} · ${ev.summary}${
                                ev.location ? ` (${ev.location})` : ""
                              }`}
                            >
                              <span
                                className="w-1.5 h-1.5 rounded-full shrink-0"
                                style={{
                                  backgroundColor:
                                    ev.color || (isCanvas ? "#0284c7" : "var(--accent-primary)"),
                                }}
                              />
                              <span className="tabular-nums text-[10px] text-[var(--text-muted)] shrink-0 font-medium">
                                {displayTime}
                              </span>
                              <span
                                className={`truncate font-medium text-[var(--text-primary)] ${
                                  isCanvas && ev.is_submitted ? "line-through opacity-60" : ""
                                }`}
                              >
                                {ev.summary}
                              </span>
                            </button>
                          );
                        })}

                        {hiddenCount > 0 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedBannerDays((prev) => ({
                                ...prev,
                                [day.isoDate]: true,
                              }));
                            }}
                            className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium font-sans text-[var(--accent-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                          >
                            +{hiddenCount} more
                          </button>
                        )}

                        {isExpanded && bannerItems.length > 3 && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setExpandedBannerDays((prev) => ({
                                ...prev,
                                [day.isoDate]: false,
                              }));
                            }}
                            className="w-full text-left px-1.5 py-0.5 rounded text-[10px] font-medium font-sans text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                          >
                            Show less
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Timeline Body (6 AM - 12 AM) */}
              <div
                className="relative grid"
                style={{
                  gridTemplateColumns: `56px repeat(${visibleDays.length}, minmax(0, 1fr))`,
                  height: `${TOTAL_HEIGHT}px`,
                }}
              >
                {/* Left Hourly Axis */}
                <div className="relative border-r border-[var(--border-hairline)] select-none bg-[var(--bg-base)]/30">
                  {HOURS.slice(0, -1).map((h, i) => (
                    <div
                      key={h}
                      className="absolute right-2 text-micro font-sans tabular-nums text-[var(--text-muted)] -translate-y-1/2 tracking-tight"
                      style={{ top: `${i * HOUR_HEIGHT}px` }}
                    >
                      {formatHourLabel(h)}
                    </div>
                  ))}
                  {/* 12 AM bottom marker */}
                  <div
                    className="absolute right-2 text-micro font-sans tabular-nums text-[var(--text-muted)] -translate-y-1/2 tracking-tight"
                    style={{ top: `${TOTAL_HEIGHT}px` }}
                  >
                    {formatHourLabel(END_HOUR)}
                  </div>
                </div>

                {/* Day Columns */}
                {visibleDays.map((day) => {
                  const dayEvents = getEventsForDay(day.isoDate);
                  const layoutEvents = dayLayoutsMap.get(day.isoDate) || [];
                  const isToday = nowIsoDate === day.isoDate;

                  return (
                    <div
                      key={day.name}
                      onClick={() => {
                        setAddModalInitialDate(day.isoDate);
                        setIsAddModalOpen(true);
                      }}
                      className={`relative border-r border-[var(--border-hairline)] last:border-r-0 cursor-pointer ${
                        isToday ? "bg-[var(--accent-primary)]/[0.02]" : ""
                      }`}
                      title={`Click to add event or task on ${day.name}`}
                    >
                      {/* Hourly Horizontal Hairline Guides */}
                      {HOURS.slice(0, -1).map((_, i) => (
                        <div
                          key={i}
                          className="absolute left-0 right-0 border-t border-[var(--border-hairline)]/40 pointer-events-none"
                          style={{ top: `${i * HOUR_HEIGHT}px` }}
                        />
                      ))}

                      {/* Live "Now" Indicator Line on Current Day */}
                      {isToday && isNowVisible && (
                        <div
                          className="absolute left-0 right-0 z-20 pointer-events-none flex items-center"
                          style={{ top: `${nowTop}px` }}
                        >
                          <div className="w-2 h-2 -ml-1 rounded-full bg-[var(--accent-primary)] ring-2 ring-[var(--bg-elevated)]" />
                          <div className="flex-1 border-t-2 border-[var(--accent-primary)]" />
                          <span className="ml-1 px-1.5 py-0.5 rounded text-micro font-sans font-semibold bg-[var(--accent-primary)] text-stone-950 shadow-xs">
                            Now
                          </span>
                        </div>
                      )}

                      {/* Early Hours / Pre-Day Indicator on Current Day */}
                      {isToday && nowHour >= 0 && nowHour < START_HOUR && (
                        <div className="absolute top-0 left-0 right-0 z-20 pointer-events-none p-1 bg-[var(--accent-primary)]/15 border-b border-[var(--accent-primary)]/40 flex items-center justify-between text-[10px] font-sans font-medium text-[var(--accent-primary)]">
                          <span className="flex items-center gap-1">
                            <Clock className="w-2.5 h-2.5" />
                            <span>{nowTime?.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })} (Early Hours)</span>
                          </span>
                          <span className="text-[var(--text-muted)] text-[9px]">
                            {dayEvents.length} {dayEvents.length === 1 ? "item" : "items"} today
                          </span>
                        </div>
                      )}

                      {/* Positioned Event Cards */}
                      {layoutEvents.map(
                        ({ event: ev, top, height, leftPercent, widthPercent }) => {
                          const isStudy = ev.source === "life_ops_study_block";
                          const isCanvas = ev.source === "canvas_inferred";
                          const isSelected = selectedEvent?.id === ev.id;
                          const isShortBlock = height < 56;

                          return (
                            <div
                              key={ev.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedEvent(ev);
                                setIsDetailModalOpen(true);
                              }}
                              style={{
                                top: `${top}px`,
                                height: `${height}px`,
                                left: `${leftPercent}%`,
                                width: `${widthPercent}%`,
                              }}
                              className={`absolute rounded-md ${
                                isShortBlock ? "py-1 px-2" : "p-1.5"
                              } border cursor-pointer transition-all overflow-hidden z-10 flex flex-col justify-between shadow-xs ${
                                isSelected
                                  ? "border-[var(--accent-primary)] ring-1 ring-[var(--accent-primary)] bg-[var(--bg-surface)]"
                                  : isStudy
                                  ? "border-[var(--accent-primary)]/50 bg-[var(--bg-surface)] hover:border-[var(--accent-primary)]"
                                  : isCanvas
                                  ? "border-sky-500/40 bg-[var(--bg-surface)] hover:border-sky-400"
                                  : "border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--text-muted)]"
                              }`}
                            >
                              <div>
                                <div className="flex items-center justify-between gap-1 mb-0.5">
                                  <span className="font-sans tabular-nums text-micro text-[var(--text-muted)] leading-none tracking-tight font-medium flex items-center gap-1">
                                    <span
                                      className="w-1.5 h-1.5 rounded-full shrink-0"
                                      style={{ backgroundColor: ev.color || "var(--accent-primary)" }}
                                    />
                                    <span>{formatTime(ev.start_time)}</span>
                                  </span>
                                  {isStudy && (
                                    <span className="px-1.5 py-0.5 text-micro font-medium font-sans rounded bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] leading-none">
                                      Auto
                                    </span>
                                  )}
                                  {isCanvas && (
                                    <span className="px-1.5 py-0.5 text-micro font-medium font-sans rounded bg-sky-500/15 text-sky-400 leading-none">
                                      Canvas
                                    </span>
                                  )}
                                </div>
                                <p
                                  className={`text-xs font-semibold text-[var(--text-primary)] font-sans leading-tight ${
                                    isShortBlock ? "truncate" : "line-clamp-2"
                                  }`}
                                >
                                  {ev.summary}
                                </p>
                              </div>

                              {height >= 48 && ev.location && (
                                <p className="text-[10px] text-[var(--text-muted)] truncate font-sans">
                                  {ev.location}
                                </p>
                              )}
                            </div>
                          );
                        }
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Collapsible Weekend Strip (when in Mon-Fri Mode) */}
      {viewMode === "weekdays" && (
        <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] overflow-hidden">
          <button
            type="button"
            onClick={() => setIsWeekendOpen(!isWeekendOpen)}
            className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-[var(--bg-hover)] transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-[var(--text-primary)] font-sans">
                Weekend Schedule ({weekDays[5].name}, {weekDays[5].dateStr} – {weekDays[6].name},{" "}
                {weekDays[6].dateStr})
              </span>
              <span className="px-2 py-0.5 rounded text-xs font-sans tabular-nums bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-hairline)]">
                {weekendEventsCount} {weekendEventsCount === 1 ? "event" : "events"}
              </span>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-[var(--text-muted)] font-sans">
              <span>{isWeekendOpen ? "Collapse weekend" : "Expand weekend"}</span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  isWeekendOpen ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>

          {isWeekendOpen && (
            <div className="p-4 border-t border-[var(--border-hairline)] grid grid-cols-1 md:grid-cols-2 gap-4 bg-[var(--bg-base)]">
              {[weekDays[5], weekDays[6]].map((weekendDay) => {
                const dayEvents = getEventsForDay(weekendDay.isoDate);
                return (
                  <div
                    key={weekendDay.isoDate}
                    className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-2"
                  >
                    <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
                      <span className="text-xs font-semibold text-[var(--text-primary)] font-sans">
                        {weekendDay.name}
                      </span>
                      <span className="text-xs text-[var(--text-muted)] font-sans">
                        {weekendDay.dateStr}
                      </span>
                    </div>
                    {dayEvents.length === 0 ? (
                      <p className="text-xs text-[var(--text-muted)] py-4 text-center font-sans">
                        No scheduled events
                      </p>
                    ) : (
                      dayEvents.map((ev) => {
                        const isCanvas = isCanvasEvent(ev);
                        return (
                          <div
                            key={ev.id}
                            onClick={() => handleOpenScheduleItem(ev)}
                            className={`p-2.5 rounded-md border cursor-pointer text-left transition-colors ${
                              isCanvas
                                ? "border-sky-500/35 bg-sky-500/[0.06] hover:border-sky-400"
                                : "border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--text-muted)]"
                            }`}
                          >
                            <div className="flex items-center justify-between font-sans tabular-nums text-xs text-[var(--text-muted)] tracking-tight font-medium">
                              <span className="flex items-center gap-1.5">
                                <span
                                  className="w-1.5 h-1.5 rounded-full shrink-0"
                                  style={{
                                    backgroundColor:
                                      ev.color || (isCanvas ? "#0284c7" : "var(--accent-primary)"),
                                  }}
                                />
                                <span>{getEventDisplayTime(ev)}</span>
                              </span>
                              {isCanvas && (
                                <span className="px-1.5 py-0.5 text-micro font-medium font-sans rounded bg-sky-500/15 text-sky-400 leading-none">
                                  Task
                                </span>
                              )}
                            </div>
                            <p
                              className={`text-xs font-medium text-[var(--text-primary)] font-sans mt-0.5 ${
                                isCanvas && ev.is_submitted ? "line-through opacity-60" : ""
                              }`}
                            >
                              {ev.summary}
                            </p>
                            {ev.location && (
                              <p className="text-micro text-[var(--text-muted)] font-sans mt-0.5">
                                {ev.location}
                              </p>
                            )}
                          </div>
                        );
                      })
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Event Detail Card Modal */}
      <EventDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedEvent(null);
        }}
        event={selectedEvent}
        onUpdate={handleEventUpdated}
        onDelete={handleEventDeleted}
      />

      {/* Assignment Task Detail & Structured Spec Modal */}
      <AssignmentDetailModal
        isOpen={isAssignmentModalOpen}
        onClose={() => {
          setIsAssignmentModalOpen(false);
          setSelectedAssignment(null);
        }}
        assignment={selectedAssignment}
        onToggleSubmit={(id, nextState) => {
          setEvents((prev) =>
            prev.map((ev) =>
              ev.assignment_id === id ? { ...ev, is_submitted: nextState } : ev
            )
          );
          setSelectedAssignment((prev) =>
            prev && prev.id === id ? { ...prev, is_submitted: nextState } : prev
          );
        }}
        onAnalyzed={(id, fields) => {
          setEvents((prev) =>
            prev.map((ev) =>
              ev.assignment_id === id ? { ...ev, ...fields } : ev
            )
          );
          setSelectedAssignment((prev) =>
            prev && prev.id === id ? { ...prev, ...fields } : prev
          );
        }}
      />

      {/* Add Event / Task Modal */}
      <AddEventModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        initialDate={addModalInitialDate}
        onCreated={handleEventCreated}
      />

      {/* Slide-Over Drawer: Reviews & Autopilot 1-Click Undo Logs */}
      {isDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/60 transition-opacity cursor-pointer"
            onClick={() => setIsDrawerOpen(false)}
          />

          {/* Drawer Panel */}
          <div className="relative w-full max-w-lg bg-[var(--bg-elevated)] border-l border-[var(--border-hairline)] shadow-2xl h-full flex flex-col z-10">
            {/* Drawer Header */}
            <div className="p-4 border-b border-[var(--border-hairline)] flex items-center justify-between">
              <div>
                <h2 className="text-sm font-semibold text-[var(--text-primary)] font-sans">
                  Reviews & Autopilot Logs
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 font-sans">
                  Confirm gated schedule changes or rollback automated shifts
                </p>
              </div>
              <button
                onClick={() => setIsDrawerOpen(false)}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex border-b border-[var(--border-hairline)] px-4 text-xs font-sans gap-2">
              <button
                onClick={() => setDrawerTab("pending")}
                className={`py-2.5 px-3 border-b-2 transition-colors duration-75 active:scale-[0.98] cursor-pointer flex items-center gap-1.5 ${
                  drawerTab === "pending"
                    ? "border-[var(--accent-primary)] text-[var(--text-primary)] font-semibold"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <ShieldAlert className="w-3.5 h-3.5" />
                <span>Approvals</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-micro font-bold tabular-nums font-sans ${
                    drawerTab === "pending"
                      ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/40"
                      : "bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-hairline)]"
                  }`}
                >
                  {pendingActions.length}
                </span>
              </button>
              <button
                onClick={() => setDrawerTab("logs")}
                className={`py-2.5 px-3 border-b-2 transition-colors duration-75 active:scale-[0.98] cursor-pointer flex items-center gap-1.5 ${
                  drawerTab === "logs"
                    ? "border-[var(--accent-primary)] text-[var(--text-primary)] font-semibold"
                    : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Undo Feed</span>
                <span
                  className={`px-1.5 py-0.2 rounded-full text-micro font-bold tabular-nums font-sans ${
                    drawerTab === "logs"
                      ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/40"
                      : "bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-hairline)]"
                  }`}
                >
                  {autopilotLogs.length}
                </span>
              </button>
            </div>

            {/* Drawer Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {renderDrawerContent()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
