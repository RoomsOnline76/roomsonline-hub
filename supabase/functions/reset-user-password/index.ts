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
    // Create admin client for privileged operations
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

    // Verify the requesting user is authenticated
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use getClaims to validate the JWT token server-side
    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await supabaseAdmin.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      console.error('Auth error:', claimsError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = claimsData.claims.sub as string;

    // Check if user is admin or dev
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', userId)
      .in('role', ['admin', 'dev', 'fearless_leader']);

    if (roleError) {
      console.error('Role check error:', roleError);
      return new Response(
        JSON.stringify({ error: 'Error checking permissions' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!roleData || roleData.length === 0) {
      console.error('User lacks admin/dev role:', userId);
      return new Response(
        JSON.stringify({ error: 'Unauthorized - Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

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

    const userName = profile?.full_name || 'User';

    // Generate password reset link with correct redirect URL
    const redirectUrl = 'https://sleepinafrica.roomsonline.co.za/auth?mode=recovery';
    
    const { data: resetData, error: resetError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: email,
      options: {
        redirectTo: redirectUrl,
      }
    });

    if (resetError) {
      console.error('Generate reset link error:', resetError);
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
    const resetLink = resetData.properties.action_link;

    console.log('Sending password reset email to:', email);

    // Send custom password reset email via Resend
    const emailResponse = await getResend().emails.send({
      from: fromEmail,
      to: [email],
      subject: "Password Reset Request - RoomsOnline",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>Hi ${userName},</p>
          <p>We received a request to reset your password for your RoomsOnline account. Click the button below to set a new password:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetLink}" 
               style="display: inline-block; background: #e91e8c; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">
              Reset Password
            </a>
          </div>
          
          <p style="color: #666; font-size: 14px;">
            If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.
          </p>
          
          <p style="color: #666; font-size: 14px;">
            This link will expire in 24 hours for security reasons.
          </p>
          
          <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;" />
          
          <p style="color: #999; font-size: 12px;">
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
      JSON.stringify({ message: 'Password reset email sent successfully' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in reset-user-password function:', error);
    return new Response(
      JSON.stringify({ error: 'An error occurred while processing your request' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});