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
    case "resend":
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

  // Resend-specific state
  const [resendFromEmail, setResendFromEmail] = useState("");
  const [resendToEmail, setResendToEmail] = useState("");
  const [editingResend, setEditingResend] = useState(false);
  const [savingResend, setSavingResend] = useState(false);

  useEffect(() => {
    fetchApiKeys();
    fetchBensonCredentials();
    fetchResendConfig();
  }, []);

  const fetchResendConfig = async () => {
    const { data } = await supabase
      .from("api_keys")
      .select("*")
      .in("key_name", ["RESEND_FROM_EMAIL", "RESEND_TO_EMAIL"]);

    if (data) {
      const fromEmail = data.find((k) => k.key_name === "RESEND_FROM_EMAIL");
      const toEmail = data.find((k) => k.key_name === "RESEND_TO_EMAIL");
      if (fromEmail?.key_value) setResendFromEmail(fromEmail.key_value);
      if (toEmail?.key_value) setResendToEmail(toEmail.key_value);
    }
  };

  const handleSaveResendConfig = async () => {
    setSavingResend(true);

    // Upsert from email
    const { error: fromError } = await supabase
      .from("api_keys")
      .upsert({
        key_name: "RESEND_FROM_EMAIL",
        name: "Resend From Email",
        key_value: resendFromEmail,
        system_type: "resend",
        description: "Sender email address for Resend notifications",
      }, { onConflict: "key_name" });

    // Upsert to email
    const { error: toError } = await supabase
      .from("api_keys")
      .upsert({
        key_name: "RESEND_TO_EMAIL",
        name: "Resend To Email",
        key_value: resendToEmail,
        system_type: "resend",
        description: "Recipient email address for admin notifications",
      }, { onConflict: "key_name" });

    if (fromError || toError) {
      toast({
        title: "Error saving email config",
        description: fromError?.message || toError?.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Email configuration saved",
        description: "Resend email settings have been updated",
      });
      setEditingResend(false);
      fetchApiKeys();
    }
    setSavingResend(false);
  };

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

  // Group API keys: PMS systems vs Additional Services (Google Maps, SendGrid, Resend, etc.)
  const additionalServiceTypes = ["google", "sendgrid", "resend"];
  const pmsKeys = apiKeys
    .filter((k) => k.system_type && !additionalServiceTypes.includes(k.system_type) && k.system_type !== "benson")
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Filter out Resend email config keys from additionalKeys since we handle them in custom card
  const resendEmailKeys = ["RESEND_FROM_EMAIL", "RESEND_TO_EMAIL"];
  const additionalKeys = apiKeys
    .filter((k) => k.system_type && additionalServiceTypes.includes(k.system_type) && !resendEmailKeys.includes(k.key_name))
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Check if Resend API key is configured
  const resendApiKey = apiKeys.find((k) => k.key_name === "RESEND_API_KEY");
  const isResendConfigured = resendApiKey && !isPlaceholder(resendApiKey.key_value);

  const renderResendCard = () => {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Resend Email Service
                  <Badge variant="outline" className="ml-2">
                    Email Delivery
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  Configure email sender and recipient addresses for notifications
                </CardDescription>
              </div>
            </div>
            <div>
              {isResendConfigured ? (
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
          {editingResend ? (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="resend-from">From Email</Label>
                  <Input
                    id="resend-from"
                    type="email"
                    value={resendFromEmail}
                    onChange={(e) => setResendFromEmail(e.target.value)}
                    placeholder="noreply@yourdomain.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Use onboarding@resend.dev for testing or verify your domain
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="resend-to">Admin Notification Email</Label>
                  <Input
                    id="resend-to"
                    type="email"
                    value={resendToEmail}
                    onChange={(e) => setResendToEmail(e.target.value)}
                    placeholder="admin@yourdomain.com"
                  />
                  <p className="text-xs text-muted-foreground">
                    Where access request notifications will be sent
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSaveResendConfig} disabled={savingResend}>
                  {savingResend ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => setEditingResend(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                <div>
                  <Label className="text-muted-foreground">From Email</Label>
                  <p className="font-medium truncate">{resendFromEmail || "Not set"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Admin Email</Label>
                  <p className="font-medium truncate">{resendToEmail || "Not set"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">API Key</Label>
                  <p className="font-medium">{isResendConfigured ? "Configured" : "Not set"}</p>
                </div>
              </div>

              {editingKey === resendApiKey?.id ? (
                <div className="space-y-3 mt-4 pt-4 border-t">
                  <div className="space-y-2">
                    <Label htmlFor="resend-api-key">API Key Value</Label>
                    <Input
                      id="resend-api-key"
                      type="password"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      placeholder="Enter Resend API key"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => handleUpdateKey(resendApiKey.id)}>Save</Button>
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
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingResend(true)}>
                    {resendFromEmail || resendToEmail ? "Update Email Settings" : "Configure Emails"}
                  </Button>
                  {resendApiKey && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        setEditingKey(resendApiKey.id);
                        setEditValue(resendApiKey.key_value || "");
                      }}
                    >
                      {isResendConfigured ? "Update API Key" : "Configure API Key"}
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

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
          <div>
            <h2 className="text-xl font-semibold mb-4">Additional Services</h2>
            <div className="space-y-4">
              {renderResendCard()}
              {additionalKeys.filter(k => k.key_name !== "RESEND_API_KEY").map(renderKeyCard)}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
