/**
 * Shared Rentals United reservation/lead XML parsing + write helpers.
 *
 * RU delivers guest and stay data nested inside <CustomerInfo> / <StayInfo> blocks
 * (and <StayInfos> wrappers), never as flat tags — parsing the envelope shallowly
 * yields the "RU Guest" placeholder records with no dates or unit.
 */

// deno-lint-ignore no-explicit-any
type Db = any;

export function extractTag(xml: string, tag: string): string | null {
  const match = xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i'));
  return match ? match[1].trim() : null;
}

export function extractAllBlocks(xml: string, tag: string): string[] {
  return xml.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi')) || [];
}

export function extractBlock(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'i'));
  return m ? m[0] : '';
}

/** One `<StayInfo>` block: a single unit's slice of the reservation. */
export interface ParsedRuStay {
  ruPropertyId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  arrivalTime: string | null;
  numGuests: number;
  units: number;
  comments: string | null;
  resapaId: string | null;
  total: number;
  alreadyPaid: number;
  nightly: Array<{ date: string; price: number }>;
}

export interface ParsedRuReservation {
  ruReservationId: string | null;
  statusId: string | null;
  ruPropertyId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  arrivalTime: string | null;
  numGuests: number;
  units: number;
  guestName: string;
  guestEmail: string;
  guestPhone: string | null;
  countryId: string | null;
  address: string | null;
  zipCode: string | null;
  comments: string | null;
  /**
   * The reservation-level `<Comments>` — the note the guest wrote about the whole booking.
   * It sits outside `<StayInfos>`, so it must be read from the envelope with the stay blocks
   * removed; reading the block shallowly returns the first unit's note instead and the
   * booking-wide request was lost.
   */
  reservationComments: string | null;
  resapaId: string | null;
  creator: string | null;
  createdDate: string | null;
  total: number;
  alreadyPaid: number;
  nightly: Array<{ date: string; price: number }>;
  /**
   * Every unit on the reservation. A guest can book two units in one go, and RU sends one
   * `<StayInfo>` per unit — reading only the first silently dropped the rest.
   */
  stays: ParsedRuStay[];
}

/** Parse one `<StayInfo>` block. */
function parseRuStay(stay: string, block: string): ParsedRuStay {
  const costs = extractBlock(stay, 'Costs');
  const nightly = [...stay.matchAll(/<DayPrices\s+Date="([^"]+)"[^>]*>([\s\S]*?)<\/DayPrices>/gi)].map((m) => ({
    date: m[1],
    price: parseFloat(extractTag(m[2], 'Price') || extractTag(m[2], 'Rent') || '0'),
  }));
  return {
    ruPropertyId: extractTag(stay, 'PropertyID') || extractTag(block, 'PropID') || extractTag(block, 'PropertyID'),
    dateFrom: extractTag(stay, 'DateFrom'),
    dateTo: extractTag(stay, 'DateTo'),
    arrivalTime: extractTag(stay, 'ArrivalTime'),
    numGuests: parseInt(extractTag(stay, 'NumberOfGuests') || '1', 10),
    units: parseInt(extractTag(stay, 'Units') || '1', 10),
    // Strictly this unit's own note — no fallback to the reservation-level comment, which
    // would stamp the same text on every unit and hide which unit it really belongs to.
    comments: extractTag(stay, 'Comments') || null,
    resapaId: extractTag(stay, 'ResapaID') || null,
    total: parseFloat(
      extractTag(costs, 'ClientPrice') || extractTag(costs, 'RUPrice') || extractTag(block, 'RUPrice') || '0',
    ),
    alreadyPaid: parseFloat(extractTag(costs, 'AlreadyPaid') || '0'),
    nightly,
  };
}

