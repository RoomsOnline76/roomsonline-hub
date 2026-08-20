/**
 * Shared helpers to push ROL'OS booking cancellations and modifications back to
 * Rentals United.
 *
 * RU-originated bookings live on ROL'OS-native properties (`external_system = 'roomsonline'`),
 * so they cannot be routed by the property's PMS. They are identified by
 * `booking_channel = 'rentals_united'` with `integration_type` `rentalsunited`
 * (confirmed) or `rentalsunited_lead` (unconfirmed request).
 *
 * All calls MUST run on the owning sub-user's API keys — RU rejects (or silently
 * misapplies) reservation writes made with master credentials.
 */
import { findOwnerAccount } from './ruPhaseGate.ts';
import { logRuNotAttempted, newRuTraceId } from './ruApiLog.ts';
import { supersedeQueuedRuCalls } from './ruRateGate.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export interface RuBookingRef {
  id: string;
  property_id: string;
  room_type_id?: string | null;
  external_reservation_id?: string | null;
  booking_channel?: string | null;
  integration_type?: string | null;
  check_in_date: string;
  check_out_date: string;
}

export interface RuPushResult {
  ok: boolean;
  /** True when the channel's rate window parked the call — it will complete from the queue. */
  deferred?: boolean;
  /**
   * True when the channel write could not be made now and is parked in the priority queue.
   * Not a failure: the call lands within about a minute on its own, so the caller should say so
   * calmly rather than reporting an error.
   */
  queued?: boolean;
  /** True when a held request had to be accepted at the channel before the change could apply. */
  confirmedLead?: boolean;

  /** Machine code for the caller to surface: RU_CANCEL_NOT_ALLOWED, RU_ERROR, … */
  code?: string;
  message?: string;
  method?: string;
  /** Links the push to its raw request/response rows in the exchange log. */
  traceId?: string;
}

/** True when this booking came from Rentals United and must be synced back. */
export function isRuBooking(booking: {
  booking_channel?: string | null;
  integration_type?: string | null;
  external_reservation_id?: string | null;
}): boolean {
  if (!booking.external_reservation_id) return false;
  const channel = (booking.booking_channel || '').toLowerCase();
  const integration = (booking.integration_type || '').toLowerCase();
  return channel === 'rentals_united' || integration.startsWith('rentalsunited');
}

/** True when the booking is still an unconfirmed RU request (StatusID 4). */
export function isRuLead(booking: { integration_type?: string | null }): boolean {
  return (booking.integration_type || '').toLowerCase() === 'rentalsunited_lead';
}

async function decryptSecret(supabase: Db, enc: unknown): Promise<string> {
  if (!enc) return '';
  const { data } = await supabase.rpc('decrypt_sensitive_text', { encrypted_data: enc });
  const plain = typeof data === 'string' ? data : '';
  return plain && plain !== '[ENCRYPTED]' && plain !== '[DECRYPTION_ERROR]' ? plain : '';
}

/**
 * Resolve the sub-user (child) auth payload for the RU account that owns this property.
 * Order: `ru_api_credentials` keys → legacy keys on `ru_owner_accounts` → legacy password.
 */
export async function resolveRuChildAuth(
  supabase: Db,
  propertyId: string,
): Promise<Record<string, unknown> | null> {
  const { data: property } = await supabase
    .from('properties')
    .select('id, owner_email')
    .eq('id', propertyId)
    .maybeSingle();

  const { account } = await findOwnerAccount(supabase, propertyId, property?.owner_email ?? null, null);
  const ownerId = account?.ru_owner_id ? String(account.ru_owner_id).trim() : '';
  if (!ownerId) return null;

  const { data: credRow } = await supabase
    .from('ru_api_credentials')
    .select('access_key, secret_enc')
    .eq('ru_owner_id', ownerId)
    .maybeSingle();

  if (credRow?.access_key) {
    const secret = await decryptSecret(supabase, credRow.secret_enc);
    if (secret) {
      return { owner_id: ownerId, auth_access_key: String(credRow.access_key), auth_secret_key: secret };
    }
  }

  const record = (account ?? {}) as Record<string, unknown>;
  if (record.ru_api_access_key) {
    const secret = await decryptSecret(supabase, record.ru_api_secret_enc);
    if (secret) {
      return { owner_id: ownerId, auth_access_key: String(record.ru_api_access_key), auth_secret_key: secret };
    }
  }

  const password = await decryptSecret(supabase, record.ru_login_password_enc);
  if (account?.ru_login_email && password) {
    return { owner_id: ownerId, auth_username: String(account.ru_login_email).trim(), auth_password: password };
  }
  return null;
}

