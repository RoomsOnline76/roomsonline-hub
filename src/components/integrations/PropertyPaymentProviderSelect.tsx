import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { CreditCard, ExternalLink, Eye, EyeOff, Save, ShieldCheck, Loader2, Globe, MapPin, ChevronDown, Building2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { usePropertyPortfolioPayment } from "@/hooks/usePortfolioPaymentConfig";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

/** Turns Error / PostgrestError / unknown into readable text (never "[object Object]"). */
function describeError(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  const err = e as { message?: string; details?: string; hint?: string; code?: string };
  const parts = [err.message, err.details, err.hint, err.code ? `(${err.code})` : undefined]
    .filter(Boolean);
  if (parts.length > 0) return parts.join(" — ");
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}


// ── Provider registry with credential schemas ──────────────────────────────────

export interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  sensitive?: boolean;
  helpUrl?: string;
}

export interface ProviderDef {
  value: string;
  label: string;
  website: string | null;
  description?: string;
  docsUrl?: string;
  credentials: CredentialField[];
  region: "sa" | "international";
}

export const SA_PROVIDERS: ProviderDef[] = [
  {
    value: "payfast", label: "PayFast", website: "https://payfast.io", region: "sa",
    docsUrl: "https://developers.payfast.co.za/",
    credentials: [
      { key: "merchant_id", label: "Merchant ID", placeholder: "e.g. 10000100" },
      { key: "merchant_key", label: "Merchant Key", placeholder: "e.g. 46f0cd694581a", sensitive: true },
      { key: "passphrase", label: "Passphrase", placeholder: "Salt passphrase from settings", sensitive: true },
    ],
  },
  {
    value: "paygate", label: "PayGate", website: "https://www.paygate.co.za", region: "sa",
    docsUrl: "https://developer.paygate.co.za/",
    credentials: [
      { key: "paygate_id", label: "PayGate ID", placeholder: "e.g. 10011072130" },
      { key: "encryption_key", label: "Encryption Key", placeholder: "Secret encryption key", sensitive: true },
    ],
  },
  {
    value: "peach", label: "Peach Payments", website: "https://www.peachpayments.com", region: "sa",
    docsUrl: "https://developer.peachpayments.com/",
    credentials: [
      { key: "entity_id", label: "Entity ID", placeholder: "Channel entity ID" },
      { key: "access_token", label: "Access Token", placeholder: "Bearer access token", sensitive: true },
      { key: "webhook_secret", label: "Webhook Secret", placeholder: "Webhook decryption key", sensitive: true },
    ],
  },
  {
    value: "yoco", label: "Yoco", website: "https://www.yoco.com", region: "sa",
    docsUrl: "https://developer.yoco.com/",
    credentials: [
      { key: "public_key", label: "Public Key", placeholder: "pk_live_..." },
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", sensitive: true },
    ],
  },
  {
    value: "ozow", label: "Ozow", website: "https://ozow.com", region: "sa",
    docsUrl: "https://hub.ozow.com/docs/",
    credentials: [
      { key: "site_code", label: "Site Code", placeholder: "Your Ozow site code" },
      { key: "private_key", label: "Private Key", placeholder: "API private key", sensitive: true },
      { key: "api_key", label: "API Key", placeholder: "REST API key", sensitive: true },
    ],
  },
  {
    value: "dpo", label: "DPO Pay", website: "https://dpogroup.com", region: "sa",
    docsUrl: "https://docs.dpopay.com/",
    credentials: [
      { key: "company_token", label: "Company Token", placeholder: "Your DPO company token", sensitive: true },
      { key: "service_type", label: "Service Type", placeholder: "e.g. 5525" },
    ],
  },
  {
    value: "addpay", label: "AddPay", website: "https://www.addpay.africa", region: "sa",
    docsUrl: "https://cnp-developer.addpay.cloud/",
    credentials: [
      { key: "api_key", label: "API Key", placeholder: "CNP API key", sensitive: true },
      { key: "api_secret", label: "API Secret", placeholder: "CNP API secret", sensitive: true },
    ],
  },
  {
    value: "payflex", label: "Payflex (BNPL)", website: "https://payflex.co.za", region: "sa",
    docsUrl: "https://docs.payflex.co.za/",
    credentials: [
      { key: "merchant_id", label: "Merchant ID", placeholder: "Payflex merchant ID" },
      { key: "api_key", label: "API Key", placeholder: "Payflex API key", sensitive: true },
    ],
  },
  {
    value: "stitch", label: "Stitch", website: "https://www.stitch.money", region: "sa",
    docsUrl: "https://stitch.money/docs/",
    credentials: [
      { key: "client_id", label: "Client ID", placeholder: "OAuth client ID" },
      { key: "client_secret", label: "Client Secret", placeholder: "OAuth client secret", sensitive: true },
    ],
  },
  {
    value: "ikhokha", label: "iKhokha (iK Pay)", website: "https://www.ikhokha.com", region: "sa",
    docsUrl: "https://developer.ikhokha.com/",
    credentials: [
      { key: "application_id", label: "Application ID", placeholder: "iK Pay application ID" },
      { key: "application_key", label: "Application Key", placeholder: "iK Pay application key", sensitive: true },
    ],
  },
  {
    value: "snapscan", label: "SnapScan", website: "https://www.snapscan.co.za", region: "sa",
    docsUrl: "https://developer.getsnapscan.com/",
    credentials: [
      { key: "merchant_id", label: "Merchant ID", placeholder: "SnapScan merchant reference" },
      { key: "api_key", label: "API Key", placeholder: "Merchant API key", sensitive: true },
    ],
  },
  {
    value: "zapper", label: "Zapper", website: "https://www.zapper.com", region: "sa",
    credentials: [
      { key: "merchant_id", label: "Merchant ID", placeholder: "Zapper merchant ID" },
      { key: "site_id", label: "Site ID", placeholder: "Zapper site ID" },
    ],
  },
];

