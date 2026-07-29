/**
 * Brand readability auto-correct.
 *
 * Inspects a property/portfolio brand palette against the surfaces that actually
 * appear in the booking flow, and proposes hue-preserving corrections the user
 * can review and accept.
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
}

export const AA_TEXT = 4.5;
export const AA_LARGE = 3;

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

interface CheckSpec {
  id: string;
  field: BrandField;
  label: string;
  surface: string;
  fg: string;
  bg: string;
  min: number;
  reason: string;
  /** When true, propose a plain white/near-black foreground rather than a nudge */
  preferPlain?: boolean;
}

/**
 * Build the list of readability problems + proposed corrections.
 * Only fields that exist in the palette are proposed for change.
 */
export function proposeBrandFixes(palette: BrandPalette): BrandFix[] {
  const primary = isHex(palette.brand_primary_color) ? palette.brand_primary_color!.trim() : null;
  const secondary = isHex(palette.brand_secondary_color) ? palette.brand_secondary_color!.trim() : null;
  const darkBg = isHex(palette.brand_dark_bg_color) ? palette.brand_dark_bg_color!.trim() : null;
  const lightBg = isHex(palette.brand_light_bg_color) ? palette.brand_light_bg_color!.trim() : "#ffffff";

  const legacyFont = isHex(palette.brand_font_color) ? palette.brand_font_color!.trim() : null;
  const heading = isHex(palette.brand_heading_text_color)
    ? palette.brand_heading_text_color!.trim()
    : legacyFont;
  const body = isHex(palette.brand_body_text_color) ? palette.brand_body_text_color!.trim() : legacyFont;
  const muted = isHex(palette.brand_muted_text_color) ? palette.brand_muted_text_color!.trim() : null;

  const specs: CheckSpec[] = [];

  // Body / heading text on the page + card background
  if (heading) {
    specs.push({
      id: "heading-on-light",
      field: palette.brand_heading_text_color ? "brand_heading_text_color" : "brand_font_color",
      label: "Heading text",
      surface: "Page & card background",
      fg: heading,
      bg: lightBg,
      min: AA_LARGE,
      reason: "Headings must stay legible on the page and card background.",
    });
  }
  if (body) {
    specs.push({
      id: "body-on-light",
      field: palette.brand_body_text_color ? "brand_body_text_color" : "brand_font_color",
      label: "Body text",
      surface: "Page & card background",
      fg: body,
      bg: lightBg,
      min: AA_TEXT,
      reason: "Body copy needs AA contrast (4.5:1) on the page background.",
    });
  }
  if (muted) {
    specs.push({
      id: "muted-on-light",
      field: "brand_muted_text_color",
      label: "Muted / secondary text",
      surface: "Page & card background",
      fg: muted,
      bg: lightBg,
      min: AA_TEXT,
      reason: "Dates, fine print and helper text use this colour on light surfaces.",
    });
  }

  // Text ON the brand surfaces — the booking header bar and calendar header
  if (primary && body) {
    specs.push({
      id: "body-on-primary",
      field: palette.brand_body_text_color ? "brand_body_text_color" : "brand_font_color",
      label: "Text on the primary brand bar",
      surface: "Booking header & rate calendar header",
      fg: body,
      bg: primary,
      min: AA_TEXT,
      reason:
        "The property header bar and the rate calendar header row are filled with the primary colour — text on them must be near-white or near-black.",
      preferPlain: true,
    });
  }
  if (secondary && body) {
    specs.push({
      id: "body-on-secondary",
      field: palette.brand_body_text_color ? "brand_body_text_color" : "brand_font_color",
      label: "Text on the secondary surface",
      surface: "Panels & badges",
      fg: body,
      bg: secondary,
      min: AA_TEXT,
      reason: "Secondary panels use this fill behind labels and badges.",
      preferPlain: true,
    });
  }
  if (darkBg && body) {
    specs.push({
      id: "body-on-dark",
      field: palette.brand_body_text_color ? "brand_body_text_color" : "brand_font_color",
      label: "Text on the dark accent band",
      surface: "Footer & accent band",
      fg: body,
      bg: darkBg,
      min: AA_TEXT,
      reason: "The footer and accent bands use the dark background colour.",
      preferPlain: true,
    });
  }

  // Primary colour used as text (prices, links, promo labels)
  if (primary) {
    specs.push({
      id: "primary-as-text",
      field: "brand_primary_color",
      label: "Primary colour used as text",
      surface: "Prices, links & promo labels",
      fg: primary,
      bg: lightBg,
      min: AA_LARGE,
      reason: "Prices and links render in the primary colour on the light background.",
    });
  }

  const fixes: BrandFix[] = [];
  const seen = new Set<string>();

  for (const spec of specs) {
    const before = contrastRatio(spec.fg, spec.bg);
    if (before >= spec.min) continue;

    const proposed = spec.preferPlain
      ? bestForegroundFor(spec.bg)
      : nudgeUntilReadable(spec.fg, spec.bg, spec.min);

    if (proposed.toLowerCase() === spec.fg.toLowerCase()) continue;

    const after = contrastRatio(proposed, spec.bg);
    if (after <= before) continue;

    // If the same field is proposed twice, keep the stricter (higher-ratio) proposal.
    const key = `${spec.field}`;
    if (seen.has(key)) {
      const existing = fixes.find((f) => f.field === spec.field)!;
      if (after > existing.ratioAfter) {
        existing.proposed = proposed;
        existing.ratioAfter = after;
        existing.reason = `${existing.reason} ${spec.reason}`;
      }
      continue;
    }
    seen.add(key);

    fixes.push({
      id: spec.id,
      field: spec.field,
      label: spec.label,
      surface: spec.surface,
      current: spec.fg,
      proposed,
      reason: spec.reason,
      ratioBefore: before,
      ratioAfter: after,
      severity: before < spec.min * 0.7 ? "fail" : "warn",
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
