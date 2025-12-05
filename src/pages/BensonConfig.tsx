import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, Loader2, Save, ChevronRight, FolderTree } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { internalFieldMap, getFieldsPopulatableByPMS, FieldDefinition } from "@/config/internalFieldMap";

interface PMSCredentials {
  id: string;
  system_type: string;
  environment: string;
  username: string | null;
  password: string | null;
  is_active: boolean;
}

interface Property {
  id: string;
  name: string;
  benson_property_code: string | null;
}

interface ExternalType {
  id: number;
  name: string;
}

interface TypeMapping {
  id: string;
  mappingType: string;
  targetFieldPath: string;
  targetFieldLabel: string;
}

// Extract all array/object fields that can be populated by Benson
const getPmsPopulatableArrayFields = (): { path: string; label: string; breadcrumb: string }[] => {
  const fields: { path: string; label: string; breadcrumb: string }[] = [];
  
  // Get all Benson-populatable fields
  const bensonFields = getFieldsPopulatableByPMS('benson');
  
  // Also add key array fields that are natural targets for PMS data
  const keyArrayFields = [
    { path: 'amenities.room_types', label: 'Room Types', breadcrumb: 'Property Form → Room Information → Room Types' },
    { path: 'amenities.room_types[].rate_info', label: 'Rate Information', breadcrumb: 'Property Form → Room Information → Rate Info' },
    { path: 'amenities.meal_types', label: 'Meal Types', breadcrumb: 'Property Form → Offerings → Meal Options' },
    { path: 'amenities.facilities', label: 'Facilities', breadcrumb: 'Property Form → Property Info → Facilities' },
    { path: 'amenities.seasons', label: 'Seasons', breadcrumb: 'Property Form → Rate Breakdown → Seasons' },
    { path: 'property_availability', label: 'Availability', breadcrumb: 'Calendar → Accommodation → Availability Grid' },
    { path: 'property_rates', label: 'Rates', breadcrumb: 'Calendar → Accommodation → Rate Grid' },
    { path: 'bookings', label: 'Bookings', breadcrumb: 'Bookings → Booking Records' },
    { path: 'pms_reservations', label: 'PMS Reservations', breadcrumb: 'Sync → PMS Reservations' },
  ];

  fields.push(...keyArrayFields);
  
  // Add individual PMS-populatable fields grouped by section
  bensonFields.forEach(field => {
    if (!fields.some(f => f.path === field.id)) {
      fields.push({
        path: field.id,
        label: field.label,
        breadcrumb: `Property Form → ${field.id.split('.').slice(0, -1).join(' → ')}`
      });
    }
  });

  return fields;
};

// Define what each Benson type maps to by default
const defaultMappings: Record<string, { path: string; label: string }> = {
  room_type: { path: 'amenities.room_types', label: 'Room Types' },
  rate_type: { path: 'amenities.room_types[].rate_info', label: 'Rate Information' },
  charge_type: { path: 'bookings.charges', label: 'Booking Charges' },
  payment_type: { path: 'bookings.payments', label: 'Booking Payments' },
};

