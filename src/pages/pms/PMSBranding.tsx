import { useEffect, useState } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Palette, Save, Eye, Upload, Loader2, X, Type, ShieldCheck, AlertTriangle, ExternalLink, Globe, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePMSBrand } from "@/contexts/PMSBrandContext";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";

interface BrandConfig {
  business_name: string;
  business_address: { street?: string; city?: string; state?: string; postal?: string; country?: string };
  vat_number: string;
  is_vat_registered: boolean;
  vat_rate: number;
  email_footer_text: string;
  custom_tagline: string;
  favicon_url: string;
}

interface VisualBrand {
  brand_logo_url: string;
  brand_primary_color: string;
  brand_secondary_color: string;
  brand_font_color: string;
  brand_accent_color: string;
  brand_heading_text_color: string;
  brand_body_text_color: string;
  brand_muted_text_color: string;
  brand_light_bg_color: string;
  brand_dark_bg_color: string;
  brand_override_enabled: boolean;
}

const defaultConfig: BrandConfig = {
  business_name: "",
  business_address: {},
  vat_number: "",
  is_vat_registered: false,
  vat_rate: 15,
  email_footer_text: "",
  custom_tagline: "",
  favicon_url: "",
};

const defaultVisual: VisualBrand = {
  brand_logo_url: "",
  brand_primary_color: "",
  brand_secondary_color: "",
  brand_font_color: "",
  brand_accent_color: "",
  brand_heading_text_color: "",
  brand_body_text_color: "",
  brand_muted_text_color: "",
  brand_light_bg_color: "",
  brand_dark_bg_color: "",
  brand_override_enabled: false,
};

