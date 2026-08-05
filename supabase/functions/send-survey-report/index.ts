const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SurveyData {
  businessName: string;
  contactDetails: string;
  clientEmail: string;
  businessDescription: string;
  eventDetails?: string;
  primaryGoal: string;
  targetAudience: string;
  inspirationLinks?: string;
  competitors?: string;
  paymentTypes: string[];
  paymentFlowDescription?: string;
  userAccountFeatures: string[];
  liveChatPurpose?: string;
  blogManagement?: string;
  criticalFeatures: string[];
  brandAssets: string[];
  designWords?: string;
  contentProvider?: string;
  domainOwned: string;
  domainName?: string;
  hostingOwned: string;
  hostingProvider?: string;
  launchDate: string;
  priorityDesign: number;
  priorityPayment: number;
  priorityFeatures: number;
  prioritySpeed: number;
  priorityEaseOfUse: number;
  phasedApproach: string;
  maintenancePreference?: string;
  finalNotes?: string;
}

const LABEL_MAP: Record<string, string> = {
  // Payment types
  event_tickets: "Event Tickets",
  products: "Digital/Physical Products",
  donations: "Donations",
  membership: "Membership/Subscription",
  // User account features
  view_tickets: "View/Download past tickets/invoices",
  manage_profile: "Manage their profile (name, email)",
  exclusive_content: "Access exclusive content after registering",
  submit_forms: "Submit/save forms",
  // Brand assets
  logo: "Logo",
  colors: "Brand Colour Palette",
  fonts: "Specific Fonts",
  style_guide: "Style Guide",
  none: "None, we need guidance",
  // Critical features
  contact_forms: "Contact/Registration Forms",
  newsletter: "Email Newsletter Signup Integration",
  event_schedule: "Detailed Event Schedule / Agenda",
  speaker_profiles: "Speaker or Presenter Profiles",
  gallery: "Photo/Video Gallery",
  faq: "FAQ Section",
  social_feeds: "Social Media Feeds (Facebook/Instagram)",
  seo: "SEO Optimization",
  popia_gdpr: "POPIA/GDPR Compliance Tools",
  // Live chat
  presales: "Pre-sales questions for attendees",
  support: "Customer support for your services",
  faq_bot: "Automated FAQ bot to reduce emails",
  not_sure: "Not sure yet",
  // Blog management
  in_house: "We will, in-house",
  you_write: "We'd need you to write them",
  not_needed: "Not needed initially",
  // Maintenance
  self_managed: "We will, with training",
  maintenance_plan: "We'd prefer a monthly maintenance plan",
  undecided: "Undecided",
};

function formatList(items: string[]): string {
  if (!items || items.length === 0) return "<em>None selected</em>";
  return items.map(item => LABEL_MAP[item] || item).join(", ");
}

function formatValue(value: string | undefined): string {
  if (!value) return "<em>Not provided</em>";
  return LABEL_MAP[value] || value;
}

