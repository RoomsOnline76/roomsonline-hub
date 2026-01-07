import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface TrackerData {
  system_type: string;
  status: string;
  contact_person: string | null;
  contact_name: string | null;
  contact_tel: string | null;
  contact_email: string | null;
  has_access: boolean;
  has_docs: boolean;
  has_edge: boolean;
  has_get: boolean;
  has_post: boolean;
  is_production: boolean;
  additional_info: Record<string, string> | null;
}

interface NoteLogEntry {
  system_type: string;
  note_content: string;
  created_at: string;
  created_by_name: string | null;
}

const getPMSDisplayName = (key: string): string => {
  const names: Record<string, string> = {
    benson: 'Benson',
    checkfront: 'Checkfront',
    cloudbeds: 'Cloudbeds',
    guestly: 'Guestly',
    hostfully: 'Hostfully',
    hotelbeds: 'HotelBeds',
    littlehotelier: 'Little Hotelier',
    nightsbridge: 'NightsBridge',
    roomkey: 'RoomKey',
    roomracoon: 'RoomRaccoon',
    semper: 'Semper',
    siteminder: 'SiteMinder',
    roomsonline: 'RoomsOnline PMS',
  };
  return names[key] || key.charAt(0).toUpperCase() + key.slice(1);
};

const getStatusColor = (status: string): string => {
  const normalized = status?.toLowerCase() || '';
  if (normalized === 'complete') return '#22c55e';
  if (normalized.includes('wait') || normalized.includes('access')) return '#f59e0b';
  if (normalized === 'register' || normalized === 'to apply' || normalized === 'researching') return '#3b82f6';
  if (normalized === 'in progress' || normalized === 'in dev') return '#a855f7';
  return '#6b7280';
};

const formatNoteDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-ZA', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return dateStr;
  }
};

