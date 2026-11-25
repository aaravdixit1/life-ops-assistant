"use client";

import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { RotateCcw, ShieldCheck, Database, X, ExternalLink, Sparkles } from "lucide-react";
import { isDemoMode, resetDemoData, setDemoModeClientOverride, IS_DEMO_MODE } from "@/lib/demo-mode";
import { PERSONA } from "@/lib/persona";

export function DemoModeIndicator() {
  const [active, setActive] = useState(IS_DEMO_MODE);
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    setActive(isDemoMode());
    setMounted(true);
  }, []);

  // Listen for Escape key to close modal
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  if (!active) {
    return null;
  }

  const handleReset = () => {
    resetDemoData();
    setResetSuccess(true);
    setTimeout(() => {
      setResetSuccess(false);
      setOpen(false);
    }, 1200);
  };

  const handleToggleOff = () => {
    setDemoModeClientOverride(false);
  };

  return (
    <>
      {/* Sidebar Demo Status Pill (No dot before standalone) */}
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors text-micro font-sans group cursor-pointer shadow-2xs"
        title="Running in Standalone Demo Mode — Click to inspect"
      >
        <span className="font-semibold text-[var(--text-primary)] uppercase tracking-wider text-[10px]">
          Demo Mode
        </span>
        <span className="text-[10px] text-[var(--text-muted)] font-mono">
          Standalone
        </span>
      </button>

      {/* Popover Modal Portaled to document.body, perfectly themed */}
      {mounted && open && typeof document !== "undefined" && createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          {/* Dimmed backdrop with click-outside to close */}
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
            onClick={() => setOpen(false)}
          />

          {/* Solid Opaque Dialog Card matching project palette */}
          <div
            style={{
              backgroundColor: "var(--bg-elevated)",
              color: "var(--text-primary)",
            }}
            className="relative w-full max-w-md max-h-[90vh] overflow-y-auto rounded-xl border border-[var(--border-hairline)] shadow-2xl p-5 space-y-4 font-sans animate-in fade-in zoom-in-95 duration-100 z-10"
          >
            {/* Header */}
            <div className="flex items-start justify-between pb-3 border-b border-[var(--border-hairline)]">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)] font-sans">
                    Standalone Demo Mode
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[var(--semantic-success)]/15 text-[var(--semantic-success)] border border-[var(--semantic-success)]/30 font-medium">
                    Active
                  </span>
                </div>
                <p className="text-xs text-[var(--text-muted)] mt-0.5 font-sans">
                  Public zero-backend preview deployment
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Content Body */}
            <div className="space-y-3 text-xs text-[var(--text-secondary)] font-sans">
              {/* About This Project pitch card */}
              <div
                style={{ backgroundColor: "var(--bg-surface)" }}
                className="p-3.5 rounded-lg border border-[var(--border-hairline)] space-y-2.5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[var(--accent-primary)] font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3 h-3" />
                    About This Project
                  </span>
                  <a
                    href="https://github.com/aaravdixit1/life-ops-assistant"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-[11px] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
                  >
                    <span className="font-mono">GitHub</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <p className="text-micro text-[var(--text-secondary)] leading-relaxed">
                  Life-Ops Assistant is an autonomous operations system for engineering students that reconciles university deadlines, study schedules, nutrition macros, and daily priorities into an integrated dashboard with zero-cost architecture and reversible automation.
                </p>

                <div className="pt-2 border-t border-[var(--border-hairline)] space-y-1.5 text-micro">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-muted)] block font-semibold">
                    Core Design Decisions
                  </span>
                  <p className="text-[var(--text-secondary)]">
                    <strong className="text-[var(--text-primary)] font-medium">1. Scoped Autopilot:</strong> Auto-edits only flexible study blocks with 1-click Undo; fixed classes, exams, and external events require explicit confirmation.
                  </p>
                  <p className="text-[var(--text-secondary)]">
                    <strong className="text-[var(--text-primary)] font-medium">2. Two-Layer Ingestion:</strong> Unattended private .ics feed polling paired with Playwright browser session for deep syllabi extraction.
                  </p>
                  <p className="text-[var(--text-secondary)]">
                    <strong className="text-[var(--text-primary)] font-medium">3. Dual-Model Router:</strong> Local Ollama (llama3.2:3b) for routine queries, Gemini Flash for multi-source conflict reasoning, and Exam Mode for cloud offload.
                  </p>
                </div>

                <div className="pt-2 border-t border-[var(--border-hairline)] flex flex-wrap gap-1.5">
                  <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-secondary)]">Next.js 16</span>
                  <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-secondary)]">Tailwind v4</span>
                  <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-secondary)]">FastAPI</span>
                  <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-secondary)]">PostgreSQL 16 + pgvector</span>
                  <span className="px-1.5 py-0.5 rounded font-mono text-[10px] bg-[var(--bg-elevated)] border border-[var(--border-hairline)] text-[var(--text-secondary)]">APScheduler</span>
                </div>
              </div>

              {/* Active Candidate Persona */}
              <div
                style={{ backgroundColor: "var(--bg-surface)" }}
                className="p-3 rounded-lg border border-[var(--border-hairline)] space-y-1"
              >
                <span className="text-[10px] uppercase font-mono tracking-wider text-[var(--text-muted)] block font-semibold">
                  Fictional Candidate Persona
                </span>
                <p className="font-semibold text-sm text-[var(--text-primary)]">
                  {PERSONA.name} · {PERSONA.termLabel}
                </p>
                <p className="text-micro text-[var(--text-secondary)]">
                  B.S. Computer Science & Systems Engineering
                </p>
              </div>

              {/* Invariant Guarantees */}
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-[var(--semantic-success)] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium text-[var(--text-primary)] text-micro block">
                      Zero Backend & External Network Calls
                    </span>
                    <span className="text-micro text-[var(--text-muted)] leading-relaxed block">
                      Guarded by client interceptors. No FastAPI, PostgreSQL, or live LLM connection needed.
                    </span>
                  </div>
                </div>

                <div className="flex items-start gap-2">
                  <Database className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0 mt-0.5" />
                  <div>
                    <span className="font-medium text-[var(--text-primary)] text-micro block">
                      Interactive Browser Storage
                    </span>
                    <span className="text-micro text-[var(--text-muted)] leading-relaxed block">
                      Edits, meal logs, and scheduled blocks persist in localStorage.
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="pt-2 border-t border-[var(--border-hairline)] space-y-2">
              <button
                onClick={handleReset}
                disabled={resetSuccess}
                style={{ backgroundColor: "var(--bg-surface)" }}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium border border-[var(--border-hairline)] hover:bg-[var(--bg-hover)] text-[var(--text-primary)] transition-colors cursor-pointer"
              >
                <RotateCcw className={`w-3.5 h-3.5 ${resetSuccess ? "animate-spin text-[var(--semantic-success)]" : ""}`} />
                <span>{resetSuccess ? "Demo Data Reset to Fresh Fixtures!" : "Reset Demo Data"}</span>
              </button>

              {!IS_DEMO_MODE && (
                <button
                  onClick={handleToggleOff}
                  className="w-full text-center text-micro text-[var(--text-muted)] hover:text-[var(--text-secondary)] py-1 transition-colors cursor-pointer"
                >
                  Disable Dev Demo Override (Switch to Real Backend)
                </button>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
