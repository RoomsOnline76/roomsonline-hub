/**
 * Channel edit gate — steps 1–13 of the Channel onboarding wizard.
 *
 * Ordinary edits (property save, rate plan, seasons, restrictions, charges, images…)
 * must NOT reach the Channel Manager, and must not raise push/confirmation toasts,
 * until the property has cleared the first thirteen wizard steps: published listing
 * read back, currency verified, sub-account signed off and Channel Manager enabled
 * on billing. Step 14 (connect sales channels) is deliberately NOT required — a
 * published, entitled property keeps pushing deltas.
 *
 * Read from the database only: no channel traffic, no edge invoke. Any read failure
 * resolves to CLOSED so an error can never cause a surprise push.
 *
 * Explicit operator actions (manual "push now", wizard publish, certification console,
 * cron) bypass this gate by passing `manual: true` to the sync helpers.
 */

import { supabase } from "@/integrations/supabase/client";
import { ROLOS_SIGNOFF_CHECKLIST } from "@/config/rolosOnboardingMacros";
import { onRuAccountsChanged } from "@/lib/ruAccountsSignal";

export interface ChannelEditGateState {
  /** Every one of steps 1–13 is satisfied — normal delta behaviour applies. */
  open: boolean;
  /** Human-readable reasons the gate is closed (diagnostics / console only). */
  missing: string[];
}

export const CHANNEL_EDIT_GATE_REASON = "onboarding_incomplete";

interface CacheEntry {
  at: number;
  value: ChannelEditGateState;
}

const CACHE_TTL_MS = 60_000;
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<ChannelEditGateState>>();

let listenerBound = false;
function bindInvalidation(): void {
  if (listenerBound) return;
  listenerBound = true;
  // Binding a sub-account or capturing keys can flip the gate; drop the cache so the
  // very next save is evaluated against the new state.
  onRuAccountsChanged(() => cache.clear());
}

/** Forget any cached verdict (e.g. right after a publish or entitlement change). */
export function invalidateChannelEditGate(propertyId?: string | null): void {
  if (propertyId) cache.delete(propertyId);
  else cache.clear();
}

async function entitlementEnabled(propertyId: string): Promise<boolean> {
  const { data: member } = await supabase
    .from("property_portfolio_members")
    .select("portfolio_id")
    .eq("property_id", propertyId)
    .maybeSingle();
  const portfolioId = (member?.portfolio_id as string | undefined) || null;
  if (portfolioId) {
    const { data } = await supabase
      .from("portfolio_billing_configs")
      .select("channel_manager_enabled")
      .eq("portfolio_id", portfolioId)
      .maybeSingle();
    return data?.channel_manager_enabled === true;
  }
  const { data } = await supabase
    .from("property_billing_configs")
    .select("channel_manager_enabled")
    .eq("property_id", propertyId)
    .maybeSingle();
  return data?.channel_manager_enabled === true;
}

async function resolve(propertyId: string): Promise<ChannelEditGateState> {
  const missing: string[] = [];
  try {
    /**
     * Fast path — the two-step Channel Monitor flow records a durable `ready_to_connect`
     * verdict once Step A and Step B have both passed. That verdict already implies the
     * published listing, its read-back, currency and entitlement, so honour it directly
     * instead of re-deriving the same facts from five tables.
     */
    const { data: connected } = await supabase
      .from("property_channel_step_status")
      .select("status")
      .eq("property_id", propertyId)
      .eq("step_key", "ready_to_connect")
      .maybeSingle();
    if (connected?.status === "passed") {
      const { data: pushRow } = await supabase
        .from("properties")
        .select("ru_push_enabled")
        .eq("id", propertyId)
        .maybeSingle();
      if (pushRow?.ru_push_enabled === false) {
        return { open: false, missing: ["Channel pushes are switched off for this property"] };
      }
      return { open: true, missing: [] };
    }

    const [propertyRes, currencyRes, roadmapRes, entitlement] = await Promise.all([
      supabase
        .from("properties")
        .select("rentalsunited_property_id, ru_listings_verified_at, ru_push_enabled")
        .eq("id", propertyId)
        .maybeSingle(),
      supabase
        .from("ru_currency_state")
        .select("verified_at, published_currency_iso, ru_reported_currency_iso")
        .eq("property_id", propertyId)
        .maybeSingle(),
      supabase
        .from("property_onboarding_roadmap")
        .select("roadmap")
        .eq("property_id", propertyId)
        .maybeSingle(),
      entitlementEnabled(propertyId),
    ]);

    const property = propertyRes.data as Record<string, unknown> | null;
    if (!property) return { open: false, missing: ["Property not readable"] };

    // Step 11 — listing published and read back.
    const listingId = String(property.rentalsunited_property_id ?? "").trim();
    if (!listingId) missing.push("Listing not published to the channel yet (step 11)");
    else if (!property.ru_listings_verified_at) missing.push("Published listing has not been read back (step 11)");
    if (property.ru_push_enabled === false) missing.push("Channel pushes are switched off for this property");

    // Step 12 — currency verified and consistent.
    const currency = currencyRes.data as Record<string, string | null> | null;
    const currencyOk =
      !!currency?.verified_at &&
      (!currency.ru_reported_currency_iso ||
        !currency.published_currency_iso ||
        currency.ru_reported_currency_iso === currency.published_currency_iso);
    if (!currencyOk) missing.push("Location & currency not verified (step 12)");

    // Step 9 — manual sub-account sign-off.
    const roadmap = ((roadmapRes.data?.roadmap as Record<string, unknown> | null) ?? {}) as Record<string, unknown>;
    const readiness = (roadmap.channel_readiness ?? {}) as Record<string, unknown>;
    const checks = (readiness.checks ?? {}) as Record<string, { checked?: boolean } | undefined>;
    const signedOff = ROLOS_SIGNOFF_CHECKLIST.every((item) => checks[item.key]?.checked === true);
    if (!signedOff) missing.push("Sub-account verification checklist not signed off (step 9)");

    // Step 13 — Channel Manager entitlement on billing.
    if (!entitlement) missing.push("Channel Manager not enabled on billing (step 13)");

    return { open: missing.length === 0, missing };
  } catch (err) {
    console.warn("[channel edit gate] resolve failed:", err instanceof Error ? err.message : err);
    return { open: false, missing: ["Gate state could not be read"] };
  }
}

/** Cached gate state for a property. Closed by default and on any failure. */
export async function channelEditGateState(
  propertyId: string | null | undefined,
): Promise<ChannelEditGateState> {
  if (!propertyId) return { open: false, missing: ["No property"] };
  bindInvalidation();
  const cached = cache.get(propertyId);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) return cached.value;
  const existing = inflight.get(propertyId);
  if (existing) return existing;
  const work = resolve(propertyId)
    .then((value) => {
      cache.set(propertyId, { at: Date.now(), value });
      return value;
    })
    .finally(() => inflight.delete(propertyId));
  inflight.set(propertyId, work);
  return work;
}

/** True when ordinary edits may talk to the channel (and raise push toasts). */
export async function isChannelEditPushAllowed(
  propertyId: string | null | undefined,
): Promise<boolean> {
  return (await channelEditGateState(propertyId)).open;
}
