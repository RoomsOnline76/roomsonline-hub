/**
 * Reads the comparison columns and carried pages the daily exports cannot know:
 * budget, BOB STLY, LY actual, the declined-bookings table, the multi-year
 * partner trends and last month's commentary.
 *
 * Two sources are consulted, newest first:
 *  1. the slides of the property's most recent generated pack
 *     (`report_special_reports.payload`), which hold the printed rows verbatim;
 *  2. the most recent `report_runs.imported_baseline` written by the owner's-report
 *     PDF import, which holds the budget / STLY / last-year maps.
 *
 * Nothing is derived here — a figure that neither source holds simply stays absent.
 */

import type {
  DeclinedBookingRow,
  NationalityRow,
  NumberMap,
  OwnerNarrative,
  PartnerRow,
  PartnerTrendTable,
} from "../priorOwnerReport.ts";
import { type CarriedPack, emptyCarriedPack } from "./packFromRun.ts";

type Admin = {
  from: (table: string) => any;
};

const numberMap = (value: unknown): NumberMap => {
  const out: NumberMap = {};
  if (!value || typeof value !== "object") return out;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const amount = Number(raw);
    if (/^\d{4}-\d{2}$/.test(key) && Number.isFinite(amount)) out[key] = amount;
  }
  return out;
};

const mergeInto = (target: NumberMap, source: NumberMap) => {
  for (const [key, amount] of Object.entries(source)) {
    if (target[key] === undefined) target[key] = amount;
  }
};

/** Rebuilds the grid maps from a stored `revenue_grid_*` slide payload. */
const fromGridSlide = (payload: Record<string, unknown>) => {
  const rows = Array.isArray(payload.rows) ? (payload.rows as Record<string, unknown>[]) : [];
  const budget: NumberMap = {};
  const bobStly: NumberMap = {};
  const lastYearActual: NumberMap = {};
  const occupancyStly: NumberMap = {};
  const occupancyLastYear: NumberMap = {};
  for (const row of rows) {
    const month = typeof row.month === "string" ? row.month : null;
    if (!month || !/^\d{4}-\d{2}$/.test(month)) continue;
    const take = (key: string, target: NumberMap) => {
      const amount = Number(row[key]);
      if (Number.isFinite(amount)) target[month] = amount;
    };
    take("budget", budget);
    take("bobStly", bobStly);
    take("lastYearActual", lastYearActual);
    take("occupancyStly", occupancyStly);
    take("occupancyLastYear", occupancyLastYear);
  }
  return { budget, bobStly, lastYearActual, occupancyStly, occupancyLastYear };
};

export interface CarriedPackResult {
  carried: CarriedPack;
  /** Runs the figures came from, for the run event. */
  sources: string[];
}

/**
 * Collects everything carryable for `propertyId`, ignoring the run being built.
 */
