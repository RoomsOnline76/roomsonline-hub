/**
 * Reads a property's existing consolidated revenue report — a spreadsheet pack
 * or a designed owner's-report PDF, uploaded on the run as a `prior_report`
 * file — and, on confirmation, folds its numbers into a first run:
 * previous-OTB, last-year actuals, the reviewer's manual inputs and the
 * property's historical baseline.
 *
 * Preview first, write second: the caller inspects what was found, ticks what to
 * apply, and only then is anything stored. Existing values are never overwritten
 * unless `replace_existing` is set.
 *
 * Owner-report PDFs (CheetaPlains-style) additionally carry the pack's own
 * commentary, revenue grids, declined bookings, travel-partner, partner-trend
 * and nationality pages — those are written as special-report slides on the run.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { parsePriorReportWorkbook, type PriorReportExtract } from "../_shared/priorReportWorkbook.ts";
import {
  parsePriorOwnerReport,
  type OwnerReportExtract,
} from "../_shared/priorOwnerReport.ts";
import { repairWorkbookBuffer } from "../_shared/xlsxRepair.ts";
import { logRunEvent } from "../_shared/reportRunEvents.ts";
import { windowMonths } from "../_shared/reportWindow.ts";
import { buildOwnerPackSlides } from "../_shared/cheetaplains/ownerPack.ts";
import {
  type SpecialReportBranding,
  type SpecialReportContext,
} from "../_shared/cheetaplains/specialReportHtml.ts";


const BUCKET = "revenue-reports";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type NumberMap = Record<string, number>;

interface Selections {
  previous_otb?: boolean;
  last_year?: boolean;
  additional_inputs?: boolean;
  historical?: boolean;
  /** Owner-report PDFs only. */
  owner_tables?: boolean;
}

/** Merge `incoming` into `base`; existing keys win unless replacing. */
const mergeMap = (base: NumberMap, incoming: NumberMap, replace: boolean): NumberMap => {
  const out: NumberMap = { ...base };
  for (const [key, value] of Object.entries(incoming)) {
    if (!Number.isFinite(value)) continue;
    if (replace || out[key] === undefined) out[key] = value;
  }
  return out;
};

const count = (map: NumberMap): number => Object.keys(map).length;

/**
 * Owner's-report PDF → the same extract shape the spreadsheet reader produces.
 *
 * The pack has no previous-month OTB snapshot; its comparison column is
 * "BOB STLY" (same time last year), so that is what fills previous-OTB — the
 * substitution is stated in the warnings so nobody reads it as last month.
 * Room nights are not printed anywhere in the pack, so those maps stay empty
 * (rather than borrowing occupancy, which would wreck derived ADR).
 */
const ownerToExtract = (owner: OwnerReportExtract): PriorReportExtract => {
  const current = owner.currentYear;
  const warnings = [...owner.warnings];
  if (current) {
    warnings.push(
      'This pack compares against "BOB STLY" (same time last year), so the previous-OTB column holds STLY figures, not a previous-month snapshot.',
    );
    warnings.push("Owner's-report packs do not print room nights, so nights are left blank.");
  }
  return {
    asOfDate: owner.asOfDate,
    otbColumnLabel: owner.otbColumnLabel,
    baselineSheet: owner.baselineSheet,
    months: owner.months,
    previousOtbRevenue: current?.bobStly ?? {},
    previousRoomNights: {},
    lastYearActual: current?.lastYearActual ?? {},
    lastYearRoomNights: {},
    dinnerByMonth: {},
    room0ByMonth: {},
    compRnsByMonth: {},
    previousOccupancy: current?.occupancyStly ?? {},
    lastYearOccupancy: current?.occupancyLastYear ?? {},
    previousAdr: {},
    lastYearAdr: {},
    currentOtbRevenue: current?.confirmedBob ?? {},
    targets: current?.budget ?? {},
    targetUplift: null,
    historicalRevenue: {},
    historicalRoomNights: {},
    historicalOccupancy: {},
    historicalAdr: {},
    carryForward: {},
    sheetsRead: owner.pagesRead,
    sheetsSkipped: owner.pagesSkipped,
    warnings,
  };
};

