import { readInvokeErrorBody } from './ruInvokeBody.ts';
import { evaluateRuOperationalSync, RU_WIZARD_SYNC_CODE } from './ruSyncGate.ts';

// Event-driven Rentals United STATIC CONTENT delta (Push_PutProperty_RQ).
//
// RU requires static content (name, type, descriptions, amenities, photos, bed composition,
// location, policies) to be re-pushed whenever it changes in the PMS — a weekly full refresh
// alone does not satisfy the White-Label certification requirement.
//
// Any ROLOS surface that saves static content calls `queueRuStaticDelta`, which:
//   - skips properties that are not RU-connected (building id OR any active unit id) and
//     properties with pushes paused (`ru_push_enabled = false`),
//   - fingerprints the static content and skips the push when nothing RU cares about changed
//     (so a no-op save costs nothing against RU's per-owner write window),
//   - debounces per property so a burst of saves becomes one push,
//   - delegates the actual write to `push-property-to-ru` (action: 'static_only'), which is the
//     single owner of the RU push contract. ARI keeps its own delta path (`refresh_ari`).
//
// Failures are logged and swallowed: a channel refresh must never break a save.

/**
 * Minimum gap between two static deltas for the same property.
 *
 * Deliberately short: a save must reach the channel while the operator is still looking at the
 * editor. It only coalesces autosave bursts — the fingerprint check already stops identical
 * content from being sent twice.
 */
export const RU_STATIC_DELTA_DEBOUNCE_MS = 10 * 1000;

/** ru_sync_runs.action used for static content deltas. */
export const RU_STATIC_DELTA_ACTION = 'static_delta';

/**
 * ru_sync_runs.action used for deltas that deliberately did nothing (not listed, paused,
 * unchanged fingerprint). Logged under a separate action so it can never be mistaken for a
 * delivered push by the fingerprint/debounce lookup, while still answering the operator
 * question "did my save reach the channel?".
 */
export const RU_STATIC_DELTA_SKIP_ACTION = 'static_delta_skipped';

/**
 * ru_sync_runs.action used when the delta was refused by the readiness / phase gate. The change
 * is real and still owed to the channel, so it is parked here and automatically re-fired the
 * moment readiness clears — the operator never has to press a manual sync button.
 */
export const RU_STATIC_DELTA_PENDING_ACTION = 'static_delta_pending';

/** Gate refusals that mean "correct content, not yet allowed" rather than a hard failure. */
export const RU_GATE_ERROR_CODES = ['PHASE_BLOCKED', 'READINESS_UNVERIFIED', 'READINESS_FAILED', RU_WIZARD_SYNC_CODE];

/** A multi-unit property is pushed in resumable chunks; walk at most this many chunks. */
const RU_STATIC_DELTA_MAX_CHUNKS = 12;

export interface RuStaticDeltaOutcome {
  queued: boolean;
  reason?: 'not_connected' | 'unchanged' | 'debounced' | 'error' | 'no_property' | 'gate_pending';
  content_hash?: string;
  error?: string;
  /** Readiness blockers that parked this delta (only with reason `gate_pending`). */
  blockers?: string[];
}



/** Property columns that end up inside Push_PutProperty_RQ. */
const PROPERTY_STATIC_COLUMNS = [
  'name',
  'description',
  'property_type',
  'address',
  'city',
  'country',
  'postal_code',
  'latitude',
  'longitude',
  'max_guests',
  'bedrooms',
  'bathrooms',
  'toilets',
  'separate_kitchen',
  'amenities',
  'images',
  'ru_image_tags',
  'short_description',
  'cancellation_master_mode',
  'ru_push_enabled',
  'rentalsunited_property_id',
] as const;

/** Unit columns that end up inside a unit's Push_PutProperty_RQ. */
const UNIT_STATIC_COLUMNS = [
  'id',
  'name',
  'description',
  'max_guests',
  'bedrooms',
  'bathrooms',
  'beds',
  'bed_configuration',
  'amenities',
  'images',
  'check_in_time',
  'check_out_time',
  'cancellation_policy',
  'room_size',
  'address_street',
  'address_postal_code',
  'latitude',
  'longitude',
  'property_type',
  'ru_image_tags',
  'check_in_instructions',
  'rentalsunited_property_id',
  'is_active',
] as const;

