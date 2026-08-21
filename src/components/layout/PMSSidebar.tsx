import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Inbox,
  LayoutDashboard,
  BedDouble,
  TrendingUp,

  Users,
  Sparkles,
  Code2,
  BarChart3,
  CalendarDays,
  Palette,
  ChevronLeft,
  ChevronRight,
  LogOut,
  ArrowLeft,
  UserCog,
  ChevronsUpDown,
  Radio,
  UsersRound,
  CalendarHeart,
  Moon,
  MessageSquare,
  Building2,
  Gauge,
  Radar,
  BookOpen,
  SlidersHorizontal,
  Contact,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { usePMSBrand } from "@/contexts/PMSBrandContext";
import { usePmsStaffRole } from "@/hooks/usePmsStaffRole";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { usePmsHousekeepingCounts } from "@/hooks/usePmsHousekeepingCounts";
import { getVisibleModules, type PmsModule } from "@/lib/pmsPermissions";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";
import { VersionBadge } from "@/components/layout/VersionBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check } from "lucide-react";
import rolLogo from "@/assets/rol-logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";
import { useHubspotCapability } from "@/hooks/useHubspotCrm";

export interface NavItem {
  title: string;
  icon: React.ElementType;
  href: string;
  module: PmsModule;
  /** Route is gated to platform users (admin/dev/fearless) — hidden from owners & staff. */
  platformOnly?: boolean;
  /** Only shown when the optional HubSpot CRM add-on is connected and enabled. */
  requiresHubspot?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}


/** ROL'OS navigation, shared by the desktop sidebar and the mobile bottom nav. */
export const pmsNavGroups: NavGroup[] = [
  {
    label: "Command",
    items: [
      { title: "Command Centre", icon: Radar, href: "/pms/command-centre", module: "command-centre" },
    ],
  },
  {
    label: "Front Desk",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, href: "/pms", module: "dashboard" },
      { title: "Rooms", icon: BedDouble, href: "/pms/rooms", module: "rooms" },
      { title: "Groups", icon: UsersRound, href: "/pms/groups", module: "groups" },
      { title: "Guests", icon: Users, href: "/pms/guests", module: "guests" },
      { title: "Inquiries", icon: Inbox, href: "/pms/inquiries", module: "guests" },
      // CRM is the optional HubSpot add-on surface — hidden unless connected.
      { title: "CRM", icon: Contact, href: "/pms/crm", module: "guests", requiresHubspot: true },
      { title: "Bookings", icon: BookOpen, href: "/pms/bookings", module: "bookings" },
      { title: "Messaging", icon: MessageSquare, href: "/pms/messaging", module: "messaging" },
    ],
  },
  {
    label: "Operations",
    items: [
      { title: "Housekeeping", icon: Sparkles, href: "/pms/housekeeping", module: "housekeeping" },
      { title: "Events", icon: CalendarHeart, href: "/pms/events", module: "events" },
      { title: "Night Audit", icon: Moon, href: "/pms/night-audit", module: "night-audit" },
    ],
  },
  {
    label: "Revenue & Distribution",
    items: [
      { title: "Rate Plans", icon: TrendingUp, href: "/pms/rate-plans", module: "rate-plans" },
      { title: "Revenue Mgmt", icon: Gauge, href: "/pms/revenue", module: "revenue" },
      { title: "Channels", icon: Radio, href: "/pms/channels", module: "channels" },
    ],
  },
  {
    label: "Reporting",
    items: [
      { title: "Reports", icon: BarChart3, href: "/pms/reports", module: "reports" },
      { title: "Portfolio", icon: Building2, href: "/pms/portfolio", module: "portfolio" },
      // Intelligence lives in the admin menu only — never in the ROL'OS sidebar.
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "Property Setup", icon: SlidersHorizontal, href: "/pms/property-setup", module: "property-setup" },
      { title: "Branding", icon: Palette, href: "/pms/branding", module: "branding" },
      { title: "Staff", icon: UserCog, href: "/pms/staff", module: "staff" },
      { title: "Website widgets", icon: Code2, href: "/pms/integrations", module: "integrations" },
    ],
  },
];

/**
 * Modules that make no sense without a linked property — hidden entirely for accounts
 * that have no property assigned yet (e.g. partner/IT test logins).
 */
export const PROPERTY_LINKED_ONLY_MODULES: PmsModule[] = ["messaging"];

export function isNavItemVisibleForScope(item: NavItem, hasProperty: boolean): boolean {
  return hasProperty || !PROPERTY_LINKED_ONLY_MODULES.includes(item.module);
}

/** Add-on gate: HubSpot-only entries disappear when the add-on is not live. */
export function isNavItemVisibleForAddons(item: NavItem, hubspotAvailable: boolean): boolean {
  return !item.requiresHubspot || hubspotAvailable;
}

