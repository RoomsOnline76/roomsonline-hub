import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Tag } from "lucide-react";
import { useReservationPolicies, type ReservationPolicy } from "@/hooks/useReservationPolicies";
import { usePortfolioSiblings } from "@/hooks/usePortfolioSiblings";
import { usePortfolioPolicies } from "@/hooks/usePortfolioPolicies";
import { useMasterPolicyMode } from "@/hooks/useMasterPolicyMode";
import { usePolicySpecialUsage } from "@/hooks/usePolicySpecialUsage";
import { ReservationPolicyDialog } from "@/components/property/ReservationPolicyDialog";
import { ApplyPolicyToPropertiesDialog } from "@/components/property/ApplyPolicyToPropertiesDialog";
import { MasterPolicyPanel } from "@/components/property/policies/MasterPolicyPanel";
import { PolicyLibraryTable, type PolicyMetric } from "@/components/property/policies/PolicyLibraryTable";
import { PortfolioPolicyLibrary } from "@/components/property/policies/PortfolioPolicyLibrary";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";

interface PoliciesTabProps {
  propertyId: string;
  /** Optional hook so the tab can send the user to the Specials tab. */
  onOpenSpecials?: () => void;
}

export const PoliciesTab: React.FC<PoliciesTabProps> = ({ propertyId, onOpenSpecials }) => {
  const {
    policies,
    links,
    loading,
    createPolicy,
    updatePolicy,
    deletePolicy,
    setDefault,
    setMaster,
    propagateToLinked,
    setLinksFor,
    refetch,
  } = useReservationPolicies(propertyId);
  const { siblings } = usePortfolioSiblings(propertyId);
  const siblingIds = useMemo(() => siblings.map((s) => s.id), [siblings]);
  const { portfolioPolicies, loading: loadingPortfolio } = usePortfolioPolicies(propertyId, siblingIds);
  const { mode, saving, setMasterMode } = useMasterPolicyMode(propertyId);
  const { specials } = usePolicySpecialUsage(propertyId);

  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ReservationPolicy | null>(null);
  const [applyingFrom, setApplyingFrom] = useState<ReservationPolicy | null>(null);
  const [metrics, setMetrics] = useState<Record<string, PolicyMetric>>({});
  const [activating, setActivating] = useState<string | null>(null);

  const siblingName = (id: string) => siblings.find((s) => s.id === id)?.name ?? "portfolio";

  useEffect(() => {
    if (!policies.length) return;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("rolos-policy-metrics", {
          body: { property_id: propertyId, policy_ids: policies.map((p) => p.id), days: 90 },
        });
        if (error) throw error;
        const map: Record<string, PolicyMetric> = {};
        for (const m of (data?.metrics ?? []) as PolicyMetric[]) map[m.policy_id] = m;
        setMetrics(map);
      } catch (e) {
        console.warn("[PoliciesTab] metrics failed:", e);
      }
    })();
  }, [policies, propertyId]);

  const activateFromPortfolio = async (source: ReservationPolicy, modeChoice: "copy" | "link") => {
    setActivating(source.id);
    try {
      const created = await createPolicy({
        name: source.name,
        description: source.description,
        kind: source.kind,
        rule: source.rule,
        is_default: false,
        is_master: false,
        scope: "property",
        source_policy_id: source.id,
        linked_master_id: modeChoice === "link" ? source.id : null,
      });
      if (created) toast.success(`"${source.name}" activated on this property`);
    } finally {
      setActivating(null);
    }
  };

  const handleSetMaster = async (id: string) => {
    await setMaster(id);
    await setMasterMode("policy");
  };

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const handleSave = async (
    input: Omit<ReservationPolicy, "id" | "property_id" | "created_at" | "updated_at">,
    ratePlanIds: string[],
    channels: string[],
    policyId: string | null,
  ) => {
    if (policyId) {
      await updatePolicy(policyId, input);
      await setLinksFor(policyId, ratePlanIds, channels);
      if (input.is_master) await setMasterMode("policy");
    } else {
      const created = await createPolicy(input);
      if (created?.id) await setLinksFor(created.id, ratePlanIds, channels);
      if (input.is_master) await setMasterMode("policy");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const reportRange =
    policies.length > 0
      ? `${format(new Date(Date.now() - 90 * 86400000), "d MMM yyyy")} to ${format(new Date(), "d MMM yyyy")}`
      : "";

  const inheriting = specials.filter((s) => !s.cancellation_policy_id);
  const masterPolicy = policies.find((p) => p.is_master);

  return (
    <div className="space-y-5">
      <FormSection
        title="Master policy"
        description="The property-wide fallback used whenever a special or rate plan carries no terms of its own."
      >
        <MasterPolicyPanel
          policies={policies}
          mode={mode}
          saving={saving}
          onSetMaster={handleSetMaster}
          onSetMode={setMasterMode}
          onEdit={(p) => {
            setEditing(p);
            setEditorOpen(true);
          }}
          onCreate={openCreate}
        />
      </FormSection>

      <FormSection
        title="Policy library"
        description={
          reportRange
            ? `Cancellation and prepayment policies specials and rate plans draw from. Performance for ${reportRange}.`
            : "Cancellation and prepayment policies that specials and rate plans draw from."
        }
        actions={
          <Button type="button" size="sm" variant="outline" onClick={openCreate} className="h-7 text-xs">
            <Plus className="h-3.5 w-3.5 mr-1" /> New policy
          </Button>
        }
      >
        <PolicyLibraryTable
          policies={policies}
          links={links}
          metrics={metrics}
          specials={specials}
          reportRange={reportRange}
          onEdit={(p) => {
            setEditing(p);
            setEditorOpen(true);
          }}
          onSetMaster={handleSetMaster}
          onSetDefault={setDefault}
          onDelete={deletePolicy}
          onApplyToProperties={setApplyingFrom}
          onPushToLinked={propagateToLinked}
          onOpenSpecials={onOpenSpecials}
        />
      </FormSection>

      {specials.length > 0 && (
        <FormSection
          title="Specials and their terms"
          description={`${inheriting.length} of ${specials.length} special${
            specials.length === 1 ? "" : "s"
          } carry no policy of their own and use ${
            masterPolicy?.name ?? (mode === "none" ? "no cancellation terms" : "an unset master policy")
          }.`}
          actions={
            onOpenSpecials && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={onOpenSpecials}
              >
                <Tag className="h-3.5 w-3.5 mr-1" /> Open Specials
              </Button>
            )
          }
        >
          <div className="flex flex-wrap gap-1">
            {specials.map((s) => {
              const own = policies.find((p) => p.id === s.cancellation_policy_id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={onOpenSpecials}
                  className="rounded border border-border/60 bg-muted/20 px-1.5 py-0.5 text-[10px] text-left hover:bg-muted"
                >
                  {s.name} —{" "}
                  {own ? own.name : masterPolicy ? `inherits master: ${masterPolicy.name}` : "no cancellation policy"}
                </button>
              );
            })}
          </div>
        </FormSection>
      )}

      {siblings.length > 0 && (
        <FormSection title="Portfolio library">
          <PortfolioPolicyLibrary
            portfolioPolicies={portfolioPolicies}
            ownPolicies={policies}
            loading={loadingPortfolio}
            activatingId={activating}
            siblingName={siblingName}
            onActivate={activateFromPortfolio}
          />
        </FormSection>
      )}

      <ReservationPolicyDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        propertyId={propertyId}
        policy={editing}
        existingLinks={links}
        onSave={handleSave}
      />

      {applyingFrom && (
        <ApplyPolicyToPropertiesDialog
          open={!!applyingFrom}
          onOpenChange={(o) => !o && setApplyingFrom(null)}
          sourcePolicy={applyingFrom}
          onApplied={refetch}
        />
      )}
    </div>
  );
};

