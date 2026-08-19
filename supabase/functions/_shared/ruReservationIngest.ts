/**
 * Shared, idempotent Rentals United reservation/lead ingestion.
 *
 * Both the RLNM notification handler (`ru-reservation-handler`) and the polling cron
 * (`cron-pull-ru-reservations`) funnel every reservation through `ingestRuReservation`
 * so the two paths can never produce different booking records — or two records for
 * the same RU reservation when a notification lands mid-poll.
 *
 * Idempotency is enforced at two levels:
 *  1. a partial unique index on `bookings (external_reservation_id)` for RU integration
 *     types (`bookings_ru_external_reservation_uidx`);
 *  2. a read → insert → on-unique-violation re-read-and-update loop here, so a race
 *     between the two paths converges to an update instead of failing the run.
 *
 * The RU `Creator` value (the sales-channel account that created the reservation, e.g.
 * a LekkeSlaap or Booking.com user) is mapped to a friendly channel label through
 * `ru_channel_creators`, and stored on the booking for reporting.
 */

import { loadCurrencyState, revertAmount } from './ruCurrency.ts';
import {
  applyRuAvailabilityBlock,
  buildRuChannelNotes,
  classifyRuNotification,
  extractAllBlocks,
  extractTag,
  parseRuReservation,
  resolveRuUnit,
  type ParsedRuReservation,
  type ResolvedRuUnit,
  type RuNotificationKind,
} from './ruReservationParsing.ts';


// deno-lint-ignore no-explicit-any
type Db = any;

/** How long an unconfirmed RU lead holds the dates before availability is released. */
export const RU_LEAD_HOLD_DAYS = 3;

export type RuIngestOutcome =
  | 'created'
  | 'updated'
  | 'cancelled'
  | 'held'
  | 'skipped'
  | 'unmatched'
  | 'failed';

export interface RuIngestResult {
  outcome: RuIngestOutcome;
  bookingId: string | null;
  propertyId: string | null;
  /** True when an existing booking was matched (dedupe hit). */
  deduped: boolean;
  channelLabel: string | null;
  error?: string;
  note?: string;
}

export interface RuCreatorMapping {
  creatorUsername: string;
  channelKey: string;
  channelLabel: string;
  ruChannelId: string | null;
}

/**
 * RU status ids: 1 Confirmed · 2 Cancelled · 3/5 Modified · 4 Request · 6 Approved · 7 Rejected · 8 Expired.
 * Delegates to the shared envelope/status classifier so the RLNM handler, the poll and the
 * certification runner can never disagree about what a status id means.
 */
export function classifyRuStatus(statusId: string | null): 'confirmed' | 'cancelled' | 'request' {
  const kind = classifyRuNotification('', statusId);
  return kind === 'modified' ? 'confirmed' : kind;
}

/**
 * Map an RU `Creator` username to a ROL'OS sales channel.
 * Unknown creators are recorded (inactive) so an operator can label them later.
 */
export async function resolveRuChannelCreator(
  supabase: Db,
  creator: string | null,
): Promise<RuCreatorMapping | null> {
  const name = (creator || '').trim();
  if (!name) return null;

  const { data } = await supabase
    .from('ru_channel_creators')
    .select('creator_username, channel_key, channel_label, ru_channel_id, is_active')
    .ilike('creator_username', name)
    .limit(1)
    .maybeSingle();

  if (data) {
    return {
      creatorUsername: data.creator_username,
      channelKey: data.channel_key,
      channelLabel: data.channel_label,
      ruChannelId: data.ru_channel_id ?? null,
    };
  }

  // First sighting of this creator — park it for operator labelling (best effort).
  await supabase
    .from('ru_channel_creators')
    .insert({
      creator_username: name,
      channel_key: 'unmapped',
      channel_label: name,
      is_active: false,
      notes: 'Auto-discovered from an inbound Rentals United reservation — needs labelling.',
    })
    .then(() => {}, () => {});

  return { creatorUsername: name, channelKey: 'unmapped', channelLabel: name, ruChannelId: null };
}

