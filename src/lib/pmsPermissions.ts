/**
 * PMS Module Permission Matrix
 * Defines which PMS staff roles can access which modules and whether access is read-only.
 */

export type PmsStaffRole =
  | "property_owner"
  | "general_manager"
  | "front_desk"
  | "housekeeping"
  | "maintenance"
  | "accountant"
  | "auditor"
  | "agent";

export type PmsModule =
  | "dashboard"
  | "rooms"
  | "rate-plans"
  | "guests"
  | "housekeeping"
  | "reports"
  | "branding"
  | "integrations"
  | "staff"
  | "calendar"
  | "channels"
  | "groups"
  | "events"
  | "night-audit"
  | "messaging"
  | "portfolio"
  | "revenue"
  | "command-centre";

export interface ModuleAccess {
  visible: boolean;
  readOnly: boolean;
}

const FULL: ModuleAccess = { visible: true, readOnly: false };
const RO: ModuleAccess = { visible: true, readOnly: true };
const NONE: ModuleAccess = { visible: false, readOnly: false };

// Permission matrix: role → module → access
const PERMISSION_MATRIX: Record<PmsStaffRole, Record<PmsModule, ModuleAccess>> = {
  property_owner: {
    dashboard: FULL, rooms: FULL, "rate-plans": FULL, guests: FULL,
    housekeeping: FULL, reports: FULL, branding: FULL, integrations: FULL,
    staff: FULL, calendar: FULL, channels: FULL, groups: FULL, events: FULL, "night-audit": FULL, messaging: FULL,
    portfolio: FULL, revenue: FULL,
  },
  general_manager: {
    dashboard: FULL, rooms: FULL, "rate-plans": FULL, guests: FULL,
    housekeeping: FULL, reports: FULL, branding: FULL, integrations: FULL,
    staff: FULL, calendar: FULL, channels: FULL, groups: FULL, events: FULL, "night-audit": FULL, messaging: FULL,
    portfolio: FULL, revenue: FULL,
  },
  front_desk: {
    dashboard: FULL, rooms: RO, "rate-plans": NONE, guests: FULL,
    housekeeping: RO, reports: NONE, branding: NONE, integrations: NONE,
    staff: NONE, calendar: FULL, channels: RO, groups: RO, events: RO, "night-audit": NONE, messaging: RO,
    portfolio: NONE, revenue: NONE,
  },
  housekeeping: {
    dashboard: NONE, rooms: RO, "rate-plans": NONE, guests: NONE,
    housekeeping: FULL, reports: NONE, branding: NONE, integrations: NONE,
    staff: NONE, calendar: NONE, channels: NONE, groups: NONE, events: NONE, "night-audit": NONE, messaging: NONE,
    portfolio: NONE, revenue: NONE,
  },
  maintenance: {
    dashboard: NONE, rooms: NONE, "rate-plans": NONE, guests: NONE,
    housekeeping: RO, reports: NONE, branding: NONE, integrations: NONE,
    staff: NONE, calendar: NONE, channels: NONE, groups: NONE, events: NONE, "night-audit": NONE, messaging: NONE,
    portfolio: NONE, revenue: NONE,
  },
  accountant: {
    dashboard: NONE, rooms: NONE, "rate-plans": NONE, guests: RO,
    housekeeping: NONE, reports: FULL, branding: NONE, integrations: NONE,
    staff: NONE, calendar: NONE, channels: NONE, groups: RO, events: NONE, "night-audit": RO, messaging: NONE,
    portfolio: RO, revenue: RO,
  },
  auditor: {
    dashboard: RO, rooms: RO, "rate-plans": RO, guests: RO,
    housekeeping: RO, reports: RO, branding: RO, integrations: NONE,
    staff: NONE, calendar: RO, channels: RO, groups: RO, events: RO, "night-audit": RO, messaging: RO,
    portfolio: RO, revenue: RO,
  },
};

/**
 * Get the module access for a given staff role.
 * Platform admins/devs and property owners (detected via usePmsPropertyId) bypass this.
 */
export function getModuleAccess(role: PmsStaffRole | null, module: PmsModule): ModuleAccess {
  if (!role) return FULL; // No staff record means platform admin/dev/owner — full access
  return PERMISSION_MATRIX[role]?.[module] ?? NONE;
}

/**
 * Get all visible modules for a role (for sidebar filtering).
 */
export function getVisibleModules(role: PmsStaffRole | null): PmsModule[] {
  if (!role) {
    return Object.keys(PERMISSION_MATRIX.property_owner) as PmsModule[];
  }
  const matrix = PERMISSION_MATRIX[role];
  if (!matrix) return [];
  return (Object.entries(matrix) as [PmsModule, ModuleAccess][])
    .filter(([, access]) => access.visible)
    .map(([mod]) => mod);
}

export const ROLE_LABELS: Record<PmsStaffRole, string> = {
  property_owner: "Property Owner",
  general_manager: "General Manager",
  front_desk: "Front Desk / Reservations",
  housekeeping: "Housekeeping",
  maintenance: "Maintenance",
  accountant: "Accountant / Finance",
  auditor: "Read-only Auditor",
};

export const ROLE_DESCRIPTIONS: Record<PmsStaffRole, string> = {
  property_owner: "Full oversight of performance, revenue, branding, and integrations.",
  general_manager: "Full operational access — rates, bookings, housekeeping, reports, branding.",
  front_desk: "Check-ins, reservations, guest CRM. Read-only rooms & housekeeping status.",
  housekeeping: "Housekeeping board & maintenance dockets. Read-only room status.",
  maintenance: "Maintenance dockets only. Read-only housekeeping board.",
  accountant: "Financial reports, folios, guest CRM for billing. No operational access.",
  auditor: "Read-only access to all PMS modules for audits.",
};
