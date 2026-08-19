/**
 * Channel step ledger — Phase 4 background stale drain.
 *
 * Phase 2 marks only the steps a save actually invalidated as `stale`. Until now a stale
 * local step stayed stale until somebody opened the Channels wizard and pressed Refresh.
 * This job clears them on its own, paced, and WITHOUT ever calling the channel:
 *
 *  - only steps in the local class are drained (content/rooms/media/commercial/signoff/…)
 *  - the recheck runs through `ru-cert-portal` action `ledger_drain_recheck`, which
 *    hard-wires the channel probe off, so no availability/price Pull_* is ever issued
 *  - the whole job is a no-op while `channel_step_ledger_enabled` is false
 *
 * One summary row per run is written to `ru_sync_runs` (`action = 'ledger_drain'`) with
 * counts only — no guest data, no credentials.
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import {
  isChannelStepLedgerEnabled,
  logLedgerEvent,
  LOCAL_CLASS_LEDGER_STEPS,
} from '../_shared/channelStepLedger.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Leave headroom inside the platform's request budget. */
const RUN_BUDGET_MS = 75_000;
/** A local recheck rebuilds the outbound payload — pace the work, this is a background job. */
const SPACING_MS = 750;
const MAX_PROPERTIES_PER_RUN = 20;

interface StaleRow {
  property_id: string;
  step_key: string;
  stale_at: string | null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const admin = createClient(supabaseUrl, serviceKey);
  const startedAt = Date.now();
  const deadline = startedAt + RUN_BUDGET_MS;
  const batchId = crypto.randomUUID();

  const enabled = await isChannelStepLedgerEnabled(admin);
  if (!enabled) {
    logLedgerEvent({ event: 'drain_skipped', detail: { reason: 'flag_off' } });
    return new Response(JSON.stringify({ success: true, enabled: false, properties: 0 }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: stale, error: readError } = await admin
    .from('property_channel_step_status')
    .select('property_id, step_key, stale_at')
    .eq('status', 'stale')
    .in('step_key', LOCAL_CLASS_LEDGER_STEPS)
    .order('stale_at', { ascending: true, nullsFirst: true })
    .limit(400);

  if (readError) {
    logLedgerEvent({ event: 'drain_error', detail: { message: readError.message } });
    return new Response(JSON.stringify({ success: false, error: readError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // One recheck per property covers every stale local step it owns.
  const byProperty = new Map<string, string[]>();
  for (const row of (stale ?? []) as StaleRow[]) {
    if (!row.property_id) continue;
    const steps = byProperty.get(row.property_id) ?? [];
    steps.push(row.step_key);
    byProperty.set(row.property_id, steps);
  }
  const targets = [...byProperty.entries()].slice(0, MAX_PROPERTIES_PER_RUN);

  logLedgerEvent({
    event: 'drain_start',
    detail: { stale_rows: (stale ?? []).length, properties_queued: targets.length },
  });

  const summary = {
    properties_scanned: byProperty.size,
    properties_rechecked: 0,
    steps_cleared: 0,
    steps_blocked: 0,
    steps_unknown: 0,
    failures: 0,
  };

  for (const [propertyId, staleSteps] of targets) {
    if (Date.now() > deadline) {
      logLedgerEvent({ event: 'drain_budget_reached', detail: { done: summary.properties_rechecked } });
      break;
    }

    try {
      const { data, error } = await admin.functions.invoke('ru-cert-portal', {
        body: { action: 'ledger_drain_recheck', property_id: propertyId },
      });
      if (error || data?.success !== true) {
        summary.failures += 1;
        logLedgerEvent({
          propertyId,
          event: 'drain_property_failed',
          detail: { message: error?.message ?? data?.error?.message ?? 'recheck failed' },
        });
        continue;
      }

      summary.properties_rechecked += 1;
      const steps = (Array.isArray(data.steps) ? data.steps : []) as {
        step_key: string;
        status: string;
      }[];
      for (const step of steps) {
        if (!staleSteps.includes(step.step_key)) continue;
        if (step.status === 'passed') summary.steps_cleared += 1;
        else if (step.status === 'blocked') summary.steps_blocked += 1;
        else summary.steps_unknown += 1;
      }
      logLedgerEvent({
        propertyId,
        event: 'drain_property',
        detail: { stale_steps: staleSteps.length },
      });
    } catch (e) {
      summary.failures += 1;
      logLedgerEvent({
        propertyId,
        event: 'drain_property_failed',
        detail: { message: e instanceof Error ? e.message : String(e) },
      });
    }

    if (SPACING_MS > 0) await new Promise((resolve) => setTimeout(resolve, SPACING_MS));
  }

  await admin.from('ru_sync_runs').insert({
    batch_id: batchId,
    action: 'ledger_drain',
    success: summary.failures === 0,
    error_message: summary.failures > 0 ? `${summary.failures} property recheck(s) failed` : null,
    elapsed_ms: Date.now() - startedAt,
    details: { scope: 'channel_step_ledger_local_drain', probe_ari: false, ...summary },
  });

  logLedgerEvent({ event: 'drain_done', detail: summary });

  return new Response(JSON.stringify({ success: true, enabled: true, ...summary }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
