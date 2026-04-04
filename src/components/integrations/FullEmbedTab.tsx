import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { WidgetPreviewFrame } from "./WidgetPreviewFrame";
import { Globe, AlertCircle, Eye, EyeOff, ExternalLink } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { EntryPointSelector, buildEntryUrl, type EntryPointOptions } from "./EntryPointSelector";

interface FullEmbedTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
}

export function FullEmbedTab({ property }: FullEmbedTabProps) {
  const [brandColor, setBrandColor] = useState(property.brand_primary_color || "#e91e63");
  const [height, setHeight] = useState(800);
  const [showPreview, setShowPreview] = useState(false);
  const [entryOpts, setEntryOpts] = useState<EntryPointOptions>({ entryPoint: "rooms" });

  const encodedColor = encodeURIComponent(brandColor);
  const embedUrl = buildEntryUrl(property, entryOpts, {
    integration: "full_embed",
    property_id: property.id,
    brand_color: brandColor,
  });

  const snippet = `<!-- RoomsOnline Full Booking Engine -->
<iframe 
  src="${embedUrl}" 
  style="width:100%;min-height:${height}px;border:none;border-radius:8px;"
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
          Embed the complete booking engine with <strong>availability calendar, room type grid with nightly rates,
          and full checkout — all inside the iframe</strong>. Rendered in your brand colour{" "}
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

        {/* Entry Point Selector */}
        <EntryPointSelector propertyId={property.id} value={entryOpts} onChange={setEntryOpts} />

        {/* Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg border border-border bg-muted/20">
          <div className="space-y-2">
            <Label className="text-xs">Brand Colour</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-8 h-8 rounded border-none cursor-pointer" />
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{brandColor}</code>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Min Height: {height}px</Label>
            <Slider value={[height]} onValueChange={([v]) => setHeight(v)} min={500} max={1200} step={50} />
          </div>
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
          <WidgetPreviewFrame title={`${property.name} — Full Booking Engine`} url={`yoursite.com/book`} height={Math.min(height, 500)}>
            <iframe
              src={embedUrl}
              style={{ width: "100%", height: "100%", border: "none" }}
              title={`${property.name} Preview`}
              loading="lazy"
              allow="payment"
            />
          </WidgetPreviewFrame>
        )}

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
