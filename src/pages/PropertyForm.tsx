import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RoomTypeDataViewer, ExpandableDataViewer, RateTypeItem } from "@/components/ExpandableDataViewer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { getRoomUrl } from "@/lib/config";
import { parseBedConfiguration, BED_TYPES, BedEntry } from "@/lib/bedConfig";
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
} from "lucide-react";
import { StarRating } from "@/components/StarRating";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";
import { PropertyMap } from "@/components/PropertyMap";
import { TagInput } from "@/components/TagInput";
import { getPMSFieldClass, getPMSDisplayName, isFieldPopulatedByPMS } from "@/lib/pmsFieldConfig";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import RichTextEditor from "@/components/RichTextEditor";

// Map PMS system types to icons
const getPMSIcon = (systemType: string): LucideIcon => {
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
    default:
      return Building2;
  }
};

// Schema factory to handle conditional address validation
const createPropertySchema = (noStreetAddress: boolean) =>
  z.object({
    name: z.string().min(1, "Property name is required").max(200),
    property_type: z.string().min(1, "Property type is required"),
    contact_email: z.string().email("Invalid email address"),
    telephone: z.string().optional(),
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
  });

// Create a base schema for type inference
const propertySchema = createPropertySchema(false);
type PropertyFormData = z.infer<typeof propertySchema>;

