// Guest identity + history rollup helpers.
// One place decides how a guest name is normalised and how stay totals are rebuilt,
// so the importer, the manual booking path and the PMS API all resolve the same person.

/** Case-folded, whitespace-collapsed name — mirrors rolos_guest_profiles.normalised_name. */
export function normaliseGuestName(name: string | null | undefined): string {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function normaliseEmail(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/**
 * Recomputes total_stays / total_spent / last_stay_date from the guest's bookings.
 * Pass no ids to rebuild every profile (backfill). Never throws — stats are a
 * read model and must not fail the write that triggered them.
 */
export async function rebuildGuestStats(
  supabase: { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }> },
  guestIds?: (string | null | undefined)[] | null,
): Promise<number> {
  const ids = guestIds ? [...new Set(guestIds.filter((id): id is string => !!id))] : null;
  if (ids && ids.length === 0) return 0;
  try {
    const { data, error } = await supabase.rpc("rebuild_guest_stats", { _guest_ids: ids });
    if (error) {
      console.error("rebuildGuestStats failed", error);
      return 0;
    }
    return Number(data) || 0;
  } catch (e) {
    console.error("rebuildGuestStats threw", e);
    return 0;
  }
}

export interface GuestProfileRow {
  id: string;
  full_name: string;
  email?: string | null;
  property_id?: string;
}

/**
 * Resolves guest names to profile ids across a set of properties (a portfolio),
 * creating what is missing. Matching is on the normalised name, so casing and
 * stray spacing in a spreadsheet never mint a second profile.
 */
export async function resolveGuestProfiles(
  supabase: any,
  opts: { propertyId: string; scopeIds?: string[]; names: string[]; batch?: number },
): Promise<Map<string, string>> {
  const byName = new Map<string, string>();
  const scope = [...new Set([opts.propertyId, ...(opts.scopeIds ?? [])])];
  const wanted = [...new Set(opts.names.map(normaliseGuestName).filter(Boolean))];
  if (wanted.length === 0) return byName;
  const batch = opts.batch ?? 200;

  for (let i = 0; i < wanted.length; i += batch) {
    const chunk = wanted.slice(i, i + batch);
    const { data } = await supabase
      .from("rolos_guest_profiles")
      .select("id, full_name, normalised_name, property_id")
      .in("property_id", scope)
      .in("normalised_name", chunk);
    for (const p of data ?? []) {
      const key = String(p.normalised_name ?? normaliseGuestName(p.full_name));
      // Prefer a profile that already lives on the importing property.
      if (!byName.has(key) || p.property_id === opts.propertyId) byName.set(key, p.id as string);
    }
  }

  // Create the ones we still do not know, keyed by the original display casing.
  const displayByKey = new Map<string, string>();
  for (const raw of opts.names) {
    const key = normaliseGuestName(raw);
    if (key && !displayByKey.has(key)) displayByKey.set(key, String(raw).trim().replace(/\s+/g, " "));
  }
  const missing = wanted.filter((k) => !byName.has(k));
  for (let i = 0; i < missing.length; i += batch) {
    const chunk = missing.slice(i, i + batch);
    const { data, error } = await supabase
      .from("rolos_guest_profiles")
      .upsert(
        chunk.map((key) => ({ property_id: opts.propertyId, full_name: displayByKey.get(key) ?? key })),
        { onConflict: "property_id,normalised_name", ignoreDuplicates: false },
      )
      .select("id, full_name, normalised_name");
    if (error) {
      console.error("resolveGuestProfiles insert failed", error);
      break; // profiles are a nice-to-have; never block the booking write
    }
    for (const p of data ?? []) {
      byName.set(String(p.normalised_name ?? normaliseGuestName(p.full_name)), p.id as string);
    }
  }

  return byName;
}
