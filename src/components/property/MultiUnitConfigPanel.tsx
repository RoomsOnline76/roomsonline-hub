import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Plus, ChevronDown, Trash2, Building2 } from "lucide-react";

export interface MultiUnitConfig {
  enabled: boolean;
  default_mode: string;
}

export interface UnitMapping {
  unit_id: string;
  unit_name: string;
  external_id: string;
}

interface RoomTypeWithUnits {
  id: string;
  name: string;
  assignment_mode: string;
  units: UnitMapping[];
}

interface MultiUnitConfigPanelProps {
  config: MultiUnitConfig;
  roomTypes: RoomTypeWithUnits[];
  onConfigChange: (config: MultiUnitConfig) => void;
  onRoomTypesChange: (roomTypes: RoomTypeWithUnits[]) => void;
  onDirty: () => void;
}

const ASSIGNMENT_MODES = [
  { value: "none", label: "None", description: "No auto-assignment" },
  { value: "round_robin", label: "Round Robin", description: "Rotate through units evenly" },
  { value: "lowest_occupancy", label: "Lowest Occupancy", description: "Assign to least-used unit" },
  { value: "manual", label: "Manual", description: "Staff assigns at check-in" },
];

export function MultiUnitConfigPanel({
  config,
  roomTypes,
  onConfigChange,
  onRoomTypesChange,
  onDirty,
}: MultiUnitConfigPanelProps) {
  const [newUnitName, setNewUnitName] = useState<Record<string, string>>({});

  const updateRoomType = (index: number, updates: Partial<RoomTypeWithUnits>) => {
    const updated = roomTypes.map((rt, i) => (i === index ? { ...rt, ...updates } : rt));
    onRoomTypesChange(updated);
    onDirty();
  };

  const addUnit = (rtIndex: number) => {
    const name = newUnitName[roomTypes[rtIndex].id]?.trim();
    if (!name) return;
    const rt = roomTypes[rtIndex];
    const unit: UnitMapping = {
      unit_id: `unit-${Date.now()}`,
      unit_name: name,
      external_id: "",
    };
    updateRoomType(rtIndex, { units: [...rt.units, unit] });
    setNewUnitName({ ...newUnitName, [rt.id]: "" });
  };

  const removeUnit = (rtIndex: number, unitIndex: number) => {
    const rt = roomTypes[rtIndex];
    updateRoomType(rtIndex, { units: rt.units.filter((_, i) => i !== unitIndex) });
  };

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Multi-Unit Auto-Assignment
          </CardTitle>
          <Badge variant={config.enabled ? "default" : "secondary"} className="text-[10px]">
            {config.enabled ? "Enabled" : "Disabled"}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Enable hotel-style auto-assignment for room types with multiple physical units. The system will automatically assign specific units at booking time.
        </p>
      </CardHeader>
      <CardContent className="py-3 px-4 space-y-4">
        {/* Master toggle */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-sm font-medium">Enable Multi-Unit Mode</Label>
            <p className="text-xs text-muted-foreground">
              When enabled, bookings will auto-assign specific units based on the selected algorithm
            </p>
          </div>
          <Switch
            checked={config.enabled}
            onCheckedChange={(v) => {
              onConfigChange({ ...config, enabled: v });
              onDirty();
            }}
          />
        </div>

        {config.enabled && (
          <>
            {/* Default assignment mode */}
            <div className="space-y-1">
              <Label className="text-xs">Default Assignment Mode</Label>
              <Select
                value={config.default_mode}
                onValueChange={(v) => {
                  onConfigChange({ ...config, default_mode: v });
                  onDirty();
                }}
              >
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ASSIGNMENT_MODES.map((mode) => (
                    <SelectItem key={mode.value} value={mode.value}>
                      <span className="text-xs">{mode.label}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Per room-type config */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Room Type Units</Label>
              {roomTypes.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">
                  No room types configured. Add room types to define physical units.
                </p>
              ) : (
                roomTypes.map((rt, rtIdx) => (
                  <Collapsible key={rt.id}>
                    <div className="border border-border rounded-lg">
                      <CollapsibleTrigger className="w-full flex items-center justify-between p-2.5 hover:bg-muted/50 transition-colors">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{rt.name}</span>
                          <Badge variant="outline" className="text-[10px]">
                            {rt.units.length} unit{rt.units.length !== 1 ? "s" : ""}
                          </Badge>
                        </div>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-2.5 pb-2.5 space-y-2 border-t border-border pt-2">
                          {/* Assignment mode per room type */}
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">
                              Assignment Mode
                            </Label>
                            <Select
                              value={rt.assignment_mode}
                              onValueChange={(v) => updateRoomType(rtIdx, { assignment_mode: v })}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ASSIGNMENT_MODES.map((mode) => (
                                  <SelectItem key={mode.value} value={mode.value}>
                                    <span className="text-xs">
                                      {mode.label} — {mode.description}
                                    </span>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {/* Units list */}
                          {rt.units.map((unit, uIdx) => (
                            <div key={unit.unit_id} className="flex gap-2 items-center">
                              <Input
                                value={unit.unit_name}
                                onChange={(e) => {
                                  const units = rt.units.map((u, i) =>
                                    i === uIdx ? { ...u, unit_name: e.target.value } : u
                                  );
                                  updateRoomType(rtIdx, { units });
                                }}
                                className="text-xs h-7 flex-1"
                                placeholder="Unit name (e.g. Room 101)"
                              />
                              <Input
                                value={unit.external_id}
                                onChange={(e) => {
                                  const units = rt.units.map((u, i) =>
                                    i === uIdx ? { ...u, external_id: e.target.value } : u
                                  );
                                  updateRoomType(rtIdx, { units });
                                }}
                                className="text-xs h-7 w-32"
                                placeholder="External ID"
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-destructive"
                                onClick={() => removeUnit(rtIdx, uIdx)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          ))}

                          {/* Add unit */}
                          <div className="flex gap-2">
                            <Input
                              value={newUnitName[rt.id] || ""}
                              onChange={(e) =>
                                setNewUnitName({ ...newUnitName, [rt.id]: e.target.value })
                              }
                              placeholder="New unit name"
                              className="text-xs h-7"
                              onKeyDown={(e) => e.key === "Enter" && addUnit(rtIdx)}
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => addUnit(rtIdx)}
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Add Unit
                            </Button>
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                ))
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
