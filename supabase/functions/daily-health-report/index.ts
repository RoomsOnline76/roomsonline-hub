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
  bookingStats: { total: number; confirmed: number; pending: number; failed: number }
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
  devTasks: DevTask[]
): string {
  const overallStatusColor = getStatusColor(overallStatus);
  const overallStatusLabel = overallStatus === 'healthy' 
    ? 'All Systems Operational' 
    : overallStatus === 'degraded' 
      ? 'Some Issues Detected'
      : 'Critical Issues';

  const componentRows = componentStats.map(comp => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px 8px; font-weight: 500;">${comp.component_name}</td>
      <td style="padding: 12px 8px;">
        <span style="display: inline-block; padding: 4px 12px; border-radius: 9999px; background-color: ${getStatusColor(comp.last_status)}20; color: ${getStatusColor(comp.last_status)}; font-weight: 500; font-size: 12px;">
          ${getStatusEmoji(comp.last_status)} ${comp.last_status.toUpperCase()}
        </span>
      </td>
      <td style="padding: 12px 8px; color: #6b7280;">${comp.last_checked}</td>
      <td style="padding: 12px 8px; color: #6b7280;">${comp.avg_latency_ms}ms</td>
      <td style="padding: 12px 8px; color: ${comp.failure_count_24h > 0 ? '#ef4444' : '#6b7280'}; font-weight: ${comp.failure_count_24h > 0 ? '600' : '400'};">${comp.failure_count_24h}</td>
      <td style="padding: 12px 8px; color: #6b7280;">${comp.uptime_percentage.toFixed(1)}%</td>
    </tr>
  `).join('');

  const criticalIssuesSection = criticalIssues.length > 0 ? `
    <div style="background-color: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 16px; margin: 24px 0;">
      <h3 style="color: #dc2626; margin: 0 0 12px 0; font-size: 16px;">⚠️ Critical Issues Requiring Attention</h3>
      <ul style="margin: 0; padding-left: 20px; color: #7f1d1d;">
        ${criticalIssues.map(issue => `
          <li style="margin-bottom: 8px;">
            <strong>${issue.component}:</strong> ${issue.message} 
            <span style="color: #9ca3af; font-size: 12px;">(Last failed: ${issue.last_failed})</span>
          </li>
        `).join('')}
      </ul>
    </div>
  ` : '';

  const pmsRows = pmsIntegrations.map(pms => `
    <tr style="border-bottom: 1px solid #e5e7eb;">
      <td style="padding: 12px 8px; font-weight: 500;">${pms.name}</td>
      <td style="padding: 12px 8px; color: #6b7280;">${pms.property_count}</td>
      <td style="padding: 12px 8px; color: #6b7280;">${pms.last_sync_time || 'Never'}</td>
      <td style="padding: 12px 8px; color: ${pms.success_rate >= 99 ? '#22c55e' : pms.success_rate >= 95 ? '#eab308' : '#ef4444'}; font-weight: 500;">${pms.success_rate.toFixed(1)}%</td>
    </tr>
  `).join('');

  // Group tasks by status
  const tasksByStatus = {
    new: devTasks.filter(t => t.status === 'new'),
    started: devTasks.filter(t => t.status === 'started'),
    testing: devTasks.filter(t => t.status === 'testing'),
    completed: devTasks.filter(t => t.status === 'completed'),
  };

  const taskTrackerSection = devTasks.length > 0 ? `
    <!-- Dev Task Tracker -->
    <div style="padding: 24px; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #7c3aed;">📋 Dev Task Tracker (${devTasks.length} Active Tasks)</h3>
      
      <div style="display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap;">
        <span style="background-color: #6b728020; color: #374151; padding: 4px 12px; border-radius: 9999px; font-size: 12px;">
          New: ${tasksByStatus.new.length}
        </span>
        <span style="background-color: #3b82f620; color: #1d4ed8; padding: 4px 12px; border-radius: 9999px; font-size: 12px;">
          Started: ${tasksByStatus.started.length}
        </span>
        <span style="background-color: #f59e0b20; color: #b45309; padding: 4px 12px; border-radius: 9999px; font-size: 12px;">
          Testing: ${tasksByStatus.testing.length}
        </span>
        <span style="background-color: #22c55e20; color: #15803d; padding: 4px 12px; border-radius: 9999px; font-size: 12px;">
          Completed: ${tasksByStatus.completed.length}
        </span>
      </div>

      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; background-color: #ffffff; border-radius: 8px;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Task</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Priority</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Status</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Assigned To</th>
            </tr>
          </thead>
          <tbody>
            ${devTasks.map(task => `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 8px; font-weight: 500;">${task.title}</td>
                <td style="padding: 12px 8px;">
                  ${getTaskPriorityEmoji(task.priority)} ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
                </td>
                <td style="padding: 12px 8px;">
                  <span style="display: inline-block; padding: 4px 12px; border-radius: 9999px; background-color: ${getTaskStatusColor(task.status)}20; color: ${getTaskStatusColor(task.status)}; font-weight: 500; font-size: 12px;">
                    ${task.status.toUpperCase()}
                  </span>
                </td>
                <td style="padding: 12px 8px; color: #6b7280;">${task.assigned_name || 'Unassigned'}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  ` : `
    <!-- No Active Tasks -->
    <div style="padding: 24px; background-color: #faf5ff; border-bottom: 1px solid #e9d5ff;">
      <h3 style="margin: 0 0 8px 0; font-size: 18px; color: #7c3aed;">📋 Dev Task Tracker</h3>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">No active tasks in the worklist.</p>
    </div>
  `;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>RoomsOnline Daily Health Report</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #1f2937; background-color: #f9fafb; margin: 0; padding: 20px;">
  <div style="max-width: 800px; margin: 0 auto; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); overflow: hidden;">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #1e3a5f 0%, #0d1b2a 100%); color: #ffffff; padding: 32px; text-align: center;">
      <h1 style="margin: 0 0 8px 0; font-size: 24px; font-weight: 600;">RoomsOnline Daily Health Report</h1>
      <p style="margin: 0; opacity: 0.9; font-size: 14px;">Date: ${date}</p>
      <p style="margin: 4px 0 0 0; opacity: 0.7; font-size: 12px;">Generated: ${generatedAt}</p>
    </div>

    <!-- Overall Status -->
    <div style="background-color: ${overallStatusColor}15; border-bottom: 3px solid ${overallStatusColor}; padding: 24px; text-align: center;">
      <h2 style="margin: 0 0 8px 0; color: ${overallStatusColor}; font-size: 20px;">
        Overall System Status: ${overallStatusLabel}
      </h2>
      <p style="margin: 0; color: #6b7280; font-size: 14px;">
        Uptime: <strong>${uptimePercentage.toFixed(1)}%</strong> | 
        Failed Components: <strong style="color: ${failedCount > 0 ? '#ef4444' : '#22c55e'};">${failedCount}/${totalComponents}</strong>
      </p>
    </div>

    ${taskTrackerSection}

    ${aiDigest ? `
    <!-- AI Executive Summary -->
    <div style="background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%); border-left: 4px solid #0ea5e9; padding: 20px; margin: 24px;">
      <h3 style="margin: 0 0 12px 0; font-size: 16px; color: #0369a1; display: flex; align-items: center; gap: 8px;">
        🧠 AI Executive Summary
      </h3>
      <p style="margin: 0 0 16px 0; color: #334155; font-size: 14px; line-height: 1.6;">
        ${aiDigest.summary}
      </p>
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <strong style="color: #dc2626; font-size: 12px; display: block; margin-bottom: 4px;">Priority Action:</strong>
          <span style="color: #475569; font-size: 13px;">${aiDigest.priority_action}</span>
        </div>
        <div style="background: white; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
          <strong style="color: #16a34a; font-size: 12px; display: block; margin-bottom: 4px;">Key Opportunity:</strong>
          <span style="color: #475569; font-size: 13px;">${aiDigest.opportunity}</span>
        </div>
      </div>
    </div>
    ` : ''}

    ${criticalIssuesSection}

    <!-- Component Health Summary -->
    <div style="padding: 24px;">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #1f2937;">Component Health Summary</h3>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <thead>
            <tr style="background-color: #f9fafb; border-bottom: 2px solid #e5e7eb;">
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Component</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Status</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Last Checked</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Latency</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">24h Failures</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Uptime</th>
            </tr>
          </thead>
          <tbody>
            ${componentRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- PMS Integration Status -->
    <div style="padding: 24px; background-color: #f9fafb;">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #1f2937;">PMS Integration Status</h3>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; background-color: #ffffff; border-radius: 8px;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">PMS</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Properties</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Last Sync</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #374151;">Success Rate</th>
            </tr>
          </thead>
          <tbody>
            ${pmsRows}
          </tbody>
        </table>
      </div>
    </div>

    <!-- Inactive / Waiting Systems -->
    ${inactiveComponents.length > 0 ? `
    <div style="padding: 24px;">
      <h3 style="margin: 0 0 16px 0; font-size: 18px; color: #6b7280;">⏸️ Waiting / Not Active Systems (${inactiveComponents.length})</h3>
      <p style="margin: 0 0 12px 0; font-size: 13px; color: #9ca3af;">These systems are configured but not currently in production. No health checks are performed.</p>
      <div style="overflow-x: auto;">
        <table style="width: 100%; border-collapse: collapse; font-size: 14px; background-color: #f9fafb; border-radius: 8px; opacity: 0.7;">
          <thead>
            <tr style="border-bottom: 2px solid #e5e7eb;">
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #9ca3af;">Component</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #9ca3af;">Type</th>
              <th style="padding: 12px 8px; text-align: left; font-weight: 600; color: #9ca3af;">Status</th>
            </tr>
          </thead>
          <tbody>
            ${inactiveComponents.map(comp => `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 12px 8px; color: #9ca3af;">${comp.component_name}</td>
                <td style="padding: 12px 8px; color: #9ca3af;">${comp.component_type.toUpperCase()}</td>
                <td style="padding: 12px 8px; color: #9ca3af;">Not Active</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>
    ` : ''}

    <!-- Cache Note -->
    <div style="padding: 16px 24px; background-color: #fffbeb; border-top: 1px solid #fde68a;">
      <p style="margin: 0; font-size: 12px; color: #92400e;">
        <strong>Cache Note:</strong> All displayed data is cached for performance. Live PMS verification is always enforced during actual bookings.
      </p>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #92400e;">
        <strong>Next Check:</strong> In 30 minutes (${nextCheckTime})
      </p>
      <p style="margin: 8px 0 0 0; font-size: 12px; color: #92400e;">
        <strong>View Details:</strong> Admin Console → Integrations → System Health
      </p>
    </div>

    <!-- Footer -->
    <div style="padding: 24px; background-color: #1e3a5f; color: #ffffff; text-align: center;">
      <p style="margin: 0; font-size: 12px; opacity: 0.9;">
        This report was automatically generated by the RoomsOnline Health Monitoring System.
      </p>
      <p style="margin: 8px 0 0 0; font-size: 11px; opacity: 0.7;">
        If you believe you received this in error, please contact dev@roomsonline.co.za
      </p>
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
      .select('benson_property_code, checkfront_property_code, cloudbeds_property_id, external_system')
      .eq('is_active', true);

    const pmsPropertyCounts: Record<string, number> = {
      benson: (properties || []).filter(p => p.benson_property_code).length,
      checkfront: (properties || []).filter(p => p.checkfront_property_code).length,
      cloudbeds: (properties || []).filter(p => p.cloudbeds_property_id).length,
      hostfully: (properties || []).filter(p => p.external_system === 'hostfully').length,
      hotelbeds: (properties || []).filter(p => p.external_system === 'hotelbeds').length,
      littlehotelier: (properties || []).filter(p => p.external_system === 'littlehotelier').length,
      roomsonline_pms: (properties || []).filter(p => p.external_system === 'roomsonline').length,
    };

    // Get last sync times from sync_logs
    const { data: syncLogs } = await supabase
      .from('sync_logs')
      .select('external_system, created_at, status')
      .eq('status', 'success')
      .order('created_at', { ascending: false })
      .limit(100);

    const pmsIntegrations: PmsIntegrationStats[] = pmsComponents.map(pms => {
      const lastSync = (syncLogs || []).find(log => 
        log.external_system?.toLowerCase().includes(pms.component_key.toLowerCase())
      );
      
      return {
        name: pms.component_name,
        property_count: pmsPropertyCounts[pms.component_key] || 0,
        last_sync_time: lastSync 
          ? new Date(lastSync.created_at).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' })
          : null,
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

    const aiDigest = await generateAIDigest(
      overallStatus,
      overallUptime,
      failedCount,
      totalComponents,
      criticalIssues,
      bookingStats
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
      devTasks
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
