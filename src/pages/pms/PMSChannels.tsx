import { Link } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Lock } from "lucide-react";
import { useBillingConfig } from "@/hooks/useBillingConfig";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { RuCurrencyNotice } from "@/components/pms/channels/RuCurrencyNotice";
import { RuWhiteLabelEmbed } from "@/components/pms/channels/RuWhiteLabelEmbed";

/**
 * ROL'OS Channels
 *
 * The whole channel-manager surface (connections, room & rate mapping, sync history)
 * is provided by the embedded Rentals United White Label client, so this page is just
 * the ROL'OS header, the currency notice and the full-height embed.
 *
 * The page stays gated until an admin explicitly enables Channel Manager in the
 * property's (or its portfolio's) billing profile — unset counts as not enabled.
 */
export default function PMSChannels() {
  const { propertyId } = usePmsPropertyId();

  // Billing entitlement — Channel Manager must be explicitly switched on by admin.
  const { config: billingConfig, isLoading: billingLoading } = useBillingConfig(propertyId ?? undefined);
  const channelManagerEnabled = billingConfig?.channel_manager_enabled === true;

  if (!billingLoading && !channelManagerEnabled) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <Card className="border-dashed">
          <CardContent className="p-8 text-center space-y-3">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
              <Lock className="h-6 w-6 text-muted-foreground" />
            </div>
            <h1 className="text-lg font-semibold text-foreground">Channel Manager unavailable</h1>
            <p className="text-sm text-muted-foreground">
              The Channel Manager module is not part of your current subscription, so your listings are
              archived with our distribution partners and no rates or availability are being sent out.
            </p>
            <p className="text-sm text-muted-foreground">
              Please speak to your account manager to activate Channel Manager distribution — listings are
              re-activated automatically once it is enabled.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Currency notice — only renders when USD conversion is in force for this property */}
      <RuCurrencyNotice propertyId={propertyId} />

      <div>
        <h1 className="text-2xl font-bold text-foreground">Channels</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Connect and manage distribution channels for your property
        </p>
      </div>

      <RuWhiteLabelEmbed propertyId={propertyId} />

      <p className="text-center text-sm text-muted-foreground">
        Don't see your channel manager?{" "}
        <Link to="/contact" className="font-medium text-primary underline-offset-4 hover:underline">
          Let's talk
        </Link>{" "}
        — we'll bring it on board.
      </p>
    </div>
  );
}