/* ── Colour helpers ── */
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const c = hex.replace("#", "");
  if (c.length !== 6) return null;
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  if (isNaN(r) || isNaN(g) || isNaN(b)) return null;
  return { r, g, b };
}
function rgbToHex(r: number, g: number, b: number): string {
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${cl(r).toString(16).padStart(2, "0")}${cl(g).toString(16).padStart(2, "0")}${cl(b).toString(16).padStart(2, "0")}`;
}
function getLuminance(hex: string): number {
  const c = hex.replace("#", "");
  if (c.length < 6) return 0;
  const toL = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * toL(parseInt(c.substring(0, 2), 16)) + 0.7152 * toL(parseInt(c.substring(2, 4), 16)) + 0.0722 * toL(parseInt(c.substring(4, 6), 16));
}
function getContrastRatio(a: string, b: string): number {
  const l1 = Math.max(getLuminance(a), getLuminance(b));
  const l2 = Math.min(getLuminance(a), getLuminance(b));
  return (l1 + 0.05) / (l2 + 0.05);
}

function ContrastBadge({ ratio }: { ratio: number }) {
  if (ratio >= 4.5) return <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"><ShieldCheck className="h-3 w-3" />AA ({ratio.toFixed(1)})</span>;
  if (ratio >= 3) return <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"><AlertTriangle className="h-3 w-3" />Large only ({ratio.toFixed(1)})</span>;
  return <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"><AlertTriangle className="h-3 w-3" />Poor ({ratio.toFixed(1)})</span>;
}

function ColorField({ label, description, value, onChange }: { label: string; description: string; value: string; onChange: (v: string) => void }) {
  const rgb = hexToRgb(value || "");
  const rgbChange = (ch: "r" | "g" | "b", raw: string) => {
    const n = parseInt(raw, 10); if (isNaN(n)) return;
    const c = rgb || { r: 0, g: 0, b: 0 };
    onChange(rgbToHex(ch === "r" ? n : c.r, ch === "g" ? n : c.g, ch === "b" ? n : c.b));
  };
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div className="flex items-center gap-3">
        <input type="color" value={value || "#000000"} onChange={e => onChange(e.target.value)} className="h-10 w-14 rounded-md border border-border cursor-pointer bg-transparent p-0.5" />
        <Input type="text" value={value || ""} onChange={e => onChange(e.target.value)} placeholder="#000000" className="font-mono text-sm max-w-[120px]" />
        {value && <div className="h-10 w-10 shrink-0 rounded-md border border-border" style={{ backgroundColor: value }} />}
      </div>
      <div className="flex items-center gap-2 mt-1">
        <span className="text-xs text-muted-foreground w-6">R</span>
        <Input type="number" min={0} max={255} value={rgb?.r ?? ""} onChange={e => rgbChange("r", e.target.value)} className="font-mono text-sm h-8 max-w-[72px]" />
        <span className="text-xs text-muted-foreground w-6">G</span>
        <Input type="number" min={0} max={255} value={rgb?.g ?? ""} onChange={e => rgbChange("g", e.target.value)} className="font-mono text-sm h-8 max-w-[72px]" />
        <span className="text-xs text-muted-foreground w-6">B</span>
        <Input type="number" min={0} max={255} value={rgb?.b ?? ""} onChange={e => rgbChange("b", e.target.value)} className="font-mono text-sm h-8 max-w-[72px]" />
      </div>
    </div>
  );
}

/* ── Review Platforms Card ── */
const REVIEW_PLATFORM_TYPES = [
  { type: "tripadvisor", label: "TripAdvisor", idLabel: "TripAdvisor Location ID", placeholder: "e.g. d12345678" },
  { type: "google", label: "Google Reviews", idLabel: "Google Place ID", placeholder: "e.g. ChIJ..." },
  { type: "booking_com", label: "Booking.com", idLabel: "Booking.com URL", placeholder: "https://www.booking.com/hotel/..." },
];

interface ReviewPlatformEntry { type: string; id?: string; place_id?: string; url?: string; enabled: boolean }

function ReviewPlatformsCard({ propertyId }: { propertyId: string }) {
  const [platforms, setPlatforms] = useState<ReviewPlatformEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      const { data } = await supabase.from("properties").select("amenities").eq("id", propertyId).single();
      if (data) {
        const a = data.amenities as any;
        const existing = Array.isArray(a?.review_platforms) ? a.review_platforms : [];
        // Merge with known types
        const merged = REVIEW_PLATFORM_TYPES.map((pt) => {
          const found = existing.find((e: any) => e.type === pt.type);
          if (found) return found;
          // Auto-populate TripAdvisor from legacy fields
          if (pt.type === "tripadvisor") {
            const taId = a?.tripadvisor_id || a?.external_ids?.tripadvisor_id;
            if (taId) return { type: "tripadvisor", id: String(taId), enabled: true };
          }
          return { type: pt.type, enabled: false };
        });
        setPlatforms(merged);
      }
      setLoaded(true);
    })();
  }, [propertyId]);

  const updatePlatform = (type: string, updates: Partial<ReviewPlatformEntry>) => {
    setPlatforms((prev) => prev.map((p) => (p.type === type ? { ...p, ...updates } : p)));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data: current } = await supabase.from("properties").select("amenities").eq("id", propertyId).single();
      const amenities = (current?.amenities as any) || {};
      amenities.review_platforms = platforms;
      const { error } = await supabase.from("properties").update({ amenities } as any).eq("id", propertyId);
      if (error) throw error;
      toast.success("Review platforms saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
    setSaving(false);
  };

  if (!loaded) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Star className="h-4 w-4 text-primary" /> Review Platforms</CardTitle>
        <CardDescription>Connect your review platforms to display ratings on your booking pages and embeds.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {REVIEW_PLATFORM_TYPES.map((pt) => {
          const entry = platforms.find((p) => p.type === pt.type) || { type: pt.type, enabled: false };
          const idValue = pt.type === "google" ? entry.place_id || "" : pt.type === "booking_com" ? entry.url || "" : entry.id || "";
          return (
            <div key={pt.type} className="rounded-lg border border-border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{pt.label}</span>
                </div>
                <Switch checked={entry.enabled} onCheckedChange={(v) => updatePlatform(pt.type, { enabled: v })} />
              </div>
              {entry.enabled && (
                <div>
                  <Label className="text-xs">{pt.idLabel}</Label>
                  <Input
                    value={idValue}
                    placeholder={pt.placeholder}
                    className="mt-1 text-sm"
                    onChange={(e) => {
                      const val = e.target.value;
                      if (pt.type === "google") updatePlatform(pt.type, { place_id: val });
                      else if (pt.type === "booking_com") updatePlatform(pt.type, { url: val });
                      else updatePlatform(pt.type, { id: val });
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
        <Button onClick={handleSave} disabled={saving} variant="outline" size="sm" className="w-full">
          <Save className="h-3.5 w-3.5 mr-1.5" />{saving ? "Saving…" : "Save Review Platforms"}
        </Button>
      </CardContent>
    </Card>
  );
}

export default function PMSBranding() {
  const { propertyId, portfolioProperties, portfolioIds, loading: propertyLoading, showPortfolioToggle } = usePmsPropertyId();
  const { propertyName, propertySlug } = usePMSBrand();
  const [propertySlugLocal, setPropertySlugLocal] = useState<string | null>(null);
  const [config, setConfig] = useState<BrandConfig>(defaultConfig);
  const [visual, setVisual] = useState<VisualBrand>(defaultVisual);
  const [saving, setSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [brandingView, setBrandingView] = useState<"single" | "portfolio">("single");

  // Portfolio branding state
  const [portfolioBranding, setPortfolioBranding] = useState<{
    logo_url: string; primary_color: string; secondary_color: string; font_color: string;
    heading_text_color: string; body_text_color: string; muted_text_color: string; light_bg_color: string; dark_bg_color: string;
    hero_video_url: string;
  }>({ logo_url: "", primary_color: "", secondary_color: "", font_color: "", heading_text_color: "", body_text_color: "", muted_text_color: "", light_bg_color: "", dark_bg_color: "", hero_video_url: "" });
  const [portfolioLoaded, setPortfolioLoaded] = useState(false);
  const [portfolioSaving, setPortfolioSaving] = useState(false);

  // Load portfolio branding when in portfolio view
  useEffect(() => {
    if (!portfolioIds?.length || brandingView !== "portfolio") return;
    (async () => {
      const { data } = await supabase
        .from("property_portfolios" as any)
        .select("id, name, metadata")
        .in("id", portfolioIds)
        .limit(1)
        .single();
      if (data) {
        const b = (data as any).metadata?.branding || {};
        setPortfolioBranding({
          logo_url: b.logo_url || "",
          primary_color: b.primary_color || "",
          secondary_color: b.secondary_color || "",
          font_color: b.font_color || "",
          heading_text_color: b.heading_text_color || "",
          body_text_color: b.body_text_color || "",
          muted_text_color: b.muted_text_color || "",
          light_bg_color: b.light_bg_color || "",
          dark_bg_color: b.dark_bg_color || "",
          hero_video_url: b.hero_video_url || "",
        });
      }
      setPortfolioLoaded(true);
    })();
  }, [portfolioIds, brandingView]);

  const handleSavePortfolioBranding = async () => {
    if (!portfolioIds?.length) return;
    setPortfolioSaving(true);
    try {
      const { data: current } = await supabase
        .from("property_portfolios" as any)
        .select("metadata")
        .eq("id", portfolioIds[0])
        .single();
      const metadata = ((current as any)?.metadata as any) || {};
      metadata.branding = { ...metadata.branding, ...portfolioBranding };
      const { error } = await supabase
        .from("property_portfolios" as any)
        .update({ metadata } as any)
        .eq("id", portfolioIds[0]);
      if (error) throw error;
      toast.success("Portfolio branding saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save portfolio branding");
    }
    setPortfolioSaving(false);
  };

  // Load both stationery (rolos_brand_config) and visual brand (properties) in parallel
  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      const [stationeryRes, propertyRes] = await Promise.all([
        supabase.from("rolos_brand_config").select("*").eq("property_id", propertyId).maybeSingle(),
        supabase.from("properties").select("brand_logo_url, brand_primary_color, brand_secondary_color, brand_font_color, brand_accent_color, brand_override_enabled, slug, brand_heading_text_color, brand_body_text_color, brand_muted_text_color, brand_light_bg_color, brand_dark_bg_color").eq("id", propertyId).single(),
      ]);
      if (stationeryRes.data) {
        const d = stationeryRes.data;
        setConfig({
          business_name: (d.business_name as string) || "",
          business_address: (d.business_address as BrandConfig["business_address"]) || {},
          vat_number: d.vat_number || "",
          is_vat_registered: d.is_vat_registered ?? false,
          vat_rate: d.vat_rate ?? 15,
          email_footer_text: d.email_footer_text || "",
          custom_tagline: d.custom_tagline || "",
          favicon_url: d.favicon_url || "",
        });
      }
      if (propertyRes.data) {
        const p = propertyRes.data;
        setVisual({
          brand_logo_url: p.brand_logo_url || "",
          brand_primary_color: p.brand_primary_color || "",
          brand_secondary_color: p.brand_secondary_color || "",
          brand_font_color: p.brand_font_color || "",
          brand_accent_color: p.brand_accent_color || "",
          brand_heading_text_color: (p as any).brand_heading_text_color || "",
          brand_body_text_color: (p as any).brand_body_text_color || "",
          brand_muted_text_color: (p as any).brand_muted_text_color || "",
          brand_light_bg_color: (p as any).brand_light_bg_color || "",
          brand_dark_bg_color: (p as any).brand_dark_bg_color || "",
          brand_override_enabled: p.brand_override_enabled ?? false,
        });
        setPropertySlugLocal(p.slug || null);
      }
      setLoaded(true);
    })();
  }, [propertyId]);

  const handleLogoUpload = async (file: File) => {
    if (!file || !file.type.startsWith("image/")) { toast.error("Please upload an image file"); return; }
    if (file.size > 5 * 1024 * 1024) { toast.error("Max file size is 5MB"); return; }
    setIsUploading(true);
    try {
      const folder = propertyId || "new";
      const fileName = `${folder}/logo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
      const { data: upData, error: upErr } = await supabase.storage.from("property-images").upload(fileName, file, { cacheControl: "3600", upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("property-images").getPublicUrl(upData.path);
      setVisual(prev => ({ ...prev, brand_logo_url: urlData.publicUrl }));
      toast.success("Logo uploaded");
    } catch (e: any) {
      toast.error(e.message || "Upload failed");
    }
    setIsUploading(false);
  };

  const handleSave = async () => {
    if (!propertyId) return;
    setSaving(true);
    try {
      // Save stationery to rolos_brand_config
      const stationeryPayload = {
        property_id: propertyId,
        business_name: config.business_name || null,
        business_address: config.business_address,
        vat_number: config.vat_number || null,
        is_vat_registered: config.is_vat_registered,
        vat_rate: config.is_vat_registered ? config.vat_rate : null,
        email_footer_text: config.email_footer_text || null,
        custom_tagline: config.custom_tagline || null,
        favicon_url: config.favicon_url || null,
      };
      const { error: stErr } = await supabase.from("rolos_brand_config").upsert(stationeryPayload, { onConflict: "property_id" });
      if (stErr) throw stErr;

      // Save visual brand to properties table (syncs with Property Overview)
      const { error: prErr } = await supabase.from("properties").update({
        brand_logo_url: visual.brand_logo_url || null,
        brand_primary_color: visual.brand_primary_color || null,
        brand_secondary_color: visual.brand_secondary_color || null,
        brand_font_color: visual.brand_font_color || null,
        brand_accent_color: visual.brand_accent_color || null,
        brand_heading_text_color: visual.brand_heading_text_color || null,
        brand_body_text_color: visual.brand_body_text_color || null,
        brand_muted_text_color: visual.brand_muted_text_color || null,
        brand_light_bg_color: visual.brand_light_bg_color || null,
        brand_dark_bg_color: visual.brand_dark_bg_color || null,
        brand_override_enabled: visual.brand_override_enabled,
      } as any).eq("id", propertyId);
      if (prErr) throw prErr;

      toast.success("Branding & stationery saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
    setSaving(false);
  };

  if (propertyLoading) return <p className="text-muted-foreground">Loading property…</p>;
  if (!propertyId) return <p className="text-muted-foreground">Select a property first.</p>;

  const addr = config.business_address;
  const hasColors = !!(visual.brand_primary_color || visual.brand_secondary_color || visual.brand_font_color);

  return (
    <>
      <div className="space-y-6 max-w-5xl">
        <div className="flex items-center gap-3 flex-wrap">
          <Palette className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Branding & Stationery</h1>
          {showPortfolioToggle && (
            <div className="ml-auto flex items-center gap-1 rounded-lg border border-border bg-muted/50 p-0.5">
              <button
                onClick={() => setBrandingView("single")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  brandingView === "single"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Single Property
              </button>
              <button
                onClick={() => setBrandingView("portfolio")}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  brandingView === "portfolio"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Portfolio
              </button>
            </div>
          )}
        </div>

        {brandingView === "portfolio" && showPortfolioToggle ? (
          /* ── Portfolio Branding View ── */
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4 text-primary" /> Portfolio Branding</CardTitle>
                <CardDescription>These settings apply to your portfolio showcase page and shared guest-facing assets across all {portfolioProperties?.length} properties.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Portfolio Logo */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Portfolio Logo</Label>
                  {portfolioBranding.logo_url ? (
                    <div className="relative inline-block rounded-lg border border-border bg-muted/30 p-4">
                      <img src={portfolioBranding.logo_url} alt="Portfolio logo" className="max-h-24 max-w-[240px] object-contain" />
                      <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => setPortfolioBranding(p => ({ ...p, logo_url: "" }))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <Input
                      placeholder="Logo URL"
                      value={portfolioBranding.logo_url}
                      onChange={(e) => setPortfolioBranding(p => ({ ...p, logo_url: e.target.value }))}
                    />
                  )}
                </div>

                {/* Portfolio Hero Video */}
                <Separator />
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Hero Video</Label>
                  <p className="text-xs text-muted-foreground">Default hero video for the portfolio page. Overrides randomly-selected property videos. Supports direct video URLs or YouTube links.</p>
                  {portfolioBranding.hero_video_url ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg border border-border bg-muted/30">
                      <span className="text-xs text-muted-foreground truncate flex-1">{portfolioBranding.hero_video_url}</span>
                      <Button type="button" variant="destructive" size="icon" className="h-6 w-6 shrink-0" onClick={() => setPortfolioBranding(p => ({ ...p, hero_video_url: "" }))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <label className="block border-2 border-dashed border-border rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer">
                        <input type="file" accept="video/*" className="hidden" onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (!f) return;
                          if (f.size > 100 * 1024 * 1024) { toast.error("Max file size is 100MB"); return; }
                          try {
                            const folder = `portfolio-${portfolioIds?.[0] || "new"}`;
                            const fileName = `${folder}/hero-video-${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
                            const { data: upData, error: upErr } = await supabase.storage.from("property-images").upload(fileName, f, { cacheControl: "3600", upsert: false });
                            if (upErr) throw upErr;
                            const { data: urlData } = supabase.storage.from("property-images").getPublicUrl(upData.path);
                            setPortfolioBranding(p => ({ ...p, hero_video_url: urlData.publicUrl }));
                            toast.success("Hero video uploaded");
                          } catch (err: any) { toast.error(err.message || "Upload failed"); }
                        }} />
                        <Upload className="h-6 w-6 text-muted-foreground mx-auto mb-1" />
                        <p className="text-sm font-medium">Upload video file</p>
                        <p className="text-xs text-muted-foreground">MP4, MOV up to 100MB</p>
                      </label>
                      <div className="relative">
                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                        <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or paste URL</span></div>
                      </div>
                      <Input
                        type="url"
                        placeholder="https://youtube.com/watch?v=... or video file URL"
                        value={portfolioBranding.hero_video_url}
                        onChange={(e) => setPortfolioBranding(p => ({ ...p, hero_video_url: e.target.value }))}
                        className="text-xs"
                      />
                    </div>
                  )}
                </div>

                <Separator />
                <ColorField
                  label="Primary Color"
                  description="Main brand color for buttons and highlights on the portfolio page"
                  value={portfolioBranding.primary_color}
                  onChange={(v) => setPortfolioBranding(p => ({ ...p, primary_color: v }))}
                />
                <ColorField
                  label="Secondary Color"
                  description="Accent or secondary brand color"
                  value={portfolioBranding.secondary_color}
                  onChange={(v) => setPortfolioBranding(p => ({ ...p, secondary_color: v }))}
                />
                <Separator />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Text Colours</p>
                <ColorField
                  label="Heading Text"
                  description="Colour for headings and titles"
                  value={portfolioBranding.heading_text_color}
                  onChange={(v) => setPortfolioBranding(p => ({ ...p, heading_text_color: v }))}
                />
                <ColorField
                  label="Body Text"
                  description="Colour for body paragraphs and descriptions"
                  value={portfolioBranding.body_text_color}
                  onChange={(v) => setPortfolioBranding(p => ({ ...p, body_text_color: v }))}
                />
                <ColorField
                  label="Muted Text / Links"
                  description="Colour for secondary text, captions, and links"
                  value={portfolioBranding.muted_text_color}
                  onChange={(v) => setPortfolioBranding(p => ({ ...p, muted_text_color: v }))}
                />
                <Separator />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Background Colours</p>
                <ColorField
                  label="Light BG / Cards"
                  description="Background for cards and page background"
                  value={portfolioBranding.light_bg_color}
                  onChange={(v) => setPortfolioBranding(p => ({ ...p, light_bg_color: v }))}
                />
                <ColorField
                  label="Dark BG Accent"
                  description="Accent backgrounds for highlighted sections"
                  value={portfolioBranding.dark_bg_color}
                  onChange={(v) => setPortfolioBranding(p => ({ ...p, dark_bg_color: v }))}
                />
                <Separator />
                <ColorField
                  label="Font Color (Legacy)"
                  description="Fallback text colour — used when heading/body text not set"
                  value={portfolioBranding.font_color}
                  onChange={(v) => setPortfolioBranding(p => ({ ...p, font_color: v }))}
                />
                <Button onClick={handleSavePortfolioBranding} disabled={portfolioSaving} className="w-full">
                  <Save className="h-4 w-4 mr-2" />
                  {portfolioSaving ? "Saving…" : "Save Portfolio Branding"}
                </Button>
              </CardContent>
            </Card>

            {/* Per-property review platforms in portfolio view */}
            {portfolioProperties?.map((pp) => (
              <div key={pp.id}>
                <h3 className="text-sm font-semibold text-foreground mb-2">{pp.name} — Review Platforms</h3>
                <ReviewPlatformsCard propertyId={pp.id} />
              </div>
            ))}
          </div>
        ) : (
          /* ── Single Property View (existing) ── */
          <div className="grid lg:grid-cols-3 gap-6">
          {/* Main Form */}
          <div className="lg:col-span-2 space-y-6">

            {/* ─── Logo Upload ─── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Upload className="h-4 w-4 text-primary" /> Property Logo</CardTitle>
                <CardDescription>Used on booking pages, invoices, folios, and guest communications. Changes sync to Property Overview.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {visual.brand_logo_url ? (
                  <div className="space-y-2">
                    <div className="relative inline-block rounded-lg border border-border bg-muted/30 p-4">
                      <img src={visual.brand_logo_url} alt="Property logo" className="max-h-24 max-w-[240px] object-contain" />
                      <Button type="button" variant="destructive" size="icon" className="absolute -top-2 -right-2 h-6 w-6" onClick={() => setVisual(p => ({ ...p, brand_logo_url: "" }))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground truncate max-w-sm">{visual.brand_logo_url}</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <label className="block border-2 border-dashed border-border rounded-lg p-8 text-center hover:border-primary/50 transition-colors cursor-pointer">
                      <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} disabled={isUploading} />
                      {isUploading ? (
                        <><Loader2 className="h-8 w-8 text-primary mx-auto mb-2 animate-spin" /><p className="text-xs text-primary font-medium">Uploading…</p></>
                      ) : (
                        <><Upload className="h-8 w-8 text-muted-foreground mx-auto mb-2" /><p className="text-sm font-medium text-foreground mb-1">Click to upload</p><p className="text-xs text-muted-foreground">PNG, JPG, SVG up to 5MB</p></>
                      )}
                    </label>
                    <div className="relative">
                      <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-border" /></div>
                      <div className="relative flex justify-center text-xs"><span className="bg-card px-2 text-muted-foreground">or paste URL</span></div>
                    </div>
                    <Input type="url" placeholder="https://example.com/logo.png" value={visual.brand_logo_url} onChange={e => setVisual(p => ({ ...p, brand_logo_url: e.target.value }))} className="text-xs" />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* ─── Brand Colours ─── */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Palette className="h-4 w-4 text-primary" /> Brand Colours</CardTitle>
                <CardDescription>Property showcase and booking pages use these colours. Changes sync bidirectionally with Property Overview.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-5">
                <ColorField label="Primary Colour" description="Buttons, headers, and accents" value={visual.brand_primary_color} onChange={v => setVisual(p => ({ ...p, brand_primary_color: v }))} />
                <ColorField label="Secondary Colour" description="Backgrounds, highlights, and secondary elements" value={visual.brand_secondary_color} onChange={v => setVisual(p => ({ ...p, brand_secondary_color: v }))} />
                <Separator />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Text Colours</p>
                <ColorField label="Heading Text" description="Colour for headings and titles" value={visual.brand_heading_text_color} onChange={v => setVisual(p => ({ ...p, brand_heading_text_color: v }))} />
                <ColorField label="Body Text" description="Colour for body paragraphs and descriptions" value={visual.brand_body_text_color} onChange={v => setVisual(p => ({ ...p, brand_body_text_color: v }))} />
                <ColorField label="Muted Text / Links" description="Colour for secondary text, captions, and links" value={visual.brand_muted_text_color} onChange={v => setVisual(p => ({ ...p, brand_muted_text_color: v }))} />
                <Separator />
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Background Colours</p>
                <ColorField label="Light BG / Cards" description="Background for cards, popovers, and page background" value={visual.brand_light_bg_color} onChange={v => setVisual(p => ({ ...p, brand_light_bg_color: v }))} />
                <ColorField label="Dark BG Accent" description="Accent backgrounds for highlighted sections" value={visual.brand_dark_bg_color} onChange={v => setVisual(p => ({ ...p, brand_dark_bg_color: v }))} />
                <Separator />
                <ColorField label="Font Colour (Legacy)" description="Fallback text colour — used when heading/body text not set" value={visual.brand_font_color} onChange={v => setVisual(p => ({ ...p, brand_font_color: v }))} />
                <Separator />
                <ColorField label="Menu / Accent Colour" description="Sidebar active menu item highlight and hover background in the PMS interface" value={visual.brand_accent_color} onChange={v => setVisual(p => ({ ...p, brand_accent_color: v }))} />
              </CardContent>
            </Card>

            {/* Contrast preview */}
            {hasColors && visual.brand_font_color && visual.brand_primary_color && (
              <Card>
                <CardHeader><CardTitle className="text-sm flex items-center gap-2"><Type className="h-4 w-4 text-primary" /> Contrast Check</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-border p-4 space-y-1" style={{ backgroundColor: visual.brand_primary_color }}>
                      <p className="text-sm font-semibold" style={{ color: visual.brand_font_color }}>Heading</p>
                      <p className="text-xs" style={{ color: visual.brand_font_color, opacity: 0.85 }}>Body text preview</p>
                      <ContrastBadge ratio={getContrastRatio(visual.brand_primary_color, visual.brand_font_color)} />
                    </div>
                    {visual.brand_secondary_color && (
                      <div className="rounded-lg border border-border p-4 space-y-1" style={{ backgroundColor: visual.brand_secondary_color }}>
                        <p className="text-sm font-semibold" style={{ color: visual.brand_font_color }}>Heading</p>
                        <p className="text-xs" style={{ color: visual.brand_font_color, opacity: 0.85 }}>Body text preview</p>
                        <ContrastBadge ratio={getContrastRatio(visual.brand_secondary_color, visual.brand_font_color)} />
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* ─── Business Identity ─── */}
            <Card>
              <CardHeader>
                <CardTitle>Business Identity</CardTitle>
                <CardDescription>Appears on invoices, folios, and guest communications.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Business Name</Label><Input value={config.business_name} onChange={e => setConfig(p => ({ ...p, business_name: e.target.value }))} placeholder={propertyName || "Your business name"} /></div>
                <div><Label>Custom Tagline</Label><Input value={config.custom_tagline} onChange={e => setConfig(p => ({ ...p, custom_tagline: e.target.value }))} placeholder="e.g. Where memories are made" /></div>
                <div><Label>VAT / Tax Number</Label><Input value={config.vat_number} onChange={e => setConfig(p => ({ ...p, vat_number: e.target.value }))} placeholder="e.g. VAT4870123456" /></div>
                <div className="flex items-center gap-3 pt-2">
                  <label className="flex items-center gap-2 text-sm cursor-pointer">
                    <input type="checkbox" checked={config.is_vat_registered} onChange={e => setConfig(p => ({ ...p, is_vat_registered: e.target.checked }))} className="rounded border-input" />
                    VAT Registered (Tax Invoice)
                  </label>
                </div>
                {config.is_vat_registered && (
                  <div><Label>VAT Rate (%)</Label><Input type="number" step="0.01" value={config.vat_rate} onChange={e => setConfig(p => ({ ...p, vat_rate: parseFloat(e.target.value) || 0 }))} placeholder="15" /></div>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Business Address</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Street</Label><Input value={addr.street || ""} onChange={e => setConfig(p => ({ ...p, business_address: { ...p.business_address, street: e.target.value } }))} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>City</Label><Input value={addr.city || ""} onChange={e => setConfig(p => ({ ...p, business_address: { ...p.business_address, city: e.target.value } }))} /></div>
                  <div><Label>State / Province</Label><Input value={addr.state || ""} onChange={e => setConfig(p => ({ ...p, business_address: { ...p.business_address, state: e.target.value } }))} /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><Label>Postal Code</Label><Input value={addr.postal || ""} onChange={e => setConfig(p => ({ ...p, business_address: { ...p.business_address, postal: e.target.value } }))} /></div>
                  <div><Label>Country</Label><Input value={addr.country || ""} onChange={e => setConfig(p => ({ ...p, business_address: { ...p.business_address, country: e.target.value } }))} /></div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle>Communications</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div><Label>Email Footer Text</Label><Textarea value={config.email_footer_text} onChange={e => setConfig(p => ({ ...p, email_footer_text: e.target.value }))} placeholder="Custom text at the bottom of guest emails" rows={3} /></div>
                <div>
                  <Label>Favicon</Label>
                  <p className="text-xs text-muted-foreground mb-2">Upload an image or paste a URL for your browser tab icon.</p>
                  {config.favicon_url && (
                    <div className="flex items-center gap-2 mb-2">
                      <img src={config.favicon_url} alt="Favicon" className="h-6 w-6 object-contain rounded border border-border" />
                      <span className="text-xs text-muted-foreground truncate max-w-[200px]">{config.favicon_url}</span>
                      <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => setConfig(p => ({ ...p, favicon_url: "" }))}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-xs font-medium hover:bg-accent transition-colors">
                      <Upload className="h-3 w-3" />
                      Upload
                      <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (!f) return;
                        if (f.size > 2 * 1024 * 1024) { toast.error("Max 2MB"); return; }
                        try {
                          const folder = propertyId || "new";
                          const fileName = `${folder}/favicon-${Date.now()}-${f.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
                          const { data: upData, error: upErr } = await supabase.storage.from("property-images").upload(fileName, f, { cacheControl: "3600", upsert: false });
                          if (upErr) throw upErr;
                          const { data: urlData } = supabase.storage.from("property-images").getPublicUrl(upData.path);
                          setConfig(p => ({ ...p, favicon_url: urlData.publicUrl }));
                          toast.success("Favicon uploaded");
                        } catch (err: any) { toast.error(err.message || "Upload failed"); }
                      }} />
                    </label>
                    <Input type="url" value={config.favicon_url} onChange={e => setConfig(p => ({ ...p, favicon_url: e.target.value }))} placeholder="https://example.com/favicon.ico" className="text-xs flex-1" />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* ─── Showcase Links ─── */}
            {(propertySlug || propertySlugLocal) && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Globe className="h-4 w-4 text-primary" /> Showcase Pages</CardTitle>
                  <CardDescription>View your property's public-facing pages on the booking platform.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Sleep in Africa Showcase</p>
                      <p className="text-xs text-muted-foreground truncate">Default SLP layout with RoomsOnline branding</p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
                      <a href={`https://book.sleepinafrica.roomsonline.co.za/property/${propertySlug || propertySlugLocal}`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        View
                      </a>
                    </Button>
                  </div>
                  <div className="flex items-center justify-between p-3 rounded-lg border border-border bg-muted/30">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">Branded Showcase Page</p>
                      <p className="text-xs text-muted-foreground truncate">Your property colours, logo & brand identity</p>
                    </div>
                    <Button variant="outline" size="sm" className="shrink-0 gap-1.5" asChild>
                      <a href={`https://book.sleepinafrica.roomsonline.co.za/property/${propertySlug || propertySlugLocal}?branded=true`} target="_blank" rel="noopener noreferrer">
                        <ExternalLink className="h-3.5 w-3.5" />
                        View
                      </a>
                    </Button>
                  </div>
                  {!visual.brand_primary_color && (
                    <div className="flex items-center gap-2 p-2 rounded-md bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0" />
                      <p className="text-xs text-amber-700">Set a primary colour above for the branded page to display your identity.</p>
                    </div>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Both pages use the SLP showcase layout and booking workflow. The branded version applies your colours and logo configured above via the <code className="font-mono">?branded=true</code> parameter.
                  </p>
                </CardContent>
              </Card>
            )}

            {/* ─── Review Platforms ─── */}
            <ReviewPlatformsCard propertyId={propertyId} />

            <Button onClick={handleSave} disabled={saving} className="w-full">
              <Save className="h-4 w-4 mr-2" />{saving ? "Saving…" : "Save Branding & Stationery"}
            </Button>
          </div>

          {/* ─── Live Preview Sidebar ─── */}
          <div className="space-y-4">
            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4" /> Live Preview</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="border border-border rounded-lg p-4 space-y-3" style={{ backgroundColor: visual.brand_secondary_color || undefined }}>
                  <div className="flex items-center gap-3">
                    {visual.brand_logo_url ? (
                      <img src={visual.brand_logo_url} alt={`${config.business_name || propertyName || "Property"} logo`} className="h-10 w-10 object-contain rounded" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                        {(config.business_name || propertyName || "P").charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-sm" style={{ color: visual.brand_font_color || undefined }}>{config.business_name || propertyName || "Property Name"}</p>
                      {config.custom_tagline && <p className="text-[10px] italic" style={{ color: visual.brand_font_color ? `${visual.brand_font_color}99` : undefined }}>{config.custom_tagline}</p>}
                    </div>
                  </div>
                  <Separator />
                  <div className="text-[10px] space-y-0.5" style={{ color: visual.brand_font_color ? `${visual.brand_font_color}aa` : undefined }}>
                    {addr.street && <p>{addr.street}</p>}
                    {(addr.city || addr.state) && <p>{[addr.city, addr.state].filter(Boolean).join(", ")} {addr.postal}</p>}
                    {addr.country && <p>{addr.country}</p>}
                    {config.vat_number && <p>VAT: {config.vat_number}</p>}
                  </div>
                </div>

                {/* Button preview */}
                {visual.brand_primary_color && (
                  <div className="flex gap-2">
                    <button className="px-3 py-1.5 rounded-md text-xs font-medium text-white" style={{ backgroundColor: visual.brand_primary_color }}>Book Now</button>
                    <button className="px-3 py-1.5 rounded-md text-xs font-medium border" style={{ borderColor: visual.brand_primary_color, color: visual.brand_primary_color }}>View Rooms</button>
                  </div>
                )}

                {/* Menu accent preview */}
                {visual.brand_accent_color && (
                  <div className="space-y-1">
                    <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Menu Accent Preview</p>
                    <div className="flex gap-2 items-center">
                      <div className="px-3 py-1.5 rounded-md text-xs font-medium" style={{ backgroundColor: visual.brand_accent_color, color: visual.brand_font_color || '#000' }}>
                        Active Menu
                      </div>
                      <span className="text-[10px] text-muted-foreground">Sidebar highlight</span>
                    </div>
                  </div>
                )}

                <div className="border border-border rounded-lg p-3 space-y-2">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Email Footer</p>
                  {config.email_footer_text && <p className="text-xs text-muted-foreground">{config.email_footer_text}</p>}
                  <Separator />
                  <PoweredByRolOS />
                </div>

                <div className="flex items-center gap-2">
                  <Badge variant={visual.brand_override_enabled ? "default" : "secondary"}>
                    {visual.brand_override_enabled ? "Brand Active" : "Default ROL Theme"}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Logo and colours sync bidirectionally with the Property Overview branding tab.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
        )}
      </div>
    </>
  );
}
