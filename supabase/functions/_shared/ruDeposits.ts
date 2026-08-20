// Charge-driven Rentals United deposit / cleaning resolution.
//
// The Charges tab (`property_charges`) is the single source of truth for what a guest is
// asked to pay on top of the rate. RU exposes exactly two of those slots on a listing:
// `SecurityDeposit` and `CleaningPrice`. Deriving them from legacy `banking.*` /
// `hostfully_room_types.security_deposit` columns made RU show a deposit the property no
// longer charges (Elf), so those columns are no longer trusted: no matching active charge
// means the listing carries 0.

export interface RuChargeRow {
  id?: string | null;
  name?: string | null;
  category?: string | null;
  calculation_method?: string | null;
  amount?: number | string | null;
  is_active?: boolean | null;
  applies_to_all_rooms?: boolean | null;
  room_type_ids?: string[] | null;
  is_included_in_rate?: boolean | null;
}

/** Charge categories RU understands as a refundable security / breakage deposit. */
const DEPOSIT_CATEGORIES = ['deposit', 'security_deposit', 'security', 'breakage'];
/** Charge categories RU understands as the cleaning fee. */
const CLEANING_HINTS = ['clean', 'housekeep'];

/** RU can only express a flat deposit / cleaning amount, not a percentage of the stay. */
const FLAT_METHODS = ['flat_per_stay', 'flat', 'per_booking', 'flat_per_booking', 'one_time'];

function num(value: unknown): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function isFlat(charge: RuChargeRow): boolean {
  const method = String(charge.calculation_method || '').toLowerCase();
  return FLAT_METHODS.includes(method);
}

/** Charges are property-wide unless they name the units they apply to. */
export function chargeAppliesToUnit(charge: RuChargeRow, unitId?: string | null): boolean {
  if (charge.applies_to_all_rooms !== false) return true;
  const ids = charge.room_type_ids || [];
  if (ids.length === 0) return true;
  return unitId ? ids.includes(unitId) : false;
}

function activeCharges(charges: RuChargeRow[] | null | undefined, unitId?: string | null): RuChargeRow[] {
  return (charges || []).filter(
    (c) => c.is_active !== false && !c.is_included_in_rate && chargeAppliesToUnit(c, unitId),
  );
}

function matchesDeposit(charge: RuChargeRow): boolean {
  const category = String(charge.category || '').toLowerCase();
  if (DEPOSIT_CATEGORIES.includes(category)) return true;
  const name = String(charge.name || '').toLowerCase();
  return /deposit|breakage|damage/.test(name);
}

function matchesCleaning(charge: RuChargeRow): boolean {
  const category = String(charge.category || '').toLowerCase();
  const name = String(charge.name || '').toLowerCase();
  if (category === 'cleaning') return true;
  return CLEANING_HINTS.some((hint) => name.includes(hint));
}

/**
 * The listing's `SecurityDeposit`: the total of the active flat deposit charges that apply to
 * this unit. Returns 0 when the property charges no deposit, so RU never advertises one.
 */
export function resolveRuSecurityDeposit(
  charges: RuChargeRow[] | null | undefined,
  unitId?: string | null,
): number {
  return activeCharges(charges, unitId)
    .filter((c) => matchesDeposit(c) && isFlat(c))
    .reduce((sum, c) => sum + num(c.amount), 0);
}

/** The listing's `CleaningPrice` from charges, or null when no cleaning charge exists. */
export function resolveRuCleaningFee(
  charges: RuChargeRow[] | null | undefined,
  unitId?: string | null,
): number | null {
  const matched = activeCharges(charges, unitId).filter((c) => matchesCleaning(c) && isFlat(c));
  if (matched.length === 0) return null;
  return matched.reduce((sum, c) => sum + num(c.amount), 0);
}

/** Columns the RU deposit / cleaning mapping and its fingerprint depend on. */
export const RU_CHARGE_COLUMNS = [
  'id',
  'name',
  'category',
  'calculation_method',
  'amount',
  'currency',
  'is_active',
  'is_included_in_rate',
  'applies_to_all_rooms',
  'room_type_ids',
] as const;
