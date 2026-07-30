import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Import,
  Loader2,
  DoorOpen,
  CheckCircle2,
  RefreshCw,
} from "lucide-react";
import { ParsedBuilding, groupUnitsByType } from "@/lib/hostfullyBuildingParser";

interface HostfullyBuildingImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  buildings: ParsedBuilding[];
  ownerCredentialId: string;
  ownerName: string;
  ownerEmail: string;
  onImportComplete: () => void;
}

export function HostfullyBuildingImportDialog({
  open,
  onOpenChange,
  buildings,
  ownerCredentialId,
  ownerName,
  ownerEmail,
  onImportComplete,
}: HostfullyBuildingImportDialogProps) {
  const [selectedBuildings, setSelectedBuildings] = useState<Set<string>>(new Set());
  const [expandedBuildings, setExpandedBuildings] = useState<Set<string>>(new Set());
  const [importing, setImporting] = useState(false);
  // Maps building name (uppercase) -> existing property id
  const [existingBuildingMap, setExistingBuildingMap] = useState<Map<string, string>>(new Map());

  // Check which buildings are already imported when dialog opens
  useEffect(() => {
    async function fetchExistingBuildings() {
      if (!open || !ownerCredentialId) return;
      
      const { data } = await supabase
        .from('properties')
        .select('id, name')
        .eq('owner_pms_credential_id', ownerCredentialId)
        .eq('is_active', true)
        .is('permanently_deleted_at', null);
      
      if (data) {
        const map = new Map<string, string>();
        data.forEach(p => map.set(p.name.toUpperCase(), p.id));
        setExistingBuildingMap(map);
      }
    }
    fetchExistingBuildings();
  }, [open, ownerCredentialId]);

  const isAlreadyImported = (buildingName: string) => 
    existingBuildingMap.has(buildingName.toUpperCase());

  const getExistingPropertyId = (buildingName: string) =>
    existingBuildingMap.get(buildingName.toUpperCase());

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

  const alreadyImportedCount = buildings.filter(b => isAlreadyImported(b.building_name)).length;

  const handleImport = async () => {
    if (selectedBuildings.size === 0) {
      toast.error("Please select at least one building to import");
      return;
    }

    setImporting(true);
    let successCount = 0;
    let errorCount = 0;

    for (const buildingName of selectedBuildings) {
      const building = buildings.find(b => b.building_name === buildingName);
      if (!building) continue;

      try {
        const existingPropId = getExistingPropertyId(buildingName);
        let propertyId: string;

        if (existingPropId) {
          // Re-import: clear existing room types, unit maps, and availability cache
          propertyId = existingPropId;

          // Delete unit map entries first (FK dependency)
          await supabase
            .from("hostfully_unit_map" as never)
            .delete()
            .eq("property_id", propertyId);

          // Delete existing room types
          await supabase
            .from("hostfully_room_types")
            .delete()
            .eq("property_id", propertyId);

          // Clear stale availability cache to prevent old room ID mismatches
          await supabase
            .from("pms_availability_cache")
            .delete()
            .eq("property_id", propertyId)
            .eq("system_type", "hostfully");

          // Update property record
          await supabase
            .from("properties")
            .update({
              external_id: building.sample_hostfully_uid,
              hostfully_property_uid: building.sample_hostfully_uid,
              pms_sync_status: "synced",
              max_guests: building.units.reduce((max) => Math.max(max, 2), 2),
            })
            .eq("id", propertyId);
        } else {
          // New import: create property
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
              owner_name: ownerName,
              owner_email: ownerEmail,
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
          propertyId = newProperty.id;
        }

        // Step 1: Full ingestion with skipRooms (property metadata only)
        try {
          const { data: ingestResult, error: ingestError } = await supabase.functions.invoke(
            "hostfully-api",
            {
              body: {
                action: "full_ingest_property",
                propertyUid: building.sample_hostfully_uid,
                rol_property_id: propertyId,
                owner_credential_id: ownerCredentialId,
                skipRooms: true,
              },
            }
          );
          
          if (ingestError) {
            console.warn("Full ingestion (metadata) failed:", ingestError);
          } else {
            console.log("Full ingestion (metadata) completed:", ingestResult);
          }
        } catch (ingestErr) {
          console.warn("Ingestion metadata error:", ingestErr);
        }

        // Step 2: Unit-level ingestion for proper room type aggregation
        try {
          const { data: unitResult, error: unitError } = await supabase.functions.invoke(
            "hostfully-api",
            {
              body: {
                action: "ingest_building_units",
                rol_property_id: propertyId,
                owner_credential_id: ownerCredentialId,
              },
            }
          );

          if (unitError) {
            console.warn("Unit ingestion failed, falling back to type-grouped creation:", unitError);
            await createRoomTypesFallback(propertyId, building);
          } else {
            console.log("Unit ingestion completed:", unitResult);
          }
        } catch (unitErr) {
          console.warn("Unit ingestion error, falling back:", unitErr);
          await createRoomTypesFallback(propertyId, building);
        }

        successCount++;
        setExistingBuildingMap(prev => {
          const next = new Map(prev);
          next.set(buildingName.toUpperCase(), propertyId);
          return next;
        });
      } catch (error: any) {
        console.error(`Error importing ${buildingName}:`, error);
        errorCount++;
      }
    }

    setImporting(false);

    if (successCount > 0) {
      toast.success(
        `Imported ${successCount} building(s)${errorCount > 0 ? `, ${errorCount} failed` : ""}`
      );
      onImportComplete();
      onOpenChange(false);
    } else {
      toast.error("Could not import any buildings. Check console for details.");
    }
  };

  /** Fallback: group units by type and create aggregated room type rows + unit map */
  async function createRoomTypesFallback(propertyId: string, building: ParsedBuilding) {
    const typeGroups = groupUnitsByType(building);

    for (const group of typeGroups) {
      const { data: roomType, error: roomError } = await supabase
        .from("hostfully_room_types")
        .insert({
          property_id: propertyId,
          hostfully_room_id: group.unit_ids[0],
          name: group.type_name,
          total_units: group.unit_count,
          property_type: group.type_name,
          is_active: true,
        })
        .select("id")
        .single();

      if (roomError) {
        console.error(`Error creating room type ${group.type_name}:`, roomError);
        continue;
      }

      const unitMapInserts = group.unit_ids.map((uid, idx) => ({
        room_type_id: roomType.id,
        property_id: propertyId,
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
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Import Buildings from Hostfully
            <Badge variant="secondary">{buildings.length} buildings</Badge>
          </DialogTitle>
          <DialogDescription>
            Select buildings to import as ROL properties. Units are grouped into room types.
            {alreadyImportedCount > 0 && (
              <span className="block mt-1 text-success">
                {alreadyImportedCount} building{alreadyImportedCount !== 1 ? 's' : ''} already imported — re-selecting will overwrite.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 py-2 border-b">
          <Button variant="outline" size="sm" onClick={selectAll}>
            Select All
          </Button>
          <Button variant="outline" size="sm" onClick={deselectAll}>
            Deselect All
          </Button>
          <div className="flex-1" />
          <Badge variant="outline">
            {selectedBuildings.size} of {buildings.length} selected
          </Badge>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto pr-2">
          <div className="space-y-2 py-2">
            {buildings.map((building) => {
              const isSelected = selectedBuildings.has(building.building_name);
              const isExpanded = expandedBuildings.has(building.building_name);
              const isImported = isAlreadyImported(building.building_name);
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
                      disabled={importing}
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
                          {isSelected ? (
                            <RefreshCw className="h-3 w-3" />
                          ) : (
                            <CheckCircle2 className="h-3 w-3" />
                          )}
                          {isSelected ? "Re-import" : "Imported"}
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

        <div className="flex justify-end gap-2 pt-4 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
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
            Import {selectedBuildings.size} Building{selectedBuildings.size !== 1 ? 's' : ''}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
