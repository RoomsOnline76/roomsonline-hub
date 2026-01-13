import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useLedgerSummary } from "@/hooks/useBankExport";
import { Wallet, Clock, CheckCircle2, ArrowUpRight, Building2 } from "lucide-react";

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency: "ZAR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function LedgerSummary() {
  const { data: summary, isLoading, error } = useLedgerSummary();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <Skeleton className="h-4 w-24" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-32" />
                <Skeleton className="h-4 w-20 mt-2" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive">
        <CardContent className="pt-6">
          <p className="text-destructive">Failed to load ledger summary: {error.message}</p>
        </CardContent>
      </Card>
    );
  }

  if (!summary) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-muted-foreground">No ledger data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Pending */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending
            </CardTitle>
            <Clock className="h-4 w-4 text-amber-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.total_pending_amount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.total_pending} entries awaiting escrow release
            </p>
          </CardContent>
        </Card>

        {/* Eligible */}
        <Card className="border-green-500/50 bg-green-500/5">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Eligible for Payout
            </CardTitle>
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatCurrency(summary.total_eligible_amount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.total_eligible} entries ready for export
            </p>
          </CardContent>
        </Card>

        {/* Exported */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Exported
            </CardTitle>
            <ArrowUpRight className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatCurrency(summary.total_exported_amount)}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {summary.total_exported} entries paid out
            </p>
          </CardContent>
        </Card>
      </div>

      {/* By Property Breakdown */}
      {summary.by_property.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              Breakdown by Property
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {summary.by_property.map((property) => (
                <div
                  key={property.property_id}
                  className="flex items-center justify-between py-2 border-b last:border-0"
                >
                  <div className="flex-1">
                    <p className="font-medium text-sm">{property.property_name}</p>
                    <div className="flex gap-2 mt-1">
                      {property.pending_count > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {property.pending_count} pending
                        </Badge>
                      )}
                      {property.eligible_count > 0 && (
                        <Badge variant="default" className="text-xs bg-green-500">
                          {property.eligible_count} eligible
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div className="text-right">
                    {property.eligible_amount > 0 && (
                      <p className="text-sm font-medium text-green-600">
                        {formatCurrency(property.eligible_amount)}
                      </p>
                    )}
                    {property.pending_amount > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency(property.pending_amount)} pending
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Empty State */}
      {summary.total_pending === 0 && summary.total_eligible === 0 && summary.total_exported === 0 && (
        <Card className="border-dashed">
          <CardContent className="pt-6 text-center">
            <Wallet className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground">No ledger entries yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Entries will appear here when bookings are paid
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