export async function loadCarriedPack(
  admin: Admin,
  propertyId: string,
  currentRunId: string,
): Promise<CarriedPackResult> {
  const carried = emptyCarriedPack();
  const sources: string[] = [];

  const { data: runs } = await admin
    .from("report_runs")
    .select("id, as_of_date, imported_baseline")
    .eq("property_id", propertyId)
    .neq("id", currentRunId)
    .order("as_of_date", { ascending: false })
    .limit(12);

  const runList = (runs ?? []) as Array<{
    id: string;
    as_of_date: string | null;
    imported_baseline: Record<string, unknown> | null;
  }>;

  /* 1 — slides of earlier packs, newest run first. */
  for (const run of runList) {
    const { data: slides } = await admin
      .from("report_special_reports")
      .select("report_key, payload")
      .eq("run_id", run.id);
    const rows = (slides ?? []) as Array<{ report_key: string; payload: Record<string, unknown> }>;
    if (!rows.length) continue;
    let used = false;

    for (const slide of rows) {
      const payload = (slide.payload ?? {}) as Record<string, unknown>;

      if (slide.report_key === "revenue_grid_current" || slide.report_key === "revenue_grid_forward") {
        const target =
          slide.report_key === "revenue_grid_current" ? carried.current : carried.forward;
        const figures = fromGridSlide(payload);
        mergeInto(target.budget, figures.budget);
        mergeInto(target.bobStly, figures.bobStly);
        mergeInto(target.lastYearActual, figures.lastYearActual);
        mergeInto(target.occupancyStly, figures.occupancyStly);
        mergeInto(target.occupancyLastYear, figures.occupancyLastYear);
        used = used || Object.keys(figures.budget).length > 0;
        continue;
      }

      if (slide.report_key === "declined" && !carried.declined.length) {
        const declined = Array.isArray(payload.rows) ? (payload.rows as DeclinedBookingRow[]) : [];
        if (declined.length) {
          carried.declined = declined;
          carried.declinedTotal = Number.isFinite(Number(payload.total))
            ? Number(payload.total)
            : null;
          carried.declinedPeriod = typeof payload.period === "string" ? payload.period : null;
          used = true;
        }
        continue;
      }

      if (slide.report_key.startsWith("partner_trend") && !carried.partnerTrends.length) {
        const trendRows = Array.isArray(payload.rows)
          ? (payload.rows as PartnerTrendTable["rows"])
          : [];
        const columns = Array.isArray(payload.columns) ? (payload.columns as string[]) : [];
        if (trendRows.length && columns.length) {
          carried.partnerTrends.push({
            page: Number(payload.page) || carried.partnerTrends.length + 1,
            title: slide.report_key.includes("outbound")
              ? "TOP PRODUCING INTERNATIONAL OUTBOUND AGENTS"
              : "TOP PRODUCING TRAVEL INBOUND PARTNERS",
            columns,
            rows: trendRows,
          });
          used = true;
        }
        continue;
      }

      if (slide.report_key === "nationality" && !carried.nationality.length) {
        const nationality = Array.isArray(payload.rows) ? (payload.rows as NationalityRow[]) : [];
        if (nationality.length) {
          carried.nationality = nationality;
          carried.nationalityCurrentLabel =
            typeof payload.current_label === "string" ? payload.current_label : null;
          carried.nationalityPriorLabel =
            typeof payload.prior_label === "string" ? payload.prior_label : null;
          used = true;
        }
        continue;
      }

      if (slide.report_key === "partners" && !carried.partnersCurrent.length) {
        const current = Array.isArray(payload.current) ? (payload.current as PartnerRow[]) : [];
        const prior = Array.isArray(payload.prior) ? (payload.prior as PartnerRow[]) : [];
        if (current.length) {
          carried.partnersCurrent = current;
          carried.partnersPrior = prior;
          carried.partnersCurrentLabel =
            typeof payload.current_label === "string" ? payload.current_label : null;
          carried.partnersPriorLabel =
            typeof payload.prior_label === "string" ? payload.prior_label : null;
          used = true;
        }
        continue;
      }

      if (
        (slide.report_key === "bob_analysis" || slide.report_key === "distribution_update") &&
        Array.isArray(payload.blocks)
      ) {
        const title =
          slide.report_key === "bob_analysis"
            ? "BUSINESS ON THE BOOKS ANALYSIS"
            : "DISTRIBUTION, RESERVATIONS AND REVENUE UPDATE";
        if (!carried.narratives.some((narrative) => narrative.title.startsWith(title.slice(0, 20)))) {
          carried.narratives.push({
            page: Number(payload.page) || carried.narratives.length + 1,
            title,
            subtitle: typeof payload.subtitle === "string" ? payload.subtitle : null,
            blocks: payload.blocks as OwnerNarrative["blocks"],
          });
          used = true;
        }
      }
    }

    if (used) sources.push(`pack of ${run.as_of_date ?? run.id}`);
  }

  /* 2 — figures imported from the owner's-report PDF. */
  for (const run of runList) {
    const baseline = run.imported_baseline;
    if (!baseline) continue;
    const budget = numberMap((baseline.budget as Record<string, unknown> | null)?.revenue);
    const stly = numberMap((baseline.stly as Record<string, unknown> | null)?.revenue);
    const lastYear = numberMap(baseline.last_year_actual);
    const stlyOccupancy = numberMap(baseline.previous_occupancy);
    const lastYearOccupancy = numberMap(baseline.last_year_occupancy);
    if (
      !Object.keys(budget).length &&
      !Object.keys(stly).length &&
      !Object.keys(lastYear).length
    ) {
      continue;
    }
    mergeInto(carried.current.budget, budget);
    mergeInto(carried.current.bobStly, stly);
    mergeInto(carried.current.lastYearActual, lastYear);
    mergeInto(carried.current.occupancyStly, stlyOccupancy);
    mergeInto(carried.current.occupancyLastYear, lastYearOccupancy);

    const forward = baseline.forward_year as Record<string, unknown> | null;
    if (forward) {
      mergeInto(carried.forward.budget, numberMap(forward.budget));
      mergeInto(carried.forward.bobStly, numberMap(forward.bob_stly));
      mergeInto(carried.forward.lastYearActual, numberMap(forward.last_year_actual));
    }
    sources.push(`imported baseline of ${run.as_of_date ?? run.id}`);
  }

  return { carried, sources };
}