/**
 * Resolve the RU PropertyID (unit-level where mapped) backing this booking.
 *
 * `roomTypeOverride` lets a caller resolve the listing for a room type the booking no longer
 * carries — needed when a stay is moved between units, because RU's modify verb has to name the
 * listing the reservation currently sits on *and* the listing it moves to.
 */
export async function resolveRuPropertyId(
  supabase: Db,
  booking: RuBookingRef,
  roomTypeOverride?: string | null,
): Promise<string | null> {
  const roomTypeId = roomTypeOverride !== undefined && roomTypeOverride !== null
    ? roomTypeOverride
    : booking.room_type_id;
  // Unit-level mapping: the booking's canonical room type name → hostfully_room_types row.
  if (roomTypeId) {
    const { data: direct } = await supabase
      .from('hostfully_room_types')
      .select('rentalsunited_property_id')
      .eq('id', roomTypeId)
      .maybeSingle();
    if (direct?.rentalsunited_property_id) return String(direct.rentalsunited_property_id);

    const { data: canonical } = await supabase
      .from('rolos_room_types')
      .select('name')
      .eq('id', roomTypeId)
      .maybeSingle();
    if (canonical?.name) {
      const { data: units } = await supabase
        .from('hostfully_room_types')
        .select('name, rentalsunited_property_id')
        .eq('property_id', booking.property_id)
        .not('rentalsunited_property_id', 'is', null);
      const match = (units || []).find(
        (u: { name: string | null }) =>
          (u.name || '').trim().toLowerCase() === String(canonical.name).trim().toLowerCase(),
      );
      if (match?.rentalsunited_property_id) return String(match.rentalsunited_property_id);
    }
  }

  const { data: prop } = await supabase
    .from('properties')
    .select('rentalsunited_property_id')
    .eq('id', booking.property_id)
    .maybeSingle();
  return prop?.rentalsunited_property_id ? String(prop.rentalsunited_property_id) : null;
}

/**
 * Outcomes the channel reports that are NOT platform faults:
 *
 *  - `no_op`         — the channel has nothing to act on (cancelling a reservation it never held).
 *                      Recording these as failures produced a permanent red row for work that was
 *                      already in the desired state.
 *  - `stale_mapping` — the local unit → listing mapping points at a listing the channel no longer
 *                      serves. Retrying cannot fix it, so it is logged once per listing per window
 *                      instead of every minute, with the operator action stored on the run.
 */
type RuOutcomeClass = 'delivered' | 'no_op' | 'stale_mapping' | 'error';

function classifyRuOutcome(
  ok: boolean,
  code?: string | null,
  message?: string | null,
): RuOutcomeClass {
  if (ok) return 'delivered';
  const msg = String(message ?? '');
  if (/reservation does not exist|no such reservation|already cancelled/i.test(msg)) return 'no_op';
  if ((code ?? '') === 'RU_LISTING_MISSING' || /channel has no listing/i.test(msg)) return 'stale_mapping';
  return 'error';
}

