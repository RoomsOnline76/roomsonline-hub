import { useEffect, useState, useMemo } from "react";
import { 
  CreditCard, 
  DollarSign, 
  AlertTriangle,
  CheckCircle,
  Clock,
  Download,
  Filter,
  Search,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { toast } from "sonner";

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

export default function AdminPayments() {
  const [transactions, setTransactions] = useState<PaymentTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [stats, setStats] = useState({
    totalRevenue: 0,
    pendingAmount: 0,
    failedCount: 0,
    successCount: 0,
  });

  useEffect(() => {
    loadPayments();
  }, [statusFilter]);

  const loadPayments = async () => {
    try {
      setLoading(true);
      
      let query = supabase
        .from('payment_transactions')
        .select(`
          *,
          bookings!inner(
            guest_name,
            properties!inner(name)
          )
        `)
        .order('created_at', { ascending: false })
        .limit(50);
      
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      
      if (error) throw error;

      const formattedData = (data || []).map((t: any) => ({
        id: t.id,
        booking_id: t.booking_id,
        amount: t.amount,
        currency: t.currency || 'ZAR',
        status: t.status,
        payment_method: t.payment_method,
        created_at: t.created_at,
        guest_name: t.bookings?.guest_name,
        property_name: t.bookings?.properties?.name,
      }));

      setTransactions(formattedData);

      // Calculate stats
      const allTransactions = await supabase
        .from('payment_transactions')
        .select('amount, status');
      
      if (allTransactions.data) {
        const total = allTransactions.data
          .filter(t => t.status === 'completed')
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        const pending = allTransactions.data
          .filter(t => t.status === 'pending')
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        const failed = allTransactions.data.filter(t => t.status === 'failed').length;
        const success = allTransactions.data.filter(t => t.status === 'completed').length;
        
        setStats({
          totalRevenue: total,
          pendingAmount: pending,
          failedCount: failed,
          successCount: success,
        });
      }
    } catch (error) {
      console.error('Error loading payments:', error);
      toast.error('Failed to load payment data');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">Completed</Badge>;
      case 'pending':
        return <Badge variant="secondary">Pending</Badge>;
      case 'failed':
        return <Badge variant="destructive">Failed</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Filter transactions by search term across all columns
  const filteredTransactions = useMemo(() => {
    if (!searchTerm.trim()) return transactions;
    
    const term = searchTerm.toLowerCase();
    return transactions.filter(t => {
      const dateStr = format(new Date(t.created_at), 'MMM d, yyyy HH:mm').toLowerCase();
      const amountStr = `${t.currency} ${t.amount.toLocaleString()}`.toLowerCase();
      
      return (
        dateStr.includes(term) ||
        (t.guest_name?.toLowerCase().includes(term) || false) ||
        (t.property_name?.toLowerCase().includes(term) || false) ||
        (t.payment_method?.toLowerCase().includes(term) || false) ||
        amountStr.includes(term) ||
        t.status.toLowerCase().includes(term)
      );
    });
  }, [transactions, searchTerm]);

  const StatCard = ({ 
    title,
    value, 
    icon: Icon, 
    description,
    variant = 'default',
  }: { 
    title: string; 
    value: string | number; 
    icon: React.ElementType;
    description?: string;
    variant?: 'default' | 'warning' | 'success' | 'error';
  }) => (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${
          variant === 'warning' ? 'text-amber-500' : 
          variant === 'success' ? 'text-emerald-500' : 
          variant === 'error' ? 'text-destructive' :
          'text-muted-foreground'
        }`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AppLayout>
      <PageHeader
        title="Payments"
        subtitle="Manage booking payments and transactions"
      />

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-4 xl:gap-6 mb-8">
        <StatCard
          title="Total Revenue"
          value={`R${stats.totalRevenue.toLocaleString()}`}
          icon={DollarSign}
          description="Completed payments"
          variant="success"
        />
        <StatCard
          title="Pending"
          value={`R${stats.pendingAmount.toLocaleString()}`}
          icon={Clock}
          description="Awaiting confirmation"
          variant="warning"
        />
        <StatCard
          title="Successful"
          value={stats.successCount}
          icon={CheckCircle}
          description="Completed transactions"
          variant="success"
        />
        <StatCard
          title="Failed"
          value={stats.failedCount}
          icon={AlertTriangle}
          description="Failed transactions"
          variant={stats.failedCount > 0 ? 'error' : 'default'}
        />
      </div>

      {/* Transactions Table */}
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
                <Input
                  placeholder="Search all columns..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 w-[200px]"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : filteredTransactions.length === 0 ? (
            <div className="text-center py-12">
              <CreditCard className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">
                {searchTerm ? "No transactions match your search" : "No transactions found"}
              </p>
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
                {filteredTransactions.map((transaction) => (
                  <TableRow key={transaction.id}>
                    <TableCell className="text-sm">
                      {format(new Date(transaction.created_at), 'MMM d, yyyy HH:mm')}
                    </TableCell>
                    <TableCell className="font-medium">
                      {transaction.guest_name || 'Unknown'}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {transaction.property_name || 'Unknown'}
                    </TableCell>
                    <TableCell className="capitalize">
                      {transaction.payment_method || '-'}
                    </TableCell>
                    <TableCell className="font-medium">
                      {transaction.currency} {transaction.amount.toLocaleString()}
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(transaction.status)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </AppLayout>
  );
}
