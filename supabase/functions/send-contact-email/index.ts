import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "npm:resend@4";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ContactEmailRequest {
  name: string;
  email: string;
  message: string;
  honeypot?: string;
  recaptchaToken?: string;
}

// Verify reCAPTCHA token with Google
async function verifyRecaptcha(token: string): Promise<{ success: boolean; score: number }> {
  const secretKey = Deno.env.get("GOOGLE_RECAPTCHA_SECRET_KEY");
  
  if (!secretKey) {
    console.warn("GOOGLE_RECAPTCHA_SECRET_KEY not configured, skipping verification");
    return { success: true, score: 1.0 };
  }

  try {
    const response = await fetch("https://www.google.com/recaptcha/api/siteverify", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: `secret=${secretKey}&response=${token}`,
    });

    const data = await response.json();
    console.log("reCAPTCHA verification response:", { success: data.success, score: data.score });
    
    return {
      success: data.success === true,
      score: data.score || 0,
    };
  } catch (error) {
    console.error("reCAPTCHA verification error:", error);
    return { success: false, score: 0 };
  }
}

// ROL branded email template for user confirmation
const getUserConfirmationHtml = (name: string, message: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 0; background-color: #f4f4f4; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color: #f4f4f4;">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" style="background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          
          <!-- Header with ROL Branding -->
          <tr>
            <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 30px 40px; text-align: center;">
              <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="max-width: 180px; height: auto;" />
            </td>
          </tr>
          
          <!-- Main Content -->
          <tr>
            <td style="padding: 40px;">
              <h1 style="margin: 0 0 20px; color: #1a1a2e; font-size: 24px; font-weight: 600;">
                Thank you for reaching out, ${name}!
              </h1>
              
              <p style="margin: 0 0 20px; color: #4a5568; font-size: 16px; line-height: 1.6;">
                We've received your message and our team will get back to you as soon as possible. Below is a copy of what you sent us:
              </p>
              
              <!-- Message Box -->
              <div style="background-color: #f7fafc; border-left: 4px solid #1a1a2e; padding: 20px; margin: 24px 0; border-radius: 0 8px 8px 0;">
                <p style="margin: 0 0 8px; color: #718096; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">
                  Your Message
                </p>
                <p style="margin: 0; color: #2d3748; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">
                  ${message.replace(/\n/g, '<br>')}
                </p>
              </div>
              
              <p style="margin: 24px 0 0; color: #4a5568; font-size: 16px; line-height: 1.6;">
                In the meantime, feel free to explore our curated collection of exceptional accommodations across Africa.
              </p>
              
              <!-- CTA Button -->
              <div style="text-align: center; margin: 32px 0;">
                <a href="https://book.sleepinafrica.roomsonline.co.za" style="display: inline-block; background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: 600;">
                  Explore Properties
                </a>
              </div>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="background-color: #f7fafc; padding: 24px 40px; border-top: 1px solid #e2e8f0;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
                <tr>
                  <td style="text-align: center;">
                    <p style="margin: 0 0 8px; color: #1a1a2e; font-size: 14px; font-weight: 600;">
                      RoomsOnline
                    </p>
                    <p style="margin: 0 0 16px; color: #718096; font-size: 13px;">
                      Africa's Finest Stays
                    </p>
                    <p style="margin: 0; color: #a0aec0; font-size: 12px;">
                      © ${new Date().getFullYear()} RoomsOnline. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;

const handler = async (req: Request): Promise<Response> => {
  console.log("send-contact-email function called");
  
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { name, email, message, honeypot, recaptchaToken }: ContactEmailRequest = await req.json();
    
    console.log("Received contact form submission from:", email);

    // Honeypot check - if filled, it's likely a bot
    if (honeypot) {
      console.log("Honeypot triggered, likely bot submission");
      // Return success to not alert bots, but don't send email
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Verify reCAPTCHA token if provided
    if (recaptchaToken) {
      const { success, score } = await verifyRecaptcha(recaptchaToken);
      
      if (!success || score < 0.5) {
        console.log(`reCAPTCHA verification failed: success=${success}, score=${score}`);
        return new Response(
          JSON.stringify({ error: "Human verification failed. Please try again." }),
          { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
      }
      
      console.log(`reCAPTCHA verification passed: score=${score}`);
    } else {
      console.log("No reCAPTCHA token provided, proceeding without verification");
    }

    // Validate required fields
    if (!name || !email || !message) {
      console.error("Missing required fields");
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.error("Invalid email format:", email);
      return new Response(
        JSON.stringify({ error: "Invalid email format" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send notification email to RoomsOnline team
    const teamEmailResponse = await resend.emails.send({
      from: "RoomsOnline Contact <contact@notify.roomsonline.co.za>",
      to: ["carike@roomsonline.co.za"],
      replyTo: email,
      subject: `New Contact Form Submission from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Contact Form Submission</h2>
          <hr style="border: 1px solid #eee;" />
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <p><strong>Message:</strong></p>
          <div style="background-color: #f9f9f9; padding: 15px; border-radius: 5px; margin-top: 10px;">
            ${message.replace(/\n/g, '<br>')}
          </div>
          <hr style="border: 1px solid #eee; margin-top: 20px;" />
          <p style="color: #888; font-size: 12px;">
            Sent from RoomsOnline Contact Form at ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    console.log("Team notification email sent:", teamEmailResponse);

    // Send confirmation email to user with ROL branding
    const userEmailResponse = await resend.emails.send({
      from: "RoomsOnline <hello@notify.roomsonline.co.za>",
      to: [email],
      subject: "We've received your message - RoomsOnline",
      html: getUserConfirmationHtml(name, message),
    });

    console.log("User confirmation email sent:", userEmailResponse);

    return new Response(JSON.stringify({ 
      success: true, 
      data: { 
        teamEmail: teamEmailResponse, 
        userEmail: userEmailResponse 
      } 
    }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-contact-email function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);