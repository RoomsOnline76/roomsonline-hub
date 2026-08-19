// Background job worker.
//
// Booking mutations enqueue their "can follow" work (commission, channel deltas, email,
// sync-status) and answer the operator immediately. This function drains that queue: it is kicked
// straight after enqueuing so the work usually starts within the same second, and a minute cron
// calls it as the durable fallback.

import { createClient } from "npm:@supabase/supabase-js@2";
import { claimJobs, completeJob, failJob, type BackgroundJob } from "../_shared/jobQueue.ts";
import { queueRuAriDelta } from "../_shared/ruAriDelta.ts";
import { queueRuStaticDelta } from "../_shared/ruStaticDelta.ts";
import { syncBookingToChannel, type ChannelBookingChange } from "../_shared/channelBookingSync.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

async function callFunction(name: string, body: Record<string, unknown>): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`${name} returned ${response.status}: ${text.slice(0, 500)}`);
  }
}

/** Same call, but the parsed body is needed to decide whether the work actually finished. */
async function callFunctionJson(
  name: string,
  body: Record<string, unknown>,
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${SERVICE_KEY}` },
    body: JSON.stringify(body),
  });
  const text = await response.text().catch(() => "");
  let parsed: Record<string, unknown> = {};
  try {
    parsed = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }
  return { status: response.status, body: parsed };
}

// deno-lint-disable-next-line no-explicit-any
async function runJob(supabase: any, job: BackgroundJob): Promise<void> {
  const payload = job.payload ?? {};
  switch (job.job_type) {
    case "recalculate_commission": {
      const bookingId = payload.booking_id as string | undefined;
      if (!bookingId) return;
      await callFunction("calculate-commission", { booking_id: bookingId });
      return;
    }
    case "channel_ari_delta": {
      const propertyId = payload.property_id as string | undefined;
      if (!propertyId) return;
      const outcome = await queueRuAriDelta(
        supabase,
        propertyId,
        String(payload.trigger ?? "background_job"),
        { force: payload.force !== false },
      );
      if (outcome?.error) throw new Error(String(outcome.error));
      return;
    }
    case "channel_content_delta": {
      const propertyId = payload.property_id as string | undefined;
      if (!propertyId) return;
      const outcome = await queueRuStaticDelta(
        supabase,
        propertyId,
        String(payload.trigger ?? "background_job"),
        { force: payload.force !== false },
      );
      if (outcome?.error) throw new Error(String(outcome.error));
      return;
    }
    case "booking_email": {
      const bookingId = payload.booking_id as string | undefined;
      if (!bookingId) return;
      const { booking_id: _ignored, ...rest } = payload as Record<string, unknown>;
      await callFunction("send-booking-email", {
        booking_id: bookingId,
        bookingId,
        ...rest,
      });
      return;
    }
    case "booking_balance_request": {
      const bookingId = payload.booking_id as string | undefined;
      const token = payload.token as string | undefined;
      if (!bookingId || !token) return;
      await callFunction("send-balance-request", {
        booking_id: bookingId,
        token,
        amount: Number(payload.amount ?? 0),
        note: (payload.note as string | null) ?? null,
        direction: payload.direction === "credit" ? "credit" : "owing",
      });
      return;
    }

    case "booking_sync_status": {
      const bookingId = payload.booking_id as string | undefined;
      const externalSystem = payload.external_system as string | undefined;
      if (!bookingId || !externalSystem || externalSystem === "none") return;
      await supabase.from("booking_sync_status").upsert(
        {
          booking_id: bookingId,
          external_system: externalSystem,
          sync_status: String(payload.sync_status ?? "synced"),
          last_action: String(payload.last_action ?? "modify"),
          last_action_at: new Date().toISOString(),
          error_message: (payload.error_message as string | null) ?? null,
          last_error_message: (payload.error_message as string | null) ?? null,
        },
        { onConflict: "booking_id,external_system" },
      );
      return;
    }
    /**
     * The channel allows one identical read per sliding minute, so a listing review fired while
     * that window is closed cannot answer immediately. It is parked here and replayed until the
     * read lands — the wizard's "pull listings" step then passes on its own.
     */
    case "channel_listing_review": {
      const propertyId = payload.property_id as string | undefined;
      if (!propertyId) return;
      const { status, body } = await callFunctionJson("ru-cert-portal", {
        action: "resolve_ru_property_ids",
        property_id: propertyId,
      });
      if (body?.pending === true) {
        throw new Error("Channel rate window still closed — listing review will be retried");
      }
      if (status >= 400 || body?.success !== true) {
        const err = body?.error as { message?: string } | undefined;
        throw new Error(err?.message ?? `Listing review returned ${status}`);
      }
      return;
    }

    /**
     * A chunked push answers as soon as its slice is done. Anything still outstanding is finished
     * here so a rate-limited or time-boxed run never leaves units unpublished.
     */
    case "channel_publish_units": {
      const propertyId = payload.property_id as string | undefined;
      const unitIds = Array.isArray(payload.unit_ids) ? (payload.unit_ids as string[]) : [];
      if (!propertyId || unitIds.length === 0) return;

      const { status, body } = await callFunctionJson("push-property-to-ru", {
        property_id: propertyId,
        only_unit_ids: unitIds,
        subscribe_rlnm: true,
      });

      const { data: units } = await supabase
        .from("hostfully_room_types")
        .select("id, name, rentalsunited_property_id")
        .in("id", unitIds);
      const outstanding = ((units ?? []) as Array<{ name: string | null; rentalsunited_property_id: string | null }>)
        .filter((u) => !String(u.rentalsunited_property_id ?? "").trim())
        .map((u) => String(u.name ?? "unit"));

      if (outstanding.length > 0) {
        const err = body?.error as { message?: string } | undefined;
        throw new Error(
          `${outstanding.length} unit(s) still unpublished (${outstanding.slice(0, 3).join(", ")})` +
            (err?.message ? ` — ${err.message}` : status >= 400 ? ` — push returned ${status}` : ""),
        );
      }

      // Everything is live: confirm the listings so the connect step can open.
      await callFunctionJson("ru-cert-portal", {
        action: "resolve_ru_property_ids",
        property_id: propertyId,
      });
      return;
    }
    /**
     * Enqueued by the `bookings` / `rolos_booking_rooms` trigger, so a booking change reaches the
     * channel no matter which screen wrote it. Retried with backoff: a channel refusal or a rate
     * deferral simply runs again.
     */
    case "channel_booking_sync": {
      const bookingId = payload.booking_id as string | undefined;
      if (!bookingId) return;
      const outcome = await syncBookingToChannel(supabase, {
        booking_id: bookingId,
        change: (payload.change as ChannelBookingChange | undefined) ?? "unknown",
        previous: (payload.previous as Record<string, string | null> | null) ?? null,
        reason: (payload.reason as string | null) ?? null,
      });
      if (outcome.reservation === "failed") {
        throw new Error(outcome.message ?? outcome.code ?? "Channel refused the booking change");
      }
      if (outcome.ari === "failed") throw new Error(outcome.ari_reason ?? "Channel ARI delta failed");
      return;
    }
    default:
      throw new Error(`Unknown job type: ${job.job_type}`);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({} as Record<string, unknown>));
    const limit = Math.min(25, Math.max(1, Number(body?.limit ?? 10)));

    // Operator-driven retry from the Command Centre: re-arm exhausted jobs with a fresh budget
    // so failed follow-up work can be pushed through without touching the database directly.
    if (body?.retry_failed) {
      const ids = Array.isArray(body.job_ids) ? (body.job_ids as string[]) : null;
      let query = supabase
        .from("background_jobs")
        .update({ status: "pending", attempts: 0, run_after: new Date().toISOString() })
        .eq("status", "failed");
      if (ids && ids.length > 0) query = query.in("id", ids);
      await query;
    }

    const jobs = await claimJobs(supabase, limit);
    const results: Array<{ id: string; job_type: string; ok: boolean; error?: string }> = [];

    for (const job of jobs) {
      try {
        await runJob(supabase, job);
        await completeJob(supabase, job.id);
        results.push({ id: job.id, job_type: job.job_type, ok: true });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[jobs] ${job.job_type} failed:`, message);
        await failJob(supabase, job, message);
        results.push({ id: job.id, job_type: job.job_type, ok: false, error: message });
      }
    }

    return new Response(JSON.stringify({ success: true, processed: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : "Worker failed" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
