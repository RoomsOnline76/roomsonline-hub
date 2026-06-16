import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CheckCircle2, XCircle, Loader2, Download, ExternalLink, ShieldCheck } from "lucide-react";

interface Step {
  step: number;
  name: string;
  status: "passed" | "failed" | "skipped";
  hg_calls?: number;
  duration_ms?: number;
  detail?: string;
}

interface RunSummary {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  passed: number;
  total: number;
}

const SANDBOX_HOTEL_ID = "19912";

export default function HyperGuestCertificationPortal() {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [validated, setValidated] = useState<null | boolean>(null);
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [running, setRunning] = useState(false);
  const [currentRun, setCurrentRun] = useState<any | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invoke = useCallback(
    async (action: string, extra: Record<string, unknown> = {}) => {
      const { data, error } = await supabase.functions.invoke("hyperguest-cert-portal", {
        body: { action, token, ...extra },
      });
      if (error) throw new Error(error.message);
      return data;
    },
    [token]
  );

  // Validate token + load run history
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) {
        setValidated(false);
        return;
      }
      try {
        await invoke("validate");
        if (cancelled) return;
        setValidated(true);
        const list = await invoke("list_runs");
        if (cancelled) return;
        setRuns(list?.runs ?? []);
      } catch (e: any) {
        if (cancelled) return;
        setValidated(false);
        setError(e?.message ?? "Token validation failed");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, invoke]);

  const handleRun = useCallback(async () => {
    setRunning(true);
    setError(null);
    setCurrentRun(null);
    try {
      const out = await invoke("run_certification");
      setCurrentRun(out?.result?.data ?? null);
      const list = await invoke("list_runs");
      setRuns(list?.runs ?? []);
    } catch (e: any) {
      setError(e?.message ?? "Run failed");
    } finally {
      setRunning(false);
    }
  }, [invoke]);

  const handleDownload = useCallback(
    async (runId: string) => {
      try {
        const out = await invoke("get_run", { run_id: runId });
        const blob = new Blob([JSON.stringify(out?.run ?? {}, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `hyperguest-cert-${runId}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e: any) {
        setError(e?.message ?? "Download failed");
      }
    },
    [invoke]
  );

  const steps: Step[] = useMemo(() => currentRun?.steps ?? [], [currentRun]);

  if (validated === null) {
    return (
      <div className="container max-w-4xl mx-auto py-16 space-y-4">
        <Skeleton className="h-12 w-2/3" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!validated) {
    return (
      <div className="container max-w-2xl mx-auto py-16">
        <Card>
          <CardHeader>
            <CardTitle>Access required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p>
              This page is reserved for HyperGuest&apos;s certification team. Please open the URL
              you received from ROLOS — it must include a valid <code>?token=...</code> parameter.
            </p>
            {error && <p className="text-destructive">{error}</p>}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto py-10 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-3xl font-serif tracking-tight">HyperGuest Certification</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Sandbox hotel <Badge variant="secondary">{SANDBOX_HOTEL_ID}</Badge> · 12-step booking matrix
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to={`/hyperguest/certification/reflection?token=${token}`}>
              <ExternalLink className="h-4 w-4 mr-2" /> Reflection inspector
            </Link>
          </Button>
          <Button onClick={handleRun} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
            {running ? "Running 12 tests…" : "Run all 12 tests"}
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Current run</CardTitle>
        </CardHeader>
        <CardContent>
          {!currentRun && !running && (
            <p className="text-sm text-muted-foreground">
              Click <strong>Run all 12 tests</strong> above to execute the certification matrix
              against sandbox hotel {SANDBOX_HOTEL_ID}. The run typically completes in 1–3 minutes.
            </p>
          )}
          {running && !currentRun && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Executing 12-step booking matrix. HyperGuest
              booking responses can take up to 300 s each.
            </div>
          )}
          {currentRun && (
            <div className="space-y-2">
              <div className="grid gap-2">
                {steps.map((s) => (
                  <div
                    key={s.step}
                    className="flex items-center justify-between border rounded-md px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3">
                      {s.status === "passed" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      ) : s.status === "failed" ? (
                        <XCircle className="h-4 w-4 text-destructive" />
                      ) : (
                        <span className="h-4 w-4 rounded-full border border-muted" />
                      )}
                      <span className="font-mono text-xs text-muted-foreground">#{s.step}</span>
                      <span>{s.name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground">
                      {typeof s.hg_calls === "number" && <span>{s.hg_calls} HG calls</span>}
                      {typeof s.duration_ms === "number" && <span>{s.duration_ms} ms</span>}
                    </div>
                  </div>
                ))}
              </div>
              {currentRun.export_ready && runs[0] && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleDownload(runs[0].id)}
                  className="mt-3"
                >
                  <Download className="h-4 w-4 mr-2" /> Export full booking process logs (JSON)
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Last 10 runs</CardTitle>
        </CardHeader>
        <CardContent>
          {runs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No runs yet.</p>
          ) : (
            <div className="space-y-1.5">
              {runs.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center justify-between text-sm border rounded-md px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <Badge
                      variant={r.status === "passed" ? "default" : r.status === "failed" ? "destructive" : "secondary"}
                    >
                      {r.status}
                    </Badge>
                    <span className="font-mono text-xs">{r.passed}/{r.total}</span>
                    <span className="text-muted-foreground text-xs">
                      {new Date(r.started_at).toLocaleString()}
                    </span>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleDownload(r.id)}>
                    <Download className="h-3.5 w-3.5 mr-1" /> Logs
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notes for the HyperGuest QA team</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>
            All bookings are placed against your sandbox hotel <strong>{SANDBOX_HOTEL_ID}</strong>.
            No live payment is captured — the certification flow uses test-card details.
          </p>
          <p>
            ROLOS waits the full 300 s HyperGuest booking timeout and falls back to the Booking List
            API to reconcile any ambiguous responses (timeout, network error, or HTTP 5xx).
          </p>
          <p>
            For details on how cancellation policies, board bases, taxes &amp; fees, remarks, special
            requests, photos, and facilities are reflected in our system, open the{" "}
            <strong>Reflection inspector</strong>.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
