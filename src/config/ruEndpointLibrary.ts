/**
 * Canonical library of every channel-manager wire method ROL'OS implements.
 *
 * The live traffic monitor grades what it sees against this registry: a verb that appears on the
 * wire but is missing here shows up as "unregistered", which is exactly the signal an engineer
 * needs when a new call is introduced without cadence expectations being agreed. Keep the entries
 * in step with `supabase/functions` — `ruEndpointLibrary.test.ts` fails the build if a method is
 * implemented in an edge function but absent from this file.
 *
 * Naming rule: `id` is the literal value written to `ru_api_log.action`, so the monitor can index
 * straight off the log without a translation layer.
 */

export type RuEndpointFamily =
  | "account"
  | "content"
  | "ari"
  | "bookings"
  | "dictionary"
  | "notifications"
  | "discounts"
  | "whitelabel";

/** How often a healthy system is expected to call the verb — drives the cadence column. */
export type RuEndpointCadence =
  | "on_demand" // operator or app action
  | "on_change" // delta-driven writes
  | "scheduled" // cron
  | "onboarding" // Step A / Step B only
  | "inbound"; // the channel calls us

export interface RuEndpointSpec {
  id: string;
  label: string;
  family: RuEndpointFamily;
  cadence: RuEndpointCadence;
  direction: "outbound" | "inbound";
  /** Write verbs mutate channel state; reads are safe to replay. */
  mutating: boolean;
  /** Short note shown in the counter table tooltip. */
  note?: string;
}

export const RU_ENDPOINT_FAMILY_LABELS: Record<RuEndpointFamily, string> = {
  account: "Accounts & company",
  content: "Listing content",
  ari: "Availability & pricing",
  bookings: "Reservations",
  dictionary: "Channel dictionaries",
  notifications: "Live notifications",
  discounts: "Discounts",
  whitelabel: "White-label portal",
};

export const RU_ENDPOINT_CADENCE_LABELS: Record<RuEndpointCadence, string> = {
  on_demand: "On demand",
  on_change: "On change (delta)",
  scheduled: "Scheduled",
  onboarding: "Onboarding only",
  inbound: "Inbound",
};

const spec = (
  id: string,
  label: string,
  family: RuEndpointFamily,
  cadence: RuEndpointCadence,
  mutating: boolean,
  note?: string,
  direction: "outbound" | "inbound" = "outbound",
): RuEndpointSpec => ({ id, label, family, cadence, direction, mutating, note });

