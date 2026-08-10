import React, { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Gift } from "lucide-react";

interface Props {
  propertyId?: string | null;
  nights?: number;
  /** Perks are a post-payment surprise — pass false to render nothing. */
  revealed: boolean;
}

interface Offer {
  id: string;
  partner_name: string;
  title: string;
  description: string | null;
  redemption_instructions: string | null;
  redemption_code: string | null;
  partner_url: string | null;
  partner_contact: string | null;
  valid_from: string | null;
  valid_until: string | null;
  max_redemptions: number | null;
  current_redemptions: number | null;
  min_nights: number | null;
}

/**
 * Partner / affiliate perks the property loaded — revealed only once the stay is paid.
 * Never a discount on the stay, never shown at checkout.
 */
export const GuestPartnerPerks: React.FC<Props> = ({ propertyId, nights, revealed }) => {
  const { data: offers = [] } = useQuery({
    queryKey: ["guest_partner_offers", propertyId],
    enabled: !!propertyId && revealed,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("property_partner_offers")
        .select("*")
        .eq("property_id", propertyId!)
        .eq("is_active", true);
      if (error) throw error;
      return (data || []) as Offer[];
    },
  });

  const qualifying = useMemo(() => {
    const today = new Date().toISOString().split("T")[0];
    return offers.filter((o) => {
      if (o.valid_from && today < o.valid_from) return false;
      if (o.valid_until && today > o.valid_until) return false;
      if (o.max_redemptions !== null && (o.current_redemptions || 0) >= o.max_redemptions) return false;
      if (o.min_nights && typeof nights === "number" && nights < o.min_nights) return false;
      return true;
    });
  }, [offers, nights]);

  if (!revealed || qualifying.length === 0) return null;

  return (
    <Card>
      <CardContent className="space-y-3 pt-4 pb-3">
        <div className="flex items-center gap-2">
          <Gift className="h-3.5 w-3.5 text-primary" />
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">
            With compliments
          </p>
        </div>
        {qualifying.map((o) => (
          <div key={o.id} className="rounded-md border border-border/70 p-3">
            <p className="text-sm font-medium">{o.title}</p>
            <p className="text-[11px] uppercase tracking-wide text-primary">{o.partner_name}</p>
            {o.description && <p className="mt-2 text-xs text-muted-foreground">{o.description}</p>}
            {o.redemption_instructions && (
              <p className="mt-2 text-[11px] text-muted-foreground">
                <strong>How to redeem:</strong> {o.redemption_instructions}
              </p>
            )}
            {o.redemption_code && (
              <p className="mt-2 inline-block rounded border border-dashed border-primary px-2 py-1 font-mono text-xs tracking-widest">
                {o.redemption_code}
              </p>
            )}
            {o.partner_contact && (
              <p className="mt-2 text-[11px] text-muted-foreground">{o.partner_contact}</p>
            )}
            {o.partner_url && (
              <a
                href={o.partner_url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 block text-[11px] underline"
              >
                Visit partner
              </a>
            )}
            {o.valid_until && (
              <p className="mt-2 text-[10px] text-muted-foreground">Valid until {o.valid_until}</p>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
};

export default GuestPartnerPerks;
