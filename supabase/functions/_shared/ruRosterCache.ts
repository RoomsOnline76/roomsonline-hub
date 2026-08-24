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
/** After a throttled/failed wire read with nothing cached, hold off this long before retrying. */
const RU_ROSTER_RETRY_BACKOFF_MS = 90 * 1000;

/** Per-instance memo so several helpers inside one invocation share a single read. */
let memo: { at: number; result: RuRosterResult } | null = null;
/** Per-instance "do not touch the wire again before" stamp, set on a throttled/failed read. */
let retryNotBefore = 0;

async function readCacheRow(admin: Db): Promise<{ users: RuRosterUser[]; fetchedAt: string } | null> {
  try {
    const { data, error } = await admin
      .from("ru_roster_cache")
      .select("users, fetched_at")
      .eq("cache_key", CACHE_KEY)
      .maybeSingle();
    if (error) {
      console.error(`[ruRosterCache] roster cache is UNREADABLE (${error.message}) — every read will hit the channel`);
      return null;
    }
    if (!data || !Array.isArray(data.users)) return null;
    return { users: data.users as RuRosterUser[], fetchedAt: String(data.fetched_at) };
  } catch (e) {
    console.error(`[ruRosterCache] roster cache read threw: ${(e as Error)?.message}`);
    return null;
  }
}

async function writeCacheRow(admin: Db, users: RuRosterUser[], source: string): Promise<string> {
  const fetchedAt = new Date().toISOString();
  try {
    const { error } = await admin
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
    if (error) {
      // Loud, not silent: a cache that cannot persist turns every caller into a wire read.
      console.error(
        `[ruRosterCache] roster cache is UNWRITABLE (${error.message}) — Pull_ListMyUsers_RQ cannot be de-duplicated across instances`,
      );
    }
  } catch (e) {
    console.error(`[ruRosterCache] could not persist roster: ${(e as Error)?.message}`);
  }
  return fetchedAt;
}

/**
 * Read the roster, preferring the cache. Exactly one `Pull_ListMyUsers_RQ` per stale read —
 * no polling of the rate window.
 *
 * `cacheOnly` never touches the wire: it is what every non-onboarding surface uses, so browsing
 * ROL'OS can no longer generate channel roster traffic.
 */
export async function readRuRoster(
  admin: Db,
  opts: { maxAgeMs?: number; forceFresh?: boolean; cacheOnly?: boolean; source?: string } = {},
): Promise<RuRosterResult> {
  const maxAge = Math.max(0, opts.maxAgeMs ?? RU_ROSTER_DEFAULT_TTL_MS);
  const source = opts.source ?? "unknown";
  const forceFresh = opts.forceFresh === true && opts.cacheOnly !== true;

  if (!forceFresh && memo && Date.now() - memo.at < maxAge) {
    return { ...memo.result, cached: true };
  }

  const cached = await readCacheRow(admin);
  const cacheAgeMs = cached ? Date.now() - new Date(cached.fetchedAt).getTime() : Number.POSITIVE_INFINITY;
  if (!forceFresh && cached && cacheAgeMs < maxAge) {
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

  if (opts.cacheOnly) {
    // Stale (or absent) and no permission to refresh: hand back what we hold and say how old it is.
    if (cached) {
      return {
        ok: true,
        users: cached.users,
        cached: true,
        deferred: false,
        fetchedAt: cached.fetchedAt,
        message: `Roster as of ${cached.fetchedAt} (cached read — refresh happens during channel onboarding)`,
      };
    }
    return {
      ok: false,
      users: [],
      cached: true,
      deferred: false,
      fetchedAt: null,
      message: "No cached sub-account roster yet — it is read during channel onboarding or via Refresh roster",
    };
  }

  if (!forceFresh && Date.now() < retryNotBefore) {
    // A recent read was throttled or failed; do not re-open the storm.
    const waitMs = retryNotBefore - Date.now();
    if (cached) {
      return {
        ok: true,
        users: cached.users,
        cached: true,
        deferred: false,
        fetchedAt: cached.fetchedAt,
        message: `Roster as of ${cached.fetchedAt} (channel read backing off for ${Math.ceil(waitMs / 1000)}s)`,
      };
    }
    return {
      ok: false,
      users: [],
      cached: false,
      deferred: true,
      fetchedAt: null,
      message: `Channel roster read is backing off — retry in ${Math.ceil(waitMs / 1000)}s`,
    };
  }

  const { data, error } = await admin.functions.invoke("rentalsunited-api", {
    body: { action: "list_users", parent_action: `roster:${source}` },
  });

  if (!error && data?.success && Array.isArray(data.users)) {
    const users = data.users as RuRosterUser[];
    const fetchedAt = await writeCacheRow(admin, users, source);
    const result: RuRosterResult = { ok: true, users, cached: false, deferred: false, fetchedAt };
    memo = { at: Date.now(), result };
    retryNotBefore = 0;
    return result;
  }

  const rateDeferred = data?.queued === true ||
    data?.rate_deferred === true ||
    data?.error?.code === "RU_RATE_DEFERRED";
  const message = error?.message ?? data?.message ?? data?.error?.message ??
    "Rentals United did not return the sub-user list";

  retryNotBefore = Date.now() + RU_ROSTER_RETRY_BACKOFF_MS;

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
  retryNotBefore = 0;
}

