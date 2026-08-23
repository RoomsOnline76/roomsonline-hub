/**
 * Assembles the CheetaPlains owner pack from a parsed owner's-report PDF.
 *
 * The signed-off pack prints, in order: the business-on-the-books commentary,
 * the current financial-year revenue grid and its chart, the distribution and
 * reservations update, the forward-year grid and chart, the declined-bookings
 * table, the travel-partner table, the multi-year partner trends and the
 * nationality mix.
 *
 * Every figure here is either read from the uploaded pack or rolled up from it —
 * nothing is invented. A slide whose source data is missing is simply not
 * produced, and the caller reports which pages were skipped.
 */

import type {
  OwnerFiscalYearGrid,
  OwnerNarrative,
  OwnerReportExtract,
} from "../priorOwnerReport.ts";
import {
  buildBobChartSlide,
  buildDeclinedSlide,
  buildNarrativeSlide,
  buildNationalitySlide,
  buildPartnersSlide,
  buildPartnerTrendSlide,
  buildRevenueGridSlide,
  type RevenueGridRow,
  type SpecialReportContext,
} from "./specialReportHtml.ts";

export interface OwnerPackSlide {
  key: string;
  title: string;
  html: string;
  rowCount: number;
  payload: Record<string, unknown>;
  warnings: string[];
}

const MONTH_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/** `2026-08` → `Aug-26`, as the packs print it. */
const monthLabel = (key: string): string => {
  const index = Number(key.slice(5, 7)) - 1;
  return `${MONTH_SHORT[index] ?? key} -${key.slice(2, 4)}`.replace(" -", "-");
};

/** Fiscal quarters: Q1 Mar–May, Q2 Jun–Aug, Q3 Sep–Nov, Q4 Dec–Feb. */
const QUARTERS: Array<{ label: string; months: number[] }> = [
  { label: "Q1", months: [3, 4, 5] },
  { label: "Q2", months: [6, 7, 8] },
  { label: "Q3", months: [9, 10, 11] },
  { label: "Q4", months: [12, 1, 2] },
];

const FISCAL_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2];

const MONEY_COLUMNS = [
  "confirmedBob",
  "budget",
  "activeEnquiries",
  "varianceToBudget",
  "bobStly",
  "lastYearActual",
  "varianceToStly",
  "combined",
] as const;

const OCCUPANCY_COLUMNS = ["occupancyBob", "occupancyStly", "occupancyLastYear"] as const;

const monthsInFiscalOrder = (grid: OwnerFiscalYearGrid): string[] =>
  [...grid.months].sort(
    (a, b) =>
      FISCAL_ORDER.indexOf(Number(a.slice(5, 7))) - FISCAL_ORDER.indexOf(Number(b.slice(5, 7))),
  );

const sum = (grid: OwnerFiscalYearGrid, column: (typeof MONEY_COLUMNS)[number], keys: string[]) => {
  const values = keys.map((key) => grid[column][key]).filter((value) => Number.isFinite(value));
  return values.length ? values.reduce((total, value) => total + value, 0) : null;
};

const mean = (
  grid: OwnerFiscalYearGrid,
  column: (typeof OCCUPANCY_COLUMNS)[number],
  keys: string[],
) => {
  const values = keys.map((key) => grid[column][key]).filter((value) => Number.isFinite(value));
  return values.length ? values.reduce((total, value) => total + value, 0) / values.length : null;
};

const rowFor = (
  grid: OwnerFiscalYearGrid,
  label: string,
  kind: RevenueGridRow["kind"],
  keys: string[],
): RevenueGridRow => ({
  label,
  kind,
  confirmedBob: kind === "month" ? (grid.confirmedBob[keys[0]] ?? null) : sum(grid, "confirmedBob", keys),
  budget: kind === "month" ? (grid.budget[keys[0]] ?? null) : sum(grid, "budget", keys),
  activeEnquiries:
    kind === "month" ? (grid.activeEnquiries[keys[0]] ?? null) : sum(grid, "activeEnquiries", keys),
  varianceToBudget:
    kind === "month" ? (grid.varianceToBudget[keys[0]] ?? null) : sum(grid, "varianceToBudget", keys),
  bobStly: kind === "month" ? (grid.bobStly[keys[0]] ?? null) : sum(grid, "bobStly", keys),
  lastYearActual:
    kind === "month" ? (grid.lastYearActual[keys[0]] ?? null) : sum(grid, "lastYearActual", keys),
  varianceToStly:
    kind === "month" ? (grid.varianceToStly[keys[0]] ?? null) : sum(grid, "varianceToStly", keys),
  combined: kind === "month" ? (grid.combined[keys[0]] ?? null) : sum(grid, "combined", keys),
  occupancyBob:
    kind === "month" ? (grid.occupancyBob[keys[0]] ?? null) : mean(grid, "occupancyBob", keys),
  occupancyStly:
    kind === "month" ? (grid.occupancyStly[keys[0]] ?? null) : mean(grid, "occupancyStly", keys),
  occupancyLastYear:
    kind === "month"
      ? (grid.occupancyLastYear[keys[0]] ?? null)
      : mean(grid, "occupancyLastYear", keys),
});

