import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface PropertyContract {
  id: string;
  property_id: string;
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'overridden';
  version: number;
  template_version: string;
  template_hash: string | null;
  sent_to_email: string | null;
  sent_at: string | null;
  signing_token: string | null;
  token_expires_at: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signed_by_name: string | null;
  signed_by_email: string | null;
  signed_by_designation: string | null;
  signature_image_url: string | null;
  signature_data: any;
  signature_ip: string | null;
  signature_user_agent: string | null;
  pdf_url: string | null;
  unsigned_pdf_url: string | null;
  override_by: string | null;
  override_reason: string | null;
  override_at: string | null;
  created_at: string;
  updated_at: string;
}

export function usePropertyContract(propertyId: string | undefined) {
  const queryClient = useQueryClient();

  // Fetch the latest contract for a property
  const { data: contract, isLoading, refetch } = useQuery({
    queryKey: ["property-contract", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      
      const { data, error } = await supabase
        .from("property_contracts")
        .select("*")
        .eq("property_id", propertyId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as PropertyContract | null;
    },
    enabled: !!propertyId,
  });

  // Send contract mutation
  const sendContract = useMutation({
    mutationFn: async ({ ownerEmail, ownerName }: { ownerEmail: string; ownerName?: string }) => {
      if (!propertyId) throw new Error("Property ID is required");

      const { data, error } = await supabase.functions.invoke("send-contract", {
        body: { property_id: propertyId, owner_email: ownerEmail, owner_name: ownerName },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Contract sent successfully");
      queryClient.invalidateQueries({ queryKey: ["property-contract", propertyId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to send contract: ${error.message}`);
    },
  });

  // Override contract mutation
  const overrideContract = useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      if (!propertyId) throw new Error("Property ID is required");

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("User not authenticated");

      // Get the next version number
      const { data: existingContracts } = await supabase
        .from("property_contracts")
        .select("version")
        .eq("property_id", propertyId)
        .order("version", { ascending: false })
        .limit(1);

      const nextVersion = (existingContracts?.[0]?.version || 0) + 1;

      const { data, error } = await supabase
        .from("property_contracts")
        .insert({
          property_id: propertyId,
          status: "overridden",
          version: nextVersion,
          override_by: userData.user.id,
          override_reason: reason,
          override_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Contract requirement overridden");
      queryClient.invalidateQueries({ queryKey: ["property-contract", propertyId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to override: ${error.message}`);
    },
  });

  // Resend contract mutation
  const resendContract = useMutation({
    mutationFn: async () => {
      if (!contract?.sent_to_email) throw new Error("No email to resend to");

      const { data, error } = await supabase.functions.invoke("send-contract", {
        body: { 
          property_id: propertyId, 
          owner_email: contract.sent_to_email,
          resend: true 
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Contract resent successfully");
      queryClient.invalidateQueries({ queryKey: ["property-contract", propertyId] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to resend: ${error.message}`);
    },
  });

  const hasValidContract = contract?.status === "signed" || contract?.status === "overridden";

  return {
    contract,
    isLoading,
    refetch,
    sendContract,
    overrideContract,
    resendContract,
    hasValidContract,
  };
}

// Hook to fetch contracts for multiple properties (for overview page)
export function usePropertyContracts(propertyIds: string[]) {
  return useQuery({
    queryKey: ["property-contracts-batch", propertyIds],
    queryFn: async () => {
      if (propertyIds.length === 0) return {};

      const { data, error } = await supabase
        .from("property_contracts")
        .select("*")
        .in("property_id", propertyIds)
        .order("version", { ascending: false });

      if (error) throw error;

      // Group by property_id and take the latest version
      const contractsByProperty: Record<string, PropertyContract> = {};
      (data || []).forEach((contract) => {
        if (!contractsByProperty[contract.property_id]) {
          contractsByProperty[contract.property_id] = contract as PropertyContract;
        }
      });

      return contractsByProperty;
    },
    enabled: propertyIds.length > 0,
  });
}
