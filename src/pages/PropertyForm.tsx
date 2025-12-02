import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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

const propertySchema = z.object({
  name: z.string().min(1, "Property name is required").max(200),
  property_type: z.string().min(1, "Property type is required"),
  contact_email: z.string().email("Invalid email address"),
  telephone: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  owner_name: z.string().optional(),
  owner_email: z.string().email("Invalid email address").optional().or(z.literal("")),
  country: z.string().min(1, "Country is required"),
  city: z.string().min(1, "City is required"),
  address: z.string().min(1, "Street name is required"),
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

type PropertyFormData = z.infer<typeof propertySchema>;

export default function PropertyForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [owners, setOwners] = useState<any[]>([]);
  const [isDirty, setIsDirty] = useState(false);

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
  useEffect(() => {
    const loadOwners = async () => {
      // Get user IDs that have the 'user' role (property owners)
      const { data: ownerRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("role", "user");

      if (ownerRoles && ownerRoles.length > 0) {
        const ownerIds = ownerRoles.map((r) => r.user_id);
        const { data: profiles } = await supabase
          .from("profiles")
          .select("*")
          .in("id", ownerIds)
          .order("full_name");

        if (profiles) {
          setOwners(profiles);
        }
      } else {
        setOwners([]);
      }
    };
    loadOwners();
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

  // Sync room/rate types from PMS (Benson)
  const syncFromBenson = async () => {
    if (!bensonPropertyCode || !id) {
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
          action: "fetch_types",
          property_id: id,
        },
      });

      if (error) throw error;

      if (data?.error) {
        throw new Error(data.error);
      }

      // Update room types from PMS
      if (data?.roomTypes && Array.isArray(data.roomTypes)) {
        const pmsRoomTypes = data.roomTypes.map((rt: any) => ({
          id: rt.id?.toString() || Date.now().toString(),
          name: rt.name || `Room Type ${rt.id}`,
          url: "",
          selected: false,
          pms_id: rt.id,
          pms_synced: true,
        }));
        
        // Merge with existing room types (don't overwrite local changes)
        const existingNames = new Set(roomTypes.map(r => r.name.toLowerCase()));
        const newRoomTypes = pmsRoomTypes.filter((rt: any) => !existingNames.has(rt.name.toLowerCase()));
        
        if (newRoomTypes.length > 0) {
          setRoomTypes([...roomTypes, ...newRoomTypes]);
          setIsDirty(true);
        }

        toast({
          title: "Room Types Synced",
          description: `Found ${data.roomTypes.length} room types from Benson. ${newRoomTypes.length} new types added.`,
        });
      }

      // Store rate types info for rate breakdown
      if (data?.rateTypes && Array.isArray(data.rateTypes)) {
        toast({
          title: "Rate Types Found",
          description: `Found ${data.rateTypes.length} rate types from Benson.`,
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

  // Load available PMS systems from configured API keys
  useEffect(() => {
    const loadPMSSystems = async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("key_name, name, system_type")
        .not("system_type", "eq", "google")
        .order("name");

      if (data) {
        setAvailablePMSSystems(data);
      }
    };
    loadPMSSystems();
  }, []);

  // Location state
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

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
      bedConfiguration: "king-twin",
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
      bedConfiguration: "king-twin",
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
    };
    setRoomTypes([...roomTypes, newRoom]);
    setSelectedRoomType(newRoom.id);
    setIsDirty(true);
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

        const { data: { publicUrl } } = supabase.storage.from("property-images").getPublicUrl(filePath);

        existingImages.push(publicUrl);
      } catch (error) {
        toast({
          title: "Upload failed",
          description: "Failed to upload room image",
          variant: "destructive",
        });
      }
    }

    setRoomTypes(roomTypes.map((r) => 
      r.id === selectedRoomType ? { ...r, images: existingImages } : r
    ));
    setIsDirty(true);
    setIsRoomImageUploading(false);
  };

  const removeRoomImage = (imageUrl: string) => {
    const currentRoom = roomTypes.find((r) => r.id === selectedRoomType);
    const updatedImages = (currentRoom?.images || []).filter((img: string) => img !== imageUrl);
    setRoomTypes(roomTypes.map((r) => 
      r.id === selectedRoomType ? { ...r, images: updatedImages } : r
    ));
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
  const [seasons, setSeasons] = useState<any[]>([
    { id: "1", title: "08/05/2025-30/09/2025", from: "2025-05-08", to: "2025-09-30", minStay: 5, maxStay: 0 },
    { id: "2", title: "01/10/2025-30/09/2026", from: "2025-10-01", to: "2026-09-30", minStay: 5, maxStay: 0 },
    { id: "3", title: "01/10/2026-30/09/2027", from: "2026-10-01", to: "2027-09-30", minStay: 5, maxStay: 0 },
  ]);

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

  // Templates and Notifications state
  const [selectedTemplate, setSelectedTemplate] = useState<string>("confirmation-mailer");
  const [templateContent, setTemplateContent] = useState<string>("");
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

  // Load property data if editing
  useEffect(() => {
    const loadProperty = async () => {
      if (!id) {
        setIsEditMode(false);
        return;
      }

      setIsEditMode(true);
      setLoading(true);

      try {
        const { data, error } = await supabase.from("properties").select("*").eq("id", id).single();

        if (error) throw error;

        if (data) {
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

          // Set location coordinates
          setLatitude(data.latitude ? Number(data.latitude) : null);
          setLongitude(data.longitude ? Number(data.longitude) : null);

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
          if (amenities?.facilities) setSelectedFacilities(amenities.facilities);
          if (amenities?.cancellation_policies) setCancellationPolicies(amenities.cancellation_policies);
          if (amenities?.seasons) setSeasons(amenities.seasons);
          if (amenities?.addons) setAddons(amenities.addons);
          if (amenities?.packages) setPackages(amenities.packages);
          if (amenities?.announcements) setAnnouncements(amenities.announcements);

          // Load house style
          const houseStyle = amenities?.house_style || {};
          if (houseStyle.company_logo) setCompanyLogo(houseStyle.company_logo);
          if (houseStyle.litchi_bookings_link || houseStyle.roomsonline_bookings_link) setRoomsOnlineBookingsLink(houseStyle.roomsonline_bookings_link || houseStyle.litchi_bookings_link);
          if (houseStyle.title_behaviour) setTitleBehaviour(houseStyle.title_behaviour);
          if (houseStyle.merchant_details) setMerchantDetails(houseStyle.merchant_details);
          if (houseStyle.adpay_details) setAdpayDetails(houseStyle.adpay_details);
          if (houseStyle.motar_api) setMotarApi(houseStyle.motar_api);
          if (houseStyle.website_colors) setWebsiteColors(houseStyle.website_colors);

          // Load templates
          const templates = amenities?.templates || {};
          if (templates.selected_template) setSelectedTemplate(templates.selected_template);
          if (templates.template_content) setTemplateContent(templates.template_content);
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
  }, [id]);

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
      // Validate form data
      propertySchema.parse(formData);

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
        benson_property_code: selectedPMS === "benson" ? bensonPropertyCode : null,
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
          external_ids: {
            nightsbridge_bb_id: selectedPMS === "nightsbridge" ? formData.bb_id : null,
            semper_venue_id: selectedPMS === "semper" ? formData.venue_id : null,
            semper_channel_id: selectedPMS === "semper" ? formData.channel_id : null,
            semper_account_id: selectedPMS === "semper" ? formData.account_id : null,
            semper_agent_id: selectedPMS === "semper" ? formData.agent_id : null,
            siteminder_id: selectedPMS === "siteminder" ? formData.bb_id : null,
            checkfront_id: selectedPMS === "checkfront" ? formData.bb_id : null,
            benson_id: selectedPMS === "benson" ? formData.bb_id : null,
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
        ? await supabase.from("properties").update(propertyData).eq("id", id)
        : await supabase.from("properties").insert([propertyData]);

      if (error) throw error;

      toast({
        title: "Success",
        description: isEditMode ? "Property updated successfully" : "Property created successfully",
      });

      setIsDirty(false);
      // Stay on current page after save - don't navigate away
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
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-7xl mx-auto">
          {/* Breadcrumb Navigation */}
          <div className="flex items-center gap-2 text-sm mb-6 text-muted-foreground">
            <button
              onClick={() => navigate("/")}
              className="hover:text-foreground transition-colors flex items-center gap-1"
            >
              <Home className="h-4 w-4" />
              Home
            </button>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground font-medium">
              {isEditMode ? formData.name || "Edit Property" : "Add New Property"}
            </span>
            <ChevronRight className="h-4 w-4" />
            <span className="text-foreground">
              {activeTab === "general" && "General"}
              {activeTab === "house-style" && "House Style"}
              {activeTab === "info-facilities" && "Property info and Facilities"}
              {activeTab === "house-rules" && "House Rules"}
              {activeTab === "images" && "Property Images"}
              {activeTab === "rooms" && "Room Information"}
              {activeTab === "rates" && "Rate Breakdown"}
              {activeTab === "templates" && "Templates and Notifications"}
              {activeTab === "addons" && "Addons"}
              {activeTab === "specials" && "Specials"}
              {activeTab === "packages" && "Packages"}
              {activeTab === "announcements" && "Announcements"} <span className="text-primary">(Active)</span>
            </span>
          </div>

          {/* Property Name Display */}
          {isEditMode && formData.name && (
            <div className="mb-6 flex justify-end">
              <div className="inline-flex items-center gap-3 px-6 py-3 border-2 border-primary rounded-full bg-background">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="font-semibold text-lg">{formData.name}</span>
              </div>
            </div>
          )}

          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">{isEditMode ? "Edit Property" : "Add New Property"}</h1>
              <p className="text-muted-foreground">Configure property details and settings</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => handleNavigate("/admin/property-overview")}>
                Cancel
              </Button>
              {isDirty && (
                <Button onClick={handleSubmit} disabled={loading}>
                  <Save className="mr-2 h-4 w-4" />
                  {loading ? "Saving..." : "Save Property"}
                </Button>
              )}
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="bg-secondary">
              <TabsTrigger value="general" className="gap-2">
                <Home className="h-4 w-4" />
                General
              </TabsTrigger>
              <TabsTrigger value="house-style" className="gap-2">
                <Building2 className="h-4 w-4" />
                House Style
              </TabsTrigger>
              <TabsTrigger value="info-facilities" className="gap-2">
                <Building2 className="h-4 w-4" />
                Property Info & Facilities
              </TabsTrigger>
              <TabsTrigger value="house-rules" className="gap-2">
                <FileText className="h-4 w-4" />
                House Rules
              </TabsTrigger>
              <TabsTrigger value="images" className="gap-2">
                <Image className="h-4 w-4" />
                Property Images
              </TabsTrigger>
              <TabsTrigger value="rooms" className="gap-2">
                <Info className="h-4 w-4" />
                Room Information
              </TabsTrigger>
              <TabsTrigger value="rates" className="gap-2">
                <DollarSign className="h-4 w-4" />
                Rate Breakdown
              </TabsTrigger>
              <TabsTrigger value="templates" className="gap-2">
                <Bell className="h-4 w-4" />
                Templates and Notifications
              </TabsTrigger>
              <TabsTrigger value="addons" className="gap-2">
                <Package className="h-4 w-4" />
                Addons
              </TabsTrigger>
              <TabsTrigger value="specials" className="gap-2">
                <Calendar className="h-4 w-4" />
                Specials
              </TabsTrigger>
              <TabsTrigger value="packages" className="gap-2">
                <Package className="h-4 w-4" />
                Packages
              </TabsTrigger>
              <TabsTrigger value="announcements" className="gap-2">
                <Bell className="h-4 w-4" />
                Announcements
              </TabsTrigger>
            </TabsList>

            <TabsContent value="general">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Offerings Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>Offerings</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="accommodation"
                          checked={isAccommodation}
                          onCheckedChange={(checked) => {
                            setIsAccommodation(checked as boolean);
                            setIsDirty(true);
                          }}
                        />
                        <Label htmlFor="accommodation" className="cursor-pointer">
                          Accommodation
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="venues"
                          checked={isVenues}
                          onCheckedChange={(checked) => handleVenuesChange(checked as boolean)}
                        />
                        <Label htmlFor="venues" className="cursor-pointer">
                          Venues
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="event"
                          checked={isEvent}
                          onCheckedChange={(checked) => handleEventChange(checked as boolean)}
                        />
                        <Label htmlFor="event" className="cursor-pointer">
                          Event/Wedding
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="conference"
                          checked={isConference}
                          onCheckedChange={(checked) => handleConferenceChange(checked as boolean)}
                        />
                        <Label htmlFor="conference" className="cursor-pointer">
                          Conference
                        </Label>
                      </div>
                    </div>

                    <Separator className="my-6" />

                    <div className="space-y-4">
                      <div className="space-y-2 max-w-xs">
                        <Label htmlFor="pms_system">Property Management System</Label>
                        <Select
                          value={selectedPMS || "none"}
                          onValueChange={(value) => {
                            setSelectedPMS(value === "none" ? "" : value);
                            setIsDirty(true);
                          }}
                        >
                          <SelectTrigger id="pms_system">
                            <SelectValue placeholder="Select PMS system" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="flex items-center gap-2">
                                <X className="h-4 w-4" />
                                None
                              </span>
                            </SelectItem>
                            {availablePMSSystems.map((pms) => {
                              const IconComponent = getPMSIcon(pms.system_type);
                              return (
                                <SelectItem key={pms.system_type} value={pms.system_type}>
                                  <span className="flex items-center gap-2">
                                    <IconComponent className="h-4 w-4" />
                                    {pms.name.replace(" API Key", "")}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      </div>

                      {selectedPMS === "nightsbridge" && (
                        <div className="max-w-xs">
                          <Label htmlFor="bb_id">BBID</Label>
                          <Input
                            id="bb_id"
                            value={formData.bb_id}
                            onChange={(e) => handleInputChange("bb_id", e.target.value)}
                            placeholder="13402"
                          />
                        </div>
                      )}

                      {selectedPMS === "semper" && (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                          <div className="space-y-2">
                            <Label htmlFor="venue_id">VENUE ID</Label>
                            <Input
                              id="venue_id"
                              value={formData.venue_id}
                              onChange={(e) => handleInputChange("venue_id", e.target.value)}
                              placeholder="Enter venue ID"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="channel_id">CHANNEL ID</Label>
                            <Input
                              id="channel_id"
                              value={formData.channel_id}
                              onChange={(e) => handleInputChange("channel_id", e.target.value)}
                              placeholder="Enter channel ID"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="account_id">ACCOUNT ID</Label>
                            <Input
                              id="account_id"
                              value={formData.account_id}
                              onChange={(e) => handleInputChange("account_id", e.target.value)}
                              placeholder="Enter account ID"
                            />
                          </div>
                          <div className="space-y-2">
                            <Label htmlFor="agent_id">AGENT ID</Label>
                            <Input
                              id="agent_id"
                              value={formData.agent_id}
                              onChange={(e) => handleInputChange("agent_id", e.target.value)}
                              placeholder="Enter agent ID"
                            />
                          </div>
                        </div>
                      )}

                      {selectedPMS === "benson" && (
                        <div className="space-y-4">
                          <div className="max-w-xs">
                            <Label htmlFor="benson_property_code">Benson Property Code *</Label>
                            <Input
                              id="benson_property_code"
                              value={bensonPropertyCode}
                              onChange={(e) => {
                                setBensonPropertyCode(e.target.value);
                                setIsDirty(true);
                              }}
                              placeholder="Enter Benson property code"
                              required
                            />
                            <p className="text-sm text-muted-foreground mt-1">
                              Unique identifier assigned by Benson for this property
                            </p>
                          </div>
                          {bensonPropertyCode && (
                            <div className="flex items-center gap-4">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="gap-2"
                                onClick={syncFromBenson}
                                disabled={isSyncingPms}
                              >
                                {isSyncingPms ? (
                                  <RefreshCw className="h-4 w-4 animate-spin" />
                                ) : (
                                  <RefreshCw className="h-4 w-4" />
                                )}
                                {isSyncingPms ? "Syncing..." : "Sync Room & Rate Types from Benson"}
                              </Button>
                              {lastPmsSync && (
                                <span className="text-sm text-muted-foreground">
                                  Last synced: {lastPmsSync.toLocaleString()}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Property Section */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Property</span>
                      {selectedPMS && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 text-sm font-normal">
                                <div className="w-4 h-4 rounded bg-primary/10 border border-primary/30" />
                                <span className="text-muted-foreground">
                                  <Cloud className="inline h-3 w-3 mr-1" />
                                  {getPMSDisplayName(selectedPMS)} synced field
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
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Name *</Label>
                        <Input
                          id="name"
                          value={formData.name}
                          onChange={(e) => handleInputChange("name", e.target.value)}
                          placeholder="Property name"
                          required
                          className={cn(getPMSFieldClass("name", selectedPMS))}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="property_type">Property Type *</Label>
                        <Select
                          value={formData.property_type}
                          onValueChange={(value) => handleInputChange("property_type", value)}
                        >
                          <SelectTrigger id="property_type">
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
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
                      <div className="space-y-2">
                        <Label htmlFor="telephone">Telephone Number</Label>
                        <Input
                          id="telephone"
                          value={formData.telephone}
                          onChange={(e) => handleInputChange("telephone", e.target.value)}
                          placeholder="+27..."
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="contact_email">Contact Email Address *</Label>
                        <Input
                          id="contact_email"
                          type="email"
                          value={formData.contact_email}
                          onChange={(e) => handleInputChange("contact_email", e.target.value)}
                          placeholder="email@example.com"
                          required
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="currency">Currency *</Label>
                        <Select
                          value={formData.currency}
                          onValueChange={(value) => handleInputChange("currency", value)}
                        >
                          <SelectTrigger id="currency">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="ZAR">ZAR - South African Rand</SelectItem>
                            <SelectItem value="USD">USD - US Dollar</SelectItem>
                            <SelectItem value="EUR">EUR - Euro</SelectItem>
                            <SelectItem value="GBP">GBP - British Pound</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="owner_email">Select Owner</Label>
                        <Select
                          value={formData.owner_email}
                          onValueChange={(value) => {
                            const selectedOwner = owners.find((o) => o.email === value);
                            handleInputChange("owner_email", value);
                            handleInputChange("owner_name", selectedOwner?.full_name || "");
                          }}
                        >
                          <SelectTrigger id="owner_email">
                            <SelectValue placeholder="Select an owner" />
                          </SelectTrigger>
                          <SelectContent>
                            {owners.map((owner) => (
                              <SelectItem key={owner.id} value={owner.email}>
                                {owner.full_name || owner.email}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Address Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>Address</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label htmlFor="country">Country *</Label>
                          <Select
                            value={formData.country}
                            onValueChange={(value) => handleInputChange("country", value)}
                          >
                            <SelectTrigger id="country" className={cn(getPMSFieldClass("country", selectedPMS))}>
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
                        <div className="space-y-2">
                          <Label htmlFor="city">City *</Label>
                          <Input
                            id="city"
                            value={formData.city}
                            onChange={(e) => handleInputChange("city", e.target.value)}
                            placeholder="City name"
                            required
                            className={cn(getPMSFieldClass("city", selectedPMS))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="address">Street Name *</Label>
                          <Input
                            id="address"
                            value={formData.address}
                            onChange={(e) => handleInputChange("address", e.target.value)}
                            placeholder="Street address"
                            required
                            className={cn(getPMSFieldClass("address", selectedPMS))}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="suburb">Suburb</Label>
                          <Input
                            id="suburb"
                            value={formData.suburb}
                            onChange={(e) => handleInputChange("suburb", e.target.value)}
                            placeholder="Suburb"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="postal_code">Postal Code</Label>
                          <Input
                            id="postal_code"
                            value={formData.postal_code}
                            onChange={(e) => handleInputChange("postal_code", e.target.value)}
                            placeholder="Postal code"
                            className={cn(getPMSFieldClass("postal_code", selectedPMS))}
                          />
                        </div>
                      </div>

                      <div className="pt-4">
                        <Label className="block mb-2">Property Location</Label>
                        <PropertyMap
                          address={formData.address}
                          city={formData.city}
                          country={formData.country}
                          latitude={latitude}
                          longitude={longitude}
                          onLocationUpdate={(lat, lng) => {
                            setLatitude(lat);
                            setLongitude(lng);
                          }}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Property and Banking Details */}
                <Card>
                  <CardHeader>
                    <CardTitle>Property and Banking Details for Invoicing</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="space-y-0.5">
                          <Label htmlFor="has_vat">VAT Registered</Label>
                          <p className="text-sm text-muted-foreground">
                            Does this property have a VAT registration number?
                          </p>
                        </div>
                        <Switch
                          id="has_vat"
                          checked={formData.has_vat}
                          onCheckedChange={(checked) => handleInputChange("has_vat", checked)}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {formData.has_vat && (
                          <div className="space-y-2">
                            <Label htmlFor="vat_number">VAT #</Label>
                            <Input
                              id="vat_number"
                              value={formData.vat_number}
                              onChange={(e) => handleInputChange("vat_number", e.target.value)}
                              placeholder="4930161700"
                            />
                          </div>
                        )}
                        <div className="space-y-2">
                          <Label htmlFor="property_registration">Property Registration #</Label>
                          <Input
                            id="property_registration"
                            value={formData.property_registration}
                            onChange={(e) => handleInputChange("property_registration", e.target.value)}
                            placeholder="1998/012413/07"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="bank_name">Bank Name</Label>
                          <Input
                            id="bank_name"
                            value={formData.bank_name}
                            onChange={(e) => handleInputChange("bank_name", e.target.value)}
                            placeholder="First National Bank"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="branch_code">Branch Code</Label>
                          <Input
                            id="branch_code"
                            value={formData.branch_code}
                            onChange={(e) => handleInputChange("branch_code", e.target.value)}
                            placeholder="203809"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="account_holder">Account Holder</Label>
                          <Input
                            id="account_holder"
                            value={formData.account_holder}
                            onChange={(e) => handleInputChange("account_holder", e.target.value)}
                            placeholder="Property name or business name"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="account_number">Account Number</Label>
                          <Input
                            id="account_number"
                            value={formData.account_number}
                            onChange={(e) => handleInputChange("account_number", e.target.value)}
                            placeholder="62453541700"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="account_type">Account Type</Label>
                          <Input
                            id="account_type"
                            value={formData.account_type}
                            onChange={(e) => handleInputChange("account_type", e.target.value)}
                            placeholder="Gold Business Account"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="swift_code">SWIFT Code</Label>
                          <Input
                            id="swift_code"
                            value={formData.swift_code}
                            onChange={(e) => handleInputChange("swift_code", e.target.value)}
                            placeholder="Enter Swift Code"
                          />
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => handleNavigate("/admin/property-overview")}>
                    Cancel
                  </Button>
                  {isDirty && (
                    <Button type="submit" disabled={loading}>
                      <Save className="mr-2 h-4 w-4" />
                      {loading ? "Saving..." : "Save Property"}
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
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Property Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span>Property Info</span>
                      {selectedPMS && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div className="flex items-center gap-2 text-sm font-normal">
                                <div className="w-4 h-4 rounded bg-primary/10 border border-primary/30" />
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
                  <CardContent className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="description">Description</Label>
                      <Textarea
                        id="description"
                        value={formData.description}
                        onChange={(e) => handleInputChange("description", e.target.value)}
                        placeholder="Describe your property, its unique features, amenities, and what makes it special..."
                        rows={5}
                        className={cn("resize-none", getPMSFieldClass("description", selectedPMS))}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Stars</Label>
                      <div className={cn("inline-block p-2 rounded", getPMSFieldClass("star_rating", selectedPMS))}>
                        <StarRating rating={starRating} onRatingChange={setStarRating} />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Facilities */}
                <Card>
                  <CardHeader>
                    <CardTitle>Facilities</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="text-sm text-muted-foreground bg-blue-50 dark:bg-blue-950 p-3 rounded-md border border-blue-200 dark:border-blue-800">
                      <Info className="h-4 w-4 inline mr-2" />
                      Checked items will be highlighted on your property listing
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {/* General */}
                      <div>
                        <h3 className="font-semibold mb-3 text-sm">General</h3>
                        <div className="space-y-2">
                          {facilities.general.map((facility) => (
                            <div key={facility} className="flex items-center justify-between group">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={facility}
                                  checked={selectedFacilities.includes(facility)}
                                  onCheckedChange={() => toggleFacility(facility)}
                                />
                                <Label htmlFor={facility} className="cursor-pointer text-sm">
                                  {facility}
                                </Label>
                              </div>
                              {selectedFacilities.includes(facility) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                  onClick={() => toggleFacility(facility)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Bar */}
                      <div>
                        <h3 className="font-semibold mb-3 text-sm">Bar</h3>
                        <div className="space-y-2">
                          {facilities.bar.map((facility) => (
                            <div key={facility} className="flex items-center justify-between group">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={facility}
                                  checked={selectedFacilities.includes(facility)}
                                  onCheckedChange={() => toggleFacility(facility)}
                                />
                                <Label htmlFor={facility} className="cursor-pointer text-sm">
                                  {facility}
                                </Label>
                              </div>
                              {selectedFacilities.includes(facility) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                  onClick={() => toggleFacility(facility)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Business */}
                      <div>
                        <h3 className="font-semibold mb-3 text-sm">Business</h3>
                        <div className="space-y-2">
                          {facilities.business.map((facility) => (
                            <div key={facility} className="flex items-center justify-between group">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={facility}
                                  checked={selectedFacilities.includes(facility)}
                                  onCheckedChange={() => toggleFacility(facility)}
                                />
                                <Label htmlFor={facility} className="cursor-pointer text-sm">
                                  {facility}
                                </Label>
                              </div>
                              {selectedFacilities.includes(facility) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                  onClick={() => toggleFacility(facility)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Conference Room */}
                      <div>
                        <h3 className="font-semibold mb-3 text-sm">Conference Room</h3>
                        <div className="space-y-2">
                          {facilities.conferenceRoom.map((facility) => (
                            <div key={facility} className="flex items-center justify-between group">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={facility}
                                  checked={selectedFacilities.includes(facility)}
                                  onCheckedChange={() => toggleFacility(facility)}
                                />
                                <Label htmlFor={facility} className="cursor-pointer text-sm">
                                  {facility}
                                </Label>
                              </div>
                              {selectedFacilities.includes(facility) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                  onClick={() => toggleFacility(facility)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Meals */}
                      <div>
                        <h3 className="font-semibold mb-3 text-sm">Meals</h3>
                        <div className="space-y-2">
                          {facilities.meals.map((facility) => (
                            <div key={facility} className="flex items-center justify-between group">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={facility}
                                  checked={selectedFacilities.includes(facility)}
                                  onCheckedChange={() => toggleFacility(facility)}
                                />
                                <Label htmlFor={facility} className="cursor-pointer text-sm">
                                  {facility}
                                </Label>
                              </div>
                              {selectedFacilities.includes(facility) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                  onClick={() => toggleFacility(facility)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Utility */}
                      <div>
                        <h3 className="font-semibold mb-3 text-sm">Utility</h3>
                        <div className="space-y-2">
                          {facilities.utility.map((facility) => (
                            <div key={facility} className="flex items-center justify-between group">
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  id={facility}
                                  checked={selectedFacilities.includes(facility)}
                                  onCheckedChange={() => toggleFacility(facility)}
                                />
                                <Label htmlFor={facility} className="cursor-pointer text-sm">
                                  {facility}
                                </Label>
                              </div>
                              {selectedFacilities.includes(facility) && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="h-6 w-6 opacity-0 group-hover:opacity-100"
                                  onClick={() => toggleFacility(facility)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {selectedFacilities.length > 0 && (
                      <div className="pt-4">
                        <Label className="mb-2 block">Selected Facilities</Label>
                        <div className="flex flex-wrap gap-2">
                          {selectedFacilities.map((facility) => (
                            <Badge key={facility} variant="secondary" className="gap-1">
                              {facility}
                              <button
                                type="button"
                                onClick={() => toggleFacility(facility)}
                                className="ml-1 hover:text-destructive"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => handleNavigate("/admin/property-overview")}>
                    Cancel
                  </Button>
                  {isDirty && (
                    <Button type="submit" disabled={loading}>
                      <Save className="mr-2 h-4 w-4" />
                      {loading ? "Saving..." : "Save Property"}
                    </Button>
                  )}
                </div>
              </form>
            </TabsContent>

            <TabsContent value="house-rules">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Left Column */}
                  <div className="lg:col-span-2 space-y-6">
                    {/* Payment Policies */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Payment Policies</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="items_non_refundable"
                            checked={formData.items_non_refundable}
                            onCheckedChange={(checked) =>
                              setFormData({ ...formData, items_non_refundable: checked as boolean })
                            }
                          />
                          <Label htmlFor="items_non_refundable" className="cursor-pointer">
                            Items Non Refundable
                          </Label>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Cancellation Policies */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Cancellation Policies</CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {cancellationPolicies.map((policy, index) => (
                          <div key={index} className="flex items-center gap-2">
                            <span className="text-sm font-medium whitespace-nowrap">Forfeit</span>
                            <Input
                              className="w-20"
                              value={policy.forfeit}
                              onChange={(e) => updateCancellationPolicy(index, "forfeit", e.target.value)}
                            />
                            <Select
                              value={policy.type}
                              onValueChange={(value) => updateCancellationPolicy(index, "type", value)}
                            >
                              <SelectTrigger className="w-32">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent className="bg-background z-50">
                                <SelectItem value="% of Total">% of Total</SelectItem>
                                <SelectItem value="Fixed Amount">Fixed Amount</SelectItem>
                              </SelectContent>
                            </Select>
                            <span className="text-sm whitespace-nowrap">if guest cancels</span>
                            <Input
                              className="w-20"
                              value={policy.days}
                              onChange={(e) => updateCancellationPolicy(index, "days", e.target.value)}
                            />
                            <span className="text-sm whitespace-nowrap">Days before arrival</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              onClick={() => removeCancellationPolicy(index)}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            {index === cancellationPolicies.length - 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8"
                                onClick={addCancellationPolicy}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    {/* Policy Toggles */}
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex flex-wrap gap-8">
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-8 w-8 rounded-full flex items-center justify-center cursor-pointer ${
                                formData.smoking_allowed ? "bg-green-500" : "bg-destructive"
                              }`}
                              onClick={() =>
                                setFormData({
                                  ...formData,
                                  smoking_allowed: !formData.smoking_allowed,
                                })
                              }
                            >
                              {formData.smoking_allowed ? (
                                <Check className="h-4 w-4 text-white" />
                              ) : (
                                <X className="h-4 w-4 text-white" />
                              )}
                            </div>
                            <span className="text-sm">Smoking</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-8 w-8 rounded-full flex items-center justify-center cursor-pointer ${
                                formData.pets_allowed ? "bg-green-500" : "bg-destructive"
                              }`}
                              onClick={() => setFormData({ ...formData, pets_allowed: !formData.pets_allowed })}
                            >
                              {formData.pets_allowed ? (
                                <Check className="h-4 w-4 text-white" />
                              ) : (
                                <X className="h-4 w-4 text-white" />
                              )}
                            </div>
                            <span className="text-sm">Pets</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-8 w-8 rounded-full flex items-center justify-center cursor-pointer ${
                                formData.children_allowed ? "bg-green-500" : "bg-destructive"
                              }`}
                              onClick={() =>
                                setFormData({
                                  ...formData,
                                  children_allowed: !formData.children_allowed,
                                })
                              }
                            >
                              {formData.children_allowed ? (
                                <Check className="h-4 w-4 text-white" />
                              ) : (
                                <X className="h-4 w-4 text-white" />
                              )}
                            </div>
                            <span className="text-sm">Children</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-8 w-8 rounded-full flex items-center justify-center cursor-pointer ${
                                formData.parties_allowed ? "bg-green-500" : "bg-destructive"
                              }`}
                              onClick={() =>
                                setFormData({
                                  ...formData,
                                  parties_allowed: !formData.parties_allowed,
                                })
                              }
                            >
                              {formData.parties_allowed ? (
                                <Check className="h-4 w-4 text-white" />
                              ) : (
                                <X className="h-4 w-4 text-white" />
                              )}
                            </div>
                            <span className="text-sm">Parties/Events</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <div
                              className={`h-8 w-8 rounded-full flex items-center justify-center cursor-pointer ${
                                formData.check_in_24h ? "bg-green-500" : "bg-destructive"
                              }`}
                              onClick={() => setFormData({ ...formData, check_in_24h: !formData.check_in_24h })}
                            >
                              {formData.check_in_24h ? (
                                <Check className="h-4 w-4 text-white" />
                              ) : (
                                <X className="h-4 w-4 text-white" />
                              )}
                            </div>
                            <span className="text-sm">24 Hour Check in/out</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Bottom Row - Deposit, Same Day, Check-in, Check-out */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {/* Deposit */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Deposit</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="deposit_allowed"
                              checked={formData.deposit_allowed}
                              onCheckedChange={(checked) =>
                                setFormData({ ...formData, deposit_allowed: checked as boolean })
                              }
                            />
                            <Label htmlFor="deposit_allowed" className="cursor-pointer text-sm">
                              Deposit Allowed
                            </Label>
                          </div>
                          <div className="space-y-2">
                            <Input
                              placeholder="50"
                              value={formData.deposit_percentage}
                              onChange={(e) => handleInputChange("deposit_percentage", e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">Deposit amount %</span>
                          </div>
                          <div className="space-y-2">
                            <Input
                              placeholder="2"
                              value={formData.deposit_days}
                              onChange={(e) => handleInputChange("deposit_days", e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">Number of days allowed for deposit</span>
                          </div>
                        </CardContent>
                      </Card>

                      {/* Same Day Bookings */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Same Day Bookings</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="same_day_bookings"
                              checked={formData.same_day_bookings}
                              onCheckedChange={(checked) =>
                                setFormData({ ...formData, same_day_bookings: checked as boolean })
                              }
                            />
                            <Label htmlFor="same_day_bookings" className="cursor-pointer text-sm">
                              Same Day Bookings Allowed
                            </Label>
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">Cut off Time</Label>
                            <Input
                              type="time"
                              value={formData.same_day_cutoff}
                              onChange={(e) => handleInputChange("same_day_cutoff", e.target.value)}
                            />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Check-in */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Check-in</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">From</Label>
                            <Input
                              type="time"
                              value={formData.check_in_from}
                              onChange={(e) => handleInputChange("check_in_from", e.target.value)}
                              className={cn(getPMSFieldClass("check_in_from", selectedPMS))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">To</Label>
                            <Input
                              type="time"
                              value={formData.check_in_to}
                              onChange={(e) => handleInputChange("check_in_to", e.target.value)}
                              className={cn(getPMSFieldClass("check_in_to", selectedPMS))}
                            />
                          </div>
                        </CardContent>
                      </Card>

                      {/* Check-out */}
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Check-out</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">From</Label>
                            <Input
                              type="time"
                              value={formData.check_out_from}
                              onChange={(e) => handleInputChange("check_out_from", e.target.value)}
                              className={cn(getPMSFieldClass("check_out_from", selectedPMS))}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">To</Label>
                            <Input
                              type="time"
                              value={formData.check_out_to}
                              onChange={(e) => handleInputChange("check_out_to", e.target.value)}
                              className={cn(getPMSFieldClass("check_out_to", selectedPMS))}
                            />
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {/* Age Ranges */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Infant Ages</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">From</Label>
                              <Input
                                value={formData.infant_age_from}
                                onChange={(e) => handleInputChange("infant_age_from", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">To</Label>
                              <Input
                                value={formData.infant_age_to}
                                onChange={(e) => handleInputChange("infant_age_to", e.target.value)}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-base">Children Ages</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">From</Label>
                              <Input
                                value={formData.children_age_from}
                                onChange={(e) => handleInputChange("children_age_from", e.target.value)}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label className="text-xs text-muted-foreground">To</Label>
                              <Input
                                value={formData.children_age_to}
                                onChange={(e) => handleInputChange("children_age_to", e.target.value)}
                              />
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    </div>
                  </div>

                  {/* Right Column - Children Policy */}
                  <div>
                    <Card className="sticky top-4">
                      <CardHeader>
                        <CardTitle>Children Policy</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Textarea
                          value={formData.children_policy}
                          onChange={(e) => handleInputChange("children_policy", e.target.value)}
                          placeholder="Enter children policy details..."
                          rows={10}
                          className="resize-none"
                        />
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <div className="flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => handleNavigate("/admin/property-overview")}>
                    Cancel
                  </Button>
                  {isDirty && (
                    <Button type="submit" disabled={loading}>
                      <Save className="mr-2 h-4 w-4" />
                      {loading ? "Saving..." : "Save Property"}
                    </Button>
                  )}
                </div>
              </form>
            </TabsContent>

            <TabsContent value="images">
              <Card>
                <CardHeader>
                  <CardTitle>Property Images</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Upload Area */}
                    <div
                      className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                        isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary"
                      }`}
                      onDrop={handleDrop}
                      onDragOver={handleDragOver}
                      onDragLeave={handleDragLeave}
                      onClick={() => document.getElementById("image-upload")?.click()}
                    >
                      <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-sm text-muted-foreground text-center">
                        Click or Drag and drop image to upload
                      </p>
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
                    <div className="lg:col-span-3">
                      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {/* Render uploaded images */}
                        {uploadedImages.map((imageUrl, index) => (
                          <div
                            key={index}
                            className="relative aspect-square rounded-lg overflow-hidden border border-border group"
                          >
                            <img src={imageUrl} alt={`Property ${index + 1}`} className="w-full h-full object-cover" />
                            {index === 0 && (
                              <div className="absolute top-2 left-2 bg-destructive rounded-full p-1.5">
                                <Heart className="h-4 w-4 text-white fill-white" />
                              </div>
                            )}
                            <button
                              type="button"
                              onClick={() => removeImage(index)}
                              className="absolute top-2 right-2 bg-muted-foreground/80 hover:bg-destructive rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <X className="h-4 w-4 text-white" />
                            </button>
                          </div>
                        ))}

                        {/* Empty slots */}
                        {Array.from({ length: Math.max(0, 12 - uploadedImages.length) }, (_, index) => (
                          <div
                            key={`empty-${index}`}
                            className="relative aspect-square rounded-lg border-2 border-dashed border-border bg-muted/20 flex items-center justify-center"
                          >
                            <div className="absolute top-2 right-2 bg-muted rounded-full p-1.5">
                              <X className="h-4 w-4 text-muted-foreground" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-4 mt-6">
                <Button type="button" variant="outline" onClick={() => handleNavigate("/admin/property-overview")}>
                  Cancel
                </Button>
                {isDirty && (
                  <Button type="button" onClick={handleSubmit} disabled={loading}>
                    <Save className="mr-2 h-4 w-4" />
                    {loading ? "Saving..." : "Save Property"}
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Templates and Notifications Tab */}
            <TabsContent value="templates">
              <Card>
                <CardContent className="p-6 space-y-6">
                  {/* Template Selection Buttons */}
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant={selectedTemplate === "confirmation-mailer" ? "default" : "outline"}
                      onClick={() => setSelectedTemplate("confirmation-mailer")}
                    >
                      Confirmation Mailer Template
                    </Button>
                    <Button
                      type="button"
                      variant={selectedTemplate === "confirmation-property" ? "default" : "outline"}
                      onClick={() => setSelectedTemplate("confirmation-property")}
                    >
                      Confirmation Property Template
                    </Button>
                    <Button
                      type="button"
                      variant={selectedTemplate === "pre-mailer" ? "default" : "outline"}
                      onClick={() => setSelectedTemplate("pre-mailer")}
                    >
                      Pre Mailer Template
                    </Button>
                    <Button
                      type="button"
                      variant={selectedTemplate === "post-mailer" ? "default" : "outline"}
                      onClick={() => setSelectedTemplate("post-mailer")}
                    >
                      Post Mailer Template
                    </Button>
                  </div>

                  {/* Template Content Textarea */}
                  <div className="space-y-2">
                    <Label>Template</Label>
                    <Textarea
                      rows={10}
                      value={templateContent}
                      onChange={(e) => setTemplateContent(e.target.value)}
                      placeholder="Enter your email template content here..."
                      className="font-mono text-sm"
                    />
                  </div>

                  {/* Mailer Timing Settings */}
                  <div className="grid grid-cols-2 gap-6">
                    {/* Pre Mailer Settings */}
                    <div className="space-y-4">
                      <Label className="text-sm font-medium">Send Pre Mailer before checkin:</Label>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={preMailerDays}
                            onChange={(e) => setPreMailerDays(Number(e.target.value))}
                            className="w-24"
                            min="0"
                          />
                          <span className="text-sm text-muted-foreground">Days</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={preMailerHours}
                            onChange={(e) => setPreMailerHours(Number(e.target.value))}
                            className="w-24"
                            min="0"
                            max="23"
                          />
                          <span className="text-sm text-muted-foreground">Hours</span>
                        </div>
                      </div>
                    </div>

                    {/* Post Mailer Settings */}
                    <div className="space-y-4">
                      <Label className="text-sm font-medium">Send Post mailer after checkin:</Label>
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={postMailerDays}
                            onChange={(e) => setPostMailerDays(Number(e.target.value))}
                            className="w-24"
                            min="0"
                          />
                          <span className="text-sm text-muted-foreground">Days</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Input
                            type="number"
                            value={postMailerHours}
                            onChange={(e) => setPostMailerHours(Number(e.target.value))}
                            className="w-24"
                            min="0"
                            max="23"
                          />
                          <span className="text-sm text-muted-foreground">Hours</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-4 mt-6">
                <Button type="button" variant="outline" onClick={() => handleNavigate("/admin/property-overview")}>
                  Cancel
                </Button>
                {isDirty && (
                  <Button type="button" onClick={handleSubmit} disabled={loading}>
                    <Save className="mr-2 h-4 w-4" />
                    Save
                  </Button>
                )}
              </div>
            </TabsContent>

            {/* Addons Tab */}
            <TabsContent value="addons">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>ADDONS</CardTitle>
                  <Dialog open={isAddAddonOpen} onOpenChange={setIsAddAddonOpen}>
                    <DialogTrigger asChild>
                      <Button className="gap-2">
                        <Plus className="h-4 w-4" />
                        Add Addon
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Add Addon</DialogTitle>
                      </DialogHeader>

                      <Tabs value={addonDialogTab} onValueChange={setAddonDialogTab}>
                        <TabsList className="bg-primary gap-0 p-0 h-auto rounded-none">
                          <TabsTrigger
                            value="addon"
                            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                          >
                            Addon
                          </TabsTrigger>
                          <TabsTrigger
                            value="addon-images"
                            className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                          >
                            Addon Images
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="addon" className="space-y-4 mt-4">
                          <div className="space-y-2">
                            <Label>Name</Label>
                            <Input
                              value={addonForm.name}
                              onChange={(e) => setAddonForm({ ...addonForm, name: e.target.value })}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label>Offerings for: *</Label>
                            <div className="flex gap-4">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id="addon-accommodation"
                                  checked={addonForm.offeringsAccommodation}
                                  onCheckedChange={(checked) =>
                                    setAddonForm({ ...addonForm, offeringsAccommodation: checked as boolean })
                                  }
                                />
                                <Label htmlFor="addon-accommodation" className="cursor-pointer">
                                  Accommodation
                                </Label>
                              </div>
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id="addon-venue"
                                  checked={addonForm.offeringsVenue}
                                  onCheckedChange={(checked) =>
                                    setAddonForm({ ...addonForm, offeringsVenue: checked as boolean })
                                  }
                                />
                                <Label htmlFor="addon-venue" className="cursor-pointer">
                                  Venue
                                </Label>
                              </div>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Description</Label>
                            <Textarea
                              rows={4}
                              value={addonForm.description}
                              onChange={(e) => setAddonForm({ ...addonForm, description: e.target.value })}
                            />
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Price Type</Label>
                              <Select
                                value={addonForm.priceType}
                                onValueChange={(value) => setAddonForm({ ...addonForm, priceType: value })}
                              >
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Price Per Item">Price Per Item</SelectItem>
                                  <SelectItem value="Price Per Person">Price Per Person</SelectItem>
                                  <SelectItem value="Price Per Night">Price Per Night</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-2">
                              <Label>Price</Label>
                              <Input
                                type="number"
                                value={addonForm.price}
                                onChange={(e) => setAddonForm({ ...addonForm, price: Number(e.target.value) })}
                                min="0"
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Capacity</Label>
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id="addon-capacity"
                                checked={addonForm.hasCapacity}
                                onCheckedChange={(checked) =>
                                  setAddonForm({ ...addonForm, hasCapacity: checked as boolean })
                                }
                              />
                              <Label htmlFor="addon-capacity" className="cursor-pointer">
                                Capacity
                              </Label>
                              <Input
                                type="number"
                                className="w-32"
                                value={addonForm.capacity}
                                onChange={(e) => setAddonForm({ ...addonForm, capacity: Number(e.target.value) })}
                                min="0"
                                disabled={!addonForm.hasCapacity}
                              />
                            </div>
                          </div>

                          <div className="space-y-2">
                            <Label>Days*</Label>
                            <div className="flex flex-wrap gap-4">
                              <div className="flex items-center gap-2">
                                <Checkbox
                                  id="addon-all-days"
                                  checked={addonForm.allDays}
                                  onCheckedChange={(checked) =>
                                    setAddonForm({ ...addonForm, allDays: checked as boolean })
                                  }
                                />
                                <Label htmlFor="addon-all-days" className="cursor-pointer">
                                  All days
                                </Label>
                              </div>
                              {["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"].map(
                                (day) => (
                                  <div key={day} className="flex items-center gap-2">
                                    <Checkbox
                                      id={`addon-${day}`}
                                      checked={addonForm[day as keyof typeof addonForm] as boolean}
                                      onCheckedChange={(checked) =>
                                        setAddonForm({ ...addonForm, [day]: checked as boolean })
                                      }
                                    />
                                    <Label htmlFor={`addon-${day}`} className="cursor-pointer capitalize">
                                      {day}
                                    </Label>
                                  </div>
                                ),
                              )}
                            </div>
                          </div>

                          <div className="flex justify-end pt-4">
                            <Button onClick={handleAddAddon}>Create</Button>
                          </div>
                        </TabsContent>

                        <TabsContent value="addon-images" className="space-y-4 mt-4">
                          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                            {/* Upload Area */}
                            <div
                              className={`border-2 border-dashed rounded-lg p-8 flex flex-col items-center justify-center cursor-pointer transition-colors ${
                                isAddonImageDragging
                                  ? "border-primary bg-primary/5"
                                  : "border-border hover:border-primary"
                              }`}
                              onDrop={handleAddonImageDrop}
                              onDragOver={(e) => {
                                e.preventDefault();
                                setIsAddonImageDragging(true);
                              }}
                              onDragLeave={() => setIsAddonImageDragging(false)}
                              onClick={() => document.getElementById("addon-image-upload")?.click()}
                            >
                              <Upload className="h-12 w-12 text-muted-foreground mb-4" />
                              <p className="text-sm text-muted-foreground text-center">
                                Click or Drag and drop image to upload
                              </p>
                              <input
                                id="addon-image-upload"
                                type="file"
                                accept="image/*"
                                multiple
                                className="hidden"
                                onChange={(e) => handleAddonImageUpload(e.target.files)}
                              />
                            </div>

                            {/* Image Grid */}
                            <div className="lg:col-span-3">
                              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                                {/* Render uploaded images */}
                                {addonImages.map((imageUrl, index) => (
                                  <div
                                    key={index}
                                    className="relative aspect-square rounded-lg overflow-hidden border border-border group"
                                  >
                                    <img
                                      src={imageUrl}
                                      alt={`Addon ${index + 1}`}
                                      className="w-full h-full object-cover"
                                    />
                                    {index === 0 && (
                                      <div className="absolute top-2 left-2 bg-destructive rounded-full p-1.5">
                                        <Heart className="h-4 w-4 text-white fill-white" />
                                      </div>
                                    )}
                                    <button
                                      type="button"
                                      onClick={() => removeAddonImage(index)}
                                      className="absolute top-2 right-2 bg-muted-foreground/80 hover:bg-destructive rounded-full p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                                    >
                                      <X className="h-4 w-4 text-white" />
                                    </button>
                                  </div>
                                ))}

                                {/* Empty slots */}
                                {Array.from({ length: Math.max(0, 12 - addonImages.length) }, (_, index) => (
                                  <div
                                    key={`empty-${index}`}
                                    className="relative aspect-square rounded-lg border-2 border-dashed border-border bg-muted/20 flex items-center justify-center"
                                  >
                                    <div className="absolute top-2 right-2 bg-muted rounded-full p-1.5">
                                      <X className="h-4 w-4 text-muted-foreground" />
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        </TabsContent>
                      </Tabs>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted">
                        <tr>
                          <th className="text-left p-3 font-semibold text-sm">ITEM</th>
                          <th className="text-left p-3 font-semibold text-sm">DESCRIPTION</th>
                          <th className="text-left p-3 font-semibold text-sm">PRICE TYPE</th>
                          <th className="text-left p-3 font-semibold text-sm">CAPACITY</th>
                          <th className="text-left p-3 font-semibold text-sm">PRICE</th>
                          <th className="text-left p-3 font-semibold text-sm">OPTIONS</th>
                        </tr>
                      </thead>
                      <tbody>
                        {addons.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="p-8 text-center text-muted-foreground">
                              No addons yet. Click "+ Add Addon" to create one.
                            </td>
                          </tr>
                        ) : (
                          addons.map((addon) => (
                            <tr key={addon.id} className="border-t hover:bg-muted/50">
                              <td className="p-3">{addon.name}</td>
                              <td className="p-3 text-sm text-muted-foreground">{addon.description}</td>
                              <td className="p-3">{addon.priceType}</td>
                              <td className="p-3">{addon.hasCapacity ? addon.capacity : "-"}</td>
                              <td className="p-3">{addon.price}</td>
                              <td className="p-3">
                                <div className="flex gap-2">
                                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-8 w-8 p-0 text-destructive"
                                    onClick={() => deleteAddon(addon.id)}
                                  >
                                    <Trash2 className="h-4 w-4" />
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
            </TabsContent>

            {/* Specials Tab */}
            <TabsContent value="specials">
              <Card>
                <CardHeader>
                  <Tabs value={specialsCategory} onValueChange={setSpecialsCategory}>
                    <TabsList className="bg-primary gap-0 p-0 h-auto rounded-none">
                      <TabsTrigger
                        value="accommodations"
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                      >
                        Accommodations
                      </TabsTrigger>
                      <TabsTrigger
                        value="event-wedding"
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                      >
                        Event/Wedding Venue
                      </TabsTrigger>
                      <TabsTrigger
                        value="conference"
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                      >
                        Conference Venue
                      </TabsTrigger>
                    </TabsList>
                  </Tabs>
                </CardHeader>
                <CardContent>
                  {specialsCategory === "conference" && (
                    <div className="flex gap-4">
                      {/* Left Sidebar - Specials List */}
                      <div className="w-64 space-y-2">
                        <div className="flex items-center justify-between mb-4">
                          <h3 className="font-semibold text-sm">CONFERENCE SPECIALS</h3>
                          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={addNewSpecial}>
                            <Plus className="h-4 w-4" />
                          </Button>
                        </div>
                        {conferenceSpecials.map((special) => (
                          <div
                            key={special.id}
                            className={`flex items-center justify-between p-3 rounded-md transition-colors ${
                              selectedSpecial === special.id
                                ? "bg-primary text-primary-foreground"
                                : "bg-muted hover:bg-muted/80"
                            }`}
                          >
                            <span
                              className="text-sm font-medium flex-1 cursor-pointer"
                              onClick={() => setSelectedSpecial(special.id)}
                            >
                              {special.name}
                            </span>
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => setIsEditSpecialOpen(true)}
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-6 w-6 p-0"
                                onClick={() => deleteSpecial(special.id)}
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        ))}
                      </div>

                      {/* Main Content - Edit Special Dialog */}
                      <Dialog open={isEditSpecialOpen} onOpenChange={setIsEditSpecialOpen}>
                        <DialogTrigger asChild>
                          <div className="flex-1 flex items-center justify-center border-2 border-dashed rounded-lg p-12 cursor-pointer hover:bg-muted/50">
                            <div className="text-center">
                              <p className="text-muted-foreground mb-2">Click to edit special</p>
                              <Button>
                                <Edit className="mr-2 h-4 w-4" />
                                Edit Special
                              </Button>
                            </div>
                          </div>
                        </DialogTrigger>
                        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
                          <DialogHeader>
                            <div className="flex items-center justify-between">
                              <DialogTitle>Edit Special</DialogTitle>
                              <div className="flex items-center gap-2">
                                <Switch
                                  checked={specialForm.isPublic}
                                  onCheckedChange={(checked) => setSpecialForm({ ...specialForm, isPublic: checked })}
                                />
                                <Label>Public</Label>
                              </div>
                            </div>
                          </DialogHeader>

                          <Tabs value={specialDialogTab} onValueChange={setSpecialDialogTab}>
                            <TabsList className="bg-primary gap-0 p-0 h-auto rounded-none">
                              <TabsTrigger
                                value="edit-special"
                                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                              >
                                Edit Special
                              </TabsTrigger>
                              <TabsTrigger
                                value="special-images"
                                className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                              >
                                Special Images
                              </TabsTrigger>
                            </TabsList>

                            <TabsContent value="edit-special" className="space-y-6 mt-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Name*</Label>
                                  <Input
                                    value={specialForm.name}
                                    onChange={(e) => setSpecialForm({ ...specialForm, name: e.target.value })}
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Description</Label>
                                  <Textarea
                                    rows={1}
                                    value={specialForm.description}
                                    onChange={(e) => setSpecialForm({ ...specialForm, description: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label>Seasons</Label>
                                <div className="flex gap-2">
                                  <Select
                                    value={specialForm.season}
                                    onValueChange={(value) => setSpecialForm({ ...specialForm, season: value })}
                                  >
                                    <SelectTrigger>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="08/05/2025-30/09/2025">08/05/2025-30/09/2025</SelectItem>
                                      <SelectItem value="01/10/2025-30/09/2026">01/10/2025-30/09/2026</SelectItem>
                                      <SelectItem value="01/10/2026-30/09/2027">01/10/2026-30/09/2027</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Button size="icon" variant="outline">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>

                              <div className="space-y-2">
                                <h3 className="font-semibold">Period</h3>
                                <div className="grid grid-cols-2 gap-4">
                                  <div className="space-y-2">
                                    <Label>From / To</Label>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button
                                          variant="outline"
                                          className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !specialForm.periodFrom && "text-muted-foreground",
                                          )}
                                        >
                                          <CalendarIcon className="mr-2 h-4 w-4" />
                                          {specialForm.periodFrom
                                            ? format(specialForm.periodFrom, "yyyy-MM-dd")
                                            : "2025-11-18"}
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
                                  <div className="space-y-2">
                                    <Label>&nbsp;</Label>
                                    <Popover>
                                      <PopoverTrigger asChild>
                                        <Button
                                          variant="outline"
                                          className={cn(
                                            "w-full justify-start text-left font-normal",
                                            !specialForm.periodTo && "text-muted-foreground",
                                          )}
                                        >
                                          <CalendarIcon className="mr-2 h-4 w-4" />
                                          {specialForm.periodTo
                                            ? format(specialForm.periodTo, "yyyy-MM-dd")
                                            : "2025-11-18"}
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
                                </div>
                              </div>

                              <div className="space-y-4">
                                <h3 className="font-semibold">Pricing Config</h3>
                                {!specialForm.pricingConfig && (
                                  <div className="bg-red-50 border border-red-200 rounded-md p-3">
                                    <p className="text-sm text-red-700">
                                      <strong>Info:</strong> Pricing Config is required
                                    </p>
                                  </div>
                                )}
                                <RadioGroup
                                  value={specialForm.pricingConfig}
                                  onValueChange={(value: any) =>
                                    setSpecialForm({ ...specialForm, pricingConfig: value })
                                  }
                                >
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="discount" id="discount" />
                                    <Label htmlFor="discount">Discount (%)</Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="fixed-amount" id="fixed-amount" />
                                    <Label htmlFor="fixed-amount">Fixed Amount Off</Label>
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="fixed-price" id="fixed-price" />
                                    <Label htmlFor="fixed-price">Fixed Price</Label>
                                  </div>
                                </RadioGroup>
                              </div>

                              <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                  <Label>Conferences Rate Type</Label>
                                  <Input
                                    value={specialForm.conferenceRateType}
                                    onChange={(e) =>
                                      setSpecialForm({ ...specialForm, conferenceRateType: e.target.value })
                                    }
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Venue Hire</Label>
                                  <Input
                                    value={specialForm.venueHire}
                                    onChange={(e) => setSpecialForm({ ...specialForm, venueHire: e.target.value })}
                                  />
                                </div>
                              </div>

                              <div className="flex justify-end gap-4 pt-4">
                                <Button variant="outline" onClick={() => setIsEditSpecialOpen(false)}>
                                  Cancel
                                </Button>
                                <Button onClick={() => setIsEditSpecialOpen(false)}>Save</Button>
                              </div>
                            </TabsContent>

                            <TabsContent value="special-images" className="space-y-4 mt-4">
                              <p className="text-muted-foreground">Special images functionality coming soon...</p>
                            </TabsContent>
                          </Tabs>
                        </DialogContent>
                      </Dialog>
                    </div>
                  )}

                  {specialsCategory === "accommodations" && (
                    <div className="text-center py-12 text-muted-foreground">
                      Accommodation specials functionality coming soon...
                    </div>
                  )}

                  {specialsCategory === "event-wedding" && (
                    <div className="text-center py-12 text-muted-foreground">
                      Event/Wedding venue specials functionality coming soon...
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Rate Breakdown Tab */}
            <TabsContent value="rates" className="space-y-0">
              <div className="flex gap-4 h-[calc(100vh-250px)]">
                {/* Left Sidebar - Room Types List */}
                <div className="w-64 border-r bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-sm">ROOM TYPES</h3>
                    <Button size="sm" variant="outline" className="text-xs px-2 py-1">
                      Sort by Created At
                    </Button>
                  </div>
                  {roomTypes.map((room) => (
                    <div
                      key={room.id}
                      onClick={() => setSelectedRoomType(room.id)}
                      className={`p-3 rounded-md cursor-pointer transition-colors ${
                        selectedRoomType === room.id
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted hover:bg-muted/80"
                      }`}
                    >
                      <span className="text-sm font-medium">{room.name}</span>
                    </div>
                  ))}
                </div>

                {/* Main Content - Rate Breakdown Details */}
                <div className="flex-1 overflow-auto">
                  <Tabs defaultValue="season" className="w-full">
                    <TabsList className="bg-primary gap-0 p-0 h-auto rounded-none">
                      <TabsTrigger
                        value="season"
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                      >
                        Season
                      </TabsTrigger>
                      <TabsTrigger
                        value="rate-breakdown"
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                      >
                        Rate Breakdown
                      </TabsTrigger>
                      <TabsTrigger
                        value="overview"
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                      >
                        Overview
                      </TabsTrigger>
                    </TabsList>

                    {/* Season Sub-tab */}
                    <TabsContent value="season" className="p-6 space-y-4">
                      <div className="flex justify-end">
                        <Button className="gap-2">
                          <Plus className="h-4 w-4" />
                          Add Season
                        </Button>
                      </div>

                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full">
                          <thead className="bg-muted">
                            <tr>
                              <th className="text-left p-3 font-semibold text-sm">TITLE</th>
                              <th className="text-left p-3 font-semibold text-sm">FROM</th>
                              <th className="text-left p-3 font-semibold text-sm">TO</th>
                              <th className="w-20"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {seasons.map((season) => (
                              <tr key={season.id} className="border-t hover:bg-muted/50">
                                <td className="p-3">{season.title}</td>
                                <td className="p-3 text-muted-foreground">{season.from}</td>
                                <td className="p-3 text-muted-foreground">{season.to}</td>
                                <td className="p-3">
                                  <div className="flex gap-2 justify-end">
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-blue-600">
                                      <Edit className="h-4 w-4" />
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 text-destructive">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </TabsContent>

                    {/* Rate Breakdown Sub-tab */}
                    <TabsContent value="rate-breakdown" className="p-6 space-y-6">
                      {seasons.map((season) => (
                        <div key={season.id} className="space-y-4">
                          <h3 className="text-lg font-semibold text-muted-foreground">Season: {season.title}</h3>

                          <div className="border rounded-lg p-6 space-y-4 bg-card">
                            <div className="text-center text-sm text-muted-foreground mb-4">Self Catering</div>

                            <div className="grid grid-cols-2 gap-6 max-w-md">
                              <div className="space-y-2">
                                <Label className="text-sm font-medium">UnitRate</Label>
                                <Input
                                  type="number"
                                  defaultValue={season.id === "3" ? "7000" : "6500"}
                                  className="text-center"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm font-medium">WeekendRate</Label>
                                <Input type="number" defaultValue="0" className="text-center" />
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end gap-4 pt-4">
                        <Button variant="outline">Cancel</Button>
                        <Button>Save</Button>
                      </div>
                    </TabsContent>

                    {/* Overview Sub-tab */}
                    <TabsContent value="overview" className="p-6 space-y-6">
                      {seasons.map((season) => (
                        <div key={season.id} className="space-y-4">
                          <div className="flex items-baseline gap-4">
                            <h3 className="font-semibold">{season.title}</h3>
                            <div className="flex gap-6 text-sm text-muted-foreground">
                              <div>
                                <span className="font-medium">Minimum Stay</span>
                                <span className="ml-2">{season.minStay}</span>
                              </div>
                              <div>
                                <span className="font-medium">Maximum Stay</span>
                                <span className="ml-2">{season.maxStay}</span>
                              </div>
                            </div>
                          </div>

                          <div className="border rounded-lg p-6 bg-card">
                            <div className="text-center text-sm text-muted-foreground">Self Catering</div>
                          </div>
                        </div>
                      ))}

                      <div className="flex justify-end gap-4 pt-4">
                        <Button variant="outline">Cancel</Button>
                        <Button>Save</Button>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </TabsContent>

            {/* Room Information Tab */}
            <TabsContent value="rooms" className="space-y-0">
              <div className="flex gap-4 h-[calc(100vh-250px)]">
                {/* Left Sidebar - Room Types List */}
                <div className="w-64 border-r bg-muted/30 p-4 space-y-2">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-sm">ROOM TYPES</h3>
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
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={addRoomType}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {roomTypes.map((room) => (
                    <div
                      key={room.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-md transition-colors",
                        selectedRoomType === room.id ? "bg-primary text-primary-foreground" : "hover:bg-muted",
                        room.pms_synced && selectedRoomType !== room.id ? "bg-primary/5 border border-primary/20" : ""
                      )}
                    >
                      <span
                        className="text-sm font-medium flex-1 cursor-pointer"
                        onClick={() => setSelectedRoomType(room.id)}
                      >
                        {room.name}
                        {room.pms_synced && (
                          <Cloud className="inline h-3 w-3 ml-1 opacity-50" />
                        )}
                      </span>
                      <div className="flex gap-1">
                        {room.url && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 w-6 p-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              window.open(room.url, "_blank");
                            }}
                            title="View room page"
                          >
                            <Home className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            copyRoomUrl(room.url);
                          }}
                          title="Copy room URL"
                        >
                          <Copy className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteRoomType(room.id);
                          }}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Main Content - Room Type Details */}
                <div className="flex-1 overflow-auto">
                  <Tabs defaultValue="room-type" className="w-full">
                    <TabsList className="bg-primary gap-0 p-0 h-auto rounded-none">
                      <TabsTrigger
                        value="room-type"
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                      >
                        Room Type
                      </TabsTrigger>
                      <TabsTrigger
                        value="facilities"
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                      >
                        Facilities
                      </TabsTrigger>
                      <TabsTrigger
                        value="amenities"
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                      >
                        Amenities
                      </TabsTrigger>
                      <TabsTrigger
                        value="room-images"
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                      >
                        Images
                      </TabsTrigger>
                      <TabsTrigger
                        value="agreement"
                        className="data-[state=active]:bg-primary data-[state=active]:text-primary-foreground rounded-none px-4 py-2"
                      >
                        Agreement
                      </TabsTrigger>
                    </TabsList>

                    {/* Room Type Sub-tab */}
                    <TabsContent value="room-type" className="p-6 space-y-6">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Room Type Name</Label>
                          <Input
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.name || ""}
                            onChange={(e) => updateRoomTypeName(selectedRoomType, e.target.value)}
                            className={cn(
                              roomTypes.find((r) => r.id === selectedRoomType)?.pms_synced 
                                ? "bg-primary/5 border-primary/20" 
                                : ""
                            )}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label># of rooms for this type*</Label>
                          <Input 
                            type="number" 
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.numRooms || 1}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "numRooms", parseInt(e.target.value) || 1)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label className="flex items-center gap-2">
                          <Link className="h-4 w-4" />
                          Room URL
                        </Label>
                        <div className="flex gap-2">
                          <Input
                            placeholder="https://example.com/property/room-id"
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.url || ""}
                            onChange={(e) => updateRoomTypeUrl(selectedRoomType, e.target.value)}
                          />
                          {roomTypes.find((r) => r.id === selectedRoomType)?.url && (
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              onClick={() => copyRoomUrl(roomTypes.find((r) => r.id === selectedRoomType)?.url || "")}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Link to the specific room page on your property website
                        </p>
                      </div>

                      {selectedPMS && (
                        <div className="grid grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <Label>{selectedPMS.charAt(0).toUpperCase() + selectedPMS.slice(1)} Room Type</Label>
                            <Input 
                              value={roomTypes.find((r) => r.id === selectedRoomType)?.pmsRoomType || ""}
                              onChange={(e) => updateRoomTypeField(selectedRoomType, "pmsRoomType", e.target.value)}
                              placeholder={`Enter ${selectedPMS} room type name`}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>{selectedPMS.charAt(0).toUpperCase() + selectedPMS.slice(1)} Room ID</Label>
                            <Input 
                              value={roomTypes.find((r) => r.id === selectedRoomType)?.pmsRoomId || ""}
                              onChange={(e) => updateRoomTypeField(selectedRoomType, "pmsRoomId", e.target.value)}
                              placeholder={`Enter ${selectedPMS} room ID`}
                            />
                          </div>
                        </div>
                      )}

                      {!selectedPMS && (
                        <div className="bg-muted/50 border border-border rounded-md p-3">
                          <p className="text-sm text-muted-foreground">
                            No PMS connected. Select a PMS system in the General tab to enable room mapping fields.
                          </p>
                        </div>
                      )}

                      <div className="space-y-2">
                        <Label>Room Type Description</Label>
                        <Textarea
                          rows={4}
                          value={roomTypes.find((r) => r.id === selectedRoomType)?.description || ""}
                          onChange={(e) => updateRoomTypeField(selectedRoomType, "description", e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Extra Person Policy</Label>
                        <Textarea 
                          rows={2} 
                          value={roomTypes.find((r) => r.id === selectedRoomType)?.extraPersonPolicy || ""}
                          onChange={(e) => updateRoomTypeField(selectedRoomType, "extraPersonPolicy", e.target.value)}
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Bed Configuration</Label>
                          <Select 
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.bedConfiguration || "king-twin"}
                            onValueChange={(value) => updateRoomTypeField(selectedRoomType, "bedConfiguration", value)}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="king-twin">King/Twin</SelectItem>
                              <SelectItem value="king">King</SelectItem>
                              <SelectItem value="twin">Twin</SelectItem>
                              <SelectItem value="queen">Queen</SelectItem>
                              <SelectItem value="double">Double</SelectItem>
                              <SelectItem value="single">Single</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Room Size (m²)*</Label>
                          <Input 
                            type="number" 
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.roomSize || 0}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "roomSize", parseInt(e.target.value) || 0)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Bathrooms*</Label>
                          <Input 
                            type="number" 
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.bathrooms || 1}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "bathrooms", parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Max people per Room*</Label>
                          <Input 
                            type="number" 
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.maxPeople || 2}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "maxPeople", parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Max adult*</Label>
                          <Input 
                            type="number" 
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.maxAdults || 2}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "maxAdults", parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Max children*</Label>
                          <Input 
                            type="number" 
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.maxChildren || 0}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "maxChildren", parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Min Stay*</Label>
                          <Input 
                            type="number" 
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.minStay || 1}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "minStay", parseInt(e.target.value) || 1)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Max Stay*</Label>
                          <Input 
                            type="number" 
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.maxStay || 0}
                            onChange={(e) => updateRoomTypeField(selectedRoomType, "maxStay", parseInt(e.target.value) || 0)}
                          />
                        </div>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                        <p className="text-sm text-blue-700">
                          <strong>INFO:</strong> Please be advised that you need to align the number of "Max adult" with
                          rate type if Person Rate is applied.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-semibold">Rate Info</h3>
                        <div className="space-y-2">
                          <Label>Rate Type</Label>
                          <Select 
                            value={roomTypes.find((r) => r.id === selectedRoomType)?.rateType || "per-unit"}
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
                        </div>
                        <div className="space-y-2">
                          <Label>Meal Type</Label>
                          <TagInput
                            value={selectedMealTypes}
                            onChange={handleMealTypesChange}
                            suggestions={mealTypeSuggestions}
                            placeholder="Type meal type and press Enter..."
                            onNewTag={handleNewMealType}
                          />
                        </div>
                      </div>
                    </TabsContent>

                    {/* Facilities Sub-tab */}
                    <TabsContent value="facilities" className="p-6 space-y-4">
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-4">
                        <p className="text-sm text-blue-700">Select the facilities available in this room type.</p>
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
                                checked={(roomTypes.find((r) => r.id === selectedRoomType)?.facilities || []).includes(item)}
                                onCheckedChange={(checked) => {
                                  const currentFacilities = roomTypes.find((r) => r.id === selectedRoomType)?.facilities || [];
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
                                checked={(roomTypes.find((r) => r.id === selectedRoomType)?.facilities || []).includes(item)}
                                onCheckedChange={(checked) => {
                                  const currentFacilities = roomTypes.find((r) => r.id === selectedRoomType)?.facilities || [];
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
                                checked={(roomTypes.find((r) => r.id === selectedRoomType)?.facilities || []).includes(item)}
                                onCheckedChange={(checked) => {
                                  const currentFacilities = roomTypes.find((r) => r.id === selectedRoomType)?.facilities || [];
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
                                checked={(roomTypes.find((r) => r.id === selectedRoomType)?.facilities || []).includes(item)}
                                onCheckedChange={(checked) => {
                                  const currentFacilities = roomTypes.find((r) => r.id === selectedRoomType)?.facilities || [];
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
                                checked={(roomTypes.find((r) => r.id === selectedRoomType)?.facilities || []).includes(item)}
                                onCheckedChange={(checked) => {
                                  const currentFacilities = roomTypes.find((r) => r.id === selectedRoomType)?.facilities || [];
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
                                checked={(roomTypes.find((r) => r.id === selectedRoomType)?.facilities || []).includes(item)}
                                onCheckedChange={(checked) => {
                                  const currentFacilities = roomTypes.find((r) => r.id === selectedRoomType)?.facilities || [];
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
                      <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-4">
                        <p className="text-sm text-blue-700">Select the amenities available in this room type.</p>
                      </div>

                      <div className="grid grid-cols-3 gap-6">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Bathroom</h4>
                          {["Bathroom amenities", "Hand wash", "Towels", "Bathrobe", "Slippers", "Toiletries"].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox 
                                id={`amenity-${item}`}
                                checked={(roomTypes.find((r) => r.id === selectedRoomType)?.amenities || []).includes(item)}
                                onCheckedChange={(checked) => {
                                  const currentAmenities = roomTypes.find((r) => r.id === selectedRoomType)?.amenities || [];
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
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Bedroom</h4>
                          {["Extra pillows", "Extra blankets", "Linen", "Blackout curtains", "Reading lamp"].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox 
                                id={`amenity-${item}`}
                                checked={(roomTypes.find((r) => r.id === selectedRoomType)?.amenities || []).includes(item)}
                                onCheckedChange={(checked) => {
                                  const currentAmenities = roomTypes.find((r) => r.id === selectedRoomType)?.amenities || [];
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
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Extras</h4>
                          {["Welcome pack", "Mini bar", "Bottled water", "Fruit basket", "Snacks"].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox 
                                id={`amenity-${item}`}
                                checked={(roomTypes.find((r) => r.id === selectedRoomType)?.amenities || []).includes(item)}
                                onCheckedChange={(checked) => {
                                  const currentAmenities = roomTypes.find((r) => r.id === selectedRoomType)?.amenities || [];
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
                        {(roomTypes.find((r) => r.id === selectedRoomType)?.images || []).map((imageUrl: string, index: number) => (
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
                        ))}

                        {/* Placeholder empty slots */}
                        {Array.from({ length: Math.max(0, 11 - (roomTypes.find((r) => r.id === selectedRoomType)?.images?.length || 0)) }).map((_, i) => (
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
                          onChange={(e) => updateRoomTypeField(selectedRoomType, "splitPercent", parseFloat(e.target.value) || 0)}
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
            <TabsContent value="packages" className="space-y-6">
              <Tabs value={packagesCategory} onValueChange={(v) => setPackagesCategory(v as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="accommodations">Accommodations</TabsTrigger>
                  <TabsTrigger value="event">Event/Wedding Venue</TabsTrigger>
                  <TabsTrigger value="conference">Conference Venue</TabsTrigger>
                </TabsList>

                <TabsContent value="accommodations" className="mt-6">
                  <div className="grid grid-cols-[250px_1fr] gap-6">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">PACKAGES</CardTitle>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditPackageOpen(true)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {packages.filter((p) => p.category === "accommodations").length === 0 ? (
                          <p className="text-sm text-muted-foreground">No items yet...</p>
                        ) : (
                          packages
                            .filter((p) => p.category === "accommodations")
                            .map((pkg) => (
                              <div
                                key={pkg.id}
                                className={cn(
                                  "p-2 rounded cursor-pointer hover:bg-accent flex items-center justify-between",
                                  selectedPackage?.id === pkg.id && "bg-accent",
                                )}
                                onClick={() => setSelectedPackage(pkg)}
                              >
                                <span className="text-sm">{pkg.name}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deletePackage(pkg.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))
                        )}
                      </CardContent>
                    </Card>

                    <div className="flex gap-2">
                      <Button variant="destructive" onClick={() => setIsEditPackageOpen(true)}>
                        Edit Package
                      </Button>
                      <Button variant="destructive" onClick={() => setIsPackageImagesOpen(true)}>
                        Package Images
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="event" className="mt-6">
                  <div className="grid grid-cols-[250px_1fr] gap-6">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">PACKAGES</CardTitle>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditPackageOpen(true)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {packages.filter((p) => p.category === "event").length === 0 ? (
                          <p className="text-sm text-muted-foreground">No items yet...</p>
                        ) : (
                          packages
                            .filter((p) => p.category === "event")
                            .map((pkg) => (
                              <div
                                key={pkg.id}
                                className={cn(
                                  "p-2 rounded cursor-pointer hover:bg-accent flex items-center justify-between",
                                  selectedPackage?.id === pkg.id && "bg-accent",
                                )}
                                onClick={() => setSelectedPackage(pkg)}
                              >
                                <span className="text-sm">{pkg.name}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deletePackage(pkg.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))
                        )}
                      </CardContent>
                    </Card>

                    <div className="flex gap-2">
                      <Button variant="destructive" onClick={() => setIsEditPackageOpen(true)}>
                        Edit Package
                      </Button>
                      <Button variant="destructive" onClick={() => setIsPackageImagesOpen(true)}>
                        Package Images
                      </Button>
                    </div>
                  </div>
                </TabsContent>

                <TabsContent value="conference" className="mt-6">
                  <div className="grid grid-cols-[250px_1fr] gap-6">
                    <Card>
                      <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-sm font-medium">PACKAGES</CardTitle>
                        <Button size="sm" variant="ghost" onClick={() => setIsEditPackageOpen(true)}>
                          <Plus className="h-4 w-4" />
                        </Button>
                      </CardHeader>
                      <CardContent className="space-y-2">
                        {packages.filter((p) => p.category === "conference").length === 0 ? (
                          <p className="text-sm text-muted-foreground">No items yet...</p>
                        ) : (
                          packages
                            .filter((p) => p.category === "conference")
                            .map((pkg) => (
                              <div
                                key={pkg.id}
                                className={cn(
                                  "p-2 rounded cursor-pointer hover:bg-accent flex items-center justify-between",
                                  selectedPackage?.id === pkg.id && "bg-accent",
                                )}
                                onClick={() => setSelectedPackage(pkg)}
                              >
                                <span className="text-sm">{pkg.name}</span>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deletePackage(pkg.id);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            ))
                        )}
                      </CardContent>
                    </Card>

                    <div className="flex gap-2">
                      <Button variant="destructive" onClick={() => setIsEditPackageOpen(true)}>
                        Edit Package
                      </Button>
                      <Button variant="destructive" onClick={() => setIsPackageImagesOpen(true)}>
                        Package Images
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </TabsContent>

            {/* Announcements Tab */}
            <TabsContent value="announcements" className="space-y-6">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle>ANNOUNCEMENTS</CardTitle>
                  <Button variant="destructive" size="sm" onClick={() => setIsManageAnnouncementOpen(true)}>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Announcement
                  </Button>
                </CardHeader>
                <CardContent>
                  {announcements.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-8">
                      No announcements yet. Click "Add Announcement" to create one.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-3 text-sm font-medium">ENABLED</th>
                            <th className="text-left p-3 text-sm font-medium">MESSAGE</th>
                            <th className="text-left p-3 text-sm font-medium">START DATE</th>
                            <th className="text-left p-3 text-sm font-medium">END DATE</th>
                            <th className="text-left p-3 text-sm font-medium">ORDER</th>
                            <th className="text-left p-3 text-sm font-medium">ACTION</th>
                          </tr>
                        </thead>
                        <tbody>
                          {announcements.map((announcement) => (
                            <tr key={announcement.id} className="border-b">
                              <td className="p-3">
                                <Switch
                                  checked={announcement.enabled}
                                  onCheckedChange={() => toggleAnnouncementEnabled(announcement.id)}
                                />
                              </td>
                              <td className="p-3 text-sm">{announcement.announcement}</td>
                              <td className="p-3 text-sm">
                                {announcement.startDate ? format(announcement.startDate, "MM/dd/yyyy") : "-"}
                              </td>
                              <td className="p-3 text-sm">
                                {announcement.endDate ? format(announcement.endDate, "MM/dd/yyyy") : "-"}
                              </td>
                              <td className="p-3 text-sm">{announcement.order}</td>
                              <td className="p-3">
                                <Button size="sm" variant="ghost" onClick={() => deleteAnnouncement(announcement.id)}>
                                  <Trash2 className="h-4 w-4" />
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
