// Types for charge calculations
export type ChargeCategory = 'tax' | 'fee' | 'deposit' | 'surcharge' | 'custom';

export type ChargeCalculationMethod = 
  | 'flat_per_stay'
  | 'per_night'
  | 'per_room_per_night'
  | 'per_person'
  | 'per_person_per_night'
  | 'percentage_of_accommodation';

export interface PropertyCharge {
  id: string;
  property_id: string;
  name: string;
  internal_code: string | null;
  category: ChargeCategory;
  calculation_method: ChargeCalculationMethod;
  amount: number;
  currency: string;
  percentage_apply_to?: string | null;
  min_cap?: number | null;
  max_cap?: number | null;
  applies_to_all_rooms: boolean;
  room_type_ids: string[];
  rate_type_ids: string[];
  room_charge_overrides?: Record<string, number> | null;
  min_nights: number;
  max_nights: number;
  applies_to_adults: boolean;
  applies_to_children: boolean;
  applies_to_infants: boolean;
  is_refundable: boolean;
  refund_timing?: 'on_checkout' | 'after_inspection' | 'manual' | null;
  refund_type?: 'full' | 'partial' | null;
  partial_refund_percentage?: number | null;
  description?: string | null;
  display_order: number;
  is_active: boolean;
  pms_external_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ChargePreset {
  id: string;
  name: string;
  category: ChargeCategory;
  default_calculation_method: ChargeCalculationMethod | null;
  default_description: string | null;
  is_common: boolean;
  display_order: number;
}

export interface ChargeCalculationContext {
  subtotal: number;
  nights: number;
  rooms: number;
  adults: number;
  children: number;
  infants: number;
  roomTypeId?: string;
  roomTypeAliases?: string[];
  rateTypeId?: string;
}

export interface CalculatedCharge {
  charge: PropertyCharge;
  calculatedAmount: number;
  breakdown: string;
}

export interface GroupedCharges {
  taxes: CalculatedCharge[];
  fees: CalculatedCharge[];
  deposits: CalculatedCharge[];
  surcharges: CalculatedCharge[];
  custom: CalculatedCharge[];
}

export interface ChargeTotals {
  total: number;
  refundableTotal: number;
  nonRefundableTotal: number;
}

function isChargeApplicable(
  charge: PropertyCharge,
  context: ChargeCalculationContext
): boolean {
  // Must be active
  if (!charge.is_active) return false;

  // Check room type applicability (supports aliases like external PMS ID + internal DB ID)
  if (!charge.applies_to_all_rooms && charge.room_type_ids.length > 0) {
    const applicableRoomIds = new Set<string>([
      ...(context.roomTypeId ? [context.roomTypeId] : []),
      ...(context.roomTypeAliases || []),
    ]);

    // If no room context is provided, keep backward-compatible behavior and don't exclude
    if (applicableRoomIds.size > 0) {
      const matchesRoom = charge.room_type_ids.some((id) => applicableRoomIds.has(id));
      if (!matchesRoom) return false;
    }
  }

  // Check rate type applicability
  if (charge.rate_type_ids.length > 0) {
    if (context.rateTypeId && !charge.rate_type_ids.includes(context.rateTypeId)) {
      return false;
    }
  }

  // Check night range
  if (charge.min_nights > 0 && context.nights < charge.min_nights) {
    return false;
  }
  if (charge.max_nights > 0 && context.nights > charge.max_nights) {
    return false;
  }

  return true;
}

/**
 * Calculate the amount for a single charge based on its method
 */
function calculateChargeAmount(
  charge: PropertyCharge,
  context: ChargeCalculationContext
): { amount: number; breakdown: string } {
  let amount = 0;
  let breakdown = '';

  // Use room-specific override if available (supports room ID aliases)
  const overrideKey = [context.roomTypeId, ...(context.roomTypeAliases || [])]
    .find((id): id is string => !!id && charge.room_charge_overrides?.[id] != null);

  const baseAmount = overrideKey
    ? charge.room_charge_overrides![overrideKey]
    : charge.amount;

  // Count applicable persons based on charge settings
  let personCount = 0;
  if (charge.applies_to_adults) personCount += context.adults;
  if (charge.applies_to_children) personCount += context.children;
  if (charge.applies_to_infants) personCount += context.infants;

  switch (charge.calculation_method) {
    case 'flat_per_stay':
      amount = baseAmount;
      breakdown = `${charge.name}: flat fee`;
      break;

    case 'per_night':
      amount = baseAmount * context.nights;
      breakdown = `${charge.name}: ${formatCurrency(baseAmount, charge.currency)} × ${context.nights} nights`;
      break;

    case 'per_room_per_night':
      amount = baseAmount * context.rooms * context.nights;
      breakdown = `${charge.name}: ${formatCurrency(baseAmount, charge.currency)} × ${context.rooms} rooms × ${context.nights} nights`;
      break;

    case 'per_person':
      amount = baseAmount * personCount;
      breakdown = `${charge.name}: ${formatCurrency(baseAmount, charge.currency)} × ${personCount} guests`;
      break;

    case 'per_person_per_night':
      amount = baseAmount * personCount * context.nights;
      breakdown = `${charge.name}: ${formatCurrency(baseAmount, charge.currency)} × ${personCount} guests × ${context.nights} nights`;
      break;

    case 'percentage_of_accommodation':
      amount = context.subtotal * (baseAmount / 100);
      
      // Apply min/max caps
      if (charge.min_cap && amount < charge.min_cap) {
        amount = charge.min_cap;
        breakdown = `${charge.name}: ${baseAmount}% (min ${formatCurrency(charge.min_cap, charge.currency)})`;
      } else if (charge.max_cap && amount > charge.max_cap) {
        amount = charge.max_cap;
        breakdown = `${charge.name}: ${baseAmount}% (max ${formatCurrency(charge.max_cap, charge.currency)})`;
      } else {
        breakdown = `${charge.name}: ${baseAmount}% of ${formatCurrency(context.subtotal, charge.currency)}`;
      }
      break;
  }

  return { amount: Math.round(amount * 100) / 100, breakdown };
}

/**
 * Format currency for display in breakdown strings
 */
function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Calculate all applicable charges for a booking
 */
export function calculateCharges(
  charges: PropertyCharge[],
  context: ChargeCalculationContext
): CalculatedCharge[] {
  const applicableCharges = charges
    .filter(charge => isChargeApplicable(charge, context))
    .sort((a, b) => {
      const categoryOrder: Record<ChargeCategory, number> = {
        tax: 1,
        fee: 2,
        deposit: 3,
        surcharge: 4,
        custom: 5,
      };
      const catDiff = categoryOrder[a.category] - categoryOrder[b.category];
      if (catDiff !== 0) return catDiff;
      return a.display_order - b.display_order;
    });

  // Dedup: when multiple charges share the same name (case-insensitive),
  // prefer room-specific over applies_to_all_rooms to prevent double-charging
  const deduped: PropertyCharge[] = [];
  const seenNames = new Map<string, PropertyCharge>();
  for (const charge of applicableCharges) {
    const key = charge.name.toLowerCase().trim();
    const existing = seenNames.get(key);
    if (!existing) {
      seenNames.set(key, charge);
      deduped.push(charge);
    } else {
      // If existing is global and new is room-specific, replace
      if (existing.applies_to_all_rooms && !charge.applies_to_all_rooms) {
        const idx = deduped.indexOf(existing);
        if (idx !== -1) deduped[idx] = charge;
        seenNames.set(key, charge);
      }
      // Otherwise skip the duplicate (keep first or room-specific)
    }
  }

  return deduped.map(charge => {
    const { amount, breakdown } = calculateChargeAmount(charge, context);
    return {
      charge,
      calculatedAmount: amount,
      breakdown,
    };
  });
}

/**
 * Group calculated charges by category for display
 */
export function groupChargesByCategory(charges: CalculatedCharge[]): GroupedCharges {
  return {
    taxes: charges.filter(c => c.charge.category === 'tax'),
    fees: charges.filter(c => c.charge.category === 'fee'),
    deposits: charges.filter(c => c.charge.category === 'deposit'),
    surcharges: charges.filter(c => c.charge.category === 'surcharge'),
    custom: charges.filter(c => c.charge.category === 'custom'),
  };
}

/**
 * Calculate totals from calculated charges
 */
export function getChargeTotals(charges: CalculatedCharge[]): ChargeTotals {
  const total = charges.reduce((sum, c) => sum + c.calculatedAmount, 0);
  const refundableTotal = charges
    .filter(c => c.charge.is_refundable)
    .reduce((sum, c) => sum + c.calculatedAmount, 0);
  
  return {
    total: Math.round(total * 100) / 100,
    refundableTotal: Math.round(refundableTotal * 100) / 100,
    nonRefundableTotal: Math.round((total - refundableTotal) * 100) / 100,
  };
}

/**
 * Get human-readable label for calculation method
 */
export function getCalculationMethodLabel(method: ChargeCalculationMethod): string {
  const labels: Record<ChargeCalculationMethod, string> = {
    flat_per_stay: 'Flat (per stay)',
    per_night: 'Per night',
    per_room_per_night: 'Per room per night',
    per_person: 'Per person',
    per_person_per_night: 'Per person per night',
    percentage_of_accommodation: 'Percentage of accommodation',
  };
  return labels[method] || method;
}

/**
 * Get human-readable label for category
 */
export function getCategoryLabel(category: ChargeCategory): string {
  const labels: Record<ChargeCategory, string> = {
    tax: 'Tax',
    fee: 'Fee',
    deposit: 'Deposit',
    surcharge: 'Surcharge',
    custom: 'Custom',
  };
  return labels[category] || category;
}
