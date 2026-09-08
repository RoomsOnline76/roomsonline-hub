/**
 * Pure grader for channel connection eligibility.
 *
 * Grades one listing against one channel's published minimum requirements, using
 * only data ROL'OS already holds (plus browser-measured photo results). No channel
 * call — this runs before the owner presses "Get connected", so the eligibility wall
 * inside the Channel Manager becomes a checklist they can clear here.
 */

import {
  CONNECT_REQUIREMENTS,
  type ChannelConnectSpec,
  type ConnectRequirement,
  type ConnectRequirementId,
} from "@/config/channelConnectRequirements";

export interface PhotoProbe {
  url: string;
  /** Loaded successfully in the browser (a proxy for "the channel can fetch it"). */
  reachable: boolean;
  width: number;
  height: number;
}

export interface CancellationRule {
  /** Days before arrival the rule starts applying. */
  daysBefore: number;
  /** Fee/forfeit percentage for that window. */
  feePercent: number;
}

export interface ConnectFacts {
  listingLabel: string;
  ruListingId: string | null;
  name: string | null;
  propertyType: string | null;
  bathrooms: number | null;
  maxGuests: number | null;
  street: string | null;
  city: string | null;
  country: string | null;
  postalCode: string | null;
  latitude: number | null;
  longitude: number | null;
  descriptionLength: number;
  hasKitchen: boolean;
  bedCapacity: number | null;
  photos: string[];
  /** Browser probe results, keyed by URL. Empty until the probe has run. */
  probes: Record<string, PhotoProbe>;
  hasPrices: boolean;
  hasAvailability: boolean;
  minStay: number | null;
  paymentMethods: number;
  cancellationRules: CancellationRule[];
}

export type ConnectStatus = "pass" | "fail" | "unknown";

export interface ConnectVerdict extends ConnectRequirement {
  status: ConnectStatus;
  detail: string;
}

const APARTMENT_LIKE = /apart|condo|cottage|aparthotel|flat|studio/i;

