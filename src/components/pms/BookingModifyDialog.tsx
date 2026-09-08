import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInDays, format, parseISO, startOfDay } from "date-fns";
import { CalendarClock, CalendarIcon, Info, Loader2, Undo2, User, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { StayRangePicker } from "@/components/ui/stay-range-picker";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useUnitAvailability } from "@/hooks/useUnitAvailability";
import {
  blockedNightsFor,
  disabledDaysFrom,
  blockedDaysFrom,
  findBlockedInRange,
  canOverbook,
  type BlockedNight,
} from "@/lib/unitAvailability";
import { cn } from "@/lib/utils";
import { modifyBooking } from "@/lib/bookingModification";
import {
  readChannelDetails,
  readCommission,
  type ReceivedChannelDetails,
} from "@/lib/bookingReceivedDetails";


interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  booking: {
    id: string;
    guest_name: string;
    check_in_date: string;
    check_out_date: string;
    adults: number | null;
    children?: number | null;
    teens?: number | null;
    infants?: number | null;
    total_price: number;
    property_id?: string | null;
    room_type_id?: string | null;
    /** Concurrency stamp — lets the save refuse to undo a newer channel modification. */
    updated_at?: string | null;

  };
  /** Shows the channel-push notice for Rentals United reservations. */
  isRuBooking?: boolean;
  onDone: () => void;
}

type QuoteSource = "live" | null;

interface ChargeLine {
  name: string;
  category: string | null;
  amount: number;
  breakdown: string | null;
  is_refundable: boolean;
  counts_in_total: boolean;
}

interface ExtrasQuote {
  accommodation: number;
  extras_total: number;
  deposit_total: number;
  guest_total: number;
  lines: ChargeLine[];
}

/** Editable guest record fields. Stored locally only — never pushed to the channel. */
interface GuestFields {
  guest_name: string;
  guest_email: string;
  guest_phone: string;
  guest_nationality: string;
  guest_company: string;
  second_guest_name: string;
  second_guest_email: string;
  second_guest_phone: string;
}

const EMPTY_GUEST: GuestFields = {
  guest_name: "",
  guest_email: "",
  guest_phone: "",
  guest_nationality: "",
  guest_company: "",
  second_guest_name: "",
  second_guest_email: "",
  second_guest_phone: "",
};

const GUEST_LABELS: Array<{ key: keyof GuestFields; label: string; type?: string }> = [
  { key: "guest_name", label: "Guest name" },
  { key: "guest_email", label: "Email", type: "email" },
  { key: "guest_phone", label: "Phone", type: "tel" },
  { key: "guest_nationality", label: "Nationality" },
  { key: "guest_company", label: "Company" },
  { key: "second_guest_name", label: "Second guest" },
  { key: "second_guest_email", label: "Second guest email", type: "email" },
  { key: "second_guest_phone", label: "Second guest phone", type: "tel" },
];

/** Read-only side of the record: how the money and the channel reference arrived. */
interface ReceivedRecord {
  paymentStatus: string | null;
  paymentMethod: string | null;
  amountPaidSource: string | null;
  depositAmount: number;
  externalReservationId: string | null;
  bookingChannel: string | null;
  integrationType: string | null;
  commission: { amount: number | null; rate: number | null; type: string | null };
  channel: ReceivedChannelDetails;
  storedLines: ChargeLine[];
}

const toDate = (iso: string): Date | undefined => {
  try {
    const parsed = parseISO(iso);
    return Number.isNaN(parsed.getTime()) ? undefined : startOfDay(parsed);
  } catch {
    return undefined;
  }
};

const nightsBetween = (from: string, to: string) => {
  try {
    return differenceInDays(parseISO(to), parseISO(from));
  } catch {
    return 0;
  }
};


