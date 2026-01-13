import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { 
  BankExportRequest, 
  BankExportResponse, 
  LedgerEntry,
  EligibilityResult,
  LedgerSummary,
  BookingForLedger 
} from "../_shared/bank-export-types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// SHA-256 hash function
async function sha256(message: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// Add days to a date
function addDays(dateStr: string, days: number): string {
  const date = new Date(dateStr);
  date.setDate(date.getDate() + days);
  return date.toISOString().split('T')[0];
}

// Build response helper
function buildResponse<T>(
  action: string,
  success: boolean,
  data: T | null,
  error?: { code: string; message: string; details?: unknown }
): Response {
  const response: BankExportResponse<T> = {
    success,
    data,
    error: error || null,
    source: 'bank_export',
    fetched_at: new Date().toISOString(),
    action,
  };
  
  return new Response(JSON.stringify(response), {
    status: success ? 200 : 400,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify authorization
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return buildResponse("auth", false, null, {
        code: "UNAUTHORIZED",
        message: "Missing authorization header",
      });
    }

    // Get user from token
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return buildResponse("auth", false, null, {
        code: "UNAUTHORIZED",
        message: "Invalid token",
      });
    }

    // Check user role (dev or fearless_leader required)
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id);

    const userRoles = roles?.map(r => r.role) || [];
    const hasAccess = userRoles.includes("dev") || userRoles.includes("fearless_leader");
    
    if (!hasAccess) {
      return buildResponse("auth", false, null, {
        code: "FORBIDDEN",
        message: "Insufficient permissions. Requires dev or fearless_leader role.",
      });
    }

    // Parse request body
    const body: BankExportRequest = await req.json();
    const { action } = body;

    console.log(`[bank-export-api] Action: ${action} by user: ${user.email}`);

    switch (action) {
      case "health_check": {
        return buildResponse("health_check", true, {
          status: "healthy",
          timestamp: new Date().toISOString(),
          user: user.email,
        });
      }

      case "create_ledger_entry": {
        const { booking_id } = body;
        if (!booking_id) {
          return buildResponse(action, false, null, {
            code: "MISSING_BOOKING_ID",
            message: "booking_id is required",
          });
        }

        // Idempotency check
        const idempotencyKey = `booking:${booking_id}`;
        const { data: existing } = await supabase
          .from("rol_revenue_ledger")
          .select("*")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (existing) {
          console.log(`[bank-export-api] Idempotency hit for booking ${booking_id}`);
          return buildResponse(action, true, existing as LedgerEntry);
        }

        // Fetch booking
        const { data: booking, error: bookingError } = await supabase
          .from("bookings")
          .select("id, property_id, total_price, calculated_commission, commission_rate_applied, check_out_date, status, payment_status")
          .eq("id", booking_id)
          .single();

        if (bookingError || !booking) {
          return buildResponse(action, false, null, {
            code: "BOOKING_NOT_FOUND",
            message: `Booking ${booking_id} not found`,
            details: bookingError,
          });
        }

        const typedBooking = booking as BookingForLedger;

        // Validate booking has commission calculated
        if (typedBooking.calculated_commission === null || typedBooking.commission_rate_applied === null) {
          return buildResponse(action, false, null, {
            code: "COMMISSION_NOT_CALCULATED",
            message: "Booking does not have commission calculated",
          });
        }

        // Calculate escrow release date (7 days after checkout)
        const escrowReleaseDate = addDays(typedBooking.check_out_date, 7);

        // Generate immutable hash
        const hashInput = [
          typedBooking.id,
          typedBooking.property_id,
          typedBooking.total_price.toString(),
          typedBooking.calculated_commission.toString(),
          new Date().toISOString(),
        ].join('|');
        const immutableHash = await sha256(hashInput);

        // Create ledger entry
        const { data: ledgerEntry, error: insertError } = await supabase
          .from("rol_revenue_ledger")
          .insert({
            source_type: 'booking',
            source_id: typedBooking.id,
            property_id: typedBooking.property_id,
            gross_amount: typedBooking.total_price,
            commission_amount: typedBooking.calculated_commission,
            commission_rate: typedBooking.commission_rate_applied,
            status: 'pending',
            escrow_release_date: escrowReleaseDate,
            idempotency_key: idempotencyKey,
            immutable_hash: immutableHash,
          })
          .select()
          .single();

        if (insertError) {
          return buildResponse(action, false, null, {
            code: "INSERT_FAILED",
            message: "Failed to create ledger entry",
            details: insertError,
          });
        }

        console.log(`[bank-export-api] Created ledger entry ${ledgerEntry.id} for booking ${booking_id}`);
        return buildResponse(action, true, ledgerEntry as LedgerEntry);
      }

      case "check_eligibility": {
        const { ledger_id } = body;
        if (!ledger_id) {
          return buildResponse(action, false, null, {
            code: "MISSING_LEDGER_ID",
            message: "ledger_id is required",
          });
        }

        // Fetch ledger entry
        const { data: ledger, error: ledgerError } = await supabase
          .from("rol_revenue_ledger")
          .select("*")
          .eq("id", ledger_id)
          .single();

        if (ledgerError || !ledger) {
          return buildResponse(action, false, null, {
            code: "LEDGER_NOT_FOUND",
            message: `Ledger entry ${ledger_id} not found`,
          });
        }

        const passedRules: string[] = [];
        const failedRules: string[] = [];

        // Rule 1: Source is confirmed & settled
        if (ledger.source_type === 'booking') {
          const { data: booking } = await supabase
            .from("bookings")
            .select("status, payment_status")
            .eq("id", ledger.source_id)
            .single();
          
          if (booking?.status === 'confirmed' && booking?.payment_status === 'paid') {
            passedRules.push('booking_confirmed');
          } else {
            failedRules.push('booking_confirmed');
          }
        } else {
          passedRules.push('booking_confirmed'); // Non-booking sources pass
        }

        // Rule 2: Escrow period passed
        const today = new Date().toISOString().split('T')[0];
        if (ledger.escrow_release_date && today >= ledger.escrow_release_date) {
          passedRules.push('escrow_released');
        } else {
          failedRules.push('escrow_released');
        }

        // Rule 3: Never previously exported
        if (ledger.status !== 'exported' && !ledger.export_batch_id) {
          passedRules.push('not_exported');
        } else {
          failedRules.push('not_exported');
        }

        // Rule 4: Not reversed
        if (ledger.status !== 'reversed') {
          passedRules.push('not_reversed');
        } else {
          failedRules.push('not_reversed');
        }

        // Rule 5: Minimum threshold (R500+)
        if (Number(ledger.net_amount) >= 500) {
          passedRules.push('minimum_threshold');
        } else {
          failedRules.push('minimum_threshold');
        }

        // Rule 6: Currency is ZAR
        if (ledger.currency === 'ZAR') {
          passedRules.push('currency_zar');
        } else {
          failedRules.push('currency_zar');
        }

        // Rule 7: Bank details exist and verified
        const { data: bankDetails } = await supabase
          .from("property_bank_details")
          .select("is_verified")
          .eq("property_id", ledger.property_id)
          .maybeSingle();

        if (bankDetails?.is_verified === true) {
          passedRules.push('bank_verified');
        } else {
          failedRules.push('bank_verified');
        }

        const result: EligibilityResult = {
          is_eligible: failedRules.length === 0,
          failed_rules: failedRules,
          passed_rules: passedRules,
          eligible_amount: failedRules.length === 0 ? Number(ledger.net_amount) : 0,
          ledger_id: ledger.id,
        };

        return buildResponse(action, true, result);
      }

      case "promote_to_eligible": {
        const { ledger_id } = body;
        if (!ledger_id) {
          return buildResponse(action, false, null, {
            code: "MISSING_LEDGER_ID",
            message: "ledger_id is required",
          });
        }

        // Check eligibility first
        const eligibilityCheck = await checkEligibilityInternal(supabase, ledger_id);
        if (!eligibilityCheck.is_eligible) {
          return buildResponse(action, false, null, {
            code: "NOT_ELIGIBLE",
            message: "Ledger entry failed eligibility checks",
            details: eligibilityCheck.failed_rules,
          });
        }

        // Update status to eligible
        const { data: updated, error: updateError } = await supabase
          .from("rol_revenue_ledger")
          .update({
            status: 'eligible',
            eligible_at: new Date().toISOString(),
          })
          .eq("id", ledger_id)
          .eq("status", "pending") // Only pending entries can be promoted
          .select()
          .single();

        if (updateError) {
          return buildResponse(action, false, null, {
            code: "UPDATE_FAILED",
            message: "Failed to promote ledger entry",
            details: updateError,
          });
        }

        console.log(`[bank-export-api] Promoted ledger ${ledger_id} to eligible`);
        return buildResponse(action, true, updated as LedgerEntry);
      }

      case "get_ledger_summary": {
        // Get summary statistics
        const { data: pending } = await supabase
          .from("rol_revenue_ledger")
          .select("net_amount")
          .eq("status", "pending");

        const { data: eligible } = await supabase
          .from("rol_revenue_ledger")
          .select("net_amount")
          .eq("status", "eligible");

        const { data: exported } = await supabase
          .from("rol_revenue_ledger")
          .select("net_amount")
          .eq("status", "exported");

        // Get by property breakdown
        const { data: byProperty } = await supabase
          .from("rol_revenue_ledger")
          .select(`
            property_id,
            status,
            net_amount,
            properties!inner(name)
          `)
          .in("status", ["pending", "eligible"]);

        // Aggregate by property
        const propertyMap = new Map<string, {
          property_id: string;
          property_name: string;
          pending_count: number;
          pending_amount: number;
          eligible_count: number;
          eligible_amount: number;
        }>();

        byProperty?.forEach((entry: any) => {
          const key = entry.property_id;
          if (!propertyMap.has(key)) {
            propertyMap.set(key, {
              property_id: key,
              property_name: entry.properties?.name || 'Unknown',
              pending_count: 0,
              pending_amount: 0,
              eligible_count: 0,
              eligible_amount: 0,
            });
          }
          const prop = propertyMap.get(key)!;
          if (entry.status === 'pending') {
            prop.pending_count++;
            prop.pending_amount += Number(entry.net_amount);
          } else if (entry.status === 'eligible') {
            prop.eligible_count++;
            prop.eligible_amount += Number(entry.net_amount);
          }
        });

        const summary: LedgerSummary = {
          total_pending: pending?.length || 0,
          total_pending_amount: pending?.reduce((sum, e) => sum + Number(e.net_amount), 0) || 0,
          total_eligible: eligible?.length || 0,
          total_eligible_amount: eligible?.reduce((sum, e) => sum + Number(e.net_amount), 0) || 0,
          total_exported: exported?.length || 0,
          total_exported_amount: exported?.reduce((sum, e) => sum + Number(e.net_amount), 0) || 0,
          by_property: Array.from(propertyMap.values()),
        };

        return buildResponse(action, true, summary);
      }

      case "get_eligible_entries": {
        const { filters } = body;
        
        let query = supabase
          .from("rol_revenue_ledger")
          .select(`
            *,
            properties!inner(name, owner_email)
          `)
          .eq("status", "eligible");

        if (filters?.property_id) {
          query = query.eq("property_id", filters.property_id);
        }

        const { data: entries, error } = await query.order("created_at", { ascending: false });

        if (error) {
          return buildResponse(action, false, null, {
            code: "QUERY_FAILED",
            message: "Failed to fetch eligible entries",
            details: error,
          });
        }

        return buildResponse(action, true, entries);
      }

      default:
        return buildResponse(action, false, null, {
          code: "UNKNOWN_ACTION",
          message: `Unknown action: ${action}`,
        });
    }
  } catch (error) {
    console.error("[bank-export-api] Error:", error);
    return buildResponse("error", false, null, {
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// Internal eligibility check helper
async function checkEligibilityInternal(supabase: any, ledgerId: string): Promise<EligibilityResult> {
  const { data: ledger } = await supabase
    .from("rol_revenue_ledger")
    .select("*")
    .eq("id", ledgerId)
    .single();

  if (!ledger) {
    return {
      is_eligible: false,
      failed_rules: ['ledger_not_found'],
      passed_rules: [],
      eligible_amount: 0,
      ledger_id: ledgerId,
    };
  }

  const failedRules: string[] = [];
  const passedRules: string[] = [];

  // Rule 1: Source confirmed
  if (ledger.source_type === 'booking') {
    const { data: booking } = await supabase
      .from("bookings")
      .select("status, payment_status")
      .eq("id", ledger.source_id)
      .single();
    
    if (booking?.status === 'confirmed' && booking?.payment_status === 'paid') {
      passedRules.push('booking_confirmed');
    } else {
      failedRules.push('booking_confirmed');
    }
  } else {
    passedRules.push('booking_confirmed');
  }

  // Rule 2: Escrow released
  const today = new Date().toISOString().split('T')[0];
  if (ledger.escrow_release_date && today >= ledger.escrow_release_date) {
    passedRules.push('escrow_released');
  } else {
    failedRules.push('escrow_released');
  }

  // Rule 3: Not exported
  if (ledger.status !== 'exported' && !ledger.export_batch_id) {
    passedRules.push('not_exported');
  } else {
    failedRules.push('not_exported');
  }

  // Rule 4: Not reversed
  if (ledger.status !== 'reversed') {
    passedRules.push('not_reversed');
  } else {
    failedRules.push('not_reversed');
  }

  // Rule 5: Minimum threshold
  if (Number(ledger.net_amount) >= 500) {
    passedRules.push('minimum_threshold');
  } else {
    failedRules.push('minimum_threshold');
  }

  // Rule 6: Currency ZAR
  if (ledger.currency === 'ZAR') {
    passedRules.push('currency_zar');
  } else {
    failedRules.push('currency_zar');
  }

  // Rule 7: Bank verified
  const { data: bankDetails } = await supabase
    .from("property_bank_details")
    .select("is_verified")
    .eq("property_id", ledger.property_id)
    .maybeSingle();

  if (bankDetails?.is_verified === true) {
    passedRules.push('bank_verified');
  } else {
    failedRules.push('bank_verified');
  }

  return {
    is_eligible: failedRules.length === 0,
    failed_rules: failedRules,
    passed_rules: passedRules,
    eligible_amount: failedRules.length === 0 ? Number(ledger.net_amount) : 0,
    ledger_id: ledger.id,
  };
}
