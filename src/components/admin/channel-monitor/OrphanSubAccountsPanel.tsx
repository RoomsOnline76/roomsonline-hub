import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface RosterUser {
  owner_id?: string | null;
  email?: string | null;
  login_email?: string | null;
  archived?: boolean | null;
}

/**
 * Distribution accounts that exist under our master account but that no property or
 * portfolio is bound to. These are what an earlier Step A run left behind when it
 * provisioned replacement logins; surfacing them lets an engineer retire them.
 */
export function OrphanSubAccountsPanel() {
  const { data, isLoading } = useQuery({
    queryKey: ["channel-orphan-sub-accounts"],
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: roster }, { data: accounts }] = await Promise.all([
        supabase.from("ru_roster_cache").select("users, fetched_at").eq("cache_key", "master").maybeSingle(),
        supabase.from("ru_owner_accounts").select("ru_owner_id"),
      ]);

      const bound = new Set(
        (accounts ?? [])
          .map((a) => String(a.ru_owner_id ?? "").trim())
          .filter(Boolean),
      );
      const users = (Array.isArray(roster?.users) ? (roster?.users as RosterUser[]) : []).filter(
        (u) => !u?.archived && String(u?.owner_id ?? "").trim(),
      );

      return {
        fetchedAt: roster?.fetched_at ? new Date(roster.fetched_at as string) : null,
        total: users.length,
        orphans: users.filter((u) => !bound.has(String(u.owner_id).trim())),
      };
    },
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  const orphans = data?.orphans ?? [];

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          {orphans.length > 0 ? (
            <AlertTriangle className="h-4 w-4 text-destructive" />
          ) : (
            <CheckCircle2 className="h-4 w-4 text-primary" />
          )}
          Orphan distribution accounts
          <Badge variant={orphans.length > 0 ? "destructive" : "secondary"} className="text-[10px]">
            {orphans.length} of {data?.total ?? 0}
          </Badge>
        </CardTitle>
        <CardDescription className="text-xs">
          Accounts under our master account with no property or portfolio bound to them. Retire them
          via the retired-account list so no cost or read traffic is attributed to them.
          {data?.fetchedAt && ` Roster read ${data.fetchedAt.toLocaleString()}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {orphans.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every live distribution account is bound to a property or portfolio.
          </p>
        ) : (
          orphans.map((u) => (
            <div
              key={String(u.owner_id)}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
            >
              <span className="text-xs">{u.login_email || u.email || "(no login recorded)"}</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                Sub-account: {u.owner_id}
              </span>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}

export default OrphanSubAccountsPanel;
