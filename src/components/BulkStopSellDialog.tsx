import { useState, useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { syncRestrictionsToChannels } from "@/lib/restrictionSync";
import { currentBlockAttribution } from "@/lib/blockAttribution";
import { clearNights } from "@/lib/restrictionSpans";
import { format, eachDayOfInterval, getDay } from "date-fns";
import {
  PropertyScopeSelector,
  PropertyScopeValue,
  resolveTargetPropertyIds,
  useUnionRoomTypes,
} from "@/components/restrictions/PropertyScopeSelector";

interface BulkStopSellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  propertyName?: string;
  roomTypes?: { name: string; id?: string; units?: number }[];
  portfolioProperties?: { id: string; name: string }[];
  roomTypesByProperty?: Record<string, { name: string; id?: string; units?: number }[]>;
  onRuleCreated?: () => void;
}

type ApplyMode = "rooms" | "rate_plan";

export function BulkStopSellDialog({
  open,
  onOpenChange,
  propertyId,
  propertyName,
  roomTypes = [],
  portfolioProperties,
  roomTypesByProperty,
  onRuleCreated,
}: BulkStopSellDialogProps) {
  const [applyMode, setApplyMode] = useState<ApplyMode>("rooms");
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [selectedRatePlanIds, setSelectedRatePlanIds] = useState<string[]>([]);
  const [fromDate, setFromDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [isStopSell, setIsStopSell] = useState(true);
  const [blockReason, setBlockReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<PropertyScopeValue>({ mode: "single", specificIds: [] });
  const [selectedDays, setSelectedDays] = useState({
    allDays: true, sunday: true, monday: true, tuesday: true,
    wednesday: true, thursday: true, friday: true, saturday: true,
  });

  useEffect(() => {
    if (open) {
      setSelectedRoomTypes([]);
      setSelectedRatePlanIds([]);
      setIsStopSell(true);
      setBlockReason("");
      setApplyMode("rooms");
      setScope({ mode: "single", specificIds: [] });
    }
  }, [open]);

  const targetPropertyIds = useMemo(
    () => resolveTargetPropertyIds(scope, propertyId, portfolioProperties),
    [scope, propertyId, portfolioProperties],
  );
  const effectiveRoomTypes = useUnionRoomTypes(targetPropertyIds, roomTypesByProperty, roomTypes);

  // Rate plans across target properties (grouped by code so multi-property selection is one item).
  const { data: ratePlans = [] } = useQuery({
    queryKey: ["bulk-stop-sell-rate-plans", targetPropertyIds.join(",")],
    queryFn: async () => {
      if (targetPropertyIds.length === 0) return [];
      const { data } = await supabase
        .from("rolos_rate_plans")
        .select("id, name, code, property_id")
        .in("property_id", targetPropertyIds)
        .eq("is_active", true)
        .order("name");
      return (data || []) as { id: string; name: string; code: string | null; property_id: string }[];
    },
    enabled: open && applyMode === "rate_plan" && targetPropertyIds.length > 0,
  });

  // Group rate plans for display: dedupe by (code || name)
  const groupedRatePlans = useMemo(() => {
    const byKey = new Map<string, { key: string; label: string; ids: string[]; propertyCount: number }>();
    for (const p of ratePlans) {
      const key = (p.code?.trim() || p.name.trim().toLowerCase());
      const existing = byKey.get(key);
      if (existing) {
        existing.ids.push(p.id);
        existing.propertyCount += 1;
      } else {
        byKey.set(key, { key, label: p.name, ids: [p.id], propertyCount: 1 });
      }
    }
    return Array.from(byKey.values());
  }, [ratePlans]);

  const toggleDay = (day: keyof typeof selectedDays) => {
    if (day === "allDays") {
      const nv = !selectedDays.allDays;
      setSelectedDays({ allDays: nv, sunday: nv, monday: nv, tuesday: nv, wednesday: nv, thursday: nv, friday: nv, saturday: nv });
    } else {
      setSelectedDays((p) => ({ ...p, [day]: !p[day], allDays: false }));
    }
  };

  const dayOfWeekMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };

  const handleCreateRule = async () => {
    if (targetPropertyIds.length === 0) { toast.error("No property selected"); return; }
    if (applyMode === "rooms" && selectedRoomTypes.length === 0) { toast.error("Please select at least one room type"); return; }
    if (applyMode === "rate_plan" && selectedRatePlanIds.length === 0) { toast.error("Please select at least one rate plan"); return; }
    if (!fromDate || !toDate) { toast.error("Please select date range"); return; }

    setSaving(true);
    try {
      const days = Object.entries(selectedDays)
        .filter(([k, v]) => k !== "allDays" && v)
        .map(([k]) => dayOfWeekMap[k]);

      const dates = eachDayOfInterval({ start: new Date(fromDate), end: new Date(toDate) })
        .filter((d) => days.includes(getDay(d)))
        .map((d) => format(d, "yyyy-MM-dd"));

      if (dates.length === 0) { toast.error("No dates match the selected days of week"); setSaving(false); return; }

      if (applyMode === "rooms") {
        if (isStopSell) {
          const attribution = await currentBlockAttribution(blockReason);
          const records: any[] = [];
          for (const pid of targetPropertyIds) {
            for (const roomType of selectedRoomTypes) {
              for (const ds of dates) {
                records.push({ property_id: pid, room_type: roomType, date: ds, is_stop_sell: true, available_units: 0, external_system: "manual", ...attribution });
              }
            }
          }
          const { error } = await supabase
            .from("property_availability")
            .upsert(records, { onConflict: "property_id,room_type,date", ignoreDuplicates: false });
          if (error) throw error;
          toast.success(`Blocked ${dates.length} dates × ${selectedRoomTypes.length} room(s) × ${targetPropertyIds.length} propert${targetPropertyIds.length === 1 ? "y" : "ies"}`);
        } else {
          // Unblocking clears only the block itself — any min stay / max stay / lead-day rule
          // on those same nights stays exactly where it was.
          for (const pid of targetPropertyIds) {
            for (const roomType of selectedRoomTypes) {
              await clearNights(pid, roomType, dates, "block");
            }
          }
          toast.success(`Unblocked ${dates.length} dates × ${selectedRoomTypes.length} room(s) × ${targetPropertyIds.length} propert${targetPropertyIds.length === 1 ? "y" : "ies"}`);
        }
      } else {
        // Rate plan mode: expand selected grouped keys into all rate plan ids in the group
        const expandedPlanIds = new Set<string>();
        for (const key of selectedRatePlanIds) {
          const g = groupedRatePlans.find((x) => x.key === key);
          g?.ids.forEach((id) => expandedPlanIds.add(id));
        }
        const planToProperty = new Map(ratePlans.map((p) => [p.id, p.property_id]));

        if (isStopSell) {
          const { data: user } = await supabase.auth.getUser();
          const records: any[] = [];
          for (const pid of expandedPlanIds) {
            const propId = planToProperty.get(pid);
            if (!propId) continue;
            for (const ds of dates) {
              records.push({ rate_plan_id: pid, property_id: propId, date: ds, created_by: user.user?.id ?? null });
            }
          }
          const { error } = await supabase
            .from("rolos_rate_plan_stop_sell")
            .upsert(records, { onConflict: "rate_plan_id,date", ignoreDuplicates: true });
          if (error) throw error;
          toast.success(`Closed ${dates.length} date(s) × ${expandedPlanIds.size} rate plan(s)`);
        } else {
          const { error } = await supabase
            .from("rolos_rate_plan_stop_sell")
            .delete()
            .in("rate_plan_id", Array.from(expandedPlanIds))
            .in("date", dates);
          if (error) throw error;
          toast.success(`Reopened ${dates.length} date(s) × ${expandedPlanIds.size} rate plan(s)`);
        }
      }

      onRuleCreated?.();
      if (applyMode === "rooms") {
        // Rate-plan closures have no Rentals United equivalent — they stay ROL'OS/direct only.
        // Fire-and-forget: the calendar refreshes now, the channel delta follows behind.
        void syncRestrictionsToChannels(targetPropertyIds, "stop_sell", { from: fromDate, to: toDate }, {
          // A reopen has to land at the channel regardless of the availability fingerprint.
          forceAvailability: !isStopSell,
        });
      }
      onOpenChange(false);
    } catch (error: any) {
      console.error("Error creating stop sell rule:", error);
      toast.error(error.message || "Failed to create rule");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Stop Sell / Block Dates
            <Badge variant="outline" className="ml-2">Manual Mode</Badge>
          </DialogTitle>
          <DialogDescription>
            {propertyName ? `Manage availability for ${propertyName}` : "Block or unblock dates"}
          </DialogDescription>
        </DialogHeader>

        <Tabs value={applyMode} onValueChange={(v) => setApplyMode(v as ApplyMode)} className="mt-4">
          <TabsList className="grid grid-cols-2 w-full max-w-sm">
            <TabsTrigger value="rooms">Rooms</TabsTrigger>
            <TabsTrigger value="rate_plan">Rate plan (direct only)</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="grid grid-cols-12 gap-4 mt-4">
          <div className="col-span-4 border rounded-lg p-4 space-y-2 max-h-[400px] overflow-y-auto">
            {applyMode === "rooms" ? (
              <>
                <p className="text-sm font-medium mb-2">Select Rooms</p>
                {effectiveRoomTypes.length > 0 ? (
                  effectiveRoomTypes.map((room) => (
                    <div key={room.id || room.name} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                      <div className="flex items-center">
                        <Checkbox
                          id={`stopsell-${room.id || room.name}`}
                          checked={selectedRoomTypes.includes(room.name)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedRoomTypes([...selectedRoomTypes, room.name]);
                            else setSelectedRoomTypes(selectedRoomTypes.filter((n) => n !== room.name));
                          }}
                        />
                        <label htmlFor={`stopsell-${room.id || room.name}`} className="text-sm cursor-pointer ml-2">{room.name}</label>
                      </div>
                      {room.units ? (<span className="text-xs text-muted-foreground">{room.units} unit{room.units > 1 ? "s" : ""}</span>) : null}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No room types available</p>
                )}
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-2">Select Rate Plans</p>
                {groupedRatePlans.length > 0 ? (
                  groupedRatePlans.map((g) => (
                    <div key={g.key} className="flex items-center justify-between p-2 hover:bg-muted rounded">
                      <div className="flex items-center">
                        <Checkbox
                          id={`stopsell-rp-${g.key}`}
                          checked={selectedRatePlanIds.includes(g.key)}
                          onCheckedChange={(checked) => {
                            if (checked) setSelectedRatePlanIds([...selectedRatePlanIds, g.key]);
                            else setSelectedRatePlanIds(selectedRatePlanIds.filter((k) => k !== g.key));
                          }}
                        />
                        <label htmlFor={`stopsell-rp-${g.key}`} className="text-sm cursor-pointer ml-2">{g.label}</label>
                      </div>
                      {targetPropertyIds.length > 1 && (
                        <span className="text-xs text-muted-foreground">{g.propertyCount}/{targetPropertyIds.length}</span>
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No active rate plans</p>
                )}
              </>
            )}
          </div>

          <div className="col-span-8 space-y-4">
            {portfolioProperties && portfolioProperties.length > 1 && (
              <PropertyScopeSelector
                portfolioProperties={portfolioProperties}
                defaultPropertyId={propertyId}
                defaultPropertyName={propertyName}
                value={scope}
                onChange={setScope}
              />
            )}
            <div className="border rounded-lg p-6 space-y-4">
              <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
                <div>
                  <p className="font-medium">{isStopSell ? "Block Dates" : "Unblock Dates"}</p>
                  <p className="text-sm text-muted-foreground">
                    {isStopSell ? "Prevent new bookings" : "Remove blocks and restore default availability"}
                  </p>
                </div>
                <Switch checked={isStopSell} onCheckedChange={setIsStopSell} />
              </div>

              <div className="space-y-2">
                <Label>Date Range</Label>
                <div className="flex gap-4 items-center">
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="flex-1" />
                  <span className="text-muted-foreground">to</span>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="flex-1" />
                </div>
              </div>

              {isStopSell && (
                <div className="space-y-2">
                  <Label htmlFor="stopsell-reason">Reason (optional)</Label>
                  <Input
                    id="stopsell-reason"
                    value={blockReason}
                    onChange={(e) => setBlockReason(e.target.value)}
                    placeholder="e.g. Owner stay, Maintenance"
                    maxLength={120}
                  />
                  <p className="text-xs text-muted-foreground">Shown on the calendar tooltip together with your name.</p>
                </div>
              )}



              <div className="space-y-2">
                <Label>Apply to Days</Label>
                <div className="flex flex-wrap gap-3">
                  <div className="flex items-center space-x-2">
                    <Checkbox id="allDays" checked={selectedDays.allDays} onCheckedChange={() => toggleDay("allDays")} />
                    <label htmlFor="allDays" className="text-sm cursor-pointer font-medium">All days</label>
                  </div>
                  {["sunday","monday","tuesday","wednesday","thursday","friday","saturday"].map((day) => (
                    <div key={day} className="flex items-center space-x-2">
                      <Checkbox
                        id={day}
                        checked={selectedDays[day as keyof typeof selectedDays]}
                        onCheckedChange={() => toggleDay(day as keyof typeof selectedDays)}
                      />
                      <label htmlFor={day} className="text-sm cursor-pointer capitalize">{day.slice(0,3)}</label>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                <Button
                  onClick={handleCreateRule}
                  disabled={
                    saving ||
                    targetPropertyIds.length === 0 ||
                    (applyMode === "rooms" ? selectedRoomTypes.length === 0 : selectedRatePlanIds.length === 0)
                  }
                  variant={isStopSell ? "destructive" : "default"}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {isStopSell ? "Block Dates" : "Unblock Dates"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
