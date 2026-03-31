/**
 * Accommodation Label System
 * 
 * Resolves the correct terminology for "rooms" based on property configuration.
 * Properties can override via amenities.accommodation_label, or the system
 * infers a sensible default from property_type and external_system.
 */

export type AccommodationLabelKey =
  | 'room'
  | 'unit'
  | 'apartment'
  | 'chalet'
  | 'cottage'
  | 'cabin'
  | 'suite'
  | 'villa'
  | 'studio'
  | 'tent'
  | 'pod';

export interface AccommodationLabel {
  key: AccommodationLabelKey;
  singular: string;
  plural: string;
}

export const ACCOMMODATION_TYPES: Record<AccommodationLabelKey, { singular: string; plural: string }> = {
  room: { singular: 'Room', plural: 'Rooms' },
  unit: { singular: 'Unit', plural: 'Units' },
  apartment: { singular: 'Apartment', plural: 'Apartments' },
  chalet: { singular: 'Chalet', plural: 'Chalets' },
  cottage: { singular: 'Cottage', plural: 'Cottages' },
  cabin: { singular: 'Cabin', plural: 'Cabins' },
  suite: { singular: 'Suite', plural: 'Suites' },
  villa: { singular: 'Villa', plural: 'Villas' },
  studio: { singular: 'Studio', plural: 'Studios' },
  tent: { singular: 'Tent', plural: 'Tents' },
  pod: { singular: 'Pod', plural: 'Pods' },
};

export const ACCOMMODATION_LABEL_OPTIONS: { value: AccommodationLabelKey; label: string }[] = Object.entries(
  ACCOMMODATION_TYPES
).map(([key, { singular }]) => ({ value: key as AccommodationLabelKey, label: singular }));

/** Smart defaults: property_type → accommodation label key */
const PROPERTY_TYPE_DEFAULTS: Record<string, AccommodationLabelKey> = {
  apartment: 'apartment',
  villa: 'villa',
  self_catering: 'unit',
  chalet: 'chalet',
  cottage: 'cottage',
  cabin: 'cabin',
  boutique_hotel: 'room',
  hotel: 'room',
  guesthouse: 'room',
  guest_house: 'room',
  bnb: 'room',
  bed_and_breakfast: 'room',
  lodge: 'room',
  game_lodge: 'room',
  safari_lodge: 'room',
  resort: 'room',
  backpackers: 'room',
};

/**
 * Resolves the accommodation label for a property.
 * 
 * Priority:
 * 1. Explicit amenities.accommodation_label
 * 2. Inferred from property_type
 * 3. Hostfully properties default to "Unit"
 * 4. Fallback: "Room"
 */
export function getAccommodationLabel(property?: {
  amenities?: Record<string, unknown> | null;
  property_type?: string | null;
  external_system?: string | null;
} | null): AccommodationLabel {
  // 1. Explicit override
  const explicitLabel = (property?.amenities as Record<string, unknown>)?.accommodation_label as string | undefined;
  if (explicitLabel && explicitLabel in ACCOMMODATION_TYPES) {
    const entry = ACCOMMODATION_TYPES[explicitLabel as AccommodationLabelKey];
    return { key: explicitLabel as AccommodationLabelKey, ...entry };
  }

  // 2. Infer from property_type
  const propertyType = property?.property_type?.toLowerCase();
  if (propertyType && propertyType in PROPERTY_TYPE_DEFAULTS) {
    const key = PROPERTY_TYPE_DEFAULTS[propertyType];
    return { key, ...ACCOMMODATION_TYPES[key] };
  }

  // 3. Hostfully default
  if (property?.external_system === 'hostfully') {
    return { key: 'unit', ...ACCOMMODATION_TYPES.unit };
  }

  // 4. Fallback
  return { key: 'room', ...ACCOMMODATION_TYPES.room };
}

/**
 * Returns "Room Type" → "Apartment Type" etc. for form labels
 */
export function getAccommodationTypeLabel(property?: Parameters<typeof getAccommodationLabel>[0]): string {
  const { singular } = getAccommodationLabel(property);
  return `${singular} Type`;
}
