import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { z } from "zod";
import { Home, Building2, MapPin, Save } from "lucide-react";

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
  });

  const handleInputChange = (field: keyof PropertyFormData, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
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
        external_system: isNightsBridge ? "nightsbridge" : isSemperProperty ? "semper" : null,
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
              <TabsTrigger value="facilities" className="gap-2" disabled>
                <Building2 className="h-4 w-4" />
                Property Info & Facilities
              </TabsTrigger>
              <TabsTrigger value="location" className="gap-2" disabled>
                <MapPin className="h-4 w-4" />
                Room Information
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
                          onCheckedChange={(checked) => setIsVenues(checked as boolean)}
                        />
                        <Label htmlFor="venues" className="cursor-pointer">
                          Venues
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="event"
                          checked={isEvent}
                          onCheckedChange={(checked) => setIsEvent(checked as boolean)}
                        />
                        <Label htmlFor="event" className="cursor-pointer">
                          Event/Wedding
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="conference"
                          checked={isConference}
                          onCheckedChange={(checked) => setIsConference(checked as boolean)}
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
                            onCheckedChange={(checked) => {
                              setIsNightsBridge(checked as boolean);
                              if (checked) setIsSemperProperty(false);
                            }}
                          />
                          <Label htmlFor="nightsbridge" className="cursor-pointer">
                            NightsBridge Property
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="semper"
                            checked={isSemperProperty}
                            onCheckedChange={(checked) => {
                              setIsSemperProperty(checked as boolean);
                              if (checked) setIsNightsBridge(false);
                            }}
                          />
                          <Label htmlFor="semper" className="cursor-pointer">
                            Semper Property
                          </Label>
                        </div>
                      </div>

                      {(isNightsBridge || isSemperProperty) && (
                        <div className="max-w-xs">
                          <Label htmlFor="bb_id">BB ID</Label>
                          <Input
                            id="bb_id"
                            value={formData.bb_id}
                            onChange={(e) => handleInputChange("bb_id", e.target.value)}
                            placeholder="Enter BB ID"
                          />
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