/** Month rows in fiscal order with Q1–Q4 roll-ups and a Total row. */
export function revenueGridRows(grid: OwnerFiscalYearGrid): RevenueGridRow[] {
  const months = monthsInFiscalOrder(grid);
  const rows: RevenueGridRow[] = [];

  for (const quarter of QUARTERS) {
    const keys = months.filter((key) => quarter.months.includes(Number(key.slice(5, 7))));
    if (!keys.length) continue;
    for (const key of keys) rows.push(rowFor(grid, monthLabel(key), "month", [key]));
    rows.push(rowFor(grid, quarter.label, "quarter", keys));
  }
  if (months.length) rows.push(rowFor(grid, "Total", "total", months));
  return rows;
}

/** `bob_analysis` / `distribution_update` / `narrative_p5`. */
function narrativeKey(narrative: OwnerNarrative): { key: string; title: string } {
  const upper = narrative.title.toUpperCase();
  if (upper.includes("BUSINESS ON THE BOOKS")) {
    return { key: "bob_analysis", title: "Business on the books analysis" };
  }
  if (upper.includes("DISTRIBUTION") || upper.includes("RESERVATION")) {
    return { key: "distribution_update", title: "Distribution, reservations and revenue update" };
  }
  return { key: `narrative_p${narrative.page}`, title: narrative.title };
}

function trendKey(index: number, title: string): { key: string; title: string } {
  const upper = title.toUpperCase();
  if (upper.includes("OUTBOUND")) {
    return { key: "partner_trend_outbound", title: "Top producing partners — international outbound" };
  }
  if (upper.includes("INBOUND")) {
    return { key: "partner_trend_inbound", title: "Top producing partners — inbound" };
  }
  return { key: `partner_trend_${index + 1}`, title: title || "Top producing partners trend" };
}

const gridSlides = (
  context: SpecialReportContext,
  grid: OwnerFiscalYearGrid,
  scope: "current" | "forward",
): OwnerPackSlide[] => {
  const rows = revenueGridRows(grid);
  const total = rows.find((row) => row.kind === "total") ?? null;
  const combinedTotal =
    total?.combined ??
    (total && total.confirmedBob !== null
      ? total.confirmedBob + (total.activeEnquiries ?? 0)
      : null);
  const variance =
    combinedTotal !== null && total?.budget !== null && total?.budget !== undefined
      ? combinedTotal - total.budget
      : null;

  const months = monthsInFiscalOrder(grid);
  const primaryColour = grid.label ? undefined : undefined;

  const slides: OwnerPackSlide[] = [
    {
      key: `revenue_grid_${scope}`,
      title: `Revenue report ${grid.label}`,
      html: buildRevenueGridSlide({
        ...context,
        fiscalLabel: grid.label,
        rows,
        combinedTotal,
        varianceCombinedToBudget: variance,
      }),
      rowCount: rows.length,
      payload: { fiscal_label: grid.label, months, scope, combined_total: combinedTotal },
      warnings: [],
    },
  ];

  const chartValues = (column: "confirmedBob" | "budget" | "lastYearActual") =>
    months.map((key) => (Number.isFinite(grid[column][key]) ? grid[column][key] : null));

  if (months.length) {
    slides.push({
      key: `bob_chart_${scope}`,
      title: `${grid.label} BOB, budget & LY actual`,
      html: buildBobChartSlide({
        ...context,
        chartTitle: `${grid.label} BOB, Budget & LY Actual`,
        categories: months.map(monthLabel),
        series: [
          { label: "BOB", color: "#B4572F", values: chartValues("confirmedBob") },
          { label: "Budget", color: "#111111", values: chartValues("budget") },
          { label: "LY actual", color: "#E9BFAE", values: chartValues("lastYearActual") },
        ],
      }),
      rowCount: months.length,
      payload: { fiscal_label: grid.label, scope, chart: "bob_budget_ly" },
      warnings: primaryColour ? [] : [],
    });
  }

  return slides;
};

