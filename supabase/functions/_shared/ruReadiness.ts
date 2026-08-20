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
  | "Pricing 365d"
  | "Channel publishing";

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
  /** Nearby attractions that carry a distance — pushed as the channel Distances block. */
  attraction_distance_count?: number;
  images_count?: number;
  images_meeting_size?: number;
  images_size_unverified?: number;
  /** Photos borrowed from the property gallery because the unit has < RU_MIN_IMAGES of its own. */
  images_inherited_count?: number;
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
  payment_methods_is_default?: boolean;
  has_cancellation_policies?: boolean;
  cancellation_policies_is_default?: boolean;
  /** Currency was guessed from the country (or the ZAR final fallback) instead of authored. */
  currency_is_default?: boolean;
  currency_iso?: string | null;
  /** Property/unit type did not map to a channel ObjectTypeID and fell back to a default. */
  object_type_is_default?: boolean;
  object_type_source?: string | null;
  /** Bed strings that could not be mapped to a channel bed amenity. */
  beds_unmapped?: string[];
  /** Bed blocks were derived from bedroom/occupancy counts instead of an authored configuration. */
  beds_are_default?: boolean;
  /** No changeover rule authored on the unit or the property — the default code was assumed. */
  changeover_is_default?: boolean;

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
  images_measured_count?: number;
  images_meet_cert_size?: boolean;
  smallest_image_width?: number | null;
  smallest_image_height?: number | null;
  bedroom_blocks?: number;
  bedrooms_with_beds?: number;
  has_bedroom?: boolean;
  has_kitchen?: boolean;
  has_bathroom_room?: boolean;
  has_bathrooms?: boolean;
  has_toilets?: boolean;
  bathrooms_count?: number;
  toilets_count?: number;
  beds_distributed?: boolean;

  arrival_instructions_length?: number;
  has_arrival_instructions?: boolean;
  ru_location_authored?: boolean;
  has_check_in_from?: boolean;
  has_check_out_until?: boolean;
  check_in_from?: string | null;
  check_in_to?: string | null;
  check_out_until?: string | null;
  check_in_times_are_default?: boolean;
  check_in_times_source?: string | null;
  check_in_times_violation?: string | null;
  check_in_times_valid?: boolean;
  [key: string]: unknown;
}

export interface RuUnitInput {
  name?: string | null;
  validation?: RuUnitValidation | null;
}

export type RuChannelWindowEvidence = "complete" | "incomplete";

/**
 * Did a channel read actually answer with data?
 *
 * The channel gateway answers a rate-limited read with HTTP 202 `{ success: true, queued: true }`
 * so the caller knows the work is parked in the background queue — there is no calendar in that
 * body. Counting it as "responded" made an unread unit look like an answered calendar with zero
 * open days and no MinStay, which blocked properties whose live calendars were fully open and
 * priced. Only a real payload counts as read.
 */
export function ruReadAnswered(
  result: { data?: unknown; error?: unknown } | null | undefined,
  payloadKey = "raw_xml",
): boolean {
  if (!result || result.error != null) return false;
  const data = result.data as Record<string, unknown> | null | undefined;
  if (!data || data.success !== true) return false;
  if (data.queued === true || data.deferred === true || data.rate_deferred === true) return false;
  const payload = data[payloadKey];
  return typeof payload === "string" && payload.trim().length > 0;
}

/**
 * Decide whether a live channel calendar can safely author the readiness verdict.
 * An answered calendar with no open days is a real (blocking) result. Open inventory
 * with no returned prices is only half a response and must fall back to ROL'OS evidence.
 */
