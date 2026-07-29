import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import type { 
  BankExportRequest, 
  BankExportResponse, 
  LedgerEntry,
  EligibilityResult,
  LedgerSummary,
  BookingForLedger,
  ExportBatch,
  ExportLine,
  BatchValidationResult,
  BankProvider,
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

// Format amount to 2 decimal places (ZAR)
function formatZAR(amount: number): string {
  return amount.toFixed(2);
}

// Mask account number (show last 4 digits)
function maskAccountNumber(accountNumber: string): string {
  if (!accountNumber || accountNumber.length < 4) return '****';
  return '****' + accountNumber.slice(-4);
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

// Generate CSV content for bank export
function generateCSV(lines: ExportLine[], batchRef: string): string {
  const headers = [
    'record_type',
    'beneficiary_name',
    'bank_name',
    'branch_code',
    'account_number',
    'amount',
    'reference',
    'internal_trace_id'
  ];
  
  const rows = lines.map(line => [
    'PAY',
    `"${line.beneficiary_name.replace(/"/g, '""')}"`,
    `"${line.bank_name.replace(/"/g, '""')}"`,
    line.branch_code,
    line.account_number_masked.replace('****', ''), // Will be replaced with real number at export
    formatZAR(line.amount),
    line.payment_reference,
    line.id
  ]);
  
  return [
    headers.join(','),
    ...rows.map(row => row.join(','))
  ].join('\n');
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
    const isDev = userRoles.includes("dev");
    const isFearlessLeader = userRoles.includes("fearless_leader");
    
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
      // ==================== PHASE 1 ACTIONS ====================
      
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

        const result = await checkEligibilityInternal(supabase, ledger_id);
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
          .eq("status", "pending")
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

        const { data: byProperty } = await supabase
          .from("rol_revenue_ledger")
          .select(`
            property_id,
            status,
            net_amount,
            properties!inner(name)
          `)
          .in("status", ["pending", "eligible"]);

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

      // ==================== PHASE 2 ACTIONS ====================

      case "create_batch": {
        const { bank_provider, property_ids } = body;
        
        if (!bank_provider) {
          return buildResponse(action, false, null, {
            code: "MISSING_BANK_PROVIDER",
            message: "bank_provider is required",
          });
        }

        // Get eligible entries, optionally filtered by properties
        let query = supabase
          .from("rol_revenue_ledger")
          .select(`
            *,
            properties!inner(id, name, owner_email)
          `)
          .eq("status", "eligible")
          .is("export_batch_id", null);

        if (property_ids && property_ids.length > 0) {
          query = query.in("property_id", property_ids);
        }

        const { data: eligibleEntries, error: fetchError } = await query;

        if (fetchError) {
          return buildResponse(action, false, null, {
            code: "FETCH_FAILED",
            message: "Failed to fetch eligible entries",
            details: fetchError,
          });
        }

        if (!eligibleEntries || eligibleEntries.length === 0) {
          return buildResponse(action, false, null, {
            code: "NO_ELIGIBLE_ENTRIES",
            message: "No eligible entries found for batch creation",
          });
        }

        // Group entries by property
        const byProperty = new Map<string, {
          property: any;
          entries: any[];
          totalAmount: number;
        }>();

        for (const entry of eligibleEntries) {
          const key = entry.property_id;
          if (!byProperty.has(key)) {
            byProperty.set(key, {
              property: entry.properties,
              entries: [],
              totalAmount: 0,
            });
          }
          const prop = byProperty.get(key)!;
          prop.entries.push(entry);
          prop.totalAmount += Number(entry.net_amount);
        }

        // Validate minimum threshold per property (R500)
        const validProperties: string[] = [];
        const invalidProperties: { property_id: string; reason: string }[] = [];

        for (const [propId, data] of byProperty) {
          if (data.totalAmount < 500) {
            invalidProperties.push({
              property_id: propId,
              reason: `Total amount R${formatZAR(data.totalAmount)} below minimum R500`,
            });
          } else {
            validProperties.push(propId);
          }
        }

        if (validProperties.length === 0) {
          return buildResponse(action, false, null, {
            code: "NO_VALID_PROPERTIES",
            message: "No properties meet minimum threshold for payout",
            details: invalidProperties,
          });
        }

        // Get bank details for valid properties
        const { data: bankDetails } = await supabase
          .from("property_bank_details")
          .select("*")
          .in("property_id", validProperties);

        const bankDetailsMap = new Map(
          bankDetails?.map(bd => [bd.property_id, bd]) || []
        );

        // Validate all properties have verified bank details
        const missingBankDetails: string[] = [];
        for (const propId of validProperties) {
          const bd = bankDetailsMap.get(propId);
          if (!bd || !bd.is_verified) {
            missingBankDetails.push(propId);
          }
        }

        if (missingBankDetails.length > 0) {
          const propNames = missingBankDetails
            .map(id => byProperty.get(id)?.property?.name || id)
            .join(', ');
          return buildResponse(action, false, null, {
            code: "MISSING_BANK_DETAILS",
            message: `Missing or unverified bank details for: ${propNames}`,
            details: missingBankDetails,
          });
        }

        // Create the batch
        const totalAmount = Array.from(byProperty.values())
          .filter(p => validProperties.includes(p.property.id))
          .reduce((sum, p) => sum + p.totalAmount, 0);

        const { data: batch, error: batchError } = await supabase
          .from("rol_bank_export_batches")
          .insert({
            bank_provider,
            total_records: validProperties.length,
            total_amount: totalAmount,
            status: 'draft',
            created_by: user.id,
          })
          .select()
          .single();

        if (batchError) {
          return buildResponse(action, false, null, {
            code: "BATCH_CREATE_FAILED",
            message: "Failed to create batch",
            details: batchError,
          });
        }

        // Create export lines for each property
        const exportLines: any[] = [];
        let lineNumber = 1;

        for (const propId of validProperties) {
          const data = byProperty.get(propId)!;
          const bd = bankDetailsMap.get(propId)!;
          
          const paymentRef = `ROL-${batch.batch_sequence}-${String(lineNumber).padStart(3, '0')}`;
          
          exportLines.push({
            batch_id: batch.id,
            property_id: propId,
            beneficiary_name: bd.account_holder,
            bank_name: bd.bank_name,
            branch_code: bd.branch_code,
            account_number_encrypted: bd.account_number_encrypted,
            account_number_masked: bd.account_number_masked,
            amount: data.totalAmount,
            payment_reference: paymentRef,
            ledger_ids: data.entries.map((e: any) => e.id),
            ledger_count: data.entries.length,
            status: 'pending',
          });
          
          lineNumber++;
        }

        const { data: insertedLines, error: linesError } = await supabase
          .from("rol_bank_export_lines")
          .insert(exportLines)
          .select();

        if (linesError) {
          // Rollback batch
          await supabase.from("rol_bank_export_batches").delete().eq("id", batch.id);
          return buildResponse(action, false, null, {
            code: "LINES_CREATE_FAILED",
            message: "Failed to create export lines",
            details: linesError,
          });
        }

        // Lock the ledger entries
        const allLedgerIds = eligibleEntries
          .filter(e => validProperties.includes(e.property_id))
          .map(e => e.id);

        await supabase
          .from("rol_revenue_ledger")
          .update({
            status: 'locked',
            export_batch_id: batch.id,
          })
          .in("id", allLedgerIds);

        console.log(`[bank-export-api] Created batch ${batch.batch_reference} with ${insertedLines?.length} lines by ${user.email}`);

        return buildResponse(action, true, {
          batch,
          lines: insertedLines,
          skipped_properties: invalidProperties,
        });
      }

      case "get_batches": {
        const { status: batchStatus } = body;
        
        let query = supabase
          .from("rol_bank_export_batches")
          .select("*")
          .order("created_at", { ascending: false });

        if (batchStatus) {
          query = query.eq("status", batchStatus);
        }

        const { data: batches, error } = await query;

        if (error) {
          return buildResponse(action, false, null, {
            code: "QUERY_FAILED",
            message: "Failed to fetch batches",
            details: error,
          });
        }

        // Attach creator profiles (no FK relationship exists, so fetch separately)
        const creatorIds = [...new Set((batches || []).map((b) => b.created_by).filter(Boolean))];
        let profileMap: Record<string, { email: string; full_name: string }> = {};
        if (creatorIds.length > 0) {
          const { data: profs } = await supabase
            .from("profiles")
            .select("id, email, full_name")
            .in("id", creatorIds);
          profileMap = Object.fromEntries(
            (profs || []).map((p) => [p.id, { email: p.email, full_name: p.full_name }])
          );
        }

        return buildResponse(
          action,
          true,
          (batches || []).map((b) => ({ ...b, profiles: profileMap[b.created_by] || null }))
        );

      }

      case "get_batch_details": {
        const { batch_id } = body;
        
        if (!batch_id) {
          return buildResponse(action, false, null, {
            code: "MISSING_BATCH_ID",
            message: "batch_id is required",
          });
        }

        // Get batch
        const { data: batch, error: batchError } = await supabase
          .from("rol_bank_export_batches")
          .select(`
            *,
            profiles!rol_bank_export_batches_created_by_fkey(email, full_name)
          `)
          .eq("id", batch_id)
          .single();

        if (batchError) {
          return buildResponse(action, false, null, {
            code: "BATCH_NOT_FOUND",
            message: "Batch not found",
            details: batchError,
          });
        }

        // Get lines
        const { data: lines } = await supabase
          .from("rol_bank_export_lines")
          .select(`
            *,
            properties!inner(name)
          `)
          .eq("batch_id", batch_id)
          .order("payment_reference");

        // Get signoffs
        const { data: signoffs } = await supabase
          .from("rol_financial_signoffs")
          .select("*")
          .eq("batch_id", batch_id);

        return buildResponse(action, true, {
          batch,
          lines: lines || [],
          signoffs: signoffs || [],
          has_dev_signoff: signoffs?.some(s => s.user_role === 'dev') || false,
          has_fl_signoff: signoffs?.some(s => s.user_role === 'fearless_leader') || false,
        });
      }

      case "validate_batch": {
        const { batch_id } = body;
        
        if (!batch_id) {
          return buildResponse(action, false, null, {
            code: "MISSING_BATCH_ID",
            message: "batch_id is required",
          });
        }

        const { data: batch } = await supabase
          .from("rol_bank_export_batches")
          .select("*")
          .eq("id", batch_id)
          .single();

        if (!batch) {
          return buildResponse(action, false, null, {
            code: "BATCH_NOT_FOUND",
            message: "Batch not found",
          });
        }

        const { data: lines } = await supabase
          .from("rol_bank_export_lines")
          .select("*")
          .eq("batch_id", batch_id);

        const errors: string[] = [];
        const warnings: string[] = [];

        // Validate batch totals
        const calculatedTotal = lines?.reduce((sum, l) => sum + Number(l.amount), 0) || 0;
        if (Math.abs(calculatedTotal - Number(batch.total_amount)) > 0.01) {
          errors.push(`Batch total mismatch: expected R${formatZAR(batch.total_amount)}, calculated R${formatZAR(calculatedTotal)}`);
        }

        // Validate record count
        if ((lines?.length || 0) !== batch.total_records) {
          errors.push(`Record count mismatch: expected ${batch.total_records}, found ${lines?.length || 0}`);
        }

        // Validate each line
        for (const line of lines || []) {
          if (Number(line.amount) < 500) {
            errors.push(`Line ${line.payment_reference}: Amount R${formatZAR(line.amount)} below minimum R500`);
          }
          if (!line.branch_code || line.branch_code.length < 5) {
            errors.push(`Line ${line.payment_reference}: Invalid branch code`);
          }
          if (!line.beneficiary_name || line.beneficiary_name.length < 2) {
            errors.push(`Line ${line.payment_reference}: Invalid beneficiary name`);
          }
        }

        // Warnings
        if (Number(batch.total_amount) > 1000000) {
          warnings.push(`Large batch: R${formatZAR(batch.total_amount)} - verify carefully`);
        }

        const result: BatchValidationResult = {
          batch_id,
          is_valid: errors.length === 0,
          errors,
          warnings,
          total_amount: Number(batch.total_amount),
          record_count: batch.total_records,
        };

        return buildResponse(action, true, result);
      }

      case "submit_signoff": {
        const { batch_id, acknowledgment_text } = body;
        
        if (!batch_id) {
          return buildResponse(action, false, null, {
            code: "MISSING_BATCH_ID",
            message: "batch_id is required",
          });
        }

        if (!acknowledgment_text) {
          return buildResponse(action, false, null, {
            code: "MISSING_ACKNOWLEDGMENT",
            message: "acknowledgment_text is required",
          });
        }

        // Get batch
        const { data: batch } = await supabase
          .from("rol_bank_export_batches")
          .select("*")
          .eq("id", batch_id)
          .single();

        if (!batch) {
          return buildResponse(action, false, null, {
            code: "BATCH_NOT_FOUND",
            message: "Batch not found",
          });
        }

        if (!['draft', 'awaiting_signoff'].includes(batch.status)) {
          return buildResponse(action, false, null, {
            code: "INVALID_STATUS",
            message: `Cannot sign off batch in status: ${batch.status}`,
          });
        }

        // Determine user's signoff role
        const signoffRole = isDev ? 'dev' : isFearlessLeader ? 'fearless_leader' : null;
        
        if (!signoffRole) {
          return buildResponse(action, false, null, {
            code: "INVALID_ROLE",
            message: "User does not have a valid signoff role",
          });
        }

        // Check for existing signoff from this role
        const { data: existingSignoff } = await supabase
          .from("rol_financial_signoffs")
          .select("*")
          .eq("batch_id", batch_id)
          .eq("user_role", signoffRole)
          .maybeSingle();

        if (existingSignoff) {
          return buildResponse(action, false, null, {
            code: "ALREADY_SIGNED",
            message: `This batch already has a ${signoffRole} signoff`,
          });
        }

        // Get client IP
        const clientIP = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
        const ipHash = await sha256(clientIP);

        // Generate signature hash
        const signatureInput = [
          batch_id,
          user.id,
          batch.total_amount,
          new Date().toISOString(),
        ].join('|');
        const signatureHash = await sha256(signatureInput);

        // Get user email
        const { data: profile } = await supabase
          .from("profiles")
          .select("email")
          .eq("id", user.id)
          .single();

        // Create signoff
        const { data: signoff, error: signoffError } = await supabase
          .from("rol_financial_signoffs")
          .insert({
            batch_id,
            user_id: user.id,
            user_email: profile?.email || user.email || '',
            user_role: signoffRole,
            ip_address: clientIP,
            ip_hash: ipHash,
            user_agent: req.headers.get("user-agent") || '',
            signature_hash: signatureHash,
            acknowledgment_text,
          })
          .select()
          .single();

        if (signoffError) {
          return buildResponse(action, false, null, {
            code: "SIGNOFF_FAILED",
            message: "Failed to create signoff",
            details: signoffError,
          });
        }

        // Check if we now have both signoffs
        const { data: allSignoffs } = await supabase
          .from("rol_financial_signoffs")
          .select("user_role")
          .eq("batch_id", batch_id);

        const roles = allSignoffs?.map(s => s.user_role) || [];
        const hasBothSignoffs = roles.includes('dev') && roles.includes('fearless_leader');

        // Update batch status
        const newStatus = hasBothSignoffs ? 'approved' : 'awaiting_signoff';
        await supabase
          .from("rol_bank_export_batches")
          .update({ status: newStatus })
          .eq("id", batch_id);

        console.log(`[bank-export-api] Signoff by ${signoffRole} (${user.email}) for batch ${batch.batch_reference}. Status: ${newStatus}`);

        return buildResponse(action, true, {
          signoff,
          batch_status: newStatus,
          has_both_signoffs: hasBothSignoffs,
        });
      }

      case "generate_csv": {
        const { batch_id } = body;
        
        if (!batch_id) {
          return buildResponse(action, false, null, {
            code: "MISSING_BATCH_ID",
            message: "batch_id is required",
          });
        }

        // Get batch
        const { data: batch } = await supabase
          .from("rol_bank_export_batches")
          .select("*")
          .eq("id", batch_id)
          .single();

        if (!batch) {
          return buildResponse(action, false, null, {
            code: "BATCH_NOT_FOUND",
            message: "Batch not found",
          });
        }

        if (batch.status !== 'approved') {
          return buildResponse(action, false, null, {
            code: "NOT_APPROVED",
            message: "Batch must be approved before generating CSV",
          });
        }

        // Get lines
        const { data: lines } = await supabase
          .from("rol_bank_export_lines")
          .select("*")
          .eq("batch_id", batch_id)
          .order("payment_reference");

        if (!lines || lines.length === 0) {
          return buildResponse(action, false, null, {
            code: "NO_LINES",
            message: "No export lines found",
          });
        }

        // Generate CSV
        const csvContent = generateCSV(lines as ExportLine[], batch.batch_reference);

        // Update batch as exported
        await supabase
          .from("rol_bank_export_batches")
          .update({
            status: 'exported',
            exported_at: new Date().toISOString(),
            exported_by: user.id,
          })
          .eq("id", batch_id);

        // Update ledger entries as exported
        const allLedgerIds = lines.flatMap(l => l.ledger_ids);
        await supabase
          .from("rol_revenue_ledger")
          .update({
            status: 'exported',
            exported_at: new Date().toISOString(),
          })
          .in("id", allLedgerIds);

        // Update line statuses
        await supabase
          .from("rol_bank_export_lines")
          .update({ status: 'submitted' })
          .eq("batch_id", batch_id);

        console.log(`[bank-export-api] Generated CSV for batch ${batch.batch_reference} by ${user.email}`);

        return buildResponse(action, true, {
          csv_content: csvContent,
          filename: `${batch.batch_reference}.csv`,
          total_amount: batch.total_amount,
          record_count: lines.length,
        });
      }

      case "cancel_batch": {
        const { batch_id, reason } = body;
        
        if (!batch_id) {
          return buildResponse(action, false, null, {
            code: "MISSING_BATCH_ID",
            message: "batch_id is required",
          });
        }

        const { data: batch } = await supabase
          .from("rol_bank_export_batches")
          .select("*")
          .eq("id", batch_id)
          .single();

        if (!batch) {
          return buildResponse(action, false, null, {
            code: "BATCH_NOT_FOUND",
            message: "Batch not found",
          });
        }

        if (batch.status === 'exported') {
          return buildResponse(action, false, null, {
            code: "CANNOT_CANCEL",
            message: "Cannot cancel an exported batch",
          });
        }

        // Get lines to unlock ledger entries
        const { data: lines } = await supabase
          .from("rol_bank_export_lines")
          .select("ledger_ids")
          .eq("batch_id", batch_id);

        const allLedgerIds = lines?.flatMap(l => l.ledger_ids) || [];

        // Unlock ledger entries back to eligible
        if (allLedgerIds.length > 0) {
          await supabase
            .from("rol_revenue_ledger")
            .update({
              status: 'eligible',
              export_batch_id: null,
            })
            .in("id", allLedgerIds);
        }

        // Update batch status
        await supabase
          .from("rol_bank_export_batches")
          .update({
            status: 'cancelled',
            failure_reason: reason || 'Cancelled by user',
          })
          .eq("id", batch_id);

        console.log(`[bank-export-api] Cancelled batch ${batch.batch_reference} by ${user.email}`);

        return buildResponse(action, true, {
          batch_id,
          status: 'cancelled',
          unlocked_entries: allLedgerIds.length,
        });
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
