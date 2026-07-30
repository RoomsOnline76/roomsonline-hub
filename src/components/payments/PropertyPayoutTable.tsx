import { useState } from "react";
import { CheckCircle, AlertTriangle, Send, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { PropertyPayout } from "@/hooks/usePropertyPayouts";
import { PaymentAdviceDialog } from "./PaymentAdviceDialog";

interface PropertyPayoutTableProps {
  payouts: PropertyPayout[];
  loading: boolean;
}

const formatCurrency = (amount: number) =>
  `R${amount.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

export function PropertyPayoutTable({ payouts, loading }: PropertyPayoutTableProps) {
  const [selectedPayout, setSelectedPayout] = useState<PropertyPayout | null>(null);

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-14 w-full" />)}
      </div>
    );
  }

  if (payouts.length === 0) {
    return (
      <div className="text-center py-12">
        <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
        <p className="text-muted-foreground">No property payouts to display</p>
      </div>
    );
  }

  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Property</TableHead>
            <TableHead className="text-right">Gross Collected</TableHead>
            <TableHead className="text-right">Commission</TableHead>
            <TableHead className="text-right">Fees</TableHead>
            <TableHead className="text-right">Net Payout</TableHead>
            <TableHead>Banking</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payouts.map(p => (
            <TableRow key={p.property_id}>
              <TableCell>
                <div>
                  <p className="font-medium text-sm">{p.property_name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.booking_count} booking{p.booking_count !== 1 ? 's' : ''} · {p.billing_strategy}
                    {p.billing_scope === 'portfolio' ? ' · portfolio billing' : ''}
                  </p>
                  {p.booking_recorded_count > 0 && (
                    <Badge variant="secondary" className="mt-1 text-[10px]">
                      {p.booking_recorded_count} booking-recorded (no gateway record)
                    </Badge>
                  )}
                </div>
              </TableCell>

              <TableCell className="text-right font-medium">{formatCurrency(p.gross_amount)}</TableCell>
              <TableCell className="text-right">
                <div>
                  <span className="font-medium">{formatCurrency(p.commission_amount)}</span>
                  <span className="text-xs text-muted-foreground ml-1">
                    ({p.commission_rate.toFixed(1)}% eff.)
                  </span>
                </div>
              </TableCell>

              <TableCell className="text-right text-muted-foreground">
                {p.fees > 0 ? formatCurrency(p.fees) : '—'}
              </TableCell>
              <TableCell className="text-right">
                <span className="font-semibold text-emerald-600">{formatCurrency(p.net_amount)}</span>
              </TableCell>
              <TableCell>
                {p.has_banking ? (
                  p.banking_verified ? (
                    <Badge variant="outline" className="text-emerald-600 border-emerald-200 text-[10px]">
                      <CheckCircle className="h-2.5 w-2.5 mr-1" /> Verified
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-[10px]">On file</Badge>
                  )
                ) : (
                  <Badge variant="destructive" className="text-[10px]">
                    <AlertTriangle className="h-2.5 w-2.5 mr-1" /> Missing
                  </Badge>
                )}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  disabled={!p.owner_email}
                  onClick={() => setSelectedPayout(p)}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Send Advice
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <PaymentAdviceDialog
        payout={selectedPayout}
        open={!!selectedPayout}
        onOpenChange={(open) => !open && setSelectedPayout(null)}
      />
    </>
  );
}
