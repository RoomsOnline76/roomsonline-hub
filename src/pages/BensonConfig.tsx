import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, CheckCircle2, AlertCircle, Loader2, Save, ChevronDown, ChevronRight, Database, ArrowRight, Eye } from "lucide-react";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RoomTypeDataViewer, ExpandableDataViewer, RateTypeItem } from "@/components/ExpandableDataViewer";

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

// Define all Benson data fields and their target internal fields
interface BensonFieldDefinition {
  bensonField: string;
  bensonLabel: string;
  description: string;
  internalField: string;
  internalLabel: string;
}

interface BensonDataCategory {
  id: string;
  label: string;
  description: string;
  fields: BensonFieldDefinition[];
  sampleData?: any[];
}

// Define the Benson data structure and default field mappings
const bensonDataCategories: BensonDataCategory[] = [
  {
    id: "room_types",
    label: "Room Types",
    description: "Room type definitions from Benson including IDs, names, and guest configurations",
    fields: [
      { bensonField: "id", bensonLabel: "Room Type ID", description: "Unique identifier for the room type", internalField: "amenities.room_types[].pmsRoomId", internalLabel: "Benson Room ID" },
      { bensonField: "name", bensonLabel: "Room Name", description: "Display name of the room type", internalField: "amenities.room_types[].name", internalLabel: "Room Name" },
      { bensonField: "description", bensonLabel: "Description", description: "Full description of the room", internalField: "amenities.room_types[].description", internalLabel: "Room Description" },
      { bensonField: "maxGuests", bensonLabel: "Max Guests", description: "Maximum guest capacity", internalField: "amenities.room_types[].maxPeople", internalLabel: "Max People" },
      { bensonField: "minGuests", bensonLabel: "Min Guests", description: "Minimum guests required", internalField: "amenities.room_types[].minGuests", internalLabel: "Min Guests" },
      { bensonField: "allowTeens", bensonLabel: "Allow Teens", description: "Whether teens are allowed", internalField: "amenities.room_types[].allowTeens", internalLabel: "Allow Teens" },
      { bensonField: "teenMinAge", bensonLabel: "Teen Min Age", description: "Minimum age for teens", internalField: "amenities.room_types[].teenMinAge", internalLabel: "Teen Min Age" },
      { bensonField: "teenMaxAge", bensonLabel: "Teen Max Age", description: "Maximum age for teens", internalField: "amenities.room_types[].teenMaxAge", internalLabel: "Teen Max Age" },
      { bensonField: "allowChildren", bensonLabel: "Allow Children", description: "Whether children are allowed", internalField: "amenities.room_types[].allowChildren", internalLabel: "Allow Children" },
      { bensonField: "childMinAge", bensonLabel: "Child Min Age", description: "Minimum age for children", internalField: "amenities.room_types[].childMinAge", internalLabel: "Child Min Age" },
      { bensonField: "childMaxAge", bensonLabel: "Child Max Age", description: "Maximum age for children", internalField: "amenities.room_types[].childMaxAge", internalLabel: "Child Max Age" },
      { bensonField: "allowInfants", bensonLabel: "Allow Infants", description: "Whether infants are allowed", internalField: "amenities.room_types[].allowInfants", internalLabel: "Allow Infants" },
      { bensonField: "infantMinAge", bensonLabel: "Infant Min Age", description: "Minimum age for infants", internalField: "amenities.room_types[].infantMinAge", internalLabel: "Infant Min Age" },
      { bensonField: "infantMaxAge", bensonLabel: "Infant Max Age", description: "Maximum age for infants", internalField: "amenities.room_types[].infantMaxAge", internalLabel: "Infant Max Age" },
    ],
  },
  {
    id: "rate_types",
    label: "Rate Types",
    description: "Rate type definitions from Benson including pricing categories and meal plans",
    fields: [
      { bensonField: "id", bensonLabel: "Rate Type ID", description: "Unique identifier for the rate type", internalField: "amenities.room_types[].rate_info[].pmsRateId", internalLabel: "Benson Rate ID" },
      { bensonField: "name", bensonLabel: "Rate Name", description: "Display name of the rate type", internalField: "amenities.room_types[].rate_info[].name", internalLabel: "Rate Name" },
      { bensonField: "description", bensonLabel: "Description", description: "Description of the rate", internalField: "amenities.room_types[].rate_info[].description", internalLabel: "Rate Description" },
      { bensonField: "mealType", bensonLabel: "Meal Type", description: "Included meal plan", internalField: "amenities.room_types[].rate_info[].mealTypes", internalLabel: "Meal Types" },
    ],
  },
];

