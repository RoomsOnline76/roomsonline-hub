import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { storagePath, requestId, minAge, maxAge } = await req.json();

    if (!storagePath) {
      return new Response(JSON.stringify({ error: "storagePath is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download the image from storage using service_role
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate the upload session if a request id is provided
    if (requestId) {
      const { data: request, error: requestError } = await supabase
        .from("verification_requests")
        .select("id, status, expires_at, storage_path")
        .eq("id", requestId)
        .maybeSingle();

      if (requestError || !request) {
        return new Response(JSON.stringify({ error: "Invalid verification request" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (request.status !== "pending" && request.status !== "uploaded") {
        return new Response(JSON.stringify({ error: "Verification request already processed" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (new Date(request.expires_at) < new Date()) {
        return new Response(JSON.stringify({ error: "Verification request expired" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (request.storage_path !== storagePath) {
        return new Response(JSON.stringify({ error: "Storage path does not match request" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const { data: fileData, error: downloadError } = await supabase.storage
      .from("id-verifications")
      .download(storagePath);

    if (downloadError || !fileData) {
      console.error("Download error:", downloadError);
      return new Response(JSON.stringify({ error: "Failed to download document" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Convert to base64 for the AI model
    const arrayBuffer = await fileData.arrayBuffer();
    const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    const mimeType = fileData.type || "image/jpeg";

    // Call Lovable AI Gateway with vision
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an ID document analyzer. Extract the date of birth from the provided ID document image. You must respond using the extract_dob tool.",
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:${mimeType};base64,${base64}` },
              },
              {
                type: "text",
                text: "Extract the date of birth from this ID document or driver's license. If you cannot find a date of birth, set confidence to 0.",
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_dob",
              description: "Return the extracted date of birth from the document",
              parameters: {
                type: "object",
                properties: {
                  dob: {
                    type: "string",
                    description: "Date of birth in YYYY-MM-DD format",
                  },
                  confidence: {
                    type: "number",
                    description: "Confidence score 0-1",
                  },
                },
                required: ["dob", "confidence"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_dob" } },
        temperature: 0.1,
      }),
    });

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Service busy, please try again" }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ error: "AI verification failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiResult = await aiResponse.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];

    if (!toolCall?.function?.arguments) {
      return new Response(
        JSON.stringify({ eligible: false, error: "Could not read document", extractedAge: null, dob: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const extracted = JSON.parse(toolCall.function.arguments);
    const { dob, confidence } = extracted;

    if (!dob || confidence < 0.5) {
      return new Response(
        JSON.stringify({ eligible: false, error: "Could not reliably read date of birth", extractedAge: null, dob: null }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Calculate age
    const birthDate = new Date(dob);
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }

    // Check eligibility
    let eligible = true;
    if (minAge != null && age < minAge) eligible = false;
    if (maxAge != null && age > maxAge) eligible = false;

    // Clean up the uploaded file
    await supabase.storage.from("id-verifications").remove([storagePath]);

    return new Response(
      JSON.stringify({ eligible, extractedAge: age, dob, confidence }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("verify-age-document error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
