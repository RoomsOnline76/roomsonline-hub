/**
 * Channel onboarding gate + atomic owner rebinding.
 *
 * This function owns the DURABLE gate state for the deterministic two-step channel
 * onboarding flow, and the one operation that must not be interruptible from the
 * browser (unbind → re-assign → archive-if-empty).
 *
 * It never speaks Rentals United XML: every channel operation is delegated to the
 * existing isolated surfaces (`rentalsunited-api` via `ru-cert-portal`,
 * `channel-manager-entitlement`, `ru-close-user`), so the adapter stays the only
 * place channel wire format exists.
 *
 * Actions
 *   gate_status          → the whole gate for one property (readiness + steps + binding)
 *   grade_ready_to_sell  → re-grade steps 1–5 and persist the durable Ready-to-sell flag
 *   record_step          → persist a monitor step verdict (Step A / Step B / ready to connect)
 *   rebind_owner         → atomic archive → unbind → re-assign → archive-if-empty
 *   plan_push_scope      → read-only: which units (if any) the channel still owes content for

 *
 * Long-running work (Step A task chain, property + ARI push) is deliberately NOT here:
 * it is driven task-by-task from the monitor UI so nothing can hit the request idle
 * timeout and every task is individually retryable.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  ONBOARD_STEP_KEYS,
  READY_TO_SELL_GROUPS,
  gradeReadyToSell,
  type OnboardStepKey,
} from "../_shared/channelOnboardGate.ts";
import {
  ledgerFingerprint,
  mapReadinessToLedgerRows,
  writeLedgerRows,
  READY_TO_SELL_LEDGER_STEPS,
} from "../_shared/channelStepLedger.ts";
import { planStaticPushScope } from "../_shared/ruStaticDelta.ts";


const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const LEDGER_TABLE = "property_channel_step_status";

const json = (payload: unknown, status = 200): Response =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type Status = "pending" | "blocked" | "passed" | "stale" | "unknown";

interface StepRow {
  step_key: string;
  status: Status;
  blocker_summary: string | null;
  input_fingerprint: string | null;
  passed_at: string | null;
  last_checked_at: string | null;
  details: Record<string, unknown> | null;
}

// deno-lint-ignore no-explicit-any
async function readSteps(admin: any, propertyId: string): Promise<Record<string, StepRow>> {
  const { data } = await admin
    .from(LEDGER_TABLE)
    .select("step_key, status, blocker_summary, input_fingerprint, passed_at, last_checked_at, details")
    .eq("property_id", propertyId)
    .in("step_key", ONBOARD_STEP_KEYS as unknown as string[]);
  const out: Record<string, StepRow> = {};
  for (const row of (data ?? []) as StepRow[]) out[row.step_key] = row;
  return out;
}

// deno-lint-ignore no-explicit-any
async function writeStep(
  admin: any,
  propertyId: string,
  row: {
    step_key: OnboardStepKey;
    status: Status;
    blocker_summary?: string | null;
    input_fingerprint?: string | null;
    details?: Record<string, unknown> | null;
  },
): Promise<void> {
  const now = new Date().toISOString();
  await admin.from(LEDGER_TABLE).upsert(
    {
      property_id: propertyId,
      step_key: row.step_key,
      status: row.status,
      blocker_summary: row.blocker_summary ?? null,
      input_fingerprint: row.input_fingerprint ?? null,
      // `manual_signoff` is the only source value that honestly describes an
      // operator-confirmed monitor step; the readiness grade is local.
      source: row.step_key === "ready_to_sell" ? "local" : "manual_signoff",
      details: row.details ?? null,
      last_checked_at: now,
      ...(row.status === "passed" ? { passed_at: now } : {}),
      updated_at: now,
    },
    { onConflict: "property_id,step_key" },
  );
}

/** Sub-account row + credential state for one property (or its portfolio). */
// deno-lint-ignore no-explicit-any
async function readBinding(admin: any, propertyId: string) {
  const { data: member } = await admin
    .from("property_portfolio_members")
    .select("portfolio_id")
    .eq("property_id", propertyId)
    .maybeSingle();
  const portfolioId = (member?.portfolio_id as string | undefined) ?? null;

  let account: Record<string, unknown> | null = null;
  // Only columns that exist on ru_owner_accounts — a bad column makes PostgREST reject the
  // whole read, which previously looked identical to "no account is bound".
  const select =
    "id, scope, property_id, portfolio_id, owner_email, ru_owner_id, ru_login_email, ru_api_access_key, ru_api_keys_verified_at, company_details_sent, company_details_status, ru_login_password_enc";
  let readError: string | null = null;

  const { data: propScoped, error: propError } = await admin
    .from("ru_owner_accounts")
    .select(select)
    .eq("property_id", propertyId)
    .maybeSingle();
  if (propError) readError = propError.message ?? String(propError);
  account = (propScoped as Record<string, unknown> | null) ?? null;

  if (!account && !readError && portfolioId) {
    const { data: pfScoped, error: pfError } = await admin
      .from("ru_owner_accounts")
      .select(select)
      .eq("portfolio_id", portfolioId)
      .maybeSingle();
    if (pfError) readError = pfError.message ?? String(pfError);
    account = (pfScoped as Record<string, unknown> | null) ?? null;
  }

  /**
   * A row without an OwnerID is a leftover shell (closed account, sterilized property),
   * not a binding. Reporting it as bound made a disconnected property keep showing the
   * dead distribution login and blocked a fresh connection.
   */
  if (account && !String(account.ru_owner_id ?? "").trim() && !account.ru_api_access_key) {
    account = null;
  }


  const ownerId = String(account?.ru_owner_id ?? "").trim();
  let keysStored = Boolean(account?.ru_api_access_key);
  let keysVerified = Boolean(account?.ru_api_keys_verified_at);
  if (ownerId) {
    const { data: cred } = await admin
      .from("ru_api_credentials")
      .select("access_key, verified_at")
      .eq("ru_owner_id", ownerId)
      .maybeSingle();
    keysStored = keysStored || Boolean(cred?.access_key);
    keysVerified = keysVerified || Boolean(cred?.verified_at);
  }

  // Which other properties would be affected by re-binding this account?
  let siblingProperties: Array<{ id: string; name: string }> = [];
  if (account) {
    const scopePortfolio = (account.portfolio_id as string | null) ?? null;
    if (scopePortfolio) {
      const { data: members } = await admin
        .from("property_portfolio_members")
        .select("property_id")
        .eq("portfolio_id", scopePortfolio);
      const ids = ((members ?? []) as Array<{ property_id: string }>)
        .map((m) => m.property_id)
        .filter((id) => id && id !== propertyId);
      if (ids.length) {
        const { data: props } = await admin.from("properties").select("id, name").in("id", ids);
        siblingProperties = ((props ?? []) as Array<{ id: string; name: string }>).map((p) => ({
          id: p.id,
          name: p.name,
        }));
      }
    }
  }

  return {
    portfolio_id: portfolioId,
    account_id: (account?.id as string | undefined) ?? null,
    account_scope: (account?.portfolio_id ? "portfolio" : account ? "property" : null) as
      | "portfolio"
      | "property"
      | null,
    owner_email: (account?.owner_email as string | undefined) ?? null,
    ru_owner_id: ownerId || null,
    login_email: (account?.ru_login_email as string | undefined) ?? null,
    password_stored: Boolean(account?.ru_login_password_enc),
    keys_stored: keysStored,
    keys_verified: keysVerified,
    company_details_sent: account?.company_details_sent === true,
    sibling_properties: siblingProperties,
    read_error: readError,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing Authorization header" } }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const action: string = String(body.action ?? "");
    const propertyId: string = String(body.property_id ?? "").trim();

    /**
     * Every downstream function (cert portal, entitlement, close-user) authorises the
     * CALLER, not the service role, so all internal invokes go through this user-scoped
     * client — a service-role invoke is rejected as an invalid session.
     */
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const authed = userData?.user;
    if (!authed) {
      return json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid session" } }, 401);
    }
    const { data: roleRows } = await admin.from("user_roles").select("role").eq("user_id", authed.id);
    const roles = (roleRows ?? []) as Array<{ role: string }>;
    const isDev = roles.some((r) => r.role === "dev");
    if (!roles.some((r) => ["admin", "dev", "fearless_leader"].includes(r.role))) {
      return json({ success: false, error: { code: "FORBIDDEN", message: "Admin access required" } }, 403);
    }

    if (!propertyId) {
      return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
    }

    const { data: property } = await admin
      .from("properties")
      .select(
        "id, name, owner_email, owner_name, rentalsunited_property_id, ru_push_enabled, is_active, ru_listings_verified_units, ru_listings_expected_units, ru_listings_verified_at",
      )
      .eq("id", propertyId)
      .maybeSingle();

    if (!property) {
      return json({ success: false, error: { code: "NOT_FOUND", message: "Property not found" } }, 404);
    }

    const audit = async (summary: string, table = "properties") => {
      await admin
        .from("audit_logs")
        .insert({
          user_id: authed.id,
          user_email: authed.email ?? "unknown",
          user_role: isDev ? "dev" : "admin",
          action_type: "other",
          table_name: table,
          record_id: propertyId,
          request_origin: "edge_function",
          edge_function_name: "ru-onboard-property",
          is_sensitive: true,
          change_summary: summary,
        })
        .then(() => {}, (e: unknown) => console.warn("[ru-onboard-property] audit failed", e));
    };

    // ── gate_status ─────────────────────────────────────────────────────────
    if (action === "gate_status") {
      // Standalone-unit properties never carry a property-level listing id: publishing
      // is recorded per room type, so count those too or the panel reads "not published"
      // while every unit is live on the channel.
      const [steps, binding, unitListings] = await Promise.all([
        readSteps(admin, propertyId),
        readBinding(admin, propertyId),
        admin
          .from("hostfully_room_types")
          .select("id", { count: "exact", head: true })
          .eq("property_id", propertyId)
          .not("rentalsunited_property_id", "is", null),
      ]);

      const recordedUnits = Number(unitListings?.count ?? 0);
      const verifiedUnits = Number(property.ru_listings_verified_units ?? 0);
      const published = Boolean(property.rentalsunited_property_id) || recordedUnits > 0 || verifiedUnits > 0;

      // A stored "passed" only stays true while the evidence behind it still exists.
      // A sold/unbound property must never keep green Step A/B verdicts. A binding
      // read error is never read as "not bound".
      const downgrade: OnboardStepKey[] = [];
      if (!binding.account_id && !binding.read_error) {
        downgrade.push("monitor_step_a", "monitor_step_b", "ready_to_connect");
      } else if (binding.account_id && !published) {
        downgrade.push("monitor_step_b", "ready_to_connect");
      }
      const reason = !binding.account_id
        ? "No distribution account is bound — Step A must run again."
        : "Nothing is published at the channel — Step B must run again.";
      for (const key of downgrade) {
        const row = steps[key];
        if (!row) continue;
        // A row that is already pending still needs rewriting while it carries the
        // retired run's `details.tasks`: the panel replays those recorded outcomes,
        // so an unbound property kept showing five green Step A ticks naming the
        // account that was retired. Resetting the verdict must clear its evidence.
        const staleTasks = Array.isArray((row.details as { tasks?: unknown } | null)?.tasks);
        if (row.status === "pending" && !staleTasks) continue;
        await writeStep(admin, propertyId, {
          step_key: key,
          status: "pending",
          blocker_summary: reason,
          details: { reset_reason: reason, reset_at: new Date().toISOString() },
        });
        steps[key] = {
          ...row,
          status: "pending",
          blocker_summary: reason,
          details: { reset_reason: reason, reset_at: new Date().toISOString() },
          passed_at: null,
          last_checked_at: new Date().toISOString(),
        };
      }


      return json({
        success: true,
        property: {
          id: property.id,
          name: property.name,
          owner_email: property.owner_email ?? null,
          listing_id: property.rentalsunited_property_id ?? null,
          push_enabled: property.ru_push_enabled !== false,
          unit_listings_recorded: recordedUnits,
          unit_listings_verified: property.ru_listings_verified_units ?? null,
          unit_listings_expected: property.ru_listings_expected_units ?? null,
          listings_verified_at: property.ru_listings_verified_at ?? null,
        },
        binding,
        steps,
      });
    }



    // ── grade_ready_to_sell ─────────────────────────────────────────────────
    if (action === "grade_ready_to_sell") {
      // Local grade only: the readiness scorer answers steps 1–5 from ROL'OS data,
      // so no channel call is needed and a channel outage can never block onboarding.
      const { data: readiness, error: readinessError } = await userClient.functions.invoke("ru-cert-portal", {
        body: { action: "property_readiness", property_id: propertyId, probe_ari: false },
      });
      if (readinessError || readiness?.success !== true) {
        return json(
          {
            success: false,
            error: {
              code: "READINESS_UNAVAILABLE",
              message:
                readiness?.error?.message ?? readinessError?.message ?? "Readiness could not be evaluated right now.",
            },
          },
          502,
        );
      }

      const report = (readiness.property as { checks?: unknown } | null)?.checks
        ? readiness.property
        : readiness;
      const graded = gradeReadyToSell(report ?? null);
      if (!graded.answered) {
        return json(
          {
            success: false,
            error: { code: "READINESS_UNANSWERED", message: "Readiness returned no checks — nothing was recorded." },
          },
          502,
        );
      }

      // Persist the five content steps from this live score so a Re-check actually
      // clears identity / location / rooms / media / commercial when they pass.
      const contentKeys = new Set<string>(READY_TO_SELL_LEDGER_STEPS);
      const contentRows = mapReadinessToLedgerRows(report)
        .filter((row) => contentKeys.has(row.step_key))
        .map((row) => ({ ...row, source: "local" as const }));
      if (contentRows.length) {
        try {
          await writeLedgerRows(admin, propertyId, contentRows);
        } catch (err) {
          console.warn("[ru-onboard-property] content-step write failed", err);
        }
      }

      await writeStep(admin, propertyId, {
        step_key: "ready_to_sell",
        status: graded.passed ? "passed" : "blocked",
        blocker_summary: graded.passed ? null : graded.summary.slice(0, 2000),
        input_fingerprint: graded.fingerprint,
        details: {
          groups: READY_TO_SELL_GROUPS,
          checks_total: graded.total,
          checks_failed: graded.failing.length,
          failing: graded.failing.slice(0, 40),
          steps: contentRows.map((row) => ({
            key: row.step_key,
            status: row.status,
            blocker_summary: row.blocker_summary,
          })),
        },
      });

      return json({
        success: true,
        ready_to_sell: graded.passed,
        failing: graded.failing,
        summary: graded.summary,
        fingerprint: graded.fingerprint,
        steps: await readSteps(admin, propertyId),
      });
    }

    // ── record_step ─────────────────────────────────────────────────────────
    if (action === "record_step") {
      const stepKey = String(body.step_key ?? "") as OnboardStepKey;
      if (!["monitor_step_a", "monitor_step_b", "ready_to_connect"].includes(stepKey)) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "Unsupported step_key" } }, 400);
      }
      const status = String(body.status ?? "") as Status;
      if (!["pending", "blocked", "passed"].includes(status)) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "Unsupported status" } }, 400);
      }

      // Ordering is enforced server-side: neither monitor step may be recorded as
      // passed while an earlier gate is not green, whatever the UI does.
      const steps = await readSteps(admin, propertyId);
      if (status === "passed") {
        if (steps.ready_to_sell?.status !== "passed") {
          return json(
            {
              success: false,
              error: { code: "NOT_READY_TO_SELL", message: "Ready to sell has not been recorded for this property." },
            },
            409,
          );
        }
        if (stepKey !== "monitor_step_a" && steps.monitor_step_a?.status !== "passed") {
          return json(
            { success: false, error: { code: "STEP_A_INCOMPLETE", message: "Confirm the sub-account first." } },
            409,
          );
        }
        if (stepKey === "ready_to_connect" && steps.monitor_step_b?.status !== "passed") {
          return json(
            { success: false, error: { code: "STEP_B_INCOMPLETE", message: "Push the property and ARI first." } },
            409,
          );
        }
      }

      const details = (body.details ?? null) as Record<string, unknown> | null;
      await writeStep(admin, propertyId, {
        step_key: stepKey,
        status,
        blocker_summary: typeof body.summary === "string" ? body.summary.slice(0, 2000) : null,
        input_fingerprint: details ? ledgerFingerprint(details) : null,
        details,
      });
      if (status === "passed") await audit(`Channel onboarding: recorded ${stepKey} as passed for ${property.name}`);

      return json({ success: true, steps: await readSteps(admin, propertyId) });
    }

    // ── rebind_owner ────────────────────────────────────────────────────────
    if (action === "rebind_owner") {
      const newEmail = String(body.new_owner_email ?? "").trim().toLowerCase();
      if (!newEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(newEmail)) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "A valid new owner email is required" } }, 400);
      }
      if (body.confirm !== true) {
        return json({ success: false, error: { code: "CONFIRM_REQUIRED", message: "Confirmation is required" } }, 400);
      }

      const binding = await readBinding(admin, propertyId);
      // Never re-assign blind: a failed binding read looks like "no account", which would
      // silently skip archiving and unbinding an account that actually exists.
      if (binding.read_error) {
        return json(
          {
            success: false,
            error: {
              code: "BINDING_UNREADABLE",
              message: `The current distribution binding could not be read (${binding.read_error}). Nothing was changed — resolve the read first.`,
            },
          },
          409,
        );
      }
      if (binding.account_scope === "portfolio" && body.confirm_portfolio_scope !== true) {
        return json(
          {
            success: false,
            error: {
              code: "PORTFOLIO_SCOPED",
              message:
                `This property inherits a portfolio-wide distribution account (${binding.sibling_properties.length} other propert${binding.sibling_properties.length === 1 ? "y" : "ies"} share it). Re-binding replaces it for every property in the portfolio.`,
            },
            siblings: binding.sibling_properties,
          },
          409,
        );
      }

      const legs: Array<{ leg: string; ok: boolean; detail?: string }> = [];
      const fail = (leg: string, detail: string) => {
        legs.push({ leg, ok: false, detail });
        return json(
          {
            success: false,
            error: { code: "REBIND_FAILED", message: `${leg} failed: ${detail}` },
            legs,
          },
          502,
        );
      };

      // Leg 1 — archive this property's listings on the account it is leaving.
      if (property.rentalsunited_property_id || binding.ru_owner_id) {
        const { data: archived, error: archiveError } = await userClient.functions.invoke(
          "channel-manager-entitlement",
          {
            body: {
              scope: "property",
              entity_id: propertyId,
              enabled: false,
              include_units: true,
              notify: false,
              reason: `Owner rebind to ${newEmail} from Channel Monitor`,
            },
          },
        );
        if (archiveError) return fail("Archive listings", archiveError.message);
        const failed = Number((archived as { failed?: number } | null)?.failed ?? 0);
        legs.push({
          leg: "Archive listings",
          ok: failed === 0,
          detail: failed ? `${failed} listing(s) could not be archived at the channel` : "archived",
        });
        if (failed > 0) {
          return json(
            {
              success: false,
              error: {
                code: "ARCHIVE_INCOMPLETE",
                message:
                  "The channel did not archive every listing for this property. Nothing else was changed — resolve the archive failure before re-binding.",
              },
              legs,
            },
            502,
          );
        }
      } else {
        legs.push({ leg: "Archive listings", ok: true, detail: "no listings to archive" });
      }

      // Leg 2 — clear the local binding (listing ids, verification state).
      const { data: unbound, error: unbindError } = await userClient.functions.invoke("ru-cert-portal", {
        body: { action: "unbind_property_account", property_id: propertyId },
      });
      if (unbindError || unbound?.success !== true) {
        return fail("Unbind property", unbound?.error?.message ?? unbindError?.message ?? "unknown error");
      }
      legs.push({ leg: "Unbind property", ok: true, detail: "listing ids cleared" });

      // Leg 3 — record the new distribution login on the channel account binding and
      // drop the stale sub-account pointer so Step A resolves (or creates) the account
      // for that login from scratch.
      //
      // `properties.owner_email` is deliberately NOT touched: it identifies the owner we
      // contract with, and overwriting it here used to revoke the property's contract
      // standing (silently removing it from the Onboard picker). The channel login lives
      // on the binding only.
      const previousOwnerId = binding.ru_owner_id;
      if (binding.account_id) {
        const { error: delError } = await admin.from("ru_owner_accounts").delete().eq("id", binding.account_id);
        if (delError) return fail("Clear sub-account pointer", delError.message);
        legs.push({ leg: "Clear sub-account pointer", ok: true, detail: "account row removed" });
      }

      {
        // One account per portfolio is inherited by every member, so a portfolio member
        // records the new login portfolio-wide; a standalone property records its own.
        const scopePortfolioId = binding.portfolio_id ?? null;
        const { error: loginError } = await admin.from("ru_owner_accounts").insert({
          owner_email: newEmail,
          ru_login_email: newEmail,
          scope: scopePortfolioId ? "portfolio" : "property",
          portfolio_id: scopePortfolioId,
          property_id: scopePortfolioId ? null : propertyId,
          company_details_sent: false,
          company_details_status: "pending",
        });
        if (loginError) return fail("Re-assign distribution login", loginError.message);
        legs.push({ leg: "Re-assign distribution login", ok: true, detail: newEmail });
      }


      // Leg 4 — archive the old sub-account when nothing is bound to it any more.
      let closedAccount = false;
      if (previousOwnerId) {
        const { data: remaining } = await admin
          .from("ru_owner_accounts")
          .select("id")
          .eq("ru_owner_id", previousOwnerId);
        const stillBound = ((remaining ?? []) as Array<{ id: string }>).length;
        if (stillBound === 0) {
          const { data: closed, error: closeError } = await userClient.functions.invoke("ru-close-user", {
            body: { ru_owner_id: previousOwnerId, reason: `Owner rebind of ${property.name} to ${newEmail}` },
          });
          closedAccount = !closeError && closed?.success === true;
          legs.push({
            leg: "Archive empty sub-account",
            ok: closedAccount,
            detail: closedAccount
              ? `OwnerID ${previousOwnerId} archived`
              : closed?.error?.message ?? closeError?.message ?? "could not archive — no property is bound to it",
          });
        } else {
          legs.push({
            leg: "Archive empty sub-account",
            ok: true,
            detail: `kept — ${stillBound} other binding(s) remain`,
          });
        }
      }

      // Leg 5 — the property left the old account archived; it is now simply
      // unbound, not archived. Lift the archive/hold so it stays visible in the
      // Onboard picker and Step A can run against the new account. Push stays
      // off until Step B publishes again.
      {
        const { error: unarchiveError } = await admin
          .from("properties")
          .update({
            ru_archived: false,
            ru_archived_at: null,
            ru_hold_reason: null,
            ru_hold_set_at: null,
          })
          .eq("id", propertyId);
        if (unarchiveError) return fail("Clear archive state", unarchiveError.message);
        legs.push({ leg: "Clear archive state", ok: true, detail: "unbound, not archived" });
        await admin.from("ru_archive_events").insert({
          property_id: propertyId,
          property_name: property.name,
          direction: "reactivated",
          unit_count: 0,
          listing_count: 0,
          reason: `Owner rebind to ${newEmail} — archive lifted, awaiting Step A`,
          ru_status: "updated",
          detail: "Listings archived on the previous account; property left unbound and pushable once re-onboarded",
        });
      }

      // The monitor steps describe an account and listings that no longer exist.

      for (const key of ["monitor_step_a", "monitor_step_b", "ready_to_connect"] as OnboardStepKey[]) {
        await writeStep(admin, propertyId, {
          step_key: key,
          status: "pending",
          blocker_summary: `Reset by the owner rebind to ${newEmail}`,
          details: { rebound_at: new Date().toISOString(), previous_ru_owner_id: previousOwnerId },
        });
      }

      await audit(
        `Channel onboarding: rebound ${property.name} to ${newEmail} (previous OwnerID ${previousOwnerId ?? "—"}${
          closedAccount ? ", old sub-account archived" : ""
        })`,
      );

      return json({
        success: true,
        legs,
        new_owner_email: newEmail,
        previous_ru_owner_id: previousOwnerId,
        closed_previous_account: closedAccount,
        steps: await readSteps(admin, propertyId),
        binding: await readBinding(admin, propertyId),
      });
    }

    // ── plan_push_scope ─────────────────────────────────────────────────────
    // Read-only: what does the channel still owe for this property? Step B calls it
    // before pushing so already-published, unchanged units are never re-sent.
    if (action === "plan_push_scope") {
      const propertyId = String(body.property_id ?? "");
      if (!propertyId) {
        return json({ success: false, error: { code: "BAD_REQUEST", message: "property_id is required" } }, 400);
      }
      const plan = await planStaticPushScope(admin, propertyId);
      return json({ success: true, ...plan });
    }

    return json({ success: false, error: { code: "BAD_REQUEST", message: `Unknown action: ${action}` } }, 400);

  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    console.error("[ru-onboard-property]", message);
    return json({ success: false, error: { code: "INTERNAL", message } }, 500);
  }
});
