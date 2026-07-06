import { useState, useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, eachDayOfInterval, getDay } from "date-fns";
import {
  PropertyScopeSelector,
  PropertyScopeValue,
  resolveTargetPropertyIds,
} from "@/components/restrictions/PropertyScopeSelector";

interface RatePlanStopSellDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId?: string;
  propertyName?: string;
  ratePlanId: string;
  ratePlanName: string;
  ratePlanCode?: string | null;
  portfolioProperties?: { id: string; name: string }[];
  onSaved?: () => void;
}

interface StopSellRow {
  id: string;
  date: string;
  rate_plan_id: string;
  property_id: string;
}

export function RatePlanStopSellDialog({
  open,
  onOpenChange,
  propertyId,
  propertyName,
  ratePlanId,
  ratePlanName,
  ratePlanCode,
  portfolioProperties,
  onSaved,
}: RatePlanStopSellDialogProps) {
  const queryClient = useQueryClient();
  const [fromDate, setFromDate] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [toDate, setToDate] = useState(() => format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), "yyyy-MM-dd"));
  const [isStopSell, setIsStopSell] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState<PropertyScopeValue>({ mode: "single", specificIds: [] });
  const [selectedDays, setSelectedDays] = useState({
    allDays: true, sunday: true, monday: true, tuesday: true,
    wednesday: true, thursday: true, friday: true, saturday: true,
  });

  useEffect(() => {
    if (open) {
      setIsStopSell(true);
      setScope({ mode: "single", specificIds: [] });
    }
  }, [open]);

  const targetPropertyIds = useMemo(
    () => resolveTargetPropertyIds(scope, propertyId, portfolioProperties),
    [scope, propertyId, portfolioProperties],
  );

  // Resolve target rate-plan IDs by matching on `code` across target properties.
  const { data: targetRatePlanIds = [] } = useQuery({
    queryKey: ["rate-plan-stop-sell-targets", ratePlanId, ratePlanCode, targetPropertyIds.join(",")],
    queryFn: async () => {
      if (targetPropertyIds.length === 0) return [];
      if (targetPropertyIds.length === 1 && targetPropertyIds[0] === propertyId) {
        return [ratePlanId];
      }
      if (!ratePlanCode) return [ratePlanId];
      const { data } = await supabase
        .from("rolos_rate_plans")
        .select("id")
        .in("property_id", targetPropertyIds)
        .eq("code", ratePlanCode)
        .eq("is_active", true);
      const ids = (data || []).map((r) => r.id);
      return ids.length > 0 ? ids : [ratePlanId];
    },
    enabled: open && targetPropertyIds.length > 0,
  });

  // Existing closures
  const { data: closures = [], refetch: refetchClosures } = useQuery({
    queryKey: ["rate-plan-stop-sell-list", ratePlanId],
    queryFn: async () => {
      const { data } = await supabase
        .from("rolos_rate_plan_stop_sell")
        .select("id, date, rate_plan_id, property_id")
        .eq("rate_plan_id", ratePlanId)
        .order("date", { ascending: true });
      return (data || []) as StopSellRow[];
    },
    enabled: open,
  });

  const dayOfWeekMap: Record<string, number> = {
    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
  };

  const toggleDay = (day: keyof typeof selectedDays) => {
    if (day === "allDays") {
      const nv = !selectedDays.allDays;
      setSelectedDays({ allDays: nv, sunday: nv, monday: nv, tuesday: nv, wednesday: nv, thursday: nv, friday: nv, saturday: nv });
    } else {
      setSelectedDays((p) => ({ ...p, [day]: !p[day], allDays: false }));
    }
  };

  const removeClosure = async (id: string) => {
    const { error } = await supabase.from("rolos_rate_plan_stop_sell").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Closure removed");
    refetchClosures();
    onSaved?.();
    queryClient.invalidateQueries({ queryKey: ["rate-plan-stop-sell"] });
  };

  const handleSave = async () => {
    if (targetPropertyIds.length === 0) return toast.error("No property selected");
    if (targetRatePlanIds.length === 0) return toast.error("No rate plans matched across selected properties");
    if (!fromDate || !toDate) return toast.error("Please select a date range");

    setSaving(true);
    try {
      const days = Object.entries(selectedDays)
        .filter(([k, v]) => k !== "allDays" && v)
        .map(([k]) => dayOfWeekMap[k]);

      const dates = eachDayOfInterval({ start: new Date(fromDate), end: new Date(toDate) })
        .filter((d) => days.includes(getDay(d)))
        .map((d) => format(d, "yyyy-MM-dd"));

      if (dates.length === 0) { toast.error("No dates match the selected days"); setSaving(false); return; }

      // Map plan id -> property id
      const { data: planRows } = await supabase
        .from("rolos_rate_plans")
        .select("id, property_id")
        .in("id", targetRatePlanIds);
      const planToProperty = new Map((planRows || []).map((p) => [p.id, p.property_id as string]));

      if (isStopSell) {
        const { data: user } = await supabase.auth.getUser();
        const records = [];
        for (const pid of targetRatePlanIds) {
          const propId = planToProperty.get(pid);
          if (!propId) continue;
          for (const d of dates) {
            records.push({ rate_plan_id: pid, property_id: propId, date: d, created_by: user.user?.id ?? null });
          }
        }
        const { error } = await supabase
          .from("rolos_rate_plan_stop_sell")
          .upsert(records, { onConflict: "rate_plan_id,date", ignoreDuplicates: true });
        if (error) throw error;
        toast.success(`Closed ${dates.length} date(s) × ${targetRatePlanIds.length} rate plan(s)`);
      } else {
        const { error } = await supabase
          .from("rolos_rate_plan_stop_sell")
          .delete()
          .in("rate_plan_id", targetRatePlanIds)
          .in("date", dates);
        if (error) throw error;
        toast.success(`Reopened ${dates.length} date(s) × ${targetRatePlanIds.length} rate plan(s)`);
      }

      refetchClosures();
      queryClient.invalidateQueries({ queryKey: ["rate-plan-stop-sell"] });
      onSaved?.();
      onOpenChange(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Stop Sell — Rate Plan
            <Badge variant="outline" className="ml-2">{ratePlanName}</Badge>
          </DialogTitle>
          <DialogDescription>
            Close or reopen this rate plan on specific dates.
            {propertyName ? ` Property: ${propertyName}.` : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {portfolioProperties && portfolioProperties.length > 1 && (
            <PropertyScopeSelector
              portfolioProperties={portfolioProperties}
              defaultPropertyId={propertyId}
              defaultPropertyName={propertyName}
              value={scope}
              onChange={setScope}
            />
          )}
          {portfolioProperties && portfolioProperties.length > 1 && !ratePlanCode && scope.mode !== "single" && (
            <p className="text-xs text-amber-600">
              This rate plan has no shared code; multi-property scope will fall back to this plan only.
            </p>
          )}

          <div className="border rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg">
              <div>
                <p className="font-medium">{isStopSell ? "Close rate plan" : "Reopen rate plan"}</p>
                <p className="text-sm text-muted-foreground">
                  {isStopSell ? "Block bookings on this rate plan" : "Remove closures and restore availability"}
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

            <div className="space-y-2">
              <Label>Apply to Days</Label>
              <div className="flex flex-wrap gap-3">
                <div className="flex items-center space-x-2">
                  <Checkbox id="rp-allDays" checked={selectedDays.allDays} onCheckedChange={() => toggleDay("allDays")} />
                  <label htmlFor="rp-allDays" className="text-sm cursor-pointer font-medium">All days</label>
                </div>
                {["sunday","monday","tuesday","wednesday","thursday","friday","saturday"].map((day) => (
                  <div key={day} className="flex items-center space-x-2">
                    <Checkbox
                      id={`rp-${day}`}
                      checked={selectedDays[day as keyof typeof selectedDays]}
                      onCheckedChange={() => toggleDay(day as keyof typeof selectedDays)}
                    />
                    <label htmlFor={`rp-${day}`} className="text-sm cursor-pointer capitalize">{day.slice(0,3)}</label>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving} variant={isStopSell ? "destructive" : "default"}>
                {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {isStopSell ? "Close Dates" : "Reopen Dates"}
              </Button>
            </div>
          </div>

          {closures.length > 0 && (
            <div className="border rounded-lg p-4">
              <p className="text-sm font-medium mb-2">Current closures ({closures.length})</p>
              <div className="flex flex-wrap gap-2 max-h-40 overflow-y-auto">
                {closures.map((c) => (
                  <Badge key={c.id} variant="secondary" className="flex items-center gap-1 pr-1">
                    {c.date}
                    <button
                      onClick={() => removeClosure(c.id)}
                      className="ml-1 hover:bg-destructive/20 rounded-sm p-0.5"
                      aria-label={`Remove ${c.date}`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
