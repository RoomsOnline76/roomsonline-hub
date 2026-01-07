import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Building2,
  CalendarDays,
  BookOpen,
  BarChart3,
  Search,
  Users,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  KeyRound,
  Bell,
  Megaphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { StatusIndicator } from "@/components/ui/status-indicator";
import rolLogo from "@/assets/rol-logo.png";

interface NavItem {
  title: string;
  icon: React.ElementType;
  href: string;
  badge?: number;
  requireAdmin?: boolean;
  requireDev?: boolean;
}

const workspaceItems: NavItem[] = [
  { title: "Properties", icon: Building2, href: "/admin/property-overview" },
  { title: "Calendar", icon: CalendarDays, href: "/admin/calendar/accommodation" },
  { title: "Bookings", icon: BookOpen, href: "/admin/bookings" },
  { title: "Promotions", icon: Megaphone, href: "/admin/promotion" },
];

const insightsItems: NavItem[] = [
  { title: "Revenue Pulse", icon: BarChart3, href: "/dashboard/reports" },
  { title: "Search Intelligence", icon: Search, href: "/dashboard/insights", requireAdmin: true },
];

const settingsItems: NavItem[] = [
  { title: "Team", icon: Users, href: "/admin-users", requireAdmin: true },
  { title: "Integrations", icon: KeyRound, href: "/admin-keys", requireDev: true },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, isDev, profile, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved ? JSON.parse(saved) : false;
  });
  const [pendingRequests, setPendingRequests] = useState(0);

  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", JSON.stringify(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (isAdmin) {
      loadPendingRequests();
    }
  }, [isAdmin]);

  const loadPendingRequests = async () => {
    const { count } = await supabase
      .from("access_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    setPendingRequests(count || 0);
  };

  const isActive = (href: string) => location.pathname === href;
  
  const canAccess = (item: NavItem) => {
    if (item.requireDev && !isDev) return false;
    if (item.requireAdmin && !isAdmin) return false;
    return true;
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase();
    }
    return user?.email?.substring(0, 2).toUpperCase() || "?";
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/auth");
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    if (!canAccess(item)) return null;
    
    const active = isActive(item.href);
    const Icon = item.icon;

    const link = (
      <button
        onClick={() => navigate(item.href)}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          active && "bg-sidebar-accent text-sidebar-primary border-l-2 border-sidebar-primary",
          !active && "text-sidebar-foreground/70"
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        {!collapsed && (
          <>
            <span className="flex-1 text-left">{item.title}</span>
            {item.badge && item.badge > 0 && (
              <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
                {item.badge}
              </span>
            )}
          </>
        )}
      </button>
    );

    if (collapsed) {
      return (
        <Tooltip>
          <TooltipTrigger asChild>{link}</TooltipTrigger>
          <TooltipContent side="right" className="flex items-center gap-2">
            {item.title}
            {item.badge && item.badge > 0 && (
              <span className="h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
                {item.badge}
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      );
    }

    return link;
  };

  const SectionLabel = ({ children }: { children: React.ReactNode }) => {
    if (collapsed) return null;
    return (
      <div className="px-3 py-2">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
          {children}
        </span>
      </div>
    );
  };

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo */}
      <div className={cn("flex items-center gap-3 p-4 border-b border-sidebar-border", collapsed && "justify-center")}>
        <img src={rolLogo} alt="ROL" className="h-8 w-8 object-contain" />
        {!collapsed && (
          <div className="flex flex-col">
            <span className="text-sm font-semibold text-sidebar-foreground">RoomsOnline</span>
            <span className="text-[10px] text-sidebar-foreground/50">Unified Booking</span>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {/* Workspace */}
        <div>
          <SectionLabel>Workspace</SectionLabel>
          <div className="space-y-1">
            {workspaceItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* Insights */}
        <div>
          <SectionLabel>Insights</SectionLabel>
          <div className="space-y-1">
            {insightsItems.map((item) => (
              <NavLink key={item.href} item={item} />
            ))}
          </div>
        </div>

        {/* Settings */}
        {(isAdmin || isDev) && (
          <div>
            <SectionLabel>Settings</SectionLabel>
            <div className="space-y-1">
              {settingsItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
              {isAdmin && pendingRequests > 0 && (
                <NavLink
                  item={{
                    title: "Access Requests",
                    icon: Bell,
                    href: "/admin/access-requests",
                    badge: pendingRequests,
                    requireAdmin: true,
                  }}
                />
              )}
            </div>
          </div>
        )}
      </nav>

      {/* Collapse Toggle */}
      <div className="px-2 py-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setCollapsed(!collapsed)}
          className={cn("w-full justify-center", !collapsed && "justify-start")}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4 mr-2" />
              <span className="text-xs">Collapse</span>
            </>
          )}
        </Button>
      </div>

      {/* User */}
      <div className={cn("p-3 border-t border-sidebar-border", collapsed && "flex justify-center")}>
        {collapsed ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <button onClick={handleSignOut}>
                <Avatar className="h-8 w-8">
                  <AvatarImage src={profile?.avatar_url || undefined} />
                  <AvatarFallback className="text-xs bg-primary/10 text-primary">
                    {getInitials()}
                  </AvatarFallback>
                </Avatar>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">
              <div className="text-xs">
                <p className="font-medium">{profile?.full_name || user?.email}</p>
                <p className="text-muted-foreground">Click to sign out</p>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url || undefined} />
              <AvatarFallback className="text-xs bg-primary/10 text-primary">
                {getInitials()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{profile?.full_name || "User"}</p>
              <p className="text-[10px] text-muted-foreground capitalize">{isDev ? "Developer" : isAdmin ? "Admin" : "Owner"}</p>
            </div>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSignOut}>
              <LogOut className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </aside>
  );
}
