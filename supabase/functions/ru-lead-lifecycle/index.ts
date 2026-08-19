import { createClient } from 'npm:@supabase/supabase-js@2';
import { findOwnerAccount } from '../_shared/ruPhaseGate.ts';

/**
 * Rentals United lead lifecycle worker.
 *
 * A pulled RU lead (Pull_GetLeads_RQ) becomes a `pending` booking with
 * `integration_type = 'rentalsunited_lead'` that HOLDS the nights in
 * `property_availability` for 3 days (see cron-pull-ru-reservations).
 *
 * This worker enforces the rest of the policy, on a 30-minute cadence:
 *
 *  1. Hold expiry (created > 3 days ago) → release the availability block so the
 *     nights can be sold elsewhere. The enquiry itself stays visible on the
 *     calendar / dashboard as an unblocked lead.
 *  2. Arrival inside 14 days AND older than 3 days → withdraw the request at RU
 *     (`Push_RejectRequest_RQ`, falling back to `Push_CancelReservation_RQ`),
 *     cancel it locally with the note
 *     "Held for 3 days and not paid within 14 days of arrival", and remove it
 *     from availability, calendar and dashboard.
 *
 * Auth: reject/cancel are child-scoped. Every call authenticates as the RU
 * sub-user that owns the property — a master-credential fallback is refused.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Days a lead may hold the dates. */
const HOLD_DAYS = 3;
/** Arrival proximity at which an unpaid, expired lead is withdrawn at RU. */
const ARRIVAL_CUTOFF_DAYS = 14;
export const CANCEL_NOTE = 'Held for 3 days and not paid within 14 days of arrival';
/** RU rate limit: one call per method per sliding minute (+1s safety). */
const METHOD_WINDOW_MS = 61_000;
const RUN_BUDGET_MS = 5 * 60_000;

interface LeadBooking {
  id: string;
  property_id: string;
  room_type_id: string | null;
  check_in_date: string;
  check_out_date: string;
  status: string;
  external_reservation_id: string | null;
  lead_created_at: string | null;
  hold_expires_at: string | null;
  hold_released_at: string | null;
  created_at: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const summary = { examined: 0, released: 0, rejected: 0, reject_failed: 0, skipped: 0 };
  const startedAt = Date.now();
  const deadline = startedAt + RUN_BUDGET_MS;
  const details: Record<string, unknown>[] = [];

  /**
   * Release or re-block the nights a lead is holding.
   *
   * Uses the shared stamped helpers, so a release finds the nights by the booking that closed
   * them (surviving a unit rename) and every re-block is traceable back to its stay.
   */
  const applyAvailability = async (lead: LeadBooking, block: boolean) => {
    if (!block) {
      const released = await releaseChannelBlocksForBooking(supabase, lead.id, '[ru-lead-lifecycle]');
      if (released > 0) return;
    }
    await applyRuAvailabilityBlock(
      supabase,
      lead.property_id,
      lead.room_type_id,
      lead.check_in_date,
      lead.check_out_date,
      block,
      '[ru-lead-lifecycle]',
      lead.id,
    );
  };


  /** Child auth payload for the RU sub-user that owns this property. */
  const resolveChildAuth = async (propertyId: string): Promise<Record<string, unknown> | null> => {
    const { data: property } = await supabase
      .from('properties')
      .select('id, owner_email')
      .eq('id', propertyId)
      .maybeSingle();
    const { account } = await findOwnerAccount(supabase, propertyId, property?.owner_email ?? null, null);
    const ownerId = account?.ru_owner_id ? String(account.ru_owner_id).trim() : '';
    if (!ownerId) return null;

    const decryptSecret = async (enc: unknown): Promise<string> => {
      if (!enc) return '';
      const { data } = await supabase.rpc('decrypt_sensitive_text', { encrypted_data: enc });
      const plain = typeof data === 'string' ? data : '';
      return plain && plain !== '[ENCRYPTED]' && plain !== '[DECRYPTION_ERROR]' ? plain : '';
    };

    const { data: credRow } = await supabase
      .from('ru_api_credentials')
      .select('access_key, secret_enc')
      .eq('ru_owner_id', ownerId)
      .maybeSingle();
    if (credRow?.access_key) {
      const secret = await decryptSecret(credRow.secret_enc);
      if (secret) {
        return { owner_id: ownerId, auth_access_key: String(credRow.access_key), auth_secret_key: secret };
      }
    }
    const legacyKey = (account as Record<string, unknown> | null)?.ru_api_access_key;
    if (legacyKey) {
      const secret = await decryptSecret((account as Record<string, unknown>).ru_api_secret_enc);
      if (secret) return { owner_id: ownerId, auth_access_key: String(legacyKey), auth_secret_key: secret };
    }
    // Legacy portal password (pre-API-key sub-users only).
    const password = await decryptSecret((account as Record<string, unknown> | null)?.ru_login_password_enc);
    if (account?.ru_login_email && password) {
      return { owner_id: ownerId, auth_username: account.ru_login_email.trim(), auth_password: password };
    }
    return null;
  };

