import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-warm",
};


const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

function tokenSubject(token: string): string | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const parsed = JSON.parse(atob(padded)) as { sub?: unknown };
    return typeof parsed.sub === "string" && parsed.sub.length > 0 ? parsed.sub : null;
  } catch {
    return null;
  }
}

function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, { ...init, signal: AbortSignal.timeout(8000) });
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

    const token = authHeader.slice("Bearer ".length);
    const userId = tokenSubject(token);
    if (!userId || !supabaseUrl || !supabaseAnonKey) {
      return jsonResponse({ error: "Unauthorized", code: "invalid_token" }, 401);
    }

    // Use the caller's token for every data read. PostgREST validates the JWT
    // and RLS constrains access, avoiding a separate Auth verification request
    // that previously stalled every page load when the Auth service was slow.
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: `Bearer ${token}` },
        fetch: timedFetch,
      },
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let action: string | undefined;
    try {
      ({ action } = await req.json());
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    if (action === "get_user_context") {
      // Fetch roles, profile, and sales_rep_id in parallel
      const [rolesResult, profileResult] = await Promise.all([
        supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userId),
        supabase
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
        const { data: repData } = await supabase
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
  } catch (err: unknown) {
    console.error("data-access-api error:", err);
    const message = err instanceof Error ? err.message : "Unexpected error";
    const timedOut = /timeout|aborted/i.test(message);
    return jsonResponse(
      { error: timedOut ? "Data service temporarily unavailable" : message, code: timedOut ? "data_timeout" : "internal_error" },
      timedOut ? 503 : 500,
    );
  }
});
