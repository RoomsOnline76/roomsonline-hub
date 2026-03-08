import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface NightAuditLogEntry {
  id: string;
  property_id: string;
  audit_date: string;
  tasks_json: Array<{
    task: string;
    status: "success" | "skipped" | "error";
    details?: string;
    count?: number;
    amount?: number;
  }>;
  status: string;
  charges_posted: number;
  tax_posted: number;
  folios_closed: number;
  rooms_rolled: number;
  revenue_total: number;
  started_at: string;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export function useNightAuditLog(propertyId: string | null) {
  return useQuery({
    queryKey: ["pms-night-audit-log", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolos_night_audit_log" as any)
        .select("*")
        .eq("property_id", propertyId!)
        .order("audit_date", { ascending: false })
        .limit(30);
      if (error) throw error;
      return (data || []) as unknown as NightAuditLogEntry[];
    },
  });
}

export function useTriggerNightAudit(propertyId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("pms-night-audit", {
        body: { property_id: propertyId, force: true },
      });
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-night-audit-log", propertyId] });
      toast.success("Night audit triggered successfully");
    },
    onError: (err: any) => toast.error("Night audit failed", { description: err.message }),
  });
}