  let lastRuCallAt = 0;
  /** Withdraw the request at RU: reject first, cancel_reservation as fallback. */
  const withdrawAtRu = async (
    reservationId: string,
    auth: Record<string, unknown>,
  ): Promise<{ ok: boolean; method: string; error?: string }> => {
    const wait = lastRuCallAt ? METHOD_WINDOW_MS - (Date.now() - lastRuCallAt) : 0;
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));

    for (const action of ['reject_request', 'cancel_reservation'] as const) {
      lastRuCallAt = Date.now();
      const { data, error } = await supabase.functions.invoke('rentalsunited-api', {
        body: { action, reservation_id: reservationId, reject_reason: CANCEL_NOTE, ...auth },
      });
      if (!error && data?.success) {
        if (data.auth_mode === 'master') {
          return { ok: false, method: action, error: 'RU answered on master credentials — refused' };
        }
        return { ok: true, method: action };
      }
      const msg = error?.message || data?.error?.message || 'Unknown RU error';
      console.warn(`[ru-lead-lifecycle] ${action} failed for ${reservationId}: ${msg}`);
      if (action === 'cancel_reservation') return { ok: false, method: action, error: msg };
      // Pace the fallback call (different method, but stay polite).
      await new Promise((r) => setTimeout(r, 2_000));
    }
    return { ok: false, method: 'none', error: 'No RU method succeeded' };
  };

  try {
    const now = new Date();
    const { data: leads } = await supabase
      .from('bookings')
      .select(
        'id, property_id, room_type_id, check_in_date, check_out_date, status, external_reservation_id, lead_created_at, hold_expires_at, hold_released_at, created_at',
      )
      .eq('integration_type', 'rentalsunited_lead')
      .eq('status', 'pending')
      .order('check_in_date', { ascending: true })
      .limit(200);

    const rows = (leads ?? []) as LeadBooking[];
    summary.examined = rows.length;

    for (const lead of rows) {
      const created = new Date(lead.lead_created_at ?? lead.created_at);
      const holdExpires = new Date(lead.hold_expires_at ?? created.getTime() + HOLD_DAYS * 86_400_000);
      const holdExpired = holdExpires.getTime() <= now.getTime();
      const daysToArrival = Math.ceil(
        (new Date(`${lead.check_in_date}T00:00:00Z`).getTime() - now.getTime()) / 86_400_000,
      );
      const withinArrivalCutoff = daysToArrival <= ARRIVAL_CUTOFF_DAYS;

      // ── Case 2: expired hold + arrival inside 14 days → withdraw at RU ──
      if (holdExpired && withinArrivalCutoff) {
        if (Date.now() > deadline) {
          summary.skipped++;
          continue;
        }
        const auth = lead.external_reservation_id ? await resolveChildAuth(lead.property_id) : null;
        let ruOutcome: { ok: boolean; method: string; error?: string } = {
          ok: false,
          method: 'none',
          error: auth ? 'missing reservation id' : 'no RU sub-user credentials for this property',
        };
        if (auth && lead.external_reservation_id) {
          ruOutcome = await withdrawAtRu(lead.external_reservation_id, auth);
        }

        if (ruOutcome.ok) {
          await supabase
            .from('bookings')
            .update({
              status: 'cancelled',
              cancellation_reason: CANCEL_NOTE,
              hold_released_at: lead.hold_released_at ?? now.toISOString(),
            })
            .eq('id', lead.id);
          if (!lead.hold_released_at) await applyAvailability(lead, false);
          summary.rejected++;
        } else {
          summary.reject_failed++;
        }
        details.push({
          lead: lead.external_reservation_id,
          action: 'withdraw',
          method: ruOutcome.method,
          ok: ruOutcome.ok,
          error: ruOutcome.error ?? null,
          days_to_arrival: daysToArrival,
        });
        continue;
      }

      // ── Case 1: hold expired → release the dates, keep the enquiry ──
      if (holdExpired && !lead.hold_released_at) {
        await applyAvailability(lead, false);
        await supabase
          .from('bookings')
          .update({ hold_released_at: now.toISOString() })
          .eq('id', lead.id);
        summary.released++;
        details.push({ lead: lead.external_reservation_id, action: 'release_hold', days_to_arrival: daysToArrival });
        continue;
      }

      summary.skipped++;
    }

    await supabase.from('ru_sync_runs').insert({
      batch_id: crypto.randomUUID(),
      action: 'lead_lifecycle',
      success: summary.reject_failed === 0,
      error_message: summary.reject_failed ? `${summary.reject_failed} RU withdrawal(s) failed` : null,
      elapsed_ms: Date.now() - startedAt,
      details: { ...summary, scope: 'lead_lifecycle', leads: details },
    }).then(() => {}, (e) => console.warn('[ru-lead-lifecycle] log insert failed', e));

    console.log('[ru-lead-lifecycle] Done:', JSON.stringify(summary));
    return new Response(JSON.stringify({ success: true, summary, details }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[ru-lead-lifecycle] Fatal:', error);
    return new Response(JSON.stringify({ success: false, error: String(error), summary }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
