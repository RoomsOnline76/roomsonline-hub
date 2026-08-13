/**
 * Trading scope — the single rule for "does this property count?".
 *
 * A property row existing (or even being `is_active`) does not mean it trades.
 * Most of the estate is stale inventory: connected or contracted, but not yet
 * processing anything. Only rows a staff member has flagged `is_trading` count.
 *
 * The `is_sandbox` / test flag is deliberately NOT part of this rule: a property
 * under test behaves as a natural property everywhere (channel pushes, syncs,
 * counters included) — the flag exists only to find those properties.
 *
 * Use this for counts, KPIs, occupancy denominators, forecasts and narratives.
 * It is NOT a replacement for the `is_active: true` rule on property selectors —
 * that stays as-is; trading is an additional metric-only gate.
 */

export interface TradingScopeFields {
  is_trading?: boolean | null;
  is_sandbox?: boolean | null;
}

/** Columns any query must select for `isTradingProperty` to work. */
export const TRADING_SCOPE_COLUMNS = "is_trading, is_sandbox";


/** True when the property should be included in counts and metrics. */
export function isTradingProperty(p: TradingScopeFields | null | undefined): boolean {
  return Boolean(p?.is_trading);
}

/** Test/demo marker: purely a label for finding properties under development. */
export function isSandboxProperty(p: TradingScopeFields | null | undefined): boolean {
  return Boolean(p?.is_sandbox);
}

/** Filter helper for arrays of property-like rows. */
export function onlyTrading<T extends TradingScopeFields>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter(isTradingProperty);
}

/**
 * Apply the trading scope to a Supabase query builder on `properties`.
 * Kept loosely typed so it works with counts, selects and joined filters.
 */
export function applyTradingScope<T extends { eq: (column: string, value: unknown) => T }>(query: T): T {
  return query.eq("is_trading", true);
}

/** Same scope expressed for a joined/embedded property relation, e.g. `properties.is_trading`. */
export function applyTradingScopeOn<T extends { eq: (column: string, value: unknown) => T }>(
  query: T,
  relation: string,
): T {
  return query.eq(`${relation}.is_trading`, true);
}

/** Label for surfaces that show the stale-inventory counterpart. */
export const STALE_INVENTORY_LABEL = "not trading yet";
