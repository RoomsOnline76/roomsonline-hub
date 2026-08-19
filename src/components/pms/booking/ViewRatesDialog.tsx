import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { addDays, differenceInDays, format, parseISO } from "date-fns";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, RotateCcw, RefreshCw, Save } from "lucide-react";
import { cn } from "@/lib/utils";

interface NightCell {
  date: string;
  rate: string;
  isOverride: boolean;
}

interface RoomLineRates {
  bookingRoomId: string;
  label: string;
  roomTypeId: string | null;
  ratePlanId: string | null;
  nights: NightCell[];
  collapsed: boolean;
}

interface SeasonRow {
  id: string;
  rate_plan_id: string | null;
  start_date: string;
  end_date: string;
}

const money = (n: number) => (Math.round(n * 100) / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * NightsBridge-style "View Rates" panel: per-room, per-night rate overrides
 * for a booking. Rates persist in rolos_booking_room_nights.
 */
export function ViewRatesDialog({
  open,
  onOpenChange,
  bookingId,
  propertyId,
  checkIn,
  checkOut,
  rooms,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  bookingId: string;
  propertyId: string;
  checkIn: string;
  checkOut: string;
  rooms: { id: string; room_number: string; room_name: string | null }[];
  onSaved?: (bookingTotal: number) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fillRight, setFillRight] = useState(true);
  const [lines, setLines] = useState<RoomLineRates[]>([]);
  const [ratePlans, setRatePlans] = useState<{ id: string; name: string; base_rate: number | null }[]>([]);
  const [sheetId, setSheetId] = useState<string>("");

  const stayDates = useMemo(() => {
    try {
      const start = parseISO(checkIn);
      const n = Math.max(1, differenceInDays(parseISO(checkOut), start));
      return Array.from({ length: n }, (_, i) => format(addDays(start, i), "yyyy-MM-dd"));
    } catch {
      return [] as string[];
    }
  }, [checkIn, checkOut]);

  const roomLabel = useCallback(
    (roomId: string | null, roomTypeName?: string | null) => {
      const r = rooms.find(x => x.id === roomId);
      if (r) return r.room_name || `Room ${r.room_number}`;
      return roomTypeName || "Room";
    },
    [rooms]
  );

  // ── Load rate plans + booking room lines + existing nightly rates ──
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    (async () => {
      const [{ data: plans }, { data: bookingRooms }] = await Promise.all([
        supabase.from("rolos_rate_plans").select("id, name, base_rate").eq("property_id", propertyId).eq("is_active", true).order("name"),
        supabase
          .from("rolos_booking_rooms")
          .select("id, room_id, room_type_id, rate_plan_id, rate_charged, nightly_rate, rolos_room_types(name)")
          .eq("booking_id", bookingId)
          .neq("status", "cancelled"),
      ]);
      if (cancelled) return;

      const planList = (plans || []) as { id: string; name: string; base_rate: number | null }[];
      setRatePlans(planList);

      const brIds = (bookingRooms || []).map(r => r.id);
      let nightRows: { booking_room_id: string; stay_date: string; rate: number; is_override: boolean }[] = [];
      if (brIds.length) {
        const { data } = await supabase
          .from("rolos_booking_room_nights")
          .select("booking_room_id, stay_date, rate, is_override")
          .in("booking_room_id", brIds);
        nightRows = (data || []) as typeof nightRows;
      }
      if (cancelled) return;

      const built: RoomLineRates[] = (bookingRooms || []).map(br => {
        const existing = new Map(nightRows.filter(n => n.booking_room_id === br.id).map(n => [n.stay_date, n]));
        const perNightSeed =
          Number(br.nightly_rate) > 0
            ? Number(br.nightly_rate)
            : stayDates.length
              ? (Number(br.rate_charged) || 0) / stayDates.length
              : 0;
        return {
          bookingRoomId: br.id,
          label: roomLabel(br.room_id, (br as { rolos_room_types?: { name?: string } | null }).rolos_room_types?.name),
          roomTypeId: br.room_type_id || null,
          ratePlanId: br.rate_plan_id || null,
          collapsed: false,
          nights: stayDates.map(d => {
            const row = existing.get(d);
            return {
              date: d,
              rate: (row ? Number(row.rate) : Math.round(perNightSeed * 100) / 100).toFixed(2),
              isOverride: row?.is_override ?? false,
            };
          }),
        };
      });

      setLines(built);
      const firstPlan = built.find(l => l.ratePlanId)?.ratePlanId || planList[0]?.id || "";
      setSheetId(firstPlan);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [open, bookingId, propertyId, stayDates, roomLabel]);

  const setNight = (bookingRoomId: string, date: string, value: string) => {
    setLines(prev =>
      prev.map(l => {
        if (l.bookingRoomId !== bookingRoomId) return l;
        const idx = l.nights.findIndex(n => n.date === date);
        if (idx < 0) return l;
        const nights = l.nights.map((n, i) => {
          if (i === idx) return { ...n, rate: value, isOverride: true };
          if (fillRight && i > idx) return { ...n, rate: value, isOverride: true };
          return n;
        });
        return { ...l, nights };
      })
    );
  };

  /** Re-pull rates from the selected rate sheet (seasonal price → plan base rate → room type default). */
  const refreshFromSheet = async () => {
    if (!sheetId) {
      toast.error("Select a rate sheet first");
      return;
    }
    const [{ data: seasons }, { data: plan }] = await Promise.all([
      supabase.from("rolos_rate_seasons").select("id, rate_plan_id, start_date, end_date").eq("rate_plan_id", sheetId),
      supabase.from("rolos_rate_plans").select("base_rate").eq("id", sheetId).maybeSingle(),
    ]);
    const seasonRows = (seasons || []) as SeasonRow[];
    const roomTypeIds = Array.from(new Set(lines.map(l => l.roomTypeId).filter(Boolean))) as string[];
    let prices: { season_id: string; room_type_id: string; base_rate: number | null }[] = [];
    if (seasonRows.length && roomTypeIds.length) {
      const { data } = await supabase
        .from("rolos_rate_prices")
        .select("season_id, room_type_id, base_rate")
        .in("season_id", seasonRows.map(s => s.id))
        .in("room_type_id", roomTypeIds);
      prices = (data || []) as typeof prices;
    }

    const { data: types } = roomTypeIds.length
      ? await supabase.from("rolos_room_types").select("id, default_rate").in("id", roomTypeIds)
      : { data: [] as { id: string; default_rate: number | null }[] };

    const defaultRate = (rtId: string | null) =>
      Number((types || []).find(t => t.id === rtId)?.default_rate) || Number(plan?.base_rate) || 0;

    setLines(prev =>
      prev.map(l => ({
        ...l,
        ratePlanId: sheetId,
        nights: l.nights.map(n => {
          const season = seasonRows.find(s => n.date >= s.start_date && n.date <= s.end_date);
          const price = season ? prices.find(p => p.season_id === season.id && p.room_type_id === l.roomTypeId) : undefined;
          const resolved = price?.base_rate != null && Number(price.base_rate) > 0
            ? Number(price.base_rate)
            : Number(plan?.base_rate) > 0
              ? Number(plan?.base_rate)
              : defaultRate(l.roomTypeId);
          return { date: n.date, rate: resolved.toFixed(2), isOverride: false };
        }),
      }))
    );
    toast.success("Rates refreshed from rate sheet");
  };

  const resetLine = (bookingRoomId: string) =>
    setLines(prev => prev.map(l => (l.bookingRoomId === bookingRoomId ? { ...l, nights: l.nights.map(n => ({ ...n, isOverride: false })) } : l)));

  const lineTotal = (l: RoomLineRates) => l.nights.reduce((s, n) => s + (parseFloat(n.rate) || 0), 0);
  const bookingTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  const handleSave = async () => {
    setSaving(true);
    try {
      const rows = lines.flatMap(l =>
        l.nights.map(n => ({
          booking_id: bookingId,
          booking_room_id: l.bookingRoomId,
          property_id: propertyId,
          stay_date: n.date,
          rate: parseFloat(n.rate) || 0,
          rate_plan_id: l.ratePlanId || sheetId || null,
          is_override: n.isOverride,
        }))
      );

      if (rows.length) {
        const { error } = await supabase
          .from("rolos_booking_room_nights")
          .upsert(rows as never, { onConflict: "booking_room_id,stay_date" });
        if (error) throw error;
      }

      // Keep the room line totals + booking total in sync.
      for (const l of lines) {
        const total = lineTotal(l);
        await supabase
          .from("rolos_booking_rooms")
          .update({
            rate_charged: Math.round(total * 100) / 100,
            nightly_rate: l.nights.length ? Math.round((total / l.nights.length) * 100) / 100 : null,
            rate_plan_id: l.ratePlanId || sheetId || null,
          } as never)
          .eq("id", l.bookingRoomId);
      }

      const { error: bErr } = await supabase
        .from("bookings")
        .update({ total_price: Math.round(bookingTotal * 100) / 100 } as never)
        .eq("id", bookingId);
      if (bErr) throw bErr;

      toast.success("Rates saved");
      onSaved?.(Math.round(bookingTotal * 100) / 100);
      onOpenChange(false);
    } catch (e) {
      toast.error("Failed to save rates: " + (e instanceof Error ? e.message : "unknown error"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] flex flex-col p-0 gap-0">
        <DialogHeader className="px-5 py-4 border-b border-border">
          <DialogTitle className="text-base">View Rates</DialogTitle>
        </DialogHeader>

        <div className="px-5 py-3 border-b border-border flex flex-wrap items-end gap-3">
          <div className="min-w-[200px] flex-1">
            <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Rate Sheet</Label>
            <Select value={sheetId} onValueChange={setSheetId}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select rate sheet" /></SelectTrigger>
              <SelectContent>
                {ratePlans.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button variant="secondary" className="h-9" onClick={refreshFromSheet} disabled={loading}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />Refresh
          </Button>
          <label className="flex items-center gap-2 h-9 text-sm cursor-pointer select-none">
            <Checkbox checked={fillRight} onCheckedChange={v => setFillRight(!!v)} />
            Fill to the right
          </label>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-2">
          {loading ? (
            <p className="py-8 text-sm text-muted-foreground text-center">Loading rates…</p>
          ) : lines.length === 0 ? (
            <p className="py-8 text-sm text-muted-foreground text-center">
              This booking has no room lines yet. Add a room in the booking record first.
            </p>
          ) : (
            lines.map(l => (
              <div key={l.bookingRoomId} className="border-b border-border py-3 last:border-b-0">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{l.label}</p>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground mr-1">{money(lineTotal(l))}</span>
                    {l.nights.some(n => n.isOverride) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" title="Clear override marks" onClick={() => resetLine(l.bookingRoomId)}>
                        <RotateCcw className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 rounded-full"
                      onClick={() => setLines(prev => prev.map(x => (x.bookingRoomId === l.bookingRoomId ? { ...x, collapsed: !x.collapsed } : x)))}
                    >
                      {l.collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
                    </Button>
                  </div>
                </div>

                {!l.collapsed && (
                  <div className="mt-2 grid gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {l.nights.map(n => (
                      <div key={n.date}>
                        <Label className="text-[11px] text-muted-foreground">{format(parseISO(n.date), "EEE d MMM")}</Label>
                        <Input
                          className={cn("h-9", n.isOverride && "border-primary ring-1 ring-primary/40")}
                          type="number"
                          min={0}
                          step="0.01"
                          value={n.rate}
                          onChange={e => setNight(l.bookingRoomId, n.date, e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        <DialogFooter className="px-5 py-3 border-t border-border flex-row items-center justify-between sm:justify-between">
          <div>
            <p className="text-[11px] text-muted-foreground">Booking Total</p>
            <p className="text-lg font-semibold">{money(bookingTotal)}</p>
          </div>
          <Button onClick={handleSave} disabled={saving || loading || lines.length === 0}>
            <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
