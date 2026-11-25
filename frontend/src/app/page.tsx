"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  MapPin,
  AlertCircle,
  ArrowRight,
  Plus,
  Clock,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { getCalendarEvents, getAssignments, getPendingActions } from "@/lib/api";
import {
  cleanAssignmentTitle,
  formatTime,
  formatDate,
  formatDaysRemaining,
  formatTimeUntil,
  toInputDate,
} from "@/lib/formatters";
import { EventDetailModal, AddEventModal } from "@/components/calendar/event-modals";
import { AssignmentDetailModal, AcademicAssignment } from "@/components/academics/assignment-modal";
import { useProfile } from "@/components/profile-provider";
import { getHiddenCalendarIds, isCalendarVisible } from "@/lib/calendar-visibility";

export default function TodayPage() {
  const { academicProfile, profile } = useProfile();
  const [events, setEvents] = useState<any[]>([]);
  const [hiddenCalendarIds, setHiddenCalIds] = useState<string[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [pendingCount, setPendingCount] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [now, setNow] = useState<Date | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedAssignment, setSelectedAssignment] = useState<AcademicAssignment | null>(null);
  const [isAssignmentModalOpen, setIsAssignmentModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const loadData = async () => {
    try {
      const todayAnchor = new Date();
      const rangeStart = new Date(todayAnchor);
      rangeStart.setDate(rangeStart.getDate() - 1);
      const rangeEnd = new Date(todayAnchor);
      rangeEnd.setDate(rangeEnd.getDate() + 2);

      const [evs, assigns, pending] = await Promise.all([
        getCalendarEvents({
          limit: 500,
          start_time: rangeStart.toISOString(),
          end_time: rangeEnd.toISOString(),
        }),
        getAssignments("active"),
        getPendingActions(),
      ]);

      setEvents(evs);
      setAssignments(assigns);
      setPendingCount(pending.length);
    } catch (e) {
      console.error("Failed to load Today data", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setNow(new Date());
    setHiddenCalIds(getHiddenCalendarIds());
    loadData();

    const handleRefresh = () => loadData();
    const handleFilterSync = () => setHiddenCalIds(getHiddenCalendarIds());
    window.addEventListener("lifeops-refresh-calendar", handleRefresh);
    window.addEventListener("lifeops-refresh-assignments", handleRefresh);
    window.addEventListener("lifeops-profile-updated", handleRefresh);
    window.addEventListener("lifeops-refresh-pending", handleRefresh);
    window.addEventListener("lifeops-calendar-filter-changed", handleFilterSync);

    const timer = setInterval(() => {
      setNow(new Date());
    }, 10000);

    return () => {
      window.removeEventListener("lifeops-refresh-calendar", handleRefresh);
      window.removeEventListener("lifeops-refresh-assignments", handleRefresh);
      window.removeEventListener("lifeops-profile-updated", handleRefresh);
      window.removeEventListener("lifeops-refresh-pending", handleRefresh);
      window.removeEventListener("lifeops-calendar-filter-changed", handleFilterSync);
      clearInterval(timer);
    };
  }, []);

  const nowMs = now ? now.getTime() : 0;
  const todayIso = now ? toInputDate(now.toISOString()) : "";

  // Filter events scheduled strictly for today & visible calendars, sorted chronologically
  const todayEvents = events
    .filter(
      (e) =>
        e.start_time &&
        (!todayIso || toInputDate(e.start_time) === todayIso) &&
        isCalendarVisible(e, hiddenCalendarIds)
    )
    .sort((a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime());

  // Identify next upcoming event today
  const nextEvent = todayEvents.find((e) => (nowMs > 0 ? new Date(e.start_time).getTime() > nowMs : false));
  const currentEvent = todayEvents.find(
    (e) => nowMs > 0 && new Date(e.start_time).getTime() <= nowMs && new Date(e.end_time).getTime() >= nowMs
  );

  // Filter strictly for active deliverables: recent grace window (e.g. Proposal) + upcoming
  const twoDaysAgoMs = nowMs > 0 ? nowMs - 48 * 3600 * 1000 : 0;
  const upcomingDeadlines = assignments
    .filter((a) => {
      if (!a.due_at) return false;
      if (a.is_submitted) return false;
      const dueTime = new Date(a.due_at).getTime();
      return twoDaysAgoMs > 0 ? dueTime >= twoDaysAgoMs : true;
    })
    .sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
    .slice(0, 6);

  const formattedDate = now
    ? now.toLocaleDateString("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
      })
    : "Friday, November 13, 2026";
  const formattedTime = now
    ? now.toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      })
    : "--:--";

  return (
    <div className="space-y-8">
      {/* Calm Page Header with Live Current Time */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-hairline)]">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] font-sans">
            Today
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 font-sans">
            {formattedDate} · {academicProfile}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Live System Time Chip */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-elevated)] font-sans text-[var(--text-secondary)] shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span className="font-semibold text-[var(--text-primary)] tabular-nums tracking-tight">
              {formattedTime}
            </span>
          </div>

          {pendingCount > 0 && (
            <Link
              href="/schedule"
              className="flex items-center gap-2 px-3 py-1.5 rounded-md text-xs border border-[var(--semantic-warning)]/40 bg-[var(--semantic-warning)]/10 text-[var(--semantic-warning)] hover:bg-[var(--semantic-warning)]/20 transition-colors"
            >
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span className="font-sans">
                {pendingCount} Schedule change{pendingCount > 1 ? "s" : ""} waiting for review
              </span>
              <ArrowRight className="w-3 h-3 shrink-0" />
            </Link>
          )}
        </div>
      </div>

      {/* Two-Column Asymmetric Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Today's Chronological Schedule */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider font-sans">
              Today's Schedule & Focus ({todayEvents.length} session{todayEvents.length === 1 ? "" : "s"})
            </h2>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="text-xs text-[var(--accent-primary)] hover:underline font-sans font-medium flex items-center gap-1"
                title="Add event or task"
              >
                <Plus className="w-3 h-3" />
                <span>Add Event / Task</span>
              </button>
              <Link
                href="/schedule"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 font-sans"
              >
                <span>Weekly Calendar</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>
          </div>

          {/* Real-Time Spotlight Banner */}
          {currentEvent ? (
            <div className="p-3.5 rounded-lg border border-[var(--semantic-success)]/40 bg-[var(--semantic-success)]/10 flex items-center justify-between gap-3 text-xs font-sans">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-[var(--semantic-success)]" />
                <span className="font-semibold text-[var(--semantic-success)]">Happening Now:</span>
                <span className="font-medium text-[var(--text-primary)]">{currentEvent.summary}</span>
                {currentEvent.location && (
                  <span className="text-[var(--text-muted)]">({currentEvent.location})</span>
                )}
              </div>
              <span className="tabular-nums text-[var(--text-secondary)] font-medium">
                Until {formatTime(currentEvent.end_time)}
              </span>
            </div>
          ) : nextEvent ? (
            <div className="p-3.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] flex items-center justify-between gap-3 text-xs font-sans">
              <div className="flex items-center gap-2.5">
                <span className="w-2 h-2 rounded-full bg-[var(--accent-primary)]" />
                <span className="font-semibold text-[var(--text-primary)]">Next Up:</span>
                <span className="font-medium text-[var(--text-secondary)]">{nextEvent.summary}</span>
                {nextEvent.location && (
                  <span className="text-[var(--text-muted)]">({nextEvent.location})</span>
                )}
              </div>
              <span className="text-[var(--accent-primary)] font-semibold tabular-nums">
                Starts {formatTimeUntil(nextEvent.start_time)} ({formatTime(nextEvent.start_time)})
              </span>
            </div>
          ) : (
            <div className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)]/60 text-xs text-[var(--text-muted)] font-sans flex items-center gap-2">
              <CheckCircle2 className="w-3.5 h-3.5 text-[var(--semantic-success)]" />
              <span>All scheduled commitments for today have concluded.</span>
            </div>
          )}

          <div className="divide-y divide-[var(--border-hairline)]/30 border-y border-[var(--border-hairline)]/30">
            {todayEvents.length === 0 ? (
              <div className="py-8 text-center text-xs text-[var(--text-muted)] font-sans">
                No events scheduled for today.
              </div>
            ) : (
              todayEvents.map((ev) => {
                const isStudy = ev.source === "life_ops_study_block";
                const isCanvas = ev.source === "canvas_inferred";
                const isTask = ev.item_type === "task" || isStudy || isCanvas;
                const displayTimeStart = isCanvas ? ev.end_time : ev.start_time;
                const startMs = new Date(displayTimeStart).getTime();
                const endMs = new Date(ev.end_time).getTime();
                const isPast = endMs < nowMs;
                const isNow = !isCanvas && startMs <= nowMs && endMs >= nowMs;
                const isNext = !isPast && !isNow && nextEvent?.id === ev.id;

                return (
                  <div
                    key={ev.id}
                    onClick={() => {
                      if (isCanvas && ev.assignment_id) {
                        const matched = assignments.find((a) => a.id === ev.assignment_id);
                        setSelectedAssignment(
                          matched || {
                            id: ev.assignment_id,
                            course_name: ev.course_name || ev.location,
                            title: ev.summary,
                            description: ev.description || "",
                            due_at: ev.due_at || ev.end_time,
                            is_submitted: Boolean(ev.is_submitted),
                            ai_summary: ev.ai_summary || null,
                            ai_sections: ev.ai_sections || null,
                            ai_model: ev.ai_model || null,
                            syllabus_notes: ev.syllabus_notes || undefined,
                          }
                        );
                        setIsAssignmentModalOpen(true);
                      } else {
                        setSelectedEvent(ev);
                        setIsDetailModalOpen(true);
                      }
                    }}
                    className={`py-2.5 flex items-center justify-between gap-4 group hover:bg-white/[0.04] px-2.5 rounded-md transition-colors cursor-pointer ${
                      isPast ? "opacity-50" : ""
                    } ${isNow ? "bg-[var(--accent-primary)]/[0.06] border-l-2 border-[var(--accent-primary)]" : ""}`}
                    title="Click to inspect details or open task"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div className="pt-0.5">
                        <div
                          className={`w-2 h-2 rounded-full mt-1.5 ${isNow ? "ring-2 ring-[var(--accent-primary)]" : ""}`}
                          style={{ backgroundColor: ev.color || "var(--accent-primary)" }}
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={`text-sm font-medium truncate font-sans ${
                              isPast || (isCanvas && ev.is_submitted)
                                ? "text-[var(--text-muted)] line-through"
                                : "text-[var(--text-primary)]"
                            }`}
                          >
                            {ev.summary}
                          </span>
                          {isNow && (
                            <span className="px-1.5 py-0.2 rounded text-micro font-semibold font-sans bg-[var(--semantic-success)] text-stone-950 uppercase tracking-wider">
                              Now
                            </span>
                          )}
                          {isNext && (
                            <span className="px-1.5 py-0.2 rounded text-micro font-semibold font-sans bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border border-[var(--accent-primary)]/40">
                              Next
                            </span>
                          )}
                          {isTask && (
                            <span className="px-2 py-0.5 rounded text-xs font-medium font-sans bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] whitespace-nowrap shrink-0">
                              {isCanvas ? "Task" : "Flexible Block"}
                            </span>
                          )}
                        </div>
                        {ev.location && (
                          <div className="flex items-center gap-1 text-xs text-[var(--text-muted)] mt-0.5 font-sans">
                            <MapPin className="w-3 h-3 shrink-0" />
                            <span className="truncate">{ev.location}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="text-right shrink-0 text-xs tabular-nums font-sans">
                      <span className="text-[var(--text-primary)] font-medium font-sans tabular-nums tracking-tight">
                        {formatTime(displayTimeStart)}
                      </span>
                      {!isCanvas && (
                        <span className="text-[var(--text-muted)] block text-micro font-sans tabular-nums tracking-tight">
                          {formatTime(ev.end_time)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Deadlines + Flattened Daily Nutrition/Gym Status Bar */}
        <div className="lg:col-span-5 space-y-6">
          {/* Upcoming Canvas Deadlines */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider font-sans">
                Upcoming Deadlines (Next 7 Days)
              </h2>
              <Link
                href="/academics"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors flex items-center gap-1 font-sans"
              >
                <span>All Active</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
            </div>

            <div className="divide-y divide-[var(--border-hairline)]/30 border-y border-[var(--border-hairline)]/30">
              {upcomingDeadlines.length === 0 ? (
                <div className="py-6 text-center text-xs text-[var(--text-muted)] font-sans">
                  No deadlines due this week.
                </div>
              ) : (
                upcomingDeadlines.map((hw) => {
                  const cleanedTitle = cleanAssignmentTitle(hw.title);
                  const isDueToday =
                    hw.due_at && toInputDate(hw.due_at) === todayIso;
                  const dueTime = hw.due_at ? new Date(hw.due_at).getTime() : 0;
                  const isGraceWindow = !hw.is_submitted && dueTime > 0 && dueTime < nowMs && (nowMs - dueTime <= 48 * 3600 * 1000);

                  return (
                    <div
                      key={hw.id}
                      onClick={() => {
                        setSelectedAssignment(hw);
                        setIsAssignmentModalOpen(true);
                      }}
                      className="py-2.5 flex items-start justify-between gap-3 group hover:bg-white/[0.04] px-2 rounded-md transition-colors cursor-pointer"
                      title="Click to inspect structured deliverables, rubric & summary"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 rounded text-xs font-medium font-sans bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] whitespace-nowrap shrink-0">
                            {hw.course_name || "Course"}
                          </span>
                          <span className="text-xs font-medium text-[var(--text-primary)] truncate font-sans">
                            {cleanedTitle}
                          </span>
                        </div>
                        {hw.ai_summary && (
                          <p className="text-[11px] text-[var(--text-muted)] truncate mt-0.5 font-sans">
                            {hw.ai_summary}
                          </p>
                        )}
                      </div>

                      <div className="text-right shrink-0 text-xs font-sans">
                        <span
                          className={`font-semibold font-sans tabular-nums ${
                            isGraceWindow
                              ? "text-amber-400"
                              : isDueToday
                              ? "text-[var(--semantic-danger)]"
                              : "text-[var(--semantic-warning)]"
                          }`}
                        >
                          {isGraceWindow ? "Needs Submission (Grace Window)" : formatDaysRemaining(hw.due_at)}
                        </span>
                        <span className="block text-micro text-[var(--text-muted)] font-sans">
                          {formatDate(hw.due_at)} · {formatTime(hw.due_at)}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Flattened Daily Nutrition Status Bar */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-[var(--border-hairline)]/30">
              <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider font-sans">
                Nutrition & Macro Floor
              </h2>
              <Link
                href="/health"
                className="text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors font-sans"
              >
                Meal Prep Details
              </Link>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-1">
              <div>
                <span className="text-[11px] text-[var(--text-muted)] block font-sans">Protein Target</span>
                <span className="text-sm font-semibold font-sans text-[var(--text-primary)] tabular-nums">
                  {profile?.daily_protein_g ?? 155}g / day
                </span>
              </div>
              <div>
                <span className="text-[11px] text-[var(--text-muted)] block font-sans">Daily Energy</span>
                <span className="text-sm font-semibold font-sans text-[var(--text-primary)] tabular-nums">
                  {(profile?.daily_calories_target ?? 2600).toLocaleString()} kcal
                </span>
              </div>
            </div>

            <div className="pt-2 border-t border-[var(--border-hairline)]/30 flex items-center justify-between text-xs text-[var(--text-muted)] font-sans">
              <span className="truncate">
                {profile?.dietary_notes || `Carbs ${profile?.daily_carbs_g ?? 320}g · Fats ${profile?.daily_fats_g ?? 75}g`}
              </span>
              <Link href="/setup" className="text-[var(--accent-primary)] hover:underline shrink-0 ml-2">
                Edit in Setup
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Event Detail Card Modal */}
      <EventDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedEvent(null);
        }}
        event={selectedEvent}
        onUpdate={(updated) => {
          setEvents((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
          setSelectedEvent(updated);
        }}
        onDelete={(deletedId) => {
          setEvents((prev) => prev.filter((e) => e.id !== deletedId));
          setSelectedEvent(null);
          setIsDetailModalOpen(false);
        }}
      />

      {/* Assignment Task Detail Modal */}
      <AssignmentDetailModal
        isOpen={isAssignmentModalOpen}
        onClose={() => {
          setIsAssignmentModalOpen(false);
          setSelectedAssignment(null);
        }}
        assignment={selectedAssignment}
        onToggleSubmit={(id, nextState) => {
          setAssignments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, is_submitted: nextState } : a))
          );
          loadData();
        }}
        onAnalyzed={(id, fields) => {
          setAssignments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, ...fields } : a))
          );
          setSelectedAssignment((prev) => (prev && prev.id === id ? { ...prev, ...fields } : prev));
        }}
      />

      {/* Add Event / Task Modal Card */}
      <AddEventModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onCreated={(created) => {
          setEvents((prev) => [...prev, created]);
          setSelectedEvent(created);
          setIsDetailModalOpen(true);
        }}
      />
    </div>
  );
}
