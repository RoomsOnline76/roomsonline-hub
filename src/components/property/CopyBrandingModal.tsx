import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, Building2, Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { BrandingData } from "./BrandingTab";

interface CopyBrandingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  sourcePropertyId: string;
  brandingData: BrandingData;
  ownerEmail: string;
}

function ColorSwatch({ color, label }: { color: string; label: string }) {
  if (!color) return null;
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-5 w-5 rounded border border-border shrink-0"
        style={{ backgroundColor: color }}
      />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}

export function CopyBrandingModal({
  open,
  onOpenChange,
  sourcePropertyId,
  brandingData,
  ownerEmail,
}: CopyBrandingModalProps) {
  const [selectedProperties, setSelectedProperties] = useState<string[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: ownerProperties, isLoading } = useQuery({
    queryKey: ["owner-properties-branding", ownerEmail],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, city")
        .eq("owner_email", ownerEmail)
        .eq("is_active", true)
        .neq("id", sourcePropertyId)
        .order("name");
      if (error) throw error;
      return data;
    },
    enabled: open && !!ownerEmail,
  });

  const copyMutation = useMutation({
    mutationFn: async (targetIds: string[]) => {
      const updatePayload = {
        brand_logo_url: brandingData.brand_logo_url || null,
        brand_primary_color: brandingData.brand_primary_color || null,
        brand_secondary_color: brandingData.brand_secondary_color || null,
        brand_font_color: brandingData.brand_font_color || null,
        brand_override_enabled: brandingData.brand_override_enabled,
      };

      const { error } = await supabase
        .from("properties")
        .update(updatePayload)
        .in("id", targetIds);

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Branding copied",
        description: `Branding applied to ${selectedProperties.length} propert${selectedProperties.length === 1 ? "y" : "ies"}.`,
      });
      queryClient.invalidateQueries({ queryKey: ["owner-properties-branding"] });
      onOpenChange(false);
      setSelectedProperties([]);
    },
    onError: (error) => {
      console.error("Copy branding error:", error);
      toast({
        title: "Copy failed",
        description: "Could not copy branding. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleToggleProperty = (propertyId: string) => {
    setSelectedProperties((prev) =>
      prev.includes(propertyId)
        ? prev.filter((id) => id !== propertyId)
        : [...prev, propertyId]
    );
  };

  const handleSelectAll = () => {
    if (ownerProperties) setSelectedProperties(ownerProperties.map((p) => p.id));
  };

  const handleDeselectAll = () => setSelectedProperties([]);

  const handleCopy = () => copyMutation.mutate(selectedProperties);

  const hasContent =
    brandingData.brand_logo_url ||
    brandingData.brand_primary_color ||
    brandingData.brand_secondary_color ||
    brandingData.brand_font_color;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Copy Branding to Other Properties</DialogTitle>
          <DialogDescription>
            Apply the current branding (logo & colours) to your other properties.
          </DialogDescription>
        </DialogHeader>

        {/* Preview of what will be copied */}
        {hasContent && (
          <div className="space-y-2 p-3 bg-muted/50 rounded-lg">
            <Label className="text-xs font-medium">What will be copied</Label>
            <div className="flex flex-wrap gap-3">
              <ColorSwatch color={brandingData.brand_primary_color} label="Primary" />
              <ColorSwatch color={brandingData.brand_secondary_color} label="Secondary" />
              <ColorSwatch color={brandingData.brand_font_color} label="Font" />
            </div>
            {brandingData.brand_logo_url && (
              <div className="flex items-center gap-2 mt-1">
                <img
                  src={brandingData.brand_logo_url}
                  alt="Logo"
                  className="max-h-6 max-w-[100px] object-contain"
                />
                <span className="text-xs text-muted-foreground">Logo</span>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              Brand override: {brandingData.brand_override_enabled ? "Enabled" : "Disabled"}
            </p>
          </div>
        )}

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : !ownerProperties || ownerProperties.length === 0 ? (
          <div className="py-8 text-center">
            <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <p className="text-muted-foreground">No other properties found for this owner.</p>
          </div>
        ) : (
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
                {ownerProperties.map((property) => (
                  <div
                    key={property.id}
                    className="flex items-start space-x-3 p-2 rounded hover:bg-muted/50"
                  >
                    <Checkbox
                      id={`brand-${property.id}`}
                      checked={selectedProperties.includes(property.id)}
                      onCheckedChange={() => handleToggleProperty(property.id)}
                    />
                    <div className="flex-1 min-w-0">
                      <Label
                        htmlFor={`brand-${property.id}`}
                        className="font-medium cursor-pointer block truncate"
                      >
                        {property.name}
                      </Label>
                      <p className="text-xs text-muted-foreground">{property.city}</p>
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleCopy}
            disabled={selectedProperties.length === 0 || copyMutation.isPending}
          >
            {copyMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            <Copy className="h-4 w-4 mr-2" />
            Copy to {selectedProperties.length} Propert{selectedProperties.length === 1 ? "y" : "ies"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
