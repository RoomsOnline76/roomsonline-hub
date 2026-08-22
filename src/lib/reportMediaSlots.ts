// Canonical catalogue of the pasted-image slots the revenue team fills in.
// Mirrors supabase/functions/_shared/reportMediaSlots.ts — keep both in step.

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

export const REPORT_MEDIA_SLOTS: readonly MediaSlotDefinition[] = [
  {
    key: "channel_hits",
    section: "Channel Performance",
    title: "Booking engine performance / hits",
    hint: "Nightsbridge (or PMS) hits and enquiry graph for the period.",
    layout: "full",
  },
  {
    key: "booking_totals",
    section: "Channel Performance",
    title: "Booking totals — last year vs this year",
    hint: "The side-by-side booking totals screenshot.",
    layout: "half",
  },
  {
    key: "min_stay",
    section: "Channel Performance",
    title: "Minimum stay",
    hint: "Minimum-stay settings screenshot for the window under review.",
    layout: "half",
  },
  {
    key: "promotions_rate_overrides",
    section: "Channel Performance",
    title: "Promotions & rate overrides",
    hint: "Active promotions and any rate overrides applied.",
    layout: "half",
  },
  {
    key: "bookingcom_performance",
    section: "Booking.com",
    title: "Booking.com performance",
    hint: "Analytics / performance screenshot from the extranet.",
    layout: "full",
  },
  {
    key: "bookingcom_promotions",
    section: "Booking.com",
    title: "Booking.com promotion stats",
    hint: "Promotion performance table.",
    layout: "half",
  },
  {
    key: "bookingcom_rate_plans",
    section: "Booking.com",
    title: "Booking.com rate plan stats",
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
    title: "Expedia promotion stats",
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
] as const;

export const MEDIA_SECTIONS: string[] = REPORT_MEDIA_SLOTS.reduce<string[]>((acc, slot) => {
  if (slot.explode) return acc;
  if (!acc.includes(slot.section)) acc.push(slot.section);
  return acc;
}, []);
