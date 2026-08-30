/**
 * Shared cache for one owner's `Pull_ListOwnerProp_RQ` response.
 *
 * The channel rate-limits identical listing reads aggressively. Persisting the last successful
 * answer lets reconciliation/readiness screens reuse it instead of re-pulling every account on
 * every load. Destructive operations can still force a fresh read before/after they mutate.
 */

// deno-lint-ignore no-explicit-any
type Db = any;

export interface RuOwnerListing {
  id: string;
  name: string;
  is_active?: boolean;
  is_archived?: boolean;
}

export interface RuOwnerListingCacheHit {
  hit: boolean;
  listings: RuOwnerListing[];
  fetchedAt: string | null;
  stale: boolean;
  message?: string;
}

export const RU_OWNER_LISTING_CACHE_TTL_MS = 10 * 60 * 1000;

function normalizeListing(value: unknown): RuOwnerListing | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  if (!id) return null;
  return {
    id,
    name: String(row.name ?? "").trim(),
    is_active: typeof row.is_active === "boolean" ? row.is_active : undefined,
    is_archived: typeof row.is_archived === "boolean" ? row.is_archived : undefined,
  };
}

export async function readRuOwnerListingCache(
  admin: Db,
  ownerId: string | number,
  opts: { maxAgeMs?: number; allowStale?: boolean } = {},
): Promise<RuOwnerListingCacheHit> {
  const normalizedOwnerId = String(ownerId).trim();
  if (!normalizedOwnerId) return { hit: false, listings: [], fetchedAt: null, stale: true };
  try {
    const { data, error } = await admin
      .from("ru_owner_listing_cache")
      .select("listings, fetched_at")
      .eq("owner_id", normalizedOwnerId)
      .maybeSingle();
    if (error) {
      console.error(`[ruOwnerListingCache] cache read failed for OwnerID ${normalizedOwnerId}: ${error.message}`);
      return { hit: false, listings: [], fetchedAt: null, stale: true, message: error.message };
    }
    if (!data) return { hit: false, listings: [], fetchedAt: null, stale: true };
    const fetchedAt = String(data.fetched_at ?? "");
    const fetchedMs = Date.parse(fetchedAt);
    const maxAge = Math.max(0, opts.maxAgeMs ?? RU_OWNER_LISTING_CACHE_TTL_MS);
    const stale = !Number.isFinite(fetchedMs) || Date.now() - fetchedMs > maxAge;
    if (stale && opts.allowStale !== true) {
      return { hit: false, listings: [], fetchedAt, stale: true };
    }
    const rawListings = Array.isArray(data.listings) ? data.listings : [];
    return {
      hit: true,
      listings: rawListings.map(normalizeListing).filter((row): row is RuOwnerListing => row !== null),
      fetchedAt,
      stale,
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error(`[ruOwnerListingCache] cache read threw for OwnerID ${normalizedOwnerId}: ${message}`);
    return { hit: false, listings: [], fetchedAt: null, stale: true, message };
  }
}

export async function writeRuOwnerListingCache(
  admin: Db,
  ownerId: string | number,
  listings: RuOwnerListing[],
  source = "unknown",
): Promise<string> {
  const normalizedOwnerId = String(ownerId).trim();
  const fetchedAt = new Date().toISOString();
  if (!normalizedOwnerId) return fetchedAt;
  try {
    const { error } = await admin
      .from("ru_owner_listing_cache")
      .upsert(
        {
          owner_id: normalizedOwnerId,
          listings,
          listing_count: listings.length,
          fetched_at: fetchedAt,
          source,
        },
        { onConflict: "owner_id" },
      );
    if (error) {
      console.error(`[ruOwnerListingCache] cache write failed for OwnerID ${normalizedOwnerId}: ${error.message}`);
    }
  } catch (e) {
    console.error(`[ruOwnerListingCache] cache write threw for OwnerID ${normalizedOwnerId}: ${e instanceof Error ? e.message : String(e)}`);
  }
  return fetchedAt;
}
/**
 * Forget an owner's cached listings — used when the account is closed at the channel, so no
 * later reconciliation or readiness screen can resurrect it from our own cache.
 */
export async function dropRuOwnerListingCache(admin: Db, ownerId: string | number): Promise<void> {
  const normalizedOwnerId = String(ownerId ?? "").trim();
  if (!normalizedOwnerId) return;
  try {
    const { error } = await admin.from("ru_owner_listing_cache").delete().eq("owner_id", normalizedOwnerId);
    if (error) console.warn(`[ruOwnerListingCache] cache purge failed for OwnerID ${normalizedOwnerId}: ${error.message}`);
  } catch (e) {
    console.warn(`[ruOwnerListingCache] cache purge threw for OwnerID ${normalizedOwnerId}: ${e instanceof Error ? e.message : String(e)}`);
  }
}
