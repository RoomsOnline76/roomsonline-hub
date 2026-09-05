import { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Minus, Plus, Sparkles, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import RUAmenityPicker from "@/components/property/RUAmenityPicker";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRuAmenityCatalogue } from "@/hooks/useRuAmenityCatalogue";
import {
  BED_TYPES,
  areBedsDistributed,
  authoredBedroomCount,
  bedRoomAmenities,
  bedRoomSlotLabel,
  calculateBedCapacity,
  flattenBedGroups,
  groupBedsByRoom,
  sleepsPerBed,
  type BedEntry,
  type BedRoomGroup,
} from "@/lib/bedConfig";

interface BedCompositionProps {
  /** Stored configuration: grouped array, legacy flat array, or a legacy string label. */
  value: BedEntry[] | string | undefined | null;
  /** Bedrooms declared on the unit — the channel compares this against authored bedrooms. */
  declaredBedrooms?: number | null;
  onChange: (config: BedEntry[]) => void;
  /** Owner corrected the declared bedroom count from the mismatch hint. */
  onDeclaredBedroomsChange?: (bedrooms: number) => void;
}

/**
 * Author beds INSIDE each bedroom.
 *
 * The channel reviews sleeping arrangements per bedroom: a multi-bedroom unit that parks
 * every bed in one room is rejected during content review even though the total capacity
 * adds up. Grouping the beds here is what lets the push emit one bedroom composition block
 * per real bedroom, and it is the same rule the readiness score enforces.
 */