export function classifyChannelWindowEvidence(
  window: { open_days?: number; unpriced_open_days?: number } | null | undefined,
  transport: { availability_responded: boolean; prices_responded: boolean },
): RuChannelWindowEvidence {
  if (!window || !transport.availability_responded) return "incomplete";
  const openDays = Math.max(0, Number(window.open_days ?? 0));
  if (openDays === 0) return "complete";
  if (!transport.prices_responded) return "incomplete";
  const unpricedOpenDays = Math.max(0, Number(window.unpriced_open_days ?? openDays));
  return unpricedOpenDays < openDays ? "complete" : "incomplete";
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

/** Certification requires authored sleeping places to match CanSleepMax. */
export const RU_BED_COVERAGE = 1;

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
  // An unmapped ROL'OS type used to publish silently as Chalet. The channel type decides how
  // the listing is merchandised, so a guess must block instead.
  add("object_type_authored", "Content", "Property type maps to a channel type",
    v.object_type_is_default !== true,
    `The ROL'OS type${v.object_type_source ? ` "${v.object_type_source}"` : ""} does not map to a Channel Manager property type — the channel would receive an assumed Chalet. Pick a supported type`,
    "Rooms → Unit → Property type");
  add("currency_authored", "Content", "Currency is authored (not assumed)",
    v.currency_is_default !== true,
    "No currency is set for this property — the channel would receive an assumed ZAR. Set the currency in Billing & banking",
    "Property → Billing & banking → Currency");

  add("can_sleep_max_ok", "Content", "Max guests ≥ 1", !!v.can_sleep_max_ok,
    "CanSleepMax must be at least 1", "Rooms → Unit → Max guests");
  add("has_description", "Content", "Description present", v.has_description !== false,
    "Description is missing", "Property → Description");
  add("description_meets_recommended", "Content", "Description ≥ 100 characters (recommended)",
    v.description_meets_recommended !== false,
    `Description is only ${v.description_length ?? 0} characters — 100+ is recommended for channel quality`,
    "Property → Description", false);
  // Nice-to-have: distances to nearby attractions. Supported by the channel and pushed when
  // available, so it is reported as advisory and never blocks a push or a phase.
  add("attraction_distances", "Content", "Distances to nearby attractions (recommended)",
    (v.attraction_distance_count ?? 0) >= 3,
    `${v.attraction_distance_count ?? 0} nearby attraction(s) have a distance captured — 3+ are pushed to the channel as Distances`,
    "Property → Facilities → Nearby attractions & distances", false);
  // Certification gate: the channel content review requires 700+ characters.
  add("description_meets_cert", "Content", `Description ≥ ${RU_CERT_MIN_DESCRIPTION} characters`,
    v.description_meets_cert !== false,
    `Description is ${v.description_length ?? 0} characters — the channel content review requires ${RU_CERT_MIN_DESCRIPTION}`,
    "Property → Description");
  add("has_check_in_from", "Content", "Check-in from time", v.has_check_in_from !== false,
    "Check-in time is not set", "Property → House rules → Check-in");
  add("has_check_out_until", "Content", "Check-out until time", v.has_check_out_until !== false,
    "Check-out time is not set", "Property → House rules → Check-out");
  // The channel enforces "check-out must not be later than check-in from" and refuses to edit
  // a listing that breaks it, so a violating trio has to block the push at our side.
  add("check_in_times_valid", "Content", "Check-in / out times pass the channel rule",
    !v.check_in_times_violation,
    String(v.check_in_times_violation || "Check-in / check-out times break the channel rule"),
    "Property → House rules → Check-in / Check-out");
  add("check_in_times_authored", "Content", "Check-in / out times are authored (not defaults)",
    v.check_in_times_are_default !== true,
    `Sending the default ${v.check_in_from ?? "14:00"} / ${v.check_out_until ?? "10:00"} — confirm the real times`,
    "Property → House rules → Check-in / Check-out", false);
  add("has_arrival_instructions", "Content", "Arrival instructions populated",
    v.has_arrival_instructions !== false,
    `Arrival instructions are ${v.arrival_instructions_length ?? 0} characters — at least ${RU_MIN_ARRIVAL_INSTRUCTIONS} are required. Units without their own instructions use the master property arrival policy, so save that policy to clear every unit at once`,
    "Property → Policies → Arrival policy");

  // Floor and Space are both authored data the channel review checks — a blank value must
  // block the push instead of silently shipping the ground-floor / 50 m² defaults.
  add("has_space", "Content", "Property size (Space)", !!v.has_space && v.space_is_default !== true,
    "Size in m² is not set — the channel would receive the invented default of 50 m². Set the unit size (Rooms → Unit → Size) or the property size (Info & Facilities)",
    "Rooms → Unit → Size");
  add("has_floor", "Content", "Floor number", v.has_floor !== false && v.floor_is_default !== true,
    "Floor number is not set — set the unit's floor (0 = ground) before publishing", "Rooms → Unit → Floor");
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


  // Certification requires sleeping places to cover CanSleepMax. Coverage is measured
  // in people, not bed objects (a double sleeps 2).
  const sleeps = v.total_bed_capacity ?? v.total_beds ?? 0;
  add("beds_cover_half", "Rooms & beds", "Sleeping places match max guests",
    v.beds_cover_half !== false,
    `Beds sleep ${sleeps} of ${v.max_guests ?? 0} max guests — the Channel Manager requires ${Math.round(RU_BED_COVERAGE * 100)}%`,
    "Rooms → Unit → Bed configuration");
  add("beds_meet_max_guests", "Rooms & beds", "Sleeping places equal max guests",
    v.beds_meet_max_guests !== false,
    `Beds sleep ${sleeps} people but the unit takes ${v.max_guests ?? 0} guests — certification requires these values to match`,
    "Rooms → Unit → Bed configuration");
  // Certification composition strictness.
  add("has_bedroom", "Rooms & beds", "At least 1 bedroom in the composition", v.has_bedroom !== false,
    "No bedroom block is declared in the composition", "Rooms → Unit → Bedrooms");
  add("has_kitchen", "Rooms & beds", "Kitchen declared", v.has_kitchen !== false,
    "No kitchen is declared in the composition or amenities", "Rooms → Unit → Facilities → Kitchen");
  add("has_bathroom_room", "Rooms & beds", "Bathroom declared", v.has_bathroom_room !== false,
    "No bathroom is declared in the composition or amenities", "Rooms → Unit → Facilities → Bathrooms");
  // RU composition treats bathrooms and toilets as mandatory counts — zero or blank is rejected.
  add("has_bathrooms", "Rooms & beds", "Number of bathrooms ≥ 1", v.has_bathrooms !== false,
    `Bathrooms are ${v.bathrooms_count ?? 0} — the Channel Manager rejects a blank or zero bathroom count`,
    "Rooms → Unit → Facilities → Bathrooms");
  add("has_toilets", "Rooms & beds", "Number of toilets ≥ 1", v.has_toilets !== false,
    `Toilets are ${v.toilets_count ?? 0} — the Channel Manager rejects a blank or zero toilet count`,
    "Rooms → Unit → Facilities → Toilets");

  add("beds_distributed", "Rooms & beds", "Beds distributed between bedrooms", v.beds_distributed !== false,
    `${v.bedrooms_with_beds ?? 0} of ${v.bedroom_blocks ?? 0} bedrooms carry beds — spread the bed configuration across the bedrooms`,
    "Rooms → Unit → Bed configuration");
  // Unmapped bed labels used to publish as a double bed, and a missing configuration used to
  // be derived from bedroom counts. Both are assumptions about sleeping arrangements.
  add("beds_authored", "Rooms & beds", "Every bed type maps to a channel bed",
    (v.beds_unmapped ?? []).length === 0 && v.beds_are_default !== true,
    (v.beds_unmapped ?? []).length > 0
      ? `Bed type(s) ${(v.beds_unmapped ?? []).join(", ")} do not map to a Channel Manager bed — the channel would receive a double bed instead. Re-select them from the bed list`
      : "The bed blocks were derived from the bedroom count instead of an authored bed configuration — capture the real beds per bedroom",
    "Rooms → Unit → Bed configuration");
  // Changeover rules ship with availability; an assumed code decides which days guests may
  // arrive or depart, so it must be authored.
  add("changeover_authored", "Availability 365d", "Changeover rule is authored (not assumed)",
    v.changeover_is_default !== true,
    "No changeover rule is set on this unit or the property — the channel would receive an assumed 'arrival and departure any day'. Set the rule in Rate Manager",
    "Rate Manager → Rules → Changeover");



  // ── Photos ──
  add("meets_minimum_images", "Photos", `Photos (≥ ${RU_MIN_IMAGES})`, !!v.meets_minimum_images,
    `Only ${v.images_count ?? 0} photos — the Channel Manager requires ${RU_MIN_IMAGES}`,
    "Property → Images (or unit images)");
  add("images_meet_size", "Photos", `Photos ≥ ${RU_MIN_IMAGE_WIDTH}×${RU_MIN_IMAGE_HEIGHT}px`,
    v.images_meet_size !== false,
    `${(v.images_count ?? 0) - (v.images_meeting_size ?? 0)} photo(s) are smaller than ${RU_MIN_IMAGE_WIDTH}×${RU_MIN_IMAGE_HEIGHT}px`,
    "Property → Images — re-upload larger versions");
  // Certification dimensions: every photo must MEASURE at least 1024×768.
  const measuredCount = v.images_measured_count ?? v.images_count ?? 0;
  const belowCert = Math.max(0, measuredCount - (v.images_meeting_cert_size ?? 0));
  add("images_meet_cert_size", "Photos", `Photos measured ≥ ${RU_CERT_MIN_IMAGE_WIDTH}×${RU_CERT_MIN_IMAGE_HEIGHT}px`,
    v.images_meet_cert_size !== false,
    measuredCount === 0
      ? `None of the ${v.images_count ?? 0} photo(s) could be measured, so the ${RU_CERT_MIN_IMAGE_WIDTH}×${RU_CERT_MIN_IMAGE_HEIGHT}px rule cannot be verified — re-upload them as JPG or PNG`
      : `${belowCert} measured photo(s) are below ${RU_CERT_MIN_IMAGE_WIDTH}×${RU_CERT_MIN_IMAGE_HEIGHT}px${
        (v.smallest_image_width ?? null) != null ? ` (smallest measured ${v.smallest_image_width}×${v.smallest_image_height}px)` : ""
      }`,
    "Property → Images — re-upload larger versions");
  add("images_size_measured", "Photos", "All photo dimensions measured",
    (v.images_size_unverified ?? 0) === 0,
    `${v.images_size_unverified ?? 0} of ${v.images_count ?? 0} photo(s) sent for this unit could not be measured — re-upload them as JPG or PNG so their size can be verified${
      (v.images_inherited_count ?? 0) > 0
        ? ` (${v.images_inherited_count} of the ${v.images_count ?? 0} come from the property gallery because the unit has fewer than ${RU_MIN_IMAGES} of its own)`
        : ""
    }`,
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
  add("ru_location_selected", "Address & geo", "Channel Manager location selected in ROL'OS",
    v.ru_location_authored !== false,
    "No Channel Manager location is selected — the listing location and currency were guessed from the coordinates. Pick the location in Identity & location → Channel Manager location",
    "Property → Identity & location → Channel Manager location");
  add("has_coordinates", "Address & geo", "Geo-coordinates", !!v.has_coordinates,
    "Latitude / longitude are missing", "Property → General → Map location");

  // ── Policies & payments ──
  add("has_payment_methods", "Policies & payments", "At least 1 payment method", !!v.has_payment_methods,
    "No payment method configured", "Property → Policies → Payment methods");
  // A blank configuration used to publish an assumed "cash + card" pair. Commercial terms
  // may never be invented, so an unauthored set blocks the push.
  add("payment_methods_authored", "Policies & payments", "Payment methods are authored (not assumed)",
    v.payment_methods_is_default !== true,
    "No payment methods are configured — the channel would receive an assumed cash + card pair. Select the methods this property really accepts",
    "Property → Policies → Payment methods");
  add("has_cancellation_policies", "Policies & payments", "At least 1 cancellation policy", !!v.has_cancellation_policies,
    "No cancellation policy configured", "Property → Policies → Cancellation");
  add("cancellation_policies_authored", "Policies & payments", "Cancellation policy is authored (not assumed)",
    v.cancellation_policies_is_default !== true,
    "No cancellation policy is configured — the channel would receive an assumed 0–30 days / 100% rule. Author the real policy before publishing",
    "Property → Policies → Cancellation");


  return checks;
}

export function summarizeReadiness(
  units: RuUnitInput[],
  extraChecks: RuCheck[] = [],
): RuReadinessSummary {
  const multi = units.length > 1;
  const checks: RuCheck[] = [];
  for (const u of units) {
    // The unit name is ALWAYS attached — it is the routing key the wizard uses to open
    // the failing unit card. Only the human-readable prefix is reserved for multi-unit
    // properties, where naming the unit adds information.
    checks.push(...evaluateUnitChecks(u.validation, u.name ?? "Unit"));
  }
  checks.push(...extraChecks);

  /** Prefix the unit name only when the property actually has siblings. */
  const describe = (c: RuCheck) =>
    `${multi && c.unit ? `${c.unit}: ` : ""}${c.detail ?? c.label}`;

  const gaps = checks.filter((c) => !c.passed).map(describe);

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
    "Channel publishing",
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
    blocking_gaps: checks.filter((c) => c.mandatory && !c.passed).map(describe),
    advisory_gaps: checks.filter((c) => !c.mandatory && !c.passed).map(describe),
    checks,
    groups,
  };
}

