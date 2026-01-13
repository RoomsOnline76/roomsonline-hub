import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

// Types matching edge function
interface LedgerSummary {
  total_pending: number;
  total_pending_amount: number;
  total_eligible: number;
  total_eligible_amount: number;
  total_exported: number;
  total_exported_amount: number;
  by_property: Array<{
    property_id: string;
    property_name: string;
    pending_count: number;
    pending_amount: number;
    eligible_count: number;
    eligible_amount: number;
  }>;
}

interface EligibilityResult {
  is_eligible: boolean;
  failed_rules: string[];
  passed_rules: string[];
  eligible_amount: number;
  ledger_id: string;
}

interface LedgerEntry {
  id: string;
  source_type: string;
  source_id: string;
  property_id: string;
  gross_amount: number;
  commission_amount: number;
  net_amount: number;
  commission_rate: number;
  currency: string;
  status: string;
  eligible_at: string | null;
  escrow_release_date: string | null;
  export_batch_id: string | null;
  created_at: string;
  properties?: {
    name: string;
    owner_email: string;
  };
}

interface ExportBatch {
  id: string;
  batch_reference: string;
  batch_sequence: number;
  bank_provider: string;
  export_format: string;
  total_records: number;
  total_amount: number;
  status: string;
  created_by: string;
  created_at: string;
  exported_at: string | null;
  profiles?: {
    email: string;
    full_name: string;
  };
}

interface ExportLine {
  id: string;
  batch_id: string;
  property_id: string;
  beneficiary_name: string;
  bank_name: string;
  branch_code: string;
  account_number_masked: string;
  amount: number;
  payment_reference: string;
  ledger_ids: string[];
  ledger_count: number;
  status: string;
  properties?: {
    name: string;
  };
}

interface FinancialSignoff {
  id: string;
  batch_id: string;
  user_id: string;
  user_email: string;
  user_role: string;
  signed_at: string;
}

interface BatchDetails {
  batch: ExportBatch;
  lines: ExportLine[];
  signoffs: FinancialSignoff[];
  has_dev_signoff: boolean;
  has_fl_signoff: boolean;
}

interface BatchValidationResult {
  batch_id: string;
  is_valid: boolean;
  errors: string[];
  warnings: string[];
  total_amount: number;
  record_count: number;
}

interface CreateBatchResponse {
  batch: ExportBatch;
  lines: ExportLine[];
  skipped_properties: Array<{ property_id: string; reason: string }>;
}

interface CSVGenerationResponse {
  csv_content: string;
  filename: string;
  total_amount: number;
  record_count: number;
}

interface BankExportResponse<T> {
  success: boolean;
  data: T | null;
  error: { code: string; message: string; details?: unknown } | null;
  source: string;
  fetched_at: string;
  action: string;
}

// Helper to call edge function
async function callBankExportApi<T>(action: string, params: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await supabase.functions.invoke<BankExportResponse<T>>("bank-export-api", {
    body: { action, ...params },
  });

  if (error) {
    throw new Error(error.message || "API call failed");
  }

  if (!data?.success) {
    throw new Error(data?.error?.message || "Unknown error");
  }

  return data.data as T;
}

// ==================== PHASE 1 HOOKS ====================

// Hook: Get ledger summary
export function useLedgerSummary() {
  const { user, isDev, isFearlessLeader } = useAuth();
  const hasAccess = isDev || isFearlessLeader;

  return useQuery({
    queryKey: ["bank-export", "ledger-summary"],
    queryFn: () => callBankExportApi<LedgerSummary>("get_ledger_summary"),
    enabled: !!user && hasAccess,
    staleTime: 30000,
  });
}

// Hook: Get eligible entries
export function useEligibleEntries(propertyId?: string) {
  const { user, isDev, isFearlessLeader } = useAuth();
  const hasAccess = isDev || isFearlessLeader;

  return useQuery({
    queryKey: ["bank-export", "eligible-entries", propertyId],
    queryFn: () => callBankExportApi<LedgerEntry[]>("get_eligible_entries", {
      filters: propertyId ? { property_id: propertyId } : undefined,
    }),
    enabled: !!user && hasAccess,
  });
}

// Hook: Check eligibility for a ledger entry
export function useCheckEligibility() {
  return useMutation({
    mutationFn: (ledgerId: string) => 
      callBankExportApi<EligibilityResult>("check_eligibility", { ledger_id: ledgerId }),
    onError: (error: Error) => {
      toast.error(`Eligibility check failed: ${error.message}`);
    },
  });
}

// Hook: Promote entry to eligible
export function usePromoteToEligible() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (ledgerId: string) =>
      callBankExportApi<LedgerEntry>("promote_to_eligible", { ledger_id: ledgerId }),
    onSuccess: () => {
      toast.success("Entry promoted to eligible");
      queryClient.invalidateQueries({ queryKey: ["bank-export"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to promote: ${error.message}`);
    },
  });
}

// Hook: Create ledger entry from booking
export function useCreateLedgerEntry() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (bookingId: string) =>
      callBankExportApi<LedgerEntry>("create_ledger_entry", { booking_id: bookingId }),
    onSuccess: () => {
      toast.success("Ledger entry created");
      queryClient.invalidateQueries({ queryKey: ["bank-export"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create ledger entry: ${error.message}`);
    },
  });
}

