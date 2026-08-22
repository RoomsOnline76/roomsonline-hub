// Canonical page catalogue for the draft revenue report. Mirrors
// supabase/functions/_shared/reportPages.ts — keep both in step.

import { MEDIA_SECTIONS, mediaSectionsForSource } from "./reportMediaSlots";

export interface ReportPageDefinition {
  key: string;
  title: string;
  /** What the page carries — shown in the organizer so it is clear what moves. */
  summary: string;
}

/** Data pages the builder emits, in their default sequence. */
export const REPORT_DATA_PAGES: readonly ReportPageDefinition[] = [
  { key: "revenue_performance", title: "Revenue Performance", summary: "Revenue grid + KPIs" },
  { key: "nights_occupancy", title: "Room Nights & Occupancy", summary: "Nights and occupancy grids" },
  { key: "rate_comparison", title: "Rate & Comparison Review", summary: "ADR grid + comparison review" },
  { key: "revenue_review", title: "Revenue Review", summary: "Revenue / occupancy / ADR charts" },
  { key: "pickup_rate_trend", title: "Pickup & Rate Trend", summary: "Pickup variance + ADR trend" },
  { key: "traveller_trends", title: "Traveller Trends", summary: "Source mix, source table, occupancy strip" },
] as const;

/** Notes page always sits at the end unless the organizer moves it. */
export const REPORT_NOTES_PAGE: ReportPageDefinition = {
  key: "process_notes",
  title: "Process Notes",
  summary: "Legend, commentary and prepared-by block",
};

export const mediaPageKey = (section: string): string => `media:${section}`;

/** Default order: data pages, built-in media sections, then the notes page. */
export const DEFAULT_PAGE_ORDER: string[] = [
  ...REPORT_DATA_PAGES.map((page) => page.key),
  ...MEDIA_SECTIONS.map(mediaPageKey),
  REPORT_NOTES_PAGE.key,
];

export const mediaImagePageKey = (imageId: string): string => `media:img:${imageId}`;

/**
 * Legacy saved orders reference a whole media section (e.g. `media:Additional
 * Slides`). Swap such a key for the per-image slide keys at the same position so
 * runs saved before per-slide ordering keep their sequence.
 */
export function expandLegacyMediaKeys(
  saved: string[] | null | undefined,
  expansions: Record<string, string[]>,
): string[] {
  if (!saved || saved.length === 0) return [];
  const out: string[] = [];
  for (const key of saved) {
    const replacement = expansions[key];
    if (replacement) out.push(...replacement.filter((entry) => !out.includes(entry)));
    else if (!out.includes(key)) out.push(key);
  }
  return out;
}

/**
 * Applies a saved order to a list of page keys: known keys first in saved
 * order, then anything new appended so a fresh section never disappears.
 */
export function orderPageKeys(available: string[], saved: string[] | null | undefined): string[] {
  if (!saved || saved.length === 0) return available;
  const set = new Set(available);
  const ordered = saved.filter((key) => set.has(key));
  const rest = available.filter((key) => !ordered.includes(key));
  return [...ordered, ...rest];
}
