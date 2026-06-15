import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck, CreditCard, ExternalLink, Lock } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface PaymentProvidersTabProps {
  propertyId: string | null;
  isAdmin: boolean;
  isDev: boolean;
  isFearlessLeader: boolean;
}

export function PaymentProvidersTab({
  propertyId,
  isAdmin,
  isDev,
  isFearlessLeader,
}: PaymentProvidersTabProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);
  const canEdit = isAdmin || isDev || isFearlessLeader;

  const { data, isLoading } = useQuery({
    queryKey: ["property-allow-custom-payment", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const { data, error } = await supabase
        .from("properties")
        .select("allow_custom_payment_provider")
        .eq("id", propertyId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId,
  });

  const allowed = !!(data as { allow_custom_payment_provider?: boolean } | null)
    ?.allow_custom_payment_provider;

  const handleToggle = async (next: boolean) => {
    if (!propertyId || !canEdit) return;
    setSaving(true);
    const { error } = await supabase
      .from("properties")
      .update({ allow_custom_payment_provider: next })
      .eq("id", propertyId);

    // Keep billing config in sync: facilitator is the inverse of custom provider
    const { error: billingErr } = await supabase
      .from("property_billing_configs")
      .upsert(
        { property_id: propertyId, payment_facilitator_enabled: !next },
        { onConflict: "property_id" }
      );

    setSaving(false);
    if (error || billingErr) {
      toast.error("Failed to update payment provider access", {
        description: (error || billingErr)?.message,
      });
      return;
    }
    toast.success(
      next
        ? "Custom payment provider enabled — facilitator fee disabled"
        : "Reverted to Rooms Online PayFast gateway — facilitator fee active"
    );
    queryClient.invalidateQueries({ queryKey: ["property-allow-custom-payment", propertyId] });
    queryClient.invalidateQueries({ queryKey: ["billing-config", propertyId] });
  };

  if (!propertyId) {
    return (
      <Card>
        <CardContent className="py-6 text-sm text-muted-foreground">
          Save the property first to manage payment providers.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4 p-6">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <CardTitle className="text-base">Payment Provider Access</CardTitle>
          </div>
          <CardDescription>
            By default every property processes guest payments through the{" "}
            <span className="font-medium">Rooms Online PayFast</span> gateway. An administrator can
            allow this property to connect its own payment provider — once enabled, the owner can
            configure provider credentials in <span className="font-medium">ROL'OS → Integrations</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : canEdit ? (
            <div className="flex items-start justify-between gap-4 rounded-lg border p-4">
              <div className="space-y-1">
                <Label htmlFor="allow-custom-payment" className="text-sm font-medium">
                  Allow this property to use its own payment provider
                </Label>
                <p className="text-xs text-muted-foreground">
                  When off, all bookings settle through the Rooms Online PayFast gateway.
                  When on, the owner unlocks the payment provider configurator in Integrations.
                </p>
              </div>
              <Switch
                id="allow-custom-payment"
                checked={allowed}
                disabled={saving}
                onCheckedChange={handleToggle}
              />
            </div>
          ) : (
            <div className="rounded-lg border p-4 space-y-2">
              <div className="flex items-center gap-2">
                {allowed ? (
                  <Badge className="gap-1.5">
                    <ShieldCheck className="h-3 w-3" />
                    Custom provider enabled
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="gap-1.5">
                    <Lock className="h-3 w-3" />
                    Using Rooms Online PayFast
                  </Badge>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {allowed
                  ? "You can configure your payment provider in ROL'OS → Integrations."
                  : "Contact your Rooms Online account manager to enable a custom payment provider."}
              </p>
              {allowed && (
                <Button
                  size="sm"
                  variant="outline"
                  className="gap-1.5"
                  onClick={() => navigate(`/pms/integrations?property=${propertyId}`)}
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  Open Integrations
                </Button>
              )}
            </div>
          )}

          <div className="text-[11px] text-muted-foreground border-t pt-3">
            <span className="font-medium">Supported providers:</span> PayFast, PayGate, Peach
            Payments, Yoco, Ozow, DPO Pay, Stripe, PayPal, Flutterwave, Klarna, Affirm, and more.
            Each provider has its own credential requirements (merchant IDs, secret keys,
            passphrases, webhook secrets) collected by the configurator.
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
