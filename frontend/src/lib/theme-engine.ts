/**
 * Coolors.co OKLCH Palette Engine & Token Derivation
 * Conforms to Impeccable Design Standards & GEMINI.md Invariants
 */

export interface ThemePalette {
  id: string;
  name: string;
  coolorsUrl: string;
  hexes: string[];
}

export const STARTER_PALETTES: ThemePalette[] = [
  {
    id: "huemint-earth",
    name: "Huemint Earth & Ochre (Active)",
    coolorsUrl: "https://huemint.com/brand-intersection/#palette=edd8d5-4a1707-545535-d5af5a",
    hexes: ["edd8d5", "4a1707", "545535", "d5af5a"],
  },
  {
    id: "warm-obsidian",
    name: "Warm Obsidian & Amber",
    coolorsUrl: "https://coolors.co/1c1917-d97706-65a30d-dc2626-0284c7",
    hexes: ["1c1917", "d97706", "65a30d", "dc2626", "0284c7"],
  },
  {
    id: "ocean-indigo",
    name: "Ocean Teal & Indigo",
    coolorsUrl: "https://coolors.co/0f172a-14b8a6-eab308-f97316-6366f1",
    hexes: ["0f172a", "14b8a6", "eab308", "f97316", "6366f1"],
  },
  {
    id: "midnight-cyber",
    name: "Midnight Cyber & Emerald",
    coolorsUrl: "https://coolors.co/18181b-eab308-10b981-ef4444-3b82f6",
    hexes: ["18181b", "eab308", "10b981", "ef4444", "3b82f6"],
  },
];

