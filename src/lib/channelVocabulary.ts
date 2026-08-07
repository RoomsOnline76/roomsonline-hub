/**
 * Single source of truth for how distribution is *named* in the UI.
 *
 * ROL'OS and the property editor never name the upstream vendor. Staff see
 * ROL'OS-owned language ("Channel Manager", "ROL'OS Channels", "distribution
 * account") while the code-level identifiers — table names, edge function names,
 * error codes, `booking_channel` values — stay exactly as they are.
 *
 * The admin integrations & compliance workbench is deliberately excluded: that
 * surface still names the vendor, because it is where onboarding, connection and
 * certification are driven from and engineers need to know the real system.
 */

/** The distribution system itself. */
export const CHANNEL_MANAGER = "Channel Manager";

/** Bookings and enquiries that arrived through distribution. */
export const CHANNEL_SOURCE = "ROL'OS Channels";

/** Compact badge shown on a channel-sourced booking. */
export const CHANNEL_SOURCE_BADGE = "ROL'OS";

/** The per-owner distribution identity (previously "RU sub-user / OwnerID"). */
export const DISTRIBUTION_ACCOUNT = "distribution account";

/** Title-case variant for headings and labels. */
export const DISTRIBUTION_ACCOUNT_TITLE = "Distribution account";

/** The act of sending a property and its ARI to the channel manager. */
export const PUBLISH_ACTION = "Publish to Channel Manager";

/** The stored external identifier for a published property/unit. */
export const CHANNEL_PROPERTY_ID_LABEL = "Channel Manager ID";

/** The stored external identifier for a published unit. */
export const CHANNEL_UNIT_ID_LABEL = "Unit Channel Manager ID";

/** Readiness of a property to distribute. */
export const CHANNEL_READINESS = "Channel readiness";

/**
 * Human label for a booking's channel. Distribution-sourced bookings collapse to
 * the ROL'OS Channels label; everything else keeps its own channel name.
 */
export function channelSourceLabel(bookingChannel: string | null | undefined): string {
  if (!bookingChannel) return CHANNEL_SOURCE;
  return bookingChannel === "rentals_united" || bookingChannel === "rentalsunited"
    ? CHANNEL_SOURCE
    : bookingChannel;
}
