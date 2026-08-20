import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertCircle, CheckCircle2, Loader2, PlayCircle, RefreshCw } from "lucide-react";

/**
 * Outbound booking read-back certification.
 *
 * Every other check here proves the channel can reach us. This one proves the opposite
 * direction end to end: a synthetic far-future stay is pushed to the channel, then each change
 * kind (dates, guest count, price) is pushed and pulled back, and finally cancelled and pulled
 * back. It runs in the background at one channel call per minute so it never inflates the live
 * call volume, and the steps stream in as they complete.
 */

interface ReadbackStep {
  step: number;
  name: string;
  ru_method: string;
  status: "passed" | "failed" | "skipped";
  duration_ms: number;
  detail?: string | null;
}

interface ReadbackRun {
  id: string;
  status: string;
  started_at: string;
  finished_at: string | null;
  passed: number;
  failed: number;
  total: number;
  ru_property_id: string | null;
  steps: ReadbackStep[];
}

export function RuBookingReadbackCard({ propertyId }: { propertyId: string }) {
  const [starting, setStarting] = useState(false);
  const [run, setRun] = useState<ReadbackRun | null>(null);
  const [loading, setLoading] = useState(false);
  const pollRef = useRef<number | null>(null);

  const loadLatest = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("ru_cert_runs")
        .select("id, status, started_at, finished_at, passed, failed, total, ru_property_id, steps")
        .eq("suite", "booking_readback")
        .eq("property_id", propertyId)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      setRun(
        data
          ? ({ ...data, steps: Array.isArray(data.steps) ? (data.steps as unknown as ReadbackStep[]) : [] } as ReadbackRun)
          : null,
      );
    } catch (e) {
      console.warn("[ru readback] could not load runs:", e);
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => {
    loadLatest();
  }, [loadLatest]);

  // While a run is in flight, refresh every 20s so the steps appear as the channel answers.
  useEffect(() => {
    if (run?.status !== "running") {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
      return;
    }
    pollRef.current = window.setInterval(loadLatest, 20_000);
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = null;
    };
  }, [run?.status, loadLatest]);

  const start = useCallback(async () => {
    if (!propertyId) return;
    setStarting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "booking_readback_test", property_id: propertyId },
      });
      if (error || !data?.success) {
        throw new Error(error?.message || data?.error?.message || "Could not start the read-back test");
      }
      toast.success("Read-back test started", {
        description: "It paces itself at one channel call per minute — allow about 12 minutes.",
      });
      await loadLatest();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start the read-back test");
    } finally {
      setStarting(false);
    }
  }, [propertyId, loadLatest]);

  const running = run?.status === "running";

  return (
    <Card>
      <CardHeader className="pb-3 flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-base flex items-center gap-2">
            <PlayCircle className="h-4 w-4 text-primary" />
            Outbound booking read-back
          </CardTitle>
          <CardDescription>
            Pushes a synthetic stay ~2 years out to the channel, then changes the dates, the guest count
            and the price — reading the reservation back from the channel after every push — and finally
            cancels it and confirms it is gone. Paced at one channel call per minute and removed
            afterwards, so it never touches real inventory.
          </CardDescription>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={loadLatest} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button size="sm" onClick={start} disabled={starting || running || !propertyId}>
            {starting || running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {running ? "Running" : "Run read-back test"}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!run ? (
          <p className="text-sm text-muted-foreground">
            No read-back test has been run for this property yet.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              {run.status === "passed" ? (
                <Badge className="gap-1"><CheckCircle2 className="h-3 w-3" /> Channel matches every push</Badge>
              ) : run.status === "running" ? (
                <Badge variant="outline" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Running</Badge>
              ) : (
                <Badge variant="destructive" className="gap-1"><AlertCircle className="h-3 w-3" /> Mismatch</Badge>
              )}
              <span className="text-xs text-muted-foreground">
                {new Date(run.started_at).toLocaleString()} · {run.passed} passed
                {run.failed > 0 ? ` · ${run.failed} failed` : ""}
                {run.ru_property_id ? ` · listing ${run.ru_property_id}` : ""}
              </span>
            </div>

            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">#</TableHead>
                  <TableHead>Step</TableHead>
                  <TableHead>Channel method</TableHead>
                  <TableHead>Result</TableHead>
                  <TableHead>Detail</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {run.steps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-sm text-muted-foreground">
                      Waiting for the first channel call…
                    </TableCell>
                  </TableRow>
                ) : (
                  run.steps.map((s) => (
                    <TableRow key={`${s.step}-${s.name}`}>
                      <TableCell>{s.step}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.ru_method}</TableCell>
                      <TableCell>
                        {s.status === "passed" ? (
                          <Badge variant="outline" className="gap-1"><CheckCircle2 className="h-3 w-3" /> Pass</Badge>
                        ) : s.status === "skipped" ? (
                          <Badge variant="outline">Skipped</Badge>
                        ) : (
                          <Badge variant="destructive">Fail</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{s.detail ?? "—"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
