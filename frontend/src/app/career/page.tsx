"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  Briefcase,
  FileText,
  Search,
  Clock,
  ArrowRight,
  Building2,
  Calendar,
  Upload,
  Trash2,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
} from "lucide-react";
import {
  getCalendarEvents,
  searchRag,
  uploadResumeDocument,
  getIndexedDocuments,
  deleteIndexedDocument,
  type IndexedDocumentItem,
} from "@/lib/api";
import { useProfile } from "@/components/profile-provider";
import { formatDateTime } from "@/lib/formatters";
import { FormattedMarkdown } from "@/components/ui/formatted-content";
import { getHiddenCalendarIds, isCalendarVisible } from "@/lib/calendar-visibility";
import { EventDetailModal } from "@/components/calendar/event-modals";

const DEMO_CAREER_BLOCKS = [
  {
    title: "Daily LeetCode Practice",
    time: "2:00 PM – 3:00 PM (Mon – Fri)",
    focus: "Data Structures & Algorithms (Trees, Graphs, DP, Sliding Window)",
    target: "Algorithms prep & SWE technical rounds",
    badge: "Technical Prep",
  },
  {
    title: "Internship Applications & Outreach",
    time: "3:00 PM – 4:00 PM (Mon – Fri)",
    focus: "Company portals, resume tailoring, recruiter follow-ups",
    target: "Systems & SWE Internships",
    badge: "Applications",
  },
];

const DEMO_APPLICATIONS = [
  {
    company: "Palantir Technologies",
    role: "Software Engineer Intern (Forward Deployed)",
    location: "New York, NY / Washington, DC",
    status: "Applied",
    badgeColor: "bg-[var(--semantic-success)]/15 text-[var(--semantic-success)] border-[var(--semantic-success)]/30",
    date: "Submitted Nov 4",
  },
  {
    company: "Bloomberg L.P.",
    role: "Software Engineering Intern - 2027",
    location: "New York, NY",
    status: "Technical Screen",
    badgeColor: "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border-[var(--accent-primary)]/30",
    date: "Scheduled Nov 18",
  },
  {
    company: "Datadog",
    role: "Software Engineer Intern - Core Systems",
    location: "New York, NY",
    status: "Applied",
    badgeColor: "bg-[var(--semantic-success)]/15 text-[var(--semantic-success)] border-[var(--semantic-success)]/30",
    date: "Submitted Nov 8",
  },
];

