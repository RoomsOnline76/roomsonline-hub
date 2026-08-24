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

import { useCallback, useEffect, useState } from "react";
import {
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
}: StepAccountDialogProps) {
  const [companyOpen, setCompanyOpen] = useState(false);
  const [companyLoading, setCompanyLoading] = useState(false);
  const [companyFields, setCompanyFields] = useState<CompanyField[] | null>(null);
  const [companyMissing, setCompanyMissing] = useState<string[]>([]);
  const [companyBlocked, setCompanyBlocked] = useState<string | null>(null);
  const [newLoginEmail, setNewLoginEmail] = useState("");


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
                    <Row label="Login email" value={plan.login_email ?? "unresolved"} />
                    <Row label="Login source" value={String(plan.login_source ?? "—")} />
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