/** The full pack, in printed order, skipping slides with no source data. */
export function buildOwnerPackSlides(
  extract: OwnerReportExtract,
  context: SpecialReportContext,
  labels: { currentLabel: string; priorLabel: string },
): OwnerPackSlide[] {
  const slides: OwnerPackSlide[] = [];

  const narrativeFor = (key: string) =>
    extract.narratives.find((narrative) => narrativeKey(narrative).key === key) ?? null;

  const pushNarrative = (narrative: OwnerNarrative | null, columns: boolean) => {
    if (!narrative) return;
    const { key, title } = narrativeKey(narrative);
    slides.push({
      key,
      title,
      html: buildNarrativeSlide({
        ...context,
        title: narrative.title,
        subtitle: narrative.subtitle,
        blocks: narrative.blocks,
        columns,
      }),
      rowCount: narrative.blocks.length,
      payload: {
        page: narrative.page,
        subtitle: narrative.subtitle,
        blocks: narrative.blocks,
        editable: true,
      },
      warnings: [],
    });
  };

  pushNarrative(narrativeFor("bob_analysis"), false);
  if (extract.currentYear) slides.push(...gridSlides(context, extract.currentYear, "current"));
  pushNarrative(narrativeFor("distribution_update"), true);
  if (extract.forwardYear) slides.push(...gridSlides(context, extract.forwardYear, "forward"));

  // Any remaining commentary pages keep their own order after the grids.
  for (const narrative of extract.narratives) {
    const { key } = narrativeKey(narrative);
    if (key === "bob_analysis" || key === "distribution_update") continue;
    pushNarrative(narrative, false);
  }

  if (extract.declined.length) {
    slides.push({
      key: "declined",
      title: "Declined bookings",
      html: buildDeclinedSlide({
        ...context,
        periodLabel: extract.declinedPeriod,
        rows: extract.declined.map((row) => ({
          monthLabel: row.monthLabel,
          value: row.value,
          agents: row.agents,
          reason: row.reason,
          shareOfMonthRevenue: row.shareOfMonthRevenue,
        })),
        total: extract.declinedTotal,
      }),
      rowCount: extract.declined.length,
      payload: {
        period: extract.declinedPeriod,
        total: extract.declinedTotal,
        rows: extract.declined,
      },
      warnings: [],
    });
  }

  if (extract.partnersCurrent.length) {
    const currentLabel = extract.partnersCurrentLabel ?? labels.currentLabel;
    const priorLabel = extract.partnersPriorLabel ?? labels.priorLabel;
    slides.push({
      key: "partners",
      title: "Top booking travel partners",
      html: buildPartnersSlide({
        ...context,
        currentLabel,
        priorLabel,
        current: extract.partnersCurrent,
        prior: extract.partnersPrior,
      }),
      rowCount: extract.partnersCurrent.length,
      payload: {
        current_label: currentLabel,
        prior_label: priorLabel,
        current: extract.partnersCurrent,
        prior: extract.partnersPrior,
      },
      warnings: [],
    });
  }

  extract.partnerTrends.forEach((trend, index) => {
    const { key, title } = trendKey(index, trend.title);
    slides.push({
      key,
      title,
      html: buildPartnerTrendSlide({
        ...context,
        title,
        columns: trend.columns,
        rows: trend.rows,
      }),
      rowCount: trend.rows.length,
      payload: { page: trend.page, columns: trend.columns, rows: trend.rows },
      warnings: [],
    });
  });

  if (extract.nationality.length) {
    const currentLabel = extract.nationalityCurrentLabel ?? labels.currentLabel;
    const priorLabel = extract.nationalityPriorLabel ?? labels.priorLabel;
    slides.push({
      key: "nationality",
      title: "Bookings by nationality",
      html: buildNationalitySlide({
        ...context,
        currentLabel,
        priorLabel,
        rows: extract.nationality,
        hasPrior: extract.nationality.some((row) => row.priorNights || row.priorRevenue),
      }),
      rowCount: extract.nationality.length,
      payload: {
        current_label: currentLabel,
        prior_label: priorLabel,
        rows: extract.nationality,
      },
      warnings: [],
    });
  }

  return slides;
}

/** Pack order used by the review UI so slides list as they print. */
export const OWNER_PACK_ORDER = [
  "bob_analysis",
  "revenue_grid_current",
  "bob_chart_current",
  "distribution_update",
  "revenue_grid_forward",
  "bob_chart_forward",
  "declined",
  "partners",
  "partner_trend_inbound",
  "partner_trend_outbound",
  "nationality",
];