export default function CareerPage() {
  const { isDemo, displayName, profile } = useProfile();
  const [ragQuery, setRagQuery] = useState("");
  const [ragResults, setRagResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [indexedResumes, setIndexedResumes] = useState<IndexedDocumentItem[]>([]);
  const [resumesLoading, setResumesLoading] = useState(true);
  const [uploadingResume, setUploadingResume] = useState(false);
  const [resumeNotice, setResumeNotice] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<any[]>([]);
  const [hiddenCalIds, setHiddenCalIds] = useState<string[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [nowMs, setNowMs] = useState<number>(0);

  const loadIndexedResumes = async () => {
    try {
      const docs = await getIndexedDocuments("resume");
      setIndexedResumes(Array.isArray(docs) ? docs : []);
    } catch (e) {
      console.error("Failed to load indexed resumes", e);
    } finally {
      setResumesLoading(false);
    }
  };

  const loadCareerEvents = async () => {
    try {
      const now = new Date();
      const start = new Date(now);
      start.setDate(start.getDate() - 7);
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      const evs = await getCalendarEvents({
        limit: 400,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
      });
      setCalendarEvents(Array.isArray(evs) ? evs : []);
    } catch (e) {
      console.error("Failed to load career calendar blocks", e);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    setNowMs(Date.now());
    setHiddenCalIds(getHiddenCalendarIds());
    loadCareerEvents();
    loadIndexedResumes();

    const handleRefresh = () => {
      loadCareerEvents();
      loadIndexedResumes();
    };
    const handleFilterSync = () => setHiddenCalIds(getHiddenCalendarIds());
    window.addEventListener("lifeops-refresh-calendar", handleRefresh);
    window.addEventListener("lifeops-profile-updated", handleRefresh);
    window.addEventListener("lifeops-calendar-filter-changed", handleFilterSync);
    return () => {
      window.removeEventListener("lifeops-refresh-calendar", handleRefresh);
      window.removeEventListener("lifeops-profile-updated", handleRefresh);
      window.removeEventListener("lifeops-calendar-filter-changed", handleFilterSync);
    };
  }, []);

  const careerBlocks = useMemo(() => {
    const visible = calendarEvents.filter((ev) => isCalendarVisible(ev, hiddenCalIds));
    const filtered = visible.filter((ev) => {
      if (ev.source === "canvas_inferred" || ev.calendar_id === "canvas_deadlines") {
        return false;
      }
      const text = `${ev.calendar_name || ""} ${ev.summary || ""}`.toLowerCase();
      return (
        text.includes("career") ||
        text.includes("intern") ||
        text.includes("application") ||
        text.includes("leetcode") ||
        text.includes("interview") ||
        text.includes("recruit")
      );
    });

    // Deduplicate recurring series by summary + time-of-day for a clean summary view
    const bySeries = new Map<string, { event: any; count: number; nextEvent: any }>();
    for (const ev of filtered) {
      const timeStr = new Date(ev.start_time).toLocaleTimeString("en-US", {
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
      });
      const key = `${ev.summary}::${timeStr}`;
      const existing = bySeries.get(key);
      if (!existing) {
        bySeries.set(key, { event: ev, count: 1, nextEvent: ev });
      } else {
        existing.count += 1;
        const currNextMs = new Date(existing.nextEvent.start_time).getTime();
        const evMs = new Date(ev.start_time).getTime();
        if (nowMs > 0 && evMs >= nowMs && (currNextMs < nowMs || evMs < currNextMs)) {
          existing.nextEvent = ev;
        }
      }
    }
    return Array.from(bySeries.values());
  }, [calendarEvents, hiddenCalIds, nowMs]);

  const runResumeQuery = async (queryText: string) => {
    const clean = queryText.trim();
    if (!clean) return;
    setSearching(true);
    setRagResults([]);
    try {
      const data = await searchRag(clean, 4, "resume");
      setRagResults(Array.isArray(data) ? data : (data as any)?.results || []);
    } catch (e) {
      console.error("Failed to query resume RAG", e);
    } finally {
      setSearching(false);
    }
  };

  const handleSearchResume = async (e: React.FormEvent) => {
    e.preventDefault();
    await runResumeQuery(ragQuery);
  };

  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingResume(true);
    setResumeNotice(null);
    try {
      const res = await uploadResumeDocument(file);
      await loadIndexedResumes();
      setResumeNotice({
        type: "success",
        text: `Uploaded & indexed "${res?.filename || file.name}" (${res?.chunks_indexed ?? 0} chunks).`,
      });
    } catch (err: any) {
      setResumeNotice({
        type: "error",
        text: err?.message || "Failed to upload resume. Supported formats: .pdf, .docx, .md, .txt.",
      });
    } finally {
      setUploadingResume(false);
      e.target.value = "";
    }
  };

  const handleDeleteResume = async (doc: IndexedDocumentItem) => {
    setResumeNotice(null);
    try {
      await deleteIndexedDocument(doc.source_path, "resume");
      await loadIndexedResumes();
      setRagResults((prev) => prev.filter((r) => r.source_path !== doc.source_path));
      setResumeNotice({
        type: "success",
        text: `Removed "${doc.filename}" from resume index.`,
      });
    } catch (err: any) {
      setResumeNotice({
        type: "error",
        text: err?.message || "Failed to delete indexed resume.",
      });
    }
  };

  const majorsList = Array.isArray(profile?.majors) ? profile!.majors! : [];
  const minorsList = Array.isArray(profile?.minors) ? profile!.minors! : [];
  const headline = profile?.career_role
    ? `${displayName} · ${profile.career_role}`
    : profile?.major_or_role
    ? `${displayName} · ${profile.major_or_role}`
    : `${displayName} · Career Focus & Resume Semantic Search`;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="pb-4 border-b border-[var(--border-hairline)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="space-y-1.5">
          <h1 className="text-xl font-semibold text-[var(--text-primary)] font-sans">
            Career & Opportunities
          </h1>
          <p className="text-xs text-[var(--text-muted)] font-sans">
            {headline}
          </p>
          {(majorsList.length > 0 || minorsList.length > 0 || profile?.academic_year) && (
            <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
              {profile?.academic_year && (
                <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
                  {profile.academic_year}
                  {profile.expected_graduation ? ` · ${profile.expected_graduation}` : ""}
                </span>
              )}
              {majorsList.map((m) => (
                <span
                  key={m}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--accent-primary)]/12 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30"
                >
                  <GraduationCap className="w-3 h-3" />
                  <span>{m}</span>
                </span>
              ))}
              {minorsList.map((mn) => (
                <span
                  key={mn}
                  className="px-2 py-0.5 rounded text-[11px] font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]"
                >
                  Minor: {mn}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)] font-sans">
          <Briefcase className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span>
            {careerBlocks.length > 0
              ? `${careerBlocks.length} Active Career Series Synced`
              : isDemo
              ? `${DEMO_APPLICATIONS.length} Demo Applications`
              : "No career calendars synced yet"}
          </span>
        </div>
      </div>

      {/* Synced Career Focus Blocks (Live Calendar) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold text-[var(--text-muted)] uppercase tracking-wider font-sans">
            Synced Career Focus Blocks
          </h2>
          <Link
            href="/schedule"
            className="text-xs text-[var(--accent-primary)] hover:underline flex items-center gap-1 font-sans"
          >
            <span>Open Schedule</span>
            <ArrowRight className="w-3 h-3" />
          </Link>
        </div>

        {loadingEvents ? (
          <div className="p-6 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs text-[var(--text-muted)]">
            Loading synced career blocks...
          </div>
        ) : careerBlocks.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {careerBlocks.map(({ event: ev, count, nextEvent }) => (
              <div
                key={ev.id}
                onClick={() => {
                  setSelectedEvent(nextEvent);
                  setIsDetailModalOpen(true);
                }}
                className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:border-[var(--accent-primary)]/50 transition-colors space-y-2.5 font-sans cursor-pointer"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">
                    {ev.summary}
                  </h3>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] whitespace-nowrap shrink-0">
                    {ev.calendar_name || "Career"} · {count} session{count === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="text-xs text-[var(--text-secondary)] tabular-nums flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>Next: {formatDateTime(nextEvent.start_time)}</span>
                </div>

                {ev.description && (
                  <div className="pt-2 border-t border-[var(--border-hairline)] text-xs text-[var(--text-secondary)] overflow-x-auto max-h-28 overflow-y-hidden break-words">
                    <FormattedMarkdown content={ev.description} />
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : isDemo ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {DEMO_CAREER_BLOCKS.map((block, idx) => (
              <div
                key={idx}
                className="p-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-2.5 font-sans"
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-sm font-medium text-[var(--text-primary)]">{block.title}</h3>
                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] whitespace-nowrap shrink-0">
                    {block.badge}
                  </span>
                </div>
                <div className="text-xs text-[var(--text-secondary)] tabular-nums">{block.time}</div>
                <p className="text-xs text-[var(--text-muted)] leading-relaxed">{block.focus}</p>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-6 rounded-lg border border-dashed border-[var(--border-hairline)] bg-[var(--bg-elevated)]/60 text-xs text-[var(--text-muted)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span>
              No visible career, interview, or internship application blocks found in your active calendars.
            </span>
            <Link
              href="/setup"
              className="px-3 py-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors inline-flex items-center gap-1.5 shrink-0"
            >
              <Calendar className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>Connect Calendar in Setup</span>
            </Link>
          </div>
        )}
      </div>

      {/* Demo Pipeline only shown in Demo Mode */}
      {isDemo && (
        <div className="p-5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-4 font-sans">
          <div className="flex items-center justify-between pb-3 border-b border-[var(--border-hairline)]">
            <div className="flex items-center gap-2">
              <Building2 className="w-4 h-4 text-[var(--accent-primary)]" />
              <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
                Sample Internship Pipeline (Demo)
              </h2>
            </div>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
              Hiring Cycle: Active
            </span>
          </div>

          <div className="divide-y divide-[var(--border-hairline)]/40 border border-[var(--border-hairline)] rounded-md overflow-hidden bg-[var(--bg-surface)]">
            {DEMO_APPLICATIONS.map((app, idx) => (
              <div
                key={idx}
                className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs hover:bg-[var(--bg-hover)] transition-colors"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{app.company}</span>
                    <span className="text-micro text-[var(--text-muted)]">· {app.location}</span>
                  </div>
                  <p className="text-xs text-[var(--text-secondary)]">{app.role}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="text-micro text-[var(--text-muted)] tabular-nums">{app.date}</span>
                  <span className={`px-2 py-0.5 rounded text-micro font-medium border ${app.badgeColor}`}>
                    {app.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Resume Upload, Library & Career Semantic Search */}
      <div className="p-5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] space-y-4 font-sans">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-[var(--accent-primary)]" />
            <h2 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
              Resume Upload & Semantic RAG Inspector
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]">
              pgvector (768-dim)
            </span>
            <label
              htmlFor="career-resume-upload"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 transition-opacity inline-flex items-center gap-1.5 cursor-pointer ${
                uploadingResume ? "opacity-60 pointer-events-none" : ""
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{uploadingResume ? "Indexing..." : "Upload Resume"}</span>
              <input
                id="career-resume-upload"
                type="file"
                accept=".pdf,.docx,.md,.txt"
                onChange={handleResumeUpload}
                disabled={uploadingResume}
                className="sr-only"
              />
            </label>
          </div>
        </div>

        <p className="text-xs text-[var(--text-muted)] leading-relaxed">
          Upload your resume (<span className="font-mono text-[11px]">.pdf</span>,{" "}
          <span className="font-mono text-[11px]">.docx</span>,{" "}
          <span className="font-mono text-[11px]">.md</span>, or{" "}
          <span className="font-mono text-[11px]">.txt</span>) to index bullet points, projects, and technical skills locally for fast tailoring and interview prep.
        </p>

        {resumeNotice && (
          <div
            className={`px-3 py-2 rounded-md border text-xs flex items-center gap-2 ${
              resumeNotice.type === "success"
                ? "border-[var(--semantic-success)]/35 bg-[var(--semantic-success)]/10 text-[var(--semantic-success)]"
                : "border-[var(--semantic-danger)]/35 bg-[var(--semantic-danger)]/10 text-[var(--semantic-danger)]"
            }`}
          >
            {resumeNotice.type === "success" ? (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            )}
            <span>{resumeNotice.text}</span>
          </div>
        )}

        {/* Uploaded Resumes List */}
        {resumesLoading ? (
          <div className="text-xs text-[var(--text-muted)] py-1">Checking indexed resumes...</div>
        ) : indexedResumes.length > 0 ? (
          <div className="divide-y divide-[var(--border-hairline)] rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)]">
            {indexedResumes.map((doc) => (
              <div
                key={doc.source_path}
                className="px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs"
              >
                <div className="min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2">
                    <FileText className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
                    <span className="font-medium text-[var(--text-primary)] truncate">
                      {doc.filename}
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--bg-surface)] text-[var(--text-muted)] border border-[var(--border-hairline)] shrink-0">
                      {doc.chunk_count} chunk{doc.chunk_count === 1 ? "" : "s"}
                    </span>
                  </div>
                  {doc.preview && (
                    <p className="text-[11px] text-[var(--text-muted)] truncate pl-5">
                      {doc.preview}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDeleteResume(doc)}
                  title={`Remove ${doc.filename}`}
                  className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--semantic-danger)] hover:bg-[var(--bg-surface)] transition-colors cursor-pointer shrink-0"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-3.5 py-3 rounded-md border border-dashed border-[var(--border-hairline)] bg-[var(--bg-base)]/60 text-xs text-[var(--text-muted)]">
            No resume indexed yet. Click <strong>Upload Resume</strong> above to add your PDF, DOCX, Markdown, or text resume.
          </div>
        )}

        <form onSubmit={handleSearchResume} className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-2.5" />
            <input
              type="text"
              value={ragQuery}
              onChange={(e) => setRagQuery(e.target.value)}
              placeholder="Search resume skills e.g. 'Python FastAPI', 'distributed systems', 'experience'..."
              className="w-full pl-9 pr-3 py-1.5 text-xs rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden focus:border-[var(--accent-primary)]"
            />
          </div>
          <button
            type="submit"
            disabled={searching || !ragQuery.trim()}
            className="px-3.5 py-1.5 text-xs font-semibold rounded-md bg-[var(--accent-primary)] text-stone-950 hover:opacity-90 disabled:opacity-50 transition-all shadow-xs shrink-0 cursor-pointer"
          >
            {searching ? "Searching..." : "Search Resume"}
          </button>
        </form>

        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-[var(--text-muted)]">Quick probes:</span>
          {["Technical skills", "Projects", "Experience", "Education"].map((probe) => (
            <button
              key={probe}
              type="button"
              onClick={() => {
                setRagQuery(probe);
                runResumeQuery(probe);
              }}
              className="px-2 py-0.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-secondary)] hover:border-[var(--accent-primary)] hover:text-[var(--text-primary)] transition-colors cursor-pointer"
            >
              {probe}
            </button>
          ))}
        </div>

        {ragResults.length > 0 && (
          <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
            {ragResults.map((r, idx) => (
              <div
                key={idx}
                className="p-3 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-base)] space-y-1 text-xs font-sans"
              >
                <div className="flex items-center justify-between text-micro text-[var(--text-muted)] font-sans">
                  <span className="font-medium text-[var(--text-primary)]">
                    {r.source_path ? r.source_path.split("/").pop() : (r.file_path || "Resume Index")}
                  </span>
                  <span className="text-[var(--accent-primary)] font-medium tabular-nums font-sans">
                    Match: {(r.similarity * 100).toFixed(1)}%
                  </span>
                </div>
                <p className="text-[var(--text-primary)] leading-relaxed font-sans">
                  {r.content}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>

      <EventDetailModal
        isOpen={isDetailModalOpen}
        onClose={() => {
          setIsDetailModalOpen(false);
          setSelectedEvent(null);
        }}
        event={selectedEvent}
        onUpdate={(updated) => {
          setSelectedEvent(updated);
          loadCareerEvents();
        }}
        onDelete={() => {
          setIsDetailModalOpen(false);
          setSelectedEvent(null);
          loadCareerEvents();
        }}
      />
    </div>
  );
}
