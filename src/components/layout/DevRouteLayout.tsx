import { Outlet } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";

export function DevRouteLayout() {
  return (
    <ProtectedRoute requireDev>
      <Outlet />
    </ProtectedRoute>
  );
}