function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Per-field fingerprints of a snapshot.
 *
 * The overall content hash proves *that* something changed; certification also asks which fields a
 * delta carried. Hashing each field (and each unit field, keyed `unit:<id>.<column>`) lets the
 * delta name the changed fields by diffing against the previous run's map — without ever storing
 * property content in the log.
 */
async function fieldFingerprints(snapshot: StaticSnapshot): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  const add = async (key: string, value: unknown) => {
    out[key] = (await sha256(stableStringify(value))).slice(0, 16);
  };
  for (const col of PROPERTY_STATIC_COLUMNS) {
    await add(`property.${col}`, snapshot.property?.[col] ?? null);
  }
  for (const unit of snapshot.units) {
    const unitKey = String(unit.id ?? unit.name ?? 'unknown');
    for (const col of UNIT_STATIC_COLUMNS) {
      if (col === 'id') continue;
      await add(`unit:${unitKey}.${col}`, unit[col] ?? null);
    }
  }
  return out;
}

/** Field keys whose fingerprint differs between two runs (added and removed keys included). */
function diffFingerprints(
  previous: Record<string, string> | null,
  current: Record<string, string>,
): string[] {
  if (!previous) return [];
  const keys = new Set([...Object.keys(previous), ...Object.keys(current)]);
  return [...keys].filter((k) => previous[k] !== current[k]).sort();
}

/**
 * Unit ids this delta can be limited to.
 *
 * Property-level fields (name, description, address, amenities, images, occupancy) are copied into
 * every listing's payload, so any `property.*` change must push all listings. When *only* unit
 * fields moved, the push is scoped to those units — a one-unit edit on an eleven-unit property
 * then costs one channel write instead of eleven.
 */
function scopeUnitIdsFromChanges(changedFields: string[]): string[] | null {
  if (changedFields.length === 0) return null;
  if (changedFields.some((k) => k.startsWith('property.'))) return null;
  const ids = new Set<string>();
  for (const key of changedFields) {
    const match = /^unit:([^.]+)\./.exec(key);
    if (!match) return null;
    ids.add(match[1]);
  }
  return ids.size > 0 ? [...ids] : null;
}

interface StaticSnapshot {
  property: Record<string, unknown> | null;
  units: Record<string, unknown>[];
  ruConnected: boolean;
  pushEnabled: boolean;
  /** True when the property has a live listing (building id or any active unit id). */
  listed: boolean;
  gateCode: string | null;
  gateMessage: string | null;
}

async function loadSnapshot(supabase: any, propertyId: string): Promise<StaticSnapshot> {
  const [{ data: property }, { data: units }] = await Promise.all([
    supabase
      .from('properties')
      .select(PROPERTY_STATIC_COLUMNS.join(','))
      .eq('id', propertyId)
      .maybeSingle(),
    // Archived units keep dead channel ids — only active inventory is pushed.
    supabase
      .from('hostfully_room_types')
      .select(UNIT_STATIC_COLUMNS.join(','))
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .order('name', { ascending: true }),
  ]);

  const unitRows = (units ?? []) as Record<string, unknown>[];
  const listedUnit = unitRows.some((u) => !!u.rentalsunited_property_id);
  const listed = Boolean(property?.rentalsunited_property_id) || listedUnit;
  const gate = await evaluateRuOperationalSync(supabase, propertyId);
  return {
    property: (property ?? null) as Record<string, unknown> | null,
    units: unitRows,
    listed,
    ruConnected: gate.allowed && listed,
    pushEnabled: gate.allowed,
    gateCode: gate.allowed ? null : (gate.code ?? null),
    gateMessage: gate.allowed ? null : (gate.message ?? null),
  };
}

