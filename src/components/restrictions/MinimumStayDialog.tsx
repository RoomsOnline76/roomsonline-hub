/**
 * Minimum Stay Entry — one small form that covers every stay rule ROL'OS supports.
 *
 * The operator picks a date window, a minimum for the arrival days that matter
 * (typically a special-event weekend), an optional different minimum for the rest
 * of the week, an optional maximum, arrival/departure closures, an optional price
 * uplift for the stays the rule catches, and how close to arrival the rule should
 * stop applying. Rules are stored in `rolos_stay_restrictions` and read by the
 * booking offer list, so a 1-night search stops seeing plans a rule has closed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { Loader2, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const ALL = "__all__";
const NO_UPLIFT = "__none__";

/** 0 = Sunday, matching Postgres `extract(dow)` and JS `getDay()`. */
const WEEKDAYS: { value: number; label: string; long: string }[] = [
  { value: 1, label: "M", long: "Monday" },
  { value: 2, label: "T", long: "Tuesday" },
  { value: 3, label: "W", long: "Wednesday" },
  { value: 4, label: "T", long: "Thursday" },
  { value: 5, label: "F", long: "Friday" },
  { value: 6, label: "S", long: "Saturday" },
  { value: 0, label: "S", long: "Sunday" },
];

export interface StayRuleRow {
  id: string;
  label: string | null;
  start_date: string | null;
  end_date: string | null;
  min_stay: number | null;
  max_stay: number | null;
  other_days_min_stay: number | null;
  days_of_week: number[] | null;
  ignore_within_days: number | null;
  price_adjust_type: string | null;
  price_adjust_value: number | null;
  closed_to_arrival: boolean;
  closed_to_departure: boolean;
  is_active: boolean;
  room_type_id: string | null;
  rate_plan_id: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  propertyName?: string;
  /** Units the rule can be narrowed to. Empty = property-wide only. */
  units: { id: string; name: string }[];
  /** Rate plans the rule can be narrowed to. Empty = every plan. */
  ratePlans: { id: string; name: string }[];
  onSaved?: () => void;
}

const today = () => format(new Date(), "yyyy-MM-dd");

/** Plain-English summary of a saved rule, so the list reads like a sentence. */
export function describeStayRule(
  rule: StayRuleRow,
  unitName?: string,
  planName?: string,
): string {
  const parts: string[] = [];
  const days = rule.days_of_week ?? [];
  const dayLabel = days.length === 0 || days.length === 7
    ? "every arrival"
    : days.map((d) => WEEKDAYS.find((w) => w.value === d)?.long ?? "").filter(Boolean).join(", ");
  if (rule.min_stay) parts.push(`Min ${rule.min_stay}n on ${dayLabel}`);
  if (rule.other_days_min_stay) parts.push(`min ${rule.other_days_min_stay}n on other days`);
  if (rule.max_stay) parts.push(`max ${rule.max_stay}n`);
  if (rule.closed_to_arrival) parts.push("no arrivals");
  if (rule.closed_to_departure) parts.push("no departures");
  if (rule.price_adjust_type && rule.price_adjust_value) {
    parts.push(
      rule.price_adjust_type === "percent"
        ? `${rule.price_adjust_value > 0 ? "+" : ""}${rule.price_adjust_value}%`
        : `${rule.price_adjust_value > 0 ? "+" : ""}R${rule.price_adjust_value}`,
    );
  }
  if (rule.ignore_within_days) parts.push(`ignored inside ${rule.ignore_within_days}d of arrival`);
  parts.push(unitName ? unitName : "all units");
  if (planName) parts.push(planName);
  return parts.join(" · ");
}

