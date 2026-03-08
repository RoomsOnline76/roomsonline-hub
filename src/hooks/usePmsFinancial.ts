import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ==================== FOLIOS ====================
export function useFolios(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-folios", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pms-financial", {
        body: { action: "get_folios", property_id: propertyId },
      });
      if (error) throw error;
      return (data as any)?.folios || [];
    },
  });
}

export function useFolioDetail(folioId: string | null) {
  return useQuery({
    queryKey: ["pms-folio-detail", folioId],
    enabled: !!folioId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pms-financial", {
        body: { action: "get_folio_detail", folio_id: folioId },
      });
      if (error) throw error;
      return data as { folio: any; transactions: any[]; payments: any[]; invoices: any[] };
    },
  });
}

// ==================== PAYMENTS ====================
export function usePayments(propertyId: string | null, folioId?: string) {
  return useQuery({
    queryKey: ["pms-payments", propertyId, folioId],
    enabled: !!propertyId,
    queryFn: async () => {
      let query = supabase.from("rolos_payments" as any).select("*").eq("property_id", propertyId!).order("created_at", { ascending: false });
      if (folioId) query = query.eq("folio_id", folioId);
      const { data, error } = await query;
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useRecordPayment(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { folio_id: string; amount: number; method: string; reference?: string; notes?: string }) => {
      const { data, error } = await supabase.functions.invoke("pms-financial", {
        body: { action: "record_payment", property_id: propertyId, ...params },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pms-payments", propertyId] });
      qc.invalidateQueries({ queryKey: ["pms-folios", propertyId] });
      qc.invalidateQueries({ queryKey: ["pms-folio-detail", vars.folio_id] });
      toast.success("Payment recorded");
    },
    onError: (err: any) => toast.error("Payment failed", { description: err.message }),
  });
}

// ==================== REFUNDS ====================
export function useRefunds(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-refunds", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_refunds" as any).select("*, payment:rolos_payments!payment_id(amount, method, reference)").eq("property_id", propertyId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useProcessRefund(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { payment_id: string; amount: number; reason: string }) => {
      const { data, error } = await supabase.functions.invoke("pms-financial", {
        body: { action: "process_refund", property_id: propertyId, ...params },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-refunds", propertyId] });
      qc.invalidateQueries({ queryKey: ["pms-payments", propertyId] });
      toast.success("Refund processed");
    },
    onError: (err: any) => toast.error("Refund failed", { description: err.message }),
  });
}

// ==================== INVOICES ====================
export function useInvoices(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-invoices", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_invoices" as any).select("*").eq("property_id", propertyId!).order("issued_date", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useGenerateInvoice(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { folio_id: string; notes?: string }) => {
      const { data, error } = await supabase.functions.invoke("pms-financial", {
        body: { action: "generate_invoice", property_id: propertyId, ...params },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ["pms-invoices", propertyId] });
      qc.invalidateQueries({ queryKey: ["pms-folio-detail", vars.folio_id] });
      toast.success("Invoice generated");
    },
    onError: (err: any) => toast.error("Invoice generation failed", { description: err.message }),
  });
}

// ==================== TAX RULES ====================
export function useTaxRules(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-tax-rules", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_tax_rules" as any).select("*").eq("property_id", propertyId!).order("name");
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateTaxRule(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; rate: number; applies_to: string }) => {
      const { error } = await supabase.from("rolos_tax_rules" as any).insert({ property_id: propertyId, ...params });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-tax-rules", propertyId] });
      toast.success("Tax rule created");
    },
    onError: (err: any) => toast.error("Failed to create tax rule", { description: err.message }),
  });
}

// ==================== DEPOSIT SCHEDULES ====================
export function useDepositSchedules(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-deposit-schedules", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("pms-financial", {
        body: { action: "get_deposit_schedules", property_id: propertyId },
      });
      if (error) throw error;
      return (data as any)?.schedules || [];
    },
  });
}

// ==================== STAFF SHIFTS ====================
export function useStaffShifts(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-staff-shifts", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_staff_shifts" as any).select("*, staff:property_staff!staff_id(display_name, staff_role)").eq("property_id", propertyId!).order("start_time", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreateShift(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { staff_id: string; shift_type: string; start_time: string; end_time: string; notes?: string }) => {
      const { error } = await supabase.from("rolos_staff_shifts" as any).insert({ property_id: propertyId, ...params });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-staff-shifts", propertyId] });
      toast.success("Shift created");
    },
    onError: (err: any) => toast.error("Failed to create shift", { description: err.message }),
  });
}

// ==================== STAFF ACTIVITY LOG ====================
export function useStaffActivityLog(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-staff-activity", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_staff_activity_log" as any).select("*, staff:property_staff!staff_id(display_name)").eq("property_id", propertyId!).order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return data as any[];
    },
  });
}

// ==================== WAITLIST ====================
export function useWaitlist(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-waitlist", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_waitlist" as any).select("*, room_type:rolos_room_types!room_type_id(name)").eq("property_id", propertyId!).order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useAddToWaitlist(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { guest_name: string; guest_email: string; guest_phone?: string; room_type_id?: string; start_date: string; end_date: string; notes?: string }) => {
      const { error } = await supabase.from("rolos_waitlist" as any).insert({ property_id: propertyId, ...params });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-waitlist", propertyId] });
      toast.success("Added to waitlist");
    },
    onError: (err: any) => toast.error("Failed to add to waitlist", { description: err.message }),
  });
}

// ==================== PRICING RULES ====================
export function usePricingRules(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-pricing-rules", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_pricing_rules" as any).select("*").eq("property_id", propertyId!).order("priority", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });
}

export function useCreatePricingRule(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (params: { name: string; rule_type: string; conditions: Record<string, unknown>; adjustments: Record<string, unknown>; priority?: number }) => {
      const { error } = await supabase.from("rolos_pricing_rules" as any).insert({ property_id: propertyId, ...params });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-pricing-rules", propertyId] });
      toast.success("Pricing rule created");
    },
    onError: (err: any) => toast.error("Failed to create rule", { description: err.message }),
  });
}
