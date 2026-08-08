/**
 * Property invoice run — pick a month, build drafts, then issue, email and
 * settle each ROL receivable.
 */
import { useMemo, useState } from "react";
import { FileText, Loader2, PlayCircle, ReceiptText, RefreshCw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { usePropertyInvoices, type InvoicePeriodRange } from "@/hooks/usePropertyInvoices";
import {
  INVOICE_STATUS_LABELS,
  balanceDue,
  fmtMoney,
  isOverdue,
  periodLabel,
} from "@/lib/propertyInvoice";
import { PropertyInvoiceDetailDialog } from "./PropertyInvoiceDetailDialog";

function monthOptions(count = 12): { value: string; label: string; range: InvoicePeriodRange }[] {
  const now = new Date();
  return Array.from({ length: count }, (_, i) => {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 0));
    return {
      value: start.toISOString().slice(0, 7),
      label: format(start, "MMMM yyyy"),
      range: { start: start.toISOString().slice(0, 10), end: end.toISOString().slice(0, 10) },
    };
  });
}

export function PropertyInvoiceRun() {
  const months = useMemo(() => monthOptions(), []);
  const [month, setMonth] = useState(months[0].value);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const period = useMemo(
    () => months.find((m) => m.value === month)?.range ?? months[0].range,
    [months, month],
  );

  const {
    invoices, loading, running, lastUpdated, totals,
    refresh, generate, issueInvoice, sendInvoice, markPaid, voidInvoice, addAdjustment,
  } = usePropertyInvoices(period);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return invoices;
    return invoices.filter((i) =>
      [i.group_name, i.invoice_reference, i.bill_to_email, i.payment_reference]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [invoices, search]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ReceiptText className="h-5 w-5" />ROL Invoices to Properties
              </CardTitle>
              <CardDescription>
                Commission on bookings ROL never settled, plus platform fees · {periodLabel(period.start, period.end)}
                {lastUpdated && (
                  <span className="block text-xs mt-0.5">As at {format(lastUpdated, "d MMM yyyy HH:mm")}</span>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={month} onValueChange={setMonth}>
                <SelectTrigger className="w-[170px] h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {months.map((m) => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Search account or reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-[220px]"
              />
              <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <Button size="sm" onClick={() => generate()} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1.5" />}
                {invoices.length ? "Refresh drafts" : "Run invoices"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Invoiced this period", value: fmtMoney(totals.total), hint: `${totals.count} invoice${totals.count === 1 ? "" : "s"}` },
              { label: "Outstanding", value: fmtMoney(totals.outstanding), hint: `${totals.issued} issued · ${totals.overdue} overdue` },
              { label: "Commission billed", value: fmtMoney(totals.commission), hint: "Own gateway & reservation-only" },
              { label: "Platform fees", value: fmtMoney(totals.recurring), hint: "Subscription, channels, add-ons" },
            ].map((s) => (
              <div key={s.label} className="rounded-md border px-3 py-2.5">
                <div className="text-xs text-muted-foreground">{s.label}</div>
                <div className="text-lg font-semibold">{s.value}</div>
                <div className="text-[11px] text-muted-foreground">{s.hint}</div>
              </div>
            ))}
          </div>

          {loading ? (
            <div className="space-y-3">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-12">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
              <p className="text-muted-foreground">
                {invoices.length === 0
                  ? "No invoices for this period yet — run the invoices to build drafts."
                  : "No invoices match your search."}
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Billing account</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="text-right">Platform fees</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((i) => (
                    <TableRow key={i.id} className="cursor-pointer" onClick={() => setOpenId(i.id)}>
                      <TableCell>
                        <div className="font-medium">{i.group_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {i.group_kind === "portfolio" ? "Portfolio" : "Property"}
                          {i.bill_to_email ? ` · ${i.bill_to_email}` : ""}
                          {i.booking_count ? ` · ${i.booking_count} booking${i.booking_count === 1 ? "" : "s"}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{i.invoice_reference || "—"}</TableCell>
                      <TableCell className="text-right text-sm">{fmtMoney(i.commission_total, i.currency)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {fmtMoney(i.recurring_total + i.charge_total, i.currency)}
                      </TableCell>
                      <TableCell className="text-right text-sm font-semibold">{fmtMoney(i.total, i.currency)}</TableCell>
                      <TableCell className="text-right text-sm">
                        {i.status === "paid" ? "—" : fmtMoney(balanceDue(i), i.currency)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            i.status === "paid" ? "default" : isOverdue(i) ? "destructive" : i.status === "draft" ? "outline" : "secondary"
                          }
                        >
                          {isOverdue(i) ? "Overdue" : INVOICE_STATUS_LABELS[i.status]}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Anything already recovered on a payout statement is never invoiced here — each booking, charge and fee is
            claimed once, either by deduction or by invoice.
          </p>
        </CardContent>
      </Card>

      <PropertyInvoiceDetailDialog
        invoiceId={openId}
        busy={running}
        onClose={() => setOpenId(null)}
        onIssue={issueInvoice}
        onSend={sendInvoice}
        onMarkPaid={markPaid}
        onVoid={voidInvoice}
        onAdjust={addAdjustment}
      />
    </div>
  );
}
