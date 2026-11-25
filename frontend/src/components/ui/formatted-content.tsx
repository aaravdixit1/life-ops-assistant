"use client";

import React, { useState, useMemo } from "react";
import {
  Copy,
  Check,
  ExternalLink,
  Code2,
  Terminal,
  FileCode,
  AlertTriangle,
  ShieldCheck,
  Award,
  Layers,
  Search,
  ChevronRight,
  Info,
  ListChecks,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/*                              COPY CODE BUTTON                              */
/* -------------------------------------------------------------------------- */
export function CopyButton({ text, className = "" }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title="Copy to clipboard"
      className={`px-2 py-0.5 rounded text-micro font-mono flex items-center gap-1 border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)]/40 transition-colors cursor-pointer ${className}`}
    >
      {copied ? (
        <>
          <Check className="w-3 h-3 text-emerald-400" />
          <span className="text-emerald-400">Copied</span>
        </>
      ) : (
        <>
          <Copy className="w-3 h-3" />
          <span>Copy</span>
        </>
      )}
    </button>
  );
}

/* -------------------------------------------------------------------------- */
/*                     SAFE HTML -> MARKDOWN NORMALIZER                       */
/* -------------------------------------------------------------------------- */
const HTML_ENTITY_MAP: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&nbsp;": " ",
};

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&(?:amp|lt|gt|quot|apos|nbsp|#39);/gi, (m) => HTML_ENTITY_MAP[m.toLowerCase()] ?? m)
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(Number(num)))
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

export function normalizeRichText(raw: string): string {
  if (!raw) return "";
  let text = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  const hasHtml = /<(?:a|br|p|div|ul|ol|li|strong|b|em|i|h[1-6]|span|code|pre)\b[^>]*>/i.test(text);
  if (hasHtml) {
    // Convert <a href="https://..." ...>Label</a> to safe Markdown link
    text = text.replace(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
      (_full, rawHref: string, innerHtml: string) => {
        const href = decodeHtmlEntities((rawHref || "").trim());
        const innerText = decodeHtmlEntities(innerHtml.replace(/<[^>]+>/g, "")).trim();
        if (/^(?:https?:\/\/|mailto:)/i.test(href)) {
          return `[${innerText || href}](${href})`;
        }
        return innerText || "";
      }
    );

    text = text
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<h([1-4])[^>]*>([\s\S]*?)<\/h\1>/gi, (_m, lvl, inner) => {
        const prefix = "#".repeat(Math.min(4, Number(lvl) || 3));
        return `\n${prefix} ${inner.replace(/<[^>]+>/g, "").trim()}\n`;
      })
      .replace(/<(?:strong|b)[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, "**$1**")
      .replace(/<(?:em|i)[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, "*$1*")
      .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, "`$1`")
      .replace(/<li[^>]*>/gi, "\n- ")
      .replace(/<\/li>/gi, "")
      .replace(/<\/(?:p|div|ul|ol|tr|blockquote)>/gi, "\n\n")
      .replace(/<[^>]+>/g, "");
  }

  text = decodeHtmlEntities(text).replace(/\u00a0/g, " ");
  return text.replace(/\n{3,}/g, "\n\n").trim();
}

