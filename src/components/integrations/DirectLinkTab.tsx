import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { IntegrationToggle } from "./IntegrationToggle";
import { WidgetPreviewFrame } from "./WidgetPreviewFrame";
import { Link2, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { EntryPointSelector, buildEntryUrl, type EntryPointOptions } from "./EntryPointSelector";

interface DirectLinkTabProps {
  property: { id: string; name: string; slug: string; brand_primary_color: string | null };
}

type BtnStyle = "solid" | "outline" | "pill";
type BtnSize = "sm" | "md" | "lg";

const SIZE_MAP: Record<BtnSize, string> = {
  sm: "padding:8px 16px;font-size:13px;",
  md: "padding:12px 24px;font-size:14px;",
  lg: "padding:16px 32px;font-size:16px;",
};

function buildBtnCss(color: string, style: BtnStyle, size: BtnSize) {
  const base = `display:inline-block;text-decoration:none;font-weight:600;transition:all 0.2s;${SIZE_MAP[size]}`;
  const radius = style === "pill" ? "border-radius:999px;" : "border-radius:6px;";
  if (style === "outline") {
    return `${base}${radius}background:transparent;color:${color};border:2px solid ${color};`;
  }
  return `${base}${radius}background:${color};color:#fff;border:none;`;
}

export function DirectLinkTab({ property }: DirectLinkTabProps) {
  const [brandColor, setBrandColor] = useState(property.brand_primary_color || "#e91e8c");
  const [btnStyle, setBtnStyle] = useState<BtnStyle>("solid");
  const [btnSize, setBtnSize] = useState<BtnSize>("md");
  const [entryOpts, setEntryOpts] = useState<EntryPointOptions>({ entryPoint: "rooms" });

  const bookingUrl = buildEntryUrl(property, entryOpts, {
    source: "website",
    integration: "direct",
    property_id: property.id,
    brand_color: brandColor,
  });

  const btnCss = buildBtnCss(brandColor, btnStyle, btnSize);
  const htmlSnippet = `<a href="${bookingUrl}" target="_blank" rel="noopener noreferrer" 
  style="${btnCss}">
  Book Now
</a>`;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Direct Booking Link</CardTitle>
          </div>
          <IntegrationToggle propertyId={property.id} integrationType="direct" />
        </div>
        <CardDescription>
          This link directs guests straight to your property's dedicated booking page where they can
          browse rooms, check availability, and complete their reservation — fully branded
          with your property's identity.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Platform fee notice */}
        <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 p-3 text-sm">
          <Info className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
          <div className="text-muted-foreground">
            <strong>Platform fee:</strong> A platform fee of 2% (or as per your property agreement)
            applies to bookings made through this link.
          </div>
        </div>

        {/* Entry Point Selector */}
        <EntryPointSelector propertyId={property.id} value={entryOpts} onChange={setEntryOpts} />

        {/* Controls */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg border border-border bg-muted/20">
          <div className="space-y-2">
            <Label className="text-xs">Brand Colour</Label>
            <div className="flex items-center gap-2">
              <input type="color" value={brandColor} onChange={(e) => setBrandColor(e.target.value)} className="w-8 h-8 rounded border-none cursor-pointer" />
              <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{brandColor}</code>
            </div>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Button Style</Label>
            <Select value={btnStyle} onValueChange={(v) => setBtnStyle(v as BtnStyle)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="solid">Solid</SelectItem>
                <SelectItem value="outline">Outline</SelectItem>
                <SelectItem value="pill">Pill</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Button Size</Label>
            <Select value={btnSize} onValueChange={(v) => setBtnSize(v as BtnSize)}>
              <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="sm">Small</SelectItem>
                <SelectItem value="md">Medium</SelectItem>
                <SelectItem value="lg">Large</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Button Preview */}
        <WidgetPreviewFrame title="Button Preview" url="yoursite.com" height={120}>
          <div className="flex items-center justify-center h-full">
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{ ...Object.fromEntries(btnCss.split(";").filter(Boolean).map((s) => {
                const [k, ...v] = s.split(":");
                return [k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase()), v.join(":").trim()];
              })) }}
            >
              Book Now
            </a>
          </div>
        </WidgetPreviewFrame>

        <div>
          <h4 className="text-sm font-medium mb-2">Your Booking URL</h4>
          <CodeSnippetBlock code={bookingUrl} language="text" title="Direct Link" />
        </div>

        <div>
          <h4 className="text-sm font-medium mb-2">HTML Button</h4>
          <CodeSnippetBlock code={htmlSnippet} language="html" title="Embed as Button" />
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button variant="outline" size="sm" asChild>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer" className="gap-1.5">
              <ExternalLink className="h-3.5 w-3.5" /> Test Link
            </a>
          </Button>
        </div>

        <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
          <h5 className="font-medium text-foreground mb-1">How it works</h5>
          <ol className="list-decimal list-inside space-y-1">
            <li>Copy the booking URL above</li>
            <li>Paste it into your website's "Book Now" button, email signature, or social media bio</li>
            <li>When a guest clicks, they are taken to your property's branded booking page</li>
            <li>The guest browses rooms, selects dates, and completes their reservation</li>
            <li>All bookings are automatically tracked and attributed to your property</li>
            <li>A 2% platform fee applies (or as per your agreement) — no hidden fees</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
}
