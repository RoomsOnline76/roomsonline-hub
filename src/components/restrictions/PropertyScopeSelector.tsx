import { useMemo } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";

export type ScopeMode = "single" | "all" | "specific";

export interface PropertyScopeValue {
  mode: ScopeMode;
  specificIds: string[];
}

interface PortfolioProperty {
  id: string;
  name: string;
}

interface PropertyScopeSelectorProps {
  portfolioProperties: PortfolioProperty[];
  defaultPropertyId?: string;
  defaultPropertyName?: string;
  value: PropertyScopeValue;
  onChange: (v: PropertyScopeValue) => void;
}

export function PropertyScopeSelector({
  portfolioProperties,
  defaultPropertyId,
  defaultPropertyName,
  value,
  onChange,
}: PropertyScopeSelectorProps) {
  if (!portfolioProperties || portfolioProperties.length <= 1) return null;

  const toggleId = (id: string, checked: boolean) => {
    const next = checked
      ? Array.from(new Set([...value.specificIds, id]))
      : value.specificIds.filter((x) => x !== id);
    onChange({ mode: "specific", specificIds: next });
  };

  const allSelected =
    value.mode === "specific" && value.specificIds.length === portfolioProperties.length;

  return (
    <div className="border rounded-lg p-4 space-y-3 bg-muted/30">
      <div className="flex items-center gap-2">
        <Label className="font-medium">Apply to</Label>
        <Badge variant="secondary" className="text-[10px]">Portfolio</Badge>
      </div>
      <RadioGroup
        value={value.mode}
        onValueChange={(v) => onChange({ mode: v as ScopeMode, specificIds: value.specificIds })}
        className="space-y-2"
      >
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="single" id="scope-single" />
          <label htmlFor="scope-single" className="text-sm cursor-pointer">
            This property only{defaultPropertyName ? ` (${defaultPropertyName})` : ""}
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="all" id="scope-all" />
          <label htmlFor="scope-all" className="text-sm cursor-pointer">
            All properties in portfolio ({portfolioProperties.length})
          </label>
        </div>
        <div className="flex items-center space-x-2">
          <RadioGroupItem value="specific" id="scope-specific" />
          <label htmlFor="scope-specific" className="text-sm cursor-pointer">
            Select specific properties
          </label>
        </div>
      </RadioGroup>

      {value.mode === "specific" && (
        <div className="space-y-1 pl-6 border-l-2 border-border">
          <div className="flex items-center space-x-2 pb-1">
            <Checkbox
              id="scope-select-all"
              checked={allSelected}
              onCheckedChange={(checked) => {
                onChange({
                  mode: "specific",
                  specificIds: checked ? portfolioProperties.map((p) => p.id) : [],
                });
              }}
            />
            <label htmlFor="scope-select-all" className="text-xs cursor-pointer font-medium">
              Select all
            </label>
          </div>
          <div className="max-h-32 overflow-y-auto space-y-1">
            {portfolioProperties.map((p) => (
              <div key={p.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`scope-${p.id}`}
                  checked={value.specificIds.includes(p.id)}
                  onCheckedChange={(checked) => toggleId(p.id, Boolean(checked))}
                />
                <label htmlFor={`scope-${p.id}`} className="text-xs cursor-pointer">
                  {p.name}
                </label>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function resolveTargetPropertyIds(
  scope: PropertyScopeValue,
  defaultPropertyId: string | undefined,
  portfolioProperties: PortfolioProperty[] | undefined,
): string[] {
  if (!portfolioProperties || portfolioProperties.length <= 1) {
    return defaultPropertyId ? [defaultPropertyId] : [];
  }
  if (scope.mode === "all") return portfolioProperties.map((p) => p.id);
  if (scope.mode === "specific") return scope.specificIds;
  return defaultPropertyId ? [defaultPropertyId] : [];
}

export function useUnionRoomTypes(
  targetPropertyIds: string[],
  roomTypesByProperty: Record<string, { name: string; id?: string; units?: number }[]> | undefined,
  fallback: { name: string; id?: string; units?: number }[],
) {
  return useMemo(() => {
    if (!roomTypesByProperty || targetPropertyIds.length === 0) return fallback;
    const byName = new Map<string, { name: string; id?: string; units?: number; propertyCount: number }>();
    for (const pid of targetPropertyIds) {
      const list = roomTypesByProperty[pid] || [];
      for (const r of list) {
        const key = r.name.trim().toLowerCase();
        if (!key) continue;
        const existing = byName.get(key);
        if (existing) {
          existing.propertyCount += 1;
          existing.units = (existing.units || 0) + (r.units || 0);
        } else {
          byName.set(key, { name: r.name, id: r.id, units: r.units, propertyCount: 1 });
        }
      }
    }
    return Array.from(byName.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [targetPropertyIds, roomTypesByProperty, fallback]);
}