/** One active unit of a property and whether it currently holds a channel listing. */
export interface RuUnitPublishState {
  name: string;
  published: boolean;
}

/**
 * The publish invariant: every active unit the Rooms tab lists must hold a channel
 * listing id. Content scoring alone let a unit that was inactive during the last push
 * disappear from the channel while the property still read 100% ready, so this is scored
 * from the property's *current* unit rows rather than the push snapshot.
 *
 * It is only mandatory once the property is published — before the first push nothing
 * holds a listing id yet.
 */
export function unitsPublishedChecks(
  units: RuUnitPublishState[],
  opts: { published: boolean },
): RuCheck[] {
  if (units.length === 0) return [];
  const missing = units.filter((u) => !u.published);
  const passed = missing.length === 0;
  return [{
    key: "units_published",
    group: "Channel publishing",
    label: `Every unit is published to the channel (${units.length - missing.length} of ${units.length})`,
    mandatory: opts.published === true,
    passed,
    unit: missing.length === 1 ? missing[0].name : undefined,
    ...(passed ? {} : {
      detail: `${missing.map((u) => u.name).join(", ")} ${missing.length === 1 ? "holds" : "hold"} no channel listing — ${
        missing.length === 1 ? "it exists" : "they exist"
      } in ROL'OS but not at the channel. Run the channel push to publish ${missing.length === 1 ? "it" : "them"}.`,
    }),
    fix_hint: "ROL'OS → Channels → push to the channel",
  }];
}

