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
    if (!allowed) return json({ success: false, error: { code: "FORBIDDEN", message: "Admin access required" } }, 403);

    const body = await req.json().catch(() => ({}));
    const action: string = body.action ?? "";

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

    if (action === "wl_readiness") {
      const { data: props } = await admin
        .from("properties")
        .select("id, name, ru_push_enabled, rentalsunited_property_id, external_system")
        .eq("is_active", true)
        .order("name");

      const candidates = (props ?? []).filter(
        (p: { ru_push_enabled: boolean | null; rentalsunited_property_id: string | null }) =>
          p.ru_push_enabled === true || !!p.rentalsunited_property_id,
      );

      const results: unknown[] = [];
      for (const p of candidates) {
        const { data, error } = await admin.functions.invoke("push-property-to-ru", {
          body: { property_id: p.id, dry_run: true },
        });
        if (error) {
          results.push({ property_id: p.id, name: p.name, ok: false, error: error.message, gaps: ["Dry run failed"] });
          continue;
        }
        const units = data?.units ?? [
          { name: p.name, ru_property_id: data?.ru_property_id ?? null, validation: data?.validation ?? {} },
        ];
        const gaps: string[] = [];
        let checksTotal = 0;
        let checksPassed = 0;
        for (const u of units) {
          const v = u.validation ?? {};
          const add = (cond: boolean, msg: string) => {
            checksTotal += 1;
            if (cond) checksPassed += 1;
            else gaps.push(`${u.name}: ${msg}`);
          };
          add(!!v.has_name, "missing property/unit name");
          add(!!v.has_object_type_id, "missing ObjectTypeID (property type)");
          add(!!v.can_sleep_max_ok, "CanSleepMax must be at least 1");
          add(!!v.meets_minimum_images, `only ${v.images_count ?? 0} images (need 10 at ≥1024×683)`);
          add(v.has_main_image !== false, "no main photo flagged");
          add(!!v.meets_minimum_amenities, `only ${v.amenities_count ?? 0} amenities (need 10)`);
          add(!!v.has_coordinates, "missing geo-coordinates");
          add(v.has_street !== false, "missing street address");
          add(!!v.has_zip_code, "missing ZIP code");
          add(!!v.has_space, "missing property size (Space)");
          add(v.has_floor !== false, "missing floor number");
          add(!!v.has_detailed_location_id, "missing DetailedLocationID");
          add(v.has_description !== false, "description too short (need ≥100 characters)");
          add(!!v.has_payment_methods, "no payment method set");
          add(!!v.has_cancellation_policies, "no cancellation policy set");
          add(!!v.beds_meet_max_guests, `beds (${v.total_beds ?? 0}) < max guests (${v.max_guests ?? 0})`);
          add((v.rooms_count ?? 0) > 0, "no composition rooms");
        }

        // ── Live ARI verification (365 days forward) ──
        const ruIds: number[] = (data?.units ?? [])
          .map((u: { ru_property_id: string | null }) => Number(u.ru_property_id))
          .filter((n: number) => Number.isFinite(n) && n > 0);
        const singleRuId = Number(p.rentalsunited_property_id ?? data?.ru_property_id ?? 0);
        if (ruIds.length === 0 && singleRuId > 0) ruIds.push(singleRuId);

        let ari: Record<string, unknown> | null = null;
        if (ruIds.length > 0) {
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

          checksTotal += 2;
          if (hasAvailability) checksPassed += 1;
          else gaps.push(`RU ${target}: no open availability day in the next 365 days`);
          if (allPricesPositive) checksPassed += 1;
          else gaps.push(`RU ${target}: prices missing or not all above zero for the next 365 days`);

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
          gaps.push(`${p.name}: not yet published to RU (no RU property ID) — ARI cannot be verified`);
          checksTotal += 2;
        }

        results.push({
          property_id: p.id,
          name: p.name,
          ru_property_id: p.rentalsunited_property_id,
          multi_unit: !!data?.multi_unit,
          unit_count: units.length,
          ok: gaps.length === 0,
          gaps,
          checks_total: checksTotal,
          checks_passed: checksPassed,
          score: checksTotal > 0 ? Math.round((checksPassed / checksTotal) * 100) : 0,
          ari,
        });
      }

      return json({ success: true, properties: results });
    }

    // ── user_management (parked) ──
    if (action === "user_management") {
      const { data, error } = await admin.functions.invoke("rentalsunited-api", { body: { action: "list_users" } });
      return json({
        success: true,
        enabled: false,
        note: "Sub-user creation stays disabled until Rentals United confirms the PMS profile. Guest Communication API is out of scope.",
        probe: error ? { ok: false, error: error.message } : { ok: !!data?.success, preview: preview(data, 1500) },
      });
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
