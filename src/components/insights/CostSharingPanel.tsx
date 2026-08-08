import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Download, FileText, Lock, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AddContributionModal } from "./AddContributionModal";
import { openInvoiceDocument } from "./InvoiceDocumentField";
import {
  computeCostShare,
  formatZar,
  contributorName,
  DEFAULT_COST_SHARE_CONFIG,
  type CostShareConfig,
  type Contribution,
} from "@/lib/costSharing";
import { downloadCostShareStatement } from "@/lib/costShareStatementPdf";
import type { BurnInvoice, FxRates } from "@/lib/burnRate";
import { useAuth } from "@/hooks/useAuth";

interface CostSharingPanelProps {
  allInvoices: BurnInvoice[];
  periodInvoices: BurnInvoice[];
  fxRates: FxRates;
  dateRange?: { start: string; end: string };
}

const OWNER_EMAIL = "dev@roomsonline.co.za";

export function CostSharingPanel({
  allInvoices,
  periodInvoices,
  fxRates,
  dateRange,
}: CostSharingPanelProps) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const isOwner = (user?.email ?? "").toLowerCase() === OWNER_EMAIL;

  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: config } = useQuery({
    queryKey: ["rol-cost-share-config"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rol_cost_share_config")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data as CostShareConfig | null) ?? DEFAULT_COST_SHARE_CONFIG;
    },
  });

  const { data: contributions } = useQuery({
    queryKey: ["rol-contributions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rol_contributions")
        .select("*")
        .order("contribution_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const effectiveConfig: CostShareConfig = config ?? DEFAULT_COST_SHARE_CONFIG;

  const updateConfig = useMutation({
    mutationFn: async (patch: Partial<CostShareConfig> & { commissioned_at?: string | null }) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("rol_cost_share_config")
        .update({ ...patch, updated_by: userData.user?.id ?? null })
        .eq("singleton", true);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rol-cost-share-config"] });
      toast.success("Cost sharing updated");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const removeContribution = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("rol_contributions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["rol-contributions"] });
      toast.success("Contribution removed");
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const summary = useMemo(
    () =>
      computeCostShare({
        periodInvoices,
        allInvoices,
        contributions: (contributions ?? []) as Contribution[],
        config: effectiveConfig,
        fx: fxRates,
      }),
    [periodInvoices, allInvoices, contributions, effectiveConfig, fxRates],
  );

  const handleDownload = () => {
    downloadCostShareStatement({
      periodInvoices,
      contributions: (contributions ?? []) as Contribution[],
      summary,
      fx: fxRates,
      periodStart: dateRange?.start,
      periodEnd: dateRange?.end,
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">
              Settlement basis — {effectiveConfig.roomsonline_pct}/{effectiveConfig.partner_pct} split
            </CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">
              Applies to platform build expenses until app commissioning is complete.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Switch
                id="split-active"
                checked={effectiveConfig.split_active}
                disabled={!isOwner || updateConfig.isPending}
                onCheckedChange={(checked) => updateConfig.mutate({ split_active: checked })}
              />
              <Label htmlFor="split-active" className="cursor-pointer text-sm">
                Split active
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="commissioned"
                checked={effectiveConfig.commissioning_complete}
                disabled={!isOwner || updateConfig.isPending}
                onCheckedChange={(checked) =>
                  updateConfig.mutate({
                    commissioning_complete: checked,
                    commissioned_at: checked ? new Date().toISOString() : null,
                    ...(checked ? { split_active: false } : {}),
                  })
                }
              />
              <Label htmlFor="commissioned" className="cursor-pointer text-sm">
                Commissioning complete
              </Label>
            </div>
          </div>
        </CardHeader>
        {!isOwner && (
          <CardContent className="pt-0">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              Read-only — the split can only be activated by {OWNER_EMAIL}.
            </p>
          </CardContent>
        )}
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="Accumulative spend (all time)" value={formatZar(summary.allTimeSpendZar)} />
        <SummaryCard label="Spend in selected period" value={formatZar(summary.periodSpendZar)} />
        <SummaryCard
          label={`RoomsOnline share (${summary.roomsonlinePct}%)`}
          value={formatZar(summary.roomsonlineAllocationZar)}
          hint={`Contributed ${formatZar(summary.carikeContributedZar)}`}
        />
        <SummaryCard
          label="Outstanding"
          value={formatZar(summary.roomsonlineOutstandingZar)}
          accent
          hint={`Partner ${summary.partnerPct}% settled: ${formatZar(summary.partnerAllocationZar)}`}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">Funds contributed</CardTitle>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleDownload}>
              <Download className="mr-2 h-4 w-4" />
              Consolidated statement (PDF)
            </Button>
            {isOwner && (
              <Button
                onClick={() => {
                  setEditing(null);
                  setModalOpen(true);
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Capture contribution
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Contributor</TableHead>
                  <TableHead>Method / Ref</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">ZAR</TableHead>
                  <TableHead className="w-[110px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {(contributions ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No contributions captured yet.
                    </TableCell>
                  </TableRow>
                ) : (
                  (contributions ?? []).map((c) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.contribution_date}</TableCell>
                      <TableCell>
                        {c.contributor_name || contributorName(c.contributor_key)}
                        <Badge variant="outline" className="ml-2 text-[10px]">
                          {c.contributor_key === "dawie" ? "Partner" : "RoomsOnline"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {[c.method, c.reference].filter(Boolean).join(" · ") || "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {c.source_currency} {Number(c.amount).toLocaleString("en-ZA", { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatZar(Number(c.amount_zar))}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1">
                          {c.document_path && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="Open proof of payment"
                              onClick={() => void openInvoiceDocument(c.document_path)}
                            >
                              <FileText className="h-4 w-4" />
                            </Button>
                          )}
                          {isOwner && (
                            <>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={() => {
                                  setEditing(c);
                                  setModalOpen(true);
                                }}
                              >
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-destructive"
                                onClick={() => removeContribution.mutate(c.id)}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-4 grid gap-2 border-t pt-4 text-sm sm:grid-cols-3">
            <p className="text-muted-foreground">
              Total contributed:{" "}
              <span className="font-medium text-foreground">{formatZar(summary.totalContributedZar)}</span>
            </p>
            <p className="text-muted-foreground">
              Dawie:{" "}
              <span className="font-medium text-foreground">{formatZar(summary.dawieContributedZar)}</span>
            </p>
            <p className="text-muted-foreground">
              Carike:{" "}
              <span className="font-medium text-foreground">{formatZar(summary.carikeContributedZar)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      <AddContributionModal
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open);
          if (!open) setEditing(null);
        }}
        editing={editing}
        fxRates={fxRates}
      />
    </div>
  );
}

function SummaryCard({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className={`mt-1 text-xl font-semibold ${accent ? "text-primary" : ""}`}>{value}</p>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}
