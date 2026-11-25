"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  Search,
  Zap,
  Clock,
  Terminal,
  X,
  CornerDownLeft,
  Sparkles,
  Calendar,
  BookOpen,
  ArrowRight,
  ExternalLink,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Tag,
} from "lucide-react";
import { sendAiQuery, toggleExamMode, toggleAssignmentSubmission } from "@/lib/api";
import { cleanAssignmentTitle } from "@/lib/formatters";
import { useProfile } from "@/components/profile-provider";

/* -------------------------------------------------------------------------- */
/*                        RICH AI RESPONSE & CARD PARSER                      */
/* -------------------------------------------------------------------------- */

interface ParsedCard {
  id?: string;
  type: "assignment" | "event";
  course: string;
  title: string;
  date?: string;
  location?: string;
  time?: string;
  is_submitted?: boolean;
}

interface ParsedBlock {
  type: "text" | "date_header" | "card" | "bullet";
  content?: string;
  date?: string;
  card?: ParsedCard;
}

function renderInlineMarkdown(text: string) {
  if (!text) return null;
  const tokens = text.split(/(\*\*.*?\*\*|`.*?`)/g);
  return tokens.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={i} className="font-semibold text-[var(--text-primary)]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={i}
          className="px-1 py-0.5 rounded text-micro font-mono bg-[var(--bg-base)] text-[var(--accent-primary)] border border-[var(--border-hairline)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}

function parseAiResponse(text: string): ParsedBlock[] {
  if (!text) return [];
  const lines = text.split("\n");
  const blocks: ParsedBlock[] = [];
  let currentDate = "";

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // 1. Date Header match: e.g. "* **Nov 13 at 23:59:**" or "**Nov 13 at 23:59:**" or "### Nov 13"
    const dateHeaderMatch = line.match(
      /^[*•-]?\s*(?:\*\*(?:Due:?\s*)?([A-Za-z0-9\s,:]+)\*\*|###\s*([A-Za-z0-9\s,:]+)):?\s*$/i
    );
    if (dateHeaderMatch) {
      const captured = (dateHeaderMatch[1] || dateHeaderMatch[2] || "").replace(/:$/, "").trim();
      currentDate = captured;
      blocks.push({
        type: "date_header",
        date: captured,
      });
      continue;
    }

    // 2. Bracketed Course Assignment Card match: e.g. "* [CS 2506] PA5 — Virtual Memory Simulator" or "* [ENGE 2724] Next-Semester Project Profile (due Nov 13 at 23:59)"
    const courseCardMatch = line.match(/^[*•-]?\s*\[([A-Za-z0-9\s-]{2,12})\]\s*(.+)$/);
    if (courseCardMatch) {
      const course = courseCardMatch[1].trim();
      let title = courseCardMatch[2].trim();
      let due = currentDate;

      const dueMatch = title.match(/(?:\||\((?:due:?|at:?)?\s*)([^)]+)\)?$/i);
      if (dueMatch) {
        due = dueMatch[1].trim();
        title = title.replace(dueMatch[0], "").trim();
      }

      blocks.push({
        type: "card",
        card: {
          type: "assignment",
          course,
          title: cleanAssignmentTitle(title),
          date: due,
        },
      });
      continue;
    }

    // 2b. Unbracketed Course Assignment Card match: e.g. "* STAT 4604: HW 6 - ..." or "* CS 2506 — PA5 ..." or "* STAT 4604 - Final Project (Due: Dec 4)"
    const unbracketedCourseMatch = line.match(
      /^[*•-]?\s*(?:(?:\*\*)?([A-Za-z]{2,5}\s*\d{3,4})(?:\*\*)?)\s*[:—–-]\s*(.+)$/i
    );
    if (unbracketedCourseMatch) {
      const course = unbracketedCourseMatch[1].trim();
      let title = unbracketedCourseMatch[2].trim();
      let due = currentDate;

      const dueMatch = title.match(/(?:\||\((?:due:?|at:?)?\s*)([^)]+)\)?$/i);
      if (dueMatch) {
        due = dueMatch[1].trim();
        title = title.replace(dueMatch[0], "").trim();
      }

      blocks.push({
        type: "card",
        card: {
          type: "assignment",
          course,
          title: cleanAssignmentTitle(title),
          date: due,
        },
      });
      continue;
    }

    // 3. Calendar Event Card match: e.g. "* COMM 2004 - Public Speaking at PAM 1008 (10:10 AM - 11:00 AM)" or "* STAT 4604 at MCB 100 (12:20 PM)"
    const eventCardMatch = line.match(
      /^[*•-]?\s*([A-Za-z]{2,5}\s*\d{3,4}(?:\s*[-—:]\s*[A-Za-z0-9\s]+)?)\s+(?:at|in)\s+([A-Za-z0-9\s]+?)(?:\s*\(([^)]+)\))?$/i
    );
    if (eventCardMatch) {
      const courseAndTitle = eventCardMatch[1].trim();
      const location = eventCardMatch[2].trim();
      const time = eventCardMatch[3]?.trim();
      const parts = courseAndTitle.split(/[-—:]/);
      const course = parts[0].trim();
      const title = parts.length > 1 ? parts.slice(1).join(" ").trim() : course;

      blocks.push({
        type: "card",
        card: {
          type: "event",
          course,
          title,
          location,
          time,
        },
      });
      continue;
    }

    // 4. Bullet line match (general non-course bullet): e.g. "* Note that CS 3114 has a quiz"
    const bulletMatch = line.match(/^[*•-]\s+(.+)$/);
    if (bulletMatch) {
      blocks.push({
        type: "bullet",
        content: bulletMatch[1].trim(),
      });
      continue;
    }

    // 5. Regular text / paragraph
    blocks.push({
      type: "text",
      content: line,
    });
  }

  return blocks;
}

