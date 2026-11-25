"use client";

import React, { useEffect, useState } from "react";
import {
  X,
  Calendar,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ExternalLink,
  BookOpen,
  FileText,
  Sparkles,
  RefreshCw,
  Plus,
} from "lucide-react";
import {
  toggleAssignmentSubmission,
  createCalendarEvent,
  analyzeAssignment,
  type AssignmentSections,
} from "@/lib/api";
import { formatDateTime, formatDaysRemaining } from "@/lib/formatters";
import { AcademicSpecViewer, FormattedMarkdown } from "@/components/ui/formatted-content";
import { useProfile } from "@/components/profile-provider";

export interface AcademicAssignment {
  id: string;
  course_name?: string;
  title: string;
  description?: string;
  url?: string;
  due_at?: string | null;
  status?: string;
  is_submitted?: boolean;
  submission_status?: string;
  is_tentative?: boolean;
  syllabus_notes?: string;
  ai_summary?: string | null;
  ai_sections?: AssignmentSections | null;
  ai_model?: string | null;
  ai_analyzed_at?: string | null;
  item_type?: string;
}

interface AssignmentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  assignment: AcademicAssignment | null;
  onToggleSubmit?: (assignmentId: string, newSubmittedState: boolean) => void;
  onScheduleFocus?: (assignment: AcademicAssignment) => void;
  onAnalyzed?: (assignmentId: string, updatedFields: Partial<AcademicAssignment>) => void;
}

