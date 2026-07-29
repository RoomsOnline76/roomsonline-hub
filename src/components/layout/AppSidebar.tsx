import { useState, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  LogOut,
  Bell,
  HelpCircle,
  BedDouble,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import rolLogo from "@/assets/rol-logo.png";
import { useHelp } from "@/contexts/HelpContext";
import { ProfileModal } from "@/components/ProfileModal";
import { ThemeToggle } from "@/components/ThemeToggle";
import { RoleIndicator } from "./RoleIndicator";
import { navigationConfig, type NavItem, type NavSection } from "@/config/navigation";
import { hasMinRole, type UserRole } from "@/lib/permissions";

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
    return null;
  }
}

export function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAdmin, isDev, isFearlessLeader, profile, userRole, signOut } = useAuth();
  const [collapsed, setCollapsed] = useState(() => {
    const saved = localStorage.getItem("sidebar-collapsed");
    return saved ? JSON.parse(saved) : false;
  });
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [pendingRequests, setPendingRequests] = useState(0);
  const [reviewQueueCount, setReviewQueueCount] = useState(0);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [hasRolProperties, setHasRolProperties] = useState(false);
  
  useEffect(() => {
    localStorage.setItem("sidebar-collapsed", JSON.stringify(collapsed));
  }, [collapsed]);

  useEffect(() => {
    if (isAdmin || isDev) {
      loadPendingRequests();
      loadReviewQueueCount();
    }
  }, [isAdmin, isDev]);


  useEffect(() => {
    const checkRolProperties = async () => {
      if (!user) return;
      if (isDev || isAdmin) {
        setHasRolProperties(true);
        return;
      }
      const { count } = await supabase
        .from("properties")
        .select("id", { count: "exact", head: true })
        .eq("is_rol_property", true);
      setHasRolProperties((count || 0) > 0);
    };
    checkRolProperties();
  }, [user, isDev, isAdmin]);

  const loadPendingRequests = async () => {
    const { count } = await supabase
      .from("access_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    setPendingRequests(count || 0);
  };

  const isActive = (href: string) => location.pathname === href;

  const canAccessItem = (item: NavItem) => {
    return hasMinRole(userRole as UserRole, item.minRole);
  };

  const canAccessSection = (section: NavSection) => {
    // PMS section has special visibility logic
    if (section.id === 'pms' && !hasRolProperties) return false;
    return hasMinRole(userRole as UserRole, section.minRole);
  };

  const toggleSection = (sectionId: string) => {
    setCollapsedSections(prev => ({ ...prev, [sectionId]: !prev[sectionId] }));
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(" ").map(n => n[0]).join("").toUpperCase();
    }
    return user?.email?.substring(0, 2).toUpperCase() || "?";
  };

  const handleSignOut = async () => {
    await signOut();
    // Hard replace so React Query caches and other providers cannot
    // re-hydrate a stale user on the /auth screen.
    window.location.replace("/auth");
  };

  // Get badge for a nav item (special case: access requests)
  const getBadge = (item: NavItem): number | undefined => {
    if (item.id === 'access-requests' && pendingRequests > 0) return pendingRequests;
    return item.badge;
  };

  const NavLink = ({ item }: { item: NavItem }) => {
    if (!canAccessItem(item)) return null;
    
    const active = isActive(item.href);
    const Icon = item.icon;
    const badge = getBadge(item);

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
            {badge && badge > 0 && (
              <span className="h-5 min-w-5 px-1.5 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
                {badge}
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
            {badge && badge > 0 && (
              <span className="h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-medium flex items-center justify-center">
                {badge}
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

  const renderSection = (section: NavSection) => {
    if (!canAccessSection(section)) return null;

    const visibleItems = section.items.filter(canAccessItem);
    if (visibleItems.length === 0) return null;

    const SectionIcon = section.icon;

    if (section.collapsible) {
      const isOpen = collapsedSections[section.id] ?? (section.defaultOpen ?? false);

      return (
        <div key={section.id}>
          <Collapsible open={isOpen} onOpenChange={() => toggleSection(section.id)}>
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-all",
                  "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                  "text-sidebar-foreground/70"
                )}
              >
                <SectionIcon className="h-4 w-4 shrink-0" />
                {!collapsed && (
                  <>
                    <span className="flex-1 text-left text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/50">
                      {section.label}
                    </span>
                    <ChevronDown className={cn("h-3 w-3 transition-transform", isOpen && "rotate-180")} />
                  </>
                )}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="space-y-1 mt-1">
              {visibleItems.map((item) => (
                <NavLink key={item.id} item={item} />
              ))}
            </CollapsibleContent>
          </Collapsible>
        </div>
      );
    }

    // Non-collapsible: flat list with section label
    return (
      <div key={section.id}>
        <SectionLabel>{section.label}</SectionLabel>
        <div className="space-y-1">
          {visibleItems.map((item) => (
            <NavLink key={item.id} item={item} />
          ))}
        </div>
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

      {/* Navigation - rendered dynamically from navigationConfig */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {navigationConfig.map(renderSection)}

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

      {/* Dark mode toggle */}
      <div className={cn("px-3 pt-2", collapsed && "flex justify-center")}>
        <ThemeToggle collapsed={collapsed} />
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
