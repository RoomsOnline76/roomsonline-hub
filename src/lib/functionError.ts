/**
 * supabase.functions.invoke() collapses any non-2xx response into a generic
 * "Edge Function returned a non-2xx status code" error and hides the JSON body.
 * This helper reads the underlying response so callers can show the real reason.
 */
export async function extractFunctionError(
  error: unknown,
  fallback = "Request failed",
): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context;
  const response = context as Response | undefined;

  if (response && typeof (response as Response).text === "function") {
    try {
      const raw = await (response as Response).clone().text();
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as {
            error?: { message?: string; code?: string } | string;
            message?: string;
          };
          const err = parsed.error;
          if (typeof err === "string" && err) return err;
          if (err && typeof err === "object" && err.message) {
            return err.code ? `${err.message} (${err.code})` : err.message;
          }
          if (parsed.message) return parsed.message;
        } catch {
          return raw.slice(0, 500);
        }
      }
    } catch {
      /* fall through to the generic message */
    }
  }

  const message = (error as { message?: string } | null)?.message;
  return message || fallback;
}
