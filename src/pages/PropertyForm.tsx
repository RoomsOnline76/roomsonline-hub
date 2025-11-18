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
import { Home, Building2, MapPin, Save, Info, Image, DollarSign, Bell, Package, Calendar, X, Plus, Minus, FileText, Check } from "lucide-react";
import { StarRating } from "@/components/StarRating";

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
              <TabsTrigger value="images" className="gap-2" disabled>
                <Image className="h-4 w-4" />
                Property Images
              </TabsTrigger>
              <TabsTrigger value="rooms" className="gap-2" disabled>
                <Info className="h-4 w-4" />
                Room Information
              </TabsTrigger>
              <TabsTrigger value="rates" className="gap-2" disabled>
                <DollarSign className="h-4 w-4" />
                Rate Breakdown
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
          </Tabs>
        </div>
      </div>
    </>
  );
}
