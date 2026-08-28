/**
 * One reservation message per booking + operation + content.
 *
 * Reservation writes reach the channel from two authorities at once: the caller that owns the
 * mutation (`cancel-booking`, `modify-booking`, `push-booking`) and the background
 * `channel_booking_sync` job it enqueues. Both used to call the channel, so a single cancel
 * produced `Push_CancelReservation_RQ` twice seconds apart — the first delivered, the second
 * answered "Reservation does not exist." (status 28). A create that the channel refuses on the
 * dates was likewise re-sent every minute forever.
 *
 * This claim ledger makes the write idempotent and gives permanent refusals a terminal state:
 *
 *  - `claim()` inserts a row under `unique (booking_id, op, fingerprint)`. Winning the insert is
 *    permission to call the channel.
 *  - A duplicate is skipped while the first attempt is still running, and skipped forever once it
 *    settled as delivered, absent or terminal.
 *  - `settle()` records the ending so a later identical attempt can read it without calling out.
 */

// deno-lint-ignore no-explicit-any
type Db = any;

export type RuReservationOp = 'create' | 'modify' | 'cancel' | 'confirm';

export type RuClaimOutcome = 'delivered' | 'absent' | 'terminal' | 'failed' | 'deferred';

/** How long an unsettled claim blocks a second attempt before it is treated as abandoned. */
const IN_FLIGHT_TTL_MS = 180_000;

export interface RuClaimVerdict {
  /** True when this caller owns the channel write. */
  granted: boolean;
  /** Why the write is being skipped, in operator language. */
  reason?: string;
  /** The settled outcome of the earlier identical attempt, when there was one. */
  priorOutcome?: RuClaimOutcome;
  priorDetail?: string | null;
  priorReservationId?: string | null;
}

/**
 * Stable content fingerprint. Two attempts carrying the same content are the same message; a
 * genuinely different stay (new dates, new pax, new price) produces a new fingerprint and is
 * therefore allowed through even though the booking and operation are unchanged.
 */
export function reservationFingerprint(parts: (string | number | null | undefined)[]): string {
  return parts
    .map((p) => (p === null || p === undefined || p === '' ? '-' : String(p).trim()))
    .join('|')
    .toLowerCase();
}

/**
 * Channel answers that no retry can turn into a success. Re-sending these burns the owner's rate
 * window and buries the real reason under a wall of identical red rows.
 */
export function isTerminalChannelRefusal(message?: string | null, code?: string | null): boolean {
  const msg = String(message ?? '');
  if ((code ?? '') === 'RU_PROPERTY_UNMAPPED' || (code ?? '') === 'RU_LISTING_MISSING') return true;
  return (
    /property is not available for a given dates/i.test(msg) ||
    /can'?t check in or check out on selected dates/i.test(msg) ||
    /property (with given id )?does not exist/i.test(msg) ||
    /reservation does not exist/i.test(msg) ||
    /already cancelled/i.test(msg) ||
    /we have confirmed reservation for those dates/i.test(msg)
  );
}

export async function claimReservationOp(
  supabase: Db,
  input: {
    bookingId: string;
    op: RuReservationOp;
    fingerprint: string;
    ruPropertyId?: string | null;
    reservationId?: string | null;
  },
): Promise<RuClaimVerdict> {
  const row = {
    booking_id: input.bookingId,
    op: input.op,
    fingerprint: input.fingerprint,
    ru_property_id: input.ruPropertyId ?? null,
    reservation_id: input.reservationId ?? null,
    outcome: 'in_flight',
    claimed_at: new Date().toISOString(),
  };

  const { error } = await supabase.from('ru_reservation_op_claims').insert(row);
  if (!error) return { granted: true };

  // Anything other than the unique violation must not silence the channel write: observability
  // is not allowed to become a functional gate.
  const isDuplicate = String((error as { code?: string }).code ?? '') === '23505' ||
    /duplicate key|unique/i.test(String((error as { message?: string }).message ?? ''));
  if (!isDuplicate) {
    console.warn(`[ruClaim] claim ledger unavailable (${input.op}) — proceeding: ${error.message}`);
    return { granted: true };
  }

  const { data: existing } = await supabase
    .from('ru_reservation_op_claims')
    .select('outcome, detail, reservation_id, claimed_at, attempts')
    .eq('booking_id', input.bookingId)
    .eq('op', input.op)
    .eq('fingerprint', input.fingerprint)
    .maybeSingle();

  const outcome = String(existing?.outcome ?? '');

  if (outcome === 'delivered' || outcome === 'absent' || outcome === 'terminal') {
    return {
      granted: false,
      priorOutcome: outcome as RuClaimOutcome,
      priorDetail: existing?.detail ?? null,
      priorReservationId: existing?.reservation_id ?? null,
      reason: outcome === 'delivered'
        ? 'already_delivered_to_channel'
        : outcome === 'absent'
          ? 'reservation_absent_at_channel'
          : 'channel_refused_permanently',
    };
  }

  if (outcome === 'in_flight') {
    const claimedAt = Date.parse(String(existing?.claimed_at ?? '')) || 0;
    if (Date.now() - claimedAt < IN_FLIGHT_TTL_MS) {
      return { granted: false, reason: 'identical_channel_write_already_running' };
    }
  }

  // Abandoned or previously failed (retryable): take the claim over for this attempt.
  await supabase
    .from('ru_reservation_op_claims')
    .update({
      outcome: 'in_flight',
      claimed_at: new Date().toISOString(),
      settled_at: null,
      attempts: (Number(existing?.attempts ?? 1) || 1) + 1,
      ru_property_id: input.ruPropertyId ?? null,
    })
    .eq('booking_id', input.bookingId)
    .eq('op', input.op)
    .eq('fingerprint', input.fingerprint);
  return { granted: true };
}

export async function settleReservationOp(
  supabase: Db,
  input: {
    bookingId: string;
    op: RuReservationOp;
    fingerprint: string;
    outcome: RuClaimOutcome;
    detail?: string | null;
    reservationId?: string | null;
  },
): Promise<void> {
  try {
    await supabase
      .from('ru_reservation_op_claims')
      .update({
        // A deferred call is still owed, so it keeps the claim open for the queue replay.
        outcome: input.outcome === 'deferred' ? 'in_flight' : input.outcome,
        detail: input.detail ?? null,
        reservation_id: input.reservationId ?? null,
        settled_at: input.outcome === 'deferred' ? null : new Date().toISOString(),
      })
      .eq('booking_id', input.bookingId)
      .eq('op', input.op)
      .eq('fingerprint', input.fingerprint);
  } catch (e) {
    console.warn('[ruClaim] settle failed (non-fatal):', e);
  }
}

/** Maps a channel result to the ledger outcome. */
export function claimOutcomeFor(result: {
  ok: boolean;
  deferred?: boolean;
  code?: string | null;
  message?: string | null;
}): RuClaimOutcome {
  if (result.ok) return result.deferred ? 'deferred' : 'delivered';
  if (/reservation does not exist|already cancelled/i.test(String(result.message ?? ''))) return 'absent';
  if (isTerminalChannelRefusal(result.message, result.code)) return 'terminal';
  return 'failed';
}
