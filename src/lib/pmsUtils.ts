// ============================================================================
// PMS UTILITIES - Shared response handling for all PMS adapters
// ============================================================================

/**
 * Unwraps adapter contract response to get the data payload.
 * Handles nested data structure from adapter responses.
 * 
 * Adapter responses have structure:
 * { success: boolean, data: T, error: {...}, source: string, fetched_at: string, action: string }
 */
export function unwrapAdapterResponse<T = any>(response: any): T | null {
  if (!response) return null;
  
  // Check if response itself is the data (direct API call)
  if (response.success === undefined) {
    return response as T;
  }
  
  // Check success flag
  if (!response.success) return null;
  
  // Return the nested data
  return response.data as T;
}

/**
 * Type guard to check if adapter response was successful
 */
export function isAdapterSuccess(response: any): boolean {
  return response?.success === true;
}

/**
 * Gets error message from adapter response
 */
export function getAdapterError(response: any): string | null {
  if (!response?.error) return null;
  return response.error.message || response.error.code || 'Unknown error';
}

// ============================================================================
// AVAILABILITY DATA INTERFACES (snake_case per adapter contract)
// ============================================================================

export interface PMSRoomType {
  room_type_id: string;
  room_type_name: string;
  rooms_available_per_night?: PMSDailyAvailability[];
  rate_types?: PMSRateType[];
}

export interface PMSDailyAvailability {
  date: string;
  available_units: number;
  stop_sell?: boolean;
  min_stay?: number;
  max_stay?: number;
  lead_days_advance?: number;
  lead_days_post?: number;
  closed_to_arrival?: boolean;
  closed_to_departure?: boolean;
}

export interface PMSRateType {
  rate_type_id: string;
  rate_type_name: string;
  price_type?: string;
  rates?: PMSDailyRate[];
}

export interface PMSDailyRate {
  date: string;
  room_amount?: number;
  adult_amounts?: Record<string, number>;
  teen_amount?: number;
  child_amount?: number;
  infant_amount?: number;
}

// ============================================================================
// LEGACY CAMELCASE SUPPORT (for raw Benson data that hasn't been transformed)
// ============================================================================

/**
 * Extracts room types from adapter response, handling both snake_case (contract)
 * and camelCase (legacy/raw Benson) formats.
 */
export function extractRoomTypes(responseData: any): any[] {
  if (!responseData) return [];
  
  // Try snake_case first (contract format)
  if (responseData.room_types && Array.isArray(responseData.room_types)) {
    return responseData.room_types;
  }
  
  // Fallback to camelCase (legacy format)
  if (responseData.roomTypes && Array.isArray(responseData.roomTypes)) {
    return responseData.roomTypes;
  }
  
  // If response is already an array
  if (Array.isArray(responseData)) {
    return responseData;
  }
  
  return [];
}

/**
 * Extracts rate types from adapter response
 */
export function extractRateTypes(responseData: any): any[] {
  if (!responseData) return [];
  
  // Try snake_case first (contract format)
  if (responseData.rate_types && Array.isArray(responseData.rate_types)) {
    return responseData.rate_types;
  }
  
  // Fallback to camelCase (legacy format)
  if (responseData.rateTypes && Array.isArray(responseData.rateTypes)) {
    return responseData.rateTypes;
  }
  
  return [];
}

/**
 * Gets room type ID from room object (handles both formats)
 */
export function getRoomTypeId(room: any): string {
  return String(room.room_type_id ?? room.roomTypeId ?? room.id ?? '');
}

/**
 * Gets room type name from room object (handles both formats)
 */
export function getRoomTypeName(room: any): string {
  return room.room_type_name ?? room.roomTypeName ?? room.name ?? `Room ${getRoomTypeId(room)}`;
}

/**
 * Gets rate type ID from rate object (handles both formats)
 */
export function getRateTypeId(rate: any): string {
  return String(rate.rate_type_id ?? rate.rateTypeId ?? rate.id ?? '');
}

/**
 * Gets rate type name from rate object (handles both formats)
 */
export function getRateTypeName(rate: any): string {
  return rate.rate_type_name ?? rate.rateTypeName ?? rate.name ?? `Rate ${getRateTypeId(rate)}`;
}

/**
 * Gets availability array from room type (handles both formats)
 */
export function getRoomAvailability(room: any): any[] {
  return room.rooms_available_per_night ?? room.roomsAvailablePerNight ?? [];
}

/**
 * Gets rate types array from room type (handles both formats)
 */
export function getRoomRateTypes(room: any): any[] {
  return room.rate_types ?? room.rateTypes ?? [];
}

/**
 * Gets rates array from rate type (handles both formats)
 */
export function getRateTypeRates(rateType: any): any[] {
  return rateType.rates ?? [];
}

/**
 * Gets daily rate values (handles both formats)
 */
export function getDailyRateValues(rate: any): {
  roomAmount: number;
  adultAmounts?: Record<string, number>;
  teenAmount?: number;
  childAmount?: number;
  infantAmount?: number;
} {
  const adultAmounts: Record<string, number> = {};
  
  // Handle snake_case
  if (rate.adult_amounts) {
    Object.entries(rate.adult_amounts).forEach(([key, value]) => {
      adultAmounts[key] = value as number;
    });
  }
  
  // Handle camelCase adult amounts (adultAmount1, adultAmount2, etc.)
  for (let i = 1; i <= 10; i++) {
    const camelKey = `adultAmount${i}`;
    if (rate[camelKey] !== undefined) {
      adultAmounts[camelKey] = rate[camelKey];
    }
  }
  
  return {
    roomAmount: rate.room_amount ?? rate.roomAmount ?? 0,
    adultAmounts: Object.keys(adultAmounts).length > 0 ? adultAmounts : undefined,
    teenAmount: rate.teen_amount ?? rate.teenAmount,
    childAmount: rate.child_amount ?? rate.childAmount,
    infantAmount: rate.infant_amount ?? rate.infantAmount,
  };
}

/**
 * Gets daily availability values (handles both formats)
 */
export function getDailyAvailabilityValues(avail: any): {
  date: string;
  availableUnits: number;
  stopSell: boolean;
  minStay?: number;
  maxStay?: number;
  leadDaysAdvance?: number;
  leadDaysPost?: number;
  closedToArrival: boolean;
  closedToDeparture: boolean;
} {
  return {
    date: avail.date,
    availableUnits: avail.available_units ?? avail.numberOfRoomsAvailable ?? 0,
    stopSell: avail.stop_sell ?? avail.stopSell ?? avail.isClosed ?? false,
    minStay: avail.min_stay ?? avail.minimumStay ?? avail.minStay,
    maxStay: avail.max_stay ?? avail.maximumStay ?? avail.maxStay,
    leadDaysAdvance: avail.lead_days_advance ?? avail.leadDaysAdvance,
    leadDaysPost: avail.lead_days_post ?? avail.leadDaysPost,
    closedToArrival: avail.closed_to_arrival ?? avail.closedToArrival ?? false,
    closedToDeparture: avail.closed_to_departure ?? avail.closedToDeparture ?? false,
  };
}
