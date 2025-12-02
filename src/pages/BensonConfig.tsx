import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, RefreshCw, Plus, Trash2, CheckCircle2, AlertCircle, Loader2, Save } from "lucide-react";
import { Switch } from "@/components/ui/switch";

interface PMSMapping {
  id: string;
  property_id: string | null;
  system_type: string;
  mapping_type: string;
  external_id: string;
  external_name: string | null;
  internal_id: string | null;
  internal_name: string | null;
  is_active: boolean;
}

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

export default function BensonConfig() {
  const navigate = useNavigate();
  const { toast } = useToast();
  
  const [credentials, setCredentials] = useState<PMSCredentials | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [mappings, setMappings] = useState<PMSMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [fetchingExternal, setFetchingExternal] = useState(false);
  
  // External types fetched from Benson
  const [externalRoomTypes, setExternalRoomTypes] = useState<ExternalType[]>([]);
  const [externalRateTypes, setExternalRateTypes] = useState<ExternalType[]>([]);
  const [externalChargeTypes, setExternalChargeTypes] = useState<ExternalType[]>([]);
  const [externalPaymentTypes, setExternalPaymentTypes] = useState<ExternalType[]>([]);

  // Internal room types from our system
  const [internalRoomTypes, setInternalRoomTypes] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (selectedPropertyId) {
      loadMappings();
      loadInternalRoomTypes();
    }
  }, [selectedPropertyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load Benson credentials
      const { data: creds } = await supabase
        .from("pms_credentials")
        .select("*")
        .eq("system_type", "benson")
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

  const loadMappings = async () => {
    if (!selectedPropertyId) return;

    const { data, error } = await supabase
      .from("pms_mappings")
      .select("*")
      .eq("property_id", selectedPropertyId)
      .eq("system_type", "benson")
      .order("mapping_type")
      .order("external_name");

    if (error) {
      toast({
        title: "Error loading mappings",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setMappings(data || []);
    }
  };

  const loadInternalRoomTypes = async () => {
    if (!selectedPropertyId) return;

    // Load room types from property's amenities
    const { data: property } = await supabase
      .from("properties")
      .select("amenities")
      .eq("id", selectedPropertyId)
      .single();

    if (property?.amenities) {
      const amenities = property.amenities as any;
      if (amenities.room_types && Array.isArray(amenities.room_types)) {
        setInternalRoomTypes(amenities.room_types.map((rt: any) => ({
          id: rt.id || rt.name,
          name: rt.name
        })));
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
        description: "Successfully fetched types from Benson API",
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

  const saveMapping = async (mapping: PMSMapping) => {
    setSaving(true);
    const { error } = await supabase
      .from("pms_mappings")
      .upsert({
        id: mapping.id,
        property_id: mapping.property_id,
        system_type: mapping.system_type,
        mapping_type: mapping.mapping_type,
        external_id: mapping.external_id,
        external_name: mapping.external_name,
        internal_id: mapping.internal_id,
        internal_name: mapping.internal_name,
        is_active: mapping.is_active,
      });

    if (error) {
      toast({
        title: "Error saving mapping",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Mapping saved" });
      loadMappings();
    }
    setSaving(false);
  };

  const addMapping = async (type: string, externalId: string, externalName: string) => {
    const { error } = await supabase.from("pms_mappings").insert({
      property_id: selectedPropertyId,
      system_type: "benson",
      mapping_type: type,
      external_id: externalId,
      external_name: externalName,
      is_active: true,
    });

    if (error) {
      if (error.code === "23505") {
        toast({
          title: "Mapping exists",
          description: "This mapping already exists",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error adding mapping",
          description: error.message,
          variant: "destructive",
        });
      }
    } else {
      toast({ title: "Mapping added" });
      loadMappings();
    }
  };

  const deleteMapping = async (id: string) => {
    const { error } = await supabase.from("pms_mappings").delete().eq("id", id);
    if (error) {
      toast({
        title: "Error deleting mapping",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({ title: "Mapping deleted" });
      loadMappings();
    }
  };

  const updateMappingInternal = (id: string, internalId: string, internalName: string) => {
    setMappings(mappings.map(m => 
      m.id === id ? { ...m, internal_id: internalId, internal_name: internalName } : m
    ));
  };

  const getMappingsByType = (type: string) => mappings.filter(m => m.mapping_type === type);

  const renderMappingTable = (
    type: string,
    title: string,
    externalTypes: ExternalType[],
    internalOptions: { id: string; name: string }[]
  ) => {
    const typeMappings = getMappingsByType(type);
    const unmappedExternal = externalTypes.filter(
      et => !typeMappings.some(m => m.external_id === et.id.toString())
    );

    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{title}</span>
            <Badge variant={typeMappings.length > 0 ? "default" : "secondary"}>
              {typeMappings.length} mapped
            </Badge>
          </CardTitle>
          <CardDescription>
            Map Benson {title.toLowerCase()} to your internal system
          </CardDescription>
        </CardHeader>
        <CardContent>
          {typeMappings.length > 0 && (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Benson ID</TableHead>
                  <TableHead>Benson Name</TableHead>
                  <TableHead>Internal Mapping</TableHead>
                  <TableHead>Active</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typeMappings.map((mapping) => (
                  <TableRow key={mapping.id}>
                    <TableCell className="font-mono">{mapping.external_id}</TableCell>
                    <TableCell>{mapping.external_name}</TableCell>
                    <TableCell>
                      <Select
                        value={mapping.internal_id || ""}
                        onValueChange={(value) => {
                          const option = internalOptions.find(o => o.id === value);
                          updateMappingInternal(mapping.id, value, option?.name || "");
                        }}
                      >
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Select internal..." />
                        </SelectTrigger>
                        <SelectContent>
                          {internalOptions.map((opt) => (
                            <SelectItem key={opt.id} value={opt.id}>
                              {opt.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={mapping.is_active}
                        onCheckedChange={(checked) => {
                          setMappings(mappings.map(m =>
                            m.id === mapping.id ? { ...m, is_active: checked } : m
                          ));
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => saveMapping(mapping)}
                          disabled={saving}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => deleteMapping(mapping.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}

          {unmappedExternal.length > 0 && (
            <div className="mt-4">
              <Label className="text-sm text-muted-foreground mb-2 block">
                Available from Benson (click to add):
              </Label>
              <div className="flex flex-wrap gap-2">
                {unmappedExternal.map((et) => (
                  <Button
                    key={et.id}
                    size="sm"
                    variant="outline"
                    onClick={() => addMapping(type, et.id.toString(), et.name)}
                  >
                    <Plus className="h-3 w-3 mr-1" />
                    {et.name} ({et.id})
                  </Button>
                ))}
              </div>
            </div>
          )}

          {typeMappings.length === 0 && unmappedExternal.length === 0 && (
            <p className="text-muted-foreground text-sm">
              No {title.toLowerCase()} available. Click "Fetch from Benson" to load.
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
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/api-keys")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <h1 className="text-3xl font-bold">Benson Configuration</h1>
              <p className="text-muted-foreground">
                Map Benson field IDs to your internal system
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
                Choose a property to configure mappings for
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
                  Please update it in the property settings.
                </p>
              )}
            </CardContent>
          </Card>

          {/* Mappings Tabs */}
          {selectedPropertyId && (
            <Tabs defaultValue="room_type">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="room_type">Room Types</TabsTrigger>
                <TabsTrigger value="rate_type">Rate Types</TabsTrigger>
                <TabsTrigger value="charge_type">Charge Types</TabsTrigger>
                <TabsTrigger value="payment_type">Payment Types</TabsTrigger>
              </TabsList>

              <TabsContent value="room_type" className="mt-4">
                {renderMappingTable("room_type", "Room Types", externalRoomTypes, internalRoomTypes)}
              </TabsContent>

              <TabsContent value="rate_type" className="mt-4">
                {renderMappingTable("rate_type", "Rate Types", externalRateTypes, [
                  { id: "standard", name: "Standard Rate" },
                  { id: "best_available", name: "Best Available Rate" },
                  { id: "early_bird", name: "Early Bird" },
                  { id: "last_minute", name: "Last Minute" },
                  { id: "long_stay", name: "Long Stay" },
                  { id: "corporate", name: "Corporate Rate" },
                ])}
              </TabsContent>

              <TabsContent value="charge_type" className="mt-4">
                {renderMappingTable("charge_type", "Charge Types", externalChargeTypes, [
                  { id: "accommodation", name: "Accommodation" },
                  { id: "food_beverage", name: "Food & Beverage" },
                  { id: "spa", name: "Spa Services" },
                  { id: "minibar", name: "Minibar" },
                  { id: "laundry", name: "Laundry" },
                  { id: "transport", name: "Transport" },
                  { id: "activity", name: "Activity/Tour" },
                  { id: "gratuity", name: "Gratuity" },
                  { id: "damage", name: "Damage Fee" },
                  { id: "other", name: "Other" },
                ])}
              </TabsContent>

              <TabsContent value="payment_type" className="mt-4">
                {renderMappingTable("payment_type", "Payment Types", externalPaymentTypes, [
                  { id: "credit_card", name: "Credit Card" },
                  { id: "debit_card", name: "Debit Card" },
                  { id: "eft", name: "EFT/Bank Transfer" },
                  { id: "cash", name: "Cash" },
                  { id: "account", name: "Account" },
                  { id: "voucher", name: "Voucher" },
                  { id: "write_off", name: "Write-Off" },
                ])}
              </TabsContent>
            </Tabs>
          )}
        </div>
      </div>
    </>
  );
}