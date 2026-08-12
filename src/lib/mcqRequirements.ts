/**
 * Content-quality requirement catalogue.
 *
 * The Channel Manager's minimum content quality check returns short failing
 * points ("Description too short", "Images below minimum size", …). Owners
 * cannot act on those alone, so each point is matched to:
 *   - the exact requirement the channel enforces, and
 *   - the property-editor section (and requirement key) that fixes it.
 *
 * Vendor naming stays out of this surface (see src/lib/channelVocabulary.ts).
 */

export interface McqRequirement {
  /** Human title for the failing area. */
  title: string;
  /** Exactly what the channel requires. */
  requirement: string;
  /** Property-editor section to open. */
  section: string;
  /** Readiness/requirement key to scroll to and pulse (optional). */
  focusKey?: string;
}

interface McqRule extends McqRequirement {
  match: RegExp;
}

const RULES: McqRule[] = [
  {
    match: /(name|title).*(caps|emoji|special|charac|invalid)|listing name|property name/i,
    title: "Listing name",
    requirement:
      "The name must be plain text: no emoji, no special characters, no ALL CAPS words and no marketing suffixes such as “Book now”.",
    section: "general",
    focusKey: "name",
  },
  {
    match: /descript|700|too short|character/i,
    title: "Description length",
    requirement:
      "The property description must be at least 700 characters of original prose — no bullet lists only, no duplicated text between listings, no contact details or URLs.",
    section: "general",
    focusKey: "description",
  },
  {
    match: /(image|photo|picture)/i,
    title: "Photographs",
    requirement:
      "Every photo must be at least 1024 × 768 pixels, and the listing needs a minimum of 4 photos with one usable hero image. Photos may not contain watermarks, logos or text overlays.",
    section: "images",
    focusKey: "images",
  },
  {
    match: /(street|address(?!.*zip))/i,
    title: "Street address",
    requirement: "A full street address (street name and number) is required — a suburb or farm name alone is rejected.",
    section: "general",
    focusKey: "address",
  },
  {
    match: /(zip|postal)/i,
    title: "Postal code",
    requirement: "A postal / ZIP code is required for the listing address.",
    section: "general",
    focusKey: "address",
  },
  {
    match: /(coordinat|latitude|longitude|geo|location id|city|country)/i,
    title: "Location",
    requirement:
      "City, country and map coordinates must be set so the channel can resolve the location. Use the map picker to place the pin precisely.",
    section: "general",
    focusKey: "geo",
  },
  {
    match: /(check[- ]?in|check[- ]?out|arrival time|departure time)/i,
    title: "Check-in and check-out times",
    requirement: "Both a check-in from time and a check-out until time must be captured.",
    section: "rates",
    focusKey: "check_times",
  },
  {
    match: /(cansleep|sleep|max guest|occupanc|capacity)/i,
    title: "Sleeping capacity",
    requirement:
      "Maximum guests must be at least 1 and must match the bed configuration captured on the rooms/units.",
    section: "rooms",
    focusKey: "rooms",
  },
  {
    match: /(bed|composition|bedroom)/i,
    title: "Bed configuration",
    requirement:
      "Each room/unit needs its bedrooms and beds captured (type and count) — the channel derives sleeping capacity from these.",
    section: "rooms",
    focusKey: "rooms",
  },
  {
    match: /(arrival instruction|access instruction|key collection|directions)/i,
    title: "Arrival instructions",
    requirement:
      "Arrival instructions must explain how the guest gets in: reception hours, key collection, gate or access codes and late-arrival handling.",
    section: "info-facilities",
  },
  {
    match: /(cancel|refund|policy)/i,
    title: "Cancellation policy",
    requirement: "At least one cancellation policy with a notice window and a forfeit/refund rule must be active.",
    section: "rates",
    focusKey: "master_policy",
  },
  {
    match: /(payment method|pay on arrival|deposit)/i,
    title: "Payment methods",
    requirement: "At least one accepted payment method must be captured for the listing.",
    section: "rates",
  },
  {
    match: /(amenit|facilit)/i,
    title: "Amenities and facilities",
    requirement:
      "The channel expects a meaningful amenity set on both the property and each room/unit. Run the TOBI amenity check to fill the gaps.",
    section: "info-facilities",
    focusKey: "facilities",
  },
  {
    match: /(currenc)/i,
    title: "Listing currency",
    requirement: "The listing currency must be verified on the distribution account before content is accepted.",
    section: "integrations",
    focusKey: "ru_currency",
  },
  {
    match: /(rate|price|availab)/i,
    title: "Rates and availability",
    requirement:
      "The listing needs published rates and an open availability window before its content is accepted for distribution.",
    section: "rates",
  },
];

/** Match a raw failing point to a requirement, or null when it is unrecognised. */
export function resolveMcqRequirement(point: string): McqRequirement | null {
  const hit = RULES.find((r) => r.match.test(point));
  if (!hit) return null;
  const { match: _m, ...rest } = hit;
  return rest;
}

/**
 * Order-side failures (the check could not even be placed) are platform
 * plumbing, not owner content problems. Translate them into plain language.
 */
export function explainOrderFailure(message: string): { title: string; detail: string; ownerAction: boolean } {
  const m = message.toLowerCase();
  if (m.includes("subscribe")) {
    return {
      title: "Content review not yet requested",
      detail:
        "The distribution account still has to be subscribed to review notifications. TOBI handles this — no action is needed from you.",
      ownerAction: false,
    };
  }
  if (m.includes("does not exist")) {
    return {
      title: "Listing not published yet",
      detail:
        "The content review can only run once the listing has been pushed to the Channel Manager. Complete the onboarding wizard and push, then the review runs automatically.",
      ownerAction: false,
    };
  }
  if (m.includes("channel")) {
    return {
      title: "Distribution channel not selected",
      detail:
        "The review was requested against a channel that is not enabled on the account. TOBI resolves this on the platform side.",
      ownerAction: false,
    };
  }
  return {
    title: "Content review could not be run",
    detail: `${message} — this is a platform-side issue, not a problem with your listing content.`,
    ownerAction: false,
  };
}

/** Results the channel reports as a pass. */
export function isPassResult(result: string | null | undefined): boolean {
  if (!result) return false;
  return /eligible|pass|approved|success/i.test(result) && !/not eligible|fail/i.test(result);
}
