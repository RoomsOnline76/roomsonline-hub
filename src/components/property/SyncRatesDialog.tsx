import React, { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Loader2 } from "lucide-react";

interface SyncRatesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "rate-types" | "seasons";
  currentPropertyId: string;
  /** Current property's amenities (source of truth) */
  currentAmenities: any;
}

interface TargetProperty {
  id: string;
  name: string;
  group: string; // "owner" or portfolio name
}

export function SyncRatesDialog({
  open,
  onOpenChange,
  mode,
  currentPropertyId,
  currentAmenities,
}: SyncRatesDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [syncing, setSyncing] = useState(false);

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ["sync-targets", currentPropertyId],
    enabled: open,
    queryFn: async () => {
      // 1. Get current property's owner_email
      const { data: current } = await supabase
        .from("properties")
        .select("owner_email")
        .eq("id", currentPropertyId)
        .single();

      const results: TargetProperty[] = [];
      const seenIds = new Set<string>([currentPropertyId]);

      // 2. Same owner properties
      if (current?.owner_email) {
        const { data: ownerProps } = await supabase
          .from("properties")
          .select("id, name")
          .eq("owner_email", current.owner_email)
          .eq("is_active", true)
          .neq("id", currentPropertyId);

        (ownerProps || []).forEach((p) => {
          if (!seenIds.has(p.id)) {
            seenIds.add(p.id);
            results.push({ id: p.id, name: p.name, group: "Same Owner" });
          }
        });
      }

      // 3. Portfolio siblings
      const { data: memberships } = await supabase
        .from("property_portfolio_members" as any)
        .select("portfolio_id")
        .eq("property_id", currentPropertyId);

      if (memberships && memberships.length > 0) {
        const portfolioIds = (memberships as any[]).map((m: any) => m.portfolio_id);

        const { data: portfolios } = await supabase
          .from("property_portfolios" as any)
          .select("id, name")
          .in("id", portfolioIds);

        const portfolioNameMap: Record<string, string> = {};
        (portfolios as any[] || []).forEach((p: any) => {
          portfolioNameMap[p.id] = p.name;
        });

        for (const pid of portfolioIds) {
          const { data: members } = await supabase
            .from("property_portfolio_members" as any)
            .select("property_id")
            .eq("portfolio_id", pid);

          if (members) {
            const propIds = (members as any[]).map((m: any) => m.property_id).filter(
              (id: string) => !seenIds.has(id)
            );

            if (propIds.length > 0) {
              const { data: props } = await supabase
                .from("properties")
                .select("id, name")
                .in("id", propIds)
                .eq("is_active", true);

              (props || []).forEach((p) => {
                seenIds.add(p.id);
                results.push({
                  id: p.id,
                  name: p.name,
                  group: `Portfolio: ${portfolioNameMap[pid] || pid}`,
                });
              });
            }
          }
        }
      }

      return results;
    },
  });

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === targets.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(targets.map((t) => t.id)));
    }
  };

  const handleSync = async () => {
    if (selected.size === 0) return;
    setSyncing(true);

    try {
      const targetIds = Array.from(selected);

      // Fetch all target properties' amenities
      const { data: targetProps, error } = await supabase
        .from("properties")
        .select("id, amenities")
        .in("id", targetIds);

      if (error) throw error;

      let successCount = 0;
      const errors: string[] = [];

      for (const target of targetProps || []) {
        const amenities = (target.amenities as any) || {};

        if (mode === "rate-types") {
          const sourceRateTypes: any[] = currentAmenities?.rate_types || [];
          if (sourceRateTypes.length === 0) {
            toast.warning("No rate types to sync from this property");
            setSyncing(false);
            return;
          }
          // Target may store rate types as pms_rate_types or rate_types
          const existingRateTypes: any[] = amenities.pms_rate_types || amenities.rate_types || [];

          const merged = [...existingRateTypes];
          for (const src of sourceRateTypes) {
            const existingIdx = merged.findIndex(
              (e) => e.name?.toLowerCase() === src.name?.toLowerCase()
            );
            if (existingIdx >= 0) {
              if (merged[existingIdx].pms_synced) continue;
              merged[existingIdx] = { ...merged[existingIdx], ...src, id: merged[existingIdx].id };
            } else {
              merged.push({ ...src, id: `manual-rate-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, pms_synced: false });
            }
          }

          // Write to the same key the target uses, defaulting to pms_rate_types
          if (amenities.pms_rate_types) {
            amenities.pms_rate_types = merged;
          } else {
            amenities.pms_rate_types = merged;
          }
        } else {
          // Seasons sync
          const sourceSeasons: any[] = currentAmenities?.seasons || [];
          if (sourceSeasons.length === 0) {
            toast.warning("No seasons to sync from this property");
            setSyncing(false);
            return;
          }
          const existingSeasons: any[] = amenities.seasons || [];

          const merged = [...existingSeasons];
          for (const src of sourceSeasons) {
            const existingIdx = merged.findIndex(
              (e) => e.name?.toLowerCase() === src.name?.toLowerCase()
            );
            if (existingIdx >= 0) {
              merged[existingIdx] = {
                ...merged[existingIdx],
                periods: src.periods,
                from: src.from,
                to: src.to,
                color: src.color,
                minStay: src.minStay,
                maxStay: src.maxStay,
              };
            } else {
              merged.push({
                ...src,
                id: crypto.randomUUID(),
              });
            }
          }

          amenities.seasons = merged;
        }

        const { error: updateError } = await supabase
          .from("properties")
          .update({ amenities })
          .eq("id", target.id);

        if (updateError) {
          console.error(`Failed to sync to ${target.id}:`, updateError);
          errors.push(target.id);
        } else {
          successCount++;
        }
      }

      toast.success(`Synced ${mode === "rate-types" ? "rate types" : "seasons"} to ${selected.size} ${selected.size === 1 ? "property" : "properties"}`);
      onOpenChange(false);
      setSelected(new Set());
    } catch (err: any) {
      console.error("Sync error:", err);
      toast.error("Sync failed: " + (err.message || "Unknown error"));
    } finally {
      setSyncing(false);
    }
  };

  // Group targets
  const grouped = targets.reduce<Record<string, TargetProperty[]>>((acc, t) => {
    (acc[t.group] = acc[t.group] || []).push(t);
    return acc;
  }, {});

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Copy className="h-4 w-4" />
            Sync {mode === "rate-types" ? "Rate Types" : "Seasons"} to Other Properties
          </DialogTitle>
          <DialogDescription>
            {mode === "rate-types"
              ? "Copy rate type definitions to selected properties. PMS-synced rate types on target properties will not be overwritten."
              : "Copy season definitions (dates, names, colors, stay rules) to selected properties. Room-specific rates are NOT copied."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 max-h-[50vh] overflow-y-auto py-2">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : targets.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              No other properties found for this owner or portfolio.
            </p>
          ) : (
            <>
              {Object.entries(grouped).map(([group, props]) => (
                <div key={group} className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {group}
                  </p>
                  {props.map((p) => (
                    <label
                      key={p.id}
                      className="flex items-center gap-3 p-2 rounded-md hover:bg-muted/50 cursor-pointer"
                    >
                      <Checkbox
                        checked={selected.has(p.id)}
                        onCheckedChange={() => toggleSelect(p.id)}
                      />
                      <span className="text-sm">{p.name}</span>
                    </label>
                  ))}
                </div>
              ))}

              <label className="flex items-center gap-3 pt-2 border-t cursor-pointer">
                <Checkbox
                  checked={selected.size === targets.length && targets.length > 0}
                  onCheckedChange={selectAll}
                />
                <span className="text-sm font-medium">Select All</span>
              </label>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSync} disabled={selected.size === 0 || syncing}>
            {syncing && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
            Sync to {selected.size} {selected.size === 1 ? "Property" : "Properties"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
