import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CheckCircle2, CircleDot, Loader2, PlayCircle, XCircle } from "lucide-react";

interface CertStep {
  step: number;
  name: string;
  status: "pass" | "fail" | "skip";
  duration_ms: number;
  summary?: string;
  error?: string;
}

interface CertResult {
  hotel_code: string;
  environment: string;
  steps: CertStep[];
  passed: number;
  failed: number;
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
        body: {
          action: "run_certification",
          hotel_id: hotelId.trim() || undefined,
          environment,
        },
      });
      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data?.error?.message || "Certification failed to start");
      }
      setResult(data?.data ?? null);
      const passed = data?.data?.passed ?? 0;
      const failed = data?.data?.failed ?? 0;
      if (failed === 0) toast.success(`Certification complete — ${passed}/${passed + failed} passed`);
      else toast.warning(`Certification complete — ${passed} passed, ${failed} failed`);
    } catch (e: any) {
      setErrorMsg(e?.message || "Unexpected error");
      toast.error(e?.message || "Certification request failed");
    } finally {
      setRunning(false);
    }
  };

  return (
    <Card className="border-indigo-500/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <PlayCircle className="h-4 w-4 text-indigo-500" />
          HyperGuest Certification Runner
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-xs text-muted-foreground">
          Executes the 10-step HG mandatory test sequence (health → static → availability → prebook → book → cancel).
          Use sandbox hotel <code className="font-mono">19912</code> to validate the integration end-to-end.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <Label htmlFor="cert-hotel-id" className="text-xs">Hotel ID</Label>
            <Input
              id="cert-hotel-id"
              value={hotelId}
              onChange={(e) => setHotelId(e.target.value)}
              placeholder="19912"
              className="h-8 text-xs"
            />
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
            {running ? (
              <><Loader2 className="h-3 w-3 mr-1 animate-spin" /> Running…</>
            ) : (
              <><PlayCircle className="h-3 w-3 mr-1" /> Run certification</>
            )}
          </Button>
        </div>

        {errorMsg && (
          <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            {errorMsg}
          </div>
        )}

        {result && (
          <div className="space-y-2">
            <div className="flex items-center gap-3 text-xs">
              <Badge variant="outline">Hotel {result.hotel_code}</Badge>
              <Badge variant="outline" className="capitalize">{result.environment}</Badge>
              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{result.passed} passed</Badge>
              {result.failed > 0 && (
                <Badge className="bg-destructive/10 text-destructive border-destructive/20">{result.failed} failed</Badge>
              )}
            </div>

            <div className="rounded-md border divide-y">
              {result.steps.map((s) => (
                <div key={s.step} className="flex items-start gap-2 p-2 text-xs">
                  <div className="mt-0.5">
                    {s.status === "pass" && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />}
                    {s.status === "fail" && <XCircle className="h-3.5 w-3.5 text-destructive" />}
                    {s.status === "skip" && <CircleDot className="h-3.5 w-3.5 text-muted-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-medium">
                      {s.step}. {s.name}
                      <span className="ml-2 text-muted-foreground font-normal">{s.duration_ms}ms</span>
                    </div>
                    {s.summary && <div className="text-muted-foreground">{s.summary}</div>}
                    {s.error && <div className="text-destructive break-all">{s.error}</div>}
                  </div>
                </div>
              ))}
            </div>

            <details className="text-[10px] text-muted-foreground">
              <summary className="cursor-pointer">Raw JSON</summary>
              <pre className="mt-1 max-h-64 overflow-auto p-2 bg-muted rounded">{JSON.stringify(result, null, 2)}</pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
