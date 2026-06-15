import { PropertyPaymentProviderSelect } from "@/components/integrations/PropertyPaymentProviderSelect";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Lock, ShieldCheck, Loader2 } from "lucide-react";
import { usePropertyAllowsCustomPayment } from "@/hooks/usePropertyAllowsCustomPayment";

interface Props {
  propertyId: string;
  /** When true (admin context), the gate is bypassed and the configurator is always rendered. */
  bypassGate?: boolean;
}

/**
 * Owner-facing wrapper around PropertyPaymentProviderSelect.
 * Renders a locked card unless the admin has enabled custom payment
 * providers on the property (or `bypassGate` is true for admin pages).
 */
export function GatedPaymentProviderSelect({ propertyId, bypassGate }: Props) {
  const { allowed, isLoading } = usePropertyAllowsCustomPayment(propertyId);

  if (bypassGate) {
    return <PropertyPaymentProviderSelect propertyId={propertyId} />;
  }

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-6 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Checking payment provider access…
        </CardContent>
      </Card>
    );
  }

  if (!allowed) {
    return (
      <Card className="border-dashed">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm">Custom payment provider (locked)</CardTitle>
            <Badge variant="secondary" className="ml-1 text-[10px]">Default: Rooms Online PayFast</Badge>
          </div>
          <CardDescription className="text-xs">
            Bookings for this property are processed through the Rooms Online PayFast gateway.
            To configure your own payment provider (Stripe, Yoco, PayGate, Peach, etc.), an
            administrator needs to enable custom payment providers for this property in
            <span className="font-medium"> Edit Property → Rates → Payment Providers</span>.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground flex items-center gap-2">
          <ShieldCheck className="h-3.5 w-3.5" />
          Need this enabled? Contact your Rooms Online account manager.
        </CardContent>
      </Card>
    );
  }

  return <PropertyPaymentProviderSelect propertyId={propertyId} />;
}
