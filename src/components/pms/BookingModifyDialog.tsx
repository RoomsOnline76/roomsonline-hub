import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { addDays, differenceInDays, format, parseISO, startOfDay } from "date-fns";
import { CalendarClock, CalendarIcon, Loader2, Undo2, Wallet } from "lucide-react";
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
import { extractFunctionError } from "@/lib/functionError";
import { fetchLiveRates } from "@/lib/pmsLiveAvailability";
import { cn } from "@/lib/utils";

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

type QuoteSource = "live" | "average" | null;

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
  const [totalPrice, setTotalPrice] = useState(String(booking.total_price ?? 0));
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /** What has actually been received — drives the refund / balance preview. */
  const [amountPaid, setAmountPaid] = useState<number | null>(null);
  const [overpaymentMode, setOverpaymentMode] = useState<"refund" | "credit" | "guest_choice">("guest_choice");

  const [requestBalance, setRequestBalance] = useState(true);
  const [datesOpen, setDatesOpen] = useState(false);

  // ─── Automatic re-pricing ───
  const [quotedTotal, setQuotedTotal] = useState<number | null>(null);
  const [quoteSource, setQuoteSource] = useState<QuoteSource>(null);
  const [quoting, setQuoting] = useState(false);
  /** Once the operator types a total, their figure wins over later auto-quotes. */
  const [manualTotal, setManualTotal] = useState(false);
  const quoteSeq = useRef(0);

  useEffect(() => {
    if (!open) return;
    setCheckIn(booking.check_in_date);
    setCheckOut(booking.check_out_date);
    setAdults(String(booking.adults ?? 1));
    setChildren(String(booking.children ?? 0));
    setTotalPrice(String(booking.total_price ?? 0));
    setNote("");
    setManualTotal(false);
    setQuotedTotal(null);
    setQuoteSource(null);
  }, [open, booking.id, booking.check_in_date, booking.check_out_date, booking.adults, booking.children, booking.total_price]);

  useEffect(() => {
    if (!open) return;
    let mounted = true;
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select("amount_paid, payment_status, total_price")
        .eq("id", booking.id)
        .maybeSingle();
      if (!mounted || !data) return;
      const stored = Number(data.amount_paid ?? 0);
      const paidFlag = ["paid", "complete", "completed", "success"].includes(
        String(data.payment_status ?? "").toLowerCase(),
      );
      setAmountPaid(stored > 0 ? stored : paidFlag ? Number(data.total_price ?? 0) : 0);
    })();
    return () => {
      mounted = false;
    };
  }, [open, booking.id]);

  const originalNights = useMemo(
    () => nightsBetween(booking.check_in_date, booking.check_out_date),
    [booking.check_in_date, booking.check_out_date],
  );
  const nights = useMemo(() => nightsBetween(checkIn, checkOut), [checkIn, checkOut]);
  const nightsDelta = nights - originalNights;
  const datesChanged = checkIn !== booking.check_in_date || checkOut !== booking.check_out_date;
  const paxChanged =
    Number(adults) !== (booking.adults ?? 0) || Number(children) !== (booking.children ?? 0);

  /** Pro-rata fallback: the booking's own nightly average applied to the new stay. */
  const averageQuote = useMemo(() => {
    if (originalNights <= 0 || nights <= 0) return null;
    const perNight = Number(booking.total_price || 0) / originalNights;
    if (!perNight) return null;
    return Math.round(perNight * nights * 100) / 100;
  }, [booking.total_price, originalNights, nights]);

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

        if (booking.property_id) {
          try {
            const live = await fetchLiveRates(booking.property_id, null, checkIn, checkOut);
            const room =
              live.rooms.find((r) => r.roomTypeId === booking.room_type_id) ||
              (live.rooms.length === 1 ? live.rooms[0] : undefined);
            if (room) {
              let sum = 0;
              let covered = 0;
              for (let i = 0; i < nights; i++) {
                const key = format(addDays(parseISO(checkIn), i), "yyyy-MM-dd");
                const rate = room.ratesByDate?.[key];
                if (typeof rate === "number" && rate > 0) {
                  sum += rate;
                  covered++;
                }
              }
              if (covered === nights && sum > 0) {
                resolved = Math.round(sum * 100) / 100;
                source = "live";
              } else if (room.minRate && room.minRate > 0) {
                resolved = Math.round(room.minRate * nights * 100) / 100;
                source = "live";
              }
            }
          } catch (err) {
            console.warn("[BookingModifyDialog] live re-pricing failed:", err);
          }
        }

        if (resolved === null && averageQuote !== null) {
          resolved = averageQuote;
          source = "average";
        }

        if (seq !== quoteSeq.current) return;
        setQuotedTotal(resolved);
        setQuoteSource(resolved === null ? null : source);
        setQuoting(false);
      })();
    }, 300);

    return () => clearTimeout(timer);
  }, [open, checkIn, checkOut, nights, datesChanged, paxChanged, booking.property_id, booking.room_type_id, averageQuote]);

  // Push the quote into the field unless the operator has taken over.
  useEffect(() => {
    if (manualTotal || quotedTotal === null) return;
    setTotalPrice(String(quotedTotal));
  }, [quotedTotal, manualTotal]);

  /** Positive = guest still owes, negative = guest overpaid. */
  const delta = useMemo(() => {
    if (amountPaid === null) return 0;
    return Math.round((Number(totalPrice || 0) - amountPaid) * 100) / 100;
  }, [amountPaid, totalPrice]);

  const money = (n: number) => `R${Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;

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

  const submit = async () => {
    if (nights <= 0) {
      toast.error("Check-out must be after check-in.");
      return;
    }
    setBusy(true);
    try {
      const modifications: Record<string, unknown> = { note: note.trim() || undefined };
      if (checkIn !== booking.check_in_date) modifications.check_in_date = checkIn;
      if (checkOut !== booking.check_out_date) modifications.check_out_date = checkOut;
      if (Number(adults) !== (booking.adults ?? 0)) modifications.adults = Number(adults);
      if (Number(children) !== (booking.children ?? 0)) modifications.children = Number(children);
      // Always carry the corrected figure so the channel push and settlement
      // loop see the re-priced total, not the stale one.
      if (Number(totalPrice) !== Number(booking.total_price)) modifications.total_price = Number(totalPrice);

      const changedKeys = Object.keys(modifications).filter((k) => k !== "note");
      if (changedKeys.length === 0) {
        toast.error("Nothing has changed yet.");
        setBusy(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke("modify-booking", {
        body: {
          booking_id: booking.id,
          modifications,
          // Guards against undoing a Channel Manager modification that landed while this was open.
          expected_updated_at: booking.updated_at ?? null,
          settlement: {
            raise_refund: overpaymentMode !== "credit",
            request_balance: requestBalance,
            overpayment_mode: overpaymentMode,
          },

        },
      });


      if (error) throw new Error(await extractFunctionError(error, "Modification failed"));
      if (data && data.success === false) throw new Error(data.message || "Modification failed");

      toast.success(data?.message || "Booking modified", {
        description: "The Channel Manager and emails are updating in the background.",
      });
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Modification failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-md">
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
          <div className="space-y-1.5">
            <Label className="text-xs">Stay dates</Label>
            <StayRangePicker
              numberOfMonths={2}
              minDate={null}
              from={selectedFrom}
              to={selectedTo}
              onChange={({ fromDate, toDate }) => onRangeSelect({ from: fromDate, to: toDate } as any)}
              placeholder="Pick the stay"
              modifiers={{ originalStay: originalRangeDays }}
              modifiersClassNames={{ originalStay: "ring-1 ring-inset ring-border" }}
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
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Adults</Label>
              <Input type="number" min={1} value={adults} onChange={(e) => setAdults(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Children</Label>
              <Input type="number" min={0} value={children} onChange={(e) => setChildren(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Total (ZAR)</Label>
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
                Current: R{Number(booking.total_price || 0).toLocaleString()}
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

          {amountPaid !== null && amountPaid > 0 && (
            <div className="rounded-md border p-3 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Already received</span>
                <span className="tabular-nums">{money(amountPaid)}</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">New total</span>
                <span className="tabular-nums">{money(Number(totalPrice || 0))}</span>
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
