/**
 * One shared read of the channel's sub-account roster (`Pull_ListMyUsers_RQ`).
 *
 * The channel allows one roster read per sliding minute, yet every helper that needed the
 * list used to read it for itself — Step A alone did so up to five times in one run, and the
 * reader polled the rate window four times on a throttle. The result was dozens of wasted
 * calls per hour, most of them throttled, blocking the reads that genuinely needed fresh data.
 *
 * Every reader now goes through this module:
 *  - a cache entry younger than `maxAgeMs` is returned without touching the wire;
 *  - a stale entry costs exactly one wire read;
 *  - a throttled read falls back to the cached answer and reports it as cached (never as an
 *    empty roster, which is what used to break binding);
 *  - `forceFresh` bypasses the cache once, for the read-back after creating a sub-user.
 *
 * The entry is persisted (not just in memory) so a cold start does not reopen the storm.
 */

// deno-lint-ignore no-explicit-any
type Db = any;

export interface RuRosterUser {
  user_account_id?: string;
  email?: string;
  login_email?: string;
  owner_id?: string;
}

export interface RuRosterResult {
  ok: boolean;
  users: RuRosterUser[];
  /** True when the answer came from the cache rather than the wire. */
  cached: boolean;
  /** True when the wire read was rate limited and no cached answer was available. */
  deferred: boolean;
  fetchedAt: string | null;
  message?: string;
}

const CACHE_KEY = "master";
export const RU_ROSTER_DEFAULT_TTL_MS = 10 * 60 * 1000;

/** Per-instance memo so several helpers inside one invocation share a single read. */
let memo: { at: number; result: RuRosterResult } | null = null;

async function readCacheRow(admin: Db): Promise<{ users: RuRosterUser[]; fetchedAt: string } | null> {
  try {
    const { data } = await admin
      .from("ru_roster_cache")
      .select("users, fetched_at")
      .eq("cache_key", CACHE_KEY)
      .maybeSingle();
    if (!data || !Array.isArray(data.users)) return null;
    return { users: data.users as RuRosterUser[], fetchedAt: String(data.fetched_at) };
  } catch (_e) {
    return null;
  }
}

async function writeCacheRow(admin: Db, users: RuRosterUser[], source: string): Promise<string> {
  const fetchedAt = new Date().toISOString();
  try {
    await admin
      .from("ru_roster_cache")
      .upsert(
        {
          cache_key: CACHE_KEY,
          users,
          user_count: users.length,
          fetched_at: fetchedAt,
          source,
        },
        { onConflict: "cache_key" },
      );
  } catch (e) {
    console.warn(`[ruRosterCache] could not persist roster: ${(e as Error)?.message}`);
  }
  return fetchedAt;
}

/**
 * Read the roster, preferring the cache. Exactly one `Pull_ListMyUsers_RQ` per stale read —
 * no polling of the rate window.
 */
export async function readRuRoster(
  admin: Db,
  opts: { maxAgeMs?: number; forceFresh?: boolean; source?: string } = {},
): Promise<RuRosterResult> {
  const maxAge = Math.max(0, opts.maxAgeMs ?? RU_ROSTER_DEFAULT_TTL_MS);
  const source = opts.source ?? "unknown";

  if (!opts.forceFresh && memo && Date.now() - memo.at < maxAge) {
    return { ...memo.result, cached: true };
  }

  const cached = await readCacheRow(admin);
  const cacheAgeMs = cached ? Date.now() - new Date(cached.fetchedAt).getTime() : Number.POSITIVE_INFINITY;
  if (!opts.forceFresh && cached && cacheAgeMs < maxAge) {
    const result: RuRosterResult = {
      ok: true,
      users: cached.users,
      cached: true,
      deferred: false,
      fetchedAt: cached.fetchedAt,
    };
    memo = { at: Date.now(), result };
    return result;
  }

  const { data, error } = await admin.functions.invoke("rentalsunited-api", {
    body: { action: "list_users", parent_action: `roster:${source}` },
  });

  if (!error && data?.success && Array.isArray(data.users)) {
    const users = data.users as RuRosterUser[];
    const fetchedAt = await writeCacheRow(admin, users, source);
    const result: RuRosterResult = { ok: true, users, cached: false, deferred: false, fetchedAt };
    memo = { at: Date.now(), result };
    return result;
  }

  const rateDeferred = data?.queued === true ||
    data?.rate_deferred === true ||
    data?.error?.code === "RU_RATE_DEFERRED";
  const message = error?.message ?? data?.message ?? data?.error?.message ??
    "Rentals United did not return the sub-user list";

  // A throttled or failed read must never look like "this master account has no sub-users".
  if (cached) {
    const result: RuRosterResult = {
      ok: true,
      users: cached.users,
      cached: true,
      deferred: false,
      fetchedAt: cached.fetchedAt,
      message: `Roster as of ${cached.fetchedAt} (channel read ${rateDeferred ? "throttled" : "failed"}: ${message})`,
    };
    memo = { at: Date.now(), result };
    return result;
  }

  return { ok: false, users: [], cached: false, deferred: Boolean(rateDeferred), fetchedAt: null, message };
}

/** Drop the in-instance memo — used right before a deliberate fresh read-back. */
export function invalidateRuRosterMemo(): void {
  memo = null;
}
