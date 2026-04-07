// ============================================================================
// PMS ZOD SCHEMAS — Runtime validation for all PMS API boundary contracts
// All field names use snake_case (matching the adapter wire format)
// ============================================================================

import { z } from "zod";

// ── Daily Availability ──────────────────────────────────────────────────────
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

// ── Daily Rate ──────────────────────────────────────────────────────────────
export const DailyRateSchema = z.object({
  date: z.string(),
  room_amount: z.number().optional(),
  adult_amounts: z.record(z.string(), z.number()).optional(),
  teen_amount: z.number().optional(),
  child_amount: z.number().optional(),
  infant_amount: z.number().optional(),
});

// ── Rate Type ───────────────────────────────────────────────────────────────
export const RateTypeSchema = z.object({
  rate_type_id: z.string(),
  rate_type_name: z.string(),
  price_type: z.string().optional(),
  rates: z.array(DailyRateSchema).optional(),
});

// ── Room Type ───────────────────────────────────────────────────────────────
export const RoomTypeSchema = z.object({
  room_type_id: z.string(),
  room_type_name: z.string(),
  rooms_available_per_night: z.array(DailyAvailabilitySchema).optional(),
  rate_types: z.array(RateTypeSchema).optional(),
});

// ── Unified Availability Response ───────────────────────────────────────────
export const AvailabilityResponseSchema = z.object({
  room_types: z.array(RoomTypeSchema),
});

// ── Adapter Response Wrapper ────────────────────────────────────────────────
export const AdapterResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown().nullable(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    })
    .nullable()
    .optional(),
  source: z.string().optional(),
  fetched_at: z.string().optional(),
  action: z.string().optional(),
});

// ── Reservation ─────────────────────────────────────────────────────────────
export const ReservationSchema = z.object({
  id: z.string(),
  property_id: z.string(),
  guest_name: z.string(),
  guest_email: z.string(),
  guest_phone: z.string().nullable().optional(),
  check_in_date: z.string(),
  check_out_date: z.string(),
  status: z.string(),
  adults: z.number(),
  children: z.number().nullable().optional(),
  infants: z.number().nullable().optional(),
  teens: z.number().nullable().optional(),
  pets: z.number().nullable().optional(),
  total_price: z.number(),
  room_type_id: z.string().nullable().optional(),
  rate_type_id: z.string().nullable().optional(),
  special_requests: z.string().nullable().optional(),
  booking_channel: z.string().nullable().optional(),
  payment_status: z.string().nullable().optional(),
  payment_method: z.string().nullable().optional(),
  external_reservation_id: z.string().nullable().optional(),
});

// ── Folio ───────────────────────────────────────────────────────────────────
export const FolioSchema = z.object({
  id: z.string(),
  reservation_id: z.string().nullable(),
  property_id: z.string(),
  guest_name: z.string().nullable(),
  status: z.string(),
  balance: z.number(),
  total_charges: z.number(),
  total_payments: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
});

export const FolioTransactionSchema = z.object({
  id: z.string(),
  folio_id: z.string(),
  transaction_type: z.string(),
  description: z.string(),
  amount: z.number(),
  created_at: z.string(),
});

export const PaymentSchema = z.object({
  id: z.string(),
  folio_id: z.string().nullable(),
  property_id: z.string(),
  amount: z.number(),
  method: z.string(),
  reference: z.string().nullable(),
  status: z.string(),
  notes: z.string().nullable(),
  created_at: z.string(),
});

export const InvoiceSchema = z.object({
  id: z.string(),
  folio_id: z.string(),
  property_id: z.string(),
  invoice_number: z.string().nullable(),
  pdf_url: z.string().nullable(),
  amount: z.number(),
  status: z.string(),
  issued_date: z.string(),
  notes: z.string().nullable(),
  created_at: z.string(),
});

// ── Guest Profile ───────────────────────────────────────────────────────────
export const GuestProfileSchema = z.object({
  id: z.string(),
  property_id: z.string(),
  full_name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  nationality: z.string().nullable().optional(),
  id_number: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string(),
});

// ── Housekeeping ────────────────────────────────────────────────────────────
export const HousekeepingTaskSchema = z.object({
  id: z.string(),
  property_id: z.string(),
  room_id: z.string().nullable().optional(),
  room_number: z.string().nullable().optional(),
  task_type: z.string(),
  status: z.string(),
  assigned_to: z.string().nullable().optional(),
  priority: z.string().optional(),
  notes: z.string().nullable().optional(),
  scheduled_date: z.string().optional(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string(),
});

// ── Inferred TypeScript types ───────────────────────────────────────────────
export type DailyAvailability = z.infer<typeof DailyAvailabilitySchema>;
export type DailyRate = z.infer<typeof DailyRateSchema>;
export type RateType = z.infer<typeof RateTypeSchema>;
export type RoomType = z.infer<typeof RoomTypeSchema>;
export type AvailabilityResponse = z.infer<typeof AvailabilityResponseSchema>;
export type AdapterResponse = z.infer<typeof AdapterResponseSchema>;
export type Reservation = z.infer<typeof ReservationSchema>;
export type Folio = z.infer<typeof FolioSchema>;
export type FolioTransaction = z.infer<typeof FolioTransactionSchema>;
export type Payment = z.infer<typeof PaymentSchema>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export type GuestProfile = z.infer<typeof GuestProfileSchema>;
export type HousekeepingTask = z.infer<typeof HousekeepingTaskSchema>;
