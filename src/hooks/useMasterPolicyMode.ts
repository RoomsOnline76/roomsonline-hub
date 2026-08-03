import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type MasterPolicyMode = "unset" | "policy" | "none";

/**
 * The property's explicit decision about its master (global fallback) cancellation policy.
 * `none` means the owner deliberately chose to have no cancellation policy — distinct from
 * `unset`, which means the decision has not been made yet.
 */
export function useMasterPolicyMode(propertyId: string | undefined) {
  const [mode, setMode] = useState<MasterPolicyMode>("unset");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const refetch = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("properties")
        .select("cancellation_master_mode")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      const next = (data?.cancellation_master_mode as MasterPolicyMode | undefined) ?? "unset";
      setMode(next);
    } catch (e) {
      console.warn("[useMasterPolicyMode] fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const setMasterMode = useCallback(
    async (next: MasterPolicyMode) => {
      if (!propertyId) return;
      setSaving(true);
      try {
        const { error } = await supabase
          .from("properties")
          .update({ cancellation_master_mode: next })
          .eq("id", propertyId);
        if (error) throw error;
        setMode(next);
        if (next === "none") toast.success("Recorded: this property has no cancellation policy");
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        toast.error(`Failed to save policy mode: ${msg}`);
      } finally {
        setSaving(false);
      }
    },
    [propertyId],
  );

  return { mode, loading, saving, setMasterMode, refetch };
}