/** True when an identical stale-mapping row was already written recently — suppress the duplicate. */
async function staleMappingAlreadyLogged(
  supabase: Db,
  action: string,
  ruPropertyId: string | null,
  windowMinutes = 360,
): Promise<boolean> {
  if (!ruPropertyId) return false;
  try {
    const since = new Date(Date.now() - windowMinutes * 60000).toISOString();
    const { data } = await supabase
      .from('ru_sync_runs')
      .select('id')
      .eq('action', action)
      .eq('ru_property_id', ruPropertyId)
      .eq('success', false)
      .gte('created_at', since)
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch (_e) {
    return false;
  }
}

async function logRuSyncRun(
  supabase: Db,
  entry: {
    action: string;
    propertyId?: string | null;
    ruPropertyId?: string | null;
    success: boolean;
    errorCode?: string | null;
    errorMessage?: string | null;
    elapsedMs?: number;
    details?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await supabase.from('ru_sync_runs').insert({
      batch_id: crypto.randomUUID(),
      action: entry.action,
      property_id: entry.propertyId ?? null,
      ru_property_id: entry.ruPropertyId ?? null,
      success: entry.success,
      error_code: entry.errorCode ?? null,
      error_message: entry.errorMessage ?? null,
      elapsed_ms: entry.elapsedMs ?? null,
      details: entry.details ?? {},
    });
  } catch (_e) {
    // Observability must never break the booking lifecycle.
  }
}


async function invokeRu(
  supabase: Db,
  action: string,
  payload: Record<string, unknown>,
  log?: {
    propertyId?: string | null;
    ruPropertyId?: string | null;
    details?: Record<string, unknown>;
    traceId?: string | null;
    parentAction?: string | null;
  },
): Promise<{ ok: boolean; deferred?: boolean; code?: string; message?: string; data?: Record<string, unknown> | null }> {
  const startedAt = Date.now();
  /** Raw channel error payload for the current attempt — makes opaque RU text diagnosable. */
  let channelError: Record<string, unknown> | null = null;
  const finish = async (
    result: { ok: boolean; deferred?: boolean; code?: string; message?: string; data?: Record<string, unknown> | null },
  ) => {
    const outcome = classifyRuOutcome(result.ok, result.code, result.message);

    // No-ops are the desired end state, not failures: cancelling a reservation the channel never
    // held leaves nothing to do, so the run is recorded as a successful no-op.
    if (outcome === 'no_op') {
      await logRuSyncRun(supabase, {
        action,
        propertyId: log?.propertyId ?? null,
        ruPropertyId: log?.ruPropertyId ?? null,
        success: true,
        errorCode: null,
        errorMessage: null,
        elapsedMs: Date.now() - startedAt,
        details: {
          ...(log?.details ?? {}),
          trace_id: log?.traceId ?? null,
          outcome: 'no_op',
          no_op_reason: 'absent_at_channel',
          channel_message: result.message ?? null,
        },
      });
      return result;
    }

    // A stale mapping cannot be retried into health. Log it once per listing per 6h with the
    // operator action attached, instead of one red row per retry attempt.
    if (outcome === 'stale_mapping') {
      const duplicate = await staleMappingAlreadyLogged(supabase, action, log?.ruPropertyId ?? null);
      if (!duplicate) {
        await logRuSyncRun(supabase, {
          action,
          propertyId: log?.propertyId ?? null,
          ruPropertyId: log?.ruPropertyId ?? null,
          success: false,
          errorCode: result.code ?? 'RU_LISTING_MISSING',
          errorMessage: result.message ?? null,
          elapsedMs: Date.now() - startedAt,
          details: {
            ...(log?.details ?? {}),
            trace_id: log?.traceId ?? null,
            outcome: 'stale_mapping',
            retry_suppressed: true,
            action_required: 'Republish this unit to the channel, then resend the stay.',
            channel_error: channelError,
          },
        });
      }
      return result;
    }

    await logRuSyncRun(supabase, {
      action,
      propertyId: log?.propertyId ?? null,
      ruPropertyId: log?.ruPropertyId ?? null,
      success: result.ok,
      errorCode: result.code ?? null,
      errorMessage: result.message ?? null,
      elapsedMs: Date.now() - startedAt,
      details: {
        ...(log?.details ?? {}),
        trace_id: log?.traceId ?? null,
        deferred: result.deferred === true,
        outcome,
        // Opaque channel text ("Unexpected error, contact IT or try again") is useless on its own;
        // keep the verb, the listing and the raw error payload with the run.
        ...(result.ok ? {} : { channel_error: channelError, channel_verb: action }),
      },
    });
    return result;
  };

  const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
    body: {
      action,
      // Correlates this exchange with the booking operation that caused it, so a cancel/reject
      // can be retrieved from `ru_api_log` by trace instead of guessed at by timestamp.
      trace_id: log?.traceId ?? null,
      parent_action: log?.parentAction ?? `ruBookingSync:${action}`,
      property_id: log?.propertyId ?? null,
      // Reservation writes must survive the channel's one-identical-call-per-minute rule: a
      // rate-limited cancel/modify is parked in the shared call queue and replayed instead of
      // being dropped on the floor.
      deferrable: true,
      ...payload,
    },
  });
  if (data?.error && typeof data.error === 'object') {
    channelError = { ...(data.error as Record<string, unknown>), invoke_error: error?.message ?? null };
  } else if (error) {
    channelError = { invoke_error: error.message ?? null };
  }
  if (!error && data?.success) {
    if (data.auth_mode === 'master') {
      return await finish({
        ok: false,
        code: 'RU_MASTER_AUTH_REFUSED',
        message: 'Rentals United answered on master credentials — refused to apply the change.',
      });
    }
    // A 202 from the channel API means the call was parked in the shared queue behind the
    // one-identical-call-per-minute rule. That is a success in flight, not a delivered push.
    if (data.queued === true) {
      return await finish({
        ok: true,
        deferred: true,
        code: 'RU_QUEUED',
        message: typeof data.message === 'string'
          ? data.message
          : 'Channel rate limit reached — the change is queued and will reach the channel within a minute.',
      });
    }
    return await finish({ ok: true, data: data as Record<string, unknown> });
  }
  return await finish({
    ok: false,
    code: data?.error?.code || 'RU_ERROR',
    message: data?.error?.message || error?.message || 'Unknown Rentals United error',
  });

}


