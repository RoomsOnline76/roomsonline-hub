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

/** Rentals United IT tester — always Seesig + Tidal, regardless of seed user id. */
export const IT_TEST_ADMIN_EMAIL = "ru-admin@roomsonline.co.za";

/** Canonical Seesig + Tidal listing ids used by the IT tester pin. */
export const IT_TEST_PROPERTY_IDS = [
  "76f524f3-8229-4097-b45d-18489f897195", // Seesig
  "af57b357-9c95-47f5-b7d5-43d3b2f05bb7", // Tidal
] as const;

export function normalizeAdminEmail(email?: string | null): string {
  return (email ?? "").trim().toLowerCase();
}

export function isItTestAdminEmail(email?: string | null): boolean {
  return normalizeAdminEmail(email) === IT_TEST_ADMIN_EMAIL;
}

export function isItTestProperty(row: { id?: string | null; name?: string | null }): boolean {
  if (row.id && (IT_TEST_PROPERTY_IDS as readonly string[]).includes(row.id)) return true;
  const name = (row.name ?? "").toLowerCase();
  return name.includes("seesig") || name.includes("tidal");
}

export function filterToItTestProperties<T extends { id?: string | null; name?: string | null }>(
  rows: T[] | null | undefined,
): T[] {
  return (rows ?? []).filter(isItTestProperty);
}

/**
 * Scope ids for an admin. The IT tester is always pinned to Seesig + Tidal even
 * if `scoped_admin_properties` is empty or the auth user id drifted from the seed.
 */
export function resolveScopedPropertyIds(
  email: string | null | undefined,
  dbScopeIds: string[] | undefined,
): string[] {
  if (isItTestAdminEmail(email)) {
    const fromDb = (dbScopeIds ?? []).filter((id) =>
      (IT_TEST_PROPERTY_IDS as readonly string[]).includes(id),
    );
    return fromDb.length > 0 ? fromDb : [...IT_TEST_PROPERTY_IDS];
  }
  return dbScopeIds ?? [];
}

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
  "pms",
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