function FormattedAiResponse({
  response,
  onCardClick,
}: {
  response: string;
  onCardClick: (card: ParsedCard) => void;
}) {
  const blocks = useMemo(() => parseAiResponse(response), [response]);

  return (
    <div className="space-y-2.5 font-sans">
      {blocks.map((b, i) => {
        if (b.type === "date_header") {
          return (
            <div
              key={i}
              className="flex items-center gap-1.5 pt-2 text-xs font-semibold text-[var(--accent-primary)] font-sans border-b border-[var(--border-hairline)]/60 pb-1"
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>{b.date}</span>
            </div>
          );
        }

        if (b.type === "card" && b.card) {
          const c = b.card;
          return (
            <div
              key={i}
              onClick={() => onCardClick(c)}
              className="p-2.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:border-[var(--accent-primary)] hover:bg-[var(--bg-hover)] transition-all flex items-center justify-between gap-3 shadow-xs group cursor-pointer active:scale-[0.995]"
              title="Click to view full card details & actions"
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <span className="px-2 py-0.5 rounded text-micro font-medium font-sans bg-[var(--bg-base)] text-[var(--text-secondary)] group-hover:text-[var(--text-primary)] border border-[var(--border-hairline)] whitespace-nowrap shrink-0">
                  {c.course}
                </span>
                <span className="text-xs font-medium text-[var(--text-primary)] truncate font-sans">
                  {c.title}
                </span>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 text-micro text-[var(--text-muted)] font-sans tabular-nums">
                {c.location && (
                  <span className="hidden sm:inline-block px-1.5 py-0.5 rounded bg-[var(--bg-base)] border border-[var(--border-hairline)] text-[var(--text-muted)]">
                    {c.location}
                  </span>
                )}
                {(c.date || c.time) && (
                  <div className="flex items-center gap-1 text-[var(--text-muted)]">
                    <Clock className="w-3 h-3 text-[var(--text-muted)]" />
                    <span>{c.date || c.time}</span>
                  </div>
                )}
                <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent-primary)] transition-transform group-hover:translate-x-0.5 shrink-0" />
              </div>
            </div>
          );
        }

        if (b.type === "bullet" && b.content) {
          return (
            <div
              key={i}
              className="flex items-start gap-2 text-xs text-[var(--text-secondary)] pl-1 leading-relaxed"
            >
              <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] mt-1.5 shrink-0" />
              <span>{renderInlineMarkdown(b.content)}</span>
            </div>
          );
        }

        if (b.type === "text" && b.content) {
          return (
            <p key={i} className="text-xs text-[var(--text-secondary)] leading-relaxed font-sans">
              {renderInlineMarkdown(b.content)}
            </p>
          );
        }

        return null;
      })}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                            CARD DETAIL INSPECTOR                           */
/* -------------------------------------------------------------------------- */

