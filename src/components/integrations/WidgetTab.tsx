import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { WidgetPreviewFrame } from "./WidgetPreviewFrame";
import { Code2, AlertCircle, Zap, Eye, EyeOff, ExternalLink, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EntryPointSelector, buildEntryUrl, type EntryPointOptions } from "./EntryPointSelector";
import { useWhitelabel } from "@/hooks/useWhitelabel";

interface WidgetTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
}

export function WidgetTab({ property }: WidgetTabProps) {
  const brandColor = property.brand_primary_color || "#e91e63";
  const [showPreview, setShowPreview] = useState(false);
  const [entryOpts, setEntryOpts] = useState<EntryPointOptions>({ entryPoint: "rooms" });
  const wl = useWhitelabel(property.id);
  const wlActive = wl.enabled;

  const embedUrl = buildEntryUrl(property, entryOpts, {
    integration: "widget",
    property_id: property.id,
    brand_color: brandColor,
  }, wlActive ? { enabled: true, host: wl.host } : undefined);

  const wlAttrs = wlActive
    ? `\n     data-white-label="true"${wl.domainStatus === "active" && wl.domain ? `\n     data-wl-host="https://${wl.domain}"` : ""}`
    : "";

  const rolEmbedSnippet = `<!-- ROL'OS Booking Widget${wlActive ? " (white-label)" : ""} -->
<script src="https://widget.roomsonline.co.za/rol-embed.js"></script>
<div data-rolos-property="${property.slug}"
     data-brand-color="${brandColor}"${wlAttrs}></div>`;

  const rolEmbedAdvancedSnippet = `<!-- ROL'OS Booking Widget (Advanced) -->
<script src="https://widget.roomsonline.co.za/rol-embed.js"></script>
<div data-rolos-property="${property.slug}"
     data-brand-color="${brandColor}"${wlAttrs}
     data-layout="standard"
     data-height="600"></div>

<script>
  // Listen for booking completion
  document.querySelector('[data-rolos-property="${property.slug}"]')
    .addEventListener('rolos:booking-complete', function(e) {
      console.log('Booking completed:', e.detail.bookingId);
    });
</script>`;

  const iframeSnippet = `<!-- ROL'OS Booking Widget (iframe fallback) -->
<div id="rolos-booking-widget" style="width:100%;max-width:480px;">
  <iframe 
    src="${embedUrl}" 
    style="width:100%;height:520px;border:none;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);"
    title="Book ${property.name}"
    loading="lazy"
    allow="payment">
  </iframe>
</div>`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Code2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Embedded Booking Widget</CardTitle>
            {wlActive && (
              <Badge variant="secondary" className="gap-1 text-xs">
                <ShieldCheck className="h-3 w-3" /> White-label
              </Badge>
            )}
          </div>
          <IntegrationToggle propertyId={property.id} integrationType="widget" />
        </div>
        <CardDescription>
          Embed a full booking engine with <strong>availability calendar, room types, nightly rates, and checkout</strong> —
          all inside the iframe. Renders in your brand colour{" "}
          <span className="inline-flex items-center gap-1">
            <span className="inline-block h-3 w-3 rounded-full border" style={{ backgroundColor: brandColor }} />
            <code className="bg-muted px-1 rounded text-xs">{brandColor}</code>
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Entry Point Selector */}
        <EntryPointSelector propertyId={property.id} value={entryOpts} onChange={setEntryOpts} />

        {/* Commission info */}
        <div className="flex items-start gap-2.5 rounded-lg border border-muted bg-muted/30 p-3 text-sm">
          <AlertCircle className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <span className="text-muted-foreground">
            Bookings through this widget use the ROL'OS platform. The platform fee is as per your property agreement — no additional integration costs.
          </span>
        </div>

        {/* Preview toggle */}
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => setShowPreview(!showPreview)} className="gap-1.5">
            {showPreview ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {showPreview ? "Hide Preview" : "Show Preview"}
          </Button>
          <Button variant="outline" size="sm" asChild>
            <a href={embedUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Test in New Tab
            </a>
          </Button>
        </div>

        {showPreview && (
          <WidgetPreviewFrame title={`${property.name} — Widget`} url="yoursite.com" height={480}>
            <iframe
              src={embedUrl}
              style={{ width: "100%", height: "100%", border: "none" }}
              title={`${property.name} Widget Preview`}
              loading="lazy"
              allow="payment"
            />
          </WidgetPreviewFrame>
        )}

        {/* Recommended: rol-embed.js */}
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Zap className="h-4 w-4 text-primary" />
            <h4 className="text-sm font-medium">One-Line Embed (Recommended)</h4>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Works on any website — WordPress, Wix, Squarespace, or plain HTML. Auto-resizes and supports multiple widgets per page.
          </p>
          <CodeSnippetBlock code={rolEmbedSnippet} language="html" title="rol-embed.js Widget" />
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">Advanced (with event listeners)</h4>
          <CodeSnippetBlock code={rolEmbedAdvancedSnippet} language="html" title="Advanced Widget" />
        </div>

        <details className="group">
          <summary className="text-sm font-medium cursor-pointer text-muted-foreground hover:text-foreground transition-colors">
            Fallback: Raw iframe embed
          </summary>
          <div className="mt-2">
            <CodeSnippetBlock code={iframeSnippet} language="html" title="iframe Widget (Legacy)" />
          </div>
        </details>

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">How to install</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Copy the <strong>One-Line Embed</strong> snippet above</li>
            <li>Paste it into your website's HTML where you want the widget to appear</li>
            <li>The widget automatically uses your property's brand colours</li>
            <li>Bookings are tracked with <code className="bg-muted px-1 rounded">integration=rol_embed</code></li>
          </ol>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">Data attributes</h5>
          <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
            <code className="bg-muted px-1.5 py-0.5 rounded">data-rolos-property</code>
            <span>Property slug (required)</span>
            <code className="bg-muted px-1.5 py-0.5 rounded">data-brand-color</code>
            <span>Primary brand colour</span>
            <code className="bg-muted px-1.5 py-0.5 rounded">data-brand-logo</code>
            <span>Logo URL override</span>
            <code className="bg-muted px-1.5 py-0.5 rounded">data-layout</code>
            <span>compact | standard | full</span>
            <code className="bg-muted px-1.5 py-0.5 rounded">data-height</code>
            <span>Initial height in px</span>
            <code className="bg-muted px-1.5 py-0.5 rounded">data-hide-powered-by</code>
            <span>true to hide footer</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
