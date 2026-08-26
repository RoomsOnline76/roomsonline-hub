import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Loader2, RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface RosterUser {
  owner_id?: string | null;
  email?: string | null;
  login_email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  archived?: boolean | null;
}

interface RosterResult {
  users: RosterUser[];
  retiredIds: Set<string>;
  boundIds: Set<string>;
  readAt: Date;
}

function label(user: RosterUser): string {
  return user.login_email || user.email || "(no login recorded)";
}

/**
 * Third section of the Advanced orphan tooling: a live read of the master account's
 * own sub-account roster (Pull_ListMyUsers_RQ, include_retired), so an operator can
 * see exactly what the channel holds under our master — including entries we have
 * retired locally — next to whether ROLOS has a binding for each one.
 */
export function MasterRosterPanel() {
  const [result, setResult] = useState<RosterResult | null>(null);
  const [filter, setFilter] = useState("");

  const read = useMutation({
    mutationFn: async (): Promise<RosterResult> => {
      const [{ data, error }, { data: accounts }, { data: retiredRows }] = await Promise.all([
        supabase.functions.invoke("rentalsunited-api", {
          body: { action: "list_users", include_retired: true },
        }),
        supabase.from("ru_owner_accounts").select("ru_owner_id"),
        supabase.from("ru_retired_accounts").select("ru_owner_id"),
      ]);
      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data?.error?.message || "The channel refused the roster read");
      }
      const users = Array.isArray(data?.users) ? (data.users as RosterUser[]) : [];
      return {
        users,
        boundIds: new Set(
          (accounts ?? []).map((a) => String(a.ru_owner_id ?? "").trim()).filter(Boolean),
        ),
        retiredIds: new Set(
          (retiredRows ?? []).map((r) => String(r.ru_owner_id ?? "").trim()).filter(Boolean),
        ),
        readAt: new Date(),
      };
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Master account holds ${r.users.length} sub-account(s)`);
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not read the master account roster");
    },
  });

  const needle = filter.trim().toLowerCase();
  const rows = (result?.users ?? []).filter((u) => {
    if (!needle) return true;
    return `${label(u)} ${u.owner_id ?? ""}`.toLowerCase().includes(needle);
  });

  return (
    <div className="mt-4 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium">
            <Users className="h-3.5 w-3.5" />
            Master account roster
            {result ? (
              <Badge variant="secondary" className="text-[10px]">
                {result.users.length} sub-account{result.users.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Live read of every sub-account the channel lists under our master account, retired
            entries included, with the ROLOS binding state for each.
            {result && ` Read ${result.readAt.toLocaleTimeString()}.`}
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1.5 text-[11px]"
          disabled={read.isPending}
          onClick={() => read.mutate()}
        >
          {read.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <RefreshCw className="h-3.5 w-3.5" />
          )}
          {result ? "Re-read master" : "Read master account"}
        </Button>
      </div>

      {result ? (
        <div className="mt-2.5 space-y-1.5">
          {result.users.length > 6 && (
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by login or OwnerID"
              className="h-7 text-xs"
            />
          )}
          {rows.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              {result.users.length === 0
                ? "The channel returned no sub-accounts under our master account."
                : "No sub-account matches that filter."}
            </p>
          ) : (
            rows.map((u) => {
              const ownerId = String(u.owner_id ?? "").trim();
              const bound = result.boundIds.has(ownerId);
              const retired = result.retiredIds.has(ownerId);
              return (
                <div
                  key={ownerId || label(u)}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-1.5"
                >
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    {label(u)}
                    {u.archived ? (
                      <Badge variant="outline" className="text-[10px]">
                        Archived at channel
                      </Badge>
                    ) : null}
                    {retired ? (
                      <Badge variant="outline" className="text-[10px]">
                        Retired in ROLOS
                      </Badge>
                    ) : null}
                    <Badge
                      variant={bound ? "secondary" : "destructive"}
                      className="text-[10px]"
                    >
                      {bound ? "Bound" : "No binding"}
                    </Badge>
                  </span>
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Sub-account: {ownerId || "—"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      ) : null}
    </div>
  );
}

export default MasterRosterPanel;
