import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Property-level Floor + Size (m²) — fallback channel content for Push_PutProperty_RQ.
 *
 * Resolution order in push-property-to-ru:
 *   unit room_size / unit floor → amenities.property_size_sqm / amenities.property_floor → default (50 / 0)
 * Defaults are flagged so the readiness scorecard shows amber until the owner confirms real values.
 */
interface RuPropertySpaceFloorFieldsProps {
  /** Current amenities JSONB from formData.amenities */
  amenities: Record<string, unknown> | null | undefined;
  onChange: (nextAmenities: Record<string, unknown>) => void;
  disabled?: boolean;
}

export function RuPropertySpaceFloorFields({
  amenities,
  onChange,
  disabled,
}: RuPropertySpaceFloorFieldsProps) {
  const a = amenities ?? {};
  const floor = a.property_floor;
  const size = a.property_size_sqm;

  const patch = (key: "property_floor" | "property_size_sqm", raw: string) => {
    const next = { ...a };
    if (raw === "") {
      delete next[key];
    } else {
      const n = Number(raw);
      if (Number.isFinite(n)) next[key] = n;
    }
    onChange(next);
  };

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3" data-field="property_space_floor">
      <div className="flex flex-col gap-1">
        <Label htmlFor="property_floor" className="text-xs">
          Floor
        </Label>
        <Input
          id="property_floor"
          type="number"
          step={1}
          value={floor === undefined || floor === null ? "" : String(floor)}
          onChange={(e) => patch("property_floor", e.target.value)}
          placeholder="0 = ground"
          disabled={disabled}
          className="h-7 text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          Used when a unit has no floor. RU default is ground (0).
        </p>
      </div>
      <div className="flex flex-col gap-1">
        <Label htmlFor="property_size_sqm" className="text-xs">
          Size (m²)
        </Label>
        <Input
          id="property_size_sqm"
          type="number"
          step={1}
          min={1}
          value={size === undefined || size === null ? "" : String(size)}
          onChange={(e) => patch("property_size_sqm", e.target.value)}
          placeholder="e.g. 85"
          disabled={disabled}
          className="h-7 text-xs"
        />
        <p className="text-[10px] text-muted-foreground">
          Used when a unit has no room size. RU default is 50 m².
        </p>
      </div>
    </div>
  );
}