/** Convert an inbound published amount back to the authored currency where a flip is live. */
async function revertRuAmount(
  supabase: Db,
  propertyId: string,
  amount: number,
): Promise<{ amount: number; meta: Record<string, unknown> | null }> {
  try {
    const state = await loadCurrencyState(supabase, propertyId);
    if (state?.conversion_in_force && Number(state.effective_rate) > 0 && amount > 0) {
      const authored = revertAmount(amount, Number(state.effective_rate));
      return {
        amount: authored,
        meta: {
          ru_currency_conversion: {
            published_currency: state.published_currency_iso,
            published_amount: amount,
            authored_currency: state.authored_currency_iso,
            authored_amount: authored,
            fx_rate: state.fx_rate,
            margin_pct: state.margin_pct,
            effective_rate: state.effective_rate,
          },
        },
      };
    }
  } catch (e) {
    console.warn('[ru-ingest] Currency state lookup failed:', e instanceof Error ? e.message : e);
  }
  return { amount, meta: null };
}

const RU_INTEGRATION_TYPES = ['rentalsunited', 'rentalsunited_lead'];

async function findExistingBooking(supabase: Db, ruReservationId: string) {
  const { data } = await supabase
    .from('bookings')
    .select('id, status, integration_type, property_id, room_type_id, check_in_date, check_out_date')
    .eq('external_reservation_id', ruReservationId)
    .in('integration_type', RU_INTEGRATION_TYPES)
    .limit(1)
    .maybeSingle();
  return data as {
    id: string;
    status: string;
    integration_type: string;
    property_id: string;
    room_type_id: string | null;
    check_in_date: string;
    check_out_date: string;
  } | null;
}

/** Recover the mapped RU unit from an existing booking when a cancellation has no stay block. */
async function resolveExistingBookingUnit(
  supabase: Db,
  existing: Awaited<ReturnType<typeof findExistingBooking>>,
): Promise<ResolvedRuUnit> {
  const empty: ResolvedRuUnit = {
    propertyId: existing?.property_id ?? null,
    roomTypeId: existing?.room_type_id ?? null,
    mappingRoomTypeId: null,
    unitName: null,
  };
  if (!existing?.property_id || !existing.room_type_id) return empty;

  const { data: directMapping } = await supabase
    .from('hostfully_room_types')
    .select('id, name')
    .eq('id', existing.room_type_id)
    .eq('property_id', existing.property_id)
    .maybeSingle();
  if (directMapping) {
    return { ...empty, mappingRoomTypeId: directMapping.id, unitName: directMapping.name ?? null };
  }

  const { data: canonical } = await supabase
    .from('rolos_room_types')
    .select('name')
    .eq('id', existing.room_type_id)
    .eq('property_id', existing.property_id)
    .maybeSingle();
  if (!canonical?.name) return empty;

  const { data: mappings } = await supabase
    .from('hostfully_room_types')
    .select('id, name, is_active')
    .eq('property_id', existing.property_id)
    .order('is_active', { ascending: false });
  const mapping = (mappings || []).find(
    (row: { name: string | null }) =>
      (row.name || '').trim().toLowerCase() === canonical.name.trim().toLowerCase(),
  );
  return {
    ...empty,
    mappingRoomTypeId: mapping?.id ?? null,
    unitName: mapping?.name ?? canonical.name,
  };
}

