/**
 * Demo Network Guard
 *
 * Hard Invariant:
 * When NEXT_PUBLIC_DEMO_MODE=true, NO network request may reach the FastAPI backend
 * or any external service. This guard logs loudly and throws immediately if one is attempted.
 */

import { isDemoMode } from "./demo-mode";

const ALLOWED_STATIC_PATTERNS = [
  "/_next/",
  ".svg",
  ".ico",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".woff",
  ".woff2",
  ".js",
  ".css",
  "blob:",
  "data:",
];

export function isAllowedStaticAsset(url: string): boolean {
  if (url.startsWith("/_next/") || url.includes("/_next/")) return true;
  if (url.startsWith("blob:") || url.startsWith("data:")) return true;
  // Next.js RSC router payload (?_rsc=...) or Next.js internal router requests
  if (url.includes("_rsc=") || url.includes("__nextjs")) return true;

  const cleanUrl = url.split("?")[0].toLowerCase();
  return ALLOWED_STATIC_PATTERNS.some((ext) => cleanUrl.endsWith(ext));
}

export function isAllowedInternalNextRequest(url: string): boolean {
  if (isAllowedStaticAsset(url)) return true;

  // In browser, allow same-origin frontend page navigations as long as not targeting backend /api/
  if (typeof window !== "undefined" && window.location?.origin) {
    const origin = window.location.origin;
    if (url.startsWith(origin)) {
      const pathnameAndQuery = url.slice(origin.length);
      if (!pathnameAndQuery.startsWith("/api/") && !pathnameAndQuery.includes("/api/")) {
        return true;
      }
    }
  }

  // Allow relative page navigation paths like "/brief", "/schedule" as long as not "/api/"
  if (url.startsWith("/") && !url.startsWith("/api/")) {
    return true;
  }

  return false;
}

export function assertNoDemoNetworkCall(endpointOrUrl: string): void {
  if (isDemoMode()) {
    const errorMsg = `[DEMO MODE GUARD VIOLATION] Prohibited network request to "${endpointOrUrl}"! When NEXT_PUBLIC_DEMO_MODE=true, all network requests to backend/external services are strictly forbidden.`;

    // Loud console output in dev and production
    console.error(
      `%c${errorMsg}`,
      "background: #991b1b; color: #ffffff; font-weight: bold; font-size: 14px; padding: 8px 12px; border-radius: 4px; border: 2px solid #ef4444;"
    );

    throw new Error(errorMsg);
  }
}

let isGuardInstalled = false;

export function installDemoNetworkGuard(): void {
  if (typeof window === "undefined" || isGuardInstalled) return;
  isGuardInstalled = true;

  const originalFetch = window.fetch;

  window.fetch = async function (input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
        ? input.href
        : input.url;

    if (isDemoMode() && !isAllowedInternalNextRequest(url)) {
      const isExternalOrBackend =
        url.includes("localhost:8000") ||
        url.includes("127.0.0.1:8000") ||
        url.startsWith("/api/") ||
        url.includes("/api/") ||
        ((url.startsWith("http://") || url.startsWith("https://")) &&
          (typeof window === "undefined" || !url.startsWith(window.location?.origin || "")));

      if (isExternalOrBackend) {
        assertNoDemoNetworkCall(url);
      }
    }

    return originalFetch.apply(this, [input, init]);
  };
}
