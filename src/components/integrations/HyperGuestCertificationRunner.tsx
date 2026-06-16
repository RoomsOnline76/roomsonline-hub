import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, CircleDot, Download, Loader2, PlayCircle, XCircle } from "lucide-react";

interface CertStep {
  step: number;
  kind: "setup" | "test";
  test?: number;
  name: string;
  status: "pass" | "fail" | "skip";
  duration_ms: number;
  summary?: string;
  error?: string;
  reservation_id?: string;
  requests?: any[];
}

interface CertResult {
  hotel_code: string;
  environment: string;
  setup_steps: CertStep[];
  booking_tests: CertStep[];
  booked_reservations?: Array<{ id: string; test: number }>;
  passed: number;
  failed: number;
  total: number;
  export_ready: boolean;
  full_log: any | null;
}

export function HyperGuestCertificationRunner() {
  const [hotelId, setHotelId] = useState("19912");
  const [environment, setEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CertResult | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const run = async () => {
    setRunning(true);
    setResult(null);
    setErrorMsg(null);
    try {
      const { data, error } = await supabase.functions.invoke("hyperguest-api", {
        body: { action: "run_certification", hotel_id: hotelId.trim() || undefined, environment },
      });
      if (error) throw error;
      if (data?.success === false) throw new Error(data?.error?.message || "Certification failed to start");
      const payload: CertResult = data?.data ?? null;
      setResult(payload);
      if (payload?.export_ready) {
        toast.success(`Certification complete — 12/12 booking tests passed. Full log ready to export.`);
      } else if (payload) {
        toast.warning(`Certification finished — ${payload.passed}/${payload.total} passed, ${payload.failed} failed.`);
      }
    } catch (e: any) {
      setErrorMsg(e?.message || "Unexpected error");
      toast.error(e?.message || "Certification request failed");
    } finally {
      setRunning(false);
    }
  };

  const downloadFullLog = () => {
    if (!result?.full_log) return;
    const blob = new Blob([JSON.stringify(result.full_log, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hyperguest-cert-${result.hotel_code}-${result.environment}-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const renderStepRow = (s: CertStep, label: string) => (
    <div key={`${s.kind}-${label}-${s.step}`} className="flex items-start gap-2 p-2 text-xs">
      <div className="mt-0.5">
        {s.status === "pass" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
        {s.status === "fail" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
        {s.status === "skip" && <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium">
          {label}. {s.name}
          <span className="ml-2 text-muted-foreground font-normal">{s.duration_ms}ms</span>
          {s.requests && s.requests.length > 0 && (
            <span className="ml-2 text-muted-foreground font-normal">· {s.requests.length} HG call{s.requests.length === 1 ? "" : "s"}</span>
          )}
        </div>
        {s.summary && <div className="text-muted-foreground">{s.summary}</div>}
        {s.error && <div className="text-destructive break-all">{s.error}</div>}
      </div>
    </div>
  );

  return (
    <Card className="border-indigo-500/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <PlayCircle className="h-4 w-4 text-indigo-500" />
          HyperGuest Certification Runner (12-step)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Runs the 12 HG-mandated booking scenarios end-to-end (pre-book, single & multi-room, child/infant,
          same-day, currency, nationality, refundable/NRF cancellation, package rate). Full request/response
          payloads are captured for every step and downloadable once all 12 pass. Use sandbox hotel <code className="font-mono">19912</code>.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <Label htmlFor="cert-hotel-id" className="text-xs">Hotel ID</Label>
            <Input id="cert-hotel-id" value={hotelId} onChange={(e) => setHotelId(e.target.value)} placeholder="19912" className="h-8 text-xs" />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Environment</Label>
            <Select value={environment} onValueChange={(v) => setEnvironment(v as "sandbox" | "production")}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox">Sandbox</SelectItem>
                <SelectItem value="production">Production</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button onClick={run} disabled={running} size="sm" className="h-8 text-xs">
            {running ? (<><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Running…</>) : (<><PlayCircle className="h-3 w-3 mr-1" /> Run certification</>)}
          </Button>
        </div>

        {errorMsg && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">{errorMsg}</div>
        )}

        {result && (
          <div className="space-y-3">
            <div className="flex items-center gap-3 text-xs flex-wrap">
              <Badge variant="outline">Hotel {result.hotel_code}</Badge>
              <Badge variant="outline" className="capitalize">{result.environment}</Badge>
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{result.passed}/{result.total} passed</Badge>
              {result.failed > 0 && (
                <Badge className="bg-destructive/10 text-destructive border-destructive/20">{result.failed} failed</Badge>
              )}
              {result.export_ready && (
                <Button size="sm" variant="default" className="h-7 text-xs ml-auto" onClick={downloadFullLog}>
                  <Download className="h-3 w-3 mr-1" /> Export full booking process logs
                </Button>
              )}
            </div>

            {result.setup_steps?.length > 0 && (
              <div>
                <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Setup</div>
                <div className="rounded-md border divide-y">
                  {result.setup_steps.map((s, i) => renderStepRow(s, `S${i + 1}`))}
                </div>
              </div>
            )}

            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">12 HG Booking Tests</div>
              <div className="rounded-md border divide-y">
                {result.booking_tests.map((s) => renderStepRow(s, `${s.test ?? s.step}`))}
              </div>
            </div>

            {!result.export_ready && (
              <p className="text-[11px] text-muted-foreground">
                Export becomes available once all 12 booking tests pass.
              </p>
            )}

            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer">Raw JSON (summary)</summary>
              <pre className="mt-1 max-h-64 overflow-auto p-2 bg-muted rounded">{JSON.stringify({ ...result, full_log: result.full_log ? "<<see export>>" : null }, null, 2)}</pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
