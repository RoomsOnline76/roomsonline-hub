import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface RepBankDetails {
  id: string;
  rep_id: string;
  bank_name: string;
  branch_code: string | null;
  account_holder: string;
  account_number_masked: string | null;
  account_type: string;
  swift_code: string | null;
  is_verified: boolean;
  verified_at: string | null;
  created_at: string;
  updated_at: string;
}

export function useRepBankDetails(repId?: string) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["rep-bank-details", repId],
    enabled: !!repId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_rep_bank_details")
        .select("id, rep_id, bank_name, branch_code, account_holder, account_number_masked, account_type, swift_code, is_verified, verified_at, created_at, updated_at")
        .eq("rep_id", repId!)
        .maybeSingle();
      if (error) throw error;
      return data as RepBankDetails | null;
    },
  });

  const upsert = useMutation({
    mutationFn: async (details: {
      rep_id: string;
      bank_name: string;
      branch_code?: string | null;
      account_holder: string;
      account_number?: string;
      account_type?: string;
      swift_code?: string | null;
    }) => {
      const payload: Record<string, any> = {
        rep_id: details.rep_id,
        bank_name: details.bank_name,
        branch_code: details.branch_code || null,
        account_holder: details.account_holder,
        account_type: details.account_type || "cheque",
        swift_code: details.swift_code || null,
        updated_at: new Date().toISOString(),
      };

      // Mask account number if provided
      if (details.account_number) {
        const num = details.account_number.replace(/\s/g, "");
        payload.account_number_masked = num.length > 4
          ? "****" + num.slice(-4)
          : num;
      }

      const { data, error } = await supabase
        .from("sales_rep_bank_details")
        .upsert(payload as any, { onConflict: "rep_id" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rep-bank-details"] });
      toast.success("Banking details saved");
    },
    onError: (e) => toast.error("Failed to save banking details", { description: e.message }),
  });

  return {
    bankDetails: query.data ?? null,
    isLoading: query.isLoading,
    upsert,
  };
}
