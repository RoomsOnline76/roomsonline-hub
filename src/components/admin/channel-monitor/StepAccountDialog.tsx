/**
 * Step A — "Preview account" modal.
 *
 * One surface that shows exactly what Step A will do before anything is sent:
 *   1. what will happen (create vs adopt, login and its source, scope, location)
 *   2. owner binding — including the atomic re-assign correction
 *   3. the distribution login Step A registers under, with alternatives when the owner
 *      email is already taken at the channel outside our master account
 *   4. the company details that will be sent, read-only and collapsed by default
 *
 * Nothing here pushes company details by hand: Step A owns that, and it only sends
 * when the profile is missing or not yet accepted.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Building2,
  ChevronDown,
  ExternalLink,
  KeyRound,
  Loader2,
  ShieldCheck,
  UserCog,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { extractFunctionError } from "@/lib/functionError";
import { resolveStepARemedy } from "@/config/channelStepARemedies";
import { toast } from "sonner";


import {
  describeAccountScope,
  describeListingState,
  type LoginCandidate,
  type OwnerAccountPlan,
} from "@/lib/channelOnboardOrchestrator";


interface CompanyField {
  key: string;
  label: string;
  value: string;
  source: string;
}

interface PortalErrorPayload {
  success?: boolean;
  verified?: boolean;
  password_stored?: boolean;
  api_access_verified?: boolean;
  api_warning?: string | null;
  access_key?: string | null;
  login_email?: string | null;
  company_details_warning?: string | null;
  key_minted?: boolean;
  rate_deferred?: boolean;
  retry_after_ms?: number | null;
  error_code?: string | null;
  error?: { code?: string; message?: string };

}

async function readFunctionPayload(error: unknown): Promise<PortalErrorPayload | null> {
  const response = (error as { context?: Response } | null)?.context;
  if (!response || typeof response.text !== "function") return null;
  try {
    return JSON.parse(await response.clone().text()) as PortalErrorPayload;
  } catch {
    return null;
  }
}

async function invokeCertPortal(body: Record<string, unknown>, fallback: string): Promise<PortalErrorPayload> {
  const { data, error } = await supabase.functions.invoke("ru-cert-portal", { body });
  if (!error) return (data ?? {}) as PortalErrorPayload;

  const recovered = await readFunctionPayload(error);
  if (recovered) return recovered;
  return { success: false, error: { message: await extractFunctionError(error, fallback) } };
}

export interface StepAccountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The property the orchestrator runs against (a portfolio's anchor member). */
  propertyId: string;
  portfolioId?: string | null;
  memberIds?: string[];
  plan: OwnerAccountPlan | null;
  planLoading: boolean;
  binding: Record<string, any> | null | undefined;
  property: Record<string, any> | null | undefined;
  bindingUnreadable: boolean;
  rebindEmail: string;
  onRebindEmailChange: (value: string) => void;
  onRequestRebind: () => void;
  rebinding: boolean;
  sameEmailReset: boolean;
  runningStepA: boolean;
  stepADisabled: boolean;
  onRunStepA: () => void;
  /**
   * Set when the last Step A run reported the owner email is registered at the channel
   * outside our master account. The modal then asks for a usable login instead.
   */
  emailConflict?: { email: string; message: string; candidates: LoginCandidate[] } | null;
  /** The login the operator picked, sent to Step A as the confirmed sub-account email. */
  chosenLoginEmail?: string | null;
  onChosenLoginEmailChange?: (email: string) => void;
  /** Last recoverable Step A stop code, used to show the exact remedy inside this modal. */
  remedyCode?: string | null;
  /** Live Step A task progress, so Proceed reports the run without leaving the modal. */
  runTasks?: Array<{ id: string; title: string; state: string; detail?: string | null }>;
  /** Human countdown while the step is parked on the channel's rate window. */
  waitLabel?: string | null;
}



function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium break-all">{value ?? "—"}</dd>
    </div>
  );
}

