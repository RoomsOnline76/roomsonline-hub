import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Upload, Loader2, X, Palette, Type, ShieldCheck, AlertTriangle, Copy, LetterText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { CopyBrandingModal } from "./CopyBrandingModal";
import { GoogleFontPicker } from "./GoogleFontPicker";

export interface BrandingData {
  brand_logo_url: string;
  brand_primary_color: string;
  brand_secondary_color: string;
  brand_font_color: string;
  brand_override_enabled: boolean;
  brand_heading_font: string;
  brand_body_font: string;
}

interface BrandingTabProps {
  data: BrandingData;
  onChange: (data: BrandingData) => void;
  propertyId: string | null;
  onDirty: () => void;
  canToggleBrand?: boolean;
  ownerEmail?: string;
}

/** Expand 3-digit hex to 6-digit */
function normalizeHex(hex: string): string {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    return "#" + clean[0] + clean[0] + clean[1] + clean[1] + clean[2] + clean[2];
  }
  return "#" + clean;
}

/** Calculate relative luminance (WCAG 2.0) */
function getLuminance(hex: string): number {
  const normalized = normalizeHex(hex);
  const clean = normalized.replace("#", "");
  if (clean.length < 6) return 0;
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio between two hex colours */
function getContrastRatio(hex1: string, hex2: string): number {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

function ContrastBadge({ ratio }: { ratio: number }) {
  const passesAA = ratio >= 4.5;
  const passesAALarge = ratio >= 3;
  if (passesAA) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
        <ShieldCheck className="h-3 w-3" /> AA Pass ({ratio.toFixed(1)}:1)
      </span>
    );
  }
  if (passesAALarge) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300">
        <AlertTriangle className="h-3 w-3" /> Large text only ({ratio.toFixed(1)}:1)
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
      <AlertTriangle className="h-3 w-3" /> Poor contrast ({ratio.toFixed(1)}:1)
    </span>
  );
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const normalized = normalizeHex(hex);
  const clean = normalized.replace("#", "");
  if (clean.length !== 6) return null;
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}