// Hook: Health check
export function useBankExportHealthCheck() {
  const { user, isDev, isFearlessLeader } = useAuth();
  const hasAccess = isDev || isFearlessLeader;

  return useQuery({
    queryKey: ["bank-export", "health"],
    queryFn: () => callBankExportApi<{ status: string; timestamp: string }>("health_check"),
    enabled: !!user && hasAccess,
    staleTime: 60000,
  });
}

// Hook: Get property bank details
export function usePropertyBankDetails(propertyId?: string) {
  const { user } = useAuth();

  return useQuery({
    queryKey: ["bank-details", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      
      const { data, error } = await supabase
        .from("property_bank_details")
        .select("*")
        .eq("property_id", propertyId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    enabled: !!user && !!propertyId,
  });
}

// Hook: Get all bank details (for admin)
export function useAllBankDetails() {
  const { user, isDev, isFearlessLeader, isAdmin } = useAuth();
  const hasAccess = isDev || isFearlessLeader || isAdmin;

  return useQuery({
    queryKey: ["bank-details", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_bank_details")
        .select(`
          *,
          properties!inner(name, owner_email)
        `)
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!user && hasAccess,
  });
}

// ==================== PHASE 2 HOOKS ====================

// Hook: Get all batches
export function useBatches(status?: string) {
  const { user, isDev, isFearlessLeader } = useAuth();
  const hasAccess = isDev || isFearlessLeader;

  return useQuery({
    queryKey: ["bank-export", "batches", status],
    queryFn: () => callBankExportApi<ExportBatch[]>("get_batches", {
      status: status || undefined,
    }),
    enabled: !!user && hasAccess,
  });
}

// Hook: Get batch details
export function useBatchDetails(batchId?: string) {
  const { user, isDev, isFearlessLeader } = useAuth();
  const hasAccess = isDev || isFearlessLeader;

  return useQuery({
    queryKey: ["bank-export", "batch-details", batchId],
    queryFn: () => callBankExportApi<BatchDetails>("get_batch_details", { batch_id: batchId }),
    enabled: !!user && hasAccess && !!batchId,
  });
}

// Hook: Create batch
export function useCreateBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ bankProvider, propertyIds }: { bankProvider: string; propertyIds?: string[] }) =>
      callBankExportApi<CreateBatchResponse>("create_batch", {
        bank_provider: bankProvider,
        property_ids: propertyIds,
      }),
    onSuccess: (data) => {
      toast.success(`Batch ${data.batch.batch_reference} created with ${data.lines.length} payouts`);
      queryClient.invalidateQueries({ queryKey: ["bank-export"] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to create batch: ${error.message}`);
    },
  });
}

// Hook: Validate batch
export function useValidateBatch() {
  return useMutation({
    mutationFn: (batchId: string) =>
      callBankExportApi<BatchValidationResult>("validate_batch", { batch_id: batchId }),
    onError: (error: Error) => {
      toast.error(`Validation failed: ${error.message}`);
    },
  });
}

// Hook: Submit signoff
export function useSubmitSignoff() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ batchId, acknowledgmentText }: { batchId: string; acknowledgmentText: string }) =>
      callBankExportApi<{ signoff: FinancialSignoff; batch_status: string; has_both_signoffs: boolean }>(
        "submit_signoff",
        { batch_id: batchId, acknowledgment_text: acknowledgmentText }
      ),
    onSuccess: (data) => {
      if (data.has_both_signoffs) {
        toast.success("Batch approved! Both signoffs received.");
      } else {
        toast.success("Signoff recorded. Awaiting second signoff.");
      }
      queryClient.invalidateQueries({ queryKey: ["bank-export"] });
    },
    onError: (error: Error) => {
      toast.error(`Signoff failed: ${error.message}`);
    },
  });
}

// Hook: Generate CSV
export function useGenerateCSV() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (batchId: string) =>
      callBankExportApi<CSVGenerationResponse>("generate_csv", { batch_id: batchId }),
    onSuccess: (data) => {
      // Trigger download
      const blob = new Blob([data.csv_content], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      
      toast.success(`Exported ${data.filename}`);
      queryClient.invalidateQueries({ queryKey: ["bank-export"] });
    },
    onError: (error: Error) => {
      toast.error(`Export failed: ${error.message}`);
    },
  });
}

// Hook: Cancel batch
export function useCancelBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ batchId, reason }: { batchId: string; reason?: string }) =>
      callBankExportApi<{ batch_id: string; status: string; unlocked_entries: number }>(
        "cancel_batch",
        { batch_id: batchId, reason }
      ),
    onSuccess: (data) => {
      toast.success(`Batch cancelled. ${data.unlocked_entries} entries unlocked.`);
      queryClient.invalidateQueries({ queryKey: ["bank-export"] });
    },
    onError: (error: Error) => {
      toast.error(`Cancel failed: ${error.message}`);
    },
  });
}
