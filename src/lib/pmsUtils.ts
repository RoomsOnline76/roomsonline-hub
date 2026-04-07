// ============================================================================
// PMS UTILITIES - Shared response handling for all PMS adapters
// Uses Zod-inferred types from src/lib/schemas/pms.ts
// ============================================================================

import type {
  RoomType,
  DailyRate,
  DailyAvailability,
  AdapterResponse,
} from "@/lib/schemas/pms";

// ── Adapter response unwrapping ─────────────────────────────────────────────

/**
 * Unwraps adapter contract response to get the data payload.
 */
export function unwrapAdapterResponse<T = unknown>(response: unknown): T | null {
  if (!response) return null;
  const r = response as Record<string, unknown>;
  if (r.success === undefined) return response as T;
  if (!r.success) return null;
  return r.data as T;
}

/**
 * Type guard to check if adapter response was successful
 */
export function isAdapterSuccess(response: unknown): boolean {
  return (response as Record<string, unknown>)?.success === true;
}

/**
 * Gets error message from adapter response
 */
export function getAdapterError(response: unknown): string | null {
  const r = response as Record<string, unknown> | null;
  if (!r?.error) return null;
  const err = r.error as Record<string, string>;
  return err.message || err.code || "Unknown error";
}

// ── Room type extraction (handles both snake_case contract & legacy camelCase) ──

export function extractRoomTypes(responseData: unknown): RoomType[] {
  if (!responseData) return [];
  const d = responseData as Record<string, unknown>;
  if (Array.isArray(d.room_types)) return d.room_types as RoomType[];
  if (Array.isArray((d as Record<string, unknown>).roomTypes))
    return (d as Record<string, unknown>).roomTypes as RoomType[];
  if (Array.isArray(responseData)) return responseData as RoomType[];
  return [];
}

export function extractRateTypes(responseData: unknown): unknown[] {
  if (!responseData) return [];
  const d = responseData as Record<string, unknown>;
  if (Array.isArray(d.rate_types)) return d.rate_types;
  if (Array.isArray(d.rateTypes)) return d.rateTypes;
  return [];
}

// ── Field accessors (dual-format) ───────────────────────────────────────────

export function getRoomTypeId(room: Record<string, unknown>): string {
  return String(room.room_type_id ?? room.roomTypeId ?? room.id ?? "");
}

export function getRoomTypeName(room: Record<string, unknown>): string {
  return (
    (room.room_type_name as string) ??
    (room.roomTypeName as string) ??
    (room.name as string) ??
    `Room ${getRoomTypeId(room)}`
  );
}

export function getRateTypeId(rate: Record<string, unknown>): string {
  return String(rate.rate_type_id ?? rate.rateTypeId ?? rate.id ?? "");
}

export function getRateTypeName(rate: Record<string, unknown>): string {
  return (
    (rate.rate_type_name as string) ??
    (rate.rateTypeName as string) ??
    (rate.name as string) ??
    `Rate ${getRateTypeId(rate)}`
  );
}

export function getRoomAvailability(room: Record<string, unknown>): DailyAvailability[] {
  return (room.rooms_available_per_night ?? room.roomsAvailablePerNight ?? []) as DailyAvailability[];
}

export function getRoomRateTypes(room: Record<string, unknown>): unknown[] {
  return (room.rate_types ?? room.rateTypes ?? []) as unknown[];
}

export function getRateTypeRates(rateType: Record<string, unknown>): DailyRate[] {
  return (rateType.rates ?? []) as DailyRate[];
}

// ── Daily rate values (dual-format) ─────────────────────────────────────────

export function getDailyRateValues(rate: Record<string, unknown>): {
  roomAmount: number;
  adultAmounts?: Record<string, number>;
  teenAmount?: number;
  childAmount?: number;
  infantAmount?: number;
} {
  const adultAmounts: Record<string, number> = {};

  if (rate.adult_amounts && typeof rate.adult_amounts === "object") {
    Object.entries(rate.adult_amounts as Record<string, number>).forEach(
      ([key, value]) => {
        adultAmounts[key] = value;
      },
    );
  }

  for (let i = 1; i <= 10; i++) {
    const camelKey = `adultAmount${i}`;
    if (rate[camelKey] !== undefined) {
      adultAmounts[camelKey] = rate[camelKey] as number;
    }
  }

  return {
    roomAmount: (rate.room_amount ?? rate.roomAmount ?? 0) as number,
    adultAmounts:
      Object.keys(adultAmounts).length > 0 ? adultAmounts : undefined,
    teenAmount: (rate.teen_amount ?? rate.teenAmount) as number | undefined,
    childAmount: (rate.child_amount ?? rate.childAmount) as number | undefined,
    infantAmount: (rate.infant_amount ?? rate.infantAmount) as number | undefined,
  };
}

// ── Daily availability values (dual-format) ─────────────────────────────────

export function getDailyAvailabilityValues(avail: Record<string, unknown>): {
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
    date: avail.date as string,
    availableUnits: (avail.available_units ?? avail.numberOfRoomsAvailable ?? 0) as number,
    stopSell: (avail.stop_sell ?? avail.stopSell ?? avail.isClosed ?? false) as boolean,
    minStay: (avail.min_stay ?? avail.minimumStay ?? avail.minStay) as number | undefined,
    maxStay: (avail.max_stay ?? avail.maximumStay ?? avail.maxStay) as number | undefined,
    leadDaysAdvance: (avail.lead_days_advance ?? avail.leadDaysAdvance) as number | undefined,
    leadDaysPost: (avail.lead_days_post ?? avail.leadDaysPost) as number | undefined,
    closedToArrival: (avail.closed_to_arrival ?? avail.closedToArrival ?? false) as boolean,
    closedToDeparture: (avail.closed_to_departure ?? avail.closedToDeparture ?? false) as boolean,
  };
}

// Re-export PMS interfaces for backward compatibility
export type { RoomType as PMSRoomType } from "@/lib/schemas/pms";
export type { DailyAvailability as PMSDailyAvailability } from "@/lib/schemas/pms";
export type { DailyRate as PMSDailyRate } from "@/lib/schemas/pms";
export type { RateType as PMSRateType } from "@/lib/schemas/pms";
