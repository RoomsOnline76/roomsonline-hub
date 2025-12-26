import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { ApiMilestones } from "@/components/ApiMilestones";
import { TOTAL_PMS_SYSTEMS_COUNT, ALL_PMS_SYSTEMS } from "@/lib/pmsSystemsConfig";
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
  Star,
} from "lucide-react";

// Map PMS system types to icons
const getPMSIcon = (systemType: string | null): LucideIcon => {
  switch (systemType) {
    case "roomsonline":
      return Key;
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
    case "littlehotelier":
    case "cloudbeds":
    case "smoobu":
    case "hostfully":
      return BedDouble;
    case "google":
      return MapPin;
    case "sendgrid":
    case "resend":
      return Mail;
    case "tripadvisor":
      return Star;
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
  refresh_interval_minutes: number | null;
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

  // Active environment toggle
  const [bensonActiveEnvironment, setBensonActiveEnvironment] = useState<"staging" | "production">("staging");
  const [savingBensonActiveEnv, setSavingBensonActiveEnv] = useState(false);

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
  const [togglingNightsbridge, setTogglingNightsbridge] = useState(false);

  // Checkfront-specific state (supports Token and OAuth2 auth)
  const [checkfrontCredentials, setCheckfrontCredentials] = useState<PMSCredentials | null>(null);
  const [checkfrontHost, setCheckfrontHost] = useState("");
  const [checkfrontApiKey, setCheckfrontApiKey] = useState("");
  const [checkfrontApiSecret, setCheckfrontApiSecret] = useState("");
  const [checkfrontClientId, setCheckfrontClientId] = useState("");
  const [checkfrontClientSecret, setCheckfrontClientSecret] = useState("");
  const [checkfrontAuthMethod, setCheckfrontAuthMethod] = useState<"token" | "oauth2">("token");
  const [checkfrontEnvironment, setCheckfrontEnvironment] = useState<"staging" | "production">("staging");
  const [editingCheckfront, setEditingCheckfront] = useState(false);
  const [savingCheckfront, setSavingCheckfront] = useState(false);
  const [togglingCheckfront, setTogglingCheckfront] = useState(false);

  // Hostfully-specific state
  const [hostfullyCredentials, setHostfullyCredentials] = useState<PMSCredentials | null>(null);
  const [hostfullyApiKey, setHostfullyApiKey] = useState("");
  const [hostfullyEnvironment, setHostfullyEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [editingHostfully, setEditingHostfully] = useState(false);
  const [savingHostfully, setSavingHostfully] = useState(false);
  const [togglingHostfully, setTogglingHostfully] = useState(false);
  const [hostfullyRefreshInterval, setHostfullyRefreshInterval] = useState<number>(60);

  // Cloudbeds-specific state
  const [cloudbedsCredentials, setCloudbedsCredentials] = useState<PMSCredentials | null>(null);
  const [cloudbedsApiKey, setCloudbedsApiKey] = useState("");
  const [cloudbedsEnvironment, setCloudbedsEnvironment] = useState<"sandbox" | "production">("sandbox");
  const [editingCloudbeds, setEditingCloudbeds] = useState(false);
  const [savingCloudbeds, setSavingCloudbeds] = useState(false);
  const [togglingCloudbeds, setTogglingCloudbeds] = useState(false);
  const [cloudbedsRefreshInterval, setCloudbedsRefreshInterval] = useState<number>(60);

  // Benson toggle state
  const [togglingBenson, setTogglingBenson] = useState(false);

  // Refresh interval states
  const [bensonRefreshInterval, setBensonRefreshInterval] = useState<number>(60);
  const [nightsbridgeRefreshInterval, setNightsbridgeRefreshInterval] = useState<number>(60);
  const [checkfrontRefreshInterval, setCheckfrontRefreshInterval] = useState<number>(60);
  const [savingRefreshInterval, setSavingRefreshInterval] = useState<string | null>(null);

  // Resend-specific state
  const [resendFromEmail, setResendFromEmail] = useState("");
  const [resendToEmail, setResendToEmail] = useState("");
  const [editingResend, setEditingResend] = useState(false);
  const [savingResend, setSavingResend] = useState(false);

  // TripAdvisor-specific state
  const [tripadvisorApiKey, setTripadvisorApiKey] = useState("");
  const [editingTripadvisor, setEditingTripadvisor] = useState(false);
  const [savingTripadvisor, setSavingTripadvisor] = useState(false);

  // Global settings state
  const [bookOpenNewTab, setBookOpenNewTab] = useState(true);
  const [savingBookOpenNewTab, setSavingBookOpenNewTab] = useState(false);
  const [homeIconOpenNewTab, setHomeIconOpenNewTab] = useState(true);
  const [savingHomeIconOpenNewTab, setSavingHomeIconOpenNewTab] = useState(false);

  // RoomsOnline API state
  const [roomsonlineActive, setRoomsonlineActive] = useState(false);
  const [togglingRoomsonline, setTogglingRoomsonline] = useState(false);

  useEffect(() => {
    fetchApiKeys();
    fetchBensonCredentials();
    fetchBensonActiveEnvironment();
    fetchNightsbridgeCredentials();
    fetchCheckfrontCredentials();
    fetchHostfullyCredentials();
    fetchCloudbedsCredentials();
    fetchResendConfig();
    fetchTripadvisorConfig();
    fetchGlobalSettings();
    fetchRoomsonlineStatus();
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

  const fetchTripadvisorConfig = async () => {
    const { data } = await supabase
      .from("api_keys")
      .select("*")
      .eq("key_name", "TRIPADVISOR_API_KEY")
      .maybeSingle();

    if (data?.key_value) {
      setTripadvisorApiKey(data.key_value);
    }
  };

  const handleSaveTripadvisorConfig = async () => {
    setSavingTripadvisor(true);

    // Upsert API key only
    const { error } = await supabase.from("api_keys").upsert(
      {
        key_name: "TRIPADVISOR_API_KEY",
        name: "TripAdvisor API Key",
        key_value: tripadvisorApiKey,
        system_type: "tripadvisor",
        description: "API key for TripAdvisor Content API",
      },
      { onConflict: "key_name" },
    );

    if (error) {
      toast({
        title: "Error saving TripAdvisor config",
        description: error.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "TripAdvisor configuration saved",
        description: "TripAdvisor API key has been updated",
      });
      setEditingTripadvisor(false);
      fetchApiKeys();
    }
    setSavingTripadvisor(false);
  };

  const fetchGlobalSettings = async () => {
    const { data } = await supabase
      .from("api_keys")
      .select("*")
      .in("key_name", ["BOOK_OPEN_NEW_TAB", "HOME_ICON_OPEN_NEW_TAB"]);

    if (data) {
      const bookSetting = data.find((k) => k.key_name === "BOOK_OPEN_NEW_TAB");
      const homeSetting = data.find((k) => k.key_name === "HOME_ICON_OPEN_NEW_TAB");
      if (bookSetting?.key_value) {
        setBookOpenNewTab(bookSetting.key_value === "true");
      }
      if (homeSetting?.key_value) {
        setHomeIconOpenNewTab(homeSetting.key_value === "true");
      }
    }
  };

  const handleSaveBookOpenNewTab = async (newValue: boolean) => {
    setSavingBookOpenNewTab(true);

    const { error } = await supabase.from("api_keys").upsert(
      {
        key_name: "BOOK_OPEN_NEW_TAB",
        name: "Book Button Opens New Tab",
        key_value: String(newValue),
        system_type: "global",
        description: "Whether the Book button in the navbar opens in a new tab",
      },
      { onConflict: "key_name" },
    );

    if (error) {
      toast({
        title: "Error saving setting",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setBookOpenNewTab(newValue);
      toast({
        title: "Setting updated",
        description: `Book button will now open in ${newValue ? "a new tab" : "the same tab"}`,
      });
    }
    setSavingBookOpenNewTab(false);
  };

  const handleSaveHomeIconOpenNewTab = async (newValue: boolean) => {
    setSavingHomeIconOpenNewTab(true);

    const { error } = await supabase.from("api_keys").upsert(
      {
        key_name: "HOME_ICON_OPEN_NEW_TAB",
        name: "Home Icon Opens New Tab",
        key_value: String(newValue),
        system_type: "global",
        description: "Whether the Home icon in property edit opens in a new tab",
      },
      { onConflict: "key_name" },
    );

    if (error) {
      toast({
        title: "Error saving setting",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setHomeIconOpenNewTab(newValue);
      toast({
        title: "Setting updated",
        description: `Home icon will now open in ${newValue ? "a new tab" : "the same tab"}`,
      });
    }
    setSavingHomeIconOpenNewTab(false);
  };

  const handleSaveResendConfig = async () => {
    setSavingResend(true);

    // Upsert from email
    const { error: fromError } = await supabase.from("api_keys").upsert(
      {
        key_name: "RESEND_FROM_EMAIL",
        name: "Resend From Email",
        key_value: resendFromEmail,
        system_type: "resend",
        description: "Sender email address for Resend notifications",
      },
      { onConflict: "key_name" },
    );

    // Upsert to email
    const { error: toError } = await supabase.from("api_keys").upsert(
      {
        key_name: "RESEND_TO_EMAIL",
        name: "Resend To Email",
        key_value: resendToEmail,
        system_type: "resend",
        description: "Recipient email address for admin notifications",
      },
      { onConflict: "key_name" },
    );

    if (fromError || toError) {
      toast({
        title: "Error saving email config",
        description: fromError?.message || toError?.message,
        variant: "destructive",
      });
    } else {
      toast({
        title: "Email configuration saved",
        description: "Email settings have been updated",
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
    const { data, error } = await supabase.from("pms_credentials").select("*").eq("system_type", "benson");

    if (!error && data) {
      const staging = data.find((d) => d.environment === "staging");
      const production = data.find((d) => d.environment === "production");
      setBensonStagingCredentials(staging || null);
      setBensonProductionCredentials(production || null);
      // Use refresh interval from staging or production credentials
      const activeCredential = staging || production;
      if (activeCredential?.refresh_interval_minutes) {
        setBensonRefreshInterval(activeCredential.refresh_interval_minutes);
      }
    }
  };

  const fetchBensonActiveEnvironment = async () => {
    const { data } = await supabase
      .from("api_keys")
      .select("*")
      .eq("key_name", "BENSON_ACTIVE_ENVIRONMENT")
      .maybeSingle();

    if (data?.key_value) {
      setBensonActiveEnvironment(data.key_value as "staging" | "production");
    }
  };

  const handleSaveBensonActiveEnvironment = async (newEnv: "staging" | "production") => {
    setSavingBensonActiveEnv(true);

    const { error } = await supabase.from("api_keys").upsert(
      {
        key_name: "BENSON_ACTIVE_ENVIRONMENT",
        name: "Benson Active Environment",
        key_value: newEnv,
        system_type: "benson",
        description: "Which Benson environment to use for API calls",
      },
      { onConflict: "key_name" },
    );

    if (error) {
      toast({
        title: "Error saving environment",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setBensonActiveEnvironment(newEnv);
      toast({
        title: "Environment updated",
        description: `Benson now using ${newEnv} credentials`,
      });
    }
    setSavingBensonActiveEnv(false);
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
      if (data.refresh_interval_minutes) {
        setNightsbridgeRefreshInterval(data.refresh_interval_minutes);
      }
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
      if (data.refresh_interval_minutes) {
        setCheckfrontRefreshInterval(data.refresh_interval_minutes);
      }
      // Determine auth method based on what's configured
      if (data.api_key || data.agent_code) {
        setCheckfrontAuthMethod("token");
      } else if (data.username || data.password) {
        setCheckfrontAuthMethod("oauth2");
      }
    }
  };

  const fetchHostfullyCredentials = async () => {
    const { data, error } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "hostfully")
      .maybeSingle();

    if (!error && data) {
      setHostfullyCredentials(data);
      setHostfullyEnvironment(data.environment as "sandbox" | "production");
      if (data.refresh_interval_minutes) {
        setHostfullyRefreshInterval(data.refresh_interval_minutes);
      }
    }
  };

  const fetchCloudbedsCredentials = async () => {
    const { data, error } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "cloudbeds")
      .maybeSingle();

    if (!error && data) {
      setCloudbedsCredentials(data);
      setCloudbedsEnvironment(data.environment as "sandbox" | "production");
      if (data.refresh_interval_minutes) {
        setCloudbedsRefreshInterval(data.refresh_interval_minutes);
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
      base_url: checkfrontHost || checkfrontCredentials?.base_url || null,
      // Token auth uses api_key and agent_code (repurposed as secret)
      api_key: checkfrontAuthMethod === "token" ? checkfrontApiKey || checkfrontCredentials?.api_key || null : null,
      agent_code:
        checkfrontAuthMethod === "token" ? checkfrontApiSecret || checkfrontCredentials?.agent_code || null : null,
      // OAuth2 uses username (client_id) and password (client_secret)
      username:
        checkfrontAuthMethod === "oauth2" ? checkfrontClientId || checkfrontCredentials?.username || null : null,
      password:
        checkfrontAuthMethod === "oauth2" ? checkfrontClientSecret || checkfrontCredentials?.password || null : null,
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
      setCheckfrontHost("");
      setCheckfrontApiKey("");
      setCheckfrontApiSecret("");
      setCheckfrontClientId("");
      setCheckfrontClientSecret("");
      fetchCheckfrontCredentials();
    }
    setSavingCheckfront(false);
  };

  const handleSaveHostfullyCredentials = async () => {
    setSavingHostfully(true);

    const credData = {
      system_type: "hostfully",
      environment: hostfullyEnvironment,
      api_key: hostfullyApiKey || hostfullyCredentials?.api_key || null,
      is_active: true,
    };

    let error;
    if (hostfullyCredentials) {
      const result = await supabase.from("pms_credentials").update(credData).eq("id", hostfullyCredentials.id);
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
        description: "Hostfully credentials have been updated successfully",
      });
      setEditingHostfully(false);
      setHostfullyApiKey("");
      fetchHostfullyCredentials();
    }
    setSavingHostfully(false);
  };

  const handleSaveCloudbedsCredentials = async () => {
    setSavingCloudbeds(true);

    const credData = {
      system_type: "cloudbeds",
      environment: cloudbedsEnvironment,
      api_key: cloudbedsApiKey || cloudbedsCredentials?.api_key || null,
      is_active: true,
    };

    let error;
    if (cloudbedsCredentials) {
      const result = await supabase.from("pms_credentials").update(credData).eq("id", cloudbedsCredentials.id);
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
        description: "Cloudbeds credentials have been updated successfully",
      });
      setEditingCloudbeds(false);
      setCloudbedsApiKey("");
      fetchCloudbedsCredentials();
    }
    setSavingCloudbeds(false);
  };

  // Toggle handlers for PMS credentials
  const handleToggleBenson = async (enabled: boolean) => {
    setTogglingBenson(true);
    // Update both staging and production credentials
    if (bensonStagingCredentials) {
      await supabase.from("pms_credentials").update({ is_active: enabled }).eq("id", bensonStagingCredentials.id);
    }
    if (bensonProductionCredentials) {
      await supabase.from("pms_credentials").update({ is_active: enabled }).eq("id", bensonProductionCredentials.id);
    }
    toast({
      title: enabled ? "Benson enabled" : "Benson disabled",
      description: `Benson PMS integration is now ${enabled ? "active" : "inactive"}`,
    });
    fetchBensonCredentials();
    setTogglingBenson(false);
  };

  const handleToggleNightsbridge = async (enabled: boolean) => {
    setTogglingNightsbridge(true);
    if (nightsbridgeCredentials) {
      await supabase.from("pms_credentials").update({ is_active: enabled }).eq("id", nightsbridgeCredentials.id);
    }
    toast({
      title: enabled ? "NightsBridge enabled" : "NightsBridge disabled",
      description: `NightsBridge integration is now ${enabled ? "active" : "inactive"}`,
    });
    fetchNightsbridgeCredentials();
    setTogglingNightsbridge(false);
  };

  const handleToggleCheckfront = async (enabled: boolean) => {
    setTogglingCheckfront(true);
    if (checkfrontCredentials) {
      await supabase.from("pms_credentials").update({ is_active: enabled }).eq("id", checkfrontCredentials.id);
    }
    toast({
      title: enabled ? "Checkfront enabled" : "Checkfront disabled",
      description: `Checkfront integration is now ${enabled ? "active" : "inactive"}`,
    });
    fetchCheckfrontCredentials();
    setTogglingCheckfront(false);
  };

  const handleToggleHostfully = async (enabled: boolean) => {
    setTogglingHostfully(true);
    if (hostfullyCredentials) {
      await supabase.from("pms_credentials").update({ is_active: enabled }).eq("id", hostfullyCredentials.id);
    }
    toast({
      title: enabled ? "Hostfully enabled" : "Hostfully disabled",
      description: `Hostfully integration is now ${enabled ? "active" : "inactive"}`,
    });
    fetchHostfullyCredentials();
    setTogglingHostfully(false);
  };

  const handleToggleCloudbeds = async (enabled: boolean) => {
    setTogglingCloudbeds(true);
    if (cloudbedsCredentials) {
      await supabase.from("pms_credentials").update({ is_active: enabled }).eq("id", cloudbedsCredentials.id);
    }
    toast({
      title: enabled ? "Cloudbeds enabled" : "Cloudbeds disabled",
      description: `Cloudbeds integration is now ${enabled ? "active" : "inactive"}`,
    });
    fetchCloudbedsCredentials();
    setTogglingCloudbeds(false);
  };

  const handleToggleRoomsonline = async (enabled: boolean) => {
    setTogglingRoomsonline(true);
    // Store RoomsOnline active status in api_keys table
    const { error } = await supabase
      .from("api_keys")
      .upsert({
        key_name: "ROOMSONLINE_ACTIVE",
        name: "RoomsOnline API Active",
        key_value: enabled ? "true" : "false",
        system_type: "roomsonline",
        is_required: false,
      }, { onConflict: "key_name" });

    if (error) {
      toast({
        title: "Error toggling RoomsOnline",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setRoomsonlineActive(enabled);
      toast({
        title: enabled ? "RoomsOnline enabled" : "RoomsOnline disabled",
        description: `RoomsOnline API is now ${enabled ? "active" : "inactive"}`,
      });
    }
    setTogglingRoomsonline(false);
  };

  const fetchRoomsonlineStatus = async () => {
    const { data } = await supabase
      .from("api_keys")
      .select("key_value")
      .eq("key_name", "ROOMSONLINE_ACTIVE")
      .single();

    if (data?.key_value === "true") {
      setRoomsonlineActive(true);
    }
  };

  // Handler for saving refresh intervals
  const handleSaveRefreshInterval = async (systemType: string, intervalMinutes: number) => {
    setSavingRefreshInterval(systemType);
    
    // Get the credential IDs to update
    let credentialIds: string[] = [];
    if (systemType === "benson") {
      if (bensonStagingCredentials) credentialIds.push(bensonStagingCredentials.id);
      if (bensonProductionCredentials) credentialIds.push(bensonProductionCredentials.id);
    } else if (systemType === "nightsbridge" && nightsbridgeCredentials) {
      credentialIds.push(nightsbridgeCredentials.id);
    } else if (systemType === "checkfront" && checkfrontCredentials) {
      credentialIds.push(checkfrontCredentials.id);
    } else if (systemType === "hostfully" && hostfullyCredentials) {
      credentialIds.push(hostfullyCredentials.id);
    }

    if (credentialIds.length === 0) {
      toast({
        title: "No credentials found",
        description: "Please configure credentials first before setting refresh interval",
        variant: "destructive",
      });
      setSavingRefreshInterval(null);
      return;
    }

    for (const id of credentialIds) {
      const { error } = await supabase
        .from("pms_credentials")
        .update({ refresh_interval_minutes: intervalMinutes })
        .eq("id", id);

      if (error) {
        toast({
          title: "Error saving refresh interval",
          description: error.message,
          variant: "destructive",
        });
        setSavingRefreshInterval(null);
        return;
      }
    }

    toast({
      title: "Refresh interval saved",
      description: `${systemType.charAt(0).toUpperCase() + systemType.slice(1)} data will refresh every ${intervalMinutes} minute${intervalMinutes !== 1 ? 's' : ''}`,
    });
    setSavingRefreshInterval(null);
  };

  const isPlaceholder = (value: string | null) => {
    return !value || value.startsWith("placeholder_key_");
  };

  // Calculate configured PMS/API count based on actual credentials
  const getConfiguredPMSCount = () => {
    let count = 0;
    // Check Benson (either staging or production configured)
    if (bensonStagingCredentials?.username || bensonProductionCredentials?.username) count++;
    // Check NightsBridge
    if (nightsbridgeCredentials?.agent_code) count++;
    // Check Checkfront
    if (checkfrontCredentials?.api_key || checkfrontCredentials?.username) count++;
    // Check Hostfully
    if (hostfullyCredentials?.api_key) count++;
    // Check Cloudbeds
    if (cloudbedsCredentials?.api_key) count++;
    // RoomsOnline API is always "in development" - count as 0 until implemented
    return count;
  };

  // Cloudbeds card renderer
  const renderCloudbedsCard = () => {
    const isConfigured = !!cloudbedsCredentials?.api_key;

    return (
      <AccordionItem value="cloudbeds" className={`border rounded-lg px-4 ${!cloudbedsCredentials?.is_active ? "opacity-60" : ""}`}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <BedDouble className="h-5 w-5 text-primary" />
              <span className="font-semibold">Cloudbeds</span>
              <Badge variant="outline" className="text-xs">API Key</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={cloudbedsCredentials?.is_active ?? false}
                  onCheckedChange={handleToggleCloudbeds}
                  disabled={togglingCloudbeds || !isConfigured}
                  className={!isConfigured ? "opacity-50" : ""}
                />
                <span className="text-xs text-muted-foreground">{cloudbedsCredentials?.is_active ? "On" : "Off"}</span>
              </div>
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
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              All-in-one hospitality management platform for hotels and accommodation providers
            </p>
            <div className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded-md inline-block">
              ⓘ Uses API Key (Permanent Token) authentication - token starts with cbat_
            </div>

            {editingCloudbeds ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="cloudbeds-apikey">API Key</Label>
                  <Input
                    id="cloudbeds-apikey"
                    type="password"
                    value={cloudbedsApiKey}
                    onChange={(e) => setCloudbedsApiKey(e.target.value)}
                    placeholder={cloudbedsCredentials?.api_key ? "••••••••" : "cbat_..."}
                  />
                  <p className="text-xs text-muted-foreground">Find this in Cloudbeds → Settings → API Credentials</p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveCloudbedsCredentials} disabled={savingCloudbeds}>
                    {savingCloudbeds ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="outline" onClick={() => { setEditingCloudbeds(false); setCloudbedsApiKey(""); }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">API Key</Label>
                    <p className={`font-medium ${cloudbedsCredentials?.api_key ? "text-green-600" : ""}`}>
                      {cloudbedsCredentials?.api_key ? "Configured" : "Not set"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Environment</Label>
                    <p className="font-medium capitalize">{cloudbedsCredentials?.environment || "Sandbox"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <p className="font-medium">{cloudbedsCredentials?.is_active ? "Active" : "Inactive"}</p>
                  </div>
                </div>

                <ApiMilestones systemType="cloudbeds" className="pt-4 border-t" />

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingCloudbeds(true)}>
                    {isConfigured ? "Update Credentials" : "Configure"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  const configuredPMSCount = getConfiguredPMSCount();
  const totalPMSCount = TOTAL_PMS_SYSTEMS_COUNT;

  // Legacy count for other API keys (Google Maps, etc.)
  const requiredCount = apiKeys.filter((k) => k.is_required).length;
  const completedCount = apiKeys.filter((k) => k.is_required && !isPlaceholder(k.key_value)).length;

  // Group API keys: PMS systems vs Additional Services (Google Maps, SendGrid, Resend, etc.)
  const additionalServiceTypes = ["google", "sendgrid", "resend", "tripadvisor", "global"];
  // Only show Semper and SiteMinder in the generic PMS cards (Benson, NightsBridge, Checkfront have custom cards)
  const allowedPmsTypes = ["semper", "siteminder"];
  const pmsKeys = apiKeys
    .filter(
      (k) =>
        k.system_type &&
        allowedPmsTypes.includes(k.system_type),
    )
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Filter out Resend email config keys from additionalKeys since we handle them in custom card
  const resendEmailKeys = ["RESEND_FROM_EMAIL", "RESEND_TO_EMAIL", "BOOKING_FROM_EMAIL"];
  const additionalKeys = apiKeys
    .filter(
      (k) => k.system_type && additionalServiceTypes.includes(k.system_type) && !resendEmailKeys.includes(k.key_name),
    )
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""));

  // Check if Resend API key is configured
  const resendApiKey = apiKeys.find((k) => k.key_name === "RESEND_API_KEY");
  const isResendConfigured = resendApiKey && !isPlaceholder(resendApiKey.key_value);

  const renderResendCard = () => {
    return (
      <AccordionItem value="resend" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" />
              <span className="font-semibold">Resend Email Service</span>
            </div>
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
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Configure email sender and recipient addresses for notifications
            </p>
            {editingResend ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="resend-from">From Email (Admin)</Label>
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
                    <p className="text-xs text-muted-foreground">Where access request notifications will be sent</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveResendConfig} disabled={savingResend}>
                    {savingResend ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="outline" onClick={() => setEditingResend(false)}>
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
                    <p className={`font-medium ${isResendConfigured ? "text-green-600" : ""}`}>
                      {isResendConfigured ? "Configured" : "Not set"}
                    </p>
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
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  const renderTripadvisorCard = () => {
    const isConfigured = !!tripadvisorApiKey && !isPlaceholder(tripadvisorApiKey);

    return (
      <AccordionItem value="tripadvisor" className="border rounded-lg px-4">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <Star className="h-5 w-5 text-primary" />
              <span className="font-semibold">TripAdvisor</span>
            </div>
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
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-4">
            <p className="text-sm text-muted-foreground mb-4">
              Display TripAdvisor reviews and ratings on property pages
            </p>
            {editingTripadvisor ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="tripadvisor-api-key">API Key</Label>
                  <Input
                    id="tripadvisor-api-key"
                    type="password"
                    value={tripadvisorApiKey}
                    onChange={(e) => setTripadvisorApiKey(e.target.value)}
                    placeholder="Enter TripAdvisor API key"
                  />
                  <p className="text-xs text-muted-foreground">
                    Get your API key from TripAdvisor Content API
                  </p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveTripadvisorConfig} disabled={savingTripadvisor}>
                    {savingTripadvisor ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="outline" onClick={() => setEditingTripadvisor(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm">
                  <Label className="text-muted-foreground">API Key</Label>
                  <p className={`font-medium ${isConfigured ? "text-green-600" : ""}`}>
                    {isConfigured ? "Configured" : "Not set"}
                  </p>
                </div>

                {/* Domain URL for TripAdvisor API restriction */}
                <div className="p-3 rounded-lg border bg-muted/50 space-y-2">
                  <Label className="text-sm font-medium">Domain URL (for API restrictions)</Label>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 px-3 py-2 bg-background rounded border text-sm font-mono">
                      qmprswbgkpzcvexmmcbf.supabase.co
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        navigator.clipboard.writeText("qmprswbgkpzcvexmmcbf.supabase.co");
                        toast({
                          title: "Copied",
                          description: "Domain URL copied to clipboard",
                        });
                      }}
                    >
                      Copy
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Add this domain to your TripAdvisor API key allowed domains
                  </p>
                </div>

                <Button variant="outline" onClick={() => setEditingTripadvisor(true)}>
                  {isConfigured ? "Update API Key" : "Configure"}
                </Button>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  const renderKeyCard = (apiKey: ApiKey) => {
    const isPlaceholderValue = isPlaceholder(apiKey.key_value);
    const isEditing = editingKey === apiKey.id;
    const IconComponent = getPMSIcon(apiKey.system_type);
    const isConfigured = !isPlaceholderValue;
    
    // Get auth type label based on system type
    const getAuthTypeLabel = (systemType: string | null) => {
      switch (systemType) {
        case "semper":
          return "API Key";
        case "siteminder":
          return "API Key";
        default:
          return null;
      }
    };
    const authTypeLabel = getAuthTypeLabel(apiKey.system_type);

    return (
      <AccordionItem 
        key={apiKey.id} 
        value={apiKey.id} 
        className={`border rounded-lg px-4 ${!isConfigured ? "opacity-60" : ""}`}
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <IconComponent className="h-5 w-5 text-primary" />
              <span className="font-semibold">{apiKey.name}</span>
              {authTypeLabel && (
                <Badge variant="outline" className="text-xs">{authTypeLabel}</Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={isConfigured}
                  disabled={!isConfigured}
                  className={!isConfigured ? "opacity-50" : ""}
                  onCheckedChange={() => {
                    toast({
                      title: "Coming Soon",
                      description: `${apiKey.name} enable/disable feature is under development`,
                    });
                  }}
                />
                <span className="text-xs text-muted-foreground">{isConfigured ? "On" : "Off"}</span>
              </div>
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
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-4">
            {apiKey.description && (
              <p className="text-sm text-muted-foreground mb-4">{apiKey.description}</p>
            )}
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
                      onClick={() =>
                        toast({
                          title: "Coming Soon",
                          description: `${apiKey.name} field mappings configuration is under development`,
                        })
                      }
                      disabled={isPlaceholderValue}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Field Mappings
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
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
      setUrl: (v: string) => void,
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

    const isBensonActive = bensonStagingCredentials?.is_active || bensonProductionCredentials?.is_active;

    return (
      <AccordionItem value="benson" className={`border rounded-lg px-4 ${!isBensonActive ? "opacity-60" : ""}`}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <Briefcase className="h-5 w-5 text-primary" />
              <span className="font-semibold">Benson PMS</span>
              <Badge variant="outline" className="text-xs">Basic Auth</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={isBensonActive}
                  onCheckedChange={handleToggleBenson}
                  disabled={togglingBenson || !isAnyConfigured}
                  className={!isAnyConfigured ? "opacity-50" : ""}
                />
                <span className="text-xs text-muted-foreground">{isBensonActive ? "On" : "Off"}</span>
              </div>
              {isAnyConfigured ? (
                <Badge className="flex items-center gap-1 bg-green-100 text-green-800 hover:bg-green-100">
                  <CheckCircle2 className="h-3 w-3" />
                  {isStagingConfigured && isProductionConfigured
                    ? "Both"
                    : isStagingConfigured
                      ? "Staging"
                      : "Production"}
                </Badge>
              ) : (
                <Badge variant="destructive" className="flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Not Configured
                </Badge>
              )}
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Property Management System integration using username/password authentication
            </p>

            {/* Active Environment Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-primary/5 border-primary/20">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Active Environment</Label>
                <p className="text-xs text-muted-foreground">API calls will use {bensonActiveEnvironment} credentials</p>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-sm ${bensonActiveEnvironment === "staging" ? "font-semibold text-primary" : "text-muted-foreground"}`}
                >
                  Staging
                </span>
                <Switch
                  checked={bensonActiveEnvironment === "production"}
                  onCheckedChange={(checked) => handleSaveBensonActiveEnvironment(checked ? "production" : "staging")}
                  disabled={savingBensonActiveEnv}
                />
                <span
                  className={`text-sm ${bensonActiveEnvironment === "production" ? "font-semibold text-primary" : "text-muted-foreground"}`}
                >
                  Production
                </span>
              </div>
            </div>

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
              setBensonStagingUrl,
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
              setBensonProductionUrl,
            )}

            {/* Refresh Interval Setting */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Data Refresh Interval</Label>
                <p className="text-xs text-muted-foreground">Auto-refresh API data when older than this (minutes)</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={1}
                  max={1440}
                  value={bensonRefreshInterval}
                  onChange={(e) => setBensonRefreshInterval(parseInt(e.target.value) || 60)}
                  className="w-20 text-center"
                />
                <Button
                  size="sm"
                  onClick={() => handleSaveRefreshInterval("benson", bensonRefreshInterval)}
                  disabled={savingRefreshInterval === "benson" || !isAnyConfigured}
                >
                  {savingRefreshInterval === "benson" ? "..." : "Save"}
                </Button>
              </div>
            </div>

            <ApiMilestones systemType="benson" className="pt-4 border-t" />

            <div className="flex gap-2 pt-2">
              <Button variant="default" onClick={() => navigate("/admin/benson-config")} disabled={!isAnyConfigured}>
                <Settings className="h-4 w-4 mr-2" />
                Field Mappings
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/admin/test-booking-benson")}
                disabled={!isAnyConfigured}
              >
                Test Booking
              </Button>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  // NightsBridge-specific card with API Key and Agent Code
  const renderNightsbridgeCard = () => {
    // NightsBridge is configured if agent_code exists (API key is optional until 50 properties)
    const isConfigured = !!nightsbridgeCredentials?.agent_code;

    return (
      <AccordionItem value="nightsbridge" className={`border rounded-lg px-4 ${!nightsbridgeCredentials?.is_active ? "opacity-60" : ""}`}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <BedDouble className="h-5 w-5 text-primary" />
              <span className="font-semibold">NightsBridge</span>
              <Badge variant="outline" className="text-xs">Agent Code</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={nightsbridgeCredentials?.is_active ?? false}
                  onCheckedChange={handleToggleNightsbridge}
                  disabled={togglingNightsbridge || !isConfigured}
                  className={!isConfigured ? "opacity-50" : ""}
                />
                <span className="text-xs text-muted-foreground">{nightsbridgeCredentials?.is_active ? "On" : "Off"}</span>
              </div>
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
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Property Management System integration for South African properties
            </p>
            <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-md inline-block">
              ⚠️ No API access until 50 properties - booking via URL redirect only using AGENT CODE
            </div>

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
                    <p className={`font-medium ${nightsbridgeCredentials?.api_key ? "text-green-600" : ""}`}>
                      {nightsbridgeCredentials?.api_key ? "Configured" : "Not set"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Agent Code</Label>
                    <p className={`font-medium ${nightsbridgeCredentials?.agent_code ? "text-green-600" : ""}`}>
                      {nightsbridgeCredentials?.agent_code ? "Configured" : "Not set"}
                    </p>
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

                {/* Refresh Interval Setting */}
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Data Refresh Interval</Label>
                    <p className="text-xs text-muted-foreground">Auto-refresh API data when older than this (minutes)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={nightsbridgeRefreshInterval}
                      onChange={(e) => setNightsbridgeRefreshInterval(parseInt(e.target.value) || 60)}
                      className="w-20 text-center"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSaveRefreshInterval("nightsbridge", nightsbridgeRefreshInterval)}
                      disabled={savingRefreshInterval === "nightsbridge" || !isConfigured}
                    >
                      {savingRefreshInterval === "nightsbridge" ? "..." : "Save"}
                    </Button>
                  </div>
                </div>

                <ApiMilestones systemType="nightsbridge" className="pt-4 border-t" />

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingNightsbridge(true)}>
                    {isConfigured ? "Update Credentials" : "Configure"}
                  </Button>
                  <Button
                    variant="default"
                    onClick={() =>
                      toast({
                        title: "Coming Soon",
                        description: "NightsBridge field mappings configuration is under development",
                      })
                    }
                    disabled={!isConfigured}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Field Mappings
                  </Button>
                </div>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  // Checkfront-specific card with Token or OAuth2 auth
  const renderCheckfrontCard = () => {
    const isTokenConfigured = checkfrontCredentials?.api_key && checkfrontCredentials?.agent_code;
    const isOAuthConfigured = checkfrontCredentials?.username && checkfrontCredentials?.password;
    const isConfigured = isTokenConfigured || isOAuthConfigured;

    return (
      <AccordionItem value="checkfront" className={!checkfrontCredentials?.is_active ? "opacity-60" : ""}>
        <AccordionTrigger className="hover:no-underline px-4 py-3 bg-card rounded-lg border">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-primary" />
              <span className="font-semibold">Checkfront</span>
              <Badge variant="outline" className="text-xs">Token / OAuth2</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={checkfrontCredentials?.is_active ?? false}
                  onCheckedChange={handleToggleCheckfront}
                  disabled={togglingCheckfront || !isConfigured}
                  className={!isConfigured ? "opacity-50" : ""}
                />
                <span className="text-xs text-muted-foreground">{checkfrontCredentials?.is_active ? "On" : "Off"}</span>
              </div>
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
        </AccordionTrigger>
        <AccordionContent className="px-4 pt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Online booking software with dual authentication support</CardDescription>
            </CardHeader>
            <CardContent>
              {editingCheckfront ? (
                <div className="space-y-4">
                  {/* Host URL - Required for both auth methods */}
                  <div className="space-y-2">
                    <Label htmlFor="checkfront-host">Host URL *</Label>
                    <Input
                      id="checkfront-host"
                      value={checkfrontHost}
                      onChange={(e) => setCheckfrontHost(e.target.value)}
                      placeholder={checkfrontCredentials?.base_url || "yourcompany.checkfront.com"}
                    />
                    <p className="text-xs text-muted-foreground">Your Checkfront subdomain (e.g., yourcompany.checkfront.com)</p>
                  </div>

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
                        OAuth2 (Client ID/Secret)
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
                          placeholder={checkfrontCredentials?.api_key ? "••••••••" : "cf_api_xxxxxxxx"}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="checkfront-secret">API Secret</Label>
                        <Input
                          id="checkfront-secret"
                          type="password"
                          value={checkfrontApiSecret}
                          onChange={(e) => setCheckfrontApiSecret(e.target.value)}
                          placeholder={checkfrontCredentials?.agent_code ? "••••••••" : "xxxxxxxxxxxxxxxx"}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="checkfront-clientid">OAuth2 Client ID</Label>
                        <Input
                          id="checkfront-clientid"
                          value={checkfrontClientId}
                          onChange={(e) => setCheckfrontClientId(e.target.value)}
                          placeholder={checkfrontCredentials?.username ? "••••••••" : "oauth_client_xxxxxxxx"}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="checkfront-clientsecret">OAuth2 Client Secret</Label>
                        <Input
                          id="checkfront-clientsecret"
                          type="password"
                          value={checkfrontClientSecret}
                          onChange={(e) => setCheckfrontClientSecret(e.target.value)}
                          placeholder={checkfrontCredentials?.password ? "••••••••" : "xxxxxxxxxxxxxxxx"}
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
                        setCheckfrontHost("");
                        setCheckfrontApiKey("");
                        setCheckfrontApiSecret("");
                        setCheckfrontClientId("");
                        setCheckfrontClientSecret("");
                      }}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4 text-sm">
                    <div>
                      <Label className="text-muted-foreground">Host</Label>
                      <p className="font-medium truncate text-xs">
                        {checkfrontCredentials?.base_url || "Not set"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">Auth Method</Label>
                      <p className="font-medium">
                        {isTokenConfigured ? "Token" : isOAuthConfigured ? "OAuth2" : "Not set"}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground">{isTokenConfigured ? "API Key" : "Client ID"}</Label>
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

                  {/* Refresh Interval Setting */}
                  <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
                    <div className="space-y-1">
                      <Label className="text-sm font-medium">Data Refresh Interval</Label>
                      <p className="text-xs text-muted-foreground">Auto-refresh API data when older than this (minutes)</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={1440}
                        value={checkfrontRefreshInterval}
                        onChange={(e) => setCheckfrontRefreshInterval(parseInt(e.target.value) || 60)}
                        className="w-20 text-center"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveRefreshInterval("checkfront", checkfrontRefreshInterval)}
                        disabled={savingRefreshInterval === "checkfront" || !isConfigured}
                      >
                        {savingRefreshInterval === "checkfront" ? "..." : "Save"}
                      </Button>
                    </div>
                  </div>

                  <ApiMilestones systemType="checkfront" className="pt-4 border-t" />

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditingCheckfront(true)}>
                      {isConfigured ? "Update Credentials" : "Configure"}
                    </Button>
                    <Button
                      variant="default"
                      onClick={() =>
                        toast({
                          title: "Coming Soon",
                          description: "Checkfront field mappings configuration is under development",
                        })
                      }
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
        </AccordionContent>
      </AccordionItem>
    );
  };

  // Hostfully-specific card with sandbox/production toggle
  const renderHostfullyCard = () => {
    const isConfigured = !!hostfullyCredentials?.api_key;

    return (
      <AccordionItem value="hostfully" className={`border rounded-lg px-4 ${!hostfullyCredentials?.is_active ? "opacity-60" : ""}`}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <BedDouble className="h-5 w-5 text-primary" />
              <span className="font-semibold">Hostfully</span>
              <Badge variant="outline" className="text-xs">API Key</Badge>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={hostfullyCredentials?.is_active ?? false}
                  onCheckedChange={handleToggleHostfully}
                  disabled={togglingHostfully || !isConfigured}
                  className={!isConfigured ? "opacity-50" : ""}
                />
                <span className="text-xs text-muted-foreground">{hostfullyCredentials?.is_active ? "On" : "Off"}</span>
              </div>
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
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Property management platform for vacation rental managers
            </p>
            <div className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded-md inline-block">
              ⓘ Rate Limit: 10,000 API calls per hour
            </div>

            {/* Active Environment Toggle */}
            <div className="flex items-center justify-between p-4 rounded-lg border bg-primary/5 border-primary/20">
              <div className="space-y-1">
                <Label className="text-sm font-medium">Active Environment</Label>
                <p className="text-xs text-muted-foreground">API calls will use {hostfullyEnvironment} endpoint</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-sm ${hostfullyEnvironment === "sandbox" ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                  Sandbox
                </span>
                <Switch
                  checked={hostfullyEnvironment === "production"}
                  onCheckedChange={(checked) => setHostfullyEnvironment(checked ? "production" : "sandbox")}
                />
                <span className={`text-sm ${hostfullyEnvironment === "production" ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                  Production
                </span>
              </div>
            </div>

            {editingHostfully ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="hostfully-apikey">API Key</Label>
                  <Input
                    id="hostfully-apikey"
                    type="password"
                    value={hostfullyApiKey}
                    onChange={(e) => setHostfullyApiKey(e.target.value)}
                    placeholder={hostfullyCredentials?.api_key ? "••••••••" : "Enter API key from Agency Settings"}
                  />
                  <p className="text-xs text-muted-foreground">Find this in your Hostfully Agency Settings → API Access</p>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveHostfullyCredentials} disabled={savingHostfully}>
                    {savingHostfully ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingHostfully(false);
                      setHostfullyApiKey("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">API Key</Label>
                    <p className={`font-medium ${hostfullyCredentials?.api_key ? "text-green-600" : ""}`}>
                      {hostfullyCredentials?.api_key ? "Configured" : "Not set"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Environment</Label>
                    <p className="font-medium capitalize">{hostfullyCredentials?.environment || "Sandbox"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <p className="font-medium">{hostfullyCredentials?.is_active ? "Active" : "Inactive"}</p>
                  </div>
                </div>

                {/* Refresh Interval Setting */}
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Data Refresh Interval</Label>
                    <p className="text-xs text-muted-foreground">Auto-refresh API data when older than this (minutes)</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={1440}
                      value={hostfullyRefreshInterval}
                      onChange={(e) => setHostfullyRefreshInterval(parseInt(e.target.value) || 60)}
                      className="w-20 text-center"
                    />
                    <Button
                      size="sm"
                      onClick={() => handleSaveRefreshInterval("hostfully", hostfullyRefreshInterval)}
                      disabled={savingRefreshInterval === "hostfully" || !isConfigured}
                    >
                      {savingRefreshInterval === "hostfully" ? "..." : "Save"}
                    </Button>
                  </div>
                </div>

                <ApiMilestones systemType="hostfully" className="pt-4 border-t" />

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingHostfully(true)}>
                    {isConfigured ? "Update Credentials" : "Configure"}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  // Placeholder card for upcoming PMS integrations
  const renderPlaceholderPMSCard = (name: string, systemType: string, description: string) => {
    const Icon = getPMSIcon(systemType);
    return (
      <AccordionItem key={systemType} value={systemType} className="border rounded-lg px-4 opacity-60">
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">{name}</span>
              <Badge variant="outline" className="text-xs">Coming Soon</Badge>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Not Available
              </Badge>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-4 space-y-4">
            <p className="text-sm text-muted-foreground">{description}</p>
            <div className="p-4 rounded-lg border bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">
                This integration is planned for a future release. Contact support for more information.
              </p>
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
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
          <div className="flex items-center gap-2 mb-3">
            <h1 className="text-xl font-bold text-foreground">API Keys Management</h1>
            <span className="text-xs text-muted-foreground">— Manage integration keys</span>
            <Badge variant={configuredPMSCount === totalPMSCount ? "default" : "secondary"} className="ml-auto">
              {configuredPMSCount} / {totalPMSCount} PMS/API Configured
            </Badge>
          </div>

          {/* Global Settings Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Global Settings</h2>
            <Card>
              <CardHeader>
                <div className="flex items-start gap-3">
                  <div className="mt-1">
                    <Settings className="h-5 w-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Navigation Settings</CardTitle>
                    <CardDescription className="mt-1">
                      Configure global navigation behavior for the application
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="book-new-tab">Open Book page in new tab</Label>
                    <p className="text-sm text-muted-foreground">
                      When enabled, clicking the "Book" button in the navbar opens the booking page in a new browser tab
                    </p>
                  </div>
                  <Switch
                    id="book-new-tab"
                    checked={bookOpenNewTab}
                    onCheckedChange={handleSaveBookOpenNewTab}
                    disabled={savingBookOpenNewTab}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="home-icon-new-tab">Open Home icon in new tab</Label>
                    <p className="text-sm text-muted-foreground">
                      When enabled, clicking the Home icon in property edit pages opens in a new browser tab
                    </p>
                  </div>
                  <Switch
                    id="home-icon-new-tab"
                    checked={homeIconOpenNewTab}
                    onCheckedChange={handleSaveHomeIconOpenNewTab}
                    disabled={savingHomeIconOpenNewTab}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* RoomsOnline API Section */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">RoomsOnline API</h2>
            <Accordion type="multiple" className="space-y-4">
              <AccordionItem value="roomsonline" className={`border rounded-lg px-4 border-primary/30 bg-primary/5 ${!roomsonlineActive ? "opacity-60" : ""}`}>
                <AccordionTrigger className="hover:no-underline">
                  <div className="flex items-center justify-between w-full pr-4">
                    <div className="flex items-center gap-3">
                      <Key className="h-5 w-5 text-primary" />
                      <span className="font-semibold">RoomsOnline API</span>
                      <Badge variant="default" className="text-xs">Internal API</Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                        <Switch
                          checked={roomsonlineActive}
                          onCheckedChange={handleToggleRoomsonline}
                          disabled={togglingRoomsonline}
                        />
                        <span className="text-xs text-muted-foreground">{roomsonlineActive ? "On" : "Off"}</span>
                      </div>
                      <Badge variant="outline" className="flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" />
                        In Development
                      </Badge>
                    </div>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="pt-4 space-y-4">
                    <p className="text-sm text-muted-foreground">
                      RoomsOnline's proprietary API for direct property management and booking engine integration. 
                      <strong>This will become the unified interface for properties not using third-party PMS systems.</strong>
                    </p>
                    <div className="p-4 rounded-lg border bg-background text-center space-y-2">
                      <p className="text-sm font-medium">Planned Capabilities</p>
                      <div className="flex flex-wrap gap-2 justify-center">
                        <Badge variant="secondary">Direct Availability</Badge>
                        <Badge variant="secondary">Native Rate Management</Badge>
                        <Badge variant="secondary">Booking Engine</Badge>
                        <Badge variant="secondary">Channel Manager</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        Development in progress. This API will follow the standardized adapter contract.
                      </p>
                    </div>
                  </div>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>

          {/* PMS Systems Section - Alphabetically ordered */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold mb-4">Property Management Systems</h2>
            <Accordion type="multiple" className="space-y-4">
              {renderBensonCard()}
              {renderCheckfrontCard()}
              {renderCloudbedsCard()}
              {renderHostfullyCard()}
              {renderPlaceholderPMSCard("Little Hotelier", "littlehotelier", "Cloud-based property management system designed for small hotels, B&Bs, and guest houses")}
              {renderNightsbridgeCard()}
              {renderPlaceholderPMSCard("Smoobu", "smoobu", "Channel manager and vacation rental software for property managers")}
              {pmsKeys.map(renderKeyCard)}
            </Accordion>
          </div>

          {/* Additional Services Section */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Additional Services</h2>
            <Accordion type="multiple" className="space-y-4">
              {renderResendCard()}
              {renderTripadvisorCard()}
              {additionalKeys
                .filter((k) => 
                  k.key_name !== "RESEND_API_KEY" && 
                  !k.key_name.startsWith("TRIPADVISOR_") &&
                  k.key_name !== "BOOK_OPEN_NEW_TAB" &&
                  k.key_name !== "HOME_ICON_OPEN_NEW_TAB"
                )
                .map(renderKeyCard)}
            </Accordion>
          </div>
        </div>
      </div>
    </>
  );
}
