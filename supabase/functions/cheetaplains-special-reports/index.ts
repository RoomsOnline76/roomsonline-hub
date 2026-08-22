// Builds the two CheetaPlains owner-pack slides — "Bookings by nationality" and
// "Top booking travel partners" — from the protel sources attached to a run.
//
// Input : { run_id }
// Output: { reports: [{ kind, storage_path, row_count }] }
//
// The slides are stand-alone landscape A4 HTML documents stored in the
// `revenue-reports` bucket and indexed in `report_special_reports`. They are
// only produced for properties hard-flagged with `special_report_set = 'cheetaplains'`.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";
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
  buildNationalitySlide,
  buildPartnersSlide,
  type SpecialReportBranding,
} from "../_shared/cheetaplains/specialReportHtml.ts";
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
    sheets[name] = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[name], {
      header: 1,
      blankrows: true,
      defval: null,
      raw: true,
    });
  }
  return sheets;
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

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
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
    if (!runId) return json({ error: "run_id is required" }, 400);
    const actorId = userData.user.id;

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
    const context = {
      propertyName: property?.name ?? "Property",
      asOfDate: String(run.as_of_date ?? "").slice(0, 10),
      footerLabel: footerLabel(run.as_of_date),
      branding,
    };

    const { data: files, error: filesError } = await admin
      .from("report_source_files")
      .select("id, storage_path, original_filename")
      .eq("run_id", runId)
      .or("file_role.is.null,file_role.neq.prior_report")
      .order("created_at", { ascending: true });
    if (filesError) return json({ error: filesError.message }, 500);
    if (!files?.length) return json({ error: "No source files uploaded for this run" }, 400);

    let nationalityCurrent: NationalityYear | null = null;
    let nationalityPrior: NationalityYear | null = null;
    const nationalityNotes: string[] = [];
    const reservationFiles: Array<PartnerParseResult & { filename: string }> = [];

    for (const file of files) {
      const download = await admin.storage.from(BUCKET).download(file.storage_path);
      if (download.error || !download.data) {
        nationalityNotes.push(
          `${file.original_filename}: ${download.error?.message ?? "download failed"}`,
        );
        continue;
      }

      let sheets: Record<string, Grid>;
      try {
        sheets = readSheets(
          (await repairWorkbookBuffer(await download.data.arrayBuffer())).buffer,
        );
      } catch (error) {
        nationalityNotes.push(
          `${file.original_filename}: unreadable workbook (${error instanceof Error ? error.message : "unknown"})`,
        );
        continue;
      }

      const grids = Object.values(sheets);
      if (grids.some((grid) => isNationalityGrid(grid))) {
        const parsed = parseNationalityWorkbook(sheets, file.original_filename);
        if (parsed.currentYear) nationalityCurrent = parsed.currentYear;
        if (parsed.lastYear) nationalityPrior = parsed.lastYear;
        nationalityNotes.push(...parsed.errors, ...parsed.warnings);
        continue;
      }

      const reservationGrid = grids.find((grid) => isReservationListGrid(grid));
      if (reservationGrid) {
        const parsed = parseReservationList(reservationGrid, file.original_filename);
        reservationFiles.push({ ...parsed, filename: file.original_filename });
      }
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
        { current_label: currentLabel, prior_label: priorLabel, has_prior: Boolean(nationalityPrior) },
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
          current: currentRows.map((row) => ({
            partner: row.partner,
            nights: row.nights,
            revenue: row.revenue,
          })),
          prior: priorRows.map((row) => ({
            partner: row.partner,
            nights: row.nights,
            revenue: row.revenue,
          })),
        }),
        currentRows.length,
        {
          current_label: currentLabel,
          prior_label: priorLabel,
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
            "No CheetaPlains source files recognised — upload the Bookings by Nationality workbook and/or the reservation list export",
          notes: nationalityNotes,
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
