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
}: StepAccountDialogProps) {
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyFields, setCompanyFields] = useState<CompanyField[] | null>(null);
  const [companyMissing, setCompanyMissing] = useState<string[]>([]);
  const [companyBlocked, setCompanyBlocked] = useState<string | null>(null);
  const [newLoginEmail, setNewLoginEmail] = useState("");
  const [credEmail, setCredEmail] = useState("");
  const [credPassword, setCredPassword] = useState("");
  const [savingCred, setSavingCred] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [credNote, setCredNote] = useState<string | null>(null);
  const [credCode, setCredCode] = useState<string | null>(null);
  const [credsStored, setCredsStored] = useState(false);
  const [passwordStored, setPasswordStored] = useState(false);
  const [passwordVerified, setPasswordVerified] = useState(false);
  const [keyMintRefused, setKeyMintRefused] = useState(false);
  const [manualAccessKey, setManualAccessKey] = useState("");
  const [manualSecretKey, setManualSecretKey] = useState("");
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


  // Credential state of the bound sub-account, from the read-only plan.
  const planAccountId = (plan?.account_id as string | null) ?? null;
  const planHasKeys = Boolean(plan?.has_api_keys) || credsStored;
  const planHasPassword = Boolean(plan?.has_stored_password) || passwordStored;
  const planLogin = String(plan?.existing_login_email ?? plan?.login_email ?? "");
  const activeRemedy = useMemo(
    () => resolveStepARemedy(credCode ?? remedyCode, credNote),
    [credCode, credNote, remedyCode],
  );
  const showManualKeys = useMemo(
    () => !planHasKeys && (keyMintRefused || activeRemedy?.remedy === "api_keys"),
    [activeRemedy?.remedy, keyMintRefused, planHasKeys],
  );

  useEffect(() => {
    setCredEmail(planLogin);
    setCredPassword("");
    setCredNote(null);
    setCredCode(null);
    setCredsStored(false);
    setPasswordStored(Boolean(plan?.has_stored_password));
    setPasswordVerified(false);
    setKeyMintRefused(false);
    setManualAccessKey("");
    setManualSecretKey("");
  }, [plan?.has_stored_password, planAccountId, planLogin]);

  // A credential/key remedy scrolls the card into view and focuses the password field, so the
  // operator is asked for exactly the value the channel refused instead of hunting for it.
  useEffect(() => {
    if (!open) return;
    const needsInput = activeRemedy?.remedy === "password" || activeRemedy?.remedy === "api_keys";
    if (!needsInput || !remedyCode) return;
    const timer = window.setTimeout(() => {
      credCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      credPasswordRef.current?.focus();
    }, 150);
    return () => window.clearTimeout(timer);
  }, [activeRemedy?.remedy, open, remedyCode]);


  // Store and verify the sub-account's own portal password without hiding key creation failures.
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

      if (data.success !== true) {
        const code = data.error?.code ?? "RU_CHILD_LOGIN_REJECTED";
        const message = data.error?.message ?? "The password could not be stored";
        setCredCode(code);
        setCredNote(message);
        toast.error("Password was not verified", { description: message, duration: 12000 });
        return;
      }

      setPasswordStored(true);
      setPasswordVerified(data.api_access_verified === true);
      setCredPassword("");
      if (data.api_access_verified === true) {
        setKeyMintRefused(false);
        setCredNote("Password stored and verified. You can now mint the API key pair.");
        toast.success("Password stored and verified");
        return;
      }

      const warning = data.api_warning ?? "Password stored, but the channel refused the API login check.";
      setCredCode("RU_CHILD_LOGIN_REJECTED");
      setKeyMintRefused(true);
      setCredNote(warning);
      toast.warning("Password stored", { description: warning, duration: 12000 });
    } finally {
      setSavingCred(false);
    }
  }, [credEmail, credPassword, planAccountId]);

  const mintKeyPair = useCallback(async () => {
    if (!planAccountId) return;
    setSavingKeys(true);
    setCredNote(null);
    setCredCode(null);
    try {
      const keyData = await invokeCertPortal({
        action: "create_api_key",
        account_id: planAccountId,
        key_label: "ROLOS",
      }, "Password stored, but the key pair could not be minted yet.");
      if (keyData.success !== true) {
        const code = keyData.error?.code ?? "RU_CREATE_KEY_FAILED";
        const message = keyData.error?.message ?? "Password stored, but the key pair could not be minted yet.";
        setCredCode(code);
        setKeyMintRefused(true);
        setCredNote(message);
        toast.warning("Key pair needs attention", { description: message, duration: 14000 });
        return;
      }

      setCredsStored(true);
      setPasswordVerified(true);
      setKeyMintRefused(false);
      setCredCode(null);
      setManualAccessKey("");
      setManualSecretKey("");
      setCredNote(`Key pair minted${keyData.access_key ? ` — AccessKey ${keyData.access_key}` : ""}.`);
      toast.success("Key pair minted and stored");
    } finally {
      setSavingKeys(false);
    }
  }, [planAccountId]);

  const saveManualKeys = useCallback(async () => {
    if (!planAccountId) return;
    setSavingKeys(true);
    setCredNote(null);
    setCredCode(null);
    try {
      const keyData = await invokeCertPortal({
        action: "save_api_keys",
        account_id: planAccountId,
        login_email: credEmail.trim(),
        access_key: manualAccessKey.trim(),
        secret_key: manualSecretKey.trim(),
        key_label: "ROLOS",
      }, "The API key pair could not be stored.");
      if (keyData.success !== true || keyData.verified === false) {
        const code = keyData.error?.code ?? "RU_CHILD_KEYS_REJECTED";
        const message = keyData.error?.message ?? "The API key pair could not be verified.";
        setCredCode(code);
        setCredNote(message);
        toast.warning("API key pair was not stored", { description: message, duration: 14000 });
        return;
      }

      setCredsStored(true);
      setKeyMintRefused(false);
      setCredCode(null);
      setManualAccessKey("");
      setManualSecretKey("");
      setCredNote(
        keyData.company_details_warning
          ? `Keys verified. ${keyData.company_details_warning}`
          : "API key pair verified and stored.",
      );
      toast.success("API key pair verified and stored");
    } finally {
      setSavingKeys(false);
    }
  }, [credEmail, manualAccessKey, manualSecretKey, planAccountId]);

  const verifyStoredPassword = useCallback(async () => {
    if (!planAccountId) return;
    setSavingCred(true);
    setCredNote(null);
    setCredCode(null);
    try {
      const data = await invokeCertPortal({
        action: "verify_login_password",
        account_id: planAccountId,
      }, "The saved password could not be verified.");
      if (data.success === true && data.verified === true) {
        setPasswordVerified(true);
        setCredNote("Saved password verified. You can now mint the API key pair.");
        toast.success("Saved password verified");
        return;
      }
      const code = data.error?.code ?? "RU_CHILD_LOGIN_REJECTED";
      const message = data.error?.message ?? "The saved password was rejected. Reset it in the portal and save it again here.";
      setCredCode(code);
      setKeyMintRefused(true);
      setCredNote(message);
      toast.warning("Saved password needs attention", { description: message, duration: 12000 });
    } finally {
      setSavingCred(false);
    }
  }, [planAccountId]);

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
          {/* 1 — what will happen */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">What will happen</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {planLoading && !plan ? (
                <Skeleton className="h-24 w-full" />
              ) : !plan ? (
                <p className="text-xs text-muted-foreground">The account plan could not be loaded.</p>
              ) : (
                <>
                  <p className="text-xs">
                    {emailConflict
                      ? `The channel will not accept ${emailConflict.email} as a login, so the stale local binding was cleared. Step A will create a new distribution account under the login chosen below.`
                      : adopting
                        ? "The existing distribution account will be adopted — no new account is created."
                        : "A new distribution account will be created under the master account."}
                  </p>

                  <dl className="grid gap-2 text-xs sm:grid-cols-2">
                    <Row
                      label="Login email"
                      value={effectiveLogin || (emailConflict ? "choose one below" : plan.login_email ?? "unresolved")}
                    />
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
                    <Row label="Country / location" value={String(plan.company_country ?? plan.country ?? "—")} />
                    <Row
                      label="Existing OwnerID"
                      value={(plan.existing_owner_id as string | null) ?? (plan.ru_owner_id ?? "none yet")}
                    />
                  </dl>
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

          {/* 2 — owner binding */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-sm">
                <UserCog className="h-4 w-4" />
                Owner binding
              </CardTitle>
              <CardDescription className="text-xs">
                Re-assigning archives this property's listings, clears the old binding and, when nothing is left on it,
                archives the old distribution account. All of it runs as one operation.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {bindingUnreadable ? (
                <p className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  The distribution binding could not be read — this property may well be bound. Re-assigning is blocked
                  until the lookup succeeds. Detail: {binding?.read_error}
                </p>
              ) : null}
              <dl className="grid gap-2 text-xs sm:grid-cols-2">
                <Row label="Owner email" value={property?.owner_email ?? "—"} />
                <Row
                  label="Account login"
                  value={bindingUnreadable ? "could not be read" : binding?.login_email ?? "not bound"}
                />
                <Row
                  label="Account scope"
                  value={bindingUnreadable ? "could not be read" : describeAccountScope(binding as never)}
                />
                <Row label="Listing" value={describeListingState(property as never)} />
              </dl>
              <div className="flex flex-wrap items-end gap-2">
                <div className="min-w-[240px] flex-1">
                  <Label className="text-xs">Re-assign to owner email</Label>
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
              {sameEmailReset ? (
                <p className="text-xs text-muted-foreground">
                  That is the owner email already on file — this will reset the binding (archive listings, clear the
                  account link) and Step A must be run again.
                </p>
              ) : null}
            </CardContent>
          </Card>

          {/* 2b — sub-account credentials: set the portal password and mint the key pair here */}
          {planAccountId && !planHasKeys && (
            <Card className="border-amber-500/50">
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <KeyRound className="h-4 w-4" />
                  Sub-account credentials
                </CardTitle>
                <CardDescription className="text-xs">
                  {planHasPassword
                    ? "A portal password is stored for this account, so the key pair is minted when Step A runs. You can replace it below if it changed."
                    : "No usable credential is stored yet. Save the sub-account's own portal password here and the key pair is minted straight away."}
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
                      className="mt-1 font-mono"
                      type="text"
                      value={credPassword}
                      onChange={(event) => setCredPassword(event.target.value)}
                      placeholder="Minimum 8 characters"
                    />
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    disabled={credPassword.trim().length < 8 || !credEmail.includes("@") || savingCred}
                    onClick={saveCredentials}
                  >
                    {savingCred ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Save &amp; verify password
                  </Button>
                  {planHasPassword ? (
                    <Button size="sm" variant="outline" disabled={savingCred} onClick={verifyStoredPassword}>
                      {savingCred ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Verify saved password
                    </Button>
                  ) : null}
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!planHasPassword || savingKeys || savingCred}
                    onClick={mintKeyPair}
                  >
                    {savingKeys ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                    Mint key pair
                  </Button>
                  {passwordVerified ? (
                    <Badge variant="outline" className="border-emerald-500/40 text-[10px] text-emerald-700 dark:text-emerald-300">
                      Password verified
                    </Badge>
                  ) : null}
                </div>
                {showManualKeys ? (
                  <div className="rounded-md border border-border bg-muted/30 p-3">
                    <div className="mb-2 flex items-start gap-2 text-xs text-muted-foreground">
                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600" />
                      <span>
                        If automatic key creation is refused, generate a key pair while signed in as this sub-account,
                        then paste both values here. The SecretKey is only shown once.
                      </span>
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div>
                        <Label className="text-xs">AccessKey</Label>
                        <Input
                          className="mt-1 font-mono"
                          value={manualAccessKey}
                          onChange={(event) => setManualAccessKey(event.target.value)}
                          placeholder="AccessKey"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">SecretKey</Label>
                        <Input
                          className="mt-1 font-mono"
                          type="password"
                          value={manualSecretKey}
                          onChange={(event) => setManualSecretKey(event.target.value)}
                          placeholder="SecretKey"
                        />
                      </div>
                    </div>
                    <Button
                      className="mt-3"
                      size="sm"
                      disabled={manualAccessKey.trim().length < 6 || manualSecretKey.trim().length < 6 || savingKeys}
                      onClick={saveManualKeys}
                    >
                      {savingKeys ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Verify &amp; store API key pair
                    </Button>
                  </div>
                ) : null}
                {credNote ? <p className="text-xs text-muted-foreground">{credNote}</p> : null}
              </CardContent>
            </Card>
          )}

          {/* 3 — the login Step A will register under */}

          {(emailConflict || candidates.length > 0) && (
            <Card className={cn(emailConflict && "border-destructive/50")}>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-sm">
                  <KeyRound className="h-4 w-4" />
                  Distribution login
                </CardTitle>
                <CardDescription className="text-xs">
                  {emailConflict
                    ? `${emailConflict.email} is registered at the channel but not under our master account, so it cannot be used. The stale local binding has been cleared — pick another login below, or give a brand-new address. It does not have to be a ROL'OS user or the owner.`
                    : "Step A registers under this address. Change it only when the owner email cannot be used."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {candidates.length > 0 ? (
                  <RadioGroup
                    value={chosenLoginEmail ?? ""}
                    onValueChange={(value) => onChosenLoginEmailChange?.(value)}
                    className="space-y-1.5"
                  >
                    {candidates.map((candidate) => (
                      <label
                        key={candidate.email}
                        className={cn(
                          "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs",
                          candidate.usable ? "cursor-pointer hover:bg-muted/50" : "opacity-70",
                        )}
                      >
                        <RadioGroupItem
                          value={candidate.email}
                          disabled={!candidate.usable}
                          className="mt-0.5"
                        />
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
                ) : null}
                <div>
                  <Label className="text-xs">Or create the account under a new email</Label>
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
                    Used as the sub-account login and identity. The owner email stays the primary contact on the
                    property.
                  </p>
                </div>
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
            Run Step A
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
