import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { measureImageUrl } from "@/lib/imageValidation";
import {
  evaluateRequirements,
  type RequirementStatus,
  type RequirementSubject,
  type RequirementTier,
} from "@/config/propertyFieldRequirements";

/**
 * Unified property readiness model.
 *
 * The field-level registry (`propertyFieldRequirements.ts`) is the single source
 * of truth for scoring AND highlighting. The `check-activation-readiness` edge
 * function only contributes the checks a browser cannot evaluate (signed
 * contract, PMS conflicts, RU location currency), so the score badge, the field
 * borders, the stepper and the checksheet can never disagree.
 */

/** Checks that have no field-registry counterpart — server truth only. */
export const SERVER_ONLY_CHECK_IDS = [
  "contract",
  "pms",
  "rentalsunited_location_currency",
] as const;

/** Stable tier per server-only check (the edge severity can flip across branches). */
const SERVER_ONLY_TIERS: Record<string, RequirementTier> = {
  contract: "mandatory",
  pms: "mandatory",
  rentalsunited_location_currency: "mandatory",
};

export interface ReadinessBackendCheck {
  id: string;
  name: string;
  passed: boolean;
  message?: string;
  fix?: string;
  severity: "blocker" | "warning" | "info";
  tier?: RequirementTier;
  section?: string;
  section_label?: string;
  surface?: "rolos" | "admin";
}

export interface ReadinessBackendResponse {
  passed: boolean;
  score: number;
  blockers?: ReadinessBackendCheck[];
  warnings?: ReadinessBackendCheck[];
  checks?: ReadinessBackendCheck[];
}

export interface ReadinessItem {
  /** Requirement key (also the deep-link `focus` value) or the backend check id. */
  key: string;
  label: string;
  tier: RequirementTier;
  /** Section (tab) key that owns the item. */
  section: string;
  satisfied: boolean;
  /** True when a DOM field exists to paint / step to. */
  paintable: boolean;
  hint?: string;
  /** Measured explanation of the shortfall ("Description is 444 of 700 characters"). */
  detail?: string;
  /** Backend-only extras. */
  message?: string;
  fix?: string;
  sectionLabel?: string;
  surface?: "rolos" | "admin";
  /** Present for registry items so decoration can resolve the control. */
  requirement?: RequirementStatus;
}

export interface SectionReadinessCounts {
  mandatory: number;
  recommended: number;
  /**
   * Labels of the outstanding items, so a count badge can NAME what is missing
   * instead of only showing a number the owner cannot act on.
   */
  mandatoryLabels: string[];
  recommendedLabels: string[];
  /** Full outstanding items so a tooltip can print the exact error, not just the label. */
  mandatoryItems: SectionReadinessDetail[];
  recommendedItems: SectionReadinessDetail[];
}

export interface SectionReadinessDetail {
  key: string;
  label: string;
  /** Measured shortfall text, falling back to the requirement hint. */
  detail?: string;
  paintable: boolean;
  surface?: "rolos" | "admin";
}

export interface MeasuredImageDims {
  width: number;
  height: number;
  valid: boolean;
}

/**
 * Session-wide measurement cache. Image URLs are stored as plain strings (no
 * dimensions on the row), so the only way to judge the channel 1024x768 rule is
 * to measure. Caching keeps tab switches and list rows from re-downloading.
 */
const imageDimensionCache = new Map<string, MeasuredImageDims>();
const measuring = new Set<string>();

/** Channel-report checks a browser cannot compute; keyed by RU check id. */
const channelChecksQueryKey = (propertyId?: string | null) => ["property-channel-checks", propertyId];

type ChannelCheckMap = Record<string, boolean | undefined>;

export interface UsePropertyReadinessOptions {
  /**
   * Fetch the channel report (bookable window, MinStay, kitchen). Editor surfaces
   * enable this; long list rows reuse whatever is already cached so they cost nothing
   * yet still agree with the editor when the data is there.
   */
  channelChecks?: boolean;
  /** Measure gallery images. Disabled on list rows to avoid mass image downloads. */
  measureImages?: boolean;
  /**
   * Call `check-activation-readiness` for the server-side checks. The channel step
   * ledger (Phase 3) already holds those verdicts durably, so the wizard turns this
   * off on the ledger path to keep page load free of re-grading round trips.
   */
  backendChecks?: boolean;
}

