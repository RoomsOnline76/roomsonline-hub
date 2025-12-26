// Configuration for which fields each PMS system populates
// Derived from the canonical pms-implementation-master.json

import pmsRulesData from '@/config/pms-implementation-master.json';

// Field authority levels as defined in master JSON
export type FieldAuthority = 'authoritative' | 'seed_only' | 'partial' | 'not_available';

// PMS Rule structure from master JSON
export interface PMSRule {
  pms: string;
  safe_as_is: boolean;
  property_fields: Record<string, FieldAuthority>;
  room_types: {
    cache: string;
    amenities_seed: boolean | string;
  };
  notes: string;
}

export interface PMSRulesConfig {
  version: string;
  description: string;
  pms_rules: PMSRule[];
}

// Type the imported JSON
const pmsRules = pmsRulesData as PMSRulesConfig;

// Supported PMS system types
export type PMSSystem = 'roomsonline' | 'benson' | 'nightsbridge' | 'checkfront' | 'semper' | 'siteminder' | 'mews' | 'opera' | 'littlehotelier' | 'cloudbeds' | 'smoobu' | 'hostfully' | 'hotelbeds';

// Normalize PMS key for lookups (handle variants like littlehotelier vs little-hotelier)
const normalizePMSKey = (pmsKey: string): string => {
  const normalized = pmsKey.toLowerCase().replace(/[_\s]/g, '-');
  // Map common variants
  const keyMap: Record<string, string> = {
    'littlehotelier': 'little-hotelier',
    'little-hotelier': 'little-hotelier',
  };
  return keyMap[normalized] || normalized;
};

// Get PMS rule from master JSON
export const getPMSRule = (pmsKey: string): PMSRule | undefined => {
  const normalizedKey = normalizePMSKey(pmsKey);
  return pmsRules.pms_rules.find(rule => 
    normalizePMSKey(rule.pms) === normalizedKey
  );
};

// Field mapping from master JSON field names to database column names
const fieldNameMapping: Record<string, string[]> = {
  'name': ['name'],
  'description': ['description'],
  'location': ['address', 'city', 'country', 'postal_code', 'suburb'],
  'geo': ['latitude', 'longitude'],
  'images': ['images'],
  'amenities': ['amenities', 'facilities'],
};

// Get the authority level for a specific field from a specific PMS
export const getFieldAuthority = (
  pmsKey: string | undefined | null,
  fieldName: string
): FieldAuthority => {
  if (!pmsKey) return 'not_available';
  
  const rule = getPMSRule(pmsKey);
  if (!rule) return 'not_available';
  
  // Check direct field name first
  if (rule.property_fields[fieldName]) {
    return rule.property_fields[fieldName];
  }
  
  // Check if field is part of a grouped field (e.g., 'address' is part of 'location')
  for (const [groupName, dbFields] of Object.entries(fieldNameMapping)) {
    if (dbFields.includes(fieldName) && rule.property_fields[groupName]) {
      return rule.property_fields[groupName];
    }
  }
  
  return 'not_available';
};

// Determine if a field can be overwritten based on authority and existing value
export const canOverwriteField = (
  pmsKey: string | undefined | null,
  fieldName: string,
  existingValue: any
): boolean => {
  const authority = getFieldAuthority(pmsKey, fieldName);
  
  switch (authority) {
    case 'authoritative':
      // Always overwrite
      return true;
    case 'seed_only':
      // Only overwrite if empty/null
      return existingValue === null || existingValue === undefined || existingValue === '';
    case 'partial':
      // Merge logic - return true but caller should merge, not replace
      return true;
    case 'not_available':
    default:
      return false;
  }
};

// Get room type rules for a PMS
export const getRoomTypeRules = (pmsKey: string | undefined | null): { cache: string; amenitiesSeed: boolean | string } | null => {
  if (!pmsKey) return null;
  
  const rule = getPMSRule(pmsKey);
  if (!rule) return null;
  
  return {
    cache: rule.room_types.cache,
    amenitiesSeed: rule.room_types.amenities_seed,
  };
};

// Get all syncable fields for a PMS (fields that are not 'not_available')
export const getSyncableFields = (pmsKey: string | undefined | null): string[] => {
  if (!pmsKey) return [];
  
  const rule = getPMSRule(pmsKey);
  if (!rule) return [];
  
  const syncableFields: string[] = [];
  
  for (const [fieldGroup, authority] of Object.entries(rule.property_fields)) {
    if (authority !== 'not_available') {
      // Expand field groups to individual DB columns
      const dbFields = fieldNameMapping[fieldGroup] || [fieldGroup];
      syncableFields.push(...dbFields);
    }
  }
  
  return syncableFields;
};