const fiscalLabelFallback = (asOf: string | null): string => {
  const iso = (asOf ?? "").slice(0, 10);
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  if (!Number.isFinite(year) || !Number.isFinite(month)) return "current";
  const start = month >= 3 ? year : year - 1;
  return `${start}/${`${start + 1}`.slice(2)}`;
};

const priorFiscalLabel = (label: string): string => {
  const match = /^(\d{4})\s*\/\s*(\d{1,4})$/.exec(label.trim());
  if (!match) return "prior";
  const start = Number(match[1]) - 1;
  return `${start}/${`${start + 1}`.slice(2)}`;
};

/** `OWNER'S REPORT JULY 26` — the footer stamp the owner packs carry. */
const footerLabel = (asOf: string | null): string => {
  const iso = (asOf ?? "").slice(0, 10);
  const date = new Date(`${iso || "1970-01-01"}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return "REVENUE REPORT";
  const month = date.toLocaleDateString("en-ZA", { month: "long", timeZone: "UTC" }).toUpperCase();
  return `OWNER'S REPORT ${month} ${`${date.getUTCFullYear()}`.slice(2)}`;
};


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing authorization" }, 401);

    const { data: userData, error: userError } = await admin.auth.getUser(token);
    if (userError || !userData.user) return json({ error: "Invalid session" }, 401);

    const { data: allowed, error: accessError } = await admin.rpc("has_reports_access", {
      _user_id: userData.user.id,
    });
    if (accessError) return json({ error: accessError.message }, 500);
    if (!allowed) return json({ error: "Not authorised for revenue reports" }, 403);

    const body = await req.json().catch(() => ({}));
    const runId = typeof body?.run_id === "string" ? body.run_id : "";
    const fileId = typeof body?.file_id === "string" ? body.file_id : "";
    const apply = body?.apply === true;
    const replace = body?.replace_existing === true;
    const selections: Selections = (body?.selections ?? {}) as Selections;
    if (!runId) return json({ error: "run_id is required" }, 400);

    const { data: run, error: runError } = await admin
      .from("report_runs")
      .select("id, property_id, as_of_date, report_month, title")
      .eq("id", runId)
      .maybeSingle();
    if (runError) return json({ error: runError.message }, 500);
    if (!run) return json({ error: "Run not found" }, 404);

    // Every prior-report upload on the run, newest first. A designed owner's-report
    // PDF is tried before a spreadsheet, but a file that yields nothing never wins:
    // we fall through to the next candidate instead of reporting an empty baseline.
    let fileQuery = admin
      .from("report_source_files")
      .select("id, storage_path, original_filename")
      .eq("run_id", runId)
      .eq("file_role", "prior_report");
    if (fileId) fileQuery = fileQuery.eq("id", fileId);
    const { data: files, error: filesError } = await fileQuery.order("created_at", {
      ascending: false,
    });
    if (filesError) return json({ error: filesError.message }, 500);
    const candidates = files ?? [];
    if (!candidates.length) {
      return json({ error: "No previous report uploaded on this run" }, 400);
    }
    const isPdf = (row: { original_filename: string }) =>
      /\.pdf$/i.test(String(row.original_filename ?? ""));
    // A named file is honoured exactly; otherwise PDFs first, then spreadsheets.
    const ordered = fileId
      ? candidates
      : [...candidates.filter(isPdf), ...candidates.filter((row) => !isPdf(row))];

    const runAsOf = run.as_of_date ? String(run.as_of_date).slice(0, 10) : null;
    const attempts: Array<{ filename: string; months: number; note: string }> = [];

    let file: (typeof ordered)[number] | null = null;
    let extract: PriorReportExtract | null = null;
    let owner: OwnerReportExtract | null = null;
    let isOwnerPdf = false;

    for (const candidate of ordered) {
      const download = await admin.storage.from(BUCKET).download(candidate.storage_path);
      if (download.error || !download.data) {
        attempts.push({
          filename: candidate.original_filename,
          months: 0,
          note: `could not be read (${download.error?.message ?? "download failed"})`,
        });
        continue;
      }
      const buffer = await download.data.arrayBuffer();
      const candidateIsPdf = isPdf(candidate);

      let candidateOwner: OwnerReportExtract | null = null;
      let candidateExtract: PriorReportExtract;
      try {
        if (candidateIsPdf) {
          // Designed owner's-report pack: position-aware PDF reader.
          candidateOwner = await parsePriorOwnerReport(buffer, {
            runAsOfDate: runAsOf,
            windowMonths: runAsOf
              ? windowMonths(runAsOf, run.report_month ? String(run.report_month).slice(0, 7) : null)
              : [],
          });
          candidateExtract = ownerToExtract(candidateOwner);
        } else {
          // The run's own as-of date decides which OTB column is the comparison
          // baseline — the newest one strictly older than this run.
          // protel-sourced workbooks arrive UTF-16 encoded; transcode before reading.
          const priorRepair = await repairWorkbookBuffer(buffer);
          candidateExtract = parsePriorReportWorkbook(priorRepair.buffer, { runAsOfDate: runAsOf });
        }
      } catch (e) {
        attempts.push({
          filename: candidate.original_filename,
          months: 0,
          note: `could not be parsed (${(e as Error)?.message ?? "unknown error"})`,
        });
        continue;
      }

      const monthCount = candidateExtract.months.length;
      attempts.push({
        filename: candidate.original_filename,
        months: monthCount,
        note: monthCount ? `${monthCount} month(s) read` : "no figures found",
      });

      // Keep the first candidate as the fallback so a single empty upload still
      // produces a preview explaining what was (not) found.
      if (!file) {
        file = candidate;
        extract = candidateExtract;
        owner = candidateOwner;
        isOwnerPdf = candidateIsPdf;
      }
      if (monthCount > 0) {
        file = candidate;
        extract = candidateExtract;
        owner = candidateOwner;
        isOwnerPdf = candidateIsPdf;
        break;
      }
    }

    if (!file || !extract) {
      return json(
        {
          error: `None of the uploaded previous reports could be read: ${
            attempts.map((a) => `${a.filename} — ${a.note}`).join("; ")
          }`,
        },
        422,
      );
    }


    const found = {
      previous_otb_months: count(extract.previousOtbRevenue),
      previous_nights_months: count(extract.previousRoomNights),
      last_year_months: count(extract.lastYearActual),
      last_year_nights_months: count(extract.lastYearRoomNights),
      dinner_months: count(extract.dinnerByMonth),
      room0_months: count(extract.room0ByMonth),
      comp_months: count(extract.compRnsByMonth),
      historical_revenue_months: count(extract.historicalRevenue),
      historical_nights_months: count(extract.historicalRoomNights),
      occupancy_months: count(extract.previousOccupancy) + count(extract.lastYearOccupancy),
      adr_months: count(extract.previousAdr) + count(extract.lastYearAdr),
      target_months: count(extract.targets),
      historical_occupancy_months: count(extract.historicalOccupancy),
      historical_adr_months: count(extract.historicalAdr),
      carry_forward_sheets: Object.keys(extract.carryForward).length,
      // Owner's-report PDFs only.
      current_otb_months: count(extract.currentOtbRevenue),
      provisional_months: owner ? count(owner.currentYear?.activeEnquiries ?? {}) : 0,
      forward_year_months: owner?.forwardYear?.months.length ?? 0,
      declined_rows: owner?.declined.length ?? 0,
      nationality_rows: owner?.nationality.length ?? 0,
      partner_rows: owner?.partnersCurrent.length ?? 0,
      narrative_pages: owner?.narratives.length ?? 0,
      partner_trend_tables: owner?.partnerTrends.length ?? 0,
    };


    const preview = {
      file: { id: file.id, filename: file.original_filename },
      // Which uploads were tried, in order, and what each yielded.
      file_attempts: attempts,
      available_files: candidates.map((row) => ({ id: row.id, filename: row.original_filename })),

      as_of_date: extract.asOfDate,
      otb_column_label: extract.otbColumnLabel,
      baseline_sheet: extract.baselineSheet,
      months: extract.months,
      previous_otb_revenue: extract.previousOtbRevenue,
      current_otb_revenue: extract.currentOtbRevenue,
      previous_room_nights: extract.previousRoomNights,

      last_year_actual: extract.lastYearActual,
      last_year_room_nights: extract.lastYearRoomNights,
      dinner_by_month: extract.dinnerByMonth,
      room0_by_month: extract.room0ByMonth,
      comp_rns_by_month: extract.compRnsByMonth,
      historical_revenue: extract.historicalRevenue,
      historical_room_nights: extract.historicalRoomNights,
      previous_occupancy: extract.previousOccupancy,
      last_year_occupancy: extract.lastYearOccupancy,
      previous_adr: extract.previousAdr,
      last_year_adr: extract.lastYearAdr,
      targets: extract.targets,
      target_uplift: extract.targetUplift,
      historical_occupancy: extract.historicalOccupancy,
      historical_adr: extract.historicalAdr,

      carry_forward_sheets: Object.keys(extract.carryForward),
      sheets_read: extract.sheetsRead,
      sheets_skipped: extract.sheetsSkipped,
      warnings: extract.warnings,
      // Owner's-report PDF extras — absent for spreadsheet packs.
      source_kind: isOwnerPdf ? "owner_report_pdf" : "workbook",
      fiscal_year_label: owner?.currentYear?.label ?? null,
      provisional_revenue: owner?.currentYear?.activeEnquiries ?? {},
      combined_revenue: owner?.currentYear?.combined ?? {},
      current_otb_occupancy: owner?.currentYear?.occupancyBob ?? {},
      forward_year: owner?.forwardYear
        ? {
            label: owner.forwardYear.label,
            months: owner.forwardYear.months,
            confirmed_bob: owner.forwardYear.confirmedBob,
            budget: owner.forwardYear.budget,
            active_enquiries: owner.forwardYear.activeEnquiries,
            bob_stly: owner.forwardYear.bobStly,
            last_year_actual: owner.forwardYear.lastYearActual,
            occupancy_bob: owner.forwardYear.occupancyBob,
          }
        : null,
      declined: owner?.declined ?? [],
      declined_total: owner?.declinedTotal ?? null,
      declined_period: owner?.declinedPeriod ?? null,
      nationality: owner?.nationality ?? [],
      partners_current: owner?.partnersCurrent ?? [],
      partners_prior: owner?.partnersPrior ?? [],
      narratives: owner?.narratives ?? [],
      partner_trends: owner?.partnerTrends ?? [],
      found,
    };


    if (!apply) return json({ applied: false, preview });

    // A file that yielded nothing must never replace a baseline that already
    // holds figures — reservation lists dropped at this step read as empty.
    const yielded = Object.values(found).some((value) => Number(value) > 0);
    if (!yielded) {
      return json(
        {
          error: `${file.original_filename} holds no baseline figures — nothing was changed. Upload the owner's report (PDF) or the consolidated revenue workbook.`,
          preview,
        },
        422,
      );
    }

    /* ── Apply ─────────────────────────────────────────────── */
    const applied: string[] = [];

    if (selections.previous_otb !== false || selections.last_year !== false) {

      const importedBaseline = {
        source: "prior_report",
        filename: file.original_filename,
        file_id: file.id,
        as_of_date: extract.asOfDate,
        otb_column_label: extract.otbColumnLabel,
        baseline_sheet: extract.baselineSheet,
        imported_at: new Date().toISOString(),
        previous_otb_revenue: selections.previous_otb === false ? {} : extract.previousOtbRevenue,
        previous_room_nights: selections.previous_otb === false ? {} : extract.previousRoomNights,
        last_year_actual: selections.last_year === false ? {} : extract.lastYearActual,
        last_year_room_nights: selections.last_year === false ? {} : extract.lastYearRoomNights,
        // Occupancy, ADR, targets and hand-kept sheets ride along with the
        // baseline so the workbook builder can reproduce the client's layout.
        previous_occupancy: selections.previous_otb === false ? {} : extract.previousOccupancy,
        last_year_occupancy: selections.last_year === false ? {} : extract.lastYearOccupancy,
        previous_adr: selections.previous_otb === false ? {} : extract.previousAdr,
        last_year_adr: selections.last_year === false ? {} : extract.lastYearAdr,
        targets: extract.targets,
        target_uplift: extract.targetUplift,
        historical_occupancy: extract.historicalOccupancy,
        historical_adr: extract.historicalAdr,
        carry_forward: extract.carryForward,
        // Owner's-report packs also print budget, provisional and forward-year
        // figures; they ride along so the workbook builder can reproduce them.
        source_kind: isOwnerPdf ? "owner_report_pdf" : "workbook",
        fiscal_year_label: owner?.currentYear?.label ?? null,
        current_otb_revenue: extract.currentOtbRevenue,
        current_otb_occupancy: owner?.currentYear?.occupancyBob ?? {},
        provisional_revenue: owner?.currentYear?.activeEnquiries ?? {},
        combined_revenue: owner?.currentYear?.combined ?? {},
        forward_year: owner?.forwardYear
          ? {
              label: owner.forwardYear.label,
              months: owner.forwardYear.months,
              confirmed_bob: owner.forwardYear.confirmedBob,
              budget: owner.forwardYear.budget,
              active_enquiries: owner.forwardYear.activeEnquiries,
              bob_stly: owner.forwardYear.bobStly,
              last_year_actual: owner.forwardYear.lastYearActual,
              occupancy_bob: owner.forwardYear.occupancyBob,
            }
          : null,
      };

      const { error } = await admin
        .from("report_runs")
        .update({
          imported_baseline: importedBaseline,
          baseline_source: "imported",
          // Keeps the parser from silently replacing the imported figures with
          // an auto-picked earlier run.
          baseline_locked: true,
        })
        .eq("id", runId);
      if (error) return json({ error: error.message }, 500);
      if (selections.previous_otb !== false && found.previous_otb_months) {
        applied.push(`${found.previous_otb_months} month(s) previous OTB`);
      }
      if (selections.last_year !== false && found.last_year_months) {
        applied.push(`${found.last_year_months} month(s) last-year actual`);
      }
      if (found.occupancy_months) applied.push(`${found.occupancy_months} occupancy value(s)`);
      if (found.target_months) applied.push(`${found.target_months} month(s) target`);
      if (found.carry_forward_sheets) {
        applied.push(`${found.carry_forward_sheets} carried-forward sheet(s)`);
      }
    }

    if (selections.additional_inputs !== false) {
      const { data: existing } = await admin
        .from("report_additional_inputs")
        .select("dinner_by_month, room0_by_month, comp_rns_by_month")
        .eq("run_id", runId)
        .maybeSingle();
      const { error } = await admin.from("report_additional_inputs").upsert(
        {
          run_id: runId,
          dinner_by_month: mergeMap(
            (existing?.dinner_by_month ?? {}) as NumberMap,
            extract.dinnerByMonth,
            replace,
          ),
          room0_by_month: mergeMap(
            (existing?.room0_by_month ?? {}) as NumberMap,
            extract.room0ByMonth,
            replace,
          ),
          comp_rns_by_month: mergeMap(
            (existing?.comp_rns_by_month ?? {}) as NumberMap,
            extract.compRnsByMonth,
            replace,
          ),
        },
        { onConflict: "run_id" },
      );
      if (error) return json({ error: error.message }, 500);
      const inputMonths = found.dinner_months + found.room0_months + found.comp_months;
      if (inputMonths) applied.push(`${inputMonths} manual input value(s)`);
    }

    if (
      selections.historical !== false &&
      (found.historical_revenue_months ||
        found.historical_nights_months ||
        found.historical_occupancy_months)
    ) {
      const { data: settings } = await admin
        .from("property_report_settings")
        .select("room_count, historical_baseline")
        .eq("property_id", run.property_id)
        .maybeSingle();
      const baseline = (settings?.historical_baseline ?? {}) as {
        revenue?: NumberMap;
        room_nights?: NumberMap;
        occupancy?: NumberMap;
        adr?: NumberMap;
        sources?: Record<string, string>;
      };
      const revenue = mergeMap(baseline.revenue ?? {}, extract.historicalRevenue, replace);
      const roomNights = mergeMap(baseline.room_nights ?? {}, extract.historicalRoomNights, replace);
      const occupancy = mergeMap(baseline.occupancy ?? {}, extract.historicalOccupancy, replace);
      const adr = mergeMap(baseline.adr ?? {}, extract.historicalAdr, replace);
      const sources = { ...(baseline.sources ?? {}) };
      for (const key of Object.keys({ ...extract.historicalRevenue, ...extract.historicalRoomNights })) {
        if (replace || sources[key] === undefined) sources[key] = "prior_report";
      }
      const years = [
        ...new Set(Object.keys({ ...revenue, ...roomNights }).map((key) => Number(key.slice(0, 4)))),
      ]
        .filter((year) => Number.isFinite(year))
        .sort((a, b) => a - b);

      const { error } = await admin.from("property_report_settings").upsert(
        {
          property_id: run.property_id,
          room_count: settings?.room_count ?? 1,
          historical_baseline: { years, revenue, room_nights: roomNights, occupancy, adr, sources },
        },

        { onConflict: "property_id" },
      );
      if (error) return json({ error: error.message }, 500);
      applied.push(`${years.length} year(s) historical baseline`);
    }



    /* ── Owner's-report pages → special-report slides ──── */
    if (
      owner &&
      selections.owner_tables !== false &&
      (owner.declined.length ||
        owner.nationality.length ||
        owner.partnersCurrent.length ||
        owner.narratives.length ||
        owner.partnerTrends.length ||
        owner.currentYear ||
        owner.forwardYear)
    ) {

      const { data: property } = await admin
        .from("properties")
        .select("name")
        .eq("id", run.property_id)
        .maybeSingle();
      const { data: brandSettings } = await admin
        .from("property_report_settings")
        .select("brand_source, report_logo_url, brand_primary, brand_secondary")
        .eq("property_id", run.property_id)
        .maybeSingle();

      const branding: SpecialReportBranding = {
        logoUrl: brandSettings?.report_logo_url ?? null,
        brandPrimary:
          brandSettings?.brand_source === "rol" ? null : (brandSettings?.brand_primary ?? null),
        brandSecondary:
          brandSettings?.brand_source === "rol" ? null : (brandSettings?.brand_secondary ?? null),
      };
      const context: SpecialReportContext = {
        propertyName: property?.name ?? "Property",
        asOfDate: (owner.asOfDate ?? runAsOf ?? "").slice(0, 10),
        footerLabel: footerLabel(owner.asOfDate ?? runAsOf),
        branding,
      };

      const stamp = Date.now();
      const writeSlide = async (
        key: string,
        title: string,
        html: string,
        rowCount: number,
        payload: Record<string, unknown>,
        warnings: string[],
      ) => {
        const path = `${run.property_id}/${runId}/special/${key}-${stamp}.html`;
        const { error: uploadError } = await admin.storage
          .from(BUCKET)
          .upload(path, new Blob([html], { type: "text/html" }), {
            contentType: "text/html; charset=utf-8",
            upsert: true,
          });
        if (uploadError) throw new Error(`${key}: ${uploadError.message}`);
        const { error: recordError } = await admin.from("report_special_reports").upsert(
          {
            run_id: runId,
            report_key: key,
            title,
            storage_path: path,
            payload: { ...payload, row_count: rowCount, source: "owner_report_pdf" },
            warnings: warnings.filter(Boolean),
            generated_at: new Date().toISOString(),
          },
          { onConflict: "run_id,report_key" },
        );
        if (recordError) throw new Error(`${key}: ${recordError.message}`);
      };

      const currentLabel =
        owner.nationalityCurrentLabel ??
        owner.partnersCurrentLabel ??
        owner.currentYear?.label ??
        fiscalLabelFallback(owner.asOfDate ?? runAsOf);
      const priorLabel =
        owner.nationalityPriorLabel ?? owner.partnersPriorLabel ?? priorFiscalLabel(currentLabel);

      // The full pack, in printed order. Slides with no source data are absent.
      const packSlides = buildOwnerPackSlides(owner, context, { currentLabel, priorLabel });
      for (const [index, slide] of packSlides.entries()) {
        await writeSlide(slide.key, slide.title, slide.html, slide.rowCount, {
          ...slide.payload,
          pack_index: index,
        }, slide.warnings);
      }
      if (packSlides.length) {
        applied.push(`${packSlides.length} owner-pack slide(s): ${packSlides.map((slide) => slide.title).join(", ")}`);
      }
    }



    await logRunEvent(
      admin,
      runId,
      "prior_report_imported",
      `Prior report imported from ${file.original_filename}${applied.length ? ` — ${applied.join(", ")}` : ""}`,
      { file_id: file.id, as_of_date: extract.asOfDate, found, replace },
      userData.user.id,
    );

    return json({ applied: true, summary: applied, preview });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("report-prior-workbook-import failed:", message);
    return json({ error: message }, 500);
  }
});
