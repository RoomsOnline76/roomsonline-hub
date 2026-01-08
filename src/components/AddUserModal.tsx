import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { z } from "zod";
import { ACTIVE_PMS_SYSTEMS } from "@/lib/pmsSystemsConfig";
import { Loader2, CheckCircle2, AlertCircle, Building2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";

const userSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required").max(100),
  email: z.string().trim().email("Invalid email address").max(255),
});

interface HostfullyProperty {
  id: string;
  name: string;
  status?: string;
  bedrooms?: number;
  bathrooms?: number;
  max_guests?: number;
  address?: string;
  city?: string;
  country?: string;
  base_price?: number;
  currency?: string;
}

interface HostfullyAgencyInfo {
  uid: string;
  name: string | null;
  propertyCount: number;
}

interface AddUserModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role: "admin" | "user";
  onUserAdded: () => void;
  defaultEmail?: string;
  defaultName?: string;
}

export function AddUserModal({ open, onOpenChange, role, onUserAdded, defaultEmail, defaultName }: AddUserModalProps) {
  const [formData, setFormData] = useState({
    full_name: defaultName || "",
    email: defaultEmail || "",
  });
  const [selectedPMSSystems, setSelectedPMSSystems] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  // Hostfully-specific state
  const [hostfullyApiKey, setHostfullyApiKey] = useState("");
  const [hostfullyEnvironment, setHostfullyEnvironment] = useState<"production" | "sandbox">("production");
  const [hostfullyAgencyInfo, setHostfullyAgencyInfo] = useState<HostfullyAgencyInfo | null>(null);
  const [hostfullyProperties, setHostfullyProperties] = useState<HostfullyProperty[]>([]);
  const [selectedHostfullyProperties, setSelectedHostfullyProperties] = useState<Set<string>>(new Set());
  const [validatingKey, setValidatingKey] = useState(false);
  const [keyValidated, setKeyValidated] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [ownerWillProvideKey, setOwnerWillProvideKey] = useState(false);

  const isHostfullySelected = selectedPMSSystems.includes("hostfully");

  useEffect(() => {
    if (open) {
      setFormData({
        full_name: defaultName || "",
        email: defaultEmail || "",
      });
      setSelectedPMSSystems([]);
      resetHostfullyState();
    }
  }, [open, defaultEmail, defaultName]);

  const resetHostfullyState = () => {
    setHostfullyApiKey("");
    setHostfullyEnvironment("production");
    setHostfullyAgencyInfo(null);
    setHostfullyProperties([]);
    setSelectedHostfullyProperties(new Set());
    setKeyValidated(false);
    setKeyError(null);
    setOwnerWillProvideKey(false);
  };

  const handlePMSChange = (value: string) => {
    if (value === "none") {
      setSelectedPMSSystems([]);
      resetHostfullyState();
    } else {
      setSelectedPMSSystems([value]);
      if (value !== "hostfully") {
        resetHostfullyState();
      }
    }
  };

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

      // Automatically fetch properties
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
        // Select all by default
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      // Validate form data
      const validated = userSchema.parse(formData);
      
      // Validate Hostfully requirements if selected and admin is providing key
      if (isHostfullySelected && !ownerWillProvideKey && !keyValidated) {
        toast.error("Please validate the Hostfully API key first");
        return;
      }

      setLoading(true);

      // Build payload
      const payload: Record<string, any> = {
        email: validated.email,
        full_name: validated.full_name,
        role: role,
        pms_systems: role === "user" ? selectedPMSSystems : undefined,
      };

      // Add Hostfully-specific data if selected
      if (isHostfullySelected) {
        if (ownerWillProvideKey) {
          // Owner will provide key on first login - just mark as pending
          payload.hostfully_owner_will_provide = true;
        } else if (keyValidated) {
          // Admin provided key - include full details
          payload.hostfully_api_key = hostfullyApiKey.trim();
          payload.hostfully_environment = hostfullyEnvironment;
          payload.hostfully_agency_uid = hostfullyAgencyInfo?.uid;
          payload.selected_property_uids = Array.from(selectedHostfullyProperties);
        }
      }

      // Call edge function to create user
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: payload,
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      const propertyCount = selectedHostfullyProperties.size;
      let successMessage: string;
      if (ownerWillProvideKey) {
        successMessage = "Property Owner created. They will complete PMS setup on first login.";
      } else if (propertyCount > 0) {
        successMessage = `${role === "admin" ? "Admin" : "Property Owner"} created with ${propertyCount} ${propertyCount === 1 ? "property" : "properties"} imported`;
      } else {
        successMessage = `${role === "admin" ? "Admin" : "Property Owner"} created successfully`;
      }

      toast.success(successMessage);
      setFormData({ full_name: "", email: "" });
      setSelectedPMSSystems([]);
      resetHostfullyState();
      onOpenChange(false);
      onUserAdded();
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error(error.message || "Failed to create user");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add {role === "admin" ? "Admin" : "Property Owner"}</DialogTitle>
          <DialogDescription>
            Create a new {role === "admin" ? "admin" : "property owner"} account. They will receive an email to set their password.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="full_name">Full Name</Label>
            <Input
              id="full_name"
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
              placeholder="John Doe"
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              placeholder="john@example.com"
              required
            />
          </div>

          {role === "user" && (
            <>
              <div className="space-y-2">
                <Label>Which PMS do they use? <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Select
                  value={selectedPMSSystems[0] || "none"}
                  onValueChange={handlePMSChange}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select PMS (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {ACTIVE_PMS_SYSTEMS.map((system) => (
                      <SelectItem key={system.key} value={system.key}>
                        {system.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Hostfully Configuration Section */}
              {isHostfullySelected && (
                <div className="space-y-4 border rounded-lg p-4 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <Label className="font-medium">Hostfully Configuration</Label>
                  </div>

                  {/* Toggle: Admin provides key OR owner will provide */}
                  <div className="space-y-2">
                    <div 
                      className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        !ownerWillProvideKey ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => setOwnerWillProvideKey(false)}
                    >
                      <input
                        type="radio"
                        name="hostfully-key-mode"
                        checked={!ownerWillProvideKey}
                        onChange={() => setOwnerWillProvideKey(false)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">I have the API key</p>
                        <p className="text-xs text-muted-foreground">Enter the key now to import properties</p>
                      </div>
                    </div>
                    <div 
                      className={`flex items-center gap-3 p-3 rounded-md border cursor-pointer transition-colors ${
                        ownerWillProvideKey ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                      }`}
                      onClick={() => {
                        setOwnerWillProvideKey(true);
                        resetHostfullyState();
                        setOwnerWillProvideKey(true); // Re-set after reset
                      }}
                    >
                      <input
                        type="radio"
                        name="hostfully-key-mode"
                        checked={ownerWillProvideKey}
                        onChange={() => setOwnerWillProvideKey(true)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium">Owner will provide key on first login</p>
                        <p className="text-xs text-muted-foreground">They'll see a setup wizard when they log in</p>
                      </div>
                    </div>
                  </div>

                  {/* Only show API key input if admin is providing */}
                  {!ownerWillProvideKey && (
                    <div className="space-y-3">
                      <div className="space-y-2">
                        <Label htmlFor="hostfully-api-key">API Key</Label>
                        <div className="flex gap-2">
                          <Input
                            id="hostfully-api-key"
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
                            placeholder="FzNI0hVYcB2PjmTs"
                            disabled={validatingKey}
                            className="font-mono text-sm"
                          />
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={validateHostfullyKey}
                            disabled={validatingKey || !hostfullyApiKey.trim()}
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

                      <div className="space-y-2">
                        <Label htmlFor="hostfully-env">Environment</Label>
                        <Select
                          value={hostfullyEnvironment}
                          onValueChange={(v) => {
                            setHostfullyEnvironment(v as "production" | "sandbox");
                            if (keyValidated) {
                              setKeyValidated(false);
                              setHostfullyAgencyInfo(null);
                              setHostfullyProperties([]);
                              setSelectedHostfullyProperties(new Set());
                            }
                          }}
                        >
                          <SelectTrigger id="hostfully-env">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="production">Production</SelectItem>
                            <SelectItem value="sandbox">Sandbox</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Agency Info */}
                      {keyValidated && hostfullyAgencyInfo && (
                        <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded-md border border-green-200 dark:border-green-800">
                          <CheckCircle2 className="h-4 w-4 text-green-600" />
                          <span className="text-sm">
                            Connected to: <strong>{hostfullyAgencyInfo.name || "Unnamed Agency"}</strong>
                          </span>
                        </div>
                      )}

                      {/* Property Selection */}
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
                                  onClick={() => togglePropertySelection(property.id)}
                                >
                                  <Checkbox
                                    checked={selectedHostfullyProperties.has(property.id)}
                                    onCheckedChange={() => togglePropertySelection(property.id)}
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
                  )}
                </div>
              )}
            </>
          )}

          <div className="flex gap-2 justify-end pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Creating..." : "Create User"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
