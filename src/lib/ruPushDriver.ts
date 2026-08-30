import { supabase } from "@/integrations/supabase/client";
import { extractFunctionError } from "@/lib/functionError";

/**
 * `push-property-to-ru` answers gate failures with HTTP 422 and a structured body
 * (`{ success: false, error: { code, message }, blockers, gaps }`). supabase-js turns any
 * non-2xx into a FunctionsHttpError with `data === null`, which is why the UI used to show the
 * opaque "Edge Function returned a non-2xx status code" instead of the real reason. This reads
 * the response body back off the error so the caller keeps the structured result.
 */
async function readErrorBody(error: unknown): Promise<RuPushResult | null> {
  const response = (error as { context?: Response } | null)?.context;
  if (!response || typeof response.text !== "function") return null;
  try {
    const raw = await response.clone().text();
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RuPushResult;
    if (parsed && typeof parsed === "object") return { ...parsed, success: parsed.success === true };
  } catch {
    return null;
  }
  return null;
}


/**
 * Resumable driver for `push-property-to-ru`.
 *
 * A standalone-unit property costs one content push plus availability/price pushes and both
 * read-backs per unit, so properties with many units used to exhaust the worker mid-run and the
 * trailing units failed with "Failed to send a request to the Edge Function". The function now
 * pushes a slice per invocation and returns `remaining_unit_ids`; this helper walks that sequence
 * until nothing is outstanding and merges the per-unit results into one shape the UI can render.
 */

export interface RuPushUnitResult {
  name?: string;
  room_type_id?: string;
  success?: boolean;
  error?: string;
  transport_failure?: boolean;
  rentalsunited_property_id?: string;
  ari?: unknown;
  diagnostics?: unknown;
  [key: string]: unknown;
}

export interface RuPushResult {
  success: boolean;
  error?: { code?: string; message?: string };
  units?: RuPushUnitResult[];
  multi_unit?: boolean;
  standalone_units?: boolean;
  remaining_unit_ids?: string[];
  [key: string]: unknown;
}

interface RuPushOptions {
  /** Units per invocation. Omit to use the function's default. */
  batchSize?: number;
  /** Restrict the push to specific room type ids. */
  onlyUnitIds?: string[];
  dryRun?: boolean;
  subscribeRlnm?: boolean;
  /**
   * Ask the channel to be read back after the price push. Off by default: ROL'OS is the source of
   * truth for rates, so routine pushes never pull the channel's prices. Onboarding and an operator
   * re-check turn it on because they need proof the channel holds our year.
   */
  verifyReadback?: boolean;
  /**
   * Full re-publish: re-send availability and prices even when their payload hashes are
   * unchanged, and read the calendar back. Used by an operator-requested full re-run of
   * onboarding Step B — routine pushes must never set these (they burn the channel's
   * one-write-per-minute window on identical payloads).
   */
  forceAvailability?: boolean;
  forcePrices?: boolean;
  verifyAvailabilityReadback?: boolean;
  /** Called after every chunk so the UI can show live progress. */
  onProgress?: (progress: { pushed: number; total: number; units: RuPushUnitResult[] }) => void;
}

const MAX_CHUNKS = 20;

export async function pushPropertyToRu(propertyId: string, options: RuPushOptions = {}): Promise<RuPushResult> {
  const {
    batchSize,
    onlyUnitIds,
    dryRun,
    subscribeRlnm,
    verifyReadback,
    forceAvailability,
    forcePrices,
    verifyAvailabilityReadback,
    onProgress,
  } = options;

  let remaining: string[] | undefined = onlyUnitIds;
  let batchId: string | undefined;
  const mergedUnits: RuPushUnitResult[] = [];
  let last: RuPushResult | null = null;

  for (let chunk = 0; chunk < MAX_CHUNKS; chunk++) {
    const { data, error } = await supabase.functions.invoke("push-property-to-ru", {
      body: {
        property_id: propertyId,
        ...(dryRun ? { dry_run: true } : {}),
        ...(subscribeRlnm ? { subscribe_rlnm: true } : {}),
        ...(verifyReadback ? { verify_readback: true } : {}),
        ...(verifyAvailabilityReadback ? { verify_availability_readback: true } : {}),
        ...(forceAvailability ? { force_availability: true } : {}),
        ...(forcePrices ? { force_prices: true } : {}),
        ...(remaining && remaining.length > 0 ? { only_unit_ids: remaining } : {}),
        ...(batchSize ? { batch_size: batchSize } : {}),
        ...(batchId ? { batch_id: batchId } : {}),
      },
    });
    if (error) {
      const body = await readErrorBody(error);
      if (body) {
        // A gate/validation refusal — return the structured reasons instead of a generic throw.
        return mergedUnits.length > 0
          ? { ...body, units: [...mergedUnits, ...(body.units ?? [])], remaining_unit_ids: [] }
          : body;
      }
      throw new Error(await extractFunctionError(error, error.message || "Push failed"));
    }

    const result = (data ?? {}) as RuPushResult;

    last = result;
    batchId = (result.batch_id as string | undefined) ?? batchId;

    for (const unit of result.units ?? []) {
      const idx = mergedUnits.findIndex((u) => u.room_type_id && u.room_type_id === unit.room_type_id);
      if (idx >= 0) mergedUnits[idx] = unit;
      else mergedUnits.push(unit);
    }

    const nextRemaining = (result.remaining_unit_ids ?? []) as string[];
    if (mergedUnits.length > 0) {
      onProgress?.({
        pushed: mergedUnits.filter((u) => u.success).length,
        total: mergedUnits.length + nextRemaining.length,
        units: [...mergedUnits],
      });
    }

    // Non-chunked flows (single unit, building mode, dry run, blocked gate) answer in one shot.
    if (!result.resume || nextRemaining.length === 0) {
      return mergedUnits.length > 0 ? { ...result, units: mergedUnits, remaining_unit_ids: [] } : result;
    }
    // No forward progress in this chunk — stop instead of looping on the same units.
    if (remaining && nextRemaining.length >= remaining.length && chunk > 0) {
      return { ...result, units: mergedUnits, remaining_unit_ids: nextRemaining };
    }
    remaining = nextRemaining;
  }

  return {
    ...(last ?? {}),
    success: false,
    units: mergedUnits,
    remaining_unit_ids: remaining ?? [],
    error: {
      code: "RU_PUSH_INTERRUPTED",
      message: `Push stopped after ${MAX_CHUNKS} batches with ${(remaining ?? []).length} unit(s) outstanding — retry to continue.`,
    },
  };
}
