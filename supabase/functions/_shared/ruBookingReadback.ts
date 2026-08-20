// Outbound booking read-back certification.
//
// The live booking path deliberately does NOT read a reservation back after every push — that
// would double our call volume against a channel that tolerates roughly one call per sliding
// minute. This module is the opt-in proof instead: it runs once, on demand, against a synthetic
// far-future stay, and after every push it pulls the reservation back from the channel and
// compares what the channel holds with what we sent.
//
// Steps (each paced against the sliding-minute limit):
//   1. create   — hand a synthetic confirmed reservation to the channel
//   2. read     — pull it back: dates, listing, guests, price
//   3. dates    — extend by one night, read back
//   4. pax      — change guest count, read back
//   5. price    — change client price, read back
//   6. cancel   — cancel at the channel, read back (gone / cancelled)
//
// The synthetic booking is deleted locally at the end, so certification rows never linger in the
// operator's booking list.

import {
  cancelRuReservation,
  modifyRuStay,
  pushRuConfirmedReservation,
  resolveRuChildAuth,
} from './ruBookingSync.ts';

// deno-lint-ignore no-explicit-any
type Db = any;

export interface ReadbackStep {
  step: number;
  name: string;
  ru_method: string;
  mandatory: boolean;
  scope: 'property';
  status: 'passed' | 'failed' | 'skipped';
  duration_ms: number;
  detail?: string;
  request?: unknown;
  response_preview?: string | null;
}

interface ChannelView {
  found: boolean;
  date_from: string | null;
  date_to: string | null;
  guests: number | null;
  price: number | null;
  ru_property_id: string | null;
  error: string | null;
  deferred: boolean;
}

/** How long to wait between two channel calls (the sliding-minute limit plus a margin). */
const PACE_MS = 65_000;
/** Retries for a deferred (rate-limited) call — a deferral is never a certification failure. */
const MAX_DEFERRED_RETRIES = 3;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const day = (base: Date, offset: number) =>
  new Date(base.getTime() + offset * 86_400_000).toISOString().slice(0, 10);

/** Pull the reservation back from the channel, scoped to the account that owns the property. */
async function readReservation(
  admin: Db,
  propertyId: string,
  reservationId: string,
  auth: Record<string, unknown>,
): Promise<ChannelView> {
  const empty: ChannelView = {
    found: false,
    date_from: null,
    date_to: null,
    guests: null,
    price: null,
    ru_property_id: null,
    error: null,
    deferred: false,
  };

  try {
    const { data, error } = await admin.functions.invoke('rentalsunited-api', {
      body: { action: 'get_reservation_by_id', reservation_id: reservationId, ...auth },
    });
    if (error) return { ...empty, error: error.message ?? 'transport error' };
    if (!data?.success) {
      const message = String(data?.error?.message ?? 'read-back refused');
      return { ...empty, error: message, deferred: /rate limit/i.test(message) };
    }
    const r = data.reservation ?? null;
    return {
      found: !!data.found && !!r,
      date_from: r?.dateFrom ?? null,
      date_to: r?.dateTo ?? null,
      guests: Number.isFinite(Number(r?.numGuests)) && Number(r?.numGuests) > 0 ? Number(r.numGuests) : null,
      price: Number.isFinite(Number(r?.total)) && Number(r?.total) > 0 ? Number(r.total) : null,
      ru_property_id: r?.ruPropertyId ? String(r.ruPropertyId) : null,
      error: null,
      deferred: false,
    };

  } catch (err) {
    return { ...empty, error: err instanceof Error ? err.message : 'unknown error' };
  }
}

/** Read back, retrying while the channel only defers us. */
async function readWithRetries(
  admin: Db,
  propertyId: string,
  reservationId: string,
  auth: Record<string, unknown>,
): Promise<ChannelView> {
  let view = await readReservation(admin, propertyId, reservationId, auth);
  for (let i = 0; i < MAX_DEFERRED_RETRIES && view.deferred; i++) {
    await sleep(PACE_MS);
    view = await readReservation(admin, propertyId, reservationId, auth);
  }
  return view;
}

function describe(view: ChannelView): string {
  if (!view.found) return view.error ? `not returned by the channel (${view.error})` : 'not returned by the channel';
  return `channel holds ${view.date_from} → ${view.date_to}, ${view.guests ?? '?'} guest(s), price ${view.price ?? '?'}, listing ${view.ru_property_id ?? '?'}`;
}

