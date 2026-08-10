// Shared Rentals United White-Label readiness scorer.
//
// Both the admin certification console (ru-cert-portal) and the ROLOS
// property-level scorecard must score a property identically, and
// push-property-to-ru uses the same rules to gate live pushes.
//
// The input is the `validation` object returned by push-property-to-ru's
// dry run (per unit for multi-unit properties).

import {
  RU_CERT_MIN_DESCRIPTION,
  RU_CERT_MIN_IMAGE_HEIGHT,
  RU_CERT_MIN_IMAGE_WIDTH,
  RU_MIN_ARRIVAL_INSTRUCTIONS,
  RU_MIN_BOOKABLE_WINDOW,
} from "./ruContentQuality.ts";

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
  rooms_below_min_amenities?: number;
  rooms_meet_min_amenities?: boolean;
  has_coordinates?: boolean;
  meets_minimum_images?: boolean;
  images_meet_size?: boolean;
  meets_minimum_amenities?: boolean;
  max_guests?: number;
  has_zip_code?: boolean;
  has_space?: boolean;
  space_is_default?: boolean;
  has_floor?: boolean;
  floor_is_default?: boolean;
  has_detailed_location_id?: boolean;
  has_payment_methods?: boolean;
  has_cancellation_policies?: boolean;
  beds_meet_max_guests?: boolean;
  beds_cover_half?: boolean;
  total_beds?: number;
  total_bed_capacity?: number;
  has_name?: boolean;
  has_object_type_id?: boolean;
  can_sleep_max_ok?: boolean;
  has_description?: boolean;
  description_length?: number;
  description_meets_recommended?: boolean;
  amenities_mapped_count?: number;
  amenities_padded_count?: number;
  amenities_padded?: boolean;
  has_main_image?: boolean;
  has_street?: boolean;
  rooms_have_amenities?: boolean;
  /** Certification content-quality fields. */
  name_clean?: boolean;
  name_issues?: string[];
  name_issue_detail?: string | null;
  description_meets_cert?: boolean;
  images_meeting_cert_size?: number;
  images_meet_cert_size?: boolean;
  smallest_image_width?: number | null;
  smallest_image_height?: number | null;
  bedroom_blocks?: number;
  bedrooms_with_beds?: number;
  has_bedroom?: boolean;
  has_kitchen?: boolean;
  has_bathroom_room?: boolean;
  beds_distributed?: boolean;
  arrival_instructions_length?: number;
  has_arrival_instructions?: boolean;
  has_check_in_from?: boolean;
  has_check_out_until?: boolean;
  check_in_from?: string | null;
  check_out_until?: string | null;
  check_in_times_are_default?: boolean;
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
  /** Failing mandatory checks only — the set that may block a push or a phase. */
  blocking_gaps: string[];
  /** Failing optional checks — quality advice that must never block. */
  advisory_gaps: string[];
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
  // Certification name hygiene: no emoji, no rejected special characters, not ALL CAPS.
  add("name_clean", "Content", "Name passes channel naming rules", v.name_clean !== false,
    `Name rejected: ${v.name_issue_detail ?? "contains emoji, special characters or ALL CAPS"}`,
    "Property → General → Name");
  add("has_object_type_id", "Content", "Property type (ObjectTypeID)", !!v.has_object_type_id,
    "No property type selected", "Property → General → Property type");
  add("can_sleep_max_ok", "Content", "Max guests ≥ 1", !!v.can_sleep_max_ok,
    "CanSleepMax must be at least 1", "Rooms → Unit → Max guests");
  add("has_description", "Content", "Description present", v.has_description !== false,
    "Description is missing", "Property → Description");
  add("description_meets_recommended", "Content", "Description ≥ 100 characters (recommended)",
    v.description_meets_recommended !== false,
    `Description is only ${v.description_length ?? 0} characters — 100+ is recommended for channel quality`,
    "Property → Description", false);
  // Certification gate: the channel content review requires 700+ characters.
  add("description_meets_cert", "Content", `Description ≥ ${RU_CERT_MIN_DESCRIPTION} characters`,
    v.description_meets_cert !== false,
    `Description is ${v.description_length ?? 0} characters — the channel content review requires ${RU_CERT_MIN_DESCRIPTION}`,
    "Property → Description");
  add("has_check_in_from", "Content", "Check-in from time", v.has_check_in_from !== false,
    "Check-in time is not set", "Property → House rules → Check-in");
  add("has_check_out_until", "Content", "Check-out until time", v.has_check_out_until !== false,
    "Check-out time is not set", "Property → House rules → Check-out");
  add("check_in_times_authored", "Content", "Check-in / out times are authored (not defaults)",
    v.check_in_times_are_default !== true,
    `Sending the default ${v.check_in_from ?? "14:00"} / ${v.check_out_until ?? "10:00"} — confirm the real times`,
    "Property → House rules → Check-in / Check-out", false);
  add("has_arrival_instructions", "Content", "Arrival instructions populated",
    v.has_arrival_instructions !== false,
    `Arrival instructions are ${v.arrival_instructions_length ?? 0} characters — at least ${RU_MIN_ARRIVAL_INSTRUCTIONS} are required`,
    "Property → House rules → Check-in instructions");
  // Space / floor are advisory: RU accepts an estimate, but we report when the
  // value being sent is our default rather than real property data.
  add("has_space", "Content", "Property size (Space)", !!v.has_space && v.space_is_default !== true,
    "Size in m² is not set — sending the default estimate of 50 m²", "Rooms → Unit → Size", false);
  add("has_floor", "Content", "Floor number", v.has_floor !== false && v.floor_is_default !== true,
    "Floor number is not set — sending the default (ground floor)", "Rooms → Unit → Floor", false);
  add("meets_minimum_amenities", "Content", `Amenities (≥ ${RU_MIN_AMENITIES})`, !!v.meets_minimum_amenities,
    `Only ${v.amenities_count ?? 0} amenities mapped — the Channel Manager requires ${RU_MIN_AMENITIES}`,
    "Property → Amenities");
  // Padded amenities keep the push valid but are assumed data — warn so owners fix them.
  add("amenities_not_padded", "Content", "Amenities are real (not padded defaults)",
    v.amenities_padded !== true,
    `${v.amenities_padded_count ?? 0} amenity(ies) were auto-filled to reach RU's minimum of ${RU_MIN_AMENITIES} — confirm or replace them`,
    "Property → Amenities", false);

  // ── Rooms & beds ──
  add("has_rooms", "Rooms & beds", "Composition rooms defined", (v.rooms_count ?? 0) > 0,
    "No composition rooms (bedrooms) defined", "Rooms → Unit → Bedrooms / bed configuration");
  add("rooms_have_amenities", "Rooms & beds", "Every room has beds / amenities", v.rooms_have_amenities !== false,
    `${(v.rooms_count ?? 0) - (v.rooms_with_amenities ?? 0)} room block(s) have no bed or amenity entry`,
    "Rooms → Unit → Bed configuration");
  // RU's 10-amenity minimum applies to the property/unit only (checked above via
  // meets_minimum_amenities). Composition rooms carry bed entries exclusively, so
  // counting amenities per bedroom block is meaningless and is not reported at all —
  // it produced a permanent false "amenities < 10" gap on fully-completed units.


  // RU White-Label minimum: sleeping places must cover >= 50% of CanSleepMax. Coverage
  // is measured in people, not beds (a double sleeps 2). Full coverage is advisory.
  const sleeps = v.total_bed_capacity ?? v.total_beds ?? 0;
  add("beds_cover_half", "Rooms & beds", `Sleeping places cover ≥ ${Math.round(RU_BED_COVERAGE * 100)}% of max guests`,
    v.beds_cover_half !== false,
    `Beds sleep ${sleeps} of ${v.max_guests ?? 0} max guests — the Channel Manager requires ${Math.round(RU_BED_COVERAGE * 100)}%`,
    "Rooms → Unit → Bed configuration");
  add("beds_meet_max_guests", "Rooms & beds", "Sleeping places cover 100% of max guests (recommended)",
    v.beds_meet_max_guests !== false,
    `Beds sleep ${sleeps} people but the unit takes ${v.max_guests ?? 0} guests — not required by the Channel Manager, but improves channel quality`,
    "Rooms → Unit → Bed configuration", false);
  // Certification composition strictness.
  add("has_bedroom", "Rooms & beds", "At least 1 bedroom in the composition", v.has_bedroom !== false,
    "No bedroom block is declared in the composition", "Rooms → Unit → Bedrooms");
  add("has_kitchen", "Rooms & beds", "Kitchen declared", v.has_kitchen !== false,
    "No kitchen is declared in the composition or amenities", "Rooms → Unit → Facilities → Kitchen");
  add("has_bathroom_room", "Rooms & beds", "Bathroom declared", v.has_bathroom_room !== false,
    "No bathroom is declared in the composition or amenities", "Rooms → Unit → Facilities → Bathrooms");
  add("beds_distributed", "Rooms & beds", "Beds distributed between bedrooms", v.beds_distributed !== false,
    `${v.bedrooms_with_beds ?? 0} of ${v.bedroom_blocks ?? 0} bedrooms carry beds — spread the bed configuration across the bedrooms`,
    "Rooms → Unit → Bed configuration");

  // ── Photos ──
  add("meets_minimum_images", "Photos", `Photos (≥ ${RU_MIN_IMAGES})`, !!v.meets_minimum_images,
    `Only ${v.images_count ?? 0} photos — the Channel Manager requires ${RU_MIN_IMAGES}`,
    "Property → Images (or unit images)");
  add("images_meet_size", "Photos", `Photos ≥ ${RU_MIN_IMAGE_WIDTH}×${RU_MIN_IMAGE_HEIGHT}px`,
    v.images_meet_size !== false,
    `${(v.images_count ?? 0) - (v.images_meeting_size ?? 0)} photo(s) are smaller than ${RU_MIN_IMAGE_WIDTH}×${RU_MIN_IMAGE_HEIGHT}px`,
    "Property → Images — re-upload larger versions");
  // Certification dimensions: every photo must MEASURE at least 1024×768.
  add("images_meet_cert_size", "Photos", `Photos measured ≥ ${RU_CERT_MIN_IMAGE_WIDTH}×${RU_CERT_MIN_IMAGE_HEIGHT}px`,
    v.images_meet_cert_size !== false,
    `${Math.max(0, (v.images_count ?? 0) - (v.images_meeting_cert_size ?? 0))} photo(s) are below ${RU_CERT_MIN_IMAGE_WIDTH}×${RU_CERT_MIN_IMAGE_HEIGHT}px${
      (v.smallest_image_width ?? null) != null ? ` (smallest measured ${v.smallest_image_width}×${v.smallest_image_height}px)` : ""
    }`,
    "Property → Images — re-upload larger versions");
  add("images_size_measured", "Photos", "All photo dimensions measured",
    (v.images_size_unverified ?? 0) === 0,
    `${v.images_size_unverified ?? 0} photo(s) could not be measured — re-upload them so their size can be verified`,
    "Property → Images", false);
  add("has_main_image", "Photos", "Main photo flagged", v.has_main_image !== false,
    "No photo is marked as the main image", "Property → Images → set the first image");

  // ── Address & geo ──
  add("has_street", "Address & geo", "Street address", v.has_street !== false,
    "Street address is missing", "Property → General → Address");
  add("has_zip_code", "Address & geo", "ZIP / postal code", !!v.has_zip_code,
    "ZIP / postal code is missing or a placeholder", "Property → General → Postal code");
  add("has_detailed_location_id", "Address & geo", "RU DetailedLocationID", !!v.has_detailed_location_id,
    "Channel Manager location could not be resolved from the address / coordinates",
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
    blocking_gaps: checks.filter((c) => c.mandatory && !c.passed)
      .map((c) => `${c.unit ? `${c.unit}: ` : ""}${c.detail ?? c.label}`),
    advisory_gaps: checks.filter((c) => !c.mandatory && !c.passed)
      .map((c) => `${c.unit ? `${c.unit}: ` : ""}${c.detail ?? c.label}`),
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

/**
 * Builds the MinStay / bookable-window checks from a live RU calendar probe
 * (see findRuBookableWindow in ruContentQuality.ts).
 */
export function bookableWindowChecks(
  window: {
    ok: boolean;
    start: string | null;
    longest_run: number;
    min_stay_set: boolean;
    min_stay_days: number;
    open_days: number;
    unpriced_open_days: number;
  },
  unit?: string,
): RuCheck[] {
  return [
    {
      key: "bookable_window",
      group: "Availability 365d",
      label: `≥ ${RU_MIN_BOOKABLE_WINDOW} consecutive bookable days with a price`,
      mandatory: true,
      passed: window.ok,
      unit,
      fix_hint: "Rate Manager → Calendar (availability) and Rates",
      ...(window.ok
        ? {}
        : {
          detail: `Longest run of open, priced days is ${window.longest_run} (need ${RU_MIN_BOOKABLE_WINDOW}); ${window.open_days} open day(s), ${window.unpriced_open_days} of them unpriced`,
        }),
    },
    {
      key: "min_stay_set",
      group: "Availability 365d",
      label: "MinStay set on open days",
      mandatory: true,
      passed: window.min_stay_set,
      unit,
      fix_hint: "Rate Manager → Stay restrictions → Minimum stay",
      ...(window.min_stay_set
        ? {}
        : { detail: `No MinStay value on any of the ${window.open_days} open day(s)` }),
    },
  ];
}

