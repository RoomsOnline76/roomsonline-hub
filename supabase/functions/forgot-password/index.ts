import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { z } from "npm:zod@3.23.8";

// Lazy client: constructed on first use so cold boots don't pay for it.
let _resend: Resend | null = null;
const getResend = () => (_resend ??= new Resend(Deno.env.get("RESEND_API_KEY")));
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const requestSchema = z.object({
  email: z.string().trim().email("Invalid email address").max(255, "Email too long"),
});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    );

    const body = await req.json();
    
    const validationResult = requestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error("Validation failed:", validationResult.error);
      return new Response(
        JSON.stringify({ error: 'Invalid email address' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const { email } = validationResult.data;

    // Get the user's name from profiles
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('email', email)
      .maybeSingle();

    // If no profile found, still return success to prevent email enumeration
    if (!profile) {
      console.log('No profile found for email:', email);
      return new Response(
        JSON.stringify({ message: 'If an account exists, a password reset email has been sent' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userName = profile?.full_name || 'User';

    // Generate password recovery link
    const redirectUrl = 'https://sleepinafrica.roomsonline.co.za/auth?mode=recovery';
    
    const { data: recoveryData, error: recoveryError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectUrl,
      }
    });

    if (recoveryError) {
      console.error('Generate recovery link error:', recoveryError);
      return new Response(
        JSON.stringify({ error: 'Unable to generate password reset link' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch configurable email addresses from api_keys table
    const { data: emailConfig } = await supabaseAdmin
      .from("api_keys")
      .select("key_name, key_value")
      .in("key_name", ["RESEND_FROM_EMAIL"]);

    const fromEmailConfig = emailConfig?.find((k: any) => k.key_name === "RESEND_FROM_EMAIL")?.key_value;
    const fromEmail = fromEmailConfig || "RoomsOnline <hello@notify.roomsonline.co.za>";

    // The action link from Supabase
    const resetLink = recoveryData.properties.action_link;

    console.log('Sending password reset email to:', email);

    // Send custom password reset email via Resend
    const emailResponse = await getResend().emails.send({
      from: fromEmail,
      to: [email],
      subject: "Password Reset - RoomsOnline",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="text-align: center; margin-bottom: 30px;">
            <img src="https://sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="height: 50px;" />
          </div>
          
          <h2 style="color: #333; text-align: center;">Password Reset Request</h2>
          <p>Hi ${userName},</p>
          <p>We received a request to reset your password for your RoomsOnline account. Click the button below to set a new password:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="display: inline-block; background: #e91e63; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          
          
          <p style="color: #666; font-size: 14px;">
            If you didn't request this, you can safely ignore this email.
          </p>
          
          <p style="color: #666; font-size: 14px;">
            This link will expire in 24 hours for security reasons.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          
          <p style="color: #999; font-size: 12px; text-align: center;">
            Best regards,<br>
            The RoomsOnline Team
          </p>
        </div>
      `,
    });

    if (emailResponse.error) {
      console.error('Resend email error:', emailResponse.error);
      return new Response(
        JSON.stringify({ error: 'Unable to send password reset email' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Password reset email sent successfully to:', email);

    return new Response(
      JSON.stringify({ message: 'If an account exists, a password reset email has been sent' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in forgot-password function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing your request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