async function lastStaticRun(
  supabase: any,
  propertyId: string,
): Promise<{ hash: string | null; at: number | null; fields: Record<string, string> | null }> {
  const { data } = await supabase
    .from('ru_sync_runs')
    .select('created_at, details')
    .eq('property_id', propertyId)
    .eq('action', RU_STATIC_DELTA_ACTION)
    .order('created_at', { ascending: false })
    .limit(1);
  const row = (data ?? [])[0];
  if (!row) return { hash: null, at: null, fields: null };
  const details = row.details as Record<string, unknown> | null;
  const hash = details?.content_hash;
  const fields = details?.field_fingerprints;
  return {
    hash: typeof hash === 'string' ? hash : null,
    at: row.created_at ? new Date(row.created_at).getTime() : null,
    fields: fields && typeof fields === 'object' ? (fields as Record<string, string>) : null,
  };
}

/**
 * Fire a static-content delta for one property. Awaiting it is optional — callers in a save
 * path should not block on the RU round-trip.
 */
export async function queueRuStaticDelta(
  supabase: any,
  propertyId: string | null | undefined,
  trigger: string,
  /** `force` bypasses both the fingerprint and the debounce (manual "push content now"). */
  options: { force?: boolean } = {},
): Promise<RuStaticDeltaOutcome> {
  if (!propertyId) return { queued: false, reason: 'no_property' };
  try {
    const snapshot = await loadSnapshot(supabase, propertyId);
    if (!snapshot.property) {
      await logSkip(supabase, propertyId, trigger, 'no_property', null);
      return { queued: false, reason: 'no_property' };
    }
    // A listed property whose gate refuses (pushes switched off, wizard incomplete) still *owes*
    // this change to the channel: park it so the automatic re-arm delivers it the moment the gate
    // clears. Only a genuinely undistributed listing is a plain skip.
    if (!snapshot.pushEnabled && snapshot.listed) {
      const message = snapshot.gateMessage ?? 'The Channel Manager is not enabled for this property yet.';
      await logPending(supabase, propertyId, trigger, snapshot.gateCode, message);
      return { queued: false, reason: 'gate_pending', error: message, blockers: [message] };
    }
    if (!snapshot.ruConnected) {
      await logSkip(supabase, propertyId, trigger, 'not listed on the channel', null);
      return { queued: false, reason: 'not_connected' };
    }

    const contentHash = await sha256(
      stableStringify({ property: snapshot.property, units: snapshot.units }),
    );
    const previous = await lastStaticRun(supabase, propertyId);
    const currentFields = await fieldFingerprints(snapshot);
    // Named for the auditor: which fields this delta carries, and whether it is a targeted delta
    // or the first/full push for this listing (no prior fingerprint map to diff against).
    const changedFields = diffFingerprints(previous.fields, currentFields);
    const pushType = previous.fields ? (options.force ? 'forced_full' : 'delta') : 'full';

    if (!options.force) {
      if (previous.hash && previous.hash === contentHash) {
        await logSkip(supabase, propertyId, trigger, 'nothing the channel cares about changed', contentHash);
        return { queued: false, reason: 'unchanged', content_hash: contentHash };
      }
      // Content genuinely changed but the last push was very recent: wait out the window rather
      // than dropping the delta, otherwise a burst of autosaves could strand the final change
      // until the weekly full push.
      const sinceLast = previous.at ? Date.now() - previous.at : Number.MAX_SAFE_INTEGER;
      if (sinceLast < RU_STATIC_DELTA_DEBOUNCE_MS) {
        console.log(`[ruStaticDelta] Holding ${trigger} delta for property ${propertyId}`);
        await new Promise((resolve) => setTimeout(resolve, RU_STATIC_DELTA_DEBOUNCE_MS - sinceLast));
        // Re-check: another concurrent save may have pushed this exact content while we waited.
        const latest = await lastStaticRun(supabase, propertyId);
        if (latest.hash && latest.hash === contentHash) {
          await logSkip(supabase, propertyId, trigger, 'a concurrent save already pushed this content', contentHash);
          return { queued: false, reason: 'unchanged', content_hash: contentHash };
        }
      }
    }

    const startedAt = Date.now();
    // Send only what moved: unit-only changes are scoped to those units.
    const scopeUnitIds = options.force ? null : scopeUnitIdsFromChanges(changedFields);
    const { success, errorMessage, errorCode, blockers, chunks, units } = await pushStaticContent(
      supabase,
      propertyId,
      scopeUnitIds,
    );
    const gatePending = !success && !!errorCode && RU_GATE_ERROR_CODES.includes(errorCode);

    // The push itself writes bookkeeping back onto the rows it just sent (newly issued channel
    // listing ids in particular), which would make the pre-push fingerprint stale the moment it
    // is stored — every later save would then look like a change and re-push. Record the
    // *post-push* fingerprint so the snapshot matches what the channel now holds.
    let storedHash = contentHash;
    if (success) {
      try {
        const after = await loadSnapshot(supabase, propertyId);
        if (after.property) {
          storedHash = await sha256(stableStringify({ property: after.property, units: after.units }));
        }
      } catch (rehashErr) {
        console.warn('[ruStaticDelta] post-push rehash failed', rehashErr);
      }
    }

    // Log unconditionally: the hash is only recorded on success so a failed delta is retried
    // by the next save (or the weekly cron) instead of being silently treated as delivered.
    // A gate refusal is parked under its own action so the automatic re-arm can find it.
    try {
      await supabase.from('ru_sync_runs').insert({
        property_id: propertyId,
        action: gatePending ? RU_STATIC_DELTA_PENDING_ACTION : RU_STATIC_DELTA_ACTION,
        success,
        error_message: errorMessage,
        elapsed_ms: Date.now() - startedAt,
        details: {
          trigger,
          content_hash: success ? storedHash : null,
          pushed_hash: contentHash,
          push_type: pushType,
          changed_fields: changedFields,
          changed_field_count: changedFields.length,
          scope: scopeUnitIds ? 'units' : 'property',
          scope_unit_ids: scopeUnitIds,
          field_fingerprints: success ? currentFields : previous.fields,
          forced: options.force === true,
          chunks,
          units,
          ...(gatePending ? { gate_pending: true, error_code: errorCode, blockers } : {}),
        },
      });
    } catch (logErr) {
      console.warn('[ruStaticDelta] log insert failed', logErr);
    }


    if (gatePending) {
      console.log(`[ruStaticDelta] Delta parked behind the readiness gate for ${propertyId}`);
      return {
        queued: false,
        reason: 'gate_pending',
        error: errorMessage ?? undefined,
        blockers,
        content_hash: contentHash,
      };
    }
    if (!success) {
      console.warn(`[ruStaticDelta] Static push failed for ${propertyId}: ${errorMessage}`);
      return { queued: false, reason: 'error', error: errorMessage ?? undefined, content_hash: contentHash };
    }
    return { queued: true, content_hash: contentHash };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[ruStaticDelta] Failed', message);
    return { queued: false, reason: 'error', error: message };
  }
}

