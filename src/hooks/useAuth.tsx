import { useState, useEffect } from "react";
import { User, Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isDev, setIsDev] = useState(false);

  useEffect(() => {
    let mounted = true;

    const checkRoles = async (userId: string) => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);

      if (mounted) {
        const roles = data?.map(r => r.role) || [];
        const hasDev = roles.includes("dev");
        // Dev users get admin access + dev access
        setIsAdmin(roles.includes("admin") || hasDev);
        setIsDev(hasDev);
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
          checkRoles(session.user.id);
        } else {
          setIsAdmin(false);
          setIsDev(false);
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
          checkRoles(session.user.id);
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

  return { user, session, loading, isAdmin, isDev, signOut };
}
