/**
 * Admin → Commission Statements.
 *
 * The single surface for referral partner pay: run a month, review each
 * payout statement, approve (which locks it and mints its reference), then pay.
 */
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Eye, Loader2, RefreshCw, Search } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useSalesReps } from "@/hooks/useSalesReps";
import { useCommissionStatements } from "@/hooks/useCommissionStatements";
import { CommissionStatementRun } from "@/components/commission/CommissionStatementRun";
import { CommissionStatementDetailDialog } from "@/components/commission/CommissionStatementDetail";
import {
  COMMISSION_STATUS_CLASSES,
  COMMISSION_STATUS_LABELS,
  fmtMoney,
  monthLabel,
  type CommissionStatement,
  type CommissionStatementStatus,
} from "@/lib/commissionStatement";

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending_approval", label: "Awaiting approval" },
  { value: "approved", label: "Approved" },
  { value: "paid", label: "Paid" },
  { value: "void", label: "Void" },
];

export default function AdminCommissionReports() {
  const navigate = useNavigate();
  const { isDev, isFearlessLeader, isAdmin, loading: authLoading } = useAuth();
  const { reps } = useSalesReps();
  const {
    statements, loading, vat, busy, stats, reload,
    preview, generate, approve, markPaid, voidStatement,
  } = useCommissionStatements();

  const [selected, setSelected] = useState<CommissionStatement | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return statements.filter((s) => {
      if (statusFilter !== "all" && s.status !== statusFilter) return false;
      if (!term) return true;
      return [s.rep_name, s.rep_code, s.statement_reference, monthLabel(s.period_month)]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(term));
    });
  }, [statements, statusFilter, search]);

  if (authLoading) {
    return <div className="flex items-center justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (!isDev && !isFearlessLeader && !isAdmin) {
    navigate("/admin/dashboard");
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1">
          <h1 className="text-xl font-bold">Commission Statements</h1>
          <p className="text-sm text-muted-foreground">
            Referral partner commission payouts — per property, per period, with the rate applied and its source.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={reload}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Stat label="Awaiting approval" value={fmtMoney(stats.awaitingApproval)} />
        <Stat label="Approved, unpaid" value={fmtMoney(stats.approvedUnpaid)} />
        <Stat label="Paid to date" value={fmtMoney(stats.paidToDate)} />
        <Stat label="Active partners" value={String(reps.filter((r) => r.is_active).length)} />
      </div>

      <CommissionStatementRun busy={busy} onPreview={preview} onGenerate={generate} />

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3 pb-2">
          <CardTitle className="text-sm">Statements</CardTitle>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Partner or reference"
                className="h-9 w-[220px] pl-8"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="h-9 w-[170px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {STATUS_FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
          ) : filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No statements yet — run a period above to generate the first payout statements.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Period</TableHead>
                  <TableHead className="text-xs">Partner</TableHead>
                  <TableHead className="text-xs">Reference</TableHead>
                  <TableHead className="text-xs text-right">Properties</TableHead>
                  <TableHead className="text-xs text-right">ROL revenue</TableHead>
                  <TableHead className="text-xs text-right">Net payout</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs text-right">Open</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((s) => (
                  <TableRow key={s.id} className="cursor-pointer" onClick={() => setSelected(s)}>
                    <TableCell className="text-xs">{monthLabel(s.period_month)}</TableCell>
                    <TableCell className="text-xs font-medium">
                      {s.rep_name || "Unknown"}
                      {s.rep_code && <span className="ml-2 text-muted-foreground">{s.rep_code}</span>}
                    </TableCell>
                    <TableCell className="font-mono text-[11px]">{s.statement_reference || "—"}</TableCell>
                    <TableCell className="text-right text-xs">{s.property_count}</TableCell>
                    <TableCell className="text-right font-mono text-xs">{fmtMoney(s.total_revenue)}</TableCell>
                    <TableCell className="text-right font-mono text-xs font-semibold">{fmtMoney(s.net_payable)}</TableCell>
                    <TableCell>
                      <Badge className={COMMISSION_STATUS_CLASSES[s.status as CommissionStatementStatus]}>
                        {COMMISSION_STATUS_LABELS[s.status as CommissionStatementStatus] || s.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setSelected(s); }}>
                        <Eye className="h-3.5 w-3.5" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CommissionStatementDetailDialog
        statement={selected}
        vat={vat}
        busy={busy}
        onClose={() => setSelected(null)}
        onApprove={async (id) => { await approve(id); setSelected(null); }}
        onMarkPaid={async (id, ref) => { await markPaid(id, ref); setSelected(null); }}
        onVoid={async (id, reason) => { await voidStatement(id, reason); setSelected(null); }}
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-lg font-bold">{value}</p>
      </CardContent>
    </Card>
  );
}
