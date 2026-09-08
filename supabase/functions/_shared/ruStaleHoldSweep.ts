// Verify stays ROL'OS still believes are live against the channel, and settle the ones the
// channel no longer holds.
//
// A reservation or request cancelled inside the Channel Manager portal does not always produce a
// live notification, and the reconciliation pull only ingests what the channel still returns — so
// a withdrawn hold used to sit in ROL'OS as `pending`/`confirmed` forever, blocking its nights.
// This sweep closes that loop: for each live channel-sourced stay that this run did NOT see in the
// channel's own answers, ask the channel about that one reservation and act on what it says.
//
// Rules:
//  - only a definite dead answer settles a stay (status cancelled/rejected/expired, or the channel
//    reporting the reservation no longer exists);
//  - a rate refusal says nothing and is never treated as a cancellation;
//  - every verification costs one channel call, so the run budget is small and the queue rotates
//    oldest-verified-first.

import { refreshRuReservationById } from './ruReservationIngest.ts';
import { releaseChannelBlocksForBooking } from './ruReservationParsing.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export interface RuStaleHoldSweepResult {
  candidates: number;
  verified: number;
  cancelled: number;
  live: number;
  deferred: number;
  inconclusive: number;
  details: Array<{
    reservation_id: string;
    booking_id: string;
    verdict: 'cancelled' | 'live' | 'deferred' | 'inconclusive';
    note?: string | null;
  }>;
}

interface CandidateRow {
  id: string;
  external_reservation_id: string;
  property_id: string | null;
  status: string | null;
  check_in_date: string | null;
  check_out_date: string | null;
  created_at: string;
}

/** Verifications per run. Each one is a channel call on a per-method sliding minute. */
const DEFAULT_LIMIT = 3;
/** Never re-ask the channel about the same reservation inside this window. */
const DEFAULT_COOLDOWN_MINUTES = 90;
/** A stay created moments ago may simply not be listed yet — leave it alone. */
const DEFAULT_MIN_AGE_MINUTES = 15;

const DEAD_TEXT = /does not exist|not found|no longer|cancell?ed|rejected|expired/i;

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export interface RuStaleHoldDeps {
  /** Ask the channel about one reservation. */
  // deno-lint-ignore no-explicit-any
  refresh?: typeof refreshRuReservationById | ((...args: any[]) => Promise<any>);
  /** Give the stamped nights back. */
  // deno-lint-ignore no-explicit-any
  release?: (...args: any[]) => Promise<number>;
}

