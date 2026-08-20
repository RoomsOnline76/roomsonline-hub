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

/**
 * Reservation writes happen with an operator watching a dialog. Holding the request for the full
 * 25s window (twice — accept, then modify) reads as a hang and still ends in a deferral, so these
 * calls wait only briefly and are then parked at the front of the queue.
 */
export const RU_INTERACTIVE_MAX_WAIT_MS = 3_000;

/**
 * Queue priority (lower runs first). Reservation writes must never queue behind the background
 * price/availability read-backs, which fill the queue with hundreds of legitimately distinct rows.
 */
export const RU_PRIORITY_RESERVATION_WRITE = 1;
export const RU_PRIORITY_DEFAULT = 100;

/** Actions that carry a reservation an operator is waiting on. */
const RESERVATION_WRITE_ACTIONS = new Set([
  'confirm_request',
  'reject_request',
  'modify_stay',
  'cancel_reservation',
  'push_confirmed_reservation',
]);

/**
 * The transport receives both raw verbs (`confirm_request`) and diagnostic parent labels such as
 * `ruBookingSync:confirm`. Normalise both forms before choosing priority/wait budgets; otherwise
 * an operator action accidentally inherits the 25-second background budget.
 */
function reservationWriteAction(action: string | null | undefined): string {
  const raw = String(action ?? '').trim();
  if (RESERVATION_WRITE_ACTIONS.has(raw)) return raw;
  const suffix = raw.split(':').at(-1) ?? raw;
  const aliases: Record<string, string> = {
    confirm: 'confirm_request',
    reject: 'reject_request',
    modify: 'modify_stay',
    cancel: 'cancel_reservation',
    create: 'push_confirmed_reservation',
  };
  return aliases[suffix] ?? suffix;
}

export function isReservationWriteAction(action: string | null | undefined): boolean {
  return RESERVATION_WRITE_ACTIONS.has(reservationWriteAction(action));
}

/** Queue priority for one action — reservation writes jump the queue. */
export function ruQueuePriority(action: string | null | undefined): number {
  return isReservationWriteAction(action) ? RU_PRIORITY_RESERVATION_WRITE : RU_PRIORITY_DEFAULT;
}

/** Gate wait budget for one action — interactive writes fail fast into the queue instead. */
export function ruGateWaitMs(action: string | null | undefined): number {
  return isReservationWriteAction(action) ? RU_INTERACTIVE_MAX_WAIT_MS : RU_RATE_MAX_WAIT_MS;
}

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

/**
 * Background work queue.
 *
 * A deferral used to end the call: the gate refused a slot and the work was simply abandoned
 * unless its caller happened to retry. Deferrable calls (read-backs, list pulls, scheduled
 * refreshes) are instead parked here and replayed by `cron-ru-call-queue-drain`, which owns the
 * only draining cadence so the channel is never asked twice inside its sliding minute.
 *
 * The queue row is keyed by the gate's own method key, so a burst of identical requests collapses
 * into the single waiting row instead of becoming N rejections.
 */
export async function enqueueRuCall(
  supabase: any,
  args: {
    methodKey: string;
    action: string;
    payload: Record<string, unknown>;
    ownerId?: string | null;
    propertyId?: string | null;
    /** Lower runs first. */
    priority?: number;
    delayMs?: number;
  },
): Promise<string | null> {
  const { data, error } = await supabase.rpc('ru_enqueue_call', {
    _method_key: args.methodKey,
    _action: args.action,
    _payload: args.payload,
    _ru_owner_id: args.ownerId ?? null,
    _property_id: args.propertyId ?? null,
    _priority: args.priority ?? 100,
    _delay_ms: Math.max(0, Math.round(args.delayMs ?? 0)),
  });
  if (error) {
    console.warn(`[ruRateGate] could not queue ${args.action}: ${error.message}`);
    return null;
  }
  return typeof data === 'string' ? data : (data?.id ?? null);
}

/**
 * An operator clicking Save must not be blocked by OUR OWN parked retry of the same call.
 *
 * A failed reservation write is parked in the queue keyed by method+parameters — exactly the key
 * the inline attempt needs. The drainer's replay then claims the sliding-minute slot and the
 * person waiting gets `RU_RATE_DEFERRED` for a call that is already being made on their behalf.
 * Superseding the parked row stops that competition; the slot claim itself is left alone because a
 * previously attempted row really did spend a call at the channel.
 *
 * Returns the number of parked rows taken over.
 */
export async function supersedeQueuedRuCalls(
  supabase: any,
  args: { action: string; reservationId: string },
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from('ru_call_queue')
      .update({
        status: 'superseded',
        completed_at: new Date().toISOString(),
        claimed_at: null,
        last_error: 'Superseded by an operator-initiated attempt on the same reservation',
      })
      .eq('action', args.action)
      .eq('status', 'pending')
      .contains('payload', { reservation_id: args.reservationId })
      .select('id');
    if (error) throw error;
    return ((data ?? []) as { id: string }[]).length;
  } catch (e) {
    // Never block a real channel call on this bookkeeping.
    console.warn(`[ruRateGate] could not supersede parked ${args.action}: ${e instanceof Error ? e.message : e}`);
    return 0;
  }
}

/** Actions safe to run later: reads, verification read-backs and scheduled refreshes. */
const DEFERRABLE_ACTIONS = new Set([
  'get_availability',
  'get_prices',
  'get_property',
  'get_building',
  'get_long_stay_discounts',
  'get_last_minute_discounts',
  'list_properties',
  'list_users',
  'list_buildings',
  'list_composition_rooms',
  'list_lnm_subscriptions',
  'list_sales_channels',
  'list_child_api_keys',
]);

/**
 * True when the caller explicitly opted in (`deferrable: true`) or the action is a read that
 * carries no interactive user waiting on it. Booking/push paths are never queued behind reads.
 */
export function isDeferrableRuCall(body: Record<string, unknown> | null | undefined): boolean {
  if (!body) return false;
  if (body.deferrable === true) return true;
  if (body.deferrable === false) return false;
  return DEFERRABLE_ACTIONS.has(String(body.action ?? ''));
}

