import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { Wand2, Eye, Globe, Puzzle } from "lucide-react";
import { EntryPointSelector, type EntryPointOptions } from "./EntryPointSelector";

interface WidgetSetupWizardProps {
  property: {
    id: string;
    name: string;
    slug: string;
    brand_primary_color: string | null;
    brand_logo_url?: string | null;
  };
}

type LayoutOption = "compact" | "standard" | "full";
type PlatformGuide = "html" | "wordpress" | "wix" | "squarespace";

export function WidgetSetupWizard({ property }: WidgetSetupWizardProps) {
  const [brandColor, setBrandColor] = useState(property.brand_primary_color || "#e91e63");
  const [brandLogo, setBrandLogo] = useState(property.brand_logo_url || "");
  const [layout, setLayout] = useState<LayoutOption>("standard");
  const [height, setHeight] = useState("600");
  const [hidePoweredBy, setHidePoweredBy] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [platform, setPlatform] = useState<PlatformGuide>("html");
  const [entryOpts, setEntryOpts] = useState<EntryPointOptions>({ entryPoint: "rooms" });

  const snippet = useMemo(() => {
    const attrs: string[] = [`data-rolos-property="${property.slug}"`];
    if (brandColor && brandColor !== "#e91e63") attrs.push(`data-brand-color="${brandColor}"`);
    if (brandLogo) attrs.push(`data-brand-logo="${brandLogo}"`);
    if (layout !== "standard") attrs.push(`data-layout="${layout}"`);
    if (height !== "600") attrs.push(`data-height="${height}"`);
    if (hidePoweredBy) attrs.push(`data-hide-powered-by="true"`);

    const divAttrs = attrs.length > 1
      ? "\n     " + attrs.join("\n     ")
      : attrs[0];

    return `<script src="https://widget.roomsonline.co.za/rol-embed.js"></script>\n<div ${divAttrs}></div>`;
  }, [property.slug, brandColor, brandLogo, layout, height, hidePoweredBy]);

  const previewUrl = useMemo(() => {
    const params = new URLSearchParams({
      integration: "rol_embed",
      mode: "embedded",
      brand_color: brandColor,
      layout,
    });
    if (brandLogo) params.set("brand_logo", brandLogo);
    if (hidePoweredBy) params.set("hide_powered_by", "1");
    return `https://sleepinafrica.roomsonline.co.za/embed/property/${property.slug}?${params}`;
  }, [property.slug, brandColor, brandLogo, layout, hidePoweredBy]);

  const platformGuides: Record<PlatformGuide, string> = {
    html: "Paste the snippet into your HTML file where you want the widget to appear. That's it!",
    wordpress: "Go to Appearance → Editor → open the page template. Paste the snippet into a Custom HTML block or directly into the template file.",
    wix: "Add an 'Embed a Site' element from the Add panel. Paste the snippet in the HTML/Code section. Adjust the element size to fit.",
    squarespace: "Edit the page, add a Code Block. Paste the snippet into the code editor. Save and preview.",
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Wand2 className="h-5 w-5 text-primary" />
          <CardTitle className="text-lg">Widget Setup Wizard</CardTitle>
        </div>
        <CardDescription>
          Customise and generate your one-line booking widget embed code
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Entry Point Selector */}
        <EntryPointSelector propertyId={property.id} value={entryOpts} onChange={setEntryOpts} />

        {/* Brand customisation */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Brand Colour</Label>
            <div className="flex items-center gap-2">
              <input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="w-10 h-10 rounded border cursor-pointer"
              />
              <Input
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="font-mono text-sm"
                placeholder="#2563eb"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Logo URL (optional)</Label>
            <Input
              value={brandLogo}
              onChange={(e) => setBrandLogo(e.target.value)}
              placeholder="https://example.com/logo.png"
            />
          </div>
        </div>

        {/* Layout */}
        <div className="space-y-2">
          <Label>Layout</Label>
          <RadioGroup value={layout} onValueChange={(v) => setLayout(v as LayoutOption)} className="flex gap-4">
            {(["compact", "standard", "full"] as LayoutOption[]).map((opt) => (
              <div key={opt} className="flex items-center gap-2">
                <RadioGroupItem value={opt} id={`layout-${opt}`} />
                <Label htmlFor={`layout-${opt}`} className="capitalize cursor-pointer">{opt}</Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        {/* Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>Initial Height (px)</Label>
            <Input
              type="number"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              min="300"
              max="1200"
            />
          </div>
          <div className="flex items-center gap-3 pt-6">
            <Switch checked={hidePoweredBy} onCheckedChange={setHidePoweredBy} />
            <Label>Hide "Powered by ROL'OS" footer</Label>
          </div>
        </div>

        {/* Generated snippet */}
        <div>
          <Label className="mb-2 block">Your embed code</Label>
          <CodeSnippetBlock code={snippet} language="html" title="Copy & paste into your website" />
        </div>

        {/* Preview toggle */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="flex items-center gap-2 text-sm font-medium text-primary hover:underline"
          >
            <Eye className="h-4 w-4" />
            {showPreview ? "Hide preview" : "Show live preview"}
          </button>
        </div>

        {showPreview && (
          <div className="border rounded-lg overflow-hidden" style={{ height: `${Math.min(parseInt(height) || 600, 800)}px` }}>
            <iframe
              src={previewUrl}
              className="w-full h-full border-none"
              title="Widget Preview"
              loading="lazy"
              allow="payment"
            />
          </div>
        )}

        {/* Platform guides */}
        <div className="space-y-3">
          <Label>Installation Guide</Label>
          <div className="flex gap-2">
            {([
              { key: "html" as PlatformGuide, icon: <Globe className="h-3.5 w-3.5" />, label: "HTML" },
              { key: "wordpress" as PlatformGuide, icon: <Puzzle className="h-3.5 w-3.5" />, label: "WordPress" },
              { key: "wix" as PlatformGuide, icon: <Globe className="h-3.5 w-3.5" />, label: "Wix" },
              { key: "squarespace" as PlatformGuide, icon: <Globe className="h-3.5 w-3.5" />, label: "Squarespace" },
            ]).map(({ key, icon, label }) => (
              <button
                key={key}
                onClick={() => setPlatform(key)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  platform === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {icon} {label}
              </button>
            ))}
          </div>
          <div className="bg-muted/50 rounded-lg p-4 text-sm text-muted-foreground">
            {platformGuides[platform]}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