/* -------------------------------------------------------------------------- */
/*                           INLINE MARKDOWN PARSER                           */
/* -------------------------------------------------------------------------- */
export function parseInlineMarkdown(text: string): React.ReactNode[] {
  if (!text) return [];

  // Match markdown links, bare https?:// URLs, inline code, bold-italic, bold, italic
  const pattern =
    /(!?\[.*?\]\s*\((?:https?:\/\/[^\s)]+|[^)]+)\)|https?:\/\/[^\s<>"')\]]+|`[^`]+`|\*\*\*.*?\*\*\*|\*\*.*?\*\*|\*[^*]+?\*)/g;

  const parts = text.split(pattern);

  return parts.map((part, i) => {
    if (!part) return null;

    // Link: [label] (url) or [label](url)
    const linkMatch = part.match(/^\[(.*?)\]\s*\((https?:\/\/[^\s)]+|[^)]+)\)$/);
    if (linkMatch) {
      const label = linkMatch[1];
      const url = linkMatch[2];
      const isSafeExternal = /^https?:\/\//i.test(url) || /^mailto:/i.test(url);

      if (!isSafeExternal && !url.startsWith("/")) {
        return label;
      }

      return (
        <a
          key={i}
          href={url}
          target={isSafeExternal ? "_blank" : undefined}
          rel={isSafeExternal ? "noopener noreferrer" : undefined}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-baseline gap-1 text-[var(--accent-primary)] hover:underline font-medium break-words"
        >
          <span>{label || url}</span>
          {isSafeExternal && <ExternalLink className="w-3 h-3 inline-block shrink-0 translate-y-0.5" />}
        </a>
      );
    }

    // Bare URL: https://...
    if (/^https?:\/\/[^\s<>"')\]]+$/i.test(part)) {
      let cleanUrl = part;
      let trailing = "";
      while (/[.,;:!?]$/.test(cleanUrl)) {
        trailing = cleanUrl.slice(-1) + trailing;
        cleanUrl = cleanUrl.slice(0, -1);
      }
      return (
        <React.Fragment key={i}>
          <a
            href={cleanUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-baseline gap-1 text-[var(--accent-primary)] hover:underline font-medium break-all"
          >
            <span>{cleanUrl}</span>
            <ExternalLink className="w-3 h-3 inline-block shrink-0 translate-y-0.5" />
          </a>
          {trailing}
        </React.Fragment>
      );
    }

    // Inline code: `code`
    if (part.startsWith("`") && part.endsWith("`") && part.length >= 2) {
      return (
        <code
          key={i}
          className="px-1.5 py-0.5 mx-0.5 rounded text-[11px] font-mono bg-[var(--bg-base)] text-[var(--accent-primary)] border border-[var(--border-hairline)]"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Bold-italic: ***text***
    if (part.startsWith("***") && part.endsWith("***") && part.length >= 6) {
      return (
        <strong key={i} className="font-semibold italic text-[var(--text-primary)]">
          {part.slice(3, -3)}
        </strong>
      );
    }

    // Bold: **text**
    if (part.startsWith("**") && part.endsWith("**") && part.length >= 4) {
      return (
        <strong key={i} className="font-semibold text-[var(--text-primary)]">
          {part.slice(2, -2)}
        </strong>
      );
    }

    // Italic: *text*
    if (part.startsWith("*") && part.endsWith("*") && part.length >= 2) {
      return (
        <em key={i} className="italic text-[var(--text-primary)]">
          {part.slice(1, -1)}
        </em>
      );
    }

    return part;
  });
}

/* -------------------------------------------------------------------------- */
/*                         GENERIC MARKDOWN RENDERER                          */
/* -------------------------------------------------------------------------- */
export function FormattedMarkdown({
  content,
  className = "",
}: {
  content: string;
  className?: string;
}) {
  // Split into tokens unconditionally before early return (React Rules of Hooks)
  const elements = useMemo(() => {
    if (!content) return [];
    const normalized = normalizeRichText(content);
    const rawLines = normalized.split("\n");
    const result: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLanguage = "";
    let codeLines: string[] = [];
    let listBuffer: { type: "ul" | "ol"; items: string[] } | null = null;

    const flushList = () => {
      if (listBuffer) {
        if (listBuffer.type === "ul") {
          result.push(
            <ul key={`ul-${result.length}`} className="space-y-1 pl-4 my-2">
              {listBuffer.items.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm">
                  <span className="text-[var(--accent-primary)] mt-1 shrink-0">•</span>
                  <span className="text-[var(--text-secondary)] leading-relaxed">
                    {parseInlineMarkdown(item)}
                  </span>
                </li>
              ))}
            </ul>
          );
        } else {
          result.push(
            <ol key={`ol-${result.length}`} className="space-y-1 pl-4 my-2">
              {listBuffer.items.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs sm:text-sm">
                  <span className="font-mono text-micro text-[var(--accent-primary)] font-bold mt-0.5 shrink-0">
                    {idx + 1}.
                  </span>
                  <span className="text-[var(--text-secondary)] leading-relaxed">
                    {parseInlineMarkdown(item)}
                  </span>
                </li>
              ))}
            </ol>
          );
        }
        listBuffer = null;
      }
    };

    for (let i = 0; i < rawLines.length; i++) {
      const line = rawLines[i];
      const trimmed = line.trim();

      // Check fenced code block start/end: ```lang or ```
      if (trimmed.startsWith("```")) {
        flushList();
        if (inCodeBlock) {
          // Close code block
          const fullCode = codeLines.join("\n");
          result.push(
            <div
              key={`code-${result.length}`}
              className="my-3 rounded-xl border border-[var(--border-hairline)] bg-stone-950 overflow-hidden shadow-xs"
            >
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-stone-800 bg-stone-900/80 text-micro font-mono text-stone-400">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
                  <span>{codeLanguage || "code"}</span>
                </div>
                <CopyButton text={fullCode} />
              </div>
              <pre className="p-3 text-xs font-mono text-stone-200 overflow-x-auto leading-relaxed">
                <code>{fullCode}</code>
              </pre>
            </div>
          );
          inCodeBlock = false;
          codeLanguage = "";
          codeLines = [];
        } else {
          // Open code block
          inCodeBlock = true;
          codeLanguage = trimmed.slice(3).trim();
          codeLines = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Blank line
      if (!trimmed) {
        flushList();
        result.push(<div key={`blank-${result.length}`} className="h-2" />);
        continue;
      }

      // Horizontal rule: --- or *** or ___
      if (/^[-*_]{3,}$/.test(trimmed)) {
        flushList();
        result.push(
          <hr
            key={`hr-${result.length}`}
            className="my-3 border-t border-[var(--border-hairline)]/80"
          />
        );
        continue;
      }

      // Headers: #, ##, ###, ####
      if (trimmed.startsWith("#### ")) {
        flushList();
        result.push(
          <h5
            key={`h5-${result.length}`}
            className="text-xs uppercase font-mono tracking-wider font-semibold text-[var(--text-muted)] mt-3 mb-1"
          >
            {parseInlineMarkdown(trimmed.slice(5))}
          </h5>
        );
        continue;
      }
      if (trimmed.startsWith("### ")) {
        flushList();
        result.push(
          <h4
            key={`h4-${result.length}`}
            className="text-sm font-semibold text-[var(--text-primary)] font-sans mt-3.5 mb-1.5 flex items-center gap-1.5"
          >
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)]" />
            <span>{parseInlineMarkdown(trimmed.slice(4))}</span>
          </h4>
        );
        continue;
      }
      if (trimmed.startsWith("## ")) {
        flushList();
        result.push(
          <h3
            key={`h3-${result.length}`}
            className="text-base font-serif italic text-[var(--text-primary)] font-bold mt-4 mb-2 pb-1 border-b border-[var(--border-hairline)]/60"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {parseInlineMarkdown(trimmed.slice(3))}
          </h3>
        );
        continue;
      }
      if (trimmed.startsWith("# ")) {
        flushList();
        result.push(
          <h2
            key={`h2-${result.length}`}
            className="text-lg font-serif italic text-[var(--text-primary)] font-bold mt-4 mb-2"
            style={{ fontFamily: "var(--font-serif)" }}
          >
            {parseInlineMarkdown(trimmed.slice(2))}
          </h2>
        );
        continue;
      }

      // Blockquote: > text
      if (trimmed.startsWith("> ")) {
        flushList();
        result.push(
          <blockquote
            key={`quote-${result.length}`}
            className="pl-3.5 py-1 my-2 border-l-2 border-[var(--accent-primary)] bg-[var(--accent-primary)]/5 text-xs sm:text-sm text-[var(--text-secondary)] font-serif italic leading-relaxed rounded-r-lg"
          >
            {parseInlineMarkdown(trimmed.slice(2))}
          </blockquote>
        );
        continue;
      }

      // Unordered list item: - text, * text, • text
      if (/^[-*•]\s+/.test(trimmed)) {
        const itemText = trimmed.replace(/^[-*•]\s+/, "");
        if (!listBuffer || listBuffer.type !== "ul") {
          flushList();
          listBuffer = { type: "ul", items: [itemText] };
        } else {
          listBuffer.items.push(itemText);
        }
        continue;
      }

      // Ordered list item: 1. text
      if (/^\d+\.\s+/.test(trimmed)) {
        const itemText = trimmed.replace(/^\d+\.\s+/, "");
        if (!listBuffer || listBuffer.type !== "ol") {
          flushList();
          listBuffer = { type: "ol", items: [itemText] };
        } else {
          listBuffer.items.push(itemText);
        }
        continue;
      }

      // Regular paragraph line
      flushList();
      result.push(
        <p key={`p-${result.length}`} className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
          {parseInlineMarkdown(line)}
        </p>
      );
    }

    flushList();

    // If an unclosed code block remained at end of text
    if (inCodeBlock && codeLines.length > 0) {
      const fullCode = codeLines.join("\n");
      result.push(
        <div
          key={`code-${result.length}`}
          className="my-3 rounded-xl border border-[var(--border-hairline)] bg-stone-950 overflow-hidden shadow-xs"
        >
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-stone-800 bg-stone-900/80 text-micro font-mono text-stone-400">
            <span className="flex items-center gap-1.5">
              <Terminal className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
              <span>code</span>
            </span>
            <CopyButton text={fullCode} />
          </div>
          <pre className="p-3 text-xs font-mono text-stone-200 overflow-x-auto leading-relaxed">
            <code>{fullCode}</code>
          </pre>
        </div>
      );
    }

    return result;
  }, [content]);

  if (!content) return null;

  return <div className={`space-y-1.5 ${className}`}>{elements}</div>;
}

