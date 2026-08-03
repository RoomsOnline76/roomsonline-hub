import React, { useEffect, useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Pencil, Trash2, Share2, Star, StarOff, ShieldCheck } from "lucide-react";
import { useReservationPolicies, type ReservationPolicy } from "@/hooks/useReservationPolicies";
import { ReservationPolicyDialog } from "@/components/property/ReservationPolicyDialog";
import { ApplyPolicyToPropertiesDialog } from "@/components/property/ApplyPolicyToPropertiesDialog";
import { formatCancellationPolicy } from "@/lib/policyFormatter";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";

interface Props {
  propertyId: string;
}

interface PolicyMetric {
  policy_id: string;
  room_nights: number;
  revenue: number;
  cancel_rate: number;
  total_bookings: number;
  days: number;
}

export const ReservationPoliciesList: React.FC<Props> = ({ propertyId }) => {
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
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<ReservationPolicy | null>(null);
  const [applyingFrom, setApplyingFrom] = useState<ReservationPolicy | null>(null);
  const [metrics, setMetrics] = useState<Record<string, PolicyMetric>>({});
  const [activating, setActivating] = useState<string | null>(null);

  const siblingName = (id: string) => siblings.find((s) => s.id === id)?.name ?? "portfolio";

  const activateFromPortfolio = async (source: ReservationPolicy, mode: "copy" | "link") => {
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
        linked_master_id: mode === "link" ? source.id : null,
      });
      if (created) toast.success(`"${source.name}" activated on this property`);
    } finally {
      setActivating(null);
    }
  };


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
        console.warn("[ReservationPoliciesList] metrics failed:", e);
      }
    })();
  }, [policies, propertyId]);

  const openCreate = () => {
    setEditing(null);
    setEditorOpen(true);
  };

  const openEdit = (p: ReservationPolicy) => {
    setEditing(p);
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
    } else {
      const created = await createPolicy(input);
      if (created?.id) await setLinksFor(created.id, ratePlanIds, channels);
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

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Reservation policies</h3>
          <p className="text-xs text-muted-foreground">
            All your cancellation and prepayment policies are kept here — view, manage and edit everything in one place.
          </p>
        </div>
        <Button type="button" size="sm" onClick={openCreate} className="h-8 text-xs shrink-0">
          <Plus className="h-3.5 w-3.5 mr-1" /> Create new policy
        </Button>
      </div>

      {policies.length === 0 && (
        <Card>
          <CardContent className="py-8 text-center space-y-2">
            <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
            <p className="text-xs text-muted-foreground">No policies yet. Create your first reservation policy.</p>
          </CardContent>
        </Card>
      )}

      {policies.map((p) => {
        const preview = formatCancellationPolicy(p.rule);
        const linksForPolicy = links.filter((l) => l.policy_id === p.id);
        const linkedRatePlans = linksForPolicy.filter((l) => l.rate_plan_id).length;
        const linkedChannels = linksForPolicy.filter((l) => l.channel).map((l) => l.channel!);
        const m = metrics[p.id];

        return (
          <Card key={p.id}>
            <CardHeader className="pb-2 flex flex-row items-start justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h4 className="text-sm font-semibold truncate">{p.name}</h4>
                  <Badge variant="outline" className="text-[10px]">
                    {p.kind === "non_refundable" ? "Non Refundable" : p.kind === "general" ? "General" : "Custom"}
                  </Badge>
                  {p.is_default && (
                    <Badge className="text-[10px] gap-1">
                      <Star className="h-3 w-3" /> Default
                    </Badge>
                  )}
                  {p.source_policy_id && (
                    <Badge variant="secondary" className="text-[10px]">Linked</Badge>
                  )}
                </div>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc pl-4">
                  <li>{preview.summaryText}</li>
                  {(p.rule.deposit_percent ?? 100) < 100 && (
                    <li>
                      {p.rule.deposit_percent}% deposit collected
                      {p.rule.full_payment_within_days
                        ? ` — full payment if arrival within ${p.rule.full_payment_within_days} days`
                        : ""}
                    </li>
                  )}
                  {linkedRatePlans > 0 && (
                    <li>
                      Linked to {linkedRatePlans} rate plan{linkedRatePlans > 1 ? "s" : ""}
                      {linkedChannels.length ? ` and channels: ${linkedChannels.join(", ")}` : ""}
                    </li>
                  )}
                </ul>
              </div>
            </CardHeader>

            {m && m.total_bookings > 0 && (
              <CardContent className="py-3 border-t">
                <div className="text-xs text-muted-foreground mb-2">Report from {reportRange}</div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase">Room nights</div>
                    <div className="text-sm font-semibold">{m.room_nights}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase">Revenue</div>
                    <div className="text-sm font-semibold">R {m.revenue.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground uppercase">Cancel rate</div>
                    <div className="text-sm font-semibold">{m.cancel_rate}%</div>
                  </div>
                </div>
              </CardContent>
            )}

            <CardContent className="pt-2 pb-3 border-t flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => openEdit(p)} className="h-7 text-xs">
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
              {p.is_default ? (
                <Button type="button" variant="ghost" size="sm" disabled className="h-7 text-xs">
                  <StarOff className="h-3 w-3 mr-1" /> Default
                </Button>
              ) : (
                <Button type="button" variant="ghost" size="sm" onClick={() => setDefault(p.id)} className="h-7 text-xs">
                  <Star className="h-3 w-3 mr-1" /> Set default
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => deletePolicy(p.id)}
                className="h-7 text-xs text-destructive"
                disabled={p.is_default || linksForPolicy.length > 0}
              >
                <Trash2 className="h-3 w-3 mr-1" /> Delete
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setApplyingFrom(p)}
                className="h-7 text-xs text-primary"
              >
                <Share2 className="h-3 w-3 mr-1" /> Apply to other properties
              </Button>
            </CardContent>
          </Card>
        );
      })}

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