/**
 * Cancel (or reject) the reservation at RU. Unconfirmed requests use
 * `Push_RejectRequest_RQ`; confirmed reservations use `Push_CancelReservation_RQ`
 * with an explicit CancelTypeID (1 = property provider, 2 = guest).
 */
export async function cancelRuReservation(
  supabase: Db,
  booking: RuBookingRef,
  opts: { reason: string; cancelTypeId?: number },
): Promise<RuPushResult> {
  const traceId = newRuTraceId();
  const reservationId = String(booking.external_reservation_id);
  const auth = await resolveRuChildAuth(supabase, booking.property_id);
  if (!auth) {
    // A refusal here never reaches RU, so it would otherwise leave no trace in the exchange log —
    // which is what made cancel/reject look unimplemented during certification review.
    await logRuNotAttempted(supabase, {
      trace_id: traceId,
      parent_action: 'ruBookingSync:cancel',
      property_id: booking.property_id,
      action: isRuLead(booking) ? 'Push_RejectRequest_RQ' : 'Push_CancelReservation_RQ',
      error_reason: 'no_subuser_keys: no Rentals United sub-user API keys stored for this property',
    });
    return {
      ok: false,
      code: 'RU_AUTH_UNAVAILABLE',
      message: 'No Rentals United sub-user API keys stored for this property — cannot cancel at the channel.',
      traceId,
    };
  }

  const cancelTypeId = opts.cancelTypeId === 2 ? 2 : 1;

  const logCtx = {
    propertyId: booking.property_id,
    traceId,
    parentAction: 'ruBookingSync:cancel',
    details: { booking_id: booking.id, reservation_id: reservationId },
  };

  if (isRuLead(booking)) {
    const rejected = await invokeRu(supabase, 'reject_request', {
      reservation_id: reservationId,
      reject_reason: opts.reason,
      ...auth,
    }, logCtx);
    if (rejected.ok) return { ok: true, deferred: rejected.deferred === true, method: 'reject_request', traceId };
    // Backwards compatibility: some integrations do not have reject enabled.
    const cancelled = await invokeRu(supabase, 'cancel_reservation', {
      reservation_id: reservationId,
      cancel_type_id: cancelTypeId,
      reject_reason: opts.reason,
      ...auth,
    }, logCtx);
    return cancelled.ok
      ? { ok: true, deferred: cancelled.deferred === true, method: 'cancel_reservation', traceId }
      : { ok: false, method: 'cancel_reservation', code: cancelled.code, message: cancelled.message, traceId };
  }

  const result = await invokeRu(supabase, 'cancel_reservation', {
    reservation_id: reservationId,
    cancel_type_id: cancelTypeId,
    reject_reason: opts.reason,
    ...auth,
  }, logCtx);
  return result.ok
    ? { ok: true, deferred: result.deferred === true, method: 'cancel_reservation', traceId }
    : { ok: false, method: 'cancel_reservation', code: result.code, message: result.message, traceId };
}


