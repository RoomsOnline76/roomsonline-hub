import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditCard, ExternalLink, Eye, EyeOff, Save, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

// ── Provider registry with credential schemas ──────────────────────────────────

interface CredentialField {
  key: string;
  label: string;
  placeholder: string;
  sensitive?: boolean; // masked by default
  helpUrl?: string;
}

interface ProviderDef {
  value: string;
  label: string;
  website: string | null;
  description?: string;
  docsUrl?: string;
  credentials: CredentialField[];
}

const PAYMENT_PROVIDERS: ProviderDef[] = [
  {
    value: "default",
    label: "Platform Default",
    website: null,
    description: "Uses the global PayFast/PayGate setting",
    credentials: [],
  },
  {
    value: "payfast",
    label: "PayFast",
    website: "https://payfast.io",
    docsUrl: "https://developers.payfast.co.za/",
    credentials: [
      { key: "merchant_id", label: "Merchant ID", placeholder: "e.g. 10000100" },
      { key: "merchant_key", label: "Merchant Key", placeholder: "e.g. 46f0cd694581a", sensitive: true },
      { key: "passphrase", label: "Passphrase", placeholder: "Salt passphrase from settings", sensitive: true },
    ],
  },
  {
    value: "paygate",
    label: "PayGate",
    website: "https://www.paygate.co.za",
    docsUrl: "https://developer.paygate.co.za/",
    credentials: [
      { key: "paygate_id", label: "PayGate ID", placeholder: "e.g. 10011072130" },
      { key: "encryption_key", label: "Encryption Key", placeholder: "Secret encryption key", sensitive: true },
    ],
  },
  {
    value: "peach",
    label: "Peach Payments",
    website: "https://www.peachpayments.com",
    docsUrl: "https://developer.peachpayments.com/",
    credentials: [
      { key: "entity_id", label: "Entity ID", placeholder: "Channel entity ID" },
      { key: "access_token", label: "Access Token", placeholder: "Bearer access token", sensitive: true },
      { key: "webhook_secret", label: "Webhook Secret", placeholder: "Webhook decryption key", sensitive: true },
    ],
  },
  {
    value: "yoco",
    label: "Yoco",
    website: "https://www.yoco.com",
    docsUrl: "https://developer.yoco.com/",
    credentials: [
      { key: "public_key", label: "Public Key", placeholder: "pk_live_..." },
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", sensitive: true },
    ],
  },
  {
    value: "ozow",
    label: "Ozow",
    website: "https://ozow.com",
    docsUrl: "https://hub.ozow.com/docs/",
    credentials: [
      { key: "site_code", label: "Site Code", placeholder: "Your Ozow site code" },
      { key: "private_key", label: "Private Key", placeholder: "API private key", sensitive: true },
      { key: "api_key", label: "API Key", placeholder: "REST API key", sensitive: true },
    ],
  },
  {
    value: "dpo",
    label: "DPO Pay",
    website: "https://dpogroup.com",
    docsUrl: "https://docs.dpopay.com/",
    credentials: [
      { key: "company_token", label: "Company Token", placeholder: "Your DPO company token", sensitive: true },
      { key: "service_type", label: "Service Type", placeholder: "e.g. 5525" },
    ],
  },
  {
    value: "addpay",
    label: "AddPay",
    website: "https://www.addpay.africa",
    docsUrl: "https://cnp-developer.addpay.cloud/",
    credentials: [
      { key: "api_key", label: "API Key", placeholder: "CNP API key", sensitive: true },
      { key: "api_secret", label: "API Secret", placeholder: "CNP API secret", sensitive: true },
    ],
  },
  {
    value: "payflex",
    label: "Payflex (BNPL)",
    website: "https://payflex.co.za",
    docsUrl: "https://docs.payflex.co.za/",
    credentials: [
      { key: "merchant_id", label: "Merchant ID", placeholder: "Payflex merchant ID" },
      { key: "api_key", label: "API Key", placeholder: "Payflex API key", sensitive: true },
    ],
  },
  {
    value: "stitch",
    label: "Stitch",
    website: "https://www.stitch.money",
    docsUrl: "https://stitch.money/docs/",
    credentials: [
      { key: "client_id", label: "Client ID", placeholder: "OAuth client ID" },
      { key: "client_secret", label: "Client Secret", placeholder: "OAuth client secret", sensitive: true },
    ],
  },
  {
    value: "ikhokha",
    label: "iKhokha (iK Pay)",
    website: "https://www.ikhokha.com",
    docsUrl: "https://developer.ikhokha.com/",
    credentials: [
      { key: "application_id", label: "Application ID", placeholder: "iK Pay application ID" },
      { key: "application_key", label: "Application Key", placeholder: "iK Pay application key", sensitive: true },
    ],
  },
  {
    value: "snapscan",
    label: "SnapScan",
    website: "https://www.snapscan.co.za",
    docsUrl: "https://developer.getsnapscan.com/",
    credentials: [
      { key: "merchant_id", label: "Merchant ID", placeholder: "SnapScan merchant reference" },
      { key: "api_key", label: "API Key", placeholder: "Merchant API key", sensitive: true },
    ],
  },
  {
    value: "zapper",
    label: "Zapper",
    website: "https://www.zapper.com",
    credentials: [
      { key: "merchant_id", label: "Merchant ID", placeholder: "Zapper merchant ID" },
      { key: "site_id", label: "Site ID", placeholder: "Zapper site ID" },
    ],
  },
  {
    value: "flutterwave",
    label: "Flutterwave",
    website: "https://flutterwave.com",
    docsUrl: "https://developer.flutterwave.com/",
    credentials: [
      { key: "public_key", label: "Public Key", placeholder: "FLWPUBK-..." },
      { key: "secret_key", label: "Secret Key", placeholder: "FLWSECK-...", sensitive: true },
      { key: "encryption_key", label: "Encryption Key", placeholder: "Card encryption key", sensitive: true },
    ],
  },
  {
    value: "stripe",
    label: "Stripe",
    website: "https://stripe.com/za",
    docsUrl: "https://docs.stripe.com/api",
    credentials: [
      { key: "publishable_key", label: "Publishable Key", placeholder: "pk_live_..." },
      { key: "secret_key", label: "Secret Key", placeholder: "sk_live_...", sensitive: true },
      { key: "webhook_secret", label: "Webhook Secret", placeholder: "whsec_...", sensitive: true },
    ],
  },
  {
    value: "paypal",
    label: "PayPal",
    website: "https://www.paypal.com",
    docsUrl: "https://developer.paypal.com/docs/api/orders/v2/",
    credentials: [
      { key: "client_id", label: "Client ID", placeholder: "PayPal client ID" },
      { key: "client_secret", label: "Client Secret", placeholder: "PayPal client secret", sensitive: true },
      { key: "environment", label: "Environment", placeholder: "sandbox or live" },
    ],
  },
  {
    value: "klarna",
    label: "Klarna (BNPL)",
    website: "https://www.klarna.com",
    docsUrl: "https://docs.klarna.com/",
    credentials: [
      { key: "username", label: "API Username", placeholder: "Klarna API username" },
      { key: "password", label: "API Password", placeholder: "Klarna API password", sensitive: true },
    ],
  },
  {
    value: "affirm",
    label: "Affirm (BNPL)",
    website: "https://www.affirm.com",
    docsUrl: "https://docs.affirm.com/",
    credentials: [
      { key: "public_api_key", label: "Public API Key", placeholder: "Affirm public key" },
      { key: "private_api_key", label: "Private API Key", placeholder: "Affirm private key", sensitive: true },
    ],
  },
];

