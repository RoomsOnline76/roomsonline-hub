/**
 * Builds the Cheetah Plains Daily Detailed Report from a run's uploaded files.
 *
 * The day carries around twenty exports (villa-state workbooks, the provisional
 * booking export, movement PDFs), which is far more than one worker can read in
 * a single pass. The work is therefore split into two modes:
 *
 *   `parse_batch` — reads a handful of not-yet-read files and stores each file's
 *                   extracted payload on its `report_source_files` row;
 *   `build`       — once nothing is left to read, assembles the day from the
 *                   stored payloads, applies anything pasted from the day's
 *                   email, upserts the day and its months, and renders the
 *                   one-page report from the stored figures.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";
import { getDocumentProxy } from "npm:unpdf@0.12.1";
import { repairWorkbookBuffer } from "../_shared/xlsxRepair.ts";
import {
  isHouseStateGrid,
  isHouseStatePdfText,
  parseHouseState,
  parseHouseStatePdfText,
  type HouseStateFilter,
  type ProtelDay,
} from "../_shared/protel/houseState.ts";
import {
  isReservationListGrid,
  parseReservationList,
} from "../_shared/protel/reservationList.ts";
import { isVoidStatGrid, parseVoidStat } from "../_shared/protel/voidStat.ts";


import {
  isProvisionalGrid,
  parseProvisionalGrid,
} from "../_shared/cheetaplains/provisional.ts";
import { parseProvisionalOoxml } from "./provisionalOoxml.ts";
import {
  isPipelineGrid,
  parsePipelineGrid,
  type PipelineRole,
} from "../_shared/cheetaplains/pipeline.ts";
import {
  buildDailyFigures,
  monthlyOnBooks,
  parseMovementPdf,
  parsePastedEmail,
  type DailyFigures,
  type DailyMovement,
} from "../_shared/cheetaplains/dailyDetailed.ts";
import { buildDailyReportHtml } from "../_shared/cheetaplains/dailyReportHtml.ts";
import {
  buildYearGrids,
  fiscalYearLabel,
  type ComparisonMonthRow,
} from "../_shared/cheetaplains/comparisonGrid.ts";

import { logRunEvent } from "../_shared/reportRunEvents.ts";

const BUCKET = "revenue-reports";
/**
 * Workbooks read per `parse_batch` call. One at a time: the provisional export
 * is far larger than a House State day and three of them exhaust the worker.
 */
const FILES_PER_BATCH = 1;
/** A file that exhausts the worker this many times is skipped with a note. */
const MAX_FILE_ATTEMPTS = 2;
/** Rows sampled to recognise a sheet before the whole grid is converted. */
const PROBE_ROWS = 40;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Grid = unknown[][];

/** What one source file contributed to the day, stored on its row. */
type PipelineTotals = {
  count: number;
  value: number;
  months: Record<string, { count: number; value: number }>;
};

type DailyPayload =
  /**
   * One House State / Hotel Status print. `filter` says which reservation states
   * it covered: confirmed business, or provisional (optional / tentative) business
   * that must never be added to revenue on the books.
   */
  | { kind: "house_state"; days: ProtelDay[]; filter?: HouseStateFilter }

  | { kind: "provisional"; months: Record<string, { revenue: number; nights: number }> }
  | { kind: "pipeline"; roles: Partial<Record<PipelineRole, PipelineTotals>> }
  | { kind: "created" | "cancelled"; movement: DailyMovement }
  /** The team's old running spreadsheet — no longer used by the report. */
  | { kind: "running_workbook" }
  | { kind: "skipped" };

interface StoredDaily {
  payload: DailyPayload;
  notes: string[];
  ok: boolean;
  rows: number;
}

const toGrid = (workbook: XLSX.WorkBook, name: string, maxRows?: number): Grid => {
  const sheet = workbook.Sheets[name];
  if (!sheet) return [];
  let range: string | undefined;
  if (maxRows && typeof sheet["!ref"] === "string") {
    const decoded = XLSX.utils.decode_range(sheet["!ref"] as string);
    decoded.e.r = Math.min(decoded.e.r, decoded.s.r + maxRows);
    range = XLSX.utils.encode_range(decoded);
  }
  return XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    blankrows: true,
    defval: null,
    raw: true,
    ...(range ? { range } : {}),
  });
};

