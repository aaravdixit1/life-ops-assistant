"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { SlidersHorizontal, ArrowRight, X, PanelLeftOpen } from "lucide-react";
import { Sidebar } from "@/components/sidebar";
import { CommandPalette } from "@/components/command-palette";
import { AssistantFloatingCircle } from "@/components/assistant-floating-circle";
import { ProfileProvider, useProfile } from "@/components/profile-provider";

const DISMISS_KEY = "lifeops-onboarding-dismissed:v1";
const SIDEBAR_OPEN_KEY = "lifeops-sidebar-open:v1";

function WorkspaceShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { profile, loading, isDemo } = useProfile();
  const [dismissed, setDismissed] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(DISMISS_KEY) === "true") {
        setDismissed(true);
      }
      const savedSidebar = localStorage.getItem(SIDEBAR_OPEN_KEY);
      if (savedSidebar === "false") {
        setSidebarOpen(false);
      }
    } catch {
      // Ignore localStorage errors
    }
  }, []);

  const toggleSidebar = useCallback((next?: boolean) => {
    setSidebarOpen((prev) => {
      const resolved = typeof next === "boolean" ? next : !prev;
      try {
        localStorage.setItem(SIDEBAR_OPEN_KEY, resolved ? "true" : "false");
      } catch {
        // Ignore localStorage errors
      }
      return resolved;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "b") {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
            target.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleSidebar]);

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, "true");
    } catch {
      // Ignore localStorage errors
    }
  };

  const showOnboardingBanner =
    !isDemo &&
    !loading &&
    Boolean(profile) &&
    !profile?.onboarding_completed &&
    pathname !== "/setup" &&
    !dismissed;

  return (
    <div className="flex h-screen w-full overflow-hidden bg-[var(--bg-base)] text-[var(--text-primary)]">
      {/* Collapsible Left Sidebar */}
      <Sidebar isOpen={sidebarOpen} onClose={() => toggleSidebar(false)} />

      {/* Floating Reopen Trigger when Sidebar is Closed */}
      {!sidebarOpen && (
        <button
          type="button"
          onClick={() => toggleSidebar(true)}
          aria-label="Open sidebar"
          title="Open sidebar (⌘B)"
          className="fixed top-3.5 left-3.5 z-40 flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)]/95 backdrop-blur-xs text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--accent-primary)]/50 shadow-sm transition-colors cursor-pointer"
        >
          <PanelLeftOpen className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
        </button>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto">
        {showOnboardingBanner && (
          <div
            className={`border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] py-2.5 pr-6 flex flex-wrap items-center justify-between gap-3 shrink-0 ${
              sidebarOpen ? "pl-6" : "pl-14"
            }`}
          >
            <div className="flex items-center gap-2.5 text-xs text-[var(--text-secondary)]">
              <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--accent-primary)] shrink-0" />
              <span>
                Finish setting up your profile, Canvas LMS feed, and external calendars for personalized daily briefings.
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href="/setup"
                className="px-3 py-1 rounded-md text-xs font-semibold bg-[var(--accent-primary)] text-[var(--bg-base)] hover:opacity-90 transition-opacity flex items-center gap-1"
              >
                <span>Open Setup</span>
                <ArrowRight className="w-3 h-3" />
              </Link>
              <button
                type="button"
                onClick={handleDismiss}
                aria-label="Dismiss setup banner"
                className="p-1 rounded text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        <main
          className={`flex-1 py-6 md:py-8 pr-6 md:pr-8 max-w-6xl w-full mx-auto transition-[padding] duration-200 ${
            sidebarOpen ? "pl-6 md:pl-8" : "pl-14 md:pl-16"
          }`}
        >
          {children}
        </main>
      </div>

      {/* Sticky Bottom-Right Assistant Circle */}
      <AssistantFloatingCircle />

      {/* Global Cmd+K Command Palette */}
      <CommandPalette />
    </div>
  );
}

export function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <ProfileProvider>
      <WorkspaceShell>{children}</WorkspaceShell>
    </ProfileProvider>
  );
}