// All available internal fields for custom mapping
const availableInternalFields = [
  { path: "amenities.room_types[].pmsRoomId", label: "Benson Room ID" },
  { path: "amenities.room_types[].pmsRoomType", label: "Benson Room Type" },
  { path: "amenities.room_types[].name", label: "Room Name" },
  { path: "amenities.room_types[].description", label: "Room Description" },
  { path: "amenities.room_types[].maxPeople", label: "Max People" },
  { path: "amenities.room_types[].maxAdults", label: "Max Adults" },
  { path: "amenities.room_types[].maxChildren", label: "Max Children" },
  { path: "amenities.room_types[].minGuests", label: "Min Guests" },
  { path: "amenities.room_types[].numRooms", label: "Number of Rooms" },
  { path: "amenities.room_types[].roomSize", label: "Room Size" },
  { path: "amenities.room_types[].bathrooms", label: "Bathrooms" },
  { path: "amenities.room_types[].bedConfiguration", label: "Bed Configuration" },
  { path: "amenities.room_types[].minStay", label: "Minimum Stay" },
  { path: "amenities.room_types[].maxStay", label: "Maximum Stay" },
  { path: "amenities.room_types[].allowTeens", label: "Allow Teens" },
  { path: "amenities.room_types[].teenMinAge", label: "Teen Min Age" },
  { path: "amenities.room_types[].teenMaxAge", label: "Teen Max Age" },
  { path: "amenities.room_types[].allowChildren", label: "Allow Children" },
  { path: "amenities.room_types[].childMinAge", label: "Child Min Age" },
  { path: "amenities.room_types[].childMaxAge", label: "Child Max Age" },
  { path: "amenities.room_types[].allowInfants", label: "Allow Infants" },
  { path: "amenities.room_types[].infantMinAge", label: "Infant Min Age" },
  { path: "amenities.room_types[].infantMaxAge", label: "Infant Max Age" },
  { path: "amenities.room_types[].rate_info[].pmsRateId", label: "Benson Rate ID" },
  { path: "amenities.room_types[].rate_info[].name", label: "Rate Name" },
  { path: "amenities.room_types[].rate_info[].description", label: "Rate Description" },
  { path: "amenities.room_types[].rate_info[].mealTypes", label: "Meal Types" },
  { path: "amenities.room_types[].rate_info[].amount", label: "Rate Amount" },
];

