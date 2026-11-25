"use client";

import React, { useState, useEffect, useMemo } from "react";
import {
  GraduationCap,
  RefreshCw,
  ExternalLink,
  Search,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  Check,
  AlertTriangle,
} from "lucide-react";
import {
  getAssignments,
  getCanvasStatus,
  pollCanvasNow,
  toggleAssignmentSubmission,
  searchRag,
  refreshCanvasSession,
  analyzeAssignmentsBatch,
} from "@/lib/api";
import { cleanAssignmentTitle, formatDateTime, formatDaysRemaining } from "@/lib/formatters";
import { AssignmentDetailModal, AcademicAssignment } from "@/components/academics/assignment-modal";
import { isDemoMode } from "@/lib/demo-mode";
import { useProfile } from "@/components/profile-provider";
import { Sparkles } from "lucide-react";

const ACADEMIC_DATES = [
  { event: "Fall 2026 Classes Begin", date: "Aug 24, 2026", term: "Fall 2026" },
  { event: "Last Day to Add Classes", date: "Aug 28, 2026", term: "Fall 2026" },
  { event: "Fall Break & Thanksgiving", date: "Nov 23 - 27, 2026", term: "Fall 2026" },
  { event: "Fall 2026 Classes End", date: "Dec 9, 2026", term: "Fall 2026" },
  { event: "Final Examinations", date: "Dec 11 - 16, 2026", term: "Fall 2026" },
  { event: "Spring 2027 Classes Begin", date: "Jan 19, 2027", term: "Spring 2027" },
  { event: "Spring Break", date: "Mar 6 - 14, 2027", term: "Spring 2027" },
  { event: "Spring 2027 Commencement", date: "May 14, 2027", term: "Spring 2027" },
];

