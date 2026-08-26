import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { UserRole, computeUserRole } from "@/lib/permissions";
import { resolveScopedPropertyIds } from "@/lib/adminScope";

interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string | null;
}

interface UserContext {
  profile: Profile | null;
  roles: string[];
  sales_rep_id: string | null;
}

const EMPTY_CONTEXT: UserContext = { profile: null, roles: [], sales_rep_id: null };

const cacheKey = (userId: string) => `rolos.user_context.${userId}`;

/**
 * Read the last-known user context synchronously so the shell can paint with
 * the correct role/menus while the (possibly cold) edge function responds.
 */
function readCachedContext(userId: string | undefined): UserContext | undefined {
  if (!userId) return undefined;
  try {
    const raw = sessionStorage.getItem(cacheKey(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as UserContext;
    if (!Array.isArray(parsed?.roles)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function writeCachedContext(userId: string, ctx: UserContext) {
  try {
    sessionStorage.setItem(cacheKey(userId), JSON.stringify(ctx));
  } catch {
    /* storage full / disabled — cache is best-effort only */
  }
}

function clearCachedContexts() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < sessionStorage.length; i += 1) {
      const k = sessionStorage.key(i);
      if (k?.startsWith("rolos.user_context.")) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore */
  }
}

async function fetchUserContext(userId: string, isRetry = false): Promise<UserContext> {
  const { data: response, error } = await supabase.functions.invoke("data-access-api", {
    body: { action: "get_user_context" },
  });

  if (error || !response?.success) {
    const code = response?.code;
    const status = (error as { context?: { status?: number } } | null)?.context?.status;
    const isAuthIssue =
      code === "token_expired" ||
      code === "invalid_token" ||
      status === 401;

    if (isAuthIssue && !isRetry) {
      const { data: refreshed } = await supabase.auth.refreshSession();
      if (refreshed?.session) return fetchUserContext(userId, true);
      await supabase.auth.signOut();
      return EMPTY_CONTEXT;
    }

    const cached = readCachedContext(userId);
    if (cached && (status === 502 || status === 503 || code === "data_timeout")) {
      return cached;
    }
    throw new Error(String(error?.message ?? response?.error ?? "Failed to fetch user context"));
  }

  const ctx: UserContext = {
    profile: response.data?.profile ?? null,
    roles: Array.isArray(response.data?.roles) ? response.data.roles : [],
    sales_rep_id: response.data?.sales_rep_id ?? null,
  };
  writeCachedContext(userId, ctx);
  return ctx;
}

function useAuthState() {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [sessionResolved, setSessionResolved] = useState(false);

  useEffect(() => {
    let mounted = true;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!mounted) return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setSessionResolved(true);
    });

    supabase.auth.getSession().then(({ data: { session: existing } }) => {
      if (!mounted) return;
      setSession(existing);
      setUser(existing?.user ?? null);
      setSessionResolved(true);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const userId = user?.id;

  // One shared, cached request per signed-in user — every consumer of useAuth
  // reads the same query instead of triggering its own edge-function call.
  const { data: context, isFetching, isPending } = useQuery({
    queryKey: ["user-context", userId],
    enabled: !!userId,
    queryFn: () => fetchUserContext(userId as string),
    initialData: () => readCachedContext(userId),
    staleTime: 1000 * 60 * 5,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
    // Page loads must never multiply a struggling backend request. Cached role
    // context keeps the shell usable; a later remount can refresh it.
    retry: false,
  });

  const roles = context?.roles ?? [];
  const isDev = roles.includes("dev");
  const isFearlessLeader = roles.includes("fearless_leader");
  const isAdmin = roles.includes("admin") || isDev || isFearlessLeader;
  const isSalesRep = roles.includes("sales_rep");

  // Scoped admins are admins confined to specific properties. The scope rows
  // are readable by their own owner, so a plain table read is enough.
  const { data: scopeRows, isPending: scopePending } = useQuery({
    queryKey: ["admin-scope", userId],
    enabled: !!userId && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("scoped_admin_properties")
        .select("property_id")
        .eq("user_id", userId as string);
      if (error) throw error;
      return (data ?? []).map((r) => r.property_id as string);
    },
    staleTime: 1000 * 60 * 10,
    gcTime: 1000 * 60 * 30,
    refetchOnWindowFocus: false,
  });

  const scopeEmail =
    user?.email ??
    (typeof user?.user_metadata?.email === "string" ? user.user_metadata.email : null) ??
    context?.profile?.email ??
    null;
  const scopedPropertyIds = useMemo(
    () => resolveScopedPropertyIds(scopeEmail, scopeRows),
    [scopeEmail, scopeRows],
  );
  const isScopedAdmin = scopedPropertyIds.length > 0;
  // Roles come from a separate request. Until they are known, isAdmin is false
  // and we must not treat the account as unrestricted — that flash-loads every
  // property onto Onboarding / Pulse.
  const rolesKnown = !userId || !!context || !isPending;
  const scopeResolved = !userId || (rolesKnown && (!isAdmin || !scopePending));

  const userRole: UserRole = useMemo(
    () => computeUserRole(isDev, isFearlessLeader, isAdmin, isSalesRep),
    [isDev, isFearlessLeader, isAdmin, isSalesRep],
  );


  // Never block first paint on a possibly cold edge function: once we have a
  // cached context (or no session at all) the shell can render immediately and
  // refresh in the background.
  const loading = !sessionResolved || (!!userId && isPending && !context);

  const signOut = useCallback(async () => {
    // Local scope first — guarantees the client-side session is cleared even
    // if the network request for global sign-out fails or is slow.
    try {
      await supabase.auth.signOut({ scope: "local" });
    } catch (err) {
      console.warn("Local signOut failed:", err);
    }
    try {
      await supabase.auth.signOut({ scope: "global" });
    } catch (err) {
      console.warn("Global signOut failed (session already cleared locally):", err);
    }
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
    clearCachedContexts();
    queryClient.removeQueries({ queryKey: ["user-context"] });
    setSession(null);
    setUser(null);
  }, [queryClient]);

  return {
    user,
    session,
    loading,
    isRefreshingContext: isFetching,
    isAdmin,
    isDev,
    isFearlessLeader,
    isSalesRep,
    isScopedAdmin,
    scopedPropertyIds,
    scopeResolved,

    salesRepId: context?.sales_rep_id ?? null,
    profile: context?.profile ?? null,
    userRole,
    signOut,
  };
}

type AuthContextValue = ReturnType<typeof useAuthState>;

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const value = useAuthState();
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within AuthProvider");
  return context;
}
