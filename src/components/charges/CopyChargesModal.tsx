import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertTriangle, Building2 } from "lucide-react";
import { usePropertyCharges } from "@/hooks/usePropertyCharges";
import type { PropertyCharge } from "./ChargeCalculator";

interface CopyChargesModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcePropertyId: string;
  sourceCharges: PropertyCharge[];
  ownerEmail: string;
}

export function CopyChargesModal({
  open,
  onOpenChange,
  sourcePropertyId,
  sourceCharges,
  ownerEmail,
}: CopyChargesModalProps) {
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const [copyMode, setCopyMode] = useState<'replace' | 'merge'>('merge');
  
  const { copyCharges } = usePropertyCharges(sourcePropertyId);

  // Fetch other properties owned by the same owner
  const { data: ownerProperties, isLoading } = useQuery({
    queryKey: ['owner-properties', ownerEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('properties')
        .select('id, name, city')
        .eq('owner_email', ownerEmail)
        .neq('id', sourcePropertyId)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: open && !!ownerEmail,
  });

  // Fetch existing charge counts for properties
  const { data: chargeCounts } = useQuery({
    queryKey: ['property-charge-counts', ownerProperties?.map(p => p.id)],
    queryFn: async () => {
      if (!ownerProperties) return {};
      const counts: Record<string, number> = {};
      
      for (const prop of ownerProperties) {
        const { count } = await supabase
          .from('property_charges')
          .select('*', { count: 'exact', head: true })
          .eq('property_id', prop.id);
        counts[prop.id] = count || 0;
      }
      
      return counts;
    },
    enabled: !!ownerProperties && ownerProperties.length > 0,
  });

  const handleToggleProperty = (propertyId: string) => {
    setSelectedProperties(prev => 
      prev.includes(propertyId)
        ? prev.filter(id => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleSelectAll = () => {
    if (ownerProperties) {
      setSelectedProperties(ownerProperties.map(p => p.id));
    }
  };

  const handleDeselectAll = () => {
    setSelectedProperties([]);
  };

  const handleCopy = () => {
    copyCharges.mutate(
      {
        sourceCharges,
        targetPropertyIds: selectedProperties,
        mode: copyMode,
      },
      {
        onSuccess: () => {
          onOpenChange(false);
          setSelectedProperties([]);
        },
      }
    );
  };

  const propertiesWithExistingCharges = ownerProperties?.filter(
    p => (chargeCounts?.[p.id] || 0) > 0
  ) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy Charges to Other Properties</DialogTitle>
          <DialogDescription>
            Copy {sourceCharges.length} charge{sourceCharges.length !== 1 ? 's' : ''} to your other properties.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !ownerProperties || ownerProperties.length === 0 ? (
          <div className="py-8 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">
              No other properties found for this owner.
            </p>
          </div>
        ) : (
          <>
            {/* Copy Mode Selection */}
            <div className="space-y-3 p-4 bg-muted/50 rounded-lg">
              <Label className="font-medium">Copy Mode</Label>
              <RadioGroup value={copyMode} onValueChange={(v) => setCopyMode(v as 'replace' | 'merge')}>
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="merge" id="merge" />
                  <div className="space-y-1">
                    <Label htmlFor="merge" className="font-normal cursor-pointer">
                      Merge (recommended)
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Add new charges, skip duplicates
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="replace" id="replace" />
                  <div className="space-y-1">
                    <Label htmlFor="replace" className="font-normal cursor-pointer">
                      Replace all
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Delete existing charges first
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {/* Warning for replace mode */}
            {copyMode === 'replace' && propertiesWithExistingCharges.length > 0 && (
              <div className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-950/50 text-amber-800 dark:text-amber-200 rounded-lg text-sm">
                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="font-medium">Warning</p>
                  <p className="text-xs mt-1">
                    {propertiesWithExistingCharges.length} selected propert{propertiesWithExistingCharges.length === 1 ? 'y has' : 'ies have'} existing charges that will be deleted.
                  </p>
                </div>
              </div>
            )}

            {/* Property Selection */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Select Properties</Label>
                <div className="space-x-2">
                  <Button variant="ghost" size="sm" onClick={handleSelectAll}>
                    Select All
                  </Button>
                  <Button variant="ghost" size="sm" onClick={handleDeselectAll}>
                    Clear
                  </Button>
                </div>
              </div>

              <ScrollArea className="h-64 border rounded-lg p-4">
                <div className="space-y-3">
                  {ownerProperties.map((property) => {
                    const existingCount = chargeCounts?.[property.id] || 0;
                    return (
                      <div 
                        key={property.id} 
                        className="flex items-start space-x-3 p-2 rounded hover:bg-muted/50"
                      >
                        <Checkbox
                          id={property.id}
                          checked={selectedProperties.includes(property.id)}
                          onCheckedChange={() => handleToggleProperty(property.id)}
                        />
                        <div className="flex-1 min-w-0">
                          <Label 
                            htmlFor={property.id} 
                            className="font-medium cursor-pointer block truncate"
                          >
                            {property.name}
                          </Label>
                          <p className="text-xs text-muted-foreground">
                            {property.city}
                          </p>
                        </div>
                        {existingCount > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {existingCount} existing
                          </Badge>
                        )}
                      </div>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCopy} 
            disabled={selectedProperties.length === 0 || copyCharges.isPending}
          >
            {copyCharges.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Copy to {selectedProperties.length} Propert{selectedProperties.length === 1 ? 'y' : 'ies'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
