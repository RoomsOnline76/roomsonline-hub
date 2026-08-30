/**
 * Drains the coalesced channel change-notification queue (`ru_lnm_repull_queue`).
 *
 * The channel sends one live notification per changed value, and each one used to trigger its own
 * availability + price read-back from inside `ru-lnm-handler`. Because the channel only allows one
 * call per method+parameters per sliding minute, a burst produced thousands of deferrals that were
 * logged as failures. The handler now queues the change (windows unioned per property) and this
 * cron performs ONE read-back per property per pass.
 *
 * Outcomes:
 *  - success            → `lnm_repull` success run, queue row done
 *  - rate deferred      → queue row stays pending, NO failure logged (it is a deferral)
 *  - genuine failure    → `lnm_repull` failure run with the real error body, retried up to 5 times
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { readInvokeErrorBody } from '../_shared/ruInvokeBody.ts';
import { RU_RATE_DEFERRED_CODE } from '../_shared/ruRateGate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RUN_BUDGET_MS = 70_000;
const MAX_PROPERTIES_PER_RUN = 10;
const MAX_ATTEMPTS = 5;

interface QueueRow {
  id: string;
  ru_property_id: string;
  ru_owner_id: string | null;
  property_id: string | null;
  kind: string;
  date_from: string | null;
  date_to: string | null;
  notifications: number;
  change_types: string[] | null;
  attempts: number;
}

function isDeferral(message: string | null | undefined): boolean {
  const m = String(message ?? '');
  return m.includes(RU_RATE_DEFERRED_CODE) || m.includes('was called with the same parameters');
}

/**
 * The channel answers "Property does not exist" for listings that were removed or archived on its
 * side. Retrying cannot help and it is not a fault of ours, so the queue row is closed as skipped.
 */
function isDelisted(message: string | null | undefined): boolean {
  return /property\s+does\s+not\s+exist|no\s+such\s+property/i.test(String(message ?? ''));
}


/** Pull the readable reason out of a supabase-js invoke error (body hidden on error.context). */
async function invokeErrorMessage(error: unknown): Promise<string> {
  const body = await readInvokeErrorBody(error);
  const nested = body?.error as { message?: string } | string | undefined;
  const fromBody =
    (typeof nested === 'string' ? nested : nested?.message) ??
    (typeof body?.message === 'string' ? (body.message as string) : null);
  if (fromBody) return fromBody;
  return error instanceof Error ? error.message : String(error);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );
  const deadline = Date.now() + RUN_BUDGET_MS;
  const batchId = crypto.randomUUID();

  const { data: pending, error: readError } = await supabase
    .from('ru_lnm_repull_queue')
    .select('id, ru_property_id, ru_owner_id, property_id, kind, date_from, date_to, notifications, change_types, attempts')
    .eq('status', 'pending')
    .order('first_seen_at', { ascending: true })
    .limit(MAX_PROPERTIES_PER_RUN);

  if (readError) {
    return new Response(JSON.stringify({ success: false, error: readError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const summary = { processed: 0, succeeded: 0, deferred: 0, failed: 0, skipped: 0 };

  for (const row of (pending ?? []) as QueueRow[]) {
    if (Date.now() > deadline) {
      summary.skipped++;
      continue;
    }

    // Claim the row so two overlapping cron passes cannot read the same window twice.
    const { data: claimed } = await supabase
      .from('ru_lnm_repull_queue')
      .update({ status: 'processing', updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!claimed) {
      summary.skipped++;
      continue;
    }

    const startedAt = Date.now();
    const methods: string[] = [];
    let deferredHere = false;
    const queuedHere = false;
    let ariNoOp = false;
    let failure: string | null = null;

    try {
      if (row.kind === 'static') {
        const { data, error } = await supabase.functions.invoke('push-property-to-ru', {
          body: { property_id: row.property_id, action: 'static_only', trigger: 'lnm_static_change' },
        });
        if (error) throw new Error(await invokeErrorMessage(error));
        if (data?.success === false) throw new Error(data?.error?.message ?? 'static re-push failed');
        methods.push('Push_PutProperty_RQ (differential)');
      } else {
        /**
         * ARI notifications are acknowledged, never read back.
         *
         * ROL'OS owns availability and pricing, so the channel's calendar can only ever repeat what
         * we published — the read-back added nothing and, once the read-back gate started demanding
         * a declared purpose, every one of these rows failed locally without a channel call ever
         * being made. Channel-side bookings reach us through the reservation notification handler
         * and the 30-minute reservation poll, which are the authoritative paths.
         */
        ariNoOp = true;
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (isDeferral(message)) deferredHere = true;
      else failure = message;
    }



    summary.processed++;

    if (deferredHere) {
      // Rate deferral is not an error: leave the row pending for the next pass.
      summary.deferred++;
      await supabase
        .from('ru_lnm_repull_queue')
        .update({
          status: 'pending',
          attempts: row.attempts + 1,
          last_error: 'Deferred by the channel rate window — will retry',
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      continue;
    }

    if (failure !== null && isDelisted(failure)) {
      // Listing no longer exists at the channel — close the row, do not retry, do not alarm.
      summary.skipped++;
      await supabase
        .from('ru_lnm_repull_queue')
        .update({
          status: 'skipped',
          attempts: row.attempts + 1,
          last_error: failure,
          processed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id);
      continue;
    }

    const ok = failure === null;

    if (ok) summary.succeeded++;
    else summary.failed++;

    const giveUp = !ok && row.attempts + 1 >= MAX_ATTEMPTS;
    await supabase
      .from('ru_lnm_repull_queue')
      .update({
        status: ok ? 'done' : giveUp ? 'failed' : 'pending',
        attempts: row.attempts + 1,
        last_error: failure,
        processed_at: ok || giveUp ? new Date().toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', row.id);

    await supabase.from('ru_sync_runs').insert({
      batch_id: batchId,
      action: ariNoOp ? 'lnm_ari_acknowledged' : 'lnm_repull',
      success: ok,
      error_message: failure,
      elapsed_ms: Date.now() - startedAt,
      property_id: row.property_id,
      ru_property_id: row.ru_property_id,
      details: {
        scope: ariNoOp ? 'lnm_skipped_not_applicable' : 'lnm_corrective_repull',
        ...(ariNoOp
          ? {
              reason:
                "ARI notification acknowledged — ROL'OS owns availability and pricing, so no channel read-back is owed",
            }
          : {}),
        coalesced_notifications: row.notifications,
        change_types: row.change_types ?? [],
        date_from: row.date_from,
        date_to: row.date_to,
        ru_methods: methods,
        attempt: row.attempts + 1,
        // The read-back was accepted into the shared call queue and runs on the drainer's cadence.
        queued_via_call_queue: queuedHere || undefined,
      },
    });

  }

  console.log(
    `[cron-ru-lnm-repull] processed=${summary.processed} ok=${summary.succeeded} deferred=${summary.deferred} failed=${summary.failed}`,
  );

  return new Response(JSON.stringify({ success: true, ...summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