const generateEmailHtml = (
  trackerData: TrackerData[], 
  notesLog: NoteLogEntry[],
  generatedDate: string
): string => {
  const completedCount = trackerData.filter(t => t.status?.toLowerCase() === 'complete').length;
  const inProgressCount = trackerData.filter(t => 
    t.status?.toLowerCase().includes('wait') || 
    t.status?.toLowerCase() === 'in progress'
  ).length;
  const pendingCount = trackerData.length - completedCount - inProgressCount;

  // Sort by status priority: COMPLETE first, then In Progress, then others
  const sortedData = [...trackerData].sort((a, b) => {
    const statusOrder = (s: string) => {
      const lower = s?.toLowerCase() || '';
      if (lower === 'complete') return 0;
      if (lower.includes('wait') || lower === 'in progress') return 1;
      return 2;
    };
    return statusOrder(a.status) - statusOrder(b.status);
  });

  const tableRows = sortedData.map(row => {
    const progressFlags = [row.has_access, row.has_docs, row.has_edge, row.has_get, row.has_post, row.is_production];
    const statusColor = getStatusColor(row.status);
    
    // Build contact display
    const contactParts: string[] = [];
    if (row.contact_name) contactParts.push(row.contact_name);
    else if (row.contact_person) contactParts.push(row.contact_person);
    const contactDisplay = contactParts.length > 0 ? contactParts.join(' ') : '—';

    // Build additional info display
    const additionalParts: string[] = [];
    if (row.additional_info?.url) {
      additionalParts.push(`<a href="${row.additional_info.url}" style="color: #3b82f6; text-decoration: underline;">Register Link</a>`);
    }
    if (row.additional_info?.agent_code) {
      additionalParts.push(`Code: ${row.additional_info.agent_code}`);
    }
    if (row.additional_info?.notes) {
      additionalParts.push(row.additional_info.notes);
    }
    if (row.additional_info?.email) {
      additionalParts.push(`<a href="mailto:${row.additional_info.email}" style="color: #3b82f6;">${row.additional_info.email}</a>`);
    }
    const additionalDisplay = additionalParts.length > 0 ? additionalParts.join('<br/>') : '—';

    // Progress indicators as small circles
    const progressDots = progressFlags.map((flag, i) => {
      const labels = ['A', 'D', 'E', 'G', 'P', 'L'];
      return `<span style="display: inline-block; width: 18px; height: 18px; border-radius: 50%; background: ${flag ? '#22c55e' : '#e2e8f0'}; color: ${flag ? '#fff' : '#94a3b8'}; font-size: 10px; line-height: 18px; text-align: center; margin-right: 2px;" title="${['Access', 'Docs', 'Edge', 'GET', 'POST', 'Live'][i]}">${labels[i]}</span>`;
    }).join('');
    
    return `
      <tr style="background: ${row.status?.toLowerCase() === 'complete' ? '#f0fdf4' : '#ffffff'};">
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1a1a2e;">
          ${getPMSDisplayName(row.system_type)}
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0;">
          <span style="background: ${statusColor}; color: white; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap;">
            ${row.status || 'Unknown'}
          </span>
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">
          ${progressDots}
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; color: #4a5568; font-size: 13px;">
          ${contactDisplay}
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 12px;">
          ${additionalDisplay}
        </td>
      </tr>
    `;
  }).join('');

  // Group notes by system_type
  const notesBySystem: Record<string, NoteLogEntry[]> = {};
  notesLog.forEach(note => {
    if (!notesBySystem[note.system_type]) {
      notesBySystem[note.system_type] = [];
    }
    notesBySystem[note.system_type].push(note);
  });

  // Build notes section with timestamps
  const notesSection = Object.entries(notesBySystem)
    .sort(([a], [b]) => getPMSDisplayName(a).localeCompare(getPMSDisplayName(b)))
    .map(([systemType, notes]) => `
      <tr>
        <td style="padding: 0 40px 16px;">
          <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-left: 4px solid #1a1a2e; padding: 16px 20px; border-radius: 0 8px 8px 0;">
            <strong style="color: #1a1a2e; font-size: 14px;">${getPMSDisplayName(systemType)}</strong>
            <div style="margin-top: 12px;">
              ${notes.map(note => `
                <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
                  <div style="font-size: 11px; color: #718096; margin-bottom: 4px;">
                    <strong>${note.created_by_name || 'Unknown'}</strong> • ${formatNoteDate(note.created_at)}
                  </div>
                  <p style="margin: 0; color: #4a5568; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${note.note_content}</p>
                </div>
              `).join('')}
            </div>
          </div>
        </td>
      </tr>
    `).join('');

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="800" style="max-width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); overflow: hidden;">
          
          <!-- Header with ROL Branding -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f172a 100%); padding: 35px 40px; text-align: center;">
              <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="max-width: 180px; height: auto;" />
            </td>
          </tr>
          
          <!-- Title Section -->
          <tr>
            <td style="padding: 35px 40px 25px;">
              <h1 style="margin: 0 0 8px; color: #1a1a2e; font-size: 26px; font-weight: 700; letter-spacing: -0.5px;">PMS Integration Status Report</h1>
              <p style="margin: 0; color: #718096; font-size: 14px;">Generated: ${generatedDate}</p>
            </td>
          </tr>

          <!-- Summary Cards -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <table width="100%" style="border-collapse: separate; border-spacing: 12px 0;">
                <tr>
                  <td width="33%" style="background: linear-gradient(135deg, #22c55e20 0%, #22c55e10 100%); padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #22c55e30;">
                    <div style="font-size: 32px; font-weight: 700; color: #22c55e;">${completedCount}</div>
                    <div style="font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Complete</div>
                  </td>
                  <td width="33%" style="background: linear-gradient(135deg, #f59e0b20 0%, #f59e0b10 100%); padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #f59e0b30;">
                    <div style="font-size: 32px; font-weight: 700; color: #f59e0b;">${inProgressCount}</div>
                    <div style="font-size: 12px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">In Progress</div>
                  </td>
                  <td width="33%" style="background: linear-gradient(135deg, #6b728020 0%, #6b728010 100%); padding: 20px; border-radius: 10px; text-align: center; border: 1px solid #6b728030;">
                    <div style="font-size: 32px; font-weight: 700; color: #6b7280;">${pendingCount}</div>
                    <div style="font-size: 12px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Pending</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Status Table -->
          <tr>
            <td style="padding: 0 40px 20px;">
              <table width="100%" style="border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
                <thead>
                  <tr style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
                    <th style="padding: 12px 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">System</th>
                    <th style="padding: 12px 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
                    <th style="padding: 12px 10px; text-align: center; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Progress</th>
                    <th style="padding: 12px 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Contact</th>
                    <th style="padding: 12px 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Details</th>
                  </tr>
                </thead>
                <tbody>
                  ${tableRows}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Progress Legend -->
          <tr>
            <td style="padding: 0 40px 25px;">
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                <strong>Progress Key:</strong> 
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">A</span> Access
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">D</span> Docs
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">E</span> Edge Function
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">G</span> GET API
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">P</span> POST API
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">L</span> Live/Production
              </p>
            </td>
          </tr>
          
          <!-- Dev Notes Section -->
          ${notesSection ? `
          <tr>
            <td style="padding: 0 40px 10px;">
              <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Development Notes Log</h2>
            </td>
          </tr>
          ${notesSection}
          ` : ''}
          
          <!-- Footer -->
          <tr>
            <td style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); padding: 28px 40px; text-align: center; border-top: 1px solid #e2e8f0;">
              <p style="margin: 0 0 6px; color: #4a5568; font-size: 14px; font-weight: 600;">RoomsOnline Development Team</p>
              <p style="margin: 0; color: #a0aec0; font-size: 12px;">© ${new Date().getFullYear()} RoomsOnline. All rights reserved.</p>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `;
};

const handler = async (req: Request): Promise<Response> => {
  console.log("send-pms-status-report function invoked");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch tracker data
    const { data: trackerData, error: trackerError } = await supabase
      .from('pms_tracker_status')
      .select('*')
      .order('system_type');

    if (trackerError) {
      console.error("Error fetching tracker data:", trackerError);
      throw trackerError;
    }

    // Fetch notes log with timestamps
    const { data: notesLog, error: notesError } = await supabase
      .from('pms_dev_notes_log')
      .select('system_type, note_content, created_at, created_by_name')
      .order('created_at', { ascending: false });

    if (notesError) {
      console.error("Error fetching notes log:", notesError);
      // Continue without notes if there's an error
    }

    console.log(`Fetched ${trackerData?.length || 0} tracker records, ${notesLog?.length || 0} notes`);

    const generatedDate = new Date().toLocaleDateString('en-ZA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const emailHtml = generateEmailHtml(trackerData || [], notesLog || [], generatedDate);

    // Send email via Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "RoomsOnline <noreply@notify.roomsonline.co.za>",
        to: ["dev@roomsonline.co.za"],
        subject: `PMS Integration Status Report - ${new Date().toLocaleDateString('en-ZA')}`,
        html: emailHtml,
      }),
    });

    const emailResult = await emailResponse.json();

    console.log("Email sent successfully:", emailResult);

    if (!emailResponse.ok) {
      throw new Error(emailResult.message || "Failed to send email");
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Status report sent successfully",
        emailId: emailResult.id 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-pms-status-report:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
