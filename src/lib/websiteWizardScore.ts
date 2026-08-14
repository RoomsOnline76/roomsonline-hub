/**
 * Single website-listing score used by both the Website wizard and the
 * Onboarding queue. Keep this the only place that turns property data into
 * that percentage.
 */

import {
  SCORE_WEIGHTS,
  getWizardStepsForIntent,
  type ListingIntent,
  type OnboardingImage,
} from "@/config/onboardingFieldSchema";
import {
  fillWebsiteWizardAmenities,
  hydrateWebsiteWizardAmenitiesFromInventory,
  roomHasMaxGuests,
  roomHasRate,
  type WebsiteWizardContact,
  type WebsiteWizardInventoryRoom,
  type WebsiteWizardRatePlan,
} from "@/lib/websiteWizardHydrate";

export interface WebsiteWizardScoreInput {
  name?: string | null;
  property_type?: string | null;
  property_url?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  description?: string | null;
  short_description?: string | null;
  images?: unknown;
  amenities?: unknown;
  listing_intent?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  ru_location_id?: number | null;
  price_per_night?: number | null;
}

/** Same hydrate + score the Website wizard uses when it opens. */
export function scoreWebsiteListing(input: {
  property: WebsiteWizardScoreInput | null;
  rooms?: WebsiteWizardInventoryRoom[];
  ratePlans?: WebsiteWizardRatePlan[];
  contacts?: WebsiteWizardContact[];
}): number {
  if (!input.property) return 0;
  const amenities = hydrateWebsiteWizardAmenitiesFromInventory(
    { ...((input.property.amenities || {}) as Record<string, unknown>) },
    {
      owner_name: input.property.owner_name,
      owner_email: input.property.owner_email,
      ru_location_id: input.property.ru_location_id,
      price_per_night: input.property.price_per_night,
    },
    {
      rooms: input.rooms,
      ratePlans: input.ratePlans,
      contacts: input.contacts,
    },
  );
  return calculateWebsiteWizardScore({ ...input.property, amenities });
}

