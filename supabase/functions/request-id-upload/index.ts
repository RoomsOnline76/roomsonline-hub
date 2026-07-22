import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const BodySchema = z.object({
  property_id: z.string().uuid(),
  booking_reference: z.string().max(100).optional(),
  min_age: z.number().int().min(0).optional(),
  max_age: z.number().int().min(0).optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { property_id, booking_reference, min_age, max_age } = parsed.data;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const storagePath = `${property_id}/${crypto.randomUUID()}.jpg`;

    const { data: request, error: insertError } = await supabase
      .from("verification_requests")
      .insert({
        property_id,
        booking_reference: booking_reference || null,
        storage_path: storagePath,
        status: "pending",
        min_age: min_age ?? null,
        max_age: max_age ?? null,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      })
      .select("id, storage_path, expires_at")
      .single();

    if (insertError || !request) {
      console.error("verification request insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to create upload session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from("id-verifications")
      .createSignedUploadUrl(storagePath);

    if (signedUrlError || !signedUrlData?.signedUrl || !signedUrlData?.token) {
      console.error("signed upload url error:", signedUrlError);
      // Roll back the pending request so it cannot be reused
      await supabase.from("verification_requests").delete().eq("id", request.id);
      return new Response(
        JSON.stringify({ error: "Failed to create signed upload URL" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        request_id: request.id,
        storage_path: request.storage_path,
        signed_url: signedUrlData.signedUrl,
        upload_token: signedUrlData.token,
        expires_at: request.expires_at,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("request-id-upload error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
