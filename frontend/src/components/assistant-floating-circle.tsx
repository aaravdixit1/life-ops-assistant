"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Sparkles } from "lucide-react";

export function AssistantFloatingCircle() {
  const pathname = usePathname();

  // Hide when already on the dedicated assistant page
  if (pathname === "/assistant") {
    return null;
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 print:hidden">
      <Link
        href="/assistant"
        aria-label="Open Assistant"
        className="group relative flex items-center justify-center w-12 h-12 rounded-full bg-[var(--bg-elevated)] hover:bg-[var(--accent-primary)] text-[var(--accent-primary)] hover:text-stone-950 border border-[var(--border-hairline)] hover:border-[var(--accent-primary)] shadow-lg hover:shadow-[0_0_24px_rgba(217,119,6,0.35)] transition-colors duration-75 active:scale-95 cursor-pointer"
      >
        {/* Subtle breathing glow */}
        <span className="absolute -inset-0.5 rounded-full bg-[var(--accent-primary)]/20 opacity-0 group-hover:opacity-100 transition-opacity" />

        {/* Icon */}
        <Sparkles className="w-5 h-5 relative z-10 transition-transform duration-150 group-hover:rotate-12" />

        {/* Tooltip Pill */}
        <span className="pointer-events-none absolute right-14 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-md bg-[var(--bg-elevated)] text-[var(--text-primary)] border border-[var(--border-hairline)] text-micro font-sans font-medium whitespace-nowrap shadow-md opacity-0 group-hover:opacity-100 transition-opacity duration-150">
          Assistant
        </span>
      </Link>
    </div>
  );
}
