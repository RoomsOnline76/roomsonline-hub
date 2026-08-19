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
