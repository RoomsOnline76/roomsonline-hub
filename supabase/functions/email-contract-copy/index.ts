import { Resend } from "npm:resend@2";

// Lazy client: constructed on first use so cold boots don't pay for it.
let _resend: Resend | null = null;
const getResend = () => (_resend ??= new Resend(Deno.env.get("RESEND_API_KEY")));
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface PropertyContractDetails {
  name: string;
  registeredName?: string;
  registrationNumber?: string;
  vatNumber?: string;
  telephone?: string;
  mobileNumber?: string;
  email?: string;
  physicalAddress?: string;
  postalAddress?: string;
  keyRepresentative?: string;
}

interface EmailContractRequest {
  contract_id: string;
  email: string;
  property_name: string;
  signing_url: string;
  property_details?: PropertyContractDetails;
}

function generatePropertyDetailsHTML(property?: PropertyContractDetails): string {
  if (!property) {
    return '<p style="color: #718096; font-size: 14px; font-style: italic;">[Property details will be displayed on the signing page]</p>';
  }

  return `
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; width: 40%; color: #2d3748;">Registered Name</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.registeredName || property.name || 'N/A'}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">Registration Number</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.registrationNumber || 'N/A'}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">VAT Number</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.vatNumber || 'N/A'}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">Telephone</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.telephone || 'N/A'}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">E-mail</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.email || 'N/A'}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">Physical Address</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.physicalAddress || 'N/A'}</td>
      </tr>
      <tr style="border-bottom: 1px solid #e2e8f0;">
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">Postal Address</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.postalAddress || property.physicalAddress || 'N/A'}</td>
      </tr>
      <tr>
        <td style="padding: 8px 0; font-weight: 600; color: #2d3748;">Key Representative</td>
        <td style="padding: 8px 0; color: #4a5568;">${property.keyRepresentative || 'N/A'}</td>
      </tr>
    </table>
  `;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { contract_id, email, property_name, signing_url, property_details }: EmailContractRequest = await req.json();

    if (!email || !property_name) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const logoUrl = "https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png";
    const propertyDetailsHTML = generatePropertyDetailsHTML(property_details);

    const emailResponse = await getResend().emails.send({
      from: "RoomsOnline <hello@notify.roomsonline.co.za>",
      to: [email],
      subject: `RoomsOnline Agreement for ${property_name} - For Your Review`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Contract for Review</title>
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f8f9fa;">
          <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 680px; margin: 0 auto; background-color: #ffffff;">
            <!-- Header -->
            <tr>
              <td style="padding: 32px 24px; text-align: center; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);">
                <img src="${logoUrl}" alt="RoomsOnline" style="height: 48px; margin-bottom: 16px;">
                <h1 style="color: #ffffff; font-size: 24px; margin: 0; font-weight: 600;">Partnership Agreement</h1>
                <p style="color: #a0aec0; font-size: 14px; margin: 8px 0 0 0;">For Your Review</p>
              </td>
            </tr>
            
            <!-- Content -->
            <tr>
              <td style="padding: 32px 24px;">
                <p style="color: #2d3748; font-size: 16px; line-height: 1.6; margin: 0 0 16px 0;">
                  Hello,
                </p>
                <p style="color: #2d3748; font-size: 16px; line-height: 1.6; margin: 0 0 24px 0;">
                  As requested, here is the RoomsOnline Accommodation Listing & Distribution Agreement for <strong>${property_name}</strong> for your review.
                </p>
                
                <!-- Agreement Box -->
                <div style="background-color: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin-bottom: 24px;">
                  <h2 style="color: #1a1a2e; font-size: 18px; margin: 0 0 16px 0; font-weight: 600;">ROOMSONLINE ACCOMMODATION LISTING & DISTRIBUTION AGREEMENT</h2>
                  
                  <p style="color: #4a5568; font-size: 14px; line-height: 1.7; margin: 0 0 16px 0;">
                    This Agreement sets out the terms and conditions on which Roomsonline provides online accommodation listing, booking facilitation, payment collection, and related distribution services to accommodation establishments.
                  </p>
                  
                  <h3 style="color: #2d3748; font-size: 15px; margin: 20px 0 8px 0; font-weight: 600;">1. ROOMSONLINE</h3>
                  <p style="color: #4a5568; font-size: 14px; line-height: 1.7; margin: 0 0 16px 0;">
                    Sleep in Africa (Pty) Ltd t/a Roomsonline<br>
                    Registration: 2014012490<br>
                    Contact: 082 323 8115 | Carike@roomsonline.co.za<br>
                    Address: 29 Woodlands Close, Parklands, 7441
                  </p>

                  <h3 style="color: #2d3748; font-size: 15px; margin: 20px 0 12px 0; font-weight: 600;">2. THE PROPERTY</h3>
                  ${propertyDetailsHTML}
                  
                  <h3 style="color: #2d3748; font-size: 15px; margin: 20px 0 8px 0; font-weight: 600;">3. Key Terms:</h3>
                  <ul style="color: #4a5568; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                    <li><strong>Commission:</strong> 10% (VAT exclusive) of Total Booking Value</li>
                    <li><strong>Payment Agent:</strong> Roomsonline acts as collection agent</li>
                    <li><strong>Payout Timing:</strong> Up to 7 days after checkout</li>
                    <li><strong>Content Rights:</strong> Perpetual, royalty-free license granted</li>
                    <li><strong>Delisting:</strong> 5 business days upon request</li>
                    <li><strong>Governing Law:</strong> Laws of South Africa</li>
                  </ul>
                </div>
                
                <p style="color: #4a5568; font-size: 14px; line-height: 1.6; margin: 0 0 24px 0;">
                  When you're ready to sign, click the button below to complete the electronic signature process. You'll be able to view the full contract text on the signing page.
                </p>
                
                <!-- CTA Button -->
                <div style="text-align: center; margin: 32px 0;">
                  <a href="${signing_url}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                    Sign Contract Now
                  </a>
                </div>
                
                <p style="color: #718096; font-size: 13px; line-height: 1.6; margin: 0; text-align: center;">
                  This link will expire. If you have any questions, please contact us at sleepinafrica@roomsonline.co.za
                </p>
              </td>
            </tr>
            
            <!-- Footer -->
            <tr>
              <td style="padding: 24px; background-color: #f7fafc; border-top: 1px solid #e2e8f0;">
                <p style="color: #718096; font-size: 12px; line-height: 1.6; margin: 0; text-align: center;">
                  © ${new Date().getFullYear()} Sleep in Africa (Pty) Ltd t/a RoomsOnline<br>
                  29 Woodlands Close, Parklands, 7441<br>
                  <a href="mailto:sleepinafrica@roomsonline.co.za" style="color: #667eea;">sleepinafrica@roomsonline.co.za</a>
                </p>
              </td>
            </tr>
          </table>
        </body>
        </html>
      `,
    });

    console.log("Contract email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, message: "Contract sent to email" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in email-contract-copy function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

Deno.serve(handler);