export const RU_ENDPOINT_LIBRARY: RuEndpointSpec[] = [
  // ---- Accounts, users, company -------------------------------------------------------------
  spec("Pull_ListMyUsers_RQ", "List distribution accounts", "account", "on_demand", false),
  spec("Push_CreateUser_RQ", "Create sub-account", "account", "onboarding", true),
  spec("Push_ArchiveUser_RQ", "Archive sub-account", "account", "on_demand", true),
  spec("Push_PutOwner_RQ", "Put owner", "account", "onboarding", true),
  spec("Push_PutOwnerDetails_RQ", "Put owner details", "account", "on_change", true),
  spec("Push_PutCompanyDetails_RQ", "Put company details", "account", "onboarding", true),
  spec("Push_FillCompanyDetails_RQ", "Fill company details", "account", "onboarding", true),
  spec("Push_ChangeCurrency_RQ", "Change account currency", "account", "onboarding", true),
  spec("Pull_GetApiKeys_RQ", "List API keys", "account", "on_demand", false),
  spec("Push_CreateApiKey_RQ", "Create API key", "account", "on_demand", true),
  spec("Push_DeleteApiKey_RQ", "Delete API key", "account", "on_demand", true),

  // ---- Listing content ---------------------------------------------------------------------
  spec("Push_PutProperty_RQ", "Publish listing", "content", "on_change", true, "Delta-only static push"),
  spec("Pull_GetProperty_RQ", "Read one listing", "content", "on_demand", false),
  spec("Pull_ListProp_RQ", "List listings", "content", "on_demand", false),
  spec("Pull_ListOwnerProp_RQ", "List account listings", "content", "on_demand", false),
  spec("Pull_ListSpecProp_RQ", "List specific listings", "content", "on_demand", false),
  spec("Pull_ListCitiesProps_RQ", "List listings by city", "content", "on_demand", false),
  spec("Push_PutPropertyStatus_RQ", "Set listing status", "content", "on_change", true),
  spec("Push_SetPropertiesStatus_RQ", "Set listings status (bulk)", "content", "on_change", true),
  spec("Push_DeleteProperty_RQ", "Delete listing", "content", "on_demand", true),
  spec("Push_RemoveProperty_RQ", "Remove listing", "content", "on_demand", true),
  spec("Pull_ListBuildings_RQ", "List buildings", "content", "on_demand", false),
  spec("Pull_ListOwnerBuildings_RQ", "List account buildings", "content", "on_demand", false),
  spec("Pull_GetBuilding_RQ", "Read building", "content", "on_demand", false),
  spec("Push_PutBuilding_RQ", "Put building", "content", "on_demand", true),

  // ---- Availability, rates, restrictions ---------------------------------------------------
  spec("Push_PutAvbUnits_RQ", "Push availability", "ari", "on_change", true, "Blocks, stock and restrictions"),
  spec("Push_PutPrices_RQ", "Push prices", "ari", "on_change", true, "Rate-plan deltas only"),
  spec(
    "Pull_ListPropertyAvailabilityCalendar_RQ",
    "Read availability back",
    "ari",
    "onboarding",
    false,
    "Read-back only — ROL'OS is the source of truth",
  ),
  spec(
    "Pull_ListPropertyPrices_RQ",
    "Read prices back",
    "ari",
    "onboarding",
    false,
    "Opt-in read-back; must not run on a cadence",
  ),

  // ---- Discounts ---------------------------------------------------------------------------
  spec("Pull_ListLastMinuteDiscounts_RQ", "List last-minute discounts", "discounts", "on_demand", false),
  spec("Pull_ListLongStayDiscounts_RQ", "List long-stay discounts", "discounts", "on_demand", false),
  spec("Pull_ListPropertyLastMinuteDiscounts_RQ", "Listing last-minute discounts", "discounts", "onboarding", false),
  spec("Pull_ListPropertyLongStayDiscounts_RQ", "Listing long-stay discounts", "discounts", "onboarding", false),
  spec("Push_PutLastMinuteDiscounts_RQ", "Push last-minute discounts", "discounts", "on_change", true),
  spec("Push_PutLongStayDiscounts_RQ", "Push long-stay discounts", "discounts", "on_change", true),

  // ---- Reservations ------------------------------------------------------------------------
  spec("Push_PutConfirmedReservationMulti_RQ", "Push confirmed reservation", "bookings", "on_change", true),
  spec("Push_ModifyStay_RQ", "Modify stay", "bookings", "on_change", true),
  spec("Push_CancelReservation_RQ", "Cancel reservation", "bookings", "on_change", true),
  spec("Push_ConfirmReservation_RQ", "Confirm reservation", "bookings", "on_change", true),
  spec("Push_ConfirmRequest_RQ", "Confirm request", "bookings", "on_change", true),
  spec("Push_RejectRequest_RQ", "Reject / withdraw request", "bookings", "on_change", true),
  spec("Pull_ListReservations_RQ", "Reservation poll", "bookings", "scheduled", false, "Every 30 minutes"),
  spec("Pull_GetReservationByID_RQ", "Read reservation", "bookings", "on_demand", false),
  spec("Pull_GetLeads_RQ", "Lead poll", "bookings", "scheduled", false),

  // ---- Dictionaries -----------------------------------------------------------------------
  spec("Pull_ListAmenities_RQ", "Amenity dictionary", "dictionary", "on_demand", false),
  spec("Pull_ListCompositionRooms_RQ", "Composition room dictionary", "dictionary", "on_demand", false),
  spec("Pull_ListPropTypes_RQ", "Property-type dictionary", "dictionary", "on_demand", false),
  spec("Pull_ListCurrencies_RQ", "Currency dictionary", "dictionary", "on_demand", false),
  spec("Pull_ListCitiesAndCurrencies_RQ", "Cities & currencies", "dictionary", "on_demand", false),
  spec("Pull_ListCities_RQ", "City dictionary", "dictionary", "on_demand", false),
  spec("Pull_ListLocations_RQ", "Location dictionary", "dictionary", "on_demand", false),
  spec("Pull_ListLocationsBySearchString_RQ", "Location search", "dictionary", "on_demand", false),
  spec("Pull_ListDestinations_RQ", "Destination dictionary", "dictionary", "on_demand", false),
  spec("Pull_GetLocationByName_RQ", "Resolve location by name", "dictionary", "on_demand", false),
  spec("Pull_GetLocationByCoordinates_RQ", "Resolve location by coordinates", "dictionary", "on_demand", false),
  spec("Pull_ListSalesChannels_RQ", "Sales-channel dictionary", "dictionary", "on_demand", false),

  // ---- Live notification mechanism --------------------------------------------------------
  spec("Pull_ListLiveNotificationMechanismSubscriptions_RQ", "List notification subscriptions", "notifications", "on_demand", false),
  spec("Pull_ListLiveNotificationMechanismChangeTypes_RQ", "List notification change types", "notifications", "on_demand", false),
  spec("Push_PutLiveNotificationMechanismSubscriptions_RQ", "Subscribe to notifications", "notifications", "onboarding", true),
  spec("rentalsunited-api:subscribe_notifications", "Subscribe (orchestrated)", "notifications", "onboarding", true),

  // ---- White-label portal ----------------------------------------------------------------
  spec("WL_MasterToken", "White-label master token", "whitelabel", "on_demand", false),
  spec("WL_SubUserClientToken", "White-label client token", "whitelabel", "on_demand", false),
  spec("WL_API", "White-label API call", "whitelabel", "on_demand", false),
  spec("WL_CLIENT", "White-label client call", "whitelabel", "on_demand", false),

  // ---- Inbound notifications -------------------------------------------------------------
  spec("RLNM_ReservationRequest", "Inbound: reservation request", "bookings", "inbound", false, undefined, "inbound"),
  spec("RLNM_ReservationConfirmed", "Inbound: reservation confirmed", "bookings", "inbound", false, undefined, "inbound"),
  spec("RLNM_ReservationModified", "Inbound: reservation modified", "bookings", "inbound", false, undefined, "inbound"),
  spec("RLNM_ReservationCancelled", "Inbound: reservation cancelled", "bookings", "inbound", false, undefined, "inbound"),
];

