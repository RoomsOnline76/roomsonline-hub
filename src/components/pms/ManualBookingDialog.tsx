import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { CalendarIcon, Plus, Trash2, BedDouble } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { callPmsApi } from "@/hooks/usePmsApi";
import { toast } from "sonner";
import { useCrmAccounts, useCrmScopeForProperty, type CrmAccount } from "@/hooks/useCrmAccounts";
import { useActivePackages } from "@/hooks/useActivePackages";
import {
  BookerSegmentationFields,
  emptyBookerSegmentation,
  type BookerSegmentationValue,
} from "@/components/pms/crm/BookerSegmentationFields";

interface RoomType {
  id: string;
  name: string;
  default_rate: number | null;
}

interface Room {
  id: string;
  room_number: string;
  room_name: string | null;
  room_type_id: string | null;
  status: string;
}

interface RatePlan {
  id: string;
  name: string;
  base_rate: number | null;
  pricing_model?: string;
}

interface PortfolioPropertyOption {
  id: string;
  name: string;
  roomTypes: RoomType[];
  rooms: Room[];
}

interface ManualBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  roomTypes: RoomType[];
  rooms: Room[];
  ratePlans: RatePlan[];
  onCreated: () => void;
  /** Optional: resolve the nightly rate for a room type on a specific date. */
  getRateForDate?: (roomTypeId: string, date: Date) => number | null;
  /** Optional portfolio scope selector. */
  portfolioOptions?: PortfolioPropertyOption[];
  /** Optional prefill, e.g. when the Room Plan opens the dialog from a dragged date span. */
  initialValues?: {
    propertyId?: string | null;
    roomTypeId?: string | null;
    roomId?: string | null;
    checkIn?: Date | null;
    checkOut?: Date | null;
  } | null;
}

/** A single room line on the booking — mirrors NightsBridge "Select Room / Unit". */
interface RoomLine {
  key: string;
  room_type_id: string;
  room_id: string;
  rate_plan_id: string;
  adults: string;
  /** Children 0–2 (infants bracket). */
  infants: string;
  /** Children 3–12. */
  children: string;
  teens: string;
  pets: string;
  /** Manual per-line total override. */
  price_override: string;
}

let lineSeq = 0;
const newLine = (roomTypeId = "", roomId = ""): RoomLine => ({
  key: `line-${++lineSeq}`,
  room_type_id: roomTypeId,
  room_id: roomId,
  rate_plan_id: "",
  adults: "1",
  infants: "0",
  children: "0",
  teens: "0",
  pets: "0",
  price_override: "",
});

