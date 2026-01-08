import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, CheckCircle2, AlertCircle, Loader2, Save, ChevronDown, ChevronRight, Database, ArrowRight, Eye } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { pmsFieldDefinitions, availableInternalFields, getPMSFieldConfig, PMSFieldConfig, PMSDataCategory } from "@/config/pmsFieldMappings";

interface PMSCredentials {
  id: string;
  system_type: string;
  environment: string;
  is_active: boolean;
}

interface Property {
  id: string;
  name: string;
  external_system: string | null;
  [key: string]: any;
}

export default function PMSConfig() {
  const navigate = useNavigate();
  const { systemType } = useParams<{ systemType: string }>();
  const { toast } = useToast();
  
  const [pmsConfig, setPmsConfig] = useState<PMSFieldConfig | null>(null);
  const [credentials, setCredentials] = useState<PMSCredentials | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [ownerCredentials, setOwnerCredentials] = useState<any[]>([]);
  const [selectedOwnerId, setSelectedOwnerId] = useState<string>("");
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingExternal, setFetchingExternal] = useState(false);
  
  // Store fetched PMS data
  const [pmsData, setPmsData] = useState<Record<string, any[]>>({});

  // Field mappings state - maps externalField to internalField per category
  const [fieldMappings, setFieldMappings] = useState<Record<string, Record<string, string>>>({});

  // Open state for collapsibles
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (systemType) {
      const config = getPMSFieldConfig(systemType);
      if (config) {
        setPmsConfig(config);
        // Initialize open state for first category
        const initialOpen: Record<string, boolean> = {};
        config.categories.forEach((cat, idx) => {
          initialOpen[cat.id] = idx === 0;
        });
        setOpenCategories(initialOpen);
      }
      loadData();
    }
  }, [systemType]);

  useEffect(() => {
    if (selectedPropertyId && pmsConfig) {
      loadFieldMappings();
    }
  }, [selectedPropertyId, pmsConfig]);

  const loadData = async () => {
    if (!systemType) return;
    
    setLoading(true);
    try {
      // Fetch credentials for this PMS
      const { data: creds } = await supabase
        .from("pms_credentials")
        .select("*")
        .eq("system_type", systemType)
        .eq("is_active", true)
        .single();
      
      if (creds) {
        setCredentials(creds);
      }

      // For Hostfully, fetch owner credentials instead of properties directly
      if (systemType === 'hostfully') {
        const { data: owners } = await supabase
          .from("owner_pms_credentials")
          .select("*, profiles(full_name, email)")
          .eq("system_type", "hostfully")
          .eq("is_active", true)
          .order("created_at", { ascending: false });

        if (owners && owners.length > 0) {
          setOwnerCredentials(owners);
        }
      } else {
        // For other PMS systems, fetch properties directly
        const { data: props } = await supabase
          .from("properties")
          .select("*")
          .eq("external_system", systemType)
          .eq("is_active", true)
          .order("name");

        if (props && props.length > 0) {
          setProperties(props);
          if (!selectedPropertyId) {
            setSelectedPropertyId(props[0].id);
          }
        }
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setLoading(false);
  };

  // Load properties when owner is selected (for Hostfully)
  useEffect(() => {
    if (systemType === 'hostfully' && selectedOwnerId) {
      loadOwnerProperties(selectedOwnerId);
    }
  }, [selectedOwnerId]);

  const loadOwnerProperties = async (ownerId: string) => {
    const { data: props } = await supabase
      .from("properties")
      .select("*")
      .eq("owner_pms_credential_id", ownerId)
      .eq("is_active", true)
      .order("name");

    setProperties(props || []);
    setSelectedPropertyId("");
    setPmsData({});
  };

  const loadFieldMappings = async () => {
    if (!selectedPropertyId || !systemType || !pmsConfig) return;

    const { data, error } = await supabase
      .from("pms_mappings")
      .select("*")
      .eq("property_id", selectedPropertyId)
      .eq("system_type", systemType)
      .eq("mapping_type", "field_mappings");

    if (data && data.length > 0) {
      const savedMappings = data[0].metadata as any;
      if (savedMappings?.fieldMappings) {
        setFieldMappings(savedMappings.fieldMappings);
      }
    } else {
      // Initialize with default mappings
      const defaultMappings: Record<string, Record<string, string>> = {};
      pmsConfig.categories.forEach(cat => {
        defaultMappings[cat.id] = {};
        cat.fields.forEach(field => {
          defaultMappings[cat.id][field.externalField] = field.internalField;
        });
      });
      setFieldMappings(defaultMappings);
    }
  };

  const fetchExternalTypes = async () => {
    // For Hostfully, we only need the owner selected (not a property)
    if (systemType === 'hostfully') {
      if (!selectedOwnerId) {
        toast({
          title: "Missing configuration",
          description: "Please select an owner",
          variant: "destructive",
        });
        return;
      }

      setFetchingExternal(true);
      try {
        // Fetch ALL properties using paginated list_all_properties action
        const { data, error } = await supabase.functions.invoke('hostfully-api', {
          body: {
            action: 'list_all_properties',
            owner_credential_id: selectedOwnerId,
          },
        });

        if (error) throw error;

        if (data?.success) {
          setPmsData({
            properties: data.data?.properties || [],
            raw_response: data.data,
          });
          toast({
            title: "Data fetched",
            description: `Found ${data.data?.total_count || 0} properties from Hostfully`,
          });
        } else {
          throw new Error(data?.error || 'Failed to fetch properties');
        }
      } catch (error: any) {
        toast({
          title: "Error fetching data",
          description: error.message,
          variant: "destructive",
        });
      }
      setFetchingExternal(false);
      return;
    }

    // For other PMS systems, require property selection
    if (!selectedPropertyId || !pmsConfig) {
      toast({
        title: "Missing configuration",
        description: "Please select a property",
        variant: "destructive",
      });
      return;
    }

    const selectedProperty = properties.find(p => p.id === selectedPropertyId);
    if (!selectedProperty) {
      toast({
        title: "Property not found",
        description: "Could not find the selected property",
        variant: "destructive",
      });
      return;
    }

    const propertyUid = selectedProperty.hostfully_property_uid || selectedProperty.external_id;
    
    setFetchingExternal(true);
    try {
      const fetchedData: Record<string, any> = {};
      
      // For other PMS systems, use the generic fetch_types if supported
      const { data, error } = await supabase.functions.invoke(pmsConfig.edgeFunctionName, {
        body: {
          action: "get_room_types",
          property_id: selectedPropertyId,
        },
      });

      if (error) throw error;
      Object.assign(fetchedData, data.data || data);

      setPmsData(fetchedData);

      toast({
        title: "Data fetched",
        description: `Successfully fetched data from ${pmsConfig.displayName}`,
      });
    } catch (error: any) {
      toast({
        title: "Error fetching data",
        description: error.message,
        variant: "destructive",
      });
    }
    setFetchingExternal(false);
  };

  const saveFieldMappings = async () => {
    if (!selectedPropertyId || !systemType) return;
    
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("pms_mappings")
        .select("id")
        .eq("property_id", selectedPropertyId)
        .eq("system_type", systemType)
        .eq("mapping_type", "field_mappings")
        .eq("external_id", "field_config")
        .single();

      const mappingData = {
        property_id: selectedPropertyId,
        system_type: systemType,
        mapping_type: "field_mappings",
        external_id: "field_config",
        external_name: "Field Mappings Configuration",
        metadata: { fieldMappings } as any,
        is_active: true,
      };

      let error;
      if (existing?.id) {
        const result = await supabase
          .from("pms_mappings")
          .update(mappingData)
          .eq("id", existing.id);
        error = result.error;
      } else {
        const result = await supabase
          .from("pms_mappings")
          .insert(mappingData);
        error = result.error;
      }

      if (error) throw error;

      toast({ title: "Mappings saved successfully" });
    } catch (error: any) {
      toast({
        title: "Error saving mappings",
        description: error.message,
        variant: "destructive",
      });
    }
    setSaving(false);
  };

  const updateFieldMapping = (categoryId: string, externalField: string, internalField: string) => {
    setFieldMappings(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        [externalField]: internalField,
      },
    }));
  };

  const toggleCategory = (categoryId: string) => {
    setOpenCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
  };

  if (!systemType || !pmsConfig) {
    return (
      <AppLayout>
        <PageHeader title="PMS Configuration" subtitle="Invalid system type" />
        <div className="flex items-center justify-center py-12">
          <Button onClick={() => navigate("/admin/api-keys")}>Back to Integrations</Button>
        </div>
      </AppLayout>
    );
  }

  if (loading) {
    return (
      <AppLayout>
        <PageHeader title={`${pmsConfig.displayName} Field Mappings`} subtitle="Loading..." />
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title={`${pmsConfig.displayName} Field Mappings`}
        subtitle={`Map ${pmsConfig.displayName} data to internal fields`}
      />
      <div className="max-w-5xl mx-auto">

        {/* Connection Status */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Connection Status
              {credentials?.is_active ? (
                <Badge className="bg-green-500">
                  <CheckCircle2 className="h-3 w-3 mr-1" />
                  Connected
                </Badge>
              ) : (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  Not Connected
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {credentials 
                ? `Using ${credentials.environment} environment` 
                : `Configure ${pmsConfig.displayName} credentials in Integrations page`}
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Owner Selection (for Hostfully) */}
        {systemType === 'hostfully' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Select Owner</CardTitle>
              <CardDescription>
                Choose a Hostfully owner to view their properties
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ownerCredentials.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No Hostfully owners found. Create an owner with Hostfully credentials first.
                </div>
              ) : (
              <div className="flex items-center gap-4">
                <Select value={selectedOwnerId} onValueChange={setSelectedOwnerId}>
                  <SelectTrigger className="w-[400px]">
                    <SelectValue placeholder="Select an owner" />
                  </SelectTrigger>
                  <SelectContent>
                    {ownerCredentials.map(owner => (
                      <SelectItem key={owner.id} value={owner.id}>
                        {owner.profiles?.full_name || owner.profiles?.email || owner.external_account_name || 'Unknown Owner'}
                        {owner.external_account_name && ` (${owner.external_account_name})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={fetchExternalTypes}
                  disabled={!selectedOwnerId || fetchingExternal}
                >
                  {fetchingExternal ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Fetch Properties
                </Button>
              </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Property Selection - hide for Hostfully as we fetch from API */}
        {systemType !== 'hostfully' && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Select Property</CardTitle>
              <CardDescription>
                Choose a property to configure field mappings for
              </CardDescription>
            </CardHeader>
            <CardContent>
              {properties.length === 0 ? (
                <div className="text-sm text-muted-foreground">
                  No properties found using {pmsConfig.displayName}. 
                  <Button variant="link" className="px-1" onClick={() => navigate("/admin/properties/new")}>
                    Create a property
                  </Button>
                  with {pmsConfig.displayName} as the external system.
                </div>
              ) : (
                <div className="flex items-center gap-4">
                  <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                    <SelectTrigger className="w-[300px]">
                      <SelectValue placeholder="Select a property" />
                    </SelectTrigger>
                    <SelectContent>
                      {properties.map(property => (
                        <SelectItem key={property.id} value={property.id}>
                          {property.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    onClick={fetchExternalTypes}
                    disabled={!selectedPropertyId || fetchingExternal}
                  >
                    {fetchingExternal ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Fetch External Data
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Data Explorer for Hostfully - show when we have fetched data */}
        {systemType === 'hostfully' && Object.keys(pmsData).length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="h-5 w-5" />
                Hostfully Properties Data
              </CardTitle>
              <CardDescription>
                Raw data from Hostfully API for the selected owner
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[400px] rounded border">
                <pre className="p-4 text-xs font-mono">
                  {JSON.stringify(pmsData, null, 2)}
                </pre>
              </ScrollArea>
            </CardContent>
          </Card>
        )}

        {/* Field Mappings - show for all PMS types */}
        {(systemType === 'hostfully' ? selectedOwnerId : selectedPropertyId) && (
          <Tabs defaultValue="mappings" className="mb-6">
            <TabsList>
              <TabsTrigger value="mappings">Field Mappings</TabsTrigger>
              {systemType !== 'hostfully' && (
                <TabsTrigger value="data">
                  <Eye className="h-4 w-4 mr-2" />
                  Data Explorer
                </TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="mappings" className="space-y-4">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>Field Mappings</CardTitle>
                      <CardDescription>
                        Configure how {pmsConfig.displayName} fields map to internal fields
                      </CardDescription>
                    </div>
                    <Button onClick={saveFieldMappings} disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Save className="h-4 w-4 mr-2" />
                      )}
                      Save Mappings
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {pmsConfig.categories.map(category => (
                    <Collapsible
                      key={category.id}
                      open={openCategories[category.id]}
                      onOpenChange={() => toggleCategory(category.id)}
                    >
                      <CollapsibleTrigger className="flex items-center justify-between w-full p-4 rounded-lg border bg-muted/50 hover:bg-muted transition-colors">
                        <div className="flex items-center gap-2">
                          {openCategories[category.id] ? (
                            <ChevronDown className="h-4 w-4" />
                          ) : (
                            <ChevronRight className="h-4 w-4" />
                          )}
                          <span className="font-medium">{category.label}</span>
                          <Badge variant="outline" className="ml-2">
                            {category.fields.length} fields
                          </Badge>
                        </div>
                        <span className="text-sm text-muted-foreground">
                          {category.description}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-4 pl-6 space-y-3">
                        {category.fields.map(field => (
                          <div key={field.externalField} className="flex items-center gap-4 p-3 rounded border bg-background">
                            <div className="flex-1">
                              <Label className="text-sm font-medium">{field.externalLabel}</Label>
                              <p className="text-xs text-muted-foreground">{field.description}</p>
                            </div>
                            <ArrowRight className="h-4 w-4 text-muted-foreground" />
                            <div className="w-[250px]">
                              <Select
                                value={fieldMappings[category.id]?.[field.externalField] || field.internalField}
                                onValueChange={(value) => updateFieldMapping(category.id, field.externalField, value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  {availableInternalFields.map(internalField => (
                                    <SelectItem key={internalField.path} value={internalField.path}>
                                      {internalField.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                        ))}
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="data">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5" />
                    Live Data Explorer
                  </CardTitle>
                  <CardDescription>
                    View raw data fetched from {pmsConfig.displayName} API
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {Object.keys(pmsData).length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      <Database className="h-12 w-12 mx-auto mb-4 opacity-50" />
                      <p>No data fetched yet.</p>
                      <p className="text-sm">Click "Fetch External Data" to load data from {pmsConfig.displayName}.</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-[500px]">
                      <pre className="text-xs p-4 rounded bg-muted overflow-x-auto">
                        {JSON.stringify(pmsData, null, 2)}
                      </pre>
                    </ScrollArea>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