function CardInspectorModal({
  card,
  onClose,
  onNavigate,
}: {
  card: ParsedCard;
  onClose: () => void;
  onNavigate: (href: string) => void;
}) {
  const { academicProfile } = useProfile();
  const isAssignment = card.type === "assignment";

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Card Dialog */}
      <div className="relative w-full max-w-md rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150 font-sans">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[var(--border-hairline)] bg-[var(--bg-base)]/60 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-micro font-medium bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30 font-sans">
              {isAssignment ? "Academic Assignment" : "Calendar Event"}
            </span>
            <span className="px-2 py-0.5 rounded text-micro font-medium bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)] font-sans">
              {card.course}
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-[var(--text-primary)] font-sans leading-tight">
              {card.title}
            </h3>
            <p className="text-xs text-[var(--text-muted)] mt-1 font-sans">
              {isAssignment
                ? `Course requirement for ${card.course} on ${academicProfile} Canvas`
                : `Scheduled commitment for ${card.course}`}
            </p>
          </div>

          <div className="p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-base)] space-y-2.5 text-xs font-sans">
            {(card.date || card.time) && (
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span className="flex items-center gap-2 text-[var(--text-muted)]">
                  <Clock className="w-3.5 h-3.5" />
                  <span>{isAssignment ? "Due Date & Time" : "Scheduled Time"}</span>
                </span>
                <span className="font-medium text-[var(--text-primary)] tabular-nums">
                  {card.date || card.time}
                </span>
              </div>
            )}

            {card.location && (
              <div className="flex items-center justify-between text-[var(--text-secondary)]">
                <span className="flex items-center gap-2 text-[var(--text-muted)]">
                  <MapPin className="w-3.5 h-3.5" />
                  <span>Location</span>
                </span>
                <span className="font-medium text-[var(--text-primary)]">
                  {card.location}
                </span>
              </div>
            )}

            <div className="flex items-center justify-between text-[var(--text-secondary)]">
              <span className="flex items-center gap-2 text-[var(--text-muted)]">
                <Tag className="w-3.5 h-3.5" />
                <span>Tracking Mode</span>
              </span>
              <span className="font-medium text-[var(--accent-primary)]">
                {isAssignment ? "Passive ICS & Canvas Poll" : "Fixed Academic Class"}
              </span>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-[var(--border-hairline)] bg-[var(--bg-base)]/80 flex items-center justify-between gap-2 font-sans">
          <button
            onClick={onClose}
            className="px-3 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
          >
            Close
          </button>

          <button
            onClick={() => onNavigate(isAssignment ? "/academics" : "/schedule")}
            className="px-3.5 py-1.5 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-stone-950 hover:opacity-90 transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span>{isAssignment ? "View in Academics" : "View in Schedule"}</span>
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                               COMMAND PALETTE                              */
/* -------------------------------------------------------------------------- */

