import { supabase } from "@/integrations/supabase/client";
import { CHANNEL_LEDGER_STEP_KEYS, CHANNEL_STEP_LEDGER_SETTING_KEY, type ChannelLedgerStepKey } from "@/config/channelStepLedger";

/**
 * Is the channel step ledger rollout enabled?
 *
 * Phase 0: no caller switches behaviour on this. Default and every failure mode
 * resolve to `false`, so a missing row, a denied read or a network error keeps
 * the production path exactly as it is today.
 */
export async function isChannelStepLedgerEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("ru_platform_settings")
      .select("value")
      .eq("key", CHANNEL_STEP_LEDGER_SETTING_KEY)
      .maybeSingle();
    if (error) return false;
    return (data?.value as { enabled?: boolean } | null)?.enabled === true;
  } catch {
    return false;
  }
}

const VALID_STEPS = new Set<string>(CHANNEL_LEDGER_STEP_KEYS);

/**
 * Phase 2 — section dirty monitor.
 *
 * Flag the ledger steps a just-persisted save invalidates. Deliberately dumb: it
 * writes nothing but the status, never calls the channel and never re-grades. If
 * the ledger flag is off, the property has no seeded rows, or the call fails for
 * any reason it resolves quietly — a save that already succeeded must never be
 * rolled back or reported as failed because bookkeeping did not land.
 *
 * Call this AFTER the section data has been persisted.
 */
