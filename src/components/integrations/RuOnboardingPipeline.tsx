import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  Radio,
} from "lucide-react";

/** Channel the content quality check is ordered against (RU CM_LNM_* ChannelID). */
const MCQ_CHANNEL_NAME = "LekkeSlaap";

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

/** "Data being sent" evidence for phase 2, as measured by the readiness scorer. */
interface UnitEvidence {
  unit: string | null;
  description_chars: number | null;
  images_count: number | null;
  images_meeting_cert_size: number | null;
  images_unmeasured: number | null;
  smallest_image: string | null;
  can_sleep_max: number | null;
  total_bed_capacity: number | null;
  bedroom_blocks: number | null;
  arrival_instructions_chars: number | null;
}

interface WindowEvidence {
  longest_run: number | null;
  first_window: string | null;
  min_stay_set: boolean | null;
  open_days: number | null;
}

interface Readiness {
  unit_count?: number;
  mandatory_total?: number;
  mandatory_passed?: number;
  content_quality?: { units?: UnitEvidence[]; bookable_window?: WindowEvidence[] | null };
}

interface SalesChannel {
  channel_id: number;
  company_name: string | null;
  scope: "property" | "account";
  updated_at: string | null;
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
  const [salesChannel, setSalesChannel] = useState<SalesChannel | null>(null);
  const [readiness, setReadiness] = useState<Readiness | null>(null);
  const [availabilitySource, setAvailabilitySource] = useState<"channel" | "local">("local");
  const [resolvingChannel, setResolvingChannel] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<PhaseKey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [passwordOpen, setPasswordOpen] = useState(false);
  const [accessKeyValue, setAccessKeyValue] = useState("");
  const [secretKeyValue, setSecretKeyValue] = useState("");

