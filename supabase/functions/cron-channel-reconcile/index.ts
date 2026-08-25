/**
 * cron-channel-reconcile
 *
 * Nightly equivalent of the "Reconcile with Channel" button on
 * /admin/channel-monitor. It pulls every listing the channel-manager accounts
 * actually hold, classifies it against local records and — when the two sides
 * disagree — emails dev / fearless leader with the findings, the action to take
 * and a direct link back to the monitor page.
 *
 * Every run is recorded in `channel_reconciliation_runs`, clean or not.
 */
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@2';
import { getOpsAlertRecipients } from '../_shared/opsAlertRecipients.ts';

const MONITOR_URL = 'https://sleepinafrica.roomsonline.co.za/admin/channel-monitor';

interface ReconAccount {
  owner_id: string;
  owner_email: string | null;
  listing_count: number;
  error: string | null;
  is_master?: boolean;
  bound?: boolean;
  has_keys?: boolean;
  /** Bound to a ROL'OS property/portfolio and holding keys — the only accounts we alert on. */
  monitored?: boolean;
}
interface ReconListing {
  listing_id: string;
  name: string;
  owner_id: string;
  copies?: number;
  keep_listing_id?: string;
}
interface ReconStale {
  listing_id: string;
  label: string;
  kind: string;
  record_id: string;
  property_id: string;
}
interface ReconDetachedAccount {
  owner_id: string;
  owner_label: string;
  last_known_listing_count: number | null;
  needs_billing_verification?: boolean;
}
interface ReconResult {
  reconciled_at: string;
  accounts: ReconAccount[];
  /** Bound accounts the master no longer lists — informational, never a disparity. */
  detached_accounts?: ReconDetachedAccount[];
  channel_listing_count: number;
  archived_count: number;
  matched: unknown[];
  orphans: ReconListing[];
  duplicates: ReconListing[];
  stale: ReconStale[];
  success?: boolean;
  error?: string;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

function accountLabel(accounts: ReconAccount[], ownerId: string): string {
  const acc = accounts.find((a) => String(a.owner_id) === String(ownerId));
  return acc?.owner_email ? `${acc.owner_email} (#${ownerId})` : `#${ownerId}`;
}

function section(
  title: string,
  action: string,
  headers: string[],
  rows: string[][],
): string {
  if (rows.length === 0) return '';
  return `
    <h3 style="margin:28px 0 4px;font:600 15px/1.3 Helvetica,Arial,sans-serif;color:#1A1A2E;">
      ${esc(title)} <span style="color:#E91E8C;">(${rows.length})</span>
    </h3>
    <p style="margin:0 0 10px;font:400 13px/1.5 Helvetica,Arial,sans-serif;color:#55555f;">
      ${esc(action)}
    </p>
    <table role="presentation" cellpadding="8" cellspacing="0" width="100%"
      style="border-collapse:collapse;font:400 12px/1.4 Helvetica,Arial,sans-serif;color:#1A1A2E;">
      <tr style="background:#F6F3EE;">
        ${headers.map((h) => `<th align="left" style="border-bottom:1px solid #e3ddd3;">${esc(h)}</th>`).join('')}
      </tr>
      ${rows
        .map(
          (r) =>
            `<tr>${r
              .map((c) => `<td style="border-bottom:1px solid #efe9e0;">${esc(c)}</td>`)
              .join('')}</tr>`,
        )
        .join('')}
    </table>`;
}

function buildEmail(
  result: ReconResult,
  localBillable: number,
  errored: ReconAccount[],
  monitored: ReconAccount[],
): string {
  const accounts = result.accounts || [];
  return `<!doctype html><html><body style="margin:0;background:#FBF9F5;padding:24px;">
  <div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e8e2d8;border-radius:14px;overflow:hidden;">
    <div style="background:#1A1A2E;padding:20px 24px;">
      <p style="margin:0;font:400 11px/1 Helvetica,Arial,sans-serif;letter-spacing:.18em;text-transform:uppercase;color:#E91E8C;">ROL'OS · Channel Manager</p>
      <h1 style="margin:6px 0 0;font:400 24px/1.2 Georgia,serif;color:#FBF9F5;">Reconciliation disparity detected</h1>
    </div>
    <div style="padding:24px;">
      <p style="margin:0 0 16px;font:400 14px/1.6 Helvetica,Arial,sans-serif;color:#1A1A2E;">
        The nightly check ran at ${esc(new Date(result.reconciled_at || Date.now()).toUTCString())}.
        The channel manager holds <strong>${result.channel_listing_count}</strong> live listing(s);
        ROL'OS matches <strong>${localBillable}</strong> of them.
      </p>

      ${section(
        'Accounts monitored',
        'Only accounts bound to ROL\u2019OS with stored keys are monitored. Retired and test sub-accounts are ignored.',
        ['Channel account', 'OwnerID', 'Live listings', 'Status'],
        monitored.map((a) => [
          a.owner_email || 'Unnamed sub-account',
          `#${a.owner_id}`,
          String(a.listing_count ?? 0),
          a.error ? 'Could not be read' : 'Verified',
        ]),
      )}


      ${section(
        'Orphan listings on the channel',
        'These live listings have no local record and keep billing. Remove them at the channel from the monitor page.',
        ['Listing', 'Name', 'Channel account'],
        (result.orphans || []).map((o) => [`#${o.listing_id}`, o.name, accountLabel(accounts, o.owner_id)]),
      )}

      ${section(
        'Duplicate copies',
        'Surplus same-name copies of a unit. Each copy bills — remove the copies and keep the listing ROL\u2019OS references.',
        ['Listing', 'Name', 'Keep', 'Channel account'],
        (result.duplicates || []).map((d) => [
          `#${d.listing_id}`,
          d.name,
          `#${d.keep_listing_id ?? '—'}`,
          accountLabel(accounts, d.owner_id),
        ]),
      )}

      ${section(
        'Stale local listing ids',
        'ROL\u2019OS points at listing ids the channel no longer knows. Clear the local id so the next push recreates the listing.',
        ['Listing', 'Local record', 'Type'],
        (result.stale || []).map((s) => [`#${s.listing_id}`, s.label, s.kind]),
      )}

      ${section(
        'Sub-accounts no longer under the master',
        'Excluded from every count above — our keys can no longer read them. Confirm with the channel that they and their listings moved off our invoice.',
        ['Channel account', 'Last known live listings'],
        (result.detached_accounts || []).map((a) => [
          a.owner_label,
          a.last_known_listing_count === null ? 'Unknown' : String(a.last_known_listing_count),
        ]),
      )}

      ${section(
        'Accounts that could not be verified',
        'These accounts returned an error, so their listings were not checked. Re-check the sub-account keys.',
        ['Channel account', 'Error'],
        errored.map((a) => [a.owner_email ? `${a.owner_email} (#${a.owner_id})` : `#${a.owner_id}`, a.error || 'Unknown error']),
      )}

      <div style="margin:28px 0 8px;text-align:center;">
        <a href="${MONITOR_URL}"
          style="display:inline-block;background:#E91E8C;color:#ffffff;text-decoration:none;padding:13px 26px;border-radius:999px;font:600 14px/1 Helvetica,Arial,sans-serif;">
          Open the Channel Monitor
        </a>
      </div>
      <p style="margin:0;text-align:center;font:400 11px/1.5 Helvetica,Arial,sans-serif;color:#8a8a95;">
        ${MONITOR_URL}
      </p>
    </div>
  </div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status,
    });

  let trigger = 'cron';
  try {
    const body = await req.json().catch(() => null);
    if (body && typeof body === 'object' && typeof (body as any).trigger === 'string') {
      trigger = (body as any).trigger;
    }
  } catch {
    /* no body */
  }

  try {
    const { data, error } = await admin.functions.invoke('channel-manager-entitlement', {
      body: { scope: 'reconcile', entity_id: 'all' },
    });
    if (error) throw error;

    const result = (data || {}) as ReconResult;
    if (result.success === false) throw new Error(result.error || 'Reconciliation failed');

    const accounts = result.accounts || [];
    // Retired / test sub-accounts (unbound, or bound without keys) are out of scope:
    // they hold nothing we sell or bill, so they never raise a warning.
    const isMonitored = (a: ReconAccount) =>
      a.monitored === true || (a.monitored === undefined && a.bound === true && a.has_keys === true);
    const monitored = accounts.filter(isMonitored);
    const unmonitored = accounts.filter((a) => !isMonitored(a));

    const erroredOwners = new Set(accounts.filter((a) => a.error).map((a) => String(a.owner_id)));
    const errored = monitored.filter((a) => !!a.error);

    const orphans = (result.orphans || []).filter((o) => !erroredOwners.has(String(o.owner_id)));
    const duplicates = (result.duplicates || []).filter((d) => !erroredOwners.has(String(d.owner_id)));
    const stale = result.stale || [];
    // Detached accounts are already absent from `accounts`: informational only, so
    // they can never raise a disparity or count as an errored account.
    const detached = result.detached_accounts || [];
    const localBillable = (result.matched || []).length;

    const hasDisparity =
      orphans.length > 0 || duplicates.length > 0 || stale.length > 0 || errored.length > 0;


    let alertSent = false;
    let alertError: string | null = null;
    let recipients: string[] = [];

    if (hasDisparity) {
      recipients = await getOpsAlertRecipients(admin);
      try {
        const resendKey = Deno.env.get('RESEND_API_KEY');
        if (!resendKey) throw new Error('RESEND_API_KEY not configured');

        const { data: emailConfig } = await admin
          .from('api_keys')
          .select('key_value')
          .eq('key_name', 'RESEND_FROM_EMAIL')
          .maybeSingle();
        const from = emailConfig?.key_value || 'RoomsOnline <hello@notify.roomsonline.co.za>';

        const bits: string[] = [];
        if (orphans.length) bits.push(`${orphans.length} orphan listing${orphans.length === 1 ? '' : 's'}`);
        if (duplicates.length) bits.push(`${duplicates.length} duplicate${duplicates.length === 1 ? '' : 's'}`);
        if (stale.length) bits.push(`${stale.length} stale id${stale.length === 1 ? '' : 's'}`);
        if (errored.length) bits.push(`${errored.length} account${errored.length === 1 ? '' : 's'} unverified`);

        const resend = new Resend(resendKey);
        const { error: sendError } = await resend.emails.send({
          from,
          to: recipients,
          subject: `⚠️ Channel manager disparity — ${bits.join(', ')}`,
          html: buildEmail(
            { ...result, orphans, duplicates, stale },
            localBillable,
            errored,
            monitored,
          ),
        });
        if (sendError) throw new Error(sendError.message || 'Resend rejected the message');
        alertSent = true;
      } catch (e) {
        alertError = e instanceof Error ? e.message : String(e);
        console.error('[cron-channel-reconcile] alert send failed:', alertError);
      }
    }

    await admin.from('channel_reconciliation_runs').insert({
      trigger,
      channel_listing_count: result.channel_listing_count || 0,
      local_billable_listings: localBillable,
      orphan_count: orphans.length,
      duplicate_count: duplicates.length,
      stale_count: stale.length,
      error_account_count: errored.length,
      has_disparity: hasDisparity,
      findings: {
        orphans,
        duplicates,
        stale,
        errored_accounts: errored,
        monitored_accounts: monitored,
        unmonitored_accounts: unmonitored,
        detached_accounts: detached,
      },
      alert_sent: alertSent,
      alert_recipients: recipients,
      alert_error: alertError,
    });

    // Refresh the stored availability/pricing verdicts overnight so the wizard can serve
    // them instantly during the day instead of pulling the channel on every page load.
    let refreshed = 0;
    try {
      const { data: listed } = await admin
        .from('properties')
        .select('id')
        .not('rentalsunited_property_id', 'is', null)
        .eq('is_active', true)
        .limit(100);
      for (const row of (listed ?? []) as { id: string }[]) {
        try {
          await admin.functions.invoke('ru-cert-portal', {
            body: { action: 'property_readiness', property_id: row.id, probe_ari: false },
          });
          refreshed += 1;
        } catch (e) {
          console.warn('[cron-channel-reconcile] readiness refresh failed for', row.id, e);
        }
      }
    } catch (e) {
      console.warn('[cron-channel-reconcile] readiness refresh sweep failed:', e);
    }

    console.log(
      `[cron-channel-reconcile] disparity=${hasDisparity} orphans=${orphans.length} duplicates=${duplicates.length} stale=${stale.length} detached=${detached.length} alert_sent=${alertSent} readiness_refreshed=${refreshed}`,
    );


    return json({
      success: true,
      has_disparity: hasDisparity,
      orphans: orphans.length,
      duplicates: duplicates.length,
      stale: stale.length,
      errored_accounts: errored.length,
      detached_accounts: detached.length,
      alert_sent: alertSent,
      alert_error: alertError,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[cron-channel-reconcile] failed:', message);
    await admin
      .from('channel_reconciliation_runs')
      .insert({ trigger, run_error: message })
      .then(() => undefined, () => undefined);
    return json({ success: false, error: message }, 500);
  }
});