function rgbToHex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, "0")}${clamp(g).toString(16).padStart(2, "0")}${clamp(b).toString(16).padStart(2, "0")}`;
}

function ColorField({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description: string;
  value: string;
  onChange: (val: string) => void;
}) {
  const rgb = hexToRgb(value || "");
  const handleRgbChange = (channel: "r" | "g" | "b", raw: string) => {
    const num = parseInt(raw, 10);
    if (isNaN(num)) return;
    const current = rgb || { r: 0, g: 0, b: 0 };
    onChange(rgbToHex(
      channel === "r" ? num : current.r,
      channel === "g" ? num : current.g,
      channel === "b" ? num : current.b,
    ));
  };

  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value || "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-14 rounded-md border border-border cursor-pointer bg-transparent p-0.5"
        />
        <Input
          type="text"
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="#000000"
          className="font-mono text-xs max-w-[120px]"
        />
        {value && (
          <div
            className="h-10 w-10 shrink-0 rounded-md border border-border"
            style={{ backgroundColor: value }}
          />
        )}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-muted-foreground w-6">R</span>
        <Input type="number" min={0} max={255} value={rgb?.r ?? ""} onChange={(e) => handleRgbChange("r", e.target.value)} className="font-mono text-sm h-8 max-w-[72px]" placeholder="0" />
        <span className="text-xs text-muted-foreground w-6">G</span>
        <Input type="number" min={0} max={255} value={rgb?.g ?? ""} onChange={(e) => handleRgbChange("g", e.target.value)} className="font-mono text-sm h-8 max-w-[72px]" placeholder="0" />
        <span className="text-xs text-muted-foreground w-6">B</span>
        <Input type="number" min={0} max={255} value={rgb?.b ?? ""} onChange={(e) => handleRgbChange("b", e.target.value)} className="font-mono text-sm h-8 max-w-[72px]" placeholder="0" />
      </div>
    </div>
  );
}

/** Suggest a fallback font colour for a given background */
function suggestFallback(bgHex: string): string {
  const lum = getLuminance(bgHex);
  return lum > 0.4 ? "#1a1a2e" : "#ffffff";
}

function FontPreviewCard({
  bgColor,
  bgLabel,
  fontColor,
}: {
  bgColor: string;
  bgLabel: string;
  fontColor: string;
}) {
  const contrast = bgColor && fontColor ? getContrastRatio(bgColor, fontColor) : null;
  const failsAA = contrast !== null && contrast < 4.5;
  const fallback = failsAA ? suggestFallback(bgColor) : null;
  const fallbackContrast = fallback ? getContrastRatio(bgColor, fallback) : null;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{bgLabel} Background</span>
        {contrast !== null && <ContrastBadge ratio={contrast} />}
      </div>
      <div
        className={`rounded-lg border p-5 space-y-2 ${failsAA ? "border-destructive/50" : "border-border"}`}
        style={{ backgroundColor: bgColor || "#ffffff" }}
      >
        <h3
          className="text-lg font-serif font-semibold"
          style={{ color: fontColor || "#000000" }}
        >
          Heading Example
        </h3>
        <p
          className="text-sm"
          style={{ color: fontColor || "#000000", opacity: 0.85 }}
        >
          Body text preview — ensure this is readable on {bgLabel.toLowerCase()} backgrounds across light & dark modes.
        </p>
        <p
          className="text-xs font-medium"
          style={{ color: fontColor || "#000000", opacity: 0.6 }}
        >
          Subtle caption text at reduced opacity
        </p>
      </div>
      {failsAA && fallback && fallbackContrast && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Suggested fallback:</span>
          <span
            className="inline-block h-4 w-4 rounded border border-border"
            style={{ backgroundColor: fallback }}
          />
          <span className="font-mono">{fallback}</span>
          <ContrastBadge ratio={fallbackContrast} />
        </div>
      )}
    </div>
  );
}

export function BrandingTab({ data, onChange, propertyId, onDirty, canToggleBrand = false, ownerEmail }: BrandingTabProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);
  const [copyModalOpen, setCopyModalOpen] = useState(false);

  const updateField = <K extends keyof BrandingData>(field: K, value: BrandingData[K]) => {
    onChange({ ...data, [field]: value });
    onDirty();
  };

  const handleLogoUpload = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Invalid file type", description: "Please upload an image file (PNG, JPG, SVG, etc.)", variant: "destructive" });
      return;
    }
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      toast({ title: "File too large", description: "Maximum file size is 5MB", variant: "destructive" });
      return;
    }
    setIsUploading(true);
    try {
      const folder = propertyId || "new";
      const fileName = `${folder}/logo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("property-images")
        .upload(fileName, file, { cacheControl: "3600", upsert: false });
      if (uploadError) throw uploadError;
      const { data: urlData } = supabase.storage.from("property-images").getPublicUrl(uploadData.path);
      updateField("brand_logo_url", urlData.publicUrl);
      toast({ title: "Logo uploaded", description: "Property logo has been uploaded successfully" });
    } catch (error) {
      console.error("Logo upload error:", error);
      toast({ title: "Upload failed", description: "Could not upload logo. Please try again.", variant: "destructive" });
    } finally {
      setIsUploading(false);
    }
  };

  const hasColors = !!(data.brand_primary_color || data.brand_secondary_color || data.brand_font_color);

  const showCopyButton = !!propertyId && !!ownerEmail && (hasColors || !!data.brand_logo_url);

  return (
    <div className="space-y-4">
      {/* Copy to other properties */}
      {showCopyButton && (
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={() => setCopyModalOpen(true)}>
            <Copy className="h-4 w-4 mr-2" />
            Copy to Other Properties
          </Button>
        </div>
      )}
      {/* Brand Override note — managed from Billing tab */}
      <Card>
        <CardContent className="py-4 px-4">
          <p className="text-xs text-muted-foreground">
            <strong>Property Branding</strong> is controlled via the <em>White-label</em> toggle in the <strong>Billing</strong> tab under Rates.
          </p>
        </CardContent>
      </Card>

      {/* Logo Upload */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            Property Logo
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 px-4 space-y-3">
          <p className="text-xs text-muted-foreground">
            Upload your property's logo. This will be used on the booking page and guest communications.
          </p>
          {data.brand_logo_url ? (
            <div className="space-y-2">
              <div className="relative inline-block rounded-lg border border-border bg-muted/30 p-4">
                <img src={data.brand_logo_url} alt="Property logo" className="max-h-24 max-w-[240px] object-contain" />
                <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => updateField("brand_logo_url", "")}>
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-sm">{data.brand_logo_url}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                <input type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; if (file) handleLogoUpload(file); }} disabled={isUploading} />
                {isUploading ? (
                  <>
                    <Loader2 className="h-8 w-8 text-primary mx-auto mb-2 animate-spin" />
                    <p className="text-xs text-primary font-medium">Uploading logo...</p>
                  </>
                ) : (
                  <>
                    <Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm font-medium text-foreground mb-1">Click or drag and drop to upload</p>
                    <p className="text-xs text-muted-foreground">PNG, JPG, SVG up to 5MB</p>
                  </>
                )}
              </label>
              <div className="relative">
                <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or paste URL</span></div>
              </div>
              <Input type="url" placeholder="https://example.com/logo.png" value={data.brand_logo_url || ""} onChange={(e) => updateField("brand_logo_url", e.target.value)} className="text-xs" />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Brand Colors */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <Palette className="h-4 w-4 text-primary" />
            Brand Colours
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 px-4 space-y-5">
          <p className="text-xs text-muted-foreground">
            Set your property's brand colours. These will be used to personalise the booking experience and property pages.
          </p>
          <ColorField label="Primary Colour" description="Main brand colour used for buttons, headers, and accents" value={data.brand_primary_color} onChange={(v) => updateField("brand_primary_color", v)} />
          <ColorField label="Secondary Colour" description="Supporting colour used for backgrounds, highlights, and secondary elements" value={data.brand_secondary_color} onChange={(v) => updateField("brand_secondary_color", v)} />
          <ColorField label="Font Colour" description="Primary text colour for headings and body content" value={data.brand_font_color} onChange={(v) => updateField("brand_font_color", v)} />
        </CardContent>
      </Card>

      {/* Typography — Google Font Pickers */}
      <Card>
        <CardHeader className="py-3 px-4">
          <CardTitle className="text-sm flex items-center gap-2">
            <LetterText className="h-4 w-4 text-primary" />
            Typography
          </CardTitle>
        </CardHeader>
        <CardContent className="py-3 px-4 space-y-5">
          <p className="text-xs text-muted-foreground">
            Choose custom Google Fonts for your property's headings and body text. Leave empty to use system defaults.
          </p>
          <GoogleFontPicker
            label="Heading Font"
            description="Used for titles, headings, and prominent text"
            value={data.brand_heading_font || null}
            onChange={(font) => updateField("brand_heading_font", font || "")}
          />
          <GoogleFontPicker
            label="Body Font"
            description="Used for paragraphs, descriptions, and general content"
            value={data.brand_body_font || null}
            onChange={(font) => updateField("brand_body_font", font || "")}
          />
        </CardContent>
      </Card>


      {hasColors && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Type className="h-4 w-4 text-primary" />
              Font Readability Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 px-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              Review how your font colour appears on each brand background. Aim for AA contrast (4.5:1 ratio) for full readability.
            </p>

            {data.brand_primary_color && data.brand_font_color && (
              <FontPreviewCard bgColor={data.brand_primary_color} bgLabel="Primary" fontColor={data.brand_font_color} />
            )}

            {data.brand_secondary_color && data.brand_font_color && (
              <FontPreviewCard bgColor={data.brand_secondary_color} bgLabel="Secondary" fontColor={data.brand_font_color} />
            )}

            {/* White & dark backgrounds for light/dark mode */}
            {data.brand_font_color && (
              <>
                <FontPreviewCard bgColor="#ffffff" bgLabel="Light Mode" fontColor={data.brand_font_color} />
                <FontPreviewCard bgColor="#1a1a2e" bgLabel="Dark Mode" fontColor={data.brand_font_color} />
              </>
            )}

            {/* Primary colour as text on white/dark */}
            {data.brand_primary_color && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-muted-foreground">Primary as Accent Text</span>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-lg border border-border p-4" style={{ backgroundColor: "#ffffff" }}>
                    <p className="text-sm font-semibold" style={{ color: data.brand_primary_color }}>Book Now →</p>
                    <ContrastBadge ratio={getContrastRatio("#ffffff", data.brand_primary_color)} />
                  </div>
                  <div className="rounded-lg border border-border p-4" style={{ backgroundColor: "#1a1a2e" }}>
                    <p className="text-sm font-semibold" style={{ color: data.brand_primary_color }}>Book Now →</p>
                    <ContrastBadge ratio={getContrastRatio("#1a1a2e", data.brand_primary_color)} />
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Live Combined Preview */}
      {hasColors && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Palette className="h-4 w-4 text-primary" />
              Showcase Preview
            </CardTitle>
          </CardHeader>
          <CardContent className="py-3 px-4">
            <div
              className="rounded-lg border border-border p-6 space-y-3"
              style={{ backgroundColor: data.brand_secondary_color || "#ffffff" }}
            >
              {data.brand_logo_url && (
                <img src={data.brand_logo_url} alt="Logo preview" className="max-h-10 object-contain mb-3" />
              )}
              <h3 className="text-lg font-semibold" style={{ color: data.brand_font_color || "#000000" }}>
                Sample Heading
              </h3>
              <p className="text-sm" style={{ color: data.brand_font_color ? `${data.brand_font_color}cc` : "#333333" }}>
                This is how your property's branded content will appear to guests.
              </p>
              <button
                className="px-4 py-2 rounded-md text-sm font-medium text-white"
                style={{ backgroundColor: data.brand_primary_color || "#e91e8c" }}
              >
                Book Now
              </button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Experience Engine Toggle — admin/dev only */}
      {propertyId && (
        <ExperienceEngineToggle propertyId={propertyId} />
      )}

      {propertyId && ownerEmail && (
        <CopyBrandingModal
          open={copyModalOpen}
          onOpenChange={setCopyModalOpen}
          sourcePropertyId={propertyId}
          brandingData={data}
          ownerEmail={ownerEmail}
        />
      )}
    </div>
  );
}

function ExperienceEngineToggle({ propertyId }: { propertyId: string }) {
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Load current state on mount
  React.useEffect(() => {
    supabase
      .from('rolos_ui_configs')
      .select('experience_engine_enabled')
      .eq('property_id', propertyId)
      .maybeSingle()
      .then(({ data }) => {
        setEnabled(data?.experience_engine_enabled ?? false);
        setLoading(false);
      });
  }, [propertyId]);

  const handleToggle = async (checked: boolean) => {
    setEnabled(checked);
    const { error } = await supabase
      .from('rolos_ui_configs')
      .upsert({
        property_id: propertyId,
        component_type: 'experience_engine',
        experience_engine_enabled: checked,
      }, { onConflict: 'property_id,component_type' });

    if (error) {
      setEnabled(!checked);
      toast({ title: 'Error', description: 'Failed to update Experience Engine setting', variant: 'destructive' });
      return;
    }

    toast({ title: checked ? 'Experience Engine Enabled' : 'Experience Engine Disabled' });
  };

  return (
    <Card>
      <CardHeader className="py-3 px-4">
        <CardTitle className="text-sm flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-primary" />
          Experience Engine
        </CardTitle>
      </CardHeader>
      <CardContent className="py-3 px-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <Label className="text-sm font-medium">Enable Experience Engine</Label>
            <p className="text-xs text-muted-foreground">
              Activates dynamic policies, brand kits, and guest portal features for this property.
            </p>
          </div>
          <Switch
            checked={enabled}
            onCheckedChange={handleToggle}
            disabled={loading}
          />
        </div>
      </CardContent>
    </Card>
  );
}
