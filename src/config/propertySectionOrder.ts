/**
 * Shared property section / tab order — Phase 1 information architecture.
 *
 * Single source of truth for:
 * - /admin/edit property (PropertyForm tabs)
 * - ROLOS Property Setup (PMSPropertySetup left rail)
 * - Onboarding wizard step alignment
 *
 * Order mirrors ROLOS onboarding wizard flow for consistent mental model:
 * Identity → Location & map → Contact → Business/banking → Facilities → Rooms → Media → Policies/pricing → Integrations → Review/status
 *
 * Admin-only / power features (PMS credentials, RU push, billing, ROL Spec, Branding)
 * stay as collapsible advanced groups so the primary path stays dense and desktop-optimised.
 */

export type PropertySectionKey =
  | "general"           // Identity + Location + Contact + Business (dense, collapsible blocks)
  | "info-facilities"   // Facilities & amenities
  | "rooms"             // Rooms overview
  | "images"            // Media
  | "house-rules"       // Policies
  | "rates"             // Pricing / seasons / rate types
  | "packages"
  | "specials"
  | "addons"
  | "templates"
  | "announcements"
  | "contacts"          // Public contacts (ROLOS setup)
  | "branding"
  | "rol-spec"
  | "integrations"
  | "admin"             // Admin-only advanced
  | "onboarding";       // Wizard entry

export interface PropertySectionDef {
  key: PropertySectionKey;
  label: string;
  description: string;
  /** When true, only shown to admin/dev/fearless */
  adminOnly?: boolean;
  /** When true, hidden from ROLOS-PMS source-of-truth path (lives in Property Setup hub) */
  rolosManaged?: boolean;
}

/** Canonical ordered list used by both Admin PropertyForm and PMSPropertySetup */
export const PROPERTY_SECTION_ORDER: PropertySectionDef[] = [
  {
    key: "general",
    label: "Identity & Location",
    description: "Name, type, contact, address, map pin, business & banking.",
  },
  {
    key: "info-facilities",
    label: "Facilities",
    description: "Star rating, accommodation label, facilities checklist, breakfast options.",
    rolosManaged: true,
  },
  {
    key: "rooms",
    label: "Rooms",
    description: "Room types, rate links, facilities, amenities, images.",
    rolosManaged: true,
  },
  {
    key: "images",
    label: "Media",
    description: "Property gallery and hero images.",
  },
  {
    key: "house-rules",
    label: "Policies",
    description: "Check-in/out, children/pets/smoking, deposits, cancellation.",
    rolosManaged: true,
  },
  {
    key: "rates",
    label: "Rates & Pricing",
    description: "Seasons, rate types, calendar, charges, providers.",
    rolosManaged: true,
  },
  {
    key: "packages",
    label: "Packages",
    description: "Curated stay packages.",
    rolosManaged: true,
  },
  {
    key: "specials",
    label: "Specials",
    description: "Promotional offers and vouchers.",
    rolosManaged: true,
  },
  {
    key: "addons",
    label: "Addons",
    description: "Optional guest add-ons.",
    rolosManaged: true,
  },
  {
    key: "templates",
    label: "Templates",
    description: "Confirmation, pre-stay and post-stay email templates.",
    rolosManaged: true,
  },
  {
    key: "announcements",
    label: "Announcements",
    description: "Dated banners on the booking site.",
    rolosManaged: true,
  },
  {
    key: "contacts",
    label: "Contacts",
    description: "Public reception, reservations and emergency contacts.",
    rolosManaged: true,
  },
  {
    key: "branding",
    label: "Branding",
    description: "Logo, colours, fonts, brand voice.",
  },
  {
    key: "rol-spec",
    label: "ROL Spec",
    description: "Editorial rating, why we chose this place, navigation tags.",
  },
  {
    key: "integrations",
    label: "Integrations",
    description: "Channel widgets, embeds, WordPress, white-label domain.",
  },
  {
    key: "admin",
    label: "Admin",
    description: "Billing, commission, capability flags (admin only).",
    adminOnly: true,
  },
  {
    key: "onboarding",
    label: "Onboarding",
    description: "Guided wizard entry point.",
  },
];

/** Groups used by ROLOS Property Setup left rail (matches wizard IA) */
export const PROPERTY_SECTION_GROUPS = [
  {
    label: "Property profile",
    keys: ["general", "info-facilities", "contacts"] as PropertySectionKey[],
  },
  {
    label: "Booking backend",
    keys: ["rooms", "rates", "packages", "specials", "addons"] as PropertySectionKey[],
  },
  {
    label: "Guest experience",
    keys: ["house-rules", "templates", "announcements", "images"] as PropertySectionKey[],
  },
  {
    label: "Advanced",
    keys: ["branding", "rol-spec", "integrations", "admin", "onboarding"] as PropertySectionKey[],
  },
] as const;

export function getSectionDef(key: PropertySectionKey): PropertySectionDef | undefined {
  return PROPERTY_SECTION_ORDER.find((s) => s.key === key);
}
