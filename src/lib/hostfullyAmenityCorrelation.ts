/**
 * HOSTFULLY AMENITY CORRELATION ADAPTERS
 * Maps Hostfully raw amenity codes to ROL standardized values
 */

// ============================================================================
// BED TYPE CORRELATION
// ============================================================================

export const BED_TYPE_MAP: Record<string, string> = {
  'KING': 'king',
  'KING_BED': 'king',
  'QUEEN': 'queen',
  'QUEEN_BED': 'queen',
  'DOUBLE': 'double',
  'DOUBLE_BED': 'double',
  'TWIN': 'twin',
  'TWIN_BED': 'twin',
  'SINGLE': 'single',
  'SINGLE_BED': 'single',
  'SOFA_BED': 'sofa-bed',
  'SOFABED': 'sofa-bed',
  'SLEEPER_SOFA': 'sofa-bed',
  'BUNK': 'bunk',
  'BUNK_BED': 'bunk',
  'FUTON': 'futon',
  'MURPHY': 'murphy',
  'MURPHY_BED': 'murphy',
  'AIR_MATTRESS': 'air-mattress',
  'FLOOR_MATTRESS': 'floor-mattress',
  'CRIB': 'crib',
  'TODDLER_BED': 'toddler',
};

/**
 * Transform Hostfully bed configuration to ROL format
 */
export function transformBedConfiguration(
  beds: unknown
): Array<{ type: string; count: number }> {
  // If it's already an array of bed objects
  if (Array.isArray(beds)) {
    return beds.map((b: unknown) => {
      if (typeof b === 'object' && b !== null) {
        const bed = b as Record<string, unknown>;
        const rawType = String(bed.type || bed.bedType || 'bed').toUpperCase();
        return {
          type: BED_TYPE_MAP[rawType] || rawType.toLowerCase() || 'bed',
          count: Number(bed.count || bed.quantity || 1),
        };
      }
      return { type: 'bed', count: 1 };
    });
  }
  
  // If it's just a number (total bed count)
  if (typeof beds === 'number' && beds > 0) {
    return [{ type: 'bed', count: beds }];
  }
  
  return [];
}

// ============================================================================
// FACILITIES CORRELATION
// ============================================================================

/**
 * Maps Hostfully amenity codes to ROL facility values
 * These map to the \"Facilities\" section in room editor
 */
