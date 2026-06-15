import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Code2, Link2, LayoutTemplate, Globe, Puzzle, Terminal, ExternalLink, Sparkles, Blocks, Building2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PushToRentalsUnited } from "./PushToRentalsUnited";
import { useNavigate } from "react-router-dom";
import { DirectLinkTab } from "@/components/integrations/DirectLinkTab";
import { WidgetTab } from "@/components/integrations/WidgetTab";
import { BookingBarTab } from "@/components/integrations/BookingBarTab";
import { FullEmbedTab } from "@/components/integrations/FullEmbedTab";
import { WordPressTab } from "@/components/integrations/WordPressTab";
import { ElementorTab } from "@/components/integrations/ElementorTab";
import { ApiTab } from "@/components/integrations/ApiTab";
import { IntegrationDocumentation } from "@/components/integrations/IntegrationDocumentation";
import { SmartBookButtonGenerator } from "@/components/integrations/SmartBookButtonGenerator";
import { WidgetSetupWizard } from "@/components/integrations/WidgetSetupWizard";
import { GatedPaymentProviderSelect } from "@/components/integrations/GatedPaymentProviderSelect";
import { PortfolioWidgetTab } from "@/components/integrations/PortfolioWidgetTab";

interface PropertyFormIntegrationsTabProps {
  property: {
    id: string;
    name: string;
    slug: string;
    brand_primary_color: string | null;
  };
}

export function PropertyFormIntegrationsTab({ property }: PropertyFormIntegrationsTabProps) {
  const navigate = useNavigate();

  return (
    <div className="space-y-4">
      {/* Push to Rentals United */}
      <PushToRentalsUnited propertyId={property.id} propertyName={property.name} />

      {/* Payment Provider */}
      <PropertyPaymentProviderSelect propertyId={property.id} />

      {/* Header */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Code2 className="h-5 w-5 text-primary" />
              <div>
                <h3 className="font-semibold">Website Integration Toolkit</h3>
                <p className="text-sm text-muted-foreground">
                  Embed booking widgets and connect your website to ROL'OS
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => navigate(`/pms/integrations?property=${property.id}`)}
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Full Management
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Integration Tabs */}
      <Tabs defaultValue="smart_button" className="space-y-4">
        <TabsList className="grid grid-cols-9 w-full">
          <TabsTrigger value="smart_button" className="gap-1.5 text-xs relative">
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
          <WidgetSetupWizard property={property} />
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
    </div>
  );
}
