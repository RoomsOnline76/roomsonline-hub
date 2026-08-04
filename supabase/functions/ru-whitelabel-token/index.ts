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
 *   2. minted server-side by signing in to the RU portal with the owner's stored
 *      sub-user login (`ru_login_email` + encrypted `ru_login_password_enc`);
 *   3. an admin-entered pair (source = 'admin'), used when RU has not enabled a
 *      programmatic login for the integration.
 *
 * Tokens are never logged. They are returned to the authenticated caller only.
 *
 * Actions:
 *   get_tokens  { property_id }                       → { available, access_token, refresh_token, owner_id }
 *   set_tokens  { property_id | ru_owner_id, access_token, refresh_token, expires_in? }  (admin only)
 *   clear_tokens { property_id | ru_owner_id }        (admin only)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
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

/** RU portal login candidates — the first that returns a token pair wins. */
const RU_LOGIN_ENDPOINTS = [
  'https://new.rentalsunited.com/api/authorization/login',
  'https://new.rentalsunited.com/api/auth/login',
  'https://new.rentalsunited.com/api/account/login',
];

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
    if (!node || typeof node !== 'object' || depth > 4) return;
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

async function decryptSecret(admin: Db, enc: unknown): Promise<string> {
  if (!enc) return '';
  const { data } = await admin.rpc('decrypt_sensitive_text', { encrypted_data: enc });
  const plain = typeof data === 'string' ? data : '';
  return plain && plain !== '[ENCRYPTED]' && plain !== '[DECRYPTION_ERROR]' ? plain : '';
}

/** Sign in to the RU portal and return a White Label token pair. */
async function mintFromLogin(
  email: string,
  password: string,
): Promise<{ access: string; refresh: string; ttl: number } | { error: string }> {
  const attempts: string[] = [];
  for (const url of RU_LOGIN_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ email, username: email, login: email, password }),
      });
      const text = await res.text();
      if (!res.ok) {
        attempts.push(`${url} → HTTP ${res.status}`);
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        attempts.push(`${url} → non-JSON response`);
        continue;
      }
      const { access, refresh, ttl } = extractTokens(parsed);
      if (access && refresh) {
        console.log(`[ru-whitelabel-token] Minted White Label tokens via ${url}`);
        return { access, refresh, ttl: ttl ?? DEFAULT_TTL_SECONDS };
      }
      attempts.push(`${url} → no token pair in response`);
    } catch (e) {
      attempts.push(`${url} → ${e instanceof Error ? e.message : 'request failed'}`);
    }
  }
  console.warn(`[ru-whitelabel-token] Login mint failed: ${attempts.join(' | ')}`);
  return { error: `Rentals United did not return a White Label token pair (${attempts.join('; ')})` };
}

/** White Label token exchange candidates using the sub-user's API key pair. */
const RU_KEY_EXCHANGE_ENDPOINTS = [
  'https://new.rentalsunited.com/api/authorization/token',
  'https://new.rentalsunited.com/api/authorization/api-key-login',
  'https://new.rentalsunited.com/api/white-pms/token',
];

/**
 * Exchange the verified sub-user AccessKey/SecretKey for a White Label token pair.
 * Rentals United has not published a programmatic endpoint for this, so every
 * candidate is tried and any failure is reported back as a reason (never as a
 * "your setup is incomplete" message).
 */
async function mintFromKeys(
  accessKey: string,
  secretKey: string,
  ownerId: string,
): Promise<{ access: string; refresh: string; ttl: number } | { error: string }> {
  const attempts: string[] = [];
  for (const url of RU_KEY_EXCHANGE_ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ accessKey, secretKey, ownerId }),
      });
      const text = await res.text();
      if (!res.ok) {
        attempts.push(`HTTP ${res.status}`);
        continue;
      }
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        attempts.push('non-JSON response');
        continue;
      }
      const { access, refresh, ttl } = extractTokens(parsed);
      if (access && refresh) {
        console.log('[ru-whitelabel-token] Minted White Label tokens from sub-user API keys');
        return { access, refresh, ttl: ttl ?? DEFAULT_TTL_SECONDS };
      }
      attempts.push('no token pair in response');
    } catch (e) {
      attempts.push(e instanceof Error ? e.message : 'request failed');
    }
  }
  console.warn(`[ru-whitelabel-token] Key exchange unavailable: ${attempts.join(' | ')}`);
  return {
    error:
      "White Label token pair not yet available from the channel provider. The ROL'OS connection is unaffected; sign-in will be retried automatically.",
  };
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

    // ── Verified sub-user API keys (canonical store: ru_api_credentials) ──
    // A verified sub-user means the RU setup IS complete on the owner's side; only the
    // White Label sign-in may still be outstanding, so never tell them to redo setup.
    const { data: credRow } = await admin
      .from('ru_api_credentials')
      .select('access_key, secret_enc, verified_at, login_email')
      .eq('ru_owner_id', ownerId)
      .maybeSingle();
    const subUserVerified = !!(credRow?.access_key || account.ru_api_access_key);
    let keyExchangeError: string | null = null;

    if (credRow?.access_key) {
      const secret = await decryptSecret(admin, credRow.secret_enc);
      if (secret) {
        const exchanged = await mintFromKeys(String(credRow.access_key), secret, ownerId);
        if (!('error' in exchanged)) {
          const keyExpiry = new Date(Date.now() + exchanged.ttl * 1000).toISOString();
          await admin
            .from('ru_owner_accounts')
            .update({
              ru_wl_access_token: exchanged.access,
              ru_wl_refresh_token: exchanged.refresh,
              ru_wl_token_expires_at: keyExpiry,
              ru_wl_token_source: 'keys',
            })
            .eq('id', account.id);
          return json({
            success: true,
            available: true,
            owner_id: ownerId,
            access_token: exchanged.access,
            refresh_token: exchanged.refresh,
            expires_at: keyExpiry,
            source: 'keys',
          });
        }
        keyExchangeError = exchanged.error;
      }
    }

    const loginEmail = (account.ru_login_email || credRow?.login_email || account.owner_email || '').trim();
    const password = await decryptSecret(admin, account.ru_login_password_enc);


    if (loginEmail && password) {
      const minted = await mintFromLogin(loginEmail, password);
      if ('error' in minted) {
        // An expired admin pair is still better than nothing — the White Label client
        // refreshes itself with the refresh token when the access token has lapsed.
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
        return json({
          success: true,
          available: false,
          reason: 'login_failed',
          message: minted.error,
        });
      }

      const newExpiry = new Date(Date.now() + minted.ttl * 1000).toISOString();
      await admin
        .from('ru_owner_accounts')
        .update({
          ru_wl_access_token: minted.access,
          ru_wl_refresh_token: minted.refresh,
          ru_wl_token_expires_at: newExpiry,
          ru_wl_token_source: 'login',
        })
        .eq('id', account.id);

      return json({
        success: true,
        available: true,
        owner_id: ownerId,
        access_token: minted.access,
        refresh_token: minted.refresh,
        expires_at: newExpiry,
        source: 'login',
      });
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
        message:
          keyExchangeError ??
          'The Rentals United sub-user is connected and verified, but no White Label Channel Manager token pair has been issued yet.',
      });
    }

    return json({
      success: true,
      available: false,
      reason: 'no_credentials',
      message: 'No Rentals United sub-user credentials or White Label token pair are stored for this owner.',
    });

  } catch (error) {
    console.error('[ru-whitelabel-token] Error:', error);
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 500);
  }
});
