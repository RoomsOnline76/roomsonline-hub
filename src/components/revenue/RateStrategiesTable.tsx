import { useMemo, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Copy } from "lucide-react";
import { RateStrategyDialog, type RateStrategyRecord } from "./RateStrategyDialog";

const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function weekdayLabel(days: number[]): string {
  if (!days || days.length === 0) return "—";
  if (days.length === 7) return "Sun–Sat";
  return days.slice().sort().map(d => WEEKDAY_SHORT[d]).join(", ");
}

function restrictionLabel(s: RateStrategyRecord): string {
  const sign = s.adjustment_value > 0 ? "+" : "";
  if (s.adjustment_type === "percent") return `Percentage of ${sign}${Number(s.adjustment_value).toFixed(2)}`;
  return `Fixed ${sign}R${Number(s.adjustment_value).toFixed(2)}`;
}

interface Props {
  propertyId: string;
}

export function RateStrategiesTable({ propertyId }: Props) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<RateStrategyRecord> | null>(null);

  const { data: plans = [] } = useQuery({
    queryKey: ["rate-strategy-list-plans", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_rate_plans")
        .select("id, name").eq("property_id", propertyId);
      if (error) throw error;
      return data || [];
    },
  });
  const { data: rooms = [] } = useQuery({
    queryKey: ["rate-strategy-list-rooms", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_room_types")
        .select("id, name").eq("property_id", propertyId);
      if (error) throw error;
      return data || [];
    },
  });

  const planName = useMemo(() => Object.fromEntries(plans.map((p: any) => [p.id, p.name])), [plans]);
  const roomName = useMemo(() => Object.fromEntries(rooms.map((r: any) => [r.id, r.name])), [rooms]);

  const { data: rows = [], isLoading, refetch } = useQuery({
    queryKey: ["rate-strategies", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_rate_strategies" as any)
        .select("*").eq("property_id", propertyId)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as RateStrategyRecord[];
    },
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const invalidate = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["rate-strategies", propertyId] });
  }, [qc, propertyId]);

  const handleToggle = async (s: RateStrategyRecord, active: boolean) => {
    const { error } = await supabase.from("rolos_rate_strategies" as any)
      .update({ is_active: active }).eq("id", s.id!);
    if (error) return toast.error("Failed to update", { description: error.message });
    invalidate();
  };

  const handleDelete = async (s: RateStrategyRecord) => {
    if (!confirm(`Delete strategy "${s.name}"?`)) return;
    const { error } = await supabase.from("rolos_rate_strategies" as any).delete().eq("id", s.id!);
    if (error) return toast.error("Failed to delete", { description: error.message });
    toast.success("Strategy deleted");
    invalidate();
  };

  const handleDuplicate = (s: RateStrategyRecord) => {
    const { id, ...rest } = s as any;
    setEditing({ ...rest, name: `${s.name} (copy)` });
    setDialogOpen(true);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base">Rate Strategies</CardTitle>
            <CardDescription>Assign rate plans to specific weekdays, date ranges and occupancy — Protel-style strategies.</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" className="h-9 w-48" />
            <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
              <Plus className="w-4 h-4 mr-1" /> Add Rate Strategy
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>From</TableHead>
                  <TableHead>To</TableHead>
                  <TableHead>Weekday</TableHead>
                  <TableHead>Rate Plan</TableHead>
                  <TableHead>Room Type</TableHead>
                  <TableHead>Occupancy</TableHead>
                  <TableHead>Restriction</TableHead>
                  <TableHead>By Arrival</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">Loading…</TableCell></TableRow>
                ) : filtered.length === 0 ? (
                  <TableRow><TableCell colSpan={11} className="text-center text-muted-foreground py-6">No rate strategies yet. Click <b>Add Rate Strategy</b> to create one.</TableCell></TableRow>
                ) : filtered.map(s => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium">{s.name}</TableCell>
                    <TableCell>{s.start_date}</TableCell>
                    <TableCell>{s.end_date}</TableCell>
                    <TableCell className="text-xs">{weekdayLabel(s.weekdays)}</TableCell>
                    <TableCell>{s.rate_plan_id ? (planName[s.rate_plan_id] || "—") : <Badge variant="secondary">All</Badge>}</TableCell>
                    <TableCell>{s.room_type_id ? (roomName[s.room_type_id] || "—") : <Badge variant="secondary">All</Badge>}</TableCell>
                    <TableCell className="text-xs">
                      {s.min_occupancy == null && s.max_occupancy == null
                        ? "Any"
                        : `${s.min_occupancy ?? 0}–${s.max_occupancy ?? 100}%`}
                    </TableCell>
                    <TableCell className="text-xs">{restrictionLabel(s)}</TableCell>
                    <TableCell>{s.only_on_arrival ? <Badge>Yes</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                    <TableCell><Switch checked={s.is_active} onCheckedChange={c => handleToggle(s, c)} /></TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(s); setDialogOpen(true); }}><Pencil className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDuplicate(s)}><Copy className="w-4 h-4" /></Button>
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(s)}><Trash2 className="w-4 h-4 text-destructive" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <RateStrategyDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        propertyId={propertyId}
        initial={editing}
        onSaved={() => { invalidate(); refetch(); }}
      />
    </div>
  );
}
