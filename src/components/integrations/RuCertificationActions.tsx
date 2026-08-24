import { useState } from "react";
import { Link as RouterLink } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Loader2, PlayCircle, ChevronRight, CheckCircle2, AlertCircle } from "lucide-react";
import { useRuRunCooldown } from "@/hooks/useRuRunCooldown";

export const RU_CONSOLE_PATH = "/admin/channel-monitor?tab=cert";

interface CertStepLite {
  name: string;
  status: "passed" | "failed" | "skipped";
  detail?: string;
}

interface RunSuiteResult {
  run?: {
    id: string;
    total?: number;
    passed?: number;
    failed?: number;
    status?: string;
    steps?: CertStepLite[];
  };
}

/** Opens the Rentals United certification console. */
export function RuConsoleLink({ size = "sm" }: { size?: "sm" | "default" }) {
  return (
    <Button asChild size={size} variant="outline" className="gap-1.5">
      <RouterLink to={RU_CONSOLE_PATH}>
        Open certification console <ChevronRight className="h-4 w-4" />
      </RouterLink>
    </Button>
  );
}

/**
 * Runs the read-only Rentals United certification suite.
 * Unlike the old ad-hoc health check, this records a row in ru_cert_runs so the
 * milestone matrix in the certification console updates as steps pass.
 */
export function RuCertificationCheckButton({
  suite = "read_only",
  propertyId,
  onComplete,
  size = "sm",
  variant = "default",
}: {
  suite?: "read_only" | "mandatory" | "discounts" | "full";
  propertyId?: string | null;
  onComplete?: () => void;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}) {
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<RunSuiteResult["run"] | null>(null);
  const { cooldownSeconds, cooling, markRun } = useRuRunCooldown();

  const run = async () => {
    if (cooling) {
      toast.error(`Rentals United allows one call per sliding minute — wait ${cooldownSeconds}s.`);
      return;
    }
    setRunning(true);
    markRun();
    setResult(null);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "run_suite", suite, property_id: propertyId ?? null },
      });
      if (error) throw error;
      const run = (data as RunSuiteResult)?.run ?? null;
      setResult(run);
      const passed = run?.passed ?? 0;
      const total = run?.total ?? 0;
      const failed = run?.failed ?? 0;
      if (failed > 0) {
        const firstFailure = run?.steps?.find((s) => s.status === "failed");
        toast.error(`Certification check: ${passed}/${total} passed`, {
          description: firstFailure ? `${firstFailure.name}: ${firstFailure.detail ?? "failed"}` : undefined,
        });
      } else {
        toast.success(`Certification check passed (${passed}/${total})`);
      }
      onComplete?.();
    } catch (err) {
      toast.error("Certification check failed", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
    setRunning(false);
  };

  const failed = (result?.failed ?? 0) > 0;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Button size={size} variant={variant} onClick={run} disabled={running || cooling} className="gap-1.5">
        {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
        {cooling ? `Rate limit — ${cooldownSeconds}s` : "Run certification check"}
      </Button>
      {result && (
        <Badge
          variant="outline"
          className={
            failed
              ? "text-destructive border-destructive/40 text-[10px]"
              : "text-success border-success/40 text-[10px]"
          }
        >
          {failed ? <AlertCircle className="h-3 w-3 mr-1" /> : <CheckCircle2 className="h-3 w-3 mr-1" />}
          {result.passed ?? 0}/{result.total ?? 0} passed
        </Badge>
      )}
      {result && (
        <Button asChild size="sm" variant="ghost" className="h-7 text-xs gap-1">
          <RouterLink to={RU_CONSOLE_PATH}>
            View run <ChevronRight className="h-3 w-3" />
          </RouterLink>
        </Button>
      )}
    </div>
  );
}
