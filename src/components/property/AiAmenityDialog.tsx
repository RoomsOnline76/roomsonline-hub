import { useCallback, useMemo, useState } from "react";
import { Loader2, Sparkles, Globe, Check, Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ruToken, ruTokenId } from "@/lib/ruAmenities";

interface Suggestion {
  id: number;
  name: string;
  confidence: "high" | "medium" | "low" | string;
  /** Where the supporting evidence came from. */
  evidence?: "image" | "website" | "record" | string;
  reason: string;
}

interface UnitSuggestion {
  unit_id: string;
  unit_name: string;
  amenities: Suggestion[];
}

interface SuggestResult {
  success: boolean;
  used_website: boolean;
  website_url: string | null;
  summary: string;
  used_images?: boolean;
  images_analysed?: number;
  visual_features?: string[];
  property: Suggestion[];
  units: UnitSuggestion[];
  error?: string;
}

interface AiAmenityDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  websiteUrl?: string;
  /** Current property-level facility tokens/labels. */
  currentPropertyFacilities?: string[];
  /** Called with the merged property facility list when the user accepts. */
  onApplyProperty?: (next: string[]) => void;
  /**
   * Single-unit mode: the dialog only reviews this room/unit and hands the merged
   * amenity list back to the form (no direct database write), so the Rooms tab
   * behaves exactly like the property facilities check.
   */
  unitScope?: {
    unitId: string;
    unitName: string;
    current: string[];
    onApply: (next: string[]) => void;
  };
}


const EvidenceBadge = ({ evidence }: { evidence?: string }) =>
  evidence === "image" ? (
    <Badge variant="outline" className="text-[10px] gap-1 border-primary/30 text-primary">
      <Camera className="h-2.5 w-2.5" /> seen in photos
    </Badge>
  ) : null;

const confidenceTone = (confidence: string) =>
  confidence === "high"
    ? "bg-primary/15 text-primary border-primary/30"
    : confidence === "medium"
      ? "bg-amber-500/15 text-amber-600 border-amber-500/30 dark:text-amber-400"
      : "bg-muted text-muted-foreground border-border";

