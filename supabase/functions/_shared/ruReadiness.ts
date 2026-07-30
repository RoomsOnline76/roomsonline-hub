// Shared Rentals United White-Label readiness scorer.
//
// Both the admin certification console (ru-cert-portal) and the ROLOS
// property-level scorecard must score a property identically, and
// push-property-to-ru uses the same rules to gate live pushes.
//
// The input is the `validation` object returned by push-property-to-ru's
// dry run (per unit for multi-unit properties).

export type RuCheckGroup =
  | "Content"
  | "Rooms & beds"
  | "Photos"
  | "Address & geo"
  | "Policies & payments"
  | "Availability 365d"
  | "Pricing 365d";

export interface RuCheck {
  key: string;
  group: RuCheckGroup;
  label: string;
  mandatory: boolean;
  passed: boolean;
  /** Plain-language description of the deficiency (only when failed). */
  detail?: string;
  /** Which unit the check belongs to (multi-unit properties). */
  unit?: string;
  /** Where in ROLOS the owner fixes it. */
  fix_hint?: string;
}

export interface RuUnitValidation {
  images_count?: number;
  images_meeting_size?: number;
  images_size_unverified?: number;
  amenities_count?: number;
  rooms_count?: number;
  rooms_with_amenities?: number;
  has_coordinates?: boolean;
  meets_minimum_images?: boolean;
  images_meet_size?: boolean;
  meets_minimum_amenities?: boolean;
  max_guests?: number;
  has_zip_code?: boolean;
  has_space?: boolean;
  has_floor?: boolean;
  has_detailed_location_id?: boolean;
  has_payment_methods?: boolean;
  has_cancellation_policies?: boolean;
  beds_meet_max_guests?: boolean;
  beds_cover_half?: boolean;
  total_beds?: number;
  has_name?: boolean;
  has_object_type_id?: boolean;
  can_sleep_max_ok?: boolean;
  has_description?: boolean;
  has_main_image?: boolean;
  has_street?: boolean;
  rooms_have_amenities?: boolean;
  [key: string]: unknown;
}

export interface RuUnitInput {
  name?: string | null;
  validation?: RuUnitValidation | null;
}

export interface RuReadinessSummary {
  score: number;
  checks_total: number;
  checks_passed: number;
  mandatory_total: number;
  mandatory_passed: number;
  blocked: boolean;
  gaps: string[];
  checks: RuCheck[];
  groups: { group: RuCheckGroup; total: number; passed: number; failed: RuCheck[] }[];
}

export const RU_MIN_IMAGES = 10;
export const RU_MIN_AMENITIES = 10;
export const RU_MIN_IMAGE_WIDTH = 1024;
export const RU_MIN_IMAGE_HEIGHT = 683;

/** Beds must cover at least this share of CanSleepMax (RU rule). */
export const RU_BED_COVERAGE = 0.5;

