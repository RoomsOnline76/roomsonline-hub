/**
 * Gateway reconciliation — settled payments no statement has claimed, plus
 * failed and abandoned checkout sessions. This replaces the old Transactions
 * tab: everything reconciled already appears on a statement, so only the
 * exceptions need an admin's attention here.
 */
import { useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { format } from "date-fns";
import { fmtMoney, type UnassignedPayment } from "@/lib/payoutStatement";

const REASON_LABELS: Record<UnassignedPayment["reason"], string> = {
  unassigned: "Not on a statement",
  failed: "Failed",
  expired: "Abandoned checkout",
};

const REASON_HINTS: Record<UnassignedPayment["reason"], string> = {
  unassigned: "Money received but not yet included in a payout statement — run or refresh the statements.",
  failed: "The gateway declined this payment; no money was received.",
  expired: "The guest never completed checkout, so this session can be ignored.",
};

export function UnassignedPaymentsPanel({ payments }: { payments: UnassignedPayment[] }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<UnassignedPayment["reason"] | "all">("unassigned");

  const counts = useMemo(() => {
    const base = { unassigned: 0, failed: 0, expired: 0 };
    payments.forEach((p) => { base[p.reason] += 1; });
    return base;
  }, [payments]);

  const rows = useMemo(
    () => (reason === "all" ? payments : payments.filter((p) => p.reason === reason)),
    [payments, reason],
  );

  if (payments.length === 0) return null;

  return (
    <Card>
      <CardHeader className="cursor-pointer" onClick={() => setOpen((v) => !v)}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              <AlertTriangle className={`h-4 w-4 ${counts.unassigned > 0 ? "text-amber-500" : "text-muted-foreground"}`} />
              Unassigned &amp; failed payments
            </CardTitle>
            <CardDescription>
              {counts.unassigned} not on a statement · {counts.failed} failed · {counts.expired} abandoned
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      {open && (
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-2">
            {(["unassigned", "failed", "expired", "all"] as const).map((r) => (
              <Button
                key={r}
                size="sm"
                variant={reason === r ? "secondary" : "outline"}
                onClick={() => setReason(r)}
              >
                {r === "all" ? "All" : REASON_LABELS[r]}
                <Badge variant="outline" className="ml-1.5 text-[10px] h-4 px-1.5">
                  {r === "all" ? payments.length : counts[r]}
                </Badge>
              </Button>
            ))}
          </div>
          {reason !== "all" && (
            <p className="text-xs text-muted-foreground">{REASON_HINTS[reason]}</p>
          )}
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Reference</TableHead>
                  <TableHead>Guest</TableHead>
                  <TableHead>Property</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Reason</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-xs text-muted-foreground">
                      {format(new Date(p.created_at), "d MMM yyyy HH:mm")}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{p.rol_reference || "—"}</TableCell>
                    <TableCell className="text-sm">{p.guest_name || "Unknown"}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.property_name || "Unknown"}</TableCell>
                    <TableCell className="text-right text-sm">{fmtMoney(p.amount, p.currency)}</TableCell>
                    <TableCell>
                      <Badge variant={p.reason === "unassigned" ? "secondary" : "outline"}>
                        {REASON_LABELS[p.reason]}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                      Nothing here — all clear.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      )}
    </Card>
  );
}
