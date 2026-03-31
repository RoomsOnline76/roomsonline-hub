/**
 * Property Onboarding Wizard - Canonical Field Schema
 * Auto-generated from canonical_field_schema.json
 * 
 * This file defines the structure and validation for all wizard fields,
 * mapping them to their database locations and providing metadata for
 * the wizard UI.
 * 
 * REORGANIZED: 12 steps → 9 steps for streamlined UX
 * ENHANCED: Intent-aware step filtering and completion states
 */

export const WIZARD_VERSION = "2.1";

export const PROPERTY_TYPES = [
  "apartment",
  "backpackers",
  "bed_and_breakfast", 
  "boutique_hotel",
  "cabin",
  "chalet",
  "cottage",
  "game_lodge",
  "guest_house",
  "hotel",
  "lodge",
  "safari_lodge",
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
export type ListingIntent = 'accommodation' | 'venue' | 'hybrid' | 'experience';

export interface OnboardingOfferings {
  accommodation: boolean;
  venue: boolean;
  event: boolean;
  conference: boolean;
}

export interface OnboardingRoomType {
  id?: string;  // Stable ID for linking between wizard and property form
  name: string;
  units?: number;
  max_guests: number;
  base_rate?: number;
  rate_unit?: 'per_night' | 'per_stay';
  description?: string;
  images?: OnboardingImage[];
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
  whyItMatters?: string;
  requiredFor?: ListingIntent[];
}

// ============= COMPLETION STATES =============
export const COMPLETION_STATES = {
  INCOMPLETE: { min: 0, max: 49, label: 'Needs Work', blocked: true, color: 'text-destructive' },
  REVIEWABLE: { min: 50, max: 69, label: 'Ready for Review', blocked: false, color: 'text-yellow-600' },
  ELIGIBLE: { min: 70, max: 84, label: 'Activation Eligible', blocked: false, color: 'text-blue-600' },
  SHOWCASE_READY: { min: 85, max: 100, label: 'Showcase Ready', blocked: false, color: 'text-green-600' }
} as const;

export type CompletionState = keyof typeof COMPLETION_STATES;

export function getCompletionState(score: number): CompletionState {
  if (score >= COMPLETION_STATES.SHOWCASE_READY.min) return 'SHOWCASE_READY';
  if (score >= COMPLETION_STATES.ELIGIBLE.min) return 'ELIGIBLE';
  if (score >= COMPLETION_STATES.REVIEWABLE.min) return 'REVIEWABLE';
  return 'INCOMPLETE';
}

export function getCompletionStateDetails(score: number) {
  const state = getCompletionState(score);
  return COMPLETION_STATES[state];
}

// ============= WIZARD SECTIONS =============
// 9-step wizard sections with intent awareness
export const WIZARD_SECTIONS: WizardSection[] = [
  {
    id: "property_identity",
    title: "Property Identity",
    description: "Basic info, offerings & business details",
    weight: 20,
    icon: "Building2",
    estimatedMinutes: 5,
    whyItMatters: "This establishes your property's brand presence and helps guests find you.",
    requiredFor: ['accommodation', 'venue', 'hybrid', 'experience']
  },
  {
    id: "contact_details",
    title: "Contact & Team", 
    description: "Who can be reached at this property",
    weight: 5,
    icon: "Phone",
    estimatedMinutes: 3,
    whyItMatters: "Guests and our team need reliable ways to reach you for bookings and support.",
    requiredFor: ['accommodation', 'venue', 'hybrid', 'experience']
  },
  {
    id: "location",
    title: "Location",
    description: "Property address and surroundings",
    weight: 15,
    icon: "MapPin",
    estimatedMinutes: 3,
    whyItMatters: "Accurate location helps guests find you and enables map-based search.",
    requiredFor: ['accommodation', 'venue', 'hybrid', 'experience']
  },
  {
    id: "policies_pricing",
    title: "Policies & Pricing",
    description: "Rules, banking & terms",
    weight: 15,
    icon: "FileText",
    estimatedMinutes: 6,
    whyItMatters: "Clear policies set expectations and ensure smooth check-in/out experiences.",
    requiredFor: ['accommodation', 'venue', 'hybrid', 'experience']
  },
  {
    id: "guest_experience",
    title: "Guest Experience",
    description: "Description and meal options",
    weight: 10,
    icon: "PenLine",
    estimatedMinutes: 5,
    whyItMatters: "Compelling descriptions convert browsers into bookers. This is your sales pitch.",
    requiredFor: ['accommodation', 'venue', 'hybrid', 'experience']
  },
  {
    id: "facilities",
    title: "Facilities",
    description: "Available amenities and features",
    weight: 10,
    icon: "Wifi",
    estimatedMinutes: 8,
    whyItMatters: "Guests filter by amenities. Complete lists increase your visibility.",
    requiredFor: ['accommodation', 'venue', 'hybrid']
  },
  {
    id: "rooms_overview",
    title: "Rooms",
    description: "Room types and configuration",
    weight: 10,
    icon: "Bed",
    estimatedMinutes: 8,
    whyItMatters: "Room details power pricing, availability, and booking capacity.",
    requiredFor: ['accommodation', 'hybrid']
  },
  {
    id: "media_documents",
    title: "Media & Documents",
    description: "Photos, videos & rate sheets",
    weight: 15,
    icon: "Image",
    estimatedMinutes: 10,
    whyItMatters: "High-quality visuals are the #1 factor in booking decisions.",
    requiredFor: ['accommodation', 'venue', 'hybrid', 'experience']
  },
  {
    id: "review",
    title: "Review & Submit",
    description: "Review and submit your property",
    weight: 0,
    icon: "CheckCircle",
    estimatedMinutes: 3,
    whyItMatters: "Final check before your property goes live.",
    requiredFor: ['accommodation', 'venue', 'hybrid', 'experience']
  }
];

// ============= VENUE-SPECIFIC SECTIONS =============
export const VENUE_SECTIONS: WizardSection[] = [
  {
    id: "capacity",
    title: "Venue Capacity",
    description: "Event spaces and capacity limits",
    weight: 15,
    icon: "Users",
    estimatedMinutes: 5,
    whyItMatters: "Capacity details help event planners find venues that fit their needs.",
    requiredFor: ['venue', 'hybrid']
  },
  {
    id: "event_types",
    title: "Event Types",
    description: "Types of events you host",
    weight: 10,
    icon: "Calendar",
    estimatedMinutes: 4,
    whyItMatters: "Clear event types help match you with the right inquiries.",
    requiredFor: ['venue', 'hybrid']
  }
];

// ============= EXPERIENCE-SPECIFIC SECTIONS =============
export const EXPERIENCE_SECTIONS: WizardSection[] = [
  {
    id: "experience_details",
    title: "Experience Details",
    description: "What your experience offers",
    weight: 20,
    icon: "Sparkles",
    estimatedMinutes: 8,
    whyItMatters: "Detailed experience info helps guests understand what they'll enjoy.",
    requiredFor: ['experience']
  },
  {
    id: "logistics",
    title: "Logistics",
    description: "Timing, meeting points, requirements",
    weight: 15,
    icon: "Clock",
    estimatedMinutes: 5,
    whyItMatters: "Clear logistics prevent confusion and ensure smooth experiences.",
    requiredFor: ['experience']
  }
];

// ============= INTENT-BASED STEP FILTERING =============
export function getWizardStepsForIntent(intent: ListingIntent): WizardSection[] {
  const baseSteps = ['property_identity', 'contact_details', 'location'];
  const reviewStep = 'review';
  
  let middleSteps: string[];
  
  switch (intent) {
    case 'accommodation':
      middleSteps = ['rooms_overview', 'policies_pricing', 'facilities', 'guest_experience', 'media_documents'];
      break;
    case 'venue':
      middleSteps = ['capacity', 'event_types', 'policies_pricing', 'facilities', 'guest_experience', 'media_documents'];
      break;
    case 'hybrid':
      middleSteps = ['rooms_overview', 'capacity', 'event_types', 'policies_pricing', 'facilities', 'guest_experience', 'media_documents'];
      break;
    case 'experience':
      middleSteps = ['experience_details', 'logistics', 'guest_experience', 'media_documents'];
      break;
    default:
      // Default to accommodation
      middleSteps = ['rooms_overview', 'policies_pricing', 'facilities', 'guest_experience', 'media_documents'];
  }
  
  const allStepIds = [...baseSteps, ...middleSteps, reviewStep];
  const allSections = [...WIZARD_SECTIONS, ...VENUE_SECTIONS, ...EXPERIENCE_SECTIONS];
  
  return allStepIds
    .map(id => allSections.find(s => s.id === id))
    .filter((s): s is WizardSection => s !== undefined);
}

export function getStepCountForIntent(intent: ListingIntent): number {
  return getWizardStepsForIntent(intent).length;
}

// ============= SCORE WEIGHTS =============
export const SCORE_WEIGHTS = {
  property_identity: 20,
  contact_details: 5,
  location: 15,
  policies_pricing: 15,
  guest_experience: 10,
  facilities: 10,
  rooms_overview: 10,
  media_documents: 15,
  // Venue-specific
  capacity: 15,
  event_types: 10,
  // Experience-specific
  experience_details: 20,
  logistics: 15
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

// ============= FIELD IMPACT LEVELS =============
export type FieldImpactLevel = 'critical' | 'high' | 'medium' | 'low';

export interface FieldDefinition {
  key: string;
  label: string;
  section: string;
  impact: FieldImpactLevel;
  requiredFor: ListingIntent[];
}

export const CRITICAL_FIELDS: FieldDefinition[] = [
  { key: 'name', label: 'Property Name', section: 'property_identity', impact: 'critical', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
  { key: 'property_type', label: 'Property Type', section: 'property_identity', impact: 'critical', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
  { key: 'address', label: 'Street Address', section: 'location', impact: 'critical', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
  { key: 'city', label: 'City', section: 'location', impact: 'critical', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
  { key: 'country', label: 'Country', section: 'location', impact: 'critical', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
  { key: 'amenities.telephone', label: 'Contact Phone', section: 'contact_details', impact: 'critical', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
  { key: 'amenities.contact_email', label: 'Contact Email', section: 'contact_details', impact: 'critical', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
];

export const HIGH_IMPACT_FIELDS: FieldDefinition[] = [
  { key: 'description', label: 'Property Description', section: 'guest_experience', impact: 'high', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
  { key: 'short_description', label: 'Short Description', section: 'guest_experience', impact: 'high', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
  { key: 'images', label: 'Property Images', section: 'media_documents', impact: 'high', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
  { key: 'amenities.room_types', label: 'Room Types', section: 'rooms_overview', impact: 'high', requiredFor: ['accommodation', 'hybrid'] },
  { key: 'amenities.check_in_time', label: 'Check-in Time', section: 'policies_pricing', impact: 'high', requiredFor: ['accommodation', 'hybrid'] },
  { key: 'amenities.check_out_time', label: 'Check-out Time', section: 'policies_pricing', impact: 'high', requiredFor: ['accommodation', 'hybrid'] },
];

export const MEDIUM_IMPACT_FIELDS: FieldDefinition[] = [
  { key: 'property_url', label: 'Website URL', section: 'property_identity', impact: 'medium', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
  { key: 'amenities.facilities', label: 'Facilities', section: 'facilities', impact: 'medium', requiredFor: ['accommodation', 'venue', 'hybrid'] },
  { key: 'amenities.meal_plan', label: 'Meal Options', section: 'guest_experience', impact: 'medium', requiredFor: ['accommodation', 'hybrid'] },
  { key: 'amenities.cancellation_policy', label: 'Cancellation Policy', section: 'policies_pricing', impact: 'medium', requiredFor: ['accommodation', 'venue', 'hybrid', 'experience'] },
];

// Map of field keys to their alternative keys (for checking multiple paths)
const FIELD_ALTERNATIVES: Record<string, string[]> = {
  'amenities.check_in_time': ['house_rules.check_in_from', 'check_in_from', 'check_in_time', 'check_in_to'],
  'amenities.check_out_time': ['house_rules.check_out_to', 'check_out_to', 'check_out_from', 'house_rules.check_out_from'],
  'amenities.contact_email': ['contact.email', 'contact_email'],
  'amenities.telephone': ['contact.telephone', 'telephone', 'contact.mobile', 'mobile'],
  'amenities.cancellation_policy': ['cancellation_policies', 'cancellation_policy'],
  'amenities.meal_plan': ['meal_plan', 'breakfast_options'],
};

// Helper to get nested values from an object
function getNestedValueFromObject(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
      current = (current as Record<string, unknown>)[part];
    } else {
      return undefined;
    }
  }
  return current;
}

export function getMissingFieldsByImpact(
  data: Record<string, unknown>,
  amenities: Record<string, unknown>,
  intent: ListingIntent
): Record<FieldImpactLevel, FieldDefinition[]> {
  const allFields = [...CRITICAL_FIELDS, ...HIGH_IMPACT_FIELDS, ...MEDIUM_IMPACT_FIELDS];
  
  const missing: Record<FieldImpactLevel, FieldDefinition[]> = {
    critical: [],
    high: [],
    medium: [],
    low: []
  };
  
  const checkHasValue = (value: unknown): boolean => {
    return value !== null && value !== undefined && value !== '' && 
           (Array.isArray(value) ? value.length > 0 : true);
  };
  
  for (const field of allFields) {
    // Skip if not required for this intent
    if (!field.requiredFor.includes(intent)) continue;
    
    // Check if field has value
    let hasValue = false;
    
    // Check for alternative field keys first
    const alternatives = FIELD_ALTERNATIVES[field.key];
    if (alternatives) {
      // Check if any of the alternative keys have a value (using nested path support)
      hasValue = alternatives.some(altKey => {
        const value = getNestedValueFromObject(amenities, altKey);
        return checkHasValue(value);
      });
    } else if (field.key.startsWith('amenities.')) {
      const amenityKey = field.key.replace('amenities.', '');
      // Support nested paths like 'contact.email'
      const value = getNestedValueFromObject(amenities, amenityKey);
      hasValue = checkHasValue(value);
    } else {
      hasValue = checkHasValue(data[field.key]);
    }
    
    if (!hasValue) {
      missing[field.impact].push(field);
    }
  }
  
  return missing;
}

// ============= LEGACY FUNCTIONS =============
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
