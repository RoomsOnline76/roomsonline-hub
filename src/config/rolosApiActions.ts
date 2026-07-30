/**
 * Single source of truth for the ROL'OS Native PMS REST API surface.
 *
 * Both the API documentation viewer and the Admin → API UI Configurator
 * (API Gates) read from this catalogue so the two can never drift from the
 * actions actually implemented in `supabase/functions/roomsonline-pms-api`.
 */

export const ROLOS_API_VERSION = "v1";

export interface RolosApiAction {
  /** Transport verb — the adapter is uniformly POST + JSON body. */
  method: "POST";
  /** `action` value sent in the JSON body. */
  action: string;
  /** Short human description used in the docs viewer. */
  desc: string;
}

export interface RolosApiGroup {
  title: string;
  actions: RolosApiAction[];
}

export const ROLOS_API_GROUPS: RolosApiGroup[] = [
  {
    title: "Availability & Rates",
    actions: [
      { method: "POST", action: "fetch_availability", desc: "Get room availability for a date range" },
      { method: "POST", action: "get_room_types", desc: "List all room types for a property" },
      { method: "POST", action: "get_rate_types", desc: "List rate types (rack, promo, etc.)" },
      { method: "POST", action: "set_availability", desc: "Update availability for a room type" },
      { method: "POST", action: "set_rates", desc: "Set rates for a room/rate type combo" },
      { method: "POST", action: "set_rate_prices", desc: "Set tiered occupancy prices on a rate plan" },
      { method: "POST", action: "get_rate_plans", desc: "List ROL'OS rate plans" },
      { method: "POST", action: "create_rate_plan", desc: "Create a rate plan" },
      { method: "POST", action: "get_rate_seasons", desc: "List rate seasons" },
      { method: "POST", action: "create_rate_season", desc: "Create a rate season" },
    ],
  },
  {
    title: "Reservations",
    actions: [
      { method: "POST", action: "get_reservations", desc: "List reservations with filters" },
      { method: "POST", action: "create_reservation", desc: "Create a new reservation" },
      { method: "POST", action: "modify_reservation", desc: "Modify an existing reservation" },
      { method: "POST", action: "cancel_reservation", desc: "Cancel a reservation" },
    ],
  },
  {
    title: "Rooms & Room Types",
    actions: [
      { method: "POST", action: "get_physical_rooms", desc: "List physical rooms/units" },
      { method: "POST", action: "create_physical_room", desc: "Create a physical room/unit" },
      { method: "POST", action: "update_room_status", desc: "Update housekeeping/occupancy status of a room" },
      { method: "POST", action: "get_rolos_room_types", desc: "List ROL'OS native room types" },
      { method: "POST", action: "create_rolos_room_type", desc: "Create a ROL'OS room type" },
      { method: "POST", action: "update_rolos_room_type", desc: "Update a ROL'OS room type" },
    ],
  },
  {
    title: "Inventory",
    actions: [
      { method: "POST", action: "update_inventory", desc: "Set rooms-to-sell for a date range" },
      { method: "POST", action: "check_inventory", desc: "Check inventory calendar coverage" },
      { method: "POST", action: "backfill_inventory", desc: "Backfill missing inventory calendar rows" },
    ],
  },
  {
    title: "Guest CRM",
    actions: [
      { method: "POST", action: "get_guest_profiles", desc: "List guest profiles" },
      { method: "POST", action: "get_guest_profile", desc: "Get a single guest profile" },
      { method: "POST", action: "create_guest_profile", desc: "Create a guest profile" },
      { method: "POST", action: "update_guest_profile", desc: "Update guest profile" },
    ],
  },
  {
    title: "Operations",
    actions: [
      { method: "POST", action: "check_in", desc: "Check in a guest" },
      { method: "POST", action: "check_out", desc: "Check out a guest" },
      { method: "POST", action: "get_housekeeping_board", desc: "Get housekeeping task board" },
      { method: "POST", action: "assign_housekeeping_task", desc: "Assign a housekeeping task to staff" },
      { method: "POST", action: "complete_housekeeping_task", desc: "Mark a housekeeping task complete" },
      { method: "POST", action: "get_daily_metrics", desc: "Get daily operational metrics" },
    ],
  },
  {
    title: "Folios & Charges",
    actions: [
      { method: "POST", action: "get_folio", desc: "Get folio for a booking" },
      { method: "POST", action: "add_folio_charge", desc: "Add a charge to a folio" },
      { method: "POST", action: "process_folio_payment", desc: "Process payment on a folio" },
      { method: "POST", action: "apply_service_charges", desc: "Apply service charges" },
      { method: "POST", action: "process_checkout_refunds", desc: "Process refunds due at check-out" },
      { method: "POST", action: "get_booking_charges", desc: "List charges attached to a booking" },
    ],
  },
  {
    title: "Webhooks",
    actions: [
      { method: "POST", action: "subscribe_webhook", desc: "Subscribe to event webhooks" },
      { method: "POST", action: "unsubscribe_webhook", desc: "Unsubscribe from webhooks" },
      { method: "POST", action: "list_webhook_subscriptions", desc: "List webhook subscriptions" },
      { method: "POST", action: "test_webhook", desc: "Send a test webhook ping" },
      { method: "POST", action: "get_webhook_logs", desc: "Read webhook delivery logs" },
    ],
  },
  {
    title: "Static Content",
    actions: [
      { method: "POST", action: "get_property_profile", desc: "Property profile (descriptions, amenities, geo)" },
      { method: "POST", action: "get_cancellation_policies", desc: "Cancellation policies + linked rate plans" },
      { method: "POST", action: "get_reservation_policies", desc: "Reservation (deposit/guarantee) policies + linked rate plans" },
      { method: "POST", action: "get_payment_methods", desc: "Accepted payment methods (provider display name, logo_key, currencies)" },
      { method: "POST", action: "get_contact_details", desc: "Contact details for the property (internal shape)" },
      { method: "POST", action: "get_property_contact_details", desc: "Public contact details (reception, reservations, landlord)" },
    ],
  },
  {
    title: "System",
    actions: [
      { method: "POST", action: "get_capabilities", desc: "Get adapter capabilities" },
      { method: "POST", action: "health_check", desc: "Health check endpoint" },
      { method: "POST", action: "get_ui_config", desc: "Get UI configuration" },
    ],
  },
];

/** Group title → action names. Used by the API Gates configurator. */
export const ROLOS_API_ACTION_GROUPS: Record<string, string[]> = Object.fromEntries(
  ROLOS_API_GROUPS.map((g) => [g.title, g.actions.map((a) => a.action)]),
);

export const ROLOS_API_ACTION_COUNT = ROLOS_API_GROUPS.reduce((n, g) => n + g.actions.length, 0);
