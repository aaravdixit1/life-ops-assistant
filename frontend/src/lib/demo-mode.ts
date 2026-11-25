/**
 * Demo Mode configuration and utilities.
 *
 * Invariants:
 * 1. Off by default.
 * 2. When NEXT_PUBLIC_DEMO_MODE=true (or 1), demo mode is strictly locked on.
 * 3. In non-production, developers can also toggle client override in localStorage.
 */

export const IS_DEMO_MODE =
  process.env.NEXT_PUBLIC_DEMO_MODE === "true" ||
  process.env.NEXT_PUBLIC_DEMO_MODE === "1";

export function isDemoMode(): boolean {
  if (IS_DEMO_MODE) {
    return true;
  }

  // Allow client-side testing in browser during local development
  if (typeof window !== "undefined" && process.env.NODE_ENV !== "production") {
    try {
      const override = localStorage.getItem("lifeops_demo_mode_override");
      if (override === "true") return true;
    } catch {
      // Ignore localStorage errors
    }
  }

  return false;
}

export function setDemoModeClientOverride(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (enabled) {
      localStorage.setItem("lifeops_demo_mode_override", "true");
    } else {
      localStorage.removeItem("lifeops_demo_mode_override");
    }
    window.location.reload();
  } catch (e) {
    console.error("Failed to set demo mode client override", e);
  }
}

export function resetDemoData(): void {
  if (typeof window === "undefined") return;
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith("lifeops_demo_")) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
    window.dispatchEvent(new Event("lifeops-refresh-calendar"));
    window.dispatchEvent(new Event("lifeops-refresh-pending"));
    window.dispatchEvent(new Event("lifeops-refresh-logs"));
    window.dispatchEvent(new CustomEvent("lifeops-demo-reset"));
  } catch (e) {
    console.error("Failed to reset demo data", e);
  }
}
