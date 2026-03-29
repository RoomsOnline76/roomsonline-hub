import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRepBankDetails } from "@/hooks/useRepBankDetails";
import { format } from "date-fns";
import { Building2, DollarSign, Landmark, TrendingUp, Users, CalendarDays, ShieldCheck, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface SalesRepDashboardProps {
  salesRepId: string;
}

const statusColors: Record<string, string> = {
  lead: "bg-muted text-muted-foreground",
  contracted: "bg-primary/10 text-primary",
  active: "bg-green-500/10 text-green-600",
  churned: "bg-destructive/10 text-destructive",
  pending: "bg-amber-500/10 text-amber-600",
  approved: "bg-primary/10 text-primary",
  paid: "bg-green-500/10 text-green-600",
};

export function SalesRepDashboard({ salesRepId }: SalesRepDashboardProps) {
  // Fetch rep info
  const { data: repInfo } = useQuery({
    queryKey: ["sales-rep-info", salesRepId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sales_reps")
        .select("display_name, commission_tier, quarterly_target, rep_code")
        .eq("id", salesRepId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch referrals with property names
  const { data: referrals = [], isLoading: referralsLoading } = useQuery({
    queryKey: ["my-referrals", salesRepId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_referrals")
        .select("id, property_id, referral_date, status, converted_at, clawback_until, properties(name, is_active)")
        .eq("rep_id", salesRepId)
        .order("referral_date", { ascending: false });
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch commission reports
  const { data: reports = [], isLoading: reportsLoading } = useQuery({
    queryKey: ["my-commission-reports", salesRepId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rep_commission_reports")
        .select("*")
        .eq("rep_id", salesRepId)
        .order("period_month", { ascending: false })
        .limit(12);
      if (error) throw error;
      return data || [];
    },
  });

  // Banking details
  const { bankDetails, isLoading: bankLoading } = useRepBankDetails(salesRepId);

  const lifetimeEarnings = reports
    .filter((r: any) => r.status === "paid")
    .reduce((sum: number, r: any) => sum + Number(r.total_amount || 0), 0);

  const pendingAmount = reports
    .filter((r: any) => r.status === "pending" || r.status === "approved")
    .reduce((sum: number, r: any) => sum + Number(r.total_amount || 0), 0);

  const latestReport = reports[0];
  const activeReferrals = referrals.filter((r: any) => r.status === "active").length;

  const tierLabel = repInfo?.commission_tier
    ? repInfo.commission_tier.charAt(0).toUpperCase() + repInfo.commission_tier.slice(1)
    : "Base";

  return (
    <div className="space-y-6">
      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Building2 className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Referrals</p>
                <p className="text-2xl font-bold">{activeReferrals}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <DollarSign className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Lifetime Earnings</p>
                <p className="text-2xl font-bold">R{lifetimeEarnings.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-amber-500/10">
                <TrendingUp className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Payout</p>
                <p className="text-2xl font-bold">R{pendingAmount.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Commission Tier</p>
                <p className="text-2xl font-bold">{tierLabel}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* My Referrals */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              My Referrals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {referralsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : referrals.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No referrals yet</p>
            ) : (
              <div className="space-y-3">
                {referrals.map((ref: any) => (
                  <div key={ref.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{(ref.properties as any)?.name || "Unknown Property"}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3" />
                        {format(new Date(ref.referral_date), "dd MMM yyyy")}
                        {ref.converted_at && (
                          <span className="text-green-600">
                            → Converted {format(new Date(ref.converted_at), "dd MMM yyyy")}
                          </span>
                        )}
                      </div>
                    </div>
                    <Badge className={statusColors[ref.status] || "bg-muted text-muted-foreground"} variant="outline">
                      {ref.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Commission Reports */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <DollarSign className="h-5 w-5" />
              Commission Reports
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reportsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : reports.length === 0 ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No commission reports yet</p>
            ) : (
              <div className="space-y-3">
                {reports.slice(0, 6).map((report: any) => (
                  <div key={report.id} className="flex items-center justify-between p-3 rounded-lg border bg-card">
                    <div className="space-y-1">
                      <p className="font-medium text-sm">{report.period_month}</p>
                      <p className="text-xs text-muted-foreground">
                        {report.total_entries} {report.total_entries === 1 ? "entry" : "entries"}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-semibold text-sm">R{Number(report.total_amount || 0).toLocaleString()}</span>
                      <Badge className={statusColors[report.status] || "bg-muted text-muted-foreground"} variant="outline">
                        {report.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Banking Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Landmark className="h-5 w-5" />
            Banking Details
          </CardTitle>
        </CardHeader>
        <CardContent>
          {bankLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : !bankDetails ? (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No banking details on file. Please contact your account manager to set up your banking details.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <p className="text-xs text-muted-foreground">Bank</p>
                <p className="font-medium text-sm">{bankDetails.bank_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Account Holder</p>
                <p className="font-medium text-sm">{bankDetails.account_holder}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Account Number</p>
                <p className="font-medium text-sm font-mono">{bankDetails.account_number_masked || "****"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <div className="flex items-center gap-1.5">
                  {bankDetails.is_verified ? (
                    <>
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      <span className="text-sm text-green-600 font-medium">Verified</span>
                    </>
                  ) : (
                    <>
                      <ShieldAlert className="h-4 w-4 text-amber-500" />
                      <span className="text-sm text-amber-500 font-medium">Pending Verification</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
