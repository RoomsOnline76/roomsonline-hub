// ============================================================================
// HUBSPOT PROJECTION (adapter boundary)
//
// ROL'OS owns inquiries, check-ins and feedback natively. This helper is the
// ONLY way server-side flows nudge the optional HubSpot add-on, and it is
// deliberately fire-and-forget: a portal that is off, unreachable or refusing
// a write must never affect the native record that was already saved.
// ============================================================================

// deno-lint-disable-next-line no-explicit-any
type Db = any;

/** Owner user ids that can receive a projection for a property. */
export async function resolveProjectionOwners(
  admin: Db,
  propertyId: string | null | undefined,
): Promise<string[]> {
  if (!propertyId) return [];
  const { data } = await admin
    .from("property_owners")
    .select("user_id")
    .eq("property_id", propertyId);
  const ids = (data || [])
    .map((r: { user_id: string | null }) => r.user_id)
    .filter((id: string | null): id is string => Boolean(id));
  return Array.from(new Set(ids));
}

/**
 * Project a native record onto HubSpot for every owner of `propertyId` that
 * has the add-on switched on. Returns how many portals accepted the write.
 */
export async function projectToHubspot(
  admin: Db,
  opts: {
    propertyId: string | null | undefined;
    action: "upsert_inquiry" | "enrich_contact" | "log_engagement" | "upsert_contact";
    payload: Record<string, unknown>;
  },
): Promise<{ attempted: number; pushed: number }> {
  const result = { attempted: 0, pushed: 0 };
  try {
    const owners = await resolveProjectionOwners(admin, opts.propertyId);
    if (!owners.length) return result;

    const { data: rows } = await admin
      .from("owner_integrations")
      .select("owner_id")
      .eq("service", "hubspot")
      .eq("enabled", true)
      .in("owner_id", owners);

    const targets = (rows || []).map((r: { owner_id: string }) => r.owner_id);
    if (!targets.length) return result;

    const url = `${Deno.env.get("SUPABASE_URL")}/functions/v1/hubspot-api`;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    for (const ownerId of targets) {
      result.attempted += 1;
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${serviceKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ action: opts.action, owner_id: ownerId, ...opts.payload }),
        });
        if (res.ok) {
          result.pushed += 1;
        } else {
          console.warn(
            `[hubspotProjection] ${opts.action} for ${ownerId} returned ${res.status}: ${(
              await res.text()
            ).slice(0, 300)}`,
          );
        }
      } catch (err) {
        console.warn(`[hubspotProjection] ${opts.action} for ${ownerId} threw:`, err);
      }
    }
  } catch (err) {
    console.warn("[hubspotProjection] resolution failed:", err);
  }
  return result;
}