/**
 * Both readings of a PDF in one pass: `flat` is the merged single text run the
 * movement prints are read from, `lines` keeps the print's own rows (grouped by
 * their y position) so the Hotel Status grid can be read row by row.
 */
const pdfText = async (buffer: ArrayBuffer): Promise<{ flat: string; lines: string }> => {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const parts: string[] = [];
  const rows: string[] = [];
  for (let page = 1; page <= pdf.numPages; page += 1) {
    const content = await (await pdf.getPage(page)).getTextContent();
    let lastY: number | null = null;
    let current: string[] = [];
    for (const item of content.items as Array<{ str?: string; transform?: number[] }>) {
      if (typeof item.str !== "string" || !item.str.trim()) continue;
      parts.push(item.str);
      const y = Array.isArray(item.transform) ? item.transform[5] : null;
      if (lastY !== null && y !== null && Math.abs(y - lastY) > 1.5) {
        if (current.length) rows.push(current.join(" "));
        current = [];
      }
      if (y !== null) lastY = y;
      current.push(item.str.trim());
    }
    if (current.length) rows.push(current.join(" "));
  }
  return { flat: parts.join(" "), lines: rows.join("\n") };
};


/**
 * The team's old running spreadsheet. The report is built from the database, so
 * such a file is recognised by name and ignored.
 */
const isRunningWorkbook = (name: string): boolean =>
  /daily[\s_-]*detailed[\s_-]*report/i.test(name) && /\.xlsx$/i.test(name);

/**
 * Every spreadsheet and PDF in the day's folder is given a look. The movement
 * exports (`creation_…`, `VoidStat_…`) are named nothing like the villa state,
 * so a name-based list silently dropped the day's created and cancelled
 * reservations; recognition happens on contents instead.
 */
const isDailyFile = (name: string): boolean =>
  /\.(pdf|xlsx|xlsm|xls)$/i.test(name) ||
  /housestate/i.test(name) ||
  /provisional/i.test(name) ||
  /(daily|villa|state)/i.test(name);


interface FileRow {
  id: string;
  storage_path: string;
  original_filename: string | null;
  detected_mapping: Record<string, unknown> | null;
}

