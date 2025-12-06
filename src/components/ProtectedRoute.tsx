import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireDev?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false, requireDev = false }: ProtectedRouteProps) {
  const { user, loading, isAdmin, isDev } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        navigate("/auth");
      } else if (requireAdmin && !isAdmin) {
        navigate("/");
      } else if (requireDev && !isDev) {
        navigate("/");
      }
    }
  }, [user, loading, isAdmin, isDev, requireAdmin, requireDev, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user || (requireAdmin && !isAdmin) || (requireDev && !isDev)) {
    return null;
  }

  return <>{children}</>;
}
