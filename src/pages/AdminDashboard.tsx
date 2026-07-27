import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { 
  BookOpen, 
  Building2, 
  CreditCard, 
  AlertTriangle,
  TrendingUp,
  Users,
  Clock,
  ArrowRight,
} from "lucide-react";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { format, subDays } from "date-fns";
import { NarrativeSummary } from "@/components/dashboard/NarrativeSummary";
import { SystemAlertsPanel } from "@/components/dashboard/SystemAlertsPanel";

interface DashboardStats {
  paidBookings: number;
  confirmedBookings: number;
  totalProperties: number;
  activeProperties: number;
  pendingPayments: number;
  pendingAccessRequests: number;
  recentBookings: Array<{
    id: string;
    guest_name: string;
    property_name: string;
    check_in_date: string;
    status: string;
    total_price: number;
  }>;
  issuesCount: number;
}


export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardStats();
  }, []);

  const loadDashboardStats = async () => {
    try {
      const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      
      // Parallel queries for dashboard data
      const [
        bookingsResult,
        pendingBookingsResult,
        confirmedBookingsResult,
        propertiesResult,
        activePropertiesResult,
        accessRequestsResult,
        recentBookingsResult,
      ] = await Promise.all([
        supabase.from('bookings').select('*', { count: 'exact', head: true }),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase.from('bookings').select('*', { count: 'exact', head: true }).eq('status', 'confirmed'),
        supabase.from('properties').select('*', { count: 'exact', head: true }),
        supabase.from('properties').select('*', { count: 'exact', head: true }).eq('is_active', true),
        supabase.from('access_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        supabase
          .from('bookings')
          .select(`
            id,
            guest_name,
            check_in_date,
            status,
            total_price,
            properties!inner(name)
          `)
          .gte('created_at', thirtyDaysAgo)
          .order('created_at', { ascending: false })
          .limit(5),
      ]);

      setStats({
        totalBookings: bookingsResult.count || 0,
        pendingBookings: pendingBookingsResult.count || 0,
        confirmedBookings: confirmedBookingsResult.count || 0,
        totalProperties: propertiesResult.count || 0,
        activeProperties: activePropertiesResult.count || 0,
        pendingPayments: 0, // TODO: Implement payment tracking
        pendingAccessRequests: accessRequestsResult.count || 0,
        recentBookings: (recentBookingsResult.data || []).map((b: any) => ({
          id: b.id,
          guest_name: b.guest_name,
          property_name: b.properties?.name || 'Unknown',
          check_in_date: b.check_in_date,
          status: b.status,
          total_price: b.total_price,
        })),
        issuesCount: (pendingBookingsResult.count || 0) + (accessRequestsResult.count || 0),
      });
    } catch (error) {
      console.error('Error loading dashboard stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const StatCard = ({ 
    title, 
    value, 
    icon: Icon, 
    description,
    onClick,
    variant = 'default',
  }: { 
    title: string; 
    value: number | string; 
    icon: React.ElementType;
    description?: string;
    onClick?: () => void;
    variant?: 'default' | 'warning' | 'success';
  }) => (
    <Card 
      className={`cursor-pointer hover:shadow-md transition-shadow ${onClick ? 'hover:border-primary/50' : ''}`}
      onClick={onClick}
    >
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className={`h-4 w-4 ${
          variant === 'warning' ? 'text-amber-500' : 
          variant === 'success' ? 'text-emerald-500' : 
          'text-muted-foreground'
        }`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{loading ? <Skeleton className="h-8 w-16" /> : value}</div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
      </CardContent>
    </Card>
  );

  return (
    <AppLayout>
      <PageHeader
        title="Admin Dashboard"
        subtitle="Platform overview and quick actions"
      />

      {/* AI Narrative Summary */}
      <NarrativeSummary stats={stats} loading={loading} />
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 xl:gap-6 mb-8">
        <StatCard
          title="Total Bookings"
          value={stats?.totalBookings || 0}
          icon={BookOpen}
          description="All time bookings"
          onClick={() => navigate('/admin/all-bookings')}
        />
        <StatCard
          title="Pending Bookings"
          value={stats?.pendingBookings || 0}
          icon={Clock}
          description="Awaiting confirmation"
          variant={stats?.pendingBookings ? 'warning' : 'default'}
          onClick={() => navigate('/admin/all-bookings?status=pending')}
        />
        <StatCard
          title="Active Properties"
          value={`${stats?.activeProperties || 0} / ${stats?.totalProperties || 0}`}
          icon={Building2}
          description="Currently listed"
          onClick={() => navigate('/admin/all-properties')}
        />
        <StatCard
          title="Access Requests"
          value={stats?.pendingAccessRequests || 0}
          icon={Users}
          description="Pending review"
          variant={stats?.pendingAccessRequests ? 'warning' : 'default'}
          onClick={() => navigate('/admin/access-requests')}
        />
      </div>

      {/* System Alerts */}
      <div className="mb-8">
        <SystemAlertsPanel maxAlerts={5} />
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:gap-8">
        {/* Recent Bookings */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Recent Bookings</CardTitle>
                <CardDescription>Latest booking activity</CardDescription>
              </div>
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/all-bookings')}>
                View All <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : stats?.recentBookings.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No recent bookings</p>
            ) : (
              <div className="space-y-4">
                {stats?.recentBookings.map((booking) => (
                  <div
                    key={booking.id}
                    className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/admin/bookings?id=${booking.id}`)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{booking.guest_name}</p>
                      <p className="text-sm text-muted-foreground truncate">{booking.property_name}</p>
                    </div>
                    <div className="flex items-center gap-3 ml-4">
                      <div className="text-right">
                        <p className="text-sm font-medium">R{booking.total_price.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(booking.check_in_date), 'MMM d')}
                        </p>
                      </div>
                      <Badge variant={booking.status === 'confirmed' ? 'default' : 'secondary'}>
                        {booking.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
            <CardDescription>Common administrative tasks</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Button variant="outline" className="justify-start" onClick={() => navigate('/admin/contracts')}>
              <CreditCard className="mr-2 h-4 w-4" />
              Send New Contract
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate('/admin/properties/new')}>
              <Building2 className="mr-2 h-4 w-4" />
              Add New Property
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate('/admin-users')}>
              <Users className="mr-2 h-4 w-4" />
              Manage Users
            </Button>
            <Button variant="outline" className="justify-start" onClick={() => navigate('/admin/onboarding')}>
              <TrendingUp className="mr-2 h-4 w-4" />
              View Onboarding Progress
            </Button>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
