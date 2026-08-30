import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RuLnmStatusChips } from "@/components/property/RuLnmStatusChips";
import { ruAccountLabel } from "@/lib/ruAccountLabel";

import { RuWhiteLabelTokenFields } from "@/components/property/RuWhiteLabelTokenFields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  KeyRound,
  Loader2,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Unlink,
  XCircle,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { extractFunctionError } from "@/lib/functionError";
import { notifyRuAccountsChanged } from "@/lib/ruAccountsSignal";
import { useAuth } from "@/hooks/useAuth";
import { useNavigate } from "react-router-dom";
import { useChannelOnboardGate } from "@/hooks/useChannelOnboardGate";



const RU_SECURITY_SETTINGS_URL = "https://new.rentalsunited.com/My/SecuritySettings";

interface ReadinessCheck {
  label: string;
  ok: boolean;
  hint: string;
}

export interface RuOwnerIdentity {
  property: {
    id: string;
    name: string;
    external_system: string | null;
    is_rolos: boolean;
    owner_email: string | null;
    owner_name: string | null;
    ru_property_id: string | null;
  };
  portfolio_id: string | null;
  account: {
    id: string;
    scope: string;
    owner_email: string | null;
    ru_owner_id: string | null;
    ru_login_email: string | null;
    ru_login_url: string | null;
    company_details_sent: boolean;
    company_details_status: string | null;
    company_filled_at: string | null;
    /** Only true when the profile was pushed with the sub-account's own verified keys. */
    company_details_pushed: boolean;
    keys_verified_at: string | null;
  } | null;
  keys: {
    access_key_last4: string | null;
    key_label: string | null;
    verified_at: string | null;
    source: string;
  } | null;
  keys_captured: boolean;
  push_gated: boolean;
  gate_reason: string | null;
  siblings: { id: string; name: string; ru_property_id: string | null }[];
  readiness: { ready: boolean; checks: ReadinessCheck[] };
  sub_user_password_hint: string | null;
}

interface PropertyRuOwnerPanelProps {
  propertyId: string;
  /** Current PMS selection in the form — the panel only applies to ROL'OS-managed properties. */
  pmsSystem: string | null;
  readOnly?: boolean;
}

/**
 * RU owner sub-account panel (Identity tab).
 *
 * Every ROL'OS-PMS owner gets one Rentals United sub-account. The panel shows the
 * linked OwnerID, creates the sub-account when none exists (after steps 1–5 pass +
 * explicit confirmation), and captures the sub-account's own API key pair — until
 * those keys exist, every RU push/pull for this property is gated.
 */
