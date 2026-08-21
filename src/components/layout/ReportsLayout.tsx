import { useState } from "react";
import { Link, NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  BarChart3,
  FilePlus2,
  HelpCircle,
  LogOut,
  Menu,
  Settings2,
  ShieldAlert,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import rolWreathLogo from "@/assets/rol-wreath-logo.jpg";

const NAV_ITEMS = [
  { label: "Dashboard", to: "/", icon: BarChart3, end: true },
  { label: "New Report", to: "/new", icon: FilePlus2 },
  { label: "Property Settings", to: "/settings", icon: Settings2 },
  { label: "Help", to: "/help", icon: HelpCircle },
];

/**
 * Role guard for the Revenue Reports subdomain.
 *
 * Access is limited to admin / dev / fearless_leader. Authenticated users
 * without those roles get an explicit denial panel rather than a redirect
 * bounce, so it is obvious why the surface is empty.
 */
function ReportsRouteGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, isAdmin, isDev, isFearlessLeader, signOut } = useAuth();
  const navigate = useNavigate();
  const allowed = isAdmin || isDev || isFearlessLeader;

  if (loading) {
    return (
      <div className="min-h-screen bg-background p-6 space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-4 w-80" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  if (!user) {
    navigate("/auth", { replace: true });
    return null;
  }

  if (!allowed) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <Card className="max-w-md w-full">
          <CardHeader className="space-y-2">
            <ShieldAlert className="h-6 w-6 text-muted-foreground" />
            <CardTitle className="text-lg">Revenue Reports is restricted</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm text-muted-foreground">
            <p>
              This workspace is available to Rooms Online administrators only. If you
              believe you should have access, ask an administrator to grant it.
            </p>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut className="h-4 w-4 mr-2" />
              Sign out
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

export function ReportsLayout() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { profile, user, signOut } = useAuth();
  const displayName = profile?.full_name || user?.email || "Signed in";

  return (
    <ReportsRouteGuard>
      <div className="min-h-screen bg-background text-foreground flex flex-col">
        {/* ─── Top bar ────────────────────────────────────────── */}
        <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
          <div className="flex h-16 items-center justify-between px-4 sm:px-6">
            <Link to="/" className="flex items-center gap-2.5 shrink-0">
              <img
                src={rolWreathLogo}
                alt="Rooms Online"
                className="h-9 w-9 rounded-lg object-contain"
              />
              <span className="text-lg font-semibold tracking-tight hidden sm:block">
                roomsonline{" "}
                <span className="font-normal text-muted-foreground">Revenue Reports</span>
              </span>
            </Link>

            <div className="flex items-center gap-3">
              <span className="hidden sm:block text-sm text-muted-foreground truncate max-w-[220px]">
                {displayName}
              </span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void signOut()}
                className="text-muted-foreground"
              >
                <LogOut className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Sign out</span>
              </Button>
              <button
                onClick={() => setMobileOpen((v) => !v)}
                className="md:hidden p-2 rounded-md hover:bg-muted"
                aria-label="Toggle navigation"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>
          </div>

          {mobileOpen && (
            <nav className="md:hidden border-t px-3 py-2 space-y-1">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium",
                      isActive
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                    )
                  }
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          )}
        </header>

        <div className="flex flex-1">
          {/* ─── Left nav ─────────────────────────────────────── */}
          <aside className="hidden md:flex w-60 shrink-0 border-r flex-col gap-1 p-4">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    "flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                  )
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </aside>

          {/* ─── Content ─────────────────────────────────────── */}
          <main className="flex-1 min-w-0 px-4 py-6 sm:px-8 sm:py-10">
            <div className="mx-auto w-full max-w-6xl">
              <Outlet />
            </div>
          </main>
        </div>

        <footer className="border-t py-4 px-4 sm:px-8 text-xs text-muted-foreground">
          Rooms Online · Revenue Reports · www.roomsonline.co.za
        </footer>
      </div>
    </ReportsRouteGuard>
  );
}
