import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import {
  guestHostPath,
  isGuestBookingHost,
  resolveGuestHostTarget,
  resolveGuestHostTargetSync,
} from "@/lib/guestDomain";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireDev?: boolean;
  requireDevOrFearless?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false, requireDev = false, requireDevOrFearless = false }: ProtectedRouteProps) {
  const { user, loading, isAdmin, isDev, isFearlessLeader } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // Public guest booking hosts (white-label / book.* domains) must never
        // show the staff sign-in screen — send visitors to the booking surface.
        if (isGuestBookingHost()) {
          const sync = guestHostPath(resolveGuestHostTargetSync());
          if (sync) {
            navigate(sync, { replace: true });
          } else {
            resolveGuestHostTarget().then((t) => {
              const path = guestHostPath(t);
              navigate(path ?? "/", { replace: true });
            });
          }
          return;
        }
        navigate("/auth");
      } else if (requireAdmin && !isAdmin) {
        navigate("/");
      } else if (requireDev && !isDev && !isFearlessLeader) {
        navigate("/");
      } else if (requireDevOrFearless && !isDev && !isFearlessLeader) {
        navigate("/");
      }
    }
  }, [user, loading, isAdmin, isDev, isFearlessLeader, requireAdmin, requireDev, requireDevOrFearless, navigate]);


  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user || (requireAdmin && !isAdmin) || (requireDev && !isDev && !isFearlessLeader) || (requireDevOrFearless && !isDev && !isFearlessLeader)) {
    return null;
  }

  return <>{children}</>;
}
