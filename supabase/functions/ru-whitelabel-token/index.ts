/**
 * ru-whitelabel-token
 *
 * Mints (or returns a cached) Rentals United **White Label Channel Manager** token
 * pair for the RU sub-user account that owns a ROL'OS property, so the ROL'OS
 * Channels page can boot the one-line White Label script:
 *
 *   https://new.rentalsunited.com/white-pms-client/script
 *     ?token=…&refreshToken=…&languageId=1&uiVersion=2&ownerId=…
 *
 * Token sources, in order:
 *   1. cached pair on `ru_owner_accounts` (ru_wl_access_token / ru_wl_refresh_token)
 *      while still inside its expiry window;
 *   2. the documented two-step RU exchange:
 *        POST https://webapi.rentalsunited.com/whitepms/oauth2/token   (master, password grant)
 *        GET  https://webapi.rentalsunited.com/api/white-pms/client?userName=…&ownerId=…
 *      using the RU_WHITELABEL_MASTER_USERNAME / RU_WHITELABEL_MASTER_PASSWORD partner
 *      credentials, scoped to the property's sub-user and OwnerID;
 *   3. an admin-entered pair (source = 'admin') as an emergency fallback.
 *
 * Tokens are never logged. They are returned to the authenticated caller only.
 *
 * Actions:
 *   get_tokens  { property_id }                       → { available, access_token, refresh_token, owner_id }
 *   set_tokens  { property_id | ru_owner_id, access_token, refresh_token, expires_in? }  (admin only)
 *   clear_tokens { property_id | ru_owner_id }        (admin only)
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { logRuExchange } from '../_shared/ruApiLog.ts';
import { findOwnerAccount } from '../_shared/ruPhaseGate.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Documented Rentals United White Label endpoints. */
const RU_MASTER_TOKEN_URL = 'https://webapi.rentalsunited.com/whitepms/oauth2/token';
const RU_WL_CLIENT_URL = 'https://webapi.rentalsunited.com/api/white-pms/client';

/** Treat a token as stale a few minutes before RU expires it. */
const EXPIRY_SKEW_MS = 5 * 60_000;
/** Fallback lifetime when RU does not return one. */
const DEFAULT_TTL_SECONDS = 55 * 60;

// deno-lint-ignore no-explicit-any
type Db = any;

function pick(obj: Record<string, unknown>, keys: string[]): string | null {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

/** Find token / refreshToken anywhere in a (possibly nested) RU JSON response. */
function extractTokens(payload: unknown): { access: string | null; refresh: string | null; ttl: number | null } {
  let access: string | null = null;
  let refresh: string | null = null;
  let ttl: number | null = null;

  const walk = (node: unknown, depth: number) => {
    if (!node || typeof node !== 'object' || depth > 5) return;
    const obj = node as Record<string, unknown>;
    access ??= pick(obj, ['token', 'accessToken', 'access_token', 'jwt', 'Token', 'AccessToken']);
    refresh ??= pick(obj, ['refreshToken', 'refresh_token', 'RefreshToken']);
    const rawTtl = obj.expiresIn ?? obj.expires_in ?? obj.ExpiresIn;
    if (ttl == null && (typeof rawTtl === 'number' || typeof rawTtl === 'string')) {
      const n = Number(rawTtl);
      if (Number.isFinite(n) && n > 0) ttl = n;
    }
    for (const v of Object.values(obj)) walk(v, depth + 1);
  };
  walk(payload, 0);
  return { access, refresh, ttl };
}

/**
 * Step 1 of the documented White Label flow: obtain the PMS **master** OAuth token
 * with the partner credentials Rentals United issued to ROL'OS.
 */
async function getMasterToken(): Promise<{ token: string } | { error: string }> {
  const username = (Deno.env.get('RU_WHITELABEL_MASTER_USERNAME') ?? '').trim();
  const password = Deno.env.get('RU_WHITELABEL_MASTER_PASSWORD') ?? '';
  if (!username || !password) {
    return { error: 'master_credentials_missing' };
  }

  const form = new URLSearchParams({ grant_type: 'password', username, password });
  try {
    const res = await fetch(RU_MASTER_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: form.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`[ru-whitelabel-token] Master token HTTP ${res.status}`);
      return { error: `master_token_http_${res.status}` };
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      return { error: 'master_token_non_json' };
    }
    const { access } = extractTokens(parsed);
    if (!access) return { error: 'master_token_missing' };
    return { token: access };
  } catch (e) {
    console.warn('[ru-whitelabel-token] Master token request failed');
    return { error: e instanceof Error ? e.message : 'master_token_request_failed' };
  }
}

/**
 * Step 2: exchange the master token for the sub-user's White Label client token pair
 * scoped to this owner. This is the pair the one-line script consumes.
 */
