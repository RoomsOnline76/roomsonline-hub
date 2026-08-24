// Rentals United — 4-phase onboarding gate.
//
// Phase 1  Owner / client onboarding (RU sub-user + company details)
// Phase 2  Property preparation inside ROLOS (readiness score)
// Phase 3  Push property + inventory (property → ARI → discounts)
// Phase 4  Verification & ongoing sync (read-back, cadence, MCQ)
//
// Every RU write walks this gate. A phase is only actionable once every
// earlier phase is `passed`.

import { ruCompanyDetailsSatisfied } from "./ruCompanyDetails.ts";

/**
 * `properties.external_system` values that mean "ROL'OS is the PMS".
 * The DB canonical value is `roomsonline`; `rolos` variants exist in UI copy and
 * older payloads, so every check accepts the whole alias set.
 */
export const ROLOS_PMS_ALIASES = ["roomsonline", "rolos", "rol_os", "rolos_pms"];

export type PhaseKey = "p1_subuser" | "p2_readiness" | "p3_push" | "p4_verify";

export type PhaseStatus = "passed" | "blocked" | "pending";

export interface PhaseResult {
  key: PhaseKey;
  order: number;
  label: string;
  status: PhaseStatus;
  blockers: string[];
  detail: Record<string, unknown>;
}

export interface PhaseGateResult {
  property_id: string;
  phases: PhaseResult[];
  current_phase: PhaseKey;
  /** The authority for writes: Step A + Ready-to-sell ledger state. */
  step_gate?: StepGateState;
  ready_for_push: boolean;

  ru_owner_id: number | null;
  owner_scope: "portfolio" | "property" | "master";
  portfolio_id: string | null;
}

/**
 * Optional admin-only escape hatch. There is NO hardcoded master OwnerID:
 * a missing OwnerID must be treated as a hard error by callers. An explicit
 * override may only come from the RU_MASTER_OWNER_ID secret combined with an
 * explicit force/admin request flag.
 */
export function masterOwnerIdOverride(): number | null {
  const raw = Number(Deno.env.get("RU_MASTER_OWNER_ID") ?? "");
  return Number.isFinite(raw) && raw > 0 ? raw : null;
}

export interface RuOwnerAccount {
  id: string;
  owner_email: string;
  ru_owner_id: string | null;
  ru_user_id: string | null;
  ru_login_email: string | null;
  portfolio_id: string | null;
  property_id: string | null;
  scope: string | null;
  company_details_sent: boolean | null;
  company_filled_at: string | null;
  company_details_status?: string | null;
  ru_login_password_enc?: unknown;
}

/** Resolve the portfolio a property belongs to (if any). */
export async function resolvePortfolioId(
  admin: any,
  propertyId: string,
): Promise<string | null> {
  const { data } = await admin
    .from("property_portfolio_members")
    .select("portfolio_id")
    .eq("property_id", propertyId)
    .maybeSingle();
  return data?.portfolio_id ?? null;
}

/**
 * Find the RU sub-account that should own this property:
 * portfolio record → standalone property record → legacy owner-email record.
 */
export async function findOwnerAccount(
  admin: any,
  propertyId: string,
  ownerEmail?: string | null,
  portfolioId?: string | null,
): Promise<{ account: RuOwnerAccount | null; portfolio_id: string | null; scope: "portfolio" | "property" | "master" }> {
  const pid = portfolioId ?? (await resolvePortfolioId(admin, propertyId));

  if (pid) {
    const { data } = await admin
      .from("ru_owner_accounts")
      .select("*")
      .eq("portfolio_id", pid)
      .maybeSingle();
    if (data) return { account: data as RuOwnerAccount, portfolio_id: pid, scope: "portfolio" };
  }

  const { data: byProperty } = await admin
    .from("ru_owner_accounts")
    .select("*")
    .eq("property_id", propertyId)
    .maybeSingle();
  if (byProperty) return { account: byProperty as RuOwnerAccount, portfolio_id: pid, scope: "property" };

  if (ownerEmail) {
    const { data: byEmail } = await admin
      .from("ru_owner_accounts")
      .select("*")
      .eq("owner_email", ownerEmail)
      .is("portfolio_id", null)
      .is("property_id", null)
      .maybeSingle();
    if (byEmail) return { account: byEmail as RuOwnerAccount, portfolio_id: pid, scope: "property" };
  }

  return { account: null, portfolio_id: pid, scope: "master" };
}

