// Complete catalog of ROL'OS API actions with schemas and documentation

export interface ApiParam {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export interface ApiAction {
  action: string;
  category: string;
  title: string;
  description: string;
  params: ApiParam[];
  responseExample: string;
  curlExample?: string;
  jsExample?: string;
  phpExample?: string;
}

export const API_CATEGORIES = [
  { key: "system", label: "System", icon: "⚙️" },
  { key: "availability", label: "Availability & Inventory", icon: "📅" },
  { key: "reservations", label: "Reservations", icon: "🛎️" },
  { key: "rooms", label: "Rooms & Room Types", icon: "🏠" },
  { key: "rates", label: "Rates & Pricing", icon: "💰" },
  { key: "guests", label: "Guest CRM", icon: "👤" },
  { key: "folios", label: "Folios & Billing", icon: "📄" },
  { key: "housekeeping", label: "Housekeeping", icon: "🧹" },
  { key: "charges", label: "Service Charges", icon: "🧾" },
  { key: "inventory", label: "Inventory Calendar", icon: "📊" },
  { key: "metrics", label: "Metrics & Analytics", icon: "📈" },
  { key: "config", label: "Configuration", icon: "🔧" },
] as const;

const BASE_URL = "https://YOUR_PROJECT.supabase.co/functions/v1/roomsonline-pms-api";

function curl(action: string, extra: string = "") {
  return `curl -X POST "${BASE_URL}" \\
  -H "Content-Type: application/json" \\
  -H "x-api-key: YOUR_API_KEY" \\
  -d '{
    "action": "${action}",
    "property_id": "PROPERTY_UUID"${extra ? ",\\n    " + extra : ""}
  }'`;
}

function js(action: string, extra: string = "") {
  return `const response = await fetch(API_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-api-key": API_KEY,
  },
  body: JSON.stringify({
    action: "${action}",
    property_id: PROPERTY_ID${extra ? ",\\n    " + extra : ""}
  }),
});
const data = await response.json();`;
}

function php(action: string, extra: string = "") {
  return `$response = wp_remote_post($api_url, [
  'headers' => [
    'Content-Type'  => 'application/json',
    'x-api-key'     => $api_key,
  ],
  'body' => json_encode([
    'action'      => '${action}',
    'property_id' => $property_id${extra ? ",\\n    " + extra : ""}
  ]),
]);
$data = json_decode(wp_remote_retrieve_body($response), true);`;
}

export const API_ACTIONS: ApiAction[] = [
  // ─── System ──────────────────────────────────────────────────────────
  {
    action: "health_check",
    category: "system",
    title: "Health Check",
    description: "Verify the API is reachable and your credentials are valid. Returns server time and version info.",
    params: [],
    responseExample: JSON.stringify({
      success: true,
      data: { status: "healthy", version: "3.0.0", server_time: "2026-03-20T12:00:00Z" },
      source: "rolos_api",
      action: "health_check"
    }, null, 2),
    curlExample: curl("health_check"),
    jsExample: js("health_check"),
    phpExample: php("health_check"),
  },
  {
    action: "get_capabilities",
    category: "system",
    title: "Get Capabilities",
    description: "Returns the full list of supported API actions and their categories. Use this to discover what your integration can do.",
    params: [],
    responseExample: JSON.stringify({
      success: true,
      data: { actions: ["health_check", "fetch_availability", "...40+ actions"], version: "3.0.0" },
      source: "rolos_api",
      action: "get_capabilities"
    }, null, 2),
    curlExample: curl("get_capabilities"),
    jsExample: js("get_capabilities"),
    phpExample: php("get_capabilities"),
  },

  // ─── Availability & Inventory ────────────────────────────────────────
  {
    action: "fetch_availability",
    category: "availability",
    title: "Fetch Availability",
    description: "Returns real-time room availability for a given date range. Includes room types, rates, and inventory counts.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "check_in", type: "string (YYYY-MM-DD)", required: true, description: "Check-in date" },
      { name: "check_out", type: "string (YYYY-MM-DD)", required: true, description: "Check-out date" },
      { name: "adults", type: "number", required: false, description: "Number of adults (default 2)" },
      { name: "children", type: "number", required: false, description: "Number of children (default 0)" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: {
        available_rooms: [
          { room_type_id: "uuid", name: "Deluxe Suite", available_units: 3, rate_per_night: 2500, currency: "ZAR" }
        ],
        check_in: "2026-04-01", check_out: "2026-04-05", nights: 4
      }
    }, null, 2),
    curlExample: curl("fetch_availability", '"check_in": "2026-04-01",\\n    "check_out": "2026-04-05"'),
    jsExample: js("fetch_availability", 'check_in: "2026-04-01",\\n    check_out: "2026-04-05"'),
    phpExample: php("fetch_availability", "'check_in' => '2026-04-01',\\n    'check_out' => '2026-04-05'"),
  },
  {
    action: "set_availability",
    category: "availability",
    title: "Set Availability",
    description: "Manually override availability for a room type on specific dates. Used for block-outs, allotments, and inventory overrides.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "room_type_id", type: "UUID", required: true, description: "Room type to update" },
      { name: "date_from", type: "string (YYYY-MM-DD)", required: true, description: "Start date" },
      { name: "date_to", type: "string (YYYY-MM-DD)", required: true, description: "End date" },
      { name: "available_units", type: "number", required: true, description: "Units available" },
    ],
    responseExample: JSON.stringify({ success: true, data: { updated_dates: 5 } }, null, 2),
    curlExample: curl("set_availability", '"room_type_id": "UUID",\\n    "date_from": "2026-04-01",\\n    "date_to": "2026-04-05",\\n    "available_units": 2'),
  },
  {
    action: "check_inventory",
    category: "inventory",
    title: "Check Inventory",
    description: "Query the inventory calendar for a room type across a date range. Returns per-day unit counts, restrictions, and rate overrides.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "room_type_id", type: "UUID", required: true, description: "Room type to check" },
      { name: "date_from", type: "string (YYYY-MM-DD)", required: true, description: "Start date" },
      { name: "date_to", type: "string (YYYY-MM-DD)", required: true, description: "End date" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { days: [{ date: "2026-04-01", available: 3, min_stay: 2, rate_override: null }] }
    }, null, 2),
  },
  {
    action: "update_inventory",
    category: "inventory",
    title: "Update Inventory",
    description: "Bulk update inventory calendar entries. Set availability, minimum stay, close-outs, and rate overrides per day.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "room_type_id", type: "UUID", required: true, description: "Room type to update" },
      { name: "updates", type: "array", required: true, description: "Array of { date, available, min_stay, closed }" },
    ],
    responseExample: JSON.stringify({ success: true, data: { updated: 7 } }, null, 2),
  },
  {
    action: "backfill_inventory",
    category: "inventory",
    title: "Backfill Inventory",
    description: "Auto-populate the inventory calendar from room type defaults for a given future window. Fills gaps where no manual override exists.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "room_type_id", type: "UUID", required: false, description: "Specific room type (or all)" },
      { name: "days_ahead", type: "number", required: false, description: "Days to backfill (default 365)" },
    ],
    responseExample: JSON.stringify({ success: true, data: { created: 365, skipped: 42 } }, null, 2),
  },

  // ─── Reservations ─────────────────────────────────────────────────────
  {
    action: "get_reservations",
    category: "reservations",
    title: "Get Reservations",
    description: "Retrieve bookings for a property. Filter by date range, status, guest name, or booking channel.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "check_in_from", type: "string (YYYY-MM-DD)", required: false, description: "Filter by check-in date start" },
      { name: "check_in_to", type: "string (YYYY-MM-DD)", required: false, description: "Filter by check-in date end" },
      { name: "status", type: "string", required: false, description: "Filter by status: confirmed, pending, cancelled, checked_in, checked_out" },
      { name: "limit", type: "number", required: false, description: "Max results (default 50)" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: {
        reservations: [{
          id: "uuid", guest_name: "Themba Nkosi", check_in_date: "2026-04-01",
          check_out_date: "2026-04-05", status: "confirmed", total_price: 10000, adults: 2
        }],
        total: 1
      }
    }, null, 2),
    curlExample: curl("get_reservations", '"status": "confirmed"'),
    jsExample: js("get_reservations", 'status: "confirmed"'),
    phpExample: php("get_reservations", "'status' => 'confirmed'"),
  },
  {
    action: "create_reservation",
    category: "reservations",
    title: "Create Reservation",
    description: "Create a new booking. Validates availability, calculates pricing, and returns the confirmed reservation with a folio.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "room_type_id", type: "UUID", required: true, description: "Room type to book" },
      { name: "check_in_date", type: "string (YYYY-MM-DD)", required: true, description: "Check-in date" },
      { name: "check_out_date", type: "string (YYYY-MM-DD)", required: true, description: "Check-out date" },
      { name: "guest_name", type: "string", required: true, description: "Guest full name" },
      { name: "guest_email", type: "string", required: true, description: "Guest email address" },
      { name: "guest_phone", type: "string", required: false, description: "Guest phone number" },
      { name: "adults", type: "number", required: false, description: "Number of adults (default 2)" },
      { name: "children", type: "number", required: false, description: "Number of children (default 0)" },
      { name: "special_requests", type: "string", required: false, description: "Special requests or notes" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: {
        reservation: { id: "uuid", status: "confirmed", total_price: 10000 },
        folio: { id: "uuid", balance: 10000 }
      }
    }, null, 2),
    curlExample: curl("create_reservation", '"room_type_id": "UUID",\\n    "check_in_date": "2026-04-01",\\n    "check_out_date": "2026-04-05",\\n    "guest_name": "Themba Nkosi",\\n    "guest_email": "themba@example.com",\\n    "adults": 2'),
  },
  {
    action: "modify_reservation",
    category: "reservations",
    title: "Modify Reservation",
    description: "Update dates, room type, guest count, or special requests on an existing reservation. Recalculates pricing automatically.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "reservation_id", type: "UUID", required: true, description: "Reservation to modify" },
      { name: "check_in_date", type: "string (YYYY-MM-DD)", required: false, description: "New check-in date" },
      { name: "check_out_date", type: "string (YYYY-MM-DD)", required: false, description: "New check-out date" },
      { name: "room_type_id", type: "UUID", required: false, description: "New room type" },
      { name: "adults", type: "number", required: false, description: "Updated adult count" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { reservation: { id: "uuid", status: "confirmed", total_price: 12500 } }
    }, null, 2),
  },
  {
    action: "cancel_reservation",
    category: "reservations",
    title: "Cancel Reservation",
    description: "Cancel an existing reservation. Releases inventory and records the cancellation reason.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "reservation_id", type: "UUID", required: true, description: "Reservation to cancel" },
      { name: "reason", type: "string", required: false, description: "Cancellation reason" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { reservation: { id: "uuid", status: "cancelled" } }
    }, null, 2),
  },
  {
    action: "check_in",
    category: "reservations",
    title: "Check In Guest",
    description: "Check in a guest. Updates room status to occupied, assigns physical room if not already assigned, and records check-in time.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "reservation_id", type: "UUID", required: true, description: "Reservation to check in" },
      { name: "room_ids", type: "string[]", required: false, description: "Physical room IDs to assign" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { status: "checked_in", check_in_time: "2026-04-01T14:00:00Z", rooms_assigned: ["Room 101"] }
    }, null, 2),
  },
  {
    action: "check_out",
    category: "reservations",
    title: "Check Out Guest",
    description: "Check out a guest. Finalizes the folio, releases the room, triggers housekeeping task creation, and records check-out time.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "reservation_id", type: "UUID", required: true, description: "Reservation to check out" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { status: "checked_out", check_out_time: "2026-04-05T10:00:00Z", folio_balance: 0 }
    }, null, 2),
  },

  // ─── Rooms ──────────────────────────────────────────────────────────────
  {
    action: "get_room_types",
    category: "rooms",
    title: "Get Room Types (Adapter)",
    description: "Returns room types from the connected PMS adapter (Hostfully, Benson, or native ROL'OS). Normalised output regardless of source.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { room_types: [{ id: "uuid", name: "Deluxe Suite", max_occupancy: 4, default_rate: 2500 }] }
    }, null, 2),
    curlExample: curl("get_room_types"),
    jsExample: js("get_room_types"),
  },
  {
    action: "get_rolos_room_types",
    category: "rooms",
    title: "Get ROL'OS Room Types",
    description: "Returns room types from the native ROL'OS PMS. Includes full configuration: occupancy, amenities, images, and linked rate plans.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { room_types: [{ id: "uuid", name: "Garden Suite", max_occupancy: 3, default_rate: 1800, is_active: true }] }
    }, null, 2),
  },
  {
    action: "create_rolos_room_type",
    category: "rooms",
    title: "Create Room Type",
    description: "Create a new room type in the native ROL'OS PMS. Define name, occupancy limits, amenities, and base pricing.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "name", type: "string", required: true, description: "Room type name" },
      { name: "max_occupancy", type: "number", required: true, description: "Maximum guest count" },
      { name: "default_rate", type: "number", required: false, description: "Default nightly rate" },
      { name: "description", type: "string", required: false, description: "Room type description" },
    ],
    responseExample: JSON.stringify({ success: true, data: { id: "uuid", name: "Garden Suite" } }, null, 2),
  },
  {
    action: "update_rolos_room_type",
    category: "rooms",
    title: "Update Room Type",
    description: "Update an existing room type's configuration — name, occupancy, rate, amenities, or active status.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "room_type_id", type: "UUID", required: true, description: "Room type to update" },
      { name: "name", type: "string", required: false, description: "Updated name" },
      { name: "max_occupancy", type: "number", required: false, description: "Updated occupancy" },
      { name: "default_rate", type: "number", required: false, description: "Updated rate" },
      { name: "is_active", type: "boolean", required: false, description: "Active status" },
    ],
    responseExample: JSON.stringify({ success: true, data: { id: "uuid", name: "Garden Suite", is_active: true } }, null, 2),
  },
  {
    action: "get_physical_rooms",
    category: "rooms",
    title: "Get Physical Rooms",
    description: "List all physical rooms (individual units) at a property. Returns room numbers, names, floor, status, and linked room type.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { rooms: [{ id: "uuid", room_number: "101", room_name: "Protea", floor: "1", status: "available" }] }
    }, null, 2),
  },
  {
    action: "create_physical_room",
    category: "rooms",
    title: "Create Physical Room",
    description: "Add a new physical room unit to a property. Link it to a room type, set floor, and initial status.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "room_type_id", type: "UUID", required: true, description: "Linked room type" },
      { name: "room_number", type: "string", required: true, description: "Room number" },
      { name: "room_name", type: "string", required: false, description: "Room name" },
      { name: "floor", type: "string", required: false, description: "Floor level" },
    ],
    responseExample: JSON.stringify({ success: true, data: { id: "uuid", room_number: "102" } }, null, 2),
  },
  {
    action: "update_room_status",
    category: "rooms",
    title: "Update Room Status",
    description: "Change a physical room's operational status. Valid statuses: available, occupied, maintenance, blocked, dirty, inspected.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "room_id", type: "UUID", required: true, description: "Physical room to update" },
      { name: "status", type: "string", required: true, description: "New status" },
    ],
    responseExample: JSON.stringify({ success: true, data: { id: "uuid", status: "maintenance" } }, null, 2),
  },

  // ─── Rates ──────────────────────────────────────────────────────────────
  {
    action: "get_rate_types",
    category: "rates",
    title: "Get Rate Types (Adapter)",
    description: "Returns rate types from the connected PMS adapter. Normalised output regardless of PMS source.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { rate_types: [{ id: "uuid", name: "Standard", base_rate: 2500 }] }
    }, null, 2),
  },
  {
    action: "set_rates",
    category: "rates",
    title: "Set Rates",
    description: "Update rate pricing for a room type across a date range. Used by channel managers and revenue management tools.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "room_type_id", type: "UUID", required: true, description: "Room type" },
      { name: "date_from", type: "string (YYYY-MM-DD)", required: true, description: "Start date" },
      { name: "date_to", type: "string (YYYY-MM-DD)", required: true, description: "End date" },
      { name: "rate", type: "number", required: true, description: "Nightly rate" },
    ],
    responseExample: JSON.stringify({ success: true, data: { updated_dates: 14 } }, null, 2),
  },
  {
    action: "get_rate_plans",
    category: "rates",
    title: "Get Rate Plans",
    description: "List all rate plans for a property. Rate plans define pricing strategies with multipliers, minimum stay rules, and meal inclusions.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { rate_plans: [{ id: "uuid", name: "Rack Rate", code: "RACK", min_stay: 1, is_active: true }] }
    }, null, 2),
  },
  {
    action: "create_rate_plan",
    category: "rates",
    title: "Create Rate Plan",
    description: "Create a new rate plan with pricing multiplier, minimum stay, and configuration.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "name", type: "string", required: true, description: "Rate plan name" },
      { name: "code", type: "string", required: true, description: "Rate plan code (e.g. RACK, BAR)" },
      { name: "min_stay", type: "number", required: false, description: "Minimum stay nights" },
      { name: "multiplier", type: "number", required: false, description: "Rate multiplier (default 1.0)" },
    ],
    responseExample: JSON.stringify({ success: true, data: { id: "uuid", name: "Rack Rate", code: "RACK" } }, null, 2),
  },
  {
    action: "get_rate_seasons",
    category: "rates",
    title: "Get Rate Seasons",
    description: "Retrieve seasonal pricing rules for a property. Seasons define date-range multipliers with day-of-week granularity.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { seasons: [{ id: "uuid", name: "Peak Summer", start_date: "2026-12-15", end_date: "2027-01-15", multiplier: 1.5 }] }
    }, null, 2),
  },
  {
    action: "create_rate_season",
    category: "rates",
    title: "Create Rate Season",
    description: "Define a new pricing season with date range, multiplier, and optional day-of-week overrides.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "name", type: "string", required: true, description: "Season name" },
      { name: "start_date", type: "string (YYYY-MM-DD)", required: true, description: "Season start" },
      { name: "end_date", type: "string (YYYY-MM-DD)", required: true, description: "Season end" },
      { name: "multiplier", type: "number", required: true, description: "Price multiplier" },
    ],
    responseExample: JSON.stringify({ success: true, data: { id: "uuid", name: "Peak Summer" } }, null, 2),
  },
  {
    action: "set_rate_prices",
    category: "rates",
    title: "Set Rate Prices",
    description: "Set per-room-type pricing for a specific rate plan and date range. Granular pricing control for revenue management.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "rate_plan_id", type: "UUID", required: true, description: "Rate plan" },
      { name: "room_type_id", type: "UUID", required: true, description: "Room type" },
      { name: "date_from", type: "string (YYYY-MM-DD)", required: true, description: "Start date" },
      { name: "date_to", type: "string (YYYY-MM-DD)", required: true, description: "End date" },
      { name: "price", type: "number", required: true, description: "Nightly price" },
    ],
    responseExample: JSON.stringify({ success: true, data: { updated: 14 } }, null, 2),
  },

  // ─── Guest CRM ────────────────────────────────────────────────────────
  {
    action: "get_guest_profiles",
    category: "guests",
    title: "List Guest Profiles",
    description: "Search and list guest profiles for a property. Filter by name, email, or VIP status.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "search", type: "string", required: false, description: "Search by name or email" },
      { name: "limit", type: "number", required: false, description: "Max results (default 50)" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { guests: [{ id: "uuid", full_name: "Lerato Mokoena", email: "lerato@example.com", total_stays: 5 }], total: 1 }
    }, null, 2),
    curlExample: curl("get_guest_profiles", '"search": "Lerato"'),
  },
  {
    action: "get_guest_profile",
    category: "guests",
    title: "Get Guest Profile",
    description: "Retrieve a single guest profile with full details: contact info, stay history, preferences, and notes.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "guest_id", type: "UUID", required: true, description: "Guest profile ID" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { id: "uuid", full_name: "Lerato Mokoena", email: "lerato@example.com", phone: "+27...", total_stays: 5, preferences: {} }
    }, null, 2),
  },
  {
    action: "create_guest_profile",
    category: "guests",
    title: "Create Guest Profile",
    description: "Create a new guest profile in the CRM. Automatically de-duplicates by email if a profile already exists.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "full_name", type: "string", required: true, description: "Guest full name" },
      { name: "email", type: "string", required: true, description: "Email address" },
      { name: "phone", type: "string", required: false, description: "Phone number" },
      { name: "nationality", type: "string", required: false, description: "Country code" },
    ],
    responseExample: JSON.stringify({ success: true, data: { id: "uuid", full_name: "Lerato Mokoena" } }, null, 2),
  },
  {
    action: "update_guest_profile",
    category: "guests",
    title: "Update Guest Profile",
    description: "Update guest details — contact information, preferences, VIP status, or notes.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "guest_id", type: "UUID", required: true, description: "Guest to update" },
      { name: "full_name", type: "string", required: false, description: "Updated name" },
      { name: "email", type: "string", required: false, description: "Updated email" },
      { name: "phone", type: "string", required: false, description: "Updated phone" },
    ],
    responseExample: JSON.stringify({ success: true, data: { id: "uuid", full_name: "Lerato Mokoena" } }, null, 2),
  },

  // ─── Folios ────────────────────────────────────────────────────────────
  {
    action: "get_folio",
    category: "folios",
    title: "Get Folio",
    description: "Retrieve the financial folio for a reservation. Includes all charges, payments, adjustments, and running balance.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "reservation_id", type: "UUID", required: true, description: "Reservation ID" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: {
        folio: { id: "uuid", total_charges: 12500, total_payments: 5000, balance: 7500 },
        line_items: [
          { description: "Room charge - Deluxe Suite x4 nights", amount: 10000, type: "charge" },
          { description: "Spa treatment", amount: 2500, type: "charge" },
          { description: "Deposit payment", amount: -5000, type: "payment" }
        ]
      }
    }, null, 2),
  },
  {
    action: "add_folio_charge",
    category: "folios",
    title: "Add Folio Charge",
    description: "Post a charge to a guest's folio — room service, minibar, spa, extras, or custom charges.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "reservation_id", type: "UUID", required: true, description: "Reservation ID" },
      { name: "description", type: "string", required: true, description: "Charge description" },
      { name: "amount", type: "number", required: true, description: "Charge amount" },
      { name: "category", type: "string", required: false, description: "Charge category (room, food, spa, etc.)" },
    ],
    responseExample: JSON.stringify({ success: true, data: { folio_id: "uuid", new_balance: 15000 } }, null, 2),
  },
  {
    action: "process_folio_payment",
    category: "folios",
    title: "Process Folio Payment",
    description: "Record a payment against a guest folio. Supports cash, card, EFT, and third-party payment references.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "reservation_id", type: "UUID", required: true, description: "Reservation ID" },
      { name: "amount", type: "number", required: true, description: "Payment amount" },
      { name: "method", type: "string", required: true, description: "Payment method: cash, card, eft, other" },
      { name: "reference", type: "string", required: false, description: "Payment reference number" },
    ],
    responseExample: JSON.stringify({ success: true, data: { folio_id: "uuid", new_balance: 0, status: "settled" } }, null, 2),
  },

  // ─── Housekeeping ──────────────────────────────────────────────────────
  {
    action: "get_housekeeping_board",
    category: "housekeeping",
    title: "Get Housekeeping Board",
    description: "Returns today's housekeeping task board. Lists all rooms with their cleaning status, assigned staff, and priority.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "date", type: "string (YYYY-MM-DD)", required: false, description: "Date to query (default today)" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: {
        tasks: [
          { room: "Room 101", status: "dirty", priority: "high", assigned_to: "Nomsa M.", type: "checkout_clean" },
          { room: "Room 204", status: "inspected", priority: "normal", assigned_to: "James K.", type: "stayover" }
        ]
      }
    }, null, 2),
  },
  {
    action: "assign_housekeeping_task",
    category: "housekeeping",
    title: "Assign Housekeeping Task",
    description: "Assign a cleaning task to a staff member. Set priority and task type (checkout clean, stayover, deep clean).",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "task_id", type: "UUID", required: true, description: "Housekeeping task ID" },
      { name: "staff_id", type: "UUID", required: true, description: "Staff member to assign" },
      { name: "priority", type: "string", required: false, description: "Priority: low, normal, high, urgent" },
    ],
    responseExample: JSON.stringify({ success: true, data: { task_id: "uuid", assigned_to: "Nomsa M.", status: "assigned" } }, null, 2),
  },
  {
    action: "complete_housekeeping_task",
    category: "housekeeping",
    title: "Complete Housekeeping Task",
    description: "Mark a housekeeping task as completed. Updates the room status to clean/inspected.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "task_id", type: "UUID", required: true, description: "Task to complete" },
      { name: "notes", type: "string", required: false, description: "Completion notes" },
    ],
    responseExample: JSON.stringify({ success: true, data: { task_id: "uuid", status: "completed", room_status: "clean" } }, null, 2),
  },

  // ─── Service Charges ──────────────────────────────────────────────────
  {
    action: "apply_service_charges",
    category: "charges",
    title: "Apply Service Charges",
    description: "Batch-apply service charges to a booking. Charges are calculated based on presets (per night, per person, flat fee).",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "booking_id", type: "UUID", required: true, description: "Booking to charge" },
      { name: "charges", type: "array", required: true, description: "Array of { preset_id, quantity, override_amount? }" },
    ],
    responseExample: JSON.stringify({ success: true, data: { applied: 3, total_added: 1500 } }, null, 2),
  },
  {
    action: "get_booking_charges",
    category: "charges",
    title: "Get Booking Charges",
    description: "List all service charges applied to a booking. Includes charge type, amount, calculation method, and timestamps.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "booking_id", type: "UUID", required: true, description: "Booking ID" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: { charges: [{ id: "uuid", name: "Tourism Levy", amount: 150, method: "per_night" }] }
    }, null, 2),
  },
  {
    action: "process_checkout_refunds",
    category: "charges",
    title: "Process Checkout Refunds",
    description: "Process refunds during checkout. Calculates eligible refund amounts and records the transaction.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "booking_id", type: "UUID", required: true, description: "Booking ID" },
      { name: "refund_items", type: "array", required: true, description: "Array of { charge_id, amount }" },
    ],
    responseExample: JSON.stringify({ success: true, data: { refunded: 2, total_refund: 500 } }, null, 2),
  },

  // ─── Metrics ──────────────────────────────────────────────────────────
  {
    action: "get_daily_metrics",
    category: "metrics",
    title: "Get Daily Metrics",
    description: "Returns the daily operational snapshot: occupancy %, ADR, RevPAR, arrivals, departures, and revenue totals.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "date", type: "string (YYYY-MM-DD)", required: false, description: "Date to query (default today)" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: {
        date: "2026-03-20",
        occupancy_percent: 78,
        adr: 2150,
        revpar: 1677,
        arrivals: 4,
        departures: 2,
        total_revenue: 28600,
        rooms_sold: 14,
        rooms_available: 18
      }
    }, null, 2),
    curlExample: curl("get_daily_metrics", '"date": "2026-03-20"'),
    jsExample: js("get_daily_metrics", 'date: "2026-03-20"'),
  },

  // ─── Configuration ──────────────────────────────────────────────────
  {
    action: "get_ui_config",
    category: "config",
    title: "Get UI Configuration",
    description: "Returns the merged UI configuration (global defaults + property overrides) for Gutenberg blocks, WP admin dashboard, embed widgets, and Smart Book buttons.",
    params: [
      { name: "property_id", type: "UUID", required: true, description: "Property identifier" },
      { name: "component_type", type: "string", required: false, description: "Filter by component: gutenberg_blocks, wp_admin, embed_widgets, smart_button, api_gates" },
    ],
    responseExample: JSON.stringify({
      success: true,
      data: {
        gutenberg_blocks: { booking_widget: { enabled: true, default_color: "#2563EB" } },
        wp_admin: { metrics_tab: true, housekeeping_tab: true },
        embed_widgets: { calendar_months: 2 },
        smart_button: { default_cta: "Book Now" }
      }
    }, null, 2),
  },
];

// Helper to get actions by category
export function getActionsByCategory(category: string): ApiAction[] {
  return API_ACTIONS.filter(a => a.category === category);
}

// Helper to search actions
export function searchActions(query: string): ApiAction[] {
  const q = query.toLowerCase();
  return API_ACTIONS.filter(a =>
    a.title.toLowerCase().includes(q) ||
    a.action.toLowerCase().includes(q) ||
    a.description.toLowerCase().includes(q)
  );
}
