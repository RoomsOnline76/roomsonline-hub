import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Copy, ExternalLink, Building2, Check, Palette, Plus, Sparkles, RefreshCw, ShieldCheck, Link2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { WidgetPreviewFrame } from "./WidgetPreviewFrame";
import { useWhitelabel, usePortfolioWhitelabel } from "@/hooks/useWhitelabel";
import { PUBLIC_DOMAIN } from "@/lib/config";

interface PortfolioWidgetTabProps {
  property: {
    id: string;
    name: string;
    slug: string;
    brand_primary_color: string | null;
  };
}

export function PortfolioWidgetTab({ property }: PortfolioWidgetTabProps) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [selectedPortfolioId, setSelectedPortfolioId] = useState<string>("");
  const ROL_PINK = "#E91E8C";
  const [brandColor, setBrandColor] = useState(property.brand_primary_color || ROL_PINK);
  const [brandLogo, setBrandLogo] = useState("");
  const [layout, setLayout] = useState<"grid" | "list">("grid");
  const [copied, setCopied] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [aiTheme, setAiTheme] = useState("");
  const [refreshingAi, setRefreshingAi] = useState(false);
  

  // Fetch portfolios this property belongs to
  const { data: memberOf = [] } = useQuery({
    queryKey: ["property-portfolio-membership", property.id],
    queryFn: async () => {
      const { data: members } = await supabase
        .from("property_portfolio_members" as any)
        .select("portfolio_id")
        .eq("property_id", property.id);
      return (members || []) as any[];
    },
  });

  const { data: portfolios = [] } = useQuery({
    queryKey: ["portfolios-for-widget"],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_portfolios" as any)
        .select("*")
        .order("name");
      return (data || []) as any[];
    },
  });

  // Filter to portfolios this property is a member of
  const memberPortfolioIds = new Set(memberOf.map((m: any) => m.portfolio_id));
  const relevantPortfolios = portfolios.filter((p: any) => memberPortfolioIds.has(p.id));
  const allPortfolios = portfolios;

  useEffect(() => {
    if (!selectedPortfolioId && relevantPortfolios.length > 0) {
      setSelectedPortfolioId(relevantPortfolios[0].id);
    }
  }, [relevantPortfolios, selectedPortfolioId]);

  const selectedPortfolio = allPortfolios.find((p: any) => p.id === selectedPortfolioId);
  const portfolioSlug = selectedPortfolio?.slug || "my-portfolio";

  const wl = useWhitelabel(property.id);
  const portfolioWl = usePortfolioWhitelabel(selectedPortfolioId);
  // Prefer the portfolio's own verified WL domain when we're generating a
  // portfolio widget — otherwise fall back to the property's inherited host.
  const wlHost = portfolioWl.domainStatus === "active" ? portfolioWl.host : wl.host;
  const wlDomain = portfolioWl.domainStatus === "active" ? portfolioWl.domain : (wl.domainStatus === "active" ? wl.domain : null);
  const wlEligible = wl.enabled;

  // ---- Canonical: no brand params, no wl=1, always PUBLIC_DOMAIN ----
  const canonicalEmbedUrl = `${PUBLIC_DOMAIN}/embed/portfolio/${portfolioSlug}?layout=${layout}`;
  const canonicalDirectPortfolioUrl = selectedPortfolio
    ? `${PUBLIC_DOMAIN}/embed/portfolio/${portfolioSlug}?ref_portfolio=${selectedPortfolio.id}`
    : "";
  const canonicalSnippetDiv = `<div data-rolos-portfolio="${portfolioSlug}"${layout !== "grid" ? `\n     data-layout="${layout}"` : ""}></div>`;

  // ---- White-label: brand params + wl=1, WL host when active ----
  const wlBrandParams = `&brand_color=${encodeURIComponent(brandColor)}${brandLogo ? `&brand_logo=${encodeURIComponent(brandLogo)}` : ""}`;
  const wlBase = wlHost || PUBLIC_DOMAIN;
  const wlEmbedUrl = `${wlBase}/embed/portfolio/${portfolioSlug}?layout=${layout}${wlBrandParams}&wl=1&hide_powered_by=1`;
  const wlDirectPortfolioUrl = selectedPortfolio
    ? `${wlBase}/embed/portfolio/${portfolioSlug}?ref_portfolio=${selectedPortfolio.id}&wl=1&hide_powered_by=1${wlBrandParams}`
    : "";
  const wlSnippetDiv = `<div data-rolos-portfolio="${portfolioSlug}"${brandColor !== ROL_PINK ? `\n     data-brand-color="${brandColor}"` : ""}${brandLogo ? `\n     data-brand-logo="${brandLogo}"` : ""}${layout !== "grid" ? `\n     data-layout="${layout}"` : ""}\n     data-white-label="true"${wlDomain ? `\n     data-wl-host="https://${wlDomain}"` : ""}></div>`;

  const snippetScript = `<script src="https://widget.roomsonline.co.za/rol-embed.js"></script>`;
  const canonicalFullSnippet = `<!-- ROL'OS Portfolio Widget (canonical) -->\n${canonicalSnippetDiv}\n${snippetScript}`;
  const wlFullSnippet = `<!-- ROL'OS Portfolio Widget (white-label) -->\n${wlSnippetDiv}\n${snippetScript}`;
  const canonicalIframeSnippet = `<iframe src="${canonicalEmbedUrl}" style="width:100%;min-height:600px;border:none;border-radius:8px;" loading="lazy" allow="payment" title="Book with ROL'OS"></iframe>`;
  const wlIframeSnippet = `<iframe src="${wlEmbedUrl}" style="width:100%;min-height:600px;border:none;border-radius:8px;" loading="lazy" allow="payment" title="Book with ROL'OS"></iframe>`;

  // Preview uses PUBLIC_DOMAIN host so we don't depend on the customer's SSL/proxy;
  // the WL preview forwards WL params so the preview iframe renders in brand color.
  const canonicalPreviewUrl = canonicalEmbedUrl;
  const wlPreviewUrl = `${PUBLIC_DOMAIN}/embed/portfolio/${portfolioSlug}?layout=${layout}${wlBrandParams}&wl=1&hide_powered_by=1`;

  // For the "Direct Portfolio Link" panel above the previews, default to canonical.
  const directPortfolioUrl = canonicalDirectPortfolioUrl;


  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    toast({ title: "Copied!", description: "Snippet copied to clipboard" });
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            Portfolio Widget
            {wl.enabled && (
              <Badge variant="secondary" className="gap-1 text-xs ml-1">
                <ShieldCheck className="h-3 w-3" /> White-label
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            Embed a multi-property portal that lists all properties in a portfolio with search, filtering, and per-property booking.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Portfolio selector */}
          <div className="space-y-1.5">
            <Label className="text-xs">Select Portfolio</Label>
            <Select value={selectedPortfolioId} onValueChange={setSelectedPortfolioId}>
              <SelectTrigger className="text-sm">
                <SelectValue placeholder="Choose a portfolio…" />
              </SelectTrigger>
              <SelectContent>
                {relevantPortfolios.length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase">This property's portfolios</div>
                    {relevantPortfolios.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        <span className="text-muted-foreground ml-1">({p.slug})</span>
                      </SelectItem>
                    ))}
                  </>
                )}
                {allPortfolios.filter((p: any) => !memberPortfolioIds.has(p.id)).length > 0 && (
                  <>
                    <div className="px-2 py-1 text-[10px] font-medium text-muted-foreground uppercase mt-1">All portfolios</div>
                    {allPortfolios.filter((p: any) => !memberPortfolioIds.has(p.id)).map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                        <span className="text-muted-foreground ml-1">({p.slug})</span>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5 mt-1"
              onClick={() => navigate("/admin/portfolios")}
            >
              <Plus className="h-3.5 w-3.5" />
              Manage Portfolios
            </Button>
          </div>



          {/* Direct Portfolio Link — shareable URL to the full portfolio view */}
          {selectedPortfolioId && (
            <div className="space-y-1.5 rounded-lg border p-3 bg-muted/20">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium flex items-center gap-1.5">
                  <Link2 className="h-3.5 w-3.5 text-primary" />
                  Direct Portfolio Link
                </Label>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => copyToClipboard(directPortfolioUrl)}
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => window.open(directPortfolioUrl, "_blank")}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open
                  </Button>
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Shareable URL to the full portfolio view. Paste into "Book Now" buttons, emails,
                or social bios. Bookings originating here are attributed to this portfolio.
              </p>
              <pre className="bg-background border rounded-md p-2 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                {directPortfolioUrl}
              </pre>
            </div>
          )}

          {/* AI Controls */}
          <div className="space-y-3 rounded-lg border p-3 bg-muted/30">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <Label className="text-xs font-medium">AI Recommendations</Label>
              </div>
              <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
            </div>
            {aiEnabled && (
              <>
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">AI Theme Guidance</Label>
                  <Input
                    value={aiTheme}
                    onChange={(e) => setAiTheme(e.target.value)}
                    placeholder="e.g. Focus on romantic getaways and adventure"
                    className="text-xs h-8"
                  />
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 text-xs"
                  disabled={!selectedPortfolioId || refreshingAi}
                  onClick={async () => {
                    if (!selectedPortfolioId) return;
                    setRefreshingAi(true);
                    try {
                      // Find a property in this portfolio to call experience engine
                      const { data: members } = await supabase
                        .from("property_portfolio_members" as any)
                        .select("property_id")
                        .eq("portfolio_id", selectedPortfolioId)
                        .limit(1);
                      const propId = (members as any)?.[0]?.property_id;
                      if (propId) {
                        await supabase.functions.invoke("experience-engine", {
                          body: {
                            property_id: propId,
                            experience_type: "portfolio",
                            payload: { action: "recommend", portfolio_id: selectedPortfolioId, theme: aiTheme },
                          },
                        });
                        toast({ title: "AI Refreshed", description: "Portfolio recommendations regenerated" });
                      }
                    } catch {
                      toast({ title: "Error", description: "Failed to refresh AI suggestions", variant: "destructive" });
                    } finally {
                      setRefreshingAi(false);
                    }
                  }}
                >
                  <RefreshCw className={`h-3.5 w-3.5 ${refreshingAi ? "animate-spin" : ""}`} />
                  Refresh AI Suggestions
                </Button>
              </>
            )}
          </div>

          {/* Config controls */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs flex items-center gap-1">
                <Palette className="h-3 w-3" />
                Brand Color
              </Label>
              <div className="flex gap-1.5">
                <input
                  type="color"
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="h-8 w-10 rounded border cursor-pointer"
                />
                <Input
                  value={brandColor}
                  onChange={(e) => setBrandColor(e.target.value)}
                  className="text-xs h-8 font-mono"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Logo URL</Label>
              <Input
                value={brandLogo}
                onChange={(e) => setBrandLogo(e.target.value)}
                placeholder="https://..."
                className="text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Layout</Label>
              <Select value={layout} onValueChange={(v) => setLayout(v as "grid" | "list")}>
                <SelectTrigger className="text-xs h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="grid">Grid</SelectItem>
                  <SelectItem value="list">List</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Preview — Canonical + (optional) White-label side-by-side */}
          {selectedPortfolioId && (
            <div className={`grid gap-3 ${wlEligible ? "md:grid-cols-2" : "grid-cols-1"}`}>
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">Canonical preview (ROL pink)</Label>
                <WidgetPreviewFrame title="Canonical" url="yoursite.com/properties" height={360}>
                  <iframe src={canonicalPreviewUrl} className="w-full h-full border-none" title="Canonical portfolio preview" />
                </WidgetPreviewFrame>
              </div>
              {wlEligible && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">White-label preview (property brand)</Label>
                  <WidgetPreviewFrame title="White-label" url={wlDomain || "yoursite.com/properties"} height={360}>
                    <iframe src={wlPreviewUrl} className="w-full h-full border-none" title="White-label portfolio preview" />
                  </WidgetPreviewFrame>
                </div>
              )}
            </div>
          )}

          {/* Code snippets — Canonical always; White-label only when eligible */}
          {selectedPortfolioId && (
            <div className="space-y-4">
              {/* Canonical snippets */}
              <div className="space-y-3 rounded-lg border p-3">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">Canonical</Badge>
                  <span className="text-[11px] text-muted-foreground">
                    Uses <code className="font-mono">rolos.co.za</code> and ROL pink. Safe default for any site.
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">One-Line Snippet</Label>
                    <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copyToClipboard(canonicalFullSnippet)}>
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted/50 border rounded-md p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                    {canonicalFullSnippet}
                  </pre>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">Iframe Fallback</Label>
                    <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copyToClipboard(canonicalIframeSnippet)}>
                      <Copy className="h-3 w-3" />
                      Copy
                    </Button>
                  </div>
                  <pre className="bg-muted/50 border rounded-md p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                    {canonicalIframeSnippet}
                  </pre>
                </div>
                <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(canonicalEmbedUrl, "_blank")}>
                  <ExternalLink className="h-3.5 w-3.5" />
                  Test canonical in new tab
                </Button>
              </div>

              {/* White-label snippets */}
              {wlEligible && (
                <div className="space-y-3 rounded-lg border p-3 bg-primary/[0.03]">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary" className="gap-1 text-[10px]">
                      <ShieldCheck className="h-3 w-3" /> White-label
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">
                      Uses {wlDomain ? <code className="font-mono">{wlDomain}</code> : "the property brand host"} with brand color and logo.
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">One-Line Snippet</Label>
                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copyToClipboard(wlFullSnippet)}>
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
                    </div>
                    <pre className="bg-muted/50 border rounded-md p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                      {wlFullSnippet}
                    </pre>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Iframe Fallback</Label>
                      <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copyToClipboard(wlIframeSnippet)}>
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
                    </div>
                    <pre className="bg-muted/50 border rounded-md p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                      {wlIframeSnippet}
                    </pre>
                  </div>
                  <Button variant="outline" size="sm" className="gap-1.5" onClick={() => window.open(wlEmbedUrl, "_blank")}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Test white-label in new tab
                  </Button>
                </div>
              )}
            </div>
          )}


          {!selectedPortfolioId && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              Select a portfolio above to generate embed code and preview.
            </div>
          )}
        </CardContent>
      </Card>

      {/* Portfolio Origin Tracking */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Portfolio Origin Tracking
          </CardTitle>
          <CardDescription className="text-xs">
            Drop this tag on your portfolio landing page so any booking made afterwards is
            attributed to the portfolio for cross-property revenue share.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {relevantPortfolios.length === 0 ? (
            <div className="text-center py-6 text-xs text-muted-foreground space-y-2">
              <p>This property isn't part of any portfolio yet.</p>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => navigate("/admin/portfolios")}
              >
                <Plus className="h-3.5 w-3.5" />
                Join a portfolio
              </Button>
            </div>
          ) : (
            relevantPortfolios.map((p: any) => {
              const scriptTag = `<!-- ROL'OS Portfolio Origin Tag -->\n<script>\n  (function () {\n    try {\n      sessionStorage.setItem('rol_origin_portfolio_id', '${p.id}');\n      sessionStorage.setItem('rol_origin_url', window.location.href);\n    } catch (e) {}\n  })();\n</script>`;
              const linkDecorator = `${BASE}/embed/portfolio/${p.slug}?ref_portfolio=${p.id}`;
              const moduleCall = `import { setOriginPortfolio } from '@rolos/origin';\nsetOriginPortfolio('${p.id}');`;

              return (
                <div key={p.id} className="space-y-3 rounded-lg border p-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-sm font-medium">{p.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono">{p.id}</div>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Drop-in Script Tag</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => copyToClipboard(scriptTag)}
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Paste into the <code className="font-mono">&lt;head&gt;</code> of your portfolio landing page.
                    </p>
                    <pre className="bg-muted/50 border rounded-md p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                      {scriptTag}
                    </pre>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Link Decorator</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => copyToClipboard(linkDecorator)}
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Append <code className="font-mono">?ref_portfolio=…</code> to any booking link
                      so origin survives new tabs/sessions.
                    </p>
                    <pre className="bg-muted/50 border rounded-md p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                      {linkDecorator}
                    </pre>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Module Call (React / TS)</Label>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 text-xs gap-1"
                        onClick={() => copyToClipboard(moduleCall)}
                      >
                        <Copy className="h-3 w-3" />
                        Copy
                      </Button>
                    </div>
                    <pre className="bg-muted/50 border rounded-md p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                      {moduleCall}
                    </pre>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}

