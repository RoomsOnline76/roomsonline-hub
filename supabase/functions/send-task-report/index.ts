import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const PRIORITY_EMOJI: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🟢",
};

const STATUS_LABELS: Record<string, string> = {
  new: "✨ New",
  started: "🚀 Started",
  testing: "🧪 Testing",
  completed: "✅ Completed",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) throw new Error("RESEND_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { assignee_id, include_statuses } = await req.json();
    if (!assignee_id) throw new Error("assignee_id is required");

    // Fetch assignee profile
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", assignee_id)
      .single();

    if (!profile?.email) throw new Error("Assignee profile/email not found");

    // Fetch tasks
    let query = supabase
      .from("dev_tasks")
      .select("*")
      .eq("assigned_to", assignee_id)
      .eq("is_archived", false)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    if (include_statuses?.length) {
      query = query.in("status", include_statuses);
    }

    const { data: tasks, error } = await query;
    if (error) throw error;

    const firstName = profile.full_name?.split(" ")[0] || "Team member";
    const taskCount = tasks?.length || 0;
    const today = new Date().toLocaleDateString("en-ZA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    // Group tasks by status
    const grouped: Record<string, typeof tasks> = {};
    for (const t of tasks || []) {
      if (!grouped[t.status]) grouped[t.status] = [];
      grouped[t.status].push(t);
    }

    // Build HTML
    const statusOrder = ["new", "started", "testing", "completed"];
    let taskRows = "";

    for (const status of statusOrder) {
      const group = grouped[status];
      if (!group?.length) continue;

      taskRows += `
        <tr>
          <td colspan="3" style="padding:16px 0 8px 0;font-size:15px;font-weight:600;color:#111827;border-bottom:2px solid #e5e7eb;">
            ${STATUS_LABELS[status] || status} (${group.length})
          </td>
        </tr>
      `;

      for (const task of group) {
        const priorityEmoji = PRIORITY_EMOJI[task.priority] || "⚪";
        const createdDate = new Date(task.created_at).toLocaleDateString("en-ZA", {
          month: "short",
          day: "numeric",
        });

        taskRows += `
          <tr>
            <td style="padding:10px 12px 10px 0;font-size:14px;color:#111827;border-bottom:1px solid #f3f4f6;vertical-align:top;">
              <strong>${task.title}</strong>
              ${task.description ? `<br/><span style="font-size:12px;color:#6b7280;">${task.description}</span>` : ""}
            </td>
            <td style="padding:10px 8px;font-size:13px;color:#6b7280;border-bottom:1px solid #f3f4f6;vertical-align:top;white-space:nowrap;">
              ${priorityEmoji} ${task.priority.charAt(0).toUpperCase() + task.priority.slice(1)}
            </td>
            <td style="padding:10px 0 10px 8px;font-size:12px;color:#9ca3af;border-bottom:1px solid #f3f4f6;vertical-align:top;white-space:nowrap;">
              ${createdDate}
            </td>
          </tr>
        `;
      }
    }

    if (!taskRows) {
      taskRows = `
        <tr>
          <td colspan="3" style="padding:30px 0;text-align:center;color:#6b7280;font-size:14px;">
            🎉 No tasks matching the selected criteria. Well done!
          </td>
        </tr>
      `;
    }

    const statusSummary = statusOrder
      .filter((s) => grouped[s]?.length)
      .map((s) => `${STATUS_LABELS[s]}: ${grouped[s]!.length}`)
      .join(" · ");

    const html = `
<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:0;background:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:600px;margin:0 auto;padding:24px;">
    <div style="background:#111827;color:#fff;padding:24px 28px;border-radius:12px 12px 0 0;">
      <h1 style="margin:0;font-size:20px;font-weight:700;">📋 Task Report</h1>
      <p style="margin:6px 0 0;font-size:13px;color:#9ca3af;">${today}</p>
    </div>
    <div style="background:#fff;padding:24px 28px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;">
      <p style="font-size:15px;color:#374151;margin:0 0 4px;">Hi ${firstName},</p>
      <p style="font-size:14px;color:#6b7280;margin:0 0 20px;">
        Here's your current task summary — <strong>${taskCount} task${taskCount !== 1 ? "s" : ""}</strong> assigned to you.
      </p>
      ${statusSummary ? `<p style="font-size:12px;color:#9ca3af;margin:0 0 16px;padding:8px 12px;background:#f9fafb;border-radius:6px;">${statusSummary}</p>` : ""}
      <table style="width:100%;border-collapse:collapse;">
        ${taskRows}
      </table>
      <div style="margin-top:24px;padding-top:16px;border-top:1px solid #e5e7eb;">
        <p style="font-size:12px;color:#9ca3af;margin:0;text-align:center;">
          Sent from ROL'OS Task Tracker · RoomsOnline
        </p>
      </div>
    </div>
  </div>
</body>
</html>
    `;

    const resend = new Resend(resendKey);
    const { data: emailResult, error: emailError } = await resend.emails.send({
      from: "RoomsOnline <noreply@notify.roomsonline.co.za>",
      to: [profile.email],
      subject: `📋 Your Task Report — ${taskCount} task${taskCount !== 1 ? "s" : ""} (${today})`,
      html,
    });

    if (emailError) throw emailError;

    return new Response(
      JSON.stringify({ success: true, email: profile.email, taskCount, emailId: emailResult?.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[send-task-report]", err);
    return new Response(
      JSON.stringify({ success: false, error: err.message }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
