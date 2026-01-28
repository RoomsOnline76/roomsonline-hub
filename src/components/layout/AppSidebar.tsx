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
  ChevronDown,
  LogOut,
  KeyRound,
  Bell,
  Newspaper,
  FileSearch,
  HelpCircle,
  HeartPulse,
  BookOpenCheck,
  UserCircle,
  Server,
  PenSquare,
  FileSignature,
  FileEdit,
  Wand2,
  Sparkles,
  TrendingUp,
  Activity,
  Database,
  Flag,
  FlaskConical,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { StatusIndicator } from "@/components/ui/status-indicator";
import rolLogo from "@/assets/rol-logo.png";
import { useHelp } from "@/contexts/HelpContext";
import { ProfileModal } from "@/components/ProfileModal";
import { RoleIndicator } from "./RoleIndicator";

// Separate component to handle optional HelpContext
function HelpNavSection({ collapsed }: { collapsed: boolean }) {
  try {
    const { openHelp } = useHelp();
    
    const link = (
      <button
        onClick={() => openHelp()}
        className={cn(
          "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
          "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
          "text-sidebar-foreground/70"
        )}
      >
        <HelpCircle className="h-4 w-4 shrink-0" />
        {!collapsed && <span className="flex-1 text-left">Help & Guidance</span>}
      </button>
    );

    return (
      <div className="mt-auto pt-4 border-t border-sidebar-border">
        <div className="space-y-1">
          {collapsed ? (
            <Tooltip>
              <TooltipTrigger asChild>{link}</TooltipTrigger>
              <TooltipContent side="right">Help & Guidance</TooltipContent>
            </Tooltip>
          ) : (
            link
          )}
        </div>
      </div>
    );
  } catch {
    // HelpContext not available - don't render help nav
    return null;
  }
}

interface NavItem {
  title: string;
  icon: React.ElementType;
  href: string;
  badge?: number;
  requireAdmin?: boolean;
  requireDev?: boolean;
  requireDevOrFearless?: boolean;
}

const workspaceItems: NavItem[] = [
  { title: "Properties", icon: Building2, href: "/admin/property-overview" },
  { title: "Calendar", icon: CalendarDays, href: "/admin/calendar/accommodation" },
  { title: "Bookings", icon: BookOpen, href: "/admin/bookings" },
];

const insightsItems: NavItem[] = [
  { title: "Property Pulse", icon: BarChart3, href: "/dashboard/reports" },
  { title: "Revenue Pulse", icon: TrendingUp, href: "/pulse", requireDevOrFearless: true },
  { title: "Intelligence", icon: Search, href: "/dashboard/insights", requireDevOrFearless: true },
];

// Settings - Admin only
const coreSettingsItems: NavItem[] = [
  { title: "Team", icon: Users, href: "/admin-users", requireAdmin: true },
  { title: "Contracts", icon: FileSignature, href: "/admin/contracts", requireAdmin: true },
  { title: "Onboarding", icon: Sparkles, href: "/admin/onboarding", requireAdmin: true },
];

// Edit & Audit menu - Admin only content management
const editAuditItems: NavItem[] = [
  { title: "Journals", icon: Newspaper, href: "/admin/journals", requireAdmin: true },
  { title: "Help Articles", icon: BookOpenCheck, href: "/admin/help-articles", requireAdmin: true },
  { title: "Contract Editor", icon: FileEdit, href: "/admin/contract-editor", requireAdmin: true },
  { title: "Wizard Editor", icon: Wand2, href: "/admin/wizard-editor", requireAdmin: true },
  { title: "Audit Log", icon: FileSearch, href: "/admin/audit", requireAdmin: true },
];

