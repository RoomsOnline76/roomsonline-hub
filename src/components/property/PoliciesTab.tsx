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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Reservation policies</h3>
          <p className="text-xs text-muted-foreground">
            Set the property&rsquo;s master fallback first, then build the library that specials and rate plans draw
            from.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate} className="h-8 text-xs shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1" /> Create new policy
        </Button>
      </div>

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

      {specials.length > 0 && (
        <div className="rounded-md border p-3 space-y-1">
          <div className="flex items-center gap-2">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <h4 className="text-sm font-semibold">Specials and their terms</h4>
            {onOpenSpecials && (
              <Button variant="link" size="sm" className="h-6 text-xs px-1" onClick={onOpenSpecials}>
                Open Specials tab
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {inheriting.length} of {specials.length} special{specials.length === 1 ? "" : "s"} carry no policy of their
            own and therefore use{" "}
            {policies.find((p) => p.is_master)?.name ??
              (mode === "none" ? "no cancellation terms" : "an unset master policy")}
            .
          </p>
          <div className="flex flex-wrap gap-1 pt-1">
            {specials.map((s) => {
              const own = policies.find((p) => p.id === s.cancellation_policy_id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={onOpenSpecials}
                  className="rounded border px-1.5 py-0.5 text-[10px] hover:bg-muted text-left"
                >
                  {s.name} —{" "}
                  {own
                    ? own.name
                    : policies.find((p) => p.is_master)
                      ? `inherits master: ${policies.find((p) => p.is_master)!.name}`
                      : "no cancellation policy"}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {siblings.length > 0 && (
        <PortfolioPolicyLibrary
          portfolioPolicies={portfolioPolicies}
          ownPolicies={policies}
          loading={loadingPortfolio}
          activatingId={activating}
          siblingName={siblingName}
          onActivate={activateFromPortfolio}
        />
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
