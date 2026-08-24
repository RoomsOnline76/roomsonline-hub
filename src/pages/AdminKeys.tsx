import { useState, useEffect } from "react";
import { SupportingSystemsTab } from "@/components/system/SupportingSystemsTab";
import { PayFastEnvironmentToggle } from "@/components/integrations/PayFastEnvironmentToggle";
import { PriceLabsCard } from "@/components/integrations/PriceLabsCard";
import { RolosChannelApiCards } from "@/components/integrations/RolosChannelApiCards";
import { WordPressPushUpdateButton } from "@/components/integrations/WordPressPushUpdateButton";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Switch } from "@/components/ui/switch";
import { PMSProgressToggles } from "@/components/PMSProgressToggles";
import { TOTAL_PMS_SYSTEMS_COUNT, VISIBLE_PMS_SYSTEMS } from "@/lib/pmsSystemsConfig";
import PMSTrackerStatusDisplay from "@/components/PMSTrackerStatus";
import PMSDevNotes from "@/components/PMSDevNotes";
import PMSContactDetails from "@/components/PMSContactDetails";
import { PMSTrackerStatus } from "@/lib/pmsTrackerConfig";
import { PMSListingSelector, type PMSListing } from "@/components/pms/PMSListingSelector";
import { SyncStatusIndicator } from "@/components/pms/SyncStatusIndicator";
import { IntegrationStatusDropdown, type PmsIntegrationStatus } from "@/components/pms/IntegrationStatusDropdown";
import { EnvironmentToggle } from "@/components/pms/EnvironmentToggle";
import { HyperGuestDetails } from "@/components/pms/HyperGuestDetails";
import { HyperGuestCertificationRunner } from "@/components/integrations/HyperGuestCertificationRunner";
import { BankExportConfigCard } from "@/components/bank-export";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
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
  Send,
  Loader2,
  Building2,
  FlaskConical,
  Search,
  Clock,
  Puzzle,
  Rocket,
  ChevronDown,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { RuCertificationCheckButton, RuConsoleLink } from "@/components/integrations/RuCertificationActions";

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
    case "hostfully":
    case "channex":
    case "guesty":
    case "hotelbeds":
    case "roomkey":
    case "roomracoon":
    case "profitroom":
    case "rentalsunited":
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
  const [bensonStagingUrl, setBensonStagingUrl] = useState("");

  // Production form state
  const [bensonProductionUsername, setBensonProductionUsername] = useState("");
  const [bensonProductionPassword, setBensonProductionPassword] = useState("");
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
  const [syncingNightsbridgeReservations, setSyncingNightsbridgeReservations] = useState(false);

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
  const [hostfullyAgencyUid, setHostfullyAgencyUid] = useState("");
  const [hostfullyEnvironment, setHostfullyEnvironment] = useState<"staging" | "production">("staging");
  const [editingHostfully, setEditingHostfully] = useState(false);
  const [savingHostfully, setSavingHostfully] = useState(false);
  const [togglingHostfully, setTogglingHostfully] = useState(false);
  const [hostfullyRefreshInterval, setHostfullyRefreshInterval] = useState<number>(60);
  const [hostfullyListingSelectorOpen, setHostfullyListingSelectorOpen] = useState(false);
  const [hostfullyListingsCount, setHostfullyListingsCount] = useState<number | null>(null);
  const [hostfullyLastSyncAt, setHostfullyLastSyncAt] = useState<string | null>(null);
  const [hostfullySyncStatus, setHostfullySyncStatus] = useState<"idle" | "syncing" | "success" | "error">("idle");
  
  // Sandbox query state
  const [sandboxQueryDialogOpen, setSandboxQueryDialogOpen] = useState(false);
  const [sandboxProperties, setSandboxProperties] = useState<Array<{
    id: string;
    name: string;
    type: string;
    bedrooms?: number;
    bathrooms?: number;
    max_guests?: number;
    address?: string;
    city?: string;
    country?: string;
    base_price?: number;
    _raw?: Record<string, unknown>;
  }>>([]);
  const [querySandboxLoading, setQuerySandboxLoading] = useState(false);
  const [selectedSandboxIds, setSelectedSandboxIds] = useState<Set<string>>(new Set());
  const [creatingSandboxProperties, setCreatingSandboxProperties] = useState(false);

  // Cloudbeds-specific state
  const [cloudbedsCredentials, setCloudbedsCredentials] = useState<PMSCredentials | null>(null);
  const [cloudbedsApiKey, setCloudbedsApiKey] = useState("");
  const [cloudbedsEnvironment, setCloudbedsEnvironment] = useState<"staging" | "production">("staging");
  const [editingCloudbeds, setEditingCloudbeds] = useState(false);
  const [savingCloudbeds, setSavingCloudbeds] = useState(false);
  const [togglingCloudbeds, setTogglingCloudbeds] = useState(false);
  const [cloudbedsRefreshInterval, setCloudbedsRefreshInterval] = useState<number>(60);

  // Little Hotelier-specific state
  const [littlehotelierCredentials, setLittlehotelierCredentials] = useState<PMSCredentials | null>(null);
  const [littlehotelierChannelCode, setLittlehotelierChannelCode] = useState("");
  const [littlehotelierRegion, setLittlehotelierRegion] = useState<"apac" | "emea">("emea");
  const [editingLittlehotelier, setEditingLittlehotelier] = useState(false);
  const [savingLittlehotelier, setSavingLittlehotelier] = useState(false);
  const [togglingLittlehotelier, setTogglingLittlehotelier] = useState(false);
  const [littlehotelierRefreshInterval, setLittlehotelierRefreshInterval] = useState<number>(60);

  // HotelBeds-specific state
  const [hotelbedsCredentials, setHotelbedsCredentials] = useState<PMSCredentials | null>(null);
  const [hotelbedsApiKey, setHotelbedsApiKey] = useState("");
  const [hotelbedsApiSecret, setHotelbedsApiSecret] = useState("");
  const [hotelbedsEnvironment, setHotelbedsEnvironment] = useState<"staging" | "production">("staging");
  const [editingHotelbeds, setEditingHotelbeds] = useState(false);
  const [savingHotelbeds, setSavingHotelbeds] = useState(false);
  const [togglingHotelbeds, setTogglingHotelbeds] = useState(false);
  const [hotelbedsRefreshInterval, setHotelbedsRefreshInterval] = useState<number>(60);

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

  // ROL'OS planned items state
  const DEFAULT_PLANNED_ITEMS = ["Booking Engine Widget", "Channel Manager", "Payment Integration", "Multi-Property Dashboard"];
  const [rolosCompletedItems, setRolosCompletedItems] = useState<string[]>([]);
  const rolosPlannedItems = DEFAULT_PLANNED_ITEMS.filter((item) => !rolosCompletedItems.includes(item));

  const handleMarkRolosItemDeployed = async (item: string) => {
    const newCompleted = [...rolosCompletedItems, item];
    setRolosCompletedItems(newCompleted);
    // Persist to pms_tracker_status additional_info
    const existing = trackerData.roomsonline?.additional_info || {};
    await supabase
      .from("pms_tracker_status")
      .upsert({
        system_type: "roomsonline",
        additional_info: { ...existing, rolos_completed_items: newCompleted },
        updated_at: new Date().toISOString(),
      }, { onConflict: "system_type" });
    toast({ title: `${item} marked as deployed` });
  };

  // ProfitRoom-specific state
  const [profitroomCredentials, setProfitroomCredentials] = useState<PMSCredentials | null>(null);
  const [profitroomApiKey, setProfitroomApiKey] = useState("");
  const [profitroomEnvironment, setProfitroomEnvironment] = useState<"staging" | "production">("staging");
  const [editingProfitroom, setEditingProfitroom] = useState(false);
  const [savingProfitroom, setSavingProfitroom] = useState(false);
  const [togglingProfitroom, setTogglingProfitroom] = useState(false);

  // Rentals United-specific state
  const [rentalsunitedCredentials, setRentalsunitedCredentials] = useState<PMSCredentials | null>(null);
  const [rentalsunitedApiKey, setRentalsunitedApiKey] = useState("");
  const [rentalsunitedApiSecret, setRentalsunitedApiSecret] = useState("");
  const [rentalsunitedEndpointUrl, setRentalsunitedEndpointUrl] = useState("");
  const [editingRentalsunited, setEditingRentalsunited] = useState(false);
  const [savingRentalsunited, setSavingRentalsunited] = useState(false);
  const [togglingRentalsunited, setTogglingRentalsunited] = useState(false);

  // PMS Tracker status state
  const [trackerData, setTrackerData] = useState<Record<string, PMSTrackerStatus>>({});
  const [sendingStatusReport, setSendingStatusReport] = useState(false);
  const [showParked, setShowParked] = useState(false);
  const isParked = (key: string) => trackerData[key]?.integration_status === 'parked';
  const parkedCls = (key: string) => (!showParked && isParked(key) ? 'hidden' : '');

  useEffect(() => {
    fetchApiKeys();
    fetchBensonCredentials();
    fetchBensonActiveEnvironment();
    fetchNightsbridgeCredentials();
    fetchCheckfrontCredentials();
    fetchHostfullyCredentials();
    fetchCloudbedsCredentials();
    fetchLittlehotelierCredentials();
    fetchHotelbedsCredentials();
    fetchProfitroomCredentials();
    fetchRentalsunitedCredentials();
    fetchResendConfig();
    fetchTripadvisorConfig();
    fetchGlobalSettings();
    fetchRoomsonlineStatus();
    fetchTrackerData();
  }, []);

  const fetchTrackerData = async () => {
    const { data, error } = await supabase.from("pms_tracker_status").select("*");

    if (data && !error) {
      const mapped: Record<string, PMSTrackerStatus> = {};
      data.forEach((row) => {
        mapped[row.system_type] = {
          system_type: row.system_type,
          status: row.status || "Unknown",
          integration_status: row.integration_status as PmsIntegrationStatus | undefined,
          contact_person: row.contact_person || undefined,
          contact_name: row.contact_name || undefined,
          contact_tel: row.contact_tel || undefined,
          contact_email: row.contact_email || undefined,
          // Setup phase
          has_account: row.has_account || false,
          has_docs: row.has_docs || false,
          has_edge: row.has_edge || false,
          // Integration phase
          has_health: row.has_health || false,
          has_get: row.has_get || false,
          has_post: row.has_post || false,
          has_modify: row.has_modify || false,
          has_cancel: row.has_cancel || false,
          has_soft_test: row.has_soft_test || false,
          is_certified: row.is_certified || false,
          is_production: row.is_production || false,
          // Environment control
          active_environment: (row.active_environment || 'sandbox') as 'sandbox' | 'production',
          // Legacy field
          has_access: row.has_access || false,
          notes: row.notes || undefined,
          additional_info: row.additional_info as PMSTrackerStatus["additional_info"],
        };
      });
      setTrackerData(mapped);
      // Load ROL'OS completed items from additional_info
      const rolosInfo = mapped.roomsonline?.additional_info as any;
      if (rolosInfo?.rolos_completed_items) {
        setRolosCompletedItems(rolosInfo.rolos_completed_items);
      }
    }
  };

  const sendStatusReport = async () => {
    setSendingStatusReport(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-pms-status-report");

      if (error) throw error;

      toast({
        title: "Status report sent",
        description: "PMS integration status report has been sent to dev@roomsonline.co.za",
      });
    } catch (error: any) {
      console.error("Error sending status report:", error);
      toast({
        title: "Error sending report",
        description: error.message || "Failed to send status report",
        variant: "destructive",
      });
    } finally {
      setSendingStatusReport(false);
    }
  };

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
    const { data } = await supabase.from("api_keys").select("*").eq("key_name", "TRIPADVISOR_API_KEY").maybeSingle();

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
      setHostfullyEnvironment(data.environment as "staging" | "production");
      if (data.refresh_interval_minutes) {
        setHostfullyRefreshInterval(data.refresh_interval_minutes);
      }
      // Load agency UID from agent_code field
      if (data.agent_code) {
        setHostfullyAgencyUid(data.agent_code);
      }
      // Load available listings count and last sync time
      if (data.available_listings) {
        const listings = data.available_listings as { properties?: any[] };
        setHostfullyListingsCount(listings.properties?.length || 0);
      }
      if (data.last_sync_at) {
        setHostfullyLastSyncAt(data.last_sync_at);
      }
    }
  };

  const handleHostfullySyncListings = async () => {
    setHostfullySyncStatus("syncing");
    try {
      const { data, error } = await supabase.functions.invoke("hostfully-api", {
        body: { action: "list_properties" },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error?.message || "Failed to sync listings");

      const properties = data.data?.properties || [];

      // Update pms_credentials with the listings
      const { error: updateError } = await supabase
        .from("pms_credentials")
        .update({
          available_listings: { properties, count: properties.length, agency_uid: data.data?.agency_uid },
          last_sync_at: new Date().toISOString(),
          sync_status: "connected",
        })
        .eq("system_type", "hostfully");

      if (updateError) throw updateError;

      setHostfullyListingsCount(properties.length);
      setHostfullyLastSyncAt(new Date().toISOString());
      setHostfullySyncStatus("success");

      toast({
        title: "Listings synced",
        description: `Found ${properties.length} listings from Hostfully`,
      });

      // Refresh credentials to get updated data
      fetchHostfullyCredentials();
    } catch (err: any) {
      console.error("Error syncing Hostfully listings:", err);
      setHostfullySyncStatus("error");
      toast({
        title: "Sync failed",
        description: err.message || "Failed to sync listings from Hostfully",
        variant: "destructive",
      });
    }
  };

  const handleHostfullyImportListings = async (
    listings: PMSListing[],
    mode: "create" | "attach",
    targetPropertyId?: string,
  ) => {
    try {
      if (mode === "create") {
        // Create new properties from listings
        for (const listing of listings) {
          const propertyData = {
            name: listing.name,
            address: listing.address || "Address pending",
            city: listing.city || "City pending",
            country: listing.country || "Country pending",
            property_type: listing.type || "Property",
            max_guests: listing.max_guests || 2,
            bedrooms: listing.bedrooms || 1,
            bathrooms: listing.bathrooms || 1,
            price_per_night: listing.base_price || 0,
            external_system: "hostfully",
            external_id: listing.id,
            hostfully_property_uid: listing.id,
            external_metadata: listing._raw || {},
            pms_managed_fields: ["availability", "rates", "max_guests", "bedrooms", "bathrooms"],
            pms_sync_status: "active",
            last_pms_sync_at: new Date().toISOString(),
            is_active: true,
          };

          const { data: newProperty, error } = await supabase
            .from("properties")
            .insert(propertyData)
            .select("id")
            .single();
            
          if (error) {
            console.error("Error creating property:", error);
            throw new Error(`Failed to create property "${listing.name}": ${error.message}`);
          }

          // Invoke full ingestion to populate room types and all PMS fields
          try {
            await supabase.functions.invoke("hostfully-api", {
              body: {
                action: "full_ingest_property",
                propertyUid: listing.id,
                rol_property_id: newProperty.id,
                owner_credential_id: hostfullyCredentials?.id,
              },
            });
            console.log(`Full ingestion completed for ${listing.name}`);
          } catch (ingestErr) {
            console.warn(`Ingestion warning for ${listing.name}:`, ingestErr);
          }
        }

        toast({
          title: "Properties created",
          description: `Successfully imported ${listings.length} properties from Hostfully`,
        });
      } else if (mode === "attach" && targetPropertyId) {
        // For attach mode, we'd create room types - simplified for now
        toast({
          title: "Coming soon",
          description: "Attaching listings to existing properties is under development",
        });
      }
    } catch (err: any) {
      console.error("Error importing listings:", err);
      throw err;
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
      setCloudbedsEnvironment(data.environment as "staging" | "production");
      if (data.refresh_interval_minutes) {
        setCloudbedsRefreshInterval(data.refresh_interval_minutes);
      }
    }
  };

  const fetchLittlehotelierCredentials = async () => {
    const { data, error } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "littlehotelier")
      .maybeSingle();

    if (!error && data) {
      setLittlehotelierCredentials(data);
      if (data.agent_code) setLittlehotelierChannelCode(data.agent_code);
      if (data.base_url) setLittlehotelierRegion(data.base_url as "apac" | "emea");
      if (data.refresh_interval_minutes) {
        setLittlehotelierRefreshInterval(data.refresh_interval_minutes);
      }
    }
  };

  const fetchHotelbedsCredentials = async () => {
    const { data, error } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "hotelbeds")
      .maybeSingle();

    if (!error && data) {
      setHotelbedsCredentials(data);
      setHotelbedsEnvironment(data.environment as "staging" | "production");
      if (data.refresh_interval_minutes) {
        setHotelbedsRefreshInterval(data.refresh_interval_minutes);
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
      agent_code: hostfullyAgencyUid || hostfullyCredentials?.agent_code || null,
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
      setHostfullyAgencyUid("");
      fetchHostfullyCredentials();
    }
    setSavingHostfully(false);
  };

  // Sandbox query handlers
  const handleQuerySandboxProperties = async () => {
    setQuerySandboxLoading(true);
    setSandboxProperties([]);
    setSelectedSandboxIds(new Set());
    
    try {
      const { data, error } = await supabase.functions.invoke("hostfully-api", {
        body: { 
          action: "list_properties",
          api_key: hostfullyCredentials?.api_key,
          environment: "sandbox",
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error?.message || "Failed to query sandbox");

      const properties = (data.data?.properties || []).map((p: Record<string, unknown>) => ({
        id: p.id as string,
        name: p.name as string,
        type: (p._raw as Record<string, unknown>)?.type as string || 'Property',
        bedrooms: p.bedrooms as number,
        bathrooms: p.bathrooms as number,
        max_guests: p.max_guests as number,
        address: p.address as string,
        city: p.city as string,
        country: p.country as string,
        base_price: p.base_price as number,
        _raw: p._raw as Record<string, unknown>,
      }));

      setSandboxProperties(properties);
      setSandboxQueryDialogOpen(true);

      toast({
        title: "Properties found",
        description: `Found ${properties.length} properties in Hostfully sandbox`,
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to query Hostfully sandbox";
      toast({
        title: "Query failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setQuerySandboxLoading(false);
    }
  };

  const handleCreateSandboxProperties = async () => {
    setCreatingSandboxProperties(true);
    
    try {
      const selectedProperties = sandboxProperties.filter(p => selectedSandboxIds.has(p.id));
      let created = 0;
      
      for (const listing of selectedProperties) {
        // Extract pictureLink from raw data for image
        const pictureLink = listing._raw?.pictureLink || listing._raw?.picture;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const images = pictureLink ? [{ url: pictureLink, alt: listing.name, order: 0, category: 'property' }] as any : null;
        
        const propertyData = {
          name: `[SANDBOX] ${listing.name}`,
          address: listing.address || "Sandbox Address",
          city: listing.city || "Sandbox City",
          country: listing.country || "ZA",
          property_type: listing.type || "Property",
          max_guests: listing.max_guests || 2,
          bedrooms: listing.bedrooms || 1,
          bathrooms: listing.bathrooms || 1,
          price_per_night: listing.base_price || 0,
          external_system: "hostfully",
          external_id: listing.id,
          hostfully_property_uid: listing.id,
          external_metadata: { 
            ...listing._raw, 
            is_sandbox: true,
            imported_from: "sandbox_query"
          },
          pms_managed_fields: ["availability", "rates", "max_guests", "bedrooms", "bathrooms"],
          pms_sync_status: "active",
          last_pms_sync_at: new Date().toISOString(),
          is_active: true,
          images, // Save the property image from pictureLink
        };

        const { data: newProperty, error } = await supabase
          .from("properties")
          .insert(propertyData)
          .select("id")
          .single();
          
        if (error) {
          console.error("Error creating sandbox property:", error);
        } else {
          created++;
          
          // Invoke full ingestion for room types
          if (newProperty) {
            try {
              await supabase.functions.invoke("hostfully-api", {
                body: {
                  action: "full_ingest_property",
                  propertyUid: listing.id,
                  rol_property_id: newProperty.id,
                  owner_credential_id: hostfullyCredentials?.id,
                },
              });
            } catch (ingestErr) {
              console.warn("Ingestion warning:", ingestErr);
            }
          }
        }
      }

      toast({
        title: "Test properties created",
        description: `Created ${created} of ${selectedProperties.length} test properties from sandbox`,
      });

      setSandboxQueryDialogOpen(false);
      setSelectedSandboxIds(new Set());
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Failed to create test properties";
      toast({
        title: "Creation failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setCreatingSandboxProperties(false);
    }
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

  const handleSaveLittlehotelierCredentials = async () => {
    setSavingLittlehotelier(true);

    const credData = {
      system_type: "littlehotelier",
      environment: "production",
      agent_code: littlehotelierChannelCode || littlehotelierCredentials?.agent_code || null,
      base_url: littlehotelierRegion,
      is_active: true,
    };

    let error;
    if (littlehotelierCredentials) {
      const result = await supabase.from("pms_credentials").update(credData).eq("id", littlehotelierCredentials.id);
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
        description: "Little Hotelier credentials have been updated successfully",
      });
      setEditingLittlehotelier(false);
      fetchLittlehotelierCredentials();
    }
    setSavingLittlehotelier(false);
  };

  const handleSaveHotelbedsCredentials = async () => {
    setSavingHotelbeds(true);

    const credData = {
      system_type: "hotelbeds",
      environment: hotelbedsEnvironment,
      api_key: hotelbedsApiKey || hotelbedsCredentials?.api_key || null,
      password: hotelbedsApiSecret || hotelbedsCredentials?.password || null,
      is_active: true,
    };

    let error;
    if (hotelbedsCredentials) {
      const result = await supabase.from("pms_credentials").update(credData).eq("id", hotelbedsCredentials.id);
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
        description: "HotelBeds credentials have been updated successfully",
      });
      setEditingHotelbeds(false);
      setHotelbedsApiKey("");
      setHotelbedsApiSecret("");
      fetchHotelbedsCredentials();
    }
    setSavingHotelbeds(false);
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

  const handleHostfullyEnvironmentChange = async (newEnv: "staging" | "production") => {
    setHostfullyEnvironment(newEnv);
    if (hostfullyCredentials) {
      const { error } = await supabase
        .from("pms_credentials")
        .update({ environment: newEnv })
        .eq("id", hostfullyCredentials.id);
      if (error) {
        toast({
          title: "Error updating environment",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Environment updated",
          description: `Hostfully now using ${newEnv} endpoint`,
        });
      }
    }
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

  // ProfitRoom handlers
  const fetchProfitroomCredentials = async () => {
    const { data, error } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "profitroom")
      .maybeSingle();

    if (!error && data) {
      setProfitroomCredentials(data);
      setProfitroomEnvironment(data.environment as "staging" | "production");
    }
  };

  const handleSaveProfitroomCredentials = async () => {
    setSavingProfitroom(true);

    const credData = {
      system_type: "profitroom",
      environment: profitroomEnvironment,
      api_key: profitroomApiKey || profitroomCredentials?.api_key || null,
      is_active: true,
    };

    let error;
    if (profitroomCredentials) {
      const result = await supabase.from("pms_credentials").update(credData).eq("id", profitroomCredentials.id);
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
        description: "ProfitRoom credentials have been updated successfully",
      });
      setEditingProfitroom(false);
      setProfitroomApiKey("");
      fetchProfitroomCredentials();
    }
    setSavingProfitroom(false);
  };

  const handleToggleProfitroom = async (enabled: boolean) => {
    setTogglingProfitroom(true);
    if (profitroomCredentials) {
      await supabase.from("pms_credentials").update({ is_active: enabled }).eq("id", profitroomCredentials.id);
    }
    toast({
      title: enabled ? "ProfitRoom enabled" : "ProfitRoom disabled",
      description: `ProfitRoom integration is now ${enabled ? "active" : "inactive"}`,
    });
    fetchProfitroomCredentials();
    setTogglingProfitroom(false);
  };

  // Rentals United handlers
  const fetchRentalsunitedCredentials = async () => {
    const { data, error } = await supabase
      .from("pms_credentials")
      .select("*")
      .eq("system_type", "rentalsunited")
      .maybeSingle();

    if (!error && data) {
      setRentalsunitedCredentials(data);
    }
  };

  const handleSaveRentalsunitedCredentials = async () => {
    setSavingRentalsunited(true);

    const credData = {
      system_type: "rentalsunited",
      environment: "production" as const,
      api_key: rentalsunitedApiKey || rentalsunitedCredentials?.api_key || null,
      api_secret: rentalsunitedApiSecret || (rentalsunitedCredentials as any)?.api_secret || null,
      base_url: rentalsunitedEndpointUrl || rentalsunitedCredentials?.base_url || "https://rm.rentalsunited.com/api/Handler.ashx",
      is_active: true,
    };

    let error;
    if (rentalsunitedCredentials) {
      const result = await supabase.from("pms_credentials").update(credData).eq("id", rentalsunitedCredentials.id);
      error = result.error;
    } else {
      const result = await supabase.from("pms_credentials").insert(credData);
      error = result.error;
    }

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({
        title: "Credentials saved",
        description: "Rentals United credentials have been updated successfully",
      });
      setEditingRentalsunited(false);
      setRentalsunitedApiKey("");
      setRentalsunitedApiSecret("");
      setRentalsunitedEndpointUrl("");
      fetchRentalsunitedCredentials();
    }
    setSavingRentalsunited(false);
  };

  const handleToggleRentalsunited = async (enabled: boolean) => {
    setTogglingRentalsunited(true);
    if (rentalsunitedCredentials) {
      await supabase.from("pms_credentials").update({ is_active: enabled }).eq("id", rentalsunitedCredentials.id);
    }
    toast({
      title: enabled ? "Rentals United enabled" : "Rentals United disabled",
      description: `Rentals United integration is now ${enabled ? "active" : "inactive"}`,
    });
    fetchRentalsunitedCredentials();
    setTogglingRentalsunited(false);
  };



  const handleCloudbedsEnvironmentChange = async (newEnv: "staging" | "production") => {
    setCloudbedsEnvironment(newEnv);
    if (cloudbedsCredentials) {
      const { error } = await supabase
        .from("pms_credentials")
        .update({ environment: newEnv })
        .eq("id", cloudbedsCredentials.id);
      if (error) {
        toast({
          title: "Error updating environment",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Environment updated",
          description: `Cloudbeds now using ${newEnv} endpoint`,
        });
      }
    }
  };

  const handleNightsbridgeEnvironmentChange = async (newEnv: "staging" | "production") => {
    setNightsbridgeEnvironment(newEnv);
    if (nightsbridgeCredentials) {
      const { error } = await supabase
        .from("pms_credentials")
        .update({ environment: newEnv })
        .eq("id", nightsbridgeCredentials.id);
      if (error) {
        toast({
          title: "Error updating environment",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Environment updated",
          description: `NightsBridge now using ${newEnv} endpoint`,
        });
      }
    }
  };

  const handleSyncNightsbridgeReservations = async () => {
    setSyncingNightsbridgeReservations(true);
    try {
      const { data, error } = await supabase.functions.invoke("nightsbridge-reservations-sync", {
        body: {},
      });

      if (error) throw error;

      if (data?.success) {
        toast({
          title: "Reservations synced",
          description: data.message || `Synced ${data.data?.synced || 0} reservations from NightsBridge`,
        });
      } else {
        toast({
          title: "Sync issue",
          description: data?.message || data?.error || "Could not sync reservations",
          variant: "destructive",
        });
      }
    } catch (error: any) {
      console.error("NightsBridge sync error:", error);
      toast({
        title: "Sync failed",
        description: error.message || "Failed to sync NightsBridge reservations",
        variant: "destructive",
      });
    } finally {
      setSyncingNightsbridgeReservations(false);
    }
  };

  const handleCheckfrontEnvironmentChange = async (newEnv: "staging" | "production") => {
    setCheckfrontEnvironment(newEnv);
    if (checkfrontCredentials) {
      const { error } = await supabase
        .from("pms_credentials")
        .update({ environment: newEnv })
        .eq("id", checkfrontCredentials.id);
      if (error) {
        toast({
          title: "Error updating environment",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Environment updated",
          description: `Checkfront now using ${newEnv} endpoint`,
        });
      }
    }
  };

  const handleHotelbedsEnvironmentChange = async (newEnv: "staging" | "production") => {
    setHotelbedsEnvironment(newEnv);
    if (hotelbedsCredentials) {
      const { error } = await supabase
        .from("pms_credentials")
        .update({ environment: newEnv })
        .eq("id", hotelbedsCredentials.id);
      if (error) {
        toast({
          title: "Error updating environment",
          description: error.message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Environment updated",
          description: `HotelBeds now using ${newEnv} endpoint`,
        });
      }
    }
  };

  // Unified environment handler - saves to pms_tracker_status.active_environment
  // For Hostfully, also syncs matching owner_pms_credentials into pms_credentials
  const handleUnifiedEnvironmentChange = async (systemType: string, newEnv: 'sandbox' | 'production') => {
    const { error } = await supabase
      .from("pms_tracker_status")
      .update({ active_environment: newEnv })
      .eq("system_type", systemType);
      
    if (error) {
      toast({
        title: "Error updating environment",
        description: error.message,
        variant: "destructive",
      });
      return;
    }

    // For Hostfully, sync the matching owner_pms_credentials into pms_credentials
    if (systemType === 'hostfully') {
      const ownerEnv = newEnv === 'sandbox' ? 'sandbox' : 'production';
      const { data: ownerCred } = await supabase
        .from('owner_pms_credentials')
        .select('*')
        .eq('system_type', 'hostfully')
        .eq('environment', ownerEnv)
        .eq('is_active', true)
        .maybeSingle();

      if (ownerCred) {
        // Update pms_credentials with the matching owner credential data
        const updateData: Record<string, any> = {
          environment: ownerEnv,
          api_key: ownerCred.api_key,
          agent_code: ownerCred.external_account_id,
          sync_status: ownerCred.sync_status,
          last_sync_at: ownerCred.last_sync_at,
          available_listings: ownerCred.available_listings,
        };

        if (hostfullyCredentials?.id) {
          await supabase
            .from('pms_credentials')
            .update(updateData as never)
            .eq('id', hostfullyCredentials.id);
        }
      }

      // Re-fetch to update UI
      fetchHostfullyCredentials();
    }

    toast({
      title: "Environment updated",
      description: `${systemType} now using ${newEnv} endpoint`,
    });
    fetchTrackerData();
  };

  const handleToggleLittlehotelier = async (enabled: boolean) => {
    setTogglingLittlehotelier(true);
    if (littlehotelierCredentials) {
      await supabase.from("pms_credentials").update({ is_active: enabled }).eq("id", littlehotelierCredentials.id);
    }
    toast({
      title: enabled ? "Little Hotelier enabled" : "Little Hotelier disabled",
      description: `Little Hotelier integration is now ${enabled ? "active" : "inactive"}`,
    });
    fetchLittlehotelierCredentials();
    setTogglingLittlehotelier(false);
  };

  const handleToggleHotelbeds = async (enabled: boolean) => {
    setTogglingHotelbeds(true);
    if (hotelbedsCredentials) {
      await supabase.from("pms_credentials").update({ is_active: enabled }).eq("id", hotelbedsCredentials.id);
    }
    toast({
      title: enabled ? "HotelBeds enabled" : "HotelBeds disabled",
      description: `HotelBeds integration is now ${enabled ? "active" : "inactive"}`,
    });
    fetchHotelbedsCredentials();
    setTogglingHotelbeds(false);
  };

  const handleToggleRoomsonline = async (enabled: boolean) => {
    setTogglingRoomsonline(true);
    // Store RoomsOnline active status in api_keys table
    const { error } = await supabase.from("api_keys").upsert(
      {
        key_name: "ROOMSONLINE_ACTIVE",
        name: "RoomsOnline API Active",
        key_value: enabled ? "true" : "false",
        system_type: "roomsonline",
        is_required: false,
      },
      { onConflict: "key_name" },
    );

    if (error) {
      toast({
        title: "Error toggling ROL'OS",
        description: error.message,
        variant: "destructive",
      });
    } else {
      setRoomsonlineActive(enabled);
      toast({
        title: enabled ? "ROL'OS enabled" : "ROL'OS disabled",
        description: `ROL'OS is now ${enabled ? "active" : "inactive"}`,
      });
    }
    setTogglingRoomsonline(false);
  };

  const fetchRoomsonlineStatus = async () => {
    const { data } = await supabase.from("api_keys").select("key_value").eq("key_name", "ROOMSONLINE_ACTIVE").single();

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
      description: `${systemType.charAt(0).toUpperCase() + systemType.slice(1)} data will refresh every ${intervalMinutes} minute${intervalMinutes !== 1 ? "s" : ""}`,
    });
    setSavingRefreshInterval(null);
  };

  const isPlaceholder = (value: string | null) => {
    return !value || value.startsWith("placeholder_key_");
  };

  // Calculate configured PMS/API count based on actual credentials
  // Calculate total progress across all trackable systems (9 flags × 13 systems = 117 milestones)
  // Excludes roomsonline (internal), recaptcha, maps
  const getProgressStats = () => {
    const trackableSystems = Object.entries(trackerData)
      .filter(([key, data]) => !['roomsonline', 'recaptcha', 'google_maps'].includes(key) && data.integration_status !== 'parked');

    
    let completedFlags = 0;
    const totalFlags = trackableSystems.length * 11; // 11 flags per system (including modify + cancel)
    let deployedCount = 0;
    
    trackableSystems.forEach(([_, data]) => {
      // Count completed flags - Setup phase
      if (data.has_account) completedFlags++;
      if (data.has_docs) completedFlags++;
      if (data.has_edge) completedFlags++;
      // Integration phase
      if (data.has_health) completedFlags++;
      if (data.has_get) completedFlags++;
      if (data.has_post) completedFlags++;
      if (data.has_modify) completedFlags++;
      if (data.has_cancel) completedFlags++;
      if (data.has_soft_test) completedFlags++;
      if (data.is_certified) completedFlags++;
      if (data.is_production) completedFlags++;
      
      // Count deployed systems
      if (data.integration_status === 'deployed') deployedCount++;
    });
    
    return { 
      completedFlags, 
      totalFlags: totalFlags || 143, // Default to 143 if no tracker data yet (13 systems × 11)
      deployedCount,
      systemCount: trackableSystems.length || 13
    };
  };
  
  const progressStats = getProgressStats();

  // Cloudbeds card renderer
  const renderCloudbedsCard = () => {
    const isConfigured = !!cloudbedsCredentials?.api_key;

    return (
      <AccordionItem
        value="cloudbeds"
        className={`border rounded-lg px-4 ${!cloudbedsCredentials?.is_active ? "opacity-60" : ""} ${parkedCls('cloudbeds')}`}
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <BedDouble className="h-5 w-5 text-primary" />
              <span className="font-semibold">Cloudbeds</span>
              <Badge variant="outline" className="text-xs">
                API Key
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <IntegrationStatusDropdown
                  systemType="cloudbeds"
                  currentStatus={trackerData.cloudbeds?.integration_status || null}
                  onStatusChange={() => fetchTrackerData()}
                  compact
                />
              </div>
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

            {/* Active Environment Toggle */}
            <EnvironmentToggle
              systemType="cloudbeds"
              currentEnvironment={trackerData.cloudbeds?.active_environment || 'sandbox'}
              onEnvironmentChange={(env) => handleUnifiedEnvironmentChange('cloudbeds', env)}
            />

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
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingCloudbeds(false);
                      setCloudbedsApiKey("");
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

                <PMSProgressToggles
                  systemType="cloudbeds"
                  trackerData={trackerData.cloudbeds}
                  onUpdated={fetchTrackerData}
                />

                {/* PMS IT Contact */}
                <PMSContactDetails
                  systemType="cloudbeds"
                  initialData={{
                    contact_name: trackerData["cloudbeds"]?.contact_name,
                    contact_tel: trackerData["cloudbeds"]?.contact_tel,
                    contact_email: trackerData["cloudbeds"]?.contact_email,
                  }}
                  onUpdated={() => fetchTrackerData()}
                />

                {/* Dev Notes */}
                <PMSDevNotes systemType="cloudbeds" />

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingCloudbeds(true)}>
                    {isConfigured ? "Update Credentials" : "Configure"}
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => navigate("/admin/pms-config/cloudbeds")}
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

  const totalPMSCount = TOTAL_PMS_SYSTEMS_COUNT;

  // Legacy count for other API keys (Google Maps, etc.)
  const requiredCount = apiKeys.filter((k) => k.is_required).length;
  const completedCount = apiKeys.filter((k) => k.is_required && !isPlaceholder(k.key_value)).length;

  // Group API keys: PMS systems vs Additional Services (Google Maps, Resend, etc.)
  const additionalServiceTypes = ["google", "resend", "tripadvisor", "global"];
  // Only show Semper and SiteMinder in the generic PMS cards (Benson, NightsBridge, Checkfront have custom cards)
  const allowedPmsTypes = ["semper", "siteminder"];
  const pmsKeys = apiKeys
    .filter((k) => k.system_type && allowedPmsTypes.includes(k.system_type))
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
                  <p className="text-xs text-muted-foreground">Get your API key from TripAdvisor Content API</p>
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
        className={`border rounded-lg px-4 ${!isConfigured ? "opacity-60" : ""} ${parkedCls(apiKey.system_type)}`}
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <IconComponent className="h-5 w-5 text-primary" />
              <span className="font-semibold">{apiKey.name}</span>
              {authTypeLabel && (
                <Badge variant="outline" className="text-xs">
                  {authTypeLabel}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-2">
              {apiKey.system_type && (
                <div onClick={(e) => e.stopPropagation()}>
                  <IntegrationStatusDropdown
                    systemType={apiKey.system_type}
                    currentStatus={trackerData[apiKey.system_type]?.integration_status || null}
                    onStatusChange={() => fetchTrackerData()}
                    compact
                  />
                </div>
              )}
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
            {apiKey.description && <p className="text-sm text-muted-foreground mb-4">{apiKey.description}</p>}
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
                  <PMSProgressToggles
                    systemType={apiKey.system_type}
                    trackerData={trackerData[apiKey.system_type]}
                    onUpdated={fetchTrackerData}
                  />
                )}

                {/* PMS IT Contact */}
                {apiKey.system_type && !additionalServiceTypes.includes(apiKey.system_type) && (
                  <PMSContactDetails
                    systemType={apiKey.system_type}
                    initialData={{
                      contact_name: trackerData[apiKey.system_type]?.contact_name,
                      contact_tel: trackerData[apiKey.system_type]?.contact_tel,
                      contact_email: trackerData[apiKey.system_type]?.contact_email,
                    }}
                    onUpdated={() => fetchTrackerData()}
                  />
                )}

                {/* Dev Notes */}
                {apiKey.system_type && !additionalServiceTypes.includes(apiKey.system_type) && (
                  <PMSDevNotes systemType={apiKey.system_type} />
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
                  setUrl("");
                }}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : isConfigured ? (
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <Label className="text-muted-foreground text-xs">Username</Label>
              <p className="font-medium text-green-600">Configured</p>
            </div>
            <div>
              <Label className="text-muted-foreground text-xs">Password</Label>
              <p className="font-medium text-green-600">Configured</p>
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
      <AccordionItem value="benson" className={`border rounded-lg px-4 ${!isBensonActive ? "opacity-60" : ""} ${parkedCls('benson')}`}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <Briefcase className="h-5 w-5 text-primary" />
              <span className="font-semibold">Benson</span>
              <Badge variant="outline" className="text-xs">
                Basic Auth
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <IntegrationStatusDropdown
                  systemType="benson"
                  currentStatus={trackerData.benson?.integration_status || null}
                  onStatusChange={() => fetchTrackerData()}
                  compact
                />
              </div>
              <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={isBensonActive}
                  onCheckedChange={handleToggleBenson}
                  disabled={togglingBenson || !isAnyConfigured}
                  className={!isAnyConfigured ? "opacity-50" : ""}
                />
                <span className="text-xs text-muted-foreground">{isBensonActive ? "On" : "Off"}</span>
              </div>
              {isProductionConfigured ? (
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
              Property Management System integration using username/password authentication
            </p>

            {/* Environment Toggle */}
            <EnvironmentToggle
              systemType="benson"
              currentEnvironment={bensonActiveEnvironment === "production" ? "production" : "sandbox"}
              onEnvironmentChange={(newEnv) => handleSaveBensonActiveEnvironment(newEnv === "production" ? "production" : "staging")}
              disabled={savingBensonActiveEnv || (!isStagingConfigured && !isProductionConfigured)}
              isLoading={savingBensonActiveEnv}
            />

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
              bensonProductionUrl,
              setBensonProductionUrl,
            )}

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
              bensonStagingUrl,
              setBensonStagingUrl,
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

            <PMSProgressToggles systemType="benson" trackerData={trackerData.benson} onUpdated={fetchTrackerData} />

            {/* PMS IT Contact */}
            <PMSContactDetails
              systemType="benson"
              initialData={{
                contact_name: trackerData["benson"]?.contact_name,
                contact_tel: trackerData["benson"]?.contact_tel,
                contact_email: trackerData["benson"]?.contact_email,
              }}
              onUpdated={() => fetchTrackerData()}
            />

            {/* Dev Notes */}
            <PMSDevNotes systemType="benson" />

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
      <AccordionItem
        value="nightsbridge"
        className={`border rounded-lg px-4 ${!nightsbridgeCredentials?.is_active ? "opacity-60" : ""} ${parkedCls('nightsbridge')}`}
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <BedDouble className="h-5 w-5 text-primary" />
              <span className="font-semibold">NightsBridge</span>
              <Badge variant="outline" className="text-xs">
                Agent Code
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <IntegrationStatusDropdown
                  systemType="nightsbridge"
                  currentStatus={trackerData.nightsbridge?.integration_status || null}
                  onStatusChange={() => fetchTrackerData()}
                  compact
                />
              </div>
              <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={nightsbridgeCredentials?.is_active ?? false}
                  onCheckedChange={handleToggleNightsbridge}
                  disabled={togglingNightsbridge || !isConfigured}
                  className={!isConfigured ? "opacity-50" : ""}
                />
                <span className="text-xs text-muted-foreground">
                  {nightsbridgeCredentials?.is_active ? "On" : "Off"}
                </span>
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
                      onCheckedChange={(checked) =>
                        handleNightsbridgeEnvironmentChange(checked ? "production" : "staging")
                      }
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
                    <p className="text-xs text-muted-foreground">
                      Auto-refresh API data when older than this (minutes)
                    </p>
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

                <PMSProgressToggles
                  systemType="nightsbridge"
                  trackerData={trackerData.nightsbridge}
                  onUpdated={fetchTrackerData}
                />

                {/* PMS IT Contact */}
                <PMSContactDetails
                  systemType="nightsbridge"
                  initialData={{
                    contact_name: trackerData["nightsbridge"]?.contact_name,
                    contact_tel: trackerData["nightsbridge"]?.contact_tel,
                    contact_email: trackerData["nightsbridge"]?.contact_email,
                  }}
                  onUpdated={() => fetchTrackerData()}
                />

                {/* Dev Notes */}
                <PMSDevNotes systemType="nightsbridge" />

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" onClick={() => setEditingNightsbridge(true)}>
                    {isConfigured ? "Update Credentials" : "Configure"}
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => navigate("/admin/pms-config/nightsbridge")}
                    disabled={!isConfigured}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Field Mappings
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleSyncNightsbridgeReservations}
                    disabled={syncingNightsbridgeReservations || !nightsbridgeCredentials?.api_key}
                    title={
                      !nightsbridgeCredentials?.api_key
                        ? "API key required for reservation sync"
                        : "Sync reservations from NightsBridge"
                    }
                  >
                    {syncingNightsbridgeReservations ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Syncing...
                      </>
                    ) : (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Sync Reservations
                      </>
                    )}
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
      <AccordionItem value="checkfront" className={`${!checkfrontCredentials?.is_active ? "opacity-60" : ""} ${parkedCls('checkfront')}`}>
        <AccordionTrigger className="hover:no-underline px-4 py-3 bg-card rounded-lg border">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <CheckCircle className="h-5 w-5 text-primary" />
              <span className="font-semibold">Checkfront</span>
              <Badge variant="outline" className="text-xs">
                Token / OAuth2
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <IntegrationStatusDropdown
                  systemType="checkfront"
                  currentStatus={trackerData.checkfront?.integration_status || null}
                  onStatusChange={() => fetchTrackerData()}
                  compact
                />
              </div>
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
                    <p className="text-xs text-muted-foreground">
                      Your Checkfront subdomain (e.g., yourcompany.checkfront.com)
                    </p>
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
                        onCheckedChange={(checked) =>
                          handleCheckfrontEnvironmentChange(checked ? "production" : "staging")
                        }
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
                      <p className="font-medium truncate text-xs">{checkfrontCredentials?.base_url || "Not set"}</p>
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
                      <p className="text-xs text-muted-foreground">
                        Auto-refresh API data when older than this (minutes)
                      </p>
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

                  <PMSProgressToggles
                    systemType="checkfront"
                    trackerData={trackerData.checkfront}
                    onUpdated={fetchTrackerData}
                  />

                  {/* PMS IT Contact */}
                  <PMSContactDetails
                    systemType="checkfront"
                    initialData={{
                      contact_name: trackerData["checkfront"]?.contact_name,
                      contact_tel: trackerData["checkfront"]?.contact_tel,
                      contact_email: trackerData["checkfront"]?.contact_email,
                    }}
                    onUpdated={() => fetchTrackerData()}
                  />

                  {/* Dev Notes */}
                  <PMSDevNotes systemType="checkfront" />

                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setEditingCheckfront(true)}>
                      {isConfigured ? "Update Credentials" : "Configure"}
                    </Button>
                    <Button
                      variant="default"
                      onClick={() => navigate("/admin/pms-config/checkfront")}
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

  // Little Hotelier-specific card (read-only Rates API)
  const renderLittlehotelierCard = () => {
    const isConfigured = !!littlehotelierCredentials?.agent_code;

    return (
      <AccordionItem
        value="littlehotelier"
        className={`border rounded-lg px-4 ${!littlehotelierCredentials?.is_active ? "opacity-60" : ""} ${parkedCls('littlehotelier')}`}
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <BedDouble className="h-5 w-5 text-primary" />
              <span className="font-semibold">Little Hotelier</span>
              <Badge variant="outline" className="text-xs">
                Channel Code
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <IntegrationStatusDropdown
                  systemType="littlehotelier"
                  currentStatus={trackerData.littlehotelier?.integration_status || null}
                  onStatusChange={() => fetchTrackerData()}
                  compact
                />
              </div>
              <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={littlehotelierCredentials?.is_active ?? false}
                  onCheckedChange={handleToggleLittlehotelier}
                  disabled={togglingLittlehotelier || !isConfigured}
                  className={!isConfigured ? "opacity-50" : ""}
                />
                <span className="text-xs text-muted-foreground">
                  {littlehotelierCredentials?.is_active ? "On" : "Off"}
                </span>
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
              Cloud-based property management system designed for small hotels, B&Bs, and guest houses
            </p>
            <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-md inline-block">
              ⓘ Read-only Rates API — availability and rates only, no reservation creation
            </div>

            {editingLittlehotelier ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="littlehotelier-channel">Channel Code</Label>
                  <Input
                    id="littlehotelier-channel"
                    value={littlehotelierChannelCode}
                    onChange={(e) => setLittlehotelierChannelCode(e.target.value)}
                    placeholder={littlehotelierCredentials?.agent_code || "Enter channel code"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Public channel code from Little Hotelier for Rates API access
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Region</Label>
                  <div className="flex items-center gap-4">
                    <Button
                      variant={littlehotelierRegion === "emea" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLittlehotelierRegion("emea")}
                    >
                      EMEA (Europe)
                    </Button>
                    <Button
                      variant={littlehotelierRegion === "apac" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setLittlehotelierRegion("apac")}
                    >
                      APAC (Asia-Pacific)
                    </Button>
                  </div>
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveLittlehotelierCredentials} disabled={savingLittlehotelier}>
                    {savingLittlehotelier ? "Saving..." : "Save"}
                  </Button>
                  <Button variant="outline" onClick={() => setEditingLittlehotelier(false)}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Channel Code</Label>
                    <p className={`font-medium ${littlehotelierCredentials?.agent_code ? "text-green-600" : ""}`}>
                      {littlehotelierCredentials?.agent_code || "Not set"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Region</Label>
                    <p className="font-medium uppercase">{littlehotelierCredentials?.base_url || "EMEA"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <p className="font-medium">{littlehotelierCredentials?.is_active ? "Active" : "Inactive"}</p>
                  </div>
                </div>

                <PMSProgressToggles
                  systemType="littlehotelier"
                  trackerData={trackerData.littlehotelier}
                  onUpdated={fetchTrackerData}
                />

                {/* PMS IT Contact */}
                <PMSContactDetails
                  systemType="littlehotelier"
                  initialData={{
                    contact_name: trackerData["littlehotelier"]?.contact_name,
                    contact_tel: trackerData["littlehotelier"]?.contact_tel,
                    contact_email: trackerData["littlehotelier"]?.contact_email,
                  }}
                  onUpdated={() => fetchTrackerData()}
                />

                {/* Dev Notes */}
                <PMSDevNotes systemType="littlehotelier" />

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingLittlehotelier(true)}>
                    {isConfigured ? "Update Credentials" : "Configure"}
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => navigate("/admin/pms-config/littlehotelier")}
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

  // Hostfully-specific card with sandbox/production toggle
  const renderHostfullyCard = () => {
    const isConfigured = !!hostfullyCredentials?.api_key && !!hostfullyCredentials?.agent_code;

    return (
      <AccordionItem
        value="hostfully"
        className={`border rounded-lg px-4 ${!hostfullyCredentials?.is_active ? "opacity-60" : ""} ${parkedCls('hostfully')}`}
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <BedDouble className="h-5 w-5 text-primary" />
              <span className="font-semibold">Hostfully</span>
              <Badge variant="outline" className="text-xs">
                Agency UID + API Key
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <IntegrationStatusDropdown
                  systemType="hostfully"
                  currentStatus={trackerData.hostfully?.integration_status || null}
                  onStatusChange={() => fetchTrackerData()}
                  compact
                />
              </div>
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
            <p className="text-sm text-muted-foreground">Property management platform for vacation rental managers</p>
            <div className="text-xs text-blue-600 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded-md inline-block">
              ⓘ Rate Limit: 10,000 API calls per hour
            </div>

            {/* Active Environment Toggle */}
            <EnvironmentToggle
              systemType="hostfully"
              currentEnvironment={trackerData.hostfully?.active_environment || 'sandbox'}
              onEnvironmentChange={(env) => handleUnifiedEnvironmentChange('hostfully', env)}
            />

            {/* Sandbox Testing Section - Only visible when sandbox is selected */}
            {trackerData.hostfully?.active_environment !== 'production' && isConfigured && (
              <div className="p-4 rounded-lg border border-yellow-300 bg-yellow-50 dark:bg-yellow-950/30 dark:border-yellow-800">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
                      <FlaskConical className="h-4 w-4" />
                      Sandbox Testing
                    </p>
                    <p className="text-sm text-yellow-700 dark:text-yellow-300">
                      Query and import test properties from Hostfully sandbox
                    </p>
                  </div>
                  <Button 
                    variant="outline"
                    onClick={handleQuerySandboxProperties}
                    disabled={querySandboxLoading}
                    className="border-yellow-400 hover:bg-yellow-100 dark:hover:bg-yellow-900/50"
                  >
                    {querySandboxLoading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Querying...
                      </>
                    ) : (
                      <>
                        <Search className="h-4 w-4 mr-2" />
                        Query Properties
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}

            {editingHostfully ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="hostfully-agency-uid">Agency UID</Label>
                  <Input
                    id="hostfully-agency-uid"
                    value={hostfullyAgencyUid}
                    onChange={(e) => setHostfullyAgencyUid(e.target.value)}
                    placeholder={hostfullyCredentials?.agent_code || "Enter your Hostfully Agency UID (UUID format)"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Your unique Agency identifier from Hostfully
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="hostfully-apikey">API Key</Label>
                    <Key className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <Input
                    id="hostfully-apikey"
                    type="password"
                    value={hostfullyApiKey}
                    onChange={(e) => setHostfullyApiKey(e.target.value)}
                    placeholder={hostfullyCredentials?.api_key ? "••••••••" : "Enter API key from Agency Settings"}
                  />
                  <p className="text-xs text-muted-foreground">
                    Find in Agency Settings → API Access. Also stored in secrets as <code className="px-1 py-0.5 rounded bg-muted text-xs">HOSTFULLY_API_KEY</code>
                  </p>
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
                      setHostfullyAgencyUid("");
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Available Listings Panel */}
                {isConfigured && (
                  <div className="p-4 rounded-lg border bg-gradient-to-r from-primary/5 to-primary/10 border-primary/20">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Building2 className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-medium">
                            Available from Hostfully
                            {hostfullyListingsCount !== null && (
                              <Badge variant="secondary" className="ml-2">
                                {hostfullyListingsCount} listings
                              </Badge>
                            )}
                          </p>
                          <SyncStatusIndicator
                            status={hostfullySyncStatus}
                            lastSyncAt={hostfullyLastSyncAt}
                            onSync={handleHostfullySyncListings}
                            compact
                            showButton={false}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleHostfullySyncListings}
                          disabled={hostfullySyncStatus === "syncing"}
                        >
                          <RefreshCw
                            className={`h-4 w-4 mr-2 ${hostfullySyncStatus === "syncing" ? "animate-spin" : ""}`}
                          />
                          Sync
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => setHostfullyListingSelectorOpen(true)}
                          disabled={hostfullyListingsCount === 0}
                        >
                          <Building2 className="h-4 w-4 mr-2" />
                          View & Import
                        </Button>
                      </div>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Agency UID</Label>
                    <p className={`font-medium ${hostfullyCredentials?.agent_code ? "text-green-600" : ""}`}>
                      {hostfullyCredentials?.agent_code 
                        ? `${hostfullyCredentials.agent_code.slice(0, 8)}...` 
                        : "Not set"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground flex items-center gap-1">
                      API Key <Key className="h-3 w-3" />
                    </Label>
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
                
                {/* Secrets Link Info */}
                <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 rounded-md px-3 py-2">
                  <Key className="h-3.5 w-3.5" />
                  <span>API Key also stored in secrets: <code className="px-1 py-0.5 rounded bg-background">HOSTFULLY_API_KEY</code>, <code className="px-1 py-0.5 rounded bg-background">HOSTFULLY_CLIENT_ID</code>, <code className="px-1 py-0.5 rounded bg-background">HOSTFULLY_CLIENT_SECRET</code></span>
                </div>

                {/* Refresh Interval Setting */}
                <div className="flex items-center justify-between p-4 rounded-lg border bg-muted/50">
                  <div className="space-y-1">
                    <Label className="text-sm font-medium">Data Refresh Interval</Label>
                    <p className="text-xs text-muted-foreground">
                      Auto-refresh API data when older than this (minutes)
                    </p>
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

                <PMSProgressToggles
                  systemType="hostfully"
                  trackerData={trackerData.hostfully}
                  onUpdated={fetchTrackerData}
                />

                {/* PMS IT Contact */}
                <PMSContactDetails
                  systemType="hostfully"
                  initialData={{
                    contact_name: trackerData["hostfully"]?.contact_name,
                    contact_tel: trackerData["hostfully"]?.contact_tel,
                    contact_email: trackerData["hostfully"]?.contact_email,
                  }}
                  onUpdated={() => fetchTrackerData()}
                />

                {/* Dev Notes */}
                <PMSDevNotes systemType="hostfully" />

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingHostfully(true)}>
                    {isConfigured ? "Update Credentials" : "Configure"}
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => navigate("/admin/pms-config/hostfully")}
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

  // Hostfully Listing Selector Modal - rendered separately
  const renderHostfullyListingSelector = () => (
    <PMSListingSelector
      open={hostfullyListingSelectorOpen}
      onOpenChange={setHostfullyListingSelectorOpen}
      systemType="hostfully"
      onImport={handleHostfullyImportListings}
      existingProperties={[]}
    />
  );

  // Sandbox Query Dialog
  const renderSandboxQueryDialog = () => (
    <Dialog open={sandboxQueryDialogOpen} onOpenChange={setSandboxQueryDialogOpen}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-yellow-600" />
            Sandbox Properties
          </DialogTitle>
          <DialogDescription>
            Select properties to create as test properties linked to Hostfully
          </DialogDescription>
        </DialogHeader>
        
        <ScrollArea className="h-[400px] pr-4">
          {sandboxProperties.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              No properties found in sandbox
            </p>
          ) : (
            <div className="space-y-2">
              {/* Select All */}
              <div className="flex items-center gap-3 pb-2 border-b">
                <Checkbox 
                  checked={selectedSandboxIds.size === sandboxProperties.length && sandboxProperties.length > 0}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      setSelectedSandboxIds(new Set(sandboxProperties.map(p => p.id)));
                    } else {
                      setSelectedSandboxIds(new Set());
                    }
                  }}
                />
                <span className="text-sm font-medium">Select All ({sandboxProperties.length})</span>
              </div>
              
              {/* Property List */}
              {sandboxProperties.map((property) => (
                <div 
                  key={property.id}
                  className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 cursor-pointer"
                  onClick={() => {
                    const newSet = new Set(selectedSandboxIds);
                    if (newSet.has(property.id)) {
                      newSet.delete(property.id);
                    } else {
                      newSet.add(property.id);
                    }
                    setSelectedSandboxIds(newSet);
                  }}
                >
                  <Checkbox
                    checked={selectedSandboxIds.has(property.id)}
                    onCheckedChange={(checked) => {
                      const newSet = new Set(selectedSandboxIds);
                      if (checked) {
                        newSet.add(property.id);
                      } else {
                        newSet.delete(property.id);
                      }
                      setSelectedSandboxIds(newSet);
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{property.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {property.city || 'Unknown'}, {property.country || 'ZA'} · 
                      {property.bedrooms || 0} bed · {property.max_guests || 0} guests
                    </p>
                  </div>
                  <Badge variant="outline" className="text-xs shrink-0">
                    {property.type}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => setSandboxQueryDialogOpen(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleCreateSandboxProperties}
            disabled={selectedSandboxIds.size === 0 || creatingSandboxProperties}
          >
            {creatingSandboxProperties ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Creating...
              </>
            ) : (
              `Create ${selectedSandboxIds.size} Test Properties`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // Rentals United card renderer
  const renderRentalsunitedCard = () => {
    const isConfigured = !!(rentalsunitedCredentials?.api_key && (rentalsunitedCredentials as any)?.api_secret);

    return (
      <AccordionItem
        value="rentalsunited"
        className={`border rounded-lg px-4 ${!rentalsunitedCredentials?.is_active ? "opacity-60" : ""} ${parkedCls('rentalsunited')}`}
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <BedDouble className="h-5 w-5 text-primary" />
              <span className="font-semibold">Rentals United</span>
              <Badge variant="outline" className="text-xs">
                XML + GC API
              </Badge>
              <Badge variant="secondary" className="text-xs">
                Sandbox — pre-certification
              </Badge>

            </div>
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <IntegrationStatusDropdown
                  systemType="rentalsunited"
                  currentStatus={trackerData.rentalsunited?.integration_status || null}
                  onStatusChange={() => fetchTrackerData()}
                  compact
                />
              </div>
              <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={rentalsunitedCredentials?.is_active ?? false}
                  onCheckedChange={handleToggleRentalsunited}
                  disabled={togglingRentalsunited || !isConfigured}
                  className={!isConfigured ? "opacity-50" : ""}
                />
                <span className="text-xs text-muted-foreground">{rentalsunitedCredentials?.is_active ? "On" : "Off"}</span>
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
              Channel manager and distribution platform for vacation rentals — XML API + GC (Global Connect) API.
            </p>
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs space-y-1">
              <p className="font-medium">Account</p>
              <p className="text-muted-foreground">
                API access to the XML and GC API granted to <span className="font-medium">sleepinafrica@roomsonline.co.za</span>.
              </p>
              <p className="text-muted-foreground">
                Status: Sandbox, pre-certification — development phase. Milestone markers reset for the new account.
              </p>
            </div>


            {/* Active Environment Toggle */}
            <EnvironmentToggle
              systemType="rentalsunited"
              currentEnvironment={trackerData.rentalsunited?.active_environment || 'sandbox'}
              onEnvironmentChange={(env) => handleUnifiedEnvironmentChange('rentalsunited', env)}
            />

            {editingRentalsunited ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="ru-apikey">AccessKey</Label>
                  <Input
                    id="ru-apikey"
                    type="password"
                    value={rentalsunitedApiKey}
                    onChange={(e) => setRentalsunitedApiKey(e.target.value)}
                    placeholder={rentalsunitedCredentials?.api_key ? "••••••••" : "Enter RU XML AccessKey"}
                  />
                  <p className="text-xs text-muted-foreground">Use the AccessKey issued for the Rentals United XML API.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ru-apisecret">SecretKey</Label>
                  <Input
                    id="ru-apisecret"
                    type="password"
                    value={rentalsunitedApiSecret}
                    onChange={(e) => setRentalsunitedApiSecret(e.target.value)}
                    placeholder={(rentalsunitedCredentials as any)?.api_secret ? "••••••••" : "Enter RU XML SecretKey"}
                  />
                  <p className="text-xs text-muted-foreground">Use the SecretKey paired with the XML AccessKey.</p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="ru-endpoint">Endpoint URL</Label>
                  <Input
                    id="ru-endpoint"
                    value={rentalsunitedEndpointUrl}
                    onChange={(e) => setRentalsunitedEndpointUrl(e.target.value)}
                    placeholder={rentalsunitedCredentials?.base_url || "https://rm.rentalsunited.com/api/Handler.ashx"}
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveRentalsunitedCredentials} disabled={savingRentalsunited}>
                    {savingRentalsunited ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingRentalsunited(false);
                      setRentalsunitedApiKey("");
                      setRentalsunitedApiSecret("");
                      setRentalsunitedEndpointUrl("");
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
                    <Label className="text-muted-foreground">AccessKey</Label>
                    <p className={`font-medium ${rentalsunitedCredentials?.api_key ? "text-green-600" : ""}`}>
                      {rentalsunitedCredentials?.api_key ? "Configured" : "Not set"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">SecretKey</Label>
                    <p className={`font-medium ${(rentalsunitedCredentials as any)?.api_secret ? "text-green-600" : ""}`}>
                      {(rentalsunitedCredentials as any)?.api_secret ? "Configured" : "Not set"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Endpoint</Label>
                    <p className="font-medium text-xs truncate">{rentalsunitedCredentials?.base_url || "Default"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <p className="font-medium">{rentalsunitedCredentials?.is_active ? "Active" : "Inactive"}</p>
                  </div>
                </div>

                <PMSProgressToggles
                  systemType="rentalsunited"
                  trackerData={trackerData.rentalsunited}
                  onUpdated={fetchTrackerData}
                />

                {/* PMS IT Contact */}
                <PMSContactDetails
                  systemType="rentalsunited"
                  initialData={{
                    contact_name: trackerData["rentalsunited"]?.contact_name,
                    contact_tel: trackerData["rentalsunited"]?.contact_tel,
                    contact_email: trackerData["rentalsunited"]?.contact_email,
                  }}
                  onUpdated={() => fetchTrackerData()}
                />

                {/* Dev Notes */}
                <PMSDevNotes systemType="rentalsunited" />

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingRentalsunited(true)}>
                    {isConfigured ? "Update Credentials" : "Configure"}
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => navigate("/admin/pms-config/rentalsunited")}
                    disabled={!isConfigured}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Field Mappings
                  </Button>
                  <RuCertificationCheckButton size="default" variant="outline" />
                  <RuConsoleLink size="default" />
                </div>
              </div>
            )}
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  // ProfitRoom card renderer
  const renderProfitroomCard = () => {
    const isConfigured = !!profitroomCredentials?.api_key;

    return (
      <AccordionItem
        value="profitroom"
        className={`border rounded-lg px-4 ${!profitroomCredentials?.is_active ? "opacity-60" : ""} ${parkedCls('profitroom')}`}
      >
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <BedDouble className="h-5 w-5 text-primary" />
              <span className="font-semibold">ProfitRoom</span>
              <Badge variant="outline" className="text-xs">
                API Key
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <IntegrationStatusDropdown
                  systemType="profitroom"
                  currentStatus={trackerData.profitroom?.integration_status || null}
                  onStatusChange={() => fetchTrackerData()}
                  compact
                />
              </div>
              <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                <Switch
                  checked={profitroomCredentials?.is_active ?? false}
                  onCheckedChange={handleToggleProfitroom}
                  disabled={togglingProfitroom || !isConfigured}
                  className={!isConfigured ? "opacity-50" : ""}
                />
                <span className="text-xs text-muted-foreground">{profitroomCredentials?.is_active ? "On" : "Off"}</span>
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
              Hotel management platform with booking engine, channel manager, and CRS
            </p>

            {/* Active Environment Toggle */}
            <EnvironmentToggle
              systemType="profitroom"
              currentEnvironment={trackerData.profitroom?.active_environment || 'sandbox'}
              onEnvironmentChange={(env) => handleUnifiedEnvironmentChange('profitroom', env)}
            />

            {editingProfitroom ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="profitroom-apikey">API Key</Label>
                  <Input
                    id="profitroom-apikey"
                    type="password"
                    value={profitroomApiKey}
                    onChange={(e) => setProfitroomApiKey(e.target.value)}
                    placeholder={profitroomCredentials?.api_key ? "••••••••" : "Enter API key"}
                  />
                </div>

                <div className="flex gap-2">
                  <Button onClick={handleSaveProfitroomCredentials} disabled={savingProfitroom}>
                    {savingProfitroom ? "Saving..." : "Save"}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setEditingProfitroom(false);
                      setProfitroomApiKey("");
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
                    <p className={`font-medium ${profitroomCredentials?.api_key ? "text-green-600" : ""}`}>
                      {profitroomCredentials?.api_key ? "Configured" : "Not set"}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Environment</Label>
                    <p className="font-medium capitalize">{profitroomCredentials?.environment || "Sandbox"}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Status</Label>
                    <p className="font-medium">{profitroomCredentials?.is_active ? "Active" : "Inactive"}</p>
                  </div>
                </div>

                <PMSProgressToggles
                  systemType="profitroom"
                  trackerData={trackerData.profitroom}
                  onUpdated={fetchTrackerData}
                />

                {/* PMS IT Contact */}
                <PMSContactDetails
                  systemType="profitroom"
                  initialData={{
                    contact_name: trackerData["profitroom"]?.contact_name,
                    contact_tel: trackerData["profitroom"]?.contact_tel,
                    contact_email: trackerData["profitroom"]?.contact_email,
                  }}
                  onUpdated={() => fetchTrackerData()}
                />

                {/* Dev Notes */}
                <PMSDevNotes systemType="profitroom" />

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setEditingProfitroom(true)}>
                    {isConfigured ? "Update Credentials" : "Configure"}
                  </Button>
                  <Button
                    variant="default"
                    onClick={() => navigate("/admin/pms-config/profitroom")}
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

  // Placeholder card for upcoming PMS integrations
  const renderHyperguestCard = () => {
    const systemType = "hyperguest";
    const Icon = getPMSIcon(systemType);
    const tracker = trackerData[systemType];
    const demoId = (tracker?.additional_info as any)?.demo_property_id || "19912";
    const env = tracker?.active_environment || "sandbox";
    return (
      <AccordionItem key={systemType} value={systemType} className={`border rounded-lg px-4 ${parkedCls(systemType)}`}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-indigo-500" />
              <span className="font-semibold">HyperGuest</span>
              <Badge variant="outline" className="text-[10px]">
                Cert hotel {demoId}
              </Badge>
            </div>
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <IntegrationStatusDropdown
                  systemType={systemType}
                  currentStatus={tracker?.integration_status || null}
                  onStatusChange={() => fetchTrackerData()}
                  compact
                />
              </div>
              {tracker && <PMSTrackerStatusDisplay tracker={tracker} compact />}
              <Badge
                variant="outline"
                className={
                  env === "production"
                    ? "bg-green-500/10 text-green-600 border-green-500/30"
                    : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                }
              >
                {env}
              </Badge>
            </div>
          </div>
        </AccordionTrigger>
        <AccordionContent>
          <div className="pt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Distribution channel connectivity — enables ROL'OS → HyperGuest → Booking.com and other OTAs.
              All certification tests run against demo property <code>{demoId}</code>.
            </p>

            <EnvironmentToggle
              systemType="hyperguest"
              currentEnvironment={env as "sandbox" | "production"}
              onEnvironmentChange={(newEnv) => handleUnifiedEnvironmentChange("hyperguest", newEnv)}
            />

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-[11px]">
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="font-semibold text-muted-foreground">Static</div>
                <code className="break-all">hg-static.hyperguest.com/hotels.json</code>
              </div>
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="font-semibold text-muted-foreground">Search 2.0</div>
                <code className="break-all">search-api.hyperguest.io/2.0/</code>
              </div>
              <div className="rounded-md border bg-muted/30 p-2">
                <div className="font-semibold text-muted-foreground">Book 2.0</div>
                <code className="break-all">book-api.hyperguest.com/2.0/</code>
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground">
              Booking timeout: 300s with Booking-List fallback. All requests include
              <code className="ml-1">Accept-Encoding: gzip, deflate</code>. BAR / Net / Sell rates respected.
            </p>

            <HyperGuestDetails />
            <HyperGuestCertificationRunner />

            <PMSTrackerStatusDisplay tracker={tracker} />
            <PMSProgressToggles
              systemType={systemType}
              trackerData={tracker}
              onUpdated={() => fetchTrackerData()}
            />
            <PMSContactDetails
              systemType={systemType}
              initialData={{
                contact_name: tracker?.contact_name,
                contact_tel: tracker?.contact_tel,
                contact_email: tracker?.contact_email,
              }}
              onUpdated={() => fetchTrackerData()}
            />
            <PMSDevNotes systemType={systemType} />
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  const renderPlaceholderPMSCard = (name: string, systemType: string, description: string) => {
    const Icon = getPMSIcon(systemType);
    const tracker = trackerData[systemType];
    return (
      <AccordionItem key={systemType} value={systemType} className={`border rounded-lg px-4 opacity-60 ${parkedCls(systemType)}`}>
        <AccordionTrigger className="hover:no-underline">
          <div className="flex items-center justify-between w-full pr-4">
            <div className="flex items-center gap-3">
              <Icon className="h-5 w-5 text-muted-foreground" />
              <span className="font-semibold">{name}</span>
            </div>
            <div className="flex items-center gap-2">
              <div onClick={(e) => e.stopPropagation()}>
                <IntegrationStatusDropdown
                  systemType={systemType}
                  currentStatus={tracker?.integration_status || null}
                  onStatusChange={() => fetchTrackerData()}
                  compact
                />
              </div>
              {tracker && <PMSTrackerStatusDisplay tracker={tracker} compact />}
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

            {/* Tracker Status */}
            <PMSTrackerStatusDisplay tracker={tracker} />

            {/* Implementation Progress Toggles */}
            <PMSProgressToggles
              systemType={systemType}
              trackerData={tracker}
              onUpdated={() => fetchTrackerData()}
            />

            {/* PMS IT Contact */}
            <PMSContactDetails
              systemType={systemType}
              initialData={{
                contact_name: tracker?.contact_name,
                contact_tel: tracker?.contact_tel,
                contact_email: tracker?.contact_email,
              }}
              onUpdated={() => fetchTrackerData()}
            />

            <div className="p-4 rounded-lg border bg-muted/50 text-center">
              <p className="text-sm text-muted-foreground">
                This integration is planned for a future release. Contact support for more information.
              </p>
            </div>

            {/* Dev Notes */}
            <PMSDevNotes systemType={systemType} />
          </div>
        </AccordionContent>
      </AccordionItem>
    );
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Integrations"
        subtitle={`${progressStats.completedFlags} of ${progressStats.totalFlags} milestones · ${progressStats.deployedCount} deployed`}
        actions={
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-40 h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-status-healthy transition-all"
                  style={{ width: `${(progressStats.completedFlags / progressStats.totalFlags) * 100}%` }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {Math.round((progressStats.completedFlags / progressStats.totalFlags) * 100)}%
              </span>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowParked((v) => !v)}
              className="gap-1"
              title="Show or hide integrations marked as Parked"
            >
              {showParked ? "Hide" : "Show"} parked
              {(() => {
                const n = Object.values(trackerData).filter((t) => t?.integration_status === 'parked').length;
                return n > 0 ? <span className="ml-1 text-xs text-muted-foreground">({n})</span> : null;
              })()}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={sendStatusReport}
              disabled={sendingStatusReport}
              className="gap-1"
            >
              {sendingStatusReport ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              Status Report
            </Button>
          </div>
        }
      />

      {/* Global Settings Section */}
      <div className="mb-8">
        <h2 className="text-xl font-semibold mb-4">Global Settings</h2>
        <Accordion type="multiple" className="space-y-4">
          <AccordionItem value="navigation-settings" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <Settings className="h-5 w-5 text-primary" />
                <span className="font-semibold">Navigation Settings</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-4 space-y-6">
                <p className="text-sm text-muted-foreground">
                  Configure global navigation behavior for the application
                </p>
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
              </div>
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="wordpress-updates" className="border rounded-lg px-4">
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center gap-3">
                <Puzzle className="h-5 w-5 text-primary" />
                <span className="font-semibold">WordPress Plugin Updates</span>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  Push a version bump to all WordPress sites. Installed plugins will see the update within 12 hours.
                </p>
                <WordPressPushUpdateButton />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {/* ROL'OS Section */}
      <Collapsible className="mb-8">
        <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer w-full mb-4 group">
          <h2 className="text-xl font-semibold">ROL'OS</h2>
          <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
        <Accordion type="multiple" className="space-y-4">
          <AccordionItem
            value="roomsonline"
            className={`border rounded-lg px-4 border-primary/30 bg-primary/5 ${!roomsonlineActive ? "opacity-60" : ""}`}
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center justify-between w-full pr-4">
                <div className="flex items-center gap-3">
                  <Key className="h-5 w-5 text-primary" />
                  <span className="font-semibold">ROL'OS</span>
                  <Badge variant="default" className="text-xs">
                    Internal API
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div onClick={(e) => e.stopPropagation()}>
                    <IntegrationStatusDropdown
                      systemType="roomsonline"
                      currentStatus={trackerData.roomsonline?.integration_status || null}
                      onStatusChange={() => fetchTrackerData()}
                      compact
                    />
                  </div>
                  <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={roomsonlineActive}
                      onCheckedChange={handleToggleRoomsonline}
                      disabled={togglingRoomsonline}
                    />
                    <span className="text-xs text-muted-foreground">{roomsonlineActive ? "On" : "Off"}</span>
                  </div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent>
              <div className="pt-4 space-y-4">
                <p className="text-sm text-muted-foreground">
                  ROL'OS — RoomsOnline's proprietary operating system for direct property management.
                  <strong>
                    {" "}The primary interface for properties not using third-party PMS systems.
                  </strong>
                </p>

                {/* Current Capabilities - Deployed */}
                <div className="p-4 rounded-lg border border-emerald-200 bg-emerald-50 dark:bg-emerald-950/20 dark:border-emerald-800 space-y-3">
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600" />
                    <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">Deployed Capabilities</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200">Room Inventory</Badge>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200">Rate Management</Badge>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200">Season Pricing</Badge>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200">Guest CRM</Badge>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200">Folio System</Badge>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200">Housekeeping</Badge>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200">Maintenance</Badge>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200">Analytics (ADR/RevPAR)</Badge>
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200">White-Label Branding</Badge>
                    {rolosCompletedItems.map((item) => (
                      <Badge key={item} className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-300 border-emerald-200">{item}</Badge>
                    ))}
                  </div>
                  <p className="text-xs text-emerald-600 dark:text-emerald-400">
                    14 dedicated database tables • Bi-directional sync with Property Overview
                  </p>
                </div>

                {/* Planned Capabilities - clickable to mark as completed */}
                <div className="p-4 rounded-lg border bg-background space-y-2">
                  <div className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    <p className="text-sm font-medium">Planned / In Progress</p>
                    <span className="text-xs text-muted-foreground">(click to mark as deployed)</span>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-center">
                    {rolosPlannedItems.map((item) => (
                      <Badge
                        key={item}
                        variant="secondary"
                        className="cursor-pointer hover:bg-emerald-100 hover:text-emerald-800 transition-colors"
                        onClick={() => handleMarkRolosItemDeployed(item)}
                      >
                        {item}
                      </Badge>
                    ))}
                    {rolosPlannedItems.length === 0 && (
                      <p className="text-xs text-muted-foreground">All items deployed!</p>
                    )}
                  </div>
                </div>

                {/* Channel API Credentials */}
                <RolosChannelApiCards />

                {/* PMS IT Contact */}
                <PMSContactDetails
                  systemType="roomsonline"
                  initialData={{
                    contact_name: trackerData["roomsonline"]?.contact_name,
                    contact_tel: trackerData["roomsonline"]?.contact_tel,
                    contact_email: trackerData["roomsonline"]?.contact_email,
                  }}
                  onUpdated={() => fetchTrackerData()}
                />

                {/* Dev Notes */}
                <PMSDevNotes systemType="roomsonline" />
              </div>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
        </CollapsibleContent>
      </Collapsible>

      {/* PMS Systems Section - Alphabetically ordered */}
      <Collapsible className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer group">
            <h2 className="text-xl font-semibold">Property Management Systems</h2>
            <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <Button
            variant="outline"
            size="sm"
            onClick={sendStatusReport}
            disabled={sendingStatusReport}
            className="gap-2"
          >
            {sendingStatusReport ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Email Status Report
          </Button>
        </div>
        <CollapsibleContent>
        <Accordion type="multiple" className="space-y-4">
          {renderBensonCard()}
          {renderCheckfrontCard()}
          {renderCloudbedsCard()}
          {renderPlaceholderPMSCard(
            "Guesty",
            "guesty",
            "Property management and guest experience platform for vacation rentals",
          )}
          {renderHostfullyCard()}
          {/* Little Hotelier hidden - no longer required */}
          {renderPlaceholderPMSCard(
            "RoomKey",
            "roomkey",
            "Hotel booking platform with direct connections to major hotel chains",
          )}
          {renderPlaceholderPMSCard(
            "RoomRaccoon",
            "roomracoon",
            "All-in-one hotel management system with channel manager and booking engine",
          )}
          {pmsKeys.map(renderKeyCard)}
        </Accordion>
        </CollapsibleContent>
      </Collapsible>

      {/* Channel Managers Section */}
      <Collapsible className="mb-8">
        <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer w-full mb-4 group">
          <h2 className="text-xl font-semibold">Channel Managers</h2>
          <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
        
        <Accordion type="multiple" className="space-y-4">
          {renderPlaceholderPMSCard(
            "Agoda",
            "agoda",
            "Agoda OTA — rates, availability, and reservation distribution",
          )}
          {renderPlaceholderPMSCard(
            "Airbnb",
            "airbnb",
            "This is a SearchAPI.io wrapper for Airbnb data (search, listings, availability, reviews) — not a direct Airbnb PMS API. It's a read-only scraping/search API.",
          )}
          {renderPlaceholderPMSCard(
            "Booking.com",
            "booking_com",
            "Global OTA — rates, availability, and reservation sync",
          )}
          {renderPlaceholderPMSCard(
            "Channex.io",
            "channex",
            "Channel manager and PMS connectivity platform with open API for property distribution",
          )}
          {renderPlaceholderPMSCard(
            "Expedia",
            "expedia",
            "Expedia Group Rapid API — lodging availability, rates, and booking management",
          )}
          {renderPlaceholderPMSCard(
            "Google Hotels",
            "google_hotels",
            "Google Hotel Ads — surface rates on Google Search & Maps",
          )}
          {/* HotelBeds - Custom card with API key/secret */}
          <AccordionItem
            value="hotelbeds"
            className={`border rounded-lg px-4 ${!hotelbedsCredentials?.is_active ? "opacity-60" : ""} ${parkedCls('hotelbeds')}`}
          >
            <AccordionTrigger className="hover:no-underline">
              <div className="flex items-center justify-between w-full pr-4">
                <div className="flex items-center gap-3">
                  <BedDouble className="h-5 w-5 text-primary" />
                  <span className="font-semibold">HotelBeds</span>
                  <Badge variant="outline" className="text-xs">
                    API Key + Secret
                  </Badge>
                </div>
                <div className="flex items-center gap-2">
                  <div onClick={(e) => e.stopPropagation()}>
                    <IntegrationStatusDropdown
                      systemType="hotelbeds"
                      currentStatus={trackerData.hotelbeds?.integration_status || null}
                      onStatusChange={() => fetchTrackerData()}
                      compact
                    />
                  </div>
                  <div className="flex items-center gap-2 mr-2" onClick={(e) => e.stopPropagation()}>
                    <Switch
                      checked={hotelbedsCredentials?.is_active ?? false}
                      onCheckedChange={handleToggleHotelbeds}
                      disabled={togglingHotelbeds || !hotelbedsCredentials?.api_key}
                      className={!hotelbedsCredentials?.api_key ? "opacity-50" : ""}
                    />
                    <span className="text-xs text-muted-foreground">
                      {hotelbedsCredentials?.is_active ? "On" : "Off"}
                    </span>
                  </div>
                  {hotelbedsCredentials?.api_key ? (
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
                  Global bedbank and travel distribution platform for hotels
                </p>
                <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 px-2 py-1 rounded-md inline-block">
                  ⓘ Test environment: 50 requests/day limit
                </div>

                {editingHotelbeds ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="hotelbeds-apikey">API Key</Label>
                      <Input
                        id="hotelbeds-apikey"
                        name="hotelbeds-api-key-input"
                        autoComplete="off"
                        value={hotelbedsApiKey}
                        onChange={(e) => setHotelbedsApiKey(e.target.value)}
                        placeholder={hotelbedsCredentials?.api_key ? "••••••••" : "Enter API key"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="hotelbeds-secret">API Secret</Label>
                      <Input
                        id="hotelbeds-secret"
                        name="hotelbeds-api-secret-input"
                        type="password"
                        autoComplete="new-password"
                        value={hotelbedsApiSecret}
                        onChange={(e) => setHotelbedsApiSecret(e.target.value)}
                        placeholder={hotelbedsCredentials?.password ? "••••••••" : "Enter API secret"}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Environment</Label>
                      <div className="flex items-center gap-4">
                        <Button
                          variant={hotelbedsEnvironment === "staging" ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleHotelbedsEnvironmentChange("staging")}
                        >
                          Test
                        </Button>
                        <Button
                          variant={hotelbedsEnvironment === "production" ? "default" : "outline"}
                          size="sm"
                          onClick={() => handleHotelbedsEnvironmentChange("production")}
                        >
                          Production
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button onClick={handleSaveHotelbedsCredentials} disabled={savingHotelbeds}>
                        {savingHotelbeds ? "Saving..." : "Save"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setEditingHotelbeds(false);
                          setHotelbedsApiKey("");
                          setHotelbedsApiSecret("");
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
                        <p className={`font-medium ${hotelbedsCredentials?.api_key ? "text-green-600" : ""}`}>
                          {hotelbedsCredentials?.api_key ? "Configured" : "Not set"}
                        </p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Environment</Label>
                        <p className="font-medium capitalize">{hotelbedsCredentials?.environment || "Test"}</p>
                      </div>
                      <div>
                        <Label className="text-muted-foreground">Status</Label>
                        <p className="font-medium">{hotelbedsCredentials?.is_active ? "Active" : "Inactive"}</p>
                      </div>
                    </div>
                    <PMSProgressToggles
                      systemType="hotelbeds"
                      trackerData={trackerData.hotelbeds}
                      onUpdated={fetchTrackerData}
                    />

                    {/* PMS IT Contact */}
                    <PMSContactDetails
                      systemType="hotelbeds"
                      initialData={{
                        contact_name: trackerData["hotelbeds"]?.contact_name,
                        contact_tel: trackerData["hotelbeds"]?.contact_tel,
                        contact_email: trackerData["hotelbeds"]?.contact_email,
                      }}
                      onUpdated={() => fetchTrackerData()}
                    />

                    {/* Dev Notes */}
                    <PMSDevNotes systemType="hotelbeds" />

                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => setEditingHotelbeds(true)}>
                        {hotelbedsCredentials?.api_key ? "Update Credentials" : "Configure"}
                      </Button>
                      <Button
                        variant="default"
                        onClick={() => navigate("/admin/pms-config/hotelbeds")}
                        disabled={!hotelbedsCredentials?.api_key}
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
          {renderPlaceholderPMSCard(
            "Lekkeslaap",
            "lekkeslaap",
            "South Africa's leading accommodation platform",
          )}
          {renderNightsbridgeCard()}
          {renderRentalsunitedCard()}
          {renderProfitroomCard()}
          {renderHyperguestCard()}
          {renderPlaceholderPMSCard(
            "TourPlan",
            "tourplan",
            "Tour operator and travel reservation platform. API account and documentation pending — edge function adapter will be built once credentials are available. Reference: github.com/shineklbm/tourplan",
          )}
          {renderPlaceholderPMSCard(
            "Beds24",
            "beds24",
            "Cloud PMS and channel manager with REST API v2. API account and token-based auth pending — edge function adapter will be wired once credentials are available. Docs: https://api.beds24.com/v2/",
          )}
          {renderPlaceholderPMSCard(
            "EasyOTA",
            "easyota",
            "Channel manager bridging properties to multiple OTAs. API account and documentation pending — edge function adapter will be wired once credentials are available.",
          )}
          {renderPlaceholderPMSCard(
            "eBeds",
            "ebeds",
            "Channel manager and distribution platform. API account and documentation pending — edge function adapter will be wired once credentials are available.",
          )}
        </Accordion>
        </CollapsibleContent>
      </Collapsible>

      {/* Financial Services Section */}
      <Collapsible className="mb-8">
        <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer w-full mb-4 group">
          <h2 className="text-xl font-semibold">Financial Services</h2>
          <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
        <div className="space-y-4">
          <Accordion type="multiple" className="space-y-4">
            <PriceLabsCard />
          </Accordion>
          <BankExportConfigCard />
        </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Additional Services Section */}
      <Collapsible className="mb-8">
        <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer w-full mb-4 group">
          <h2 className="text-xl font-semibold">Additional Services</h2>
          <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
        <Accordion type="multiple" className="space-y-4">
          {renderPlaceholderPMSCard(
            "WETU",
            "wetu",
            "Travel content portal — property descriptions, images, rooms, and features (read-only content API)",
          )}
          {renderResendCard()}
          {renderTripadvisorCard()}
          {additionalKeys
            .filter(
              (k) =>
                k.key_name !== "RESEND_API_KEY" &&
                !k.key_name.startsWith("TRIPADVISOR_") &&
                k.key_name !== "BOOK_OPEN_NEW_TAB" &&
                k.key_name !== "HOME_ICON_OPEN_NEW_TAB",
            )
            .map(renderKeyCard)}
        </Accordion>
        </CollapsibleContent>
      </Collapsible>
      {/* PayFast Environment Toggle */}
      <PayFastEnvironmentToggle />

      {/* External Tools Section (formerly Supporting Systems) */}
      <Collapsible className="mb-8">
        <CollapsibleTrigger className="flex items-center gap-2 cursor-pointer w-full mb-4 group">
          <h2 className="text-xl font-semibold">External Tools</h2>
          <ChevronDown className="h-5 w-5 text-muted-foreground transition-transform group-data-[state=open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent>
        <p className="text-sm text-muted-foreground mb-4">Manage external tools, hosting accounts, and team credentials</p>
        <SupportingSystemsTab />
        </CollapsibleContent>
      </Collapsible>

      {renderHostfullyListingSelector()}
      {renderSandboxQueryDialog()}
    </AppLayout>
  );
}