// System menu - Dev/Fearless Leader technical items (Integrations dev-only)
const systemItems: NavItem[] = [
  { title: "System Overview", icon: Activity, href: "/dev/overview", requireDev: true },
  { title: "PMS Control", icon: Server, href: "/dev/pms", requireDev: true },
  { title: "Integrations", icon: KeyRound, href: "/admin-keys", requireDev: true },
  { title: "Supporting Systems", icon: Settings, href: "/admin/supporting-systems", requireDevOrFearless: true },
  { title: "System Health", icon: HeartPulse, href: "/admin/system-health", requireDevOrFearless: true },
  { title: "Data & Logs", icon: Database, href: "/dev/logs", requireDev: true },
  { title: "Feature Flags", icon: Flag, href: "/dev/features", requireDev: true },
  { title: "AI Testing", icon: FlaskConical, href: "/dev/testing", requireDev: true },
  { title: "Danger Zone", icon: AlertTriangle, href: "/dev/danger", requireDev: true },
];

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, isDev, isFearlessLeader, profile, userRole, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved ? JSON.parse(saved) : false;
  });
  const [systemOpen, setSystemOpen] = useState(false);
  const [editAuditOpen, setEditAuditOpen] = useState(false);
  const [pendingRequests, setPendingRequests] = useState(0);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  
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
    if (item.requireDevOrFearless && !isDev && !isFearlessLeader) return false;
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

  // Collapsible menu component
  const CollapsibleMenu = ({ 
    title, 
    icon: Icon, 
    items, 
    open, 
    onOpenChange,
    extraItems,
  }: { 
    title: string; 
    icon: React.ElementType; 
    items: NavItem[]; 
    open: boolean; 
    onOpenChange: (open: boolean) => void;
    extraItems?: React.ReactNode;
  }) => {
    const hasVisibleItems = items.some(item => canAccess(item)) || extraItems;
    if (!hasVisibleItems) return null;

    return (
      <Collapsible open={open} onOpenChange={onOpenChange}>
        <CollapsibleTrigger asChild>
          <button
            className={cn(
              "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
              "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "text-sidebar-foreground/70"
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && (
              <>
                <span className="flex-1 text-left text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">{title}</span>
                <ChevronDown className={cn("h-3 w-3 transition-transform", open && "rotate-180")} />
              </>
            )}
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent className="space-y-1 mt-1">
          {items.map((item) => (
            <NavLink key={item.href} item={item} />
          ))}
          {extraItems}
        </CollapsibleContent>
      </Collapsible>
    );
  };

  return (
    <aside
      className={cn(
        "h-screen sticky top-0 flex flex-col bg-sidebar border-r border-sidebar-border transition-all duration-300",
        collapsed ? "w-16" : "w-60"
      )}
    >
      {/* Logo & Role Indicator */}
      <div className={cn("flex flex-col gap-2 p-4 border-b border-sidebar-border", collapsed && "items-center")}>
        <div className={cn("flex items-center gap-3", collapsed && "justify-center")}>
          <img src={rolLogo} alt="ROL" className="h-8 w-8 object-contain" />
          {!collapsed && (
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-sidebar-foreground">RoomsOnline</span>
              <span className="text-[9px] uppercase tracking-[0.15em] text-sidebar-foreground/50">Rooms done Right</span>
            </div>
          )}
        </div>
        {!collapsed && <RoleIndicator role={userRole} className="self-start" />}
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

        {/* Settings - Admin only (not collapsible, always visible) */}
        {isAdmin && (
          <div>
            <SectionLabel>Admin</SectionLabel>
            <div className="space-y-1">
              {coreSettingsItems.map((item) => (
                <NavLink key={item.href} item={item} />
              ))}
              {pendingRequests > 0 && (
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

        {/* System - Dev/Fearless Leader (collapsible, collapsed by default) */}
        {(isDev || isFearlessLeader) && (
          <div>
            <Collapsible open={systemOpen} onOpenChange={setSystemOpen}>
              <CollapsibleTrigger asChild>
                <button
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    "text-sidebar-foreground/70"
                  )}
                >
                  <Server className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">System</span>
                      <ChevronDown className={cn("h-3 w-3 transition-transform", systemOpen && "rotate-180")} />
                    </>
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 mt-1">
                {systemItems.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Edit & Audit - Admin only (collapsible, collapsed by default) */}
        {isAdmin && (
          <div>
            <Collapsible open={editAuditOpen} onOpenChange={setEditAuditOpen}>
              <CollapsibleTrigger asChild>
                <button
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
                    "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    "text-sidebar-foreground/70"
                  )}
                >
                  <PenSquare className="h-4 w-4 shrink-0" />
                  {!collapsed && (
                    <>
                      <span className="flex-1 text-left text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">Edit & Audit</span>
                      <ChevronDown className={cn("h-3 w-3 transition-transform", editAuditOpen && "rotate-180")} />
                    </>
                  )}
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-1 mt-1">
                {editAuditItems.map((item) => (
                  <NavLink key={item.href} item={item} />
                ))}
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Help - visible to all authenticated users */}
        <HelpNavSection collapsed={collapsed} />
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
              <button onClick={() => setProfileModalOpen(true)}>
                <Avatar className="h-8 w-8 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
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
                <p className="text-muted-foreground">Click to edit profile</p>
              </div>
            </TooltipContent>
          </Tooltip>
        ) : (
          <div className="flex items-center gap-3">
            <button onClick={() => setProfileModalOpen(true)}>
              <Avatar className="h-8 w-8 cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all">
                <AvatarImage src={profile?.avatar_url || undefined} />
                <AvatarFallback className="text-xs bg-primary/10 text-primary">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
            </button>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{profile?.full_name || "User"}</p>
              <p className="text-[10px] text-muted-foreground">{isDev ? "Developer" : isFearlessLeader ? "Fearless Leader" : isAdmin ? "Admin" : "Owner"}</p>
            </div>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleSignOut}>
                  <LogOut className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top">Sign out</TooltipContent>
            </Tooltip>
          </div>
        )}
      </div>

      <ProfileModal 
        open={profileModalOpen} 
        onOpenChange={setProfileModalOpen}
      />
    </aside>
  );
}