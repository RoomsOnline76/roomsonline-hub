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
  integration_status: 'coming_soon' | 'in_development' | 'parked' | 'in_testing' | 'deployed' | null;
  contact_person: string | null;
  contact_name: string | null;
  contact_tel: string | null;
  contact_email: string | null;
  // Setup phase
  has_account: boolean;
  has_docs: boolean;
  has_edge: boolean;
  // Integration phase
  has_health: boolean;
  has_get: boolean;
  has_post: boolean;
  has_modify: boolean;
  has_cancel: boolean;
  has_soft_test: boolean;
  is_certified: boolean;
  is_production: boolean;
  // Legacy
  has_access: boolean;
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
    benson: "Benson",
    checkfront: "Checkfront",
    cloudbeds: "Cloudbeds",
    guesty: "Guesty",
    hostfully: "Hostfully",
    hotelbeds: "HotelBeds",
    littlehotelier: "Little Hotelier",
    nightsbridge: "NightsBridge",
    rentalsunited: "Rentals United",
    roomkey: "RoomKey",
    roomracoon: "RoomRaccoon",
    semper: "Semper",
    siteminder: "SiteMinder",
    roomsonline: "RoomsOnline PMS",
    mews: "Mews",
    profitroom: "ProfitRoom",
    channex: "Channex.io",
    airbnb: "Airbnb",
    expedia: "Expedia",
    agoda: "Agoda",
    google_hotels: "Google Hotels",
    lekkeslaap: "Lekkeslaap",
    hyperguest: "HyperGuest",
    booking_com: "Booking.com",
    wetu: "WETU",
  };
  return names[key] || key.charAt(0).toUpperCase() + key.slice(1);
};

// Channel manager system keys (mirroring pmsSystemsConfig.ts categories)
const CHANNEL_MANAGER_KEYS = new Set([
  'agoda', 'airbnb', 'booking_com', 'channex', 'expedia', 'google_hotels',
  'hyperguest', 'hotelbeds', 'lekkeslaap', 'nightsbridge', 'profitroom', 'rentalsunited',
]);

const getStatusColor = (status: string): string => {
  const normalized = status?.toLowerCase() || "";
  if (normalized === "complete") return "#22c55e";
  if (normalized.includes("wait") || normalized.includes("access")) return "#f59e0b";
  if (normalized === "register" || normalized === "to apply" || normalized === "researching") return "#3b82f6";
  if (normalized === "in progress" || normalized === "in dev") return "#a855f7";
  return "#6b7280";
};

const getIntegrationStatusConfig = (status: string | null): { label: string; bg: string; text: string } => {
  switch (status) {
    case 'deployed': return { label: 'Deployed', bg: '#22c55e', text: '#fff' };
    case 'in_testing': return { label: 'In Testing', bg: '#f59e0b', text: '#fff' };
    case 'in_development': return { label: 'In Dev', bg: '#3b82f6', text: '#fff' };
    case 'parked': return { label: 'Parked', bg: '#6b7280', text: '#fff' };
    case 'coming_soon': return { label: 'Coming Soon', bg: '#a855f7', text: '#fff' };
    default: return { label: 'Unknown', bg: '#e2e8f0', text: '#64748b' };
  }
};

const formatNoteDate = (dateStr: string): string => {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-ZA", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
};

