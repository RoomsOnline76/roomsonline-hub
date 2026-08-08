import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Download, FileDown } from "lucide-react";
import { toast } from "sonner";
import {
  buildStatement,
  downloadCsv,
  fmtMoney,
  toCsv,
  type LedgerEntry,
  type OwnerBalances,
} from "@/lib/ownerAccount";
import { buildOwnerStatementPdf } from "@/lib/ownerStatementPdf";
import type { VatSettings } from "@/lib/payoutStatement";

interface Props {
  ledger: LedgerEntry[];
  balances: OwnerBalances;
  scopeName: string;
  periodStart: string;
  periodEnd: string;
  vat?: VatSettings;
}

const KIND_LABEL: Record<string, string> = {
  subscription: "Subscription",
  setup: "Setup / once-off",
  commission: "Commission invoice",
  payment: "Payment",
  payout: "Payout due to you",
  payout_paid: "Payout paid",
};

export function AccountStatementTab({ ledger, balances, scopeName, periodStart, periodEnd, vat }: Props) {
  const currency = balances.currency;
  const statement = useMemo(
    () => buildStatement(ledger, { start: periodStart, end: periodEnd }),
    [ledger, periodStart, periodEnd],
  );

  const downloadPdf = () => {
    try {
      const doc = buildOwnerStatementPdf({
        scopeName,
        periodStart,
        periodEnd,
        currency,
        statement,
        dueToYou: balances.dueToYou,
        companyName: vat?.company_legal_name || undefined,
        vatNumber: vat?.vat_number,
        companyAddress: vat?.company_address,
      });
      doc.save(`account-statement-${periodStart}-${periodEnd}.pdf`);
    } catch (err) {
      console.error("[owner-account] statement pdf failed", err);
      toast.error("Could not build the statement PDF");
    }
  };

  const downloadStatementCsv = () =>
    downloadCsv(
      `account-statement-${periodStart}-${periodEnd}.csv`,
      toCsv(
        statement.entries.map((e) => ({
          date: e.date,
          type: KIND_LABEL[e.kind] || e.kind,
          reference: e.reference,
          description: e.description,
          amount: e.amount,
          balance: e.balance,
          currency: e.currency,
        })),
      ),
    );

  return (
    <Card className="border-border/60">
      <CardHeader className="flex flex-col gap-2 pb-2 sm:flex-row sm:items-center sm:justify-between">
        <CardTitle className="text-sm font-medium">
          Account statement
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {periodStart} → {periodEnd}
          </span>
        </CardTitle>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={downloadStatementCsv} disabled={!statement.entries.length}>
            <Download className="mr-2 h-3.5 w-3.5" /> CSV
          </Button>
          <Button size="sm" onClick={downloadPdf} disabled={!statement.entries.length}>
            <FileDown className="mr-2 h-3.5 w-3.5" /> PDF
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-xs">
        <div className="mb-3 flex flex-wrap gap-6">
          <div>
            <div className="text-muted-foreground">Opening balance</div>
            <div className="font-semibold">{fmtMoney(statement.openingBalance, currency)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Closing balance</div>
            <div className="font-semibold">{fmtMoney(statement.closingBalance, currency)}</div>
          </div>
        </div>

        {statement.entries.length === 0 ? (
          <p className="text-muted-foreground">Nothing recorded in this period.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead>Description</TableHead>
                <TableHead className="text-right">Amount</TableHead>
                <TableHead className="text-right">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {statement.entries.map((e, i) => (
                <TableRow key={`${e.reference}-${e.kind}-${i}`}>
                  <TableCell className="whitespace-nowrap">{e.date}</TableCell>
                  <TableCell>{KIND_LABEL[e.kind] || e.kind}</TableCell>
                  <TableCell className="whitespace-nowrap">{e.reference}</TableCell>
                  <TableCell>{e.description}</TableCell>
                  <TableCell className={`text-right ${e.amount < 0 ? "text-success" : ""}`}>
                    {fmtMoney(e.amount, e.currency || currency)}
                  </TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(e.balance, currency)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="mt-4 rounded-md border border-border/60 bg-muted/40 p-3">
          <div className="mb-2 font-medium">All-time summary</div>
          <div className="grid gap-2 sm:grid-cols-4">
            <div>
              <div className="text-muted-foreground">Charged by ROL</div>
              <div className="font-semibold">{fmtMoney(statement.allTime.charged, currency)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Paid to ROL</div>
              <div className="font-semibold">{fmtMoney(statement.allTime.paid, currency)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Received from ROL</div>
              <div className="font-semibold">{fmtMoney(statement.allTime.receivedFromRol, currency)}</div>
            </div>
            <div>
              <div className="text-muted-foreground">Due to you</div>
              <div className="font-semibold text-success">{fmtMoney(balances.dueToYou, currency)}</div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
