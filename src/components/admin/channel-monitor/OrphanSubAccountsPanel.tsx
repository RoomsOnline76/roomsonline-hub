import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Archive, CheckCircle2, CloudOff, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
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
import { MasterRosterPanel } from "@/components/admin/channel-monitor/MasterRosterPanel";


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
  channel_archived_at: string | null;
  listings_archived: number | null;
}

/** Outcome of one channel purge run, shown per row. */
interface PurgeOutcome {
  ok: boolean;
  message: string;
  /** The channel throttled us — the bulk runner waits before the next account. */
  rateDeferred?: boolean;
  retryAfterMs?: number;
}


/** What we hold for an account: decides whether a normal child-key archive is possible. */
type KeyState = "child" | "master_pair" | "unverified" | "none";

interface KeyInfo {
  state: KeyState;
  login_email: string | null;
  key_label: string | null;
}

const KEY_BADGE: Record<KeyState, { text: string; variant: "secondary" | "outline" | "destructive" }> = {
  child: { text: "Child key on file", variant: "secondary" },
  master_pair: { text: "Master pair — archives on master credentials", variant: "destructive" },
  unverified: { text: "Key on file (scope unverified)", variant: "outline" },
  none: { text: "No keys — archives on master credentials", variant: "outline" },
};

const DEFAULT_REASON = "Orphan distribution account — retired from Channel Monitor";

const PANEL_QUERY_KEY = ["channel-orphan-sub-accounts"] as const;


/** Label for an orphan row: portal login first, contact email as the fallback. */
function accountLabel(user: RosterUser): string {
  return user.login_email || user.email || "(no login recorded)";
}

/**
 * Distribution accounts that exist under our master account but that no property or
 * portfolio is bound to. These are what an earlier Step A run left behind when it
 * provisioned replacement logins.
 *
 * Archiving one runs the real channel purge — authenticate as the sub-account, read
 * what it actually owns at the channel, archive every listing and release the stored
 * API keys — and only then writes the retired registry that every roster read, cost
 * attribution and compliance sweep excludes at source. A registry entry alone used to
 * hide the account from us while it stayed fully alive at the channel.
 */
