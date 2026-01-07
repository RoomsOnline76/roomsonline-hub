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
  has_access: boolean;
  has_docs: boolean;
  has_edge: boolean;
  has_get: boolean;
  has_post: boolean;
  is_production: boolean;
  notes: string | null;
  additional_info: Record<string, string> | null;
}

const getPMSDisplayName = (key: string): string => {
  const names: Record<string, string> = {
    benson: 'Benson',
    checkfront: 'Checkfront',
    cloudbeds: 'Cloudbeds',
    hostfully: 'Hostfully',
    hotelbeds: 'HotelBeds',
    littlehotelier: 'Little Hotelier',
    mews: 'Mews',
    nightsbridge: 'NightsBridge',
    roomkey: 'RoomKey',
    roomracoon: 'RoomRaccoon',
    siteminder: 'SiteMinder',
    guestly: 'Guestly',
    roomsonline: 'RoomsOnline',
  };
  return names[key] || key;
};

const getStatusColor = (status: string): string => {
  const normalized = status?.toLowerCase() || '';
  if (normalized === 'complete') return '#22c55e';
  if (normalized.includes('wait') || normalized.includes('access')) return '#f59e0b';
  if (normalized === 'register' || normalized === 'review') return '#3b82f6';
  if (normalized === 'in progress') return '#a855f7';
  return '#6b7280';
};

const generateEmailHtml = (trackerData: TrackerData[], generatedDate: string): string => {
  const completedCount = trackerData.filter(t => t.status?.toLowerCase() === 'complete').length;
  const inProgressCount = trackerData.filter(t => 
    t.status?.toLowerCase().includes('wait') || 
    t.status?.toLowerCase() === 'in progress'
  ).length;
  const pendingCount = trackerData.length - completedCount - inProgressCount;

  const tableRows = trackerData.map(row => {
    const progressFlags = [row.has_access, row.has_docs, row.has_edge, row.has_get, row.has_post, row.is_production];
    const progressCount = progressFlags.filter(Boolean).length;
    const statusColor = getStatusColor(row.status);
    
    return `
      <tr>
        <td style="padding: 14px 12px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1a1a2e;">
          ${getPMSDisplayName(row.system_type)}
        </td>
        <td style="padding: 14px 12px; border-bottom: 1px solid #e2e8f0;">
          <span style="background: ${statusColor}; color: white; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;">
            ${row.status || 'Unknown'}
          </span>
        </td>
        <td style="padding: 14px 12px; border-bottom: 1px solid #e2e8f0; text-align: center;">
          <span style="font-weight: 600; color: ${progressCount === 6 ? '#22c55e' : progressCount > 0 ? '#f59e0b' : '#6b7280'};">
            ${progressCount}/6
          </span>
        </td>
        <td style="padding: 14px 12px; border-bottom: 1px solid #e2e8f0; color: #4a5568;">
          ${row.contact_person || '—'}
        </td>
      </tr>
    `;
  }).join('');

  const notesSection = trackerData
    .filter(r => r.notes && r.notes.trim())
    .map(row => `
      <tr>
        <td style="padding: 0 40px 16px;">
          <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-left: 4px solid #1a1a2e; padding: 16px 20px; border-radius: 0 8px 8px 0;">
            <strong style="color: #1a1a2e; font-size: 14px;">${getPMSDisplayName(row.system_type)}</strong>
            <p style="margin: 10px 0 0; color: #4a5568; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${row.notes}</p>
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
        <table role="presentation" width="700" style="max-width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); overflow: hidden;">
          
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
                  <td width="33%" style="background: linear-gradient(135deg, #22c55e20 0%, #22c55e10 100%); padding: 20px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #22c55e;">${completedCount}</div>
                    <div style="font-size: 12px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Complete</div>
                  </td>
                  <td width="33%" style="background: linear-gradient(135deg, #f59e0b20 0%, #f59e0b10 100%); padding: 20px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #f59e0b;">${inProgressCount}</div>
                    <div style="font-size: 12px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">In Progress</div>
                  </td>
                  <td width="33%" style="background: linear-gradient(135deg, #6b728020 0%, #6b728010 100%); padding: 20px; border-radius: 10px; text-align: center;">
                    <div style="font-size: 28px; font-weight: 700; color: #6b7280;">${pendingCount}</div>
                    <div style="font-size: 12px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Pending</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- Status Table -->
          <tr>
            <td style="padding: 0 40px 30px;">
              <table width="100%" style="border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
                <thead>
                  <tr style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
                    <th style="padding: 14px 12px; text-align: left; color: #ffffff; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">System</th>
                    <th style="padding: 14px 12px; text-align: left; color: #ffffff; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
                    <th style="padding: 14px 12px; text-align: center; color: #ffffff; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Progress</th>
                    <th style="padding: 14px 12px; text-align: left; color: #ffffff; font-weight: 600; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Contact</th>
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
              <p style="margin: 0; font-size: 12px; color: #718096;">
                <strong>Progress Indicators:</strong> Access • Docs • Edge Function • GET API • POST API • Production
              </p>
            </td>
          </tr>
          
          <!-- Dev Notes Section -->
          ${notesSection ? `
          <tr>
            <td style="padding: 0 40px 10px;">
              <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Development Notes</h2>
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
    const { data: trackerData, error } = await supabase
      .from('pms_tracker_status')
      .select('*')
      .order('system_type');

    if (error) {
      console.error("Error fetching tracker data:", error);
      throw error;
    }

    console.log(`Fetched ${trackerData?.length || 0} tracker records`);

    const generatedDate = new Date().toLocaleDateString('en-ZA', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const emailHtml = generateEmailHtml(trackerData || [], generatedDate);

    // Send email via Resend API
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "RoomsOnline <onboarding@resend.dev>",
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
