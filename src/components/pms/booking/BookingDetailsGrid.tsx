import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO, differenceInDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BedDouble, Plus, Trash2, Save, User, Receipt, StickyNote } from "lucide-react";

export interface BookingDetailsGridBooking {
  id: string;
  guest_name: string;
  guest_email: string;
  guest_phone?: string | null;
  guest_company?: string | null;
  second_guest_name?: string | null;
  booking_made_by?: string | null;
  internal_notes?: string | null;
  deposit_amount?: number | null;
  payment_reference?: string | null;
  check_in_date: string;
  check_out_date: string;
  adults: number;
  children?: number | null;
  teens?: number | null;
  infants?: number | null;
  pets?: number | null;
  total_price: number;
  status: string;
  payment_status?: string | null;
  payment_method?: string | null;
  special_requests?: string | null;
  booking_channel?: string | null;
  rolos_room_ids?: string[] | null;
  created_at?: string | null;
}

interface RoomOption {
  id: string;
  room_number: string;
  room_name: string | null;
  room_type_id: string | null;
  status: string;
}

interface RatePlanOption {
  id: string;
  name: string;
  base_rate?: number | null;
}

interface RoomLineRow {
  id?: string;
  key: string;
  room_id: string;
  room_type_id: string;
  rate_plan_id: string;
  adults: string;
  children: string;
  teens: string;
  infants: string;
  rate_charged: string;
}

const money = (n: number) => `R${(Math.round(n * 100) / 100).toLocaleString()}`;

let seq = 0;
const blankLine = (): RoomLineRow => ({
  key: `new-${++seq}`,
  room_id: "",
  room_type_id: "",
  rate_plan_id: "",
  adults: "1",
  children: "0",
  teens: "0",
  infants: "0",
  rate_charged: "0",
});

/**
 * NightsBridge-style three-column booking record:
 * Guest Details · Booking Notes · Account.
 */
