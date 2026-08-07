/**
 * Account Summary — NightsBridge-style account view for a booking.
 * Pro forma invoice (any time) + final tax invoice (post check-out), with totals.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { callPmsApi } from "@/hooks/usePmsApi";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { FileText, Download, RefreshCw, Mail, Receipt } from "lucide-react";
import { useCrmAccounts, useCrmScopeForProperty } from "@/hooks/useCrmAccounts";

import {
  InvoiceBillingPartySelector,
  type BillingPartyState,
} from "@/components/pms/booking/InvoiceBillingPartySelector";
import { channelSourceLabel } from "@/lib/channelVocabulary";


interface FolioTransaction {
  id: string;
  transaction_type: string | null;
  description: string | null;
  amount: number;
}

interface InvoiceDoc {
  id: string;
  invoice_number: string;
  document_kind: "pro_forma" | "tax_invoice";
  total: number;
  pdf_url: string | null;
  created_at: string;
  bill_to_type?: string | null;
  bill_to_name?: string | null;
  channel_key?: string | null;
  commission_rate?: number | null;
  commission_amount?: number | null;
  net_payable?: number | null;
}


interface AccountSummaryPanelProps {
  bookingId: string;
  propertyId: string;
  guestName: string;
  guestEmail: string;
  checkOut: string;
  totalPrice: number;
  bookingStatus?: string | null;
  paymentStatus?: string | null;
}

const PAID_STATUSES = ["paid", "completed", "success", "succeeded"];
const CHECKED_OUT = ["checked_out", "completed", "departed"];

const money = (value: number) => value.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const isAccommodationLine = (tx: FolioTransaction, bookingTotal: number) => {
  const text = `${tx.transaction_type || ""} ${tx.description || ""}`.toLowerCase();
  return (
    Math.abs(Number(tx.amount || 0) - bookingTotal) < 0.01 ||
    text.includes("accommodation") ||
    text.includes("room rate") ||
    text.includes("booking total")
  );
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Unknown error");

export function AccountSummaryPanel({
  bookingId,
  propertyId,
  guestName,
  guestEmail,
  checkOut,
  totalPrice,
  bookingStatus,
  paymentStatus,
}: AccountSummaryPanelProps) {
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState<FolioTransaction[]>([]);
  const [gatewayPaid, setGatewayPaid] = useState(0);
  const [docs, setDocs] = useState<InvoiceDoc[]>([]);
  const [invoiceTo, setInvoiceTo] = useState(guestName || "");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [bookingChannel, setBookingChannel] = useState<string | null>(null);
  const [party, setParty] = useState<BillingPartyState>({
    billToType: "guest",
    accountId: null,
    commissionRate: null,
  });

  const crmScope = useCrmScopeForProperty(propertyId);
  const { accounts } = useCrmAccounts(crmScope);

  const loadDocs = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("pms-financial", {
      body: { action: "get_booking_invoices", booking_id: bookingId },
    });
    if (!error && data?.invoices) {
      const list = data.invoices as InvoiceDoc[];
      setDocs(list);
      const latest = list[0];
      if (latest?.invoice_number) {
        setInvoiceTo(prev => prev || guestName || "");
      }
    }
  }, [bookingId, guestName]);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [folioRes, payRes, bookingRes] = await Promise.all([
        callPmsApi<{ transactions: FolioTransaction[] }>("get_folio", { booking_id: bookingId }),
        supabase.from("payment_transactions").select("amount, status").eq("booking_id", bookingId),
        supabase
          .from("bookings")
          .select("company_account_id, agent_account_id, booking_channel, commission_rate_applied")
          .eq("id", bookingId)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      if (folioRes.success && folioRes.data) setTransactions(folioRes.data.transactions || []);
      const settled = (payRes.data || []).filter(p => PAID_STATUSES.includes(String(p.status || "").toLowerCase()));
      setGatewayPaid(settled.reduce((sum, p) => sum + Number(p.amount || 0), 0));

      // Default the billing party from whatever the reservation already links to.
      const bk = bookingRes.data;
      if (bk) {
        setBookingChannel(bk.booking_channel ?? null);
        setParty({
          billToType: bk.company_account_id ? "company" : bk.agent_account_id ? "agent" : "guest",
          accountId: bk.company_account_id || bk.agent_account_id || null,
          commissionRate: bk.commission_rate_applied != null ? Number(bk.commission_rate_applied) : null,
        });
      }
      await loadDocs();
      if (!cancelled) setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [bookingId, loadDocs]);


  const totals = useMemo(() => {
    const charges = transactions.filter(t => Number(t.amount) > 0);
    const folioPayments = transactions
      .filter(t => Number(t.amount) < 0)
      .reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

    const accommodationRecorded = charges.some(t => isAccommodationLine(t, totalPrice));
    const accommodation = accommodationRecorded
      ? charges.filter(t => isAccommodationLine(t, totalPrice)).reduce((sum, t) => sum + Number(t.amount), 0)
      : totalPrice;
    const extras = charges.filter(t => !isAccommodationLine(t, totalPrice)).reduce((sum, t) => sum + Number(t.amount), 0);

    const isPaidFlag = PAID_STATUSES.includes(String(paymentStatus || "").toLowerCase());
    const online = Math.min(totalPrice, gatewayPaid > 0 ? gatewayPaid : (isPaidFlag ? totalPrice : 0));
    const mirrored = transactions.some(t =>
      Number(t.amount) < 0 && Math.abs(Math.abs(Number(t.amount)) - totalPrice) < 0.01
    );
    const payments = folioPayments + (mirrored ? 0 : online);
    const gross = accommodation + extras;
    return { accommodation, extras, payments, outstanding: Math.max(0, gross - payments) };
  }, [transactions, totalPrice, gatewayPaid, paymentStatus]);

  const proForma = docs.find(d => d.document_kind === "pro_forma") || null;
  const finalInvoice = docs.find(d => d.document_kind === "tax_invoice") || null;
  /** Latest live document — its attribution is what reconciliation reads. */
  const issued = finalInvoice || proForma;


  const today = new Date().toISOString().split("T")[0];
  const stayEnded = String(checkOut || "") <= today;
  const checkedOut = CHECKED_OUT.includes(String(bookingStatus || "").toLowerCase());
  const canIssueFinal = stayEnded || checkedOut;

  const accountStatus = finalInvoice
    ? (totals.outstanding <= 0 ? "Invoiced · Settled" : "Invoiced")
    : proForma
      ? "Pro Forma issued"
      : "Uninvoiced";

  const partyIncomplete = (party.billToType === "company" || party.billToType === "agent") && !party.accountId;

  const generate = async (kind: "pro_forma" | "tax_invoice") => {
    if (partyIncomplete) {
      toast.error("Select the profile this invoice is billed to");
      return;
    }
    setBusy(kind);
    try {
      const { data, error } = await supabase.functions.invoke("pms-financial", {
        body: {
          action: "generate_invoice",
          booking_id: bookingId,
          property_id: propertyId,
          document_kind: kind,
          invoice_to: party.billToType === "guest" ? (invoiceTo || guestName) : null,
          reference: reference || null,
          bill_to_type: party.billToType,
          bill_to_account_id: party.accountId,
          channel_key: party.billToType === "channel" ? (bookingChannel || "direct") : null,
          commission_rate: party.commissionRate,
        },

      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      await loadDocs();
      toast.success(kind === "pro_forma" ? "Pro forma invoice generated" : "Tax invoice generated");
    } catch (e) {
      toast.error(errorText(e));
    }
    setBusy(null);
  };

  const emailDoc = async (kind: "pro_forma" | "tax_invoice") => {
    setBusy(`email-${kind}`);
    try {
      const { data, error } = await supabase.functions.invoke("send-booking-email", {
        body: { booking_id: bookingId, bookingId, type: "invoice", status: "success", document_kind: kind },
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.reason || "Email provider rejected the send");
      toast.success(`Sent to ${guestEmail}`);
    } catch (e) {
      toast.error("Failed to send: " + errorText(e));
    }
    setBusy(null);
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground py-4">Loading account…</p>;
  }

  return (
    <TooltipProvider>
      <div className="border border-border rounded-md bg-card">
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <h3 className="text-sm font-semibold flex items-center gap-1.5">
            <Receipt className="h-3.5 w-3.5" />Account Summary
          </h3>
          <Badge variant={finalInvoice ? "default" : "outline"} className="text-[10px]">{accountStatus}</Badge>
        </div>

        <div className="grid gap-4 p-3 md:grid-cols-[1.4fr_1fr]">
          {/* Details */}
          <div className="space-y-3">
            <InvoiceBillingPartySelector
              value={party}
              onChange={setParty}
              accounts={accounts || []}
              bookingChannel={bookingChannel}
              guestName={guestName}
            />

            <div className="grid gap-2 sm:grid-cols-2">
              {party.billToType === "guest" && (
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Invoice To</Label>
                  <Input value={invoiceTo} onChange={e => setInvoiceTo(e.target.value)} placeholder={guestName} className="h-8 text-xs" />
                </div>
              )}
              <div className="space-y-1">
                <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Reference</Label>
                <Input value={reference} onChange={e => setReference(e.target.value)} placeholder="Enter reference here" className="h-8 text-xs" />
              </div>
            </div>


            <Separator />

            {/* Pro forma */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[120px]">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Pro Forma</p>
                <p className="text-xs font-mono">{proForma?.invoice_number || "—"}</p>
              </div>
              <Button size="sm" variant="outline" disabled={busy === "pro_forma"} onClick={() => generate("pro_forma")}>
                {proForma ? <RefreshCw className="h-3 w-3 mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                {busy === "pro_forma" ? "Generating…" : proForma ? "Regenerate" : "Generate"}
              </Button>
              {proForma?.pdf_url && (
                <Button size="sm" variant="outline" asChild>
                  <a href={proForma.pdf_url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3 w-3 mr-1" />Download
                  </a>
                </Button>
              )}
              {proForma && (
                <Button size="sm" variant="ghost" disabled={busy === "email-pro_forma"} onClick={() => emailDoc("pro_forma")}>
                  <Mail className="h-3 w-3 mr-1" />Send
                </Button>
              )}
            </div>

            {/* Final invoice */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-[120px]">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Final Invoice</p>
                <p className="text-xs font-mono">{finalInvoice?.invoice_number || "—"}</p>
              </div>
              <Tooltip>
                <TooltipTrigger asChild>
                  <span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!canIssueFinal || busy === "tax_invoice"}
                      onClick={() => generate("tax_invoice")}
                    >
                      {finalInvoice ? <RefreshCw className="h-3 w-3 mr-1" /> : <FileText className="h-3 w-3 mr-1" />}
                      {busy === "tax_invoice" ? "Generating…" : finalInvoice ? "Regenerate" : "Generate"}
                    </Button>
                  </span>
                </TooltipTrigger>
                {!canIssueFinal && (
                  <TooltipContent>Available after check-out ({checkOut})</TooltipContent>
                )}
              </Tooltip>
              {finalInvoice?.pdf_url && (
                <Button size="sm" variant="outline" asChild>
                  <a href={finalInvoice.pdf_url} target="_blank" rel="noopener noreferrer">
                    <Download className="h-3 w-3 mr-1" />Download
                  </a>
                </Button>
              )}
              {finalInvoice && (
                <Button size="sm" variant="ghost" disabled={busy === "email-tax_invoice"} onClick={() => emailDoc("tax_invoice")}>
                  <Mail className="h-3 w-3 mr-1" />Send
                </Button>
              )}
            </div>
          </div>

          {/* Totals */}
          <div className="rounded-md border border-border bg-muted/30 p-3 space-y-1.5 text-xs">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Totals</p>
            <div className="flex justify-between"><span>Accommodation</span><span className="font-mono">R {money(totals.accommodation)}</span></div>
            <div className="flex justify-between"><span>Extras</span><span className="font-mono">R {money(totals.extras)}</span></div>
            <div className="flex justify-between"><span>Payments</span><span className="font-mono text-success">R {money(totals.payments)}</span></div>
            <Separator className="my-1.5" />
            <div className="flex justify-between font-semibold">
              <span>Outstanding</span>
              <span className={`font-mono ${totals.outstanding > 0 ? "text-destructive" : "text-success"}`}>R {money(totals.outstanding)}</span>
            </div>

            {/* Attribution on the latest issued document — the recon view. */}
            {issued && (
              <>
                <Separator className="my-1.5" />
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Attribution</p>
                <div className="flex justify-between gap-2">
                  <span>Billed to</span>
                  <span className="text-right font-medium">
                    {issued.bill_to_name || (issued.bill_to_type === "channel"
                      ? channelSourceLabel(issued.channel_key)
                      : guestName)}
                  </span>
                </div>
                {issued.commission_amount != null && issued.commission_amount > 0 && (
                  <>
                    <div className="flex justify-between">
                      <span>Commission{issued.commission_rate ? ` (${issued.commission_rate}%)` : ""}</span>
                      <span className="font-mono text-destructive">R {money(Number(issued.commission_amount))}</span>
                    </div>
                    <div className="flex justify-between font-semibold">
                      <span>Net payable</span>
                      <span className="font-mono">R {money(Number(issued.net_payable ?? issued.total))}</span>
                    </div>
                  </>
                )}
              </>
            )}
          </div>

        </div>
      </div>
    </TooltipProvider>
  );
}
