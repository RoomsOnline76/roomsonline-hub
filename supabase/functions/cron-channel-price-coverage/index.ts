// Channel price-coverage audit runner.
//
// Walks every trading, channel-connected unit, asks the channel what prices it actually holds for
// the next 365 days, and then either:
//   • records `verified`,
//   • re-pushes rates once through the rate gate when ROL'OS holds a full priced year (`channel_short`),
//   • records an actionable owner/admin gap when ROL'OS itself is missing rates (`local_incomplete`),
//   • leaves `unverified` for the next run when the read could not be performed.
//
// Callable with `{ property_ids: [...] }` to scope it (post-push re-audit, or after rates are
// authored in Rate Manager), and with `{ backfill: true }` to sweep the whole portfolio.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import {
  auditChannelPriceCoverage,
  persistPriceCoverage,
  readPriceCoverageAttempts,
} from '../_shared/ruPriceCoverage.ts';
import { resolveRuChildAuth } from '../_shared/ruBookingSync.ts';

const MAX_REPUSH_ATTEMPTS = 1;

interface UnitTarget {
  property_id: string;
  property_name: string;
  room_type_id: string | null;
  unit_name: string | null;
  listing_id: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  let scopeIds: string[] = [];
  let maxUnits = 40;
  try {
    const body = await req.json();
    if (Array.isArray(body?.property_ids)) scopeIds = body.property_ids.filter((v: unknown) => typeof v === 'string');
    if (Number.isFinite(body?.max_units)) maxUnits = Math.max(1, Math.min(200, Number(body.max_units)));
  } catch (_e) {
    // no body — full run
  }

  // An explicit scope is an operator asking about THESE properties (wizard "Re-check").
  // The cron-wide trading / push-enabled filters must not silently drop them: a test clone or a
  // not-yet-trading property that already has channel listings still has a priced year to audit,
  // and skipping it returned "audited: 0", which the wizard could only read as "never checked".
  const isScopedRun = scopeIds.length > 0;

  try {
    const propQuery = admin
      .from('properties')
      .select('id, name, rentalsunited_property_id, ru_push_enabled, is_active, is_trading')
      .not('rentalsunited_property_id', 'is', null);
    const unitQuery = admin
      .from('hostfully_room_types')
      .select('id, name, property_id, rentalsunited_property_id, is_active, properties!inner(id, name, is_active, is_trading, ru_push_enabled)')
      .eq('is_active', true)
      .not('rentalsunited_property_id', 'is', null);
    if (isScopedRun) {
      propQuery.in('id', scopeIds);
      unitQuery.in('property_id', scopeIds);
    } else {
      propQuery.eq('is_active', true).eq('ru_push_enabled', true);
    }
    const [{ data: props }, { data: units }] = await Promise.all([propQuery, unitQuery]);

    const targets: UnitTarget[] = [];
    const seen = new Set<string>();
    const push = (t: UnitTarget) => {
      const key = `${t.property_id}:${t.listing_id}`;
      if (seen.has(key)) return;
      seen.add(key);
      targets.push(t);
    };

    for (const row of (units ?? []) as any[]) {
      const p = row.properties;
      if (!p) continue;
      if (!isScopedRun && (p.is_active === false || p.is_trading === false || p.ru_push_enabled !== true)) continue;
      if (scopeIds.length && !scopeIds.includes(p.id)) continue;
      push({
        property_id: p.id,
        property_name: p.name,
        room_type_id: row.id ?? null,
        unit_name: row.name ?? null,
        listing_id: String(row.rentalsunited_property_id),
      });
    }
    for (const p of (props ?? []) as any[]) {
      if (!isScopedRun && p.is_trading === false) continue;
      if (scopeIds.length && !scopeIds.includes(p.id)) continue;
      push({
        property_id: p.id,
        property_name: p.name,
        room_type_id: null,
        unit_name: null,
        listing_id: String(p.rentalsunited_property_id),
      });
    }

    const scoped = targets.slice(0, maxUnits);
    const authCache = new Map<string, Record<string, unknown> | null>();
    const results: Array<Record<string, unknown>> = [];

    for (const t of scoped) {
      if (!authCache.has(t.property_id)) {
        authCache.set(t.property_id, await resolveRuChildAuth(admin, t.property_id));
      }
      const childAuth = authCache.get(t.property_id) ?? null;

      let audit = await auditChannelPriceCoverage(admin, {
        propertyId: t.property_id,
        ruPropertyId: t.listing_id,
        unitName: t.unit_name,
        roomTypeId: t.room_type_id,
        childAuth,
      });

      let attempts = await readPriceCoverageAttempts(admin, t.property_id, t.listing_id);
      let repushed = false;

      // Auto-correct: our data is complete, the channel is short → re-send once through the gate.
      if (audit.verdict === 'channel_short' && attempts < MAX_REPUSH_ATTEMPTS) {
        attempts += 1;
        repushed = true;
        try {
          await admin.functions.invoke('push-property-to-ru', {
            body: { property_id: t.property_id, action: 'refresh_ari', trigger: 'price_coverage_repair' },
          });
        } catch (_e) {
          // Rate-limited / deferred pushes are parked by the call queue; the next run re-audits.
        }
        const after = await auditChannelPriceCoverage(admin, {
          propertyId: t.property_id,
          ruPropertyId: t.listing_id,
          unitName: t.unit_name,
          roomTypeId: t.room_type_id,
          childAuth,
        });
        // Only trust a better answer; a failed post-push read must not erase the known shortfall.
        if (after.verdict !== 'unverified') audit = after;
      } else if (audit.verdict === 'channel_short') {
        audit.gap_summary =
          `The channel still holds prices for only ${audit.channel_priced_days} of ${audit.expected_days} nights after an automatic re-send. Needs a look.`;
      }

      await persistPriceCoverage(admin, audit, {
        repush_attempts: audit.verdict === 'verified' ? 0 : attempts,
        last_repush_at: repushed ? new Date().toISOString() : undefined,
        details: { property_name: t.property_name, repushed, trigger: scopeIds.length ? 'scoped' : 'cron' },
      });

      results.push({
        property: t.property_name,
        unit: t.unit_name,
        listing_id: t.listing_id,
        verdict: audit.verdict,
        channel_priced_days: audit.channel_priced_days,
        local_unpriced_days: audit.local_unpriced_days,
        repushed,
        error: audit.error_message,
      });
    }

    const summary = results.reduce((acc: Record<string, number>, r) => {
      const v = String(r.verdict);
      acc[v] = (acc[v] ?? 0) + 1;
      return acc;
    }, {});

    return new Response(
      JSON.stringify({ success: true, audited: results.length, of_targets: targets.length, summary, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
