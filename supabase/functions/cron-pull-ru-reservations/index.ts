import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { resolveRuOwnerScopes, type RuOwnerScope } from '../_shared/ruOwnerScopes.ts';

/**
 * Cron job: Pull reservations from Rentals United every 30 minutes.
 * Safety net alongside RLNM — catches missed push notifications.
 * Queries the last 90 days of reservations via Pull_ListReservations_RQ (RU filters on the
 * reservation CREATION date, so a short window silently drops bookings taken earlier).
 * Confirmed reservations also block the booked nights in `property_availability` so the ROL
 * booking engine cannot resell a night a channel already sold; cancellations release them.
 *
 * Credentials: Pull_ListReservations_RQ / Pull_GetLeads_RQ are ACCOUNT-scoped —
 * a white-label sub-user's bookings never appear in the master account's answer.
 * The run therefore fans out over master + every sub-user with API keys, paced
 * for RU's 1-call-per-method-per-sliding-minute limit.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** RU rate limit: one call per method per sliding minute (+1s safety). */
const METHOD_WINDOW_MS = 61_000;
/** How far back to ask RU for reservations (RU filters on the reservation creation date). */
const PULL_WINDOW_DAYS = 90;
/** How long an unconfirmed RU lead holds the dates before availability is released. */
const LEAD_HOLD_DAYS = 3;
/** Wall-clock budget for the whole run; remaining accounts roll into the next run. */
const RUN_BUDGET_MS = 6 * 60_000;

function extractTag(xml: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}>([^<]*)</${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : null;
}

