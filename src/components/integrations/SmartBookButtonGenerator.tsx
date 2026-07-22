import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CodeSnippetBlock } from "./CodeSnippetBlock";
import { Sparkles, Globe, Code2, Puzzle, LayoutTemplate, Eye, MousePointerClick, CalendarDays, Monitor, Layers, Building2, Home } from "lucide-react";

import { EntryPointSelector, buildEntryUrl, type EntryPointOptions } from "./EntryPointSelector";
import { useWhitelabel } from "@/hooks/useWhitelabel";
import { PUBLIC_DOMAIN } from "@/lib/config";
import { ShieldCheck } from "lucide-react";

interface SmartBookButtonGeneratorProps {
  property: {
    id: string;
    name: string;
    slug: string;
    brand_primary_color: string | null;
  };
}

type SolutionType = "button" | "button_dates" | "widget" | "combo";
type Platform = "html" | "wordpress" | "wix" | "squarespace";
type ButtonSize = "small" | "medium" | "large";
type ButtonStyle = "solid" | "outline" | "pill";

const SOLUTIONS: { value: SolutionType; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "button", label: "Book Now Button", icon: <MousePointerClick className="h-5 w-5" />, desc: "Simple styled link to your booking page" },
  { value: "button_dates", label: "Button + Date Pickers", icon: <CalendarDays className="h-5 w-5" />, desc: "Booking bar with check-in/out dates" },
  { value: "widget", label: "Embedded Widget", icon: <Monitor className="h-5 w-5" />, desc: "Full inline booking engine in an iframe" },
  { value: "combo", label: "Button + Widget Combo", icon: <Layers className="h-5 w-5" />, desc: "Button reveals a hidden booking widget on click" },
];

const PLATFORMS: { value: Platform; label: string; icon: React.ReactNode; desc: string }[] = [
  { value: "html", label: "Custom HTML", icon: <Code2 className="h-5 w-5" />, desc: "Any website with HTML access" },
  { value: "wordpress", label: "WordPress", icon: <Puzzle className="h-5 w-5" />, desc: "Self-hosted or WordPress.com" },
  { value: "wix", label: "Wix", icon: <LayoutTemplate className="h-5 w-5" />, desc: "Wix Editor or Wix Studio" },
  { value: "squarespace", label: "Squarespace", icon: <Globe className="h-5 w-5" />, desc: "Squarespace page builder" },
];

const SIZE_MAP: Record<ButtonSize, { padding: string; fontSize: string; label: string }> = {
  small: { padding: "8px 16px", fontSize: "14px", label: "Small" },
  medium: { padding: "12px 24px", fontSize: "16px", label: "Medium" },
  large: { padding: "16px 32px", fontSize: "18px", label: "Large" },
};

const STYLE_MAP: Record<ButtonStyle, string> = {
  solid: "Solid",
  outline: "Outline",
  pill: "Pill",
};

