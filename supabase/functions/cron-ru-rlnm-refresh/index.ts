import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveRuOwnerScopes } from '../_shared/ruOwnerScopes.ts';
import {
  DEFAULT_LNM_CHANGE_TYPES,
  diffLnmSubscriptions,
  parseLnmSubscriptions,
} from '../_shared/ruLnm.ts';

/**
 * Daily cron: refresh Rentals United live-notification infrastructure.
 *
 * Three methods per account, all of which RU expects to be refreshed at least
 * every 24 hours:
 *   1. LNM_PutHandlerUrl_RQ                                  → reservations (RLNM)
 *   2. Push_PutLiveNotificationMechanismSubscriptions_RQ      → content / ARI (LNM)
 *   3. Pull_ListLiveNotificationMechanismSubscriptions_RQ     → read-back verification
 *
 * Credentials: notification subscriptions are registered PER ACCOUNT. Registering
 * them only on the master account means white-label sub-users never notify us, so
 * this fans out over master + every sub-user with API keys.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** RU rate limit: one call per METHOD per sliding minute (+1s safety). */
const METHOD_WINDOW_MS = 61_000;
const RUN_BUDGET_MS = 12 * 60_000;

interface StepResult {
  account: string;
  step: 'PutHandlerUrl' | 'PutLnmSubscriptions' | 'ListLnmSubscriptions';
  success: boolean;
  error: string | null;
  detail?: Record<string, unknown>;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabase = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const handlerUrl = `${supabaseUrl}/functions/v1/ru-reservation-handler`;
  const lnmUrlBase = `${supabaseUrl}/functions/v1/ru-lnm-handler`;
  const startedAt = Date.now();
  const deadline = startedAt + RUN_BUDGET_MS;
  const batchId = crypto.randomUUID();

  const results: StepResult[] = [];
  const deferred: string[] = [];

  const scopes = await resolveRuOwnerScopes(supabase, 'PutHandlerUrl');

  // Every OwnerID we want RU to observe on the master subscription: all linked
  // sub-users, plus the master OwnerID when it is configured.
  const { data: ownerRows } = await supabase
    .from('ru_owner_accounts')
    .select('ru_owner_id')
    .not('ru_owner_id', 'is', null);
  const subUserOwnerIds = (ownerRows ?? [])
    .map((r: { ru_owner_id: string }) => String(r.ru_owner_id).trim())
    .filter((id) => /^\d+$/.test(id));
  const masterOwnerId = (Deno.env.get('RU_MASTER_OWNER_ID') ?? Deno.env.get('RU_OWNER_ID') ?? '').trim();
  const masterObservedOwners = Array.from(
    new Set([...(masterOwnerId && /^\d+$/.test(masterOwnerId) ? [masterOwnerId] : []), ...subUserOwnerIds]),
  );

  /** Last time each RU method was called in this run, for per-method pacing. */
  const lastCall = new Map<string, number>();
  const paceFor = async (method: string): Promise<boolean> => {
    const last = lastCall.get(method);
    if (last == null) return true;
    const waitMs = last + METHOD_WINDOW_MS - Date.now();
    if (waitMs <= 0) return true;
    if (Date.now() + waitMs > deadline) return false;
    await new Promise((r) => setTimeout(r, waitMs));
    return true;
  };

  const logStep = async (
    step: StepResult['step'],
    scopeOwnerId: string | null,
    label: string,
    success: boolean,
    errMsg: string | null,
    elapsedMs: number,
    details: Record<string, unknown>,
  ) => {
    await supabase
      .from('ru_sync_runs')
      .insert({
        batch_id: batchId,
        action: step,
        success,
        error_message: errMsg,
        elapsed_ms: elapsedMs,
        details: { scope: 'daily_lnm', ru_owner_id: scopeOwnerId, account: label, ...details },
      })
      .then(() => {}, (e) => console.warn('[cron-ru-rlnm-refresh] log insert failed', e));
  };

