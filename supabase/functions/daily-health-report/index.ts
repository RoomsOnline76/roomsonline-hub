import { createClient } from 'npm:@supabase/supabase-js@2';
import { Resend } from 'npm:resend@2';
import { AI_MODELS } from "../_shared/aiModels.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LOVABLE_AI_URL = 'https://ai.gateway.lovable.dev/v1/chat/completions';

interface AIDigest {
  summary: string;
  priority_action: string;
  opportunity: string;
}

async function generateAIDigest(
  overallStatus: string,
  uptimePercentage: number,
  failedCount: number,
  totalComponents: number,
  criticalIssues: Array<{ component: string; message: string }>,
  bookingStats: { total: number; confirmed: number; pending: number; failed: number },
  channelHealth: {
    success_rate: number;
    failing: Array<{ action: string; success_rate: number; failed: number; last_run: string | null }>;
    recovered: Array<{ action: string; last_failure_at: string | null }>;
    top_errors: Array<{ action: string; code: string; count: number; sample: string; recovered: boolean }>;
    rate_deferrals: number;
    setup_gaps: Array<{ reason: string; count: number; properties: string[]; kind?: 'setup' | 'account' }>;
    reconciled: Array<{ reason: string; count: number }>;

    blocked_outstanding: Array<{ blocker: string; count: number; properties: string[] }>;
    blocked_cleared: Array<{ blocker: string; count: number; properties: string[]; cleared_at: string | null }>;
  } | null,

): Promise<AIDigest | null> {
  const apiKey = Deno.env.get('LOVABLE_API_KEY');
  if (!apiKey) {
    console.log('[Daily Health Report] LOVABLE_API_KEY not configured, skipping AI digest');
    return null;
  }

  try {
    const prompt = `Analyze this system health data and provide a brief executive summary.

System Status: ${overallStatus}
Uptime: ${uptimePercentage.toFixed(1)}%
Failed Components: ${failedCount}/${totalComponents}
Critical Issues: ${criticalIssues.length > 0 ? criticalIssues.map(i => `${i.component}: ${i.message}`).join('; ') : 'None'}
Bookings (24h): ${bookingStats.total} total, ${bookingStats.confirmed} confirmed, ${bookingStats.pending} pending, ${bookingStats.failed} failed
${channelHealth ? `Channel/distribution pipelines (24h): overall success ${channelHealth.success_rate.toFixed(1)}%
Currently failing pipelines: ${channelHealth.failing.length > 0 ? channelHealth.failing.map(a => `${a.action} (${a.success_rate.toFixed(0)}% success, ${a.failed} failures, last run ${a.last_run || 'unknown'})`).join('; ') : 'None'}
Recovered since last failure: ${channelHealth.recovered.length > 0 ? channelHealth.recovered.map(a => `${a.action} (last failed ${a.last_failure_at || 'unknown'})`).join('; ') : 'None'}
Top channel errors: ${channelHealth.top_errors.length > 0 ? channelHealth.top_errors.map(e => `${e.action}: ${e.code} ×${e.count}${e.recovered ? ' (recovered)' : ''} — ${e.sample}`).join('; ') : 'None'}
Rate-limit deferrals (held back and retried, NOT errors): ${channelHealth.rate_deferrals}
Waiting on owner setup / account reconciliation (operational, NOT code defects — never call these bugs): ${channelHealth.setup_gaps.length > 0 ? channelHealth.setup_gaps.map(g => `${g.kind === 'account' ? '[account conflict] ' : ''}${g.reason} ×${g.count}${g.properties.length > 0 ? ` (${g.properties.join(', ')})` : ''}`).join('; ') : 'None'}
Account conflicts RECENTLY RECONCILED (successes to note, do NOT recommend work): ${channelHealth.reconciled.length > 0 ? channelHealth.reconciled.map(r => `${r.reason} (stopped occurring)`).join('; ') : 'None'}

Wizard-gate refusals STILL outstanding (work genuinely needed): ${channelHealth.blocked_outstanding.length > 0 ? channelHealth.blocked_outstanding.map(b => `${b.blocker} ×${b.count}${b.properties.length > 0 ? ` (${b.properties.join(', ')})` : ''}`).join('; ') : 'None'}
Wizard-gate refusals ALREADY CLEARED (do NOT recommend these): ${channelHealth.blocked_cleared.length > 0 ? channelHealth.blocked_cleared.map(b => `${b.blocker}${b.cleared_at ? ` cleared ${b.cleared_at}` : ''}`).join('; ') : 'None'}` : 'Channel/distribution pipelines: no data in window'}


Rules: never report all-clear while a pipeline above is listed as currently failing. Distinguish a currently failing pipeline from one that has recovered. Treat repeated upstream 5xx errors as a third-party outage, not a code defect. Never present rate-limit deferrals or owner-setup gaps as failures or incidents — mention them only as informational notes. Wizard-gate refusals are not pipeline failures: never recommend a step listed as already cleared, and only raise refusals listed as still outstanding.

Respond with exactly this JSON format:
{
  "summary": "2-sentence executive summary of system health",
  "priority_action": "Most important action needed (or 'None required' if healthy)",
  "opportunity": "Key opportunity or positive insight"
}`;

    const response = await fetch(LOVABLE_AI_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: AI_MODELS.health_report,
        messages: [
          { role: 'system', content: 'You are a technical operations analyst. Be direct, specific, and actionable. No marketing language.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[Daily Health Report] AI API error:', response.status, errorText);
      return null;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      console.error('[Daily Health Report] No content in AI response');
      return null;
    }

    // Parse JSON from response (handle markdown code blocks)
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[Daily Health Report] Could not extract JSON from response:', content);
      return null;
    }

    return JSON.parse(jsonMatch[0]) as AIDigest;
  } catch (error) {
    console.error('[Daily Health Report] AI digest generation error:', error);
    return null;
  }
}

interface ComponentStats {
  component_key: string;
  component_name: string;
  component_type: string;
  is_critical: boolean;
  total_checks: number;
  healthy_count: number;
  degraded_count: number;
  failed_count: number;
  uptime_percentage: number;
  avg_latency_ms: number;
  last_status: string;
  last_checked: string;
  failure_count_24h: number;
}

interface PmsIntegrationStats {
  name: string;
  property_count: number;
  last_sync_time: string | null;
  /** Where the last-sync evidence came from: scheduled push/pull, live fetch, or the health probe. */
  last_sync_source: string | null;
  /** True when the evidence is older than the expected refresh cadence. */
  stale: boolean;
  success_rate: number;
}


interface DevTask {
  id: string;
  title: string;
  description: string | null;
  status: 'new' | 'started' | 'testing' | 'completed';
  priority: 'low' | 'medium' | 'high' | 'critical';
  assigned_to: string | null;
  assigned_name: string | null;
  created_at: string;
}

interface RuWlActionStat {
  action: string;
  total: number;
  failed: number;
  success_rate: number;
  avg_ms: number;
  last_run: string | null;
  current_ok: boolean | null;
  recovered: boolean;
  last_failure_at: string | null;
}

