import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ADMIN_DOMAIN } from "@/lib/config";
import { resolveRepCommissionTerms, RepCommissionTerms, RepTierKey } from "@/lib/repContractTerms";
import { generateRepAgreementHTML, repAgreementVariables } from "@/lib/repAgreementText";

export interface RepContract {
  id: string;
  rep_id: string;
  template_version_id: string | null;
  status: "draft" | "sent" | "signed" | "revoked" | string;
  signing_token: string;
  sent_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_email: string | null;
  signed_html: string | null;
  terms_snapshot: RepCommissionTerms | null;
  notes: string | null;
  created_at: string;
}

export const getRepContractSigningUrl = (token: string) => `${ADMIN_DOMAIN}/rep-contract/sign/${token}`;

export function useRepContracts(repId?: string) {
  return useQuery({
    queryKey: ["rep-contracts", repId ?? "all"],
    queryFn: async () => {
      let q = supabase.from("rep_contracts").select("*");
      if (repId) q = q.eq("rep_id", repId);
      const { data, error } = await q.order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as RepContract[];
    },
  });
}

interface IssueArgs {
  rep: { id: string; display_name: string; rep_code: string; email: string; phone?: string | null; commission_tier: RepTierKey; quarterly_target?: number | null };
}

/** Creates (or refreshes) a rep agreement snapshotted against live billing defaults. */
export function useIssueRepContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ rep }: IssueArgs) => {
      const terms = await resolveRepCommissionTerms(rep.commission_tier, rep.quarterly_target ?? null);

      // Prefer an active `sales_rep` template, otherwise use the built-in agreement.
      const { data: templates } = await supabase
        .from("contract_templates")
        .select("id, current_version_id, is_active, kind")
        .eq("kind", "sales_rep")
        .eq("is_active", true)
        .limit(1);

      const template = templates?.[0] || null;
      let bodyHtml = generateRepAgreementHTML(rep, terms);
      let versionId: string | null = null;

      if (template?.current_version_id) {
        const { data: version } = await supabase
          .from("contract_template_versions")
          .select("id, content_markdown")
          .eq("id", template.current_version_id)
          .maybeSingle();
        if (version?.content_markdown) {
          versionId = version.id;
          const vars = repAgreementVariables(rep, terms);
          bodyHtml = Object.entries(vars).reduce(
            (html, [key, value]) => html.split(`{{${key}}}`).join(value),
            version.content_markdown,
          );

        }
      }

      const token = crypto.randomUUID().replace(/-/g, "");
      const { data, error } = await supabase
        .from("rep_contracts")
        .insert({
          rep_id: rep.id,
          template_version_id: versionId,
          status: "sent",
          signing_token: token,
          sent_at: new Date().toISOString(),
          signed_html: bodyHtml,
          terms_snapshot: terms as never,
        } as never)
        .select()
        .single();

      if (error) throw error;
      return data as unknown as RepContract;
    },
    onSuccess: (contract) => {
      queryClient.invalidateQueries({ queryKey: ["rep-contracts"] });
      toast.success("Agreement issued", { description: "Copy the signing link and send it to the rep." });
      return contract;
    },
    onError: (e: Error) => toast.error("Could not issue agreement", { description: e.message }),
  });
}

export function useRevokeRepContract() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("rep_contracts")
        .update({ status: "revoked", updated_at: new Date().toISOString() } as never)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rep-contracts"] });
      toast.success("Agreement revoked");
    },
    onError: (e: Error) => toast.error("Could not revoke", { description: e.message }),
  });
}