  for (const scope of scopes) {
    const observedOwners = scope.ownerId ? [scope.ownerId] : masterObservedOwners;

    // ── 1. RLNM handler (reservations) ──
    if (await paceFor('PutHandlerUrl')) {
      const t0 = Date.now();
      lastCall.set('PutHandlerUrl', t0);
      let success = false;
      let errMsg: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'subscribe_notifications', handler_url: handlerUrl, ...scope.payload },
        });
        if (error || !data?.success) {
          errMsg = error?.message || data?.error?.message || 'Unknown error';
        } else if (scope.ownerId && data.auth_mode === 'master') {
          errMsg = `RU answered on MASTER credentials — add this sub-user's RU AccessKey/SecretKey before its notifications can be registered.`;
        } else {
          success = true;
        }
      } catch (err) {
        errMsg = err instanceof Error ? err.message : 'Unknown error';
      }
      results.push({ account: scope.label, step: 'PutHandlerUrl', success, error: errMsg });
      await logStep('PutHandlerUrl', scope.ownerId, scope.label, success, errMsg, Date.now() - t0, {
        handler_url: handlerUrl,
      });
    } else {
      deferred.push(`${scope.label} · RLNM handler`);
    }

    // ── 2. LNM subscriptions (content / ARI) ──
    if (observedOwners.length === 0) {
      const msg = 'No RU OwnerID available to observe — set RU_MASTER_OWNER_ID or link at least one sub-user account.';
      results.push({ account: scope.label, step: 'PutLnmSubscriptions', success: false, error: msg });
      await logStep('PutLnmSubscriptions', scope.ownerId, scope.label, false, msg, 0, { url_base: lnmUrlBase });
    } else if (await paceFor('PutLnmSubscriptions')) {
      const t0 = Date.now();
      lastCall.set('PutLnmSubscriptions', t0);
      let success = false;
      let errMsg: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
          body: {
            action: 'put_lnm_subscriptions',
            url_base: lnmUrlBase,
            change_types: DEFAULT_LNM_CHANGE_TYPES,
            observed_owners: observedOwners,
            ...scope.payload,
          },
        });
        if (error || !data?.success) {
          errMsg = error?.message || data?.error?.message || 'Unknown error';
        } else if (scope.ownerId && data.auth_mode === 'master') {
          errMsg = `RU answered on MASTER credentials — this sub-user's LNM subscription was not registered.`;
        } else {
          success = true;
        }
      } catch (err) {
        errMsg = err instanceof Error ? err.message : 'Unknown error';
      }
      results.push({ account: scope.label, step: 'PutLnmSubscriptions', success, error: errMsg });
      await logStep('PutLnmSubscriptions', scope.ownerId, scope.label, success, errMsg, Date.now() - t0, {
        url_base: lnmUrlBase,
        change_types: DEFAULT_LNM_CHANGE_TYPES,
        observed_owners: observedOwners,
      });
    } else {
      deferred.push(`${scope.label} · LNM subscriptions`);
    }

    // ── 3. Read-back verification ──
    if (await paceFor('ListLnmSubscriptions')) {
      const t0 = Date.now();
      lastCall.set('ListLnmSubscriptions', t0);
      let success = false;
      let errMsg: string | null = null;
      let detail: Record<string, unknown> = {};
      try {
        const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'list_lnm_subscriptions', ...scope.payload },
        });
        if (error || !data?.success) {
          errMsg = error?.message || data?.error?.message || 'Unknown error';
        } else {
          const actual = data.subscriptions ?? parseLnmSubscriptions(String(data.raw_xml ?? ''));
          const drift = diffLnmSubscriptions(actual, {
            change_types: DEFAULT_LNM_CHANGE_TYPES,
            observed_owners: observedOwners,
            url_base: lnmUrlBase,
          });
          detail = { actual, drift };
          success = drift.in_sync;
          if (!success) {
            const parts: string[] = [];
            if (!drift.url_matches) parts.push(`UrlBase at RU is ${actual.url_base ?? '(none)'}`);
            if (drift.missing_change_types.length) parts.push(`missing types: ${drift.missing_change_types.join(', ')}`);
            if (drift.missing_owners.length) parts.push(`missing owners: ${drift.missing_owners.join(', ')}`);
            errMsg = `LNM subscription drift — ${parts.join('; ')}`;
          }
        }
      } catch (err) {
        errMsg = err instanceof Error ? err.message : 'Unknown error';
      }
      results.push({ account: scope.label, step: 'ListLnmSubscriptions', success, error: errMsg, detail });
      await logStep('ListLnmSubscriptions', scope.ownerId, scope.label, success, errMsg, Date.now() - t0, detail);
    } else {
      deferred.push(`${scope.label} · LNM read-back`);
    }

    console.log(
      `[cron-ru-rlnm-refresh] ${scope.label}: ` +
        results
          .filter((r) => r.account === scope.label)
          .map((r) => `${r.step}=${r.success ? 'OK' : `FAIL(${r.error})`}`)
          .join(' '),
    );

    if (Date.now() > deadline) {
      deferred.push(...scopes.slice(scopes.indexOf(scope) + 1).map((s) => s.label));
      break;
    }
  }

  const allOk = results.length > 0 && results.every((r) => r.success);

  return new Response(
    JSON.stringify({
      success: allOk,
      handler_url: handlerUrl,
      lnm_url_base: lnmUrlBase,
      observed_owners: masterObservedOwners,
      results,
      deferred,
    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