// Generate pmsPopulatedFields dynamically from master JSON for backward compatibility
const generatePMSPopulatedFields = (): Record<PMSSystem, string[]> => {
  const result: Partial<Record<PMSSystem, string[]>> = {};
  
  // Initialize with static configs for PMS not in master JSON
  const staticConfigs: Partial<Record<PMSSystem, string[]>> = {
    roomsonline: ['name', 'description', 'room_types', 'rate_types', 'availability', 'rates'],
    nightsbridge: [], // External redirect, no data sync
    semper: ['name', 'room_types', 'rate_types', 'availability', 'rates', 'charge_types'],
    siteminder: ['name', 'room_types', 'rate_types', 'availability', 'rates'],
    mews: ['name', 'description', 'room_types', 'rate_types', 'availability', 'rates', 'facilities'],
    opera: ['name', 'description', 'room_types', 'rate_types', 'availability', 'rates', 'guest_info'],
    smoobu: [],
    hotelbeds: ['name', 'description', 'room_types', 'rate_types', 'availability', 'rates'],
  };
  
  // Add static configs
  for (const [pms, fields] of Object.entries(staticConfigs)) {
    result[pms as PMSSystem] = fields;
  }
  
  // Derive from master JSON
  for (const rule of pmsRules.pms_rules) {
    const pmsKey = rule.pms.replace('-', '') as PMSSystem; // little-hotelier -> littlehotelier
    const fields: string[] = [];
    
    for (const [fieldGroup, authority] of Object.entries(rule.property_fields)) {
      if (authority !== 'not_available') {
        // Add all DB fields for this group
        const dbFields = fieldNameMapping[fieldGroup] || [fieldGroup];
        fields.push(...dbFields);
      }
    }
    
    // Always include operational fields for PMS with room_types cache
    if (rule.room_types.cache === 'full') {
      fields.push('room_types', 'rate_types', 'availability', 'rates');
    }
    
    result[pmsKey] = [...new Set(fields)]; // Deduplicate
  }
  
  return result as Record<PMSSystem, string[]>;
};

export const pmsPopulatedFields: Record<PMSSystem, string[]> = generatePMSPopulatedFields();

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
  const pmsKey = selectedPMS.toLowerCase().replace('-', '') as PMSSystem;
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
    roomsonline: 'RoomsOnline',
    benson: 'Benson',
    nightsbridge: 'NightsBridge',
    checkfront: 'Checkfront',
    semper: 'Semper',
    siteminder: 'SiteMinder',
    mews: 'Mews',
    opera: 'Opera',
    littlehotelier: 'Little Hotelier',
    'little-hotelier': 'Little Hotelier',
    cloudbeds: 'Cloudbeds',
    smoobu: 'Smoobu',
    hostfully: 'Hostfully',
    hotelbeds: 'HotelBeds',
  };
  return names[pmsKey.toLowerCase()] || pmsKey;
};

// Get a descriptive label for field authority level
export const getAuthorityLabel = (authority: FieldAuthority): string => {
  switch (authority) {
    case 'authoritative':
      return 'Synced from PMS';
    case 'seed_only':
      return 'Seeds if empty';
    case 'partial':
      return 'Merged with PMS';
    case 'not_available':
    default:
      return '';
  }
};

// Get authority indicator color/variant for UI
export const getAuthorityVariant = (authority: FieldAuthority): 'default' | 'secondary' | 'outline' | 'destructive' => {
  switch (authority) {
    case 'authoritative':
      return 'default'; // Blue
    case 'seed_only':
      return 'secondary'; // Yellow/muted
    case 'partial':
      return 'outline'; // Orange outline
    case 'not_available':
    default:
      return 'outline';
  }
};

// Get PMS notes from master JSON
export const getPMSNotes = (pmsKey: string | undefined | null): string | null => {
  if (!pmsKey) return null;
  const rule = getPMSRule(pmsKey);
  return rule?.notes || null;
};

// Check if PMS is marked as safe_as_is (no special handling needed)
export const isPMSSafeAsIs = (pmsKey: string | undefined | null): boolean => {
  if (!pmsKey) return false;
  const rule = getPMSRule(pmsKey);
  return rule?.safe_as_is ?? false;
};
