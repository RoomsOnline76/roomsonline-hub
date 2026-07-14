import { Link, useNavigate, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Key, LogOut, User, ChevronDown, Shield, Calendar, Megaphone, BookOpen, PieChart, UserPlus, Activity, Newspaper, Sparkles, Home } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pmsIntegrationStatus, getCompletedMilestoneCount, getTotalMilestoneCount } from "@/components/ApiMilestones";
import { ProfileModal } from "@/components/ProfileModal";
import { useBookOpenNewTab } from "@/hooks/useFeatureFlags";
import rolLogo from "@/assets/rol-logo.png";

interface HealthIssue {
  system: string;
  reason: string;
}

export const Navbar = () => {
  const { user, isAdmin, isDev, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<any>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [apiHealthStatus, setApiHealthStatus] = useState<{ healthy: number; unhealthy: number; issues: HealthIssue[] }>({ healthy: 0, unhealthy: 0, issues: [] });
  const { openNewTab: bookOpenNewTab } = useBookOpenNewTab();
  
  const isSleepInAfricaDomain = window.location.hostname === "sleepinafrica.roomsonline.co.za" || 
                                 window.location.hostname === "book.sleepinafrica.roomsonline.co.za" ||
                                 window.location.hostname.includes("lovable.app") ||
                                 window.location.hostname === "localhost";
  const isBookDomain = window.location.hostname === "book.sleepinafrica.roomsonline.co.za";
  const isBookPage = isBookDomain || location.pathname === "/book" || location.pathname.startsWith("/book/");
  
  // Hide navbar completely on the public booking domain
  if (isBookDomain) {
    return null;
  }

  useEffect(() => {
    if (user) {
      loadProfile();
    }
  }, [user]);

  useEffect(() => {
    if (isAdmin || isDev) {
      loadPendingRequestsCount();
      checkApiHealth();
    }
  }, [isAdmin, isDev]);

  // bookOpenNewTab now comes from useFeatureFlags hook

  // Check health of commissioned APIs based on milestone completion AND data freshness
  const checkApiHealth = async () => {
    let healthy = 0;
    let unhealthy = 0;
    const issues: HealthIssue[] = [];
    const totalMilestones = getTotalMilestoneCount();

    // Check milestone completion for all PMS systems
    Object.keys(pmsIntegrationStatus).forEach((systemType) => {
      const completed = getCompletedMilestoneCount(systemType);
      if (completed === totalMilestones) {
        // Milestone complete - will check data freshness next
      } else if (completed > 0) {
        // Partial implementation
        unhealthy++;
        issues.push({ system: systemType, reason: `${completed}/${totalMilestones} milestones` });
      }
      // If completed === 0, the API is not yet commissioned, don't count it
    });

    // Check data freshness for active PMS systems with API data sync
    try {
      // Get active PMS credentials with refresh intervals
      const { data: credentials } = await supabase
        .from("pms_credentials")
        .select("system_type, refresh_interval_minutes, is_active")
        .eq("is_active", true);

      if (credentials && credentials.length > 0) {
        for (const cred of credentials) {
          // Skip external redirect systems (nightsbridge) - they don't have cached data
          if (cred.system_type === 'nightsbridge') {
            // NightsBridge is always healthy if configured
            const alreadyCounted = issues.some(i => i.system === 'nightsbridge');
            if (!alreadyCounted) {
              healthy++;
            }
            continue;
          }

          // Check latest fetched_at from availability cache for this system
          const { data: cacheData } = await supabase
            .from("pms_availability_cache")
            .select("fetched_at")
            .eq("system_type", cred.system_type)
            .order("fetched_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          const refreshIntervalMs = (cred.refresh_interval_minutes || 60) * 60 * 1000;
          const now = Date.now();

          if (!cacheData?.fetched_at) {
            // No data synced yet
            const alreadyCounted = issues.some(i => i.system === cred.system_type);
            if (!alreadyCounted) {
              unhealthy++;
              issues.push({ system: cred.system_type, reason: "No sync data" });
            }
          } else {
            const fetchedAt = new Date(cacheData.fetched_at).getTime();
            const ageMs = now - fetchedAt;
            
            if (ageMs > refreshIntervalMs) {
              // Data is stale
              const ageMinutes = Math.round(ageMs / 60000);
              const alreadyCounted = issues.some(i => i.system === cred.system_type);
              if (!alreadyCounted) {
                unhealthy++;
                issues.push({ system: cred.system_type, reason: `Stale (${ageMinutes}m ago)` });
              }
            } else {
              // Data is fresh and milestones complete
              const hasIssue = issues.some(i => i.system === cred.system_type);
              if (!hasIssue) {
                healthy++;
              }
            }
          }
        }
      }
    } catch (error) {
      console.error("Error checking API health:", error);
    }

    setApiHealthStatus({ healthy, unhealthy, issues });
  };

  const loadProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .single();
    
    if (data) {
      setProfile(data);
    }
  };

  const loadPendingRequestsCount = async () => {
    const { count } = await supabase
      .from("access_requests")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");
    
    setPendingRequestsCount(count || 0);
  };

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase();
    }
    if (profile?.email) {
      return profile.email.substring(0, 2).toUpperCase();
    }
    return "U";
  };

  const handleProfileUpdate = () => {
    loadProfile();
  };

  return (
    <nav className="border-b border-border bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <Link to="/dashboard/reports" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
            <img src={rolLogo} alt="RoomsOnline" className="h-10 w-auto" />
            <h1 className="text-xl font-bold text-foreground">RoomsOnline</h1>
          </Link>

          <div className="flex items-center gap-4">
            {!isBookPage && (
              bookOpenNewTab ? (
                <a 
                  href="https://book.sleepinafrica.roomsonline.co.za" 
                  target="_blank" 
                  rel="noopener noreferrer"
                >
                  <Button variant="ghost">
                    Book
                  </Button>
                </a>
              ) : (
                <Button variant="ghost" onClick={() => navigate('/book')}>
                  Book
                </Button>
              )
            )}
            {user && !isBookPage && (
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2">
                      Admin
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 bg-background">
                    <DropdownMenuItem onClick={() => navigate('/admin/property-overview')}>
                      <Home className="mr-2 h-4 w-4" />
                      Property overview
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/admin/calendar/accommodation')}>
                      <Calendar className="mr-2 h-4 w-4" />
                      Calendar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/admin/bookings')}>
                      <BookOpen className="mr-2 h-4 w-4" />
                      Bookings
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2">
                      Dashboard
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-56 bg-background">
                    <DropdownMenuItem onClick={() => navigate('/dashboard/reports')}>
                      <PieChart className="mr-2 h-4 w-4" />
                      Reports
                    </DropdownMenuItem>
                    {(isAdmin || isDev) && (
                      <DropdownMenuItem onClick={() => navigate('/dashboard/insights')}>
                        <Sparkles className="mr-2 h-4 w-4" />
                        Insights
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            {(isAdmin || isDev) && isSleepInAfricaDomain && !isBookPage && (
              <Link to="/admin/journals">
                <Button variant="ghost" className="flex items-center gap-2">
                  <Newspaper className="h-4 w-4" />
                  Journal
                </Button>
              </Link>
            )}
            {isAdmin && !isBookPage && (
              <>
                <Link to="/admin-users">
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Shield className="h-4 w-4" />
                    Users
                  </Button>
                </Link>
                <Link to="/admin/access-requests">
                  <Button variant="ghost" className="flex items-center gap-2 relative">
                    <UserPlus className="h-4 w-4" />
                    Access Requests
                    {pendingRequestsCount > 0 && (
                      <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-xs">
                        {pendingRequestsCount}
                      </Badge>
                    )}
                  </Button>
                </Link>
              </>
            )}
            {isDev && !isBookPage && (
              <Link to="/admin-keys">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button variant="ghost" className="flex items-center gap-2 relative">
                      <Key className="h-4 w-4" />
                      API Keys
                      {apiHealthStatus.unhealthy > 0 ? (
                        <Badge variant="destructive" className="ml-1 h-5 min-w-5 px-1 text-xs flex items-center gap-0.5">
                          <Activity className="h-3 w-3" />
                          {apiHealthStatus.unhealthy}
                        </Badge>
                      ) : apiHealthStatus.healthy > 0 ? (
                        <Badge className="ml-1 h-5 min-w-5 px-1 text-xs bg-green-500 hover:bg-green-600 flex items-center gap-0.5">
                          <Activity className="h-3 w-3" />
                          {apiHealthStatus.healthy}
                        </Badge>
                      ) : null}
                    </Button>
                  </TooltipTrigger>
                  {apiHealthStatus.issues.length > 0 && (
                    <TooltipContent side="bottom" className="max-w-xs">
                      <div className="space-y-1">
                        <p className="font-medium text-destructive">Unhealthy APIs:</p>
                        {apiHealthStatus.issues.map((issue, idx) => (
                          <p key={idx} className="text-xs">
                            <span className="capitalize font-medium">{issue.system}</span>: {issue.reason}
                          </p>
                        ))}
                      </div>
                    </TooltipContent>
                  )}
                </Tooltip>
              </Link>
            )}
            {user && !isBookPage ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2 h-auto py-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={profile?.avatar_url} />
                      <AvatarFallback className="text-xs">{getInitials()}</AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start">
                      <span className="text-sm font-medium">{profile?.full_name || profile?.email || user.email}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {isDev ? "Dev" : isAdmin ? "Admin" : "Property Owner"}
                      </span>
                    </div>
                    <ChevronDown className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setProfileModalOpen(true)}>
                    <User className="mr-2 h-4 w-4" />
                    Your profile
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={signOut}>
                    <LogOut className="mr-2 h-4 w-4" />
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : !isBookPage ? (
              <Link to="/auth">
                <Button variant="default">Sign In</Button>
              </Link>
            ) : null}
          </div>
        </div>
      </div>

      <ProfileModal 
        open={profileModalOpen} 
        onOpenChange={setProfileModalOpen}
        onProfileUpdate={handleProfileUpdate}
      />
    </nav>
  );
};
