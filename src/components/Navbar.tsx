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
import { Building2, Key, LogOut, User, ChevronDown, Shield, Calendar, Megaphone, BookOpen, PieChart, UserPlus, Activity } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { pmsIntegrationStatus, getCompletedMilestoneCount, getTotalMilestoneCount } from "@/components/ApiMilestones";
import { ProfileModal } from "@/components/ProfileModal";

export const Navbar = () => {
  const { user, isAdmin, isDev, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [profile, setProfile] = useState<any>(null);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [apiHealthStatus, setApiHealthStatus] = useState<{ healthy: number; unhealthy: number }>({ healthy: 0, unhealthy: 0 });
  
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
    if (isAdmin) {
      loadPendingRequestsCount();
      checkApiHealth();
    }
  }, [isAdmin]);

  // Check health of commissioned APIs based on milestone completion
  // An API is considered "healthy" if it has completed all 7 milestones
  // An API is considered "unhealthy" if it has some milestones but not all (partial implementation)
  const checkApiHealth = () => {
    let healthy = 0;
    let unhealthy = 0;
    const totalMilestones = getTotalMilestoneCount();

    Object.keys(pmsIntegrationStatus).forEach((systemType) => {
      const completed = getCompletedMilestoneCount(systemType);
      if (completed === totalMilestones) {
        healthy++;
      } else if (completed > 0) {
        // Partial implementation - consider as needs attention
        unhealthy++;
      }
      // If completed === 0, the API is not yet commissioned, don't count it
    });

    setApiHealthStatus({ healthy, unhealthy });
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
            <div className="h-10 w-10 rounded-lg bg-[var(--hero-gradient)] flex items-center justify-center">
              <Building2 className="h-6 w-6 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">RoomsOnline</h1>
              <p className="text-xs text-muted-foreground">Unified Booking Engine</p>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            {!isBookPage && (
              <Button 
                variant="ghost" 
                onClick={() => navigate('/book')}
              >
                Book
              </Button>
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
                      <Building2 className="mr-2 h-4 w-4" />
                      Property overview
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/admin/calendar/accommodation')}>
                      <Calendar className="mr-2 h-4 w-4" />
                      Calendar
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => navigate('/admin/promotion')}>
                      <Megaphone className="mr-2 h-4 w-4" />
                      Promotion
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
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            )}
            {isDev && !isBookPage && (
              <Link to="/admin-keys">
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
