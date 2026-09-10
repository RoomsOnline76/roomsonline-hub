// Builds the CheetaPlains bespoke owner pack for a run.
//
// Input : { run_id }
// Output: { reports: [{ kind, storage_path, row_count }] }
//
// The pack prints alongside the standard revenue report and is assembled from
// the run's own figures: confirmed revenue and occupancy from the aggregated
// snapshot, active enquiries from the provisional-bookings export, and the
// budget / STLY / last-year columns carried from the property's previous pack.
// The written pages are drafted by TOBI and stay editable. When a run has no
// snapshot yet, only the workbook-driven nationality and travel-partner slides
// are produced.
//
// Slides are stand-alone landscape A4 HTML documents in the `revenue-reports`
// bucket, indexed in `report_special_reports`. Only properties flagged with
// `special_report_set = 'cheetaplains'` are served.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";
import { repairWorkbookBuffer } from "../_shared/xlsxRepair.ts";
import {
  buildNationalityTable,
  isNationalityGrid,
  parseNationalityWorkbook,
  type NationalityYear,
} from "../_shared/cheetaplains/nationality.ts";
import {
  assignFiscalYears,
  buildPartnerTotals,
  fiscalYearLabel,
  isReservationListGrid,
  parseReservationList,
  type PartnerParseResult,
} from "../_shared/cheetaplains/partners.ts";
import {
  isProvisionalGrid,
  parseProvisionalGrid,
  provisionalRevenueByMonth,
  PROVISIONAL_FILENAME,
} from "../_shared/cheetaplains/provisional.ts";
import {
  buildNationalitySlide,
  buildPartnersSlide,
  type SpecialReportBranding,
  type SpecialReportContext,
} from "../_shared/cheetaplains/specialReportHtml.ts";
import { buildOwnerPackSlides, revenueGridRows } from "../_shared/cheetaplains/ownerPack.ts";
import { buildRunOwnerExtract, fiscalGridLabel, fiscalStartYear } from "../_shared/cheetaplains/packFromRun.ts";
import { loadCarriedPack } from "../_shared/cheetaplains/carriedPack.ts";
import { draftPackNarratives } from "../_shared/cheetaplains/packCommentary.ts";
import { logRunEvent } from "../_shared/reportRunEvents.ts";

const BUCKET = "revenue-reports";
const SPECIAL_SET = "cheetaplains";

type Grid = unknown[][];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function readSheets(buffer: ArrayBuffer): Record<string, Grid> {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const sheets: Record<string, Grid> = {};
  for (const name of workbook.SheetNames) {
    sheets[name] = toGrid(workbook, name);
  }
  return sheets;
}

const toGrid = (workbook: XLSX.WorkBook, name: string): Grid =>
  XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true,
  });

/**
 * Reads a workbook one sheet at a time and stops at the first sheet the caller
 * claims. The travel-partner export runs to a couple of megabytes, and turning
 * every sheet of it into rows exhausts the worker's CPU budget, which is what
 * silently dropped the pack from the final step.
 */
function findSheet(
  buffer: ArrayBuffer,
  claim: (grid: Grid) => boolean,
): { grid: Grid; sheets: Record<string, Grid> } | null {
  const workbook = XLSX.read(new Uint8Array(buffer), { type: "array" });
  for (const name of workbook.SheetNames) {
    const grid = toGrid(workbook, name);
    if (claim(grid)) return { grid, sheets: { [name]: grid } };
  }
  return null;
}


const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

/** `2026-08-31` → `OWNER'S REPORT AUGUST 26`. */
const footerLabel = (iso: string): string => {
  const month = MONTHS[Math.max(0, Math.min(11, Number(iso.slice(5, 7)) - 1))];
  return `OWNER'S REPORT ${month.toUpperCase()} ${iso.slice(2, 4)}`;
};