/** Visibility row for a delta that intentionally did nothing. */
async function logSkip(
  supabase: any,
  propertyId: string,
  trigger: string,
  reason: string,
  contentHash: string | null,
): Promise<void> {
  try {
    await supabase.from('ru_sync_runs').insert({
      property_id: propertyId,
      action: RU_STATIC_DELTA_SKIP_ACTION,
      success: true,
      error_message: null,
      details: { trigger, skipped: true, reason, content_hash: contentHash },
    });
  } catch (err) {
    console.warn('[ruStaticDelta] skip log insert failed', err);
  }
}

/**
 * Park a delta that the operational gate refused on a *listed* property.
 *
 * The content change is real and still owed, so it is logged under the pending action that
 * `resumePendingRuDeltas` watches — the change is delivered automatically once pushes are enabled.
 */
async function logPending(
  supabase: any,
  propertyId: string,
  trigger: string,
  gateCode: string | null,
  message: string,
): Promise<void> {
  try {
    await supabase.from('ru_sync_runs').insert({
      property_id: propertyId,
      action: RU_STATIC_DELTA_PENDING_ACTION,
      success: false,
      error_message: message,
      details: {
        trigger,
        gate_pending: true,
        error_code: gateCode ?? RU_WIZARD_SYNC_CODE,
        blockers: [message],
      },
    });
  } catch (err) {
    console.warn('[ruStaticDelta] pending log insert failed', err);
  }
}


