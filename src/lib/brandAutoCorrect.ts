/**
 * Brand readability auto-correct.
 *
 * Inspects a property/portfolio brand palette against the surfaces that actually
 * appear in the booking flow — in BOTH day (light) and dark presentation — and
 * proposes hue-preserving corrections the user can review and accept.
 */

import {
  contrastRatio,
  hexLuminance,
  enforceContrast,
  bestForegroundFor,
  mixHex,
} from "./brandOverride";

export interface BrandPalette {
  brand_primary_color?: string | null;
  brand_secondary_color?: string | null;
  brand_font_color?: string | null;
  brand_heading_text_color?: string | null;
  brand_body_text_color?: string | null;
  brand_muted_text_color?: string | null;
  brand_light_bg_color?: string | null;
  brand_dark_bg_color?: string | null;
}

export type BrandField = keyof BrandPalette;
export type BrandMode = "light" | "dark";
/** Which product surface the problem shows up on. */
export type BrandScope = "booking" | "rolos";

export interface BrandFix {
  id: string;
  field: BrandField;
  label: string;
  surface: string;
  current: string;
  proposed: string;
  reason: string;
  ratioBefore: number;
  ratioAfter: number;
  severity: "fail" | "warn";
  /** Which presentation mode(s) the underlying problem shows up in. */
  modes: BrandMode[];
  /** Guest-facing booking pages, or the ROLOS admin interface. */
  scope: BrandScope;
}


export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

export const DEFAULT_LIGHT_BG = "#FFFFFF";
export const DEFAULT_DARK_BG = "#1A1A2E";

const isHex = (v?: string | null): v is string => !!v && /^#[0-9a-fA-F]{6}$/.test(v.trim());

/** Preserve hue: mix toward white/black only, never rotate hue. */
function nudgeUntilReadable(fg: string, bg: string, min: number): string {
  const target = hexLuminance(bg) > 0.4 ? "#000000" : "#ffffff";
  for (let i = 1; i <= 20; i++) {
    const candidate = mixHex(fg, target, i * 0.05);
    if (contrastRatio(candidate, bg) >= min) return candidate;
  }
  return enforceContrast(fg, bg, min);
}

/**
 * Nudge a *background* away from a foreground it clashes with (used when the
 * text colour has to stay put because it is validated against another surface).
 */
function nudgeBackground(bg: string, fg: string, min: number): string {
  const target = hexLuminance(fg) > 0.4 ? "#000000" : "#ffffff";
  for (let i = 1; i <= 20; i++) {
    const candidate = mixHex(bg, target, i * 0.05);
    if (contrastRatio(fg, candidate) >= min) return candidate;
  }
  return bg;
}

/**
 * Find a single value that clears `min` against BOTH backgrounds while staying
 * as close to the original hue/lightness as possible. Returns null when no
 * mid-tone can satisfy both (e.g. white and near-black surfaces).
 */
function reconcileForBothModes(fg: string, bgA: string, bgB: string, min: number): string | null {
  const candidates: string[] = [];
  for (let i = 0; i <= 20; i++) {
    candidates.push(mixHex(fg, "#000000", i * 0.05));
    candidates.push(mixHex(fg, "#ffffff", i * 0.05));
  }
  let best: { hex: string; worst: number } | null = null;
  for (const c of candidates) {
    const worst = Math.min(contrastRatio(c, bgA), contrastRatio(c, bgB));
    if (worst >= min && (!best || worst > best.worst)) best = { hex: c, worst };
  }
  return best ? best.hex : null;
}

interface CheckSpec {
  id: string;
  field: BrandField;
  label: string;
  surface: string;
  fg: string;
  bg: string;
  min: number;
  reason: string;
  mode: BrandMode;
  /** Defaults to the guest-facing booking pages. */
  scope?: BrandScope;

  /** When true, propose a plain white/near-black foreground rather than a nudge */
  preferPlain?: boolean;
  /** When true, the *background* is corrected instead of the text colour. */
  correctBackground?: boolean;
  /** Correction must also stay readable on this second surface. */
  alsoReadableOn?: string;
}

export interface ResolvedPalette {
  primary: string | null;
  secondary: string | null;
  lightBg: string;
  darkBg: string;
  heading: string | null;
  body: string | null;
  muted: string | null;
}

export function resolvePalette(palette: BrandPalette): ResolvedPalette {
  const legacyFont = isHex(palette.brand_font_color) ? palette.brand_font_color!.trim() : null;
  return {
    primary: isHex(palette.brand_primary_color) ? palette.brand_primary_color!.trim() : null,
    secondary: isHex(palette.brand_secondary_color) ? palette.brand_secondary_color!.trim() : null,
    lightBg: isHex(palette.brand_light_bg_color) ? palette.brand_light_bg_color!.trim() : DEFAULT_LIGHT_BG,
    darkBg: isHex(palette.brand_dark_bg_color) ? palette.brand_dark_bg_color!.trim() : DEFAULT_DARK_BG,
    heading: isHex(palette.brand_heading_text_color) ? palette.brand_heading_text_color!.trim() : legacyFont,
    body: isHex(palette.brand_body_text_color) ? palette.brand_body_text_color!.trim() : legacyFont,
    muted: isHex(palette.brand_muted_text_color) ? palette.brand_muted_text_color!.trim() : null,
  };
}