export default function BensonConfig() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [credentials, setCredentials] = useState<PMSCredentials | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingExternal, setFetchingExternal] = useState(false);
  
  // External types fetched from Benson
  const [externalRoomTypes, setExternalRoomTypes] = useState<ExternalType[]>([]);
  const [externalRateTypes, setExternalRateTypes] = useState<ExternalType[]>([]);
  const [externalChargeTypes, setExternalChargeTypes] = useState<ExternalType[]>([]);
  const [externalPaymentTypes, setExternalPaymentTypes] = useState<ExternalType[]>([]);

  // Type mappings configuration
  const [typeMappings, setTypeMappings] = useState<TypeMapping[]>([
    { id: 'room_type', mappingType: 'room_type', targetFieldPath: 'amenities.room_types', targetFieldLabel: 'Room Types' },
    { id: 'rate_type', mappingType: 'rate_type', targetFieldPath: 'amenities.room_types[].rate_info', targetFieldLabel: 'Rate Information' },
    { id: 'charge_type', mappingType: 'charge_type', targetFieldPath: 'bookings.charges', targetFieldLabel: 'Booking Charges' },
    { id: 'payment_type', mappingType: 'payment_type', targetFieldPath: 'bookings.payments', targetFieldLabel: 'Booking Payments' },
  ]);

  const availableFields = getPmsPopulatableArrayFields();

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedPropertyId) {
      loadTypeMappings();
    }
  }, [selectedPropertyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // First get the active Benson environment
      const { data: envSetting } = await supabase
        .from("api_keys")
        .select("key_value")
        .eq("key_name", "BENSON_ACTIVE_ENVIRONMENT")
        .single();
      
      const activeEnv = envSetting?.key_value || "staging";

      // Load Benson credentials for the active environment
      const { data: creds } = await supabase
        .from("pms_credentials")
        .select("*")
        .eq("system_type", "benson")
        .eq("environment", activeEnv)
        .single();
      
      if (creds) {
        setCredentials(creds);
      }

      // Load properties with Benson integration
      const { data: props } = await supabase
        .from("properties")
        .select("id, name, benson_property_code")
        .eq("external_system", "benson")
        .eq("is_active", true)
        .order("name");

      if (props) {
        setProperties(props);
        if (props.length > 0 && !selectedPropertyId) {
          setSelectedPropertyId(props[0].id);
        }
      }
    } catch (error) {
      console.error("Error loading data:", error);
    }
    setLoading(false);
  };

  const loadTypeMappings = async () => {
    if (!selectedPropertyId) return;

    // Load existing type mappings from pms_mappings (stored as metadata)
    const { data, error } = await supabase
      .from("pms_mappings")
      .select("*")
      .eq("property_id", selectedPropertyId)
      .eq("system_type", "benson")
      .eq("mapping_type", "type_config");

    if (data && data.length > 0) {
      const savedMappings = data[0].metadata as any;
      if (savedMappings?.typeMappings) {
        setTypeMappings(savedMappings.typeMappings);
      }
    }
  };

  const fetchExternalTypes = async () => {
    if (!selectedPropertyId || !credentials) {
      toast({
        title: "Missing configuration",
        description: "Please select a property and ensure credentials are configured",
        variant: "destructive",
      });
      return;
    }

    const property = properties.find(p => p.id === selectedPropertyId);
    if (!property?.benson_property_code) {
      toast({
        title: "Missing property code",
        description: "Please configure the Benson property code in property settings",
        variant: "destructive",
      });
      return;
    }

    setFetchingExternal(true);
    try {
      const { data, error } = await supabase.functions.invoke("benson-api", {
        body: {
          action: "fetch_types",
          property_id: selectedPropertyId,
        },
      });

      if (error) throw error;

      if (data.chargeTypes) setExternalChargeTypes(data.chargeTypes);
      if (data.paymentTypes) setExternalPaymentTypes(data.paymentTypes);
      if (data.roomTypes) setExternalRoomTypes(data.roomTypes);
      if (data.rateTypes) setExternalRateTypes(data.rateTypes);

      toast({
        title: "Types fetched",
        description: `Found ${data.roomTypes?.length || 0} room types, ${data.rateTypes?.length || 0} rate types`,
      });
    } catch (error: any) {
      toast({
        title: "Error fetching types",
        description: error.message,
        variant: "destructive",
      });
    }
    setFetchingExternal(false);
  };

  const saveTypeMappings = async () => {
    if (!selectedPropertyId) return;
    
    setSaving(true);
    try {
      // Check if mapping exists
      const { data: existing } = await supabase
        .from("pms_mappings")
        .select("id")
        .eq("property_id", selectedPropertyId)
        .eq("system_type", "benson")
        .eq("mapping_type", "type_config")
        .eq("external_id", "type_mappings")
        .single();

      const mappingData = {
        property_id: selectedPropertyId,
        system_type: "benson",
        mapping_type: "type_config",
        external_id: "type_mappings",
        external_name: "Type Mappings Configuration",
        metadata: { typeMappings } as any,
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

  const updateTypeMapping = (mappingType: string, fieldPath: string) => {
    const field = availableFields.find(f => f.path === fieldPath);
    setTypeMappings(prev => prev.map(m => 
      m.mappingType === mappingType 
        ? { ...m, targetFieldPath: fieldPath, targetFieldLabel: field?.label || fieldPath }
        : m
    ));
  };

  const getExternalTypesByMapping = (mappingType: string): ExternalType[] => {
    switch (mappingType) {
      case 'room_type': return externalRoomTypes;
      case 'rate_type': return externalRateTypes;
      case 'charge_type': return externalChargeTypes;
      case 'payment_type': return externalPaymentTypes;
      default: return [];
    }
  };

  const getMappingLabel = (mappingType: string): string => {
    switch (mappingType) {
      case 'room_type': return 'Room Types';
      case 'rate_type': return 'Rate Types';
      case 'charge_type': return 'Charge Types';
      case 'payment_type': return 'Payment Types';
      default: return mappingType;
    }
  };

  const renderMappingCard = (mapping: TypeMapping) => {
    const externalTypes = getExternalTypesByMapping(mapping.mappingType);
    const currentField = availableFields.find(f => f.path === mapping.targetFieldPath);
    
    return (
      <Card key={mapping.id}>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FolderTree className="h-5 w-5 text-primary" />
              {getMappingLabel(mapping.mappingType)}
            </span>
            <Badge variant={externalTypes.length > 0 ? "default" : "secondary"}>
              {externalTypes.length} from Benson
            </Badge>
          </CardTitle>
          <CardDescription>
            Configure where Benson {getMappingLabel(mapping.mappingType).toLowerCase()} data is stored
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Target Field Path Selection */}
          <div className="space-y-2">
            <Label className="text-sm font-medium">Maps to Internal Field</Label>
            <Select
              value={mapping.targetFieldPath}
              onValueChange={(value) => updateTypeMapping(mapping.mappingType, value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select target field..." />
              </SelectTrigger>
              <SelectContent>
                {availableFields.map((field) => (
                  <SelectItem key={field.path} value={field.path}>
                    <div className="flex flex-col">
                      <span className="font-medium">{field.label}</span>
                      <span className="text-xs text-muted-foreground">{field.path}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {currentField && (
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <ChevronRight className="h-3 w-3" />
                {currentField.breadcrumb}
              </p>
            )}
          </div>

          {/* Available External Types from Benson */}
          {externalTypes.length > 0 && (
            <Collapsible>
              <CollapsibleTrigger className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
                <ChevronRight className="h-4 w-4 transition-transform ui-expanded:rotate-90" />
                View {externalTypes.length} items from Benson
              </CollapsibleTrigger>
              <CollapsibleContent className="pt-2">
                <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-md">
                  {externalTypes.map((et) => (
                    <Badge key={et.id} variant="outline" className="text-xs">
                      {et.name} <span className="text-muted-foreground ml-1">(ID: {et.id})</span>
                    </Badge>
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          )}

          {externalTypes.length === 0 && (
            <p className="text-sm text-muted-foreground italic">
              No data fetched yet. Click "Fetch from Benson" to load.
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <>
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </>
    );
  }

  return (
    <>
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/api-keys")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Benson Configuration</h1>
              <p className="text-muted-foreground">
                Map Benson data types to internal field paths
              </p>
            </div>
          </div>

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
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Environment</Label>
                  <p className="font-medium capitalize">{credentials?.environment || "Not set"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Username</Label>
                  <p className="font-medium">{credentials?.username ? "Configured" : "Not set"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Password</Label>
                  <p className="font-medium">{credentials?.password ? "Configured" : "Not set"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Properties</Label>
                  <p className="font-medium">{properties.length} configured</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Property Selection */}
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Select Property</CardTitle>
              <CardDescription>
                Choose a property to configure field mappings for
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                  <SelectTrigger className="w-80">
                    <SelectValue placeholder="Select property..." />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((prop) => (
                      <SelectItem key={prop.id} value={prop.id}>
                        {prop.name}
                        {prop.benson_property_code && (
                          <span className="text-muted-foreground ml-2">
                            ({prop.benson_property_code})
                          </span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button
                  onClick={fetchExternalTypes}
                  disabled={fetchingExternal || !selectedPropertyId}
                >
                  {fetchingExternal ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Fetch from Benson
                </Button>
              </div>

              {selectedPropertyId && !properties.find(p => p.id === selectedPropertyId)?.benson_property_code && (
                <p className="text-sm text-yellow-600 dark:text-yellow-400 mt-2">
                  ⚠️ This property doesn't have a Benson property code configured.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Type Mappings */}
          {selectedPropertyId && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold">Field Mappings</h2>
                <Button onClick={saveTypeMappings} disabled={saving}>
                  {saving ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Mappings
                </Button>
              </div>
              
              <Tabs defaultValue="room_type">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="room_type">Room Types</TabsTrigger>
                  <TabsTrigger value="rate_type">Rate Types</TabsTrigger>
                  <TabsTrigger value="charge_type">Charge Types</TabsTrigger>
                  <TabsTrigger value="payment_type">Payment Types</TabsTrigger>
                </TabsList>

                {typeMappings.map((mapping) => (
                  <TabsContent key={mapping.id} value={mapping.mappingType} className="mt-4">
                    {renderMappingCard(mapping)}
                  </TabsContent>
                ))}
              </Tabs>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