const generateEmailHtml = (trackerData: TrackerData[], notesLog: NoteLogEntry[], generatedDate: string): string => {
  // Split into PMS vs Channel Manager
  const pmsData = trackerData.filter(t => !CHANNEL_MANAGER_KEYS.has(t.system_type));
  const channelData = trackerData.filter(t => CHANNEL_MANAGER_KEYS.has(t.system_type));

  // New integration status counts
  const deployedCount = trackerData.filter((t) => t.integration_status === "deployed").length;
  const inTestingCount = trackerData.filter((t) => t.integration_status === "in_testing").length;
  const inDevCount = trackerData.filter((t) => t.integration_status === "in_development").length;
  const parkedCount = trackerData.filter((t) => t.integration_status === "parked").length;
  const comingSoonCount = trackerData.filter((t) => t.integration_status === "coming_soon" || !t.integration_status).length;
  
  // Calculate total milestones (11 per system)
  let totalMilestones = 0;
  trackerData.forEach((t) => {
    if (t.has_account) totalMilestones++;
    if (t.has_docs) totalMilestones++;
    if (t.has_edge) totalMilestones++;
    if (t.has_health) totalMilestones++;
    if (t.has_get) totalMilestones++;
    if (t.has_post) totalMilestones++;
    if (t.has_modify) totalMilestones++;
    if (t.has_cancel) totalMilestones++;
    if (t.has_soft_test) totalMilestones++;
    if (t.is_certified) totalMilestones++;
    if (t.is_production) totalMilestones++;
  });
  const maxMilestones = trackerData.length * 11;

  // Build a map of latest note per system
  const latestNoteBySystem: Record<string, NoteLogEntry> = {};
  notesLog.forEach((note) => {
    if (!latestNoteBySystem[note.system_type]) {
      latestNoteBySystem[note.system_type] = note;
    }
  });

  // Group all notes by system_type for full log
  const notesBySystem: Record<string, NoteLogEntry[]> = {};
  notesLog.forEach((note) => {
    if (!notesBySystem[note.system_type]) {
      notesBySystem[note.system_type] = [];
    }
    notesBySystem[note.system_type].push(note);
  });

  // Sort by integration status priority
  const sortByStatus = (data: TrackerData[]) => [...data].sort((a, b) => {
    const statusOrder = (s: string | null) => {
      if (s === 'deployed') return 0;
      if (s === 'in_testing') return 1;
      if (s === 'in_development') return 2;
      if (s === 'parked') return 4;
      return 3;
    };
    return statusOrder(a.integration_status) - statusOrder(b.integration_status);
  });

  const generateTableRows = (data: TrackerData[]) => sortByStatus(data)
    .map((row) => {
      const setupFlags = [row.has_account || row.has_access, row.has_docs, row.has_edge];
      const integrationFlags = [row.has_health, row.has_get, row.has_post, row.has_modify, row.has_cancel, row.has_soft_test, row.is_certified, row.is_production];
      const allFlags = [...setupFlags, ...integrationFlags];

      const contactParts: string[] = [];
      if (row.contact_name) contactParts.push(row.contact_name);
      else if (row.contact_person) contactParts.push(row.contact_person);
      const contactDisplay = contactParts.length > 0 ? contactParts.join(" ") : "—";

      const latestNote = latestNoteBySystem[row.system_type];
      let latestNoteDisplay = "—";
      if (latestNote) {
        const truncatedNote = latestNote.note_content.length > 80
          ? latestNote.note_content.substring(0, 77) + "..."
          : latestNote.note_content;
        latestNoteDisplay = truncatedNote;
      }

      const setupLabels = ["Ac", "Do", "Ed"];
      const setupDots = setupFlags
        .map((flag, i) => `<span style="display: inline-block; width: 20px; height: 18px; border-radius: 3px; background: ${flag ? "#22c55e" : "#e2e8f0"}; color: ${flag ? "#fff" : "#94a3b8"}; font-size: 9px; line-height: 18px; text-align: center; margin-right: 2px;" title="${["Account", "Docs", "Edge"][i]}">${setupLabels[i]}</span>`)
        .join("");

      const integrationLabels = ["He", "Gt", "Ps", "Mo", "Ca", "Te", "Ce", "Lv"];
      const integrationDots = integrationFlags
        .map((flag, i) => `<span style="display: inline-block; width: 20px; height: 18px; border-radius: 3px; background: ${flag ? "#22c55e" : "#e2e8f0"}; color: ${flag ? "#fff" : "#94a3b8"}; font-size: 9px; line-height: 18px; text-align: center; margin-right: 2px;" title="${["Health", "GET", "POST", "Modify", "Cancel", "Test", "Certify", "Live"][i]}">${integrationLabels[i]}</span>`)
        .join("");

      const flagsCompleted = allFlags.filter(Boolean).length;
      const integrationConfig = getIntegrationStatusConfig(row.integration_status);

      return `
      <tr style="background: ${row.integration_status === "deployed" ? "#f0fdf4" : "#ffffff"};">
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; font-weight: 600; color: #1a1a2e;">
          ${getPMSDisplayName(row.system_type)}
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0;">
          <span style="background: ${integrationConfig.bg}; color: ${integrationConfig.text}; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.3px; white-space: nowrap;">
            ${integrationConfig.label}
          </span>
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; text-align: center;">
          <div style="display: inline-block;">
            <div style="margin-bottom: 2px;">${setupDots}</div>
            <div>${integrationDots}</div>
          </div>
          <div style="font-size: 10px; color: #94a3b8; margin-top: 2px;">${flagsCompleted}/11</div>
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; color: #4a5568; font-size: 13px;">
          ${contactDisplay}
        </td>
        <td style="padding: 12px 10px; border-bottom: 1px solid #e2e8f0; color: #64748b; font-size: 12px; max-width: 250px;">
          ${latestNoteDisplay}
        </td>
      </tr>
    `;
    })
    .join("");

  const tableHeader = `
    <thead>
      <tr style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
        <th style="padding: 12px 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">System</th>
        <th style="padding: 12px 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Integration</th>
        <th style="padding: 12px 10px; text-align: center; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Progress</th>
        <th style="padding: 12px 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Contact</th>
        <th style="padding: 12px 10px; text-align: left; color: #ffffff; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Latest Note</th>
      </tr>
    </thead>`;

  // Build full notes log section with timestamps
  const notesSection = Object.entries(notesBySystem)
    .sort(([a], [b]) => getPMSDisplayName(a).localeCompare(getPMSDisplayName(b)))
    .map(
      ([systemType, notes]) => `
      <tr>
        <td style="padding: 0 40px 16px;">
          <div style="background: linear-gradient(135deg, #f7fafc 0%, #edf2f7 100%); border-left: 4px solid #1a1a2e; padding: 16px 20px; border-radius: 0 8px 8px 0;">
            <strong style="color: #1a1a2e; font-size: 14px;">${getPMSDisplayName(systemType)}</strong>
            <div style="margin-top: 12px;">
              ${notes
                .map(
                  (note) => `
                <div style="margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #e2e8f0;">
                  <div style="font-size: 11px; color: #718096; margin-bottom: 4px;">
                    <strong>${note.created_by_name || "Unknown"}</strong> • ${formatNoteDate(note.created_at)}
                  </div>
                  <p style="margin: 0; color: #4a5568; font-size: 13px; line-height: 1.6; white-space: pre-wrap;">${note.note_content}</p>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
        </td>
      </tr>
    `,
    )
    .join("");

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
        <table role="presentation" width="850" style="max-width: 100%; background-color: #ffffff; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08); overflow: hidden;">
          
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
              <table width="100%" style="border-collapse: separate; border-spacing: 8px 0;">
                <tr>
                  <td style="background: linear-gradient(135deg, #22c55e20 0%, #22c55e10 100%); padding: 16px 12px; border-radius: 10px; text-align: center; border: 1px solid #22c55e30;">
                    <div style="font-size: 28px; font-weight: 700; color: #22c55e;">${deployedCount}</div>
                    <div style="font-size: 11px; color: #166534; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Deployed</div>
                  </td>
                  <td style="background: linear-gradient(135deg, #f59e0b20 0%, #f59e0b10 100%); padding: 16px 12px; border-radius: 10px; text-align: center; border: 1px solid #f59e0b30;">
                    <div style="font-size: 28px; font-weight: 700; color: #f59e0b;">${inTestingCount}</div>
                    <div style="font-size: 11px; color: #92400e; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">In Testing</div>
                  </td>
                  <td style="background: linear-gradient(135deg, #3b82f620 0%, #3b82f610 100%); padding: 16px 12px; border-radius: 10px; text-align: center; border: 1px solid #3b82f630;">
                    <div style="font-size: 28px; font-weight: 700; color: #3b82f6;">${inDevCount}</div>
                    <div style="font-size: 11px; color: #1d4ed8; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">In Dev</div>
                  </td>
                  <td style="background: linear-gradient(135deg, #a855f720 0%, #a855f710 100%); padding: 16px 12px; border-radius: 10px; text-align: center; border: 1px solid #a855f730;">
                    <div style="font-size: 28px; font-weight: 700; color: #a855f7;">${comingSoonCount}</div>
                    <div style="font-size: 11px; color: #7c3aed; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Coming Soon</div>
                  </td>
                  <td style="background: linear-gradient(135deg, #1a1a2e20 0%, #1a1a2e10 100%); padding: 16px 12px; border-radius: 10px; text-align: center; border: 1px solid #1a1a2e30;">
                    <div style="font-size: 28px; font-weight: 700; color: #1a1a2e;">${totalMilestones}/${maxMilestones}</div>
                    <div style="font-size: 11px; color: #4b5563; text-transform: uppercase; letter-spacing: 0.5px; margin-top: 4px;">Milestones</div>
                  </td>
                </tr>
              </table>
              <table width="100%" style="border-collapse: separate; border-spacing: 8px 0; margin-top: 8px;">
                <tr>
                  <td style="background: #f8fafc; padding: 10px 12px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                    <div style="font-size: 18px; font-weight: 700; color: #1a1a2e;">${pmsData.length}</div>
                    <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">PMS Systems</div>
                  </td>
                  <td style="background: #f8fafc; padding: 10px 12px; border-radius: 8px; text-align: center; border: 1px solid #e2e8f0;">
                    <div style="font-size: 18px; font-weight: 700; color: #1a1a2e;">${channelData.length}</div>
                    <div style="font-size: 10px; color: #64748b; text-transform: uppercase; letter-spacing: 0.5px;">Channel Managers</div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
          <!-- PMS Systems Table -->
          <tr>
            <td style="padding: 0 40px 10px;">
              <h2 style="margin: 0 0 12px; color: #1a1a2e; font-size: 18px; font-weight: 600;">Property Management Systems</h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 20px;">
              <table width="100%" style="border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
                ${tableHeader}
                <tbody>
                  ${generateTableRows(pmsData)}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Channel Managers Table -->
          <tr>
            <td style="padding: 0 40px 10px;">
              <h2 style="margin: 0 0 12px; color: #1a1a2e; font-size: 18px; font-weight: 600;">Channel Managers</h2>
            </td>
          </tr>
          <tr>
            <td style="padding: 0 40px 20px;">
              <table width="100%" style="border-collapse: collapse; border-radius: 8px; overflow: hidden; border: 1px solid #e2e8f0;">
                ${tableHeader}
                <tbody>
                  ${generateTableRows(channelData)}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- Progress Legend -->
          <tr>
            <td style="padding: 0 40px 25px;">
              <p style="margin: 0 0 6px; font-size: 11px; color: #94a3b8;">
                <strong>Setup:</strong> 
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">Ac</span> Account
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">Do</span> Docs
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">Ed</span> Edge Function
              </p>
              <p style="margin: 0; font-size: 11px; color: #94a3b8;">
                <strong>Integration:</strong> 
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">He</span> Health Check
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">Gt</span> GET API
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">Ps</span> POST API
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">Mo</span> Modify
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">Ca</span> Cancel
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">Te</span> Soft Test
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">Ce</span> Certify
                <span style="background: #e2e8f0; padding: 2px 6px; border-radius: 3px; margin: 0 3px;">Lv</span> Live
              </p>
            </td>
          </tr>
          
          <!-- Dev Notes Log Section (Full History) -->
          ${
            notesSection
              ? `
          <tr>
            <td style="padding: 0 40px 10px;">
              <h2 style="margin: 0 0 16px; color: #1a1a2e; font-size: 18px; font-weight: 600; border-bottom: 2px solid #e2e8f0; padding-bottom: 10px;">Development Notes Log</h2>
            </td>
          </tr>
          ${notesSection}
          `
              : ""
          }
          
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
      .from("pms_tracker_status")
      .select("*")
      .order("system_type");

    if (trackerError) {
      console.error("Error fetching tracker data:", trackerError);
      throw trackerError;
    }

    // Fetch notes log with timestamps (ordered descending so first match is latest)
    const { data: notesLog, error: notesError } = await supabase
      .from("pms_dev_notes_log")
      .select("system_type, note_content, created_at, created_by_name")
      .order("created_at", { ascending: false });

    if (notesError) {
      console.error("Error fetching notes log:", notesError);
      // Continue without notes if there's an error
    }

    console.log(`Fetched ${trackerData?.length || 0} tracker records, ${notesLog?.length || 0} notes`);

    const generatedDate = new Date().toLocaleDateString("en-ZA", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
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
        from: "RoomsOnline <hello@notify.roomsonline.co.za>",
        to: ["dev@roomsonline.co.za"],
        subject: `PMS Integration Status Report - ${new Date().toLocaleDateString("en-ZA")}`,
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
        emailId: emailResult.id,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      },
    );
  } catch (error: any) {
    console.error("Error in send-pms-status-report:", error);
    return new Response(JSON.stringify({ success: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
