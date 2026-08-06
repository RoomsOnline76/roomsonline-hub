/**
 * Shared CRM segmentation vocabulary.
 *
 * These values back the "Segmentation" panel on a reservation: market code,
 * distribution/communication channel and travel reason. They are stored as
 * plain text on `bookings` so channel-supplied values can pass through
 * unchanged, while the UI offers a consistent picklist.
 */

export const CRM_ACCOUNT_TYPES = [
  { value: "company", label: "Company" },
  { value: "travel_agent", label: "Travel Agent" },
  { value: "tour_operator", label: "Tour Operator" },
  { value: "source", label: "Source" },
] as const;

export type CrmAccountType = (typeof CRM_ACCOUNT_TYPES)[number]["value"];

export const crmAccountTypeLabel = (t: string | null | undefined): string =>
  CRM_ACCOUNT_TYPES.find((x) => x.value === t)?.label ?? "Account";

/** Market code — the highest-value segmentation dimension for revenue reporting. */
export const MARKET_SEGMENTS = [
  { value: "leisure_fit", label: "Leisure — Individual (FIT)" },
  { value: "leisure_group", label: "Leisure — Group" },
  { value: "corporate", label: "Corporate" },
  { value: "corporate_negotiated", label: "Corporate — Negotiated Rate" },
  { value: "government", label: "Government" },
  { value: "conference", label: "Conference / MICE" },
  { value: "wedding", label: "Wedding / Function" },
  { value: "wholesale", label: "Wholesale / Tour Series" },
  { value: "ota", label: "OTA" },
  { value: "staff_complimentary", label: "Staff / Complimentary" },
  { value: "long_stay", label: "Long Stay" },
] as const;

/** How the reservation reached us (distribution / communication channel). */
export const COMM_CHANNELS = [
  { value: "direct_website", label: "Direct — Website" },
  { value: "direct_phone", label: "Direct — Phone" },
  { value: "direct_email", label: "Direct — Email" },
  { value: "direct_walk_in", label: "Direct — Walk-in" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "channel_manager", label: "Channel Manager" },
  { value: "ota", label: "OTA" },
  { value: "gds", label: "GDS" },
  { value: "travel_agent", label: "Travel Agent" },
  { value: "tour_operator", label: "Tour Operator" },
  { value: "corporate_portal", label: "Corporate Portal" },
] as const;

export const labelFor = (
  list: ReadonlyArray<{ value: string; label: string }>,
  value: string | null | undefined,
): string => (value ? list.find((x) => x.value === value)?.label ?? value : "—");
