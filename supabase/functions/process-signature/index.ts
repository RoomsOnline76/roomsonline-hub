import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendKey = Deno.env.get("RESEND_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const { contract_id, signing_token, signee_name, signee_email, signee_designation, signature_data_url } = await req.json();

    // Validate inputs
    if (!contract_id || !signing_token || !signee_name || !signee_email || !signature_data_url) {
      return new Response(JSON.stringify({ error: "Missing required fields" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify contract and token
    const { data: contract, error: fetchError } = await supabase
      .from("property_contracts")
      .select("*, property_id")
      .eq("id", contract_id)
      .eq("signing_token", signing_token)
      .single();

    if (fetchError || !contract) {
      return new Response(JSON.stringify({ error: "Invalid contract or token" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (contract.status === "signed") {
      return new Response(JSON.stringify({ error: "Contract already signed" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check token expiry
    if (contract.token_expires_at && new Date(contract.token_expires_at) < new Date()) {
      return new Response(JSON.stringify({ error: "Signing link has expired" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get client IP
    const clientIp = req.headers.get("x-forwarded-for")?.split(",")[0] || 
                     req.headers.get("x-real-ip") || 
                     "unknown";
    const userAgent = req.headers.get("user-agent") || "unknown";

    // Store signature image
    const signatureFileName = `${contract_id}-signature.png`;
    const base64Data = signature_data_url.replace(/^data:image\/\w+;base64,/, "");
    const signatureBuffer = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

    const { error: uploadError } = await supabase.storage
      .from("signatures")
      .upload(signatureFileName, signatureBuffer, {
        contentType: "image/png",
        upsert: true,
      });

    if (uploadError) {
      console.error("Signature upload error:", uploadError);
    }

    const { data: signatureUrlData } = supabase.storage
      .from("signatures")
      .getPublicUrl(signatureFileName);

    // Update contract as signed - INVALIDATE TOKEN for one-time use
    const { error: updateError } = await supabase
      .from("property_contracts")
      .update({
        status: "signed",
        signing_token: null,  // Invalidate token - one-time use only
        token_expires_at: null,
        signed_at: new Date().toISOString(),
        signed_by_name: signee_name,
        signed_by_email: signee_email,
        signed_by_designation: signee_designation || null,
        signature_image_url: signatureUrlData.publicUrl,
        signature_data: { dataUrl: signature_data_url },
        signature_ip: clientIp,
        signature_user_agent: userAgent,
      })
      .eq("id", contract_id);

    if (updateError) {
      console.error("Update error:", updateError);
      return new Response(JSON.stringify({ error: "Failed to update contract" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get property details for email
    const { data: property } = await supabase
      .from("properties")
      .select("name")
      .eq("id", contract.property_id)
      .single();

    // Send confirmation emails
    if (resendKey) {
      const resend = new Resend(resendKey);

      const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: 'Segoe UI', sans-serif; background-color: #f5f5f5; padding: 40px;">
  <div style="max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; padding: 40px;">
    <div style="text-align: center; margin-bottom: 30px;">
      <div style="font-size: 48px; color: #22c55e;">✓</div>
      <h1 style="color: #333; margin: 10px 0;">Contract Signed Successfully</h1>
    </div>
    <p style="color: #333;">Dear ${signee_name},</p>
    <p style="color: #333;">Thank you for signing the RoomsOnline partnership agreement for <strong>${property?.name || "your property"}</strong>.</p>
    <p style="color: #333;">Your signed contract is now on file. Welcome to RoomsOnline!</p>
    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
    <p style="color: #666; font-size: 14px; text-align: center;">The RoomsOnline Team<br><a href="mailto:info@roomsonline.co.za" style="color: #e91e8c;">info@roomsonline.co.za</a></p>
  </div>
</body>
</html>`;

      // Send to signee
      await resend.emails.send({
        from: "RoomsOnline <noreply@notify.roomsonline.co.za>",
        to: signee_email,
        subject: `Contract Signed - ${property?.name || "Property"}`,
        html: emailHtml,
      });

      // Send to Carike
      await resend.emails.send({
        from: "RoomsOnline <noreply@notify.roomsonline.co.za>",
        to: "carike@roomsonline.co.za",
        subject: `[Contract Signed] ${property?.name || "Property"} - ${signee_name}`,
        html: emailHtml.replace("Dear " + signee_name, "Dear Carike") + 
          `<p style="color: #666; font-size: 12px;">Signed by: ${signee_name} (${signee_email}) from IP: ${clientIp}</p>`,
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    console.error("Error in process-signature:", error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
