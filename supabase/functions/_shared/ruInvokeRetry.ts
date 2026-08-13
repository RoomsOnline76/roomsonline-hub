// Transient-failure retry wrapper for rentalsunited-api invocations.
//
// The channel API occasionally returns a 5xx / cold-boot failure mid-batch. Those calls used to
// fail a whole ARI refresh even though a second attempt seconds later succeeds. Only transport
// level failures are retried — business errors (stale listing, currency block, reservation
// conflicts, validation) must surface on the first attempt so they are not masked.

import { readInvokeError } from './functionInvokeError.ts';

export interface RuInvokeResult {
  data: any | null;
  ok: boolean;
  attempts: number;
  httpStatus: number | null;
  errorCode: string | null;
  message: string | null;
}

const BACKOFF_MS = [1500, 4000];

/** Transport-level failures worth retrying: upstream 5xx, rate limits, boot/timeouts. */
function isTransient(httpStatus: number | null, message: string | null): boolean {
  if (httpStatus !== null) {
    if (httpStatus >= 500) return true;
    if (httpStatus === 429 || httpStatus === 408) return true;
    return false;
  }
  const m = (message || '').toLowerCase();
  return (
    m.includes('non-2xx') ||
    m.includes('boot') ||
    m.includes('timeout') ||
    m.includes('timed out') ||
    m.includes('shutdown') ||
    m.includes('worker') ||
    m.includes('network') ||
    m.includes('fetch failed') ||
    m.includes('failed to send a request') ||
    m.includes('connection')

  );
}

export async function invokeRuWithRetry(
  supabase: any,
  body: Record<string, unknown>,
  opts: { maxAttempts?: number; label?: string; allowCreateRetry?: boolean } = {},
): Promise<RuInvokeResult> {
  // A create (`push_property` with ru_property_id 0) is the only call that can mint a listing.
  // A transport failure says nothing about whether the channel already registered it, so a blind
  // retry can produce a duplicate — creates get a single attempt unless the caller opts in.
  const isCreate = body.action === 'push_property' && Number(body.ru_property_id ?? 0) === 0;
  const maxAttempts = isCreate && opts.allowCreateRetry !== true ? 1 : (opts.maxAttempts ?? 3);
  const label = opts.label ?? String(body.action ?? 'ru_call');


  let last: RuInvokeResult = {
    data: null,
    ok: false,
    attempts: 0,
    httpStatus: null,
    errorCode: null,
    message: 'Unknown error',
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let data: any = null;
    let httpStatus: number | null = null;
    let errorCode: string | null = null;
    let message: string | null = null;

    try {
      const res = await supabase.functions.invoke('rentalsunited-api', { body });
      data = res.data ?? null;

      if (res.error) {
        // invoke() hides the JSON body behind "non-2xx status code" — read the real reason.
        const detail = await readInvokeError(res.error, `${label} failed`);
        message = detail.message;
        errorCode = detail.errorCode ?? (detail.httpStatus ? `HTTP_${detail.httpStatus}` : null);
        httpStatus = detail.httpStatus;
      } else if (data?.success !== true) {
        message = data?.error?.message || 'Unknown error';
        errorCode = data?.error?.code ?? null;
      } else {
        return { data, ok: true, attempts: attempt, httpStatus: 200, errorCode: null, message: null };
      }
    } catch (e) {
      message = e instanceof Error ? e.message : String(e);
    }

    last = { data, ok: false, attempts: attempt, httpStatus, errorCode, message };

    const retryable = errorCode === null && isTransient(httpStatus, message);
    if (!retryable || attempt === maxAttempts) break;

    const wait = BACKOFF_MS[attempt - 1] ?? BACKOFF_MS[BACKOFF_MS.length - 1];
    console.warn(
      `[ruInvokeRetry] ${label} attempt ${attempt}/${maxAttempts} failed (${httpStatus ?? 'no status'}: ${message}) — retrying in ${wait}ms`,
    );
    await new Promise((r) => setTimeout(r, wait));
  }

  return last;
}
