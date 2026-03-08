import { PMSLayout } from "@/components/layout/PMSLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Code2, Link2, LayoutTemplate, Globe, Puzzle, Terminal, Sparkles } from "lucide-react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { DirectLinkTab } from "@/components/integrations/DirectLinkTab";
import { WidgetTab } from "@/components/integrations/WidgetTab";
import { BookingBarTab } from "@/components/integrations/BookingBarTab";
import { FullEmbedTab } from "@/components/integrations/FullEmbedTab";
import { WordPressTab } from "@/components/integrations/WordPressTab";
import { ApiTab } from "@/components/integrations/ApiTab";
import { IntegrationDocumentation } from "@/components/integrations/IntegrationDocumentation";
import { SmartBookButtonGenerator } from "@/components/integrations/SmartBookButtonGenerator";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export default function PMSIntegrations() {
  const { propertyId, properties, loading: propertyLoading, switchProperty } = usePmsPropertyId();

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
      <PMSLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <p className="text-muted-foreground">Loading property…</p>
        </div>
      </PMSLayout>
    );
  }

  if (!propertyId || !property) {
    return (
      <PMSLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
          <Code2 className="h-12 w-12 text-muted-foreground" />
          <h2 className="text-lg font-semibold">No ROL Property Found</h2>
          <p className="text-muted-foreground text-center max-w-md">
            Website integrations are available for properties using ROL'OS as their native PMS.
            Contact support to enable ROL'OS for your property.
          </p>
        </div>
      </PMSLayout>
    );
  }

  return (
    <PMSLayout>
      <div className="space-y-6">
        {/* Header with Property Selector */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Code2 className="h-6 w-6 text-primary" />
              Website Integrations
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Embed booking widgets, generate links, and connect your website to ROL'OS
            </p>
          </div>

          {properties.length > 1 && (
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

        {/* Property Context Card */}
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

        {/* Integration Tabs */}
        <Tabs defaultValue="direct" className="space-y-4">
          <TabsList className="grid grid-cols-7 w-full max-w-4xl">
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
            <TabsTrigger value="smart_button" className="gap-1.5 text-xs">
              <Sparkles className="h-3.5 w-3.5" />
              Smart Button
            </TabsTrigger>
            <TabsTrigger value="wordpress" className="gap-1.5 text-xs">
              <Puzzle className="h-3.5 w-3.5" />
              WordPress
            </TabsTrigger>
            <TabsTrigger value="api" className="gap-1.5 text-xs">
              <Terminal className="h-3.5 w-3.5" />
              API
            </TabsTrigger>
          </TabsList>

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

          <TabsContent value="api" className="space-y-4">
            <ApiTab property={property} />
            <IntegrationDocumentation type="api" />
          </TabsContent>
        </Tabs>
      </div>
    </PMSLayout>
  );
}
