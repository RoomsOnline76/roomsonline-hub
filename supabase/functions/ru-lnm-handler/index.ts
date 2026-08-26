/**
 * Rentals United LNM handler (content / ARI change webhooks).
 *
 * RU calls this URL with an HTTP GET and a query string of identifiers only
 * (ChangeId, Type, PropertyId, Publisher, optional DateFrom/DateTo, ChannelId,
 * Success, Result). No values are carried — the payload is a signal to re-pull.
 *
 * Contract we must honour:
 *  - answer HTTP 200 within 3 seconds (RU does not read the body)
 *  - tolerate at-least-once delivery (same ChangeId may arrive twice)
 *  - never rely on LNM alone; scheduled syncs stay in place
 *
 * Reservation notifications (RLNM) are NOT handled here — they go to
 * `ru-reservation-handler`, which is a locked adapter region.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { KNOWN_LNM_CHANGE_TYPE_IDS } from '../_shared/ruLnm.ts';
import { parseMcqFailingPoints } from '../_shared/ruMcq.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** RU reads only the status code, so acknowledge immediately and log in the background. */
function ack(extra: Record<string, unknown> = {}): Response {
  return new Response(JSON.stringify({ received: true, ...extra }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const url = new URL(req.url);
  const q = Object.fromEntries(url.searchParams.entries());

  // RU sends GET; accept POST bodies too so the console can replay a notification.
  let body: Record<string, unknown> = {};
  if (req.method === 'POST') {
    try {
      body = await req.json();
    } catch {
      body = {};
    }
  }

  const payload = { ...q, ...body } as Record<string, unknown>;
  const changeType = String(payload.Type ?? payload.type ?? '').trim();
  const changeId = String(payload.ChangeId ?? payload.change_id ?? '').trim() || null;
  const ruPropertyId = String(payload.PropertyId ?? payload.property_id ?? '').trim() || null;
  const publisher = String(payload.Publisher ?? payload.publisher ?? '').trim() || null;

  const known = changeType ? KNOWN_LNM_CHANGE_TYPE_IDS.has(changeType) : false;

  // Log without blocking the 3-second acknowledgement window.
  const log = (async () => {
    try {
      const admin = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      // Map the RU PropertyID back to a ROLOS property when we know it, so the
      // notification is attributable in the sync console.
      let propertyUuid: string | null = null;
      if (ruPropertyId) {
        const { data } = await admin
          .from('pms_mappings')
          .select('property_id')
          .in('system_type', ['rentals_united', 'rentalsunited'])
          .eq('external_id', ruPropertyId)
          .limit(1)
          .maybeSingle();
        propertyUuid = (data as { property_id?: string } | null)?.property_id ?? null;
      }

      await admin.from('ru_sync_runs').insert({
        batch_id: crypto.randomUUID(),
        action: 'LNM_Notification',
        success: known,
        error_message: known ? null : `Unrecognised LNM change type: ${changeType || '(none)'}`,
        elapsed_ms: 0,
        property_id: propertyUuid,
        ru_property_id: ruPropertyId,
        details: {
          scope: 'lnm_webhook',
          change_id: changeId,
          change_type: changeType || null,
          ru_property_id: ruPropertyId,
          publisher,
          ru_owner_id: publisher,
          query: payload,
          method: req.method,
        },
      });

      // PropertyMCQEligibilityCheck carries the asynchronous result of
      // CM_LNM_OrderMinimumContentQualityCheck_RQ. Close out the matching order so the
      // certification console shows pass/fail instead of a permanent "ordered".
      if (changeType === 'PropertyMCQEligibilityCheck' && ruPropertyId) {
        const successFlag = String(payload.Success ?? payload.success ?? '').trim().toLowerCase();
        const resultText = String(payload.Result ?? payload.result ?? '').trim() || null;
        const passed = successFlag === 'true' || successFlag === '1';
        const { data: order } = await admin
          .from('ru_mcq_orders')
          .select('id, response_preview')
          .eq('ru_property_id', ruPropertyId)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (order?.id) {
          // response_preview is a text column holding a JSON document.
          let existing: Record<string, unknown> = {};
          try {
            existing = JSON.parse(String((order as { response_preview?: string }).response_preview ?? '{}'));
          } catch {
            existing = {};
          }
          await admin
            .from('ru_mcq_orders')
            .update({
              status: passed ? 'passed' : 'failed',
              ru_status_id: resultText,
              response_preview: JSON.stringify({
                ...existing,
                mcq_notification: {
                  change_id: changeId,
                  success: passed,
                  result: resultText,
                  // Owner-facing prompts: the failing data points, split out of the free text.
                  failing_points: passed ? [] : parseMcqFailingPoints(resultText),
                  received_at: new Date().toISOString(),
                },
              }),
              updated_at: new Date().toISOString(),
            })

            .eq('id', order.id);
        }

      }

      /**
       * ARI + static change notifications carry no values — they are a signal to re-read.
       *
       * Pulling inline, per notification, made a burst of notifications fire two channel reads
       * each; the channel only allows one call per method+parameters per sliding minute, so the
       * shared rate gate deferred thousands of them and every deferral looked like a failure.
       * We now COALESCE: the change is queued per property (date windows unioned) and one
       * debounced read-back per property covers every notification received in the window.
       * `cron-ru-lnm-repull` drains the queue and logs the actual `lnm_repull` runs.
       */
      const ARI_TYPES = new Set(['PropertyAvailability', 'PropertyPrice', 'PropertyMinStay', 'PropertyChangeover']);
      if ((ARI_TYPES.has(changeType) || changeType === 'PropertyStaticDetails') && ruPropertyId) {
        const isStatic = changeType === 'PropertyStaticDetails';

        /**
         * Self-echo suppression.
         *
         * Every `Push_PutProperty_RQ` we send comes straight back as a `PropertyStaticDetails`
         * notification. Queueing a corrective re-push for our own write turns one save into an
         * endless push → notify → push loop that burns the owner's write window. If we pushed
         * this listing ourselves in the last 15 minutes, the channel is simply confirming our
         * own change: acknowledge and stop.
         */
        if (isStatic) {
          const { data: ownEcho } = await admin
            .from('ru_api_log')
            .select('id')
            .eq('ru_property_id', ruPropertyId)
            .eq('action', 'Push_PutProperty_RQ')
            .gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
            .limit(1)
            .maybeSingle();
          if (ownEcho) {
            await admin.from('ru_sync_runs').insert({
              batch_id: crypto.randomUUID(),
              action: 'lnm_self_echo_skipped',
              success: true,
              error_message: null,
              elapsed_ms: 0,
              property_id: propertyUuid,
              ru_property_id: ruPropertyId,
              details: {
                scope: 'lnm_skipped_not_applicable',
                reason: 'Notification echoes our own recent content push — no corrective re-push owed',
                change_type: changeType,
                change_id: changeId,
              },
            });
            return;
          }
        }


        if (isStatic && !propertyUuid) {
          /**
           * The channel notified about a listing ROL'OS has no mapping for (retired / test
           * listings). That is not a failure — nothing to re-push. Record it once per property
           * so the health report stops counting it as a broken pipeline.
           */
          const { data: alreadySeen } = await admin
            .from('ru_sync_runs')
            .select('id')
            .eq('action', 'lnm_unmapped_listing')
            .eq('ru_property_id', ruPropertyId)
            .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())
            .limit(1)
            .maybeSingle();
          if (!alreadySeen) {
            await admin.from('ru_sync_runs').insert({
              batch_id: crypto.randomUUID(),
              action: 'lnm_unmapped_listing',
              success: true,
              error_message: null,
              elapsed_ms: 0,
              property_id: null,
              ru_property_id: ruPropertyId,
              details: {
                scope: 'lnm_skipped_not_applicable',
                reason: 'Channel listing is not mapped to a ROL\'OS property — nothing to re-push',
                change_type: changeType,
                change_id: changeId,
              },
            });
          }
        } else {
          const iso = (d: Date) => d.toISOString().slice(0, 10);
          /**
           * RU's LNM payload dates arrive in mixed shapes (`2026-08-12T00:00:00`,
           * `8/12/2026 12:00:00 AM`, sometimes empty). The availability pull only accepts
           * `YYYY-MM-DD`; anything else returns "String was not recognized as a valid DateTime".
           */
          const toDay = (raw: unknown, fallback: string): string => {
            const s = String(raw ?? '').trim();
            if (!s) return fallback;
            const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
            const parsed = new Date(s);
            return Number.isNaN(parsed.getTime()) ? fallback : iso(parsed);
          };
          const from = new Date();
          const to = new Date(from.getTime() + 365 * 86400000);

          const { error: queueError } = await admin.rpc('ru_queue_lnm_repull', {
            _ru_property_id: ruPropertyId,
            _kind: isStatic ? 'static' : 'ari',
            _ru_owner_id: publisher,
            _property_id: propertyUuid,
            _date_from: isStatic ? null : toDay(payload.DateFrom ?? payload.date_from, iso(from)),
            _date_to: isStatic ? null : toDay(payload.DateTo ?? payload.date_to, iso(to)),
            _change_type: changeType,
            _change_id: changeId,
          });
          if (queueError) {
            console.error('[ru-lnm-handler] queueing repull failed', queueError.message);
            await admin.from('ru_sync_runs').insert({
              batch_id: crypto.randomUUID(),
              action: 'lnm_repull',
              success: false,
              error_message: `Could not queue corrective read-back: ${queueError.message}`,
              elapsed_ms: 0,
              property_id: propertyUuid,
              ru_property_id: ruPropertyId,
              details: { scope: 'lnm_queue', change_type: changeType, change_id: changeId },
            });
          }
        }
      }


    } catch (err) {
      console.error('[ru-lnm-handler] log failed', err);
    }
  })();

  // Deno's edge runtime keeps the task alive past the response.
  try {
    // @ts-expect-error EdgeRuntime is provided by the Supabase runtime
    EdgeRuntime.waitUntil(log);
  } catch {
    await log;
  }

  console.log(`[ru-lnm-handler] ${changeType || 'unknown'} property=${ruPropertyId ?? '-'} publisher=${publisher ?? '-'}`);
  return ack({ change_id: changeId, type: changeType || null, known });
});