/** Parse one RU <Reservation> block into the ROL'OS booking shape. */
export function parseRuReservation(block: string): ParsedRuReservation {
  const stayBlocks = extractAllBlocks(block, 'StayInfo');
  const stays = (stayBlocks.length ? stayBlocks : [extractBlock(block, 'StayInfos') || block]).map((s) =>
    parseRuStay(s, block),
  );
  // Only keep slices that actually name a unit or dates — an empty <StayInfos /> parses to noise.
  const realStays = stays.filter((s) => s.ruPropertyId || s.dateFrom);
  const first = realStays[0] ?? stays[0];

  // Envelope minus every stay: the only place the booking-wide comment can be read cleanly.
  const envelopeOnly = block.replace(/<StayInfos?[^>]*>[\s\S]*?<\/StayInfos?>/gi, '');

  const customer = extractBlock(block, 'CustomerInfo') || block;
  const firstName = extractTag(customer, 'Name') || extractTag(customer, 'FirstName') || '';
  const lastName = extractTag(customer, 'SurName') || extractTag(customer, 'LastName') || '';
  const guestName = `${firstName} ${lastName}`.trim();

  const dates = realStays.length ? realStays : [first];
  const minDate = (key: 'dateFrom' | 'dateTo') =>
    dates.map((s) => s[key]).filter(Boolean).sort()[0] ?? null;
  const maxDate = (key: 'dateFrom' | 'dateTo') =>
    dates.map((s) => s[key]).filter(Boolean).sort().slice(-1)[0] ?? null;

  return {
    ruReservationId: extractTag(block, 'ReservationID') || extractTag(block, 'LeadID'),
    statusId: extractTag(block, 'StatusID') || extractTag(block, 'ReservationStatusID') || extractTag(block, 'Status'),
    ruPropertyId: first.ruPropertyId,
    // The booking spans every unit on the reservation: earliest arrival, latest departure.
    dateFrom: minDate('dateFrom'),
    dateTo: maxDate('dateTo'),
    arrivalTime: first.arrivalTime,
    numGuests: realStays.length
      ? realStays.reduce((sum, s) => sum + (s.numGuests || 0), 0) || 1
      : first.numGuests,
    units: realStays.length || first.units,
    guestName: guestName || 'RU Guest',
    guestEmail: extractTag(customer, 'Email') || 'ru-notification@rentalsunited.com',
    guestPhone: extractTag(customer, 'MobilePhone') || extractTag(customer, 'Phone') || null,
    countryId: extractTag(customer, 'CountryID') || null,
    address: extractTag(customer, 'Address') || null,
    zipCode: extractTag(customer, 'ZipCode') || null,
    comments: first.comments,
    reservationComments: extractTag(envelopeOnly, 'Comments'),
    resapaId: first.resapaId,
    creator: extractTag(block, 'Creator') || null,
    createdDate: extractTag(block, 'CreatedDate') || extractTag(block, 'LastMod') || null,
    total: realStays.length ? realStays.reduce((sum, s) => sum + (s.total || 0), 0) : first.total,
    alreadyPaid: realStays.length
      ? realStays.reduce((sum, s) => sum + (s.alreadyPaid || 0), 0)
      : first.alreadyPaid,
    nightly: first.nightly,
    stays: realStays,
  };
}


/** Channel metadata kept in `modification_notes` (no dedicated columns exist). */
export function buildRuChannelNotes(r: ParsedRuReservation, extra: Record<string, unknown> = {}) {
  return {
    channel: 'rentals_united',
    ru_reservation_id: r.ruReservationId,
    ru_property_id: r.ruPropertyId,
    ru_status_id: r.statusId,
    resapa_id: r.resapaId,
    creator: r.creator,
    created_date: r.createdDate,
    arrival_time: r.arrivalTime,
    units: r.units,
    country_id: r.countryId,
    address: r.address,
    zip_code: r.zipCode,
    guest_comments: r.reservationComments || r.comments,
    reservation_comments: r.reservationComments,
    /** One entry per booked unit, so a note is always traceable to the unit that carries it. */
    unit_comments: r.stays
      .filter((s) => s.comments || s.numGuests)
      .map((s) => ({
        ru_property_id: s.ruPropertyId,
        date_from: s.dateFrom,
        date_to: s.dateTo,
        guests: s.numGuests,
        comments: s.comments,
      })),
    amount_already_paid: r.alreadyPaid,
    nightly_prices: r.nightly,
    synced_at: new Date().toISOString(),
    ...extra,
  };
}

export interface ResolvedRuUnit {
  propertyId: string | null;
  /** Canonical `rolos_room_types` id the ROL'OS calendar renders. */
  roomTypeId: string | null;
  /** `hostfully_room_types` id carrying the RU mapping (used for availability rows). */
  mappingRoomTypeId: string | null;
  unitName: string | null;
  /** Physical `rolos_rooms` id of the canonical unit, so the grid places the stay at once. */
  roomId?: string | null;
}


/**
 * Resolve an RU PropertyID to the property + the room type the ROL'OS dashboard renders.
 * The RU mapping lives on `hostfully_room_types`, but ROL'OS-native properties draw their
 * calendar rows from `rolos_room_types`; without this name-based hop the imported booking
 * never matches a displayed unit.
 */
