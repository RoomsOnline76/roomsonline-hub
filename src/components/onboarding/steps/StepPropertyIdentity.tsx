import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertTriangle } from "lucide-react";
import { PROPERTY_TYPES } from "@/config/onboardingFieldSchema";
import { StepProps } from "./types";

const PROPERTY_TYPE_LABELS: Record<string, string> = {
  apartment: "Apartment",
  bed_and_breakfast: "Bed & Breakfast",
  boutique_hotel: "Boutique Hotel",
  guest_house: "Guest House",
  hotel: "Hotel",
  lodge: "Lodge",
  self_catering: "Self Catering",
  villa: "Villa",
  other: "Other"
};

export function StepPropertyIdentity({
  propertyData,
  updateField,
  isPMSManaged
}: StepProps) {
  const isPMSName = isPMSManaged("name");
  const isPMSType = isPMSManaged("property_type");
  const isPMSUrl = isPMSManaged("property_url");

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
        <p className="text-xs text-muted-foreground">
          Choose the category that best describes your property
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
        <p className="text-xs text-muted-foreground">
          Your property's official website (optional)
        </p>
      </div>

      {/* PMS Warning */}
      {(isPMSName || isPMSType || isPMSUrl) && (
        <Alert className="border-amber-200 bg-amber-50">
          <AlertTriangle className="h-4 w-4 text-amber-600" />
          <AlertDescription className="text-amber-800 text-sm">
            Some fields are managed by your PMS. Changes made here may be overwritten during the next sync.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