async function userManagementEnabled(admin: any): Promise<boolean> {
  const { data } = await admin
    .from("ru_platform_settings")
    .select("value")
    .eq("key", "user_management")
    .maybeSingle();
  return (data?.value as { enabled?: boolean } | null)?.enabled === true;
}

export interface EvaluateOptions {
  /** Mandatory readiness gaps from _shared/ruReadiness (empty array = ready). */
  readinessGaps?: (string | { unit?: string | null; check?: string | null; detail?: string | null; label?: string | null })[] | null;
  /** Pass true when readiness could not be computed by the caller. */
  readinessUnknown?: boolean;
}

export interface StepGateState {
  step_a: string | null;
  ready_to_sell: string | null;
  ready: boolean;
  blockers: string[];
}

/**
 * The ONLY gate a channel write walks: the Step A / Ready-to-sell ledger.
 *
 * The retired 4-phase gate re-judged the distribution account on its own rules and
 * refused pushes that Step A had already proven (a company profile pushed before the
 * account's keys were last re-verified read as "stale"). The ledger is now authority —
 * Step A owns the account, Ready-to-sell owns mandatory steps 1–5.
 */
export async function readStepGate(admin: any, propertyId: string): Promise<StepGateState> {
  const { data } = await admin
    .from("property_channel_step_status")
    .select("step_key, status")
    .eq("property_id", propertyId)
    .in("step_key", ["monitor_step_a", "ready_to_sell"]);
  const rows = (data ?? []) as { step_key: string; status: string | null }[];
  const statusOf = (key: string) => rows.find((r) => r.step_key === key)?.status ?? null;
  const stepA = statusOf("monitor_step_a");
  const readyToSell = statusOf("ready_to_sell");

  const blockers: string[] = [];
  if (stepA !== "passed") {
    blockers.push('Step A (distribution account) has not passed yet — run Step A in the Channel Monitor.');
  }
  if (readyToSell !== "passed") {
    blockers.push('Ready to sell (mandatory steps 1–5) has not passed yet — clear the steps in the Connect a Channel wizard.');
  }
  return { step_a: stepA, ready_to_sell: readyToSell, ready: blockers.length === 0, blockers };
}

/** Evaluate all four phases for a property. */

