import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { PROPERTY_TYPES } from "@/config/onboardingFieldSchema";
import { StepProps } from "./types";

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "Apartments",
  bed_and_breakfast: "Bed & Breakfast",
  boutique_hotel: "Boutique Hotel",
  guest_house: "Guest House",
  hotel: "Hotel",
  lodge: "Lodge",
  self_catering: "Self Catering",
  villa: "Villa",
  other: "Other"
};

const STAR_GRADING_OPTIONS = [
  { value: "tgcsa_1", label: "TGCSA 1 Star" },
  { value: "tgcsa_2", label: "TGCSA 2 Star" },
  { value: "tgcsa_3", label: "TGCSA 3 Star" },
  { value: "tgcsa_4", label: "TGCSA 4 Star" },
  { value: "tgcsa_5", label: "TGCSA 5 Star" },
  { value: "none", label: "Not Graded" }
];

export function StepPropertyIdentity({
  propertyData,
  updateField,
  isPMSManaged,
  getAmenityValue
}: StepProps) {
  const isPMSName = isPMSManaged("name");
  const isPMSType = isPMSManaged("property_type");
  const isPMSUrl = isPMSManaged("property_url");

  const numberOfFloors = getAmenityValue<number | null>("number_of_floors", null);
  const starGrading = getAmenityValue<string>("star_grading", "");
  const tripadvisorId = getAmenityValue<string>("tripadvisor_id", "");
  const pmsName = getAmenityValue<string>("pms_name", "");
  const channelManager = getAmenityValue<string>("channel_manager", "");

  return (
    <div className="space-y-6">
      {/* Property Name */}
      <div className="space-y-2">
        <Label htmlFor="name" className="flex items-center gap-2">
          Property Name *
          {isPMSName && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              PMS managed
            </span>
          )}
        </Label>
        <Input
          id="name"
          value={propertyData.name || ""}
          onChange={(e) => updateField("name", e.target.value)}
          placeholder="Enter your property name"
          className="text-lg"
        />
        <p className="text-xs text-muted-foreground">
          This is how your property will appear on RoomsOnline
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Property Type */}
        <div className="space-y-2">
          <Label htmlFor="property_type" className="flex items-center gap-2">
            Property Type *
            {isPMSType && (
              <span className="text-xs text-amber-600 flex items-center gap-1">
                <AlertTriangle className="h-3 w-3" />
                PMS managed
              </span>
            )}
          </Label>
          <Select
            value={propertyData.property_type || ""}
            onValueChange={(value) => updateField("property_type", value)}
          >
            <SelectTrigger id="property_type">
              <SelectValue placeholder="Select property type" />
            </SelectTrigger>
            <SelectContent>
              {PROPERTY_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {PROPERTY_TYPE_LABELS[type] || type}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Number of Floors */}
        <div className="space-y-2">
          <Label htmlFor="number_of_floors">Number of Floors</Label>
          <Input
            id="number_of_floors"
            type="number"
            min={1}
            max={100}
            value={numberOfFloors || ""}
            onChange={(e) => updateField("amenities.number_of_floors", e.target.value ? parseInt(e.target.value) : null)}
            placeholder="e.g., 3"
          />
        </div>
      </div>

      {/* Star Grading */}
      <div className="space-y-2">
        <Label htmlFor="star_grading">Star Grading (TGCSA)</Label>
        <Select
          value={starGrading}
          onValueChange={(value) => updateField("amenities.star_grading", value)}
        >
          <SelectTrigger id="star_grading">
            <SelectValue placeholder="Select star grading" />
          </SelectTrigger>
          <SelectContent>
            {STAR_GRADING_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-xs text-muted-foreground">
          Tourism Grading Council of South Africa rating (if applicable)
        </p>
      </div>

      {/* Property Website */}
      <div className="space-y-2">
        <Label htmlFor="property_url" className="flex items-center gap-2">
          Property Website
          {isPMSUrl && (
            <span className="text-xs text-amber-600 flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              PMS managed
            </span>
          )}
        </Label>
        <Input
          id="property_url"
          type="url"
          value={propertyData.property_url || ""}
          onChange={(e) => updateField("property_url", e.target.value)}
          placeholder="https://www.yourproperty.com"
        />
      </div>

      {/* TripAdvisor ID */}
      <div className="space-y-2">
        <Label htmlFor="tripadvisor_id">TripAdvisor ID</Label>
        <Input
          id="tripadvisor_id"
          value={tripadvisorId}
          onChange={(e) => updateField("amenities.tripadvisor_id", e.target.value)}
          placeholder="e.g., d123456"
        />
        <p className="text-xs text-muted-foreground">
          Your TripAdvisor location ID for review integration
        </p>
      </div>

      {/* Systems Section */}
      <div className="space-y-4 pt-4 border-t">
        <h3 className="font-medium text-sm text-muted-foreground">Systems & Integrations</h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* Property Management System */}
          <div className="space-y-2">
            <Label htmlFor="pms_name">Property Management System</Label>
            <Input
              id="pms_name"
              value={pmsName}
              onChange={(e) => updateField("amenities.pms_name", e.target.value)}
              placeholder="e.g., Hostfully, NightsBridge"
            />
          </div>

          {/* Channel Manager */}
          <div className="space-y-2">
            <Label htmlFor="channel_manager">Channel Manager</Label>
            <Input
              id="channel_manager"
              value={channelManager}
              onChange={(e) => updateField("amenities.channel_manager", e.target.value)}
              placeholder="e.g., SiteMinder, Cloudbeds"
            />
          </div>
        </div>
      </div>

      {/* PMS Warning */}
      {(isPMSName || isPMSType || isPMSUrl) && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            Some fields might be managed by your PMS. Changes made here may be overwritten during the next sync.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