// ── Component ──────────────────────────────────────────────────────────────────

interface PropertyPaymentProviderSelectProps {
  propertyId: string;
}

export function PropertyPaymentProviderSelect({ propertyId }: PropertyPaymentProviderSelectProps) {
  const queryClient = useQueryClient();
  const [visibleFields, setVisibleFields] = useState<Record<string, boolean>>({});
  const [credentialValues, setCredentialValues] = useState<Record<string, string>>({});
  const [hasChanges, setHasChanges] = useState(false);

  // ── Fetch current provider ────────────────────────────────────────────────

  const { data: currentProvider, isLoading } = useQuery({
    queryKey: ["property-payment-provider", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("payment_provider")
        .eq("id", propertyId)
        .single();
      if (error) throw error;
      return data?.payment_provider || "default";
    },
    enabled: !!propertyId,
  });

  // ── Fetch saved credentials from integration_configs ──────────────────────

  const { data: savedCredentials, isLoading: credsLoading } = useQuery({
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

  // Sync saved credentials into local state when loaded
  useEffect(() => {
    if (savedCredentials) {
      setCredentialValues(savedCredentials);
      setHasChanges(false);
    }
  }, [savedCredentials]);

  // ── Update provider mutation ──────────────────────────────────────────────

  const providerMutation = useMutation({
    mutationFn: async (provider: string) => {
      const value = provider === "default" ? null : provider;
      const { error } = await supabase
        .from("properties")
        .update({ payment_provider: value })
        .eq("id", propertyId);
      if (error) throw error;
    },
    onSuccess: (_, provider) => {
      queryClient.invalidateQueries({ queryKey: ["property-payment-provider", propertyId] });
      queryClient.invalidateQueries({ queryKey: ["active-payment-gateway"] });
      const label = PAYMENT_PROVIDERS.find(p => p.value === provider)?.label || provider;
      toast.success(`Payment provider updated to ${label}`);
    },
    onError: () => toast.error("Failed to update payment provider"),
  });

  // ── Save credentials mutation ─────────────────────────────────────────────

  const credentialsMutation = useMutation({
    mutationFn: async (creds: Record<string, string>) => {
      // Upsert into integration_configs
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
      setHasChanges(false);
      toast.success("Payment credentials saved securely");
    },
    onError: () => toast.error("Failed to save credentials"),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const selected = currentProvider || "default";
  const selectedProvider = PAYMENT_PROVIDERS.find(p => p.value === selected);
  const credentialFields = selectedProvider?.credentials || [];

  const toggleFieldVisibility = (key: string) => {
    setVisibleFields(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const updateField = (key: string, value: string) => {
    setCredentialValues(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const maskValue = (value: string) => {
    if (!value) return "";
    if (value.length <= 6) return "••••••";
    return value.slice(0, 3) + "•".repeat(Math.min(value.length - 6, 12)) + value.slice(-3);
  };

  const handleSaveCredentials = () => {
    // Only save fields relevant to the current provider
    const relevantKeys = credentialFields.map(f => f.key);
    const filtered: Record<string, string> = {};
    for (const key of relevantKeys) {
      if (credentialValues[key]) {
        filtered[key] = credentialValues[key];
      }
    }
    credentialsMutation.mutate(filtered);
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <div>
              <CardTitle className="text-base">Payment Provider</CardTitle>
              <CardDescription className="text-xs">
                Select which payment gateway processes bookings for this property
              </CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {selectedProvider?.docsUrl && (
              <a
                href={selectedProvider.docsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                Docs
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
            {selectedProvider?.website && (
              <a
                href={selectedProvider.website}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
              >
                Visit
                <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Provider selector */}
        <Select
          value={selected}
          onValueChange={(v) => providerMutation.mutate(v)}
          disabled={isLoading || providerMutation.isPending}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select payment provider" />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_PROVIDERS.map((p) => (
              <SelectItem key={p.value} value={p.value}>
                <div className="flex items-center gap-2">
                  <span>{p.label}</span>
                  {p.value === "default" && (
                    <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                      Recommended
                    </Badge>
                  )}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Credential fields */}
        {credentialFields.length > 0 && (
          <div className="space-y-3 pt-2 border-t">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" />
              <p className="text-xs text-muted-foreground">
                Enter your <strong>{selectedProvider?.label}</strong> API credentials below. These are stored securely per-property.
              </p>
            </div>

            {credentialFields.map((field) => {
              const isSensitive = field.sensitive !== false;
              const isVisible = visibleFields[field.key] || !isSensitive;
              const currentValue = credentialValues[field.key] || "";

              return (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={`cred-${field.key}`} className="text-xs font-medium">
                    {field.label}
                  </Label>
                  <div className="relative">
                    <Input
                      id={`cred-${field.key}`}
                      type={isVisible ? "text" : "password"}
                      value={currentValue}
                      onChange={(e) => updateField(field.key, e.target.value)}
                      placeholder={field.placeholder}
                      className="pr-10 text-sm font-mono"
                    />
                    {isSensitive && (
                      <button
                        type="button"
                        onClick={() => toggleFieldVisibility(field.key)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        {isVisible ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}

            <Button
              onClick={handleSaveCredentials}
              disabled={!hasChanges || credentialsMutation.isPending}
              size="sm"
              className="w-full gap-2"
            >
              {credentialsMutation.isPending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Save className="h-4 w-4" />
              )}
              Save Credentials
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
