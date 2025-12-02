import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import {
  Key,
  AlertCircle,
  CheckCircle2,
  BedDouble,
  RefreshCw,
  CheckCircle,
  Briefcase,
  Layers,
  MapPin,
  Mail,
  LucideIcon,
  Settings,
} from "lucide-react";

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
    case "sendgrid":
      return Mail;
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

interface PMSCredentials {
  id: string;
  system_type: string;
  environment: string;
  username: string | null;
  password: string | null;
  is_active: boolean;
}

export default function AdminKeys() {
  const navigate = useNavigate();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { toast } = useToast();

  // Benson-specific state
  const [bensonCredentials, setBensonCredentials] = useState<PMSCredentials | null>(null);
  const [bensonUsername, setBensonUsername] = useState("");
  const [bensonPassword, setBensonPassword] = useState("");
  const [bensonEnvironment, setBensonEnvironment] = useState<"staging" | "production">("staging");
  const [editingBenson, setEditingBenson] = useState(false);
  const [savingBenson, setSavingBenson] = useState(false);

  useEffect(() => {
    fetchApiKeys();
    fetchBensonCredentials();
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

  const fetchBensonCredentials = async () => {
    const { data, error } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "benson")
      .maybeSingle();

    if (!error && data) {
      setBensonCredentials(data);
      setBensonEnvironment(data.environment as "staging" | "production");
    }
  };

  const handleUpdateKey = async (keyId: string) => {
    const { error } = await supabase.from("api_keys").update({ key_value: editValue }).eq("id", keyId);

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

  const handleSaveBensonCredentials = async () => {
    setSavingBenson(true);

    const credData = {
      system_type: "benson",
      environment: bensonEnvironment,
      username: bensonUsername || bensonCredentials?.username || null,
      password: bensonPassword || bensonCredentials?.password || null,
      is_active: true,
    };

    let error;
    if (bensonCredentials) {
      const result = await supabase.from("pms_credentials").update(credData).eq("id", bensonCredentials.id);
      error = result.error;
    } else {
      const result = await supabase.from("pms_credentials").insert(credData);
      error = result.error;
    }

    if (error) {
      toast({
        title: "Error saving credentials",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Credentials saved",
        description: "Benson credentials have been updated successfully",
      });
      setEditingBenson(false);
      setBensonUsername("");
      setBensonPassword("");
      fetchBensonCredentials();
    }
    setSavingBenson(false);
  };

  const isPlaceholder = (value: string | null) => {
    return !value || value.startsWith("placeholder_key_");
  };

  const requiredCount = apiKeys.filter((k) => k.is_required).length;
  const completedCount = apiKeys.filter((k) => k.is_required && !isPlaceholder(k.key_value)).length;

  // Group API keys: PMS systems vs Additional Services (Google Maps, SendGrid, etc.)
  const additionalServiceTypes = ["google", "sendgrid"];
  const pmsKeys = apiKeys
    .filter((k) => k.system_type && !additionalServiceTypes.includes(k.system_type) && k.system_type !== "benson")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  const additionalKeys = apiKeys
    .filter((k) => k.system_type && additionalServiceTypes.includes(k.system_type))
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
                <CardDescription className="mt-1">{apiKey.description}</CardDescription>
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
                <Button onClick={() => handleUpdateKey(apiKey.id)}>Save</Button>
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

  // Benson-specific card with username/password
  const renderBensonCard = () => {
    const isConfigured = bensonCredentials?.username && bensonCredentials?.password;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <Briefcase className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Benson PMS
                  <Badge variant="outline" className="ml-2">
                    HTTP Basic Auth
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  Property Management System integration using username/password authentication
                </CardDescription>
              </div>
            </div>
            <div>
              {isConfigured ? (
                <Badge variant="default" className="flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Configured
                </Badge>
              ) : (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Not Configured
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {editingBenson ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="benson-username">Username</Label>
                  <Input
                    id="benson-username"
                    value={bensonUsername}
                    onChange={(e) => setBensonUsername(e.target.value)}
                    placeholder={bensonCredentials?.username ? "••••••••" : "Enter username"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="benson-password">Password</Label>
                  <Input
                    id="benson-password"
                    type="password"
                    value={bensonPassword}
                    onChange={(e) => setBensonPassword(e.target.value)}
                    placeholder={bensonCredentials?.password ? "••••••••" : "Enter password"}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Label className="text-sm">Environment:</Label>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm ${bensonEnvironment === "staging" ? "font-medium" : "text-muted-foreground"}`}
                  >
                    Staging
                  </span>
                  <Switch
                    checked={bensonEnvironment === "production"}
                    onCheckedChange={(checked) => setBensonEnvironment(checked ? "production" : "staging")}
                  />
                  <span
                    className={`text-sm ${bensonEnvironment === "production" ? "font-medium" : "text-muted-foreground"}`}
                  >
                    Production
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSaveBensonCredentials} disabled={savingBenson}>
                  {savingBenson ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingBenson(false);
                    setBensonUsername("");
                    setBensonPassword("");
                  }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">Username</Label>
                  <p className="font-medium">{isConfigured ? "Configured" : "Not set"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Password</Label>
                  <p className="font-medium">{isConfigured ? "Configured" : "Not set"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Environment</Label>
                  <p className="font-medium capitalize">{bensonCredentials?.environment || "Staging"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p className="font-medium">{bensonCredentials?.is_active ? "Active" : "Inactive"}</p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditingBenson(true)}>
                  {isConfigured ? "Update Credentials" : "Configure"}
                </Button>
                <Button variant="default" onClick={() => navigate("/admin/benson-config")} disabled={!isConfigured}>
                  <Settings className="h-4 w-4 mr-2" />
                  Field Mappings
                </Button>
              </div>
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
            <p className="text-muted-foreground">Manage integration keys for external services</p>
            <div className="mt-4 flex items-center gap-2">
              <Badge variant={completedCount === requiredCount ? "default" : "secondary"}>
                {completedCount} / {requiredCount} Keys Configured
              </Badge>
            </div>
          </div>

          {/* PMS Systems Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Property Management Systems</h2>
            <div className="space-y-4">
              {/* Benson Card - Special handling */}
              {renderBensonCard()}

              {/* Other PMS Keys */}
              {pmsKeys.map(renderKeyCard)}
            </div>
          </div>

          {/* Additional Services Section */}
          {additionalKeys.length > 0 && (
            <div>
              <h2 className="text-xl font-semibold mb-4">Additional Services</h2>
              <div className="space-y-4">{additionalKeys.map(renderKeyCard)}</div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
