import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { calculateBedCapacity } from "@/lib/bedConfig";
import { supabase } from "@/integrations/supabase/client";
import {
  markChannelStepsStale,
  recordChannelStepPass,
  isChannelStepLedgerEnabled,
  fetchChannelLedger,
  seedChannelLedger,
  recheckChannelLedger,
  ledgerStepComplete,
  ledgerHasVerdict,
  type ChannelLedgerSnapshot,
  type ChannelLedgerStep,
  type ChannelLedgerStatus,
} from "@/lib/channelStepLedger";


import { usePropertyReadiness, type ReadinessItem } from "@/hooks/usePropertyReadiness";

/** The five Ready-to-sell steps. Kept local to avoid a config ↔ hook import cycle. */
const READY_TO_SELL_KEYS = ["identity", "location", "rooms", "media", "commercial"];
const isReadyToSellMacro = (key: string) => READY_TO_SELL_KEYS.includes(key);
import { useAuth } from "@/hooks/useAuth";
import { useBillingConfig } from "@/hooks/useBillingConfig";
import {
  ROLOS_ONBOARDING_MACROS,
  ROLOS_SIGNOFF_CHECKLIST,
  type DistributionCheckKey,
  type MacroDef,
} from "@/config/rolosOnboardingMacros";
import { isDistributionBound, unboundDependentDetail } from "@/lib/channelDistributionGate";
import { onRuAccountsChanged } from "@/lib/ruAccountsSignal";


/**
 * ROL'OS Channel Readiness progress model.
 *
 * Composes three existing sources of truth — never a fourth:
 *  • `usePropertyReadiness` for field-level mandatory / recommended items,
 *  • `ru-cert-portal` (`phase_status`, `property_ru_identity`) for distribution state,
 *  • the property's billing config for the Channel Manager entitlement.
 *
 * Manual sign-off is persisted in `property_onboarding_roadmap.roadmap.channel_readiness`.
 */

const ROLOS_PMS_VALUES = new Set(["roomsonline", "rolos", "rol_os", "rolos_pms"]);

export interface DistributionFailure {
  label: string;
  detail?: string;
  /** Unit the failure belongs to (multi-unit properties). */
  unit?: string;
  mandatory: boolean;
}

export interface DistributionCheck {
  key: DistributionCheckKey;
  label: string;
  ok: boolean;
  /** Unknown = not yet resolvable (upstream unreachable). Advisory, never blocks. */
  unknown?: boolean;
  /**
   * Waiting = the check cannot be judged until an earlier distribution action
   * happens (the property is not bound yet). It still holds its step open, but
   * there is no field to fix, so the UI must not offer one.
   */
  waiting?: boolean;
  detail?: string;
  hint?: string;
  /**
   * Individual failing points behind this check, kept separate so the wizard can
   * route each one to the editor section (and unit) that actually owns it.
   */
  failures?: DistributionFailure[];
}



export interface MacroProgress {
  macro: MacroDef;
  /** Field items owned by the macro (mandatory + recommended). */
  fieldItems: ReadinessItem[];
  mandatoryOutstanding: number;
  recommendedOutstanding: number;
  stateChecks: DistributionCheck[];
  /** Mandatory-only completion, 0-100. */
  score: number;
  complete: boolean;
  /**
   * Soft gate. Every step stays viewable; `locked` only means the step's own
   * action cannot run yet (see `actionBlockedReason`).
   */
  locked: boolean;
  /** Plain-English reason the step's action cannot run yet. */
  actionBlockedReason?: string;
  /** Phase 3 ledger row status, when the step ledger is driving this step. */
  ledgerStatus?: ChannelLedgerStatus;
  /** Ledger says the underlying data moved — the step wants a quick refresh. */
  needsRefresh?: boolean;
  /** Channel confirmation is pending; the last successful check still counts. */
  channelPending?: boolean;
  outstandingLabels: string[];
}


interface RuGroup {
  group: string;
  total: number;
  passed: number;
  failed: { label: string; detail?: string; unit?: string; mandatory: boolean }[];
}

interface PhaseStatusPayload {
  gate?: {
    phases?: { key: string; status: string; blockers?: string[] }[];
    ready_for_push?: boolean;
    ru_owner_id?: number | null;
  };
  readiness?: { groups?: RuGroup[]; blocking_gaps?: string[] } | null;
  last_mcq?: { status?: string; ru_status_id?: string | null; ordered_at?: string } | null;
}

interface IdentityPayload {
  property?: { is_rolos?: boolean; ru_property_id?: string | null };
  account?: {
    ru_owner_id?: string | null;
    owner_email?: string | null;
    ru_login_email?: string | null;
    company_details_sent?: boolean | null;
    company_details_status?: string | null;
    company_filled_at?: string | null;
    /** Push_FillCompanyDetails_RQ actually ran with the verified key pair. */
    company_details_pushed?: boolean | null;
  } | null;
  keys?: { verified_at?: string | null; access_key_last4?: string | null } | null;
  keys_captured?: boolean;
  push_gated?: boolean;
  gate_reason?: string | null;
}

export interface SignoffCheckRecord {
  checked: boolean;
  by?: string | null;
  at?: string | null;
}

export interface RolosOnboardingSignoff {
  signed_off: boolean;
  signed_off_by?: string | null;
  signed_off_at?: string | null;
  note?: string | null;
  /** Per-item manual verification ticks (step 10). */
  checks: Record<string, SignoffCheckRecord>;
  /** Push_FillCompanyDetails_RQ has run with the verified key pair. */
  companyDetailsPushed?: boolean;
  companyDetailsAt?: string | null;
  /** Checklist items that cannot be ticked yet, and why (channel evidence missing). */
  lockedItems?: string[];
}


async function invokeCert<T>(
  action: string,
  propertyId: string,
  extra: Record<string, unknown> = {},
): Promise<T | null> {
  try {
    const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
      body: { action, property_id: propertyId, ...extra },
    });
    if (error || data?.success !== true) return null;
    return data as T;
  } catch {
    return null;
  }
}

const ARI_GROUPS = ["Availability 365d", "Pricing 365d"];