export const HOSTFULLY_FACILITY_MAP: Record<string, string> = {
  // Cooking & Kitchen
  'BBQ': 'Braai/Barbeque Facilities',
  'BARBECUE': 'Braai/Barbeque Facilities',
  'GRILL': 'Braai/Barbeque Facilities',
  'OUTDOOR_GRILL': 'Braai/Barbeque Facilities',
  'COFFEE_MAKER': 'Coffee/tea facilities',
  'COFFEE_MACHINE': 'Coffee/tea facilities',
  'ESPRESSO_MACHINE': 'Coffee/tea facilities',
  'TEA_KETTLE': 'Coffee/tea facilities',
  'KETTLE': 'Electric kettle',
  'ELECTRIC_KETTLE': 'Electric kettle',
  'KITCHENETTE': 'Kitchenette',
  'KITCHEN': 'Kitchenette',
  'FULL_KITCHEN': 'Kitchenette',
  'MICROWAVE': 'Microwave',
  'OVEN': 'Oven',
  'STOVE': 'Oven',
  'REFRIGERATOR': 'Refrigerator',
  'FRIDGE': 'Refrigerator',
  'MINI_FRIDGE': 'Refrigerator',
  'TOASTER': 'Toaster',
  'HOT_PLATE': 'Two Plate Stove',
  'COOKING_BASICS': 'Kitchenette',
  'DISHES_SILVERWARE': 'Kitchenette',
  'DISHWASHER': 'Dishwasher',
  'FREEZER': 'Freezer',
  
  // Room Features
  'AIR_CONDITIONING': 'Airconditioned room',
  'AC': 'Airconditioned room',
  'CENTRAL_AIR': 'Airconditioned room',
  'HEATING': 'Heating',
  'CENTRAL_HEATING': 'Heating',
  'FIREPLACE': 'Fireplace',
  'INDOOR_FIREPLACE': 'Fireplace',
  'FAN': 'Fan',
  'CEILING_FAN': 'Fan',
  'PORTABLE_FAN': 'Fan',
  'BALCONY': 'Balcony/Patio',
  'PATIO': 'Balcony/Patio',
  'TERRACE': 'Balcony/Patio',
  'DECK': 'Balcony/Patio',
  'VERANDA': 'Balcony/Patio',
  
  // Entertainment
  'TV': 'Flat screen TV',
  'TELEVISION': 'Flat screen TV',
  'CABLE_TV': 'Flat screen TV',
  'SMART_TV': 'Flat screen TV',
  'FLAT_SCREEN_TV': 'Flat screen TV',
  'HDTV': 'Flat screen TV',
  'WIFI': 'Free WiFi',
  'INTERNET': 'Free WiFi',
  'WIRELESS_INTERNET': 'Free WiFi',
  'FREE_WIFI': 'Free WiFi',
  'HIGH_SPEED_INTERNET': 'Free WiFi',
  'DEDICATED_WORKSPACE': 'Desk',
  'DESK': 'Desk',
  'WORK_DESK': 'Desk',
  'DVD_PLAYER': 'DVD Player',
  'STEREO': 'Sound system',
  'SOUND_SYSTEM': 'Sound system',
  'BLUETOOTH_SPEAKER': 'Sound system',
  
  // Laundry
  'WASHER': 'Washing machine',
  'WASHING_MACHINE': 'Washing machine',
  'LAUNDRY': 'Washing machine',
  'DRYER': 'Tumble dryer',
  'TUMBLE_DRYER': 'Tumble dryer',
  'IRON': 'Iron/Ironing board',
  'IRONING_BOARD': 'Iron/Ironing board',
  
  // Bathroom
  'HAIR_DRYER': 'Hairdryer',
  'HAIRDRYER': 'Hairdryer',
  'BATHTUB': 'Bath',
  'BATH': 'Bath',
  'SHOWER': 'Shower',
  'RAIN_SHOWER': 'Shower',
  'BIDET': 'Bidet',
  
  // Security & Safety
  'SAFE': 'Safe',
  'IN_ROOM_SAFE': 'Safe',
  'SAFETY_DEPOSIT_BOX': 'Safe',
  'SMOKE_DETECTOR': 'Smoke detector',
  'CARBON_MONOXIDE_DETECTOR': 'Carbon monoxide detector',
  'FIRE_EXTINGUISHER': 'Fire extinguisher',
  'FIRST_AID_KIT': 'First aid kit',
  'SECURITY_CAMERAS': 'Security cameras',
  'ALARM_SYSTEM': 'Alarm system',
  
  // Outdoor
  'POOL': 'Pool',
  'SWIMMING_POOL': 'Pool',
  'PRIVATE_POOL': 'Pool',
  'SHARED_POOL': 'Pool',
  'HOT_TUB': 'Hot tub',
  'JACUZZI': 'Hot tub',
  'GARDEN': 'Garden',
  'OUTDOOR_SPACE': 'Garden',
  'PATIO_FURNITURE': 'Outdoor furniture',
  'OUTDOOR_DINING': 'Outdoor furniture',
  
  // Parking
  'PARKING': 'Parking',
  'FREE_PARKING': 'Parking',
  'GARAGE': 'Garage',
  'COVERED_PARKING': 'Covered parking',
  
  // Accessibility
  'ELEVATOR': 'Elevator',
  'LIFT': 'Elevator',
  'WHEELCHAIR_ACCESSIBLE': 'Wheelchair accessible',
  'ACCESSIBLE': 'Wheelchair accessible',
};

/**
 * Correlate raw Hostfully amenity codes to ROL facility values
 */
export function correlateFacilities(rawAmenities: string[]): string[] {
  if (!Array.isArray(rawAmenities)) return [];
  
  const matched = rawAmenities
    .map(a => {
      const key = String(a).toUpperCase().replace(/[\s-]/g, '_');
      return HOSTFULLY_FACILITY_MAP[key] || null;
    })
    .filter((v): v is string => v !== null);
  
  // Return unique values
  return [...new Set(matched)];
}

// ============================================================================
// AMENITIES CORRELATION  
// ============================================================================