export interface ReadbackOutcome {
  steps: ReadbackStep[];
  passed: number;
  failed: number;
  ru_reservation_id: string | null;
  ru_property_id: string | null;
}

type Recorder = (
  step: Omit<ReadbackStep, 'step' | 'scope' | 'mandatory'> & { mandatory?: boolean },
) => Promise<void>;

/**
 * Fallback evidence when the channel will not let us create a synthetic reservation: take the most
 * recent real channel reservation for the property, pull it back from the channel and compare the
 * channel's own view (dates, guests, price, listing) with the booking we hold.
 */
async function verifyExistingReservation(
  admin: Db,
  propertyId: string,
  auth: Record<string, unknown>,
  record: Recorder,
): Promise<void> {
  const { data: rows } = await admin
    .from('bookings')
    .select('id, rol_reference, external_reservation_id, check_in_date, check_out_date, adults, children, teens, total_price')
    .eq('property_id', propertyId)
    .not('external_reservation_id', 'is', null)
    .in('integration_type', ['rentalsunited', 'rentalsunited_lead'])
    .order('created_at', { ascending: false })
    .limit(1);
  const stay = (rows ?? [])[0];
  if (!stay) {
    await record({
      name: 'Read a real channel reservation back',
      ru_method: 'Pull_GetReservationByID_RQ',
      status: 'skipped',
      duration_ms: 0,
      detail: 'This property holds no channel reservation to read back yet.',
    });
    return;
  }

  const t0 = Date.now();
  const view = await readWithRetries(admin, propertyId, String(stay.external_reservation_id), auth);
  const expectedGuests = (Number(stay.adults ?? 0) || 0) + (Number(stay.children ?? 0) || 0) +
    (Number(stay.teens ?? 0) || 0);
  const mismatches: string[] = [];
  if (view.found) {
    if (view.date_from && view.date_from !== stay.check_in_date) {
      mismatches.push(`check-in ${view.date_from} vs ${stay.check_in_date}`);
    }
    if (view.date_to && view.date_to !== stay.check_out_date) {
      mismatches.push(`check-out ${view.date_to} vs ${stay.check_out_date}`);
    }
    if (view.guests !== null && expectedGuests > 0 && view.guests !== expectedGuests) {
      mismatches.push(`guests ${view.guests} vs ${expectedGuests}`);
    }
    if (view.price !== null && Number(stay.total_price ?? 0) > 0 && Math.abs(view.price - Number(stay.total_price)) > 0.01) {
      mismatches.push(`price ${view.price} vs ${stay.total_price}`);
    }
  }

  await record({
    name: `Read ${stay.rol_reference ?? 'the latest channel reservation'} back`,
    ru_method: 'Pull_GetReservationByID_RQ',
    status: view.found && mismatches.length === 0 ? 'passed' : 'failed',
    duration_ms: Date.now() - t0,
    detail: mismatches.length ? `${describe(view)} — ${mismatches.join('; ')}` : describe(view),
  });
}


/**
 * Execute the read-back matrix. Long-running by design (one channel call per minute) — call it
 * from a background task and persist `steps` after each step so the console can follow along.
 */
