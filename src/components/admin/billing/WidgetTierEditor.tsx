import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Plus, Save, Trash2, TrendingDown } from "lucide-react";
import { toast } from "sonner";

interface WidgetTier {
  min_bookings: number;
  commission_rate: number;
}

const DEFAULT_WIDGET_TIERS: WidgetTier[] = [
  { min_bookings: 0, commission_rate: 10 },
  { min_bookings: 20, commission_rate: 8 },
  { min_bookings: 50, commission_rate: 6 },
  { min_bookings: 100, commission_rate: 5 },
];

function parseTiers(value: string | null | undefined): WidgetTier[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return [];
    return Object.entries(parsed)
      .map(([k, v]) => ({ min_bookings: Number(k), commission_rate: Number(v) }))
      .filter((t) => Number.isFinite(t.min_bookings) && Number.isFinite(t.commission_rate))
      .sort((a, b) => a.min_bookings - b.min_bookings);
  } catch {
    return [];
  }
}

function serializeTiers(tiers: WidgetTier[]): string {
  const obj: Record<string, number> = {};
  for (const t of tiers) obj[String(t.min_bookings)] = t.commission_rate;
  return JSON.stringify(obj);
}

export function WidgetTierEditor() {
  const [tiers, setTiers] = useState<WidgetTier[]>([]);
  const [rowId, setRowId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("billing_mappings")
        .select("id, value")
        .eq("strategy", "widget")
        .eq("field", "tier_threshold")
        .maybeSingle();
      const parsed = parseTiers(data?.value);
      setTiers(parsed.length ? parsed : DEFAULT_WIDGET_TIERS);
      setRowId(data?.id ?? null);
      setLoading(false);
    })();
  }, []);

  const updateTier = (idx: number, patch: Partial<WidgetTier>) => {
    setTiers((prev) => prev.map((t, i) => (i === idx ? { ...t, ...patch } : t)));
  };
  const addTier = () => {
    const last = tiers[tiers.length - 1];
    setTiers((prev) => [...prev, { min_bookings: (last?.min_bookings ?? 0) + 10, commission_rate: last?.commission_rate ?? 5 }]);
  };
  const removeTier = (idx: number) => setTiers((prev) => prev.filter((_, i) => i !== idx));

  const save = async () => {
    setSaving(true);
    const value = serializeTiers([...tiers].sort((a, b) => a.min_bookings - b.min_bookings));
    const payload = {
      strategy: "widget" as const,
      field: "tier_threshold",
      value,
      description: "Monthly bookings threshold → commission rate %",
    };
    const { error } = rowId
      ? await supabase.from("billing_mappings").update(payload).eq("id", rowId)
      : await supabase.from("billing_mappings").insert(payload).select("id").single().then(async (r) => {
          if (r.data?.id) setRowId(r.data.id);
          return { error: r.error };
        });
    setSaving(false);
    if (error) toast.error(`Save failed: ${error.message}`);
    else toast.success("Widget tiers saved");
  };

  if (loading) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-2"><Loader2 className="h-3 w-3 animate-spin" /> Loading tiers…</div>;
  }

  return (
    <div className="border-t pt-3 mt-2">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
          <TrendingDown className="h-3.5 w-3.5" />
          Monthly booking volume tiers
        </p>
        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={addTier}>
          <Plus className="h-3 w-3 mr-1" /> Add tier
        </Button>
      </div>
      <p className="text-[10px] text-muted-foreground mb-2 px-1">
        When the property reaches the min bookings this month, the commission drops to the paired rate.
      </p>
      <div className="space-y-1.5">
        <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 text-[10px] font-medium text-muted-foreground px-1">
          <span>Min bookings / mo</span><span>Commission %</span><span />
        </div>
        {tiers.map((t, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-center">
            <Input type="number" min="0" value={t.min_bookings} onChange={(e) => updateTier(i, { min_bookings: parseInt(e.target.value) || 0 })} className="h-7 text-xs" />
            <Input type="number" min="0" step="0.5" value={t.commission_rate} onChange={(e) => updateTier(i, { commission_rate: parseFloat(e.target.value) || 0 })} className="h-7 text-xs" />
            <Button type="button" variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-destructive" onClick={() => removeTier(i)}>
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
        ))}
        {tiers.length === 0 && (
          <p className="text-[10px] text-muted-foreground italic px-1">No tiers — flat commission rate above will apply.</p>
        )}
      </div>
      <Button onClick={save} disabled={saving} size="sm" variant="outline" className="w-full mt-2">
        {saving ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Save className="h-3 w-3 mr-1" />}
        Save widget tiers
      </Button>
    </div>
  );
}
