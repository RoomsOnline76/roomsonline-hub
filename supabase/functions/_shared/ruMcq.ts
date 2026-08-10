/**
 * Rentals United Minimum Content Quality (MCQ) — shared resolution helpers.
 *
 * MCQ is ordered per RU *listing* (PropertyID) against a *sales channel* (ChannelID).
 * Two historical faults are guarded here:
 *   - a sub-user OwnerID was passed as the PropertyID → RU status 56 "Property does not exist"
 *   - a stale / unresolved ChannelID was sent          → RU status 219 "Invalid ChannelId"
 */

// deno-lint-ignore no-explicit-any
type Admin = any;

export const MCQ_DEFAULT_CHANNEL_NAME = 'LekkeSlaap';

export const mcqChannelSettingKey = (propertyId?: string | null) =>
  propertyId ? `ru_channel_id:${propertyId}` : 'ru_channel_id';

export interface McqTarget {
  ru_property_id: string;
  label: string;
  scope: 'property' | 'unit';
}

/** Every RU OwnerID we know about — none of these is ever a valid MCQ PropertyID. */
export async function loadRuOwnerIds(admin: Admin): Promise<Set<string>> {
  const out = new Set<string>();
  try {
    const { data } = await admin.from('ru_owner_accounts').select('ru_owner_id').not('ru_owner_id', 'is', null);
    for (const row of data ?? []) {
      const v = String((row as { ru_owner_id?: unknown }).ru_owner_id ?? '').trim();
      if (v) out.add(v);
    }
  } catch (_e) { /* guard is best-effort; target validation below still applies */ }
  return out;
}

/**
 * Resolve the RU listing IDs a quality check should be ordered for.
 * Multi-unit buildings carry no property-level PropertyID — each unit is its own listing.
 */
export async function resolveMcqTargets(
  admin: Admin,
  propertyId: string,
  prop: { name?: string | null; rentalsunited_property_id?: string | number | null },
  explicitRuId?: string | number | null,
): Promise<{ targets: McqTarget[]; error?: { code: string; message: string } }> {
  const ownerIds = await loadRuOwnerIds(admin);

  const knownListingIds = new Set<string>();
  if (prop.rentalsunited_property_id) knownListingIds.add(String(prop.rentalsunited_property_id));
  const { data: units } = await admin
    .from('hostfully_room_types')
    .select('name, rentalsunited_property_id, is_active')
    .eq('property_id', propertyId)
    .not('rentalsunited_property_id', 'is', null);
  const unitRows = (units ?? []) as Array<{ name?: string | null; rentalsunited_property_id?: string | number | null; is_active?: boolean | null }>;
  for (const u of unitRows) {
    if (u.rentalsunited_property_id) knownListingIds.add(String(u.rentalsunited_property_id));
  }

  if (explicitRuId !== undefined && explicitRuId !== null && String(explicitRuId).trim() !== '') {
    const id = String(explicitRuId).trim();
    if (ownerIds.has(id)) {
      return {
        targets: [],
        error: {
          code: 'MCQ_TARGET_IS_OWNER_ID',
          message: `${id} is a Rentals United account (OwnerID), not a listing ID. Order the quality check against a published listing.`,
        },
      };
    }
    if (!knownListingIds.has(id)) {
      return {
        targets: [],
        error: {
          code: 'MCQ_TARGET_UNKNOWN',
          message: `Listing ${id} is not mapped to this property in ROL'OS. Fetch the channel IDs for the property first.`,
        },
      };
    }
    return { targets: [{ ru_property_id: id, label: prop.name ?? 'Listing', scope: 'unit' }] };
  }

  const targets: McqTarget[] = [];
  if (prop.rentalsunited_property_id && !ownerIds.has(String(prop.rentalsunited_property_id))) {
    targets.push({ ru_property_id: String(prop.rentalsunited_property_id), label: prop.name ?? 'Property', scope: 'property' });
  }
  if (targets.length === 0) {
    for (const u of unitRows) {
      const id = String(u.rentalsunited_property_id ?? '').trim();
      if (!id || ownerIds.has(id)) continue;
      if (u.is_active === false) continue;
      targets.push({ ru_property_id: id, label: u.name ?? 'Unit', scope: 'unit' });
    }
  }

  if (targets.length === 0) {
    return {
      targets: [],
      error: {
        code: 'NO_RU_PROPERTY',
        message:
          'This property is not published to the channel manager yet, so there is no listing to check. Publish it first, then fetch the channel IDs.',
      },
    };
  }
  return { targets };
}

