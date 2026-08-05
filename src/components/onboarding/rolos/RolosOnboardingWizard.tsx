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
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { focusRequirementField } from "@/lib/requirementFocus";

import { useRolosOnboardingProgress, type MacroProgress } from "@/hooks/useRolosOnboardingProgress";

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

function StatusIcon({ complete, locked }: { complete: boolean; locked: boolean }) {
  if (complete) return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  if (locked) return <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  return <Circle className="h-4 w-4 shrink-0 text-primary" />;
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
    signoff,
    recordSignoff,
    recordSignoffCheck,
    refresh,

    isLoading,
    isFetching,
    propertyName,
  } = useRolosOnboardingProgress(propertyId);

  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [dismissed, setDismissed] = useState(false);
  const [openMacro, setOpenMacro] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(`${DISMISS_KEY}:${propertyId ?? ""}`) === "1");
    } catch {
      /* ignore */
    }
  }, [propertyId]);

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
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    try {
      sessionStorage.setItem(`${DISMISS_KEY}:${propertyId ?? ""}`, "1");
    } catch {
      /* ignore */
    }
  }, [propertyId]);

  const goToField = useCallback(
    (section: string, focus?: string) => {
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




  if (!propertyId || dismissed) return null;
  if (isLoading) return null;
  if (!isRolosPms) return null;

  return (
    <div
      className={`fixed bottom-4 right-4 z-50 w-[min(26rem,calc(100vw-2rem))] rounded-xl border bg-card shadow-2xl ${className ?? ""}`}
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
                signedOff={signoff.signed_off}
                busyAction={busyAction}
                isPlatformUser={isPlatformUser}
                onOpenChannels={() => navigate(`/pms/channels?property=${propertyId}`)}
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
  onGoToField: (section: string, focus?: string) => void;
  onPushOwner: () => void;
  onSignoff: (next: boolean) => void;
  signedOff: boolean;
  busyAction: string | null;
  isPlatformUser: boolean;
  onOpenChannels: () => void;
}

function MacroRow({
  progress,
  open,
  onToggle,
  onGoToField,
  onPushOwner,
  onSignoff,
  signedOff,
  busyAction,
  isPlatformUser,
  onOpenChannels,
}: RowProps) {
  const { macro, complete, locked, score, fieldItems, stateChecks } = progress;
  const outstandingFields = fieldItems.filter((i) => !i.satisfied);
  const firstOutstandingField = outstandingFields.find((item) => item.tier === "mandatory") ?? outstandingFields[0];

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
              {stateChecks.map((c) => (
                <li key={c.key} className="flex items-start gap-2 text-[11px]">
                  {c.ok ? (
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-500" />
                  ) : (
                    <Circle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0">
                    <span className={c.ok ? "text-muted-foreground" : "font-medium"}>{c.label}</span>
                    {c.detail && <span className="block text-[10px] text-muted-foreground">{c.detail}</span>}
                  </span>
                </li>
              ))}
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
                onClick={() =>
                  onGoToField(
                    firstOutstandingField?.section ?? (macro.section as string),
                    firstOutstandingField?.paintable ? firstOutstandingField.key : undefined,
                  )
                }
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
              <label className="flex items-center gap-2 text-[11px]">
                <Checkbox
                  checked={signedOff}
                  disabled={locked || busyAction === "signoff"}
                  onCheckedChange={(v) => onSignoff(v === true)}
                />
                I have verified the live sub-account
              </label>
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
