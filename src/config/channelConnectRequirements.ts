/**
 * Per-channel connection requirements.
 *
 * When an owner presses "Get connected" inside the Channel Manager, the channel
 * validates the listing in the background and only launches its connection wizard
 * when every minimum requirement is met. Otherwise it stops on an eligibility
 * message with no detail we can act on.
 *
 * This catalogue mirrors the published minimum requirements so ROL'OS can grade the
 * listing *before* the owner presses connect, and point at the field that fixes each
 * failing requirement. Vendor naming stays out of owner copy — labels here are the
 * public channel brands the owner is choosing to sell on, which is intentional.
 */

export type ConnectRequirementId =
  | "listing_name"
  | "property_type"
  | "bathrooms"
  | "max_guests"
  | "address"
  | "postal_code"
  | "geo"
  | "kitchen"
  | "beds_match_guests"
  | "description"
  | "photo_count"
  | "photo_size"
  | "photo_reachable"
  | "main_photo"
  | "prices"
  | "availability"
  | "min_stay_window"
  | "payment_methods"
  | "cancellation_policy";

export interface ConnectRequirement {
  id: ConnectRequirementId;
  title: string;
  /** Exactly what the channel enforces. */
  rule: string;
  /** Property-editor section that fixes it. */
  section: string;
  focusKey?: string;
}

export const CONNECT_REQUIREMENTS: Record<ConnectRequirementId, ConnectRequirement> = {
  listing_name: {
    id: "listing_name",
    title: "Listing name",
    rule: "A plain-text name is required — no emoji, no ALL CAPS words and no marketing suffixes. Around 70 characters performs best.",
    section: "general",
    focusKey: "name",
  },
  property_type: {
    id: "property_type",
    title: "Property type",
    rule: "A property type must be selected so the channel can map the listing.",
    section: "general",
    focusKey: "property_type",
  },
  bathrooms: {
    id: "bathrooms",
    title: "Bathrooms",
    rule: "Apartment, aparthotel, condo and cottage types must have at least one bathroom.",
    section: "rooms",
    focusKey: "rooms",
  },
  max_guests: {
    id: "max_guests",
    title: "Maximum guests",
    rule: "A maximum number of guests is required.",
    section: "general",
    focusKey: "max_guests",
  },
  address: {
    id: "address",
    title: "Street address",
    rule: "A full street address (street name and number), city and country are required — a farm or suburb name alone is rejected.",
    section: "general",
    focusKey: "address",
  },
  postal_code: {
    id: "postal_code",
    title: "Postal code",
    rule: "A postal code is required for the listing address.",
    section: "general",
    focusKey: "address",
  },
  geo: {
    id: "geo",
    title: "Map coordinates",
    rule: "Latitude and longitude must be set — place the pin with the map picker.",
    section: "general",
    focusKey: "geo",
  },
  kitchen: {
    id: "kitchen",
    title: "Kitchen",
    rule: "A kitchen must be present on the listing (as a room or as an amenity).",
    section: "info-facilities",
    focusKey: "facilities",
  },
  beds_match_guests: {
    id: "beds_match_guests",
    title: "Beds match guests",
    rule: "The captured beds must sleep at least the maximum number of guests.",
    section: "rooms",
    focusKey: "rooms",
  },
  description: {
    id: "description",
    title: "Description length",
    rule: "The description must be at least 700 characters of original prose — no contact details or links.",
    section: "general",
    focusKey: "description",
  },
  photo_count: {
    id: "photo_count",
    title: "Number of photos",
    rule: "The listing needs the channel's minimum number of photos.",
    section: "images",
    focusKey: "images",
  },
  photo_size: {
    id: "photo_size",
    title: "Photo size",
    rule: "Every photo must be at least 1024 × 768 pixels, with no watermarks, logos or text overlays.",
    section: "images",
    focusKey: "images",
  },
  photo_reachable: {
    id: "photo_reachable",
    title: "Photos can be downloaded",
    rule: "Every photo must be publicly downloadable — the channel fetches each file and rejects the listing when one fails.",
    section: "images",
    focusKey: "images",
  },
  main_photo: {
    id: "main_photo",
    title: "Main photo",
    rule: "A main photo must be selected — the first photo in the list is used.",
    section: "images",
    focusKey: "images",
  },
  prices: {
    id: "prices",
    title: "Prices",
    rule: "Published prices are required before a connection can be made.",
    section: "rates",
  },
  availability: {
    id: "availability",
    title: "Availability",
    rule: "An open availability window is required before a connection can be made.",
    section: "rates",
  },
  min_stay_window: {
    id: "min_stay_window",
    title: "Minimum stay",
    rule: "The minimum stay must be between 1 and 28 nights.",
    section: "rates",
    focusKey: "min_stay",
  },
  payment_methods: {
    id: "payment_methods",
    title: "Payment methods",
    rule: "At least one accepted payment method must be captured.",
    section: "rates",
  },
  cancellation_policy: {
    id: "cancellation_policy",
    title: "Cancellation policy",
    rule: "At least one policy is required. Periods must run continuously (no penalty-free gap between penalty periods) and the fee may never decrease as the arrival date gets closer.",
    section: "rates",
    focusKey: "master_policy",
  },
};

