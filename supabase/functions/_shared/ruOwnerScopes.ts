/**
 * Shared resolver for the Rentals United accounts a cron must talk to.
 *
 * RU account-scoped methods (Pull_ListReservations_RQ, Pull_GetLeads_RQ,
 * LNM_PutHandlerUrl_RQ) only ever answer for the credentials they were called
 * with. A white-label sub-user's reservations, leads and push-notification
 * subscription live on THAT sub-user's account — calling them as the master
 * account silently returns our own inventory, which looks like "nothing new".
 *
 * So every account-level refresh has to fan out: master first, then one call
 * per sub-user that has usable API credentials, each with its own auth.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

export interface RuOwnerScope {
  /** null for the master account. */
  ownerId: string | null;
  label: string;
  /** Payload fragment to merge into a rentalsunited-api request body. */
  payload: Record<string, unknown>;
}

export const MASTER_SCOPE: RuOwnerScope = { ownerId: null, label: 'master', payload: {} };

/**
 * Master + every sub-user with credentials, ordered so the least recently
 * refreshed sub-user goes first. RU allows one call per method per sliding
 * minute, so a run with a wall-clock budget cannot always reach every account;
 * ordering by staleness makes consecutive runs cover them all in rotation.
 */
export async function resolveRuOwnerScopes(
  admin: SupabaseClient,
  cadenceAction: string,
): Promise<RuOwnerScope[]> {
  const { data: accounts } = await admin
    .from('ru_owner_accounts')
    .select('ru_owner_id, owner_email, ru_login_email, ru_api_access_key')
    .not('ru_owner_id', 'is', null);

  const { data: keyRows } = await admin
    .from('ru_api_credentials')
    .select('ru_owner_id, access_key');

  const withKeys = new Set(
    (keyRows ?? [])
      .filter((k: { access_key: string | null }) => !!k.access_key)
      .map((k: { ru_owner_id: string }) => String(k.ru_owner_id)),
  );

  // Staleness ordering from the cadence log (details.ru_owner_id).
  const { data: runs } = await admin
    .from('ru_sync_runs')
    .select('created_at, details')
    .eq('action', cadenceAction)
    .order('created_at', { ascending: false })
    .limit(500);

  const lastSeen = new Map<string, number>();
  for (const r of (runs ?? []) as { created_at: string; details: Record<string, unknown> | null }[]) {
    const owner = r.details?.ru_owner_id ? String(r.details.ru_owner_id) : null;
    if (!owner || lastSeen.has(owner)) continue;
    lastSeen.set(owner, new Date(r.created_at).getTime());
  }

  const children: RuOwnerScope[] = [];
  const skipped: string[] = [];
  for (const a of (accounts ?? []) as {
    ru_owner_id: string;
    owner_email: string | null;
    ru_login_email: string | null;
    ru_api_access_key: string | null;
  }[]) {
    const ownerId = String(a.ru_owner_id).trim();
    if (!ownerId) continue;
    const hasKeys = withKeys.has(ownerId) || !!a.ru_api_access_key;
    const label = `${a.ru_login_email ?? a.owner_email ?? 'sub-user'} (OwnerID ${ownerId})`;
    if (!hasKeys) {
      // Never fall back to master here: it would re-pull our own account and
      // hide the fact that this sub-user is unmonitored.
      skipped.push(label);
      continue;
    }
    children.push({ ownerId, label, payload: { owner_id: ownerId } });
  }

  children.sort((a, b) => (lastSeen.get(a.ownerId!) ?? 0) - (lastSeen.get(b.ownerId!) ?? 0));

  if (skipped.length) {
    console.warn(
      `[ruOwnerScopes] ${skipped.length} RU sub-user(s) have no API keys and were skipped for ${cadenceAction}: ${skipped.join(', ')}`,
    );
  }

  return [MASTER_SCOPE, ...children];
}

/** Sub-users lacking API keys — surfaced so a run can report them as gaps. */
export async function listRuOwnersWithoutKeys(admin: SupabaseClient): Promise<string[]> {
  const scopes = await resolveRuOwnerScopes(admin, '__none__');
  const covered = new Set(scopes.map((s) => s.ownerId).filter(Boolean) as string[]);
  const { data: accounts } = await admin
    .from('ru_owner_accounts')
    .select('ru_owner_id')
    .not('ru_owner_id', 'is', null);
  return (accounts ?? [])
    .map((a: { ru_owner_id: string }) => String(a.ru_owner_id))
    .filter((id) => id && !covered.has(id));
}
