import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PolicyRow {
  id: string;
  property_id: string;
  policy_type: string;
  rule: Record<string, unknown>;
  is_ai_generated: boolean;
  last_evaluated_at: string | null;
  created_at: string;
  updated_at: string;
}

export function usePolicies(propertyId: string | undefined) {
  const [policies, setPolicies] = useState<PolicyRow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchPolicies = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("rolos_policies" as any)
        .select("*")
        .eq("property_id", propertyId);
      if (error) throw error;
      setPolicies((data as any[]) || []);
    } catch (err: any) {
      console.error("Failed to fetch policies:", err);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const upsertPolicy = async (
    policyType: string,
    rule: Record<string, unknown>
  ) => {
    if (!propertyId) return;
    try {
      const existing = policies.find((p) => p.policy_type === policyType);
      if (existing) {
        const { error } = await supabase
          .from("rolos_policies" as any)
          .update({ rule, updated_at: new Date().toISOString() } as any)
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("rolos_policies" as any)
          .insert({
            property_id: propertyId,
            policy_type: policyType,
            rule,
          } as any);
        if (error) throw error;
      }
      toast.success("Policy saved");
      await fetchPolicies();
    } catch (err: any) {
      toast.error("Failed to save policy: " + err.message);
    }
  };

  return { policies, loading, upsertPolicy, refetch: fetchPolicies };
}