export function PropertyRuOwnerPanel({ propertyId, pmsSystem, readOnly = false }: PropertyRuOwnerPanelProps) {
  const { isAdmin } = useAuth();
  const isRolos = useMemo(
    () => ["roomsonline", "rolos", "rol_os", "rolos_pms"].includes((pmsSystem ?? "").trim().toLowerCase()),
    [pmsSystem],
  );
  const navigate = useNavigate();
  // Mandatory ROL'OS steps 1–5 (Ready-to-sell). Graded locally — no channel traffic.
  const gate = useChannelOnboardGate(isRolos ? propertyId : null);
  const blockedReason = useMemo(() => {
    if (gate.readyToSell) return "";
    const failing = gate.readyToSellBlockers.slice(0, 3).join("; ");
    return failing
      ? `Steps 1–5 are not complete yet: ${failing}${gate.readyToSellBlockers.length > 3 ? "…" : ""}`
      : "Complete the mandatory steps 1–5 for this property before creating a distribution account.";
  }, [gate.readyToSell, gate.readyToSellBlockers]);

  const [showWlTokens, setShowWlTokens] = useState(false);



  const [loading, setLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [verifying, setVerifying] = useState(false);

  const [identity, setIdentity] = useState<RuOwnerIdentity | null>(null);
  const [accessKey, setAccessKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [keyLabel, setKeyLabel] = useState("ROL'OS");
  const [editingKeys, setEditingKeys] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [pushingCompany, setPushingCompany] = useState(false);
  const [confirmUnbind, setConfirmUnbind] = useState(false);
  const [unbinding, setUnbinding] = useState(false);







  const load = useCallback(async () => {
    if (!propertyId || !isRolos) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "property_ru_identity", property_id: propertyId },
      });
      if (error) throw new Error(await extractFunctionError(error));
      if (!data?.success) throw new Error(data?.error?.message ?? "Could not load the distribution account identity");
      setIdentity(data as RuOwnerIdentity);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the distribution account identity");
    } finally {
      setLoading(false);
    }
  }, [propertyId, isRolos]);

  /** Detach only this property from the shared distribution account. */
  const unbindProperty = useCallback(async () => {
    setUnbinding(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "unbind_property_account", property_id: propertyId },
      });
      if (error) throw new Error(await extractFunctionError(error));
      if (!data?.success) throw new Error(data?.error?.message ?? "Could not unbind this property");
      const units = Array.isArray(data?.cleared_unit_listings) ? data.cleared_unit_listings.length : 0;
      toast.success(
        units
          ? `Property unbound — listing IDs cleared for the property and ${units} unit(s)`
          : "Property unbound from the distribution account",
      );
      notifyRuAccountsChanged();
      setConfirmUnbind(false);
      setExpanded(true);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not unbind this property");
    } finally {
      setUnbinding(false);
    }
  }, [load, propertyId]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Account provisioning belongs to Step A on the Channel onboarding surface — this
   * card only routes there once the mandatory steps 1–5 have passed.
   */
  const startOnboarding = useCallback(() => {
    navigate(`/admin/channel-monitor?tab=onboard&property=${propertyId}`);
  }, [navigate, propertyId]);


  /**
   * Push_FillCompanyDetails_RQ. RU applies the profile to whichever account
   * authenticates, so this only counts once the sub-account's keys are verified —
   * it therefore runs automatically straight after a successful key save/verify.
   */
  const pushCompanyDetails = useCallback(async () => {
    setPushingCompany(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "ensure_company_details", property_id: propertyId, force: true },
      });
      if (error) throw new Error(await extractFunctionError(error));
      if (!data?.success || data?.company_details_pushed !== true) {
        throw new Error(data?.error?.message ?? data?.company_details_warning ?? "The Channel Manager did not confirm the company-details push");
      }
      toast.success("Company details accepted by the Channel Manager");
      notifyRuAccountsChanged();
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not send the company details";
      toast.error(message);
    } finally {
      setPushingCompany(false);
    }
  }, [load, propertyId]);

  const saveKeys = async () => {
    if (!identity?.account?.ru_owner_id) return;
    setSavingKeys(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: {
          action: "save_api_keys",
          account_id: identity.account.id,
          ru_owner_id: identity.account.ru_owner_id,
          login_email: identity.account.ru_login_email ?? identity.account.owner_email,
          access_key: accessKey.trim(),
          secret_key: secretKey.trim(),
          key_label: keyLabel.trim() || null,
          property_id: propertyId,
        },
      });
      if (error) throw new Error(await extractFunctionError(error));
      if (!data?.success) throw new Error(data?.error?.message ?? "Could not save the API keys");
      if (data?.company_details_pushed !== true) {
        toast.warning(`API keys verified, but company details are still pending: ${data?.company_details_warning ?? "no acceptance received"}`);
      } else {
        toast.success("API keys verified and company details accepted by the Channel Manager");
      }
      notifyRuAccountsChanged();
      setAccessKey("");
      setSecretKey("");
      setEditingKeys(false);

      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the API keys");
    } finally {
      setSavingKeys(false);
    }
  };

  const verifyKeys = async () => {
    if (!identity?.account?.ru_owner_id) return;
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: {
          action: "verify_api_keys",
          account_id: identity.account.id,
          ru_owner_id: identity.account.ru_owner_id,
          property_id: propertyId,
        },
      });
      if (error) throw new Error(await extractFunctionError(error));
      if (!data?.success) throw new Error(data?.error?.message ?? "Verification failed");
      if (data?.company_details_pushed !== true) {
        toast.warning(`Keys verified, but company details are still pending: ${data?.company_details_warning ?? "no acceptance received"}`);
      } else {
        toast.success("Keys verified and company details accepted by the Channel Manager");
      }
      notifyRuAccountsChanged();
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Verification failed");
    } finally {
      setVerifying(false);
    }
  };

  if (!isRolos) return null;

  const account = identity?.account ?? null;
  const linked = !!account?.ru_owner_id;
  const gated = identity?.push_gated !== false;
  /** Once keys exist the instructions and inputs collapse to a single "Update keys" action. */
  const showKeyEntry = !identity?.keys_captured || editingKeys;
  /** Fully provisioned (OwnerID + key/secret captured) — the panel rests collapsed. */
  const settled = linked && identity?.keys_captured === true;
  const bodyVisible = !settled || expanded;


  return (
    <Card className={gated ? "border-amber-500/40" : "border-emerald-500/40"}>
      <CardHeader className="py-3 px-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              Channel Manager distribution account
              {linked ? (
                <Badge variant="secondary" className="text-[10px]">OwnerID {account?.ru_owner_id}</Badge>
              ) : (
                <Badge variant="outline" className="text-[10px]">Not linked</Badge>
              )}
              {linked && identity?.keys_captured && (
                <Badge className="text-[10px] bg-emerald-600 hover:bg-emerald-600">Keys captured</Badge>
              )}
            </CardTitle>
            <CardDescription className="text-xs">
              One distribution account per owner. Channel Manager push and pull stay
              blocked until the sub-account's own API key and secret are captured here.
            </CardDescription>
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading} className="gap-1.5">
              {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
              Refresh
            </Button>
            {settled && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {expanded ? "Hide" : "Manage"}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>

      {bodyVisible && (
      <CardContent className="py-3 px-4 space-y-3">
        {gated && identity?.gate_reason && (
          <Alert variant="default" className="py-2">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle className="text-xs">Channel Manager push/pull gated</AlertTitle>
            <AlertDescription className="text-xs">{identity.gate_reason}</AlertDescription>
          </Alert>
        )}

        {/* Live notification (LNM) + content quality (MCQ) health — read-only */}
        {linked && <RuLnmStatusChips propertyId={propertyId} />}



        {/* Linked identity summary */}
        {linked && (
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div>
              <span className="text-muted-foreground">Sub-account</span>
              <div className="font-medium break-all">{account ? ruAccountLabel(account) : "—"}</div>
            </div>

            <div>
              <span className="text-muted-foreground">Scope</span>
              <div className="font-medium capitalize">{account?.scope ?? "—"}</div>
            </div>
            <div>
              <span className="text-muted-foreground">Company details</span>
              {account?.company_details_pushed ? (
                <div className="font-medium">
                  Accepted{" "}
                  {account.company_filled_at
                    ? new Date(account.company_filled_at).toLocaleDateString()
                    : ""}{" "}
                  by the Channel Manager with verified keys
                </div>
              ) : (
                <div className="space-y-1">
                  <div className="font-medium text-amber-600">
                    {account?.company_filled_at
                      ? `Needs re-send — the ${new Date(account.company_filled_at).toLocaleDateString()} push predates key verification`
                      : "Not sent"}
                  </div>
                  {!readOnly && identity?.keys_captured && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs"
                      disabled={pushingCompany}
                      onClick={() => void pushCompanyDetails()}
                    >
                      {pushingCompany && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Send company details
                    </Button>
                  )}
                </div>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">Channel Manager PropertyID for this property</span>
              <div className="font-medium">{identity?.property.ru_property_id ?? "Not pushed yet"}</div>
            </div>
          </div>
        )}

        {/* Not linked → readiness + route to Step A */}
        {!linked && identity && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground">
              No distribution account exists for this owner. Once the mandatory steps 1–5 pass, confirm below and the
              Channel onboarding page provisions the account for this property.
            </p>
            <ul className="space-y-1">
              {identity.readiness.checks.filter((c) => c.label !== "Portfolio").map((c) => (
                <li key={c.label} className="flex items-start gap-2 text-xs">
                  {c.ok ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  )}
                  <span>
                    <span className="font-medium">{c.label}</span>
                    {!c.ok && <span className="text-muted-foreground"> — {c.hint}</span>}
                  </span>
                </li>
              ))}
              {gate.loading || gate.grading ? (
                <li className="flex items-start gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin mt-0.5 shrink-0" />
                  Checking steps 1–5 from the live property record…
                </li>
              ) : gate.readyToSell ? (
                <li className="flex items-start gap-2 text-xs">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 mt-0.5 shrink-0" />
                  <span className="font-medium">Steps 1–5 complete</span>
                </li>
              ) : gate.readyToSellBlockers.length > 0 ? (
                gate.readyToSellBlockers.map((blocker, index) => (
                  <li key={`rts-${index}`} className="flex items-start gap-2 text-xs">
                    <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                    <span>{blocker}</span>
                  </li>
                ))
              ) : (
                <li className="flex items-start gap-2 text-xs">
                  <XCircle className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  <span>{blockedReason}</span>
                </li>
              )}
            </ul>
            {!readOnly && (
              <div className="space-y-1.5">
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  disabled={!gate.readyToSell || gate.loading || gate.grading}
                  title={
                    gate.readyToSell
                      ? "Open Channel onboarding and run Step A for this property"
                      : blockedReason
                  }
                  onClick={startOnboarding}
                >
                  {gate.loading || gate.grading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <UserPlus className="h-3.5 w-3.5" />
                  )}
                  Confirm &amp; create
                </Button>
              </div>
            )}
          </div>
        )}


        {/* API keys */}
        {linked && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <KeyRound className="h-4 w-4 text-primary" />
                <span className="text-xs font-semibold">Sub-account API keys</span>
                {identity?.keys ? (
                  <Badge variant="secondary" className="text-[10px]">
                    ••••{identity.keys.access_key_last4}
                    {identity.keys.key_label ? ` · ${identity.keys.key_label}` : ""}
                    {identity.keys.verified_at
                      ? ` · verified ${new Date(identity.keys.verified_at).toLocaleDateString()}`
                      : " · unverified"}
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-[10px]">No keys</Badge>
                )}
              </div>

              {showKeyEntry ? (
                <>
                  <ol className="text-xs text-muted-foreground space-y-1 list-decimal pl-4">
                    <li>
                      Sign in to the Channel Manager as the sub-user{" "}
                      <span className="font-medium text-foreground">
                        {account?.ru_login_email ?? account?.owner_email ?? "—"}
                      </span>
                      {identity?.sub_user_password_hint && (
                        <>
                          {" "}using the ROL'OS operator password{" "}
                          <button
                            type="button"
                            className="underline underline-offset-2 font-medium text-foreground"
                            onClick={() => {
                              void navigator.clipboard.writeText(identity.sub_user_password_hint ?? "");
                              toast.success("Password copied");
                            }}
                          >
                            (copy <Copy className="inline h-3 w-3" />)
                          </button>
                        </>
                      )}
                      .
                    </li>
                    <li>
                      Open{" "}
                      <a
                        href={RU_SECURITY_SETTINGS_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-2 inline-flex items-center gap-1 text-foreground"
                      >
                        Security settings <ExternalLink className="h-3 w-3" />
                      </a>{" "}
                      and generate an API key with scope <span className="font-medium text-foreground">XmlApi</span>.
                    </li>
                    <li>Paste the AccessKey and SecretKey below and save. The secret is stored encrypted and never shown again.</li>
                  </ol>

                  {!readOnly && (
                    <div className="grid gap-2 sm:grid-cols-3">
                      <div className="space-y-1">
                        <Label htmlFor="ru_access_key" className="text-xs">AccessKey</Label>
                        <Input
                          id="ru_access_key"
                          value={accessKey}
                          onChange={(e) => setAccessKey(e.target.value)}
                          placeholder="Channel Manager AccessKey"
                          className="h-7 text-xs"
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ru_secret_key" className="text-xs">SecretKey</Label>
                        <Input
                          id="ru_secret_key"
                          type="password"
                          value={secretKey}
                          onChange={(e) => setSecretKey(e.target.value)}
                          placeholder="Channel Manager SecretKey"
                          className="h-7 text-xs"
                          autoComplete="off"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="ru_key_label" className="text-xs">Label</Label>
                        <Input
                          id="ru_key_label"
                          value={keyLabel}
                          onChange={(e) => setKeyLabel(e.target.value)}
                          className="h-7 text-xs"
                        />
                      </div>
                    </div>
                  )}

                  {!readOnly && (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        size="sm"
                        className="gap-1.5"
                        onClick={() => void saveKeys()}
                        disabled={savingKeys || !accessKey.trim() || !secretKey.trim()}
                      >
                        {savingKeys ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                        Save keys
                      </Button>
                      {identity?.keys_captured && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingKeys(false);
                            setAccessKey("");
                            setSecretKey("");
                          }}
                          disabled={savingKeys}
                        >
                          Cancel
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5"
                        onClick={() => void verifyKeys()}
                        disabled={verifying || !identity?.keys_captured}
                      >
                        {verifying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}
                        Verify with Channel Manager
                      </Button>
                    </div>
                  )}
                </>
              ) : (
                !readOnly && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setEditingKeys(true)}>
                      <KeyRound className="h-3.5 w-3.5" />
                      Update keys
                    </Button>
                  </div>
                )
              )}

            </div>

            {!readOnly && isAdmin && (
              <>
                <Separator />
                <div className="space-y-2">
                  <div className="text-xs font-semibold flex items-center gap-1.5">
                    <Unlink className="h-3.5 w-3.5 text-destructive" />
                    Unbind this property
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Detaches only <span className="font-medium text-foreground">{identity?.property.name}</span> from
                    OwnerID {account?.ru_owner_id}: push is switched off and the stored listing IDs for the property and
                    its units are cleared. The distribution account and portfolio siblings stay bound, and listings
                    already created on the channel are not deleted — archive them there if they are no longer wanted.
                  </p>
                  {confirmUnbind ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs">Unbind this property from the distribution account?</span>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="gap-1.5"
                        disabled={unbinding}
                        onClick={() => void unbindProperty()}
                      >
                        {unbinding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlink className="h-3.5 w-3.5" />}
                        Confirm unbind
                      </Button>
                      <Button size="sm" variant="ghost" disabled={unbinding} onClick={() => setConfirmUnbind(false)}>
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1.5 text-xs text-destructive"
                      onClick={() => setConfirmUnbind(true)}
                    >
                      <Unlink className="h-3.5 w-3.5" />
                      Unbind property from account
                    </Button>
                  )}
                </div>

                <Separator />
                <div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 gap-1.5 px-1 text-xs text-muted-foreground"
                    onClick={() => setShowWlTokens((v) => !v)}
                  >
                    {showWlTokens ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                    Advanced · White Label tokens (optional)
                  </Button>
                  {showWlTokens && (
                    <div className="mt-2">
                      <RuWhiteLabelTokenFields propertyId={propertyId} readOnly={readOnly} />
                    </div>
                  )}
                </div>
              </>
            )}


          </>
        )}


        {/* Shared identity */}
        {linked && (identity?.siblings.length ?? 0) > 0 && (
          <>
            <Separator />
            <div className="text-xs">
              <span className="text-muted-foreground">
                Shared with {identity?.siblings.length} other ROL'OS property in this portfolio — the same OwnerID, key
                and secret apply to all of them:
              </span>
              <div className="mt-1 flex flex-wrap gap-1">
                {identity?.siblings.map((s) => (
                  <Badge key={s.id} variant="outline" className="text-[10px]">
                    {s.name}
                    {s.ru_property_id ? ` · RU ${s.ru_property_id}` : ""}
                  </Badge>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
      )}
    </Card>
  );
}