export function MinimumStayDialog({
  open,
  onOpenChange,
  propertyId,
  propertyName,
  units,
  ratePlans,
  onSaved,
}: Props) {
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(today);
  const [minStay, setMinStay] = useState("2");
  const [otherDaysMinStay, setOtherDaysMinStay] = useState("");
  const [maxStay, setMaxStay] = useState("");
  const [days, setDays] = useState<number[]>([5, 6]);
  const [unitId, setUnitId] = useState<string>(ALL);
  const [planId, setPlanId] = useState<string>(ALL);
  const [closedToArrival, setClosedToArrival] = useState(false);
  const [closedToDeparture, setClosedToDeparture] = useState(false);
  const [upliftType, setUpliftType] = useState<string>(NO_UPLIFT);
  const [upliftValue, setUpliftValue] = useState("");
  const [ignoreWithinDays, setIgnoreWithinDays] = useState("0");
  const [label, setLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState<StayRuleRow[]>([]);
  const [loading, setLoading] = useState(false);

  const unitNameById = useMemo(
    () => Object.fromEntries(units.map((u) => [u.id, u.name])),
    [units],
  );
  const planNameById = useMemo(
    () => Object.fromEntries(ratePlans.map((p) => [p.id, p.name])),
    [ratePlans],
  );

  const loadRules = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rolos_stay_restrictions")
      .select(
        "id, label, start_date, end_date, min_stay, max_stay, other_days_min_stay, days_of_week, ignore_within_days, price_adjust_type, price_adjust_value, closed_to_arrival, closed_to_departure, is_active, room_type_id, rate_plan_id",
      )
      .eq("property_id", propertyId)
      .order("start_date", { ascending: true });
    if (error) toast.error("Could not load stay rules");
    setRules((data as unknown as StayRuleRow[]) || []);
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    if (open) void loadRules();
  }, [open, loadRules]);

  const toggleDay = useCallback((value: number) => {
    setDays((prev) => (prev.includes(value) ? prev.filter((d) => d !== value) : [...prev, value].sort()));
  }, []);

  const save = useCallback(async () => {
    const min = Number(minStay);
    if (!Number.isFinite(min) || min < 1) {
      toast.error("Enter a minimum stay of at least 1 night");
      return;
    }
    if (endDate < startDate) {
      toast.error("The end date must be on or after the start date");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("rolos_stay_restrictions").insert({
      property_id: propertyId,
      room_type_id: unitId === ALL ? null : unitId,
      rate_plan_id: planId === ALL ? null : planId,
      start_date: startDate,
      end_date: endDate,
      min_stay: min,
      max_stay: maxStay ? Number(maxStay) : null,
      other_days_min_stay: otherDaysMinStay ? Number(otherDaysMinStay) : null,
      days_of_week: days.length === 0 ? null : days,
      ignore_within_days: ignoreWithinDays ? Number(ignoreWithinDays) : null,
      price_adjust_type: upliftType === NO_UPLIFT ? null : upliftType,
      price_adjust_value: upliftType === NO_UPLIFT || !upliftValue ? null : Number(upliftValue),
      closed_to_arrival: closedToArrival,
      closed_to_departure: closedToDeparture,
      label: label.trim() || null,
      source: "manual_entry",
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Stay rule saved");
    setLabel("");
    await loadRules();
    onSaved?.();
  }, [
    minStay, maxStay, otherDaysMinStay, startDate, endDate, days, unitId, planId,
    ignoreWithinDays, upliftType, upliftValue, closedToArrival, closedToDeparture,
    label, propertyId, loadRules, onSaved,
  ]);

  const toggleRule = useCallback(async (rule: StayRuleRow) => {
    const { error } = await supabase
      .from("rolos_stay_restrictions")
      .update({ is_active: !rule.is_active })
      .eq("id", rule.id);
    if (error) { toast.error(error.message); return; }
    await loadRules();
    onSaved?.();
  }, [loadRules, onSaved]);

  const removeRule = useCallback(async (rule: StayRuleRow) => {
    const { error } = await supabase.from("rolos_stay_restrictions").delete().eq("id", rule.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Stay rule removed");
    await loadRules();
    onSaved?.();
  }, [loadRules, onSaved]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[92vh] w-[calc(100vw-1.5rem)] max-w-[min(46rem,calc(100vw-1.5rem))] flex-col gap-4 overflow-hidden p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle>Minimum Stay Entry</DialogTitle>
          <DialogDescription>
            Choose the dates the rule covers, the number of nights, and whether it applies to
            every unit or just one{propertyName ? ` at ${propertyName}` : ""}.
          </DialogDescription>
        </DialogHeader>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="stay-rule-start">Start</Label>
              <Input id="stay-rule-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stay-rule-end">End</Label>
              <Input id="stay-rule-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>A minimum stay of</span>
              <Input
                className="h-9 w-20"
                type="number"
                min={1}
                value={minStay}
                onChange={(e) => setMinStay(e.target.value)}
                aria-label="Minimum nights"
              />
              <span>nights will apply to arrivals on:</span>
            </div>
            <div className="flex flex-wrap gap-3">
              {WEEKDAYS.map((day) => (
                <label key={day.value} className="flex items-center gap-1.5 text-sm">
                  <Checkbox
                    checked={days.includes(day.value)}
                    onCheckedChange={() => toggleDay(day.value)}
                    aria-label={day.long}
                  />
                  <span className="text-muted-foreground">{day.label}</span>
                </label>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>while a stay of</span>
              <Input
                className="h-9 w-20"
                type="number"
                min={1}
                placeholder="—"
                value={otherDaysMinStay}
                onChange={(e) => setOtherDaysMinStay(e.target.value)}
                aria-label="Minimum nights on the other days"
              />
              <span>nights will apply on the other days.</span>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="stay-rule-max">Maximum stay (optional)</Label>
              <Input
                id="stay-rule-max"
                type="number"
                min={1}
                placeholder="No maximum"
                value={maxStay}
                onChange={(e) => setMaxStay(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="stay-rule-label">Rule name (optional)</Label>
              <Input
                id="stay-rule-label"
                placeholder="e.g. Easter weekend"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Applies to</Label>
              <Select value={unitId} onValueChange={setUnitId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All units</SelectItem>
                  {units.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Rate plan</Label>
              <Select value={planId} onValueChange={setPlanId}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All rate plans</SelectItem>
                  {ratePlans.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Price for stays caught by this rule</span>
              <Select value={upliftType} onValueChange={setUpliftType}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_UPLIFT}>Unchanged</SelectItem>
                  <SelectItem value="percent">Adjust by %</SelectItem>
                  <SelectItem value="amount">Adjust by amount</SelectItem>
                </SelectContent>
              </Select>
              {upliftType !== NO_UPLIFT && (
                <Input
                  className="h-9 w-24"
                  type="number"
                  value={upliftValue}
                  onChange={(e) => setUpliftValue(e.target.value)}
                  aria-label="Price adjustment"
                />
              )}
            </div>
            <div className="flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={closedToArrival} onCheckedChange={setClosedToArrival} />
                No arrivals in this window
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Switch checked={closedToDeparture} onCheckedChange={setClosedToDeparture} />
                No departures in this window
              </label>
            </div>
          </div>

          <div className="space-y-1.5 rounded-md border p-3">
            <Label htmlFor="stay-rule-ignore">Ignore rule</Label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Input
                id="stay-rule-ignore"
                className="h-9 w-20"
                type="number"
                min={0}
                value={ignoreWithinDays}
                onChange={(e) => setIgnoreWithinDays(e.target.value)}
              />
              <span>days before arrival?</span>
            </div>
            <p className="text-xs text-muted-foreground">Use zero to always apply this rule.</p>
          </div>

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold">Current rules</h3>
              {loading && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
            </div>
            {rules.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground italic">No stay rules yet.</p>
            ) : (
              <ul className="space-y-1.5">
                {rules.map((rule) => (
                  <li key={rule.id} className="flex items-start gap-2 rounded-md border p-2 text-sm">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{rule.label || "Stay rule"}</span>
                        <Badge variant="outline" className="text-[10px]">
                          {rule.start_date || "open"} → {rule.end_date || "open"}
                        </Badge>
                        {!rule.is_active && <Badge variant="secondary" className="text-[10px]">Off</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {describeStayRule(
                          rule,
                          rule.room_type_id ? unitNameById[rule.room_type_id] : undefined,
                          rule.rate_plan_id ? planNameById[rule.rate_plan_id] : undefined,
                        )}
                      </p>
                    </div>
                    <Switch checked={rule.is_active} onCheckedChange={() => void toggleRule(rule)} aria-label="Rule active" />
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => void removeRule(rule)} aria-label="Remove rule">
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