export interface RuIngestOptions {
  /** Log prefix so cron and RLNM lines stay distinguishable. */
  logPrefix?: string;
  /** Where the record came from — stored in the channel notes for replay evidence. */
  source: 'rlnm' | 'poll' | 'cert';
  /** Treat the record as an unconfirmed lead regardless of status id (leads endpoint). */
  forceRequest?: boolean;
  /**
   * Kind resolved from the RLNM envelope (envelope name beats status id). When supplied it
   * wins over the numeric status, so a cancellation envelope without a StatusID still
   * cancels instead of re-opening a hold.
   */
  kind?: RuNotificationKind;
  /** Pre-resolved unit, when the caller already looked it up. */
  unit?: ResolvedRuUnit;
  /** Skip availability writes (certification dry runs). */
  skipAvailability?: boolean;
}

/**
 * Create / update / cancel the ROL'OS booking for one parsed RU reservation.
 * Safe to call repeatedly with the same reservation — repeat calls report `updated`.
 */
export async function ingestRuReservation(
  supabase: Db,
  r: ParsedRuReservation,
  opts: RuIngestOptions,
): Promise<RuIngestResult> {
  const log = opts.logPrefix || '[ru-ingest]';
  const base: RuIngestResult = {
    outcome: 'skipped',
    bookingId: null,
    propertyId: null,
    deduped: false,
    channelLabel: null,
  };

  if (!r.ruReservationId) {
    return { ...base, outcome: 'skipped', note: 'Reservation without an RU id' };
  }

  const statusKind = opts.kind ?? classifyRuNotification('', r.statusId);
  // A lead-list response can retain rejected/expired rows. The explicit cancellation
  // status must win over forceRequest or a later poll would re-open the released hold.
  const resolvedKind: RuNotificationKind = opts.forceRequest && statusKind !== 'cancelled' ? 'request' : statusKind;
  const kind = resolvedKind === 'modified' ? 'confirmed' : resolvedKind;
  const existing = await findExistingBooking(supabase, r.ruReservationId);
  base.deduped = Boolean(existing);

  let unit = opts.unit ?? (await resolveRuUnit(supabase, r.ruPropertyId));
  if (!unit.propertyId && kind === 'cancelled' && existing) {
    unit = await resolveExistingBookingUnit(supabase, existing);
  }
  const propertyId = unit.propertyId;
  if (!propertyId) {
    return { ...base, outcome: 'unmatched', note: `No ROL'OS property for RU PropertyID ${r.ruPropertyId ?? 'none'}` };
  }
  base.propertyId = propertyId;

  // ── Cancellation: release the nights, never delete the record. ──
  if (kind === 'cancelled') {
    if (existing && existing.status !== 'cancelled') {
      await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancellation_reason: `Cancelled via Rentals United (${opts.source})`,
          // Channel-side cancellation, so the Reports mix can separate it from
          // guest-requested and operator-side losses.
          cancellation_reason_category: 'channel_cancelled',
          hold_expires_at: null,
          hold_released_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      const dateFrom = r.dateFrom || existing.check_in_date;
      const dateTo = r.dateTo || existing.check_out_date;
      if (dateFrom && dateTo && !opts.skipAvailability) {
        await applyRuAvailabilityBlock(supabase, propertyId, unit.mappingRoomTypeId, dateFrom, dateTo, false, log);
      }
      console.log(`${log} ✅ Cancelled booking for RU reservation ${r.ruReservationId}`);
      return { ...base, outcome: 'cancelled', bookingId: existing.id };
    }
    return { ...base, outcome: 'skipped', bookingId: existing?.id ?? null, note: 'Already cancelled / never imported' };
  }

  if (!r.dateFrom || !r.dateTo) {
    return { ...base, outcome: 'skipped', bookingId: existing?.id ?? null, note: 'Reservation carries no stay dates' };
  }

  const creatorMapping = await resolveRuChannelCreator(supabase, r.creator);
  base.channelLabel = creatorMapping?.channelLabel ?? null;

  const { amount: bookedAmount, meta: currencyMeta } = await revertRuAmount(supabase, propertyId, r.total || 0);

  const notes = buildRuChannelNotes(r, {
    ...(currencyMeta ?? {}),
    ingest_source: opts.source,
    ru_creator_channel: creatorMapping
      ? {
          creator: creatorMapping.creatorUsername,
          channel_key: creatorMapping.channelKey,
          channel_label: creatorMapping.channelLabel,
          ru_channel_id: creatorMapping.ruChannelId,
        }
      : null,
  });

  const fields: Record<string, unknown> = {
    guest_name: r.guestName,
    guest_email: r.guestEmail,
    guest_phone: r.guestPhone,
    adults: r.numGuests || 1,
    total_price: bookedAmount,
    check_in_date: r.dateFrom,
    check_out_date: r.dateTo,
    modification_notes: notes,
  };
  if (unit.roomTypeId) fields.room_type_id = unit.roomTypeId;
  if (r.comments) fields.special_requests = r.comments;

  // Anchor the stay on the physical unit straight away: without this the grids have no
  // unit line to draw the channel request on until someone assigns it by hand.
  const existingRoomIds = existing?.id
    ? ((await supabase.from('bookings').select('rolos_room_ids').eq('id', existing.id).maybeSingle()).data
        ?.rolos_room_ids as string[] | null) ?? []
    : [];
  if (unit.roomId && !existingRoomIds.length) fields.rolos_room_ids = [unit.roomId];


  // ── Unconfirmed request → provisional hold ──
  if (kind === 'request') {
    const leadCreatedAt = r.createdDate ? new Date(r.createdDate.replace(' ', 'T') + 'Z') : new Date();
    const holdExpiresAt = new Date(leadCreatedAt.getTime() + RU_LEAD_HOLD_DAYS * 86_400_000);

    if (existing) {
      await supabase.from('bookings').update(fields).eq('id', existing.id);
      return { ...base, outcome: 'updated', bookingId: existing.id };
    }

    const insertRow = {
      ...fields,
      property_id: propertyId,
      status: 'pending',
      booking_channel: 'rentals_united',
      integration_type: 'rentalsunited_lead',
      external_reservation_id: r.ruReservationId,
      payment_status: 'pending',
      lead_created_at: leadCreatedAt.toISOString(),
      hold_expires_at: holdExpiresAt.toISOString(),
      special_requests:
        `Rentals United request — dates held until ${holdExpiresAt.toISOString().slice(0, 10)}` +
        (r.comments ? ` · ${r.comments}` : ''),
      ...(currencyMeta ? { ai_metadata: currencyMeta } : {}),
    };

    const { data: inserted, error } = await supabase.from('bookings').insert(insertRow).select('id').maybeSingle();
    if (error) {
      // Unique violation → the other path won the race; converge on an update.
      if (String(error.code) === '23505') {
        const raced = await findExistingBooking(supabase, r.ruReservationId);
        if (raced) {
          await supabase.from('bookings').update(fields).eq('id', raced.id);
          return { ...base, outcome: 'updated', bookingId: raced.id, deduped: true };
        }
      }
      console.error(`${log} Request insert failed for ${r.ruReservationId}: ${error.message}`);
      return { ...base, outcome: 'failed', error: error.message };
    }

    if (!opts.skipAvailability && holdExpiresAt.getTime() > Date.now()) {
      await applyRuAvailabilityBlock(supabase, propertyId, unit.mappingRoomTypeId, r.dateFrom, r.dateTo, true, log);
    }
    console.log(`${log} ✅ Held RU request ${r.ruReservationId} until ${holdExpiresAt.toISOString()}`);
    return { ...base, outcome: 'held', bookingId: inserted?.id ?? null };
  }

  // ── Confirmed ──
  const confirmed: Record<string, unknown> = {
    ...fields,
    status: 'confirmed',
    integration_type: 'rentalsunited',
    hold_expires_at: null,
    hold_released_at: null,
    payment_status: r.alreadyPaid > 0 ? 'paid_externally' : 'pending',
  };
  if (r.alreadyPaid > 0) confirmed.paid_at = new Date().toISOString();

  let bookingId = existing?.id ?? null;
  let outcome: RuIngestOutcome = 'updated';

  if (existing) {
    await supabase.from('bookings').update(confirmed).eq('id', existing.id);
    console.log(`${log} ✅ Updated booking for RU reservation ${r.ruReservationId}`);
  } else {
    const { data: inserted, error } = await supabase
      .from('bookings')
      .insert({
        ...confirmed,
        property_id: propertyId,
        booking_channel: 'rentals_united',
        external_reservation_id: r.ruReservationId,
        ...(currencyMeta ? { ai_metadata: currencyMeta } : {}),
      })
      .select('id')
      .maybeSingle();

    if (error) {
      if (String(error.code) === '23505') {
        const raced = await findExistingBooking(supabase, r.ruReservationId);
        if (raced) {
          await supabase.from('bookings').update(confirmed).eq('id', raced.id);
          bookingId = raced.id;
          base.deduped = true;
        } else {
          return { ...base, outcome: 'failed', error: error.message };
        }
      } else {
        console.error(`${log} Failed to create booking for ${r.ruReservationId}: ${error.message}`);
        return { ...base, outcome: 'failed', error: error.message };
      }
    } else {
      bookingId = inserted?.id ?? null;
      outcome = 'created';
      console.log(`${log} ✅ Booking created for RU reservation ${r.ruReservationId}`);
    }
  }

  if (!opts.skipAvailability) {
    await applyRuAvailabilityBlock(supabase, propertyId, unit.mappingRoomTypeId, r.dateFrom, r.dateTo, true, log);
  }
  return { ...base, outcome, bookingId };
}