export function AssignmentDetailModal({
  isOpen,
  onClose,
  assignment,
  onToggleSubmit,
  onScheduleFocus,
  onAnalyzed,
}: AssignmentDetailModalProps) {
  const { canvasUrl, studySanctuary, academicProfile, profile } = useProfile();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmittedState, setIsSubmittedState] = useState(false);
  const [scheduleSuccess, setScheduleSuccess] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiSummary, setAiSummary] = useState<string | null>(null);
  const [aiSections, setAiSections] = useState<AssignmentSections | null>(null);
  const [aiModel, setAiModel] = useState<string | null>(null);
  const [analyzeNotice, setAnalyzeNotice] = useState<{ type: "info" | "warn"; text: string } | null>(null);

  useEffect(() => {
    if (assignment) {
      setIsSubmittedState(Boolean(assignment.is_submitted));
      setScheduleSuccess(false);
      setAiSummary(assignment.ai_summary || null);
      setAiSections(assignment.ai_sections || null);
      setAiModel(assignment.ai_model || null);
      setAnalyzeNotice(null);
    }
  }, [assignment]);

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

  if (!isOpen || !assignment) return null;

  // Clean title & course
  const cleanTitle = assignment.title
    .replace(/\s*\[.*?\]\s*/g, "")
    .replace(/\s*\(.*?\)\s*/g, "")
    .trim();

  const cleanCourse = (assignment.course_name || academicProfile)
    .replace(/[[\]]/g, "")
    .replace(/_/g, " ")
    .trim();

  const tzShort =
    new Date()
      .toLocaleTimeString("en-US", { timeZoneName: "short", timeZone: profile?.timezone || undefined })
      .split(" ")
      .pop() || "Local";

  // Due time computations
  const nowMs = Date.now();
  const dueTime = assignment.due_at ? new Date(assignment.due_at).getTime() : 0;
  const isGraceWindow =
    !isSubmittedState && dueTime > 0 && dueTime < nowMs && nowMs - dueTime <= 48 * 3600 * 1000;
  const isPastDue = !isSubmittedState && dueTime > 0 && dueTime < nowMs && !isGraceWindow;

  // Handle Toggle Submission
  const handleToggle = async () => {
    setIsSubmitting(true);
    try {
      await toggleAssignmentSubmission(assignment.id);
      const nextState = !isSubmittedState;
      setIsSubmittedState(nextState);
      if (onToggleSubmit) {
        onToggleSubmit(assignment.id, nextState);
      }
      window.dispatchEvent(new Event("lifeops-refresh-assignments"));
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch (e) {
      console.error("Failed to toggle submission status:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnalyze = async (force = false) => {
    setAnalyzing(true);
    setAnalyzeNotice(null);
    try {
      const res = await analyzeAssignment(assignment.id, force);
      if (res?.ai_summary) setAiSummary(res.ai_summary);
      if (res?.ai_sections) setAiSections(res.ai_sections);
      if (res?.ai_model) setAiModel(res.ai_model);
      if (res?.message) {
        setAnalyzeNotice({
          type: res.rate_limited ? "warn" : "info",
          text: res.message,
        });
      }
      if (onAnalyzed) {
        onAnalyzed(assignment.id, {
          ai_summary: res.ai_summary,
          ai_sections: res.ai_sections,
          ai_model: res.ai_model,
          ai_analyzed_at: res.ai_analyzed_at || null,
        });
      }
      window.dispatchEvent(new Event("lifeops-refresh-assignments"));
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch (err: any) {
      setAnalyzeNotice({
        type: "warn",
        text: err?.message || "Could not analyze assignment right now.",
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Quick schedule 2h study block
  const handleQuickSchedule = async () => {
    if (onScheduleFocus) {
      onScheduleFocus(assignment);
      return;
    }
    setScheduleLoading(true);
    try {
      const now = new Date();
      const start = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour from now
      const end = new Date(start.getTime() + 2 * 60 * 60 * 1000); // 2-hour duration

      await createCalendarEvent({
        summary: `Focus Sprint: ${cleanTitle}`,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        location: studySanctuary || "Library Quiet Desk",
        description: `Dedicated deep work session for ${cleanCourse}: ${cleanTitle}.`,
        source: "life_ops_study_block",
        color: "#d97706",
      });

      setScheduleSuccess(true);
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch (e) {
      console.error("Failed to schedule focus block:", e);
    } finally {
      setScheduleLoading(false);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-3xl bg-[var(--bg-base)] border border-[var(--border-hairline)] rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/50 flex items-start justify-between gap-3 shrink-0">
          <div className="space-y-1.5 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded text-micro font-mono font-semibold uppercase tracking-wider bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30">
                {cleanCourse}
              </span>

              <span className="px-2 py-0.5 rounded text-micro font-mono font-semibold uppercase tracking-wider bg-sky-500/15 text-sky-400 border border-sky-500/30">
                Assignment Task
              </span>

              {isSubmittedState ? (
                <span className="px-2 py-0.5 rounded text-micro font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                  <span>Submitted</span>
                </span>
              ) : isGraceWindow ? (
                <span className="px-2 py-0.5 rounded text-micro font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Grace Window Active</span>
                </span>
              ) : isPastDue ? (
                <span className="px-2 py-0.5 rounded text-micro font-medium bg-red-500/15 text-red-400 border border-red-500/30 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" />
                  <span>Past Due</span>
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-micro font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>Active Task</span>
                </span>
              )}

              {assignment.is_tentative && (
                <span className="px-2 py-0.5 rounded text-micro font-mono bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  Tentative Syllabus
                </span>
              )}
            </div>

            <h3
              className="text-lg sm:text-xl font-semibold text-[var(--text-primary)] font-serif italic leading-snug"
              style={{ fontFamily: "var(--font-serif)" }}
            >
              {cleanTitle}
            </h3>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--bg-surface)] transition-colors cursor-pointer shrink-0"
            title="Close modal (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Key Metrics Banner */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 bg-[var(--bg-surface)]/25 border-b border-[var(--border-hairline)] text-xs shrink-0">
          <div>
            <span className="text-micro font-mono uppercase text-[var(--text-muted)] block mb-0.5">
              Due Date ({tzShort})
            </span>
            <span className="font-semibold text-[var(--text-primary)] font-sans">
              {assignment.due_at ? formatDateTime(assignment.due_at) : "No due date specified"}
            </span>
          </div>

          <div>
            <span className="text-micro font-mono uppercase text-[var(--text-muted)] block mb-0.5">
              Horizon Status
            </span>
            <span
              className={`font-semibold font-sans ${
                isSubmittedState
                  ? "text-emerald-400"
                  : isGraceWindow
                  ? "text-amber-400"
                  : isPastDue
                  ? "text-red-400"
                  : "text-[var(--accent-primary)]"
              }`}
            >
              {isSubmittedState
                ? "Completed"
                : isGraceWindow
                ? "Grace Window Open"
                : assignment.due_at
                ? formatDaysRemaining(assignment.due_at)
                : "Open"}
            </span>
          </div>

          <div className="col-span-2 sm:col-span-1 flex items-center justify-between gap-2">
            <div>
              <span className="text-micro font-mono uppercase text-[var(--text-muted)] block mb-0.5">
                Task Breakdown
              </span>
              <span className="font-mono text-micro text-[var(--text-secondary)]">
                {aiModel?.startsWith("gemini")
                  ? `Gemini (${aiModel})`
                  : aiSections
                  ? "Local Structured Parser"
                  : "Unparsed Spec"}
              </span>
            </div>
            <button
              type="button"
              disabled={analyzing}
              onClick={() => handleAnalyze(Boolean(aiSections))}
              className="px-2.5 py-1 rounded-md text-[11px] font-medium border border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] hover:bg-[var(--accent-primary)]/20 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50 shrink-0"
              title="Use Gemini AI (or local fallback) to summarize & split deliverables/rubric"
            >
              <Sparkles className={`w-3 h-3 ${analyzing ? "animate-spin" : ""}`} />
              <span>{analyzing ? "Analyzing..." : aiSections ? "Re-analyze" : "Analyze Task"}</span>
            </button>
          </div>
        </div>

        {/* Assignment Spec & Instructions (Formatted Rich Viewer) */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {analyzeNotice && (
            <div
              className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 ${
                analyzeNotice.type === "warn"
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                  : "border-sky-500/40 bg-sky-500/10 text-sky-300"
              }`}
            >
              <span>{analyzeNotice.text}</span>
              <a href="/setup" className="underline font-medium shrink-0">
                Setup API Key
              </a>
            </div>
          )}

          {(aiSummary || aiSections?.summary) && (
            <div className="p-4 rounded-xl border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/[0.06] space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent-primary)] font-semibold flex items-center gap-1.5">
                  <Sparkles className="w-3 h-3" />
                  <span>Task Summary</span>
                </span>
                {aiSections?.estimated_effort && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                    Est. {aiSections.estimated_effort}
                  </span>
                )}
              </div>
              <p className="text-xs sm:text-sm text-[var(--text-primary)] leading-relaxed font-sans">
                {aiSummary || aiSections?.summary}
              </p>
            </div>
          )}

          <AcademicSpecViewer
            rawSpec={assignment.description || ""}
            aiSections={aiSections}
            courseName={cleanCourse}
            title={cleanTitle}
          />

          {assignment.syllabus_notes && (
            <div className="p-3.5 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/30 text-xs space-y-1.5">
              <span className="text-[10px] font-mono uppercase tracking-wider text-[var(--accent-primary)] font-semibold block">
                Syllabus Policy Note
              </span>
              <FormattedMarkdown content={assignment.syllabus_notes} />
            </div>
          )}
        </div>

        {/* Action Footer Toolbar */}
        <div className="p-4 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)]/70 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={handleToggle}
              className={`flex-1 sm:flex-initial py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer border ${
                isSubmittedState
                  ? "bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-red-400 border-[var(--border-hairline)]"
                  : "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 border-emerald-500/30"
              }`}
            >
              {isSubmitting ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <CheckCircle2 className="w-3.5 h-3.5" />
              )}
              <span>{isSubmittedState ? "Mark as Incomplete" : "Mark as Submitted"}</span>
            </button>

            <button
              type="button"
              disabled={scheduleLoading || scheduleSuccess}
              onClick={handleQuickSchedule}
              className="flex-1 sm:flex-initial py-2 px-3 rounded-lg text-xs font-semibold bg-[var(--accent-primary)] text-stone-950 hover:opacity-95 transition-opacity flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 shadow-xs"
            >
              {scheduleLoading ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              ) : scheduleSuccess ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Scheduled!</span>
                </>
              ) : (
                <>
                  <Calendar className="w-3.5 h-3.5" />
                  <span>Schedule Study Block</span>
                </>
              )}
            </button>
          </div>

          <a
            href={assignment.url || canvasUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors py-1 px-2 rounded font-sans"
          >
            <span>Open in Canvas</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        </div>
      </div>
    </div>
  );
}
