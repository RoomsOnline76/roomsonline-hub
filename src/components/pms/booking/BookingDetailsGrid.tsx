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
import { BedDouble, Plus, Trash2, Save, User, Receipt, StickyNote, CalendarRange, Users2 } from "lucide-react";
import { StayRangePicker } from "@/components/ui/stay-range-picker";
import { ViewRatesDialog } from "./ViewRatesDialog";
import { useCrmAccounts, useCrmScopeForProperty, type CrmAccount } from "@/hooks/useCrmAccounts";
import { BookerSegmentationFields, type BookerSegmentationValue } from "@/components/pms/crm/BookerSegmentationFields";
import { resolveRuSourceChannel, ChannelLogo } from "@/lib/ruChannelDisplay";
import { displayBookingReference } from "@/lib/bookingReference";
import { extractFunctionError } from "@/lib/functionError";
import { pushBookingToChannel } from "@/lib/channelBookingSync";



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
  property_id?: string | null;
  booker_is_guest?: boolean | null;
  booker_name?: string | null;
  booker_email?: string | null;
  booker_phone?: string | null;
  company_account_id?: string | null;
  agent_account_id?: string | null;
  source_account_id?: string | null;
  market_segment?: string | null;
  comm_channel?: string | null;
  invoice_to_name?: string | null;
  invoice_to_vat?: string | null;
  invoice_to_address?: string | null;
  modification_notes?: Record<string, unknown>[] | null;
  integration_type?: string | null;
  external_reservation_id?: string | null;
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
  const [confirmingRequest, setConfirmingRequest] = useState(false);
  const [viewRatesOpen, setViewRatesOpen] = useState(false);
  const [lines, setLines] = useState<RoomLineRow[]>([]);
  const [linesLoaded, setLinesLoaded] = useState(false);
  const [account, setAccount] = useState({ extras: 0, payments: 0, deposits: 0 });
  /* The price field edits ACCOMMODATION. `bookings.total_price` is the guest total
   * (accommodation + mandatory extras), so seeding the field from it and saving it back
   * is what made extras compound on every edit. The reconciled charge snapshot — and
   * failing that the room lines — carry the real accommodation basis. */
  const [storedAccommodation, setStoredAccommodation] = useState<number>(Number(booking.total_price ?? 0));

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

  // ───── Linked CRM profiles + segmentation ─────
  const crmScope = useCrmScopeForProperty(booking.property_id);
  const { accounts, isPortfolioScoped, saveAccount } = useCrmAccounts(crmScope);

  const [crm, setCrm] = useState<BookerSegmentationValue>({
    booker_is_guest: booking.booker_is_guest ?? true,
    booker_name: booking.booker_name || "",
    booker_email: booking.booker_email || "",
    booker_phone: booking.booker_phone || "",
    company_account_id: booking.company_account_id || null,
    agent_account_id: booking.agent_account_id || null,
    source_account_id: booking.source_account_id || null,
    market_segment: booking.market_segment || "",
    comm_channel: booking.comm_channel || "",
  });
  const [invoiceTo, setInvoiceTo] = useState({
    invoice_to_name: booking.invoice_to_name || "",
    invoice_to_vat: booking.invoice_to_vat || "",
    invoice_to_address: booking.invoice_to_address || "",
  });

  /** Copy the company's billing identity onto the booking for invoicing. */
  const applyCompany = (a: CrmAccount | null) => {
    if (!a) return;
    setInvoiceTo({
      invoice_to_name: a.name,
      invoice_to_vat: a.vat_number || "",
      invoice_to_address: [a.address_line1, a.address_line2, a.city, a.postal_code, a.country]
        .filter(Boolean)
        .join(", "),
    });
    setForm(p => ({ ...p, guest_company: a.name }));
  };


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
        .eq("booking_id", booking.id)
        // Units cancelled off a multi-unit stay stay on record but are no longer editable lines.
        .neq("status", "cancelled");

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

      /* Accommodation basis: the reconciled snapshot first, then the sum of the room
       * lines. Both are accommodation-only, unlike `total_price`. */
      const { data: snapRow } = await supabase
        .from("bookings")
        .select("charges_breakdown")
        .eq("id", booking.id)
        .maybeSingle();
      if (cancelled) return;
      const snap = (snapRow?.charges_breakdown ?? null) as { accommodation?: number } | null;
      const lineSum = loaded.reduce((a, l) => a + (parseFloat(l.rate_charged) || 0), 0);
      const basis = Number(snap?.accommodation ?? 0) > 0 ? Number(snap!.accommodation) : lineSum;
      if (basis > 0) {
        setStoredAccommodation(basis);
        set("total_price", String(basis));
      }

      /* Extras come from the reconciled booking charges, which the modification service
       * rewrites on every edit. Folio transactions lag behind and double up. */
      const { data: charges } = await supabase
        .from("rolos_booking_charges")
        .select("amount, is_refundable, category")
        .eq("booking_id", booking.id);
      if (cancelled) return;
      let extras = 0;
      let deposits = 0;
      for (const c of charges || []) {
        const amt = Number(c.amount) || 0;
        if (c.is_refundable) deposits += amt;
        else extras += amt;
      }

      // Payments still live on the folio.
      const { data: folio } = await supabase
        .from("rolos_folios")
        .select("id")
        .eq("booking_id", booking.id)
        .maybeSingle();
      let payments = 0;
      if (folio?.id) {
        const { data: txns } = await supabase
          .from("rolos_folio_transactions")
          .select("transaction_type, amount")
          .eq("folio_id", folio.id);
        if (cancelled) return;
        for (const t of txns || []) {
          const amt = Number(t.amount) || 0;
          const type = (t.transaction_type || "").toLowerCase();
          if (type === "payment") payments += amt;
          else if (type === "refund") payments -= amt;
        }
      }
      if (cancelled) return;
      setAccount({ extras, payments, deposits });
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

    // A stay length or occupancy change has to travel through the modification service: that is
    // the only path that reaches the channel (accepting a held request first when needed) and
    // moves the calendar blockout. Writing those fields straight to the record used to leave the
    // channel holding the original dates and pax while the local record said otherwise.
    const datesChanged =
      form.check_in_date !== booking.check_in_date || form.check_out_date !== booking.check_out_date;
    const paxChanged =
      occ.adults !== (booking.adults ?? 0) ||
      occ.children !== (booking.children ?? 0) ||
      occ.teens !== (booking.teens ?? 0) ||
      occ.infants !== (booking.infants ?? 0);
    /* A price change also belongs to the service: it re-prices the extras on the new
     * accommodation basis and re-quotes the channel. Writing it locally would leave the
     * fees priced off the previous figure. */
    const priceChanged = accommodation !== storedAccommodation;
    const routedToService = datesChanged || paxChanged || priceChanged;


    if (routedToService) {
      const modifications: Record<string, unknown> = {
        adults: occ.adults || booking.adults || 1,
        children: occ.children,
        teens: occ.teens,
        infants: occ.infants,
      };
      if (datesChanged) {
        modifications.check_in_date = form.check_in_date;
        modifications.check_out_date = form.check_out_date;
      }
      if (accommodation !== storedAccommodation) modifications.accommodation_total = accommodation;

      const { data, error } = await supabase.functions.invoke("modify-booking", {
        body: { booking_id: booking.id, modifications },
      });
      if (error) {
        setSaving(false);
        toast.error(await extractFunctionError(error, "Could not apply the stay change"));
        return;
      }
      if (data && data.success === false) {
        setSaving(false);
        toast.error(data.message || "Could not apply the stay change");
        return;
      }
      if (data?.ru_request_accepted) toast.success("Channel request accepted before the change was applied");
    }

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
      status: form.status,
      payment_status: form.payment_status,
      payment_method: form.payment_method || null,
      deposit_amount: form.deposit_amount ? deposit : null,
      rolos_room_ids: assignedRoomIds.length ? assignedRoomIds : null,
      // Dates, occupancy and the repriced total belong to the modification service when it ran.
      ...(routedToService
        ? {}
        : {
          check_in_date: form.check_in_date,
          check_out_date: form.check_out_date,
          total_price: accommodation,
          adults: occ.adults || booking.adults || 1,
          children: occ.children,
          teens: occ.teens,
          infants: occ.infants,
        }),
      booker_is_guest: crm.booker_is_guest,
      booker_name: crm.booker_is_guest ? null : (crm.booker_name || null),
      booker_email: crm.booker_is_guest ? null : (crm.booker_email || null),
      booker_phone: crm.booker_is_guest ? null : (crm.booker_phone || null),
      company_account_id: crm.company_account_id,
      agent_account_id: crm.agent_account_id,
      source_account_id: crm.source_account_id,
      market_segment: crm.market_segment || null,
      comm_channel: crm.comm_channel || null,
      invoice_to_name: invoiceTo.invoice_to_name || null,
      invoice_to_vat: invoiceTo.invoice_to_vat || null,
      invoice_to_address: invoiceTo.invoice_to_address || null,

    } as never).eq("id", booking.id);


    if (error) {
      setSaving(false);
      toast.error("Failed to save: " + error.message);
      return;
    }

    // Sync room lines in place so per-night rate overrides (which reference the
    // room line id) are preserved: update existing, insert new, remove dropped.
    if (linesLoaded) {
      const payload = (l: RoomLineRow) => ({
        room_id: l.room_id || null,
        room_type_id: l.room_type_id || null,
        rate_plan_id: l.rate_plan_id || null,
        rate_charged: parseFloat(l.rate_charged) || 0,
        nightly_rate: nights > 0 ? Math.round(((parseFloat(l.rate_charged) || 0) / nights) * 100) / 100 : null,
        adults: parseInt(l.adults) || 1,
        children: parseInt(l.children) || 0,
        teens: parseInt(l.teens) || 0,
        infants: parseInt(l.infants) || 0,
      });

      const keep = lines.filter(l => l.room_id || l.room_type_id);
      const keepIds = keep.map(l => l.id).filter(Boolean) as string[];

      const { data: existing } = await supabase
        .from("rolos_booking_rooms")
        .select("id")
        .eq("booking_id", booking.id)
        .neq("status", "cancelled");
      const stale = (existing || []).map(r => r.id).filter(id => !keepIds.includes(id));
      if (stale.length) await supabase.from("rolos_booking_rooms").delete().in("id", stale);

      for (const l of keep.filter(l => l.id)) {
        const { error: upErr } = await supabase.from("rolos_booking_rooms").update(payload(l) as never).eq("id", l.id!);
        if (upErr) console.warn("Room line update failed:", upErr);
      }
      const newRows = keep.filter(l => !l.id).map(l => ({ booking_id: booking.id, ...payload(l) }));
      if (newRows.length) {
        const { error: lineErr } = await supabase.from("rolos_booking_rooms").insert(newRows as never);
        if (lineErr) console.warn("Room line insert failed:", lineErr);
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

        <div className="space-y-1">
          <Label className="text-[11px]">Stay dates</Label>
          <StayRangePicker
            size="compact"
            numberOfMonths={2}
            minDate={null}
            from={form.check_in_date}
            to={form.check_out_date}
            onChange={({ from, to }) =>
              setForm(p => ({ ...p, check_in_date: from ?? "", check_out_date: to ?? "" }))
            }
            placeholder="Select arrival & departure"
          />
        </div>

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
          <div className="flex justify-between items-center">
            <span className="text-muted-foreground">Channel</span>
            <div className="flex items-center gap-1.5">
              <span className="capitalize">{(booking.booking_channel || "direct").replace(/_/g, " ")}</span>
              {(() => {
                const source = resolveRuSourceChannel(booking.modification_notes, booking.booking_channel);
                if (!source.isRuSourced || !source.hasSpecificSource) return null;
                return (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <ChannelLogo channelName={source.channelLogoKey} size="sm" />
                    <span>{source.label}</span>
                  </>
                );
              })()}
            </div>
          </div>
          <div className="flex justify-between"><span className="text-muted-foreground">Reference</span><span className="font-mono">{displayBookingReference(booking as never)}</span></div>
          {/* Channel-received stays carry the channel's own reservation number — operators quote that
              number when they talk to the channel, so show it as received. */}
          {booking.external_reservation_id && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Channel reservation</span>
              <button
                type="button"
                className="font-mono underline decoration-dotted underline-offset-2"
                title="Copy the channel reservation number"
                onClick={() => {
                  void navigator.clipboard?.writeText(String(booking.external_reservation_id));
                  toast.success("Channel reservation number copied");
                }}
              >
                {booking.external_reservation_id}
              </button>
            </div>
          )}
        </div>


        {/* A held channel request is not a reservation at the channel until it is accepted. */}
        {(booking.integration_type || "").toLowerCase() === "rentalsunited_lead" && (
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 space-y-2 text-[11px]">
            <p className="font-medium">Not yet confirmed at the channel</p>
            <p className="text-muted-foreground">
              The channel still holds this stay as a request. Checking the guest in accepts it automatically —
              you can also accept it now.
            </p>
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-[11px]"
              disabled={confirmingRequest}
              onClick={async () => {
                setConfirmingRequest(true);
                const outcome = await pushBookingToChannel(booking.id, "confirmed", { source: "booking_drawer" });
                setConfirmingRequest(false);
                if (outcome?.reservation === "pushed") onSaved();
              }}
            >
              {confirmingRequest ? "Accepting…" : "Accept at channel"}
            </Button>
          </div>
        )}

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

        <Separator />

        {/* ───── Linked Profiles & Segmentation ───── */}
        <div className="space-y-2">
          <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <Users2 className="h-3.5 w-3.5" />Linked Profiles &amp; Segmentation
          </h4>
          <BookerSegmentationFields
            compact
            value={crm}
            onChange={patch => setCrm(p => ({ ...p, ...patch }))}
            accounts={accounts}
            isPortfolioScoped={isPortfolioScoped}
            onSaveAccount={saveAccount}
            onCompanyLinked={applyCompany}
          />
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-[11px]">Invoice To</Label>
              <Input
                className="h-8"
                value={invoiceTo.invoice_to_name}
                onChange={e => setInvoiceTo(p => ({ ...p, invoice_to_name: e.target.value }))}
                placeholder="Defaults to the guest"
              />
            </div>
            <div>
              <Label className="text-[11px]">Invoice VAT No.</Label>
              <Input
                className="h-8"
                value={invoiceTo.invoice_to_vat}
                onChange={e => setInvoiceTo(p => ({ ...p, invoice_to_vat: e.target.value }))}
                placeholder="Optional"
              />
            </div>
          </div>
          <div>
            <Label className="text-[11px]">Invoice Address</Label>
            <Textarea
              rows={2}
              value={invoiceTo.invoice_to_address}
              onChange={e => setInvoiceTo(p => ({ ...p, invoice_to_address: e.target.value }))}
              placeholder="Auto-filled when a company is linked"
            />
          </div>
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
          {account.deposits > 0 && (
            <div className="flex justify-between text-[11px] text-muted-foreground">
              <span>Refundable deposit (held separately)</span><span>{money(account.deposits)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-base">
            <span className="font-semibold">Balance</span>
            <span className={balance > 0 ? "font-bold text-destructive" : "font-bold text-emerald-600 dark:text-emerald-400"}>{money(balance)}</span>
          </div>
        </div>

        {booking.property_id && (
          <>
            <Button variant="outline" size="sm" className="w-full" onClick={() => setViewRatesOpen(true)}>
              <CalendarRange className="h-3.5 w-3.5 mr-1.5" />View Rates / Override
            </Button>
            <ViewRatesDialog
              open={viewRatesOpen}
              onOpenChange={setViewRatesOpen}
              bookingId={booking.id}
              propertyId={booking.property_id}
              checkIn={form.check_in_date}
              checkOut={form.check_out_date}
              rooms={rooms}
              onSaved={(total) => {
                set("total_price", String(total));
                onSaved();
              }}
            />
          </>
        )}

        <div>
          <Label className="text-[11px]">Accommodation (ZAR)</Label>
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
          {onOpenInvoice && <Button size="sm" variant="outline" onClick={onOpenInvoice}>View Account</Button>}
          <Badge variant="outline" className="text-[10px] self-center capitalize">{form.status.replace(/_/g, " ")}</Badge>
        </div>

        <Button className="w-full" onClick={handleSave} disabled={saving}>
          <Save className="h-3.5 w-3.5 mr-1" />{saving ? "Saving..." : "Save Booking"}
        </Button>
      </div>
    </div>
  );
}
