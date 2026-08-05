import { createClient } from "npm:@supabase/supabase-js@2";
import { Resend } from "npm:resend@4";
import { z } from "npm:zod@3.23.8";

// Lazy client: constructed on first use so cold boots don't pay for it.
let _resend: Resend | null = null;
const getResend = () => (_resend ??= new Resend(Deno.env.get("RESEND_API_KEY")));
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const MAX_REQUESTS_PER_IP = 5;
const DUPLICATE_EMAIL_WINDOW_HOURS = 24;

const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

const requestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(100, "Name too long"),
  email: z.string().trim().email("Invalid email address").max(255, "Email too long"),
  message: z.string().trim().max(1000, "Message too long").optional(),
  source_page: z.string().trim().max(255).optional(),
});

function getClientIP(req: Request): string {
  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIP = req.headers.get("x-real-ip");
  if (realIP) return realIP;
  return "unknown";
}

function checkRateLimit(ip: string): { allowed: boolean; retryAfter?: number } {
  const now = Date.now();
  const record = rateLimitStore.get(ip);
  if (!record || now > record.resetTime) {
    rateLimitStore.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
    return { allowed: true };
  }
  if (record.count >= MAX_REQUESTS_PER_IP) {
    const retryAfter = Math.ceil((record.resetTime - now) / 1000);
    return { allowed: false, retryAfter };
  }
  record.count++;
  return { allowed: true };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIP = getClientIP(req);
    const rateCheck = checkRateLimit(clientIP);

    if (!rateCheck.allowed) {
      console.warn(`Rate limit exceeded for IP: ${clientIP}`);
      return new Response(
        JSON.stringify({ error: "Too many requests. Please try again later." }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(rateCheck.retryAfter),
            ...corsHeaders,
          },
        }
      );
    }

    // Extract origin metadata from headers
    const userAgent = req.headers.get("user-agent") || null;
    const referrerUrl = req.headers.get("referer") || null;

    const body = await req.json();

    const validationResult = requestSchema.safeParse(body);
    if (!validationResult.success) {
      console.error("Validation failed:", validationResult.error);
      return new Response(
        JSON.stringify({ error: "Invalid request data" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { name, email, message, source_page } = validationResult.data;

    console.log("Received access request:", { name, email, ip: clientIP, source_page });

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for duplicate email requests
    const windowStart = new Date();
    windowStart.setHours(windowStart.getHours() - DUPLICATE_EMAIL_WINDOW_HOURS);

    const { data: existingRequests, error: checkError } = await supabase
      .from("access_requests")
      .select("id, status, created_at")
      .eq("email", email)
      .gte("created_at", windowStart.toISOString())
      .order("created_at", { ascending: false })
      .limit(1);

    if (checkError) {
      console.error("Error checking duplicate requests:", checkError);
    } else if (existingRequests && existingRequests.length > 0) {
      const existing = existingRequests[0];
      console.warn(`Duplicate request blocked for email: ${email}, existing status: ${existing.status}`);

      let userMessage = "You have already submitted an access request. ";
      if (existing.status === "pending") {
        userMessage += "Your request is being reviewed.";
      } else if (existing.status === "approved") {
        userMessage += "Your request has been approved. Please check your email.";
      } else {
        userMessage += "Please contact support if you need assistance.";
      }

      return new Response(
        JSON.stringify({ error: userMessage }),
        { status: 409, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Fetch configurable email addresses
    const { data: emailConfig } = await supabase
      .from("api_keys")
      .select("key_name, key_value")
      .in("key_name", ["RESEND_FROM_EMAIL", "RESEND_TO_EMAIL"]);

    const fromEmailConfig = emailConfig?.find((k: any) => k.key_name === "RESEND_FROM_EMAIL")?.key_value;
    const toEmailConfig = emailConfig?.find((k: any) => k.key_name === "RESEND_TO_EMAIL")?.key_value;
    const fromEmail = fromEmailConfig || "RoomsOnline <onboarding@getResend().dev>";
    const adminEmail = toEmailConfig || "sleepinafrica@roomsonline.co.za";

    console.log("Using email config:", { fromEmail, adminEmail });

    // Store request with origin metadata
    const { data: accessRequest, error: dbError } = await supabase
      .from("access_requests")
      .insert({
        full_name: name,
        email: email,
        message: message || null,
        status: "pending",
        source_ip: clientIP !== "unknown" ? clientIP : null,
        user_agent: userAgent,
        referrer_url: referrerUrl,
        source_page: source_page || null,
      })
      .select()
      .single();

    if (dbError) {
      console.error("Database error:", dbError);
      return new Response(
        JSON.stringify({ error: "Failed to save request" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Access request saved:", accessRequest.id);

    // Send notification email to admin
    await getResend().emails.send({
      from: fromEmail,
      to: [adminEmail],
      subject: `New Access Request from ${name}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Access Request</h2>
          <p>A new user has requested access to RoomsOnline:</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            ${message ? `<p><strong>Message:</strong> ${message}</p>` : ""}
            ${source_page ? `<p><strong>Source:</strong> ${source_page}</p>` : ""}
            ${clientIP !== "unknown" ? `<p><strong>IP:</strong> ${clientIP}</p>` : ""}
          </div>
          <p>Please review this request in the admin panel:</p>
          <a href="https://sleepinafrica.roomsonline.co.za/admin/access-requests" 
             style="display: inline-block; background: #e91e8c; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px;">
            Review Request
          </a>
          <p style="color: #666; margin-top: 30px; font-size: 12px;">
            This is an automated notification from RoomsOnline.
          </p>
        </div>
      `,
    });

    // Send confirmation email to requester
    await getResend().emails.send({
      from: fromEmail,
      to: [email],
      subject: "Access Request Received - RoomsOnline",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Thank You for Your Interest!</h2>
          <p>Hi ${name},</p>
          <p>We've received your access request for RoomsOnline. Our team will review your request and get back to you shortly.</p>
          <p style="color: #666; margin-top: 30px;">
            Best regards,<br>
            The RoomsOnline Team
          </p>
        </div>
      `,
    });

    console.log("Emails sent successfully");

    return new Response(
      JSON.stringify({ success: true, message: "Request submitted successfully" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-access-request:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

Deno.serve(handler);
