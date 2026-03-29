import { useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { UserRole, computeUserRole } from "@/lib/permissions";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDev, setIsDev] = useState(false);
  const [isFearlessLeader, setIsFearlessLeader] = useState(false);
  const [isSalesRep, setIsSalesRep] = useState(false);
  const [salesRepId, setSalesRepId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [userRole, setUserRole] = useState<UserRole>('owner');

  useEffect(() => {
    let mounted = true;

    const checkRolesAndProfile = async (userId: string) => {
      // Fetch roles
      const { data: rolesData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      // Fetch profile
      const { data: profileData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (mounted) {
        const roles = rolesData?.map(r => r.role) || [];
        const hasDev = roles.includes("dev");
        const hasFearlessLeader = roles.includes("fearless_leader");
        const hasAdmin = roles.includes("admin") || hasDev || hasFearlessLeader;
        const hasSalesRep = roles.includes("sales_rep");
        
        setIsAdmin(hasAdmin);
        setIsDev(hasDev);
        setIsFearlessLeader(hasFearlessLeader);
        setIsSalesRep(hasSalesRep);
        setProfile(profileData || null);
        
        // Compute the single userRole for role-aware navigation
        setUserRole(computeUserRole(hasDev, hasFearlessLeader, hasAdmin, hasSalesRep));

        // If sales rep, look up their rep record
        if (hasSalesRep) {
          const { data: repData } = await supabase
            .from("sales_reps")
            .select("id")
            .eq("user_id", userId)
            .maybeSingle();
          if (mounted) {
            setSalesRepId(repData?.id || null);
          }
        } else {
          setSalesRepId(null);
        }
        
        setLoading(false);
      }
    };

    // Set up auth state listener
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (mounted) {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          setLoading(true);
          checkRolesAndProfile(session.user.id);
        } else {
          setIsAdmin(false);
          setIsDev(false);
          setIsFearlessLeader(false);
          setIsSalesRep(false);
          setSalesRepId(null);
          setProfile(null);
          setUserRole('owner');
          setLoading(false);
        }
      }
    });

    // Check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (mounted) {
        setSession(session);
        setUser(session?.user ?? null);
        
        if (session?.user) {
          checkRolesAndProfile(session.user.id);
        } else {
          setLoading(false);
        }
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return { user, session, loading, isAdmin, isDev, isFearlessLeader, isSalesRep, salesRepId, profile, userRole, signOut };
}