function extractAllBlocks(xml: string, tag: string): string[] {
  const regex = new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'gi');
  return xml.match(regex) || [];
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const supabase = createClient(supabaseUrl, supabaseKey);

  const summary = { total: 0, created: 0, updated: 0, cancelled: 0, skipped: 0, failed: 0, unmatched: 0, leads_found: 0, leads_logged: 0, leads_held: 0 };
  const cronStartedAt = Date.now();
  const deadline = cronStartedAt + RUN_BUDGET_MS;

  // Cadence evidence for the RU certification console (Pull_ListReservations_RQ),
  // logged per account so staleness rotation can order the next run.
  const logCadence = async (
    success: boolean,
    errorMessage: string | null,
    scope: RuOwnerScope,
    extra: Record<string, unknown> = {},
  ) => {
    await supabase.from('ru_sync_runs').insert({
      batch_id: crypto.randomUUID(),
      action: 'pull_reservations',
      success,
      error_message: errorMessage,
      elapsed_ms: Date.now() - cronStartedAt,
      details: {
        ...summary,
        ...extra,
        scope: 'reservation_poll',
        ru_owner_id: scope.ownerId,
        account: scope.label,
      },
    }).then(() => {}, (e) => console.warn('[cron-pull-ru] log insert failed', e));
  };

  try {
    // Date range: last PULL_WINDOW_DAYS days → today (RU filters on creation date)
    const now = new Date();
    const windowStart = new Date(now);
    windowStart.setDate(now.getDate() - PULL_WINDOW_DAYS);
    const dateTo = formatDate(now);
    const dateFrom = formatDate(windowStart);

    const scopes = await resolveRuOwnerScopes(supabase, 'pull_reservations');
    const covered: string[] = [];
    const deferred: string[] = [];

    for (let i = 0; i < scopes.length; i++) {
      const scope = scopes[i];
      if (i > 0) {
        // Same RU method as the previous account → respect the sliding-minute window.
        if (Date.now() + METHOD_WINDOW_MS > deadline) {
          deferred.push(...scopes.slice(i).map((s) => s.label));
          console.log(`[cron-pull-ru] Budget spent — deferring ${deferred.length} account(s) to the next run`);
          break;
        }
        await new Promise((r) => setTimeout(r, METHOD_WINDOW_MS));
      }

      console.log(`[cron-pull-ru] Polling ${scope.label}: reservations ${dateFrom} → ${dateTo}`);
      const { data: ruResult, error: ruErr } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action: 'list_reservations', date_from: dateFrom, date_to: dateTo, ...scope.payload },
      });

      if (ruErr || !ruResult?.success) {
        const msg = ruErr?.message || ruResult?.error?.message || 'Unknown error';
        console.error(`[cron-pull-ru] ${scope.label} API call failed: ${msg}`);
        await logCadence(false, msg, scope);
        continue;
      }

      if (scope.ownerId && ruResult.auth_mode === 'master') {
        const msg = `Refused: RU answered on MASTER credentials for ${scope.label}. Add this sub-user's RU AccessKey/SecretKey before its reservations can be polled.`;
        console.error(`[cron-pull-ru] ${msg}`);
        await logCadence(false, msg, scope);
        continue;
      }

      covered.push(scope.label);
      const rawXml: string = ruResult.raw_xml || '';
      if (!rawXml || rawXml.length < 50) {
        console.log(`[cron-pull-ru] ${scope.label}: no reservations XML returned`);
        await logCadence(true, null, scope, { reservations: 0 });
        continue;
      }
      await processReservations(rawXml, scope);
      await logCadence(true, null, scope);
    }

    // ── Phase 2: Leads (same fan-out, best effort within the remaining budget) ──
    await pollLeads(scopes, dateFrom, dateTo);

    console.log(`[cron-pull-ru] Done. Summary:`, JSON.stringify(summary));
    return new Response(JSON.stringify({ success: true, summary, accounts_polled: covered, accounts_deferred: deferred }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[cron-pull-ru] Fatal error:', error);
    await logCadence(false, String(error), { ownerId: null, label: 'master', payload: {} });
    return new Response(JSON.stringify({ success: false, error: String(error), summary }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * Mirror a channel reservation into `property_availability` so the ROL booking engine and
   * every other channel push see the night as sold. Keys match the manual-block convention
   * used by push-booking: room_type = unit NAME, external_system = 'manual'.
   */
  async function applyAvailabilityBlock(
    propertyId: string,
    roomTypeId: string | null,
    checkIn: string,
    checkOut: string,
    block: boolean,
  ) {
    try {
      let roomName: string | null = null;
      if (roomTypeId) {
        const { data: rt } = await supabase
          .from('hostfully_room_types')
          .select('name')
          .eq('id', roomTypeId)
          .maybeSingle();
        roomName = rt?.name ?? null;
      }
      if (!roomName) {
        console.warn(`[cron-pull-ru] No unit name resolved — skipping availability ${block ? 'block' : 'release'}`);
        return;
      }

      const dates: string[] = [];
      for (let d = new Date(`${checkIn}T00:00:00Z`); d < new Date(`${checkOut}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
        dates.push(d.toISOString().slice(0, 10));
      }
      if (dates.length === 0) return;

      const rows = dates.map((date) => ({
        property_id: propertyId,
        room_type: roomName,
        date,
        external_system: 'manual',
        available_units: block ? 0 : 1,
        is_stop_sell: block,
      }));

      const { error } = await supabase
        .from('property_availability')
        .upsert(rows, { onConflict: 'property_id,room_type,date,external_system', ignoreDuplicates: false });
      if (error) {
        console.error(`[cron-pull-ru] Availability ${block ? 'block' : 'release'} failed: ${error.message}`);
      } else {
        console.log(`[cron-pull-ru] ${block ? 'Blocked' : 'Released'} ${rows.length} night(s) for ${roomName}`);
      }
    } catch (e) {
      console.error('[cron-pull-ru] Availability sync error:', e);
    }
  }

  /** First matching block for a tag (RU nests StayInfo / CustomerInfo). */
  function extractBlock(xml: string, tag: string): string {
    const m = xml.match(new RegExp(`<${tag}[^>]*>[\\s\\S]*?</${tag}>`, 'i'));
    return m ? m[0] : '';
  }

  /**
   * Resolve an RU PropertyID to the property + the room type the ROLOS dashboard renders.
   * The RU mapping lives on `hostfully_room_types`, but ROL'OS-native properties draw their
   * calendar rows from `rolos_room_types`; without this name-based hop the imported booking
   * never matches a displayed unit.
   */
  async function resolveUnit(ruPropertyId: string | null): Promise<{
    propertyId: string | null;
    roomTypeId: string | null;
    mappingRoomTypeId: string | null;
    unitName: string | null;
  }> {
    if (!ruPropertyId) return { propertyId: null, roomTypeId: null, mappingRoomTypeId: null, unitName: null };

    const { data: mapping } = await supabase
      .from('hostfully_room_types')
      .select('id, name, property_id')
      .eq('rentalsunited_property_id', ruPropertyId)
      .order('is_active', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (mapping?.property_id) {
      let canonicalId: string | null = null;
      if (mapping.name) {
        const { data: canonical } = await supabase
          .from('rolos_room_types')
          .select('id, name')
          .eq('property_id', mapping.property_id);
        canonicalId = (canonical || []).find(
          (rt) => (rt.name || '').trim().toLowerCase() === (mapping.name || '').trim().toLowerCase(),
        )?.id ?? null;
      }
      return {
        propertyId: mapping.property_id,
        roomTypeId: canonicalId || mapping.id,
        mappingRoomTypeId: mapping.id,
        unitName: mapping.name ?? null,
      };
    }

    const { data: prop } = await supabase
      .from('properties')
      .select('id')
      .eq('rentalsunited_property_id', ruPropertyId)
      .limit(1)
      .maybeSingle();
    return { propertyId: prop?.id ?? null, roomTypeId: null, mappingRoomTypeId: null, unitName: null };
  }

  /** Parse one RU <Reservation> block into the ROL'OS booking shape. */
  function parseReservation(block: string) {
    const stay = extractBlock(block, 'StayInfo') || block;
    const customer = extractBlock(block, 'CustomerInfo') || block;
    const costs = extractBlock(stay, 'Costs');

    const firstName = extractTag(customer, 'Name') || extractTag(customer, 'FirstName') || '';
    const lastName = extractTag(customer, 'SurName') || extractTag(customer, 'LastName') || '';
    const guestName = `${firstName} ${lastName}`.trim();

    const nightly = [...stay.matchAll(/<DayPrices\s+Date="([^"]+)"[^>]*>([\s\S]*?)<\/DayPrices>/gi)].map((m) => ({
      date: m[1],
      price: parseFloat(extractTag(m[2], 'Price') || extractTag(m[2], 'Rent') || '0'),
    }));

    const total = parseFloat(extractTag(costs, 'ClientPrice') || extractTag(costs, 'RUPrice') || extractTag(block, 'RUPrice') || '0');
    const alreadyPaid = parseFloat(extractTag(costs, 'AlreadyPaid') || '0');

    return {
      ruReservationId: extractTag(block, 'ReservationID'),
      statusId: extractTag(block, 'StatusID') || extractTag(block, 'Status'),
      ruPropertyId: extractTag(stay, 'PropertyID') || extractTag(block, 'PropID') || extractTag(block, 'PropertyID'),
      dateFrom: extractTag(stay, 'DateFrom'),
      dateTo: extractTag(stay, 'DateTo'),
      arrivalTime: extractTag(stay, 'ArrivalTime'),
      numGuests: parseInt(extractTag(stay, 'NumberOfGuests') || '1', 10),
      units: parseInt(extractTag(stay, 'Units') || '1', 10),
      guestName: guestName || 'RU Guest',
      guestEmail: extractTag(customer, 'Email') || 'ru-poll@rentalsunited.com',
      guestPhone: extractTag(customer, 'MobilePhone') || extractTag(customer, 'Phone') || null,
      countryId: extractTag(customer, 'CountryID') || null,
      address: extractTag(customer, 'Address') || null,
      zipCode: extractTag(customer, 'ZipCode') || null,
      comments: extractTag(stay, 'Comments') || extractTag(block, 'Comments') || null,
      resapaId: extractTag(stay, 'ResapaID') || null,
      creator: extractTag(block, 'Creator') || null,
      createdDate: extractTag(block, 'CreatedDate') || extractTag(block, 'LastMod') || null,
      total,
      alreadyPaid,
      nightly,
    };
  }

  type ParsedReservation = ReturnType<typeof parseReservation>;

  /** Channel metadata kept in `modification_notes` (no dedicated columns exist). */
  function buildChannelNotes(r: ParsedReservation, extra: Record<string, unknown> = {}) {
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
      guest_comments: r.comments,
      amount_already_paid: r.alreadyPaid,
      nightly_prices: r.nightly,
      synced_at: new Date().toISOString(),
      ...extra,
    };
  }

  /** Parse + upsert every <Reservation> block returned for one RU account. */
  async function processReservations(rawXml: string, scope: RuOwnerScope) {
    // Extract all <Reservation> blocks
    const reservationBlocks = extractAllBlocks(rawXml, 'Reservation');
    summary.total += reservationBlocks.length;
    console.log(`[cron-pull-ru] ${scope.label}: found ${reservationBlocks.length} reservation(s)`);


    for (const block of reservationBlocks) {
      try {
        const r = parseReservation(block);
        const ruReservationId = r.ruReservationId;

        if (!ruReservationId) {
          console.warn('[cron-pull-ru] Skipping reservation without ID');
          summary.skipped++;
          continue;
        }

        // RU status: 1 = confirmed, 2 = modified, 4 = cancelled.
        // Anything else is an unconfirmed request — it must still block the dates as a hold.
        const isCancelled = r.statusId === '4';
        const isConfirmed = r.statusId === '1' || r.statusId === '2';
        const isRequest = !isCancelled && !isConfirmed;

        // Resolve RU property ID to internal property / displayed unit
        const unit = await resolveUnit(r.ruPropertyId);
        const propertyId = unit.propertyId;
        const roomTypeId = unit.roomTypeId;

        if (!propertyId) {
          console.warn(`[cron-pull-ru] No matching property for RU PropID ${r.ruPropertyId}, reservation ${ruReservationId}`);
          summary.unmatched++;
          // Still log to ru_notifications
          await supabase.from('ru_notifications').insert({
            event_type: `poll_${isCancelled ? 'reservation_cancelled' : isRequest ? 'reservation_request' : 'reservation_confirmed'}`,
            ru_reservation_id: ruReservationId,
            ru_property_id: r.ruPropertyId,
            property_id: null,
            raw_xml: block,
            processed: false,
          });
          continue;
        }

        // Check if booking already exists (a request that later confirms keeps the same RU id)
        const { data: existing } = await supabase
          .from('bookings')
          .select('id, status, integration_type')
          .eq('external_reservation_id', ruReservationId)
          .in('integration_type', ['rentalsunited', 'rentalsunited_lead'])
          .limit(1)
          .maybeSingle();

        const guestFields: Record<string, unknown> = {
          guest_name: r.guestName,
          guest_email: r.guestEmail,
          guest_phone: r.guestPhone,
          adults: r.numGuests || 1,
          total_price: r.total || 0,
          modification_notes: buildChannelNotes(r),
        };
        if (r.comments) guestFields.special_requests = r.comments;
        if (roomTypeId) guestFields.room_type_id = roomTypeId;
        if (r.dateFrom) guestFields.check_in_date = r.dateFrom;
        if (r.dateTo) guestFields.check_out_date = r.dateTo;

        if (isCancelled) {
          if (existing && existing.status !== 'cancelled') {
            await supabase
              .from('bookings')
              .update({ status: 'cancelled', cancellation_reason: 'Cancelled via Rentals United (poll sync)' })
              .eq('id', existing.id);
            summary.cancelled++;
            if (r.dateFrom && r.dateTo) {
              await applyAvailabilityBlock(propertyId, unit.mappingRoomTypeId, r.dateFrom, r.dateTo, false);
            }
            console.log(`[cron-pull-ru] ✅ Cancelled booking for RU reservation ${ruReservationId}`);
          } else {
            summary.skipped++;
          }
        } else if (isRequest) {
          // Unconfirmed request → provisional booking holding the dates for LEAD_HOLD_DAYS.
          const leadCreatedAt = r.createdDate ? new Date(r.createdDate.replace(' ', 'T') + 'Z') : new Date();
          const holdExpiresAt = new Date(leadCreatedAt.getTime() + LEAD_HOLD_DAYS * 86_400_000);

          if (!r.dateFrom || !r.dateTo) {
            summary.skipped++;
            continue;
          }

          if (existing) {
            await supabase.from('bookings').update(guestFields).eq('id', existing.id);
            summary.updated++;
          } else {
            const { error: reqErr } = await supabase.from('bookings').insert({
              ...guestFields,
              property_id: propertyId,
              status: 'pending',
              booking_channel: 'rentals_united',
              integration_type: 'rentalsunited_lead',
              external_reservation_id: ruReservationId,
              payment_status: 'pending',
              lead_created_at: leadCreatedAt.toISOString(),
              hold_expires_at: holdExpiresAt.toISOString(),
              special_requests:
                `Rentals United request — dates held until ${holdExpiresAt.toISOString().slice(0, 10)}` +
                (r.comments ? ` · ${r.comments}` : ''),
            });
            if (reqErr) {
              console.error(`[cron-pull-ru] Request booking insert failed for ${ruReservationId}: ${reqErr.message}`);
              summary.failed++;
            } else {
              summary.leads_held++;
              if (holdExpiresAt.getTime() > Date.now()) {
                await applyAvailabilityBlock(propertyId, unit.mappingRoomTypeId, r.dateFrom, r.dateTo, true);
              }
              console.log(`[cron-pull-ru] ✅ Held RU request ${ruReservationId} until ${holdExpiresAt.toISOString()}`);
            }
          }
        } else if (isConfirmed) {
          if (existing) {
            const updateData: Record<string, unknown> = { ...guestFields };
            // A request that has now been confirmed graduates to a real booking.
            updateData.status = 'confirmed';
            updateData.integration_type = 'rentalsunited';
            updateData.hold_expires_at = null;
            updateData.hold_released_at = null;
            if (r.alreadyPaid > 0) {
              updateData.payment_status = 'paid_externally';
              updateData.paid_at = new Date().toISOString();
            }

            await supabase.from('bookings').update(updateData).eq('id', existing.id);
            summary.updated++;
            if (r.dateFrom && r.dateTo) {
              await applyAvailabilityBlock(propertyId, unit.mappingRoomTypeId, r.dateFrom, r.dateTo, true);
            }
            console.log(`[cron-pull-ru] ✅ Updated booking for RU reservation ${ruReservationId}`);
          } else {
            // Create new booking
            if (!r.dateFrom || !r.dateTo) {
              console.warn(`[cron-pull-ru] Skipping reservation ${ruReservationId} — missing dates`);
              summary.skipped++;
              continue;
            }

            const bookingData: Record<string, unknown> = {
              ...guestFields,
              property_id: propertyId,
              status: 'confirmed',
              booking_channel: 'rentals_united',
              integration_type: 'rentalsunited',
              external_reservation_id: ruReservationId,
              payment_status: r.alreadyPaid > 0 ? 'paid_externally' : 'pending',
            };
            if (r.alreadyPaid > 0) bookingData.paid_at = new Date().toISOString();

            const { error: bookingErr } = await supabase.from('bookings').insert(bookingData);
            if (bookingErr) {
              console.error(`[cron-pull-ru] Failed to create booking for ${ruReservationId}: ${bookingErr.message}`);
              summary.failed++;
            } else {
              summary.created++;
              await applyAvailabilityBlock(propertyId, unit.mappingRoomTypeId, r.dateFrom, r.dateTo, true);
              console.log(`[cron-pull-ru] ✅ Created booking for RU reservation ${ruReservationId}`);
            }
          }
        }

        // Log to ru_notifications
        await supabase.from('ru_notifications').insert({
          event_type: `poll_${isCancelled ? 'reservation_cancelled' : isRequest ? 'reservation_request' : 'reservation_confirmed'}`,
          ru_reservation_id: ruReservationId,
          ru_property_id: r.ruPropertyId,
          property_id: propertyId,
          raw_xml: block,
          processed: true,
        });

      } catch (resErr) {
        console.error(`[cron-pull-ru] Error processing reservation:`, resErr);
        summary.failed++;
      }
    }

  }


  /**
   * Pull_GetLeads_RQ is also account-scoped, so it fans out the same way.
   * Leads are informational, so this stays best-effort inside the remaining budget.
   */
  async function pollLeads(scopes: RuOwnerScope[], dateFrom: string, dateTo: string) {
    for (let i = 0; i < scopes.length; i++) {
      const scope = scopes[i];
      try {
        if (i > 0) {
          if (Date.now() + METHOD_WINDOW_MS > deadline) {
            console.log(`[cron-pull-ru] Lead polling budget spent after ${i} account(s)`);
            return;
          }
          await new Promise((r) => setTimeout(r, METHOD_WINDOW_MS));
        }

        console.log(`[cron-pull-ru] Polling leads for ${scope.label} from ${dateFrom} to ${dateTo}`);
        const { data: leadsResult, error: leadsErr } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'get_leads', date_from: dateFrom, date_to: dateTo, ...scope.payload },
        });

        if (leadsErr || !leadsResult?.success) {
          console.warn(`[cron-pull-ru] ${scope.label} leads API call failed: ${leadsErr?.message || leadsResult?.error?.message || 'Unknown'}`);
          continue;
        }
        if (scope.ownerId && leadsResult.auth_mode === 'master') {
          console.error(`[cron-pull-ru] Refused leads for ${scope.label}: RU answered on master credentials`);
          continue;
        }

        const leadsXml: string = leadsResult.raw_xml || '';
        const leadBlocks = extractAllBlocks(leadsXml, 'Lead');
        summary.leads_found += leadBlocks.length;
        console.log(`[cron-pull-ru] ${scope.label}: found ${leadBlocks.length} lead(s)`);

        for (const leadBlock of leadBlocks) {
          try {
            const leadId = extractTag(leadBlock, 'LeadID') || extractTag(leadBlock, 'ReservationID');
            if (!leadId) continue;

            const ruPropertyId = extractTag(leadBlock, 'PropID') || extractTag(leadBlock, 'PropertyID');
            const guestFirstName = extractTag(leadBlock, 'FirstName') || extractTag(leadBlock, 'GuestName') || '';
            const guestLastName = extractTag(leadBlock, 'LastName') || extractTag(leadBlock, 'GuestSurname') || '';
            const guestName = `${guestFirstName} ${guestLastName}`.trim() || 'RU Lead';
            const guestEmail = extractTag(leadBlock, 'Email') || 'ru-lead@rentalsunited.com';
            const guestPhone = extractTag(leadBlock, 'Phone') || null;
            const leadFrom = extractTag(leadBlock, 'DateFrom');
            const leadTo = extractTag(leadBlock, 'DateTo');
            const numGuests = parseInt(extractTag(leadBlock, 'NumberOfGuests') || '1', 10);
            const leadPrice = parseFloat(extractTag(leadBlock, 'RUPrice') || extractTag(leadBlock, 'Price') || '0');
            const createdRaw =
              extractTag(leadBlock, 'DateCreated') ||
              extractTag(leadBlock, 'CreationDate') ||
              extractTag(leadBlock, 'DateRequested');
            const leadCreatedAt = createdRaw ? new Date(createdRaw.replace(' ', 'T')) : new Date();
            const holdExpiresAt = new Date(leadCreatedAt.getTime() + LEAD_HOLD_DAYS * 86_400_000);

            // Resolve property + unit
            let propertyId: string | null = null;
            let roomTypeId: string | null = null;
            if (ruPropertyId) {
              const { data: roomType } = await supabase
                .from('hostfully_room_types')
                .select('property_id, id')
                .eq('rentalsunited_property_id', ruPropertyId)
                .limit(1)
                .maybeSingle();
              if (roomType?.property_id) {
                propertyId = roomType.property_id;
                roomTypeId = roomType.id;
              } else {
                const { data: prop } = await supabase
                  .from('properties')
                  .select('id')
                  .eq('rentalsunited_property_id', ruPropertyId)
                  .limit(1)
                  .maybeSingle();
                if (prop?.id) propertyId = prop.id;
              }
            }

            // A lead becomes a provisional (pending) booking that holds the dates for
            // LEAD_HOLD_DAYS. ru-lead-lifecycle releases or rejects it afterwards.
            if (propertyId && leadFrom && leadTo) {
              const { data: existingLead } = await supabase
                .from('bookings')
                .select('id, status, hold_released_at')
                .eq('external_reservation_id', leadId)
                .eq('integration_type', 'rentalsunited_lead')
                .limit(1)
                .maybeSingle();

              if (!existingLead) {
                const leadBooking: Record<string, unknown> = {
                  property_id: propertyId,
                  guest_name: guestName,
                  guest_email: guestEmail,
                  guest_phone: guestPhone,
                  check_in_date: leadFrom,
                  check_out_date: leadTo,
                  adults: numGuests || 1,
                  total_price: leadPrice || 0,
                  status: 'pending',
                  booking_channel: 'rentals_united',
                  integration_type: 'rentalsunited_lead',
                  external_reservation_id: leadId,
                  payment_status: 'pending',
                  lead_created_at: leadCreatedAt.toISOString(),
                  hold_expires_at: holdExpiresAt.toISOString(),
                  special_requests: `Rentals United enquiry — dates held until ${holdExpiresAt.toISOString().slice(0, 10)}`,
                };
                if (roomTypeId) leadBooking.room_type_id = roomTypeId;

                const { error: leadBookingErr } = await supabase.from('bookings').insert(leadBooking);
                if (leadBookingErr) {
                  console.error(`[cron-pull-ru] Lead booking insert failed for ${leadId}: ${leadBookingErr.message}`);
                } else {
                  summary.leads_held++;
                  if (holdExpiresAt.getTime() > Date.now()) {
                    await applyAvailabilityBlock(propertyId, roomTypeId, leadFrom, leadTo, true);
                  }
                  console.log(`[cron-pull-ru] ✅ Held lead ${leadId} (${guestName}) until ${holdExpiresAt.toISOString()}`);
                }
              }
            } else if (propertyId) {
              console.warn(`[cron-pull-ru] Lead ${leadId} has no usable stay dates — logged only`);
            }

            // Deduplicate the notification log only (the booking upsert above is idempotent)
            const { data: existingNotif } = await supabase
              .from('ru_notifications')
              .select('id')
              .eq('ru_reservation_id', leadId)
              .eq('event_type', 'poll_lead')
              .limit(1)
              .maybeSingle();

            if (!existingNotif) {
              await supabase.from('ru_notifications').insert({
                event_type: 'poll_lead',
                ru_reservation_id: leadId,
                ru_property_id: ruPropertyId,
                property_id: propertyId,
                raw_xml: leadBlock,
                processed: true,
              });
              summary.leads_logged++;
              console.log(`[cron-pull-ru] ✅ Logged lead ${leadId} from ${guestName} (${guestEmail})`);
            }
          } catch (leadErr) {
            console.error(`[cron-pull-ru] Error processing lead:`, leadErr);
          }
        }

      } catch (leadsError) {
        console.warn(`[cron-pull-ru] Leads polling error (non-fatal) for ${scope.label}:`, leadsError);
      }
    }
  }
});

