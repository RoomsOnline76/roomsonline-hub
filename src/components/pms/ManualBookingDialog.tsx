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
import { StayRangePicker } from "@/components/ui/stay-range-picker";
import { cn } from "@/lib/utils";
import { format, differenceInDays } from "date-fns";
import { CalendarIcon, Plus, Trash2, BedDouble } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { callPmsApi } from "@/hooks/usePmsApi";
import { toast } from "sonner";
import { useCrmAccounts, useCrmScopeForProperty, type CrmAccount } from "@/hooks/useCrmAccounts";
import { useActivePackages } from "@/hooks/useActivePackages";
import { ensureGuestProfile, rebuildGuestStats } from "@/lib/guestIdentity";
import { syncBookingToHubSpot } from "@/lib/hubspotEvents";
import { pushBookingToChannel } from "@/lib/channelBookingSync";
import { useAuth } from "@/hooks/useAuth";
import { useUnitAvailability } from "@/hooks/useUnitAvailability";
import {
  blockedNightsFor,
  disabledDaysFrom,
  blockedDaysFrom,
  findBlockedInRange,
  isoDay,
  canOverbook,
  type BlockedNight,
} from "@/lib/unitAvailability";
import {
  BookerSegmentationFields,
  emptyBookerSegmentation,
  type BookerSegmentationValue,
} from "@/components/pms/crm/BookerSegmentationFields";

/** Turns the database availability guard's codes into operator-readable copy. */
function friendlyBookingError(message: string, fallbackPrefix: string): string {
  const clean = (raw: string) => raw.replace(/^[A-Z_]+:\s*/, "").trim();
  if (message.includes("UNIT_ALREADY_BOOKED")) return clean(message.split("UNIT_ALREADY_BOOKED:")[1] ?? "This unit is already booked for these nights.");
  if (message.includes("NO_UNITS_FREE")) return clean(message.split("NO_UNITS_FREE:")[1] ?? "No units of this type are free for these nights.");
  if (message.includes("OCCUPANCY_EXCEEDED")) return clean(message.split("OCCUPANCY_EXCEEDED:")[1] ?? "Too many guests for this unit.");
  return `${fallbackPrefix}: ${message}`;
}

interface RoomType {
  id: string;
  name: string;
  default_rate: number | null;
  /** Sleeping capacity of one unit of this type — enforced per booking line. */
  max_occupancy?: number | null;
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
  /** Portfolio mode: resolve rates for any property in scope, not just the selected one. */
  getRateForPropertyDate?: (propertyId: string, roomTypeId: string, date: Date) => number | null;
  /** Optional portfolio scope selector. */
  portfolioOptions?: PortfolioPropertyOption[];