function generateHtmlReport(data: SurveyData): string {
  const submittedAt = new Date().toLocaleString("en-ZA", {
    timeZone: "Africa/Johannesburg",
    dateStyle: "full",
    timeStyle: "short",
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Discovery Report - ${data.businessName}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 800px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #e91e8c 0%, #f0469d 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px;
      font-size: 24px;
    }
    .header p {
      margin: 0;
      opacity: 0.9;
    }
    .content {
      padding: 30px;
    }
    .section {
      margin-bottom: 30px;
      border-bottom: 1px solid #eee;
      padding-bottom: 20px;
    }
    .section:last-child {
      border-bottom: none;
      margin-bottom: 0;
    }
    .section-title {
      color: #e91e8c;
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .field {
      margin-bottom: 12px;
    }
    .field-label {
      font-weight: 600;
      color: #555;
      font-size: 14px;
    }
    .field-value {
      margin-top: 4px;
      padding: 8px 12px;
      background: #f9f9f9;
      border-radius: 4px;
      border-left: 3px solid #e91e8c;
    }
    .priority-grid {
      display: grid;
      grid-template-columns: 1fr auto;
      gap: 8px;
      align-items: center;
    }
    .priority-bar {
      height: 20px;
      background: #eee;
      border-radius: 10px;
      overflow: hidden;
    }
    .priority-fill {
      height: 100%;
      background: linear-gradient(90deg, #e91e8c 0%, #C9A861 100%);
      border-radius: 10px;
    }
    .contact-box {
      background: #e91e8c;
      color: white;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 20px;
    }
    .contact-box h3 {
      margin: 0 0 10px;
      color: #C9A861;
    }
    .contact-box p {
      margin: 5px 0;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #888;
      font-size: 12px;
      background: #fafafa;
    }
    em {
      color: #999;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Website Project Discovery Report</h1>
      <p>Submitted on ${submittedAt}</p>
    </div>
    
    <div class="content">
      <!-- Contact Information -->
      <div class="contact-box">
        <h3>Client Information</h3>
        <p><strong>Business:</strong> ${data.businessName}</p>
        <p><strong>Contact:</strong> ${data.contactDetails}</p>
        <p><strong>Email:</strong> ${data.clientEmail}</p>
      </div>

      <!-- Section 1: Business & Goals -->
      <div class="section">
        <div class="section-title">📋 Business & Core Goals</div>
        
        <div class="field">
          <div class="field-label">Business Description</div>
          <div class="field-value">${data.businessDescription.replace(/\n/g, '<br>')}</div>
        </div>
        
        ${data.eventDetails ? `
        <div class="field">
          <div class="field-label">Event Details</div>
          <div class="field-value">${data.eventDetails.replace(/\n/g, '<br>')}</div>
        </div>
        ` : ''}
        
        <div class="field">
          <div class="field-label">Primary Goal</div>
          <div class="field-value">${data.primaryGoal}</div>
        </div>
      </div>

      <!-- Section 2: Audience & Rivals -->
      <div class="section">
        <div class="section-title">🎯 Audience & Rivals</div>
        
        <div class="field">
          <div class="field-label">Target Audience</div>
          <div class="field-value">${data.targetAudience.replace(/\n/g, '<br>')}</div>
        </div>
        
        ${data.inspirationLinks ? `
        <div class="field">
          <div class="field-label">Inspiration Links</div>
          <div class="field-value">${data.inspirationLinks.replace(/\n/g, '<br>')}</div>
        </div>
        ` : ''}
        
        ${data.competitors ? `
        <div class="field">
          <div class="field-label">Competitors</div>
          <div class="field-value">${data.competitors}</div>
        </div>
        ` : ''}
      </div>

      <!-- Section 3: Features & Functionality -->
      <div class="section">
        <div class="section-title">⚙️ Features & Functionality</div>
        
        <div class="field">
          <div class="field-label">Payment Types</div>
          <div class="field-value">${formatList(data.paymentTypes)}</div>
        </div>
        
        ${data.paymentFlowDescription ? `
        <div class="field">
          <div class="field-label">Payment Flow Description</div>
          <div class="field-value">${data.paymentFlowDescription}</div>
        </div>
        ` : ''}
        
        <div class="field">
          <div class="field-label">User Account Features</div>
          <div class="field-value">${formatList(data.userAccountFeatures)}</div>
        </div>
        
        <div class="field">
          <div class="field-label">Live Chat Purpose</div>
          <div class="field-value">${formatValue(data.liveChatPurpose)}</div>
        </div>
        
        <div class="field">
          <div class="field-label">Blog Management</div>
          <div class="field-value">${formatValue(data.blogManagement)}</div>
        </div>
        
        <div class="field">
          <div class="field-label">Critical Features</div>
          <div class="field-value">${formatList(data.criticalFeatures)}</div>
        </div>
      </div>

      <!-- Section 4: Design & Technical -->
      <div class="section">
        <div class="section-title">🎨 Design & Technical</div>
        
        <div class="field">
          <div class="field-label">Brand Assets Available</div>
          <div class="field-value">${formatList(data.brandAssets)}</div>
        </div>
        
        ${data.designWords ? `
        <div class="field">
          <div class="field-label">Design Words</div>
          <div class="field-value">${data.designWords}</div>
        </div>
        ` : ''}
        
        ${data.contentProvider ? `
        <div class="field">
          <div class="field-label">Content Provider</div>
          <div class="field-value">${data.contentProvider.replace(/\n/g, '<br>')}</div>
        </div>
        ` : ''}
        
        <div class="field">
          <div class="field-label">Domain</div>
          <div class="field-value">${data.domainOwned === 'yes' ? `Yes - ${data.domainName || 'Name not provided'}` : 'No, needs to register one'}</div>
        </div>
        
        <div class="field">
          <div class="field-label">Hosting</div>
          <div class="field-value">${data.hostingOwned === 'yes' ? `Yes - ${data.hostingProvider || 'Provider not specified'}` : 'No, needs recommendation/setup'}</div>
        </div>
      </div>

      <!-- Section 5: Timeline & Budget -->
      <div class="section">
        <div class="section-title">📅 Timeline & Budget</div>
        
        <div class="field">
          <div class="field-label">Must Launch By</div>
          <div class="field-value">${data.launchDate}</div>
        </div>
        
        <div class="field">
          <div class="field-label">Priority Rankings (1-5)</div>
          <div class="field-value">
            <div class="priority-grid">
              <span>Stunning custom design</span>
              <span><strong>${data.priorityDesign}/5</strong></span>
              
              <span>Reliable payment functionality</span>
              <span><strong>${data.priorityPayment}/5</strong></span>
              
              <span>Complex features (accounts, chat)</span>
              <span><strong>${data.priorityFeatures}/5</strong></span>
              
              <span>Fast turnaround time</span>
              <span><strong>${data.prioritySpeed}/5</strong></span>
              
              <span>Ease of use to update later</span>
              <span><strong>${data.priorityEaseOfUse}/5</strong></span>
            </div>
          </div>
        </div>
        
        <div class="field">
          <div class="field-label">Open to Phased Approach</div>
          <div class="field-value">${data.phasedApproach === 'yes' ? 'Yes, that makes sense' : 'No, needs everything at once'}</div>
        </div>
        
        <div class="field">
          <div class="field-label">Post-Launch Maintenance</div>
          <div class="field-value">${formatValue(data.maintenancePreference)}</div>
        </div>
        
        ${data.finalNotes ? `
        <div class="field">
          <div class="field-label">Additional Notes & Concerns</div>
          <div class="field-value">${data.finalNotes.replace(/\n/g, '<br>')}</div>
        </div>
        ` : ''}
      </div>
    </div>
    
    <div class="footer">
      <p>This report was generated automatically by the RoomsOnline Project Discovery System.</p>
      <p>© ${new Date().getFullYear()} RoomsOnline. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

function generateClientConfirmationEmail(data: SurveyData): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Thank You for Your Submission</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background: white;
      border-radius: 8px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.1);
      overflow: hidden;
    }
    .header {
      background: linear-gradient(135deg, #e91e8c 0%, #f0469d 100%);
      color: white;
      padding: 30px;
      text-align: center;
    }
    .header h1 {
      margin: 0 0 10px;
      font-size: 24px;
    }
    .content {
      padding: 30px;
    }
    .highlight-box {
      background: #f9f5e3;
      border-left: 4px solid #C9A861;
      padding: 15px;
      margin: 20px 0;
      border-radius: 0 8px 8px 0;
    }
    .footer {
      text-align: center;
      padding: 20px;
      color: #888;
      font-size: 12px;
      background: #fafafa;
    }
    a {
      color: #e91e8c;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Thank You, ${data.contactDetails.split(',')[0]}!</h1>
    </div>
    
    <div class="content">
      <p>We've received your project discovery questionnaire for <strong>${data.businessName}</strong>.</p>
      
      <div class="highlight-box">
        <strong>What happens next?</strong><br>
        Our team will carefully review your answers and get back to you with a tailored proposal and quote within <strong>2 business days</strong>.
      </div>
      
      <p>In the meantime, if you have any questions or need to add anything, simply reply to this email.</p>
      
      <p>We're excited about the possibility of helping your business grow!</p>
      
      <p>Best regards,<br>
      <strong>The RoomsOnline Team</strong></p>
    </div>
    
    <div class="footer">
      <p>A full copy of your questionnaire responses is attached below for your records.</p>
      <p>© ${new Date().getFullYear()} RoomsOnline. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const data: SurveyData = await req.json();

    // Generate HTML report
    const htmlReport = generateHtmlReport(data);
    const clientConfirmation = generateClientConfirmationEmail(data);

    console.log(`Processing survey submission from ${data.clientEmail} for ${data.businessName}`);

    // Send report to dev team
    const devEmailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "RoomsOnline <hello@notify.roomsonline.co.za>",
        to: ["dev@roomsonline.co.za", "carike@roomsonline.co.za", "design@roomsonline.co.za"],
        subject: `New Project Discovery - ${data.businessName}`,
        html: htmlReport,
      }),
    });

    const devEmailResult = await devEmailRes.json();
    console.log("Dev email sent:", devEmailResult);

    // Send confirmation with full report to client
    const clientEmailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "RoomsOnline <hello@notify.roomsonline.co.za>",
        to: [data.clientEmail],
        subject: `Your Project Questionnaire - RoomsOnline`,
        html: clientConfirmation + "<hr style='margin: 40px 0; border: none; border-top: 1px solid #eee;'>" + htmlReport,
      }),
    });

    const clientEmailResult = await clientEmailRes.json();
    console.log("Client email sent:", clientEmailResult);

    return new Response(
      JSON.stringify({ 
        success: true, 
        devEmailId: devEmailResult.id,
        clientEmailId: clientEmailResult.id 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-survey-report:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

Deno.serve(handler);
