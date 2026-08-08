/**
 * Commission statement run — pick a month, preview what the engine found, then
 * generate the draft paysheets. Preview writes nothing, so it is safe to poke.
 */
import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info, Loader2, Play, Search } from "lucide-react";
import {
  COMMISSION_BASIS_NOTE,
  COMMISSION_TYPE_LABELS,
  RATE_SOURCE_LABELS,
  fmtMoney,
  monthLabel,
  previousMonthKey,
  recentMonthKeys,
} from "@/lib/commissionStatement";
import type { CommissionPreviewStatement } from "@/hooks/useCommissionStatements";

interface Props {
  busy: string | null;
  onPreview: (periodMonth: string) => Promise<CommissionPreviewStatement[] | null>;
  onGenerate: (periodMonth: string) => Promise<unknown>;
}

export function CommissionStatementRun({ busy, onPreview, onGenerate }: Props) {
  const [period, setPeriod] = useState(previousMonthKey());
  const [preview, setPreview] = useState<CommissionPreviewStatement[] | null>(null);
  const months = recentMonthKeys(15);

  const runPreview = async () => {
    setPreview(await onPreview(period));
  };

  const runGenerate = async () => {
    await onGenerate(period);
    setPreview(null);
  };

  const previewTotal = (preview || []).reduce((t, s) => t + s.net_payable, 0);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Statement run</CardTitle>
        <CardDescription>
          Generates one paysheet per active referral partner for the selected month.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Period</p>
            <Select value={period} onValueChange={(v) => { setPeriod(v); setPreview(null); }}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>{monthLabel(m)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" onClick={runPreview} disabled={busy === "preview"}>
            {busy === "preview" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Preview
          </Button>
          <Button onClick={runGenerate} disabled={busy === "generate"}>
            {busy === "generate" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
            Generate statements
          </Button>
        </div>

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">{COMMISSION_BASIS_NOTE}</AlertDescription>
        </Alert>

        {preview && (
          preview.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No commissionable revenue for {monthLabel(period)}.
            </p>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {preview.length} partner{preview.length === 1 ? "" : "s"} · {monthLabel(period)}
                </span>
                <span className="font-semibold">{fmtMoney(previewTotal)}</span>
              </div>
              {preview.map((s) => (
                <div key={s.rep_id} className="rounded-lg border">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">
                        {s.rep_name}
                        {s.rep_code ? <span className="ml-2 text-xs text-muted-foreground">{s.rep_code}</span> : null}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {s.property_count} propert{s.property_count === 1 ? "y" : "ies"} · revenue {fmtMoney(s.total_revenue)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">{fmtMoney(s.net_payable)}</p>
                      {!s.bank?.account_number_masked && (
                        <Badge variant="destructive" className="text-[10px]">Banking missing</Badge>
                      )}
                    </div>
                  </div>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">Property</TableHead>
                        <TableHead className="text-xs">Basis</TableHead>
                        <TableHead className="text-xs text-right">ROL revenue</TableHead>
                        <TableHead className="text-xs text-right">Rate</TableHead>
                        <TableHead className="text-xs text-right">Commission</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {s.lines.map((l, i) => (
                        <TableRow key={`${s.rep_id}-${l.property_id}-${i}`}>
                          <TableCell className="text-xs">
                            {l.property_name}
                            {l.line_kind === "clawback" && (
                              <Badge variant="destructive" className="ml-2 text-[10px]">Clawback</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {COMMISSION_TYPE_LABELS[l.commission_type] || l.commission_type}
                            {l.rate_source ? ` · ${RATE_SOURCE_LABELS[l.rate_source] || l.rate_source}` : ""}
                          </TableCell>
                          <TableCell className="text-right font-mono text-xs">{fmtMoney(l.base_revenue)}</TableCell>
                          <TableCell className="text-right text-xs">{l.rate_applied ? `${l.rate_applied}%` : "—"}</TableCell>
                          <TableCell className="text-right font-mono text-xs font-medium">{fmtMoney(l.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ))}
            </div>
          )
        )}
      </CardContent>
    </Card>
  );
}
