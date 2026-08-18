import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Circle,
  Loader2,
  Lock,
  RefreshCw,
  Rocket,
  UploadCloud,
} from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Badge } from "@/components/ui/badge";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useBillingConfig } from "@/hooks/useBillingConfig";
import { usePropertyReadiness } from "@/hooks/usePropertyReadiness";
import {
  useRolosOnboardingProgress,
  type DistributionCheck,
  type DistributionFailure,
  type MacroProgress,
} from "@/hooks/useRolosOnboardingProgress";
import {
  buildStageProgress,
  editorSectionForMacro,
  macroKeyForSection,
  EDITOR_SECTIONS,
  editorSectionsForMacro,
  type ChannelOnboardingStageKey,
} from "@/config/channelOnboardingStages";

import { ROLOS_SIGNOFF_CHECKLIST } from "@/config/rolosOnboardingMacros";
import { CHECK_TO_FIELD_KEYS, PROPERTY_FIELD_REQUIREMENTS } from "@/config/propertyFieldRequirements";
import { resolveMcqRequirement } from "@/lib/mcqRequirements";
import { focusRequirementField, focusUnitCard } from "@/lib/requirementFocus";
import { pushPropertyToRu } from "@/lib/ruPushDriver";
import { extractFunctionError } from "@/lib/functionError";
import { OnboardingTobiPanel } from "@/components/onboarding/OnboardingTobiPanel";
import PropertyForm from "@/pages/PropertyForm";
import PropertyContactDetails from "@/components/property/PropertyContactDetails";
import { PropertyRuOwnerPanel } from "@/components/property/PropertyRuOwnerPanel";
import { RuWhiteLabelEmbed } from "@/components/pms/channels/RuWhiteLabelEmbed";
import { RuCurrencyNotice } from "@/components/pms/channels/RuCurrencyNotice";

interface Props {
  propertyId: string;
  variant: "admin" | "pms";
}

interface BlockerTarget {
  section: string;
  fieldKey?: string;
  unit?: string;
}

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

function resolveCheckTarget(checkKey: string): BlockerTarget | null {
  const fieldKeys = CHECK_TO_FIELD_KEYS[checkKey];
  if (!fieldKeys?.length) return null;
  for (const key of fieldKeys) {
    const req = PROPERTY_FIELD_REQUIREMENTS.find((r) => r.key === key);
    if (req) return { section: req.section, fieldKey: req.key };
  }
  return null;
}

function unitFromMessage(text: string, knownUnits: string[]): string | undefined {
  const prefix = text.split(":")[0]?.trim();
  if (!prefix || prefix.length > 60) return undefined;
  return knownUnits.find((u) => u.toLowerCase() === prefix.toLowerCase());
}

function resolveFailureTarget(
  failure: DistributionFailure,
  checkKey: string,
  units: { sole: string | null; all: string[] },
): BlockerTarget {
  const text = `${failure.label} ${failure.detail ?? ""}`;
  const req = resolveMcqRequirement(text);
  const unit =
    failure.unit ||
    unitFromMessage(failure.detail ?? failure.label, units.all) ||
    (UNIT_OWNED_CHECKS.has(checkKey) ? (units.sole ?? undefined) : undefined);
  if (unit) {
    const mapped = resolveCheckTarget(checkKey);
    return { section: "rooms", unit, fieldKey: mapped?.fieldKey };
  }
  if (req) return { section: req.section, fieldKey: req.focusKey };
  return resolveCheckTarget(checkKey) ?? { section: "general" };
}

function StatusDot({ complete, locked }: { complete: boolean; locked: boolean }) {
  if (locked) return <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />;
  if (complete) return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />;
  return <Circle className="h-4 w-4 shrink-0 text-primary" />;
}

