"use client";

import React, { useState, useEffect, useRef } from "react";
import { Sun, Moon, Palette, Check, ArrowRight, X } from "lucide-react";
import {
  STARTER_PALETTES,
  parseCoolorsInput,
  applyThemeToDom,
  type ThemePalette,
} from "@/lib/theme-engine";

export function AppearancePopover() {
  const [mounted, setMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [activePalette, setActivePalette] = useState<ThemePalette>(STARTER_PALETTES[0]);
  const [customInput, setCustomInput] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem("lifeops-theme-pref");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.palette && parsed.mode) {
          setActivePalette(parsed.palette);
          setMode(parsed.mode);
          applyThemeToDom(parsed.palette.hexes, parsed.mode);
          return;
        }
      }
    } catch (e) {
      console.warn("Could not read theme from localStorage", e);
    }
    applyThemeToDom(STARTER_PALETTES[0].hexes, "dark");
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleSelectPalette = (palette: ThemePalette) => {
    setActivePalette(palette);
    applyThemeToDom(palette.hexes, mode);
    try {
      localStorage.setItem("lifeops-theme-pref", JSON.stringify({ palette, mode }));
    } catch {}
  };

  const handleToggleMode = () => {
    const nextMode = mode === "dark" ? "light" : "dark";
    setMode(nextMode);
    applyThemeToDom(activePalette.hexes, nextMode);
    try {
      localStorage.setItem("lifeops-theme-pref", JSON.stringify({ palette: activePalette, mode: nextMode }));
    } catch {}
  };

  const handleImportCustom = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    const hexes = parseCoolorsInput(customInput);
    if (hexes.length < 3) {
      setErrorMsg("Requires at least 3 hex codes");
      return;
    }

    const newPalette: ThemePalette = {
      id: `custom-${Date.now()}`,
      name: `Custom (${hexes.slice(0, 3).map((h) => `#${h}`).join(", ")})`,
      coolorsUrl: customInput.startsWith("http") ? customInput : `https://coolors.co/${hexes.join("-")}`,
      hexes: hexes,
    };

    handleSelectPalette(newPalette);
    setCustomInput("");
  };

  if (!mounted) {
    return (
      <div className="h-9 w-full rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)]" />
    );
  }

  return (
    <div className="relative" ref={popoverRef}>
      {/* Trigger Button in Sidebar */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-hover)] transition-colors border border-[var(--border-hairline)] bg-[var(--bg-elevated)]"
        title="Theme & Colors"
      >
        <div className="flex items-center gap-2">
          <Palette className="w-3.5 h-3.5 text-[var(--accent-primary)]" />
          <span className="truncate">Theme</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex -space-x-1 items-center">
            {activePalette.hexes.slice(0, 3).map((hex, i) => (
              <span
                key={i}
                className="w-2.5 h-2.5 rounded-full border border-black/20"
                style={{ backgroundColor: `#${hex}` }}
              />
            ))}
          </div>
          {mode === "dark" ? (
            <Moon className="w-3 h-3 text-[var(--text-muted)]" />
          ) : (
            <Sun className="w-3 h-3 text-[var(--text-muted)]" />
          )}
        </div>
      </button>

      {/* Popover Panel (anchored above trigger in sidebar) */}
      {isOpen && (
        <div className="absolute bottom-11 left-0 w-64 p-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] shadow-xl z-50 space-y-3">
          <div className="flex items-center justify-between pb-2 border-b border-[var(--border-hairline)]">
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Appearance
            </span>
            <div className="flex items-center gap-1">
              <button
                onClick={handleToggleMode}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-secondary)] transition-colors"
                title={`Switch to ${mode === "dark" ? "Light" : "Dark"} Mode`}
              >
                {mode === "dark" ? (
                  <Sun className="w-3.5 h-3.5" />
                ) : (
                  <Moon className="w-3.5 h-3.5" />
                )}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded hover:bg-[var(--bg-hover)] text-[var(--text-muted)]"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Starter Palettes */}
          <div className="space-y-1">
            <div className="text-[10px] text-[var(--text-muted)] font-medium">
              PRESET PALETTES
            </div>
            {STARTER_PALETTES.map((p) => {
              const isSelected = activePalette.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => handleSelectPalette(p)}
                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs transition-colors ${
                    isSelected
                      ? "bg-[var(--bg-surface)] text-[var(--text-primary)] font-medium"
                      : "text-[var(--text-secondary)] hover:bg-[var(--bg-hover)]"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex -space-x-1 items-center">
                      {p.hexes.map((hex, i) => (
                        <span
                          key={i}
                          className="w-2.5 h-2.5 rounded-full border border-black/20"
                          style={{ backgroundColor: `#${hex}` }}
                        />
                      ))}
                    </div>
                    <span className="truncate text-[11px]">{p.name.split(" (")[0]}</span>
                  </div>
                  {isSelected && <Check className="w-3 h-3 text-[var(--accent-primary)]" />}
                </button>
              );
            })}
          </div>

          {/* Palette URL Importer */}
          <div className="pt-2 border-t border-[var(--border-hairline)] space-y-1.5">
            <div className="text-[10px] text-[var(--text-muted)] font-medium">
              IMPORT COOLORS / HUEMINT URL
            </div>
            <form onSubmit={handleImportCustom} className="flex items-center gap-1">
              <input
                type="text"
                value={customInput}
                onChange={(e) => setCustomInput(e.target.value)}
                placeholder="coolors.co/... or huemint.com/..."
                className="w-full px-2 py-1 text-[11px] font-mono rounded border border-[var(--border-hairline)] bg-[var(--bg-base)] text-[var(--text-primary)] placeholder-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-primary)]"
              />
              <button
                type="submit"
                className="px-2 py-1 text-[11px] font-semibold rounded bg-[var(--accent-primary)] text-stone-950 hover:opacity-90"
              >
                <ArrowRight className="w-3 h-3" />
              </button>
            </form>
            {errorMsg && (
              <p className="text-[10px] text-[var(--semantic-danger)]">{errorMsg}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
