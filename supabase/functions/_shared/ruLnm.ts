/**
 * Rentals United Live Notification Mechanism (LNM) — shared contract.
 *
 * Two distinct webhook systems exist in RU:
 *  - RLNM (`LNM_PutHandlerUrl_RQ`) — reservation notifications, aimed at property
 *    managers. Handled by `ru-reservation-handler` (locked adapter region).
 *  - LNM  (`Push_PutLiveNotificationMechanismSubscriptions_RQ`) — content / ARI
 *    change notifications, aimed at sales channels. Handled by `ru-lnm-handler`.
 *
 * LNM notifications are HTTP GET calls carrying only identifiers (never values),
 * must be answered with HTTP 200 in under 3 seconds, and are delivered
 * "at-least-once" (retries at ~2, ~8 and ~18 minutes on failure).
 */

export interface RuLnmChangeType {
  id: string;
  label: string;
  description: string;
}

/** Change types RU publishes (Pull_ListLiveNotificationMechanismChangeTypes_RQ). */
export const RU_LNM_CHANGE_TYPES: RuLnmChangeType[] = [
  {
    id: 'PropertyStaticDetails',
    label: 'Property content',
    description: 'Static property details changed — re-pull Pull_ListSpecProp_RQ.',
  },
  {
    id: 'PropertyChangeover',
    label: 'Changeover',
    description: 'Arrival/departure changeover rules changed for a date range.',
  },
  {
    id: 'PropertyMinStay',
    label: 'Minimum stay',
    description: 'Minimum stay changed for a date range.',
  },
  {
    id: 'PropertyAvailability',
    label: 'Availability',
    description: 'Availability changed for a date range — re-pull the calendar.',
  },
  {
    id: 'PropertyPrice',
    label: 'Prices',
    description: 'Prices changed for a date range — re-pull property prices.',
  },
  {
    id: 'PropertyMCQEligibilityCheck',
    label: 'MCQ result',
    description: 'Minimum Content Quality check completed (paired with CM_LNM_OrderMinimumContentQualityCheck_RQ).',
  },
];

/** Everything RU offers: we consume all of it so no change is missed. */
export const DEFAULT_LNM_CHANGE_TYPES: string[] = RU_LNM_CHANGE_TYPES.map((t) => t.id);

export const KNOWN_LNM_CHANGE_TYPE_IDS = new Set(DEFAULT_LNM_CHANGE_TYPES);

export interface RuLnmSubscriptionState {
  change_types: string[];
  observed_owners: string[];
  url_base: string | null;
}

function tagValues(xml: string, container: string, item: string): string[] {
  const block = new RegExp(`<${container}>([\\s\\S]*?)</${container}>`, 'i').exec(xml);
  if (!block) return [];
  const out: string[] = [];
  const re = new RegExp(`<${item}[^>]*>([\\s\\S]*?)</${item}>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(block[1])) !== null) {
    const v = m[1].trim();
    if (v) out.push(v);
  }
  return out;
}

/** Parse Pull_ListLiveNotificationMechanismSubscriptions_RS into a comparable state. */
export function parseLnmSubscriptions(xml: string): RuLnmSubscriptionState {
  const urlBase = /<UrlBase>([\s\S]*?)<\/UrlBase>/i.exec(xml)?.[1]?.trim() ?? null;
  return {
    change_types: tagValues(xml, 'ChangeTypes', 'Type'),
    observed_owners: tagValues(xml, 'ObservedOwners', 'Owner'),
    url_base: urlBase && urlBase.length > 0 ? urlBase : null,
  };
}

/** Parse Pull_ListLiveNotificationMechanismChangeTypes_RS IDs. */
export function parseLnmChangeTypes(xml: string): string[] {
  const out: string[] = [];
  const re = /<ChangeType[^>]*ID="([^"]+)"/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1]);
  return out;
}

/**
 * Drift between what we intend to be subscribed to and what RU actually holds.
 * A silent drift is the failure mode that matters: RU simply stops notifying.
 *
 * `extra_owners` are owners RU still observes that we no longer intend to (a stale
 * bind). They are informational only — they cost nothing and must not fail a step.
 */
export function diffLnmSubscriptions(
  actual: RuLnmSubscriptionState,
  desired: { change_types: string[]; observed_owners: string[]; url_base: string },
): {
  in_sync: boolean;
  missing_change_types: string[];
  missing_owners: string[];
  extra_owners: string[];
  url_matches: boolean;
} {
  const actualTypes = new Set(actual.change_types.map((t) => t.toLowerCase()));
  const actualOwners = new Set(actual.observed_owners.map((o) => String(o).trim()));
  const desiredOwners = desired.observed_owners.map((o) => String(o).trim()).filter(Boolean);
  const desiredOwnerSet = new Set(desiredOwners);
  const missing_change_types = desired.change_types.filter((t) => !actualTypes.has(t.toLowerCase()));
  const missing_owners = desiredOwners.filter((o) => !actualOwners.has(o));
  const extra_owners = [...actualOwners].filter((o) => o && !desiredOwnerSet.has(o));
  const url_matches =
    !!actual.url_base && actual.url_base.replace(/\/+$/, '') === desired.url_base.replace(/\/+$/, '');
  return {
    in_sync: missing_change_types.length === 0 && missing_owners.length === 0 && url_matches,
    missing_change_types,
    missing_owners,
    extra_owners,
    url_matches,
  };
}

