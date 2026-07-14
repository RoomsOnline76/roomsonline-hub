import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { usePMSBrand } from "@/contexts/PMSBrandContext";
import { usePmsStaffRole } from "@/hooks/usePmsStaffRole";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { getVisibleModules, type PmsModule } from "@/lib/pmsPermissions";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import rolLogo from "@/assets/rol-logo.png";
import { ThemeToggle } from "@/components/ThemeToggle";

interface NavItem {
  title: string;
  icon: React.ElementType;
  href: string;
  module: PmsModule;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const pmsNavGroups: NavGroup[] = [
  {
    label: "Operations",
    items: [
      { title: "Dashboard", icon: LayoutDashboard, href: "/pms", module: "dashboard" },
      { title: "Command Centre", icon: Radar, href: "/pms/command-centre", module: "command-centre" },
      { title: "Rooms", icon: BedDouble, href: "/pms/rooms", module: "rooms" },
      { title: "Guests", icon: Users, href: "/pms/guests", module: "guests" },
      { title: "Housekeeping", icon: Sparkles, href: "/pms/housekeeping", module: "housekeeping" },
    ],
  },
  {
    label: "Revenue",
    items: [
      { title: "Property Setup", icon: SlidersHorizontal, href: "/pms/property-setup", module: "property-setup" },
      { title: "Rate Plans", icon: TrendingUp, href: "/pms/rate-plans", module: "rate-plans" },
      { title: "Revenue Mgmt", icon: Gauge, href: "/pms/revenue", module: "revenue" },
      { title: "Channels", icon: Radio, href: "/pms/channels", module: "channels" },
      { title: "Groups", icon: UsersRound, href: "/pms/groups", module: "groups" },
      { title: "Events", icon: CalendarHeart, href: "/pms/events", module: "events" },
    ],
  },
  {
    label: "Management",
    items: [
      { title: "Portfolio", icon: Building2, href: "/pms/portfolio", module: "portfolio" },
      { title: "Night Audit", icon: Moon, href: "/pms/night-audit", module: "night-audit" },
      { title: "Messaging", icon: MessageSquare, href: "/pms/messaging", module: "messaging" },
      { title: "Reports", icon: BarChart3, href: "/pms/reports", module: "reports" },
      { title: "Staff", icon: UserCog, href: "/pms/staff", module: "staff" },
      { title: "Branding", icon: Palette, href: "/pms/branding", module: "branding" },
      { title: "Integrations", icon: Code2, href: "/pms/integrations", module: "integrations" },
    ],
  },
];

export function PMSSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { signOut, isDev, isAdmin, isFearlessLeader } = useAuth();
  const { propertyId, properties, switchProperty, portfolioName } = usePmsPropertyId();
  const { propertyName, logoUrl, brandEnabled } = usePMSBrand();
  const { staffRole } = usePmsStaffRole(propertyId);
  const visibleModules = getVisibleModules(staffRole);
  const isPlatformUser = isDev || isAdmin || isFearlessLeader;
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("pms-sidebar-collapsed");
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem("pms-sidebar-collapsed", JSON.stringify(collapsed));
  }, [collapsed]);

  const isActive = (href: string) => location.pathname === href;

  const navigateWithProperty = (href: string) => {
    const params = propertyId ? `?property=${propertyId}` : "";
    navigate(`${href}${params}`);
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    const active = isActive(item.href);
    const Icon = item.icon;

    const link = (
      <button
        onClick={() => navigateWithProperty(item.href)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
          "hover:bg-accent hover:text-accent-foreground",
          active && "bg-accent text-primary border-l-2 border-primary",
          !active && "text-foreground/80"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="flex-1 text-left">{item.title}</span>}
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

        {/* Property switcher for platform users */}
        {isPlatformUser && !collapsed && properties.length > 0 && (
          <Select value={propertyId || ""} onValueChange={switchProperty}>
            <SelectTrigger className="h-8 text-xs bg-muted/50 border-border/50">
              <SelectValue placeholder="Select ROL'OS property…" />
            </SelectTrigger>
            <SelectContent>
              {properties.map((p) => (
                <SelectItem key={p.id} value={p.id} className="text-xs">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
          const visibleItems = group.items.filter((item) => visibleModules.includes(item.module));
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
        {/* Back to ROL — only for platform users (admin/dev/fearless) and property owners, not staff */}
        {(isPlatformUser || !staffRole) && (
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
