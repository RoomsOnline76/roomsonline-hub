import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface CommissionEntry {
  id: string;
  rep_id: string;
  property_id: string;
  referral_id: string;
  period_start: string;
  period_end: string;
  base_revenue: number;
  commission_type: string;
  rate_applied: number;
  amount: number;
  status: string;
  clawback_reason: string | null;
  created_at: string;
}

export interface CommissionReport {
  id: string;
  rep_id: string;
  period_month: string;
  total_entries: number;
  total_amount: number;
  status: string;
  generated_at: string;
  approved_by: string | null;
  approved_at: string | null;
  paid_at: string | null;
  notes: string | null;
}

export interface PropertyReferral {
  id: string;
  property_id: string;
  rep_id: string;
  lead_source: string;
  lead_notes: string | null;
  referral_date: string;
  status: string;
  clawback_until: string | null;
  converted_at: string | null;
  created_at: string;
  first_year_rate_override: number | null;
  residual_rate_override: number | null;
  residual_months_override: number | null;
  override_notes: string | null;
}


export function usePropertyReferrals(propertyId?: string) {
  return useQuery({
    queryKey: ["property-referrals", propertyId],
    queryFn: async () => {
      let q = supabase.from("property_referrals").select("*");
      if (propertyId) q = q.eq("property_id", propertyId);
      const { data, error } = await q.order("referral_date", { ascending: false });
      if (error) throw error;
      return data as PropertyReferral[];
    },
  });
}

export function useCreateReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (referral: {
      property_id: string;
      rep_id: string;
      lead_source: string;
      lead_notes?: string;
      referral_date?: string;
      status?: string;
    }) => {
      const { data, error } = await supabase
        .from("property_referrals")
        .insert(referral as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-referrals"] });
      toast.success("Referral assigned");
    },
    onError: (e) => toast.error("Failed to assign referral", { description: e.message }),
  });
}

export function useUpdateReferral() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...updates }: Partial<PropertyReferral> & { id: string }) => {
      const { data, error } = await supabase
        .from("property_referrals")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-referrals"] });
      toast.success("Referral updated");
    },
    onError: (e) => toast.error("Failed to update referral", { description: e.message }),
  });
}

export function useCommissionReports() {
  return useQuery({
    queryKey: ["commission-reports"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rep_commission_reports")
        .select("*")
        .order("period_month", { ascending: false });
      if (error) throw error;
      return data as CommissionReport[];
    },
  });
}

export function useCommissionEntries(reportRepId?: string, periodMonth?: string) {
  return useQuery({
    queryKey: ["commission-entries", reportRepId, periodMonth],
    enabled: !!reportRepId,
    queryFn: async () => {
      let q = supabase.from("rep_commission_entries").select("*").eq("rep_id", reportRepId!);
      if (periodMonth) {
        q = q.gte("period_start", periodMonth).lte("period_start", periodMonth + "-31");
      }
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return data as CommissionEntry[];
    },
  });
}

export function useApproveReport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("rep_commission_reports")
        .update({
          status: "approved",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        } as any)
        .eq("id", reportId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commission-reports"] });
      toast.success("Report approved");
    },
    onError: (e) => toast.error("Failed to approve", { description: e.message }),
  });
}

export function useMarkReportPaid() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (reportId: string) => {
      const { error } = await supabase
        .from("rep_commission_reports")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
        } as any)
        .eq("id", reportId);
      if (error) throw error;
      // Also mark entries as paid
      const { data: report } = await supabase
        .from("rep_commission_reports")
        .select("rep_id, period_month")
        .eq("id", reportId)
        .single();
      if (report) {
        await supabase
          .from("rep_commission_entries")
          .update({ status: "paid", updated_at: new Date().toISOString() } as any)
          .eq("rep_id", report.rep_id)
          .eq("status", "approved");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["commission-reports"] });
      queryClient.invalidateQueries({ queryKey: ["commission-entries"] });
      toast.success("Report marked as paid");
    },
    onError: (e) => toast.error("Failed to mark paid", { description: e.message }),
  });
}
