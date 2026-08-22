// Canonical catalogue of the pasted-image slots the revenue team fills in.
// Mirrors src/lib/reportMediaSlots.ts — keep both in step.
//
// The catalogue is source-aware: NightsBridge, OPERA and PROTEL final reports
// use different section headings, so the slots (and therefore the printed page
// headers and the paste-in cards) follow the run's `source_type`.

export interface MediaSlotDefinition {
  key: string;
  /** Page the slot prints on. Slots sharing a section share a page. */
  section: string;
  title: string;
  hint: string;
  layout: "full" | "half";
  /** Each image prints as its own slide (own page + own organizer row). */
  explode?: boolean;
}

export type ReportSourceType = "nightsbridge" | "opera" | "protel";

export const REPORT_SOURCE_TYPES: readonly ReportSourceType[] = [
  "nightsbridge",
  "opera",
  "protel",
] as const;

export const normalizeSourceType = (value: unknown): ReportSourceType => {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw.includes("opera")) return "opera";
  if (raw.includes("protel")) return "protel";
  return "nightsbridge";
};

/** NightsBridge booking-engine page (unchanged from the original catalogue). */
const NIGHTSBRIDGE_SLOTS: MediaSlotDefinition[] = [
  {
    key: "channel_hits",
    section: "Nightsbridge Performance | Hits",
    title: "Booking engine performance / hits",
    hint: "Nightsbridge hits and enquiry graph for the period.",
    layout: "full",
  },
  {
    key: "booking_totals",
    section: "Nightsbridge Performance | Hits",
    title: "Booking totals — last year vs this year",
    hint: "The side-by-side booking totals screenshot.",
    layout: "half",
  },
  {
    key: "min_stay",
    section: "Nightsbridge Performance | Hits",
    title: "Minimum stay currently in place",
    hint: "Minimum-stay settings screenshot for the window under review.",
    layout: "half",
  },
  {
    key: "promotions_rate_overrides",
    section: "Nightsbridge Performance | Hits",
    title: "Promotions and rate overrides",
    hint: "Active promotions and any rate overrides applied.",
    layout: "half",
  },
];

/** OPERA properties report off SiteMinder + channel/room/rate performance. */
const OPERA_SLOTS: MediaSlotDefinition[] = [
  {
    key: "channel_hits",
    section: "SiteMinder Data",
    title: "Booking performance | last year vs this year",
    hint: "SiteMinder booking performance graph for the period.",
    layout: "half",
  },
  {
    key: "connected_channels",
    section: "SiteMinder Data",
    title: "Current connected channels",
    hint: "The connected-channel list from SiteMinder.",
    layout: "half",
  },
  {
    key: "channel_mix",
    section: "Channel & Room Performance",
    title: "Channel mix",
    hint: "Channel mix table / graph for the period.",
    layout: "half",
  },
  {
    key: "room_type_performance",
    section: "Channel & Room Performance",
    title: "Room type performance",
    hint: "Room type performance table for the period.",
    layout: "half",
  },
  {
    key: "rate_plan_performance",
    section: "Channel & Room Performance",
    title: "Rate plan performance",
    hint: "Rate plan performance table for the period.",
    layout: "half",
  },
  {
    key: "min_stay",
    section: "Channel & Room Performance",
    title: "Minimum stay currently in place",
    hint: "Minimum-stay settings screenshot (optional).",
    layout: "half",
  },
];

/**
 * PROTEL follows the Grande Roche golden report: ProfitRoom stats, SiteMinder
 * same-time-last-year, then the Booking.com and Expedia extranet sections with
 * their own headings (so protel does not use the generic shared OTA slots).
 */
const PROTEL_SLOTS: MediaSlotDefinition[] = [
  {
    key: "profitroom_sales_summary",
    section: "ProfitRoom Stats | Last 30 Days",
    title: "Sales summary",
    hint: "ProfitRoom sales summary for the last 30 days.",
    layout: "half",
  },
  {
    key: "channel_mix",
    section: "ProfitRoom Stats | Last 30 Days",
    title: "Revenue by channel",
    hint: "ProfitRoom channel revenue breakdown.",
    layout: "half",
  },
  {
    key: "channel_hits",
    section: "ProfitRoom Stats | Last 30 Days",
    title: "Booking pickup",
    hint: "Pickup / bookings created graph for the last 30 days.",
    layout: "half",
  },
  {
    key: "profitroom_arrival_dates",
    section: "ProfitRoom Stats | Last 30 Days",
    title: "Most popular arrival dates",
    hint: "Most popular arrival dates screenshot.",
    layout: "half",
  },
  {
    key: "siteminder_room_nights_lty",
    section: "SiteMinder Same Time Last Year",
    title: "Room nights by channel",
    hint: "SiteMinder room nights by channel, same time last year.",
    layout: "half",
  },
  {
    key: "siteminder_room_revenue_lty",
    section: "SiteMinder Same Time Last Year",
    title: "Room revenue by channel",
    hint: "SiteMinder room revenue by channel, same time last year.",
    layout: "half",
  },
  {
    key: "bookingcom_performance",
    section: "Booking.com Data",
    title: "Your scores and area demand",
    hint: "Review scores plus demand for the area.",
    layout: "half",
  },
  {
    key: "bookingcom_ranking",
    section: "Booking.com Data",
    title: "Pace of bookings and search window",
    hint: "Pace of bookings / search window screenshots.",
    layout: "half",
  },
  {
    key: "bookingcom_length_of_stay",
    section: "Booking.com Data",
    title: "Length of stay and device",
    hint: "Length of stay and device breakdown.",
    layout: "half",
  },
  {
    key: "bookingcom_top_countries",
    section: "Booking.com Data",
    title: "Top 5 countries and cancellation policy",
    hint: "Top source countries and cancellation policy mix.",
    layout: "half",
  },
  {
    key: "bookingcom_promotions",
    section: "Booking.com Promotion Stats | Last 30 Days",
    title: "Promotion stats",
    hint: "Booking.com promotion performance table.",
    layout: "full",
  },
  {
    key: "bookingcom_rate_plans",
    section: "Booking.com Rate Plans | Last 30 Days",
    title: "Rate plan stats",
    hint: "Booking.com rate plan performance table.",
    layout: "full",
  },
  {
    key: "expedia_performance",
    section: "Expedia Performance | Last 28 Days",
    title: "Expedia performance",
    hint: "Partner Central performance screenshot.",
    layout: "full",
  },
  {
    key: "expedia_promotions",
    section: "Expedia Promotion Stats | Last 28 Days",
    title: "Promotion stats",
    hint: "Expedia promotion performance table.",
    layout: "full",
  },
];

