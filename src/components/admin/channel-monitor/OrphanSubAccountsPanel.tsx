import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, CheckCircle2, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { RetireBoundAccountPanel } from "@/components/admin/channel-monitor/RetireBoundAccountPanel";

interface RosterUser {
  owner_id?: string | null;
  email?: string | null;
  login_email?: string | null;
  archived?: boolean | null;
}

interface RetiredRow {
  ru_owner_id: string;
  portal_email: string | null;
  reason: string | null;
  retired_at: string | null;
}

const DEFAULT_REASON = "Orphan distribution account — retired from Channel Monitor";

const PANEL_QUERY_KEY = ["channel-orphan-sub-accounts"] as const;

/** Label for an orphan row: portal login first, contact email as the fallback. */
function accountLabel(user: RosterUser): string {
  return user.login_email || user.email || "(no login recorded)";
}

/**
 * Distribution accounts that exist under our master account but that no property or
 * portfolio is bound to. These are what an earlier Step A run left behind when it
 * provisioned replacement logins. Archiving one writes it to the retired registry,
 * which every roster read, cost attribution and compliance sweep excludes at source,
 * so nothing is ever read from or reported against it again.
 */
export function OrphanSubAccountsPanel() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<RosterUser | null>(null);
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: PANEL_QUERY_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: roster }, { data: accounts }, { data: retiredRows }] = await Promise.all([
        supabase.from("ru_roster_cache").select("users, fetched_at").eq("cache_key", "master").maybeSingle(),
        supabase.from("ru_owner_accounts").select("ru_owner_id"),
        supabase
          .from("ru_retired_accounts")
          .select("ru_owner_id, portal_email, reason, retired_at")
          .order("retired_at", { ascending: false }),
      ]);

      const bound = new Set(
        (accounts ?? [])
          .map((a) => String(a.ru_owner_id ?? "").trim())
          .filter(Boolean),
      );
      const retired = ((retiredRows ?? []) as RetiredRow[]).map((r) => ({
        ...r,
        ru_owner_id: String(r.ru_owner_id).trim(),
      }));
      // The panel reads the roster cache directly, so it must apply the same
      // exclusion the edge functions apply — otherwise an archived account would
      // keep showing up here as an orphan.
      const retiredIds = new Set(retired.map((r) => r.ru_owner_id));

      const users = (Array.isArray(roster?.users) ? (roster?.users as RosterUser[]) : []).filter(
        // An account archived at the channel is still read here until it is in the
        // retired registry, so it must stay visible and archivable — only registry
        // entries are hidden (they show under "Archived accounts").
        (u) => String(u?.owner_id ?? "").trim() && !retiredIds.has(String(u.owner_id).trim()),
      );

      return {
        fetchedAt: roster?.fetched_at ? new Date(roster.fetched_at as string) : null,
        total: users.length,
        orphans: users.filter((u) => !bound.has(String(u.owner_id).trim())),
        bound,
        retired,
      };
    },
  });

  /** Invalidate everything that counts or costs sub-accounts, so figures agree. */
  const refreshDependents = () => {
    void queryClient.invalidateQueries({ queryKey: PANEL_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["channel-cost-monitor"] });
    void queryClient.invalidateQueries({ queryKey: ["channel-reconciliation"] });
  };

  const archive = useMutation({
    mutationFn: async ({ user, note }: { user: RosterUser; note: string }) => {
      const ownerId = String(user.owner_id ?? "").trim();
      if (!ownerId) throw new Error("This roster entry has no OwnerID.");
      // A binding may have appeared since the list was read: never retire a live one.
      const { data: stillBound } = await supabase
        .from("ru_owner_accounts")
        .select("id")
        .eq("ru_owner_id", ownerId)
        .limit(1);
      if ((stillBound ?? []).length > 0) {
        throw new Error(`OwnerID ${ownerId} is now bound to a property or portfolio — not archived.`);
      }
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("ru_retired_accounts").upsert(
        {
          ru_owner_id: ownerId,
          portal_email: accountLabel(user),
          reason: note.trim() || DEFAULT_REASON,
          retired_by: session.session?.user?.id ?? null,
        },
        { onConflict: "ru_owner_id" },
      );
      if (error) throw error;
      return ownerId;
    },
    onSuccess: (ownerId) => {
      toast.success(`OwnerID ${ownerId} archived — excluded from all channel reads`);
      setArchiveOpen(false);
      setPending(null);
      setReason(DEFAULT_REASON);
      refreshDependents();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not archive this account");
    },
  });

  const restore = useMutation({
    mutationFn: async (ownerId: string) => {
      const { error } = await supabase.from("ru_retired_accounts").delete().eq("ru_owner_id", ownerId);
      if (error) throw error;
      return ownerId;
    },
    onSuccess: (ownerId) => {
      toast.success(`OwnerID ${ownerId} restored to the active list`);
      refreshDependents();
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not restore this account");
    },
  });

  if (isLoading) return <Skeleton className="h-32 w-full" />;

  const orphans = data?.orphans ?? [];
  const retired = data?.retired ?? [];

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
          Accounts under our master account with no property or portfolio bound to them. Archive one
          to drop it from every active read — listing counts, cost, compliance and health checks all
          skip archived accounts.
          {data?.fetchedAt && ` Roster read ${data.fetchedAt.toLocaleString()}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        {orphans.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every live distribution account is bound to a property or portfolio.
          </p>
        ) : (
          orphans.map((u) => {
            const ownerId = String(u.owner_id);
            const busy = archive.isPending && String(pending?.owner_id ?? "") === ownerId;
            return (
              <div
                key={ownerId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <span className="flex items-center gap-2 text-xs">
                  {accountLabel(u)}
                  {u.archived ? (
                    <Badge variant="outline" className="text-[10px]">
                      Archived at channel
                    </Badge>
                  ) : null}
                </span>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    Sub-account: {ownerId}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-[11px]"
                    disabled={archive.isPending}
                    onClick={() => {
                      setPending(u);
                      setReason(DEFAULT_REASON);
                      setArchiveOpen(true);
                    }}
                  >
                    {busy ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Archive className="h-3.5 w-3.5" />
                    )}
                    Archive
                  </Button>
                </div>
              </div>
            );
          })
        )}

        {retired.length > 0 && (
          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-[11px]">
                Archived accounts ({retired.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5 space-y-1.5">
              {retired.map((r) => (
                <div
                  key={r.ru_owner_id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-xs text-muted-foreground">
                      {r.portal_email || "(no login recorded)"}
                      <span className="ml-2 font-mono text-[10px]">OwnerID {r.ru_owner_id}</span>
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {r.reason || "No reason recorded"}
                      {r.retired_at && ` · ${new Date(r.retired_at).toLocaleDateString()}`}
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 gap-1.5 text-[11px]"
                    disabled={restore.isPending}
                    onClick={() => restore.mutate(r.ru_owner_id)}
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Restore
                  </Button>
                </div>
              ))}
            </CollapsibleContent>
          </Collapsible>
        )}

        <RetireBoundAccountPanel />

        <MasterRosterPanel />

      </CardContent>

      <AlertDialog
        open={archiveOpen}
        onOpenChange={(open) => {
          if (archive.isPending) return;
          setArchiveOpen(open);
          if (!open) setPending(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this distribution account?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `${accountLabel(pending)} · OwnerID ${pending.owner_id} will be excluded from every channel read, listing count, cost figure and compliance check. Nothing is deleted at the channel — it can be restored here.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="orphan-archive-reason" className="text-xs">
              Reason (optional)
            </Label>
            <Input
              id="orphan-archive-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="text-xs"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={archive.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={archive.isPending || !pending}
              onClick={(e) => {
                e.preventDefault();
                if (pending) archive.mutate({ user: pending, note: reason });
              }}
            >
              {archive.isPending ? "Archiving…" : "Archive account"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default OrphanSubAccountsPanel;
