/**
 * Durable booking-action trail for Diagnostics.
 *
 * Every booking verb — outbound (created, moved, dates, pax, price, deposit, notes, confirmed,
 * cancelled, no_show) and inbound (the channel telling us a reservation was confirmed, modified,
 * cancelled or requested) — writes exactly one row here, INCLUDING the cases that resolve as
 * `skipped`. A skip is evidence, not silence: without the row an operator cannot tell "we chose
 * not to push" from "nothing ran".
 *
 * Writes are best-effort: bookkeeping must never fail a sync or reject a channel notification.
 */

// deno-lint-ignore no-explicit-any
type Db = any;

export type BookingEventDirection = 'outbound' | 'inbound';

export type BookingEventAction =
  | 'created'
  | 'moved'
  | 'dates'
  | 'pax'
  | 'price'
  | 'deposit'
  | 'payment'
  | 'notes'
  | 'confirmed'
  | 'cancelled'
  | 'no_show'
  | 'status'
  | 'deleted'
  | 'request'
  | 'modified'
  | 'unknown';

export type BookingEventOutcome =
  | 'pushed'
  | 'queued'
  | 'skipped'
  | 'failed'
  | 'ingested';

export interface BookingEventInput {
  booking_id?: string | null;
  property_id?: string | null;
  unit_id?: string | null;
  direction: BookingEventDirection;
  action: BookingEventAction;
  /** Where the action came from: `dashboard_move`, `booking_drawer`, `background_job`, `rlnm`, `reconcile_pull`. */
  source?: string | null;
  outcome: BookingEventOutcome;
  reason?: string | null;
  channel_reservation_id?: string | null;
  channel_listing_id?: string | null;
  channel_owner_id?: string | null;
  trace_id?: string | null;
  summary?: string | null;
  details?: Record<string, unknown>;
}

export async function recordChannelBookingEvent(
  supabase: Db,
  input: BookingEventInput,
): Promise<void> {
  try {
    await supabase.from('channel_booking_events').insert({
      booking_id: input.booking_id ?? null,
      property_id: input.property_id ?? null,
      unit_id: input.unit_id ?? null,
      direction: input.direction,
      action: input.action,
      source: input.source ?? null,
      outcome: input.outcome,
      reason: input.reason ?? null,
      channel_reservation_id: input.channel_reservation_id ? String(input.channel_reservation_id) : null,
      channel_listing_id: input.channel_listing_id ? String(input.channel_listing_id) : null,
      channel_owner_id: input.channel_owner_id ? String(input.channel_owner_id) : null,
      trace_id: input.trace_id ?? null,
      summary: input.summary ?? null,
      details: input.details ?? {},
    });
  } catch (err) {
    console.warn('[channelBookingEvents] could not record event:', err);
  }
}

/** A booking change verb mapped onto the trail's action vocabulary. */
export function bookingActionFromChange(
  change: string | null | undefined,
  status?: string | null,
): BookingEventAction {
  const s = String(status ?? '').toLowerCase();
  const c = String(change ?? 'unknown').toLowerCase();
  if (c === 'cancelled' && (s === 'no_show' || s === 'noshow')) return 'no_show';
  if (c === 'status') {
    if (s === 'confirmed') return 'confirmed';
    if (s === 'no_show' || s === 'noshow') return 'no_show';
    if (s === 'cancelled' || s === 'canceled') return 'cancelled';
    return 'status';
  }
  const known: BookingEventAction[] = [
    'created', 'moved', 'dates', 'pax', 'price', 'deposit', 'payment',
    'notes', 'confirmed', 'cancelled', 'no_show', 'deleted',
  ];
  return (known as string[]).includes(c) ? (c as BookingEventAction) : 'unknown';
}
