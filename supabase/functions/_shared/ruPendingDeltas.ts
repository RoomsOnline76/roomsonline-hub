// Automatic re-arm for Rentals United deltas that were parked behind the readiness gate.
//
// Certification requires changed content and ARI to reach the channel without operator action.
// ROLOS therefore never asks for a manual re-push: when a delta is refused because the property
// does not currently satisfy the mandatory gate, it is parked in `ru_sync_runs`
// (`static_delta_pending` / `ari_delta_pending`). The moment readiness is evaluated clean again,
// this helper re-fires every parked delta silently.
//
// Failures are swallowed — a re-arm must never break the surface that triggered it.

import { queueRuStaticDelta, RU_STATIC_DELTA_ACTION, RU_STATIC_DELTA_PENDING_ACTION } from './ruStaticDelta.ts';
import { queueRuAriDelta, RU_ARI_DELTA_PENDING_ACTION } from './ruAriDelta.ts';

/** Do not re-fire a delta that failed the gate seconds ago — let the save settle first. */
const MIN_PENDING_AGE_MS = 30 * 1000;

export interface RuPendingResumeResult {
  content: 'resumed' | 'none' | 'error';
  rates: 'resumed' | 'none' | 'error';
}

async function newestRun(
  supabase: any,
  propertyId: string,
  action: string,
  opts: { successOnly?: boolean } = {},
): Promise<number | null> {
  let query = supabase
    .from('ru_sync_runs')
    .select('created_at')
    .eq('property_id', propertyId)
    .eq('action', action)
    .order('created_at', { ascending: false })
    .limit(1);
  if (opts.successOnly) query = query.eq('success', true);
  const { data } = await query;
  const row = (data ?? [])[0] as { created_at?: string } | undefined;
  return row?.created_at ? new Date(row.created_at).getTime() : null;
}

/** True when a parked delta is still owed to the channel. */
async function isOwed(
  supabase: any,
  propertyId: string,
  pendingAction: string,
  deliveredAction: string,
): Promise<boolean> {
  const pendingAt = await newestRun(supabase, propertyId, pendingAction);
  if (!pendingAt) return false;
  if (Date.now() - pendingAt < MIN_PENDING_AGE_MS) return false;
  const deliveredAt = await newestRun(supabase, propertyId, deliveredAction, { successOnly: true });
  return deliveredAt == null || deliveredAt < pendingAt;
}

/**
 * Re-fire every delta parked behind the gate for one property. Safe to call on any surface that
 * has just established that the property passes readiness.
 */
export async function resumePendingRuDeltas(
  supabase: any,
  propertyId: string | null | undefined,
  trigger = 'readiness_cleared',
): Promise<RuPendingResumeResult> {
  const result: RuPendingResumeResult = { content: 'none', rates: 'none' };
  if (!propertyId) return result;

  try {
    if (await isOwed(supabase, propertyId, RU_STATIC_DELTA_PENDING_ACTION, RU_STATIC_DELTA_ACTION)) {
      const outcome = await queueRuStaticDelta(supabase, propertyId, `${trigger}:content`, { force: true });
      result.content = outcome.queued ? 'resumed' : outcome.reason === 'gate_pending' ? 'none' : 'error';
    }
  } catch (err) {
    console.warn('[ruPendingDeltas] content resume failed', err);
    result.content = 'error';
  }

  try {
    if (await isOwed(supabase, propertyId, RU_ARI_DELTA_PENDING_ACTION, 'refresh_ari')) {
      const outcome = await queueRuAriDelta(supabase, propertyId, `${trigger}:rates`, { force: true });
      result.rates = outcome.queued ? 'resumed' : outcome.reason === 'gate_pending' ? 'none' : 'error';
    }
  } catch (err) {
    console.warn('[ruPendingDeltas] rates resume failed', err);
    result.rates = 'error';
  }

  return result;
}

export default resumePendingRuDeltas;
