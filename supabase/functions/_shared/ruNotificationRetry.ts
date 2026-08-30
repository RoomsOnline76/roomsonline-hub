// Deferred retry for channel reservation notifications.
//
// Rentals United frequently notifies before the reservation itself is readable — a pull
// straight after the RLNM callback answers "Reservation does not exist", while the very
// same pull succeeds a minute later. Treating the first miss as terminal loses the stay
// silently, so failures are parked in `retrying` with a backoff and swept later.

import { refreshRuReservationById } from './ruReservationIngest.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

/** Backoff between attempts, in minutes. Length also caps the number of retries. */
export const RU_RETRY_BACKOFF_MINUTES = [0.5, 3, 10, 30, 120];

export const MAX_RU_RETRY_ATTEMPTS = RU_RETRY_BACKOFF_MINUTES.length;

/** The RU `Creator` login on the stored envelope — the best hint at the owning sub-account. */
function creatorFromXml(xml: string | null): string | null {
  const match = /<Creator>([^<]+)<\/Creator>/i.exec(xml || '');
  return match ? match[1].trim() : null;
}

function nextAttemptAt(attemptCount: number, minDelayMs = 0): string {
  const minutes = RU_RETRY_BACKOFF_MINUTES[Math.min(attemptCount, MAX_RU_RETRY_ATTEMPTS - 1)];
  return new Date(Date.now() + Math.max(minutes * 60_000, minDelayMs)).toISOString();
}


/**
 * Park a notification for another attempt, or mark it failed once the backoff is exhausted.
 * Returns the state it was written as.
 */
export async function scheduleRuNotificationRetry(
  supabase: Db,
  notificationId: string,
  opts: {
    attemptCount?: number;
    error?: string | null;
    state?: 'failed' | 'unmapped';
    /** Channel rate limit: the read told us nothing, so it must not burn a retry attempt. */
    freeAttempt?: boolean;
    /** Sub-account that was found to own the reservation, if the lookup got that far. */
    ownerId?: string | null;
  } = {},
): Promise<'retrying' | 'failed' | 'unmapped'> {
  const attemptCount = opts.freeAttempt ? (opts.attemptCount ?? 0) : (opts.attemptCount ?? 0) + 1;
  // An unmapped listing is a data problem — retrying the pull cannot fix it.
  const exhausted = attemptCount >= MAX_RU_RETRY_ATTEMPTS;
  const state: 'retrying' | 'failed' | 'unmapped' =
    opts.state === 'unmapped' ? 'unmapped' : exhausted ? 'failed' : 'retrying';

  await supabase
    .from('ru_notifications')
    .update({
      processed: false,
      resolution_state: state,
      error_message: opts.error ?? null,
      attempt_count: attemptCount,
      // A rate-limited read must come back AFTER the channel's sliding minute, otherwise the
      // sweep re-asks inside the same window and collects another -6.
      next_attempt_at: state === 'retrying' ? nextAttemptAt(attemptCount, opts.freeAttempt ? 65_000 : 0) : null,
      last_attempt_at: new Date().toISOString(),
      ...(opts.ownerId ? { resolved_owner_id: opts.ownerId } : {}),
    })
    .eq('id', notificationId);


  return state;
}

export interface RuRetrySweepResult {
  considered: number;
  resolved: number;
  stillPending: number;
  failed: number;
}

/**
 * Re-attempt every notification whose retry time has come. Safe to call repeatedly:
 * ingest is idempotent on the reservation id.
 */
export async function sweepRuNotificationRetries(
  supabase: Db,
  opts: { limit?: number; logPrefix?: string } = {},
): Promise<RuRetrySweepResult> {
  const limit = opts.limit ?? 25;
  const prefix = opts.logPrefix ?? '[ru-retry-sweep]';
  const result: RuRetrySweepResult = { considered: 0, resolved: 0, stillPending: 0, failed: 0 };

  const { data, error } = await supabase
    .from('ru_notifications')
    .select('id, ru_reservation_id, property_id, attempt_count, event_type, resolved_owner_id, raw_xml')
    .eq('resolution_state', 'retrying')
    .lte('next_attempt_at', new Date().toISOString())
    .order('next_attempt_at', { ascending: true })
    .limit(limit);

  if (error) {
    console.warn(`${prefix} could not read the retry queue: ${error.message}`);
    return result;
  }

  const rows = (data || []) as {
    id: string;
    ru_reservation_id: string | null;
    property_id: string | null;
    attempt_count: number | null;
    event_type: string | null;
    resolved_owner_id: string | null;
    raw_xml: string | null;
  }[];

  for (const row of rows) {
    result.considered += 1;
    if (!row.ru_reservation_id) {
      await scheduleRuNotificationRetry(supabase, row.id, {
        attemptCount: MAX_RU_RETRY_ATTEMPTS,
        error: 'Notification carried no reservation id',
      });
      result.failed += 1;
      continue;
    }

    try {
      const refreshed = await refreshRuReservationById(supabase, String(row.ru_reservation_id), {
        propertyId: row.property_id,
        logPrefix: `${prefix}[${row.ru_reservation_id}]`,
        forceRequest: row.event_type === 'reservation_request',
        ownerId: row.resolved_owner_id,
        creator: creatorFromXml(row.raw_xml),
      });
      const resolved = refreshed.outcome !== 'failed' && refreshed.outcome !== 'unmatched';
      if (resolved) {
        await supabase
          .from('ru_notifications')
          .update({
            processed: true,
            resolution_state: 'resolved',
            error_message: null,
            next_attempt_at: null,
            attempt_count: (row.attempt_count ?? 0) + 1,
            last_attempt_at: new Date().toISOString(),
          })
          .eq('id', row.id);
        result.resolved += 1;
        continue;
      }
      const state = await scheduleRuNotificationRetry(supabase, row.id, {
        attemptCount: row.attempt_count ?? 0,
        error: refreshed.error ?? `Ingest outcome: ${refreshed.outcome}`,
        freeAttempt: refreshed.rateDeferred === true,
        ownerId: refreshed.resolvedOwnerId ?? row.resolved_owner_id,
      });
      if (state === 'retrying') result.stillPending += 1;
      else result.failed += 1;
    } catch (e) {
      const state = await scheduleRuNotificationRetry(supabase, row.id, {
        attemptCount: row.attempt_count ?? 0,
        error: e instanceof Error ? e.message : String(e),
      });
      if (state === 'retrying') result.stillPending += 1;
      else result.failed += 1;
    }
  }

  if (result.considered) {
    console.log(
      `${prefix} considered ${result.considered}, resolved ${result.resolved}, still queued ${result.stillPending}, failed ${result.failed}`,
    );
  }
  return result;
}
