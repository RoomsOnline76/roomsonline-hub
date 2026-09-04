import { stayDiscounts, type DiscountStay, type StayDiscountResult } from "./stayDiscounts.ts";

/**
 * Load the property's packages and specials and price them against a stay.
 *
 * The arithmetic lives in `stayDiscounts.ts`; this is only the read. Both the
 * guest quote (`quote_stay`) and the modification reprice go through the same
 * pair, so a stay that moves dates keeps the discount it qualifies for instead
 * of being repriced gross.
 */
export async function loadStayDiscounts(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  propertyId: string,
  stay: DiscountStay,
  selectedSpecialId?: string | null,
): Promise<StayDiscountResult> {
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: propRow }, { data: specialRows }] = await Promise.all([
    supabase.from("properties").select("amenities").eq("id", propertyId).maybeSingle(),
    supabase
      .from("property_specials")
      .select("*")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .or(
        `and(valid_from.lte.${stay.checkOut},valid_to.gte.${stay.checkIn}),`
        + `and(book_from.lte.${today},book_until.gte.${today})`,
      ),
  ]);

  // deno-lint-ignore no-explicit-any
  const amenities: any = propRow?.amenities || {};
  return stayDiscounts(
    stay,
    Array.isArray(amenities?.packages) ? amenities.packages : [],
    // deno-lint-ignore no-explicit-any
    (specialRows || []) as any[],
    selectedSpecialId ?? null,
  );
}
