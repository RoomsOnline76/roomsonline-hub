import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { ManualCancellationRule } from "@/lib/cancellationPolicy";
import { toLegacyAmenitiesShape, toHumanSummary } from "@/lib/cancellationPolicy";

export interface ReservationPolicy {
  id: string;
  property_id: string;
  name: string;
  kind: "general" | "non_refundable" | "custom";
  rule: ManualCancellationRule;
  is_default: boolean;
  source_policy_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PolicyRateLink {
  id: string;
  policy_id: string;
  rate_plan_id: string | null;
  channel: string | null;
}

export function useReservationPolicies(propertyId: string | undefined) {
  const [policies, setPolicies] = useState<ReservationPolicy[]>([]);
  const [links, setLinks] = useState<PolicyRateLink[]>([]);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const { data: p, error: pe } = await supabase
        .from("rolos_reservation_policies")
        .select("*")
        .eq("property_id", propertyId)
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      if (pe) throw pe;
      const rows = (p ?? []) as unknown as ReservationPolicy[];
      setPolicies(rows);

      if (rows.length) {
        const { data: l, error: le } = await supabase
          .from("rolos_policy_rate_links")
          .select("*")
          .in("policy_id", rows.map((r) => r.id));
        if (le) throw le;
        setLinks((l ?? []) as unknown as PolicyRateLink[]);
      } else {
        setLinks([]);
      }
    } catch (e) {
      console.error("[useReservationPolicies] fetch failed:", e);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  /** Mirror the current default policy into legacy amenities so channel adapters pick it up. */
  const mirrorDefaultToAmenities = useCallback(
    async (rule: ManualCancellationRule) => {
      if (!propertyId) return;
      const { data: prop } = await supabase
        .from("properties")
        .select("amenities")
        .eq("id", propertyId)
        .maybeSingle();
      const amenities = (prop?.amenities as Record<string, unknown> | null) ?? {};
      const next = {
        ...amenities,
        cancellation_policies: toLegacyAmenitiesShape(rule),
        cancellation_policy: toHumanSummary(rule),
      };
      await supabase.from("properties").update({ amenities: next as never }).eq("id", propertyId);

      // Keep single-row rolos_policies (legacy consumers) in sync too.
      await supabase.from("rolos_policies").upsert(
        {
          property_id: propertyId,
          policy_type: "cancellation",
          rule: { ...rule, manual_override: true } as never,
          is_ai_generated: false,
          last_evaluated_at: new Date().toISOString(),
        },
        { onConflict: "property_id,policy_type" },
      );
    },
    [propertyId],
  );

  const createPolicy = async (input: Omit<ReservationPolicy, "id" | "property_id" | "created_at" | "updated_at">) => {
    if (!propertyId) return null;
    try {
      // If setting default, unset current default first.
      if (input.is_default) {
        await supabase
          .from("rolos_reservation_policies")
          .update({ is_default: false } as never)
          .eq("property_id", propertyId)
          .eq("is_default", true);
      }
      const { data, error } = await supabase
        .from("rolos_reservation_policies")
        .insert({ ...input, property_id: propertyId } as never)
        .select()
        .single();
      if (error) throw error;
      if (input.is_default) await mirrorDefaultToAmenities(input.rule);
      toast.success("Policy created");
      await refetch();
      return data as unknown as ReservationPolicy;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to create policy: ${msg}`);
      return null;
    }
  };

  const updatePolicy = async (id: string, patch: Partial<ReservationPolicy>) => {
    try {
      if (patch.is_default && propertyId) {
        await supabase
          .from("rolos_reservation_policies")
          .update({ is_default: false } as never)
          .eq("property_id", propertyId)
          .eq("is_default", true)
          .neq("id", id);
      }
      const { error } = await supabase
        .from("rolos_reservation_policies")
        .update(patch as never)
        .eq("id", id);
      if (error) throw error;

      const target = policies.find((p) => p.id === id);
      const nextRule = (patch.rule ?? target?.rule) as ManualCancellationRule | undefined;
      const nextIsDefault = patch.is_default ?? target?.is_default;
      if (nextIsDefault && nextRule) await mirrorDefaultToAmenities(nextRule);

      toast.success("Policy saved");
      await refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to save policy: ${msg}`);
    }
  };

  const deletePolicy = async (id: string) => {
    const target = policies.find((p) => p.id === id);
    if (target?.is_default) {
      toast.error("Cannot delete the default policy. Set another policy as default first.");
      return;
    }
    if (links.some((l) => l.policy_id === id)) {
      toast.error("Cannot delete a policy linked to rate plans. Unlink first.");
      return;
    }
    const { error } = await supabase.from("rolos_reservation_policies").delete().eq("id", id);
    if (error) {
      toast.error(`Failed to delete: ${error.message}`);
      return;
    }
    toast.success("Policy deleted");
    await refetch();
  };

  const setDefault = async (id: string) => {
    await updatePolicy(id, { is_default: true });
  };

  const setLinksFor = async (policyId: string, ratePlanIds: string[], channels: string[]) => {
    try {
      await supabase.from("rolos_policy_rate_links").delete().eq("policy_id", policyId);
      const rows: Array<{ policy_id: string; rate_plan_id: string | null; channel: string | null }> = [];
      for (const rp of ratePlanIds) rows.push({ policy_id: policyId, rate_plan_id: rp, channel: null });
      for (const ch of channels) rows.push({ policy_id: policyId, rate_plan_id: null, channel: ch });
      if (rows.length) {
        const { error } = await supabase.from("rolos_policy_rate_links").insert(rows as never);
        if (error) throw error;
      }
      await refetch();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error(`Failed to update rate links: ${msg}`);
    }
  };

  return {
    policies,
    links,
    loading,
    createPolicy,
    updatePolicy,
    deletePolicy,
    setDefault,
    setLinksFor,
    refetch,
  };
}
