import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense, startTransition, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { usePropertyFieldRequirements } from "@/hooks/usePropertyFieldRequirements";
import { focusRequirementField } from "@/lib/requirementFocus";
import { RequirementLegend } from "@/components/property/RequirementLegend";

/* ── Code-split heavy tab surfaces ───────────────────────────────────
   Radix unmounts inactive tabs, so each of these only downloads when
   the operator actually opens that section. Keeps the editor's initial
   chunk to the General tab. */
const PromoCodesTab = lazy(() => import("@/components/property/PromoCodesTab").then((m) => ({ default: m.PromoCodesTab })));
const PartnerOffersTab = lazy(() => import("@/components/property/PartnerOffersTab").then((m) => ({ default: m.PartnerOffersTab })));
const BillingConfigTab = lazy(() => import("@/components/property/BillingConfigTab").then((m) => ({ default: m.BillingConfigTab })));
const AdminOverviewTab = lazy(() => import("@/components/property/AdminOverviewTab").then((m) => ({ default: m.AdminOverviewTab })));
const ROLSpecTab = lazy(() => import("@/components/property/ROLSpecTab").then((m) => ({ default: m.ROLSpecTab })));
const ExperienceEmailDesigner = lazy(() => import("@/components/property/ExperienceEmailDesigner").then((m) => ({ default: m.ExperienceEmailDesigner })));
const PropertyOnboardingWizard = lazy(() => import("@/components/onboarding").then((m) => ({ default: m.PropertyOnboardingWizard })));
const RatesOverviewPanel = lazy(() => import("@/components/property/RatesOverviewPanel").then((m) => ({ default: m.RatesOverviewPanel })));
const PropertyFormIntegrationsTab = lazy(() => import("@/components/property/PropertyFormIntegrationsTab").then((m) => ({ default: m.PropertyFormIntegrationsTab })));
const AccommodationSpecialsTab = lazy(() => import("@/components/property/AccommodationSpecialsTab").then((m) => ({ default: m.AccommodationSpecialsTab })));
const RoomManagerTab = lazy(() => import("@/components/property/RoomManagerTab").then((m) => ({ default: m.RoomManagerTab })));
const PropertyContactDetails = lazy(() => import("@/components/property/PropertyContactDetails"));
const RateManagerTab = lazy(() => import("@/components/property/RateManagerTab").then((m) => ({ default: m.RateManagerTab })));
const RatePlansPanel = lazy(() => import("@/components/pms/rateplans/RatePlansPanel").then((m) => ({ default: m.RatePlansPanel })));
const HostfullyRoomDetails = lazy(() => import("@/components/pms/HostfullyRoomDetails").then((m) => ({ default: m.HostfullyRoomDetails })));

/** Skip building inactive tab trees. Radix already unmounts them; this avoids
 *  allocating the General/Rooms/Rates element forests on every keystroke. */
function DeferredWhen({ when, children }: { when: boolean; children: () => ReactNode }) {
  return when ? children() : null;
}

const FIELD_TO_TAB: Record<string, string> = {
  owner_email: "general",
  name: "general",
  property_type: "general",
  description: "general",
  address: "general",
  city: "general",
  country: "general",
  external_id: "general",
  nightsbridge_property_code: "general",
  hostfully_property_code: "general",
  images: "images",
  "amenities.bank_name": "info-facilities",
  "amenities.telephone": "general",
  "amenities.contact_email": "general",
  "amenities.room_types": "rooms",
  "amenities.check_in_time": "rates",
};
const PropertyMap = lazy(() => import("@/components/PropertyMap").then((m) => ({ default: m.PropertyMap })));
const BrandingTab = lazy(() => import("@/components/property/BrandingTab").then((m) => ({ default: m.BrandingTab })));
const WebsiteSyncModal = lazy(() => import("@/components/property/WebsiteSyncModal").then((m) => ({ default: m.WebsiteSyncModal })));
const RichTextEditor = lazy(() => import("@/components/RichTextEditor"));
import type { BrandingData } from "@/components/property/BrandingTab";
import type { WebsiteSyncSuggestion } from "@/components/property/WebsiteSyncModal";

import { CompanyInformationCard, type RuCompanyProfile } from "@/components/property/CompanyInformationCard";
import { PropertyRuOwnerPanel } from "@/components/property/PropertyRuOwnerPanel";
import { RuMcqPrompts } from "@/components/property/RuMcqPrompts";

import { GoLiveContinueBar } from "@/components/onboarding/channel/GoLiveContinueBar";


import { PortfolioIdentityCopy } from "@/components/property/PortfolioIdentityCopy";
import { PortfolioCommonsCard } from "@/components/property/PortfolioCommonsCard";
import { runAutoShare } from "@/lib/portfolioCommons";
import { resetBillingAfterOwnerChange } from "@/lib/ownerBillingReset";
import { queueChannelContentSync, queueChannelRatesSync } from "@/lib/channelContentSync";
import { derivePropertyStepsFromChanges, regradeChannelStepsAfterSave } from "@/lib/channelStepLedger";
import { deriveChangedChannelFields } from "@/lib/channelPushFields";
import { validateStayTimes } from "@/lib/stayTimes";
import { pushChangedChannelFields } from "@/lib/channelSavePush";
import { channelSaveOutcomeCopy } from "@/lib/channelEditGate";
import { RuRateGateTimer } from "@/components/property/RuRateGateTimer";
import { normalizeRoomIdentityName, resolvePersistedRoomIdentity } from "@/lib/roomIdentity";
import { buildPropertySavePatch, samePersistedValue } from "@/lib/propertySavePatch";

import { HyperGuestSyncReflectionButton } from "@/components/property/HyperGuestSyncReflectionButton";
import { HyperGuestPropertyLookup } from "@/components/property/HyperGuestPropertyLookup";
import { GooglePlaceIdPastePopover } from "@/components/property/GooglePlaceIdPastePopover";
import { Beds24PropertyLookup } from "@/components/property/Beds24PropertyLookup";
import {
  isMappedChannelPropertyType,
  normalizeChannelPropertyType,
  type ChangeoverDowKey,
} from "@/config/channelPropertyTypes";
import ChangeoverRulesCard from "@/components/property/policies/ChangeoverRulesCard";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { isRolosPms } from "@/lib/pmsUtils";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoomTypeDataViewer } from "@/components/ExpandableDataViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import {
  clearArrivalPolicyDraft,
  getArrivalPolicyDraft,
  notifyArrivalPolicySaved,
} from "@/lib/arrivalPolicyDraft";
import { useToast } from "@/hooks/use-toast";
import { validateImageDimensions, getValidationErrorMessage } from "@/lib/imageValidation";
import { useImageDimensionAudit } from "@/hooks/useImageDimensionAudit";
import { ImageQualityMarker } from "@/components/property/ImageQualityMarker";
import { ImageAuditSummary } from "@/components/property/ContentRuleHint";
import { z } from "zod";
import { getRoomUrl } from "@/lib/config";
import { parseBedConfiguration, BED_TYPES, BedEntry, authoredBedroomCount } from "@/lib/bedConfig";
import {
  Home,
  Building2,
  MapPin,
  Save,
  Info,
  Image,
  DollarSign,
  Bell,
  Package,
  Calendar,
  X,
  Plus,
  Minus,
  FileText,
  Check,
  Upload,
  Heart,
  Edit,
  Trash2,
  Copy,
  Link,
  ChevronRight,
  BedDouble,
  RefreshCw,
  CheckCircle,
  Briefcase,
  Layers,
  LucideIcon,
  Cloud,
  Key,
  ChevronsUpDown,
  XCircle,
  ChevronDown,
} from "lucide-react";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { StarRating } from "@/components/StarRating";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { TagInput } from "@/components/TagInput";
import {
  ACCOMMODATION_LABEL_OPTIONS,
  ACCOMMODATION_TYPES,
  getAccommodationLabel,
  type AccommodationLabelKey,
} from "@/lib/accommodationLabels";
import {
  getPMSFieldClass,
  getPMSDisplayName,
  isFieldPopulatedByPMS,
  getFieldAuthority,
  getAuthorityLabel,
} from "@/lib/pmsFieldConfig";
import {
  getPMSEditorialCapability,
  canSyncEditorial,
  getSyncableFields,
  getAuthorityLabel as getEditorialAuthorityLabel,
} from "@/lib/pmsEditorialConfig";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { pmsIntegrationStatus } from "@/components/ApiMilestones";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle, Sparkles, Globe, Palette, ShieldCheck, Loader2 } from "lucide-react";
import { MIN_DESCRIPTION_CHARS } from "@/components/property/InfoFacilitiesTab";
import { NearbyAttractionsPanel } from "@/components/experiences/NearbyAttractionsPanel";

import RuImageTagPicker from "@/components/property/RuImageTagPicker";
import {
  RuImageTagMap,
  normalizeRuImageTagMap,
  pruneRuImageTagMap,
  RU_TAG_MAIN,
  findMainImageUrl,
  setMainImageUrl,
  moveImageFirst,
} from "@/lib/ruImageTags";


import { ReferralSection } from "@/components/property/ReferralSection";
import { BrandVoiceCard } from "@/components/property/BrandVoiceCard";
import { ContextualHelp, ImpactWarning } from "@/components/help";
import { OwnerPMSConnectionCard } from "@/components/pms/OwnerPMSConnectionCard";
import { parseHostfullyProperties } from "@/lib/hostfullyBuildingParser";
import { syncFromWebsite } from "@/lib/api/websiteSync";
import { useFeatureFlags } from "@/hooks/useFeatureFlags";
import { ContractManagementPanel } from "@/components/contract";
import { useActivationReadiness } from "@/components/property/QualityGateIndicator";
import { HouseRulesCard } from "@/components/property/policies/HouseRulesCard";
import { RuPaymentMethodsPicker } from "@/components/property/RuPaymentMethodsPicker";
import { RuChannelContentFields } from "@/components/property/RuChannelContentFields";

import { syncPortfolioSeasonDates } from "@/lib/portfolioSeasonSync";
import { usePMSSync, isPMSFullyIntegrated, getPMSIntegrationLevel, getPMSIcon } from "@/hooks/usePMSSync";
import {
  PROPERTY_SECTION_ORDER,
  buildSectionGroups,
  getSectionLabel,
  type PropertySectionKey,
} from "@/config/propertySectionOrder";
import { PropertySectionRail } from "@/components/property/PropertySectionRail";
import RUAmenityPicker from "@/components/property/RUAmenityPicker";
import AiAmenityDialog from "@/components/property/AiAmenityDialog";
import { ROLOS_ONLY_FACILITY_GROUPS } from "@/lib/rolosOnlyFacilities";
import { hasSeparateKitchen, withSeparateKitchen } from "@/lib/ruKitchen";
import { canonicalPricingModel } from "@/components/pms/rateplans/ratePlanDraft";
import { CHANNEL_MANAGER } from "@/lib/channelVocabulary";


// Schema factory to handle conditional address validation
const createPropertySchema = (noStreetAddress: boolean) =>
  z.object({
    name: z.string().min(1, "Property name is required").max(200),
    property_type: z.string().min(1, "Property type is required"),
    contact_email: z.string().email("Invalid email address"),
    telephone: z.string().optional(),
    property_url: z.string().url("Invalid URL").optional().or(z.literal("")),
    wetu_id: z.string().optional().or(z.literal("")),
    currency: z.string().min(1, "Currency is required"),
    owner_name: z.string().optional(),
    owner_email: z.string().email("Invalid email address").optional().or(z.literal("")),
    country: z.string().min(1, "Country is required"),
    city: noStreetAddress ? z.string().optional() : z.string().min(1, "City is required"),
    address: noStreetAddress ? z.string().optional() : z.string().min(1, "Street name is required"),
    suburb: z.string().optional(),
    postal_code: z.string().optional(),
    bb_id: z.string().optional(),
    venue_id: z.string().optional(),
    channel_id: z.string().optional(),
    account_id: z.string().optional(),
    agent_id: z.string().optional(),
    has_vat: z.boolean().optional(),
    vat_number: z.string().optional(),
    property_registration: z.string().optional(),
    bank_name: z.string().optional(),
    branch_code: z.string().optional(),
    account_holder: z.string().optional(),
    account_number: z.string().optional(),
    account_type: z.string().optional(),
    swift_code: z.string().optional(),
    accepts_bitcoin: z.boolean().optional(),
    bitcoin_wallet_address: z.string().optional(),
    description: z.string().optional(),
    star_rating: z.number().min(0).max(5),
    facilities: z.array(z.string()).optional(),
    items_non_refundable: z.boolean().optional(),
    smoking_allowed: z.boolean().optional(),
    pets_allowed: z.boolean().optional(),
    children_allowed: z.boolean().optional(),
    parties_allowed: z.boolean().optional(),
    check_in_24h: z.boolean().optional(),
    deposit_allowed: z.boolean().optional(),
    deposit_percentage: z.string().optional(),
    deposit_days: z.string().optional(),
    same_day_bookings: z.boolean().optional(),
    same_day_cutoff: z.string().optional(),
    check_in_from: z.string().optional(),
    check_in_to: z.string().optional(),
    check_out_from: z.string().optional(),
    check_out_to: z.string().optional(),
    children_policy: z.string().optional(),
    infant_age_from: z.string().optional(),
    infant_age_to: z.string().optional(),
    children_age_from: z.string().optional(),
    children_age_to: z.string().optional(),
    // Property Surroundings fields
    restaurants_cafes: z.string().optional(),
    restaurants_cafes_distance: z.string().optional(),
    public_transport: z.string().optional(),
    public_transport_distance: z.string().optional(),
    closest_airport: z.string().optional(),
    closest_airport_distance: z.string().optional(),
    // Additional House Rules fields
    min_check_in_age: z.string().optional(),
    pets_policy: z.string().optional(),
    special_requests_message: z.string().optional(),
    advance_notice_required: z.boolean().optional(),
    cot_available: z.boolean().optional(),
    cot_age_from: z.string().optional(),
    cot_age_to: z.string().optional(),
    cot_price: z.string().optional(),
    extra_beds_available: z.boolean().optional(),
    extra_bed_price: z.string().optional(),
    child_adult_age: z.string().optional(),
    fine_print: z.string().optional(),
  });

// Create a base schema for type inference
const propertySchema = createPropertySchema(false);
type PropertyFormData = z.infer<typeof propertySchema>;

interface PropertyFormProps {
  embeddedPropertyId?: string | null;
  embeddedInitialTab?: string;
  embeddedOverride?: boolean;
  forceTabsOverride?: boolean;
}

/**
 * Module-scope shell so its component identity is stable across renders.
 * Declaring this inside PropertyForm remounted the entire form subtree on
 * every render (sub-tabs reset, inputs lost focus mid-typing).
 */
const FormShell = ({ embedded, children }: { embedded: boolean; children: React.ReactNode }) =>
  embedded ? <>{children}</> : <AppLayout>{children}</AppLayout>;

