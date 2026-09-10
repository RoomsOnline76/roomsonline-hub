/**
 * Drafts the CheetaPlains owner pack's written pages from the run's own grid.
 *
 * Two pages are drafted: the business-on-the-books analysis and the
 * distribution / reservations update. Both are handed to the reviewer as
 * editable blocks — the wording is a first draft, never a final word — and last
 * month's pages are offered to the model as the house voice to follow.
 *
 * Only figures taken from the grid are given to the model, and the prompt forbids
 * inventing any number. If the call fails, last month's pages are carried
 * forward unchanged rather than printing a blank page.
 */

import { callLovableAi } from "../aiModels.ts";
import type { OwnerNarrative, OwnerNarrativeBlock } from "../priorOwnerReport.ts";
import type { RevenueGridRow } from "./specialReportHtml.ts";

const zar = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? "n/a"
    : `R${Math.round(value).toLocaleString("en-ZA")}`;

const percent = (value: number | null): string =>
  value === null || !Number.isFinite(value)
    ? "n/a"
    : `${Math.round((Math.abs(value) <= 1 ? value * 100 : value))}%`;

/** A compact, unambiguous digest of the grid for the model to write from. */
export function gridDigest(rows: RevenueGridRow[], fiscalLabel: string): string {
  const lines = rows.map((row) =>
    [
      row.label,
      `confirmed ${zar(row.confirmedBob)}`,
      `budget ${zar(row.budget)}`,
      `active enquiries ${zar(row.activeEnquiries)}`,
      `variance to budget ${zar(row.varianceToBudget)}`,
      `STLY ${zar(row.bobStly)}`,
      `variance to STLY ${zar(row.varianceToStly)}`,
      `confirmed + enquiries ${zar(row.combined)}`,
      `occupancy ${percent(row.occupancyBob)}`,
    ].join(" · "),
  );
  return `Financial year ${fiscalLabel}\n${lines.join("\n")}`;
}

const asBlocks = (value: unknown): OwnerNarrativeBlock[] => {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const heading = typeof record.heading === "string" && record.heading.trim()
        ? record.heading.trim()
        : null;
      const lines = Array.isArray(record.lines)
        ? record.lines.map((line) => String(line ?? "").trim()).filter(Boolean)
        : [];
      return { heading, lines };
    })
    .filter((block) => block.heading || block.lines.length);
};

const houseVoice = (narratives: OwnerNarrative[], match: RegExp): string => {
  const page = narratives.find((narrative) => match.test(narrative.title.toUpperCase()));
  if (!page) return "";
  return page.blocks
    .map((block) => [block.heading ?? "", ...block.lines].filter(Boolean).join("\n"))
    .join("\n\n")
    .slice(0, 4000);
};

export interface DraftedNarratives {
  narratives: OwnerNarrative[];
  warnings: string[];
  /** True when the model produced the wording; false when pages were carried. */
  drafted: boolean;
}

/**
 * Drafts both written pages. `carried` supplies the house voice and the fallback
 * when the model is unavailable.
 */
export async function draftPackNarratives(options: {
  fiscalLabel: string;
  forwardLabel: string | null;
  currentRows: RevenueGridRow[];
  forwardRows: RevenueGridRow[];
  carried: OwnerNarrative[];
  propertyName: string;
  asOfDate: string;
}): Promise<DraftedNarratives> {
  const warnings: string[] = [];
  const bobVoice = houseVoice(options.carried, /BUSINESS ON THE BOOKS/);
  const distributionVoice = houseVoice(options.carried, /DISTRIBUTION|RESERVATION/);

  const prompt = [
    `Property: ${options.propertyName}. Figures as at ${options.asOfDate}.`,
    gridDigest(options.currentRows, options.fiscalLabel),
    options.forwardRows.length && options.forwardLabel
      ? gridDigest(options.forwardRows, options.forwardLabel)
      : "",
    bobVoice ? `Previous month's business-on-the-books page, for voice only:\n${bobVoice}` : "",
    distributionVoice
      ? `Previous month's distribution and reservations page, for voice only:\n${distributionVoice}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const result = await callLovableAi({
    task: "revenue_report_insights",
    temperature: 0.5,
    maxTokens: 2200,
    responseFormat: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: [
          "You write the commentary pages of a luxury safari lodge's monthly owner's report.",
          "Voice: measured, factual, South African business English. No marketing adjectives, no emojis, no bullet symbols in the text itself.",
          "Use ONLY the figures supplied. Never invent a number, a partner name, a month or a percentage. Round money to the nearest hundred thousand when speaking in millions (e.g. R18.1m).",
          "Terminology: BOB (business on the books) is confirmed revenue; active enquiries are provisional bookings; STLY is same time last year.",
          "Quarters run Q1 Mar–May, Q2 Jun–Aug, Q3 Sep–Nov, Q4 Dec–Feb.",
          'Reply as JSON: {"bob":{"subtitle":string,"blocks":[{"heading":string|null,"lines":[string]}]},"distribution":{"subtitle":string,"blocks":[{"heading":string|null,"lines":[string]}]}}',
          "The bob page opens with a year-to-date summary block, then one block per quarter that has figures, then a 'Key Takeaways' block.",
          "The distribution page covers reservations performance, booking trends and the conversion of active enquiries, drawing only on the supplied figures.",
        ].join("\n"),
      },
      { role: "user", content: prompt },
    ],
  });

  if (!result.ok || !result.content) {
    warnings.push(
      `Commentary could not be drafted (${result.error ?? result.code ?? "unavailable"}); last month's wording was carried forward`,
    );
    return { narratives: options.carried, warnings, drafted: false };
  }

  let parsed: Record<string, any>;
  try {
    parsed = JSON.parse(result.content);
  } catch {
    warnings.push("Commentary draft was not readable; last month's wording was carried forward");
    return { narratives: options.carried, warnings, drafted: false };
  }

  const fiscalYearName = `FY${Number(options.fiscalLabel.slice(0, 4)) + 1}`;
  const narratives: OwnerNarrative[] = [];

  const bobBlocks = asBlocks(parsed?.bob?.blocks);
  if (bobBlocks.length) {
    narratives.push({
      page: 1,
      title: `BUSINESS ON THE BOOKS ANALYSIS – ${fiscalYearName}`,
      subtitle:
        typeof parsed?.bob?.subtitle === "string" && parsed.bob.subtitle.trim()
          ? parsed.bob.subtitle.trim()
          : "YEAR-TO-DATE REVENUE SUMMARY",
      blocks: bobBlocks,
    });
  }

  const distributionBlocks = asBlocks(parsed?.distribution?.blocks);
  if (distributionBlocks.length) {
    narratives.push({
      page: 5,
      title: "DISTRIBUTION, RESERVATIONS AND REVENUE UPDATE",
      subtitle:
        typeof parsed?.distribution?.subtitle === "string" && parsed.distribution.subtitle.trim()
          ? parsed.distribution.subtitle.trim()
          : null,
      blocks: distributionBlocks,
    });
  }

  if (!narratives.length) {
    warnings.push("Commentary draft came back empty; last month's wording was carried forward");
    return { narratives: options.carried, warnings, drafted: false };
  }

  // Any other commentary page from last month's pack still prints after these.
  for (const carried of options.carried) {
    const upper = carried.title.toUpperCase();
    if (/BUSINESS ON THE BOOKS/.test(upper) || /DISTRIBUTION|RESERVATION/.test(upper)) continue;
    narratives.push(carried);
  }

  return { narratives, warnings, drafted: true };
}
