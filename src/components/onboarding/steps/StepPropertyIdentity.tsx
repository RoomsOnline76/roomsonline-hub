import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { AlertTriangle, ChevronDown, Building2, Sparkles, Briefcase, Globe, X } from "lucide-react";
import { PROPERTY_TYPES, OnboardingOfferings } from "@/config/onboardingFieldSchema";
import { StepProps } from "./types";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { VISIBLE_PMS_SYSTEMS } from "@/lib/pmsSystemsConfig";
import { Badge } from "@/components/ui/badge";

// Separate PMS vs Channel Manager systems
const PMS_OPTIONS = VISIBLE_PMS_SYSTEMS.filter(s => !s.isInternal && !['siteminder', 'rentalsunited'].includes(s.key));
const CHANNEL_MANAGER_OPTIONS = VISIBLE_PMS_SYSTEMS.filter(s => ['siteminder', 'rentalsunited', 'profitroom'].includes(s.key));

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

const OFFERING_OPTIONS = [
  { key: "accommodation", label: "Accommodation", description: "Overnight stays" },
  { key: "venue", label: "Venue Hire", description: "Private events" },
  { key: "event", label: "Events & Weddings", description: "Celebrations" },
  { key: "conference", label: "Conferencing", description: "Business meetings" }
] as const;

