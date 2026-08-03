import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Crown, AlertTriangle, ShieldOff, Pencil, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
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
 * Dense presentation aligned to the shared property-form rhythm (no nested cards).
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
    <div
      className={cn(
        "rounded-md border bg-muted/20 px-3 py-2.5 space-y-2",
        resolvedState === "unset" && "border-destructive/50 bg-destructive/5",
        resolvedState === "master" && "border-primary/40",
      )}
    >
      {resolvedState === "master" && master && (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="min-w-0 space-y-0.5">
            <div className="flex items-center gap-1.5 flex-wrap">
              <Badge className="text-[9px] gap-1 px-1.5 py-0">
                <Crown className="h-2.5 w-2.5" /> Master
              </Badge>
              <span className="text-xs font-semibold truncate">{master.name}</span>
              <Badge variant="outline" className="text-[9px] px-1.5 py-0">
                {shortPolicyLabel(master.rule)}
              </Badge>
            </div>
            <p className="text-[11px] leading-tight text-muted-foreground">
              {formatCancellationPolicy(master.rule).summaryText}
            </p>
            {depositLabel(master.rule) && (
              <p className="text-[11px] leading-tight text-muted-foreground">{depositLabel(master.rule)}</p>
            )}
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => onEdit(master)}>
              <Pencil className="h-3 w-3 mr-1" /> Edit
            </Button>
            <Select value="" onValueChange={(v) => (v === "__none__" ? onSetMode("none") : onSetMaster(v))}>
              <SelectTrigger className="h-7 w-[160px] text-xs">
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
      )}

      {resolvedState === "unset" && (
        <div className="space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-destructive">No master policy chosen</p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                The master applies whenever no special or rate plan carries its own terms. Choose one, or record that
                this property has no cancellation policy.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
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
              <ShieldOff className="h-3 w-3 mr-1" /> No cancellation policy
            </Button>
          </div>
        </div>
      )}

      {resolvedState === "none" && (
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            <ShieldOff className="h-3.5 w-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold">No cancellation policy</p>
              <p className="text-[11px] leading-tight text-muted-foreground">
                Confirmed for this property — bookings are fully flexible and no terms are shown at checkout or pushed
                to channels.
              </p>
            </div>
          </div>
          <div className="shrink-0">
            {policies.length > 0 ? (
              <Select value="" onValueChange={(v) => onSetMaster(v)}>
                <SelectTrigger className="h-7 w-[180px] text-xs">
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

      <p className="text-[10px] leading-tight text-muted-foreground border-t border-border/60 pt-1.5">
        Resolution order at checkout: special&rsquo;s policy → rate-plan policy → master policy →
        {resolvedState === "none" ? " no terms" : " none"}
      </p>
    </div>
  );
};
