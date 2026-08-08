import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface SalesRep {
  id: string;
  user_id: string | null;
  rep_code: string;
  display_name: string;
  email: string;
  phone: string | null;
  commission_tier: "base" | "accelerated" | "elite";
  is_active: boolean;
  quarterly_target: number | null;
  notes: string | null;
  /** Tax identity — commission is paid to an independent contractor. */
  entity_type?: "individual" | "company";
  trading_name?: string | null;
  tax_reference_number?: string | null;
  vat_registered?: boolean;
  vat_number?: string | null;
  created_at: string;

  updated_at: string;
}

export function useSalesReps() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["sales-reps"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_reps")
        .select("*")
        .order("display_name");
      if (error) throw error;
      return data as SalesRep[];
    },
  });

  const create = useMutation({
    mutationFn: async (rep: Omit<SalesRep, "id" | "created_at" | "updated_at">) => {
      const { data, error } = await supabase
        .from("sales_reps")
        .insert(rep as any)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-reps"] });
      toast.success("Sales rep created");
    },
    onError: (e) => toast.error("Failed to create rep", { description: e.message }),
  });

  const update = useMutation({
    mutationFn: async ({ id, ...updates }: Partial<SalesRep> & { id: string }) => {
      const { data, error } = await supabase
        .from("sales_reps")
        .update({ ...updates, updated_at: new Date().toISOString() } as any)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-reps"] });
      toast.success("Sales rep updated");
    },
    onError: (e) => toast.error("Failed to update rep", { description: e.message }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("sales_reps").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sales-reps"] });
      toast.success("Sales rep removed");
    },
    onError: (e) => toast.error("Failed to remove rep", { description: e.message }),
  });

  return {
    reps: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error,
    create,
    update,
    remove,
  };
}
