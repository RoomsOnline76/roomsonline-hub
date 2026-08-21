import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-warm",
};


// Module-scoped so the JWKS / signing-key cache survives between requests.
// Re-creating the client per call re-fetched keys every time and could hang.
const supabaseAdmin = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

async function verifyClaims(token: string, timeoutMs: number) {
  return (await Promise.race([
    supabaseAdmin.auth.getClaims(token),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("auth_timeout")), timeoutMs)
    ),
  ])) as Awaited<ReturnType<typeof supabaseAdmin.auth.getClaims>>;
}

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

  // Keep-warm probe: answered before any client/auth/DB work so the isolate
  // stays resident without doing (or authorising) real work.
  if (req.headers.get("x-warm") === "1") {
    return jsonResponse({ success: true, warm: true });
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

    const token = authHeader.replace("Bearer ", "");

    let claims: Record<string, unknown> | null = null;
    try {
      // Bound the upstream auth call so a hung/slow verify can never let the
      // worker be killed before we return a response (which surfaced as 502).
      const { data: claimsData, error: claimsError } = await Promise.race([
        supabaseAdmin.auth.getClaims(token),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("auth_timeout")), 8000)
        ),
      ]) as Awaited<ReturnType<typeof supabaseAdmin.auth.getClaims>>;
      if (claimsError || !claimsData?.claims) {
        return jsonResponse({ error: "Unauthorized", code: "invalid_token" }, 401);
      }
      claims = claimsData.claims as Record<string, unknown>;
    } catch (authErr) {
      const message = String((authErr as Error)?.message ?? authErr);
      if (message === "auth_timeout") {
        console.warn("data-access-api auth verify timed out");
        return jsonResponse(
          { error: "Auth verification timed out", code: "auth_timeout" },
          503
        );
      }
      const expired = /expired/i.test(message);
      console.warn("data-access-api auth rejected:", message);
      return jsonResponse(
        {
          error: expired ? "Session expired" : "Unauthorized",
          code: expired ? "token_expired" : "invalid_token",
        },
        401
      );
    }


    const userId = claims.sub as string;

    let action: string | undefined;
    try {
      ({ action } = await req.json());
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

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
          .maybeSingle(),
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
