// Charge-driven Rentals United fees collection.
//
// RU deprecated <CleaningPrice> (Notif 258) and wants every on-top-of-rate amount in the
// listing's *fees collection*, pushed with Push_PutPropertyFees_RQ. That endpoint replaces
// the whole collection for the listing, so we always send the complete active set — which
// also makes removals work. Deposits stay out: they already ride in the mandatory
// <SecurityDeposit> slot on Push_PutProperty_RQ (see ruDeposits.ts).
//
// Wire vocabularies (RU PUPS):
//   ValueTypeID:  1 = Flat amount, 2 = Percent of the stay
//   ChargeTypeID: 1 = Per night, 2 = Per person per night, 3 = Per stay, 4 = Per person per stay

import { chargeAppliesToUnit, type RuChargeRow } from './ruDeposits.ts';

export interface RuFeeEntry {
  name: string;
  value: number;
  value_type_id: 1 | 2;
  charge_type_id: 1 | 2 | 3 | 4;
  included_in_price: boolean;
  is_mandatory: boolean;
}

const DEPOSIT_PATTERN = /deposit|breakage|damage/i;

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Map one charge row to an RU fee entry, or null when RU cannot express it. */
export function mapChargeToRuFee(charge: RuChargeRow): RuFeeEntry | null {
  const name = String(charge.name ?? '').trim();
  if (!name) return null;
  const category = String(charge.category ?? '').toLowerCase();
  if (category === 'deposit' || DEPOSIT_PATTERN.test(name)) return null; // SecurityDeposit slot
  const value = num(charge.amount);
  if (value <= 0) return null;

  const method = String(charge.calculation_method ?? '').toLowerCase();
  let valueType: 1 | 2 = 1;
  let chargeType: 1 | 2 | 3 | 4 = 3;
  if (method === 'percentage_of_accommodation' || method === 'percentage' || method === 'percent' || method === 'percentage_of_total') {
    valueType = 2;
    chargeType = 3;
  } else if (method === 'per_person_per_night' || method === 'per_guest_per_night') {
    chargeType = 2;
  } else if (method === 'per_person' || method === 'per_guest') {
    chargeType = 4;
  } else if (method === 'per_night' || method === 'per_room_per_night' || method === 'per_room') {
    chargeType = 1;
  }

  return {
    name,
    value,
    value_type_id: valueType,
    charge_type_id: chargeType,
    included_in_price: charge.is_included_in_rate === true,
    is_mandatory: true,
  };
}

/**
 * The listing's full fee set from the Charges tab, plus a legacy cleaning fallback when the
 * property carries a cleaning amount with no matching charge row. Deduped by lowercase name —
 * the fees collection is name-keyed on RU's side.
 */
export function buildRuFeeEntries(
  charges: RuChargeRow[] | null | undefined,
  unitId?: string | null,
  legacyCleaningAmount?: number | null,
): RuFeeEntry[] {
  const out: RuFeeEntry[] = [];
  const seen = new Set<string>();
  for (const charge of charges ?? []) {
    if (charge.is_active === false) continue;
    if (!chargeAppliesToUnit(charge, unitId)) continue;
    const fee = mapChargeToRuFee(charge);
    if (!fee) continue;
    const key = fee.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(fee);
  }
  const legacy = num(legacyCleaningAmount);
  if (legacy > 0 && !out.some((f) => /clean|housekeep/i.test(f.name))) {
    out.push({
      name: 'Cleaning fee',
      value: legacy,
      value_type_id: 1,
      charge_type_id: 3,
      included_in_price: false,
      is_mandatory: true,
    });
  }
  return out;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Push_PutPropertyFees_RQ — replaces the listing's entire fee collection.
 * An empty <Fees/> block clears all fees, which is how a deleted charge is retracted.
 */
export function buildPushPropertyFeesXml(authXml: string, ruPropertyId: number, fees: RuFeeEntry[]): string {
  const feesXml = fees
    .map(
      (f) => `    <Fee>
      <Name>${escapeXml(f.name)}</Name>
      <Value>${f.value}</Value>
      <ValueTypeID>${f.value_type_id}</ValueTypeID>
      <ChargeTypeID>${f.charge_type_id}</ChargeTypeID>
      <IncludedInPrice>${f.included_in_price}</IncludedInPrice>
      <IsMandatory>${f.is_mandatory}</IsMandatory>
    </Fee>`,
    )
    .join('\n');
  return `<Push_PutPropertyFees_RQ>
  ${authXml}
  <PropertyID>${ruPropertyId}</PropertyID>
  <Fees>
${feesXml}
  </Fees>
</Push_PutPropertyFees_RQ>`;
}
