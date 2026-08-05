import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { usePropertyReadiness, type ReadinessItem } from "@/hooks/usePropertyReadiness";
import { useBillingConfig } from "@/hooks/useBillingConfig";
import {
  ROLOS_ONBOARDING_MACROS,
  type DistributionCheckKey,
  type MacroDef,
} from "@/config/rolosOnboardingMacros";

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

export interface DistributionCheck {
  key: DistributionCheckKey;
  label: string;
  ok: boolean;
  /** Unknown = not yet resolvable (upstream unreachable / earlier gate not passed). */
  unknown?: boolean;
  detail?: string;
  hint?: string;
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
}

export interface RolosOnboardingSignoff {
  signed_off: boolean;
  signed_off_by?: string | null;
  signed_off_at?: string | null;
  note?: string | null;
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
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const id = propertyId as string;
      const [property, phase, identity, currency, channels, roadmap, units] = await Promise.all([
        supabase
          .from("properties")
          .select("id, name, external_system, timezone, ru_location_id, amenities, rentalsunited_property_id")
          .eq("id", id)
          .maybeSingle()
          .then((r) => (r.data ?? null) as Record<string, unknown> | null),
        invokeCert<PhaseStatusPayload>("phase_status", id),
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
          .select("id, is_active, rentalsunited_property_id")
          .eq("property_id", id)
          .then((r) => r.data ?? []),
      ]);
      return { property, phase, identity, currency, channels, roadmap, units };
    },
  });

  const d = distribution.data;

  const isRolosPms = useMemo(() => {
    const sys = String((d?.property as any)?.external_system ?? "").toLowerCase();
    return ROLOS_PMS_VALUES.has(sys);
  }, [d?.property]);

  const signoff: RolosOnboardingSignoff = useMemo(() => {
    const raw = ((d?.roadmap as any)?.roadmap ?? {}) as Record<string, unknown>;
    const cr = (raw.channel_readiness ?? {}) as Record<string, unknown>;
    return {
      signed_off: cr.signed_off === true,
      signed_off_by: (cr.signed_off_by as string) ?? null,
      signed_off_at: (cr.signed_off_at as string) ?? null,
      note: (cr.note as string) ?? null,
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
      put(key, label, failed.length === 0, {
        detail:
          failed.length === 0
            ? `${g.passed}/${g.total} checks passed`
            : failed
                .slice(0, 4)
                .map((f) => `${f.unit ? `${f.unit}: ` : ""}${f.detail ?? f.label}`)
                .join(" · "),
      });
    };

    // Macro 1 — identity
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
    put("api_keys_stored", "Sub-account key & secret stored", keysCaptured, {
      detail: keysCaptured
        ? `Key ending ${d?.identity?.keys?.access_key_last4 ?? "····"}`
        : "No key pair captured",
      hint: "Integrations → ROL'OS owner panel",
    });
    put("api_keys_verified", "Key pair verified", !!verifiedAt, {
      detail: verifiedAt ? `Verified ${new Date(verifiedAt).toLocaleDateString()}` : "Not verified",
    });

    // Macro 8 — publish
    const units = (d?.units ?? []) as { is_active: boolean | null; rentalsunited_property_id: string | null }[];
    const activeUnits = units.filter((u) => u.is_active !== false);
    const unitsWithIds = activeUnits.filter((u) => !!String(u.rentalsunited_property_id ?? "").trim()).length;
    const propertyListingId = !!String(prop.rentalsunited_property_id ?? "").trim();
    const listingOk = activeUnits.length > 0 ? unitsWithIds === activeUnits.length : propertyListingId;
    put("listing_ids", "Listing published & IDs stored", listingOk, {
      detail:
        activeUnits.length > 0
          ? `${unitsWithIds}/${activeUnits.length} units published`
          : propertyListingId
            ? "Listing published"
            : "Not published yet",
    });

    const mcq = d?.phase?.last_mcq ?? null;
    const mcqOk = !!mcq && ["passed", "ok", "success", "completed"].includes(String(mcq.status ?? "").toLowerCase());
    put("quality_check", "Content quality check passed", mcqOk, {
      detail: mcq ? `Last check: ${mcq.status ?? "unknown"}` : "Never ordered",
    });

    // Macro 9 — currency
    const cur = (d?.currency ?? null) as Record<string, string | null> | null;
    const currencyOk =
      !!cur?.verified_at &&
      (!cur.ru_reported_currency_iso ||
        !cur.published_currency_iso ||
        cur.ru_reported_currency_iso === cur.published_currency_iso);
    put("currency_verified", "Published currency verified", currencyOk, {
      detail: cur?.published_currency_iso
        ? `${cur.published_currency_iso}${cur.verified_at ? " · verified" : " · unverified"}`
        : "No currency state recorded",
    });

    // Macro 10 — manual sign-off
    put("manual_signoff", "Admin sign-off recorded", signoff.signed_off, {
      detail: signoff.signed_off
        ? `Signed off${signoff.signed_off_by ? ` by ${signoff.signed_off_by}` : ""}${
            signoff.signed_off_at ? ` on ${new Date(signoff.signed_off_at).toLocaleDateString()}` : ""
          }`
        : "Awaiting sign-off",
    });

    // Macro 11 — channels
    put("channel_entitlement", "Channel Manager enabled on billing", billing?.channel_manager_enabled === true, {
      detail:
        billing?.channel_manager_enabled === true
          ? "Enabled"
          : "Disabled — switch it on in the property's billing config",
    });
    const connected = ((d?.channels ?? []) as { status: string }[]).filter((c) =>
      ["connected", "active", "live"].includes(String(c.status ?? "").toLowerCase()),
    ).length;
    put("channels_connected", "At least one channel connected", connected > 0, {
      detail: connected > 0 ? `${connected} connected` : "None connected yet",
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

  const currentMacro = useMemo(
    () => macros.find((m) => !m.complete) ?? macros[macros.length - 1] ?? null,
    [macros],
  );

  const overall = useMemo(() => {
    const done = macros.filter((m) => m.complete).length;
    return {
      macrosComplete: done,
      macrosTotal: macros.length,
      percent: macros.length ? Math.round((done / macros.length) * 100) : 0,
      readyToConnect: macros.every((m) => m.complete),
    };
  }, [macros]);

  const refresh = useCallback(async () => {
    readiness.refresh();
    await queryClient.invalidateQueries({ queryKey: ["rolos-onboarding-distribution", propertyId] });
  }, [propertyId, queryClient, readiness]);

  const recordSignoff = useCallback(
    async (signedOff: boolean, actorLabel?: string | null, note?: string | null) => {
      if (!propertyId) return;
      const existing = ((d?.roadmap as any)?.roadmap ?? {}) as Record<string, unknown>;
      const next = {
        ...existing,
        channel_readiness: {
          ...((existing.channel_readiness ?? {}) as Record<string, unknown>),
          signed_off: signedOff,
          signed_off_by: signedOff ? actorLabel ?? null : null,
          signed_off_at: signedOff ? new Date().toISOString() : null,
          note: note ?? null,
        },
      };
      const { error } = await supabase
        .from("property_onboarding_roadmap")
        .upsert({ property_id: propertyId, roadmap: next }, { onConflict: "property_id" });
      if (error) throw error;
      await refresh();
    },
    [d?.roadmap, propertyId, refresh],
  );

  return {
    isRolosPms,
    macros,
    currentMacro,
    overall,
    signoff,
    recordSignoff,
    refresh,
    isLoading: readiness.isLoading || distribution.isLoading,
    isFetching: readiness.isFetching || distribution.isFetching,
    propertyName: String((d?.property as any)?.name ?? ""),
    readyForPush: d?.phase?.gate?.ready_for_push === true,
  };
}

export default useRolosOnboardingProgress;