export function BookingModifyDialog({ open, onOpenChange, booking, isRuBooking = false, onDone }: Props) {
  const [checkIn, setCheckIn] = useState(booking.check_in_date);
  const [checkOut, setCheckOut] = useState(booking.check_out_date);
  const [adults, setAdults] = useState(String(booking.adults ?? 1));
  const [children, setChildren] = useState(String(booking.children ?? 0));
  const [teens, setTeens] = useState(String(booking.teens ?? 0));
  const [infants, setInfants] = useState(String(booking.infants ?? 0));
  /* The editable figure is ACCOMMODATION, never the guest total. `total_price` on the
   * booking already includes mandatory extras, so seeding the field from it and saving
   * it back is what used to make fees compound on every edit. The stored accommodation
   * comes from the booking's charge snapshot as soon as it loads. */
  const [totalPrice, setTotalPrice] = useState(String(booking.total_price ?? 0));
  const [storedAccommodation, setStoredAccommodation] = useState<number>(Number(booking.total_price ?? 0));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** What has actually been received — drives the refund / balance preview. */
  const [amountPaid, setAmountPaid] = useState<number | null>(null);
  const [overpaymentMode, setOverpaymentMode] = useState<"refund" | "credit" | "guest_choice">("guest_choice");

  const [requestBalance, setRequestBalance] = useState(true);
  const [datesOpen, setDatesOpen] = useState(false);

  // ─── The booking as it was received ───
  const [received, setReceived] = useState<ReceivedRecord | null>(null);
  const [guest, setGuest] = useState<GuestFields>(EMPTY_GUEST);
  const [guestBaseline, setGuestBaseline] = useState<GuestFields>(EMPTY_GUEST);
  const [specialRequests, setSpecialRequests] = useState("");
  const [specialRequestsBaseline, setSpecialRequestsBaseline] = useState("");


  // ─── Automatic re-pricing ───
  const [quotedTotal, setQuotedTotal] = useState<number | null>(null);
  const [quoteSource, setQuoteSource] = useState<QuoteSource>(null);
  const [quoting, setQuoting] = useState(false);
  /** Once the operator types a total, their figure wins over later auto-quotes. */
  const [manualTotal, setManualTotal] = useState(false);
  const quoteSeq = useRef(0);
  /** Hard occupancy ceiling from the property record, used when a unit has no measured capacity. */
  const [propertyMaxGuests, setPropertyMaxGuests] = useState<number | null>(null);


  // ─── Extras / levies priced for the proposed stay (server-side, single source of truth) ───
  const [extras, setExtras] = useState<ExtrasQuote | null>(null);
  const [extrasBusy, setExtrasBusy] = useState(false);
  const extrasSeq = useRef(0);

  /* ── Availability & capacity guard ──────────────────────────────────────
     The stay being edited is excluded from the occupancy map, so its own nights
     stay selectable while every other live stay blocks the calendar. */
  const { userRole } = useAuth();
  const mayOverbook = canOverbook(userRole);
  const [overbookReason, setOverbookReason] = useState("");
  const [assignedRoomIds, setAssignedRoomIds] = useState<string[]>([]);
  const [lineRoomTypeIds, setLineRoomTypeIds] = useState<string[]>([]);
  const [allocatedCapacity, setAllocatedCapacity] = useState<number | null>(null);
  const { availability, refresh: refreshAvailability } = useUnitAvailability(booking.property_id, {
    enabled: open,
    excludeBookingId: booking.id,
  });

  useEffect(() => {
    if (!open) return;
    setOverbookReason("");
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("rolos_booking_rooms")
        .select("room_id, room_type_id, status")
        .eq("booking_id", booking.id);
      const live = (data ?? []).filter((l) => (l.status ?? "active") !== "cancelled");
      const typeIds = live.map((l) => l.room_type_id).filter(Boolean) as string[];
      const fallbackTypeIds = typeIds.length === 0 && booking.room_type_id ? [booking.room_type_id] : typeIds;
      const uniqueTypeIds = Array.from(new Set(fallbackTypeIds));
      const { data: roomTypes } = uniqueTypeIds.length > 0
        ? await supabase.from("rolos_room_types").select("id, max_occupancy").in("id", uniqueTypeIds)
        : { data: [] };
      if (!mounted) return;
      setAssignedRoomIds(live.map((l) => l.room_id).filter(Boolean) as string[]);
      setLineRoomTypeIds(typeIds);
      const capacityByType = new Map(
        (roomTypes ?? []).map((roomType) => [roomType.id, Number(roomType.max_occupancy ?? 0)]),
      );
      const measured = fallbackTypeIds.length > 0 && fallbackTypeIds.every((id) => (capacityByType.get(id) ?? 0) > 0)
        ? fallbackTypeIds.reduce((sum, id) => sum + (capacityByType.get(id) ?? 0), 0)
        : null;
      setAllocatedCapacity(measured && measured > 0 ? measured : null);
    })();
    return () => {
      mounted = false;
    };
  }, [open, booking.id, booking.room_type_id]);

  /** Nights unavailable for the units / types this stay occupies. */
  const blockedNights = useMemo(() => {
    const merged = new Map<string, BlockedNight>();
    const typeIds = lineRoomTypeIds.length
      ? lineRoomTypeIds
      : booking.room_type_id
        ? [booking.room_type_id]
        : [];
    const pairs: Array<[string | null, string | null]> = assignedRoomIds.length
      ? assignedRoomIds.map((roomId, i) => [typeIds[i] ?? typeIds[0] ?? null, roomId])
      : typeIds.map((t) => [t, null]);
    for (const [typeId, roomId] of pairs) {
      for (const [iso, info] of blockedNightsFor(availability, typeId, roomId)) {
        if (!merged.has(iso)) merged.set(iso, info);
      }
    }
    // Safety net: the stay's own booked nights are never a clash with itself,
    // even when a block row carries no identifiable booking tag.
    if (booking.check_in_date && booking.check_out_date) {
      for (const iso of merged.keys()) {
        if (iso >= booking.check_in_date && iso < booking.check_out_date) merged.delete(iso);
      }
    }
    return merged;
  }, [
    availability,
    assignedRoomIds,
    lineRoomTypeIds,
    booking.room_type_id,
    booking.check_in_date,
    booking.check_out_date,
  ]);


  const disabledStayDays = useMemo(() => disabledDaysFrom(blockedNights), [blockedNights]);
  const blockedStayDays = useMemo(() => blockedDaysFrom(blockedNights), [blockedNights]);

  const stayClash = useMemo(() => {
    if (!checkIn || !checkOut || checkOut <= checkIn) return null;
    return findBlockedInRange(blockedNights, checkIn, checkOut);
  }, [blockedNights, checkIn, checkOut]);

  /**
   * Sleeping capacity of the booked units, summed across the stay's lines. When the grid has no
   * measured capacity for a booked unit (a channel stay whose unit was never sized), the property's
   * own maximum guests is the cap — leaving it unknown let channel edits seat more guests than the
   * place holds.
   */
  const stayCapacity = useMemo(() => {
    if (allocatedCapacity !== null) return allocatedCapacity;
    const typeIds = lineRoomTypeIds.length
      ? lineRoomTypeIds
      : booking.room_type_id
        ? [booking.room_type_id]
        : [];
    if (typeIds.length === 0) return propertyMaxGuests ?? null;
    let total = 0;
    for (const t of typeIds) {
      const cap = availability.capacity.get(t);
      if (!cap || cap <= 0) return propertyMaxGuests ?? null;
      total += cap;
    }
    if (total <= 0) return propertyMaxGuests ?? null;
    return total;
  }, [allocatedCapacity, availability, lineRoomTypeIds, booking.room_type_id, propertyMaxGuests]);


  useEffect(() => {
    if (!open) return;
    setCheckIn(booking.check_in_date);
    setCheckOut(booking.check_out_date);
    setAdults(String(booking.adults ?? 1));
    setChildren(String(booking.children ?? 0));
    setTeens(String(booking.teens ?? 0));
    setInfants(String(booking.infants ?? 0));
    setTotalPrice(String(booking.total_price ?? 0));
    setNote("");
    setManualTotal(false);
    setQuotedTotal(null);
    setQuoteSource(null);
  }, [open, booking.id, booking.check_in_date, booking.check_out_date, booking.adults, booking.children, booking.teens, booking.infants, booking.total_price]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select(
          "amount_paid, amount_paid_source, payment_status, payment_method, total_price, deposit_amount, charges_breakdown, " +
            "guest_name, guest_email, guest_phone, guest_nationality, guest_company, " +
            "second_guest_name, second_guest_email, second_guest_phone, special_requests, " +
            "external_reservation_id, booking_channel, integration_type, " +
            "calculated_commission, commission_rate_applied, commission_type, modification_notes",
        )
        .eq("id", booking.id)
        .maybeSingle();
      if (!mounted || !data) return;
      const stored = Number(data.amount_paid ?? 0);
      const paidFlag = ["paid", "complete", "completed", "success"].includes(
        String(data.payment_status ?? "").toLowerCase(),
      );
      setAmountPaid(stored > 0 ? stored : paidFlag ? Number(data.total_price ?? 0) : 0);

      const snap = (data.charges_breakdown ?? null) as
        | { accommodation?: number; lines?: ChargeLine[] }
        | null;
      const snapAccommodation = Number(snap?.accommodation ?? 0);
      if (snapAccommodation > 0) {
        setStoredAccommodation(snapAccommodation);
        setTotalPrice((current) =>
          Number(current) === Number(data.total_price ?? 0) ? String(snapAccommodation) : current,
        );
      }

      // Everything the booking arrived with, so the form reads as the full record.
      setReceived({
        paymentStatus: data.payment_status ?? null,
        paymentMethod: data.payment_method ?? null,
        amountPaidSource: data.amount_paid_source ?? null,
        depositAmount: Number(data.deposit_amount ?? 0),
        externalReservationId: data.external_reservation_id ?? null,
        bookingChannel: data.booking_channel ?? null,
        integrationType: data.integration_type ?? null,
        commission: {
          amount: data.calculated_commission === null ? null : Number(data.calculated_commission),
          rate: data.commission_rate_applied === null ? null : Number(data.commission_rate_applied),
          type: data.commission_type ?? null,
        },
        channel: readChannelDetails(data.modification_notes, data.external_reservation_id),
        storedLines: Array.isArray(snap?.lines) ? (snap!.lines as ChargeLine[]) : [],
      });

      setGuest({
        guest_name: data.guest_name ?? "",
        guest_email: data.guest_email ?? "",
        guest_phone: data.guest_phone ?? "",
        guest_nationality: data.guest_nationality ?? "",
        guest_company: data.guest_company ?? "",
        second_guest_name: data.second_guest_name ?? "",
        second_guest_email: data.second_guest_email ?? "",
        second_guest_phone: data.second_guest_phone ?? "",
      });
      setGuestBaseline({
        guest_name: data.guest_name ?? "",
        guest_email: data.guest_email ?? "",
        guest_phone: data.guest_phone ?? "",
        guest_nationality: data.guest_nationality ?? "",
        guest_company: data.guest_company ?? "",
        second_guest_name: data.second_guest_name ?? "",
        second_guest_email: data.second_guest_email ?? "",
        second_guest_phone: data.second_guest_phone ?? "",
      });
      setSpecialRequests(data.special_requests ?? "");
      setSpecialRequestsBaseline(data.special_requests ?? "");

      if (booking.property_id) {
        const { data: prop } = await supabase
          .from("properties")
          .select("max_guests")
          .eq("id", booking.property_id)
          .maybeSingle();
        const cap = Number(prop?.max_guests ?? 0);
        if (mounted) setPropertyMaxGuests(cap > 0 ? cap : null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [open, booking.id, booking.property_id]);



  const originalNights = useMemo(
    () => nightsBetween(booking.check_in_date, booking.check_out_date),
    [booking.check_in_date, booking.check_out_date],
  );
  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const nightsDelta = nights - originalNights;
  const datesChanged = checkIn !== booking.check_in_date || checkOut !== booking.check_out_date;
  const paxChanged =
    Number(adults) !== (booking.adults ?? 0) ||
    Number(children) !== (booking.children ?? 0) ||
    Number(teens) !== (booking.teens ?? 0) ||
    Number(infants) !== (booking.infants ?? 0);

  // Re-price whenever the stay or the guest count moves.
  useEffect(() => {
    if (!open || nights <= 0) return;
    if (!datesChanged && !paxChanged) {
      setQuotedTotal(null);
      setQuoteSource(null);
      return;
    }

    const seq = ++quoteSeq.current;
    const timer = setTimeout(() => {
      (async () => {
        setQuoting(true);
        let resolved: number | null = null;
        let source: QuoteSource = null;

        /**
         * The engine that prices the stay on save is asked first, so what the operator reads here is
         * exactly what will be written. Without this the dialog fell back to the old nightly average
         * and the amount never moved when the dates changed, while the save quietly repriced.
         */
        try {
          const data = await modifyBooking({
              booking_id: booking.id,
              quote_only: true,
              modifications: {
                check_in_date: checkIn,
                check_out_date: checkOut,
                adults: Number(adults) || 0,
                children: Number(children) || 0,
                teens: Number(teens) || 0,
                infants: Number(infants) || 0,
              },
          });
          const engine = Number(data?.quote?.accommodation ?? NaN);
          const from = String(data?.quote?.repriced_from ?? "");
          if (Number.isFinite(engine) && engine > 0 && from && from !== "operator") {
            resolved = Math.round(engine * 100) / 100;
            source = "live";
          }
        } catch (err) {
          console.warn("[BookingModifyDialog] engine re-pricing failed:", err);
        }

        if (seq !== quoteSeq.current) return;
        setQuotedTotal(resolved);
        setQuoteSource(resolved === null ? null : source);
        setQuoting(false);
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [open, booking.id, checkIn, checkOut, nights, datesChanged, paxChanged, adults, children, teens, infants]);

  // Push the quote into the field unless the operator has taken over.
  useEffect(() => {
    if (manualTotal || quotedTotal === null) return;
    setTotalPrice(String(quotedTotal));
  }, [quotedTotal, manualTotal]);

  // Ask the backend to price the property charges for the proposed stay. Nothing is written —
  // the same engine runs again on save, so the preview and the saved folio always agree.
  useEffect(() => {
    if (!open || nights <= 0) return;
    const accommodation = Number(totalPrice || 0);
    if (!Number.isFinite(accommodation)) return;

    const seq = ++extrasSeq.current;
    const timer = setTimeout(() => {
      (async () => {
        setExtrasBusy(true);
        try {
          const data = await modifyBooking({
              booking_id: booking.id,
              quote_only: true,
              modifications: {
                check_in_date: checkIn,
                check_out_date: checkOut,
                adults: Number(adults) || 0,
                children: Number(children) || 0,
                teens: Number(teens) || 0,
                infants: Number(infants) || 0,
                accommodation_total: accommodation,
              },
          });
          if (seq !== extrasSeq.current) return;
          if (!data?.quote) {
            setExtras(null);
            return;
          }
          setExtras({
            accommodation: Number(data.quote.accommodation ?? accommodation),
            extras_total: Number(data.quote.extras_total ?? 0),
            deposit_total: Number(data.quote.deposit_total ?? 0),
            guest_total: Number(data.quote.guest_total ?? accommodation),
            lines: Array.isArray(data.quote.lines) ? (data.quote.lines as ChargeLine[]) : [],
          });
        } catch (err) {
          console.warn("[BookingModifyDialog] charge preview failed:", err);
          if (seq === extrasSeq.current) setExtras(null);
        } finally {
          if (seq === extrasSeq.current) setExtrasBusy(false);
        }
      })();
      // Long enough that typing a total does not fire a round-trip per keystroke: each edit
      // cancelled the previous quote mid-flight and the save then queued behind them.
    }, 700);

    return () => clearTimeout(timer);
  }, [open, booking.id, checkIn, checkOut, adults, children, teens, infants, totalPrice, nights]);

  /** What the guest owes in total — accommodation plus the mandatory extras. */
  const guestTotal = useMemo(
    () => (extras ? extras.guest_total : Number(totalPrice || 0)),
    [extras, totalPrice],
  );

  /** Positive = guest still owes, negative = guest overpaid. */
  const delta = useMemo(() => {
    if (amountPaid === null) return 0;
    return Math.round((guestTotal - amountPaid) * 100) / 100;
  }, [amountPaid, guestTotal]);

  const money = (n: number) => `R${Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

  /* The breakdown shows the live quote once it lands, and the booking's own stored snapshot
   * until then, so the money story is never blank while a quote is in flight. */
  const billingLines = useMemo<ChargeLine[]>(() => {
    if (extras && extras.lines.length > 0) {
      return [
        { name: "Accommodation", category: null, amount: extras.accommodation, breakdown: null, is_refundable: false, counts_in_total: true },
        ...extras.lines,
      ];
    }
    if (received && received.storedLines.length > 0) {
      return [
        { name: "Accommodation", category: null, amount: storedAccommodation, breakdown: null, is_refundable: false, counts_in_total: true },
        ...received.storedLines,
      ];
    }
    return [
      { name: "Accommodation", category: null, amount: Number(totalPrice || 0), breakdown: null, is_refundable: false, counts_in_total: true },
    ];
  }, [extras, received, storedAccommodation, totalPrice]);

  const commissionView = useMemo(
    () =>
      readCommission({
        guestTotal,
        calculated_commission: received?.commission.amount ?? null,
        commission_rate_applied: received?.commission.rate ?? null,
        commission_type: received?.commission.type ?? null,
      }),
    [guestTotal, received],
  );


  const originalFrom = toDate(booking.check_in_date);
  const originalTo = toDate(booking.check_out_date);
  const selectedFrom = toDate(checkIn);
  const selectedTo = toDate(checkOut);

  const originalRangeDays = useMemo(() => {
    if (!originalFrom || originalNights <= 0) return [] as Date[];
    return Array.from({ length: originalNights + 1 }, (_, i) => addDays(originalFrom, i));
  }, [originalFrom, originalNights]);

  const onRangeSelect = useCallback(
    (range: { from?: Date; to?: Date } | undefined) => {
      if (!range?.from) return;
      setCheckIn(format(range.from, "yyyy-MM-dd"));
      if (range.to && differenceInDays(range.to, range.from) > 0) {
        setCheckOut(format(range.to, "yyyy-MM-dd"));
        setDatesOpen(false);
      } else {
        // First click restarts the range — hold check-out one night out.
        setCheckOut(format(addDays(range.from, 1), "yyyy-MM-dd"));
      }
    },
    [],
  );

  /** Keeps the guest count inside the booked units' sleeping capacity. */
  const clampGuests = useCallback(
    (field: "adults" | "children" | "teens", raw: string): string => {
      if (!stayCapacity) return raw;
      const value = parseInt(raw);
      if (Number.isNaN(value)) return raw;
      const counts = { adults: Number(adults) || 0, children: Number(children) || 0, teens: Number(teens) || 0 };
      const other = counts.adults + counts.children + counts.teens - counts[field];
      const limit = Math.max(field === "adults" ? 1 : 0, stayCapacity - other);
      if (value > limit) {
        toast.error(`The booked units sleep ${stayCapacity} guest${stayCapacity === 1 ? "" : "s"}.`);
        return String(limit);
      }
      return raw;
    },
    [stayCapacity, adults, children, teens],
  );

  const submit = async () => {
    if (nights <= 0) {
      toast.error("Check-out must be after check-in.");
      return;
    }
    if (stayCapacity && (Number(adults) || 0) + (Number(children) || 0) + (Number(teens) || 0) > stayCapacity) {
      toast.error(`The booked units sleep ${stayCapacity} guest${stayCapacity === 1 ? "" : "s"} — add a room or reduce the guests.`);
      return;
    }
    if (stayClash) {
      if (!mayOverbook) {
        toast.error(`${format(parseISO(stayClash.iso), "d MMM")} is not available — ${stayClash.reason}.`);
        return;
      }
      if (!overbookReason.trim()) {
        toast.error("Add a reason for the overbooking before saving.");
        return;
      }
    }
    setBusy(true);
    try {
      const modifications: Record<string, unknown> = { note: note.trim() || undefined };
      if (checkIn !== booking.check_in_date) modifications.check_in_date = checkIn;
      if (checkOut !== booking.check_out_date) modifications.check_out_date = checkOut;
      if (Number(adults) !== (booking.adults ?? 0)) modifications.adults = Number(adults);
      if (Number(children) !== (booking.children ?? 0)) modifications.children = Number(children);
      if (Number(teens) !== (booking.teens ?? 0)) modifications.teens = Number(teens);
      if (Number(infants) !== (booking.infants ?? 0)) modifications.infants = Number(infants);
      // Always carry the corrected figure so the channel push and settlement
      // loop see the re-priced total, not the stale one.
      if (Number(totalPrice) !== storedAccommodation) {
        modifications.accommodation_total = Number(totalPrice);
      }
      // Deliberate overbooking is stamped on the stay so the database guard lets
      // the new dates through and the decision stays auditable.
      if (stayClash && mayOverbook && overbookReason.trim()) {
        modifications.overbook_override_reason = overbookReason.trim();
      }

      // Guest record corrections travel with the same save. They are written locally only,
      // so a guest-only edit never asks the channel to re-price or re-place the stay.
      for (const { key } of GUEST_LABELS) {
        if (guest[key].trim() !== guestBaseline[key].trim()) modifications[key] = guest[key].trim();
      }
      if (specialRequests.trim() !== specialRequestsBaseline.trim()) {
        modifications.special_requests = specialRequests.trim();
      }

      const changedKeys = Object.keys(modifications).filter((k) => k !== "note");
      if (changedKeys.length === 0) {
        toast.error("Nothing has changed yet.");
        setBusy(false);
        return;
      }


      const data = await modifyBooking({
          booking_id: booking.id,
          modifications,
          // Guards against undoing a Channel Manager modification that landed while this was open.
          expected_updated_at: booking.updated_at ?? null,
          expected_check_in_date: booking.check_in_date,
          expected_check_out_date: booking.check_out_date,
          settlement: {
            raise_refund: overpaymentMode !== "credit",
            request_balance: requestBalance,
            overpayment_mode: overpaymentMode,
          },

      });

      // The channel allows one identical call per minute. When that window is already held the
      // change is parked at the front of the queue rather than rejected — say so plainly instead of
      // reporting a failure, and leave the dialog for the operator to resend once it lands.
      if (data?.queued === true) {
        toast.info("Waiting on the Channel Manager", {
          description: data.message ||
            "The channel is taking this change now — resend it in about a minute if it does not appear.",
        });
        onDone();
        return;
      }

      toast.success(data?.message || "Booking modified", {
        description: "The Channel Manager and emails are updating in the background.",
      });
      onOpenChange(false);
      onDone();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Modification failed";
      toast.error(
        message.includes("UNIT_ALREADY_BOOKED")
          ? "Another reservation already holds this unit for the new dates."
          : message.replace(/^[A-Z_]+:\s*/, ""),
      );
      void refreshAvailability();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarClock className="h-4 w-4" />
            Modify booking — {booking.guest_name}
          </DialogTitle>
          <DialogDescription>
            {isRuBooking
              ? "The change is pushed to the Channel Manager first. If the channel refuses it, nothing changes here."
              : "Dates, guests and the total can be adjusted. Availability is re-blocked automatically."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Guest record — editable here, kept in our own records only. */}
          <div className="rounded-md border p-3 space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5 text-muted-foreground" />
              <p className="text-xs font-medium">Guest details</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {GUEST_LABELS.map(({ key, label, type }) => (
                <div key={key} className="space-y-1">
                  <Label className="text-[11px] text-muted-foreground">{label}</Label>
                  <Input
                    type={type ?? "text"}
                    className="h-8 text-xs"
                    value={guest[key]}
                    onChange={(e) => setGuest((prev) => ({ ...prev, [key]: e.target.value }))}
                  />
                </div>
              ))}
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Requests and notes from the guest</Label>
              <Textarea
                className="text-xs min-h-[60px]"
                value={specialRequests}
                onChange={(e) => setSpecialRequests(e.target.value)}
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Corrections here stay in your own records — the channel keeps its own copy of the guest.
            </p>
          </div>

          {/* As received from the channel — read-only. */}
          {received?.channel.hasDetails && (
            <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <Info className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="font-medium">As received{received.channel.channelLabel ? ` — ${received.channel.channelLabel}` : ""}</p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1">
                {received.channel.reservationId && (
                  <p><span className="text-muted-foreground">Reservation</span> {received.channel.reservationId}</p>
                )}
                {received.bookingChannel && (
                  <p><span className="text-muted-foreground">Channel</span> {received.bookingChannel}</p>
                )}
                {received.channel.createdAt && (
                  <p><span className="text-muted-foreground">Received</span> {received.channel.createdAt}</p>
                )}
                {received.channel.arrivalTime && (
                  <p><span className="text-muted-foreground">Arrival</span> {received.channel.arrivalTime}</p>
                )}
                {received.channel.address && (
                  <p className="sm:col-span-2"><span className="text-muted-foreground">Address</span> {received.channel.address}{received.channel.zipCode ? `, ${received.channel.zipCode}` : ""}</p>
                )}
              </div>
              {received.channel.guestComments && (
                <p className="whitespace-pre-wrap"><span className="text-muted-foreground">Guest said</span> {received.channel.guestComments}</p>
              )}
              {received.channel.reservationComments && (
                <p className="whitespace-pre-wrap"><span className="text-muted-foreground">Reservation notes</span> {received.channel.reservationComments}</p>
              )}
              {received.channel.nights.length > 0 && (
                <div className="pt-1 border-t">
                  <p className="text-muted-foreground mb-1">Price per night as received</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4">
                    {received.channel.nights.map((n) => (
                      <p key={n.date} className="flex justify-between">
                        <span>{format(parseISO(n.date), "d MMM")}</span>
                        <span className="tabular-nums">{money(n.price)}</span>
                      </p>
                    ))}
                  </div>
                  {received.channel.nightsTotal !== null && (
                    <p className="flex justify-between font-medium pt-1 mt-1 border-t">
                      <span>Nights total</span>
                      <span className="tabular-nums">{money(received.channel.nightsTotal)}</span>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}

          {/* The money story: what is billed, what came in, what is left, what we earn. */}
          {received && (
            <div className="rounded-md border p-3 space-y-1 text-xs">
              <div className="flex items-center gap-2 mb-1">
                <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="font-medium">Billing breakdown</p>
              </div>
              {billingLines.map((line, i) => (
                <p key={`${line.name}-${i}`} className="flex justify-between gap-3">
                  <span className={line.is_refundable ? "text-muted-foreground" : ""}>
                    {line.name}
                    {line.breakdown ? <span className="text-muted-foreground"> · {line.breakdown}</span> : null}
                    {line.is_refundable ? <span className="text-muted-foreground"> · refundable</span> : null}
                  </span>
                  <span className="tabular-nums">{money(line.amount)}</span>
                </p>
              ))}
              <p className="flex justify-between font-medium pt-1 border-t">
                <span>Guest total</span>
                <span className="tabular-nums">{money(guestTotal)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-muted-foreground">
                  Already paid
                  {received.amountPaidSource === "channel" ? " (taken by the channel)" : ""}
                  {received.paymentMethod ? ` · ${received.paymentMethod}` : ""}
                </span>
                <span className="tabular-nums">{money(amountPaid ?? 0)}</span>
              </p>
              <p className="flex justify-between font-medium">
                <span>{(amountPaid ?? 0) > guestTotal ? "Overpaid" : "Still outstanding"}</span>
                <span className="tabular-nums">{money(Math.abs(guestTotal - (amountPaid ?? 0)))}</span>
              </p>
              {received.depositAmount > 0 && (
                <p className="flex justify-between text-muted-foreground">
                  <span>Refundable deposit held separately</span>
                  <span className="tabular-nums">{money(received.depositAmount)}</span>
                </p>
              )}
              {commissionView.amount !== null && (
                <>
                  <p className="flex justify-between pt-1 border-t">
                    <span className="text-muted-foreground">
                      Commission{commissionView.rate !== null ? ` · ${commissionView.rate}%` : ""}
                      {commissionView.type ? ` · ${commissionView.type}` : ""}
                    </span>
                    <span className="tabular-nums">{money(commissionView.amount)}</span>
                  </p>
                  {commissionView.netToProperty !== null && (
                    <p className="flex justify-between font-medium">
                      <span>Net to the property</span>
                      <span className="tabular-nums">{money(commissionView.netToProperty)}</span>
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Stay dates</Label>

            <StayRangePicker
              numberOfMonths={2}
              minDate={null}
              from={selectedFrom}
              to={selectedTo}
              onChange={({ fromDate, toDate }) => onRangeSelect({ from: fromDate, to: toDate } as any)}
              placeholder="Pick the stay"
              disabledDays={mayOverbook ? undefined : disabledStayDays}
              modifiers={{ originalStay: originalRangeDays, rolBlocked: blockedStayDays }}
              modifiersClassNames={{
                originalStay: "ring-1 ring-inset ring-border",
                rolBlocked: "line-through text-muted-foreground opacity-60",
              }}
              header={
                <div className="border-b px-3 py-2 space-y-1">
                  <p className="text-[11px] text-muted-foreground">
                    {originalFrom && originalTo
                      ? `Originally ${format(originalFrom, "d MMM")} – ${format(originalTo, "d MMM yyyy")} · ${originalNights} night${originalNights === 1 ? "" : "s"}`
                      : "Original stay unavailable"}
                  </p>
                  <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm ring-1 ring-border" />
                    Original stay
                  </p>
                </div>
              }
            />
            <div className="flex items-center gap-2">
              <p className={nights > 0 ? "text-[11px] text-muted-foreground" : "text-[11px] text-destructive"}>
                {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Check-out must be after check-in"}
              </p>
              {nights > 0 && nightsDelta !== 0 && (
                <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                  {nightsDelta > 0 ? `+${nightsDelta}` : nightsDelta} night{Math.abs(nightsDelta) === 1 ? "" : "s"}
                </span>
              )}
            </div>
            {stayClash && (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 space-y-2">
                <p className="text-xs font-medium text-destructive">
                  {format(parseISO(stayClash.iso), "d MMM yyyy")} is already taken — {stayClash.reason}.
                </p>
                {mayOverbook && (
                  <div className="space-y-1">
                    <Label className="text-[10px]">Reason for overbooking (required to continue)</Label>
                    <Input
                      className="h-8"
                      value={overbookReason}
                      onChange={(e) => setOverbookReason(e.target.value)}
                      placeholder="e.g. guest moving units on arrival"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Adults</Label>
              <Input
                type="number"
                min={1}
                max={stayCapacity ? Math.max(1, stayCapacity - (Number(children) || 0) - (Number(teens) || 0)) : undefined}
                value={adults}
                onChange={(e) => setAdults(clampGuests("adults", e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Children</Label>
              <Input
                type="number"
                min={0}
                max={stayCapacity ? Math.max(0, stayCapacity - (Number(adults) || 0) - (Number(teens) || 0)) : undefined}
                value={children}
                onChange={(e) => setChildren(clampGuests("children", e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Teens</Label>
              <Input type="number" min={0} max={stayCapacity ? Math.max(0, stayCapacity - (Number(adults) || 0) - (Number(children) || 0)) : undefined} value={teens} onChange={(e) => setTeens(clampGuests("teens", e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Infants</Label>
              <Input type="number" min={0} value={infants} onChange={(e) => setInfants(e.target.value)} />
            </div>
          </div>
          {stayCapacity && (
            <p className={cn("text-[11px]", (Number(adults) || 0) + (Number(children) || 0) + (Number(teens) || 0) > stayCapacity ? "font-medium text-destructive" : "text-muted-foreground")}>
              Booked unit{assignedRoomIds.length === 1 ? "" : "s"} sleep {stayCapacity} guest{stayCapacity === 1 ? "" : "s"}
            </p>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Accommodation (ZAR)</Label>
            <Input
              type="number"
              min={0}
              value={totalPrice}
              onChange={(e) => {
                setManualTotal(true);
                setTotalPrice(e.target.value);
              }}
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">
                Current accommodation: R{storedAccommodation.toLocaleString()}
              </p>
              {quoting && (
                <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />Re-pricing
                </span>
              )}
            </div>
            {!quoting && quotedTotal !== null && (
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] text-muted-foreground">
                  {quoteSource === "live"
                    ? `Re-priced for ${nights} night${nights === 1 ? "" : "s"} — live rates`
                    : "Estimated from the current nightly average"}
                </p>
                {manualTotal && Number(totalPrice) !== quotedTotal && (
                  <button
                    type="button"
                    className="text-[11px] underline text-primary"
                    onClick={() => {
                      setManualTotal(false);
                      setTotalPrice(String(quotedTotal));
                    }}
                  >
                    Reset to re-priced
                  </button>
                )}
              </div>
            )}
          </div>

          {(extrasBusy || (extras && (extras.lines.length > 0 || extras.deposit_total > 0))) && (
            <div className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Accommodation</span>
                <span className="tabular-nums">{money(Number(totalPrice || 0))}</span>
              </div>

              {extrasBusy && !extras && (
                <p className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />Pricing extras for the new stay
                </p>
              )}

              {extras?.lines.map((line, i) => (
                <div key={`${line.name}-${i}`} className="flex items-start justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">
                    {line.name}
                    {line.breakdown && (
                      <span className="block text-[10px] opacity-70">{line.breakdown}</span>
                    )}
                    {line.is_refundable && (
                      <span className="block text-[10px] opacity-70">Refundable — not part of the total</span>
                    )}
                  </span>
                  <span className="tabular-nums">{money(line.amount)}</span>
                </div>
              ))}

              {extras && (
                <div className="flex items-center justify-between border-t pt-2 text-sm font-medium">
                  <span>Guest total</span>
                  <span className="tabular-nums">{money(extras.guest_total)}</span>
                </div>
              )}
              {extras && extras.deposit_total > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  Plus {money(extras.deposit_total)} refundable deposit, held separately.
                </p>
              )}
            </div>
          )}

          {amountPaid !== null && amountPaid > 0 && (
            <div className="rounded-md border p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Already received</span>
                <span className="tabular-nums">{money(amountPaid)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">New total</span>
                <span className="tabular-nums">{money(guestTotal)}</span>
              </div>
              {Math.abs(delta) < 0.01 ? (
                <p className="text-[11px] text-muted-foreground">Fully settled — no money changes hands.</p>
              ) : delta < 0 ? (
                <>
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      <Undo2 className="h-3.5 w-3.5" />Guest overpaid
                    </span>
                    <span className="tabular-nums text-primary">{money(delta)}</span>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-[11px] font-normal text-muted-foreground leading-snug">
                      What happens to the {money(delta)} overpayment
                    </Label>
                    <div className="grid grid-cols-3 gap-1">
                      {([
                        { key: "guest_choice", label: "Guest chooses" },
                        { key: "refund", label: "Refund" },
                        { key: "credit", label: "On account" },
                      ] as const).map((opt) => (
                        <Button
                          key={opt.key}
                          type="button"
                          size="sm"
                          variant={overpaymentMode === opt.key ? "default" : "outline"}
                          className="h-7 text-[11px]"
                          onClick={() => setOverpaymentMode(opt.key)}
                        >
                          {opt.label}
                        </Button>
                      ))}
                    </div>
                    <p className="text-[10px] text-muted-foreground">
                      {overpaymentMode === "credit"
                        ? "Held as guest credit on the stay folio — nothing leaves the bank."
                        : overpaymentMode === "refund"
                        ? "Scheduled as a pending refund for approval in the Refund Register."
                        : "The guest is emailed a link to take the refund or keep it on account."}
                    </p>
                  </div>

                </>
              ) : (
                <>
                  <div className="flex items-center justify-between text-sm font-medium">
                    <span className="flex items-center gap-1.5">
                      <Wallet className="h-3.5 w-3.5" />Outstanding
                    </span>
                    <span className="tabular-nums text-primary">{money(delta)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-[11px] font-normal text-muted-foreground leading-snug">
                      Email the guest a secure link to settle the balance
                    </Label>
                    <Switch checked={requestBalance} onCheckedChange={setRequestBalance} />
                  </div>
                </>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Note to guest (optional)</Label>
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Reason for the change" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy || nights <= 0}>
            {busy && <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
