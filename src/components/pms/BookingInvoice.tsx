import { useState, useRef, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { callPmsApi } from "@/hooks/usePmsApi";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { toast } from "sonner";
import { Printer, Mail } from "lucide-react";

interface BookingInvoiceProps {
  bookingId: string;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  adults: number;
  totalPrice: number;
  propertyId: string;
  paymentStatus?: string | null;
}


interface Transaction {
  id: string;
  transaction_type: string;
  description: string;
  amount: number;
  tax_amount: number | null;
  created_at: string;
}

interface VatConfig {
  isVatRegistered: boolean;
  vatRate: number;
  vatNumber: string;
}

interface EmailResponse {
  ok?: boolean;
  reason?: string;
}

const PAID_STATUSES = ["paid", "completed", "success", "succeeded"];

const isSameMoney = (left: number, right: number) => Math.abs(Number(left || 0) - Number(right || 0)) < 0.01;

const isAccommodationLine = (transaction: Transaction, bookingTotal: number) => {
  const text = `${transaction.transaction_type || ""} ${transaction.description || ""}`.toLowerCase();
  return (
    isSameMoney(transaction.amount, bookingTotal) ||
    text.includes("accommodation") ||
    text.includes("room rate") ||
    text.includes("stay charge") ||
    text.includes("booking total")
  );
};

const isMirroredOnlinePayment = (transaction: Transaction, bookingTotal: number) => {
  const text = `${transaction.transaction_type || ""} ${transaction.description || ""}`.toLowerCase();
  return (
    isSameMoney(Math.abs(transaction.amount), bookingTotal) &&
    (text.includes("online") || text.includes("gateway") || text.includes("payfast") || text.includes("booking"))
  );
};

const isRecord = (value: Json | null | undefined): value is Record<string, Json | undefined> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

const getVatNumber = (amenities: Json | null | undefined) => {
  if (!isRecord(amenities)) return "";
  const vatNumber = amenities.vat_number;
  return typeof vatNumber === "string" ? vatNumber : "";
};

const getErrorMessage = (error: unknown) => {
  if (error instanceof Error) return error.message;
  return "Unknown error";
};

export function BookingInvoice({ bookingId, guestName, guestEmail, checkIn, checkOut, adults, totalPrice, propertyId, paymentStatus }: BookingInvoiceProps) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [gatewayPaid, setGatewayPaid] = useState(0);
  const [propertyName, setPropertyName] = useState("");
  const [vatConfig, setVatConfig] = useState<VatConfig>({ isVatRegistered: false, vatRate: 15, vatNumber: "" });
  const [loading, setLoading] = useState(true);
  const [emailing, setEmailing] = useState(false);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const [folioRes, propRes, brandRes, payRes] = await Promise.all([
        callPmsApi<{ transactions: Transaction[] }>("get_folio", { booking_id: bookingId }),
        supabase.from("properties").select("name, amenities").eq("id", propertyId).single(),
        supabase.from("rolos_brand_config").select("is_vat_registered, vat_rate, vat_number").eq("property_id", propertyId).maybeSingle(),
        supabase.from("payment_transactions").select("amount, status").eq("booking_id", bookingId),
      ]);
      if (folioRes.success && folioRes.data) setTransactions(folioRes.data.transactions || []);
      if (propRes.data) setPropertyName(propRes.data.name);
      const settled = (payRes.data || []).filter(p => PAID_STATUSES.includes(String(p.status || "").toLowerCase()));
      setGatewayPaid(settled.reduce((s, p) => s + Number(p.amount || 0), 0));

      
      const amenityVatNumber = getVatNumber(propRes.data?.amenities);
      
      if (brandRes.data) {
        const brandIsVat = brandRes.data.is_vat_registered ?? false;
        const brandVatNumber = brandRes.data.vat_number || "";
        setVatConfig({
          isVatRegistered: brandIsVat || !!amenityVatNumber,
          vatRate: brandRes.data.vat_rate ?? 15,
          vatNumber: brandVatNumber || amenityVatNumber,
        });
      } else if (amenityVatNumber) {
        setVatConfig({
          isVatRegistered: true,
          vatRate: 15,
          vatNumber: amenityVatNumber,
        });
      }
      setLoading(false);
    };
    load();
  }, [bookingId, propertyId]);

  const charges = useMemo(() => transactions.filter(t => t.amount > 0), [transactions]);
  const payments = useMemo(() => transactions.filter(t => t.amount < 0), [transactions]);
  const accommodationAlreadyRecorded = useMemo(
    () => charges.some(t => isAccommodationLine(t, totalPrice)),
    [charges, totalPrice],
  );
  const accommodationLineAmount = totalPrice > 0 && !accommodationAlreadyRecorded ? totalPrice : 0;
  const folioChargesTotal = charges.reduce((s, t) => s + t.amount, 0);
  const subtotal = accommodationLineAmount + folioChargesTotal;

  const isVat = vatConfig.isVatRegistered;
  const vatRate = vatConfig.vatRate / 100;

  // Refundable deposits (e.g., damage/security deposits) are excluded from VAT
  const refundableTotal = charges
    .filter(t => t.description?.toLowerCase().includes('deposit') && t.description?.toLowerCase().includes('refundable'))
    .reduce((s, t) => s + t.amount, 0);
  const vatableAmount = isVat ? subtotal - refundableTotal : subtotal;

  // If VAT registered, the vatable amount is VAT-inclusive, so:
  // Excl = vatableAmount / (1 + rate), VAT = vatableAmount - excl
  const exclAmount = isVat ? vatableAmount / (1 + vatRate) + refundableTotal : subtotal;
  const vatAmount = isVat ? vatableAmount - (vatableAmount / (1 + vatRate)) : 0;

  const folioPayments = payments.reduce((s, t) => s + Math.abs(t.amount), 0);
  // Payments taken through the online gateway are not always mirrored onto the folio.
  // They only settle the original booking amount; later minibar/extras remain due
  // until recorded as their own folio payments.
  const isPaidFlag = PAID_STATUSES.includes(String(paymentStatus || "").toLowerCase());
  const externalBookingPaid = Math.min(totalPrice, gatewayPaid > 0 ? gatewayPaid : (isPaidFlag ? totalPrice : 0));
  const hasMirroredGatewayPayment = payments.some(t => isMirroredOnlinePayment(t, totalPrice));
  const onlineBookingPayment = hasMirroredGatewayPayment ? 0 : externalBookingPaid;
  const totalPayments = folioPayments + onlineBookingPayment;
  const balance = Math.max(0, subtotal - totalPayments);
  const settledExternally = onlineBookingPayment > 0;

  const invoiceNumber = `INV-${bookingId.slice(0, 8).toUpperCase()}`;
  const today = new Date().toLocaleDateString("en-ZA");
  const invoiceTitle = isVat ? "Tax Invoice" : "Invoice";

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
      const { data, error } = await supabase.functions.invoke("send-booking-email", {
        body: { booking_id: bookingId, bookingId: bookingId, type: "invoice", status: "success" },
      }) as { data: EmailResponse | null; error: Error | null };
      if (error) throw error;
      if (data?.ok === false) {
        throw new Error(data.reason || "Email provider rejected the send");
      }
      toast.success(`Invoice emailed to ${guestEmail}`);
    } catch (e) {
      toast.error("Failed to email invoice: " + getErrorMessage(e));
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
            <p className="text-xs text-muted-foreground">{invoiceTitle}</p>
            {isVat && vatConfig.vatNumber && (
              <p className="text-[10px] text-muted-foreground">VAT No: {vatConfig.vatNumber}</p>
            )}
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
            {accommodationLineAmount > 0 && (
              <tr className="border-b border-border/50">
                <td className="py-1.5">Accommodation</td>
                <td className="py-1.5 text-right">R{accommodationLineAmount.toLocaleString()}</td>
              </tr>
            )}
            {charges.map(t => (
              <tr key={t.id} className="border-b border-border/50">
                <td className="py-1.5">{t.description}</td>
                <td className="py-1.5 text-right">R{t.amount.toLocaleString()}</td>
              </tr>
            ))}

            {isVat ? (
              <>
                <tr className="border-b border-border/50">
                  <td className="py-1.5">Subtotal (excl. VAT)</td>
                  <td className="py-1.5 text-right">R{exclAmount.toFixed(2)}</td>
                </tr>
                <tr className="border-b border-border/50">
                  <td className="py-1.5">VAT ({vatConfig.vatRate}%)</td>
                  <td className="py-1.5 text-right">R{vatAmount.toFixed(2)}</td>
                </tr>
                <tr className="font-semibold">
                  <td className="py-1.5">Total (incl. VAT)</td>
                  <td className="py-1.5 text-right">R{subtotal.toFixed(2)}</td>
                </tr>
              </>
            ) : (
              <tr className="font-semibold">
                <td className="py-1.5">Total Charges</td>
                <td className="py-1.5 text-right">R{subtotal.toLocaleString()}</td>
              </tr>
            )}
          </tbody>
        </table>

        {(payments.length > 0 || settledExternally) && (
          <>
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mt-3 mb-1">Payments Received</p>
            {payments.map(t => (
              <div key={t.id} className="flex justify-between text-xs py-1 border-b border-border/30">
                <span>{t.description}</span>
                <span className="text-green-600">-R{Math.abs(t.amount).toLocaleString()}</span>
              </div>
            ))}
            {settledExternally && (
              <div className="flex justify-between text-xs py-1 border-b border-border/30">
                <span>Online payment received</span>
                <span className="text-green-600">-R{onlineBookingPayment.toLocaleString()}</span>
              </div>
            )}
          </>
        )}

        <div className={`mt-4 p-3 rounded-md text-center font-bold ${balance > 0 ? "bg-red-500/10 text-red-700" : "bg-green-500/10 text-green-700"}`}>
          {balance > 0 ? `Balance Due: R${balance.toLocaleString()}` : "Paid in Full — R0.00 Due"}
        </div>

      </div>
    </div>
  );
}