export default function AcademicsPage() {
  const { canvasUrl, academicProfile } = useProfile();
  const [assignments, setAssignments] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<"upcoming" | "overdue" | "all">("upcoming");
  const [submissionFilter, setSubmissionFilter] = useState<"all" | "pending" | "submitted">("all");
  const [selectedCourse, setSelectedCourse] = useState<string>("All");
  const [searchQuery, setSearchQuery] = useState("");
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<any[]>([]);
  const [searchingRag, setSearchingRag] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [todayMidnight, setTodayMidnight] = useState<number>(0);
  const [nowDate, setNowDate] = useState<Date | null>(null);
  const [selectedAssignment, setSelectedAssignment] = useState<AcademicAssignment | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [analyzingBatch, setAnalyzingBatch] = useState(false);

  const loadAssignments = async () => {
    try {
      const data = await getAssignments("active");
      setAssignments(data);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadAssignments();
    const now = new Date();
    setNowDate(now);
    setTodayMidnight(new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime());

    const handleRefresh = () => loadAssignments();
    window.addEventListener("lifeops-refresh-calendar", handleRefresh);
    window.addEventListener("lifeops-refresh-assignments", handleRefresh);
    window.addEventListener("lifeops-profile-updated", handleRefresh);

    const timer = setInterval(() => {
      setNowDate(new Date());
    }, 10000);
    return () => {
      window.removeEventListener("lifeops-refresh-calendar", handleRefresh);
      window.removeEventListener("lifeops-refresh-assignments", handleRefresh);
      window.removeEventListener("lifeops-profile-updated", handleRefresh);
      clearInterval(timer);
    };
  }, []);

  const handleSync = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await pollCanvasNow();
      setSyncMsg(res.status === "success" ? `Synced ${res.stats?.active || 0} assignment tasks` : "Poll complete");
      await loadAssignments();
      window.dispatchEvent(new Event("lifeops-refresh-assignments"));
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch (e: any) {
      setSyncMsg(`Sync error: ${e.message}`);
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 4000);
    }
  };

  const handleAnalyzeBatch = async () => {
    setAnalyzingBatch(true);
    setSyncMsg(null);
    try {
      const res = await analyzeAssignmentsBatch(8, false);
      setSyncMsg(res.message || `Structured ${res.analyzed_count || 0} assignment tasks.`);
      await loadAssignments();
      window.dispatchEvent(new Event("lifeops-refresh-assignments"));
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch (e: any) {
      setSyncMsg(`AI organize error: ${e.message}`);
    } finally {
      setAnalyzingBatch(false);
      setTimeout(() => setSyncMsg(null), 7000);
    }
  };

  const handleRefreshSession = async () => {
    try {
      const res = await refreshCanvasSession();
      if (isDemoMode()) {
        setSyncMsg(res.message || "Demo mode: Canvas authentication is simulated.");
      } else {
        setSyncMsg("Launched headed browser for Canvas CAS / Duo SSO login.");
      }
      setTimeout(() => setSyncMsg(null), 5000);
    } catch (e: any) {
      setSyncMsg(`Could not launch login: ${e.message}`);
    }
  };

  const handleRagSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ragQuery.trim()) return;

    setSearchingRag(true);
    setRagResults([]);
    try {
      const data = await searchRag(ragQuery.trim(), 4, "canvas_syllabus");
      setRagResults(Array.isArray(data) ? data : (data as any)?.results || []);
    } catch (err) {
      console.error("RAG search failed", err);
    } finally {
      setSearchingRag(false);
    }
  };

  const handleToggleSubmission = async (id: string) => {
    try {
      const updated = await toggleAssignmentSubmission(id);
      setAssignments((prev) =>
        prev.map((a) => (a.id === id ? { ...a, ...updated } : a))
      );
      window.dispatchEvent(new Event("lifeops-refresh-assignments"));
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch (err: any) {
      console.error("Failed to toggle submission", err);
    }
  };

  // Derive unique course names
  const courseNames = useMemo(
    () => ["All", ...Array.from(new Set(assignments.map((a) => a.course_name).filter(Boolean)))],
    [assignments]
  );

  // Counts for submission filter tabs
  const pendingCount = useMemo(() => assignments.filter((a) => !a.is_submitted).length, [assignments]);
  const submittedCount = useMemo(() => assignments.filter((a) => a.is_submitted).length, [assignments]);

  // Filter and sort assignments (Upcoming-first by due date)
  const filteredAssignments = useMemo(() => {
    return assignments
      .filter((a) => {
        const matchesCourse = selectedCourse === "All" || a.course_name === selectedCourse;
        const cleaned = cleanAssignmentTitle(a.title).toLowerCase();
        const matchesSearch = !searchQuery || cleaned.includes(searchQuery.toLowerCase());
        if (!matchesCourse || !matchesSearch) return false;

        // Submission status filter
        if (submissionFilter === "pending" && a.is_submitted) return false;
        if (submissionFilter === "submitted" && !a.is_submitted) return false;

        if (!a.due_at) {
          return statusFilter === "all";
        }
        const nowMs = nowDate ? nowDate.getTime() : 0;
        const dueTime = new Date(a.due_at).getTime();
        const isGraceWindow = !a.is_submitted && nowMs > 0 && dueTime < nowMs && (nowMs - dueTime <= 48 * 3600 * 1000);
        const isOldOverdue = !a.is_submitted && nowMs > 0 && dueTime < nowMs && !isGraceWindow;
        const isUpcoming = nowMs > 0 ? (dueTime >= nowMs || isGraceWindow || (dueTime >= todayMidnight && !a.is_submitted)) : true;
        const isOverdue = isOldOverdue;

        if (statusFilter === "upcoming") return isUpcoming;
        if (statusFilter === "overdue") return isOverdue;
        return true;
      })
      .sort((a, b) => {
        if (!a.due_at) return 1;
        if (!b.due_at) return -1;
        const aTime = new Date(a.due_at).getTime();
        const bTime = new Date(b.due_at).getTime();
        if (statusFilter === "overdue") {
          return bTime - aTime; // most recently overdue first
        }
        return aTime - bTime; // ascending by due date for upcoming / all
      });
  }, [assignments, selectedCourse, searchQuery, submissionFilter, statusFilter, nowDate, todayMidnight]);

  return (
    <div className="space-y-8">
      {/* Header & Canvas Status */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-hairline)]">
        <div>
          <h1 className="text-xl font-semibold text-[var(--text-primary)] font-sans">
            Academics & Coursework
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 font-sans">
            {academicProfile} · {assignments.length} Active Canvas Assignments · Dual-Layer Ingestion Active
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Live System Time Chip */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-elevated)] font-sans text-[var(--text-secondary)] shadow-2xs">
            <Clock className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
            <span className="font-semibold text-[var(--text-primary)] tabular-nums tracking-tight">
              {nowDate ? nowDate.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZoneName: "short" }) : "--:--"}
            </span>
          </div>

          <a
            href={canvasUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-sans"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>Open Canvas</span>
          </a>

          <button
            onClick={handleAnalyzeBatch}
            disabled={analyzingBatch || assignments.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-stone-950 hover:opacity-90 transition-opacity disabled:opacity-50 font-sans cursor-pointer"
            title="Use Gemini AI (or local parser) to split assignment specs into General, Deliverables, Rubric, and Summaries"
          >
            <Sparkles className={`w-3.5 h-3.5 ${analyzingBatch ? "animate-spin" : ""}`} />
            <span>{analyzingBatch ? "Organizing..." : "AI Organize Tasks"}</span>
          </button>

          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors disabled:opacity-50 font-sans cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncing ? "animate-spin text-[var(--accent-primary)]" : ""}`} />
            <span>{syncing ? "Syncing..." : "Sync Feed"}</span>
          </button>

          <button
            onClick={handleRefreshSession}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors font-sans"
            title="Launch headed Playwright browser for Canvas SSO login"
          >
            <ExternalLink className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span>Canvas SSO Login</span>
          </button>
        </div>
      </div>

      {syncMsg && (
        <div className="p-2.5 rounded-md text-xs font-sans bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)]">
          {syncMsg}
        </div>
      )}

      {/* Semantic Syllabus RAG Search Bar */}
      <div className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider font-sans">
              Syllabus & Coursework Semantic Search (pgvector)
            </h2>
          </div>
          <span className="px-2 py-0.5 rounded text-xs font-medium font-sans bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
            gemini-embedding-001 (768-dim)
          </span>
        </div>

        <form onSubmit={handleRagSearch} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-2.5" />
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              placeholder="Ask anything about grading policies, syllabus rubrics, or exam dates..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)] font-sans"
            />
          </div>
          <button
            type="submit"
            disabled={searchingRag || !ragQuery.trim()}
            className="px-3.5 py-1.5 text-xs font-medium rounded-md bg-[var(--accent-primary)] text-stone-950 font-medium hover:opacity-90 disabled:opacity-50 font-sans"
          >
            {searchingRag ? "Searching..." : "Search Syllabus"}
          </button>
        </form>

        {ragResults.length > 0 && (
          <div className="mt-2 pt-2 border-t border-[var(--border-hairline)] space-y-2">
            {ragResults.map((r, i) => {
              const pathLower = (r.source_path || r.file_path || "").toLowerCase();
              let courseTag = "Syllabus";
              let courseTitle = r.source_path ? r.source_path.split("/").pop() : (r.file_path || "Course Policy");
              if (pathLower.includes("stat4604") || pathLower.includes("stat")) {
                courseTag = "STAT 4604";
                courseTitle = "Statistical Methods for Engineers";
              } else if (pathLower.includes("cs2506")) {
                courseTag = "CS 2506";
                courseTitle = "Intro to Computer Organization II";
              } else if (pathLower.includes("cs3114")) {
                courseTag = "CS 3114";
                courseTitle = "Data Structures & Algorithms";
              } else if (pathLower.includes("engl3764") || pathLower.includes("engl")) {
                courseTag = "ENGL 3764";
                courseTitle = "Technical Writing";
              } else if (pathLower.includes("enge2724") || pathLower.includes("enge")) {
                courseTag = "ENGE 2724";
                courseTitle = "Interdisciplinary Design (IDPRO)";
              }

              return (
                <div key={i} className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-base)] text-xs space-y-1.5 font-sans">
                  <div className="flex items-center justify-between text-xs text-[var(--text-muted)] font-sans">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded text-micro font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                        {courseTag}
                      </span>
                      <span className="font-semibold text-[var(--text-primary)]">
                        {courseTitle}
                      </span>
                    </div>
                    <span className="text-[var(--accent-primary)] font-semibold font-sans tabular-nums">
                      {(r.similarity * 100).toFixed(1)}% match
                    </span>
                  </div>
                  <p className="text-[var(--text-secondary)] leading-relaxed font-sans pl-1 border-l-2 border-[var(--border-hairline)]">
                    {r.content}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Assignment Filtering & Table */}
      <div className="space-y-4">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Segmented Status Filter: Upcoming | Overdue | All */}
            <div className="flex items-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-0.5 text-xs font-sans">
              <button
                type="button"
                onClick={() => setStatusFilter("upcoming")}
                className={`px-2.5 py-1 rounded transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
                  statusFilter === "upcoming"
                    ? "bg-[var(--accent-primary)] text-stone-950 font-semibold"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Upcoming
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("overdue")}
                className={`px-2.5 py-1 rounded transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
                  statusFilter === "overdue"
                    ? "bg-[var(--accent-primary)] text-stone-950 font-semibold"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                Overdue
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter("all")}
                className={`px-2.5 py-1 rounded transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
                  statusFilter === "all"
                    ? "bg-[var(--accent-primary)] text-stone-950 font-semibold"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                All
              </button>
            </div>

            {/* Segmented Submission Filter: All | Pending | Submitted */}
            <div className="flex items-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-0.5 text-xs font-sans">
              <button
                type="button"
                onClick={() => setSubmissionFilter("all")}
                className={`px-2.5 py-1 rounded transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
                  submissionFilter === "all"
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] font-semibold shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setSubmissionFilter("pending")}
                className={`px-2.5 py-1 rounded transition-colors duration-75 active:scale-[0.98] cursor-pointer flex items-center gap-1.5 ${
                  submissionFilter === "pending"
                    ? "bg-[var(--accent-primary)] text-stone-950 font-semibold shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span>Pending</span>
                <span className="text-micro font-sans tabular-nums opacity-80">({pendingCount})</span>
              </button>
              <button
                type="button"
                onClick={() => setSubmissionFilter("submitted")}
                className={`px-2.5 py-1 rounded transition-colors duration-75 active:scale-[0.98] cursor-pointer flex items-center gap-1.5 ${
                  submissionFilter === "submitted"
                    ? "bg-[var(--semantic-success)] text-white font-semibold shadow-xs"
                    : "text-[var(--text-muted)] hover:text-[var(--text-primary)]"
                }`}
              >
                <span>Submitted</span>
                <span className="text-micro font-sans tabular-nums opacity-80">({submittedCount})</span>
              </button>
            </div>

            <div className="h-4 w-px bg-[var(--border-hairline)] hidden lg:block" />

            {/* Course Tabs */}
            <div className="flex flex-wrap items-center gap-1.5">
              {courseNames.map((name) => (
                <button
                  key={name}
                  onClick={() => setSelectedCourse(name)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors duration-75 active:scale-[0.98] cursor-pointer ${
                    selectedCourse === name
                      ? "bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--accent-primary)] font-semibold"
                      : "border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Keyword Filter */}
          <div className="relative w-full lg:w-56">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-2.5 top-2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter assignment name..."
              className="w-full pl-8 pr-3 py-1 text-xs rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden font-sans"
            />
          </div>
        </div>

        {/* Assignments Table (Things 3 / Linear horizontal rows) */}
        <div className="divide-y divide-[var(--border-hairline)] border-y border-[var(--border-hairline)]">
          {filteredAssignments.length === 0 ? (
            <div className="py-12 text-center text-xs text-[var(--text-muted)] font-sans">
              No assignments found matching your filter.
            </div>
          ) : (
            filteredAssignments.map((hw) => {
              const cleanTitle = cleanAssignmentTitle(hw.title);
              const isOverdue = hw.due_at && todayMidnight > 0 && new Date(hw.due_at).getTime() < todayMidnight;

              return (
                <div
                  key={hw.id}
                  onClick={() => {
                    setSelectedAssignment(hw);
                    setIsDetailModalOpen(true);
                  }}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-2 hover:bg-[var(--bg-hover)]/40 rounded-md transition-colors group cursor-pointer"
                  title="Click to view assignment specifications & details"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {/* 1-Click Submission Toggle Checkbox */}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleSubmission(hw.id);
                      }}
                      className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center transition-all cursor-pointer shrink-0 ${
                        hw.is_submitted
                          ? "bg-[var(--semantic-success)] border-[var(--semantic-success)] text-white shadow-xs"
                          : "border-[var(--border-hairline)] bg-[var(--bg-base)] text-transparent hover:border-[var(--accent-primary)] hover:bg-[var(--bg-hover)]"
                      }`}
                      title={hw.is_submitted ? "Mark as pending" : "Mark as submitted"}
                    >
                      <Check className={`w-3 h-3 stroke-[3] ${hw.is_submitted ? "opacity-100" : "opacity-0"}`} />
                    </button>

                    <span className="px-2 py-0.5 rounded text-micro font-medium font-sans bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] whitespace-nowrap shrink-0">
                      {hw.course_name || "Course"}
                    </span>

                    {hw.is_tentative && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-medium bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 whitespace-nowrap shrink-0">
                        Tentative
                      </span>
                    )}

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`text-sm font-medium truncate font-sans transition-colors ${
                            hw.is_submitted
                              ? "line-through text-[var(--text-muted)]"
                              : "text-[var(--text-primary)]"
                          }`}
                        >
                          {cleanTitle}
                        </span>
                        {hw.ai_sections && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono bg-sky-500/12 text-sky-400 border border-sky-500/30 whitespace-nowrap shrink-0">
                            {hw.ai_model?.startsWith("gemini") ? "Gemini Task" : "Structured"}
                          </span>
                        )}
                      </div>
                      {hw.ai_summary && (
                        <p className="text-xs text-[var(--text-muted)] truncate max-w-2xl mt-0.5 font-sans">
                          {hw.ai_summary}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-xs font-sans shrink-0 pl-7 sm:pl-0">
                    {hw.due_at ? (() => {
                      const nowMs = nowDate ? nowDate.getTime() : 0;
                      const dueTime = new Date(hw.due_at).getTime();
                      const isGraceWindow = !hw.is_submitted && nowMs > 0 && dueTime < nowMs && (nowMs - dueTime <= 48 * 3600 * 1000);
                      const isOldOverdue = !hw.is_submitted && nowMs > 0 && dueTime < nowMs && !isGraceWindow;

                      return (
                        <div className="text-right">
                          <span
                            className={`font-semibold font-sans tabular-nums text-xs ${
                              hw.is_submitted
                                ? "text-[var(--text-muted)]"
                                : isGraceWindow
                                ? "text-amber-400"
                                : isOldOverdue
                                ? "text-[var(--semantic-danger)]"
                                : "text-[var(--semantic-warning)]"
                            }`}
                          >
                            {isGraceWindow ? "Needs Submission (Grace Window)" : formatDaysRemaining(hw.due_at)}
                          </span>
                          <span className="block text-micro text-[var(--text-muted)] font-sans">
                            {formatDateTime(hw.due_at)}
                          </span>
                        </div>
                      );
                    })() : (
                      <span className="text-[var(--text-muted)] font-sans text-xs">No due date</span>
                    )}

                    {/* Clear Submission Status Badge */}
                    {hw.is_submitted ? (
                      <span className="px-2 py-0.5 rounded text-micro font-medium font-sans bg-[var(--semantic-success)]/15 text-[var(--semantic-success)] border border-[var(--semantic-success)]/30 flex items-center gap-1 shrink-0">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Submitted</span>
                      </span>
                    ) : (() => {
                      const nowMs = nowDate ? nowDate.getTime() : 0;
                      const dueTime = hw.due_at ? new Date(hw.due_at).getTime() : 0;
                      const isGrace = nowMs > 0 && dueTime > 0 && dueTime < nowMs && (nowMs - dueTime <= 48 * 3600 * 1000);
                      const isPastDue = nowMs > 0 && dueTime > 0 && dueTime < nowMs && !isGrace;

                      if (isGrace) {
                        return (
                          <span className="px-2 py-0.5 rounded text-micro font-medium font-sans bg-amber-500/15 text-amber-400 border border-amber-500/30 flex items-center gap-1 shrink-0">
                            <Clock className="w-3 h-3 text-amber-400" />
                            <span>Needs Submission</span>
                          </span>
                        );
                      }
                      if (isPastDue) {
                        return (
                          <span className="px-2 py-0.5 rounded text-micro font-medium font-sans bg-[var(--semantic-danger)]/15 text-[var(--semantic-danger)] border border-[var(--semantic-danger)]/30 flex items-center gap-1 shrink-0">
                            <AlertTriangle className="w-3 h-3" />
                            <span>Past Due</span>
                          </span>
                        );
                      }
                      return (
                        <span className="px-2 py-0.5 rounded text-micro font-medium font-sans bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 flex items-center gap-1 shrink-0">
                          <Clock className="w-3 h-3" />
                          <span>Pending</span>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Academic Term Key Dates */}
      <div className="space-y-3 pt-4">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-[var(--accent-primary)]" />
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider font-sans">
            {academicProfile} Calendar Reference
          </h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {ACADEMIC_DATES.map((d, i) => (
            <div
              key={i}
              className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-1.5"
            >
              <span className="px-2 py-0.5 rounded text-xs font-medium font-sans bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] inline-block">
                {d.term}
              </span>
              <h3 className="text-sm font-medium text-[var(--text-primary)] font-sans">
                {d.event}
              </h3>
              <p className="text-xs text-[var(--text-muted)] font-sans">
                {d.date}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Academic Assignment Detail & Spec Pop-out Modal */}
      <AssignmentDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        assignment={selectedAssignment}
        onToggleSubmit={(id, nextState) => {
          setAssignments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, is_submitted: nextState } : a))
          );
        }}
        onAnalyzed={(id, fields) => {
          setAssignments((prev) =>
            prev.map((a) => (a.id === id ? { ...a, ...fields } : a))
          );
          setSelectedAssignment((prev) => (prev && prev.id === id ? { ...prev, ...fields } : prev));
        }}
      />
    </div>
  );
}