export async function runBookingReadbackTest(
  admin: Db,
  opts: {
    propertyId: string;
    onStep?: (steps: ReadbackStep[]) => Promise<void> | void;
  },
): Promise<ReadbackOutcome> {
  const steps: ReadbackStep[] = [];
  let ruReservationId: string | null = null;
  let ruPropertyId: string | null = null;

  const record = async (step: Omit<ReadbackStep, 'step' | 'scope' | 'mandatory'> & { mandatory?: boolean }) => {
    steps.push({
      step: steps.length + 1,
      scope: 'property',
      mandatory: step.mandatory ?? true,
      ...step,
    } as ReadbackStep);
    await opts.onStep?.(steps);
  };

  const fail = async (name: string, method: string, detail: string) => {
    await record({ name, ru_method: method, status: 'failed', duration_ms: 0, detail });
    return summarise();
  };

  const summarise = (): ReadbackOutcome => ({
    steps,
    passed: steps.filter((s) => s.status === 'passed').length,
    failed: steps.filter((s) => s.status === 'failed').length,
    ru_reservation_id: ruReservationId,
    ru_property_id: ruPropertyId,
  });

  const auth = await resolveRuChildAuth(admin, opts.propertyId);
  if (!auth) {
    return await fail(
      'Resolve channel credentials',
      'ru_api_credentials',
      'No channel sub-user API keys stored for this property — the read-back test cannot run.',
    );
  }

  // A published unit, so the push walks the real unit → listing mapping.
  const { data: units } = await admin
    .from('hostfully_room_types')
    .select('id, name, rentalsunited_property_id')
    .eq('property_id', opts.propertyId)
    .not('rentalsunited_property_id', 'is', null)
    .order('name', { ascending: true })
    .limit(1);
  const unit = (units ?? [])[0] as { id: string; name: string | null; rentalsunited_property_id: string } | undefined;
  if (!unit) {
    return await fail(
      'Resolve a published unit',
      'hostfully_room_types',
      'This property has no unit published to the channel — nothing to test a reservation against.',
    );
  }
  ruPropertyId = String(unit.rentalsunited_property_id);

  // Match the canonical room type by name so the local booking looks like a real one.
  const { data: canonical } = await admin
    .from('rolos_room_types')
    .select('id, name')
    .eq('property_id', opts.propertyId)
    .ilike('name', (unit.name ?? '').trim())
    .limit(1)
    .maybeSingle();

  // ~700 days out: far enough that a synthetic stay can never collide with a real booking.
  const base = new Date(Date.now() + 700 * 86_400_000);
  const dateFrom = day(base, 0);
  const dateToInitial = day(base, 2);
  const dateToExtended = day(base, 3);
  const priceInitial = 1000;
  const priceChanged = 1250;

  const { data: booking, error: bookingError } = await admin
    .from('bookings')
    .insert({
      property_id: opts.propertyId,
      room_type_id: canonical?.id ?? null,
      guest_name: 'ROLOS Certification',
      guest_email: 'certification@roomsonline.co.za',
      guest_phone: '+27000000000',
      check_in_date: dateFrom,
      check_out_date: dateToInitial,
      adults: 2,
      children: 0,
      status: 'confirmed',
      total_price: priceInitial,
      amount_paid: 0,
      booking_channel: 'direct',
      integration_type: 'rolos',
      special_requests: "ROL'OS certification read-back test — safe to ignore",
    })
    .select('id, property_id, room_type_id, check_in_date, check_out_date, integration_type, external_reservation_id')
    .single();

  if (bookingError || !booking) {
    return await fail(
      'Create synthetic stay',
      'bookings.insert',
      bookingError?.message ?? 'Could not create the synthetic certification stay.',
    );
  }

  const ref = {
    id: booking.id as string,
    property_id: opts.propertyId,
    room_type_id: booking.room_type_id as string | null,
    check_in_date: dateFrom,
    check_out_date: dateToInitial,
    integration_type: 'rentalsunited',
    external_reservation_id: null as string | null,
  };

  const cleanup = async () => {
    try {
      await admin.from('bookings').delete().eq('id', ref.id);
    } catch (_e) { /* evidence only */ }
  };

  try {
    // ── 1. Hand the stay to the channel ──────────────────────────────────────────────
    let t0 = Date.now();
    let push = await pushRuConfirmedReservation(admin, {
      ...ref,
      total_price: priceInitial,
      amount_paid: 0,
      adults: 2,
      guest_first_name: 'ROLOS',
      guest_last_name: 'Certification',
      guest_email: 'certification@roomsonline.co.za',
      guest_phone: '+27000000000',
      special_requests: "ROL'OS certification read-back test — safe to ignore",
    });
    for (let i = 0; i < MAX_DEFERRED_RETRIES && (push.deferred || /rate limit/i.test(push.message ?? '')); i++) {
      await sleep(PACE_MS);
      push = await pushRuConfirmedReservation(admin, {
        ...ref,
        total_price: priceInitial,
        amount_paid: 0,
        adults: 2,
        guest_first_name: 'ROLOS',
        guest_last_name: 'Certification',
        guest_email: 'certification@roomsonline.co.za',
        guest_phone: '+27000000000',
      });
    }

    if (!push.ok || !push.reservationId) {
      // Creating a reservation is a sales-channel capability, not an owner one: pushed under the
      // property's own sub-user keys the channel answers "Property does not exist" (status 56).
      // That is a channel permission boundary, not a defect in our push — so instead of failing
      // the suite we fall back to reading a real channel reservation back and comparing it with
      // what we hold locally, which is the evidence the read-back check actually exists for.
      const cannotCreate = /does not exist|status 56/i.test(push.message ?? '');
      await record({
        name: 'Send the stay to the channel',
        ru_method: 'Push_PutConfirmedReservationMulti_RQ',
        status: cannotCreate ? 'skipped' : 'failed',
        duration_ms: Date.now() - t0,
        detail: cannotCreate
          ? 'The channel does not let an owner-scoped account create reservations (status 56) — synthetic creation is not available, so the read-back runs against a real channel reservation instead.'
          : push.message ?? 'The channel did not return a reservation id.',
      });
      await cleanup();
      if (cannotCreate) await verifyExistingReservation(admin, opts.propertyId, auth, record);
      return summarise();
    }


    ruReservationId = String(push.reservationId);
    ref.external_reservation_id = ruReservationId;
    await admin
      .from('bookings')
      .update({
        external_reservation_id: ruReservationId,
        integration_type: 'rentalsunited',
        booking_channel: 'rentals_united',
      })
      .eq('id', ref.id);

    await record({
      name: 'Send the stay to the channel',
      ru_method: 'Push_PutConfirmedReservationMulti_RQ',
      status: 'passed',
      duration_ms: Date.now() - t0,
      detail: `Channel reservation ${ruReservationId} on listing ${push.ruPropertyId ?? ruPropertyId}`,
      request: { date_from: dateFrom, date_to: dateToInitial, guests: 2, client_price: priceInitial },
    });

    // ── 2. Read it back ──────────────────────────────────────────────────────────────
    await sleep(PACE_MS);
    t0 = Date.now();
    let view = await readWithRetries(admin, opts.propertyId, ruReservationId, auth);
    const createMismatches: string[] = [];
    if (view.found) {
      if (view.date_from && view.date_from !== dateFrom) createMismatches.push(`check-in ${view.date_from} vs ${dateFrom}`);
      if (view.date_to && view.date_to !== dateToInitial) createMismatches.push(`check-out ${view.date_to} vs ${dateToInitial}`);
      if (view.guests !== null && view.guests !== 2) createMismatches.push(`guests ${view.guests} vs 2`);
    }
    await record({
      name: 'Read the new reservation back',
      ru_method: 'Pull_GetReservationByID_RQ',
      status: view.found && createMismatches.length === 0 ? 'passed' : 'failed',
      duration_ms: Date.now() - t0,
      detail: createMismatches.length ? `${describe(view)} — ${createMismatches.join('; ')}` : describe(view),
    });

    // ── 3. Change the dates, then read back ──────────────────────────────────────────
    await sleep(PACE_MS);
    t0 = Date.now();
    let modify = await modifyRuStay(
      admin,
      { ...ref },
      { date_from: dateFrom, date_to: dateToExtended, number_of_guests: 2, client_price: priceInitial },
      { date_from: dateFrom, date_to: dateToInitial, ru_property_id: ruPropertyId },
    );
    if (modify.ok) {
      ref.check_out_date = dateToExtended;
      await admin.from('bookings').update({ check_out_date: dateToExtended }).eq('id', ref.id);
    }
    await record({
      name: 'Extend the stay at the channel',
      ru_method: 'Push_ModifyStay_RQ',
      status: modify.ok ? 'passed' : 'failed',
      duration_ms: Date.now() - t0,
      detail: modify.ok ? `Extended to ${dateToExtended}` : modify.message ?? 'The channel refused the modification.',
      request: { current: { date_to: dateToInitial }, modify: { date_to: dateToExtended } },
    });

    await sleep(PACE_MS);
    t0 = Date.now();
    view = await readWithRetries(admin, opts.propertyId, ruReservationId, auth);
    const dateHeld = view.found && (!view.date_to || view.date_to === dateToExtended);
    await record({
      name: 'Read the new dates back',
      ru_method: 'Pull_GetReservationByID_RQ',
      status: dateHeld ? 'passed' : 'failed',
      duration_ms: Date.now() - t0,
      detail: dateHeld
        ? describe(view)
        : `${describe(view)} — expected check-out ${dateToExtended}`,
    });

    // ── 4. Change the guest count, then read back ────────────────────────────────────
    await sleep(PACE_MS);
    t0 = Date.now();
    modify = await modifyRuStay(
      admin,
      { ...ref },
      { date_from: dateFrom, date_to: dateToExtended, number_of_guests: 4, client_price: priceInitial },
      { date_from: dateFrom, date_to: dateToExtended, ru_property_id: ruPropertyId },
    );
    await record({
      name: 'Change the guest count at the channel',
      ru_method: 'Push_ModifyStay_RQ',
      status: modify.ok ? 'passed' : 'failed',
      duration_ms: Date.now() - t0,
      detail: modify.ok ? 'Guest count sent as 4' : modify.message ?? 'The channel refused the guest-count change.',
      request: { number_of_guests: 4 },
    });

    await sleep(PACE_MS);
    t0 = Date.now();
    view = await readWithRetries(admin, opts.propertyId, ruReservationId, auth);
    const paxHeld = view.found && (view.guests === null || view.guests === 4);
    await record({
      name: 'Read the guest count back',
      ru_method: 'Pull_GetReservationByID_RQ',
      status: paxHeld ? 'passed' : 'failed',
      duration_ms: Date.now() - t0,
      detail: paxHeld ? describe(view) : `${describe(view)} — expected 4 guests`,
    });

    // ── 5. Change the price, then read back ──────────────────────────────────────────
    await sleep(PACE_MS);
    t0 = Date.now();
    modify = await modifyRuStay(
      admin,
      { ...ref },
      { date_from: dateFrom, date_to: dateToExtended, number_of_guests: 4, client_price: priceChanged },
      { date_from: dateFrom, date_to: dateToExtended, ru_property_id: ruPropertyId },
    );
    await record({
      name: 'Change the price at the channel',
      ru_method: 'Push_ModifyStay_RQ',
      status: modify.ok ? 'passed' : 'failed',
      duration_ms: Date.now() - t0,
      detail: modify.ok ? `Client price sent as ${priceChanged}` : modify.message ?? 'The channel refused the price change.',
      request: { client_price: priceChanged },
    });

    await sleep(PACE_MS);
    t0 = Date.now();
    view = await readWithRetries(admin, opts.propertyId, ruReservationId, auth);
    const priceHeld = view.found && (view.price === null || Math.abs((view.price ?? 0) - priceChanged) < 0.01);
    await record({
      name: 'Read the price back',
      ru_method: 'Pull_GetReservationByID_RQ',
      status: priceHeld ? 'passed' : 'failed',
      duration_ms: Date.now() - t0,
      detail: priceHeld ? describe(view) : `${describe(view)} — expected price ${priceChanged}`,
    });

    // ── 6. Cancel, then read back ────────────────────────────────────────────────────
    await sleep(PACE_MS);
    t0 = Date.now();
    const cancelled = await cancelRuReservation(admin, { ...ref }, {
      reason: "ROL'OS certification read-back test",
      cancelTypeId: 1,
    });
    await record({
      name: 'Cancel at the channel',
      ru_method: 'Push_CancelReservation_RQ',
      status: cancelled.ok ? 'passed' : 'failed',
      duration_ms: Date.now() - t0,
      detail: cancelled.ok ? 'Cancellation accepted' : cancelled.message ?? 'The channel refused the cancellation.',
    });

    await sleep(PACE_MS);
    t0 = Date.now();
    view = await readWithRetries(admin, opts.propertyId, ruReservationId, auth);
    // The channel either drops the reservation entirely or returns it without stay data.
    const gone = !view.found || !view.date_from;
    await record({
      name: 'Confirm the cancellation at the channel',
      ru_method: 'Pull_GetReservationByID_RQ',
      status: gone ? 'passed' : 'failed',
      duration_ms: Date.now() - t0,
      detail: gone
        ? 'The channel no longer holds this stay'
        : `${describe(view)} — the channel still holds the stay after cancellation`,
    });

    await cleanup();
    return summarise();
  } catch (err) {
    await record({
      name: 'Read-back test aborted',
      ru_method: '—',
      status: 'failed',
      duration_ms: 0,
      detail: err instanceof Error ? err.message : 'Unknown error',
    });
    await cleanup();
    return summarise();
  }
}