export function ChannelOnboardingWorkspace({ propertyId, variant }: Props) {
  const { user, isAdmin, isDev, isFearlessLeader } = useAuth();
  const isPlatformUser = isAdmin || isDev || isFearlessLeader;
  const [searchParams, setSearchParams] = useSearchParams();

  const progress = useRolosOnboardingProgress(propertyId);
  const readiness = usePropertyReadiness(propertyId);
  const billing = useBillingConfig(propertyId);

  const {
    isRolosPms,
    macros,
    overall,
    channelsConnected,
    channelsLive,
    readyRegressed,
    publishedOk,
    unpublishedUnits,
    signoff,
    recordSignoff,
    recordSignoffCheck,
    listingPull,
    subAccountEmail,
    companyProfile,
    sendCompanyDetails,

    recordListingPull,
    refresh,
    isLoading,
    isFetching,
    propertyName,
    ownerEmail,
    websiteLive,
    soleUnitName,
    unitNames,
  } = progress;

  const unitScope = useMemo(
    () => ({ sole: soleUnitName ?? null, all: unitNames ?? [] }),
    [soleUnitName, unitNames],
  );

  /**
   * Read-back state drives whether the manual fetch is offered at all. While the automatic
   * read-back is still settling (rate-limit window, channel silence) the manual escape hatch
   * stays hidden — a clean push must not read as a failure.
   */
  const [readBackPending, setReadBackPending] = useState(false);
  const listingsVerified = useMemo(
    () =>
      macros
        .flatMap((m) => m.stateChecks)
        .find((c) => c.key === "listings_verified")?.ok === true,
    [macros],
  );


  const stages = useMemo(() => buildStageProgress(macros), [macros]);
  const firstOpenStage = stages.find((s) => !s.complete) ?? stages[stages.length - 1];

  const requestedMacro = searchParams.get("step");
  const requestedSection = searchParams.get("section");

  const [activeMacroKey, setActiveMacroKey] = useState<string | null>(requestedMacro);
  const [editorSection, setEditorSection] = useState(requestedSection || "general");
  const [liveExpanded, setLiveExpanded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [pushErrors, setPushErrors] = useState<string[]>([]);

  /**
   * One owner of "current step". The user's pick is honoured while that step
   * still has work; once it completes the wizard advances by itself (and keeps
   * the URL in step) instead of stranding the user on a finished step.
   */
  useEffect(() => {
    if (macros.length === 0) return;
    setActiveMacroKey((prev) => {
      if (prev && macros.some((m) => m.macro.key === prev && !m.complete)) return prev;
      const next =
        firstOpenStage?.currentMacro?.macro.key ??
        firstOpenStage?.macros[0]?.macro.key ??
        macros[macros.length - 1]?.macro.key ??
        null;
      return next ?? prev;
    });
  }, [firstOpenStage, macros]);

  const activeMacro = macros.find((m) => m.macro.key === activeMacroKey) ?? null;
  const activeStageKey: ChannelOnboardingStageKey =
    stages.find((s) => s.macros.some((m) => m.macro.key === activeMacroKey))?.def.key ??
    firstOpenStage?.def.key ??
    "ready";

  const compactLive = variant === "pms" && channelsLive && !liveExpanded;

  const selectMacro = useCallback(
    (key: string, section?: string, focus?: string) => {
      setActiveMacroKey(key);
      const nextSection = section || editorSectionForMacro(key);
      setEditorSection(nextSection);
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          next.set("step", key);
          next.set("section", nextSection);
          if (focus) next.set("focus", focus);
          else next.delete("focus");
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const goToField = useCallback(
    (section: string, focus?: string, unit?: string) => {
      const ownerKey =
        macros.find((m) => m.macro.section === section && !m.complete)?.macro.key ??
        macroKeyForSection(section) ??
        activeMacroKey ??
        "identity";
      selectMacro(ownerKey, section, focus);
      window.setTimeout(() => {
        if (unit) {
          focusUnitCard(unit);
          if (focus) window.setTimeout(() => focusRequirementField(focus), 350);
          return;
        }
        if (focus) focusRequirementField(focus);
      }, 400);
    },
    [activeMacroKey, macros, selectMacro],
  );


  const pushOwner = useCallback(async () => {
    setBusy("ensure_owner");
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "ensure_owner_account", property_id: propertyId },
      });
      if (error || data?.success !== true) {
        toast.error(data?.error?.message ?? error?.message ?? "Could not create the distribution identity");
      } else {
        toast.success("Distribution identity created");
        await refresh();
      }
    } finally {
      setBusy(null);
    }
  }, [propertyId, refresh]);

  /**
   * Step 9 — pull whatever already exists under the sub-account and adopt those
   * listing IDs so the later push updates instead of duplicating. An empty
   * sub-account is a valid pass.
   */
  const pullListings = useCallback(async () => {
    setBusy("pull_listings");
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "resolve_ru_property_ids", property_id: propertyId },
      });
      if (error || data?.success !== true) {
        const reason = error
          ? await extractFunctionError(error, "Could not list the sub-account's listings")
          : data?.error?.message ?? "Could not list the sub-account's listings";
        toast.error(reason);
        return;
      }

      const matched = Array.isArray(data.matched) ? data.matched.length : 0;
      const unmatched = Array.isArray(data.unmatched) ? data.unmatched.length : 0;
      const conflicts = Array.isArray(data.conflicts) ? data.conflicts : [];
      const remoteCount = Number(data.remote_count ?? 0);
      const ownerLabel = typeof data.ru_owner_label === "string" ? data.ru_owner_label : null;
      await recordListingPull(
        {
          matched,
          unmatched,
          remoteCount,
          account: ownerLabel,
          ownerId: data.ru_owner_id != null ? String(data.ru_owner_id) : null,
          authMode: typeof data.auth_mode === "string" ? data.auth_mode : null,
        },
        user?.email ?? null,
      );
      if (conflicts.length > 0) {
        toast.warning(
          `${conflicts.length} listing(s) are already claimed by another record: ${conflicts
            .map((c: { name?: string; ru_property_id?: string; held_by?: string }) =>
              `${c.name} → #${c.ru_property_id} (${c.held_by})`,
            )
            .join(", ")}`,
        );
      }
      toast.success(
        remoteCount === 0
          ? `${ownerLabel ?? "The sub-account"} returned no listings — nothing to adopt`
          : `${matched} listing(s) adopted${unmatched > 0 ? `, ${unmatched} unmatched` : ""}`,
      );

      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not pull listings");
    } finally {
      setBusy(null);
    }
  }, [propertyId, recordListingPull, refresh, user?.email]);

  /**
   * Push_FillCompanyDetails_RQ. The sub-account's company profile must be sent with
   * its own verified keys before the verification checklist can be completed.
   */
  const pushCompanyDetails = useCallback(async () => {
    setBusy("company_details");
    try {
      const { pushed, error } = await sendCompanyDetails(true);
      if (pushed) toast.success("Company profile sent to the Channel Manager");
      else toast.error(error ?? "Could not send the company profile");
    } finally {
      setBusy(null);
    }
  }, [sendCompanyDetails]);


  const publishListing = useCallback(async () => {
    setBusy("publish");
    setPushErrors([]);
    try {
      const data = await pushPropertyToRu(propertyId);
      if (!data?.success) {
        const reasons = [...((data?.blockers as unknown[]) ?? []), ...((data?.gaps as unknown[]) ?? [])].map(String);
        const unitFailures = (data?.units ?? [])
          .filter((u) => u.success === false)
          .map((u) => `${u.name ?? "Unit"} — ${u.error ?? "failed"}`);
        const all = [...reasons, ...unitFailures];
        setPushErrors(all);
        toast.error(data?.error?.message ?? "Push failed", {
          description: all.slice(0, 3).join(" · ") || undefined,
          duration: 12000,
        });
      } else {
        const pushed = (data.units ?? []).filter((u) => u.success).length;
        // The push now reads its own listings back, so the toast can report the confirmed
        // state instead of leaving the checklist on "pushed but not read back".
        const verification = (data as {
          listing_verification?: {
            verified?: boolean;
            pending?: boolean;
            verified_units?: number;
            expected_units?: number;
            error?: string;
            listing_status?: { name: string; status: string; owner_label?: string }[];
          };
        }).listing_verification;
        const confirmed = verification?.verified === true;
        const pending = !confirmed && verification?.pending === true;
        setReadBackPending(pending);
        const misplaced = (verification?.listing_status ?? []).filter((l) => l.status !== "live_in_account");
        toast.success(
          pushed > 0
            ? `Published ${pushed} unit(s) to the Channel Manager`
            : "Listing published to the Channel Manager",
          {
            description: confirmed
              ? `Listings read back and confirmed${
                verification?.expected_units
                  ? ` (${verification.verified_units}/${verification.expected_units})`
                  : ""
              }.`
              : pending
                ? "Confirming listings with the channel — this finishes on its own."
                : verification
                  ? `${misplaced.length > 0
                    ? `${misplaced.map((l) => l.name).slice(0, 3).join(", ")} not found in ${misplaced[0]?.owner_label ?? "the bound sub-account"}. `
                    : ""}${verification.error ?? ""}`.trim() || "Read-back did not confirm the listings."
                  : undefined,
          },
        );
        await refresh();
      }

    } catch (err) {
      const message = err instanceof Error ? err.message : await extractFunctionError(err, "Push failed");
      setPushErrors([message]);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }, [propertyId, refresh]);

  /**
   * Manual retry for the read-back only — the push chains this itself, so this is the
   * escape hatch for when that read-back failed (rate limit, channel hiccup).
   */
  const verifyListings = useCallback(async () => {
    setBusy("verify_listings");
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "resolve_ru_property_ids", property_id: propertyId },
      });
      if (error || data?.success !== true) {
        const reason = error
          ? await extractFunctionError(error, "Could not read the listings back")
          : data?.error?.message ?? "Could not read the listings back";
        toast.error(reason);
        return;
      }

      const matched = Array.isArray(data.matched) ? data.matched.length : 0;
      toast.success(`${matched} listing(s) confirmed on the channel`);
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not read the listings back");
    } finally {
      setReadBackPending(false);
      setBusy(null);
    }
  }, [propertyId, refresh]);

  /**
   * A deferred channel read-back must have a terminal state. Give the channel a
   * short settling window, retry once automatically, then reveal the manual
   * retry if that call is rate-limited or cannot confirm the listing.
   */
  useEffect(() => {
    if (!readBackPending) return;
    if (listingsVerified) {
      setReadBackPending(false);
      return;
    }

    const timer = window.setTimeout(() => {
      void verifyListings();
    }, 15_000);

    return () => window.clearTimeout(timer);
  }, [listingsVerified, readBackPending, verifyListings]);


  const toggleWebsite = useCallback(
    async (next: boolean) => {
      if (!isPlatformUser) return;
      setBusy("website");
      try {
        const { error } = await supabase.from("properties").update({ show_on_website: next }).eq("id", propertyId);
        if (error) throw error;
        toast.success(next ? "Property is now on the website" : "Property hidden from the website");
        await refresh();
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Could not update website visibility");
      } finally {
        setBusy(null);
      }
    },
    [isPlatformUser, propertyId, refresh],
  );

  const enableChannelManager = useCallback(async () => {
    if (!isPlatformUser) return;
    setBusy("entitlement");
    try {
      await billing.upsert.mutateAsync({
        ...(billing.config ?? { billing_strategy: "commission" }),
        property_id: propertyId,
        channel_manager_enabled: true,
      });
      const { error } = await supabase.functions.invoke("channel-manager-entitlement", {
        body: {
          scope: billing.scope.source === "portfolio" && billing.scope.portfolioId ? "portfolio" : "property",
          entity_id:
            billing.scope.source === "portfolio" && billing.scope.portfolioId
              ? billing.scope.portfolioId
              : propertyId,
          enabled: true,
        },
      });
      if (error) toast.error(error.message);
      else toast.success("Channel Manager enabled — connect channels below");
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not enable Channel Manager");
    } finally {
      setBusy(null);
    }
  }, [billing, isPlatformUser, propertyId, refresh]);

  const nextAction = useMemo(() => {
    const open = stages.find((s) => !s.complete);
    const macro = open?.currentMacro ?? activeMacro;
    if (!macro) return { label: "Channels are live", disabled: true, run: () => undefined, reason: undefined as string | undefined };
    const reason = macro.actionBlockedReason;
    // Steps whose blocker is a mandatory field / check still route to the fix;
    // only the distribution actions themselves wait on a prerequisite.
    const gatedAction = !!reason;
    if (macro.macro.key === "push_owner" && isPlatformUser) {
      return {
        label: "Create distribution identity",
        disabled: gatedAction || busy === "ensure_owner",
        run: () => void pushOwner(),
        reason,
      };
    }
    if (macro.macro.key === "company_profile" && isPlatformUser) {
      return {
        label: companyProfile.sending ? "Sending company profile…" : "Send company profile",
        disabled: gatedAction || companyProfile.sending || busy === "company_details",
        run: () => void pushCompanyDetails(),
        reason,
      };
    }
    if (macro.macro.key === "pull_listings" && isPlatformUser) {
      return {
        label: "Pull listings",
        disabled: gatedAction || busy === "pull_listings",
        run: () => void pullListings(),
        reason,
      };
    }
    if (macro.macro.key === "publish") {
      if (publishedOk) {
        return {
          label: "Published — review step",
          disabled: false,
          run: () => selectMacro("publish"),
          reason,
        };
      }
      return {
        label: isPlatformUser ? "Publish listing" : "Review publish step",
        disabled: isPlatformUser ? gatedAction || busy === "publish" : false,
        run: () => (isPlatformUser ? void publishListing() : selectMacro("publish")),
        reason,
      };
    }

    if (macro.macro.key === "entitlement") {
      if (!isPlatformUser) {
        return {
          label: "Waiting on ROL to enable Channel Manager",
          disabled: true,
          run: () => undefined,
          reason: "Your account manager switches this on — nothing for you to do here.",
        };
      }
      return {
        label: "Enable Channel Manager",
        disabled: gatedAction || busy === "entitlement",
        run: () => void enableChannelManager(),
        reason,
      };
    }
    if (macro.macro.key === "connect") {
      return {
        label: "Connect a channel below",
        disabled: gatedAction,
        run: () => selectMacro("connect"),
        reason,
      };
    }
    if (macro.macro.key === "signoff" && !isPlatformUser) {
      return {
        label: "Waiting on ROL sign-off",
        disabled: true,
        run: () => undefined,
        reason: "A ROL admin confirms the live sub-account.",
      };
    }
    const firstField = macro.fieldItems.find((i) => !i.satisfied && i.tier === "mandatory") ?? macro.fieldItems.find((i) => !i.satisfied);
    // Never point the primary action at a check the resolver could not judge —
    // there is no field behind it, so the button would go nowhere.
    const firstCheck =
      macro.stateChecks.find((c) => !c.ok && !c.unknown && !c.waiting && !!resolveCheckTarget(c.key)) ??
      macro.stateChecks.find((c) => !c.ok && !c.unknown && !c.waiting);
    return {
      label: firstField ? `Fix: ${firstField.label}` : firstCheck ? `Fix: ${firstCheck.label}` : "Open step",
      disabled: false,
      reason,
      run: () => {
        if (firstField) {
          goToField(firstField.section, firstField.paintable ? firstField.key : undefined);
          return;
        }
        if (firstCheck) {
          const target = resolveCheckTarget(firstCheck.key);
          goToField(target?.section ?? macro.macro.section ?? "general", target?.fieldKey);
          return;
        }
        selectMacro(macro.macro.key);
      },
    };
  }, [
    activeMacro,
    busy,
    companyProfile.sending,
    enableChannelManager,
    goToField,
    isPlatformUser,
    pushCompanyDetails,

    publishListing,
    publishedOk,

    pullListings,
    pushOwner,
    selectMacro,
    stages,
  ]);


  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-sm text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        Loading go-live status…
      </div>
    );
  }

  if (!isRolosPms) {
    return (
      <div className="mx-auto max-w-xl rounded-lg border border-dashed p-8 text-center">
        <h1 className="text-lg font-semibold">Channel onboarding is for ROL'OS properties</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          This party is not on ROL'OS as its PMS, so there is no Channel Manager listing to publish.
          Switch the property to ROL'OS first, or manage its existing PMS from Property Setup.
        </p>
        {variant === "admin" && (
          <Button asChild className="mt-4" variant="outline">
            <Link to={`/admin/properties/${propertyId}`}>Open property</Link>
          </Button>
        )}
      </div>
    );
  }

  if (compactLive) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">Channels</h1>
            <p className="text-sm text-muted-foreground">
              {propertyName || "This property"} · {channelsConnected} channel{channelsConnected === 1 ? "" : "s"} connected
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setLiveExpanded(true)}>
            Review go-live
          </Button>
        </div>
        <RuCurrencyNotice propertyId={propertyId} />
        <RuWhiteLabelEmbed propertyId={propertyId} />
      </div>
    );
  }

  const websiteScore = readiness.mandatoryScore ?? 0;

  return (
    <div className="flex min-h-[70vh] flex-col gap-4">
      <header className="space-y-3 border-b pb-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {variant === "admin" && (
              <Link
                to="/admin/onboarding"
                className="mb-1 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" />
                All properties
              </Link>
            )}
            <div className="flex flex-wrap items-center gap-2">
              <Rocket className="h-5 w-5 text-primary" />
              <h1 className="truncate text-xl font-semibold">{propertyName || "Party go-live"}</h1>
              {ownerEmail && <span className="truncate text-sm text-muted-foreground">{ownerEmail}</span>}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              One place to take this party live on channels. Do the highlighted next step — you do not need the rest of the menu.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm" className="h-8 text-xs">
              <Link
                to={
                  variant === "admin"
                    ? `/admin/properties/${propertyId}`
                    : `/pms/property-setup?property=${propertyId}`
                }
              >
                Full editor
              </Link>
            </Button>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              onClick={() => void refresh({ probeAri: true })}
              aria-label="Refresh readiness"
              title="Re-check readiness, including the live channel calendar"
            >
              {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>

            <Button type="button" onClick={nextAction.run} disabled={nextAction.disabled || !!busy}>
              {busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {nextAction.label}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <ScoreChip label="Website" value={websiteScore} live={websiteLive} liveLabel="On site" />
            {isPlatformUser && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 text-xs"
                disabled={busy === "website"}
                onClick={() => void toggleWebsite(!websiteLive)}
              >
                {websiteLive ? "Hide from site" : "Show on website"}
              </Button>
            )}
          </div>
          <ScoreChip
            label="Channels"
            value={overall.percent}
            live={channelsConnected > 0}
            liveLabel={`${channelsConnected} live`}
          />
          <div className="min-w-[12rem] flex-1">
            <Progress value={overall.percent} className="h-2" />
            <p className="mt-1 text-[11px] text-muted-foreground">
              {overall.macrosComplete}/{overall.macrosTotal} steps
              {!publishedOk && unpublishedUnits > 0 ? ` · ${unpublishedUnits} unit(s) unpublished` : ""}
            </p>
          </div>
        </div>
      </header>

      {readyRegressed && (

        <div className="rounded-md border border-amber-500/50 bg-amber-500/10 px-3 py-2 text-xs text-foreground">
          This party is live on {channelsConnected} channel{channelsConnected === 1 ? "" : "s"}, but a readiness
          check has regressed. Distribution keeps running — review the flagged steps below when convenient.
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav className="space-y-4" aria-label="Go-live stages">
          {stages.map((stage) => (
            <div key={stage.def.key}>
              <div className="mb-1 flex items-center gap-2">
                <StatusDot complete={stage.complete} locked={false} />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">{stage.def.title}</p>
                  <p className="text-[11px] leading-snug text-muted-foreground">{stage.def.goal}</p>
                </div>
                <Badge variant={stage.complete ? "secondary" : "outline"} className="ml-auto text-[10px]">
                  {stage.score}%
                </Badge>
              </div>
              <ul className="ml-6 space-y-0.5 border-l pl-3">
                {stage.macros.map((m) => {
                    const active = m.macro.key === activeMacroKey;
                    return (
                      <li key={m.macro.key}>
                        <button
                          type="button"
                          onClick={() => selectMacro(m.macro.key)}
                          title={m.actionBlockedReason}
                          className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs ${
                            active ? "bg-primary/10 font-medium text-foreground" : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          <StatusDot complete={m.complete} locked={false} />
                          <span className="min-w-0 flex-1 truncate">{m.macro.title}</span>
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </nav>

        <section className="min-w-0 space-y-4">
          {activeMacro && (
            <div className="rounded-lg border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">
                    {activeMacro.macro.order}. {activeMacro.macro.title}
                  </p>
                  <p className="text-xs text-muted-foreground">{activeMacro.macro.goal}</p>
                </div>
                <Badge variant={activeMacro.complete ? "secondary" : "outline"}>{activeMacro.score}%</Badge>
              </div>
              {activeMacro.actionBlockedReason && (
                <p className="mt-2 rounded-md bg-muted px-2 py-1.5 text-[11px] text-muted-foreground">
                  {activeMacro.actionBlockedReason} You can still review and prepare this step.
                </p>
              )}

              <BlockerList
                progress={activeMacro}
                units={unitScope}
                onGoToField={goToField}
              />
              <div className="mt-3">
                <OnboardingTobiPanel
                  context={{
                    wizard: "channel",
                    propertyId,
                    propertyName: propertyName || "this property",
                    stage: activeStageKey,
                    stepTitle: activeMacro.macro.title,
                    stepGoal: activeMacro.macro.goal,
                    stepLocked: activeMacro.locked,
                    previousStep: macros.find((m) => !m.complete && m.macro.order < activeMacro.macro.order)
                      ?.macro.title,
                    score: activeMacro.score,
                    blockers: [
                      ...activeMacro.stateChecks
                        .filter((c) => !c.ok)
                        .flatMap((c) => {
                          const target = resolveCheckTarget(c.key);
                          if (c.failures?.length) {
                            return c.failures.map((f) => ({
                              label: f.unit ? `${f.unit}: ${f.label}` : f.label,
                              detail: f.detail,
                              section: target?.section,
                              fieldKey: target?.fieldKey,
                              unit: f.unit,
                              mandatory: f.mandatory,
                            }));
                          }
                          return [
                            {
                              label: c.label,
                              detail: c.detail,
                              section: target?.section,
                              fieldKey: target?.fieldKey,
                              mandatory: true,
                            },
                          ];
                        }),
                      ...activeMacro.fieldItems
                        .filter((i) => !i.satisfied)
                        .map((i) => ({
                          label: i.label,
                          detail: i.detail,
                          section: i.section,
                          fieldKey: i.paintable ? i.key : undefined,
                          mandatory: i.tier === "mandatory",
                        })),
                    ],
                  }}
                  onOpenField={(section, fieldKey, unit) => goToField(section, fieldKey, unit)}
                />
              </div>
            </div>
          )}

          {/*
            The embedded editor follows the section, not the stage: a "Fix" from a
            later step (e.g. rate plans or contacts) must still land on an editable
            surface instead of an empty pane.
          */}
          {activeMacro && editorSectionsForMacro(activeMacro.macro.key).length > 1 && (
            <div className="flex flex-wrap gap-1.5 rounded-lg border bg-card p-2">
              {editorSectionsForMacro(activeMacro.macro.key).map((tab) => (
                <Button
                  key={tab.section}
                  type="button"
                  size="sm"
                  variant={editorSection === tab.section ? "default" : "outline"}
                  className="h-7 text-xs"
                  onClick={() => goToField(tab.section)}
                >
                  {tab.label}
                </Button>
              ))}
            </div>
          )}

          {EDITOR_SECTIONS.has(editorSection) &&
            (activeStageKey === "ready" ||
              (activeMacro?.fieldItems.some((i) => !i.satisfied) ?? false) ||
              (activeMacro
                ? editorSectionsForMacro(activeMacro.macro.key).some((t) => t.section === editorSection)
                : false)) && (
            <div className="overflow-hidden rounded-lg border bg-background">
              {editorSection === "contacts" ? (
                <PropertyContactDetails propertyId={propertyId} />
              ) : (
                <PropertyForm
                  key={`${propertyId}-${editorSection}`}
                  embeddedPropertyId={propertyId}
                  embeddedInitialTab={editorSection}
                  embeddedOverride
                  forceTabsOverride
                />
              )}
            </div>
          )}


          {activeStageKey === "published" && (
            <PublishedPane
              propertyId={propertyId}
              macroKey={activeMacro?.macro.key ?? ""}
              isPlatformUser={isPlatformUser}
              locked={!!activeMacro?.locked}
              busy={busy}
              signoff={signoff}
              listingPull={listingPull}
              onPullListings={pullListings}
              pushErrors={pushErrors}
              unpublishedUnits={unpublishedUnits}
              publishedOk={publishedOk}
              entitlementOn={billing.config?.channel_manager_enabled === true}
              onPushOwner={pushOwner}
              subAccountEmail={subAccountEmail}
              onPublish={publishListing}
              listingsVerified={listingsVerified}
              readBackPending={readBackPending && !listingsVerified}
              onVerifyListings={verifyListings}

              onEnable={enableChannelManager}
              onPushCompanyDetails={pushCompanyDetails}
              companyProfile={companyProfile}
              onSignoffItem={(key, next) => {
                recordSignoffCheck(key, next, user?.email ?? null).catch((e) =>
                  toast.error(e instanceof Error ? e.message : String(e)),
                );
              }}
              onSignoffAll={(next) => {
                recordSignoff(next, user?.email ?? null).catch((e) =>
                  toast.error(`Could not save the sign-off: ${e instanceof Error ? e.message : String(e)}`),
                );
              }}
            />
          )}

          {activeStageKey === "live" && (
            <div className="space-y-3">
              {!overall.readyToConnect && (
                <p className="rounded-md border border-dashed px-3 py-2 text-sm text-muted-foreground">
                  Finish Published first — the channel console unlocks when Channel Manager is enabled and the listing is signed off.
                </p>
              )}
              {overall.readyToConnect ? (
                <>
                  <RuCurrencyNotice propertyId={propertyId} />
                  <RuWhiteLabelEmbed propertyId={propertyId} />
                </>
              ) : null}
              {isPlatformUser && (
                <p className="text-[11px] text-muted-foreground">
                  Push failures and sync logs stay in{" "}
                  <Link to="/admin/integrations/rentals-united" className="underline underline-offset-2">
                    Channel diagnostics
                  </Link>
                  .
                </p>
              )}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function ScoreChip({
  label,
  value,
  live,
  liveLabel,
}: {
  label: string;
  value: number;
  live: boolean;
  liveLabel: string;
}) {
  return (
    <div className="rounded-md border px-3 py-1.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-sm font-semibold">
        {live ? liveLabel : `${value}%`}
      </p>
    </div>
  );
}

function BlockerList({
  progress,
  units,
  onGoToField,
}: {
  progress: MacroProgress;
  units: { sole: string | null; all: string[] };
  onGoToField: (section: string, focus?: string, unit?: string) => void;
}) {
  const outstanding = progress.fieldItems.filter((i) => !i.satisfied);
  const checks = progress.stateChecks;
  /**
   * Actionable = something the user can actually correct. Checks that are merely
   * waiting on an earlier step, or that the resolver could not judge, are shown
   * separately and without a Fix button — presenting them as blockers is what made
   * the wizard feel wrong ("none of these are true").
   */
  const actionable = checks.filter((c) => !c.ok && !c.unknown && !c.waiting);
  const pending = checks.filter((c) => !c.ok && (c.unknown || c.waiting));
  if (outstanding.length === 0 && actionable.length === 0 && pending.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {actionable.map((c) => (
        <CheckRows key={c.key} check={c} units={units} onGoToField={onGoToField} />
      ))}
      {outstanding.slice(0, 8).map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={() => onGoToField(item.section, item.paintable ? item.key : undefined)}
          className="flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:border-primary"
        >
          <span className="min-w-0 truncate">{item.label}</span>
          <span className={item.tier === "mandatory" ? "text-[10px] text-primary" : "text-[10px] text-muted-foreground"}>
            {item.tier === "mandatory" ? "Required" : "Nice to have"}
          </span>
        </button>
      ))}
      {pending.length > 0 && (
        <div className="rounded-md border border-dashed px-2 py-1.5">
          <p className="text-[11px] font-medium text-muted-foreground">Waiting on the channel — nothing to fix here</p>
          <ul className="mt-1 space-y-0.5">
            {pending.map((c) => (
              <li key={c.key} className="text-[11px] text-muted-foreground">
                {c.label}
                {c.waiting ? " · waiting on an earlier step" : " · not yet resolvable"}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}


function CheckRows({
  check,
  units,
  onGoToField,
}: {
  check: DistributionCheck;
  units: { sole: string | null; all: string[] };
  onGoToField: (section: string, focus?: string, unit?: string) => void;
}) {
  const failures = check.failures ?? [];
  if (failures.length === 0) {
    const target = resolveCheckTarget(check.key);
    return (
      <button
        type="button"
        onClick={() => onGoToField(target?.section ?? "general", target?.fieldKey)}
        className="block w-full rounded-md border px-2 py-1.5 text-left text-xs hover:border-primary"
      >
        <span className="font-medium">{check.label}</span>
        {check.detail && <span className="mt-0.5 block text-[11px] text-muted-foreground">{check.detail}</span>}
      </button>
    );
  }
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium">{check.label}</p>
      {failures.map((f, i) => {
        const ft = resolveFailureTarget(f, check.key, units);
        return (
          <button
            key={`${f.label}-${f.unit ?? ""}-${i}`}
            type="button"
            onClick={() => onGoToField(ft.section, ft.fieldKey, ft.unit)}
            className="flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-xs hover:border-primary"
          >
            <span className="min-w-0 flex-1">
              {f.unit && <span className="font-medium">{f.unit}: </span>}
              {f.detail ?? f.label}
            </span>
            <span className="shrink-0 text-[10px] uppercase text-muted-foreground">{f.unit ? "Rooms" : "Fix"}</span>
          </button>
        );
      })}
    </div>
  );
}

function PublishedPane({
  propertyId,
  macroKey,
  isPlatformUser,
  locked,
  busy,
  signoff,
  listingPull,
  subAccountEmail,
  onPullListings,
  pushErrors,
  unpublishedUnits,
  publishedOk,
  entitlementOn,
  onPushOwner,
  onPublish,
  listingsVerified,
  readBackPending,
  onVerifyListings,
  onEnable,
  onSignoffItem,
  onSignoffAll,
  onPushCompanyDetails,
  companyProfile,
}: {
  propertyId: string;
  macroKey: string;
  isPlatformUser: boolean;
  locked: boolean;
  busy: string | null;
  signoff: ReturnType<typeof useRolosOnboardingProgress>["signoff"];
  listingPull: ReturnType<typeof useRolosOnboardingProgress>["listingPull"];
  subAccountEmail: string | null;
  onPullListings: () => void;
  pushErrors: string[];
  unpublishedUnits: number;
  publishedOk: boolean;
  entitlementOn: boolean;
  onPushOwner: () => void;
  onPublish: () => void;
  listingsVerified: boolean;
  readBackPending: boolean;
  onVerifyListings: () => void;
  onEnable: () => void;
  onSignoffItem: (key: string, next: boolean) => void;
  onSignoffAll: (next: boolean) => void;
  onPushCompanyDetails: () => void;
  companyProfile: ReturnType<typeof useRolosOnboardingProgress>["companyProfile"];
}) {
  const [rePushOpen, setRePushOpen] = useState(false);
  return (

    <div className="space-y-4">
      {(macroKey === "push_owner" || macroKey === "keys") && (
        <div className="space-y-3">
          <PropertyRuOwnerPanel propertyId={propertyId} pmsSystem="roomsonline" readOnly={!isPlatformUser} />
          {macroKey === "push_owner" && isPlatformUser && (
            <Button onClick={onPushOwner} disabled={locked || busy === "ensure_owner"}>
              {busy === "ensure_owner" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Create or link distribution identity
            </Button>
          )}
        </div>
      )}

      {macroKey === "company_profile" && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Company profile on the sub-account</p>
          <p className="text-xs text-muted-foreground">
            Sent automatically with the sub-account's own verified keys as soon as they are captured. The button
            below is for corrections and retries.
          </p>
          {companyProfile.pushed ? (
            <p className="text-sm text-emerald-600">
              Accepted by the Channel Manager
              {companyProfile.pushedAt ? ` · ${new Date(companyProfile.pushedAt).toLocaleString()}` : ""}
            </p>
          ) : companyProfile.sending ? (
            <p className="flex items-center text-sm text-muted-foreground">
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> Sending the company profile…
            </p>
          ) : companyProfile.error ? (
            <p className="text-sm text-destructive">{companyProfile.error}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Waiting for a verified key pair — the profile is sent for you the moment the keys verify.
            </p>
          )}
          {isPlatformUser ? (
            <Button
              variant={companyProfile.pushed ? "outline" : "default"}
              onClick={onPushCompanyDetails}
              disabled={locked || companyProfile.sending || busy === "company_details"}
            >
              {busy === "company_details" || companyProfile.sending ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : null}
              {companyProfile.pushed ? "Send again" : "Send company profile now"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">ROL sends this on your behalf.</p>
          )}
        </div>
      )}

      {macroKey === "pull_listings" && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Pull listings (if any)</p>
          <p className="text-xs text-muted-foreground">
            Lists everything already present under the sub-account and links matches to this property and its
            units by name, so the push updates an existing listing instead of creating a duplicate.
          </p>
          {listingPull?.stale ? (
            <p className="text-sm text-amber-600">
              This record is from OwnerID {listingPull.ownerId}, but the property is now bound to OwnerID{" "}
              {listingPull.boundOwnerId}. Pull again so the listings come from the bound account.
              <span className="block text-[11px] text-muted-foreground">
                Previous pull: {listingPull.account ?? "unknown account"} · {new Date(listingPull.at).toLocaleString()}
              </span>
            </p>
          ) : listingPull ? (
            <p className="text-sm text-emerald-600">
              {listingPull.remoteCount === 0
                ? `${listingPull.account ?? "The sub-account"} returned no listings — nothing to adopt.`
                : `${listingPull.matched} listing(s) adopted of ${listingPull.remoteCount}${
                    listingPull.unmatched > 0 ? ` · ${listingPull.unmatched} unmatched` : ""
                  }.`}
              <span className="block text-[11px] text-muted-foreground">
                Pulled as {listingPull.account ?? "the linked sub-account"}
                {listingPull.authMode === "parent_access_key" ? " (master credentials)" : ""}
                {" · "}
                {new Date(listingPull.at).toLocaleString()}
              </span>
              {listingPull.by ? (
                <span className="block text-[11px] text-muted-foreground">Checked by {listingPull.by}</span>
              ) : null}
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">Not pulled yet.</p>
          )}

          {isPlatformUser ? (
            <Button variant={listingPull ? "outline" : "default"} onClick={onPullListings} disabled={locked || busy === "pull_listings"}>
              {busy === "pull_listings" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              {listingPull ? "Pull again" : "Pull listings now"}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">An admin runs this check before the listing is published.</p>
          )}
        </div>
      )}

      {macroKey === "publish" && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Publish listing & rates</p>
          <p className="text-xs text-muted-foreground">
            Pushes the property, units, availability and prices, then reads the listings back to confirm them.
            Re-publish updates stored listing IDs — it never duplicates.
          </p>
          {publishedOk ? (
            <p className="text-sm text-emerald-600">
              Published — the Channel Manager is enabled and awaiting a channel connection.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              {unpublishedUnits > 0 ? `${unpublishedUnits} unit(s) still need a listing ID.` : "Not published yet."}
            </p>
          )}
          {pushErrors.length > 0 && (
            <ul className="list-disc space-y-1 pl-4 text-xs text-destructive">
              {pushErrors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          {isPlatformUser && publishedOk && !listingsVerified && readBackPending && (
            <div className="rounded-md border border-border bg-muted/40 p-2">
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Published — confirming the listings with the channel. This finishes on its own.
              </p>
            </div>
          )}
          {isPlatformUser && publishedOk && !listingsVerified && !readBackPending && (
            <div className="space-y-1 rounded-md border border-amber-500/40 bg-amber-500/5 p-2">
              <p className="text-xs text-amber-700 dark:text-amber-400">
                Pushed, but the listings were not read back — the confirmation call did not complete.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={onVerifyListings}
                disabled={locked || busy === "verify_listings"}
              >
                {busy === "verify_listings" ? (
                  <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="mr-1.5 h-4 w-4" />
                )}
                Fetch Channel Manager IDs
              </Button>
            </div>
          )}

          {isPlatformUser && !publishedOk && (
            <Button onClick={onPublish} disabled={locked || busy === "publish"}>
              {busy === "publish" ? (
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
              ) : (
                <UploadCloud className="mr-1.5 h-4 w-4" />
              )}
              Publish now
            </Button>
          )}
          {isPlatformUser && publishedOk && (
            <Collapsible open={rePushOpen} onOpenChange={setRePushOpen}>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="h-6 gap-1 px-1 text-[11px] text-muted-foreground">
                  <ChevronDown className={`h-3 w-3 transition-transform ${rePushOpen ? "rotate-180" : ""}`} />
                  Manual re-push (not needed)
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onPublish}
                  disabled={locked || busy === "publish"}
                  title="Force a full re-push — updates stored listing IDs, never duplicates"
                >
                  {busy === "publish" ? (
                    <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                  ) : (
                    <UploadCloud className="mr-1.5 h-4 w-4" />
                  )}
                  Force re-publish
                </Button>
              </CollapsibleContent>
            </Collapsible>
          )}
          {!isPlatformUser && (
            <p className="text-xs text-muted-foreground">An admin publishes the listing once Ready to sell is green.</p>
          )}

        </div>
      )}

      {macroKey === "currency" && (
        <div className="space-y-3 rounded-lg border p-4">
          <p className="text-sm font-medium">Location & currency</p>
          <p className="text-xs text-muted-foreground">
            Confirm the published currency matches what the Channel Manager reports. A mismatch blocks some OTAs.
          </p>
          <RuCurrencyNotice propertyId={propertyId} />
        </div>
      )}

      {macroKey === "signoff" && (
        <div
          className={`space-y-3 rounded-lg p-4 transition-colors ${
            signoff.signed_off
              ? "border border-border"
              : "border-2 border-foreground/80 bg-foreground/5"
          }`}
        >
          <p className="text-sm font-medium">Sub-account verification</p>
          <p className="text-xs text-muted-foreground">
            Verifying the distribution sub-account{" "}
            <span className="font-medium text-foreground">{subAccountEmail ?? "— not linked yet"}</span>. Tick each
            item as you confirm it. The step completes only when every item is ticked.
          </p>
          <p className="text-[11px] text-muted-foreground">
            The name and date under a tick record who confirmed it (the ROL'OS operator), not the sub-account login.
          </p>
          {ROLOS_SIGNOFF_CHECKLIST.map((item) => {
            const record = signoff.checks?.[item.key];
            const itemLocked = (signoff.lockedItems ?? []).includes(item.key);
            return (
              <label key={item.key} className="flex items-start gap-2 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={record?.checked === true}
                  disabled={locked || !isPlatformUser || itemLocked}
                  onCheckedChange={(v) => onSignoffItem(item.key, v === true)}
                />
                <span>
                  {item.label}
                  {itemLocked && (
                    <span className="block text-[11px] text-amber-600">
                      Company details have not been pushed to the Channel Manager with the verified keys yet — send
                      them below before ticking this.
                    </span>
                  )}
                  {record?.checked && record.by && (
                    <span className="block text-[11px] text-muted-foreground">
                      {record.by}
                      {record.at ? ` · ${new Date(record.at).toLocaleDateString()}` : ""}
                    </span>
                  )}
                </span>
              </label>
            );
          })}
          {isPlatformUser && (signoff.lockedItems ?? []).includes("company_details") && (
            <Button size="sm" disabled={locked || busy === "company_details"} onClick={onPushCompanyDetails}>
              {busy === "company_details" ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
              Push company details
            </Button>
          )}
          {isPlatformUser && (
            <Button
              variant="outline"
              size="sm"
              disabled={locked || (!signoff.signed_off && (signoff.lockedItems ?? []).length > 0)}
              onClick={() => onSignoffAll(!signoff.signed_off)}
            >
              {signoff.signed_off ? "Clear sign-off" : "Confirm all items"}
            </Button>
          )}
          {signoff.companyDetailsPushed && signoff.companyDetailsAt && (
            <p className="text-[11px] text-muted-foreground">
              Company details sent {new Date(signoff.companyDetailsAt).toLocaleString()}.
            </p>
          )}
        </div>
      )}

      {macroKey === "entitlement" && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Channel Manager billing</p>
              <p className="text-xs text-muted-foreground">
                Turns on the Channel Manager for this party and unlocks the connect console on this page.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Switch
                id="cm-enable"
                checked={entitlementOn}
                disabled={!isPlatformUser || locked || busy === "entitlement"}
                onCheckedChange={(on) => {
                  if (on) onEnable();
                }}
              />
              <Label htmlFor="cm-enable" className="text-xs">
                {entitlementOn ? "Enabled" : "Off"}
              </Label>
            </div>
          </div>
          {!isPlatformUser && !entitlementOn && (
            <p className="text-xs text-muted-foreground">
              Ask your account manager to enable Channel Manager. You cannot connect OTAs until it is on.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default ChannelOnboardingWorkspace;
