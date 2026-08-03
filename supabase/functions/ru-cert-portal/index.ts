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
        ok: !summary.blocked,
        blocked: summary.blocked,
        gaps: summary.gaps,
        blocking_gaps: summary.blocking_gaps,
        advisory_gaps: summary.advisory_gaps,
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

    // ── reveal_login_password: admin-only retrieval of the stored sub-user password ──
    // The password is generated by us and kept encrypted at rest (ru_login_password_enc).
    // Revealing it is audit-logged so RU portal logins remain traceable.
    if (action === "reveal_login_password") {
      const accountId: string = body.account_id ?? "";
      if (!accountId) return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id is required" } }, 400);

      const { data: account } = await admin
        .from("ru_owner_accounts")
        .select("id, owner_email, ru_login_email, ru_login_url, ru_owner_id, ru_login_password_enc")
        .eq("id", accountId)
        .maybeSingle();
      if (!account) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
      if (!account.ru_login_password_enc) {
        return json({
          success: false,
          error: {
            code: "NO_STORED_PASSWORD",
            message:
              "No password is held for this sub-user (the account was adopted rather than created here). Reset it in the Rentals United portal and save the new password via Complete company details.",
          },
        }, 409);
      }

      const { data: decrypted, error: decErr } = await admin.rpc("decrypt_sensitive_text", {
        encrypted_data: account.ru_login_password_enc,
      });
      if (decErr || !decrypted || decrypted === "[ENCRYPTED]" || decrypted === "[DECRYPTION_ERROR]") {
        return json({ success: false, error: { code: "DECRYPT_FAILED", message: decErr?.message || "Could not decrypt the stored password" } }, 500);
      }

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_owner_accounts",
        record_id: account.id,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Revealed Rentals United sub-user password for ${account.ru_login_email ?? account.owner_email} (OwnerID ${account.ru_owner_id ?? "?"})`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));


      return json({
        success: true,
        login_email: account.ru_login_email ?? account.owner_email,
        login_url: account.ru_login_url ?? "https://new.rentalsunited.com",
        password: decrypted,
      });
    }

    // ── verify_login_password: confirm password retention and parent API access ──
    // RU portal credentials cannot be validated through the XML API. This action
    // verifies that a password is retained and the configured parent API account
    // can access the bound OwnerID, without mislabelling the portal password.
    if (action === "verify_login_password") {
      const accountId: string = body.account_id ?? "";
      if (!accountId) return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id is required" } }, 400);
      const { data: account } = await admin
        .from("ru_owner_accounts")
        .select("id, owner_email, ru_login_email, ru_owner_id, ru_login_password_enc, company_details_sent")
        .eq("id", accountId)
        .maybeSingle();
      if (!account) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
      const loginEmail = account.ru_login_email ?? account.owner_email;
      const ownerId = String(account.ru_owner_id ?? "").trim();
      if (!account.ru_login_password_enc || !loginEmail || !ownerId) {
        return json({ success: false, error: { code: "RU_IDENTITY_INCOMPLETE", message: "A bound OwnerID, login email and stored password are required." } }, 422);
      }
      // The only meaningful check is a real sub-user login on RU's XML surface: company
      // details and building writes must authenticate AS the child (no <OwnerID> exists
      // on those methods), so parent-scoped access proves nothing here.
      const { data: decryptedPw } = await admin.rpc("decrypt_sensitive_text", {
        encrypted_data: account.ru_login_password_enc,
      });
      if (!decryptedPw || decryptedPw === "[ENCRYPTED]" || decryptedPw === "[DECRYPTION_ERROR]") {
        return json({
          success: false,
          verified: false,
          error: { code: "DECRYPT_FAILED", message: "The stored RU password could not be decrypted by the backend." },
        }, 500);
      }
      const { data: verified, error: verifyError } = await admin.functions.invoke("rentalsunited-api", {
        body: {
          action: "verify_child_login",
          auth_username: loginEmail,
          auth_password: decryptedPw,
        },
      });
      const accepted = !verifyError && verified?.success === true && verified?.verified === true;
      if (!account.company_details_sent) {
        await admin.from("ru_owner_accounts").update({
          company_details_status: accepted ? "credentials_verified" : "credentials_failed",
        }).eq("id", account.id);
      }
      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_owner_accounts",
        record_id: account.id,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `${accepted ? "Verified" : "Rejected"} Rentals United sub-user login for ${loginEmail} (OwnerID ${ownerId})`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));
      if (!accepted) {
        return json({
          success: false,
          verified: false,
          error: { code: "RU_CHILD_LOGIN_REJECTED", message: verified?.ru_status_message ?? verified?.error?.message ?? verifyError?.message ?? "Rentals United rejected this sub-user login on the API. Reset the password in the RU portal and save it here." },
        }, 422);
      }
      return json({ success: true, verified: true, password_stored: true, api_access_verified: true, login_email: loginEmail, ru_owner_id: ownerId });
    }

    /**
     * ── save_api_keys: store a sub-user's own RU API key pair (encrypted) ──
     * Since RU's Nov-2025 rollout, every sub-user must authenticate API calls with its own
     * AccessKey/SecretKey. The first pair is generated by the admin in the RU dashboard
     * (Security settings) and captured here; further pairs can be created via create_api_key.
     */
    if (action === "save_api_keys") {
      const accountId: string = body.account_id ?? "";
      const suppliedOwnerId: string = String(body.ru_owner_id ?? "").trim();
      const suppliedEmail: string = typeof body.login_email === "string" ? body.login_email.trim() : "";
      const accessKey: string = typeof body.access_key === "string" ? body.access_key.trim() : "";
      const secretKey: string = typeof body.secret_key === "string" ? body.secret_key.trim() : "";
      const keyLabel: string | null =
        typeof body.key_label === "string" && body.key_label.trim() ? body.key_label.trim() : null;
      if (!accountId && !suppliedOwnerId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id or ru_owner_id is required" } }, 400);
      }
      if (!accessKey || !secretKey) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "access_key and secret_key are required" } }, 400);
      }

      let account: Record<string, any> | null = null;
      if (accountId) {
        const { data } = await admin
          .from("ru_owner_accounts")
          .select("id, owner_email, ru_login_email, ru_owner_id, company_details_sent")
          .eq("id", accountId)
          .maybeSingle();
        if (!data) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
        account = data as Record<string, any>;
      }

      const ownerId = suppliedOwnerId || String(account?.ru_owner_id ?? "").trim();
      const loginEmail = suppliedEmail || account?.ru_login_email || account?.owner_email || null;
      if (!ownerId) {
        return json({
          success: false,
          error: { code: "RU_IDENTITY_INCOMPLETE", message: "Pick an RU sub-user (OwnerID) before saving API keys." },
        }, 422);
      }

      // Validate the pair against RU before persisting it
      const { data: verified, error: verifyError } = await admin.functions.invoke("rentalsunited-api", {
        body: { action: "verify_child_login", auth_access_key: accessKey, auth_secret_key: secretKey },
      });
      const accepted = !verifyError && verified?.success === true && verified?.verified === true;
      if (!accepted) {
        return json({
          success: false,
          verified: false,
          error: {
            code: "RU_CHILD_KEYS_REJECTED",
            message: verified?.ru_status_message ?? verified?.error?.message ?? verifyError?.message
              ?? "Rentals United rejected this API key pair. Confirm it belongs to the sub-user and has the XmlApi scope.",
          },
        }, 422);
      }

      const { data: enc, error: encErr } = await admin.rpc("encrypt_sensitive_text", { plaintext: secretKey });
      if (encErr || !enc) {
        return json({ success: false, error: { code: "ENCRYPT_FAILED", message: encErr?.message || "Could not encrypt the secret key" } }, 500);
      }

      // Keys live per RU OwnerID, so saving a second sub-user never wipes the first.
      const { error: credErr } = await admin.from("ru_api_credentials").upsert({
        ru_owner_id: ownerId,
        login_email: loginEmail,
        access_key: accessKey,
        secret_enc: enc,
        key_label: keyLabel,
        verified_at: new Date().toISOString(),
      }, { onConflict: "ru_owner_id" });
      if (credErr) return json({ success: false, error: { code: "SAVE_FAILED", message: credErr.message } }, 500);

      // Mirror onto the bound local row (legacy readers) only when it holds this OwnerID.
      if (account?.id && String(account.ru_owner_id ?? "").trim() === ownerId) {
        const update: Record<string, unknown> = {
          ru_api_access_key: accessKey,
          ru_api_secret_enc: enc,
          ru_api_key_label: keyLabel,
          ru_api_keys_verified_at: new Date().toISOString(),
        };
        if (!account.company_details_sent) update.company_details_status = "credentials_verified";
        const { error: upErr } = await admin.from("ru_owner_accounts").update(update).eq("id", account.id);
        if (upErr) return json({ success: false, error: { code: "SAVE_FAILED", message: upErr.message } }, 500);
      }

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_api_credentials",
        record_id: account?.id ?? null,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Stored and verified Rentals United sub-user API keys for ${loginEmail ?? "unknown"} (OwnerID ${ownerId})`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      return json({ success: true, verified: true, ru_owner_id: ownerId, login_email: loginEmail });
    }


    // ── verify_api_keys: re-test the stored sub-user API key pair against RU ──
    if (action === "verify_api_keys") {
      const accountId: string = body.account_id ?? "";
      if (!accountId) return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id is required" } }, 400);
      const { data: account } = await admin
        .from("ru_owner_accounts")
        .select("id, owner_email, ru_login_email, ru_owner_id, ru_api_access_key, ru_api_secret_enc")
        .eq("id", accountId)
        .maybeSingle();
      if (!account) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
      if (!account.ru_api_access_key || !account.ru_api_secret_enc) {
        return json({
          success: false,
          error: {
            code: "NO_API_KEYS",
            message: "No API keys stored for this sub-user. Generate a pair in the RU dashboard (Security settings) and save it here.",
          },
        }, 409);
      }
      const { data: secret } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: account.ru_api_secret_enc });
      if (!secret || secret === "[ENCRYPTED]" || secret === "[DECRYPTION_ERROR]") {
        return json({ success: false, verified: false, error: { code: "DECRYPT_FAILED", message: "The stored secret key could not be decrypted." } }, 500);
      }
      const { data: verified, error: verifyError } = await admin.functions.invoke("rentalsunited-api", {
        body: { action: "verify_child_login", auth_access_key: account.ru_api_access_key, auth_secret_key: secret },
      });
      const accepted = !verifyError && verified?.success === true && verified?.verified === true;
      await admin.from("ru_owner_accounts")
        .update({ ru_api_keys_verified_at: accepted ? new Date().toISOString() : null })
        .eq("id", accountId);
      if (!accepted) {
        return json({
          success: false,
          verified: false,
          error: {
            code: "RU_CHILD_KEYS_REJECTED",
            message: verified?.ru_status_message ?? verified?.error?.message ?? verifyError?.message
              ?? "Rentals United rejected the stored API keys. Regenerate the pair in the RU dashboard and save it here.",
          },
        }, 422);
      }
      return json({
        success: true,
        verified: true,
        access_key: account.ru_api_access_key,
        login_email: account.ru_login_email ?? account.owner_email,
        ru_owner_id: String(account.ru_owner_id ?? ""),
      });
    }

    /**
     * ── create_api_key: mint an additional key pair for the sub-user via the RU API ──
     * Requires an already-working credential for that sub-user (stored keys, or the legacy
     * portal password on pre-rollout accounts). The new secret is stored immediately because
     * RU only returns it once.
     */
    if (action === "create_api_key") {
      const accountId: string = body.account_id ?? "";
      const keyLabel: string = typeof body.key_label === "string" && body.key_label.trim()
        ? body.key_label.trim()
        : "ROLOS";
      if (!accountId) return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id is required" } }, 400);
      const { data: account } = await admin
        .from("ru_owner_accounts")
        .select("id, owner_email, ru_login_email, ru_owner_id, ru_login_password_enc, ru_api_access_key, ru_api_secret_enc, company_details_sent")
        .eq("id", accountId)
        .maybeSingle();
      if (!account) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
      const loginEmail = account.ru_login_email ?? account.owner_email;

      const decrypt = async (enc: unknown): Promise<string | null> => {
        if (!enc) return null;
        const { data } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: enc });
        if (!data || data === "[ENCRYPTED]" || data === "[DECRYPTION_ERROR]") return null;
        return String(data);
      };

      const existingSecret = await decrypt(account.ru_api_secret_enc);
      const portalPassword = await decrypt(account.ru_login_password_enc);
      const authBody: Record<string, unknown> = { action: "create_child_api_key", key_label: keyLabel };
      if (account.ru_api_access_key && existingSecret) {
        authBody.auth_access_key = account.ru_api_access_key;
        authBody.auth_secret_key = existingSecret;
      } else if (loginEmail && portalPassword) {
        authBody.auth_username = loginEmail;
        authBody.auth_password = portalPassword;
      } else {
        return json({
          success: false,
          error: {
            code: "NO_CHILD_CREDENTIALS",
            message: "No usable sub-user credential is stored. Create the first API key pair in the RU dashboard (Security settings) and save it here.",
          },
        }, 422);
      }

      const { data: created, error: createError } = await admin.functions.invoke("rentalsunited-api", { body: authBody });
      if (createError || created?.success !== true || !created?.access_key || !created?.secret_key) {
        return json({
          success: false,
          error: {
            code: "RU_CREATE_KEY_FAILED",
            message: created?.error?.message ?? createError?.message ?? "Rentals United did not return a new API key pair.",
          },
        }, 422);
      }

      const { data: enc, error: encErr } = await admin.rpc("encrypt_sensitive_text", { plaintext: created.secret_key });
      if (encErr || !enc) {
        return json({ success: false, error: { code: "ENCRYPT_FAILED", message: encErr?.message || "Could not encrypt the new secret key" } }, 500);
      }
      const update: Record<string, unknown> = {
        ru_api_access_key: created.access_key,
        ru_api_secret_enc: enc,
        ru_api_key_label: keyLabel,
        ru_api_keys_verified_at: new Date().toISOString(),
      };
      if (!account.company_details_sent) update.company_details_status = "credentials_verified";
      const { error: upErr } = await admin.from("ru_owner_accounts").update(update).eq("id", accountId);
      if (upErr) return json({ success: false, error: { code: "SAVE_FAILED", message: upErr.message } }, 500);

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_owner_accounts",
        record_id: account.id,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Created Rentals United sub-user API key "${keyLabel}" for ${loginEmail} (OwnerID ${account.ru_owner_id ?? "?"})`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      return json({ success: true, access_key: created.access_key, label: keyLabel, login_email: loginEmail });
    }


    // ── save_login_password: admin sets/resets the retained RU portal password ──
    // RU exposes no password-change API, so the admin resets it inside the RU portal
    // and stores the new value here (encrypted) so future automation can authenticate.
    if (action === "save_login_password") {
      const accountId: string = body.account_id ?? "";
      const newPassword: string = typeof body.password === "string" ? body.password.trim() : "";
      const newEmail: string | null =
        typeof body.login_email === "string" && body.login_email.trim() ? body.login_email.trim() : null;
      if (!accountId) return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id is required" } }, 400);
      if (newPassword.length < 8) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "Password must be at least 8 characters" } }, 400);
      }

      const { data: account } = await admin
        .from("ru_owner_accounts")
        .select("id, owner_email, ru_login_email, ru_owner_id, company_details_sent")
        .eq("id", accountId)
        .maybeSingle();
      if (!account) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);

      const canonicalEmail = newEmail ?? account.ru_login_email ?? account.owner_email;
      const ownerId = String(account.ru_owner_id ?? "").trim();
      if (!canonicalEmail || !ownerId) {
        return json({
          success: false,
          error: { code: "RU_IDENTITY_INCOMPLETE", message: "Bind this record to an RU OwnerID and login email before saving a password." },
        }, 422);
      }

      const { data: enc, error: encErr } = await admin.rpc("encrypt_sensitive_text", { plaintext: newPassword });
      if (encErr || !enc) {
        return json({ success: false, error: { code: "ENCRYPT_FAILED", message: encErr?.message || "Could not encrypt the password" } }, 500);
      }

      const update: Record<string, unknown> = {
        ru_login_password_enc: enc,
        ru_login_email: canonicalEmail,
      };
      if (!account.company_details_sent) update.company_details_status = "password_stored";
      const { error: upErr } = await admin.from("ru_owner_accounts").update(update).eq("id", accountId);
      if (upErr) return json({ success: false, error: { code: "SAVE_FAILED", message: upErr.message } }, 500);

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_owner_accounts",
        record_id: account.id,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Stored Rentals United portal password for ${canonicalEmail} (OwnerID ${ownerId}); API access is verified separately`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      const { data: apiCheck, error: apiCheckError } = await admin.functions.invoke("rentalsunited-api", {
        body: { action: "verify_child_login", auth_username: canonicalEmail, auth_password: newPassword },
      });
      const apiAccessVerified = !apiCheckError && apiCheck?.success === true && apiCheck?.verified === true;
      return json({
        success: true,
        password_stored: true,
        api_access_verified: apiAccessVerified,
        api_warning: apiAccessVerified ? null : apiCheck?.ru_status_message ?? apiCheck?.error?.message ?? apiCheckError?.message ?? "Password stored, but Rentals United rejected this sub-user login on the API.",
        login_email: canonicalEmail,
      });
    }

    // ── list_ru_candidates: every sub-user RU currently holds under our master account,
    //    so an admin can bind a local row to a specific OwnerID (RU allows duplicates
    //    per owner email, and logins can be renamed in the RU portal).
    if (action === "list_ru_candidates") {
      const { data: listed } = await admin.functions.invoke("rentalsunited-api", { body: { action: "list_users" } });
      if (!listed?.success) {
        return json({
          success: false,
          error: { code: "RU_LIST_FAILED", message: listed?.error?.message || "Rentals United did not return the sub-user list" },
        }, 502);
      }
      return json({ success: true, users: listed.users ?? [] });
    }

    // ── bind_ru_account: point a local ru_owner_accounts row at a specific RU sub-user.
    if (action === "bind_ru_account") {
      const accountId: string = body.account_id ?? "";
      const ruOwnerId = String(body.ru_owner_id ?? "").trim();
      const loginEmail = typeof body.login_email === "string" ? body.login_email.trim() : "";
      if (!accountId || !ruOwnerId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id and ru_owner_id are required" } }, 400);
      }

      const { data: account } = await admin
        .from("ru_owner_accounts")
        .select("id, owner_email, ru_login_email, ru_owner_id")
        .eq("id", accountId)
        .maybeSingle();
      if (!account) return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);

      const { data: listed } = await admin.functions.invoke("rentalsunited-api", { body: { action: "list_users" } });
      const match = (listed?.users ?? []).find(
        (u: { owner_id?: string }) => String(u.owner_id ?? "").trim() === ruOwnerId,
      );
      if (!match) {
        return json({
          success: false,
          error: {
            code: "RU_OWNER_NOT_FOUND",
            message: `Rentals United does not list OwnerID ${ruOwnerId} under our master account.`,
          },
        }, 422);
      }

      const update: Record<string, unknown> = {
        ru_owner_id: ruOwnerId,
        ru_login_email: loginEmail || String(match.email ?? "").trim() || account.ru_login_email,
      };
      const userAccountId = String(match.user_account_id ?? "").trim();
      if (userAccountId && userAccountId !== "0") update.ru_user_id = userAccountId;

      const { error: upErr } = await admin.from("ru_owner_accounts").update(update).eq("id", accountId);
      if (upErr) return json({ success: false, error: { code: "SAVE_FAILED", message: upErr.message } }, 500);

      await admin.from("audit_logs").insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_owner_accounts",
        record_id: account.id,
        request_origin: "edge_function",
        edge_function_name: "ru-cert-portal",
        is_sensitive: true,
        change_summary: `Bound RU sub-account to OwnerID ${ruOwnerId} (${update.ru_login_email})`,
      }).then(() => {}, (e) => console.warn("[ru-cert-portal] audit log insert failed", e));

      return json({ success: true, ru_owner_id: ruOwnerId, login_email: update.ru_login_email });
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
        : {
            action: "fill_company_details",
            company: body.company,
            owner_id: body.owner_id ?? null,
            auth_username: body.auth_username ?? null,
            auth_password: body.auth_password ?? null,
          };

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

    // ── reset_phase1: re-open Phase 1 so the onboarding flow can be run again.
    //    mode = "details" (default) keeps the RU sub-user but clears the company-details
    //    state so "Complete company details" can be re-submitted.
    //    mode = "identity" additionally unbinds the local row from the RU OwnerID so the
    //    flow falls all the way back to "Create sub-user".
    if (action === "reset_phase1") {
      const propertyId: string | null = body.property_id ?? null;
      let portfolioId: string | null = body.portfolio_id ?? null;
      const mode: string = body.mode === "identity" ? "identity" : "details";
      if (!propertyId && !portfolioId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id or portfolio_id is required" } }, 400);
      }
      if (!portfolioId && propertyId) portfolioId = await resolvePortfolioId(admin, propertyId);

      let query = admin.from("ru_owner_accounts").select("id, ru_owner_id, portfolio_id, property_id");
      query = portfolioId ? query.eq("portfolio_id", portfolioId) : query.eq("property_id", propertyId);
      const { data: accounts } = await query;
      if (!accounts?.length) {
        return json({ success: false, error: { code: "NO_RU_ACCOUNT", message: "No Rentals United owner account is linked yet — nothing to reset." } }, 404);
      }

      const patch: Record<string, unknown> = {
        company_details_sent: false,
        company_filled_at: null,
        company_details_status: "pending",
      };
      if (mode === "identity") {
        patch.ru_owner_id = null;
        patch.ru_user_id = null;
        patch.ru_login_email = null;
        patch.ru_login_url = null;
        patch.ru_login_password_enc = null;
      }

      const ids = accounts.map((a: { id: string }) => a.id);
      const { error: upErr } = await admin.from("ru_owner_accounts").update(patch).in("id", ids);
      if (upErr) {
        return json({ success: false, error: { code: "SAVE_FAILED", message: upErr.message } }, 500);
      }

      return json({ success: true, reset: mode, accounts: ids });
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
        // Only mandatory failures may block a phase — optional quality advice must not.
        gaps = ((readiness as any)?.blocking_gaps ?? []) as string[];
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
    // `ensure_company_details` is the same atomic flow: it re-enters here, finds the
    // existing sub-user and (re)submits Push_FillCompanyDetails_RQ until it sticks.
    if (action === "ensure_owner_account" || action === "ensure_company_details") {
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
          .select("id, name, owner_id, owner_email")
          .eq("id", portfolioId)
          .maybeSingle();
        // Explicit portfolio owner email wins over the linked profile: admins set it on the
        // portfolio edit form (usually copied from one of the member properties' owners).
        if (!ownerEmail && (pf as any)?.owner_email) {
          ownerEmail = (pf as any).owner_email as string;
          ownerName = ownerName || (pf?.name ?? "Portfolio Owner");
        }
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

      const contactNameParts = String(ownerName).trim().split(/\s+/);
      const contactFirstName = contactNameParts[0] || "Property";
      const contactLastName = contactNameParts.slice(1).join(" ") || "Owner";

      // Resolve an RU LocationId for a free-text name (used for CountryId).
      const locationIdByName = async (name: string): Promise<number | null> => {
        if (!name) return null;
        const { data } = await admin.functions.invoke("rentalsunited-api", {
          body: { action: "get_location_by_name", location_name: name },
        });
        const id = Number((data as any)?.location_id ?? (data as any)?.locations?.[0]?.id);
        return Number.isFinite(id) && id > 1 ? id : null;
      };

      // Phase 1 is only complete once company details have been filled on RU.
      // NOTE: Push_FillCompanyDetails_RQ has no UserAccountId — RU applies the details to
      // whichever account authenticates, so we must log in AS the sub-user. That is only
      // possible when we still hold the password we generated at creation time; adopted
      // accounts (created outside this flow) are flagged for manual completion instead.
      const submitCompanyDetails = async (
        account: Record<string, any> | null,
        plainPassword?: string | null,
      ) => {
        if (!account?.id) return { sent: false, error: "No local RU account row" };
        // Idempotent: treat it as done only when RU actually confirmed it.
        // `force: true` re-submits (e.g. the RU portal profile is still blank).
        if (body.force !== true && account.company_details_sent === true && account.company_filled_at) {
          return { sent: true, skipped: true as const };
        }

        // Password sources, in order: this call, an admin-supplied password
        // (adopted accounts), or the encrypted copy stored at creation time.
        let password: string | null = plainPassword ?? (body.ru_login_password as string | undefined) ?? null;
        // True when the password came from us (freshly generated or our encrypted copy):
        // in that case we must never ask the operator for a password we already hold.
        let passwordIsOurs = Boolean(plainPassword);
        if (!password && account.ru_login_password_enc) {
          const { data: decrypted } = await admin.rpc("decrypt_sensitive_text", {
            encrypted_data: account.ru_login_password_enc,
          });
          password = decrypted && decrypted !== "[ENCRYPTED]" && decrypted !== "[DECRYPTION_ERROR]"
            ? decrypted as string
            : null;
          passwordIsOurs = Boolean(password);
        }
        if (password && !account.ru_login_password_enc) {
          // Persist it so later retries/backfills never need the operator again.
          const { data: enc } = await admin.rpc("encrypt_sensitive_text", { plaintext: password });
          if (enc) await admin.from("ru_owner_accounts").update({ ru_login_password_enc: enc }).eq("id", account.id);
        }

        // Child credentials are mandatory: RU's Push_FillCompanyDetails_RQ has no <OwnerID>
        // element, so the details are written to whichever identity authenticates. Using the
        // parent envelope would overwrite the MASTER company profile instead of the child's.
        // Since RU's Nov-2025 rollout, sub-accounts must use their own API key pair; the
        // legacy portal password only works on older accounts.
        let childAccessKey: string | null = null;
        let childSecretKey: string | null = null;
        {
          const decryptSecret = async (enc: unknown): Promise<string | null> => {
            if (!enc) return null;
            const { data: secret } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: enc });
            if (!secret || secret === "[ENCRYPTED]" || secret === "[DECRYPTION_ERROR]") return null;
            return String(secret);
          };

          // Preferred: keys stored against this RU OwnerID
          const boundOwnerId = String(account.ru_owner_id ?? "").trim();
          if (boundOwnerId) {
            const { data: credRow } = await admin
              .from("ru_api_credentials")
              .select("access_key, secret_enc")
              .eq("ru_owner_id", boundOwnerId)
              .maybeSingle();
            const plain = await decryptSecret(credRow?.secret_enc);
            if (credRow?.access_key && plain) {
              childAccessKey = String(credRow.access_key);
              childSecretKey = plain;
            }
          }

          if (!childAccessKey) {
            const { data: keyRow } = await admin
              .from("ru_owner_accounts")
              .select("ru_api_access_key, ru_api_secret_enc")
              .eq("id", account.id)
              .maybeSingle();
            const plain = await decryptSecret(keyRow?.ru_api_secret_enc);
            if (keyRow?.ru_api_access_key && plain) {
              childAccessKey = String(keyRow.ru_api_access_key);
              childSecretKey = plain;
            }
          }
        }

        const hasChildKeys = Boolean(childAccessKey && childSecretKey);

        if (!password && !hasChildKeys) {
          return {
            sent: false,
            needs_password: true,
            needs_api_keys: true,
            error:
              "Rentals United requires the sub-user's own API keys (AccessKey + SecretKey) to write company details. Generate them in the RU dashboard under Security settings and save them in Portfolios → RU accounts, then retry.",
          };
        }




        // Resolve company info from the portfolio (preferred) or the property.
        let companyName = ownerName || "";
        let address: string | undefined;
        let city: string | undefined;
        let country: string | undefined;
        let zip: string | undefined;
        let phone: string | undefined;
        let website: string | undefined;

        let sourcePropertyId: string | null = propertyId ?? null;
        if (portfolioId) {
          const { data: pf } = await admin
            .from("property_portfolios")
            .select("name")
            .eq("id", portfolioId)
            .maybeSingle();
          companyName = pf?.name || companyName;
          if (!sourcePropertyId) {
            const { data: member } = await admin
              .from("property_portfolio_members")
              .select("property_id")
              .eq("portfolio_id", portfolioId)
              .limit(1)
              .maybeSingle();
            sourcePropertyId = member?.property_id ?? null;
          }
        }
        if (sourcePropertyId) {
          const { data: pr } = await admin
            .from("properties")
            .select("name, address, city, country, postal_code")
            .eq("id", sourcePropertyId)
            .maybeSingle();
          companyName = companyName || (pr as any)?.name || "";
          address = (pr as any)?.address ?? undefined;
          city = (pr as any)?.city ?? undefined;
          country = (pr as any)?.country ?? undefined;
          zip = (pr as any)?.postal_code ?? undefined;

          const { data: contact } = await admin
            .from("property_contact_details")
            .select("phone")
            .eq("property_id", sourcePropertyId)
            .limit(1)
            .maybeSingle();
          phone = (contact as any)?.phone ?? phone;
        }
        if (!companyName) return { sent: false, error: "No company/portfolio name to submit" };

        const countryId = await locationIdByName(country || "South Africa");
        if (!countryId) {
          return { sent: false, error: `Could not resolve a Rentals United CountryId for "${country || "South Africa"}"` };
        }

        const company = {
          first_name: contactFirstName,
          last_name: contactLastName,
          email: ownerEmail!,
          phone: phone || "+27000000000",
          city: city || "Cape Town",
          country_id: countryId,
          address: address || "Address on file",
          zip_code: zip || "0000",
          language_id: 1,
          name: companyName,
          website: website || "https://sleepinafrica.roomsonline.co.za",
          company_city: city || undefined,
          company_address: address || undefined,
          post_code: zip || undefined,
          company_phone: phone || undefined,
          merchant_name: companyName,
          location_ids: locationIds,
        };

        // Retry transient RU/network failures — Phase 1 must not be left half-done.
        let filled: any = null;
        let fillErr: any = null;
        let lastMessage = "";
        const maxAttempts = hasChildKeys || passwordIsOurs ? 4 : 3;
        const ownerId = Number(account.ru_owner_id);
        if (!Number.isFinite(ownerId) || ownerId <= 0) {
          return { sent: false, error: "No valid Rentals United OwnerID is bound to this account" };
        }
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const res = await admin.functions.invoke("rentalsunited-api", {
            body: {
              action: "fill_company_details",
              company,
              owner_id: ownerId,
              // Authenticate AS the sub-user so RU writes the details onto the owner's
              // own profile (RU applies them to whichever account authenticates).
              ...(hasChildKeys
                ? { auth_access_key: childAccessKey, auth_secret_key: childSecretKey }
                : {
                  auth_username: (account.ru_login_email as string | null) || ownerEmail || null,
                  auth_password: password || null,
                }),

            },
          });
          filled = res.data;
          fillErr = res.error;
          lastMessage = String(
            (filled as any)?.error?.message ?? fillErr?.message ?? "Rentals United rejected the company details",
          );
          if (!fillErr && filled?.success) break;
          const permanent = /INCOMPLETE|requires these|invalid|credential|password|authenticat/i.test(lastMessage);
          if (permanent || attempt === maxAttempts) break;
          await new Promise((r) => setTimeout(r, attempt * 900));
        }
        if (/incorrect login or password/i.test(lastMessage)) {
          lastMessage =
            "Rentals United rejected the saved sub-user username/password (Status -4). Push_FillCompanyDetails_RQ requires the sub-user login and has no OwnerID selector. Confirm that the saved login email matches Pull_ListMyUsers_RQ, then save the current RU password and retry.";
        }
        if (fillErr || !filled?.success) {
          await admin
            .from("ru_owner_accounts")
            .update({ company_details_status: "failed" })
            .eq("id", account.id);
          return { sent: false, error: lastMessage };
        }


        await admin
          .from("ru_owner_accounts")
          .update({
            company_details_sent: true,
            company_details_status: "sent",
            company_filled_at: new Date().toISOString(),
            company_payload: company,
          })
          .eq("id", account.id);
        return { sent: true };
      };

      // RU requires at least one LocationId on the sub-user (and on company details).
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
      const usableRuId = (value: unknown): string => {
        const normalized = String(value ?? "").trim();
        return normalized && normalized !== "0" ? normalized : "";
      };
      // RU sub-user logins can be renamed inside the RU portal, so an email-only lookup
      // reports "no user found" for an account we already know by OwnerID / stored login.
      const matchByStoredIdentity = (users: RuUser[], account: Record<string, any> | null) => {
        if (!account) return null;
        const wantedOwnerId = usableRuId(account.ru_owner_id);
        const wantedEmails = [account.ru_login_email, account.owner_email]
          .map((v) => String(v ?? "").trim().toLowerCase())
          .filter(Boolean);
        return users.find((u) => {
          const ownerId = usableRuId(u.owner_id);
          if (wantedOwnerId && ownerId && ownerId === wantedOwnerId) return true;
          return wantedEmails.includes((u.email ?? "").trim().toLowerCase());
        }) ?? null;
      };


      const existing = await findOwnerAccount(admin, propertyId ?? "", ownerEmail, portfolioId);
      // The RU identity is only stale when Rentals United no longer lists an owner that
      // matches the stored OwnerID (or, when we never stored one, the stored login email).
      // A login rename in the RU portal must NOT erase the OwnerID or the password.
      const storedOwnerId = usableRuId(existing.account?.ru_owner_id);
      const storedUserId = usableRuId((existing.account as any)?.ru_user_id);
      const ruUsers = existing.account?.ru_owner_id ? await listRuUsers() : [];
      const listOk = ruUsers.length > 0;
      const currentRuUser = listOk
        ? (ruUsers.find((u) => Boolean(storedOwnerId) && usableRuId(u.owner_id) === storedOwnerId)
          ?? matchByStoredIdentity(ruUsers, existing.account as any)
          ?? matchByEmail(ruUsers))
        : null;
      const currentOwnerId = usableRuId(currentRuUser?.owner_id);
      const currentUserId = usableRuId(currentRuUser?.user_account_id);
      // A transient list_users failure is not proof that the RU identity changed, and
      // RU sometimes returns UserAccountId=0. Neither condition may erase a password.
      const ruIdentityChanged = Boolean(storedOwnerId) && listOk && (
        !currentRuUser ||
        (Boolean(currentOwnerId) && currentOwnerId !== storedOwnerId) ||
        (Boolean(currentUserId) && Boolean(storedUserId) && currentUserId !== storedUserId)
      );
      const staleIdentity = ruIdentityChanged;
      if (staleIdentity) {
        // Wipe the stale RU identity + password so the row is rebuilt below.
        await admin
          .from("ru_owner_accounts")
          .update({
            ru_owner_id: null,
            ru_user_id: null,
            ru_login_password_enc: null,
            company_details_sent: false,
            company_filled_at: null,
            company_details_status: "pending",
          })
          .eq("id", (existing.account as any).id);
      } else if (currentRuUser) {
        // Same RU account, possibly renamed in the portal: re-align the stored login
        // email (and OwnerID) without touching the retained password.
        const ruEmail = String(currentRuUser.email ?? "").trim();
        const patch: Record<string, unknown> = {};
        if (ruEmail && ruEmail.toLowerCase() !== String((existing.account as any)?.ru_login_email ?? "").trim().toLowerCase()) {
          patch.ru_login_email = ruEmail;
        }
        if (currentOwnerId && currentOwnerId !== storedOwnerId) patch.ru_owner_id = currentOwnerId;
        if (Object.keys(patch).length > 0) {
          await admin.from("ru_owner_accounts").update(patch).eq("id", (existing.account as any).id);
          Object.assign(existing.account as any, patch);
        }
      }

      if (existing.account?.ru_owner_id && !staleIdentity) {

        const companyResult = await submitCompanyDetails(existing.account as any);
        const needsPassword = Boolean((companyResult as any).deferred || (companyResult as any).authFailed);
        if (!companyResult.sent && !needsPassword) {
          return json({
            success: false,
            error: {
              code: "RU_COMPANY_DETAILS_FAILED",
              message: `Sub-user exists (OwnerID ${existing.account.ru_owner_id}) but company details could not be submitted to Rentals United: ${companyResult.error}`,
            },
            account: existing.account,
          }, 502);
        }
        const { data: refreshed } = await admin
          .from("ru_owner_accounts")
          .select("*")
          .eq("id", (existing.account as any).id)
          .maybeSingle();
        return json({
          success: true,
          created: false,
          company_details_sent: companyResult.sent,
          company_details_manual_required: needsPassword,
          company_details_warning: companyResult.sent ? null : companyResult.error,
          account: refreshed ?? existing.account,
          scope: existing.scope,
        });
      }

      // `ensure_company_details` used to hard-fail with 409 here when the stored RU
      // identity was missing or stale. That left the operator stuck on a dead button,
      // so instead we self-heal: fall through and (re)create the sub-user, which then
      // submits the company details atomically.




      // Create the RU sub-user
      const parts = String(ownerName).trim().split(/\s+/);
      const firstName = parts[0] || "Property";
      const lastName = parts.slice(1).join(" ") || "Owner";

      // RU password policy: 12+ chars incl. upper, lower, digit and special.
      // RU's documented special-character set is exactly: . - _ $ * ( ) # @ ! % /
      const pick = (set: string, n: number) => {
        const bytes = new Uint8Array(n);
        crypto.getRandomValues(bytes);
        return Array.from(bytes).map((b) => set[b % set.length]).join("");
      };
      const password = (
        pick("ABCDEFGHJKLMNPQRSTUVWXYZ", 4) +
        pick("abcdefghijkmnpqrstuvwxyz", 5) +
        pick("23456789", 3) +
        pick(".-_$*()#@!%/", 2)
      );



      let userAccountId: string | null = null;
      let ruOwnerId: string | null = null;
      let adopted = false;
      let adoptedEmail: string | null = null;

      // 1) If RU already has a sub-user for this owner (e.g. a prior attempt that
      //    succeeded on RU's side but failed to save locally, or a login renamed in the
      //    RU portal), adopt it instead of trying to create a duplicate.
      //    An explicit `ru_owner_id` in the request always wins — that is how an admin
      //    binds a specific RU account when several match this owner.
      const requestedOwnerId = usableRuId(body.ru_owner_id);
      const candidateUsers = await listRuUsers();
      const preExisting = (requestedOwnerId
        ? candidateUsers.find((u) => usableRuId(u.owner_id) === requestedOwnerId) ?? null
        : null)
        ?? matchByEmail(candidateUsers)
        ?? matchByStoredIdentity(candidateUsers, existing.account as any);
      if (preExisting) {
        userAccountId = preExisting.user_account_id ?? null;
        ruOwnerId = preExisting.owner_id ?? null;
        adoptedEmail = String(preExisting.email ?? "").trim() || null;
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
            const refreshed = await listRuUsers();
            const recovered = matchByEmail(refreshed) ?? matchByStoredIdentity(refreshed, existing.account as any);
            if (recovered) {
              userAccountId = recovered.user_account_id ?? null;
              ruOwnerId = recovered.owner_id ?? null;
              adoptedEmail = String(recovered.email ?? "").trim() || null;
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
        const refreshed = await listRuUsers();
        const matched = matchByEmail(refreshed) ?? matchByStoredIdentity(refreshed, existing.account as any);
        userAccountId = userAccountId ?? matched?.user_account_id ?? null;
        ruOwnerId = ruOwnerId ?? matched?.owner_id ?? null;
      }


      const row: Record<string, unknown> = {
        owner_email: ownerEmail,
        ru_user_id: userAccountId,
        ru_owner_id: ruOwnerId,
        // The RU-side login is authoritative: an adopted account may have been renamed
        // in the RU portal and that is the username Push_FillCompanyDetails_RQ needs.
        ru_login_email: adoptedEmail || ownerEmail,

        ru_login_url: "https://new.rentalsunited.com",
        portfolio_id: portfolioId,
        property_id: portfolioId ? null : propertyId,
        scope: portfolioId ? "portfolio" : "property",
        company_details_sent: false,
        company_filled_at: null,
        company_details_status: "pending",
      };
      // Keep the sub-user password (encrypted) — Push_FillCompanyDetails_RQ authenticates
      // as the sub-user, and admins must be able to log into the RU portal later.
      // Retention is mandatory: if encryption fails we must not silently lose the only
      // copy of a password RU has already accepted.
      if (!adopted) {
        const { data: enc, error: encErr } = await admin.rpc("encrypt_sensitive_text", { plaintext: password });
        if (encErr || !enc) {
          return json({
            success: false,
            error: {
              code: "PASSWORD_RETENTION_FAILED",
              message:
                `The Rentals United sub-user was created (OwnerID ${ruOwnerId ?? "?"}) but its password could not be stored securely: ${encErr?.message ?? "encryption returned no value"}. Reset the password in the Rentals United portal and save it via Complete company details.`,
            },
          }, 500);
        }
        row.ru_login_password_enc = enc;
      } else {
        const retainedPassword = (existing.account as any)?.ru_login_password_enc ?? null;
        const retainedOwnerId = usableRuId(existing.account?.ru_owner_id);
        const adoptedOwnerId = usableRuId(ruOwnerId);
        const retainedEmails = [
          (existing.account as any)?.ru_login_email,
          (existing.account as any)?.owner_email,
        ].map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean);
        const adoptedEmails = [adoptedEmail, ownerEmail]
          .map((v) => String(v ?? "").trim().toLowerCase()).filter(Boolean);
        // Adoption usually means RU already committed our previous create request, or the
        // login was renamed in the RU portal. Keep the retained password when EITHER the
        // OwnerID or the login email still matches; only a genuinely different child
        // account may drop it.
        const sameRuIdentity = Boolean(retainedPassword) && (
          (Boolean(retainedOwnerId) && retainedOwnerId === adoptedOwnerId) ||
          retainedEmails.some((e) => adoptedEmails.includes(e))
        );
        row.ru_login_password_enc = sameRuIdentity ? retainedPassword : null;
      }


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

      // Step 2 of Phase 1: fill company details on RU — without this the sub-user is incomplete.
      const companyResult = await submitCompanyDetails(saved as any, adopted ? null : password);
      const needsPassword = Boolean((companyResult as any).deferred || (companyResult as any).authFailed);
      if (!companyResult.sent && !needsPassword) {
        return json({
          success: false,
          error: {
            code: "RU_COMPANY_DETAILS_FAILED",
            message: `Sub-user ${adopted ? "adopted" : "created"} (OwnerID ${ruOwnerId ?? "?"}) but company details could not be submitted to Rentals United: ${companyResult.error}`,
          },
          account: saved,
        }, 502);
      }
      const { data: finalAccount } = await admin
        .from("ru_owner_accounts")
        .select("*")
        .eq("id", (saved as any)?.id)
        .maybeSingle();

      return json({
        success: true,
        created: !adopted,
        adopted,
        company_details_sent: companyResult.sent,
        company_details_manual_required: needsPassword,
        company_details_warning: companyResult.sent ? null : companyResult.error,
        account: finalAccount ?? saved,
        scope: portfolioId ? "portfolio" : "property",
      });



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
        gaps = report?.blocking_gaps ?? [];
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