export const INTERNATIONAL_PROVIDERS: ProviderDef[] = [
  {
    value: "stripe", label: "Stripe", website: "https://stripe.com", region: "international",
    docsUrl: "https://docs.stripe.com/api",
    credentials: [
      { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", sensitive: true },
      { key: "webhook_secret", label: "Webhook Secret", placeholder: "whsec_...", sensitive: true },
    ],
  },
  {
    value: "paypal", label: "PayPal", website: "https://www.paypal.com", region: "international",
    docsUrl: "https://developer.paypal.com/docs/api/orders/v2/",
    credentials: [
      { key: "client_id", label: "Client ID", placeholder: "PayPal client ID" },
      { key: "client_secret", label: "Client Secret", placeholder: "PayPal client secret", sensitive: true },
      { key: "environment", label: "Environment", placeholder: "sandbox or live" },
    ],
  },
  {
    value: "flutterwave", label: "Flutterwave", website: "https://flutterwave.com", region: "international",
    docsUrl: "https://developer.flutterwave.com/",
    credentials: [
      { key: "public_key", label: "Public Key", placeholder: "FLWPUBK-..." },
      { key: "secret_key", label: "Secret Key", placeholder: "FLWSECK-...", sensitive: true },
      { key: "encryption_key", label: "Encryption Key", placeholder: "Card encryption key", sensitive: true },
    ],
  },
  {
    value: "klarna", label: "Klarna (BNPL)", website: "https://www.klarna.com", region: "international",
    docsUrl: "https://docs.klarna.com/",
    credentials: [
      { key: "username", label: "API Username", placeholder: "Klarna API username" },
      { key: "password", label: "API Password", placeholder: "Klarna API password", sensitive: true },
    ],
  },
  {
    value: "affirm", label: "Affirm (BNPL)", website: "https://www.affirm.com", region: "international",
    docsUrl: "https://docs.affirm.com/",
    credentials: [
      { key: "public_api_key", label: "Public API Key", placeholder: "Affirm public key" },
      { key: "private_api_key", label: "Private API Key", placeholder: "Affirm private key", sensitive: true },
    ],
  },
];

export const ALL_PROVIDERS = [...SA_PROVIDERS, ...INTERNATIONAL_PROVIDERS];

// ── Component ──────────────────────────────────────────────────────────────────

interface PropertyPaymentProviderSelectProps {
  propertyId: string;
}

export function PropertyPaymentProviderSelect({ propertyId }: PropertyPaymentProviderSelectProps) {
  const queryClient = useQueryClient();
  const { isAdmin, isDev, isFearlessLeader } = useAuth();
  const canOverride = !!(isAdmin || isDev || isFearlessLeader);
  const {
    portfolioName,
    config: portfolioConfig,
    inherits: inheritsFromPortfolio,
    isOverriding,
  } = usePropertyPortfolioPayment(propertyId);

  const overrideMutation = useMutation({
    mutationFn: async (value: boolean) => {
      const { error } = await supabase
        .from("properties")
        .update({ payment_provider_override: value } as any)
        .eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-portfolio-payment-context", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["property-payment-providers", propertyId] });
      toast.success("Payment provider inheritance updated");
    },
    onError: (e: unknown) =>
      toast.error("Failed to update inheritance", { description: describeError(e) }),
  });

  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [hasCredChanges, setHasCredChanges] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<string[]>([]);
  const [expandedProvider, setExpandedProvider] = useState<string | null>(null);
  const [mainOpen, setMainOpen] = useState(false);
  const [saOpen, setSaOpen] = useState(false);
  const [intlOpen, setIntlOpen] = useState(false);

  // ── Fetch current providers ───────────────────────────────────────────────

  const { data: propertyData, isLoading } = useQuery({
    queryKey: ["property-payment-providers", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("payment_provider, payment_providers")
        .eq("id", propertyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId,
  });

  // Sync from DB
  useEffect(() => {
    if (!propertyData) return;
    const arr = (propertyData as any).payment_providers as string[] | null;
    if (arr && arr.length > 0) {
      setSelectedProviders(arr);
    } else if (propertyData.payment_provider && propertyData.payment_provider !== "default") {
      setSelectedProviders([propertyData.payment_provider]);
    } else {
      setSelectedProviders([]);
    }
  }, [propertyData]);

  // ── Fetch saved credentials ───────────────────────────────────────────────

  const { data: savedCredentials } = useQuery({
    queryKey: ["payment-credentials", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("integration_configs")
        .select("config")
        .eq("property_id", propertyId)
        .eq("integration_type", "payment_credentials")
        .maybeSingle();
      if (error) throw error;
      return (data?.config as Record<string, string>) || {};
    },
    enabled: !!propertyId,
  });

  // ── Where do payments actually settle? (asks the backend, no secrets) ──────

  interface SettlementInfo {
    credential_source: "byo" | "rol";
    inherited: boolean;
    owner_property_id: string | null;
    merchant_id_masked: string;
    is_sandbox: boolean;
    configured: boolean;
  }

  const { data: settlement } = useQuery({
    queryKey: ["payfast-settlement", propertyId],
    queryFn: async (): Promise<SettlementInfo | null> => {
      const { data, error } = await supabase.functions.invoke("payfast-api", {
        body: { action: "resolve_credentials", property_id: propertyId },
      });
      if (error) return null;
      return (data as SettlementInfo) ?? null;
    },
    enabled: !!propertyId,
    staleTime: 60 * 1000,
  });



  useEffect(() => {
    if (savedCredentials) {
      setCredentialValues(savedCredentials);
      setHasCredChanges(false);
    }
  }, [savedCredentials]);

  // ── Save providers mutation ───────────────────────────────────────────────

  const providersMutation = useMutation({
    mutationFn: async (providers: string[]) => {
      const { error } = await supabase
        .from("properties")
        .update({
          payment_providers: providers,
          payment_provider: providers.length > 0 ? providers[0] : null,
        } as any)
        .eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["property-payment-providers", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["property-payment-provider", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["active-payment-gateway"] });
      toast.success("Payment providers updated");
    },
    onError: (e: unknown) =>
      toast.error("Failed to update payment providers", {
        description: describeError(e),
      }),
  });

  // ── Save credentials mutation ─────────────────────────────────────────────

  const credentialsMutation = useMutation({
    mutationFn: async (creds: Record<string, string>) => {
      const { data: existing } = await supabase
        .from("integration_configs")
        .select("id")
        .eq("property_id", propertyId)
        .eq("integration_type", "payment_credentials")
        .maybeSingle();

      if (existing) {
        const { error } = await supabase
          .from("integration_configs")
          .update({ config: creds, updated_at: new Date().toISOString() })
          .eq("id", existing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("integration_configs")
          .insert({
            property_id: propertyId,
            integration_type: "payment_credentials",
            config: creds,
            is_active: true,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payment-credentials", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["payfast-settlement", propertyId] });

      setHasCredChanges(false);
      toast.success("Payment credentials saved securely");
    },
    onError: (e: unknown) =>
      toast.error("Failed to save credentials", {
        description: describeError(e),
      }),
  });

  // ── Handlers ──────────────────────────────────────────────────────────────

  const toggleProvider = (value: string) => {
    const next = selectedProviders.includes(value)
      ? selectedProviders.filter(p => p !== value)
      : [...selectedProviders, value];
    setSelectedProviders(next);
    providersMutation.mutate(next);
  };

  const toggleFieldVisibility = (key: string) => {
    setVisibleFields(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateField = (key: string, value: string) => {
    setCredentialValues(prev => ({ ...prev, [key]: value }));
    setHasCredChanges(true);
  };

  const handleSaveCredentials = () => {
    // Save all credential values for all selected providers
    const relevantKeys = new Set<string>();
    selectedProviders.forEach(pv => {
      const def = ALL_PROVIDERS.find(p => p.value === pv);
      def?.credentials.forEach(f => relevantKeys.add(f.key));
    });
    const filtered: Record<string, string> = {};
    for (const key of relevantKeys) {
      if (credentialValues[key]) filtered[key] = credentialValues[key];
    }
    credentialsMutation.mutate(filtered);
  };

  // ── Render provider list ────────────────────────────────────────────────

  const renderProviderList = (providers: ProviderDef[]) => (
    <div className="space-y-1">
      {providers.map((p) => {
        const isSelected = selectedProviders.includes(p.value);
        const isExpanded = expandedProvider === p.value && isSelected;

        return (
          <div key={p.value} className="space-y-0">
            <div
              className={cn(
                "flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors cursor-pointer",
                isSelected
                  ? "border-primary/40 bg-primary/5"
                  : "border-border/50 hover:border-border"
              )}
              onClick={() => {
                if (isSelected && p.credentials.length > 0) {
                  setExpandedProvider(isExpanded ? null : p.value);
                }
              }}
            >
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => toggleProvider(p.value)}
                onClick={(e) => e.stopPropagation()}
                className="shrink-0"
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium">{p.label}</span>
                  {isSelected && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Active
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                {p.docsUrl && (
                  <a
                    href={p.docsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-muted-foreground hover:text-primary"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {isSelected && p.credentials.length > 0 && (
                  <span className="text-[10px] text-muted-foreground">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                )}
              </div>
            </div>

            {isExpanded && p.credentials.length > 0 && (
              <div className="ml-9 space-y-2 py-2 pl-2 border-l-2 border-primary/20">
                {p.credentials.map((field) => {
                  const isSensitive = field.sensitive !== false;
                  const isVisible = visibleFields[field.key] || !isSensitive;
                  const currentValue = credentialValues[field.key] || "";

                  return (
                    <div key={field.key} className="space-y-1">
                      <Label htmlFor={`cred-${p.value}-${field.key}`} className="text-xs font-medium">
                        {field.label}
                      </Label>
                      <div className="relative">
                        <Input
                          id={`cred-${p.value}-${field.key}`}
                          type={isVisible ? "text" : "password"}
                          value={currentValue}
                          onChange={(e) => updateField(field.key, e.target.value)}
                          placeholder={field.placeholder}
                          className="pr-10 text-xs font-mono h-8"
                        />
                        {isSensitive && (
                          <button
                            type="button"
                            onClick={() => toggleFieldVisibility(field.key)}
                            className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          >
                            {isVisible ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  const saActiveCount = selectedProviders.filter(p => SA_PROVIDERS.some(sp => sp.value === p)).length;
  const intlActiveCount = selectedProviders.filter(p => INTERNATIONAL_PROVIDERS.some(ip => ip.value === p)).length;

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <Card>
      <Collapsible open={mainOpen} onOpenChange={setMainOpen}>
        <CollapsibleTrigger asChild>
          <CardHeader className="pb-3 cursor-pointer hover:bg-muted/30 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-5 w-5 text-primary" />
                <div>
                  <CardTitle className="text-base">Payment Providers</CardTitle>
                  <CardDescription className="text-xs">
                    {selectedProviders.length > 0
                      ? `${selectedProviders.length} provider${selectedProviders.length !== 1 ? "s" : ""} active`
                      : "Select payment gateways for this property"}
                  </CardDescription>
                </div>
              </div>
              <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", mainOpen && "rotate-180")} />
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <>
                {portfolioName && (
                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 space-y-2">
                    <div className="flex items-start gap-2">
                      <Building2 className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">
                          {inheritsFromPortfolio
                            ? `Inherited from the ${portfolioName} portfolio`
                            : `Overriding the ${portfolioName} portfolio`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {inheritsFromPortfolio
                            ? portfolioConfig?.allow_custom_payment_provider
                              ? `Provider: ${(portfolioConfig?.payment_providers || []).map((v) => ALL_PROVIDERS.find((x) => x.value === v)?.label || v).join(", ") || "none"} — managed in Admin → Portfolios.`
                              : "Custom providers are disabled portfolio-wide; the Rooms Online PayFast gateway is used."
                            : "This property uses its own payment provider settings below."}
                        </p>
                      </div>
                    </div>
                    {canOverride && (
                      <div className="flex items-center justify-between rounded-md bg-background/70 px-2.5 py-1.5">
                        <span className="text-xs">Override portfolio payment settings</span>
                        <Switch
                          checked={isOverriding}
                          disabled={overrideMutation.isPending}
                          onCheckedChange={(v) => overrideMutation.mutate(v)}
                        />
                      </div>
                    )}
                  </div>
                )}

                {settlement && (
                  <div
                    className={cn(
                      "rounded-lg border px-3 py-2.5 flex items-start gap-2",
                      settlement.credential_source === "byo"
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-muted/40",
                    )}
                  >
                    <ShieldCheck className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="text-sm font-medium">
                        {settlement.credential_source === "byo"
                          ? `Payments settle to this property's own PayFast account${settlement.inherited ? " (inherited from the portfolio)" : ""}`
                          : "Payments settle to the Rooms Online facilitator account"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {settlement.credential_source === "byo"
                          ? `Merchant ${settlement.merchant_id_masked}${settlement.is_sandbox ? " — sandbox mode" : ""}`
                          : "Save your own merchant credentials below to settle directly to your account."}
                      </p>
                      {settlement.credential_source === "byo" && settlement.onsite_supported === false && (
                        <p className="text-xs text-muted-foreground">
                          This account uses redirect checkout — enable Onsite Payments in the PayFast
                          dashboard for in-page checkout.
                        </p>
                      )}
                    </div>

                  </div>
                )}


                {!inheritsFromPortfolio && (
                <>
                <Collapsible open={saOpen} onOpenChange={setSaOpen}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full rounded-lg border px-3 py-2 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <MapPin className="h-3.5 w-3.5" />
                      <span>South African</span>
                      {saActiveCount > 0 && (
                        <Badge variant="default" className="text-[9px] px-1.5 py-0">{saActiveCount}</Badge>
                      )}
                    </div>
                    <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", saOpen && "rotate-180")} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    {renderProviderList(SA_PROVIDERS)}
                  </CollapsibleContent>
                </Collapsible>

                <Collapsible open={intlOpen} onOpenChange={setIntlOpen}>
                  <CollapsibleTrigger className="flex items-center justify-between w-full rounded-lg border px-3 py-2 hover:bg-muted/30 transition-colors">
                    <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      <Globe className="h-3.5 w-3.5" />
                      <span>International</span>
                      {intlActiveCount > 0 && (
                        <Badge variant="default" className="text-[9px] px-1.5 py-0">{intlActiveCount}</Badge>
                      )}
                    </div>
                    <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", intlOpen && "rotate-180")} />
                  </CollapsibleTrigger>
                  <CollapsibleContent className="pt-2">
                    {renderProviderList(INTERNATIONAL_PROVIDERS)}
                  </CollapsibleContent>
                </Collapsible>

                {selectedProviders.length === 0 && (
                  <p className="text-xs text-muted-foreground italic">
                    No providers selected — the platform default (PayFast) will be used.
                  </p>
                )}

                {hasCredChanges && (
                  <div className="flex items-center gap-2 pt-2 border-t">
                    <ShieldCheck className="h-4 w-4 text-muted-foreground" />
                    <p className="text-xs text-muted-foreground flex-1">
                      Credentials are stored securely per-property.
                    </p>
                    <Button
                      size="sm"
                      onClick={handleSaveCredentials}
                      disabled={credentialsMutation.isPending}
                      className="gap-1.5"
                    >
                      {credentialsMutation.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Save Credentials
                    </Button>
                  </div>
                )}
                </>
                )}
              </>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