interface RuWlMetrics {
  window_hours: number;
  total: number;
  failed: number;
  success_rate: number;
  actions: RuWlActionStat[];
  top_errors: Array<{ action: string; code: string; count: number; sample: string; recovered: boolean }>;
  reservations_24h: number;
  reservations_unprocessed: number;
  last_reservation_at: string | null;
  ari_last_push_at: string | null;
  ari_stale_hours: number | null;
  cert: { status: string; passed: number; total: number; at: string | null } | null;
  /** Trading properties with a real channel footprint (building listing or unit listings). */
  live_properties: number;
  /** Distribution sub-accounts on record — an account is not a property. */
  distribution_accounts: number;
  /**
   * Wizard-gate refusals. `phase_blocked` records are evidence that a push was refused,
   * never a pipeline outcome, so they are reported here and resolved against current state.
   */
  blocked: {
    outstanding: Array<{ blocker: string; count: number; properties: string[] }>;
    cleared: Array<{ blocker: string; count: number; properties: string[]; cleared_at: string | null }>;
  };
  current_ok: boolean | null;
  recovered_actions: number;
  /** Calls the shared sliding-window gate deferred — compliance, not an outage. */
  rate_deferrals: number;
  /**
   * Owner-configuration gaps (no distribution account, no owner email, listing unmapped) and
   * account reconciliation conflicts (login already registered, listing owned elsewhere).
   */
  setup_gaps: Array<{ reason: string; count: number; properties: string[]; kind: 'setup' | 'account' }>;
  /** Account conflicts seen in the previous window that have stopped appearing — cleared wins. */
  reconciled: Array<{ reason: string; count: number }>;

  /** Background call queue: work parked by the rate gate and replayed by the drainer. */
  call_queue: { waiting: number; oldest_waiting_minutes: number | null; drained_24h: number; gave_up: number };
}

interface RunLike {
  success?: boolean | null;
  error_code?: string | null;
  error_message?: string | null;
}

/**
 * The channel allows one call per method+parameters per sliding minute. A deferral means the
 * shared gate held the call back and it will be retried — never an outage.
 */
const isRateDeferral = (r: RunLike): boolean =>
  r.error_code === 'RU_RATE_DEFERRED' ||
  /rate limited|per 1 minute sliding|deferred by the channel rate window/i.test(r.error_message ?? '');

/**
 * Owner-configuration gaps are not pipeline defects — nothing is broken, the account setup is
 * incomplete — so they are reported separately from real errors.
 */
const isSetupGap = (r: RunLike): boolean =>
  /no rentals united ownerid|no ownerid linked|ownerid linked to this property|usable property-owner email|unmapped ru property|not mapped|invalid session|did not return .*sub-user|waiting on owner setup|own accesskey|api key pair|no verified api key|accesskey\/secretkey captured|no monitored ru ownerid|no monitored ownerid|nothing to verify/i
    .test(r.error_message ?? '') ||
  ['RU_LNM_OWNER_UNPROVISIONED', 'RU_LNM_NO_OWNERS'].includes(
    String((r as { error_code?: string | null }).error_code ?? ''),
  );
/**
 * Account-level registration / ownership conflicts (a login already registered on the channel,
 * a listing owned by another account) are operational reconciliation work, not code defects.
 * They are bucketed with setup gaps so a permanent conflict never turns a pipeline red.
 */
const isAccountConflict = (r: RunLike): boolean =>
  /account registration conflict|already registered|email already in use|email in use|login already exists|user already exists|belongs to (another|a different) (account|owner|user)|owned by (another|a different) (account|owner|user)|ownership conflict|master account conflict|duplicate (account|sub-user)/i
    .test(r.error_message ?? '') ||
  ['RU_EMAIL_IN_USE', 'RU_ACCOUNT_CONFLICT', 'RU_LOGIN_IN_USE'].includes(
    String((r as { error_code?: string | null }).error_code ?? ''),
  );

/** Neither a defect nor an outage: owner setup work or account reconciliation work. */
const isNonFault = (r: RunLike): boolean => isSetupGap(r) || isAccountConflict(r);

/**
 * Refusal records are audit evidence, not pipelines: `phase_blocked` only ever writes
 * success = false, so grading it as an action leaves it permanently red even after the
 * blocker clears. It is reported in its own resolved-against-now block instead.
 */
const REFUSAL_ACTIONS = new Set(['phase_blocked']);

const isRefusalRecord = (r: { action?: string | null }): boolean =>
  REFUSAL_ACTIONS.has(String(r.action ?? ''));

const isPipelineFailure = (r: RunLike): boolean =>
  r.success === false && !isRateDeferral(r) && !isNonFault(r);


const RU_PRIORITY_ACTIONS = [
  'push_reservation',
  'pull_reservations',
  'push_ari',
  'push_availability',
  'push_prices',
  'push_property',
];


function hoursSince(iso: string | null): number | null {
  if (!iso) return null;
  return (Date.now() - new Date(iso).getTime()) / 3600000;
}

