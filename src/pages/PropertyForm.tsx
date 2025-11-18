import { useState } from "react";
import { useNavigate } from "react-router-dom";
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
import { Home, Building2, MapPin, Save, Info, Image, DollarSign, Bell, Package, Calendar, X, Plus, Minus, FileText, Check, Upload, Heart, Edit, Trash2, Copy, Link } from "lucide-react";
import { StarRating } from "@/components/StarRating";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarIcon } from "lucide-react";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { Switch } from "@/components/ui/switch";

const propertySchema = z.object({
  name: z.string().min(1, "Property name is required").max(200),
  property_type: z.string().min(1, "Property type is required"),
  contact_email: z.string().email("Invalid email address"),
  telephone: z.string().optional(),
  currency: z.string().min(1, "Currency is required"),
  owner: z.string().optional(),
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
  vat_number: z.string().min(1, "VAT number is required"),
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
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

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
  };

  // Property source
  const [isNightsBridge, setIsNightsBridge] = useState(true);
  const [isSemperProperty, setIsSemperProperty] = useState(false);

  // Form data
  const [formData, setFormData] = useState<PropertyFormData>({
    name: "",
    property_type: "",
    contact_email: "",
    telephone: "",
    currency: "ZAR",
    owner: "",
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
  
  // Room types state
  const [roomTypes, setRoomTypes] = useState<any[]>([
    { 
      id: '1', 
      name: 'Holiday House', 
      url: 'https://next.roomsonlinehub.com/property/c0b07393-6603-4ecf-9ceb-c0124272e9df/main/accommodation?sourceprop=c0b07393-6603-4ecf-9ceb-c0124272e9df',
      selected: true 
    },
    { id: '2', name: 'One Bedroom Suite', url: '', selected: false },
    { id: '3', name: 'Petite Hotel Room', url: '', selected: false },
    { id: '4', name: 'Two Bedroom Suite', url: '', selected: false }
  ]);
  const [selectedRoomType, setSelectedRoomType] = useState<string>('1');
  
  const addRoomType = () => {
    const newRoom = {
      id: Date.now().toString(),
      name: 'New Room Type',
      url: '',
      selected: false
    };
    setRoomTypes([...roomTypes, newRoom]);
    setSelectedRoomType(newRoom.id);
  };
  
  const deleteRoomType = (id: string) => {
    const filtered = roomTypes.filter(r => r.id !== id);
    setRoomTypes(filtered);
    if (selectedRoomType === id && filtered.length > 0) {
      setSelectedRoomType(filtered[0].id);
    }
  };
  
  const updateRoomTypeName = (id: string, name: string) => {
    setRoomTypes(roomTypes.map(r => r.id === id ? { ...r, name } : r));
  };
  
  const updateRoomTypeUrl = (id: string, url: string) => {
    setRoomTypes(roomTypes.map(r => r.id === id ? { ...r, url } : r));
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
    { id: '1', title: '08/05/2025-30/09/2025', from: '2025-05-08', to: '2025-09-30', minStay: 5, maxStay: 0 },
    { id: '2', title: '01/10/2025-30/09/2026', from: '2025-10-01', to: '2026-09-30', minStay: 5, maxStay: 0 },
    { id: '3', title: '01/10/2026-30/09/2027', from: '2026-10-01', to: '2027-09-30', minStay: 5, maxStay: 0 }
  ]);
  
  // Templates and Notifications state
  const [selectedTemplate, setSelectedTemplate] = useState<string>('confirmation-mailer');
  const [templateContent, setTemplateContent] = useState<string>('');
  const [preMailerDays, setPreMailerDays] = useState<number>(0);
  const [preMailerHours, setPreMailerHours] = useState<number>(0);
  const [postMailerDays, setPostMailerDays] = useState<number>(0);
  const [postMailerHours, setPostMailerHours] = useState<number>(0);
  
  // Addons state
  const [addons, setAddons] = useState<any[]>([]);
  const [isAddAddonOpen, setIsAddAddonOpen] = useState(false);
  const [addonForm, setAddonForm] = useState({
    name: '',
    offeringsAccommodation: false,
    offeringsVenue: false,
    description: '',
    priceType: 'Price Per Item',
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
    saturday: false
  });
  const [addonDialogTab, setAddonDialogTab] = useState<string>('addon');
  
  const handleAddAddon = () => {
    const newAddon = {
      id: Date.now().toString(),
      ...addonForm,
      offerings: [
        addonForm.offeringsAccommodation && 'Accommodation',
        addonForm.offeringsVenue && 'Venue'
      ].filter(Boolean).join(', ')
    };
    setAddons([...addons, newAddon]);
    setIsAddAddonOpen(false);
    // Reset form
    setAddonForm({
      name: '',
      offeringsAccommodation: false,
      offeringsVenue: false,
      description: '',
      priceType: 'Price Per Item',
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
      saturday: false
    });
    toast({
      title: "Addon Added",
      description: "The addon has been added successfully",
    });
  };
  
  const deleteAddon = (id: string) => {
    setAddons(addons.filter(a => a.id !== id));
    toast({
      title: "Addon Deleted",
      description: "The addon has been removed",
    });
  };
  
  // Specials state
  const [specialsCategory, setSpecialsCategory] = useState<string>('accommodations');
  const [conferenceSpecials, setConferenceSpecials] = useState<any[]>([
    { id: '1', name: 'Untitled' }
  ]);
  const [selectedSpecial, setSelectedSpecial] = useState<string>('1');
  const [isEditSpecialOpen, setIsEditSpecialOpen] = useState(false);
  const [specialDialogTab, setSpecialDialogTab] = useState<string>('edit-special');
  const [specialForm, setSpecialForm] = useState({
    name: '',
    isPublic: false,
    description: '',
    season: '08/05/2025-30/09/2025',
    periodFrom: undefined as Date | undefined,
    periodTo: undefined as Date | undefined,
    pricingConfig: '' as 'discount' | 'fixed-amount' | 'fixed-price' | '',
    discountPercent: 0,
    fixedAmount: 0,
    fixedPrice: 0,
    conferenceRateType: '',
    venueHire: ''
  });
  
  const addNewSpecial = () => {
    const newSpecial = {
      id: Date.now().toString(),
      name: 'Untitled'
    };
    setConferenceSpecials([...conferenceSpecials, newSpecial]);
    setSelectedSpecial(newSpecial.id);
  };
  
  const deleteSpecial = (id: string) => {
    const filtered = conferenceSpecials.filter(s => s.id !== id);
    setConferenceSpecials(filtered);
    if (selectedSpecial === id && filtered.length > 0) {
      setSelectedSpecial(filtered[0].id);
    }
  };

  const handleInputChange = (field: keyof PropertyFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const toggleFacility = (facility: string) => {
    setSelectedFacilities((prev) =>
      prev.includes(facility)
        ? prev.filter((f) => f !== facility)
        : [...prev, facility]
    );
  };

  const addCancellationPolicy = () => {
    setCancellationPolicies([...cancellationPolicies, { forfeit: "", type: "% of Total", days: "" }]);
  };

  const removeCancellationPolicy = (index: number) => {
    setCancellationPolicies(cancellationPolicies.filter((_, i) => i !== index));
  };

  const updateCancellationPolicy = (index: number, field: string, value: string) => {
    const updated = [...cancellationPolicies];
    updated[index] = { ...updated[index], [field]: value };
    setCancellationPolicies(updated);
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

        const { error: uploadError } = await supabase.storage
          .from("property-images")
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("property-images")
          .getPublicUrl(filePath);

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
        address: formData.address,
        city: formData.city,
        country: formData.country,
        external_system: isNightsBridge && isSemperProperty 
          ? "nightsbridge,semper" 
          : isNightsBridge 
          ? "nightsbridge" 
          : isSemperProperty 
          ? "semper" 
          : null,
        external_id: formData.bb_id || null,
        is_active: true,
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
            owner: formData.owner,
          },
          address_details: {
            suburb: formData.suburb,
            postal_code: formData.postal_code,
          },
          currency: formData.currency,
          banking: {
            vat_number: formData.vat_number,
            property_registration: formData.property_registration,
            bank_name: formData.bank_name,
            branch_code: formData.branch_code,
            account_holder: formData.account_holder,
            account_number: formData.account_number,
            account_type: formData.account_type,
            swift_code: formData.swift_code,
          },
          external_ids: {
            nightsbridge_bb_id: isNightsBridge ? formData.bb_id : null,
            semper_venue_id: isSemperProperty ? formData.venue_id : null,
            semper_channel_id: isSemperProperty ? formData.channel_id : null,
            semper_account_id: isSemperProperty ? formData.account_id : null,
            semper_agent_id: isSemperProperty ? formData.agent_id : null,
          },
        },
      };

      const { error } = await supabase.from("properties").insert([propertyData]);

      if (error) throw error;

      toast({
        title: "Success",
        description: "Property created successfully",
      });

      navigate("/admin");
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
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Add New Property</h1>
              <p className="text-muted-foreground">Configure property details and settings</p>
            </div>
            <Button variant="outline" onClick={() => navigate("/admin")}>
              Cancel
            </Button>
          </div>

          <Tabs defaultValue="general" className="space-y-6">
            <TabsList className="bg-secondary">
              <TabsTrigger value="general" className="gap-2">
                <Home className="h-4 w-4" />
                General
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
                          onCheckedChange={(checked) => setIsAccommodation(checked as boolean)}
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
                      <div className="flex items-center space-x-4">
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="nightsbridge"
                            checked={isNightsBridge}
                            onCheckedChange={(checked) => setIsNightsBridge(checked as boolean)}
                          />
                          <Label htmlFor="nightsbridge" className="cursor-pointer">
                            NightsBridge Property
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="semper"
                            checked={isSemperProperty}
                            onCheckedChange={(checked) => setIsSemperProperty(checked as boolean)}
                          />
                          <Label htmlFor="semper" className="cursor-pointer">
                            Semper Property
                          </Label>
                        </div>
                      </div>

                      {isNightsBridge && (
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

                      {isSemperProperty && (
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
                    </div>
                  </CardContent>
                </Card>

                {/* Property Section */}
                <Card>
                  <CardHeader>
                    <CardTitle>Property</CardTitle>
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
                        <Label htmlFor="owner">Owner</Label>
                        <Input
                          id="owner"
                          value={formData.owner}
                          onChange={(e) => handleInputChange("owner", e.target.value)}
                          placeholder="Owner name"
                        />
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
                            <SelectTrigger id="country">
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
                          />
                        </div>
                      </div>

                      <div className="pt-4">
                        <div className="bg-muted rounded-lg p-4 text-center">
                          <MapPin className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground">
                            Map integration coming soon
                          </p>
                        </div>
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="vat_number">
                          VAT # <span className="text-destructive">*</span>
                        </Label>
                        <Input
                          id="vat_number"
                          value={formData.vat_number}
                          onChange={(e) => handleInputChange("vat_number", e.target.value)}
                          placeholder="4930161700"
                          required
                        />
                      </div>
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
                  </CardContent>
                </Card>

                <div className="flex justify-end gap-4">
                  <Button type="button" variant="outline" onClick={() => navigate("/admin")}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    <Save className="mr-2 h-4 w-4" />
                    {loading ? "Saving..." : "Save Property"}
                  </Button>
                </div>
              </form>
            </TabsContent>

            <TabsContent value="info-facilities">
              <form onSubmit={handleSubmit} className="space-y-6">
                {/* Property Info */}
                <Card>
                  <CardHeader>
                    <CardTitle>Property Info</CardTitle>
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
                        className="resize-none"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label>Stars</Label>
                      <StarRating rating={starRating} onRatingChange={setStarRating} />
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
                  <Button type="button" variant="outline" onClick={() => navigate("/admin")}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    <Save className="mr-2 h-4 w-4" />
                    {loading ? "Saving..." : "Save Property"}
                  </Button>
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
                              onChange={(e) =>
                                updateCancellationPolicy(index, "forfeit", e.target.value)
                              }
                            />
                            <Select
                              value={policy.type}
                              onValueChange={(value) =>
                                updateCancellationPolicy(index, "type", value)
                              }
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
                              onChange={(e) =>
                                updateCancellationPolicy(index, "days", e.target.value)
                              }
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
                              onClick={() =>
                                setFormData({ ...formData, pets_allowed: !formData.pets_allowed })
                              }
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
                              onClick={() =>
                                setFormData({ ...formData, check_in_24h: !formData.check_in_24h })
                              }
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
                              onChange={(e) =>
                                handleInputChange("deposit_percentage", e.target.value)
                              }
                            />
                            <span className="text-xs text-muted-foreground">Deposit amount %</span>
                          </div>
                          <div className="space-y-2">
                            <Input
                              placeholder="2"
                              value={formData.deposit_days}
                              onChange={(e) => handleInputChange("deposit_days", e.target.value)}
                            />
                            <span className="text-xs text-muted-foreground">
                              Number of days allowed for deposit
                            </span>
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
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">To</Label>
                            <Input
                              type="time"
                              value={formData.check_in_to}
                              onChange={(e) => handleInputChange("check_in_to", e.target.value)}
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
                            />
                          </div>
                          <div className="space-y-2">
                            <Label className="text-xs text-muted-foreground">To</Label>
                            <Input
                              type="time"
                              value={formData.check_out_to}
                              onChange={(e) => handleInputChange("check_out_to", e.target.value)}
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
                                onChange={(e) =>
                                  handleInputChange("children_age_from", e.target.value)
                                }
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
                  <Button type="button" variant="outline" onClick={() => navigate("/admin")}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={loading}>
                    <Save className="mr-2 h-4 w-4" />
                    {loading ? "Saving..." : "Save Property"}
                  </Button>
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
                        isDragging
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary"
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
                            <img
                              src={imageUrl}
                              alt={`Property ${index + 1}`}
                              className="w-full h-full object-cover"
                            />
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
                        {Array.from(
                          { length: Math.max(0, 12 - uploadedImages.length) },
                          (_, index) => (
                            <div
                              key={`empty-${index}`}
                              className="relative aspect-square rounded-lg border-2 border-dashed border-border bg-muted/20 flex items-center justify-center"
                            >
                              <div className="absolute top-2 right-2 bg-muted rounded-full p-1.5">
                                <X className="h-4 w-4 text-muted-foreground" />
                              </div>
                            </div>
                          )
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <div className="flex justify-end gap-4 mt-6">
                <Button type="button" variant="outline" onClick={() => navigate("/admin")}>
                  Cancel
                </Button>
                <Button type="button" disabled={loading}>
                  <Save className="mr-2 h-4 w-4" />
                  {loading ? "Saving..." : "Save Property"}
                </Button>
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
                      variant={selectedTemplate === 'confirmation-mailer' ? 'default' : 'outline'}
                      onClick={() => setSelectedTemplate('confirmation-mailer')}
                    >
                      Confirmation Mailer Template
                    </Button>
                    <Button
                      type="button"
                      variant={selectedTemplate === 'confirmation-property' ? 'default' : 'outline'}
                      onClick={() => setSelectedTemplate('confirmation-property')}
                    >
                      Confirmation Property Template
                    </Button>
                    <Button
                      type="button"
                      variant={selectedTemplate === 'pre-mailer' ? 'default' : 'outline'}
                      onClick={() => setSelectedTemplate('pre-mailer')}
                    >
                      Pre Mailer Template
                    </Button>
                    <Button
                      type="button"
                      variant={selectedTemplate === 'post-mailer' ? 'default' : 'outline'}
                      onClick={() => setSelectedTemplate('post-mailer')}
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
                <Button type="button" variant="outline" onClick={() => navigate("/admin")}>
                  Cancel
                </Button>
                <Button type="button" disabled={loading}>
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
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
                              <Label htmlFor="addon-capacity" className="cursor-pointer">Capacity</Label>
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
                                <Label htmlFor="addon-all-days" className="cursor-pointer">All days</Label>
                              </div>
                              {['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'].map((day) => (
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
                              ))}
                            </div>
                          </div>

                          <div className="flex justify-end pt-4">
                            <Button onClick={handleAddAddon}>Create</Button>
                          </div>
                        </TabsContent>

                        <TabsContent value="addon-images" className="space-y-4 mt-4">
                          <p className="text-muted-foreground">Addon images functionality coming soon...</p>
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
                              <td className="p-3">{addon.hasCapacity ? addon.capacity : '-'}</td>
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
                  {specialsCategory === 'conference' && (
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
                                ? 'bg-primary text-primary-foreground'
                                : 'bg-muted hover:bg-muted/80'
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
                                  onCheckedChange={(checked) => 
                                    setSpecialForm({ ...specialForm, isPublic: checked })
                                  }
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
                                            !specialForm.periodFrom && "text-muted-foreground"
                                          )}
                                        >
                                          <CalendarIcon className="mr-2 h-4 w-4" />
                                          {specialForm.periodFrom ? format(specialForm.periodFrom, "yyyy-MM-dd") : "2025-11-18"}
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
                                            !specialForm.periodTo && "text-muted-foreground"
                                          )}
                                        >
                                          <CalendarIcon className="mr-2 h-4 w-4" />
                                          {specialForm.periodTo ? format(specialForm.periodTo, "yyyy-MM-dd") : "2025-11-18"}
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
                                  onValueChange={(value: any) => setSpecialForm({ ...specialForm, pricingConfig: value })}
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
                                    onChange={(e) => setSpecialForm({ ...specialForm, conferenceRateType: e.target.value })}
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
                                <Button onClick={() => setIsEditSpecialOpen(false)}>
                                  Save
                                </Button>
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
                  
                  {specialsCategory === 'accommodations' && (
                    <div className="text-center py-12 text-muted-foreground">
                      Accommodation specials functionality coming soon...
                    </div>
                  )}
                  
                  {specialsCategory === 'event-wedding' && (
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
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-muted hover:bg-muted/80'
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
                          <h3 className="text-lg font-semibold text-muted-foreground">
                            Season: {season.title}
                          </h3>
                          
                          <div className="border rounded-lg p-6 space-y-4 bg-card">
                            <div className="text-center text-sm text-muted-foreground mb-4">
                              Self Catering
                            </div>
                            
                            <div className="grid grid-cols-2 gap-6 max-w-md">
                              <div className="space-y-2">
                                <Label className="text-sm font-medium">UnitRate</Label>
                                <Input 
                                  type="number" 
                                  defaultValue={season.id === '3' ? '7000' : '6500'}
                                  className="text-center"
                                />
                              </div>
                              <div className="space-y-2">
                                <Label className="text-sm font-medium">WeekendRate</Label>
                                <Input 
                                  type="number" 
                                  defaultValue="0"
                                  className="text-center"
                                />
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
                            <div className="text-center text-sm text-muted-foreground">
                              Self Catering
                            </div>
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
                    <h3 className="font-semibold text-sm">ROOM TYPES</h3>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={addRoomType}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {roomTypes.map((room) => (
                    <div
                      key={room.id}
                      className={`flex items-center justify-between p-3 rounded-md transition-colors ${
                        selectedRoomType === room.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted'
                      }`}
                    >
                      <span 
                        className="text-sm font-medium flex-1 cursor-pointer"
                        onClick={() => setSelectedRoomType(room.id)}
                      >
                        {room.name}
                      </span>
                      <div className="flex gap-1">
                        {room.url && (
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
                        )}
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-6 w-6 p-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRoomType(room.id);
                          }}
                        >
                          <Edit className="h-3 w-3" />
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
                            value={roomTypes.find(r => r.id === selectedRoomType)?.name || ''} 
                            onChange={(e) => updateRoomTypeName(selectedRoomType, e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label># of rooms for this type*</Label>
                          <Input type="number" defaultValue="9" />
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
                            value={roomTypes.find(r => r.id === selectedRoomType)?.url || ''} 
                            onChange={(e) => updateRoomTypeUrl(selectedRoomType, e.target.value)}
                          />
                          {roomTypes.find(r => r.id === selectedRoomType)?.url && (
                            <Button 
                              type="button"
                              variant="outline" 
                              size="icon"
                              onClick={() => copyRoomUrl(roomTypes.find(r => r.id === selectedRoomType)?.url || '')}
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Link to the specific room page on your property website
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>NightsBridge Room Type</Label>
                          <Input />
                        </div>
                        <div className="space-y-2">
                          <Label>NightsBridge Room ID</Label>
                          <Input defaultValue="4" />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Room Type Description</Label>
                        <Textarea 
                          rows={4}
                          defaultValue="Each holiday house comprises 2 bedrooms upstairs, each with an en-suite bathroom. Each home has a spacious living area downstairs, a fully equipped kitchen with a washing machine, and a private patio."
                        />
                      </div>

                      <div className="space-y-2">
                        <Label>Extra Person Policy</Label>
                        <Textarea rows={2} />
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Bed Configuration</Label>
                          <Select defaultValue="king-twin">
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="king-twin">King/Twin</SelectItem>
                              <SelectItem value="king">King</SelectItem>
                              <SelectItem value="twin">Twin</SelectItem>
                              <SelectItem value="queen">Queen</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Room Size (m²)*</Label>
                          <Input type="number" defaultValue="130" />
                        </div>
                        <div className="space-y-2">
                          <Label>Bathrooms*</Label>
                          <Input type="number" defaultValue="0" />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label>Max people per Room*</Label>
                          <Input type="number" defaultValue="4" />
                        </div>
                        <div className="space-y-2">
                          <Label>Max adult*</Label>
                          <Input type="number" defaultValue="4" />
                        </div>
                        <div className="space-y-2">
                          <Label>Max children*</Label>
                          <Input type="number" defaultValue="0" />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Min Stay*</Label>
                          <Input type="number" defaultValue="5" />
                        </div>
                        <div className="space-y-2">
                          <Label>Max Stay*</Label>
                          <Input type="number" defaultValue="0" />
                        </div>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-md p-3">
                        <p className="text-sm text-blue-700">
                          <strong>INFO:</strong> Please be advised that you need to align the number of "Max adult" with rate type if Person Rate is applied.
                        </p>
                      </div>

                      <div className="space-y-4">
                        <h3 className="font-semibold">Rate Info</h3>
                        <div className="space-y-2">
                          <Label>Rate Type</Label>
                          <Select defaultValue="per-unit">
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
                          <div className="flex gap-2">
                            <Badge variant="secondary" className="gap-2">
                              Self Catering
                              <X className="h-3 w-3 cursor-pointer" />
                            </Badge>
                          </div>
                        </div>
                      </div>
                    </TabsContent>

                    {/* Facilities Sub-tab */}
                    <TabsContent value="facilities" className="p-6 space-y-4">
                      <div className="flex items-center gap-4 mb-4">
                        <Select defaultValue="balcony">
                          <SelectTrigger className="w-64">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="balcony">Balcony</SelectItem>
                            <SelectItem value="terrace">Terrace</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <Checkbox id="highlight-all" />
                          <Label htmlFor="highlight-all" className="cursor-pointer">Highlight all</Label>
                        </div>
                        <Button variant="outline" size="sm">Copy</Button>
                        <Button variant="outline" size="sm">Apply</Button>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-4">
                        <p className="text-sm text-blue-700">Checked items will be highlighted.</p>
                      </div>

                      <div className="grid grid-cols-6 gap-6">
                        {/* Cooking */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Cooking</h4>
                          {['Braai/Barbeque Facilities', 'Cleaning Service', 'Coffee/tea facilities', 'DSTV/Satellite TV', 'Desk', 'Dining Table', 'Ironing board', 'Microwave', 'Non-smoking', 'Outdoor Furniture', 'Outdoor dining area', 'Oven', 'Patio', 'Refrigerator', 'Sitting area', 'Toaster', 'Two Plate Stove', 'Wake up call'].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox id={item} />
                              <Label htmlFor={item} className="text-sm cursor-pointer flex-1">{item}</Label>
                              <X className="h-3 w-3 text-muted-foreground cursor-pointer" />
                            </div>
                          ))}
                        </div>

                        {/* General */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">General</h4>
                          {['Kitchenette', 'Hairdryer', 'Shower and bath', 'Telephone'].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox id={item} />
                              <Label htmlFor={item} className="text-sm cursor-pointer flex-1">{item}</Label>
                              <X className="h-3 w-3 text-muted-foreground cursor-pointer" />
                            </div>
                          ))}
                        </div>

                        {/* Laundry */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Laundry</h4>
                          {['Airconditioned room', 'Iron', 'Washing machine'].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox id={item} />
                              <Label htmlFor={item} className="text-sm cursor-pointer flex-1">{item}</Label>
                              <X className="h-3 w-3 text-muted-foreground cursor-pointer" />
                            </div>
                          ))}
                        </div>

                        {/* Media */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Media</h4>
                          {['Flat screen TV'].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox id={item} />
                              <Label htmlFor={item} className="text-sm cursor-pointer flex-1">{item}</Label>
                              <X className="h-3 w-3 text-muted-foreground cursor-pointer" />
                            </div>
                          ))}
                        </div>

                        {/* Security */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">Security</h4>
                          {['Safe'].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox id={item} />
                              <Label htmlFor={item} className="text-sm cursor-pointer flex-1">{item}</Label>
                              <X className="h-3 w-3 text-muted-foreground cursor-pointer" />
                            </div>
                          ))}
                        </div>

                        {/* View */}
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">View</h4>
                          {['Garden view', 'Landmark view', 'Mountain view', 'Pool view', 'Terrace'].map((item) => (
                            <div key={item} className="flex items-center gap-2">
                              <Checkbox id={item} />
                              <Label htmlFor={item} className="text-sm cursor-pointer flex-1">{item}</Label>
                              <X className="h-3 w-3 text-muted-foreground cursor-pointer" />
                            </div>
                          ))}
                        </div>
                      </div>
                    </TabsContent>

                    {/* Amenities Sub-tab */}
                    <TabsContent value="amenities" className="p-6 space-y-4">
                      <div className="flex items-center gap-4 mb-4">
                        <Select defaultValue="bathrobe">
                          <SelectTrigger className="w-64">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="bathrobe">Bathrobe</SelectItem>
                            <SelectItem value="slippers">Slippers</SelectItem>
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <Checkbox id="highlight-all-amenities" />
                          <Label htmlFor="highlight-all-amenities" className="cursor-pointer">Highlight all</Label>
                        </div>
                        <Button variant="outline" size="sm">Copy</Button>
                        <Button variant="outline" size="sm">Apply</Button>
                      </div>

                      <div className="bg-blue-50 border border-blue-200 rounded-md p-2 mb-4">
                        <p className="text-sm text-blue-700">Checked items will be highlighted.</p>
                      </div>

                      <div className="space-y-3">
                        {['Bathroom amenities', 'Hand wash', 'Towels'].map((item) => (
                          <div key={item} className="flex items-center gap-2">
                            <Checkbox id={item} />
                            <Label htmlFor={item} className="text-sm cursor-pointer flex-1">{item}</Label>
                            <X className="h-3 w-3 text-muted-foreground cursor-pointer" />
                          </div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* Room Images Sub-tab */}
                    <TabsContent value="room-images" className="p-6 space-y-4">
                      <h3 className="font-semibold text-lg mb-4">ROOM TYPE IMAGES</h3>
                      <div className="grid grid-cols-6 gap-4">
                        {/* Upload slot */}
                        <div className="aspect-video border-2 border-dashed border-primary/50 rounded-lg flex flex-col items-center justify-center bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors">
                          <Upload className="h-8 w-8 text-primary mb-2" />
                          <p className="text-xs text-center text-muted-foreground px-2">
                            Click or Drag and drop image to upload
                          </p>
                        </div>

                        {/* Placeholder empty slots */}
                        {Array.from({ length: 11 }).map((_, i) => (
                          <div key={i} className="aspect-video border-2 border-dashed border-border rounded-lg bg-muted/20"></div>
                        ))}
                      </div>
                    </TabsContent>

                    {/* Agreement Sub-tab */}
                    <TabsContent value="agreement" className="p-6 space-y-4">
                      <div className="space-y-2">
                        <Label>Split %</Label>
                        <Input type="number" defaultValue="0" className="max-w-xs" />
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
          </Tabs>
        </div>
      </div>
    </>
  );
}