/**
 * Accept an unconfirmed channel request so the reservation becomes modifiable.
 *
 * The channel holds a request (StatusID 4) as a lead: it refuses every stay modification while
 * the request is unaccepted. An operator who extends such a stay in ROL'OS therefore has to
 * accept the request first, or the extension only closes calendar nights while the reservation
 * itself stays at its original dates and pax — exactly the drift this function exists to stop.
 *
 * On success the booking is promoted locally from `rentalsunited_lead` to `rentalsunited` so
 * every later push takes the confirmed path.
 *
 * Caveat measured live on 2026-08-20: this account's channel API exposes no working accept verb
 * (`Push_ConfirmRequest_RQ` → "not implemented method"; `Push_ConfirmReservation_RQ` → Status 28).
 * When that is the case the call fails loudly and the stay change is refused rather than degrading
 * into a calendar-only block — accept the request in the channel portal first.
 */
export async function confirmRuRequest(
  supabase: Db,
  booking: RuBookingRef,
  opts: { comments?: string } = {},
): Promise<RuPushResult> {
  const traceId = newRuTraceId();
  const reservationId = booking.external_reservation_id ? String(booking.external_reservation_id).trim() : '';
  if (!reservationId) {
    await logRuNotAttempted(supabase, {
      trace_id: traceId,
      parent_action: 'ruBookingSync:confirm',
      property_id: booking.property_id,
      action: 'Push_ConfirmRequest_RQ',
      error_reason: 'missing_reservation_id: the booking carries no channel reservation id',
    });
    return {
      ok: false,
      code: 'RU_RESERVATION_UNKNOWN',
      message: 'This booking has no channel reservation id — nothing to accept at the channel.',
      traceId,
    };
  }

  const auth = await resolveRuChildAuth(supabase, booking.property_id);
  if (!auth) {
    await logRuNotAttempted(supabase, {
      trace_id: traceId,
      parent_action: 'ruBookingSync:confirm',
      property_id: booking.property_id,
      action: 'Push_ConfirmRequest_RQ',
      error_reason: 'no_subuser_keys: no Rentals United sub-user API keys stored for this property',
    });
    return {
      ok: false,
      code: 'RU_AUTH_UNAVAILABLE',
      message: 'No channel sub-user API keys stored for this property — cannot accept the request.',
      traceId,
    };
  }

  const attemptConfirm = () => invokeRu(supabase, 'confirm_request', {
    reservation_id: reservationId,
    comments: opts.comments ?? '',
    ...auth,
  }, {
    propertyId: booking.property_id,
    traceId,
    parentAction: 'ruBookingSync:confirm',
    details: { booking_id: booking.id, reservation_id: reservationId },
  });

  // The channel refuses to accept a held request whose own nights read as closed on its calendar.
  const isBlockedDatesMsg = (msg?: string | null) =>
    /not available for a given dates|check in or check out/i.test(msg ?? '');

  // Reopen exactly the request's own nights so the channel can accept it. Idempotent.
  const reopenOwnNights = async (): Promise<boolean> => {
    const ruPropertyId = await resolveRuPropertyId(supabase, booking);
    if (!ruPropertyId) return false;
    // RU's Date From/To covers nights, so the departure day is excluded.
    const lastNight = new Date(`${booking.check_out_date}T00:00:00Z`);
    lastNight.setUTCDate(lastNight.getUTCDate() - 1);
    const reopened = await invokeRu(supabase, 'push_availability', {
      ru_property_id: Number(ruPropertyId),
      availability: [{
        date_from: booking.check_in_date,
        date_to: lastNight.toISOString().slice(0, 10),
        units: 1,
        changeover: 1,
      }],
      ...auth,
    }, {
      propertyId: booking.property_id,
      ruPropertyId,
      traceId,
      parentAction: 'ruBookingSync:confirm:reopen',
      details: { booking_id: booking.id, reservation_id: reservationId },
    });
    return reopened.ok === true;
  };

  // A confirm parked behind the rate limit retries from the call queue, where the self-heal below
  // cannot run — so when a parked attempt is already stuck on closed nights, reopen them first and
  // let this attempt (or the queue's next retry) land.
  try {
    const { data: parked } = await supabase
      .from('ru_call_queue')
      .select('id, last_error')
      .eq('action', 'confirm_request')
      .eq('status', 'pending')
      .contains('payload', { reservation_id: reservationId })
      .limit(3);
    if ((parked ?? []).some((r: { last_error?: string | null }) => isBlockedDatesMsg(r?.last_error))) {
      await reopenOwnNights();
    }
  } catch (_err) {
    // Best effort only — never block the confirm on this lookup.
  }

  // Our own parked retry of this exact confirm competes for the same sliding-minute slot as the
  // operator sitting in the dialog, so the interactive attempt takes it over.
  const superseded = await supersedeQueuedRuCalls(supabase, {
    action: 'confirm_request',
    reservationId,
  });
  if (superseded) {
    console.log(`[ruBookingSync] took over ${superseded} parked confirm_request for reservation ${reservationId}`);
  }

  let result = await attemptConfirm();

  // The channel refuses to accept a held request whose own nights read as closed on its calendar.
  // In practice that is our own hold: the request's nights were pushed as 0 units (and/or with a
  // changeover restriction) while the lead was pending. Reopen exactly the request's own nights
  // once and retry, so the operator does not have to fix our block by hand.
  const isBlockedDates = isBlockedDatesMsg;

  if (!result.ok && isBlockedDates(result.message)) {
    if (await reopenOwnNights()) {
      /* The refused attempt already spent this minute's slot for `Push_ConfirmReservation_RQ`, so an
         immediate retry is always rejected by the channel's one-call-per-minute limit and the
         reopened calendar never gets used. Park the retry just past the window instead and report
         it as pending. */
      const queuedId = await enqueueRuCall(supabase, {
        methodKey: `confirm_request:${reservationId}`,
        action: 'confirm_request',
        payload: { reservation_id: reservationId, comments: opts.comments ?? '', ...auth },
        propertyId: booking.property_id,
        priority: 1,
        delayMs: 65_000,
      });
      if (queuedId) {
        return {
          ok: false,
          queued: true,
          method: 'confirm_request',
          code: 'RU_CONFIRM_QUEUED',
          message:
            'The request\'s own nights were reopened at the channel and the acceptance is queued for the ' +
            'next available channel slot (about a minute). Nothing was changed yet — resend the change once it lands.',
          traceId,
        };
      }
      result = await attemptConfirm();
    }
  }


  if (!result.ok) {
    const raw = result.message ?? '';
    if (isBlockedDates(raw)) {
      return {
        ok: false,
        method: 'confirm_request',
        code: 'RU_CONFIRM_BLOCKED_DATES',
        message:
          'The channel still reads this request\'s own nights as closed after reopening them ' +
          '(no units left, or a check-in/check-out restriction on the arrival or departure day). ' +
          'Open those dates on the channel and accept the request there, then resend the change. ' +
          `Channel said: ${raw}`,
        traceId,
      };
    }
    return {
      ok: false,
      method: 'confirm_request',
      code: result.code || 'RU_CONFIRM_REQUEST_FAILED',
      message: raw ||
        'The channel did not accept this request. Accept it in the channel portal, then resend the change.',
      traceId,
    };
  }

  // A deferred confirm never reached the channel (rate limit) — the reservation is still a held
  // request there, so do NOT promote it locally or let a modification follow. It is queued at
  // priority 1 and lands within about a minute, so report it as pending rather than as a failure.
  if (result.deferred === true) {
    return {
      ok: false,
      queued: true,
      method: 'confirm_request',
      code: 'RU_CONFIRM_QUEUED',
      message:
        'The channel is accepting this request now (it was queued behind the channel\'s one-call-per-minute limit). ' +
        'Nothing was changed yet — resend the change in about a minute.',
      traceId,
    };
  }

  await supabase
    .from('bookings')
    .update({ integration_type: 'rentalsunited', hold_expires_at: null })
    .eq('id', booking.id);
  booking.integration_type = 'rentalsunited';

  return { ok: true, deferred: false, method: 'confirm_request', traceId };

}

