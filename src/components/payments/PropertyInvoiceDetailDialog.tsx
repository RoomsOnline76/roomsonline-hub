/**
 * Invoice detail — the full document an admin reviews before issuing, emailing
 * or settling it, with the same section breakdown the property will receive.
 */
import { useEffect, useState } from "react";
import { Download, Loader2, Mail, Plus, Send, Wallet, XCircle } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { usePropertyInvoiceDetail } from "@/hooks/usePropertyInvoices";
import {
  INVOICE_STATUS_LABELS,
  LINE_KIND_LABELS,
  balanceDue,
  fmtMoney,
  invoiceBalances,
  isOverdue,
  linesOfKind,
  periodLabel,
  type PropertyInvoiceLineKind,
} from "@/lib/propertyInvoice";
import { downloadPropertyInvoicePdf } from "@/lib/propertyInvoicePdf";

const SECTIONS: PropertyInvoiceLineKind[] = ["commission", "recurring", "charge", "adjustment"];

interface Props {
  invoiceId: string | null;
  busy: boolean;
  onClose: () => void;
  onIssue: (id: string) => Promise<void>;
  onSend: (id: string, email?: string) => Promise<void>;
  onMarkPaid: (id: string, paymentReference?: string) => Promise<void>;
  onVoid: (id: string, reason?: string) => Promise<void>;
  onAdjust: (id: string, description: string, amount: number) => Promise<void>;
}