/** Convenience helper used by push-property-to-ru to gate live pushes. */
export function mandatoryGaps(units: RuUnitInput[]): string[] {
  return summarizeReadiness(units).blocking_gaps;
}

/**
 * Pre-publish equivalent of `bookableWindowChecks`, scored on ROL'OS data instead of the
 * live channel calendar. Used by the onboarding wizard and the live push gate so both agree
 * before the property exists at the channel.
 */
export function localBookableWindowChecks(
  window: {
    ok: boolean;
    start: string | null;
    longest_run: number;
    min_stay_set: boolean;
    open_days: number;
    unpriced_open_days: number;
    /** Active units with no MinStay authored — named so the fix opens the right card. */
    units_without_min_stay?: string[];
  },
  unit?: string,
): RuCheck[] {
  const minStayUnits = window.units_without_min_stay ?? [];
  return [
    {
      key: "bookable_window",
      group: "Availability 365d",
      label: `≥ ${RU_MIN_BOOKABLE_WINDOW} consecutive bookable days with a price (ROL'OS calendar)`,
      mandatory: true,
      passed: window.ok,
      unit,
      fix_hint: "Rate Manager → Calendar (seasons) and Rate Plans",
      ...(window.ok
        ? { detail: `Longest sellable run is ${window.longest_run} day(s) from ${window.start ?? "today"}` }
        : {
          detail: `Longest run of open, priced days in ROL'OS is ${window.longest_run} (need ${RU_MIN_BOOKABLE_WINDOW}); ${window.open_days} open day(s), ${window.unpriced_open_days} of them unpriced`,
        }),
    },
    {
      key: "min_stay_set",
      group: "Availability 365d",
      label: "MinStay authored in ROL'OS",
      mandatory: true,
      passed: window.min_stay_set,
      unit: minStayUnits.length === 1 ? minStayUnits[0] : unit,
      fix_hint: "Edit Property → Rooms → Room Type → Min Stay",
      ...(window.min_stay_set
        ? {}
        : {
          detail: minStayUnits.length > 0
            ? `No minimum stay authored on ${minStayUnits.slice(0, 3).join(", ")}${minStayUnits.length > 3 ? ` +${minStayUnits.length - 3} more` : ""}`
            : "No minimum stay is authored on the affected Room Type or its dated/Rate Plan fallback",
        }),
    },
  ];
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
      fix_hint: "Rate Manager → Calendar (seasons) and Rate Plans",
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
      fix_hint: "Edit Property → Rooms → Room Type → Min Stay",
      ...(window.min_stay_set
        ? {}
        : { detail: `No MinStay value reached the channel for the affected unit; set it in Rooms → Room Type → Min Stay` }),
    },
  ];
}


