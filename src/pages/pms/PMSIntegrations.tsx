
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Code2, Link2, LayoutTemplate, Globe, Puzzle, Terminal, Sparkles, Blocks, Building2, ShieldCheck } from "lucide-react";
import { WhiteLabelDomainPanel } from "@/components/integrations/WhiteLabelDomainPanel";
import { useWhitelabel, usePortfolioWhitelabel } from "@/hooks/useWhitelabel";
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
import { GatedPaymentProviderSelect } from "@/components/integrations/GatedPaymentProviderSelect";
import { PortfolioWidgetTab } from "@/components/integrations/PortfolioWidgetTab";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function PMSIntegrations() {
  const { propertyId, properties, portfolioProperties, portfolioIds, loading: propertyLoading, switchProperty, showPortfolioToggle } = usePmsPropertyId();
  const [viewMode, setViewMode] = useState<"single" | "portfolio">("single");
  const wl = useWhitelabel(propertyId);

  const hasPortfolio = showPortfolioToggle;

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
    return <PmsPageSkeleton rows={4} />;
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
              Website widgets
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
            <Tabs defaultValue="smart_button" className="space-y-4">
              <div className="overflow-x-auto -mx-1 px-1 pb-1">
                <TabsList className="inline-flex w-max min-w-full">
                <TabsTrigger value="smart_button" className="gap-1.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5" />
                  Smart Button
                </TabsTrigger>
                <TabsTrigger value="portfolio_direct" className="gap-1.5 text-xs">
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
                <TabsTrigger value="portfolio_embed" className="gap-1.5 text-xs">
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
                <TabsTrigger value="portfolio_widget" className="gap-1.5 text-xs">
                  <Building2 className="h-3.5 w-3.5" />
                  Portfolio Widget
                </TabsTrigger>
                <TabsTrigger value="portfolio_payment" className="gap-1.5 text-xs">
                  <LayoutTemplate className="h-3.5 w-3.5" />
                  Payment
                </TabsTrigger>
                <TabsTrigger value="portfolio_domains" className="gap-1.5 text-xs">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Domains
                </TabsTrigger>
                </TabsList>
              </div>

              {/* Smart Button — per property */}
              <TabsContent value="smart_button" className="space-y-4">
                <PortfolioPerPropertyCards title="Smart Booking Buttons" description="Configure a smart booking button for each property.">
                  {(portfolioProperties || []).map((pp) => (
                    <PortfolioPropertyCard key={pp.id} name={pp.name}>
                      <SmartBookButtonGenerator property={{ id: pp.id, name: pp.name, slug: pp.slug || "", brand_primary_color: pp.brand_primary_color || null }} />
                    </PortfolioPropertyCard>
                  ))}
                </PortfolioPerPropertyCards>
              </TabsContent>

              {/* Direct Links */}
              <TabsContent value="portfolio_direct" className="space-y-4">
                <PortfolioDirectLinks propertyId={propertyId} portfolioIds={portfolioIds} portfolioProperties={portfolioProperties || []} />
                <PortfolioPerPropertyCards title="Direct Link Details" description="Full direct link configuration per property.">
                  {(portfolioProperties || []).map((pp) => (
                    <PortfolioPropertyCard key={pp.id} name={pp.name}>
                      <DirectLinkTab property={{ id: pp.id, name: pp.name, slug: pp.slug || "", brand_primary_color: pp.brand_primary_color || null }} />
                    </PortfolioPropertyCard>
                  ))}
                </PortfolioPerPropertyCards>
              </TabsContent>

              {/* Widget — per property */}
              <TabsContent value="widget" className="space-y-4">
                <PortfolioPerPropertyCards title="Booking Widgets" description="Configure an embeddable widget for each property.">
                  {(portfolioProperties || []).map((pp) => (
                    <PortfolioPropertyCard key={pp.id} name={pp.name}>
                      <WidgetTab property={{ id: pp.id, name: pp.name, slug: pp.slug || "", brand_primary_color: pp.brand_primary_color || null }} />
                    </PortfolioPropertyCard>
                  ))}
                </PortfolioPerPropertyCards>
              </TabsContent>

              {/* Booking Bar — per property */}
              <TabsContent value="bar" className="space-y-4">
                <PortfolioPerPropertyCards title="Booking Bars" description="Configure a booking bar for each property.">
                  {(portfolioProperties || []).map((pp) => (
                    <PortfolioPropertyCard key={pp.id} name={pp.name}>
                      <BookingBarTab property={{ id: pp.id, name: pp.name, slug: pp.slug || "", brand_primary_color: pp.brand_primary_color || null }} />
                    </PortfolioPropertyCard>
                  ))}
                </PortfolioPerPropertyCards>
              </TabsContent>

              {/* Full Embed */}
              <TabsContent value="portfolio_embed" className="space-y-4">
                <PortfolioFullEmbed propertyId={propertyId} portfolioProperties={portfolioProperties || []} />
                <PortfolioPerPropertyCards title="Full Embed Details" description="Full embed configuration per property.">
                  {(portfolioProperties || []).map((pp) => (
                    <PortfolioPropertyCard key={pp.id} name={pp.name}>
                      <FullEmbedTab property={{ id: pp.id, name: pp.name, slug: pp.slug || "", brand_primary_color: pp.brand_primary_color || null }} />
                    </PortfolioPropertyCard>
                  ))}
                </PortfolioPerPropertyCards>
              </TabsContent>

              {/* WordPress — per property */}
              <TabsContent value="wordpress" className="space-y-4">
                <PortfolioPerPropertyCards title="WordPress Integration" description="WordPress plugin setup for each property.">
                  {(portfolioProperties || []).map((pp) => (
                    <PortfolioPropertyCard key={pp.id} name={pp.name}>
                      <WordPressTab property={{ id: pp.id, name: pp.name, slug: pp.slug || "", brand_primary_color: pp.brand_primary_color || null }} />
                    </PortfolioPropertyCard>
                  ))}
                </PortfolioPerPropertyCards>
              </TabsContent>

              {/* Elementor — per property */}
              <TabsContent value="elementor" className="space-y-4">
                <PortfolioPerPropertyCards title="Elementor Integration" description="Elementor widget setup for each property.">
                  {(portfolioProperties || []).map((pp) => (
                    <PortfolioPropertyCard key={pp.id} name={pp.name}>
                      <ElementorTab property={{ id: pp.id, name: pp.name, slug: pp.slug || "", brand_primary_color: pp.brand_primary_color || null }} />
                    </PortfolioPropertyCard>
                  ))}
                </PortfolioPerPropertyCards>
              </TabsContent>

              {/* API — per property */}
              <TabsContent value="api" className="space-y-4">
                <PortfolioPerPropertyCards title="API Access" description="API credentials and documentation for each property.">
                  {(portfolioProperties || []).map((pp) => (
                    <PortfolioPropertyCard key={pp.id} name={pp.name}>
                      <ApiTab property={{ id: pp.id, name: pp.name, slug: pp.slug || "" }} />
                    </PortfolioPropertyCard>
                  ))}
                </PortfolioPerPropertyCards>
              </TabsContent>

              {/* Portfolio Widget */}
              <TabsContent value="portfolio_widget" className="space-y-4">
                <PortfolioWidgetTab property={property} />
              </TabsContent>

              {/* Payment — per property */}
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
                        <GatedPaymentProviderSelect propertyId={pp.id} />
                      </div>
                    ))}
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Domains — Portfolio-wide + WL subdomain per property */}
              <TabsContent value="portfolio_domains" className="space-y-4">
                <PortfolioDomainsSection portfolioId={portfolioIds[0]} portfolioProperties={portfolioProperties || []} />
              </TabsContent>
            </Tabs>
          </div>
        ) : (
          <>
            {/* Single Property Mode — existing behavior */}
            <Card className="bg-primary/5 border-primary/20">
              <CardContent className="py-4">
                <div className="flex items-center gap-3 flex-wrap">
                  <Badge variant="secondary" className="gap-1.5">
                    <Code2 className="h-3 w-3" />
                    {property.name}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    Slug: <code className="bg-muted px-1.5 py-0.5 rounded text-xs">{property.slug}</code>
                  </span>
                  {wl.enabled && (
                    <Badge variant="secondary" className="gap-1">
                      <ShieldCheck className="h-3 w-3" /> White-label mode
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>

            {wl.enabled && (
              <WhiteLabelDomainPanel
                propertyId={propertyId}
                currentDomain={wl.domain}
                currentStatus={wl.domainStatus}
                lastError={wl.lastError ?? null}
                inherited={!!wl.inherited}
                inheritedNote={
                  wl.inherited
                    ? `This subdomain is inherited from the parent portfolio. To change or remove it, open the portfolio's Integrations → Domains tab.`
                    : undefined
                }
              />
            )}


            <GatedPaymentProviderSelect propertyId={propertyId} />

            <Tabs defaultValue="smart_button" className="space-y-4">
              <div className="overflow-x-auto -mx-1 px-1 pb-1">
                <TabsList className="inline-flex w-max min-w-full">
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
                {crm.available && (
                  <TabsTrigger value="enquiry" className="gap-1.5 text-xs">
                    <MailQuestion className="h-3.5 w-3.5" />
                    Enquiry form
                  </TabsTrigger>
                )}
                <TabsTrigger value="portfolio" className="gap-1.5 text-xs">
                  <Building2 className="h-3.5 w-3.5" />
                  Portfolio
                </TabsTrigger>

                </TabsList>
              </div>

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
function PortfolioDirectLinks({
  propertyId,
  portfolioIds,
  portfolioProperties,
}: {
  propertyId: string;
  portfolioIds: string[];
  portfolioProperties: { id: string; name: string; slug?: string }[];
}) {
  const { toast } = useToast();
  const BASE = "https://sleepinafrica.roomsonline.co.za";

  const copy = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({ title: "Copied!", description: "Link copied to clipboard" });
  };

  // Fetch the portfolio slug so we can expose the single portfolio-level URL.
  const { data: portfolio } = useQuery({
    queryKey: ["pms-portfolio-slug", portfolioIds],
    queryFn: async () => {
      if (!portfolioIds || portfolioIds.length === 0) return null;
      const { data, error } = await supabase
        .from("property_portfolios" as any)
        .select("id, name, slug")
        .eq("id", portfolioIds[0])
        .maybeSingle();
      if (error) {
        console.error("[PortfolioDirectLinks] portfolio slug error:", error);
        return null;
      }
      return data as unknown as { id: string; name: string; slug: string | null } | null;
    },
    enabled: portfolioIds.length > 0,
    staleTime: 5 * 60 * 1000,
  });

  const portfolioUrl =
    portfolio?.slug ? `${BASE}/embed/portfolio/${portfolio.slug}?ref_portfolio=${portfolio.id}` : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm flex items-center gap-2">
          <Link2 className="h-4 w-4 text-primary" />
          Direct Booking Links
        </CardTitle>
        <CardDescription className="text-xs">
          One link opens the full portfolio booking page. Per-property links go straight to each property.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-2">
        {/* Portfolio-level direct link */}
        {portfolioUrl ? (
          <div className="flex items-center justify-between gap-3 rounded-md border border-primary/40 bg-primary/5 p-3">
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold flex items-center gap-1.5">
                <Building2 className="h-3 w-3 text-primary" />
                {portfolio?.name || "Portfolio"} · Portfolio Link
              </p>
              <code className="text-[11px] text-muted-foreground block truncate">{portfolioUrl}</code>
            </div>
            <div className="flex gap-1.5 shrink-0">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => copy(portfolioUrl)}>
                <Copy className="h-3 w-3" /> Copy
              </Button>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => window.open(portfolioUrl, "_blank")}>
                <ExternalLink className="h-3 w-3" />
              </Button>
            </div>
          </div>
        ) : portfolioIds.length > 0 ? (
          <div className="rounded-md border border-dashed p-3 text-[11px] text-muted-foreground">
            Portfolio direct link unavailable — this portfolio has no public slug yet. Set a slug in Portfolio settings to enable it.
          </div>
        ) : null}

        {/* Per-property direct links */}
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
  const BASE = "https://sleepinafrica.roomsonline.co.za";

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

/* Reusable wrapper for per-property card sections in portfolio mode */
function PortfolioPerPropertyCards({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs">{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {children}
      </CardContent>
    </Card>
  );
}

function PortfolioPropertyCard({ name, children }: { name: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3 border-b last:border-b-0 pb-6 last:pb-0">
      <h4 className="text-sm font-semibold flex items-center gap-1.5">
        <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
        {name}
      </h4>
      {children}
    </div>
  );
}

/* Portfolio-wide domain section: one shared subdomain for the whole portfolio,
   plus per-property override cards that show inherited status. */
function PortfolioDomainsSection({
  portfolioId,
  portfolioProperties,
}: {
  portfolioId: string | undefined;
  portfolioProperties: Array<{ id: string; name: string }>;
}) {
  const portfolioWl = usePortfolioWhitelabel(portfolioId);
  return (
    <div className="space-y-4">
      {portfolioId && (
        <WhiteLabelDomainPanel
          portfolioId={portfolioId}
          currentDomain={portfolioWl.domain}
          currentStatus={portfolioWl.domainStatus}
          lastError={portfolioWl.lastError ?? null}
          scopeLabel="Portfolio booking subdomain"
        />
      )}

      <PortfolioPerPropertyCards
        title="Per-property overrides"
        description="Each property inherits the portfolio subdomain. Configure a different one here only if a property should use its own domain."
      >
        {portfolioProperties.map((pp) => (
          <PortfolioPropertyCard key={pp.id} name={pp.name}>
            <PortfolioWhitelabelPanel propertyId={pp.id} portfolioWl={portfolioWl} />
          </PortfolioPropertyCard>
        ))}
      </PortfolioPerPropertyCards>
    </div>
  );
}

/* Per-property white-label panel wrapper — fetches WL state for each portfolio property */
function PortfolioWhitelabelPanel({
  propertyId,
  portfolioWl,
}: {
  propertyId: string;
  portfolioWl?: { domain: string | null; domainStatus: "unconfigured" | "pending" | "pending_ssl" | "active" | "failed" | "dns_ok_tls_pending" };
}) {
  const wl = useWhitelabel(propertyId);
  const usingInherited = wl.inherited && wl.domainStatus === "active";
  return (
    <div className="space-y-2">
      {!wl.enabled ? (
        <p className="text-xs text-muted-foreground italic">
          White-label is not enabled for this property by admin. A custom booking subdomain can only be configured once white-label mode is allowed.
        </p>
      ) : (
        <WhiteLabelDomainPanel
          propertyId={propertyId}
          currentDomain={wl.domain}
          currentStatus={wl.domainStatus}
          lastError={wl.lastError ?? null}
          inheritedNote={
            usingInherited
              ? `Inheriting the portfolio domain (${wl.domain}). Set a value below only to override.`
              : portfolioWl?.domainStatus === "active" && portfolioWl.domain
                ? `Portfolio domain available: ${portfolioWl.domain}. Leave blank to inherit.`
                : undefined
          }
        />
      )}
    </div>
  );
}

// Re-export needed icons for inline components
import { Copy, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { PmsPageSkeleton } from "@/components/pms/PmsPageSkeleton";
