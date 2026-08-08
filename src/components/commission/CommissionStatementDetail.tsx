/**
 * One referral partner's commission payout statement, opened from the list.
 *
 * This is a commission payout, not a payslip — the partner is an independent
 * contractor and carries their own SARS obligations.
 *
 * Read top to bottom: what each referred property earned ROL, the rate applied
 * and where that rate came from, then adjustments, then what gets paid.
 */

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertTriangle, Banknote, CheckCircle2, Download, Loader2, Mail, Plus, Ban } from "lucide-react";
import {
  COMMISSION_BASIS_NOTE,
  COMMISSION_PAYOUT_TAX_NOTE,
  COMMISSION_STATUS_CLASSES,
  COMMISSION_STATUS_LABELS,
  COMMISSION_TYPE_LABELS,
  COMMISSION_VAT_NOTE,
  RATE_SOURCE_LABELS,
  commissionAdjustments,
  commissionVatBreakdown,
  fmtMoney,
  isEditable,
  monthLabel,
  periodLabel,
  propertyBlocks,
  statementBalances,
  type CommissionStatement,
} from "@/lib/commissionStatement";

import { downloadCommissionStatementPdf } from "@/lib/commissionStatementPdf";
import type { VatSettings } from "@/lib/payoutStatement";
import {
  addCommissionAdjustment,
  emailCommissionStatement,
  useCommissionStatementDetail,
} from "@/hooks/useCommissionStatements";

interface Props {
  statement: CommissionStatement | null;
  vat: VatSettings;
  busy: string | null;
  onClose: () => void;
  onApprove: (id: string) => Promise<unknown>;
  onMarkPaid: (id: string, reference?: string) => Promise<unknown>;
  onVoid: (id: string, reason: string) => Promise<unknown>;
}

const fmtDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString("en-ZA", { day: "2-digit", month: "short", year: "numeric" })
    : "—";

