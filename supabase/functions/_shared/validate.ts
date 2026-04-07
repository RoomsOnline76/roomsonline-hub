// ============================================================================
// SHARED VALIDATION UTILITY — Soft-parse for edge function responses
// Logs validation errors but still returns data (no production breakage)
// ============================================================================

import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

/**
 * Soft-validates data against a Zod schema.
 * On success: returns parsed data.
 * On failure: logs the validation errors and returns the original data unchanged.
 * This prevents breaking production while surfacing contract violations in logs.
 */
export function safeParseResponse<T extends z.ZodTypeAny>(
  schema: T,
  data: unknown,
  context: string,
): z.infer<T> {
  const result = schema.safeParse(data);
  if (!result.success) {
    console.warn(
      `[Validation][${context}] Schema mismatch — returning data anyway. Issues:`,
      JSON.stringify(result.error.issues.slice(0, 5), null, 2),
    );
    return data as z.infer<T>;
  }
  return result.data;
}

/**
 * Validates and normalizes request input. Unlike safeParseResponse,
 * this throws on failure (requests should be validated strictly).
 */
export function parseRequestBody<T extends z.ZodTypeAny>(
  schema: T,
  body: unknown,
): z.infer<T> {
  return schema.parse(body);
}

// ── Reusable ARI schemas for edge functions ─────────────────────────────────

export const DailyAvailabilitySchema = z.object({
  date: z.string(),
  available_units: z.number(),
  stop_sell: z.boolean().optional(),
  min_stay: z.number().optional(),
  max_stay: z.number().optional(),
  lead_days_advance: z.number().optional(),
  lead_days_post: z.number().optional(),
  closed_to_arrival: z.boolean().optional(),
  closed_to_departure: z.boolean().optional(),
});

export const DailyRateSchema = z.object({
  date: z.string(),
  room_amount: z.number().optional(),
  adult_amounts: z.record(z.string(), z.number()).optional(),
  teen_amount: z.number().optional(),
  child_amount: z.number().optional(),
  infant_amount: z.number().optional(),
});

export const RateTypeSchema = z.object({
  rate_type_id: z.string(),
  rate_type_name: z.string(),
  price_type: z.string().optional(),
  rates: z.array(DailyRateSchema).optional(),
});

export const RoomTypeSchema = z.object({
  room_type_id: z.string(),
  room_type_name: z.string(),
  rooms_available_per_night: z.array(DailyAvailabilitySchema).optional(),
  rate_types: z.array(RateTypeSchema).optional(),
});

export const AvailabilityResponseSchema = z.object({
  room_types: z.array(RoomTypeSchema),
});
