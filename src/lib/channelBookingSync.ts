import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * Client side of the outbound booking sync.
 *
 * Any screen that changes a booking calls this after the write lands, so the Channel Manager sees
 * the same state ROL'OS does — the reservation itself for channel-sourced stays, and the
 * availability/rates delta for every stay. Rate-limit collisions are not failures: the change is
 * parked in the channel call queue and the operator is told it is on its way.
 */
export type ChannelBookingChange =
  | "created"
  | "moved"
  | "dates"
  | "pax"
  | "price"
  | "deposit"
  | "payment"
  | "notes"
  | "status"
  | "cancelled"
  | "no_show"
  | "confirmed"
  | "deleted";

export interface ChannelBookingSyncOptions {
  /** State before the change — needed so a move can free the unit it left. */
  previous?: {
    room_type_id?: string | null;
    check_in_date?: string | null;
    check_out_date?: string | null;
  } | null;
  reason?: string | null;
  /** Show toasts for the channel outcome (default true). */
  notify?: boolean;
  /** Which surface triggered the change — recorded on the Diagnostics booking trail. */
  source?: string;
}

export interface ChannelBookingSyncOutcome {
  reservation: "pushed" | "queued" | "skipped" | "failed";
  ari: "queued" | "skipped" | "failed";
  deferred: boolean;
  message?: string | null;
  code?: string | null;
}

const CHANGE_LABEL: Record<ChannelBookingChange, string> = {
  created: "New stay",
  moved: "Move",
  dates: "New dates",
  pax: "Guest count",
  price: "New price",
  deposit: "Deposit",
  payment: "Payment",
  notes: "Notes",
  status: "Status",
  cancelled: "Cancellation",
  no_show: "No-show",
  confirmed: "Confirmation",
  deleted: "Cancellation",
};

export async function pushBookingToChannel(
  bookingId: string | null | undefined,
  change: ChannelBookingChange,
  options: ChannelBookingSyncOptions = {},
): Promise<ChannelBookingSyncOutcome | null> {
  if (!bookingId) return null;
  const notify = options.notify !== false;

  try {
    const { data, error } = await supabase.functions.invoke("channel-booking-sync", {
      body: {
        booking_id: bookingId,
        change,
        previous: options.previous ?? null,
        reason: options.reason ?? null,
        source: options.source ?? "client",
      },
    });

    if (error) {
      if (notify) {
        toast.warning("Channel not updated yet", {
          description: "The change is saved here and will retry on the channel shortly.",
        });
      }
      console.warn("[channel booking sync] transport failed:", error.message);
      return { reservation: "failed", ari: "skipped", deferred: false, message: error.message };
    }

    const outcome = data as ChannelBookingSyncOutcome | null;
    if (!outcome) return null;

    if (notify) {
      const label = CHANGE_LABEL[change] ?? "Change";
      if (outcome.reservation === "failed") {
        toast.warning(`${label} not accepted by the channel`, {
          description: outcome.message ?? "It will retry automatically in the background.",
        });
      } else if (outcome.deferred || outcome.reservation === "queued") {
        toast.info("Queued for the channel", {
          description: "The channel rate limit was reached — the update goes out within a minute.",
        });
      } else if (outcome.reservation === "pushed") {
        toast.success(`${label} sent to the channel`);
      }
    }

    return outcome;
  } catch (err) {
    console.warn("[channel booking sync] error:", err);
    return {
      reservation: "failed",
      ari: "skipped",
      deferred: false,
      message: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