export function SmartBookButtonGenerator({ property }: SmartBookButtonGeneratorProps) {
  const defaultColor = property.brand_primary_color || "#e91e8c";

  const [solutionType, setSolutionType] = useState<SolutionType>("button");
  const [platform, setPlatform] = useState<Platform>("html");
  const [buttonText, setButtonText] = useState("Book Now");
  const [buttonColor, setButtonColor] = useState(defaultColor);
  const [buttonSize, setButtonSize] = useState<ButtonSize>("medium");
  const [buttonStyle, setButtonStyle] = useState<ButtonStyle>("solid");
  const [openNewTab, setOpenNewTab] = useState(true);
  const [entryOpts, setEntryOpts] = useState<EntryPointOptions>({ entryPoint: "rooms" });
  const [target, setTarget] = useState<"property" | "portfolio">("property");
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("");

  // Sync color when property data loads/changes
  useEffect(() => {
    if (property.brand_primary_color) {
      setButtonColor(property.brand_primary_color);
    }
  }, [property.brand_primary_color]);

  const wl = useWhitelabel(property.id);
  const wlOpts = wl.enabled ? { enabled: true, host: wl.host } : undefined;

  // Portfolios this property is a member of
  const { data: memberOf = [] } = useQuery({
    queryKey: ["smart-btn-portfolio-membership", property.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_portfolio_members" as any)
        .select("portfolio_id, property_portfolios:portfolio_id(id, name, slug)")
        .eq("property_id", property.id);
      return (data || []) as any[];
    },
  });
  const availablePortfolios = memberOf
    .map((m: any) => m.property_portfolios)
    .filter((p: any): p is { id: string; name: string; slug: string } => !!p?.id);
  const hasPortfolios = availablePortfolios.length > 0;

  useEffect(() => {
    if (!selectedPortfolioId && availablePortfolios.length > 0) {
      setSelectedPortfolioId(availablePortfolios[0].id);
    }
  }, [availablePortfolios, selectedPortfolioId]);
  useEffect(() => {
    if (!hasPortfolios && target === "portfolio") setTarget("property");
  }, [hasPortfolios, target]);

  const selectedPortfolio = availablePortfolios.find((p) => p.id === selectedPortfolioId);
  const BASE = wl.host || PUBLIC_DOMAIN;
  const wlParam = wl.enabled ? "&wl=1&hide_powered_by=1" : "";

  const propertyBookingUrl = buildEntryUrl(property, entryOpts, {
    source: "website",
    integration: "smart_button",
    property_id: property.id,
    brand_color: buttonColor,
  }, wlOpts);
  const propertyEmbedUrl = buildEntryUrl(property, { entryPoint: "rooms" }, {
    integration: "smart_widget",
    property_id: property.id,
    brand_color: buttonColor,
  }, wlOpts);

  const portfolioBookingUrl = selectedPortfolio
    ? `${BASE}/embed/portfolio/${selectedPortfolio.slug}?ref_portfolio=${selectedPortfolio.id}&integration=smart_button&brand_color=${encodeURIComponent(buttonColor)}${wlParam}`
    : propertyBookingUrl;
  const portfolioEmbedUrl = selectedPortfolio
    ? `${BASE}/embed/portfolio/${selectedPortfolio.slug}?ref_portfolio=${selectedPortfolio.id}&integration=smart_widget&brand_color=${encodeURIComponent(buttonColor)}${wlParam}`
    : propertyEmbedUrl;

  const isPortfolio = target === "portfolio" && !!selectedPortfolio;
  const bookingUrl = isPortfolio ? portfolioBookingUrl : propertyBookingUrl;
  const embedUrl = isPortfolio ? portfolioEmbedUrl : propertyEmbedUrl;
  const targetLabel = isPortfolio ? selectedPortfolio!.name : property.name;
  const linkTarget = openNewTab ? ' target="_blank" rel="noopener noreferrer"' : "";

  const size = SIZE_MAP[buttonSize];

  const showButtonCustomisation = solutionType === "button" || solutionType === "button_dates" || solutionType === "combo";
  const showPlatform = solutionType === "button" || solutionType === "button_dates";

  const inlineStyles = useMemo(() => {
    const base = `display:inline-block;font-family:inherit;font-weight:600;text-decoration:none;text-align:center;cursor:pointer;transition:opacity 0.2s;padding:${size.padding};font-size:${size.fontSize};`;
    switch (buttonStyle) {
      case "solid":
        return `${base}background-color:${buttonColor};color:#ffffff;border:none;border-radius:6px;`;
      case "outline":
        return `${base}background-color:transparent;color:${buttonColor};border:2px solid ${buttonColor};border-radius:6px;`;
      case "pill":
        return `${base}background-color:${buttonColor};color:#ffffff;border:none;border-radius:9999px;`;
    }
  }, [buttonColor, buttonStyle, size]);

  // Generate code based on solution type
  const generatedCode = useMemo(() => {
    if (solutionType === "button") {
      const htmlSnippet = `<a href="${bookingUrl}"${linkTarget} style="${inlineStyles}">${buttonText}</a>`;
      if (platform === "wordpress") {
        return `<!-- Option 1: Paste in a Custom HTML block -->
${htmlSnippet}

<!-- Option 2: Shortcode — add to functions.php -->
<?php
function rolos_book_button_shortcode() {
    return '${htmlSnippet.replace(/'/g, "\\'")}';
}
add_shortcode('rolos_button', 'rolos_book_button_shortcode');
?>
<!-- Then use [rolos_button] anywhere -->`;
      }
      return htmlSnippet;
    }

    if (solutionType === "button_dates") {
      return `<!-- RoomsOnline Booking Bar -->
<div id="rolos-booking-bar" style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 16px;background:${buttonColor};border-radius:8px;font-family:system-ui,-apple-system,sans-serif;">
  <label style="color:#fff;font-size:13px;font-weight:500;">
    Check-in
    <input type="date" id="rolos-checkin" style="margin-left:4px;padding:6px 10px;border:none;border-radius:4px;font-size:14px;" />
  </label>
  <label style="color:#fff;font-size:13px;font-weight:500;">
    Check-out
    <input type="date" id="rolos-checkout" style="margin-left:4px;padding:6px 10px;border:none;border-radius:4px;font-size:14px;" />
  </label>
  <button onclick="(function(){
    var ci=document.getElementById('rolos-checkin').value;
    var co=document.getElementById('rolos-checkout').value;
    var url='${bookingUrl}';
    if(ci) url+='&checkin='+ci;
    if(co) url+='&checkout='+co;
    window.open(url,'_blank');
  })()" style="background:#fff;color:${buttonColor};border:none;padding:${size.padding};border-radius:6px;font-weight:700;font-size:${size.fontSize};cursor:pointer;">
    ${buttonText}
  </button>
</div>`;
    }

    if (solutionType === "widget") {
      return `<!-- RoomsOnline Embedded Booking Widget -->
<div id="rolos-booking-widget" style="width:100%;max-width:900px;">
  <iframe 
    src="${embedUrl}" 
    style="width:100%;min-height:700px;border:none;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);"
    title="Book ${targetLabel}"
    loading="lazy"
    allow="payment">
  </iframe>
</div>`;
    }

    if (solutionType === "combo") {
      return `<!-- RoomsOnline Book Button + Hidden Widget -->
<a href="#" id="rolos-toggle-btn" onclick="(function(e){
  e.preventDefault();
  var w=document.getElementById('rolos-hidden-widget');
  if(w.style.display==='none'){w.style.display='block';w.scrollIntoView({behavior:'smooth'});}
  else{w.style.display='none';}
})(event)" style="${inlineStyles}">${buttonText}</a>

<div id="rolos-hidden-widget" style="display:none;margin-top:16px;width:100%;max-width:900px;">
  <iframe 
    src="${embedUrl}" 
    style="width:100%;min-height:700px;border:none;border-radius:8px;box-shadow:0 2px 12px rgba(0,0,0,0.08);"
    title="Book ${targetLabel}"
    loading="lazy"
    allow="payment">
  </iframe>
</div>`;
    }

    return "";
  }, [solutionType, platform, bookingUrl, embedUrl, target, inlineStyles, buttonText, buttonColor, size, property.name]);

  // Live preview styles
  const previewStyle: React.CSSProperties = useMemo(() => {
    const base: React.CSSProperties = {
      display: "inline-block",
      fontWeight: 600,
      textDecoration: "none",
      textAlign: "center",
      cursor: "pointer",
      transition: "opacity 0.2s",
      padding: size.padding,
      fontSize: size.fontSize,
      fontFamily: "inherit",
    };
    switch (buttonStyle) {
      case "solid":
        return { ...base, backgroundColor: buttonColor, color: "#ffffff", border: "none", borderRadius: "6px" };
      case "outline":
        return { ...base, backgroundColor: "transparent", color: buttonColor, border: `2px solid ${buttonColor}`, borderRadius: "6px" };
      case "pill":
        return { ...base, backgroundColor: buttonColor, color: "#ffffff", border: "none", borderRadius: "9999px" };
    }
  }, [buttonColor, buttonStyle, size]);

  const platformInstructions = useMemo(() => {
    if (solutionType === "widget") return "Paste the iframe code on any page where you want the full booking experience to appear. Guests complete the entire flow without leaving your site.";
    if (solutionType === "combo") return "Paste both the button and widget code. The button can go anywhere; the widget container should be below it. Clicking the button reveals/hides the booking widget.";
    if (solutionType === "button_dates") return "Paste the bar code where you want the date pickers to appear (e.g. a header or footer). Guests select dates and are redirected to complete the booking.";
    switch (platform) {
      case "html": return "Paste the code snippet anywhere in your HTML where you want the button to appear.";
      case "wordpress": return 'Option 1: Add a "Custom HTML" block and paste. Option 2: Add the PHP shortcode to functions.php, then use [rolos_button].';
      case "wix": return 'In the Wix Editor, click "Add" → "Embed Code" → "Embed HTML". Paste the code below.';
      case "squarespace": return 'Add a "Code Block" (not Markdown). Paste the code below. Uncheck "Display Source".';
    }
  }, [solutionType, platform]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-primary" />
            <div>
              <h3 className="font-semibold">Smart Integration Generator</h3>
              <p className="text-sm text-muted-foreground">
                Choose your integration type and customise for <strong>{property.name}</strong>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Step 0: Solution Type */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">1</Badge>
            What do you need?
          </CardTitle>
          <CardDescription className="text-xs">Pick the integration type that fits your website</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2">
            {SOLUTIONS.map((s) => (
              <button
                key={s.value}
                onClick={() => setSolutionType(s.value)}
                className={`flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all ${
                  solutionType === s.value
                    ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                    : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                }`}
              >
                <div className={`shrink-0 ${solutionType === s.value ? "text-primary" : "text-muted-foreground"}`}>
                  {s.icon}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-medium leading-tight">{s.label}</div>
                  <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{s.desc}</div>
                </div>
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        {/* Entry Point Selector — spans full width */}
        <div className="lg:col-span-2">
          <EntryPointSelector propertyId={property.id} value={entryOpts} onChange={setEntryOpts} />
        </div>

        {/* Left: Configuration */}
        <div className="space-y-5">
          {/* Platform (only for button / button_dates) */}
          {showPlatform && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">2</Badge>
                  Website Platform
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-2">
                  {PLATFORMS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => setPlatform(p.value)}
                      className={`flex items-center gap-2.5 rounded-lg border p-3 text-left transition-all ${
                        platform === p.value
                          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                          : "border-border hover:border-muted-foreground/30 hover:bg-muted/30"
                      }`}
                    >
                      <div className={`shrink-0 ${platform === p.value ? "text-primary" : "text-muted-foreground"}`}>
                        {p.icon}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium leading-tight">{p.label}</div>
                        <div className="text-[11px] text-muted-foreground leading-tight mt-0.5">{p.desc}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Customize */}
          {showButtonCustomisation && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">{showPlatform ? "3" : "2"}</Badge>
                  Customize
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label className="text-xs">Button Text</Label>
                  <Input value={buttonText} onChange={(e) => setButtonText(e.target.value)} placeholder="Book Now" className="h-9" />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Button Color</Label>
                  <div className="flex items-center gap-2">
                    <input type="color" value={buttonColor} onChange={(e) => setButtonColor(e.target.value)} className="h-9 w-9 rounded border border-border cursor-pointer" />
                    <Input value={buttonColor} onChange={(e) => setButtonColor(e.target.value)} className="h-9 font-mono text-xs flex-1" placeholder="#e91e8c" />
                  </div>
                </div>

                {solutionType !== "button_dates" && (
                  <>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Size</Label>
                      <RadioGroup value={buttonSize} onValueChange={(v) => setButtonSize(v as ButtonSize)} className="flex gap-3">
                        {(Object.entries(SIZE_MAP) as [ButtonSize, typeof SIZE_MAP[ButtonSize]][]).map(([key, val]) => (
                          <label key={key} className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-all ${buttonSize === key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                            <RadioGroupItem value={key} className="h-3 w-3" /> {val.label}
                          </label>
                        ))}
                      </RadioGroup>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Style</Label>
                      <RadioGroup value={buttonStyle} onValueChange={(v) => setButtonStyle(v as ButtonStyle)} className="flex gap-3">
                        {(Object.entries(STYLE_MAP) as [ButtonStyle, string][]).map(([key, label]) => (
                          <label key={key} className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-all ${buttonStyle === key ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                            <RadioGroupItem value={key} className="h-3 w-3" /> {label}
                          </label>
                        ))}
                      </RadioGroup>
                    </div>
                  </>
                )}

                {solutionType === "button" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs">Opens in</Label>
                    <RadioGroup value={openNewTab ? "new" : "same"} onValueChange={(v) => setOpenNewTab(v === "new")} className="flex gap-3">
                      <label className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-all ${openNewTab ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                        <RadioGroupItem value="new" className="h-3 w-3" /> New Tab
                      </label>
                      <label className={`flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs cursor-pointer transition-all ${!openNewTab ? "border-primary bg-primary/5" : "border-border hover:bg-muted/30"}`}>
                        <RadioGroupItem value="same" className="h-3 w-3" /> Same Tab
                      </label>
                    </RadioGroup>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Widget-only: color picker */}
          {(solutionType === "widget") && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">2</Badge>
                  Brand Colour
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center gap-2">
                  <input type="color" value={buttonColor} onChange={(e) => setButtonColor(e.target.value)} className="h-9 w-9 rounded border border-border cursor-pointer" />
                  <Input value={buttonColor} onChange={(e) => setButtonColor(e.target.value)} className="h-9 font-mono text-xs flex-1" placeholder="#e91e8c" />
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Right: Preview + Output */}
        <div className="space-y-5">
          {/* Live Preview */}
          {(solutionType === "button" || solutionType === "combo") && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" /> Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-dashed border-border bg-background p-6 mb-3">
                  <p className="text-xs text-muted-foreground mb-3">On light background:</p>
                  <div className="flex items-center justify-center min-h-[60px]">
                    <span style={previewStyle}>{buttonText || "Book Now"}</span>
                  </div>
                </div>
                <div className="rounded-lg border border-dashed border-border bg-zinc-900 p-6">
                  <p className="text-xs text-zinc-400 mb-3">On dark background:</p>
                  <div className="flex items-center justify-center min-h-[60px]">
                    <span style={previewStyle}>{buttonText || "Book Now"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Bar preview */}
          {solutionType === "button_dates" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" /> Live Preview
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg overflow-hidden" style={{ backgroundColor: buttonColor }}>
                  <div className="flex items-center gap-3 p-3 flex-wrap">
                    <label className="text-white text-xs font-medium flex items-center gap-1">
                      Check-in <input type="date" className="ml-1 px-2 py-1 rounded text-xs text-foreground" />
                    </label>
                    <label className="text-white text-xs font-medium flex items-center gap-1">
                      Check-out <input type="date" className="ml-1 px-2 py-1 rounded text-xs text-foreground" />
                    </label>
                    <span className="bg-white font-bold text-xs px-4 py-1.5 rounded" style={{ color: buttonColor }}>{buttonText || "Book Now"}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Widget preview */}
          {solutionType === "widget" && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Eye className="h-3.5 w-3.5 text-muted-foreground" /> Preview
                </CardTitle>
                <CardDescription className="text-xs">
                  The full booking engine will render inside the iframe with availability calendar, room types, and checkout.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-lg border border-dashed border-border bg-muted/30 p-8 text-center">
                  <Monitor className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">Full NightsBridge-style booking widget</p>
                  <p className="text-xs text-muted-foreground/60 mt-1">Room availability · Rate grid · Checkout — all inline</p>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Generated Code */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Badge variant="secondary" className="h-5 w-5 p-0 flex items-center justify-center text-[10px]">
                  {solutionType === "widget" ? "3" : showPlatform ? "4" : "3"}
                </Badge>
                Generated Code
                {showPlatform && (
                  <Badge variant="outline" className="ml-auto text-[10px] font-normal">
                    {PLATFORMS.find((p) => p.value === platform)?.label}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">{platformInstructions}</CardDescription>
            </CardHeader>
            <CardContent>
              <CodeSnippetBlock
                code={generatedCode}
                language={platform === "wordpress" && solutionType === "button" ? "php" : "html"}
                title={`${SOLUTIONS.find((s) => s.value === solutionType)?.label} Code`}
              />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
