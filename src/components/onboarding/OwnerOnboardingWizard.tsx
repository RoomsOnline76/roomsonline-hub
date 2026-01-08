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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  AlertCircle,
  Building2,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface PendingCredential {
  id: string;
  system_type: string;
  sync_status: string;
  api_key: string | null;
  environment: string | null;
  external_account_name: string | null;
}

interface HostfullyProperty {
  id: string;
  name: string;
  bedrooms?: number;
  bathrooms?: number;
  max_guests?: number;
  city?: string;
  base_price?: number;
  currency?: string;
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
  const hostfullyEnvironment = "production"; // Always production for owners
  const [hostfullyAgencyInfo, setHostfullyAgencyInfo] = useState<HostfullyAgencyInfo | null>(null);
  const [hostfullyProperties, setHostfullyProperties] = useState<HostfullyProperty[]>([]);
  const [selectedHostfullyProperties, setSelectedHostfullyProperties] = useState<Set<string>>(new Set());
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
      setHostfullyProperties([]);
      setSelectedHostfullyProperties(new Set());
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
      const { data, error } = await supabase.functions.invoke("hostfully-api", {
        body: {
          action: "validate_api_key",
          api_key: hostfullyApiKey.trim(),
          environment: hostfullyEnvironment,
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

      // Fetch properties
      await fetchHostfullyProperties();
    } catch (err: any) {
      console.error("Failed to validate Hostfully API key:", err);
      setKeyError(err.message || "Failed to validate API key");
      setKeyValidated(false);
    } finally {
      setValidatingKey(false);
    }
  };

  const fetchHostfullyProperties = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("hostfully-api", {
        body: {
          action: "list_properties",
          api_key: hostfullyApiKey.trim(),
          environment: hostfullyEnvironment,
        },
      });

      if (error) throw error;

      if (data?.success && data.data?.properties) {
        setHostfullyProperties(data.data.properties);
        setSelectedHostfullyProperties(new Set(data.data.properties.map((p: HostfullyProperty) => p.id)));
      }
    } catch (err) {
      console.error("Failed to fetch Hostfully properties:", err);
      toast.error("Failed to fetch properties from Hostfully");
    }
  };

  const togglePropertySelection = (propertyId: string) => {
    setSelectedHostfullyProperties(prev => {
      const newSet = new Set(prev);
      if (newSet.has(propertyId)) {
        newSet.delete(propertyId);
      } else {
        newSet.add(propertyId);
      }
      return newSet;
    });
  };

  const toggleAllProperties = () => {
    if (selectedHostfullyProperties.size === hostfullyProperties.length) {
      setSelectedHostfullyProperties(new Set());
    } else {
      setSelectedHostfullyProperties(new Set(hostfullyProperties.map(p => p.id)));
    }
  };

  const handleCompleteSetup = async () => {
    if (!hostfullyCredential || !keyValidated) return;

    setImporting(true);

    try {
      // Update the credential with the API key
      const { error: updateError } = await supabase
        .from("owner_pms_credentials")
        .update({
          api_key: hostfullyApiKey.trim(),
          environment: hostfullyEnvironment,
          external_account_id: hostfullyAgencyInfo?.uid,
          external_account_name: hostfullyAgencyInfo?.name,
          sync_status: "active",
          last_sync_at: new Date().toISOString(),
        })
        .eq("id", hostfullyCredential.id);

      if (updateError) throw updateError;

      // Import selected properties
      if (selectedHostfullyProperties.size > 0) {
        const propertiesToImport = hostfullyProperties.filter(p => 
          selectedHostfullyProperties.has(p.id)
        );

        for (const property of propertiesToImport) {
          // Fetch full property details from Hostfully
          const { data: detailData, error: detailError } = await supabase.functions.invoke(
            "hostfully-api",
            {
              body: {
                action: "get_property",
                api_key: hostfullyApiKey.trim(),
                environment: hostfullyEnvironment,
                property_uid: property.id,
              },
            }
          );

          if (detailError) {
            console.error(`Failed to fetch details for ${property.name}:`, detailError);
            continue;
          }

          const propDetails = detailData?.data || property;

          // Create property in database
          const { error: insertError } = await supabase.from("properties").insert({
            name: propDetails.name || property.name,
            address: propDetails.address || "Address pending",
            city: propDetails.city || "City pending",
            country: propDetails.country || "Country pending",
            property_type: "Holiday rental",
            max_guests: propDetails.max_guests || 4,
            bedrooms: propDetails.bedrooms || 1,
            bathrooms: propDetails.bathrooms || 1,
            price_per_night: propDetails.base_price || 100,
            description: propDetails.description || null,
            images: propDetails.images || null,
            amenities: propDetails.amenities || null,
            external_system: "hostfully",
            external_id: property.id,
            hostfully_property_uid: property.id,
            owner_pms_credential_id: hostfullyCredential.id,
            pms_managed_fields: ["name", "description", "images", "amenities", "max_guests", "bedrooms", "bathrooms"],
            is_active: true,
          });

          if (insertError) {
            console.error(`Failed to import ${property.name}:`, insertError);
          }
        }
      }

      toast.success(
        `${selectedHostfullyProperties.size} ${
          selectedHostfullyProperties.size === 1 ? "property" : "properties"
        } imported successfully!`
      );
      onComplete();
    } catch (err: any) {
      console.error("Failed to complete setup:", err);
      toast.error(err.message || "Failed to complete setup");
    } finally {
      setImporting(false);
    }
  };

  const ownerName = profile?.full_name?.split(" ")[0] || "there";

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-hidden flex flex-col" hideCloseButton>
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
                          setHostfullyProperties([]);
                          setSelectedHostfullyProperties(new Set());
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

                {keyValidated && hostfullyProperties.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Select properties to import ({hostfullyProperties.length} available)</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={toggleAllProperties}
                        className="text-xs h-7"
                        disabled={importing}
                      >
                        {selectedHostfullyProperties.size === hostfullyProperties.length ? "Deselect All" : "Select All"}
                      </Button>
                    </div>
                    <ScrollArea className="h-48 border rounded-md">
                      <div className="p-2 space-y-1">
                        {hostfullyProperties.map((property) => (
                          <div
                            key={property.id}
                            className={`flex items-center gap-3 p-2 rounded cursor-pointer transition-colors ${
                              selectedHostfullyProperties.has(property.id)
                                ? "bg-primary/10"
                                : "hover:bg-muted/50"
                            }`}
                            onClick={() => !importing && togglePropertySelection(property.id)}
                          >
                            <Checkbox
                              checked={selectedHostfullyProperties.has(property.id)}
                              onCheckedChange={() => togglePropertySelection(property.id)}
                              disabled={importing}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium truncate">{property.name}</p>
                              <p className="text-xs text-muted-foreground">
                                {[
                                  property.bedrooms && `${property.bedrooms} bed`,
                                  property.max_guests && `${property.max_guests} guests`,
                                  property.city,
                                ].filter(Boolean).join(" • ")}
                              </p>
                            </div>
                            {property.base_price && (
                              <Badge variant="outline" className="text-xs">
                                {property.currency || "$"}{property.base_price}/night
                              </Badge>
                            )}
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                    <p className="text-xs text-muted-foreground">
                      {selectedHostfullyProperties.size} {selectedHostfullyProperties.size === 1 ? "property" : "properties"} will be imported
                    </p>
                  </div>
                )}

                {keyValidated && hostfullyProperties.length === 0 && (
                  <p className="text-sm text-muted-foreground">No properties found in this Hostfully account.</p>
                )}
              </div>
            </div>
          )}

          {!hostfullyCredential && pendingCredentials.length > 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <p>You have {pendingCredentials.length} pending PMS connection(s).</p>
              <p className="text-sm">Support for additional systems coming soon.</p>
            </div>
          )}
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
          <Button
            onClick={handleCompleteSetup}
            disabled={!keyValidated || selectedHostfullyProperties.size === 0 || importing}
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
        </div>
      </DialogContent>
    </Dialog>
  );
}
