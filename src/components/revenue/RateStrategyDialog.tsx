import { useEffect, useMemo, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

export interface RateStrategyRecord {
  id?: string;
  property_id: string;
  name: string;
  rate_plan_id: string | null;
  room_type_id: string | null;
  season_id: string | null;
  start_date: string;
  end_date: string;
  weekdays: number[];
  min_occupancy: number | null;
  max_occupancy: number | null;
  adjustment_type: "percent" | "fixed";
  adjustment_value: number;
  only_on_arrival: boolean;
  booking_window_from: string | null;
  booking_window_to: string | null;
  priority: number;
  is_active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  propertyId: string;
  initial?: Partial<RateStrategyRecord> | null;
  onSaved?: () => void;
}

const WEEKDAYS: { key: number; label: string }[] = [
  { key: 0, label: "Su" }, { key: 1, label: "Mo" }, { key: 2, label: "Tu" },
  { key: 3, label: "We" }, { key: 4, label: "Th" }, { key: 5, label: "Fr" }, { key: 6, label: "Sa" },
];

const EMPTY = (propertyId: string): RateStrategyRecord => ({
  property_id: propertyId,
  name: "",
  rate_plan_id: null,
  room_type_id: null,
  season_id: null,
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date().toISOString().slice(0, 10),
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  min_occupancy: null,
  max_occupancy: null,
  adjustment_type: "percent",
  adjustment_value: 0,
  only_on_arrival: false,
  booking_window_from: null,
  booking_window_to: null,
  priority: 10,
  is_active: true,
});

export function RateStrategyDialog({ open, onOpenChange, propertyId, initial, onSaved }: Props) {
  const [form, setForm] = useState<RateStrategyRecord>(() => ({ ...EMPTY(propertyId), ...(initial || {}) }));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ ...EMPTY(propertyId), ...(initial || {}) });
  }, [open, initial, propertyId]);

  const { data: plans = [] } = useQuery({
    queryKey: ["rate-strategies-plans", propertyId],
    enabled: !!propertyId && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_rate_plans")
        .select("id, name, code").eq("property_id", propertyId).order("name");
      if (error) throw error;
      return data || [];
    },
  });
  const { data: roomTypes = [] } = useQuery({
    queryKey: ["rate-strategies-room-types", propertyId],
    enabled: !!propertyId && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_room_types")
        .select("id, name").eq("property_id", propertyId).order("name");
      if (error) throw error;
      return data || [];
    },
  });
  const { data: seasons = [] } = useQuery({
    queryKey: ["rate-strategies-seasons", propertyId],
    enabled: !!propertyId && open,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_rate_seasons" as any)
        .select("id, name, start_date, end_date").eq("property_id", propertyId).order("start_date");
      if (error) throw error;
      return (data || []) as any[];
    },
  });

  const toggleDay = useCallback((day: number, checked: boolean) => {
    setForm(f => ({
      ...f,
      weekdays: checked ? Array.from(new Set([...f.weekdays, day])).sort() : f.weekdays.filter(d => d !== day),
    }));
  }, []);

  const applySeason = useCallback((seasonId: string) => {
    const s = seasons.find(x => x.id === seasonId);
    if (!s) return setForm(f => ({ ...f, season_id: null }));
    setForm(f => ({ ...f, season_id: seasonId, start_date: s.start_date, end_date: s.end_date }));
  }, [seasons]);

  const canSave = useMemo(() => form.name.trim().length > 0 && form.start_date <= form.end_date, [form]);

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload: any = { ...form };
      if (payload.rate_plan_id === "" || payload.rate_plan_id === "__all__") payload.rate_plan_id = null;
      if (payload.room_type_id === "" || payload.room_type_id === "__all__") payload.room_type_id = null;
      if (payload.season_id === "" || payload.season_id === "__none__") payload.season_id = null;

      const table = supabase.from("rolos_rate_strategies" as any);
      const { error } = payload.id
        ? await (table as any).update(payload).eq("id", payload.id)
        : await (table as any).insert(payload);
      if (error) throw error;
      toast.success(payload.id ? "Rate strategy updated" : "Rate strategy created");
      onSaved?.();
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Failed to save strategy", { description: err?.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>{form.id ? "Edit Rate Strategy" : "Add Rate Strategy"}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* INFO + SEASONAL AVAILABILITY */}
          <div className="space-y-4">
            <div>
              <p className="text-xs font-semibold text-primary mb-2">Info</p>
              <Label className="text-xs">Name</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Weekend Premium" />
            </div>
            <Separator />
            <div>
              <p className="text-xs font-semibold text-primary mb-2">Seasonal Availability</p>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} />
                </div>
              </div>
              {seasons.length > 0 && (
                <div className="mt-2">
                  <Label className="text-xs">Load from season (optional)</Label>
                  <Select value={form.season_id ?? "__none__"} onValueChange={applySeason}>
                    <SelectTrigger><SelectValue placeholder="Select season" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">— None —</SelectItem>
                      {seasons.map(s => (
                        <SelectItem key={s.id} value={s.id}>{s.name} ({s.start_date} → {s.end_date})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </div>

          {/* SCOPES */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-primary">Scopes</p>
            <div>
              <Label className="text-xs">Rate Plan</Label>
              <Select value={form.rate_plan_id ?? "__all__"} onValueChange={v => setForm(f => ({ ...f, rate_plan_id: v === "__all__" ? null : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All rate plans</SelectItem>
                  {plans.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}{p.code ? ` (${p.code})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Room type</Label>
              <Select value={form.room_type_id ?? "__all__"} onValueChange={v => setForm(f => ({ ...f, room_type_id: v === "__all__" ? null : v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">All room types</SelectItem>
                  {roomTypes.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Min occupancy %</Label>
                <Input type="number" min={0} max={100} value={form.min_occupancy ?? ""} onChange={e => setForm(f => ({ ...f, min_occupancy: e.target.value === "" ? null : Number(e.target.value) }))} placeholder="Any" />
              </div>
              <div>
                <Label className="text-xs">Max occupancy %</Label>
                <Input type="number" min={0} max={100} value={form.max_occupancy ?? ""} onChange={e => setForm(f => ({ ...f, max_occupancy: e.target.value === "" ? null : Number(e.target.value) }))} placeholder="Any" />
              </div>
            </div>
          </div>

          {/* AVAILABILITY */}
          <div className="space-y-3">
            <p className="text-xs font-semibold text-primary">Availability</p>
            <div>
              <Label className="text-xs mb-1 block">Days of week</Label>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map(d => (
                  <label key={d.key} className="flex flex-col items-center gap-1 text-xs">
                    <span>{d.label}</span>
                    <Checkbox checked={form.weekdays.includes(d.key)} onCheckedChange={c => toggleDay(d.key, Boolean(c))} />
                  </label>
                ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="rs-arrival" checked={form.only_on_arrival} onCheckedChange={c => setForm(f => ({ ...f, only_on_arrival: Boolean(c) }))} />
              <Label htmlFor="rs-arrival" className="text-xs">Only on arrival</Label>
            </div>
            <div>
              <Label className="text-xs">Only if booking date is</Label>
              <div className="grid grid-cols-2 gap-2">
                <Input type="date" value={form.booking_window_from ?? ""} onChange={e => setForm(f => ({ ...f, booking_window_from: e.target.value || null }))} />
                <Input type="date" value={form.booking_window_to ?? ""} onChange={e => setForm(f => ({ ...f, booking_window_to: e.target.value || null }))} />
              </div>
            </div>
          </div>
        </div>

        <Separator />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-2">
            <p className="text-xs font-semibold text-primary">Strategy</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Type</Label>
                <Select value={form.adjustment_type} onValueChange={v => setForm(f => ({ ...f, adjustment_type: v as "percent" | "fixed" }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percent">Percentage %</SelectItem>
                    <SelectItem value="fixed">Fixed amount</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs">Value (+/−)</Label>
                <Input type="number" step="0.01" value={form.adjustment_value} onChange={e => setForm(f => ({ ...f, adjustment_value: Number(e.target.value) }))} />
              </div>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Priority (lower first)</Label>
            <Input type="number" value={form.priority} onChange={e => setForm(f => ({ ...f, priority: Number(e.target.value) }))} />
          </div>
          <div className="flex items-end gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={form.is_active} onCheckedChange={c => setForm(f => ({ ...f, is_active: c }))} />
              <Label className="text-xs">Active</Label>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || saving}>{saving ? "Saving…" : (form.id ? "Save changes" : "Create strategy")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
