/**
 * Reads a property's consolidated report workbook once and stores its
 * comparison figures — budget, same time last year and last year, with their
 * occupancies — as rows the printed report then builds from. The workbook is
 * never kept: only the figures are.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import * as XLSX from "npm:xlsx@0.18.5";
import { repairWorkbookBuffer } from "../_shared/xlsxRepair.ts";
import {
  fiscalYearLabel,
  readComparisonRowsFromGrid,
  type ComparisonMonthRow,
} from "../_shared/cheetaplains/comparisonGrid.ts";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

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

    // The panel posts the file; an operator rerun may instead name a workbook
    // already stored in the reports bucket.
    let propertyId = "";
    let buffer: ArrayBuffer | null = null;
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      propertyId = String(form.get("property_id") ?? "");
      const file = form.get("file");
      if (!(file instanceof File)) return json({ error: "A workbook file is required" }, 400);
      buffer = await file.arrayBuffer();
    } else {
      const body = await req.json().catch(() => ({}));
      propertyId = String(body?.property_id ?? "");
      const storagePath = String(body?.storage_path ?? "");
      if (!storagePath) return json({ error: "A workbook file is required" }, 400);
      const download = await admin.storage.from("revenue-reports").download(storagePath);
      if (download.error || !download.data) {
        return json({ error: download.error?.message ?? "workbook download failed" }, 404);
      }
      buffer = await download.data.arrayBuffer();
    }
    if (!propertyId) return json({ error: "property_id is required" }, 400);

    const repaired = await repairWorkbookBuffer(buffer);
    const workbook = XLSX.read(new Uint8Array(repaired.buffer), { type: "array" });

    // The consolidated workbook repeats the same financial form on every day
    // sheet; reading each sheet lets a figure cached on one sheet fill a cell
    // another sheet only holds as a formula.
    const merged = new Map<string, ComparisonMonthRow>();
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
        header: 1,
        blankrows: true,
        defval: null,
        raw: true,
      });
      for (const row of readComparisonRowsFromGrid(grid)) {
        const existing = merged.get(row.month);
        if (!existing) {
          merged.set(row.month, row);
          continue;
        }
        existing.bob ??= row.bob;
        existing.occupancy ??= row.occupancy;
        existing.budget ??= row.budget;
        existing.stly ??= row.stly;
        existing.stly_occupancy ??= row.stly_occupancy;
        existing.last_year ??= row.last_year;
        existing.last_year_occupancy ??= row.last_year_occupancy;
      }
      grid.length = 0;
    }

    const rows = [...merged.values()].sort((left, right) => left.month.localeCompare(right.month));
    if (!rows.length) {
      return json({ error: "No financial form was recognised in this workbook" }, 422);
    }

    // Revenue on the books is authored by the daily runs, so it is only seeded
    // for months that have no row yet.
    const { data: existingRows, error: existingError } = await admin
      .from("report_comparison_months")
      .select("month")
      .eq("property_id", propertyId);
    if (existingError) return json({ error: existingError.message }, 500);
    const known = new Set((existingRows ?? []).map((entry) => String(entry.month).slice(0, 10)));

    const payload = rows.map((row) => ({
      property_id: propertyId,
      fiscal_year_label: fiscalYearLabel(row.month.slice(0, 7)),
      month: row.month,
      budget: row.budget,
      stly: row.stly,
      stly_occupancy: row.stly_occupancy,
      last_year: row.last_year,
      last_year_occupancy: row.last_year_occupancy,
      source: "import",
      updated_at: new Date().toISOString(),
      ...(known.has(row.month) ? {} : { bob: row.bob, occupancy: row.occupancy }),
    }));

    const { error: upsertError } = await admin
      .from("report_comparison_months")
      .upsert(payload, { onConflict: "property_id,month" });
    if (upsertError) return json({ error: upsertError.message }, 500);

    const years = [...new Set(payload.map((entry) => entry.fiscal_year_label))].sort();
    return json({ success: true, months: payload.length, years });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