export function OrphanSubAccountsPanel() {
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<RosterUser | null>(null);
  const [reason, setReason] = useState(DEFAULT_REASON);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [hideAnyway, setHideAnyway] = useState(false);
  /** Portal password, used only for accounts whose keys we no longer hold. Never stored. */
  const [password, setPassword] = useState("");
  const [runningOwnerId, setRunningOwnerId] = useState<string | null>(null);
  const [bulkRunning, setBulkRunning] = useState(false);
  const [outcomes, setOutcomes] = useState<Record<string, PurgeOutcome>>({});

  const { data, isLoading } = useQuery({
    queryKey: PANEL_QUERY_KEY,
    staleTime: 60_000,
    queryFn: async () => {
      const [{ data: roster }, { data: accounts }, { data: retiredRows }, { data: credRows }] = await Promise.all([
        supabase.from("ru_roster_cache").select("users, fetched_at").eq("cache_key", "master").maybeSingle(),
        supabase.from("ru_owner_accounts").select("ru_owner_id"),
        supabase
          .from("ru_retired_accounts")
          .select("ru_owner_id, portal_email, reason, retired_at, channel_archived_at, listings_archived")
          .order("retired_at", { ascending: false }),
        supabase.from("ru_api_credentials").select("ru_owner_id, login_email, key_label, key_scope"),
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

      // Match the API key pairs we actually hold to these accounts, so an operator can
      // see up front why a row archives on child keys or on master credentials.
      const keys = new Map<string, KeyInfo>();
      for (const c of credRows ?? []) {
        const id = String((c as { ru_owner_id?: string }).ru_owner_id ?? "").trim();
        if (!id) continue;
        const scope = String((c as { key_scope?: string }).key_scope ?? "unverified");
        keys.set(id, {
          state: scope === "child" ? "child" : scope === "master_pair" ? "master_pair" : "unverified",
          login_email: (c as { login_email?: string | null }).login_email ?? null,
          key_label: (c as { key_label?: string | null }).key_label ?? null,
        });
      }

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
        keys,
      };
    },

  });

  /** Invalidate everything that counts or costs sub-accounts, so figures agree. */
  const refreshDependents = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PANEL_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["channel-cost-monitor"] });
    void queryClient.invalidateQueries({ queryKey: ["channel-reconciliation"] });
  }, [queryClient]);

  /**
   * One channel purge run. Returns the channel's own answer — never a claim of its own.
   */
  const purgeAtChannel = useCallback(
    async (ownerId: string, loginEmail: string | null, note: string): Promise<PurgeOutcome> => {
      setRunningOwnerId(ownerId);
      try {
        const { data: res, error } = await supabase.functions.invoke("ru-cert-portal", {
          body: {
            action: "purge_channel_account",
            ru_owner_id: ownerId,
            login_email: loginEmail,
            password: password || undefined,
            reason: note || undefined,
          },
        });
        const payload = (res ?? {}) as {
          success?: boolean;
          archived_listings?: string[];
          refused_listings?: { listing_id: string; message: string }[];
          keys_released?: boolean;
          total_listings?: number;
          envelope?: string;
          rate_deferred?: boolean;
          retry_after_ms?: number;
          error?: { message?: string };
        };
        const via = payload.envelope === "master_scoped_archive" ? " · via master credentials" : "";
        if (payload.success === true) {
          const archived = payload.archived_listings?.length ?? 0;
          return {
            ok: true,
            message:
              `${archived} of ${payload.total_listings ?? archived} listing(s) archived at the channel` +
              (payload.keys_released ? " · API keys released" : "") +
              via,
          };
        }
        const refused = payload.refused_listings?.length ?? 0;
        return {
          ok: false,
          rateDeferred: payload.rate_deferred === true,
          retryAfterMs: payload.retry_after_ms,
          message:
            payload.error?.message ??
            (refused ? `${refused} listing(s) refused by the channel` : error?.message ?? "The channel purge failed"),

        };
      } catch (e) {
        return { ok: false, message: e instanceof Error ? e.message : String(e) };
      } finally {
        setRunningOwnerId(null);
      }
    },
    [password],
  );

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

      const outcome = await purgeAtChannel(ownerId, accountLabel(user), note.trim() || DEFAULT_REASON);
      setOutcomes((prev) => ({ ...prev, [ownerId]: outcome }));
      if (outcome.ok) return { ownerId, outcome };

      if (!hideAnyway) {
        throw new Error(`${outcome.message}. Tick "hide locally anyway" to record it regardless.`);
      }
      // Explicit operator override: the local hide is recorded, and the reason says
      // plainly that the channel side is unfinished.
      const { data: session } = await supabase.auth.getSession();
      const { error } = await supabase.from("ru_retired_accounts").upsert(
        {
          ru_owner_id: ownerId,
          portal_email: accountLabel(user),
          reason: `${note.trim() || DEFAULT_REASON} — NOT archived at the channel: ${outcome.message}`,
          retired_by: session.session?.user?.id ?? null,
        },
        { onConflict: "ru_owner_id" },
      );
      if (error) throw error;
      return { ownerId, outcome };
    },
    onSuccess: ({ ownerId, outcome }) => {
      if (outcome.ok) toast.success(`OwnerID ${ownerId} archived at the channel — ${outcome.message}`);
      else toast.warning(`OwnerID ${ownerId} hidden locally only — ${outcome.message}`);
      setArchiveOpen(false);
      setPending(null);
      setReason(DEFAULT_REASON);
      setHideAnyway(false);
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

  const retired = useMemo(() => data?.retired ?? [], [data?.retired]);
  /** Registry entries the channel has never confirmed as archived. */
  const outstanding = useMemo(() => retired.filter((r) => !r.channel_archived_at), [retired]);

  /** Purge one already-retired account at the channel. */
  const purgeRetired = useCallback(
    async (row: RetiredRow) => {
      const outcome = await purgeAtChannel(
        row.ru_owner_id,
        row.portal_email,
        row.reason ?? "Purged at the channel from Channel Monitor",
      );
      setOutcomes((prev) => ({ ...prev, [row.ru_owner_id]: outcome }));
      if (outcome.ok) toast.success(`OwnerID ${row.ru_owner_id} — ${outcome.message}`);
      else toast.error(`OwnerID ${row.ru_owner_id} — ${outcome.message}`);
      refreshDependents();
      return outcome;
    },
    [purgeAtChannel, refreshDependents],
  );

  /**
   * Walk every outstanding registry entry, one at a time — never in parallel, with a
   * pause between accounts so a long run does not trip the channel's rate limit.
   */
  const purgeAllOutstanding = useCallback(async () => {
    setBulkRunning(true);
    let done = 0;
    let failed = 0;
    for (const [index, row] of outstanding.entries()) {
      const outcome = await purgeAtChannel(
        row.ru_owner_id,
        row.portal_email,
        row.reason ?? "Purged at the channel from Channel Monitor",
      );
      setOutcomes((prev) => ({ ...prev, [row.ru_owner_id]: outcome }));
      if (outcome.ok) done += 1;
      else failed += 1;
      if (index < outstanding.length - 1) {
        const wait = outcome.rateDeferred ? Math.max(outcome.retryAfterMs ?? 15_000, 15_000) : 2_500;
        await new Promise((resolve) => setTimeout(resolve, wait));
      }
    }
    setBulkRunning(false);
    refreshDependents();
    if (failed === 0) toast.success(`${done} account(s) archived at the channel`);
    else toast.warning(`${done} archived, ${failed} refused — see each row for the channel's answer`);
  }, [outstanding, purgeAtChannel, refreshDependents]);

  /** Key pair we hold for an OwnerID — drives the badge and the archive route. */
  const keyFor = useCallback(
    (ownerId: string): KeyInfo => data?.keys?.get(ownerId) ?? { state: "none", login_email: null, key_label: null },
    [data?.keys],
  );


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
          Accounts under our master account with no property or portfolio bound to them. Archiving
          one now runs the real channel purge — every listing it owns is archived at the channel and
          its API keys are released — before it is dropped from listing counts, cost, compliance and
          health checks.
          {data?.fetchedAt && ` Roster read ${data.fetchedAt.toLocaleString()}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-1.5">
        <div className="space-y-1.5 rounded-md border border-border bg-muted/20 px-3 py-2">
          <Label htmlFor="orphan-purge-password" className="text-[11px]">
            Portal password (only used for accounts whose API keys we no longer hold — never stored)
          </Label>
          <Input
            id="orphan-purge-password"
            type="password"
            autoComplete="off"
            value={password}
            placeholder="Sub-account portal password"
            onChange={(e) => setPassword(e.target.value)}
            className="h-8 text-xs"
          />
        </div>

        {orphans.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Every live distribution account is bound to a property or portfolio.
          </p>
        ) : (
          orphans.map((u) => {
            const ownerId = String(u.owner_id);
            const busy = (archive.isPending || runningOwnerId === ownerId) && String(pending?.owner_id ?? "") === ownerId;
            const outcome = outcomes[ownerId];
            return (
              <div
                key={ownerId}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2"
              >
                <span className="flex flex-col gap-0.5 text-xs">
                  <span className="flex items-center gap-2">
                    {accountLabel(u)}
                    {u.archived ? (
                      <Badge variant="outline" className="text-[10px]">
                        Archived at channel
                      </Badge>
                    ) : null}
                  </span>
                  {outcome && (
                    <span className={`text-[10px] ${outcome.ok ? "text-primary" : "text-destructive"}`}>
                      {outcome.message}
                    </span>
                  )}
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
                    disabled={archive.isPending || bulkRunning}
                    onClick={() => {
                      setPending(u);
                      setReason(DEFAULT_REASON);
                      setHideAnyway(false);
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
                Archived accounts ({retired.length}
                {outstanding.length > 0 ? ` · ${outstanding.length} not archived at channel` : ""})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1.5 space-y-1.5">
              {outstanding.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-destructive/50 px-3 py-2">
                  <p className="text-[11px] text-muted-foreground">
                    {outstanding.length} archived account(s) are still live at the channel — their
                    listings and API keys were never released.
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 gap-1.5 text-[11px]"
                    disabled={bulkRunning || archive.isPending}
                    onClick={() => void purgeAllOutstanding()}
                  >
                    {bulkRunning ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <CloudOff className="h-3.5 w-3.5" />
                    )}
                    Archive all at channel
                  </Button>
                </div>
              )}
              {retired.map((r) => {
                const outcome = outcomes[r.ru_owner_id];
                const running = runningOwnerId === r.ru_owner_id;
                return (
                  <div
                    key={r.ru_owner_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-dashed border-border px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate text-xs text-muted-foreground">
                        {r.portal_email || "(no login recorded)"}
                        <span className="font-mono text-[10px]">OwnerID {r.ru_owner_id}</span>
                        {r.channel_archived_at ? (
                          <Badge variant="secondary" className="text-[10px]">
                            Archived at channel · {r.listings_archived ?? 0} listing(s)
                          </Badge>
                        ) : (
                          <Badge variant="destructive" className="text-[10px]">
                            Still live at channel
                          </Badge>
                        )}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {r.reason || "No reason recorded"}
                        {r.retired_at && ` · ${new Date(r.retired_at).toLocaleDateString()}`}
                      </p>
                      {outcome && (
                        <p className={`text-[10px] ${outcome.ok ? "text-primary" : "text-destructive"}`}>
                          {outcome.message}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {!r.channel_archived_at && (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 text-[11px]"
                          disabled={bulkRunning || running || archive.isPending}
                          onClick={() => void purgeRetired(r)}
                        >
                          {running ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <CloudOff className="h-3.5 w-3.5" />
                          )}
                          Archive at channel
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 gap-1.5 text-[11px]"
                        disabled={restore.isPending || bulkRunning}
                        onClick={() => restore.mutate(r.ru_owner_id)}
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Restore
                      </Button>
                    </div>
                  </div>
                );
              })}
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
            <AlertDialogTitle>Archive this distribution account at the channel?</AlertDialogTitle>
            <AlertDialogDescription>
              {pending
                ? `${accountLabel(pending)} · OwnerID ${pending.owner_id}: every listing this account owns will be archived at the channel and its stored API keys released, then it is excluded from every channel read, listing count, cost figure and compliance check.`
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
            <label className="flex items-start gap-2 pt-1 text-[11px] text-muted-foreground">
              <Checkbox
                checked={hideAnyway}
                onCheckedChange={(v) => setHideAnyway(v === true)}
                className="mt-0.5"
              />
              Hide locally anyway if the channel refuses (the refusal is recorded in the reason)
            </label>
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
              {archive.isPending ? "Archiving…" : "Archive at channel"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

export default OrphanSubAccountsPanel;
