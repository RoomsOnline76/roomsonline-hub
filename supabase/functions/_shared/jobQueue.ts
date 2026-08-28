import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * Durable background work queue.
 *
 * Booking mutations (create, edit, move, cancel, mark paid) must answer the operator as soon as
 * the local record and availability are correct. Everything that only has to *follow* — commission
 * recalculation, the Channel Manager ARI delta, guest/owner email, sync-status bookkeeping — is
 * enqueued here instead of being awaited in the request path.
 *
 * The queue is the durable safety net: after enqueuing, the caller kicks the worker via
 * `EdgeRuntime.waitUntil` so the work normally starts within the same second, and a minute cron
 * drains anything the kick missed.
 */
export type JobType =
  | "recalculate_commission"
  | "channel_ari_delta"
  | "channel_content_delta"
  | "booking_email"
  | "booking_balance_request"
  | "booking_sync_status"
  /** Re-run the channel listing review after the channel's rate window closed the read. */
  | "channel_listing_review"
  /** Finish publishing the units a chunked push left outstanding. */
  | "channel_publish_units"
  /** Push a booking change (modify / cancel) and the resulting ARI delta to the channel. */
  | "channel_booking_sync";


export interface EnqueueOptions {
  /** Collapses repeated identical work while the job is still pending. */
  dedupeKey?: string;
  /** Delay before the job becomes due, in seconds. */
  delaySeconds?: number;
  maxAttempts?: number;
}

export interface BackgroundJob {
  id: string;
  job_type: JobType;
  dedupe_key: string | null;
  payload: Record<string, unknown>;
  attempts: number;
  max_attempts: number;
}

export async function enqueueJob(
  supabase: SupabaseClient,
  jobType: JobType,
  payload: Record<string, unknown>,
  options: EnqueueOptions = {},
): Promise<void> {
  const runAfter = new Date(Date.now() + (options.delaySeconds ?? 0) * 1000).toISOString();
  const row = {
    job_type: jobType,
    dedupe_key: options.dedupeKey ?? null,
    payload,
    run_after: runAfter,
    max_attempts: options.maxAttempts ?? 5,
    status: "pending",
  };

  const { error } = await supabase.from("background_jobs").insert(row);
  if (!error) return;

  // Unique violation on the pending-dedupe index: identical work is already waiting. Preserve one
  // job, but merge the later caller's richer payload into it. This matters when the booking trigger
  // inserts first and `modify-booking` follows with `skip_reservation: true`: silently discarding
  // the latter would make the worker repeat a reservation verb that already landed synchronously.
  if ((error as { code?: string }).code === "23505") {
    if (options.dedupeKey) {
      const { data: existing, error: readError } = await supabase
        .from("background_jobs")
        .select("id, payload, max_attempts")
        .eq("job_type", jobType)
        .eq("dedupe_key", options.dedupeKey)
        .eq("status", "pending")
        .maybeSingle();
      if (!readError && existing?.id) {
        const existingPayload = existing.payload && typeof existing.payload === "object"
          ? existing.payload as Record<string, unknown>
          : {};
        const { error: mergeError } = await supabase
          .from("background_jobs")
          .update({
            payload: { ...existingPayload, ...payload },
            run_after: runAfter,
            max_attempts: options.maxAttempts ?? existing.max_attempts ?? 5,
          })
          .eq("id", existing.id)
          .eq("status", "pending");
        if (mergeError) console.error(`[jobs] failed to merge ${jobType}:`, mergeError.message);
      }
    }
    console.log(`[jobs] ${jobType} merged with queued work (${options.dedupeKey})`);
    return;
  }
  console.error(`[jobs] failed to enqueue ${jobType}:`, error.message);
}

/** Enqueue several jobs without letting a queue problem break the caller's response. */
export async function enqueueJobs(
  supabase: SupabaseClient,
  jobs: Array<{ type: JobType; payload: Record<string, unknown>; options?: EnqueueOptions }>,
): Promise<void> {
  for (const job of jobs) {
    try {
      await enqueueJob(supabase, job.type, job.payload, job.options);
    } catch (err) {
      console.error("[jobs] enqueue error:", err);
    }
  }
}

/**
 * Fire the worker without waiting for it. Safe to call from a request path: failures are logged
 * and swallowed because the cron still drains the queue.
 */
export function kickWorker(): void {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;

  const run = fetch(`${url}/functions/v1/process-background-jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({ source: "kick" }),
  })
    .then(() => undefined)
    .catch((err) => {
      console.warn("[jobs] worker kick failed (cron will drain):", err?.message ?? err);
    });

  try {
    // deno-lint-ignore no-explicit-any
    (globalThis as any).EdgeRuntime?.waitUntil?.(run);
  } catch {
    // Non-edge runtime: the promise is still in flight, the cron is the fallback.
  }
}

/** Claim up to `limit` due jobs, one atomic conditional update per row. */
export async function claimJobs(supabase: SupabaseClient, limit: number): Promise<BackgroundJob[]> {
  const { data: candidates, error } = await supabase
    .from("background_jobs")
    .select("id, job_type, dedupe_key, payload, attempts, max_attempts")
    .eq("status", "pending")
    .lte("run_after", new Date().toISOString())
    .order("run_after", { ascending: true })
    .limit(limit);

  if (error) {
    console.error("[jobs] claim query failed:", error.message);
    return [];
  }

  const claimed: BackgroundJob[] = [];
  for (const candidate of candidates ?? []) {
    const { data, error: claimError } = await supabase
      .from("background_jobs")
      .update({
        status: "running",
        started_at: new Date().toISOString(),
        attempts: (candidate.attempts ?? 0) + 1,
      })
      .eq("id", candidate.id)
      .eq("status", "pending")
      .select("id, job_type, dedupe_key, payload, attempts, max_attempts")
      .maybeSingle();

    if (claimError || !data) continue;
    claimed.push(data as BackgroundJob);
  }
  return claimed;
}

export async function completeJob(supabase: SupabaseClient, jobId: string): Promise<void> {
  await supabase
    .from("background_jobs")
    .update({ status: "done", completed_at: new Date().toISOString(), last_error: null })
    .eq("id", jobId);
}

/** Reschedule with exponential backoff, or mark failed once the attempts are exhausted. */
export async function failJob(
  supabase: SupabaseClient,
  job: BackgroundJob,
  message: string,
): Promise<void> {
  const exhausted = job.attempts >= job.max_attempts;
  if (exhausted) {
    await supabase
      .from("background_jobs")
      .update({ status: "failed", last_error: message.slice(0, 2000), completed_at: new Date().toISOString() })
      .eq("id", job.id);
    return;
  }

  const backoffSeconds = Math.min(30 * 60, 30 * Math.pow(3, job.attempts - 1));
  await supabase
    .from("background_jobs")
    .update({
      status: "pending",
      last_error: message.slice(0, 2000),
      run_after: new Date(Date.now() + backoffSeconds * 1000).toISOString(),
    })
    .eq("id", job.id);
}
