/**
 * Trading scope for edge functions — mirror of `src/lib/propertyScope.ts`.
 * Only properties a staff member flagged as trading may feed counts, metrics or
 * AI narratives. The test/sandbox flag is a label only and never excludes a row.
 */

export interface TradingScopeFields {
  is_trading?: boolean | null;
  is_sandbox?: boolean | null;
}

export const TRADING_SCOPE_COLUMNS = "is_trading, is_sandbox";

export function isTradingProperty(p: TradingScopeFields | null | undefined): boolean {
  return Boolean(p?.is_trading);
}

export function onlyTrading<T extends TradingScopeFields>(rows: T[] | null | undefined): T[] {
  return (rows || []).filter(isTradingProperty);
}

export function applyTradingScope<T extends { eq: (column: string, value: unknown) => T }>(query: T): T {
  return query.eq("is_trading", true);
}