export async function evaluatePhases(
  admin: any,
  property: {
    id: string;
    name?: string | null;
    owner_email?: string | null;
    external_system?: string | null;
    rentalsunited_property_id?: string | null;
    rentalsunited_building_id?: string | null;
  },
  opts: EvaluateOptions = {},
): Promise<PhaseGateResult> {
  const { account, portfolio_id, scope } = await findOwnerAccount(
    admin,
    property.id,
    property.owner_email ?? null,
    null,
  );
  const subUserLive = await userManagementEnabled(admin);

  // Resolve the email the sub-user *should* be registered under, so a changed
  // owner email invalidates the existing RU identity instead of silently keeping it.
  //
  // Scope matters: a portfolio-scoped sub-user is registered once for the whole
  // portfolio, so an individual property's owner_email is NOT authoritative for it.
  // Judging a portfolio account against a property email produced a phantom
  // "stale sub-user" mismatch, which nulled the OwnerID and made every push and
  // readiness dry run fail with RU_OWNER_UNRESOLVED — surfacing in the wizard as
  // a wall of untrue content/photo/pricing blockers. When the portfolio carries no
  // owner profile we simply cannot judge, so we do not.
  // The sub-user is registered under the *owner's* email. A portfolio can be created
  // by an internal ROL user (dev@/admin@), so that profile email is never authority —
  // judging the account against it nulled the OwnerID and every push failed with
  // RU_OWNER_UNRESOLVED. Authority = any real owner email attached to the portfolio's
  // properties (or this property), plus a non-internal portfolio owner profile.
  // Only the shared platform login is never authority (RU already holds it globally).
  // Other ROL mailboxes (connect@, rooms@, info@…) are legitimate owner/testing logins.
  const INTERNAL_PREFIXES = ["dev@", "noreply@", "no-reply@"];
  const isInternal = (email: string) =>
    INTERNAL_PREFIXES.some((p) => email.trim().toLowerCase().startsWith(p));


  const authorityEmails = new Set<string>();
  const addAuthority = (email?: string | null) => {
    const e = (email ?? "").trim().toLowerCase();
    if (e && !isInternal(e)) authorityEmails.add(e);
  };

  addAuthority(property.owner_email ?? null);

  if (portfolio_id) {
    const { data: pf } = await admin
      .from("property_portfolios")
      .select("owner_id")
      .eq("id", portfolio_id)
      .maybeSingle();
    if (pf?.owner_id) {
      const { data: prof } = await admin
        .from("profiles")
        .select("email")
        .eq("id", pf.owner_id)
        .maybeSingle();
      addAuthority(prof?.email ?? null);
    }
    // Owner emails of every property in the portfolio — a portfolio-scoped sub-user
    // is legitimately registered under any one of them.
    const { data: members } = await admin
      .from("property_portfolio_members")
      .select("property_id")
      .eq("portfolio_id", portfolio_id);
    const ids = (members ?? []).map((m: { property_id: string }) => m.property_id).filter(Boolean);
    if (ids.length > 0) {
      const { data: props } = await admin.from("properties").select("owner_email").in("id", ids);
      for (const p of props ?? []) addAuthority((p as { owner_email?: string | null }).owner_email);
    }
  }

  const storedEmail = (account?.ru_login_email ?? account?.owner_email ?? "").trim().toLowerCase();
  // A sub-account that already exists at the channel is its own authority: the login was
  // registered there and cannot be re-pointed, and internal ROL addresses (connect@, rooms@…)
  // are legitimate owner/testing logins. So a live sub-user is never "stale" — only a
  // property with no sub-user at all still needs the owner email to create one.
  if (account?.ru_owner_id && storedEmail) authorityEmails.add(storedEmail);
  const expectedEmail: string | null = authorityEmails.size > 0 ? [...authorityEmails][0] : null;
  const emailMismatch = false;





  // ── Phase 1 ──
  const p1Blockers: string[] = [];
  if (!subUserLive) {
    p1Blockers.push(
      "RU user management is parked. Enable it on the Users tab before onboarding a sub-account.",
    );
  }
  if (!account?.ru_owner_id) {
    p1Blockers.push(
      portfolio_id
        ? "No Rentals United sub-user exists for this portfolio. Create it first (Push_CreateUser_RQ)."
        : "No Rentals United sub-user exists for this property owner. Create it first (Push_CreateUser_RQ).",
    );
  } else if (emailMismatch) {
    p1Blockers.push(
      `The owner email changed to ${expectedEmail} — the existing Rentals United sub-user (${storedEmail}) is stale. Re-run "Create sub-user" to register the new email.`,
    );
  }
  const companyDetails = account
    ? await ruCompanyDetailsSatisfied(admin, account.ru_owner_id, account)
    : { satisfied: false, via: "none" as const };
  if (!emailMismatch && account && !companyDetails.satisfied) {
    p1Blockers.push("Company details have not been submitted to Rentals United (Push_FillCompanyDetails_RQ) \u2014 run \"Complete company details\".");
  }


  // ── Phase 2 ──
  const p2Blockers: string[] = [];
  // `roomsonline` is the canonical DB value; `rolos` (and variants) appear in older
  // payloads and UI copy for the same PMS, so all aliases must pass this gate.
  if (!ROLOS_PMS_ALIASES.includes((property.external_system ?? "").trim().toLowerCase())) {
    p2Blockers.push("Property is not on ROLOS as PMS (external_system must be 'roomsonline').");
  }

  if (opts.readinessUnknown) {
    p2Blockers.push("Readiness could not be scored — run the readiness scorecard.");
  } else if ((opts.readinessGaps ?? []).length > 0) {
    // Show EVERY mandatory gap — a truncated list made owners fix 12 items and get blocked again.
    // Gaps that repeat identically across units come from an inherited property value
    // (coordinates, address, policies): report them once, property-level, instead of once per
    // unit — four copies of "Latitude / longitude are missing" told nobody where to fix it.
    const perText = new Map<string, string[]>();
    const plain: string[] = [];
    for (const g of opts.readinessGaps!) {
      if (typeof g === "string") {
        plain.push(g);
        continue;
      }
      const text = g.check ?? g.detail ?? g.label ?? "Readiness check failed";
      const units = perText.get(text) ?? [];
      if (g.unit) units.push(g.unit);
      perText.set(text, units);
    }
    p2Blockers.push(...plain);
    for (const [text, units] of perText) {
      if (units.length <= 1) {
        p2Blockers.push(units[0] ? `${units[0]}: ${text}` : text);
      } else {
        p2Blockers.push(text);
      }
    }
  }


  const { data: inventoryRuns } = await admin
    .from("ru_sync_runs")
    .select("success, created_at, details")
    .eq("property_id", property.id)
    .eq("action", "inventory_push")
    .order("created_at", { ascending: false })
    .limit(20);
  const runs = (inventoryRuns ?? []) as { success: boolean; created_at: string; details: Record<string, unknown> | null }[];
  const lastInventoryRun = runs[0] ?? null;
  const sameOwner = (r: typeof runs[number]) =>
    Number((r.details as { ru_owner_id?: unknown } | null)?.ru_owner_id) === Number(account?.ru_owner_id);
  // Phase 3 asks "has a complete owner-scoped push ever succeeded?" — a later partial failure
  // (e.g. one unit's ARI rejected because RU holds a reservation) must not un-complete it.
  const lastGoodPush = runs.find((r) => r.success === true && sameOwner(r)) ?? null;
  const lastVerifiedPush = runs.find(
    (r) => r.success === true && sameOwner(r) && (r.details as { verified?: unknown } | null)?.verified === true,
  ) ?? null;

  // ── Phase 3 ──
  // Multi-unit properties are pushed standalone: each unit carries its own RU PropertyID and
  // the property row stays null (building links are retired on purpose). Count those unit IDs,
  // otherwise a fully pushed multi-unit property never leaves phase 3.
  const { data: unitRuRows } = await admin
    .from("hostfully_room_types")
    .select("id, name, is_active, rentalsunited_property_id")
    .eq("property_id", property.id);
  const activeUnits = (unitRuRows ?? []).filter(
    (r: { is_active: boolean | null }) => r.is_active !== false,
  ) as { id: string; name: string | null; rentalsunited_property_id: string | number | null }[];
  const pushedUnits = activeUnits.filter((r) => {
    const n = Number(r.rentalsunited_property_id);
    return Number.isFinite(n) && n > 0;
  });
  const unitRuIds = pushedUnits.map((r) => Number(r.rentalsunited_property_id));
  const missingUnits = activeUnits.filter((r) => !pushedUnits.includes(r));
  // Every active unit is live at the channel — that IS a complete inventory push, even when the
  // run row was flagged failed by a transient per-unit transport error on an earlier attempt.
  const fullUnitCoverage = activeUnits.length > 0 && missingUnits.length === 0;

  const p3Blockers: string[] = [];
  const nothingPushed =
    !property.rentalsunited_property_id && !property.rentalsunited_building_id && unitRuIds.length === 0;
  if (nothingPushed) {
    p3Blockers.push('Not published to Rentals United yet — run "Push to Rentals United".');
  } else if (!lastGoodPush && !fullUnitCoverage) {
    if (lastInventoryRun?.success && !sameOwner(lastInventoryRun)) {
      p3Blockers.push("The latest inventory push belongs to a different RU OwnerID; re-push under the linked sub-user.");
    } else {
      // Name what Rentals United rejected. This is a channel-side result, never a statement
      // about local rate/availability completeness (that is phase 2 / readiness).
      const failedUnits = Array.isArray((lastInventoryRun?.details as { units?: unknown })?.units)
        ? ((lastInventoryRun!.details as { units: { name?: string; success?: boolean; error?: string }[] }).units)
            .filter((u) => u?.success === false)
        : [];
      const detail = failedUnits.length
        ? failedUnits
            .slice(0, 4)
            .map((u) => `${u.name ?? "unit"} — ${u.error ?? "rejected by Rentals United"}`)
            .join("; ")
        : missingUnits
            .slice(0, 4)
            .map((u) => u.name ?? "unit")
            .join(", ");
      p3Blockers.push(
        `Rentals United has not accepted the full inventory yet: ${missingUnits.length} of ${activeUnits.length} unit(s) are not live at the channel${detail ? ` (${detail})` : ""}. Re-run the push — local rates and availability are scored separately in phase 2.`,
      );
    }
  }



  // ── Phase 4 ──
  const p4Blockers: string[] = [];
  const verificationPassed = Boolean(lastVerifiedPush);
  const lastOkAt = lastVerifiedPush ? new Date(lastVerifiedPush.created_at).getTime() : 0;
  const freshMs = 24 * 60 * 60 * 1000;
  if (!lastOkAt) {
    p4Blockers.push("No owner-scoped RU content, availability, and price verification has passed yet.");
  } else if (Date.now() - lastOkAt > freshMs) {
    p4Blockers.push("Last successful RU sync is older than 24 hours — re-verify before ordering the quality check.");
  }


  const phases: PhaseResult[] = [
    {
      key: "p1_subuser",
      order: 1,
      label: "Owner onboarding (RU sub-user)",
      status: p1Blockers.length ? "blocked" : "passed",
      blockers: p1Blockers,
      detail: {
        scope,
        portfolio_id,
        // A stale identity (owner email changed) is reported as no sub-user so the
        // UI falls back to the "Create sub-user" step instead of "Complete company details".
        ru_owner_id: emailMismatch ? null : account?.ru_owner_id ?? null,
        ru_user_id: emailMismatch ? null : account?.ru_user_id ?? null,
        stale_ru_owner_id: emailMismatch ? account?.ru_owner_id ?? null : null,
        email_mismatch: emailMismatch,
        expected_owner_email: expectedEmail,
        company_filled_at: emailMismatch ? null : account?.company_filled_at ?? null,
        company_details_status: emailMismatch ? null : account?.company_details_status ?? null,
        // True when RU company details can only be completed with an operator-supplied
        // sub-user password (adopted accounts) — surfaced so the UI can prompt for it.
        company_details_manual_required:
          !emailMismatch && Boolean(account) && !account?.company_filled_at && !account?.ru_login_password_enc,
        user_management_enabled: subUserLive,
      },

    },
    {
      key: "p2_readiness",
      order: 2,
      label: "Property preparation in ROLOS",
      status: p2Blockers.length ? "blocked" : "passed",
      blockers: p2Blockers,
      detail: { gap_count: (opts.readinessGaps ?? []).length, external_system: property.external_system ?? null },
    },
    {
      key: "p3_push",
      order: 3,
      label: "Push property + inventory",
      status: p3Blockers.length ? "blocked" : "passed",
      blockers: p3Blockers,
      detail: {
        ru_property_id: property.rentalsunited_property_id ?? null,
        ru_building_id: property.rentalsunited_building_id ?? null,
        ru_unit_property_ids: unitRuIds,
        ru_owner_id: account?.ru_owner_id ?? null,
        inventory_push_at: lastInventoryRun?.created_at ?? null,
      },
    },
    {
      key: "p4_verify",
      order: 4,
      label: "Verification & ongoing sync",
      status: p4Blockers.length ? "blocked" : "passed",
      blockers: p4Blockers,
      detail: { last_success_at: lastOkAt ? new Date(lastOkAt).toISOString() : null, verified: verificationPassed, ru_owner_id: account?.ru_owner_id ?? null },
    },
  ];

  // A phase after a blocked phase is "pending", never "passed". Phases are INFORMATIONAL
  // only — they never veto a write. `ready_for_push` comes from the Step A / Ready-to-sell
  // ledger below.
  let seenBlock = false;
  for (const ph of phases) {
    if (seenBlock) ph.status = ph.status === "blocked" ? "blocked" : "pending";
    if (ph.status !== "passed") seenBlock = true;
  }

  const current = phases.find(p => p.status !== "passed") ?? phases[phases.length - 1];
  const ownerIdNum = !emailMismatch && account?.ru_owner_id ? parseInt(account.ru_owner_id, 10) : null;
  const stepGate = await readStepGate(admin, property.id);

  return {
    property_id: property.id,
    phases,
    current_phase: current.key,
    step_gate: stepGate,
    ready_for_push: stepGate.ready,
    ru_owner_id: Number.isFinite(ownerIdNum as number) ? (ownerIdNum as number) : null,
    owner_scope: scope,
    portfolio_id,
  };
}

/**
 * Error body for a write refused because the Step A / Ready-to-sell ledger is not clear.
 * No phase wording: the operator's only onboarding path is Step A then Step B.
 */
export function pushBlockedResponse(gate: PhaseGateResult) {
  const blockers = gate.step_gate?.blockers ?? ["Channel onboarding has not been completed for this property."];
  return {
    success: false,
    error: {
      code: "ONBOARDING_INCOMPLETE",
      message: blockers[0],
    },
    blockers,
    step_gate: gate.step_gate ?? null,
  };
}

