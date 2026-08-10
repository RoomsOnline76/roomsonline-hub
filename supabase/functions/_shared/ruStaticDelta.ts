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

/** Minimum gap between two static deltas for the same property. */
export const RU_STATIC_DELTA_DEBOUNCE_MS = 60 * 1000;

/** ru_sync_runs.action used for static content deltas. */
export const RU_STATIC_DELTA_ACTION = 'static_delta';

export interface RuStaticDeltaOutcome {
  queued: boolean;
  reason?: 'not_connected' | 'unchanged' | 'debounced' | 'error' | 'no_property';
  content_hash?: string;
  error?: string;
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
  'check_in_time',
  'check_out_time',
  'cancellation_policy',
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

interface StaticSnapshot {
  property: Record<string, unknown> | null;
  units: Record<string, unknown>[];
  ruConnected: boolean;
  pushEnabled: boolean;
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
  return {
    property: (property ?? null) as Record<string, unknown> | null,
    units: unitRows,
    ruConnected: Boolean(property?.rentalsunited_property_id) || listedUnit,
    pushEnabled: property?.ru_push_enabled !== false,
  };
}

async function lastStaticRun(
  supabase: any,
  propertyId: string,
): Promise<{ hash: string | null; at: number | null }> {
  const { data } = await supabase
    .from('ru_sync_runs')
    .select('created_at, details')
    .eq('property_id', propertyId)
    .eq('action', RU_STATIC_DELTA_ACTION)
    .order('created_at', { ascending: false })
    .limit(1);
  const row = (data ?? [])[0];
  if (!row) return { hash: null, at: null };
  const hash = (row.details as Record<string, unknown> | null)?.content_hash;
  return {
    hash: typeof hash === 'string' ? hash : null,
    at: row.created_at ? new Date(row.created_at).getTime() : null,
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
    if (!snapshot.property || !snapshot.ruConnected || !snapshot.pushEnabled) {
      return { queued: false, reason: 'not_connected' };
    }

    const contentHash = await sha256(
      stableStringify({ property: snapshot.property, units: snapshot.units }),
    );
    const previous = await lastStaticRun(supabase, propertyId);

    if (!options.force) {
      if (previous.hash && previous.hash === contentHash) {
        return { queued: false, reason: 'unchanged', content_hash: contentHash };
      }
      if (previous.at && Date.now() - previous.at < RU_STATIC_DELTA_DEBOUNCE_MS) {
        console.log(`[ruStaticDelta] Debounced ${trigger} delta for property ${propertyId}`);
        return { queued: false, reason: 'debounced', content_hash: contentHash };
      }
    }

    const startedAt = Date.now();
    let success = false;
    let errorMessage: string | null = null;
    try {
      const { data, error } = await supabase.functions.invoke('push-property-to-ru', {
        body: { property_id: propertyId, action: 'static_only' },
      });
      if (error) errorMessage = error.message ?? 'Unknown error';
      else if (!data?.success) errorMessage = data?.error?.message ?? 'Unknown error';
      else success = true;
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Unknown error';
    }

    // Log unconditionally: the hash is only recorded on success so a failed delta is retried
    // by the next save (or the weekly cron) instead of being silently treated as delivered.
    try {
      await supabase.from('ru_sync_runs').insert({
        property_id: propertyId,
        action: RU_STATIC_DELTA_ACTION,
        success,
        error_message: errorMessage,
        elapsed_ms: Date.now() - startedAt,
        details: { trigger, content_hash: success ? contentHash : null, forced: options.force === true },
      });
    } catch (logErr) {
      console.warn('[ruStaticDelta] log insert failed', logErr);
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
