import { supabase } from "@/integrations/supabase/client";

/** Case-folded, whitespace-collapsed name — mirrors rolos_guest_profiles.normalised_name. */
export function normaliseGuestName(name: string | null | undefined): string {
  return String(name ?? "").trim().replace(/\s+/g, " ").toLowerCase();
}

export function displayGuestName(name: string | null | undefined): string {
  return String(name ?? "").trim().replace(/\s+/g, " ");
}

/**
 * Recomputes stays / spend / last stay for the given guest profiles from their bookings.
 * Stats are a read model: a failure here never fails the caller's write.
 */
export async function rebuildGuestStats(guestIds: (string | null | undefined)[]): Promise<void> {
  const ids = [...new Set(guestIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return;
  try {
    // deno-lint-ignore no-explicit-any
    const { error } = await (supabase as any).rpc("rebuild_guest_stats", { _guest_ids: ids });
    if (error) console.warn("rebuild_guest_stats failed", error);
  } catch (e) {
    console.warn("rebuild_guest_stats threw", e);
  }
}

/**
 * Finds (or creates) the guest profile for a booking on a property: email first,
 * then normalised name. Totals are left to `rebuildGuestStats`.
 */
export async function ensureGuestProfile(opts: {
  propertyId: string;
  fullName: string;
  email?: string | null;
  phone?: string | null;
  /** Country of origin (ISO alpha-2 or name) — stored so the next booking pre-fills. */
  nationality?: string | null;
}): Promise<string | null> {

  const email = (opts.email ?? "").trim().toLowerCase();
  const norm = normaliseGuestName(opts.fullName);
  if (!email && !norm) return null;
  try {
    let existingId: string | null = null;
    if (email) {
      const { data } = await supabase
        .from("rolos_guest_profiles")
        .select("id")
        .eq("property_id", opts.propertyId)
        .ilike("email", email)
        .maybeSingle();
      existingId = data?.id ?? null;
    }
    if (!existingId && norm) {
      // Generated column is not in the generated types yet — untyped client for this filter.
      const { data } = await (supabase as unknown as {
        from: (t: string) => {
          select: (c: string) => {
            eq: (c: string, v: unknown) => { eq: (c: string, v: unknown) => { maybeSingle: () => Promise<{ data: { id: string } | null }> } };
          };
        };
      })
        .from("rolos_guest_profiles")
        .select("id")
        .eq("property_id", opts.propertyId)
        .eq("normalised_name", norm)
        .maybeSingle();
      existingId = data?.id ?? null;
    }

    if (existingId) {
      await supabase
        .from("rolos_guest_profiles")
        .update({
          full_name: displayGuestName(opts.fullName),
          ...(opts.phone ? { phone: opts.phone } : {}),
          ...(email ? { email: opts.email } : {}),
          ...(opts.nationality ? { nationality: opts.nationality } : {}),
        })
        .eq("id", existingId);
      return existingId;
    }

    const { data: created } = await supabase
      .from("rolos_guest_profiles")
      .upsert(
        {
          property_id: opts.propertyId,
          full_name: displayGuestName(opts.fullName),
          email: opts.email || null,
          phone: opts.phone || null,
          nationality: opts.nationality || null,
        },
        { onConflict: "property_id,normalised_name" },
      )

      .select("id")
      .single();
    return created?.id ?? null;
  } catch (e) {
    console.warn("ensureGuestProfile failed", e);
    return null;
  }
}