/**
 * Push a stay change to RU.
 *
 * Unconfirmed requests are accepted first (`confirmLead`, default on) because the channel
 * rejects modifications on leads — without that step a date or pax change silently degraded
 * into an availability block only.
 */
export async function modifyRuStay(
  supabase: Db,
  booking: RuBookingRef,
  modify: {
    date_from?: string | null;
    date_to?: string | null;
    number_of_guests?: number | null;
    client_price?: number | null;
    already_paid?: number | null;
    arrival_time?: string | null;
  },
  /**
   * State the reservation currently has AT THE CHANNEL. Supply this whenever the local record has
   * already been rewritten (a unit move, a date change saved before the push) — otherwise RU is
   * told the new state is also the current state and rejects or misapplies the modification.
   */
  current?: {
    room_type_id?: string | null;
    ru_property_id?: string | null;
    date_from?: string | null;
    date_to?: string | null;
  },
  opts: { confirmLead?: boolean } = {},
): Promise<RuPushResult> {
  const traceId = newRuTraceId();
  let confirmedLead = false;
  if (isRuLead(booking)) {
    if (opts.confirmLead === false) {
      await logRuNotAttempted(supabase, {
        trace_id: traceId,
        parent_action: 'ruBookingSync:modify',
        property_id: booking.property_id,
        action: 'Push_ModifyStay_RQ',
        error_reason: 'unconfirmed_request: Rentals United accepts stay modifications on confirmed reservations only',
      });
      return {
        ok: false,
        code: 'RU_MODIFY_NOT_ALLOWED',
        message:
          'This is still an unconfirmed channel request. Accept the request first, then change the stay.',
        traceId,
      };
    }
    const confirmed = await confirmRuRequest(supabase, booking, {
      comments: 'Accepted on modification in ROL\u2019OS',
    });
    if (!confirmed.ok) {
      await logRuNotAttempted(supabase, {
        trace_id: traceId,
        parent_action: 'ruBookingSync:modify',
        property_id: booking.property_id,
        action: 'Push_ModifyStay_RQ',
        error_reason:
          'unconfirmed_request: the channel would not accept the held request, so the stay change was not attempted',
        error_message: confirmed.message ?? null,
      });
      return {
        ok: false,
        queued: confirmed.queued === true,
        code: confirmed.code || 'RU_MODIFY_NOT_ALLOWED',
        message: confirmed.message ||
          'This is still an unconfirmed channel request and the channel refused to accept it — the stay was left unchanged.',
        traceId,
      };
    }
    confirmedLead = true;
  }


  const auth = await resolveRuChildAuth(supabase, booking.property_id);
  if (!auth) {
    await logRuNotAttempted(supabase, {
      trace_id: traceId,
      parent_action: 'ruBookingSync:modify',
      property_id: booking.property_id,
      action: 'Push_ModifyStay_RQ',
      error_reason: 'no_subuser_keys: no Rentals United sub-user API keys stored for this property',
    });
    return {
      ok: false,
      code: 'RU_AUTH_UNAVAILABLE',
      message: 'No Rentals United sub-user API keys stored for this property — cannot modify at the channel.',
      traceId,
    };
  }

  const ruPropertyId = await resolveRuPropertyId(supabase, booking);
  const currentRuPropertyId = current?.ru_property_id
    ? String(current.ru_property_id)
    : current?.room_type_id
      ? await resolveRuPropertyId(supabase, booking, current.room_type_id)
      : null;
  if (!ruPropertyId) {
    await logRuNotAttempted(supabase, {
      trace_id: traceId,
      parent_action: 'ruBookingSync:modify',
      property_id: booking.property_id,
      action: 'Push_ModifyStay_RQ',
      error_reason: 'unmapped_listing: no Rentals United PropertyID mapped for this unit',
    });
    return {
      ok: false,
      code: 'RU_PROPERTY_UNMAPPED',
      message: 'No Rentals United PropertyID mapped for this unit — push the property to RU first.',
      traceId,
    };
  }

  // Take over our own parked replay of this stay change so it does not hold the slot the operator
  // is waiting for.
  await supersedeQueuedRuCalls(supabase, {
    action: 'modify_stay',
    reservationId: String(booking.external_reservation_id),
  });

  const result = await invokeRu(supabase, 'modify_stay', {
    reservation_id: String(booking.external_reservation_id),
    current_stay: {
      ru_property_id: currentRuPropertyId || ruPropertyId,
      date_from: current?.date_from || booking.check_in_date,
      date_to: current?.date_to || booking.check_out_date,
    },
    modify_stay: {
      ru_property_id: ruPropertyId,
      date_from: modify.date_from ?? booking.check_in_date,
      date_to: modify.date_to ?? booking.check_out_date,
      number_of_guests: modify.number_of_guests ?? null,
      client_price: modify.client_price ?? null,
      already_paid: modify.already_paid ?? null,
      arrival_time: modify.arrival_time ?? null,
    },
    ...auth,
  }, {
    propertyId: booking.property_id,
    ruPropertyId,
    traceId,
    parentAction: 'ruBookingSync:modify',
    details: {
      booking_id: booking.id,
      reservation_id: String(booking.external_reservation_id),
      from_ru_property_id: currentRuPropertyId || ruPropertyId,
      to_ru_property_id: ruPropertyId,
      confirmed_lead_first: confirmedLead,
      number_of_guests: modify.number_of_guests ?? null,
    },
  });


  return result.ok
    ? {
        ok: true,
        deferred: result.deferred === true,
        // Parked at priority 1 in the call queue: in flight, not delivered yet.
        queued: result.deferred === true,
        method: 'modify_stay',
        confirmedLead,
        traceId,
      }
    : { ok: false, method: 'modify_stay', code: result.code, message: result.message, confirmedLead, traceId };
}



