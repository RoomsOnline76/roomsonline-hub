import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CreditCard,
  DollarSign,
  Clock,
  Handshake,
  Building2,
  TrendingUp,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { usePropertyPayouts } from "@/hooks/usePropertyPayouts";
import { PayoutStatementRun } from "@/components/payments/PayoutStatementRun";

interface CommissionPayout {
  id: string;
  rep_id: string;
  rep_name: string;
  rep_code: string;
  period_month: string;
  total_amount: number;
  status: string;
  has_banking: boolean;
  banking_verified: boolean;
}

// PayFast checkout sessions don't stay open forever — a pending row older than
// this is an abandoned attempt, not money in flight.
const PENDING_SESSION_MS = 2 * 60 * 60 * 1000;

export default function AdminPayments() {
  const navigate = useNavigate();
  const [commissionPayouts, setCommissionPayouts] = useState<CommissionPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [commissionsLoading, setCommissionsLoading] = useState(true);

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
    loadCommissionPayouts();
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

  // Commission detail lives on Admin → Commission Statements; Payments only
  // surfaces the headline so an admin knows there is money waiting there.
  const loadCommissionPayouts = async () => {
    try {
      setCommissionsLoading(true);
      const { data: reports, error } = await supabase
        .from('rep_commission_reports')
        .select(`id, rep_id, period_month, total_amount, net_payable, status, sales_reps!inner(display_name, rep_code, id)`)
        .in('status', ['pending_approval', 'approved'])
        .order('period_month', { ascending: false })
        .limit(50);
      if (error) throw error;

      setCommissionPayouts((reports || []).map((r: any) => ({
        id: r.id, rep_id: r.rep_id,
        rep_name: r.sales_reps?.display_name || 'Unknown',
        rep_code: r.sales_reps?.rep_code || '',
        period_month: r.period_month,
        total_amount: Number(r.net_payable ?? r.total_amount) || 0,
        status: r.status,
        has_banking: false,
        banking_verified: false,
      })));
    } catch (error) {
      console.error('Error loading commission payouts:', error);
    } finally {
      setCommissionsLoading(false);
    }
  };

  const totalCommissionsDue = commissionPayouts
    .filter(p => p.status === 'approved')
    .reduce((sum, p) => sum + p.total_amount, 0);
  const awaitingApprovalCount = commissionPayouts.filter(p => p.status === 'pending_approval').length;


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
      <PageHeader title="Payments" subtitle="Property payout statements, ROL charges invoices, and commission management" />

      <div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6 xl:gap-6 mb-8">
        <StatCard title="Due to Properties" value={`R${Math.round(payoutStats.totalDue).toLocaleString()}`} icon={Building2} description={`${payoutStats.propertiesCount} properties`} variant="warning" />
        <StatCard title="Recoverable (BYO)" value={`R${Math.round(payoutStats.totalInvoiced).toLocaleString()}`} icon={CreditCard} description="Commission to invoice owners" variant={payoutStats.totalInvoiced > 0 ? 'warning' : 'default'} />
        <StatCard title="Commission Earned" value={`R${Math.round(payoutStats.totalCommission).toLocaleString()}`} icon={TrendingUp} description="Total platform commission" variant="success" />
        <StatCard title="Total Collected" value={`R${txStats.totalRevenue.toLocaleString()}`} icon={DollarSign} description="Completed payments" variant="success" />
        <StatCard title="Pending" value={`R${txStats.pendingAmount.toLocaleString()}`} icon={Clock} description="Awaiting confirmation" variant="warning" />
        <StatCard title="Rep Commissions" value={`R${totalCommissionsDue.toLocaleString()}`} icon={Handshake} description="Approved, awaiting payout" variant={totalCommissionsDue > 0 ? 'warning' : 'default'} />
      </div>


      <Tabs defaultValue="payouts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="payouts">Property Payouts</TabsTrigger>
          <TabsTrigger value="commissions" className="gap-1.5">
            Referral Commission
            {awaitingApprovalCount > 0 && (
              <Badge variant="secondary" className="ml-1 h-4 px-1.5 text-[10px]">
                {awaitingApprovalCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Property Payouts — persisted statements, default tab */}
        <TabsContent value="payouts">
          <PayoutStatementRun />
        </TabsContent>

        {/* Referral commission now lives on its own surface — this is the pointer. */}
        <TabsContent value="commissions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Handshake className="h-5 w-5" />Referral commission</CardTitle>
              <CardDescription>
                Partner paysheets are generated, approved, emailed and paid on Commission Statements.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {commissionsLoading ? (
                <div className="space-y-3">{[1, 2].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : (
                <div className="grid gap-4 sm:grid-cols-3">
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Awaiting approval</p>
                    <p className="text-lg font-bold">{awaitingApprovalCount}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Approved, awaiting payment</p>
                    <p className="text-lg font-bold">R{totalCommissionsDue.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">Latest period</p>
                    <p className="text-lg font-bold">
                      {commissionPayouts[0]?.period_month
                        ? format(new Date(commissionPayouts[0].period_month), 'MMM yyyy')
                        : '—'}
                    </p>
                  </div>
                </div>
              )}
              <Button onClick={() => navigate('/admin/commission-reports')}>
                Open Commission Statements
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

    </AppLayout>
  );
}
