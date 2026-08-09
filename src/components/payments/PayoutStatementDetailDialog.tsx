/**
 * Statement detail — the A/B/C ledger for one payout statement (bookings, ROL
 * charges invoice, net payable), with PDF downloads for statement and invoice.
 */

import { useState } from "react";
import { Download, FileText, Loader2, CheckCircle2, Ban, Lock } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { usePayoutStatementDetail } from "@/hooks/usePayoutStatements";
import {
  bookingLines,
  fmtMoney,
  periodLabel,
  propertySubtotals,
  statementBalances,
  STATUS_LABELS,
  type VatSettings,
} from "@/lib/payoutStatement";

import { downloadPayoutStatementPdf } from "@/lib/payoutStatementPdf";
import { downloadRolChargesInvoicePdf } from "@/lib/rolChargesInvoicePdf";

interface Props {
  statementId: string | null;
  vat: VatSettings;
  busy?: boolean;
  onClose: () => void;
  onFinalise: (id: string) => Promise<void> | void;
  onMarkPaid: (id: string, bankReference?: string) => Promise<void> | void;
  onVoid: (id: string, reason?: string) => Promise<void> | void;
}

const fmtDay = (value?: string | null) =>
  value ? format(new Date(value), "d MMM yyyy") : "—";

export function PayoutStatementDetailDialog({
  statementId,
  vat,
  busy,
  onClose,
  onFinalise,
  onMarkPaid,
  onVoid,
}: Props) {
  const { detail, loading, refresh } = usePayoutStatementDetail(statementId);
  const [bankRef, setBankRef] = useState("");

  const money = (n: number) => fmtMoney(n, detail?.currency || "ZAR");

  const act = async (fn: () => Promise<void> | void) => {
    await fn();
    await refresh();
  };

  return (
    <Dialog open={!!statementId} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        {loading || !detail ? (
          <div className="space-y-3 py-6">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <DialogTitle className="flex items-center gap-2">
                    {detail.group_name}
                    <Badge variant={detail.status === "paid" ? "default" : detail.status === "draft" ? "outline" : "secondary"}>
                      {STATUS_LABELS[detail.status]}
                    </Badge>
                    {detail.status !== "draft" && <Lock className="h-3.5 w-3.5 text-muted-foreground" />}
                  </DialogTitle>
                  <DialogDescription>
                    {periodLabel(detail.period_start, detail.period_end)}
                    {detail.statement_reference && <> · {detail.statement_reference}</>}
                    {detail.group_kind === "portfolio" && (
                      <> · portfolio, {detail.payout_mode === "split" ? "paid per property" : "consolidated payment"}</>
                    )}
                  </DialogDescription>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => downloadPayoutStatementPdf(detail, vat)}>
                    <Download className="h-4 w-4 mr-1.5" />Statement PDF
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => downloadRolChargesInvoicePdf(detail, vat)}>
                    <FileText className="h-4 w-4 mr-1.5" />Invoice PDF
                  </Button>
                </div>
              </div>
            </DialogHeader>

            {!statementBalances(detail) && (
              <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
                This statement does not balance — net payable does not equal amount held less the invoice total.
              </div>
            )}

            {/* Section A */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold tracking-wide">A · BOOKINGS IN THIS PERIOD</h3>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Guest</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Stay</TableHead>
                      <TableHead className="text-right">Gross</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Fees</TableHead>
                      <TableHead className="text-right">Net held</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bookingLines(detail.lines).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="font-mono text-xs">{l.rol_reference || "—"}</TableCell>
                        <TableCell className="text-sm">{l.guest_name || "—"}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{l.property_name || "—"}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {fmtDay(l.check_in_date)} – {fmtDay(l.check_out_date)}
                        </TableCell>
                        <TableCell className="text-right text-sm">{money(l.gross_amount)}</TableCell>
                        <TableCell className="text-right text-sm">
                          {money(l.commission_amount)}
                          <span className="ml-1 text-xs text-muted-foreground">{l.commission_rate.toFixed(1)}%</span>
                        </TableCell>
                        <TableCell className="text-right text-sm">{money(l.fee_amount)}</TableCell>
                        <TableCell className="text-right text-sm font-medium">{money(l.net_amount)}</TableCell>
                      </TableRow>
                    ))}
                    {bookingLines(detail.lines).length === 0 && (
                      <TableRow>
                        <TableCell colSpan={8} className="text-center text-sm text-muted-foreground py-6">
                          No bookings settled in this period.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>

              {detail.group_kind === "portfolio" && propertySubtotals(bookingLines(detail.lines)).length > 1 && (
                <div className="grid gap-2 sm:grid-cols-2">
                  {propertySubtotals(bookingLines(detail.lines)).map((s) => (
                    <div key={s.property_id ?? s.property_name} className="rounded-md border px-3 py-2 text-sm">
                      <div className="font-medium">{s.property_name}</div>
                      <div className="text-xs text-muted-foreground">
                        {s.bookings} booking{s.bookings === 1 ? "" : "s"} · gross {money(s.gross)} · net {money(s.net)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Section B + C */}
            <section className="grid gap-4 md:grid-cols-2">
              <div className="rounded-md border p-4 space-y-1.5">
                <h3 className="text-sm font-semibold tracking-wide mb-2">
                  B · ROL CHARGES INVOICE
                  {detail.invoice_reference && (
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{detail.invoice_reference}</span>
                  )}
                </h3>
                {[
                  ["Commission on bookings processed by ROL", detail.rol_commission],
                  ["Payment processing fee recovered (non-commissionable)", detail.transaction_fees],
                ].map(([label, value]) => (
                  <div key={String(label)} className="flex justify-between gap-4 text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="whitespace-nowrap">{money(Number(value))}</span>
                  </div>
                ))}
                {detail.invoice_vat > 0 && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Subtotal excl. VAT</span>
                      <span>{money(detail.invoice_subtotal)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">VAT @ {detail.vat_rate}%</span>
                      <span>{money(detail.invoice_vat)}</span>
                    </div>
                  </>
                )}
                <Separator className="my-2" />
                <div className="flex justify-between text-sm font-semibold">
                  <span>Invoice total</span>
                  <span>{money(detail.invoice_total)}</span>
                </div>
                <p className="text-xs text-muted-foreground pt-1">
                  Settled by deduction from the payout — issued as paid in full. Subscriptions, platform
                  charges and commission on own-gateway bookings are invoiced separately.
                </p>
              </div>
              <div className="rounded-md border p-4 space-y-2">
                <h3 className="text-sm font-semibold tracking-wide mb-2">C · NET PAYABLE</h3>

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Gross received by ROL</span>
                  <span>{money(grossReceivedByRol(detail))}</span>
                </div>

                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Less invoice total</span>
                  <span>-{money(detail.invoice_total)}</span>
                </div>
                <Separator className="my-2" />
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">Net payable</span>
                  <span className="text-2xl font-bold text-primary">{money(detail.net_payable)}</span>
                </div>
                {detail.carry_forward > 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    {money(detail.carry_forward)} could not be recovered and carries forward.
                  </p>
                )}
                <div className="pt-1 space-y-1">
                  {detail.payments.map((p) => (
                    <div key={p.id} className="rounded bg-muted/50 px-2.5 py-2 text-xs">
                      <div className="font-medium">{p.beneficiary_name || detail.group_name}</div>
                      <div className="text-muted-foreground">
                        {p.bank_name || "Bank on file"} · {p.account_number_masked || "account on file"}
                      </div>
                      <div className="font-mono mt-0.5">{p.payment_reference}</div>
                      <div className="mt-0.5">{money(p.amount)}</div>
                    </div>
                  ))}
                  {detail.payments.length === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Bank payment references are issued when the statement is finalised.
                    </p>
                  )}
                </div>
              </div>
            </section>

            {/* Actions */}
            <div className="flex flex-wrap items-end justify-between gap-3 border-t pt-4">
              <div className="text-xs text-muted-foreground">
                {detail.finalised_at && <>Finalised {fmtDay(detail.finalised_at)}. </>}
                {detail.paid_at && <>Paid {fmtDay(detail.paid_at)}. </>}
                {detail.status === "draft"
                  ? "Draft — regenerating will refresh these figures."
                  : "Locked snapshot — later booking changes appear on the next statement."}
              </div>
              <div className="flex flex-wrap items-end gap-2">
                {detail.status === "finalised" && (
                  <div className="space-y-1">
                    <Label htmlFor="bank-ref" className="text-xs">Bank reference (optional)</Label>
                    <Input
                      id="bank-ref"
                      value={bankRef}
                      onChange={(e) => setBankRef(e.target.value)}
                      placeholder={detail.payment_reference || "As per bank"}
                      className="h-9 w-52"
                    />
                  </div>
                )}
                {detail.status === "draft" && (
                  <>
                    <Button variant="outline" size="sm" disabled={busy} onClick={() => act(() => onVoid(detail.id, "Discarded from review"))}>
                      <Ban className="h-4 w-4 mr-1.5" />Discard
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => act(() => onFinalise(detail.id))}>
                      {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Lock className="h-4 w-4 mr-1.5" />}
                      Finalise &amp; issue
                    </Button>
                  </>
                )}
                {detail.status === "finalised" && (
                  <Button size="sm" disabled={busy} onClick={() => act(() => onMarkPaid(detail.id, bankRef.trim() || undefined))}>
                    {busy ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1.5" />}
                    Mark paid
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
