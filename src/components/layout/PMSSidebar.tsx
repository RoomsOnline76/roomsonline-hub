import { useState, useEffect } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { usePMSBrand } from "@/contexts/PMSBrandContext";
import { usePmsStaffRole } from "@/hooks/usePmsStaffRole";
import { getVisibleModules, type PmsModule } from "@/lib/pmsPermissions";
import { PoweredByRolOS } from "@/components/pms/PoweredByRolOS";
import rolLogo from "@/assets/rol-logo.png";

interface NavItem {
  title: string;
  icon: React.ElementType;
  href: string;
  module: PmsModule;
}

const pmsNavItems: NavItem[] = [
  { title: "Dashboard", icon: LayoutDashboard, href: "/pms", module: "dashboard" },
  { title: "Rooms", icon: BedDouble, href: "/pms/rooms", module: "rooms" },
  { title: "Rate Plans", icon: TrendingUp, href: "/pms/rate-plans", module: "rate-plans" },
  { title: "Guests", icon: Users, href: "/pms/guests", module: "guests" },
  { title: "Housekeeping", icon: Sparkles, href: "/pms/housekeeping", module: "housekeeping" },
  { title: "Reports", icon: BarChart3, href: "/pms/reports", module: "reports" },
  { title: "Branding", icon: Palette, href: "/pms/branding", module: "branding" },
  { title: "Integrations", icon: Code2, href: "/pms/integrations", module: "integrations" },
  { title: "Staff", icon: UserCog, href: "/pms/staff", module: "staff" },
];

export function PMSSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property");
  const { signOut } = useAuth();
  const { propertyName, logoUrl, brandEnabled } = usePMSBrand();
  const { staffRole } = usePmsStaffRole(propertyId);
  const visibleModules = getVisibleModules(staffRole);
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
          !active && "text-foreground/70"
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
            <img src={logoUrl} alt={propertyName} className="h-8 w-8 object-contain rounded" />
          ) : (
            <img src={rolLogo} alt="ROL'OS" className="h-8 w-8 object-contain" />
          )}
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-semibold text-foreground truncate">
                {propertyName || "ROL'OS PMS"}
              </span>
              <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground truncate">
                Property Management
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-1">
        {pmsNavItems
          .filter((item) => visibleModules.includes(item.module))
          .map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
      </nav>

      {/* Footer */}
      <div className="p-2 space-y-2 border-t border-border">
        {/* Back to ROL */}
        <button
          onClick={() => navigate("/admin/property-overview")}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
            "hover:bg-accent hover:text-accent-foreground text-foreground/70"
          )}
        >
          <ArrowLeft className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="flex-1 text-left">Back to ROL</span>}
        </button>

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
