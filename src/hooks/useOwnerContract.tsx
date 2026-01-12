import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface OwnerContract {
  id: string;
  owner_email: string;
  owner_name: string | null;
  status: 'draft' | 'sent' | 'viewed' | 'signed' | 'declined' | 'overridden';
  version: number;
  template_version: string;
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

export function useOwnerContract(ownerEmail: string | undefined) {
  const queryClient = useQueryClient();

  // Fetch the latest contract for an owner
  const { data: contract, isLoading, refetch } = useQuery({
    queryKey: ["owner-contract", ownerEmail],
    queryFn: async () => {
      if (!ownerEmail) return null;
      
      const { data, error } = await supabase
        .from("owner_contracts")
        .select("*")
        .eq("owner_email", ownerEmail)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data as OwnerContract | null;
    },
    enabled: !!ownerEmail,
  });

  // Fetch all properties for this owner
  const { data: ownerProperties } = useQuery({
    queryKey: ["owner-properties", ownerEmail],
    queryFn: async () => {
      if (!ownerEmail) return [];
      
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, slug")
        .eq("owner_email", ownerEmail)
        .is("permanently_deleted_at", null)
        .order("name");

      if (error) throw error;
      return data || [];
    },
    enabled: !!ownerEmail,
  });

  // Send contract mutation
  const sendContract = useMutation({
    mutationFn: async ({ ownerName }: { ownerName?: string }) => {
      if (!ownerEmail) throw new Error("Owner email is required");

      const { data, error } = await supabase.functions.invoke("send-owner-contract", {
        body: { owner_email: ownerEmail, owner_name: ownerName },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Contract sent successfully");
      queryClient.invalidateQueries({ queryKey: ["owner-contract", ownerEmail] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to send contract: ${error.message}`);
    },
  });

  // Override contract mutation
  const overrideContract = useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      if (!ownerEmail) throw new Error("Owner email is required");

      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error("User not authenticated");

      // Get the next version number
      const { data: existingContracts } = await supabase
        .from("owner_contracts")
        .select("version")
        .eq("owner_email", ownerEmail)
        .order("version", { ascending: false })
        .limit(1);

      const nextVersion = (existingContracts?.[0]?.version || 0) + 1;

      const { data, error } = await supabase
        .from("owner_contracts")
        .insert({
          owner_email: ownerEmail,
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
      queryClient.invalidateQueries({ queryKey: ["owner-contract", ownerEmail] });
    },
    onError: (error: Error) => {
      toast.error(`Failed to override: ${error.message}`);
    },
  });

  // Resend contract mutation
  const resendContract = useMutation({
    mutationFn: async () => {
      if (!ownerEmail) throw new Error("Owner email is required");

      const { data, error } = await supabase.functions.invoke("send-owner-contract", {
        body: { 
          owner_email: ownerEmail,
          resend: true 
        },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast.success("Contract resent successfully");
      queryClient.invalidateQueries({ queryKey: ["owner-contract", ownerEmail] });
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
    ownerProperties: ownerProperties || [],
  };
}

// Hook to fetch contracts for multiple owners (for overview page)
export function useOwnerContracts(ownerEmails: string[]) {
  return useQuery({
    queryKey: ["owner-contracts-batch", ownerEmails],
    queryFn: async () => {
      if (ownerEmails.length === 0) return {};

      const { data, error } = await supabase
        .from("owner_contracts")
        .select("*")
        .in("owner_email", ownerEmails)
        .order("version", { ascending: false });

      if (error) throw error;

      // Group by owner_email and take the latest version
      const contractsByOwner: Record<string, OwnerContract> = {};
      (data || []).forEach((contract) => {
        if (!contractsByOwner[contract.owner_email]) {
          contractsByOwner[contract.owner_email] = contract as OwnerContract;
        }
      });

      return contractsByOwner;
    },
    enabled: ownerEmails.length > 0,
  });
}