export function BookingDetailsGrid({
  booking,
  rooms,
  ratePlans = [],
  onSaved,
  onOpenFolio,
  onOpenInvoice,
}: {
  booking: BookingDetailsGridBooking;
  rooms: RoomOption[];
  ratePlans?: RatePlanOption[];
  onSaved: () => void;
  onOpenFolio?: () => void;
  onOpenInvoice?: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [lines, setLines] = useState<RoomLineRow[]>([]);
  const [linesLoaded, setLinesLoaded] = useState(false);
  const [account, setAccount] = useState({ extras: 0, payments: 0 });

  const [form, setForm] = useState({
    guest_name: booking.guest_name || "",
    guest_email: booking.guest_email || "",
    guest_phone: booking.guest_phone || "",
    guest_company: booking.guest_company || "",
    second_guest_name: booking.second_guest_name || "",
    booking_made_by: booking.booking_made_by || "",
    payment_reference: booking.payment_reference || "",
    internal_notes: booking.internal_notes || "",
    special_requests: booking.special_requests || "",
    check_in_date: booking.check_in_date,
    check_out_date: booking.check_out_date,
    status: booking.status,
    payment_status: booking.payment_status || "unpaid",
    payment_method: booking.payment_method || "",
    total_price: String(booking.total_price ?? 0),
    deposit_amount: booking.deposit_amount != null ? String(booking.deposit_amount) : "",
  });

  const set = (key: keyof typeof form, value: string) => setForm(p => ({ ...p, [key]: value }));

  const nights = useMemo(() => {
    try {
      return Math.max(1, differenceInDays(parseISO(form.check_out_date), parseISO(form.check_in_date)));
    } catch {
      return 1;
    }
  }, [form.check_in_date, form.check_out_date]);

  // Load room lines + account figures.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("rolos_booking_rooms")
        .select("id, room_id, room_type_id, rate_plan_id, adults, children, teens, infants, rate_charged")
        .eq("booking_id", booking.id);

      if (cancelled) return;
      const loaded: RoomLineRow[] = (data || []).map(r => ({
        id: r.id,
        key: r.id,
        room_id: r.room_id || "",
        room_type_id: r.room_type_id || "",
        rate_plan_id: r.rate_plan_id || "",
        adults: String(r.adults ?? 1),
        children: String(r.children ?? 0),
        teens: String(r.teens ?? 0),
        infants: String(r.infants ?? 0),
        rate_charged: String(r.rate_charged ?? 0),
      }));

      // Fall back to the booking's assigned rooms when no lines exist yet (legacy bookings).
      if (loaded.length === 0 && (booking.rolos_room_ids?.length ?? 0) > 0) {
        booking.rolos_room_ids!.forEach(rid => {
          const room = rooms.find(r => r.id === rid);
          loaded.push({
            ...blankLine(),
            room_id: rid,
            room_type_id: room?.room_type_id || "",
            adults: String(booking.adults ?? 1),
            children: String(booking.children ?? 0),
            teens: String(booking.teens ?? 0),
            infants: String(booking.infants ?? 0),
            rate_charged: String(booking.total_price ?? 0),
          });
        });
      }
      setLines(loaded.length ? loaded : [{ ...blankLine(), adults: String(booking.adults ?? 1), rate_charged: String(booking.total_price ?? 0) }]);
      setLinesLoaded(true);

      // Account: folio extras + payments
      const { data: folio } = await supabase
        .from("rolos_folios")
        .select("id")
        .eq("booking_id", booking.id)
        .maybeSingle();
      if (cancelled || !folio?.id) return;
      const { data: txns } = await supabase
        .from("rolos_folio_transactions")
        .select("transaction_type, amount")
        .eq("folio_id", folio.id);
      if (cancelled) return;
      let extras = 0;
      let payments = 0;
      for (const t of txns || []) {
        const amt = Number(t.amount) || 0;
        const type = (t.transaction_type || "").toLowerCase();
        if (type === "payment" || type === "refund") payments += type === "refund" ? -amt : amt;
        else if (type !== "accommodation") extras += amt;
      }
      setAccount({ extras, payments });
    })();
    return () => { cancelled = true; };
  }, [booking.id, booking.rolos_room_ids, booking.adults, booking.children, booking.teens, booking.infants, booking.total_price, rooms]);

  const updateLine = (key: string, patch: Partial<RoomLineRow>) =>
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));

  const accommodation = parseFloat(form.total_price) || 0;
  const deposit = parseFloat(form.deposit_amount) || 0;
  const balance = accommodation + account.extras - account.payments;

  const roomsForType = (roomTypeId: string, currentRoomId: string) => {
    const taken = new Set(lines.filter(l => l.room_id && l.room_id !== currentRoomId).map(l => l.room_id));
    return rooms.filter(r => (!roomTypeId || r.room_type_id === roomTypeId) && !taken.has(r.id));
  };

  const roomTypeOptions = useMemo(() => {
    const seen = new Map<string, string>();
    rooms.forEach(r => {
      if (r.room_type_id && !seen.has(r.room_type_id)) seen.set(r.room_type_id, r.room_type_id);
    });
    return Array.from(seen.keys());
  }, [rooms]);

  const handleSave = async () => {
    if (!form.guest_name || !form.guest_email) {
      toast.error("Guest name and email are required");
      return;
    }
    setSaving(true);
    const occ = lines.reduce(
      (a, l) => ({
        adults: a.adults + (parseInt(l.adults) || 0),
        children: a.children + (parseInt(l.children) || 0),
        teens: a.teens + (parseInt(l.teens) || 0),
        infants: a.infants + (parseInt(l.infants) || 0),
      }),
      { adults: 0, children: 0, teens: 0, infants: 0 }
    );

    const assignedRoomIds = lines.map(l => l.room_id).filter(Boolean);

    const { error } = await supabase.from("bookings").update({
      guest_name: form.guest_name,
      guest_email: form.guest_email,
      guest_phone: form.guest_phone || null,
      guest_company: form.guest_company || null,
      second_guest_name: form.second_guest_name || null,
      booking_made_by: form.booking_made_by || null,
      payment_reference: form.payment_reference || null,
      internal_notes: form.internal_notes || null,
      special_requests: form.special_requests || null,
      check_in_date: form.check_in_date,
      check_out_date: form.check_out_date,
      status: form.status,
      payment_status: form.payment_status,
      payment_method: form.payment_method || null,
      total_price: accommodation,
      deposit_amount: form.deposit_amount ? deposit : null,
      adults: occ.adults || booking.adults || 1,
      children: occ.children,
      teens: occ.teens,
      infants: occ.infants,
      rolos_room_ids: assignedRoomIds.length ? assignedRoomIds : null,
    } as never).eq("id", booking.id);

    if (error) {
      setSaving(false);
      toast.error("Failed to save: " + error.message);
      return;
    }

    // Sync room lines (replace-all keeps it simple and avoids orphan rows).
    if (linesLoaded) {
      await supabase.from("rolos_booking_rooms").delete().eq("booking_id", booking.id);
      const rows = lines
        .filter(l => l.room_id || l.room_type_id)
        .map(l => ({
          booking_id: booking.id,
          room_id: l.room_id || null,
          room_type_id: l.room_type_id || null,
          rate_plan_id: l.rate_plan_id || null,
          rate_charged: parseFloat(l.rate_charged) || 0,
          nightly_rate: nights > 0 ? Math.round(((parseFloat(l.rate_charged) || 0) / nights) * 100) / 100 : null,
          adults: parseInt(l.adults) || 1,
          children: parseInt(l.children) || 0,
          teens: parseInt(l.teens) || 0,
          infants: parseInt(l.infants) || 0,
        }));
      if (rows.length) {
        const { error: lineErr } = await supabase.from("rolos_booking_rooms").insert(rows as never);
        if (lineErr) console.warn("Room line sync failed:", lineErr);
      }
    }

    setSaving(false);
    toast.success("Booking updated");
    onSaved();
  };

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* ───── Guest Details ───── */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <User className="h-3.5 w-3.5" />Guest Details
        </h4>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">Arrival</Label>
            <Input className="h-8" type="date" value={form.check_in_date} onChange={e => set("check_in_date", e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px]">Departure</Label>
            <Input className="h-8" type="date" value={form.check_out_date} onChange={e => set("check_out_date", e.target.value)} />
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground">{nights} night{nights !== 1 ? "s" : ""}</p>

        <div>
          <Label className="text-[11px]">Guest Name</Label>
          <Input className="h-8" value={form.guest_name} onChange={e => set("guest_name", e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px]">2nd Guest</Label>
          <Input className="h-8" value={form.second_guest_name} onChange={e => set("second_guest_name", e.target.value)} placeholder="Optional" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">Email</Label>
            <Input className="h-8" value={form.guest_email} onChange={e => set("guest_email", e.target.value)} />
          </div>
          <div>
            <Label className="text-[11px]">Phone</Label>
            <Input className="h-8" value={form.guest_phone} onChange={e => set("guest_phone", e.target.value)} />
          </div>
        </div>
        <div>
          <Label className="text-[11px]">Company</Label>
          <Input className="h-8" value={form.guest_company} onChange={e => set("guest_company", e.target.value)} placeholder="Optional" />
        </div>

        <Separator />

        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Rooms</span>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => setLines(prev => [...prev, blankLine()])}>
            <Plus className="h-3 w-3 mr-1" />Add
          </Button>
        </div>

        <div className="space-y-2">
          {lines.map((l, idx) => (
            <div key={l.key} className="rounded-md border border-border p-2 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-medium flex items-center gap-1">
                  <BedDouble className="h-3 w-3 text-muted-foreground" />Room {idx + 1}
                </span>
                {lines.length > 1 && (
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))}>
                    <Trash2 className="h-3 w-3 text-destructive" />
                  </Button>
                )}
              </div>
              <Select value={l.room_id} onValueChange={v => {
                const room = rooms.find(r => r.id === v);
                updateLine(l.key, { room_id: v, room_type_id: room?.room_type_id || l.room_type_id });
              }}>
                <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Assign unit" /></SelectTrigger>
                <SelectContent>
                  {roomsForType(l.room_type_id, l.room_id).map(r => (
                    <SelectItem key={r.id} value={r.id}>{r.room_number}{r.room_name ? ` (${r.room_name})` : ""}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {ratePlans.length > 0 && (
                <Select value={l.rate_plan_id} onValueChange={v => updateLine(l.key, { rate_plan_id: v })}>
                  <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Rate plan" /></SelectTrigger>
                  <SelectContent>
                    {ratePlans.map(rp => <SelectItem key={rp.id} value={rp.id}>{rp.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              <div className="grid grid-cols-4 gap-1">
                <div><Label className="text-[9px]">Ad</Label><Input className="h-7 px-1 text-xs" type="number" min={1} value={l.adults} onChange={e => updateLine(l.key, { adults: e.target.value })} /></div>
                <div><Label className="text-[9px]">0–2</Label><Input className="h-7 px-1 text-xs" type="number" min={0} value={l.infants} onChange={e => updateLine(l.key, { infants: e.target.value })} /></div>
                <div><Label className="text-[9px]">3–12</Label><Input className="h-7 px-1 text-xs" type="number" min={0} value={l.children} onChange={e => updateLine(l.key, { children: e.target.value })} /></div>
                <div><Label className="text-[9px]">Teen</Label><Input className="h-7 px-1 text-xs" type="number" min={0} value={l.teens} onChange={e => updateLine(l.key, { teens: e.target.value })} /></div>
              </div>
              <div>
                <Label className="text-[9px]">Line total</Label>
                <Input className="h-7 text-xs" type="number" min={0} value={l.rate_charged} onChange={e => updateLine(l.key, { rate_charged: e.target.value })} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ───── Booking Notes ───── */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <StickyNote className="h-3.5 w-3.5" />Booking Notes
        </h4>

        <div>
          <Label className="text-[11px]">Status</Label>
          <Select value={form.status} onValueChange={v => set("status", v)}>
            <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="waiting_for_deposit">Waiting for deposit</SelectItem>
              <SelectItem value="confirmed">Confirmed</SelectItem>
              <SelectItem value="checked_in">Checked In</SelectItem>
              <SelectItem value="checked_out">Checked Out</SelectItem>
              <SelectItem value="cancelled">Cancelled</SelectItem>
              <SelectItem value="no_show">No Show</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="rounded-md border border-border bg-muted/30 p-2 space-y-1 text-[11px]">
          <div className="flex justify-between"><span className="text-muted-foreground">Booking made</span><span>{booking.created_at ? format(parseISO(booking.created_at), "d MMM yyyy HH:mm") : "—"}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Channel</span><span className="capitalize">{(booking.booking_channel || "direct").replace(/_/g, " ")}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span>#{booking.id.slice(0, 8)}</span></div>
        </div>

        <div>
          <Label className="text-[11px]">Booking Made By</Label>
          <Input className="h-8" value={form.booking_made_by} onChange={e => set("booking_made_by", e.target.value)} placeholder="Staff / agent" />
        </div>
        <div>
          <Label className="text-[11px]">Payment / Booking Reference</Label>
          <Input className="h-8" value={form.payment_reference} onChange={e => set("payment_reference", e.target.value)} placeholder="Optional" />
        </div>
        <div>
          <Label className="text-[11px]">Guest Requests (visible on emails)</Label>
          <Textarea rows={3} value={form.special_requests} onChange={e => set("special_requests", e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px]">Internal Notes (staff only)</Label>
          <Textarea rows={4} value={form.internal_notes} onChange={e => set("internal_notes", e.target.value)} placeholder="Not shown to the guest" />
        </div>
      </div>

      {/* ───── Account ───── */}
      <div className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Receipt className="h-3.5 w-3.5" />Account
        </h4>

        <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Accommodation</span><span className="font-medium">{money(accommodation)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Extras</span><span className="font-medium">{money(account.extras)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Payments</span><span className="font-medium">-{money(account.payments)}</span></div>
          <Separator />
          <div className="flex justify-between text-base">
            <span className="font-semibold">Balance</span>
            <span className={balance > 0 ? "font-bold text-destructive" : "font-bold text-emerald-600 dark:text-emerald-400"}>{money(balance)}</span>
          </div>
        </div>

        <div>
          <Label className="text-[11px]">Booking Total (ZAR)</Label>
          <Input className="h-8" type="number" min={0} value={form.total_price} onChange={e => set("total_price", e.target.value)} />
        </div>
        <div>
          <Label className="text-[11px]">Deposit Required</Label>
          <Input className="h-8" type="number" min={0} value={form.deposit_amount} onChange={e => set("deposit_amount", e.target.value)} placeholder="0.00" />
          {deposit > 0 && (
            <p className="text-[10px] text-muted-foreground mt-1">
              {account.payments >= deposit ? "Deposit received" : `Outstanding deposit ${money(deposit - account.payments)}`}
            </p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="text-[11px]">Payment Status</Label>
            <Select value={form.payment_status} onValueChange={v => set("payment_status", v)}>
              <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="unpaid">Unpaid</SelectItem>
                <SelectItem value="partial">Partial</SelectItem>
                <SelectItem value="paid">Paid</SelectItem>
                <SelectItem value="paid_externally">Paid externally</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-[11px]">Method</Label>
            <Select value={form.payment_method} onValueChange={v => set("payment_method", v)}>
              <SelectTrigger className="h-8"><SelectValue placeholder="—" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="eft">EFT</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {onOpenFolio && <Button size="sm" variant="outline" onClick={onOpenFolio}><Receipt className="h-3 w-3 mr-1" />Folio</Button>}
          {onOpenInvoice && <Button size="sm" variant="outline" onClick={onOpenInvoice}>Invoice</Button>}
          <Badge variant="outline" className="text-[10px] self-center capitalize">{form.status.replace(/_/g, " ")}</Badge>
        </div>

        <Button className="w-full" onClick={handleSave} disabled={saving}>
          <Save className="h-3.5 w-3.5 mr-1" />{saving ? "Saving..." : "Save Booking"}
        </Button>
      </div>
    </div>
  );
}
