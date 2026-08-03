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

import {
  Home,
  Building2,
  BedDouble,
  Image as ImageIcon,
  FileText,
  DollarSign,
  Package,
  Sparkles,
  Mail,
  Megaphone,
  Phone,
  Palette,
  Layers,
  ShieldCheck,
  ListChecks,
  CalendarRange,
  Calendar,
  LayoutList,
  Wallet,
  CreditCard,
  Receipt,
  type LucideIcon,
} from "lucide-react";

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

export function getSectionLabel(key: string): string {
  return PROPERTY_SECTION_ORDER.find((s) => s.key === key)?.label ?? "";
}

/** Icon per section — shared by Admin PropertyForm rail and ROLOS Property Setup rail */
export const SECTION_ICON_MAP: Record<string, LucideIcon> = {
  general: Home,
  "info-facilities": Building2,
  rooms: BedDouble,
  images: ImageIcon,
  "house-rules": FileText,
  rates: DollarSign,
  packages: Package,
  specials: Sparkles,
  addons: Package,
  templates: Mail,
  announcements: Megaphone,
  contacts: Phone,
  branding: Palette,
  "rol-spec": Sparkles,
  integrations: Layers,
  admin: ShieldCheck,
  onboarding: Sparkles,
};

export interface SectionHint {
  key: string;
  label: string;
  icon: LucideIcon;
}

/** Sub-section hint chips shown under the active rail item */
export const SECTION_HINTS: Partial<Record<PropertySectionKey, SectionHint[]>> = {
  rooms: [
    { key: "type", label: "Type", icon: Layers },
    { key: "rate-types", label: "Rate Types", icon: DollarSign },
    { key: "facilities", label: "Facilities", icon: ListChecks },
    { key: "amenities", label: "Amenities", icon: Sparkles },
    { key: "images", label: "Images", icon: ImageIcon },
    { key: "agreement", label: "Agreement", icon: FileText },
  ],
  rates: [
    { key: "seasons", label: "Seasons", icon: CalendarRange },
    { key: "types", label: "Rate Types", icon: Layers },
    { key: "calendar", label: "Calendar", icon: Calendar },
    { key: "breakdown", label: "Breakdown", icon: LayoutList },
    { key: "charges", label: "Charges", icon: Wallet },
    { key: "policies", label: "Policies", icon: ShieldCheck },
    { key: "providers", label: "Providers", icon: CreditCard },
    { key: "overview", label: "Overview", icon: Receipt },
  ],
  general: [
    { key: "identity", label: "Identity", icon: Home },
    { key: "location", label: "Location", icon: Building2 },
    { key: "contact", label: "Contact", icon: Phone },
    { key: "banking", label: "Banking", icon: Wallet },
  ],
  images: [
    { key: "gallery", label: "Gallery", icon: ImageIcon },
    { key: "hero", label: "Hero", icon: Sparkles },
  ],
};


export interface RailSection {
  key: string;
  label: string;
  description: string;
  icon: LucideIcon;
  hints?: SectionHint[];
}

export interface RailGroup {
  label: string;
  sections: RailSection[];
}

/**
 * Build the grouped rail model, restricted to the keys a screen supports.
 * Order and grouping come from PROPERTY_SECTION_GROUPS (shared IA).
 */
export function buildSectionGroups(allowedKeys: Iterable<string>): RailGroup[] {
  const allowed = new Set(allowedKeys);
  return PROPERTY_SECTION_GROUPS.map((g) => ({
    label: g.label,
    sections: g.keys
      .filter((k) => allowed.has(k))
      .map((k) => {
        const def = PROPERTY_SECTION_ORDER.find((s) => s.key === k)!;
        return {
          key: k as string,
          label: def.label,
          description: def.description,
          icon: SECTION_ICON_MAP[k] || Building2,
          hints: SECTION_HINTS[k],
        };
      }),
  })).filter((g) => g.sections.length > 0);
}

