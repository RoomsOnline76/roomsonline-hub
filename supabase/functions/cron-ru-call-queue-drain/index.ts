/**
 * The single drainer for the channel background work queue (`ru_call_queue`).
 *
 * The channel allows one call per method+parameters per sliding minute. Previously a call that
 * could not claim a slot was abandoned with `RU_RATE_DEFERRED` — thousands per day, so verification
 * read-backs silently never happened. Deferrable calls are now parked in the queue and replayed
 * here. Because this is the ONLY drainer and it spaces its work, queued calls are naturally
 * compliant with the channel's window and nothing is lost.
 *
 * Outcomes per row: done | pending (backoff, will retry) | failed (attempts exhausted or permanent).
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { readInvokeErrorBody } from '../_shared/ruInvokeBody.ts';
import { RU_RATE_DEFERRED_CODE } from '../_shared/ruRateGate.ts';
import { sweepRuNotificationRetries } from '../_shared/ruNotificationRetry.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const RUN_BUDGET_MS = 75_000;
/** Spacing between two drained calls — the channel window is per method+params, this is a safety gap. */
const SPACING_MS = 1_500;
const MAX_CALLS_PER_RUN = 25;
/** Backoff before the next attempt, indexed by attempt number. */
const BACKOFF_MS = [30_000, 75_000, 150_000, 300_000, 600_000];

interface QueueRow {
  id: string;
  method_key: string;
  action: string;
  ru_owner_id: string | null;
  property_id: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

function isDeferral(message: string | null | undefined): boolean {
  const m = String(message ?? '');
  return m.includes(RU_RATE_DEFERRED_CODE) || m.includes('was called with the same parameters');
}

/** Retrying cannot help: the listing/account no longer exists at the channel. */
function isPermanent(message: string | null | undefined): boolean {
  return /property\s+does\s+not\s+exist|no\s+such\s+property|invalid\s+session|not\s+authori[sz]ed/i.test(
    String(message ?? ''),
  );
}

/**
 * Terminal, but not a defect: the channel says the work is already unnecessary (e.g. cancelling a
 * reservation it never had). These land as `no_op` so certification review and the health report
 * stop reading them as unhealed failures.
 */
function isNoOp(message: string | null | undefined): boolean {
  return /reservation\s+does\s+not\s+exist|already\s+cancell?ed|no\s+such\s+reservation|nothing\s+to\s+(cancel|update)/i.test(
    String(message ?? ''),
  );
}

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
  const summary = { claimed: 0, succeeded: 0, requeued: 0, failed: 0, noOp: 0 };

  for (let i = 0; i < MAX_CALLS_PER_RUN; i++) {
    if (Date.now() > deadline) break;

    // Atomic claim — safe with overlapping cron passes and multiple isolates.
    const { data: claimedRows, error: claimError } = await supabase.rpc('ru_claim_queued_call');
    if (claimError) {
      console.error(`[cron-ru-call-queue-drain] claim failed: ${claimError.message}`);
      break;
    }
    const row = (Array.isArray(claimedRows) ? claimedRows[0] : claimedRows) as QueueRow | undefined;
    if (!row) break;

    summary.claimed++;
    const startedAt = Date.now();
    let failure: string | null = null;
    let result: unknown = null;

    try {
      // Replay the original request; `deferrable: false` so the gate waits rather than re-queues.
      const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
        body: { ...(row.payload ?? {}), deferrable: false, queued_replay: true },
      });
      if (error) throw new Error(await invokeErrorMessage(error));
      if (data?.success === false) throw new Error(data?.error?.message ?? `${row.action} failed`);
      result = data ?? null;
    } catch (err) {
      failure = err instanceof Error ? err.message : String(err);
    }

    const nowIso = new Date().toISOString();

    if (failure === null) {
      summary.succeeded++;
      await supabase
        .from('ru_call_queue')
        .update({ status: 'done', completed_at: nowIso, last_error: null, result: result as never })
        .eq('id', row.id);
    } else {
      const deferred = isDeferral(failure);
      const noOp = !deferred && isNoOp(failure);
      const giveUp = !deferred && !noOp && (isPermanent(failure) || row.attempts >= row.max_attempts);
      if (noOp) summary.noOp++;
      else if (giveUp) summary.failed++;
      else summary.requeued++;
      await supabase
        .from('ru_call_queue')
        .update({
          status: noOp ? 'no_op' : giveUp ? 'failed' : 'pending',
          last_error: failure,
          completed_at: noOp || giveUp ? nowIso : null,
          claimed_at: null,
          not_before: new Date(
            Date.now() + (deferred ? 65_000 : BACKOFF_MS[Math.min(row.attempts, BACKOFF_MS.length) - 1] ?? 60_000),
          ).toISOString(),
        })
        .eq('id', row.id);
    }

    console.log(
      `[cron-ru-call-queue-drain] ${row.action} attempt ${row.attempts} in ${Date.now() - startedAt}ms → ${failure ?? 'ok'}`,
    );

    if (Date.now() < deadline) await new Promise((r) => setTimeout(r, SPACING_MS));
  }

  // Reservation notifications that arrived without stay data are parked with a 1-minute
  // backoff. Sweeping them here (this cron runs every ~40s) instead of only on the 30-minute
  // reconciliation poll is what makes a fresh channel request appear on the board promptly.
  let sweep = { considered: 0, resolved: 0, stillPending: 0, failed: 0 };
  try {
    sweep = await sweepRuNotificationRetries(supabase, {
      limit: 10,
      logPrefix: '[cron-ru-call-queue-drain][retry]',
    });
  } catch (e) {
    console.warn(`[cron-ru-call-queue-drain] notification sweep failed: ${e instanceof Error ? e.message : e}`);
  }

  console.log(
    `[cron-ru-call-queue-drain] notifications considered=${sweep.considered} resolved=${sweep.resolved} pending=${sweep.stillPending} failed=${sweep.failed}`,
  );

  console.log(
    `[cron-ru-call-queue-drain] claimed=${summary.claimed} ok=${summary.succeeded} requeued=${summary.requeued} failed=${summary.failed}`,
  );

  return new Response(JSON.stringify({ success: true, ...summary, notifications: sweep }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
