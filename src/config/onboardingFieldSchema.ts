/**
 * Property Onboarding Wizard - Canonical Field Schema
 * Auto-generated from canonical_field_schema.json
 * 
 * This file defines the structure and validation for all wizard fields,
 * mapping them to their database locations and providing metadata for
 * the wizard UI.
 */

export const WIZARD_VERSION = "1.0";

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
  max_guests: number;
  base_rate?: number;
  description?: string;
}

export interface OnboardingImage {
  url: string;
  type: 'gallery' | 'hero' | 'video';
  is_favourite: boolean;
  caption?: string;
}

export interface WizardSection {
  id: string;
  title: string;
  description: string;
  weight: number;
  icon: string;
  estimatedMinutes: number;
}

export const WIZARD_SECTIONS: WizardSection[] = [
  {
    id: "property_identity",
    title: "Property Identity",
    description: "Basic property information",
    weight: 15,
    icon: "Building2",
    estimatedMinutes: 3
  },
  {
    id: "contact_details",
    title: "Contact Details", 
    description: "Contact information for guests",
    weight: 5,
    icon: "Phone",
    estimatedMinutes: 2
  },
  {
    id: "offerings",
    title: "Offerings",
    description: "What services does your property offer?",
    weight: 5,
    icon: "Sparkles",
    estimatedMinutes: 2
  },
  {
    id: "location",
    title: "Location",
    description: "Property address and coordinates",
    weight: 15,
    icon: "MapPin",
    estimatedMinutes: 4
  },
  {
    id: "policies",
    title: "Policies & Rules",
    description: "Check-in, pets, and payment policies",
    weight: 10,
    icon: "FileText",
    estimatedMinutes: 5
  },
  {
    id: "banking",
    title: "Banking Details",
    description: "Payment and banking information",
    weight: 10,
    icon: "Landmark",
    estimatedMinutes: 5
  },
  {
    id: "description_and_meals",
    title: "Description & Meals",
    description: "Property description and meal options",
    weight: 10,
    icon: "PenLine",
    estimatedMinutes: 5
  },
  {
    id: "facilities",
    title: "Facilities & Amenities",
    description: "Available facilities and features",
    weight: 10,
    icon: "Wifi",
    estimatedMinutes: 10
  },
  {
    id: "rooms_overview",
    title: "Rooms Overview",
    description: "Room types and configuration",
    weight: 10,
    icon: "Bed",
    estimatedMinutes: 15
  },
  {
    id: "media",
    title: "Images & Media",
    description: "Property photos and videos",
    weight: 10,
    icon: "Image",
    estimatedMinutes: 10
  },
  {
    id: "review",
    title: "Review & Submit",
    description: "Review and submit your property",
    weight: 0,
    icon: "CheckCircle",
    estimatedMinutes: 5
  }
];

export const SCORE_WEIGHTS = {
  property_identity: 15,
  contact_details: 5,
  offerings: 5,
  location: 15,
  policies: 10,
  banking: 10,
  description_and_meals: 10,
  facilities: 10,
  rooms_overview: 10,
  media: 10
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
    "business_center", "laundry", "dry_cleaning", "ironing"
  ],
  outdoor: [
    "garden", "terrace", "bbq", "outdoor_furniture", "outdoor_pool",
    "beach_access", "sun_loungers", "playground"
  ],
  wellness: [
    "spa", "sauna", "gym", "massage", "indoor_pool", "jacuzzi", "steam_room"
  ],
  dining: [
    "restaurant", "bar", "room_service", "breakfast_included", "kitchen",
    "shared_kitchen", "coffee_machine", "minibar"
  ],
  family: [
    "kids_club", "babysitting", "crib", "high_chair", "family_rooms",
    "playground", "game_room"
  ],
  accessibility: [
    "wheelchair_accessible", "elevator", "accessible_parking",
    "accessible_bathroom", "braille_signage"
  ],
  security: [
    "cctv", "safe", "security_guard", "fire_extinguisher", "smoke_detector",
    "first_aid_kit"
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