export default function AiAmenityDialog({
  open,
  onOpenChange,
  propertyId,
  websiteUrl,
  currentPropertyFacilities,
  onApplyProperty,
  unitScope,
}: AiAmenityDialogProps) {
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<SuggestResult | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Set<number>>(new Set());
  const [selectedUnits, setSelectedUnits] = useState<Record<string, Set<number>>>({});

  const propertyFacilities = useMemo(() => currentPropertyFacilities ?? [], [currentPropertyFacilities]);

  const existingPropertyIds = useMemo(
    () =>
      new Set(
        propertyFacilities
          .map((token) => ruTokenId(token))
          .filter((id): id is number => id !== null),
      ),
    [propertyFacilities],
  );

  /** In single-unit mode only that unit's block is shown and applied. */
  const scopedUnits = useMemo(() => {
    if (!result) return [];
    if (!unitScope) return result.units;
    const match =
      result.units.find((u) => String(u.unit_id) === String(unitScope.unitId)) ??
      result.units.find(
        (u) => u.unit_name?.trim().toLowerCase() === unitScope.unitName?.trim().toLowerCase(),
      );
    return match ? [match] : [];
  }, [result, unitScope]);

  const existingUnitIds = useMemo(
    () =>
      new Set(
        (unitScope?.current ?? [])
          .map((token) => ruTokenId(token))
          .filter((id): id is number => id !== null),
      ),
    [unitScope?.current],
  );

  const runCheck = useCallback(async () => {
    setLoading(true);
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ai-amenity-suggester", {
        body: { property_id: propertyId, website_url: websiteUrl || undefined },
      });
      if (error) throw error;
      const payload = data as SuggestResult;
      if (!payload?.success) throw new Error(payload?.error || "TOBI check failed");

      setResult(payload);
      setSelectedProperty(
        unitScope
          ? new Set()
          : new Set(
              payload.property
                .filter((s) => s.confidence !== "low" && !existingPropertyIds.has(s.id))
                .map((s) => s.id),
            ),
      );
      setSelectedUnits(
        Object.fromEntries(
          payload.units.map((u) => [
            u.unit_id,
            new Set(
              u.amenities
                .filter((a) => a.confidence !== "low")
                .filter((a) => !(unitScope && existingUnitIds.has(a.id)))
                .map((a) => a.id),
            ),
          ]),
        ),
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "TOBI amenity check failed");
    } finally {
      setLoading(false);
    }
  }, [propertyId, websiteUrl, existingPropertyIds, existingUnitIds, unitScope]);


  const toggleProperty = (id: number) =>
    setSelectedProperty((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const toggleUnit = (unitId: string, id: number) =>
    setSelectedUnits((prev) => {
      const next = new Set(prev[unitId] ?? []);
      next.has(id) ? next.delete(id) : next.add(id);
      return { ...prev, [unitId]: next };
    });

  const totalSelected =
    selectedProperty.size +
    Object.values(selectedUnits).reduce((sum, set) => sum + set.size, 0);

  const applyAll = async () => {
    if (!result) return;
    setApplying(true);
    try {
      // Property-level facilities — merge tokens, keep everything already chosen.
      if (selectedProperty.size > 0) {
        const merged = [...currentPropertyFacilities];
        selectedProperty.forEach((id) => {
          if (!existingPropertyIds.has(id)) merged.push(ruToken(id));
        });
        onApplyProperty(merged);
      }

      // Unit-level amenities — write straight to the room types.
      const unitUpdates = result.units.filter((u) => (selectedUnits[u.unit_id]?.size ?? 0) > 0);
      if (unitUpdates.length > 0) {
        const { data: rows, error: fetchError } = await supabase
          .from("hostfully_room_types")
          .select("id, amenities")
          .in(
            "id",
            unitUpdates.map((u) => u.unit_id),
          );
        if (fetchError) throw fetchError;

        for (const unit of unitUpdates) {
          const existing = ((rows || []).find((r) => String(r.id) === unit.unit_id)?.amenities ??
            []) as string[];
          const existingIds = new Set(
            existing.map((t) => ruTokenId(t)).filter((id): id is number => id !== null),
          );
          const additions = [...(selectedUnits[unit.unit_id] ?? [])]
            .filter((id) => !existingIds.has(id))
            .map((id) => ruToken(id));
          if (additions.length === 0) continue;

          const { error: updateError } = await supabase
            .from("hostfully_room_types")
            .update({ amenities: [...existing, ...additions] })
            .eq("id", unit.unit_id);
          if (updateError) throw updateError;
        }
      }

      toast.success(
        `Applied ${totalSelected} amenit${totalSelected === 1 ? "y" : "ies"}. Save the property to persist facility changes.`,
      );
      onOpenChange(false);
      setResult(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not apply amenities");
    } finally {
      setApplying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            TOBI amenity &amp; facility check
          </DialogTitle>
          <DialogDescription className="text-xs">
            TOBI reviews the property website, the property photos and the ROLOS record for this property and its units, then
            proposes matching channel amenities. Nothing is saved until you approve the selection.
          </DialogDescription>
        </DialogHeader>

        {!result && (
          <div className="py-6 text-center space-y-3">
            <p className="text-xs text-muted-foreground">
              {websiteUrl ? (
                <span className="inline-flex items-center gap-1">
                  <Globe className="h-3 w-3" /> {websiteUrl}
                </span>
              ) : (
                "No property website captured — the check will use the ROLOS record and the property photos."
              )}
            </p>
            <Button size="sm" className="h-8 text-xs" onClick={runCheck} disabled={loading}>
              {loading ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Reviewing property…
                </>
              ) : (
                <>
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Run TOBI check
                </>
              )}
            </Button>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{result.summary}</p>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant="outline" className="text-[10px]">
                  {result.used_website ? "Website reviewed" : "ROLOS data only"}
                </Badge>
                {result.used_images && (
                  <Badge variant="outline" className="text-[10px] gap-1">
                    <Camera className="h-2.5 w-2.5" />
                    {result.images_analysed ?? 0} photo{(result.images_analysed ?? 0) === 1 ? "" : "s"} analysed
                  </Badge>
                )}
              </div>
            </div>

            <ScrollArea className="h-[420px] pr-3">
              <div className="space-y-4">
                <div>
                  <h4 className="text-xs font-semibold mb-2">
                    Property amenities &amp; facilities ({result.property.length})
                  </h4>
                  {result.property.length === 0 && (
                    <p className="text-xs text-muted-foreground">No property-level suggestions.</p>
                  )}
                  <div className="space-y-1.5">
                    {result.property.map((s) => {
                      const already = existingPropertyIds.has(s.id);
                      return (
                        <div key={s.id} className="flex items-start gap-2">
                          <Checkbox
                            id={`prop-${s.id}`}
                            className="h-3.5 w-3.5 mt-0.5"
                            checked={selectedProperty.has(s.id)}
                            disabled={already}
                            onCheckedChange={() => toggleProperty(s.id)}
                          />
                          <Label
                            htmlFor={`prop-${s.id}`}
                            className="text-xs cursor-pointer leading-snug flex-1"
                          >
                            {s.name}
                            <span className="ml-2 text-[10px] text-muted-foreground">{s.reason}</span>
                          </Label>
                          <EvidenceBadge evidence={s.evidence} />
                          {already ? (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              <Check className="h-2.5 w-2.5" /> selected
                            </Badge>
                          ) : (
                            <Badge
                              variant="outline"
                              className={`text-[10px] ${confidenceTone(s.confidence)}`}
                            >
                              {s.confidence}
                            </Badge>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {result.units.map((unit) => (
                  <div key={unit.unit_id}>
                    <Separator className="mb-3" />
                    <h4 className="text-xs font-semibold mb-2">
                      {unit.unit_name} ({unit.amenities.length})
                    </h4>
                    <div className="space-y-1.5">
                      {unit.amenities.map((a) => (
                        <div key={`${unit.unit_id}-${a.id}`} className="flex items-start gap-2">
                          <Checkbox
                            id={`unit-${unit.unit_id}-${a.id}`}
                            className="h-3.5 w-3.5 mt-0.5"
                            checked={selectedUnits[unit.unit_id]?.has(a.id) ?? false}
                            onCheckedChange={() => toggleUnit(unit.unit_id, a.id)}
                          />
                          <Label
                            htmlFor={`unit-${unit.unit_id}-${a.id}`}
                            className="text-xs cursor-pointer leading-snug flex-1"
                          >
                            {a.name}
                            <span className="ml-2 text-[10px] text-muted-foreground">{a.reason}</span>
                          </Label>
                          <EvidenceBadge evidence={a.evidence} />
                          <Badge
                            variant="outline"
                            className={`text-[10px] ${confidenceTone(a.confidence)}`}
                          >
                            {a.confidence}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter className="gap-2">
          {result && (
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={runCheck}
              disabled={loading || applying}
            >
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Re-run check"}
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() => onOpenChange(false)}
            disabled={applying}
          >
            Cancel
          </Button>
          {result && (
            <Button
              size="sm"
              className="h-7 text-xs"
              onClick={applyAll}
              disabled={applying || totalSelected === 0}
            >
              {applying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                `Accept ${totalSelected} selected`
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
