import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InvoiceTable } from "./InvoiceTable";
import { AddInvoiceModal } from "./AddInvoiceModal";
import { RunwayChart } from "./RunwayChart";
import { FinancialMetricsCards } from "./FinancialMetricsCards";
import { Button } from "@/components/ui/button";
import { Plus, TrendingUp, Receipt } from "lucide-react";
import { AddMetricModal } from "./AddMetricModal";

export function AccountingDashboard() {
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

  const latestMetric = metrics?.[0];
  const exchangeRate = latestMetric?.exchange_rate || 18.5;

  // Helper to get ZAR value (use cost_zar if available, otherwise convert from USD)
  const getZarValue = (invoice: { cost_zar: number | null; cost_usd: number }) => {
    return invoice.cost_zar ?? (Number(invoice.cost_usd) * exchangeRate);
  };

  // Calculate invoice stats in ZAR
  const monthlyTotal = invoices
    ?.filter((inv) => inv.billing_type === "monthly" && !inv.is_paid)
    ?.reduce((sum, inv) => sum + getZarValue(inv), 0) || 0;

  const unpaidTotal = invoices
    ?.filter((inv) => !inv.is_paid)
    ?.reduce((sum, inv) => sum + getZarValue(inv), 0) || 0;

  const ytdTotal = invoices
    ?.filter((inv) => {
      const date = new Date(inv.invoice_date);
      return date.getFullYear() === new Date().getFullYear();
    })
    ?.reduce((sum, inv) => sum + getZarValue(inv), 0) || 0;

  // Calculate cash balance in ZAR
  const cashBalanceZar = latestMetric?.cash_balance_zar ?? 
    (latestMetric?.cash_balance_usd ? latestMetric.cash_balance_usd * exchangeRate : null);

  return (
    <div className="space-y-6">
      <FinancialMetricsCards
        monthlyBurn={monthlyTotal}
        unpaidTotal={unpaidTotal}
        ytdTotal={ytdTotal}
        runwayMonths={latestMetric?.runway_months}
        cashBalance={cashBalanceZar}
        isLoading={invoicesLoading || metricsLoading}
      />

      <Tabs defaultValue="invoices" className="space-y-4">
        <div className="flex items-center justify-between">
          <TabsList>
            <TabsTrigger value="invoices" className="gap-2">
              <Receipt className="h-4 w-4" />
              Invoices
            </TabsTrigger>
            <TabsTrigger value="runway" className="gap-2">
              <TrendingUp className="h-4 w-4" />
              Runway & Metrics
            </TabsTrigger>
          </TabsList>
          
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setIsAddMetricOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Metric
            </Button>
            <Button onClick={() => setIsAddInvoiceOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Invoice
            </Button>
          </div>
        </div>

        <TabsContent value="invoices" className="space-y-4">
          <InvoiceTable
            invoices={invoices || []}
            isLoading={invoicesLoading}
            onEdit={(invoice) => {
              setEditingInvoice(invoice);
              setIsAddInvoiceOpen(true);
            }}
          />
        </TabsContent>

        <TabsContent value="runway" className="space-y-4">
          <RunwayChart metrics={metrics || []} isLoading={metricsLoading} />
        </TabsContent>
      </Tabs>

      <AddInvoiceModal
        open={isAddInvoiceOpen}
        onOpenChange={(open) => {
          setIsAddInvoiceOpen(open);
          if (!open) setEditingInvoice(null);
        }}
        editingInvoice={editingInvoice}
      />

      <AddMetricModal
        open={isAddMetricOpen}
        onOpenChange={setIsAddMetricOpen}
      />
    </div>
  );
}
