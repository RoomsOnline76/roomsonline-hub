import { supabase } from "@/integrations/supabase/client";
import { pushPropertyToRu, type RuPushResult, type RuPushUnitResult } from "@/lib/ruPushDriver";

/**
 * Portfolio-wide channel push.
 *
 * The channel account is resolved per property, and a portfolio-scoped account wins over any
 * property-scoped one — so every property in a portfolio inherits the same OwnerID and API keys.
 * This helper therefore only has to walk the portfolio's properties and run the existing
 * resumable single-property driver once each. It never runs two properties at once: the channel
 * rate-limits each method to one call per sliding minute, so parallel pushes only produce
 * deferrals.
 */

export type RuPortfolioPushState = "queued" | "running" | "pushed" | "skipped" | "failed";

export interface RuPortfolioPushRow {
  propertyId: string;
  name: string;
  state: RuPortfolioPushState;
  /** Units confirmed on the channel in this run. */
  pushed: number;
  /** Units attempted (pushed + outstanding) as reported by the driver. */
  total: number;
  /** Gate blockers when the property was skipped. */
  blockers: string[];
  message?: string;
}

interface PushTarget {
  id: string;
  name: string;
}

function unitFailures(units: RuPushUnitResult[] | undefined): string[] {
  return (units ?? [])
    .filter((u) => u.success === false && u.error)
    .map((u) => `${u.name ?? "unit"}: ${u.error}`);
}

function blockersOf(result: RuPushResult): string[] {
  const raw = (result.blockers ?? result.gaps) as unknown;
  if (!Array.isArray(raw)) return [];
  return raw
    .map((b) => (typeof b === "string" ? b : ((b as { label?: string; message?: string })?.message ?? (b as { label?: string })?.label ?? "")))
    .filter((b): b is string => !!b);
}

/**
 * Stale verification fields from an earlier account. Once a property is confirmed under the
 * current OwnerID, the old record must go or the wizard and monitor keep reporting the previous
 * account as the property's channel home.
 */
async function clearStaleListingVerification(propertyId: string): Promise<void> {
  await supabase
    .from("properties")
    .update({
      ru_listings_verified_owner: null,
      ru_listings_verified_units: null,
      ru_listings_expected_units: null,
      ru_listings_verified_at: null,
    })
    .eq("id", propertyId);
}

export async function pushPropertiesToChannel(
  targets: PushTarget[],
  onProgress: (rows: RuPortfolioPushRow[]) => void,
): Promise<RuPortfolioPushRow[]> {
  const rows: RuPortfolioPushRow[] = targets.map((t) => ({
    propertyId: t.id,
    name: t.name,
    state: "queued",
    pushed: 0,
    total: 0,
    blockers: [],
  }));

  const emit = () => onProgress(rows.map((r) => ({ ...r, blockers: [...r.blockers] })));
  emit();

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];
    rows[i] = { ...rows[i], state: "running" };
    emit();

    try {
      const result = await pushPropertyToRu(target.id, {
        subscribeRlnm: true,
        onProgress: ({ pushed, total }) => {
          rows[i] = { ...rows[i], pushed, total };
          emit();
        },
      });

      const units = result.units ?? [];
      const pushed = units.filter((u) => u.success).length;
      const outstanding = (result.remaining_unit_ids ?? []).length;
      const failures = unitFailures(units);
      const gate = blockersOf(result);

      if (result.success) {
        await clearStaleListingVerification(target.id);
        rows[i] = {
          ...rows[i],
          state: "pushed",
          pushed,
          total: units.length + outstanding,
          blockers: [],
          message: failures.length ? failures.join(" · ") : undefined,
        };
      } else if (gate.length > 0) {
        // A readiness refusal is not a run failure: report it and carry on with the next property.
        rows[i] = {
          ...rows[i],
          state: "skipped",
          pushed,
          total: units.length + outstanding,
          blockers: gate,
          message: result.error?.message,
        };
      } else {
        if (pushed > 0) await clearStaleListingVerification(target.id);
        rows[i] = {
          ...rows[i],
          state: "failed",
          pushed,
          total: units.length + outstanding,
          blockers: [],
          message: result.error?.message ?? failures.join(" · ") ?? "Push failed",
        };
      }
    } catch (err) {
      rows[i] = {
        ...rows[i],
        state: "failed",
        message: err instanceof Error ? err.message : "Push failed",
      };
    }

    emit();
  }

  return rows;
}