const storedDaily = (row: FileRow): StoredDaily | null => {
  const value = (row.detected_mapping ?? {})["daily"];
  if (!value || typeof value !== "object") return null;
  const entry = value as StoredDaily;
  return entry.payload && typeof entry.payload === "object" ? entry : null;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  let runId = "";
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
    runId = typeof body?.run_id === "string" ? body.run_id : "";
    if (!runId) return json({ error: "run_id is required" }, 400);
    const requestedMode = typeof body?.mode === "string" ? body.mode : "parse_batch";
    const mode: "parse_batch" | "aggregate" | "build" | "pack" =
      requestedMode === "build" || requestedMode === "aggregate" || requestedMode === "pack"
        ? requestedMode
        : "parse_batch";

    const reset = body?.reset === true;
    const actorId = userData.user.id;

    const { data: run, error: runError } = await admin
      .from("report_runs")
      .select("id, property_id, as_of_date, report_kind, properties(name)")
      .eq("id", runId)
      .maybeSingle();
    if (runError) return json({ error: runError.message }, 500);
    if (!run) return json({ error: "Run not found" }, 404);

    const propertyName = String(
      (run.properties as { name?: string } | null)?.name ?? "Property",
    );
    const asOf = String(run.as_of_date).slice(0, 10);

    /* ── the Canva asset pack ────────────────────────────────────── */

    // The pack is the built report's own material: the printed page, one CSV per
    // financial-year table, a vector graph per year and every figure as JSON.
    if (mode === "pack") {
      const { data: runRow } = await admin
        .from("report_runs")
        .select("draft_report_path")
        .eq("id", runId)
        .maybeSingle();
      const reportPath = (runRow as { draft_report_path?: string | null } | null)
        ?.draft_report_path ?? null;
      if (!reportPath) {
        return json({ error: "Build the day's report first — the pack is built from it" }, 409);
      }

      const { data: dayRow } = await admin
        .from("report_daily_days")
        .select("figures")
        .eq("property_id", run.property_id)
        .eq("report_date", asOf)
        .maybeSingle();
      const dayFigures = (dayRow?.figures ?? null) as DailyFigures | null;

      const { data: packSettings } = await admin
        .from("property_report_settings")
        .select("brand_primary")
        .eq("property_id", run.property_id)
        .maybeSingle();

      const { data: packMonths } = await admin
        .from("report_comparison_months")
        .select("month, bob, occupancy, budget, stly, stly_occupancy, last_year, last_year_occupancy")
        .eq("property_id", run.property_id)
        .order("month", { ascending: true });
      const packGrids = buildYearGrids((packMonths ?? []) as ComparisonMonthRow[]);

      const download = await admin.storage.from(BUCKET).download(reportPath);
      const reportHtml = download.data ? await download.data.text() : "";

      const encoder = new TextEncoder();
      const entries: Record<string, Uint8Array> = {
        "README.txt": encoder.encode(
          [
            `${propertyName} — Daily Detailed Report asset pack`,
            `Business day ${asOf}`,
            "",
            "report.html   the printed report itself — open it to print or to copy from",
            "charts/       vector SVGs — import straight into Canva, colours stay editable",
            "tables/       CSV per table — paste into a Canva table or a sheet",
            "manifest.json every figure used on the report",
          ].join("\n"),
        ),
        "manifest.json": encoder.encode(
          JSON.stringify({ property: propertyName, date: asOf, figures: dayFigures, years: packGrids }, null, 2),
        ),
      };
      if (reportHtml) entries["report.html"] = encoder.encode(reportHtml);
      const primary = packSettings?.brand_primary ?? "#1A1A2E";
      for (const grid of packGrids) {
        const slug = grid.label.replace(/[^\w]+/g, "-").toLowerCase();
        entries[`charts/on-the-books-${slug}.svg`] = encoder.encode(
          dailyYearChartSvg(grid, primary),
        );
        entries[`tables/financial-form-${slug}.csv`] = encoder.encode(dailyYearCsv(grid));
      }
      if (dayFigures) {
        entries["tables/the-day.csv"] = encoder.encode(
          [
            "Measure,Value",
            `Villas occupied,${dayFigures.villasOccupied}`,
            `Villas free,${dayFigures.villasFree}`,
            `Occupancy %,${dayFigures.occupancy === null ? "" : (dayFigures.occupancy * 100).toFixed(1)}`,
            `Accommodation,${dayFigures.accommodation}`,
            `Food and beverage,${dayFigures.foodAndBeverage}`,
            `Extras,${dayFigures.extras}`,
            `Total,${dayFigures.total}`,
            `ADR,${dayFigures.adr ?? ""}`,
            `Reservations created,${dayFigures.created?.count ?? ""}`,
            `Reservations cancelled,${dayFigures.cancelled?.count ?? ""}`,
          ].join("\n"),
        );
      }

      const packPath = `${run.property_id}/${runId}/canva-pack-${asOf}.zip`;
      const zipped = zipSync(entries, { level: 6 });
      const packUpload = await admin.storage.from(BUCKET).upload(packPath, zipped, {
        contentType: "application/zip",
        upsert: true,
      });
      if (packUpload.error) return json({ error: packUpload.error.message }, 500);
      const packSigned = await admin.storage.from(BUCKET).createSignedUrl(packPath, 60 * 30);
      if (packSigned.error) return json({ error: packSigned.error.message }, 500);
      await logRunEvent(
        admin,
        runId,
        "draft_generated",
        "Canva asset pack built for the daily report",
        { path: packPath, years: packGrids.length },
        actorId,
      );
      return json({
        success: true,
        mode: "pack",
        path: packPath,
        url: packSigned.data.signedUrl,
      });
    }


    const { data: fileRows, error: filesError } = await admin
      .from("report_source_files")
      .select("id, storage_path, original_filename, detected_mapping")
      .eq("run_id", runId)
      .order("created_at", { ascending: true });
    if (filesError) return json({ error: filesError.message }, 500);
    const files = (fileRows ?? []) as FileRow[];
    if (!files.length) return json({ error: "This run has no uploaded files yet" }, 409);

    /* ── parse a batch ───────────────────────────────────────────── */

    if (mode === "parse_batch") {
      if (reset) {
        await admin
          .from("report_source_files")
          .update({ detected_mapping: null })
          .eq("run_id", runId);
        for (const file of files) file.detected_mapping = null;
      }

      await admin
        .from("report_runs")
        .update({
          status: "processing",
          processing_note: "Reading the day's exports",
          error_message: null,
        })
        .eq("id", runId);

      const outstanding = files.filter((file) => !storedDaily(file));
      let parsed = 0;

      for (const file of outstanding) {
        const filename = String(file.original_filename ?? "");
        const isPdf = /\.pdf$/i.test(filename);
        const running = isRunningWorkbook(filename);
        const heavy = !running && isDailyFile(filename);
        if (parsed >= FILES_PER_BATCH) continue;

        const notes: string[] = [];
        let entry: StoredDaily = { payload: { kind: "skipped" }, notes, ok: true, rows: 0 };

        if (running) {
          entry = {
            payload: { kind: "running_workbook" },
            notes: [`${filename}: the old running spreadsheet — not used, the report is built from stored figures`],
            ok: true,
            rows: 0,
          };
        } else if (!heavy) {
          notes.push(`${filename}: monthly export — not used by the daily report`);
        } else {
          // A file that kills the worker leaves no result behind, so the next
          // call would pick it first and die again. Count the attempt before
          // reading it and give up on it once it has had its chances.
          const attempts = Number((file.detected_mapping ?? {})["daily_attempts"] ?? 0) + 1;
          if (attempts > MAX_FILE_ATTEMPTS) {
            const failed: StoredDaily = {
              payload: { kind: "skipped" },
              notes: [`${filename}: too large to read here — skipped after ${MAX_FILE_ATTEMPTS} attempts`],
              ok: false,
              rows: 0,
            };
            await admin
              .from("report_source_files")
              .update({
                detected_mapping: { daily: failed, daily_attempts: attempts },
                parsed_ok: false,
                row_count: 0,
                parse_errors: failed.notes,
              })
              .eq("id", file.id);
            file.detected_mapping = { daily: failed, daily_attempts: attempts };
            parsed += 1;
            continue;
          }
          await admin
            .from("report_source_files")
            .update({ detected_mapping: { daily_attempts: attempts } })
            .eq("id", file.id);


          const download = await admin.storage.from(BUCKET).download(file.storage_path);
          if (download.error || !download.data) {
            entry = {
              payload: { kind: "skipped" },
              notes: [`${filename}: ${download.error?.message ?? "download failed"}`],
              ok: false,
              rows: 0,
            };
          } else {
            const buffer = await download.data.arrayBuffer();

            if (isPdf) {
              try {
                const text = await pdfText(buffer);
                // The team prints Hotel Status as a PDF as often as a spreadsheet,
                // so the same grid is read from either.
                if (isHouseStatePdfText(text.lines)) {
                  const parsed = parseHouseStatePdfText(text.lines, filename);
                  entry = parsed.days.length
                    ? {
                      payload: {
                        kind: "house_state",
                        days: parsed.days,
                        filter: parsed.filter,
                      },
                      notes: [...notes, ...parsed.errors, ...parsed.warnings],
                      ok: parsed.errors.length === 0,
                      rows: parsed.days.length,
                    }
                    : {
                      payload: { kind: "skipped" },
                      notes: [
                        ...notes,
                        ...parsed.errors,
                        `${filename}: Hotel Status print carried no day rows`,
                      ],
                      ok: false,
                      rows: 0,
                    };
                } else {
                  const movement = parseMovementPdf(text.flat);
                  if (movement.kind === "unknown") {
                    notes.push(`${filename}: not a created/cancelled reservations print — skipped`);
                  } else {
                    entry = {
                      payload: { kind: movement.kind, movement: movement.movement },
                      notes,
                      ok: true,
                      rows: movement.movement.count,
                    };
                  }
                }
              } catch (error) {

                entry = {
                  payload: { kind: "skipped" },
                  notes: [
                    `${filename}: unreadable PDF (${error instanceof Error ? error.message : "unknown"})`,
                  ],
                  ok: false,
                  rows: 0,
                };
              }
            } else if (/provisional|enquir|tentative|option/i.test(filename)) {
              try {
                const provisional = await parseProvisionalOoxml(buffer, filename);
                entry = provisional
                  ? {
                    payload: { kind: "provisional", months: provisional.months },
                    notes: [...provisional.errors, ...provisional.warnings],
                    ok: provisional.rowsRead > 0,
                    rows: provisional.rowsRead,
                  }
                  : {
                    payload: { kind: "skipped" },
                    notes: [`${filename}: no provisional-bookings sheet recognised — skipped`],
                    ok: false,
                    rows: 0,
                  };
              } catch (error) {
                entry = {
                  payload: { kind: "skipped" },
                  notes: [`${filename}: unreadable provisional workbook (${error instanceof Error ? error.message : "unknown"})`],
                  ok: false,
                  rows: 0,
                };
              }
            } else {
              // protel writes its OOXML parts in UTF-16; repair before reading.
              let workbook: XLSX.WorkBook | null = null;
              try {
                const repair = await repairWorkbookBuffer(buffer);
                workbook = XLSX.read(new Uint8Array(repair.buffer), { type: "array" });
              } catch (error) {
                entry = {
                  payload: { kind: "skipped" },
                  notes: [
                    `${filename}: unreadable workbook (${error instanceof Error ? error.message : "unknown"})`,
                  ],
                  ok: false,
                  rows: 0,
                };
              }

              if (workbook) {
                // Stop at the first recognised sheet — nothing else is needed.
                for (const name of workbook.SheetNames) {
                  // Recognise the sheet from its opening rows; only the matching
                  // sheet is converted in full.
                  const probe = toGrid(workbook, name, PROBE_ROWS);
                  const isHouseState = isHouseStateGrid(probe);
                  const isPipeline = !isHouseState && isPipelineGrid(probe);
                  const isCreated =
                    !isHouseState && !isPipeline && isReservationListGrid(probe);
                  const isVoided =
                    !isHouseState && !isPipeline && !isCreated && isVoidStatGrid(probe);
                  const isProvisional =
                    !isHouseState && !isPipeline && !isCreated && !isVoided &&
                    isProvisionalGrid(probe);
                  probe.length = 0;

                  if (isPipeline) {
                    // The tracker keeps enquiries, confirmations and losses on
                    // separate sheets — all three are read in one pass.
                    const roles: Partial<Record<PipelineRole, PipelineTotals>> = {};
                    const pipelineNotes: string[] = [];
                    let rows = 0;
                    for (const sheetName of workbook.SheetNames) {
                      const sheetGrid = toGrid(workbook, sheetName);
                      const result = parsePipelineGrid(sheetGrid, sheetName, filename);
                      sheetGrid.length = 0;
                      if (!result.rowsRead) {
                        pipelineNotes.push(...result.warnings);
                        continue;
                      }
                      const months: Record<string, { count: number; value: number }> = {};
                      for (const [month, bucket] of Object.entries(result.months)) {
                        months[month] = { count: bucket.count, value: bucket.value };
                      }
                      roles[result.role] = { count: result.count, value: result.value, months };
                      rows += result.rowsRead;
                      pipelineNotes.push(...result.warnings);
                    }
                    entry = {
                      payload: { kind: "pipeline", roles },
                      notes: pipelineNotes,
                      ok: rows > 0,
                      rows,
                    };
                    break;
                  }
                  if (!isHouseState && !isProvisional && !isCreated && !isVoided) continue;
                  const grid = toGrid(workbook, name);
                  if (isCreated) {
                    // The created print carries its own status split, so
                    // confirmed and provisional business stay apart.
                    const list = parseReservationList(grid, filename);
                    entry = {
                      payload: { kind: "created", movement: list.movement },
                      notes: list.warnings,
                      ok: list.rowsRead > 0,
                      rows: list.rowsRead,
                    };
                    break;
                  }
                  if (isVoided) {
                    const voided = parseVoidStat(grid, filename);
                    entry = {
                      payload: { kind: "cancelled", movement: voided.movement },
                      notes: voided.warnings,
                      ok: voided.rowsRead > 0,
                      rows: voided.rowsRead,
                    };
                    break;
                  }

                  if (isHouseState) {
                    const houseState = parseHouseState(grid, filename);
                    if (houseState.errors.length) {
                      entry = {
                        payload: { kind: "skipped" },
                        notes: houseState.errors,
                        ok: false,
                        rows: 0,
                      };
                    } else {
                      entry = {
                        payload: {
                          kind: "house_state",
                          days: houseState.days,
                          filter: houseState.filter,
                        },

                        notes: houseState.warnings,
                        ok: true,
                        rows: houseState.days.length,
                      };
                    }
                    break;
                  }
                  if (isProvisional) {
                    const provisional = parseProvisionalGrid(grid, filename);
                    entry = {
                      payload: { kind: "provisional", months: provisional.months },
                      notes: [...provisional.errors, ...provisional.warnings],
                      ok: true,
                      rows: provisional.rowsRead,
                    };
                    break;
                  }
                  grid.length = 0;
                }
                workbook = null;
                if (entry.payload.kind === "skipped" && !entry.notes.length) {
                  entry.notes.push(`${filename}: no daily grid recognised — skipped`);
                }
              }
            }
          }
        }

        await admin
          .from("report_source_files")
          .update({
            detected_mapping: { daily: entry },
            parsed_ok: entry.ok,
            row_count: entry.rows,
            parse_errors: entry.notes.length ? entry.notes : null,
          })
          .eq("id", file.id);
        file.detected_mapping = { daily: entry };
        parsed += 1;
      }

      const remaining = files.filter((file) => !storedDaily(file)).length;
      return json({
        success: true,
        mode: "parse_batch",
        parsed,
        remaining,
        total: files.length,
        read: files.length - remaining,
      });
    }

    /* ── build the day ───────────────────────────────────────────── */

    const outstanding = files.filter((file) => !storedDaily(file));
    if (outstanding.length) {
      return json(
        { error: `${outstanding.length} file(s) still need reading`, remaining: outstanding.length },
        409,
      );
    }

    const { data: settings } = await admin
      .from("property_report_settings")
      .select("room_count, brand_primary, brand_secondary, report_logo_url")
      .eq("property_id", run.property_id)
      .maybeSingle();

    const { data: extraInputs } = await admin
      .from("report_additional_inputs")
      .select("free_commentary")
      .eq("run_id", runId)
      .maybeSingle();
    const pasted = parsePastedEmail(extraInputs?.free_commentary ?? null);

    // A run often carries several House State prints, and a re-print of the
    // same month supersedes the earlier one. Keeping both would double the
    // month, and letting an empty print win would zero a day that was sold, so
    // each date is kept once: a row carrying figures beats an all-zero row, and
    // otherwise the most recently uploaded file wins.
    const dayByDate = new Map<string, ProtelDay>();
    const tentativeByDate = new Map<string, ProtelDay>();
    const supersededDates: string[] = [];
    const carriesFigures = (day: ProtelDay): boolean =>
      (day.roomsOccupied ?? 0) > 0 ||
      (day.accommodation ?? 0) > 0 ||
      (day.total ?? 0) > 0 ||
      (day.arrivalRooms ?? 0) > 0 ||
      (day.departureRooms ?? 0) > 0;
    // Confirmed and provisional prints are deduped inside their own set only,
    // so a provisional re-print can never displace the confirmed day.
    const keepDay = (day: ProtelDay, filter: HouseStateFilter): void => {
      const target = filter === "provisional" ? tentativeByDate : dayByDate;
      const existing = target.get(day.date);
      if (existing) {
        if (filter === "confirmed") supersededDates.push(day.date);
        if (carriesFigures(existing) && !carriesFigures(day)) return;
      }
      target.set(day.date, day);
    };


    const provisionalMonths: Record<string, { revenue: number; nights: number }> = {};
    const pipeline: Partial<Record<PipelineRole, PipelineTotals>> = {};
    let created: DailyMovement | null = null;
    let cancelled: DailyMovement | null = null;
    const results: Array<{ id: string; ok: boolean; rows: number; notes: string[] }> = [];

    for (const file of files) {
      const entry = storedDaily(file);
      if (!entry) continue;
      results.push({ id: file.id, ok: entry.ok, rows: entry.rows, notes: entry.notes ?? [] });
      const payload = entry.payload;
      if (payload.kind === "house_state") {
        for (const day of payload.days) keepDay(day, payload.filter ?? "confirmed");

      } else if (payload.kind === "provisional") {
        for (const [month, bucket] of Object.entries(payload.months ?? {})) {
          const target = provisionalMonths[month] ?? { revenue: 0, nights: 0 };
          target.revenue += bucket.revenue;
          target.nights += bucket.nights;
          provisionalMonths[month] = target;
        }
      } else if (payload.kind === "pipeline") {
        for (const [role, totals] of Object.entries(payload.roles ?? {})) {
          if (totals) pipeline[role as PipelineRole] = totals;
        }
      } else if (payload.kind === "created") {
        created = payload.movement;
      } else if (payload.kind === "cancelled") {
        cancelled = payload.movement;
      }
    }

    const days: ProtelDay[] = [...dayByDate.values()].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
    const tentativeDays: ProtelDay[] = [...tentativeByDate.values()].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
    const dayNotes = supersededDates.length
      ? [
        `${supersededDates.length} day(s) appear in more than one House State export — the print carrying figures was used`,
      ]
      : [];
    if (tentativeDays.length) {
      dayNotes.push(
        `${tentativeDays.length} day(s) read from provisional (optional / tentative) prints — reported apart from revenue on the books`,
      );
    }

    // Enquiries: the tracker's provisional sheet when the run carries it,
    // otherwise whatever a reservation-style provisional export gave.
    for (const [month, bucket] of Object.entries(pipeline.provisional?.months ?? {})) {
      if (provisionalMonths[month]) continue;
      provisionalMonths[month] = { revenue: bucket.value, nights: 0 };
    }

    // The exports always win; the pasted email only fills what they did not carry.
    if (!created && pasted.created) created = pasted.created;
    if (!cancelled && pasted.cancelled) cancelled = pasted.cancelled;

    // The tracker's own confirmed and cancellation sheets are the last fallback
    // for the movement line when the run carries no movement print at all.
    if (!created && pipeline.confirmed) {
      created = {
        count: pipeline.confirmed.count,
        value: pipeline.confirmed.value,
        nights: null,
        period: null,
        statuses: [],
      };
      dayNotes.push("Reservations created read from the tracker's confirmed sheet");
    }
    if (!cancelled && pipeline.cancelled) {
      cancelled = {
        count: pipeline.cancelled.count,
        value: pipeline.cancelled.value,
        nights: null,
        period: null,
        statuses: [],
      };
      dayNotes.push("Reservations cancelled read from the tracker's cancellations sheet");
    }

    const figures = buildDailyFigures({
      days,
      provisionalDays: tentativeDays,
      date: asOf,
      villaCount: settings?.room_count ?? null,
      provisionalMonths,
      created,
      cancelled,
    });


    if (!figures) {
      // Name the months the uploads did cover: the usual cause is that the
      // current month's print was left out of the export folder.
      const covered = [
        ...new Set([...days, ...tentativeDays].map((day) => day.date.slice(0, 7))),
      ].sort();
      const message = covered.length
        ? `No House State row for ${asOf} was found. The uploaded prints cover ${covered.join(", ")} — the print for ${asOf.slice(0, 7)} is missing.`
        : `No House State row for ${asOf} was found in the uploaded files`;
      await admin
        .from("report_runs")
        .update({ status: "failed", error_message: message, processing_note: null })
        .eq("id", runId);
      await logRunEvent(admin, runId, "processing_failed", message, { covered_months: covered }, actorId);
      return json({ error: message, files: results }, 422);
    }


    // One row per property + day: a rerun replaces the day it covers.
    const { error: upsertError } = await admin.from("report_daily_days").upsert(
      {
        property_id: run.property_id,
        run_id: runId,
        report_date: asOf,
        figures: figures as unknown as Record<string, unknown>,
      },
      { onConflict: "property_id,report_date" },
    );
    if (upsertError) return json({ error: upsertError.message }, 500);
    if (mode === "aggregate") {
      await admin
        .from("report_runs")
        .update({ status: "processing", processing_note: "Daily figures prepared", error_message: null })
        .eq("id", runId);
      return json({ success: true, mode: "aggregate", figures, files: results });
    }

    const { data: storedDays, error: daysError } = await admin
      .from("report_daily_days")
      .select("report_date, figures")
      .eq("property_id", run.property_id)
      .order("report_date", { ascending: true });
    if (daysError) return json({ error: daysError.message }, 500);

    const allFigures: DailyFigures[] = (storedDays ?? [])
      .map((row) => row.figures as unknown as DailyFigures)
      .filter((row) => row && typeof row.date === "string");

    /* ── the financial form ──────────────────────────────────────── */

    // The day's exports author revenue on the books and occupancy for every
    // month they cover. Budget, same time last year and last year come from the
    // one-time seed and are never written here.
    const buildNotes: string[] = [...dayNotes];
    const onBooks = monthlyOnBooks(days, settings?.room_count ?? null);
    // An export can cover a month without carrying any figures for it. Writing
    // that as zero would wipe a month that is sold, so a figureless month is
    // left exactly as it stands.
    const emptyMonths = Object.entries(onBooks)
      .filter(([, monthFigures]) => monthFigures.revenue <= 0 && monthFigures.nights <= 0)
      .map(([month]) => month);
    const monthUpserts = Object.entries(onBooks)
      .filter(([, monthFigures]) => monthFigures.revenue > 0 || monthFigures.nights > 0)
      .map(([month, monthFigures]) => ({
      property_id: run.property_id,
      fiscal_year_label: fiscalYearLabel(month),
      month: `${month}-01`,
      bob: monthFigures.revenue,
      occupancy: monthFigures.occupancy,
      source: "run",
      updated_at: new Date().toISOString(),
    }));
    if (monthUpserts.length) {
      const { error: monthsError } = await admin
        .from("report_comparison_months")
        .upsert(monthUpserts, { onConflict: "property_id,month" });
      if (monthsError) return json({ error: monthsError.message }, 500);
      buildNotes.push(
        `${monthUpserts.length} month(s) of revenue on the books updated from the day's exports`,
      );
    }
    if (emptyMonths.length) {
      buildNotes.push(
        `${emptyMonths.length} month(s) carried no figures in the day's exports and were left unchanged`,
      );
    }

    const { data: comparisonRows, error: comparisonError } = await admin
      .from("report_comparison_months")
      .select("month, bob, occupancy, budget, stly, stly_occupancy, last_year, last_year_occupancy")
      .eq("property_id", run.property_id)
      .order("month", { ascending: true });
    if (comparisonError) return json({ error: comparisonError.message }, 500);
    const yearGrids = buildYearGrids((comparisonRows ?? []) as ComparisonMonthRow[]);
    if (!yearGrids.length) {
      buildNotes.push(
        "No comparison figures are stored yet — import the consolidated workbook once in reporting settings",
      );
    }

    const report = buildDailyReportHtml({
      propertyName,
      figures,
      branding: {
        primary: settings?.brand_primary ?? "#1A1A2E",
        secondary: settings?.brand_secondary ?? "#1A1A2E",
        logoUrl: settings?.report_logo_url ?? null,
      },
      emailNotes: pasted.note,
      yearGrids,
    });
    const htmlPath = `${run.property_id}/${runId}/daily-detailed-${asOf}.html`;
    const htmlUpload = await admin.storage
      .from(BUCKET)
      .upload(htmlPath, new TextEncoder().encode(report.html), {
        contentType: "text/html; charset=utf-8",
        upsert: true,
      });
    if (htmlUpload.error) return json({ error: htmlUpload.error.message }, 500);

    await admin
      .from("report_runs")
      .update({
        status: "ready",
        processing_note: null,
        error_message: null,
        draft_report_path: htmlPath,
        draft_generated_at: new Date().toISOString(),
      })
      .eq("id", runId);

    await logRunEvent(
      admin,
      runId,
      "processing_succeeded",
      `Daily Detailed Report built for ${asOf}. ${buildNotes.join(" · ")}`,
      {
        days_parsed: days.length,
        pasted_email: Boolean(pasted.note),
        build_notes: buildNotes,
      },
      actorId,
    );

    const htmlSigned = await admin.storage.from(BUCKET).createSignedUrl(htmlPath, 60 * 30);

    return json({
      success: true,
      mode: "build",
      run_id: runId,
      date: asOf,
      figures,
      days_stored: allFigures.length,
      build_notes: buildNotes,
      pipeline,
      files: results,
      report_url: htmlSigned.data?.signedUrl ?? null,
      report_path: htmlPath,
      document_title: report.documentTitle,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (runId) {
      await admin
        .from("report_runs")
        .update({ status: "failed", error_message: message, processing_note: null })
        .eq("id", runId);
    }
    return json({ error: message }, 500);
  }
});
