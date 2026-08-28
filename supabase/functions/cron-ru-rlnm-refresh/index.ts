import { createClient } from 'npm:@supabase/supabase-js@2';
import { resolveRuOwnerScopes } from '../_shared/ruOwnerScopes.ts';
import { readInvokeError } from '../_shared/functionInvokeError.ts';
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
  error_code?: string | null;
  detail?: Record<string, unknown>;
}

/**
 * The channel allows one call per method per sliding minute. A deferral is compliance, not an
 * outage, so it is logged with `RU_RATE_DEFERRED` and never as an unclassified failure.
 */
const RATE_DEFERRED_CODE = 'RU_RATE_DEFERRED';
const looksRateDeferred = (code: string | null, message: string | null): boolean =>
  code === RATE_DEFERRED_CODE ||
  /rate limited|per 1 minute sliding|sliding minute|too many requests|deferred by the channel/i
    .test(message ?? '');



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
  const requestBody = await req.json().catch(() => ({})) as { owner_id?: string };
  const requestedOwnerId = String(requestBody.owner_id ?? '').trim();

  const results: StepResult[] = [];
  const deferred: string[] = [];
  const skipped: string[] = [];

  const resolvedScopes = await resolveRuOwnerScopes(supabase, 'PutHandlerUrl', {
    includeMaster: false,
    requireOperationalPush: true,
  });
  // Onboarding invokes this endpoint for the account that has just become operational.
  // Limiting the run to that OwnerID avoids waiting behind every other account's RU
  // sliding-minute windows and makes live reservation notifications active immediately.
  const scopes = requestedOwnerId
    ? resolvedScopes.filter((scope) => scope.ownerId === requestedOwnerId)
    : resolvedScopes;

  // Owners the master subscription should observe. Only MONITORED accounts qualify:
  // an OwnerID whose API keys have never been captured is not provisioned at the channel,
  // and including it makes RU reject the WHOLE subscription push ("Unexpected error"),
  // which silently leaves every good owner unnotified.
  const { data: ownerRows } = await supabase
    .from('ru_owner_accounts')
    .select('ru_owner_id, ru_login_email, owner_email, ru_api_access_key')
    .not('ru_owner_id', 'is', null);
  const { data: keyRows } = await supabase.from('ru_api_credentials').select('ru_owner_id, access_key');
  const ownersWithKeys = new Set(
    (keyRows ?? [])
      .filter((k: { access_key: string | null }) => !!k.access_key)
      .map((k: { ru_owner_id: string }) => String(k.ru_owner_id).trim()),
  );

  const subUserOwnerIds: string[] = [];
  const unprovisionedOwners: string[] = [];
  for (const r of (ownerRows ?? []) as {
    ru_owner_id: string;
    ru_login_email: string | null;
    owner_email: string | null;
    ru_api_access_key: string | null;
  }[]) {
    const id = String(r.ru_owner_id).trim();
    if (!/^\d+$/.test(id)) continue;
    if (ownersWithKeys.has(id) || !!r.ru_api_access_key) subUserOwnerIds.push(id);
    else unprovisionedOwners.push(`${r.ru_login_email ?? r.owner_email ?? 'sub-user'} (OwnerID ${id})`);
  }

  // The channel-manager (master) account holds no inventory of its own: every sub-user registers
  // its OWN subscription under its own keys (the loop below). Asking master to observe sub-user
  // OwnerIDs is what RU answers with a bare "Unexpected error". So master only ever observes its
  // own OwnerID, and when none is configured its LNM steps are skipped as not applicable.
  const masterOwnerId = (Deno.env.get('RU_MASTER_OWNER_ID') ?? Deno.env.get('RU_OWNER_ID') ?? '').trim();
  const masterObservedOwners = masterOwnerId && /^\d+$/.test(masterOwnerId) ? [masterOwnerId] : [];
  console.log(
    `[cron-ru-rlnm-refresh] monitored sub-user owners: ${subUserOwnerIds.join(', ') || '(none)'}`,
  );
  if (unprovisionedOwners.length) {
    console.warn(
      `[cron-ru-rlnm-refresh] ${unprovisionedOwners.length} account(s) have no API keys captured — not monitored: ${unprovisionedOwners.join(', ')}`,
    );
  }

  if (scopes.length === 0) {
    const msg = 'No operational Channel Manager sub-accounts — notification refresh skipped.';
    console.log(`[cron-ru-rlnm-refresh] ${msg}`);
    return new Response(
      JSON.stringify({
        success: true,
        handler_url: handlerUrl,
        lnm_url_base: lnmUrlBase,
        observed_owners: [],
        unprovisioned_owners: unprovisionedOwners,
        results: [],
        deferred,
        skipped: [msg],
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }


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
    errorCode: string | null = null,
  ) => {
    await supabase
      .from('ru_sync_runs')
      .insert({
        batch_id: batchId,
        action: step,
        success,
        error_code: errorCode,
        error_message: errMsg,
        elapsed_ms: elapsedMs,
        details: { scope: 'daily_lnm', ru_owner_id: scopeOwnerId, account: label, ...details },
      })
      .then(() => {}, (e) => console.warn('[cron-ru-rlnm-refresh] log insert failed', e));
  };

  /** One Push_PutLiveNotificationMechanismSubscriptions_RQ call. */
  const putSubscriptions = async (
    owners: string[],
    scopePayload: Record<string, unknown>,
    scopeOwnerId: string | null,
  ): Promise<{ ok: boolean; error: string | null; code: string | null }> => {
    try {
      const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
        body: {
          action: 'put_lnm_subscriptions',
          url_base: lnmUrlBase,
          change_types: DEFAULT_LNM_CHANGE_TYPES,
          observed_owners: owners,
          ...scopePayload,
        },
      });
      if (error || !data?.success) {
        // `invoke` hides the real body behind "non-2xx status code" — read it back.
        const body = error
          ? await readInvokeError(error, 'Channel rejected the subscription push')
          : { message: data?.error?.message ?? 'Channel rejected the subscription push', errorCode: data?.error?.code ?? null, httpStatus: null };
        const code = body.errorCode ?? (data?.rate_deferred === true || data?.queued === true ? RATE_DEFERRED_CODE : null);
        return {
          ok: false,
          error: body.httpStatus ? `${body.message} (HTTP ${body.httpStatus})` : body.message,
          code: looksRateDeferred(code, body.message) ? RATE_DEFERRED_CODE : code,
        };
      }
      if (scopeOwnerId && data.auth_mode === 'master') {
        return {
          ok: false,
          error: `RU answered on MASTER credentials — this sub-user's LNM subscription was not registered.`,
          code: null,
        };
      }
      return { ok: true, error: null, code: null };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'Unknown error', code: null };
    }
  };


  for (const scope of scopes) {
    const observedOwners = scope.ownerId ? [scope.ownerId] : masterObservedOwners;
    // Owners RU actually accepted this run — the read-back is judged against these.
    let acceptedOwners: string[] = observedOwners;


    // ── 1. RLNM handler (reservations) ──
    if (await paceFor('PutHandlerUrl')) {
      const t0 = Date.now();
      lastCall.set('PutHandlerUrl', t0);
      let success = false;
      let errMsg: string | null = null;
      let errCode: string | null = null;
      try {
        const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'subscribe_notifications', handler_url: handlerUrl, ...scope.payload },
        });
        if (error || !data?.success) {
          // A bare `error.message` is always "Edge Function returned a non-2xx status code",
          // which is what made this land in the report's unclassified bucket. Read the body.
          const body = error
            ? await readInvokeError(error, 'Channel rejected the notification handler')
            : { message: data?.error?.message ?? 'Channel rejected the notification handler', errorCode: data?.error?.code ?? null, httpStatus: null };
          errMsg = body.httpStatus ? `${body.message} (HTTP ${body.httpStatus})` : body.message;
          errCode = body.errorCode ?? (data?.rate_deferred === true || data?.queued === true ? RATE_DEFERRED_CODE : null);
          if (looksRateDeferred(errCode, errMsg)) errCode = RATE_DEFERRED_CODE;
        } else if (scope.ownerId && data.auth_mode === 'master') {
          errMsg = `RU answered on MASTER credentials — add this sub-user's RU AccessKey/SecretKey before its notifications can be registered.`;
        } else {
          success = true;
        }
      } catch (err) {
        errMsg = err instanceof Error ? err.message : 'Unknown error';
      }
      if (!success && errCode === RATE_DEFERRED_CODE) {
        // Compliance, not an outage: report as deferred so the health report never grades it red.
        deferred.push(`${scope.label} · RLNM handler (channel rate window)`);
      } else {
        results.push({ account: scope.label, step: 'PutHandlerUrl', success, error: errMsg, error_code: errCode });
      }
      await logStep('PutHandlerUrl', scope.ownerId, scope.label, success, errMsg, Date.now() - t0, {
        handler_url: handlerUrl,
      }, errCode);
    } else {
      deferred.push(`${scope.label} · RLNM handler`);
    }


    // ── 2. LNM subscriptions (content / ARI) ──
    if (observedOwners.length === 0) {
      // Master with no OwnerID of its own: nothing to subscribe here. Sub-user scopes below
      // carry the real subscriptions, so this is not a failure — skip both LNM steps.
      skipped.push(`${scope.label} · LNM subscriptions (no OwnerID of its own — sub-users subscribe individually)`);
      console.log(`[cron-ru-rlnm-refresh] ${scope.label}: LNM steps not applicable — no OwnerID to observe`);
      continue;
    } else if (await paceFor('PutLnmSubscriptions')) {
      const t0 = Date.now();

      lastCall.set('PutLnmSubscriptions', t0);
      let errMsg: string | null = null;
      let errCode: string | null = null;
      const rejectedOwners: string[] = [];

      const first = await putSubscriptions(observedOwners, scope.payload, scope.ownerId);
      let success = first.ok;

      // One bad OwnerID makes RU reject the whole list. Isolate it: retry per owner so the
      // good owners stay subscribed and the refused one is named.
      if (!success && observedOwners.length > 1) {
        const accepted: string[] = [];
        for (const owner of observedOwners) {
          if (!(await paceFor('PutLnmSubscriptions'))) {
            deferred.push(`${scope.label} · LNM subscriptions (owner ${owner})`);
            continue;
          }
          lastCall.set('PutLnmSubscriptions', Date.now());
          const attempt = await putSubscriptions([...accepted, owner], scope.payload, scope.ownerId);
          if (attempt.ok) accepted.push(owner);
          else rejectedOwners.push(owner);
        }
        acceptedOwners = accepted;
        success = accepted.length > 0;
        if (rejectedOwners.length) {
          errCode = 'RU_LNM_OWNER_REJECTED';
          errMsg = `Channel refused OwnerID ${rejectedOwners.join(', ')} — subscription registered for ${accepted.length}/${observedOwners.length} owner(s). Confirm the account exists and its keys are captured.`;
        } else if (!success) {
          errCode = 'RU_LNM_PUT_FAILED';
          errMsg = first.error;
        }
      } else if (!success) {
        acceptedOwners = [];
        errCode = 'RU_LNM_PUT_FAILED';
        errMsg = first.error;
      }

      results.push({
        account: scope.label,
        step: 'PutLnmSubscriptions',
        success: success && rejectedOwners.length === 0,
        error: errMsg,
        error_code: errCode,
      });
      await logStep(
        'PutLnmSubscriptions',
        scope.ownerId,
        scope.label,
        success && rejectedOwners.length === 0,
        errMsg,
        Date.now() - t0,
        {
          url_base: lnmUrlBase,
          change_types: DEFAULT_LNM_CHANGE_TYPES,
          observed_owners: observedOwners,
          accepted_owners: acceptedOwners,
          rejected_owners: rejectedOwners,
        },
        errCode,
      );
    } else {
      deferred.push(`${scope.label} · LNM subscriptions`);
    }



    // ── 3. Read-back verification ──
    if (await paceFor('ListLnmSubscriptions')) {
      const t0 = Date.now();
      lastCall.set('ListLnmSubscriptions', t0);
      let success = false;
      let errMsg: string | null = null;
      let errCode: string | null = null;
      let detail: Record<string, unknown> = {};
      try {
        const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
          body: { action: 'list_lnm_subscriptions', ...scope.payload },
        });
        if (error || !data?.success) {
          errMsg = error?.message || data?.error?.message || 'Channel did not answer the subscription read-back';
          errCode = 'RU_LNM_READBACK_FAILED';
        } else {
          const actual = data.subscriptions ?? parseLnmSubscriptions(String(data.raw_xml ?? ''));
          // Judge against what RU actually accepted this run: an owner we deliberately
          // excluded (or that RU refused) is not this step's failure.
          const drift = diffLnmSubscriptions(actual, {
            change_types: DEFAULT_LNM_CHANGE_TYPES,
            observed_owners: acceptedOwners,
            url_base: lnmUrlBase,
          });
          detail = { actual, drift, accepted_owners: acceptedOwners, unprovisioned_owners: unprovisionedOwners };
          success = drift.in_sync;
          if (drift.extra_owners.length) {
            console.log(
              `[cron-ru-rlnm-refresh] ${scope.label}: channel still observes stale owner(s) ${drift.extra_owners.join(', ')} — informational only`,
            );
          }
          if (!success) {
            const parts: string[] = [];
            if (!drift.url_matches) parts.push(`UrlBase at RU is ${actual.url_base ?? '(none)'}`);
            if (drift.missing_change_types.length) parts.push(`missing types: ${drift.missing_change_types.join(', ')}`);
            if (drift.missing_owners.length) parts.push(`missing owners: ${drift.missing_owners.join(', ')}`);
            errMsg = `LNM subscription drift — ${parts.join('; ')}`;
            errCode = 'RU_LNM_DRIFT';
          } else if (acceptedOwners.length === 0) {
            // Nothing was registered because no owner is provisioned: a setup gap, not a fault.
            success = false;
            errCode = 'RU_LNM_OWNER_UNPROVISIONED';
            errMsg = `Nothing to verify — no monitored OwnerID for this account. Capture the AccessKey/SecretKey in Portfolios → RU accounts.`;
          }
        }
      } catch (err) {
        errMsg = err instanceof Error ? err.message : 'Unknown error';
        errCode = 'RU_LNM_READBACK_FAILED';
      }
      results.push({ account: scope.label, step: 'ListLnmSubscriptions', success, error: errMsg, error_code: errCode, detail });
      await logStep('ListLnmSubscriptions', scope.ownerId, scope.label, success, errMsg, Date.now() - t0, detail, errCode);
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
      unprovisioned_owners: unprovisionedOwners,
      results,



      deferred,
      skipped,

    }),
    { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
  );
});