  /** Optional prefill, e.g. from a dragged Room Plan span or a converted inquiry. */
  initialValues?: {
    propertyId?: string | null;
    roomTypeId?: string | null;
    roomId?: string | null;
    checkIn?: Date | null;
    checkOut?: Date | null;
    guestName?: string | null;
    guestEmail?: string | null;
    guestPhone?: string | null;
    notes?: string | null;
    adults?: number | null;
    children?: number | null;
  } | null;
  /** Fires with the new booking id — used when a caller must link the stay back to a record. */
  onCreatedBooking?: (bookingId: string) => void;

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

export function ManualBookingDialog({ open, onOpenChange, propertyId, roomTypes, rooms, ratePlans, onCreated, getRateForDate, getRateForPropertyDate, portfolioOptions, initialValues, onCreatedBooking }: ManualBookingDialogProps) {
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

  // ───── Guest lookup hydration ─────
  /** The guest record chosen from the search, used for the summary strip. */
  const [pickedGuest, setPickedGuest] = useState<GuestSuggestion | null>(null);

  /** Property names for the suggestion rows (portfolio scope shows where a guest is known). */
  const propertyNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const p of portfolioOptions || []) map.set(p.id, p.name);
    return map;
  }, [portfolioOptions]);

  const searchScopeIds = useMemo(() => {
    if (portfolioMode) return (portfolioOptions || []).map(p => p.id);
    return effectivePropertyId ? [effectivePropertyId] : [];
  }, [portfolioMode, portfolioOptions, effectivePropertyId]);

  /**
   * Fill everything already known about a guest without ever clobbering values
   * the user has typed. Pulls contact + preference data from the profile and
   * habitual details (company, second guest, booker, channel) from their most
   * recent booking.
   */
  const hydrateFromGuest = useCallback(async (g: GuestSuggestion) => {
    setPickedGuest(g);
    const keepOrTake = (current: string, incoming?: string | null) =>
      current.trim() ? current : (incoming || "");

    setForm(p => ({
      ...p,
      guest_name: g.full_name || p.guest_name,
      guest_email: keepOrTake(p.guest_email, g.email),
      guest_phone: keepOrTake(p.guest_phone, g.phone),
    }));

    // Guest notes / nationality are appended to internal notes so nothing is lost.
    const profileBits = [
      g.nationality ? `Nationality: ${g.nationality}` : null,
      g.notes ? `Guest notes: ${g.notes}` : null,
    ].filter(Boolean).join("\n");
    if (profileBits) {
      setForm(p => ({
        ...p,
        internal_notes: p.internal_notes.includes(profileBits)
          ? p.internal_notes
          : [p.internal_notes.trim(), profileBits].filter(Boolean).join("\n"),
      }));
    }

    if (g.is_blacklisted) {
      toast.warning(`${g.full_name} is flagged as blacklisted — check before confirming.`);
    }

    // Most recent booking for habitual details.
    let query = supabase
      .from("bookings")
      .select("guest_company, second_guest_name, booking_made_by, booking_channel, booker_is_guest, booker_name, booker_email, booker_phone, market_segment, check_in_date")
      .order("check_in_date", { ascending: false })
      .limit(1);
    if (g.from_history || !g.email) {
      const email = g.email;
      query = email ? query.eq("guest_email", email) : query.eq("guest_name", g.full_name);
    } else {
      query = query.or(`rolos_guest_id.eq.${g.id},guest_email.eq.${g.email}`);
    }
    const { data, error } = await query;
    if (error) { console.warn("guest history hydration failed:", error); return; }
    const last = data?.[0];
    if (!last) return;

    setForm(p => ({
      ...p,
      guest_company: keepOrTake(p.guest_company, last.guest_company),
      second_guest_name: keepOrTake(p.second_guest_name, last.second_guest_name),
      booking_made_by: keepOrTake(p.booking_made_by, last.booking_made_by),
      booking_channel: p.booking_channel && p.booking_channel !== "direct"
        ? p.booking_channel
        : (last.booking_channel || p.booking_channel),
    }));

    // Booker details when someone else historically booked for this guest.
    if (last.booker_is_guest === false && (last.booker_name || last.booker_email)) {
      setCrm(prev => ({
        ...prev,
        booker_is_guest: false,
        booker_name: prev.booker_name || last.booker_name || "",
        booker_email: prev.booker_email || last.booker_email || "",
        booker_phone: prev.booker_phone || last.booker_phone || "",
        market_segment: prev.market_segment || last.market_segment || "",
      }));
    } else if (last.market_segment) {
      setCrm(prev => ({ ...prev, market_segment: prev.market_segment || last.market_segment || "" }));
    }

    // Match the historic company to a CRM account so invoice identity fills too.
    if (last.guest_company) {
      const target = last.guest_company.trim().toLowerCase();
      const account = accounts.find(a => a.name.trim().toLowerCase() === target);
      if (account) {
        setCrm(prev => ({ ...prev, company_account_id: prev.company_account_id || account.id }));
        applyCompany(account);
      }
    }
  }, [accounts, applyCompany]);

  /** Undo a wrong pick: clears the guest identity fields only. */
  const clearPickedGuest = useCallback(() => {
    setPickedGuest(null);
    setForm(p => ({ ...p, guest_name: "", guest_email: "", guest_phone: "" }));
  }, []);

  // Reset room lines when the active property changes so we never carry a room
  // type from a different property into the booking payload.
  useEffect(() => {
    setLines([newLine()]);
  }, [effectivePropertyId]);

  // Apply Room Plan / inquiry prefill after the property-reset effect above has run.
  useEffect(() => {
    if (!open || !initialValues) return;
    if (initialValues.propertyId) setSelectedPropertyId(initialValues.propertyId);
    const timer = setTimeout(() => {
      setForm(p => ({
        ...p,
        check_in: initialValues.checkIn || p.check_in,
        check_out: initialValues.checkOut || p.check_out,
        guest_name: initialValues.guestName || p.guest_name,
        guest_email: initialValues.guestEmail || p.guest_email,
        guest_phone: initialValues.guestPhone || p.guest_phone,
        special_requests: initialValues.notes || p.special_requests,
      }));
      if (initialValues.roomTypeId || initialValues.roomId) {
        setLines([newLine(initialValues.roomTypeId || "", initialValues.roomId || "")]);
      }
      if (initialValues.adults || initialValues.children) {
        setLines(prev =>
          prev.map((l, i) =>
            i === 0
              ? {
                  ...l,
                  adults: String(initialValues.adults ?? l.adults),
                  children: String(initialValues.children ?? l.children),
                }
              : l,
          ),
        );
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
        // In portfolio scope the calendar's single-property resolver knows nothing
        // about the chosen property, so prefer the property-aware one.
        const resolved = (portfolioMode && getRateForPropertyDate && effectivePropertyId)
          ? getRateForPropertyDate(effectivePropertyId, roomTypeId, d)
          : (getRateForDate ? getRateForDate(roomTypeId, d) : null);
        out.push((resolved && resolved > 0) ? resolved : (planRate ?? defaultRate ?? 0));
      }
      return out;
    },
    [nights, form.check_in, activeRoomTypes, ratePlans, getRateForDate, getRateForPropertyDate, portfolioMode, effectivePropertyId]
  );

  /** Per-line occupancy vs the unit's sleeping capacity. */
  const lineCapacity = useMemo(() => {
    const map = new Map<string, { max: number | null; guests: number; over: boolean }>();
    for (const l of lines) {
      const rt = activeRoomTypes.find(t => t.id === l.room_type_id);
      const max = rt?.max_occupancy && rt.max_occupancy > 0 ? rt.max_occupancy : null;
      // Infants (0–2) don't consume a sleeping slot.
      const guests = (parseInt(l.adults) || 0) + (parseInt(l.teens) || 0) + (parseInt(l.children) || 0);
      map.set(l.key, { max, guests, over: !!max && guests > max });
    }
    return map;
  }, [lines, activeRoomTypes]);


  /* ── Availability guard ────────────────────────────────────────────────
     Nights already held by a live reservation (or blocked by the property) can
     neither be picked nor saved. Privileged roles may overbook deliberately,
     which is stamped on the booking with a reason. */
  const { userRole } = useAuth();
  const mayOverbook = canOverbook(userRole);
  const [overbookReason, setOverbookReason] = useState("");
  const { availability, refresh: refreshAvailability } = useUnitAvailability(effectivePropertyId, { enabled: open });

  useEffect(() => {
    if (open) void refreshAvailability();
  }, [open, refreshAvailability]);

  /** Nights unavailable for the room types / units currently on the form. */
  const blockedNights = useMemo(() => {
    const merged = new Map<string, BlockedNight>();
    const requested = lines.filter(l => l.room_type_id);
    if (requested.length === 0) return merged;
    for (const l of requested) {
      for (const [iso, info] of blockedNightsFor(availability, l.room_type_id, l.room_id || null)) {
        if (!merged.has(iso)) merged.set(iso, info);
      }
    }
    return merged;
  }, [availability, lines]);

  const disabledStayDays = useMemo(() => disabledDaysFrom(blockedNights), [blockedNights]);
  const blockedStayDays = useMemo(() => blockedDaysFrom(blockedNights), [blockedNights]);

  /** The first clash inside the chosen stay, if any. */
  const stayClash = useMemo(() => {
    if (!form.check_in || !form.check_out || nights < 1) return null;
    return findBlockedInRange(blockedNights, isoDay(form.check_in), isoDay(form.check_out));
  }, [blockedNights, form.check_in, form.check_out, nights]);

  /** Units of a type that are free for the whole stay. */
  const unitIsFree = useCallback(
    (roomId: string) => {
      if (!form.check_in || !form.check_out || nights < 1) return true;
      const held = availability.unitNights.get(roomId);
      if (!held) return true;
      return !findBlockedInRange(held, isoDay(form.check_in), isoDay(form.check_out));
    },
    [availability, form.check_in, form.check_out, nights],
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
    setPickedGuest(null);
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
    for (let i = 0; i < validLines.length; i++) {
      const cap = lineCapacity.get(validLines[i].key);
      if (cap?.over) {
        const name = activeRoomTypes.find(t => t.id === validLines[i].room_type_id)?.name || `Room ${i + 1}`;
        toast.error(`${name} sleeps ${cap.max} — ${cap.guests} guests on room ${i + 1}. Add another room or reduce the guests.`);
        return;
      }
    }

    // Never write a stay over nights that are already sold, unless a privileged
    // operator gives a reason (which is stored on the booking).
    if (stayClash) {
      if (!mayOverbook) {
        toast.error(`${format(new Date(stayClash.iso), "d MMM")} is not available — ${stayClash.reason}.`);
        return;
      }
      if (!overbookReason.trim()) {
        toast.error("Add a reason for the overbooking before saving.");
        return;
      }
    }



    const totalPrice = form.total_price ? parseFloat(form.total_price) : autoTotal;
    if (!totalPrice || totalPrice <= 0) {
      toast.error("Booking total is R0. Enter a total price or configure rates for these room types before saving.");
      return;
    }

    setSaving(true);
    const autoStatus = form.payment_status === "paid" ? "confirmed" : "pending";

    // 1. Resolve the guest profile (email first, then normalised name — no duplicate people).
    const guestId = await ensureGuestProfile({
      propertyId: effectivePropertyId,
      fullName: form.guest_name,
      email: form.guest_email,
      phone: form.guest_phone || null,
    });


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
      // Deposit is optional. Blank (or paid in full) means "no deposit" — store 0,
      // since the column is NOT NULL and null would reject the insert.
      deposit_amount: (form.payment_status === "paid" || !form.deposit_amount)
        ? 0
        : (Number.isFinite(parseFloat(form.deposit_amount)) ? parseFloat(form.deposit_amount) : 0),
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

    /* Stamp the rate plan that priced the stay: without it a later modification cannot reprice
     * and the booking keeps its original total. */
    const stampedPlanId = validLines.find(l => l.rate_plan_id)?.rate_plan_id || null;
    if (stampedPlanId) payload.rolos_rate_plan_id = stampedPlanId;

    /* Deliberate overbooking is recorded on the stay — the database guard reads
     * this field to allow the write, so the reason is the audit trail. */
    if (stayClash && mayOverbook && overbookReason.trim()) {
      payload.overbook_override_reason = overbookReason.trim();
      payload.overbook_override_at = new Date().toISOString();
    }

    const assignedRoomIds = validLines.map(l => l.room_id).filter(Boolean);
    if (assignedRoomIds.length) payload.rolos_room_ids = assignedRoomIds;
    if (guestId) payload.rolos_guest_id = guestId;

    const { data: insertedData, error } = await supabase.from("bookings").insert(payload as never).select("id").single();

    if (error) {
      setSaving(false);
      toast.error(friendlyBookingError(error.message, "Failed to create booking"));
      void refreshAvailability();
      return;
    }

    /* Stay totals are derived from bookings, never incremented by hand. */
    await rebuildGuestStats([guestId]);

    /* Optional owner CRM add-on: no-op unless the owner connected HubSpot. */
    if (insertedData?.id) {
      syncBookingToHubSpot({
        bookingId: insertedData.id,
        guestName: form.guest_name,
        guestEmail: form.guest_email,
        guestPhone: form.guest_phone || null,
        amount: totalPrice,
        status: autoStatus,
        checkOut: format(form.check_out!, "yyyy-MM-dd"),
        tradeOrDirect: crm.booker_is_guest === false ? "trade" : "direct",
      });
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
      if (lineError) {
        console.warn("Room line insert failed:", lineError);
        toast.error(friendlyBookingError(lineError.message, "Room lines not saved"));
        void refreshAvailability();
      }

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

    // A stay created here sells nights the channel still has open — close them straight away
    // instead of waiting for the next scheduled refresh.
    if (insertedData?.id) {
      void pushBookingToChannel(insertedData.id, "created", { notify: false, source: "manual_booking_dialog" });
    }

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
    if (insertedData?.id) onCreatedBooking?.(insertedData.id);

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
                <StayRangePicker
                  numberOfMonths={2}
                  from={form.check_in}
                  to={form.check_out}
                  disabledDays={mayOverbook ? undefined : disabledStayDays}
                  modifiers={{ rolBlocked: blockedStayDays }}
                  modifiersClassNames={{ rolBlocked: "line-through text-muted-foreground opacity-60" }}
                  onChange={({ fromDate, toDate }) => {
                    if (fromDate && toDate) {
                      const clash = findBlockedInRange(blockedNights, isoDay(fromDate), isoDay(toDate));
                      if (clash && !mayOverbook) {
                        toast.error(`${format(new Date(clash.iso), "d MMM")} is not available — ${clash.reason}.`);
                        return;
                      }
                    }
                    setForm(p => ({ ...p, check_in: fromDate, check_out: toDate }));
                  }}
                />
                {nights > 0 && (
                  <p className="text-xs text-muted-foreground">{nights} night{nights !== 1 ? "s" : ""}</p>
                )}
                {stayClash && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 space-y-2">
                    <p className="text-xs font-medium text-destructive">
                      {format(new Date(stayClash.iso), "d MMM yyyy")} is already taken — {stayClash.reason}.
                    </p>
                    {mayOverbook && (
                      <div>
                        <Label className="text-[10px]">Reason for overbooking (required to continue)</Label>
                        <Input
                          className="h-8"
                          value={overbookReason}
                          onChange={e => setOverbookReason(e.target.value)}
                          placeholder="e.g. guest moving units on arrival"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-2">
                <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Guest</h4>
                <div>
                  <Label>Guest Name *</Label>
                  <GuestNameAutocomplete
                    propertyId={effectivePropertyId}
                    portfolioPropertyIds={portfolioMode ? searchScopeIds : undefined}
                    propertyNames={propertyNames}
                    value={form.guest_name}
                    onChange={(v) => { if (pickedGuest) setPickedGuest(null); update("guest_name", v); }}
                    onSelect={(g) => { void hydrateFromGuest(g); }}
                  />
                  {pickedGuest && (
                    <div className="mt-2 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex flex-wrap items-center gap-1.5">
                          <span className="font-medium">Known guest</span>
                          {(pickedGuest.total_stays || 0) > 1 && <Badge variant="secondary" className="text-[10px]">Repeat</Badge>}
                          {(pickedGuest.tags || []).some(t => t.toLowerCase() === "vip") && <Badge variant="secondary" className="text-[10px]">VIP</Badge>}
                          {pickedGuest.is_blacklisted && <Badge variant="destructive" className="text-[10px]">Blacklisted</Badge>}
                          {pickedGuest.from_history && <Badge variant="outline" className="text-[10px]">From booking history</Badge>}
                        </span>
                        <Button type="button" variant="ghost" size="sm" className="h-6 px-2 text-[11px]" onClick={clearPickedGuest}>
                          Clear guest
                        </Button>
                      </div>
                      <p className="mt-1 text-muted-foreground">
                        {[
                          `${pickedGuest.total_stays || 0} stay${(pickedGuest.total_stays || 0) === 1 ? "" : "s"}`,
                          `R${Math.round(Number(pickedGuest.total_received) || 0).toLocaleString("en-ZA")} received`,
                          (pickedGuest.total_outstanding || 0) > 0
                            ? `R${Math.round(Number(pickedGuest.total_outstanding)).toLocaleString("en-ZA")} outstanding`
                            : null,
                          pickedGuest.last_stay_date ? `last stay ${pickedGuest.last_stay_date}` : null,
                          pickedGuest.property_id ? propertyNames.get(pickedGuest.property_id) : null,
                        ].filter(Boolean).join(" · ")}
                      </p>
                    </div>
                  )}
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
                              {availableRooms.map(r => {
                                const free = unitIsFree(r.id);
                                return (
                                  <SelectItem key={r.id} value={r.id} disabled={!free && !mayOverbook}>
                                    {r.room_number}{r.room_name ? ` (${r.room_name})` : ""}
                                    {free ? "" : " · booked"}
                                  </SelectItem>
                                );
                              })}
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

                      {(() => {
                        const cap = lineCapacity.get(l.key);
                        const max = cap?.max ?? null;
                        // Sleeping slots left for the field being edited (infants excluded).
                        const slotsFor = (field: "adults" | "children" | "teens") => {
                          if (!max) return undefined;
                          const others = (["adults", "children", "teens"] as const)
                            .filter(f => f !== field)
                            .reduce((sum, f) => sum + (parseInt(l[f]) || 0), 0);
                          return Math.max(field === "adults" ? 1 : 0, max - others);
                        };
                        const clamp = (field: "adults" | "children" | "teens", raw: string) => {
                          const limit = slotsFor(field);
                          const value = parseInt(raw);
                          if (limit === undefined || isNaN(value)) return raw;
                          if (value > limit) {
                            toast.error(`This unit sleeps ${max} guest${max === 1 ? "" : "s"} — add another room for more.`);
                            return String(limit);
                          }
                          return raw;
                        };
                        return (
                          <div className="grid grid-cols-5 gap-1.5">
                            <div><Label className="text-[10px]">Adults</Label><Input className="h-8 px-2" type="number" min={1} max={slotsFor("adults")} value={l.adults} onChange={e => updateLine(l.key, { adults: clamp("adults", e.target.value) })} /></div>
                            <div><Label className="text-[10px]">Ch 0–2</Label><Input className="h-8 px-2" type="number" min={0} value={l.infants} onChange={e => updateLine(l.key, { infants: e.target.value })} /></div>
                            <div><Label className="text-[10px]">Ch 3–12</Label><Input className="h-8 px-2" type="number" min={0} max={slotsFor("children")} value={l.children} onChange={e => updateLine(l.key, { children: clamp("children", e.target.value) })} /></div>
                            <div><Label className="text-[10px]">Teens</Label><Input className="h-8 px-2" type="number" min={0} max={slotsFor("teens")} value={l.teens} onChange={e => updateLine(l.key, { teens: clamp("teens", e.target.value) })} /></div>
                            <div><Label className="text-[10px]">Pets</Label><Input className="h-8 px-2" type="number" min={0} value={l.pets} onChange={e => updateLine(l.key, { pets: e.target.value })} /></div>
                          </div>
                        );
                      })()}
                      {(() => {
                        const cap = lineCapacity.get(l.key);
                        if (!cap?.max) return null;
                        return (
                          <p className={cn("text-[10px]", cap.over ? "font-medium text-destructive" : "text-muted-foreground")}>
                            Sleeps {cap.max} · {cap.guests} guest{cap.guests === 1 ? "" : "s"} on this unit
                            {cap.over ? " — over capacity" : ""}
                          </p>
                        );
                      })()}


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
                    <Input
                      className="h-8"
                      type="number"
                      min={0}
                      value={form.payment_status === "paid" ? "" : form.deposit_amount}
                      onChange={e => update("deposit_amount", e.target.value)}
                      disabled={form.payment_status === "paid"}
                      placeholder={form.payment_status === "paid" ? "Not applicable" : "0.00"}
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {form.payment_status === "paid" ? "Paid in full — no deposit needed." : "Optional — leave blank if no deposit applies."}
                    </p>
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

export interface GuestSuggestion {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  total_stays: number | null;
  last_stay_date: string | null;
  nationality?: string | null;
  notes?: string | null;
  tags?: string[] | null;
  is_blacklisted?: boolean | null;
  is_archived?: boolean | null;
  total_received?: number | null;
  total_outstanding?: number | null;
  property_id?: string | null;
  /** True when the row came from booking history rather than a CRM profile. */
  from_history?: boolean;
}

/** Partially hide contact details so a crowded list stays readable but distinguishable. */
function maskEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  const [user, domain] = email.split("@");
  if (!domain) return email;
  const head = user.slice(0, 2);
  return `${head}${user.length > 2 ? "…" : ""}@${domain}`;
}

function maskPhone(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\s+/g, "");
  return digits.length <= 4 ? digits : `…${digits.slice(-4)}`;
}

function GuestNameAutocomplete({
  propertyId,
  portfolioPropertyIds,
  propertyNames,
  value,
  onChange,
  onSelect,
}: {
  propertyId: string;
  /** When set, the search covers every property in the portfolio. */
  portfolioPropertyIds?: string[];
  propertyNames?: Map<string, string>;
  value: string;
  onChange: (v: string) => void;
  onSelect: (g: GuestSuggestion) => void;
}) {
  const [suggestions, setSuggestions] = useState<GuestSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const lastPicked = useRef<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  const scopeIds = useMemo(() => {
    const ids = (portfolioPropertyIds && portfolioPropertyIds.length > 0)
      ? portfolioPropertyIds
      : (propertyId ? [propertyId] : []);
    return Array.from(new Set(ids.filter(Boolean)));
  }, [portfolioPropertyIds, propertyId]);
  const scopeKey = scopeIds.join(",");

  // Debounced search across guest profiles (name/email/phone) for this scope.
  useEffect(() => {
    const term = value.trim();
    if (term && term === lastPicked.current) return;
    if (term.length < 2 || scopeIds.length === 0) {
      setSuggestions([]);
      setOpen(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const handle = setTimeout(async () => {
      const like = `%${term}%`;
      const [profileRes, bookingRes] = await Promise.all([
        supabase
          .from("rolos_guest_profiles")
          .select("id, full_name, email, phone, nationality, notes, tags, is_blacklisted, is_archived, total_stays, total_received, total_outstanding, last_stay_date, property_id")
          .in("property_id", scopeIds)
          .or(`full_name.ilike.${like},email.ilike.${like},phone.ilike.${like}`)
          .order("last_stay_date", { ascending: false, nullsFirst: false })
          .limit(12),
        // Imported guests (e.g. NightsBridge history) have no CRM profile yet, so
        // search the booking history too and offer those names.
        supabase
          .from("bookings")
          .select("id, guest_name, guest_email, guest_phone, check_in_date, property_id")
          .in("property_id", scopeIds)
          .or(`guest_name.ilike.${like},guest_email.ilike.${like},guest_phone.ilike.${like}`)
          .order("check_in_date", { ascending: false })
          .limit(40),
      ]);

      if (cancelled) return;
      if (profileRes.error) console.warn("guest search failed:", profileRes.error);
      if (bookingRes.error) console.warn("booking guest search failed:", bookingRes.error);

      const profiles = (profileRes.data || []) as GuestSuggestion[];

      // Identity keys are contact-based, never name-only: two different people
      // may legitimately share a name and both must remain selectable.
      const identityKey = (name: string, email?: string | null, phone?: string | null) => {
        const n = name.trim().toLowerCase();
        if (email) return `e:${email.trim().toLowerCase()}`;
        if (phone) return `p:${phone.replace(/\s+/g, "")}|${n}`;
        return `n:${n}`;
      };
      const seen = new Set(profiles.map(p => identityKey(p.full_name || "", p.email, p.phone)));

      const fromBookings: GuestSuggestion[] = [];
      for (const b of bookingRes.data || []) {
        const name = (b.guest_name || "").trim();
        if (!name) continue;
        const key = identityKey(name, b.guest_email, b.guest_phone);
        if (seen.has(key)) continue;
        seen.add(key);
        fromBookings.push({
          id: `booking:${b.id}`,
          full_name: name,
          email: b.guest_email || null,
          phone: b.guest_phone || null,
          total_stays: null,
          last_stay_date: b.check_in_date || null,
          property_id: b.property_id || null,
          from_history: true,
        });
      }

      // Order: profiles with stay history, then other profiles, then history-only,
      // with archived records always last.
      const rank = (g: GuestSuggestion) =>
        (g.is_archived ? 100 : 0) + (g.from_history ? 10 : 0) + ((g.total_stays || 0) > 0 ? 0 : 1);
      const merged = [...profiles, ...fromBookings]
        .sort((a, b) => rank(a) - rank(b) || (b.last_stay_date || "").localeCompare(a.last_stay_date || ""))
        .slice(0, 12);

      setSuggestions(merged);
      setOpen(merged.length > 0);
      setLoading(false);
    }, 220);


    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [value, scopeKey, scopeIds]);

  // Group same-name records so duplicates read as variants of one name.
  const groups = useMemo(() => {
    const byName = new Map<string, GuestSuggestion[]>();
    for (const s of suggestions) {
      const key = s.full_name.trim().toLowerCase();
      const arr = byName.get(key);
      if (arr) arr.push(s); else byName.set(key, [s]);
    }
    return Array.from(byName.entries()).map(([key, rows]) => ({ key, name: rows[0].full_name, rows }));
  }, [suggestions]);

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

  const pick = (g: GuestSuggestion) => {
    lastPicked.current = g.full_name;
    onSelect(g);
    setOpen(false);
  };

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
        <div className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-lg max-h-80 overflow-auto">
          {loading && (
            <div className="px-3 py-2 text-xs text-muted-foreground">Searching…</div>
          )}
          {!loading && suggestions.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">No matching guests</div>
          )}
          {groups.map((group) => (
            <div key={group.key} className="border-b border-border/40 last:border-b-0">
              {group.rows.length > 1 && (
                <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                  {group.rows.length} records named {group.name} — pick the right one
                </div>
              )}
              {group.rows.map((g) => {
                const propName = g.property_id ? propertyNames?.get(g.property_id) : null;
                const detail = [
                  propName,
                  maskEmail(g.email),
                  maskPhone(g.phone),
                  g.nationality || null,
                  g.total_stays ? `${g.total_stays} stay${g.total_stays === 1 ? "" : "s"}` : null,
                  g.last_stay_date ? `last ${g.last_stay_date}` : null,
                ].filter(Boolean).join(" · ");
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => pick(g)}
                    className="w-full text-left px-3 py-2 hover:bg-accent hover:text-accent-foreground"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{g.full_name}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {(g.tags || []).some(t => t.toLowerCase() === "vip") && (
                          <Badge variant="secondary" className="text-[10px]">VIP</Badge>
                        )}
                        {g.is_blacklisted && <Badge variant="destructive" className="text-[10px]">Blacklisted</Badge>}
                        {g.is_archived && <Badge variant="outline" className="text-[10px] text-muted-foreground">Archived</Badge>}
                        {g.from_history && <Badge variant="outline" className="text-[10px]">From booking history</Badge>}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{detail || "No further details"}</div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
