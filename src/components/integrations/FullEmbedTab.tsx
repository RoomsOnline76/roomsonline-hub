import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { Globe, AlertCircle } from "lucide-react";
import { PUBLIC_DOMAIN } from "@/lib/config";

interface FullEmbedTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
}

export function FullEmbedTab({ property }: FullEmbedTabProps) {
  const brandColor = property.brand_primary_color || "#e91e63";
  const encodedColor = encodeURIComponent(brandColor);
  const embedUrl = `${PUBLIC_DOMAIN}/embed/property/${property.slug}?integration=full_embed&property_id=${property.id}&mode=full&brand_color=${encodedColor}`;

  const snippet = `<!-- RoomsOnline Full Booking Engine -->
<iframe 
  src="${embedUrl}" 
  style="width:100%;min-height:800px;border:none;border-radius:8px;"
  title="${property.name} Booking Engine"
  loading="lazy"
  allow="payment">
</iframe>`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Full Booking Engine</CardTitle>
          </div>
          <IntegrationToggle propertyId={property.id} integrationType="full_embed" />
        </div>
        <CardDescription>
          Embed the complete booking engine as an iframe on a dedicated booking page of your website.
          Includes room selection, availability, and the full checkout flow — all rendered in your
          brand colour{" "}
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
            Bookings through this embed use the ROL'OS platform. The platform fee is as per your property agreement — no additional integration costs.
          </span>
        </div>

        <CodeSnippetBlock code={snippet} language="html" title="Full Embed iframe" />

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">How to install</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Create a "Book" or "Reservations" page on your website</li>
            <li>Paste the iframe code into the page body</li>
            <li>Adjust <code className="bg-muted px-1 rounded">min-height</code> to suit your layout</li>
            <li>The full booking flow runs inside the iframe with live availability</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