/**
 * ── Single-reservation detail pull (`Pull_GetReservationByID_RQ`).
 *
 * RU sometimes sends an RLNM envelope with an empty `<StayInfos />` — it only says
 * "reservation X changed". Pulling that one reservation by id is far cheaper (and far
 * more precise) than reconciling the whole account window, and it is the method RU
 * certification exercises for reservation-detail and support cases.
 */
interface RuDetailLookup {
  reservation: ParsedRuReservation | null;
  rawXml: string | null;
  error: string | null;
  /** RU sub-account that answered with the reservation (null = master). */
  resolvedOwnerId?: string | null;
  /**
   * The channel refused with its sliding-minute rate limit. That is "unknown", never
   * "does not exist" — the caller must park the notification for another attempt.
   */
  rateDeferred?: boolean;
  /**
   * The channel answered with the reservation but WITHOUT stay data (`<StayInfos />`
   * empty — normal for a fresh request/lead). Useless for a booking write, but it proves
   * which account owns the reservation, so the listing pass starts there.
   */
  partial?: ParsedRuReservation | null;
}

/** True when a failure is the channel's sliding-minute rate limit rather than a miss. */
function isRateDeferral(errorCode: string | null, message: string | null, httpStatus: number | null): boolean {
  if (errorCode === 'RU_RATE_DEFERRED') return true;
  if (httpStatus === 429) return true;
  const m = (message || '').toLowerCase();
  return m.includes('ru_rate_deferred') || m.includes('rate limit') || m.includes('same parameters');
}