export default function PropertyForm() {
  const navigate = useNavigate();
  const { id } = useParams(); // Can be UUID or slug
  const { toast } = useToast();
  const { isDev } = useAuth();
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [owners, setOwners] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);
  const [propertySlug, setPropertySlug] = useState<string>("");
  const [propertyId, setPropertyId] = useState<string | null>(null); // Actual UUID for DB operations
  const [homeIconOpenNewTab, setHomeIconOpenNewTab] = useState(true);

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

  // Helper to navigate with unsaved changes check
  const handleNavigate = (path: string) => {
    if (isDirty) {
      const confirmed = window.confirm("You have unsaved changes. Are you sure you want to leave without saving?");
      if (!confirmed) return;
    }
    navigate(path);
  };

  // Load owners list - only users with 'user' role (property owners)
  const [ownersLoaded, setOwnersLoaded] = useState(false);

  useEffect(() => {
    const loadOwners = async () => {
      // Get user IDs that have 'user' or 'admin' role (both can be property owners)
      const { data: ownerRoles } = await supabase.from("user_roles").select("user_id").in("role", ["user", "admin"]);

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

  // Load home icon new tab setting
  useEffect(() => {
    const loadHomeIconSetting = async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("key_value")
        .eq("key_name", "HOME_ICON_OPEN_NEW_TAB")
        .maybeSingle();
      
      if (data?.key_value) {
        setHomeIconOpenNewTab(data.key_value === "true");
      }
    };
    loadHomeIconSetting();
  }, []);

  // Offerings
  const [isAccommodation, setIsAccommodation] = useState(true);
  const [isVenues, setIsVenues] = useState(false);
  const [isEvent, setIsEvent] = useState(false);
  const [isConference, setIsConference] = useState(false);

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

  // Property source (PMS system)
  const [selectedPMS, setSelectedPMS] = useState<string>("");
  const [availablePMSSystems, setAvailablePMSSystems] = useState<
    { key_name: string; name: string; system_type: string }[]
  >([]);
  const [bensonPropertyCode, setBensonPropertyCode] = useState<string>("");
  const [isSyncingPms, setIsSyncingPms] = useState(false);
  const [lastPmsSync, setLastPmsSync] = useState<Date | null>(null);

  // Store existing external IDs to preserve when PMS changes
  const [existingExternalIds, setExistingExternalIds] = useState<{
    nightsbridge_bb_id?: string | null;
    semper_venue_id?: string | null;
    semper_channel_id?: string | null;
    semper_account_id?: string | null;
    semper_agent_id?: string | null;
    siteminder_id?: string | null;
    checkfront_id?: string | null;
    benson_id?: string | null;
    tripadvisor_id?: string | null;
  }>({});
  const [tripadvisorId, setTripadvisorId] = useState<string>("");
  const [existingBensonPropertyCode, setExistingBensonPropertyCode] = useState<string | null>(null);

  // Sync room/rate types from PMS (Benson)
  const syncFromBenson = async () => {
    if (!bensonPropertyCode || !propertyId) {
      toast({
        title: "Cannot Sync",
        description: "Please save the property with a Benson property code first",
        variant: "destructive",
      });
      return;
    }

    setIsSyncingPms(true);
    try {
      const { data, error } = await supabase.functions.invoke("benson-api", {
        body: {
          action: "fetch_property_data",
          property_id: propertyId,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      let hasChanges = false;

      // Update room types from PMS with all available fields
      if (data?.roomTypes && Array.isArray(data.roomTypes)) {
        const pmsRoomTypes = data.roomTypes.map((rt: any) => {
          // Track which fields are populated from PMS
          const pmsSyncedFields: string[] = ['name', 'pmsRoomId'];
          
          const roomData: any = {
            id: rt.id?.toString() || Date.now().toString(),
            name: rt.name || `Room Type ${rt.id}`,
            url: "",
            selected: false,
            pms_id: rt.id,
            pmsRoomId: rt.id?.toString() || "",
            pms_synced: true,
          };
          
          // Map description
          if (rt.description) {
            roomData.description = rt.description;
            pmsSyncedFields.push('description');
          }
          
          // Map guest capacity
          if (rt.maxGuests !== undefined) {
            roomData.maxPeople = rt.maxGuests;
            pmsSyncedFields.push('maxPeople');
          }
          if (rt.minGuests !== undefined) {
            roomData.minGuests = rt.minGuests;
            pmsSyncedFields.push('minGuests');
          }
          
          // Calculate max adults (maxGuests minus potential children/teens)
          if (rt.maxGuests !== undefined) {
            roomData.maxAdults = rt.maxGuests;
            pmsSyncedFields.push('maxAdults');
          }
          
          // Map children settings
          if (rt.allowChildren !== undefined) {
            roomData.allowChildren = rt.allowChildren;
            pmsSyncedFields.push('allowChildren');
            if (rt.allowChildren && rt.childMaxAge) {
              roomData.maxChildren = Math.min(rt.maxGuests || 2, 4); // Reasonable default
              pmsSyncedFields.push('maxChildren');
            }
            if (rt.childMinAge !== undefined) {
              roomData.childMinAge = rt.childMinAge;
              pmsSyncedFields.push('childMinAge');
            }
            if (rt.childMaxAge !== undefined) {
              roomData.childMaxAge = rt.childMaxAge;
              pmsSyncedFields.push('childMaxAge');
            }
          }
          
          // Map teen settings
          if (rt.allowTeens !== undefined) {
            roomData.allowTeens = rt.allowTeens;
            pmsSyncedFields.push('allowTeens');
            if (rt.teenMinAge !== undefined) {
              roomData.teenMinAge = rt.teenMinAge;
              pmsSyncedFields.push('teenMinAge');
            }
            if (rt.teenMaxAge !== undefined) {
              roomData.teenMaxAge = rt.teenMaxAge;
              pmsSyncedFields.push('teenMaxAge');
            }
          }
          
          // Map infant settings
          if (rt.allowInfants !== undefined) {
            roomData.allowInfants = rt.allowInfants;
            pmsSyncedFields.push('allowInfants');
            if (rt.infantMinAge !== undefined) {
              roomData.infantMinAge = rt.infantMinAge;
              pmsSyncedFields.push('infantMinAge');
            }
            if (rt.infantMaxAge !== undefined) {
              roomData.infantMaxAge = rt.infantMaxAge;
              pmsSyncedFields.push('infantMaxAge');
            }
          }
          
          // Map additional Benson fields
          if (rt.minAgeCategory) {
            roomData.minAgeCategory = rt.minAgeCategory;
            pmsSyncedFields.push('minAgeCategory');
          }
          if (rt.minAdultsToOfferNonAdultRates !== undefined) {
            roomData.minAdultsToOfferNonAdultRates = rt.minAdultsToOfferNonAdultRates;
            pmsSyncedFields.push('minAdultsToOfferNonAdultRates');
          }
          
          // Include nested arrays from Benson API for exploration in configurator
          if (rt.roomsAvailablePerNight && Array.isArray(rt.roomsAvailablePerNight)) {
            roomData.roomsAvailablePerNight = rt.roomsAvailablePerNight;
            pmsSyncedFields.push('roomsAvailablePerNight');
          }
          if (rt.rateTypes && Array.isArray(rt.rateTypes)) {
            roomData.rateTypes = rt.rateTypes;
            pmsSyncedFields.push('rateTypes');
          }
          
          // Store linked rate type IDs extracted from nested rateTypes
          if (rt.linkedRateTypeIds && Array.isArray(rt.linkedRateTypeIds)) {
            roomData.linkedRateTypeIds = rt.linkedRateTypeIds;
          } else if (rt.rateTypes && Array.isArray(rt.rateTypes)) {
            // Extract linked rate type IDs from nested rateTypes array
            roomData.linkedRateTypeIds = rt.rateTypes.map((rate: any) => rate.rateTypeId);
          }
          
          // Store the list of PMS-synced fields
          roomData.pms_synced_fields = pmsSyncedFields;
          
          return roomData;
        });

        // Merge with existing room types - update existing or add new
        const updatedRoomTypes = [...roomTypes];
        let newCount = 0;
        let updatedCount = 0;

        pmsRoomTypes.forEach((pmsRoom: any) => {
          const existingIndex = updatedRoomTypes.findIndex(
            (r) => r.pms_id === pmsRoom.pms_id || r.name.toLowerCase() === pmsRoom.name.toLowerCase(),
          );

          if (existingIndex >= 0) {
            // Update existing room - merge PMS data while preserving local-only fields
            const existing = updatedRoomTypes[existingIndex];
            
            // Determine linked rate types - use existing if manually configured, otherwise use PMS data
            const existingLinked = existing.linkedRateTypes;
            const pmsLinkedIds = pmsRoom.linkedRateTypeIds || [];
            // Only preserve existing if it has values AND they're valid (not just an empty array)
            const shouldPreserveExisting = Array.isArray(existingLinked) && existingLinked.length > 0;
            
            updatedRoomTypes[existingIndex] = {
              ...existing,
              ...pmsRoom,
              // CRITICAL: Preserve original room ID for URL consistency
              id: existing.id,
              // Preserve local fields that aren't from PMS
              url: existing.url || pmsRoom.url,
              images: existing.images || [],
              facilities: existing.facilities || [],
              amenities: existing.amenities || [],
              rate_info: existing.rate_info || [],
              // Store available rate types from PMS (used to filter options in configurator)
              availableRateTypes: pmsLinkedIds,
              // Default linkedRateTypes to all available if not already set or if empty
              linkedRateTypes: shouldPreserveExisting ? existingLinked : pmsLinkedIds,
            };
            updatedCount++;
          } else {
            // Add new room type with defaults
            updatedRoomTypes.push({
              ...pmsRoom,
              url: "",
              numRooms: 1,
              bedConfiguration: "",
              roomSize: 0,
              bathrooms: 1,
              minStay: 1,
              maxStay: 0,
              rateType: "per-unit",
              splitPercent: 0,
              images: [],
              facilities: [],
              amenities: [],
              rate_info: [],
              // Store available rate types from PMS (used to filter options in configurator)
              availableRateTypes: pmsRoom.linkedRateTypeIds || [],
              // Pre-populate linked rate types from PMS (all selected by default)
              linkedRateTypes: pmsRoom.linkedRateTypeIds || [],
            });
            newCount++;
          }
        });

        if (newCount > 0 || updatedCount > 0) {
          setRoomTypes(updatedRoomTypes);
          hasChanges = true;
        }

        toast({
          title: "Room Types Synced",
          description: `Found ${data.roomTypes.length} room types. ${newCount} new, ${updatedCount} updated.`,
        });
      }

      // Store rate types as a separate array with all Benson API fields
      if (data?.rateTypes && Array.isArray(data.rateTypes) && data.rateTypes.length > 0) {
        console.log("Rate types from Benson:", data.rateTypes);
        
        const importedRateTypes = data.rateTypes.map((rt: any) => ({
          id: rt.id,
          name: rt.name || `Rate Type ${rt.id}`,
          description: rt.description || null,
          priceType: rt.priceType || null,
          minAdvanceDays: rt.minAdvanceDays ?? null,
          maxAdvanceDays: rt.maxAdvanceDays ?? null,
          minStayDays: rt.minStayDays ?? null,
          maxStayDays: rt.maxStayDays ?? null,
          stayPayStayNights: rt.stayPayStayNights ?? null,
          stayPayDiscountNights: rt.stayPayDiscountNights ?? null,
          stayPayDiscountPercentage: rt.stayPayDiscountPercentage ?? null,
          pms_synced: true,
        }));
        
        // Merge with existing rate types (update existing, add new)
        const updatedRateTypes = [...pmsRateTypes];
        let newRateTypeCount = 0;
        let updatedRateTypeCount = 0;
        
        importedRateTypes.forEach((imported: any) => {
          const existingIndex = updatedRateTypes.findIndex(
            (rt) => rt.id === imported.id || rt.name.toLowerCase() === imported.name.toLowerCase()
          );
          
          if (existingIndex >= 0) {
            updatedRateTypes[existingIndex] = { ...updatedRateTypes[existingIndex], ...imported };
            updatedRateTypeCount++;
          } else {
            updatedRateTypes.push(imported);
            newRateTypeCount++;
          }
        });
        
        setPmsRateTypes(updatedRateTypes);
        hasChanges = true;
        toast({
          title: "Rate Types Synced",
          description: `Found ${data.rateTypes.length} rate types. ${newRateTypeCount} new, ${updatedRateTypeCount} updated.`,
        });
      }

      // Store rates per room type - group by roomTypeId
      if (data?.rates && Array.isArray(data.rates) && data.rates.length > 0) {
        console.log("Rates data from Benson:", data.rates.length, "rate entries");
        
        // Group rates by roomTypeId
        const ratesByRoomType: Record<number, any[]> = {};
        data.rates.forEach((rate: any) => {
          if (!ratesByRoomType[rate.roomTypeId]) {
            ratesByRoomType[rate.roomTypeId] = [];
          }
          ratesByRoomType[rate.roomTypeId].push({
            rateTypeId: rate.rateTypeId,
            rateTypeName: rate.rateTypeName,
            date: rate.date,
            roomAmount: rate.roomAmount,
            adultAmount1: rate.adultAmount1,
            adultAmount2: rate.adultAmount2,
            teenAmount: rate.teenAmount,
            childAmount: rate.childAmount,
            infantAmount: rate.infantAmount,
          });
        });
        
        // Update room types with their rates
        setRoomTypes(prev => prev.map(room => {
          const pmsId = room.pms_id;
          if (pmsId && ratesByRoomType[pmsId]) {
            return {
              ...room,
              pms_rates: ratesByRoomType[pmsId],
              pms_rates_synced_at: new Date().toISOString(),
            };
          }
          return room;
        }));
        
        hasChanges = true;
        toast({
          title: "Rates Synced",
          description: `Stored ${data.rates.length} rate entries across ${Object.keys(ratesByRoomType).length} room types.`,
        });
      }

      // Trigger dirty state if any changes were made
      if (hasChanges) {
        setIsDirty(true);
        toast({
          title: "Changes Detected",
          description: "PMS data has been updated. Save to persist changes.",
          variant: "default",
        });
      }

      setLastPmsSync(new Date());
    } catch (err: any) {
      console.error("Error syncing from Benson:", err);
      toast({
        title: "Sync Failed",
        description: err.message || "Failed to sync from Benson. Check API credentials.",
        variant: "destructive",
      });
    } finally {
      setIsSyncingPms(false);
    }
  };

  // Load available PMS systems - use static list of supported systems
  useEffect(() => {
    const supportedPMSSystems = [
      { key_name: "benson", name: "Benson", system_type: "benson" },
      { key_name: "checkfront", name: "Checkfront", system_type: "checkfront" },
      { key_name: "mews", name: "Mews", system_type: "mews" },
      { key_name: "nightsbridge", name: "NightsBridge", system_type: "nightsbridge" },
      { key_name: "opera", name: "Opera", system_type: "opera" },
      { key_name: "semper", name: "Semper", system_type: "semper" },
      { key_name: "siteminder", name: "SiteMinder", system_type: "siteminder" },
    ];
    setAvailablePMSSystems(supportedPMSSystems);
  }, []);

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

  const handleGoogleMapsLinkChange = (url: string) => {
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
  });

  const [starRating, setStarRating] = useState(0);
  const [selectedFacilities, setSelectedFacilities] = useState<string[]>([]);
  const [cancellationPolicies, setCancellationPolicies] = useState([
    { forfeit: "10", type: "% of Total", days: "999" },
    { forfeit: "100", type: "% of Total", days: "30" },
  ]);
  const [uploadedImages, setUploadedImages] = useState<string[]>([]);
  const [isDragging, setIsDragging] = useState(false);

  // Room types state with full data structure
  const [roomTypes, setRoomTypes] = useState<any[]>([
    {
      id: "1",
      name: "Holiday House",
      url: "",
      selected: true,
      numRooms: 1,
      pmsRoomType: "",
      pmsRoomId: "",
      description: "",
      extraPersonPolicy: "",
      bedConfiguration: [] as BedEntry[],
      roomSize: 0,
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
      mealTypes: [] as string[],
    },
  ]);
  const [selectedRoomType, setSelectedRoomType] = useState<string>("1");
  const [isRoomImageUploading, setIsRoomImageUploading] = useState(false);

  const addRoomType = () => {
    const newRoom = {
      id: Date.now().toString(),
      name: "New Room Type",
      url: "",
      selected: false,
      numRooms: 1,
      pmsRoomType: "",
      pmsRoomId: "",
      description: "",
      extraPersonPolicy: "",
      bedConfiguration: [] as BedEntry[],
      roomSize: 0,
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
  const toggleRoomRateTypeLink = (roomId: string, rateTypeId: number) => {
    setRoomTypes(roomTypes.map(room => {
      if (room.id === roomId) {
        const linked = room.linkedRateTypes || [];
        const isLinked = linked.includes(rateTypeId);
        return {
          ...room,
          linkedRateTypes: isLinked 
            ? linked.filter((id: number) => id !== rateTypeId)
            : [...linked, rateTypeId]
        };
      }
      return room;
    }));
    setIsDirty(true);
  };

  // Get linked rate types for a room
  const getRoomLinkedRateTypes = (roomId: string): number[] => {
    const room = roomTypes.find(r => r.id === roomId);
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

  // Helper to ensure a value is an array (handles JSON object vs array edge cases)
  const ensureArray = (value: any): string[] => {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    return [];
  };

  // Helper to check if a room field is synced from PMS
  const isRoomFieldPmsSynced = (roomId: string, fieldName: string): boolean => {
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

  const handleRoomImageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsRoomImageUploading(true);
    const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
    const existingImages = currentRoom?.images || [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;

      try {
        const fileExt = file.name.split(".").pop();
        const fileName = `room-${selectedRoomType}-${Date.now()}-${i}.${fileExt}`;
        const filePath = `rooms/${fileName}`;

        const { error: uploadError } = await supabase.storage.from("property-images").upload(filePath, file);

        if (uploadError) throw uploadError;

        const {
          data: { publicUrl },
        } = supabase.storage.from("property-images").getPublicUrl(filePath);

        existingImages.push(publicUrl);
      } catch (error) {
        toast({
          title: "Upload failed",
          description: "Failed to upload room image",
          variant: "destructive",
        });
      }
    }

    setRoomTypes(roomTypes.map((r) => (r.id === selectedRoomType ? { ...r, images: existingImages } : r)));
    setIsDirty(true);
    setIsRoomImageUploading(false);
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
  const [rateBreakdownGroupBy, setRateBreakdownGroupBy] = useState<'season' | 'mealType'>('season');

  // Toggle season expand/collapse
  const toggleSeasonExpanded = (seasonId: string) => {
    setExpandedSeasons(prev => ({ ...prev, [seasonId]: !prev[seasonId] }));
  };

  // Toggle meal type expand/collapse
  const toggleMealTypeExpanded = (mealType: string) => {
    setExpandedMealTypes(prev => ({ ...prev, [mealType]: !prev[mealType] }));
  };

  // Calculate min/max rates for a season across all meal types (room-specific)
  const getSeasonRateSummary = (seasonId: string, roomId: string) => {
    const rateFields = ['roomAmount', 'adultAmount', 'teenAmount', 'childAmount', 'infantAmount'] as const;
    let minRate = Infinity;
    let maxRate = -Infinity;

    // Use room-specific meal types
    const room = roomTypes.find(r => r.id === roomId);
    const roomMealTypes = room?.mealTypes || [];
    
    roomMealTypes.forEach((mealType: string) => {
      const key = `${seasonId}-${mealType}`;
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
      max: maxRate === -Infinity ? 0 : maxRate
    };
  };

  // Calculate min/max rates for a meal type across all seasons
  const getMealTypeRateSummary = (mealType: string, roomId: string) => {
    const rateFields = ['roomAmount', 'adultAmount', 'teenAmount', 'childAmount', 'infantAmount'] as const;
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
      max: maxRate === -Infinity ? 0 : maxRate
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
  const [seasonRates, setSeasonRates] = useState<Record<string, Record<string, { 
    roomAmount: number; 
    adultAmount: number; 
    teenAmount: number; 
    childAmount: number; 
    infantAmount: number;
  }>>>({});

  // PMS Rate Types state (imported from Benson/other PMS) - full Benson API spec
  const [pmsRateTypes, setPmsRateTypes] = useState<{
    id: number;
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
    pms_synced?: boolean;
  }[]>([]);

  // Season CRUD functions
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
      // Update existing season
      setSeasons(seasons.map(s => s.id === editingSeason.id ? {
        ...s,
        name: seasonForm.name,
        title,
        from: seasonForm.from,
        to: seasonForm.to,
        minStay: seasonForm.minStay,
        maxStay: seasonForm.maxStay,
      } : s));
      toast({ title: "Season updated", description: "Season has been updated successfully." });
    } else {
      // Add new season
      const newSeason = {
        id: Date.now().toString(),
        name: seasonForm.name,
        title,
        from: seasonForm.from,
        to: seasonForm.to,
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
        minStay: 2,
        maxStay: 0,
      },
      {
        id: `autumn-${Date.now() + 1}`,
        name: "Autumn (Shoulder)",
        title: "Autumn (Shoulder)",
        from: `${currentYear}-03-01`,
        to: `${currentYear}-05-31`,
        minStay: 1,
        maxStay: 0,
      },
      {
        id: `winter-${Date.now() + 2}`,
        name: "Winter (Low)",
        title: "Winter (Low)",
        from: `${currentYear}-06-01`,
        to: `${currentYear}-08-31`,
        minStay: 1,
        maxStay: 0,
      },
      {
        id: `spring-${Date.now() + 3}`,
        name: "Spring (Shoulder)",
        title: "Spring (Shoulder)",
        from: `${currentYear}-09-01`,
        to: `${currentYear}-11-30`,
        minStay: 1,
        maxStay: 0,
      },
    ];
    setSeasons(defaultSeasons);
    setIsDirty(true);
    toast({ title: "Default seasons created", description: "4 Southern Hemisphere seasons have been added." });
  };

  const deleteSeason = (seasonId: string) => {
    setSeasons(seasons.filter(s => s.id !== seasonId));
    // Also clean up rates for this season
    const updatedRates = { ...seasonRates };
    Object.keys(updatedRates).forEach(roomId => {
      if (updatedRates[roomId][seasonId]) {
        delete updatedRates[roomId][seasonId];
      }
    });
    setSeasonRates(updatedRates);
    setIsDirty(true);
    toast({ title: "Season deleted", description: "Season has been removed." });
  };

  // Rate update function
  type RateField = 'roomAmount' | 'adultAmount' | 'teenAmount' | 'childAmount' | 'infantAmount';
  const updateSeasonRate = (roomId: string, seasonId: string, field: RateField, value: number) => {
    setSeasonRates(prev => ({
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
    isPublic: false,
    images: [] as string[],
  });
  const [packageImages, setPackageImages] = useState<string[]>([]);
  const [isPackageImageDragging, setIsPackageImageDragging] = useState(false);

  const addNewPackage = () => {
    const newPackage = {
      id: Date.now().toString(),
      ...packageForm,
      category: packagesCategory,
    };
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
      isPublic: false,
      images: [],
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
  const [announcementForm, setAnnouncementForm] = useState({
    announcement: "",
    order: 0,
    startDate: undefined as Date | undefined,
    endDate: undefined as Date | undefined,
    enabled: true,
  });

  // Active tab state
  const [activeTab, setActiveTab] = useState("general");

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

          // Populate form data
          const amenities = data.amenities as any;
          const houseRules = amenities?.house_rules || {};

          setFormData({
            name: data.name || "",
            property_type: data.property_type || "",
            contact_email: amenities?.contact?.email || "",
            telephone: amenities?.contact?.telephone || "",
            currency: amenities?.currency || "ZAR",
            owner_name: data.owner_name || "",
            owner_email: data.owner_email || "",
            country: data.country || "South Africa",
            city: data.city || "",
            address: data.address || "",
            suburb: amenities?.address_details?.suburb || "",
            postal_code: amenities?.address_details?.postal_code || "",
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
            has_vat: amenities?.banking?.has_vat ?? !!amenities?.banking?.vat_number,
            vat_number: amenities?.banking?.vat_number || "",
            property_registration: amenities?.banking?.property_registration || "",
            bank_name: amenities?.banking?.bank_name || "",
            branch_code: amenities?.banking?.branch_code || "",
            account_holder: amenities?.banking?.account_holder || "",
            account_number: amenities?.banking?.account_number || "",
            account_type: amenities?.banking?.account_type || "",
            swift_code: amenities?.banking?.swift_code || "",
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
            children_policy:
              houseRules.children_policy || "Children are welcome\nChildren up until the age of 12 - Stay free",
            infant_age_from: houseRules.infant_age_from || "1",
            infant_age_to: houseRules.infant_age_to || "2",
            children_age_from: houseRules.children_age_from || "3",
            children_age_to: houseRules.children_age_to || "12",
          });

          // Set offerings
          setIsAccommodation(amenities?.offerings?.accommodation ?? true);
          setIsVenues(amenities?.offerings?.venues ?? false);
          setIsEvent(amenities?.offerings?.event_wedding ?? false);
          setIsConference(amenities?.offerings?.conference ?? false);

          // Set property source (PMS)
          const externalSystem = data.external_system || "";
          setSelectedPMS(externalSystem);

          // Set Benson property code
          if (data.benson_property_code) {
            setBensonPropertyCode(data.benson_property_code);
          }

          // Store existing external IDs to preserve when PMS changes
          setExistingExternalIds(amenities?.external_ids || {});
          setExistingBensonPropertyCode(data.benson_property_code || null);
          
          // Load TripAdvisor ID
          if (amenities?.external_ids?.tripadvisor_id) {
            setTripadvisorId(amenities.external_ids.tripadvisor_id);
          }

          // Set property slug for room URLs
          if (data.slug) {
            setPropertySlug(data.slug);
          }

          // Set location coordinates
          setLatitude(data.latitude ? Number(data.latitude) : null);
          setLongitude(data.longitude ? Number(data.longitude) : null);

          // Load google maps link if available
          if (amenities?.address_details?.google_maps_link) {
            setGoogleMapsLink(amenities.address_details.google_maps_link);
          }

          // Load no street address toggle
          if (amenities?.address_details?.no_street_address) {
            setNoStreetAddress(amenities.address_details.no_street_address);
          }

          // Load images if available
          if (data.images && Array.isArray(data.images)) {
            setUploadedImages(data.images as string[]);
          }

          // Load meal types if available
          if (amenities?.meal_types && Array.isArray(amenities.meal_types)) {
            setSelectedMealTypes(amenities.meal_types);
          }

          // Load room types if available
          if (amenities?.room_types && Array.isArray(amenities.room_types)) {
            setRoomTypes(amenities.room_types);
          }

          // Load other saved data
          if (amenities?.star_rating) setStarRating(amenities.star_rating);
          if (amenities?.facilities && Array.isArray(amenities.facilities)) setSelectedFacilities(amenities.facilities);
          if (amenities?.cancellation_policies) setCancellationPolicies(amenities.cancellation_policies);
          if (amenities?.seasons) setSeasons(amenities.seasons);
          if (amenities?.season_rates) setSeasonRates(amenities.season_rates);
          if (amenities?.pms_rate_types) setPmsRateTypes(amenities.pms_rate_types);
          if (amenities?.addons) setAddons(amenities.addons);
          if (amenities?.packages) setPackages(amenities.packages);
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

          // Load templates
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

  const addAnnouncement = () => {
    const newAnnouncement = {
      id: Date.now().toString(),
      ...announcementForm,
    };
    setAnnouncements([...announcements, newAnnouncement]);
    setIsManageAnnouncementOpen(false);
    setAnnouncementForm({
      announcement: "",
      order: 0,
      startDate: undefined,
      endDate: undefined,
      enabled: true,
    });
    toast({
      title: "Announcement created",
      description: "The announcement has been added successfully.",
    });
  };

  const deleteAnnouncement = (id: string) => {
    setAnnouncements(announcements.filter((a) => a.id !== id));
    toast({
      title: "Announcement deleted",
      description: "The announcement has been removed.",
    });
  };

  const toggleAnnouncementEnabled = (id: string) => {
    setAnnouncements(announcements.map((a) => (a.id === id ? { ...a, enabled: !a.enabled } : a)));
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

  const handleInputChange = (field: keyof PropertyFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setIsDirty(true);
  };

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

  const handleImageUpload = async (files: FileList | null) => {
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith("image/")) continue;

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
      } catch (error) {
        toast({
          title: "Upload failed",
          description: "Failed to upload image",
          variant: "destructive",
        });
      }
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

  const facilities = {
    general: ["Free Parking", "Free Secure Parking", "Gym", "Outdoor Swimming Pool", "Indoor Swimming Pool", "Spa"],
    bar: ["Bar", "Wine Cellar"],
    business: ["Business centre", "Meeting rooms"],
    conferenceRoom: ["Conference room", "Boardroom"],
    meals: ["Restaurant", "Breakfast included", "Room service"],
    utility: ["WiFi", "Air conditioning", "Heating", "Laundry service"],
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

      // Prepare data for database
      const propertyData = {
        name: formData.name,
        property_type: formData.property_type,
        description: formData.description || null,
        address: formData.address,
        city: formData.city,
        country: formData.country,
        latitude: latitude,
        longitude: longitude,
        owner_name: formData.owner_name || null,
        owner_email: formData.owner_email || null,
        external_system: selectedPMS || null,
        external_id: formData.bb_id || formData.venue_id || null,
        // Preserve existing benson_property_code if PMS changed, only update if benson is selected
        benson_property_code: selectedPMS === "benson" ? bensonPropertyCode : existingBensonPropertyCode,
        is_active: true,
        images: uploadedImages,
        max_guests: 2, // Default value, can be updated later
        price_per_night: 0, // Default value, can be updated later
        amenities: {
          offerings: {
            accommodation: isAccommodation,
            venues: isVenues,
            event_wedding: isEvent,
            conference: isConference,
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
          },
          room_types: roomTypes,
          meal_types: selectedMealTypes,
          star_rating: starRating,
          facilities: selectedFacilities,
          cancellation_policies: cancellationPolicies,
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
            children_policy: formData.children_policy,
            infant_age_from: formData.infant_age_from,
            infant_age_to: formData.infant_age_to,
            children_age_from: formData.children_age_from,
            children_age_to: formData.children_age_to,
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
          seasons: seasons,
          season_rates: seasonRates,
          pms_rate_types: pmsRateTypes,
          addons: addons,
          packages: packages,
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

      const { error } = isEditMode
        ? await supabase.from("properties").update(propertyData).eq("id", propertyId)
        : await supabase.from("properties").insert([propertyData]);

      if (error) throw error;

      // For new properties, navigate to the slug-based URL
      if (!isEditMode) {
        // Fetch the newly created property to get its slug
        const { data: newProperty } = await supabase
          .from("properties")
          .select("slug")
          .eq("name", formData.name)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        if (newProperty?.slug) {
          navigate(`/admin/properties/${newProperty.slug}`, { replace: true });
        }
      }

      toast({
        title: "Success",
        description: isEditMode ? "Property updated successfully" : "Property created successfully",
      });

      setIsDirty(false);
      // Stay on current page after save - don't navigate away for edits
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast({
          title: "Validation Error",
          description: error.errors[0].message,
          variant: "destructive",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to create property",
          variant: "destructive",
        });
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Navbar />
      <div className="container mx-auto px-4 py-3">
        <div className="max-w-7xl mx-auto">
          {/* Breadcrumb Navigation */}
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
            <span className="text-foreground">
              {activeTab === "general" && "General"}
              {activeTab === "info-facilities" && "Info & Facilities"}
              {activeTab === "house-rules" && "House Rules"}
              {activeTab === "images" && "Images"}
              {activeTab === "rooms" && "Rooms"}
              {activeTab === "rates" && "Rates"}
              {activeTab === "templates" && "Templates"}
              {activeTab === "addons" && "Addons"}
              {activeTab === "specials" && "Specials"}
              {activeTab === "packages" && "Packages"}
              {activeTab === "announcements" && "Announcements"}
            </span>
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
              <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleNavigate("/admin/property-overview")}>
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

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-3">
            <TabsList className="bg-secondary h-8">
              {[
                { value: "general", icon: Home, label: "General" },
                { value: "info-facilities", icon: Building2, label: "Info & Facilities" },
                { value: "house-rules", icon: FileText, label: "House Rules" },
                { value: "images", icon: Image, label: "Images" },
                { value: "rooms", icon: Info, label: "Rooms" },
                { value: "rates", icon: DollarSign, label: "Rates" },
                { value: "templates", icon: Bell, label: "Templates" },
                { value: "addons", icon: Package, label: "Addons" },
                { value: "specials", icon: Calendar, label: "Specials" },
                { value: "packages", icon: Package, label: "Packages" },
                { value: "announcements", icon: Bell, label: "Announcements" },
              ]
                .filter((tab) => selectedPMS !== 'nightsbridge' || tab.value === 'general' || tab.value === 'images' || tab.value === 'rooms')
                .map((tab) => {
                const isActive = activeTab === tab.value;
                const Icon = tab.icon;
                
                if (isActive) {
                  return (
                    <TabsTrigger key={tab.value} value={tab.value} className="gap-1 text-xs py-1">
                      <Icon className="h-3 w-3" />
                      {tab.label}
                    </TabsTrigger>
                  );
                }
                
                return (
                  <Tooltip key={tab.value}>
                    <TooltipTrigger asChild>
                      <TabsTrigger value={tab.value} className="px-2 py-1">
                        <Icon className="h-3 w-3" />
                      </TabsTrigger>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{tab.label}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TabsList>

            <TabsContent value="general">
              <form onSubmit={handleSubmit} className="space-y-3">
                {/* Offerings Section */}
                <Card>
                  <CardHeader className="py-2 px-4">
                    <CardTitle className="text-sm">{selectedPMS === 'nightsbridge' ? 'PMS Connection' : 'Offerings'}</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2 px-4">
                    {selectedPMS !== 'nightsbridge' && (
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

                    <div className="flex flex-wrap items-center gap-3">
                      <div className="flex items-center gap-2">
                        <Label htmlFor="pms_system" className="text-xs whitespace-nowrap">PMS</Label>
                        <Select
                          value={selectedPMS || "none"}
                          onValueChange={(value) => {
                            setSelectedPMS(value === "none" ? "" : value);
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
                      </div>

                      {selectedPMS === "nightsbridge" && (
                        <div className="flex items-center gap-2">
                          <Label htmlFor="bb_id" className="text-xs">BBID</Label>
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
                            <Label htmlFor="venue_id" className="text-xs">Venue</Label>
                            <Input id="venue_id" value={formData.venue_id} onChange={(e) => handleInputChange("venue_id", e.target.value)} placeholder="ID" className="h-7 text-xs w-20" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor="channel_id" className="text-xs">Channel</Label>
                            <Input id="channel_id" value={formData.channel_id} onChange={(e) => handleInputChange("channel_id", e.target.value)} placeholder="ID" className="h-7 text-xs w-20" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor="account_id" className="text-xs">Account</Label>
                            <Input id="account_id" value={formData.account_id} onChange={(e) => handleInputChange("account_id", e.target.value)} placeholder="ID" className="h-7 text-xs w-20" />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label htmlFor="agent_id" className="text-xs">Agent</Label>
                            <Input id="agent_id" value={formData.agent_id} onChange={(e) => handleInputChange("agent_id", e.target.value)} placeholder="ID" className="h-7 text-xs w-20" />
                          </div>
                        </>
                      )}

                      {selectedPMS === "benson" && (
                        <>
                          <div className="flex items-center gap-2">
                            <Label htmlFor="benson_property_code" className="text-xs whitespace-nowrap">Benson Code *</Label>
                            <Input
                              id="benson_property_code"
                              value={bensonPropertyCode}
                              onChange={(e) => { setBensonPropertyCode(e.target.value); setIsDirty(true); }}
                              placeholder="Property code"
                              className="h-7 text-xs w-40"
                              required
                            />
                          </div>
                          {bensonPropertyCode && (
                            <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={syncFromBenson} disabled={isSyncingPms}>
                              <RefreshCw className={cn("h-3 w-3", isSyncingPms && "animate-spin")} />
                              {isSyncingPms ? "Syncing..." : "Sync"}
                            </Button>
                          )}
                        </>
                      )}

                      {lastPmsSync && selectedPMS === "benson" && (
                        <span className="text-xs text-muted-foreground">Synced: {lastPmsSync.toLocaleString()}</span>
                      )}

                      <div className="flex items-center gap-2">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Label htmlFor="tripadvisor_id" className="cursor-help flex items-center gap-1 text-xs">
                                TripAdvisor <Info className="h-3 w-3 text-muted-foreground" />
                              </Label>
                            </TooltipTrigger>
                            <TooltipContent><p className="text-xs">Number after "d/" in TripAdvisor URL</p></TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        <Input id="tripadvisor_id" value={tripadvisorId} onChange={(e) => { setTripadvisorId(e.target.value); setIsDirty(true); }} placeholder="123456" className="h-7 text-xs w-24" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Property, Address & Map - Side by side layout */}
                <div className="flex gap-3 items-stretch">
                  {/* Left side - Property & Address (75%) */}
                  <div className="flex-1 flex flex-col gap-3">
                    {/* Property Section */}
                    <Card>
                      <CardHeader className="py-2 px-4">
                        <CardTitle className="text-sm flex items-center justify-between">
                          <span>Property</span>
                          {selectedPMS && (
                            <div className="flex items-center gap-1 text-xs font-normal text-muted-foreground">
                              <div className="w-3 h-3 rounded bg-primary/10 border border-primary/30" />
                              <Cloud className="h-3 w-3" />
                              <span>{getPMSDisplayName(selectedPMS)} synced</span>
                            </div>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 px-4">
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="name" className="text-xs">Name *</Label>
                            <Input id="name" value={formData.name} onChange={(e) => handleInputChange("name", e.target.value)} placeholder="Property name" required disabled={isFieldPopulatedByPMS("name", selectedPMS)} className={cn("h-7 text-xs", getPMSFieldClass("name", selectedPMS), isFieldPopulatedByPMS("name", selectedPMS) && "cursor-not-allowed")} />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="property_type" className="text-xs">Type *</Label>
                            <Select value={formData.property_type} onValueChange={(value) => handleInputChange("property_type", value)}>
                              <SelectTrigger id="property_type" className="h-7 text-xs"><SelectValue placeholder="Select" /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="hotel">Hotel</SelectItem>
                                <SelectItem value="guesthouse">Guest House</SelectItem>
                                <SelectItem value="bnb">B&B</SelectItem>
                                <SelectItem value="lodge">Lodge</SelectItem>
                                <SelectItem value="resort">Resort</SelectItem>
                                <SelectItem value="villa">Villa</SelectItem>
                                <SelectItem value="apartment">Apartment</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="telephone" className="text-xs">Telephone</Label>
                            <Input id="telephone" value={formData.telephone} onChange={(e) => handleInputChange("telephone", e.target.value)} placeholder="+27..." className="h-7 text-xs" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="contact_email" className="text-xs">Contact Email *</Label>
                            <Input id="contact_email" type="email" value={formData.contact_email} onChange={(e) => handleInputChange("contact_email", e.target.value)} placeholder="email@example.com" required className="h-7 text-xs" />
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="currency" className="text-xs">Currency *</Label>
                            <Select value={formData.currency} onValueChange={(value) => handleInputChange("currency", value)}>
                              <SelectTrigger id="currency" className="h-7 text-xs"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ZAR">ZAR</SelectItem>
                                <SelectItem value="USD">USD</SelectItem>
                                <SelectItem value="EUR">EUR</SelectItem>
                                <SelectItem value="GBP">GBP</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="owner_email" className="text-xs">Owner</Label>
                            <Select value={formData.owner_email} onValueChange={(value) => { const selectedOwner = owners.find((o) => o.email === value); handleInputChange("owner_email", value); handleInputChange("owner_name", selectedOwner?.full_name || ""); }}>
                              <SelectTrigger id="owner_email" className="h-7 text-xs"><SelectValue placeholder="Select owner" /></SelectTrigger>
                              <SelectContent>
                                {owners.map((owner) => (<SelectItem key={owner.id} value={owner.email}>{owner.full_name || owner.email}</SelectItem>))}
                              </SelectContent>
                            </Select>
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
                            <Label htmlFor="no_street_address" className="text-xs text-muted-foreground font-normal">No street address?</Label>
                            <Switch id="no_street_address" checked={noStreetAddress} onCheckedChange={(checked) => { setNoStreetAddress(checked); setIsDirty(true); }} />
                          </div>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 px-4">
                        {!noStreetAddress && (
                          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                            <div className="flex flex-col gap-1">
                              <Label htmlFor="country" className="text-xs">Country *</Label>
                              <Select value={formData.country} onValueChange={(value) => handleInputChange("country", value)}>
                                <SelectTrigger id="country" className={cn("h-7 text-xs", getPMSFieldClass("country", selectedPMS))} disabled={isFieldPopulatedByPMS("country", selectedPMS)}>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="South Africa">South Africa</SelectItem>
                                  <SelectItem value="United States">United States</SelectItem>
                                  <SelectItem value="United Kingdom">United Kingdom</SelectItem>
                                  <SelectItem value="Australia">Australia</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label htmlFor="city" className="text-xs">City *</Label>
                              <Input id="city" value={formData.city} onChange={(e) => handleInputChange("city", e.target.value)} placeholder="City" required={!noStreetAddress} disabled={isFieldPopulatedByPMS("city", selectedPMS)} className={cn("h-7 text-xs", getPMSFieldClass("city", selectedPMS), isFieldPopulatedByPMS("city", selectedPMS) && "cursor-not-allowed")} />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label htmlFor="address" className="text-xs">Street *</Label>
                              <Input id="address" value={formData.address} onChange={(e) => handleInputChange("address", e.target.value)} placeholder="Street address" required={!noStreetAddress} disabled={isFieldPopulatedByPMS("address", selectedPMS)} className={cn("h-7 text-xs", getPMSFieldClass("address", selectedPMS), isFieldPopulatedByPMS("address", selectedPMS) && "cursor-not-allowed")} />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label htmlFor="suburb" className="text-xs">Suburb</Label>
                              <Input id="suburb" value={formData.suburb} onChange={(e) => handleInputChange("suburb", e.target.value)} placeholder="Suburb" className="h-7 text-xs" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label htmlFor="postal_code" className="text-xs">Postal Code</Label>
                              <Input id="postal_code" value={formData.postal_code} onChange={(e) => handleInputChange("postal_code", e.target.value)} placeholder="Postal code" disabled={isFieldPopulatedByPMS("postal_code", selectedPMS)} className={cn("h-7 text-xs", getPMSFieldClass("postal_code", selectedPMS), isFieldPopulatedByPMS("postal_code", selectedPMS) && "cursor-not-allowed")} />
                            </div>
                          </div>
                        )}

                        {noStreetAddress && (
                          <div className="p-2 border rounded-lg border-primary/20 bg-primary/5">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3 w-3 text-primary" />
                              <Label htmlFor="google_maps_link" className="text-xs">Google Maps Link *</Label>
                              <Input id="google_maps_link" value={googleMapsLink} onChange={(e) => handleGoogleMapsLinkChange(e.target.value)} placeholder="Paste Google Maps link" className="flex-1 h-7 text-xs font-mono" required />
                              {googleMapsLink && latitude && longitude && <span className="text-xs text-green-600 flex items-center gap-1"><Check className="h-3 w-3" />{latitude.toFixed(4)}, {longitude.toFixed(4)}</span>}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Right side - Map (25%) */}
                  <div className="w-1/4 min-w-[200px] flex">
                    <Card className="flex-1 flex flex-col p-2">
                      <PropertyMap address={formData.address} city={formData.city} country={formData.country} latitude={latitude} longitude={longitude} onLocationUpdate={(lat, lng) => { setLatitude(lat); setLongitude(lng); }} />
                    </Card>
                  </div>
                </div>

                {/* Property and Banking Details - Hidden for NightsBridge */}
                {selectedPMS !== 'nightsbridge' && (
                  <Card>
                    <CardHeader className="py-2 px-4">
                      <CardTitle className="text-sm flex items-center justify-between">
                        <span>Banking Details</span>
                        <div className="flex items-center gap-2">
                          <Label htmlFor="has_vat" className="text-xs text-muted-foreground font-normal">VAT Registered?</Label>
                          <Switch id="has_vat" checked={formData.has_vat} onCheckedChange={(checked) => handleInputChange("has_vat", checked)} />
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="py-2 px-4">
                      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
                        {formData.has_vat && (
                          <div className="flex flex-col gap-1">
                            <Label htmlFor="vat_number" className="text-xs">VAT #</Label>
                            <Input id="vat_number" value={formData.vat_number} onChange={(e) => handleInputChange("vat_number", e.target.value)} placeholder="VAT number" className="h-7 text-xs" />
                          </div>
                        )}
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="property_registration" className="text-xs">Reg #</Label>
                          <Input id="property_registration" value={formData.property_registration} onChange={(e) => handleInputChange("property_registration", e.target.value)} placeholder="Registration" className="h-7 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="bank_name" className="text-xs">Bank</Label>
                          <Input id="bank_name" value={formData.bank_name} onChange={(e) => handleInputChange("bank_name", e.target.value)} placeholder="Bank name" className="h-7 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="branch_code" className="text-xs">Branch</Label>
                          <Input id="branch_code" value={formData.branch_code} onChange={(e) => handleInputChange("branch_code", e.target.value)} placeholder="Code" className="h-7 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="account_holder" className="text-xs">Holder</Label>
                          <Input id="account_holder" value={formData.account_holder} onChange={(e) => handleInputChange("account_holder", e.target.value)} placeholder="Name" className="h-7 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="account_number" className="text-xs">Account #</Label>
                          <Input id="account_number" value={formData.account_number} onChange={(e) => handleInputChange("account_number", e.target.value)} placeholder="Number" className="h-7 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="account_type" className="text-xs">Type</Label>
                          <Input id="account_type" value={formData.account_type} onChange={(e) => handleInputChange("account_type", e.target.value)} placeholder="Type" className="h-7 text-xs" />
                        </div>
                        <div className="flex flex-col gap-1">
                          <Label htmlFor="swift_code" className="text-xs">SWIFT</Label>
                          <Input id="swift_code" value={formData.swift_code} onChange={(e) => handleInputChange("swift_code", e.target.value)} placeholder="Code" className="h-7 text-xs" />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleNavigate("/admin/property-overview")}>Cancel</Button>
                  {isDirty && (
                    <Button type="submit" size="sm" className="h-7 text-xs" disabled={loading}>
                      <Save className="mr-1 h-3 w-3" />
                      {loading ? "Saving..." : "Save"}
                    </Button>
                  )}
                </div>
              </form>
            </TabsContent>

            {/* House Style Tab */}
            <TabsContent value="house-style">
              <form className="space-y-6">
                {/* Company Logo */}
                <Card>
                  <CardHeader>
                    <CardTitle>COMPANY LOGO</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div
                      className={cn(
                        "border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors",
                        isLogoUploading ? "border-primary bg-primary/5" : "border-blue-300 bg-blue-50",
                      )}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={handleLogoDrop}
                      onClick={() => document.getElementById("logo-upload")?.click()}
                    >
                      {companyLogo ? (
                        <div className="relative">
                          <img src={companyLogo} alt="Company Logo" className="max-h-48 mx-auto" />
                          <Button
                            size="sm"
                            variant="destructive"
                            className="absolute top-2 right-2"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCompanyLogo(null);
                            }}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-12 w-12 mx-auto mb-4 text-blue-500" />
                          <p className="text-sm text-blue-700">Click or Drag and drop image to upload</p>
                        </>
                      )}
                      <input
                        id="logo-upload"
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoUpload}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Book Page Header Settings */}
                <Card>
                  <CardHeader>
                    <CardTitle>BOOK PAGE HEADER SETTINGS</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                      <Label className="whitespace-nowrap">RoomsOnline Bookings Link</Label>
                      <Input
                        value={roomsOnlineBookingsLink}
                        onChange={(e) => setRoomsOnlineBookingsLink(e.target.value)}
                        className="flex-1"
                      />
                      <Button size="sm" variant="ghost" className="text-destructive">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="flex items-center gap-4">
                      <Label className="whitespace-nowrap">Title Behaviour</Label>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          variant={titleBehaviour === "property-name" ? "destructive" : "outline"}
                          onClick={() => setTitleBehaviour("property-name")}
                        >
                          Property Name
                        </Button>
                        <Button
                          type="button"
                          variant={titleBehaviour === "property-logo" ? "destructive" : "outline"}
                          onClick={() => setTitleBehaviour("property-logo")}
                        >
                          Property Logo
                        </Button>
                        <Button
                          type="button"
                          variant={titleBehaviour === "no-title" ? "destructive" : "outline"}
                          onClick={() => setTitleBehaviour("no-title")}
                        >
                          No Title
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Merchant Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>MERCHANT DETAILS</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="org-name">Organization Name</Label>
                        <Input
                          id="org-name"
                          value={merchantDetails.organizationName}
                          onChange={(e) => setMerchantDetails({ ...merchantDetails, organizationName: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="merchant-id">Merchant Id</Label>
                        <Input
                          id="merchant-id"
                          value={merchantDetails.merchantId}
                          onChange={(e) => setMerchantDetails({ ...merchantDetails, merchantId: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="merchant-key">Merchant Key</Label>
                        <Input
                          id="merchant-key"
                          value={merchantDetails.merchantKey}
                          onChange={(e) => setMerchantDetails({ ...merchantDetails, merchantKey: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="split-amount">Split Amount %</Label>
                        <Input
                          id="split-amount"
                          value={merchantDetails.splitAmount}
                          onChange={(e) => setMerchantDetails({ ...merchantDetails, splitAmount: e.target.value })}
                        />
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-1">
                      <p className="text-sm text-blue-700">
                        • Split % will be of the total booking. The amount will be credited to RoomsOnline
                      </p>
                      <p className="text-sm text-blue-700">
                        • Decimal split amount percentage will be round off to whole number
                      </p>
                    </div>
                  </CardContent>
                </Card>

                {/* AdPay Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>ADPAY DETAILS</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="adpay-merchant">AdPay Merchant</Label>
                        <Input
                          id="adpay-merchant"
                          value={adpayDetails.merchant}
                          onChange={(e) => setAdpayDetails({ ...adpayDetails, merchant: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="adpay-appid">AdPay AppId</Label>
                        <Input
                          id="adpay-appid"
                          value={adpayDetails.appId}
                          onChange={(e) => setAdpayDetails({ ...adpayDetails, appId: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="adpay-storeno">AdPay StoreNo</Label>
                        <Input
                          id="adpay-storeno"
                          value={adpayDetails.storeNo}
                          onChange={(e) => setAdpayDetails({ ...adpayDetails, storeNo: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="adpay-apikey">AdPay ApiKey</Label>
                        <Input
                          id="adpay-apikey"
                          value={adpayDetails.apiKey}
                          onChange={(e) => setAdpayDetails({ ...adpayDetails, apiKey: e.target.value })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Motar API */}
                <Card>
                  <CardHeader>
                    <CardTitle>MOTAR API</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="motar-venueid">Motar VenueId</Label>
                        <Input
                          id="motar-venueid"
                          value={motarApi.venueId}
                          onChange={(e) => setMotarApi({ ...motarApi, venueId: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label htmlFor="motar-xapi">Motar XAPI</Label>
                        <Input
                          id="motar-xapi"
                          value={motarApi.xapi}
                          onChange={(e) => setMotarApi({ ...motarApi, xapi: e.target.value })}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Website Color */}
                <Card>
                  <CardHeader>
                    <CardTitle>WEBSITE COLOR</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-8">
                      <div className="space-y-2">
                        <Label>Primary</Label>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-12 h-12 rounded border-2 cursor-pointer"
                            style={{ backgroundColor: websiteColors.primary }}
                            onClick={() => document.getElementById("primary-color")?.click()}
                          />
                          <input
                            id="primary-color"
                            type="color"
                            value={websiteColors.primary}
                            onChange={(e) => setWebsiteColors({ ...websiteColors, primary: e.target.value })}
                            className="sr-only"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Secondary</Label>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-12 h-12 rounded border-2 cursor-pointer"
                            style={{ backgroundColor: websiteColors.secondary }}
                            onClick={() => document.getElementById("secondary-color")?.click()}
                          />
                          <input
                            id="secondary-color"
                            type="color"
                            value={websiteColors.secondary}
                            onChange={(e) => setWebsiteColors({ ...websiteColors, secondary: e.target.value })}
                            className="sr-only"
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>FontColor</Label>
                        <div className="flex items-center gap-2">
                          <div
                            className="w-12 h-12 rounded border-2 cursor-pointer"
                            style={{ backgroundColor: websiteColors.fontColor }}
                            onClick={() => document.getElementById("font-color")?.click()}
                          />
                          <input
                            id="font-color"
                            type="color"
                            value={websiteColors.fontColor}
                            onChange={(e) => setWebsiteColors({ ...websiteColors, fontColor: e.target.value })}
                            className="sr-only"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Action Buttons */}
                <div className="flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => handleNavigate("/admin/property-overview")}>
                    Cancel
                  </Button>
                  {isDirty && (
                    <Button type="submit" className="bg-primary">
                      <Save className="mr-2 h-4 w-4" />
                      Save
                    </Button>
                  )}
                </div>
              </form>
            </TabsContent>

            <TabsContent value="info-facilities">
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
                              onRatingChange={isFieldPopulatedByPMS("star_rating", selectedPMS) ? () => {} : setStarRating}
                            />
                          </div>
                        </div>
                      </div>
                      {selectedPMS && (
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
                      <Label htmlFor="description" className="text-xs">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => handleInputChange("description", e.target.value)}
                        placeholder="Describe your property, its unique features, amenities, and what makes it special..."
                        rows={3}
                        disabled={isFieldPopulatedByPMS("description", selectedPMS)}
                        className={cn(
                          "resize-none text-xs",
                          getPMSFieldClass("description", selectedPMS),
                          isFieldPopulatedByPMS("description", selectedPMS) && "cursor-not-allowed",
                        )}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Facilities */}
                <Card>
                  <CardHeader className="py-2 px-4">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm">Facilities</CardTitle>
                      <div className="text-xs text-muted-foreground flex items-center gap-1">
                        <Info className="h-3 w-3" />
                        Checked items will be highlighted on your listing
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="py-2 px-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                      {/* General */}
                      <div>
                        <h3 className="font-semibold mb-1 text-xs text-muted-foreground">General</h3>
                        <div className="space-y-0.5">
                          {facilities.general.map((facility) => (
                            <div key={facility} className="flex items-center space-x-1.5">
                              <Checkbox
                                id={facility}
                                checked={selectedFacilities.includes(facility)}
                                onCheckedChange={() => toggleFacility(facility)}
                                className="h-3 w-3"
                              />
                              <Label htmlFor={facility} className="cursor-pointer text-xs leading-none">
                                {facility}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Bar */}
                      <div>
                        <h3 className="font-semibold mb-1 text-xs text-muted-foreground">Bar</h3>
                        <div className="space-y-0.5">
                          {facilities.bar.map((facility) => (
                            <div key={facility} className="flex items-center space-x-1.5">
                              <Checkbox
                                id={facility}
                                checked={selectedFacilities.includes(facility)}
                                onCheckedChange={() => toggleFacility(facility)}
                                className="h-3 w-3"
                              />
                              <Label htmlFor={facility} className="cursor-pointer text-xs leading-none">
                                {facility}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Business */}
                      <div>
                        <h3 className="font-semibold mb-1 text-xs text-muted-foreground">Business</h3>
                        <div className="space-y-0.5">
                          {facilities.business.map((facility) => (
                            <div key={facility} className="flex items-center space-x-1.5">
                              <Checkbox
                                id={facility}
                                checked={selectedFacilities.includes(facility)}
                                onCheckedChange={() => toggleFacility(facility)}
                                className="h-3 w-3"
                              />
                              <Label htmlFor={facility} className="cursor-pointer text-xs leading-none">
                                {facility}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Conference Room */}
                      <div>
                        <h3 className="font-semibold mb-1 text-xs text-muted-foreground">Conference Room</h3>
                        <div className="space-y-0.5">
                          {facilities.conferenceRoom.map((facility) => (
                            <div key={facility} className="flex items-center space-x-1.5">
                              <Checkbox
                                id={facility}
                                checked={selectedFacilities.includes(facility)}
                                onCheckedChange={() => toggleFacility(facility)}
                                className="h-3 w-3"
                              />
                              <Label htmlFor={facility} className="cursor-pointer text-xs leading-none">
                                {facility}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Meals */}
                      <div>
                        <h3 className="font-semibold mb-1 text-xs text-muted-foreground">Meals</h3>
                        <div className="space-y-0.5">
                          {facilities.meals.map((facility) => (
                            <div key={facility} className="flex items-center space-x-1.5">
                              <Checkbox
                                id={facility}
                                checked={selectedFacilities.includes(facility)}
                                onCheckedChange={() => toggleFacility(facility)}
                                className="h-3 w-3"
                              />
                              <Label htmlFor={facility} className="cursor-pointer text-xs leading-none">
                                {facility}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Utility */}
                      <div>
                        <h3 className="font-semibold mb-1 text-xs text-muted-foreground">Utility</h3>
                        <div className="space-y-0.5">
                          {facilities.utility.map((facility) => (
                            <div key={facility} className="flex items-center space-x-1.5">
                              <Checkbox
                                id={facility}
                                checked={selectedFacilities.includes(facility)}
                                onCheckedChange={() => toggleFacility(facility)}
                                className="h-3 w-3"
                              />
                              <Label htmlFor={facility} className="cursor-pointer text-xs leading-none">
                                {facility}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {selectedFacilities.length > 0 && (
                      <div className="pt-2 mt-2 border-t">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Label className="text-xs text-muted-foreground">Selected:</Label>
                          {selectedFacilities.map((facility) => (
                            <Badge key={facility} variant="secondary" className="text-xs h-5 gap-1">
                              {facility}
                              <button
                                type="button"
                                onClick={() => toggleFacility(facility)}
                                className="ml-0.5 hover:text-destructive"
                              >
                                <X className="h-2.5 w-2.5" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleNavigate("/admin/property-overview")}>
                    Cancel
                  </Button>
                  {isDirty && (
                    <Button type="submit" size="sm" className="h-7 text-xs" disabled={loading}>
                      <Save className="mr-1 h-3 w-3" />
                      {loading ? "Saving..." : "Save Property"}
                    </Button>
                  )}
                </div>
              </form>
            </TabsContent>

            <TabsContent value="house-rules">
              <form onSubmit={handleSubmit} className="space-y-3">
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
                  {/* Left Column */}
                  <div className="lg:col-span-3 space-y-3">
                    {/* Payment & Policy Toggles Row */}
                    <Card>
                      <CardContent className="py-3 px-4">
                        <div className="flex flex-wrap items-center gap-4">
                          <div className="flex items-center space-x-1.5">
                            <Checkbox
                              id="items_non_refundable"
                              checked={formData.items_non_refundable}
                              onCheckedChange={(checked) =>
                                setFormData({ ...formData, items_non_refundable: checked as boolean })
                              }
                              className="h-3.5 w-3.5"
                            />
                            <Label htmlFor="items_non_refundable" className="cursor-pointer text-xs">
                              Non Refundable
                            </Label>
                          </div>
                          <Separator orientation="vertical" className="h-5" />
                          {[
                            { key: 'smoking_allowed', label: 'Smoking' },
                            { key: 'pets_allowed', label: 'Pets' },
                            { key: 'children_allowed', label: 'Children' },
                            { key: 'parties_allowed', label: 'Parties' },
                            { key: 'check_in_24h', label: '24h Check-in' },
                          ].map(({ key, label }) => (
                            <div key={key} className="flex items-center gap-1.5">
                              <div
                                className={`h-5 w-5 rounded-full flex items-center justify-center cursor-pointer ${
                                  formData[key as keyof typeof formData] ? "bg-green-500" : "bg-destructive"
                                }`}
                                onClick={() =>
                                  setFormData({ ...formData, [key]: !formData[key as keyof typeof formData] })
                                }
                              >
                                {formData[key as keyof typeof formData] ? (
                                  <Check className="h-3 w-3 text-white" />
                                ) : (
                                  <X className="h-3 w-3 text-white" />
                                )}
                              </div>
                              <span className="text-xs">{label}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Cancellation Policies */}
                    <Card>
                      <CardHeader className="py-2 px-4">
                        <CardTitle className="text-sm">Cancellation Policies</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 px-4 space-y-1.5">
                        {cancellationPolicies.map((policy, index) => (
                          <div key={index} className="flex items-center gap-1.5 text-xs">
                            <span className="whitespace-nowrap">Forfeit</span>
                            <Input
                              className="w-14 h-6 text-xs px-1.5"
                              value={policy.forfeit}
                              onChange={(e) => updateCancellationPolicy(index, "forfeit", e.target.value)}
                            />
                            <Select
                              value={policy.type}
                              onValueChange={(value) => updateCancellationPolicy(index, "type", value)}
                            >
                              <SelectTrigger className="w-24 h-6 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="% of Total" className="text-xs">% of Total</SelectItem>
                                <SelectItem value="Fixed Amount" className="text-xs">Fixed Amount</SelectItem>
                              </SelectContent>
                            </Select>
                            <span className="whitespace-nowrap">if cancels</span>
                            <Input
                              className="w-12 h-6 text-xs px-1.5"
                              value={policy.days}
                              onChange={(e) => updateCancellationPolicy(index, "days", e.target.value)}
                            />
                            <span className="whitespace-nowrap">days before</span>
                            <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={() => removeCancellationPolicy(index)}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            {index === cancellationPolicies.length - 1 && (
                              <Button type="button" variant="ghost" size="icon" className="h-5 w-5" onClick={addCancellationPolicy}>
                                <Plus className="h-3 w-3" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    {/* Bottom Row - Deposit, Same Day, Check-in, Check-out, Age Ranges */}
                    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                      {/* Deposit */}
                      <Card>
                        <CardHeader className="py-1.5 px-3">
                          <CardTitle className="text-xs flex items-center gap-1.5">
                            <Checkbox
                              id="deposit_allowed"
                              checked={formData.deposit_allowed}
                              onCheckedChange={(checked) =>
                                setFormData({ ...formData, deposit_allowed: checked as boolean })
                              }
                              className="h-3 w-3"
                            />
                            Deposit
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-1.5 px-3 space-y-1">
                          <div className="flex items-center gap-1">
                            <Input placeholder="50" value={formData.deposit_percentage} onChange={(e) => handleInputChange("deposit_percentage", e.target.value)} className="h-6 text-xs" />
                            <span className="text-xs text-muted-foreground">%</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <Input placeholder="2" value={formData.deposit_days} onChange={(e) => handleInputChange("deposit_days", e.target.value)} className="h-6 text-xs" />
                            <span className="text-xs text-muted-foreground">days</span>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Same Day */}
                      <Card>
                        <CardHeader className="py-1.5 px-3">
                          <CardTitle className="text-xs flex items-center gap-1.5">
                            <Checkbox
                              id="same_day_bookings"
                              checked={formData.same_day_bookings}
                              onCheckedChange={(checked) =>
                                setFormData({ ...formData, same_day_bookings: checked as boolean })
                              }
                              className="h-3 w-3"
                            />
                            Same Day
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-1.5 px-3">
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-muted-foreground">Cutoff</Label>
                            <Input type="time" value={formData.same_day_cutoff} onChange={(e) => handleInputChange("same_day_cutoff", e.target.value)} className="h-6 text-xs flex-1" />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Check-in */}
                      <Card>
                        <CardHeader className="py-1.5 px-3">
                          <CardTitle className="text-xs">Check-in</CardTitle>
                        </CardHeader>
                        <CardContent className="py-1.5 px-3 space-y-1">
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-muted-foreground w-8">From</Label>
                            <Input type="time" value={formData.check_in_from} onChange={(e) => handleInputChange("check_in_from", e.target.value)} disabled={isFieldPopulatedByPMS("check_in_from", selectedPMS)} className={cn("h-6 text-xs flex-1", getPMSFieldClass("check_in_from", selectedPMS))} />
                          </div>
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-muted-foreground w-8">To</Label>
                            <Input type="time" value={formData.check_in_to} onChange={(e) => handleInputChange("check_in_to", e.target.value)} disabled={isFieldPopulatedByPMS("check_in_to", selectedPMS)} className={cn("h-6 text-xs flex-1", getPMSFieldClass("check_in_to", selectedPMS))} />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Check-out */}
                      <Card>
                        <CardHeader className="py-1.5 px-3">
                          <CardTitle className="text-xs">Check-out</CardTitle>
                        </CardHeader>
                        <CardContent className="py-1.5 px-3 space-y-1">
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-muted-foreground w-8">From</Label>
                            <Input type="time" value={formData.check_out_from} onChange={(e) => handleInputChange("check_out_from", e.target.value)} disabled={isFieldPopulatedByPMS("check_out_from", selectedPMS)} className={cn("h-6 text-xs flex-1", getPMSFieldClass("check_out_from", selectedPMS))} />
                          </div>
                          <div className="flex items-center gap-1">
                            <Label className="text-xs text-muted-foreground w-8">To</Label>
                            <Input type="time" value={formData.check_out_to} onChange={(e) => handleInputChange("check_out_to", e.target.value)} disabled={isFieldPopulatedByPMS("check_out_to", selectedPMS)} className={cn("h-6 text-xs flex-1", getPMSFieldClass("check_out_to", selectedPMS))} />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Infant Ages */}
                      <Card>
                        <CardHeader className="py-1.5 px-3">
                          <CardTitle className="text-xs flex items-center gap-1">
                            Infant
                            {selectedPMS === 'benson' && <Cloud className="h-3 w-3 text-primary" />}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-1.5 px-3 flex gap-1">
                          <Input value={formData.infant_age_from} onChange={(e) => handleInputChange("infant_age_from", e.target.value)} disabled={selectedPMS === 'benson'} className={cn("h-6 text-xs", selectedPMS === 'benson' && 'bg-muted')} placeholder="From" />
                          <Input value={formData.infant_age_to} onChange={(e) => handleInputChange("infant_age_to", e.target.value)} disabled={selectedPMS === 'benson'} className={cn("h-6 text-xs", selectedPMS === 'benson' && 'bg-muted')} placeholder="To" />
                        </CardContent>
                      </Card>

                      {/* Teen Ages */}
                      <Card>
                        <CardHeader className="py-1.5 px-3">
                          <CardTitle className="text-xs flex items-center gap-1">
                            Teen
                            {selectedPMS === 'benson' && <Cloud className="h-3 w-3 text-primary" />}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-1.5 px-3 flex gap-1">
                          <Input value={(formData as any).teen_age_from || ''} onChange={(e) => handleInputChange("teen_age_from" as any, e.target.value)} disabled={selectedPMS === 'benson'} className={cn("h-6 text-xs", selectedPMS === 'benson' && 'bg-muted')} placeholder="From" />
                          <Input value={(formData as any).teen_age_to || ''} onChange={(e) => handleInputChange("teen_age_to" as any, e.target.value)} disabled={selectedPMS === 'benson'} className={cn("h-6 text-xs", selectedPMS === 'benson' && 'bg-muted')} placeholder="To" />
                        </CardContent>
                      </Card>

                      {/* Children Ages */}
                      <Card>
                        <CardHeader className="py-1.5 px-3">
                          <CardTitle className="text-xs flex items-center gap-1">
                            Children
                            {selectedPMS === 'benson' && <Cloud className="h-3 w-3 text-primary" />}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="py-1.5 px-3 flex gap-1">
                          <Input value={formData.children_age_from} onChange={(e) => handleInputChange("children_age_from", e.target.value)} disabled={selectedPMS === 'benson'} className={cn("h-6 text-xs", selectedPMS === 'benson' && 'bg-muted')} placeholder="From" />
                          <Input value={formData.children_age_to} onChange={(e) => handleInputChange("children_age_to", e.target.value)} disabled={selectedPMS === 'benson'} className={cn("h-6 text-xs", selectedPMS === 'benson' && 'bg-muted')} placeholder="To" />
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Right Column - Children Policy */}
                  <div>
                    <Card className="sticky top-4">
                      <CardHeader className="py-2 px-3">
                        <CardTitle className="text-sm">Children Policy</CardTitle>
                      </CardHeader>
                      <CardContent className="py-2 px-3">
                        <Textarea
                          value={formData.children_policy}
                          onChange={(e) => handleInputChange("children_policy", e.target.value)}
                          placeholder="Enter children policy details..."
                          rows={6}
                          className="resize-none text-xs"
                        />
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleNavigate("/admin/property-overview")}>
                    Cancel
                  </Button>
                  {isDirty && (
                    <Button type="submit" size="sm" className="h-7 text-xs" disabled={loading}>
                      <Save className="mr-1 h-3 w-3" />
                      {loading ? "Saving..." : "Save Property"}
                    </Button>
                  )}
                </div>
              </form>
            </TabsContent>

            <TabsContent value="images">
              <Card>
                <CardHeader className="py-2 px-4">
                  <CardTitle className="text-sm">Property Images</CardTitle>
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
                      <input id="image-upload" type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleImageUpload(e.target.files)} />
                    </div>

                    {/* Image Grid */}
                    <div className="lg:col-span-4">
                      <div className="grid grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                        {uploadedImages.map((imageUrl, index) => (
                          <div key={index} className="relative aspect-square rounded-md overflow-hidden border border-border group">
                            <img src={imageUrl} alt={`Property ${index + 1}`} className="w-full h-full object-cover" />
                            {/* Primary badge or set as primary button */}
                            {index === 0 ? (
                              <div className="absolute top-1 left-1 bg-primary rounded-full p-1" title="Primary image">
                                <Heart className="h-3 w-3 text-white fill-white" />
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => {
                                  // Move this image to first position
                                  const newImages = [...uploadedImages];
                                  const [selected] = newImages.splice(index, 1);
                                  newImages.unshift(selected);
                                  setUploadedImages(newImages);
                                  setIsDirty(true);
                                }}
                                className="absolute top-1 left-1 bg-muted-foreground/60 hover:bg-primary rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Set as primary image"
                              >
                                <Heart className="h-3 w-3 text-white" />
                              </button>
                            )}
                            <button type="button" onClick={() => removeImage(index)} className="absolute top-1 right-1 bg-muted-foreground/80 hover:bg-destructive rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <X className="h-3 w-3 text-white" />
                            </button>
                          </div>
                        ))}
                        {Array.from({ length: Math.max(0, 12 - uploadedImages.length) }, (_, index) => (
                          <div key={`empty-${index}`} className="relative aspect-square rounded-md border-2 border-dashed border-border bg-muted/20 flex items-center justify-center">
                            <X className="h-3 w-3 text-muted-foreground" />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2 mt-3">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleNavigate("/admin/property-overview")}>
                  Cancel
                </Button>
                {isDirty && (
                  <Button type="button" size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={loading}>
                    <Save className="mr-1 h-3 w-3" />
                    {loading ? "Saving..." : "Save Property"}
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Templates and Notifications Tab */}
            <TabsContent value="templates">
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
                      onChange={(html) => { setTemplateContent(html); setIsDirty(true); }}
                      placeholder="Enter your email template content here..."
                    />
                  </div>

                  {/* Mailer Timing Settings */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-xs">Pre Mailer:</Label>
                      <Input type="number" value={preMailerDays} onChange={(e) => { setPreMailerDays(Number(e.target.value)); setIsDirty(true); }} className="w-14 h-6 text-xs" min="0" />
                      <span className="text-xs text-muted-foreground">days</span>
                      <Input type="number" value={preMailerHours} onChange={(e) => { setPreMailerHours(Number(e.target.value)); setIsDirty(true); }} className="w-14 h-6 text-xs" min="0" max="23" />
                      <span className="text-xs text-muted-foreground">hrs before</span>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <Label className="text-xs">Post Mailer:</Label>
                      <Input type="number" value={postMailerDays} onChange={(e) => { setPostMailerDays(Number(e.target.value)); setIsDirty(true); }} className="w-14 h-6 text-xs" min="0" />
                      <span className="text-xs text-muted-foreground">days</span>
                      <Input type="number" value={postMailerHours} onChange={(e) => { setPostMailerHours(Number(e.target.value)); setIsDirty(true); }} className="w-14 h-6 text-xs" min="0" max="23" />
                      <span className="text-xs text-muted-foreground">hrs after</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-2 mt-3">
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => handleNavigate("/admin/property-overview")}>
                  Cancel
                </Button>
                {isDirty && (
                  <Button type="button" size="sm" className="h-7 text-xs" onClick={handleSubmit} disabled={loading}>
                    <Save className="mr-1 h-3 w-3" />
                    Save
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Addons Tab */}
            <TabsContent value="addons">
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
                          <TabsTrigger value="addon" className="text-xs h-6">Addon</TabsTrigger>
                          <TabsTrigger value="addon-images" className="text-xs h-6">Images</TabsTrigger>
                        </TabsList>

                        <TabsContent value="addon" className="space-y-2 mt-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Name</Label>
                              <Input value={addonForm.name} onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })} className="h-7 text-xs" />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Offerings for:</Label>
                              <div className="flex gap-3">
                                <div className="flex items-center gap-1">
                                  <Checkbox id="addon-accommodation" checked={addonForm.offeringsAccommodation} onCheckedChange={(checked) => setAddonForm({ ...addonForm, offeringsAccommodation: checked as boolean })} className="h-3 w-3" />
                                  <Label htmlFor="addon-accommodation" className="cursor-pointer text-xs">Accommodation</Label>
                                </div>
                                <div className="flex items-center gap-1">
                                  <Checkbox id="addon-venue" checked={addonForm.offeringsVenue} onCheckedChange={(checked) => setAddonForm({ ...addonForm, offeringsVenue: checked as boolean })} className="h-3 w-3" />
                                  <Label htmlFor="addon-venue" className="cursor-pointer text-xs">Venue</Label>
                                </div>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Description</Label>
                            <Textarea rows={2} value={addonForm.description} onChange={(e) => setAddonForm({ ...addonForm, description: e.target.value })} className="text-xs" />
                          </div>

                          <div className="grid grid-cols-4 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Price Type</Label>
                              <Select value={addonForm.priceType} onValueChange={(value) => setAddonForm({ ...addonForm, priceType: value })}>
                                <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Price Per Item" className="text-xs">Per Item</SelectItem>
                                  <SelectItem value="Price Per Person" className="text-xs">Per Person</SelectItem>
                                  <SelectItem value="Price Per Night" className="text-xs">Per Night</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Price</Label>
                              <Input type="number" value={addonForm.price} onChange={(e) => setAddonForm({ ...addonForm, price: Number(e.target.value) })} min="0" className="h-7 text-xs" />
                            </div>
                            <div className="col-span-2 space-y-1">
                              <Label className="text-xs">Capacity</Label>
                              <div className="flex items-center gap-1.5">
                                <Checkbox id="addon-capacity" checked={addonForm.hasCapacity} onCheckedChange={(checked) => setAddonForm({ ...addonForm, hasCapacity: checked as boolean })} className="h-3 w-3" />
                                <Input type="number" className="w-20 h-7 text-xs" value={addonForm.capacity} onChange={(e) => setAddonForm({ ...addonForm, capacity: Number(e.target.value) })} min="0" disabled={!addonForm.hasCapacity} />
                              </div>
                            </div>
                          </div>

                          <div className="space-y-1">
                            <Label className="text-xs">Days</Label>
                            <div className="flex flex-wrap gap-2">
                              <div className="flex items-center gap-1">
                                <Checkbox id="addon-all-days" checked={addonForm.allDays} onCheckedChange={(checked) => setAddonForm({ ...addonForm, allDays: checked as boolean })} className="h-3 w-3" />
                                <Label htmlFor="addon-all-days" className="cursor-pointer text-xs">All</Label>
                              </div>
                              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => {
                                const fullDay = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"][i];
                                return (
                                  <div key={fullDay} className="flex items-center gap-1">
                                    <Checkbox id={`addon-${fullDay}`} checked={addonForm[fullDay as keyof typeof addonForm] as boolean} onCheckedChange={(checked) => setAddonForm({ ...addonForm, [fullDay]: checked as boolean })} className="h-3 w-3" />
                                    <Label htmlFor={`addon-${fullDay}`} className="cursor-pointer text-xs">{day}</Label>
                                  </div>
                                );
                              })}
                            </div>
                          </div>

                          <div className="flex justify-end pt-2">
                            <Button size="sm" className="h-7 text-xs" onClick={handleAddAddon}>Create</Button>
                          </div>
                        </TabsContent>

                        <TabsContent value="addon-images" className="mt-2">
                          <div className="grid grid-cols-5 gap-2">
                            <div
                              className={`border-2 border-dashed rounded-md p-3 flex flex-col items-center justify-center cursor-pointer transition-colors ${isAddonImageDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary"}`}
                              onDrop={handleAddonImageDrop}
                              onDragOver={(e) => { e.preventDefault(); setIsAddonImageDragging(true); }}
                              onDragLeave={() => setIsAddonImageDragging(false)}
                              onClick={() => document.getElementById("addon-image-upload")?.click()}
                            >
                              <Upload className="h-6 w-6 text-muted-foreground mb-1" />
                              <p className="text-xs text-muted-foreground text-center">Upload</p>
                              <input id="addon-image-upload" type="file" accept="image/*" multiple className="hidden" onChange={(e) => handleAddonImageUpload(e.target.files)} />
                            </div>
                            {addonImages.slice(0, 8).map((imageUrl, index) => (
                              <div key={index} className="relative aspect-square rounded-md overflow-hidden border border-border group">
                                <img src={imageUrl} alt={`Addon ${index + 1}`} className="w-full h-full object-cover" />
                                <button type="button" onClick={() => removeAddonImage(index)} className="absolute top-1 right-1 bg-muted-foreground/80 hover:bg-destructive rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
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
                          <tr><td colSpan={6} className="py-4 text-center text-xs text-muted-foreground">No addons yet</td></tr>
                        ) : (
                          addons.map((addon) => (
                            <tr key={addon.id} className="border-t hover:bg-muted/50">
                              <td className="py-1.5 px-2 text-xs">{addon.name}</td>
                              <td className="py-1.5 px-2 text-xs text-muted-foreground truncate max-w-[200px]">{addon.description}</td>
                              <td className="py-1.5 px-2 text-xs">{addon.priceType}</td>
                              <td className="py-1.5 px-2 text-xs">{addon.hasCapacity ? addon.capacity : "-"}</td>
                              <td className="py-1.5 px-2 text-xs">{addon.price}</td>
                              <td className="py-1.5 px-2">
                                <div className="flex gap-1">
                                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0"><Edit className="h-3 w-3" /></Button>
                                  <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-destructive" onClick={() => deleteAddon(addon.id)}><Trash2 className="h-3 w-3" /></Button>
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
            </TabsContent>

            {/* Specials Tab */}
            <TabsContent value="specials">
              <Card>
                <CardHeader className="py-2 px-4">
                  <Tabs value={specialsCategory} onValueChange={setSpecialsCategory}>
                    <TabsList className="h-7">
                      <TabsTrigger value="accommodations" className="text-xs h-6">Accommodations</TabsTrigger>
                      {isEvent && <TabsTrigger value="event-wedding" className="text-xs h-6">Event/Wedding</TabsTrigger>}
                      {isConference && <TabsTrigger value="conference" className="text-xs h-6">Conference</TabsTrigger>}
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
                              selectedSpecial === special.id ? "bg-primary text-primary-foreground" : "bg-muted hover:bg-muted/80"
                            }`}
                          >
                            <span className="flex-1 cursor-pointer truncate" onClick={() => setSelectedSpecial(special.id)}>{special.name}</span>
                            <div className="flex gap-0.5">
                              <Button size="sm" variant="ghost" className="h-4 w-4 p-0" onClick={() => setIsEditSpecialOpen(true)}>
                                <Edit className="h-2.5 w-2.5" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-4 w-4 p-0" onClick={() => deleteSpecial(special.id)}>
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
                                <Switch checked={specialForm.isPublic} onCheckedChange={(checked) => setSpecialForm({ ...specialForm, isPublic: checked })} className="scale-75" />
                                <Label className="text-xs">Public</Label>
                              </div>
                            </div>
                          </DialogHeader>

                          <Tabs value={specialDialogTab} onValueChange={setSpecialDialogTab}>
                            <TabsList className="h-7">
                              <TabsTrigger value="edit-special" className="text-xs h-6">Edit Special</TabsTrigger>
                              <TabsTrigger value="special-images" className="text-xs h-6">Images</TabsTrigger>
                            </TabsList>

                            <TabsContent value="edit-special" className="space-y-3 mt-2">
                              <div className="grid grid-cols-3 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">Name*</Label>
                                  <Input value={specialForm.name} onChange={(e) => setSpecialForm({ ...specialForm, name: e.target.value })} className="h-7 text-xs" />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Season</Label>
                                  <Select value={specialForm.season} onValueChange={(value) => setSpecialForm({ ...specialForm, season: value })}>
                                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="08/05/2025-30/09/2025" className="text-xs">08/05/2025-30/09/2025</SelectItem>
                                      <SelectItem value="01/10/2025-30/09/2026" className="text-xs">01/10/2025-30/09/2026</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">Description</Label>
                                  <Input value={specialForm.description} onChange={(e) => setSpecialForm({ ...specialForm, description: e.target.value })} className="h-7 text-xs" />
                                </div>
                              </div>

                              <div className="grid grid-cols-4 gap-2">
                                <div className="space-y-1">
                                  <Label className="text-xs">From</Label>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" className={cn("w-full h-7 justify-start text-left text-xs", !specialForm.periodFrom && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-1 h-3 w-3" />
                                        {specialForm.periodFrom ? format(specialForm.periodFrom, "MM/dd/yy") : "Pick"}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <CalendarComponent mode="single" selected={specialForm.periodFrom} onSelect={(date) => setSpecialForm({ ...specialForm, periodFrom: date })} initialFocus />
                                    </PopoverContent>
                                  </Popover>
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">To</Label>
                                  <Popover>
                                    <PopoverTrigger asChild>
                                      <Button variant="outline" className={cn("w-full h-7 justify-start text-left text-xs", !specialForm.periodTo && "text-muted-foreground")}>
                                        <CalendarIcon className="mr-1 h-3 w-3" />
                                        {specialForm.periodTo ? format(specialForm.periodTo, "MM/dd/yy") : "Pick"}
                                      </Button>
                                    </PopoverTrigger>
                                    <PopoverContent className="w-auto p-0" align="start">
                                      <CalendarComponent mode="single" selected={specialForm.periodTo} onSelect={(date) => setSpecialForm({ ...specialForm, periodTo: date })} initialFocus />
                                    </PopoverContent>
                                  </Popover>
                                </div>
                                <div className="col-span-2 space-y-1">
                                  <Label className="text-xs">Pricing</Label>
                                  <RadioGroup value={specialForm.pricingConfig} onValueChange={(value: any) => setSpecialForm({ ...specialForm, pricingConfig: value })} className="flex gap-3">
                                    <div className="flex items-center space-x-1">
                                      <RadioGroupItem value="discount" id="discount" className="h-3 w-3" />
                                      <Label htmlFor="discount" className="text-xs">Discount %</Label>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <RadioGroupItem value="fixed-off" id="fixed-off" className="h-3 w-3" />
                                      <Label htmlFor="fixed-off" className="text-xs">Fixed Off</Label>
                                    </div>
                                    <div className="flex items-center space-x-1">
                                      <RadioGroupItem value="fixed-price" id="fixed-price" className="h-3 w-3" />
                                      <Label htmlFor="fixed-price" className="text-xs">Fixed Price</Label>
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

                  {specialsCategory === "accommodations" && (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      Accommodation specials coming soon...
                    </div>
                  )}

                  {specialsCategory === "event-wedding" && (
                    <div className="text-center py-6 text-xs text-muted-foreground">
                      Event/Wedding specials coming soon...
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Rate Breakdown Tab */}
            <TabsContent value="rates" className="space-y-0">
              <div className="flex gap-4 h-[calc(100vh-250px)]">
                {/* Left Sidebar - Room Types List */}
                <div className="w-56 border-r bg-muted/30 p-2 space-y-1">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <h3 className="font-semibold text-xs text-muted-foreground">ROOM TYPES</h3>
                  </div>
                  {roomTypes.map((room) => (
                    <div
                      key={room.id}
                      onClick={() => setSelectedRoomType(room.id)}
                      className={`px-2 py-1.5 rounded cursor-pointer transition-colors ${
                        selectedRoomType === room.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      <span className="text-xs font-medium">{room.name}</span>
                    </div>
                  ))}
                </div>

                {/* Main Content - Rate Breakdown Details */}
                <div className="flex-1 overflow-auto">
                  <Tabs defaultValue="rate-types" className="w-full">
                    <TabsList>
                      <TabsTrigger value="rate-types">Rate Types</TabsTrigger>
                      <TabsTrigger value="season">Seasons</TabsTrigger>
                      <TabsTrigger value="rate-breakdown">Rate Breakdown</TabsTrigger>
                      <TabsTrigger value="overview">Overview</TabsTrigger>
                      {isDev && <TabsTrigger value="data-explorer">Data Explorer</TabsTrigger>}
                    </TabsList>

                    {/* Rate Types Sub-tab */}
                    <TabsContent value="rate-types" className="p-6 space-y-4">
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">
                          Rate types imported from your PMS system. Use the "Sync from PMS" button to import or update rate types.
                        </p>
                      </div>

                      {pmsRateTypes.length === 0 ? (
                        <div className="border rounded-lg p-8 text-center text-muted-foreground">
                          <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No rate types imported yet.</p>
                          <p className="text-sm">Connect to your PMS and sync to import rate types.</p>
                        </div>
                      ) : (
                        <div className="space-y-4">
                          {pmsRateTypes.map((rateType) => (
                            <Card key={rateType.id} className="border">
                              <CardHeader className="pb-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <CardTitle className="text-lg">{rateType.name}</CardTitle>
                                    <Badge variant="outline" className="font-mono text-xs">
                                      ID: {rateType.id}
                                    </Badge>
                                  </div>
                                  {rateType.pms_synced && (
                                    <Badge variant="outline" className="text-xs bg-primary/10">
                                      <Cloud className="h-3 w-3 mr-1" />PMS
                                    </Badge>
                                  )}
                                </div>
                                {rateType.description && (
                                  <p className="text-sm text-muted-foreground mt-2">{rateType.description}</p>
                                )}
                              </CardHeader>
                              <CardContent className="pt-0">
                                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                                  {/* Price Type */}
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Price Type</Label>
                                    <p className="font-medium">{rateType.priceType || "-"}</p>
                                  </div>
                                  
                                  {/* Stay Requirements */}
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Min Stay (Days)</Label>
                                    <p className="font-medium">{rateType.minStayDays ?? rateType.minNights ?? "-"}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Max Stay (Days)</Label>
                                    <p className="font-medium">
                                      {(rateType.maxStayDays ?? rateType.maxNights) 
                                        ? (rateType.maxStayDays ?? rateType.maxNights) 
                                        : "-"}
                                    </p>
                                  </div>
                                  
                                  {/* Advance Booking Requirements */}
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Min Advance (Days)</Label>
                                    <p className="font-medium">{rateType.minAdvanceDays ?? "-"}</p>
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Max Advance (Days)</Label>
                                    <p className="font-medium">{rateType.maxAdvanceDays ?? "-"}</p>
                                  </div>
                                </div>
                                
                                {/* Stay Pay Discount Section - Always show */}
                                <Separator className="my-4" />
                                <div className="space-y-2">
                                  <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Stay/Pay Discount</Label>
                                  <div className="grid grid-cols-3 gap-4">
                                    <div className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">Stay Nights</Label>
                                      <p className="font-medium">{rateType.stayPayStayNights ?? "-"}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">Discount Nights</Label>
                                      <p className="font-medium">{rateType.stayPayDiscountNights ?? "-"}</p>
                                    </div>
                                    <div className="space-y-1">
                                      <Label className="text-xs text-muted-foreground">Discount %</Label>
                                      <p className="font-medium">
                                        {rateType.stayPayDiscountPercentage != null 
                                          ? `${rateType.stayPayDiscountPercentage}%` 
                                          : "-"}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      )}
                    </TabsContent>

                    {/* Season Sub-tab - Manual entry only */}
                    <TabsContent value="season" className="p-6 space-y-4">
                      <div className="flex justify-between items-center">
                        <p className="text-sm text-muted-foreground">
                          Manually define seasonal periods with custom stay requirements. Seasons are not imported from PMS.
                        </p>
                        <div className="flex gap-2">
                          {seasons.length === 0 && (
                            <Button variant="outline" onClick={createDefaultSeasons} className="gap-2">
                              <Calendar className="h-4 w-4" />
                              Add Default Seasons
                            </Button>
                          )}
                          <Button onClick={openAddSeasonDialog} className="gap-2">
                            <Plus className="h-4 w-4" />
                            Add Season
                          </Button>
                        </div>
                      </div>

                      {seasons.length === 0 ? (
                        <div className="border rounded-lg p-8 text-center text-muted-foreground">
                          <Calendar className="h-12 w-12 mx-auto mb-4 opacity-50" />
                          <p>No seasons defined.</p>
                          <p className="text-sm mb-4">Seasons are optional. Add them manually if you need different rate periods.</p>
                          <Button variant="secondary" onClick={createDefaultSeasons} className="gap-2">
                            <Calendar className="h-4 w-4" />
                            Create Southern Hemisphere Seasons
                          </Button>
                        </div>
                      ) : (
                        <div className="border rounded-lg overflow-hidden">
                          <table className="w-full">
                            <thead className="bg-muted">
                              <tr>
                                <th className="text-left p-3 font-semibold text-sm">NAME / PERIOD</th>
                                <th className="text-left p-3 font-semibold text-sm">FROM</th>
                                <th className="text-left p-3 font-semibold text-sm">TO</th>
                                <th className="text-left p-3 font-semibold text-sm">MIN STAY</th>
                                <th className="text-left p-3 font-semibold text-sm">MAX STAY</th>
                                <th className="w-24"></th>
                              </tr>
                            </thead>
                            <tbody>
                              {seasons.map((season) => (
                                <tr key={season.id} className="border-t hover:bg-muted/50">
                                  <td className="p-3 font-medium">{season.name || season.title}</td>
                                  <td className="p-3 text-muted-foreground">
                                    {season.from ? format(new Date(season.from), "dd MMM yyyy") : "-"}
                                  </td>
                                  <td className="p-3 text-muted-foreground">
                                    {season.to ? format(new Date(season.to), "dd MMM yyyy") : "-"}
                                  </td>
                                  <td className="p-3">{season.minStay || 1} nights</td>
                                  <td className="p-3">{season.maxStay || "No limit"}</td>
                                  <td className="p-3">
                                    <div className="flex gap-2 justify-end">
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0"
                                        onClick={() => openEditSeasonDialog(season)}
                                      >
                                        <Edit className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                                        onClick={() => deleteSeason(season.id)}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {/* Season Dialog */}
                      <Dialog open={isSeasonDialogOpen} onOpenChange={setIsSeasonDialogOpen}>
                        <DialogContent className="max-w-md">
                          <DialogHeader>
                            <DialogTitle>{editingSeason ? "Edit Season" : "Add New Season"}</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4 pt-4">
                            <div className="space-y-2">
                              <Label>Season Name (optional)</Label>
                              <Input
                                placeholder="e.g., Peak Season, Low Season, Christmas"
                                value={seasonForm.name}
                                onChange={(e) => setSeasonForm({ ...seasonForm, name: e.target.value })}
                              />
                              <p className="text-xs text-muted-foreground">
                                If left empty, the date range will be used as the name
                              </p>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Start Date *</Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      {seasonForm.from ? format(new Date(seasonForm.from), "dd MMM yyyy") : "Select date"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarComponent
                                      mode="single"
                                      selected={seasonForm.from ? new Date(seasonForm.from) : undefined}
                                      onSelect={(date) => setSeasonForm({ ...seasonForm, from: date ? format(date, "yyyy-MM-dd") : "" })}
                                      className="pointer-events-auto"
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                              <div className="space-y-2">
                                <Label>End Date *</Label>
                                <Popover>
                                  <PopoverTrigger asChild>
                                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                                      <CalendarIcon className="mr-2 h-4 w-4" />
                                      {seasonForm.to ? format(new Date(seasonForm.to), "dd MMM yyyy") : "Select date"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <CalendarComponent
                                      mode="single"
                                      selected={seasonForm.to ? new Date(seasonForm.to) : undefined}
                                      onSelect={(date) => setSeasonForm({ ...seasonForm, to: date ? format(date, "yyyy-MM-dd") : "" })}
                                      className="pointer-events-auto"
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                              <div className="space-y-2">
                                <Label>Minimum Stay (nights)</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={seasonForm.minStay}
                                  onChange={(e) => setSeasonForm({ ...seasonForm, minStay: parseInt(e.target.value) || 1 })}
                                />
                              </div>
                              <div className="space-y-2">
                                <Label>Maximum Stay (nights)</Label>
                                <Input
                                  type="number"
                                  min="0"
                                  value={seasonForm.maxStay}
                                  onChange={(e) => setSeasonForm({ ...seasonForm, maxStay: parseInt(e.target.value) || 0 })}
                                />
                                <p className="text-xs text-muted-foreground">0 = No limit</p>
                              </div>
                            </div>

                            <div className="flex justify-end gap-2 pt-4">
                              <Button variant="outline" onClick={() => setIsSeasonDialogOpen(false)}>
                                Cancel
                              </Button>
                              <Button onClick={saveSeason}>
                                {editingSeason ? "Update Season" : "Add Season"}
                              </Button>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>
                    </TabsContent>

                    {/* Rate Breakdown Sub-tab */}
                    <TabsContent value="rate-breakdown" className="p-6 space-y-6">
                      {seasons.length === 0 ? (
                        (() => {
                          const currentRoom = roomTypes.find(r => r.id === selectedRoomType);
                          const linkedRateTypes = currentRoom?.linkedRateTypes || [];
                          const availableRateTypes = (pmsRateTypes || []) as Array<{id: number | string; name: string; priceType?: string}>;
                          // Handle both number and string comparisons for linkedRateTypes
                          const roomLinkedRateTypes = availableRateTypes.filter(rt => 
                            linkedRateTypes.some((linked: number | string) => String(linked) === String(rt.id))
                          );
                          
                          if (roomLinkedRateTypes.length === 0) {
                            return (
                              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No rate types linked to this room.</p>
                                <p className="text-sm">Link rate types in the Room Type tab first.</p>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-6">
                              <p className="text-sm text-muted-foreground">
                                Set base rates for <strong>{currentRoom?.name}</strong> (no seasons defined).
                              </p>
                              
                              {roomLinkedRateTypes.map((rateType) => {
                                const priceType = rateType.priceType || 'Per Unit';
                                const isPerPerson = priceType.toLowerCase().includes('person');
                                
                                  // Get today's rate from PMS cache
                                  const currentRoom = roomTypes.find(r => r.id === selectedRoomType);
                                  const roomRateTypes = currentRoom?.rateTypes || [];
                                  const rateTypeData = roomRateTypes.find((rt: any) => rt.rateTypeId === rateType.id);
                                  const todayStr = format(new Date(), 'yyyy-MM-dd');
                                  const todayRateData = rateTypeData?.rates?.find((r: any) => r.date === todayStr);
                                  
                                  return (
                                    <div key={rateType.id} className="border rounded-lg overflow-hidden">
                                    <div className="p-4 bg-muted/50">
                                      <div className="flex items-center gap-2">
                                        <h3 className="font-semibold">{rateType.name}</h3>
                                        <Badge variant="outline" className="text-xs">{priceType}</Badge>
                                        {selectedPMS === 'benson' && (
                                          <Badge variant="outline" className="text-xs bg-primary/10"><Cloud className="h-3 w-3 mr-1" />Benson</Badge>
                                        )}
                                      </div>
                                      {selectedPMS === 'benson' && (
                                        <p className="text-xs text-muted-foreground mt-1">Today's rate from Benson ({todayStr})</p>
                                      )}
                                    </div>
                                    
                                    <div className="p-4">
                                      {isPerPerson ? (
                                        <div className="grid grid-cols-5 gap-4">
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium text-muted-foreground">Room Amount</Label>
                                            <Input
                                              type="number"
                                              min="0"
                                              value={todayRateData?.roomAmount ?? 0}
                                              className="text-center bg-muted cursor-not-allowed"
                                              placeholder="—"
                                              disabled
                                            />
                                          </div>
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium text-muted-foreground">Adult Amount</Label>
                                            <Input
                                              type="number"
                                              min="0"
                                              value={todayRateData?.adultAmount1 ?? todayRateData?.adultAmount2 ?? 0}
                                              className="text-center bg-muted cursor-not-allowed"
                                              placeholder="—"
                                              disabled
                                            />
                                          </div>
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium text-muted-foreground">Teen Amount</Label>
                                            <Input
                                              type="number"
                                              min="0"
                                              value={todayRateData?.teenAmount ?? 0}
                                              className="text-center bg-muted cursor-not-allowed"
                                              placeholder="—"
                                              disabled
                                            />
                                          </div>
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium text-muted-foreground">Child Amount</Label>
                                            <Input
                                              type="number"
                                              min="0"
                                              value={todayRateData?.childAmount ?? 0}
                                              className="text-center bg-muted cursor-not-allowed"
                                              placeholder="—"
                                              disabled
                                            />
                                          </div>
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium text-muted-foreground">Infant Amount</Label>
                                            <Input
                                              type="number"
                                              min="0"
                                              value={todayRateData?.infantAmount ?? 0}
                                              className="text-center bg-muted cursor-not-allowed"
                                              placeholder="—"
                                              disabled
                                            />
                                          </div>
                                        </div>
                                      ) : (
                                        <div className="max-w-xs">
                                          <div className="space-y-2">
                                            <Label className="text-xs font-medium text-muted-foreground">Room Amount</Label>
                                            <Input
                                              type="number"
                                              min="0"
                                              value={todayRateData?.roomAmount ?? 0}
                                              className="text-center bg-muted cursor-not-allowed"
                                              placeholder="—"
                                              disabled
                                            />
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  );
                                })}
                            </div>
                          );
                        })()
                      ) : (
                        <>
                          <div className="flex items-center justify-between mb-4">
                            <p className="text-sm text-muted-foreground">
                              Set rates for <strong>{roomTypes.find(r => r.id === selectedRoomType)?.name}</strong> across all seasons.
                            </p>
                            
                            {/* Group By Toggle */}
                            <div className="flex items-center gap-2 bg-muted rounded-lg p-1">
                              <button
                                type="button"
                                onClick={() => setRateBreakdownGroupBy('season')}
                                className={cn(
                                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                                  rateBreakdownGroupBy === 'season' 
                                    ? "bg-background shadow text-foreground" 
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                By Season
                              </button>
                              <button
                                type="button"
                                onClick={() => setRateBreakdownGroupBy('mealType')}
                                className={cn(
                                  "px-3 py-1.5 text-sm rounded-md transition-colors",
                                  rateBreakdownGroupBy === 'mealType' 
                                    ? "bg-background shadow text-foreground" 
                                    : "text-muted-foreground hover:text-foreground"
                                )}
                              >
                                By Rate Type
                              </button>
                            </div>
                          </div>
                          
                          {/* Group by Season View */}
                          {rateBreakdownGroupBy === 'season' && seasons.map((season) => {
                            const isExpanded = expandedSeasons[season.id] ?? true;
                            const rateSummary = getSeasonRateSummary(season.id, selectedRoomType);
                            const currentRoom = roomTypes.find(r => r.id === selectedRoomType);
                            const linkedRateTypes = currentRoom?.linkedRateTypes || [];
                            const availableRateTypes = (pmsRateTypes || []) as Array<{id: number | string; name: string; priceType?: string}>;
                            const roomLinkedRateTypes = availableRateTypes.filter(rt => 
                              linkedRateTypes.some((linked: number | string) => String(linked) === String(rt.id))
                            );
                            
                            return (
                              <div key={season.id} className="border rounded-lg overflow-hidden">
                                {/* Collapsible Header */}
                                <button
                                  type="button"
                                  onClick={() => toggleSeasonExpanded(season.id)}
                                  className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition-colors text-left"
                                >
                                  <div className="flex items-center gap-3">
                                    {isExpanded ? (
                                      <Minus className="h-4 w-4 text-primary" />
                                    ) : (
                                      <Plus className="h-4 w-4 text-primary" />
                                    )}
                                    <div>
                                      <h3 className="font-semibold">
                                        {season.name || season.title}
                                      </h3>
                                      <span className="text-sm text-muted-foreground">
                                        {season.from ? format(new Date(season.from), "dd MMM yyyy") : ""} - {season.to ? format(new Date(season.to), "dd MMM yyyy") : ""}
                                      </span>
                                    </div>
                                  </div>
                                  
                                  {/* Min/Max Rate Summary - shown when collapsed */}
                                  {!isExpanded && (
                                    <div className="flex items-center gap-4 text-sm">
                                      <div className="text-right">
                                        <div className="text-muted-foreground text-xs">Min Rate</div>
                                        <div className="font-mono font-medium">{rateSummary.min > 0 ? rateSummary.min.toFixed(2) : "—"}</div>
                                      </div>
                                      <div className="text-right">
                                        <div className="text-muted-foreground text-xs">Max Rate</div>
                                        <div className="font-mono font-medium">{rateSummary.max > 0 ? rateSummary.max.toFixed(2) : "—"}</div>
                                      </div>
                                    </div>
                                  )}
                                </button>

                                {/* Collapsible Content */}
                                {isExpanded && (
                                  <div className="p-4 space-y-4">
                                    {roomLinkedRateTypes.length === 0 ? (
                                      <div className="border rounded-lg p-4 text-center text-muted-foreground text-sm">
                                        No rate types linked to this room. Link rate types in the Room Type tab.
                                      </div>
                                    ) : (
                                      roomLinkedRateTypes.map((rateType) => {
                                        const priceType = rateType.priceType || 'Per Unit';
                                        const isPerPerson = priceType.toLowerCase().includes('person');
                                        
                                        return (
                                          <div key={rateType.id} className="border rounded-lg p-4 bg-card">
                                            <div className="flex items-center gap-2 mb-4">
                                              <span className="text-sm font-medium">{rateType.name}</span>
                                              <Badge variant="outline" className="text-xs">{priceType}</Badge>
                                            </div>

                                            {isPerPerson ? (
                                              <div className="grid grid-cols-5 gap-4">
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium text-muted-foreground">Room Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'roomAmount')}
                                                    className="text-center bg-muted cursor-not-allowed"
                                                    placeholder="—"
                                                    disabled
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium">Adult Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'adultAmount')}
                                                    onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'adultAmount', parseFloat(e.target.value) || 0)}
                                                    className="text-center"
                                                    placeholder="0.00"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium">Teen Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'teenAmount')}
                                                    onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'teenAmount', parseFloat(e.target.value) || 0)}
                                                    className="text-center"
                                                    placeholder="0.00"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium">Child Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'childAmount')}
                                                    onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'childAmount', parseFloat(e.target.value) || 0)}
                                                    className="text-center"
                                                    placeholder="0.00"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium">Infant Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'infantAmount')}
                                                    onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'infantAmount', parseFloat(e.target.value) || 0)}
                                                    className="text-center"
                                                    placeholder="0.00"
                                                  />
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="max-w-xs">
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium">Room Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'roomAmount')}
                                                    onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'roomAmount', parseFloat(e.target.value) || 0)}
                                                    className="text-center"
                                                    placeholder="0.00"
                                                  />
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        );
                                      })
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })}

                          {/* Group by Rate Type View */}
                          {rateBreakdownGroupBy === 'mealType' && (() => {
                            const currentRoom = roomTypes.find(r => r.id === selectedRoomType);
                            const linkedRateTypes = currentRoom?.linkedRateTypes || [];
                            const availableRateTypes = (pmsRateTypes || []) as Array<{id: number | string; name: string; priceType?: string}>;
                            const roomLinkedRateTypes = availableRateTypes.filter(rt => 
                              linkedRateTypes.some((linked: number | string) => String(linked) === String(rt.id))
                            );
                            
                            return roomLinkedRateTypes.length === 0 ? (
                              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                                <DollarSign className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>No rate types linked to this room.</p>
                                <p className="text-sm">Link rate types in the Room Type tab first.</p>
                              </div>
                            ) : (
                              roomLinkedRateTypes.map((rateType) => {
                                const isExpanded = expandedMealTypes[String(rateType.id)] ?? true;
                                const priceType = rateType.priceType || 'Per Unit';
                                const isPerPerson = priceType.toLowerCase().includes('person');
                                
                                return (
                                  <div key={rateType.id} className="border rounded-lg overflow-hidden">
                                    {/* Collapsible Header */}
                                    <button
                                      type="button"
                                      onClick={() => toggleMealTypeExpanded(String(rateType.id))}
                                      className="w-full flex items-center justify-between p-4 bg-muted/50 hover:bg-muted transition-colors text-left"
                                    >
                                      <div className="flex items-center gap-3">
                                        {isExpanded ? (
                                          <Minus className="h-4 w-4 text-primary" />
                                        ) : (
                                          <Plus className="h-4 w-4 text-primary" />
                                        )}
                                        <div className="flex items-center gap-2">
                                          <h3 className="font-semibold">{rateType.name}</h3>
                                          <Badge variant="outline" className="text-xs">{priceType}</Badge>
                                        </div>
                                      </div>
                                      
                                      <span className="text-sm text-muted-foreground">
                                        {seasons.length} season{seasons.length !== 1 ? 's' : ''}
                                      </span>
                                    </button>

                                    {/* Collapsible Content - Seasons as sub-categories */}
                                    {isExpanded && (
                                      <div className="p-4 space-y-4">
                                        {seasons.map((season) => (
                                          <div key={season.id} className="border rounded-lg p-4 bg-card">
                                            <div className="text-sm font-medium text-muted-foreground mb-4">
                                              {season.name || season.title}
                                              <span className="ml-2 text-xs">
                                                ({season.from ? format(new Date(season.from), "dd MMM") : ""} - {season.to ? format(new Date(season.to), "dd MMM") : ""})
                                              </span>
                                            </div>

                                            {isPerPerson ? (
                                              <div className="grid grid-cols-5 gap-4">
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium text-muted-foreground">Room Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'roomAmount')}
                                                    className="text-center bg-muted cursor-not-allowed"
                                                    placeholder="—"
                                                    disabled
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium">Adult Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'adultAmount')}
                                                    onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'adultAmount', parseFloat(e.target.value) || 0)}
                                                    className="text-center"
                                                    placeholder="0.00"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium">Teen Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'teenAmount')}
                                                    onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'teenAmount', parseFloat(e.target.value) || 0)}
                                                    className="text-center"
                                                    placeholder="0.00"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium">Child Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'childAmount')}
                                                    onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'childAmount', parseFloat(e.target.value) || 0)}
                                                    className="text-center"
                                                    placeholder="0.00"
                                                  />
                                                </div>
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium">Infant Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'infantAmount')}
                                                    onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'infantAmount', parseFloat(e.target.value) || 0)}
                                                    className="text-center"
                                                    placeholder="0.00"
                                                  />
                                                </div>
                                              </div>
                                            ) : (
                                              <div className="max-w-xs">
                                                <div className="space-y-2">
                                                  <Label className="text-xs font-medium">Room Amount</Label>
                                                  <Input
                                                    type="number"
                                                    min="0"
                                                    value={getSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'roomAmount')}
                                                    onChange={(e) => updateSeasonRate(selectedRoomType, `${season.id}-${rateType.id}`, 'roomAmount', parseFloat(e.target.value) || 0)}
                                                    className="text-center"
                                                    placeholder="0.00"
                                                  />
                                                </div>
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                );
                              })
                            );
                          })()}
                        </>
                      )}
                    </TabsContent>

                    {/* Overview Sub-tab */}
                    <TabsContent value="overview" className="p-6 space-y-6">
                      {(() => {
                        const currentRoom = roomTypes.find(r => r.id === selectedRoomType);
                        // Use linkedRateTypes if manually set, otherwise fall back to availableRateTypes
                        let linkedRateTypes = getRoomLinkedRateTypes(selectedRoomType);
                        if (linkedRateTypes.length === 0 && currentRoom?.availableRateTypes?.length > 0) {
                          linkedRateTypes = currentRoom.availableRateTypes;
                        }
                        const linkedRateTypeData = pmsRateTypes.filter(rt => linkedRateTypes.includes(rt.id));
                        
                        // Check if PMS rates exist for this room
                        const pmsRates = currentRoom?.pms_rates || [];
                        const hasPmsRates = pmsRates.length > 0;
                        
                        // Group PMS rates by rateTypeId
                        const pmsRatesByType: Record<number, any[]> = {};
                        pmsRates.forEach((rate: any) => {
                          if (!pmsRatesByType[rate.rateTypeId]) {
                            pmsRatesByType[rate.rateTypeId] = [];
                          }
                          pmsRatesByType[rate.rateTypeId].push(rate);
                        });
                        
                        // Helper to get first non-null rate value from PMS rates for a rate type
                        const getPmsRateValue = (rateTypeId: number, field: string) => {
                          const rates = pmsRatesByType[rateTypeId] || [];
                          for (const rate of rates) {
                            if (rate[field] !== null && rate[field] !== undefined) {
                              return rate[field];
                            }
                          }
                          return null;
                        };
                        
                        if (linkedRateTypeData.length === 0 && !hasPmsRates) {
                          return (
                            <div className="border rounded-lg p-8 text-center text-muted-foreground">
                              <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
                              <p>No rate types linked to this room.</p>
                              <p className="text-sm">Link rate types in the "Rate Types" tab or sync from PMS to see the overview.</p>
                            </div>
                          );
                        }

                        // If we have PMS rates but no linked rate types, use the PMS rate types
                        const displayRateTypes = linkedRateTypeData.length > 0 
                          ? linkedRateTypeData 
                          : Object.keys(pmsRatesByType).map(id => {
                              const rates = pmsRatesByType[Number(id)];
                              return {
                                id: Number(id),
                                name: rates[0]?.rateTypeName || `Rate Type ${id}`,
                                priceType: null,
                                description: null,
                              };
                            });

                        return (
                          <>
                            <p className="text-sm text-muted-foreground">
                              Rate overview for <strong>{currentRoom?.name}</strong>
                              {hasPmsRates && (
                                <Badge variant="outline" className="ml-2 text-xs">
                                  <Cloud className="h-3 w-3 mr-1" />
                                  {pmsRates.length} PMS rates loaded
                                </Badge>
                              )}
                            </p>

                            {displayRateTypes.slice(0, 5).map((rateType) => {
                              const typeRates = pmsRatesByType[rateType.id] || [];
                              // Get today's date in YYYY-MM-DD format
                              const today = format(new Date(), 'yyyy-MM-dd');
                              const todayRate = typeRates.find((r: any) => r.date === today);
                              
                              const roomAmount = todayRate?.roomAmount ?? '—';
                              const adultAmount1 = todayRate?.adultAmount1 ?? '—';
                              const adultAmount2 = todayRate?.adultAmount2 ?? '—';
                              const teenAmount = todayRate?.teenAmount ?? '—';
                              const childAmount = todayRate?.childAmount ?? '—';
                              const infantAmount = todayRate?.infantAmount ?? '—';
                              
                              return (
                                <div key={rateType.id} className="border rounded-lg overflow-hidden">
                                  <div className="bg-primary/10 px-4 py-3 border-b">
                                    <div className="flex items-center justify-between">
                                      <h4 className="font-semibold">{rateType.name}</h4>
                                      {rateType.priceType && (
                                        <Badge variant="secondary">{rateType.priceType}</Badge>
                                      )}
                                    </div>
                                    {rateType.description && (
                                      <p className="text-xs text-muted-foreground mt-1">{rateType.description}</p>
                                    )}
                                  </div>
                                  
                                  {/* Today's PMS Rates Display */}
                                  {typeRates.length > 0 ? (
                                    <div className="p-4">
                                      <p className="text-xs text-muted-foreground mb-3">
                                        Today's rate ({today}) from Benson
                                      </p>
                                      <div className="grid grid-cols-6 gap-4 text-sm">
                                        <div className="text-center p-3 bg-muted/50 rounded">
                                          <div className="text-xs text-muted-foreground mb-1">ROOM</div>
                                          <div className="font-mono font-semibold">{roomAmount}</div>
                                        </div>
                                        <div className="text-center p-3 bg-muted/50 rounded">
                                          <div className="text-xs text-muted-foreground mb-1">1 ADULT</div>
                                          <div className="font-mono font-semibold">{adultAmount1}</div>
                                        </div>
                                        <div className="text-center p-3 bg-muted/50 rounded">
                                          <div className="text-xs text-muted-foreground mb-1">2 ADULTS</div>
                                          <div className="font-mono font-semibold">{adultAmount2}</div>
                                        </div>
                                        <div className="text-center p-3 bg-muted/50 rounded">
                                          <div className="text-xs text-muted-foreground mb-1">TEEN</div>
                                          <div className="font-mono font-semibold">{teenAmount}</div>
                                        </div>
                                        <div className="text-center p-3 bg-muted/50 rounded">
                                          <div className="text-xs text-muted-foreground mb-1">CHILD</div>
                                          <div className="font-mono font-semibold">{childAmount}</div>
                                        </div>
                                        <div className="text-center p-3 bg-muted/50 rounded">
                                          <div className="text-xs text-muted-foreground mb-1">INFANT</div>
                                          <div className="font-mono font-semibold">{infantAmount}</div>
                                        </div>
                                      </div>
                                      
                                      {/* First 5 date-specific rates */}
                                      <div className="mt-4">
                                        <div className="overflow-x-auto">
                                          <table className="w-full text-xs">
                                            <tbody>
                                              {typeRates.slice(0, 5).map((rate: any, idx: number) => (
                                                <tr key={idx} className="border-t hover:bg-muted/20">
                                                  <td className="p-2 font-mono">{rate.date}</td>
                                                  <td className="p-2 text-right">{rate.roomAmount ?? '—'}</td>
                                                  <td className="p-2 text-right">{rate.adultAmount1 ?? '—'}</td>
                                                  <td className="p-2 text-right">{rate.adultAmount2 ?? '—'}</td>
                                                  <td className="p-2 text-right">{rate.teenAmount ?? '—'}</td>
                                                  <td className="p-2 text-right">{rate.childAmount ?? '—'}</td>
                                                  <td className="p-2 text-right">{rate.infantAmount ?? '—'}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                          {typeRates.length > 5 && (
                                            <p className="text-xs text-muted-foreground mt-1">
                                              + {typeRates.length - 5} more dates
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    /* Season-based rates table fallback */
                                    <table className="w-full">
                                      <thead className="bg-muted">
                                        <tr>
                                          <th className="text-left p-3 font-semibold text-sm">SEASON</th>
                                          <th className="text-left p-3 font-semibold text-sm">PERIOD</th>
                                          <th className="text-left p-3 font-semibold text-sm">MEAL TYPE</th>
                                          <th className="text-right p-3 font-semibold text-sm">ROOM</th>
                                          <th className="text-right p-3 font-semibold text-sm">ADULT</th>
                                          <th className="text-right p-3 font-semibold text-sm">TEEN</th>
                                          <th className="text-right p-3 font-semibold text-sm">CHILD</th>
                                          <th className="text-right p-3 font-semibold text-sm">INFANT</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {seasons.length > 0 ? (
                                          seasons.map((season) => {
                                            const roomMealTypes = currentRoom?.mealTypes || [];
                                            return roomMealTypes.length > 0 ? (
                                              roomMealTypes.map((mealType: string, idx: number) => (
                                                <tr key={`${rateType.id}-${season.id}-${mealType}`} className="border-t hover:bg-muted/50">
                                                  {idx === 0 && (
                                                    <>
                                                      <td className="p-3 font-medium" rowSpan={roomMealTypes.length}>
                                                        {season.name || season.title}
                                                      </td>
                                                      <td className="p-3 text-muted-foreground text-sm" rowSpan={roomMealTypes.length}>
                                                        {season.from ? format(new Date(season.from), "dd MMM") : ""} - {season.to ? format(new Date(season.to), "dd MMM") : ""}
                                                      </td>
                                                    </>
                                                  )}
                                                  <td className="p-3">{mealType}</td>
                                                  <td className="p-3 text-right font-mono">
                                                    {getSeasonRate(selectedRoomType, `${season.id}-${mealType}`, 'roomAmount') || "—"}
                                                  </td>
                                                  <td className="p-3 text-right font-mono">
                                                    {getSeasonRate(selectedRoomType, `${season.id}-${mealType}`, 'adultAmount') || "—"}
                                                  </td>
                                                  <td className="p-3 text-right font-mono">
                                                    {getSeasonRate(selectedRoomType, `${season.id}-${mealType}`, 'teenAmount') || "—"}
                                                  </td>
                                                  <td className="p-3 text-right font-mono">
                                                    {getSeasonRate(selectedRoomType, `${season.id}-${mealType}`, 'childAmount') || "—"}
                                                  </td>
                                                  <td className="p-3 text-right font-mono">
                                                    {getSeasonRate(selectedRoomType, `${season.id}-${mealType}`, 'infantAmount') || "—"}
                                                  </td>
                                                </tr>
                                              ))
                                            ) : (
                                              <tr key={`${rateType.id}-${season.id}`} className="border-t">
                                                <td className="p-3 font-medium">{season.name || season.title}</td>
                                                <td className="p-3 text-muted-foreground text-sm">
                                                  {season.from ? format(new Date(season.from), "dd MMM") : ""} - {season.to ? format(new Date(season.to), "dd MMM") : ""}
                                                </td>
                                                <td colSpan={6} className="p-3 text-center text-muted-foreground text-sm">
                                                  No meal types configured for this room
                                                </td>
                                              </tr>
                                            );
                                          })
                                        ) : (
                                          <tr>
                                            <td colSpan={8} className="p-6 text-center text-muted-foreground">
                                              No seasons configured. Add seasons or sync from PMS to see rates.
                                            </td>
                                          </tr>
                                        )}
                                      </tbody>
                                    </table>
                                  )}
                                </div>
                              );
                            })}
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Data Explorer Sub-tab - Dev only */}
                    {isDev && (
                      <TabsContent value="data-explorer" className="p-6 space-y-4">
                        {(() => {
                          const currentRoom = roomTypes.find(r => r.id === selectedRoomType);
                          if (!currentRoom) {
                            return (
                              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                                <Info className="h-12 w-12 mx-auto mb-4 opacity-50" />
                                <p>Select a room type to explore its data.</p>
                              </div>
                            );
                          }
                          return (
                            <>
                              <p className="text-sm text-muted-foreground">
                                Raw data explorer for <strong>{currentRoom.name}</strong>
                              </p>
                              <RoomTypeDataViewer room={currentRoom} rateTypes={pmsRateTypes} />
                            </>
                          );
                        })()}
                      </TabsContent>
                    )}
                  </Tabs>
                </div>
              </div>
            </TabsContent>

            {/* Room Information Tab */}
            <TabsContent value="rooms" className="space-y-0">
              <div className="flex gap-2 h-[calc(100vh-220px)]">
                {/* Left Sidebar - Room Types List */}
                <div className="w-56 border-r bg-muted/30 p-2 space-y-1">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-1">
                      <h3 className="font-semibold text-xs">ROOM TYPES</h3>
                      {selectedPMS && isFieldPopulatedByPMS("room_types", selectedPMS) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Cloud className="h-3 w-3 text-primary" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Synced from {getPMSDisplayName(selectedPMS)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={addRoomType}>
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                  {roomTypes.map((room) => (
                    <div
                      key={room.id}
                      className={cn(
                        "flex items-center justify-between p-2 rounded-md transition-colors text-xs",
                        selectedRoomType === room.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                        room.pms_synced && selectedRoomType !== room.id ? "bg-primary/5 border border-primary/20" : "",
                      )}
                    >
                      <span
                        className="font-medium flex-1 cursor-pointer truncate"
                        onClick={() => setSelectedRoomType(room.id)}
                      >
                        {room.name}
                        {room.pms_synced && <Cloud className="inline h-2.5 w-2.5 ml-1 opacity-50" />}
                      </span>
                      <div className="flex gap-0.5">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = getRoomUrl(propertySlug || id || "", room.id);
                            if (homeIconOpenNewTab) {
                              window.open(url, "_blank");
                            } else {
                              navigate(`/property/${propertySlug || id}/room/${room.id}`);
                            }
                          }}
                          title="View room page"
                        >
                          <Home className="h-2.5 w-2.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(getRoomUrl(propertySlug || id || "", room.id));
                            toast({
                              title: "Copied",
                              description: "Room URL copied to clipboard",
                            });
                          }}
                          title="Copy room URL"
                        >
                          <Copy className="h-2.5 w-2.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-5 w-5 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRoomType(room.id);
                          }}
                        >
                          <Trash2 className="h-2.5 w-2.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Main Content - Room Type Details */}
                <div className="flex-1 overflow-auto">
                  <Tabs defaultValue="room-type" className="w-full">
                    <TabsList className="h-8">
                      <TabsTrigger value="room-type" className="text-xs h-7">Room Type</TabsTrigger>
                      {selectedPMS !== 'nightsbridge' && (
                        <TabsTrigger value="rate-types" className="text-xs h-7">Rate Types</TabsTrigger>
                      )}
                      <TabsTrigger value="facilities" className="text-xs h-7">Facilities</TabsTrigger>
                      <TabsTrigger value="amenities" className="text-xs h-7">Amenities</TabsTrigger>
                      {selectedPMS !== 'nightsbridge' && (
                        <TabsTrigger value="room-images" className="text-xs h-7">Images</TabsTrigger>
                      )}
                      {selectedPMS !== 'nightsbridge' && (
                        <TabsTrigger value="agreement" className="text-xs h-7">Agreement</TabsTrigger>
                      )}
                    </TabsList>

                    {/* Room Type Sub-tab */}
                    <TabsContent value="room-type" className="p-3 space-y-3">
                      <div className="grid grid-cols-4 gap-2 items-end">
                        <div className="col-span-2 flex items-center gap-2">
                          <Label className="text-xs whitespace-nowrap flex items-center gap-1">
                            Name
                            {isRoomFieldPmsSynced(selectedRoomType, 'name') && (
                              <Badge variant="outline" className="text-[10px] h-4 px-1 bg-primary/10"><Cloud className="h-2.5 w-2.5" /></Badge>
                            )}
                          </Label>
                          <Input
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.name || ""}
                            onChange={(e) => updateRoomTypeName(selectedRoomType, e.target.value)}
                            className={cn("h-7 text-xs", getRoomPmsFieldClass(selectedRoomType, 'name'))}
                            disabled={isRoomFieldPmsSynced(selectedRoomType, 'name')}
                          />
                        </div>
                        <div className="flex items-center gap-2">
                          <Label className="text-xs whitespace-nowrap"># Rooms</Label>
                          <Input
                            type="number"
                            className="h-7 text-xs w-20"
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.numRooms || 1}
                            onChange={(e) =>
                              updateRoomTypeField(selectedRoomType, "numRooms", parseInt(e.target.value) || 1)
                            }
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Input
                            readOnly
                            className="bg-muted/50 h-7 text-xs"
                            value={getRoomUrl(propertySlug || id || "", selectedRoomType || "")}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => {
                              navigator.clipboard.writeText(
                                getRoomUrl(propertySlug || id || "", selectedRoomType || ""),
                              );
                              toast({
                                title: "URL Copied",
                                description: "Room URL has been copied to clipboard",
                              });
                            }}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>

                      {selectedPMS && (
                        <div className="grid grid-cols-2 gap-2 items-end">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs whitespace-nowrap">{selectedPMS.charAt(0).toUpperCase() + selectedPMS.slice(1)} Type</Label>
                            <Input
                              className="h-7 text-xs"
                              value={roomTypes.find((r) => r.id === selectedRoomType)?.pmsRoomType || ""}
                              onChange={(e) => updateRoomTypeField(selectedRoomType, "pmsRoomType", e.target.value)}
                              placeholder={`${selectedPMS} room type`}
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <Label className="text-xs whitespace-nowrap">{selectedPMS.charAt(0).toUpperCase() + selectedPMS.slice(1)} ID</Label>
                            <Input
                              className="h-7 text-xs"
                              value={roomTypes.find((r) => r.id === selectedRoomType)?.pmsRoomId || ""}
                              onChange={(e) => updateRoomTypeField(selectedRoomType, "pmsRoomId", e.target.value)}
                              placeholder={`${selectedPMS} ID`}
                            />
                          </div>
                        </div>
                      )}

                      {!selectedPMS && (
                        <div className="bg-muted/50 border border-border rounded-md p-2">
                          <p className="text-xs text-muted-foreground">
                            No PMS connected. Select a PMS in General tab.
                          </p>
                        </div>
                      )}

                      <div className="flex items-start gap-2">
                        <Label className="text-xs whitespace-nowrap pt-1.5 flex items-center gap-1">
                          Description
                          {isRoomFieldPmsSynced(selectedRoomType, 'description') && (
                            <Badge variant="outline" className="text-[10px] h-4 px-1 bg-primary/10"><Cloud className="h-2.5 w-2.5" /></Badge>
                          )}
                        </Label>
                        <Textarea
                          rows={2}
                          className={cn("text-xs flex-1", getRoomPmsFieldClass(selectedRoomType, 'description'))}
                          value={roomTypes.find((r) => r.id === selectedRoomType)?.description || ""}
                          onChange={(e) => updateRoomTypeField(selectedRoomType, "description", e.target.value)}
                          disabled={isRoomFieldPmsSynced(selectedRoomType, 'description')}
                        />
                      </div>

                      <div className="flex items-start gap-2">
                        <Label className="text-xs whitespace-nowrap pt-1.5">Extra Person Policy</Label>
                        <Textarea
                          rows={1}
                          className="text-xs flex-1"
                          value={roomTypes.find((r) => r.id === selectedRoomType)?.extraPersonPolicy || ""}
                          onChange={(e) => updateRoomTypeField(selectedRoomType, "extraPersonPolicy", e.target.value)}
                        />
                      </div>

                      {/* Bed Configuration Section */}
                      <div className="flex items-start gap-2">
                        <Label className="text-xs whitespace-nowrap pt-1">Beds</Label>
                        <div className="border rounded-md p-2 flex-1 flex flex-wrap gap-2 items-center">
                          {(() => {
                            const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
                            const bedConfig = parseBedConfiguration(currentRoom?.bedConfiguration);
                            
                            return (
                              <>
                                {bedConfig.map((bed, index) => (
                                  <div key={index} className="flex items-center gap-1 bg-muted/50 rounded px-2 py-1">
                                    <Select
                                      value={bed.type}
                                      onValueChange={(value) => {
                                        const newConfig = [...bedConfig];
                                        newConfig[index] = { ...bed, type: value };
                                        updateRoomTypeField(selectedRoomType, "bedConfiguration", newConfig);
                                      }}
                                    >
                                      <SelectTrigger className="w-[100px] h-6 text-xs border-0 bg-transparent">
                                        <SelectValue placeholder="Bed type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {BED_TYPES.map((bt) => (
                                          <SelectItem key={bt.value} value={bt.value}>{bt.label}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      onClick={() => {
                                        const newConfig = [...bedConfig];
                                        newConfig[index] = { ...bed, count: Math.max(1, bed.count - 1) };
                                        updateRoomTypeField(selectedRoomType, "bedConfiguration", newConfig);
                                      }}
                                      disabled={bed.count <= 1}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="w-4 text-center text-xs font-medium">{bed.count}</span>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5"
                                      onClick={() => {
                                        const newConfig = [...bedConfig];
                                        newConfig[index] = { ...bed, count: bed.count + 1 };
                                        updateRoomTypeField(selectedRoomType, "bedConfiguration", newConfig);
                                      }}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-5 w-5 text-destructive hover:text-destructive"
                                      onClick={() => {
                                        const newConfig = bedConfig.filter((_, i) => i !== index);
                                        updateRoomTypeField(selectedRoomType, "bedConfiguration", newConfig);
                                      }}
                                    >
                                      <X className="h-3 w-3" />
                                    </Button>
                                  </div>
                                ))}
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-6 text-xs"
                                  onClick={() => {
                                    const newConfig = [...bedConfig, { type: "king", count: 1 }];
                                    updateRoomTypeField(selectedRoomType, "bedConfiguration", newConfig);
                                  }}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add
                                </Button>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="grid grid-cols-6 gap-2 items-end">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs whitespace-nowrap">Size (m²)</Label>
                          <Input
                            type="number"
                            className="h-7 text-xs w-16"
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.roomSize || 0}
                            onChange={(e) =>
                              updateRoomTypeField(selectedRoomType, "roomSize", parseInt(e.target.value) || 0)
                            }
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs whitespace-nowrap">Baths</Label>
                          <Input
                            type="number"
                            className="h-7 text-xs w-14"
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.bathrooms || 1}
                            onChange={(e) =>
                              updateRoomTypeField(selectedRoomType, "bathrooms", parseInt(e.target.value) || 0)
                            }
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                            Max
                            {isRoomFieldPmsSynced(selectedRoomType, 'maxPeople') && <Cloud className="h-2.5 w-2.5 text-primary" />}
                          </Label>
                          <Input
                            type="number"
                            className={cn("h-7 text-xs w-14", getRoomPmsFieldClass(selectedRoomType, 'maxPeople'))}
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.maxPeople || 2}
                            onChange={(e) =>
                              updateRoomTypeField(selectedRoomType, "maxPeople", parseInt(e.target.value) || 1)
                            }
                            disabled={isRoomFieldPmsSynced(selectedRoomType, 'maxPeople')}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                            Adults
                            {isRoomFieldPmsSynced(selectedRoomType, 'maxAdults') && <Cloud className="h-2.5 w-2.5 text-primary" />}
                          </Label>
                          <Input
                            type="number"
                            className={cn("h-7 text-xs w-14", getRoomPmsFieldClass(selectedRoomType, 'maxAdults'))}
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.maxAdults || 2}
                            onChange={(e) =>
                              updateRoomTypeField(selectedRoomType, "maxAdults", parseInt(e.target.value) || 1)
                            }
                            disabled={isRoomFieldPmsSynced(selectedRoomType, 'maxAdults')}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                            Children
                            {isRoomFieldPmsSynced(selectedRoomType, 'maxChildren') && <Cloud className="h-2.5 w-2.5 text-primary" />}
                          </Label>
                          <Input
                            type="number"
                            className={cn("h-7 text-xs w-14", getRoomPmsFieldClass(selectedRoomType, 'maxChildren'))}
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.maxChildren || 0}
                            onChange={(e) =>
                              updateRoomTypeField(selectedRoomType, "maxChildren", parseInt(e.target.value) || 0)
                            }
                            disabled={isRoomFieldPmsSynced(selectedRoomType, 'maxChildren')}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                            Min
                            {isRoomFieldPmsSynced(selectedRoomType, 'minGuests') && <Cloud className="h-2.5 w-2.5 text-primary" />}
                          </Label>
                          <Input
                            type="number"
                            className={cn("h-7 text-xs w-14", getRoomPmsFieldClass(selectedRoomType, 'minGuests'))}
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.minGuests || 1}
                            onChange={(e) =>
                              updateRoomTypeField(selectedRoomType, "minGuests", parseInt(e.target.value) || 1)
                            }
                            disabled={isRoomFieldPmsSynced(selectedRoomType, 'minGuests')}
                          />
                        </div>
                      </div>

                      {/* Guest Policies - Compact Row */}
                      <div className="grid grid-cols-3 gap-2">
                        {/* Teens */}
                        <div className="border rounded-md p-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium flex items-center gap-1">
                              Teens
                              {isRoomFieldPmsSynced(selectedRoomType, 'allowTeens') && <Cloud className="h-2.5 w-2.5 text-primary" />}
                            </Label>
                            <Switch
                              className="scale-75"
                              checked={roomTypes.find((r) => r.id === selectedRoomType)?.allowTeens || false}
                              onCheckedChange={(checked) => updateRoomTypeField(selectedRoomType, "allowTeens", checked)}
                              disabled={isRoomFieldPmsSynced(selectedRoomType, 'allowTeens')}
                            />
                          </div>
                          {roomTypes.find((r) => r.id === selectedRoomType)?.allowTeens && (
                            <div className="flex gap-2">
                              <div className="flex items-center gap-1 flex-1">
                                <Label className="text-[10px] text-muted-foreground">Min</Label>
                                <Input
                                  type="number"
                                  className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, 'teenMinAge'))}
                                  value={roomTypes.find((r) => r.id === selectedRoomType)?.teenMinAge || 13}
                                  onChange={(e) => updateRoomTypeField(selectedRoomType, "teenMinAge", parseInt(e.target.value) || 13)}
                                  disabled={isRoomFieldPmsSynced(selectedRoomType, 'teenMinAge')}
                                />
                              </div>
                              <div className="flex items-center gap-1 flex-1">
                                <Label className="text-[10px] text-muted-foreground">Max</Label>
                                <Input
                                  type="number"
                                  className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, 'teenMaxAge'))}
                                  value={roomTypes.find((r) => r.id === selectedRoomType)?.teenMaxAge || 17}
                                  onChange={(e) => updateRoomTypeField(selectedRoomType, "teenMaxAge", parseInt(e.target.value) || 17)}
                                  disabled={isRoomFieldPmsSynced(selectedRoomType, 'teenMaxAge')}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Children */}
                        <div className="border rounded-md p-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium flex items-center gap-1">
                              Children
                              {isRoomFieldPmsSynced(selectedRoomType, 'allowChildren') && <Cloud className="h-2.5 w-2.5 text-primary" />}
                            </Label>
                            <Switch
                              className="scale-75"
                              checked={roomTypes.find((r) => r.id === selectedRoomType)?.allowChildren || false}
                              onCheckedChange={(checked) => updateRoomTypeField(selectedRoomType, "allowChildren", checked)}
                              disabled={isRoomFieldPmsSynced(selectedRoomType, 'allowChildren')}
                            />
                          </div>
                          {roomTypes.find((r) => r.id === selectedRoomType)?.allowChildren && (
                            <div className="flex gap-2">
                              <div className="flex items-center gap-1 flex-1">
                                <Label className="text-[10px] text-muted-foreground">Min</Label>
                                <Input
                                  type="number"
                                  className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, 'childMinAge'))}
                                  value={roomTypes.find((r) => r.id === selectedRoomType)?.childMinAge || 2}
                                  onChange={(e) => updateRoomTypeField(selectedRoomType, "childMinAge", parseInt(e.target.value) || 2)}
                                  disabled={isRoomFieldPmsSynced(selectedRoomType, 'childMinAge')}
                                />
                              </div>
                              <div className="flex items-center gap-1 flex-1">
                                <Label className="text-[10px] text-muted-foreground">Max</Label>
                                <Input
                                  type="number"
                                  className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, 'childMaxAge'))}
                                  value={roomTypes.find((r) => r.id === selectedRoomType)?.childMaxAge || 12}
                                  onChange={(e) => updateRoomTypeField(selectedRoomType, "childMaxAge", parseInt(e.target.value) || 12)}
                                  disabled={isRoomFieldPmsSynced(selectedRoomType, 'childMaxAge')}
                                />
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Infants */}
                        <div className="border rounded-md p-2 space-y-1">
                          <div className="flex items-center justify-between">
                            <Label className="text-xs font-medium flex items-center gap-1">
                              Infants
                              {isRoomFieldPmsSynced(selectedRoomType, 'allowInfants') && <Cloud className="h-2.5 w-2.5 text-primary" />}
                            </Label>
                            <Switch
                              className="scale-75"
                              checked={roomTypes.find((r) => r.id === selectedRoomType)?.allowInfants || false}
                              onCheckedChange={(checked) => updateRoomTypeField(selectedRoomType, "allowInfants", checked)}
                              disabled={isRoomFieldPmsSynced(selectedRoomType, 'allowInfants')}
                            />
                          </div>
                          {roomTypes.find((r) => r.id === selectedRoomType)?.allowInfants && (
                            <div className="flex gap-2">
                              <div className="flex items-center gap-1 flex-1">
                                <Label className="text-[10px] text-muted-foreground">Min</Label>
                                <Input
                                  type="number"
                                  className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, 'infantMinAge'))}
                                  value={roomTypes.find((r) => r.id === selectedRoomType)?.infantMinAge || 0}
                                  onChange={(e) => updateRoomTypeField(selectedRoomType, "infantMinAge", parseInt(e.target.value) || 0)}
                                  disabled={isRoomFieldPmsSynced(selectedRoomType, 'infantMinAge')}
                                />
                              </div>
                              <div className="flex items-center gap-1 flex-1">
                                <Label className="text-[10px] text-muted-foreground">Max</Label>
                                <Input
                                  type="number"
                                  className={cn("h-6 text-xs", getRoomPmsFieldClass(selectedRoomType, 'infantMaxAge'))}
                                  value={roomTypes.find((r) => r.id === selectedRoomType)?.infantMaxAge || 2}
                                  onChange={(e) => updateRoomTypeField(selectedRoomType, "infantMaxAge", parseInt(e.target.value) || 2)}
                                  disabled={isRoomFieldPmsSynced(selectedRoomType, 'infantMaxAge')}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Additional PMS Fields - Inline */}
                      <div className="grid grid-cols-4 gap-2 items-end">
                        <div className="flex items-center gap-1">
                          <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                            Age Cat
                            {isRoomFieldPmsSynced(selectedRoomType, 'minAgeCategory') && <Cloud className="h-2.5 w-2.5 text-primary" />}
                          </Label>
                          <Select
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.minAgeCategory || ""}
                            onValueChange={(value) => updateRoomTypeField(selectedRoomType, "minAgeCategory", value)}
                            disabled={isRoomFieldPmsSynced(selectedRoomType, 'minAgeCategory')}
                          >
                            <SelectTrigger className={cn("h-7 text-xs", getRoomPmsFieldClass(selectedRoomType, 'minAgeCategory'))}>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="ADULT">Adult</SelectItem>
                              <SelectItem value="TEEN">Teen</SelectItem>
                              <SelectItem value="CHILD">Child</SelectItem>
                              <SelectItem value="INFANT">Infant</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs whitespace-nowrap flex items-center gap-0.5">
                            Min Adults
                            {isRoomFieldPmsSynced(selectedRoomType, 'minAdultsToOfferNonAdultRates') && <Cloud className="h-2.5 w-2.5 text-primary" />}
                          </Label>
                          <Input
                            type="number"
                            min="0"
                            className={cn("h-7 text-xs w-14", getRoomPmsFieldClass(selectedRoomType, 'minAdultsToOfferNonAdultRates'))}
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.minAdultsToOfferNonAdultRates || 0}
                            onChange={(e) =>
                              updateRoomTypeField(selectedRoomType, "minAdultsToOfferNonAdultRates", parseInt(e.target.value) || 0)
                            }
                            disabled={isRoomFieldPmsSynced(selectedRoomType, 'minAdultsToOfferNonAdultRates')}
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs whitespace-nowrap">Min Stay</Label>
                          <Input
                            type="number"
                            className="h-7 text-xs w-14"
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.minStay || 1}
                            onChange={(e) =>
                              updateRoomTypeField(selectedRoomType, "minStay", parseInt(e.target.value) || 1)
                            }
                          />
                        </div>
                        <div className="flex items-center gap-1">
                          <Label className="text-xs whitespace-nowrap">Max Stay</Label>
                          <Input
                            type="number"
                            className="h-7 text-xs w-14"
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.maxStay || 0}
                            onChange={(e) =>
                              updateRoomTypeField(selectedRoomType, "maxStay", parseInt(e.target.value) || 0)
                            }
                          />
                        </div>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-md p-2">
                        <p className="text-xs text-blue-700">
                          <strong>INFO:</strong> Align "Max adult" with rate type if Person Rate is applied.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-semibold">Rate Info</h3>
                        {(() => {
                          const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
                          const linkedRateTypeIds = currentRoom?.linkedRateTypes || currentRoom?.availableRateTypes || [];
                          const linkedRateTypesData = pmsRateTypes.filter(rt => linkedRateTypeIds.includes(rt.id));
                          
                          if (linkedRateTypesData.length > 0) {
                            // Get unique price types from linked rate types
                            const priceTypes = [...new Set(linkedRateTypesData.map(rt => rt.priceType).filter(Boolean))];
                            return (
                              <div className="space-y-2">
                                <Label className="flex items-center gap-2">
                                  Price Type (from linked Rate Types)
                                  <Badge variant="outline" className="text-xs bg-primary/10"><Cloud className="h-3 w-3 mr-1" />PMS</Badge>
                                </Label>
                                <div className="flex flex-wrap gap-2">
                                  {priceTypes.length > 0 ? priceTypes.map((pt, idx) => (
                                    <Badge key={idx} variant="secondary">{pt}</Badge>
                                  )) : (
                                    <span className="text-sm text-muted-foreground">No price types defined in linked rate types</span>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground">
                                  Price types are determined by the rate types linked to this room. Manage linked rate types in the "Rate Types" tab.
                                </p>
                              </div>
                            );
                          }
                          
                          // Fallback for rooms without linked rate types
                          return (
                            <div className="space-y-2">
                              <Label>Rate Type (Manual)</Label>
                              <Select
                                value={currentRoom?.rateType || "per-unit"}
                                onValueChange={(value) => updateRoomTypeField(selectedRoomType, "rateType", value)}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="per-unit">Per Unit</SelectItem>
                                  <SelectItem value="per-person">Per Person</SelectItem>
                                </SelectContent>
                              </Select>
                              <p className="text-xs text-muted-foreground">
                                Link rate types in the "Rate Types" tab to use PMS price types instead.
                              </p>
                            </div>
                          );
                        })()}
                        <div className="space-y-2">
                          <Label>Meal Types (for this room)</Label>
                          <TagInput
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.mealTypes || []}
                            onChange={(newMealTypes) => {
                              updateRoomTypeField(selectedRoomType, "mealTypes", newMealTypes);
                            }}
                            suggestions={mealTypeSuggestions}
                            placeholder="Type meal type and press Enter..."
                            onNewTag={handleNewMealType}
                          />
                          <p className="text-xs text-muted-foreground">
                            Meal types are manual entry. Add meal types specific to this room (e.g., Self Catering, Bed & Breakfast, Full Board).
                          </p>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Rate Types Sub-tab */}
                    <TabsContent value="rate-types" className="p-3 space-y-2">
                      {(() => {
                        const currentRoom = roomTypes.find(r => r.id === selectedRoomType);
                        const availableRateTypeIds = currentRoom?.availableRateTypes || currentRoom?.linkedRateTypes || [];
                        const availableRateTypesForRoom = pmsRateTypes.filter(rt => availableRateTypeIds.includes(rt.id));
                        
                        return (
                          <>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-medium">Link Rate Types to {currentRoom?.name}</span>
                                {availableRateTypesForRoom.length > 0 && (
                                  <Badge variant="outline" className="text-[10px] h-4">{availableRateTypesForRoom.length} available</Badge>
                                )}
                              </div>
                              <Badge variant="secondary" className="text-[10px] h-4">
                                {getRoomLinkedRateTypes(selectedRoomType).length} linked
                              </Badge>
                            </div>

                            {availableRateTypesForRoom.length === 0 ? (
                              <div className="border rounded-md p-4 text-center text-muted-foreground">
                                <DollarSign className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p className="text-xs">No rate types available. Sync with PMS to load.</p>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {availableRateTypesForRoom.map((rateType) => {
                                  const isLinked = getRoomLinkedRateTypes(selectedRoomType).includes(rateType.id);
                                  return (
                                    <RateTypeItem
                                      key={rateType.id}
                                      rateType={rateType}
                                      isLinked={isLinked}
                                      onToggleLink={() => toggleRoomRateTypeLink(selectedRoomType, rateType.id)}
                                    />
                                  );
                                })}
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Facilities Sub-tab */}
                    <TabsContent value="facilities" className="p-6 space-y-4">
                      <div className="bg-amber-50 border border-amber-200 rounded-md p-2 mb-4">
                        <p className="text-sm text-amber-700">
                          <strong>Manual Entry:</strong> Facilities are not available from the PMS API. Select the facilities available in this room type.
                        </p>
                      </div>

                      <div className="grid grid-cols-6 gap-6">
                        {/* Cooking */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Cooking</h4>
                          {[
                            "Braai/Barbeque Facilities",
                            "Cleaning Service",
                            "Coffee/tea facilities",
                            "DSTV/Satellite TV",
                            "Desk",
                            "Dining Table",
                            "Ironing board",
                            "Microwave",
                            "Non-smoking",
                            "Outdoor Furniture",
                            "Outdoor dining area",
                            "Oven",
                            "Patio",
                            "Refrigerator",
                            "Sitting area",
                            "Toaster",
                            "Two Plate Stove",
                            "Wake up call",
                          ].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox
                                id={`facility-${item}`}
                                checked={ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities).includes(
                                  item,
                                )}
                                onCheckedChange={(checked) => {
                                  const currentFacilities =
                                    ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities);
                                  const newFacilities = checked
                                    ? [...currentFacilities, item]
                                    : currentFacilities.filter((f: string) => f !== item);
                                  updateRoomTypeField(selectedRoomType, "facilities", newFacilities);
                                }}
                              />
                              <Label htmlFor={`facility-${item}`} className="text-sm cursor-pointer flex-1">
                                {item}
                              </Label>
                            </div>
                          ))}
                        </div>

                        {/* General */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">General</h4>
                          {["Kitchenette", "Hairdryer", "Shower and bath", "Telephone"].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox
                                id={`facility-${item}`}
                                checked={ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities).includes(
                                  item,
                                )}
                                onCheckedChange={(checked) => {
                                  const currentFacilities =
                                    ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities);
                                  const newFacilities = checked
                                    ? [...currentFacilities, item]
                                    : currentFacilities.filter((f: string) => f !== item);
                                  updateRoomTypeField(selectedRoomType, "facilities", newFacilities);
                                }}
                              />
                              <Label htmlFor={`facility-${item}`} className="text-sm cursor-pointer flex-1">
                                {item}
                              </Label>
                            </div>
                          ))}
                        </div>

                        {/* Laundry */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Laundry</h4>
                          {["Airconditioned room", "Iron", "Washing machine"].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox
                                id={`facility-${item}`}
                                checked={ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities).includes(
                                  item,
                                )}
                                onCheckedChange={(checked) => {
                                  const currentFacilities =
                                    ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities);
                                  const newFacilities = checked
                                    ? [...currentFacilities, item]
                                    : currentFacilities.filter((f: string) => f !== item);
                                  updateRoomTypeField(selectedRoomType, "facilities", newFacilities);
                                }}
                              />
                              <Label htmlFor={`facility-${item}`} className="text-sm cursor-pointer flex-1">
                                {item}
                              </Label>
                            </div>
                          ))}
                        </div>

                        {/* Media */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Media</h4>
                          {["Flat screen TV"].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox
                                id={`facility-${item}`}
                                checked={ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities).includes(
                                  item,
                                )}
                                onCheckedChange={(checked) => {
                                  const currentFacilities =
                                    ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities);
                                  const newFacilities = checked
                                    ? [...currentFacilities, item]
                                    : currentFacilities.filter((f: string) => f !== item);
                                  updateRoomTypeField(selectedRoomType, "facilities", newFacilities);
                                }}
                              />
                              <Label htmlFor={`facility-${item}`} className="text-sm cursor-pointer flex-1">
                                {item}
                              </Label>
                            </div>
                          ))}
                        </div>

                        {/* Security */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Security</h4>
                          {["Safe"].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox
                                id={`facility-${item}`}
                                checked={ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities).includes(
                                  item,
                                )}
                                onCheckedChange={(checked) => {
                                  const currentFacilities =
                                    ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities);
                                  const newFacilities = checked
                                    ? [...currentFacilities, item]
                                    : currentFacilities.filter((f: string) => f !== item);
                                  updateRoomTypeField(selectedRoomType, "facilities", newFacilities);
                                }}
                              />
                              <Label htmlFor={`facility-${item}`} className="text-sm cursor-pointer flex-1">
                                {item}
                              </Label>
                            </div>
                          ))}
                        </div>

                        {/* View */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">View</h4>
                          {["Garden view", "Landmark view", "Mountain view", "Pool view", "Terrace"].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox
                                id={`facility-${item}`}
                                checked={ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities).includes(
                                  item,
                                )}
                                onCheckedChange={(checked) => {
                                  const currentFacilities =
                                    ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.facilities);
                                  const newFacilities = checked
                                    ? [...currentFacilities, item]
                                    : currentFacilities.filter((f: string) => f !== item);
                                  updateRoomTypeField(selectedRoomType, "facilities", newFacilities);
                                }}
                              />
                              <Label htmlFor={`facility-${item}`} className="text-sm cursor-pointer flex-1">
                                {item}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    {/* Amenities Sub-tab */}
                    <TabsContent value="amenities" className="p-6 space-y-4">
                      <div className="bg-amber-50 border border-amber-200 rounded-md p-2 mb-4">
                        <p className="text-sm text-amber-700">
                          <strong>Manual Entry:</strong> Amenities are not available from the PMS API. Select the amenities available in this room type.
                        </p>
                      </div>

                      <div className="grid grid-cols-3 gap-6">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Bathroom</h4>
                          {["Bathroom amenities", "Hand wash", "Towels", "Bathrobe", "Slippers", "Toiletries"].map(
                            (item) => (
                              <div key={item} className="flex items-center gap-2">
                                <Checkbox
                                  id={`amenity-${item}`}
                                  checked={ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.amenities).includes(
                                    item,
                                  )}
                                  onCheckedChange={(checked) => {
                                    const currentAmenities =
                                      ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.amenities);
                                    const newAmenities = checked
                                      ? [...currentAmenities, item]
                                      : currentAmenities.filter((a: string) => a !== item);
                                    updateRoomTypeField(selectedRoomType, "amenities", newAmenities);
                                  }}
                                />
                                <Label htmlFor={`amenity-${item}`} className="text-sm cursor-pointer flex-1">
                                  {item}
                                </Label>
                              </div>
                            ),
                          )}
                        </div>
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Bedroom</h4>
                          {["Extra pillows", "Extra blankets", "Linen", "Blackout curtains", "Reading lamp"].map(
                            (item) => (
                              <div key={item} className="flex items-center gap-2">
                                <Checkbox
                                  id={`amenity-${item}`}
                                  checked={ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.amenities).includes(
                                    item,
                                  )}
                                  onCheckedChange={(checked) => {
                                    const currentAmenities =
                                      ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.amenities);
                                    const newAmenities = checked
                                      ? [...currentAmenities, item]
                                      : currentAmenities.filter((a: string) => a !== item);
                                    updateRoomTypeField(selectedRoomType, "amenities", newAmenities);
                                  }}
                                />
                                <Label htmlFor={`amenity-${item}`} className="text-sm cursor-pointer flex-1">
                                  {item}
                                </Label>
                              </div>
                            ),
                          )}
                        </div>
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Extras</h4>
                          {["Welcome pack", "Mini bar", "Bottled water", "Fruit basket", "Snacks"].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox
                                id={`amenity-${item}`}
                                checked={ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.amenities).includes(
                                  item,
                                )}
                                onCheckedChange={(checked) => {
                                  const currentAmenities =
                                    ensureArray(roomTypes.find((r) => r.id === selectedRoomType)?.amenities);
                                  const newAmenities = checked
                                    ? [...currentAmenities, item]
                                    : currentAmenities.filter((a: string) => a !== item);
                                  updateRoomTypeField(selectedRoomType, "amenities", newAmenities);
                                }}
                              />
                              <Label htmlFor={`amenity-${item}`} className="text-sm cursor-pointer flex-1">
                                {item}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    {/* Room Images Sub-tab */}
                    <TabsContent value="room-images" className="p-6 space-y-4">
                      <h3 className="font-semibold text-lg mb-4">ROOM TYPE IMAGES</h3>
                      <div className="grid grid-cols-6 gap-4">
                        {/* Upload slot */}
                        <div
                          className="aspect-video border-2 border-dashed border-primary/50 rounded-lg flex flex-col items-center justify-center bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
                          onClick={() => document.getElementById("room-image-upload")?.click()}
                        >
                          {isRoomImageUploading ? (
                            <RefreshCw className="h-8 w-8 text-primary mb-2 animate-spin" />
                          ) : (
                            <Upload className="h-8 w-8 text-primary mb-2" />
                          )}
                          <p className="text-xs text-center text-muted-foreground px-2">
                            {isRoomImageUploading ? "Uploading..." : "Click or Drag and drop image to upload"}
                          </p>
                          <input
                            id="room-image-upload"
                            type="file"
                            accept="image/*"
                            multiple
                            className="hidden"
                            onChange={(e) => handleRoomImageUpload(e.target.files)}
                          />
                        </div>

                        {/* Uploaded room images */}
                        {(roomTypes.find((r) => r.id === selectedRoomType)?.images || []).map(
                          (imageUrl: string, index: number) => (
                            <div
                              key={index}
                              className="relative aspect-video rounded-lg overflow-hidden border border-border group"
                            >
                              <img src={imageUrl} alt={`Room ${index + 1}`} className="w-full h-full object-cover" />
                              <button
                                type="button"
                                onClick={() => removeRoomImage(imageUrl)}
                                className="absolute top-2 right-2 bg-muted-foreground/80 hover:bg-destructive rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <X className="h-4 w-4 text-white" />
                              </button>
                            </div>
                          ),
                        )}

                        {/* Placeholder empty slots */}
                        {Array.from({
                          length: Math.max(
                            0,
                            11 - (roomTypes.find((r) => r.id === selectedRoomType)?.images?.length || 0),
                          ),
                        }).map((_, i) => (
                          <div
                            key={`empty-${i}`}
                            className="aspect-video border-2 border-dashed border-border rounded-lg bg-muted/20"
                          ></div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* Agreement Sub-tab */}
                    <TabsContent value="agreement" className="p-6 space-y-4">
                      <div className="space-y-2">
                        <Label>Split %</Label>
                        <Input
                          type="number"
                          value={roomTypes.find((r) => r.id === selectedRoomType)?.splitPercent || 0}
                          onChange={(e) =>
                            updateRoomTypeField(selectedRoomType, "splitPercent", parseFloat(e.target.value) || 0)
                          }
                          className="max-w-xs"
                        />
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                        <p className="text-sm text-blue-700">
                          Inputting a value here will override the split % specified in House Style for this room.
                        </p>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </TabsContent>

            {/* Packages Tab */}
            <TabsContent value="packages" className="space-y-2">
              <Tabs value={packagesCategory} onValueChange={(v) => setPackagesCategory(v as any)} className="w-full">
                <TabsList className="h-7">
                  <TabsTrigger value="accommodations" className="text-xs h-6">Accommodations</TabsTrigger>
                  {isEvent && <TabsTrigger value="event" className="text-xs h-6">Event/Wedding</TabsTrigger>}
                  {isConference && <TabsTrigger value="conference" className="text-xs h-6">Conference</TabsTrigger>}
                </TabsList>

                {["accommodations", "event", "conference"].map((cat) => (
                  <TabsContent key={cat} value={cat} className="mt-2">
                    <div className="grid grid-cols-[180px_1fr] gap-3">
                      <Card>
                        <CardHeader className="py-1.5 px-3 flex flex-row items-center justify-between">
                          <CardTitle className="text-xs font-medium uppercase">{cat}</CardTitle>
                          <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setIsEditPackageOpen(true)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                        </CardHeader>
                        <CardContent className="py-1 px-3 space-y-0.5">
                          {packages.filter((p) => p.category === cat).length === 0 ? (
                            <p className="text-xs text-muted-foreground">No items...</p>
                          ) : (
                            packages.filter((p) => p.category === cat).map((pkg) => (
                              <div
                                key={pkg.id}
                                className={cn("py-1 px-1.5 rounded cursor-pointer hover:bg-accent flex items-center justify-between text-xs", selectedPackage?.id === pkg.id && "bg-accent")}
                                onClick={() => setSelectedPackage(pkg)}
                              >
                                <span className="truncate">{pkg.name}</span>
                                <Button size="sm" variant="ghost" className="h-4 w-4 p-0" onClick={(e) => { e.stopPropagation(); deletePackage(pkg.id); }}>
                                  <Trash2 className="h-2.5 w-2.5" />
                                </Button>
                              </div>
                            ))
                          )}
                        </CardContent>
                      </Card>

                      <div className="flex gap-1.5">
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setIsEditPackageOpen(true)}>
                          Edit Package
                        </Button>
                        <Button size="sm" variant="destructive" className="h-7 text-xs" onClick={() => setIsPackageImagesOpen(true)}>
                          Package Images
                        </Button>
                      </div>
                    </div>
                  </TabsContent>
                ))}
              </Tabs>
            </TabsContent>

            {/* Announcements Tab */}
            <TabsContent value="announcements" className="space-y-2">
              <Card>
                <CardHeader className="py-2 px-4 flex flex-row items-center justify-between">
                  <CardTitle className="text-sm">Announcements</CardTitle>
                  <Button size="sm" className="h-7 text-xs gap-1" onClick={() => setIsManageAnnouncementOpen(true)}>
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
                                <Switch checked={announcement.enabled} onCheckedChange={() => toggleAnnouncementEnabled(announcement.id)} className="scale-75" />
                              </td>
                              <td className="py-1 px-2 text-xs truncate max-w-[200px]">{announcement.announcement}</td>
                              <td className="py-1 px-2 text-xs">{announcement.startDate ? format(announcement.startDate, "MM/dd/yy") : "-"}</td>
                              <td className="py-1 px-2 text-xs">{announcement.endDate ? format(announcement.endDate, "MM/dd/yy") : "-"}</td>
                              <td className="py-1 px-2 text-xs">{announcement.order}</td>
                              <td className="py-1 px-2">
                                <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => deleteAnnouncement(announcement.id)}>
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
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Manage Announcements Dialog */}
      <Dialog open={isManageAnnouncementOpen} onOpenChange={setIsManageAnnouncementOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Manage Announcements</DialogTitle>
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
              <Button onClick={addAnnouncement} className="bg-primary">
                Create
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
              <DialogTitle>Edit Package</DialogTitle>
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
                <SelectTrigger>
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
                    {roomTypes.map((room) => (
                      <tr key={room.id} className="border-b">
                        <td className="p-2 text-sm">
                          <div className="flex items-center gap-2">
                            <Checkbox />
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
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setIsEditPackageOpen(false)}>
                Cancel
              </Button>
              <Button onClick={addNewPackage}>Create Package</Button>
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
    </>
  );
}