export function CommissionStatementDetailDialog({
  statement,
  vat,
  busy,
  onClose,
  onApprove,
  onMarkPaid,
  onVoid,
}: Props) {
  const { detail, loading, reload } = useCommissionStatementDetail(statement);
  const [adjustDescription, setAdjustDescription] = useState("");
  const [adjustAmount, setAdjustAmount] = useState("");
  const [adjustKind, setAdjustKind] = useState<"adjustment" | "clawback">("adjustment");
  const [emailing, setEmailing] = useState(false);

  const blocks = detail ? propertyBlocks(detail.lines) : [];
  const adjustments = detail ? commissionAdjustments(detail.lines) : [];
  const balanced = detail ? statementBalances(detail) : true;
  const editable = statement ? isEditable(statement.status) : false;
  const bank = statement?.bank_snapshot || {};
  const terms = statement?.terms_snapshot || {};
  const tax = statement?.tax_snapshot || {};
  const vatBreak = statement ? commissionVatBreakdown(statement, vat.vat_rate) : null;


  const captureAdjustment = async () => {
    if (!statement) return;
    const amount = Number(adjustAmount);
    if (!adjustDescription.trim() || !Number.isFinite(amount) || amount === 0) return;
    const signed = adjustKind === "clawback" ? -Math.abs(amount) : amount;
    if (await addCommissionAdjustment({ statement, description: adjustDescription.trim(), amount: signed, kind: adjustKind })) {
      setAdjustDescription("");
      setAdjustAmount("");
      await reload();
    }
  };

  const sendEmail = async () => {
    if (!statement) return;
    setEmailing(true);
    await emailCommissionStatement(statement.id);
    setEmailing(false);
  };

  return (
    <Dialog open={!!statement} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-5xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 text-base">
            {statement?.rep_name || "Commission statement"}
            {statement && (
              <Badge className={COMMISSION_STATUS_CLASSES[statement.status]}>
                {COMMISSION_STATUS_LABELS[statement.status]}
              </Badge>
            )}
            {statement?.statement_reference && (
              <span className="font-mono text-xs text-muted-foreground">{statement.statement_reference}</span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!statement ? null : loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <div className="space-y-5">
            {/* Header facts */}
            <div className="grid gap-3 sm:grid-cols-4">
              <Fact label="Period" value={monthLabel(statement.period_month)} sub={periodLabel(statement.period_start, statement.period_end)} />
              <Fact label="Tier" value={String(terms.tier_label || statement.rep_tier || "Base")} sub={`First year ${terms.first_year_rate ?? "—"}% · residual ${terms.residual_rate ?? "—"}%`} />
              <Fact label="ROL revenue" value={fmtMoney(statement.total_revenue)} sub={`${statement.property_count} propert${statement.property_count === 1 ? "y" : "ies"}`} />
              <Fact
                label="Net commission payout"
                value={fmtMoney(vatBreak?.total ?? statement.net_payable)}
                sub={statement.paid_at ? `Paid ${fmtDate(statement.paid_at)}` : "Awaiting payment"}
                strong
              />

            </div>

            {!balanced && (
              <div className="flex items-center gap-2 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                Statement total does not match its line items — regenerate before approving.
              </div>
            )}

            {/* A — commission per property */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Commission per referred property</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Property</TableHead>
                    <TableHead className="text-xs">Referred</TableHead>
                    <TableHead className="text-xs">Revenue components</TableHead>
                    <TableHead className="text-xs text-right">ROL revenue</TableHead>
                    <TableHead className="text-xs text-right">Rate</TableHead>
                    <TableHead className="text-xs text-right">Commission</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {blocks.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-6 text-center text-xs text-muted-foreground">
                        No commission lines on this statement.
                      </TableCell>
                    </TableRow>
                  ) : blocks.map((b) => (
                    <TableRow key={`${b.property_id}`}>
                      <TableCell className="text-xs font-medium">{b.property_name}</TableCell>
                      <TableCell className="text-xs">{fmtDate(b.since)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        <div className="space-y-0.5">
                          {b.breakdown.booking_commission ? (
                            <p>Booking commission ({b.breakdown.booking_count ?? 0}) {fmtMoney(b.breakdown.booking_commission)}</p>
                          ) : null}
                          {b.breakdown.recovered_commission ? (
                            <p>Recovered commission {fmtMoney(b.breakdown.recovered_commission)}</p>
                          ) : null}
                          {b.breakdown.subscription_revenue ? (
                            <p>Platform revenue {fmtMoney(b.breakdown.subscription_revenue)}</p>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">{fmtMoney(b.revenue)}</TableCell>
                      <TableCell className="text-right text-xs">
                        {b.rate_applied}%
                        <span className="block text-[10px] text-muted-foreground">
                          {COMMISSION_TYPE_LABELS[b.commission_type] || b.commission_type}
                          {b.rate_source ? ` · ${RATE_SOURCE_LABELS[b.rate_source] || b.rate_source}` : ""}
                        </span>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs font-semibold">{fmtMoney(b.commission)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </section>

            {/* B — adjustments */}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Adjustments and clawbacks</h3>
              {adjustments.length === 0 ? (
                <p className="text-xs text-muted-foreground">None on this statement.</p>
              ) : (
                <Table>
                  <TableBody>
                    {adjustments.map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="text-xs">
                          {l.description || l.clawback_reason || "Adjustment"}
                          {l.line_kind === "clawback" && <Badge variant="destructive" className="ml-2 text-[10px]">Clawback</Badge>}
                        </TableCell>
                        <TableCell className="text-right font-mono text-xs">{fmtMoney(l.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}

              {editable && (
                <div className="flex flex-wrap items-end gap-2 rounded-md border bg-muted/30 p-3">
                  <div className="min-w-[220px] flex-1 space-y-1">
                    <Label className="text-xs">Description</Label>
                    <Input value={adjustDescription} onChange={(e) => setAdjustDescription(e.target.value)} placeholder="Reason for the adjustment" />
                  </div>
                  <div className="w-[130px] space-y-1">
                    <Label className="text-xs">Amount</Label>
                    <Input type="number" step="0.01" value={adjustAmount} onChange={(e) => setAdjustAmount(e.target.value)} placeholder="0.00" />
                  </div>
                  <div className="w-[150px] space-y-1">
                    <Label className="text-xs">Type</Label>
                    <Select value={adjustKind} onValueChange={(v) => setAdjustKind(v as "adjustment" | "clawback")}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="adjustment">Adjustment</SelectItem>
                        <SelectItem value="clawback">Clawback</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={captureAdjustment}>
                    <Plus className="mr-1.5 h-3.5 w-3.5" /> Add
                  </Button>
                </div>
              )}
            </section>

            <Separator />

            {/* C — settlement */}
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1 text-xs">
                <h3 className="text-sm font-semibold">Payment</h3>
                <p className="text-muted-foreground">
                  {bank.account_holder || "No banking captured"}
                  {bank.bank_name ? ` · ${bank.bank_name}` : ""}
                </p>
                <p className="text-muted-foreground">
                  {bank.account_number_masked || "—"}
                  {bank.branch_code ? ` · branch ${bank.branch_code}` : ""}
                </p>
                {bank.is_verified ? (
                  <Badge variant="outline" className="text-[10px] text-emerald-600">Verified</Badge>
                ) : (
                  <Badge variant="secondary" className="text-[10px]">Unverified</Badge>
                )}
                <p className="pt-2 text-muted-foreground">Reference: <span className="font-mono">{statement.paid_reference || statement.statement_reference || "—"}</span></p>
              </div>
              <div className="space-y-1 rounded-lg border p-3 text-xs">
                <Row label="Gross commission" value={fmtMoney(statement.gross_commission)} />
                <Row label="Adjustments" value={fmtMoney(statement.adjustments_total)} />
                <Separator className="my-1" />
                <Row label="Net payable" value={fmtMoney(statement.net_payable)} strong />
                <p className="pt-2 text-[11px] text-muted-foreground">{COMMISSION_BASIS_NOTE}</p>
              </div>
            </section>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => detail && downloadCommissionStatementPdf(detail, vat)}
                disabled={!detail}
              >
                <Download className="mr-1.5 h-3.5 w-3.5" /> Download PDF
              </Button>
              <Button variant="outline" onClick={sendEmail} disabled={emailing || !statement.rep_email}>
                {emailing ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <Mail className="mr-1.5 h-3.5 w-3.5" />}
                {statement.emailed_at ? "Resend to partner" : "Email to partner"}
              </Button>
              {editable && (
                <Button onClick={() => onApprove(statement.id)} disabled={busy === statement.id || !balanced}>
                  {busy === statement.id ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />}
                  Approve and lock
                </Button>
              )}
              {statement.status === "approved" && (
                <Button onClick={() => onMarkPaid(statement.id)} disabled={busy === statement.id}>
                  <Banknote className="mr-1.5 h-3.5 w-3.5" /> Mark paid
                </Button>
              )}
              {statement.status !== "paid" && statement.status !== "void" && (
                <Button variant="ghost" className="text-destructive" onClick={() => onVoid(statement.id, "Voided by admin")}>
                  <Ban className="mr-1.5 h-3.5 w-3.5" /> Void
                </Button>
              )}
            </div>
            {statement.emailed_at && (
              <p className="text-[11px] text-muted-foreground">
                Last emailed {fmtDate(statement.emailed_at)} to {statement.emailed_to}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Fact({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={strong ? "text-base font-bold" : "text-sm font-semibold"}>{value}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className={strong ? "font-semibold" : "text-muted-foreground"}>{label}</span>
      <span className={strong ? "font-mono font-bold" : "font-mono"}>{value}</span>
    </div>
  );
}