export function CommandPalette() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [examMode, setExamMode] = useState(false);
  const [inspectedCard, setInspectedCard] = useState<ParsedCard | null>(null);
  const [result, setResult] = useState<{
    response: string;
    routed_to: string;
    model: string;
    latency_ms: number;
    exam_mode: boolean;
    action_staged?: any;
    cards?: any[];
  } | null>(null);

  // Keyboard shortcut listener: Cmd+K or Ctrl+K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      } else if (e.key === "Escape" && isOpen) {
        if (inspectedCard) {
          setInspectedCard(null);
        } else {
          setIsOpen(false);
        }
      }
    };

    const handleCustomOpen = () => setIsOpen(true);

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("lifeops-open-command-palette", handleCustomOpen);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("lifeops-open-command-palette", handleCustomOpen);
    };
  }, [isOpen, inspectedCard]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim() || loading) return;

    setLoading(true);
    setResult(null);
    setInspectedCard(null);
    try {
      const res = await sendAiQuery({
        query: query.trim(),
        exam_mode: examMode,
      });
      setResult(res);

      if (res.action_staged) {
        window.dispatchEvent(new Event("lifeops-refresh-pending"));
        window.dispatchEvent(new Event("lifeops-refresh-calendar"));
      }
    } catch (err: any) {
      setResult({
        response: `Error: ${err.message}`,
        routed_to: "error",
        model: "none",
        latency_ms: 0,
        exam_mode: examMode,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleExamMode = async () => {
    const next = !examMode;
    setExamMode(next);
    try {
      await toggleExamMode(next);
    } catch (e) {
      console.error(e);
    }
  };

  const handleNavigate = (href: string) => {
    setIsOpen(false);
    setInspectedCard(null);
    router.push(href);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={() => setIsOpen(false)}
      />

      {/* Palette Modal (Linear / Raycast Style) */}
      <div className="relative w-full max-w-2xl rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-elevated)] shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150 font-sans">
        {/* Search Header */}
        <form
          onSubmit={handleSubmit}
          className="flex items-center px-4 py-3.5 border-b border-[var(--border-hairline)]"
        >
          <Search className="w-4 h-4 text-[var(--text-muted)] shrink-0 mr-3" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Ask assistant, search academics, or command schedule (e.g. 'upcoming stats assignments')..."
            autoFocus
            className="w-full bg-transparent text-sm text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-hidden font-sans"
          />
          <div className="flex items-center gap-2 ml-2 shrink-0">
            {query.trim() && (
              <button
                type="submit"
                disabled={loading}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-[var(--accent-primary)] text-stone-950 hover:opacity-90 flex items-center gap-1 transition-opacity cursor-pointer font-sans"
              >
                <span>{loading ? "Thinking..." : "Run"}</span>
                <CornerDownLeft className="w-3 h-3" />
              </button>
            )}
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </form>

        {/* Quick Presets / Suggestions */}
        {!result && (
          <div className="p-3 border-b border-[var(--border-hairline)] bg-[var(--bg-base)]/50">
            <span className="text-micro font-medium text-[var(--text-muted)] block mb-1.5 uppercase tracking-wider font-sans">
              Suggested Commands
            </span>
            <div className="flex flex-wrap gap-1.5">
              {[
                "upcoming stats assignments",
                "What deadlines are coming up for CS 3114?",
                "remove COMM 2004",
                "Where is my next class?",
                "Plan my week around exams and meal prep",
              ].map((p, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setQuery(p)}
                  className="px-2.5 py-1 text-xs rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)] transition-colors font-sans"
                >
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* AI Answer & Result Display */}
        {result && (
          <div className="p-4 max-h-[420px] overflow-y-auto space-y-3 bg-[var(--bg-base)]">
            <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)] text-xs text-[var(--text-muted)]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                <span className="text-[var(--text-primary)] font-medium font-sans">
                  {result.model}
                </span>
                {result.action_staged && (
                  <span className="px-1.5 py-0.5 rounded text-micro bg-[var(--semantic-warning)]/15 text-[var(--semantic-warning)] font-medium font-sans">
                    Action Staged in Approval Queue
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1 font-sans tabular-nums text-micro text-[var(--text-muted)]">
                <Clock className="w-3 h-3" />
                <span>{result.latency_ms}ms</span>
              </div>
            </div>

            {/* Rich Formatted Response */}
            <FormattedAiResponse
              response={result.response}
              onCardClick={(card) => setInspectedCard(card)}
            />
          </div>
        )}

        {/* Footer with Exam Mode & Shortcuts */}
        <div className="flex items-center justify-between px-4 py-2 bg-[var(--bg-surface)] text-xs text-[var(--text-muted)]">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleToggleExamMode}
              className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-micro font-sans font-medium transition-colors cursor-pointer border ${
                examMode
                  ? "bg-[var(--semantic-warning)]/15 border-[var(--semantic-warning)]/40 text-[var(--semantic-warning)]"
                  : "border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
              }`}
              title="Exam Mode bypasses local inference to keep local CPU/GPU at 0%"
            >
              <Zap className={`w-3 h-3 ${examMode ? "text-[var(--semantic-warning)]" : ""}`} />
              <span>Exam Mode:</span>
              <span
                className={`px-1.5 py-0.2 rounded font-sans font-semibold uppercase tracking-wider text-[10px] ${
                  examMode
                    ? "bg-[var(--semantic-warning)]/25 text-[var(--semantic-warning)]"
                    : "bg-[var(--bg-surface)] text-[var(--text-secondary)] border border-[var(--border-hairline)]"
                }`}
              >
                {examMode ? "Active" : "Off"}
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 font-sans text-xs text-[var(--text-muted)]">
            <span>Esc to close</span>
          </div>
        </div>
      </div>

      {/* Card Inspector Dialog when a card is clicked */}
      {inspectedCard && (
        <CardInspectorModal
          card={inspectedCard}
          onClose={() => setInspectedCard(null)}
          onNavigate={handleNavigate}
        />
      )}
    </div>
  );
}