export function StepPropertyIdentity({
  propertyData,
  updateField,
  isPMSManaged,
  getAmenityValue
}: StepProps) {
  const [openSections, setOpenSections] = useState({
    basics: true,
    offerings: true,
    business: false,
    online: false
  });

  const isPMSName = isPMSManaged("name");
  const isPMSType = isPMSManaged("property_type");
  const isPMSUrl = isPMSManaged("property_url");

  const numberOfFloors = getAmenityValue<number | null>("number_of_floors", null);
  const starGrading = getAmenityValue<string>("star_grading", "");
  const tripadvisorId = getAmenityValue<string>("tripadvisor_id", "");
  const pmsSystems = getAmenityValue<string[]>("pms_systems", []);
  const channelManagers = getAmenityValue<string[]>("channel_managers", []);
  const [pmsOpen, setPmsOpen] = useState(false);
  const [cmOpen, setCmOpen] = useState(false);

  const togglePmsSystem = (key: string) => {
    const updated = pmsSystems.includes(key)
      ? pmsSystems.filter(k => k !== key)
      : [...pmsSystems, key];
    updateField("amenities.pms_systems", updated);
    // Backward compat
    updateField("amenities.pms_name", updated[0] ? VISIBLE_PMS_SYSTEMS.find(s => s.key === updated[0])?.name || "" : "");
  };

  const toggleChannelManager = (key: string) => {
    const updated = channelManagers.includes(key)
      ? channelManagers.filter(k => k !== key)
      : [...channelManagers, key];
    updateField("amenities.channel_managers", updated);
    updateField("amenities.channel_manager", updated[0] ? VISIBLE_PMS_SYSTEMS.find(s => s.key === updated[0])?.name || "" : "");
  };

  // Business Registration
  const registeredBusinessName = getAmenityValue<string>("registered_business_name", "");
  const registrationNumber = getAmenityValue<string>("registration_number", "");
  const vatNumber = getAmenityValue<string>("vat_number", "");
  const postalAddress = getAmenityValue<string>("postal_address", "");

  // Offerings
  const offerings = getAmenityValue<OnboardingOfferings>("offerings", {
    accommodation: true,
    venue: false,
    event: false,
    conference: false
  });

  const handleOfferingChange = (key: keyof OnboardingOfferings, checked: boolean) => {
    const newOfferings = { ...offerings, [key]: checked };
    updateField("amenities.offerings", newOfferings);
  };

  const toggleSection = (section: keyof typeof openSections) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  return (
    <div className="space-y-4">
      {/* Property Basics */}
      <Collapsible open={openSections.basics} onOpenChange={() => toggleSection("basics")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" />
            <span className="font-medium">Property Basics</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.basics && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          {/* Property Name */}
          <div className="space-y-2">
            <Label htmlFor="name" className="flex items-center gap-2">
              Property Name *
              {isPMSName && (
                <span className="text-xs text-amber-600 flex items-center gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  PMS
                </span>
              )}
            </Label>
            <Input
              id="name"
              value={propertyData.name || ""}
              onChange={(e) => updateField("name", e.target.value)}
              placeholder="Enter your property name"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Property Type */}
            <div className="space-y-2">
              <Label htmlFor="property_type" className="flex items-center gap-2">
                Type *
                {isPMSType && <AlertTriangle className="h-3 w-3 text-amber-600" />}
              </Label>
              <Select
                value={propertyData.property_type || ""}
                onValueChange={(value) => updateField("property_type", value)}
              >
                <SelectTrigger id="property_type">
                  <SelectValue placeholder="Select type" />
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
              <Label htmlFor="number_of_floors">Floors</Label>
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
                <SelectValue placeholder="Select grading" />
              </SelectTrigger>
              <SelectContent>
                {STAR_GRADING_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* What You Offer */}
      <Collapsible open={openSections.offerings} onOpenChange={() => toggleSection("offerings")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium">What You Offer</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.offerings && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3">
          <div className="grid grid-cols-2 gap-2">
            {OFFERING_OPTIONS.map(({ key, label, description }) => (
              <div
                key={key}
                className="flex items-center space-x-3 rounded-lg border p-3 hover:bg-muted/30 transition-colors"
              >
                <Checkbox
                  id={`offering-${key}`}
                  checked={offerings[key as keyof OnboardingOfferings] || false}
                  onCheckedChange={(checked) => 
                    handleOfferingChange(key as keyof OnboardingOfferings, checked === true)
                  }
                />
                <div className="flex-1 min-w-0">
                  <Label htmlFor={`offering-${key}`} className="cursor-pointer text-sm font-medium">
                    {label}
                  </Label>
                  <p className="text-xs text-muted-foreground truncate">{description}</p>
                </div>
              </div>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Business Details */}
      <Collapsible open={openSections.business} onOpenChange={() => toggleSection("business")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Briefcase className="h-4 w-4 text-primary" />
            <span className="font-medium">Business Details</span>
            <span className="text-xs text-muted-foreground">(Optional)</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.business && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="registered_business_name">Registered Business Name</Label>
            <Input
              id="registered_business_name"
              value={registeredBusinessName}
              onChange={(e) => updateField("amenities.registered_business_name", e.target.value)}
              placeholder="e.g., Coral Tree Cottages (Pty) Ltd"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="registration_number">Registration No.</Label>
              <Input
                id="registration_number"
                value={registrationNumber}
                onChange={(e) => updateField("amenities.registration_number", e.target.value)}
                placeholder="e.g., 2018/123456/07"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vat_number">VAT Number</Label>
              <Input
                id="vat_number"
                value={vatNumber}
                onChange={(e) => updateField("amenities.vat_number", e.target.value)}
                placeholder="e.g., 4123456789"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="postal_address">Postal Address</Label>
            <Textarea
              id="postal_address"
              value={postalAddress}
              onChange={(e) => updateField("amenities.postal_address", e.target.value)}
              placeholder="PO Box 123, Town, 6600"
              rows={2}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>

      {/* Online Presence */}
      <Collapsible open={openSections.online} onOpenChange={() => toggleSection("online")}>
        <CollapsibleTrigger className="flex items-center justify-between w-full p-3 rounded-lg border hover:bg-muted/50 transition-colors">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-primary" />
            <span className="font-medium">Online Presence</span>
            <span className="text-xs text-muted-foreground">(Optional)</span>
          </div>
          <ChevronDown className={cn("h-4 w-4 transition-transform", openSections.online && "rotate-180")} />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-3 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="property_url" className="flex items-center gap-2">
              Website
              {isPMSUrl && <AlertTriangle className="h-3 w-3 text-amber-600" />}
            </Label>
            <Input
              id="property_url"
              type="url"
              value={propertyData.property_url || ""}
              onChange={(e) => updateField("property_url", e.target.value)}
              placeholder="https://www.yourproperty.com"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tripadvisor_id">TripAdvisor ID</Label>
            <Input
              id="tripadvisor_id"
              value={tripadvisorId}
              onChange={(e) => updateField("amenities.tripadvisor_id", e.target.value)}
              placeholder="e.g., d123456"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="pms_name">PMS</Label>
              <Input
                id="pms_name"
                value={pmsName}
                onChange={(e) => updateField("amenities.pms_name", e.target.value)}
                placeholder="e.g., Hostfully"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="channel_manager">Channel Manager</Label>
              <Input
                id="channel_manager"
                value={channelManager}
                onChange={(e) => updateField("amenities.channel_manager", e.target.value)}
                placeholder="e.g., SiteMinder"
              />
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>

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
