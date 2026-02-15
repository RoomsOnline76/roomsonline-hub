import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, Loader2, X, Palette, Type } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface BrandingData {
  brand_logo_url: string;
  brand_primary_color: string;
  brand_secondary_color: string;
  brand_font_color: string;
}

interface BrandingTabProps {
  data: BrandingData;
  onChange: (data: BrandingData) => void;
  propertyId: string | null;
  onDirty: () => void;
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
          className="font-mono text-sm max-w-[160px]"
        />
        {value && (
          <div
            className="h-10 flex-1 rounded-md border border-border"
            style={{ backgroundColor: value }}
          />
        )}
      </div>
    </div>
  );
}

export function BrandingTab({ data, onChange, propertyId, onDirty }: BrandingTabProps) {
  const { toast } = useToast();
  const [isUploading, setIsUploading] = useState(false);

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

  return (
    <div className="space-y-4">
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
                <img
                  src={data.brand_logo_url}
                  alt="Property logo"
                  className="max-h-24 max-w-[240px] object-contain"
                />
                <Button
                  type="button"
                  variant="destructive"
                  size="icon"
                  className="absolute -top-2 -right-2 h-6 w-6"
                  onClick={() => updateField("brand_logo_url", "")}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground truncate max-w-sm">{data.brand_logo_url}</p>
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleLogoUpload(file);
                  }}
                  disabled={isUploading}
                />
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

              {/* Or paste URL */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-border" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-card px-2 text-muted-foreground">or paste URL</span>
                </div>
              </div>

              <Input
                type="url"
                placeholder="https://example.com/logo.png"
                value={data.brand_logo_url || ""}
                onChange={(e) => updateField("brand_logo_url", e.target.value)}
                className="text-xs"
              />
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

          <ColorField
            label="Primary Colour"
            description="Main brand colour used for buttons, headers, and accents"
            value={data.brand_primary_color}
            onChange={(v) => updateField("brand_primary_color", v)}
          />

          <ColorField
            label="Secondary Colour"
            description="Supporting colour used for backgrounds, highlights, and secondary elements"
            value={data.brand_secondary_color}
            onChange={(v) => updateField("brand_secondary_color", v)}
          />

          <ColorField
            label="Font Colour"
            description="Primary text colour for headings and body content"
            value={data.brand_font_color}
            onChange={(v) => updateField("brand_font_color", v)}
          />
        </CardContent>
      </Card>

      {/* Live Preview */}
      {(data.brand_primary_color || data.brand_secondary_color || data.brand_font_color) && (
        <Card>
          <CardHeader className="py-3 px-4">
            <CardTitle className="text-sm flex items-center gap-2">
              <Type className="h-4 w-4 text-primary" />
              Preview
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
              <h3
                className="text-lg font-semibold"
                style={{ color: data.brand_font_color || "#000000" }}
              >
                Sample Heading
              </h3>
              <p
                className="text-sm"
                style={{ color: data.brand_font_color ? `${data.brand_font_color}cc` : "#333333" }}
              >
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
    </div>
  );
}
