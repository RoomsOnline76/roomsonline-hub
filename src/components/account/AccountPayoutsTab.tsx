import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download } from "lucide-react";
import { downloadCsv, fmtMoney, toCsv, type OwnerPayoutStatement } from "@/lib/ownerAccount";

interface Props {
  payouts: OwnerPayoutStatement[];
  currency: string;
}

export function AccountPayoutsTab({ payouts, currency }: Props) {
  const exportCsv = () =>
    downloadCsv(
      `rol-payouts-${new Date().toISOString().slice(0, 10)}.csv`,
      toCsv(
        payouts.map((s) => ({
          statement: s.statement_reference || s.id,
          period: `${s.period_start} to ${s.period_end}`,
          gross: Number(s.gross_collected || 0),
          deductions: Number(s.total_deductions || 0),
          net_payable: Number(s.net_payable || 0),
          currency: s.currency,
          status: s.status,
          paid_on: s.paid_at?.slice(0, 10) || "",
          payment_reference: s.payment_reference || "",
        })),
      ),
    );

  const dueToYou = payouts.filter((s) => s.status === "finalised").reduce((sum, s) => sum + Number(s.net_payable || 0), 0);
  const paid = payouts.filter((s) => s.status === "paid").reduce((sum, s) => sum + Number(s.net_payable || 0), 0);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Due to you</div>
            <div className="text-xl font-semibold text-success">{fmtMoney(dueToYou, currency)}</div>
          </CardContent>
        </Card>
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">Paid to you (all time)</div>
            <div className="text-xl font-semibold">{fmtMoney(paid, currency)}</div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-border/60">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium">Payout statements</CardTitle>
          <Button size="sm" variant="outline" onClick={exportCsv} disabled={payouts.length === 0}>
            <Download className="mr-2 h-3.5 w-3.5" />
            Export CSV
          </Button>
        </CardHeader>
        <CardContent className="text-xs">
          {payouts.length === 0 ? (
            <p className="text-muted-foreground">
              No finalised payout statements yet. Statements appear here as soon as ROL signs off a period.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Statement</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead className="text-right">Gross collected</TableHead>
                  <TableHead className="text-right">ROL deductions</TableHead>
                  <TableHead className="text-right">Net payable</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Paid</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>ROL invoice</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {payouts.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="whitespace-nowrap">
                      {s.statement_reference || s.id.slice(0, 8).toUpperCase()}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {s.period_start} → {s.period_end}
                    </TableCell>
                    <TableCell className="text-right">{fmtMoney(s.gross_collected, s.currency)}</TableCell>
                    <TableCell className="text-right">{fmtMoney(s.total_deductions, s.currency)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(s.net_payable, s.currency)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={
                          s.status === "paid"
                            ? "bg-green-500/10 text-success border-green-500/40"
                            : "bg-amber-500/10 text-warning border-amber-500/40"
                        }
                      >
                        {s.status === "paid" ? "Paid" : "Due to you"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{s.paid_at?.slice(0, 10) || "—"}</TableCell>
                    <TableCell>{s.payment_reference || "—"}</TableCell>
                    <TableCell>{s.rol_invoice_reference || "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Deductions on a statement are recovered there and never invoiced again, so the same charge can never appear
            twice.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
