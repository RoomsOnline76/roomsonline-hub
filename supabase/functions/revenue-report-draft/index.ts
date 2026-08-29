// Builds the branded, print-ready draft revenue report for a run, plus the
// optional Canva asset pack (chart SVGs, table CSVs, JSON manifest).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { zipSync, strToU8 } from "npm:fflate@0.8.2";
import { resolveComparisons } from "../_shared/reportComparisons.ts";
import { parseReportProfile, reportWindowOptions } from "../_shared/reportProfile.ts";
import { windowMonths } from "../_shared/reportWindow.ts";
import { loadStlySeries } from "../_shared/reportStly.ts";
import {
  buildDraftReport,
  type DraftSnapshot,
  type DraftMediaSlot,
} from "../_shared/revenueReportHtml.ts";
import {
  builtInSlotByKey,
  isBuiltInSlotKey,
  slotsForSource,
} from "../_shared/reportMediaSlots.ts";
import { logRunEvent } from "../_shared/reportRunEvents.ts";

const BUCKET = "revenue-reports";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const numberMap = (value: unknown): Record<string, number> => {
  if (!value || typeof value !== "object") return {};
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = Number(raw);
    if (Number.isFinite(n)) out[key] = n;
  }
  return out;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

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
    const action = body?.action === "pack" ? "pack" : "report";
    if (!runId) return json({ error: "run_id is required" }, 400);

    const { data: run, error: runError } = await admin
      .from("report_runs")
      .select(
        "id, property_id, as_of_date, report_month, previous_run_id, imported_baseline, title, cadence, source_type, page_order, properties(name)",
      )
      .eq("id", runId)
      .maybeSingle();
    if (runError) return json({ error: runError.message }, 500);
    if (!run) return json({ error: "Run not found" }, 404);


    const { data: snapshot, error: snapshotError } = await admin
      .from("report_snapshots")
      .select("*")
      .eq("run_id", runId)
      .maybeSingle();
    if (snapshotError) return json({ error: snapshotError.message }, 500);
    if (!snapshot) {
      return json({ error: "This run has no snapshot yet — process the files first." }, 409);
    }

    const { data: settings } = await admin
      .from("property_report_settings")
      .select(
        "room_count, report_logo_url, cover_artwork_url, brand_primary, brand_secondary, logo_invert, historical_baseline, report_profile",
      )
      .eq("property_id", run.property_id)
      .maybeSingle();

    const { data: inputs } = await admin
      .from("report_additional_inputs")
      .select(
        "dinner_by_month, room0_by_month, comp_rns_by_month, min_stay_notes, promotions_notes, rate_override_notes, free_commentary",
      )
      .eq("run_id", runId)
      .maybeSingle();

    // Pasted screenshots the revenue team captured, grouped into their slots.
    const { data: mediaRows } = await admin
      .from("report_media")
      .select("id, slot_key, storage_path, caption, section_title, sort_order")
      .eq("run_id", runId)
      .order("sort_order", { ascending: true });

    // Custom "additional slide" sections the reviewer created for this run.
    const { data: customSlotRows } = await admin
      .from("report_media_slots")
      .select("slot_key, section, title, layout, sort_order")
      .eq("run_id", runId)
      .order("sort_order", { ascending: true });


    // TOBI commentary the reviewer ticked for inclusion (edited wording wins).
    const { data: insightRow } = await admin
      .from("report_insights")
      .select("narrative, narrative_final, include_narrative, selections")
      .eq("run_id", runId)
      .maybeSingle();

    const tobiCommentary: { text: string; placement?: string }[] = [];
    if (insightRow) {
      const narrative = String(insightRow.narrative_final ?? insightRow.narrative ?? "").trim();
      if (insightRow.include_narrative !== false && narrative) {
        tobiCommentary.push({ text: narrative });
      }
      const selections = (insightRow.selections ?? {}) as Record<
        string,
        { include?: boolean; text?: string; placement?: string } | undefined
      >;
      for (const entry of Object.values(selections)) {
        const text = String(entry?.text ?? "").trim();
        if (entry?.include && text) {
          tobiCommentary.push({
            text,
            placement:
              typeof entry.placement === "string" && entry.placement !== "auto"
                ? entry.placement
                : undefined,
          });
        }
      }
    }


    // Slide organizer state: { order: string[], hidden: string[] } (a bare array
    // is accepted too, for runs saved before hiding existed).
    const rawOrder = (run as unknown as { page_order?: unknown }).page_order;
    const orderObject = (rawOrder && typeof rawOrder === "object" && !Array.isArray(rawOrder)
      ? rawOrder
      : {}) as { order?: unknown; hidden?: unknown };
    const stringList = (value: unknown): string[] =>
      Array.isArray(value) ? value.map((entry) => String(entry)).filter(Boolean) : [];
    const savedPageOrder = Array.isArray(rawOrder)
      ? stringList(rawOrder)
      : stringList(orderObject.order);
    const hiddenPages = stringList(orderObject.hidden);

    const mediaSlots: DraftMediaSlot[] = [];

    if (mediaRows && mediaRows.length > 0) {
      const paths = mediaRows.map((row) => String(row.storage_path));
      const { data: signed } = await admin.storage
        .from(BUCKET)
        .createSignedUrls(paths, 60 * 60 * 6);
      const urlByPath = new Map<string, string>();
      (signed ?? []).forEach((entry, index) => {
        if (entry?.signedUrl) urlByPath.set(paths[index], entry.signedUrl);
      });

      // Built-in slots follow the run's source type; a `report_media_slots` row
      // whose key matches a built-in slot renames that heading for this run.
      const slotRows = (customSlotRows ?? []).map((row) => ({
        key: String(row.slot_key),
        section: String(row.section ?? row.title ?? "Additional Slides"),
        title: String(row.title ?? "Additional slides"),
        hint: "",
        layout: (row.layout === "half" ? "half" : "full") as "half" | "full",
        explode: true,
      }));
      const overrides = new Map(
        slotRows.filter((row) => isBuiltInSlotKey(row.key)).map((row) => [row.key, row]),
      );

      const definitions = [
        ...slotsForSource((run as unknown as { source_type?: unknown }).source_type).map(
          (definition) => {
            const override = overrides.get(definition.key);
            if (!override) return definition;
            return {
              ...definition,
              section: override.section || definition.section,
              title: override.title || definition.title,
            };
          },
        ),
        ...slotRows.filter((row) => !isBuiltInSlotKey(row.key)),
      ];

      // Images captured under a slot that this source no longer lists still print.
      for (const row of mediaRows) {
        const key = String(row.slot_key);
        if (definitions.some((definition) => definition.key === key)) continue;
        const fallback = builtInSlotByKey(key);
        if (fallback) definitions.push(fallback);
      }

      for (const definition of definitions) {
        const images = mediaRows
          .filter((row) => row.slot_key === definition.key)
          .map((row) => ({
            id: String(row.id),
            url: urlByPath.get(String(row.storage_path)) ?? "",
            caption: row.caption ? String(row.caption) : null,
            sectionTitle: row.section_title ? String(row.section_title) : null,
          }))
          .filter((image) => image.url.length > 0);
        if (images.length === 0) continue;
        mediaSlots.push({
          key: definition.key,
          section: definition.section,
          title: definition.title,
          layout: definition.layout,
          explode: definition.explode === true,
          images,
        });
      }
    }



    let previousAsOf: string | null = null;

    if (run.previous_run_id) {
      const { data: prev } = await admin
        .from("report_runs")
        .select("as_of_date")
        .eq("id", run.previous_run_id)
        .maybeSingle();
      previousAsOf = prev?.as_of_date ? String(prev.as_of_date).slice(0, 10) : null;
    }

    const propertyName =
      (run as unknown as { properties?: { name?: string | null } }).properties?.name ??
      "Property";

    const draftSnapshot: DraftSnapshot = {
      months: Array.isArray(snapshot.months) ? (snapshot.months as string[]) : [],
      otb_revenue: numberMap(snapshot.otb_revenue),
      previous_otb_revenue: numberMap(snapshot.previous_otb_revenue),
      last_year_actual: numberMap(snapshot.last_year_actual),
      room_nights: numberMap(snapshot.room_nights),
      previous_room_nights: numberMap(snapshot.previous_room_nights),
      last_year_room_nights: numberMap(snapshot.last_year_room_nights),
      capacity_days: numberMap(snapshot.capacity_days),
      additional_revenue: numberMap(snapshot.additional_revenue),
      adr: numberMap(snapshot.adr),
      occupancy: numberMap(snapshot.occupancy),
      source_breakdown: (snapshot.source_breakdown ?? {}) as DraftSnapshot["source_breakdown"],
      room_count: Number(snapshot.room_count ?? settings?.room_count ?? 1) || 1,
      totals: (snapshot.totals ?? {}) as Record<string, number | undefined>,
      booking_trends: (snapshot.booking_trends ?? null) as DraftSnapshot["booking_trends"],
    };

    // The printed window (length and start month) can be widened per property.
    const reportProfile = parseReportProfile(
      (settings as { report_profile?: unknown } | null)?.report_profile ?? null,
    );
    const windowOptions = reportWindowOptions(reportProfile);
    const windowKeys = windowMonths(
      String(run.as_of_date).slice(0, 10),
      run.report_month ? String(run.report_month).slice(0, 7) : null,
      windowOptions,
    );

    // Same-time-last-year for profiles that compare against the pack we sent a
    // year ago rather than last year's actuals.
    const stlySeries = await loadStlySeries(admin as never, {
      propertyId: String(run.property_id),
      runId: String(run.id),
      asOfDate: String(run.as_of_date).slice(0, 10),
      months: windowKeys,
      snapshotStly: (snapshot as { stly?: unknown }).stly,
      importedBaseline: (run as { imported_baseline?: unknown }).imported_baseline ?? null,
    });

    const draft = buildDraftReport({
      propertyName,
      asOfDate: String(run.as_of_date).slice(0, 10),
      reportMonth: run.report_month ? String(run.report_month).slice(0, 7) : null,
      previousAsOfDate: previousAsOf,
      cadence: String(run.cadence ?? "bimonthly") === "monthly" ? "monthly" : "bimonthly",
      sourceType: (run as unknown as { source_type?: string | null }).source_type ?? null,
      branding: {
        logoUrl: settings?.report_logo_url ?? null,
        logoInvert: Boolean((settings as { logo_invert?: boolean } | null)?.logo_invert),
        coverArtworkUrl: settings?.cover_artwork_url ?? null,
        brandPrimary: settings?.brand_primary ?? null,
        brandSecondary: settings?.brand_secondary ?? null,
      },
      snapshot: draftSnapshot,
      inputs: {
        dinner_by_month: numberMap(inputs?.dinner_by_month),
        room0_by_month: numberMap(inputs?.room0_by_month),
        comp_rns_by_month: numberMap(inputs?.comp_rns_by_month),
        min_stay_notes: inputs?.min_stay_notes ?? null,
        promotions_notes: inputs?.promotions_notes ?? null,
        rate_override_notes: inputs?.rate_override_notes ?? null,
        free_commentary: inputs?.free_commentary ?? null,
      },
      media: mediaSlots,
      tobiCommentary,
      windowOptions,
      comparisons: resolveComparisons(
        (settings as { report_profile?: unknown } | null)?.report_profile ?? null,
        {
          months: windowKeys,
          actualsByYear: (snapshot as { actuals_by_year?: unknown }).actuals_by_year,
          stly: stlySeries.source === "none" ? undefined : stlySeries,
          stlyAsOfDate: stlySeries.asOfDate,
          importedBaseline: (run as { imported_baseline?: unknown }).imported_baseline ?? null,
          historicalBaseline:
            (settings as { historical_baseline?: unknown } | null)?.historical_baseline ?? null,
          capacityDays: draftSnapshot.capacity_days,
          roomCount: draftSnapshot.room_count,
          lastYear: {
            revenue: draftSnapshot.last_year_actual,
            room_nights: draftSnapshot.last_year_room_nights,
          },
        },
      ),
      pageOrder: savedPageOrder,
      hiddenPages: hiddenPages,
    });


    const asOf = String(run.as_of_date).slice(0, 10);

    if (action === "pack") {
      const files: Record<string, Uint8Array> = {
        "manifest.json": strToU8(JSON.stringify(draft.manifest, null, 2)),
        "README.txt": strToU8(
          [
            `${propertyName} — Revenue Review asset pack`,
            `As at ${asOf}`,
            "",
            "charts/  vector SVGs — import straight into Canva, colours stay editable",
            "tables/  CSV per table — paste into a Canva table or a sheet",
            "manifest.json  every number used in the draft report",
          ].join("\n"),
        ),
      };
      for (const chart of draft.charts) {
        files[`charts/${chart.id}.svg`] = strToU8(chart.svg);
      }
      for (const table of draft.tables) {
        files[`tables/${table.name}.csv`] = strToU8(table.csv);
      }
      const zipped = zipSync(files, { level: 6 });
      const packPath = `${run.property_id}/${runId}/canva-pack-${asOf}.zip`;
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
        "Canva asset pack built",
        { path: packPath, charts: draft.charts.length, tables: draft.tables.length },
        userData.user.id,
      );
      return json({
        success: true,
        path: packPath,
        url: packSigned.data.signedUrl,
        charts: draft.charts.length,
        tables: draft.tables.length,
      });
    }

    const path = `${run.property_id}/${runId}/draft-report-${asOf}.html`;
    const upload = await admin.storage.from(BUCKET).upload(path, strToU8(draft.html), {
      contentType: "text/html; charset=utf-8",
      upsert: true,
    });
    if (upload.error) return json({ error: upload.error.message }, 500);

    await admin
      .from("report_runs")
      .update({ draft_report_path: path, draft_generated_at: new Date().toISOString() })
      .eq("id", runId);

    const signed = await admin.storage.from(BUCKET).createSignedUrl(path, 60 * 60);
    if (signed.error) return json({ error: signed.error.message }, 500);

    await logRunEvent(
      admin,
      runId,
      "draft_generated",
      "Draft visual report generated",
      { path, charts: draft.charts.length },
      userData.user.id,
    );

    return json({
      success: true,
      path,
      url: signed.data.signedUrl,
      charts: draft.charts.map((chart) => ({ id: chart.id, title: chart.title })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Draft report generation failed";
    console.error("revenue-report-draft failed:", message);
    return json({ error: message }, 500);
  }
});