export function StepAccountDialog({
  open,
  onOpenChange,
  propertyId,
  portfolioId = null,
  memberIds,
  plan,
  planLoading,
  binding,
  property,
  bindingUnreadable,
  rebindEmail,
  onRebindEmailChange,
  onRequestRebind,
  rebinding,
  sameEmailReset,
  runningStepA,
  stepADisabled,
  onRunStepA,
  emailConflict = null,
  chosenLoginEmail = null,
  onChosenLoginEmailChange,
  remedyCode = null,
  runTasks = [],
  waitLabel = null,
}: StepAccountDialogProps) {

  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyFields, setCompanyFields] = useState<CompanyField[] | null>(null);
  const [companyMissing, setCompanyMissing] = useState<string[]>([]);
  const [companyBlocked, setCompanyBlocked] = useState<string | null>(null);
  const [newLoginEmail, setNewLoginEmail] = useState("");
  /** The account email stays read-only until the operator asks to change it. */
  const [changingEmail, setChangingEmail] = useState(false);

  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [savingCred, setSavingCred] = useState(false);
  const [credNote, setCredNote] = useState<string | null>(null);
  const [credCode, setCredCode] = useState<string | null>(null);
  const [credsStored, setCredsStored] = useState(false);
  const [passwordStored, setPasswordStored] = useState(false);
  // A credential remedy must land the operator on the field it needs, not just open the modal.
  const credCardRef = useRef<HTMLDivElement | null>(null);
  const credPasswordRef = useRef<HTMLInputElement | null>(null);





  // Read-only composition of the payload — no channel call, no local write.
  const loadCompany = useCallback(async () => {
    if (!propertyId) return;
    setCompanyLoading(true);
    try {
      const body: Record<string, unknown> = { action: "preview_company_details" };
      if (portfolioId) body.portfolio_id = portfolioId;
      else body.property_id = propertyId;
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", { body });
      if (error || !data?.success) {
        setCompanyBlocked(data?.error?.message ?? "The company details could not be read");
        setCompanyFields([]);
        return;
      }
      setCompanyFields((data.preview?.fields ?? []) as CompanyField[]);
      setCompanyMissing((data.preview?.missing ?? []) as string[]);
      setCompanyBlocked((data.preview?.blocked_reason ?? null) as string | null);
    } finally {
      setCompanyLoading(false);
    }
  }, [portfolioId, propertyId]);

  useEffect(() => {
    if (!open) return;
    if (companyFields === null && !companyLoading) void loadCompany();
  }, [companyFields, companyLoading, loadCompany, open]);

  // A property switch invalidates the cached preview.
  useEffect(() => {
    setCompanyFields(null);
    setCompanyMissing([]);
    setCompanyBlocked(null);
  }, [propertyId, portfolioId]);

  const warnings = ((plan?.warnings ?? []) as unknown[]).map((w) => String(w));
  const blockedReason = plan ? ((plan.blocked_reason ?? null) as string | null) : null;
  const adopting = Boolean(plan?.adopt || plan?.ru_owner_id);
  const scopeIsPortfolio = String(plan?.scope ?? "") === "portfolio" || Boolean(portfolioId);

  // Candidates come from the failed run when there is a conflict (they exclude the taken
  // address), otherwise from the read-only plan.
  const candidates: LoginCandidate[] = emailConflict
    ? emailConflict.candidates
    : ((plan?.login_candidates ?? []) as LoginCandidate[]);
  const effectiveLogin = chosenLoginEmail || (emailConflict ? "" : String(plan?.login_email ?? ""));
  // A conflict cannot be re-run against the same address — a usable login must be chosen.
  const canRun = !stepADisabled && !blockedReason && (!emailConflict || effectiveLogin.includes("@"));
  /** The sub-account this property is already registered under, if any. */
  const linkedEmail = emailConflict
    ? ""
    : String(binding?.login_email ?? plan?.existing_login_email ?? "") || (adopting ? String(plan?.login_email ?? "") : "");

  // A refused login has to be answered before Step A can be re-run, so the chooser opens itself.
  useEffect(() => {
    if (!open) return;
    if (emailConflict) setChangingEmail(true);
  }, [emailConflict, open]);

  // A property switch resets the disclosure to the read-only statement.
  useEffect(() => {
    setChangingEmail(false);
    setNewLoginEmail("");
  }, [propertyId, portfolioId]);




  // Credential state of the bound sub-account, from the read-only plan.
  const planAccountId = (plan?.account_id as string | null) ?? null;
  const planHasKeys = Boolean(plan?.has_api_keys) || credsStored;
  const planHasPassword = Boolean(plan?.has_stored_password) || passwordStored;
  const planLogin = String(plan?.existing_login_email ?? plan?.login_email ?? "");
  const activeRemedy = useMemo(
    () => resolveStepARemedy(credCode ?? remedyCode, credNote),
    [credCode, credNote, remedyCode],
  );
  const xmlApiRejectedWithStoredPassword = planHasPassword && activeRemedy?.code === "RU_CREATE_KEY_API_REJECTED";

  useEffect(() => {
    setCredEmail(planLogin);
    setCredPassword("");
    setCredNote(null);
    setCredCode(null);
    setCredsStored(false);
    setPasswordStored(Boolean(plan?.has_stored_password));
  }, [plan?.has_stored_password, planAccountId, planLogin]);

  // A credential/key remedy scrolls the card into view and focuses the password field, so the
  // operator is asked for exactly the value the channel refused instead of hunting for it.
  useEffect(() => {
    if (!open) return;
    const needsInput = activeRemedy?.remedy === "password";
    if (!needsInput || !remedyCode) return;
    const timer = window.setTimeout(() => {
      credCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      credPasswordRef.current?.focus();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [activeRemedy?.remedy, open, remedyCode]);


  // Saving the password immediately retries automatic key creation and secure storage.
  const saveCredentials = useCallback(async () => {
    if (!planAccountId) return;
    setSavingCred(true);
    setCredNote(null);
    setCredCode(null);
    try {
      const data = await invokeCertPortal({
        action: "save_login_password",
        account_id: planAccountId,
        login_email: credEmail.trim(),
        password: credPassword.trim(),
      }, "The password could not be stored");

      if (data.success !== true || (data.password_stored && data.key_minted === false)) {
        const code = data.error?.code ?? (data.key_minted === false ? "RU_CREATE_KEY_API_REJECTED" : "RU_CHILD_LOGIN_REJECTED");
        const message = data.error?.message ?? "The password could not be stored";
        if (data.password_stored) {
          setPasswordStored(true);
          setCredPassword("");
        }
        setCredCode(code);
        setCredNote(message);
        toast.error(data.password_stored ? "Key creation refused by channel" : "Password was not stored", { description: message, duration: 12000 });
        return;
      }

      setPasswordStored(true);
      setCredPassword("");
      setCredsStored(data.key_minted === true);
      setCredCode(null);
      const note = data.key_minted === true
        ? "Password saved. Step A created, verified and stored the API key pair."
        : "Password saved. Run Step A to complete automatic key creation.";
      setCredNote(note);
      toast.success(data.key_minted === true ? "Account credentials completed" : "Sub-account password stored", {
        description: note,
      });
    } finally {
      setSavingCred(false);
    }
  }, [credEmail, credPassword, planAccountId]);




  const editHref = `/properties/${propertyId}/edit?section=general&focus=company-information`;


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <ShieldCheck className="h-4 w-4" />
            Distribution account — preview Step A
          </DialogTitle>
          <DialogDescription className="text-xs">
            Everything below is what Step A will do. Nothing has been sent to the channel yet.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* 1 — the account this property is (or will be) linked to */}
          <Card className={cn(emailConflict && "border-destructive/50")}>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserCog className="h-4 w-4" />
                Distribution account
              </CardTitle>
              <CardDescription className="text-xs">
                {emailConflict
                  ? "The channel refused the resolved login — choose a usable account email below, then proceed."
                  : "Confirm the account this property is registered under, then proceed to complete Step A."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {planLoading && !plan ? (
                <Skeleton className="h-24 w-full" />
              ) : !plan ? (
                <p className="text-xs text-muted-foreground">The account plan could not be loaded.</p>
              ) : (
                <>
                  {bindingUnreadable ? (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                      The distribution binding could not be read — this property may well be bound. Changing the account
                      email is blocked until the lookup succeeds. Detail: {binding?.read_error}
                    </p>
                  ) : null}

                  <p className="text-sm">
                    {emailConflict ? (
                      <>
                        <span className="font-medium break-all">{emailConflict.email}</span> is registered at the channel
                        outside our master account, so it cannot be used. The stale local binding was cleared — choose
                        another account email below.
                      </>
                    ) : linkedEmail ? (
                      <>
                        This property is linked to sub-account{" "}
                        <span className="font-medium break-all">{linkedEmail}</span>.
                      </>
                    ) : (
                      <>
                        This property is <span className="font-medium">not linked</span> to a distribution account. Step A
                        will create one under{" "}
                        <span className="font-medium break-all">{effectiveLogin || "an unresolved email"}</span>.
                      </>
                    )}
                  </p>

                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <Row
                      label="Account scope"
                      value={
                        scopeIsPortfolio
                          ? `Portfolio-wide${plan.portfolio_name ? ` — ${plan.portfolio_name}` : ""}${
                              memberIds?.length ? ` (${memberIds.length} properties)` : ""
                            }`
                          : "This property only"
                      }
                    />
                    <Row label="Listing" value={describeListingState(property as never)} />
                    <Row label="Owner email" value={property?.owner_email ?? "—"} />
                    <Row
                      label="Login source"
                      value={chosenLoginEmail ? "chosen by the operator" : String(plan.login_source ?? "—")}
                    />
                    <Row
                      label="Contact name"
                      value={
                        [plan.contact_first_name, plan.contact_last_name].filter(Boolean).join(" ") ||
                        (plan.owner_name ?? "—")
                      }
                    />
                    <Row label="Country / location" value={String(plan.company_country ?? plan.country ?? "—")} />
                    <Row
                      label="Existing OwnerID"
                      value={(plan.existing_owner_id as string | null) ?? (plan.ru_owner_id ?? "none yet")}
                    />
                    <Row
                      label="Bound account"
                      value={
                        bindingUnreadable
                          ? "could not be read"
                          : `${binding?.login_email ?? "not bound"}${
                              binding ? ` · ${describeAccountScope(binding as never)}` : ""
                            }`
                      }
                    />
                  </dl>

                  {/* The account email is read-only until the operator asks to change it. */}
                  {!changingEmail ? (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={bindingUnreadable}
                      onClick={() => setChangingEmail(true)}
                    >
                      <KeyRound className="mr-1.5 h-3.5 w-3.5" />
                      Change account email
                    </Button>
                  ) : (
                    <div className="space-y-3 rounded-md border bg-muted/40 p-3">
                      {candidates.length > 0 ? (
                        <div>
                          <Label className="text-xs">Use one of these logins</Label>
                          <RadioGroup
                            value={chosenLoginEmail ?? ""}
                            onValueChange={(value) => onChosenLoginEmailChange?.(value)}
                            className="mt-1.5 space-y-1.5"
                          >
                            {candidates.map((candidate) => (
                              <label
                                key={candidate.email}
                                className={cn(
                                  "flex items-start gap-2 rounded-md border bg-background px-2.5 py-2 text-xs",
                                  candidate.usable ? "cursor-pointer hover:bg-muted/50" : "opacity-70",
                                )}
                              >
                                <RadioGroupItem value={candidate.email} disabled={!candidate.usable} className="mt-0.5" />
                                <span className="min-w-0">
                                  <span className="block font-medium break-all">{candidate.email}</span>
                                  <span className="block text-muted-foreground">
                                    From {candidate.source}
                                    {candidate.on_roster ? " · already on our master account" : ""}
                                  </span>
                                  {candidate.blocked_reason ? (
                                    <span className="mt-0.5 block text-destructive">{candidate.blocked_reason}</span>
                                  ) : null}
                                </span>
                              </label>
                            ))}
                          </RadioGroup>
                        </div>
                      ) : null}

                      {linkedEmail && !emailConflict ? (
                        <div className="flex flex-wrap items-end gap-2">
                          <div className="min-w-[240px] flex-1">
                            <Label className="text-xs">Re-assign to account email</Label>
                            <Input
                              className="mt-1"
                              type="email"
                              placeholder="new.owner@example.com"
                              value={rebindEmail}
                              onChange={(event) => onRebindEmailChange(event.target.value)}
                            />
                          </div>
                          <Button
                            variant="destructive"
                            size="sm"
                            disabled={!rebindEmail.includes("@") || rebinding || bindingUnreadable}
                            onClick={onRequestRebind}
                          >
                            {rebinding ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                            Unbind &amp; re-assign
                          </Button>
                        </div>
                      ) : (
                        <div>
                          <Label className="text-xs">Account email to register under</Label>
                          <Input
                            className="mt-1"
                            type="email"
                            placeholder="distribution@example.com"
                            value={newLoginEmail}
                            onChange={(event) => {
                              setNewLoginEmail(event.target.value);
                              if (event.target.value.includes("@")) onChosenLoginEmailChange?.(event.target.value.trim());
                            }}
                          />
                          <p className="mt-1 text-[11px] text-muted-foreground">
                            Used as the sub-account login and identity. It does not have to be a ROL'OS user or the
                            owner — the owner email stays the primary contact on the property.
                          </p>
                        </div>
                      )}

                      {sameEmailReset ? (
                        <p className="text-xs text-muted-foreground">
                          That is the owner email already on file — this will reset the binding (archive listings, clear
                          the account link) and Step A must be run again.
                        </p>
                      ) : null}

                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setChangingEmail(false);
                          setNewLoginEmail("");
                          onRebindEmailChange("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  )}

                  {((plan.location_ids as unknown[]) ?? []).length === 0 && (
                    <p className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      No resolvable channel location for this property yet — set the city and country on the property
                      editor so the listing can be placed.
                    </p>
                  )}
                  {warnings.map((warning) => (
                    <p
                      key={warning}
                      className="flex items-start gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300"
                    >
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                      {warning}
                    </p>
                  ))}
                  {blockedReason && (
                    <p className="rounded-md border border-destructive/40 bg-destructive/10 px-2.5 py-2 text-xs font-medium text-destructive">
                      {blockedReason}
                    </p>
                  )}
                </>
              )}
            </CardContent>
          </Card>


          {/* 2b — sub-account credentials: set the portal password and mint the key pair here */}
          {planAccountId && !planHasKeys && (
            <Card className="border-amber-500/50" ref={credCardRef}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <KeyRound className="h-4 w-4" />
                  Sub-account credentials
                </CardTitle>
                <CardDescription className="text-xs">
                  {xmlApiRejectedWithStoredPassword
                    ? "The sub-account password is stored. Key creation is waiting for the channel XML API to accept this OwnerID."
                    : planHasPassword
                      ? "A sub-account password is stored. Step A creates and stores the API key pair automatically when the channel XML API accepts this sub-account."
                      : "Enter the sub-account password and Step A will create, verify and store its API key pair automatically."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {activeRemedy ? (
                  <Alert className="border-amber-500/40 bg-amber-500/10">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle className="text-sm">{activeRemedy.title}</AlertTitle>
                    <AlertDescription className="space-y-1 text-xs">
                      <p>{activeRemedy.explain}</p>
                      <p>{activeRemedy.guidance}</p>
                      <p className="font-mono text-[10px] text-muted-foreground">Reference: {activeRemedy.code}</p>
                    </AlertDescription>
                  </Alert>
                ) : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <Label className="text-xs">Sub-account login</Label>
                    <Input
                      className="mt-1"
                      type="email"
                      value={credEmail}
                      onChange={(event) => setCredEmail(event.target.value)}
                      placeholder="owner@example.com"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Portal password</Label>
                    <Input
                      ref={credPasswordRef}
                      className="mt-1 font-mono"
                      type="text"
                      value={credPassword}
                      onChange={(event) => setCredPassword(event.target.value)}
                      placeholder="Minimum 8 characters"
                    />
                  </div>
                </div>
                {xmlApiRejectedWithStoredPassword ? (
                  <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
                    No password action is needed unless the channel password was changed. Use Run Step A to retry automatic key creation after XML API access is enabled for this OwnerID.
                  </p>
                ) : null}
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={credPassword.trim().length < 8 || !credEmail.includes("@") || savingCred}
                    onClick={saveCredentials}
                  >
                    {savingCred ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    {planHasPassword ? "Replace password & retry credentials" : "Save password & complete credentials"}
                  </Button>
                </div>
                {credNote ? <p className="text-xs text-muted-foreground">{credNote}</p> : null}
              </CardContent>
            </Card>
          )}





          {/* 4 — company details to be sent */}
          <Collapsible open={companyOpen} onOpenChange={setCompanyOpen}>
            <Card>
              <CardHeader className="pb-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <CardTitle className="flex items-center gap-2 text-sm">
                      <Building2 className="h-4 w-4" />
                      Company details to be sent
                      {companyMissing.length > 0 && (
                        <Badge variant="outline" className="border-amber-500/40 text-[10px] text-amber-700 dark:text-amber-300">
                          {companyMissing.length} incomplete
                        </Badge>
                      )}
                    </CardTitle>
                    <CardDescription className="text-xs">
                      Sent automatically by Step A, and only when the channel has not accepted them yet.
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button asChild size="sm" variant="outline" className="gap-1.5">
                      <a href={editHref} target="_blank" rel="noreferrer">
                        Edit company details <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </Button>
                    <CollapsibleTrigger asChild>
                      <Button size="sm" variant="ghost" className="gap-1.5">
                        {companyOpen ? "Hide" : "Show"}
                        <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", companyOpen && "rotate-180")} />
                      </Button>
                    </CollapsibleTrigger>
                  </div>
                </div>
              </CardHeader>
              <CollapsibleContent>
                <CardContent className="space-y-2">
                  {companyLoading ? (
                    <Skeleton className="h-32 w-full" />
                  ) : companyBlocked ? (
                    <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
                      {companyBlocked}
                    </p>
                  ) : (companyFields ?? []).length === 0 ? (
                    <p className="text-xs text-muted-foreground">No company details resolved yet.</p>
                  ) : (
                    <>
                      {companyMissing.length > 0 && (
                        <p className="rounded-md border border-amber-500/40 bg-amber-500/10 px-2.5 py-2 text-xs text-amber-700 dark:text-amber-300">
                          Missing or placeholder: {companyMissing.join(", ")}. Step A will not send the profile until
                          these are filled in on the property editor.
                        </p>
                      )}
                      <dl className="divide-y text-xs">
                        {(companyFields ?? []).map((field) => (
                          <div key={field.key} className="grid gap-1 py-1.5 sm:grid-cols-3">
                            <dt className="text-muted-foreground">{field.label}</dt>
                            <dd className="font-medium break-all">{field.value}</dd>
                            <dd className="text-[11px] text-muted-foreground">from {field.source}</dd>
                          </div>
                        ))}
                      </dl>
                    </>
                  )}
                </CardContent>
              </CollapsibleContent>
            </Card>
          </Collapsible>
          {/* 5 — the live run, so Proceed finishes Step A without leaving this surface */}
          {(runningStepA || waitLabel) && (
            <Card className="border-primary/40">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Completing Step A</CardTitle>
                <CardDescription className="text-xs">
                  {waitLabel
                    ? `Waiting on the channel — ${waitLabel}. Nothing has failed; the step resumes on its own.`
                    : "Creating or adopting the account, sending the profile, minting and verifying the API keys."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {runTasks.map((task) => (
                  <div key={task.id} className="flex items-start gap-2 rounded-md border p-2 text-xs">
                    {task.state === "running" ? (
                      <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
                    ) : task.state === "passed" ? (
                      <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    ) : task.state === "failed" || task.state === "blocked" ? (
                      <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                    ) : (
                      <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0">
                      <p className="font-medium">{task.title}</p>
                      {task.detail ? <p className="text-[11px] text-muted-foreground">{task.detail}</p> : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button disabled={!canRun || runningStepA} onClick={onRunStepA}>
            {runningStepA ? (
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
            )}
            {runningStepA ? "Completing Step A…" : "Proceed"}
          </Button>
        </DialogFooter>

      </DialogContent>
    </Dialog>
  );
}
