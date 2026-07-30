// Rentals United Certification Portal
// Admin-only harness that exercises every mandatory / optional RU endpoint,
// captures request + response evidence, scores refresh-cadence compliance, and
// reports White-Label minimum-inventory readiness per property.
//
// Actions:
//   list_runs        → recent ru_cert_runs
//   get_run          → single run with full step evidence
//   run_suite        → execute a suite ("read_only" | "mandatory" | "discounts" | "full")
//   compliance       → refresh cadence panel data (from ru_sync_runs)
//   wl_readiness     → per-property White-Label minimum inventory report
//   user_management  → status of RU sub-user management (parked)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { summarizeReadiness, type RuCheck, type RuUnitInput } from "../_shared/ruReadiness.ts";
import { evaluatePhases, findOwnerAccount, resolvePortfolioId } from "../_shared/ruPhaseGate.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type StepStatus = "passed" | "failed" | "skipped";

interface CertStep {
  step: number;
  name: string;
  ru_method: string;
  mandatory: boolean;
  status: StepStatus;
  duration_ms: number;
  ru_status_id?: string | null;
  detail?: string;
  request?: unknown;
  response_preview?: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isoDate(offsetDays: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offsetDays);
  return d.toISOString().slice(0, 10);
}

function preview(value: unknown, max = 4000): string | null {
  if (value == null) return null;
  const s = typeof value === "string" ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}\n… [truncated ${s.length - max} chars]` : s;
}

/**
 * RU requires at least one LocationId when creating a sub-user.
 * Resolve it from: cached pms_mappings geo metadata → live coordinate lookup →
 * ru_locations city/country name match, across the owner's properties.
 */
async function resolveOwnerLocationIds(
  admin: ReturnType<typeof createClient>,
  propertyId: string | null,
  portfolioId: string | null,
): Promise<number[]> {
  const ids = new Set<number>();

  let propertyIds: string[] = [];
  if (portfolioId) {
    const { data: members } = await admin
      .from("property_portfolio_members")
      .select("property_id")
      .eq("portfolio_id", portfolioId);
    propertyIds = ((members ?? []) as Array<{ property_id: string }>).map((m) => m.property_id);
    if (propertyId && !propertyIds.includes(propertyId)) propertyIds.push(propertyId);
  } else if (propertyId) {
    propertyIds = [propertyId];
  }
  if (propertyIds.length === 0) return [];

  const { data: props } = await admin
    .from("properties")
    .select("id, city, country, latitude, longitude")
    .in("id", propertyIds);

  const properties = (props ?? []) as Array<{
    id: string; city: string | null; country: string | null; latitude: number | null; longitude: number | null;
  }>;
  if (properties.length === 0) return [];

  // 1. Cached geo mapping
  const { data: mappings } = await admin
    .from("pms_mappings")
    .select("metadata, property_id")
    .in("property_id", properties.map((p) => p.id))
    .eq("system_type", "rentals_united")
    .eq("mapping_type", "field_mappings")
    .eq("external_id", "__property__");
  for (const m of (mappings ?? []) as Array<{ metadata: Record<string, unknown> | null }>) {
    const id = Number((m.metadata as Record<string, unknown> | null)?.ru_location_id);
    if (Number.isFinite(id) && id > 1) ids.add(id);
  }
  if (ids.size > 0) return [...ids];

  // 2. Live coordinate lookup via the RU API
  for (const p of properties) {
    if (p.latitude == null || p.longitude == null) continue;
    const { data } = await admin.functions.invoke("rentalsunited-api", {
      body: { action: "get_location_by_coordinates", metadata: { latitude: p.latitude, longitude: p.longitude } },
    });

    const id = Number(data?.location_id);
    if (Number.isFinite(id) && id > 1) {
      ids.add(id);
      break;
    }
  }
  if (ids.size > 0) return [...ids];

  // 3. ru_locations cache by city name
  for (const p of properties) {
    if (!p.city) continue;
    const { data: loc } = await admin
      .from("ru_locations")
      .select("id")
      .ilike("name", p.city)
      .limit(1)
      .maybeSingle();
    const id = Number((loc as { id?: number } | null)?.id);
    if (Number.isFinite(id) && id > 1) {
      ids.add(id);
      break;
    }
  }
  if (ids.size > 0) return [...ids];

  // 4. Live RU lookup by city / country name (cache is often empty on fresh accounts)
  for (const p of properties) {
    for (const name of [p.city, p.country]) {
      if (!name) continue;
      const { data } = await admin.functions.invoke("rentalsunited-api", {
        body: { action: "get_location_by_name", location_name: name },
      });
      const id = Number(data?.location_id ?? data?.location?.id);
      if (Number.isFinite(id) && id > 1) {
        ids.add(id);
        break;
      }
    }
    if (ids.size > 0) break;
  }
  return [...ids];
}




// ── RU method catalogue ───────────────────────────────────────
const RU_METHOD_BY_ACTION: Record<string, string> = {
  health_check: "Pull_ListProp_RQ (health)",
  list_properties: "Pull_ListProp_RQ",
  get_property: "Pull_GetProperty_RQ",
  get_availability: "Pull_ListPropertyAvailabilityCalendar_RQ",
  get_prices: "Pull_ListPropertyPrices_RQ",
  list_reservations: "Pull_ListReservations_RQ",
  get_leads: "Pull_GetLeads_RQ",
  list_buildings: "Pull_ListOwnerBuildings_RQ",
  list_composition_rooms: "Pull_ListCompositionRooms_RQ",
  list_cities_and_currencies: "Pull_ListCurrencies_RQ",
  get_location_by_coordinates: "Pull_GetLocationByCoordinates_RQ",
  push_property: "Push_PutProperty_RQ",
  push_availability: "Push_PutAvbUnits_RQ",
  push_prices: "Push_PutPrices_RQ",
  subscribe_notifications: "LNM_PutHandlerUrl_RQ",
  push_long_stay_discounts: "Push_PutLongStayDiscounts_RQ",
  push_last_minute_discounts: "Push_PutLastMinuteDiscounts_RQ",
  get_long_stay_discounts: "Pull_ListLongStayDiscounts_RQ",
  get_last_minute_discounts: "Pull_ListLastMinuteDiscounts_RQ",
  list_users: "Pull_ListMyUsers_RQ",
};

// Core functional certification milestones exercised on the RU certification call.
const CERT_MILESTONES: { key: string; label: string; ru_method: string; mandatory: boolean; note: string }[] = [
  { key: "auth", label: "Connectivity / auth", ru_method: "Pull_ListProp_RQ (health)", mandatory: true, note: "AccessKey + SecretKey working" },
  { key: "list_properties", label: "List properties", ru_method: "Pull_ListProp_RQ", mandatory: true, note: "Pull_ListOwnerProp_RQ equivalent" },
  { key: "get_property", label: "Get property content", ru_method: "Pull_GetProperty_RQ", mandatory: true, note: "Read-back verification (Pull_ListSpecProp_RQ)" },
  { key: "get_availability", label: "Get availability (365d)", ru_method: "Pull_ListPropertyAvailabilityCalendar_RQ", mandatory: true, note: "" },
  { key: "get_prices", label: "Get prices (365d)", ru_method: "Pull_ListPropertyPrices_RQ", mandatory: true, note: "" },
  { key: "push_property", label: "Push property content", ru_method: "Push_PutProperty_RQ", mandatory: true, note: "Create + update" },
  { key: "push_availability", label: "Push availability", ru_method: "Push_PutAvbUnits_RQ", mandatory: true, note: "" },
  { key: "push_prices", label: "Push prices", ru_method: "Push_PutPrices_RQ", mandatory: true, note: "" },
  { key: "rlnm", label: "Subscribe RLNM handler", ru_method: "LNM_PutHandlerUrl_RQ", mandatory: true, note: "Live notifications" },
  { key: "reservations", label: "Pull reservations", ru_method: "Pull_ListReservations_RQ", mandatory: true, note: "" },
  { key: "leads", label: "Pull leads", ru_method: "Pull_GetLeads_RQ", mandatory: false, note: "Optional" },
  { key: "long_stay", label: "Long-stay discounts", ru_method: "Push_PutLongStayDiscounts_RQ", mandatory: false, note: "Optional but recommended" },
  { key: "last_minute", label: "Last-minute discounts", ru_method: "Push_PutLastMinuteDiscounts_RQ", mandatory: false, note: "Optional but recommended" },
];


// Refresh cadences mandated by RU (hours)
const CADENCE_RULES = [
  { key: "PutProperty", label: "Property content refresh", ru_method: "Push_PutProperty_RQ", max_age_hours: 168, actions: ["weekly_content_refresh", "PutProperty", "push_property"] },
  { key: "PutAvbUnits", label: "Availability refresh", ru_method: "Push_PutAvbUnits_RQ", max_age_hours: 24, actions: ["refresh_ari", "PutAvbUnits", "push_availability"] },
  { key: "PutPrices", label: "Pricing refresh", ru_method: "Push_PutPrices_RQ", max_age_hours: 24, actions: ["refresh_ari", "PutPrices", "push_prices"] },
  { key: "ListReservations", label: "Reservation pull", ru_method: "Pull_ListReservations_RQ", max_age_hours: 1, actions: ["pull_reservations", "ListReservations"] },
  { key: "PutHandlerUrl", label: "RLNM handler subscription", ru_method: "LNM_PutHandlerUrl_RQ", max_age_hours: 24, actions: ["weekly_content_refresh", "PutHandlerUrl", "RLNM"] },
];

// pg_cron jobs that must exist for RU cadence compliance
const EXPECTED_JOBS = [
  { jobname: "ru-content-weekly", schedule: "0 2 * * 1", fn: "cron-push-all-properties-to-ru", label: "Weekly property content push" },
  { jobname: "ru-ari-refresh", schedule: "0 */6 * * *", fn: "cron-refresh-ru-ari", label: "ARI refresh (every 6h)" },
  { jobname: "ru-reservations-poll", schedule: "*/30 * * * *", fn: "cron-pull-ru-reservations", label: "Reservation poll (every 30 min)" },
  { jobname: "ru-rlnm-daily", schedule: "0 1 * * *", fn: "cron-ru-rlnm-refresh", label: "RLNM handler re-subscribe (daily)" },
];

const RUNNABLE_JOBS = new Set(EXPECTED_JOBS.map((j) => j.fn));


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    // ── Auth: admin / dev / fearless_leader only ──
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing Authorization header" } }, 401);

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid session" } }, 401);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const allowed = (roles ?? []).some((r: { role: string }) => ["admin", "dev", "fearless_leader"].includes(r.role));

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "";

    // Property-scoped users (ROLOS owners / staff) may read the readiness
    // scorecard for a property they can access — everything else is admin-only.
    if (!allowed) {
      if (!["property_readiness", "phase_status"].includes(action) || !body.property_id) {
        return json({ success: false, error: { code: "FORBIDDEN", message: "Admin access required" } }, 403);
      }
      const { data: canAccess } = await userClient.rpc("can_access_property", {
        _property_id: body.property_id,
        _user_id: user.id,
      });
      if (canAccess !== true) {
        return json({ success: false, error: { code: "FORBIDDEN", message: "No access to this property" } }, 403);
      }
    }

    // ── milestones: certification matrix built from the most recent runs ──
    if (action === "milestones") {
      const { data: runs } = await admin
        .from("ru_cert_runs")
        .select("id, started_at, suite, steps")
        .order("started_at", { ascending: false })
        .limit(25);

      type StepRow = { name: string; ru_method: string; status: StepStatus; ru_status_id?: string | null; detail?: string };
      const latestByMethod = new Map<string, { step: StepRow; run_id: string; at: string }>();
      for (const run of (runs ?? []) as { id: string; started_at: string; steps: StepRow[] }[]) {
        for (const step of run.steps ?? []) {
          const key = step.ru_method;
          if (!latestByMethod.has(key)) latestByMethod.set(key, { step, run_id: run.id, at: run.started_at });
        }
      }

      const milestones = CERT_MILESTONES.map((m) => {
        const hit = latestByMethod.get(m.ru_method);
        const statusId = hit?.step.ru_status_id ?? null;
        const partial = String(statusId ?? "") === "5";
        return {
          ...m,
          status: hit ? (hit.step.status as StepStatus) : ("never_run" as const),
          partial_success: partial,
          ru_status_id: statusId,
          detail: hit?.step.detail ?? null,
          last_run_at: hit?.at ?? null,
          run_id: hit?.run_id ?? null,
        };
      });

      const mandatory = milestones.filter((m) => m.mandatory);
      return json({
        success: true,
        milestones,
        summary: {
          mandatory_total: mandatory.length,
          mandatory_passed: mandatory.filter((m) => m.status === "passed" && !m.partial_success).length,
          partial: milestones.filter((m) => m.partial_success).length,
          never_run: milestones.filter((m) => m.status === "never_run").length,
        },
      });
    }

    // ── evidence: printable / downloadable bundle for the RU certification call ──
    if (action === "evidence") {
      const { data: run, error } = await admin
        .from("ru_cert_runs")
        .select("*")
        .eq("id", body.run_id)
        .maybeSingle();
      if (error) throw error;
      if (!run) return json({ success: false, error: { code: "NOT_FOUND", message: "Run not found" } }, 404);

      return json({
        success: true,
        evidence: {
          generated_at: new Date().toISOString(),
          integration: "Rentals United — XML API (AccessKey / SecretKey)",
          run: {
            id: run.id,
            suite: run.suite,
            status: run.status,
            started_at: run.started_at,
            finished_at: run.finished_at,
            passed: run.passed,
            failed: run.failed,
            total: run.total,
            property_id: run.property_id,
            ru_property_id: run.ru_property_id,
          },
          steps: run.steps,
          cadence_rules: CADENCE_RULES,
          expected_jobs: EXPECTED_JOBS,
        },
      });
    }


    // ── list_runs ──
    if (action === "list_runs") {
      const { data, error } = await admin
        .from("ru_cert_runs")
        .select("id, started_at, finished_at, status, suite, property_id, ru_property_id, passed, failed, total")
        .order("started_at", { ascending: false })
        .limit(25);
      if (error) throw error;
      return json({ success: true, runs: data ?? [] });
    }

    // ── get_run ──
    if (action === "get_run") {
      const { data, error } = await admin.from("ru_cert_runs").select("*").eq("id", body.run_id).maybeSingle();
      if (error) throw error;
      return json({ success: true, run: data });
    }

    // ── compliance ──
    if (action === "compliance") {
      const since = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
      const { data: runs } = await admin
        .from("ru_sync_runs")
        .select("action, success, created_at")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(2000);

      const rules = CADENCE_RULES.map((rule) => {
        const match = (runs ?? []).find(
          (r: { action: string; success: boolean }) => rule.actions.includes(r.action) && r.success,
        ) as { created_at: string } | undefined;
        const lastRunAt = match?.created_at ?? null;
        const ageHours = lastRunAt ? (Date.now() - new Date(lastRunAt).getTime()) / 3600000 : null;
        let state: "green" | "amber" | "red" = "red";
        if (ageHours != null) {
          if (ageHours <= rule.max_age_hours) state = "green";
          else if (ageHours <= rule.max_age_hours * 1.5) state = "amber";
        }
        return {
          key: rule.key,
          label: rule.label,
          ru_method: rule.ru_method,
          max_age_hours: rule.max_age_hours,
          last_run_at: lastRunAt,
          age_hours: ageHours == null ? null : Math.round(ageHours * 10) / 10,
          next_due_at: lastRunAt ? new Date(new Date(lastRunAt).getTime() + rule.max_age_hours * 3600000).toISOString() : null,
          state,
        };
      });

      // Scheduled job inventory (pg_cron) — proves the cadence is automated, not manual
      const { data: jobs } = await userClient.rpc("get_ru_cron_jobs");

      return json({ success: true, rules, jobs: jobs ?? [], expected_jobs: EXPECTED_JOBS });
    }

    // ── wl_readiness ──
    // ── run_job: manually satisfy an overdue cadence ──
    if (action === "run_job") {
      const fn: string = body.function_name ?? "";
      if (!RUNNABLE_JOBS.has(fn)) {
        return json({ success: false, error: { code: "BAD_JOB", message: `Unknown job: ${fn}` } }, 400);
      }
      const t0 = Date.now();
      const { data, error } = await admin.functions.invoke(fn, { body: { manual: true } });
      if (error) return json({ success: false, error: { code: "JOB_FAILED", message: error.message } }, 502);
      return json({ success: true, function_name: fn, duration_ms: Date.now() - t0, result: data });
    }

    // Shared per-property readiness scorer (dry run + live 365-day ARI probe).
    const scoreProperty = async (p: {
      id: string;
      name: string;
      rentalsunited_property_id?: string | null;
    }, opts: { probe_ari?: boolean } = {}) => {
      const { data, error } = await admin.functions.invoke("push-property-to-ru", {
        body: { property_id: p.id, dry_run: true },
      });
      if (error) {
        return {
          property_id: p.id,
          name: p.name,
          ok: false,
          blocked: true,
          error: error.message,
          gaps: ["Dry run failed — Rentals United payload could not be built"],
          checks: [],
          groups: [],
          score: 0,
          checks_total: 0,
          checks_passed: 0,
        };
      }

      const units: RuUnitInput[] = data?.units ?? [
        { name: p.name, validation: data?.validation ?? {} },
      ];

      // ── Live ARI verification (365 days forward) ──
      const extraChecks: RuCheck[] = [];
      let ari: Record<string, unknown> | null = null;

      const ruIds: number[] = (data?.units ?? [])
        .map((u: { ru_property_id: string | null }) => Number(u.ru_property_id))
        .filter((n: number) => Number.isFinite(n) && n > 0);
      const singleRuId = Number(p.rentalsunited_property_id ?? data?.ru_property_id ?? 0);
      if (ruIds.length === 0 && singleRuId > 0) ruIds.push(singleRuId);

      if (opts.probe_ari === false) {
        // ARI not probed in this context — omit the checks entirely.
      } else if (ruIds.length > 0) {
        const target = ruIds[0];
        const from = isoDate(0);
        const to = isoDate(365);
        const [avbRes, priceRes] = await Promise.all([
          admin.functions.invoke("rentalsunited-api", {
            body: { action: "get_availability", ru_property_id: target, date_from: from, date_to: to },
          }),
          admin.functions.invoke("rentalsunited-api", {
            body: { action: "get_prices", ru_property_id: target, date_from: from, date_to: to },
          }),
        ]);
        const avbXml: string = avbRes.data?.raw_xml ?? "";
        const priceXml: string = priceRes.data?.raw_xml ?? "";
        const openDays = (avbXml.match(/>\s*[1-9]\d*\s*</g) ?? []).length;
        const prices = Array.from(priceXml.matchAll(/Price="([\d.]+)"/g)).map((m) => Number(m[1]));
        const hasAvailability = !!avbRes.data?.success && openDays > 0;
        const allPricesPositive = prices.length > 0 && prices.every((n) => n > 0);

        extraChecks.push({
          key: "ari_availability",
          group: "Availability 365d",
          label: "Availability pushed for the next 365 days",
          mandatory: true,
          passed: hasAvailability,
          ...(hasAvailability ? {} : { detail: `RU ${target}: no open availability day in the next 365 days` }),
          fix_hint: "Rate Manager → Calendar / availability",
        });
        extraChecks.push({
          key: "ari_prices",
          group: "Pricing 365d",
          label: "Daily prices pushed for the next 365 days",
          mandatory: true,
          passed: allPricesPositive,
          ...(allPricesPositive ? {} : { detail: `RU ${target}: prices missing or not all above zero for the next 365 days` }),
          fix_hint: "Rate Manager → Rates",
        });

        ari = {
          ru_property_id: target,
          date_from: from,
          date_to: to,
          open_days: openDays,
          price_points: prices.length,
          availability_ok: hasAvailability,
          prices_ok: allPricesPositive,
        };
      } else {
        const detail = "Not yet published to Rentals United (no RU property ID) — ARI cannot be verified";
        extraChecks.push({
          key: "ari_availability", group: "Availability 365d", label: "Availability pushed for the next 365 days",
          mandatory: true, passed: false, detail, fix_hint: "Push the property to Rentals United first",
        });
        extraChecks.push({
          key: "ari_prices", group: "Pricing 365d", label: "Daily prices pushed for the next 365 days",
          mandatory: true, passed: false, detail, fix_hint: "Push the property to Rentals United first",
        });
      }

      const summary = summarizeReadiness(units, extraChecks);

      return {
        property_id: p.id,
        name: p.name,
        ru_property_id: p.rentalsunited_property_id ?? null,
        multi_unit: !!data?.multi_unit,
        unit_count: units.length,
        ok: summary.gaps.length === 0,
        blocked: summary.blocked,
        gaps: summary.gaps,
        checks: summary.checks,
        groups: summary.groups,
        checks_total: summary.checks_total,
        checks_passed: summary.checks_passed,
        mandatory_total: summary.mandatory_total,
        mandatory_passed: summary.mandatory_passed,
        score: summary.score,
        ari,
      };
    };

    // ── property_readiness: single-property scorecard (ROLOS + admin) ──
    if (action === "property_readiness") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }
      const { data: prop } = await admin
        .from("properties")
        .select("id, name, rentalsunited_property_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
      }
      const report = await scoreProperty(prop, { probe_ari: body.probe_ari !== false });
      return json({ success: true, property: report });
    }

    if (action === "wl_readiness") {
      const { data: props } = await admin
        .from("properties")
        .select("id, name, ru_push_enabled, rentalsunited_property_id, external_system")
        .eq("is_active", true)
        .order("name");

      const candidates = (props ?? []).filter(
        (p: { ru_push_enabled: boolean | null }) => p.ru_push_enabled === true,
      );

      const results: unknown[] = [];
      for (const p of candidates) {
        results.push(await scoreProperty(p));
      }

      return json({ success: true, properties: results });
    }


    // ── Phase 5: RU user management (parked behind a single switch) ──
    const readUserMgmtFlag = async (): Promise<{ enabled: boolean; note: string; updated_at?: string | null }> => {
      const { data } = await admin
        .from("ru_platform_settings")
        .select("value, updated_at")
        .eq("key", "user_management")
        .maybeSingle();
      const v = (data?.value ?? {}) as { enabled?: boolean; note?: string };
      return {
        enabled: v.enabled === true,
        note: v.note ?? "Parked — awaiting Rentals United confirmation of the ROLOS PMS profile.",
        updated_at: data?.updated_at ?? null,
      };
    };

    if (action === "user_management") {
      const flag = await readUserMgmtFlag();
      const { data, error } = await admin.functions.invoke("rentalsunited-api", { body: { action: "list_users" } });
      const probeOk = !error && !!data?.success;
      return json({
        success: true,
        enabled: flag.enabled,
        note: flag.note,
        updated_at: flag.updated_at,
        guest_communication: "Out of scope — Guest Communication API is not implemented.",
        endpoints: [
          { action: "list_users", ru_method: "Pull_ListMyUsers_RQ", implemented: true, gated: false, status: probeOk ? "reachable" : "unverified" },
          { action: "create_user", ru_method: "Push_CreateUser_RQ", implemented: true, gated: true, status: flag.enabled ? "enabled" : "disabled" },
          { action: "fill_company_details", ru_method: "Push_FillCompanyDetails_RQ", implemented: true, gated: true, status: flag.enabled ? "enabled" : "disabled" },
        ],
        users: data?.users ?? [],
        probe: error ? { ok: false, error: error.message } : { ok: probeOk, preview: preview(data, 1500) },
      });
    }

    // ── set_user_management: the one switch that unparks Phase 5 ──
    if (action === "set_user_management") {
      const enabled = body.enabled === true;
      const note = typeof body.note === "string" && body.note.trim()
        ? body.note.trim()
        : enabled
          ? "Enabled — Rentals United confirmed the ROLOS PMS profile; sub-user creation is live."
          : "Parked — awaiting Rentals United confirmation of the ROLOS PMS profile.";
      const { error } = await admin
        .from("ru_platform_settings")
        .upsert({ key: "user_management", value: { enabled, note }, updated_by: user.id, updated_at: new Date().toISOString() }, { onConflict: "key" });
      if (error) return json({ success: false, error: { code: "SAVE_FAILED", message: error.message } }, 500);
      return json({ success: true, enabled, note });
    }

    // ── create_user / fill_company_details: only run when the switch is on ──
    if (action === "create_user" || action === "fill_company_details") {
      const flag = await readUserMgmtFlag();
      if (!flag.enabled) {
        return json({
          success: false,
          error: { code: "USER_MGMT_DISABLED", message: "RU user management is parked. Enable it on the Users tab once Rentals United confirms the PMS profile." },
        }, 409);
      }
      const payload = action === "create_user"
        ? { action: "create_user", user: body.user }
        : { action: "fill_company_details", ru_property_id: body.ru_property_id, company: body.company };
      const { data, error } = await admin.functions.invoke("rentalsunited-api", { body: payload });
      if (error) return json({ success: false, error: { code: "RU_CALL_FAILED", message: error.message } }, 502);

      if (action === "fill_company_details" && data?.success) {
        const match = admin.from("ru_owner_accounts").update({
          company_details_sent: true,
          company_filled_at: new Date().toISOString(),
          company_payload: body.company ?? null,
        });
        if (body.account_id) await match.eq("id", body.account_id);
        else await match.eq("ru_user_id", String(body.ru_property_id));
      }

      return json({ success: !!data?.success, result: data, preview: preview(data, 2000) });
    }

    // ── phase_status: 4-phase onboarding gate for one property ──
    if (action === "phase_status") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      const { data: prop } = await admin
        .from("properties")
        .select("id, name, owner_email, external_system, rentalsunited_property_id, rentalsunited_building_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);

      let readiness: Record<string, unknown> | null = null;
      let gaps: string[] = [];
      let readinessUnknown = false;
      try {
        readiness = await scoreProperty(prop as any, { probe_ari: body.probe_ari === true }) as any;
        gaps = ((readiness as any)?.gaps ?? []) as string[];
      } catch (_e) {
        readinessUnknown = true;
      }

      const gate = await evaluatePhases(admin, prop as any, { readinessGaps: gaps, readinessUnknown });
      const { data: mcq } = await admin
        .from("ru_mcq_orders")
        .select("id, ordered_at, status, ru_status_id")
        .eq("property_id", propertyId)
        .order("ordered_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      return json({ success: true, gate, readiness, last_mcq: mcq ?? null });
    }

    // ── ensure_owner_account: Phase 1 sub-user (portfolio-first) ──
    if (action === "ensure_owner_account") {
      const propertyId: string | null = body.property_id ?? null;
      let portfolioId: string | null = body.portfolio_id ?? null;
      if (!propertyId && !portfolioId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id or portfolio_id is required" } }, 400);
      }

      const flag = await readUserMgmtFlag();
      if (!flag.enabled) {
        return json({
          success: false,
          error: { code: "USER_MGMT_DISABLED", message: "RU user management is parked. Enable it on the Users tab first." },
        }, 409);
      }

      let ownerEmail: string | null = body.owner_email ?? null;
      let ownerName: string = body.owner_name ?? "";

      if (!portfolioId && propertyId) portfolioId = await resolvePortfolioId(admin, propertyId);
      if (portfolioId) {
        const { data: pf } = await admin
          .from("property_portfolios")
          .select("id, name, owner_id")
          .eq("id", portfolioId)
          .maybeSingle();
        if (!ownerEmail && pf?.owner_id) {
          const { data: prof } = await admin
            .from("profiles")
            .select("email, full_name")
            .eq("id", pf.owner_id)
            .maybeSingle();
          ownerEmail = prof?.email ?? null;
          ownerName = ownerName || (prof?.full_name ?? pf?.name ?? "Portfolio Owner");
        }
        ownerName = ownerName || (pf?.name ?? "Portfolio Owner");
      }
      if (!ownerEmail && propertyId) {
        const { data: pr } = await admin
          .from("properties")
          .select("owner_email, name")
          .eq("id", propertyId)
          .maybeSingle();
        ownerEmail = pr?.owner_email ?? null;
        ownerName = ownerName || (pr?.name ?? "Property Owner");
      }
      if (!ownerEmail) {
        return json({ success: false, error: { code: "NO_OWNER_EMAIL", message: "No owner email on the portfolio or property — set one before creating the RU sub-user." } }, 422);
      }

      const existing = await findOwnerAccount(admin, propertyId ?? "", ownerEmail, portfolioId);
      if (existing.account?.ru_owner_id) {
        return json({ success: true, created: false, account: existing.account, scope: existing.scope });
      }

      // Create the RU sub-user
      const parts = String(ownerName).trim().split(/\s+/);
      const firstName = parts[0] || "Property";
      const lastName = parts.slice(1).join(" ") || "Owner";

      // RU password policy: 12+ chars incl. upper, lower, digit and special
      const pick = (set: string, n: number) => {
        const bytes = new Uint8Array(n);
        crypto.getRandomValues(bytes);
        return Array.from(bytes).map((b) => set[b % set.length]).join("");
      };
      const password = (
        pick("ABCDEFGHJKLMNPQRSTUVWXYZ", 4) +
        pick("abcdefghijkmnpqrstuvwxyz", 5) +
        pick("23456789", 3) +
        pick("!@#$%*?", 2)
      );

      // RU requires at least one LocationId on the sub-user.
      const locationIds = await resolveOwnerLocationIds(admin, propertyId, portfolioId);
      if (locationIds.length === 0) {
        return json({
          success: false,
          error: {
            code: "NO_RU_LOCATION",
            message:
              "No Rentals United LocationId could be resolved for this owner. Set the property's city/country coordinates (or push the property once) so a location can be matched, then retry.",
          },
        }, 422);
      }

      type RuUser = { user_account_id?: string; email?: string; owner_id?: string };
      const listRuUsers = async (): Promise<RuUser[]> => {
        const { data: listed } = await admin.functions.invoke("rentalsunited-api", { body: { action: "list_users" } });
        return listed?.success && Array.isArray(listed.users) ? (listed.users as RuUser[]) : [];
      };
      const matchByEmail = (users: RuUser[]) =>
        users.find((u) => (u.email ?? "").trim().toLowerCase() === ownerEmail!.trim().toLowerCase()) ?? null;

      let userAccountId: string | null = null;
      let ruOwnerId: string | null = null;
      let adopted = false;

      // 1) If RU already has a sub-user for this email (e.g. a prior attempt that
      //    succeeded on RU's side but failed to save locally), adopt it instead of
      //    trying to create a duplicate.
      const preExisting = matchByEmail(await listRuUsers());
      if (preExisting) {
        userAccountId = preExisting.user_account_id ?? null;
        ruOwnerId = preExisting.owner_id ?? null;
        adopted = true;
      }

      if (!adopted) {
        const { data: created, error: createErr } = await admin.functions.invoke("rentalsunited-api", {
          body: {
            action: "create_user",
            user: { first_name: firstName, last_name: lastName, email: ownerEmail, password },
            location_ids: locationIds,
          },
        });
        const rawMsg = String(createErr?.message ?? created?.error?.message ?? created?.raw ?? "");
        const emailTaken = /already\s*(exist|registered|taken|in use)/i.test(rawMsg) || /duplicate/i.test(rawMsg);

        if (createErr || !created?.success) {
          if (emailTaken) {
            // RU says the email is taken — recover by adopting the existing sub-user.
            const recovered = matchByEmail(await listRuUsers());
            if (recovered) {
              userAccountId = recovered.user_account_id ?? null;
              ruOwnerId = recovered.owner_id ?? null;
              adopted = true;
            } else {
              return json({
                success: false,
                error: {
                  code: "RU_EMAIL_IN_USE",
                  message:
                    `Rentals United reports ${ownerEmail} is already registered, but it is not under our master account (it may belong to another RU account or a pending invite). Use a different owner email, or ask RU support to move/release this login.`,
                },
                preview: preview(created, 2000),
              }, 409);
            }
          } else {
            return json({
              success: false,
              error: { code: "RU_CREATE_USER_FAILED", message: rawMsg || "Rentals United rejected the sub-user creation" },
              preview: preview(created, 2000),
            }, 502);
          }
        } else {
          userAccountId = created.user_account_id ?? null;
        }
      }

      if (!ruOwnerId || !userAccountId) {
        const matched = matchByEmail(await listRuUsers());
        userAccountId = userAccountId ?? matched?.user_account_id ?? null;
        ruOwnerId = ruOwnerId ?? matched?.owner_id ?? null;
      }


      const row: Record<string, unknown> = {
        owner_email: ownerEmail,
        ru_user_id: userAccountId,
        ru_owner_id: ruOwnerId,
        ru_login_email: ownerEmail,
        ru_login_url: "https://new.rentalsunited.com",
        portfolio_id: portfolioId,
        property_id: portfolioId ? null : propertyId,
        scope: portfolioId ? "portfolio" : "property",
      };
      // The unique indexes on this table are PARTIAL, so PostgREST's ON CONFLICT
      // cannot target them. Resolve the existing row manually, then update/insert.
      const existingQuery = admin.from("ru_owner_accounts").select("id").limit(1);
      const { data: existingRow } = portfolioId
        ? await existingQuery.eq("portfolio_id", portfolioId).maybeSingle()
        : await existingQuery.eq("property_id", propertyId).maybeSingle();

      const { data: saved, error: saveErr } = existingRow?.id
        ? await admin.from("ru_owner_accounts").update(row).eq("id", existingRow.id).select().maybeSingle()
        : await admin.from("ru_owner_accounts").insert(row).select().maybeSingle();
      if (saveErr) return json({ success: false, error: { code: "SAVE_FAILED", message: saveErr.message } }, 500);


      return json({ success: true, created: !adopted, adopted, account: saved, scope: portfolioId ? "portfolio" : "property" });
    }

    // ── order_mcq: Phase 4.3 Minimum Content Quality check ──
    if (action === "order_mcq") {
      const propertyId: string = body.property_id ?? "";
      if (!propertyId) return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      const { data: prop } = await admin
        .from("properties")
        .select("id, name, owner_email, external_system, rentalsunited_property_id, rentalsunited_building_id")
        .eq("id", propertyId)
        .maybeSingle();
      if (!prop) return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);

      let gaps: string[] = [];
      try {
        const report = await scoreProperty(prop as any, { probe_ari: true }) as any;
        gaps = report?.gaps ?? [];
      } catch (_e) { /* fall through — gate reports unknown */ }

      const gate = await evaluatePhases(admin, prop as any, { readinessGaps: gaps });
      const p4 = gate.phases.find((p) => p.key === "p4_verify");
      if (body.force !== true && p4?.status !== "passed") {
        return json({
          success: false,
          error: { code: "PHASE_BLOCKED", message: "Phase 4 verification has not passed — the quality check cannot be ordered yet." },
          gate,
        }, 409);
      }

      const ruPropertyId = body.ru_property_id ?? prop.rentalsunited_property_id;
      if (!ruPropertyId) {
        return json({ success: false, error: { code: "NO_RU_PROPERTY", message: "No Rentals United PropertyID stored for this property." } }, 422);
      }

      const { data: result, error: mcqErr } = await admin.functions.invoke("rentalsunited-api", {
        body: { action: "order_mcq", ru_property_id: ruPropertyId },
      });
      const ok = !mcqErr && result?.success === true;
      await admin.from("ru_mcq_orders").insert({
        property_id: propertyId,
        ru_property_id: String(ruPropertyId),
        ordered_by: user.id,
        status: ok ? "ordered" : "failed",
        ru_status_id: result?.ru_status_id ?? null,
        response_preview: preview(result ?? mcqErr?.message, 3000),
      });
      if (!ok) {
        return json({ success: false, error: { code: "RU_MCQ_FAILED", message: mcqErr?.message ?? result?.error?.message ?? "Rentals United rejected the quality check order" } }, 502);
      }
      return json({ success: true, ru_property_id: ruPropertyId, result });
    }

    // ── run_suite ──
    if (action === "run_suite") {
      const suite: string = body.suite ?? "read_only";
      const propertyId: string | null = body.property_id ?? null;

      // Resolve an RU property id for property-scoped calls
      let ruPropertyId: number | null = body.ru_property_id ? Number(body.ru_property_id) : null;
      let propertyRow: { id: string; name: string; rentalsunited_property_id: string | null } | null = null;
      if (propertyId) {
        const { data: p } = await admin
          .from("properties")
          .select("id, name, rentalsunited_property_id")
          .eq("id", propertyId)
          .maybeSingle();
        propertyRow = p ?? null;
        if (!ruPropertyId && p?.rentalsunited_property_id) ruPropertyId = Number(p.rentalsunited_property_id);
        if (!ruPropertyId) {
          const { data: unit } = await admin
            .from("hostfully_room_types")
            .select("rentalsunited_property_id")
            .eq("property_id", propertyId)
            .not("rentalsunited_property_id", "is", null)
            .limit(1)
            .maybeSingle();
          if (unit?.rentalsunited_property_id) ruPropertyId = Number(unit.rentalsunited_property_id);
        }
      }

      const { data: run, error: runErr } = await admin
        .from("ru_cert_runs")
        .insert({
          status: "running",
          suite,
          property_id: propertyId,
          ru_property_id: ruPropertyId ? String(ruPropertyId) : null,
          triggered_by: user.id,
        })
        .select("id")
        .single();
      if (runErr) throw runErr;

      const steps: CertStep[] = [];
      let stepNo = 0;

      const call = async (
        name: string,
        ruAction: string,
        payload: Record<string, unknown>,
        opts: { mandatory?: boolean; skip?: string; assert?: (data: any) => string | null } = {},
      ) => {
        stepNo += 1;
        const ru_method = RU_METHOD_BY_ACTION[ruAction] ?? ruAction;
        if (opts.skip) {
          steps.push({ step: stepNo, name, ru_method, mandatory: !!opts.mandatory, status: "skipped", duration_ms: 0, detail: opts.skip });
          return null;
        }
        const t0 = Date.now();
        try {
          const { data, error } = await admin.functions.invoke("rentalsunited-api", {
            body: { action: ruAction, ...payload },
          });
          const duration = Date.now() - t0;
          if (error) {
            steps.push({ step: stepNo, name, ru_method, mandatory: !!opts.mandatory, status: "failed", duration_ms: duration, detail: error.message, request: payload });
            return null;
          }
          const ok = data?.success === true || data?.healthy === true;
          const assertFail = ok && opts.assert ? opts.assert(data) : null;
          steps.push({
            step: stepNo,
            name,
            ru_method,
            mandatory: !!opts.mandatory,
            status: ok && !assertFail ? "passed" : "failed",
            duration_ms: duration,
            ru_status_id: data?.ru_status_id ?? data?.error?.ru_status_id ?? null,
            detail: assertFail ?? data?.error?.message ?? data?.message ?? (ok ? "OK" : "Unexpected response"),
            request: payload,
            response_preview: preview(data?.raw_xml ?? data),
          });
          return ok && !assertFail ? data : null;
        } catch (e) {
          steps.push({
            step: stepNo,
            name,
            ru_method,
            mandatory: !!opts.mandatory,
            status: "failed",
            duration_ms: Date.now() - t0,
            detail: e instanceof Error ? e.message : "Unknown error",
            request: payload,
          });
          return null;
        }
      };

      const runReadOnly = suite === "read_only" || suite === "full";
      const runMandatory = suite === "mandatory" || suite === "full";
      const runDiscounts = suite === "discounts" || suite === "full";

      const noProp = ruPropertyId ? undefined : "No RU property id resolved — select a property that has been pushed to RU.";

      if (runReadOnly) {
        await call("Credentials & connectivity", "health_check", {}, { mandatory: true });

        const list = await call("List properties", "list_properties", {}, { mandatory: true });
        if (!ruPropertyId && Array.isArray(list?.properties) && list.properties.length > 0) {
          ruPropertyId = Number(list.properties[0].id ?? list.properties[0]);
        }
        const propScoped = ruPropertyId ? undefined : "No RU property available on the account.";

        await call("Get property content", "get_property", { ru_property_id: ruPropertyId }, { mandatory: true, skip: propScoped });
        await call(
          "Get availability (365 days)",
          "get_availability",
          { ru_property_id: ruPropertyId, date_from: isoDate(0), date_to: isoDate(365) },
          {
            mandatory: true,
            skip: propScoped,
            assert: (d) => (/<CalendarDay/i.test(String(d?.raw_xml ?? "")) ? null : "No calendar days returned for the next 365 days"),
          },
        );
        await call(
          "Get prices (365 days)",
          "get_prices",
          { ru_property_id: ruPropertyId, date_from: isoDate(0), date_to: isoDate(365) },
          {
            mandatory: true,
            skip: propScoped,
            assert: (d) => (/<Season/i.test(String(d?.raw_xml ?? "")) ? null : "No price seasons returned for the next 365 days"),
          },
        );
        await call("List reservations (last 7 days)", "list_reservations", { date_from: isoDate(-7), date_to: isoDate(0) }, { mandatory: true });
        await call("Get leads (optional)", "get_leads", { date_from: isoDate(-7), date_to: isoDate(0) }, { mandatory: false });
        await call("List owner buildings", "list_buildings", {}, { mandatory: false });
        await call("List composition rooms", "list_composition_rooms", {}, { mandatory: false });
        await call("List cities & currencies", "list_cities_and_currencies", {}, { mandatory: false });
        await call("Resolve location by coordinates", "get_location_by_coordinates", { latitude: -34.0333, longitude: 21.35 }, { mandatory: false });
      }

      if (runMandatory) {
        const handlerUrl = `${supabaseUrl}/functions/v1/ru-reservation-handler`;
        await call("Subscribe RLNM handler", "subscribe_notifications", { handler_url: handlerUrl }, { mandatory: true });

        if (!propertyId) {
          stepNo += 1;
          steps.push({
            step: stepNo, name: "Push property content", ru_method: "Push_PutProperty_RQ", mandatory: true,
            status: "skipped", duration_ms: 0, detail: "Select a ROLOS property to run the push suite.",
          });
        } else {
          // Content + ARI push via the property pipeline (keeps payload mapping in one place)
          for (const [name, fnBody, method] of [
            ["Push property content", { property_id: propertyId }, "Push_PutProperty_RQ"],
            ["Push availability + prices (ARI)", { property_id: propertyId, action: "push_ari" }, "Push_PutAvbUnits_RQ + Push_PutPrices_RQ"],
          ] as [string, Record<string, unknown>, string][]) {
            stepNo += 1;
            const t0 = Date.now();
            const { data, error } = await admin.functions.invoke("push-property-to-ru", { body: fnBody });
            const ok = !error && data?.success === true;
            steps.push({
              step: stepNo, name, ru_method: method, mandatory: true,
              status: ok ? "passed" : "failed",
              duration_ms: Date.now() - t0,
              detail: error?.message ?? data?.error?.message ?? (ok ? "OK" : "Push failed"),
              request: fnBody,
              response_preview: preview(data),
            });
          }

          // Read-back verification
          await call("Verify content read-back", "get_property", { ru_property_id: ruPropertyId }, { mandatory: true, skip: noProp });
          await call(
            "Verify availability read-back",
            "get_availability",
            { ru_property_id: ruPropertyId, date_from: isoDate(0), date_to: isoDate(365) },
            { mandatory: true, skip: noProp },
          );
          await call(
            "Verify prices read-back",
            "get_prices",
            { ru_property_id: ruPropertyId, date_from: isoDate(0), date_to: isoDate(365) },
            { mandatory: true, skip: noProp },
          );
        }
      }

      if (runDiscounts) {
        type DiscountRow = { threshold: number; discount_percent: number; date_from: string | null; date_to: string | null };
        let longStay: DiscountRow[] = [];
        let lastMinute: DiscountRow[] = [];
        if (propertyId) {
          const { data: discounts } = await admin
            .from("ru_discounts")
            .select("discount_type, threshold, discount_percent, date_from, date_to")
            .eq("property_id", propertyId)
            .eq("is_active", true)
            .order("threshold");
          longStay = (discounts ?? []).filter((d: any) => d.discount_type === "long_stay") as DiscountRow[];
          lastMinute = (discounts ?? []).filter((d: any) => d.discount_type === "last_minute") as DiscountRow[];
        }

        // RUDiscountEntry wire shape — long stay: nights_from = threshold nights.
        // Last minute: nights_from/nights_to map to DaysToArrivalFrom/To, so a
        // "within N days of arrival" rule is 0 -> threshold.
        const mapLongStay = (rows: DiscountRow[]) =>
          rows.map((r) => ({
            date_from: r.date_from ?? isoDate(0),
            date_to: r.date_to ?? isoDate(365),
            nights_from: Number(r.threshold),
            nights_to: 999,
            discount_percentage: Number(r.discount_percent),
          }));
        const mapLastMinute = (rows: DiscountRow[]) =>
          rows.map((r) => ({
            date_from: r.date_from ?? isoDate(0),
            date_to: r.date_to ?? isoDate(365),
            nights_from: 0,
            nights_to: Number(r.threshold),
            discount_percentage: Number(r.discount_percent),
          }));

        await call(
          "Push long-stay discounts",
          "push_long_stay_discounts",
          { ru_property_id: ruPropertyId, discounts: mapLongStay(longStay) },
          { mandatory: false, skip: noProp ?? (longStay.length === 0 ? "No active long-stay discounts configured for this property." : undefined) },
        );
        await call(
          "Verify long-stay discounts",
          "get_long_stay_discounts",
          { ru_property_id: ruPropertyId },
          {
            mandatory: false,
            skip: noProp ?? (longStay.length === 0 ? "Nothing pushed." : undefined),
            assert: (d) => (/<LongStay/i.test(String(d?.raw_xml ?? "")) ? null : "RU did not echo any long-stay discounts"),
          },
        );

        await call(
          "Push last-minute discounts",
          "push_last_minute_discounts",
          { ru_property_id: ruPropertyId, discounts: mapLastMinute(lastMinute) },
          { mandatory: false, skip: noProp ?? (lastMinute.length === 0 ? "No active last-minute discounts configured for this property." : undefined) },
        );
        await call(
          "Verify last-minute discounts",
          "get_last_minute_discounts",
          { ru_property_id: ruPropertyId },
          {
            mandatory: false,
            skip: noProp ?? (lastMinute.length === 0 ? "Nothing pushed." : undefined),
            assert: (d) => (/<LastMinute/i.test(String(d?.raw_xml ?? "")) ? null : "RU did not echo any last-minute discounts"),
          },
        );
      }

      const passed = steps.filter((s) => s.status === "passed").length;
      const failed = steps.filter((s) => s.status === "failed").length;

      const { data: finished } = await admin
        .from("ru_cert_runs")
        .update({
          status: failed === 0 ? "passed" : "failed",
          finished_at: new Date().toISOString(),
          passed,
          failed,
          total: steps.length,
          steps,
          ru_property_id: ruPropertyId ? String(ruPropertyId) : null,
        })
        .eq("id", run.id)
        .select("*")
        .single();

      return json({ success: true, run: finished, property: propertyRow });
    }

    return json({ success: false, error: { code: "UNKNOWN_ACTION", message: `Unknown action: ${action}` } }, 400);
  } catch (e) {
    console.error("[ru-cert-portal]", e);
    return json({ success: false, error: { code: "INTERNAL", message: e instanceof Error ? e.message : "Unknown error" } }, 500);
  }
});
