/**
 * Page 2 — "TOBI Assessment".
 *
 * An opt-in page printed straight after the cover: a headline, a short primer
 * that sets the owner up for what follows, then the highlights, the warnings
 * and the red flags TOBI wants read before any grid.
 *
 * Mirrors supabase/functions/_shared/reportPage2.ts — keep both in step.
 */

export interface Page2Document {
  headline: string;
  primer: string;
  highlights: string[];
  warnings: string[];
  redFlags: string[];
  /** When the assessment was produced, ISO. */
  generatedAt: string | null;
  /** True once the reviewer reworded any part — such text survives a regeneration. */
  edited: boolean;
  /** Why the assessment is missing, when it could not be produced. */
  error: string | null;
}

export const EMPTY_PAGE2: Page2Document = {
  headline: "",
  primer: "",
  highlights: [],
  warnings: [],
  redFlags: [],
  generatedAt: null,
  edited: false,
  error: null,
};

export const PAGE2_PAGE_KEY = "tobi_assessment";
export const PAGE2_PAGE_TITLE = "TOBI Assessment";

/** Caps that keep the page to a single printed sheet. */
export const PAGE2_LIMITS = {
  headline: 160,
  primer: 700,
  bullet: 260,
  bullets: 6,
} as const;

const stringList = (value: unknown, max = PAGE2_LIMITS.bullets): string[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter((entry) => entry.length > 0)
    .slice(0, max);
};

const text = (value: unknown): string => (typeof value === "string" ? value.trim() : "");

/** Reads the stored `report_insights.page2` jsonb into a safe document. */
export function parsePage2(value: unknown): Page2Document {
  if (!value || typeof value !== "object") return { ...EMPTY_PAGE2 };
  const raw = value as Record<string, unknown>;
  return {
    headline: text(raw.headline),
    primer: text(raw.primer),
    highlights: stringList(raw.highlights),
    warnings: stringList(raw.warnings),
    redFlags: stringList(raw.red_flags ?? raw.redFlags),
    generatedAt: text(raw.generated_at ?? raw.generatedAt) || null,
    edited: raw.edited === true,
    error: text(raw.error) || null,
  };
}

/** Wire shape written back to the database (snake_case per the API contract). */
export function serialisePage2(doc: Page2Document): Record<string, unknown> {
  return {
    headline: doc.headline,
    primer: doc.primer,
    highlights: doc.highlights,
    warnings: doc.warnings,
    red_flags: doc.redFlags,
    generated_at: doc.generatedAt,
    edited: doc.edited,
    error: doc.error,
  };
}

/** True when there is something worth printing. */
export function page2HasContent(doc: Page2Document | null | undefined): boolean {
  if (!doc) return false;
  return Boolean(
    doc.headline ||
      doc.primer ||
      doc.highlights.length ||
      doc.warnings.length ||
      doc.redFlags.length,
  );
}
