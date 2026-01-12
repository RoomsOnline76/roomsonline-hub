import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Bed, Users, PartyPopper, Presentation } from "lucide-react";
import { StepProps } from "./types";
import { OnboardingOfferings } from "@/config/onboardingFieldSchema";

const OFFERING_OPTIONS = [
  {
    key: "accommodation",
    label: "Accommodation",
    description: "Overnight stays with rooms or units",
    icon: Bed
  },
  {
    key: "venue",
    label: "Venue Hire",
    description: "Rent the property for private events",
    icon: Users
  },
  {
    key: "event",
    label: "Events & Weddings",
    description: "Host weddings, parties, or celebrations",
    icon: PartyPopper
  },
  {
    key: "conference",
    label: "Conferencing",
    description: "Business meetings and corporate events",
    icon: Presentation
  }
] as const;

export function StepOfferings({
  updateField,
  getAmenityValue
}: StepProps) {
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

  return (
    <div className="space-y-6">
      <p className="text-muted-foreground">
        Select all the services your property offers. This helps guests find you 
        when searching for specific experiences.
      </p>

      <div className="grid gap-4">
        {OFFERING_OPTIONS.map(({ key, label, description, icon: Icon }) => (
          <div
            key={key}
            className="flex items-start space-x-4 rounded-lg border p-4 hover:bg-muted/30 transition-colors"
          >
            <Checkbox
              id={`offering-${key}`}
              checked={offerings[key as keyof OnboardingOfferings] || false}
              onCheckedChange={(checked) => 
                handleOfferingChange(key as keyof OnboardingOfferings, checked === true)
              }
              className="mt-1"
            />
            <div className="flex-1">
              <Label
                htmlFor={`offering-${key}`}
                className="flex items-center gap-2 cursor-pointer text-base font-medium"
              >
                <Icon className="h-4 w-4 text-primary" />
                {label}
              </Label>
              <p className="text-sm text-muted-foreground mt-0.5">
                {description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Info */}
      <div className="rounded-lg border bg-muted/30 p-4">
        <h4 className="font-medium text-sm mb-2">Tip</h4>
        <p className="text-sm text-muted-foreground">
          Selecting multiple offerings increases your visibility. Even if you primarily 
          focus on accommodation, consider adding venue hire if your property can host 
          small events.
        </p>
      </div>
    </div>
  );
}
