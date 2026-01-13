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

// Hook: Get ledger summary
export function useLedgerSummary() {
  const { user, isDev, isFearlessLeader } = useAuth();
  const hasAccess = isDev || isFearlessLeader;

  return useQuery({
    queryKey: ["bank-export", "ledger-summary"],
    queryFn: () => callBankExportApi<LedgerSummary>("get_ledger_summary"),
    enabled: !!user && hasAccess,
    staleTime: 30000, // 30 seconds
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
    staleTime: 60000, // 1 minute
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
