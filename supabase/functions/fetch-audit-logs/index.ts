import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FetchAuditLogsPayload {
  // Pagination
  cursor?: string;
  limit?: number;
  
  // Filters
  user_id?: string;
  user_email?: string;
  action_types?: string[];
  table_names?: string[];
  record_id?: string;
  property_id?: string;
  request_origins?: string[];
  changed_fields_contain?: string;
  
  // Date range
  from_date?: string;
  to_date?: string;
  
  // Search
  search_text?: string;
  
  // Export format
  format?: "json" | "csv";
}

function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) return "";
  const str = typeof value === "object" ? JSON.stringify(value) : String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCSV(logs: Record<string, unknown>[]): string {
  if (logs.length === 0) return "";
  
  const headers = [
    "id",
    "created_at",
    "user_email",
    "user_role",
    "action_type",
    "table_name",
    "record_id",
    "property_id",
    "request_origin",
    "change_summary",
    "changed_fields",
    "is_sensitive",
  ];
  
  const rows = logs.map((log) =>
    headers.map((h) => escapeCSV(log[h])).join(",")
  );
  
  return [headers.join(","), ...rows].join("\n");
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Authenticate user
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

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify admin or dev role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: roles } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = roles?.map((r) => r.role) || [];
    const hasPermission = userRoles.some((r) => ["admin", "dev", "fearless_leader"].includes(r));

    if (!hasPermission) {
      return new Response(
        JSON.stringify({ success: false, error: "Forbidden: Admin or Dev role required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const payload: FetchAuditLogsPayload = await req.json();
    console.log("Fetching audit logs with filters:", {
      ...payload,
      limit: payload.limit || 50,
    });

    // Build query
    const limit = Math.min(payload.limit || 50, 100);
    let query = serviceClient
      .from("audit_logs")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .limit(limit + 1); // Fetch one extra to check if there's more

    // Apply cursor-based pagination
    if (payload.cursor) {
      query = query.lt("created_at", payload.cursor);
    }

    // Apply filters
    if (payload.user_id) {
      query = query.eq("user_id", payload.user_id);
    }

    if (payload.user_email) {
      query = query.ilike("user_email", `%${payload.user_email}%`);
    }

    if (payload.action_types && payload.action_types.length > 0) {
      query = query.in("action_type", payload.action_types);
    }

    if (payload.table_names && payload.table_names.length > 0) {
      query = query.in("table_name", payload.table_names);
    }

    if (payload.record_id) {
      query = query.eq("record_id", payload.record_id);
    }

    if (payload.property_id) {
      query = query.eq("property_id", payload.property_id);
    }

    if (payload.request_origins && payload.request_origins.length > 0) {
      query = query.in("request_origin", payload.request_origins);
    }

    if (payload.changed_fields_contain) {
      query = query.contains("changed_fields", [payload.changed_fields_contain]);
    }

    if (payload.from_date) {
      query = query.gte("created_at", payload.from_date);
    }

    if (payload.to_date) {
      query = query.lte("created_at", payload.to_date);
    }

    if (payload.search_text) {
      query = query.or(
        `change_summary.ilike.%${payload.search_text}%,correlation_id.ilike.%${payload.search_text}%`
      );
    }

    const { data: logs, error: queryError, count } = await query;

    if (queryError) {
      console.error("Query error:", queryError);
      return new Response(
        JSON.stringify({ success: false, error: queryError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine pagination
    const hasMore = (logs?.length || 0) > limit;
    const resultLogs = hasMore ? logs?.slice(0, limit) : logs;
    const nextCursor = hasMore && resultLogs?.length
      ? resultLogs[resultLogs.length - 1].created_at
      : null;

    console.log(`Found ${count} total logs, returning ${resultLogs?.length || 0}`);

    // Handle CSV export
    if (payload.format === "csv") {
      const csvContent = toCSV(resultLogs || []);
      return new Response(csvContent, {
        status: 200,
        headers: {
          ...corsHeaders,
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename="audit_logs_${new Date().toISOString().split("T")[0]}.csv"`,
        },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          logs: resultLogs || [],
          pagination: {
            next_cursor: nextCursor,
            total_count: count || 0,
            has_more: hasMore,
          },
        },
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
