import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { CreditCard, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

const PAYMENT_PROVIDERS = [
  { value: "default", label: "Platform Default", website: null, description: "Uses the global PayFast/PayGate setting" },
  { value: "payfast", label: "PayFast", website: "https://payfast.io" },
  { value: "paygate", label: "PayGate", website: "https://www.paygate.co.za" },
  { value: "peach", label: "Peach Payments", website: "https://www.peachpayments.com" },
  { value: "yoco", label: "Yoco", website: "https://www.yoco.com" },
  { value: "ozow", label: "Ozow", website: "https://ozow.com" },
  { value: "dpo", label: "DPO Pay", website: "https://dpogroup.com" },
  { value: "addpay", label: "AddPay", website: "https://www.addpay.africa" },
  { value: "payflex", label: "Payflex (BNPL)", website: "https://payflex.co.za" },
  { value: "stitch", label: "Stitch", website: "https://www.stitch.money" },
  { value: "ikhokha", label: "iKhokha (iK Pay)", website: "https://www.ikhokha.com" },
  { value: "snapscan", label: "SnapScan", website: "https://www.snapscan.co.za" },
  { value: "zapper", label: "Zapper", website: "https://www.zapper.com" },
  { value: "flutterwave", label: "Flutterwave", website: "https://flutterwave.com" },
  { value: "stripe", label: "Stripe", website: "https://stripe.com/za" },
] as const;

interface PropertyPaymentProviderSelectProps {
  propertyId: string;
}

export function PropertyPaymentProviderSelect({ propertyId }: PropertyPaymentProviderSelectProps) {
  const queryClient = useQueryClient();

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

  const mutation = useMutation({
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

  const selected = currentProvider || "default";
  const selectedProvider = PAYMENT_PROVIDERS.find(p => p.value === selected);

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
          {selectedProvider?.website && (
            <a
              href={selectedProvider.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1"
            >
              <ExternalLink className="h-3 w-3" />
              Visit
            </a>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <Select
          value={selected}
          onValueChange={(v) => mutation.mutate(v)}
          disabled={isLoading || mutation.isPending}
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
      </CardContent>
    </Card>
  );
}