/** `2026/7` → `2025/6`. */
const priorFiscalLabel = (label: string): string => {
  const start = Number(label.split("/")[0]);
  return Number.isFinite(start) ? `${start - 1}/${`${start}`.slice(-1)}` : label;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, serviceKey);

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!token) return json({ error: "Missing authorization" }, 401);

    // The report parsers call this straight after writing a snapshot, using the
    // service role — there is no end user in that path.
    const internal = token === serviceKey;
    let actorId: string | null = null;

    if (!internal) {
      const { data: userData, error: userError } = await admin.auth.getUser(token);
      if (userError || !userData.user) return json({ error: "Invalid session" }, 401);
      const { data: allowed, error: accessError } = await admin.rpc("has_reports_access", {
        _user_id: userData.user.id,
      });
      if (accessError) return json({ error: accessError.message }, 500);
      if (!allowed) return json({ error: "Not authorised for revenue reports" }, 403);
      actorId = userData.user.id;
    }

    const body = await req.json().catch(() => ({}));
    const runId = typeof body?.run_id === "string" ? body.run_id : "";
    if (!runId) return json({ error: "run_id is required" }, 400);

    const { data: run, error: runError } = await admin
      .from("report_runs")
      .select("id, property_id, as_of_date")
      .eq("id", runId)
      .maybeSingle();
    if (runError) return json({ error: runError.message }, 500);
    if (!run) return json({ error: "Run not found" }, 404);

    const { data: property } = await admin
      .from("properties")
      .select("name")
      .eq("id", run.property_id)
      .maybeSingle();

    const { data: settings } = await admin
      .from("property_report_settings")
      .select("special_report_set, brand_source, report_logo_url, brand_primary, brand_secondary")
      .eq("property_id", run.property_id)
      .maybeSingle();

    if ((settings?.special_report_set ?? null) !== SPECIAL_SET) {
      return json(
        {
          error:
            "This property is not configured for the CheetaPlains report set — enable it in Report settings first",
        },
        400,
      );
    }

    const branding: SpecialReportBranding = {
      logoUrl: settings?.report_logo_url ?? null,
      brandPrimary: settings?.brand_source === "rol" ? null : (settings?.brand_primary ?? null),
      brandSecondary: settings?.brand_source === "rol" ? null : (settings?.brand_secondary ?? null),
    };
    const asOfDate = String(run.as_of_date ?? "").slice(0, 10);
    const context: SpecialReportContext = {
      propertyName: property?.name ?? "Property",
      asOfDate,
      footerLabel: footerLabel(asOfDate),
      branding,
    };

    // Every spreadsheet on the run is offered to the specialised readers, whatever
    // role it was uploaded under: a nationality or reservation list dropped at the
    // previous-report step is still the source for these slides. Owner's-report
    // PDFs are handled by the prior-report importer, not here.
    const { data: allFiles, error: filesError } = await admin
      .from("report_source_files")
      .select("id, storage_path, original_filename")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    if (filesError) return json({ error: filesError.message }, 500);
    // House State / Hotel Status revenue grids are never a source for these
    // slides. A run can carry a whole forward window of them (18+ UTF-16
    // workbooks), and reading them all exhausts the worker's memory, so they are
    // skipped by name before anything is downloaded.
    const REVENUE_GRID_NAME = /house\s*state|hotel\s*status|daily\s+detailed/i;
    const files = (allFiles ?? []).filter(
      (file) =>
        !/\.pdf$/i.test(String(file.original_filename ?? "")) &&
        !REVENUE_GRID_NAME.test(String(file.original_filename ?? "")),
    );

    let nationalityCurrent: NationalityYear | null = null;
    let nationalityPrior: NationalityYear | null = null;
    const nationalityNotes: string[] = [];
    const reservationFiles: Array<PartnerParseResult & { filename: string }> = [];
    let provisionalRevenue: Record<string, number> = {};
    const provisionalNotes: string[] = [];

    for (const file of files) {
      const filename = String(file.original_filename ?? "");
      const download = await admin.storage.from(BUCKET).download(file.storage_path);
      if (download.error || !download.data) {
        nationalityNotes.push(`${filename}: ${download.error?.message ?? "download failed"}`);
        continue;
      }

      let buffer: ArrayBuffer;
      let hit: { grid: Grid; sheets: Record<string, Grid> } | null;
      try {
        buffer = (await repairWorkbookBuffer(await download.data.arrayBuffer())).buffer;
        // The provisional export looks a lot like a reservation list, so it is
        // claimed by name first and only sniffed as a fallback.
        hit = PROVISIONAL_FILENAME.test(filename)
          ? findSheet(buffer, isProvisionalGrid)
          : findSheet(
              buffer,
              (grid) =>
                isNationalityGrid(grid) || isProvisionalGrid(grid) || isReservationListGrid(grid),
            );
      } catch (error) {
        nationalityNotes.push(
          `${filename}: unreadable workbook (${error instanceof Error ? error.message : "unknown"})`,
        );
        continue;
      }

      if (!hit) {
        if (PROVISIONAL_FILENAME.test(filename)) {
          provisionalNotes.push(`${filename}: no provisional rows recognised`);
        }
        continue;
      }

      if (isNationalityGrid(hit.grid)) {
        // The nationality workbook keeps its two years on separate sheets, so it
        // is the one file read in full — it is also the smallest.
        const parsed = parseNationalityWorkbook(readSheets(buffer), filename);
        if (parsed.currentYear) nationalityCurrent = parsed.currentYear;
        if (parsed.lastYear) nationalityPrior = parsed.lastYear;
        nationalityNotes.push(...parsed.errors, ...parsed.warnings);
        continue;
      }

      if (PROVISIONAL_FILENAME.test(filename) || isProvisionalGrid(hit.grid)) {
        const parsed = parseProvisionalGrid(hit.grid, filename);
        provisionalRevenue = { ...provisionalRevenue, ...provisionalRevenueByMonth(parsed) };
        provisionalNotes.push(...parsed.errors, ...parsed.warnings);
        continue;
      }

      const parsed = parseReservationList(hit.grid, filename);
      reservationFiles.push({ ...parsed, filename });
    }


    const reports: Array<{ kind: string; storage_path: string; row_count: number }> = [];
    const stamp = Date.now();

    const upload = async (
      kind: string,
      title: string,
      html: string,
      rowCount: number,
      payload: Record<string, unknown>,
      warnings: string[],
    ) => {
      const path = `${run.property_id}/${runId}/special/${kind}-${stamp}.html`;
      const { error: uploadError } = await admin.storage
        .from(BUCKET)
        .upload(path, new Blob([html], { type: "text/html" }), {
          contentType: "text/html; charset=utf-8",
          upsert: true,
        });
      if (uploadError) throw new Error(`${kind}: ${uploadError.message}`);

      const { error: recordError } = await admin.from("report_special_reports").upsert(
        {
          run_id: runId,
          report_key: kind,
          title,
          storage_path: path,
          payload: { ...payload, row_count: rowCount },
          warnings: warnings.filter(Boolean),
          generated_at: new Date().toISOString(),
        },
        { onConflict: "run_id,report_key" },
      );
      if (recordError) throw new Error(`${kind}: ${recordError.message}`);
      reports.push({ kind, storage_path: path, row_count: rowCount });
    };

    /* ── The full pack, from this run's own figures ─────────────── */

    const { data: snapshot } = await admin
      .from("report_snapshots")
      .select("otb_revenue, occupancy, months")
      .eq("run_id", runId)
      .maybeSingle();

    const packNotes: string[] = [...provisionalNotes];
    let packSlideCount = 0;

    if (snapshot && asOfDate) {
      const { carried, sources } = await loadCarriedPack(admin, run.property_id, runId);

      // Workbooks uploaded to this run always beat the carried tables.
      if (nationalityCurrent) {
        carried.nationality = buildNationalityTable(nationalityCurrent, nationalityPrior);
        carried.nationalityCurrentLabel = fiscalYearLabel(asOfDate);
        carried.nationalityPriorLabel = priorFiscalLabel(carried.nationalityCurrentLabel);
      }
      if (reservationFiles.length) {
        const { current, prior } = assignFiscalYears(reservationFiles);
        carried.partnersCurrent = buildPartnerTotals(current?.rows ?? []);
        carried.partnersPrior = buildPartnerTotals(prior?.rows ?? []);
        carried.partnersCurrentLabel = fiscalYearLabel(current?.period?.from ?? asOfDate);
        carried.partnersPriorLabel = prior?.period?.from
          ? fiscalYearLabel(prior.period.from)
          : priorFiscalLabel(carried.partnersCurrentLabel);
      }

      const { extract, warnings: gridWarnings } = buildRunOwnerExtract({
        asOfDate,
        confirmedRevenue: (snapshot.otb_revenue ?? {}) as Record<string, number>,
        occupancy: (snapshot.occupancy ?? {}) as Record<string, number>,
        provisionalRevenue,
        hasProvisionalSource: Object.keys(provisionalRevenue).length > 0,
        carried,

      });
      packNotes.push(...gridWarnings);
      if (!Object.keys(provisionalRevenue).length) {
        packNotes.push(
          "No provisional-bookings export on this run — the Active Enquiries column prints blank",
        );
      }

      // TOBI drafts the two written pages from the grid; last month's pages are
      // the fallback and the voice reference.
      const startYear = fiscalStartYear(asOfDate);
      const drafted = await draftPackNarratives({
        fiscalLabel: fiscalGridLabel(startYear),
        forwardLabel: extract.forwardYear ? fiscalGridLabel(startYear + 1) : null,
        currentRows: extract.currentYear ? revenueGridRows(extract.currentYear) : [],
        forwardRows: extract.forwardYear ? revenueGridRows(extract.forwardYear) : [],
        carried: carried.narratives,
        propertyName: context.propertyName,
        asOfDate,
      });
      extract.narratives = drafted.narratives;
      packNotes.push(...drafted.warnings);

      const currentLabel = fiscalYearLabel(asOfDate);
      const packSlides = buildOwnerPackSlides(extract, context, {
        currentLabel,
        priorLabel: priorFiscalLabel(currentLabel),
      });

      for (const [index, slide] of packSlides.entries()) {
        await upload(
          slide.key,
          slide.title,
          slide.html,
          slide.rowCount,
          { ...slide.payload, pack_index: index, source: "run" },
          [...slide.warnings, ...(index === 0 ? packNotes : [])],
        );
      }
      packSlideCount = packSlides.length;

      if (packSlideCount) {
        await logRunEvent(
          admin,
          runId,
          "special_report_generated",
          `${packSlideCount} owner-pack slide(s) built from this run${sources.length ? `, comparison columns carried from ${sources[0]}` : ""}`,
          { reports, commentary_drafted: drafted.drafted, carried_from: sources.slice(0, 3) },
          actorId,
        );
        return json({
          success: true,
          run_id: runId,
          reports,
          source: "run",
          commentary_drafted: drafted.drafted,
          notes: [...packNotes, ...nationalityNotes],
        });
      }
    }

    /* ── Fallback: workbook-only slides (no snapshot yet) ───────── */

    if (!files.length) return json({ error: "No source files uploaded for this run" }, 400);

    if (nationalityCurrent) {
      const rows = buildNationalityTable(nationalityCurrent, nationalityPrior);
      const currentLabel = fiscalYearLabel(run.as_of_date);
      const priorLabel = priorFiscalLabel(currentLabel);

      await upload(
        "nationality",
        "Bookings by nationality",
        buildNationalitySlide({
          ...context,
          currentLabel,
          priorLabel,
          rows,
          hasPrior: Boolean(nationalityPrior),
        }),
        rows.length,
        { current_label: currentLabel, prior_label: priorLabel, has_prior: Boolean(nationalityPrior), rows },
        nationalityNotes,
      );
    }

    if (reservationFiles.length) {
      const { current, prior } = assignFiscalYears(reservationFiles);
      const currentRows = buildPartnerTotals(current?.rows ?? []);
      const priorRows = buildPartnerTotals(prior?.rows ?? []);
      const currentLabel = fiscalYearLabel(current?.period?.from ?? run.as_of_date);
      const priorLabel = prior?.period?.from
        ? fiscalYearLabel(prior.period.from)
        : priorFiscalLabel(currentLabel);

      await upload(
        "partners",
        "Top booking travel partners",
        buildPartnersSlide({
          ...context,
          currentLabel,
          priorLabel,
          current: currentRows,
          prior: priorRows,
        }),
        currentRows.length,
        {
          current_label: currentLabel,
          prior_label: priorLabel,
          current: currentRows,
          prior: priorRows,
          current_file: current?.filename ?? null,
          prior_file: prior?.filename ?? null,
        },
        reservationFiles.flatMap((file) => [...file.errors, ...file.warnings]),
      );
    }

    if (!reports.length) {
      return json(
        {
          error:
            "Nothing to build yet — process the run's exports, or upload the Bookings by Nationality workbook and the reservation-list export",
          notes: [...packNotes, ...nationalityNotes],
        },
        422,
      );
    }

    await logRunEvent(
      admin,
      runId,
      "special_report_generated",
      `${reports.map((report) => report.kind).join(" and ")} slide(s) generated for the CheetaPlains owner pack`,
      { reports },
      actorId,
    );

    return json({ success: true, run_id: runId, reports, notes: nationalityNotes });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected failure";
    console.error("cheetaplains-special-reports failed:", message);
    return json({ error: message }, 500);
  }
});
