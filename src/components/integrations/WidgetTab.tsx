import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { Code2, AlertCircle } from "lucide-react";
import { PUBLIC_DOMAIN } from "@/lib/config";

interface WidgetTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
}

export function WidgetTab({ property }: WidgetTabProps) {
  const brandColor = property.brand_primary_color || "#e91e63";
  const encodedColor = encodeURIComponent(brandColor);
  const embedUrl = `${PUBLIC_DOMAIN}/embed/property/${property.slug}?integration=widget&property_id=${property.id}&brand_color=${encodedColor}&mode=embedded`;

  const iframeSnippet = `<!-- RoomsOnline Booking Widget -->
<div id="rolos-booking-widget" style="width:100%;max-width:480px;">
  <iframe 
    src="${embedUrl}" 
    style="width:100%;height:520px;border:none;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);"
    title="Book ${property.name}"
    loading="lazy"
    allow="payment">
  </iframe>
</div>`;

  const jsSnippet = `<!-- RoomsOnline Booking Widget (JavaScript) -->
<div id="rolos-widget"></div>
<script>
  (function() {
    var w = document.createElement('iframe');
    w.src = '${embedUrl}';
    w.style.cssText = 'width:100%;height:520px;border:none;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);';
    w.title = 'Book ${property.name}';
    w.loading = 'lazy';
    document.getElementById('rolos-widget').appendChild(w);
  })();
</script>`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Embedded Booking Widget</CardTitle>
          </div>
          <IntegrationToggle propertyId={property.id} integrationType="widget" />
        </div>
        <CardDescription>
          Embed a compact booking widget directly on your website. The <strong>entire booking flow happens inside the iframe</strong> —
          guests never leave your website. The widget renders in your property's
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
            Bookings through this widget use the ROL'OS platform. The platform fee is as per your property agreement — no additional integration costs.
          </span>
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">iframe Embed (Simplest)</h4>
          <CodeSnippetBlock code={iframeSnippet} language="html" title="iframe Widget" />
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">JavaScript Embed</h4>
          <CodeSnippetBlock code={jsSnippet} language="html" title="JavaScript Widget" />
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">How to install</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Copy either snippet above</li>
            <li>Paste it into your website's HTML where you want the widget to appear</li>
            <li>The widget automatically uses your property's brand colours</li>
            <li>Bookings are tracked with <code className="bg-muted px-1 rounded">integration=widget</code></li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
