import React from "react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MoreHorizontal, Crown, Star, Pencil, Trash2, Share2, RefreshCw, Tag, ShieldCheck } from "lucide-react";
import type { ReservationPolicy, PolicyRateLink } from "@/hooks/useReservationPolicies";
import type { SpecialPolicyUsage } from "@/hooks/usePolicySpecialUsage";
import { shortPolicyLabel, depositLabel } from "@/lib/policyLabels";
import { toast } from "sonner";

export interface PolicyMetric {
  policy_id: string;
  room_nights: number;
  revenue: number;
  cancel_rate: number;
  total_bookings: number;
  days: number;
}

interface Props {
  policies: ReservationPolicy[];
  links: PolicyRateLink[];
  metrics: Record<string, PolicyMetric>;
  specials: SpecialPolicyUsage[];
  reportRange: string;
  onEdit: (p: ReservationPolicy) => void;
  onSetMaster: (id: string) => void;
  onSetDefault: (id: string) => void;
  onDelete: (id: string) => void;
  onApplyToProperties: (p: ReservationPolicy) => void;
  onPushToLinked: (id: string) => void;
  onOpenSpecials?: () => void;
}

/** Compact policy library table: terms, what it applies to (incl. specials) and 90-day performance. */
export const PolicyLibraryTable: React.FC<Props> = ({
  policies,
  links,
  metrics,
  specials,
  reportRange,
  onEdit,
  onSetMaster,
  onSetDefault,
  onDelete,
  onApplyToProperties,
  onPushToLinked,
  onOpenSpecials,
}) => {
  if (!policies.length) {
    return (
      <Card>
        <CardContent className="py-8 text-center space-y-2">
          <ShieldCheck className="h-8 w-8 text-muted-foreground mx-auto" />
          <p className="text-xs text-muted-foreground">No policies in the library yet.</p>
        </CardContent>
      </Card>
    );
  }

  const inheritingSpecials = specials.filter((s) => !s.cancellation_policy_id);

  const guardedDelete = (p: ReservationPolicy, specialCount: number, linkCount: number) => {
    if (p.is_master) return toast.error("This is the master policy — set another master first.");
    if (p.is_default) return toast.error("This is the default policy — set another default first.");
    if (linkCount > 0) return toast.error("Linked to rate plans or channels — unlink first.");
    if (specialCount > 0) return toast.error(`Used by ${specialCount} special(s) — detach them first.`);
    onDelete(p.id);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold">Policy library</h4>
            <p className="text-xs text-muted-foreground">
              {reportRange ? `Performance shown for ${reportRange}` : "All cancellation and prepayment policies"}
            </p>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">Policy</TableHead>
              <TableHead className="text-xs">Terms</TableHead>
              <TableHead className="text-xs">Applies to</TableHead>
              <TableHead className="text-xs">90-day performance</TableHead>
              <TableHead className="w-8" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {policies.map((p) => {
              const policyLinks = links.filter((l) => l.policy_id === p.id);
              const ratePlanCount = policyLinks.filter((l) => l.rate_plan_id).length;
              const channels = policyLinks.filter((l) => l.channel).map((l) => l.channel!);
              const usedBy = specials.filter((s) => s.cancellation_policy_id === p.id);
              const m = metrics[p.id];

              return (
                <TableRow key={p.id}>
                  <TableCell className="align-top">
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-medium">{p.name}</span>
                      <div className="flex flex-wrap gap-1">
                        {p.is_master && (
                          <Badge className="text-[9px] gap-1">
                            <Crown className="h-2.5 w-2.5" /> Master
                          </Badge>
                        )}
                        {p.is_default && (
                          <Badge variant="secondary" className="text-[9px] gap-1">
                            <Star className="h-2.5 w-2.5" /> Default
                          </Badge>
                        )}
                        {p.linked_master_id && (
                          <Badge variant="outline" className="text-[9px]">
                            Linked
                          </Badge>
                        )}
                        {p.source_policy_id && !p.linked_master_id && (
                          <Badge variant="outline" className="text-[9px]">
                            Copied
                          </Badge>
                        )}
                      </div>
                      {p.description && <span className="text-[10px] text-muted-foreground">{p.description}</span>}
                    </div>
                  </TableCell>

                  <TableCell className="align-top">
                    <div className="text-xs">{shortPolicyLabel(p.rule)}</div>
                    {depositLabel(p.rule) && (
                      <div className="text-[10px] text-muted-foreground">{depositLabel(p.rule)}</div>
                    )}
                  </TableCell>

                  <TableCell className="align-top">
                    <div className="text-[11px] text-muted-foreground space-y-0.5">
                      {ratePlanCount > 0 && (
                        <div>
                          {ratePlanCount} rate plan{ratePlanCount > 1 ? "s" : ""}
                        </div>
                      )}
                      {channels.length > 0 && <div>Channels: {channels.join(", ")}</div>}
                      {usedBy.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-0.5">
                          {usedBy.map((s) => (
                            <button
                              key={s.id}
                              type="button"
                              onClick={onOpenSpecials}
                              className="inline-flex items-center gap-1 rounded border px-1 py-0.5 text-[10px] hover:bg-muted"
                            >
                              <Tag className="h-2.5 w-2.5" /> {s.name}
                            </button>
                          ))}
                        </div>
                      )}
                      {p.is_master && (
                        <div>
                          Fallback for {inheritingSpecials.length} special
                          {inheritingSpecials.length === 1 ? "" : "s"} without their own terms
                        </div>
                      )}
                      {!ratePlanCount && !channels.length && !usedBy.length && !p.is_master && (
                        <div>Not linked yet</div>
                      )}
                    </div>
                  </TableCell>

                  <TableCell className="align-top">
                    {m && m.total_bookings > 0 ? (
                      <div className="text-[11px] text-muted-foreground space-y-0.5">
                        <div>{m.room_nights} room nights</div>
                        <div>R {m.revenue.toLocaleString()}</div>
                        <div>{m.cancel_rate}% cancel rate</div>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted-foreground">No bookings</span>
                    )}
                  </TableCell>

                  <TableCell className="align-top">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <MoreHorizontal className="h-3.5 w-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="text-xs">
                        <DropdownMenuItem onClick={() => onEdit(p)}>
                          <Pencil className="h-3 w-3 mr-2" /> Edit
                        </DropdownMenuItem>
                        {!p.is_master && (
                          <DropdownMenuItem onClick={() => onSetMaster(p.id)}>
                            <Crown className="h-3 w-3 mr-2" /> Set as master
                          </DropdownMenuItem>
                        )}
                        {!p.is_default && (
                          <DropdownMenuItem onClick={() => onSetDefault(p.id)}>
                            <Star className="h-3 w-3 mr-2" /> Set as default
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => onApplyToProperties(p)}>
                          <Share2 className="h-3 w-3 mr-2" /> Apply to other properties
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => onPushToLinked(p.id)}>
                          <RefreshCw className="h-3 w-3 mr-2" /> Push to linked copies
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive"
                          onClick={() => guardedDelete(p, usedBy.length, policyLinks.length)}
                        >
                          <Trash2 className="h-3 w-3 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
};
