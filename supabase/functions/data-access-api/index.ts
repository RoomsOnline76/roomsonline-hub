import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const supabaseAuth = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } =
      await supabaseAuth.auth.getClaims(token);

    if (claimsError || !claimsData?.claims) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const userId = claimsData.claims.sub as string;

    const { action } = await req.json();

    if (action === "get_user_context") {
      // Fetch roles, profile, and sales_rep_id in parallel
      const [rolesResult, profileResult] = await Promise.all([
        supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", userId),
        supabaseAdmin
          .from("profiles")
          .select("id, email, full_name, avatar_url, role")
          .eq("id", userId)
          .single(),
      ]);

      const roles: string[] =
        rolesResult.data?.map((r: { role: string }) => r.role) ?? [];

      const hasSalesRep = roles.includes("sales_rep");
      let salesRepId: string | null = null;

      if (hasSalesRep) {
        const { data: repData } = await supabaseAdmin
          .from("sales_reps")
          .select("id")
          .eq("user_id", userId)
          .maybeSingle();
        salesRepId = repData?.id ?? null;
      }

      return jsonResponse({
        success: true,
        data: {
          profile: profileResult.data ?? null,
          roles,
          sales_rep_id: salesRepId,
        },
      });
    }

    return jsonResponse({ error: `Unknown action: ${action}` }, 400);
  } catch (err) {
    console.error("data-access-api error:", err);
    return jsonResponse({ error: err.message }, 500);
  }
});
