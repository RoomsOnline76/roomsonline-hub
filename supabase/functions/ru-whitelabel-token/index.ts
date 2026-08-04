/**
 * ru-whitelabel-token
 *
 * Returns a configured Rentals United **White Label Channel Manager** token
 * pair for the RU sub-user account that owns a ROL'OS property, so the ROL'OS
 * Channels page can boot the one-line White Label script:
 *
 *   https://new.rentalsunited.com/white-pms-client/script
 *     ?token=…&refreshToken=…&languageId=1&uiVersion=2&ownerId=…
 *
 * Token sources, in order:
 *   1. cached pair on `ru_owner_accounts` (ru_wl_access_token / ru_wl_refresh_token)
 *      while still inside its expiry window;
 *   2. an admin-entered pair (source = 'admin').
 *
 * RU has not supplied a documented programmatic White Label token exchange contract.
 * API keys authenticate the XML API; they are not assumed to be White Label browser
 * tokens. Do not add guessed portal endpoints here.
 *
 * Tokens are never logged. They are returned to the authenticated caller only.
 *
 * Actions:
 *   get_tokens  { property_id }                       → { available, access_token, refresh_token, owner_id }
 *   set_tokens  { property_id | ru_owner_id, access_token, refresh_token, expires_in? }  (admin only)
 *   clear_tokens { property_id | ru_owner_id }        (admin only)
 */
import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { z } from 'npm:zod@3.23.8';
import { findOwnerAccount } from '../_shared/ruPhaseGate.ts';

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

/** Treat a token as stale a few minutes before RU expires it. */
const EXPIRY_SKEW_MS = 5 * 60_000;
/** Fallback lifetime when RU does not return one. */
const DEFAULT_TTL_SECONDS = 55 * 60;

// deno-lint-ignore no-explicit-any
type Db = any;

const RequestSchema = z.object({
  action: z.enum(['get_tokens', 'set_tokens', 'clear_tokens']).default('get_tokens'),
  property_id: z.string().uuid().optional(),
  ru_owner_id: z.string().trim().regex(/^\d+$/).max(32).optional(),
  access_token: z.string().trim().min(1).max(16_384).optional(),
  refresh_token: z.string().trim().min(1).max(16_384).optional(),
  expires_in: z.coerce.number().int().positive().max(31_536_000).optional(),
}).refine((value) => value.property_id || value.ru_owner_id, {
  message: 'property_id or ru_owner_id is required',
});



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

    const parsed = RequestSchema.safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: parsed.error.flatten().fieldErrors }, 400);
    const body = parsed.data;
    const action = body.action;
    const propertyId = body.property_id ?? null;

    const isPrivileged = async () => {
      for (const role of ['admin', 'dev', 'fearless_leader']) {
        const { data } = await admin.rpc('has_role', { _user_id: user.id, _role: role });
        if (data === true) return true;
      }
      return false;
    };

    // ── Resolve the RU owner account behind this property ──
    let ownerId = body.ru_owner_id ?? '';
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

      const access = body.access_token ?? '';
      const refresh = body.refresh_token ?? '';
      if (!access || !refresh) return json({ error: 'access_token and refresh_token are required' }, 400);
      const ttl = body.expires_in ?? DEFAULT_TTL_SECONDS;
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
      .select('access_key, verified_at')
      .eq('ru_owner_id', ownerId)
      .maybeSingle();
    const subUserVerified = !!(credRow?.access_key || account.ru_api_access_key);
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
        diagnostic_code: 'RU_WL_TOKEN_CONTRACT_NOT_CONFIGURED',
        message: "The ROL'OS account is connected. Channel Manager sign-in is still being finalised by TOBI.",
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