async function mintSubUserPair(
  masterToken: string,
  userName: string,
  ownerId: string,
): Promise<{ access: string; refresh: string; ttl: number } | { error: string }> {
  const url = `${RU_WL_CLIENT_URL}?userName=${encodeURIComponent(userName)}&ownerId=${encodeURIComponent(ownerId)}`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: { Authorization: `Bearer ${masterToken}`, Accept: 'application/json' },
    });
    const text = await res.text();
    if (!res.ok) {
      console.warn(`[ru-whitelabel-token] Sub-user client HTTP ${res.status} for owner ${ownerId}`);
      return { error: `sub_user_http_${res.status}` };
    }

    // RU returns a <white-pms-host … token="…" refresh_token="…"/> document (sometimes
    // wrapped as a JSON string), so try attribute parsing first, then JSON shapes.
    const attr = (name: string) =>
      text.match(new RegExp(`(?:^|[^\\w-])${name}\\s*=\\s*\\\\?"([^"\\\\]+)`, 'i'))?.[1] ?? '';

    let access = attr('token');
    let refresh = attr('refresh_token');
    let ttl: number | null = Number(attr('expires_in')) || null;

    if (!access || !refresh) {
      try {
        const parsed = JSON.parse(text);
        const extracted = extractTokens(parsed);
        access = access || extracted.access;
        refresh = refresh || extracted.refresh;
        ttl = ttl ?? extracted.ttl;
      } catch {
        // non-JSON is expected for the XML form
      }
    }

    if (!access || !refresh) {
      console.warn(
        `[ru-whitelabel-token] Sub-user client 200 but no pair. userName=${userName} ownerId=${ownerId} body=${text.slice(0, 300)}`,
      );
      return { error: 'sub_user_pair_missing' };
    }
    console.log(`[ru-whitelabel-token] Minted White Label pair for owner ${ownerId}`);
    return { access, refresh, ttl: ttl ?? DEFAULT_TTL_SECONDS };
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'sub_user_request_failed' };
  }
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  try {
    // ── Caller identity (verify_jwt is off platform-side, so validate in code) ──
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ error: 'Authentication required' }, 401);

    const { data: userData } = await admin.auth.getUser(jwt);
    const user = userData?.user;
    if (!user) return json({ error: 'Invalid session' }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body.action ?? 'get_tokens');
    const propertyId = typeof body.property_id === 'string' ? body.property_id : null;

    const isPrivileged = async () => {
      for (const role of ['admin', 'dev', 'fearless_leader']) {
        const { data } = await admin.rpc('has_role', { _user_id: user.id, _role: role });
        if (data === true) return true;
      }
      return false;
    };

    // ── Resolve the RU owner account behind this property ──
    let ownerId = typeof body.ru_owner_id === 'string' ? body.ru_owner_id.trim() : '';
    // deno-lint-ignore no-explicit-any
    let account: any = null;

    if (propertyId) {
      const { data: allowed } = await admin.rpc('can_access_property', {
        _property_id: propertyId,
        _user_id: user.id,
      });
      if (allowed !== true && !(await isPrivileged())) {
        return json({ error: 'You do not have access to this property' }, 403);
      }

      const { data: property } = await admin
        .from('properties')
        .select('id, owner_email')
        .eq('id', propertyId)
        .maybeSingle();
      const resolved = await findOwnerAccount(admin, propertyId, property?.owner_email ?? null, null);
      account = resolved.account;
      ownerId = account?.ru_owner_id ? String(account.ru_owner_id).trim() : ownerId;
    } else if (ownerId) {
      if (!(await isPrivileged())) return json({ error: 'Admin access required' }, 403);
      const { data } = await admin
        .from('ru_owner_accounts')
        .select('*')
        .eq('ru_owner_id', ownerId)
        .maybeSingle();
      account = data;
    } else {
      return json({ error: 'property_id or ru_owner_id is required' }, 400);
    }

    // ── Admin writes ──
    if (action === 'set_tokens' || action === 'clear_tokens') {
      if (!(await isPrivileged())) return json({ error: 'Admin access required' }, 403);
      if (!account?.id) return json({ error: 'No Rentals United owner account for this property' }, 404);

      if (action === 'clear_tokens') {
        await admin
          .from('ru_owner_accounts')
          .update({
            ru_wl_access_token: null,
            ru_wl_refresh_token: null,
            ru_wl_token_expires_at: null,
            ru_wl_token_source: null,
          })
          .eq('id', account.id);
        return json({ success: true, cleared: true });
      }

      const access = typeof body.access_token === 'string' ? body.access_token.trim() : '';
      const refresh = typeof body.refresh_token === 'string' ? body.refresh_token.trim() : '';
      if (!access || !refresh) return json({ error: 'access_token and refresh_token are required' }, 400);
      const ttl = Number(body.expires_in) > 0 ? Number(body.expires_in) : DEFAULT_TTL_SECONDS;
      await admin
        .from('ru_owner_accounts')
        .update({
          ru_wl_access_token: access,
          ru_wl_refresh_token: refresh,
          ru_wl_token_expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
          ru_wl_token_source: 'admin',
        })
        .eq('id', account.id);
      return json({ success: true, owner_id: ownerId || null });
    }

    // ── get_tokens ──
    if (!account || !ownerId) {
      return json({
        success: true,
        available: false,
        reason: 'no_owner_account',
        message: 'Channel Manager is not activated for this owner yet.',
      });
    }

    const expiresAt = account.ru_wl_token_expires_at ? new Date(account.ru_wl_token_expires_at).getTime() : 0;
    const cachedValid =
      account.ru_wl_access_token &&
      account.ru_wl_refresh_token &&
      expiresAt > Date.now() + EXPIRY_SKEW_MS;

    if (cachedValid) {
      return json({
        success: true,
        available: true,
        owner_id: ownerId,
        access_token: account.ru_wl_access_token,
        refresh_token: account.ru_wl_refresh_token,
        expires_at: account.ru_wl_token_expires_at,
        source: account.ru_wl_token_source ?? 'cache',
      });
    }

    // ── Sub-user identity (canonical store: ru_api_credentials) ──
    // A verified sub-user means the RU setup IS complete on the owner's side; only the
    // White Label sign-in may still be outstanding, so never tell them to redo setup.
    const { data: credRow } = await admin
      .from('ru_api_credentials')
      .select('access_key, verified_at, login_email')
      .eq('ru_owner_id', ownerId)
      .maybeSingle();
    const subUserVerified = !!(credRow?.access_key || account.ru_api_access_key);

    // ── Documented two-step White Label exchange: master token → sub-user pair ──
    const subUserName = String(
      credRow?.login_email || account.ru_login_email || account.owner_email || '',
    ).trim();
    let exchangeError: string | null = null;

    // Certification logging. These are OAuth/token endpoints, not XML exchanges: the bodies carry
    // partner credentials and live tokens, so only the outcome metadata is retained.
    const logExchange = async (action: string, startedAt: number, error: string | null) =>
      logRuExchange(admin, {
        action,
        parent_action: 'ru-whitelabel-token',
        property_id: account.property_id ?? null,
        ru_owner_id: ownerId,
        success: !error,
        elapsed_ms: Date.now() - startedAt,
        error_message: error,
        status_message: error ? null : 'token issued (bodies withheld — credential material)',
      });

    if (subUserName) {
      const masterStartedAt = Date.now();
      const master = await getMasterToken();
      await logExchange('WL_MasterToken', masterStartedAt, 'error' in master ? master.error : null);
      if ('error' in master) {
        exchangeError = master.error;
      } else {
        const mintStartedAt = Date.now();
        const minted = await mintSubUserPair(master.token, subUserName, ownerId);
        await logExchange('WL_SubUserClientToken', mintStartedAt, 'error' in minted ? minted.error : null);
        if ('error' in minted) {
          exchangeError = minted.error;
        } else {

          const expiry = new Date(Date.now() + minted.ttl * 1000).toISOString();
          await admin
            .from('ru_owner_accounts')
            .update({
              ru_wl_access_token: minted.access,
              ru_wl_refresh_token: minted.refresh,
              ru_wl_token_expires_at: expiry,
              ru_wl_token_source: 'master_exchange',
            })
            .eq('id', account.id);
          return json({
            success: true,
            available: true,
            owner_id: ownerId,
            access_token: minted.access,
            refresh_token: minted.refresh,
            expires_at: expiry,
            source: 'master_exchange',
          });
        }
      }
    } else {
      exchangeError = 'sub_user_name_missing';
    }

    if (account.ru_wl_access_token && account.ru_wl_refresh_token) {
      return json({
        success: true,
        available: true,
        owner_id: ownerId,
        access_token: account.ru_wl_access_token,
        refresh_token: account.ru_wl_refresh_token,
        expires_at: account.ru_wl_token_expires_at,
        source: 'stale',
      });
    }

    if (subUserVerified) {
      return json({
        success: true,
        available: false,
        reason: 'awaiting_wl_token',
        sub_user_verified: true,
        diagnostic: exchangeError,
        message:
          "The ROL'OS account is connected. Channel Manager sign-in is still being finalised by TOBI.",
      });
    }

    return json({
      success: true,
      available: false,
      reason: 'no_credentials',
      message: "The ROL'OS Channel Manager connection has not been completed for this owner.",
    });

  } catch (error) {
    console.error('[ru-whitelabel-token] Error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
