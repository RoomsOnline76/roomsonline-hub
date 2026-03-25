import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ArrowLeft, CheckCircle2, Banknote, Eye } from "lucide-react";
import { useCommissionReports, useCommissionEntries, useApproveReport, useMarkReportPaid } from "@/hooks/useRepCommissions";
import { useSalesReps } from "@/hooks/useSalesReps";
import { useAuth } from "@/hooks/useAuth";
import { format } from "date-fns";

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Draft", variant: "outline" },
  pending_approval: { label: "Pending Approval", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  paid: { label: "Paid", variant: "default" },
};

export default function AdminCommissionReports() {
  const navigate = useNavigate();
  const { isDev, isFearlessLeader, isAdmin, loading: authLoading } = useAuth();
  const { data: reports, isLoading } = useCommissionReports();
  const { reps } = useSalesReps();
  const approveReport = useApproveReport();
  const markPaid = useMarkReportPaid();
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [selectedRepId, setSelectedRepId] = useState<string | null>(null);

  const { data: entries, isLoading: entriesLoading } = useCommissionEntries(selectedRepId || undefined);

  if (authLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!isDev && !isFearlessLeader && !isAdmin) {
    navigate("/admin/dashboard");
    return null;
  }

  const getRepName = (repId: string) => reps.find((r) => r.id === repId)?.display_name || "Unknown";

  const handleViewEntries = (report: any) => {
    setSelectedReport(report.id);
    setSelectedRepId(report.rep_id);
  };

  const totalPending = reports?.filter((r) => r.status === "pending_approval").reduce((sum, r) => sum + r.total_amount, 0) ?? 0;
  const totalApproved = reports?.filter((r) => r.status === "approved").reduce((sum, r) => sum + r.total_amount, 0) ?? 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">Commission Reports</h1>
          <p className="text-sm text-muted-foreground">Monthly commission summaries for approval and payment.</p>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Pending Approval</p>
            <p className="text-lg font-bold">R {totalPending.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Approved (Unpaid)</p>
            <p className="text-lg font-bold">R {totalApproved.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Total Reports</p>
            <p className="text-lg font-bold">{reports?.length ?? 0}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground">Active Reps</p>
            <p className="text-lg font-bold">{reps.filter((r) => r.is_active).length}</p>
          </CardContent>
        </Card>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : !reports?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">No commission reports yet. Reports are generated on the 28th of each month.</p>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Reports</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs">Rep</TableHead>
                  <TableHead className="text-xs">Entries</TableHead>
                  <TableHead className="text-xs text-right">Amount</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reports.map((report) => {
                  const badge = STATUS_BADGE[report.status] || { label: report.status, variant: "outline" as const };
                  return (
                    <TableRow key={report.id}>
                      <TableCell className="text-xs">{format(new Date(report.period_month), "MMM yyyy")}</TableCell>
                      <TableCell className="text-xs font-medium">{getRepName(report.rep_id)}</TableCell>
                      <TableCell className="text-xs">{report.total_entries}</TableCell>
                      <TableCell className="text-xs text-right font-mono">R {report.total_amount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                      <TableCell><Badge variant={badge.variant}>{badge.label}</Badge></TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-1 justify-end">
                          <Button variant="ghost" size="sm" onClick={() => handleViewEntries(report)}>
                            <Eye className="h-3 w-3" />
                          </Button>
                          {report.status === "pending_approval" && (
                            <Button variant="ghost" size="sm" onClick={() => approveReport.mutate(report.id)} disabled={approveReport.isPending}>
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                            </Button>
                          )}
                          {report.status === "approved" && (
                            <Button variant="ghost" size="sm" onClick={() => markPaid.mutate(report.id)} disabled={markPaid.isPending}>
                              <Banknote className="h-3 w-3 text-primary" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Entries dialog */}
      <Dialog open={!!selectedReport} onOpenChange={(o) => { if (!o) { setSelectedReport(null); setSelectedRepId(null); } }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-sm">Commission Line Items — {selectedRepId ? getRepName(selectedRepId) : ""}</DialogTitle>
          </DialogHeader>
          {entriesLoading ? (
            <div className="flex items-center justify-center p-8"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : !entries?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No entries found.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs text-right">Revenue</TableHead>
                  <TableHead className="text-xs text-right">Rate</TableHead>
                  <TableHead className="text-xs text-right">Commission</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="text-xs">{format(new Date(entry.period_start), "dd MMM")} – {format(new Date(entry.period_end), "dd MMM yyyy")}</TableCell>
                    <TableCell className="text-xs capitalize">{entry.commission_type.replace("_", " ")}</TableCell>
                    <TableCell className="text-xs text-right font-mono">R {entry.base_revenue.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell className="text-xs text-right">{entry.rate_applied}%</TableCell>
                    <TableCell className="text-xs text-right font-mono font-medium">R {entry.amount.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{entry.status}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
