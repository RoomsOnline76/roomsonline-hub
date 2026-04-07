import { Outlet } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export function AdminRouteLayout() {
  return (
    <ProtectedRoute requireAdmin>
      <Outlet />
    </ProtectedRoute>
  );
}