export async function markChannelStepsStale(
  propertyId: string | null | undefined,
  stepKeys: readonly (ChannelLedgerStepKey | string)[],
): Promise<{ marked: number } | null> {
  if (!propertyId) return null;
  const keys = [...new Set(stepKeys.filter((key) => VALID_STEPS.has(key)))];
  if (keys.length === 0) return null;
  try {
    if (!(await isChannelStepLedgerEnabled())) return null;
    const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
      body: { action: "ledger_mark_stale", property_id: propertyId, step_keys: keys },
    });
    if (error) {
      console.warn("[channel-ledger] mark_stale failed:", error.message);
      return null;
    }
    return { marked: Number(data?.marked ?? 0) };
  } catch (err) {
    console.warn("[channel-ledger] mark_stale error:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Channel sync trigger → macro steps the underlying save touched.
 *
 * The two `queueChannel*Sync` helpers are already called by every surface that
 * persists channel-relevant property data, so their trigger label is the most
 * reliable "what changed" signal the app has. Unknown triggers fall back to the
 * broad section the delta belongs to rather than marking everything stale.
 */
const TRIGGER_STEPS: Record<string, ChannelLedgerStepKey[]> = {
  property_save: ["identity"],
  property_save_seasons: ["commercial"],
  onboarding_save: ["identity"],
  portfolio_commons_share: ["identity"],
  arrival_policy_save: ["commercial"],
  unit_arrival_policy_save: ["commercial"],
  cancellation_policy_save: ["commercial"],
  unit_amenities_save: ["rooms"],
  unit_active_toggle: ["rooms"],
  local_experience_save: ["identity"],
  local_experience_delete: ["identity"],
  stop_sell_change: ["commercial"],
  nb_import: ["commercial"],
  booking_moved: ["commercial"],
  rate_plan_save: ["commercial"],
};

export function channelLedgerStepsForTrigger(
  trigger: string,
  kind: "content" | "rates",
): ChannelLedgerStepKey[] {
  const mapped = TRIGGER_STEPS[trigger];
  if (mapped) return mapped;
  if (kind === "rates") return ["commercial"];
  if (/(photo|image|media)/i.test(trigger)) return ["media"];
  if (/(room|unit|bed|occupanc)/i.test(trigger)) return ["rooms"];
  if (/(address|geo|location|place)/i.test(trigger)) return ["location"];
  if (/(rate|price|polic|payment|availab|restrict|season)/i.test(trigger)) return ["commercial"];
  return ["identity"];
}

/** Field groups on `properties` that decide which macro step a save invalidates. */
const IDENTITY_FIELDS = [
  "name",
  "slug",
  "property_type",
  "description",
  "short_description",
  "star_rating",
  "owner_email",
  "vat_number",
  "company_name",
  "registration_number",
  "brand_voice",
] as const;

const LOCATION_FIELDS = [
  "address",
  "suburb",
  "city",
  "province",
  "postal_code",
  "country",
  "latitude",
  "longitude",
  "google_place_id",
] as const;

const MEDIA_FIELDS = ["images", "hero_image", "gallery_images", "logo_url"] as const;

const ROOMS_FIELDS = ["max_guests", "bedrooms", "bathrooms", "property_size_sqm", "floor"] as const;

const COMMERCIAL_FIELDS = [
  "base_price",
  "currency",
  "check_in_time",
  "check_out_time",
  "cancellation_policy",
  "min_stay",
  "max_stay",
  "payment_mode",
] as const;

const AMENITY_GROUPS: Array<{ keys: string[]; step: ChannelLedgerStepKey }> = [
  { keys: ["room_types", "unit_types", "bed_composition", "occupancy"], step: "rooms" },
  { keys: ["images", "photos", "hero_image"], step: "media" },
  { keys: ["seasons", "season_rates", "pms_rate_types", "addons", "packages", "policies", "charges"], step: "commercial" },
  { keys: ["attraction_distances", "nearby_attractions"], step: "location" },
];

function shallowEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  try {
    return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  } catch {
    return false;
  }
}

/**
 * Which macro steps does this property save invalidate?
 *
 * `PropertyForm` persists many sections in a single `properties` row update, so the
 * only honest way to stay section-scoped is to diff the submitted payload against the
 * record that was loaded. Nothing changed → nothing is marked stale.
 */
export function derivePropertyStepsFromChanges(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): ChannelLedgerStepKey[] {
  if (!before || !after) return [];
  const steps = new Set<ChannelLedgerStepKey>();
  const groups: Array<{ fields: readonly string[]; step: ChannelLedgerStepKey }> = [
    { fields: IDENTITY_FIELDS, step: "identity" },
    { fields: LOCATION_FIELDS, step: "location" },
    { fields: MEDIA_FIELDS, step: "media" },
    { fields: ROOMS_FIELDS, step: "rooms" },
    { fields: COMMERCIAL_FIELDS, step: "commercial" },
  ];
  for (const group of groups) {
    for (const field of group.fields) {
      if (!(field in after)) continue;
      if (!shallowEqual(before[field], after[field])) {
        steps.add(group.step);
        break;
      }
    }
  }

  const beforeAmenities = (before.amenities ?? {}) as Record<string, unknown>;
  const afterAmenities = (after.amenities ?? {}) as Record<string, unknown>;
  for (const group of AMENITY_GROUPS) {
    for (const key of group.keys) {
      if (!(key in afterAmenities)) continue;
      if (!shallowEqual(beforeAmenities[key], afterAmenities[key])) {
        steps.add(group.step);
        break;
      }
    }
  }

  return [...steps];
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 3 — read path. The wizard reads the ledger instead of re-grading on mount.
// ─────────────────────────────────────────────────────────────────────────────

export type ChannelLedgerStatus = "pending" | "blocked" | "passed" | "stale" | "unknown";

export interface ChannelLedgerStep {
  step_key: ChannelLedgerStepKey | string;
  status: ChannelLedgerStatus;
  blocker_summary?: string | null;
  input_fingerprint?: string | null;
  source?: string | null;
  details?: Record<string, unknown> | null;
  passed_at?: string | null;
  stale_at?: string | null;
  last_checked_at?: string | null;
}

export interface ChannelLedgerSnapshot {
  enabled: boolean;
  steps: ChannelLedgerStep[];
}

/** Steps whose truth lives on the channel side — the only ones a probe may refresh. */
export const CHANNEL_CLASS_LEDGER_STEPS: ChannelLedgerStepKey[] = [
  "publish",
  "currency",
  "pull_listings",
  "company_profile",
  "keys",
  "push_owner",
  "connect",
];

/**
 * Steps decided entirely from ROL'OS data — the only class the background drain
 * re-checks, and the class the wizard's own Refresh button covers.
 */
export const LOCAL_CLASS_LEDGER_STEPS: ChannelLedgerStepKey[] = CHANNEL_LEDGER_STEP_KEYS.filter(
  (key) => !CHANNEL_CLASS_LEDGER_STEPS.includes(key),
);

async function invokeLedger(body: Record<string, unknown>): Promise<ChannelLedgerSnapshot | null> {
  try {
    const { data, error } = await supabase.functions.invoke("ru-cert-portal", { body });
    if (error || !data?.success) return null;
    return {
      enabled: data.enabled === true,
      steps: Array.isArray(data.steps) ? (data.steps as ChannelLedgerStep[]) : [],
    };
  } catch {
    return null;
  }
}

/** Pure read. Never calls the channel, never writes. */
export function fetchChannelLedger(propertyId: string): Promise<ChannelLedgerSnapshot | null> {
  return invokeLedger({ action: "ledger_get", property_id: propertyId });
}

/** Create missing rows as `pending`. Idempotent — existing rows are untouched. */
export function seedChannelLedger(propertyId: string): Promise<ChannelLedgerSnapshot | null> {
  return invokeLedger({ action: "ledger_seed", property_id: propertyId });
}

/**
 * Re-grade the ledger. `allowChannelProbe` is the only switch that permits a live
 * channel read — the wizard's own Refresh always passes `false`.
 */
export function recheckChannelLedger(
  propertyId: string,
  opts?: { allowChannelProbe?: boolean },
): Promise<ChannelLedgerSnapshot | null> {
  return invokeLedger({
    action: "ledger_recheck",
    property_id: propertyId,
    probe_ari: opts?.allowChannelProbe === true,
  });
}

/**
 * Has this row ever been graded? A seeded `pending` row that was never checked
 * carries NO verdict — it must fall back to the locally computed truth instead of
 * vetoing a step the property has genuinely finished.
 */
export function ledgerHasVerdict(step: ChannelLedgerStep | undefined | null): boolean {
  if (!step) return false;
  if (step.status === "pending") return !!step.passed_at || !!step.last_checked_at;
  return true;
}

/** Does this ledger row still count as complete? A prior pass survives stale/unknown. */
export function ledgerStepComplete(step: ChannelLedgerStep | undefined | null): boolean {
  if (!step) return false;
  if (step.status === "passed") return true;
  if (step.status === "blocked") return false;
  // stale / unknown / pending keep the last successful verdict visible.
  return !!step.passed_at;
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 5 — portfolio read path. The Onboarding list reuses stored verdicts so a
// property that already passed does not re-test the channel on every page visit.
// ─────────────────────────────────────────────────────────────────────────────

export interface PropertyLedgerVerdict {
  /** Any ledger rows at all for this property? */
  seeded: boolean;
  /** Every step complete (a prior pass survives stale/unknown). */
  allComplete: boolean;
  /** 0-100 over the canonical step list. */
  percent: number;
  /** A channel-class step needs a live probe (never graded, blocked or dirty). */
  needsChannelProbe: boolean;
}

/**
 * One batched read of `property_channel_step_status` for many properties.
 * Pure read: never calls the channel, never writes.
 */
export async function fetchChannelLedgerBatch(
  propertyIds: readonly string[],
): Promise<Map<string, PropertyLedgerVerdict>> {
  const result = new Map<string, PropertyLedgerVerdict>();
  if (!propertyIds.length) return result;
  const { data, error } = await supabase
    .from("property_channel_step_status")
    .select("property_id, step_key, status, passed_at, stale_at, last_checked_at")
    .in("property_id", propertyIds as string[]);
  if (error) return result;

  const byProperty = new Map<string, ChannelLedgerStep[]>();
  for (const row of (data ?? []) as ChannelLedgerStep[] & { property_id: string }[]) {
    const id = String((row as unknown as { property_id: string }).property_id);
    const list = byProperty.get(id) ?? [];
    list.push(row as ChannelLedgerStep);
    byProperty.set(id, list);
  }

  for (const id of propertyIds) {
    const steps = byProperty.get(id) ?? [];
    // Rows that were seeded but never graded carry no verdict at all. Treating them
    // as "seeded" would report a finished property as 0% — it counts as unseeded so
    // the caller grades it instead of trusting empty bookkeeping.
    if (!steps.some((step) => ledgerHasVerdict(step))) {
      result.set(id, { seeded: false, allComplete: false, percent: 0, needsChannelProbe: true });
      continue;
    }
    const byKey = new Map(steps.map((s) => [String(s.step_key), s]));
    const complete = CHANNEL_LEDGER_STEP_KEYS.filter((key) => ledgerStepComplete(byKey.get(key)));
    const needsChannelProbe = CHANNEL_CLASS_LEDGER_STEPS.some((key) => {
      const step = byKey.get(key);
      if (!step) return true;
      if (step.status === "passed") return false;
      // stale / unknown / pending / blocked all warrant a live look.
      return true;
    });
    result.set(id, {
      seeded: true,
      allComplete: complete.length === CHANNEL_LEDGER_STEP_KEYS.length,
      percent: Math.round((complete.length / CHANNEL_LEDGER_STEP_KEYS.length) * 100),
      needsChannelProbe,
    });
  }
  return result;
}
