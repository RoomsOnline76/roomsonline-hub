import { useCallback, useEffect, useMemo, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { AlertCircle, BellRing, CheckCircle2, Loader2, RefreshCw, Radio, ListTree, Info } from "lucide-react";

/**
 * Rentals United Live Notification Mechanism management.
 *
 * Two webhook systems, both registered PER ACCOUNT:
 *  - RLNM (LNM_PutHandlerUrl_RQ) — reservations
 *  - LNM  (Push_PutLiveNotificationMechanismSubscriptions_RQ) — content / ARI changes
 *
 * The failure mode that matters is silent drift: RU keeps a subscription we no
 * longer match and simply stops notifying, so this panel always reads back.
 */

/** Mirrors DEFAULT_LNM_CHANGE_TYPES in supabase/functions/_shared/ruLnm.ts. */
const LNM_CHANGE_TYPES: { id: string; label: string }[] = [
  { id: "PropertyStaticDetails", label: "Property content" },
  { id: "PropertyChangeover", label: "Changeover" },
  { id: "PropertyMinStay", label: "Minimum stay" },
  { id: "PropertyAvailability", label: "Availability" },
  { id: "PropertyPrice", label: "Prices" },
  { id: "PropertyMCQEligibilityCheck", label: "MCQ result" },
];

interface OwnerAccount {
  ru_owner_id: string;
  owner_email: string | null;
  ru_login_email: string | null;
}

interface SubscriptionState {
  change_types: string[];
  observed_owners: string[];
  url_base: string | null;
}

interface AccountRow {
  ownerId: string | null;
  label: string;
  subscriptions?: SubscriptionState;
  error?: string;
  loading?: boolean;
  dupRunning?: boolean;
  dupResult?: Record<string, unknown>;
}


interface NotificationRow {
  id: string;
  created_at: string;
  success: boolean;
  error_message: string | null;
  ru_property_id: string | null;
  details: Record<string, unknown> | null;
}

interface ChangeTypeRow {
  id?: string | number;
  name?: string;
  [key: string]: unknown;
}

export function RuLnmPanel() {
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingAll, setRefreshingAll] = useState(false);
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [changeTypes, setChangeTypes] = useState<ChangeTypeRow[] | null>(null);
  const [changeTypesError, setChangeTypesError] = useState<string | null>(null);
  const [loadingChangeTypes, setLoadingChangeTypes] = useState(false);

  const listChangeTypes = useCallback(async () => {
    setLoadingChangeTypes(true);
    setChangeTypesError(null);
    try {
      const { data, error } = await supabase.functions.invoke("rentalsunited-api", {
        body: { action: "list_lnm_change_types" },
      });
      if (error) throw new Error(error.message);
      if (!data?.success) throw new Error(data?.error?.message ?? "RU rejected the read");
      const rows = (data.change_types ?? []) as ChangeTypeRow[];
      setChangeTypes(rows);
      toast.success(`Pulled ${rows.length} LNM change type(s) from Rentals United`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setChangeTypesError(msg);
      toast.error("List LNM change types failed", { description: msg });
    }
    setLoadingChangeTypes(false);
  }, []);


  const loadAccounts = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("ru_owner_accounts")
      .select("ru_owner_id, owner_email, ru_login_email")
      .not("ru_owner_id", "is", null);
    const rows: AccountRow[] = [
      { ownerId: null, label: "Master account" },
      ...((data ?? []) as OwnerAccount[])
        .filter((a) => a.ru_owner_id)
        .map((a) => ({
          ownerId: String(a.ru_owner_id),
          label: `${a.ru_login_email ?? a.owner_email ?? "Sub-user"} (OwnerID ${a.ru_owner_id})`,
        })),
    ];
    setAccounts(rows);
    setLoading(false);
  }, []);

  const loadNotifications = useCallback(async () => {
    const { data } = await supabase
      .from("ru_sync_runs")
      .select("id, created_at, success, error_message, ru_property_id, details")
      .eq("action", "LNM_Notification")
      .order("created_at", { ascending: false })
      .limit(20);
    setNotifications((data ?? []) as NotificationRow[]);
  }, []);

  useEffect(() => {
    void loadAccounts();
    void loadNotifications();
  }, [loadAccounts, loadNotifications]);

  const setRow = useCallback((ownerId: string | null, patch: Partial<AccountRow>) => {
    setAccounts((prev) => prev.map((r) => (r.ownerId === ownerId ? { ...r, ...patch } : r)));
  }, []);

  const verify = useCallback(
    async (row: AccountRow) => {
      setRow(row.ownerId, { loading: true, error: undefined });
      try {
        const { data, error } = await supabase.functions.invoke("rentalsunited-api", {
          body: { action: "list_lnm_subscriptions", ...(row.ownerId ? { owner_id: row.ownerId } : {}) },
        });
        if (error) throw new Error(error.message);
        if (!data?.success) throw new Error(data?.error?.message ?? "RU rejected the read");
        setRow(row.ownerId, { subscriptions: data.subscriptions, loading: false });
      } catch (e) {
        setRow(row.ownerId, { error: e instanceof Error ? e.message : String(e), loading: false });
      }
    },
    [setRow],
  );

  const subscribe = useCallback(
    async (row: AccountRow) => {
      setRow(row.ownerId, { loading: true, error: undefined });
      try {
        const observedOwners = row.ownerId
          ? [row.ownerId]
          : accounts.map((a) => a.ownerId).filter((id): id is string => !!id);
        if (observedOwners.length === 0) {
          throw new Error("No RU OwnerID available to observe — link a sub-user account first.");
        }
        const { data, error } = await supabase.functions.invoke("rentalsunited-api", {
          body: {
            action: "put_lnm_subscriptions",
            change_types: LNM_CHANGE_TYPES.map((t) => t.id),
            observed_owners: observedOwners,
            url_base: `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ru-lnm-handler`,
            ...(row.ownerId ? { owner_id: row.ownerId } : {}),
          },
        });
        if (error) throw new Error(error.message);
        if (!data?.success) throw new Error(data?.error?.message ?? "RU rejected the subscription");
        toast.success(`LNM subscription registered — ${row.label}`);
        await verify(row);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setRow(row.ownerId, { error: msg, loading: false });
        toast.error("LNM subscription failed", { description: msg });
      }
    },
    [accounts, setRow, verify],
  );

  const refreshAll = useCallback(async () => {
    setRefreshingAll(true);
    try {
      const { data, error } = await supabase.functions.invoke("cron-ru-rlnm-refresh", { body: {} });
      if (error) throw new Error(error.message);
      const failed = (data?.results ?? []).filter((r: { success: boolean }) => !r.success).length;
      if (failed > 0) {
        toast.error(`Notification refresh finished with ${failed} problem(s)`, {
          description: "Open each account below to read back its subscription.",
        });
      } else {
        toast.success("RLNM + LNM subscriptions refreshed on every account");
      }
      await loadNotifications();
      for (const row of accounts) await verify(row);
    } catch (e) {
      toast.error("Refresh failed", { description: e instanceof Error ? e.message : String(e) });
    }
    setRefreshingAll(false);
  }, [accounts, loadNotifications, verify]);

  const expectedUrl = useMemo(
    () => `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ru-lnm-handler`,
    [],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Radio className="h-4 w-4" /> Live notification subscriptions
            </CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Reservation notifications (RLNM) and content/ARI notifications (LNM) are registered per
              Rentals United account. Each sub-user must be subscribed under its own API keys.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={listChangeTypes} disabled={loadingChangeTypes} className="gap-1.5">
              {loadingChangeTypes ? <Loader2 className="h-4 w-4 animate-spin" /> : <ListTree className="h-4 w-4" />}
              List LNM change types
            </Button>
            <Button onClick={refreshAll} disabled={refreshingAll} className="gap-1.5">
              {refreshingAll ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh all accounts
            </Button>
          </div>

        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </>
          ) : (
            accounts.map((row) => {
              const subs = row.subscriptions;
              const urlOk = subs ? subs.url_base === expectedUrl : null;
              const missingTypes = subs
                ? LNM_CHANGE_TYPES.filter(
                    (t) => !subs.change_types.some((c) => c.toLowerCase() === t.id.toLowerCase()),
                  )
                : [];
              const inSync = subs ? urlOk && missingTypes.length === 0 : null;
              return (
                <div key={row.ownerId ?? "master"} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{row.label}</span>
                      {inSync === true && (
                        <Badge variant="outline" className="text-success border-success/40 text-[10px]">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> In sync
                        </Badge>
                      )}
                      {inSync === false && (
                        <Badge variant="outline" className="text-destructive border-destructive/40 text-[10px]">
                          <AlertCircle className="h-3 w-3 mr-1" /> Drift
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <Button size="sm" variant="outline" onClick={() => verify(row)} disabled={row.loading}>
                        {row.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Read back"}
                      </Button>
                      <Button size="sm" onClick={() => subscribe(row)} disabled={row.loading} className="gap-1.5">
                        <BellRing className="h-3.5 w-3.5" /> Subscribe
                      </Button>
                    </div>
                  </div>

                  {row.error && <p className="text-xs text-destructive">{row.error}</p>}

                  {subs && (
                    <div className="space-y-1.5 text-xs text-muted-foreground">
                      <p className="font-mono break-all">
                        UrlBase: {subs.url_base ?? "(none)"}{" "}
                        {!urlOk && <span className="text-destructive">— expected {expectedUrl}</span>}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {LNM_CHANGE_TYPES.map((t) => {
                          const active = subs.change_types.some((c) => c.toLowerCase() === t.id.toLowerCase());
                          return (
                            <Badge
                              key={t.id}
                              variant="outline"
                              className={
                                active
                                  ? "text-success border-success/40 text-[10px]"
                                  : "text-muted-foreground text-[10px]"
                              }
                            >
                              {t.label}
                            </Badge>
                          );
                        })}
                      </div>
                      <p>
                        Observed OwnerIDs:{" "}
                        {subs.observed_owners.length ? subs.observed_owners.join(", ") : "(none)"}
                      </p>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      {(changeTypes || changeTypesError) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ListTree className="h-4 w-4" /> LNM change types (Pull_ListLiveNotificationMechanismChangeTypes_RQ)
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Dictionary read straight from Rentals United — the authoritative list of change types
              that can be subscribed to.
            </p>
          </CardHeader>
          <CardContent>
            {changeTypesError ? (
              <p className="text-sm text-destructive">{changeTypesError}</p>
            ) : changeTypes && changeTypes.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {changeTypes.map((t, i) => (
                  <Badge key={`${t.id ?? t.name ?? i}`} variant="secondary" className="text-[10px]">
                    {t.id != null ? `${t.id} · ` : ""}
                    {t.name ?? JSON.stringify(t)}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Rentals United returned no change types.</p>
            )}
          </CardContent>
        </Card>
      )}

      <Card className="border-warning/40">
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Info className="h-4 w-4" /> Minimum content quality check — gated
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            <code className="font-mono">CM_LNM_OrderMinimumContentQualityCheck_RQ</code> cannot be
            called until the Channel Manager API is fully integrated and deployed. Ordering a quality
            check before then will be rejected by Rentals United, so the action stays disabled in the
            onboarding pipeline.
          </p>
        </CardContent>
      </Card>



      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent change notifications</CardTitle>
          <p className="text-sm text-muted-foreground">
            Rentals United sends identifiers only — each notification is a signal to re-pull the
            affected content, availability or prices.
          </p>
        </CardHeader>
        <CardContent>
          {notifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No notifications received yet. They arrive once a subscribed account changes content or ARI.
            </p>
          ) : (
            <div className="space-y-1.5">
              {notifications.map((n) => {
                const type = (n.details?.change_type as string | null) ?? "unknown";
                return (
                  <div
                    key={n.id}
                    className="flex items-center justify-between gap-3 border rounded-md px-3 py-2 text-sm"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Badge variant={n.success ? "secondary" : "destructive"} className="text-[10px]">
                        {type}
                      </Badge>
                      <span className="font-mono text-xs text-muted-foreground truncate">
                        RU property {n.ru_property_id ?? "—"}
                      </span>
                      {n.error_message && (
                        <span className="text-xs text-destructive truncate">{n.error_message}</span>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