export async function resolveRuUnit(supabase: Db, ruPropertyId: string | null): Promise<ResolvedRuUnit> {
  const empty: ResolvedRuUnit = { propertyId: null, roomTypeId: null, mappingRoomTypeId: null, unitName: null, roomId: null };
  if (!ruPropertyId) return empty;

  const { data: mapping } = await supabase
    .from('hostfully_room_types')
    .select('id, name, property_id, linked_rolos_id')
    .eq('rentalsunited_property_id', ruPropertyId)
    .order('is_active', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (mapping?.property_id) {
    let canonicalId: string | null = null;
    const { data: types } = await supabase
      .from('rolos_room_types')
      .select('id, name, is_active, created_at')
      .eq('property_id', mapping.property_id);
    const rows = (types || []) as Array<{ id: string; name: string | null; is_active: boolean | null; created_at: string | null }>;

    // A linked room type always wins.
    if (mapping.linked_rolos_id && rows.some((rt) => rt.id === mapping.linked_rolos_id)) {
      canonicalId = mapping.linked_rolos_id;
    }

    // Otherwise pick the canonical twin by name: active first, then most recently created.
    // Duplicate/archived copies of the same unit must never win, or the stay lands on a
    // room type the calendar does not render.
    if (!canonicalId && mapping.name) {
      const target = (mapping.name || '').trim().toLowerCase();
      const matches = rows
        .filter((rt) => (rt.name || '').trim().toLowerCase() === target)
        .sort((a, b) => {
          const activeDelta = Number(!!b.is_active) - Number(!!a.is_active);
          if (activeDelta !== 0) return activeDelta;
          return String(b.created_at ?? '').localeCompare(String(a.created_at ?? ''));
        });
      canonicalId = matches[0]?.id ?? null;
    }

    // Physical unit for the canonical type, so the grid can place the stay immediately.
    let roomId: string | null = null;
    if (canonicalId) {
      const { data: room } = await supabase
        .from('rolos_rooms')
        .select('id')
        .eq('property_id', mapping.property_id)
        .eq('room_type_id', canonicalId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      roomId = room?.id ?? null;
    }

    return {
      propertyId: mapping.property_id,
      roomTypeId: canonicalId || mapping.id,
      mappingRoomTypeId: mapping.id,
      unitName: mapping.name ?? null,
      roomId,
    };
  }

  const { data: prop } = await supabase
    .from('properties')
    .select('id')
    .eq('rentalsunited_property_id', ruPropertyId)
    .limit(1)
    .maybeSingle();
  return { ...empty, propertyId: prop?.id ?? null };
}


/** Marker written into `blocked_reason` so a channel block can always be traced to its stay. */
export const CHANNEL_BLOCK_LABEL = 'Channel Manager';
export function channelBlockReason(bookingId: string | null | undefined): string {
  return bookingId ? `channel_booking:${bookingId}` : 'channel_booking';
}

function eachNight(checkIn: string, checkOut: string): string[] {
  const dates: string[] = [];
  for (let d = new Date(`${checkIn}T00:00:00Z`); d < new Date(`${checkOut}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

/** Real sellable inventory for a unit, so a release restores it instead of hardcoding 1. */
async function resolveUnitInventory(supabase: Db, mappingRoomTypeId: string | null): Promise<number> {
  if (!mappingRoomTypeId) return 1;
  const { data } = await supabase
    .from('hostfully_room_types')
    .select("total_units")
    .eq('id', mappingRoomTypeId)
    .maybeSingle();
  const candidate = Number(data?.total_units ?? 1);
  return Number.isFinite(candidate) && candidate > 0 ? candidate : 1;
}

/**
 * Block (or release) the booked nights so the ROL booking engine cannot resell them.
 *
 * Every channel-written night is stamped with its booking (`blocked_reason`) and labelled as a
 * Channel Manager block, so a later cancellation can release exactly its own nights even if the
 * unit was since renamed or re-cased — and operator blocks (no stamp) are never touched.
 */
export async function applyRuAvailabilityBlock(
  supabase: Db,
  propertyId: string,
  mappingRoomTypeId: string | null,
  checkIn: string,
  checkOut: string,
  block: boolean,
  logPrefix = '[ru]',
  bookingId: string | null = null,
) {
  try {
    let roomName: string | null = null;
    if (mappingRoomTypeId) {
      const { data: rt } = await supabase
        .from('hostfully_room_types')
        .select('name')
        .eq('id', mappingRoomTypeId)
        .maybeSingle();
      roomName = rt?.name ?? null;
      // Callers sometimes hold the canonical ROL'OS room type id instead of the channel
      // mapping id — without this fallback the block or release silently did nothing.
      if (!roomName) {
        const { data: canonical } = await supabase
          .from('rolos_room_types')
          .select('name')
          .eq('id', mappingRoomTypeId)
          .maybeSingle();
        roomName = canonical?.name ?? null;
      }
    }
    if (!roomName) {
      console.warn(`${logPrefix} No unit name resolved — skipping availability ${block ? 'block' : 'release'}`);
      return;
    }

    const dates = eachNight(checkIn, checkOut);
    if (dates.length === 0) return;
    const inventory = block ? 0 : await resolveUnitInventory(supabase, mappingRoomTypeId);
    const stampedAt = new Date().toISOString();

    // The table enforces uniqueness on (property_id, room_type, date) as well, so the conflict
    // target must be the 3-column key — a 4-column target collides with it and the write is lost.
    const { error } = await supabase.from('property_availability').upsert(
      dates.map((date) => ({
        property_id: propertyId,
        room_type: roomName,
        date,
        external_system: 'manual',
        available_units: inventory,
        is_stop_sell: block,
        blocked_by_label: block ? CHANNEL_BLOCK_LABEL : null,
        blocked_reason: block ? channelBlockReason(bookingId) : null,
        blocked_at: block ? stampedAt : null,
      })),
      { onConflict: 'property_id,room_type,date', ignoreDuplicates: false },
    );
    if (error) console.error(`${logPrefix} Availability ${block ? 'block' : 'release'} failed: ${error.message}`);
  } catch (e) {
    console.error(`${logPrefix} Availability sync error:`, e);
  }
}

/**
 * Release every night this booking closed, found by its stamp rather than by unit name.
 * A renamed or re-cased unit can no longer strand blocked nights.
 */
export async function releaseChannelBlocksForBooking(
  supabase: Db,
  bookingId: string,
  logPrefix = '[ru]',
  /** Limit the release to these unit names — used when only one unit of a stay is cancelled. */
  onlyRoomTypes?: string[] | null,
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('property_availability')
      .select('id, property_id, room_type')
      .eq('blocked_reason', channelBlockReason(bookingId));
    if (error) {
      console.error(`${logPrefix} Stamped block lookup failed: ${error.message}`);
      return 0;
    }
    let rows = (data || []) as Array<{ id: string; property_id: string; room_type: string }>;
    if (onlyRoomTypes?.length) {
      const wanted = new Set(onlyRoomTypes.map((n) => (n || '').trim().toLowerCase()));
      rows = rows.filter((r) => wanted.has((r.room_type || '').trim().toLowerCase()));
    }
    if (rows.length === 0) return 0;

    const { error: upErr } = await supabase
      .from('property_availability')
      .update({
        available_units: 1,
        is_stop_sell: false,
        blocked_by: null,
        blocked_by_label: null,
        blocked_reason: null,
        blocked_at: null,
      })
      .in('id', rows.map((r) => r.id));
    if (upErr) {
      console.error(`${logPrefix} Stamped block release failed: ${upErr.message}`);
      return 0;
    }
    console.log(`${logPrefix} Released ${rows.length} stamped channel night(s) for booking ${bookingId}`);
    return rows.length;
  } catch (e) {
    console.error(`${logPrefix} Stamped block release error:`, e);
    return 0;
  }
}


/**
 * Single source of truth for RLNM envelope + status mapping.
 *
 * Rentals United delivers reservation notifications under several envelope names, and the
 * numeric `StatusID` is not always present (cancellation envelopes often omit it). Envelope
 * name wins, then explicit tags, then the numeric status:
 *
 *  - `LNM_PutConfirmedReservation_RQ`                → confirmed
 *  - `LNM_PutConfirmedReservationMod(ification)_RQ`  → modified (same write path as confirmed)
 *  - `LNM_PutCancelation_RQ` / `LNM_PutCancellation` → cancelled
 *  - `LNM_PutUnconfirmedReservation_RQ` / request / lead envelopes → request (3-day hold)
 *
 * Numeric StatusID map: 1/6 confirmed, 3/5 modified, 2/7/8 cancelled, 4 request (pending),
 * anything else a request. StatusID 4 is RU's "request/pending" state — never a cancellation.
 */
export type RuNotificationKind = 'confirmed' | 'modified' | 'cancelled' | 'request';

export function classifyRuNotification(xml: string, statusId: string | null): RuNotificationKind {
  const lower = (xml || '').toLowerCase();

  const envelope = detectRuEnvelopeKind(lower);
  if (envelope === 'cancelled' || envelope === 'modified') return envelope;
  if (envelope === 'request') {
    if (statusId && ['2', '7', '8'].includes(statusId)) return 'cancelled';
    return 'request';
  }
  if (envelope === 'confirmed') {
    if (statusId && ['2', '7', '8'].includes(statusId)) return 'cancelled';
    // A confirmed envelope carrying the pending status is still a live hold, not a booking.
    return statusId === '4' ? 'request' : 'confirmed';
  }

  if (statusId && ['2', '7', '8'].includes(statusId)) return 'cancelled';
  if (statusId && ['1', '6'].includes(statusId)) return 'confirmed';
  if (statusId && ['3', '5'].includes(statusId)) return 'modified';
  return 'request';
}


/**
 * Envelope-name detection only (no numeric status). Returns null when the XML fragment
 * carries no envelope name — which is always the case for an inner `<Reservation>` block,
 * so per-block classification must inherit the envelope's kind instead of guessing.
 */
export function detectRuEnvelopeKind(xml: string): RuNotificationKind | null {
  const lower = (xml || '').toLowerCase();

  // Cancellations must never fall through to the "request" default, which would re-open
  // a hold on cancelled nights.
  if (
    lower.includes('putcancel') ||
    lower.includes('cancelreservation') ||
    lower.includes('cancelation_rq') ||
    lower.includes('cancellation_rq') ||
    lower.includes('<iscancel>true</iscancel>') ||
    lower.includes('<iscancelled>true</iscancelled>') ||
    lower.includes('<iscanceled>true</iscanceled>')
  ) {
    return 'cancelled';
  }
  if (
    lower.includes('reservationmod') ||
    lower.includes('reservationmodification') ||
    lower.includes('<ismodification>true</ismodification>')
  ) {
    return 'modified';
  }
  if (
    lower.includes('putunconfirmedreservation') ||
    lower.includes('putrequestreservation') ||
    lower.includes('unconfirmed') ||
    lower.includes('putlead') ||
    lower.includes('<islead>true</islead>')
  ) {
    return 'request';
  }
  if (lower.includes('putconfirmedreservation')) return 'confirmed';
  return null;
}

/**
 * Classify one `<Reservation>` block in the context of its envelope. The block has no
 * envelope name, so the envelope's intent (cancel / modify / unconfirmed) always wins;
 * the block's StatusID only refines a classification within the same family.
 */
export function classifyRuNotificationBlock(
  envelopeXml: string,
  blockXml: string,
  statusId: string | null,
): RuNotificationKind {
  const envelope = detectRuEnvelopeKind(envelopeXml);
  if (envelope === 'cancelled' || envelope === 'modified') return envelope;
  if (envelope) {
    // Re-run the full classifier with the envelope name in scope.
    return classifyRuNotification(`${envelope === 'request' ? 'putunconfirmedreservation' : 'putconfirmedreservation'} ${blockXml}`, statusId);
  }
  return classifyRuNotification(blockXml, statusId);
}


/**
 * Nightly safety net: release any stamped channel night whose booking is cancelled, released or
 * gone. Operator blocks carry no stamp and are never touched.
 */
export async function sweepStrandedChannelBlocks(supabase: Db, logPrefix = '[ru]'): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('property_availability')
      .select('id, blocked_reason')
      .eq('is_stop_sell', true)
      .like('blocked_reason', 'channel_booking:%')
      .limit(5000);
    if (error) {
      console.error(`${logPrefix} Stranded block scan failed: ${error.message}`);
      return 0;
    }
    const rows = (data || []) as Array<{ id: string; blocked_reason: string }>;
    if (rows.length === 0) return 0;

    const bookingIds = [...new Set(rows.map((r) => r.blocked_reason.split(':')[1]).filter(Boolean))];
    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, status, hold_released_at')
      .in('id', bookingIds);
    const live = new Set(
      ((bookings || []) as Array<{ id: string; status: string | null; hold_released_at: string | null }>)
        .filter((b) => b.status !== 'cancelled' && !b.hold_released_at)
        .map((b) => b.id),
    );

    const strandedIds = rows
      .filter((r) => !live.has(r.blocked_reason.split(':')[1] ?? ''))
      .map((r) => r.id);
    if (strandedIds.length === 0) return 0;

    const { error: upErr } = await supabase
      .from('property_availability')
      .update({
        available_units: 1,
        is_stop_sell: false,
        blocked_by: null,
        blocked_by_label: null,
        blocked_reason: null,
        blocked_at: null,
      })
      .in('id', strandedIds);
    if (upErr) {
      console.error(`${logPrefix} Stranded block release failed: ${upErr.message}`);
      return 0;
    }
    console.log(`${logPrefix} Released ${strandedIds.length} stranded channel night(s)`);
    return strandedIds.length;
  } catch (e) {
    console.error(`${logPrefix} Stranded block sweep error:`, e);
    return 0;
  }
}
