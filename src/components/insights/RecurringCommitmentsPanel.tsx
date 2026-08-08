import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { Repeat } from "lucide-react";
import {
  formatCurrencyAmount,
  formatZar,
  type RecurringCommitment,
} from "@/lib/burnRate";

interface RecurringCommitmentsPanelProps {
  commitments: RecurringCommitment[];
  monthlyBurnZar: number;
}

const CADENCE_LABEL: Record<string, string> = {
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
  yearly: "Annual",
};

export function RecurringCommitmentsPanel({
  commitments,
  monthlyBurnZar,
}: RecurringCommitmentsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <Repeat className="h-4 w-4 text-muted-foreground" />
              Recurring Commitments
            </CardTitle>
            <CardDescription>
              Monthly burn is derived from these bills. Each commitment counts once,
              no matter how many invoices are loaded for it.
            </CardDescription>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold">{formatZar(monthlyBurnZar)}</div>
            <p className="text-xs text-muted-foreground">Derived monthly burn</p>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {commitments.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            No recurring bills loaded yet. Add a bill with a Monthly, Quarterly or
            Annual billing type and it will drive the burn rate.
          </p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Commitment</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Cadence</TableHead>
                  <TableHead className="text-right">As invoiced</TableHead>
                  <TableHead className="text-right">Per month (ZAR)</TableHead>
                  <TableHead className="text-right">Invoices</TableHead>
                  <TableHead>Latest</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commitments.map((commitment) => (
                  <TableRow key={commitment.key}>
                    <TableCell className="font-medium">{commitment.description}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {commitment.vendor || "-"}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">
                        {CADENCE_LABEL[String(commitment.billingType).toLowerCase()] ??
                          commitment.billingType}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right font-mono text-sm text-muted-foreground">
                      {formatCurrencyAmount(commitment.amount, commitment.currency)}
                    </TableCell>
                    <TableCell className="text-right font-mono font-semibold">
                      {formatZar(commitment.monthlyZar)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {commitment.invoiceCount}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {commitment.latestInvoiceDate
                        ? format(new Date(commitment.latestInvoiceDate), "MMM d, yyyy")
                        : "-"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
