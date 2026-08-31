import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Download, FileText, RefreshCw } from "lucide-react";
import { RuFeeAuditPanel } from "@/components/integrations/RuFeeAuditPanel";

type Rag = "green" | "amber" | "red" | "grey";

interface CoverageRow {
  key: string;
  area: string;
  label: string;
  ru_method: string;
  direction: "pull" | "push" | "refresh" | "webhook";
  mandatory: boolean;
  implemented: boolean;
  status: "passed" | "failed" | "skipped" | "never_run" | "blocked";
  rag: Rag;
  stale: boolean;
  blocked_upstream?: boolean;
  excluded_from_score?: boolean;
  age_hours: number | null;
  max_age_hours: number | null;
  next_due_at?: string | null;
  detail: string | null;
  last_run_at: string | null;
  source: "cert_run" | "sync_log" | "api_log" | "cache" | "none";
  accounts_used?: number;
  api_calls?: number;
  api_successes?: number;
  last_success_at?: string | null;
  last_attempt_at?: string | null;
  last_attempt_failed?: boolean;
  last_attempt_error?: string | null;
  rolos_surface: string;
  rolos_stream: string;
  rolos_wired: boolean;
  rolos_status: "success" | "failed" | "never_used" | "blocked";
  rolos_last_at: string | null;
  rolos_detail: string | null;
  note: string;
}

interface CoverageSummary {
  adapter: { total: number; passed: number; failed: number; never_run: number; stale: number; blocked?: number; not_implemented: number; percent: number };
  rolos: { total_surfaces: number; exercised: number; failed: number; never_used: number; not_wired: number; percent: number };
  mandatory: { total: number; passed: number };

  generated_at: string;
}

interface Area {
  key: string;
  label: string;
}

const RAG_CLASS: Record<Rag, string> = {
  green: "bg-success/10 text-success border-success/30",
  amber: "bg-warning/10 text-warning border-warning/30",
  red: "bg-destructive/10 text-destructive border-destructive/30",
  grey: "bg-muted text-muted-foreground border-border",
};

const RAG_LABEL: Record<Rag, string> = {
  green: "Pass",
  amber: "Stale",
  red: "Fail",
  grey: "Never run",
};

const ROLOS_CLASS: Record<CoverageRow["rolos_status"], string> = {
  success: "bg-success/10 text-success border-success/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
  blocked: "bg-warning/10 text-warning border-warning/30",
  never_used: "bg-muted text-muted-foreground border-border",
};

const ROLOS_LABEL: Record<CoverageRow["rolos_status"], string> = {
  success: "Integrated · used",
  failed: "Integrated · failing",
  blocked: "Integrated · blocked upstream",
  never_used: "Integrated · not yet used",
};
const SOURCE_LABEL: Record<CoverageRow["source"], string> = {
  cert_run: "certification run",
  sync_log: "live sync log",
  api_log: "live channel call log",
  cache: "populated register",
  none: "no evidence",
};


const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "—");

