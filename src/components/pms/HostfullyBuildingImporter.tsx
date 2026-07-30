import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { 
  Building2, 
  ChevronDown, 
  ChevronRight, 
  Import, 
  Loader2,
  DoorOpen,
  CheckCircle2,
} from "lucide-react";
import { ParsedBuilding, groupUnitsByType, RoomTypeGroup } from "@/lib/hostfullyBuildingParser";

interface HostfullyBuildingImporterProps {
  buildings: ParsedBuilding[];
  ownerCredentialId: string;
  onImportComplete: () => void;
}

export function HostfullyBuildingImporter({
  buildings,
  ownerCredentialId,
  onImportComplete,
}: HostfullyBuildingImporterProps) {
  const { toast } = useToast();
  const [selectedBuildings, setSelectedBuildings] = useState<Set<string>>(new Set());
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  const [importedBuildings, setImportedBuildings] = useState<Set<string>>(new Set());

  const toggleBuildingSelection = (buildingName: string) => {
    setSelectedBuildings(prev => {
      const next = new Set(prev);
      if (next.has(buildingName)) {
        next.delete(buildingName);
      } else {
        next.add(buildingName);
      }
      return next;
    });
  };

  const toggleBuildingExpanded = (buildingName: string) => {
    setExpandedBuildings(prev => {
      const next = new Set(prev);
      if (next.has(buildingName)) {
        next.delete(buildingName);
      } else {
        next.add(buildingName);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedBuildings(new Set(buildings.map(b => b.building_name)));
  };

  const deselectAll = () => {
    setSelectedBuildings(new Set());
  };

  const handleImport = async () => {
    if (selectedBuildings.size === 0) {
      toast({
        title: "No buildings selected",
        description: "Please select at least one building to import",
        variant: "destructive",
      });
      return;
    }

    setImporting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const buildingName of selectedBuildings) {
      const building = buildings.find(b => b.building_name === buildingName);
      if (!building) continue;

      try {
        // Create the property in ROL
        const { data: newProperty, error: propError } = await supabase
          .from("properties")
          .insert({
            name: building.building_name,
            external_system: "hostfully",
            external_id: building.sample_hostfully_uid,
            hostfully_property_uid: building.sample_hostfully_uid,
            owner_pms_credential_id: ownerCredentialId,
            pms_managed_fields: ["name", "rooms", "rates", "availability"],
            pms_sync_status: "synced",
            is_active: true,
            property_type: "hotel",
            address: "Pending",
            city: "Pending",
            country: "South Africa",
            price_per_night: 0,
            max_guests: building.units.reduce((max) => Math.max(max, 2), 2),
          })
          .select("id")
          .single();

        if (propError) throw propError;

        // Group units by room type
        const typeGroups = groupUnitsByType(building);

        // Create one hostfully_room_types row per unique type
        for (const group of typeGroups) {
          const { data: roomType, error: roomError } = await supabase
            .from("hostfully_room_types")
            .insert({
              property_id: newProperty.id,
              hostfully_room_id: group.unit_ids[0], // first unit UID for backward compat
              name: group.type_name,
              total_units: group.unit_count,
              property_type: group.type_name, // used by calendar grouping
              is_active: true,
            })
            .select("id")
            .single();

          if (roomError) {
            console.error(`Error creating room type ${group.type_name}:`, roomError);
            continue;
          }

          // Insert all individual unit UIDs into hostfully_unit_map
          const unitMapInserts = group.unit_ids.map((uid, idx) => ({
            room_type_id: roomType.id,
            property_id: newProperty.id,
            hostfully_uid: uid,
            unit_number: group.unit_numbers[idx] || null,
            unit_name: `${group.unit_numbers[idx] || ''} ${group.type_name}`.trim(),
            is_active: true,
          }));

          const { error: mapError } = await supabase
            .from("hostfully_unit_map" as never)
            .insert(unitMapInserts as never);

          if (mapError) {
            console.error(`Error creating unit map for ${group.type_name}:`, mapError);
          }
        }

        successCount++;
        setImportedBuildings(prev => new Set(prev).add(buildingName));
      } catch (error: any) {
        console.error(`Error importing ${buildingName}:`, error);
        errorCount++;
      }
    }

    setImporting(false);

    if (successCount > 0) {
      toast({
        title: "Import complete",
        description: `Successfully imported ${successCount} building(s)${errorCount > 0 ? `, ${errorCount} failed` : ""}`,
      });
      onImportComplete();
    } else {
      toast({
        title: "Import failed",
        description: "Could not import any buildings. Check console for details.",
        variant: "destructive",
      });
    }
  };

  if (buildings.length === 0) {
    return null;
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              Parsed Buildings
              <Badge variant="secondary">{buildings.length} unique</Badge>
            </CardTitle>
            <CardDescription>
              Properties grouped by building name. Select buildings to import as ROL properties with room types.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={selectAll}>
              Select All
            </Button>
            <Button variant="outline" size="sm" onClick={deselectAll}>
              Deselect All
            </Button>
            <Button
              onClick={handleImport}
              disabled={importing || selectedBuildings.size === 0}
            >
              {importing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Import className="h-4 w-4 mr-2" />
              )}
              Import Selected ({selectedBuildings.size})
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="h-[400px] overflow-y-auto pr-4">
          <div className="space-y-2">
            {buildings.map((building) => {
              const isSelected = selectedBuildings.has(building.building_name);
              const isExpanded = expandedBuildings.has(building.building_name);
              const isImported = importedBuildings.has(building.building_name);
              const typeGroups = groupUnitsByType(building);

              return (
                <Collapsible
                  key={building.building_name}
                  open={isExpanded}
                  onOpenChange={() => toggleBuildingExpanded(building.building_name)}
                >
                  <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isImported 
                      ? "bg-success-surface border-success-border dark:bg-green-950/20 dark:border-green-800"
                      : isSelected 
                        ? "bg-primary/5 border-primary/20" 
                        : "bg-muted/50 hover:bg-muted"
                  }`}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleBuildingSelection(building.building_name)}
                      disabled={isImported || importing}
                    />
                    
                    <CollapsibleTrigger className="flex items-center gap-2 flex-1 text-left">
                      {isExpanded ? (
                        <ChevronDown className="h-4 w-4 text-muted-foreground" />
                      ) : (
                        <ChevronRight className="h-4 w-4 text-muted-foreground" />
                      )}
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{building.building_name}</span>
                    </CollapsibleTrigger>

                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="flex items-center gap-1">
                        <DoorOpen className="h-3 w-3" />
                        {building.unit_count} units
                      </Badge>
                      <Badge variant="secondary">{typeGroups.length} types</Badge>
                      {isImported && (
                        <Badge className="bg-green-500 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          Imported
                        </Badge>
                      )}
                    </div>
                  </div>

                  <CollapsibleContent>
                    <div className="ml-10 mt-2 mb-3 p-3 rounded border bg-background">
                      <div className="text-xs text-muted-foreground mb-2">
                        Room Types (will be created as bookable categories):
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {typeGroups.map((group) => (
                          <Badge
                            key={group.type_name}
                            variant="outline"
                            className="text-xs py-1.5 px-3"
                          >
                            {group.type_name}
                            <span className="ml-1.5 font-bold text-primary">[{group.unit_count}]</span>
                          </Badge>
                        ))}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