function shortTime(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleString('en-ZA', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function getTaskStatusColor(status: string): string {
  switch (status) {
    case 'new': return '#6b7280';
    case 'started': return '#3b82f6';
    case 'testing': return '#f59e0b';
    case 'completed': return '#22c55e';
    default: return '#6b7280';
  }
}

function getTaskPriorityEmoji(priority: string): string {
  switch (priority) {
    case 'critical': return '🔴';
    case 'high': return '🟠';
    case 'medium': return '🟡';
    case 'low': return '🟢';
    default: return '⚪';
  }
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-ZA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-ZA', {
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'healthy': return '#22c55e';
    case 'degraded': return '#eab308';
    case 'failed': return '#ef4444';
    default: return '#6b7280';
  }
}

function getStatusEmoji(status: string): string {
  switch (status) {
    case 'healthy': return '🟢';
    case 'degraded': return '🟡';
    case 'failed': return '🔴';
    default: return '⚪';
  }
}

interface InactiveComponent {
  component_key: string;
  component_name: string;
  component_type: string;
}

/**
 * Single source of truth for the report headline. A failing sync pipeline is a real outage even
 * when every component probe is green, so both the email body strip AND the subject line derive
 * from this — the subject must never read "All Systems Operational" while the body says otherwise.
 */
function computeEffectiveStatus(
  overallStatus: string,
  ruWl: RuWlMetrics | null,
  criticalCount = 0,
): { status: string; label: string; failingActions: string[] } {
  const failingActions = (ruWl?.actions ?? []).filter(a => a.current_ok === false).map(a => a.action);
  const pipelineFailing = failingActions.length > 0;
  const status = overallStatus === 'failed' || criticalCount > 0
    ? 'failed'
    : pipelineFailing || overallStatus === 'degraded'
      ? 'degraded'
      : overallStatus;
  const label = status === 'healthy'
    ? 'All Systems Operational'
    : status === 'degraded'
      ? pipelineFailing
        ? `Degraded — ${failingActions.join(', ')} failing`
        : 'Some Issues Detected'
      : 'Critical Issues';
  return { status, label, failingActions };
}

function generateEmailHtml(
  date: string,
  generatedAt: string,
  overallStatus: string,
  uptimePercentage: number,
  failedCount: number,
  totalComponents: number,
  componentStats: ComponentStats[],
  criticalIssues: Array<{ component: string; message: string; last_failed: string }>,
  pmsIntegrations: PmsIntegrationStats[],
  inactiveComponents: InactiveComponent[],
  nextCheckTime: string,
  aiDigest: AIDigest | null,
  devTasks: DevTask[],
  ruWl: RuWlMetrics | null
): string {
  const { status: effectiveStatus, label: overallStatusLabel } = computeEffectiveStatus(overallStatus, ruWl);
  const overallStatusColor = getStatusColor(effectiveStatus);


  const card = 'background-color:#ffffff;border:1px solid #e5e7eb;border-radius:8px;';
  const h3 = 'margin:0 0 8px 0;font-size:15px;font-weight:600;color:#111827;';
  const th = 'padding:6px 8px;text-align:left;font-weight:600;color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.03em;';
  const td = 'padding:6px 8px;font-size:13px;color:#374151;';

  const chip = (label: string, value: string | number, color: string) => `
    <span style="display:inline-block;background-color:${color}15;color:${color};border:1px solid ${color}30;padding:3px 9px;border-radius:9999px;font-size:12px;font-weight:600;margin:0 6px 6px 0;">
      ${label} ${value}
    </span>`;

  // ---------- 1. Channel Manager (Rentals United white-label) ----------
  const rateColor = (r: number) => (r >= 99 ? '#22c55e' : r >= 95 ? '#eab308' : '#ef4444');

  const ruSection = ruWl ? `
    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
      <h3 style="${h3}">🔗 Channel Manager — Rentals United White-Label <span style="font-weight:400;color:#9ca3af;font-size:12px;">(last ${ruWl.window_hours}h)</span></h3>
      <div style="margin-bottom:10px;">
        ${chip('Calls', ruWl.total, '#0ea5e9')}
        ${chip('Success (24h)', `${ruWl.success_rate.toFixed(1)}%`, rateColor(ruWl.success_rate))}
        ${chip('Now', ruWl.current_ok === null ? 'no data' : ruWl.current_ok ? (ruWl.recovered_actions > 0 ? 'Recovered' : 'Healthy') : 'Failing', ruWl.current_ok === null ? '#9ca3af' : ruWl.current_ok ? '#22c55e' : '#ef4444')}
        ${chip('Failed', ruWl.failed, ruWl.failed > 0 ? '#ef4444' : '#22c55e')}
        ${chip('Reservations', ruWl.reservations_24h, '#7c3aed')}
        ${ruWl.reservations_unprocessed > 0 ? chip('Unprocessed', ruWl.reservations_unprocessed, '#ef4444') : ''}
        ${chip('Live properties on channel', ruWl.live_properties, '#374151')}
        ${chip('Distribution accounts', ruWl.distribution_accounts, '#374151')}
        ${chip('ARI pushed', ruWl.ari_stale_hours === null ? 'never' : `${ruWl.ari_stale_hours.toFixed(1)}h ago`, ruWl.ari_stale_hours === null || ruWl.ari_stale_hours > 8 ? '#ef4444' : '#22c55e')}
        ${ruWl.cert ? chip('Certification', `${ruWl.cert.passed}/${ruWl.cert.total}`, ruWl.cert.passed === ruWl.cert.total ? '#22c55e' : '#eab308') : ''}
      </div>
      ${ruWl.actions.length > 0 ? `
      <table style="width:100%;border-collapse:collapse;${card}">
        <thead><tr style="background-color:#f9fafb;">
          <th style="${th}">Action</th><th style="${th}">Calls</th><th style="${th}">Fail</th><th style="${th}">Success (24h)</th><th style="${th}">Now</th><th style="${th}">Avg</th><th style="${th}">Last run</th>
        </tr></thead>
        <tbody>
          ${ruWl.actions.map(a => `
          <tr style="border-top:1px solid #f3f4f6;">
            <td style="${td}font-weight:500;">${a.action}</td>
            <td style="${td}">${a.total}</td>
            <td style="${td}color:${a.failed > 0 ? '#ef4444' : '#6b7280'};font-weight:${a.failed > 0 ? '600' : '400'};">${a.failed}</td>
            <td style="${td}color:${rateColor(a.success_rate)};font-weight:600;">${a.success_rate.toFixed(1)}%</td>
            <td style="${td}">${a.current_ok === null
              ? '<span style="color:#9ca3af;">—</span>'
              : a.current_ok
                ? `<span style="color:#16a34a;font-weight:600;">● OK${a.recovered ? ' (recovered)' : ''}</span>`
                : '<span style="color:#dc2626;font-weight:600;">● Failing</span>'}${a.recovered && a.last_failure_at ? `<span style="color:#9ca3af;font-size:11px;"> last fail ${a.last_failure_at}</span>` : ''}</td>
            <td style="${td}color:#6b7280;">${a.avg_ms}ms</td>
            <td style="${td}color:#6b7280;">${a.last_run || '—'}</td>
          </tr>`).join('')}
        </tbody>
      </table>` : '<p style="margin:0;font-size:13px;color:#9ca3af;">No channel activity recorded in the window.</p>'}
      ${ruWl.rate_deferrals > 0 ? `
      <p style="margin:6px 0 0;font-size:11px;color:#6b6b78;">
        ${ruWl.rate_deferrals} call(s) were held back by the channel's one-per-minute rate gate and retried — no data was lost.
      </p>` : ''}
      ${(ruWl.call_queue.waiting > 0 || ruWl.call_queue.drained_24h > 0 || ruWl.call_queue.gave_up > 0) ? `
      <p style="margin:6px 0 0;font-size:11px;color:#6b6b78;">
        Background call queue: ${ruWl.call_queue.waiting} waiting${ruWl.call_queue.oldest_waiting_minutes !== null ? ` (oldest ${ruWl.call_queue.oldest_waiting_minutes} min)` : ''},
        ${ruWl.call_queue.drained_24h} completed in 24h${ruWl.call_queue.gave_up > 0 ? `, ${ruWl.call_queue.gave_up} gave up after all retries` : ''}. Queued work is pending, not failed.
      </p>` : ''}
      ${(ruWl.setup_gaps.length > 0 || ruWl.reconciled.length > 0) ? `
      <div style="margin-top:10px;background-color:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;">
        <strong style="font-size:12px;color:#92400e;">Waiting on owner setup / account reconciliation (not a fault)</strong>
        <ul style="margin:6px 0 0 0;padding-left:18px;color:#78350f;font-size:12px;">
          ${ruWl.setup_gaps.map(g => `<li style="margin-bottom:3px;">${g.kind === 'account' ? '<em>Account conflict</em> — ' : ''}${g.reason} — ×${g.count}${g.properties.length > 0 ? ` · ${g.properties.join(', ')}` : ''}</li>`).join('')}
          ${ruWl.reconciled.map(r => `<li style="margin-bottom:3px;color:#15803d;">Reconciled — ${r.reason} (no longer occurring)</li>`).join('')}
        </ul>
      </div>` : ''}

      ${(ruWl.blocked.outstanding.length > 0 || ruWl.blocked.cleared.length > 0) ? `
      <div style="margin-top:10px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px;">
        <strong style="font-size:12px;color:#334155;">Pushes refused by the Channel wizard gate (not pipeline errors)</strong>
        <ul style="margin:6px 0 0 0;padding-left:18px;color:#475569;font-size:12px;">
          ${ruWl.blocked.outstanding.map(b => `<li style="margin-bottom:3px;"><strong>Outstanding</strong> — ${b.blocker}${b.properties.length > 0 ? ` · ${b.properties.join(', ')}` : ''}</li>`).join('')}
          ${ruWl.blocked.cleared.map(b => `<li style="margin-bottom:3px;color:#16a34a;">Cleared${b.cleared_at ? ` at ${b.cleared_at}` : ''} — ${b.blocker}${b.properties.length > 0 ? ` · ${b.properties.join(', ')}` : ''}</li>`).join('')}
        </ul>
      </div>` : ''}

      ${ruWl.top_errors.length > 0 ? `
      <div style="margin-top:10px;background-color:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 12px;">
        <strong style="font-size:12px;color:#b91c1c;">Top failures (24h)</strong>${ruWl.recovered_actions > 0 ? `<span style="font-size:11px;color:#9ca3af;"> · ${ruWl.recovered_actions} action(s) have since recovered — see the “Now” column</span>` : ''}
        <ul style="margin:6px 0 0 0;padding-left:18px;color:#7f1d1d;font-size:12px;">
          ${ruWl.top_errors.map(e => `<li style="margin-bottom:3px;"><strong>${e.action} · ${e.code}</strong> ×${e.count}${e.recovered ? ' · <span style="color:#9ca3af;">recovered</span>' : ''} — ${e.sample}</li>`).join('')}
        </ul>
      </div>` : ''}
      <p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;">Cadence: reservations pull &amp; lead lifecycle every 30 min · ARI refresh every 6h · content push weekly · notification (RLNM) refresh daily.</p>
    </div>
  ` : '';

  // ---------- 2. Attention: components not healthy ----------
  const unhealthy = componentStats.filter(c => c.last_status !== 'healthy' || c.failure_count_24h > 0);
  const healthyCount = componentStats.length - componentStats.filter(c => c.last_status !== 'healthy').length;

  const attentionSection = `
    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
      <h3 style="${h3}">🩺 Components needing attention <span style="font-weight:400;color:#9ca3af;font-size:12px;">(${healthyCount}/${totalComponents} healthy)</span></h3>
      ${unhealthy.length === 0 ? '<p style="margin:0;font-size:13px;color:#16a34a;">All monitored components healthy with zero failures in 24h.</p>' : `
      <table style="width:100%;border-collapse:collapse;${card}">
        <thead><tr style="background-color:#f9fafb;">
          <th style="${th}">Component</th><th style="${th}">Status</th><th style="${th}">24h fails</th><th style="${th}">Uptime</th><th style="${th}">Latency</th><th style="${th}">Checked</th>
        </tr></thead>
        <tbody>
          ${unhealthy.map(c => `
          <tr style="border-top:1px solid #f3f4f6;">
            <td style="${td}font-weight:500;">${c.is_critical ? '★ ' : ''}${c.component_name}</td>
            <td style="${td}color:${getStatusColor(c.last_status)};font-weight:600;">${getStatusEmoji(c.last_status)} ${c.last_status.toUpperCase()}</td>
            <td style="${td}color:${c.failure_count_24h > 0 ? '#ef4444' : '#6b7280'};font-weight:600;">${c.failure_count_24h}</td>
            <td style="${td}">${c.uptime_percentage.toFixed(1)}%</td>
            <td style="${td}color:#6b7280;">${c.avg_latency_ms}ms</td>
            <td style="${td}color:#6b7280;">${c.last_checked}</td>
          </tr>`).join('')}
        </tbody>
      </table>`}
    </div>`;

  // ---------- 3. PMS / integrations one-liner rollup ----------
  const pmsSection = pmsIntegrations.length > 0 ? `
    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
      <h3 style="${h3}">🏨 PMS integrations</h3>
      <table style="width:100%;border-collapse:collapse;${card}">
        <thead><tr style="background-color:#f9fafb;">
          <th style="${th}">PMS</th><th style="${th}">Properties</th><th style="${th}">Last sync</th><th style="${th}">Success</th>
        </tr></thead>
        <tbody>
          ${pmsIntegrations.map(p => `
          <tr style="border-top:1px solid #f3f4f6;">
            <td style="${td}font-weight:500;">${p.name}</td>
            <td style="${td}">${p.property_count}</td>
            <td style="${td}color:${p.stale ? '#f59e0b' : '#6b7280'};">${p.last_sync_time || 'No sync recorded'}${p.last_sync_source ? `<span style="color:#9ca3af;"> · ${p.last_sync_source}</span>` : ''}</td>
            <td style="${td}color:${rateColor(p.success_rate)};font-weight:600;">${p.success_rate.toFixed(1)}%</td>
          </tr>`).join('')}
        </tbody>
      </table>
      <p style="margin:6px 0 0 0;font-size:11px;color:#9ca3af;">Last sync = newest real refresh evidence (channel push/pull, live availability fetch, or scheduled adapter probe). Amber = older than the expected cadence.</p>

      ${inactiveComponents.length > 0 ? `<p style="margin:8px 0 0 0;font-size:11px;color:#9ca3af;">Parked / not active (${inactiveComponents.length}): ${inactiveComponents.map(c => c.component_name).join(' · ')}</p>` : ''}
    </div>` : '';

  // ---------- 4. Dev worklist (condensed) ----------
  const openTasks = devTasks.filter(t => t.status !== 'completed');
  const focusTasks = openTasks
    .filter(t => t.priority === 'critical' || t.priority === 'high')
    .slice(0, 8);

  const taskSection = `
    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;">
      <h3 style="${h3}">📋 Dev worklist</h3>
      <div>
        ${chip('New', devTasks.filter(t => t.status === 'new').length, '#6b7280')}
        ${chip('Started', devTasks.filter(t => t.status === 'started').length, '#3b82f6')}
        ${chip('Testing', devTasks.filter(t => t.status === 'testing').length, '#f59e0b')}
        ${chip('Completed', devTasks.filter(t => t.status === 'completed').length, '#22c55e')}
      </div>
      ${focusTasks.length > 0 ? `
      <ul style="margin:4px 0 0 0;padding-left:18px;font-size:13px;color:#374151;">
        ${focusTasks.map(t => `<li style="margin-bottom:3px;">${getTaskPriorityEmoji(t.priority)} <strong>${t.title}</strong> <span style="color:#9ca3af;">· ${t.status} · ${t.assigned_name || 'unassigned'}</span></li>`).join('')}
      </ul>
      ${openTasks.length > focusTasks.length ? `<p style="margin:6px 0 0 0;font-size:11px;color:#9ca3af;">+ ${openTasks.length - focusTasks.length} other open task(s) at medium/low priority.</p>` : ''}
      ` : '<p style="margin:4px 0 0 0;font-size:13px;color:#9ca3af;">No critical or high-priority tasks open.</p>'}
    </div>`;

  const criticalIssuesSection = criticalIssues.length > 0 ? `
    <div style="background-color:#fef2f2;border-bottom:1px solid #fecaca;padding:16px 20px;">
      <h3 style="margin:0 0 8px 0;font-size:15px;font-weight:600;color:#b91c1c;">⚠️ Critical issues (${criticalIssues.length})</h3>
      <ul style="margin:0;padding-left:18px;color:#7f1d1d;font-size:13px;">
        ${criticalIssues.map(i => `<li style="margin-bottom:4px;"><strong>${i.component}:</strong> ${i.message} <span style="color:#9ca3af;font-size:11px;">(last failed ${i.last_failed})</span></li>`).join('')}
      </ul>
    </div>` : '';

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RoomsOnline Daily Health Report</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;line-height:1.45;color:#1f2937;background-color:#f3f4f6;margin:0;padding:16px;">
  <div style="max-width:760px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#1e3a5f 0%,#0d1b2a 100%);color:#ffffff;padding:20px;">
      <h1 style="margin:0;font-size:18px;font-weight:600;">System Health — Daily Report</h1>
      <p style="margin:4px 0 0 0;opacity:.75;font-size:12px;">${date} · generated ${generatedAt}</p>
    </div>

    <!-- Status strip -->
    <div style="background-color:${overallStatusColor}12;border-bottom:2px solid ${overallStatusColor};padding:12px 20px;">
      <strong style="color:${overallStatusColor};font-size:15px;">${getStatusEmoji(effectiveStatus)} ${overallStatusLabel}</strong>
      <span style="color:#6b7280;font-size:13px;"> · uptime ${uptimePercentage.toFixed(1)}% · components failing ${failedCount}/${totalComponents}${ruWl ? ` · pipelines failing ${failingPipelines.length}/${ruWl.actions.length} · channel success ${ruWl.success_rate.toFixed(1)}%` : ''}</span>
    </div>


    ${criticalIssuesSection}

    ${aiDigest ? `
    <div style="padding:16px 20px;border-bottom:1px solid #e5e7eb;background-color:#f0f9ff;">
      <h3 style="${h3}color:#0369a1;">🧠 TOBI executive summary</h3>
      <p style="margin:0 0 8px 0;font-size:13px;color:#334155;">${aiDigest.summary}</p>
      <p style="margin:0;font-size:12px;color:#475569;"><strong style="color:#dc2626;">Priority:</strong> ${aiDigest.priority_action}</p>
      <p style="margin:2px 0 0 0;font-size:12px;color:#475569;"><strong style="color:#16a34a;">Opportunity:</strong> ${aiDigest.opportunity}</p>
    </div>` : ''}

    ${ruSection}
    ${attentionSection}
    ${pmsSection}
    ${taskSection}

    <!-- Footer -->
    <div style="padding:14px 20px;background-color:#f9fafb;">
      <p style="margin:0;font-size:11px;color:#6b7280;">Health checks run every 30 min (next ${nextCheckTime}). Cached figures only — live channel and PMS verification is always enforced at booking. Details: Admin → Integrations → System Health.</p>
      <p style="margin:6px 0 0 0;font-size:11px;color:#9ca3af;">Automated by the RoomsOnline health monitor · dev@roomsonline.co.za</p>
    </div>
  </div>
</body>
</html>
  `;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const resendApiKey = Deno.env.get('RESEND_API_KEY');

    if (!resendApiKey) {
      throw new Error('RESEND_API_KEY not configured');
    }

    // Parse optional request body for custom recipient
    let customRecipient: string | null = null;
    let isManualTrigger = false;
    
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        customRecipient = body.recipient || null;
        isManualTrigger = body.manual === true;
      } catch {
        // Empty body is fine for scheduled calls
      }
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = new Resend(resendApiKey);

    console.log('[Daily Health Report] Generating report...', { 
      isManualTrigger, 
      customRecipient: customRecipient || 'default' 
    });

    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    // Fetch all components (both active and inactive)
    const { data: allComponents, error: componentsError } = await supabase
      .from('system_health_components')
      .select('*')
      .order('is_active', { ascending: false });

    if (componentsError) throw componentsError;

    // Separate active and inactive
    const activeComponentsList = (allComponents || []).filter(c => c.is_active);
    const inactiveComponentsList: InactiveComponent[] = (allComponents || [])
      .filter(c => !c.is_active)
      .map(c => ({
        component_key: c.component_key,
        component_name: c.component_name,
        component_type: c.component_type,
      }));

    // Fetch last 24h of health checks
    const { data: recentChecks, error: checksError } = await supabase
      .from('system_health_checks')
      .select('*')
      .gte('checked_at', twentyFourHoursAgo.toISOString())
      .order('checked_at', { ascending: false });

    if (checksError) throw checksError;

    // Calculate stats per active component
    const componentStats: ComponentStats[] = activeComponentsList.map(comp => {
      const checks = (recentChecks || []).filter(c => c.component_key === comp.component_key);
      const healthyChecks = checks.filter(c => c.status === 'healthy').length;
      const degradedChecks = checks.filter(c => c.status === 'degraded').length;
      const failedChecks = checks.filter(c => c.status === 'failed').length;
      // Only count checks with known status (healthy, degraded, failed) for uptime calculation
      const knownStatusChecks = healthyChecks + degradedChecks + failedChecks;
      const totalChecks = checks.length;
      
      const latencies = checks.filter(c => c.latency_ms).map(c => c.latency_ms);
      const avgLatency = latencies.length > 0 
        ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)
        : 0;

      const lastCheck = checks[0];
      // Calculate uptime only from checks with known status (exclude 'unknown')
      // If no known status checks, default to 100% (assume healthy if not checked)
      const uptime = knownStatusChecks > 0 
        ? ((healthyChecks + degradedChecks) / knownStatusChecks) * 100 
        : (lastCheck?.status === 'unknown' ? 100 : 0); // Unknown status = assume healthy

      return {
        component_key: comp.component_key,
        component_name: comp.component_name,
        component_type: comp.component_type,
        is_critical: comp.is_critical,
        total_checks: totalChecks,
        healthy_count: healthyChecks,
        degraded_count: degradedChecks,
        failed_count: failedChecks,
        uptime_percentage: uptime,
        avg_latency_ms: avgLatency,
        last_status: lastCheck?.status || 'unknown',
        last_checked: lastCheck 
          ? new Date(lastCheck.checked_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
          : 'Never',
        failure_count_24h: failedChecks,
      };
    });

    // Identify critical issues
    const criticalIssues = componentStats
      .filter(c => c.is_critical && c.last_status === 'failed')
      .map(c => {
        const lastFailedCheck = (recentChecks || [])
          .filter(check => check.component_key === c.component_key && check.status === 'failed')[0];
        return {
          component: c.component_name,
          message: lastFailedCheck?.error_message || 'Component failed',
          last_failed: lastFailedCheck 
            ? new Date(lastFailedCheck.checked_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
            : 'Unknown',
        };
      });

    // Get PMS integration stats
    const pmsComponents = componentStats.filter(c => c.component_type === 'pms');
    
    // Fetch property counts per PMS
    const { data: properties } = await supabase
      .from('properties')
      .select('id, benson_property_code, checkfront_property_code, cloudbeds_property_id, external_system, rentalsunited_property_id')
      .eq('is_active', true);

    // Channel-manager (RU) listings live either at building level or per active unit.
    const { data: ruUnitRows } = await supabase
      .from('hostfully_room_types')
      .select('property_id')
      .eq('is_active', true)
      .not('rentalsunited_property_id', 'is', null);

    const ruPropertyIds = new Set<string>();
    for (const p of properties || []) {
      if (p.rentalsunited_property_id) ruPropertyIds.add(p.id);
    }
    for (const u of ruUnitRows || []) {
      if (u.property_id) ruPropertyIds.add(u.property_id);
    }

    const pmsPropertyCounts: Record<string, number> = {
      benson: (properties || []).filter(p => p.benson_property_code).length,
      checkfront: (properties || []).filter(p => p.checkfront_property_code).length,
      cloudbeds: (properties || []).filter(p => p.cloudbeds_property_id).length,
      hostfully: (properties || []).filter(p => p.external_system === 'hostfully').length,
      hotelbeds: (properties || []).filter(p => p.external_system === 'hotelbeds').length,
      littlehotelier: (properties || []).filter(p => p.external_system === 'littlehotelier').length,
      roomsonline_pms: (properties || []).filter(p => p.external_system === 'roomsonline').length,
      rentalsunited: ruPropertyIds.size,
    };

    // ── Real last-sync evidence per PMS ─────────────────────────────
    // "Never" was an artefact of matching sync_logs.external_system against the
    // component key (e.g. `rentals_united` vs `rentalsunited`) and of ignoring the
    // adapters that refresh through their own tables. Resolve from every source.
    const SYNC_ALIASES: Record<string, string[]> = {
      rentalsunited: ['rentals_united', 'rentalsunited', 'ru'],
      hostfully: ['hostfully'],
      benson: ['benson'],
      hotelbeds: ['hotelbeds'],
      checkfront: ['checkfront'],
      cloudbeds: ['cloudbeds'],
      littlehotelier: ['littlehotelier', 'little_hotelier'],
      nightsbridge: ['nightsbridge'],
      hyperguest: ['hyperguest'],
    };

    // Expected refresh cadence (hours) — beyond this the entry is flagged amber.
    const SYNC_CADENCE_HOURS: Record<string, number> = {
      rentalsunited: 8,
      hostfully: 24,
      benson: 24,
    };

    const [{ data: syncLogs }, { data: ruRuns }, { data: cacheRows }, { data: resRows }] = await Promise.all([
      supabase
        .from('sync_logs')
        .select('external_system, created_at, status')
        .in('status', ['success', 'partial', 'partial_success'])
        .order('created_at', { ascending: false })
        .limit(300),
      supabase
        .from('ru_sync_runs')
        .select('created_at, action, success')
        .eq('success', true)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('pms_availability_cache')
        .select('system_type, fetched_at')
        .order('fetched_at', { ascending: false })
        .limit(300),
      supabase
        .from('pms_reservations')
        .select('system_type, synced_at')
        .order('synced_at', { ascending: false })
        .limit(300),
    ]);

    const fmtStamp = (iso: string) =>
      new Date(iso).toLocaleString('en-ZA', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'Africa/Johannesburg',
      });

    const pmsIntegrations: PmsIntegrationStats[] = pmsComponents.map(pms => {
      const aliases = SYNC_ALIASES[pms.component_key] ?? [pms.component_key];
      const matches = (value: string | null | undefined) =>
        !!value && aliases.some(a => value.toLowerCase().includes(a));

      const candidates: { at: string; source: string }[] = [];

      const logHit = (syncLogs || []).find(l => matches(l.external_system));
      if (logHit) candidates.push({ at: logHit.created_at, source: 'scheduled sync' });

      if (pms.component_key === 'rentalsunited') {
        const runHit = (ruRuns || []).find(r =>
          ['refresh_ari', 'inventory_push', 'pull_reservations', 'weekly_content_refresh'].includes(r.action)
        );
        if (runHit) candidates.push({ at: runHit.created_at, source: 'channel push/pull' });
      }

      const cacheHit = (cacheRows || []).find(c => matches(c.system_type));
      if (cacheHit?.fetched_at) candidates.push({ at: cacheHit.fetched_at, source: 'live availability fetch' });

      const resHit = (resRows || []).find(r => matches(r.system_type));
      if (resHit?.synced_at) candidates.push({ at: resHit.synced_at, source: 'reservation pull' });

      // The scheduled adapter probe is itself a refresh — it proves the link is alive.
      const probeHit = (recentChecks || []).find(
        c => c.component_key === pms.component_key && (c.status === 'healthy' || c.status === 'degraded')
      );
      if (probeHit?.checked_at) candidates.push({ at: probeHit.checked_at, source: 'adapter probe' });

      candidates.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
      const best = candidates[0] ?? null;

      const cadence = SYNC_CADENCE_HOURS[pms.component_key];
      const ageHours = best ? (now.getTime() - new Date(best.at).getTime()) / 3_600_000 : Infinity;
      const stale = cadence ? ageHours > cadence : false;

      return {
        name: pms.component_name,
        property_count: pmsPropertyCounts[pms.component_key] || 0,
        last_sync_time: best ? fmtStamp(best.at) : null,
        last_sync_source: best ? best.source : null,
        stale,
        success_rate: pms.uptime_percentage,
      };
    });


    // Calculate overall stats
    const totalComponents = componentStats.length;
    const failedCount = componentStats.filter(c => c.last_status === 'failed').length;
    const overallUptime = componentStats.length > 0
      ? componentStats.reduce((sum, c) => sum + c.uptime_percentage, 0) / componentStats.length
      : 0;

    const overallStatus = criticalIssues.length > 0 
      ? 'failed' 
      : failedCount > 0 
        ? 'degraded' 
        : 'healthy';

    // Generate AI digest
    const bookingStats = { total: 0, confirmed: 0, pending: 0, failed: 0 };
    const { data: recentBookings } = await supabase
      .from('bookings')
      .select('status')
      .gte('created_at', twentyFourHoursAgo.toISOString());
    
    if (recentBookings) {
      bookingStats.total = recentBookings.length;
      bookingStats.confirmed = recentBookings.filter((b: { status: string }) => b.status === 'confirmed').length;
      bookingStats.pending = recentBookings.filter((b: { status: string }) => b.status === 'pending').length;
      bookingStats.failed = recentBookings.filter((b: { status: string }) => b.status === 'failed').length;
    }

    // Fetch dev tasks (non-archived only)
    const { data: rawDevTasks } = await supabase
      .from('dev_tasks')
      .select('id, title, description, status, priority, assigned_to, created_at')
      .eq('is_archived', false)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: false });

    // Fetch assignee names
    let devTasks: DevTask[] = [];
    if (rawDevTasks && rawDevTasks.length > 0) {
      const assignedIds = [...new Set((rawDevTasks || []).filter(t => t.assigned_to).map(t => t.assigned_to))];
      
      let profilesMap: Record<string, string> = {};
      if (assignedIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', assignedIds);
        
        (profiles || []).forEach((p: { id: string; full_name: string | null; email: string }) => {
          profilesMap[p.id] = p.full_name || p.email || 'Unknown';
        });
      }

      devTasks = (rawDevTasks || []).map(task => ({
        id: task.id,
        title: task.title,
        description: task.description,
        status: task.status as DevTask['status'],
        priority: task.priority as DevTask['priority'],
        assigned_to: task.assigned_to,
        assigned_name: task.assigned_to ? profilesMap[task.assigned_to] || null : null,
        created_at: task.created_at,
      }));
    }

    // ---- Channel Manager (Rentals United white-label) metrics, last 24h ----
    let ruWl: RuWlMetrics | null = null;
    try {
      const [{ data: syncRuns }, { data: ruNotifs }, { data: certRuns }, { count: ownerCount }] = await Promise.all([
        supabase
          .from('ru_sync_runs')
          .select('action, success, error_code, error_message, elapsed_ms, created_at, property_id')
          .gte('created_at', twentyFourHoursAgo.toISOString())
          .order('created_at', { ascending: false })
          .limit(5000),
        supabase
          .from('ru_notifications')
          .select('processed, created_at')
          .gte('created_at', twentyFourHoursAgo.toISOString())
          .order('created_at', { ascending: false })
          .limit(2000),
        supabase
          .from('ru_cert_runs')
          .select('status, passed, total, finished_at, created_at')
          .order('created_at', { ascending: false })
          .limit(1),
        supabase.from('ru_owner_accounts').select('id', { count: 'exact', head: true }),
      ]);

      // Previous window (48h → 24h ago): used only to celebrate conflicts that have stopped.
      const fortyEightHoursAgo = new Date(Date.now() - 48 * 3600000);
      const { data: priorRuns } = await supabase
        .from('ru_sync_runs')
        .select('success, error_code, error_message')
        .gte('created_at', fortyEightHoursAgo.toISOString())
        .lt('created_at', twentyFourHoursAgo.toISOString())
        .limit(5000);

      const allRuns = syncRuns || [];

      // Wizard refusals are not calls: they must not pad totals or grade an action.
      const runs = allRuns.filter(r => !isRefusalRecord(r));
      const refusalRuns = allRuns.filter(isRefusalRecord);
      const byAction = new Map<string, typeof runs>();
      for (const r of runs) {
        const key = r.action || 'unknown';
        if (!byAction.has(key)) byAction.set(key, []);
        byAction.get(key)!.push(r);
      }

      const actions: RuWlActionStat[] = [...byAction.entries()]
        .map(([action, list]) => {
          // Rate deferrals and owner-setup gaps are not failures — they must not colour an action red.
          const failed = list.filter(isPipelineFailure).length;
          const latencies = list.filter(r => r.elapsed_ms).map(r => r.elapsed_ms as number);
          return {
            action,
            total: list.length,
            failed,
            success_rate: list.length > 0 ? ((list.length - failed) / list.length) * 100 : 100,
            avg_ms: latencies.length > 0 ? Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length) : 0,
            last_run: shortTime(list[0]?.created_at ?? null),
            // list is ordered newest-first: current state = outcome of the most recent run
            current_ok: list.length > 0 ? !isPipelineFailure(list[0]) : null,
            recovered: failed > 0 && list.length > 0 && !isPipelineFailure(list[0]),
            last_failure_at: shortTime(list.find(isPipelineFailure)?.created_at ?? null),
          };
        })

        .sort((a, b) => {
          // Priority first (business-critical flows), then failures, then volume
          const pa = RU_PRIORITY_ACTIONS.indexOf(a.action);
          const pb = RU_PRIORITY_ACTIONS.indexOf(b.action);
          const ra = pa === -1 ? 99 : pa;
          const rb = pb === -1 ? 99 : pb;
          if (ra !== rb) return ra - rb;
          if (b.failed !== a.failed) return b.failed - a.failed;
          return b.total - a.total;
        })
        .slice(0, 8);

      const rateDeferrals = runs.filter(r => r.success === false && isRateDeferral(r)).length;
      const setupGapRuns = runs.filter(r => r.success === false && !isRateDeferral(r) && isNonFault(r));

      const gapCounts = new Map<string, { count: number; propertyIds: Set<string>; kind: 'setup' | 'account' }>();
      for (const r of setupGapRuns) {
        const reason = (r.error_message || 'Setup incomplete').slice(0, 120);
        const kind: 'setup' | 'account' = isAccountConflict(r) ? 'account' : 'setup';
        const entry = gapCounts.get(reason) || { count: 0, propertyIds: new Set<string>(), kind };
        entry.count += 1;
        const pid = (r as { property_id?: string | null }).property_id;
        if (pid) entry.propertyIds.add(pid);
        gapCounts.set(reason, entry);
      }
      const gapPropertyIds = [...new Set(setupGapRuns.map(r => (r as { property_id?: string | null }).property_id).filter(Boolean))] as string[];
      const gapNames = new Map<string, string>();
      if (gapPropertyIds.length > 0) {
        const { data: gapProps } = await supabase
          .from('properties')
          .select('id, name')
          .in('id', gapPropertyIds.slice(0, 50));
        for (const p of gapProps ?? []) gapNames.set(p.id as string, p.name as string);
      }
      const setupGaps = [...gapCounts.entries()]
        .map(([reason, v]) => ({
          reason,
          count: v.count,
          kind: v.kind,
          properties: [...v.propertyIds].map(id => gapNames.get(id) ?? id.slice(0, 8)).slice(0, 6),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 5);

      /**
       * Conflicts that were happening in the previous window and have stopped: the reconciliation
       * worked, so the report says so instead of silently dropping the line.
       */
      const currentConflictReasons = new Set(
        setupGapRuns.filter(isAccountConflict).map(r => (r.error_message || '').slice(0, 120)),
      );
      const priorConflictCounts = new Map<string, number>();
      for (const r of priorRuns ?? []) {
        if (r.success !== false || !isAccountConflict(r)) continue;
        const reason = (r.error_message || 'Account conflict').slice(0, 120);
        if (currentConflictReasons.has(reason)) continue;
        priorConflictCounts.set(reason, (priorConflictCounts.get(reason) ?? 0) + 1);
      }
      const reconciled = [...priorConflictCounts.entries()]
        .map(([reason, count]) => ({ reason, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);



      /**
       * Wizard refusals resolved against current state. A refusal only matters if its blocker
       * is STILL true — company details accepted a minute later must read "cleared", never
       * "now failing", and the AI summary must not ask for work that already happened.
       */
      const blockedOutstanding: Array<{ blocker: string; count: number; properties: string[] }> = [];
      const blockedCleared: Array<{ blocker: string; count: number; properties: string[]; cleared_at: string | null }> = [];

      if (refusalRuns.length > 0) {
        const blockedPropertyIds = [...new Set(
          refusalRuns.map(r => (r as { property_id?: string | null }).property_id).filter(Boolean),
        )] as string[];

        const [{ data: blockedProps }, { data: memberRows }, { data: ownerAccounts }, { data: creds }] = await Promise.all([
          blockedPropertyIds.length > 0
            ? supabase.from('properties').select('id, name').in('id', blockedPropertyIds)
            : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
          blockedPropertyIds.length > 0
            ? supabase.from('property_portfolio_members').select('property_id, portfolio_id').in('property_id', blockedPropertyIds)
            : Promise.resolve({ data: [] as Array<{ property_id: string; portfolio_id: string }> }),
          supabase
            .from('ru_owner_accounts')
            .select('ru_owner_id, portfolio_id, property_id, company_details_status, company_filled_at'),
          supabase.from('ru_api_credentials').select('ru_owner_id, verified_at'),
        ]);

        const nameById = new Map<string, string>((blockedProps ?? []).map((p: any) => [p.id, p.name]));
        const portfolioByProperty = new Map<string, string>((memberRows ?? []).map((m: any) => [m.property_id, m.portfolio_id]));
        const verifiedByOwner = new Map<string, string | null>((creds ?? []).map((c: any) => [String(c.ru_owner_id), c.verified_at]));

        const accountFor = (propertyId: string | null) => {
          if (!propertyId) return null;
          const direct = (ownerAccounts ?? []).find((a: any) => a.property_id === propertyId);
          if (direct) return direct as any;
          const portfolioId = portfolioByProperty.get(propertyId);
          return (ownerAccounts ?? []).find((a: any) => portfolioId && a.portfolio_id === portfolioId) ?? null;
        };

        /** Returns the clearance timestamp when the blocker no longer holds, else null. */
        const clearedAt = (propertyId: string | null, blocker: string, refusedAt: string): string | null => {
          const later = runs.find(
            r =>
              (r as { property_id?: string | null }).property_id === propertyId &&
              r.success === true &&
              new Date(r.created_at as string).getTime() > new Date(refusedAt).getTime(),
          );
          const account = accountFor(propertyId);
          const verifiedAt = account ? verifiedByOwner.get(String((account as any).ru_owner_id)) ?? null : null;

          if (/company details/i.test(blocker)) {
            const status = String((account as any)?.company_details_status ?? '').toLowerCase();
            const filledAt = (account as any)?.company_filled_at as string | null;
            const ok =
              ['sent', 'already_set'].includes(status) &&
              !!filledAt &&
              !!verifiedAt &&
              new Date(filledAt).getTime() >= new Date(verifiedAt).getTime() - 60_000;
            return ok ? filledAt : null;
          }
          if (/key ?& ?secret|accesskey|api key/i.test(blocker)) {
            return verifiedAt;
          }
          return (later?.created_at as string) ?? null;
        };

        const groups = new Map<string, { count: number; properties: Set<string>; clearedAt: (string | null)[] }>();
        for (const r of refusalRuns) {
          const pid = (r as { property_id?: string | null }).property_id ?? null;
          const blockers = String(r.error_message ?? 'Push refused by the Channel wizard gate')
            .split('; ')
            .map(b => b.trim())
            .filter(Boolean);
          for (const blocker of blockers) {
            const entry = groups.get(blocker) ?? { count: 0, properties: new Set<string>(), clearedAt: [] };
            entry.count += 1;
            if (pid) entry.properties.add(nameById.get(pid) ?? pid.slice(0, 8));
            entry.clearedAt.push(clearedAt(pid, blocker, r.created_at as string));
            groups.set(blocker, entry);
          }
        }

        for (const [blocker, v] of groups.entries()) {
          const properties = [...v.properties].slice(0, 6);
          const allCleared = v.clearedAt.every(Boolean);
          if (allCleared) {
            const newest = v.clearedAt
              .filter(Boolean)
              .sort((a, b) => new Date(b as string).getTime() - new Date(a as string).getTime())[0] as string | undefined;
            blockedCleared.push({ blocker: blocker.slice(0, 160), count: v.count, properties, cleared_at: shortTime(newest ?? null) });
          } else {
            blockedOutstanding.push({ blocker: blocker.slice(0, 160), count: v.count, properties });
          }
        }
        blockedOutstanding.sort((a, b) => b.count - a.count);
        blockedCleared.sort((a, b) => b.count - a.count);
      }

      /**
       * "Live properties" means properties actually on the channel — a trading, non-sandbox,
       * push-enabled property carrying a building listing id or at least one unit listing id.
       * Counting distribution accounts here made 4 live properties read as 2.
       */
      let livePropertyCount = 0;
      try {
        const [{ data: footprintProps }, { data: footprintUnits }] = await Promise.all([
          supabase
            .from('properties')
            .select('id, rentalsunited_property_id, is_trading, is_sandbox, ru_push_enabled')
            .eq('is_trading', true)
            .eq('ru_push_enabled', true),
          supabase.from('hostfully_room_types').select('property_id, rentalsunited_property_id'),
        ]);
        const unitFootprint = new Set(
          (footprintUnits ?? [])
            .filter((u: any) => !!String(u.rentalsunited_property_id ?? '').trim())
            .map((u: any) => u.property_id as string),
        );
        livePropertyCount = (footprintProps ?? []).filter(
          (p: any) =>
            p.is_sandbox !== true &&
            (!!String(p.rentalsunited_property_id ?? '').trim() || unitFootprint.has(p.id)),
        ).length;
      } catch (footprintError) {
        console.error('[Daily Health Report] Live-property footprint error:', footprintError);
      }


      const errorCounts = new Map<string, { action: string; code: string; count: number; sample: string }>();
      for (const r of runs.filter(isPipelineFailure)) {
        const action = r.action || 'unknown';
        const code = r.error_code || 'UNKNOWN';
        const key = `${action}\u0000${code}`;
        const entry = errorCounts.get(key) || { action, code, count: 0, sample: r.error_message || 'No message' };
        entry.count += 1;
        errorCounts.set(key, entry);
      }
      const topErrors = [...errorCounts.values()]
        .map((v) => ({
          action: v.action,
          code: v.code,
          count: v.count,
          sample: (v.sample || '').slice(0, 140),
          recovered: !isPipelineFailure(byAction.get(v.action)?.[0] ?? {}),
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 4);

      const totalRuns = runs.length;
      const failedRuns = runs.filter(isPipelineFailure).length;

      const ariRuns = runs.filter(r => (r.action || '').includes('ari') || (r.action || '').includes('availab') || (r.action || '').includes('price'));
      const lastAri = ariRuns[0]?.created_at ?? null;
      const cert = certRuns?.[0]
        ? {
            status: certRuns[0].status as string,
            passed: (certRuns[0].passed as number) ?? 0,
            total: (certRuns[0].total as number) ?? 0,
            at: shortTime((certRuns[0].finished_at as string) || (certRuns[0].created_at as string)),
          }
        : null;

      // Background call queue — parked work is pending, not failed.
      const { data: queueRows } = await supabase
        .from('ru_call_queue')
        .select('status, created_at, completed_at')
        .gte('created_at', new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
      const queued = queueRows ?? [];
      const waitingRows = queued.filter((q: any) => q.status === 'pending' || q.status === 'claimed');
      const oldestWaiting = waitingRows.reduce<number | null>((acc: number | null, q: any) => {
        const mins = Math.floor((now.getTime() - new Date(q.created_at).getTime()) / 60000);
        return acc === null || mins > acc ? mins : acc;
      }, null);

      ruWl = {
        window_hours: 24,
        total: totalRuns,
        failed: failedRuns,
        success_rate: totalRuns > 0 ? ((totalRuns - failedRuns) / totalRuns) * 100 : 100,
        actions,
        top_errors: topErrors,
        rate_deferrals: rateDeferrals,
        reservations_24h: (ruNotifs || []).length,
        reservations_unprocessed: (ruNotifs || []).filter(n => n.processed === false).length,
        last_reservation_at: shortTime((ruNotifs || [])[0]?.created_at ?? null),
        // Current state = the most recent run of every action is not a real pipeline failure
        current_ok: runs.length === 0
          ? null
          : [...byAction.values()].every(list => !isPipelineFailure(list[0] ?? {})),
        recovered_actions: actions.filter(a => a.recovered).length,
        ari_last_push_at: shortTime(lastAri),
        ari_stale_hours: hoursSince(lastAri),
        cert,
        live_properties: livePropertyCount,
        distribution_accounts: ownerCount ?? 0,
        blocked: { outstanding: blockedOutstanding, cleared: blockedCleared },
        setup_gaps: setupGaps,
        reconciled,

        call_queue: {
          waiting: waitingRows.length,
          oldest_waiting_minutes: oldestWaiting,
          drained_24h: queued.filter(
            (q: any) =>
              q.status === 'done' && q.completed_at && new Date(q.completed_at).getTime() > now.getTime() - 86_400_000,
          ).length,
          gave_up: queued.filter((q: any) => q.status === 'failed').length,
        },
      };




    } catch (ruError) {
      console.error('[Daily Health Report] Channel metrics error:', ruError);
    }

    const aiDigest = await generateAIDigest(
      overallStatus,
      overallUptime,
      failedCount,
      totalComponents,
      criticalIssues,
      bookingStats,
      ruWl
        ? {
            success_rate: ruWl.success_rate,
            failing: ruWl.actions
              .filter(a => a.current_ok === false)
              .map(a => ({ action: a.action, success_rate: a.success_rate, failed: a.failed, last_run: a.last_run })),
            recovered: ruWl.actions
              .filter(a => a.recovered)
              .map(a => ({ action: a.action, last_failure_at: a.last_failure_at })),
            top_errors: ruWl.top_errors,
            rate_deferrals: ruWl.rate_deferrals,
            setup_gaps: ruWl.setup_gaps,
            reconciled: ruWl.reconciled,

            blocked_outstanding: ruWl.blocked.outstanding,
            blocked_cleared: ruWl.blocked.cleared,

          }
        : null,
    );

    // Generate email
    const nextCheckTime = new Date(now.getTime() + 30 * 60 * 1000);
    
    const emailHtml = generateEmailHtml(
      formatDate(now),
      formatTime(now),
      overallStatus,
      overallUptime,
      failedCount,
      totalComponents,
      componentStats,
      criticalIssues,
      pmsIntegrations,
      inactiveComponentsList,
      formatTime(nextCheckTime),
      aiDigest,
      devTasks,
      ruWl
    );


    // Determine subject line
    let subject: string;
    if (criticalIssues.length > 0) {
      subject = `🚨 ROL System Health Report - CRITICAL ISSUES - ${formatDate(now)}`;
    } else if (failedCount > 0) {
      subject = `⚠️ ROL System Health Report - ${failedCount} Issues Detected - ${formatDate(now)}`;
    } else {
      subject = `✅ ROL System Health Report - All Systems Operational - ${formatDate(now)}`;
    }

    // Fetch sender email from api_keys (same pattern as booking emails)
    const { data: emailConfig } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "RESEND_FROM_EMAIL")
      .maybeSingle();

    const fromEmail = emailConfig?.key_value || "RoomsOnline <hello@notify.roomsonline.co.za>";

    // Determine recipient(s)
    const recipients = customRecipient 
      ? [customRecipient] 
      : ['dev@roomsonline.co.za'];

    // Modify subject for manual triggers
    const finalSubject = isManualTrigger 
      ? `[Manual] ${subject}` 
      : subject;

    // Send email
    const { error: emailError } = await resend.emails.send({
      from: fromEmail,
      to: recipients,
      subject: finalSubject,
      html: emailHtml,
    });

    if (emailError) {
      console.error('[Daily Health Report] Email send error:', emailError);
      throw new Error(`Failed to send email: ${JSON.stringify(emailError)}`);
    }

    console.log('[Daily Health Report] Report sent successfully to:', recipients);

    return new Response(
      JSON.stringify({
        success: true,
        sent_at: now.toISOString(),
        sent_to: recipients,
        is_manual: isManualTrigger,
        overall_status: overallStatus,
        total_components: totalComponents,
        failed_count: failedCount,
        critical_issues: criticalIssues.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[Daily Health Report] Error:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
