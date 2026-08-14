// Cross-caller sliding-window gate for the channel (Rentals United) API.
//
// The channel allows ONE request per method with the same parameters per sliding minute.
// Individual crons used to space their own calls, but the reservation-listing method is also
// fired by the notification retry sweep, the lead poll and manual console actions, so two
// independent invocations could land inside the same minute and one got rejected
// ("This request was rate limited…", status -6).
//
// Every outbound call funnels through `callRentalsUnited`, so the slot is claimed there via a
// DB-backed atomic claim (`public.ru_claim_rate_slot`) — that survives cold starts and is shared
// by every edge instance and every calling function.

export const RU_RATE_WINDOW_SECONDS = 60;

/** How long a single call may sleep waiting for its slot before deferring instead. */
export const RU_RATE_MAX_WAIT_MS = 25_000;

export const RU_RATE_DEFERRED_CODE = 'RU_RATE_DEFERRED';

export class RuRateDeferredError extends Error {
  readonly code = RU_RATE_DEFERRED_CODE;
  readonly waitMs: number;
  readonly methodKey: string;
  constructor(action: string, waitMs: number, methodKey: string) {
    super(
      `Channel rate limit: "${action}" was called with the same parameters less than a minute ago — retry in ${Math.ceil(waitMs / 1000)}s.`,
    );
    this.name = 'RuRateDeferredError';
    this.waitMs = waitMs;
    this.methodKey = methodKey;
  }
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Root request element, e.g. `Pull_ListReservations_RQ`. */
export function ruMethodFromXml(xml: string): string {
  return xml.match(/<\s*([A-Za-z0-9_]+_RQ)\b/)?.[1] ?? 'ru_call';
}

/**
 * Stable key for "this method with these parameters on this account".
 * Credentials are stripped first so a key rotation does not open a second slot.
 */
export async function ruMethodKey(xml: string, ownerId?: string | null): Promise<string> {
  const method = ruMethodFromXml(xml);
  const normalised = xml
    .replace(/<AccessKey>.*?<\/AccessKey>/gis, '')
    .replace(/<SecretKey>.*?<\/SecretKey>/gis, '')
    .replace(/<UserName>.*?<\/UserName>/gis, '')
    .replace(/<Password>.*?<\/Password>/gis, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${method}|${ownerId ?? 'master'}|${await sha256Hex(normalised)}`;
}

interface ClaimResult {
  granted: boolean;
  waitMs: number;
}

async function claim(supabase: any, methodKey: string, action: string): Promise<ClaimResult> {
  const { data, error } = await supabase.rpc('ru_claim_rate_slot', {
    _method_key: methodKey,
    _action: action,
    _window_seconds: RU_RATE_WINDOW_SECONDS,
  });
  if (error) {
    // Never let the throttle bookkeeping block a real channel call.
    console.warn(`[ruRateGate] claim failed for ${action} — proceeding: ${error.message}`);
    return { granted: true, waitMs: 0 };
  }
  const row = Array.isArray(data) ? data[0] : data;
  return { granted: row?.granted === true, waitMs: Number(row?.wait_ms ?? 0) };
}

/**
 * Reserves the sliding-minute slot for one outbound call.
 * Waits out a short remainder; throws `RuRateDeferredError` when the wait is too long.
 */
export async function reserveRuSlot(
  supabase: any,
  xml: string,
  opts: { ownerId?: string | null; maxWaitMs?: number } = {},
): Promise<void> {
  const action = ruMethodFromXml(xml);
  const methodKey = await ruMethodKey(xml, opts.ownerId);
  const maxWaitMs = opts.maxWaitMs ?? RU_RATE_MAX_WAIT_MS;

  for (let attempt = 0; attempt < 2; attempt++) {
    const { granted, waitMs } = await claim(supabase, methodKey, action);
    if (granted) return;
    if (waitMs > maxWaitMs || attempt === 1) throw new RuRateDeferredError(action, waitMs, methodKey);
    console.log(`[ruRateGate] ${action} slot busy — waiting ${waitMs}ms for the sliding window`);
    await new Promise((r) => setTimeout(r, waitMs + 250));
  }
}

/**
 * Read-only check used by callers that can simply skip (retry sweeps, lead polls) instead of
 * burning their own budget waiting. Does NOT claim the slot.
 */
export async function ruSlotBusyMs(supabase: any, xml: string, ownerId?: string | null): Promise<number> {
  const methodKey = await ruMethodKey(xml, ownerId);
  const { data } = await supabase
    .from('ru_method_rate_limits')
    .select('last_called_at')
    .eq('method_key', methodKey)
    .maybeSingle();
  if (!data?.last_called_at) return 0;
  const elapsed = Date.now() - new Date(data.last_called_at).getTime();
  return Math.max(0, RU_RATE_WINDOW_SECONDS * 1000 - elapsed);
}
