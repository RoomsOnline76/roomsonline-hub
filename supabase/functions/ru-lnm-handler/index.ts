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