/**
 * Hand a stay created in ROL'OS (a direct/manual booking) to the channel as a confirmed
 * reservation, so the channel stops selling those nights and the stay is visible in the portal.
 * RU answers with its own ReservationID, which the caller stores on the booking so later
 * modifications and cancellations follow the normal reservation path.
 */
export async function pushRuConfirmedReservation(
  supabase: Db,
  booking: RuBookingRef & {
    total_price?: number | null;
    amount_paid?: number | null;
    adults?: number | null;
    children?: number | null;
    teens?: number | null;
    guest_first_name?: string | null;
    guest_last_name?: string | null;
    guest_email?: string | null;
    guest_phone?: string | null;
    special_requests?: string | null;
  },
): Promise<RuPushResult & { reservationId?: string | null; ruPropertyId?: string | null }> {
  const traceId = newRuTraceId();
  const auth = await resolveRuChildAuth(supabase, booking.property_id);
  if (!auth) {
    await logRuNotAttempted(supabase, {
      trace_id: traceId,
      parent_action: 'ruBookingSync:create',
      property_id: booking.property_id,
      action: 'Push_PutConfirmedReservationMulti_RQ',
      error_reason: 'no_subuser_keys: no Rentals United sub-user API keys stored for this property',
    });
    return {
      ok: false,
      code: 'RU_AUTH_UNAVAILABLE',
      message: 'No Rentals United sub-user API keys stored for this property — the stay was not sent to the channel.',
      traceId,
    };
  }

  const ruPropertyId = await resolveRuPropertyId(supabase, booking);
  if (!ruPropertyId) {
    await logRuNotAttempted(supabase, {
      trace_id: traceId,
      parent_action: 'ruBookingSync:create',
      property_id: booking.property_id,
      action: 'Push_PutConfirmedReservationMulti_RQ',
      error_reason: 'unmapped_listing: no Rentals United PropertyID mapped for this unit',
    });
    return {
      ok: false,
      code: 'RU_PROPERTY_UNMAPPED',
      message: 'No Rentals United PropertyID mapped for this unit — publish the unit to the channel first.',
      traceId,
    };
  }

  const guests = (Number(booking.adults ?? 0) || 0) + (Number(booking.children ?? 0) || 0) +
    (Number(booking.teens ?? 0) || 0);

  const result = await invokeRu(supabase, 'push_confirmed_reservation', {
    stay: {
      ru_property_id: ruPropertyId,
      date_from: booking.check_in_date,
      date_to: booking.check_out_date,
      number_of_guests: guests > 0 ? guests : 1,
      client_price: booking.total_price ?? 0,
      already_paid: booking.amount_paid ?? 0,
    },
    guest: {
      first_name: booking.guest_first_name ?? null,
      last_name: booking.guest_last_name ?? null,
      email: booking.guest_email ?? null,
      phone: booking.guest_phone ?? null,
      comments: booking.special_requests ?? null,
    },
    ...auth,
  }, {
    propertyId: booking.property_id,
    ruPropertyId,
    traceId,
    parentAction: 'ruBookingSync:create',
    details: { booking_id: booking.id },
  });

  if (!result.ok) {
    return {
      ok: false,
      method: 'push_confirmed_reservation',
      code: result.code,
      message: result.message,
      traceId,
      ruPropertyId,
    };
  }

  return {
    ok: true,
    deferred: result.deferred === true,
    method: 'push_confirmed_reservation',
    traceId,
    ruPropertyId,
    reservationId: typeof result.data?.reservation_id === 'string' ? result.data.reservation_id : null,
  };
}