function grade(
  id: ConnectRequirementId,
  spec: ChannelConnectSpec,
  f: ConnectFacts,
): { status: ConnectStatus; detail: string } {
  const probes = f.photos.map((url) => f.probes[url]).filter(Boolean) as PhotoProbe[];
  const probed = probes.length === f.photos.length && f.photos.length > 0;

  switch (id) {
    case "listing_name": {
      const name = (f.name ?? "").trim();
      if (!name) return { status: "fail", detail: "No listing name captured." };
      const shouty = name.split(/\s+/).some((w) => w.length > 3 && w === w.toUpperCase() && /[A-Z]/.test(w));
      // eslint-disable-next-line no-misleading-character-class
      const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(name);
      if (shouty || emoji) {
        return { status: "fail", detail: `“${name}” uses ${emoji ? "emoji" : "ALL CAPS words"}.` };
      }
      return { status: "pass", detail: name };
    }
    case "property_type":
      return f.propertyType
        ? { status: "pass", detail: f.propertyType }
        : { status: "fail", detail: "No property type selected." };
    case "bathrooms": {
      if (!APARTMENT_LIKE.test(f.propertyType ?? "")) {
        return { status: "pass", detail: "Not required for this property type." };
      }
      return (f.bathrooms ?? 0) >= 1
        ? { status: "pass", detail: `${f.bathrooms} bathroom(s)` }
        : { status: "fail", detail: "No bathroom captured." };
    }
    case "max_guests":
      return (f.maxGuests ?? 0) >= 1
        ? { status: "pass", detail: `Sleeps ${f.maxGuests}` }
        : { status: "fail", detail: "Maximum guests is not set." };
    case "address": {
      const street = (f.street ?? "").trim();
      const hasNumber = /\d/.test(street);
      if (!street || !f.city || !f.country) return { status: "fail", detail: "Street, city or country missing." };
      if (!hasNumber || /^p\.?\s?o\.?\s?box/i.test(street)) {
        return { status: "fail", detail: `“${street}” is not a street address with a number.` };
      }
      return { status: "pass", detail: `${street}, ${f.city}` };
    }
    case "postal_code":
      return (f.postalCode ?? "").trim()
        ? { status: "pass", detail: String(f.postalCode) }
        : { status: "fail", detail: "No postal code captured." };
    case "geo":
      return f.latitude != null && f.longitude != null
        ? { status: "pass", detail: `${f.latitude.toFixed(4)}, ${f.longitude.toFixed(4)}` }
        : { status: "fail", detail: "Coordinates missing." };
    case "kitchen":
      return f.hasKitchen
        ? { status: "pass", detail: "Kitchen present." }
        : { status: "fail", detail: "No kitchen captured on the listing." };
    case "beds_match_guests": {
      if (f.bedCapacity == null) return { status: "unknown", detail: "Bed configuration not captured." };
      return f.bedCapacity >= (f.maxGuests ?? 0)
        ? { status: "pass", detail: `Beds sleep ${f.bedCapacity}` }
        : { status: "fail", detail: `Beds sleep ${f.bedCapacity} but the listing allows ${f.maxGuests} guests.` };
    }
    case "description":
      return f.descriptionLength >= spec.minDescription
        ? { status: "pass", detail: `${f.descriptionLength} characters` }
        : {
            status: "fail",
            detail: `${f.descriptionLength} characters — ${spec.minDescription - f.descriptionLength} more needed.`,
          };
    case "photo_count":
      return f.photos.length >= spec.minPhotos
        ? { status: "pass", detail: `${f.photos.length} photos` }
        : {
            status: "fail",
            detail: `${f.photos.length} photos — ${spec.label} needs at least ${spec.minPhotos}.`,
          };
    case "photo_size": {
      if (!probed) return { status: "unknown", detail: "Measure the photos to check their size." };
      const small = probes.filter(
        (p) => p.reachable && (p.width < spec.minPhotoWidth || p.height < spec.minPhotoHeight),
      );
      return small.length === 0
        ? { status: "pass", detail: `All ${probes.length} photos are ${spec.minPhotoWidth} × ${spec.minPhotoHeight} or larger.` }
        : { status: "fail", detail: `${small.length} photo(s) are smaller than ${spec.minPhotoWidth} × ${spec.minPhotoHeight}.` };
    }
    case "photo_reachable": {
      if (!probed) return { status: "unknown", detail: "Measure the photos to check they can be downloaded." };
      const broken = probes.filter((p) => !p.reachable);
      return broken.length === 0
        ? { status: "pass", detail: "Every photo downloads." }
        : { status: "fail", detail: `${broken.length} photo(s) could not be downloaded.` };
    }
    case "main_photo":
      return f.photos.length > 0
        ? { status: "pass", detail: "First photo is used as the main photo." }
        : { status: "fail", detail: "No photos, so no main photo." };
    case "prices":
      return f.hasPrices
        ? { status: "pass", detail: "Prices published." }
        : { status: "fail", detail: "No published prices found." };
    case "availability":
      return f.hasAvailability
        ? { status: "pass", detail: "Availability open." }
        : { status: "fail", detail: "No open availability found." };
    case "min_stay_window": {
      const min = f.minStay ?? 1;
      return min >= 1 && min <= spec.maxMinStay
        ? { status: "pass", detail: `${min} night minimum` }
        : { status: "fail", detail: `${min} nights — must be between 1 and ${spec.maxMinStay}.` };
    }
    case "payment_methods":
      return f.paymentMethods > 0
        ? { status: "pass", detail: `${f.paymentMethods} method(s)` }
        : { status: "fail", detail: "No accepted payment method captured." };
    case "cancellation_policy": {
      if (f.cancellationRules.length === 0) return { status: "fail", detail: "No cancellation policy is active." };
      // Sorted furthest-out first: the fee may never drop as arrival gets closer.
      const rules = [...f.cancellationRules].sort((a, b) => b.daysBefore - a.daysBefore);
      for (let i = 1; i < rules.length; i++) {
        if (rules[i].feePercent < rules[i - 1].feePercent) {
          return {
            status: "fail",
            detail: `The fee drops from ${rules[i - 1].feePercent}% to ${rules[i].feePercent}% closer to arrival — it may only rise or stay level.`,
          };
        }
      }
      const gap = rules.find((r, i) => i > 0 && r.feePercent === 0 && rules[i - 1].feePercent > 0);
      if (gap) {
        return { status: "fail", detail: "There is a penalty-free window between two penalty windows." };
      }
      return { status: "pass", detail: `${rules.length} window(s), rising towards arrival.` };
    }
  }
}

export function gradeChannelConnect(spec: ChannelConnectSpec, facts: ConnectFacts): ConnectVerdict[] {
  return spec.requirements.map((id) => ({
    ...CONNECT_REQUIREMENTS[id],
    ...grade(id, spec, facts),
  }));
}

export function connectSummary(verdicts: ConnectVerdict[]) {
  const failing = verdicts.filter((v) => v.status === "fail");
  const unknown = verdicts.filter((v) => v.status === "unknown");
  return {
    failing,
    unknown,
    passed: verdicts.length - failing.length - unknown.length,
    total: verdicts.length,
    eligible: failing.length === 0,
  };
}