/**
 * Deliver the content push, walking the resumable chunk sequence.
 *
 * `push-property-to-ru` pushes a slice of a multi-unit property per invocation and reports the
 * units still outstanding, so a single call to a 9-unit property returns `success: false` with
 * `resume: true` even though nothing failed. A content delta must finish the sequence, otherwise
 * every save on a multi-unit listing looks like a failure and no fingerprint is ever stored.
 */
async function pushStaticContent(
  supabase: any,
  propertyId: string,
  /** Restrict the push to these unit ids (unit-only change); null pushes every listing. */
  scopeUnitIds: string[] | null,
): Promise<{
  success: boolean;
  errorMessage: string | null;
  errorCode: string | null;
  blockers: string[];
  chunks: number;
  units: unknown[];
}> {
  let remaining: string[] | null = scopeUnitIds && scopeUnitIds.length > 0 ? scopeUnitIds : null;
  let batchId: string | null = null;
  const units: unknown[] = [];

  for (let chunk = 1; chunk <= RU_STATIC_DELTA_MAX_CHUNKS; chunk++) {
    try {
      const { data, error } = await supabase.functions.invoke('push-property-to-ru', {
        body: {
          property_id: propertyId,
          action: 'static_only',
          ...(remaining && remaining.length > 0 ? { only_unit_ids: remaining } : {}),
          ...(batchId ? { batch_id: batchId } : {}),
        },
      });
      if (error) {
        // A 422 gate refusal arrives here as an "error" — recover the structured body so the
        // delta can be parked and re-armed instead of reported as a transport failure.
        const body = await readInvokeErrorBody(error);
        const gateCode = typeof (body?.error as { code?: string } | undefined)?.code === 'string'
          ? (body!.error as { code: string }).code
          : null;
        const gateBlockers = Array.isArray(body?.blockers)
          ? (body!.blockers as unknown[]).map((b) => String(b))
          : [];
        return {
          success: false,
          errorMessage: (body?.error as { message?: string } | undefined)?.message
            ?? error.message
            ?? 'Channel push transport failed',
          errorCode: gateCode,
          blockers: gateBlockers,
          chunks: chunk,
          units,
        };
      }
      if (Array.isArray(data?.units)) units.push(...data.units);
      if (typeof data?.batch_id === 'string') batchId = data.batch_id;

      const nextRemaining = Array.isArray(data?.remaining_unit_ids) ? (data.remaining_unit_ids as string[]) : [];
      if (data?.resume === true && nextRemaining.length > 0) {
        remaining = nextRemaining;
        continue;
      }
      if (data?.success === true) {
        return { success: true, errorMessage: null, errorCode: null, blockers: [], chunks: chunk, units };
      }
      const blockers = Array.isArray(data?.blockers)
        ? (data.blockers as unknown[]).map((b) => String(b))
        : Array.isArray(data?.gaps)
          ? (data.gaps as unknown[]).map((b) => String(b))
          : [];
      return {
        success: false,
        errorMessage: data?.error?.message ?? 'The channel rejected the content push',
        errorCode: typeof data?.error?.code === 'string' ? data.error.code : null,
        blockers,
        chunks: chunk,
        units,
      };
    } catch (err) {
      return {
        success: false,
        errorMessage: err instanceof Error ? err.message : 'Unknown error',
        errorCode: null,
        blockers: [],
        chunks: chunk,
        units,
      };
    }
  }

  return {
    success: false,
    errorMessage: `Content push did not finish within ${RU_STATIC_DELTA_MAX_CHUNKS} chunks — retry the outstanding units.`,
    errorCode: null,
    blockers: [],
    chunks: RU_STATIC_DELTA_MAX_CHUNKS,
    units,
  };
}

