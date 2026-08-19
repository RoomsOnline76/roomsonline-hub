import { useMemo } from "react";
import { AlertTriangle, ArrowRight, Bug, ShieldAlert, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export interface RuErrorRun {
  id: string;
  created_at: string;
  action: string;
  property_id: string | null;
  success: boolean;
  http_status: number | null;
  error_code: string | null;
  error_message: string | null;
}

interface Props {
  runs: RuErrorRun[];
  propertyNameById: Map<string, string>;
}

type Severity = "blocker" | "retryable" | "advisory" | "expected";

interface Classification {
  key: string;
  label: string;
  severity: Severity;
  cause: string;
  handling: string;
  fix: string;
}

/**
 * Deterministic RU error taxonomy. Every failed `ru_sync_runs` row is mapped to
 * exactly one bucket so operators see cause → automatic handling → manual fix.
 * Buckets with severity `expected` are refusals or no-ops, not defects: they are
 * counted separately and never colour the panel red.
 */
export const classifyRuError = (run: {
  error_code: string | null;
  error_message: string | null;
  http_status: number | null;
  action?: string | null;
}): Classification => {
  const msg = (run.error_message ?? "").toLowerCase();
  const code = (run.error_code ?? "").toLowerCase();
  const action = (run.action ?? "").toLowerCase();

  // ---- Expected states: recorded for the trail, never a fault ----
  if (
    action === "wizard_sync_blocked" || code === "wizard_sync_not_ready" ||
    msg.includes("wizard") && msg.includes("not ready")
  ) {
    return {
      key: "wizard_gate",
      label: "Wizard gate refused the push",
      severity: "expected",
      cause: "The go-live wizard has not cleared this property yet, so no channel call was attempted.",
      handling: "Refusal only — nothing was sent to the channel and nothing needs retrying.",
      fix: "Finish the outstanding wizard steps; the push arms itself once the property passes.",
    };
  }
  if (msg.includes("reservation does not exist") || msg.includes("already cancelled") || code === "ru_no_op") {
    return {
      key: "no_op",
      label: "Already in desired state",
      severity: "expected",
      cause: "The channel had nothing to act on — typically a cancel for a reservation it never held.",
      handling: "Treated as a successful no-op: the local and channel states already agree.",
      fix: "None.",
    };
  }
  if (code === "ru_queued" || msg.includes("queued and will reach the channel")) {
    return {
      key: "queued",
      label: "Queued behind rate limit",
      severity: "expected",
      cause: "The identical-call-per-minute rule parked the call in the shared channel queue.",
      handling: "The queue drain replays the call automatically within a minute.",
      fix: "None — confirm the follow-up run succeeded if the change is time critical.",
    };
  }

  if (msg.includes("incorrect login or password") || code === "auth" || run.http_status === 401) {
    return {
      key: "auth",
      label: "Authentication rejected",
      severity: "blocker",
      cause: "RU AccessKey / SecretKey missing, rotated, or mismatched between platform secrets and the PMS config.",
      handling: "Run is marked failed immediately — no retry, since retrying a bad credential can lock the account.",
      fix: "Re-enter AccessKey / SecretKey in Admin → Keys, then re-run a manual push to confirm.",
    };
  }
  if (code === "ru_email_in_use" || msg.includes("email in use") || msg.includes("already registered") || msg.includes("login email")) {
    return {
      key: "account_conflict",
      label: "Channel account conflict",
      severity: "blocker",
      cause: "The channel already holds an account for this login or contact email, so the sub-account cannot be created.",
      handling: "Creation stops before any listing is written, so no duplicate account or listing is produced.",
      fix: "Setup gap, not a code defect: bind the existing sub-account under the master instead of registering a new one.",
    };
  }
  if (code === "ru_master_auth_refused" || msg.includes("master credentials")) {
    return {
      key: "master_auth",
      label: "Refused master-credential write",
      severity: "blocker",
      cause: "The channel answered on master credentials for a write that must target the linked sub-user.",
      handling: "The write is refused rather than applied to the wrong account.",
      fix: "Bind the property's OwnerID and sub-user keys, then re-run the push.",
    };
  }
  if (code.startsWith("readiness") || msg.includes("readiness") || msg.includes("sync gate")) {
    return {
      key: "readiness",
      label: "Readiness gate blocked",
      severity: "blocker",
      cause: "Property failed the mandatory RU readiness scorecard (photos, composition, address, rates).",
      handling: "Push is refused before any RU call is made, so RU never receives an invalid listing.",
      fix: "Open the property's RU Readiness scorecard and clear every mandatory deficiency, then push again.",
    };
  }
  if (code === "ru_rate_deferred" || run.http_status === 429 || msg.includes("rate limit") || msg.includes("too many")) {
    return {
      key: "rate_limit",
      label: "Rate limited by RU",
      severity: "retryable",
      cause: "Too many calls in the RU throttling window (usually a bulk push over many properties).",
      handling: "The batch backs off and the remaining items are picked up by the next scheduled cadence run.",
      fix: "Nothing usually needed — stagger manual full pushes rather than firing them back to back.",
    };
  }
  if (
    code === "ru_listing_missing" || msg.includes("channel has no listing") ||
    msg.includes("no longer") && msg.includes("listing")
  ) {
    return {
      key: "listing_missing",
      label: "Listing missing at channel",
      severity: "blocker",
      cause: "The local unit → listing mapping points at a listing the channel no longer serves (archived or deleted).",
      handling: "Retries are suppressed — one row is logged per listing per 6 hours instead of a retry storm.",
      fix: "Republish the unit to the channel to mint a fresh listing ID, then resend the stay.",
    };
  }
  if (
    code.includes("edge") || msg.includes("failed to send a request") || msg.includes("edge function") ||
    msg.includes("non-2xx status code")
  ) {
    return {
      key: "edge_transport",
      label: "Platform transport failure",
      severity: "retryable",
      cause: "The call never reached the channel — the edge invocation itself failed (cold start, timeout, boot error).",
      handling: "Logged with the raw invoke error and left for the next cadence run; all jobs are idempotent.",
      fix: "Re-run the action manually if the next scheduled run has not already cleared it.",
    };
  }
  if (
    msg.includes("timeout") || msg.includes("aborted") || msg.includes("network") ||
    msg.includes("returned http") || msg.includes("fetch failed") ||
    (run.http_status ?? 0) >= 500
  ) {
    return {
      key: "transport",
      label: "Transport / RU upstream error",
      severity: "retryable",
      cause: "RU endpoint timed out or returned a 5xx while the payload itself was valid.",
      handling: "Logged and left for the next cadence run; ARI and RLNM jobs are idempotent so a repeat is safe.",
      fix: "Re-run the affected action manually if the next scheduled run has not already cleared it.",
    };
  }
  if (msg.includes("zip") || msg.includes("postal") || msg.includes("required") || msg.includes("invalid") || code.startsWith("validation")) {
    return {
      key: "validation",
      label: "Payload validation rejected",
      severity: "blocker",
      cause: "RU rejected a field (postal code, composition, image size, currency) in the generated XML.",
      handling: "The exact RU status text is stored on the run so the offending field is visible in Run detail.",
      fix: "Correct the field on the property, re-validate, then push. Recurring cases belong in the readiness scorer.",
    };
  }
  if (msg.includes("not mapped") || msg.includes("no ru id") || msg.includes("unmapped")) {
    return {
      key: "mapping",
      label: "Missing RU mapping",
      severity: "blocker",
      cause: "The property or unit has no Rentals United ID yet, so ARI and price pushes have no target.",
      handling: "ARI/price actions are skipped for that entity instead of failing the whole batch.",
      fix: "Run a full content push (PutProperty) first to create the RU listing and capture its RUID.",
    };
  }
  if (msg.includes("unexpected error") || msg.includes("contact it")) {
    return {
      key: "channel_opaque",
      label: "Opaque channel error",
      severity: "retryable",
      cause: "The channel returned a generic error without naming the offending field.",
      handling: "The verb, listing ID and raw channel payload are captured on the run so the call can be replayed.",
      fix: "Open Run detail, replay the captured payload, and quote the trace ID to the channel if it repeats.",
    };
  }
  return {
    key: "other",
    label: "Unclassified failure",
    severity: "advisory",
    cause: "Failure that does not match a known RU signature.",
    handling: "Stored verbatim in `ru_sync_runs` with the full request/response payload for inspection.",
    fix: "Open Run detail, review the raw payload, and raise a task if the pattern repeats.",
  };
};

const severityBadge: Record<Severity, { label: string; className: string }> = {
  blocker: { label: "Blocker", className: "bg-destructive/10 text-destructive border-destructive/30" },
  retryable: { label: "Self-healing", className: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400" },
  advisory: { label: "Advisory", className: "bg-muted text-muted-foreground border-border" },
  expected: { label: "Expected state", className: "bg-muted text-muted-foreground border-border" },
};

/** Recency chip so a cleared pattern is not read as an ongoing incident. */
const activityChip = (iso: string): { label: string; className: string } => {
  const hours = (Date.now() - new Date(iso).getTime()) / 3600000;
  if (hours <= 6) return { label: "Active", className: "bg-destructive/10 text-destructive border-destructive/30" };
  if (hours <= 48) return { label: "Cooling", className: "bg-amber-500/10 text-amber-600 border-amber-500/30 dark:text-amber-400" };
  return { label: "Cleared", className: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400" };
};


const WIRING = [
  {
    stage: "1 · Pre-flight gate",
    detail:
      "`ruReadiness.ts` scores the property. A failing mandatory check blocks the push in both ROLOS → Channels and Edit Property → Integrations, and the push API rejects the call server-side.",
  },
  {
    stage: "2 · Call execution",
    detail:
      "`push-property-to-ru`, `cron-refresh-ru-ari`, `cron-ru-rlnm-refresh` and `cron-pull-ru-reservations` each wrap their RU call, capturing HTTP status, RU status code, elapsed ms and the full payload.",
  },
  {
    stage: "3 · Structured logging",
    detail:
      "Every attempt — success or failure — is written to `ru_sync_runs` (action, batch_id, property_id, unit_id, success, http_status, error_code, error_message, details).",
  },
  {
    stage: "4 · Normalisation",
    detail:
      "`normalizeRuSyncError` rewrites opaque RU text (e.g. “Incorrect login or password” → “AccessKey / SecretKey authentication failed”) while the raw message stays visible in Run detail.",
  },
  {
    stage: "5 · Recovery",
    detail:
      "Transport and rate-limit failures are left to the next cadence run (all jobs are idempotent). Blockers stop the entity only — the batch continues for other properties.",
  },
  {
    stage: "6 · Inbound safety",
    detail:
      "`ru-reservation-handler` always answers 200 to RU even on internal failure, so RU never enters an endless retry loop; the failure is logged for replay instead.",
  },
];

export function RuErrorHandlingTab({ runs, propertyNameById }: Props) {
  const failures = useMemo(() => runs.filter((r) => !r.success), [runs]);

  const allGroups = useMemo(() => {
    const map = new Map<string, { cls: Classification; count: number; last: RuErrorRun }>();
    failures.forEach((r) => {
      const cls = classifyRuError(r);
      const existing = map.get(cls.key);
      if (existing) {
        existing.count += 1;
        if (new Date(r.created_at) > new Date(existing.last.created_at)) existing.last = r;
      } else {
        map.set(cls.key, { cls, count: 1, last: r });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }, [failures]);

  // Refusals and no-ops are recorded for the audit trail but are not defects.
  const groups = useMemo(() => allGroups.filter((g) => g.cls.severity !== "expected"), [allGroups]);
  const expectedGroups = useMemo(() => allGroups.filter((g) => g.cls.severity === "expected"), [allGroups]);
  const expectedCount = expectedGroups.reduce((s, g) => s + g.count, 0);
  const faultCount = groups.reduce((s, g) => s + g.count, 0);

  const blockers = groups.filter((g) => g.cls.severity === "blocker").reduce((s, g) => s + g.count, 0);
  const selfHealing = groups.filter((g) => g.cls.severity === "retryable").reduce((s, g) => s + g.count, 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Faults (7d)</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold">{faultCount}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Need manual fix</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold text-destructive">{blockers}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Self-healing</CardTitle></CardHeader>
          <CardContent><div className="text-2xl font-semibold text-amber-600 dark:text-amber-400">{selfHealing}</div></CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expected states</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-semibold">{expectedCount}</div>
            <p className="text-[11px] text-muted-foreground mt-1">Wizard refusals, queued calls and no-ops — excluded from faults.</p>
          </CardContent>
        </Card>
      </div>


      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Bug className="h-4 w-4" />Live error taxonomy (last 7 days)</CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Each failed sync run is classified into one bucket: what caused it, what the platform does automatically, and what you must do.
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Error class</TableHead>
                <TableHead className="w-[90px]">Count</TableHead>
                <TableHead>Cause</TableHead>
                <TableHead>Automatic handling</TableHead>
                <TableHead>Manual fix</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {groups.map(({ cls, count, last }) => {
                const badge = severityBadge[cls.severity];
                return (
                  <TableRow key={cls.key} className="align-top">
                    <TableCell>
                      <div className="font-medium text-sm">{cls.label}</div>
                      <Badge variant="outline" className={`mt-1 text-[10px] ${badge.className}`}>{badge.label}</Badge>
                    </TableCell>
                    <TableCell className="font-semibold">{count}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[240px]">{cls.cause}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[240px]">{cls.handling}</TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[240px]">{cls.fix}</TableCell>
                    <TableCell className="text-xs">
                      <div>{new Date(last.created_at).toLocaleString()}</div>
                      <div className="text-muted-foreground">
                        {last.action}
                        {last.property_id ? ` · ${propertyNameById.get(last.property_id) ?? last.property_id.slice(0, 8)}` : ""}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {groups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    No failed sync runs in the last 7 days.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Wrench className="h-4 w-4" />How error handling is wired</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {WIRING.map((w) => (
            <div key={w.stage} className="flex gap-3 rounded-md border border-border p-3">
              <ArrowRight className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <div className="text-sm font-medium">{w.stage}</div>
                <p className="text-xs text-muted-foreground mt-1">{w.detail}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldAlert className="h-4 w-4" />Escalation rules</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs text-muted-foreground">
          <p className="flex gap-2"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-destructive" />
            Authentication failures affect every property at once — treat any occurrence as immediate and fix the keys before re-running.
          </p>
          <p className="flex gap-2"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
            The same transport error repeating across three consecutive cadence runs means RU-side degradation — pause pushes and raise it with RU.
          </p>
          <p className="flex gap-2"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
            Any failure landing in “Unclassified” should be added to the taxonomy so it stops needing human triage.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
