import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { LayoutTemplate, AlertCircle } from "lucide-react";
import { PUBLIC_DOMAIN } from "@/lib/config";

interface BookingBarTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
}

export function BookingBarTab({ property }: BookingBarTabProps) {
  const brandColor = property.brand_primary_color || "#e91e63";
  const encodedColor = encodeURIComponent(brandColor);
  const embedUrl = `${PUBLIC_DOMAIN}/embed/property/${property.slug}?integration=booking_bar&property_id=${property.id}&mode=bar&brand_color=${encodedColor}`;

  const snippet = `<!-- RoomsOnline Floating Booking Bar -->
<div id="rolos-booking-bar" style="position:fixed;bottom:0;left:0;right:0;z-index:9999;">
  <iframe 
    src="${embedUrl}" 
    style="width:100%;height:72px;border:none;box-shadow:0 -2px 12px rgba(0,0,0,0.1);"
    title="Book ${property.name}"
    loading="lazy">
  </iframe>
</div>`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <LayoutTemplate className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Floating Booking Bar</CardTitle>
          </div>
          <IntegrationToggle propertyId={property.id} integrationType="booking_bar" />
        </div>
        <CardDescription>
          A persistent bar that sticks to the bottom of your website, giving guests quick access
          to check dates and book. Non-intrusive and always visible, styled in your brand colour{" "}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: brandColor }} />
            <code className="bg-muted px-1 rounded text-xs">{brandColor}</code>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Commission info */}
        <div className="flex items-start gap-2.5 rounded-lg border border-muted bg-muted/30 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            Bookings through this widget use the ROL'OS platform. The platform fee is as per your property agreement — no additional integration costs.
          </span>
        </div>

        <CodeSnippetBlock code={snippet} language="html" title="Floating Bar Embed" />

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">How to install</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Copy the snippet above</li>
            <li>Paste it just before <code className="bg-muted px-1 rounded">&lt;/body&gt;</code> in your website</li>
            <li>The bar will appear fixed at the bottom of every page in your brand colours</li>
            <li>Guests can select dates and are redirected to your booking page</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