export function useRolosOnboardingProgress(propertyId?: string | null) {
  const queryClient = useQueryClient();
  const { isAdmin } = useAuth();

  /**
   * Phase 3 — channel step ledger.
   *
   * When the rollout flag is on and the property has seeded rows, the wizard reads
   * its step verdicts from `property_channel_step_status` instead of re-grading on
   * mount. With the flag off every query below behaves exactly as it did before.
   */
  const ledgerFlagQuery = useQuery({
    queryKey: ["channel-step-ledger-enabled"],
    queryFn: isChannelStepLedgerEnabled,
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
  const ledgerEnabled = ledgerFlagQuery.data === true;

  const seededOnce = useRef<string | null>(null);
  const gradedOnce = useRef<string | null>(null);
  const ledgerQuery = useQuery({
    queryKey: ["channel-step-ledger", propertyId],
    enabled: !!propertyId && ledgerEnabled,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    // A save in another tab / page re-grades the ledger; always read it fresh on mount
    // so the wizard never shows the pre-fix verdict.
    refetchOnMount: "always" as const,
    queryFn: async (): Promise<ChannelLedgerSnapshot | null> => {
      const id = propertyId as string;
      let snapshot = await fetchChannelLedger(id);
      if (!snapshot?.enabled) return snapshot;
      if (snapshot.steps.length === 0) {
        // Seed exactly once per property — a repeat mount must never re-seed.
        if (seededOnce.current === id) return snapshot;
        seededOnce.current = id;
        snapshot = (await seedChannelLedger(id)) ?? snapshot;
      }
      /**
       * Seeding only creates `pending` rows. Until something grades them the ledger
       * holds no verdicts, so grade once (local only — never a channel probe) so the
       * first visit records real verdicts instead of 14 empty rows.
       */
      const hasVerdict = snapshot.steps.some((step) => ledgerHasVerdict(step));
      if (!hasVerdict && gradedOnce.current !== id) {
        gradedOnce.current = id;
        snapshot = (await recheckChannelLedger(id, { allowChannelProbe: false })) ?? snapshot;
      }
      return snapshot;
    },
  });

  const ledgerSteps = ledgerQuery.data?.steps ?? [];
  /**
   * The ledger only drives the wizard once it actually holds a verdict. Ungraded
   * `pending` rows must not switch the wizard off its local grading path.
   */
  const ledgerActive =
    ledgerEnabled &&
    ledgerQuery.data?.enabled === true &&
    ledgerSteps.some((step) => ledgerHasVerdict(step));
  const ledgerByStep = useMemo(() => {
    const map = new Map<string, ChannelLedgerStep>();
    for (const step of ledgerSteps) map.set(String(step.step_key), step);
    return map;
  }, [ledgerSteps]);

  const readiness = usePropertyReadiness(propertyId, {
    // On the ledger path the durable rows already hold the server verdicts, so the
    // wizard does not re-grade (no `check-activation-readiness`, no channel report).
    backendChecks: !ledgerActive,
    channelChecks: !ledgerActive,
  });

  const { config: billing } = useBillingConfig(propertyId ?? undefined);
  /**
   * Live channel probes are expensive and rate limited. They run on an explicit
   * refresh only — a probe on every mount made the wizard flip green steps to
   * grey whenever the channel throttled us.
   */
  const [probeAri, setProbeAri] = useState(false);
  /** Last successful ARI verdict, reused when a later probe comes back empty. */
  const ariCache = useRef<{ propertyId: string; groups: RuGroup[]; at: number } | null>(null);

  /**
   * The channel scorecard (`phase_status`) is by far the slowest call in the wizard, so it
   * runs in its OWN query. The local/field truth below paints immediately and the
   * distribution verdict fills in when it lands.
   */
  const phaseQuery = useQuery({
    queryKey: ["rolos-onboarding-phase", propertyId, probeAri],
    // Ledger path: the scorecard only runs for an explicit channel recheck. Its
    // absence degrades to local ROL'OS truth (advisory `unknown`), never a blocker.
    enabled: !!propertyId && (!ledgerActive || probeAri),

    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const id = propertyId as string;
      const phase = await invokeCert<PhaseStatusPayload>("phase_status", id, probeAri ? { probe_ari: true } : {});
      // Keep the last good availability / pricing verdict instead of dropping the
      // groups when a probe is skipped or throttled — losing them silently
      // un-completed steps the owner had already finished.
      const groups = (phase?.readiness?.groups ?? []) as RuGroup[];
      const freshAri = groups.filter((g) => ARI_GROUPS.includes(String(g.group ?? "")));
      let ariAge: number | null = null;
      if (freshAri.length > 0) {
        ariCache.current = { propertyId: id, groups: freshAri, at: Date.now() };
      } else if (ariCache.current?.propertyId === id && phase?.readiness) {
        phase.readiness.groups = [...groups, ...ariCache.current.groups];
        ariAge = ariCache.current.at;
      }
      return { phase, ariAge };
    },
  });

  const distribution = useQuery({
    queryKey: ["rolos-onboarding-distribution", propertyId],
    enabled: !!propertyId,
    // Field truth is cheap and re-derived on mount; the channel snapshot is held
    // briefly so tab navigation does not re-run the whole derivation.
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const id = propertyId as string;
      const [property, identity, currency, channels, roadmap, units] = await Promise.all([
        supabase
          .from("properties")
          .select("id, name, description, max_guests, address, city, country, postal_code, latitude, longitude, owner_email, show_on_website, external_system, timezone, ru_location_id, amenities, rentalsunited_property_id, ru_listings_verified_at, ru_listings_verified_units, ru_listings_expected_units")
          .eq("id", id)
          .maybeSingle()
          .then((r) => (r.data ?? null) as Record<string, unknown> | null),
        invokeCert<IdentityPayload>("property_ru_identity", id),
        supabase
          .from("ru_currency_state")
          .select("verified_at, published_currency_iso, ru_reported_currency_iso, location_currency_iso")
          .eq("property_id", id)
          .maybeSingle()
          .then((r) => r.data),
        supabase
          .from("rolos_channel_connections")
          .select("channel_name, status")
          .eq("property_id", id)
          .then((r) => r.data ?? []),
        supabase
          .from("property_onboarding_roadmap")
          .select("roadmap")
          .eq("property_id", id)
          .maybeSingle()
          .then((r) => r.data),
        supabase
          .from("hostfully_room_types")
          .select("id, name, is_active, rentalsunited_property_id, max_guests, bed_configuration")
          .eq("property_id", id)
          .then((r) => r.data ?? []),
      ]);
      // Owner agreement state. Signing happens outside the wizard (contract portal),
      // so the wizard resolves it live instead of assuming a stale snapshot.
      const ownerEmail = String((property?.owner_email as string | undefined) ?? "").trim();
      const [ownerContract, legacyContract] = await Promise.all([
        ownerEmail
          ? supabase
              .from("owner_contracts")
              .select("status, signed_at, created_at")
              .ilike("owner_email", ownerEmail)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
              .then((r) => r.data)
          : Promise.resolve(null),
        supabase
          .from("property_contracts")
          .select("status, signed_at, created_at")
          .eq("property_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle()
          .then((r) => r.data),
      ]);
      const contract = (() => {
        const signed = (c: { status?: string | null } | null) =>
          ["signed", "overridden"].includes(String(c?.status ?? "").toLowerCase());
        if (signed(ownerContract)) return ownerContract;
        if (signed(legacyContract)) return legacyContract;
        return ownerContract ?? legacyContract ?? null;
      })();
      return { property, identity, currency, channels, roadmap, units, contract, ownerEmail };
    },
  });

  const d = useMemo(
    () => (distribution.data
      ? { ...distribution.data, phase: phaseQuery.data?.phase ?? null, ariAge: phaseQuery.data?.ariAge ?? null }
      : undefined),
    [distribution.data, phaseQuery.data],
  );


  const isRolosPms = useMemo(() => {
    const sys = String((d?.property as any)?.external_system ?? "").toLowerCase();
    return ROLOS_PMS_VALUES.has(sys);
  }, [d?.property]);

  /**
   * The owner signs the agreement in a separate surface (contract portal / email link),
   * so the wizard listens for contract writes and re-derives itself the moment one lands.
   * Without this the step only flipped after a hard reload.
   */
  useEffect(() => {
    if (!propertyId) return;
    const bump = () => {
      void queryClient.invalidateQueries({ queryKey: ["rolos-onboarding-distribution", propertyId] });
      void queryClient.invalidateQueries({ queryKey: ["rolos-onboarding-phase", propertyId] });
      void queryClient.invalidateQueries({ queryKey: ["property-readiness", propertyId] });
      void queryClient.invalidateQueries({ queryKey: ["owner-contract"] });
    };
    const channel = supabase
      .channel(`rolos-onboarding-contract-${propertyId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "owner_contracts" }, bump)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "property_contracts", filter: `property_id=eq.${propertyId}` },
        bump,
      )
      .subscribe();
    // Keys are captured in the owner panel, which lives outside this hook's data. Without this
    // listener step 7 kept reading "No key pair captured" until a hard reload.
    const offAccounts = onRuAccountsChanged(bump);
    return () => {
      offAccounts();
      void supabase.removeChannel(channel);
    };
  }, [propertyId, queryClient]);

  /**
   * Company details are only "correct" once Push_FillCompanyDetails_RQ has run
   * with the verified sub-account key pair. Until then the checklist item stays
   * locked — a flag inferred from verified credentials is not a push.
   */
  const companyDetailsPushed = d?.identity?.account?.company_details_pushed === true;

  const signoff: RolosOnboardingSignoff = useMemo(() => {
    const raw = ((d?.roadmap as any)?.roadmap ?? {}) as Record<string, unknown>;
    const cr = (raw.channel_readiness ?? {}) as Record<string, unknown>;
    const stored = (cr.checks ?? {}) as Record<string, SignoffCheckRecord>;
    const checks = { ...stored };
    // A previously stored tick cannot stand in for a push that has not happened.
    if (!companyDetailsPushed) delete checks.company_details;
    // The step is signed off only when every checklist item is ticked.
    const allTicked = ROLOS_SIGNOFF_CHECKLIST.every((item) => checks[item.key]?.checked === true);
    const lastTick = ROLOS_SIGNOFF_CHECKLIST.map((i) => checks[i.key])
      .filter((c): c is SignoffCheckRecord => !!c?.checked)
      .sort((a, b) => String(b.at ?? "").localeCompare(String(a.at ?? "")))[0];
    return {
      signed_off: allTicked,
      signed_off_by: (cr.signed_off_by as string) ?? lastTick?.by ?? null,
      signed_off_at: (cr.signed_off_at as string) ?? lastTick?.at ?? null,
      note: (cr.note as string) ?? null,
      checks,
      companyDetailsPushed,
      companyDetailsAt: d?.identity?.account?.company_filled_at ?? null,
      lockedItems: companyDetailsPushed ? [] : ["company_details"],
    };
  }, [companyDetailsPushed, d?.identity?.account?.company_filled_at, d?.roadmap]);

  /**
   * Step 9 — "Pull listings (if any)". Outcome of the last discovery run against the
   * sub-account, persisted alongside the sign-off in the roadmap row so the step
   * stays green across sessions (an empty sub-account is a valid pass).
   */
  const listingPull = useMemo(() => {
    const raw = ((d?.roadmap as any)?.roadmap ?? {}) as Record<string, unknown>;
    const cr = (raw.channel_readiness ?? {}) as Record<string, unknown>;
    const lp = (cr.listing_pull ?? null) as
      | {
          at?: string;
          by?: string | null;
          matched?: number;
          unmatched?: number;
          remote_count?: number;
          account?: string | null;
          owner_id?: string | null;
          auth_mode?: string | null;
        }
      | null;
    if (!lp || !lp.at) return null;
    const boundOwnerId = String(d?.identity?.account?.ru_owner_id ?? "").trim();
    const pulledOwnerId = String(lp.owner_id ?? "").trim();
    return {
      at: String(lp.at),
      by: lp.by ?? null,
      matched: Number(lp.matched ?? 0),
      unmatched: Number(lp.unmatched ?? 0),
      remoteCount: Number(lp.remote_count ?? 0),
      /** The distribution sub-account the pull actually authenticated as. */
      account: lp.account ?? null,
      ownerId: pulledOwnerId || null,
      authMode: lp.auth_mode ?? null,
      /**
       * A pull recorded against a different OwnerID than the one now bound is
       * evidence about another account — it must not keep the step green, or the
       * card reports listings from an account this property no longer uses.
       */
      stale: !!boundOwnerId && !!pulledOwnerId && boundOwnerId !== pulledOwnerId,
      boundOwnerId: boundOwnerId || null,
    };
  }, [d?.identity?.account?.ru_owner_id, d?.roadmap]);





  const stateChecks = useMemo(() => {
    const map = new Map<DistributionCheckKey, DistributionCheck>();
    const prop = (d?.property ?? {}) as Record<string, unknown>;
    const groups = (d?.phase?.readiness?.groups ?? []) as RuGroup[];
    const group = (name: string) => groups.find((g) => g.group === name) ?? null;

    const put = (
      key: DistributionCheckKey,
      label: string,
      ok: boolean,
      extra?: Partial<DistributionCheck>,
    ) => map.set(key, { key, label, ok, ...extra });

    /**
     * When the live publish probe is unavailable we no longer report the check as
     * "still open" — the wizard judges it locally from the ROL'OS record it already
     * has, so authored content is shown as satisfied instead of a dead-end blocker.
     */
    const groupCheck = (
      key: DistributionCheckKey,
      label: string,
      name: string,
      fallback?: () => { ok: boolean; detail: string },
    ) => {
      const g = group(name);
      if (!g) {
        const local = fallback?.();
        if (local) {
          put(key, label, local.ok, {
            detail: `${local.detail} (checked in ROL'OS — live publish check unavailable)`,
            unknown: !local.ok,
          });
          return;
        }
        put(key, label, false, { unknown: true, detail: "Not yet resolvable — publish checks unavailable." });
        return;
      }
      const failed = g.failed ?? [];
      // Only mandatory failures may hold a step open — advisory quality advice is
      // reported in the detail line but never blocks the wizard.
      const blocking = failed.filter((f) => f.mandatory !== false);
      const shown = blocking.length ? blocking : failed;
      put(key, label, blocking.length === 0, {
        detail:
          failed.length === 0
            ? `${g.passed}/${g.total} checks passed`
            : shown
                .slice(0, 4)
                .map((f) => `${f.unit ? `${f.unit}: ` : ""}${f.detail ?? f.label}`)
                .join(" · "),
        failures: shown.map((f) => ({
          label: f.label,
          detail: f.detail,
          unit: f.unit,
          mandatory: f.mandatory !== false,
        })),
      });
    };



    // Macro 1 — identity
    const contract = (d?.contract ?? null) as { status?: string | null; signed_at?: string | null } | null;
    const contractStatus = String(contract?.status ?? "").toLowerCase();
    const contractOk = contractStatus === "signed" || contractStatus === "overridden";
    put("contract_signed", "Owner agreement signed", contractOk, {
      detail: contractOk
        ? `Signed${contract?.signed_at ? ` ${new Date(contract.signed_at).toLocaleDateString()}` : ""}`
        : contractStatus
          ? `Agreement ${contractStatus} — awaiting signature`
          : "No agreement on record",
      hint: "General → Contract & agreement",
    });

    const tz = String(prop.timezone ?? "").trim();
    // ROL'OS stores canonical IANA zones (for example Africa/Johannesburg),
    // while some imported properties use a fixed UTC offset. Both are valid
    // configured timezone values; rejecting IANA values made this wizard
    // disagree with the unified readiness tracker.
    const timezoneConfigured = /^UTC[+-]\d{2}:\d{2}$/.test(tz) || /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)+$/.test(tz);
    put("timezone_format", "Timezone configured", timezoneConfigured, {
      detail: tz || "Not set",
      hint: "Identity & Location → Timezone",
    });
    groupCheck("content_quality", "Description & content depth", "Content", () => {
      const nm = String(prop.name ?? "").trim();
      const desc = String(prop.description ?? "").trim();
      const sleeps = Number(prop.max_guests ?? 0);
      const missing: string[] = [];
      if (nm.length < 3) missing.push("name");
      if (desc.length < 100) missing.push(desc ? `description (${desc.length}/100 characters)` : "description");
      if (!(sleeps >= 1)) missing.push("max guests");
      return {
        ok: missing.length === 0,
        detail: missing.length === 0 ? `Name, description (${desc.length} characters) and occupancy authored` : `Outstanding: ${missing.join(", ")}`,
      };
    });

    /**
     * The channel groups every content check — including the per-unit check-in /
     * check-out rules — under "Content". Those unit-scoped failures are edited in
     * Rooms, so leaving them on step 1 made identity report room errors while the
     * owning step stayed green. Split them onto their own rooms-owned check.
     */
    {
      const content = map.get("content_quality");
      const all = content?.failures ?? [];
      const unitFailures = all.filter((f) => !!f.unit);
      const propertyFailures = all.filter((f) => !f.unit);
      if (content) {
        const blockingProperty = propertyFailures.filter((f) => f.mandatory);
        map.set("content_quality", {
          ...content,
          ok: content.unknown ? content.ok : blockingProperty.length === 0,
          failures: propertyFailures,
          detail: propertyFailures.length
            ? propertyFailures.slice(0, 4).map((f) => f.detail ?? f.label).join(" · ")
            : content.unknown
              ? content.detail
              : "Property content checks passed",
        });
      }
      // Stay times are authored on the Policies tab (macro 5 — commercial), so
      // unit check-in / check-out failures must not sit on the Rooms step.
      const isStayTime = (f: (typeof unitFailures)[number]) =>
        /check-?in|check-?out|checkin|checkout/i.test(`${f.label ?? ""} ${f.detail ?? ""}`);
      const stayTimeFailures = unitFailures.filter(isStayTime);
      const otherUnitFailures = unitFailures.filter((f) => !isStayTime(f));
      put(
        "unit_content_quality",
        "Unit content & house rules",
        otherUnitFailures.filter((f) => f.mandatory).length === 0,
        {
          failures: otherUnitFailures,
          detail: otherUnitFailures.length
            ? otherUnitFailures
                .slice(0, 4)
                .map((f) => `${f.unit}: ${f.detail ?? f.label}`)
                .join(" · ")
            : "Unit content checks passed",
        },
      );
      put(
        "unit_stay_times",
        "Unit check-in / check-out times",
        stayTimeFailures.filter((f) => f.mandatory).length === 0,
        {
          failures: stayTimeFailures,
          detail: stayTimeFailures.length
            ? stayTimeFailures
                .slice(0, 4)
                .map((f) => `${f.unit}: ${f.detail ?? f.label}`)
                .join(" · ")
            : "Unit stay times passed",
          hint: "Commercial → Policies → Check-in / check-out times",
        },
      );
    }

    // Macro 2 — location
    groupCheck("address_geo", "Address, postal code & coordinates", "Address & geo", () => {
      const missing: string[] = [];
      for (const [f, lbl] of [["address", "street address"], ["city", "city"], ["country", "country"], ["postal_code", "postal code"]] as const) {
        if (!String((prop as Record<string, unknown>)[f] ?? "").trim()) missing.push(lbl);
      }
      const lat = Number(prop.latitude ?? NaN);
      const lng = Number(prop.longitude ?? NaN);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) missing.push("coordinates");
      return {
        ok: missing.length === 0,
        detail: missing.length === 0 ? "Address, postal code and coordinates captured" : `Outstanding: ${missing.join(", ")}`,
      };
    });
    put("location_id", "Distribution Location ID resolved", !!String(prop.ru_location_id ?? "").trim(), {
      detail: String(prop.ru_location_id ?? "") || "Not resolved",
      hint: "Identity & Location → Location register",
    });
    const externalIds = ((prop.amenities as Record<string, unknown> | null)?.external_ids ?? {}) as Record<
      string,
      unknown
    >;
    put("google_place_id", "Google Place ID captured", !!String(externalIds.google_place_id ?? "").trim(), {
      hint: "Identity & Location → Google Place ID",
    });

    // Macros 3-5 — inventory, media, commercial
    // Bed coverage uses the same sleeping-place table as the channel push, so a
    // shortfall (for example a single sofa bed counted as one place) surfaces here
    // instead of only failing certification in Phase 2.
    groupCheck("rooms_beds", "Room composition, beds & occupancy", "Rooms & beds", () => {
      const rows = ((d?.units ?? []) as {
        name?: string | null;
        is_active?: boolean | null;
        max_guests?: number | null;
        bed_configuration?: unknown;
      }[]).filter((u) => u.is_active !== false);
      const short = rows
        .map((u) => ({
          name: String(u.name ?? "Unit"),
          guests: Number(u.max_guests ?? 0),
          capacity: calculateBedCapacity(u.bed_configuration as never),
        }))
        .filter((u) => u.guests > 0 && u.capacity < u.guests);
      if (rows.length === 0) {
        const guests = Number(prop.max_guests ?? 0);
        return { ok: guests >= 1, detail: guests >= 1 ? `Sleeps ${guests}` : "Max guests not set" };
      }
      return {
        ok: short.length === 0,
        detail:
          short.length === 0
            ? `${rows.length} unit(s) — beds cover max guests`
            : `Beds short of max guests: ${short
                .map((u) => `${u.name} (sleeps ${u.capacity} of ${u.guests})`)
                .join(", ")}`,
      };
    });
    groupCheck("photos", "Photo count, size, main image & tags", "Photos");
    groupCheck("policies_payments", "Policies & payment methods", "Policies & payments");
    groupCheck("pricing_365", "Pricing coverage — rolling 365 days", "Pricing 365d");
    groupCheck("availability_365", "Availability coverage — rolling 365 days", "Availability 365d");

    // Macro 6 — sub-owner identity
    const ruOwnerId = String(d?.identity?.account?.ru_owner_id ?? "").trim();
    put("sub_owner_id", "Sub-owner identity created", !!ruOwnerId, {
      detail: ruOwnerId ? `Sub-owner ${ruOwnerId}` : "No sub-owner linked yet",
    });

    // Macro 7 — key pair
    const keysCaptured = !!d?.identity?.keys_captured;
    const verifiedAt = d?.identity?.keys?.verified_at ?? null;
    const bound = isDistributionBound({
      ruOwnerId,
      keysCaptured,
      pushGated: d?.identity?.push_gated,
    });
    put("api_keys_stored", "Sub-account key & secret stored", keysCaptured, {
      detail: keysCaptured
        ? `Key ending ${d?.identity?.keys?.access_key_last4 ?? "····"}`
        : "No key pair captured",
      hint: "Integrations → ROL'OS owner panel",
    });
    put("api_keys_verified", "Key pair verified", keysCaptured && !!verifiedAt, {
      detail: !keysCaptured
        ? "No key pair captured"
        : verifiedAt
          ? `Verified ${new Date(verifiedAt).toLocaleDateString()}`
          : "Not verified",
    });
    // The company profile is submitted with the sub-account's own verified credentials —
    // a push recorded before verification never reached the sub-account.
    const companyPushedAt = d?.identity?.account?.company_filled_at ?? null;
    put(
      "company_details",
      "Company details accepted by the Channel Manager",
      d?.identity?.account?.company_details_pushed === true,
      {
        waiting: !keysCaptured || !verifiedAt,
        detail: !keysCaptured || !verifiedAt
          ? "Capture and verify the key pair first"
          : d?.identity?.account?.company_details_pushed === true
            ? `Accepted ${companyPushedAt ? new Date(companyPushedAt).toLocaleDateString() : ""}`.trim()
            : companyPushedAt
              ? "A push exists but predates key verification — re-send"
              : "Not sent",
        hint: "Integrations → ROL'OS owner panel",
      },
    );

    // Macro 8 — pull existing listings under the sub-account before verification.
    const pullDone = !!listingPull && !listingPull.stale;
    put("listings_pulled", "Existing listings pulled & adopted", bound && pullDone, {
      waiting: !bound,
      detail: !bound
        ? unboundDependentDetail("publish")
        : !listingPull
          ? "Not pulled yet"
          : listingPull.stale
            ? `Last pull ran against OwnerID ${listingPull.ownerId} — re-pull against OwnerID ${listingPull.boundOwnerId}`
            : listingPull.remoteCount === 0
              ? `${listingPull.account ?? `OwnerID ${listingPull.ownerId ?? "?"}`} returned no listings — nothing to adopt`
              : `${listingPull.matched} adopted of ${listingPull.remoteCount} listing(s)${
                  listingPull.unmatched > 0 ? ` · ${listingPull.unmatched} unmatched` : ""
                }`,
    });


    // Macro 10 — publish. Leftover listing IDs from a previous bind do not count
    // while the property is unbound (no owner key & secret).
    const units = (d?.units ?? []) as { name?: string | null; is_active: boolean | null; rentalsunited_property_id: string | null }[];

    const activeUnits = units.filter((u) => u.is_active !== false);
    const unitsWithIds = activeUnits.filter((u) => !!String(u.rentalsunited_property_id ?? "").trim()).length;
    const propertyListingId = !!String(prop.rentalsunited_property_id ?? "").trim();
    const listingIdsPresent = activeUnits.length > 0 ? unitsWithIds === activeUnits.length : propertyListingId;
    const listingOk = bound && listingIdsPresent;
    put("listing_ids", "Listing published & IDs stored", listingOk, {
      waiting: !bound,
      detail: !bound
        ? unboundDependentDetail("publish", listingIdsPresent)
        : activeUnits.length > 0
          ? `${unitsWithIds}/${activeUnits.length} units published`
          : propertyListingId
            ? "Listing published"
            : "Not published yet",
    });

    /**
     * Publishing is only confirmed once the channel's own listing set has been read
     * back and every expected listing was found. A push nobody verified is a claim,
     * not a fact.
     */
    const listingsVerifiedAt = String((prop as Record<string, unknown>).ru_listings_verified_at ?? "").trim();
    const listingsVerifiedUnits = Number((prop as Record<string, unknown>).ru_listings_verified_units ?? 0);
    const listingsExpectedUnits = Number((prop as Record<string, unknown>).ru_listings_expected_units ?? 0);
    put("listings_verified", "Listings confirmed on the channel", listingOk && !!listingsVerifiedAt, {
      waiting: !bound,
      detail: !bound
        ? unboundDependentDetail("verify listings")
        : !listingOk
          ? "Publish the listing first."
          : listingsVerifiedAt
            ? `${listingsExpectedUnits ? `${listingsVerifiedUnits}/${listingsExpectedUnits} listing(s) ` : ""}read back ${new Date(listingsVerifiedAt).toLocaleDateString()}`
            : "Pushed, but the automatic read-back did not confirm the listings — retry it with \"Fetch Channel Manager IDs\" in this step.",
    });



    // The content quality check is advisory: it is ordered on the channel side and
    // only returns a verdict once the channel subscription is live. Gate/plumbing
    // rejections (property not found, invalid channel, subscription missing) are not
    // content failures, so they must not mark the publish step as failed.
    const mcq = d?.phase?.last_mcq ?? null;
    const mcqStatus = String(mcq?.status ?? "").toLowerCase();
    const mcqOk = !!mcq && ["passed", "ok", "success", "completed"].includes(mcqStatus);
    const gatedStatusIds = ["56", "219", "280"];
    const mcqGated = !mcq || gatedStatusIds.includes(String(mcq?.ru_status_id ?? "").trim());
    put("quality_check", "Content quality check (advisory)", mcqOk || (listingOk && mcqGated), {
      detail: mcqOk
        ? `Last check: ${mcq?.status ?? "passed"}`
        : mcqGated
          ? "Not yet assessable — runs once the channel subscription is live"
          : `Last check: ${mcq?.status ?? "unknown"}`,
    });


    // Macro 11 — currency
    const cur = (d?.currency ?? null) as Record<string, string | null> | null;
    const currencyRecorded =
      !!cur?.verified_at &&
      (!cur.ru_reported_currency_iso ||
        !cur.published_currency_iso ||
        cur.ru_reported_currency_iso === cur.published_currency_iso);
    const currencyOk = bound && currencyRecorded;
    put("currency_verified", "Published currency verified", currencyOk, {
      waiting: !bound,
      detail: !bound
        ? unboundDependentDetail("currency")
        : cur?.published_currency_iso
          ? `${cur.published_currency_iso}${cur.verified_at ? " · verified" : " · unverified"}`
          : "No currency state recorded",
    });

    // Macro 8 — manual sub-account verification (ticked before the push)
    const tickedCount = ROLOS_SIGNOFF_CHECKLIST.filter(
      (i) => signoff.checks[i.key]?.checked === true,
    ).length;
    put("manual_signoff", "Manual verification checklist", bound && signoff.signed_off, {
      waiting: !bound,
      detail: !bound
        ? unboundDependentDetail("signoff")
        : signoff.signed_off
          ? `All ${ROLOS_SIGNOFF_CHECKLIST.length} items confirmed${
              signoff.signed_off_by ? ` · ${signoff.signed_off_by}` : ""
            }`
          : `${tickedCount}/${ROLOS_SIGNOFF_CHECKLIST.length} items ticked`,
    });


    // Macros 12-13 — entitlement & channels
    const entitlementOn = billing?.channel_manager_enabled === true;
    // Entitlement is a commercial fact on the billing config alone — it does not
    // depend on the distribution account binding. Gating it on `bound` reported an
    // enabled Channel Manager as "not enabled" (false positive).
    put("channel_entitlement", "Channel Manager enabled on billing", entitlementOn, {
      detail: entitlementOn ? "Enabled" : "Disabled — switch it on in the property's billing config",
    });
    const connected = ((d?.channels ?? []) as { status: string }[]).filter((c) =>
      ["connected", "active", "live"].includes(String(c.status ?? "").toLowerCase()),
    ).length;
    put("channels_connected", "At least one channel connected", bound && connected > 0, {
      waiting: !bound,
      detail: !bound
        ? unboundDependentDetail("connect")
        : connected > 0
          ? `${connected} connected`
          : "None connected yet",
    });

    return map;
  }, [billing?.channel_manager_enabled, d, listingPull, signoff]);

  const macros: MacroProgress[] = useMemo(() => {
    const items = readiness.items;
    const result: MacroProgress[] = [];
    const completeByKey = new Map<string, boolean>();
    const ok = (key: DistributionCheckKey) => stateChecks.get(key)?.ok === true;

    for (const macro of ROLOS_ONBOARDING_MACROS) {
      const sections = macro.tasks.flatMap((t) => (t.kind === "fields" ? t.sections : []));
      const fieldItems = sections.length ? items.filter((i) => sections.includes(i.section)) : [];
      const mandatoryOutstanding = fieldItems.filter((i) => !i.satisfied && i.tier === "mandatory").length;
      const recommendedOutstanding = fieldItems.filter((i) => !i.satisfied && i.tier === "recommended").length;

      const checks: DistributionCheck[] = [];
      for (const task of macro.tasks) {
        if (task.kind !== "state") continue;
        const found = stateChecks.get(task.key);
        if (found) checks.push({ ...found, label: task.label ?? found.label });
      }

      const mandatoryStates = macro.tasks.filter(
        (t): t is Extract<typeof t, { kind: "state" }> => t.kind === "state" && !t.optional,
      );
      const mandatoryStateChecks = mandatoryStates
        .map((t) => stateChecks.get(t.key))
        .filter((c): c is DistributionCheck => !!c);
      // A check the resolver could not judge ("Not yet resolvable") is advisory:
      // there is no field for the owner to correct, so it must never hold the
      // wizard open and strand the user on a dead-end Fix button.
      const stateOutstanding = mandatoryStateChecks.filter((c) => !c.ok && !c.unknown).length;

      const mandatoryTotal =
        fieldItems.filter((i) => i.tier === "mandatory").length + mandatoryStateChecks.length;
      const mandatoryDone = mandatoryTotal - mandatoryOutstanding - stateOutstanding;
      const score = mandatoryTotal === 0 ? 100 : Math.round((mandatoryDone / mandatoryTotal) * 100);
      const localComplete = mandatoryOutstanding === 0 && stateOutstanding === 0;

      /**
       * Phase 3 ledger overlay. The durable row decides the step when the ledger is
       * live: `passed` completes it, `blocked` holds it open with the recorded
       * blockers, and `stale` / `unknown` keep the last successful verdict so a
       * throttled channel read can never un-complete finished work.
       */
      const rawLedgerRow = ledgerActive ? ledgerByStep.get(macro.key) : undefined;
      // An ungraded `pending` row is bookkeeping, not a verdict — it must never
      // un-complete a step the local data already proves finished.
      const ledgerRow = ledgerHasVerdict(rawLedgerRow) ? rawLedgerRow : undefined;
      const ledgerStatus = ledgerRow?.status;
      const ledgerComplete = ledgerRow ? ledgerStepComplete(ledgerRow) : localComplete;
      /**
       * The recorded verdict may be older than the data. When live ROL'OS truth shows
       * every mandatory item of a Ready-to-sell step satisfied but the ledger still
       * carries a `blocked` row (for example photos added after the last grading run),
       * the row is out of date — it is reported as needing a refresh instead of
       * re-opening finished work. The ledger confirms; it never overrules the data.
       */
      const ledgerOutdated =
        isReadyToSellMacro(macro.key) && ledgerStatus === "blocked" && localComplete;
      const ledgerBlockers = ledgerStatus === "blocked" && !ledgerOutdated
        ? String(ledgerRow?.blocker_summary ?? "")
            .split("·")
            .map((part) => part.trim())
            .filter(Boolean)
        : [];
      const complete = isReadyToSellMacro(macro.key)
        ? ledgerOutdated || (ledgerComplete && localComplete)
        : ledgerComplete;
      const needsRefresh = ledgerStatus === "stale" || ledgerOutdated;

      const channelPending = ledgerStatus === "unknown" && !!ledgerRow?.passed_at;
      completeByKey.set(macro.key, complete);


      /**
       * Only real prerequisites gate an action — not "the step above is not
       * finished". Reading, revisiting and fixing anything stays possible.
       */
      const readyToSell = ["identity", "location", "rooms", "media", "commercial"].every(
        (k) => completeByKey.get(k) !== false,
      );
      const actionBlockedReason = (() => {
        switch (macro.key) {
          case "keys":
            return ok("sub_owner_id") ? undefined : "Create the distribution identity first (step 6).";
          case "company_profile":
            return ok("api_keys_verified")
              ? undefined
              : "Capture and verify the sub-account key & secret first (step 7).";
          case "signoff":
            return ok("api_keys_stored") ? undefined : "Capture the sub-account key & secret first (step 7).";
          case "pull_listings":
            return ok("api_keys_stored") ? undefined : "Capture the sub-account key & secret first (step 7).";
          case "publish":
            if (!ok("api_keys_stored")) return "Capture the sub-account key & secret first (step 7).";
            if (!ok("company_details")) return "Send the company profile to the sub-account first (step 8).";
            if (!ok("manual_signoff")) return "Verify the sub-account first (step 9).";
            if (!ok("listings_pulled")) return "Pull existing listings first (step 10) so the push cannot duplicate.";
            if (!readyToSell) return "Finish Ready to sell — the push needs complete content, rooms, photos and rates.";
            return undefined;
          case "currency":
            return ok("listing_ids") ? undefined : "Publish the listing first — currency is verified against the live listing.";
          case "entitlement":
            return ok("api_keys_stored") ? undefined : "Capture the sub-account key & secret first (step 7).";
          case "connect":
            if (!ok("channel_entitlement")) return "Enable Channel Manager first (step 13).";
            if (!ok("listing_ids")) return "Publish the listing first (step 11).";
            return undefined;

          default:
            return undefined;
        }
      })();

      result.push({
        macro,
        fieldItems,
        mandatoryOutstanding,
        recommendedOutstanding,
        stateChecks: checks,
        score,
        complete,
        locked: !!actionBlockedReason,
        actionBlockedReason,
        ledgerStatus,
        needsRefresh,
        channelPending,
        outstandingLabels: complete
          ? []
          : [
              ...new Set([
                ...fieldItems.filter((i) => !i.satisfied && i.tier === "mandatory").map((i) => i.label),
                ...mandatoryStateChecks.filter((c) => !c.ok && !c.unknown).map((c) => c.label),
                ...ledgerBlockers,
              ]),
            ],
      });
    }

    return result;
  }, [readiness.items, stateChecks, ledgerActive, ledgerByStep]);


  /**
   * Live channel connections for this property. Used to retire the onboarding
   * wizard once the property is actually distributing.
   */
  const channelsConnected = useMemo(
    () =>
      ((d?.channels ?? []) as { status?: string }[]).filter((c) =>
        ["connected", "active", "live"].includes(String(c?.status ?? "").toLowerCase()),
      ).length,
    [d?.channels],
  );

  const currentMacro = useMemo(
    () => macros.find((m) => !m.complete) ?? macros[macros.length - 1] ?? null,
    [macros],
  );

  /** True once every active unit (or the property) carries a stored listing id. */
  const publishedOk = useMemo(
    () => stateChecks.get("listing_ids")?.ok === true,
    [stateChecks],
  );

  /**
   * Active units still missing a stored listing id. Non-blocking: the push card owns
   * the error text and the retry, the wizard only labels its quiet pill with this.
   */
  const unpublishedUnits = useMemo(() => {
    const units = (d?.units ?? []) as { is_active: boolean | null; rentalsunited_property_id: string | null }[];
    const active = units.filter((u) => u.is_active !== false);
    return active.filter((u) => !String(u.rentalsunited_property_id ?? "").trim()).length;
  }, [d?.units]);


  /**
   * Macros 1-7 (property preparation) with outstanding mandatory work. These are the
   * only steps that may force the wizard open: 8-10 (push, currency, sign-off) are
   * administrative and must not nag on every visit.
   */
  const blockingMacros = useMemo(
    () => macros.filter((m) => m.macro.order <= 7 && !m.complete),
    [macros],
  );

  /**
   * Stable fingerprint of the mandatory gate state (steps 1-8). A persisted "hide"
   * is honoured only while this signature is unchanged — the moment a new blocker
   * appears the signature changes and the wizard re-opens by itself.
   */
  const gateSignature = useMemo(() => {
    const parts = blockingMacros.map(
      (m) => `${m.macro.key}:${[...m.outstandingLabels].sort().join("|")}`,
    );
    return `${publishedOk ? "pub" : "unpub"}#${parts.join(";")}`;
  }, [blockingMacros, publishedOk]);


  const overall = useMemo(() => {
    const done = macros.filter((m) => m.complete).length;
    const beforeConnect = macros.filter((m) => m.macro.key !== "connect");
    /**
     * The channel gate is the five Ready-to-sell steps only (Step A/B onboarding).
     * The legacy 14-step wizard count is no longer a gate.
     */
    const readySteps = macros.filter((m) => isReadyToSellMacro(m.macro.key));
    const readyDone = readySteps.filter((m) => m.complete).length;
    return {
      macrosComplete: done,
      macrosTotal: macros.length,
      percent: macros.length ? Math.round((done / macros.length) * 100) : 0,
      /** Published + entitled — the channel console can open. */
      readyToConnect: beforeConnect.length > 0 && beforeConnect.every((m) => m.complete),
      /** Ready-to-sell (steps 1–5) gate. */
      readyToSellSteps: readySteps.length,
      readyToSellComplete: readyDone,
      readyToSell: readySteps.length > 0 && readyDone === readySteps.length,
      readyToSellPercent: readySteps.length
        ? Math.round((readyDone / readySteps.length) * 100)
        : 0,
    };
  }, [macros]);


  /**
   * A trading property stays trading. Once a channel is connected the wizard must
   * not reopen because a later check regressed — the regression is surfaced as a
   * banner instead.
   */
  const channelsLive = channelsConnected > 0;
  const readyRegressed = channelsLive && !overall.readyToConnect;

  const refresh = useCallback(
    async (opts?: { probeAri?: boolean }) => {
      readiness.refresh();
      if (opts?.probeAri) setProbeAri(true);
      // Ledger path: re-grade the durable rows without touching the channel unless
      // the caller explicitly asked for a probe (staff "Recheck channel").
      if (ledgerActive && propertyId) {
        await recheckChannelLedger(propertyId, { allowChannelProbe: opts?.probeAri === true });
        await queryClient.invalidateQueries({ queryKey: ["channel-step-ledger", propertyId] });
      }
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["rolos-onboarding-distribution", propertyId] }),
        queryClient.invalidateQueries({ queryKey: ["rolos-onboarding-phase", propertyId] }),
      ]);
    },
    [ledgerActive, propertyId, queryClient],
  );

  /** Staff / platform action: the only path allowed to hit the channel. */
  const recheckChannel = useCallback(() => refresh({ probeAri: true }), [refresh]);



  const roadmapRef = useRef<Record<string, unknown>>({});
  useEffect(() => {
    roadmapRef.current = (((d?.roadmap as any)?.roadmap ?? {}) as Record<string, unknown>);
  }, [d?.roadmap]);

  const writeChannelReadiness = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!propertyId) return;
      const existing = roadmapRef.current;
      const next = {
        ...existing,
        channel_readiness: {
          ...((existing.channel_readiness ?? {}) as Record<string, unknown>),
          ...patch,
        },
      };
      const queryKey = ["rolos-onboarding-distribution", propertyId] as const;
      const previous = queryClient.getQueryData(queryKey);

      // Paint the operator's tick immediately. Previously every checkbox waited for
      // the full onboarding refresh (including the channel scorecard), making a
      // lightweight database write appear frozen or occasionally get clicked twice.
      roadmapRef.current = next;
      queryClient.setQueryData(queryKey, (current: typeof distribution.data) =>
        current
          ? {
              ...current,
              roadmap: { ...current.roadmap, roadmap: next },
            }
          : current,
      );

      const { error } = await supabase
        .from("property_onboarding_roadmap")
        .upsert({ property_id: propertyId, roadmap: next as never }, { onConflict: "property_id" });
      if (error) {
        roadmapRef.current = existing;
        queryClient.setQueryData(queryKey, previous);
        throw error;
      }
      // Phase 2 ledger — the manual verification checklist moved; nothing else did.
      void markChannelStepsStale(propertyId, ["signoff"]);
      // Reconcile only the lightweight persisted snapshot in the background. A
      // checkbox must never block on readiness grading or a channel request.
      void queryClient.invalidateQueries({ queryKey });
    },
    [propertyId, queryClient],
  );

  const lockedSignoffItems = signoff.lockedItems ?? [];

  /** Tick / untick a single step-10 verification item. */
  const recordSignoffCheck = useCallback(
    async (itemKey: string, checked: boolean, actorLabel?: string | null) => {
      if (checked && lockedSignoffItems.includes(itemKey)) {
        throw new Error(
          "Company details have not been pushed to the Channel Manager with the verified keys yet — run \"Push company details\" first.",
        );
      }
      const currentReadiness = (roadmapRef.current.channel_readiness ?? {}) as Record<string, unknown>;
      const checks = {
        ...((currentReadiness.checks ?? signoff.checks ?? {}) as Record<string, SignoffCheckRecord>),
      };
      if (checked) {
        checks[itemKey] = { checked: true, by: actorLabel ?? null, at: new Date().toISOString() };
      } else {
        delete checks[itemKey];
      }
      const allTicked = ROLOS_SIGNOFF_CHECKLIST.every((i) => checks[i.key]?.checked === true);
      await writeChannelReadiness({
        checks,
        signed_off: allTicked,
        signed_off_by: allTicked ? actorLabel ?? null : null,
        signed_off_at: allTicked ? new Date().toISOString() : null,
      });
      if (allTicked) await recordChannelStepPass(propertyId, ["signoff"], "manual_signoff");
    },
    [lockedSignoffItems, propertyId, signoff.checks, writeChannelReadiness],
  );

  /** Tick or clear every verification item at once. */
  const recordSignoff = useCallback(
    async (signedOff: boolean, actorLabel?: string | null, note?: string | null) => {
      const at = new Date().toISOString();
      const checks: Record<string, SignoffCheckRecord> = {};
      if (signedOff) {
        for (const item of ROLOS_SIGNOFF_CHECKLIST) {
          // Locked items still need their channel evidence — "Confirm all" cannot forge them.
          if (lockedSignoffItems.includes(item.key)) continue;
          checks[item.key] = { checked: true, by: actorLabel ?? null, at };
        }
      }
      const complete = ROLOS_SIGNOFF_CHECKLIST.every((i) => checks[i.key]?.checked === true);
      signedOff = signedOff && complete;
      await writeChannelReadiness({
        checks,
        signed_off: signedOff,
        signed_off_by: signedOff ? actorLabel ?? null : null,
        signed_off_at: signedOff ? at : null,
        note: note ?? null,
      });
      if (signedOff) await recordChannelStepPass(propertyId, ["signoff"], "manual_signoff");
    },
    [lockedSignoffItems, propertyId, writeChannelReadiness],
  );

  /**
   * Step 8 — company profile. As soon as the sub-account has a verified key pair the
   * profile is submitted automatically: it is a machine step, not something an operator
   * should have to remember. `ensure_company_details` is idempotent, and a per-owner
   * attempt guard (plus cooldown after a failure) keeps repeated wizard opens cheap.
   */
  const companyAutoRef = useRef<Map<string, number>>(new Map());
  const [companyAuto, setCompanyAuto] = useState<{
    status: "idle" | "sending" | "failed";
    error: string | null;
  }>({ status: "idle", error: null });

  const sendCompanyDetails = useCallback(
    async (force = false): Promise<{ pushed: boolean; error: string | null }> => {
      setCompanyAuto({ status: "sending", error: null });
      try {
        const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
          body: { action: "ensure_company_details", property_id: propertyId, force },
        });
        const pushed = !error && data?.success === true && data?.company_details_pushed === true;
        if (pushed) {
          setCompanyAuto({ status: "idle", error: null });
          // Confirmed acceptance by the channel is the company-profile verdict.
          await recordChannelStepPass(propertyId, ["company_profile"], "push_result");
          await refresh();
          return { pushed: true, error: null };
        }
        const reason = String(
          data?.error?.message
            ?? data?.company_details_warning
            ?? error?.message
            ?? "The Channel Manager did not confirm the company profile.",
        );
        setCompanyAuto({ status: "failed", error: reason });
        await refresh();
        return { pushed: false, error: reason };
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Could not send the company profile.";
        setCompanyAuto({ status: "failed", error: reason });
        return { pushed: false, error: reason };
      }
    },
    [propertyId, refresh],
  );

  const companyAutoOwner = String(d?.identity?.account?.ru_owner_id ?? "").trim();
  const companyAutoReady =
    !!companyAutoOwner && !!d?.identity?.keys_captured && !!d?.identity?.keys?.verified_at;
  useEffect(() => {
    if (!isAdmin) return;
    if (!companyAutoReady || companyDetailsPushed) return;
    const last = companyAutoRef.current.get(companyAutoOwner) ?? 0;
    // One attempt per owner per session, retried at most every 5 minutes.
    if (Date.now() - last < 5 * 60_000) return;
    companyAutoRef.current.set(companyAutoOwner, Date.now());
    void sendCompanyDetails(false);
  }, [companyAutoOwner, companyAutoReady, companyDetailsPushed, isAdmin, sendCompanyDetails]);

  /** Record the outcome of a "Pull listings" run (step 9). */
  const recordListingPull = useCallback(
    async (
      outcome: {
        matched: number;
        unmatched: number;
        remoteCount: number;
        account?: string | null;
        ownerId?: string | null;
        authMode?: string | null;
      },
      actorLabel?: string | null,
    ) => {
      await writeChannelReadiness({
        listing_pull: {
          at: new Date().toISOString(),
          by: actorLabel ?? null,
          matched: outcome.matched,
          unmatched: outcome.unmatched,
          remote_count: outcome.remoteCount,
          account: outcome.account ?? null,
          owner_id: outcome.ownerId ?? null,
          auth_mode: outcome.authMode ?? null,
        },
      });
      // The pull ran against the bound sub-account — record the verdict so the step
      // stays green instead of waiting for a probe that never grades it.
      await recordChannelStepPass(propertyId, ["pull_listings"], "push_result");
    },
    [propertyId, writeChannelReadiness],
  );

  return {

    isRolosPms,
    macros,
    currentMacro,
    overall,
    channelsConnected,
    channelsLive,
    readyRegressed,
    /** Login email of the distribution sub-account being verified. */
    subAccountEmail:
      (d?.identity?.account?.ru_login_email ?? d?.identity?.account?.owner_email ?? null) || null,
    /**
     * When the ledger drives the wizard the scorecard never runs on mount, so the
     * "last verified" stamp comes from the durable publish row instead of the 90s
     * phase cache. That keeps the wizard independent of the phase TTL entirely.
     */
    ariProbedAt:
      d?.ariAge ??
      (ledgerActive
        ? (() => {
            const checked = ledgerByStep.get("publish")?.last_checked_at;
            const at = checked ? Date.parse(checked) : NaN;
            return Number.isFinite(at) ? at : null;
          })()
        : null),

    ariProbeRequested: probeAri,
    publishedOk,
    unpublishedUnits,
    blockingMacros,
    gateSignature,


    signoff,
    recordSignoff,
    recordSignoffCheck,

    listingPull,
    recordListingPull,

    /** Step 8 — automatic company-profile push state and its manual re-send. */
    companyProfile: {
      pushed: companyDetailsPushed,
      pushedAt: d?.identity?.account?.company_filled_at ?? null,
      sending: companyAuto.status === "sending",
      error: companyAuto.status === "failed" ? companyAuto.error : null,
    },
    sendCompanyDetails,

    refresh,
    recheckChannel,
    /** Phase 3 — the ledger is driving this property's step verdicts. */
    ledgerActive,
    /** Steps whose data moved since the last check ("needs a quick refresh"). */
    ledgerStaleSteps: macros.filter((m) => m.needsRefresh).map((m) => m.macro.key),
    /** Steps waiting on channel confirmation; their last pass still counts. */
    ledgerPendingSteps: macros.filter((m) => m.channelPending).map((m) => m.macro.key),
    // The channel scorecard is deliberately excluded from isLoading so the wizard paints
    // local truth first; its arrival is signalled through isFetching instead.
    // A ledger hit must not flash a spinner: only the very first seed counts as loading.
    isLoading: readiness.isLoading || distribution.isLoading || (ledgerEnabled && ledgerQuery.isLoading),
    isFetching:
      readiness.isFetching || distribution.isFetching || phaseQuery.isFetching || ledgerQuery.isFetching,
    distributionLoading: phaseQuery.isLoading,
    propertyName: String((d?.property as Record<string, unknown> | null)?.name ?? ""),
    ownerEmail: String((d?.property as Record<string, unknown> | null)?.owner_email ?? ""),
    websiteLive: (d?.property as Record<string, unknown> | null)?.show_on_website === true,
    /**
     * Name of the only active unit, when the property has exactly one. Single-unit
     * listings report unit-owned failures without a unit prefix, so the wizard uses this
     * to still open that unit's card.
     */
    soleUnitName: (() => {
      const active = ((d?.units ?? []) as { name?: string | null; is_active: boolean | null }[])
        .filter((u) => u.is_active !== false);
      return active.length === 1 ? String(active[0]?.name ?? "").trim() || null : null;
    })(),
    unitNames: ((d?.units ?? []) as { name?: string | null; is_active: boolean | null }[])
      .filter((u) => u.is_active !== false)
      .map((u) => String(u.name ?? "").trim())
      .filter(Boolean),
    readyForPush: d?.phase?.gate?.ready_for_push === true,
  };
}

export default useRolosOnboardingProgress;
