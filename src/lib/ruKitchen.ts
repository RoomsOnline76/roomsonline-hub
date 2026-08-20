/**
 * Kitchen coherence between the amenity catalogue and the "Separate kitchen" flag.
 *
 * The channel dictionary entry 101 ("Kitchen") is what OTAs render as
 * "Separate kitchen". ROLOS used to hold two independent switches for the same
 * fact — the amenity checkbox in the picker and the composition toggle — so a
 * listing could publish "Separate kitchen" while ROLOS showed it as off.
 * These helpers keep the two in lockstep: one fact, one meaning.
 */

import { isRuToken, ruToken, ruTokenId } from "@/lib/ruAmenities";

/** Channel dictionary id rendered as "Separate kitchen" on OTA listings. */
export const RU_SEPARATE_KITCHEN_ID = 101;

/** True when the stored amenity list declares the separate kitchen. */
export function hasSeparateKitchen(values: string[] | null | undefined): boolean {
  return (values || []).some(
    (v) => isRuToken(v) && ruTokenId(v) === RU_SEPARATE_KITCHEN_ID,
  );
}

/** Add or remove the separate-kitchen amenity so the list matches the flag. */
export function withSeparateKitchen(values: string[] | null | undefined, on: boolean): string[] {
  const list = [...(values || [])];
  const without = list.filter(
    (v) => !(isRuToken(v) && ruTokenId(v) === RU_SEPARATE_KITCHEN_ID),
  );
  if (!on) return without;
  return hasSeparateKitchen(list) ? list : [...without, ruToken(RU_SEPARATE_KITCHEN_ID)];
}
