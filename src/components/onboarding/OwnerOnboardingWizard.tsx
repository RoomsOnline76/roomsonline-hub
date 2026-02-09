import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Sparkles,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { parseHostfullyProperties, ParsedBuilding } from "@/lib/hostfullyBuildingParser";

const PMS_DISPLAY_NAMES: Record<string, string> = {
  hostfully: "Hostfully",
  nightsbridge: "NightsBridge",
  benson: "Benson",
  hotelbeds: "HotelBeds",
  checkfront: "Checkfront",
  cloudbeds: "Cloudbeds",
};

interface PendingCredential {
  id: string;
  system_type: string;
  sync_status: string;
  api_key: string | null;
  environment: string | null;
  external_account_name: string | null;
}

interface HostfullyAgencyInfo {
  uid: string;
  name: string | null;
  propertyCount: number;
}

interface OwnerOnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
  onSkip: () => void;
  pendingCredentials: PendingCredential[];
}

export function OwnerOnboardingWizard({
  open,
  onComplete,
  onSkip,
  pendingCredentials,
}: OwnerOnboardingWizardProps) {
  const { profile } = useAuth();
  
  // Hostfully state
  const [hostfullyApiKey, setHostfullyApiKey] = useState("");
  // Environment is now determined by the edge function from pms_tracker_status
  const [hostfullyAgencyInfo, setHostfullyAgencyInfo] = useState<HostfullyAgencyInfo | null>(null);
  const [parsedBuildings, setParsedBuildings] = useState<ParsedBuilding[]>([]);
  const [selectedBuildings, setSelectedBuildings] = useState<Set<string>>(new Set());
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  const [validatingKey, setValidatingKey] = useState(false);
  const [keyValidated, setKeyValidated] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);

  const hostfullyCredential = pendingCredentials.find(c => c.system_type === "hostfully");

  useEffect(() => {
    if (open) {
      // Reset state when opening
      setHostfullyApiKey("");
      setHostfullyAgencyInfo(null);
      setParsedBuildings([]);
      setSelectedBuildings(new Set());
      setExpandedBuildings(new Set());
      setKeyValidated(false);
      setKeyError(null);
    }
  }, [open]);

  const validateHostfullyKey = async () => {
    if (!hostfullyApiKey.trim()) {
      setKeyError("Please enter an API key");
      return;
    }

    setValidatingKey(true);
    setKeyError(null);

    try {
      // Don't send environment - edge function will fetch current tracker environment
      const { data, error } = await supabase.functions.invoke("hostfully-api", {
        body: {
          action: "validate_api_key",
          api_key: hostfullyApiKey.trim(),
        },
      });

      if (error) throw error;

      if (!data?.success) {
        setKeyError(data?.error?.message || "Invalid API key");
        setKeyValidated(false);
        return;
      }

      setHostfullyAgencyInfo({
        uid: data.data.agency_uid,
        name: data.data.agency_name,
        propertyCount: data.data.property_count,
      });
      setKeyValidated(true);

      // Fetch and parse properties into buildings
      await fetchAndParseBuildings();
    } catch (err: any) {
      console.error("Failed to validate Hostfully API key:", err);
      setKeyError(err.message || "Failed to validate API key");
      setKeyValidated(false);
    } finally {
      setValidatingKey(false);
    }
  };

  const fetchAndParseBuildings = async () => {
    try {
      // Use list_all_properties for complete property list with pagination
      // Don't send environment - edge function will fetch current tracker environment
      const { data, error } = await supabase.functions.invoke("hostfully-api", {
        body: {
          action: "list_all_properties",
          api_key: hostfullyApiKey.trim(),
        },
      });

      if (error) throw error;

      if (data?.success && data.data?.properties) {
        // Parse properties into buildings
        const buildings = parseHostfullyProperties(data.data.properties);
        setParsedBuildings(buildings);
        // Select all buildings by default
        setSelectedBuildings(new Set(buildings.map(b => b.building_name)));
      }
    } catch (err) {
      console.error("Failed to fetch Hostfully properties:", err);
      toast.error("Failed to fetch properties from Hostfully");
    }
  };

  const toggleBuildingSelection = (buildingName: string) => {
    setSelectedBuildings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(buildingName)) {
        newSet.delete(buildingName);
      } else {
        newSet.add(buildingName);
      }
      return newSet;
    });
  };

  const toggleBuildingExpanded = (buildingName: string) => {
    setExpandedBuildings(prev => {
      const newSet = new Set(prev);
      if (newSet.has(buildingName)) {
        newSet.delete(buildingName);
      } else {
        newSet.add(buildingName);
      }
      return newSet;
    });
  };

  const selectAll = () => setSelectedBuildings(new Set(parsedBuildings.map(b => b.building_name)));
  const deselectAll = () => setSelectedBuildings(new Set());

  const handleCompleteSetup = async () => {
    if (!hostfullyCredential || !keyValidated) return;

    setImporting(true);

    try {
      // Update the credential with the API key (environment will be set by DB default)
      const { error: updateError } = await supabase
        .from("owner_pms_credentials")
        .update({
          api_key: hostfullyApiKey.trim(),
          external_account_id: hostfullyAgencyInfo?.uid,
          external_account_name: hostfullyAgencyInfo?.name,
          sync_status: "active",
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", hostfullyCredential.id);

      if (updateError) throw updateError;

      // Import selected buildings as properties
      let successCount = 0;
      const selectedBuildingsList = parsedBuildings.filter(b => selectedBuildings.has(b.building_name));

      for (const building of selectedBuildingsList) {
        try {
          // Create property for the building
          const { data: propertyData, error: insertError } = await supabase
            .from("properties")
            .insert({
              name: building.building_name,
              address: "Address pending",
              city: "City pending",
              country: "South Africa",
              property_type: "Holiday rental",
              max_guests: 4,
              price_per_night: 100,
              external_system: "hostfully",
              external_id: building.sample_hostfully_uid,
              hostfully_property_uid: building.sample_hostfully_uid,
              owner_pms_credential_id: hostfullyCredential.id,
              owner_name: profile?.full_name || null,
              owner_email: profile?.email || null,
              pms_managed_fields: ["name", "description", "images", "amenities", "max_guests"],
              is_active: true,
            })
            .select("id")
            .single();

          if (insertError) {
            console.error(`Failed to import building ${building.building_name}:`, insertError);
            continue;
          }

          // Create room types for each unit in the building
          const roomTypeInserts = building.units.map(unit => ({
            property_id: propertyData.id,
            name: unit.room_type || `Room ${unit.room_number}`,
            hostfully_room_id: unit.id,
            max_guests: 4,
            is_active: true,
          }));

          const { error: roomError } = await supabase
            .from("hostfully_room_types")
            .insert(roomTypeInserts);

          if (roomError) {
            console.error(`Failed to create room types for ${building.building_name}:`, roomError);
          }

          successCount++;
        } catch (err) {
          console.error(`Error importing building ${building.building_name}:`, err);
        }
      }

      toast.success(
        `${successCount} ${successCount === 1 ? "property" : "properties"} imported successfully!`
      );
      onComplete();
    } catch (err: any) {
      console.error("Failed to complete setup:", err);
      toast.error(err.message || "Failed to complete setup");
    } finally {
      setImporting(false);
    }
  };

  const handleActivateNonHostfully = async (credentialId: string) => {
    setImporting(true);
    try {
      const { error } = await supabase
        .from("owner_pms_credentials")
        .update({ sync_status: "active" })
        .eq("id", credentialId);

      if (error) throw error;

      toast.success("PMS connection acknowledged!");
      onComplete();
    } catch (err: any) {
      console.error("Failed to activate credential:", err);
      toast.error(err.message || "Failed to update connection");
    } finally {
      setImporting(false);
    }
  };

  const ownerName = profile?.full_name?.split(" ")[0] || "there";

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col overscroll-contain" hideCloseButton>
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="h-5 w-5 text-primary" />
            <DialogTitle>Welcome, {ownerName}!</DialogTitle>
          </div>
          <DialogDescription>
            Let's connect your property management system to get your properties listed on RoomsOnline.
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-4 space-y-4">
          {hostfullyCredential && (
            <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary" />
                <Label className="font-medium">Hostfully Connection</Label>
                <Badge variant="outline" className="ml-auto">Pending Setup</Badge>
              </div>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="onboard-hostfully-api-key">API Key</Label>
                  <div className="flex gap-2">
                    <Input
                      id="onboard-hostfully-api-key"
                      value={hostfullyApiKey}
                      onChange={(e) => {
                        setHostfullyApiKey(e.target.value);
                        if (keyValidated) {
                          setKeyValidated(false);
                          setHostfullyAgencyInfo(null);
                          setParsedBuildings([]);
                          setSelectedBuildings(new Set());
                        }
                        setKeyError(null);
                      }}
                      placeholder="Enter your Hostfully API key"
                      disabled={validatingKey || importing}
                      className="font-mono text-sm"
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={validateHostfullyKey}
                      disabled={validatingKey || !hostfullyApiKey.trim() || importing}
                    >
                      {validatingKey ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : keyValidated ? (
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                      ) : (
                        "Validate"
                      )}
                    </Button>
                  </div>
                  {keyError && (
                    <p className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {keyError}
                    </p>
                  )}
                </div>

                {keyValidated && hostfullyAgencyInfo && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span className="text-sm">
                      Connected to: <strong>{hostfullyAgencyInfo.name || "Unnamed Agency"}</strong>
                    </span>
                  </div>
                )}

                {keyValidated && parsedBuildings.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Select buildings to import ({parsedBuildings.length} available)</Label>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={selectAll}
                          className="text-xs h-7"
                          disabled={importing}
                        >
                          Select All
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={deselectAll}
                          className="text-xs h-7"
                          disabled={importing}
                        >
                          Deselect All
                        </Button>
                      </div>
                    </div>
                    <ScrollArea className="h-48 border rounded-md">
                      <div className="p-2 space-y-1">
                        {parsedBuildings.map((building) => (
                          <Collapsible
                            key={building.building_name}
                            open={expandedBuildings.has(building.building_name)}
                            onOpenChange={() => toggleBuildingExpanded(building.building_name)}
                          >
                            <div
                              className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                                selectedBuildings.has(building.building_name)
                                  ? "bg-primary/10"
                                  : "hover:bg-muted/50"
                              }`}
                              onClick={() => !importing && toggleBuildingSelection(building.building_name)}
                            >
                              <Checkbox
                                checked={selectedBuildings.has(building.building_name)}
                                onCheckedChange={() => toggleBuildingSelection(building.building_name)}
                                disabled={importing}
                                onClick={(e) => e.stopPropagation()}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{building.building_name}</p>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {building.unit_count} {building.unit_count === 1 ? "unit" : "units"}
                              </Badge>
                              <CollapsibleTrigger asChild onClick={(e) => e.stopPropagation()}>
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0">
                                  {expandedBuildings.has(building.building_name) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                              </CollapsibleTrigger>
                            </div>
                            <CollapsibleContent>
                              <div className="ml-8 pl-2 border-l space-y-1 py-1">
                                {building.units.map((unit) => (
                                  <div key={unit.id} className="text-xs text-muted-foreground py-0.5">
                                    Room {unit.room_number} - {unit.room_type || "Standard"}
                                  </div>
                                ))}
                              </div>
                            </CollapsibleContent>
                          </Collapsible>
                        ))}
                      </div>
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground">
                      {selectedBuildings.size} {selectedBuildings.size === 1 ? "building" : "buildings"} will be imported as properties
                    </p>
                  </div>
                )}

                {keyValidated && parsedBuildings.length === 0 && (
                  <p className="text-sm text-muted-foreground">No properties found in this Hostfully account.</p>
                )}
              </div>
            </div>
          )}

          {/* Non-Hostfully PMS credentials */}
          {pendingCredentials
            .filter(c => c.system_type !== "hostfully")
            .map((cred) => {
              const systemName = PMS_DISPLAY_NAMES[cred.system_type] || cred.system_type;
              const isWidgetOnly = cred.system_type === "nightsbridge";
              const needsAdminSetup = ["benson", "hotelbeds"].includes(cred.system_type);

              return (
                <div key={cred.id} className="space-y-3 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <Label className="font-medium">{systemName} Connection</Label>
                    <Badge variant="outline" className="ml-auto">Pending Setup</Badge>
                  </div>

                  {isWidgetOnly ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        NightsBridge uses a widget integration — no API key is required from you.
                        Your admin has set this up for your property.
                      </p>
                      <Button
                        size="sm"
                        className="w-full gap-1.5"
                        onClick={() => handleActivateNonHostfully(cred.id)}
                        disabled={importing}
                      >
                        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Acknowledge & Continue
                      </Button>
                    </div>
                  ) : needsAdminSetup ? (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        {systemName} credentials are managed by your RoomsOnline admin. 
                        No action is needed from you — your admin will complete this setup.
                      </p>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="w-full gap-1.5"
                        onClick={() => handleActivateNonHostfully(cred.id)}
                        disabled={importing}
                      >
                        {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                        Acknowledge & Continue
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Setup for {systemName} will be completed by your admin.
                    </p>
                  )}
                </div>
              );
            })
          }
        </div>

        <div className="flex gap-2 justify-between pt-4 border-t">
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            disabled={importing}
          >
            Skip for now
          </Button>
          {hostfullyCredential ? (
            <Button
              onClick={handleCompleteSetup}
              disabled={!keyValidated || selectedBuildings.size === 0 || importing}
            >
              {importing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  Importing...
                </>
              ) : (
                <>Complete Setup</>
              )}
            </Button>
          ) : (
            <Button onClick={onSkip}>
              Done
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