export function PMSSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, isDev, isAdmin, isFearlessLeader } = useAuth();
  const { propertyId, properties, switchProperty, portfolioName } = usePmsPropertyId();
  const { propertyName, logoUrl, brandEnabled } = usePMSBrand();
  const { staffRole } = usePmsStaffRole(propertyId);
  const visibleModules = getVisibleModules(staffRole);
  const isPlatformUser = isDev || isAdmin || isFearlessLeader;
  const { available: hubspotAvailable } = useHubspotCapability();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("pms-sidebar-collapsed");
    return saved ? JSON.parse(saved) : false;
  });
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem("pms-sidebar-collapsed", JSON.stringify(collapsed));
  }, [collapsed]);

  const isActive = (href: string) => location.pathname === href;

  const navigateWithProperty = (href: string) => {
    const params = propertyId ? `?property=${propertyId}` : "";
    navigate(`${href}${params}`);
  };

  const allPropertyIds = properties.map((p) => p.id);
  const { counts: hkCounts } = usePmsHousekeepingCounts(allPropertyIds);

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    const Icon = item.icon;
    const badgeCount = item.module === "housekeeping" ? hkCounts.total : 0;

    const link = (
      <button
        onClick={() => navigateWithProperty(item.href)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active && "bg-primary/15 text-primary border-l-2 border-primary",
          !active && "text-foreground/80"
        )}
      >
        <div className="relative shrink-0">
          <Icon className="h-4 w-4" />
          {collapsed && badgeCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 h-3.5 min-w-3.5 px-0.5 rounded-full bg-destructive text-destructive-foreground text-[9px] leading-[14px] text-center font-semibold">
              {badgeCount > 9 ? "9+" : badgeCount}
            </span>
          )}
        </div>
        {!collapsed && <span className="flex-1 text-left">{item.title}</span>}
        {!collapsed && badgeCount > 0 && (
          <span className="ml-auto h-5 min-w-5 px-1.5 rounded-full bg-destructive text-destructive-foreground text-[10px] leading-5 text-center font-semibold">
            {badgeCount > 99 ? "99+" : badgeCount}
          </span>
        )}
      </button>
    );


    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right">{item.title}</TooltipContent>
        </Tooltip>
      );
    }
    return link;
  };

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 flex flex-col bg-card border-r border-border transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Header — property logo or fallback */}
      <div className={cn("flex flex-col gap-2 p-4 border-b border-border", collapsed && "items-center")}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          {logoUrl ? (
            <img src={logoUrl} alt={portfolioName || propertyName || "ROL'OS"} className="h-8 w-8 object-contain rounded" />
          ) : (
            <img src={rolLogo} alt={portfolioName || propertyName || "ROL'OS"} className="h-8 w-8 object-contain" />
          )}
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">
                {portfolioName || propertyName || "ROL'OS PMS"}
              </span>
              <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground truncate">
                {portfolioName ? "Portfolio" : "Property Management"}
              </span>
            </div>
          )}
        </div>

        {/* Property switcher for platform users — searchable */}
        {isPlatformUser && !collapsed && properties.length > 0 && (
          <Popover open={switcherOpen} onOpenChange={setSwitcherOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                role="combobox"
                aria-expanded={switcherOpen}
                className="flex h-8 w-full items-center justify-between rounded-md border border-border/50 bg-muted/50 px-3 text-xs text-left"
              >
                <span className="truncate">
                  {properties.find((p) => p.id === propertyId)?.name || "Select ROL'OS property…"}
                </span>
                <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-50" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-0" align="start">
              <Command>
                <CommandInput placeholder="Search properties…" className="h-8 text-xs" />
                <CommandList>
                  <CommandEmpty className="py-4 text-center text-xs text-muted-foreground">
                    No property found.
                  </CommandEmpty>
                  <CommandGroup>
                    {properties.map((p) => (
                      <CommandItem
                        key={p.id}
                        value={p.name}
                        className="text-xs"
                        onSelect={() => {
                          switchProperty(p.id);
                          setSwitcherOpen(false);
                        }}
                      >
                        <Check
                          className={cn(
                            "mr-2 h-3 w-3",
                            propertyId === p.id ? "opacity-100" : "opacity-0"
                          )}
                        />
                        <span className="truncate">{p.name}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>
        )}
        {isPlatformUser && collapsed && properties.length > 0 && (

          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setCollapsed(false)}
                className="p-1 rounded text-muted-foreground hover:text-foreground"
              >
                <ChevronsUpDown className="h-4 w-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Switch property</TooltipContent>
          </Tooltip>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
        {pmsNavGroups.map((group) => {
          const visibleItems = group.items.filter(
            (item) =>
              (item.platformOnly ? isPlatformUser : true) &&
              (isPlatformUser || visibleModules.includes(item.module)) &&
              isNavItemVisibleForScope(item, !!propertyId) &&
              isNavItemVisibleForAddons(item, hubspotAvailable)
          );
          if (visibleItems.length === 0) return null;
          return (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/80">
                  {group.label}
                </p>
              )}
              {collapsed && <div className="mx-auto w-6 border-t border-border/40 mb-2" />}
              <div className="space-y-0.5">
                {visibleItems.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Dark mode toggle */}
      <div className={cn("px-2 pt-2", collapsed && "flex justify-center")}>
        <ThemeToggle collapsed={collapsed} />
      </div>

      {/* Footer */}
      <div className="p-2 space-y-2 border-t border-border">
        {/* Back to ROL — platform users, property owners (with or without a staff record), not other staff */}
        {(isPlatformUser || !staffRole || staffRole === "property_owner") && (
          <button
            onClick={() => navigate("/admin/property-overview")}
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
              "hover:bg-accent hover:text-accent-foreground text-foreground/80"
            )}
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="flex-1 text-left">Back to ROL</span>}
          </button>
        )}

        <PoweredByRolOS className="pb-2" />

        <VersionBadge collapsed={collapsed} />

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center py-1.5 rounded-md text-muted-foreground hover:text-foreground transition-colors"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>
    </aside>
  );
}