/* -------------------------------------------------------------------------- */
/*             ACADEMIC SPEC VIEWER (FOR CANVAS & ASSIGNMENT SPECS)           */
/* -------------------------------------------------------------------------- */
interface SpecSection {
  title: string;
  kind: "general" | "build" | "submit" | "traps" | "grading" | "contract" | "code" | "policy";
  rawLines: string[];
}

export interface AiStructuredSections {
  summary?: string;
  estimated_effort?: string;
  general?: string;
  deliverables?: string[];
  rubric?: string[];
  resources_and_policies?: string[];
}

export function AcademicSpecViewer({
  rawSpec,
  aiSections,
  courseName,
  title,
}: {
  rawSpec: string;
  aiSections?: AiStructuredSections | null;
  courseName?: string;
  title?: string;
}) {
  const [searchFilter, setSearchFilter] = useState("");
  const [activeTab, setActiveTab] = useState<string>("all");

  // Parse structured sections from Canvas text OR AI-structured sections
  const sections = useMemo<SpecSection[]>(() => {
    const parsed: SpecSection[] = [];

    if (aiSections) {
      if (aiSections.general && aiSections.general.trim()) {
        parsed.push({
          title: "General Overview & Objectives",
          kind: "general",
          rawLines: aiSections.general.trim().split("\n"),
        });
      }
      if (aiSections.deliverables && aiSections.deliverables.length > 0) {
        parsed.push({
          title: "Deliverables & Submission Checklist",
          kind: "submit",
          rawLines: aiSections.deliverables.map((item) => `- ${item}`),
        });
      }
      if (aiSections.rubric && aiSections.rubric.length > 0) {
        parsed.push({
          title: "Rubric & Grading Breakdown",
          kind: "grading",
          rawLines: aiSections.rubric.map((item) => `- ${item}`),
        });
      }
      if (aiSections.resources_and_policies && aiSections.resources_and_policies.length > 0) {
        parsed.push({
          title: "Policies, Resources & Key Notes",
          kind: "policy",
          rawLines: aiSections.resources_and_policies.map((item) => `- ${item}`),
        });
      }
      if (rawSpec && rawSpec.trim()) {
        parsed.push({
          title: "Full Original Specification",
          kind: "contract",
          rawLines: normalizeRichText(rawSpec).split("\n"),
        });
      }
      if (parsed.length > 0) return parsed;
    }

    if (!rawSpec) return [];

    const lines = normalizeRichText(rawSpec).split("\n");
    let currentTitle = "Overview & Specifications";
    let currentKind: SpecSection["kind"] = "general";
    let currentLines: string[] = [];

    const determineKind = (secTitle: string): SpecSection["kind"] => {
      const t = secTitle.toLowerCase();
      if (t.includes("submit") || t.includes("files") || t.includes("deliver")) return "submit";
      if (t.includes("build") || t.includes("run") || t.includes("input") || t.includes("make")) return "build";
      if (t.includes("trap") || t.includes("warning") || t.includes("common trap")) return "traps";
      if (t.includes("grad") || t.includes("weight") || t.includes("rubric") || t.includes("point")) return "grading";
      if (t.includes("contract") || t.includes("rule") || t.includes("translation")) return "contract";
      if (t.includes("policy") || t.includes("integrity") || t.includes("authorship") || t.includes("ai")) return "policy";
      return "general";
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const isDivider = /^[-*=]{3,}$/.test(trimmed);

      if (isDivider && i + 1 < lines.length && lines[i + 1].trim()) {
        const candidateTitle = lines[i + 1].trim();
        const nextDivider = i + 2 < lines.length && /^[-*=]{3,}$/.test(lines[i + 2].trim());

        if (nextDivider && candidateTitle.length > 2 && candidateTitle.length < 80) {
          if (currentLines.length > 0) {
            parsed.push({
              title: currentTitle,
              kind: currentKind,
              rawLines: currentLines,
            });
          }
          currentTitle = candidateTitle;
          currentKind = determineKind(candidateTitle);
          currentLines = [];
          i += 2;
          continue;
        }
      }

      if (trimmed.startsWith("## ") || trimmed.startsWith("### ")) {
        if (currentLines.length > 0) {
          parsed.push({
            title: currentTitle,
            kind: currentKind,
            rawLines: currentLines,
          });
        }
        currentTitle = trimmed.replace(/^#+\s*/, "");
        currentKind = determineKind(currentTitle);
        currentLines = [];
        continue;
      }

      currentLines.push(line);
    }

    if (currentLines.length > 0) {
      parsed.push({
        title: currentTitle,
        kind: currentKind,
        rawLines: currentLines,
      });
    }

    return parsed;
  }, [rawSpec, aiSections]);

  // Filter sections by search text
  const filteredSections = useMemo(() => {
    return sections.filter((sec) => {
      if (activeTab !== "all" && sec.kind !== activeTab) return false;
      if (!searchFilter.trim()) return true;
      const q = searchFilter.toLowerCase();
      return (
        sec.title.toLowerCase().includes(q) ||
        sec.rawLines.some((l) => l.toLowerCase().includes(q))
      );
    });
  }, [sections, searchFilter, activeTab]);

  if (!rawSpec && !aiSections) {
    return (
      <div className="p-5 rounded-2xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/30 text-xs text-[var(--text-muted)] italic text-center font-sans">
        No extended syllabus or rubric description provided. Refer to Canvas modules for details.
      </div>
    );
  }

  const tabs = aiSections
    ? [
        { id: "all", label: `All (${sections.length})` },
        { id: "general", label: "General" },
        { id: "submit", label: "Deliverables" },
        { id: "grading", label: "Rubric" },
        { id: "policy", label: "Policies" },
        { id: "contract", label: "Full Spec" },
      ]
    : [
        { id: "all", label: `All (${sections.length})` },
        { id: "general", label: "General" },
        { id: "submit", label: "Deliverables" },
        { id: "grading", label: "Rubric" },
        { id: "traps", label: "Traps" },
        { id: "policy", label: "Policies" },
      ];

  return (
    <div className="space-y-4">
      {/* Search & Navigation Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2 border-b border-[var(--border-hairline)]/70">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-[var(--text-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search specs, deliverables, rubric..."
            value={searchFilter}
            onChange={(e) => setSearchFilter(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-hidden focus:border-[var(--accent-primary)] transition-colors"
          />
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 text-micro font-mono">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-2 py-1 rounded-md transition-all cursor-pointer whitespace-nowrap border ${
                activeTab === tab.id
                  ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border-[var(--accent-primary)]/40 font-semibold"
                  : "bg-[var(--bg-base)] text-[var(--text-muted)] hover:text-[var(--text-primary)] border-[var(--border-hairline)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Render Filtered Sections */}
      <div className="space-y-4">
        {filteredSections.map((sec, sIdx) => {
          const contentText = sec.rawLines.join("\n").trim();
          if (!contentText && sec.title === "Overview & Specifications") return null;

          // Render distinctive styling based on section kind
          const isTraps = sec.kind === "traps";
          const isPolicy = sec.kind === "policy";
          const isSubmit = sec.kind === "submit";
          const isBuild = sec.kind === "build";
          const isGrading = sec.kind === "grading";

          return (
            <div
              key={sIdx}
              className={`p-4 sm:p-5 rounded-2xl border transition-all ${
                isTraps
                  ? "border-amber-500/40 bg-amber-500/5"
                  : isPolicy
                  ? "border-purple-500/40 bg-purple-500/5"
                  : isSubmit
                  ? "border-[var(--accent-primary)]/40 bg-[var(--accent-primary)]/5"
                  : isGrading
                  ? "border-emerald-500/30 bg-emerald-500/5"
                  : "border-[var(--border-hairline)] bg-[var(--bg-surface)]/40"
              }`}
            >
              {/* Section Header */}
              <div className="flex items-center justify-between gap-2 pb-2.5 mb-3 border-b border-[var(--border-hairline)]/60">
                <div className="flex items-center gap-2 min-w-0">
                  {isTraps ? (
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  ) : isPolicy ? (
                    <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                  ) : isSubmit ? (
                    <ListChecks className="w-4 h-4 text-[var(--accent-primary)] shrink-0" />
                  ) : isGrading ? (
                    <Award className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : isBuild ? (
                    <Terminal className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  ) : (
                    <Layers className="w-4 h-4 text-[var(--text-muted)] shrink-0" />
                  )}

                  <h4
                    className="font-serif italic text-sm sm:text-base font-bold text-[var(--text-primary)] leading-snug truncate"
                    style={{ fontFamily: "var(--font-serif)" }}
                  >
                    {sec.title}
                  </h4>
                </div>

                <span
                  className={`text-micro font-mono uppercase tracking-wider px-2 py-0.5 rounded font-semibold shrink-0 ${
                    isTraps
                      ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                      : isPolicy
                      ? "bg-purple-500/15 text-purple-300 border border-purple-500/30"
                      : isSubmit
                      ? "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)] border border-[var(--accent-primary)]/30"
                      : "bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-hairline)]"
                  }`}
                >
                  {sec.kind}
                </span>
              </div>

              {/* Formatted Content */}
              <FormattedMarkdown content={contentText} />
            </div>
          );
        })}

        {filteredSections.length === 0 && (
          <div className="p-8 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/20 text-center space-y-2">
            <Info className="w-5 h-5 text-[var(--text-muted)] mx-auto" />
            <p className="text-xs text-[var(--text-muted)] font-sans">
              No sections matching "{searchFilter}". Clear your filter to view full specifications.
            </p>
            <button
              type="button"
              onClick={() => {
                setSearchFilter("");
                setActiveTab("all");
              }}
              className="text-micro font-mono text-[var(--accent-primary)] hover:underline"
            >
              Reset Search & Filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
