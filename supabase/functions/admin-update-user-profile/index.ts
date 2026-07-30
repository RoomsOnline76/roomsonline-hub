import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
    if (!token) return json({ error: "Unauthorized" }, 401);
    const { data: { user: caller }, error: authError } = await admin.auth.getUser(token);
    if (authError || !caller) return json({ error: "Unauthorized" }, 401);

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", caller.id);
    const allowed = (roles ?? []).some((r: { role: string }) =>
      ["admin", "dev", "fearless_leader"].includes(r.role)
    );
    if (!allowed) return json({ error: "Forbidden: admin access required" }, 403);

    const body = await req.json().catch(() => ({}));
    const userId: string = (body.user_id ?? "").trim();
    const email: string = (body.email ?? "").trim().toLowerCase();
    const fullName: string | null = body.full_name != null ? String(body.full_name).trim() : null;
    const phone: string | null = body.phone != null && String(body.phone).trim() !== ""
      ? String(body.phone).trim()
      : null;

    if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "Valid user_id is required" }, 400);
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || email.length > 255) {
      return json({ error: "A valid email is required" }, 400);
    }
    if (fullName != null && (fullName.length < 1 || fullName.length > 100)) {
      return json({ error: "Full name must be 1-100 characters" }, 400);
    }

    const { data: existing, error: readErr } = await admin
      .from("profiles")
      .select("id, email")
      .eq("id", userId)
      .maybeSingle();
    if (readErr) return json({ error: readErr.message }, 500);
    if (!existing) return json({ error: "User profile not found" }, 404);

    // Update the auth identity first so sign-in email matches the profile.
    if (existing.email?.toLowerCase() !== email) {
      const { error: authUpdateErr } = await admin.auth.admin.updateUserById(userId, {
        email,
        email_confirm: true,
      });
      if (authUpdateErr) {
        return json({ error: `Auth email update failed: ${authUpdateErr.message}` }, 400);
      }
    }

    const { data: updated, error: updateErr } = await admin
      .from("profiles")
      .update({ email, full_name: fullName, phone })
      .eq("id", userId)
      .select("id, email, full_name, phone")
      .maybeSingle();
    if (updateErr) return json({ error: updateErr.message }, 500);
    if (!updated) return json({ error: "Profile update did not apply" }, 500);

    return json({ success: true, profile: updated });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Unexpected error" }, 500);
  }
});
