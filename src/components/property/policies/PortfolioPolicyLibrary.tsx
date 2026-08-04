import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Loader2 } from "lucide-react";
import type { ReservationPolicy } from "@/hooks/useReservationPolicies";
import { shortPolicyLabel } from "@/lib/policyLabels";

interface Props {
  portfolioPolicies: ReservationPolicy[];
  ownPolicies: ReservationPolicy[];
  loading: boolean;
  activatingId: string | null;
  siblingName: (id: string) => string;
  onActivate: (source: ReservationPolicy, mode: "copy" | "link") => void;
}

/** Dense collapsible list of policies available from sibling properties in the same portfolio. */
export const PortfolioPolicyLibrary: React.FC<Props> = ({
  portfolioPolicies,
  ownPolicies,
  loading,
  activatingId,
  siblingName,
  onActivate,
}) => {
  const [open, setOpen] = useState(false);

  /**
   * Every sibling policy stays listed — copies made earlier are shown with a
   * status chip instead of disappearing, so the library never reads as "(0)"
   * right after a portfolio copy.
   */
  const entries = portfolioPolicies.map((sp) => {
    const mine = ownPolicies.find((p) => p.source_policy_id === sp.id || p.name === sp.name);
    const status: "linked" | "active" | "available" = !mine
      ? "available"
      : mine.linked_master_id
        ? "linked"
        : "active";
    return { sp, status };
  });
  const availableCount = entries.filter((e) => e.status === "available").length;
  const onCount = entries.length - availableCount;

  const chip: Record<string, string> = {
    available: "border-border/60 text-muted-foreground",
    active: "border-success/50 text-success",
    linked: "border-primary/50 text-primary",
  };

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="rounded-md border">
      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-muted/40">
        <div className="min-w-0">
          <p className="text-xs font-medium">
            Portfolio policies{" "}
            <span className="font-normal text-muted-foreground">
              ({availableCount} available{onCount > 0 ? `, ${onCount} already on this property` : ""})
            </span>
          </p>
          <p className="text-[11px] leading-tight text-muted-foreground">
            Activate a policy from a sibling property — as an independent copy or linked to the original.
          </p>
        </div>
        <ChevronDown className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="space-y-1.5 border-t px-3 py-2">
          {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          {!loading && entries.length === 0 && (
            <p className="text-[11px] text-muted-foreground">No policies found on sibling properties.</p>
          )}
          {entries.map(({ sp, status }) => (
            <div
              key={sp.id}
              className="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/20 px-2.5 py-1.5"
            >
              <div className="min-w-0">
                <div className="text-xs font-medium truncate flex items-center gap-1.5">
                  <span className="truncate">
                    {sp.name}{" "}
                    <span className="font-normal text-muted-foreground">— {siblingName(sp.property_id)}</span>
                  </span>
                  <span className={`shrink-0 rounded border px-1 text-[10px] capitalize ${chip[status]}`}>
                    {status === "available" ? "available" : status === "linked" ? "linked here" : "on this property"}
                  </span>
                </div>
                <p className="text-[11px] leading-tight text-muted-foreground truncate">{shortPolicyLabel(sp.rule)}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={activatingId === sp.id || status !== "available"}
                  onClick={() => onActivate(sp, "copy")}
                >
                  Copy
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={activatingId === sp.id || status !== "available"}
                  onClick={() => onActivate(sp, "link")}
                >
                  Link
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};

