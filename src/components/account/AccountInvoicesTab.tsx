import { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download, ExternalLink, FileText, Loader2 } from "lucide-react";
import { ADMIN_DOMAIN } from "@/lib/config";
import { toast } from "sonner";
import { downloadSubscriptionInvoice } from "@/lib/invoiceDownload";
import {
  downloadCsv,
  fmtMoney,
  rolInvoiceDue,
  subscriptionInvoiceDueDate,
  toCsv,
  type OwnerRolInvoice,
  type OwnerSubscriptionInvoice,
} from "@/lib/ownerAccount";


interface Props {
  subscriptionInvoices: OwnerSubscriptionInvoice[];
  rolInvoices: OwnerRolInvoice[];
  currency: string;
}

type StatusFilter = "all" | "due" | "paid";

const statusBadge = (status: string) => {
  if (status === "paid") return "bg-green-500/10 text-success border-green-500/40";
  if (status === "past_due" || status === "failed") return "bg-destructive/10 text-destructive border-destructive/40";
  if (status === "cancelled" || status === "void") return "bg-muted text-muted-foreground border-border";
  return "bg-amber-500/10 text-warning border-amber-500/40";
};

const label = (status: string, overdue: boolean) =>
  status === "paid"
    ? "Paid"
    : overdue
      ? "Overdue"
      : status === "void"
        ? "Void"
        : ["cancelled", "canceled"].includes(status)
          ? "Cancelled"
          : "Due";

