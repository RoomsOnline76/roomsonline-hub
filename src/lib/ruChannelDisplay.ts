import { ChannelLogo, getChannelLabel } from "@/components/pms/channels/ChannelLogo";

export interface RuChannelInfo {
  label: string;
  channelLogoKey: string;
  isRuSourced: boolean;
}

/**
 * Map RU `channel_key` values (stored in modification_notes.ru_creator_channel)
 * to the keys used by the shared ChannelLogo component.
 */
const RU_KEY_TO_LOGO_KEY: Record<string, string> = {
  booking: "booking_com",
  lekkeslaap: "lekkeslaap",
  airbnb: "airbnb",
  expedia: "expedia",
  vrbo: "vrbo",
  agoda: "agoda",
  google: "google_hotels",
  nightsbridge: "nightsbridge",
  hyperguest: "hyperguest",
  hotelbeds: "hotelbeds",
  wetu: "wetu",
  tourplan: "tourplan",
  beds24: "beds24",
  pricelabs: "pricelabs",
  easyota: "easyota",
  ebeds: "ebeds",
  profitroom: "profitroom",
  rentals_united: "rentalsunited",
};

function isRuCreatorChannel(value: unknown): value is { channel_key?: string; channel_label?: string } {
  return typeof value === "object" && value !== null;
}

/**
 * Extract the specific source channel from a booking's modification_notes JSON.
 * Returns the channel label + a ChannelLogo-compatible key for ROL'OS Channels bookings.
 */
export function resolveRuSourceChannel(
  modificationNotes: unknown,
  bookingChannel?: string | null,
  integrationType?: string | null,
): RuChannelInfo {
  const isRuSourced =
    bookingChannel === "rentals_united" ||
    (integrationType || "").toLowerCase().startsWith("rentalsunited");

  const notesArray = Array.isArray(modificationNotes) ? modificationNotes : [];
  const lastNote = notesArray[notesArray.length - 1];
  const creator = lastNote && typeof lastNote === "object" ? (lastNote as Record<string, unknown>).ru_creator_channel : null;

  if (isRuSourced && isRuCreatorChannel(creator)) {
    const ruKey = (creator.channel_key || "").toLowerCase();
    const label = creator.channel_label || getChannelLabel(RU_KEY_TO_LOGO_KEY[ruKey] || ruKey);
    return {
      label,
      channelLogoKey: RU_KEY_TO_LOGO_KEY[ruKey] || ruKey || "rentalsunited",
      isRuSourced: true,
    };
  }

  return {
    label: "ROL'OS Channels",
    channelLogoKey: "rentalsunited",
    isRuSourced,
  };
}

export { ChannelLogo, getChannelLabel };
