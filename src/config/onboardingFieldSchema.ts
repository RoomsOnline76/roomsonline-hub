/**
 * Property Onboarding Wizard - Canonical Field Schema
 * Auto-generated from canonical_field_schema.json
 * 
 * This file defines the structure and validation for all wizard fields,
 * mapping them to their database locations and providing metadata for
 * the wizard UI.
 * 
 * REORGANIZED: 12 steps → 9 steps for streamlined UX
 */

export const WIZARD_VERSION = "2.0";

export const PROPERTY_TYPES = [
  "apartment",
  "bed_and_breakfast", 
  "boutique_hotel",
  "guest_house",
  "hotel",
  "lodge",
  "self_catering",
  "villa",
  "other"
] as const;

export const MEAL_PLAN_OPTIONS = [
  "all_inclusive",
  "room_only",
  "bed_and_breakfast",
  "half_board",
  "full_board",
  "self_catering",
  "bbq",
  "packed_lunch",
  "other"
] as const;

export type PropertyType = typeof PROPERTY_TYPES[number];
export type MealPlanOption = typeof MEAL_PLAN_OPTIONS[number];

export interface OnboardingOfferings {
  accommodation: boolean;
  venue: boolean;
  event: boolean;
  conference: boolean;
}

export interface OnboardingRoomType {
  name: string;
  units?: number;                    // NEW: Number of units of this type
  max_guests: number;
  base_rate?: number;
  rate_unit?: 'per_night' | 'per_stay'; // NEW: Rate unit
  description?: string;
  images?: OnboardingImage[];        // NEW: Room-specific images
}

export const RATE_UNIT_OPTIONS = [
  { value: 'per_night', label: 'Per Night' },
  { value: 'per_stay', label: 'Per Stay' }
] as const;

export interface OnboardingImage {
  url: string;
  type: 'gallery' | 'hero' | 'video' | 'room';
  is_favourite: boolean;
  caption?: string;
}

export interface PropertyDocument {
  url: string;
  name: string;
  type: 'rate_sheet' | 'license' | 'insurance' | 'policy' | 'other';
  uploaded_at: string;
  file_size?: number;
}

export interface WizardSection {
  id: string;
  title: string;
  description: string;
  weight: number;
  icon: string;
  estimatedMinutes: number;
}

// 9-step wizard sections
export const WIZARD_SECTIONS: WizardSection[] = [
  {
    id: "property_identity",
    title: "Property Identity",
    description: "Basic info, offerings & business details",
    weight: 20,
    icon: "Building2",
    estimatedMinutes: 5
  },
  {
    id: "contact_details",
    title: "Contact & Team", 
    description: "Who can be reached at this property",
    weight: 5,
    icon: "Phone",
    estimatedMinutes: 3
  },
  {
    id: "location",
    title: "Location",
    description: "Property address and surroundings",
    weight: 15,
    icon: "MapPin",
    estimatedMinutes: 3
  },
  {
    id: "policies_pricing",
    title: "Policies & Pricing",
    description: "Rules, banking & terms",
    weight: 15,
    icon: "FileText",
    estimatedMinutes: 6
  },
  {
    id: "guest_experience",
    title: "Guest Experience",
    description: "Description and meal options",
    weight: 10,
    icon: "PenLine",
    estimatedMinutes: 5
  },
  {
    id: "facilities",
    title: "Facilities",
    description: "Available amenities and features",
    weight: 10,
    icon: "Wifi",
    estimatedMinutes: 8
  },
  {
    id: "rooms_overview",
    title: "Rooms",
    description: "Room types and configuration",
    weight: 10,
    icon: "Bed",
    estimatedMinutes: 8
  },
  {
    id: "media_documents",
    title: "Media & Documents",
    description: "Photos, videos & rate sheets",
    weight: 15,
    icon: "Image",
    estimatedMinutes: 10
  },
  {
    id: "review",
    title: "Review & Submit",
    description: "Review and submit your property",
    weight: 0,
    icon: "CheckCircle",
    estimatedMinutes: 3
  }
];

export const SCORE_WEIGHTS = {
  property_identity: 20,
  contact_details: 5,
  location: 15,
  policies_pricing: 15,
  guest_experience: 10,
  facilities: 10,
  rooms_overview: 10,
  media_documents: 15
} as const;

export const SCORE_BANDS = [
  { min: 95, max: 100, label: "ROL Platinum", badge: "Market Ready", color: "text-purple-600" },
  { min: 85, max: 94, label: "ROL Gold", badge: "Highly Competitive", color: "text-yellow-600" },
  { min: 70, max: 84, label: "ROL Silver", badge: "Good Foundation", color: "text-gray-500" },
  { min: 0, max: 69, label: "In Progress", badge: "Needs Completion", color: "text-muted-foreground" }
] as const;

export const PMS_SENSITIVE_FIELDS = [
  "properties.property_url",
  "properties.address",
  "properties.city",
  "properties.country",
  "properties.latitude",
  "properties.longitude",
  "properties.description"
] as const;

export const FACILITY_CATEGORIES = {
  general: [
    "wifi", "parking", "reception_24h", "concierge", "luggage_storage",
    "business_center", "laundry", "dry_cleaning", "ironing", "non_smoking_rooms",
    "air_conditioning"
  ],
  outdoor: [
    "garden", "terrace", "bbq", "outdoor_furniture", "outdoor_pool",
    "beach", "beach_access", "sun_loungers", "playground"
  ],
  wellness: [
    "spa", "sauna", "gym", "massage", "indoor_pool", "jacuzzi", "steam_room",
    "yoga_classes", "kids_pool"
  ],
  dining: [
    "restaurant", "bar", "room_service", "breakfast_included", "breakfast_in_room",
    "kitchen", "shared_kitchen", "coffee_machine", "coffee_house", "minibar",
    "wine_champagne", "kids_meals"
  ],
  activities: [
    "game_drives", "walking_tours", "bike_tours", "live_music", "golf_course",
    "water_sports", "hiking", "cycling", "fishing", "horseback_riding"
  ],
  family: [
    "kids_club", "babysitting", "crib", "high_chair", "family_rooms",
    "game_room"
  ],
  accessibility: [
    "wheelchair_accessible", "elevator", "accessible_parking",
    "accessible_bathroom", "braille_signage"
  ],
  security: [
    "cctv", "safe", "security_guard", "fire_extinguisher", "smoke_detector",
    "first_aid_kit", "carbon_monoxide_detector"
  ]
} as const;

export function getScoreBand(score: number) {
  return SCORE_BANDS.find(band => score >= band.min && score <= band.max) ?? SCORE_BANDS[3];
}

export function calculateSectionScore(
  sectionId: keyof typeof SCORE_WEIGHTS,
  filledFields: number,
  totalFields: number
): number {
  if (totalFields === 0) return 0;
  const completionRatio = filledFields / totalFields;
  return Math.round(completionRatio * SCORE_WEIGHTS[sectionId]);
}
