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

import { resolveRuOwnerScopes } from './ruOwnerScopes.ts';
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { loadCurrencyState, revertAmount } from './ruCurrency.ts';
import { readInvokeError } from './functionInvokeError.ts';

import {
  applyRuAvailabilityBlock,
  buildRuChannelNotes,
  classifyRuNotification,
  extractAllBlocks,
  extractTag,
  parseRuReservation,
  releaseChannelBlocksForBooking,
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

/**
 * Reconcile the unit lines of a reservation that covers more than one unit.
 *
 * RU sends one `<StayInfo>` per booked unit inside a single reservation. ROL'OS keeps it as ONE
 * booking (one guest, one reference, one total) with a `rolos_booking_rooms` line per unit, so the
 * grid draws the stay on every unit row. Lines for units that dropped off a modification are
 * removed and their nights released.
 */
/**
 * One readable request line for the whole booking: the reservation-level note first, then each
 * unit's own note tagged with its stay so a multi-unit booking never loses which unit asked what.
 */
function summariseRuComments(r: ParsedRuReservation): string | null {
  const parts: string[] = [];
  const reservationNote = (r.reservationComments || '').trim();
  if (reservationNote) parts.push(reservationNote);
  const multi = r.stays.length > 1;
  for (const stay of r.stays) {
    const note = (stay.comments || '').trim();
    if (!note || note === reservationNote) continue;
    parts.push(multi ? `${stay.dateFrom || 'unit'}: ${note}` : note);
  }
  return parts.length ? parts.join(' · ') : null;
}

/** Split `total` across `parts` as evenly as possible, giving the remainder to the first units. */
function shareOf(total: number, parts: number, index: number): number {
  if (parts <= 1) return total;
  const base = Math.floor(total / parts);
  const remainder = total - base * parts;
  return base + (index < remainder ? 1 : 0);
}

async function syncRuStayUnits(
  supabase: Db,
  bookingId: string,
  r: ParsedRuReservation,
  primary: ResolvedRuUnit,
  opts: RuIngestOptions,
  blockNights: boolean,
): Promise<void> {
  const log = opts.logPrefix || '[ru-ingest]';
  const stays = r.stays.length ? r.stays : [];
  if (stays.length === 0) return;

  const resolvedCache = new Map<string, ResolvedRuUnit>();
  if (r.ruPropertyId) resolvedCache.set(String(r.ruPropertyId), primary);

  const lines: Array<{ unit: ResolvedRuUnit; stay: typeof stays[number]; copy: number; copies: number }> = [];
  for (const stay of stays) {
    const key = String(stay.ruPropertyId ?? '');
    let unit = key ? resolvedCache.get(key) : primary;
    if (!unit) {
      unit = await resolveRuUnit(supabase, stay.ruPropertyId);
      if (key) resolvedCache.set(key, unit);
    }
    if (!unit?.propertyId) {
      console.warn(`${log} No ROL'OS unit for stay listing ${stay.ruPropertyId ?? 'none'} — line skipped`);
      continue;
    }
    // `Units` > 1 means the guest took several copies of the same unit type in one stay
    // block. Each copy needs its own line, or the grid shows one unit holding everybody.
    const copies = Math.max(1, stay.units || 1);
    for (let i = 0; i < copies; i++) lines.push({ unit, stay, copy: i, copies });
  }
  if (lines.length === 0) return;

  // Two lines can resolve to the same physical unit (repeated listing, or Units > 1). Give each
  // its own sibling room of the same type so per-unit guests and notes stay separate instead of
  // one line overwriting the other.
  const takenRooms = new Set<string>();
  for (const line of lines) {
    const roomId = line.unit.roomId;
    if (!roomId) continue;
    if (!takenRooms.has(roomId)) {
      takenRooms.add(roomId);
      continue;
    }
    const { data: siblings } = await supabase
      .from('rolos_rooms')
      .select('id')
      .eq('room_type_id', line.unit.roomTypeId)
      .neq('status', 'out_of_service')
      .order('room_number', { ascending: true });
    const free = ((siblings || []) as Array<{ id: string }>).find((row) => !takenRooms.has(row.id));
    if (free) {
      line.unit = { ...line.unit, roomId: free.id };
      takenRooms.add(free.id);
    } else {
      console.warn(`${log} No spare unit of type ${line.unit.roomTypeId} for an extra stay copy`);
    }
  }

  // Physical unit anchors, so every booked unit shows a line on the dashboard grid.
  const roomIds = [...new Set(lines.map((l) => l.unit.roomId).filter(Boolean) as string[])];
  if (roomIds.length) {
    await supabase.from('bookings').update({ rolos_room_ids: roomIds }).eq('id', bookingId);

    for (const { unit, stay, copy, copies } of lines) {
      if (!unit.roomId) continue;
      // Guests and money quoted for a multi-copy stay cover all of its units — spread them so
      // each unit line carries its own share rather than the whole party.
      const guests = shareOf(stay.numGuests || copies, copies, copy) || 1;
      const rate = (stay.total || 0) / copies;
      const { error } = await supabase.from('rolos_booking_rooms').upsert(
        {
          booking_id: bookingId,
          room_id: unit.roomId,
          room_type_id: unit.roomTypeId,
          rate_charged: rate,
          adults: guests,
          // The note the channel attached to THIS stay block belongs to this unit only.
          guest_comments: stay.comments || null,
          // A unit that returns on a later modification is reinstated, not left cancelled.
          status: 'active',
          cancelled_at: null,
          cancellation_reason: null,
        },
        { onConflict: 'booking_id,room_id' },
      );
      if (error) console.error(`${log} Unit line write failed for room ${unit.roomId}: ${error.message}`);
    }

    // Units the channel dropped off a modification are cancelled per unit — the rest of the
    // stay stays live. The lines are kept (never deleted) so the cancellation is auditable.
    const { data: staleLines } = await supabase
      .from('rolos_booking_rooms')
      .select('id, room_id, room_type_id, status')
      .eq('booking_id', bookingId);
    const stale = (
      (staleLines || []) as Array<{
        id: string;
        room_id: string | null;
        room_type_id: string | null;
        status: string | null;
      }>
    ).filter((row) => row.room_id && !roomIds.includes(row.room_id) && row.status !== 'cancelled');

    if (stale.length) {
      const { error: cancelErr } = await supabase
        .from('rolos_booking_rooms')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
          cancellation_reason: `Unit withdrawn via Rentals United (${opts.source})`,
        })
        .in('id', stale.map((s) => s.id));
      if (cancelErr) {
        console.error(`${log} Per-unit cancel failed: ${cancelErr.message}`);
      } else if (!opts.skipAvailability && primary.propertyId) {
        // Release only the withdrawn units' nights; the surviving units keep their blocks.
        for (const row of stale) {
          const from = r.dateFrom;
          const to = r.dateTo;
          if (!from || !to || !row.room_type_id) continue;
          await applyRuAvailabilityBlock(
            supabase,
            primary.propertyId as string,
            row.room_type_id,
            from,
            to,
            false,
            log,
            bookingId,
          );
        }
      }
    }
  }


  if (blockNights && !opts.skipAvailability) {
    for (const { unit, stay } of lines) {
      const from = stay.dateFrom || r.dateFrom;
      const to = stay.dateTo || r.dateTo;
      if (!from || !to) continue;
      await applyRuAvailabilityBlock(
        supabase,
        unit.propertyId as string,
        unit.mappingRoomTypeId,
        from,
        to,
        true,
        log,
        bookingId,
      );
    }
  }
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
      if (!opts.skipAvailability) {
        // Release by stamp first: it clears every unit of a multi-unit stay and survives a
        // unit rename or re-casing that would defeat the name-keyed release below.
        const released = await releaseChannelBlocksForBooking(supabase, existing.id, log);
        const dateFrom = r.dateFrom || existing.check_in_date;
        const dateTo = r.dateTo || existing.check_out_date;
        if (released === 0 && dateFrom && dateTo) {
          await applyRuAvailabilityBlock(supabase, propertyId, unit.mappingRoomTypeId, dateFrom, dateTo, false, log);
        }
      }

      console.log(`${log} ✅ Cancelled booking for RU reservation ${r.ruReservationId}`);
      return { ...base, outcome: 'cancelled', bookingId: existing.id };
    }
    return { ...base, outcome: 'skipped', bookingId: existing?.id ?? null, note: 'Already cancelled / never imported' };
  }

  if (!r.dateFrom || !r.dateTo) {
    return { ...base, outcome: 'skipped', bookingId: existing?.id ?? null, note: 'Reservation carries no stay dates' };
  }

  // A modification that moves or extends the stay must re-draw its footprint, not add to it.
  // Releasing this booking's own stamped nights first means the block always matches the new
  // dates exactly — no nights left blocked outside the stay, no gap inside it.
  const datesShifted = Boolean(
    existing && (existing.check_in_date !== r.dateFrom || existing.check_out_date !== r.dateTo),
  );
  if (datesShifted && existing && !opts.skipAvailability) {
    await releaseChannelBlocksForBooking(supabase, existing.id, log);
    console.log(
      `${log} Stay dates moved ${existing.check_in_date}→${existing.check_out_date} to ${r.dateFrom}→${r.dateTo}; blocks re-drawn`,
    );
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
  // Remember the listing the reservation actually arrived on. Re-deriving it later from the local
  // unit mapping is what made outbound modifications fail with "PropertyID specified in Current
  // element doesn't match" once a stay had been moved between units.
  if (r.ruPropertyId) fields.channel_listing_id = String(r.ruPropertyId);
  const guestRequestSummary = summariseRuComments(r);
  if (guestRequestSummary) fields.special_requests = guestRequestSummary;

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
      // A modification can add or drop units — reconcile the lines and their blocks.
      await syncRuStayUnits(supabase, existing.id, r, unit, opts, true);
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
        (guestRequestSummary ? ` · ${guestRequestSummary}` : ''),
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

    const heldId = inserted?.id ?? null;
    const holdLive = holdExpiresAt.getTime() > Date.now();
    if (heldId) {
      await syncRuStayUnits(supabase, heldId, r, unit, opts, holdLive);
    }
    if (!opts.skipAvailability && holdLive && !r.stays.length) {
      await applyRuAvailabilityBlock(supabase, propertyId, unit.mappingRoomTypeId, r.dateFrom, r.dateTo, true, log, heldId);
    }
    console.log(`${log} ✅ Held RU request ${r.ruReservationId} until ${holdExpiresAt.toISOString()}`);
    return { ...base, outcome: 'held', bookingId: heldId };

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

  if (bookingId) {
    // Multi-unit stays get a line and a block per unit; single-unit falls through below.
    await syncRuStayUnits(supabase, bookingId, r, unit, opts, true);
  }
  if (!opts.skipAvailability && !r.stays.length) {
    await applyRuAvailabilityBlock(supabase, propertyId, unit.mappingRoomTypeId, r.dateFrom, r.dateTo, true, log, bookingId);
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
  let rateDeferred = false;

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
    if (error) {
      const detail = await readInvokeError(error, `${action} failed`);
      if (isRateDeferral(detail.errorCode, detail.message, detail.httpStatus)) rateDeferred = true;
      continue;
    }
    const res = (data || {}) as { success?: boolean; raw_xml?: string; error?: { code?: string; message?: string } };
    if (res.success === false && isRateDeferral(res.error?.code ?? null, res.error?.message ?? null, null)) {
      rateDeferred = true;
    }
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
  return {
    reservation: null,
    rawXml: null,
    error: rateDeferred
      ? 'Channel rate limit — listing lookup deferred'
      : 'Reservation not found in any account listing',
    rateDeferred,
  };
}

/** Sub-account OwnerID whose portal login matches the RU `Creator` on the envelope. */
async function resolveRuOwnerIdForCreator(supabase: Db, creator: string | null): Promise<string | null> {
  const name = (creator || '').trim().toLowerCase();
  if (!name || !name.includes('@')) return null;
  const { data } = await supabase
    .from('ru_owner_accounts')
    .select('ru_owner_id, ru_login_email, owner_email')
    .not('ru_owner_id', 'is', null);
  const match = ((data || []) as { ru_owner_id: string | number; ru_login_email: string | null; owner_email: string | null }[]).find(
    (row) =>
      (row.ru_login_email || '').trim().toLowerCase() === name ||
      (row.owner_email || '').trim().toLowerCase() === name,
  );
  return match?.ru_owner_id ? String(match.ru_owner_id) : null;
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
  opts: { propertyId?: string | null; ownerId?: string | null; creator?: string | null } = {},
): Promise<RuDetailLookup> {
  const knownOwnerId =
    opts.ownerId ?? (opts.propertyId ? await resolveRuOwnerIdForProperty(supabase, opts.propertyId) : null);
  // The envelope's `Creator` is the portal login of the account that raised the reservation —
  // the cheapest, most reliable hint about which sub-account can actually read it.
  const creatorOwnerId = await resolveRuOwnerIdForCreator(supabase, opts.creator ?? null);

  const scopes: { propertyId?: string | null; ownerId: string | null }[] = [];
  const seen = new Set<string>();
  const push = (ownerId: string | null, propertyId?: string | null) => {
    const key = `${ownerId ?? 'master'}:${propertyId ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    scopes.push({ ownerId, propertyId });
  };

  // Only accounts with usable API credentials can answer an account-scoped read. Enumerating
  // every row blindly is what produced the `no_subuser_keys` failures (e.g. OwnerID 742004)
  // and the -6 rate limits: four wire calls per account, colliding with the 30-minute poll.
  const keyedScopes = await resolveRuOwnerScopes(supabase as unknown as SupabaseClient, '__reservation_lookup__', {
    includeMaster: false,
  });
  const keyed = new Set(keyedScopes.map((s) => String(s.ownerId)));
  const usable = (ownerId: string | null) => ownerId === null || keyed.has(String(ownerId));

  // Hints first, but only when the hinted account can actually authenticate.
  if (usable(knownOwnerId) && (knownOwnerId || opts.propertyId)) push(knownOwnerId, opts.propertyId ?? null);
  if (creatorOwnerId && usable(creatorOwnerId)) push(creatorOwnerId);
  for (const scope of keyedScopes) push(scope.ownerId);
  push(null); // master last

  let lastError: string | null = null;
  let rateDeferred = false;
  let partial: ParsedRuReservation | null = null;
  let partialOwnerId: string | null | undefined;

  // Pass 1 — by id, across accounts.
  for (const scope of scopes) {
    const attempt = await attemptGetReservationById(supabase, reservationId, scope);
    if (attempt.reservation?.ruReservationId && attempt.reservation.dateFrom) {
      return { ...attempt, resolvedOwnerId: scope.ownerId };
    }
    // Reservation exists here but carries an empty <StayInfos /> — remember the account so the
    // listing pass (which does carry stay data for leads) starts with the right credentials.
    if (attempt.reservation?.ruReservationId && !partial) {
      partial = attempt.reservation;
      partialOwnerId = scope.ownerId;
    }
    if (attempt.rateDeferred) rateDeferred = true;
    if (attempt.error) lastError = attempt.error;
  }

  // Pass 2 — lead/reservation listings. Owning account first, and with a tight window: the
  // channel answers an over-wide range with an empty list.
  const listScopes = partialOwnerId !== undefined ? [{ ownerId: partialOwnerId }, ...scopes] : scopes;
  const seenList = new Set<string>();
  for (const scope of listScopes) {
    const key = `${scope.ownerId ?? 'master'}:${scope.propertyId ?? ''}`;
    if (seenList.has(key)) continue;
    seenList.add(key);
    // One window per account. The wide window is spent only on the account that already
    // answered partially — anything else just burns the per-method sliding minute.
    const windows: ReadonlyArray<readonly [number, number]> =
      partialOwnerId !== undefined && scope.ownerId === partialOwnerId
        ? ([[7, 400], [90, 365]] as const)
        : ([[7, 400]] as const);
    for (const [back, forward] of windows) {
      const listed = await attemptListLookup(supabase, reservationId, scope, back, forward);
      if (listed.reservation?.dateFrom) return { ...listed, partial };
      if (listed.rateDeferred) {
        // The method is rate limited right now: continuing to the next account inside the
        // same minute only produces more -6 answers. Hand back a retry instead.
        rateDeferred = true;
        return {
          reservation: null,
          rawXml: null,
          error: 'RU_RATE_DEFERRED: channel rate limit — reservation lookup deferred, will retry',
          rateDeferred: true,
          partial,
          resolvedOwnerId: partialOwnerId ?? null,
        };
      }
    }
  }

  return {
    reservation: null,
    rawXml: null,
    error: rateDeferred
      ? 'RU_RATE_DEFERRED: channel rate limit — reservation lookup deferred, will retry'
      : lastError ?? 'Reservation not found in Rentals United',
    rateDeferred,
    partial,
    resolvedOwnerId: partialOwnerId ?? null,
  };
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
    /** RU `Creator` from the envelope — resolves the owning sub-account first. */
    creator?: string | null;
  } = {},
): Promise<RuIngestResult & { rateDeferred?: boolean; resolvedOwnerId?: string | null }> {
  const log = opts.logPrefix || '[ru-ingest]';
  const lookup = await fetchRuReservationById(supabase, reservationId, opts);
  const { reservation, error } = lookup;
  if (error || !reservation?.ruReservationId) {
    console.warn(`${log} Detail pull for reservation ${reservationId} failed: ${error ?? 'not found'}`);
    return {
      outcome: 'failed',
      bookingId: null,
      propertyId: null,
      deduped: false,
      channelLabel: null,
      error: error ?? 'Reservation not found in Rentals United',
      rateDeferred: lookup.rateDeferred ?? false,
      resolvedOwnerId: lookup.resolvedOwnerId ?? null,
    };
  }
  const ingested = await ingestRuReservation(supabase, reservation, {
    source: 'rlnm',
    logPrefix: log,
    forceRequest: opts.forceRequest,
    kind: opts.kind,
  });
  return { ...ingested, resolvedOwnerId: lookup.resolvedOwnerId ?? null };
}