/** One `Pull_GetReservationByID_RQ` attempt against a single account scope. */
async function attemptGetReservationById(
  supabase: Db,
  reservationId: string,
  scope: { propertyId?: string | null; ownerId?: string | null },
): Promise<RuDetailLookup> {
  const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
    body: {
      action: 'get_reservation_by_id',
      reservation_id: reservationId,
      ...(scope.propertyId ? { property_id: scope.propertyId } : {}),
      ...(scope.ownerId ? { owner_id: scope.ownerId } : {}),
    },
  });
  if (error) {
    const detail = await readInvokeError(error, 'Reservation lookup failed');
    return {
      reservation: null,
      rawXml: null,
      error: detail.message,
      rateDeferred: isRateDeferral(detail.errorCode, detail.message, detail.httpStatus),
    };
  }
  const res = (data || {}) as {
    success?: boolean;
    error?: string | { message?: string; code?: string };
    reservation?: ParsedRuReservation | null;
    raw_xml?: string;
  };
  if (res.success === false) {
    const msg = typeof res.error === 'string' ? res.error : res.error?.message;
    const code = typeof res.error === 'string' ? null : res.error?.code ?? null;
    return {
      reservation: null,
      rawXml: res.raw_xml ?? null,
      error: msg || 'Rentals United rejected the reservation lookup',
      rateDeferred: isRateDeferral(code, msg ?? null, null),
    };
  }
  return { reservation: res.reservation ?? null, rawXml: res.raw_xml ?? null, error: null };
}


