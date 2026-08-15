import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePropertyReadiness, type ReadinessItem } from "@/hooks/usePropertyReadiness";
import { useBillingConfig } from "@/hooks/useBillingConfig";
import {
  ROLOS_ONBOARDING_MACROS,
  ROLOS_SIGNOFF_CHECKLIST,
  type DistributionCheckKey,
  type MacroDef,
} from "@/config/rolosOnboardingMacros";
import { isDistributionBound, unboundDependentDetail } from "@/lib/channelDistributionGate";


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
  /** Unknown = not yet resolvable (upstream unreachable / earlier gate not passed). */
  unknown?: boolean;
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
  /** Hard gate: every earlier macro must be complete. */
  locked: boolean;
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
  account?: { ru_owner_id?: string | null } | null;
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

export function useRolosOnboardingProgress(propertyId?: string | null) {
  const queryClient = useQueryClient();
  const readiness = usePropertyReadiness(propertyId);
  const { config: billing } = useBillingConfig(propertyId ?? undefined);

  const distribution = useQuery({
    queryKey: ["rolos-onboarding-distribution", propertyId],
    enabled: !!propertyId,
    // Channel readiness must be re-derived every time the property editor mounts:
    // a mandatory field deleted in a previous visit has to re-block the wizard.
    staleTime: 0,
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const id = propertyId as string;
      const [property, phase, identity, currency, channels, roadmap, units] = await Promise.all([
        supabase
          .from("properties")
          .select("id, name, owner_email, show_on_website, external_system, timezone, ru_location_id, amenities, rentalsunited_property_id")
          .eq("id", id)
          .maybeSingle()
          .then((r) => (r.data ?? null) as Record<string, unknown> | null),
        // ARI (availability + pricing coverage) is only scored when explicitly probed.
        // Without this flag the wizard never receives the "Availability 365d" /
        // "Pricing 365d" groups, so steps 5.2/5.3 stayed outstanding forever.
        invokeCert<PhaseStatusPayload>("phase_status", id, { probe_ari: true }),
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
          .select("id, name, is_active, rentalsunited_property_id")
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
      return { property, phase, identity, currency, channels, roadmap, units, contract, ownerEmail };
    },
  });

  const d = distribution.data;

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
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [propertyId, queryClient]);

  const signoff: RolosOnboardingSignoff = useMemo(() => {
    const raw = ((d?.roadmap as any)?.roadmap ?? {}) as Record<string, unknown>;
    const cr = (raw.channel_readiness ?? {}) as Record<string, unknown>;
    const checks = (cr.checks ?? {}) as Record<string, SignoffCheckRecord>;
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
    };
  }, [d?.roadmap]);


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

    const groupCheck = (key: DistributionCheckKey, label: string, name: string) => {
      const g = group(name);
      if (!g) {
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
    groupCheck("content_quality", "Description & content depth", "Content");

    // Macro 2 — location
    groupCheck("address_geo", "Address, postal code & coordinates", "Address & geo");
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
    groupCheck("rooms_beds", "Room composition, beds & occupancy", "Rooms & beds");
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

    // Macro 8 — publish. Leftover listing IDs from a previous bind do not count
    // while the property is unbound (no owner key & secret).
    const units = (d?.units ?? []) as { name?: string | null; is_active: boolean | null; rentalsunited_property_id: string | null }[];
    const activeUnits = units.filter((u) => u.is_active !== false);
    const unitsWithIds = activeUnits.filter((u) => !!String(u.rentalsunited_property_id ?? "").trim()).length;
    const propertyListingId = !!String(prop.rentalsunited_property_id ?? "").trim();
    const listingIdsPresent = activeUnits.length > 0 ? unitsWithIds === activeUnits.length : propertyListingId;
    const listingOk = bound && listingIdsPresent;
    put("listing_ids", "Listing published & IDs stored", listingOk, {
      detail: !bound
        ? unboundDependentDetail("publish", listingIdsPresent)
        : activeUnits.length > 0
          ? `${unitsWithIds}/${activeUnits.length} units published`
          : propertyListingId
            ? "Listing published"
            : "Not published yet",
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


    // Macro 9 — currency
    const cur = (d?.currency ?? null) as Record<string, string | null> | null;
    const currencyRecorded =
      !!cur?.verified_at &&
      (!cur.ru_reported_currency_iso ||
        !cur.published_currency_iso ||
        cur.ru_reported_currency_iso === cur.published_currency_iso);
    const currencyOk = bound && currencyRecorded;
    put("currency_verified", "Published currency verified", currencyOk, {
      detail: !bound
        ? unboundDependentDetail("currency")
        : cur?.published_currency_iso
          ? `${cur.published_currency_iso}${cur.verified_at ? " · verified" : " · unverified"}`
          : "No currency state recorded",
    });

    // Macro 10 — manual sign-off
    const tickedCount = ROLOS_SIGNOFF_CHECKLIST.filter(
      (i) => signoff.checks[i.key]?.checked === true,
    ).length;
    put("manual_signoff", "Manual verification checklist", bound && signoff.signed_off, {
      detail: !bound
        ? unboundDependentDetail("signoff")
        : signoff.signed_off
          ? `All ${ROLOS_SIGNOFF_CHECKLIST.length} items confirmed${
              signoff.signed_off_by ? ` · ${signoff.signed_off_by}` : ""
            }`
          : `${tickedCount}/${ROLOS_SIGNOFF_CHECKLIST.length} items ticked`,
    });


    // Macro 11 — channels
    const entitlementOn = billing?.channel_manager_enabled === true;
    put("channel_entitlement", "Channel Manager enabled on billing", bound && entitlementOn, {
      detail: !bound
        ? unboundDependentDetail("entitlement")
        : entitlementOn
          ? "Enabled"
          : "Disabled — switch it on in the property's billing config",
    });
    const connected = ((d?.channels ?? []) as { status: string }[]).filter((c) =>
      ["connected", "active", "live"].includes(String(c.status ?? "").toLowerCase()),
    ).length;
    put("channels_connected", "At least one channel connected", bound && connected > 0, {
      detail: !bound
        ? unboundDependentDetail("connect")
        : connected > 0
          ? `${connected} connected`
          : "None connected yet",
    });

    return map;
  }, [billing?.channel_manager_enabled, d, signoff]);

  const macros: MacroProgress[] = useMemo(() => {
    const items = readiness.items;
    const result: MacroProgress[] = [];
    let previousComplete = true;

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
      const stateOutstanding = mandatoryStateChecks.filter((c) => !c.ok).length;

      const mandatoryTotal =
        fieldItems.filter((i) => i.tier === "mandatory").length + mandatoryStateChecks.length;
      const mandatoryDone = mandatoryTotal - mandatoryOutstanding - stateOutstanding;
      const score = mandatoryTotal === 0 ? 100 : Math.round((mandatoryDone / mandatoryTotal) * 100);
      const complete = mandatoryOutstanding === 0 && stateOutstanding === 0;

      result.push({
        macro,
        fieldItems,
        mandatoryOutstanding,
        recommendedOutstanding,
        stateChecks: checks,
        score,
        complete,
        locked: !previousComplete,
        outstandingLabels: [
          ...fieldItems.filter((i) => !i.satisfied && i.tier === "mandatory").map((i) => i.label),
          ...mandatoryStateChecks.filter((c) => !c.ok).map((c) => c.label),
        ],
      });

      previousComplete = previousComplete && complete;
    }

    return result;
  }, [readiness.items, stateChecks]);

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
    return {
      macrosComplete: done,
      macrosTotal: macros.length,
      percent: macros.length ? Math.round((done / macros.length) * 100) : 0,
      /** Published + entitled — the channel console can open. */
      readyToConnect: beforeConnect.length > 0 && beforeConnect.every((m) => m.complete),
    };
  }, [macros]);

  const refresh = useCallback(async () => {
    readiness.refresh();
    await queryClient.invalidateQueries({ queryKey: ["rolos-onboarding-distribution", propertyId] });
  }, [propertyId, queryClient, readiness]);

  const writeChannelReadiness = useCallback(
    async (patch: Record<string, unknown>) => {
      if (!propertyId) return;
      const existing = ((d?.roadmap as any)?.roadmap ?? {}) as Record<string, unknown>;
      const next = {
        ...existing,
        channel_readiness: {
          ...((existing.channel_readiness ?? {}) as Record<string, unknown>),
          ...patch,
        },
      };
      const { error } = await supabase
        .from("property_onboarding_roadmap")
        .upsert({ property_id: propertyId, roadmap: next as never }, { onConflict: "property_id" });
      if (error) throw error;
      await refresh();
    },
    [d?.roadmap, propertyId, refresh],
  );

  /** Tick / untick a single step-10 verification item. */
  const recordSignoffCheck = useCallback(
    async (itemKey: string, checked: boolean, actorLabel?: string | null) => {
      const checks = { ...(signoff.checks ?? {}) };
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
    },
    [signoff.checks, writeChannelReadiness],
  );

  /** Tick or clear every verification item at once. */
  const recordSignoff = useCallback(
    async (signedOff: boolean, actorLabel?: string | null, note?: string | null) => {
      const at = new Date().toISOString();
      const checks: Record<string, SignoffCheckRecord> = {};
      if (signedOff) {
        for (const item of ROLOS_SIGNOFF_CHECKLIST) {
          checks[item.key] = { checked: true, by: actorLabel ?? null, at };
        }
      }
      await writeChannelReadiness({
        checks,
        signed_off: signedOff,
        signed_off_by: signedOff ? actorLabel ?? null : null,
        signed_off_at: signedOff ? at : null,
        note: note ?? null,
      });
    },
    [writeChannelReadiness],
  );

  return {
    isRolosPms,
    macros,
    currentMacro,
    overall,
    channelsConnected,
    publishedOk,
    unpublishedUnits,
    blockingMacros,
    gateSignature,

    signoff,
    recordSignoff,
    recordSignoffCheck,

    refresh,
    isLoading: readiness.isLoading || distribution.isLoading,
    isFetching: readiness.isFetching || distribution.isFetching,
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
