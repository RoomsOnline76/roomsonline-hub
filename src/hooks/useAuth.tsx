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

    const checkRolesAndProfile = async (_userId: string) => {
      try {
        const { data: response, error } = await supabase.functions.invoke(
          "data-access-api",
          { body: { action: "get_user_context" } }
        );

        if (error || !response?.success) {
          console.error("Failed to fetch user context:", error ?? response?.error);
          if (mounted) setLoading(false);
          return;
        }

        if (mounted) {
          const { profile: profileData, roles, sales_rep_id } = response.data;

          const hasDev = roles.includes("dev");
          const hasFearlessLeader = roles.includes("fearless_leader");
          const hasAdmin = roles.includes("admin") || hasDev || hasFearlessLeader;
          const hasSalesRep = roles.includes("sales_rep");

          setIsAdmin(hasAdmin);
          setIsDev(hasDev);
          setIsFearlessLeader(hasFearlessLeader);
          setIsSalesRep(hasSalesRep);
          setProfile(profileData || null);
          setUserRole(computeUserRole(hasDev, hasFearlessLeader, hasAdmin, hasSalesRep));
          setSalesRepId(sales_rep_id || null);
          setLoading(false);
        }
      } catch (err) {
        console.error("User context fetch error:", err);
        if (mounted) setLoading(false);
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
    // Local scope first — guarantees the client-side session is cleared even
    // if the network request for global sign-out fails or is slow. Without
    // this, a failed global signOut leaves the session in localStorage and
    // the auth listener immediately re-hydrates the user on the next route.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (err) {
      console.warn("Local signOut failed:", err);
    }
    // Best-effort global sign-out (revoke refresh token server-side).
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (err) {
      console.warn("Global signOut failed (session already cleared locally):", err);
    }
    // Belt-and-braces: purge any lingering supabase auth keys from storage.
    try {
      const keys: string[] = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && (k.startsWith("sb-") || k.includes("supabase.auth"))) keys.push(k);
      }
      keys.forEach((k) => localStorage.removeItem(k));
    } catch (err) {
      console.warn("Storage purge failed:", err);
    }
    // Clear local React state immediately so any consumer re-render sees
    // signed-out state before navigation.
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setIsDev(false);
    setIsFearlessLeader(false);
    setIsSalesRep(false);
    setSalesRepId(null);
    setProfile(null);
    setUserRole("owner");
  };

  return { user, session, loading, isAdmin, isDev, isFearlessLeader, isSalesRep, salesRepId, profile, userRole, signOut };
}
