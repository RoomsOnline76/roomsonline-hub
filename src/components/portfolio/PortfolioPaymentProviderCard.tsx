import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { CreditCard, Loader2, Save, ShieldCheck, Building2 } from "lucide-react";
import {
  ALL_PROVIDERS,
  SA_PROVIDERS,
  INTERNATIONAL_PROVIDERS,
} from "@/components/integrations/PropertyPaymentProviderSelect";
import { usePortfolioPaymentConfig } from "@/hooks/usePortfolioPaymentConfig";
import { cn } from "@/lib/utils";

function describeError(e: unknown): string {
  if (!e) return "Unknown error";
  if (typeof e === "string") return e;
  if (e instanceof Error && e.message) return e.message;
  const err = e as { message?: string; details?: string; hint?: string; code?: string };
  return [err.message, err.details, err.hint, err.code ? `(${err.code})` : undefined]
    .filter(Boolean)
    .join(" — ") || "Unknown error";
}

interface MemberProperty {
  id: string;
  name: string;
  payment_provider_override?: boolean | null;
}

interface Props {
  portfolioId: string;
  properties: MemberProperty[];
}

/**
 * Portfolio-level payment provider configuration.
 * Saving fans the settings out to every member property that is not overriding.
 */
export function PortfolioPaymentProviderCard({ portfolioId, properties }: Props) {
  const queryClient = useQueryClient();
  const { data: config, isLoading } = usePortfolioPaymentConfig(portfolioId);

  const [allowCustom, setAllowCustom] = useState(false);
  const [providers, setProviders] = useState<string[]>([]);
  const [credentials, setCredentials] = useState<Record<string, string>>({});

  useEffect(() => {
    setAllowCustom(!!config?.allow_custom_payment_provider);
    setProviders(config?.payment_providers || []);
    setCredentials((config?.credentials as Record<string, string>) || {});
  }, [config]);

  const credentialFields = useMemo(() => {
    const seen = new Set<string>();
    return providers.flatMap((pv) => {
      const def = ALL_PROVIDERS.find((p) => p.value === pv);
      return (def?.credentials || [])
        .filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)))
        .map((f) => ({ ...f, provider: def!.label }));
    });
  }, [providers]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cleaned: Record<string, string> = {};
      credentialFields.forEach((f) => {
        if (credentials[f.key]) cleaned[f.key] = credentials[f.key];
      });
      const { error } = await supabase
        .from("portfolio_payment_configs" as any)
        .upsert(
          {
            portfolio_id: portfolioId,
            allow_custom_payment_provider: allowCustom,
            payment_providers: providers,
            credentials: cleaned,
          } as any,
          { onConflict: "portfolio_id" }
        );
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["portfolio-payment-config", portfolioId] });
      queryClient.invalidateQueries({ queryKey: ["property-portfolio-payment-context"] });
      toast.success("Portfolio payment settings saved", {
        description: "Applied to all inheriting properties in this portfolio.",
      });
    },
    onError: (e: unknown) =>
      toast.error("Failed to save portfolio payment settings", { description: describeError(e) }),
  });

  const toggleProvider = (value: string) =>
    setProviders((prev) => (prev.includes(value) ? prev.filter((p) => p !== value) : [...prev, value]));

  const inheriting = properties.filter((p) => !p.payment_provider_override);
  const overriding = properties.filter((p) => p.payment_provider_override);

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <CreditCard className="h-4 w-4 text-primary" />
          Payment Provider (portfolio-wide)
        </CardTitle>
        <CardDescription className="text-xs">
          Configure the payment provider once here — every property in this portfolio inherits it
          unless it is explicitly set to override.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 px-4 pb-4">
        {isLoading ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-lg border px-3 py-2">
              <div>
                <p className="text-sm font-medium">Allow custom (BYO) payment providers</p>
                <p className="text-xs text-muted-foreground">
                  When off, all properties use the Rooms Online PayFast gateway.
                </p>
              </div>
              <Switch checked={allowCustom} onCheckedChange={setAllowCustom} />
            </div>

            {allowCustom && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    South African providers
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {SA_PROVIDERS.map((p) => (
                      <label
                        key={p.value}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-xs",
                          providers.includes(p.value)
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/50 hover:border-border"
                        )}
                      >
                        <Checkbox
                          checked={providers.includes(p.value)}
                          onCheckedChange={() => toggleProvider(p.value)}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    International providers
                  </Label>
                  <div className="flex flex-wrap gap-2">
                    {INTERNATIONAL_PROVIDERS.map((p) => (
                      <label
                        key={p.value}
                        className={cn(
                          "flex items-center gap-2 px-3 py-1.5 rounded-lg border cursor-pointer text-xs",
                          providers.includes(p.value)
                            ? "border-primary/40 bg-primary/5"
                            : "border-border/50 hover:border-border"
                        )}
                      >
                        <Checkbox
                          checked={providers.includes(p.value)}
                          onCheckedChange={() => toggleProvider(p.value)}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>

                {credentialFields.length > 0 && (
                  <div className="space-y-2 rounded-lg border p-3">
                    <p className="text-xs font-medium flex items-center gap-1.5">
                      <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
                      Credentials (shared by the whole portfolio)
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {credentialFields.map((f) => (
                        <div key={f.key} className="space-y-1">
                          <Label htmlFor={`pf-cred-${f.key}`} className="text-xs">
                            {f.label} <span className="text-muted-foreground">· {f.provider}</span>
                          </Label>
                          <Input
                            id={`pf-cred-${f.key}`}
                            type={f.sensitive ? "password" : "text"}
                            placeholder={f.placeholder}
                            value={credentials[f.key] || ""}
                            onChange={(e) =>
                              setCredentials((prev) => ({ ...prev, [f.key]: e.target.value }))
                            }
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            <div className="rounded-lg border p-3 space-y-1.5">
              <p className="text-xs font-medium flex items-center gap-1.5">
                <Building2 className="h-3.5 w-3.5 text-muted-foreground" /> Inheritance
              </p>
              <div className="flex flex-wrap gap-1.5">
                {inheriting.map((p) => (
                  <Badge key={p.id} variant="secondary" className="text-[10px]">
                    {p.name} · inherits
                  </Badge>
                ))}
                {overriding.map((p) => (
                  <Badge key={p.id} variant="outline" className="text-[10px]">
                    {p.name} · overrides
                  </Badge>
                ))}
                {properties.length === 0 && (
                  <span className="text-xs text-muted-foreground">No properties in this portfolio.</span>
                )}
              </div>
            </div>

            <div className="flex justify-end">
              <Button size="sm" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending} className="gap-1.5">
                {saveMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save className="h-3.5 w-3.5" />
                )}
                Save & apply to portfolio
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
