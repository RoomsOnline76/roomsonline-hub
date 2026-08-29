/**
 * Subscribe one Rentals United account to live notifications and prove it stored.
 *
 * Used by the channel wizard so a freshly verified sub-account is monitored the
 * moment its keys pass, instead of waiting for the nightly `ru-rlnm-daily` cron.
 * Three RU methods, in the order RU expects:
 *   1. LNM_PutHandlerUrl_RQ                               → reservations (RLNM)
 *   2. Push_PutLiveNotificationMechanismSubscriptions_RQ  → content / ARI (LNM)
 *   3. Pull_ListLiveNotificationMechanismSubscriptions_RQ → read-back (drift check)
 *
 * Subscriptions are registered PER ACCOUNT under that sub-user's own keys — a
 * response answered on master credentials is a failure, never a success.
 * Never throws: the caller treats the outcome as advisory and the nightly cron
 * retries anything that failed here.
 */
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { DEFAULT_LNM_CHANGE_TYPES, diffLnmSubscriptions, parseLnmSubscriptions } from './ruLnm.ts';

export interface LnmSubscribeStep {
  step: 'PutHandlerUrl' | 'PutLnmSubscriptions' | 'ListLnmSubscriptions';
  success: boolean;
  error: string | null;
}

export interface LnmSubscribeOutcome {
  ru_owner_id: string;
  subscribed: boolean;
  in_sync: boolean;
  steps: LnmSubscribeStep[];
  warning: string | null;
}

export async function ensureLiveNotificationsForOwner(
  admin: SupabaseClient,
  ruOwnerId: string,
  label: string,
): Promise<LnmSubscribeOutcome> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const handlerUrl = `${supabaseUrl}/functions/v1/ru-reservation-handler`;
  const lnmUrlBase = `${supabaseUrl}/functions/v1/ru-lnm-handler`;
  const batchId = crypto.randomUUID();
  const ownerId = String(ruOwnerId ?? '').trim();
  const steps: LnmSubscribeStep[] = [];

  const log = async (
    step: LnmSubscribeStep['step'],
    success: boolean,
    errMsg: string | null,
    elapsedMs: number,
    details: Record<string, unknown>,
  ) => {
    try {
      await admin.from('ru_sync_runs').insert({
        batch_id: batchId,
        action: step,
        success,
        error_message: errMsg,
        elapsed_ms: elapsedMs,
        details: { scope: 'wizard_auto_subscribe', ru_owner_id: ownerId, account: label, ...details },
      });
    } catch (e) {
      console.warn('[ruLnmSubscribe] log insert failed', e instanceof Error ? e.message : e);
    }
  };

  if (!/^\d+$/.test(ownerId)) {
    return {
      ru_owner_id: ownerId,
      subscribed: false,
      in_sync: false,
      steps,
      warning: 'No RU OwnerID available — live notifications were not subscribed.',
    };
  }

  const call = async (body: Record<string, unknown>) => {
    const { data, error } = await admin.functions.invoke('rentalsunited-api', { body });
    if (error || data?.success !== true) {
      return { ok: false, err: error?.message || data?.error?.message || 'Unknown error', data };
    }
    // A sub-user step answered on master credentials means the sub-user is still unmonitored.
    if (data.auth_mode === 'master') {
      return {
        ok: false,
        err: "Rentals United answered on MASTER credentials — this sub-user's own API keys are required before its notifications can be registered.",
        data,
      };
    }
    return { ok: true, err: null as string | null, data };
  };

  // ── 0. Already subscribed? LNM is account-scoped, so listing #2 of the same owner must not
  // repeat handler + change types + read-back. One local read replaces three RU writes.
  try {
    const { data: priorRuns } = await admin
      .from('ru_sync_runs')
      .select('action, success, details')
      .in('action', ['PutHandlerUrl', 'PutLnmSubscriptions'])
      .eq('success', true)
      .contains('details', { ru_owner_id: ownerId })
      .limit(2);
    const priorActions = new Set((priorRuns ?? []).map((r) => String((r as { action?: string }).action ?? '')));
    if (priorActions.has('PutHandlerUrl') && priorActions.has('PutLnmSubscriptions')) {
      return {
        ru_owner_id: ownerId,
        subscribed: true,
        in_sync: true,
        steps: [
          { step: 'PutHandlerUrl', success: true, error: null },
          { step: 'PutLnmSubscriptions', success: true, error: null },
        ],
        warning: null,
        skipped: true,
        skip_reason: 'lnm_already_subscribed',
      };
    }
  } catch (e) {
    // A cache miss must never block subscribing — fall through and write.
    console.warn('[ruLnmSubscribe] prior-subscription read failed', e instanceof Error ? e.message : e);
  }

  // ── 1. RLNM handler ──
  let t0 = Date.now();
  const rlnm = await call({ action: 'subscribe_notifications', handler_url: handlerUrl, owner_id: ownerId });
  steps.push({ step: 'PutHandlerUrl', success: rlnm.ok, error: rlnm.err });
  await log('PutHandlerUrl', rlnm.ok, rlnm.err, Date.now() - t0, { handler_url: handlerUrl });

  // ── 2. LNM content / ARI subscriptions ──
  t0 = Date.now();
  const lnm = await call({
    action: 'put_lnm_subscriptions',
    url_base: lnmUrlBase,
    change_types: DEFAULT_LNM_CHANGE_TYPES,
    observed_owners: [ownerId],
    owner_id: ownerId,
  });
  steps.push({ step: 'PutLnmSubscriptions', success: lnm.ok, error: lnm.err });
  await log('PutLnmSubscriptions', lnm.ok, lnm.err, Date.now() - t0, {
    url_base: lnmUrlBase,
    change_types: DEFAULT_LNM_CHANGE_TYPES,
    observed_owners: [ownerId],
  });

  // ── 3. Read-back only when a put did NOT succeed. Two accepted writes are the evidence;
  // pulling the subscription list after a clean put was a third call that proved nothing.
  let inSync = rlnm.ok && lnm.ok;
  if (!inSync) {
    t0 = Date.now();
    const read = await call({ action: 'list_lnm_subscriptions', owner_id: ownerId });
    let readErr = read.err;
    if (read.ok) {
      const actual = read.data?.subscriptions ?? parseLnmSubscriptions(String(read.data?.raw_xml ?? ''));
      const drift = diffLnmSubscriptions(actual, {
        change_types: DEFAULT_LNM_CHANGE_TYPES,
        observed_owners: [ownerId],
        url_base: lnmUrlBase,
      });
      inSync = drift.in_sync;
      if (!inSync) readErr = 'Rentals United stored different subscription settings than requested (drift).';
      await log('ListLnmSubscriptions', inSync, readErr, Date.now() - t0, { actual, drift });
    } else {
      await log('ListLnmSubscriptions', false, readErr, Date.now() - t0, {});
    }
    steps.push({ step: 'ListLnmSubscriptions', success: read.ok && inSync, error: readErr });
  }

  const failed = steps.filter((s) => !s.success);
  return {
    ru_owner_id: ownerId,
    subscribed: rlnm.ok && lnm.ok,
    in_sync: inSync,
    steps,
    warning: failed.length
      ? `Live notifications: ${failed.map((s) => `${s.step} — ${s.error}`).join('; ')}`
      : null,
  };
}
