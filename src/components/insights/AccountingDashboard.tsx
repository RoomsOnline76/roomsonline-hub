import { useState, useMemo, lazy, Suspense } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceTable } from "./InvoiceTable";
import { AddInvoiceModal } from "./AddInvoiceModal";
/* Charts pull in the full charting runtime — load it after the cards paint. */
const RunwayChart = lazy(() => import("./RunwayChart").then((m) => ({ default: m.RunwayChart })));
import { FinancialMetricsCards } from "./FinancialMetricsCards";
import { RecurringCommitmentsPanel } from "./RecurringCommitmentsPanel";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, Receipt, Repeat, Users } from "lucide-react";
import { CostSharingPanel } from "./CostSharingPanel";

import { AddMetricModal } from "./AddMetricModal";
import { useRolActualRevenue } from "@/hooks/useRolActualRevenue";
import {
  computeRunway,
  deriveRecurringCommitments,
  invoiceZar,
  DEFAULT_FX,
  type FxRates,
} from "@/lib/burnRate";

interface AccountingDashboardProps {
  dateRange?: { start: string; end: string };
}

export function AccountingDashboard({ dateRange }: AccountingDashboardProps) {
  const [isAddInvoiceOpen, setIsAddInvoiceOpen] = useState(false);
  const [isAddMetricOpen, setIsAddMetricOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<any>(null);

  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("*")
        .order("invoice_date", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery({
    queryKey: ["financial-metrics"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("financial_metrics")
        .select("*")
        .order("metric_date", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data;
    },
  });

  const { data: revenue, isLoading: revenueLoading } = useRolActualRevenue();

  const latestMetric = metrics?.[0] as any;

  const fxRates: FxRates = useMemo(
    () => ({
      usdZar: Number(latestMetric?.exchange_rate) || DEFAULT_FX.usdZar,
      eurZar: Number(latestMetric?.eur_rate) || DEFAULT_FX.eurZar,
    }),
    [latestMetric?.exchange_rate, latestMetric?.eur_rate],
  );

  /**
   * Burn is derived from ALL recurring bills ever loaded (not the date filter):
   * a recurring commitment is an ongoing obligation, counted once.
   */
  const commitments = useMemo(
    () => deriveRecurringCommitments(invoices as any[], fxRates),
    [invoices, fxRates],
  );
  const monthlyBurnZar = useMemo(
    () => commitments.reduce((sum, c) => sum + c.monthlyZar, 0),
    [commitments],
  );

  const monthlyRevenueZar = revenue?.trailingMonthlyAvgZar ?? 0;

  // Filter invoices by date range for spend/unpaid figures only.
  const filteredInvoices = useMemo(
    () =>
      (invoices ?? []).filter((inv: any) => {
        if (!dateRange) return true;
        const invDate = inv.invoice_date || inv.created_at;
        if (!invDate) return true;
        return invDate >= dateRange.start && invDate <= dateRange.end;
      }),
    [invoices, dateRange],
  );

  const unpaidTotal = filteredInvoices
    .filter((inv: any) => !inv.is_paid)
    .reduce((sum: number, inv: any) => sum + invoiceZar(inv, fxRates), 0);

  const periodTotal = filteredInvoices.reduce(
    (sum: number, inv: any) => sum + invoiceZar(inv, fxRates),
    0,
  );

  const cashBalanceZar =
    latestMetric?.cash_balance_zar ??
    (latestMetric?.cash_balance_usd
      ? Number(latestMetric.cash_balance_usd) * fxRates.usdZar
      : null);

  const runway = computeRunway(cashBalanceZar, monthlyBurnZar, monthlyRevenueZar);

  return (
    <div className="space-y-6">
      <FinancialMetricsCards
        monthlyBurn={monthlyBurnZar}
        commitmentCount={commitments.length}
        monthlyRevenue={monthlyRevenueZar}
        netBurn={runway.netBurnZar}
        unpaidTotal={unpaidTotal}
        ytdTotal={periodTotal}
        runwayMonths={runway.months}
        cashFlowPositive={runway.cashFlowPositive}
        cashBalance={cashBalanceZar}
        isLoading={invoicesLoading || metricsLoading || revenueLoading}
      />

      <Tabs defaultValue="invoices" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <TabsList>
            <TabsTrigger value="invoices" className="gap-2">
              <Receipt className="h-4 w-4" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="recurring" className="gap-2">
              <Repeat className="h-4 w-4" />
              Recurring
            </TabsTrigger>
            <TabsTrigger value="runway" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Runway &amp; Metrics
            </TabsTrigger>
            <TabsTrigger value="costshare" className="gap-2">
              <Users className="h-4 w-4" />
              Cost Sharing
            </TabsTrigger>
          </TabsList>


          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsAddMetricOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Snapshot
            </Button>
            <Button onClick={() => setIsAddInvoiceOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Invoice
            </Button>
          </div>
        </div>

        <TabsContent value="invoices" className="space-y-4">
          <InvoiceTable
            invoices={(invoices as any[]) || []}
            isLoading={invoicesLoading}
            onEdit={(invoice) => {
              setEditingInvoice(invoice);
              setIsAddInvoiceOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="recurring" className="space-y-4">
          <RecurringCommitmentsPanel
            commitments={commitments}
            monthlyBurnZar={monthlyBurnZar}
          />
        </TabsContent>

        <TabsContent value="runway" className="space-y-4">

          <Suspense fallback={<div className="h-[300px] w-full animate-pulse rounded bg-muted/50" aria-hidden />}>
            <RunwayChart metrics={(metrics as any[]) || []} isLoading={metricsLoading} />
          </Suspense>
        </TabsContent>

        <TabsContent value="costshare" className="space-y-4">
          <CostSharingPanel
            allInvoices={(invoices as any[]) || []}
            periodInvoices={filteredInvoices as any[]}
            fxRates={fxRates}
            dateRange={dateRange}
          />
        </TabsContent>
      </Tabs>


      <AddInvoiceModal
        open={isAddInvoiceOpen}
        onOpenChange={(open) => {
          setIsAddInvoiceOpen(open);
          if (!open) setEditingInvoice(null);
        }}
        editingInvoice={editingInvoice}
        fxRates={fxRates}
      />

      <AddMetricModal
        open={isAddMetricOpen}
        onOpenChange={setIsAddMetricOpen}
        derivedBurnZar={monthlyBurnZar}
        derivedRevenueZar={monthlyRevenueZar}
      />
    </div>
  );
}