/** Every image URL the property is judged on: gallery + unit galleries. */
function collectImageUrls(subject: RequirementSubject | null): string[] {
  if (!subject) return [];
  const urls: string[] = [];
  const push = (value: unknown) => {
    if (typeof value === "string" && /^https?:\/\//.test(value)) urls.push(value);
    else if (value && typeof value === "object") {
      const row = value as { url?: unknown; src?: unknown; image_url?: unknown };
      for (const candidate of [row.url, row.src, row.image_url]) {
        if (typeof candidate === "string" && /^https?:\/\//.test(candidate)) urls.push(candidate);
      }
    }
  };
  if (Array.isArray(subject.images)) subject.images.forEach(push);
  const rooms = (subject.amenities as { room_types?: unknown } | null)?.room_types;
  if (Array.isArray(rooms)) {
    for (const room of rooms) {
      const imgs = (room as { images?: unknown } | null)?.images;
      if (Array.isArray(imgs)) imgs.forEach(push);
    }
  }
  return Array.from(new Set(urls));
}

export function usePropertyReadiness(
  propertyId?: string | null,
  options: UsePropertyReadinessOptions = {},
) {
  const { channelChecks = true, measureImages = true, backendChecks = true } = options;
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["property-readiness", propertyId, backendChecks ? "backend" : "local"],
    queryFn: async () => {
      if (!propertyId) return null;
      const [{ data: property, error }, { data: policyRows }, { data: contactRows }, { data: attractionRows }, backend] = await Promise.all([
        supabase.from("properties").select("*").eq("id", propertyId).maybeSingle(),
        // Master policy truth lives in the policy library, not in amenities.
        supabase
          .from("rolos_reservation_policies")
          .select("id, is_master, is_default")
          .eq("property_id", propertyId),
        // Public contact details live in their own table, not in amenities.
        supabase
          .from("property_contact_details")
          .select("role, name, email, phone")
          .eq("property_id", propertyId),
        // Nearby attractions with a distance — a recommended, never-blocking channel field.
        supabase
          .from("local_experiences")
          .select("title, category, distance_km, is_active")
          .eq("property_id", propertyId)
          .eq("is_active", true),
        backendChecks
          ? supabase.functions
              .invoke("check-activation-readiness", { body: { property_id: propertyId } })
              .then((res) => (res.error ? null : (res.data as ReadinessBackendResponse)))
              .catch(() => null)
          : Promise.resolve(null),
      ]);
      if (error) throw error;
      if (!property) return null;
      const subject = {
        ...(property as Record<string, unknown>),
        policy_rows: policyRows ?? [],
        contact_rows: contactRows ?? [],
        attraction_rows: attractionRows ?? [],
      } as RequirementSubject;
      return { subject, backend };
    },
    enabled: !!propertyId,
    staleTime: 15_000,
    // Always re-score on mount so a field cleared earlier in the session cannot
    // leave a stale "all clear" behind when the property is re-opened.
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  const baseSubject = query.data?.subject ?? null;
  const backend = query.data?.backend ?? null;

  /**
   * Channel-reported checks. Pre-publish the function scores the ROL'OS calendar; once
   * the listing is live it verifies the channel calendar. Either way this is the same
   * truth the wizard uses, so the editor and the wizard cannot disagree.
   */
  const channelQuery = useQuery({
    queryKey: channelChecksQueryKey(propertyId),
    enabled: !!propertyId && channelChecks,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<ChannelCheckMap> => {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "property_readiness", property_id: propertyId },
      });
      if (error || !data?.success) return {};
      const readiness = data.readiness as
        | { checks?: Array<{ key?: string; passed?: boolean }>; content_quality?: { units?: Array<Record<string, unknown>> } }
        | null;
      const map: ChannelCheckMap = {};
      for (const key of ["bookable_window", "min_stay_set"] as const) {
        const rows = (readiness?.checks ?? []).filter((c) => c.key === key);
        // Multi-unit reports repeat a check per unit — the weakest unit decides.
        if (rows.length > 0) map[key] = rows.every((r) => r.passed === true);
      }
      const units = readiness?.content_quality?.units ?? [];
      if (units.length > 0) map.has_kitchen = units.every((u) => u.has_kitchen === true);
      return map;
    },
  });

  const channelCheckMap: ChannelCheckMap =
    channelQuery.data ??
    (queryClient.getQueryData<ChannelCheckMap>(channelChecksQueryKey(propertyId)) ?? {});

  /** Measure any gallery image we have not measured yet in this session. */
  const imageUrls = useMemo(() => collectImageUrls(baseSubject), [baseSubject]);
  const [measuredVersion, setMeasuredVersion] = useState(0);

  useEffect(() => {
    if (!measureImages || imageUrls.length === 0) return;
    let cancelled = false;
    const pending = imageUrls.filter((url) => !imageDimensionCache.has(url) && !measuring.has(url));
    if (pending.length === 0) return;
    pending.forEach((url) => measuring.add(url));
    void Promise.all(
      pending.map(async (url) => {
        const dims = await measureImageUrl(url);
        measuring.delete(url);
        // An unreadable image (0x0) stays unmeasured: pending, not a false failure.
        if (dims.width > 0 && dims.height > 0) {
          imageDimensionCache.set(url, { width: dims.width, height: dims.height, valid: dims.valid });
        }
      }),
    ).then(() => {
      if (!cancelled) setMeasuredVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [imageUrls, measureImages]);

  const imageDimensions = useMemo(() => {
    void measuredVersion;
    const map: Record<string, MeasuredImageDims> = {};
    for (const url of imageUrls) {
      const dims = imageDimensionCache.get(url);
      if (dims) map[url] = dims;
    }
    return map;
  }, [imageUrls, measuredVersion]);

  const subject: RequirementSubject | null = useMemo(() => {
    if (!baseSubject) return null;
    return { ...baseSubject, image_dimensions: imageDimensions, channel_checks: channelCheckMap };
  }, [baseSubject, channelCheckMap, imageDimensions]);

  const items: ReadinessItem[] = useMemo(() => {
    if (!subject) return [];
    const fieldItems: ReadinessItem[] = evaluateRequirements(subject).map((r) => ({
      key: r.key,
      label: r.label,
      tier: r.tier,
      section: r.section,
      satisfied: r.satisfied,
      paintable: true,
      hint: r.hint,
      detail: r.detail,
      requirement: r,
    }));

    const serverItems: ReadinessItem[] = (backend?.checks ?? [])
      .filter((c) => (SERVER_ONLY_CHECK_IDS as readonly string[]).includes(c.id))
      .map((c) => ({
        key: c.id,
        label: c.name,
        tier: SERVER_ONLY_TIERS[c.id] ?? (c.severity === "blocker" ? "mandatory" : "recommended"),
        section: c.section ?? "general",
        satisfied: c.passed,
        paintable: false,
        message: c.message,
        detail: c.message ?? c.fix,
        fix: c.fix,
        sectionLabel: c.section_label,
        surface: c.surface,
      }));

    return [...fieldItems, ...serverItems];
  }, [backend?.checks, subject]);

  const totals = useMemo(() => {
    const mandatory = items.filter((i) => i.tier === "mandatory");
    const recommended = items.filter((i) => i.tier === "recommended");
    const mandatoryPassed = mandatory.filter((i) => i.satisfied).length;
    const recommendedPassed = recommended.filter((i) => i.satisfied).length;
    const pct = (passed: number, total: number) =>
      total === 0 ? 100 : Math.round((passed / total) * 100);
    return {
      mandatoryTotal: mandatory.length,
      mandatoryPassed,
      mandatoryOutstanding: mandatory.length - mandatoryPassed,
      mandatoryScore: pct(mandatoryPassed, mandatory.length),
      recommendedTotal: recommended.length,
      recommendedPassed,
      recommendedOutstanding: recommended.length - recommendedPassed,
      recommendedScore: pct(recommendedPassed, recommended.length),
    };
  }, [items]);

  const outstandingBySection: Record<string, SectionReadinessCounts> = useMemo(() => {
    const out: Record<string, SectionReadinessCounts> = {};
    for (const item of items) {
      if (item.satisfied) continue;
      const bucket = (out[item.section] ??= {
        mandatory: 0,
        recommended: 0,
        mandatoryLabels: [],
        recommendedLabels: [],
        mandatoryItems: [],
        recommendedItems: [],
      });
      const entry: SectionReadinessDetail = {
        key: item.key,
        label: item.label,
        detail: item.detail ?? item.hint,
        paintable: item.paintable,
        surface: item.surface,
      };
      if (item.tier === "mandatory") {
        bucket.mandatory += 1;
        bucket.mandatoryLabels.push(item.label);
        bucket.mandatoryItems.push(entry);
      } else {
        bucket.recommended += 1;
        bucket.recommendedLabels.push(item.label);
        bucket.recommendedItems.push(entry);
      }
    }
    return out;
  }, [items]);

  const refresh = useCallback(() => {
    query.refetch();
    if (channelChecks) channelQuery.refetch();
  }, [channelChecks]);

  return {
    subject,
    items,
    outstandingBySection,
    passed: totals.mandatoryOutstanding === 0,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    hasData: !!subject,
    refresh,
    ...totals,
  };
}

export default usePropertyReadiness;