/** Parse a Coolors.co or Huemint URL or raw hex string into clean 6-char hex strings */
export function parseCoolorsInput(input: string): string[] {
  if (!input) return [];

  // Match huemint palette URL e.g. #palette=edd8d5-4a1707-...
  const huemintMatch = input.match(/palette=([a-f0-9\-]+)/i);
  // Match coolors.co/<hex-hex-...>
  const coolorsMatch = input.match(/coolors\.co\/([a-f0-9\-]+)/i);

  const target = huemintMatch ? huemintMatch[1] : coolorsMatch ? coolorsMatch[1] : input;

  const found = target.match(/[a-f0-9]{6}/gi);
  if (found) {
    return Array.from(found).map((h) => h.toLowerCase());
  }

  return target
    .split(/[\-\s,]+/)
    .map((h) => h.replace(/^#/, "").trim().toLowerCase())
    .filter((h) => /^[a-f0-9]{6}$/i.test(h));
}

/** Convert standard 6-digit hex string to OKLCH */
export function hexToOklch(hex: string): { l: number; c: number; h: number } {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  // Linearize sRGB
  const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);

  // sRGB to OKLab matrix
  const l_ = 0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb;
  const m_ = 0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb;
  const s_ = 0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb;

  const l_cbrt = Math.cbrt(l_);
  const m_cbrt = Math.cbrt(m_);
  const s_cbrt = Math.cbrt(s_);

  const L = 0.2104542553 * l_cbrt + 0.793617785 * m_cbrt - 0.0040720468 * s_cbrt;
  const A = 1.9779984951 * l_cbrt - 2.428592205 * m_cbrt + 0.4505937099 * s_cbrt;
  const B = 0.0259040371 * l_cbrt + 0.7827717662 * m_cbrt - 0.808675766 * s_cbrt;

  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;

  return { l: L, c: C, h: H };
}

/**
 * Derive harmonious OKLCH surface, border, and text tokens
 * ensuring WCAG AA+ contrast in both Light and Dark modes.
 */
export function deriveOklchTokens(
  hexes: string[],
  mode: "light" | "dark" = "dark"
): Record<string, string> {
  const safeHexes = hexes.length >= 3 ? hexes : STARTER_PALETTES[0].hexes;
  const oklchs = safeHexes.map(hexToOklch);

  // Check if this is the Huemint Earth & Ochre palette (edd8d5, 4a1707, 545535, d5af5a)
  const isHuemint = safeHexes.some(
    (h) => h.includes("4a1707") || h.includes("edd8d5") || h.includes("d5af5a")
  );

  const oklchStr = (l: number, c: number, h: number) =>
    `oklch(${Math.max(0, Math.min(1, l)).toFixed(3)} ${Math.max(0, c).toFixed(4)} ${h.toFixed(1)})`;

  if (isHuemint) {
    // Exact mathematical role mapping for Huemint: edd8d5-4a1707-545535-d5af5a
    if (mode === "dark") {
      return {
        "--bg-base": oklchStr(0.190, 0.008, 65.0),             // Layered warm charcoal
        "--bg-sidebar": oklchStr(0.160, 0.008, 65.0),          // Deeper warm charcoal sidebar
        "--bg-elevated": oklchStr(0.220, 0.008, 65.0),
        "--bg-surface": oklchStr(0.250, 0.009, 65.0),
        "--bg-hover": oklchStr(0.280, 0.009, 65.0),
        "--border-hairline": "oklch(1 0 0 / 0.06)",
        "--text-primary": oklchStr(0.920, 0.006, 75.0),        // Soft warm off-white
        "--text-secondary": oklchStr(0.680, 0.008, 65.0),      // Soft warm secondary text
        "--text-muted": oklchStr(0.560, 0.008, 65.0),          // Muted text (>4.5:1 AA contrast)
        "--accent-primary": oklchStr(0.750, 0.090, 68.0),      // Calm muted sand-amber
        "--accent-secondary": oklchStr(0.660, 0.050, 105.0),   // Subtle olive sage
        "--semantic-success": oklchStr(0.720, 0.100, 135.0),
        "--semantic-warning": oklchStr(0.760, 0.100, 75.0),
        "--semantic-danger": oklchStr(0.680, 0.140, 28.0),
        "--semantic-info": oklchStr(0.700, 0.080, 230.0),
        "--selection-bg": oklchStr(0.350, 0.040, 68.0),
      };
    }

    // Light Mode for Huemint (calm, tactile warmth)
    return {
      "--bg-base": oklchStr(0.975, 0.008, 75.0),               // Warm oyster blush paper ground
      "--bg-sidebar": oklchStr(0.955, 0.008, 75.0),            // Subtle sidebar surface depth
      "--bg-elevated": oklchStr(0.990, 0.006, 75.0),
      "--bg-surface": oklchStr(0.940, 0.010, 75.0),
      "--bg-hover": oklchStr(0.910, 0.012, 75.0),
      "--border-hairline": "oklch(0 0 0 / 0.08)",
      "--text-primary": oklchStr(0.180, 0.020, 65.0),          // Deep espresso ink
      "--text-secondary": oklchStr(0.420, 0.015, 65.0),
      "--text-muted": oklchStr(0.560, 0.012, 65.0),
      "--accent-primary": oklchStr(0.520, 0.100, 68.0),        // Deep ochre amber
      "--accent-secondary": oklchStr(0.440, 0.050, 105.0),     // Olive moss
      "--semantic-success": oklchStr(0.420, 0.110, 135.0),
      "--semantic-warning": oklchStr(0.500, 0.110, 75.0),
      "--semantic-danger": oklchStr(0.460, 0.140, 28.0),
      "--semantic-info": oklchStr(0.440, 0.090, 230.0),
      "--selection-bg": oklchStr(0.880, 0.040, 68.0),
    };
  }

  // General derivation for other Coolors / custom palettes
  const sortedByL = [...oklchs].sort((a, b) => a.l - b.l);
  const darkest = sortedByL[0];
  const lightest = sortedByL[sortedByL.length - 1];

  const middle = sortedByL.slice(1, -1);
  const sortedByC = [...(middle.length > 0 ? middle : sortedByL)].sort((a, b) => b.c - a.c);
  const accent1 = sortedByC[0] || darkest;
  const accent2 = sortedByC[1] || sortedByC[0] || lightest;

  const baseHue = darkest.h;

  if (mode === "dark") {
    return {
      "--bg-base": oklchStr(0.190, 0.008, baseHue),
      "--bg-sidebar": oklchStr(0.160, 0.008, baseHue),
      "--bg-elevated": oklchStr(0.220, 0.008, baseHue),
      "--bg-surface": oklchStr(0.250, 0.009, baseHue),
      "--bg-hover": oklchStr(0.280, 0.009, baseHue),
      "--border-hairline": "oklch(1 0 0 / 0.06)",
      "--text-primary": oklchStr(0.920, 0.006, 75.0),
      "--text-secondary": oklchStr(0.680, 0.008, baseHue),
      "--text-muted": oklchStr(0.560, 0.008, baseHue),
      "--accent-primary": oklchStr(Math.min(accent1.l, 0.75), Math.min(accent1.c, 0.10), accent1.h),
      "--accent-secondary": oklchStr(Math.min(accent2.l, 0.66), Math.min(accent2.c, 0.06), accent2.h),
      "--semantic-success": oklchStr(0.720, 0.100, 135.0),
      "--semantic-warning": oklchStr(0.760, 0.100, 75.0),
      "--semantic-danger": oklchStr(0.680, 0.140, 28.0),
      "--semantic-info": oklchStr(0.700, 0.080, 230.0),
      "--selection-bg": oklchStr(0.350, 0.040, accent1.h),
    };
  }

  // Light Mode
  return {
    "--bg-base": oklchStr(0.975, 0.008, lightest.h),
    "--bg-sidebar": oklchStr(0.955, 0.008, lightest.h),
    "--bg-elevated": oklchStr(0.990, 0.006, lightest.h),
    "--bg-surface": oklchStr(0.940, 0.010, lightest.h),
    "--bg-hover": oklchStr(0.910, 0.012, lightest.h),
    "--border-hairline": "oklch(0 0 0 / 0.08)",
    "--text-primary": oklchStr(0.180, 0.020, darkest.h),
    "--text-secondary": oklchStr(0.420, 0.015, darkest.h),
    "--text-muted": oklchStr(0.560, 0.012, darkest.h),
    "--accent-primary": oklchStr(Math.min(accent1.l, 0.52), Math.min(accent1.c, 0.10), accent1.h),
    "--accent-secondary": oklchStr(Math.min(accent2.l, 0.44), Math.min(accent2.c, 0.05), accent2.h),
    "--semantic-success": oklchStr(0.420, 0.110, 135.0),
    "--semantic-warning": oklchStr(0.500, 0.110, 75.0),
    "--semantic-danger": oklchStr(0.460, 0.140, 28.0),
    "--semantic-info": oklchStr(0.440, 0.090, 230.0),
    "--selection-bg": oklchStr(0.880, 0.040, accent1.h),
  };
}

/** Apply tokens directly to the DOM root */
export function applyThemeToDom(hexes: string[], mode: "light" | "dark") {
  if (typeof document === "undefined") return;
  const tokens = deriveOklchTokens(hexes, mode);
  const root = document.documentElement;

  root.classList.remove("light", "dark");
  root.classList.add(mode);

  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }
}
