"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Clock,
  MapPin,
  Calendar as CalendarIcon,
  Tag,
  AlignLeft,
  Trash2,
  Edit3,
  Check,
  ArrowRightLeft,
  ArrowRight,
  Shield,
  Zap,
  AlertTriangle,
  RotateCcw,
  Repeat,
} from "lucide-react";
import {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  requestAdjustment,
} from "@/lib/api";
import {
  formatTime,
  formatDate,
  formatDateTime,
  toInputDate,
  toInputTime,
  fromInputDateTime,
} from "@/lib/formatters";
import { FormattedMarkdown } from "@/components/ui/formatted-content";
import { ThemedSelect } from "@/components/ui/themed-select";

/* -------------------------------------------------------------------------- */
/*                        THEMED DATE & TIME DROPDOWNS                        */
/* -------------------------------------------------------------------------- */

function formatTime12(time24: string): string {
  if (!time24 || !time24.includes(":")) return time24;
  const [hStr, mStr] = time24.split(":");
  let h = parseInt(hStr, 10);
  const m = (mStr || "00").padStart(2, "0");
  if (Number.isNaN(h)) return time24;
  const ampm = h >= 12 ? "PM" : "AM";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h.toString().padStart(2, "0")}:${m} ${ampm}`;
}

function parseTime24(time24: string): { hour12: number; minute: number; period: "AM" | "PM" } {
  const match = (time24 || "").trim().match(/^(\d{1,2}):(\d{1,2})$/);
  let h = match ? Math.min(23, Math.max(0, parseInt(match[1], 10))) : 9;
  const m = match ? Math.min(59, Math.max(0, parseInt(match[2], 10))) : 0;
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  let hour12 = h % 12;
  if (hour12 === 0) hour12 = 12;
  return { hour12, minute: m, period };
}

function to24Hour(hour12: number, minute: number, period: "AM" | "PM"): string {
  const clampedH = Math.min(12, Math.max(1, hour12));
  const clampedM = Math.min(59, Math.max(0, minute));
  let h24 = clampedH % 12;
  if (period === "PM") h24 += 12;
  return `${h24.toString().padStart(2, "0")}:${clampedM.toString().padStart(2, "0")}`;
}

const HOUR_CHOICES = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTE_CHOICES = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55];

function getDynamicPresetDates(): Array<{ value: string; label: string }> {
  const base = new Date();
  const list: Array<{ value: string; label: string }> = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    const iso = toInputDate(d.toISOString());
    const dateLabel = d.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
    const suffix = i === 0 ? " (Today)" : i === 1 ? " (Tomorrow)" : "";
    list.push({ value: iso, label: `${dateLabel}${suffix}` });
  }
  return list;
}

export function ThemedTimeSelect({
  value,
  onChange,
  className = "",
  id,
  ariaLabel,
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
  id?: string;
  ariaLabel?: string;
}) {
  const parsed = useMemo(() => parseTime24(value), [value]);
  const [open, setOpen] = useState(false);
  const [hourInput, setHourInput] = useState(() => parsed.hour12.toString().padStart(2, "0"));
  const [minuteInput, setMinuteInput] = useState(() => parsed.minute.toString().padStart(2, "0"));
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    openUpward: boolean;
  } | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHourInput(parsed.hour12.toString().padStart(2, "0"));
    setMinuteInput(parsed.minute.toString().padStart(2, "0"));
  }, [parsed.hour12, parsed.minute]);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const popWidth = 252;
    const gap = 6;
    const margin = 12;
    const spaceBelow = window.innerHeight - rect.bottom - margin;
    const spaceAbove = rect.top - margin;
    const openUpward = spaceBelow < 275 && spaceAbove > spaceBelow;
    const left = Math.max(margin, Math.min(rect.left, window.innerWidth - popWidth - margin));

    setCoords({
      top: openUpward ? rect.top - gap : rect.bottom + gap,
      left,
      openUpward,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    updatePosition();

    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || popoverRef.current?.contains(target)) {
        return;
      }
      setOpen(false);
    };

    const onScrollOrResize = (e: Event) => {
      if (e.type === "scroll" && popoverRef.current && e.target instanceof Node) {
        if (popoverRef.current.contains(e.target)) return;
      }
      updatePosition();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", onMouseDown);
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, updatePosition]);

  const commitParts = (nextH12: number, nextMin: number, nextPeriod: "AM" | "PM") => {
    onChange(to24Hour(nextH12, nextMin, nextPeriod));
  };

  const commitHourInput = () => {
    const num = parseInt(hourInput, 10);
    const clamped = Number.isNaN(num) ? parsed.hour12 : Math.min(12, Math.max(1, num));
    setHourInput(clamped.toString().padStart(2, "0"));
    commitParts(clamped, parsed.minute, parsed.period);
  };

  const commitMinuteInput = () => {
    const num = parseInt(minuteInput, 10);
    const clamped = Number.isNaN(num) ? parsed.minute : Math.min(59, Math.max(0, num));
    setMinuteInput(clamped.toString().padStart(2, "0"));
    commitParts(parsed.hour12, clamped, parsed.period);
  };

  return (
    <div className={`relative w-full ${className}`.trim()}>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className="w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] font-sans tabular-nums whitespace-nowrap focus:outline-hidden focus:border-[var(--accent-primary)] hover:border-[var(--text-muted)] cursor-pointer transition-colors"
      >
        <span className="truncate text-left">{formatTime12(value || "09:00")}</span>
        <Clock className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />
      </button>

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={popoverRef}
            role="dialog"
            aria-label={ariaLabel || "Select time"}
            style={{
              position: "fixed",
              top: `${coords.top}px`,
              left: `${coords.left}px`,
              width: "252px",
              transform: coords.openUpward ? "translateY(-100%)" : undefined,
            }}
            className="z-[250] rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] shadow-2xl p-3 space-y-3"
          >
            {/* Compact Direct Entry + AM/PM Toggle */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Hour"
                  maxLength={2}
                  value={hourInput}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
                    setHourInput(digits);
                    const n = parseInt(digits, 10);
                    if (!Number.isNaN(n) && n >= 1 && n <= 12) {
                      commitParts(n, parsed.minute, parsed.period);
                    }
                  }}
                  onBlur={commitHourInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitHourInput();
                      setOpen(false);
                    }
                  }}
                  className="w-10 py-1.5 text-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] text-xs font-mono font-semibold text-[var(--text-primary)] tabular-nums focus:outline-hidden focus:border-[var(--accent-primary)]"
                />
                <span className="text-xs font-mono text-[var(--text-muted)] font-semibold">:</span>
                <input
                  type="text"
                  inputMode="numeric"
                  aria-label="Minute"
                  maxLength={2}
                  value={minuteInput}
                  onFocus={(e) => e.currentTarget.select()}
                  onChange={(e) => {
                    const digits = e.target.value.replace(/\D/g, "").slice(0, 2);
                    setMinuteInput(digits);
                    const n = parseInt(digits, 10);
                    if (!Number.isNaN(n) && n >= 0 && n <= 59 && digits.length === 2) {
                      commitParts(parsed.hour12, n, parsed.period);
                    }
                  }}
                  onBlur={commitMinuteInput}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      commitMinuteInput();
                      setOpen(false);
                    }
                  }}
                  className="w-10 py-1.5 text-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] text-xs font-mono font-semibold text-[var(--text-primary)] tabular-nums focus:outline-hidden focus:border-[var(--accent-primary)]"
                />
              </div>

              <div className="flex rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] p-0.5">
                {(["AM", "PM"] as const).map((p) => {
                  const active = parsed.period === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => commitParts(parsed.hour12, parsed.minute, p)}
                      className={`px-2 py-1 rounded text-[11px] font-semibold transition-colors cursor-pointer ${
                        active
                          ? "bg-[var(--accent-primary)] text-stone-950"
                          : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Compact Hour Grid */}
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Hour
              </div>
              <div className="grid grid-cols-6 gap-1">
                {HOUR_CHOICES.map((h) => {
                  const active = parsed.hour12 === h;
                  return (
                    <button
                      key={h}
                      type="button"
                      onClick={() => commitParts(h, parsed.minute, parsed.period)}
                      className={`py-1 rounded text-[11px] font-mono tabular-nums border transition-colors cursor-pointer ${
                        active
                          ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border-[var(--accent-primary)]/45 font-semibold"
                          : "bg-[var(--bg-base)] text-[var(--text-secondary)] border-transparent hover:border-[var(--border-hairline)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      {h}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Compact 5-Min Minute Grid */}
            <div className="space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)]">
                Minute
              </div>
              <div className="grid grid-cols-6 gap-1">
                {MINUTE_CHOICES.map((m) => {
                  const active = parsed.minute === m;
                  const label = m.toString().padStart(2, "0");
                  return (
                    <button
                      key={m}
                      type="button"
                      onClick={() => commitParts(parsed.hour12, m, parsed.period)}
                      className={`py-1 rounded text-[11px] font-mono tabular-nums border transition-colors cursor-pointer ${
                        active
                          ? "bg-[var(--accent-primary)]/20 text-[var(--accent-primary)] border-[var(--accent-primary)]/45 font-semibold"
                          : "bg-[var(--bg-base)] text-[var(--text-secondary)] border-transparent hover:border-[var(--border-hairline)] hover:text-[var(--text-primary)]"
                      }`}
                    >
                      :{label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-1 border-t border-[var(--border-hairline)] flex items-center justify-between">
              <span className="text-[11px] font-mono text-[var(--text-muted)] tabular-nums">
                {formatTime12(value || "09:00")}
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-2.5 py-1 rounded-md text-[11px] font-semibold bg-[var(--bg-surface)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] border border-[var(--border-hairline)] cursor-pointer transition-colors"
              >
                Done
              </button>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}

export function ThemedDateSelect({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (val: string) => void;
  className?: string;
}) {
  const [showPicker, setShowPicker] = useState(false);
  const presetDates = useMemo(() => getDynamicPresetDates(), []);
  const isPreset = presetDates.some((d) => d.value === value);

  return (
    <div className={`space-y-1.5 ${className}`}>
      <ThemedSelect
        value={isPreset ? value : "custom"}
        onChange={(e) => {
          if (e.target.value === "custom") {
            setShowPicker(true);
          } else {
            setShowPicker(false);
            onChange(e.target.value);
          }
        }}
        selectClassName="px-2.5"
        icon={<CalendarIcon className="w-3.5 h-3.5 text-[var(--text-muted)] shrink-0" />}
      >
        {presetDates.map((d) => (
          <option key={d.value} value={d.value} className="bg-[var(--bg-elevated)] text-[var(--text-primary)] font-sans">
            {d.label}
          </option>
        ))}
        {!isPreset && value && (
          <option value="custom" className="bg-[var(--bg-elevated)] text-[var(--text-primary)] font-sans">
            {formatDate(value)}
          </option>
        )}
        {isPreset && (
          <option value="custom" className="bg-[var(--bg-elevated)] text-[var(--accent-primary)] font-sans">
            Choose other date...
          </option>
        )}
      </ThemedSelect>

      {(!isPreset || showPicker) && (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-2.5 py-1 text-xs rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] font-sans focus:outline-hidden focus:border-[var(--accent-primary)] transition-colors"
          required
        />
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               EVENT DETAIL MODAL                           */
/* -------------------------------------------------------------------------- */

interface EventDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  event: any | null;
  onUpdate: (updatedEvent: any) => void;
  onDelete: (eventId: string) => void;
}

export function EventDetailModal({
  isOpen,
  onClose,
  event,
  onUpdate,
  onDelete,
}: EventDetailModalProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

  // Edit form state
  const [summary, setSummary] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");
  const [location, setLocation] = useState("");
  const [calendarName, setCalendarName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (event) {
      setSummary(event.summary || "");
      setDate(toInputDate(event.start_time));
      setStartTime(toInputTime(event.start_time));
      setEndTime(toInputTime(event.end_time));
      setLocation(event.location || "");
      setCalendarName(event.calendar_name || "Academics");
      setDescription(event.description || "");
      setIsEditing(false);
      setConfirmDelete(false);
      setFeedbackMsg(null);
    }
  }, [event]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !event) return null;

  const isCanvasTask = event.source === "canvas_inferred";
  const isStudyBlock = event.source === "life_ops_study_block";
  const isTask = event.item_type === "task" || isStudyBlock || isCanvasTask;
  const isRecurring = Boolean(
    event.recurring_rule ||
      event.source === "life_ops_study_block" ||
      event.summary?.includes("COMM") ||
      event.summary?.includes("STAT") ||
      event.summary?.includes("CS") ||
      event.summary?.includes("LeetCode") ||
      event.summary?.includes("Internship") ||
      event.summary?.includes("NLP") ||
      event.summary?.includes("Study")
  );

  // Toggle between Task (study block) and Fixed Event
  const handleToggleTaskEvent = async () => {
    const newSource = isTask ? "life_ops_manual" : "life_ops_study_block";
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const updated = await updateCalendarEvent(event.id, { source: newSource });
      onUpdate(updated);
      setFeedbackMsg({
        type: "success",
        text: isTask
          ? "Converted to Fixed Event (protected from automated shifts)."
          : "Converted to Task / Flexible Block (autopilot enabled).",
      });
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to update item source.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick Shift +1 Hr
  const handleShiftOneHour = async () => {
    setIsSubmitting(true);
    setFeedbackMsg(null);
    try {
      const s = new Date(event.start_time);
      const e = new Date(event.end_time);
      s.setHours(s.getHours() + 1);
      e.setHours(e.getHours() + 1);

      const res = await requestAdjustment({
        event_id: event.id,
        new_start: s.toISOString(),
        new_end: e.toISOString(),
        reason: "User requested 1-hour shift from card inspector",
      });

      if (res.status === "auto_applied" || res.status === "applied") {
        const updatedEvent = res.event || {
          ...event,
          start_time: s.toISOString(),
          end_time: e.toISOString(),
        };
        onUpdate(updatedEvent);
        setFeedbackMsg({ type: "success", text: "Shifted forward by 1 hour. Rollback logged in Logs." });
        window.dispatchEvent(new Event("lifeops-refresh-calendar"));
        window.dispatchEvent(new Event("lifeops-refresh-logs"));
      } else if (res.status === "pending_approval" || res.status === "staged") {
        setFeedbackMsg({
          type: "success",
          text: "Shift touches a fixed event; proposed change sent to Reviews & Approvals.",
        });
        window.dispatchEvent(new Event("lifeops-refresh-pending"));
      }
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to shift event.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Save Edit Form
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) {
      setFeedbackMsg({ type: "error", text: "Title is required." });
      return;
    }

    try {
      setIsSubmitting(true);
      const startIso = fromInputDateTime(date, startTime);
      const endIso = fromInputDateTime(date, endTime);

      if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
        setFeedbackMsg({ type: "error", text: "End time must be after start time." });
        setIsSubmitting(false);
        return;
      }

      const updated = await updateCalendarEvent(event.id, {
        summary: summary.trim(),
        start_time: startIso,
        end_time: endIso,
        location: location.trim() || undefined,
        calendar_name: calendarName.trim() || undefined,
        description: description.trim() || undefined,
      });

      onUpdate(updated);
      setIsEditing(false);
      setFeedbackMsg({ type: "success", text: "Changes saved successfully." });
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to save changes.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Granular Recurring Deletion (mode: single | week | series)
  const handleDelete = async (mode: "single" | "week" | "series" = "single") => {
    setIsSubmitting(true);
    try {
      await deleteCalendarEvent(event.id, mode);
      onDelete(event.id);
      onClose();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch (err: any) {
      setFeedbackMsg({
        type: "error",
        text: err.message || "Failed to delete item.",
      });
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150 font-sans"
      >
        {/* Card Top Banner / Badges */}
        <div className="px-5 py-3.5 border-b border-[var(--border-hairline)] bg-[var(--bg-base)]/60 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {isTask ? (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30">
                <Zap className="w-3 h-3" />
                <span>{isCanvasTask ? "Assignment Task" : "Task / Flexible Block"}</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                <Shield className="w-3 h-3 text-[var(--accent-primary)]" />
                <span>Fixed Calendar Event</span>
              </span>
            )}
            {event.recurring_rule && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-micro font-medium bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-hairline)]">
                <Repeat className="w-2.5 h-2.5" />
                <span>Recurring</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            {!isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
                title="Edit event details"
              >
                <Edit3 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              title="Close modal"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Feedback Alert */}
        {feedbackMsg && (
          <div
            className={`mx-5 mt-4 p-2.5 rounded-md text-xs border flex items-center gap-2 shrink-0 ${
              feedbackMsg.type === "success"
                ? "border-[var(--semantic-success)]/40 bg-[var(--semantic-success)]/10 text-[var(--semantic-success)]"
                : "border-[var(--semantic-danger)]/40 bg-[var(--semantic-danger)]/10 text-[var(--semantic-danger)]"
            }`}
          >
            {feedbackMsg.type === "success" ? (
              <Check className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {!isEditing ? (
            /* VIEW DETAILS MODE */
            <div className="space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[var(--text-primary)] tracking-tight">
                  {event.summary}
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs text-[var(--text-muted)] font-medium">
                    {event.calendar_name || "General"}
                  </span>
                  {event.source && (
                    <span className="text-micro font-sans px-1.5 py-0.2 rounded bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-hairline)]">
                      {event.source}
                    </span>
                  )}
                </div>
              </div>

              {/* Timing, Date, Location metadata */}
              <div className="space-y-2.5 py-3 border-y border-[var(--border-hairline)] text-xs">
                <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                  <CalendarIcon className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  <span>{formatDate(event.start_time)}</span>
                </div>

                <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                  <Clock className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  <span className="font-sans tabular-nums font-medium text-[var(--text-primary)]">
                    {formatTime(event.start_time)} – {formatTime(event.end_time)}
                  </span>
                </div>

                {event.location && (
                  <div className="flex items-center gap-3 text-[var(--text-secondary)]">
                    <MapPin className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                    <span>{event.location}</span>
                  </div>
                )}

                {/* Notes / Description */}
                {event.description && (
                  <div className="flex items-start gap-3 text-[var(--text-secondary)] pt-1">
                    <AlignLeft className="w-4 h-4 text-[var(--text-muted)] shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0 overflow-x-auto break-words text-[var(--text-secondary)]">
                      <FormattedMarkdown content={event.description} />
                    </div>
                  </div>
                )}
              </div>

              {/* Conversion Explanation Card */}
              <div className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] flex items-start gap-3">
                <ArrowRightLeft className="w-4 h-4 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                <div className="flex-1 text-xs">
                  <p className="font-medium text-[var(--text-primary)]">
                    {isTask ? "Autopilot Active (Flexible Task)" : "Protected Fixed Event"}
                  </p>
                  <p className="text-[var(--text-muted)] mt-0.5 leading-relaxed">
                    {isTask
                      ? "This study block will be autonomously rescheduled if Canvas due dates shift or class conflicts arise."
                      : "This slot is locked and treated as a fixed commitment. Life-Ops will never reschedule it without your approval."}
                  </p>
                </div>
              </div>
            </div>
          ) : (
            /* EDIT FORM MODE */
            <form onSubmit={handleSaveEdit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Title
                </label>
                <input
                  type="text"
                  value={summary}
                  onChange={(e) => setSummary(e.target.value)}
                  placeholder="e.g. PA4 Implementation, COMM 2004..."
                  className="w-full px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-primary)] font-sans"
                  required
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Date
                  </label>
                  <ThemedDateSelect value={date} onChange={setDate} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Start Time
                  </label>
                  <ThemedTimeSelect value={startTime} onChange={setStartTime} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    End Time
                  </label>
                  <ThemedTimeSelect value={endTime} onChange={setEndTime} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Location (Optional)
                  </label>
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Science Hall 100, Library 3rd Floor"
                    className="w-full px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-primary)] font-sans"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                    Calendar / Tag
                  </label>
                  <input
                    type="text"
                    value={calendarName}
                    onChange={(e) => setCalendarName(e.target.value)}
                    placeholder="e.g. Academics, CS 3114, Personal"
                    className="w-full px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-primary)] font-sans"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Description / Notes (Optional)
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  placeholder="Notes, study materials, topics..."
                  className="w-full px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-primary)] font-sans"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3 py-1.5 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-stone-950 hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSubmitting ? "Saving..." : "Save Changes"}</span>
                </button>
              </div>
            </form>
          )}

          {/* Granular Recurring Deletion Confirmation */}
          {confirmDelete && (
            <div className="p-3.5 rounded-lg border border-[var(--semantic-danger)]/40 bg-[var(--semantic-danger)]/10 text-xs space-y-3 animate-in fade-in">
              <div className="flex items-center gap-2 text-[var(--semantic-danger)] font-semibold font-sans">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>Delete {isTask ? "Task" : "Event"}: Choose Scope</span>
              </div>
              <p className="text-[var(--text-secondary)] font-sans text-xs">
                How would you like to delete <span className="font-semibold text-[var(--text-primary)]">“{event.summary}”</span>?
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1 font-sans">
                <button
                  type="button"
                  onClick={() => handleDelete("single")}
                  disabled={isSubmitting}
                  className="px-2.5 py-2 rounded-md border border-[var(--semantic-danger)]/50 bg-[var(--bg-base)] hover:bg-[var(--semantic-danger)]/20 text-[var(--semantic-danger)] font-medium text-center transition-colors flex flex-col items-center justify-center gap-1 group"
                >
                  <span className="font-semibold text-xs text-[var(--text-primary)] group-hover:text-[var(--semantic-danger)]">This event only</span>
                  <span className="text-[10px] text-[var(--text-muted)]">Removes only this slot</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete("week")}
                  disabled={isSubmitting}
                  className="px-2.5 py-2 rounded-md border border-[var(--semantic-danger)]/50 bg-[var(--bg-base)] hover:bg-[var(--semantic-danger)]/20 text-[var(--semantic-danger)] font-medium text-center transition-colors flex flex-col items-center justify-center gap-1 group"
                >
                  <span className="font-semibold text-xs text-[var(--text-primary)] group-hover:text-[var(--semantic-danger)]">This week's events</span>
                  <span className="text-[10px] text-[var(--text-muted)]">Removes all this week</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete("series")}
                  disabled={isSubmitting}
                  className="px-2.5 py-2 rounded-md border border-[var(--semantic-danger)]/80 bg-[var(--semantic-danger)] text-white font-medium text-center hover:opacity-90 transition-opacity flex flex-col items-center justify-center gap-1 shadow-xs"
                >
                  <span className="font-semibold text-xs">All recurring events</span>
                  <span className="text-[10px] text-white/80">Entire series / semester</span>
                </button>
              </div>
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="px-3 py-1 rounded-md text-xs border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors font-sans"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions Bar */}
        {!isEditing && (
          <div className="px-5 py-3 border-t border-[var(--border-hairline)] bg-[var(--bg-base)]/80 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
            {/* Convert between Event and Task */}
            <button
              onClick={handleToggleTaskEvent}
              disabled={isSubmitting}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors shadow-xs"
              title={
                isTask
                  ? "Change this flexible task into a protected fixed event"
                  : "Change this fixed event into an autopilot-managed study task"
              }
            >
              <ArrowRightLeft className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>{isTask ? "Convert to Fixed Event" : "Convert to Task"}</span>
            </button>

            {/* Quick Shift, Edit & Delete */}
            <div className="flex items-center gap-2 ml-auto">
              <button
                onClick={handleShiftOneHour}
                disabled={isSubmitting}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
                title="Shift event forward by 1 hour"
              >
                <Clock className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>+1 Hr</span>
              </button>

              <button
                onClick={() => setConfirmDelete(!confirmDelete)}
                disabled={isSubmitting}
                className="p-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--semantic-danger)]/15 text-[var(--text-muted)] hover:text-[var(--semantic-danger)] hover:border-[var(--semantic-danger)]/40 transition-colors"
                title="Delete this event / task"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                ADD EVENT MODAL                             */
/* -------------------------------------------------------------------------- */

interface AddEventModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialDate?: string;
  onCreated: (newEvent: any) => void;
}

export function AddEventModal({
  isOpen,
  onClose,
  initialDate,
  onCreated,
}: AddEventModalProps) {
  const [type, setType] = useState<"event" | "task">("event");
  const [summary, setSummary] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("10:00");
  const [endTime, setEndTime] = useState("11:00");
  const [repeat, setRepeat] = useState<"none" | "weekly" | "daily_weekdays">("none");
  const [location, setLocation] = useState("");
  const [calendarName, setCalendarName] = useState("Academics");
  const [description, setDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setType("event");
      setSummary("");
      setDate(initialDate || toInputDate(new Date().toISOString()));
      setStartTime("10:00");
      setEndTime("11:00");
      setRepeat("none");
      setLocation("");
      setCalendarName("Academics");
      setDescription("");
      setError(null);
    }
  }, [isOpen, initialDate]);

  // Handle ESC key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!summary.trim()) {
      setError("Please provide a title.");
      return;
    }

    try {
      setIsSubmitting(true);
      setError(null);

      const startIso = fromInputDateTime(date, startTime);
      const endIso = fromInputDateTime(date, endTime);

      if (new Date(endIso).getTime() <= new Date(startIso).getTime()) {
        setError("End time must be after start time.");
        setIsSubmitting(false);
        return;
      }

      const source = type === "task" ? "life_ops_study_block" : "life_ops_manual";
      const newEvent = await createCalendarEvent({
        summary: summary.trim(),
        start_time: startIso,
        end_time: endIso,
        calendar_id: "primary",
        calendar_name: calendarName.trim() || (type === "task" ? "Study Block" : "Academics"),
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        source: source,
        color: type === "task" ? "#f97316" : "#38bdf8",
        repeat: repeat !== "none" ? repeat : undefined,
      });

      onCreated(newEvent);
      onClose();
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch (err: any) {
      setError(err.message || "Failed to create item.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Dimmed backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Dialog Card */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg max-h-[90vh] flex flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150 font-sans"
      >
        {/* Card Header */}
        <div className="px-5 py-4 border-b border-[var(--border-hairline)] bg-[var(--bg-base)]/60 flex items-center justify-between shrink-0">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {type === "task" ? "New Flexible Task / Study Block" : "New Calendar Event"}
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Add to your weekly schedule
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Type Toggle (Fixed Event vs Flexible Task) */}
          <div className="p-5 pb-0">
            <div className="grid grid-cols-2 p-1 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-base)] text-xs font-medium">
              <button
                type="button"
                onClick={() => setType("event")}
                className={`py-2 px-3 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  type === "event"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs font-semibold"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Shield className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                <span>Fixed Event</span>
              </button>
              <button
                type="button"
                onClick={() => setType("task")}
                className={`py-2 px-3 rounded-md transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  type === "task"
                    ? "bg-[var(--bg-surface)] text-[var(--accent-primary)] shadow-xs font-semibold"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <Zap className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span>Task / Study Block</span>
              </button>
            </div>

            <p className="text-micro text-[var(--text-muted)] mt-2 leading-relaxed">
              {type === "event"
                ? "Fixed in place (classes, exams, appointments). Autopilot will not reschedule without asking."
                : "Flexible task (study sessions, problem sets). Autopilot can reschedule to accommodate due dates."}
            </p>
          </div>

          {/* Error Alert */}
          {error && (
            <div className="mx-5 mt-4 p-2.5 rounded-md text-xs border border-[var(--semantic-danger)]/40 bg-[var(--semantic-danger)]/10 text-[var(--semantic-danger)] flex items-center gap-2">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Form Fields */}
          <form onSubmit={handleSubmit} className="p-5 space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Title
            </label>
            <input
              type="text"
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder={type === "task" ? "e.g. Study Session: PA4 Buffer Pool" : "e.g. ENGE 2724 Lab"}
              className="w-full px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-primary)] font-sans"
              required
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Date
              </label>
              <ThemedDateSelect value={date} onChange={setDate} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Start Time
              </label>
              <ThemedTimeSelect value={startTime} onChange={setStartTime} />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                End Time
              </label>
              <ThemedTimeSelect value={endTime} onChange={setEndTime} />
            </div>
          </div>

          {/* Recurrence Selector */}
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1 flex items-center gap-1.5">
              <Repeat className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>Recurrence</span>
            </label>
            <ThemedSelect
              value={repeat}
              onChange={(e) => setRepeat(e.target.value as "none" | "weekly" | "daily_weekdays")}
            >
              <option value="none" className="bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                Does not repeat (single occurrence)
              </option>
              <option value="weekly" className="bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                Repeats weekly (every week on this day through semester end)
              </option>
              <option value="daily_weekdays" className="bg-[var(--bg-elevated)] text-[var(--text-primary)]">
                Repeats every weekday (Mon–Fri through semester end)
              </option>
            </ThemedSelect>
            {repeat !== "none" && (
              <p className="text-micro text-[var(--accent-primary)] mt-1 font-sans">
                Recurring series will generate instances through December 16, 2026.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Location (Optional)
              </label>
              <input
                type="text"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g. Science Hall 100, Library 3rd Floor"
                className="w-full px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-primary)] font-sans"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Calendar / Tag
              </label>
              <input
                type="text"
                value={calendarName}
                onChange={(e) => setCalendarName(e.target.value)}
                placeholder="e.g. Academics, CS 3114, Personal"
                className="w-full px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-primary)] font-sans"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Description / Notes (Optional)
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              placeholder="Notes, links, assignments to focus on..."
              className="w-full px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] focus:outline-hidden focus:border-[var(--accent-primary)] font-sans"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 rounded-md text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] transition-colors font-sans"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-stone-950 hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-xs font-sans"
            >
              <Check className="w-3.5 h-3.5" />
              <span>
                {isSubmitting
                  ? "Creating..."
                  : type === "task"
                  ? repeat !== "none"
                    ? "Create Recurring Task"
                    : "Create Task"
                  : repeat !== "none"
                  ? "Create Recurring Event"
                  : "Create Event"}
              </span>
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