export function BedComposition({
  value,
  declaredBedrooms,
  onChange,
  onDeclaredBedroomsChange,
}: BedCompositionProps) {
  const groups = useMemo(() => groupBedsByRoom(value ?? undefined), [value]);
  const capacity = useMemo(() => calculateBedCapacity(groups.flatMap((g) => g.beds)), [groups]);
  const bedroomsAuthored = useMemo(() => authoredBedroomCount(groups.flatMap((g) => g.beds)), [groups]);
  const livingCount = useMemo(() => groups.filter((g) => g.slot.kind === "living").length, [groups]);
  const distributed = useMemo(
    () => areBedsDistributed(groups.flatMap((g) => g.beds), declaredBedrooms),
    [groups, declaredBedrooms],
  );

  const commit = useCallback((next: BedRoomGroup[]) => onChange(flattenBedGroups(next)), [onChange]);

  /** Which sleeping space is having its own amenities edited. */
  const [amenityGroupIndex, setAmenityGroupIndex] = useState<number | null>(null);

  /** Channel catalogue — resolves stored amenity tokens to names for the hover list. */
  const { resolve: resolveAmenities, loading: amenitiesLoading } = useRuAmenityCatalogue();

  const setGroupAmenities = useCallback(
    (groupIndex: number, amenities: string[]) =>
      commit(
        groups.map((group, i) =>
          i === groupIndex ? { ...group, slot: { ...group.slot, amenities } } : group,
        ),
      ),
    [commit, groups],
  );

  const addGroup = useCallback(
    (kind: "bedroom" | "living") => {
      const index = groups.filter((g) => g.slot.kind === kind).length + 1;
      commit([
        ...groups,
        {
          slot: { kind, index },
          beds: [{ type: kind === "bedroom" ? "queen" : "sofa-bed", count: 1 }],
        },
      ]);
    },
    [commit, groups],
  );

  const removeGroup = useCallback(
    (groupIndex: number) => commit(groups.filter((_, i) => i !== groupIndex)),
    [commit, groups],
  );

  const updateBeds = useCallback(
    (groupIndex: number, beds: BedEntry[]) =>
      commit(groups.map((group, i) => (i === groupIndex ? { ...group, beds } : group))),
    [commit, groups],
  );

  const declared = Number(declaredBedrooms) || 0;
  const mismatch = declared >= 1 && bedroomsAuthored < declared;

  return (
    <div className="space-y-2">
      {groups.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          No beds authored yet. Add a bedroom and place its beds inside it.
        </p>
      )}

      {groups.map((group, groupIndex) => (
        <div key={`${group.slot.kind}-${group.slot.index}`} className="rounded-md border border-border/60 p-2">
          <div className="mb-1 flex items-center justify-between gap-2">
            <span className="text-[11px] font-medium">
              {bedRoomSlotLabel(group.slot, livingCount)}
              {group.slot.kind === "living" && (
                <span className="ml-1 font-normal text-muted-foreground">(not a bedroom)</span>
              )}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-destructive hover:text-destructive"
              onClick={() => removeGroup(groupIndex)}
              aria-label={`Remove ${bedRoomSlotLabel(group.slot, livingCount)}`}
            >
              <X className="h-3 w-3" />
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {group.beds.map((bed, bedIndex) => (
              <div key={bedIndex} className="flex items-center gap-1 rounded bg-muted/50 px-2 py-1">
                <Select
                  value={bed.type}
                  onValueChange={(type) =>
                    updateBeds(
                      groupIndex,
                      group.beds.map((b, i) => (i === bedIndex ? { ...b, type } : b)),
                    )
                  }
                >
                  <SelectTrigger className="h-6 w-[110px] border-0 bg-transparent text-xs">
                    <SelectValue placeholder="Bed type" />
                  </SelectTrigger>
                  <SelectContent>
                    {BED_TYPES.map((bt) => (
                      <SelectItem key={bt.value} value={bt.value}>
                        {bt.label} (sleeps {sleepsPerBed(bt.value)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  disabled={bed.count <= 1}
                  onClick={() =>
                    updateBeds(
                      groupIndex,
                      group.beds.map((b, i) => (i === bedIndex ? { ...b, count: Math.max(1, b.count - 1) } : b)),
                    )
                  }
                >
                  <Minus className="h-3 w-3" />
                </Button>
                <span className="w-4 text-center text-xs font-medium">{bed.count}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5"
                  onClick={() =>
                    updateBeds(
                      groupIndex,
                      group.beds.map((b, i) => (i === bedIndex ? { ...b, count: b.count + 1 } : b)),
                    )
                  }
                >
                  <Plus className="h-3 w-3" />
                </Button>
                <span className="whitespace-nowrap text-[10px] text-muted-foreground">
                  sleeps {sleepsPerBed(bed.type) * bed.count}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 text-destructive hover:text-destructive"
                  onClick={() => updateBeds(groupIndex, group.beds.filter((_, i) => i !== bedIndex))}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-6 text-xs"
              onClick={() =>
                updateBeds(groupIndex, [
                  ...group.beds,
                  { type: group.slot.kind === "bedroom" ? "single" : "sofa-bed", count: 1 },
                ])
              }
            >
              <Plus className="mr-1 h-3 w-3" />
              Add bed
            </Button>
          </div>

          {/* What THIS room holds — separate from the unit's amenity list. */}
          <div className="mt-2 flex flex-wrap items-center gap-1 border-t border-border/50 pt-2">
            <span className="text-[10px] text-muted-foreground">In this room:</span>
            {(() => {
              const tokens = bedRoomAmenities(group);
              const resolved = resolveAmenities(tokens);
              if (tokens.length === 0) {
                return <span className="text-[10px] text-muted-foreground">nothing added yet</span>;
              }
              return (
                <HoverCard openDelay={120} closeDelay={60}>
                  <HoverCardTrigger asChild>
                    <Badge
                      variant="secondary"
                      className="cursor-default text-[10px]"
                      title={resolved.map((a) => a.label).join(", ")}
                    >
                      {tokens.length} amenit{tokens.length === 1 ? "y" : "ies"}
                    </Badge>
                  </HoverCardTrigger>
                  <HoverCardContent align="start" className="w-64 p-2.5 space-y-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {bedRoomSlotLabel(group.slot, livingCount)} — loaded amenities
                    </p>
                    {amenitiesLoading ? (
                      <p className="text-[11px] text-muted-foreground">Loading names…</p>
                    ) : (
                      <ul className="space-y-0.5">
                        {resolved.map((a) => (
                          <li
                            key={a.raw}
                            className="flex items-center justify-between gap-2 text-[11px] leading-tight"
                          >
                            <span className={a.unmapped ? "text-muted-foreground italic" : "text-foreground"}>
                              {a.label}
                            </span>
                            {a.count > 1 && (
                              <span className="text-[10px] text-muted-foreground">×{a.count}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    )}
                  </HoverCardContent>
                </HoverCard>
              );
            })()}
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="ml-auto h-6 text-[10px]"
              onClick={() => setAmenityGroupIndex(groupIndex)}
            >
              <Sparkles className="mr-1 h-3 w-3" />
              Amenities in {bedRoomSlotLabel(group.slot, livingCount)}
            </Button>
          </div>

          {group.beds.length === 0 && (
            <p className="mt-1 flex items-center gap-1 text-[10px] text-destructive">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              Every bedroom must hold at least one bed.
            </p>
          )}
        </div>
      ))}

      <Dialog open={amenityGroupIndex !== null} onOpenChange={(open) => !open && setAmenityGroupIndex(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {amenityGroupIndex !== null && groups[amenityGroupIndex]
                ? `Amenities in ${bedRoomSlotLabel(groups[amenityGroupIndex].slot, livingCount)}`
                : "Room amenities"}
            </DialogTitle>
            <DialogDescription>
              Pick only what this room itself holds — an en-suite bathroom, air-conditioning, a TV, a safe. The
              list is already narrowed to things that belong in a sleeping space. The
              unit's own amenity list stays separate, and these travel with this room when the listing is sent out.
            </DialogDescription>
          </DialogHeader>
          {amenityGroupIndex !== null && groups[amenityGroupIndex] && (
            <div className="max-h-[65vh] overflow-y-auto pr-1">
              <RUAmenityPicker
                value={bedRoomAmenities(groups[amenityGroupIndex])}
                space={groups[amenityGroupIndex].slot.kind === "living" ? "living" : "bedroom"}
                minimum={0}
                onChange={(next) => setGroupAmenities(amenityGroupIndex, next)}
              />
            </div>
          )}
        </DialogContent>
      </Dialog>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={() => addGroup("bedroom")}>
          <Plus className="mr-1 h-3 w-3" />
          Add bedroom
        </Button>
        <Button type="button" variant="outline" size="sm" className="h-6 text-xs" onClick={() => addGroup("living")}>
          <Plus className="mr-1 h-3 w-3" />
          Add living-area sleeper
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        {bedroomsAuthored} bedroom{bedroomsAuthored !== 1 ? "s" : ""} authored · sleeping capacity{" "}
        <span className="font-medium text-foreground">
          {capacity} guest{capacity !== 1 ? "s" : ""}
        </span>
      </p>

      {mismatch && (
        <p className="flex flex-wrap items-center gap-1 text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          {declared} bedroom{declared !== 1 ? "s" : ""} declared, {bedroomsAuthored} authored — the channel needs a
          bedroom for each one.
          {onDeclaredBedroomsChange && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-4 px-1 text-[10px]"
              onClick={() => onDeclaredBedroomsChange(bedroomsAuthored)}
            >
              Declare {bedroomsAuthored}
            </Button>
          )}
        </p>
      )}

      {!distributed && !mismatch && (
        <p className="flex items-center gap-1 text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3 shrink-0" />
          Required — author the beds inside each bedroom before pushing to the channel.
        </p>
      )}
    </div>
  );
}

export default BedComposition;
