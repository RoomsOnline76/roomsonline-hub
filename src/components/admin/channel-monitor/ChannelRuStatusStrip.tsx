import { useMemo } from "react";
import { AlertTriangle, ArrowRight, CheckCircle2, KeyRound, Loader2, ShieldCheck, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useChannelRailStatus } from "@/hooks/useChannelRailStatus";

import type { ChannelCostMonitorData } from "@/hooks/useChannelCostMonitor";

type TabKey = "cost" | "accounts" | "cert" | "onboard";




/** Names the first step in a run that did not pass, so the operator sees the blocker directly. */
const firstProblemStep = (steps: unknown): { name: string; status: string } | null => {
  if (!Array.isArray(steps)) return null;
  for (const raw of steps) {
    const s = raw as { name?: string; status?: string };
    if (s?.status && s.status !== "passed" && s.status !== "skipped") {
      return { name: s.name ?? "Unnamed step", status: s.status };
    }
  }
  for (const raw of steps) {
    const s = raw as { name?: string; status?: string; retryable?: boolean };
    if (s?.status === "skipped" && s.retryable) return { name: s.name ?? "Unnamed step", status: "deferred" };
  }
  return null;
};

interface Props {
  data: ChannelCostMonitorData;
  onNavigate: (tab: TabKey) => void;
}

/**
 * Certification blockers live in three different data sets (sub-account keys, listing
 * footprint, latest certification verdict). This strip keeps all three visible on every
 * tab and offers the single action that clears whichever one is currently blocking.
 */
export function ChannelRuStatusStrip({ data, onNavigate }: Props) {
  // Same three reads as before, now shared with the left-rail status chips.
  const { loading, keys, latestRun } = useChannelRailStatus();

  const problem = useMemo(() => (latestRun ? firstProblemStep(latestRun.steps) : null), [latestRun]);

  const live = data.properties.filter((p) => p.state === "live").length;
  const withoutFootprint = data.subAccountPropertiesWithoutFootprint;

  const blocker: { label: string; action: string; tab: TabKey; icon: typeof KeyRound } | null = useMemo(() => {
    if (keys.total === 0 || keys.withKeys < keys.total) {
      return { label: "Sub-account API keys are missing", action: "Store keys", tab: "accounts", icon: KeyRound };
    }
    if (keys.verified < keys.withKeys) {
      return { label: "Stored keys have not been verified against the channel", action: "Verify keys", tab: "accounts", icon: KeyRound };
    }
    if (live === 0) {
      return { label: "No listing is live at the channel manager yet", action: "Push a property", tab: "cost", icon: Upload };
    }
    if (withoutFootprint > 0) {
      return {
        label: `${withoutFootprint} sub-account propert${withoutFootprint === 1 ? "y" : "ies"} not pushed yet`,
        action: "Review listings",
        tab: "cost",
        icon: Upload,
      };
    }
    if (!latestRun) {
      return { label: "No certification run recorded", action: "Run certification", tab: "cert", icon: ShieldCheck };
    }
    if (latestRun.status === "failed" || problem) {
      return {
        label: problem ? `${latestRun.suite ?? "Suite"} — ${problem.status}: ${problem.name}` : `${latestRun.suite ?? "Suite"} failed`,
        action: "Re-run phase",
        tab: "cert",
        icon: ShieldCheck,
      };
    }
    return null;
  }, [keys, live, withoutFootprint, latestRun, problem]);

  const chip = (ok: boolean, label: string, tab: TabKey) => (
    <button
      type="button"
      onClick={() => onNavigate(tab)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors hover:bg-muted",
        ok ? "border-border text-muted-foreground" : "border-destructive/40 text-destructive",
      )}
    >
      {ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
      {label}
    </button>
  );

  return (
    <Card className={cn(blocker ? "border-destructive/40" : undefined)}>
      <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {loading ? (
            <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking channel readiness…
            </span>
          ) : (
            <>
              {chip(
                keys.total > 0 && keys.verified === keys.total,
                `Accounts ${keys.verified}/${keys.total || 0} keys verified`,
                "accounts",
              )}
              {chip(live > 0 && withoutFootprint === 0, `${live} live · ${data.billableListings} listings`, "cost")}
              {chip(
                !!latestRun && latestRun.status === "passed",
                latestRun
                  ? `${latestRun.suite ?? "Certification"}: ${latestRun.passed ?? 0}/${latestRun.total ?? 0} ${latestRun.status ?? ""}`.trim()
                  : "No certification run",
                "cert",
              )}
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          {blocker ? (
            <>
              <span className="hidden text-xs text-muted-foreground sm:inline">{blocker.label}</span>
              <Button size="sm" onClick={() => onNavigate(blocker.tab)}>
                <blocker.icon className="mr-1.5 h-3.5 w-3.5" />
                {blocker.action}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
              Accounts, listings and the latest certification run are all clear
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