/**
 * Maps Hostfully amenity codes to ROL amenity values
 * These map to the \"Amenities\" section (in-room items)
 */
export const HOSTFULLY_AMENITY_MAP: Record<string, string> = {
  // Bathroom supplies
  'TOILETRIES': 'Toiletries',
  'BASIC_TOILETRIES': 'Toiletries',
  'ESSENTIALS': 'Toiletries',
  'SHAMPOO': 'Toiletries',
  'CONDITIONER': 'Toiletries',
  'BODY_WASH': 'Toiletries',
  'SOAP': 'Hand wash',
  'HAND_SOAP': 'Hand wash',
  'TOWELS': 'Towels',
  'BATH_TOWELS': 'Towels',
  'POOL_TOWELS': 'Pool towels',
  'BEACH_TOWELS': 'Beach towels',
  'LINENS': 'Linen',
  'BED_LINENS': 'Linen',
  'SHEETS': 'Linen',
  'BATHROBE': 'Bathrobe',
  'ROBE': 'Bathrobe',
  'SLIPPERS': 'Slippers',
  'TOILET_PAPER': 'Toilet paper',
  
  // Bedroom
  'PILLOWS': 'Pillows',
  'EXTRA_PILLOWS': 'Extra pillows',
  'BLANKETS': 'Blankets',
  'EXTRA_BLANKETS': 'Extra blankets',
  'HANGERS': 'Hangers',
  'CLOSET': 'Wardrobe',
  'WARDROBE': 'Wardrobe',
  'DRESSER': 'Dresser',
  'BLACKOUT_CURTAINS': 'Blackout curtains',
  'BLACKOUT_SHADES': 'Blackout curtains',
  
  // Kitchen
  'COOKING_BASICS': 'Cooking basics',
  'DISHES': 'Dishes',
  'GLASSES': 'Glasses',
  'CUTLERY': 'Cutlery',
  'POTS_PANS': 'Pots and pans',
  
  // Baby/Child
  'CRIB': 'Baby cot',
  'BABY_COT': 'Baby cot',
  'HIGH_CHAIR': 'High chair',
  'HIGHCHAIR': 'High chair',
  'CHILDREN_BOOKS': 'Children books',
  'TOYS': 'Toys',
  'BABY_BATH': 'Baby bath',
  'BABY_MONITOR': 'Baby monitor',
  
  // Other
  'UMBRELLA': 'Umbrella',
  'BEACH_CHAIRS': 'Beach chairs',
  'COOLER': 'Cooler',
  'LUGGAGE_RACK': 'Luggage rack',
};

/**
 * Correlate raw Hostfully amenity codes to ROL amenity values
 */
export function correlateAmenities(rawAmenities: string[]): string[] {
  if (!Array.isArray(rawAmenities)) return [];
  
  const matched = rawAmenities
    .map(a => {
      const key = String(a).toUpperCase().replace(/[\s-]/g, '_');
      return HOSTFULLY_AMENITY_MAP[key] || null;
    })
    .filter((v): v is string => v !== null);
  
  // Return unique values
  return [...new Set(matched)];
}

/**
 * Get both facilities and amenities from raw Hostfully data
 * Combines both mappings for comprehensive correlation
 */
export function correlateAllAmenities(rawAmenities: string[]): {
  facilities: string[];
  amenities: string[];
  unmatched: string[];
} {
  if (!Array.isArray(rawAmenities)) {
    return { facilities: [], amenities: [], unmatched: [] };
  }
  
  const facilities: string[] = [];
  const amenities: string[] = [];
  const unmatched: string[] = [];
  
  for (const raw of rawAmenities) {
    const key = String(raw).toUpperCase().replace(/[\s-]/g, '_');
    
    if (HOSTFULLY_FACILITY_MAP[key]) {
      facilities.push(HOSTFULLY_FACILITY_MAP[key]);
    } else if (HOSTFULLY_AMENITY_MAP[key]) {
      amenities.push(HOSTFULLY_AMENITY_MAP[key]);
    } else {
      unmatched.push(raw);
    }
  }
  
  return {
    facilities: [...new Set(facilities)],
    amenities: [...new Set(amenities)],
    unmatched,
  };
}
