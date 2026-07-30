// Rentals United — 4-phase onboarding gate.
//
// Phase 1  Owner / client onboarding (RU sub-user + company details)
// Phase 2  Property preparation inside ROLOS (readiness score)
// Phase 3  Push property + inventory (property → ARI → discounts)
// Phase 4  Verification & ongoing sync (read-back, cadence, MCQ)
//
// Every RU write walks this gate. A phase is only actionable once every
// earlier phase is `passed`.

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

export const RU_MASTER_OWNER_ID = 738925;

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
  }
  if (account && !account.company_filled_at && account.company_details_sent !== true) {
    p1Blockers.push("Company details have not been submitted to Rentals United (Push_FillCompanyDetails_RQ).");
  }

  // ── Phase 2 ──
  const p2Blockers: string[] = [];
  if ((property.external_system ?? "").toLowerCase() !== "roomsonline") {
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

  // ── Phase 3 ──
  const p3Blockers: string[] = [];
  if (!property.rentalsunited_property_id && !property.rentalsunited_building_id) {
    p3Blockers.push("Property has not been pushed to Rentals United yet (no RU PropertyID/BuildingID stored).");
  }

  // ── Phase 4 ──
  const p4Blockers: string[] = [];
  const { data: lastRun } = await admin
    .from("ru_sync_runs")
    .select("success, created_at")
    .eq("property_id", property.id)
    .eq("success", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastOkAt = lastRun?.created_at ? new Date(lastRun.created_at).getTime() : 0;
  const freshMs = 24 * 60 * 60 * 1000;
  if (!lastOkAt) {
    p4Blockers.push("No successful RU sync recorded yet — push and verify inventory first.");
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
        ru_owner_id: account?.ru_owner_id ?? null,
        ru_user_id: account?.ru_user_id ?? null,
        company_filled_at: account?.company_filled_at ?? null,
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
      },
    },
    {
      key: "p4_verify",
      order: 4,
      label: "Verification & ongoing sync",
      status: p4Blockers.length ? "blocked" : "passed",
      blockers: p4Blockers,
      detail: { last_success_at: lastOkAt ? new Date(lastOkAt).toISOString() : null },
    },
  ];

  // A phase after a blocked phase is "pending", never "passed".
  let seenBlock = false;
  for (const ph of phases) {
    if (seenBlock) ph.status = ph.status === "blocked" ? "blocked" : "pending";
    if (ph.status !== "passed") seenBlock = true;
  }

  const current = phases.find(p => p.status !== "passed") ?? phases[phases.length - 1];
  const ownerIdNum = account?.ru_owner_id ? parseInt(account.ru_owner_id, 10) : null;

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