export function PropertyInvoiceDetailDialog({
  invoiceId, busy, onClose, onIssue, onSend, onMarkPaid, onVoid, onAdjust,
}: Props) {
  const { detail, loading, refresh } = usePropertyInvoiceDetail(invoiceId);
  const [bankRef, setBankRef] = useState("");
  const [adjDescription, setAdjDescription] = useState("");
  const [adjAmount, setAdjAmount] = useState("");

  useEffect(() => {
    setBankRef("");
    setAdjDescription("");
    setAdjAmount("");
  }, [invoiceId]);

  const payUrl = detail?.pay_token
    ? `${window.location.origin}/billing/pay/${detail.pay_token}`
    : undefined;

  const act = async (fn: () => Promise<void>) => {
    await fn();
    await refresh();
  };

  return (
    <Dialog open={!!invoiceId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        {loading || !detail ? (
          <div className="space-y-3 py-6">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10 w-full" />)}</div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 flex-wrap">
                {detail.group_name}
                <Badge variant={detail.status === "paid" ? "default" : isOverdue(detail) ? "destructive" : "secondary"}>
                  {isOverdue(detail) ? "Overdue" : INVOICE_STATUS_LABELS[detail.status]}
                </Badge>
                {detail.invoice_reference && (
                  <span className="font-mono text-xs text-muted-foreground">{detail.invoice_reference}</span>
                )}
              </DialogTitle>
              <DialogDescription>
                {periodLabel(detail.period_start, detail.period_end)}
                {detail.due_date ? ` · due ${detail.due_date}` : ""}
                {detail.bill_to_email ? ` · ${detail.bill_to_email}` : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5">
              {SECTIONS.map((kind) => {
                const lines = linesOfKind(detail.lines, kind);
                if (lines.length === 0) return null;
                const total = lines.reduce((s, l) => s + l.amount, 0);
                return (
                  <div key={kind} className="rounded-md border">
                    <div className="flex items-center justify-between px-3 py-2 bg-muted/40">
                      <span className="text-sm font-medium">{LINE_KIND_LABELS[kind]}</span>
                      <span className="text-sm font-semibold">{fmtMoney(total, detail.currency)}</span>
                    </div>
                    <div className="divide-y">
                      {lines.map((l) => (
                        <div key={l.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                          <div className="min-w-0">
                            <div className="truncate">{l.description || "—"}</div>
                            <div className="text-xs text-muted-foreground">
                              {[
                                l.rol_reference,
                                l.gross_amount > 0 ? `${fmtMoney(l.gross_amount, detail.currency)} @ ${l.rate}%` : null,
                                l.quantity > 1 ? `${l.quantity} units` : null,
                                l.settlement_route === "reservation" ? "Reservation only" : l.settlement_route === "byo" ? "Own gateway" : null,
                                l.line_date,
                              ]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          </div>
                          <div className="shrink-0 tabular-nums">{fmtMoney(l.amount, detail.currency)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              <div className="rounded-md border px-3 py-3 space-y-1.5 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Subtotal</span><span>{fmtMoney(detail.subtotal, detail.currency)}</span></div>
                {detail.vat_amount > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">VAT @ {detail.vat_rate}%</span><span>{fmtMoney(detail.vat_amount, detail.currency)}</span></div>
                )}
                <Separator />
                <div className="flex justify-between font-semibold"><span>Total</span><span>{fmtMoney(detail.total, detail.currency)}</span></div>
                {detail.status !== "paid" && (
                  <div className="flex justify-between"><span className="text-muted-foreground">Balance due</span><span>{fmtMoney(balanceDue(detail), detail.currency)}</span></div>
                )}
                {!invoiceBalances(detail) && (
                  <p className="text-xs text-destructive">
                    Totals do not reconcile with the lines — refresh the drafts before issuing.
                  </p>
                )}
              </div>

              {detail.status === "draft" && (
                <div className="rounded-md border p-3 space-y-2">
                  <Label className="text-xs">Add an adjustment (credit or debit)</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="Description, e.g. goodwill credit"
                      value={adjDescription}
                      onChange={(e) => setAdjDescription(e.target.value)}
                      className="h-9"
                    />
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Amount"
                      value={adjAmount}
                      onChange={(e) => setAdjAmount(e.target.value)}
                      className="h-9 sm:w-[140px]"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !adjDescription.trim() || !Number(adjAmount)}
                      onClick={() => act(() => onAdjust(detail.id, adjDescription.trim(), Number(adjAmount)))}
                    >
                      <Plus className="h-4 w-4 mr-1" />Add
                    </Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Use a negative amount for a credit. Adjustments lock once the invoice is issued.
                  </p>
                </div>
              )}

              {detail.status === "issued" && (
                <div className="rounded-md border p-3 space-y-2">
                  <Label className="text-xs">Bank / payment reference (if settled off-platform)</Label>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Input
                      placeholder="EFT reference"
                      value={bankRef}
                      onChange={(e) => setBankRef(e.target.value)}
                      className="h-9"
                    />
                    <Button size="sm" disabled={busy} onClick={() => act(() => onMarkPaid(detail.id, bankRef || undefined))}>
                      <Wallet className="h-4 w-4 mr-1" />Mark paid
                    </Button>
                  </div>
                  {payUrl && (
                    <p className="text-[11px] text-muted-foreground break-all">
                      Pay link: <span className="font-mono">{payUrl}</span>
                    </p>
                  )}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                <Button variant="outline" size="sm" onClick={() => downloadPropertyInvoicePdf(detail, payUrl)}>
                  <Download className="h-4 w-4 mr-1.5" />Download PDF
                </Button>
                {detail.status === "draft" && (
                  <Button size="sm" disabled={busy} onClick={() => act(() => onIssue(detail.id))}>
                    {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Send className="h-4 w-4 mr-1.5" />}
                    Issue invoice
                  </Button>
                )}
                {detail.status !== "draft" && (
                  <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => onSend(detail.id))}>
                    <Mail className="h-4 w-4 mr-1.5" />
                    {detail.emailed_at ? "Resend email" : "Email invoice"}
                  </Button>
                )}
                {detail.status !== "paid" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive"
                    disabled={busy}
                    onClick={() => act(() => onVoid(detail.id, "Voided by admin"))}
                  >
                    <XCircle className="h-4 w-4 mr-1.5" />Void
                  </Button>
                )}
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
