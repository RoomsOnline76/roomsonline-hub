import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractFunctionError } from "@/lib/functionError";
import {
  CheckCircle2,
  CircleDashed,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UploadCloud,
  UserPlus,
  BadgeCheck,
} from "lucide-react";

type PhaseKey = "p1_subuser" | "p2_readiness" | "p3_push" | "p4_verify";
type PhaseStatus = "passed" | "blocked" | "pending";

interface Phase {
  key: PhaseKey;
  order: number;
  label: string;
  status: PhaseStatus;
  blockers: string[];
  detail: Record<string, unknown>;
}

interface Gate {
  property_id: string;
  phases: Phase[];
  current_phase: PhaseKey;
  ready_for_push: boolean;
  ru_owner_id: number | null;
  owner_scope: "portfolio" | "property" | "master";
  portfolio_id: string | null;
}

interface LastMcq {
  id: string;
  ordered_at: string;
  status: string;
  ru_status_id: string | null;
}

interface Props {
  propertyId: string;
  /** Owners see the pipeline but cannot run admin-only phase actions. */
  readOnly?: boolean;
  standalone?: boolean;
}

const PHASE_HINT: Record<PhaseKey, string> = {
  p1_subuser:
    "Every portfolio gets its own Rentals United sub-user under the RoomsOnline master account, with company details filled in.",
  p2_readiness:
    "The property must be on ROLOS as PMS and clear every mandatory readiness check before anything is sent to Rentals United.",
  p3_push:
    "Property/building is created first, then units, then availability and prices, then discounts.",
  p4_verify:
    "Inventory is read back from Rentals United and the refresh cadence is confirmed before the content quality check is ordered.",
};

const statusIcon = (status: PhaseStatus) => {
  if (status === "passed") return <CheckCircle2 className="h-5 w-5 text-emerald-600" />;
  if (status === "blocked") return <ShieldAlert className="h-5 w-5 text-destructive" />;
  return <CircleDashed className="h-5 w-5 text-muted-foreground" />;
};

const statusBadge = (status: PhaseStatus) => {
  if (status === "passed") return <Badge variant="secondary">Complete</Badge>;
  if (status === "blocked") return <Badge variant="destructive">Blocked</Badge>;
  return <Badge variant="outline">Waiting</Badge>;
};

