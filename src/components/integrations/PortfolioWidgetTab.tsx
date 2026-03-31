import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Switch } from "@/components/ui/switch";
import { Copy, ExternalLink, Building2, Check, Palette, Plus, Sparkles, RefreshCw } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { WidgetPreviewFrame } from "./WidgetPreviewFrame";

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
  const [brandColor, setBrandColor] = useState(property.brand_primary_color || "#2563eb");
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

  const selectedPortfolio = allPortfolios.find((p: any) => p.id === selectedPortfolioId);
  const portfolioSlug = selectedPortfolio?.slug || "my-portfolio";

  const BASE = "https://book.sleepinafrica.roomsonline.co.za";
  const embedUrl = `${BASE}/embed/portfolio/${portfolioSlug}?brand_color=${encodeURIComponent(brandColor)}${brandLogo ? `&brand_logo=${encodeURIComponent(brandLogo)}` : ""}&layout=${layout}`;

  const snippetDiv = `<div data-rolos-portfolio="${portfolioSlug}"${brandColor !== "#2563eb" ? `\n     data-brand-color="${brandColor}"` : ""}${brandLogo ? `\n     data-brand-logo="${brandLogo}"` : ""}${layout !== "grid" ? `\n     data-layout="${layout}"` : ""}></div>`;

  const snippetScript = `<script src="https://widget.roomsonline.co.za/rol-embed.js"></script>`;

  const fullSnippet = `<!-- ROL'OS Portfolio Widget -->\n${snippetDiv}\n${snippetScript}`;

  const iframeSnippet = `<iframe src="${embedUrl}" style="width:100%;min-height:600px;border:none;border-radius:8px;" loading="lazy" allow="payment" title="Book with ROL'OS"></iframe>`;

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

          {/* Preview */}
          {selectedPortfolioId && (
            <WidgetPreviewFrame
              title="Portfolio Widget Preview"
              url={`yoursite.com/properties`}
              height={360}
            >
              <iframe
                src={embedUrl}
                className="w-full h-full border-none"
                title="Portfolio preview"
              />
            </WidgetPreviewFrame>
          )}

          {/* Code snippets */}
          {selectedPortfolioId && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">One-Line Snippet</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => copyToClipboard(fullSnippet)}
                  >
                    {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    Copy
                  </Button>
                </div>
                <pre className="bg-muted/50 border rounded-md p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                  {fullSnippet}
                </pre>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-medium">Iframe Fallback</Label>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs gap-1"
                    onClick={() => copyToClipboard(iframeSnippet)}
                  >
                    <Copy className="h-3 w-3" />
                    Copy
                  </Button>
                </div>
                <pre className="bg-muted/50 border rounded-md p-3 text-[11px] font-mono overflow-x-auto whitespace-pre-wrap">
                  {iframeSnippet}
                </pre>
              </div>

              <Button
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() => window.open(embedUrl, "_blank")}
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Test in New Tab
              </Button>
            </div>
          )}

          {!selectedPortfolioId && (
            <div className="text-center py-8 text-xs text-muted-foreground">
              Select a portfolio above to generate embed code and preview.
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
