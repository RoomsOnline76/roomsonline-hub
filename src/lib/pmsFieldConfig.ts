// Configuration for which fields each PMS system populates
// This allows dynamic indication of API-synced fields in the property form

export type PMSSystem = 'benson' | 'nightsbridge' | 'checkfront' | 'semper' | 'siteminder' | 'mews' | 'opera';

// Define which fields each PMS system can populate
export const pmsPopulatedFields: Record<PMSSystem, string[]> = {
  benson: [
    // Property core fields
    'name',
    'description',
    'star_rating',
    // Address fields (if provided by API)
    'country',
    'city',
    'address',
    'postal_code',
    // Check-in/out times
    'check_in_from',
    'check_in_to',
    'check_out_from',
    'check_out_to',
    // Age ranges (from room type data aggregation)
    'infant_age_from',
    'infant_age_to',
    'teen_age_from',
    'teen_age_to',
    'children_age_from',
    'children_age_to',
    // Complex nested data
    'room_types',
    'rate_types',
    'charge_types',
    'payment_types',
    'availability',
    'rates',
  ],
  nightsbridge: [
    'name',
    'description',
    'property_type',
    'address',
    'city',
    'country',
    'postal_code',
    'latitude',
    'longitude',
    'bedrooms',
    'bathrooms',
    'max_guests',
    'star_rating',
    'room_types',
    'rate_types',
    'availability',
    'rates',
    'images',
    'amenities',
    'facilities',
    'check_in_from',
    'check_in_to',
    'check_out_from',
    'check_out_to',
  ],
  checkfront: [
    'name',
    'description',
    'room_types',
    'availability',
    'rates',
  ],
  semper: [
    'name',
    'room_types',
    'rate_types',
    'availability',
    'rates',
    'charge_types',
  ],
  siteminder: [
    'name',
    'room_types',
    'rate_types',
    'availability',
    'rates',
  ],
  mews: [
    'name',
    'description',
    'room_types',
    'rate_types',
    'availability',
    'rates',
    'facilities',
  ],
  opera: [
    'name',
    'description',
    'room_types',
    'rate_types',
    'availability',
    'rates',
    'guest_info',
  ],
};

// Room-level fields that Benson populates
export const bensonRoomPopulatedFields: string[] = [
  'name',
  'description',
  'maxPeople',
  'maxAdults',
  'maxChildren',
  'minGuests',
  'allowTeens',
  'teenMinAge',
  'teenMaxAge',
  'allowChildren',
  'childMinAge',
  'childMaxAge',
  'allowInfants',
  'infantMinAge',
  'infantMaxAge',
  'minAgeCategory',
  'minAdultsToOfferNonAdultRates',
  'rateTypes',
  'roomsAvailablePerNight',
];

// Check if a field is populated by the selected PMS
export const isFieldPopulatedByPMS = (
  fieldName: string,
  selectedPMS: string | undefined | null
): boolean => {
  if (!selectedPMS) return false;
  const pmsKey = selectedPMS.toLowerCase() as PMSSystem;
  const fields = pmsPopulatedFields[pmsKey];
  return fields?.includes(fieldName) ?? false;
};

// Check if a room field is populated by Benson
export const isRoomFieldPopulatedByBenson = (fieldName: string): boolean => {
  return bensonRoomPopulatedFields.includes(fieldName);
};

// Get the CSS class for PMS-populated fields
export const getPMSFieldClass = (
  fieldName: string,
  selectedPMS: string | undefined | null
): string => {
  if (isFieldPopulatedByPMS(fieldName, selectedPMS)) {
    return 'bg-primary/5 border-primary/20';
  }
  return '';
};

// Get display name for PMS systems
export const getPMSDisplayName = (pmsKey: string): string => {
  const names: Record<string, string> = {
    benson: 'Benson',
    nightsbridge: 'NightsBridge',
    checkfront: 'Checkfront',
    semper: 'Semper',
    siteminder: 'SiteMinder',
    mews: 'Mews',
    opera: 'Opera',
  };
  return names[pmsKey.toLowerCase()] || pmsKey;
};
