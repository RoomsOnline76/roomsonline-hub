// Charge-driven Rentals United <AdditionalFees> collection.
//
// RU deprecated <CleaningPrice> (Notif 258) and wants every on-top-of-rate amount inside
// Push_PutProperty_RQ/Property/AdditionalFees — an inline collection on the property push
// itself (there is NO separate fees verb; Push_PutPropertyFees_RQ does not exist and RU
// answers "not implemented method"). The collection replaces the listing's whole fee set on
// every push, so we always send the complete active set — removals retract automatically.
// Deposits stay out: they ride the mandatory <SecurityDeposit> slot (see ruDeposits.ts).
//
// Wire vocabularies (RU PUPS spec, developer.rentalsunited.com):
//   DiscriminatorID: 1 FlatPerStay · 2 FixedPerDay · 3 IndependentPercentage (fraction of
//                    stay total, added at the end) · 5 FixedAmountPerPerson ·
//                    6 FixedAmountPerPersonPerDay
//   FeeTaxType:      41 Cleaning fee · 34 Resort fee · 33 Service fee · 18 Housekeeping fee ·
//                    29 Pet fee · 31 Parking fee · 0 unknown
//   Percentage values are fractions: 0.5% is sent as 0.005.

import { chargeAppliesToUnit, type RuChargeRow } from './ruDeposits.ts';

export interface RuFeeEntry {
  name: string;
  /** Flat amount in listing currency, or a fraction (0.005 = 0.5%) for percentage fees. */
  value: number;
  discriminator_id: number;
  fee_tax_type: number;
  optional: boolean;
  refundable: boolean;
  collect_time: 1 | 2;
}

const DEPOSIT_PATTERN = /deposit|breakage|damage/i;

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function feeTaxTypeFor(name: string): number {
  if (/clean/i.test(name)) return 41;
  if (/resort/i.test(name)) return 34;
  if (/housekeep/i.test(name)) return 18;
  if (/service/i.test(name)) return 33;
  if (/pet/i.test(name)) return 29;
  if (/park/i.test(name)) return 31;
  if (/touris/i.test(name)) return 36;
  return 0; // unknown — valid per the dictionary
}

/** Map one charge row to an RU additional-fee entry, or null when RU cannot express it. */
export function mapChargeToRuFee(charge: RuChargeRow): RuFeeEntry | null {
  const name = String(charge.name ?? '').trim();
  if (!name) return null;
  const category = String(charge.category ?? '').toLowerCase();
  if (category === 'deposit' || DEPOSIT_PATTERN.test(name)) return null; // SecurityDeposit slot
  const raw = num(charge.amount);
  if (raw <= 0) return null;

  const method = String(charge.calculation_method ?? '').toLowerCase();
  let discriminator = 1; // FlatPerStay
  let value = raw;
  if (method === 'percentage_of_accommodation' || method === 'percentage' || method === 'percent' || method === 'percentage_of_total') {
    discriminator = 3; // IndependentPercentage — fraction of stay total
    value = raw / 100;
  } else if (method === 'per_person_per_night' || method === 'per_guest_per_night') {
    discriminator = 6;
  } else if (method === 'per_person' || method === 'per_guest') {
    discriminator = 5;
  } else if (method === 'per_night' || method === 'per_room_per_night' || method === 'per_room') {
    discriminator = 2; // FixedPerDay
  }

  // Late/early check-in and check-out charges are only levied when the guest asks for them, so
  // they publish as OPTIONAL fees. RU's dictionary has no verified tax type for them, and we
  // never invent channel ids, so they ride FeeTaxType 0 (unknown, valid per the dictionary).
  const isOnRequest = /\b(late|early)\b.*check|check.*\b(late|early)\b/i.test(name);

  return {
    name,
    value,
    discriminator_id: discriminator,
    fee_tax_type: feeTaxTypeFor(name),
    optional: isOnRequest,
    refundable: charge.refundable === true,
    collect_time: 1,
  };
}


/**
 * The listing's full fee set from the Charges tab, plus a legacy cleaning fallback when the
 * property carries a cleaning amount with no matching charge row. Deduped by lowercase name.
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
      discriminator_id: 1,
      fee_tax_type: 41,
      optional: false,
      refundable: false,
      collect_time: 1,
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
 * Inline <AdditionalFees> block for Push_PutProperty_RQ — emitted immediately after
 * </Descriptions> and BEFORE the mandatory trailing <SecurityDeposit>. This exact shape and
 * position is proven by Status 0 pushes on the wire; moving it after SecurityDeposit is rejected
 * ("invalid child element 'AdditionalFee'"). An empty <AdditionalFees/> block
 * clears all fees, which is how a deleted charge is retracted. Returns '' when the caller did not
 * supply a fee set at all (undefined/null) so legacy callers keep the old payload shape.
 */
/**
 * The status 18 that looked like a fees-schema rejection was the channel refusing an UPDATE
 * against a listing id that had been archived/deleted (dead ids cannot be reused — see
 * mem://constraints/pms/no-reuse-of-dead-listing-ids). Inline fees are back on; the kill-switch
 * stays here only as the lever to pull if RU ever really does reject the collection shape.
 */
const RU_INLINE_FEES_DISABLED = false;


export function buildAdditionalFeesXml(fees: RuFeeEntry[] | null | undefined): string {
  if (!Array.isArray(fees)) return '';
  if (RU_INLINE_FEES_DISABLED) return '';
  // Never emit an empty <AdditionalFees/> — RU's request XSD rejects the empty element
  // ("invalid child element 'AdditionalFees'. List of possible elements expected:
  // 'SecurityDeposit'."), which surfaces as a misleading status 18. Omit the block instead.
  if (fees.length === 0) return '';
  const items = fees
    .map(
      (f, i) => `      <AdditionalFee Order="${i + 1}" DiscriminatorID="${f.discriminator_id}" KindID="2" Name="${escapeXml(f.name)}" Optional="${f.optional}" Refundable="${f.refundable}" FeeTaxType="${f.fee_tax_type}" CollectTime="${f.collect_time}">
        <Value>${f.value}</Value>
      </AdditionalFee>`,
    )
    .join('\n');
  return `\n    <AdditionalFees>\n${items}\n    </AdditionalFees>`;
}