export function calculateWebsiteWizardScore(data: WebsiteWizardScoreInput | null): number {
  if (!data) return 0;

  const intent = (data.listing_intent as ListingIntent) || "accommodation";
  const amenities = fillWebsiteWizardAmenities(
    { ...((data.amenities || {}) as Record<string, unknown>) },
    {
      owner_name: data.owner_name,
      owner_email: data.owner_email,
      ru_location_id: data.ru_location_id,
    },
  );

  const getNestedValue = (...paths: string[]): unknown => {
    for (const path of paths) {
      const parts = path.split(".");
      let current: unknown = amenities;
      for (const part of parts) {
        if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
          current = (current as Record<string, unknown>)[part];
        } else {
          current = undefined;
          break;
        }
      }
      if (current !== undefined && current !== null && current !== "") return current;
    }
    return undefined;
  };

  let earnedScore = 0;
  let totalWeight = 0;
  const stepIds = getWizardStepsForIntent(intent).map((s) => s.id);

  if (stepIds.includes("property_identity")) {
    totalWeight += SCORE_WEIGHTS.property_identity;
    const offerings = amenities.offerings as Record<string, boolean> | undefined;
    const offeringCount = offerings ? Object.values(offerings).filter(Boolean).length : 0;
    const identityFields = [data.name, data.property_type, data.property_url, offeringCount > 0].filter(Boolean).length;
    earnedScore += (identityFields / 4) * SCORE_WEIGHTS.property_identity;
  }

  if (stepIds.includes("contact_details")) {
    totalWeight += SCORE_WEIGHTS.contact_details;
    const hasPhone = !!(getNestedValue("contact.telephone", "telephone") || getNestedValue("contact.mobile", "mobile"));
    const hasEmail = !!(getNestedValue("contact.email", "contact_email"));
    earnedScore += ([hasPhone, hasEmail].filter(Boolean).length / 2) * SCORE_WEIGHTS.contact_details;
  }

  if (stepIds.includes("location")) {
    totalWeight += SCORE_WEIGHTS.location;
    const locationFields = [data.address, data.city, data.country, data.latitude, data.longitude].filter(Boolean).length;
    earnedScore += (locationFields / 5) * SCORE_WEIGHTS.location;
  }

  if (stepIds.includes("policies_pricing")) {
    totalWeight += SCORE_WEIGHTS.policies_pricing;
    const hasCheckIn = !!(getNestedValue("house_rules.check_in_from", "check_in_from", "check_in_time"));
    const hasCheckOut = !!(getNestedValue("house_rules.check_out_to", "check_out_to", "check_out_from"));
    const hasBanking = !!(getNestedValue("banking.bank_name", "bank_name", "banking.bank_confirmation_letter_url"));
    const cancellationPolicies = getNestedValue("cancellation_policies") as unknown[] | undefined;
    const hasCancellation =
      !!(cancellationPolicies && cancellationPolicies.length > 0) ||
      !!getNestedValue("cancellation_policy", "cancellation_policy_text") ||
      !!getNestedValue("house_rules.check_in_instructions");
    const hasPaymentPolicy = !!getNestedValue("payment_policy", "house_rules.payment_policy");
    const hasKeyCollection = !!getNestedValue(
      "key_collection_procedure",
      "house_rules.key_collection_procedure",
      "house_rules.check_in_instructions",
    );
    earnedScore +=
      ([hasCheckIn, hasCheckOut, hasBanking, hasCancellation, hasPaymentPolicy || hasKeyCollection].filter(Boolean)
        .length /
        5) *
      SCORE_WEIGHTS.policies_pricing;
  }

  if (stepIds.includes("guest_experience")) {
    totalWeight += SCORE_WEIGHTS.guest_experience;
    const hasMealPlan = !!(getNestedValue("meal_plan") || (getNestedValue("breakfast_options") as unknown[] | undefined)?.length);
    earnedScore +=
      ([data.description, data.short_description, getNestedValue("unique_selling_points"), hasMealPlan].filter(Boolean)
        .length /
        4) *
      SCORE_WEIGHTS.guest_experience;
  }

  if (stepIds.includes("facilities")) {
    totalWeight += SCORE_WEIGHTS.facilities;
    const facilities = amenities.facilities as string[] | undefined;
    earnedScore += (facilities && facilities.length > 0 ? 1 : 0) * SCORE_WEIGHTS.facilities;
  }

  if (stepIds.includes("rooms_overview")) {
    totalWeight += SCORE_WEIGHTS.rooms_overview;
    const roomTypes = (amenities.room_types as Record<string, unknown>[] | undefined) ?? [];
    const named = roomTypes.filter((r) => !!String(r.name ?? "").trim());
    const guestsOk = named.length > 0 && named.every((r) => roomHasMaxGuests(r));
    const ratesOk = named.length > 0 && named.every((r) => roomHasRate(r));
    earnedScore += (named.length > 0 && guestsOk && ratesOk ? 1 : named.length > 0 ? 0.7 : 0) * SCORE_WEIGHTS.rooms_overview;
  }

  if (stepIds.includes("media_documents")) {
    totalWeight += SCORE_WEIGHTS.media_documents;
    const images: OnboardingImage[] = Array.isArray(data.images) ? (data.images as unknown as OnboardingImage[]) : [];
    const hasHero = images.some((img) => img.type === "hero");
    const hasMinImages = images.length >= 3;
    const imageScore = hasHero && hasMinImages ? 1 : hasMinImages ? 0.7 : images.length / 3;
    earnedScore += imageScore * SCORE_WEIGHTS.media_documents;
  }

  if (stepIds.includes("capacity") && SCORE_WEIGHTS.capacity) {
    totalWeight += SCORE_WEIGHTS.capacity;
    earnedScore += (getNestedValue("venue_capacity", "max_event_capacity") ? 1 : 0) * SCORE_WEIGHTS.capacity;
  }

  if (stepIds.includes("event_types") && SCORE_WEIGHTS.event_types) {
    totalWeight += SCORE_WEIGHTS.event_types;
    const eventTypes = amenities.event_types as string[] | undefined;
    earnedScore += (eventTypes && eventTypes.length > 0 ? 1 : 0) * SCORE_WEIGHTS.event_types;
  }

  return totalWeight > 0 ? Math.round((earnedScore / totalWeight) * 100) : 0;
}
