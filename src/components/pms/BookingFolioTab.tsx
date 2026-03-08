import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { callPmsApi } from "@/hooks/usePmsApi";
import { toast } from "sonner";
import { Plus, CreditCard, Receipt } from "lucide-react";

interface Transaction {
  id: string;
  transaction_type: string;
  description: string;
  amount: number;
  tax_amount: number | null;
  reference: string | null;
  created_at: string;
}

interface BookingFolioTabProps {
  bookingId: string;
}

export function BookingFolioTab({ bookingId }: BookingFolioTabProps) {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [folioStatus, setFolioStatus] = useState<string>("open");
  const [showChargeForm, setShowChargeForm] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [chargeForm, setChargeForm] = useState({ description: "", amount: "", type: "charge" });
  const [paymentForm, setPaymentForm] = useState({ amount: "", method: "cash", reference: "" });

  const fetchFolio = async () => {
    setLoading(true);
    try {
      const res = await callPmsApi<{ transactions: Transaction[]; status: string }>("get_folio", { booking_id: bookingId });
      if (res.success && res.data) {
        setTransactions(res.data.transactions || []);
        setFolioStatus(res.data.status || "open");
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

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading folio...</p>;

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
          <p className="text-sm font-semibold text-green-600">R{totalPayments.toLocaleString()}</p>
        </div>
        <div className={`rounded-md p-3 text-center ${balance > 0 ? "bg-red-500/10" : "bg-green-500/10"}`}>
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</p>
          <p className={`text-sm font-bold ${balance > 0 ? "text-red-600" : "text-green-600"}`}>R{balance.toLocaleString()}</p>
        </div>
      </div>

      {folioStatus !== "closed" && (
        <div className="flex gap-2">
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
                  {t.amount < 0 ? <CreditCard className="h-3 w-3 text-green-600" /> : <Receipt className="h-3 w-3 text-muted-foreground" />}
                  <div>
                    <p className="text-xs font-medium">{t.description}</p>
                    <p className="text-[10px] text-muted-foreground">{new Date(t.created_at).toLocaleString()}</p>
                  </div>
                </div>
                <span className={`text-xs font-semibold ${t.amount < 0 ? "text-green-600" : ""}`}>
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
