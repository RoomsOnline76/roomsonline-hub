/**
 * `supabase.functions.invoke()` collapses any non-2xx response into the generic
 * "Edge Function returned a non-2xx status code" message and throws away the JSON body.
 * That is why real RU failures (HTTP 5xx from RU, thrown fetch errors) used to land in the
 * "Unclassified failure" bucket of the RU error taxonomy with no cause attached.
 *
 * This helper reads the underlying Response so callers can log the real reason
 * and the HTTP status.
 */
export interface InvokeFailure {
  message: string;
  httpStatus: number | null;
  errorCode: string | null;
}

export async function readInvokeError(
  error: unknown,
  fallback = 'Unknown error',
): Promise<InvokeFailure> {
  const response = (error as { context?: unknown } | null)?.context as Response | undefined;
  let httpStatus: number | null = null;
  let message: string | null = null;
  let errorCode: string | null = null;

  if (response && typeof response.text === 'function') {
    httpStatus = typeof response.status === 'number' ? response.status : null;
    try {
      const raw = await response.clone().text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as {
            error?: { message?: string; code?: string } | string;
            message?: string;
          };
          const err = parsed.error;
          if (typeof err === 'string') {
            message = err;
          } else if (err && typeof err === 'object') {
            message = err.message ?? null;
            errorCode = err.code ?? null;
          }
          if (!message && parsed.message) message = parsed.message;
        } catch {
          message = raw.slice(0, 800);
        }
      }
    } catch {
      /* fall through to the generic message */
    }
  }

  if (!message) {
    message = (error as { message?: string } | null)?.message ?? fallback;
  }

  return { message, httpStatus, errorCode };
}