export function AccountInvoicesTab({ subscriptionInvoices, rolInvoices, currency }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const today = new Date().toISOString().slice(0, 10);

  const isSetup = (inv: OwnerSubscriptionInvoice) =>
    inv.invoice_kind === "once_off" ||
    (Number(inv.once_off_amount || 0) > 0 && !Number(inv.subscription_amount || 0));

  const matches = (status: string) =>
    statusFilter === "all" ||
    (statusFilter === "paid"
      ? status === "paid"
      : !["paid", "void", "cancelled", "canceled"].includes(status));

  const monthly = useMemo(
    () => subscriptionInvoices.filter((i) => !isSetup(i) && matches(i.status)),
    [subscriptionInvoices, statusFilter],
  );
  const setup = useMemo(
    () => subscriptionInvoices.filter((i) => isSetup(i) && matches(i.status)),
    [subscriptionInvoices, statusFilter],
  );
  const commission = useMemo(() => rolInvoices.filter((i) => matches(i.status)), [rolInvoices, statusFilter]);

  const exportCsv = () => {
    const rows = [
      ...subscriptionInvoices.map((i) => ({
        document: isSetup(i) ? "Setup / once-off" : "Subscription",
        reference: i.invoice_number || i.id,
        period: [i.period_start, i.period_end].filter(Boolean).join(" to "),
        amount: Number(i.amount || 0),
        currency: i.currency,
        status: i.status,
        paid_on: i.paid_at || "",
      })),
      ...rolInvoices.map((i) => ({
        document: "Commission invoice",
        reference: i.invoice_reference || i.id,
        period: `${i.period_start} to ${i.period_end}`,
        amount: Number(i.total || 0),
        currency: i.currency,
        status: i.status,
        paid_on: i.paid_at || "",
      })),
    ];
    downloadCsv(`rol-invoices-${today}.csv`, toCsv(rows));
  };

  const subRows = (rows: OwnerSubscriptionInvoice[]) =>
    rows.map((inv) => {
      const inactive = ["paid", "void", "cancelled", "canceled"].includes(inv.status);
      const overdue = !inactive && subscriptionInvoiceDueDate(inv) < today;
      // GLOBAL RULE: payment links always use the production domain.
      const payUrl = !inactive && inv.payfast_token
        ? `${ADMIN_DOMAIN}/subscribe/pay/${inv.payfast_token}`
        : null;
      return (
        <TableRow key={inv.id}>
          <TableCell className="whitespace-nowrap">{inv.invoice_number || inv.id.slice(0, 8).toUpperCase()}</TableCell>
          <TableCell className="whitespace-nowrap">
            {inv.period_start ? `${inv.period_start} → ${inv.period_end}` : inv.created_at.slice(0, 10)}
          </TableCell>
          <TableCell className="text-right">{fmtMoney(Number(inv.amount || 0), inv.currency || currency)}</TableCell>
          <TableCell>
            <Badge variant="outline" className={statusBadge(overdue ? "past_due" : inv.status)}>
              {label(inv.status, overdue)}
            </Badge>
          </TableCell>
          <TableCell className="whitespace-nowrap">{inv.paid_at?.slice(0, 10) || "—"}</TableCell>
          <TableCell className="text-right">
            <div className="flex justify-end gap-1">
              {inv.pdf_url && (
                <Button asChild size="sm" variant="ghost">
                  <a href={inv.pdf_url} target="_blank" rel="noreferrer">
                    <Download className="h-3.5 w-3.5" />
                  </a>
                </Button>
              )}
              {payUrl && (
                <Button asChild size="sm" variant="outline">
                  <a href={payUrl} target="_blank" rel="noreferrer">
                    Pay
                  </a>
                </Button>
              )}
            </div>
          </TableCell>
        </TableRow>
      );
    });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as StatusFilter)}>
          <SelectTrigger className="h-8 w-40 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="due">Due &amp; overdue</SelectItem>
            <SelectItem value="paid">Paid</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={exportCsv}>
          <Download className="mr-2 h-3.5 w-3.5" />
          Export CSV
        </Button>
      </div>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4" /> Monthly subscription invoices
          </CardTitle>
        </CardHeader>
        <CardContent className="text-xs">
          {monthly.length === 0 ? (
            <p className="text-muted-foreground">No subscription invoices for this filter.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>{subRows(monthly)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Setup &amp; once-off fees</CardTitle>
        </CardHeader>
        <CardContent className="text-xs">
          {setup.length === 0 ? (
            <p className="text-muted-foreground">No setup or once-off invoices.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Issued</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>{subRows(setup)}</TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Commission invoices from ROL</CardTitle>
        </CardHeader>
        <CardContent className="text-xs">
          {commission.length === 0 ? (
            <p className="text-muted-foreground">
              No commission invoices. Commission on bookings ROL settled is deducted on your payout statement instead.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Bookings</TableHead>
                  <TableHead className="text-right">Commission</TableHead>
                  <TableHead className="text-right">VAT</TableHead>
                  <TableHead className="text-right">Total</TableHead>
                  <TableHead className="text-right">Due</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {commission.map((inv) => {
                  const overdue =
                    inv.status !== "paid" && !!inv.due_date && inv.due_date.slice(0, 10) < today && rolInvoiceDue(inv) > 0;
                  const payUrl =
                    inv.status !== "paid" && inv.pay_token ? `${ADMIN_DOMAIN}/billing/pay/${inv.pay_token}` : null;
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="whitespace-nowrap">
                        {inv.invoice_reference || inv.id.slice(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {inv.period_start} → {inv.period_end}
                      </TableCell>
                      <TableCell className="text-right">{inv.booking_count}</TableCell>
                      <TableCell className="text-right">{fmtMoney(inv.commission_total, inv.currency)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(inv.vat_amount, inv.currency)}</TableCell>
                      <TableCell className="text-right font-medium">{fmtMoney(inv.total, inv.currency)}</TableCell>
                      <TableCell className="text-right">{fmtMoney(rolInvoiceDue(inv), inv.currency)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={statusBadge(overdue ? "past_due" : inv.status)}>
                          {label(inv.status, overdue)}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {payUrl && (
                          <Button asChild size="sm" variant="outline">
                            <a href={payUrl} target="_blank" rel="noreferrer">
                              Pay <ExternalLink className="ml-1 h-3 w-3" />
                            </a>
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
