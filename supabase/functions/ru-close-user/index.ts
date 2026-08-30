/**
 * Close (archive) a Rentals United sub-user account.
 *
 * Uses Push_ArchiveUser_RQ authenticated AS the sub-user (UserName/Password).
 * Master AccessKey/SecretKey must never be used — that would archive the master.
 *
 * Docs: https://developer.rentalsunited.com/#close-user-account
 *
 * Accepts either:
 *   { account_id }                                  → archive the bound sub-user of a local row
 *   { ru_owner_id, login_email, password? }         → archive any listed RU sub-user
 *
 * Effects on RU: loses dashboard access, channel connections removed, properties archived.
 * Locally: clears the portfolio/property RU bind (identity reset) when a matching row exists.
 */
import { createClient } from "npm:@supabase/supabase-js@2";
import { logRuExchange } from "../_shared/ruApiLog.ts";

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
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
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
    const accountId: string = String(body.account_id ?? "").trim();
    const requestedOwnerId: string = String(body.ru_owner_id ?? "").trim();
    const requestedEmail: string = String(body.login_email ?? "").trim();
    const suppliedPassword: string = String(body.password ?? "");
    const suppliedAccessKey: string = String(body.access_key ?? "").trim();
    const suppliedSecretKey: string = String(body.secret_key ?? "").trim();

    if (!accountId && !requestedOwnerId) {
      return json({
        success: false,
        error: { code: "BAD_REQUEST", message: "account_id or ru_owner_id is required" },
      }, 400);
    }

    // Resolve the local row (may be absent when archiving an unbound RU sub-user)
    let account: Record<string, unknown> | null = null;
    const selectCols =
      "id, owner_email, ru_login_email, ru_owner_id, ru_user_id, ru_login_password_enc, ru_api_access_key, ru_api_secret_enc, portfolio_id, property_id, scope";

    if (accountId) {
      const { data } = await admin.from("ru_owner_accounts").select(selectCols).eq("id", accountId).maybeSingle();
      if (!data) {
        return json({ success: false, error: { code: "NOT_FOUND", message: "RU owner account not found" } }, 404);
      }
      account = data as Record<string, unknown>;
    } else {
      const { data } = await admin
        .from("ru_owner_accounts")
        .select(selectCols)
        .eq("ru_owner_id", requestedOwnerId)
        .maybeSingle();
      account = (data as Record<string, unknown>) ?? null;
    }

    const ownerId = requestedOwnerId || String(account?.ru_owner_id ?? "").trim();
    const loginEmail =
      requestedEmail ||
      String(account?.ru_login_email ?? account?.owner_email ?? "").trim();

    if (!ownerId) {
      return json({
        success: false,
        error: {
          code: "NOT_BOUND",
          message: "This row is not bound to an RU OwnerID. Nothing to close on Rentals United.",
        },
      }, 422);
    }

    const decrypt = async (enc: unknown): Promise<string | null> => {
      if (!enc) return null;
      const { data, error } = await admin.rpc("decrypt_sensitive_text", { encrypted_data: enc });
      if (error || !data || data === "[ENCRYPTED]" || data === "[DECRYPTION_ERROR]") return null;
      return String(data);
    };

    /**
     * Credential resolution. Push_ArchiveUser_RQ authenticates AS the sub-user; since RU's
     * Nov-2025 API-keys rollout, sub-accounts must use their own AccessKey/SecretKey.
     * Order: keys on the request → keys stored for the sub-user → legacy password (older
     * accounts only). The MASTER key pair is never used — that would archive the master.
     */
    let childAuthXml = "";
    let authMode = "";

    if (suppliedAccessKey && suppliedSecretKey) {
      childAuthXml = `<AccessKey>${escapeXml(suppliedAccessKey)}</AccessKey>
    <SecretKey>${escapeXml(suppliedSecretKey)}</SecretKey>`;
      authMode = "child_api_keys";
    } else {
      // Preferred store: keys held per RU OwnerID (never overwritten by another sub-user)
      let storedKey = "";
      let storedSecret: string | null = null;
      const { data: credRow } = await admin
        .from("ru_api_credentials")
        .select("access_key, secret_enc")
        .eq("ru_owner_id", ownerId)
        .maybeSingle();
      if (credRow?.access_key) {
        const plain = await decrypt(credRow.secret_enc);
        if (plain) {
          storedKey = String(credRow.access_key);
          storedSecret = plain;
        }
      }
      if (!storedKey) {
        storedKey = String(account?.ru_api_access_key ?? "").trim();
        storedSecret = await decrypt(account?.ru_api_secret_enc);
      }
      if (storedKey && storedSecret) {
        childAuthXml = `<AccessKey>${escapeXml(storedKey)}</AccessKey>
    <SecretKey>${escapeXml(storedSecret)}</SecretKey>`;
        authMode = "child_api_keys";
      } else {
        // §2/close: stored child_password row (Push_CreateUser_RQ or a later reset) is the
        // fallback before API_KEYS_REQUIRED — never mint a key just to close.
        let credPassword: string | null = null;
        const { data: pwRow } = await admin
          .from("ru_api_credentials")
          .select("password_enc, auth_mode, login_email")
          .eq("ru_owner_id", ownerId)
          .eq("auth_mode", "child_password")
          .maybeSingle();
        if (pwRow?.password_enc) {
          credPassword = await decrypt(pwRow.password_enc);
        }
        const password = suppliedPassword || credPassword || (await decrypt(account?.ru_login_password_enc)) || "";
        if (!loginEmail || !password) {
          return json({
            success: false,
            error: {
              code: "API_KEYS_REQUIRED",
              message:
                `No API keys stored for OwnerID ${ownerId}. Rentals United requires the sub-user's own AccessKey + SecretKey for Push_ArchiveUser_RQ — generate them in the RU dashboard (Security settings) for ${
                  loginEmail || "this sub-user"
                } and save them in Portfolios → RU accounts, then retry.`,
            },
            ru_owner_id: ownerId,
            login_email: loginEmail || null,
          }, 422);
        }
        childAuthXml = `<UserName>${escapeXml(loginEmail)}</UserName>
    <Password>${escapeXml(password)}</Password>`;
        authMode = "child_user_password";
      }
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
    ${childAuthXml}
  </Authentication>
</Push_ArchiveUser_RQ>`;


    const compact = xml.replace(/<\?xml[^?]*\?>\s*/gi, "").replace(/>\s+</g, "><").trim();
    console.log(
      `[ru-close-user] Push_ArchiveUser_RQ for OwnerID ${ownerId} as ${loginEmail || "child API key"} (auth=${authMode})`,
    );

    // Certification requirement: durable request/response/ResponseID log for every RU exchange.
    const logStartedAt = Date.now();
    const logBase = {
      action: "Push_ArchiveUser_RQ",
      parent_action: "ru-close-user",
      endpoint,
      property_id: account?.property_id ?? null,
      ru_owner_id: ownerId,
      ru_user_id: account?.ru_user_id ?? null,
      request_xml: compact,
    };

    const ruRes = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "text/xml; charset=utf-8" },
      body: compact,
    });
    if (!ruRes.ok) {
      const text = await ruRes.text();
      await logRuExchange(admin, {
        ...logBase,
        response_xml: text,
        http_status: ruRes.status,
        success: false,
        elapsed_ms: Date.now() - logStartedAt,
        error_message: `RU returned HTTP ${ruRes.status}`,
      });
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
    await logRuExchange(admin, {
      ...logBase,
      response_xml: responseXml,
      http_status: ruRes.status,
      success: status.id === "0",
      elapsed_ms: Date.now() - logStartedAt,
      error_message: status.id === "0" ? null : status.message,
    });
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
            ? (authMode === "child_api_keys"
              ? `Rentals United rejected the sub-user API keys for OwnerID ${ownerId} (Status ${status.id}). Regenerate the AccessKey/SecretKey pair in the RU dashboard (Security settings) for ${loginEmail || "this sub-user"}, save them in Portfolios → RU accounts, then retry.`
              : `Rentals United rejected the sub-user login for ${loginEmail} (OwnerID ${ownerId}, Status ${status.id}). RU now requires the sub-user's own API keys (AccessKey + SecretKey) for Push_ArchiveUser_RQ — generate them in the RU dashboard and save them in Portfolios → RU accounts.`)
            : `Rentals United rejected archive for OwnerID ${ownerId}: ${status.message} (Status ${status.id})`,
          ru_status_id: status.id,
        },
        login_email: loginEmail,
        ru_owner_id: ownerId,
        auth_mode: authMode,
      }, 422);
    }

    // Archived sub-users can never authenticate again — drop their stored key pair.
    await admin.from("ru_api_credentials").delete().eq("ru_owner_id", ownerId);

    // Clear local bind so Phase 1 can create a fresh sub-user (only if a local row holds this OwnerID)
    let localCleared = false;

    if (account?.id && String(account.ru_owner_id ?? "").trim() === ownerId) {
      /**
       * The row is removed, not blanked. A blanked row survived as a "shell" that every
       * binding read still reported as the property's distribution account — so a closed
       * account kept showing as bound (with its old login) and blocked a fresh connection.
       */
      const { error: upErr } = await admin.from("ru_owner_accounts").delete().eq("id", account.id);

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
      localCleared = true;
    }

    await admin
      .from("audit_logs")
      .insert({
        user_id: user.id,
        user_email: user.email ?? "unknown",
        user_role: (roles ?? []).some((r: { role: string }) => r.role === "dev") ? "dev" : "admin",
        action_type: "other",
        table_name: "ru_owner_accounts",
        record_id: (account?.id as string) ?? null,
        request_origin: "edge_function",
        edge_function_name: "ru-close-user",
        is_sensitive: true,
        change_summary: `Closed RU sub-user OwnerID ${ownerId} (${loginEmail}) via Push_ArchiveUser_RQ (auth=${authMode}); local bind ${
          localCleared ? "cleared" : "not present"
        }`,
      })
      .then(
        () => {},
        (e) => console.warn("[ru-close-user] audit log insert failed", e),
      );

    return json({
      success: true,
      closed: true,
      auth_mode: authMode,
      local_cleared: localCleared,
      ru_owner_id: ownerId,
      login_email: loginEmail,
      message: `OwnerID ${ownerId} (${loginEmail}) closed on Rentals United.${
        localCleared ? " Local bind cleared." : ""
      }`,
    });
  } catch (e) {
    console.error("[ru-close-user]", e);
    return json({
      success: false,
      error: { code: "INTERNAL", message: e instanceof Error ? e.message : "Unknown error" },
    }, 500);
  }
});
