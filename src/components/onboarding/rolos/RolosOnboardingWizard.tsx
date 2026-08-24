import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Circle,
  Lock,
  Loader2,
  RefreshCw,
  Rocket,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Checkbox } from "@/components/ui/checkbox";
import { ROLOS_SIGNOFF_CHECKLIST } from "@/config/rolosOnboardingMacros";

import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { focusRequirementField, focusUnitCard } from "@/lib/requirementFocus";
import {
  CHECK_TO_FIELD_KEYS,
  PROPERTY_FIELD_REQUIREMENTS,
} from "@/config/propertyFieldRequirements";
import { resolveMcqRequirement } from "@/lib/mcqRequirements";


import {
  useRolosOnboardingProgress,
  type MacroProgress,
  type DistributionCheck,
  type DistributionFailure,
} from "@/hooks/useRolosOnboardingProgress";


/**
 * Floating ROL'OS Channel Readiness wizard.
 *
 * One consolidated surface for the eleven macro steps: progress, hard gates,
 * deep links to outstanding fields, the sub-owner push, the manual sign-off and
 * the final hand-off to ROL'OS → Channels.
 */

interface Props {
  propertyId?: string | null;
  /** Hidden when the property is not on ROL'OS as its PMS. */
  className?: string;
}

const COLLAPSE_KEY = "rolos-onboarding-wizard-collapsed";
const DISMISS_KEY = "rolos-onboarding-wizard-dismissed";
/** Per-property hide/collapse preference, valid only for one gate signature. */
const PREFS_KEY = "rolos-wizard";

interface StoredPrefs {
  hidden?: boolean;
  collapsed?: boolean;
  signature?: string;
}


function StatusIcon({ complete, locked }: { complete: boolean; locked: boolean }) {
  if (locked) return <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  if (complete) return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  return <Circle className="h-4 w-4 shrink-0 text-primary" />;
}

interface BlockerTarget {
  section: string;
  fieldKey?: string;
  unit?: string;
}

/**
 * Maps a wizard/channel-gate check id onto the editor section + registry field
 * key that owns it, so every blocker in the wizard is a link that lands on the
 * exact control (which the requirement painter then pulses).
 */
function resolveCheckTarget(checkKey: string): BlockerTarget | null {
  const fieldKeys = CHECK_TO_FIELD_KEYS[checkKey];
  if (!fieldKeys?.length) return null;
  for (const key of fieldKeys) {
    const req = PROPERTY_FIELD_REQUIREMENTS.find((r) => r.key === key);
    if (req) return { section: req.section, fieldKey: req.key };
  }
  return null;
}

/**
 * Resolve an individual failing point. Unit-scoped failures always route to the
 * Rooms tab (and the named unit), because the content that fails — unit name,
 * unit description, unit arrival instructions — is only editable there, even
 * though the property-level catalogue would send them to General.
 */
/**
 * Checks whose failures are always authored on a unit (room type), even when the report
 * did not name one — a single-unit property reports them without a prefix.
 */
const UNIT_OWNED_CHECKS = new Set([
  "content_quality",
  "rooms_beds",
  "photos",
  "availability_365",
  "pricing_365",
  "ari_availability",
  "ari_prices",
  "bookable_window",
  "min_stay_set",
]);

/** Pull a "UNIT NAME: message" prefix off a failure line. */
function unitFromMessage(text: string, knownUnits: string[]): string | undefined {
  const prefix = text.split(":")[0]?.trim();
  if (!prefix || prefix.length > 60) return undefined;
  const hit = knownUnits.find((u) => u.toLowerCase() === prefix.toLowerCase());
  return hit;
}

function resolveFailureTarget(
  failure: DistributionFailure,
  checkKey: string,
  units: { sole: string | null; all: string[] },
): BlockerTarget {
  const text = `${failure.label} ${failure.detail ?? ""}`;
  const req = resolveMcqRequirement(text);
  // Routing unit, in order: the reported unit → a "NAME:" prefix in the message →
  // the property's only unit when the failing check is unit-owned.
  const unit =
    failure.unit ||
    unitFromMessage(failure.detail ?? failure.label, units.all) ||
    (UNIT_OWNED_CHECKS.has(checkKey) ? units.sole ?? undefined : undefined);
  if (unit) {
    const mapped = resolveCheckTarget(checkKey);
    return { section: "rooms", unit, fieldKey: mapped?.fieldKey };
  }
  if (req) return { section: req.section, fieldKey: req.focusKey };
  return resolveCheckTarget(checkKey) ?? { section: "general" };
}