/**
 * Resolve the ChannelID for MCQ: stored property setting → account setting → live pull.
 * A live pull is stored so the next order does not need it.
 */
export async function resolveMcqChannelId(
  admin: Admin,
  propertyId: string | null,
  explicit?: number | string | null,
  channelName = MCQ_DEFAULT_CHANNEL_NAME,
): Promise<{ channel_id: number | null; source: string; error?: { code: string; message: string } }> {
  const direct = Number(explicit ?? 0);
  if (direct > 0) return { channel_id: direct, source: 'request' };

  const keys = propertyId ? [mcqChannelSettingKey(propertyId), mcqChannelSettingKey(null)] : [mcqChannelSettingKey(null)];
  const { data: rows } = await admin.from('ru_platform_settings').select('key, value').in('key', keys);
  for (const key of keys) {
    const raw = (rows ?? []).find((r: { key: string }) => r.key === key)?.value as unknown;
    const candidate = Number(
      typeof raw === 'object' && raw !== null ? ((raw as { channel_id?: unknown }).channel_id ?? 0) : raw ?? 0,
    );
    if (candidate > 0) return { channel_id: candidate, source: key.includes(':') ? 'property_setting' : 'account_setting' };
  }

  // Nothing stored — pull the channel list from RU and store the match.
  try {
    const { data: result, error } = await admin.functions.invoke('rentalsunited-api', {
      body: { action: 'list_sales_channels', channel_name: channelName, property_id: propertyId },
    });
    const matched = (result as { matched?: { channel_id?: number; company_name?: string } } | null)?.matched ?? null;
    const channelId = Number(matched?.channel_id ?? 0);
    if (!error && channelId > 0) {
      const stamp = new Date().toISOString();
      const value = { channel_id: channelId, company_name: matched?.company_name ?? channelName, resolved_at: stamp };
      const upserts = [{ key: mcqChannelSettingKey(propertyId), value, updated_at: stamp }];
      if (propertyId) upserts.push({ key: mcqChannelSettingKey(null), value, updated_at: stamp });
      await admin.from('ru_platform_settings').upsert(upserts, { onConflict: 'key' });
      return { channel_id: channelId, source: 'resolved_live' };
    }
  } catch (_e) { /* fall through to the error below */ }

  return {
    channel_id: null,
    source: 'unresolved',
    error: {
      code: 'MCQ_CHANNEL_UNRESOLVED',
      message: `No sales channel is resolved for the content quality check. Resolve the ${channelName} ChannelID for this property first.`,
    },
  };
}

/**
 * MCQ notifications carry the failing data points as free text. Split it into
 * individual prompts so owners get actionable items instead of one blob.
 */
export function parseMcqFailingPoints(resultText: string | null | undefined): string[] {
  const raw = String(resultText ?? '').trim();
  if (!raw) return [];
  return raw
    .split(/[;\n|]+|,(?=\s*[A-Z])/g)
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s.length > 1)
    .slice(0, 30);
}

/** Human-facing status for one listing's newest order. */
export type McqOutcome = 'passed' | 'failed' | 'pending' | 'blocked_upstream' | 'never_ordered';

export function classifyMcqOrder(row: {
  status?: string | null;
  ru_status_id?: string | null;
  response_preview?: string | null;
} | null | undefined): McqOutcome {
  if (!row) return 'never_ordered';
  const status = String(row.status ?? '').toLowerCase();
  if (status === 'passed') return 'passed';
  if (status === 'failed') {
    const raw = `${row.ru_status_id ?? ''} ${row.response_preview ?? ''}`;
    if (/subscribe to lnm/i.test(raw) || /\b17\b/.test(String(row.ru_status_id ?? '')) || /unexpected error/i.test(raw)) {
      return 'blocked_upstream';
    }
    return 'failed';
  }
  return 'pending';
}
