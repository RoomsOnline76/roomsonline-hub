import { createClient } from 'npm:@supabase/supabase-js@2';
import { sweepRuNotificationRetries } from '../_shared/ruNotificationRetry.ts';
import { resolveRuOwnerScopes, type RuOwnerScope } from '../_shared/ruOwnerScopes.ts';
import { extractTag, extractAllBlocks, parseRuReservation } from '../_shared/ruReservationParsing.ts';
import { classifyRuStatus, ingestRuReservation } from '../_shared/ruReservationIngest.ts';
import { recordChannelBookingEvent, type BookingEventAction } from '../_shared/channelBookingEvents.ts';
import { readInvokeError } from '../_shared/functionInvokeError.ts';

/**
 * Cron job: Pull reservations from Rentals United every 30 minutes.
 * Safety net alongside RLNM — catches missed push notifications.
 * Queries the last 90 days of reservations via Pull_ListReservations_RQ (RU filters on the
 * reservation CREATION date, so a short window silently drops bookings taken earlier).
 *
 * Parsing and all booking writes are shared with `ru-reservation-handler` via
 * `_shared/ruReservationParsing.ts` + `_shared/ruReservationIngest.ts`, so the poll and
 * notification paths are identical and idempotent (a replayed reservation updates the
 * existing booking instead of creating a second one).
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
/** Leads are listed by stay date — cover the forward booking window as well. */
const PULL_FORWARD_DAYS = 365;
/** Wall-clock budget for the whole run; remaining accounts roll into the next run. */
const RUN_BUDGET_MS = 6 * 60_000;

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

  const summary = { total: 0, created: 0, updated: 0, cancelled: 0, skipped: 0, failed: 0, unmatched: 0, leads_found: 0, leads_logged: 0, leads_held: 0, rate_deferred: 0 };
  const cronStartedAt = Date.now();
  const deadline = cronStartedAt + RUN_BUDGET_MS;

  // Cadence evidence for the RU certification console (Pull_ListReservations_RQ),
  // logged per account so staleness rotation can order the next run.
  let retrySweep: Awaited<ReturnType<typeof sweepRuNotificationRetries>> | null = null;

  const logCadence = async (
    success: boolean,
    errorMessage: string | null,
    scope: RuOwnerScope,
    extra: Record<string, unknown> = {},
    failure: { httpStatus?: number | null; errorCode?: string | null } = {},
  ) => {
    await supabase.from('ru_sync_runs').insert({
      batch_id: crypto.randomUUID(),
      action: 'pull_reservations',
      success,
      error_message: errorMessage,
      http_status: failure.httpStatus ?? null,
      error_code: failure.errorCode ?? null,
      elapsed_ms: Date.now() - cronStartedAt,
      details: {
        ...summary,
        ...extra,
        scope: 'reservation_poll',
        retry_sweep: retrySweep,
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
    // Leads for future stays are not visible in a past-only window, so look ahead too.
    const windowEnd = new Date(now);
    windowEnd.setDate(now.getDate() + PULL_FORWARD_DAYS);
    const dateTo = formatDate(windowEnd);
    const dateFrom = formatDate(windowStart);

    // Re-attempt notifications parked earlier (RU often cannot serve a request straight
    // after its own callback) before polling — a resolved retry saves a wider pull.
    retrySweep = await sweepRuNotificationRetries(supabase, { logPrefix: '[cron-pull-ru][retry]' });

    // Sub-users ONLY. Every ROL'OS listing lives on a white-label sub-account, so
    // the master account never holds reservations or leads — polling it just burns
    // a sliding-minute slot and files an empty, always-failing run.
    const scopes = await resolveRuOwnerScopes(supabase, 'pull_reservations', {
      includeMaster: false,
      requireOperationalPush: true,
    });
    const covered: string[] = [];
    const deferred: string[] = [];

    if (scopes.length === 0) {
      const msg = 'No Rentals United sub-accounts with API keys — nothing to poll.';
      console.warn(`[cron-pull-ru] ${msg}`);
      return new Response(JSON.stringify({ success: true, summary, accounts_polled: [], accounts_deferred: [], note: msg }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }


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
        body: {
          action: 'list_reservations',
          date_from: dateFrom,
          date_to: dateTo,
          // 1 Confirmed · 2 Cancelled · 4 Request (pending) · 6 Approved · 7 Rejected · 8 Expired.
          // RU omits pending requests unless the statuses are named explicitly.
          statuses: [1, 2, 4, 6, 7, 8],
          ...scope.payload,
        },
      });


      if (ruErr || !ruResult?.success) {
        // invoke() hides the real body behind "non-2xx status code" — read it back so the
        // RU error taxonomy can classify the run instead of bucketing it as unclassified.
        const failure = ruErr
          ? await readInvokeError(ruErr)
          : {
              message: ruResult?.error?.message || 'Unknown error',
              httpStatus: null,
              errorCode: ruResult?.error?.code ?? null,
            };
        // A rate deferral means another caller already used this method's sliding-minute slot —
        // that is compliance working, not an outage. Record it as a skip and roll to the next run.
        if (failure.errorCode === 'RU_RATE_DEFERRED' || /rate limited/i.test(failure.message ?? '')) {
          summary.rate_deferred += 1;
          deferred.push(scope.label);
          console.log(`[cron-pull-ru] ${scope.label} deferred by the sliding-minute gate: ${failure.message}`);
          await logCadence(true, null, scope, { rate_deferred: true });
          continue;
        }
        console.error(
          `[cron-pull-ru] ${scope.label} API call failed (http=${failure.httpStatus ?? 'n/a'}, code=${failure.errorCode ?? 'n/a'}): ${failure.message}`,
        );
        await logCadence(false, failure.message, scope, {}, failure);
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
    await logCadence(false, String(error), { ownerId: null, label: 'cron', payload: {} });
    return new Response(JSON.stringify({ success: false, error: String(error), summary }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  /**
   * Parse + ingest every <Reservation> block returned for one RU account.
   * All writes go through the shared, idempotent `ingestRuReservation` helper so the
   * poll path and the RLNM notification path produce identical booking records.
   */
  async function processReservations(rawXml: string, scope: RuOwnerScope) {
    const reservationBlocks = extractAllBlocks(rawXml, 'Reservation');
    summary.total += reservationBlocks.length;
    console.log(`[cron-pull-ru] ${scope.label}: found ${reservationBlocks.length} reservation(s)`);

    for (const block of reservationBlocks) {
      try {
        const r = parseRuReservation(block);
        if (!r.ruReservationId) {
          console.warn('[cron-pull-ru] Skipping reservation without ID');
          summary.skipped++;
          continue;
        }

        const kind = classifyRuStatus(r.statusId);
        const result = await ingestRuReservation(supabase, r, {
          source: 'poll',
          logPrefix: '[cron-pull-ru]',
        });

        switch (result.outcome) {
          case 'created':
            summary.created++;
            break;
          case 'updated':
            summary.updated++;
            break;
          case 'cancelled':
            summary.cancelled++;
            break;
          case 'held':
            summary.leads_held++;
            break;
          case 'unmatched':
            summary.unmatched++;
            console.warn(`[cron-pull-ru] ${result.note} (reservation ${r.ruReservationId})`);
            break;
          case 'failed':
            summary.failed++;
            break;
          default:
            summary.skipped++;
        }

        const pollResolved = result.outcome !== 'unmatched' && result.outcome !== 'failed';
        const pollUnmapped = !result.propertyId && !!r.ruPropertyId;
        await supabase.from('ru_notifications').insert({
          event_type: `poll_reservation_${kind}`,
          ru_reservation_id: r.ruReservationId,
          ru_property_id: r.ruPropertyId,
          property_id: result.propertyId,
          raw_xml: block,
          processed: pollResolved,
          resolution_state: pollResolved ? 'resolved' : pollUnmapped ? 'unmapped' : 'failed',
          error_message: pollResolved
            ? null
            : pollUnmapped
              ? `Channel listing ${r.ruPropertyId} is not mapped to any ROL'OS unit`
              : result.error ?? result.note ?? `Ingest outcome: ${result.outcome}`,
          last_attempt_at: new Date().toISOString(),
        });

        // Inbound trail: a reconciliation pull is the channel telling us about a stay just as much
        // as a live notification is, so it has to be visible in Diagnostics with its own source.
        const trailAction: BookingEventAction = kind === 'cancelled'
          ? 'cancelled'
          : kind === 'request'
            ? 'request'
            : result.outcome === 'updated'
              ? 'modified'
              : 'confirmed';
        await recordChannelBookingEvent(supabase, {
          booking_id: result.bookingId ?? null,
          property_id: result.propertyId ?? null,
          direction: 'inbound',
          action: trailAction,
          source: 'reconcile_pull',
          outcome: result.outcome === 'failed' || result.outcome === 'unmatched'
            ? 'failed'
            : result.outcome === 'skipped'
              ? 'skipped'
              : 'ingested',
          reason: result.outcome,
          channel_reservation_id: r.ruReservationId ?? null,
          channel_listing_id: r.ruPropertyId ?? null,
          summary: `Reconciliation pull: reservation ${result.outcome}`,
          details: { kind, note: result.note ?? null, error: result.error ?? null },
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
          const failure = leadsErr
            ? await readInvokeError(leadsErr)
            : { message: leadsResult?.error?.message || 'Unknown', httpStatus: null, errorCode: leadsResult?.error?.code ?? null };
          if (failure.errorCode === 'RU_RATE_DEFERRED' || /rate limited/i.test(failure.message ?? '')) {
            summary.rate_deferred += 1;
            console.log(`[cron-pull-ru] ${scope.label} leads deferred by the sliding-minute gate`);
            continue;
          }
          console.warn(
            `[cron-pull-ru] ${scope.label} leads API call failed (http=${failure.httpStatus ?? 'n/a'}): ${failure.message}`,
          );
          continue;
        }

        if (scope.ownerId && leadsResult.auth_mode === 'master') {
          console.error(`[cron-pull-ru] Refused leads for ${scope.label}: RU answered on master credentials`);
          continue;
        }

        const leadsXml: string = leadsResult.raw_xml || '';
        // RU has answered with several envelopes over time (<Lead>, <LeadInfo>, <Reservation>).
        let leadBlocks = extractAllBlocks(leadsXml, 'Lead');
        if (leadBlocks.length === 0) leadBlocks = extractAllBlocks(leadsXml, 'LeadInfo');
        if (leadBlocks.length === 0) leadBlocks = extractAllBlocks(leadsXml, 'Reservation');
        summary.leads_found += leadBlocks.length;
        console.log(`[cron-pull-ru] ${scope.label}: found ${leadBlocks.length} lead(s)`);
        if (leadBlocks.length === 0) {
          // Keep the raw answer so an empty result can be told apart from a parse miss.
          console.log(`[cron-pull-ru] ${scope.label} leads raw answer: ${leadsXml.slice(0, 800)}`);
          await supabase.from('ru_notifications').insert({
            event_type: 'poll_leads_empty',
            ru_reservation_id: null,
            ru_property_id: null,
            property_id: null,
            raw_xml: leadsXml.slice(0, 20000),
            processed: true,
          }).then(() => {}, () => {});
        }

        for (const leadBlock of leadBlocks) {
          try {
            const parsed = parseRuReservation(leadBlock);
            const leadId = extractTag(leadBlock, 'LeadID') || parsed.ruReservationId;
            if (!leadId) continue;

            const createdRaw =
              parsed.createdDate ||
              extractTag(leadBlock, 'DateCreated') ||
              extractTag(leadBlock, 'CreationDate') ||
              extractTag(leadBlock, 'DateRequested');

            // A lead becomes a provisional (pending) booking holding the dates for
            // LEAD_HOLD_DAYS; ru-lead-lifecycle releases or rejects it afterwards.
            const result = await ingestRuReservation(
              supabase,
              {
                ...parsed,
                ruReservationId: leadId,
                guestName: parsed.guestName === 'RU Guest' ? 'RU Lead' : parsed.guestName,
                createdDate: createdRaw,
              },
              { source: 'poll', logPrefix: '[cron-pull-ru][lead]', forceRequest: true },
            );

            if (result.outcome === 'held') summary.leads_held++;
            else if (result.outcome === 'unmatched' || result.outcome === 'skipped') {
              console.warn(`[cron-pull-ru] Lead ${leadId} not held: ${result.note ?? result.outcome}`);
            }

            // Deduplicate the notification log only (the booking ingest above is idempotent)
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
                ru_property_id: parsed.ruPropertyId,
                property_id: result.propertyId,
                raw_xml: leadBlock,
                processed: true,
              });
              summary.leads_logged++;
              console.log(`[cron-pull-ru] ✅ Logged lead ${leadId} from ${parsed.guestName} (${parsed.guestEmail})`);
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