/** First blocking failure across the step's state checks, if any. */
function firstBlockingTarget(
  stateChecks: DistributionCheck[],
  units: { sole: string | null; all: string[] },
): BlockerTarget | null {
  for (const c of stateChecks) {
    if (c.ok || c.unknown) continue;
    const blocking = (c.failures ?? []).filter((f) => f.mandatory);
    if (blocking.length > 0) return resolveFailureTarget(blocking[0], c.key, units);
    const target = resolveCheckTarget(c.key);
    if (target) return target;
  }
  return null;
}



export function RolosOnboardingWizard({ propertyId, className }: Props) {
  const { user, isAdmin, isDev, isFearlessLeader } = useAuth();
  const isPlatformUser = isAdmin || isDev || isFearlessLeader;
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const {
    isRolosPms,
    macros,
    currentMacro,
    overall,
    channelsConnected,
    publishedOk,
    unpublishedUnits,
    blockingMacros,
    gateSignature,

    signoff,
    recordSignoff,
    recordSignoffCheck,
    refresh,

    isLoading,
    isFetching,
    propertyName,
    soleUnitName,
    unitNames,
  } = useRolosOnboardingProgress(propertyId);

  const unitScope = useMemo(
    () => ({ sole: soleUnitName ?? null, all: unitNames ?? [] }),
    [soleUnitName, unitNames],
  );

  const prefsKey = `${PREFS_KEY}:${propertyId ?? ""}`;

  const [collapsed, setCollapsed] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  /** Set when the user opens the quiet pill for this page view. */
  const [pillOpened, setPillOpened] = useState(false);
  const [openMacro, setOpenMacro] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // Hide / collapse persist per property, but only while the mandatory gate state
  // (steps 1-8) is unchanged. A new blocker changes the signature, which discards
  // the stored preference and brings the wizard back on its own.
  useEffect(() => {
    setPillOpened(false);
    let stored: StoredPrefs | null = null;
    try {
      stored = JSON.parse(localStorage.getItem(prefsKey) ?? "null") as StoredPrefs | null;
      // Legacy per-load keys are no longer used.
      localStorage.removeItem(COLLAPSE_KEY);
      sessionStorage.removeItem(`${DISMISS_KEY}:${propertyId ?? ""}`);
    } catch {
      /* ignore */
    }
    const valid = !!stored && stored.signature === gateSignature;
    setDismissed(valid ? stored!.hidden === true : false);
    setCollapsed(valid ? stored!.collapsed === true : false);
  }, [gateSignature, prefsKey, propertyId]);

  const savePrefs = useCallback(
    (patch: Partial<StoredPrefs>) => {
      try {
        const current = JSON.parse(localStorage.getItem(prefsKey) ?? "null") as StoredPrefs | null;
        localStorage.setItem(
          prefsKey,
          JSON.stringify({
            hidden: false,
            collapsed: false,
            ...(current ?? {}),
            ...patch,
            signature: gateSignature,
          }),
        );
      } catch {
        /* ignore */
      }
    },
    [gateSignature, prefsKey],
  );

  // Keep the expanded row on the first incomplete step: a step that reaches
  // 100% collapses itself and hands over to the next outstanding macro.
  useEffect(() => {
    setOpenMacro((prev) => {
      if (!prev) return currentMacro?.macro.key ?? null;
      const prevMacro = macros.find((m) => m.macro.key === prev);
      if (prevMacro && !prevMacro.complete) return prev;
      return currentMacro?.macro.key ?? null;
    });
  }, [currentMacro, macros]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((prev) => {
      savePrefs({ collapsed: !prev });
      return !prev;
    });
  }, [savePrefs]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    savePrefs({ hidden: true });
  }, [savePrefs]);



  const goToField = useCallback(
    (section: string, focus?: string, unit?: string) => {
      const next = new URLSearchParams(searchParams);
      const sameSection = next.get("section") === section;
      next.set("section", section);
      if (focus) next.set("focus", focus);
      else next.delete("focus");
      // Nonce forces a fresh navigation even when the target section is already
      // open, so the deep link always produces visible movement.
      next.set("rq", String(Date.now()));
      navigate(`${location.pathname}?${next.toString()}`, { replace: false });

      window.setTimeout(() => {
        // Unit-scoped blockers land on the exact room/unit card.
        if (unit) {
          focusUnitCard(unit);
          if (focus) window.setTimeout(() => focusRequirementField(focus), 350);
          return;
        }
        if (focus) {
          focusRequirementField(focus);
          return;
        }
        window.scrollTo({ top: 0, behavior: "smooth" });
      }, sameSection ? 60 : 400);
    },
    [location.pathname, navigate, searchParams],
  );



  const pushOwner = useCallback(async () => {
    if (!propertyId) return;
    setBusyAction("ensure_owner");
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "ensure_owner_account", property_id: propertyId },
      });
      if (error || data?.success !== true) {
        toast.error(data?.error?.message ?? error?.message ?? "Could not create the distribution identity");
      } else {
        toast.success("Sub-owner identity created");
        await refresh();
      }
    } finally {
      setBusyAction(null);
    }
  }, [propertyId, refresh]);

  const toggleSignoff = useCallback(
    async (next: boolean) => {
      setBusyAction("signoff");
      try {
        await recordSignoff(next, user?.email ?? null);
        toast.success(next ? "Sign-off recorded" : "Sign-off cleared");
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not record the sign-off");
      } finally {
        setBusyAction(null);
      }
    },
    [recordSignoff, user?.email],
  );

  const toggleSignoffItem = useCallback(
    async (itemKey: string, next: boolean) => {
      setBusyAction(`signoff:${itemKey}`);
      try {
        await recordSignoffCheck(itemKey, next, user?.email ?? null);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not record the confirmation");
      } finally {
        setBusyAction(null);
      }
    },
    [recordSignoffCheck, user?.email],
  );


  const visibleMacros = useMemo(
    () => macros.filter((m) => !m.macro.adminOnly || isPlatformUser),
    [isPlatformUser, macros],
  );

  // Only the leading run of passed steps condenses into the tick strip. Any
  // step at or after the first incomplete one keeps its full row, even if it is
  // already complete. Clicking a tick brings that row back.
  const firstIncompleteIndex = useMemo(() => {
    const idx = visibleMacros.findIndex((m) => !m.complete);
    return idx === -1 ? visibleMacros.length : idx;
  }, [visibleMacros]);

  const completedChips = useMemo(
    () =>
      visibleMacros.filter(
        (m, i) => i < firstIncompleteIndex && m.complete && openMacro !== m.macro.key,
      ),
    [visibleMacros, firstIncompleteIndex, openMacro],
  );
  const openMacros = useMemo(
    () =>
      visibleMacros.filter(
        (m, i) => i >= firstIncompleteIndex || !m.complete || openMacro === m.macro.key,
      ),
    [visibleMacros, firstIncompleteIndex, openMacro],
  );




  const allComplete = visibleMacros.length > 0 && visibleMacros.every((m) => m.complete);

  if (!propertyId || dismissed) return null;
  if (isLoading) return null;
  if (!isRolosPms) return null;

  // The property is live on at least one channel and no hard gate is violated —
  // onboarding is done, so the wizard (and the Connect Channels button) retire
  // entirely. It reappears automatically the moment a mandatory step regresses.
  if (channelsConnected > 0 && allComplete) return null;

  // Every readiness step is green — the wizard condenses into a single action.
  if (allComplete) {

    return (
      <div
        className={`fixed bottom-[4.75rem] right-4 md:bottom-4 z-50 flex items-center gap-2 rounded-xl border bg-card p-2 shadow-2xl ${className ?? ""}`}
        role="complementary"
        aria-label="ROL'OS channel readiness complete"
      >
        <Button
          type="button"
          size="sm"
          className="h-8 text-xs"
          onClick={() => navigate(`/pms/channels?property=${propertyId}`)}
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          Connect Channels
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={dismiss} aria-label="Hide">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  // Property preparation (steps 1-7) is clean: the remaining steps (8-10 — push,
  // currency, sign-off) are administrative, so the wizard stops opening itself and
  // shows a single Connect Channel action. A partial push is surfaced as a quiet
  // marker only — the error text and the retry live on the Publish card.
  if (blockingMacros.length === 0 && !pillOpened) {
    return (
      <div
        className={`fixed bottom-[4.75rem] right-4 md:bottom-4 z-50 flex items-center gap-1 rounded-full border bg-card px-1.5 py-1 shadow-lg ${className ?? ""}`}
        role="complementary"
        aria-label="ROL'OS channel readiness"
      >
        <Button
          type="button"
          size="sm"
          className="h-7 rounded-full px-3 text-[11px]"
          onClick={() => navigate(`/pms/channels?property=${propertyId}`)}
        >
          <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
          Connect Channel
        </Button>
        {!publishedOk && unpublishedUnits > 0 && (
          <button
            type="button"
            onClick={() => setPillOpened(true)}
            className="rounded-full px-2 text-[10px] text-muted-foreground hover:text-foreground"
          >
            {unpublishedUnits} unit{unpublishedUnits === 1 ? "" : "s"} not published
          </button>
        )}
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          onClick={() => setPillOpened(true)}
          aria-label="Open channel readiness steps"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </Button>
        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={dismiss} aria-label="Hide">
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }






  return (
    <div
      className={`fixed bottom-[4.75rem] right-4 md:bottom-4 z-50 w-[min(26rem,calc(100vw-2rem))] rounded-xl border bg-card shadow-2xl ${className ?? ""}`}
      role="complementary"
      aria-label="ROL'OS channel readiness"
    >
      <div className="flex items-start gap-2 border-b p-3">
        <Rocket className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-sm font-semibold">Channel readiness</p>
            <Badge variant="outline" className="text-[10px]">
              {overall.macrosComplete}/{overall.macrosTotal} steps
            </Badge>
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {propertyName || "This property"} · {currentMacro ? `Step ${currentMacro.macro.order}: ${currentMacro.macro.title}` : "Complete"}
          </p>
          <Progress value={overall.percent} className="mt-2 h-1.5" />
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={() => void refresh()}
            aria-label="Refresh readiness"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            className="h-7 w-7"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </Button>
          <Button type="button" size="icon" variant="ghost" className="h-7 w-7" onClick={dismiss} aria-label="Hide">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {!collapsed && (
        <ScrollArea className="max-h-[60vh]">
          {completedChips.length > 0 && (
            <div className="flex flex-wrap items-center gap-1 border-b bg-muted/30 px-3 py-2">
              {completedChips.map((m) => (
                <button
                  key={m.macro.key}
                  type="button"
                  onClick={() => setOpenMacro(m.macro.key)}
                  title={`${m.macro.order}. ${m.macro.title}`}
                  aria-label={`Step ${m.macro.order} complete — reopen`}
                  className="flex items-center gap-1 rounded-full border border-emerald-500/40 bg-background px-2 py-0.5 text-[10px] font-medium text-emerald-600 transition-colors hover:bg-emerald-500/10"
                >
                  {m.macro.order}
                  <CheckCircle2 className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
          <div className="divide-y">
            {openMacros.map((m) => (
              <MacroRow
                key={m.macro.key}
                progress={m}
                open={openMacro === m.macro.key}
                onToggle={() => setOpenMacro((prev) => (prev === m.macro.key ? null : m.macro.key))}
                onGoToField={goToField}
                onPushOwner={pushOwner}
                onSignoff={toggleSignoff}
                onSignoffItem={toggleSignoffItem}
                signoffChecks={signoff.checks}
                signedOff={signoff.signed_off}

                busyAction={busyAction}
                isPlatformUser={isPlatformUser}
                onOpenChannels={() => navigate(`/pms/channels?property=${propertyId}`)}
                onOpenMonitor={() =>
                  navigate(`/admin/channel-monitor?tab=onboard&property=${propertyId}`)
                }
                units={unitScope}
              />
            ))}
          </div>
        </ScrollArea>
      )}

    </div>
  );
}

interface RowProps {
  progress: MacroProgress;
  open: boolean;
  onToggle: () => void;
  onGoToField: (section: string, focus?: string, unit?: string) => void;
  onPushOwner: () => void;
  onSignoff: (next: boolean) => void;
  onSignoffItem: (itemKey: string, next: boolean) => void;
  signoffChecks: Record<string, { checked: boolean; by?: string | null; at?: string | null }>;
  signedOff: boolean;
  busyAction: string | null;
  isPlatformUser: boolean;
  onOpenChannels: () => void;
  /** Steps 6–14 are executed on Channel Monitor → Onboard Property. */
  onOpenMonitor: () => void;
  /** Unit names, used to route unit-owned failures that arrive without a unit. */
  units: { sole: string | null; all: string[] };
}

function MacroRow({
  progress,
  open,
  onToggle,
  onGoToField,
  onPushOwner,
  onSignoff,
  onSignoffItem,
  signoffChecks,
  signedOff,
  busyAction,
  isPlatformUser,
  onOpenChannels,
  onOpenMonitor,
  units,
}: RowProps) {

  const { macro, complete, locked, score, fieldItems, stateChecks } = progress;
  const outstandingFields = fieldItems.filter((i) => !i.satisfied);
  const firstOutstandingField = outstandingFields.find((item) => item.tier === "mandatory") ?? outstandingFields[0];
  const blockerTarget = firstBlockingTarget(stateChecks, units);


  return (
    <div className={locked ? "opacity-60" : undefined}>
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
      >
        <StatusIcon complete={complete} locked={locked} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium">
            {macro.order}. {macro.title}
          </span>
          <span className="block truncate text-[10px] text-muted-foreground">{macro.goal}</span>
        </span>
        <Badge variant={complete ? "secondary" : "outline"} className="shrink-0 text-[10px]">
          {score}%
        </Badge>
      </button>

      {open && (
        <div className="space-y-2 px-3 pb-3">
          {locked && (
            <p className="rounded-md bg-muted/60 px-2 py-1.5 text-[11px] text-muted-foreground">
              Complete the previous step first — this step is gated.
            </p>
          )}

          {stateChecks.length > 0 && (
            <ul className="space-y-1">
              {stateChecks.map((c) => {
                const failures = c.ok ? [] : (c.failures ?? []);
                const target = c.ok || failures.length > 0 ? null : resolveCheckTarget(c.key);
                return (
                  <li key={c.key} className="flex items-start gap-2 text-[11px]">
                    {c.ok ? (
                      <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                    ) : (
                      <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="min-w-0 flex-1">
                      {target ? (
                        <button
                          type="button"
                          onClick={() => onGoToField(target.section, target.fieldKey, target.unit)}
                          className="text-left font-medium text-primary underline decoration-dotted underline-offset-2 hover:no-underline"
                        >
                          {c.label} — fix it
                        </button>
                      ) : (
                        <span className={c.ok ? "text-muted-foreground" : "font-medium"}>{c.label}</span>
                      )}
                      {failures.length === 0 && c.detail && (
                        <span className="block text-[10px] text-muted-foreground">{c.detail}</span>
                      )}
                      {failures.length > 0 && (
                        <span className="mt-1 block space-y-1">
                          {failures.map((f, i) => {
                            const ft = resolveFailureTarget(f, c.key, units);
                            return (
                              <button
                                key={`${f.label}-${f.unit ?? ""}-${i}`}
                                type="button"
                                onClick={() => onGoToField(ft.section, ft.fieldKey, ft.unit)}
                                className="flex w-full items-start gap-1.5 rounded-md border border-border/60 px-1.5 py-1 text-left text-[10px] leading-snug text-muted-foreground transition-colors hover:border-primary hover:text-primary"
                              >
                                <span className="min-w-0 flex-1">
                                  {f.unit && <span className="font-medium">{f.unit}: </span>}
                                  {f.detail ?? f.label}
                                </span>
                                <span className="shrink-0 text-[9px] uppercase tracking-wide">
                                  {f.unit ? "Rooms" : "Fix"} →
                                </span>
                              </button>
                            );
                          })}
                        </span>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}



          {outstandingFields.length > 0 && (
            <>
              <Separator />
              <div className="space-y-1">
                <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Outstanding fields
                </p>
                {outstandingFields.slice(0, 8).map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => onGoToField(item.section, item.paintable ? item.key : undefined)}
                    className="flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1 text-left text-[11px] hover:bg-muted/60"
                  >
                    <span className="min-w-0 truncate">{item.label}</span>
                    <Badge
                      variant="outline"
                      className={`shrink-0 text-[9px] ${item.tier === "mandatory" ? "border-primary text-primary" : ""}`}
                    >
                      {item.tier === "mandatory" ? "Required" : "Nice to have"}
                    </Badge>
                  </button>
                ))}
              </div>
            </>
          )}

          {macro.monitorOwned && (
            <div className="rounded-md border border-primary/30 bg-primary/5 p-2">
              <p className="text-[10px] leading-snug text-muted-foreground">
                This step runs as part of the two-step go-live on Channel Monitor → Onboard Property. Nothing needs to
                be driven from here.
              </p>
              {isPlatformUser && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-1.5 h-7 text-[11px]"
                  onClick={onOpenMonitor}
                >
                  Open Onboard Property
                </Button>
              )}
            </div>
          )}

          {macro.notes?.map((note) => (
            <p key={note} className="text-[10px] leading-snug text-muted-foreground">
              {note}
            </p>
          ))}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            {macro.section && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 text-[11px]"
                onClick={() => {
                  // A step's real blocker may live on another page (unit content is
                  // edited on Rooms), so state-check failures win over the macro's
                  // own section.
                  if (blockerTarget) {
                    onGoToField(blockerTarget.section, blockerTarget.fieldKey, blockerTarget.unit);
                    return;
                  }
                  onGoToField(
                    firstOutstandingField?.section ?? (macro.section as string),
                    firstOutstandingField?.paintable ? firstOutstandingField.key : undefined,
                  );
                }}
              >
                Open step
              </Button>
            )}


            {macro.action === "ensure_owner" && isPlatformUser && !complete && (
              <Button
                type="button"
                size="sm"
                className="h-7 text-[11px]"
                disabled={locked || busyAction === "ensure_owner"}
                onClick={onPushOwner}
              >
                {busyAction === "ensure_owner" ? (
                  <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                ) : null}
                Push owner
              </Button>
            )}

            {macro.action === "signoff" && isPlatformUser && (
              <div className="w-full space-y-1.5 rounded-md border bg-muted/20 p-2">
                {ROLOS_SIGNOFF_CHECKLIST.map((item) => {
                  const record = signoffChecks?.[item.key];
                  return (
                    <label key={item.key} className="flex items-start gap-2 text-[11px] leading-snug">
                      <Checkbox
                        className="mt-0.5"
                        checked={record?.checked === true}
                        disabled={locked || busyAction === `signoff:${item.key}`}
                        onCheckedChange={(v) => onSignoffItem(item.key, v === true)}
                      />
                      <span className="min-w-0 flex-1">
                        {item.label}
                        {record?.checked && record.by ? (
                          <span className="block text-[10px] text-muted-foreground">
                            {record.by}
                            {record.at ? ` · ${new Date(record.at).toLocaleDateString()}` : ""}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
                {!signedOff && (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 w-full text-[11px]"
                    disabled={locked || busyAction === "signoff"}
                    onClick={() => onSignoff(true)}
                  >
                    Confirm all items
                  </Button>
                )}
                {signedOff && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 w-full text-[11px]"
                    disabled={locked || busyAction === "signoff"}
                    onClick={() => onSignoff(false)}
                  >
                    Clear sign-off
                  </Button>
                )}
              </div>
            )}


            {macro.action === "open_channels" && (
              <Button
                type="button"
                size="sm"
                className="h-7 text-[11px]"
                disabled={locked}
                onClick={onOpenChannels}
              >
                Open Channels
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RolosOnboardingWizard;
