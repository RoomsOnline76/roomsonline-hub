import React, { useState } from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown, Loader2, Building2 } from "lucide-react";
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

/** Collapsible library of policies available from sibling properties in the same portfolio. */
export const PortfolioPolicyLibrary: React.FC<Props> = ({
  portfolioPolicies,
  ownPolicies,
  loading,
  activatingId,
  siblingName,
  onActivate,
}) => {
  const [open, setOpen] = useState(false);
  const available = portfolioPolicies.filter(
    (sp) => !ownPolicies.some((p) => p.source_policy_id === sp.id || p.name === sp.name),
  );

  return (
    <Card>
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="py-3">
          <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 text-left">
            <div className="min-w-0">
              <h4 className="text-sm font-semibold flex items-center gap-2">
                <Building2 className="h-3.5 w-3.5" /> Portfolio policies
                <span className="text-xs font-normal text-muted-foreground">({available.length} available)</span>
              </h4>
              <p className="text-xs text-muted-foreground">
                Activate a policy created on a sibling property — as an independent copy or linked to the original.
              </p>
            </div>
            <ChevronDown className={`h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="space-y-2 pt-0">
            {loading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
            {!loading && available.length === 0 && (
              <p className="text-xs text-muted-foreground">No further policies available from sibling properties.</p>
            )}
            {available.map((sp) => (
              <div key={sp.id} className="flex items-center justify-between gap-2 p-2 rounded-md border">
                <div className="min-w-0">
                  <div className="text-xs font-medium truncate">
                    {sp.name}{" "}
                    <span className="text-muted-foreground font-normal">— {siblingName(sp.property_id)}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground truncate">{shortPolicyLabel(sp.rule)}</p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={activatingId === sp.id}
                    onClick={() => onActivate(sp, "copy")}
                  >
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    disabled={activatingId === sp.id}
                    onClick={() => onActivate(sp, "link")}
                  >
                    Link
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
};
