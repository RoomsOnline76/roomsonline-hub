import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import type { PmsStaffRole } from "@/lib/pmsPermissions";

interface PmsStaffRoleResult {
  /** null means platform admin/dev/primary-owner — full access */
  staffRole: PmsStaffRole | null;
  mustChangePassword: boolean;
  loading: boolean;
}

/**
 * Resolves the current user's PMS staff role for a given property.
 * Returns null role for platform admins/devs (they bypass staff roles).
 */
export function usePmsStaffRole(propertyId: string | null): PmsStaffRoleResult {
  const { user, isDev, isAdmin } = useAuth();
  const [staffRole, setStaffRole] = useState<PmsStaffRole | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !propertyId) {
      setLoading(false);
      return;
    }

    // Platform admins/devs bypass staff roles entirely
    if (isDev || isAdmin) {
      setStaffRole(null);
      setMustChangePassword(false);
      setLoading(false);
      return;
    }

    const fetch = async () => {
      setLoading(true);
      const { data } = await supabase
        .from("property_staff")
        .select("staff_role, must_change_password")
        .eq("property_id", propertyId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      if (data) {
        setStaffRole(data.staff_role as PmsStaffRole);
        setMustChangePassword(data.must_change_password ?? false);
      } else {
        // No staff record — could be primary/linked owner
        setStaffRole(null);
        setMustChangePassword(false);
      }
      setLoading(false);
    };

    fetch();
  }, [user, propertyId, isDev, isAdmin]);

  return { staffRole, mustChangePassword, loading };
}
