import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Palette, Save, Eye } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { usePMSBrand } from "@/contexts/PMSBrandContext";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";
import { hexToHsl, autoForeground } from "@/lib/brandOverride";

interface BrandConfig {
  business_name: string;
  business_address: { street?: string; city?: string; state?: string; postal?: string; country?: string };
  vat_number: string;
  email_footer_text: string;
  custom_tagline: string;
  favicon_url: string;
}

const defaultConfig: BrandConfig = {
  business_name: "",
  business_address: {},
  vat_number: "",
  email_footer_text: "",
  custom_tagline: "",
  favicon_url: "",
};

export default function PMSBranding() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property");
  const { propertyName, logoUrl, primaryColor, brandEnabled } = usePMSBrand();
  const [config, setConfig] = useState<BrandConfig>(defaultConfig);
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!propertyId) return;
    (async () => {
      const { data } = await supabase
        .from("rolos_brand_config" as any)
        .select("*")
        .eq("property_id", propertyId)
        .maybeSingle();
      if (data) {
        const d = data as any;
        setConfig({
          business_name: d.business_name || "",
          business_address: d.business_address || {},
          vat_number: d.vat_number || "",
          email_footer_text: d.email_footer_text || "",
          custom_tagline: d.custom_tagline || "",
          favicon_url: d.favicon_url || "",
        });
      }
      setLoaded(true);
    })();
  }, [propertyId]);

  const handleSave = async () => {
    if (!propertyId) return;
    setSaving(true);
    try {
      const payload = {
        property_id: propertyId,
        business_name: config.business_name || null,
        business_address: config.business_address,
        vat_number: config.vat_number || null,
        email_footer_text: config.email_footer_text || null,
        custom_tagline: config.custom_tagline || null,
        favicon_url: config.favicon_url || null,
      };

      const { error } = await supabase
        .from("rolos_brand_config" as any)
        .upsert(payload as any, { onConflict: "property_id" });

      if (error) throw error;
      toast.success("Branding & stationery saved");
    } catch (e: any) {
      toast.error(e.message || "Failed to save");
    }
    setSaving(false);
  };

  if (!propertyId) return <PMSLayout><p className="text-muted-foreground">Select a property first.</p></PMSLayout>;

  const addr = config.business_address;

  return (
    <PMSLayout>
      <div className="space-y-6 max-w-4xl">
        <div className="flex items-center gap-3">
          <Palette className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-bold tracking-tight">Branding & Stationery</h1>
        </div>

        <div className="grid lg:grid-cols-3 gap-6">
          {/* Config Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Business Identity</CardTitle>
                <CardDescription>This information appears on invoices, folios, and guest communications.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Business Name</Label>
                  <Input value={config.business_name} onChange={e => setConfig(p => ({ ...p, business_name: e.target.value }))} placeholder={propertyName || "Your business name"} />
                </div>
                <div>
                  <Label>Custom Tagline</Label>
                  <Input value={config.custom_tagline} onChange={e => setConfig(p => ({ ...p, custom_tagline: e.target.value }))} placeholder="e.g. Where memories are made" />
                </div>
                <div>
                  <Label>VAT / Tax Number</Label>
                  <Input value={config.vat_number} onChange={e => setConfig(p => ({ ...p, vat_number: e.target.value }))} placeholder="e.g. VAT4870123456" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Business Address</CardTitle>
              </CardHeader>
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
              <CardHeader>
                <CardTitle>Communications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Email Footer Text</Label>
                  <Textarea value={config.email_footer_text} onChange={e => setConfig(p => ({ ...p, email_footer_text: e.target.value }))} placeholder="Custom text that appears at the bottom of guest emails" rows={3} />
                </div>
                <div>
                  <Label>Favicon URL</Label>
                  <Input value={config.favicon_url} onChange={e => setConfig(p => ({ ...p, favicon_url: e.target.value }))} placeholder="https://..." />
                </div>
              </CardContent>
            </Card>

            <Button onClick={handleSave} disabled={saving} className="w-full">
              <Save className="h-4 w-4 mr-2" />{saving ? "Saving..." : "Save Branding & Stationery"}
            </Button>
          </div>

          {/* Live Preview */}
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Eye className="h-4 w-4" /> Live Preview</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Header Preview */}
                <div className="border border-border rounded-lg p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    {logoUrl ? (
                      <img src={logoUrl} alt="" className="h-10 w-10 object-contain rounded" />
                    ) : (
                      <div className="h-10 w-10 rounded bg-primary/20 flex items-center justify-center text-primary font-bold text-sm">
                        {(config.business_name || propertyName || "P").charAt(0)}
                      </div>
                    )}
                    <div>
                      <p className="font-semibold text-sm">{config.business_name || propertyName || "Property Name"}</p>
                      {config.custom_tagline && <p className="text-[10px] text-muted-foreground italic">{config.custom_tagline}</p>}
                    </div>
                  </div>
                  <Separator />
                  <div className="text-[10px] text-muted-foreground space-y-0.5">
                    {addr.street && <p>{addr.street}</p>}
                    {(addr.city || addr.state) && <p>{[addr.city, addr.state].filter(Boolean).join(", ")} {addr.postal}</p>}
                    {addr.country && <p>{addr.country}</p>}
                    {config.vat_number && <p>VAT: {config.vat_number}</p>}
                  </div>
                </div>

                {/* Footer Preview */}
                <div className="border border-border rounded-lg p-3 space-y-2">
                  <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Email Footer</p>
                  {config.email_footer_text && <p className="text-xs text-muted-foreground">{config.email_footer_text}</p>}
                  <Separator />
                  <PoweredByRolOS />
                </div>

                {/* Brand status */}
                <div className="flex items-center gap-2">
                  <Badge variant={brandEnabled ? "default" : "secondary"}>
                    {brandEnabled ? "Brand Active" : "Default ROL Theme"}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Visual branding (logo, colors) is managed in your property's settings under the Branding tab.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </PMSLayout>
  );
}
