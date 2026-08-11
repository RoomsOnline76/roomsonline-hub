import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { hasMinRole, type UserRole } from "@/lib/permissions";
import { SCOPED_ADMIN_NAV_ITEM_IDS, SCOPED_ADMIN_NAV_SECTION_IDS } from "@/lib/adminScope";
import type { NavItem, NavSection } from "@/config/navigation";


/**
 * Single source of truth for which navigation sections and items a user may see.
 * Shared by the desktop sidebar and the mobile bottom-nav sheet so both menus
 * always render the same tree.
 */
export function useNavVisibility() {
  const { user, userRole, isScopedAdmin } = useAuth();
  const isAdmin = hasMinRole(userRole as UserRole, "admin");
  const isDev = hasMinRole(userRole as UserRole, "dev");
  const [hasRolProperties, setHasRolProperties] = useState(false);

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
    void checkRolProperties();
  }, [user, isDev, isAdmin]);

  const canAccessItem = useCallback(
    (item: NavItem) => {
      // ROL'OS owners manage bookings inside the ROL'OS shell (/pms/bookings),
      // so the workspace Bookings entry is hidden from the admin menu for them.
      if (item.id === "bookings" && hasRolProperties && !isAdmin && !isDev) return false;
      // Scoped admins (e.g. certification auditors) only get their allow-list.
      // Revenue Pulse is on that list even though it is normally dev-only.
      if (isScopedAdmin) return SCOPED_ADMIN_NAV_ITEM_IDS.has(item.id);
      return hasMinRole(userRole as UserRole, item.minRole);
    },
    [hasRolProperties, isAdmin, isDev, isScopedAdmin, userRole]
  );

  const canAccessSection = useCallback(
    (section: NavSection) => {
      if (section.id === "pms" && !hasRolProperties) return false;
      if (isScopedAdmin) return SCOPED_ADMIN_NAV_SECTION_IDS.has(section.id);
      return hasMinRole(userRole as UserRole, section.minRole);
    },
    [hasRolProperties, isScopedAdmin, userRole]
  );

  return { hasRolProperties, isAdmin, isDev, isScopedAdmin, canAccessItem, canAccessSection };

}
