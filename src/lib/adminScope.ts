/**
 * Scoped admin — an admin account deliberately confined to a few properties.
 *
 * Presence of rows in `scoped_admin_properties` makes an admin "scoped": the
 * database narrows every property-linked read/write to those properties, and
 * this module narrows the app shell (menus, routes, queries) to match so the
 * UI never shows counters or pickers the account cannot actually read.
 *
 * Absence of rows = a normal, unrestricted admin. Nothing changes for them.
 */

/** Nav item ids a scoped admin may see (see `src/config/navigation.ts`). */
export const SCOPED_ADMIN_NAV_ITEM_IDS = new Set<string>([
  "admin-dashboard",
  "all-bookings",
  "onboarding",
  "channel-monitor",
  "properties",
  "property-pulse",
]);

/** Nav sections a scoped admin may see. */
export const SCOPED_ADMIN_NAV_SECTION_IDS = new Set<string>([
  "administration",
  "insights",
  "workspace",
]);

/**
 * Route prefixes reachable by a scoped admin. Anything else inside the admin
 * shell bounces back to the admin dashboard.
 */
const SCOPED_ADMIN_ROUTE_PREFIXES = [
  "/admin/dashboard",
  "/admin/bookings",
  "/admin/all-bookings",
  "/admin/onboarding",
  "/admin/channel-monitor",
  "/admin/property-overview",
  "/admin/properties/",
  "/pms",
  "/dashboard/reports",
  "/auth",
];

/** Landing page for a scoped admin that lands somewhere it may not go. */
export const SCOPED_ADMIN_HOME = "/admin/dashboard";

export function isRouteAllowedForScopedAdmin(pathname: string): boolean {
  return SCOPED_ADMIN_ROUTE_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix),
  );
}

/**
 * Narrow a Supabase query to the scoped property ids. No-op for unrestricted
 * admins (empty id list), so callers can apply it unconditionally.
 */
export function applyAdminScope<T>(query: T, column: string, scopedPropertyIds: string[]): T {
  if (!scopedPropertyIds.length) return query;
  // Cast through a minimal shape: keeping the builder generic here makes
  // TypeScript re-instantiate Supabase's deep query types at every call site.
  const filterable = query as unknown as {
    in: (column: string, values: readonly string[]) => unknown;
  };
  return filterable.in(column, scopedPropertyIds) as T;
}

/** Filter an already-fetched list of property-like rows to the scope. */
export function filterToAdminScope<T extends { id?: string | null; property_id?: string | null }>(
  rows: T[] | null | undefined,
  scopedPropertyIds: string[],
  key: "id" | "property_id" = "id",
): T[] {
  const list = rows || [];
  if (!scopedPropertyIds.length) return list;
  return list.filter((r) => {
    const value = r?.[key];
    return typeof value === "string" && scopedPropertyIds.includes(value);
  });
}
