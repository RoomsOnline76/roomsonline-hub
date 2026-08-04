import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MapPin, Loader2, AlertTriangle, CheckCircle, Building2, ChevronsUpDown, Check } from "lucide-react";
import { StepProps } from "./types";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { COUNTRY_OPTIONS } from "@/lib/countries";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { RuLocationPicker } from "@/components/property/RuLocationPicker";

/** RU nationality/country fields use LocationTypeID = 2 (see CompanyInformationCard). */
const RU_COUNTRY_TYPE_FILTER = [2];

export function StepLocation({
  propertyData,
  updateField,
  isPMSManaged,
  getAmenityValue
}: StepProps) {
  const { toast } = useToast();
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [countryOpen, setCountryOpen] = useState(false);

  const isPMSAddress = isPMSManaged("address");
  const isPMSCity = isPMSManaged("city");
  const isPMSCountry = isPMSManaged("country");

  const hasCoordinates = propertyData.latitude && propertyData.longitude;

  // Property info object for surroundings (matches PropertyForm / GeneralTab structure)
  const propertyInfo = getAmenityValue<Record<string, string>>("property_info", {});
  const restaurantsCafes = propertyInfo?.restaurants_cafes || "";
  const restaurantsCafesDistance = propertyInfo?.restaurants_cafes_distance || "";
  const publicTransport = propertyInfo?.public_transport || "";
  const publicTransportDistance = propertyInfo?.public_transport_distance || "";
  const closestAirport = propertyInfo?.closest_airport || "";
  const closestAirportDistance = propertyInfo?.closest_airport_distance || "";

  // RU LocationID + region (company push)
  const ruLocationId = getAmenityValue<number | null>("ru_location_id", null);
  const region = getAmenityValue<string>("region", "");

  // Helper to update property_info fields
  const updatePropertyInfo = (field: string, value: string) => {
    const currentPropertyInfo = getAmenityValue<Record<string, string>>("property_info", {});
    const updatedPropertyInfo = { ...currentPropertyInfo, [field]: value };
    updateField("amenities.property_info", updatedPropertyInfo);
  };

  const handleGeocode = async () => {
    if (!propertyData.address || !propertyData.city) {
      toast({
        title: "Address required",
        description: "Please enter an address and city first",
        variant: "destructive"
      });
      return;
    }

    setIsGeocoding(true);

    try {
      const fullAddress = `${propertyData.address}, ${propertyData.city}, ${propertyData.country || ""}`;
      
      const { data, error } = await supabase.functions.invoke("geocode-property", {
        body: { address: fullAddress }
      });

      if (error) throw error;

      if (data?.latitude && data?.longitude) {
        updateField("latitude", data.latitude);
        updateField("longitude", data.longitude);
        
        toast({
          title: "Location found",
          description: "Coordinates have been updated"
        });
      } else {
        toast({
          title: "Location not found",
          description: "Could not find coordinates for this address",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error("Geocoding error:", error);
      toast({
        title: "Geocoding failed",
        description: "Could not look up coordinates. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsGeocoding(false);
    }
  };

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Enter your property's address. We'll use this to show your location on the map 
        and help guests find you. The RU LocationID is required for channel distribution.
      </p>

      {/* Street Address */}
      <div className="space-y-2">
        <Label htmlFor="address" className="flex items-center gap-2">
          Street Address *
          {isPMSAddress && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              PMS managed
            </span>
          )}
        </Label>
        <Input
          id="address"
          value={propertyData.address || ""}
          onChange={(e) => updateField("address", e.target.value)}
          placeholder="123 Main Road"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* City */}
        <div className="space-y-2">
          <Label htmlFor="city" className="flex items-center gap-2">
            City *
            {isPMSCity && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                PMS managed
              </span>
            )}
          </Label>
          <Input
            id="city"
            value={propertyData.city || ""}
            onChange={(e) => updateField("city", e.target.value)}
            placeholder="Cape Town"
          />
        </div>

        {/* Country (display label) */}
        <div className="space-y-2">
          <Label htmlFor="country" className="flex items-center gap-2">
            Country *
            {isPMSCountry && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                PMS managed
              </span>
            )}
          </Label>
          <Popover open={countryOpen} onOpenChange={setCountryOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={countryOpen}
                className="w-full justify-between font-normal"
              >
                {propertyData.country
                  ? COUNTRY_OPTIONS.find((c) => c.label === propertyData.country)?.label || propertyData.country
                  : "Select country..."}
                <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
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
                          updateField("country", c.label);
                          setCountryOpen(false);
                        }}
                      >
                        <Check className={cn("mr-2 h-4 w-4", propertyData.country === c.label ? "opacity-100" : "opacity-0")} />
                        {c.label}
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Region / province — used by companyProfile.region for RU */}
      <div className="space-y-2">
        <Label htmlFor="region">Region / Province *</Label>
        <Input
          id="region"
          value={region}
          onChange={(e) => updateField("amenities.region", e.target.value)}
          placeholder="e.g., Western Cape"
        />
        <p className="text-xs text-muted-foreground">
          Full province or state name as registered (not an abbreviation).
        </p>
      </div>

      {/* RU LocationID — genuine LocationID for property + company push */}
      <div className="space-y-2 rounded-lg border border-border bg-muted/30 p-3">
        <Label className="flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          Rentals United Location *
        </Label>
        <RuLocationPicker
          value={ruLocationId}
          onChange={(id) => updateField("amenities.ru_location_id", id)}
          typeFilter={RU_COUNTRY_TYPE_FILTER}
          initialQuery={propertyData.city || propertyData.country || ""}
          placeholder="Search RU locations (country / region / city)…"
          allowRefresh={false}
        />
        <p className="text-xs text-muted-foreground">
          Attaches a real RU LocationID. RU owns the currency on the LocationID — this selection decides which currency the property is locked into for channels.
        </p>
      </div>

      {/* Geocode button and coordinates */}
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleGeocode}
            disabled={isGeocoding || !propertyData.address || !propertyData.city}
            className="gap-2"
          >
            {isGeocoding ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MapPin className="h-4 w-4" />
            )}
            {hasCoordinates ? "Update Coordinates" : "Get Coordinates"}
          </Button>

          {hasCoordinates && (
            <span className="flex items-center gap-1.5 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              Location set
            </span>
          )}
        </div>

        {hasCoordinates && (
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="latitude" className="text-xs text-muted-foreground">
                Latitude
              </Label>
              <Input
                id="latitude"
                type="number"
                step="any"
                value={propertyData.latitude || ""}
                onChange={(e) => updateField("latitude", parseFloat(e.target.value) || null)}
                className="text-sm"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="longitude" className="text-xs text-muted-foreground">
                Longitude
              </Label>
              <Input
                id="longitude"
                type="number"
                step="any"
                value={propertyData.longitude || ""}
                onChange={(e) => updateField("longitude", parseFloat(e.target.value) || null)}
                className="text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* Surroundings Section — dense name + distance pairs (matches GeneralTab) */}
      <div className="space-y-4 pt-4 border-t">
        <div className="flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Surroundings</h3>
        </div>
        <p className="text-sm text-muted-foreground">
          Name and approximate distance to nearby amenities and transport.
        </p>

        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="restaurants_cafes">Restaurants & Cafés</Label>
              <Input
                id="restaurants_cafes"
                value={restaurantsCafes}
                onChange={(e) => updatePropertyInfo("restaurants_cafes", e.target.value)}
                placeholder="e.g., Waterfront restaurants"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="restaurants_cafes_distance">Distance</Label>
              <Input
                id="restaurants_cafes_distance"
                value={restaurantsCafesDistance}
                onChange={(e) => updatePropertyInfo("restaurants_cafes_distance", e.target.value)}
                placeholder="e.g., 0.5 km"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="public_transport">Public Transport</Label>
              <Input
                id="public_transport"
                value={publicTransport}
                onChange={(e) => updatePropertyInfo("public_transport", e.target.value)}
                placeholder="e.g., MyCiTi bus stop"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="public_transport_distance">Distance</Label>
              <Input
                id="public_transport_distance"
                value={publicTransportDistance}
                onChange={(e) => updatePropertyInfo("public_transport_distance", e.target.value)}
                placeholder="e.g., 1.2 km"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="closest_airport">Closest Airport</Label>
              <Input
                id="closest_airport"
                value={closestAirport}
                onChange={(e) => updatePropertyInfo("closest_airport", e.target.value)}
                placeholder="e.g., Cape Town International"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="closest_airport_distance">Distance</Label>
              <Input
                id="closest_airport_distance"
                value={closestAirportDistance}
                onChange={(e) => updatePropertyInfo("closest_airport_distance", e.target.value)}
                placeholder="e.g., 45 km"
              />
            </div>
          </div>
        </div>
      </div>

      {/* PMS Warning */}
      {(isPMSAddress || isPMSCity || isPMSCountry) && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            Location fields might be managed by your PMS. Changes may be overwritten during sync.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
