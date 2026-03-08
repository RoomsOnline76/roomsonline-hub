import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { callPmsApi } from "@/hooks/usePmsApi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Printer, Mail, FileText } from "lucide-react";

interface BookingInvoiceProps {
  bookingId: string;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  totalPrice: number;
  propertyId: string;
}

interface Transaction {
  id: string;
  transaction_type: string;
  description: string;
  amount: number;
  tax_amount: number | null;
  created_at: string;
}

export function BookingInvoice({ bookingId, guestName, guestEmail, checkIn, checkOut, adults, totalPrice, propertyId }: BookingInvoiceProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [propertyName, setPropertyName] = useState("");
  const [loading, setLoading] = useState(true);
  const [emailing, setEmailing] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [folioRes, propRes] = await Promise.all([
        callPmsApi<{ transactions: Transaction[] }>("get_folio", { booking_id: bookingId }),
        supabase.from("properties").select("name").eq("id", propertyId).single(),
      ]);
      if (folioRes.success && folioRes.data) setTransactions(folioRes.data.transactions || []);
      if (propRes.data) setPropertyName(propRes.data.name);
      setLoading(false);
    };
    load();
  }, [bookingId, propertyId]);

  const charges = transactions.filter(t => t.amount > 0);
  const payments = transactions.filter(t => t.amount < 0);
  const totalCharges = charges.reduce((s, t) => s + t.amount, 0);
  const totalPayments = payments.reduce((s, t) => s + Math.abs(t.amount), 0);
  const balance = totalCharges - totalPayments;
  const invoiceNumber = `INV-${bookingId.slice(0, 8).toUpperCase()}`;
  const today = new Date().toLocaleDateString("en-ZA");

  const handlePrint = () => {
    const content = invoiceRef.current;
    if (!content) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head><title>${invoiceNumber}</title>
      <style>
        body { font-family: system-ui, sans-serif; padding: 40px; color: #1a1a1a; max-width: 800px; margin: 0 auto; }
        table { width: 100%; border-collapse: collapse; margin: 16px 0; }
        th, td { padding: 8px 12px; text-align: left; border-bottom: 1px solid #e5e5e5; font-size: 13px; }
        th { background: #f5f5f5; font-weight: 600; text-transform: uppercase; font-size: 11px; letter-spacing: 0.5px; }
        .text-right { text-align: right; }
        .header { display: flex; justify-content: space-between; margin-bottom: 32px; }
        .total-row { font-weight: 700; border-top: 2px solid #1a1a1a; }
        h1 { font-size: 24px; margin: 0; }
        .meta { color: #666; font-size: 13px; }
        .section { margin: 24px 0; }
        .balance { font-size: 18px; font-weight: 700; padding: 12px; background: ${balance > 0 ? '#fef2f2' : '#f0fdf4'}; border-radius: 6px; text-align: center; }
        @media print { body { padding: 20px; } }
      </style>
    </head><body>${content.innerHTML}</body></html>`);
    win.document.close();
    win.print();
  };

  const handleEmail = async () => {
    setEmailing(true);
    try {
      const { error } = await supabase.functions.invoke("send-booking-email", {
        body: { booking_id: bookingId, bookingId: bookingId, type: "invoice", status: "success" },
      });
      if (error) throw error;
      toast.success(`Invoice emailed to ${guestEmail}`);
    } catch (e: any) {
      toast.error("Failed to email invoice: " + (e.message || "Unknown error"));
    }
    setEmailing(false);
  };

  if (loading) return <p className="text-sm text-muted-foreground py-4">Loading invoice...</p>;

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Button size="sm" variant="outline" onClick={handlePrint} className="flex-1">
          <Printer className="h-3 w-3 mr-1" />Print
        </Button>
        <Button size="sm" variant="outline" onClick={handleEmail} disabled={emailing} className="flex-1">
          <Mail className="h-3 w-3 mr-1" />{emailing ? "Sending..." : "Email to Guest"}
        </Button>
      </div>

      {/* Invoice Preview */}
      <div ref={invoiceRef} className="border border-border rounded-md p-4 bg-background text-foreground text-sm">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-lg font-bold">{propertyName || "Property"}</h2>
            <p className="text-xs text-muted-foreground">Tax Invoice</p>
          </div>
          <div className="text-right">
            <p className="font-bold">{invoiceNumber}</p>
            <p className="text-xs text-muted-foreground">Date: {today}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Bill To</p>
            <p className="font-medium">{guestName}</p>
            <p className="text-xs text-muted-foreground">{guestEmail}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Stay</p>
            <p className="text-xs">{checkIn} → {checkOut}</p>
            <p className="text-xs text-muted-foreground">{adults} guest{adults !== 1 ? "s" : ""}</p>
          </div>
        </div>

        {/* Charges */}
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="py-1.5 text-left text-[10px] uppercase tracking-wider text-muted-foreground">Description</th>
              <th className="py-1.5 text-right text-[10px] uppercase tracking-wider text-muted-foreground">Amount</th>
            </tr>
          </thead>
          <tbody>
            {charges.length > 0 ? charges.map(t => (
              <tr key={t.id} className="border-b border-border/50">
                <td className="py-1.5">{t.description}</td>
                <td className="py-1.5 text-right">R{t.amount.toLocaleString()}</td>
              </tr>
            )) : (
              <tr className="border-b border-border/50">
                <td className="py-1.5">Accommodation</td>
                <td className="py-1.5 text-right">R{totalPrice.toLocaleString()}</td>
              </tr>
            )}
            <tr className="font-semibold">
              <td className="py-1.5">Total Charges</td>
              <td className="py-1.5 text-right">R{(charges.length > 0 ? totalCharges : totalPrice).toLocaleString()}</td>
            </tr>
          </tbody>
        </table>

        {payments.length > 0 && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-3 mb-1">Payments Received</p>
            {payments.map(t => (
              <div key={t.id} className="flex justify-between text-xs py-1 border-b border-border/30">
                <span>{t.description}</span>
                <span className="text-green-600">-R{Math.abs(t.amount).toLocaleString()}</span>
              </div>
            ))}
          </>
        )}

        <div className={`mt-4 p-3 rounded-md text-center font-bold ${balance > 0 ? "bg-red-500/10 text-red-700" : "bg-green-500/10 text-green-700"}`}>
          Balance Due: R{balance.toLocaleString()}
        </div>
      </div>
    </div>
  );
}
