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
import { ApiMilestones } from "@/components/ApiMilestones";
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
  api_key: string | null;
  agent_code: string | null;
  property_code: string | null;
  property_name: string | null;
  base_url: string | null;
  is_active: boolean;
}

export default function AdminKeys() {
  const navigate = useNavigate();
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const { toast } = useToast();

  // Benson-specific state - separate for staging and production
  const [bensonStagingCredentials, setBensonStagingCredentials] = useState<PMSCredentials | null>(null);
  const [bensonProductionCredentials, setBensonProductionCredentials] = useState<PMSCredentials | null>(null);
  
  // Staging form state
  const [bensonStagingUsername, setBensonStagingUsername] = useState("");
  const [bensonStagingPassword, setBensonStagingPassword] = useState("");
  const [bensonStagingPropertyCode, setBensonStagingPropertyCode] = useState("");
  const [bensonStagingPropertyName, setBensonStagingPropertyName] = useState("");
  const [bensonStagingUrl, setBensonStagingUrl] = useState("");
  
  // Production form state
  const [bensonProductionUsername, setBensonProductionUsername] = useState("");
  const [bensonProductionPassword, setBensonProductionPassword] = useState("");
  const [bensonProductionPropertyCode, setBensonProductionPropertyCode] = useState("");
  const [bensonProductionPropertyName, setBensonProductionPropertyName] = useState("");
  const [bensonProductionUrl, setBensonProductionUrl] = useState("");
  
  const [editingBensonStaging, setEditingBensonStaging] = useState(false);
  const [editingBensonProduction, setEditingBensonProduction] = useState(false);
  const [savingBensonStaging, setSavingBensonStaging] = useState(false);
  const [savingBensonProduction, setSavingBensonProduction] = useState(false);

  // NightsBridge-specific state
  const [nightsbridgeCredentials, setNightsbridgeCredentials] = useState<PMSCredentials | null>(null);
  const [nightsbridgeApiKey, setNightsbridgeApiKey] = useState("");
  const [nightsbridgeAgentCode, setNightsbridgeAgentCode] = useState("");
  const [nightsbridgeEnvironment, setNightsbridgeEnvironment] = useState<"staging" | "production">("staging");
  const [editingNightsbridge, setEditingNightsbridge] = useState(false);
  const [savingNightsbridge, setSavingNightsbridge] = useState(false);

  // Checkfront-specific state (supports Token and OAuth2 auth)
  const [checkfrontCredentials, setCheckfrontCredentials] = useState<PMSCredentials | null>(null);
  const [checkfrontApiKey, setCheckfrontApiKey] = useState("");
  const [checkfrontApiSecret, setCheckfrontApiSecret] = useState("");
  const [checkfrontUsername, setCheckfrontUsername] = useState("");
  const [checkfrontPassword, setCheckfrontPassword] = useState("");
  const [checkfrontAuthMethod, setCheckfrontAuthMethod] = useState<"token" | "oauth2">("token");
  const [checkfrontEnvironment, setCheckfrontEnvironment] = useState<"staging" | "production">("staging");
  const [editingCheckfront, setEditingCheckfront] = useState(false);
  const [savingCheckfront, setSavingCheckfront] = useState(false);

  // Resend-specific state
  const [resendFromEmail, setResendFromEmail] = useState("");
  const [resendToEmail, setResendToEmail] = useState("");
  const [editingResend, setEditingResend] = useState(false);
  const [savingResend, setSavingResend] = useState(false);

  useEffect(() => {
    fetchApiKeys();
    fetchBensonCredentials();
    fetchNightsbridgeCredentials();
    fetchCheckfrontCredentials();
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
      .eq("system_type", "benson");

    if (!error && data) {
      const staging = data.find(d => d.environment === "staging");
      const production = data.find(d => d.environment === "production");
      setBensonStagingCredentials(staging || null);
      setBensonProductionCredentials(production || null);
    }
  };

  const fetchNightsbridgeCredentials = async () => {
    const { data, error } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "nightsbridge")
      .maybeSingle();

    if (!error && data) {
      setNightsbridgeCredentials(data);
      setNightsbridgeEnvironment(data.environment as "staging" | "production");
    }
  };

  const fetchCheckfrontCredentials = async () => {
    const { data, error } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "checkfront")
      .maybeSingle();

    if (!error && data) {
      setCheckfrontCredentials(data);
      setCheckfrontEnvironment(data.environment as "staging" | "production");
      // Determine auth method based on what's configured
      if (data.api_key || data.agent_code) {
        setCheckfrontAuthMethod("token");
      } else if (data.username || data.password) {
        setCheckfrontAuthMethod("oauth2");
      }
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

  const handleSaveBensonStagingCredentials = async () => {
    setSavingBensonStaging(true);

    const credData = {
      system_type: "benson",
      environment: "staging",
      username: bensonStagingUsername || bensonStagingCredentials?.username || null,
      password: bensonStagingPassword || bensonStagingCredentials?.password || null,
      property_code: bensonStagingPropertyCode || bensonStagingCredentials?.property_code || null,
      property_name: bensonStagingPropertyName || bensonStagingCredentials?.property_name || null,
      base_url: bensonStagingUrl || bensonStagingCredentials?.base_url || null,
      is_active: true,
    };

    let error;
    if (bensonStagingCredentials) {
      const result = await supabase.from("pms_credentials").update(credData).eq("id", bensonStagingCredentials.id);
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
        title: "Staging credentials saved",
        description: "Benson staging credentials have been updated successfully",
      });
      setEditingBensonStaging(false);
      setBensonStagingUsername("");
      setBensonStagingPassword("");
      setBensonStagingPropertyCode("");
      setBensonStagingPropertyName("");
      setBensonStagingUrl("");
      fetchBensonCredentials();
    }
    setSavingBensonStaging(false);
  };

  const handleSaveBensonProductionCredentials = async () => {
    setSavingBensonProduction(true);

    const credData = {
      system_type: "benson",
      environment: "production",
      username: bensonProductionUsername || bensonProductionCredentials?.username || null,
      password: bensonProductionPassword || bensonProductionCredentials?.password || null,
      property_code: bensonProductionPropertyCode || bensonProductionCredentials?.property_code || null,
      property_name: bensonProductionPropertyName || bensonProductionCredentials?.property_name || null,
      base_url: bensonProductionUrl || bensonProductionCredentials?.base_url || null,
      is_active: true,
    };

    let error;
    if (bensonProductionCredentials) {
      const result = await supabase.from("pms_credentials").update(credData).eq("id", bensonProductionCredentials.id);
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
        title: "Production credentials saved",
        description: "Benson production credentials have been updated successfully",
      });
      setEditingBensonProduction(false);
      setBensonProductionUsername("");
      setBensonProductionPassword("");
      setBensonProductionPropertyCode("");
      setBensonProductionPropertyName("");
      setBensonProductionUrl("");
      fetchBensonCredentials();
    }
    setSavingBensonProduction(false);
  };

  const handleSaveNightsbridgeCredentials = async () => {
    setSavingNightsbridge(true);

    const credData = {
      system_type: "nightsbridge",
      environment: nightsbridgeEnvironment,
      api_key: nightsbridgeApiKey || nightsbridgeCredentials?.api_key || null,
      agent_code: nightsbridgeAgentCode || nightsbridgeCredentials?.agent_code || null,
      is_active: true,
    };

    let error;
    if (nightsbridgeCredentials) {
      const result = await supabase.from("pms_credentials").update(credData).eq("id", nightsbridgeCredentials.id);
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
        description: "NightsBridge credentials have been updated successfully",
      });
      setEditingNightsbridge(false);
      setNightsbridgeApiKey("");
      setNightsbridgeAgentCode("");
      fetchNightsbridgeCredentials();
    }
    setSavingNightsbridge(false);
  };

  const handleSaveCheckfrontCredentials = async () => {
    setSavingCheckfront(true);

    const credData = {
      system_type: "checkfront",
      environment: checkfrontEnvironment,
      // Token auth uses api_key and agent_code (repurposed as secret)
      api_key: checkfrontAuthMethod === "token" 
        ? (checkfrontApiKey || checkfrontCredentials?.api_key || null) 
        : null,
      agent_code: checkfrontAuthMethod === "token" 
        ? (checkfrontApiSecret || checkfrontCredentials?.agent_code || null) 
        : null,
      // OAuth2 uses username/password
      username: checkfrontAuthMethod === "oauth2" 
        ? (checkfrontUsername || checkfrontCredentials?.username || null) 
        : null,
      password: checkfrontAuthMethod === "oauth2" 
        ? (checkfrontPassword || checkfrontCredentials?.password || null) 
        : null,
      is_active: true,
    };

    let error;
    if (checkfrontCredentials) {
      const result = await supabase.from("pms_credentials").update(credData).eq("id", checkfrontCredentials.id);
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
        description: "Checkfront credentials have been updated successfully",
      });
      setEditingCheckfront(false);
      setCheckfrontApiKey("");
      setCheckfrontApiSecret("");
      setCheckfrontUsername("");
      setCheckfrontPassword("");
      fetchCheckfrontCredentials();
    }
    setSavingCheckfront(false);
  };

  const isPlaceholder = (value: string | null) => {
    return !value || value.startsWith("placeholder_key_");
  };

  const requiredCount = apiKeys.filter((k) => k.is_required).length;
  const completedCount = apiKeys.filter((k) => k.is_required && !isPlaceholder(k.key_value)).length;

  // Group API keys: PMS systems vs Additional Services (Google Maps, SendGrid, Resend, etc.)
  const additionalServiceTypes = ["google", "sendgrid", "resend"];
  const pmsKeys = apiKeys
    .filter((k) => k.system_type && !additionalServiceTypes.includes(k.system_type) && k.system_type !== "benson" && k.system_type !== "nightsbridge" && k.system_type !== "checkfront")
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
                <Badge className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-100">
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
                  <p className={`font-medium ${isResendConfigured ? "text-green-600" : ""}`}>{isResendConfigured ? "Configured" : "Not set"}</p>
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
                <Badge className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-100">
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
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="font-mono text-sm text-muted-foreground">
                  {isPlaceholderValue ? (
                    <span className="italic">No key configured - using placeholder</span>
                  ) : (
                    <span>••••••••••••••••</span>
                  )}
                </div>
              </div>
              
              {apiKey.system_type && !additionalServiceTypes.includes(apiKey.system_type) && (
                <ApiMilestones systemType={apiKey.system_type} className="pt-4 border-t" />
              )}
              
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingKey(apiKey.id);
                    setEditValue(apiKey.key_value || "");
                  }}
                >
                  {isPlaceholderValue ? "Configure" : "Update"}
                </Button>
                {apiKey.system_type && !additionalServiceTypes.includes(apiKey.system_type) && (
                  <Button 
                    variant="default" 
                    onClick={() => toast({
                      title: "Coming Soon",
                      description: `${apiKey.name} field mappings configuration is under development`,
                    })}
                    disabled={isPlaceholderValue}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Field Mappings
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Benson-specific card with staging/production sections
  const renderBensonCard = () => {
    const isStagingConfigured = bensonStagingCredentials?.username && bensonStagingCredentials?.password;
    const isProductionConfigured = bensonProductionCredentials?.username && bensonProductionCredentials?.password;
    const isAnyConfigured = isStagingConfigured || isProductionConfigured;

    const renderEnvironmentSection = (
      env: "staging" | "production",
      credentials: PMSCredentials | null,
      isConfigured: boolean,
      editing: boolean,
      setEditing: (v: boolean) => void,
      saving: boolean,
      handleSave: () => void,
      username: string,
      setUsername: (v: string) => void,
      password: string,
      setPassword: (v: string) => void,
      propertyCode: string,
      setPropertyCode: (v: string) => void,
      propertyName: string,
      setPropertyName: (v: string) => void,
      url: string,
      setUrl: (v: string) => void
    ) => (
      <div className="space-y-4 p-4 rounded-lg border bg-muted/30">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold capitalize flex items-center gap-2">
            {env}
            {isConfigured ? (
              <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Configured
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground">
                Not Configured
              </Badge>
            )}
          </h4>
          {!editing && (
            <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
              {isConfigured ? "Edit" : "Configure"}
            </Button>
          )}
        </div>

        {editing ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={`benson-${env}-username`}>Username</Label>
                <Input
                  id={`benson-${env}-username`}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={credentials?.username ? "••••••••" : "Enter username"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`benson-${env}-password`}>Password</Label>
                <Input
                  id={`benson-${env}-password`}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={credentials?.password ? "••••••••" : "Enter password"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`benson-${env}-property-code`}>Property Code</Label>
                <Input
                  id={`benson-${env}-property-code`}
                  value={propertyCode}
                  onChange={(e) => setPropertyCode(e.target.value)}
                  placeholder={credentials?.property_code || "Enter property code"}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`benson-${env}-property-name`}>Property Name</Label>
                <Input
                  id={`benson-${env}-property-name`}
                  value={propertyName}
                  onChange={(e) => setPropertyName(e.target.value)}
                  placeholder={credentials?.property_name || "Enter property name"}
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label htmlFor={`benson-${env}-url`}>URL</Label>
                <Input
                  id={`benson-${env}-url`}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder={credentials?.base_url || "Enter API URL"}
                />
              </div>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSave} disabled={saving}>
                {saving ? "Saving..." : "Save"}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setEditing(false);
                  setUsername("");
                  setPassword("");
                  setPropertyCode("");
                  setPropertyName("");
                  setUrl("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : isConfigured ? (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground text-xs">Username</Label>
              <p className="font-medium text-green-600">Configured</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Password</Label>
              <p className="font-medium text-green-600">Configured</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Property Code</Label>
              <p className="font-medium truncate">{credentials?.property_code || "—"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Property Name</Label>
              <p className="font-medium truncate">{credentials?.property_name || "—"}</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">URL</Label>
              <p className="font-medium truncate text-xs">{credentials?.base_url || "—"}</p>
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground italic">Click Configure to set up {env} credentials</p>
        )}
      </div>
    );

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
              {isAnyConfigured ? (
                <Badge className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-100">
                  <CheckCircle2 className="h-3 w-3" />
                  {isStagingConfigured && isProductionConfigured ? "Both Configured" : 
                   isStagingConfigured ? "Staging Only" : "Production Only"}
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
        <CardContent className="space-y-4">
          {renderEnvironmentSection(
            "staging",
            bensonStagingCredentials,
            !!isStagingConfigured,
            editingBensonStaging,
            setEditingBensonStaging,
            savingBensonStaging,
            handleSaveBensonStagingCredentials,
            bensonStagingUsername,
            setBensonStagingUsername,
            bensonStagingPassword,
            setBensonStagingPassword,
            bensonStagingPropertyCode,
            setBensonStagingPropertyCode,
            bensonStagingPropertyName,
            setBensonStagingPropertyName,
            bensonStagingUrl,
            setBensonStagingUrl
          )}

          {renderEnvironmentSection(
            "production",
            bensonProductionCredentials,
            !!isProductionConfigured,
            editingBensonProduction,
            setEditingBensonProduction,
            savingBensonProduction,
            handleSaveBensonProductionCredentials,
            bensonProductionUsername,
            setBensonProductionUsername,
            bensonProductionPassword,
            setBensonProductionPassword,
            bensonProductionPropertyCode,
            setBensonProductionPropertyCode,
            bensonProductionPropertyName,
            setBensonProductionPropertyName,
            bensonProductionUrl,
            setBensonProductionUrl
          )}

          <ApiMilestones systemType="benson" className="pt-4 border-t" />

          <div className="flex gap-2 pt-2">
            <Button variant="default" onClick={() => navigate("/admin/benson-config")} disabled={!isAnyConfigured}>
              <Settings className="h-4 w-4 mr-2" />
              Field Mappings
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  };

  // NightsBridge-specific card with API Key and Agent Code
  const renderNightsbridgeCard = () => {
    const isConfigured = nightsbridgeCredentials?.api_key && nightsbridgeCredentials?.agent_code;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <BedDouble className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  NightsBridge
                  <Badge variant="outline" className="ml-2">
                    API Key + Agent Code
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  Property Management System integration for South African properties
                </CardDescription>
              </div>
            </div>
            <div>
              {isConfigured ? (
                <Badge className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-100">
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
          {editingNightsbridge ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="nightsbridge-apikey">API Key</Label>
                  <Input
                    id="nightsbridge-apikey"
                    type="password"
                    value={nightsbridgeApiKey}
                    onChange={(e) => setNightsbridgeApiKey(e.target.value)}
                    placeholder={nightsbridgeCredentials?.api_key ? "••••••••" : "Enter API key"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="nightsbridge-agentcode">Agent Code</Label>
                  <Input
                    id="nightsbridge-agentcode"
                    value={nightsbridgeAgentCode}
                    onChange={(e) => setNightsbridgeAgentCode(e.target.value)}
                    placeholder={nightsbridgeCredentials?.agent_code ? "••••••••" : "Enter agent code"}
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <Label className="text-sm">Environment:</Label>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm ${nightsbridgeEnvironment === "staging" ? "font-medium" : "text-muted-foreground"}`}
                  >
                    Staging
                  </span>
                  <Switch
                    checked={nightsbridgeEnvironment === "production"}
                    onCheckedChange={(checked) => setNightsbridgeEnvironment(checked ? "production" : "staging")}
                  />
                  <span
                    className={`text-sm ${nightsbridgeEnvironment === "production" ? "font-medium" : "text-muted-foreground"}`}
                  >
                    Production
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSaveNightsbridgeCredentials} disabled={savingNightsbridge}>
                  {savingNightsbridge ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingNightsbridge(false);
                    setNightsbridgeApiKey("");
                    setNightsbridgeAgentCode("");
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
                  <Label className="text-muted-foreground">API Key</Label>
                  <p className={`font-medium ${nightsbridgeCredentials?.api_key ? "text-green-600" : ""}`}>{nightsbridgeCredentials?.api_key ? "Configured" : "Not set"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Agent Code</Label>
                  <p className={`font-medium ${nightsbridgeCredentials?.agent_code ? "text-green-600" : ""}`}>{nightsbridgeCredentials?.agent_code ? "Configured" : "Not set"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Environment</Label>
                  <p className="font-medium capitalize">{nightsbridgeCredentials?.environment || "Staging"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p className="font-medium">{nightsbridgeCredentials?.is_active ? "Active" : "Inactive"}</p>
                </div>
              </div>

              <ApiMilestones systemType="nightsbridge" className="pt-4 border-t" />

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditingNightsbridge(true)}>
                  {isConfigured ? "Update Credentials" : "Configure"}
                </Button>
                <Button 
                  variant="default" 
                  onClick={() => toast({
                    title: "Coming Soon",
                    description: "NightsBridge field mappings configuration is under development",
                  })}
                  disabled={!isConfigured}
                >
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

  // Checkfront-specific card with Token or OAuth2 auth
  const renderCheckfrontCard = () => {
    const isTokenConfigured = checkfrontCredentials?.api_key && checkfrontCredentials?.agent_code;
    const isOAuthConfigured = checkfrontCredentials?.username && checkfrontCredentials?.password;
    const isConfigured = isTokenConfigured || isOAuthConfigured;

    return (
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              <div className="mt-1">
                <CheckCircle className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="flex items-center gap-2">
                  Checkfront
                  <Badge variant="outline" className="ml-2">
                    Token / OAuth2
                  </Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  Online booking software with dual authentication support
                </CardDescription>
              </div>
            </div>
            <div>
              {isConfigured ? (
                <Badge className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-100">
                  <CheckCircle2 className="h-3 w-3" />
                  {isTokenConfigured ? "Token Auth" : "OAuth2"}
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
          {editingCheckfront ? (
            <div className="space-y-4">
              {/* Auth Method Toggle */}
              <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
                <Label className="text-sm font-medium">Authentication Method:</Label>
                <div className="flex items-center gap-2">
                  <Button
                    variant={checkfrontAuthMethod === "token" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCheckfrontAuthMethod("token")}
                  >
                    Token (API Key/Secret)
                  </Button>
                  <Button
                    variant={checkfrontAuthMethod === "oauth2" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setCheckfrontAuthMethod("oauth2")}
                  >
                    OAuth2 (Username/Password)
                  </Button>
                </div>
              </div>

              {checkfrontAuthMethod === "token" ? (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="checkfront-apikey">API Key</Label>
                    <Input
                      id="checkfront-apikey"
                      type="password"
                      value={checkfrontApiKey}
                      onChange={(e) => setCheckfrontApiKey(e.target.value)}
                      placeholder={checkfrontCredentials?.api_key ? "••••••••" : "Enter API key"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="checkfront-secret">API Secret</Label>
                    <Input
                      id="checkfront-secret"
                      type="password"
                      value={checkfrontApiSecret}
                      onChange={(e) => setCheckfrontApiSecret(e.target.value)}
                      placeholder={checkfrontCredentials?.agent_code ? "••••••••" : "Enter API secret"}
                    />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="checkfront-username">Username</Label>
                    <Input
                      id="checkfront-username"
                      value={checkfrontUsername}
                      onChange={(e) => setCheckfrontUsername(e.target.value)}
                      placeholder={checkfrontCredentials?.username ? "••••••••" : "Enter username"}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="checkfront-password">Password</Label>
                    <Input
                      id="checkfront-password"
                      type="password"
                      value={checkfrontPassword}
                      onChange={(e) => setCheckfrontPassword(e.target.value)}
                      placeholder={checkfrontCredentials?.password ? "••••••••" : "Enter password"}
                    />
                  </div>
                </div>
              )}

              <div className="flex items-center gap-4">
                <Label className="text-sm">Environment:</Label>
                <div className="flex items-center gap-2">
                  <span
                    className={`text-sm ${checkfrontEnvironment === "staging" ? "font-medium" : "text-muted-foreground"}`}
                  >
                    Staging
                  </span>
                  <Switch
                    checked={checkfrontEnvironment === "production"}
                    onCheckedChange={(checked) => setCheckfrontEnvironment(checked ? "production" : "staging")}
                  />
                  <span
                    className={`text-sm ${checkfrontEnvironment === "production" ? "font-medium" : "text-muted-foreground"}`}
                  >
                    Production
                  </span>
                </div>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleSaveCheckfrontCredentials} disabled={savingCheckfront}>
                  {savingCheckfront ? "Saving..." : "Save"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setEditingCheckfront(false);
                    setCheckfrontApiKey("");
                    setCheckfrontApiSecret("");
                    setCheckfrontUsername("");
                    setCheckfrontPassword("");
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
                  <Label className="text-muted-foreground">Auth Method</Label>
                  <p className="font-medium">
                    {isTokenConfigured ? "Token" : isOAuthConfigured ? "OAuth2" : "Not set"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">
                    {isTokenConfigured ? "API Key" : "Username"}
                  </Label>
                  <p className={`font-medium ${isConfigured ? "text-green-600" : ""}`}>
                    {isConfigured ? "Configured" : "Not set"}
                  </p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Environment</Label>
                  <p className="font-medium capitalize">{checkfrontCredentials?.environment || "Staging"}</p>
                </div>
                <div>
                  <Label className="text-muted-foreground">Status</Label>
                  <p className="font-medium">{checkfrontCredentials?.is_active ? "Active" : "Inactive"}</p>
                </div>
              </div>

              <ApiMilestones systemType="checkfront" className="pt-4 border-t" />

              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditingCheckfront(true)}>
                  {isConfigured ? "Update Credentials" : "Configure"}
                </Button>
                <Button 
                  variant="default" 
                  onClick={() => toast({
                    title: "Coming Soon",
                    description: "Checkfront field mappings configuration is under development",
                  })}
                  disabled={!isConfigured}
                >
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

              {/* NightsBridge Card - Special handling */}
              {renderNightsbridgeCard()}

              {/* Checkfront Card - Special handling */}
              {renderCheckfrontCard()}

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