export default function BensonConfig() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [credentials, setCredentials] = useState<PMSCredentials | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingExternal, setFetchingExternal] = useState(false);
  
  // Store fetched Benson data
  const [bensonData, setBensonData] = useState<{
    roomTypes: any[];
    rateTypes: any[];
    reservations: any[];
  }>({ roomTypes: [], rateTypes: [], reservations: [] });
  const [fetchingReservations, setFetchingReservations] = useState(false);

  // Field mappings state - maps bensonField to internalField
  const [fieldMappings, setFieldMappings] = useState<Record<string, Record<string, string>>>({});

  // Open state for collapsibles
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
    room_types: true,
    rate_types: false,
  });

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedPropertyId) {
      loadFieldMappings();
    }
  }, [selectedPropertyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      const { data: envSetting } = await supabase
        .from("api_keys")
        .select("key_value")
        .eq("key_name", "BENSON_ACTIVE_ENVIRONMENT")
        .single();
      
      const activeEnv = envSetting?.key_value || "staging";

      const { data: creds } = await supabase
        .from("pms_credentials")
        .select("*")
        .eq("system_type", "benson")
        .eq("environment", activeEnv)
        .single();
      
      if (creds) {
        setCredentials(creds);
      }

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

  const loadFieldMappings = async () => {
    if (!selectedPropertyId) return;

    const { data, error } = await supabase
      .from("pms_mappings")
      .select("*")
      .eq("property_id", selectedPropertyId)
      .eq("system_type", "benson")
      .eq("mapping_type", "field_mappings");

    if (data && data.length > 0) {
      const savedMappings = data[0].metadata as any;
      if (savedMappings?.fieldMappings) {
        setFieldMappings(savedMappings.fieldMappings);
      }
    } else {
      // Initialize with default mappings
      const defaultMappings: Record<string, Record<string, string>> = {};
      bensonDataCategories.forEach(cat => {
        defaultMappings[cat.id] = {};
        cat.fields.forEach(field => {
          defaultMappings[cat.id][field.bensonField] = field.internalField;
        });
      });
      setFieldMappings(defaultMappings);
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

      setBensonData(prev => ({
        ...prev,
        roomTypes: data.roomTypes || [],
        rateTypes: data.rateTypes || [],
      }));

      toast({
        title: "Data fetched",
        description: `Found ${data.roomTypes?.length || 0} room types, ${data.rateTypes?.length || 0} rate types`,
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

  const fetchReservations = async () => {
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

    setFetchingReservations(true);
    try {
      // Fetch reservations for the next 90 days
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + 3);

      const { data, error } = await supabase.functions.invoke("benson-api", {
        body: {
          action: "get_reservations",
          property_id: selectedPropertyId,
          start_date: startDate.toISOString().split('T')[0],
          end_date: endDate.toISOString().split('T')[0],
          statuses: ["PROVISIONAL", "CONFIRMED", "GUARANTEED", "CHECKED-IN", "CANCELLED"],
        },
      });

      if (error) throw error;

      const reservations = data.reservations || [];
      setBensonData(prev => ({
        ...prev,
        reservations,
      }));

      toast({
        title: "Reservations fetched",
        description: `Found ${reservations.length} reservations`,
      });
    } catch (error: any) {
      toast({
        title: "Error fetching reservations",
        description: error.message,
        variant: "destructive",
      });
    }
    setFetchingReservations(false);
  };

  const saveFieldMappings = async () => {
    if (!selectedPropertyId) return;
    
    setSaving(true);
    try {
      const { data: existing } = await supabase
        .from("pms_mappings")
        .select("id")
        .eq("property_id", selectedPropertyId)
        .eq("system_type", "benson")
        .eq("mapping_type", "field_mappings")
        .eq("external_id", "field_config")
        .single();

      const mappingData = {
        property_id: selectedPropertyId,
        system_type: "benson",
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

  const updateFieldMapping = (categoryId: string, bensonField: string, internalField: string) => {
    setFieldMappings(prev => ({
      ...prev,
      [categoryId]: {
        ...prev[categoryId],
        [bensonField]: internalField,
      },
    }));
  };

  const getSampleDataForCategory = (categoryId: string): any[] => {
    switch (categoryId) {
      case "room_types": return bensonData.roomTypes;
      case "rate_types": return bensonData.rateTypes;
      default: return [];
    }
  };

  const toggleCategory = (categoryId: string) => {
    setOpenCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId],
    }));
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
        <div className="max-w-5xl mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-4">
              <Button variant="ghost" size="icon" onClick={() => navigate("/admin/api-keys")}>
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <div className="flex items-baseline gap-2">
                <h1 className="text-xl font-bold text-foreground">Benson Field Mappings</h1>
                <span className="text-xs text-muted-foreground">— Map Benson data to internal fields</span>
              </div>
            </div>
            <Button onClick={() => navigate("/admin/test-booking-benson")} variant="outline">
              Test Booking
            </Button>
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

          {/* Tabs for Field Mappings and Data Explorer */}
          {selectedPropertyId && (
            <Tabs defaultValue="mappings" className="space-y-4">
              <TabsList>
                <TabsTrigger value="mappings">
                  <Database className="h-4 w-4 mr-2" />
                  Field Mappings
                </TabsTrigger>
                <TabsTrigger value="data-explorer">
                  <Eye className="h-4 w-4 mr-2" />
                  Data Explorer
                </TabsTrigger>
              </TabsList>

              {/* Field Mappings Tab */}
              <TabsContent value="mappings" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Data Categories & Field Mappings</h2>
                  <Button onClick={saveFieldMappings} disabled={saving}>
                    {saving ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save Mappings
                  </Button>
                </div>

                <div className="space-y-3">
                  {bensonDataCategories.map((category) => {
                    const sampleData = getSampleDataForCategory(category.id);
                    const isOpen = openCategories[category.id];
                    
                    return (
                      <Card key={category.id}>
                        <Collapsible open={isOpen} onOpenChange={() => toggleCategory(category.id)}>
                          <CollapsibleTrigger asChild>
                            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  {isOpen ? (
                                    <ChevronDown className="h-5 w-5 text-muted-foreground" />
                                  ) : (
                                    <ChevronRight className="h-5 w-5 text-muted-foreground" />
                                  )}
                                  <Database className="h-5 w-5 text-primary" />
                                  <div>
                                    <CardTitle className="text-base">{category.label}</CardTitle>
                                    <CardDescription className="text-xs">{category.description}</CardDescription>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">{category.fields.length} fields</Badge>
                                  {sampleData.length > 0 && (
                                    <Badge className="bg-primary">{sampleData.length} items from Benson</Badge>
                                  )}
                                </div>
                              </div>
                            </CardHeader>
                          </CollapsibleTrigger>
                          
                          <CollapsibleContent>
                            <CardContent className="pt-0">
                              {/* Sample Data Preview */}
                              {sampleData.length > 0 && (
                                <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                                  <Label className="text-xs text-muted-foreground mb-2 block">
                                    Sample data from Benson ({sampleData.length} items):
                                  </Label>
                                  <ScrollArea className="max-h-24">
                                    <div className="flex flex-wrap gap-2">
                                      {sampleData.slice(0, 10).map((item, idx) => (
                                        <Badge key={idx} variant="secondary" className="text-xs">
                                          {item.name || item.id} 
                                          <span className="text-muted-foreground ml-1">(ID: {item.id})</span>
                                        </Badge>
                                      ))}
                                      {sampleData.length > 10 && (
                                        <Badge variant="outline" className="text-xs">+{sampleData.length - 10} more</Badge>
                                      )}
                                    </div>
                                  </ScrollArea>
                                </div>
                              )}

                              {/* Field Mapping Table */}
                              <div className="border rounded-lg overflow-hidden">
                                <div className="grid grid-cols-[1fr,auto,1fr] gap-2 p-3 bg-muted/50 text-sm font-medium border-b">
                                  <div>Benson Field</div>
                                  <div></div>
                                  <div>Internal UI Field</div>
                                </div>
                                <div className="divide-y">
                                  {category.fields.map((field) => (
                                    <div key={field.bensonField} className="grid grid-cols-[1fr,auto,1fr] gap-2 p-3 items-center">
                                      <div>
                                        <p className="font-medium text-sm">{field.bensonLabel}</p>
                                        <p className="text-xs text-muted-foreground">{field.bensonField}</p>
                                      </div>
                                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                                      <Select
                                        value={fieldMappings[category.id]?.[field.bensonField] || field.internalField}
                                        onValueChange={(value) => updateFieldMapping(category.id, field.bensonField, value)}
                                      >
                                        <SelectTrigger className="w-full">
                                          <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                          <SelectItem value="__skip__">
                                            <span className="text-muted-foreground italic">Skip (don't map)</span>
                                          </SelectItem>
                                          {availableInternalFields.map((f) => (
                                            <SelectItem key={f.path} value={f.path}>
                                              <div className="flex flex-col">
                                                <span>{f.label}</span>
                                                <span className="text-xs text-muted-foreground">{f.path}</span>
                                              </div>
                                            </SelectItem>
                                          ))}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </CardContent>
                          </CollapsibleContent>
                        </Collapsible>
                      </Card>
                    );
                  })}
                </div>

                {/* Info about Charge/Payment Types */}
                <Card className="bg-muted/30">
                  <CardContent className="pt-6">
                    <p className="text-sm text-muted-foreground">
                      <strong>Note:</strong> Charge Types and Payment Types from Benson are not currently used. 
                      These will be added when booking/billing integration is implemented.
                    </p>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Data Explorer Tab */}
              <TabsContent value="data-explorer" className="space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold">Raw Benson API Data</h2>
                  <Button
                    variant="outline"
                    onClick={fetchExternalTypes}
                    disabled={fetchingExternal || !selectedPropertyId}
                  >
                    {fetchingExternal ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Refresh Data
                  </Button>
                </div>

                {bensonData.roomTypes.length === 0 && bensonData.rateTypes.length === 0 ? (
                  <Card className="bg-muted/30">
                    <CardContent className="py-12 text-center">
                      <Database className="h-12 w-12 mx-auto mb-4 text-muted-foreground/30" />
                      <h3 className="font-semibold mb-2">No Data Loaded</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Click "Fetch from Benson" above to load API data for this property.
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-4">
                    {/* Room Types Explorer */}
                    {bensonData.roomTypes.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            Room Types
                            <Badge className="bg-primary">{bensonData.roomTypes.length} rooms</Badge>
                          </CardTitle>
                          <CardDescription>
                            Raw room type data from Benson API with nested rate types and availability
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {bensonData.roomTypes.map((room, idx) => (
                            <div key={room.id || idx} className="border rounded-lg overflow-hidden">
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center justify-between p-3 bg-muted/50 hover:bg-muted cursor-pointer">
                                    <div className="flex items-center gap-3">
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-medium">{room.name || `Room ${idx + 1}`}</span>
                                      <Badge variant="outline" className="text-xs font-mono">{room.id}</Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      {room.maxGuests && <span>Max: {room.maxGuests}</span>}
                                      {room.rateTypes?.length > 0 && (
                                        <Badge variant="secondary">{room.rateTypes.length} rate types</Badge>
                                      )}
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="p-4 border-t">
                                    <RoomTypeDataViewer room={room} rateTypes={bensonData.rateTypes} />
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                    {/* Rate Types Explorer */}
                    {bensonData.rateTypes.length > 0 && (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            Rate Types
                            <Badge className="bg-primary">{bensonData.rateTypes.length} rate types</Badge>
                          </CardTitle>
                          <CardDescription>
                            Rate type definitions from Benson API
                          </CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          {bensonData.rateTypes.map((rateType, idx) => (
                            <div key={rateType.id || idx} className="border rounded-lg overflow-hidden">
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center justify-between p-3 bg-muted/50 hover:bg-muted cursor-pointer">
                                    <div className="flex items-center gap-3">
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-medium">{rateType.name || `Rate ${idx + 1}`}</span>
                                      <Badge variant="outline" className="text-xs font-mono">{rateType.id}</Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      {rateType.priceType && <Badge variant="secondary">{rateType.priceType}</Badge>}
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="p-4 border-t">
                                    <ExpandableDataViewer data={rateType} defaultExpanded={true} />
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          ))}
                        </CardContent>
                      </Card>
                    )}

                    {/* Reservations Explorer */}
                    <Card>
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div>
                            <CardTitle className="flex items-center gap-2">
                              Reservations
                              {bensonData.reservations.length > 0 && (
                                <Badge className="bg-primary">{bensonData.reservations.length} reservations</Badge>
                              )}
                            </CardTitle>
                            <CardDescription>
                              Reservation data from Benson API (last month to 3 months ahead)
                            </CardDescription>
                          </div>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={fetchReservations}
                            disabled={fetchingReservations || !selectedPropertyId}
                          >
                            {fetchingReservations ? (
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Fetch Reservations
                          </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {bensonData.reservations.length === 0 ? (
                          <div className="text-center py-8 text-muted-foreground">
                            <p>No reservations loaded. Click "Fetch Reservations" to load.</p>
                          </div>
                        ) : (
                          bensonData.reservations.map((reservation, idx) => (
                            <div key={reservation.id || idx} className="border rounded-lg overflow-hidden">
                              <Collapsible>
                                <CollapsibleTrigger asChild>
                                  <div className="flex items-center justify-between p-3 bg-muted/50 hover:bg-muted cursor-pointer">
                                    <div className="flex items-center gap-3">
                                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                                      <span className="font-medium">
                                        {reservation.reservationName || reservation.contactName || `Reservation ${idx + 1}`}
                                      </span>
                                      <Badge variant="outline" className="text-xs font-mono">{reservation.id}</Badge>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      {reservation.status && (
                                        <Badge variant={reservation.status === 'CANCELLED' ? 'destructive' : 'secondary'}>
                                          {reservation.status}
                                        </Badge>
                                      )}
                                      {reservation.arrivalDate && (
                                        <span>{reservation.arrivalDate} → {reservation.departureDate}</span>
                                      )}
                                    </div>
                                  </div>
                                </CollapsibleTrigger>
                                <CollapsibleContent>
                                  <div className="p-4 border-t">
                                    <ExpandableDataViewer data={reservation} defaultExpanded={true} />
                                  </div>
                                </CollapsibleContent>
                              </Collapsible>
                            </div>
                          ))
                        )}
                      </CardContent>
                    </Card>

                    {/* Full Raw Data */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Full Raw Response</CardTitle>
                        <CardDescription>Complete API response data for debugging</CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ScrollArea className="h-[400px] border rounded-lg p-3">
                          <ExpandableDataViewer 
                            data={{ 
                              roomTypes: bensonData.roomTypes, 
                              rateTypes: bensonData.rateTypes,
                              reservations: bensonData.reservations 
                            }} 
                            defaultExpanded={false} 
                          />
                        </ScrollArea>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </>
  );
}
