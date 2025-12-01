import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Key, AlertCircle, CheckCircle2, BedDouble, RefreshCw, CheckCircle, Briefcase, Layers, MapPin, LucideIcon } from "lucide-react";

// Map PMS system types to icons
const getPMSIcon = (systemType: string | null): LucideIcon => {
  switch (systemType) {
    case "nightsbridge":
      return BedDouble;
    case "semper":
      return RefreshCw;
    case "checkfront":
      return CheckCircle;
    case "benson":
      return Briefcase;
    case "siteminder":
      return Layers;
    case "google":
      return MapPin;
    default:
      return Key;
  }
};

interface ApiKey {
  id: string;
  name: string;
  key_name: string;
  key_value: string | null;
  is_required: boolean;
  description: string | null;
  system_type: string | null;
}

export default function AdminKeys() {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    fetchApiKeys();
  }, []);

  const fetchApiKeys = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("api_keys")
      .select("*")
      .order("is_required", { ascending: false })
      .order("name");

    if (error) {
      toast({
        title: "Error loading API keys",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setApiKeys(data || []);
    }
    setLoading(false);
  };

  const handleUpdateKey = async (keyId: string) => {
    const { error } = await supabase
      .from("api_keys")
      .update({ key_value: editValue })
      .eq("id", keyId);

    if (error) {
      toast({
        title: "Error updating key",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Key updated",
        description: "API key has been updated successfully",
      });
      setEditingKey(null);
      setEditValue("");
      fetchApiKeys();
    }
  };

  const isPlaceholder = (value: string | null) => {
    return !value || value.startsWith("placeholder_key_");
  };

  const requiredCount = apiKeys.filter((k) => k.is_required).length;
  const completedCount = apiKeys.filter(
    (k) => k.is_required && !isPlaceholder(k.key_value)
  ).length;

  // Group API keys: PMS systems vs Additional (Google Maps)
  const pmsKeys = apiKeys
    .filter((k) => k.system_type && k.system_type !== "google")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  
  const additionalKeys = apiKeys
    .filter((k) => k.system_type === "google")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const renderKeyCard = (apiKey: ApiKey) => {
    const isPlaceholderValue = isPlaceholder(apiKey.key_value);
    const isEditing = editingKey === apiKey.id;
    const IconComponent = getPMSIcon(apiKey.system_type);

    return (
      <Card key={apiKey.id}>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <IconComponent className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  {apiKey.name}
                  {apiKey.is_required && (
                    <Badge variant="outline" className="ml-2">
                      Required
                    </Badge>
                  )}
                </CardTitle>
                <CardDescription className="mt-1">
                  {apiKey.description}
                </CardDescription>
              </div>
            </div>
            <div>
              {isPlaceholderValue ? (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Not Configured
                </Badge>
              ) : (
                <Badge variant="default" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Configured
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isEditing ? (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label htmlFor={`key-${apiKey.id}`}>API Key Value</Label>
                <Input
                  id={`key-${apiKey.id}`}
                  type="password"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  placeholder="Enter API key"
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={() => handleUpdateKey(apiKey.id)}>
                  Save
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingKey(null);
                    setEditValue("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="font-mono text-sm text-muted-foreground">
                {isPlaceholderValue ? (
                  <span className="italic">No key configured - using placeholder</span>
                ) : (
                  <span>••••••••••••••••</span>
                )}
              </div>
              <Button
                variant="outline"
                onClick={() => {
                  setEditingKey(apiKey.id);
                  setEditValue(apiKey.key_value || "");
                }}
              >
                {isPlaceholderValue ? "Configure" : "Update"}
              </Button>
            </div>
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
        <div className="max-w-4xl mx-auto">
          <div className="mb-8">
            <h1 className="text-4xl font-bold mb-2">API Keys Management</h1>
            <p className="text-muted-foreground">
              Manage integration keys for external services
            </p>
            <div className="mt-4 flex items-center gap-2">
              <Badge variant={completedCount === requiredCount ? "default" : "secondary"}>
                {completedCount} / {requiredCount} Required Keys Configured
              </Badge>
            </div>
          </div>

          {/* PMS Systems Section */}
          {pmsKeys.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4">Property Management Systems</h2>
              <div className="space-y-4">
                {pmsKeys.map(renderKeyCard)}
              </div>
            </div>
          )}

          {/* Additional Services Section */}
          {additionalKeys.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Additional Services</h2>
              <div className="space-y-4">
                {additionalKeys.map(renderKeyCard)}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