const BY_ID = new Map(RU_ENDPOINT_LIBRARY.map((entry) => [entry.id, entry]));

/**
 * Resolves a logged action to its spec. Some rows log an internal orchestration action
 * (`rentalsunited-api:get_reservation_by_id`); those fall back to the wire verb they wrap so the
 * counters stay on one row per endpoint.
 */
export function resolveRuEndpoint(action: string | null | undefined): RuEndpointSpec | null {
  if (!action) return null;
  const direct = BY_ID.get(action);
  if (direct) return direct;
  const suffix = action.includes(":") ? action.slice(action.indexOf(":") + 1) : null;
  if (!suffix) return null;
  const normalised = suffix.replace(/[_-]/g, "").toLowerCase();
  for (const entry of RU_ENDPOINT_LIBRARY) {
    const verb = entry.id.replace(/^(Pull|Push)_/, "").replace(/_RQ$/, "").replace(/[_-]/g, "").toLowerCase();
    if (verb === normalised) return entry;
  }
  return null;
}

export function ruEndpointLabel(action: string | null | undefined): string {
  return resolveRuEndpoint(action)?.label ?? action ?? "Unknown";
}

export function ruEndpointFamily(action: string | null | undefined): RuEndpointFamily | null {
  return resolveRuEndpoint(action)?.family ?? null;
}