function ScoreCard({
  title,
  description,
  percent,
  lines,
}: {
  title: string;
  description: string;
  percent: number;
  lines: string[];
}) {
  const tone = percent >= 90 ? "text-success" : percent >= 60 ? "text-warning" : "text-destructive";
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        <div className={`text-3xl font-mono ${tone}`}>{percent}%</div>
        <Progress value={percent} />
        <ul className="text-xs text-muted-foreground space-y-0.5">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

export function RuCoverageTab() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<CoverageRow[]>([]);
  const [areas, setAreas] = useState<Area[]>([]);
  const [summary, setSummary] = useState<CoverageSummary | null>(null);
  const [exporting, setExporting] = useState<"json" | "pdf" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "coverage_matrix" },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error?.message ?? "Failed to load coverage");
      setRows(data.rows ?? []);
      setAreas(data.areas ?? []);
      setSummary(data.summary ?? null);
    } catch (e) {
      toast.error("Could not load the coverage matrix", {
        description: e instanceof Error ? e.message : String(e),
      });
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const grouped = useMemo(
    () => areas.map((a) => ({ ...a, rows: rows.filter((r) => r.area === a.key) })).filter((g) => g.rows.length > 0),
    [areas, rows],
  );

  const fetchEvidence = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
      body: { action: "coverage_evidence" },
    });
    if (error) throw error;
    if (!data?.success) throw new Error(data?.error?.message ?? "Failed to build evidence bundle");
    return data.evidence as Record<string, unknown>;
  }, []);

  const downloadJson = useCallback(async () => {
    setExporting("json");
    try {
      const evidence = await fetchEvidence();
      const blob = new Blob([JSON.stringify(evidence, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ru-integration-evidence-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Evidence bundle downloaded");
    } catch (e) {
      toast.error("Evidence export failed", { description: e instanceof Error ? e.message : String(e) });
    }
    setExporting(null);
  }, [fetchEvidence]);

  const downloadPdf = useCallback(async () => {
    setExporting("pdf");
    try {
      const evidence = (await fetchEvidence()) as {
        generated_at: string;
        integration: string;
        summary: CoverageSummary;
        areas: Area[];
        endpoints: CoverageRow[];
      };
      const [{ jsPDF }, autoTableMod] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
      const autoTable = (autoTableMod as unknown as { default: (doc: unknown, opts: unknown) => void }).default;

      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(16);
      doc.text("Rentals United — integration compliance status", 40, 40);
      doc.setFontSize(9);
      doc.text(evidence.integration, 40, 58);
      doc.text(`Generated ${new Date(evidence.generated_at).toLocaleString()} · ROL'OS PMS`, 40, 72);

      doc.setFontSize(11);
      doc.text(
        `RU adapter compliance: ${evidence.summary.adapter.percent}% (${evidence.summary.adapter.passed}/${evidence.summary.adapter.total} endpoints passing)`,
        40,
        96,
      );
      doc.text(
        `ROL'OS integration compliance: ${evidence.summary.rolos.percent}% (${evidence.summary.rolos.exercised}/${evidence.summary.rolos.total_surfaces} surfaces exercised)`,
        40,
        112,
      );
      doc.text(
        `Mandatory endpoints passing: ${evidence.summary.mandatory.passed}/${evidence.summary.mandatory.total}`,
        40,
        128,
      );

      let cursor = 148;
      for (const area of evidence.areas) {
        const areaRows = evidence.endpoints.filter((r) => r.area === area.key);
        if (areaRows.length === 0) continue;
        if (cursor > 470) {
          doc.addPage();
          cursor = 48;
        }
        doc.setFontSize(11);
        doc.text(area.label, 40, cursor);
        autoTable(doc, {
          startY: cursor + 10,
          head: [["RU method", "Dir.", "RU result", "Last RU call", "ROL'OS surface / stream", "ROL'OS status"]],
          body: areaRows.map((r) => [
            `${r.label}\n${r.ru_method}${r.mandatory ? " (mandatory)" : ""}`,
            r.direction,
            RAG_LABEL[r.rag],
            fmt(r.last_run_at),
            `${r.rolos_surface}\n${r.rolos_stream}`,
            r.rolos_wired ? ROLOS_LABEL[r.rolos_status] : "Not wired",
          ]),
          styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
          headStyles: { fillColor: [233, 30, 140] },
          columnStyles: { 0: { cellWidth: 175 }, 1: { cellWidth: 34 }, 2: { cellWidth: 52 }, 3: { cellWidth: 100 }, 4: { cellWidth: 200 } },
          margin: { left: 40, right: 40 },
          theme: "grid",
        });
        cursor = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 26;
      }


      const problems = evidence.endpoints.filter((r) => r.rag !== "green");
      doc.addPage();
      doc.setFontSize(13);
      doc.text("Outstanding items", 40, 40);
      if (problems.length === 0) {
        doc.setFontSize(9);
        doc.text("None — every implemented endpoint last succeeded within its refresh window.", 40, 60);
      } else {
        autoTable(doc, {
          startY: 56,
          head: [["RU method", "State", "Detail", "ROL'OS status"]],
          body: problems.map((r) => [
            r.ru_method,
            RAG_LABEL[r.rag],
            r.detail ?? "—",
            r.rolos_wired ? ROLOS_LABEL[r.rolos_status] : "Not wired",
          ]),
          styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
          headStyles: { fillColor: [233, 30, 140] },
          margin: { left: 40, right: 40 },
          theme: "grid",
        });
      }

      doc.save(`ru-integration-status-${new Date().toISOString().slice(0, 10)}.pdf`);
      toast.success("Status PDF downloaded");
    } catch (e) {
      toast.error("PDF export failed", { description: e instanceof Error ? e.message : String(e) });
    }
    setExporting(null);
  }, [fetchEvidence]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-base font-medium">Endpoint &amp; integration coverage</h3>
          <p className="text-xs text-muted-foreground">
            Every Rentals United method the adapter implements, its last push/pull/refresh result, and where it is wired
            into the ROL&apos;OS PMS.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="ghost" onClick={load} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Refresh
          </Button>
          <Button size="sm" variant="outline" onClick={downloadJson} disabled={exporting !== null} className="gap-1.5">
            <Download className="h-3.5 w-3.5" /> {exporting === "json" ? "Building…" : "Evidence (JSON)"}
          </Button>
          <Button size="sm" onClick={downloadPdf} disabled={exporting !== null} className="gap-1.5">
            <FileText className="h-3.5 w-3.5" /> {exporting === "pdf" ? "Building…" : "Status (PDF)"}
          </Button>
        </div>
      </div>

      {summary && (
        <div className="grid gap-3 md:grid-cols-2">
          <ScoreCard
            title="RU adapter compliance"
            description="Implemented RU endpoints whose last call succeeded"
            percent={summary.adapter.percent}
            lines={[
              `${summary.adapter.passed}/${summary.adapter.total} passing · ${summary.adapter.failed} failing · ${summary.adapter.never_run} never run`,
              `${summary.adapter.stale} outside their refresh window · ${summary.adapter.not_implemented} not implemented`,
              `${summary.adapter.blocked ?? 0} blocked upstream (excluded from score) · Mandatory: ${summary.mandatory.passed}/${summary.mandatory.total}`,
            ]}

          />
          <ScoreCard
            title="ROL'OS integration compliance"
            description="ROL'OS surfaces wired to RU that have actually been exercised"
            percent={summary.rolos.percent}
            lines={[
              `${summary.rolos.exercised}/${summary.rolos.total_surfaces} exercised · ${summary.rolos.failed} failing`,
              `${summary.rolos.never_used} wired but never used · ${summary.rolos.not_wired} not wired`,
              `Snapshot ${fmt(summary.generated_at)}`,
            ]}
          />
        </div>
      )}

      <RuFeeAuditPanel />



      {grouped.map((group) => (
        <Card key={group.key}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">{group.label}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {group.rows.map((r) => (
              <div key={r.key} className="rounded-md border p-3 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{r.label}</span>
                      {r.mandatory && (
                        <Badge variant="outline" className="text-[10px]">
                          Mandatory
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px] uppercase">
                        {r.direction}
                      </Badge>
                    </div>
                    <code className="text-[11px] text-muted-foreground break-all">{r.ru_method}</code>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge variant="outline" className={`text-[10px] ${RAG_CLASS[r.rag]}`}>
                      RU: {r.status === "blocked" ? "Blocked upstream" : RAG_LABEL[r.rag]}
                    </Badge>
                    {r.last_attempt_failed && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600">
                        Last attempt failed
                      </Badge>
                    )}
                    {r.excluded_from_score && (
                      <Badge variant="outline" className="text-[10px]">
                        Excluded from score
                      </Badge>
                    )}
                    <Badge
                      variant="outline"
                      className={`text-[10px] ${r.rolos_wired ? ROLOS_CLASS[r.rolos_status] : RAG_CLASS.grey}`}
                    >
                      {r.rolos_wired ? ROLOS_LABEL[r.rolos_status] : "Not wired"}
                    </Badge>
                  </div>

                </div>

                <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                  <div>
                    <span className="text-foreground">ROL&apos;OS surface:</span> {r.rolos_surface}
                    <div className="text-[11px]">Stream: {r.rolos_stream}</div>
                  </div>
                  <div>
                    <div>
                      Last successful RU call: {fmt(r.last_success_at ?? r.last_run_at)}
                      {r.source !== "none" && ` (${SOURCE_LABEL[r.source]})`}
                    </div>
                    {!!r.api_calls && (
                      <div className="text-[11px]">
                        {r.api_successes ?? 0} of {r.api_calls} logged channel calls succeeded
                        {r.accounts_used ? ` across ${r.accounts_used} sub-account${r.accounts_used > 1 ? "s" : ""}` : ""}
                      </div>
                    )}
                    {r.last_attempt_failed && r.last_attempt_error && (
                      <div className="text-[11px] text-amber-600">Latest attempt: {r.last_attempt_error}</div>
                    )}
                    <div>Last ROL&apos;OS use: {fmt(r.rolos_last_at)}</div>
                    {r.max_age_hours != null && <div>Refresh window: {r.max_age_hours}h</div>}
                  </div>
                </div>

                {(r.detail || r.note) && (
                  <p className="text-[11px] text-muted-foreground">{r.detail ?? r.note}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