/**
 * Build the list of readability problems + proposed corrections.
 * Both day and dark presentation are assessed.
 */
export function proposeBrandFixes(palette: BrandPalette): BrandFix[] {
  const { primary, secondary, lightBg, darkBg, heading, body, muted } = resolvePalette(palette);

  const headingField: BrandField = palette.brand_heading_text_color
    ? "brand_heading_text_color"
    : "brand_font_color";
  const bodyField: BrandField = palette.brand_body_text_color ? "brand_body_text_color" : "brand_font_color";

  const specs: CheckSpec[] = [];

  /* ── DAY MODE — page, cards, prices ───────────────────────────── */
  if (heading) {
    specs.push({
      id: "heading-on-light",
      field: headingField,
      label: "Heading text",
      surface: "Page & card background (day)",
      fg: heading,
      bg: lightBg,
      min: AA_LARGE,
      mode: "light",
      reason: "Headings must stay legible on the day-mode page and card background.",
    });
  }
  if (body) {
    specs.push({
      id: "body-on-light",
      field: bodyField,
      label: "Body text",
      surface: "Page & card background (day)",
      fg: body,
      bg: lightBg,
      min: AA_TEXT,
      mode: "light",
      reason: "Body copy needs AA contrast (4.5:1) on the day-mode page background.",
    });
  }
  if (muted) {
    specs.push({
      id: "muted-on-light",
      field: "brand_muted_text_color",
      label: "Muted / secondary text",
      surface: "Page & card background (day)",
      fg: muted,
      bg: lightBg,
      min: AA_TEXT,
      mode: "light",
      reason: "Dates, fine print and helper text use this colour on light surfaces.",
    });
  }

  /* ── Brand fills — same in both modes ─────────────────────────── */
  if (primary && body) {
    specs.push({
      id: "body-on-primary",
      field: bodyField,
      label: "Text on the primary brand bar",
      surface: "Booking header & rate calendar header",
      fg: body,
      bg: primary,
      min: AA_TEXT,
      mode: "light",
      reason:
        "The property header bar and the rate calendar header row are filled with the primary colour — text on them must be near-white or near-black.",
      preferPlain: true,
    });
  }
  if (secondary && body) {
    specs.push({
      id: "body-on-secondary",
      field: bodyField,
      label: "Text on the secondary surface",
      surface: "Panels & badges",
      fg: body,
      bg: secondary,
      min: AA_TEXT,
      mode: "light",
      reason: "Secondary panels use this fill behind labels and badges.",
      preferPlain: true,
    });
  }

  /* ── Primary as text — must work on BOTH page backgrounds ─────── */
  if (primary) {
    specs.push({
      id: "primary-as-text",
      field: "brand_primary_color",
      label: "Primary colour used as text",
      surface: "Prices, links & promo labels (day)",
      fg: primary,
      bg: lightBg,
      min: AA_LARGE,
      mode: "light",
      reason: "Prices and links render in the primary colour on the day-mode background.",
      alsoReadableOn: darkBg,
    });
    specs.push({
      id: "primary-as-text-dark",
      field: "brand_primary_color",
      label: "Primary colour used as text",
      surface: "Prices, links & promo labels (dark)",
      fg: primary,
      bg: darkBg,
      min: AA_LARGE,
      mode: "dark",
      reason: "In dark mode the same prices and links sit on the dark background.",
      alsoReadableOn: lightBg,
    });
  }

  /* ── DARK MODE — footer band, dark surfaces, dark app shell ───── */
  // The dark background is the editable field here: text colours are already
  // pinned by the day-mode checks, so we move the surface, not the type.
  if (heading) {
    specs.push({
      id: "heading-on-dark",
      field: "brand_dark_bg_color",
      label: "Dark background vs heading text",
      surface: "Dark band, footer & dark mode (dark)",
      fg: heading,
      bg: darkBg,
      min: AA_LARGE,
      mode: "dark",
      correctBackground: true,
      reason:
        "Your headings are unreadable on the dark background. Deepening the dark colour restores contrast without changing the type colour.",
    });
  }
  if (muted) {
    specs.push({
      id: "muted-on-dark",
      field: "brand_muted_text_color",
      label: "Muted text in dark mode",
      surface: "Dark band & footer (dark)",
      fg: muted,
      bg: darkBg,
      min: AA_TEXT,
      mode: "dark",
      reason: "Fine print keeps the same colour on dark bands — it must clear AA there too.",
      alsoReadableOn: lightBg,
    });
  }

  /* ── ROLOS ADMIN UI — the PMS shell, both modes ───────────────── */
  // The ROLOS surfaces are fixed by the app theme (they are not brandable),
  // so only the brand colours themselves can move.
  if (primary) {
    ROLOS_MODES.forEach(({ mode, page, label }) => {
      specs.push({
        id: `rolos-primary-${mode}`,
        field: "brand_primary_color",
        label: "Primary colour inside ROLOS",
        surface: `ROLOS buttons, active nav & charts (${label})`,
        fg: primary,
        bg: page,
        min: AA_LARGE,
        mode,
        scope: "rolos",
        reason: `Your primary colour is used for buttons, the active menu item and chart series inside the ROLOS interface — it must separate from the ${label} shell background.`,
        alsoReadableOn: mode === "light" ? ROLOS_DARK_PAGE : ROLOS_LIGHT_PAGE,
      });
    });
  }
  if (secondary) {
    ROLOS_MODES.forEach(({ mode, page, label }) => {
      specs.push({
        id: `rolos-secondary-${mode}`,
        field: "brand_secondary_color",
        label: "Secondary colour inside ROLOS",
        surface: `ROLOS badges & chart series (${label})`,
        fg: secondary,
        bg: page,
        min: AA_LARGE,
        mode,
        scope: "rolos",
        reason: `The secondary colour tints badges and secondary chart series in the ROLOS interface and must stay distinguishable on the ${label} shell.`,
        alsoReadableOn: mode === "light" ? ROLOS_DARK_PAGE : ROLOS_LIGHT_PAGE,
      });
    });
  }
  if (heading) {
    specs.push({
      id: "rolos-font-dark",
      field: headingField,
      label: "Brand font colour inside ROLOS (dark)",
      surface: "ROLOS cards & tables (dark)",
      fg: heading,
      bg: ROLOS_DARK_CARD,
      min: AA_TEXT,
      mode: "dark",
      scope: "rolos",
      reason:
        "This font colour cannot be used on ROLOS cards in dark mode. ROLOS now falls back to the theme text colour automatically — accepting this proposal lets your own colour be used in both modes instead.",
      alsoReadableOn: ROLOS_LIGHT_PAGE,
    });
  }

  const fixes: BrandFix[] = [];

  for (const spec of specs) {
    const scope: BrandScope = spec.scope ?? "booking";
    const before = contrastRatio(spec.fg, spec.bg);
    if (before >= spec.min) continue;

    let proposed: string;
    if (spec.correctBackground) {
      proposed = nudgeBackground(spec.bg, spec.fg, spec.min);
    } else if (spec.alsoReadableOn) {
      proposed =
        reconcileForBothModes(spec.fg, spec.bg, spec.alsoReadableOn, spec.min) ??
        nudgeUntilReadable(spec.fg, spec.bg, spec.min);
    } else if (spec.preferPlain) {
      proposed = bestForegroundFor(spec.bg);
    } else {
      proposed = nudgeUntilReadable(spec.fg, spec.bg, spec.min);
    }

    const currentValue = spec.correctBackground ? spec.bg : spec.fg;
    if (proposed.toLowerCase() === currentValue.toLowerCase()) continue;

    const after = spec.correctBackground
      ? contrastRatio(spec.fg, proposed)
      : contrastRatio(proposed, spec.bg);
    if (after <= before) continue;

    // If the same field is proposed twice for the same scope, keep the stricter
    // proposal and merge the failing modes so the UI can report "day + dark".
    const existing = fixes.find((f) => f.field === spec.field && f.scope === scope);
    if (existing) {
      if (!existing.modes.includes(spec.mode)) existing.modes.push(spec.mode);
      if (after > existing.ratioAfter) {
        existing.proposed = proposed;
        existing.ratioAfter = after;
        existing.surface = spec.surface;
      }
      if (!existing.reason.includes(spec.reason)) existing.reason = `${existing.reason} ${spec.reason}`;
      continue;
    }

    fixes.push({
      id: spec.id,
      field: spec.field,
      label: spec.label,
      surface: spec.surface,
      current: currentValue,
      proposed,
      reason: spec.reason,
      ratioBefore: before,
      ratioAfter: after,
      severity: before < spec.min * 0.7 ? "fail" : "warn",
      modes: [spec.mode],
      scope,
    });
  }


  return fixes;
}

/** Apply selected fixes and return the corrected palette patch. */
export function applyBrandFixes(fixes: BrandFix[], selectedIds: string[]): Partial<BrandPalette> {
  const patch: Partial<BrandPalette> = {};
  fixes
    .filter((f) => selectedIds.includes(f.id))
    .forEach((f) => {
      patch[f.field] = f.proposed;
    });
  return patch;
}

/** Human-readable readability score across all checks (0-100). */
export function readabilityScore(palette: BrandPalette): number {
  const fixes = proposeBrandFixes(palette);
  if (fixes.length === 0) return 100;
  const penalty = fixes.reduce((sum, f) => sum + (f.severity === "fail" ? 22 : 12), 0);
  return Math.max(10, 100 - penalty);
}

/** Score restricted to a single presentation mode. */
export function readabilityScoreForMode(palette: BrandPalette, mode: BrandMode): number {
  const fixes = proposeBrandFixes(palette).filter((f) => f.modes.includes(mode));
  if (fixes.length === 0) return 100;
  const penalty = fixes.reduce((sum, f) => sum + (f.severity === "fail" ? 22 : 12), 0);
  return Math.max(10, 100 - penalty);
}
