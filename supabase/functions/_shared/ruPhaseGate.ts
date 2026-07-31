// Rentals United — 4-phase onboarding gate.
//
// Phase 1  Owner / client onboarding (RU sub-user + company details)
// Phase 2  Property preparation inside ROLOS (readiness score)
// Phase 3  Push property + inventory (property → ARI → discounts)
// Phase 4  Verification & ongoing sync (read-back, cadence, MCQ)
//
// Every RU write walks this gate. A phase is only actionable once every
// earlier phase is `passed`.

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
  let expectedEmail: string | null = property.owner_email ?? null;
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
      if (prof?.email) expectedEmail = prof.email;
    }
  }
  const storedEmail = (account?.ru_login_email ?? account?.owner_email ?? "").trim().toLowerCase();
  const emailMismatch =
    Boolean(account?.ru_owner_id) &&
    Boolean(storedEmail) &&
    Boolean(expectedEmail) &&
    storedEmail !== expectedEmail!.trim().toLowerCase();

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
  if (!emailMismatch && account && !account.company_filled_at && account.company_details_sent !== true) {
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
    for (const g of opts.readinessGaps!.slice(0, 12)) {
      if (typeof g === "string") {
        p2Blockers.push(g);
      } else {
        const text = g.check ?? g.detail ?? g.label ?? "Readiness check failed";
        p2Blockers.push(g.unit ? `${g.unit}: ${text}` : text);
      }
    }
  }

  const { data: lastInventoryRun } = await admin
    .from("ru_sync_runs")
    .select("success, created_at, details")
    .eq("property_id", property.id)
    .eq("action", "inventory_push")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // ── Phase 3 ──
  const p3Blockers: string[] = [];
  if (!property.rentalsunited_property_id && !property.rentalsunited_building_id) {
    p3Blockers.push("Property has not been pushed to Rentals United yet (no RU PropertyID/BuildingID stored).");
  }
  if (!lastInventoryRun?.success) {
    p3Blockers.push("A complete property, availability, and price push has not succeeded for the linked RU sub-user.");
  } else if (Number(lastInventoryRun?.details?.ru_owner_id) !== Number(account?.ru_owner_id)) {
    p3Blockers.push("The latest inventory push belongs to a different RU OwnerID; re-push under the linked sub-user.");
  }

  // ── Phase 4 ──
  const p4Blockers: string[] = [];
  const verificationPassed = lastInventoryRun?.success === true
    && lastInventoryRun?.details?.verified === true
    && Number(lastInventoryRun?.details?.ru_owner_id) === Number(account?.ru_owner_id);
  const lastOkAt = verificationPassed && lastInventoryRun?.created_at ? new Date(lastInventoryRun.created_at).getTime() : 0;
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

  // A phase after a blocked phase is "pending", never "passed".
  let seenBlock = false;
  for (const ph of phases) {
    if (seenBlock) ph.status = ph.status === "blocked" ? "blocked" : "pending";
    if (ph.status !== "passed") seenBlock = true;
  }

  const current = phases.find(p => p.status !== "passed") ?? phases[phases.length - 1];
  const ownerIdNum = !emailMismatch && account?.ru_owner_id ? parseInt(account.ru_owner_id, 10) : null;

  return {
    property_id: property.id,
    phases,
    current_phase: current.key,
    ready_for_push:
      phases[0].status === "passed" && phases[1].status === "passed",
    ru_owner_id: Number.isFinite(ownerIdNum as number) ? (ownerIdNum as number) : null,
    owner_scope: scope,
    portfolio_id,
  };
}

/** Build a PHASE_BLOCKED error body for an edge function response. */
export function phaseBlockedResponse(gate: PhaseGateResult) {
  const failing = gate.phases.find(p => p.status === "blocked") ?? gate.phases[0];
  return {
    success: false,
    error: {
      code: "PHASE_BLOCKED",
      message: `Rentals United onboarding is blocked at phase ${failing.order} — ${failing.label}.`,
    },
    phase: failing.key,
    phase_order: failing.order,
    blockers: failing.blockers,
    phases: gate.phases,
  };
}
