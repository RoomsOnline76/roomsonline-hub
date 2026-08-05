import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AuditEventPayload {
  action_type: "create" | "update" | "delete" | "permission_change" | "sync" | "export" | "login" | "other";
  table_name: string;
  record_id: string;
  property_id?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  change_summary: string;
  metadata?: Record<string, unknown>;
  correlation_id?: string;
  edge_function_name?: string;
}

// Sensitive fields to redact
const SENSITIVE_FIELDS = [
  "password",
  "api_key",
  "key_value",
  "access_token",
  "refresh_token",
  "payment_intent_id",
  "secret",
  "token",
];

function redactSensitiveFields(obj: Record<string, unknown> | undefined): {
  redacted: Record<string, unknown> | undefined;
  redactedFields: string[];
} {
  if (!obj) return { redacted: undefined, redactedFields: [] };

  const redacted = { ...obj };
  const redactedFields: string[] = [];

  for (const key of Object.keys(redacted)) {
    const lowerKey = key.toLowerCase();
    if (SENSITIVE_FIELDS.some((f) => lowerKey.includes(f))) {
      if (redacted[key] !== null && redacted[key] !== undefined && redacted[key] !== "") {
        redacted[key] = "[REDACTED]";
        redactedFields.push(key);
      }
    }
  }

  return { redacted, redactedFields };
}

function computeChangedFields(
  oldValues: Record<string, unknown> | undefined,
  newValues: Record<string, unknown> | undefined
): string[] {
  if (!oldValues || !newValues) return [];

  const changedFields: string[] = [];
  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);

  for (const key of allKeys) {
    if (key === "updated_at") continue;
    if (JSON.stringify(oldValues[key]) !== JSON.stringify(newValues[key])) {
      changedFields.push(key);
    }
  }

  return changedFields;
}

async function computeHash(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create client with user's auth to verify permissions
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user info
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has admin, dev, or owner role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = roles?.map((r) => r.role) || [];
    const hasPermission = userRoles.some((r) => ["admin", "dev", "fearless_leader"].includes(r));

    // Determine audit role
    let auditRole: "admin" | "dev" | "owner" | "system";
    if (userRoles.includes("dev")) {
      auditRole = "dev";
    } else if (userRoles.includes("admin")) {
      auditRole = "admin";
    } else {
      auditRole = "owner";
    }

    // Get user email
    const { data: profile } = await serviceClient
      .from("profiles")
      .select("email")
      .eq("id", user.id)
      .single();

    const userEmail = profile?.email || user.email || "unknown@roomsonline.com";

    // Parse request body
    const payload: AuditEventPayload = await req.json();
    console.log("Received audit event:", {
      action_type: payload.action_type,
      table_name: payload.table_name,
      record_id: payload.record_id,
    });

    // Validate required fields
    if (!payload.action_type || !payload.table_name || !payload.record_id || !payload.change_summary) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required fields: action_type, table_name, record_id, change_summary",
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Redact sensitive fields
    const { redacted: redactedOld, redactedFields: oldRedacted } = redactSensitiveFields(payload.old_values);
    const { redacted: redactedNew, redactedFields: newRedacted } = redactSensitiveFields(payload.new_values);
    const allRedactedFields = [...new Set([...oldRedacted, ...newRedacted])];
    const isSensitive = allRedactedFields.length > 0;

    // Compute changed fields
    const changedFields = computeChangedFields(payload.old_values, payload.new_values);

    // Extract IP and user agent
    const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
      req.headers.get("x-real-ip") ||
      "unknown";
    const userAgent = req.headers.get("user-agent") || undefined;

    // Compute immutable hash
    const hashInput = [
      user.id,
      payload.action_type,
      payload.table_name,
      payload.record_id,
      JSON.stringify(redactedOld || {}),
      JSON.stringify(redactedNew || {}),
      new Date().toISOString(),
    ].join("|");
    const immutableHash = await computeHash(hashInput);

    // Insert audit log
    const { data: auditLog, error: insertError } = await serviceClient
      .from("audit_logs")
      .insert({
        user_id: user.id,
        user_email: userEmail,
        user_role: auditRole,
        ip_address: ipAddress,
        user_agent: userAgent,
        action_type: payload.action_type,
        table_name: payload.table_name,
        record_id: payload.record_id,
        property_id: payload.property_id || null,
        request_origin: "admin_ui",
        edge_function_name: payload.edge_function_name || null,
        correlation_id: payload.correlation_id || null,
        old_values: redactedOld || null,
        new_values: redactedNew || null,
        changed_fields: changedFields,
        change_summary: payload.change_summary,
        metadata: payload.metadata || {},
        is_sensitive: isSensitive,
        redacted_fields: allRedactedFields,
        immutable_hash: immutableHash,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return new Response(
        JSON.stringify({ success: false, error: insertError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Audit log created:", auditLog?.id);

    return new Response(
      JSON.stringify({
        success: true,
        data: { id: auditLog?.id },
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
