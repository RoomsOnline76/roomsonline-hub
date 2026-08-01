/**
 * Close (archive) a Rentals United sub-user account.
 *
 * Uses Push_ArchiveUser_RQ authenticated AS the sub-user (UserName/Password).
 * Master AccessKey/SecretKey must never be used — that would archive the master.
 *
 * Docs: https://developer.rentalsunited.com/#close-user-account
 *
 * Effects on RU: loses dashboard access, channel connections removed, properties archived.
 * Locally: clears the portfolio/property RU bind (identity reset).
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&")
    .replace(/</g, "<")
    .replace(/>/g, ">")
    .replace(/"/g, """)
    .replace(/'/g, "'");
}

function extractStatusId(xml: string): { id: string; message: string } {
  const errorMatch = xml.match(/<error\s+ID="([^"]+)"[^>]*>([\s\S]*?)<\/error>/i);
  if (errorMatch) {
    return { id: errorMatch[1], message: errorMatch[2]?.trim() || "RU error" };
  }
  // Support negative status IDs (e.g. -4 Incorrect login or password)
  const idMatch = xml.match(/<Status\s+ID="(-?\d+)"/i);
  const msgMatch = xml.match(/<Status[^>]*>([\s\S]*?)<\/Status>/i);
  return {
    id: idMatch?.[1] ?? "unknown",
    message: msgMatch?.[1]?.trim() || "Unknown",
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const admin = createClient(supabaseUrl, serviceKey);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) {
      return json({ success: false, error: { code: "UNAUTHORIZED", message: "Missing Authorization header" } }, 401);
    }

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await userClient.auth.getUser();
    const user = userData?.user;
    if (!user) {
      return json({ success: false, error: { code: "UNAUTHORIZED", message: "Invalid session" } }, 401);
    }

    const { data: roles } = await admin.from("user_roles").select("role").eq("user_id", user.id);
    const allowed = (roles ?? []).some((r: { role: string }) =>
      ["admin", "dev", "fearless_leader"].includes(r.role)
    );
    if (!allowed) {
      return json({ success: false, error: { code: "FORBIDDEN", message: "Admin access required" } }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const accountId: string = body.account_id ?? "";
    if (!accountId) {
      return json({ success: false, error: { code: "BAD_REQUEST", message: "account_id is required" } }, 400);
    }

    const { data: account } = await admin
      .from("ru_owner_accounts")
      .select(
        "id, owner_email, ru_login_email, ru_owner_id, ru_user_id, ru_login_password_enc, portfolio_id, property_id, scope",
      )
      .eq("id", accountId)
      .maybeSingle();

    if (!account) {
      return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
    }

    const ownerId = String(account.ru_owner_id ?? "").trim();
    const loginEmail = String(account.ru_login_email ?? account.owner_email ?? "").trim();
    if (!ownerId) {
      return json({
        success: false,
        error: {
          code: "NOT_BOUND",
          message: "This row is not bound to an RU OwnerID. Nothing to close on Rentals United.",
        },
      }, 422);
    }
    if (!loginEmail) {
      return json({
        success: false,
        error: { code: "NO_LOGIN_EMAIL", message: "No RU login email on this account." },
      }, 422);
    }
    if (!account.ru_login_password_enc) {
      return json({
        success: false,
        error: {
          code: "NO_STORED_PASSWORD",
          message:
            "No sub-user password is stored. Push_ArchiveUser_RQ must authenticate as the sub-user (UserName/Password). Store the password first, or ask RU support to close OwnerID " +
            ownerId +
            ".",
        },
      }, 422);
    }

    const { data: decrypted, error: decErr } = await admin.rpc("decrypt_sensitive_text", {
      encrypted_data: account.ru_login_password_enc,
    });
    if (decErr || !decrypted || decrypted === "[ENCRYPTED]" || decrypted === "[DECRYPTION_ERROR]") {
      return json({
        success: false,
        error: { code: "DECRYPT_FAILED", message: decErr?.message || "Could not decrypt the stored password" },
      }, 500);
    }

    // Resolve RU endpoint (master keys only used to know the endpoint host — never for ArchiveUser auth)
    const envEndpoint = (Deno.env.get("RENTALS_UNITED_ENDPOINT") ?? "").trim();
    let endpoint = envEndpoint || "https://rm.rentalsunited.com/api/Handler.ashx";
    try {
      const { data: credRow } = await admin
        .from("pms_credentials")
        .select("base_url")
        .eq("system_type", "rentalsunited")
        .eq("is_active", true)
        .maybeSingle();
      if (credRow?.base_url) endpoint = String(credRow.base_url).trim() || endpoint;
    } catch {
      /* keep default */
    }

    // 🔒 Child-only auth — never master AccessKey/SecretKey
    const xml = `<?xml version="1.0" encoding="utf-8"?>
<Push_ArchiveUser_RQ>
  <Authentication>
    <UserName>${escapeXml(loginEmail)}</UserName>
    <Password>${escapeXml(String(decrypted))}</Password>
  </Authentication>
</Push_ArchiveUser_RQ>`;

    const compact = xml.replace(/<\?xml[^?]*\?>\s*/gi, "").replace(/>\s+</g, "><").trim();
    console.log(
      `[ru-close-user] Push_ArchiveUser_RQ for OwnerID ${ownerId} as ${loginEmail} (child auth only)`,
    );

    const ruRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: compact,
    });
    if (!ruRes.ok) {
      const text = await ruRes.text();
      return json({
        success: false,
        error: {
          code: "RU_HTTP_ERROR",
          message: `Rentals United returned HTTP ${ruRes.status}: ${text.slice(0, 400)}`,
        },
      }, 502);
    }

    const responseXml = await ruRes.text();
    const status = extractStatusId(responseXml);
    console.log(
      `[ru-close-user] RU response status=${status.id} message=${status.message} preview=${responseXml.slice(0, 400)}`,
    );

    if (status.id !== "0") {
      const isAuth = status.id === "-4" || /incorrect login or password/i.test(status.message);
      return json({
        success: false,
        error: {
          code: isAuth ? "RU_CHILD_LOGIN_REJECTED" : "RU_ARCHIVE_FAILED",
          message: isAuth
            ? `Rentals United rejected the sub-user login for ${loginEmail} (OwnerID ${ownerId}, Status ${status.id}). The stored password cannot authenticate Push_ArchiveUser_RQ. Ask RU support to close this OwnerID, or store a working password and retry.`
            : `Rentals United rejected archive for OwnerID ${ownerId}: ${status.message} (Status ${status.id})`,
          ru_status_id: status.id,
        },
        login_email: loginEmail,
        ru_owner_id: ownerId,
      }, 422);
    }

    // Clear local bind so Phase 1 can create a fresh sub-user
    const localPatch: Record<string, unknown> = {
      ru_owner_id: null,
      ru_user_id: null,
      ru_login_email: null,
      ru_login_url: null,
      ru_login_password_enc: null,
      company_details_sent: false,
      company_filled_at: null,
      company_details_status: "pending",
      company_payload: null,
    };
    const { error: upErr } = await admin.from("ru_owner_accounts").update(localPatch).eq("id", account.id);
    if (upErr) {
      return json({
        success: false,
        error: {
          code: "LOCAL_CLEAR_FAILED",
          message: `RU closed OwnerID ${ownerId}, but clearing the local bind failed: ${upErr.message}`,
        },
        ru_closed: true,
        ru_owner_id: ownerId,
      }, 500);
    }

    await admin
      .from("audit_logs")
      .insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_owner_accounts",
        record_id: account.id,
        request_origin: "edge_function",
        edge_function_name: "ru-close-user",
        is_sensitive: true,
        change_summary: `Closed RU sub-user OwnerID ${ownerId} (${loginEmail}) via Push_ArchiveUser_RQ; local bind cleared`,
      })
      .then(
        () => {},
        (e) => console.warn("[ru-close-user] audit log insert failed", e),
      );

    return json({
      success: true,
      closed: true,
      ru_owner_id: ownerId,
      login_email: loginEmail,
      message: `OwnerID ${ownerId} (${loginEmail}) closed on Rentals United. Local bind cleared.`,
    });
  } catch (e) {
    console.error("[ru-close-user]", e);
    return json({
      success: false,
      error: { code: "INTERNAL", message: e instanceof Error ? e.message : "Unknown error" },
    }, 500);
  }
});
