import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "");
    const token = typeof body?.token === "string" ? body.token.trim() : "";

    if (!action) return json({ error: "MISSING_ACTION" }, 400);
    if (!token) return json({ error: "MISSING_TOKEN" }, 400);

    const { data: contract, error } = await supabase
      .from("rep_contracts")
      .select("*")
      .eq("signing_token", token)
      .maybeSingle();

    if (error) throw error;
    if (!contract) return json({ error: "CONTRACT_NOT_FOUND" }, 404);

    const { data: rep } = await supabase
      .from("sales_reps")
      .select("id, display_name, rep_code, email, phone, commission_tier")
      .eq("id", contract.rep_id)
      .maybeSingle();

    if (action === "get") {
      return json({
        success: true,
        contract: {
          id: contract.id,
          status: contract.status,
          sent_at: contract.sent_at,
          signed_at: contract.signed_at,
          signer_name: contract.signer_name,
          signer_email: contract.signer_email,
          signed_html: contract.signed_html,
          terms_snapshot: contract.terms_snapshot,
        },
        rep: rep || null,
      });
    }

    if (action === "sign") {
      if (contract.status === "signed") return json({ error: "ALREADY_SIGNED" }, 409);

      const signerName = String(body?.signer_name || "").trim();
      const signerEmail = String(body?.signer_email || "").trim();
      const signatureImage = String(body?.signature_image || "");
      const signedHtml = typeof body?.signed_html === "string" ? body.signed_html : contract.signed_html;

      if (!signerName || !signerEmail || !signatureImage) {
        return json({ error: "MISSING_SIGNATURE_FIELDS" }, 400);
      }

      const signedAt = new Date().toISOString();
      const meta = {
        image: signatureImage,
        ip: req.headers.get("x-forwarded-for") || null,
        user_agent: req.headers.get("user-agent") || null,
      };

      const { error: updErr } = await supabase
        .from("rep_contracts")
        .update({
          status: "signed",
          signed_at: signedAt,
          signer_name: signerName,
          signer_email: signerEmail,
          signature_data: meta,
          signed_html: signedHtml,
          updated_at: signedAt,
        })
        .eq("id", contract.id);

      if (updErr) throw updErr;

      return json({ success: true, signed_at: signedAt });
    }

    return json({ error: "UNKNOWN_ACTION" }, 400);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("rep-contract-portal error:", message);
    return json({ error: message }, 500);
  }
});