/**
 * List-based fallback for one account: leads are not always retrievable by id, and a
 * request/lead answers "Reservation does not exist" on `Pull_GetReservationByID_RQ`.
 * Scans the lead list and the reservation list for the same id.
 */
async function attemptListLookup(
  supabase: Db,
  reservationId: string,
  scope: { propertyId?: string | null; ownerId?: string | null },
  windowDays = 90,
  forwardDays = 365,
): Promise<RuDetailLookup> {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - windowDays);
  // Leads and reservations are listed by stay date, so a request for a future stay is
  // invisible in a past-only window. Always look ahead as well.
  const end = new Date(now);
  end.setDate(now.getDate() + forwardDays);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const scopePayload = {
    ...(scope.propertyId ? { property_id: scope.propertyId } : {}),
    ...(scope.ownerId ? { owner_id: scope.ownerId } : {}),
  };

  for (const action of ['get_leads', 'list_reservations'] as const) {
    const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
      body: {
        action,
        date_from: fmt(start),
        date_to: fmt(end),
        ...(action === 'list_reservations' ? { statuses: [1, 2, 4, 6, 7, 8] } : {}),
        ...scopePayload,
      },
    });
    if (error) continue;
    const res = (data || {}) as { success?: boolean; raw_xml?: string };
    const xml = res.raw_xml || '';
    if (!xml) continue;

    let blocks = extractAllBlocks(xml, 'Reservation');
    if (blocks.length === 0) blocks = extractAllBlocks(xml, 'Lead');
    if (blocks.length === 0) blocks = extractAllBlocks(xml, 'LeadInfo');
    for (const block of blocks) {
      const parsed = parseRuReservation(block);
      // The same request can be keyed as ReservationID, LeadID or ID depending on the
      // listing method, so compare against every id the block carries.
      const candidateIds = [
        parsed.ruReservationId,
        extractTag(block, 'LeadID'),
        extractTag(block, 'ReservationID'),
        extractTag(block, 'ID'),
      ]
        .filter(Boolean)
        .map((v) => String(v).trim());
      if (!candidateIds.includes(String(reservationId).trim())) continue;
      return {
        reservation: { ...parsed, ruReservationId: String(reservationId) },
        rawXml: block,
        error: null,
        resolvedOwnerId: scope.ownerId ?? null,
      };
    }
  }
  return { reservation: null, rawXml: null, error: 'Reservation not found in any account listing' };
}

/**
 * Resolve a reservation from RU without knowing which account owns it.
 *
 * The RLNM envelope often carries no property id, and reservations that live on a
 * white-label sub-account are invisible to the master credentials ("Reservation does not
 * exist"). So the lookup fans out: known scope first, then every sub-account, then master,
 * with a list/lead fallback per account.
 */
