
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Code2, Link2, LayoutTemplate, Globe, Puzzle, Terminal, Sparkles, Blocks, Building2 } from "lucide-react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { DirectLinkTab } from "@/components/integrations/DirectLinkTab";
import { WidgetTab } from "@/components/integrations/WidgetTab";
import { BookingBarTab } from "@/components/integrations/BookingBarTab";
import { FullEmbedTab } from "@/components/integrations/FullEmbedTab";
import { WordPressTab } from "@/components/integrations/WordPressTab";
import { ElementorTab } from "@/components/integrations/ElementorTab";
import { ApiTab } from "@/components/integrations/ApiTab";
import { IntegrationDocumentation } from "@/components/integrations/IntegrationDocumentation";
import { SmartBookButtonGenerator } from "@/components/integrations/SmartBookButtonGenerator";
import { PropertyPaymentProviderSelect } from "@/components/integrations/PropertyPaymentProviderSelect";
import { PortfolioWidgetTab } from "@/components/integrations/PortfolioWidgetTab";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function PMSIntegrations() {
  const { propertyId, properties, portfolioProperties, portfolioIds, loading: propertyLoading, switchProperty } = usePmsPropertyId();
  const [viewMode, setViewMode] = useState<"single" | "portfolio">("single");

  const hasPortfolio = (portfolioProperties?.length || 0) > 1;

  const { data: property, isLoading: propertyDataLoading } = useQuery({
    queryKey: ["pms-property-detail", propertyId],
    queryFn: async () => {
      if (!propertyId) return null;
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, slug, brand_primary_color")
        .eq("id", propertyId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!propertyId,
  });

  if (propertyLoading || propertyDataLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Loading property…</p>
      </div>
    );
  }

  if (!propertyId || !property) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Code2 className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-lg font-semibold">No ROL Property Found</h2>
        <p className="text-muted-foreground text-center max-w-md">
          Website integrations are available for properties using ROL'OS as their native PMS.
          Contact support to enable ROL'OS for your property.
        </p>
      </div>
    );
  }

  const isPortfolioMode = viewMode === "portfolio" && hasPortfolio;

  return (
    <>
      <div className="space-y-6">
        {/* Header with Property Selector & View Toggle */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Code2 className="h-6 w-6 text-primary" />
              Website Integrations
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isPortfolioMode
                ? "Configure portfolio-level integrations across all properties"
                : "Embed booking widgets, generate links, and connect your website to ROL'OS"}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {hasPortfolio && (
              <ToggleGroup
                type="single"
                value={viewMode}
                onValueChange={(v) => v && setViewMode(v as "single" | "portfolio")}
                className="bg-muted rounded-lg p-0.5"
              >
                <ToggleGroupItem value="single" className="text-xs gap-1.5 px-3 h-8 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                  <Code2 className="h-3.5 w-3.5" />
                  Property
                </ToggleGroupItem>
                <ToggleGroupItem value="portfolio" className="text-xs gap-1.5 px-3 h-8 data-[state=on]:bg-background data-[state=on]:shadow-sm">
                  <Building2 className="h-3.5 w-3.5" />
                  Portfolio
                </ToggleGroupItem>
              </ToggleGroup>
            )}

            {!isPortfolioMode && properties.length > 1 && (
              <Select value={propertyId} onValueChange={switchProperty}>
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Select property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Portfolio Mode */}
        {isPortfolioMode ? (
          <div className="space-y-6">
            {/* Portfolio Context */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="gap-1.5">
                    <Building2 className="h-3 w-3" />
                    Portfolio View
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {portfolioProperties?.length || 0} properties
                  </span>
                </div>
              </CardContent>
            </Card>

            {/* Portfolio Tabs */}
            <Tabs defaultValue="portfolio_widget" className="space-y-4">
              <TabsList className="w-full max-w-3xl">
                <TabsTrigger value="portfolio_widget" className="gap-1.5 text-xs">
                  <Building2 className="h-3.5 w-3.5" />
                  Portfolio Widget
                </TabsTrigger>
                <TabsTrigger value="portfolio_direct" className="gap-1.5 text-xs">
                  <Link2 className="h-3.5 w-3.5" />
                  Direct Link
                </TabsTrigger>
                <TabsTrigger value="portfolio_embed" className="gap-1.5 text-xs">
                  <Globe className="h-3.5 w-3.5" />
                  Full Embed
                </TabsTrigger>
                <TabsTrigger value="portfolio_payment" className="gap-1.5 text-xs">
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Payment
                </TabsTrigger>
              </TabsList>

              <TabsContent value="portfolio_widget" className="space-y-4">
                <PortfolioWidgetTab property={property} />
              </TabsContent>

              <TabsContent value="portfolio_direct" className="space-y-4">
                <PortfolioDirectLinks propertyId={propertyId} portfolioProperties={portfolioProperties || []} />
              </TabsContent>

              <TabsContent value="portfolio_embed" className="space-y-4">
                <PortfolioFullEmbed propertyId={propertyId} portfolioProperties={portfolioProperties || []} />
              </TabsContent>

              <TabsContent value="portfolio_payment" className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm">Payment Providers per Property</CardTitle>
                    <CardDescription className="text-xs">Configure payment gateways for each property in the portfolio.</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {(portfolioProperties || []).map((pp) => (
                      <div key={pp.id} className="space-y-2">
                        <h4 className="text-xs font-semibold flex items-center gap-1.5">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          {pp.name}
                        </h4>
                        <PropertyPaymentProviderSelect propertyId={pp.id} />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <>
            {/* Single Property Mode — existing behavior */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-4">
                <div className="flex items-center gap-3">
                  <Badge variant="secondary" className="gap-1.5">
                    <Code2 className="h-3 w-3" />
                    {property.name}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Slug: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{property.slug}</code>
                  </span>
                </div>
              </CardContent>
            </Card>

            <PropertyPaymentProviderSelect propertyId={propertyId} />

            <Tabs defaultValue="smart_button" className="space-y-4">
              <TabsList className="grid grid-cols-9 w-full max-w-5xl">
                <TabsTrigger value="smart_button" className="gap-1.5 text-xs relative smart-button-tab">
                  <Sparkles className="h-3.5 w-3.5" />
                  Smart Button
                  <span className="absolute -top-1 -right-1 flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-primary" />
                  </span>
                </TabsTrigger>
                <TabsTrigger value="direct" className="gap-1.5 text-xs">
                  <Link2 className="h-3.5 w-3.5" />
                  Direct Link
                </TabsTrigger>
                <TabsTrigger value="widget" className="gap-1.5 text-xs">
                  <Code2 className="h-3.5 w-3.5" />
                  Widget
                </TabsTrigger>
                <TabsTrigger value="bar" className="gap-1.5 text-xs">
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Booking Bar
                </TabsTrigger>
                <TabsTrigger value="full" className="gap-1.5 text-xs">
                  <Globe className="h-3.5 w-3.5" />
                  Full Embed
                </TabsTrigger>
                <TabsTrigger value="wordpress" className="gap-1.5 text-xs">
                  <Puzzle className="h-3.5 w-3.5" />
                  WordPress
                </TabsTrigger>
                <TabsTrigger value="elementor" className="gap-1.5 text-xs">
                  <Blocks className="h-3.5 w-3.5" />
                  Elementor
                </TabsTrigger>
                <TabsTrigger value="api" className="gap-1.5 text-xs">
                  <Terminal className="h-3.5 w-3.5" />
                  API
                </TabsTrigger>
                <TabsTrigger value="portfolio" className="gap-1.5 text-xs">
                  <Building2 className="h-3.5 w-3.5" />
                  Portfolio
                </TabsTrigger>
              </TabsList>

              <TabsContent value="smart_button" className="space-y-4">
                <SmartBookButtonGenerator property={property} />
              </TabsContent>

              <TabsContent value="direct" className="space-y-4">
                <DirectLinkTab property={property} />
                <IntegrationDocumentation type="direct" />
              </TabsContent>

              <TabsContent value="widget" className="space-y-4">
                <WidgetTab property={property} />
                <IntegrationDocumentation type="widget" />
              </TabsContent>

              <TabsContent value="bar" className="space-y-4">
                <BookingBarTab property={property} />
                <IntegrationDocumentation type="booking_bar" />
              </TabsContent>

              <TabsContent value="full" className="space-y-4">
                <FullEmbedTab property={property} />
                <IntegrationDocumentation type="full_embed" />
              </TabsContent>

              <TabsContent value="wordpress" className="space-y-4">
                <WordPressTab property={property} />
                <IntegrationDocumentation type="wordpress" />
              </TabsContent>

              <TabsContent value="elementor" className="space-y-4">
                <ElementorTab property={property} />
                <IntegrationDocumentation type="elementor" />
              </TabsContent>

              <TabsContent value="api" className="space-y-4">
                <ApiTab property={property} />
                <IntegrationDocumentation type="api" />
              </TabsContent>

              <TabsContent value="portfolio" className="space-y-4">
                <PortfolioWidgetTab property={property} />
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </>
  );
}

/* Portfolio Direct Links — lists each property's direct booking link */
function PortfolioDirectLinks({ propertyId, portfolioProperties }: { propertyId: string; portfolioProperties: { id: string; name: string; slug?: string }[] }) {
  const { toast } = useToast();
  const BASE = "https://book.sleepinafrica.roomsonline.co.za";

  const copy = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Copied!", description: "Link copied to clipboard" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          Direct Booking Links
        </CardTitle>
        <CardDescription className="text-xs">Direct links for each property in the portfolio.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {portfolioProperties.map((pp) => {
          const slug = (pp as any).slug;
          if (!slug) return null;
          const url = `${BASE}/embed/property/${slug}`;
          return (
            <div key={pp.id} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-medium">{pp.name}</p>
                <code className="text-[11px] text-muted-foreground block truncate">{url}</code>
              </div>
              <div className="flex gap-1.5 shrink-0">
                <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => copy(url)}>
                  <Copy className="h-3 w-3" /> Copy
                </Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => window.open(url, "_blank")}>
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

/* Portfolio Full Embed — iframe snippets for each property */
function PortfolioFullEmbed({ propertyId, portfolioProperties }: { propertyId: string; portfolioProperties: { id: string; name: string; slug?: string; brand_primary_color?: string | null }[] }) {
  const { toast } = useToast();
  const BASE = "https://book.sleepinafrica.roomsonline.co.za";

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: "Snippet copied to clipboard" });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Globe className="h-4 w-4 text-primary" />
          Full Embed Snippets
        </CardTitle>
        <CardDescription className="text-xs">Iframe embed code for each property in the portfolio.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {portfolioProperties.map((pp) => {
          const slug = (pp as any).slug;
          if (!slug) return null;
          const color = (pp as any).brand_primary_color || "#2563eb";
          const embedUrl = `${BASE}/embed/property/${slug}?brand_color=${encodeURIComponent(color)}&integration=portfolio_embed&mode=embedded`;
          const snippet = `<iframe src="${embedUrl}" style="width:100%;min-height:800px;border:none;border-radius:8px;" loading="lazy" allow="payment" title="${pp.name}"></iframe>`;
          return (
            <div key={pp.id} className="rounded-md border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium flex items-center gap-1.5">
                  <Building2 className="h-3 w-3 text-muted-foreground" />
                  {pp.name}
                </p>
                <Button variant="ghost" size="sm" className="h-6 text-xs gap-1" onClick={() => copy(snippet)}>
                  <Copy className="h-3 w-3" /> Copy
                </Button>
              </div>
              <pre className="bg-muted/50 border rounded-md p-2 text-[10px] font-mono overflow-x-auto whitespace-pre-wrap">{snippet}</pre>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// Re-export needed icons for inline components
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
