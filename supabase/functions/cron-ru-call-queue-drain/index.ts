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
import { confirmRuRequest } from '../_shared/ruBookingSync.ts';
import { RU_ARI_DELTA_QUEUE_ACTION } from '../_shared/ruAriDelta.ts';


/** The channel refuses to accept a held request whose own nights read as closed on its calendar. */
function isBlockedDates(message: string | null | undefined): boolean {
  return /not available for a given dates|check in or check out/i.test(String(message ?? ''));
}

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
 * reservation it never had), or the listing needs republishing before the call can mean anything.
 * These land as `no_op` so certification review and the health report stop reading them as
 * unhealed failures.
 */
function isNoOp(message: string | null | undefined): boolean {
  return /reservation\s+does\s+not\s+exist|already\s+cancell?ed|no\s+such\s+reservation|nothing\s+to\s+(cancel|update)|no\s+listing\s+\d+\s+for\s+this\s+unit|republish\s+the\s+unit/i.test(
    String(message ?? ''),
  );
}

/** A stay in one of these states can never be accepted at the channel again. */
const TERMINAL_BOOKING_STATUSES = new Set(['cancelled', 'canceled', 'checked_in', 'checked_out', 'completed', 'departed', 'no_show']);


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
    let terminalNoOp: string | null = null;

    // An acceptance for a stay that is already in-house, departed or cancelled can never succeed —
    // the channel refuses it ("not available for a given dates") and the row retries every pass.
    // Close it off before spending a call.
    if (row.action === 'confirm_request') {
      const reservationId = String((row.payload as { reservation_id?: unknown })?.reservation_id ?? '').trim();
      if (reservationId) {
        const { data: existing } = await supabase
          .from('bookings')
          .select('id, status')
          .eq('external_reservation_id', reservationId)
          .maybeSingle();
        const status = String((existing as { status?: string } | null)?.status ?? '').toLowerCase();
        if (status && TERMINAL_BOOKING_STATUSES.has(status)) {
          terminalNoOp = `Stay is already ${status} in ROL\u2019OS — acceptance is no longer possible at the channel.`;
        }
      }
    }

    if (terminalNoOp === null && row.action === RU_ARI_DELTA_QUEUE_ACTION) {
      // A coalesced ARI delta: the debounce window has now elapsed, so replay the LAST snapshot
      // that was parked for this property against the single owner of the RU push contract.
      const p = (row.payload ?? {}) as Record<string, unknown>;
      const propertyId = String(p.property_id ?? row.property_id ?? '').trim();
      if (!propertyId) {
        terminalNoOp = 'Parked ARI delta carries no property id.';
      } else {
        try {
          const onlyUnitIds = Array.isArray(p.only_unit_ids) ? (p.only_unit_ids as unknown[]).map(String) : [];
          const { data, error } = await supabase.functions.invoke('push-property-to-ru', {
            body: {
              property_id: propertyId,
              action: 'refresh_ari',
              trigger: String(p.trigger ?? 'coalesced_ari_delta'),
              ...(onlyUnitIds.length > 0 ? { only_unit_ids: onlyUnitIds } : {}),
              ...(p.ari_date_from ? { ari_date_from: String(p.ari_date_from) } : {}),
              ...(p.ari_date_to ? { ari_date_to: String(p.ari_date_to) } : {}),
              verify_readback: false,
              verify_availability_readback: p.verify_availability_readback === true,
            },
          });
          if (error) throw new Error(await invokeErrorMessage(error));
          if (data?.success === false) {
            const code = String(data?.error?.code ?? '');
            const message = data?.error?.message ?? 'ARI delta failed';
            // A property that is no longer listed / no longer pushing is a skip, not a defect.
            if (['RU_NOT_LISTED', 'RU_NOT_CONFIGURED', 'RU_LISTING_STALE', 'CHANNEL_MANAGER_DISABLED'].includes(code)) {
              terminalNoOp = message;
            } else {
              throw new Error(message);
            }
          }
          result = data ?? null;
        } catch (err) {
          failure = err instanceof Error ? err.message : String(err);
        }
      }
    } else if (terminalNoOp === null) {
      try {
        // Replay the original request; `deferrable: false` so the gate waits rather than re-queues.
        // `action` is taken from the row so legacy payloads queued without it still replay.
        const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: row.action, ...(row.payload ?? {}), deferrable: false, queued_replay: true },
        });
        if (error) throw new Error(await invokeErrorMessage(error));
        if (data?.success === false) throw new Error(data?.error?.message ?? `${row.action} failed`);
        result = data ?? null;
      } catch (err) {
        failure = err instanceof Error ? err.message : String(err);
      }
    }



    // A replayed acceptance that the channel refuses because the request's OWN nights read as
    // closed is our own hold, and the raw replay above cannot heal it (the reopen lives in
    // `confirmRuRequest`). Re-run the full accept path once so the row does not retry forever on a
    // block only ROL'OS can lift.
    if (failure !== null && row.action === 'confirm_request' && isBlockedDates(failure)) {
      const reservationId = String((row.payload as { reservation_id?: unknown })?.reservation_id ?? '').trim();
      if (reservationId) {
        try {
          const { data: booking } = await supabase
            .from('bookings')
            .select('id, property_id, room_type_id, external_reservation_id, booking_channel, integration_type, check_in_date, check_out_date')
            .eq('external_reservation_id', reservationId)
            .maybeSingle();
          if (booking) {
            const healed = await confirmRuRequest(supabase, booking as never, {
              comments: 'Accepted on queued retry in ROL\u2019OS',
            });
            if (healed.ok) {
              failure = null;
              result = { healed: true, method: healed.method, trace_id: healed.traceId };
            } else if (healed.queued !== true) {
              failure = healed.message ?? failure;
            }
          }
        } catch (healErr) {
          console.warn(
            `[cron-ru-call-queue-drain] confirm self-heal failed: ${healErr instanceof Error ? healErr.message : healErr}`,
          );
        }
      }
    }

    const nowIso = new Date().toISOString();

    if (terminalNoOp !== null) {
      summary.noOp++;
      await supabase
        .from('ru_call_queue')
        .update({ status: 'no_op', last_error: terminalNoOp, completed_at: nowIso, claimed_at: null })
        .eq('id', row.id);
      console.log(`[cron-ru-call-queue-drain] ${row.action} skipped → ${terminalNoOp}`);
      if (Date.now() < deadline) await new Promise((r) => setTimeout(r, SPACING_MS));
      continue;
    }

    if (failure === null) {

      summary.succeeded++;
      await supabase
        .from('ru_call_queue')
        .update({ status: 'done', completed_at: nowIso, last_error: null, result: result as never })
        .eq('id', row.id);

      // A queued acceptance bypasses `confirmRuRequest`'s inline success branch, so promote the
      // held request here as part of the same durable completion. Without this, the channel has
      // accepted it while the drawer remains permanently labelled “Not yet confirmed”.
      if (row.action === 'confirm_request') {
        const reservationId = String((row.payload as { reservation_id?: unknown })?.reservation_id ?? '').trim();
        if (reservationId) {
          const { data: promoted } = await supabase
            .from('bookings')
            .update({ integration_type: 'rentalsunited', hold_expires_at: null })
            .eq('external_reservation_id', reservationId)
            .eq('integration_type', 'rentalsunited_lead')
            .select('id');
          for (const booking of (promoted ?? []) as Array<{ id: string }>) {
            await supabase.from('booking_sync_status').upsert({
              booking_id: booking.id,
              external_system: 'rentalsunited',
              sync_status: 'synced',
              last_action: 'confirm',
              last_action_at: nowIso,
              error_message: null,
              last_error_message: null,
            }, { onConflict: 'booking_id,external_system' });
          }
        }
      }
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
    `[cron-ru-call-queue-drain] claimed=${summary.claimed} ok=${summary.succeeded} requeued=${summary.requeued} no_op=${summary.noOp} failed=${summary.failed}`,
  );

  return new Response(JSON.stringify({ success: true, ...summary, notifications: sweep }), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
