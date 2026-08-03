import React, { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Crown, AlertTriangle, ShieldOff, Pencil, Plus } from "lucide-react";
import type { ReservationPolicy } from "@/hooks/useReservationPolicies";
import type { MasterPolicyMode } from "@/hooks/useMasterPolicyMode";
import { shortPolicyLabel, depositLabel } from "@/lib/policyLabels";
import { formatCancellationPolicy } from "@/lib/policyFormatter";

interface Props {
  policies: ReservationPolicy[];
  mode: MasterPolicyMode;
  saving: boolean;
  onSetMaster: (id: string) => void;
  onSetMode: (mode: MasterPolicyMode) => void;
  onEdit: (policy: ReservationPolicy) => void;
  onCreate: () => void;
}

/**
 * Master policy decision panel — always makes the property's global fallback explicit:
 * a named master policy, an unmade decision, or a deliberate "no cancellation policy".
 */
export const MasterPolicyPanel: React.FC<Props> = ({
  policies,
  mode,
  saving,
  onSetMaster,
  onSetMode,
  onEdit,
  onCreate,
}) => {
  const master = policies.find((p) => p.is_master) ?? null;
  const [picked, setPicked] = useState<string>("");

  const resolvedState: "master" | "none" | "unset" = master ? "master" : mode === "none" ? "none" : "unset";

  return (
    <Card
      className={
        resolvedState === "unset"
          ? "border-destructive/50"
          : resolvedState === "none"
            ? "border-muted"
            : "border-primary/40"
      }
    >
      <CardContent className="py-4 space-y-3">
        {resolvedState === "master" && master && (
          <>
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0 space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge className="text-[10px] gap-1">
                    <Crown className="h-3 w-3" /> Master policy
                  </Badge>
                  <span className="text-sm font-semibold truncate">{master.name}</span>
                  <Badge variant="outline" className="text-[10px]">
                    {shortPolicyLabel(master.rule)}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">
                  {formatCancellationPolicy(master.rule).summaryText}
                </p>
                {depositLabel(master.rule) && (
                  <p className="text-xs text-muted-foreground">{depositLabel(master.rule)}</p>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onEdit(master)}>
                  <Pencil className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Select
                  value=""
                  onValueChange={(v) => (v === "__none__" ? onSetMode("none") : onSetMaster(v))}
                >
                  <SelectTrigger className="h-7 w-[170px] text-xs">
                    <SelectValue placeholder="Change master" />
                  </SelectTrigger>
                  <SelectContent>
                    {policies
                      .filter((p) => p.id !== master.id)
                      .map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.name}
                        </SelectItem>
                      ))}
                    <SelectItem value="__none__" className="text-xs">
                      No cancellation policy
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </>
        )}

        {resolvedState === "unset" && (
          <div className="space-y-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold text-destructive">No master policy chosen</p>
                <p className="text-xs text-muted-foreground">
                  The master policy applies whenever no special or rate plan carries its own terms. Choose one, or
                  record explicitly that this property has no cancellation policy.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {policies.length > 0 && (
                <>
                  <Select value={picked} onValueChange={setPicked}>
                    <SelectTrigger className="h-7 w-[200px] text-xs">
                      <SelectValue placeholder="Choose a policy" />
                    </SelectTrigger>
                    <SelectContent>
                      {policies.map((p) => (
                        <SelectItem key={p.id} value={p.id} className="text-xs">
                          {p.name} — {shortPolicyLabel(p.rule)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    className="h-7 text-xs"
                    disabled={!picked}
                    onClick={() => picked && onSetMaster(picked)}
                  >
                    <Crown className="h-3 w-3 mr-1" /> Set as master
                  </Button>
                </>
              )}
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCreate}>
                <Plus className="h-3 w-3 mr-1" /> Create master policy
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={saving}
                onClick={() => onSetMode("none")}
              >
                <ShieldOff className="h-3 w-3 mr-1" /> This property has no cancellation policy
              </Button>
            </div>
          </div>
        )}

        {resolvedState === "none" && (
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-start gap-2 min-w-0">
              <ShieldOff className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-semibold">No cancellation policy</p>
                <p className="text-xs text-muted-foreground">
                  Confirmed for this property — bookings are treated as fully flexible and no cancellation terms are
                  shown at checkout or pushed to channels.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {policies.length > 0 ? (
                <Select value="" onValueChange={(v) => onSetMaster(v)}>
                  <SelectTrigger className="h-7 w-[190px] text-xs">
                    <SelectValue placeholder="Set a master policy" />
                  </SelectTrigger>
                  <SelectContent>
                    {policies.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.name} — {shortPolicyLabel(p.rule)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onCreate}>
                  <Plus className="h-3 w-3 mr-1" /> Create a policy
                </Button>
              )}
            </div>
          </div>
        )}

        <div className="text-[11px] text-muted-foreground border-t pt-2">
          Checkout resolution order: selected special&rsquo;s policy → rate-plan linked policy → master policy →
          {resolvedState === "none" ? " no terms" : " none"}
        </div>
      </CardContent>
    </Card>
  );
};