export async function sweepStaleRuHolds(
  supabase: Db,
  opts: {
    /** Reservation ids the channel returned during this run — those need no verification. */
    seenReservationIds?: Iterable<string>;
    /** Verify only these reservation ids (operator-triggered check). */
    onlyReservationIds?: string[];
    limit?: number;
    cooldownMinutes?: number;
    minAgeMinutes?: number;
    logPrefix?: string;
  } = {},
  deps: RuStaleHoldDeps = {},
): Promise<RuStaleHoldSweepResult> {
  const refresh = deps.refresh ?? refreshRuReservationById;
  const release = deps.release ?? releaseChannelBlocksForBooking;
  const log = opts.logPrefix ?? '[ru-stale-holds]';
  const limit = opts.limit ?? DEFAULT_LIMIT;
  const cooldownMs = (opts.cooldownMinutes ?? DEFAULT_COOLDOWN_MINUTES) * 60_000;
  const minAgeMs = (opts.minAgeMinutes ?? DEFAULT_MIN_AGE_MINUTES) * 60_000;
  const onDemand = (opts.onlyReservationIds ?? []).filter(Boolean);

  const result: RuStaleHoldSweepResult = {
    candidates: 0,
    verified: 0,
    cancelled: 0,
    live: 0,
    deferred: 0,
    inconclusive: 0,
    details: [],
  };

  let query = supabase
    .from('bookings')
    .select('id, external_reservation_id, property_id, status, check_in_date, check_out_date, created_at')
    .in('status', ['pending', 'confirmed'])
    .not('external_reservation_id', 'is', null)
    .gte('check_out_date', today())
    .or('booking_channel.eq.rentals_united,integration_type.like.rentalsunited%')
    .order('created_at', { ascending: true })
    .limit(200);
  if (onDemand.length) query = query.in('external_reservation_id', onDemand);

  const { data, error } = await query;
  if (error) {
    console.warn(`${log} candidate lookup failed: ${error.message}`);
    return result;
  }

  const seen = new Set([...(opts.seenReservationIds ?? [])].map((id) => String(id)));
  const now = Date.now();
  let rows = ((data ?? []) as CandidateRow[]).filter((row) => {
    if (!row.external_reservation_id) return false;
    if (onDemand.length) return true;
    if (seen.has(String(row.external_reservation_id))) return false;
    return now - new Date(row.created_at).getTime() >= minAgeMs;
  });

  // Rotate: skip anything verified inside the cooldown so the same stay cannot monopolise the run.
  if (rows.length && !onDemand.length) {
    const since = new Date(now - cooldownMs).toISOString();
    const { data: recent } = await supabase
      .from('ru_notifications')
      .select('ru_reservation_id')
      .eq('event_type', 'stale_hold_verify')
      .gte('created_at', since)
      .limit(500);
    const recentIds = new Set(
      ((recent ?? []) as { ru_reservation_id: string | null }[])
        .map((r) => (r.ru_reservation_id ? String(r.ru_reservation_id) : ''))
        .filter(Boolean),
    );
    rows = rows.filter((row) => !recentIds.has(String(row.external_reservation_id)));
  }

  result.candidates = rows.length;
  const batch = rows.slice(0, limit);
  if (batch.length === 0) return result;

  for (const row of batch) {
    const reservationId = String(row.external_reservation_id);
    result.verified += 1;
    let verdict: 'cancelled' | 'live' | 'deferred' | 'inconclusive' = 'inconclusive';
    let note: string | null = null;

    try {
      // No `kind` is passed on purpose: the channel's own answer must decide. Forcing
      // 'cancelled' here would cancel a stay the channel still holds.
      // The scheduled pull hands us the ids it just listed, which means the listings for these
      // accounts are seconds old: asking again is the -6 refusal we kept recording as "deferred".
      const refreshed = await refresh(supabase, reservationId, {
        propertyId: row.property_id,
        logPrefix: `${log}[${reservationId}]`,
        skipListFallback: opts.seenReservationIds !== undefined,
      });


      if (refreshed.rateDeferred) {
        verdict = 'deferred';
        note = 'Channel rate limit — will verify on the next run';
      } else if (refreshed.outcome === 'cancelled') {
        verdict = 'cancelled';
        note = refreshed.note ?? 'Channel reports the stay cancelled';
      } else if (refreshed.outcome === 'failed' || refreshed.outcome === 'unmatched') {
        const dead = DEAD_TEXT.test(String(refreshed.error ?? refreshed.note ?? ''));
        if (dead) {
          await settleLocally(supabase, row, log, release);
          verdict = 'cancelled';
          note = 'Channel no longer holds this reservation';
        } else {
          verdict = 'inconclusive';
          note = refreshed.error ?? refreshed.note ?? 'Channel could not answer';
        }
      } else {
        verdict = 'live';
        note = `Channel still holds the stay (${refreshed.outcome})`;
      }
    } catch (e) {
      verdict = 'inconclusive';
      note = e instanceof Error ? e.message : String(e);
    }

    if (verdict === 'cancelled') result.cancelled += 1;
    else if (verdict === 'live') result.live += 1;
    else if (verdict === 'deferred') result.deferred += 1;
    else result.inconclusive += 1;

    result.details.push({ reservation_id: reservationId, booking_id: row.id, verdict, note });

    // Evidence + cooldown marker.
    await supabase.from('ru_notifications').insert({
      event_type: 'stale_hold_verify',
      ru_reservation_id: reservationId,
      property_id: row.property_id,
      raw_xml: null,
      processed: verdict !== 'deferred' && verdict !== 'inconclusive',
      resolution_state: verdict === 'deferred' || verdict === 'inconclusive' ? 'retrying' : 'resolved',
      error_message: verdict === 'cancelled' || verdict === 'live' ? null : note,
      next_attempt_at:
        verdict === 'deferred' || verdict === 'inconclusive' ? new Date(Date.now() + 30 * 60_000).toISOString() : null,
      last_attempt_at: new Date().toISOString(),
    }).then(() => {}, () => {});

    console.log(`${log} ${reservationId} → ${verdict}${note ? `: ${note}` : ''}`);
  }

  return result;
}

/** The channel cannot serve the reservation at all: cancel here and release its nights. */
async function settleLocally(
  supabase: Db,
  row: CandidateRow,
  log: string,
  // deno-lint-ignore no-explicit-any
  release: (...args: any[]) => Promise<number>,
): Promise<void> {
  await supabase
    .from('bookings')
    .update({
      status: 'cancelled',
      cancellation_reason: 'Cancelled at the Channel Manager',
      cancellation_reason_category: 'channel_cancelled',
      hold_expires_at: null,
      hold_released_at: new Date().toISOString(),
    })
    .eq('id', row.id);
  const released = await release(supabase, row.id, log);
  console.log(`${log} Settled booking ${row.id} locally; ${released} stamped night(s) released`);
}
