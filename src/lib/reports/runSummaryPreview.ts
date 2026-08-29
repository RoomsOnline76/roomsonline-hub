/**
 * The at-a-glance summary shown when a reviewer hovers a report on the
 * dashboard.
 *
 * Preference order matches what the owner actually reads first:
 *   1. Page 2 — "TOBI Assessment", when the run carries one.
 *   2. The run's Revenue Commentary narrative (reviewer wording wins).
 *   3. Nothing yet — the caller offers a link into the TOBI stage.
 */

import { page2HasContent, parsePage2, type Page2Document } from "@/lib/reports/page2";

export type RunSummaryKind = "assessment" | "commentary" | "empty";

export interface RunSummaryPreview {
  kind: RunSummaryKind;
  /** Assessment headline, when there is one. */
  headline: string | null;
  /** Primer or commentary excerpt. */
  body: string | null;
  highlights: string[];
  warnings: string[];
  redFlags: string[];
}

export const EMPTY_SUMMARY: RunSummaryPreview = {
  kind: "empty",
  headline: null,
  body: null,
  highlights: [],
  warnings: [],
  redFlags: [],
};

/** Trims prose to a readable popover excerpt without cutting mid-word. */
export function excerpt(value: string | null | undefined, max = 420): string {
  const text = (value ?? "").replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  const stop = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return `${cut.slice(0, stop > max * 0.5 ? stop : max).trim()}…`;
}

interface SummarySource {
  /** Raw `report_insights.page2` jsonb. */
  page2: unknown;
  narrativeFinal: string | null;
  narrative: string | null;
}

const BULLETS = 3;

export function buildRunSummary(source: SummarySource): RunSummaryPreview {
  const assessment: Page2Document = parsePage2(source.page2);
  if (page2HasContent(assessment)) {
    return {
      kind: "assessment",
      headline: assessment.headline || null,
      body: excerpt(assessment.primer, 300) || null,
      highlights: assessment.highlights.slice(0, BULLETS),
      warnings: assessment.warnings.slice(0, BULLETS),
      redFlags: assessment.redFlags.slice(0, BULLETS),
    };
  }

  const commentary = excerpt(source.narrativeFinal || source.narrative);
  if (commentary) {
    return { ...EMPTY_SUMMARY, kind: "commentary", body: commentary };
  }

  return { ...EMPTY_SUMMARY };
}
