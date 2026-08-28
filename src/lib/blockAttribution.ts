import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";

/** Attribution stamped on `property_availability` rows when a night is blocked. */
export interface BlockAttribution {
  blocked_by: string | null;
  blocked_by_label: string | null;
  blocked_reason: string | null;
  blocked_at: string;
}

/** Details read back from a blocked availability row, for tooltips. */
export interface BlockDetail {
  label: string | null;
  at: string | null;
  reason: string | null;
  source: string | null;
}

/** Friendly labels for blocks written by sync jobs rather than a person. */
const SYSTEM_LABELS: Record<string, string> = {
  manual: "Manual block",
  rentalsunited: "Channel Manager",
  ru: "Channel Manager",
  channel_manager: "Channel Manager",
  nightsbridge: "NightsBridge",
  hostfully: "Hostfully",
  benson: "Benson",
  hotelbeds: "HotelBeds",
  hyperguest: "HyperGuest",
};

export const systemBlockLabel = (source: string | null | undefined): string | null => {
  if (!source) return null;
  const key = source.trim().toLowerCase();
  return SYSTEM_LABELS[key] || source;
};

/**
 * Resolve the signed-in user into an attribution stamp. Falls back to a plain
 * "Manual block" label when the profile name is unavailable.
 */
export async function currentBlockAttribution(reason?: string | null): Promise<BlockAttribution> {
  const stamp: BlockAttribution = {
    blocked_by: null,
    blocked_by_label: null,
    blocked_reason: reason?.trim() ? reason.trim() : null,
    blocked_at: new Date().toISOString(),
  };
  try {
    const { data } = await supabase.auth.getUser();
    const user = data?.user;
    if (!user) return stamp;
    stamp.blocked_by = user.id;
    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, email")
      .eq("id", user.id)
      .maybeSingle();
    stamp.blocked_by_label =
      (profile?.full_name as string | null) || (profile?.email as string | null) || user.email || null;
  } catch {
    /* attribution is best-effort — never block the write */
  }
  return stamp;
}

/** Multi-line tooltip text for a blocked night. */
export function formatBlockedTooltip(date: Date, detail?: BlockDetail | null): string {
  const lines = [`Blocked — ${format(date, "d MMM yyyy")}`];
  const who = detail?.label || systemBlockLabel(detail?.source);
  if (who) {
    const when = detail?.at ? format(new Date(detail.at), "d MMM yyyy HH:mm") : null;
    lines.push(when ? `By ${who} · ${when}` : `By ${who}`);
  } else {
    lines.push("Source unknown");
  }
  if (detail?.reason) lines.push(detail.reason);
  return lines.join("\n");
}

/**
 * Rows written as a side effect of a ROLOS booking (`external_system = 'rolos'`,
 * no operator attribution) are NOT property blocks. Occupancy is derived from
 * `bookings` + `rolos_booking_rooms`; these leftover rows outlive cancellations
 * and used to paint a night as "Blocked by the property" with nothing behind it
 * — and they were never pushed to the channel, so the channel showed it open.
 */
export function isBookingOccupancyRow(
  source: string | null | undefined,
  reason?: string | null,
  blockedBy?: string | null,
): boolean {
  const key = (source ?? "").trim().toLowerCase();
  if (key !== "rolos") return false;
  if (blockedBy) return false;
  const r = (reason ?? "").trim();
  return r.length === 0 || r.startsWith("channel_booking:") || r.startsWith("booking:");
}
