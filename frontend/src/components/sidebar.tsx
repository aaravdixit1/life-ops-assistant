"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Sparkles,
  CalendarDays,
  Calendar,
  GraduationCap,
  Utensils,
  Briefcase,
  Search,
  RefreshCw,
  SlidersHorizontal,
  Zap,
  Bot,
  PanelLeftClose,
} from "lucide-react";
import { AppearancePopover } from "@/components/appearance-popover";
import { pollCanvasNow, toggleExamMode } from "@/lib/api";
import { useProfile } from "@/components/profile-provider";

const NAV_ITEMS = [
  { href: "/brief", label: "Daily Brief", icon: Sparkles },
  { href: "/assistant", label: "Assistant", icon: Bot },
  { href: "/", label: "Today", icon: CalendarDays },
  { href: "/schedule", label: "Schedule", icon: Calendar },
  { href: "/academics", label: "Academics", icon: GraduationCap },
  { href: "/health", label: "Health & Prep", icon: Utensils },
  { href: "/career", label: "Career", icon: Briefcase },
  { href: "/setup", label: "Setup & Integrations", icon: SlidersHorizontal },
];

export function Sidebar({
  isOpen = true,
  onClose,
}: {
  isOpen?: boolean;
  onClose?: () => void;
}) {
  const pathname = usePathname();
  const { displayName, initials, termLabel, activeAssignmentsCount } = useProfile();
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [examMode, setExamMode] = useState(false);

  useEffect(() => {
    const handleExamModeSync = (e: any) => {
      if (typeof e.detail?.enabled === "boolean") {
        setExamMode(e.detail.enabled);
      }
    };
    window.addEventListener("lifeops-exam-mode-sync", handleExamModeSync);
    return () => window.removeEventListener("lifeops-exam-mode-sync", handleExamModeSync);
  }, []);

  const handleOpenPalette = () => {
    window.dispatchEvent(new Event("lifeops-open-command-palette"));
  };

  const handleToggleExamMode = async () => {
    const next = !examMode;
    setExamMode(next);
    try {
      await toggleExamMode(next);
      window.dispatchEvent(new CustomEvent("lifeops-exam-mode-sync", { detail: { enabled: next } }));
    } catch (e) {
      console.error(e);
    }
  };

  const handleSyncCanvas = async () => {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const res = await pollCanvasNow();
      setSyncMsg(res.status === "success" ? "Synced" : "Done");
      window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    } catch {
      setSyncMsg("Error");
    } finally {
      setSyncing(false);
      setTimeout(() => setSyncMsg(null), 3000);
    }
  };

  return (
    <aside
      aria-hidden={!isOpen}
      className={`shrink-0 bg-[var(--bg-sidebar)] flex flex-col justify-between h-screen sticky top-0 select-none transition-all duration-200 overflow-hidden ${
        isOpen
          ? "w-[220px] border-r border-[var(--border-hairline)] opacity-100"
          : "w-0 border-r-0 opacity-0 pointer-events-none"
      }`}
    >
      {/* Top Header & Identity */}
      <div className="p-3.5 space-y-3 w-[220px]">
        <div className="flex items-center justify-between gap-2 px-1 py-1">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-7 h-7 rounded-md bg-[var(--accent-primary)]/15 border border-[var(--accent-primary)]/30 flex items-center justify-center text-[var(--accent-primary)] font-semibold text-xs font-sans shrink-0">
              {initials}
            </div>
            <div className="min-w-0">
              <h1 className="text-xs font-semibold text-[var(--text-primary)] truncate font-sans">
                {displayName}
              </h1>
              <p className="text-[11px] text-[var(--text-muted)] truncate font-sans">
                {termLabel}
              </p>
            </div>
          </div>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Close sidebar"
              title="Close sidebar (⌘B)"
              className="p-1.5 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer shrink-0"
            >
              <PanelLeftClose className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Global Exam Mode Toggle directly beneath identity chip */}
        <button
          onClick={handleToggleExamMode}
          className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-sans transition-colors border ${
            examMode
              ? "bg-[var(--semantic-warning)]/15 border-[var(--semantic-warning)]/40 text-[var(--semantic-warning)] font-medium"
              : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-muted)] hover:text-[var(--text-primary)]"
          }`}
          title="Exam Mode: Bypasses local inference to keep local CPU/GPU at 0% load"
        >
          <div className="flex items-center gap-1.5">
            <Zap className={`w-3.5 h-3.5 ${examMode ? "text-[var(--semantic-warning)]" : ""}`} />
            <span>Exam Mode</span>
          </div>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-sans font-medium uppercase tracking-wider ${
              examMode
                ? "bg-[var(--semantic-warning)]/20 text-[var(--semantic-warning)]"
                : "bg-[var(--bg-base)] text-[var(--text-muted)] border border-[var(--border-hairline)]"
            }`}
          >
            {examMode ? "Active" : "Off"}
          </span>
        </button>

        {/* Global Search / Cmd+K Trigger */}
        <button
          onClick={handleOpenPalette}
          className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-muted)] transition-colors"
        >
          <div className="flex items-center gap-2">
            <Search className="w-3.5 h-3.5 text-[var(--text-muted)]" />
            <span className="font-normal">Assistant</span>
          </div>
          <kbd className="px-1.5 py-0.5 rounded text-[10px] font-mono border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-muted)]">
            ⌘K
          </kbd>
        </button>

        {/* Navigation Items (Things 3 / Linear Style) */}
        <nav className="space-y-0.5 pt-1">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname?.startsWith(item.href);
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  isActive
                    ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-semibold shadow-xs"
                    : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)]"
                }`}
              >
                <Icon
                  className={`w-3.5 h-3.5 ${
                    isActive
                      ? "text-[var(--accent-primary)]"
                      : "text-[var(--text-muted)]"
                  }`}
                />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Bottom Area: Canvas Sync & Appearance */}
      <div className="p-3 border-t border-[var(--border-hairline)] space-y-2 w-[220px]">
        {/* Canvas Sync Status */}
        <div className="flex items-center justify-between px-1 text-xs text-[var(--text-muted)] font-sans">
          <div className="flex items-center gap-1.5 truncate">
            <span className="text-[var(--text-secondary)] font-medium">Canvas:</span>
            <span className="font-sans tabular-nums text-[var(--text-primary)] font-medium">
              {activeAssignmentsCount} {activeAssignmentsCount === 1 ? "item" : "items"}
            </span>
          </div>
          <button
            onClick={handleSyncCanvas}
            disabled={syncing}
            className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)] hover:text-[var(--text-primary)] transition-colors"
            title="Sync Canvas ICS feed"
          >
            <RefreshCw
              className={`w-3 h-3 ${
                syncing ? "animate-spin text-[var(--accent-primary)]" : ""
              }`}
            />
          </button>
        </div>
        {syncMsg && (
          <p className="px-1 text-micro font-sans text-[var(--accent-primary)]">
            {syncMsg}
          </p>
        )}

        {/* Appearance Popover Trigger */}
        <AppearancePopover />
      </div>
    </aside>
  );
}
