import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  BookOpen,
  BarChart3,
  Search,
  Users,
  Settings,
  KeyRound,
  Bell,
  Newspaper,
  FileSearch,
  HeartPulse,
  BookOpenCheck,
  Server,
  PenSquare,
  FileSignature,
  FileEdit,
  Wand2,
  Sparkles,
  TrendingUp,
  Activity,
  Flag,
  AlertTriangle,
  CreditCard,
  Database,
  type LucideIcon,
} from "lucide-react";
import { UserRole } from "@/lib/permissions";

export interface NavItem {
  id: string;
  title: string;
  icon: LucideIcon;
  href: string;
  badge?: number;
  minRole: UserRole;
  description?: string;
}

export interface NavSection {
  id: string;
  label: string;
  icon: LucideIcon;
  minRole: UserRole;
  collapsible?: boolean;
  defaultOpen?: boolean;
  items: NavItem[];
}

// Owner workspace - visible to all authenticated users
const workspaceSection: NavSection = {
  id: 'workspace',
  label: 'Workspace',
  icon: Building2,
  minRole: 'owner',
  collapsible: false,
  items: [
    { id: 'properties', title: 'My Properties', icon: Building2, href: '/admin/property-overview', minRole: 'owner' },
    { id: 'calendar', title: 'Calendar', icon: CalendarDays, href: '/admin/calendar/accommodation', minRole: 'owner' },
    { id: 'bookings', title: 'Bookings', icon: BookOpen, href: '/admin/bookings', minRole: 'owner' },
  ],
};

// Insights - mixed visibility
const insightsSection: NavSection = {
  id: 'insights',
  label: 'Insights',
  icon: BarChart3,
  minRole: 'owner',
  collapsible: false,
  items: [
    { id: 'property-pulse', title: 'Property Pulse', icon: BarChart3, href: '/dashboard/reports', minRole: 'owner' },
    { id: 'revenue-pulse', title: 'Revenue Pulse', icon: TrendingUp, href: '/pulse', minRole: 'dev' },
    { id: 'intelligence', title: 'Intelligence', icon: Search, href: '/dashboard/insights', minRole: 'dev' },
  ],
};

// Admin section - admin+ only
const adminSection: NavSection = {
  id: 'administration',
  label: 'Administration',
  icon: Users,
  minRole: 'admin',
  collapsible: false,
  items: [
    { id: 'admin-dashboard', title: 'Admin Dashboard', icon: LayoutDashboard, href: '/admin/dashboard', minRole: 'admin', description: 'Overview of platform operations' },
    { id: 'all-bookings', title: 'All Bookings', icon: BookOpen, href: '/admin/all-bookings', minRole: 'admin' },
    { id: 'all-properties', title: 'All Properties', icon: Building2, href: '/admin/all-properties', minRole: 'admin' },
    { id: 'team', title: 'Users', icon: Users, href: '/admin-users', minRole: 'admin' },
    { id: 'payments', title: 'Payments', icon: CreditCard, href: '/admin/payments', minRole: 'admin' },
    { id: 'contracts', title: 'Contracts', icon: FileSignature, href: '/admin/contracts', minRole: 'admin' },
    { id: 'onboarding', title: 'Onboarding', icon: Sparkles, href: '/admin/onboarding', minRole: 'admin' },
    { id: 'admin-system', title: 'System Config', icon: Settings, href: '/admin/system', minRole: 'admin' },
  ],
};

// Edit & Audit - admin+ collapsible
const editAuditSection: NavSection = {
  id: 'edit-audit',
  label: 'Edit & Audit',
  icon: PenSquare,
  minRole: 'admin',
  collapsible: true,
  defaultOpen: false,
  items: [
    { id: 'journals', title: 'Journals', icon: Newspaper, href: '/admin/journals', minRole: 'admin' },
    { id: 'help-articles', title: 'Help Articles', icon: BookOpenCheck, href: '/admin/help-articles', minRole: 'admin' },
    { id: 'contract-editor', title: 'Contract Editor', icon: FileEdit, href: '/admin/contract-editor', minRole: 'admin' },
    { id: 'wizard-editor', title: 'Wizard Editor', icon: Wand2, href: '/admin/wizard-editor', minRole: 'admin' },
    { id: 'audit-log', title: 'Audit Log', icon: FileSearch, href: '/admin/audit', minRole: 'admin' },
  ],
};

// System Control - dev only
const systemControlSection: NavSection = {
  id: 'system-control',
  label: 'System Control',
  icon: Server,
  minRole: 'dev',
  collapsible: true,
  defaultOpen: false,
  items: [
    { id: 'dev-overview', title: 'System Overview', icon: Activity, href: '/dev/overview', minRole: 'dev', description: 'Global health dashboard' },
    { id: 'pms-control', title: 'PMS Control', icon: Server, href: '/dev/pms', minRole: 'dev', description: 'Adapter status & controls' },
    { id: 'integrations', title: 'Integrations', icon: KeyRound, href: '/admin-keys', minRole: 'dev' },
    { id: 'supporting-systems', title: 'Supporting Systems', icon: Settings, href: '/admin/supporting-systems', minRole: 'dev' },
    { id: 'system-health', title: 'System Health', icon: HeartPulse, href: '/admin/system-health', minRole: 'dev' },
    { id: 'data-logs', title: 'Data & Logs', icon: Database, href: '/dev/logs', minRole: 'dev', description: 'Sync and error logs' },
    { id: 'feature-flags', title: 'Feature Flags', icon: Flag, href: '/dev/features', minRole: 'dev' },
    { id: 'danger-zone', title: 'Danger Zone', icon: AlertTriangle, href: '/dev/danger', minRole: 'dev', description: 'Destructive operations' },
  ],
};

// Complete navigation configuration
export const navigationConfig: NavSection[] = [
  workspaceSection,
  insightsSection,
  adminSection,
  editAuditSection,
  systemControlSection,
];

// Mobile bottom nav items - simplified for touch
export const mobileNavItems: NavItem[] = [
  { id: 'properties', title: 'Properties', icon: Building2, href: '/admin/property-overview', minRole: 'owner' },
  { id: 'bookings', title: 'Bookings', icon: BookOpen, href: '/admin/bookings', minRole: 'owner' },
  { id: 'calendar', title: 'Calendar', icon: CalendarDays, href: '/admin/calendar/accommodation', minRole: 'owner' },
  { id: 'insights', title: 'Insights', icon: BarChart3, href: '/dashboard/reports', minRole: 'owner' },
];

// Admin mobile nav item
export const adminMobileNavItem: NavItem = {
  id: 'admin',
  title: 'Admin',
  icon: Users,
  href: '/admin/dashboard',
  minRole: 'admin',
};

// System mobile nav item
export const systemMobileNavItem: NavItem = {
  id: 'system',
  title: 'System',
  icon: Server,
  href: '/dev/overview',
  minRole: 'dev',
};
