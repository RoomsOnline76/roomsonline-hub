import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

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

  if (!user || (requireAdmin && !isAdmin) || (requireDev && !isDev) || (requireDevOrFearless && !isDev && !isFearlessLeader)) {
    return null;
  }

  return <>{children}</>;
}
