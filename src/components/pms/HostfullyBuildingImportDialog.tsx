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
import { ScrollArea } from "@/components/ui/scroll-area";
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
} from "lucide-react";
import { ParsedBuilding, HostfullyUnit } from "@/lib/hostfullyBuildingParser";

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
  const [existingBuildingNames, setExistingBuildingNames] = useState<Set<string>>(new Set());

  // Check which buildings are already imported when dialog opens
  useEffect(() => {
    async function fetchExistingBuildings() {
      if (!open || !ownerCredentialId) return;
      
      const { data } = await supabase
        .from('properties')
        .select('name')
        .eq('owner_pms_credential_id', ownerCredentialId);
      
      if (data) {
        setExistingBuildingNames(new Set(data.map(p => p.name.toUpperCase())));
      }
    }
    fetchExistingBuildings();
  }, [open, ownerCredentialId]);

  const isAlreadyImported = (buildingName: string) => 
    existingBuildingNames.has(buildingName.toUpperCase());

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
    // Only select buildings that aren't already imported
    const selectableNames = new Set(
      buildings.filter(b => !isAlreadyImported(b.building_name)).map(b => b.building_name)
    );
    setSelectedBuildings(selectableNames);
  };

  const deselectAll = () => {
    setSelectedBuildings(new Set());
  };

  const importableCount = buildings.filter(b => !isAlreadyImported(b.building_name)).length;
  const alreadyImportedCount = buildings.length - importableCount;

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
            // Owner info
            owner_name: ownerName,
            owner_email: ownerEmail,
            // Default required fields
            property_type: "hotel",
            address: "Pending",
            city: "Pending",
            country: "South Africa",
            price_per_night: 0,
            max_guests: building.units.reduce((max, u) => Math.max(max, 2), 2),
          })
          .select("id")
          .single();

        if (propError) throw propError;

        // Create room types for each unit with their individual Hostfully UIDs
        const roomTypeInserts = building.units.map((unit: HostfullyUnit) => ({
          property_id: newProperty.id,
          hostfully_room_id: unit.id, // This is the unit's unique Hostfully UID
          name: unit.room_number && unit.room_type
            ? `${unit.room_number} ${unit.room_type}`
            : unit.name,
          is_active: true,
        }));

        const { error: roomError } = await supabase
          .from("hostfully_room_types")
          .insert(roomTypeInserts);

        if (roomError) {
          console.error("Error creating room types:", roomError);
          // Don't throw - property was created successfully
        }

        successCount++;
        // Update existingBuildingNames so the UI reflects the import immediately
        setExistingBuildingNames(prev => new Set(prev).add(buildingName.toUpperCase()));
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
            Select buildings to import as ROL properties. Each unit will be created as a room type.
            {alreadyImportedCount > 0 && (
              <span className="block mt-1 text-green-600">
                {alreadyImportedCount} building{alreadyImportedCount !== 1 ? 's' : ''} already imported.
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

        <ScrollArea className="flex-1 min-h-0 max-h-[400px] pr-4">
          <div className="space-y-2 py-2">
            {buildings.map((building) => {
              const isSelected = selectedBuildings.has(building.building_name);
              const isExpanded = expandedBuildings.has(building.building_name);
              const isImported = isAlreadyImported(building.building_name);

              return (
                <Collapsible
                  key={building.building_name}
                  open={isExpanded}
                  onOpenChange={() => toggleBuildingExpanded(building.building_name)}
                >
                  <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
                    isImported
                      ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-800"
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
                        Units in this building:
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {building.units.slice(0, 12).map((unit) => (
                          <div
                            key={unit.id}
                            className="text-xs p-2 rounded bg-muted flex items-center gap-2"
                          >
                            <span className="font-mono font-medium">{unit.room_number}</span>
                            <span className="text-muted-foreground">{unit.room_type}</span>
                          </div>
                        ))}
                        {building.units.length > 12 && (
                          <div className="text-xs p-2 text-muted-foreground">
                            +{building.units.length - 12} more...
                          </div>
                        )}
                      </div>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>

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
