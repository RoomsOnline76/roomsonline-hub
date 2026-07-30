import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { callPmsApi } from "@/hooks/usePmsApi";
import { toast } from "sonner";
import { Plus, CreditCard, Receipt, Zap, RotateCcw, ShieldCheck } from "lucide-react";

interface Transaction {
  id: string;
  transaction_type: string;
  description: string;
  amount: number;
  tax_amount: number | null;
  reference: string | null;
  created_at: string;
}

interface BookingCharge {
  id: string;
  name: string;
  category: string;
  calculation_method: string;
  amount: number;
  is_refundable: boolean;
  refund_timing: string | null;
  refund_status: string | null;
  breakdown: string | null;
  created_at: string;
}

interface BookingFolioTabProps {
  bookingId: string;
}

const CATEGORY_COLORS: Record<string, string> = {
  tax: "bg-amber-500/15 text-warning border-warning-border",
  fee: "bg-blue-500/15 text-info border-info-border",
  deposit: "bg-violet-500/15 text-violet-700 border-violet-300",
  surcharge: "bg-rose-500/15 text-destructive border-danger-border",
  custom: "bg-slate-500/15 text-foreground/80 border-border",
};

export function BookingFolioTab({ bookingId }: BookingFolioTabProps) {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [bookingCharges, setBookingCharges] = useState<BookingCharge[]>([]);
  const [folioStatus, setFolioStatus] = useState<string>("open");
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [applyingCharges, setApplyingCharges] = useState(false);
  const [processingRefund, setProcessingRefund] = useState<string | null>(null);

  const [chargeForm, setChargeForm] = useState({ description: "", amount: "", type: "charge" });
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "cash", reference: "" });

  const fetchFolio = async () => {
    setLoading(true);
    try {
      const [folioRes, chargesRes] = await Promise.all([
        callPmsApi<{ transactions: Transaction[]; status: string }>("get_folio", { booking_id: bookingId }),
        callPmsApi<{ charges: BookingCharge[] }>("get_booking_charges", { booking_id: bookingId }),
      ]);
      if (folioRes.success && folioRes.data) {
        setTransactions(folioRes.data.transactions || []);
        setFolioStatus(folioRes.data.status || "open");
      }
      if (chargesRes.success && chargesRes.data) {
        setBookingCharges(chargesRes.data.charges || []);
      }
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchFolio(); }, [bookingId]);

  const totalCharges = transactions.filter(t => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const totalPayments = transactions.filter(t => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);
  const balance = totalCharges - totalPayments;

  const handleAddCharge = async () => {
    if (!chargeForm.description || !chargeForm.amount) return;
    setSaving(true);
    try {
      const res = await callPmsApi("add_folio_charge", {
        booking_id: bookingId,
        description: chargeForm.description,
        amount: parseFloat(chargeForm.amount),
        transaction_type: chargeForm.type,
      });
      if (res.success) {
        toast.success("Charge added");
        setChargeForm({ description: "", amount: "", type: "charge" });
        setShowChargeForm(false);
        fetchFolio();
      }
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleAddPayment = async () => {
    if (!paymentForm.amount) return;
    setSaving(true);
    try {
      const res = await callPmsApi("process_folio_payment", {
        booking_id: bookingId,
        amount: parseFloat(paymentForm.amount),
        payment_method: paymentForm.method,
        reference: paymentForm.reference || null,
      });
      if (res.success) {
        toast.success("Payment recorded");
        setPaymentForm({ amount: "", method: "cash", reference: "" });
        setShowPaymentForm(false);
        fetchFolio();
      }
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const handleApplyServiceCharges = async () => {
    setApplyingCharges(true);
    try {
      const res = await callPmsApi<{ applied: any[]; count: number; skipped?: boolean }>("apply_service_charges", { booking_id: bookingId });
      if (res.success && res.data) {
        if (res.data.skipped) {
          toast.info("Service charges already applied to this booking");
        } else {
          toast.success(`${res.data.count} service charge(s) applied`);
        }
        fetchFolio();
      }
    } catch (e: any) { toast.error(e.message); }
    setApplyingCharges(false);
  };

  const handleProcessRefund = async (chargeId: string) => {
    setProcessingRefund(chargeId);
    try {
      const res = await callPmsApi("process_checkout_refunds", { booking_id: bookingId });
      if (res.success) {
        toast.success("Refund processed");
        fetchFolio();
      }
    } catch (e: any) { toast.error(e.message); }
    setProcessingRefund(null);
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading folio...</p>;

  const hasChargesApplied = bookingCharges.length > 0;
  const pendingRefunds = bookingCharges.filter(c => c.is_refundable && c.refund_status === "pending");

  return (
    <div className="space-y-4">
      {/* Balance Summary */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted/50 rounded-md p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Charges</p>
          <p className="text-sm font-semibold">R{totalCharges.toLocaleString()}</p>
        </div>
        <div className="bg-muted/50 rounded-md p-3 text-center">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Payments</p>
          <p className="text-sm font-semibold text-success">R{totalPayments.toLocaleString()}</p>
        </div>
        <div className={`rounded-md p-3 text-center ${balance > 0 ? "bg-destructive/10" : "bg-green-500/10"}`}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</p>
          <p className={`text-sm font-bold ${balance > 0 ? "text-destructive" : "text-success"}`}>R{balance.toLocaleString()}</p>
        </div>
      </div>

      {/* Applied Service Charges */}
      {hasChargesApplied && (
        <div className="space-y-1.5">
          <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Service Charges</h5>
          <div className="space-y-1">
            {bookingCharges.map(c => (
              <div key={c.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/30">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={`text-[9px] px-1.5 py-0 ${CATEGORY_COLORS[c.category] || CATEGORY_COLORS.custom}`}>
                    {c.category}
                  </Badge>
                  <div>
                    <p className="text-xs font-medium">{c.name}</p>
                    {c.breakdown && <p className="text-[10px] text-muted-foreground">{c.breakdown}</p>}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold">R{c.amount.toLocaleString()}</span>
                  {c.is_refundable && (
                    c.refund_status === "processed" ? (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 bg-green-500/15 text-success border-success-border">
                        <ShieldCheck className="h-2.5 w-2.5 mr-0.5" />Refunded
                      </Badge>
                    ) : c.refund_status === "pending" ? (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 text-[10px] px-1.5"
                        onClick={() => handleProcessRefund(c.id)}
                        disabled={processingRefund === c.id}
                      >
                        <RotateCcw className="h-2.5 w-2.5 mr-0.5" />
                        {processingRefund === c.id ? "..." : "Refund"}
                      </Button>
                    ) : null
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {folioStatus !== "closed" && (
        <div className="flex gap-2 flex-wrap">
          {!hasChargesApplied && (
            <Button size="sm" variant="outline" onClick={handleApplyServiceCharges} disabled={applyingCharges} className="flex-1">
              <Zap className="h-3 w-3 mr-1" />{applyingCharges ? "Applying..." : "Apply Service Charges"}
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={() => setShowChargeForm(!showChargeForm)} className="flex-1">
            <Plus className="h-3 w-3 mr-1" />Add Charge
          </Button>
          <Button size="sm" variant="outline" onClick={() => setShowPaymentForm(!showPaymentForm)} className="flex-1">
            <CreditCard className="h-3 w-3 mr-1" />Record Payment
          </Button>
        </div>
      )}

      {showChargeForm && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <h5 className="text-xs font-semibold uppercase text-muted-foreground">New Charge</h5>
          <Input placeholder="Description (e.g. Minibar, Extra towels)" value={chargeForm.description} onChange={e => setChargeForm(p => ({ ...p, description: e.target.value }))} />
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="Amount" min={0} value={chargeForm.amount} onChange={e => setChargeForm(p => ({ ...p, amount: e.target.value }))} />
            <Select value={chargeForm.type} onValueChange={v => setChargeForm(p => ({ ...p, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="charge">Room Charge</SelectItem>
                <SelectItem value="extra">Extra</SelectItem>
                <SelectItem value="minibar">Minibar</SelectItem>
                <SelectItem value="tax">Tax</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button size="sm" onClick={handleAddCharge} disabled={saving}>{saving ? "Adding..." : "Add Charge"}</Button>
        </div>
      )}

      {showPaymentForm && (
        <div className="border border-border rounded-md p-3 space-y-2">
          <h5 className="text-xs font-semibold uppercase text-muted-foreground">Record Payment</h5>
          <div className="grid grid-cols-2 gap-2">
            <Input type="number" placeholder="Amount" min={0} value={paymentForm.amount} onChange={e => setPaymentForm(p => ({ ...p, amount: e.target.value }))} />
            <Select value={paymentForm.method} onValueChange={v => setPaymentForm(p => ({ ...p, method: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Cash</SelectItem>
                <SelectItem value="card">Card</SelectItem>
                <SelectItem value="eft">EFT</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Input placeholder="Reference (optional)" value={paymentForm.reference} onChange={e => setPaymentForm(p => ({ ...p, reference: e.target.value }))} />
          <Button size="sm" onClick={handleAddPayment} disabled={saving}>{saving ? "Recording..." : "Record Payment"}</Button>
        </div>
      )}

      <Separator />

      {/* Transactions List */}
      <div className="space-y-1">
        <h5 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Transactions</h5>
        {transactions.length === 0 ? (
          <p className="text-xs text-muted-foreground py-2">No transactions yet.</p>
        ) : (
          <div className="space-y-1.5">
            {transactions.map(t => (
              <div key={t.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded bg-muted/30">
                <div className="flex items-center gap-2">
                  {t.amount < 0 ? <CreditCard className="h-3 w-3 text-success" /> : <Receipt className="h-3 w-3 text-muted-foreground" />}
                  <div>
                    <p className="text-xs font-medium">{t.description}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold ${t.amount < 0 ? "text-success" : ""}`}>
                  {t.amount < 0 ? "-" : ""}R{Math.abs(t.amount).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {folioStatus === "closed" && (
        <Badge variant="secondary" className="w-full justify-center">Folio Closed</Badge>
      )}
    </div>
  );
}
