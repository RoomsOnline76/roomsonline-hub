// Channel-side stay edits: the brief re-open window.
//
// When an operator re-shapes an existing channel reservation inside the Channel Manager portal,
// the portal re-checks OUR calendar for the new stay — and finds the nights closed, because those
// very nights are stamped shut for the booking being edited. The portal then saves a reservation
// with an empty `<StayInfos />` ("dates not available") and nothing reaches ROL'OS.
//
// The chosen policy is a short, stamped re-open: when a stay-less notification arrives that clearly
// belongs to a live channel booking, that booking's own nights are released and pushed back to the
// channel, so the portal edit succeeds on the operator's next attempt. A queued close job re-stamps
// the nights when the window expires, unless the modification already landed (dates moved) or the
// booking was cancelled.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import {
  CHANNEL_BLOCK_LABEL,
  channelBlockReason,
  releaseChannelBlocksForBooking,
} from "./ruReservationParsing.ts";
import { enqueueJob } from "./jobQueue.ts";
import { queueRuAriDelta } from "./ruAriDelta.ts";

// deno-lint-disable-next-line no-explicit-any
type Db = any;

/** How long the booking's own nights stay open for a channel-side edit. */
export const CHANNEL_EDIT_WINDOW_MINUTES = 15;

export interface ChannelEditWindowNight {
  property_id: string;
  room_type: string;
  date: string;
}

export interface ChannelEditWindowResult {
  opened: boolean;
  bookingId: string | null;
  nights: number;
  reason?: string;
}

/**
 * Open the window for the live booking a stay-less channel notification belongs to.
 * Never opens for a reservation we already know (that one is a normal update), and never
 * touches operator blocks — only nights stamped with this booking.
 */
export async function openRuChannelEditWindow(
  supabase: Db,
  args: {
    reservationId: string;
    guestEmail?: string | null;
    guestName?: string | null;
    propertyId?: string | null;
    logPrefix?: string;
    windowMinutes?: number;
  },
): Promise<ChannelEditWindowResult> {
  const log = args.logPrefix ?? "[ru-edit-window]";
  const email = (args.guestEmail || "").trim();
  const name = (args.guestName || "").trim();
  if (!email && !name) return { opened: false, bookingId: null, nights: 0, reason: "no_guest_identity" };

  const today = new Date().toISOString().slice(0, 10);
  let query = supabase
    .from("bookings")
    .select("id, property_id, guest_email, guest_name, check_in_date, check_out_date, status, external_reservation_id")
    .eq("integration_type", "rentals_united")
    .in("status", ["pending", "confirmed"])
    .gte("check_out_date", today)
    .neq("external_reservation_id", args.reservationId)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (args.propertyId) query = query.eq("property_id", args.propertyId);

  const { data, error } = await query;
  if (error) {
    console.warn(`${log} Candidate lookup failed: ${error.message}`);
    return { opened: false, bookingId: null, nights: 0, reason: "lookup_failed" };
  }

  const rows = (data || []) as Array<{
    id: string;
    property_id: string;
    guest_email: string | null;
    guest_name: string | null;
  }>;
  const match = rows.find((b) =>
    (email && (b.guest_email || "").trim().toLowerCase() === email.toLowerCase()) ||
    (name && (b.guest_name || "").trim().toLowerCase() === name.toLowerCase())
  );
  if (!match) return { opened: false, bookingId: null, nights: 0, reason: "no_matching_booking" };

  // Capture the stamped nights BEFORE releasing them — the close job re-draws exactly these.
  const { data: stamped } = await supabase
    .from("property_availability")
    .select("property_id, room_type, date")
    .eq("blocked_reason", channelBlockReason(match.id));
  const nights = (stamped || []) as ChannelEditWindowNight[];
  if (nights.length === 0) return { opened: false, bookingId: match.id, nights: 0, reason: "no_stamped_nights" };

  const released = await releaseChannelBlocksForBooking(supabase, match.id, log);
  if (released === 0) return { opened: false, bookingId: match.id, nights: 0, reason: "release_failed" };

  const minutes = args.windowMinutes ?? CHANNEL_EDIT_WINDOW_MINUTES;
  await enqueueJob(
    supabase as SupabaseClient,
    "channel_edit_window_close",
    { booking_id: match.id, nights, reservation_id: args.reservationId },
    { dedupeKey: `edit_window:${match.id}`, delaySeconds: minutes * 60 },
  );

  // The channel must see the nights free, otherwise the portal edit fails again.
  await queueRuAriDelta(supabase, match.property_id, "channel_edit_window", { force: true });

  console.log(
    `${log} Opened a ${minutes}-minute edit window on booking ${match.id}: ${released} night(s) released for channel-side change of reservation ${args.reservationId}`,
  );
  return { opened: true, bookingId: match.id, nights: released };
}

/**
 * Close the window: re-stamp the booking's own nights unless the edit already landed
 * (dates moved, so the ingest re-drew them) or the booking is no longer live.
 */
export async function closeRuChannelEditWindow(
  supabase: Db,
  args: { bookingId: string; nights: ChannelEditWindowNight[]; logPrefix?: string },
): Promise<{ restamped: number; reason?: string }> {
  const log = args.logPrefix ?? "[ru-edit-window]";
  const { data: booking } = await supabase
    .from("bookings")
    .select("id, property_id, status, check_in_date, check_out_date")
    .eq("id", args.bookingId)
    .maybeSingle();
  if (!booking) return { restamped: 0, reason: "booking_gone" };
  if (booking.status === "cancelled" || booking.status === "no_show") {
    return { restamped: 0, reason: "booking_settled" };
  }

  // The modification landed: the ingest already stamped the new nights, so nothing to restore.
  const { count } = await supabase
    .from("property_availability")
    .select("id", { count: "exact", head: true })
    .eq("blocked_reason", channelBlockReason(args.bookingId));
  if ((count ?? 0) > 0) return { restamped: 0, reason: "already_restamped" };

  const stampedAt = new Date().toISOString();
  const wanted = (args.nights || []).filter((n) =>
    n?.property_id && n?.room_type && n?.date &&
    n.date >= String(booking.check_in_date) && n.date < String(booking.check_out_date)
  );
  if (wanted.length === 0) return { restamped: 0, reason: "no_nights_to_restore" };

  const { error } = await supabase.from("property_availability").upsert(
    wanted.map((n) => ({
      property_id: n.property_id,
      room_type: n.room_type,
      date: n.date,
      external_system: "manual",
      available_units: 0,
      is_stop_sell: true,
      blocked_by_label: CHANNEL_BLOCK_LABEL,
      blocked_reason: channelBlockReason(args.bookingId),
      blocked_at: stampedAt,
    })),
    { onConflict: "property_id,room_type,date", ignoreDuplicates: false },
  );
  if (error) {
    console.error(`${log} Re-stamp failed for booking ${args.bookingId}: ${error.message}`);
    throw new Error(`Edit-window close failed: ${error.message}`);
  }

  await queueRuAriDelta(supabase, booking.property_id, "channel_edit_window_close", { force: true });
  console.log(`${log} Closed edit window on booking ${args.bookingId}: ${wanted.length} night(s) re-stamped`);
  return { restamped: wanted.length };
}
