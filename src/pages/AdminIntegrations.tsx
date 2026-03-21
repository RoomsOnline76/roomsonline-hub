import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Link2, Code2, LayoutTemplate, Globe, Puzzle, Terminal, BarChart3, Sparkles, Blocks } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DirectLinkTab } from "@/components/integrations/DirectLinkTab";
import { WidgetTab } from "@/components/integrations/WidgetTab";
import { BookingBarTab } from "@/components/integrations/BookingBarTab";
import { FullEmbedTab } from "@/components/integrations/FullEmbedTab";
import { WordPressTab } from "@/components/integrations/WordPressTab";
import { ApiTab } from "@/components/integrations/ApiTab";
import { IntegrationAnalytics } from "@/components/integrations/IntegrationAnalytics";
import { DomainWhitelist } from "@/components/integrations/DomainWhitelist";
import { SmartBookButtonGenerator } from "@/components/integrations/SmartBookButtonGenerator";
import { WidgetSetupWizard } from "@/components/integrations/WidgetSetupWizard";
import { PropertyPaymentProviderSelect } from "@/components/integrations/PropertyPaymentProviderSelect";
import { PayFastEnvironmentToggle } from "@/components/integrations/PayFastEnvironmentToggle";

interface Property {
  id: string;
  name: string;
  slug: string;
  brand_primary_color: string | null;
  brand_logo_url: string | null;
}

export default function AdminIntegrations() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedProperty, setSelectedProperty] = useState<string>(searchParams.get("property") || "");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchProperties = async () => {
      const { data: profileData } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .single();

      if (!profileData) return;

      const { data: ownedProps } = await supabase
        .from("properties")
        .select("id, name, slug, brand_primary_color, brand_logo_url")
        .eq("owner_email", profileData.email)
        .eq("is_active", true)
        .order("name");

      const { data: linkedProps } = await supabase
        .from("property_owners")
        .select("property_id, properties(id, name, slug, brand_primary_color, brand_logo_url)")
        .eq("user_id", user.id);

      const allProps = [
        ...(ownedProps || []),
        ...(linkedProps?.map((lp: any) => lp.properties).filter(Boolean) || []),
      ];

      const unique = Array.from(new Map(allProps.map((p) => [p.id, p])).values());
      setProperties(unique);
      if (!selectedProperty && unique.length > 0) {
        setSelectedProperty(unique[0].id);
      }
      setLoading(false);
    };
    fetchProperties();
  }, [user]);

  useEffect(() => {
    if (selectedProperty) {
      setSearchParams({ property: selectedProperty });
    }
  }, [selectedProperty]);

  const currentProperty = properties.find((p) => p.id === selectedProperty);

  return (
    <AppLayout>
      <div className="container mx-auto py-6 space-y-6 max-w-5xl">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Website Integrations</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Connect your property website to the booking engine
            </p>
          </div>
          <Select value={selectedProperty} onValueChange={setSelectedProperty}>
            <SelectTrigger className="w-[280px]">
              <SelectValue placeholder="Select a property" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {!selectedProperty && !loading ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              Select a property above to configure integrations.
            </CardContent>
          </Card>
        ) : selectedProperty && currentProperty ? (
          <div className="space-y-6">
            {/* PayFast Environment Toggle */}
            <PayFastEnvironmentToggle />

            {/* Per-Property Payment Provider */}
            <PropertyPaymentProviderSelect propertyId={selectedProperty} />

            {/* Analytics overview */}
            <IntegrationAnalytics propertyId={selectedProperty} />

            {/* Integration tabs */}
            <Tabs defaultValue="direct" className="space-y-4">
              <TabsList className="grid w-full grid-cols-7">
                <TabsTrigger value="direct" className="flex items-center gap-1.5 text-xs">
                  <Link2 className="h-3.5 w-3.5" /> Direct Link
                </TabsTrigger>
                <TabsTrigger value="widget" className="flex items-center gap-1.5 text-xs">
                  <Code2 className="h-3.5 w-3.5" /> Widget
                </TabsTrigger>
                <TabsTrigger value="booking_bar" className="flex items-center gap-1.5 text-xs">
                  <LayoutTemplate className="h-3.5 w-3.5" /> Booking Bar
                </TabsTrigger>
                <TabsTrigger value="full_embed" className="flex items-center gap-1.5 text-xs">
                  <Globe className="h-3.5 w-3.5" /> Full Embed
                </TabsTrigger>
                <TabsTrigger value="smart_button" className="flex items-center gap-1.5 text-xs">
                  <Sparkles className="h-3.5 w-3.5" /> Smart Button
                </TabsTrigger>
                <TabsTrigger value="wordpress" className="flex items-center gap-1.5 text-xs">
                  <Puzzle className="h-3.5 w-3.5" /> WordPress
                </TabsTrigger>
                <TabsTrigger value="api" className="flex items-center gap-1.5 text-xs">
                  <Terminal className="h-3.5 w-3.5" /> API
                </TabsTrigger>
              </TabsList>

              <TabsContent value="direct">
                <DirectLinkTab property={currentProperty} />
              </TabsContent>
              <TabsContent value="widget">
                <div className="space-y-4">
                  <WidgetSetupWizard property={currentProperty} />
                  <WidgetTab property={currentProperty} />
                  <DomainWhitelist propertyId={selectedProperty} integrationType="widget" />
                </div>
              </TabsContent>
              <TabsContent value="booking_bar">
                <div className="space-y-4">
                  <BookingBarTab property={currentProperty} />
                  <DomainWhitelist propertyId={selectedProperty} integrationType="booking_bar" />
                </div>
              </TabsContent>
              <TabsContent value="full_embed">
                <div className="space-y-4">
                  <FullEmbedTab property={currentProperty} />
                  <DomainWhitelist propertyId={selectedProperty} integrationType="full_embed" />
                </div>
              </TabsContent>
              <TabsContent value="smart_button">
                <SmartBookButtonGenerator property={currentProperty} />
              </TabsContent>
              <TabsContent value="wordpress">
                <WordPressTab property={currentProperty} showPushUpdate={true} />
              </TabsContent>
              <TabsContent value="api">
                <ApiTab property={currentProperty} />
              </TabsContent>
            </Tabs>
          </div>
        ) : null}
      </div>
    </AppLayout>
  );
}
