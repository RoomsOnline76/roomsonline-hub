// supabase-js reports any non-2xx edge response as an *error*, with the response itself hidden
// on `error.context`. The channel gate answers 422 with a structured body (error code + the
// readiness blockers), so a delta that only looks at `error.message` cannot tell "not allowed yet"
// (park and retry automatically) apart from "transport broke" (real failure).
//
// This helper recovers that body. It returns null when there is nothing parseable.
export async function readInvokeErrorBody(error: unknown): Promise<Record<string, unknown> | null> {
  const ctx = (error as { context?: unknown } | null)?.context;
  if (!ctx) return null;
  try {
    const res = ctx as Response;
    if (typeof res.clone === 'function' && typeof res.json === 'function') {
      return (await res.clone().json()) as Record<string, unknown>;
    }
    if (typeof res.text === 'function') {
      return JSON.parse(await res.text()) as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

export default readInvokeErrorBody;