export function RuOnboardingPipeline({ propertyId, readOnly = false, standalone = true }: Props) {
  const [gate, setGate] = useState<Gate | null>(null);
  const [lastMcq, setLastMcq] = useState<LastMcq | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<PhaseKey | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    setError(null);
    const { data, error: fnError } = await supabase.functions.invoke("ru-cert-portal", {
      body: { action: "phase_status", property_id: propertyId },
    });
    if (fnError || !data?.success) {
      setError(
        fnError
          ? await extractFunctionError(fnError, "Could not load the onboarding status")
          : data?.error?.message ?? "Could not load the onboarding status",
      );
      setGate(null);
    } else {
      setGate(data.gate as Gate);
      setLastMcq((data.last_mcq ?? null) as LastMcq | null);
    }
    setLoading(false);
  }, [propertyId]);

  useEffect(() => {
    load();
  }, [load]);

  const phases = gate?.phases ?? [];
  const completed = useMemo(() => phases.filter((p) => p.status === "passed").length, [phases]);

  const runAction = useCallback(
    async (phase: PhaseKey, body: Record<string, unknown>, successMsg: string) => {
      setBusy(phase);
      const { data, error: fnError } = await supabase.functions.invoke("ru-cert-portal", { body });
      setBusy(null);
      if (fnError || !data?.success) {
        // Surface the RU/edge reason instead of the generic "non-2xx" message.
        toast.error(
          fnError ? await extractFunctionError(fnError, "Action failed") : data?.error?.message ?? "Action failed",
          { duration: 10000 },
        );
      } else {
        toast.success(successMsg);
      }
      await load();
    },
    [load],
  );

  const pushToRu = useCallback(async () => {
    setBusy("p3_push");
    const { data, error: fnError } = await supabase.functions.invoke("push-property-to-ru", {
      body: { property_id: propertyId },
    });
    setBusy(null);
    if (fnError || !data?.success) {
      const blockers: string[] = data?.blockers ?? [];
      toast.error(
        blockers.length
          ? `${data?.error?.message ?? "Push blocked"} — ${blockers[0]}`
          : fnError
            ? await extractFunctionError(fnError, "Push failed")
            : data?.error?.message ?? "Push failed",
        { duration: 10000 },
      );
    } else {
      toast.success("Property, inventory and rates pushed to Rentals United");
    }
    await load();
  }, [propertyId, load]);


  const actionFor = (phase: Phase) => {
    if (readOnly) return null;
    const disabled = phase.status === "pending" || busy !== null;
    const spinner = busy === phase.key;

    if (phase.key === "p1_subuser" && phase.status !== "passed") {
      return (
        <Button
          size="sm"
          disabled={disabled}
          onClick={() =>
            runAction(
              "p1_subuser",
              { action: "ensure_owner_account", property_id: propertyId },
              "Rentals United sub-user is in place",
            )
          }
        >
          {spinner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UserPlus className="mr-2 h-4 w-4" />}
          Create sub-user
        </Button>
      );
    }

    if (phase.key === "p3_push" && phases[1]?.status === "passed") {
      return (
        <Button size="sm" disabled={busy !== null} onClick={pushToRu}>
          {spinner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <UploadCloud className="mr-2 h-4 w-4" />}
          {phase.status === "passed" ? "Re-push inventory" : "Push to Rentals United"}
        </Button>
      );
    }

    if (phase.key === "p4_verify" && phase.status === "passed") {
      return (
        <Button
          size="sm"
          variant="outline"
          disabled={busy !== null}
          onClick={() =>
            runAction("p4_verify", { action: "order_mcq", property_id: propertyId }, "Content quality check ordered")
          }
        >
          {spinner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
          Order quality check
        </Button>
      );
    }

    return null;
  };

  const body = (
    <div className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertTitle>Onboarding status unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {gate && (
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          <Badge variant="outline">{completed}/4 phases complete</Badge>
          <span>
            Owner scope: <strong className="text-foreground">{gate.owner_scope}</strong>
          </span>
          {gate.ru_owner_id && (
            <span>
              RU OwnerID: <strong className="text-foreground">{gate.ru_owner_id}</strong>
            </span>
          )}
          {lastMcq && (
            <span>
              Last quality check: <strong className="text-foreground">{lastMcq.status}</strong>
            </span>
          )}
        </div>
      )}

      <ol className="space-y-3">
        {phases.map((phase, idx) => (
          <li key={phase.key} className="rounded-lg border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                {statusIcon(phase.status)}
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">
                      Phase {phase.order} — {phase.label}
                    </span>
                    {statusBadge(phase.status)}
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{PHASE_HINT[phase.key]}</p>
                  {phase.blockers.length > 0 && (
                    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-destructive">
                      {phase.blockers.map((b, i) => (
                        <li key={`${phase.key}-${i}`}>{b}</li>
                      ))}
                    </ul>
                  )}
                  {phase.status === "pending" && idx > 0 && (
                    <p className="mt-2 text-sm text-muted-foreground">
                      Locked until phase {phase.order - 1} is complete.
                    </p>
                  )}
                </div>
              </div>
              <div className="shrink-0">{actionFor(phase)}</div>
            </div>
          </li>
        ))}
      </ol>

      {!loading && phases.length === 0 && !error && (
        <p className="text-sm text-muted-foreground">No onboarding data yet.</p>
      )}
    </div>
  );

  if (!standalone) return body;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-4">
        <div>
          <CardTitle>Rentals United onboarding</CardTitle>
          <CardDescription>
            Sub-user → property preparation → push → verification. Each phase is hard-gated on the one before it.
          </CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <Separator />
      <CardContent className="pt-6">{body}</CardContent>
    </Card>
  );
}

export default RuOnboardingPipeline;