/**
 * Currency verification (Push_ChangeCurrency_RQ + read-back).
 *
 * Currency is decided before publication and verified after every active unit has a live
 * listing. It is deliberately not a Pricing 365d check: authored rate coverage must not
 * regress while a partial first publish is still creating the listings needed for read-back.
 */
export function currencyVerificationChecks(
  state: {
    published_currency_iso?: string | null;
    ru_reported_currency_iso?: string | null;
    verified_at?: string | null;
    flip_outcome?: string | null;
    location_currency_iso?: string | null;
  } | null,
  /** Until the full listing set exists there is nothing complete to read back. */
  opts: { published?: boolean } = {},
): RuCheck[] {
  const published = opts.published !== false;
  const intended = state?.published_currency_iso ?? null;
  // A channel "already set" answer is itself a read-back of the account's location currency;
  // a listing whose currency was correct from the start must not be stuck unverified forever.
  const reported = state?.ru_reported_currency_iso
    ?? (state?.flip_outcome === "already_set" ? state?.location_currency_iso ?? null : null);
  const verified = !!intended && !!reported && intended === reported
    && (!!state?.verified_at || state?.flip_outcome === "already_set");

  return [
    {
      key: "currency_verified",
      group: "Channel publishing",
      label: published
        ? "Listing currency verified on the channel"
        : "Listing currency decided (verified after the first push)",
      mandatory: published,
      passed: published ? verified : !!intended,
      fix_hint: "Channel console → Currency panel → Verify currency",
      ...(published
        ? verified
          ? { detail: `Channel reports ${reported} — matches the published currency` }
          : {
            detail: !intended
              ? "No currency decision recorded for this property"
              : !reported
                ? `Published as ${intended}, but the channel has never been read back to confirm it`
                : `Channel reports ${reported}, ROL'OS publishes ${intended}`,
          }
        : intended
          ? { detail: `Will publish as ${intended}` }
          : { detail: "No currency decision recorded for this property" }),
    },
  ];
}