  const [resetOpen, setResetOpen] = useState(false);

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
      setReadiness(null);
    } else {
      setGate(data.gate as Gate);
      setReadiness((data.readiness ?? null) as Readiness | null);
      setAvailabilitySource(data.availability_source === "channel" ? "channel" : "local");
      setLastMcq((data.last_mcq ?? null) as LastMcq | null);
      setSalesChannel((data.sales_channel ?? null) as SalesChannel | null);
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
      } else if (data?.company_details_manual_required) {
        // Stored credentials could not authenticate — ask for the sub-user API keys in-app
        // (never via a native browser prompt, which exposes the host URL).
        setPasswordOpen(true);
        toast.warning(
          String(data.company_details_warning ?? "No usable Rentals United API keys for this sub-user — paste its AccessKey and SecretKey once to continue."),
          { duration: 10000 },
        );
      } else if (data?.company_details_warning) {
        // Sub-user is in place but Push_FillCompanyDetails_RQ still outstanding.
        toast.warning(String(data.company_details_warning), { duration: 12000 });
      } else {
        toast.success(successMsg);
      }
      await load();
      return data;
    },
    [load],
  );

  const submitCompanyDetails = useCallback(
    (accessKey?: string, secretKey?: string) =>
      runAction(
        "p1_subuser",
        {
          action: "ensure_company_details",
          property_id: propertyId,
          // Always re-submit: RU overwrites the profile, so a manual run is the
          // recovery path when the RU portal profile still shows blank fields.
          force: true,
          ...(accessKey && secretKey
            ? { ru_api_access_key: accessKey, ru_api_secret_key: secretKey }
            : {}),
        },
        "Company details submitted to Rentals United",
      ),
    [runAction, propertyId],
  );


  /** Pull_ListSalesChannels_RQ → store the LekkeSlaap ChannelID for this property. */
  const resolveChannel = useCallback(async () => {
    setResolvingChannel(true);
    const { data, error: fnError } = await supabase.functions.invoke("ru-cert-portal", {
      body: { action: "resolve_sales_channel", property_id: propertyId, channel_name: MCQ_CHANNEL_NAME },
    });
    setResolvingChannel(false);
    if (fnError || !data?.success) {
      toast.error(
        fnError
          ? await extractFunctionError(fnError, "Could not pull the Rentals United sales channels")
          : data?.error?.message ?? "Could not resolve the ChannelID",
        { duration: 12000 },
      );
    } else {
      toast.success(`${MCQ_CHANNEL_NAME} ChannelID ${data.channel?.channel_id} linked to this property`);
    }
    await load();
  }, [propertyId, load]);

  const pushToRu = useCallback(async () => {
    setBusy("p3_push");
    const { data, error: fnError } = await supabase.functions.invoke("push-property-to-ru", {
      body: { property_id: propertyId },
    });
    setBusy(null);
    if (fnError || !data?.success) {
      // PHASE_BLOCKED returns `blockers`; NOT_READY returns `gaps` — show either.
      const reasons: string[] = [...(data?.blockers ?? []), ...(data?.gaps ?? [])].map(String);
      toast.error(
        reasons.length
          ? `${data?.error?.message ?? "Push blocked"} — ${reasons.slice(0, 3).join(" · ")}`
          : fnError
            ? await extractFunctionError(fnError, "Push failed")
            : data?.error?.message ?? "Push failed",
        { duration: 12000 },
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

    if (phase.key === "p1_subuser" && phase.status === "passed") {
      // Phase 1 stays re-runnable: RU overwrites the company profile on every
      // Push_FillCompanyDetails_RQ, and a full restart re-creates the sub-user.
      return (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => submitCompanyDetails()}>
            {spinner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Re-send company details
          </Button>
          <Button size="sm" variant="ghost" disabled={busy !== null} onClick={() => setResetOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" />
            Restart Phase 1
          </Button>
        </div>
      );
    }

    if (phase.key === "p1_subuser" && phase.status !== "passed") {

      // A stale identity (owner email changed) must fall back to "Create sub-user".
      const hasSubUser = Boolean(phase.detail?.ru_owner_id) && phase.detail?.email_mismatch !== true;
      if (hasSubUser) {
        return (
          <Button size="sm" disabled={disabled} onClick={() => submitCompanyDetails()}>
            {spinner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
            Complete company details
          </Button>
        );
      }
      return (
        <Button
          size="sm"
          disabled={disabled}
          onClick={() =>
            runAction(
              "p1_subuser",
              { action: "ensure_owner_account", property_id: propertyId },
              "Rentals United sub-user created and company details filled",
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
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            size="sm"
            variant={salesChannel ? "ghost" : "secondary"}
            disabled={resolvingChannel || busy !== null}
            onClick={resolveChannel}
          >
            {resolvingChannel ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Radio className="mr-2 h-4 w-4" />}
            {salesChannel ? "Re-pull ChannelID" : `Resolve ${MCQ_CHANNEL_NAME} ChannelID`}
          </Button>
          <Button
          size="sm"
          variant="outline"
          disabled
          title="CM_LNM_OrderMinimumContentQualityCheck_RQ is unavailable until the Channel Manager API is fully integrated and deployed."
          onClick={() =>
            runAction(
              "p4_verify",
              {
                action: "order_mcq",
                property_id: propertyId,
                ...(salesChannel ? { channel_id: salesChannel.channel_id } : {}),
              },
              "Content quality check ordered",
            )
          }
        >
          {spinner ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
            Order quality check (CM API pending)
          </Button>

        </div>
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
                  {phase.key === "p4_verify" && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {salesChannel ? (
                        <>
                          Sales channel: <span className="font-medium text-foreground">
                            {salesChannel.company_name || MCQ_CHANNEL_NAME}
                          </span>{" "}
                          · ChannelID <span className="font-medium text-foreground">{salesChannel.channel_id}</span>
                          {` (${salesChannel.scope} scope)`}
                        </>
                      ) : (
                        <>No sales ChannelID linked yet — pull it from Rentals United before ordering the quality check.</>
                      )}
                    </p>
                  )}
                  {(phase.key === "p3_push" || phase.key === "p4_verify") && phase.detail?.ru_owner_id != null && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Linked RU OwnerID: <span className="font-medium text-foreground">{String(phase.detail.ru_owner_id)}</span>
                      {phase.key === "p4_verify" && ` · Verification: ${phase.detail.verified === true ? "passed" : "pending"}`}
                    </p>
                  )}
                  {phase.key === "p2_readiness" && readiness && (
                    <div className="mt-2 space-y-1 rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                      <p className="font-medium text-foreground">
                        Data that will be sent
                        {typeof readiness.mandatory_total === "number" && (
                          <> · {readiness.mandatory_passed ?? 0}/{readiness.mandatory_total} mandatory checks passed</>
                        )}
                      </p>
                      {(readiness.content_quality?.units ?? []).map((u, i) => (
                        <p key={`ev-${i}`}>
                          <span className="font-medium text-foreground">{u.unit || "Property"}</span>
                          {`: description ${u.description_chars ?? 0} chars · ${u.images_count ?? 0} photo(s)`}
                          {typeof u.images_meeting_cert_size === "number" &&
                            ` (${u.images_meeting_cert_size} ≥ 1024×768${u.images_unmeasured ? `, ${u.images_unmeasured} unmeasured` : ""})`}
                          {u.smallest_image ? ` · smallest ${u.smallest_image}` : ""}
                          {` · sleeps ${u.can_sleep_max ?? 0} in ${u.bedroom_blocks ?? 0} bedroom(s), beds for ${u.total_bed_capacity ?? 0}`}
                          {` · arrival instructions ${u.arrival_instructions_chars ?? 0} chars`}
                        </p>
                      ))}
                      {(readiness.content_quality?.bookable_window ?? []).map((w, i) => (
                        <p key={`win-${i}`}>
                          {`Bookable window: ${w.longest_run ?? 0} consecutive priced day(s)`}
                          {w.first_window ? ` from ${w.first_window}` : ""}
                          {` · ${w.open_days ?? 0} open day(s) · MinStay ${w.min_stay_set ? "set" : "missing"}`}
                          {` · measured on the ${availabilitySource === "channel" ? "Channel Manager calendar" : "ROL'OS calendar (pre-publish)"}`}
                        </p>
                      ))}
                    </div>
                  )}
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

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rentals United sub-user API keys</DialogTitle>
            <DialogDescription>
              Since Rentals United's API-key rollout, company details must be submitted with the sub-user's own
              AccessKey and SecretKey. Generate the first pair in the RU dashboard → Security settings while signed
              in as that sub-user, then paste it here. Keys are stored encrypted against this OwnerID and reused
              automatically from now on.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoComplete="off"
              value={accessKeyValue}
              onChange={(e) => setAccessKeyValue(e.target.value)}
              placeholder="Sub-user AccessKey"
            />
            <Input
              type="password"
              autoComplete="off"
              value={secretKeyValue}
              onChange={(e) => setSecretKeyValue(e.target.value)}
              placeholder="Sub-user SecretKey"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPasswordOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!accessKeyValue || !secretKeyValue || busy !== null}
              onClick={async () => {
                const key = accessKeyValue;
                const secret = secretKeyValue;
                setPasswordOpen(false);
                setAccessKeyValue("");
                setSecretKeyValue("");
                await submitCompanyDetails(key, secret);
              }}
            >
              Submit company details
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Restart Phase 1</DialogTitle>
            <DialogDescription>
              Choose how far back to reset the Rentals United owner onboarding for this portfolio.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              <strong className="text-foreground">Re-open company details</strong> keeps the existing sub-user and
              OwnerID, and lets you re-submit the company profile to Rentals United.
            </p>
            <p>
              <strong className="text-foreground">Unbind sub-user</strong> also clears the stored OwnerID and password,
              so the flow starts again at “Create sub-user”. The account is not deleted inside Rentals United.
            </p>
          </div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={async () => {
                setResetOpen(false);
                await runAction(
                  "p1_subuser",
                  { action: "reset_phase1", property_id: propertyId, mode: "details" },
                  "Phase 1 company details re-opened",
                );
              }}
            >
              Re-open company details
            </Button>
            <Button
              variant="destructive"
              disabled={busy !== null}
              onClick={async () => {
                setResetOpen(false);
                await runAction(
                  "p1_subuser",
                  { action: "reset_phase1", property_id: propertyId, mode: "identity" },
                  "Phase 1 reset — sub-user unbound",
                );
              }}
            >
              Unbind sub-user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