/** Slots every source shares — OTA extranets and the free-form slides. */
const sharedSlots = (source: ReportSourceType): MediaSlotDefinition[] => {
  const additional: MediaSlotDefinition = {
    key: "additional",
    section: "Additional Slides",
    title: "Additional slides",
    hint: "Anything else the revenue team wants in the report, in order.",
    layout: "full",
    explode: true,
  };

  // PROTEL carries its own OTA sections, matching the golden report headings.
  if (source === "protel") return [additional];

  const bookingSection = "Booking.com";
  const slots: MediaSlotDefinition[] = [
    {
      key: "bookingcom_performance",
      section: bookingSection,
      title: source === "nightsbridge" ? "Booking.com performance" : "Booking.com data",
      hint: "Analytics / performance screenshot from the extranet.",
      layout: "full",
    },
  ];

  if (source !== "nightsbridge") {
    slots.push({
      key: "bookingcom_ranking",
      section: bookingSection,
      title: "Ranking score",
      hint: "Booking.com ranking / visibility score screenshot.",
      layout: "half",
    });
  }

  slots.push(
    {
      key: "bookingcom_promotions",
      section: bookingSection,
      title: "Promotion stats | last 30 days",
      hint: "Promotion performance table.",
      layout: "half",
    },
    {
      key: "bookingcom_rate_plans",
      section: bookingSection,
      title: "Rate plan stats | last 30 days",
      hint: "Rate plan performance table.",
      layout: "half",
    },
    {
      key: "expedia_performance",
      section: "Expedia",
      title: "Expedia performance",
      hint: "Partner Central performance screenshot.",
      layout: "full",
    },
    {
      key: "expedia_promotions",
      section: "Expedia",
      title: "Promotion stats | last 28 days",
      hint: "Promotion performance table.",
      layout: "half",
    },
    {
      key: "expedia_traveller_trends",
      section: "Expedia",
      title: "Traveller trends",
      hint: "Traveller trends / source market screenshot.",
      layout: "half",
    },
    {
      key: "additional",
      section: "Additional Slides",
      title: "Additional slides",
      hint: "Anything else the revenue team wants in the report, in order.",
      layout: "full",
      explode: true,
    },
  );

  return slots;
};

/** The slot catalogue for a run, resolved from its source type. */
export function slotsForSource(source: unknown): MediaSlotDefinition[] {
  const resolved = normalizeSourceType(source);
  const base =
    resolved === "opera" ? OPERA_SLOTS : resolved === "protel" ? PROTEL_SLOTS : NIGHTSBRIDGE_SLOTS;
  return [...base.map((slot) => ({ ...slot })), ...sharedSlots(resolved)];
}

/** Print sections (grouped pages) for a run's source. */
export function mediaSectionsForSource(source: unknown): string[] {
  return slotsForSource(source).reduce<string[]>((acc, slot) => {
    if (slot.explode) return acc;
    if (!acc.includes(slot.section)) acc.push(slot.section);
    return acc;
  }, []);
}

/** Back-compat default catalogue (NightsBridge). */
export const REPORT_MEDIA_SLOTS: readonly MediaSlotDefinition[] = slotsForSource("nightsbridge");

export const MEDIA_SECTIONS: string[] = mediaSectionsForSource("nightsbridge");

/** True when the key belongs to a built-in slot of any source. */
export function isBuiltInSlotKey(key: string): boolean {
  return REPORT_SOURCE_TYPES.some((source) =>
    slotsForSource(source).some((slot) => slot.key === key),
  );
}

/** Any source's definition for a key — used to keep orphaned images visible. */
export function builtInSlotByKey(key: string): MediaSlotDefinition | undefined {
  for (const source of REPORT_SOURCE_TYPES) {
    const found = slotsForSource(source).find((slot) => slot.key === key);
    if (found) return found;
  }
  return undefined;
}
