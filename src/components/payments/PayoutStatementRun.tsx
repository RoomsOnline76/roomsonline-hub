/**
 * Payout run — period selection, statement generation, and the statement list.
 * Replaces the old live-calculated payout summary: every figure shown here comes
 * from a persisted statement so it can be re-issued identically at any time.
 */
import { useMemo, useState } from "react";
import { Building2, Loader2, PlayCircle, RefreshCw, FileText, Download } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { usePayoutStatements, type PayoutPeriodRange } from "@/hooks/usePayoutStatements";
import { fmtMoney, periodLabel, STATUS_LABELS } from "@/lib/payoutStatement";
import { PayoutStatementDetailDialog } from "./PayoutStatementDetailDialog";
import { UnassignedPaymentsPanel } from "./UnassignedPaymentsPanel";

/** Whole-month periods keep statements aligned with owner expectations. */
function monthOptions(count = 12): { value: string; label: string; range: PayoutPeriodRange }[] {
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

export function PayoutStatementRun() {
  const months = useMemo(() => monthOptions(), []);
  const [month, setMonth] = useState(months[0].value);
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);

  const period = useMemo(
    () => months.find((m) => m.value === month)?.range ?? months[0].range,
    [months, month],
  );

  const {
    statements, unassigned, vat, loading, running, lastUpdated, totals,
    refresh, generate, finalise, markPaid, voidStatement,
  } = usePayoutStatements(period);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return statements;
    return statements.filter((s) =>
      [s.group_name, s.statement_reference, s.invoice_reference, s.payment_reference, s.owner_email]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term)),
    );
  }, [statements, search]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5" />Property Payout Statements
              </CardTitle>
              <CardDescription>
                Consolidated statements per portfolio or property · {periodLabel(period.start, period.end)}
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
                placeholder="Search property or reference…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 w-[220px]"
              />
              <Button variant="outline" size="sm" onClick={() => refresh()} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
              <Button size="sm" onClick={() => generate()} disabled={running}>
                {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <PlayCircle className="h-4 w-4 mr-1.5" />}
                {statements.length ? "Refresh drafts" : "Run statements"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { label: "Net payable", value: fmtMoney(totals.netPayable), hint: `${totals.count} statement${totals.count === 1 ? "" : "s"}` },
              { label: "Gross bookings", value: fmtMoney(totals.gross), hint: "Settled in period" },
              { label: "ROL charges invoiced", value: fmtMoney(totals.invoiced), hint: "Recovered by deduction" },
              { label: "Awaiting action", value: `${totals.drafts} draft · ${totals.unpaid} unpaid`, hint: "Finalise, then pay" },
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
                {statements.length === 0
                  ? "No statements for this period yet — run the statements to build drafts."
                  : "No statements match your search."}
              </p>
            </div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Settlement group</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                    <TableHead className="text-right">Held</TableHead>
                    <TableHead className="text-right">ROL invoice</TableHead>
                    <TableHead className="text-right">Net payable</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Bank ref</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((s) => (
                    <TableRow
                      key={s.id}
                      className="cursor-pointer"
                      onClick={() => setOpenId(s.id)}
                    >
                      <TableCell>
                        <div className="font-medium">{s.group_name}</div>
                        <div className="text-xs text-muted-foreground">
                          {s.group_kind === "portfolio"
                            ? `Portfolio · ${s.payout_mode === "split" ? "split payments" : "consolidated"}`
                            : "Property"}
                          {s.owner_email ? ` · ${s.owner_email}` : ""}
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{s.statement_reference || "—"}</TableCell>
                      <TableCell className="text-right text-sm">{fmtMoney(s.gross_amount, s.currency)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtMoney(s.amount_held, s.currency)}</TableCell>
                      <TableCell className="text-right text-sm">{fmtMoney(s.invoice_total, s.currency)}</TableCell>
                      <TableCell className="text-right text-sm font-semibold">
                        {fmtMoney(s.net_payable, s.currency)}
                        {s.carry_forward > 0 && (
                          <div className="text-[11px] font-normal text-amber-600 dark:text-amber-400">
                            +{fmtMoney(s.carry_forward, s.currency)} carried
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant={s.status === "paid" ? "default" : s.status === "draft" ? "outline" : "secondary"}>
                          {STATUS_LABELS[s.status]}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right font-mono text-xs">
                        {s.bank_payment_reference || s.payment_reference || "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {filtered.length > 0 && (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Download className="h-3.5 w-3.5" />
              Open a statement to download the owner statement and the matching ROL charges invoice.
            </p>
          )}
        </CardContent>
      </Card>

      <UnassignedPaymentsPanel payments={unassigned} />

      <PayoutStatementDetailDialog
        statementId={openId}
        vat={vat}
        busy={running}
        onClose={() => setOpenId(null)}
        onFinalise={finalise}
        onMarkPaid={markPaid}
        onVoid={voidStatement}
      />
    </div>
  );
}
