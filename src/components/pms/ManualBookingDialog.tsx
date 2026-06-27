import { useState, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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

interface ManualBookingDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  roomTypes: RoomType[];
  rooms: Room[];
  ratePlans: RatePlan[];
  onCreated: () => void;
  /** Optional: resolve the nightly rate for a room type on a specific date.
   *  Uses the same logic as the calendar (rolos_rate_prices, amenities.season_rates, plan base_rate, default_rate, cache). */
  getRateForDate?: (roomTypeId: string, date: Date) => number | null;
}

export function ManualBookingDialog({ open, onOpenChange, propertyId, roomTypes, rooms, ratePlans, onCreated, getRateForDate }: ManualBookingDialogProps) {
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    guest_name: "",
    guest_email: "",
    guest_phone: "",
    check_in: undefined as Date | undefined,
    check_out: undefined as Date | undefined,
    room_type_id: "",
    room_id: "",
    adults: "1",
    children: "0",
    teens: "0",
    infants: "0",
    pets: "0",
    total_price: "",
    payment_status: "unpaid",
    payment_method: "",
    status: "confirmed",
    special_requests: "",
  });


  const filteredRooms = useMemo(() =>
    rooms.filter(r => r.room_type_id === form.room_type_id && r.status !== "out_of_service"),
    [rooms, form.room_type_id]
  );

  const nights = useMemo(() => {
    if (!form.check_in || !form.check_out) return 0;
    return Math.max(0, differenceInDays(form.check_out, form.check_in));
  }, [form.check_in, form.check_out]);

  // Sum nightly rates using the calendar's resolver (season-aware), falling back
  // to room-type default_rate. No per-unit rate column exists today.
  const nightlyRates = useMemo(() => {
    if (!nights || !form.check_in || !form.room_type_id) return [] as number[];
    const rt = roomTypes.find(t => t.id === form.room_type_id);
    const defaultRate = rt?.default_rate && rt.default_rate > 0 ? rt.default_rate : null;

    const out: number[] = [];
    for (let i = 0; i < nights; i++) {
      const d = new Date(form.check_in);
      d.setDate(d.getDate() + i);
      const resolved = getRateForDate ? getRateForDate(form.room_type_id, d) : null;
      const rate = (resolved && resolved > 0) ? resolved : (defaultRate ?? 0);
      out.push(rate);
    }
    return out;
  }, [nights, form.check_in, form.room_type_id, roomTypes, getRateForDate]);

  const rateUnresolved = nightlyRates.length > 0 && nightlyRates.every(r => r === 0);

  const autoPrice = useMemo(() => {
    if (!nightlyRates.length || rateUnresolved) return null;
    return nightlyRates.reduce((a, b) => a + b, 0);
  }, [nightlyRates, rateUnresolved]);

  const priceBreakdown = useMemo(() => {
    if (!nights || !autoPrice || !nightlyRates.length) return null;
    const min = Math.min(...nightlyRates);
    const max = Math.max(...nightlyRates);
    const rangeLabel = min === max ? `R${min.toLocaleString()}` : `R${min.toLocaleString()}–R${max.toLocaleString()}`;
    return `${rangeLabel}/night × ${nights} night${nights !== 1 ? 's' : ''}`;
  }, [nights, autoPrice, nightlyRates]);


  const update = (key: string, value: any) => setForm(p => ({ ...p, [key]: value }));

  const handleSave = async () => {
    if (!form.guest_name || !form.guest_email || !form.check_in || !form.check_out || !form.room_type_id) {
      toast.error("Please fill in guest name, email, dates, and room type");
      return;
    }
    if (nights < 1) {
      toast.error("Check-out must be after check-in");
      return;
    }

    setSaving(true);
    const totalPrice = form.total_price ? parseFloat(form.total_price) : (autoPrice || 0);
    // Auto-determine status: paid → confirmed, else pending
    const autoStatus = form.payment_status === "paid" ? "confirmed" : "pending";

    // 1. Upsert guest profile
    let guestId: string | null = null;
    try {
      const { data: existingGuest } = await supabase
        .from("rolos_guest_profiles")
        .select("id, total_stays, total_spent")
        .eq("property_id", propertyId)
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
          property_id: propertyId,
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

    // 2. Insert booking
    const payload: any = {
      property_id: propertyId,
      guest_name: form.guest_name,
      guest_email: form.guest_email,
      guest_phone: form.guest_phone || null,
      check_in_date: format(form.check_in!, "yyyy-MM-dd"),
      check_out_date: format(form.check_out!, "yyyy-MM-dd"),
      room_type_id: form.room_type_id,
      adults: parseInt(form.adults) || 1,
      children: parseInt(form.children) || 0,
      teens: parseInt(form.teens) || 0,
      infants: parseInt(form.infants) || 0,
      pets: parseInt(form.pets) || 0,
      total_price: totalPrice,
      status: autoStatus,
      payment_status: form.payment_status,
      payment_method: form.payment_method || null,
      special_requests: form.special_requests || null,
      booking_channel: "direct",
      integration_type: "rolos",
    };

    if (form.room_id) payload.rolos_room_ids = [form.room_id];
    if (guestId) payload.rolos_guest_id = guestId;

    const { data: insertedData, error } = await supabase.from("bookings").insert(payload).select("id").single();
    setSaving(false);

    if (error) {
      toast.error("Failed to create booking: " + error.message);
      return;
    }

    toast.success(`Booking created as "${autoStatus}"`);

    // 3. Send confirmation email (non-blocking)
    if (insertedData?.id) {
      try {
        const { data: emailData, error: emailError } = await supabase.functions.invoke("send-booking-email", {
          body: { booking_id: insertedData.id, status: "success" },
        });
        const reason = (emailData as any)?.reason || emailError?.message;
        if (emailError || (emailData && (emailData as any).ok === false)) {
          console.warn("Confirmation email failed:", reason || emailError);
          toast.warning(`Booking saved — email skipped${reason ? `: ${reason}` : ""}`);
        } else {
          toast.success("Confirmation email sent to " + form.guest_email);
        }
      } catch (emailErr: any) {
        console.warn("Email send error:", emailErr);
        toast.warning(`Booking saved — email skipped: ${emailErr?.message || "unknown error"}`);
      }
    }
    onOpenChange(false);
    setForm({
      guest_name: "", guest_email: "", guest_phone: "",
      check_in: undefined, check_out: undefined,
      room_type_id: "", room_id: "",
      adults: "1", children: "0", teens: "0", infants: "0", pets: "0",
      total_price: "", payment_status: "unpaid", payment_method: "",
      status: "confirmed", special_requests: "",
    });
    onCreated();
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New Manual Booking</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {/* Guest Info */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Guest Information</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Guest Name *</Label>
                <Input value={form.guest_name} onChange={e => update("guest_name", e.target.value)} placeholder="Full name" />
              </div>
              <div>
                <Label>Email *</Label>
                <Input type="email" value={form.guest_email} onChange={e => update("guest_email", e.target.value)} placeholder="guest@email.com" />
              </div>
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.guest_phone} onChange={e => update("guest_phone", e.target.value)} placeholder="+27..." />
            </div>
          </div>

          {/* Stay Details */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Stay Details</h4>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Check-in *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.check_in && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.check_in ? format(form.check_in, "d MMM yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.check_in} onSelect={d => update("check_in", d)} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div>
                <Label>Check-out *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !form.check_out && "text-muted-foreground")}>
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {form.check_out ? format(form.check_out, "d MMM yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={form.check_out} onSelect={d => update("check_out", d)} disabled={date => form.check_in ? date <= form.check_in : false} className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            {nights > 0 && <p className="text-xs text-muted-foreground">{nights} night{nights !== 1 ? "s" : ""}</p>}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Room Type *</Label>
                <Select value={form.room_type_id} onValueChange={v => { update("room_type_id", v); update("room_id", ""); }}>
                  <SelectTrigger><SelectValue placeholder="Select room type" /></SelectTrigger>
                  <SelectContent>
                    {roomTypes.map(rt => (
                      <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Room Assignment</Label>
                <Select value={form.room_id} onValueChange={v => update("room_id", v)} disabled={!form.room_type_id}>
                  <SelectTrigger><SelectValue placeholder={filteredRooms.length ? "Select room" : "No rooms"} /></SelectTrigger>
                  <SelectContent>
                    {filteredRooms.map(r => (
                      <SelectItem key={r.id} value={r.id}>{r.room_number}{r.room_name ? ` (${r.room_name})` : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {rateUnresolved && form.room_type_id && nights > 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-400 font-medium">
                Rate unavailable for this room type / date — please enter Total Price manually below.
              </p>
            )}

          </div>

          {/* Guest Counts */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Guests</h4>
            <div className="grid grid-cols-5 gap-2">
              <div><Label className="text-xs">Adults *</Label><Input type="number" min={1} value={form.adults} onChange={e => update("adults", e.target.value)} /></div>
              <div><Label className="text-xs">Children</Label><Input type="number" min={0} value={form.children} onChange={e => update("children", e.target.value)} /></div>
              <div><Label className="text-xs">Teens</Label><Input type="number" min={0} value={form.teens} onChange={e => update("teens", e.target.value)} /></div>
              <div><Label className="text-xs">Infants</Label><Input type="number" min={0} value={form.infants} onChange={e => update("infants", e.target.value)} /></div>
              <div><Label className="text-xs">Pets</Label><Input type="number" min={0} value={form.pets} onChange={e => update("pets", e.target.value)} /></div>
            </div>
          </div>

          {/* Pricing & Payment */}
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Pricing & Payment</h4>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Total Price (ZAR)</Label>
                <Input type="number" min={0} value={form.total_price} onChange={e => update("total_price", e.target.value)} placeholder={autoPrice ? `Auto: R${autoPrice.toLocaleString()}` : "0.00"} />
                {autoPrice && !form.total_price && (
                  <div className="mt-0.5">
                    <p className="text-[10px] text-muted-foreground">Auto: R{autoPrice.toLocaleString()}</p>
                    {priceBreakdown && <p className="text-[10px] text-muted-foreground/70">{priceBreakdown}</p>}
                  </div>
                )}
              </div>
              <div>
                <Label>Payment Status</Label>
                <Select value={form.payment_status} onValueChange={v => update("payment_status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unpaid">Unpaid</SelectItem>
                    <SelectItem value="partial">Partial</SelectItem>
                    <SelectItem value="paid">Paid</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Payment Method</Label>
                <Select value={form.payment_method} onValueChange={v => update("payment_method", v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="cash">Cash</SelectItem>
                    <SelectItem value="card">Card</SelectItem>
                    <SelectItem value="eft">EFT</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Status & Special Requests */}
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">Status auto-set: Paid → Confirmed, otherwise → Pending</p>
            <div>
              <Label>Special Requests</Label>
              <Textarea value={form.special_requests} onChange={e => update("special_requests", e.target.value)} placeholder="Any special requirements..." rows={3} />
            </div>
          </div>

          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? "Creating..." : "Create Booking"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
