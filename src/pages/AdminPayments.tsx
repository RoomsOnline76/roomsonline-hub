import { useEffect, useState, useMemo, useCallback } from "react";
import { 
  CreditCard, 
  DollarSign, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Filter,
  Search,
  Handshake,
  Loader2,
  Building2,
  TrendingUp,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";
import { usePropertyPayouts } from "@/hooks/usePropertyPayouts";
import { PropertyPayoutTable } from "@/components/payments/PropertyPayoutTable";

interface PaymentTransaction {
  id: string;
  booking_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string | null;
  created_at: string;
  guest_name?: string;
  property_name?: string;
}

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

export default function AdminPayments() {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [showExpired, setShowExpired] = useState(false);
  const [commissionPayouts, setCommissionPayouts] = useState<CommissionPayout[]>([]);
  const [loading, setLoading] = useState(true);
  const [commissionsLoading, setCommissionsLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [markingPaid, setMarkingPaid] = useState<string | null>(null);
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

  const payoutRangeLabel = useMemo(() => {
    if (payoutPeriod === 'all') return 'All time, by payment date';
    const fromD = payoutRange.from ? new Date(payoutRange.from) : null;
    const toD = payoutRange.to ? new Date(new Date(payoutRange.to).getTime() - 86400000) : new Date();
    if (!fromD) return 'By payment date';
    return `${format(fromD, 'd MMM yyyy')} – ${format(toD, 'd MMM yyyy')}, by payment date`;
  }, [payoutPeriod, payoutRange]);

  const {
    payouts,
    loading: payoutsLoading,
    stats: payoutStats,
    lastUpdated: payoutsUpdatedAt,
    refresh: refreshPayouts,
  } = usePropertyPayouts(payoutRange);


  useEffect(() => {
    loadPayments();
    loadCommissionPayouts();
  }, [statusFilter]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('payment_transactions')
        .select(`*, bookings!inner(guest_name, properties!bookings_property_id_fkey(name))`)
        .order('created_at', { ascending: false })
        .limit(50);
      if (statusFilter !== 'all') query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;

      setTransactions((data || []).map((t: any) => ({
        id: t.id, booking_id: t.booking_id, amount: t.amount,
        currency: t.currency || 'ZAR', status: t.status,
        payment_method: t.payment_method, created_at: t.created_at,
        guest_name: t.bookings?.guest_name,
        property_name: t.bookings?.properties?.name,
      })));

      const { data: all } = await supabase.from('payment_transactions').select('amount, status');
      if (all) {
        // Gateways write 'paid'; some providers write 'completed'/'succeeded'.
        const isSettled = (s: string | null) => ['paid', 'completed', 'succeeded', 'success'].includes(String(s || '').toLowerCase());
        setTxStats({
          totalRevenue: all.filter(t => isSettled(t.status)).reduce((s, t) => s + (Number(t.amount) || 0), 0),
          pendingAmount: all.filter(t => t.status === 'pending').reduce((s, t) => s + (Number(t.amount) || 0), 0),
          failedCount: all.filter(t => ['failed', 'cancelled'].includes(String(t.status || '').toLowerCase())).length,
          successCount: all.filter(t => isSettled(t.status)).length,
        });
      }

    } catch (error) {
      console.error('Error loading payments:', error);
      toast.error('Failed to load payment data');
    } finally {
      setLoading(false);
    }
  };

  const loadCommissionPayouts = async () => {
    try {
      setCommissionsLoading(true);
      const { data: reports, error } = await supabase
        .from('rep_commission_reports')
        .select(`id, rep_id, period_month, total_amount, status, sales_reps!inner(display_name, rep_code, id)`)
        .in('status', ['approved', 'paid'])
        .order('period_month', { ascending: false })
        .limit(50);
      if (error) throw error;

      const repIds = [...new Set((reports || []).map((r: any) => r.rep_id))];
      let bankingMap: Record<string, { exists: boolean; verified: boolean }> = {};
      if (repIds.length > 0) {
        const { data: bankData } = await supabase
          .from('sales_rep_bank_details')
          .select('rep_id, is_verified')
          .in('rep_id', repIds);
        (bankData || []).forEach((b: any) => {
          bankingMap[b.rep_id] = { exists: true, verified: b.is_verified };
        });
      }

      setCommissionPayouts((reports || []).map((r: any) => ({
        id: r.id, rep_id: r.rep_id,
        rep_name: r.sales_reps?.display_name || 'Unknown',
        rep_code: r.sales_reps?.rep_code || '',
        period_month: r.period_month,
        total_amount: r.total_amount || 0, status: r.status,
        has_banking: !!bankingMap[r.rep_id]?.exists,
        banking_verified: !!bankingMap[r.rep_id]?.verified,
      })));
    } catch (error) {
      console.error('Error loading commission payouts:', error);
    } finally {
      setCommissionsLoading(false);
    }
  };

  const handleMarkPaid = async (reportId: string) => {
    try {
      setMarkingPaid(reportId);
      const { error } = await supabase
        .from('rep_commission_reports')
        .update({ status: 'paid', paid_at: new Date().toISOString() } as any)
        .eq('id', reportId);
      if (error) throw error;
      toast.success('Commission marked as paid');
      loadCommissionPayouts();
    } catch (error: any) {
      toast.error(error.message || 'Failed to mark as paid');
    } finally {
      setMarkingPaid(null);
    }
  };

  // PayFast checkout sessions don't stay open forever — a pending row older than
  // this is an abandoned attempt, not money in flight.
  const PENDING_SESSION_MS = 2 * 60 * 60 * 1000;

  const getStatusBadge = (status: string, createdAt?: string) => {
    switch (status) {
      case 'paid':
      case 'succeeded':
      case 'success':
      case 'completed':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Paid</Badge>;
      case 'pending': {
        const stale = createdAt ? Date.now() - new Date(createdAt).getTime() > PENDING_SESSION_MS : false;
        return stale
          ? <Badge variant="outline" className="text-muted-foreground">Expired</Badge>
          : <Badge variant="secondary">Pending</Badge>;
      }

      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };


  const isExpiredTx = useCallback((t: PaymentTransaction) =>
    t.status === 'pending' && Date.now() - new Date(t.created_at).getTime() > PENDING_SESSION_MS,
  [PENDING_SESSION_MS]);

  const expiredCount = useMemo(() => transactions.filter(isExpiredTx).length, [transactions, isExpiredTx]);

  const filteredTransactions = useMemo(() => {
    const base = showExpired ? transactions : transactions.filter(t => !isExpiredTx(t));
    if (!searchTerm.trim()) return base;
    const term = searchTerm.toLowerCase();
    return base.filter(t => {
      const dateStr = format(new Date(t.created_at), 'MMM d, yyyy HH:mm').toLowerCase();
      const amountStr = `${t.currency} ${t.amount.toLocaleString()}`.toLowerCase();
      return dateStr.includes(term) || t.guest_name?.toLowerCase().includes(term) ||
        t.property_name?.toLowerCase().includes(term) || t.payment_method?.toLowerCase().includes(term) ||
        amountStr.includes(term) || t.status.toLowerCase().includes(term);
    });
  }, [transactions, searchTerm, showExpired, isExpiredTx]);

  const totalCommissionsDue = commissionPayouts
    .filter(p => p.status === 'approved')
    .reduce((sum, p) => sum + p.total_amount, 0);

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
      <PageHeader title="Payments" subtitle="Property payouts, transactions, and commission management" />

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
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="commissions" className="gap-1.5">
            Commission Payouts
            {totalCommissionsDue > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] h-4 px-1.5">
                {commissionPayouts.filter(p => p.status === 'approved').length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Property Payouts — default tab */}
        <TabsContent value="payouts">
          <Card>
            <CardHeader>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" />Property Payout Summary</CardTitle>
                  <CardDescription>
                    Net amounts due to each property after commission and fees · {payoutRangeLabel}
                    {payoutsUpdatedAt && (
                      <span className="block text-xs mt-0.5">
                        As at {format(payoutsUpdatedAt, 'd MMM yyyy HH:mm')}
                      </span>
                    )}
                  </CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <Select value={payoutPeriod} onValueChange={setPayoutPeriod}>
                    <SelectTrigger className="w-[150px] h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="this_month">This month</SelectItem>
                      <SelectItem value="last_month">Last month</SelectItem>
                      <SelectItem value="last_90">Last 90 days</SelectItem>
                      <SelectItem value="all">All time</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm" onClick={() => refreshPayouts()} disabled={payoutsLoading}>
                    {payoutsLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Refresh'}
                  </Button>
                  <Button
                    variant={showExpired ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setShowExpired(v => !v)}
                  >
                    {showExpired ? "Hide expired" : `Show expired${expiredCount ? ` (${expiredCount})` : ""}`}
                  </Button>
                  <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-2" />Export</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <PropertyPayoutTable payouts={payouts} loading={payoutsLoading} />
            </CardContent>
          </Card>

        </TabsContent>

        {/* Transactions tab */}
        <TabsContent value="transactions">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Transactions</CardTitle>
                  <CardDescription>Recent payment activity</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input placeholder="Search all columns..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 w-[200px]" />
                  </div>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-[140px]">
                      <Filter className="h-4 w-4 mr-2" />
                      <SelectValue placeholder="Filter" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="failed">Failed</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="sm"><Download className="h-4 w-4 mr-2" />Export</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-4">{[1,2,3,4,5].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-12">
                  <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">{searchTerm ? "No transactions match your search" : "No transactions found"}</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Guest</TableHead>
                      <TableHead>Property</TableHead>
                      <TableHead>Method</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTransactions.map(t => (
                      <TableRow key={t.id}>
                        <TableCell className="text-sm">{format(new Date(t.created_at), 'MMM d, yyyy HH:mm')}</TableCell>
                        <TableCell className="font-medium">{t.guest_name || 'Unknown'}</TableCell>
                        <TableCell className="text-muted-foreground">{t.property_name || 'Unknown'}</TableCell>
                        <TableCell className="capitalize">{t.payment_method || '-'}</TableCell>
                        <TableCell className="font-medium">{t.currency} {t.amount.toLocaleString()}</TableCell>
                        <TableCell>{getStatusBadge(t.status, t.created_at)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Commission Payouts tab */}
        <TabsContent value="commissions">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2"><Handshake className="h-5 w-5" />Commission Payouts</CardTitle>
                  <CardDescription>Approved commissions ready for payout to referral partners</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {commissionsLoading ? (
                <div className="space-y-4">{[1,2,3].map(i => <Skeleton key={i} className="h-12 w-full" />)}</div>
              ) : commissionPayouts.length === 0 ? (
                <div className="text-center py-12">
                  <Handshake className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No commission payouts to process</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Rep</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Banking</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {commissionPayouts.map(p => (
                      <TableRow key={p.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{p.rep_name}</p>
                            <p className="text-xs text-muted-foreground">{p.rep_code}</p>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {p.period_month ? format(new Date(p.period_month), 'MMMM yyyy') : '—'}
                        </TableCell>
                        <TableCell className="font-semibold">R{p.total_amount.toLocaleString()}</TableCell>
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
                            <Badge variant="destructive" className="text-[10px]">Missing</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {p.status === 'paid' ? (
                            <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Paid</Badge>
                          ) : (
                            <Badge variant="secondary">Approved</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right">
                          {p.status === 'approved' && (
                            <Button size="sm" variant="outline" className="h-7 text-xs"
                              disabled={!p.has_banking || markingPaid === p.id}
                              onClick={() => handleMarkPaid(p.id)}
                            >
                              {markingPaid === p.id ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                              Mark Paid
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </AppLayout>
  );
}