export default function PropertyForm({
  embeddedPropertyId,
  embeddedInitialTab,
  embeddedOverride,
  forceTabsOverride,
}: PropertyFormProps = {}) {
  const navigate = useNavigate();
  const routeParams = useParams(); // Can be UUID or slug
  const id = embeddedPropertyId ?? routeParams.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const forceTabs = forceTabsOverride ?? searchParams.get("forceTabs") === "1";
  // Embed mode: renders PropertyForm without page chrome (breadcrumb, header,
  // outer tab strip) and only the tab in `?tab=`. Used by /pms/property-setup
  // to mount the editor inline via a same-origin iframe. Save path is unchanged.
  const embedded = embeddedOverride ?? searchParams.get("embed") === "1";
  const { toast } = useToast();
  const { isDev, isAdmin, isFearlessLeader, user, profile, loading: authLoading } = useAuth();
  const { data: featureFlags } = useFeatureFlags();
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [owners, setOwners] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  // Bumped after a save so the channel push-gate countdown re-reads immediately.
  const [channelGateRefresh, setChannelGateRefresh] = useState(0);
  const [propertySlug, setPropertySlug] = useState<string>("");
  const [propertyId, setPropertyId] = useState<string | null>(null); // Actual UUID for DB operations

  // Feature flags from secure edge function
  const homeIconOpenNewTab = featureFlags?.home_icon_open_new_tab ?? true;
  const roomsonlineActive = featureFlags?.roomsonline_active ?? false;

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // When embedded in the ROLOS hub, broadcast our scroll height to the parent
  // so the iframe can auto-size (avoids double scrollbars).
  useEffect(() => {
    if (!embedded) return;
    const post = () => {
      try {
        window.parent?.postMessage(
          { type: "rolos-embed-height", height: document.body.scrollHeight },
          window.location.origin,
        );
      } catch {
        /* cross-origin — ignore */
      }
    };
    post();
    const ro = new ResizeObserver(post);
    ro.observe(document.body);
    window.addEventListener("resize", post);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", post);
    };
  }, [embedded]);

  // Helper to navigate with unsaved changes check (uses a styled AlertDialog
  // instead of window.confirm so the browser doesn't leak the embedded iframe URL).
  const [pendingNavPath, setPendingNavPath] = useState<string | null>(null);
  const handleNavigate = (path: string) => {
    if (isDirty) {
      setPendingNavPath(path);
      return;
    }
    navigate(path);
  };

  // Load owners list - only users with 'user' role (property owners)
  const [ownersLoaded, setOwnersLoaded] = useState(false);
  const [ownerSearchOpen, setOwnerSearchOpen] = useState(false);

  useEffect(() => {
    const loadOwners = async () => {
      // Get user IDs that have 'user' role only (property owners)
      const { data: ownerRoles } = await supabase.from("user_roles").select("user_id").eq("role", "user");

      if (ownerRoles && ownerRoles.length > 0) {
        const ownerIds = ownerRoles.map((r) => r.user_id);
        const { data: profiles } = await supabase.from("profiles").select("*").in("id", ownerIds).order("full_name");

        if (profiles) {
          setOwners(profiles);
        }
      } else {
        setOwners([]);
      }
      setOwnersLoaded(true);
    };
    loadOwners();
  }, []);

  // homeIconOpenNewTab now comes from useFeatureFlags hook

  // Offerings
  const [isAccommodation, setIsAccommodation] = useState(true);
  const [isVenues, setIsVenues] = useState(false);
  const [isEvent, setIsEvent] = useState(false);
  const [isConference, setIsConference] = useState(false);
  const [lekkeslaapUuid, setLekkeslaapUuid] = useState("");

  // Handle venues checkbox - if checked, check event and conference too; if unchecked, clear both
  const handleVenuesChange = (checked: boolean) => {
    setIsVenues(checked);
    if (checked) {
      setIsEvent(true);
      setIsConference(true);
    } else {
      setIsEvent(false);
      setIsConference(false);
    }
    setIsDirty(true);
  };

  // Handle event checkbox - if checked, venues must be checked
  const handleEventChange = (checked: boolean) => {
    setIsEvent(checked);
    if (checked) {
      setIsVenues(true);
    } else {
      // If unchecking and conference is also unchecked, uncheck venues
      if (!isConference) {
        setIsVenues(false);
      }
    }
    setIsDirty(true);
  };

  // Handle conference checkbox - if checked, venues must be checked
  const handleConferenceChange = (checked: boolean) => {
    setIsConference(checked);
    if (checked) {
      setIsVenues(true);
    } else {
      // If unchecking and event is also unchecked, uncheck venues
      if (!isEvent) {
        setIsVenues(false);
      }
    }
    setIsDirty(true);
  };

  // Website sync state
  const [websiteSyncing, setWebsiteSyncing] = useState(false);
  const [websiteSyncModalOpen, setWebsiteSyncModalOpen] = useState(false);
  const [websiteSyncSuggestions, setWebsiteSyncSuggestions] = useState<WebsiteSyncSuggestion[]>([]);
  const [sourceUrl2, setSourceUrl2] = useState("");
  const [sourceUrl3, setSourceUrl3] = useState("");
  const [websiteSyncUrl, setWebsiteSyncUrl] = useState("");

  // Accommodation label + self catering
  const [accommodationLabel, setAccommodationLabel] = useState<string>("");
  const [isSelfCatering, setIsSelfCatering] = useState(false);
  const [experienceEngineEnabled, setExperienceEngineEnabled] = useState(false);

  // Linked owners state
  const [linkedOwners, setLinkedOwners] = useState<
    Array<{ id: string; user_id: string; owner_email: string; owner_name: string | null }>
  >([]);
  const [linkedOwnerSearch, setLinkedOwnerSearch] = useState("");
  const persistedOwnerEmailRef = useRef("");
  /** Last persisted `properties` row — Phase 2 ledger diffing only. */
  const loadedPropertyRowRef = useRef<Record<string, unknown> | null>(null);


  const [ownerHostfullyCredential, setOwnerHostfullyCredential] = useState<any>(null);
  const [loadingOwnerCredential, setLoadingOwnerCredential] = useState(false);
  const [connectingHostfullyOAuth, setConnectingHostfullyOAuth] = useState(false);

  // Hostfully OAuth Connect handler
  const handleConnectHostfullyOAuth = (useSandbox?: boolean) => {
    if (!user?.id) {
      toast({
        title: "Not Logged In",
        description: "You must be logged in to connect Hostfully",
        variant: "destructive",
      });
      return;
    }

    setConnectingHostfullyOAuth(true);

    // Auto-detect sandbox properties based on name patterns
    const isSandboxProperty =
      formData.name?.includes("[SANDBOX]") ||
      formData.name?.toLowerCase().includes("sandbox") ||
      formData.name?.toLowerCase().includes("sample");

    // Use sandbox OAuth for sandbox properties unless explicitly overridden
    const shouldUseSandbox = useSandbox ?? isSandboxProperty;
    const environment = shouldUseSandbox ? "sandbox" : "production";

    // Build state parameter with owner, property, environment, and origin URL for redirect
    const stateData = {
      owner_id: user.id,
      property_id: propertyId,
      credential_id: ownerHostfullyCredential?.id,
      environment,
      origin_url: window.location.origin, // Track origin for redirect back to correct domain
    };
    const state = btoa(JSON.stringify(stateData));

    // Hostfully OAuth authorize URL - use sandbox or production based on environment
    // Client ID comes from feature flags (edge function secret) - not VITE_ env var
    const clientId = featureFlags?.hostfully_client_id || "";
    const redirectUri = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/hostfully-oauth-callback`;

    const baseUrl = useSandbox
      ? "https://sandbox-api.hostfully.com/api/v3.2/auth/oauth/authorize"
      : "https://api.hostfully.com/api/auth/oauth/authorize";

    const authUrl = new URL(baseUrl);
    authUrl.searchParams.set("clientId", clientId);
    authUrl.searchParams.set("scope", "FULL");
    authUrl.searchParams.set("grantType", "REFRESH_TOKEN");
    authUrl.searchParams.set("redirectUri", redirectUri);
    authUrl.searchParams.set("state", state);

    // Redirect to Hostfully OAuth
    window.location.href = authUrl.toString();
  };

  // Check for OAuth callback result on mount
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const hostfullyConnected = urlParams.get("hostfully_connected");
    const hostfullyError = urlParams.get("hostfully_error");

    if (hostfullyConnected === "true") {
      toast({
        title: "Hostfully Connected",
        description: "Your Hostfully account has been successfully connected.",
      });
      // Clean up URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    } else if (hostfullyError) {
      toast({
        title: "Connection Failed",
        description: decodeURIComponent(hostfullyError),
        variant: "destructive",
      });
      // Clean up URL
      const cleanUrl = window.location.pathname;
      window.history.replaceState({}, "", cleanUrl);
    }
  }, [toast]);

  // Load owner's Hostfully credential
  // For owners: load their own credential
  // For admin/dev: load the property owner's credential via ownerPmsCredentialId
  const isOwnerUser = user && !isAdmin && !isDev && !isFearlessLeader;

  useEffect(() => {
    const loadOwnerHostfullyCredential = async () => {
      setLoadingOwnerCredential(true);
      try {
        if (isOwnerUser && user?.id) {
          // Owner viewing their own property - load via their user ID
          const { data, error } = await supabase
            .from("owner_pms_credentials")
            .select("*")
            .eq("owner_id", user.id)
            .eq("system_type", "hostfully")
            .maybeSingle();

          if (!error && data) {
            setOwnerHostfullyCredential(data);
          }
        } else if ((isAdmin || isDev || isFearlessLeader) && ownerPmsCredentialId) {
          // Admin/dev editing - load via property's credential link
          const { data, error } = await supabase
            .from("owner_pms_credentials")
            .select("*")
            .eq("id", ownerPmsCredentialId)
            .maybeSingle();

          if (!error && data) {
            setOwnerHostfullyCredential(data);
          }
        }
      } catch (err) {
        console.error("Failed to load owner Hostfully credential:", err);
      } finally {
        setLoadingOwnerCredential(false);
      }
    };

    loadOwnerHostfullyCredential();
  }, [isOwnerUser, user?.id, isAdmin, isDev]);

  const handleOwnerCredentialChange = async () => {
    // Reload the credential after changes
    if (!user?.id) return;
    const { data } = await supabase
      .from("owner_pms_credentials")
      .select("*")
      .eq("owner_id", user.id)
      .eq("system_type", "hostfully")
      .maybeSingle();
    setOwnerHostfullyCredential(data);
  };

  // Load Hostfully room count when property has owner credential
  useEffect(() => {
    const loadHostfullyRoomCount = async () => {
      if (!propertyId) return;
      const { count } = await supabase
        .from("hostfully_room_types")
        .select("*", { count: "exact", head: true })
        .eq("property_id", propertyId);
      setHostfullyRoomCount(count || 0);
    };
    loadHostfullyRoomCount();
  }, [propertyId]);

  // Location state
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [googleMapsLink, setGoogleMapsLink] = useState<string>("");

  // Parse coordinates from Google Maps link
  const parseGoogleMapsLink = (url: string): { lat: number; lng: number } | null => {
    try {
      // Pattern 1: https://www.google.com/maps?q=lat,lng or https://maps.google.com/?q=lat,lng
      const qMatch = url.match(/[?&]q=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (qMatch) {
        return { lat: parseFloat(qMatch[1]), lng: parseFloat(qMatch[2]) };
      }

      // Pattern 2: https://www.google.com/maps/@lat,lng,zoom
      const atMatch = url.match(/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (atMatch) {
        return { lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) };
      }

      // Pattern 3: https://www.google.com/maps/place/.../@lat,lng
      const placeMatch = url.match(/place\/[^/]+\/@(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (placeMatch) {
        return { lat: parseFloat(placeMatch[1]), lng: parseFloat(placeMatch[2]) };
      }

      // Pattern 4: https://goo.gl/maps/... or short links - these contain ll=lat,lng
      const llMatch = url.match(/ll=(-?\d+\.?\d*),(-?\d+\.?\d*)/);
      if (llMatch) {
        return { lat: parseFloat(llMatch[1]), lng: parseFloat(llMatch[2]) };
      }

      // Pattern 5: Data parameter !3d(lat)!4d(lng)
      const dataMatch = url.match(/!3d(-?\d+\.?\d*)!4d(-?\d+\.?\d*)/);
      if (dataMatch) {
        return { lat: parseFloat(dataMatch[1]), lng: parseFloat(dataMatch[2]) };
      }

      return null;
    } catch {
      return null;
    }
  };

  const handleGoogleMapsLinkChange = async (url: string) => {
    setGoogleMapsLink(url);
    setIsDirty(true);

    if (url.trim()) {
      const coords = parseGoogleMapsLink(url);
      if (coords) {
        setLatitude(coords.lat);
        setLongitude(coords.lng);
        toast({
          title: "Location extracted",
          description: `Coordinates: ${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`,
        });

        // Reverse geocode to populate address fields
        const mapsApiKey = featureFlags?.google_maps_api_key;
        if (mapsApiKey) {
          try {
            const res = await fetch(
              `https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.lat},${coords.lng}&key=${mapsApiKey}`,
            );
            const geo = await res.json();
            if (geo.status === "OK" && geo.results?.[0]) {
              const components = geo.results[0].address_components || [];
              const get = (type: string) => components.find((c: any) => c.types.includes(type))?.long_name || "";

              const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
              const city = get("locality") || get("administrative_area_level_2") || get("postal_town");
              const suburb = get("sublocality") || get("sublocality_level_1") || get("neighborhood");
              const province = get("administrative_area_level_1");
              const country = get("country");
              const postalCode = get("postal_code");

              setFormData((prev) => ({
                ...prev,
                ...(street && !prev.address ? { address: street } : {}),
                ...(city && !prev.city ? { city } : {}),
                ...(suburb && !prev.suburb ? { suburb } : {}),
                ...(country && !prev.country ? { country } : {}),
                ...(postalCode && !prev.postal_code ? { postal_code: postalCode } : {}),
              }));

              toast({
                title: "Address populated",
                description: geo.results[0].formatted_address,
              });
            }
          } catch (e) {
            console.warn("Reverse geocode failed:", e);
          }
        }
      }
    }
  };

  // Toggle for using Google Maps pin instead of street address
  const [noStreetAddress, setNoStreetAddress] = useState(false);

  // Form data
  const [formData, setFormData] = useState<PropertyFormData>({
    name: "",
    property_type: "",
    contact_email: "",
    telephone: "",
    property_url: "",
    wetu_id: "",
    currency: "ZAR",
    owner_name: "",
    owner_email: "",
    country: "South Africa",
    city: "",
    address: "",
    suburb: "",
    postal_code: "",
    bb_id: "",
    venue_id: "",
    channel_id: "",
    account_id: "",
    agent_id: "",
    has_vat: false,
    vat_number: "",
    property_registration: "",
    bank_name: "",
    branch_code: "",
    account_holder: "",
    account_number: "",
    account_type: "",
    swift_code: "",
    accepts_bitcoin: false,
    bitcoin_wallet_address: "",
    description: "",
    star_rating: 0,
    facilities: [],
    items_non_refundable: false,
    smoking_allowed: false,
    pets_allowed: false,
    children_allowed: true,
    parties_allowed: false,
    check_in_24h: false,
    deposit_allowed: false,
    deposit_percentage: "50",
    deposit_days: "2",
    same_day_bookings: false,
    same_day_cutoff: "16:00",
    check_in_from: "15:00",
    check_in_to: "20:00",
    check_out_from: "06:00",
    check_out_to: "11:00",
    children_policy: "Children are welcome\nChildren up until the age of 12 - Stay free",
    infant_age_from: "1",
    infant_age_to: "2",
    children_age_from: "3",
    children_age_to: "12",
    // Property Surroundings fields
    restaurants_cafes: "",
    restaurants_cafes_distance: "",
    public_transport: "",
    public_transport_distance: "",
    closest_airport: "",
    closest_airport_distance: "",
    // Additional House Rules fields
    min_check_in_age: "18",
    pets_policy: "",
    special_requests_message: "",
    advance_notice_required: true,
    cot_available: false,
    cot_age_from: "0",
    cot_age_to: "2",
    cot_price: "Free",
    extra_beds_available: false,
    extra_bed_price: "",
    child_adult_age: "12",
    fine_print: "",
  });

  const [starRating, setStarRating] = useState(0);
  const [isRolProperty, setIsRolProperty] = useState(false);
  const [isTestProperty, setIsTestProperty] = useState(false);
  // Metric gate: only trading (and non-sandbox) properties feed counts/dashboards.
  const [isTrading, setIsTrading] = useState(false);
  const [isSandbox, setIsSandbox] = useState(false);
  const [adminSubTab, setAdminSubTab] = useState<string>(() => searchParams.get("sub") || "overview");
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  // TOBI description assistance (Info & Facilities tab)
  const [writingPropertyDescription, setWritingPropertyDescription] = useState(false);
  const propertyDescriptionLength = (formData.description ?? "").trim().length;
  const propertyDescriptionTooShort = propertyDescriptionLength < MIN_DESCRIPTION_CHARS;
  const writePropertyDescriptionWithTobi = useCallback(async () => {
    setWritingPropertyDescription(true);
    try {
      const { data, error } = await supabase.functions.invoke("editorial-ai-assist", {
        body: {
          action: "generate_property_description",
          minChars: MIN_DESCRIPTION_CHARS,
          propertyContext: {
            name: formData.name,
            property_type: formData.property_type,
            star_rating: starRating,
            description: formData.description,
            country: formData.country,
            city: formData.city,
            suburb: formData.suburb,
            facilities: selectedFacilities,
          },
        },
      });
      if (error) throw error;
      const text: string = (data?.description ?? "").trim();
      if (!text) throw new Error("TOBI returned no text");
      handleInputChange("description", text);
      setIsDirty(true);
      toast({
        title: "TOBI drafted your description",
        description:
          text.length >= MIN_DESCRIPTION_CHARS
            ? `${text.length} characters — review and save.`
            : `${text.length} characters — still under the ${MIN_DESCRIPTION_CHARS} minimum, please expand.`,
      });
    } catch (err) {
      toast({
        title: "TOBI could not write the description",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setWritingPropertyDescription(false);
    }
  }, [formData, starRating, selectedFacilities, toast]);
  const [aiAmenityOpen, setAiAmenityOpen] = useState(false);
  const [selectedBreakfastOptions, setSelectedBreakfastOptions] = useState<string[]>([]);
  // Property composition — mandatory for Rentals United / channel pushes
  const [propBedrooms, setPropBedrooms] = useState<number>(0);
  const [propBathrooms, setPropBathrooms] = useState<number | null>(null);
  const [propToilets, setPropToilets] = useState<number | null>(1);
  const [separateKitchen, setSeparateKitchen] = useState(false);
  /** Accepted payment methods (RU PaymentMethods) — mandatory channel content. */
  const [paymentMethods, setPaymentMethods] = useState<string[]>([]);
  /** Property-level Floor / Space fallbacks for channel pushes. */
  const [propertyFloor, setPropertyFloor] = useState<number | null>(null);
  const [propertySizeSqm, setPropertySizeSqm] = useState<number | null>(null);
  /** Channel changeover: master rule (0-3) + optional per-day overrides. */
  const [changeoverMaster, setChangeoverMaster] = useState<number | null>(null);
  const [changeoverRules, setChangeoverRules] = useState<Partial<Record<ChangeoverDowKey, number>>>({});
  const [cancellationPolicies, setCancellationPolicies] = useState([
    { forfeit: "10", type: "% of Total", days: "999" },
    { forfeit: "100", type: "% of Total", days: "30" },
  ]);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const propertyImageAudit = useImageDimensionAudit(uploadedImages);
  /** Rentals United photo tags, keyed by image URL: { "<url>": [4, 83] } */
  const [imageTags, setImageTags] = useState<RuImageTagMap>({});
  // Explicit main photo: the single gallery URL tagged Main (channel ImageTypeID 1).
  const mainImageUrl = useMemo(
    () => findMainImageUrl(imageTags, uploadedImages),
    [imageTags, uploadedImages],
  );

  const [isDragging, setIsDragging] = useState(false);

  // Branding state
  const [brandingData, setBrandingData] = useState<BrandingData>({
    brand_logo_url: "",
    brand_primary_color: "",
    brand_secondary_color: "",
    brand_font_color: "",
    brand_override_enabled: false,
    brand_heading_font: "",
    brand_body_font: "",
    brand_heading_text_color: "",
    brand_body_text_color: "",
    brand_muted_text_color: "",
    brand_light_bg_color: "",
    brand_dark_bg_color: "",
  });

  // ROL Spec state
  const [rolSpecData, setRolSpecData] = useState({
    hero_listing: false,
    hero_video_url: "",
    editorial_rating: "",
    why_we_chose_this_place: "",
    who_this_suits: "",
    what_its_really_like: "",
    why_this_place_matters: "",
    who_its_not_for: "",
    owner_notes: "",
    navigation_tags: [] as string[],
  });

  // Room types state with full data structure - starts empty for new properties
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const persistedRoomTypesRef = useRef<unknown[]>([]);
  const [selectedRoomType, setSelectedRoomType] = useState<string>("");
  const [isRoomImageUploading, setIsRoomImageUploading] = useState(false);

  const addRoomType = () => {
    const newRoom = {
      id: Date.now().toString(),
      name: `New ${accommodationLabel ? ACCOMMODATION_LABEL_OPTIONS.find((o) => o.value === accommodationLabel)?.label || "Room" : "Room"} Type`,
      url: "",
      selected: false,
      numRooms: 1,
      pmsRoomType: "",
      pmsRoomId: "",
      description: "",
      extraPersonPolicy: "",
      bedConfiguration: [] as BedEntry[],
      roomSize: 0,
      floor: 0,
      bathrooms: 1,
      maxPeople: 2,
      maxAdults: 2,
      maxChildren: 0,
      minStay: 1,
      maxStay: 0,
      rateType: "per-unit",
      splitPercent: 0,
      images: [] as string[],
      facilities: [] as string[],
      amenities: [] as string[],
      linkedRateTypes: [] as number[],
      mealTypes: [] as string[],
    };
    setRoomTypes([...roomTypes, newRoom]);
    setSelectedRoomType(newRoom.id);
    setIsDirty(true);
  };

  // Toggle rate type link for a room
  const toggleRoomRateTypeLink = (roomId: string, rateTypeId: number | string) => {
    setRoomTypes(
      roomTypes.map((room) => {
        if (room.id === roomId) {
          const linked = room.linkedRateTypes || [];
          const isLinked = linked.includes(rateTypeId);
          return {
            ...room,
            linkedRateTypes: isLinked
              ? linked.filter((id: number | string) => id !== rateTypeId)
              : [...linked, rateTypeId],
          };
        }
        return room;
      }),
    );
    setIsDirty(true);
  };

  // Get linked rate types for a room
  const getRoomLinkedRateTypes = (roomId: string): (number | string)[] => {
    const room = roomTypes.find((r) => r.id === roomId);
    return room?.linkedRateTypes || [];
  };

  const deleteRoomType = (id: string) => {
    const filtered = roomTypes.filter((r) => r.id !== id);
    setRoomTypes(filtered);
    if (selectedRoomType === id && filtered.length > 0) {
      setSelectedRoomType(filtered[0].id);
    }
    setIsDirty(true);
  };

  const updateRoomTypeName = (id: string, name: string) => {
    setRoomTypes(roomTypes.map((r) => (r.id === id ? { ...r, name } : r)));
    setIsDirty(true);
  };

  const updateRoomTypeUrl = (id: string, url: string) => {
    setRoomTypes(roomTypes.map((r) => (r.id === id ? { ...r, url } : r)));
    setIsDirty(true);
  };

  const updateRoomTypeField = (id: string, field: string, value: any) => {
    setRoomTypes(roomTypes.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
    setIsDirty(true);
  };

  const toggleRoomActive = async (roomId: string) => {
    const room = roomTypes.find((r) => r.id === roomId);
    if (!room) return;

    const newActive = !room.is_active;
    const timestamp = new Date().toISOString();
    const roomName = String(room.name || "").trim();
    const normalizedRoomName = roomName.toLowerCase();

    // Resolve one canonical row before mutating anything. Updating by name used
    // to deactivate every same-name mirror, including the row holding the live
    // channel listing when an old duplicate was toggled.
    const { data: canonicalRows, error: canonicalReadError } = propertyId
      ? await supabase
          .from("hostfully_room_types")
          .select("id, name, linked_rolos_id, rentalsunited_property_id, created_at, is_active")
          .eq("property_id", propertyId)
      : { data: [], error: null };
    if (canonicalReadError) {
      toast({ title: "Error", description: "Could not verify this unit's identity", variant: "destructive" });
      return;
    }
    const target = resolvePersistedRoomIdentity(
      (canonicalRows || []).map((row) => ({
        id: row.id,
        name: row.name,
        isActive: row.is_active,
        listingId: row.rentalsunited_property_id,
        createdAt: row.created_at,
      })),
      { id: roomId, name: roomName },
      new Set(),
    );

    if (!newActive && target?.listingId) {
      toast({
        title: "Unit kept active",
        description: `${roomName} has live channel listing ${target.listingId}. Release or archive that listing from Channels before deactivating the unit.`,
      });
      return;
    }

    setRoomTypes((prev) => prev.map((r) => (r.id === roomId ? { ...r, is_active: newActive } : r)));

    const syncErrors: Array<{ source: string; error: unknown }> = [];
    let canonicalUpdates = 0;
    let amenitiesSynced = false;

    const updateCanonicalById = async (table: "hostfully_room_types" | "rolos_room_types", id: string) => {
      const { data, error } = await supabase
        .from(table as any)
        .update({ is_active: newActive, updated_at: timestamp } as any)
        .eq("id", id)
        .select("id");

      if (error) {
        syncErrors.push({ source: table, error });
        return 0;
      }

      return data?.length || 0;
    };

    if (target) {
      canonicalUpdates += await updateCanonicalById("hostfully_room_types", target.id);
      const linkedRolosId = (canonicalRows || []).find((row) => row.id === target.id)?.linked_rolos_id;
      if (linkedRolosId) {
        canonicalUpdates += await updateCanonicalById("rolos_room_types", linkedRolosId);
      }
    }

    if (propertyId) {
      const { data: propData, error: propError } = await supabase
        .from("properties")
        .select("amenities")
        .eq("id", propertyId)
        .single();

      if (propError) {
        syncErrors.push({ source: "properties", error: propError });
      } else {
        const amenities = (propData?.amenities as any) || {};
        const currentRoomTypes = Array.isArray(amenities.room_types) ? amenities.room_types : [];
        const sameNameRows = currentRoomTypes.filter(
          (rt: any) => normalizeRoomIdentityName(rt?.name) === normalizedRoomName,
        );
        const updatedRoomTypes = currentRoomTypes.map((rt: any) => {
          const sameId = String(rt?.id) === String(roomId) || String(rt?.id) === String(target?.id);
          const unambiguousLegacyName = !rt?.id && sameNameRows.length === 1 &&
            normalizeRoomIdentityName(rt?.name) === normalizedRoomName;
          return sameId || unambiguousLegacyName ? { ...rt, is_active: newActive } : rt;
        });

        const { error: amenityError } = await supabase
          .from("properties")
          .update({ amenities: { ...amenities, room_types: updatedRoomTypes } })
          .eq("id", propertyId);

        if (amenityError) {
          syncErrors.push({ source: "properties", error: amenityError });
        } else {
          amenitiesSynced = true;
        }
      }
    }

    if (!amenitiesSynced && canonicalUpdates === 0) {
      console.error("[toggleRoomActive] Sync failed:", syncErrors);
      setRoomTypes((prev) => prev.map((r) => (r.id === roomId ? { ...r, is_active: !newActive } : r)));
      toast({ title: "Error", description: "Failed to update room status", variant: "destructive" });
      return;
    }

    if (canonicalUpdates === 0) {
      console.warn("[toggleRoomActive] No canonical room rows matched; editor metadata was updated only", {
        propertyId,
        roomId,
        roomName,
      });
    }

    toast({
      title: newActive ? "Room Activated" : "Room Deactivated",
      description: `${room.name} is now ${newActive ? "visible" : "hidden"} on booking pages`,
    });
  };

  // Helper to ensure a value is an array (handles JSON object vs array edge cases)
  const ensureArray = (value: any): string[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== "object") return [];
    return [];
  };

  // Helper to check if a room field is synced from PMS
  // ROL'OS native properties never have PMS-locked fields (data is internal)
  const isRoomFieldPmsSynced = (roomId: string, fieldName: string): boolean => {
    if (isRolProperty) return false;
    const room = roomTypes.find((r) => r.id === roomId);
    const syncedFields = ensureArray(room?.pms_synced_fields);
    return syncedFields.includes(fieldName);
  };

  // Helper to get PMS field styling for room fields
  const getRoomPmsFieldClass = (roomId: string, fieldName: string): string => {
    if (isRoomFieldPmsSynced(roomId, fieldName)) {
      return "bg-primary/5 border-primary/20";
    }
    return "";
  };

  const SUPPORTED_ROOM_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/svg+xml",
    "image/avif",
  ];

  const handleRoomImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    if (!propertyId) {
      toast({
        title: "Upload failed",
        description: "Property must be saved before uploading room images",
        variant: "destructive",
      });
      return;
    }

    const supportedFiles: File[] = [];
    const unsupportedNames: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (
        SUPPORTED_ROOM_IMAGE_TYPES.includes(file.type) ||
        (file.type.startsWith("image/") && file.type !== "image/heic" && file.type !== "image/heif")
      ) {
        supportedFiles.push(file);
      } else {
        unsupportedNames.push(file.name);
      }
    }

    if (unsupportedNames.length > 0) {
      toast({
        title: `${unsupportedNames.length} file(s) skipped`,
        description: `Unsupported format: ${unsupportedNames.join(", ")}. Use JPG, PNG, WebP, or GIF.`,
        variant: "destructive",
      });
    }

    if (supportedFiles.length === 0) return;

    // Validate dimensions before uploading
    const validFiles: File[] = [];
    for (const file of supportedFiles) {
      const dims = await validateImageDimensions(file);
      if (!dims.valid) {
        toast({
          title: "Image too small",
          description: getValidationErrorMessage(file.name, dims.width, dims.height),
          variant: "destructive",
        });
      } else {
        validFiles.push(file);
      }
    }
    if (validFiles.length === 0) return;

    setIsRoomImageUploading(true);
    const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
    const existingImages = [...(currentRoom?.images || [])];

    for (let i = 0; i < validFiles.length; i++) {
      const file = validFiles[i];
      try {
        const fileExt = file.name.split(".").pop();
        const fileName = `room-${selectedRoomType}-${Date.now()}-${i}.${fileExt}`;
        const filePath = `${propertyId}/${fileName}`;

        const { error: uploadError } = await supabase.storage.from("property-images").upload(filePath, file);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("property-images").getPublicUrl(filePath);

        existingImages.push(publicUrl);
      } catch (error: any) {
        console.error("Room image upload error:", error);
        toast({
          title: "Upload failed",
          description: error?.message || `Failed to upload ${file.name}`,
          variant: "destructive",
        });
      }
    }

    setRoomTypes(roomTypes.map((r) => (r.id === selectedRoomType ? { ...r, images: existingImages } : r)));
    setIsDirty(true);
    setIsRoomImageUploading(false);

    if (supportedFiles.length > 0 && unsupportedNames.length > 0) {
      toast({
        title: "Upload complete",
        description: `${supportedFiles.length} image(s) uploaded successfully.`,
      });
    }
  };

  const removeRoomImage = (imageUrl: string) => {
    const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
    const updatedImages = (currentRoom?.images || []).filter((img: string) => img !== imageUrl);
    setRoomTypes(roomTypes.map((r) => (r.id === selectedRoomType ? { ...r, images: updatedImages } : r)));
    setIsDirty(true);
  };

  const copyRoomUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    toast({
      title: "URL Copied",
      description: "Room URL has been copied to clipboard",
    });
  };

  // Seasons state
  const [seasons, setSeasons] = useState<any[]>([]);
  const [isSeasonDialogOpen, setIsSeasonDialogOpen] = useState(false);
  const [editingSeason, setEditingSeason] = useState<any>(null);
  const [expandedSeasons, setExpandedSeasons] = useState<Record<string, boolean>>({});
  const [expandedMealTypes, setExpandedMealTypes] = useState<Record<string, boolean>>({});
  const [syncRateTypesOpen, setSyncRateTypesOpen] = useState(false);
  const [syncSeasonsOpen, setSyncSeasonsOpen] = useState(false);
  const [rateBreakdownGroupBy, setRateBreakdownGroupBy] = useState<"season" | "mealType">("season");

  // Toggle season expand/collapse
  const toggleSeasonExpanded = (seasonId: string) => {
    setExpandedSeasons((prev) => ({ ...prev, [seasonId]: !prev[seasonId] }));
  };

  // Toggle meal type expand/collapse
  const toggleMealTypeExpanded = (mealType: string) => {
    setExpandedMealTypes((prev) => ({ ...prev, [mealType]: !prev[mealType] }));
  };

  // Calculate min/max rates for a season across all rate types (room-specific)
  const getSeasonRateSummary = (seasonId: string, roomId: string) => {
    const rateFieldKeys = ["roomAmount", "adultAmount", "teenAmount", "childAmount", "infantAmount"] as const;
    let minRate = Infinity;
    let maxRate = -Infinity;

    // Use room-specific linked rate types, falling back to all rate types
    const room = roomTypes.find((r) => r.id === roomId);
    const linked = room?.linkedRateTypes || [];
    const rateTypeIds =
      linked.length > 0
        ? linked.map((id: string | number) => String(id))
        : (pmsRateTypes || []).map((rt: any) => String(rt.id));

    // Also check legacy meal-type keys and bare season keys for backward compat
    const roomMealTypes = room?.mealTypes || [];
    const keysToCheck = [
      ...rateTypeIds.map((rtId: string) => `${seasonId}-${rtId}`),
      ...roomMealTypes.map((mt: string) => `${seasonId}-${mt}`),
      seasonId,
    ];

    keysToCheck.forEach((key: string) => {
      rateFieldKeys.forEach((field) => {
        const rate = seasonRates[roomId]?.[key]?.[field] || 0;
        if (rate > 0) {
          minRate = Math.min(minRate, rate);
          maxRate = Math.max(maxRate, rate);
        }
      });
    });

    return {
      min: minRate === Infinity ? 0 : minRate,
      max: maxRate === -Infinity ? 0 : maxRate,
    };
  };

  // Calculate min/max rates for a meal type across all seasons
  const getMealTypeRateSummary = (mealType: string, roomId: string) => {
    const rateFields = ["roomAmount", "adultAmount", "teenAmount", "childAmount", "infantAmount"] as const;
    let minRate = Infinity;
    let maxRate = -Infinity;

    seasons.forEach((season) => {
      const key = `${season.id}-${mealType}`;
      rateFields.forEach((field) => {
        const rate = seasonRates[roomId]?.[key]?.[field] || 0;
        if (rate > 0) {
          minRate = Math.min(minRate, rate);
          maxRate = Math.max(maxRate, rate);
        }
      });
    });

    return {
      min: minRate === Infinity ? 0 : minRate,
      max: maxRate === -Infinity ? 0 : maxRate,
    };
  };
  const [seasonForm, setSeasonForm] = useState({
    name: "",
    from: "",
    to: "",
    minStay: 1,
    maxStay: 0,
  });

  // Season rates state: { [roomId]: { [seasonId]: { roomAmount, adultAmount, teenAmount, childAmount, infantAmount } } }
  const [seasonRates, setSeasonRates] = useState<
    Record<
      string,
      Record<
        string,
        {
          roomAmount: number;
          adultAmount: number;
          teenAmount: number;
          childAmount: number;
          infantAmount: number;
        }
      >
    >
  >({});

  // PMS Rate Types state (imported from Benson/other PMS or generated from wizard) - full Benson API spec
  const [pmsRateTypes, setPmsRateTypes] = useState<
    {
      id: number | string;
      name: string;
      description?: string | null;
      priceType?: string | null;
      minAdvanceDays?: number | null;
      maxAdvanceDays?: number | null;
      minStayDays?: number | null;
      maxStayDays?: number | null;
      // Legacy field names (for backward compatibility)
      minNights?: number | null;
      maxNights?: number | null;
      stayPayStayNights?: number | null;
      stayPayDiscountNights?: number | null;
      stayPayDiscountPercentage?: number | null;
      // Base rate from wizard
      baseRate?: number | null;
      pricingModel?: string | null;
      adult1Rate?: number | null;
      adult2Rate?: number | null;
      teenRate?: number | null;
      childRate?: number | null;
      infantRate?: number | null;
      pms_synced?: boolean;
    }[]
  >([]);
  const persistedRateTypesRef = useRef<typeof pmsRateTypes>([]);

  // PMS sync hook — all PMS state, sync functions, and adapter logic
  const pmsSync = usePMSSync({
    propertyId,
    formData,
    roomTypes,
    setRoomTypes,
    selectedRoomType,
    setSelectedRoomType,
    pmsRateTypes,
    setPmsRateTypes,
    setIsDirty,
    setLatitude,
    setLongitude,
    setFormData,
    roomsonlineActive,
  });

  const {
    selectedPMS,
    setSelectedPMS,
    availablePMSSystems,
    bensonPropertyCode,
    setBensonPropertyCode,
    bensonEnvironment,
    setBensonEnvironment,
    cloudbedsPropertyId,
    setCloudbedsPropertyId,
    littlehotelierChannelCode,
    setLittlehotelierChannelCode,
    littlehotelierRegion,
    setLittlehotelierRegion,
    hotelbedsHotelCode,
    setHotelbedsHotelCode,
    hyperguestHotelId,
    setHyperguestHotelId,
    existingHyperguestHotelId,
    setExistingHyperguestHotelId,
    beds24PropertyId,
    setBeds24PropertyId,
    existingBeds24PropertyId,
    setExistingBeds24PropertyId,
    hostfullyPropertyUid,
    setHostfullyPropertyUid,
    isSyncingPms,
    lastPmsSync,
    isSyncEditorialDialogOpen,
    setIsSyncEditorialDialogOpen,
    existingExternalIds,
    setExistingExternalIds,
    tripadvisorId,
    setTripadvisorId,
    googlePlaceId,
    setGooglePlaceId,
    existingBensonPropertyCode,
    setExistingBensonPropertyCode,
    existingCloudbedsPropertyId,
    setExistingCloudbedsPropertyId,
    existingLittlehotelierChannelCode,
    setExistingLittlehotelierChannelCode,
    existingLittlehotelierRegion,
    setExistingLittlehotelierRegion,
    existingHotelbedsHotelCode,
    setExistingHotelbedsHotelCode,
    existingHostfullyPropertyUid,
    setExistingHostfullyPropertyUid,
    ownerPmsCredentialId,
    setOwnerPmsCredentialId,
    hostfullyRoomCount,
    setHostfullyRoomCount,
    importingHostfullyRooms,
    showHostfullyWarning,
    setShowHostfullyWarning,
    previousPMS,
    setPreviousPMS,
    syncingRoomId,
    fullSyncingHostfully,
    syncProgress,
    handleImportHostfullyRooms,
    syncRoomFromHostfully,
    handleFullHostfullySync,
    syncFromBenson,
  } = pmsSync;

  const openAddSeasonDialog = () => {
    setEditingSeason(null);
    setSeasonForm({ name: "", from: "", to: "", minStay: 1, maxStay: 0 });
    setIsSeasonDialogOpen(true);
  };

  const openEditSeasonDialog = (season: any) => {
    setEditingSeason(season);
    setSeasonForm({
      name: season.name || season.title || "",
      from: season.from,
      to: season.to,
      minStay: season.minStay || 1,
      maxStay: season.maxStay || 0,
    });
    setIsSeasonDialogOpen(true);
  };

  const generateSeasonTitle = (from: string, to: string) => {
    if (!from || !to) return "";
    const fromDate = new Date(from);
    const toDate = new Date(to);
    return `${format(fromDate, "dd/MM/yyyy")}-${format(toDate, "dd/MM/yyyy")}`;
  };

  const saveSeason = () => {
    if (!seasonForm.from || !seasonForm.to) {
      toast({ title: "Error", description: "Please select start and end dates", variant: "destructive" });
      return;
    }

    const title = seasonForm.name || generateSeasonTitle(seasonForm.from, seasonForm.to);

    if (editingSeason) {
      // Update existing season — sync periods[0] with from/to
      setSeasons(
        seasons.map((s) => {
          if (s.id !== editingSeason.id) return s;
          const updatedSeason: any = {
            ...s,
            name: seasonForm.name,
            title,
            from: seasonForm.from,
            to: seasonForm.to,
            minStay: seasonForm.minStay,
            maxStay: seasonForm.maxStay,
          };
          // Keep periods in sync: update first period, preserve additional periods
          const existingPeriods = s.periods && s.periods.length > 0 ? [...s.periods] : [];
          if (existingPeriods.length > 0) {
            existingPeriods[0] = { from: seasonForm.from, to: seasonForm.to };
            updatedSeason.periods = existingPeriods;
          } else {
            updatedSeason.periods = [{ from: seasonForm.from, to: seasonForm.to }];
          }
          return updatedSeason;
        }),
      );
      toast({ title: "Season updated", description: "Season has been updated successfully." });
    } else {
      // Add new season — always include periods array
      const newSeason = {
        id: Date.now().toString(),
        name: seasonForm.name,
        title,
        from: seasonForm.from,
        to: seasonForm.to,
        periods: [{ from: seasonForm.from, to: seasonForm.to }],
        minStay: seasonForm.minStay,
        maxStay: seasonForm.maxStay,
      };
      setSeasons([...seasons, newSeason]);
      toast({ title: "Season created", description: "New season has been added." });
    }

    setIsSeasonDialogOpen(false);
    setIsDirty(true);
  };

  // Create default Southern Hemisphere seasons
  const createDefaultSeasons = () => {
    const currentYear = new Date().getFullYear();
    const defaultSeasons = [
      {
        id: `summer-${Date.now()}`,
        name: "Summer (Peak)",
        title: "Summer (Peak)",
        from: `${currentYear}-12-01`,
        to: `${currentYear + 1}-02-28`,
        periods: [{ from: `${currentYear}-12-01`, to: `${currentYear + 1}-02-28` }],
        minStay: 2,
        maxStay: 0,
      },
      {
        id: `autumn-${Date.now() + 1}`,
        name: "Autumn (Shoulder)",
        title: "Autumn (Shoulder)",
        from: `${currentYear}-03-01`,
        to: `${currentYear}-05-31`,
        periods: [{ from: `${currentYear}-03-01`, to: `${currentYear}-05-31` }],
        minStay: 1,
        maxStay: 0,
      },
      {
        id: `winter-${Date.now() + 2}`,
        name: "Winter (Low)",
        title: "Winter (Low)",
        from: `${currentYear}-06-01`,
        to: `${currentYear}-08-31`,
        periods: [{ from: `${currentYear}-06-01`, to: `${currentYear}-08-31` }],
        minStay: 1,
        maxStay: 0,
      },
      {
        id: `spring-${Date.now() + 3}`,
        name: "Spring (Shoulder)",
        title: "Spring (Shoulder)",
        from: `${currentYear}-09-01`,
        to: `${currentYear}-11-30`,
        periods: [{ from: `${currentYear}-09-01`, to: `${currentYear}-11-30` }],
        minStay: 1,
        maxStay: 0,
      },
    ];
    setSeasons(defaultSeasons);
    setIsDirty(true);
    toast({ title: "Default seasons created", description: "4 Southern Hemisphere seasons have been added." });
  };

  const deleteSeason = (seasonId: string) => {
    setSeasons(seasons.filter((s) => s.id !== seasonId));
    // Also clean up rates for this season
    const updatedRates = { ...seasonRates };
    Object.keys(updatedRates).forEach((roomId) => {
      if (updatedRates[roomId][seasonId]) {
        delete updatedRates[roomId][seasonId];
      }
    });
    setSeasonRates(updatedRates);
    setIsDirty(true);
    toast({ title: "Season deleted", description: "Season has been removed." });
  };

  // Rate update function
  type RateField = "roomAmount" | "adultAmount" | "teenAmount" | "childAmount" | "infantAmount";
  const updateSeasonRate = (roomId: string, seasonId: string, field: RateField, value: number) => {
    setSeasonRates((prev) => ({
      ...prev,
      [roomId]: {
        ...prev[roomId],
        [seasonId]: {
          ...prev[roomId]?.[seasonId],
          [field]: value,
        },
      },
    }));
    setIsDirty(true);
  };

  const getSeasonRate = (roomId: string, seasonId: string, field: RateField) => {
    return seasonRates[roomId]?.[seasonId]?.[field] || 0;
  };

  // Meal types state
  const [selectedMealTypes, setSelectedMealTypes] = useState<string[]>(["Self Catering"]);
  const [mealTypeSuggestions, setMealTypeSuggestions] = useState<string[]>([]);

  // Wrapper to mark dirty when meal types change
  const handleMealTypesChange = (newMealTypes: string[]) => {
    setSelectedMealTypes(newMealTypes);
    setIsDirty(true);
  };

  // Load meal type suggestions
  useEffect(() => {
    const loadMealTypeSuggestions = async () => {
      const { data, error } = await supabase.from("meal_type_suggestions").select("name").order("name");

      if (data && !error) {
        setMealTypeSuggestions(data.map((d) => d.name));
      }
    };
    loadMealTypeSuggestions();
  }, []);

  // Add new meal type to suggestions database
  const handleNewMealType = async (mealType: string) => {
    const { error } = await supabase.from("meal_type_suggestions").insert({ name: mealType });

    if (!error) {
      setMealTypeSuggestions((prev) => [...prev, mealType].sort());
    }
  };

  // Default confirmation mailer template (matches current booking email)
  const defaultConfirmationMailerTemplate = `
<div style="text-align: center; margin-bottom: 20px;">
  <div style="font-size: 32px; color: #22c55e; margin-bottom: 10px;">✓</div>
  <h1 style="margin: 0; font-size: 24px; color: #333; font-weight: 600;">Reservation Confirmed!</h1>
  <p style="margin: 10px 0 0; color: #666; font-size: 14px;">Thank you for your reservation</p>
</div>

<div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; text-align: center; margin-bottom: 20px;">
  <p style="margin: 0 0 5px; color: #666; font-size: 12px; text-transform: uppercase; letter-spacing: 1px;">Reservation Reference</p>
  <p style="margin: 0; color: #333; font-size: 20px; font-weight: 600; font-family: monospace;">{{reservation_reference}}</p>
</div>

<h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #e91e8c; padding-bottom: 10px;">Property Details</h2>
<table style="width: 100%; margin-bottom: 20px;">
  <tr>
    <td style="padding: 8px 0; color: #666;">Property</td>
    <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">{{property_name}}</td>
  </tr>
  <tr>
    <td style="padding: 8px 0; color: #666;">Location</td>
    <td style="padding: 8px 0; color: #333; text-align: right;">{{property_location}}</td>
  </tr>
</table>

<h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #e91e8c; padding-bottom: 10px;">Stay Details</h2>
<table style="width: 100%; margin-bottom: 20px;">
  <tr>
    <td style="padding: 8px 0; color: #666;">Check-in</td>
    <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">{{check_in_date}}</td>
  </tr>
  <tr>
    <td style="padding: 8px 0; color: #666;">Check-out</td>
    <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">{{check_out_date}}</td>
  </tr>
  <tr>
    <td style="padding: 8px 0; color: #666;">Duration</td>
    <td style="padding: 8px 0; color: #333; text-align: right;">{{nights}} night(s)</td>
  </tr>
  <tr>
    <td style="padding: 8px 0; color: #666;">Guests</td>
    <td style="padding: 8px 0; color: #333; text-align: right;">{{total_guests}} guest(s)</td>
  </tr>
</table>

<h2 style="margin: 0 0 15px; font-size: 18px; color: #333; border-bottom: 2px solid #e91e8c; padding-bottom: 10px;">Guest Information</h2>
<table style="width: 100%; margin-bottom: 20px;">
  <tr>
    <td style="padding: 8px 0; color: #666;">Name</td>
    <td style="padding: 8px 0; color: #333; font-weight: 500; text-align: right;">{{guest_name}}</td>
  </tr>
  <tr>
    <td style="padding: 8px 0; color: #666;">Email</td>
    <td style="padding: 8px 0; color: #333; text-align: right;">{{guest_email}}</td>
  </tr>
  <tr>
    <td style="padding: 8px 0; color: #666;">Phone</td>
    <td style="padding: 8px 0; color: #333; text-align: right;">{{guest_phone}}</td>
  </tr>
</table>

<div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 20px;">
  <table style="width: 100%;">
    <tr>
      <td style="color: #333; font-size: 18px; font-weight: 600;">Total Amount</td>
      <td style="color: #e91e8c; font-size: 24px; font-weight: 700; text-align: right;">{{total_price}}</td>
    </tr>
  </table>
</div>

<div style="background-color: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 15px; margin-bottom: 20px;">
  <p style="margin: 0; color: #92400e; font-size: 13px; line-height: 1.5;">
    <strong>Payment Note:</strong> This reservation has not yet been paid. An invoice with deposit and settlement amounts will be issued by the property in due course.
  </p>
</div>

<div style="padding: 30px; background-color: #fafafa; border-radius: 8px; text-align: center;">
  <p style="margin: 0 0 20px; color: #666; font-size: 14px;">Kind regards</p>
  <p style="margin: 0 0 15px; color: #333; font-size: 14px;">
    RoomsOnline on behalf of <strong>{{property_name}}</strong>
  </p>
  <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" style="max-width: 180px; height: auto;" />
</div>
`.trim();

  // Templates and Notifications state
  const [selectedTemplate, setSelectedTemplate] = useState<string>("confirmation-mailer");
  const [templateContent, setTemplateContent] = useState<string>(defaultConfirmationMailerTemplate);
  const [preMailerDays, setPreMailerDays] = useState<number>(0);
  const [preMailerHours, setPreMailerHours] = useState<number>(0);
  const [postMailerDays, setPostMailerDays] = useState<number>(0);
  const [postMailerHours, setPostMailerHours] = useState<number>(0);

  // Addons state
  const [addons, setAddons] = useState<any[]>([]);
  const [isAddAddonOpen, setIsAddAddonOpen] = useState(false);
  const [addonForm, setAddonForm] = useState({
    name: "",
    offeringsAccommodation: false,
    offeringsVenue: false,
    description: "",
    priceType: "Price Per Item",
    price: 0,
    hasCapacity: false,
    capacity: 0,
    allDays: false,
    sunday: false,
    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
    saturday: false,
  });
  const [addonDialogTab, setAddonDialogTab] = useState<string>("addon");
  const [addonImages, setAddonImages] = useState<string[]>([]);
  const [isAddonImageDragging, setIsAddonImageDragging] = useState(false);

  const handleAddonImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileExt = file.name.split(".").pop();
      const fileName = `${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      try {
        const { error: uploadError } = await supabase.storage.from("addon-images").upload(filePath, file);

        if (uploadError) {
          toast({
            title: "Upload Failed",
            description: uploadError.message,
            variant: "destructive",
          });
          continue;
        }

        const {
          data: { publicUrl },
        } = supabase.storage.from("addon-images").getPublicUrl(filePath);

        setAddonImages([...addonImages, publicUrl]);
      } catch (error) {
        console.error("Error uploading image:", error);
      }
    }
  };

  const handleAddonImageDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsAddonImageDragging(false);
    handleAddonImageUpload(e.dataTransfer.files);
  };

  const removeAddonImage = (index: number) => {
    setAddonImages(addonImages.filter((_, i) => i !== index));
  };

  const handleAddAddon = () => {
    const newAddon = {
      id: Date.now().toString(),
      ...addonForm,
      images: addonImages,
      offerings: [addonForm.offeringsAccommodation && "Accommodation", addonForm.offeringsVenue && "Venue"]
        .filter(Boolean)
        .join(", "),
    };
    setAddons([...addons, newAddon]);
    setIsAddAddonOpen(false);
    // Reset form
    setAddonForm({
      name: "",
      offeringsAccommodation: false,
      offeringsVenue: false,
      description: "",
      priceType: "Price Per Item",
      price: 0,
      hasCapacity: false,
      capacity: 0,
      allDays: false,
      sunday: false,
      monday: false,
      tuesday: false,
      wednesday: false,
      thursday: false,
      friday: false,
      saturday: false,
    });
    setAddonImages([]);
    setIsDirty(true);
    toast({
      title: "Addon Added",
      description: "The addon has been added successfully",
    });
  };

  const deleteAddon = (id: string) => {
    setAddons(addons.filter((a) => a.id !== id));
    setIsDirty(true);
    toast({
      title: "Addon Deleted",
      description: "The addon has been removed",
    });
  };

  // Specials state
  const [specialsCategory, setSpecialsCategory] = useState<string>("accommodations");
  const [conferenceSpecials, setConferenceSpecials] = useState<any[]>([{ id: "1", name: "Untitled" }]);
  const [selectedSpecial, setSelectedSpecial] = useState<string>("1");
  const [isEditSpecialOpen, setIsEditSpecialOpen] = useState(false);
  const [specialDialogTab, setSpecialDialogTab] = useState<string>("edit-special");
  const [specialForm, setSpecialForm] = useState({
    name: "",
    isPublic: false,
    description: "",
    season: "08/05/2025-30/09/2025",
    periodFrom: undefined as Date | undefined,
    periodTo: undefined as Date | undefined,
    pricingConfig: "" as "discount" | "fixed-amount" | "fixed-price" | "",
    discountPercent: 0,
    fixedAmount: 0,
    fixedPrice: 0,
    conferenceRateType: "",
    venueHire: "",
  });

  const addNewSpecial = () => {
    const newSpecial = {
      id: Date.now().toString(),
      name: "Untitled",
    };
    setConferenceSpecials([...conferenceSpecials, newSpecial]);
    setSelectedSpecial(newSpecial.id);
  };

  const deleteSpecial = (id: string) => {
    const filtered = conferenceSpecials.filter((s) => s.id !== id);
    setConferenceSpecials(filtered);
    if (selectedSpecial === id && filtered.length > 0) {
      setSelectedSpecial(filtered[0].id);
    }
  };

  // Packages state
  const [packagesCategory, setPackagesCategory] = useState<"accommodations" | "event" | "conference">("accommodations");
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<any>(null);
  const [isEditPackageOpen, setIsEditPackageOpen] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);
  const [isPackageImagesOpen, setIsPackageImagesOpen] = useState(false);
  const [packageDialogTab, setPackageDialogTab] = useState("edit");
  const [packageForm, setPackageForm] = useState({
    name: "",
    description: "",
    minimumStay: 1,
    maximumStay: 1,
    season: "",
    periodFrom: undefined as Date | undefined,
    periodTo: undefined as Date | undefined,
    pricingType: "discount",
    discountPercent: 0,
    fixedAmountOff: 0,
    fixedPrice: 0,
    package_price: 0,
    discount_percentage: 0,
    isPublic: false,
    images: [] as string[],
    applicableRoomIds: [] as string[],
  });
  const [packageImages, setPackageImages] = useState<string[]>([]);
  const [isPackageImageDragging, setIsPackageImageDragging] = useState(false);

  const normalizePackage = (pkg: any) => ({
    ...pkg,
    discountPercent: Number(pkg?.discountPercent ?? pkg?.discount_percentage ?? 0),
    discount_percentage: Number(pkg?.discount_percentage ?? pkg?.discountPercent ?? 0),
    fixedAmountOff: Number(pkg?.fixedAmountOff ?? pkg?.fixed_amount_off ?? 0),
    fixedPrice: Number(pkg?.fixedPrice ?? pkg?.package_price ?? 0),
    package_price: Number(pkg?.package_price ?? pkg?.fixedPrice ?? 0),
    images: Array.isArray(pkg?.images) ? pkg.images : [],
    applicableRoomIds: Array.isArray(pkg?.applicableRoomIds)
      ? pkg.applicableRoomIds.map(String)
      : Array.isArray(pkg?.applicable_room_ids)
        ? pkg.applicable_room_ids.map(String)
        : [],
    applicable_room_ids: Array.isArray(pkg?.applicable_room_ids)
      ? pkg.applicable_room_ids.map(String)
      : Array.isArray(pkg?.applicableRoomIds)
        ? pkg.applicableRoomIds.map(String)
        : [],
  });

  const addNewPackage = () => {
    const newPackage = normalizePackage({
      id: Date.now().toString(),
      ...packageForm,
      category: packagesCategory,
    });
    setPackages([...packages, newPackage]);
    setSelectedPackage(newPackage);
    setIsEditPackageOpen(false);
    setPackageForm({
      name: "",
      description: "",
      minimumStay: 1,
      maximumStay: 1,
      season: "",
      periodFrom: undefined,
      periodTo: undefined,
      pricingType: "discount",
      discountPercent: 0,
      fixedAmountOff: 0,
      fixedPrice: 0,
      package_price: 0,
      discount_percentage: 0,
      isPublic: false,
      images: [],
      applicableRoomIds: [],
    });
    setIsDirty(true);
    toast({
      title: "Package created",
      description: "The package has been created successfully.",
    });
  };

  const deletePackage = (id: string) => {
    setPackages(packages.filter((p) => p.id !== id));
    if (selectedPackage?.id === id) {
      setSelectedPackage(null);
    }
    setIsDirty(true);
    toast({
      title: "Package deleted",
      description: "The package has been removed successfully.",
    });
  };

  const handlePackageImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `packages/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage.from("package-images").upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("package-images").getPublicUrl(filePath);

      setPackageImages([...packageImages, data.publicUrl]);
      setPackageForm({ ...packageForm, images: [...packageForm.images, data.publicUrl] });

      toast({
        title: "Image uploaded",
        description: "Package image has been uploaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const handlePackageImageDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsPackageImageDragging(false);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    const fileExt = file.name.split(".").pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `packages/${fileName}`;

    try {
      const { error: uploadError } = await supabase.storage.from("package-images").upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("package-images").getPublicUrl(filePath);

      setPackageImages([...packageImages, data.publicUrl]);
      setPackageForm({ ...packageForm, images: [...packageForm.images, data.publicUrl] });

      toast({
        title: "Image uploaded",
        description: "Package image has been uploaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const removePackageImage = (imageUrl: string) => {
    setPackageImages(packageImages.filter((img) => img !== imageUrl));
    setPackageForm({ ...packageForm, images: packageForm.images.filter((img) => img !== imageUrl) });
  };

  // Announcements state
  const [announcements, setAnnouncements] = useState<any[]>([]);
  const [isManageAnnouncementOpen, setIsManageAnnouncementOpen] = useState(false);
  const [editingAnnouncementId, setEditingAnnouncementId] = useState<string | null>(null);
  const [announcementForm, setAnnouncementForm] = useState({
    announcement: "",
    order: 0,
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    enabled: true,
  });

  // Active tab state. In ROLOS embed mode, /pms/property-setup passes the tab
  // directly so the migrated source-of-truth section opens without an iframe.
  const requestedInitialTab =
    embeddedInitialTab || searchParams.get("section") || searchParams.get("tab") || "general";
  const [activeTab, setActiveTab] = useState(requestedInitialTab);
  const [railCollapsed, setRailCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("property-rail-collapsed") === "1";
    } catch {
      return false;
    }
  });
  const toggleRailCollapsed = useCallback(() => {
    setRailCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("property-rail-collapsed", next ? "1" : "0");
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  // Keep the visible tab in sync with readiness-wizard deep links, but consume
  // each deep link ONCE. Otherwise the lingering ?section= param would keep
  // snapping the user back to that tab, locking them on the page.
  const consumedDeepLinkRef = useRef<string | null>(null);
  const deepLinkKey = `${searchParams.get("section") ?? ""}|${searchParams.get("rq") ?? ""}`;
  useEffect(() => {
    const section = searchParams.get("section");
    if (!section) {
      consumedDeepLinkRef.current = null;
      return;
    }
    if (consumedDeepLinkRef.current === deepLinkKey) return;
    consumedDeepLinkRef.current = deepLinkKey;
    setActiveTab(section);
  }, [deepLinkKey, searchParams]);

  const handleTabChange = useCallback(
    (next: string) => {
      startTransition(() => {
        setActiveTab(next);
        // Drop the wizard deep-link params so nothing pulls the user back.
        const params = new URLSearchParams(searchParams);
        if (params.has("section") || params.has("focus") || params.has("rq")) {
          params.delete("section");
          params.delete("focus");
          params.delete("rq");
          setSearchParams(params, { replace: true });
        }
      });
    },
    [searchParams, setSearchParams],
  );


  // --- Field-level readiness highlighting (pink = mandatory, blue = nice-to-have).
  // When embedded in the ROLOS hub, that shell owns the painting/legend/stepper.
  const queryClient = useQueryClient();
  const [requirementRoot, setRequirementRoot] = useState<HTMLDivElement | null>(null);
  const {
    outstandingInSection: requirementOutstandingInSection,
    outstandingBySection: requirementOutstandingBySection,
    mandatoryOutstanding: requirementMandatoryOutstanding,
    mandatoryTotal: requirementMandatoryTotal,
    recommendedOutstanding: requirementRecommendedOutstanding,
    recommendedTotal: requirementRecommendedTotal,
  } = usePropertyFieldRequirements({
    propertyId,
    section: activeTab,
    root: requirementRoot,
    paint: !embedded,
  });

  const requirementCounts = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(requirementOutstandingBySection).map(([k, v]) => [
          k,
          {
            mandatory: v.mandatory,
            recommended: v.recommended,
            mandatoryLabels: v.mandatoryLabels,
            recommendedLabels: v.recommendedLabels,
            mandatoryItems: v.mandatoryItems,
            recommendedItems: v.recommendedItems,
          },
        ]),
      ),
    [requirementOutstandingBySection],
  );

  // Deep links from the readiness checksheet carry ?focus=<fieldKey>
  const requirementFocusParam = searchParams.get("focus");
  useEffect(() => {
    if (embedded || !requirementFocusParam) return;
    const t = window.setTimeout(() => focusRequirementField(requirementFocusParam), 500);
    return () => window.clearTimeout(t);
  }, [embedded, requirementFocusParam, activeTab]);


  // Quality gate blocker awareness
  const { data: activationReadiness } = useActivationReadiness(propertyId || "");

  const tabsWithBlockers = useMemo(() => {
    const set = new Set<string>();
    if (!activationReadiness?.blockers) return set;
    for (const b of activationReadiness.blockers) {
      if (b.field) {
        const tab = FIELD_TO_TAB[b.field];
        if (tab) set.add(tab);
      }
    }
    return set;
  }, [activationReadiness?.blockers]);

  // House Style state
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [isLogoUploading, setIsLogoUploading] = useState(false);
  const [roomsOnlineBookingsLink, setRoomsOnlineBookingsLink] = useState("");
  const [titleBehaviour, setTitleBehaviour] = useState<"property-name" | "property-logo" | "no-title">("property-name");
  const [merchantDetails, setMerchantDetails] = useState({
    organizationName: "",
    merchantId: "",
    merchantKey: "",
    splitAmount: "2.5",
  });
  const [adpayDetails, setAdpayDetails] = useState({
    merchant: "342500368828",
    appId: "wzb1399a1ed207c82f",
    storeNo: "4425009554",
    apiKey: "MllEvaIBADANBgkqhkiG9w0B",
  });
  const [motarApi, setMotarApi] = useState({
    venueId: "",
    xapi: "",
  });
  const [websiteColors, setWebsiteColors] = useState({
    primary: "#000000",
    secondary: "#000000",
    fontColor: "#FFFFFF",
  });

  // Business Registration fields for contract variables
  const [registeredBusinessName, setRegisteredBusinessName] = useState("");
  const [mobileNumber, setMobileNumber] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [keyRepresentative, setKeyRepresentative] = useState("");
  // Rentals United company profile + location register selection
  const [ruCompanyProfile, setRuCompanyProfile] = useState<RuCompanyProfile>({});
  const [ruLocationId, setRuLocationId] = useState<number | null>(null);

  // Load property data if editing (wait for owners to load first)
  useEffect(() => {
    const loadProperty = async () => {
      if (!id || !ownersLoaded) {
        if (!id) setIsEditMode(false);
        return;
      }

      setIsEditMode(true);
      setLoading(true);

      try {
        // Check if id is a UUID or slug
        const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

        const { data, error } = isUUID
          ? await supabase.from("properties").select("*").eq("id", id).single()
          : await supabase.from("properties").select("*").eq("slug", id).single();

        if (error) throw error;

        if (data) {
          // Store the actual property UUID for database operations
          setPropertyId(data.id);
          persistedOwnerEmailRef.current = String(data.owner_email || "").trim().toLowerCase();
          loadedPropertyRowRef.current = data as unknown as Record<string, unknown>;


          // Check if Experience Engine is enabled
          supabase
            .from("rolos_ui_configs")
            .select("experience_engine_enabled")
            .eq("property_id", data.id)
            .maybeSingle()
            .then(({ data: uiCfg }) => {
              setExperienceEngineEnabled(uiCfg?.experience_engine_enabled ?? false);
            });

          // Populate form data
          const amenities = data.amenities as any;
          const houseRules = amenities?.house_rules || {};

          setFormData({
            name: data.name || "",
            // Normalize property_type to lowercase for Select component compatibility
            property_type: (data.property_type || "").toLowerCase(),
            // Contact Email - prioritize owner_email (where contract data is stored)
            contact_email: data.owner_email || amenities?.contact?.email || "",
            // Telephone - check root level first (contract data), then nested
            telephone: amenities?.telephone || amenities?.contact?.telephone || "",
            property_url: data.property_url || "",
            wetu_id: (data as any).wetu_id || "",
            currency: amenities?.currency || "ZAR",
            owner_name: data.owner_name || "",
            owner_email: data.owner_email || "",
            country: data.country || "South Africa",
            city: data.city || "",
            address: data.address || "",
            suburb: amenities?.address_details?.suburb || "",
            postal_code: (data as any).postal_code || amenities?.address_details?.postal_code || "",
            bb_id:
              amenities?.external_ids?.nightsbridge_bb_id ||
              amenities?.external_ids?.siteminder_id ||
              amenities?.external_ids?.checkfront_id ||
              amenities?.external_ids?.benson_id ||
              "",
            venue_id: amenities?.external_ids?.semper_venue_id || "",
            channel_id: amenities?.external_ids?.semper_channel_id || "",
            account_id: amenities?.external_ids?.semper_account_id || "",
            agent_id: amenities?.external_ids?.semper_agent_id || "",
            // VAT - check root level first (contract data), then banking
            has_vat: amenities?.banking?.has_vat ?? !!(amenities?.vat_number || amenities?.banking?.vat_number),
            vat_number: amenities?.vat_number || amenities?.banking?.vat_number || "",
            // Registration - check root level first (contract data), then banking
            property_registration: amenities?.registration_number || amenities?.banking?.property_registration || "",
            bank_name: amenities?.banking?.bank_name || "",
            branch_code: amenities?.banking?.branch_code || "",
            account_holder: amenities?.banking?.account_holder || "",
            account_number: amenities?.banking?.account_number || "",
            account_type: amenities?.banking?.account_type || "",
            swift_code: amenities?.banking?.swift_code || "",
            accepts_bitcoin: amenities?.banking?.accepts_bitcoin || false,
            bitcoin_wallet_address: amenities?.banking?.bitcoin_wallet_address || "",
            description: data.description || "",
            star_rating: 0,
            facilities: [],
            items_non_refundable: houseRules.items_non_refundable ?? false,
            smoking_allowed: houseRules.smoking_allowed ?? false,
            pets_allowed: houseRules.pets_allowed ?? false,
            children_allowed: houseRules.children_allowed ?? true,
            parties_allowed: houseRules.parties_allowed ?? false,
            check_in_24h: houseRules.check_in_24h ?? false,
            deposit_allowed: houseRules.deposit_allowed ?? false,
            deposit_percentage: houseRules.deposit_percentage || "50",
            deposit_days: houseRules.deposit_days || "2",
            same_day_bookings: houseRules.same_day_bookings ?? false,
            same_day_cutoff: houseRules.same_day_cutoff || "16:00",
            check_in_from: houseRules.check_in_from || "15:00",
            check_in_to: houseRules.check_in_to || "20:00",
            check_out_from: houseRules.check_out_from || "06:00",
            check_out_to: houseRules.check_out_to || "11:00",
            days_before_arrival: String(houseRules.days_before_arrival ?? "0"),

            children_policy:
              houseRules.children_policy || "Children are welcome\nChildren up until the age of 12 - Stay free",
            infant_age_from: houseRules.infant_age_from || "1",
            infant_age_to: houseRules.infant_age_to || "2",
            children_age_from: houseRules.children_age_from || "3",
            children_age_to: houseRules.children_age_to || "12",
            // Property Surroundings fields
            restaurants_cafes: amenities?.property_info?.restaurants_cafes || "",
            restaurants_cafes_distance: amenities?.property_info?.restaurants_cafes_distance || "",
            public_transport: amenities?.property_info?.public_transport || "",
            public_transport_distance: amenities?.property_info?.public_transport_distance || "",
            closest_airport: amenities?.property_info?.closest_airport || "",
            closest_airport_distance: amenities?.property_info?.closest_airport_distance || "",
            // Additional House Rules fields
            min_check_in_age: houseRules.min_check_in_age || "18",
            pets_policy: houseRules.pets_policy || "",
            special_requests_message: houseRules.special_requests_message || "",
            advance_notice_required: houseRules.advance_notice_required ?? true,
            cot_available: houseRules.cot_available ?? false,
            cot_age_from: houseRules.cot_age_from || "0",
            cot_age_to: houseRules.cot_age_to || "2",
            cot_price: houseRules.cot_price || "Free",
            extra_beds_available: houseRules.extra_beds_available ?? false,
            extra_bed_price: houseRules.extra_bed_price || "",
            child_adult_age: houseRules.child_adult_age || "12",
            fine_print: houseRules.fine_print || "",
          });

          // Set offerings
          setIsAccommodation(amenities?.offerings?.accommodation ?? true);
          setIsVenues(amenities?.offerings?.venues ?? false);
          setIsEvent(amenities?.offerings?.event_wedding ?? false);
          setIsConference(amenities?.offerings?.conference ?? false);
          setLekkeslaapUuid(amenities?.offerings?.lekkeslaap_uuid ?? "");

          // Set property source (PMS)
          const externalSystem = data.external_system || "";
          setSelectedPMS(externalSystem);

          // Set Benson property code and environment
          if (data.benson_property_code) {
            setBensonPropertyCode(data.benson_property_code);
          }
          if ((data as any).benson_environment) {
            setBensonEnvironment((data as any).benson_environment as "staging" | "production");
          }

          // Store existing external IDs to preserve when PMS changes
          setExistingExternalIds(amenities?.external_ids || {});
          setExistingBensonPropertyCode(data.benson_property_code || null);

          // Set Cloudbeds property ID
          if ((data as any).cloudbeds_property_id) {
            setCloudbedsPropertyId((data as any).cloudbeds_property_id);
          }
          setExistingCloudbedsPropertyId((data as any).cloudbeds_property_id || null);

          // Set Little Hotelier fields
          if ((data as any).littlehotelier_channel_code) {
            setLittlehotelierChannelCode((data as any).littlehotelier_channel_code);
          }
          if ((data as any).littlehotelier_region) {
            setLittlehotelierRegion((data as any).littlehotelier_region as "apac" | "emea");
          }
          setExistingLittlehotelierChannelCode((data as any).littlehotelier_channel_code || null);
          setExistingLittlehotelierRegion((data as any).littlehotelier_region || null);

          // Set HotelBeds hotel code
          if ((data as any).hotelbeds_hotel_code) {
            setHotelbedsHotelCode((data as any).hotelbeds_hotel_code);
          }
          setExistingHotelbedsHotelCode((data as any).hotelbeds_hotel_code || null);

          // Set HyperGuest hotel ID. For HyperGuest PMS it's stored on properties.external_id;
          // for ROLOS/Roomsonline it's stored on amenities.external_ids.hyperguest_hotel_id.
          if ((data as any).external_system === "hyperguest" && (data as any).external_id) {
            setHyperguestHotelId(String((data as any).external_id));
            setExistingHyperguestHotelId(String((data as any).external_id));
          } else if (amenities?.external_ids?.hyperguest_hotel_id) {
            setHyperguestHotelId(String(amenities.external_ids.hyperguest_hotel_id));
            setExistingHyperguestHotelId(String(amenities.external_ids.hyperguest_hotel_id));
          }

          // Set Beds24 property ID. For Beds24 PMS it's on properties.external_id;
          // for ROLOS/Roomsonline it's stored on amenities.external_ids.beds24_property_id.
          if ((data as any).external_system === "beds24" && (data as any).external_id) {
            setBeds24PropertyId(String((data as any).external_id));
            setExistingBeds24PropertyId(String((data as any).external_id));
          } else if (amenities?.external_ids?.beds24_property_id) {
            setBeds24PropertyId(String(amenities.external_ids.beds24_property_id));
            setExistingBeds24PropertyId(String(amenities.external_ids.beds24_property_id));
          }

          // Set Hostfully property UID
          if ((data as any).hostfully_property_uid) {
            setHostfullyPropertyUid((data as any).hostfully_property_uid);
          }
          setExistingHostfullyPropertyUid((data as any).hostfully_property_uid || null);

          // Set owner PMS credential ID for Hostfully import
          if ((data as any).owner_pms_credential_id) {
            setOwnerPmsCredentialId((data as any).owner_pms_credential_id);
          }

          // Load TripAdvisor ID & Google Place ID
          if (amenities?.external_ids?.tripadvisor_id) {
            setTripadvisorId(amenities.external_ids.tripadvisor_id);
          }
          if (amenities?.external_ids?.google_place_id) {
            setGooglePlaceId(amenities.external_ids.google_place_id);
          }

          // Load additional source URLs
          if (amenities?.additional_source_urls) {
            const urls = amenities.additional_source_urls as string[];
            if (urls[0]) setSourceUrl2(urls[0]);
            if (urls[1]) setSourceUrl3(urls[1]);
          }

          // Load linked owners
          if (data.id) {
            supabase
              .from("property_owners")
              .select("id, user_id, owner_email, owner_name")
              .eq("property_id", data.id)
              .then(({ data: linkedData }) => {
                if (linkedData) setLinkedOwners(linkedData);
              });
          }

          // Set property slug for room URLs
          if (data.slug) {
            setPropertySlug(data.slug);
          }

          // Set location coordinates
          setLatitude(data.latitude ? Number(data.latitude) : null);
          setLongitude(data.longitude ? Number(data.longitude) : null);

          // Property composition (mandatory for channel pushes)
          setPropBedrooms(Number((data as any).bedrooms) || 0);
          setPropBathrooms(
            (data as any).bathrooms === null || (data as any).bathrooms === undefined
              ? null
              : Number((data as any).bathrooms),
          );
          setPropToilets(
            (data as any).toilets === null || (data as any).toilets === undefined
              ? 1
              : Number((data as any).toilets),
          );
          setSeparateKitchen(!!(data as any).separate_kitchen);

          // Channel changeover rules (master + per-day overrides).
          const changeoverRaw = amenities?.changeover;
          setChangeoverMaster(
            changeoverRaw === null || changeoverRaw === undefined || changeoverRaw === ""
              ? null
              : Number(changeoverRaw),
          );
          setChangeoverRules(
            amenities?.changeover_rules && typeof amenities.changeover_rules === "object"
              ? (amenities.changeover_rules as Partial<Record<ChangeoverDowKey, number>>)
              : {},
          );

          // Load google maps link if available
          if (amenities?.address_details?.google_maps_link) {
            setGoogleMapsLink(amenities.address_details.google_maps_link);
          }

          // Load no street address toggle
          if (amenities?.address_details?.no_street_address) {
            setNoStreetAddress(amenities.address_details.no_street_address);
          }

          // Load images if available - handle both string[] and object[] formats
          if (data.images && Array.isArray(data.images)) {
            console.log("[PropertyForm] Raw images from DB:", data.images.slice(0, 3));
            const imageUrls = data.images
              // For property images, filter out room-specific images (those with room_code)
              .filter((img: any) => {
                if (typeof img === "string") return true;
                // Exclude room-specific images from property gallery
                if (img && typeof img === "object" && (img.room_code || img.roomCode)) return false;
                return true;
              })
              .map((img: any) => {
                if (typeof img === "string") return img;
                // Handle HotelBeds format with url property
                if (img && typeof img === "object" && img.url) return img.url;
                // Handle alternative format with imageUrl property
                if (img && typeof img === "object" && img.imageUrl) return img.imageUrl;
                console.log("[PropertyForm] Unrecognized image format:", img);
                return null;
              })
              .filter((url): url is string => typeof url === "string" && url.startsWith("http"));
            console.log("[PropertyForm] Loaded property images:", {
              raw: data.images.length,
              extracted: imageUrls.length,
              sample: imageUrls.slice(0, 3),
            });
            setUploadedImages(imageUrls);
          } else {
            console.log("[PropertyForm] No images array found in data.images:", data.images);
          }

          // Rentals United per-photo tags (URL-keyed map)
          setImageTags(normalizeRuImageTagMap((data as any).ru_image_tags));


          // Load ROL Spec fields (direct columns)
          setRolSpecData({
            hero_listing: (data as any).hero_listing ?? false,
            hero_video_url: (data as any).hero_video_url || "",
            editorial_rating: (data as any).editorial_rating || "",
            why_we_chose_this_place: (data as any).why_we_chose_this_place || "",
            who_this_suits: (data as any).who_this_suits || "",
            what_its_really_like: (data as any).what_its_really_like || "",
            why_this_place_matters: (data as any).why_this_place_matters || "",
            who_its_not_for: (data as any).who_its_not_for || "",
            owner_notes: (data as any).owner_notes || "",
            navigation_tags: (data as any).navigation_tags || [],
          });

          // Load branding fields
          setBrandingData({
            brand_logo_url: (data as any).brand_logo_url || "",
            brand_primary_color: (data as any).brand_primary_color || "",
            brand_secondary_color: (data as any).brand_secondary_color || "",
            brand_font_color: (data as any).brand_font_color || "",
            brand_override_enabled: (data as any).brand_override_enabled ?? false,
            brand_heading_font: (data as any).brand_heading_font || "",
            brand_body_font: (data as any).brand_body_font || "",
            brand_heading_text_color: (data as any).brand_heading_text_color || "",
            brand_body_text_color: (data as any).brand_body_text_color || "",
            brand_muted_text_color: (data as any).brand_muted_text_color || "",
            brand_light_bg_color: (data as any).brand_light_bg_color || "",
            brand_dark_bg_color: (data as any).brand_dark_bg_color || "",
          });

          // Load is_rol_property and is_test_property
          setIsRolProperty((data as any).is_rol_property ?? false);
          setIsTestProperty((data as any).is_test_property ?? false);
          setIsTrading((data as any).is_trading ?? false);
          setIsSandbox((data as any).is_sandbox ?? false);

          // Load meal types if available
          if (amenities?.meal_types && Array.isArray(amenities.meal_types)) {
            setSelectedMealTypes(amenities.meal_types);
          }

          // Load room types if available - transform from PMS format to UI format
          if (amenities?.room_types && Array.isArray(amenities.room_types) && amenities.room_types.length > 0) {
            // Transform PMS format (snake_case, room_type_id) to UI format (camelCase, id)
            // Also handle wizard format fields (base_rate, rate_unit, units)
            // Wizard data is SOURCE OF TRUTH until PMS overwrites it
            const transformedRooms = amenities.room_types.map((room: any, idx: number) => {
              // Generate consistent room ID - use existing ID or create stable fallback
              const roomId = room.id || room.room_type_id || `room-${idx}`;
              // Auto-link to wizard-generated rate type if no existing links
              const existingLinks = room.linkedRateTypes || room.linked_rate_type_ids || [];
              const autoLinkedRateTypeId = `wizard-rate-${roomId}`;

              return {
                id: roomId,
                name: room.name || "Unnamed Room",
                url: room.url || "",
                selected: room.selected || false,
                // Map units from wizard OR numRooms from PMS
                numRooms: room.numRooms || room.num_rooms || room.units || 1,
                pmsRoomType: room.pmsRoomType || room.pms_room_type || room.name || "",
                pmsRoomId: room.pmsRoomId || room.pms_room_id || room.room_type_id || "",
                description: room.description || "",
                extraPersonPolicy: room.extraPersonPolicy || room.extra_person_policy || "",
                bedConfiguration: room.bedConfiguration || room.bed_configuration || [],
                roomSize: room.roomSize || room.room_size || 0,
                floor: room.floor ?? null,
                bathrooms: room.bathrooms || 1,
                // Toilets and the separate-kitchen flag are edited per unit and are
                // channel-mandatory. They used to be dropped here, so a saved value
                // looked like it stuck and then vanished on the next property load.
                toilets:
                  room.toilets ?? room.number_of_toilets ?? room.toilet_count ?? null,
                separateKitchen:
                  room.separateKitchen ?? room.separate_kitchen ?? false,
                // Channel property type (ObjectTypeID) — authored in ROL'OS, distinct from
                // the free-text PMS type. Legacy rows kept it in `property_type`.
                // Blank = inherit the property type. Legacy rows kept a free-text PMS type
                // in `property_type`, which is not an override — only a mapped value is.
                channelPropertyType: (() => {
                  // An authored override is whatever the channel-type dropdown wrote.
                  const explicit = normalizeChannelPropertyType(
                    room.channelPropertyType ?? room.channel_property_type,
                  );
                  if (explicit) return explicit;
                  // Legacy rows reused `property_type` for the free-text PMS type — only a
                  // value the channel can map counts as an override, the rest inherits.
                  const legacy = normalizeChannelPropertyType(room.property_type);
                  return legacy && isMappedChannelPropertyType(legacy) ? legacy : "";
                })(),
                // Per-unit changeover override; null means "inherit the property rule".
                changeover:
                  room.changeover ?? room.changeover_code ?? null,
                mealTypes: room.mealTypes || room.meal_types || [],
                maxPeople: room.maxPeople || room.max_guests || room.max_people || 2,
                maxAdults: room.maxAdults || room.max_adults || room.max_guests || 2,
                minGuests: room.minGuests || room.min_guests || 1,
                maxChildren: room.maxChildren || room.max_children || 0,
                minStay: room.minStay || room.min_stay || 1,
                maxStay: room.maxStay || room.max_stay || 0,
                // Map rate_unit from wizard to rateType, also handle rate_type from PMS
                rateType:
                  room.rateType ||
                  room.rate_type ||
                  (room.rate_unit === "per_stay"
                    ? "per-stay"
                    : room.rate_unit === "per_night"
                      ? "per-unit"
                      : "per-unit"),
                // Map base_rate from wizard - SOURCE OF TRUTH until PMS data arrives
                baseRate: room.baseRate || room.base_rate || null,
                splitPercent: room.splitPercent || room.split_percent || 0,
                images: Array.isArray(room.images)
                  ? room.images.map((img: any) => (typeof img === "string" ? img : img?.url)).filter(Boolean)
                  : [],
                ruImageTags: normalizeRuImageTagMap(room.ru_image_tags ?? room.ruImageTags),

                facilities: room.facilities || [],
                amenities: room.amenities || [],
                // Auto-link wizard rooms to their generated rate types if no existing links
                linkedRateTypes: existingLinks.length > 0 ? existingLinks : [autoLinkedRateTypeId],
                // Wizard rooms are NOT PMS-synced until a PMS actually syncs them
                pms_synced: room.pms_synced !== undefined ? room.pms_synced : false,
                is_active: room.is_active !== false,
              };
            });
            setRoomTypes(transformedRooms);
            persistedRoomTypesRef.current = transformedRooms;
            // Auto-select first room on initial load
            if (transformedRooms.length > 0 && !selectedRoomType) {
              setSelectedRoomType(transformedRooms[0].id);
            }
          } else if ((data as any).external_system === "hostfully" && data.id) {
            // For Hostfully properties with no room_types in amenities, load from hostfully_room_types table
            const { data: hfRooms } = await supabase
              .from("hostfully_room_types")
              .select("*")
              .eq("property_id", data.id)
              .order("name");

            if (hfRooms && hfRooms.length > 0) {
              const convertedRooms = hfRooms.map((hr) => ({
                id: hr.id,
                name: hr.name || "Unnamed Room",
                url: "",
                selected: false,
                numRooms: 1,
                pmsRoomType: hr.name,
                pmsRoomId: hr.hostfully_room_id,
                description: hr.description || "",
                extraPersonPolicy: "",
                bedConfiguration:
                  Array.isArray(hr.bed_configuration) && hr.bed_configuration.length > 0
                    ? hr.bed_configuration
                    : Array.isArray(hr.beds)
                      ? hr.beds
                      : typeof hr.beds === "number" && hr.beds > 0
                        ? [{ type: "bed", count: hr.beds }]
                        : [],
                roomSize: hr.room_size || 0,
                floor: (hr as any).floor ?? null,
                bathrooms: hr.bathrooms || 1,
                maxPeople: hr.max_guests || 2,
                maxAdults: hr.max_guests || 2,
                minGuests: hr.min_guests || 1,
                maxChildren: 0,
                minStay: hr.min_stay || 1,
                maxStay: hr.max_stay || 0,
                rateType: "per-unit",
                splitPercent: 0,
                images: Array.isArray(hr.images)
                  ? hr.images.map((img: any) => (typeof img === "string" ? img : img?.url)).filter(Boolean)
                  : [],
                ruImageTags: normalizeRuImageTagMap((hr as any).ru_image_tags),

                facilities: [],
                amenities: hr.amenities || [],
                linkedRateTypeIds: hr.linked_rate_type_ids || ["per-unit"],
                // New Hostfully fields
                checkInTime: hr.check_in_time ? `${String(hr.check_in_time).padStart(2, "0")}:00` : null,
                checkOutTime: hr.check_out_time ? `${String(hr.check_out_time).padStart(2, "0")}:00` : null,
                propertyType: hr.property_type,
                dailyRate: hr.daily_rate,
                currency: hr.currency || "ZAR",
                cleaningFee: hr.cleaning_fee,
                securityDeposit: hr.security_deposit,
                extraGuestFee: hr.extra_guest_fee,
                taxRate: hr.tax_rate,
                wifiNetwork: hr.wifi_network,
                wifiPassword: hr.wifi_password,
                houseRules: hr.house_rules,
                checkInInstructions: hr.check_in_instructions,
                cancellationPolicy: hr.cancellation_policy,
                addressStreet: hr.address_street,
                addressCity: hr.address_city,
                addressState: hr.address_state,
                addressPostalCode: hr.address_postal_code,
                addressCountry: hr.address_country,
                latitude: hr.latitude,
                longitude: hr.longitude,
                thumbnailUrl: hr.thumbnail_url,
                lastSyncedAt: hr.last_synced_at,
                pms_synced_fields: hr.pms_synced_fields || [],
                is_active: hr.is_active !== false,
              }));
              setRoomTypes(convertedRooms);
              persistedRoomTypesRef.current = convertedRooms;
              // Auto-select first room on initial load
              if (convertedRooms.length > 0 && !selectedRoomType) {
                setSelectedRoomType(convertedRooms[0].id);
              }
            }
          }

          // Load rate types - check both pms_rate_types and rate_types for compatibility
          const rawRateTypes = amenities?.pms_rate_types ?? amenities?.rate_types;
          // Determine if this property has a real PMS connection
          const hasExternalSystem =
            !!(data as any).external_system &&
            (data as any).external_system !== "none" &&
            (data as any).external_system !== "roomsonline";

          // If pms_rate_types exists as an array (even empty), respect it — don't auto-regenerate
          const hasSavedRateTypes = Array.isArray(amenities?.pms_rate_types);

          if (rawRateTypes && Array.isArray(rawRateTypes) && rawRateTypes.length > 0) {
            const transformedRateTypes = rawRateTypes.map((rt: any, idx: number) => {
              // pricingModel is the canonical field; priceType is legacy fallback
              const resolvedPricingModel =
                rt.pricingModel || rt.pricing_model || rt.priceType || rt.price_type || "UnitRate";
              return {
                id: rt.id ?? rt.rate_type_id ?? idx + 1,
                name: rt.name || `Rate Type ${rt.id ?? rt.rate_type_id ?? idx + 1}`,
                priceType: resolvedPricingModel,
                pricingModel: resolvedPricingModel,
                minStayDays: rt.minStayDays || rt.min_stay_days || 1,
                maxStayDays: rt.maxStayDays || rt.max_stay_days || 0,
                minAdvanceDays: rt.minAdvanceDays || rt.min_advance_days || 0,
                maxAdvanceDays: rt.maxAdvanceDays || rt.max_advance_days || 0,
                description: rt.description || "",
                baseRate: rt.baseRate || rt.base_rate || null,
                adult1Rate: rt.adult1Rate ?? rt.adult_1_rate ?? null,
                adult2Rate: rt.adult2Rate ?? rt.adult_2_rate ?? null,
                teenRate: rt.teenRate ?? rt.teen_rate ?? null,
                childRate: rt.childRate ?? rt.child_rate ?? null,
                infantRate: rt.infantRate ?? rt.infant_rate ?? null,
                pms_synced: hasExternalSystem && rt.pms_synced !== false,
              };
            });
            setPmsRateTypes(transformedRateTypes);
            persistedRateTypesRef.current = transformedRateTypes;
          } else if ((data as any).external_system === "hostfully" && data.id) {
            // For Hostfully properties, fetch rate types from pms_rate_types_cache
            const { data: cachedRateTypes } = await supabase
              .from("pms_rate_types_cache")
              .select("*")
              .eq("property_id", data.id)
              .eq("system_type", "hostfully");

            if (cachedRateTypes && cachedRateTypes.length > 0) {
              const transformedRateTypes = cachedRateTypes.map((rt: any) => ({
                id: rt.external_rate_type_id,
                name: rt.name || "Per Unit Rate",
                priceType: rt.price_type || "per-unit",
                minStayDays: rt.min_stay_days || 1,
                maxStayDays: rt.max_stay_days || 0,
                minAdvanceDays: rt.min_advance_days || 0,
                maxAdvanceDays: rt.max_advance_days || 0,
                description: rt.description || "",
                pms_synced: true,
              }));
              setPmsRateTypes(transformedRateTypes);
              persistedRateTypesRef.current = transformedRateTypes;
            }
          } else if (hasSavedRateTypes) {
            // pms_rate_types was explicitly saved as [] — respect deletion, don't regenerate
            setPmsRateTypes([]);
            persistedRateTypesRef.current = [];
          } else if (amenities?.room_types && Array.isArray(amenities.room_types) && amenities.room_types.length > 0) {
            // Auto-generate rate types from ALL wizard rooms (not just those with rates)
            // This ensures every room has a linkable rate type entry
            // Wizard data is source of truth until PMS overwrites it
            const generatedRateTypes = amenities.room_types.map((room: any, idx: number) => {
              const rateUnit = room.rate_unit || room.rateUnit || "per_night";
              const priceType = rateUnit === "per_stay" ? "PerStay" : "UnitRate";
              const baseRate = room.base_rate || room.baseRate || null;
              const roomName = room.name || `Room ${idx + 1}`;
              // Generate consistent room ID - use existing ID or create stable fallback
              const roomId = room.id || `room-${idx}`;

              return {
                id: `wizard-rate-${roomId}`,
                name: `${roomName} Rate`,
                priceType,
                minStayDays: room.min_stay || room.minStay || 1,
                maxStayDays: room.max_stay || room.maxStay || 0,
                minAdvanceDays: 0,
                maxAdvanceDays: 0,
                description: baseRate ? `Base rate: R${baseRate}` : `${roomName} Rate`,
                baseRate,
                pms_synced: false,
                linkedRoomId: roomId, // Track which room this rate is for
              };
            });
            setPmsRateTypes(generatedRateTypes);
            persistedRateTypesRef.current = generatedRateTypes;
          }

          // Load other saved data
          if (amenities?.star_rating) setStarRating(amenities.star_rating);
          if (amenities?.facilities && Array.isArray(amenities.facilities)) setSelectedFacilities(amenities.facilities);
          if (amenities?.accommodation_label) setAccommodationLabel(amenities.accommodation_label);
          if (amenities?.self_catering) setIsSelfCatering(!!amenities.self_catering);
          if (amenities?.breakfast_options && Array.isArray(amenities.breakfast_options))
            setSelectedBreakfastOptions(amenities.breakfast_options);
          if (amenities?.cancellation_policies) setCancellationPolicies(amenities.cancellation_policies);
          if (Array.isArray(amenities?.payment_methods)) setPaymentMethods(amenities.payment_methods as string[]);
          // Changeover was authored but never hydrated back into state, so every subsequent
          // save wrote `changeover: null` over it — the channel gate then blocked phase 2.
          if (amenities?.changeover !== undefined && amenities?.changeover !== null)
            setChangeoverMaster(Number(amenities.changeover));
          if (amenities?.changeover_rules && typeof amenities.changeover_rules === "object")
            setChangeoverRules(amenities.changeover_rules as Partial<Record<ChangeoverDowKey, number>>);
          if (amenities?.property_floor !== undefined && amenities?.property_floor !== null)
            setPropertyFloor(Number(amenities.property_floor));
          if (amenities?.property_size_sqm) setPropertySizeSqm(Number(amenities.property_size_sqm));
          if (amenities?.seasons) setSeasons(amenities.seasons);
          if (amenities?.season_rates) setSeasonRates(amenities.season_rates);
          // Note: pms_rate_types is loaded above with transformation
          if (amenities?.addons) setAddons(amenities.addons);
          if (amenities?.packages) setPackages((amenities.packages as any[]).map(normalizePackage));
          if (amenities?.announcements) setAnnouncements(amenities.announcements);

          // Load house style
          const houseStyle = amenities?.house_style || {};
          if (houseStyle.company_logo) setCompanyLogo(houseStyle.company_logo);
          if (houseStyle.litchi_bookings_link || houseStyle.roomsonline_bookings_link)
            setRoomsOnlineBookingsLink(houseStyle.roomsonline_bookings_link || houseStyle.litchi_bookings_link);
          if (houseStyle.title_behaviour) setTitleBehaviour(houseStyle.title_behaviour);
          if (houseStyle.merchant_details) setMerchantDetails(houseStyle.merchant_details);
          if (houseStyle.adpay_details) setAdpayDetails(houseStyle.adpay_details);
          if (houseStyle.motar_api) setMotarApi(houseStyle.motar_api);
          if (houseStyle.website_colors) setWebsiteColors(houseStyle.website_colors);

          // Load Business Registration fields
          if (amenities?.registered_business_name) setRegisteredBusinessName(amenities.registered_business_name);
          if (amenities?.mobile_number) setMobileNumber(amenities.mobile_number);
          if (amenities?.postal_address) setPostalAddress(amenities.postal_address);
          if (amenities?.key_representative) setKeyRepresentative(amenities.key_representative);
          setRuCompanyProfile(
            amenities?.ru_company_profile && typeof amenities.ru_company_profile === "object"
              ? (amenities.ru_company_profile as RuCompanyProfile)
              : {},
          );
          setRuLocationId(
            typeof (data as any)?.ru_location_id === "number" ? Number((data as any).ru_location_id) : null,
          );

          const templates = amenities?.templates || {};
          if (templates.selected_template) setSelectedTemplate(templates.selected_template);
          // Only override default template content if one exists in the database
          if (templates.template_content && templates.template_content.trim()) {
            setTemplateContent(templates.template_content);
          }
          if (templates.pre_mailer_days !== undefined) setPreMailerDays(templates.pre_mailer_days);
          if (templates.pre_mailer_hours !== undefined) setPreMailerHours(templates.pre_mailer_hours);
          if (templates.post_mailer_days !== undefined) setPostMailerDays(templates.post_mailer_days);
          if (templates.post_mailer_hours !== undefined) setPostMailerHours(templates.post_mailer_hours);
        }
      } catch (error) {
        console.error("Error loading property:", error);
        toast({
          title: "Error",
          description: "Failed to load property data",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    loadProperty();
  }, [id, ownersLoaded]);

  const saveAnnouncement = () => {
    if (editingAnnouncementId) {
      setAnnouncements(announcements.map((a) => (a.id === editingAnnouncementId ? { ...a, ...announcementForm } : a)));
      toast({ title: "Announcement updated", description: "The announcement has been updated." });
    } else {
      const newAnnouncement = { id: Date.now().toString(), ...announcementForm };
      setAnnouncements([...announcements, newAnnouncement]);
      toast({ title: "Announcement created", description: "The announcement has been added successfully." });
    }
    setIsManageAnnouncementOpen(false);
    setEditingAnnouncementId(null);
    setAnnouncementForm({ announcement: "", order: 0, startDate: undefined, endDate: undefined, enabled: true });
    setIsDirty(true);
  };

  const editAnnouncement = (a: any) => {
    setEditingAnnouncementId(a.id);
    setAnnouncementForm({
      announcement: a.announcement || "",
      order: a.order || 0,
      startDate: a.startDate ? new Date(a.startDate) : undefined,
      endDate: a.endDate ? new Date(a.endDate) : undefined,
      enabled: a.enabled ?? true,
    });
    setIsManageAnnouncementOpen(true);
  };

  const deleteAnnouncement = (id: string) => {
    setAnnouncements(announcements.filter((a) => a.id !== id));
    toast({ title: "Announcement deleted", description: "The announcement has been removed." });
    setIsDirty(true);
  };

  const toggleAnnouncementEnabled = (id: string) => {
    setAnnouncements(announcements.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
    setIsDirty(true);
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsLogoUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `logo-${Math.random()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage.from("property-images").upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("property-images").getPublicUrl(filePath);

      setCompanyLogo(data.publicUrl);

      toast({
        title: "Logo uploaded",
        description: "Company logo has been uploaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLogoUploading(false);
    }
  };

  const handleLogoDrop = async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setIsLogoUploading(true);

    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `logo-${Math.random()}.${fileExt}`;
      const filePath = `logos/${fileName}`;

      const { error: uploadError } = await supabase.storage.from("property-images").upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("property-images").getPublicUrl(filePath);

      setCompanyLogo(data.publicUrl);

      toast({
        title: "Logo uploaded",
        description: "Company logo has been uploaded successfully.",
      });
    } catch (error: any) {
      toast({
        title: "Upload failed",
        description: error.message,
        variant: "destructive",
      });
    } finally {
      setIsLogoUploading(false);
    }
  };

  const handleInputChange = useCallback((field: keyof PropertyFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  }, []);

  const toggleFacility = (facility: string) => {
    setSelectedFacilities((prev) =>
      prev.includes(facility) ? prev.filter((f) => f !== facility) : [...prev, facility],
    );
    setIsDirty(true);
  };

  const addCancellationPolicy = () => {
    setCancellationPolicies([...cancellationPolicies, { forfeit: "", type: "% of Total", days: "" }]);
    setIsDirty(true);
  };

  const removeCancellationPolicy = (index: number) => {
    setCancellationPolicies(cancellationPolicies.filter((_, i) => i !== index));
    setIsDirty(true);
  };

  const updateCancellationPolicy = (index: number, field: string, value: string) => {
    const updated = [...cancellationPolicies];
    updated[index] = { ...updated[index], [field]: value };
    setCancellationPolicies(updated);
    setIsDirty(true);
  };

  const SUPPORTED_IMAGE_TYPES = [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/svg+xml",
    "image/avif",
  ];

  const handleImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const supportedFiles: File[] = [];
    const unsupportedNames: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (
        SUPPORTED_IMAGE_TYPES.includes(file.type) ||
        (file.type.startsWith("image/") && file.type !== "image/heic" && file.type !== "image/heif")
      ) {
        supportedFiles.push(file);
      } else {
        unsupportedNames.push(file.name);
      }
    }

    if (unsupportedNames.length > 0) {
      toast({
        title: `${unsupportedNames.length} file(s) skipped`,
        description: `Unsupported format: ${unsupportedNames.join(", ")}. Use JPG, PNG, WebP, or GIF.`,
        variant: "destructive",
      });
    }

    if (supportedFiles.length === 0) return;

    // Validate dimensions before uploading
    const validFiles: File[] = [];
    for (const file of supportedFiles) {
      const dims = await validateImageDimensions(file);
      if (!dims.valid) {
        toast({
          title: "Image too small",
          description: getValidationErrorMessage(file.name, dims.width, dims.height),
          variant: "destructive",
        });
      } else {
        validFiles.push(file);
      }
    }
    if (validFiles.length === 0) return;

    for (const file of validFiles) {
      try {
        const fileExt = file.name.split(".").pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage.from("property-images").upload(filePath, file);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("property-images").getPublicUrl(filePath);

        setUploadedImages((prev) => [...prev, publicUrl]);
        setIsDirty(true);
      } catch (error) {
        toast({
          title: "Upload failed",
          description: `Failed to upload ${file.name}`,
          variant: "destructive",
        });
      }
    }

    if (supportedFiles.length > 0 && unsupportedNames.length > 0) {
      toast({
        title: "Upload complete",
        description: `${supportedFiles.length} image(s) uploaded successfully.`,
      });
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleImageUpload(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const removeImage = (index: number) => {
    setUploadedImages((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validate form data with conditional schema
      const schema = createPropertySchema(noStreetAddress);

      // If using Google Maps pin, require coordinates
      if (noStreetAddress && (!latitude || !longitude)) {
        toast({
          title: "Location required",
          description: "Please paste a valid Google Maps link to extract coordinates",
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      schema.parse(formData);

      // The channel manager rejects a listing whose check-out is later than its check-in
      // "from" time, so an invalid trio must never be saved and pushed.
      const stayTimeIssues = validateStayTimes(formData);
      if (stayTimeIssues.length > 0) {
        toast({
          title: "Check-in / check-out times invalid",
          description: stayTimeIssues.map((i) => i.message).join(" "),
          variant: "destructive",
        });
        setLoading(false);
        return;
      }

      const nextOwnerEmail = String(formData.owner_email || "").trim().toLowerCase();
      const prevOwnerEmail = persistedOwnerEmailRef.current;
      if (isEditMode && propertyId && prevOwnerEmail !== nextOwnerEmail) {
        const reset = await resetBillingAfterOwnerChange(
          propertyId,
          nextOwnerEmail ? "owner_changed" : "owner_unbound",
        );
        if (!reset.ok) {
          toast({
            title: "Owner change blocked",
            description:
              reset.message ||
              "The existing subscription could not be cancelled. The owner was not changed.",
            variant: "destructive",
          });
          setLoading(false);
          return;
        }
      }

      // The Arrival policy editor (Policies tab) is the sole author of
      // amenities.house_rules.check_in_instructions and writes it directly. Read the stored
      // value back here so this save preserves it instead of rebuilding house_rules without it.
      // If the panel has an unsaved draft, THIS save must persist it — owners often type
      // the policy and then press the form's Save bar rather than the panel's own button.
      let storedArrivalInstructions: string | null = null;
      if (isEditMode && propertyId) {
        const pendingArrival = getArrivalPolicyDraft(propertyId);
        if (pendingArrival !== undefined) {
          const pendingText = pendingArrival.trim();
          storedArrivalInstructions = pendingText.length > 0 ? pendingText : null;
        } else {
          const { data: existingArrival } = await supabase
            .from("properties")
            .select("amenities")
            .eq("id", propertyId)
            .maybeSingle();
          const existingHouseRules = ((existingArrival?.amenities as any)?.house_rules ?? {}) as Record<string, unknown>;
          const existingText = String(existingHouseRules.check_in_instructions ?? "").trim();
          storedArrivalInstructions = existingText.length > 0 ? existingText : null;
        }
      }

      // Prepare data for database
      const propertyData = {
        name: formData.name,
        property_type: formData.property_type,
        description: formData.description || null,
        address: formData.address,
        city: formData.city,
        postal_code: formData.postal_code || null,
        country: formData.country,
        // Rentals United location register selection (explicit LocationID wins at push time)
        ru_location_id: ruLocationId,
        latitude: latitude,
        longitude: longitude,
        owner_name: formData.owner_name || null,
        owner_email: formData.owner_email || null,
        external_system: selectedPMS || null,
        external_id:
          selectedPMS === "hyperguest"
            ? hyperguestHotelId?.trim() || existingHyperguestHotelId || null
            : selectedPMS === "beds24"
              ? beds24PropertyId?.trim() || existingBeds24PropertyId || null
              : formData.bb_id || formData.venue_id || null,
        // Preserve existing benson_property_code if PMS changed, only update if benson is selected
        benson_property_code: selectedPMS === "benson" ? bensonPropertyCode : existingBensonPropertyCode,
        benson_environment: selectedPMS === "benson" ? "production" : null,
        // Preserve existing cloudbeds_property_id if PMS changed, only update if cloudbeds is selected
        cloudbeds_property_id: selectedPMS === "cloudbeds" ? cloudbedsPropertyId : existingCloudbedsPropertyId,
        // Preserve existing littlehotelier fields if PMS changed, only update if littlehotelier is selected
        littlehotelier_channel_code:
          selectedPMS === "littlehotelier" ? littlehotelierChannelCode : existingLittlehotelierChannelCode,
        littlehotelier_region: selectedPMS === "littlehotelier" ? littlehotelierRegion : existingLittlehotelierRegion,
        // Preserve existing hotelbeds_hotel_code if PMS changed, only update if hotelbeds is selected
        hotelbeds_hotel_code: selectedPMS === "hotelbeds" ? hotelbedsHotelCode : existingHotelbedsHotelCode,
        property_url: formData.property_url || null,
        wetu_id: formData.wetu_id?.trim() || null,
        is_rol_property: isRolProperty,
        is_test_property: isTestProperty,
        is_trading: isTrading,
        is_sandbox: isSandbox,
        is_active: true,
        images: uploadedImages,
        ru_image_tags: pruneRuImageTagMap(imageTags, uploadedImages),

        // Capacity is authored by the dedicated occupancy/unit surfaces. This overview save
        // must preserve it instead of silently resetting every property to two guests.
        max_guests: Number(loadedPropertyRowRef.current?.max_guests) || 2,
        // Composition — required by Rentals United and downstream channels
        bedrooms: propBedrooms || null,
        bathrooms: propBathrooms ?? null,
        toilets: propToilets ?? null,
        separate_kitchen: separateKitchen,
        price_per_night: 0, // Default value, can be updated later
        // ROL Spec fields (stored as direct columns)
        hero_listing: rolSpecData.hero_listing,
        hero_video_url: rolSpecData.hero_video_url || null,
        editorial_rating: rolSpecData.editorial_rating || null,
        why_we_chose_this_place: rolSpecData.why_we_chose_this_place || null,
        who_this_suits: rolSpecData.who_this_suits || null,
        what_its_really_like: rolSpecData.what_its_really_like || null,
        why_this_place_matters: rolSpecData.why_this_place_matters || null,
        who_its_not_for: rolSpecData.who_its_not_for || null,
        owner_notes: rolSpecData.owner_notes || null,
        navigation_tags: rolSpecData.navigation_tags || [],
        // Branding fields
        brand_logo_url: brandingData.brand_logo_url || null,
        brand_primary_color: brandingData.brand_primary_color || null,
        brand_secondary_color: brandingData.brand_secondary_color || null,
        brand_font_color: brandingData.brand_font_color || null,
        brand_override_enabled: brandingData.brand_override_enabled,
        brand_heading_font: brandingData.brand_heading_font || null,
        brand_body_font: brandingData.brand_body_font || null,
        brand_heading_text_color: brandingData.brand_heading_text_color || null,
        brand_body_text_color: brandingData.brand_body_text_color || null,
        brand_muted_text_color: brandingData.brand_muted_text_color || null,
        brand_light_bg_color: brandingData.brand_light_bg_color || null,
        brand_dark_bg_color: brandingData.brand_dark_bg_color || null,
        amenities: {
          offerings: {
            accommodation: isAccommodation,
            venues: isVenues,
            event_wedding: isEvent,
            conference: isConference,
            ...(lekkeslaapUuid ? { lekkeslaap_uuid: lekkeslaapUuid } : {}),
          },
          contact: {
            email: formData.contact_email,
            telephone: formData.telephone,
            owner: formData.owner_name,
          },
          address_details: {
            suburb: formData.suburb,
            postal_code: formData.postal_code,
            google_maps_link: googleMapsLink || null,
            no_street_address: noStreetAddress,
          },
          currency: formData.currency,
          // Business Registration fields (root level for contract variables)
          registered_business_name: registeredBusinessName || null,
          registration_number: formData.property_registration || null,
          vat_number: formData.has_vat ? formData.vat_number : null,
          telephone: formData.telephone || null,
          mobile_number: mobileNumber || null,
          postal_address: postalAddress || null,
          key_representative: keyRepresentative || formData.owner_name || null,
          ru_company_profile: (Object.keys(ruCompanyProfile).length > 0 ? ruCompanyProfile : null) as never,
          banking: {
            has_vat: formData.has_vat,
            vat_number: formData.has_vat ? formData.vat_number : null,
            property_registration: formData.property_registration,
            bank_name: formData.bank_name,
            branch_code: formData.branch_code,
            account_holder: formData.account_holder,
            account_number: formData.account_number,
            account_type: formData.account_type,
            swift_code: formData.swift_code,
            accepts_bitcoin: formData.accepts_bitcoin,
            bitcoin_wallet_address: formData.accepts_bitcoin ? formData.bitcoin_wallet_address : null,
          },
          // Preserve existing external IDs, only update for currently selected PMS
          external_ids: {
            nightsbridge_bb_id:
              selectedPMS === "nightsbridge" ? formData.bb_id : existingExternalIds.nightsbridge_bb_id,
            semper_venue_id: selectedPMS === "semper" ? formData.venue_id : existingExternalIds.semper_venue_id,
            semper_channel_id: selectedPMS === "semper" ? formData.channel_id : existingExternalIds.semper_channel_id,
            semper_account_id: selectedPMS === "semper" ? formData.account_id : existingExternalIds.semper_account_id,
            semper_agent_id: selectedPMS === "semper" ? formData.agent_id : existingExternalIds.semper_agent_id,
            siteminder_id: selectedPMS === "siteminder" ? formData.bb_id : existingExternalIds.siteminder_id,
            checkfront_id: selectedPMS === "checkfront" ? formData.bb_id : existingExternalIds.checkfront_id,
            benson_id: selectedPMS === "benson" ? formData.bb_id : existingExternalIds.benson_id,
            tripadvisor_id: tripadvisorId || existingExternalIds.tripadvisor_id,
            google_place_id: googlePlaceId || existingExternalIds.google_place_id,
            hyperguest_hotel_id:
              selectedPMS === "roomsonline" || selectedPMS === "rolos"
                ? hyperguestHotelId?.trim() || null
                : (existingExternalIds.hyperguest_hotel_id ?? null),
            beds24_property_id:
              selectedPMS === "roomsonline" || selectedPMS === "rolos"
                ? beds24PropertyId?.trim() || null
                : (existingExternalIds.beds24_property_id ?? null),
          },
          property_info: {
            restaurants_cafes: formData.restaurants_cafes,
            restaurants_cafes_distance: formData.restaurants_cafes_distance,
            public_transport: formData.public_transport,
            public_transport_distance: formData.public_transport_distance,
            closest_airport: formData.closest_airport,
            closest_airport_distance: formData.closest_airport_distance,
          },
          room_types: roomTypes,
          accommodation_label: accommodationLabel || undefined,
          self_catering: isSelfCatering || undefined,
          meal_types: selectedMealTypes,
          star_rating: starRating,
          facilities: selectedFacilities,
          breakfast_options: selectedBreakfastOptions,
          cancellation_policies: cancellationPolicies,
          payment_methods: paymentMethods,
          property_floor: propertyFloor,
          property_size_sqm: propertySizeSqm,
          // Master changeover rule + per-day overrides, and the per-unit map the
          // channel push reads when a unit overrides the property rule.
          changeover: changeoverMaster,
          changeover_rules: changeoverRules,
          changeover_by_unit: Object.fromEntries(
            roomTypes
              .filter((r: any) => r?.id && r?.changeover !== null && r?.changeover !== undefined && r?.changeover !== "")
              .map((r: any) => [r.id, Number(r.changeover)]),
          ),
          house_rules: {
            items_non_refundable: formData.items_non_refundable,
            smoking_allowed: formData.smoking_allowed,
            pets_allowed: formData.pets_allowed,
            children_allowed: formData.children_allowed,
            parties_allowed: formData.parties_allowed,
            check_in_24h: formData.check_in_24h,
            deposit_allowed: formData.deposit_allowed,
            deposit_percentage: formData.deposit_percentage,
            deposit_days: formData.deposit_days,
            same_day_bookings: formData.same_day_bookings,
            same_day_cutoff: formData.same_day_cutoff,
            check_in_from: formData.check_in_from,
            check_in_to: formData.check_in_to,
            check_out_from: formData.check_out_from,
            check_out_to: formData.check_out_to,
            // Channel <DaysBeforeArrival> — how many days ahead the owner should be contacted.
            days_before_arrival: formData.days_before_arrival,

            children_policy: formData.children_policy,
            // Authored in the Policies tab → Arrival policy; preserved verbatim here.
            check_in_instructions: storedArrivalInstructions,
            infant_age_from: formData.infant_age_from,
            infant_age_to: formData.infant_age_to,
            children_age_from: formData.children_age_from,
            children_age_to: formData.children_age_to,
            min_check_in_age: formData.min_check_in_age,
            pets_policy: formData.pets_policy,
            special_requests_message: formData.special_requests_message,
            advance_notice_required: formData.advance_notice_required,
            cot_available: formData.cot_available,
            cot_age_from: formData.cot_age_from,
            cot_age_to: formData.cot_age_to,
            cot_price: formData.cot_price,
            extra_beds_available: formData.extra_beds_available,
            extra_bed_price: formData.extra_bed_price,
            child_adult_age: formData.child_adult_age,
            fine_print: formData.fine_print,
          },
          house_style: {
            company_logo: companyLogo,
            roomsonline_bookings_link: roomsOnlineBookingsLink,
            title_behaviour: titleBehaviour,
            merchant_details: merchantDetails,
            adpay_details: adpayDetails,
            motar_api: motarApi,
            website_colors: websiteColors,
          },
          additional_source_urls: [sourceUrl2, sourceUrl3].filter(Boolean),
          seasons: seasons,
          season_rates: seasonRates,
          pms_rate_types: pmsRateTypes,
          addons: addons,
          packages: packages.map(normalizePackage),
          announcements: announcements,
          templates: {
            selected_template: selectedTemplate,
            template_content: templateContent,
            pre_mailer_days: preMailerDays,
            pre_mailer_hours: preMailerHours,
            post_mailer_days: postMailerDays,
            post_mailer_hours: postMailerHours,
          },
        },
      };

      const previousRow = loadedPropertyRowRef.current;
      const propertyPatch = buildPropertySavePatch(
        previousRow,
        propertyData as unknown as Record<string, unknown>,
      );
      const propertyChanged = Object.keys(propertyPatch).length > 0;
      const previousAmenities = (previousRow?.amenities ?? {}) as Record<string, unknown>;
      const roomsChanged = !samePersistedValue(persistedRoomTypesRef.current, roomTypes);
      const seasonsChanged = !samePersistedValue(previousAmenities.seasons, seasons);
      const ratePlansChanged = !samePersistedValue(persistedRateTypesRef.current, pmsRateTypes);

      let savedProperty: { id: string; slug: string | null } | null = null;
      let error: { message: string } | null = null;
      if (isEditMode && propertyId) {
        if (propertyChanged) {
          const result = await supabase
            .from("properties")
            .update(propertyPatch as never)
            .eq("id", propertyId)
            .select("id, slug")
            .single();
          savedProperty = result.data;
          error = result.error;
        } else {
          savedProperty = { id: propertyId, slug: propertySlug || null };
        }
      } else {
        const result = await supabase.from("properties").insert([propertyData]).select("id, slug").single();
        savedProperty = result.data;
        error = result.error;
      }

      if (error) throw error;

      const savedPropertyId = savedProperty?.id || propertyId;

      // Portfolio calendars share season definitions only. Each property's season/rack rates remain untouched.
      if (isRolProperty && savedPropertyId && seasonsChanged) {
        try {
          await syncPortfolioSeasonDates(savedPropertyId, seasons);
        } catch (seasonSyncError) {
          console.error("Portfolio season date sync failed:", seasonSyncError);
          toast({
            title: "Property saved; portfolio season sync failed",
            description: "This property's rates were saved, but sibling season dates could not be updated.",
            variant: "destructive",
          });
        }
      }

      // For ROL properties, sync room types to hostfully_room_types table
      // This triggers the bidirectional sync to rolos_room_types
      if (isRolProperty && savedPropertyId && roomTypes.length > 0 && roomsChanged) {
        try {
          // Upsert room types to hostfully_room_types with ALL fields.
          // Two units in one save must never resolve to the same row.
          const claimedRoomIds = new Set<string>();
          // One snapshot for the whole save. Previously every unit repeated this query,
          // making save time grow linearly with network latency.
          const { data: existingRoomRows } = await supabase
            .from("hostfully_room_types")
            .select("id, name, rentalsunited_property_id, created_at, is_active")
            .eq("property_id", savedPropertyId);
          const allRows = (existingRoomRows || []) as any[];
          for (const room of roomTypes) {

            // Find matching rate type to get baseRate — check linkedRateTypes first, then wizard-rate pattern
            const roomId = room.id || "";
            let baseRate = room.base_rate || room.baseRate || null;

            if (!baseRate) {
              // Check linkedRateTypes on the room
              const roomLinkedRateTypes = room.linkedRateTypes || [];
              for (const linkedId of roomLinkedRateTypes) {
                const matchingRate = pmsRateTypes.find((rt: any) => rt.id === linkedId);
                if (matchingRate?.baseRate) {
                  baseRate = matchingRate.baseRate;
                  break;
                }
              }
            }

            if (!baseRate) {
              // Fallback: wizard-rate pattern or linkedRoomId
              const matchingRate = pmsRateTypes.find(
                (rt: any) => rt.linkedRoomId === roomId || rt.id === `wizard-rate-${roomId}`,
              );
              baseRate = matchingRate?.baseRate || room.rates?.[0]?.baseRate || null;
            }

            const roomTypeData: any = {
              property_id: savedPropertyId,
              name: room.name || "Unnamed Room",
              description: room.description || null,
              max_guests: room.maxPeople || room.maxAdults || 2,
              daily_rate: baseRate,
              is_active: room.is_active !== false,
              bed_configuration: room.bedConfiguration || null,
              // Declared bedrooms must match the authored bedroom groups — the channel
              // compares the two and rejects a unit whose beds sit in fewer bedrooms.
              bedrooms: Number(room.bedrooms) || authoredBedroomCount(room.bedConfiguration) || null,

              amenities: room.amenities || null,
              images: room.images || null,
              ru_image_tags: pruneRuImageTagMap(
                normalizeRuImageTagMap(room.ruImageTags),
                Array.isArray(room.images) ? room.images : [],
              ),

              facilities_raw: room.facilities || null,
              min_stay: room.minStay || null,
              max_stay: room.maxStay || null,
              room_size: room.roomSize || null,
              bathrooms: room.bathrooms || null,
              cleaning_fee: room.cleaningFee ?? room.cleaning_fee ?? null,
              security_deposit: room.securityDeposit ?? room.security_deposit ?? null,
              tax_rate: room.taxRate ?? room.tax_rate ?? null,
              // The channel maps ObjectTypeID from this column, so the authored channel
              // type wins over the free-text PMS type.
              // Blank means "inherit the property type": the push resolves
              // `unit.property_type || property.property_type`, so the free-text PMS type
              // must never be copied in here — that would look like an explicit override.
              property_type: normalizeChannelPropertyType(room.channelPropertyType) || null,
              linked_rate_type_ids: room.linkedRateTypes || null,
              // Use existing id if it looks like a UUID, otherwise don't set
              ...(room.id && room.id.length === 36 ? { id: room.id } : {}),
            };

            // One row per physical unit, matched by IDENTITY first.
            //
            // Matching on the name alone made a rename look like a brand-new unit: the renamed
            // unit found no name match, was inserted with no channel listing id, and the next
            // push created a second listing for it while the old row kept the original one.
            // The unit's own id is stable across renames, so it wins whenever the row still
            // exists. The normalised-name match stays as the fallback for units the editor has
            // never persisted (no id yet), and it also absorbs case/whitespace variants.
            const normalizedName = normalizeRoomIdentityName(room.name);
            const available = allRows.filter((r: any) => !claimedRoomIds.has(r.id));
            const resolvedIdentity = resolvePersistedRoomIdentity(
              allRows.map((r: any) => ({
                id: r.id,
                name: r.name,
                isActive: r.is_active,
                listingId: r.rentalsunited_property_id,
                createdAt: r.created_at,
              })),
              { id: room.id, name: room.name },
              claimedRoomIds,
            );
            const byId = resolvedIdentity?.id === room.id ? resolvedIdentity : null;
            const nameMatches = resolvedIdentity && normalizeRoomIdentityName(resolvedIdentity.name) === normalizedName
              ? [resolvedIdentity]
              : [];
            const preferListed = (a: any, b: any) =>
              (b.rentalsunited_property_id ? 1 : 0) - (a.rentalsunited_property_id ? 1 : 0) ||
              String(a.created_at).localeCompare(String(b.created_at));
            // Renamed outside the editor (import, bulk edit): a unit about to be inserted while a
            // published row on this property no longer appears in the editor is that same unit
            // under a new name. Adopt it — inserting would strand its listing and create a second.
            const editorNames = new Set(roomTypes.map((r: any) => normalizeRoomIdentityName(r.name)).filter(Boolean));
            const editorIds = new Set(
              roomTypes.map((r: any) => r.id).filter((id: string) => id && id.length === 36),
            );
            const strandedListed =
              !byId && nameMatches.length === 0
                ? available
                    .filter(
                      (r: any) =>
                        r.is_active !== false &&
                        !!String(r.rentalsunited_property_id ?? "").trim() &&
                        !editorIds.has(r.id) &&
                        !editorNames.has(normalizeRoomIdentityName(r.name)),
                    )
                    .sort(preferListed)
                : [];
            const targetId =
              byId?.id ??
              nameMatches.sort(preferListed)[0]?.id ??
              (strandedListed.length === 1 ? strandedListed[0].id : null) ??
              null;
            if (targetId) claimedRoomIds.add(targetId);


            if (targetId) {
              const { id: _ignoredId, ...updateData } = roomTypeData;
              const { error: updateError } = await supabase
                .from("hostfully_room_types")
                .update(updateData)
                .eq("id", targetId);
              if (updateError) console.warn("Room type update warning:", updateError);
            } else {
              const { error: insertError } = await supabase.from("hostfully_room_types").insert(roomTypeData);
              if (insertError) console.warn("Room type insert warning:", insertError);
            }

          }
          console.log(`[ROL Sync] Synced ${roomTypes.length} room types to hostfully_room_types`);

          // Orphan cleanup now handled universally below (outside ROL block)

          // Now ensure physical rolos_rooms exist for all rolos_room_types
          const { data: allRolosTypes } = await supabase
            .from("rolos_room_types")
            .select("id, name")
            .eq("property_id", savedPropertyId)
            .eq("is_active", true);

          if (allRolosTypes && allRolosTypes.length > 0) {
            const { data: existingPhysical } = await supabase
              .from("rolos_rooms")
              .select("room_type_id, room_number, room_name")
              .eq("property_id", savedPropertyId);

            const normaliseUnitName = (value: string | null | undefined) =>
              String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

            const hasPhysical = new Set((existingPhysical || []).map((r: any) => r.room_type_id).filter(Boolean));
            // A unit already exists for this *name* — a differently cased or
            // duplicated room type must never spawn a second physical unit.
            const namesWithUnit = new Set(
              (existingPhysical || []).flatMap((r: any) =>
                [normaliseUnitName(r.room_number), normaliseUnitName(r.room_name)].filter(Boolean)
              )
            );
            const missingPhysical = allRolosTypes.filter(
              (rt) => !hasPhysical.has(rt.id) && !namesWithUnit.has(normaliseUnitName(rt.name))
            );

            if (missingPhysical.length > 0) {
              const physicalRooms = missingPhysical.map((rt) => ({
                property_id: savedPropertyId,
                room_number: rt.name,
                room_name: rt.name,
                room_type_id: rt.id,
                status: "available",
              }));
              const { error: roomErr } = await supabase.from("rolos_rooms").insert(physicalRooms);
              if (roomErr) console.warn("[ROL Sync] Physical rooms creation warning:", roomErr);
              else console.log(`[ROL Sync] Created ${missingPhysical.length} physical rooms`);
            }
          }

        } catch (syncErr) {
          console.warn("Room types sync warning:", syncErr);
        }
      }

      // Deactivate orphan hostfully_room_types ONLY for ROL'OS native properties
      // PMS-managed properties (Hostfully, Benson, etc.) use the importer as source of truth.
      //
      // Two hard guards: a save made before the units tab hydrated (empty roomTypes) may
      // never archive anything, and a unit that holds a channel listing id is never
      // archived silently — that is how live units vanished from the channel footprint.
      if (isRolProperty && savedPropertyId && roomTypes.length > 0 && roomsChanged) {
        try {
          const currentRoomNames = roomTypes.map((r: any) => (r.name || "").toLowerCase().trim()).filter(Boolean);
          const currentRoomIds = roomTypes.map((r: any) => r.id).filter((id: string) => id && id.length === 36);
          const { data: allActiveDbRooms } = await supabase
            .from("hostfully_room_types")
            .select("id, name, rentalsunited_property_id")
            .eq("property_id", savedPropertyId)
            .eq("is_active", true);

          if (allActiveDbRooms) {
            const candidates = allActiveDbRooms.filter(
              (dbRoom: any) =>
                !currentRoomIds.includes(dbRoom.id) &&
                !currentRoomNames.includes((dbRoom.name || "").toLowerCase().trim()),
            );
            const protectedRooms = candidates.filter((r: any) =>
              !!String(r.rentalsunited_property_id ?? "").trim(),
            );
            const orphanRooms = candidates.filter((r: any) =>
              !String(r.rentalsunited_property_id ?? "").trim(),
            );
            if (protectedRooms.length > 0) {
              console.warn(
                "[Save] Kept units that hold a channel listing:",
                protectedRooms.map((o: any) => o.name),
              );
              toast({
                title: "Units kept",
                description: `${protectedRooms
                  .map((o: any) => o.name)
                  .join(", ")} ${protectedRooms.length === 1 ? "is" : "are"} published on the channel, so ${
                  protectedRooms.length === 1 ? "it was" : "they were"
                } not removed. Release the listing first if this is intended.`,
              });
            }
            if (orphanRooms.length > 0) {
              const orphanIds = orphanRooms.map((o: any) => o.id);
              await supabase
                .from("hostfully_room_types")
                .update({ is_active: false, updated_at: new Date().toISOString() })
                .in("id", orphanIds);
              console.log(
                `[Save] Deactivated ${orphanRooms.length} orphan hostfully_room_types:`,
                orphanRooms.map((o: any) => o.name),
              );
              toast({
                title: "Units removed",
                description: `Deactivated ${orphanRooms.map((o: any) => o.name).join(", ")}.`,
              });
            }
          }
        } catch (orphanErr) {
          console.warn("[Save] Orphan room cleanup warning:", orphanErr);
        }
      }


      // For ROL properties, sync pmsRateTypes to rolos_rate_plans table
      if (isRolProperty && savedPropertyId && pmsRateTypes.length > 0 && ratePlansChanged) {
        try {
          console.log(
            `[ROL Sync] Syncing ${pmsRateTypes.length} rate types to rolos_rate_plans...`,
            pmsRateTypes.map((r: any) => r.name),
          );
          for (const rateType of pmsRateTypes) {
            const rateCode = typeof rateType.id === "string" ? rateType.id.substring(0, 20) : String(rateType.id);
            const ratePlanData = {
              property_id: savedPropertyId,
              name: rateType.name || "Unnamed Rate",
              code: rateCode,
              description: rateType.description || null,
              is_active: true,
              min_stay: rateType.minStayDays || 1,
              requires_deposit: false,
              base_rate: rateType.baseRate || 0,
              pricing_model: canonicalPricingModel(rateType.pricingModel || rateType.priceType),
              adult_1_rate: rateType.adult1Rate ?? null,
              adult_2_rate: rateType.adult2Rate ?? null,
              teen_rate: rateType.teenRate ?? null,
              child_rate: rateType.childRate ?? null,
              infant_rate: rateType.infantRate ?? null,
            };

            let existingPlan: { id: string } | null = null;
            const fullId = String(rateType.id);
            const { data: idMatch } = await supabase
              .from("rolos_rate_plans")
              .select("id")
              .eq("property_id", savedPropertyId)
              .eq("id", fullId)
              .maybeSingle();

            if (idMatch) {
              existingPlan = idMatch;
            } else {
              const { data: codeMatch } = await supabase
                .from("rolos_rate_plans")
                .select("id")
                .eq("property_id", savedPropertyId)
                .eq("code", rateCode)
                .limit(1)
                .maybeSingle();
              existingPlan = codeMatch;
            }

            if (existingPlan) {
              const { error: updateErr } = await supabase
                .from("rolos_rate_plans")
                .update(ratePlanData)
                .eq("id", existingPlan.id);
              if (updateErr) console.warn("[ROL Sync] Rate plan update error:", updateErr);
            } else {
              // Rate Plans is the sole creator of commercial plans. Property Overview is a
              // compatibility mirror and may update an existing plan, but must never race the
              // database mirror/configurator by creating another one.
              console.warn(`[ROL Sync] Skipped missing mirrored rate plan "${rateType.name}"; create it in Rate Plans`);
            }
          }
          console.log(`[ROL Sync] Synced ${pmsRateTypes.length} rate types to rolos_rate_plans`);
        } catch (rateSyncErr) {
          console.warn("[ROL Sync] Rate plan sync error:", rateSyncErr);
        }
      }

      // Deactivate stale rolos_rate_plans (runs even when pmsRateTypes is empty to clean up all)
      if (isRolProperty && savedPropertyId && ratePlansChanged) {
        try {
          const { data: allExistingPlans } = await supabase
            .from("rolos_rate_plans")
            .select("id, code, name")
            .eq("property_id", savedPropertyId)
            .eq("is_active", true);

          if (allExistingPlans && allExistingPlans.length > 0) {
            const currentRateIds = new Set(pmsRateTypes.map((rt: any) => String(rt.id)));
            const currentRateCodes = new Set(
              pmsRateTypes.map((rt: any) => (typeof rt.id === "string" ? rt.id.substring(0, 20) : String(rt.id))),
            );

            const stalePlans = allExistingPlans.filter(
              (p) => !currentRateIds.has(p.id) && !currentRateCodes.has(p.code),
            );

            for (const stale of stalePlans) {
              await supabase.from("rolos_rate_plans").update({ is_active: false }).eq("id", stale.id);
              console.log(`[ROL Sync] Deactivated removed rate plan: ${stale.name}`);
            }
          }
        } catch (cleanupErr) {
          console.warn("[ROL Sync] Rate plan cleanup warning:", cleanupErr);
        }
      }

      // Auto-link rate plans to room types based on amenities linkedRateTypes
      if (isRolProperty && savedPropertyId && pmsRateTypes.length > 0 && (ratePlansChanged || roomsChanged)) {
        try {
          const { data: allPlans } = await supabase
            .from("rolos_rate_plans")
            .select("id, code, name")
            .eq("property_id", savedPropertyId);

          const { data: allRolosRoomTypes } = await supabase
            .from("rolos_room_types")
            .select("id, name")
            .eq("property_id", savedPropertyId)
            .eq("is_active", true);

          if (allPlans && allRolosRoomTypes) {
            const planByCode = new Map(allPlans.map((p) => [p.code, p.id]));
            const planByName = new Map(allPlans.map((p) => [p.name.toLowerCase(), p.id]));
            const rolosRtByName = new Map(allRolosRoomTypes.map((rt) => [rt.name.toLowerCase(), rt.id]));

            const linkRows: { rate_plan_id: string; room_type_id: string }[] = [];

            for (const room of roomTypes) {
              const rolosRtId = rolosRtByName.get((room.name || "").toLowerCase());
              if (!rolosRtId) continue;

              const linkedRates = (room as any).linkedRateTypes || (room as any).rates || [];
              for (const lr of Array.isArray(linkedRates) ? linkedRates : []) {
                const rateId = typeof lr === "string" ? lr : lr?.id;
                if (!rateId) continue;
                const rateCode = typeof rateId === "string" ? rateId.substring(0, 20) : String(rateId);
                const planId = planByCode.get(rateCode);
                if (planId) {
                  linkRows.push({ rate_plan_id: planId, room_type_id: rolosRtId });
                }
              }

              for (const rt of pmsRateTypes as any[]) {
                if (rt.linkedRoomId === room.id || rt.id === `wizard-rate-${room.id}`) {
                  const rtCode = typeof rt.id === "string" ? rt.id.substring(0, 20) : String(rt.id);
                  const planId = planByCode.get(rtCode) || planByName.get((rt.name || "").toLowerCase());
                  if (planId) {
                    linkRows.push({ rate_plan_id: planId, room_type_id: rolosRtId });

                    if (rt.baseRate) {
                      await supabase
                        .from("rolos_room_types")
                        .update({ default_rate: rt.baseRate })
                        .eq("id", rolosRtId)
                        .is("default_rate", null);
                    }
                  }
                }
              }
            }

            const uniqueLinks = Array.from(
              new Map(linkRows.map((l) => [`${l.rate_plan_id}-${l.room_type_id}`, l])).values(),
            );
            if (uniqueLinks.length > 0) {
              const { error: linkErr } = await supabase
                .from("rolos_rate_plan_room_types")
                .upsert(uniqueLinks, { onConflict: "rate_plan_id,room_type_id" });
              if (linkErr) console.warn("[ROL Sync] Rate-room link error:", linkErr);
              else console.log(`[ROL Sync] Linked ${uniqueLinks.length} rate plan → room type pairs`);
            }
          }
        } catch (linkErr) {
          console.warn("[ROL Sync] Rate-room linking warning:", linkErr);
        }
      }

      // Geocode BEFORE the channel delta, not after it.
      // The readiness gate blocks a static push while latitude/longitude are empty, so a
      // fire-and-forget geocode meant every address edit was parked and only delivered later
      // by the re-arm. Await it on a short budget: if it is slow or fails, the save proceeds
      // exactly as before and the delta parks as it used to.
      let geocodedCoords: { latitude: number; longitude: number } | null = null;
      if ((!latitude || !longitude) && formData.address && formData.city && formData.country) {
        const GEOCODE_BUDGET_MS = 8_000;
        try {
          const geocoded = await Promise.race([
            supabase.functions.invoke("geocode-property", {
              body: {
                property_id: savedPropertyId,
                address: formData.address,
                city: formData.city,
                country: formData.country,
                suburb: formData.suburb,
              },
            }),
            new Promise<null>((resolve) => setTimeout(() => resolve(null), GEOCODE_BUDGET_MS)),
          ]);
          const geocodeResult = geocoded?.data as
            | { success?: boolean; latitude?: number; longitude?: number; formatted_address?: string }
            | undefined;
          if (geocodeResult?.success && geocodeResult.latitude != null && geocodeResult.longitude != null) {
            setLatitude(geocodeResult.latitude);
            setLongitude(geocodeResult.longitude);
            // The edge function already wrote the coordinates onto the row; keep the local
            // snapshot in step so the next save does not see a phantom change.
            geocodedCoords = { latitude: geocodeResult.latitude, longitude: geocodeResult.longitude };
            loadedPropertyRowRef.current = {
              ...(loadedPropertyRowRef.current ?? {}),
              ...geocodedCoords,
            };

            toast({
              title: "Location Updated",
              description: `Map pin set to: ${geocodeResult.formatted_address ?? `${geocodeResult.latitude}, ${geocodeResult.longitude}`}`,
            });
          } else if (geocoded === null) {
            console.warn("[PropertyForm] geocoding exceeded its budget — the channel delta may park until it lands");
          }
        } catch (geocodeError) {
          console.warn("Geocoding failed:", geocodeError);
        }
      }


      // For new properties, navigate to the slug-based URL
      if (!isEditMode && savedProperty?.slug) {
        navigate(`/admin/properties/${savedProperty.slug}`, { replace: true });
      }

      // Readiness (score badge, checksheet, field borders, stepper) must reflect
      // the values we just saved without a page refresh.
      void queryClient.invalidateQueries({ queryKey: ["property-readiness"] });
      void queryClient.invalidateQueries({ queryKey: ["rolos-onboarding-distribution", savedPropertyId] });
      void queryClient.invalidateQueries({ queryKey: ["rolos-onboarding-phase", savedPropertyId] });

      // Portfolio commons: when the portfolio has auto-share enabled, propagate the
      // shared data sets (entity, banking, contacts, house rules, locale, RU defaults)
      // both ways without overwriting anything already captured.
      if (savedPropertyId) {
        void runAutoShare(savedPropertyId)
          .then((result) => {
            if (result && result.updatedGroups.length > 0) {
              const sets = `${result.updatedGroups.length} shared data set${result.updatedGroups.length === 1 ? "" : "s"}`;
              const props = `${result.updatedProperties} propert${result.updatedProperties === 1 ? "y" : "ies"}`;
              toast({
                title: "Portfolio commons synced",
                description: `${sets} pushed into ${props} in this portfolio. Existing values were left untouched.`,
              });
              void queryClient.invalidateQueries({ queryKey: ["property-readiness"] });
            }
          })
          .catch((commonsError) => console.error("Portfolio commons auto-share failed:", commonsError));
      }

      // The arrival policy draft is now stored — release it and let the panel re-read.
      if (savedPropertyId) {
        clearArrivalPolicyDraft(savedPropertyId);
        notifyArrivalPolicySaved(savedPropertyId);
      }

      persistedOwnerEmailRef.current = nextOwnerEmail;

      // Phase 2 ledger — mark only the sections this save actually changed as stale.
      // Fire-and-forget bookkeeping: it never blocks or fails the save.
      const changedSteps = derivePropertyStepsFromChanges(
        previousRow,
        propertyData as unknown as Record<string, unknown>,
      );
      // Channel-mandatory fields that moved in this save — these decide which channel
      // sections are pushed and what the delivery toast names.
      const changedChannelFields = deriveChangedChannelFields(
        previousRow,
        propertyData as unknown as Record<string, unknown>,
      );
      loadedPropertyRowRef.current = {
        ...(loadedPropertyRowRef.current ?? {}),
        ...(isEditMode ? propertyPatch : propertyData as unknown as Record<string, unknown>),
        // Coordinates written by the awaited geocode above must survive the patch merge.
        ...(geocodedCoords ?? {}),
      };

      if (roomsChanged) persistedRoomTypesRef.current = roomTypes;
      if (ratePlansChanged) persistedRateTypesRef.current = pmsRateTypes;
      if (changedSteps.length > 0) {
        // Mark stale AND re-grade locally, then repaint the wizard: correcting a
        // blocker must re-pass the step without any channel call.
        void regradeChannelStepsAfterSave(savedPropertyId, changedSteps).then(() => {
          void queryClient.invalidateQueries({ queryKey: ["channel-step-ledger", savedPropertyId] });
          void queryClient.invalidateQueries({ queryKey: ["rolos-onboarding-distribution", savedPropertyId] });
        });
      }


      const changedLabels = Array.from(new Set(changedChannelFields.map((field) => field.label)));
      // Never promise channel activity for a property that has not cleared the onboarding
      // gate — the push helper stays silent there, so the toast must say so too.
      const saveOutcome = changedLabels.length > 0 && savedPropertyId
        ? await channelSaveOutcomeCopy(savedPropertyId)
        : { willPush: false, sentence: "" };
      toast({
        title: propertyChanged ? "Property saved" : "No changes detected",
        description: changedLabels.length > 0
          ? saveOutcome.willPush
            ? `${changedLabels.join(", ")} saved; ${saveOutcome.sentence}`
            : `${changedLabels.join(", ")} saved. ${saveOutcome.sentence}`
          : propertyChanged
            ? "Local changes saved. No channel update is required."
            : "Everything is already up to date.",
      });

      // Mandatory channel fields changed → push the affected sections and confirm delivery
      // against the sync ledger before claiming success. Sections run sequentially inside the
      // helper so one save cannot trip the channel rate limit, and the whole watcher runs
      // outside the save path: a slow channel never holds up the editor.
      if (isEditMode && savedPropertyId && changedChannelFields.length > 0) {
        // Re-read the push gate so the countdown reflects this save straight away.
        setChannelGateRefresh((n) => n + 1);
        void pushChangedChannelFields(savedPropertyId, changedChannelFields, ({ title, description, variant }) =>
          toast({ title, description, variant }),
        )
          .catch((pushErr) => console.warn("[PropertyForm] channel push watcher failed:", pushErr))
          .finally(() => setChannelGateRefresh((n) => n + 1));
      }


      // Stay on current page after save - don't navigate away for edits
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        const errMsg = error instanceof Error ? error.message : "Unknown error";
        console.error("Property save error:", error);
        toast({
          title: "Error",
          description: isEditMode ? `Failed to update property: ${errMsg}` : `Failed to create property: ${errMsg}`,
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Helper to check if PMS has a configured property ID
  const hasPMSPropertyId = (pms: string): boolean => {
    switch (pms) {
      case "benson":
        return !!bensonPropertyCode;
      case "cloudbeds":
        return !!cloudbedsPropertyId;
      case "littlehotelier":
        return !!littlehotelierChannelCode;
      case "hotelbeds":
        return !!hotelbedsHotelCode;
      case "hyperguest":
        return !!hyperguestHotelId;
      case "nightsbridge":
        return !!formData.bb_id;
      default:
        return false;
    }
  };

  // Handler for syncing editorial content from PMS
  const [isSyncingEditorial, setIsSyncingEditorial] = useState(false);

  const handleSyncEditorial = async () => {
    setIsSyncEditorialDialogOpen(false);
    setIsSyncingEditorial(true);

    try {
      const { data, error } = await supabase.functions.invoke("sync-editorial", {
        body: {
          property_id: propertyId,
          pms_system: selectedPMS,
        },
      });

      if (error) throw error;

      if (data?.success === false) {
        throw new Error(data.error || "Sync failed");
      }

      // Show sync summary
      const fieldsUpdated = data?.fields_updated || [];
      const summary = data?.sync_summary || [];

      if (fieldsUpdated.length > 0) {
        toast({
          title: "Editorial Sync Complete",
          description: `Updated ${fieldsUpdated.length} field(s): ${fieldsUpdated.join(", ")}`,
        });

        // Reload property data to reflect changes
        if (propertyId) {
          const { data: refreshedProperty } = await supabase
            .from("properties")
            .select("*")
            .eq("id", propertyId)
            .single();

          if (refreshedProperty) {
            // Update form data with refreshed values
            setFormData((prev) => ({
              ...prev,
              name: refreshedProperty.name || prev.name,
              description: refreshedProperty.description || prev.description,
              address: refreshedProperty.address || prev.address,
              city: refreshedProperty.city || prev.city,
              country: refreshedProperty.country || prev.country,
            }));

            // Update coordinates if available
            if (refreshedProperty.latitude) setLatitude(refreshedProperty.latitude);
            if (refreshedProperty.longitude) setLongitude(refreshedProperty.longitude);

            // Update images if synced
            if (refreshedProperty.images && Array.isArray(refreshedProperty.images)) {
              setUploadedImages(refreshedProperty.images as string[]);
            }
          }
        }
      } else {
        // Show what was skipped
        const skippedFields = summary.filter((s: any) => s.action.includes("skipped")).map((s: any) => s.field);
        toast({
          title: "No Changes Made",
          description:
            data?.pms_notes ||
            `All fields were already populated or not available from ${getPMSDisplayName(selectedPMS)}.`,
        });
      }
    } catch (err: any) {
      console.error("Error syncing editorial:", err);
      toast({
        title: "Sync Failed",
        description: err.message || `Failed to sync editorial content from ${getPMSDisplayName(selectedPMS)}.`,
        variant: "destructive",
      });
    } finally {
      setIsSyncingEditorial(false);
    }
  };

  // Visible sections (shared IA) — drives both the hidden TabsList and the left rail
  /**
   * Section list mirrors ROL'OS Property Setup exactly (same order, same grouping)
   * plus the admin-only advanced sections. Nothing is hidden because of the
   * connected system — ROL'OS remains the source of truth for its sections, which
   * the banner below states, but the section stays reachable here.
   */
  const visibleSectionKeys = useMemo(
    () =>
      PROPERTY_SECTION_ORDER.filter((s) => {
        if (s.key === "onboarding" && !propertyId) return false;
        if (s.adminOnly && !(isAdmin || isDev || isFearlessLeader)) return false;
        return true;
      }).map((s) => s.key as string),
    [propertyId, isAdmin, isDev, isFearlessLeader],
  );

  const railGroups = useMemo(() => buildSectionGroups(visibleSectionKeys), [visibleSectionKeys]);

  const onSelectRequirement = useCallback(
    (section: string, item: { paintable?: boolean; key: string }) => {
      handleTabChange(section);
      if (item.paintable) window.setTimeout(() => focusRequirementField(item.key), 350);
    },
    [handleTabChange],
  );

  return (

    <FormShell embedded={embedded}>
      {isEditMode && propertyId && (
        <RuRateGateTimer propertyId={propertyId} refreshKey={channelGateRefresh} />
      )}
      <div className={embedded ? "property-form-container property-form-dense w-full p-2" : "property-form-container property-form-dense w-full"}>
        {/* Breadcrumb + Header — hidden in embed mode */}
        {!embedded && isEditMode && propertyId && (
          <GoLiveContinueBar propertyId={propertyId} />
        )}

        {!embedded && (
          <>
            <div className="flex items-center gap-1 text-xs mb-2 text-muted-foreground">
              <button
                onClick={() => navigate("/admin/property-overview")}
                className="hover:text-foreground transition-colors flex items-center gap-1"
              >
                <Home className="h-3 w-3" />
                Properties
              </button>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground font-medium">
                {isEditMode ? formData.name || "Edit Property" : "Add New Property"}
              </span>
              <ChevronRight className="h-3 w-3" />
              <span className="text-foreground">{getSectionLabel(activeTab)}</span>

            </div>

            {/* Header with Property Name and Actions */}
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold">{isEditMode ? "Edit Property" : "Add New Property"}</h1>
                {isEditMode && formData.name && (
                  <Badge variant="outline" className="px-2 py-1 text-xs gap-1 border-primary/50 bg-primary/5">
                    <Building2 className="h-3 w-3 text-primary" />
                    {formData.name}
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                {/* Connect Hostfully OAuth button - only for Hostfully properties without active connection */}
                {isEditMode && selectedPMS === "hostfully" && !ownerHostfullyCredential?.api_key && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 text-xs gap-1 border-blue-500/50 text-blue-600 hover:bg-blue-50"
                          onClick={() => handleConnectHostfullyOAuth()}
                          disabled={connectingHostfullyOAuth}
                        >
                          <Key className={cn("h-3 w-3", connectingHostfullyOAuth && "animate-pulse")} />
                          {connectingHostfullyOAuth ? "Connecting..." : "Connect Hostfully"}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-xs">
                        <p className="text-xs">
                          Authorize RoomsOnline to access your Hostfully account via OAuth. This enables syncing
                          properties, rates, and availability.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {/* Sync Editorial button - only visible when PMS supports sync and has property ID */}
                {isEditMode &&
                  selectedPMS &&
                  canSyncEditorial(selectedPMS) &&
                  hasPMSPropertyId(selectedPMS) &&
                  (() => {
                    const pmsCapability = getPMSEditorialCapability(selectedPMS);
                    return (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={() => !isSyncingEditorial && setIsSyncEditorialDialogOpen(true)}
                              disabled={isSyncingEditorial}
                            >
                              <Cloud className={cn("h-3 w-3", isSyncingEditorial && "animate-pulse")} />
                              {isSyncingEditorial ? "Syncing..." : pmsCapability?.syncButtonLabel || "Sync Editorial"}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs">
                              {isSyncingEditorial
                                ? "Syncing editorial content..."
                                : pmsCapability?.syncDescription ||
                                  `Fetch editorial content from ${getPMSDisplayName(selectedPMS)}.`}
                            </p>
                            {pmsCapability?.notes && (
                              <p className="text-xs text-muted-foreground mt-1">{pmsCapability.notes}</p>
                            )}
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    );
                  })()}
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleNavigate("/admin/property-overview")}
                >
                  Cancel
                </Button>
                {isDirty && (
                  <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={loading}>
                    <Save className="mr-1 h-3 w-3" />
                    {loading ? "Saving..." : "Save"}
                  </Button>
                )}
              </div>
            </div>
          </>
        )}

        {/* Blocker Banner */}
        {activationReadiness && !activationReadiness.passed && activationReadiness.blockers.length > 0 && (
          <Alert className="border-destructive/50 bg-destructive/5">
            <XCircle className="h-4 w-4 text-destructive" />
            <AlertDescription className="flex items-center gap-2 text-xs">
              <span className="font-medium text-destructive">
                {activationReadiness.blockers.length} blocker{activationReadiness.blockers.length > 1 ? "s" : ""}{" "}
                preventing activation
              </span>
              <span className="text-muted-foreground">—</span>
              <span className="text-muted-foreground">
                {activationReadiness.blockers.map((b) => b.name).join(" · ")}
              </span>
            </AlertDescription>
          </Alert>
        )}


        {/* Legacy readiness stepper/gates retired — the floating ROL'OS onboarding
            wizard now owns gating. Only the field-highlighting legend stays. */}
        {!embedded && (
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <RequirementLegend
              className="flex-1"
              mandatoryOutstanding={requirementMandatoryOutstanding}
              mandatoryTotal={requirementMandatoryTotal}
              recommendedOutstanding={requirementRecommendedOutstanding}
              recommendedTotal={requirementRecommendedTotal}
              propertyId={propertyId}
            />
          </div>
        )}

        <div
          className={
            embedded
              ? ""
              : cn(
                  "grid gap-4",
                  railCollapsed ? "lg:grid-cols-[48px_minmax(0,1fr)]" : "lg:grid-cols-[240px_minmax(0,1fr)]",
                )
          }
        >
          {!embedded && (
            <PropertySectionRail
              groups={railGroups}
              activeKey={activeTab}
              onSelect={handleTabChange}
              blockerKeys={tabsWithBlockers}
              requirementCounts={requirementCounts}
              onSelectRequirement={onSelectRequirement}
              collapsed={railCollapsed}
              onToggleCollapsed={toggleRailCollapsed}
            />
          )}


        <div ref={setRequirementRoot} className="min-w-0">
        <Suspense
          fallback={
            <div className="min-w-0 space-y-3 p-3" aria-hidden>
              <div className="h-8 w-48 animate-pulse rounded bg-muted" />
              <div className="h-64 w-full animate-pulse rounded bg-muted/60" />
            </div>
          }
        >
        <Tabs
          value={activeTab}
          onValueChange={handleTabChange}
          className={
            embedded ? "space-y-3" : "min-w-0 space-y-3 rounded-lg border bg-background p-3"
          }
        >
          <TabsList className="hidden">
            {visibleSectionKeys.map((key) => (
              <TabsTrigger key={key} value={key}>
                {getSectionLabel(key)}
              </TabsTrigger>
            ))}
          </TabsList>


          {/* Onboarding Tab - Full-screen wizard */}
          <TabsContent value="onboarding" className="mt-0">
            <DeferredWhen when={activeTab === "onboarding"}>{() => (
            <>
            {propertyId ? (
              <div className="rounded-lg border bg-card">
                <PropertyOnboardingWizard
                  propertyId={propertyId}
                  mode="embedded"
                  onComplete={() => setActiveTab("general")}
                />
              </div>
            ) : (
              <Card>
                <CardContent className="py-8 text-center">
                  <p className="text-muted-foreground">Save the property first to access the onboarding wizard.</p>
                </CardContent>
              </Card>
            )}
            </>
            )}</DeferredWhen>
          </TabsContent>

          <TabsContent value="general">
            <DeferredWhen when={activeTab === "general"}>{() => (
            <>
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Rates Overview Section - Show comprehensive rates setup */}
              {!selectedPMS && roomTypes.length > 0 && (
                <Collapsible defaultOpen={true}>
                  <Card className="border-primary/20">
                    <CollapsibleTrigger asChild>
                      <CardHeader className="py-2 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-primary" />
                            Rates Overview
                          </span>
                          <Badge variant="outline" className="text-xs">
                            {roomTypes.length} rooms, {pmsRateTypes.length} rate types, {seasons.length} seasons
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <CardContent className="py-4 px-4">
                        <RatesOverviewPanel
                          roomTypes={roomTypes}
                          rateTypes={pmsRateTypes}
                          seasons={seasons}
                          seasonRates={seasonRates}
                          currency={formData.currency || "ZAR"}
                          hasPMS={!!selectedPMS}
                          pmsName={selectedPMS ? getPMSDisplayName(selectedPMS) : undefined}
                          onNavigate={(tab, roomId) => {
                            setActiveTab(tab);
                            if (roomId && tab === "rooms") {
                              // Select the specific room when navigating
                              setTimeout(() => {
                                setSelectedRoomType(roomId);
                              }, 100);
                            }
                          }}
                        />
                      </CardContent>
                    </CollapsibleContent>
                  </Card>
                </Collapsible>
              )}

              {/* Offerings Section */}
              <Card>
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm">
                    {selectedPMS === "nightsbridge" ? "PMS Connection" : "Offerings"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  {selectedPMS !== "nightsbridge" && (
                    <>
                      <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="accommodation"
                            checked={isAccommodation}
                            onCheckedChange={(checked) => {
                              setIsAccommodation(checked as boolean);
                              setIsDirty(true);
                            }}
                          />
                          <Label htmlFor="accommodation" className="cursor-pointer text-xs">
                            Accommodation
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="venues"
                            checked={isVenues}
                            onCheckedChange={(checked) => handleVenuesChange(checked as boolean)}
                          />
                          <Label htmlFor="venues" className="cursor-pointer text-xs">
                            Venues
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="event"
                            checked={isEvent}
                            onCheckedChange={(checked) => handleEventChange(checked as boolean)}
                          />
                          <Label htmlFor="event" className="cursor-pointer text-xs">
                            Event/Wedding
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="conference"
                            checked={isConference}
                            onCheckedChange={(checked) => handleConferenceChange(checked as boolean)}
                          />
                          <Label htmlFor="conference" className="cursor-pointer text-xs">
                            Conference
                          </Label>
                        </div>
                      </div>

                      <Separator className="my-3" />
                    </>
                  )}

                  {/* Legacy readiness badge + RU push gate retired — handled by the
                      floating ROL'OS onboarding wizard. */}



                  {/* WETU Pin ID — always visible regardless of PMS */}
                  <div className="flex items-center gap-2 mt-1 mb-3 flex-wrap">
                    <Label htmlFor="wetu_id" className="text-xs whitespace-nowrap">
                      WETU Pin ID
                    </Label>
                    <Input
                      id="wetu_id"
                      value={formData.wetu_id ?? ""}
                      onChange={(e) => handleInputChange("wetu_id", e.target.value)}
                      placeholder="e.g. 12345"
                      className="h-7 text-xs max-w-[200px]"
                    />
                    {formData.wetu_id && propertyId && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 gap-1 text-xs"
                        onClick={async () => {
                          try {
                            const { data, error } = await supabase.functions.invoke("wetu-api", {
                              body: {
                                action: "import_to_property",
                                property_id: propertyId,
                                wetu_id: String(formData.wetu_id).trim(),
                              },
                            });
                            if (error) throw error;
                            if (!data?.success) throw new Error(data?.error || "Import failed");

                            // Re-hydrate local form state from DB so a subsequent
                            // Save doesn't overwrite the freshly-imported values.
                            const { data: fresh, error: refetchErr } = await supabase
                              .from("properties")
                              .select(
                                "description, short_description, images, amenities, latitude, longitude, address, city, country, external_metadata",
                              )
                              .eq("id", propertyId)
                              .single();
                            if (refetchErr) {
                              console.warn("[WETU] could not refresh form after import:", refetchErr.message);
                            } else if (fresh) {
                              setFormData((prev: any) => ({
                                ...prev,
                                description: fresh.description ?? prev.description,
                                short_description: fresh.short_description ?? prev.short_description,
                                images: fresh.images ?? prev.images,
                                amenities: fresh.amenities ?? prev.amenities,
                                latitude: fresh.latitude ?? prev.latitude,
                                longitude: fresh.longitude ?? prev.longitude,
                                address: fresh.address ?? prev.address,
                                city: fresh.city ?? prev.city,
                                country: fresh.country ?? prev.country,
                                external_metadata: fresh.external_metadata ?? prev.external_metadata,
                              }));
                              setIsDirty(false);
                            }

                            toast({
                              title: "WETU content imported",
                              description: `Updated: ${(data.updated_fields || []).join(", ") || "no new fields"}${data.image_count ? ` · ${data.image_count} images` : ""}`,
                            });
                          } catch (err: unknown) {
                            toast({
                              title: "WETU import failed",
                              description: err instanceof Error ? err.message : "Could not import from WETU",
                              variant: "destructive",
                            });
                          }
                        }}
                      >
                        <Cloud className="h-3 w-3" />
                        Import from WETU
                      </Button>
                    )}
                    <span className="text-[10px] text-muted-foreground">
                      Pulls description, images, amenities &amp; geo from WETU if availible.
                    </span>
                  </div>
                  <Separator className="my-3" />

                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-2">
                      <Label htmlFor="pms_system" className="text-xs whitespace-nowrap">
                        PMS
                      </Label>
                      <Select
                        value={selectedPMS || "none"}
                        onValueChange={(value) => {
                          const newPMS = value === "none" ? "" : value;

                          // Show warning when switching TO hostfully from non-hostfully without owner credential
                          if (newPMS === "hostfully" && selectedPMS !== "hostfully" && !ownerPmsCredentialId) {
                            setPreviousPMS(selectedPMS);
                            setShowHostfullyWarning(true);
                            return;
                          }

                          setSelectedPMS(newPMS);
                          // Auto-set isRolProperty when selecting roomsonline
                          if (newPMS === "roomsonline") {
                            setIsRolProperty(true);
                          } else if (newPMS && newPMS !== "roomsonline") {
                            setIsRolProperty(false);
                          }
                          setIsDirty(true);
                        }}
                      >
                        <SelectTrigger id="pms_system" className="h-7 text-xs w-[140px]">
                          <SelectValue placeholder="Select PMS" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">
                            <span className="flex items-center gap-1 text-xs">
                              <X className="h-3 w-3" />
                              None
                            </span>
                          </SelectItem>
                          {availablePMSSystems.map((pms) => {
                            const IconComponent = getPMSIcon(pms.system_type);
                            return (
                              <SelectItem key={pms.system_type} value={pms.system_type}>
                                <span className="flex items-center gap-1 text-xs">
                                  <IconComponent className="h-3 w-3" />
                                  {pms.name.replace(" API Key", "")}
                                </span>
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                      {selectedPMS && selectedPMS !== "none" && !isPMSFullyIntegrated(selectedPMS) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <AlertTriangle className="h-4 w-4 text-amber-500 cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-xs">
                              <p className="text-xs">
                                {getPMSIntegrationLevel(selectedPMS) === "partial"
                                  ? `${getPMSDisplayName(selectedPMS)} integration is partially implemented. Some features may not work.`
                                  : `${getPMSDisplayName(selectedPMS)} integration has not been implemented yet.`}
                              </p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>

                    {selectedPMS === "nightsbridge" && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="bb_id" className="text-xs">
                          BBID
                        </Label>
                        <Input
                          id="bb_id"
                          value={formData.bb_id}
                          onChange={(e) => handleInputChange("bb_id", e.target.value)}
                          placeholder="13402"
                          className="h-7 text-xs w-24"
                        />
                      </div>
                    )}

                    {selectedPMS === "semper" && (
                      <>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="venue_id" className="text-xs">
                            Venue
                          </Label>
                          <Input
                            id="venue_id"
                            value={formData.venue_id}
                            onChange={(e) => handleInputChange("venue_id", e.target.value)}
                            placeholder="ID"
                            className="h-7 text-xs w-20"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="channel_id" className="text-xs">
                            Channel
                          </Label>
                          <Input
                            id="channel_id"
                            value={formData.channel_id}
                            onChange={(e) => handleInputChange("channel_id", e.target.value)}
                            placeholder="ID"
                            className="h-7 text-xs w-20"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="account_id" className="text-xs">
                            Account
                          </Label>
                          <Input
                            id="account_id"
                            value={formData.account_id}
                            onChange={(e) => handleInputChange("account_id", e.target.value)}
                            placeholder="ID"
                            className="h-7 text-xs w-20"
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="agent_id" className="text-xs">
                            Agent
                          </Label>
                          <Input
                            id="agent_id"
                            value={formData.agent_id}
                            onChange={(e) => handleInputChange("agent_id", e.target.value)}
                            placeholder="ID"
                            className="h-7 text-xs w-20"
                          />
                        </div>
                      </>
                    )}

                    {selectedPMS === "benson" && (
                      <>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="benson_property_code" className="text-xs whitespace-nowrap">
                            Benson Code *
                          </Label>
                          <Input
                            id="benson_property_code"
                            value={bensonPropertyCode}
                            onChange={(e) => {
                              setBensonPropertyCode(e.target.value);
                              setIsDirty(true);
                            }}
                            placeholder="Property code"
                            className="h-7 text-xs w-40"
                            required
                          />
                        </div>
                        {bensonPropertyCode && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs gap-1"
                            onClick={syncFromBenson}
                            disabled={isSyncingPms}
                          >
                            <RefreshCw className={cn("h-3 w-3", isSyncingPms && "animate-spin")} />
                            {isSyncingPms ? "Syncing..." : "Sync"}
                          </Button>
                        )}
                      </>
                    )}

                    {selectedPMS === "cloudbeds" && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="cloudbeds_property_id" className="text-xs whitespace-nowrap">
                          Cloudbeds Property ID *
                        </Label>
                        <Input
                          id="cloudbeds_property_id"
                          value={cloudbedsPropertyId}
                          onChange={(e) => {
                            setCloudbedsPropertyId(e.target.value);
                            setIsDirty(true);
                          }}
                          placeholder="Property ID"
                          className="h-7 text-xs w-40"
                          required
                        />
                      </div>
                    )}

                    {selectedPMS === "littlehotelier" && (
                      <>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="littlehotelier_channel_code" className="text-xs whitespace-nowrap">
                            Channel Code *
                          </Label>
                          <Input
                            id="littlehotelier_channel_code"
                            value={littlehotelierChannelCode}
                            onChange={(e) => {
                              setLittlehotelierChannelCode(e.target.value);
                              setIsDirty(true);
                            }}
                            placeholder="Channel code"
                            className="h-7 text-xs w-32"
                            required
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="littlehotelier_region" className="text-xs whitespace-nowrap">
                            Region
                          </Label>
                          <Select
                            value={littlehotelierRegion}
                            onValueChange={(v) => {
                              setLittlehotelierRegion(v as "apac" | "emea");
                              setIsDirty(true);
                            }}
                          >
                            <SelectTrigger className="h-7 text-xs w-24">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="apac">APAC</SelectItem>
                              <SelectItem value="emea">EMEA</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </>
                    )}

                    {selectedPMS === "hotelbeds" && (
                      <div className="flex items-center gap-2">
                        <Label htmlFor="hotelbeds_hotel_code" className="text-xs whitespace-nowrap">
                          Hotel Code *
                        </Label>
                        <Input
                          id="hotelbeds_hotel_code"
                          value={hotelbedsHotelCode}
                          onChange={(e) => {
                            setHotelbedsHotelCode(e.target.value);
                            setIsDirty(true);
                          }}
                          placeholder="HotelBeds hotel code"
                          className="h-7 text-xs w-40"
                          required
                        />
                      </div>
                    )}

                    {/* HyperGuest is currently parked — UI hidden but state and save paths preserved. */}
                    {false &&
                      (selectedPMS === "hyperguest" || selectedPMS === "rolos" || selectedPMS === "roomsonline") && (
                        <div className="flex items-center gap-2">
                          <Label htmlFor="hyperguest_hotel_id" className="text-xs whitespace-nowrap">
                            HyperGuest Hotel ID{selectedPMS === "hyperguest" ? " *" : ""}
                          </Label>
                          <Input
                            id="hyperguest_hotel_id"
                            value={hyperguestHotelId}
                            onChange={(e) => {
                              setHyperguestHotelId(e.target.value);
                              setIsDirty(true);
                            }}
                            placeholder="e.g. 19912"
                            className="h-7 text-xs w-40"
                            required={selectedPMS === "hyperguest"}
                          />
                          <HyperGuestPropertyLookup
                            propertyId={propertyId}
                            propertyName={formData.name}
                            currentHotelId={hyperguestHotelId}
                            onSelect={(hotelId) => {
                              setHyperguestHotelId(hotelId);
                              setIsDirty(true);
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {selectedPMS === "hyperguest"
                              ? "Sandbox certification hotel: 19912"
                              : "Optional — links this ROL'OS property to a HyperGuest hotel for distribution."}
                          </span>
                          {propertyId && hyperguestHotelId && (
                            <HyperGuestSyncReflectionButton propertyId={propertyId} />
                          )}
                        </div>
                      )}

                    {/* Beds24 lookup + ID hidden per request; state and save paths preserved. */}
                    {false &&
                      (selectedPMS === "beds24" || selectedPMS === "rolos" || selectedPMS === "roomsonline") && (
                        <div className="flex items-center gap-2">
                          <Label htmlFor="beds24_property_id" className="text-xs whitespace-nowrap">
                            Beds24 Property ID{selectedPMS === "beds24" ? " *" : ""}
                          </Label>
                          <Input
                            id="beds24_property_id"
                            value={beds24PropertyId}
                            onChange={(e) => {
                              setBeds24PropertyId(e.target.value);
                              setIsDirty(true);
                            }}
                            placeholder="e.g. 123456"
                            className="h-7 text-xs w-40"
                            required={selectedPMS === "beds24"}
                          />
                          <Beds24PropertyLookup
                            propertyId={propertyId}
                            propertyName={formData.name}
                            currentPropertyId={beds24PropertyId}
                            onSelect={(b24Id) => {
                              setBeds24PropertyId(b24Id);
                              setIsDirty(true);
                            }}
                          />
                          <span className="text-[10px] text-muted-foreground">
                            {selectedPMS === "beds24"
                              ? "Required — your Beds24 property ID."
                              : "Optional — links this ROL'OS property to a Beds24 property for distribution."}
                          </span>
                        </div>
                      )}

                    {selectedPMS === "hostfully" && !authLoading && isOwnerUser && (
                      <div className="w-full mt-2">
                        <OwnerPMSConnectionCard
                          ownerId={user?.id || ""}
                          ownerName={profile?.full_name || profile?.email || ""}
                          ownerEmail={profile?.email || user?.email || ""}
                          existingCredential={ownerHostfullyCredential}
                          onCredentialChange={handleOwnerCredentialChange}
                        />
                      </div>
                    )}

                    {/* Consolidated Hostfully Sync button for admin/dev */}
                    {selectedPMS === "hostfully" &&
                      !authLoading &&
                      propertyId &&
                      (ownerPmsCredentialId || hostfullyPropertyUid) &&
                      (isAdmin || isDev || isFearlessLeader) && (
                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              variant="default"
                              size="sm"
                              className="h-7 text-xs gap-1"
                              onClick={handleFullHostfullySync}
                              disabled={fullSyncingHostfully || importingHostfullyRooms}
                            >
                              <RefreshCw className={cn("h-3 w-3", fullSyncingHostfully && "animate-spin")} />
                              {fullSyncingHostfully ? "Syncing..." : "Sync Hostfully Data"}
                            </Button>
                            {hostfullyRoomCount > 0 && (
                              <Badge variant="secondary" className="text-xs">
                                {hostfullyRoomCount} rooms
                              </Badge>
                            )}
                          </div>
                          {syncProgress && (
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <div className="h-1 w-20 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-primary transition-all duration-300"
                                  style={{
                                    width: `${syncProgress.total > 0 ? (syncProgress.current / syncProgress.total) * 100 : 0}%`,
                                  }}
                                />
                              </div>
                              <span>{syncProgress.phase}</span>
                            </div>
                          )}
                        </div>
                      )}

                    {lastPmsSync && selectedPMS === "benson" && (
                      <span className="text-xs text-muted-foreground">Synced: {lastPmsSync.toLocaleString()}</span>
                    )}

                    <div className="flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label htmlFor="google_place_id" className="cursor-help flex items-center gap-1 text-xs">
                              Google ID <Info className="h-3 w-3 text-muted-foreground" />
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-xs">
                            <p className="text-xs font-medium mb-1">Google Place ID</p>
                            <p className="text-[11px] text-muted-foreground mb-1">Used for reviews and Maps embed.</p>
                            <ol className="text-[11px] list-decimal pl-4 space-y-0.5">
                              <li>Open Google Maps and search your property.</li>
                              <li>Click your property so its panel opens.</li>
                              <li>Copy the full URL from the address bar.</li>
                              <li>
                                Click <strong>Paste Google URL</strong> and paste.
                              </li>
                            </ol>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Input
                        id="google_place_id"
                        value={googlePlaceId}
                        onChange={(e) => {
                          setGooglePlaceId(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="ChIJ... or numeric"
                        className="h-7 text-xs w-40"
                      />
                      <GooglePlaceIdPastePopover
                        onExtract={(id) => {
                          setGooglePlaceId(id);
                          setIsDirty(true);
                        }}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Label htmlFor="tripadvisor_id" className="cursor-help flex items-center gap-1 text-xs">
                              TripAdvisor <Info className="h-3 w-3 text-muted-foreground" />
                            </Label>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">Number after "d/" in TripAdvisor URL</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      <Input
                        id="tripadvisor_id"
                        value={tripadvisorId}
                        onChange={(e) => {
                          setTripadvisorId(e.target.value);
                          setIsDirty(true);
                        }}
                        placeholder="123456"
                        className="h-7 text-xs w-24"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Property, Address & Map — full-width stacked (desktop density pass) */}
              <div className="flex flex-col gap-3">
                {/* Property & Address */}
                <div className="flex flex-col gap-3">

                  {/* Property Section */}
                  <Card>
                    <CardHeader className="py-2 px-4">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Property</span>
                        {selectedPMS && !isRolProperty && (
                          <div className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                            <div className="w-3 h-3 rounded bg-primary/10 border border-primary/30" />
                            <Cloud className="h-3 w-3" />
                            <span>{getPMSDisplayName(selectedPMS)} synced</span>
                          </div>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 px-4 space-y-3">
                      {/* Row 1 */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4 xl:grid-cols-5">

                        <div className="flex flex-col gap-1">
                          <Label htmlFor="name" className="text-xs">
                            Name *
                          </Label>
                          <Input
                            id="name"
                            value={formData.name}
                            onChange={(e) => handleInputChange("name", e.target.value)}
                            placeholder="Property name"
                            required
                            disabled={isFieldPopulatedByPMS("name", selectedPMS)}
                            className={cn(
                              "h-7 text-xs",
                              getPMSFieldClass("name", selectedPMS),
                              isFieldPopulatedByPMS("name", selectedPMS) && "cursor-not-allowed",
                            )}
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="property-slug" className="text-xs">
                            Slug
                          </Label>
                          <Input
                            id="property-slug"
                            value={propertySlug || ""}
                            readOnly
                            placeholder="Set on first save"
                            className="h-7 text-xs font-mono cursor-not-allowed bg-muted/40"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="property_type" className="text-xs flex items-center">
                            Type *
                            <ContextualHelp table="properties" field="property_type" />
                          </Label>
                          <Select
                            value={formData.property_type}
                            onValueChange={(value) => handleInputChange("property_type", value)}
                          >
                            <SelectTrigger id="property_type" className="h-7 text-xs">
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hotel">Hotel</SelectItem>
                              <SelectItem value="boutique_hotel">Boutique Hotel</SelectItem>
                              <SelectItem value="guesthouse">Guest House</SelectItem>
                              <SelectItem value="bnb">B&B</SelectItem>
                              <SelectItem value="lodge">Lodge</SelectItem>
                              <SelectItem value="game_lodge">Game Lodge</SelectItem>
                              <SelectItem value="safari_lodge">Safari Lodge</SelectItem>
                              <SelectItem value="resort">Resort</SelectItem>
                              <SelectItem value="villa">Villa</SelectItem>
                              <SelectItem value="apartment">Apartment</SelectItem>
                              <SelectItem value="self_catering">Self Catering</SelectItem>
                              <SelectItem value="chalet">Chalet</SelectItem>
                              <SelectItem value="cottage">Cottage</SelectItem>
                              <SelectItem value="cabin">Cabin</SelectItem>
                              <SelectItem value="backpackers">Backpackers</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {(isAdmin || isDev || isFearlessLeader) && (
                          <div className="flex flex-col gap-1">
                            <Label className="text-xs">Flags</Label>
                            <div className="flex h-8 items-center gap-4">
                              <div className="flex items-center gap-1.5">
                                <Checkbox
                                  id="is_rol_property"
                                  checked={isRolProperty}
                                  onCheckedChange={(checked) => {
                                    setIsRolProperty(checked as boolean);
                                    setIsDirty(true);
                                  }}
                                />
                                <Label htmlFor="is_rol_property" className="cursor-pointer text-xs">
                                  ROL
                                </Label>
                              </div>
                              <div className="flex items-center gap-1.5">
                                <Checkbox
                                  id="is_test_property"
                                  checked={isTestProperty}
                                  onCheckedChange={(checked) => {
                                    // Marker only — it must never change trading or channel behaviour.
                                    setIsTestProperty(checked as boolean);
                                    setIsDirty(true);
                                  }}
                                />
                                <Label
                                  htmlFor="is_test_property"
                                  className="cursor-pointer whitespace-nowrap text-xs text-orange-600"
                                  title="Marker only: the property behaves normally everywhere, including channel and Rentals United syncs."
                                >
                                  ⚠ Test
                                </Label>
                              </div>
                            </div>
                          </div>
                        )}

                        {(isAdmin || isDev || isFearlessLeader) && (
                          <div className="flex flex-col gap-1 md:col-span-2">
                            <Label className="text-xs">Trading status</Label>
                            <div className="flex items-start gap-2 rounded-md border border-border bg-secondary px-3 py-2">
                              <Switch
                                id="is_trading"
                                checked={isTrading}
                                onCheckedChange={(checked) => {
                                  setIsTrading(checked);
                                  setIsDirty(true);
                                }}
                              />
                              <div className="flex flex-col gap-0.5">
                                <Label htmlFor="is_trading" className="cursor-pointer text-xs font-medium">
                                  Trading — include in counts and metrics
                                </Label>
                                <p className="text-[11px] leading-snug text-muted-foreground">
                                  {isTrading
                                    ? "Counted in dashboards, occupancy, forecasts and revenue reporting."
                                    : "Stale inventory: fully editable and connectable, but excluded from all dashboards and metrics until it genuinely trades."}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}


                        <div className="flex flex-col gap-1">
                          <Label htmlFor="telephone" className="text-xs">
                            Telephone
                          </Label>
                          <Input
                            id="telephone"
                            value={formData.telephone}
                            onChange={(e) => handleInputChange("telephone", e.target.value)}
                            placeholder="+27..."
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="contact_email" className="text-xs">
                            Contact Email *
                          </Label>
                          <Input
                            id="contact_email"
                            type="email"
                            value={formData.contact_email}
                            onChange={(e) => handleInputChange("contact_email", e.target.value)}
                            placeholder="email@example.com"
                            required
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>
                      {/* Row 2 */}
                      <div className="grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4 xl:grid-cols-5">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="currency" className="text-xs">
                            Currency *
                          </Label>
                          <Select
                            value={formData.currency}
                            onValueChange={(value) => handleInputChange("currency", value)}
                          >
                            <SelectTrigger id="currency" className="h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ZAR">ZAR</SelectItem>
                              <SelectItem value="USD">USD</SelectItem>
                              <SelectItem value="EUR">EUR</SelectItem>
                              <SelectItem value="GBP">GBP</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="owner_email" className="text-xs">
                            Owner
                          </Label>
                          <Popover open={ownerSearchOpen} onOpenChange={setOwnerSearchOpen}>
                            <PopoverTrigger asChild>
                              <Button
                                variant="outline"
                                role="combobox"
                                aria-expanded={ownerSearchOpen}
                                className="h-7 text-xs justify-between w-full font-normal"
                              >
                                {formData.owner_email
                                  ? owners.find((o) => o.email === formData.owner_email)?.full_name ||
                                    formData.owner_email
                                  : "Select owner…"}
                                <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-[320px] p-0" align="start">
                              <Command>
                                <CommandInput placeholder="Search by name, email or phone…" className="text-xs h-8" />
                                <CommandList>
                                  <CommandEmpty className="py-3 text-xs text-center text-muted-foreground">
                                    No owner found.
                                  </CommandEmpty>
                                  <CommandGroup>
                                    {/* Show current owner if not in profiles list */}
                                    {formData.owner_email && !owners.find((o) => o.email === formData.owner_email) && (
                                      <CommandItem
                                        value={formData.owner_email}
                                        onSelect={() => {
                                          setOwnerSearchOpen(false);
                                        }}
                                        className="text-xs"
                                      >
                                        <Check className={cn("mr-2 h-3 w-3", "opacity-100")} />
                                        <div className="flex flex-col">
                                          <span>{formData.owner_email}</span>
                                          <span className="text-[10px] text-muted-foreground">Profile pending</span>
                                        </div>
                                      </CommandItem>
                                    )}
                                    {owners.map((owner) => (
                                      <CommandItem
                                        key={owner.id}
                                        value={`${owner.full_name || ""} ${owner.email} ${owner.phone || ""}`}
                                        onSelect={() => {
                                          handleInputChange("owner_email", owner.email);
                                          handleInputChange("owner_name", owner.full_name || "");
                                          setOwnerSearchOpen(false);
                                        }}
                                        className="text-xs"
                                      >
                                        <Check
                                          className={cn(
                                            "mr-2 h-3 w-3",
                                            formData.owner_email === owner.email ? "opacity-100" : "opacity-0",
                                          )}
                                        />
                                        <div className="flex flex-col min-w-0">
                                          <span className="font-medium truncate">{owner.full_name || "—"}</span>
                                          <span className="text-[10px] text-muted-foreground truncate">
                                            {owner.email}
                                          </span>
                                          {owner.phone && (
                                            <span className="text-[10px] text-muted-foreground truncate">
                                              {owner.phone}
                                            </span>
                                          )}
                                        </div>
                                      </CommandItem>
                                    ))}
                                  </CommandGroup>
                                </CommandList>
                              </Command>
                            </PopoverContent>
                          </Popover>
                        </div>
                        {/* Linked Additional Owners */}
                        {propertyId && (isAdmin || isDev || isFearlessLeader) && (
                          <div className="flex flex-col gap-1 col-span-2">
                            <Label className="text-xs">Additional Owners</Label>
                            {linkedOwners.length > 0 && (
                              <div className="flex flex-wrap gap-1 mb-1">
                                {linkedOwners.map((lo) => (
                                  <Badge key={lo.id} variant="secondary" className="text-xs gap-1 pr-1">
                                    {lo.owner_name || lo.owner_email}
                                    <button
                                      type="button"
                                      className="ml-0.5 hover:text-destructive"
                                      onClick={async () => {
                                        const { error } = await supabase
                                          .from("property_owners")
                                          .delete()
                                          .eq("id", lo.id);
                                        if (!error) {
                                          setLinkedOwners((prev) => prev.filter((o) => o.id !== lo.id));
                                          toast({
                                            title: "Owner removed",
                                            description: `${lo.owner_email} unlinked from property`,
                                          });
                                        }
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </button>
                                  </Badge>
                                ))}
                              </div>
                            )}
                            <div className="relative">
                              <Input
                                placeholder="Search owners to add..."
                                value={linkedOwnerSearch}
                                onChange={(e) => setLinkedOwnerSearch(e.target.value)}
                                className="h-7 text-xs"
                              />
                              {linkedOwnerSearch.length >= 2 && (
                                <div className="absolute z-50 top-full mt-1 w-full bg-popover border rounded-md shadow-lg max-h-40 overflow-y-auto">
                                  {owners
                                    .filter((o) => {
                                      // Exclude primary owner and already linked
                                      if (o.email === formData.owner_email) return false;
                                      if (linkedOwners.some((lo) => lo.user_id === o.id)) return false;
                                      const q = linkedOwnerSearch.toLowerCase();
                                      return (
                                        o.email?.toLowerCase().includes(q) || o.full_name?.toLowerCase().includes(q)
                                      );
                                    })
                                    .slice(0, 8)
                                    .map((o) => (
                                      <button
                                        key={o.id}
                                        type="button"
                                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent flex justify-between items-center"
                                        onClick={async () => {
                                          const { data: inserted, error } = await supabase
                                            .from("property_owners")
                                            .insert({
                                              property_id: propertyId,
                                              user_id: o.id,
                                              owner_email: o.email,
                                              owner_name: o.full_name || null,
                                              added_by: user?.id,
                                            })
                                            .select("id, user_id, owner_email, owner_name")
                                            .single();
                                          if (!error && inserted) {
                                            setLinkedOwners((prev) => [...prev, inserted]);
                                            setLinkedOwnerSearch("");
                                            toast({
                                              title: "Owner linked",
                                              description: `${o.full_name || o.email} added as additional owner`,
                                            });
                                          } else if (error) {
                                            toast({
                                              title: "Failed to link",
                                              description: error.message,
                                              variant: "destructive",
                                            });
                                          }
                                        }}
                                      >
                                        <span>{o.full_name || o.email}</span>
                                        <span className="text-muted-foreground">{o.email}</span>
                                      </button>
                                    ))}
                                  {owners.filter((o) => {
                                    if (o.email === formData.owner_email) return false;
                                    if (linkedOwners.some((lo) => lo.user_id === o.id)) return false;
                                    const q = linkedOwnerSearch.toLowerCase();
                                    return o.email?.toLowerCase().includes(q) || o.full_name?.toLowerCase().includes(q);
                                  }).length === 0 && (
                                    <div className="px-3 py-2 text-xs text-muted-foreground">
                                      No matching owners found
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                        <div className="flex flex-col gap-1 col-span-2">
                          <Label htmlFor="property_url" className="text-xs">
                            Property Website
                          </Label>
                          <div className="flex gap-2">
                            <Input
                              id="property_url"
                              type="url"
                              value={formData.property_url}
                              onChange={(e) => handleInputChange("property_url", e.target.value)}
                              placeholder="https://www.explorersclub.co.za/"
                              className="h-7 text-xs flex-1"
                            />
                            {formData.property_url?.startsWith("http") && (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={async () => {
                                  setWebsiteSyncing(true);
                                  try {
                                    const existingData = {
                                      telephone: formData.telephone,
                                      contact_email: formData.contact_email,
                                      address: formData.address,
                                      suburb: formData.suburb,
                                      city: formData.city,
                                      country: formData.country,
                                      postal_code: formData.postal_code,
                                      description: formData.description,
                                      restaurants_cafes: formData.restaurants_cafes,
                                      public_transport: formData.public_transport,
                                      closest_airport: formData.closest_airport,
                                      facilities: selectedFacilities,
                                    };
                                    const additionalUrls = [sourceUrl2, sourceUrl3].filter(Boolean);
                                    const result = await syncFromWebsite(
                                      propertyId || "",
                                      formData.property_url || "",
                                      existingData,
                                      tripadvisorId || undefined,
                                      additionalUrls.length > 0 ? additionalUrls : undefined,
                                      googlePlaceId || undefined,
                                    );
                                    if (result.success && result.suggestions && result.suggestions.length > 0) {
                                      setWebsiteSyncSuggestions(result.suggestions);
                                      setWebsiteSyncUrl(result.scrapedUrl || formData.property_url || "");
                                      setWebsiteSyncModalOpen(true);
                                    } else if (
                                      result.success &&
                                      (!result.suggestions || result.suggestions.length === 0)
                                    ) {
                                      toast({
                                        title: "No suggestions found",
                                        description: "Could not extract any new information from the website.",
                                      });
                                    } else {
                                      toast({
                                        title: "Sync failed",
                                        description: result.error || "Failed to sync from website",
                                        variant: "destructive",
                                      });
                                    }
                                  } catch (err) {
                                    console.error("Website sync error:", err);
                                    toast({
                                      title: "Sync failed",
                                      description: "An unexpected error occurred",
                                      variant: "destructive",
                                    });
                                  } finally {
                                    setWebsiteSyncing(false);
                                  }
                                }}
                                disabled={websiteSyncing}
                                className="h-7 gap-1 text-xs"
                              >
                                {websiteSyncing ? (
                                  <>
                                    <RefreshCw className="h-3 w-3 animate-spin" />
                                    Scanning...
                                  </>
                                ) : (
                                  <>
                                    <Sparkles className="h-3 w-3" />
                                    Auto-fill
                                  </>
                                )}
                              </Button>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Scan the website to auto-fill empty fields. Add additional URLs below for more data sources.
                          </p>
                        </div>

                        {/* Additional Source URLs */}
                        <div className="space-y-1.5 md:col-span-2">
                          <Label className="whitespace-nowrap text-xs text-muted-foreground">
                            Additional source URLs (optional)
                          </Label>
                          <div className="grid gap-1.5 md:grid-cols-2">

                          <Input
                            type="url"
                            value={sourceUrl2}
                            onChange={(e) => {
                              setSourceUrl2(e.target.value);
                              setIsDirty(true);
                            }}
                            placeholder="https://additional-source-1.com"
                            className="h-7 text-xs"
                          />
                          <Input
                            type="url"
                            value={sourceUrl3}
                            onChange={(e) => {
                              setSourceUrl3(e.target.value);
                              setIsDirty(true);
                            }}
                            placeholder="https://additional-source-2.com"
                            className="h-7 text-xs"
                          />
                          </div>
                        </div>

                      </div>
                    </CardContent>
                  </Card>

                  {/* Address Section */}
                  <Card>
                    <CardHeader className="py-2 px-4">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Address</span>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="no_street_address" className="text-xs text-muted-foreground font-normal">
                            No street address?
                          </Label>
                          <Switch
                            id="no_street_address"
                            checked={noStreetAddress}
                            onCheckedChange={(checked) => {
                              setNoStreetAddress(checked);
                              setIsDirty(true);
                            }}
                          />
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 px-4">
                      {!noStreetAddress && (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                          {/* Street */}
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="address" className="text-xs">
                              Street *
                            </Label>
                            <Input
                              id="address"
                              value={formData.address}
                              onChange={(e) => handleInputChange("address", e.target.value)}
                              placeholder="Street address"
                              required={!noStreetAddress}
                              disabled={isFieldPopulatedByPMS("address", selectedPMS)}
                              className={cn(
                                "h-7 text-xs",
                                getPMSFieldClass("address", selectedPMS),
                                isFieldPopulatedByPMS("address", selectedPMS) && "cursor-not-allowed",
                              )}
                            />
                          </div>
                          {/* Suburb */}
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="suburb" className="text-xs">
                              Suburb
                            </Label>
                            <Input
                              id="suburb"
                              value={formData.suburb}
                              onChange={(e) => handleInputChange("suburb", e.target.value)}
                              placeholder="Suburb"
                              className="h-7 text-xs"
                            />
                          </div>
                          {/* City */}
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="city" className="text-xs">
                              City *
                            </Label>
                            <Input
                              id="city"
                              value={formData.city}
                              onChange={(e) => handleInputChange("city", e.target.value)}
                              placeholder="City"
                              required={!noStreetAddress}
                              disabled={isFieldPopulatedByPMS("city", selectedPMS)}
                              className={cn(
                                "h-7 text-xs",
                                getPMSFieldClass("city", selectedPMS),
                                isFieldPopulatedByPMS("city", selectedPMS) && "cursor-not-allowed",
                              )}
                            />
                          </div>
                          {/* Country */}
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="country" className="text-xs">
                              Country *
                            </Label>
                            <Popover open={countryOpen} onOpenChange={setCountryOpen}>
                              <PopoverTrigger asChild>
                                <Button
                                  variant="outline"
                                  role="combobox"
                                  aria-expanded={countryOpen}
                                  className={cn(
                                    "h-7 text-xs w-full justify-between font-normal",
                                    getPMSFieldClass("country", selectedPMS),
                                  )}
                                  disabled={isFieldPopulatedByPMS("country", selectedPMS)}
                                >
                                  {formData.country || "Select country..."}
                                  <ChevronsUpDown className="ml-2 h-3 w-3 shrink-0 opacity-50" />
                                </Button>
                              </PopoverTrigger>
                              <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                                <Command>
                                  <CommandInput placeholder="Search country..." />
                                  <CommandList>
                                    <CommandEmpty>No country found.</CommandEmpty>
                                    <CommandGroup>
                                      {COUNTRY_OPTIONS.map((c) => (
                                        <CommandItem
                                          key={c.value}
                                          value={c.label}
                                          onSelect={() => {
                                            handleInputChange("country", c.label);
                                            setCountryOpen(false);
                                          }}
                                        >
                                          <Check
                                            className={cn(
                                              "mr-2 h-3 w-3",
                                              formData.country === c.label ? "opacity-100" : "opacity-0",
                                            )}
                                          />
                                          {c.label}
                                        </CommandItem>
                                      ))}
                                    </CommandGroup>
                                  </CommandList>
                                </Command>
                              </PopoverContent>
                            </Popover>
                          </div>
                          {/* Postal Code */}
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="postal_code" className="text-xs">
                              Code
                            </Label>
                            <Input
                              id="postal_code"
                              value={formData.postal_code}
                              onChange={(e) => handleInputChange("postal_code", e.target.value)}
                              placeholder="Postal code"
                              disabled={isFieldPopulatedByPMS("postal_code", selectedPMS)}
                              className={cn(
                                "h-7 text-xs",
                                getPMSFieldClass("postal_code", selectedPMS),
                                isFieldPopulatedByPMS("postal_code", selectedPMS) && "cursor-not-allowed",
                              )}
                            />
                          </div>
                        </div>
                      )}

                      {/* GPS Coordinates & Google Maps Link — always visible */}
                      <div
                        className={cn(
                          "grid gap-3 mt-3",
                          noStreetAddress ? "grid-cols-1" : "grid-cols-2 md:grid-cols-4",
                        )}
                      >
                        {/* Latitude */}
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="latitude_input" className="text-xs flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-primary" />
                            Latitude
                          </Label>
                          <Input
                            id="latitude_input"
                            type="number"
                            step="any"
                            value={latitude ?? ""}
                            onChange={(e) => {
                              const val = e.target.value ? parseFloat(e.target.value) : null;
                              setLatitude(val);
                              setIsDirty(true);
                            }}
                            placeholder="-34.0522"
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                        {/* Longitude */}
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="longitude_input" className="text-xs flex items-center gap-1">
                            <MapPin className="h-3 w-3 text-primary" />
                            Longitude
                          </Label>
                          <Input
                            id="longitude_input"
                            type="number"
                            step="any"
                            value={longitude ?? ""}
                            onChange={(e) => {
                              const val = e.target.value ? parseFloat(e.target.value) : null;
                              setLongitude(val);
                              setIsDirty(true);
                            }}
                            placeholder="18.4241"
                            className="h-7 text-xs font-mono"
                          />
                        </div>
                        {/* Google Maps Link */}
                        <div className="flex flex-col gap-1 col-span-2">
                          <Label htmlFor="google_maps_link" className="text-xs">
                            Google Maps Link {noStreetAddress && "*"}
                          </Label>
                          <div className="flex items-center gap-2">
                            <Input
                              id="google_maps_link"
                              value={googleMapsLink}
                              onChange={(e) => handleGoogleMapsLinkChange(e.target.value)}
                              placeholder="Paste Google Maps link to extract GPS"
                              className="flex-1 h-7 text-xs font-mono"
                              required={noStreetAddress}
                            />
                            {googleMapsLink && latitude && longitude && (
                              <span className="text-xs text-green-600 flex items-center gap-1">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Portfolio Commons — central store for data shared by every property in the portfolio */}
                {isEditMode && propertyId && (
                  <PortfolioCommonsCard propertyId={propertyId} isDirty={isDirty} />
                )}



                {/* RU owner sub-account: identity link + API key capture (ROL'OS PMS only) */}
                {isEditMode && propertyId && (
                  <PropertyRuOwnerPanel
                    propertyId={propertyId}
                    pmsSystem={selectedPMS}
                    readOnly={!(isAdmin || isDev || isFearlessLeader)}
                  />

                )}

                {/*
                  Content quality review outcomes the owner can act on. This check is
                  advisory and only assessable once the listing is live on the channel,
                  so it is not part of the Ready-to-sell gate — hide it inside the
                  embedded onboarding editor to avoid implying it is required there.
                */}
                {isEditMode && propertyId && !embedded && (
                  <RuMcqPrompts
                    propertyId={propertyId}
                    onNavigateSection={(section, focusKey) => {
                      setActiveTab(section);
                      if (focusKey) window.setTimeout(() => focusRequirementField(focusKey), 400);
                    }}
                  />
                )}


                {/* Company Information — contract variables + banking + Rentals United profile */}

                {selectedPMS !== "nightsbridge" && (
                  <CompanyInformationCard
                    registeredBusinessName={registeredBusinessName}
                    onRegisteredBusinessNameChange={(v) => {
                      setRegisteredBusinessName(v);
                      setIsDirty(true);
                    }}
                    mobileNumber={mobileNumber}
                    onMobileNumberChange={(v) => {
                      setMobileNumber(v);
                      setIsDirty(true);
                    }}
                    keyRepresentative={keyRepresentative}
                    onKeyRepresentativeChange={(v) => {
                      setKeyRepresentative(v);
                      setIsDirty(true);
                    }}
                    postalAddress={postalAddress}
                    onPostalAddressChange={(v) => {
                      setPostalAddress(v);
                      setIsDirty(true);
                    }}
                    companyProfile={ruCompanyProfile}
                    onCompanyProfileChange={(next) => {
                      setRuCompanyProfile(next);
                      setIsDirty(true);
                    }}
                    ruLocationId={ruLocationId}
                    onRuLocationIdChange={(id) => {
                      setRuLocationId(id);
                      setIsDirty(true);
                    }}
                    propertyCity={formData.city}
                    propertyCountry={formData.country}
                    propertyPostalCode={formData.postal_code}

                    banking={{
                      has_vat: formData.has_vat,
                      vat_number: formData.vat_number,
                      property_registration: formData.property_registration,
                      bank_name: formData.bank_name,
                      branch_code: formData.branch_code,
                      account_holder: formData.account_holder,
                      account_number: formData.account_number,
                      account_type: formData.account_type,
                      swift_code: formData.swift_code,
                    }}
                    onBankingChange={(key, value) => handleInputChange(key, value as never)}
                    headerAction={
                      <PortfolioIdentityCopy
                        propertyId={propertyId}
                        isDirty={isDirty}
                        payload={{
                          registered_business_name: registeredBusinessName || null,
                          registration_number: formData.property_registration || null,
                          vat_number: formData.has_vat ? formData.vat_number : null,
                          has_vat: formData.has_vat,
                          mobile_number: mobileNumber || null,
                          postal_address: postalAddress || null,
                          key_representative: keyRepresentative || formData.owner_name || null,
                          ru_company_profile:
                            Object.keys(ruCompanyProfile).length > 0
                              ? (ruCompanyProfile as Record<string, unknown>)
                              : null,
                          banking: {
                            has_vat: formData.has_vat,
                            vat_number: formData.has_vat ? formData.vat_number : null,
                            property_registration: formData.property_registration,
                            bank_name: formData.bank_name,
                            branch_code: formData.branch_code,
                            account_holder: formData.account_holder,
                            account_number: formData.account_number,
                            account_type: formData.account_type,
                            swift_code: formData.swift_code,
                          },
                          ru_location_id: ruLocationId,
                        }}
                      />
                    }
                  />
                )}

                {/* Map — full-width strip under the location fields */}

                <div className="flex w-full">
                  <Card className="flex h-[240px] flex-1 flex-col p-2">

                    <PropertyMap
                      address={formData.address}
                      suburb={formData.suburb}
                      city={formData.city}
                      country={formData.country}
                      latitude={latitude}
                      longitude={longitude}
                      onLocationUpdate={(lat, lng) => {
                        setLatitude(lat);
                        setLongitude(lng);
                      }}
                    />
                  </Card>
                </div>
              </div>


              {/* Contract Management - Only show for existing properties */}

              {propertyId && (
                <ContractManagementPanel
                  propertyId={propertyId}
                  propertyName={formData.name}
                  ownerEmail={formData.owner_email}
                  ownerName={formData.owner_name}
                  isRolProperty={isRolProperty}
                />
              )}

              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => handleNavigate("/admin/property-overview")}
                >
                  Cancel
                </Button>
                {isDirty && (
                  <Button type="submit" size="sm" className="h-7 text-xs" disabled={loading}>
                    <Save className="mr-1 h-3 w-3" />
                    {loading ? "Saving..." : "Save"}
                  </Button>
                )}
              </div>
            </form>
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* House Style Tab */}

          <TabsContent value="rol-spec">
            <DeferredWhen when={activeTab === "rol-spec"}>{() => (
            <>
            <ROLSpecTab
              data={rolSpecData}
              onChange={setRolSpecData}
              propertyContext={{
                name: formData.name,
                property_type: formData.property_type,
                property_url: formData.property_url,
                property_id: propertyId || undefined,
                star_rating: starRating,
                description: formData.description,
                country: formData.country,
                city: formData.city,
                suburb: formData.suburb,
                restaurants_cafes: formData.restaurants_cafes,
                public_transport: formData.public_transport,
                closest_airport: formData.closest_airport,
                pets_allowed: formData.pets_allowed,
                children_allowed: formData.children_allowed,
                smoking_allowed: formData.smoking_allowed,
                check_in_from: formData.check_in_from,
                check_out_to: formData.check_out_to,
                facilities: selectedFacilities,
                rooms: roomTypes.map((r) => ({
                  name: r.name,
                  description: r.description,
                  maxPeople: r.maxPeople,
                  bedConfiguration: Array.isArray(r.bedConfiguration)
                    ? r.bedConfiguration.map((b) => `${b.count} ${b.type}`).join(", ")
                    : undefined,
                })),
              }}
              onDirty={() => setIsDirty(true)}
            />
            </>
            )}</DeferredWhen>
          </TabsContent>

          <TabsContent value="branding">
            <DeferredWhen when={activeTab === "branding"}>{() => (
            <>
            <BrandingTab
              data={brandingData}
              onChange={setBrandingData}
              propertyId={propertyId}
              onDirty={() => setIsDirty(true)}
              canToggleBrand={isAdmin || isDev || isFearlessLeader}
              ownerEmail={formData.owner_email}
            />
            {propertyId && <BrandVoiceCard propertyId={propertyId} />}
            </>
            )}</DeferredWhen>
          </TabsContent>

          <TabsContent value="info-facilities">
            <DeferredWhen when={activeTab === "info-facilities"}>{() => (
            <>
            <form onSubmit={handleSubmit} className="space-y-3">
              {/* Property Info */}
              <Card>
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span>Property Info</span>
                      <div className="flex items-center gap-2">
                        <Label className="text-xs text-muted-foreground">Stars</Label>
                        <div
                          className={cn(
                            "inline-block",
                            getPMSFieldClass("star_rating", selectedPMS),
                            isFieldPopulatedByPMS("star_rating", selectedPMS) && "opacity-60 pointer-events-none",
                          )}
                        >
                          <StarRating
                            rating={starRating}
                            onRatingChange={
                              isFieldPopulatedByPMS("star_rating", selectedPMS) ? () => {} : setStarRating
                            }
                          />
                        </div>
                      </div>
                    </div>
                    {selectedPMS && !isRolProperty && (
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div className="flex items-center gap-2 text-xs font-normal">
                              <div className="w-3 h-3 rounded bg-primary/10 border border-primary/30" />
                              <span className="text-muted-foreground">
                                <Cloud className="inline h-3 w-3 mr-1" />
                                {getPMSDisplayName(selectedPMS)} synced
                              </span>
                            </div>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Fields with this background are populated by {getPMSDisplayName(selectedPMS)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    )}
                  </CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between gap-2">
                      <Label htmlFor="description" className="text-xs">
                        Description
                      </Label>
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "text-[10px] tabular-nums",
                            propertyDescriptionTooShort ? "text-destructive" : "text-muted-foreground",
                          )}
                        >
                          {propertyDescriptionLength} / {MIN_DESCRIPTION_CHARS} characters
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px]"
                          disabled={writingPropertyDescription || isFieldPopulatedByPMS("description", selectedPMS)}
                          onClick={writePropertyDescriptionWithTobi}
                        >
                          {writingPropertyDescription ? (
                            <>
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                              TOBI is writing…
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-3 w-3 mr-1" />
                              Write with TOBI
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                    <Textarea
                      id="description"
                      value={formData.description}
                      onChange={(e) => handleInputChange("description", e.target.value)}
                      placeholder="Describe your property, its unique features, amenities, and what makes it special..."
                      rows={6}
                      disabled={isFieldPopulatedByPMS("description", selectedPMS)}
                      className={cn(
                        "resize-none text-xs",
                        propertyDescriptionTooShort && "border-destructive focus-visible:ring-destructive",
                        getPMSFieldClass("description", selectedPMS),
                        isFieldPopulatedByPMS("description", selectedPMS) && "cursor-not-allowed",
                      )}
                    />
                    {propertyDescriptionTooShort && (
                      <p className="flex items-center gap-1 text-[10px] text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {MIN_DESCRIPTION_CHARS - propertyDescriptionLength} more characters needed — distribution
                        channels require at least {MIN_DESCRIPTION_CHARS} characters.
                      </p>
                    )}
                  </div>
                  <div className="mt-3 pt-3 border-t border-border">
                    <RuChannelContentFields
                      floor={propertyFloor}
                      onFloorChange={(v) => {
                        setPropertyFloor(v);
                        setIsDirty(true);
                      }}
                      sizeSqm={propertySizeSqm}
                      onSizeChange={(v) => {
                        setPropertySizeSqm(v);
                        setIsDirty(true);
                      }}
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Accommodation Type & Self Catering */}
              <Card>
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm">Accommodation Settings</CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label htmlFor="accommodation_label" className="text-xs">
                        Accommodation Label
                      </Label>
                      <p className="text-[10px] text-muted-foreground mb-1">
                        How "rooms" are referred to on your listing (e.g. Units, Chalets, Apartments)
                      </p>
                      <Select
                        value={
                          accommodationLabel ||
                          getAccommodationLabel({
                            property_type: formData.property_type,
                            external_system: selectedPMS || null,
                          }).key
                        }
                        onValueChange={(value) => {
                          setAccommodationLabel(value);
                          setIsDirty(true);
                        }}
                      >
                        <SelectTrigger id="accommodation_label" className="h-7 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {ACCOMMODATION_LABEL_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>
                              {opt.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="self_catering" className="text-xs">
                        Self Catering
                      </Label>
                      <p className="text-[10px] text-muted-foreground mb-1">
                        Property offers self-catering accommodation (kitchen/kitchenette)
                      </p>
                      <div className="flex items-center gap-2 pt-1">
                        <Switch
                          id="self_catering"
                          checked={isSelfCatering}
                          onCheckedChange={(checked) => {
                            setIsSelfCatering(checked);
                            setIsDirty(true);
                          }}
                        />
                        <Label htmlFor="self_catering" className="text-xs cursor-pointer">
                          {isSelfCatering ? "Yes" : "No"}
                        </Label>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Composition — property-wide fallback for channel distribution */}
              <Card>
                <CardHeader className="py-2 px-4">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">Composition (property-wide fallback)</CardTitle>
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Info className="h-3 w-3" />
                      Unit values in the Rooms tab take priority — these are used only where a unit has none
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="py-2 px-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Bedrooms</Label>
                      <Input
                        type="number"
                        min={0}
                        className="h-7 text-xs"
                        value={propBedrooms}
                        onChange={(e) => {
                          setPropBedrooms(Math.max(0, parseInt(e.target.value) || 0));
                          setIsDirty(true);
                        }}
                      />
                      <p className="text-[10px] text-muted-foreground">Keep 0 for a studio</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Bathrooms <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        className={cn("h-7 text-xs", propBathrooms === null && "border-destructive")}
                        value={propBathrooms ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPropBathrooms(v === "" ? null : Math.max(0, parseInt(v) || 0));
                          setIsDirty(true);
                        }}
                      />
                      <p className="text-[10px] text-muted-foreground">Or shower rooms</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">
                        Toilets <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        type="number"
                        min={0}
                        className={cn("h-7 text-xs", propToilets === null && "border-destructive")}
                        value={propToilets ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setPropToilets(v === "" ? null : Math.max(0, parseInt(v) || 0));
                          setIsDirty(true);
                        }}
                      />
                      <p className="text-[10px] text-muted-foreground">Separate from bathrooms</p>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Separate kitchen</Label>
                      <div className="flex items-center gap-2 pt-1">
                        <Switch
                          id="separate_kitchen"
                          checked={separateKitchen}
                          onCheckedChange={(c) => {
                            setSeparateKitchen(c);
                            // One fact, one meaning: the channel publishes "Separate kitchen"
                            // from the Kitchen amenity, so keep the selection in step.
                            setSelectedFacilities((prev) => withSeparateKitchen(prev, c));
                            setIsDirty(true);
                          }}
                        />
                        <Label htmlFor="separate_kitchen" className="text-xs cursor-pointer">
                          {separateKitchen ? "Yes" : "No"}
                        </Label>
                      </div>
                      <p className="text-[10px] text-muted-foreground">
                        Kitchen / cooking area / kitchenette — may be outside the unit
                      </p>
                    </div>
                  </div>
                  {(propBathrooms === null || propToilets === null) && (
                    <p className="mt-2 text-[11px] text-destructive">
                      Bathrooms and toilets are mandatory for Channel Manager and OTA distribution.
                      Capture them per unit in the Rooms tab, or here as the property-wide fallback.
                    </p>
                  )}

                </CardContent>
              </Card>

              {/* Property Amenities & Facilities — Rentals United aligned */}
              <Card>
                <CardHeader className="py-2 px-4">
                  <div className="flex items-center justify-between gap-3">
                    <CardTitle className="text-sm">Property Amenities &amp; Facilities</CardTitle>
                    <div className="flex items-center gap-3">
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        Channel amenities first — the selection is pushed to the Channel Manager and OTAs
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs shrink-0"
                        disabled={!propertyId}
                        title={
                          propertyId
                            ? "Let TOBI review the property website and ROLOS data to propose amenities"
                            : "Save the property first"
                        }
                        onClick={() => setAiAmenityOpen(true)}
                      >
                        <Sparkles className="h-3 w-3 mr-1" />
                        TOBI amenity check
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <RUAmenityPicker
                    scope="property"
                    value={selectedFacilities}
                    onChange={(next) => {
                      setSelectedFacilities(next);
                      // Selecting/clearing the Kitchen amenity is the same statement as the
                      // "Separate kitchen" toggle above — mirror it so ROLOS matches the listing.
                      setSeparateKitchen(hasSeparateKitchen(next));
                      setIsDirty(true);
                    }}
                    extraGroups={ROLOS_ONLY_FACILITY_GROUPS}
                  />
                </CardContent>
              </Card>

              {propertyId && (
                <AiAmenityDialog
                  open={aiAmenityOpen}
                  onOpenChange={setAiAmenityOpen}
                  propertyId={propertyId}
                  websiteUrl={formData.property_url || undefined}
                  currentPropertyFacilities={selectedFacilities}
                  onApplyProperty={(next) => {
                    setSelectedFacilities(next);
                    setIsDirty(true);
                  }}
                />
              )}


              {/* Breakfast Options */}
              <Card>
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm">Breakfast Options</CardTitle>
                </CardHeader>
                <CardContent className="py-2 px-4">
                  <div className="flex flex-wrap gap-3">
                    {["Continental", "Full English/Irish", "Vegetarian", "Vegan", "Halal", "Gluten-free", "Buffet"].map(
                      (option) => (
                        <div key={option} className="flex items-center space-x-1.5">
                          <Checkbox
                            id={`breakfast-${option}`}
                            checked={selectedBreakfastOptions.includes(option)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedBreakfastOptions([...selectedBreakfastOptions, option]);
                              } else {
                                setSelectedBreakfastOptions(selectedBreakfastOptions.filter((o) => o !== option));
                              }
                              setIsDirty(true);
                            }}
                            className="h-3.5 w-3.5"
                          />
                          <Label htmlFor={`breakfast-${option}`} className="cursor-pointer text-xs">
                            {option}
                          </Label>
                        </div>
                      ),
                    )}
                  </div>
                </CardContent>
              </Card>


              {/* Property Surroundings — moved from Identity & Location */}
              <Collapsible defaultOpen={false}>
                <Card>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="py-2 px-4 cursor-pointer hover:bg-muted/50 transition-colors">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Property Surroundings</span>
                        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                      </CardTitle>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="py-2 px-4 space-y-3">
                      {/* Restaurants & Cafes */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="restaurants_cafes" className="text-xs text-muted-foreground">
                            Restaurants & Cafes
                          </Label>
                          <Input
                            id="restaurants_cafes"
                            value={formData.restaurants_cafes}
                            onChange={(e) => handleInputChange("restaurants_cafes", e.target.value)}
                            placeholder="e.g., Local restaurants, cafes"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="restaurants_cafes_distance" className="text-xs text-muted-foreground">
                            Distance
                          </Label>
                          <Input
                            id="restaurants_cafes_distance"
                            value={formData.restaurants_cafes_distance}
                            onChange={(e) => handleInputChange("restaurants_cafes_distance", e.target.value)}
                            placeholder="e.g., 2 km"
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>

                      {/* Public Transport */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="public_transport" className="text-xs text-muted-foreground">
                            Public Transport
                          </Label>
                          <Input
                            id="public_transport"
                            value={formData.public_transport}
                            onChange={(e) => handleInputChange("public_transport", e.target.value)}
                            placeholder="e.g., Bus stop, Train station"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="public_transport_distance" className="text-xs text-muted-foreground">
                            Distance
                          </Label>
                          <Input
                            id="public_transport_distance"
                            value={formData.public_transport_distance}
                            onChange={(e) => handleInputChange("public_transport_distance", e.target.value)}
                            placeholder="e.g., 500 m"
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>

                      {/* Closest Airport */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="closest_airport" className="text-xs text-muted-foreground">
                            Closest Airport
                          </Label>
                          <Input
                            id="closest_airport"
                            value={formData.closest_airport}
                            onChange={(e) => handleInputChange("closest_airport", e.target.value)}
                            placeholder="e.g., Hoedspruit Eastgate Airport"
                            className="h-7 text-xs"
                          />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="closest_airport_distance" className="text-xs text-muted-foreground">
                            Distance
                          </Label>
                          <Input
                            id="closest_airport_distance"
                            value={formData.closest_airport_distance}
                            onChange={(e) => handleInputChange("closest_airport_distance", e.target.value)}
                            placeholder="e.g., 52 km"
                            className="h-7 text-xs"
                          />
                        </div>
                      </div>

                      {/* Nearby attractions — geolocation search + channel destination mapping */}
                      <div className="border-t pt-3">
                        <NearbyAttractionsPanel
                          propertyId={propertyId ?? undefined}
                          propertyName={formData.name}
                          propertyCity={formData.city}
                          propertyCountry={formData.country}
                          latitude={latitude}
                          longitude={longitude}
                        />
                      </div>
                    </CardContent>

                  </CollapsibleContent>
                </Card>
              </Collapsible>

            </form>
            </>
            )}</DeferredWhen>
          </TabsContent>

          <TabsContent value="images">
            <DeferredWhen when={activeTab === "images"}>{() => (
            <>
            <Card data-field="images">
              <CardHeader className="py-2 px-4 flex-row items-center justify-between gap-2">

                <CardTitle className="text-sm">Property Images</CardTitle>
                <div className="flex items-center gap-2">
                  {(() => {
                    const untagged = uploadedImages.slice(1).filter((u) => !(imageTags[u]?.length)).length;
                    return untagged > 0 ? (
                      <span className="text-[11px] text-warning">
                        {untagged} photo{untagged === 1 ? "" : "s"} untagged — will push to channels as “Interior”
                      </span>
                    ) : uploadedImages.length > 0 ? (
                      <span className="text-[11px] text-muted-foreground">All photos tagged</span>
                    ) : null;
                  })()}
                  {uploadedImages.length > 1 && (
                    <RuImageTagPicker
                      value={[]}
                      align="end"
                      hideStatusBadge
                      onChange={(next) => {
                        if (!next.length) return;
                        setImageTags((prev) => {
                          const merged = { ...prev };
                          uploadedImages.slice(1).forEach((url) => {
                            if (!merged[url]?.length) merged[url] = next;
                          });
                          return merged;
                        });
                        setIsDirty(true);
                      }}
                    />
                  )}
                </div>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
                  {/* Upload Area */}
                  <div
                    className={`border-2 border-dashed rounded-lg p-4 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                      isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary"
                    }`}
                    onDrop={handleDrop}
                    onDragOver={handleDragOver}
                    onDragLeave={handleDragLeave}
                    onClick={() => document.getElementById("image-upload")?.click()}
                  >
                    <Upload className="h-8 w-8 text-muted-foreground mb-2" />
                    <p className="text-xs text-muted-foreground text-center">Click or drag to upload</p>
                    <input
                      id="image-upload"
                      type="file"
                      accept="image/*"
                      multiple
                      className="hidden"
                      onChange={(e) => handleImageUpload(e.target.files)}
                    />
                  </div>

                  {/* Image Grid */}
                  <div className="lg:col-span-4">
                    <ImageAuditSummary
                      className="mb-2"
                      urls={uploadedImages}
                      results={propertyImageAudit.results}
                      hasMainImage={!!mainImageUrl}
                    />
                    <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                      {uploadedImages.map((imageUrl, index) => (
                        <div key={index} className="space-y-1">
                          <div className="relative aspect-square rounded-md overflow-hidden border border-border group">
                            <img src={imageUrl} alt={`Property ${index + 1}`} className="w-full h-full object-cover" />
                            <ImageQualityMarker entry={propertyImageAudit.results[imageUrl]} />

                            {/* Explicit main-image flag (channel ImageTypeID 1) */}
                            {mainImageUrl === imageUrl ? (
                              <div className="absolute top-1 left-1 bg-primary rounded-full p-1" title="Main image">
                                <Heart className="h-3 w-3 text-white fill-white" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  // Main is always the first photo: tag it and move it to the front.
                                  setImageTags((prev) => setMainImageUrl(prev, uploadedImages, imageUrl));
                                  setUploadedImages((prev) => moveImageFirst(prev, imageUrl));
                                  setIsDirty(true);
                                }}
                                className="absolute top-1 left-1 bg-muted-foreground/60 hover:bg-primary rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Set as main image"
                              >
                                <Heart className="h-3 w-3 text-white" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute top-1 right-1 bg-muted-foreground/80 hover:bg-destructive rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-3 w-3 text-white" />
                            </button>
                          </div>
                          <RuImageTagPicker
                            value={imageTags[imageUrl] || []}
                            isMain={mainImageUrl === imageUrl}
                            onChange={(next) => {
                              setImageTags((prev) => ({ ...prev, [imageUrl]: next }));
                              setIsDirty(true);
                            }}
                          />
                        </div>
                      ))}

                      {Array.from({ length: Math.max(0, 12 - uploadedImages.length) }, (_, index) => (
                        <div
                          key={`empty-${index}`}
                          className="relative aspect-square rounded-md border-2 border-dashed border-border bg-muted/20 flex items-center justify-center"
                        >
                          <X className="h-3 w-3 text-muted-foreground" />
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-2 mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleNavigate("/admin/property-overview")}
              >
                Cancel
              </Button>
              {isDirty && (
                <Button type="button" size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={loading}>
                  <Save className="mr-1 h-3 w-3" />
                  {loading ? "Saving..." : "Save Property"}
                </Button>
              )}
            </div>
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Templates and Notifications Tab */}
          <TabsContent value="templates">
            <DeferredWhen when={activeTab === "templates"}>{() => (
            <>
            {experienceEngineEnabled && propertyId ? (
              <ExperienceEmailDesigner propertyId={propertyId} />
            ) : (
              <Card>
                <CardContent className="py-3 px-4 space-y-3">
                  {/* Template Selection Buttons */}
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { value: "confirmation-mailer", label: "Confirmation Mailer" },
                      { value: "confirmation-property", label: "Confirmation Property" },
                      { value: "pre-mailer", label: "Pre Mailer" },
                      { value: "post-mailer", label: "Post Mailer" },
                    ].map(({ value, label }) => (
                      <Button
                        key={value}
                        type="button"
                        size="sm"
                        className="h-7 text-xs"
                        variant={selectedTemplate === value ? "default" : "outline"}
                        onClick={() => setSelectedTemplate(value)}
                      >
                        {label}
                      </Button>
                    ))}
                  </div>

                  {/* Template Content - Rich Text Editor */}
                  <div className="space-y-1">
                    <Label className="text-xs">Template (supports formatting, images, and links)</Label>
                    <RichTextEditor
                      content={templateContent}
                      onChange={(html) => {
                        setTemplateContent(html);
                        setIsDirty(true);
                      }}
                      placeholder="Enter your email template content here..."
                    />
                  </div>

                  {/* Mailer Timing Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-xs">Pre Mailer:</Label>
                      <Input
                        type="number"
                        value={preMailerDays}
                        onChange={(e) => {
                          setPreMailerDays(Number(e.target.value));
                          setIsDirty(true);
                        }}
                        className="w-14 h-6 text-xs"
                        min="0"
                      />
                      <span className="text-xs text-muted-foreground">days</span>
                      <Input
                        type="number"
                        value={preMailerHours}
                        onChange={(e) => {
                          setPreMailerHours(Number(e.target.value));
                          setIsDirty(true);
                        }}
                        className="w-14 h-6 text-xs"
                        min="0"
                        max="23"
                      />
                      <span className="text-xs text-muted-foreground">hrs before</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-xs">Post Mailer:</Label>
                      <Input
                        type="number"
                        value={postMailerDays}
                        onChange={(e) => {
                          setPostMailerDays(Number(e.target.value));
                          setIsDirty(true);
                        }}
                        className="w-14 h-6 text-xs"
                        min="0"
                      />
                      <span className="text-xs text-muted-foreground">days</span>
                      <Input
                        type="number"
                        value={postMailerHours}
                        onChange={(e) => {
                          setPostMailerHours(Number(e.target.value));
                          setIsDirty(true);
                        }}
                        className="w-14 h-6 text-xs"
                        min="0"
                        max="23"
                      />
                      <span className="text-xs text-muted-foreground">hrs after</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            <div className="flex justify-end gap-2 mt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                onClick={() => handleNavigate("/admin/property-overview")}
              >
                Cancel
              </Button>
              {isDirty && (
                <Button type="button" size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={loading}>
                  <Save className="mr-1 h-3 w-3" />
                  Save
                </Button>
              )}
            </div>
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Addons Tab */}
          <TabsContent value="addons">
            <DeferredWhen when={activeTab === "addons"}>{() => (
            <>
            <Card>
              <CardHeader className="py-2 px-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Addons</CardTitle>
                <Dialog open={isAddAddonOpen} onOpenChange={setIsAddAddonOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" className="h-7 text-xs gap-1">
                      <Plus className="h-3 w-3" />
                      Add Addon
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle className="text-sm">Add Addon</DialogTitle>
                    </DialogHeader>

                    <Tabs value={addonDialogTab} onValueChange={setAddonDialogTab}>
                      <TabsList className="h-7">
                        <TabsTrigger value="addon" className="text-xs h-6">
                          Addon
                        </TabsTrigger>
                        <TabsTrigger value="addon-images" className="text-xs h-6">
                          Images
                        </TabsTrigger>
                      </TabsList>

                      <TabsContent value="addon" className="space-y-2 mt-2">
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Name</Label>
                            <Input
                              value={addonForm.name}
                              onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Offerings for:</Label>
                            <div className="flex gap-3">
                              <div className="flex items-center gap-1">
                                <Checkbox
                                  id="addon-accommodation"
                                  checked={addonForm.offeringsAccommodation}
                                  onCheckedChange={(checked) =>
                                    setAddonForm({ ...addonForm, offeringsAccommodation: checked as boolean })
                                  }
                                  className="h-3 w-3"
                                />
                                <Label htmlFor="addon-accommodation" className="cursor-pointer text-xs">
                                  Accommodation
                                </Label>
                              </div>
                              <div className="flex items-center gap-1">
                                <Checkbox
                                  id="addon-venue"
                                  checked={addonForm.offeringsVenue}
                                  onCheckedChange={(checked) =>
                                    setAddonForm({ ...addonForm, offeringsVenue: checked as boolean })
                                  }
                                  className="h-3 w-3"
                                />
                                <Label htmlFor="addon-venue" className="cursor-pointer text-xs">
                                  Venue
                                </Label>
                              </div>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Description</Label>
                          <Textarea
                            rows={2}
                            value={addonForm.description}
                            onChange={(e) => setAddonForm({ ...addonForm, description: e.target.value })}
                            className="text-xs"
                          />
                        </div>

                        <div className="grid grid-cols-4 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs">Price Type</Label>
                            <Select
                              value={addonForm.priceType}
                              onValueChange={(value) => setAddonForm({ ...addonForm, priceType: value })}
                            >
                              <SelectTrigger className="h-7 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Price Per Item" className="text-xs">
                                  Per Item
                                </SelectItem>
                                <SelectItem value="Price Per Person" className="text-xs">
                                  Per Person
                                </SelectItem>
                                <SelectItem value="Price Per Night" className="text-xs">
                                  Per Night
                                </SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Price</Label>
                            <Input
                              type="number"
                              value={addonForm.price}
                              onChange={(e) => setAddonForm({ ...addonForm, price: Number(e.target.value) })}
                              min="0"
                              className="h-7 text-xs"
                            />
                          </div>
                          <div className="col-span-2 space-y-1">
                            <Label className="text-xs">Capacity</Label>
                            <div className="flex items-center gap-1.5">
                              <Checkbox
                                id="addon-capacity"
                                checked={addonForm.hasCapacity}
                                onCheckedChange={(checked) =>
                                  setAddonForm({ ...addonForm, hasCapacity: checked as boolean })
                                }
                                className="h-3 w-3"
                              />
                              <Input
                                type="number"
                                className="w-20 h-7 text-xs"
                                value={addonForm.capacity}
                                onChange={(e) => setAddonForm({ ...addonForm, capacity: Number(e.target.value) })}
                                min="0"
                                disabled={!addonForm.hasCapacity}
                              />
                            </div>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">Days</Label>
                          <div className="flex flex-wrap gap-2">
                            <div className="flex items-center gap-1">
                              <Checkbox
                                id="addon-all-days"
                                checked={addonForm.allDays}
                                onCheckedChange={(checked) =>
                                  setAddonForm({ ...addonForm, allDays: checked as boolean })
                                }
                                className="h-3 w-3"
                              />
                              <Label htmlFor="addon-all-days" className="cursor-pointer text-xs">
                                All
                              </Label>
                            </div>
                            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => {
                              const fullDay = [
                                "sunday",
                                "monday",
                                "tuesday",
                                "wednesday",
                                "thursday",
                                "friday",
                                "saturday",
                              ][i];
                              return (
                                <div key={fullDay} className="flex items-center gap-1">
                                  <Checkbox
                                    id={`addon-${fullDay}`}
                                    checked={addonForm[fullDay as keyof typeof addonForm] as boolean}
                                    onCheckedChange={(checked) =>
                                      setAddonForm({ ...addonForm, [fullDay]: checked as boolean })
                                    }
                                    className="h-3 w-3"
                                  />
                                  <Label htmlFor={`addon-${fullDay}`} className="cursor-pointer text-xs">
                                    {day}
                                  </Label>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex justify-end pt-2">
                          <Button size="sm" className="h-7 text-xs" onClick={handleAddAddon}>
                            Create
                          </Button>
                        </div>
                      </TabsContent>

                      <TabsContent value="addon-images" className="mt-2">
                        <div className="grid grid-cols-5 gap-2">
                          <div
                            className={`border-2 border-dashed rounded-md p-3 flex flex-col items-center justify-center cursor-pointer transition-colors ${isAddonImageDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary"}`}
                            onDrop={handleAddonImageDrop}
                            onDragOver={(e) => {
                              e.preventDefault();
                              setIsAddonImageDragging(true);
                            }}
                            onDragLeave={() => setIsAddonImageDragging(false)}
                            onClick={() => document.getElementById("addon-image-upload")?.click()}
                          >
                            <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                            <p className="text-xs text-muted-foreground text-center">Upload</p>
                            <input
                              id="addon-image-upload"
                              type="file"
                              accept="image/*"
                              multiple
                              className="hidden"
                              onChange={(e) => handleAddonImageUpload(e.target.files)}
                            />
                          </div>
                          {addonImages.slice(0, 8).map((imageUrl, index) => (
                            <div
                              key={index}
                              className="relative aspect-square rounded-md overflow-hidden border border-border group"
                            >
                              <img src={imageUrl} alt={`Addon ${index + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeAddonImage(index)}
                                className="absolute top-1 right-1 bg-muted-foreground/80 hover:bg-destructive rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-3 w-3 text-white" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </TabsContent>
                    </Tabs>
                  </DialogContent>
                </Dialog>
              </CardHeader>
              <CardContent className="py-2 px-4">
                <div className="border rounded-md overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left py-1.5 px-2 font-medium text-xs">ITEM</th>
                        <th className="text-left py-1.5 px-2 font-medium text-xs">DESCRIPTION</th>
                        <th className="text-left py-1.5 px-2 font-medium text-xs">TYPE</th>
                        <th className="text-left py-1.5 px-2 font-medium text-xs">CAP</th>
                        <th className="text-left py-1.5 px-2 font-medium text-xs">PRICE</th>
                        <th className="text-left py-1.5 px-2 font-medium text-xs w-16"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {addons.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-4 text-center text-xs text-muted-foreground">
                            No addons yet
                          </td>
                        </tr>
                      ) : (
                        addons.map((addon) => (
                          <tr key={addon.id} className="border-t hover:bg-muted/50">
                            <td className="py-1.5 px-2 text-xs">{addon.name}</td>
                            <td className="py-1.5 px-2 text-xs text-muted-foreground truncate max-w-[200px]">
                              {addon.description}
                            </td>
                            <td className="py-1.5 px-2 text-xs">{addon.priceType}</td>
                            <td className="py-1.5 px-2 text-xs">{addon.hasCapacity ? addon.capacity : "-"}</td>
                            <td className="py-1.5 px-2 text-xs">{addon.price}</td>
                            <td className="py-1.5 px-2">
                              <div className="flex gap-1">
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0">
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-5 w-5 p-0 text-destructive"
                                  onClick={() => deleteAddon(addon.id)}
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Specials Tab */}
          <TabsContent value="specials">
            <DeferredWhen when={activeTab === "specials"}>{() => (
            <>
            <Card>
              <CardHeader className="py-2 px-4">
                <Tabs value={specialsCategory} onValueChange={setSpecialsCategory}>
                  <TabsList className="h-7">
                    <TabsTrigger value="accommodations" className="text-xs h-6">
                      Accommodations
                    </TabsTrigger>
                    {isEvent && (
                      <TabsTrigger value="event-wedding" className="text-xs h-6">
                        Event/Wedding
                      </TabsTrigger>
                    )}
                    {isConference && (
                      <TabsTrigger value="conference" className="text-xs h-6">
                        Conference
                      </TabsTrigger>
                    )}
                    <TabsTrigger value="vouchers" className="text-xs h-6">
                      Vouchers
                    </TabsTrigger>
                    <TabsTrigger value="partner-offers" className="text-xs h-6">
                      Partner offers
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent className="py-2 px-4">
                {specialsCategory === "conference" && (
                  <div className="flex gap-3">
                    {/* Left Sidebar - Specials List */}
                    <div className="w-48 space-y-1">
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-semibold text-xs text-muted-foreground">CONFERENCE SPECIALS</h3>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={addNewSpecial}>
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                      {conferenceSpecials.map((special) => (
                        <div
                          key={special.id}
                          className={`flex items-center justify-between py-1.5 px-2 rounded transition-colors text-xs ${
                            selectedSpecial === special.id
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted hover:bg-muted/80"
                          }`}
                        >
                          <span
                            className="flex-1 cursor-pointer truncate"
                            onClick={() => setSelectedSpecial(special.id)}
                          >
                            {special.name}
                          </span>
                          <div className="flex gap-0.5">
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-4 w-4 p-0"
                              onClick={() => setIsEditSpecialOpen(true)}
                            >
                              <Edit className="h-2.5 w-2.5" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-4 w-4 p-0"
                              onClick={() => deleteSpecial(special.id)}
                            >
                              <Trash2 className="h-2.5 w-2.5" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Main Content - Edit Special Dialog */}
                    <Dialog open={isEditSpecialOpen} onOpenChange={setIsEditSpecialOpen}>
                      <DialogTrigger asChild>
                        <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-md p-6 cursor-pointer hover:bg-muted/50">
                          <div className="text-center">
                            <p className="text-xs text-muted-foreground mb-1">Click to edit special</p>
                            <Button size="sm" className="h-7 text-xs">
                              <Edit className="mr-1 h-3 w-3" />
                              Edit Special
                            </Button>
                          </div>
                        </div>
                      </DialogTrigger>
                      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
                        <DialogHeader>
                          <div className="flex items-center justify-between">
                            <DialogTitle className="text-sm">Edit Special</DialogTitle>
                            <div className="flex items-center gap-1.5">
                              <Switch
                                checked={specialForm.isPublic}
                                onCheckedChange={(checked) => setSpecialForm({ ...specialForm, isPublic: checked })}
                                className="scale-75"
                              />
                              <Label className="text-xs">Public</Label>
                            </div>
                          </div>
                        </DialogHeader>

                        <Tabs value={specialDialogTab} onValueChange={setSpecialDialogTab}>
                          <TabsList className="h-7">
                            <TabsTrigger value="edit-special" className="text-xs h-6">
                              Edit Special
                            </TabsTrigger>
                            <TabsTrigger value="special-images" className="text-xs h-6">
                              Images
                            </TabsTrigger>
                          </TabsList>

                          <TabsContent value="edit-special" className="space-y-3 mt-2">
                            <div className="grid grid-cols-3 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">Name*</Label>
                                <Input
                                  value={specialForm.name}
                                  onChange={(e) => setSpecialForm({ ...specialForm, name: e.target.value })}
                                  className="h-7 text-xs"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Season</Label>
                                <Select
                                  value={specialForm.season}
                                  onValueChange={(value) => setSpecialForm({ ...specialForm, season: value })}
                                >
                                  <SelectTrigger className="h-7 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="08/05/2025-30/09/2025" className="text-xs">
                                      08/05/2025-30/09/2025
                                    </SelectItem>
                                    <SelectItem value="01/10/2025-30/09/2026" className="text-xs">
                                      01/10/2025-30/09/2026
                                    </SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Description</Label>
                                <Input
                                  value={specialForm.description}
                                  onChange={(e) => setSpecialForm({ ...specialForm, description: e.target.value })}
                                  className="h-7 text-xs"
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-4 gap-2">
                              <div className="space-y-1">
                                <Label className="text-xs">From</Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "w-full h-7 justify-start text-left text-xs",
                                        !specialForm.periodFrom && "text-muted-foreground",
                                      )}
                                    >
                                      <CalendarIcon className="mr-1 h-3 w-3" />
                                      {specialForm.periodFrom ? format(specialForm.periodFrom, "MM/dd/yy") : "Pick"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarComponent
                                      mode="single"
                                      selected={specialForm.periodFrom}
                                      onSelect={(date) => setSpecialForm({ ...specialForm, periodFrom: date })}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">To</Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      className={cn(
                                        "w-full h-7 justify-start text-left text-xs",
                                        !specialForm.periodTo && "text-muted-foreground",
                                      )}
                                    >
                                      <CalendarIcon className="mr-1 h-3 w-3" />
                                      {specialForm.periodTo ? format(specialForm.periodTo, "MM/dd/yy") : "Pick"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarComponent
                                      mode="single"
                                      selected={specialForm.periodTo}
                                      onSelect={(date) => setSpecialForm({ ...specialForm, periodTo: date })}
                                      initialFocus
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="col-span-2 space-y-1">
                                <Label className="text-xs">Pricing</Label>
                                <RadioGroup
                                  value={specialForm.pricingConfig}
                                  onValueChange={(value: any) =>
                                    setSpecialForm({ ...specialForm, pricingConfig: value })
                                  }
                                  className="flex gap-3"
                                >
                                  <div className="flex items-center space-x-1">
                                    <RadioGroupItem value="discount" id="discount" className="h-3 w-3" />
                                    <Label htmlFor="discount" className="text-xs">
                                      Discount %
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <RadioGroupItem value="fixed-off" id="fixed-off" className="h-3 w-3" />
                                    <Label htmlFor="fixed-off" className="text-xs">
                                      Fixed Off
                                    </Label>
                                  </div>
                                  <div className="flex items-center space-x-1">
                                    <RadioGroupItem value="fixed-price" id="fixed-price" className="h-3 w-3" />
                                    <Label htmlFor="fixed-price" className="text-xs">
                                      Fixed Price
                                    </Label>
                                  </div>
                                </RadioGroup>
                              </div>
                            </div>
                          </TabsContent>

                          <TabsContent value="special-images" className="mt-2">
                            <div className="grid grid-cols-5 gap-2">
                              <div className="border-2 border-dashed rounded-md p-3 flex flex-col items-center justify-center cursor-pointer hover:bg-muted/50">
                                <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                                <p className="text-xs text-muted-foreground">Upload</p>
                              </div>
                            </div>
                          </TabsContent>
                        </Tabs>
                      </DialogContent>
                    </Dialog>
                  </div>
                )}

                {specialsCategory === "accommodations" && propertyId && (
                  <AccommodationSpecialsTab
                    propertyId={propertyId}
                    category="accommodation"
                    roomTypes={roomTypes.map((rt: any) => ({ id: rt.id || rt.name, name: rt.name }))}
                    onOpenPolicies={() => setActiveTab("rates")}
                  />
                )}

                {specialsCategory === "event-wedding" && propertyId && (
                  <AccommodationSpecialsTab
                    propertyId={propertyId}
                    category="event_wedding"
                    roomTypes={roomTypes.map((rt: any) => ({ id: rt.id || rt.name, name: rt.name }))}
                    onOpenPolicies={() => setActiveTab("rates")}
                  />
                )}

                {specialsCategory === "vouchers" && propertyId && <PromoCodesTab propertyId={propertyId} />}

                {specialsCategory === "partner-offers" && propertyId && (
                  <PartnerOffersTab propertyId={propertyId} />
                )}
              </CardContent>
            </Card>
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Calendar / Seasons Tab */}
          <TabsContent value="rates" className="space-y-0">
            <DeferredWhen when={activeTab === "rates"}>{() => (
            <>
            <RateManagerTab
              view="rates"
              propertyId={propertyId}
              roomTypes={roomTypes}
              selectedRoomType={selectedRoomType}
              setSelectedRoomType={setSelectedRoomType}
              pmsRateTypes={pmsRateTypes}
              setPmsRateTypes={setPmsRateTypes}
              seasons={seasons}
              setSeasons={setSeasons}
              seasonRates={seasonRates}
              setSeasonRates={setSeasonRates}
              selectedPMS={selectedPMS}
              isRolProperty={isRolProperty}
              accommodationLabel={accommodationLabel}
              selectedMealTypes={selectedMealTypes}
              formData={{ currency: formData.currency, owner_email: formData.owner_email }}
              amenities={{ rate_types: pmsRateTypes, seasons }}
              isAdmin={isAdmin ?? false}
              isDev={isDev ?? false}
              isFearlessLeader={isFearlessLeader ?? false}
              setIsDirty={setIsDirty}
              onOpenSpecials={() => setActiveTab("specials")}
              policiesExtra={
                <form onSubmit={handleSubmit} className="space-y-3">
                  <RuPaymentMethodsPicker
                    value={paymentMethods}
                    onChange={(next) => {
                      setPaymentMethods(next);
                      setIsDirty(true);
                    }}
                  />
                  <ChangeoverRulesCard
                    master={changeoverMaster}
                    onMasterChange={(next) => {
                      setChangeoverMaster(next);
                      setIsDirty(true);
                    }}
                    rules={changeoverRules}
                    onRulesChange={(next) => {
                      setChangeoverRules(next);
                      setIsDirty(true);
                    }}
                    unitOverrides={roomTypes
                      .filter((r: any) => r?.changeover !== null && r?.changeover !== undefined && r?.changeover !== "")
                      .map((r: any) => ({ name: r.name || "Unit", changeover: Number(r.changeover) }))}
                  />
                  <HouseRulesCard
                    formData={formData as any}
                    setFormData={setFormData as any}
                    handleInputChange={handleInputChange as any}
                    selectedPMS={selectedPMS}
                    isRolProperty={isRolProperty}
                    isFieldPopulatedByPMS={isFieldPopulatedByPMS}
                    getPMSFieldClass={getPMSFieldClass}
                  />
                  <div className="flex justify-end">
                    {isDirty && (
                      <Button type="submit" size="sm" className="h-7 text-xs" disabled={loading}>
                        <Save className="mr-1 h-3 w-3" />
                        {loading ? "Saving..." : "Save Property"}
                      </Button>
                    )}
                  </div>
                </form>
              }

            />
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Contacts Tab (same editor ROL'OS Property Setup uses) */}
          <TabsContent value="contacts" className="space-y-0">
            <DeferredWhen when={activeTab === "contacts"}>{() => (
            <>
            {!propertyId ? (
              <p className="p-3 text-sm text-muted-foreground">
                Save the property first to configure public contacts.
              </p>
            ) : (
              <PropertyContactDetails propertyId={propertyId} />
            )}
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Rate Plans Tab (standalone section — sole nightly-rate authoring surface) */}
          <TabsContent value="rate-plans" className="space-y-0">
            <DeferredWhen when={activeTab === "rate-plans"}>{() => (
            <>
            <div className="p-3">
              {!propertyId ? (
                <p className="text-sm text-muted-foreground">Save the property first to configure rate plans.</p>
              ) : (
                <RatePlansPanel
                  properties={[{ id: propertyId, name: formData.name || "" }]}
                  seedPropertyId={propertyId}
                  pmsSystem={selectedPMS}
                />
              )}
            </div>
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Policies Tab (standalone section) */}
          <TabsContent value="policies" className="space-y-0">
            <DeferredWhen when={activeTab === "policies"}>{() => (
            <>
            <RateManagerTab
              view="policies"
              propertyId={propertyId}
              roomTypes={roomTypes}
              selectedRoomType={selectedRoomType}
              setSelectedRoomType={setSelectedRoomType}
              pmsRateTypes={pmsRateTypes}
              setPmsRateTypes={setPmsRateTypes}
              seasons={seasons}
              setSeasons={setSeasons}
              seasonRates={seasonRates}
              setSeasonRates={setSeasonRates}
              selectedPMS={selectedPMS}
              isRolProperty={isRolProperty}
              accommodationLabel={accommodationLabel}
              selectedMealTypes={selectedMealTypes}
              formData={{ currency: formData.currency, owner_email: formData.owner_email }}
              amenities={{ rate_types: pmsRateTypes, seasons }}
              isAdmin={isAdmin ?? false}
              isDev={isDev ?? false}
              isFearlessLeader={isFearlessLeader ?? false}
              setIsDirty={setIsDirty}
              onOpenSpecials={() => setActiveTab("specials")}
              policiesExtra={
                <form onSubmit={handleSubmit} className="space-y-3">
                  <RuPaymentMethodsPicker
                    value={paymentMethods}
                    onChange={(next) => {
                      setPaymentMethods(next);
                      setIsDirty(true);
                    }}
                  />
                  <ChangeoverRulesCard
                    master={changeoverMaster}
                    onMasterChange={(next) => {
                      setChangeoverMaster(next);
                      setIsDirty(true);
                    }}
                    rules={changeoverRules}
                    onRulesChange={(next) => {
                      setChangeoverRules(next);
                      setIsDirty(true);
                    }}
                    unitOverrides={roomTypes
                      .filter((r: any) => r?.changeover !== null && r?.changeover !== undefined && r?.changeover !== "")
                      .map((r: any) => ({ name: r.name || "Unit", changeover: Number(r.changeover) }))}
                  />
                  <HouseRulesCard
                    formData={formData as any}
                    setFormData={setFormData as any}
                    handleInputChange={handleInputChange as any}
                    selectedPMS={selectedPMS}
                    isRolProperty={isRolProperty}
                    isFieldPopulatedByPMS={isFieldPopulatedByPMS}
                    getPMSFieldClass={getPMSFieldClass}
                  />
                  <div className="flex justify-end">
                    {isDirty && (
                      <Button type="submit" size="sm" className="h-7 text-xs" disabled={loading}>
                        <Save className="mr-1 h-3 w-3" />
                        {loading ? "Saving..." : "Save Property"}
                      </Button>
                    )}
                  </div>
                </form>
              }
            />
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Charges Tab (standalone section) */}
          <TabsContent value="charges" className="space-y-0">
            <DeferredWhen when={activeTab === "charges"}>{() => (
            <>
            <RateManagerTab
              view="charges"
              propertyId={propertyId}
              roomTypes={roomTypes}
              selectedRoomType={selectedRoomType}
              setSelectedRoomType={setSelectedRoomType}
              pmsRateTypes={pmsRateTypes}
              setPmsRateTypes={setPmsRateTypes}
              seasons={seasons}
              setSeasons={setSeasons}
              seasonRates={seasonRates}
              setSeasonRates={setSeasonRates}
              selectedPMS={selectedPMS}
              isRolProperty={isRolProperty}
              accommodationLabel={accommodationLabel}
              selectedMealTypes={selectedMealTypes}
              formData={{ currency: formData.currency, owner_email: formData.owner_email }}
              amenities={{ rate_types: pmsRateTypes, seasons }}
              isAdmin={isAdmin ?? false}
              isDev={isDev ?? false}
              isFearlessLeader={isFearlessLeader ?? false}
              setIsDirty={setIsDirty}
            />
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Room Information Tab */}
          <TabsContent value="rooms" className="space-y-0" data-field="rooms">
            <DeferredWhen when={activeTab === "rooms"}>{() => (
            <>
            <RoomManagerTab

              propertyId={propertyId}
              propertySlug={propertySlug}
              propertyWebsiteUrl={formData.property_url || undefined}
              propertyChannelType={formData.property_type}
              routeId={id}
              roomTypes={roomTypes}
              setRoomTypes={setRoomTypes}
              selectedRoomType={selectedRoomType}
              setSelectedRoomType={setSelectedRoomType}
              selectedPMS={selectedPMS}
              isRolProperty={isRolProperty}
              pmsRateTypes={pmsRateTypes}
              accommodationLabel={accommodationLabel}
              homeIconOpenNewTab={homeIconOpenNewTab}
              isDev={isDev ?? false}
              isFearlessLeader={isFearlessLeader ?? false}
              setIsDirty={setIsDirty}
              mealTypeSuggestions={mealTypeSuggestions}
              handleNewMealType={handleNewMealType}
            />
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Packages Tab */}
          <TabsContent value="packages" className="space-y-2">
            <DeferredWhen when={activeTab === "packages"}>{() => (
            <>
            <Tabs value={packagesCategory} onValueChange={(v) => setPackagesCategory(v as any)} className="w-full">
              <TabsList className="h-7">
                <TabsTrigger value="accommodations" className="text-xs h-6">
                  Accommodations
                </TabsTrigger>
                {isEvent && (
                  <TabsTrigger value="event" className="text-xs h-6">
                    Event/Wedding
                  </TabsTrigger>
                )}
                {isConference && (
                  <TabsTrigger value="conference" className="text-xs h-6">
                    Conference
                  </TabsTrigger>
                )}
              </TabsList>

              {["accommodations", "event", "conference"].map((cat) => (
                <TabsContent key={cat} value={cat} className="mt-2">
                  <div className="grid grid-cols-[180px_1fr] gap-3">
                    <Card>
                      <CardHeader className="py-1.5 px-3 flex flex-row items-center justify-between">
                        <CardTitle className="text-xs font-medium uppercase">{cat}</CardTitle>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
                          onClick={() => {
                            setSelectedPackage(null);
                            setPackageForm({
                              name: "",
                              description: "",
                              minimumStay: 1,
                              maximumStay: 1,
                              season: "",
                              periodFrom: undefined,
                              periodTo: undefined,
                              pricingType: "discount",
                              discountPercent: 0,
                              fixedAmountOff: 0,
                              fixedPrice: 0,
                              package_price: 0,
                              discount_percentage: 0,
                              isPublic: false,
                              images: [],
                              applicableRoomIds: [],
                            });
                            setPackageImages([]);
                            setIsEditPackageOpen(true);
                          }}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </CardHeader>
                      <CardContent className="py-1 px-3 space-y-0.5">
                        {packages.filter((p) => p.category === cat).length === 0 ? (
                          <p className="text-xs text-muted-foreground">No items...</p>
                        ) : (
                          packages
                            .filter((p) => p.category === cat)
                            .map((pkg) => (
                              <div
                                key={pkg.id}
                                className={cn(
                                  "py-1 px-1.5 rounded cursor-pointer hover:bg-accent flex items-center justify-between text-xs",
                                  selectedPackage?.id === pkg.id && "bg-accent",
                                )}
                                onClick={() => setSelectedPackage(pkg)}
                              >
                                <span className="truncate">{pkg.name}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-4 w-4 p-0"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deletePackage(pkg.id);
                                  }}
                                >
                                  <Trash2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            ))
                        )}
                      </CardContent>
                    </Card>

                    <Card className="flex flex-col">
                      <CardHeader className="flex flex-row items-center justify-between gap-2 py-1.5 px-3">
                        <CardTitle className="text-xs font-medium">
                          {selectedPackage ? selectedPackage.name : "No package selected"}
                        </CardTitle>
                        <div className="flex gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={!selectedPackage}
                        onClick={() => {
                          if (selectedPackage) {
                            setPackageForm({
                              name: selectedPackage.name || "",
                              description: selectedPackage.description || "",
                              minimumStay: selectedPackage.minimumStay || 1,
                              maximumStay: selectedPackage.maximumStay || 1,
                              season: selectedPackage.season || "",
                              periodFrom: selectedPackage.periodFrom ? new Date(selectedPackage.periodFrom) : undefined,
                              periodTo: selectedPackage.periodTo ? new Date(selectedPackage.periodTo) : undefined,
                              pricingType: selectedPackage.pricingType || "discount",
                              discountPercent:
                                selectedPackage.discountPercent || selectedPackage.discount_percentage || 0,
                              fixedAmountOff: selectedPackage.fixedAmountOff || 0,
                              fixedPrice: selectedPackage.fixedPrice || selectedPackage.package_price || 0,
                              package_price: selectedPackage.package_price || selectedPackage.fixedPrice || 0,
                              discount_percentage:
                                selectedPackage.discount_percentage || selectedPackage.discountPercent || 0,
                              isPublic: selectedPackage.isPublic || false,
                              images: selectedPackage.images || [],
                              applicableRoomIds:
                                selectedPackage.applicableRoomIds || selectedPackage.applicable_room_ids || [],
                            });
                            setPackageImages(selectedPackage.images || []);
                            setIsEditPackageOpen(true);
                          }
                        }}
                      >
                        Edit Package
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={!selectedPackage}
                        onClick={() => setIsPackageImagesOpen(true)}
                      >
                        Package Images
                      </Button>
                        </div>
                      </CardHeader>
                      <CardContent className="flex-1 py-2 px-3">
                        {selectedPackage ? (
                          <div className="space-y-1 text-xs text-muted-foreground">
                            <p className="whitespace-pre-line">{selectedPackage.description || "No description yet."}</p>
                            <p>
                              Stay {selectedPackage.minimumStay || 1}–{selectedPackage.maximumStay || 1} nights ·{" "}
                              {selectedPackage.isPublic ? "Public" : "Private"}
                            </p>
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground">
                            Select a package on the left, or use + to create one.
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              ))}
            </Tabs>
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Announcements Tab */}
          <TabsContent value="announcements" className="space-y-2">
            <DeferredWhen when={activeTab === "announcements"}>{() => (
            <>
            <Card>
              <CardHeader className="py-2 px-4 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Announcements</CardTitle>
                <Button
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={() => {
                    setEditingAnnouncementId(null);
                    setAnnouncementForm({
                      announcement: "",
                      order: 0,
                      startDate: undefined,
                      endDate: undefined,
                      enabled: true,
                    });
                    setIsManageAnnouncementOpen(true);
                  }}
                >
                  <Plus className="h-3 w-3" />
                  Add
                </Button>
              </CardHeader>
              <CardContent className="py-2 px-4">
                {announcements.length === 0 ? (
                  <p className="text-xs text-muted-foreground text-center py-4">No announcements yet</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-1.5 px-2 text-xs font-medium">ON</th>
                          <th className="text-left py-1.5 px-2 text-xs font-medium">MESSAGE</th>
                          <th className="text-left py-1.5 px-2 text-xs font-medium">START</th>
                          <th className="text-left py-1.5 px-2 text-xs font-medium">END</th>
                          <th className="text-left py-1.5 px-2 text-xs font-medium">#</th>
                          <th className="py-1.5 px-2 w-10"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {announcements.map((announcement) => (
                          <tr key={announcement.id} className="border-b hover:bg-muted/50">
                            <td className="py-1 px-2">
                              <Switch
                                checked={announcement.enabled}
                                onCheckedChange={() => toggleAnnouncementEnabled(announcement.id)}
                                className="scale-75"
                              />
                            </td>
                            <td className="py-1 px-2 text-xs truncate max-w-[200px]">{announcement.announcement}</td>
                            <td className="py-1 px-2 text-xs">
                              {announcement.startDate ? format(announcement.startDate, "MM/dd/yy") : "-"}
                            </td>
                            <td className="py-1 px-2 text-xs">
                              {announcement.endDate ? format(announcement.endDate, "MM/dd/yy") : "-"}
                            </td>
                            <td className="py-1 px-2 text-xs">{announcement.order}</td>
                            <td className="py-1 px-2 flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0"
                                onClick={() => editAnnouncement(announcement)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-5 w-5 p-0"
                                onClick={() => deleteAnnouncement(announcement.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
            </>
            )}</DeferredWhen>
          </TabsContent>

          {/* Integrations Tab - All Properties */}
          {propertyId && (
            <TabsContent value="integrations" className="space-y-2">
              <DeferredWhen when={activeTab === "integrations"}>{() => (
              <>
              <PropertyFormIntegrationsTab
                property={{
                  id: propertyId,
                  name: formData.name || "",
                  slug: propertySlug || propertyId,
                  brand_primary_color: brandingData.brand_primary_color || null,
                }}
              />
              </>
              )}</DeferredWhen>
            </TabsContent>
          )}

          {/* Admin Tab - Admin/Dev/FearlessLeader only */}
          {propertyId && (isAdmin || isDev || isFearlessLeader) && (
            <TabsContent value="admin" className="space-y-3">
              <DeferredWhen when={activeTab === "admin"}>{() => (
              <>
              <Alert className="border-amber-500/40 bg-amber-500/5">
                <ShieldCheck className="h-4 w-4 text-amber-600" />
                <AlertDescription className="text-xs">
                  Admin-only controls. These settings define what capabilities the property owner sees in ROLOS
                  (white-label, custom payment providers, commission/billing model). Owners never see this tab.
                </AlertDescription>
              </Alert>
              <Tabs defaultValue="overview" className="w-full" value={adminSubTab} onValueChange={setAdminSubTab}>
                <TabsList>
                  <TabsTrigger value="overview">Overview</TabsTrigger>
                  <TabsTrigger value="billing">Billing Config</TabsTrigger>
                </TabsList>
                <TabsContent value="overview" className="mt-3">
                  <AdminOverviewTab propertyId={propertyId} onNavigate={(t) => setAdminSubTab(t)} />
                </TabsContent>
                <TabsContent value="billing" className="mt-3">
                  <BillingConfigTab propertyId={propertyId} />
                  <div className="mt-4">
                    <ReferralSection propertyId={propertyId} />
                  </div>
                </TabsContent>
              </Tabs>
              </>
              )}</DeferredWhen>
            </TabsContent>
          )}
        </Tabs>
        </Suspense>
        </div>
        </div>


        {/* Embed-mode sticky Save bar */}
        {embedded && isDirty && (
          <div className="sticky bottom-0 left-0 right-0 mt-3 flex items-center justify-end gap-2 border-t bg-background/95 px-3 py-2 backdrop-blur">
            <span className="text-xs text-muted-foreground">Unsaved changes</span>
            <Button size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={loading}>
              <Save className="mr-1 h-3 w-3" />
              {loading ? "Saving..." : "Save changes"}
            </Button>
          </div>
        )}
      </div>

      {/* Manage Announcements Dialog */}
      <Dialog open={isManageAnnouncementOpen} onOpenChange={setIsManageAnnouncementOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingAnnouncementId ? "Edit Announcement" : "Add Announcement"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="announcement-text">Announcement</Label>
              <Input
                id="announcement-text"
                value={announcementForm.announcement}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, announcement: e.target.value })}
                placeholder="Enter announcement text"
              />
            </div>

            <div>
              <Label htmlFor="announcement-order">Order</Label>
              <Input
                id="announcement-order"
                type="number"
                value={announcementForm.order}
                onChange={(e) => setAnnouncementForm({ ...announcementForm, order: parseInt(e.target.value) || 0 })}
                min={0}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Start Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !announcementForm.startDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {announcementForm.startDate ? (
                        format(announcementForm.startDate, "MM/dd/yyyy")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComponent
                      mode="single"
                      selected={announcementForm.startDate}
                      onSelect={(date) => setAnnouncementForm({ ...announcementForm, startDate: date })}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>

              <div>
                <Label>End Date</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      className={cn(
                        "w-full justify-start text-left font-normal",
                        !announcementForm.endDate && "text-muted-foreground",
                      )}
                    >
                      <CalendarIcon className="mr-2 h-4 w-4" />
                      {announcementForm.endDate ? (
                        format(announcementForm.endDate, "MM/dd/yyyy")
                      ) : (
                        <span>Pick a date</span>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0">
                    <CalendarComponent
                      mode="single"
                      selected={announcementForm.endDate}
                      onSelect={(date) => setAnnouncementForm({ ...announcementForm, endDate: date })}
                      initialFocus
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={saveAnnouncement} className="bg-primary">
                {editingAnnouncementId ? "Update" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Package Dialog */}
      <Dialog open={isEditPackageOpen} onOpenChange={setIsEditPackageOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>{selectedPackage ? "Edit Package" : "New Package"}</DialogTitle>
              <div className="flex items-center gap-2">
                <Switch
                  checked={packageForm.isPublic}
                  onCheckedChange={(checked) => setPackageForm({ ...packageForm, isPublic: checked })}
                />
                <Badge variant={packageForm.isPublic ? "default" : "secondary"}>
                  {packageForm.isPublic ? "Public" : "Private"}
                </Badge>
              </div>
            </div>
          </DialogHeader>

          <div className="space-y-4">
            <div>
              <Label htmlFor="package-name">Name*</Label>
              <Input
                id="package-name"
                value={packageForm.name}
                onChange={(e) => setPackageForm({ ...packageForm, name: e.target.value })}
                placeholder="Package name"
              />
            </div>

            <div>
              <Label htmlFor="package-description">Description</Label>
              <Textarea
                className="text-xs"
                id="package-description"
                value={packageForm.description}
                onChange={(e) => setPackageForm({ ...packageForm, description: e.target.value })}
                rows={4}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="minimum-stay">Minimum Stay</Label>
                <Input
                  id="minimum-stay"
                  type="number"
                  value={packageForm.minimumStay}
                  onChange={(e) => setPackageForm({ ...packageForm, minimumStay: parseInt(e.target.value) })}
                  min={1}
                />
              </div>
              <div>
                <Label htmlFor="maximum-stay">Maximum Stay</Label>
                <Input
                  id="maximum-stay"
                  type="number"
                  value={packageForm.maximumStay}
                  onChange={(e) => setPackageForm({ ...packageForm, maximumStay: parseInt(e.target.value) })}
                  min={1}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="package-season">Seasons</Label>
              <Select
                value={packageForm.season}
                onValueChange={(value) => setPackageForm({ ...packageForm, season: value })}
              >
                <SelectTrigger className="text-xs h-7">
                  <SelectValue placeholder="Select season" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="08/05/2025-30/09/2025">08/05/2025-30/09/2025</SelectItem>
                  <SelectItem value="summer">Summer</SelectItem>
                  <SelectItem value="winter">Winter</SelectItem>
                  <SelectItem value="spring">Spring</SelectItem>
                  <SelectItem value="autumn">Autumn</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Period</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>From / To</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !packageForm.periodFrom && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {packageForm.periodFrom ? format(packageForm.periodFrom, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={packageForm.periodFrom}
                        onSelect={(date) => setPackageForm({ ...packageForm, periodFrom: date })}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
                <div>
                  <Label>&nbsp;</Label>
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        className={cn(
                          "w-full justify-start text-left font-normal",
                          !packageForm.periodTo && "text-muted-foreground",
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {packageForm.periodTo ? format(packageForm.periodTo, "PPP") : <span>Pick a date</span>}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0">
                      <CalendarComponent
                        mode="single"
                        selected={packageForm.periodTo}
                        onSelect={(date) => setPackageForm({ ...packageForm, periodTo: date })}
                        initialFocus
                        className="pointer-events-auto"
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-semibold">Pricing Config</h3>
              <RadioGroup
                value={packageForm.pricingType}
                onValueChange={(value) => setPackageForm({ ...packageForm, pricingType: value })}
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="discount" id="pkg-discount" />
                  <Label htmlFor="pkg-discount">Discount (%)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="fixed-off" id="pkg-fixed-off" />
                  <Label htmlFor="pkg-fixed-off">Fixed Amount Off</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="fixed-price" id="pkg-fixed-price" />
                  <Label htmlFor="pkg-fixed-price">Fixed Price</Label>
                </div>
              </RadioGroup>

              {/* Value input based on selected pricing type */}
              {packageForm.pricingType === "discount" && (
                <div className="mt-3 space-y-1">
                  <Label htmlFor="pkg-discount-val">Discount Percentage (%)</Label>
                  <Input
                    id="pkg-discount-val"
                    type="number"
                    min={0}
                    max={100}
                    value={packageForm.discountPercent || ""}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setPackageForm({ ...packageForm, discountPercent: val, discount_percentage: val });
                    }}
                    placeholder="e.g. 20"
                  />
                </div>
              )}
              {packageForm.pricingType === "fixed-off" && (
                <div className="mt-3 space-y-1">
                  <Label htmlFor="pkg-fixed-off-val">Amount Off (currency)</Label>
                  <Input
                    id="pkg-fixed-off-val"
                    type="number"
                    min={0}
                    value={packageForm.fixedAmountOff || ""}
                    onChange={(e) =>
                      setPackageForm({ ...packageForm, fixedAmountOff: parseFloat(e.target.value) || 0 })
                    }
                    placeholder="e.g. 500"
                  />
                </div>
              )}
              {packageForm.pricingType === "fixed-price" && (
                <div className="mt-3 space-y-1">
                  <Label htmlFor="pkg-fixed-price-val">Fixed Package Price (total)</Label>
                  <Input
                    id="pkg-fixed-price-val"
                    type="number"
                    min={0}
                    value={packageForm.fixedPrice || ""}
                    onChange={(e) => {
                      const val = parseFloat(e.target.value) || 0;
                      setPackageForm({ ...packageForm, fixedPrice: val, package_price: val });
                    }}
                    placeholder="e.g. 5000"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2 text-sm font-medium"></th>
                      <th className="text-center p-2 text-sm font-medium">Room Only</th>
                      <th className="text-center p-2 text-sm font-medium">Bed & Breakfast</th>
                      <th className="text-center p-2 text-sm font-medium">Self Catering</th>
                      <th className="text-center p-2 text-sm font-medium">Half Board</th>
                      <th className="text-center p-2 text-sm font-medium">Full Board</th>
                      <th className="text-center p-2 text-sm font-medium">All Included</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roomTypes.map((room) => {
                      const roomIdStr = String(room.id);
                      const isRoomChecked = packageForm.applicableRoomIds.includes(roomIdStr);
                      return (
                        <tr key={room.id} className="border-b">
                          <td className="p-2 text-sm">
                            <div className="flex items-center gap-2">
                              <Checkbox
                                checked={isRoomChecked}
                                onCheckedChange={(checked) => {
                                  const updated = checked
                                    ? [...packageForm.applicableRoomIds, roomIdStr]
                                    : packageForm.applicableRoomIds.filter((id) => id !== roomIdStr);
                                  setPackageForm({ ...packageForm, applicableRoomIds: updated });
                                }}
                              />
                              <span>{room.name}</span>
                              <Link className="h-4 w-4 text-primary" />
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">UnitRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">SingleRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">PerPersonRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">UnitRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">SingleRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">PerPersonRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">UnitRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">SingleRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">PerPersonRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">UnitRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">SingleRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">PerPersonRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">UnitRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">SingleRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">PerPersonRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                            </div>
                          </td>
                          <td className="p-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">UnitRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">SingleRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-blue-600">PerPersonRate</span>
                                <Input className="h-8 text-xs" placeholder="Not Available" />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditPackageOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (selectedPackage) {
                    // Update existing package
                    const normalizedPackage = normalizePackage({
                      ...selectedPackage,
                      ...packageForm,
                      category: packagesCategory,
                    });
                    const updated = packages.map((p) => (p.id === selectedPackage.id ? normalizedPackage : p));
                    setPackages(updated);
                    setSelectedPackage(normalizedPackage);
                    setIsEditPackageOpen(false);
                    setIsDirty(true);
                    toast({ title: "Package updated", description: "The package has been updated successfully." });
                  } else {
                    addNewPackage();
                  }
                }}
              >
                {selectedPackage ? "Update Package" : "Create Package"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Package Images Dialog */}
      <Dialog open={isPackageImagesOpen} onOpenChange={setIsPackageImagesOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle>Package Images</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div
              className={cn(
                "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                isPackageImageDragging ? "border-primary bg-primary/5" : "border-border",
              )}
              onDragOver={(e) => {
                e.preventDefault();
                setIsPackageImageDragging(true);
              }}
              onDragLeave={() => setIsPackageImageDragging(false)}
              onDrop={handlePackageImageDrop}
              onClick={() => document.getElementById("package-image-upload")?.click()}
            >
              <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Drag and drop images here, or click to select</p>
              <input
                id="package-image-upload"
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handlePackageImageUpload}
              />
            </div>

            {packageImages.length > 0 && (
              <div className="grid grid-cols-4 gap-4">
                {packageImages.map((imageUrl, index) => (
                  <div key={index} className="relative group">
                    <img src={imageUrl} alt={`Package ${index + 1}`} className="w-full h-32 object-cover rounded-lg" />
                    <Button
                      size="sm"
                      variant="destructive"
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => removePackageImage(imageUrl)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Sync Editorial Confirmation Dialog */}
      <AlertDialog open={isSyncEditorialDialogOpen} onOpenChange={setIsSyncEditorialDialogOpen}>
        <AlertDialogContent>
          {(() => {
            const pmsCapability = getPMSEditorialCapability(selectedPMS);
            const syncableFields = pmsCapability ? getSyncableFields(pmsCapability) : [];
            return (
              <>
                <AlertDialogHeader>
                  <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
                    <Cloud className="h-5 w-5" />
                    {pmsCapability?.syncButtonLabel || `Sync Editorial from ${getPMSDisplayName(selectedPMS)}`}
                  </AlertDialogTitle>
                  <AlertDialogDescription asChild>
                    <div className="space-y-3">
                      <p>
                        {pmsCapability?.syncDescription ||
                          `This will fetch editorial content from ${getPMSDisplayName(selectedPMS)}.`}
                      </p>

                      {syncableFields.length > 0 && (
                        <div className="text-sm space-y-1">
                          <p className="font-medium text-foreground">Fields that will be synced:</p>
                          <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
                            {syncableFields.map(({ field, authority }) => (
                              <li key={field}>
                                {field}
                                <span className="text-xs ml-1">({getEditorialAuthorityLabel(authority)})</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {pmsCapability?.notes && <p className="text-xs text-muted-foreground">{pmsCapability.notes}</p>}

                      <p className="text-sm font-medium text-amber-600">
                        ⚠️ This may overwrite existing editorial content.
                      </p>
                    </div>
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleSyncEditorial}>
                    {pmsCapability?.syncButtonLabel || "Sync Editorial"}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </>
            );
          })()}
        </AlertDialogContent>
      </AlertDialog>

      {/* Hostfully Warning Dialog */}
      <AlertDialog open={showHostfullyWarning} onOpenChange={setShowHostfullyWarning}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Hostfully Connection Required
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3">
                <p>
                  Hostfully properties can only be connected through an owner's PMS credentials in the Team Dashboard.
                </p>
                <div className="text-sm space-y-1">
                  <p className="font-medium text-foreground">To connect a Hostfully property:</p>
                  <ol className="list-decimal list-inside text-muted-foreground space-y-0.5 ml-2">
                    <li>
                      Go to <strong>Team Dashboard → Users</strong>
                    </li>
                    <li>Find or create the property owner</li>
                    <li>Connect their Hostfully account (Agency UID + API Key)</li>
                    <li>Import properties from their Hostfully account</li>
                  </ol>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowHostfullyWarning(false)}>Understood</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Unsaved Changes Confirmation */}
      <AlertDialog
        open={pendingNavPath !== null}
        onOpenChange={(open) => {
          if (!open) setPendingNavPath(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unsaved changes</AlertDialogTitle>
            <AlertDialogDescription>
              You have unsaved changes on this property. Are you sure you want to leave without saving?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingNavPath(null)}>Stay on page</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const path = pendingNavPath;
                setPendingNavPath(null);
                if (path) navigate(path);
              }}
            >
              Leave without saving
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Website Auto-fill Modal */}
      <WebsiteSyncModal
        open={websiteSyncModalOpen}
        onOpenChange={setWebsiteSyncModalOpen}
        suggestions={websiteSyncSuggestions}
        scrapedUrl={websiteSyncUrl}
        onApply={(selectedSuggestions) => {
          let appliedCount = 0;
          selectedSuggestions.forEach((suggestion) => {
            const key = suggestion.stateVariable.replace("formData.", "");
            if (key === "selectedFacilities" && Array.isArray(suggestion.suggested)) {
              setSelectedFacilities(suggestion.suggested as string[]);
              appliedCount++;
            } else if (key === "starRating" && typeof suggestion.suggested === "number") {
              setStarRating(suggestion.suggested);
              appliedCount++;
            } else if (key === "uploadedImages" && Array.isArray(suggestion.suggested)) {
              setUploadedImages((prev) => [...new Set([...prev, ...(suggestion.suggested as string[])])]);
              appliedCount++;
            } else if (key.startsWith("formData.")) {
              // Should not happen after replace, but safety net
              setFormData((prev) => ({ ...prev, [key.replace("formData.", "")]: suggestion.suggested }));
              appliedCount++;
            } else {
              // Default: set on formData (covers telephone, description, address, etc.)
              setFormData((prev) => ({ ...prev, [key]: suggestion.suggested }));
              appliedCount++;
            }
          });
          setIsDirty(true);
          toast({
            title: "Fields updated",
            description: `Applied ${appliedCount} suggestion${appliedCount !== 1 ? "s" : ""} from website`,
          });
        }}
      />
    </FormShell>
  );
}