export interface ChannelConnectSpec {
  key: string;
  label: string;
  minPhotos: number;
  minPhotoWidth: number;
  minPhotoHeight: number;
  minDescription: number;
  maxMinStay: number;
  requirements: ConnectRequirementId[];
}

const COMMON: ConnectRequirementId[] = [
  "listing_name",
  "property_type",
  "max_guests",
  "address",
  "geo",
  "beds_match_guests",
  "description",
  "photo_count",
  "photo_size",
  "photo_reachable",
  "main_photo",
  "prices",
  "availability",
  "payment_methods",
  "cancellation_policy",
];

export const CHANNEL_CONNECT_SPECS: ChannelConnectSpec[] = [
  {
    key: "airbnb",
    label: "Airbnb",
    minPhotos: 7,
    minPhotoWidth: 1024,
    minPhotoHeight: 768,
    minDescription: 700,
    maxMinStay: 28,
    requirements: [...COMMON, "bathrooms", "postal_code", "min_stay_window"],
  },
  {
    key: "expedia",
    label: "Expedia",
    minPhotos: 10,
    minPhotoWidth: 1024,
    minPhotoHeight: 768,
    minDescription: 700,
    maxMinStay: 28,
    requirements: [...COMMON, "bathrooms", "kitchen", "min_stay_window"],
  },
  {
    key: "vrbo",
    label: "Vrbo",
    minPhotos: 10,
    minPhotoWidth: 1024,
    minPhotoHeight: 768,
    minDescription: 700,
    maxMinStay: 28,
    requirements: [...COMMON, "bathrooms", "kitchen", "min_stay_window"],
  },
  {
    key: "booking_com",
    label: "Booking.com",
    minPhotos: 6,
    minPhotoWidth: 1024,
    minPhotoHeight: 768,
    minDescription: 700,
    maxMinStay: 28,
    requirements: [...COMMON, "bathrooms", "postal_code", "min_stay_window"],
  },
  {
    key: "google_hotels",
    label: "Google",
    minPhotos: 4,
    minPhotoWidth: 1024,
    minPhotoHeight: 768,
    minDescription: 700,
    maxMinStay: 28,
    requirements: [...COMMON, "postal_code"],
  },
  {
    key: "lekkeslaap",
    label: "LekkeSlaap",
    minPhotos: 4,
    minPhotoWidth: 1024,
    minPhotoHeight: 768,
    minDescription: 700,
    maxMinStay: 28,
    requirements: [...COMMON],
  },
];

export function connectSpecFor(key: string): ChannelConnectSpec {
  return CHANNEL_CONNECT_SPECS.find((s) => s.key === key) ?? CHANNEL_CONNECT_SPECS[0];
}