export function evaluateUnitChecks(
  validation: RuUnitValidation | null | undefined,
  unitName?: string | null,
): RuCheck[] {
  const v = validation ?? {};
  const unit = unitName ?? undefined;
  const checks: RuCheck[] = [];

  const add = (
    key: string,
    group: RuCheckGroup,
    label: string,
    passed: boolean,
    detail: string,
    fix_hint: string,
    mandatory = true,
  ) => {
    checks.push({ key, group, label, mandatory, passed, unit, fix_hint, ...(passed ? {} : { detail }) });
  };

  // ── Content ──
  add("has_name", "Content", "Property / unit name", !!v.has_name,
    "Name is missing or shorter than 3 characters", "Property → General → Name");
  add("has_object_type_id", "Content", "Property type (ObjectTypeID)", !!v.has_object_type_id,
    "No property type selected", "Property → General → Property type");
  add("can_sleep_max_ok", "Content", "Max guests ≥ 1", !!v.can_sleep_max_ok,
    "CanSleepMax must be at least 1", "Rooms → Unit → Max guests");
  add("has_description", "Content", "Description (≥ 100 characters)", v.has_description !== false,
    "Description is missing or too short (needs at least 100 characters)", "Property → Description");
  add("has_space", "Content", "Property size (Space)", !!v.has_space,
    "Property / unit size in m² is not set", "Rooms → Unit → Size");
  add("has_floor", "Content", "Floor number", v.has_floor !== false,
    "Floor number is not set", "Rooms → Unit → Floor");
  add("meets_minimum_amenities", "Content", `Amenities (≥ ${RU_MIN_AMENITIES})`, !!v.meets_minimum_amenities,
    `Only ${v.amenities_count ?? 0} amenities mapped — Rentals United requires ${RU_MIN_AMENITIES}`,
    "Property → Amenities");

  // ── Rooms & beds ──
  add("has_rooms", "Rooms & beds", "Composition rooms defined", (v.rooms_count ?? 0) > 0,
    "No composition rooms (bedrooms) defined", "Rooms → Unit → Bedrooms / bed configuration");
  add("rooms_have_amenities", "Rooms & beds", "Every room has beds / amenities", v.rooms_have_amenities !== false,
    `${(v.rooms_count ?? 0) - (v.rooms_with_amenities ?? 0)} room block(s) have no bed or amenity entry`,
    "Rooms → Unit → Bed configuration");
  add("beds_cover_half", "Rooms & beds", "Beds cover ≥ 50% of max guests",
    v.beds_cover_half !== false,
    `Beds (${v.total_beds ?? 0}) cover less than half of max guests (${v.max_guests ?? 0})`,
    "Rooms → Unit → Bed configuration");

  // ── Photos ──
  add("meets_minimum_images", "Photos", `Photos (≥ ${RU_MIN_IMAGES})`, !!v.meets_minimum_images,
    `Only ${v.images_count ?? 0} photos — Rentals United requires ${RU_MIN_IMAGES}`,
    "Property → Images (or unit images)");
  add("images_meet_size", "Photos", `Photos ≥ ${RU_MIN_IMAGE_WIDTH}×${RU_MIN_IMAGE_HEIGHT}px`,
    v.images_meet_size !== false,
    `${(v.images_count ?? 0) - (v.images_meeting_size ?? 0)} photo(s) are smaller than ${RU_MIN_IMAGE_WIDTH}×${RU_MIN_IMAGE_HEIGHT}px`,
    "Property → Images — re-upload larger versions");
  add("has_main_image", "Photos", "Main photo flagged", v.has_main_image !== false,
    "No photo is marked as the main image", "Property → Images → set the first image");

  // ── Address & geo ──
  add("has_street", "Address & geo", "Street address", v.has_street !== false,
    "Street address is missing", "Property → General → Address");
  add("has_zip_code", "Address & geo", "ZIP / postal code", !!v.has_zip_code,
    "ZIP / postal code is missing or a placeholder", "Property → General → Postal code");
  add("has_detailed_location_id", "Address & geo", "RU DetailedLocationID", !!v.has_detailed_location_id,
    "Rentals United location could not be resolved from the address / coordinates",
    "Property → General → Address & coordinates");
  add("has_coordinates", "Address & geo", "Geo-coordinates", !!v.has_coordinates,
    "Latitude / longitude are missing", "Property → General → Map location");

  // ── Policies & payments ──
  add("has_payment_methods", "Policies & payments", "At least 1 payment method", !!v.has_payment_methods,
    "No payment method configured", "Property → Policies → Payment methods");
  add("has_cancellation_policies", "Policies & payments", "At least 1 cancellation policy", !!v.has_cancellation_policies,
    "No cancellation policy configured", "Property → Policies → Cancellation");

  return checks;
}

export function summarizeReadiness(
  units: RuUnitInput[],
  extraChecks: RuCheck[] = [],
): RuReadinessSummary {
  const multi = units.length > 1;
  const checks: RuCheck[] = [];
  for (const u of units) {
    const unitName = multi ? (u.name ?? "Unit") : null;
    checks.push(...evaluateUnitChecks(u.validation, unitName));
  }
  checks.push(...extraChecks);

  const gaps = checks
    .filter((c) => !c.passed)
    .map((c) => `${c.unit ? `${c.unit}: ` : ""}${c.detail ?? c.label}`);

  const total = checks.length;
  const passed = checks.filter((c) => c.passed).length;
  const mandatory = checks.filter((c) => c.mandatory);
  const mandatoryPassed = mandatory.filter((c) => c.passed).length;

  const groupOrder: RuCheckGroup[] = [
    "Content",
    "Rooms & beds",
    "Photos",
    "Address & geo",
    "Policies & payments",
    "Availability 365d",
    "Pricing 365d",
  ];
  const groups = groupOrder
    .map((group) => {
      const inGroup = checks.filter((c) => c.group === group);
      return {
        group,
        total: inGroup.length,
        passed: inGroup.filter((c) => c.passed).length,
        failed: inGroup.filter((c) => !c.passed),
      };
    })
    .filter((g) => g.total > 0);

  return {
    score: total > 0 ? Math.round((passed / total) * 100) : 0,
    checks_total: total,
    checks_passed: passed,
    mandatory_total: mandatory.length,
    mandatory_passed: mandatoryPassed,
    blocked: mandatoryPassed < mandatory.length,
    gaps,
    checks,
    groups,
  };
}

/** Convenience helper used by push-property-to-ru to gate live pushes. */
export function mandatoryGaps(units: RuUnitInput[]): string[] {
  const summary = summarizeReadiness(units);
  return summary.checks.filter((c) => c.mandatory && !c.passed)
    .map((c) => `${c.unit ? `${c.unit}: ` : ""}${c.detail ?? c.label}`);
}