export function ManualBookingDialog({ open, onOpenChange, propertyId, roomTypes, rooms, ratePlans, onCreated, getRateForDate, portfolioOptions, initialValues }: ManualBookingDialogProps) {
  const [saving, setSaving] = useState(false);
  const portfolioMode = !!(portfolioOptions && portfolioOptions.length > 0);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>(propertyId || "");
  const [packageId, setPackageId] = useState("none");

  useEffect(() => {
    setSelectedPropertyId(propertyId || "");
  }, [propertyId, portfolioMode]);

  const effectivePropertyId = portfolioMode ? selectedPropertyId : (propertyId || "");
  const selectedPortfolioProp = useMemo(
    () => (portfolioMode ? portfolioOptions!.find(p => p.id === effectivePropertyId) : undefined),
    [portfolioMode, portfolioOptions, effectivePropertyId]
  );
  const activeRoomTypes: RoomType[] = portfolioMode ? (selectedPortfolioProp?.roomTypes || []) : roomTypes;
  const activeRooms: Room[] = portfolioMode ? (selectedPortfolioProp?.rooms || []) : rooms;

  // Packages are property-scoped, so a portfolio switch clears the selection.
  const { packages } = useActivePackages(effectivePropertyId || null);
  useEffect(() => { setPackageId("none"); }, [effectivePropertyId]);



  const [form, setForm] = useState({
    guest_name: "",
    guest_email: "",
    guest_phone: "",
    guest_company: "",
    second_guest_name: "",
    booking_made_by: "",
    check_in: undefined as Date | undefined,
    check_out: undefined as Date | undefined,
    total_price: "",
    deposit_amount: "",
    payment_status: "unpaid",
    payment_method: "",
    special_requests: "",
    internal_notes: "",
    booking_channel: "direct",
  });

  const [lines, setLines] = useState<RoomLine[]>([newLine()]);

  // ───── Linked CRM profiles + segmentation ─────
  const crmScope = useCrmScopeForProperty(effectivePropertyId || null);
  const { accounts, isPortfolioScoped, saveAccount } = useCrmAccounts(crmScope);
  const [crm, setCrm] = useState<BookerSegmentationValue>(emptyBookerSegmentation);
  const [invoiceTo, setInvoiceTo] = useState({ name: "", vat: "", address: "" });

  /** Linking a company fills the invoice identity for this booking. */
  const applyCompany = useCallback((a: CrmAccount | null) => {
    if (!a) return;
    setInvoiceTo({
      name: a.name,
      vat: a.vat_number || "",
      address: [a.address_line1, a.address_line2, a.city, a.postal_code, a.country].filter(Boolean).join(", "),
    });
    setForm(p => ({ ...p, guest_company: a.name }));
  }, []);

  // Reset room lines when the active property changes so we never carry a room
  // type from a different property into the booking payload.
  useEffect(() => {
    setLines([newLine()]);
  }, [effectivePropertyId]);

  // Apply Room Plan prefill after the property-reset effect above has run.
  useEffect(() => {
    if (!open || !initialValues) return;
    if (initialValues.propertyId) setSelectedPropertyId(initialValues.propertyId);
    const timer = setTimeout(() => {
      setForm(p => ({
        ...p,
        check_in: initialValues.checkIn || p.check_in,
        check_out: initialValues.checkOut || p.check_out,
      }));
      if (initialValues.roomTypeId || initialValues.roomId) {
        setLines([newLine(initialValues.roomTypeId || "", initialValues.roomId || "")]);
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open, initialValues]);

  const nights = useMemo(() => {
    if (!form.check_in || !form.check_out) return 0;
    return Math.max(0, differenceInDays(form.check_out, form.check_in));
  }, [form.check_in, form.check_out]);

  const update = useCallback((key: string, value: any) => setForm(p => ({ ...p, [key]: value })), []);

  const updateLine = useCallback((key: string, patch: Partial<RoomLine>) => {
    setLines(prev => prev.map(l => (l.key === key ? { ...l, ...patch } : l)));
  }, []);

  const roomsForType = useCallback(
    (roomTypeId: string, currentRoomId: string) => {
      const taken = new Set(lines.filter(l => l.room_id && l.room_id !== currentRoomId).map(l => l.room_id));
      return activeRooms.filter(
        r => r.room_type_id === roomTypeId && r.status !== "out_of_service" && !taken.has(r.id)
      );
    },
    [activeRooms, lines]
  );

  /** Nightly rates for a room type across the stay (season-aware via the calendar resolver). */
  const nightlyRatesFor = useCallback(
    (roomTypeId: string, ratePlanId: string): number[] => {
      if (!nights || !form.check_in || !roomTypeId) return [];
      const rt = activeRoomTypes.find(t => t.id === roomTypeId);
      const plan = ratePlans.find(p => p.id === ratePlanId);
      const planRate = plan?.base_rate && plan.base_rate > 0 ? plan.base_rate : null;
      const defaultRate = rt?.default_rate && rt.default_rate > 0 ? rt.default_rate : null;
      const out: number[] = [];
      for (let i = 0; i < nights; i++) {
        const d = new Date(form.check_in);
        d.setDate(d.getDate() + i);
        const resolved = getRateForDate ? getRateForDate(roomTypeId, d) : null;
        out.push((resolved && resolved > 0) ? resolved : (planRate ?? defaultRate ?? 0));
      }
      return out;
    },
    [nights, form.check_in, activeRoomTypes, ratePlans, getRateForDate]
  );

  /** Per-line pricing summary. */
  const linePricing = useMemo(() => {
    const map = new Map<string, { total: number; rates: number[]; unresolved: boolean; label: string }>();
    for (const l of lines) {
      const rates = nightlyRatesFor(l.room_type_id, l.rate_plan_id);
      const unresolved = rates.length > 0 && rates.every(r => r === 0);
      const auto = rates.reduce((a, b) => a + b, 0);
      const override = l.price_override ? parseFloat(l.price_override) : NaN;
      const total = !isNaN(override) && override > 0 ? override : auto;
      const min = rates.length ? Math.min(...rates) : 0;
      const max = rates.length ? Math.max(...rates) : 0;
      const range = min === max ? `R${min.toLocaleString()}` : `R${min.toLocaleString()}–R${max.toLocaleString()}`;
      map.set(l.key, {
        total,
        rates,
        unresolved,
        label: rates.length ? `${range}/night × ${nights} night${nights !== 1 ? "s" : ""}` : "",
      });
    }
    return map;
  }, [lines, nightlyRatesFor, nights]);

  const autoTotal = useMemo(
    () => Array.from(linePricing.values()).reduce((sum, p) => sum + (p.total || 0), 0),
    [linePricing]
  );

  const occupancyTotals = useMemo(() => {
    return lines.reduce(
      (acc, l) => ({
        adults: acc.adults + (parseInt(l.adults) || 0),
        children: acc.children + (parseInt(l.children) || 0),
        teens: acc.teens + (parseInt(l.teens) || 0),
        infants: acc.infants + (parseInt(l.infants) || 0),
        pets: acc.pets + (parseInt(l.pets) || 0),
      }),
      { adults: 0, children: 0, teens: 0, infants: 0, pets: 0 }
    );
  }, [lines]);

  const resetAll = () => {
    setForm({
      guest_name: "", guest_email: "", guest_phone: "", guest_company: "",
      second_guest_name: "", booking_made_by: "",
      check_in: undefined, check_out: undefined,
      total_price: "", deposit_amount: "",
      payment_status: "unpaid", payment_method: "",
      special_requests: "", internal_notes: "", booking_channel: "direct",
    });
    setLines([newLine()]);
    setCrm(emptyBookerSegmentation());
    setInvoiceTo({ name: "", vat: "", address: "" });
  };

  const handleSave = async () => {
    if (!effectivePropertyId) {
      toast.error(portfolioMode ? "Please select a property" : "No property selected");
      return;
    }
    if (!form.guest_name || !form.guest_email || !form.check_in || !form.check_out) {
      toast.error("Please fill in guest name, email and dates");
      return;
    }
    if (nights < 1) {
      toast.error("Check-out must be after check-in");
      return;
    }
    const validLines = lines.filter(l => l.room_type_id);
    if (validLines.length === 0) {
      toast.error("Add at least one room line with a room type");
      return;
    }

    const totalPrice = form.total_price ? parseFloat(form.total_price) : autoTotal;
    if (!totalPrice || totalPrice <= 0) {
      toast.error("Booking total is R0. Enter a total price or configure rates for these room types before saving.");
      return;
    }

    setSaving(true);
    const autoStatus = form.payment_status === "paid" ? "confirmed" : "pending";

    // 1. Upsert guest profile
    let guestId: string | null = null;
    try {
      const { data: existingGuest } = await supabase
        .from("rolos_guest_profiles")
        .select("id, total_stays, total_spent")
        .eq("property_id", effectivePropertyId)
        .eq("email", form.guest_email)
        .maybeSingle();

      if (existingGuest) {
        guestId = existingGuest.id;
        await supabase.from("rolos_guest_profiles").update({
          full_name: form.guest_name,
          phone: form.guest_phone || null,
          total_stays: (existingGuest.total_stays || 0) + 1,
          total_spent: (existingGuest.total_spent || 0) + totalPrice,
          last_stay_date: format(form.check_in!, "yyyy-MM-dd"),
        }).eq("id", existingGuest.id);
      } else {
        const { data: newGuest } = await supabase.from("rolos_guest_profiles").insert({
          property_id: effectivePropertyId,
          full_name: form.guest_name,
          email: form.guest_email,
          phone: form.guest_phone || null,
          total_stays: 1,
          total_spent: totalPrice,
          last_stay_date: format(form.check_in!, "yyyy-MM-dd"),
        }).select("id").single();
        guestId = newGuest?.id || null;
      }
    } catch (e) {
      console.warn("Guest profile upsert failed:", e);
    }

    // 2. Insert booking (aggregate occupancy across all room lines)
    const nameParts = form.guest_name.trim().split(/\s+/);
    const payload: Record<string, unknown> = {
      property_id: effectivePropertyId,
      guest_name: form.guest_name,
      guest_first_name: nameParts[0] || null,
      guest_last_name: nameParts.length > 1 ? nameParts.slice(1).join(" ") : null,
      guest_company: form.guest_company || null,
      second_guest_name: form.second_guest_name || null,
      booking_made_by: form.booking_made_by || null,
      guest_email: form.guest_email,
      guest_phone: form.guest_phone || null,
      check_in_date: format(form.check_in!, "yyyy-MM-dd"),
      check_out_date: format(form.check_out!, "yyyy-MM-dd"),
      room_type_id: validLines[0].room_type_id,
      adults: occupancyTotals.adults || 1,
      children: occupancyTotals.children,
      teens: occupancyTotals.teens,
      infants: occupancyTotals.infants,
      pets: occupancyTotals.pets,
      total_price: totalPrice,
      status: autoStatus,
      payment_status: form.payment_status,
      payment_method: form.payment_method || null,
      deposit_amount: form.deposit_amount ? parseFloat(form.deposit_amount) : null,
      special_requests: form.special_requests || null,
      internal_notes: form.internal_notes || null,
      booking_channel: form.booking_channel || "direct",
      integration_type: "rolos",
      booker_is_guest: crm.booker_is_guest,
      booker_name: crm.booker_is_guest ? null : (crm.booker_name || null),
      booker_email: crm.booker_is_guest ? null : (crm.booker_email || null),
      booker_phone: crm.booker_is_guest ? null : (crm.booker_phone || null),
      company_account_id: crm.company_account_id,
      agent_account_id: crm.agent_account_id,
      source_account_id: crm.source_account_id,
      market_segment: crm.market_segment || null,
      comm_channel: crm.comm_channel || null,
      invoice_to_name: invoiceTo.name || null,
      invoice_to_vat: invoiceTo.vat || null,
      invoice_to_address: invoiceTo.address || null,
    };

    const assignedRoomIds = validLines.map(l => l.room_id).filter(Boolean);
    if (assignedRoomIds.length) payload.rolos_room_ids = assignedRoomIds;
    if (guestId) payload.rolos_guest_id = guestId;

    const { data: insertedData, error } = await supabase.from("bookings").insert(payload as never).select("id").single();

    if (error) {
      setSaving(false);
      toast.error("Failed to create booking: " + error.message);
      return;
    }

    // 3. Persist the per-room lines (rate plan + occupancy + nightly rate)
    if (insertedData?.id) {
      const lineRows = validLines.map(l => {
        const pricing = linePricing.get(l.key);
        const lineTotal = pricing?.total || 0;
        return {
          booking_id: insertedData.id,
          room_id: l.room_id || null,
          room_type_id: l.room_type_id,
          rate_plan_id: l.rate_plan_id || null,
          rate_charged: lineTotal,
          nightly_rate: nights > 0 ? Math.round((lineTotal / nights) * 100) / 100 : null,
          adults: parseInt(l.adults) || 1,
          children: parseInt(l.children) || 0,
          teens: parseInt(l.teens) || 0,
          infants: parseInt(l.infants) || 0,
          pets: parseInt(l.pets) || 0,
          second_guest_name: form.second_guest_name || null,
        };
      });
      const { error: lineError } = await supabase.from("rolos_booking_rooms").insert(lineRows as never);
      if (lineError) console.warn("Room line insert failed:", lineError);

      // Post charges + the accommodation / F&B split immediately so the folio is
      // correct from creation instead of waiting for the night audit.
      try {
        await callPmsApi("apply_service_charges", { booking_id: insertedData.id });
      } catch (chargeErr) {
        console.warn("Service charge / revenue split apply failed:", chargeErr);
      }

      // Package components post as stream-tagged folio lines, exactly as they do
      // on a group pickup.
      if (packageId !== "none") {
        try {
          await callPmsApi("apply_package", { booking_id: insertedData.id, package_id: packageId });
        } catch (pkgErr) {
          console.warn("Package apply failed:", pkgErr);
          toast.error("Booking saved, but the package could not be applied");
        }
      }
    }


    setSaving(false);
    toast.success(`Booking created as "${autoStatus}"${validLines.length > 1 ? ` · ${validLines.length} rooms` : ""}`);

    // 4. Send confirmation email (non-blocking)
    if (insertedData?.id) {
      try {
        const { data: emailData, error: emailError } = await supabase.functions.invoke("send-booking-email", {
          body: { booking_id: insertedData.id, status: "success" },
        });
        const reason = (emailData as { reason?: string } | null)?.reason || emailError?.message;
        if (emailError || (emailData && (emailData as { ok?: boolean }).ok === false)) {
          console.warn("Confirmation email failed:", reason || emailError);
          toast.warning(`Booking saved — email skipped${reason ? `: ${reason}` : ""}`);
        } else {
          toast.success("Confirmation email sent to " + form.guest_email);
        }
      } catch (emailErr: unknown) {
        console.warn("Email send error:", emailErr);
        toast.warning(`Booking saved — email skipped: ${(emailErr as Error)?.message || "unknown error"}`);
      }
    }

    onOpenChange(false);
    resetAll();
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add Booking</DialogTitle>
        </DialogHeader>

        {portfolioMode && (
          <div className="space-y-1.5">
            <Label>Property *</Label>
            <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
              <SelectTrigger><SelectValue placeholder="Select property" /></SelectTrigger>
              <SelectContent>
                {portfolioOptions!.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        {!effectivePropertyId ? (
          <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/20 p-6 text-center">
            <p className="text-sm font-medium text-foreground">Select a property to start</p>
            <p className="text-xs text-muted-foreground mt-1">Booking details become available once a property is chosen.</p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
            {/* ─────────── Left panel: stay + guest ─────────── */}
            <div className="space-y-4">
              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Stay</h4>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn("w-full justify-start text-left font-normal", !form.check_in && !form.check_out && "text-muted-foreground")}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.check_in && form.check_out
                        ? `${format(form.check_in, "EEE d MMM yyyy")} → ${format(form.check_out, "EEE d MMM yyyy")}`
                        : form.check_in
                          ? `${format(form.check_in, "d MMM yyyy")} → Select departure`
                          : "Select arrival & departure"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="range"
                      numberOfMonths={2}
                      selected={{ from: form.check_in, to: form.check_out }}
                      onSelect={(range: { from?: Date; to?: Date } | undefined) => {
                        setForm(p => ({ ...p, check_in: range?.from, check_out: range?.to }));
                      }}
                      disabled={date => date < new Date(new Date().setHours(0, 0, 0, 0))}
                      initialFocus
                      className="p-3 pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
                {nights > 0 && (
                  <p className="text-xs text-muted-foreground">{nights} night{nights !== 1 ? "s" : ""}</p>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Guest</h4>
                <div>
                  <Label>Guest Name *</Label>
                  <GuestNameAutocomplete
                    propertyId={effectivePropertyId}
                    value={form.guest_name}
                    onChange={(v) => update("guest_name", v)}
                    onSelect={(g) => {
                      setForm((p) => ({
                        ...p,
                        guest_name: g.full_name || p.guest_name,
                        guest_email: g.email || p.guest_email,
                        guest_phone: g.phone || p.guest_phone,
                      }));
                    }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Email *</Label>
                    <Input type="email" value={form.guest_email} onChange={e => update("guest_email", e.target.value)} placeholder="guest@email.com" />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={form.guest_phone} onChange={e => update("guest_phone", e.target.value)} placeholder="+27..." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Company</Label>
                    <Input value={form.guest_company} onChange={e => update("guest_company", e.target.value)} placeholder="Optional" />
                  </div>
                  <div>
                    <Label>2nd Guest</Label>
                    <Input value={form.second_guest_name} onChange={e => update("second_guest_name", e.target.value)} placeholder="Optional" />
                  </div>
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Booking</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Channel / Origin *</Label>
                    <Select value={form.booking_channel} onValueChange={v => update("booking_channel", v)}>
                      <SelectTrigger><SelectValue placeholder="Select channel" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="direct">Direct Booking</SelectItem>
                        <SelectItem value="walk_in">Walk-in</SelectItem>
                        <SelectItem value="phone">Phone</SelectItem>
                        <SelectItem value="email">Email</SelectItem>
                        <SelectItem value="website">Own Website</SelectItem>
                        <SelectItem value="booking_com">Booking.com</SelectItem>
                        <SelectItem value="lekkeslaap">LekkeSlaap</SelectItem>
                        <SelectItem value="safarinow">SafariNow</SelectItem>
                        <SelectItem value="nightsbridge">NightsBridge</SelectItem>
                        <SelectItem value="agoda">Agoda</SelectItem>
                        <SelectItem value="expedia">Expedia</SelectItem>
                        <SelectItem value="airbnb">Airbnb</SelectItem>
                        <SelectItem value="vrbo">Vrbo</SelectItem>
                        <SelectItem value="hostelworld">Hostelworld</SelectItem>
                        <SelectItem value="hotels_com">Hotels.com</SelectItem>
                        <SelectItem value="tripadvisor">TripAdvisor</SelectItem>
                        <SelectItem value="google">Google Hotels</SelectItem>
                        <SelectItem value="hyperguest">HyperGuest</SelectItem>
                        <SelectItem value="travel_agent">Travel Agent</SelectItem>
                        <SelectItem value="tour_operator">Tour Operator</SelectItem>
                        <SelectItem value="corporate">Corporate</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Booking Made By</Label>
                    <Input value={form.booking_made_by} onChange={e => update("booking_made_by", e.target.value)} placeholder="Staff / agent name" />
                  </div>
                </div>
                <div>
                  <Label>Special Requests (guest visible)</Label>
                  <Textarea value={form.special_requests} onChange={e => update("special_requests", e.target.value)} rows={2} placeholder="Any special requirements..." />
                </div>
                <div>
                  <Label>Internal Notes (staff only)</Label>
                  <Textarea value={form.internal_notes} onChange={e => update("internal_notes", e.target.value)} rows={2} placeholder="Not shown to the guest" />
                </div>
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Booker &amp; Segmentation</h4>
                <BookerSegmentationFields
                  compact
                  value={crm}
                  onChange={patch => setCrm(p => ({ ...p, ...patch }))}
                  accounts={accounts}
                  isPortfolioScoped={isPortfolioScoped}
                  onSaveAccount={saveAccount}
                  onCompanyLinked={applyCompany}
                />
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Invoice To</Label>
                    <Input value={invoiceTo.name} onChange={e => setInvoiceTo(p => ({ ...p, name: e.target.value }))} placeholder="Defaults to the guest" />
                  </div>
                  <div>
                    <Label>Invoice VAT No.</Label>
                    <Input value={invoiceTo.vat} onChange={e => setInvoiceTo(p => ({ ...p, vat: e.target.value }))} placeholder="Optional" />
                  </div>
                </div>
                <div>
                  <Label>Invoice Address</Label>
                  <Textarea value={invoiceTo.address} onChange={e => setInvoiceTo(p => ({ ...p, address: e.target.value }))} rows={2} placeholder="Auto-filled when a company is linked" />
                </div>
              </div>
            </div>

            {/* ─────────── Right panel: room lines + account ─────────── */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Select Room / Unit</h4>
                <Button size="sm" variant="outline" onClick={() => setLines(prev => [...prev, newLine()])}>
                  <Plus className="h-3 w-3 mr-1" />Add Room
                </Button>
              </div>

              <div className="space-y-2">
                {lines.map((l, idx) => {
                  const pricing = linePricing.get(l.key);
                  const availableRooms = roomsForType(l.room_type_id, l.room_id);
                  return (
                    <div key={l.key} className="rounded-lg border border-border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold flex items-center gap-1">
                          <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />Room {idx + 1}
                        </span>
                        <div className="flex items-center gap-2">
                          {pricing && pricing.total > 0 && (
                            <Badge variant="secondary" className="text-[10px]">R{pricing.total.toLocaleString()}</Badge>
                          )}
                          {lines.length > 1 && (
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setLines(prev => prev.filter(x => x.key !== l.key))}>
                              <Trash2 className="h-3.5 w-3.5 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[11px]">Room Type *</Label>
                          <Select value={l.room_type_id} onValueChange={v => updateLine(l.key, { room_type_id: v, room_id: "" })}>
                            <SelectTrigger className="h-9"><SelectValue placeholder={activeRoomTypes.length ? "Select type" : "No room types"} /></SelectTrigger>
                            <SelectContent>
                              {activeRoomTypes.map(rt => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-[11px]">Unit</Label>
                          <Select value={l.room_id} onValueChange={v => updateLine(l.key, { room_id: v })} disabled={!l.room_type_id}>
                            <SelectTrigger className="h-9"><SelectValue placeholder={availableRooms.length ? "Auto / select" : "No units"} /></SelectTrigger>
                            <SelectContent>
                              {availableRooms.map(r => (
                                <SelectItem key={r.id} value={r.id}>{r.room_number}{r.room_name ? ` (${r.room_name})` : ""}</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div>
                        <Label className="text-[11px]">Rate Plan</Label>
                        <Select value={l.rate_plan_id} onValueChange={v => updateLine(l.key, { rate_plan_id: v })}>
                          <SelectTrigger className="h-9"><SelectValue placeholder={ratePlans.length ? "Default rate" : "No rate plans"} /></SelectTrigger>
                          <SelectContent>
                            {ratePlans.map(rp => (
                              <SelectItem key={rp.id} value={rp.id}>
                                {rp.name}{rp.base_rate ? ` · R${rp.base_rate.toLocaleString()}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="grid grid-cols-5 gap-1.5">
                        <div><Label className="text-[10px]">Adults</Label><Input className="h-8 px-2" type="number" min={1} value={l.adults} onChange={e => updateLine(l.key, { adults: e.target.value })} /></div>
                        <div><Label className="text-[10px]">Ch 0–2</Label><Input className="h-8 px-2" type="number" min={0} value={l.infants} onChange={e => updateLine(l.key, { infants: e.target.value })} /></div>
                        <div><Label className="text-[10px]">Ch 3–12</Label><Input className="h-8 px-2" type="number" min={0} value={l.children} onChange={e => updateLine(l.key, { children: e.target.value })} /></div>
                        <div><Label className="text-[10px]">Teens</Label><Input className="h-8 px-2" type="number" min={0} value={l.teens} onChange={e => updateLine(l.key, { teens: e.target.value })} /></div>
                        <div><Label className="text-[10px]">Pets</Label><Input className="h-8 px-2" type="number" min={0} value={l.pets} onChange={e => updateLine(l.key, { pets: e.target.value })} /></div>
                      </div>

                      <div className="flex items-end gap-2">
                        <div className="flex-1">
                          <Label className="text-[11px]">Line Total (override)</Label>
                          <Input
                            className="h-8"
                            type="number"
                            min={0}
                            value={l.price_override}
                            onChange={e => updateLine(l.key, { price_override: e.target.value })}
                            placeholder={pricing && pricing.total > 0 ? `Auto: R${pricing.total.toLocaleString()}` : "0.00"}
                          />
                        </div>
                      </div>

                      {pricing?.label && !pricing.unresolved && (
                        <p className="text-[10px] text-muted-foreground">{pricing.label}</p>
                      )}
                      {pricing?.unresolved && l.room_type_id && nights > 0 && (
                        <p className="text-[10px] text-warning dark:text-amber-400 font-medium">
                          No rate configured for these dates — enter a line total.
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              <Separator />

              {/* Account summary */}
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Accommodation ({lines.filter(l => l.room_type_id).length} room{lines.filter(l => l.room_type_id).length !== 1 ? "s" : ""})</span>
                  <span className="font-semibold">R{autoTotal.toLocaleString()}</span>
                </div>
                {packages.length > 0 && (
                  <div>
                    <Label className="text-[11px]">Package (optional)</Label>
                    <Select value={packageId} onValueChange={setPackageId}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="No package" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No package</SelectItem>
                        {packages.map(pkg => (
                          <SelectItem key={pkg.id} value={pkg.id}>{pkg.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-[10px] text-muted-foreground mt-1">Components post to the folio split by revenue stream (accommodation / F&amp;B).</p>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">

                  <div>
                    <Label className="text-[11px]">Booking Total (override)</Label>
                    <Input className="h-8" type="number" min={0} value={form.total_price} onChange={e => update("total_price", e.target.value)} placeholder={autoTotal ? `Auto: R${autoTotal.toLocaleString()}` : "0.00"} />
                  </div>
                  <div>
                    <Label className="text-[11px]">Deposit</Label>
                    <Input className="h-8" type="number" min={0} value={form.deposit_amount} onChange={e => update("deposit_amount", e.target.value)} placeholder="0.00" />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-[11px]">Payment Status</Label>
                    <Select value={form.payment_status} onValueChange={v => update("payment_status", v)}>
                      <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="unpaid">Unpaid</SelectItem>
                        <SelectItem value="partial">Partial</SelectItem>
                        <SelectItem value="paid">Paid</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[11px]">Method</Label>
                    <Select value={form.payment_method} onValueChange={v => update("payment_method", v)}>
                      <SelectTrigger className="h-8"><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="card">Card</SelectItem>
                        <SelectItem value="eft">EFT</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Occupancy: {occupancyTotals.adults}A
                  {occupancyTotals.children ? ` · ${occupancyTotals.children}C` : ""}
                  {occupancyTotals.teens ? ` · ${occupancyTotals.teens}T` : ""}
                  {occupancyTotals.infants ? ` · ${occupancyTotals.infants} infant` : ""}
                  {occupancyTotals.pets ? ` · ${occupancyTotals.pets} pet` : ""} · Status auto-set: Paid → Confirmed, otherwise → Pending
                </p>
                <Button onClick={handleSave} disabled={saving} className="w-full">
                  {saving ? "Creating..." : "Create Booking"}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface GuestSuggestion {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  total_stays: number | null;
  last_stay_date: string | null;
}

function GuestNameAutocomplete({
  propertyId,
  value,
  onChange,
  onSelect,
}: {
  propertyId: string;
  value: string;
  onChange: (v: string) => void;
  onSelect: (g: GuestSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<GuestSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastPicked = useRef<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  // Debounced search across guest profiles (name/email/phone) for this property.
  useEffect(() => {
    const term = value.trim();
    if (term && term === lastPicked.current) return;
    if (term.length < 2 || !propertyId) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      const like = `%${term}%`;
      const { data, error } = await supabase
        .from("rolos_guest_profiles")
        .select("id, full_name, email, phone, total_stays, last_stay_date")
        .eq("property_id", propertyId)
        .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
        .order("last_stay_date", { ascending: false, nullsFirst: false })
        .limit(8);

      if (cancelled) return;
      if (error) {
        console.warn("guest search failed:", error);
        setSuggestions([]);
      } else {
        setSuggestions((data || []) as GuestSuggestion[]);
        setOpen((data?.length ?? 0) > 0);
      }
      setLoading(false);
    }, 220);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [value, propertyId]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <Input
        value={value}
        onChange={(e) => {
          lastPicked.current = "";
          onChange(e.target.value);
        }}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        placeholder="Start typing to search past guests…"
        autoComplete="off"
      />
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-72 overflow-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No matching guests</div>
          )}
          {suggestions.map((g) => (
            <button
              key={g.id}
              type="button"
              onClick={() => {
                lastPicked.current = g.full_name;
                onSelect(g);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground border-b border-border/40 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium truncate">{g.full_name}</span>
                {g.total_stays ? (
                  <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                    {g.total_stays} stay{g.total_stays === 1 ? "" : "s"}
                  </span>
                ) : null}
              </div>
              <div className="text-[11px] text-muted-foreground truncate">
                {[g.email, g.phone].filter(Boolean).join(" · ") || "—"}
                {g.last_stay_date ? ` · last ${g.last_stay_date}` : ""}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
