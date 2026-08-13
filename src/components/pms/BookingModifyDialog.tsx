import { useEffect, useMemo, useState } from "react";
import { differenceInDays, parseISO } from "date-fns";
import { CalendarClock, Loader2, Undo2, Wallet } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { extractFunctionError } from "@/lib/functionError";


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
  };
  /** Shows the channel-push notice for Rentals United reservations. */
  isRuBooking?: boolean;
  onDone: () => void;
}

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
  const [raiseRefund, setRaiseRefund] = useState(true);
  const [requestBalance, setRequestBalance] = useState(true);

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

  let nights = 0;
  try {
    nights = differenceInDays(parseISO(checkOut), parseISO(checkIn));
  } catch {
    nights = 0;
  }

  /** Positive = guest still owes, negative = guest overpaid. */
  const delta = useMemo(() => {
    if (amountPaid === null) return 0;
    return Math.round((Number(totalPrice || 0) - amountPaid) * 100) / 100;
  }, [amountPaid, totalPrice]);

  const money = (n: number) => `R${Math.abs(n).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}`;



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
          settlement: { raise_refund: raiseRefund, request_balance: requestBalance },
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
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Check-in</Label>
              <Input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Check-out</Label>
              <Input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} />
            </div>
          </div>
          <p className={nights > 0 ? "text-[11px] text-muted-foreground" : "text-[11px] text-destructive"}>
            {nights > 0 ? `${nights} night${nights === 1 ? "" : "s"}` : "Check-out must be after check-in"}
          </p>

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
            <Input type="number" min={0} value={totalPrice} onChange={(e) => setTotalPrice(e.target.value)} />
            <p className="text-[11px] text-muted-foreground">
              Current: R{Number(booking.total_price || 0).toLocaleString()}
            </p>
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
                  <div className="flex items-center justify-between gap-3">
                    <Label className="text-[11px] font-normal text-muted-foreground leading-snug">
                      Raise a pending refund for approval in the Refund Register
                    </Label>
                    <Switch checked={raiseRefund} onCheckedChange={setRaiseRefund} />
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
