import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { FACILITY_CATEGORIES } from "@/config/onboardingFieldSchema";
import { StepProps } from "./types";
import { 
  Building2, Trees, Heart, Utensils, Users, Shield, Accessibility, Compass, Eye
} from "lucide-react";

const CATEGORY_CONFIG = {
  general: { label: "General", icon: Building2 },
  outdoor: { label: "Outdoor", icon: Trees },
  wellness: { label: "Wellness & Spa", icon: Heart },
  dining: { label: "Dining & Kitchen", icon: Utensils },
  activities: { label: "Activities", icon: Compass },
  family: { label: "Family Friendly", icon: Users },
  accessibility: { label: "Accessibility", icon: Accessibility },
  security: { label: "Safety & Security", icon: Shield },
  view: { label: "View", icon: Eye }
} as const;

const FACILITY_LABELS: Record<string, string> = {
  // General
  wifi: "WiFi",
  parking: "Parking",
  reception_24h: "24h Reception",
  concierge: "Concierge",
  luggage_storage: "Luggage Storage",
  business_center: "Business Center",
  laundry: "Laundry Service",
  dry_cleaning: "Dry Cleaning",
  ironing: "Ironing Service",
  non_smoking_rooms: "Non-Smoking Rooms",
  air_conditioning: "Air Conditioning",
  // Outdoor
  garden: "Garden",
  terrace: "Terrace",
  bbq: "BBQ/Braai",
  outdoor_furniture: "Outdoor Furniture",
  outdoor_pool: "Outdoor Pool",
  beach: "Beach",
  beach_access: "Beach Access",
  sun_loungers: "Sun Loungers",
  playground: "Playground",
  // Wellness
  spa: "Spa",
  sauna: "Sauna",
  gym: "Gym/Fitness Center",
  massage: "Massage Services",
  indoor_pool: "Indoor Pool",
  jacuzzi: "Jacuzzi/Hot Tub",
  steam_room: "Steam Room",
  yoga_classes: "Yoga Classes",
  kids_pool: "Kids Pool",
  // Dining
  restaurant: "Restaurant",
  bar: "Bar",
  room_service: "Room Service",
  breakfast_included: "Breakfast Included",
  breakfast_in_room: "Breakfast in Room",
  kitchen: "Kitchen",
  shared_kitchen: "Shared Kitchen",
  coffee_machine: "Coffee Machine",
  coffee_house: "Coffee House",
  minibar: "Minibar",
  wine_champagne: "Wine/Champagne",
  kids_meals: "Kids Meals",
  // Activities
  game_drives: "Game Drives",
  walking_tours: "Walking Tours",
  bike_tours: "Bike Tours",
  live_music: "Live Music/Entertainment",
  golf_course: "Golf Course",
  water_sports: "Water Sports",
  hiking: "Hiking",
  cycling: "Cycling",
  fishing: "Fishing",
  horseback_riding: "Horseback Riding",
  // Family
  kids_club: "Kids Club",
  babysitting: "Babysitting",
  crib: "Crib/Cot",
  high_chair: "High Chair",
  family_rooms: "Family Rooms",
  game_room: "Game Room",
  // Accessibility
  wheelchair_accessible: "Wheelchair Accessible",
  elevator: "Elevator",
  accessible_parking: "Accessible Parking",
  accessible_bathroom: "Accessible Bathroom",
  braille_signage: "Braille Signage",
  // Security
  cctv: "CCTV",
  safe: "Safe",
  security_guard: "Security Guard",
  fire_extinguisher: "Fire Extinguisher",
  smoke_detector: "Smoke Detector",
  first_aid_kit: "First Aid Kit",
  carbon_monoxide_detector: "Carbon Monoxide Detector",
  // View
  sea_view: "Sea View",
  mountain_view: "Mountain View",
  garden_view: "Garden View",
  pool_view: "Pool View",
  city_view: "City View",
  lake_view: "Lake View",
  river_view: "River View",
  courtyard_view: "Courtyard View"
};

export function StepFacilities({
  updateField,
  getAmenityValue
}: StepProps) {
  const facilities = getAmenityValue<string[]>("facilities", []);

  const handleFacilityChange = (facility: string, checked: boolean) => {
    const newFacilities = checked
      ? [...facilities, facility]
      : facilities.filter(f => f !== facility);
    updateField("amenities.facilities", newFacilities);
  };

  const selectAll = (category: keyof typeof FACILITY_CATEGORIES) => {
    const categoryFacilities = FACILITY_CATEGORIES[category];
    const newFacilities = [...new Set([...facilities, ...categoryFacilities])];
    updateField("amenities.facilities", newFacilities);
  };

  const deselectAll = (category: keyof typeof FACILITY_CATEGORIES) => {
    const categoryFacilities = FACILITY_CATEGORIES[category];
    const newFacilities = facilities.filter(f => !categoryFacilities.includes(f as never));
    updateField("amenities.facilities", newFacilities);
  };

  return (
    <div className="space-y-8">
      <div>
        <p className="text-muted-foreground">
          Select all facilities and amenities available at your property. 
          This helps guests find properties that match their needs.
        </p>
        <p className="text-sm text-primary font-medium mt-2">
          {facilities.length} facilities selected
        </p>
      </div>

      {(Object.entries(FACILITY_CATEGORIES) as [keyof typeof FACILITY_CATEGORIES, readonly string[]][]).map(
        ([category, items]) => {
          const config = CATEGORY_CONFIG[category];
          const Icon = config.icon;
          const categoryCount = items.filter(f => facilities.includes(f)).length;

          return (
            <div key={category} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-medium flex items-center gap-2">
                  <Icon className="h-4 w-4 text-primary" />
                  {config.label}
                  <span className="text-xs text-muted-foreground font-normal">
                    ({categoryCount}/{items.length})
                  </span>
                </h3>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => selectAll(category)}
                    className="text-xs text-primary hover:underline"
                  >
                    Select all
                  </button>
                  <span className="text-muted-foreground">|</span>
                  <button
                    type="button"
                    onClick={() => deselectAll(category)}
                    className="text-xs text-muted-foreground hover:underline"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {items.map((facility) => (
                  <div
                    key={facility}
                    className="flex items-center space-x-2 rounded-lg border p-2.5 hover:bg-muted/30 transition-colors"
                  >
                    <Checkbox
                      id={`facility-${facility}`}
                      checked={facilities.includes(facility)}
                      onCheckedChange={(checked) => handleFacilityChange(facility, checked === true)}
                    />
                    <Label
                      htmlFor={`facility-${facility}`}
                      className="cursor-pointer text-sm leading-tight"
                    >
                      {FACILITY_LABELS[facility] || facility}
                    </Label>
                  </div>
                ))}
              </div>
            </div>
          );
        }
      )}
    </div>
  );
}