export async function fetchRuReservationById(
  supabase: Db,
  reservationId: string,
  opts: { propertyId?: string | null; ownerId?: string | null } = {},
): Promise<RuDetailLookup> {
  const knownOwnerId =
    opts.ownerId ?? (opts.propertyId ? await resolveRuOwnerIdForProperty(supabase, opts.propertyId) : null);

  const scopes: { propertyId?: string | null; ownerId: string | null }[] = [];
  const seen = new Set<string>();
  const push = (ownerId: string | null, propertyId?: string | null) => {
    const key = `${ownerId ?? 'master'}:${propertyId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    scopes.push({ ownerId, propertyId });
  };

  if (knownOwnerId || opts.propertyId) push(knownOwnerId, opts.propertyId ?? null);

  const { data: accounts } = await supabase
    .from('ru_owner_accounts')
    .select('ru_owner_id')
    .not('ru_owner_id', 'is', null);
  for (const a of (accounts || []) as { ru_owner_id: string | number }[]) push(String(a.ru_owner_id));
  push(null); // master last

  let lastError: string | null = null;

  // Pass 1 — by id, across accounts.
  for (const scope of scopes) {
    const attempt = await attemptGetReservationById(supabase, reservationId, scope);
    if (attempt.reservation?.ruReservationId && attempt.reservation.dateFrom) {
      return { ...attempt, resolvedOwnerId: scope.ownerId };
    }
    if (attempt.error) lastError = attempt.error;
  }

  // Pass 2 — lead/reservation listings, across accounts.
  for (const scope of scopes) {
    const listed = await attemptListLookup(supabase, reservationId, scope);
    if (listed.reservation?.dateFrom) return listed;
  }

  return { reservation: null, rawXml: null, error: lastError ?? 'Reservation not found in Rentals United' };
}



/** Sub-user OwnerID for a property — direct link first, then its portfolio's account. */
export async function resolveRuOwnerIdForProperty(supabase: Db, propertyId: string): Promise<string | null> {
  const { data: direct } = await supabase
    .from('ru_owner_accounts')
    .select('ru_owner_id')
    .eq('property_id', propertyId)
    .not('ru_owner_id', 'is', null)
    .limit(1)
    .maybeSingle();
  if (direct?.ru_owner_id) return String(direct.ru_owner_id);

  const { data: members } = await supabase
    .from('property_portfolio_members')
    .select('portfolio_id')
    .eq('property_id', propertyId);
  const portfolioIds = (members || []).map((m: { portfolio_id: string }) => m.portfolio_id);
  if (portfolioIds.length === 0) return null;

  const { data: viaPortfolio } = await supabase
    .from('ru_owner_accounts')
    .select('ru_owner_id')
    .in('portfolio_id', portfolioIds)
    .not('ru_owner_id', 'is', null)
    .limit(1)
    .maybeSingle();
  return viaPortfolio?.ru_owner_id ? String(viaPortfolio.ru_owner_id) : null;
}

/**
 * Refresh one RU reservation from the channel and ingest it.
 * Used by the RLNM handler when the notification carries no stay data.
 */
export async function refreshRuReservationById(
  supabase: Db,
  reservationId: string,
  opts: {
    propertyId?: string | null;
    ownerId?: string | null;
    logPrefix?: string;
    forceRequest?: boolean;
    /** Kind carried over from the RLNM envelope (cancel/modify envelopes lack a status id). */
    kind?: RuNotificationKind;
  } = {},
): Promise<RuIngestResult> {
  const log = opts.logPrefix || '[ru-ingest]';
  const { reservation, error } = await fetchRuReservationById(supabase, reservationId, opts);
  if (error || !reservation?.ruReservationId) {
    console.warn(`${log} Detail pull for reservation ${reservationId} failed: ${error ?? 'not found'}`);
    return {
      outcome: 'failed',
      bookingId: null,
      propertyId: null,
      deduped: false,
      channelLabel: null,
      error: error ?? 'Reservation not found in Rentals United',
    };
  }
  return await ingestRuReservation(supabase, reservation, {
    source: 'rlnm',
    logPrefix: log,
    forceRequest: opts.forceRequest,
    kind: opts.kind,
  });
}
