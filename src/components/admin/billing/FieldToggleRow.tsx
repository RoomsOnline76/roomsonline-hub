import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

interface FieldToggleRowProps {
  label: string;
  /** Current value (null / undefined / 0 → collapsed). */
  value: string;
  onChange: (v: string) => void;
  /** Suggested value when the user first enables the field. */
  suggested?: number | string | null;
  /** e.g. "%", " ZAR", " ZAR/mo" — appended to the label after "Enable". */
  unit?: string;
  step?: string;
  min?: string;
  max?: string;
  hint?: string;
  /** Force the field open even when the value is empty (used when a paired flag is on). */
  forceOpen?: boolean;
}

/**
 * Row that shows a switch when the value is empty/0. Flipping the switch
 * reveals an Input pre-filled with the suggested default. Switching off
 * clears the value.
 */
export function FieldToggleRow({
  label,
  value,
  onChange,
  suggested,
  unit = "",
  step = "0.5",
  min = "0",
  max,
  hint,
  forceOpen,
}: FieldToggleRowProps) {
  const numeric = useMemo(() => parseFloat(value), [value]);
  const enabled = forceOpen || (value !== "" && !Number.isNaN(numeric) && numeric > 0);

  const toggle = (on: boolean) => {
    if (on) {
      onChange(suggested != null ? String(suggested) : "");
    } else {
      onChange("");
    }
  };

  if (!enabled) {
    return (
      <div className="flex items-center justify-between gap-3 py-1.5 border-b border-dashed last:border-0">
        <div className="min-w-0">
          <Label className="text-xs">Enable {label}{unit ? ` (${unit.trim()})` : ""}</Label>
          {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
        </div>
        <Switch checked={false} onCheckedChange={toggle} />
      </div>
    );
  }

  return (
    <div className="space-y-1 py-1.5 border-b border-dashed last:border-0">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-xs">{label}{unit ? ` (${unit.trim()})` : ""}</Label>
        <Switch checked onCheckedChange={toggle} />
      </div>
      <Input
        type="number"
        step={step}
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 text-sm"
        placeholder={suggested != null ? String(suggested) : "0"}
      />
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}
