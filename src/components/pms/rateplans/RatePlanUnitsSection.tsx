import { memo } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import type { DifferentialType, RatePlanDraft } from "./ratePlanDraft";
import { unitFor } from "./ratePlanDraft";

interface RoomTypeOption {
  id: string;
  name: string;
}

interface Props {
  draft: RatePlanDraft;
  roomTypes: RoomTypeOption[];
  onToggle: (roomTypeId: string) => void;
  onDifferential: (roomTypeId: string, patch: { differential_type?: DifferentialType; differential_value?: string }) => void;
}

/** Linked Units — which units this plan sells, with an optional per-unit difference. */
export const RatePlanUnitsSection = memo(function RatePlanUnitsSection({
  draft,
  roomTypes,
  onToggle,
  onDifferential,
}: Props) {
  if (roomTypes.length === 0) {
    return <p className="text-sm text-muted-foreground">No units found for this property. Add units first.</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        A difference is applied on top of this plan's rates for that unit only — useful when one unit always sells above
        or below the rest.
      </p>
      <div className="divide-y rounded-md border">
        {roomTypes.map((rt) => {
          const linked = unitFor(draft, rt.id);
          return (
            <div key={rt.id} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,160px)] md:items-center">
              <label className="flex min-w-0 cursor-pointer items-center gap-2">
                <Checkbox checked={!!linked} onCheckedChange={() => onToggle(rt.id)} />
                <span className="truncate text-sm">{rt.name}</span>
              </label>

              {linked ? (
                <>
                  <ToggleGroup
                    type="single"
                    size="sm"
                    value={linked.differential_type}
                    onValueChange={(v) => v && onDifferential(rt.id, { differential_type: v as DifferentialType })}
                  >
                    <ToggleGroupItem value="none" className="text-xs">Same</ToggleGroupItem>
                    <ToggleGroupItem value="amount" className="text-xs">R</ToggleGroupItem>
                    <ToggleGroupItem value="percent" className="text-xs">%</ToggleGroupItem>
                  </ToggleGroup>
                  {linked.differential_type === "none" ? (
                    <p className="text-xs italic text-muted-foreground">Plan rate</p>
                  ) : (
                    <Input
                      type="number"
                      inputMode="decimal"
                      placeholder={linked.differential_type === "percent" ? "e.g. 10" : "e.g. 200"}
                      value={linked.differential_value}
                      onChange={(e) => onDifferential(rt.id, { differential_value: e.target.value })}
                    />
                  )}
                </>
              ) : (
                <p className="text-xs italic text-muted-foreground md:col-span-2">Not sold on this plan</p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
});
