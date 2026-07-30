import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { callPmsApi } from "@/hooks/usePmsApi";
import { LogOut, ShieldCheck, AlertTriangle } from "lucide-react";

interface BookingCharge {
  id: string;
  name: string;
  category: string;
  amount: number;
  is_refundable: boolean;
  refund_timing: string | null;
  refund_status: string | null;
}

interface CheckoutConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  bookingId: string;
  guestName: string;
  onConfirm: () => void;
}

export function CheckoutConfirmationDialog({
  open,
  onOpenChange,
  bookingId,
  guestName,
  onConfirm,
}: CheckoutConfirmationDialogProps) {
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [balance, setBalance] = useState(0);
  const [totalCharges, setTotalCharges] = useState(0);
  const [totalPayments, setTotalPayments] = useState(0);
  const [refundableCharges, setRefundableCharges] = useState<BookingCharge[]>([]);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([
      callPmsApi<any>("get_folio", { booking_id: bookingId }),
      callPmsApi<{ charges: BookingCharge[] }>("get_booking_charges", { booking_id: bookingId }),
    ]).then(([folioRes, chargesRes]) => {
      if (folioRes.success && folioRes.data) {
        const txns = folioRes.data.transactions || [];
        const charges = txns.filter((t: any) => t.amount > 0).reduce((s: number, t: any) => s + t.amount, 0);
        const payments = txns.filter((t: any) => t.amount < 0).reduce((s: number, t: any) => s + Math.abs(t.amount), 0);
        setTotalCharges(charges);
        setTotalPayments(payments);
        setBalance(charges - payments);
      }
      if (chargesRes.success && chargesRes.data) {
        setRefundableCharges(
          (chargesRes.data.charges || []).filter(
            (c: BookingCharge) => c.is_refundable && c.refund_timing === "on_checkout" && c.refund_status === "pending"
          )
        );
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [open, bookingId]);

  const totalRefunds = refundableCharges.reduce((s, c) => s + c.amount, 0);
  const netSettlement = balance - totalRefunds;

  const handleConfirm = async () => {
    setConfirming(true);
    onConfirm();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LogOut className="h-4 w-4" />Check Out: {guestName}
          </DialogTitle>
          <DialogDescription>Review the settlement summary before processing checkout.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <p className="text-sm text-muted-foreground py-4 text-center">Loading settlement...</p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2 text-sm">
              <div className="bg-muted/50 rounded-md p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total Charges</p>
                <p className="font-semibold">R{totalCharges.toLocaleString()}</p>
              </div>
              <div className="bg-muted/50 rounded-md p-2.5 text-center">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Payments</p>
                <p className="font-semibold text-success">R{totalPayments.toLocaleString()}</p>
              </div>
            </div>

            {balance > 0 && (
              <div className="flex items-center gap-2 text-sm bg-amber-500/10 rounded-md p-2.5">
                <AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" />
                <span className="text-warning">Outstanding balance: <strong>R{balance.toLocaleString()}</strong></span>
              </div>
            )}

            {refundableCharges.length > 0 && (
              <>
                <Separator />
                <div className="space-y-1.5">
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <ShieldCheck className="h-3 w-3" />Deposits to Refund on Checkout
                  </h5>
                  {refundableCharges.map(c => (
                    <div key={c.id} className="flex items-center justify-between text-sm py-1 px-2 rounded bg-violet-500/10">
                      <span className="text-xs">{c.name}</span>
                      <span className="text-xs font-semibold text-violet-700">-R{c.amount.toLocaleString()}</span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <Separator />

            <div className={`rounded-md p-3 text-center ${netSettlement > 0 ? "bg-destructive/10" : "bg-green-500/10"}`}>
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Net Settlement</p>
              <p className={`text-lg font-bold ${netSettlement > 0 ? "text-destructive" : "text-success"}`}>
                R{netSettlement.toLocaleString()}
              </p>
              {refundableCharges.length > 0 && (
                <p className="text-[10px] text-muted-foreground mt-0.5">
                  After {refundableCharges.length} deposit refund(s)
                </p>
              )}
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>Cancel</Button>
          <Button onClick={handleConfirm} disabled={loading || confirming}>
            <LogOut className="h-3.5 w-3.5 mr-1.5" />
            {confirming ? "Processing..." : "Confirm Check Out"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
