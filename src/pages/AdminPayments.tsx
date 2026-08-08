import { useEffect, useState, useMemo } from "react";
import {
  CreditCard,
  DollarSign,
  Clock,
  Building2,
  TrendingUp,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePropertyPayouts } from "@/hooks/usePropertyPayouts";
import { PayoutStatementRun } from "@/components/payments/PayoutStatementRun";
import { PropertyInvoiceRun } from "@/components/payments/PropertyInvoiceRun";

// PayFast checkout sessions don't stay open forever — a pending row older than
// this is an abandoned attempt, not money in flight.
const PENDING_SESSION_MS = 2 * 60 * 60 * 1000;

export default function AdminPayments() {
  const [loading, setLoading] = useState(true);


  const [txStats, setTxStats] = useState({
    totalRevenue: 0, pendingAmount: 0, failedCount: 0, successCount: 0,
  });

  const [payoutPeriod, setPayoutPeriod] = useState<string>('this_month');

  const payoutRange = useMemo(() => {
    const now = new Date();
    const startOfMonth = (offset: number) =>
      new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1));
    switch (payoutPeriod) {
      case 'this_month':
        return { from: startOfMonth(0).toISOString(), to: startOfMonth(1).toISOString() };
      case 'last_month':
        return { from: startOfMonth(-1).toISOString(), to: startOfMonth(0).toISOString() };
      case 'last_90':
        return { from: new Date(now.getTime() - 90 * 86400000).toISOString(), to: undefined };
      default:
        return { from: undefined, to: undefined };
    }
  }, [payoutPeriod]);

  // Headline stats still use the live payout view; the statement run below is
  // the authoritative, persisted document set.
  const { stats: payoutStats } = usePropertyPayouts(payoutRange);


  useEffect(() => {
    loadPayments();
    
  }, []);

  // Only the headline stats need raw gateway data now — reconciliation detail
  // lives on the payout statements and the unassigned-payments panel.
  const loadPayments = async () => {
    try {
      setLoading(true);
      // Totals must mirror what the page treats as live money: cancelled bookings
      // (test data, refunds, abandoned) and expired checkout sessions are excluded.
      const { data: all, error } = await supabase
        .from('payment_transactions')
        .select('amount, status, created_at, bookings!inner(status)');
      if (error) throw error;
      if (all) {
        // Gateways write 'paid'; some providers write 'completed'/'succeeded'.
        const isSettled = (st: string | null) => ['paid', 'completed', 'succeeded', 'success'].includes(String(st || '').toLowerCase());
        const live = (all as any[]).filter(t => !['cancelled', 'canceled'].includes(String(t.bookings?.status || '').toLowerCase()));
        const isLivePending = (t: any) =>
          t.status === 'pending' && Date.now() - new Date(t.created_at).getTime() <= PENDING_SESSION_MS;
        setTxStats({
          totalRevenue: live.filter(t => isSettled(t.status)).reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
          pendingAmount: live.filter(isLivePending).reduce((sum, t) => sum + (Number(t.amount) || 0), 0),
          failedCount: live.filter(t => ['failed', 'cancelled'].includes(String(t.status || '').toLowerCase())).length,
          successCount: live.filter(t => isSettled(t.status)).length,
        });
      }
    } catch (error) {
      console.error('Error loading payments:', error);
      toast.error('Failed to load payment data');
    } finally {
      setLoading(false);
    }
  };





  const StatCard = ({ title, value, icon: Icon, description, variant = 'default' }: {
    title: string; value: string | number; icon: React.ElementType; description?: string;
    variant?: 'default' | 'warning' | 'success' | 'error';
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${
          variant === 'warning' ? 'text-amber-500' : variant === 'success' ? 'text-emerald-500' :
          variant === 'error' ? 'text-destructive' : 'text-muted-foreground'
        }`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </CardContent>
    </Card>
  );

  return (
    <AppLayout>
      <PageHeader title="Payments" subtitle="Property payout statements and ROL invoices to properties" />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-5 xl:gap-6 mb-8">
        <StatCard title="Due to Properties" value={`R${Math.round(payoutStats.totalDue).toLocaleString()}`} icon={Building2} description={`${payoutStats.propertiesCount} properties`} variant="warning" />
        <StatCard title="Recoverable (BYO)" value={`R${Math.round(payoutStats.totalInvoiced).toLocaleString()}`} icon={CreditCard} description="Commission to invoice owners" variant={payoutStats.totalInvoiced > 0 ? 'warning' : 'default'} />
        <StatCard title="Commission Earned" value={`R${Math.round(payoutStats.totalCommission).toLocaleString()}`} icon={TrendingUp} description="Total platform commission" variant="success" />
        <StatCard title="Total Collected" value={`R${txStats.totalRevenue.toLocaleString()}`} icon={DollarSign} description="Completed payments" variant="success" />
        <StatCard title="Pending" value={`R${txStats.pendingAmount.toLocaleString()}`} icon={Clock} description="Awaiting confirmation" variant="warning" />
      </div>


      <Tabs defaultValue="payouts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payouts">Property Payouts</TabsTrigger>
          <TabsTrigger value="invoices">Property Invoices</TabsTrigger>
        </TabsList>

        {/* Property Payouts — persisted statements, default tab */}
        <TabsContent value="payouts">
          <PayoutStatementRun />
        </TabsContent>

        {/* Receivables: commission + platform fees ROL bills instead of deducting */}
        <TabsContent value="invoices">
          <PropertyInvoiceRun />
        </TabsContent>
      </Tabs>

    </AppLayout>
  );
}

