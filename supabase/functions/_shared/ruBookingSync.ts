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
  /** Machine code for the caller to surface: RU_CANCEL_NOT_ALLOWED, RU_ERROR, … */
  code?: string;
  message?: string;
  method?: string;
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
): Promise<{ ok: boolean; deferred?: boolean; code?: string; message?: string }> {
  const startedAt = Date.now();
  const finish = async (result: { ok: boolean; deferred?: boolean; code?: string; message?: string }) => {
    await logRuSyncRun(supabase, {
      action,
      propertyId: log?.propertyId ?? null,
      ruPropertyId: log?.ruPropertyId ?? null,
      success: result.ok,
      errorCode: result.code ?? null,
      errorMessage: result.message ?? null,
      elapsedMs: Date.now() - startedAt,
      details: { ...(log?.details ?? {}), trace_id: log?.traceId ?? null, deferred: result.deferred === true },
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
      ...payload,
    },
  });
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
    return await finish({ ok: true });
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
    if (rejected.ok) return { ok: true, method: 'reject_request' };
    // Backwards compatibility: some integrations do not have reject enabled.
    const cancelled = await invokeRu(supabase, 'cancel_reservation', {
      reservation_id: reservationId,
      cancel_type_id: cancelTypeId,
      reject_reason: opts.reason,
      ...auth,
    }, logCtx);
    return cancelled.ok
      ? { ok: true, deferred: result.deferred === true, method: 'cancel_reservation' }
      : { ok: false, method: 'cancel_reservation', code: cancelled.code, message: cancelled.message };
  }

  const result = await invokeRu(supabase, 'cancel_reservation', {
    reservation_id: reservationId,
    cancel_type_id: cancelTypeId,
    reject_reason: opts.reason,
    ...auth,
  }, logCtx);
  return result.ok
    ? { ok: true, method: 'cancel_reservation' }
    : { ok: false, method: 'cancel_reservation', code: result.code, message: result.message };
}


/** Push a stay change to RU. Confirmed reservations only. */
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
): Promise<RuPushResult> {
  const traceId = newRuTraceId();
  if (isRuLead(booking)) {
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
        'Rentals United only accepts stay modifications on confirmed reservations. Cancel/reject this request instead.',
    };
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
    };
  }

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
    },
  });


  return result.ok
    ? { ok: true, deferred: result.deferred === true, method: 'modify_stay' }
    : { ok: false, method: 'modify_stay', code: result.code, message: result.message };
}
