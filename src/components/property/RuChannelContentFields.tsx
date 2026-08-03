import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Property-level Floor and Space (size in m²).
 *
 * Rentals United requires Floor and Space on every pushed property. Both are
 * normally authored per unit type (Rooms tab); these property-level values are
 * the fallback used when a unit type does not carry them, so the push never
 * silently invents "ground floor, 50 m²".
 */
interface RuChannelContentFieldsProps {
  floor: number | null;
  onFloorChange: (v: number | null) => void;
  sizeSqm: number | null;
  onSizeChange: (v: number | null) => void;
  disabled?: boolean;
}

export const RuChannelContentFields: React.FC<RuChannelContentFieldsProps> = ({
  floor,
  onFloorChange,
  sizeSqm,
  onSizeChange,
  disabled,
}) => (
  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
    <div className="space-y-1">
      <Label className="text-xs">
        Floor <span className="text-primary">*</span>
      </Label>
      <Select
        value={floor === null || floor === undefined ? "none" : String(floor)}
        onValueChange={(v) => onFloorChange(v === "none" ? null : parseInt(v))}
        disabled={disabled}
      >
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select floor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">Not specified</SelectItem>
          <SelectItem value="-1">-1 — Basement</SelectItem>
          <SelectItem value="0">0 — Ground floor (street level)</SelectItem>
          <SelectItem value="1">1 — 1st floor</SelectItem>
          <SelectItem value="2">2 — 2nd floor</SelectItem>
          <SelectItem value="3">3 — 3rd floor</SelectItem>
          <SelectItem value="4">4 — 4th floor</SelectItem>
          <SelectItem value="5">5 — 5th floor or higher</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-[10px] text-muted-foreground">
        Used for channel pushes when a unit type has no floor of its own.
      </p>
    </div>

    <div className="space-y-1">
      <Label className="text-xs">
        Property size (m²) <span className="text-primary">*</span>
      </Label>
      <Input
        type="number"
        min={1}
        className="h-8 text-xs"
        value={sizeSqm ?? ""}
        placeholder="e.g. 85"
        disabled={disabled}
        onChange={(e) => onSizeChange(e.target.value ? Number(e.target.value) : null)}
      />
      <p className="text-[10px] text-muted-foreground">
        Fallback for Rentals United "Space". Room-level sizes in the Rooms tab take priority.
      </p>
    </div>
  </div>
);
