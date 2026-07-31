import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link as RouterLink } from "react-router-dom";
import { toast } from "sonner";
import { extractFunctionError } from "@/lib/functionError";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Building2,
  ChevronDown,
  ChevronRight,
  Copy,
  ExternalLink,
  Eye,
  EyeOff,
  FolderOpen,
  KeyRound,
  Link2,
  Loader2,
  Mail,
  RotateCcw,
  ShieldCheck,
  User2,
} from "lucide-react";


interface RuAccount {
  id: string;
  owner_email: string;
  ru_user_id: string | null;
  ru_owner_id: string | null;
  ru_login_email: string | null;
  ru_login_url: string | null;
  company_details_sent: boolean;
  company_details_status?: string | null;
  scope: string;
  portfolio_id: string | null;
  property_id: string | null;
  created_at: string;
}

interface PropRow {
  id: string;
  name: string;
  owner_email: string | null;
  city: string | null;
  ru_push_enabled: boolean | null;
  ru_archived?: boolean | null;
}

/**
 * Rentals United sub-account management view for the Portfolios page.
 * Lists every RU sub-user created under the RoomsOnline master account and the
 * properties that sit beneath it (portfolio members, direct property scope, or
 * owner-email match).
 */
export function PortfolioRuAccountsTab() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [revealing, setRevealing] = useState<string | null>(null);
  const [verifying, setVerifying] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Record<string, { login_email: string; password: string }>>({});

  const hideCredentials = useCallback((accountId: string) => {
    setRevealed((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
  }, []);

  const verifyCredentials = useCallback(async (accountId: string) => {
    setVerifying(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "verify_login_password", account_id: accountId },
      });
      if (error || !data?.success) {
        toast.error(
          data?.error?.message || (error ? await extractFunctionError(error, "Could not verify RU API access") : "Could not verify RU API access"),
        );
      } else {
        toast.success("Portal password is stored and RU API access is available");
      }
      await queryClient.invalidateQueries({ queryKey: ["ru-owner-accounts"] });
    } finally {
      setVerifying(null);
    }
  }, [queryClient]);

  const revealCredentials = useCallback(async (accountId: string) => {
    setRevealing(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "reveal_login_password", account_id: accountId },
      });
      if (error || !data?.success) {
        toast.error(data?.error?.message || error?.message || "Could not reveal the password");
        return;
      }
      setRevealed((prev) => ({
        ...prev,
        [accountId]: { login_email: data.login_email, password: data.password },
      }));
    } finally {
      setRevealing(null);
    }
  }, []);

  const [resetFor, setResetFor] = useState<{ id: string; email: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");
  const [resetEmail, setResetEmail] = useState("");
  const [saving, setSaving] = useState(false);

  // Binding: RU can hold several sub-users for the same owner (and logins can be renamed
  // in the RU portal), so admins must be able to point a local row at a specific OwnerID.
  const [bindFor, setBindFor] = useState<{ id: string; ownerId: string | null } | null>(null);
  const [bindCandidates, setBindCandidates] = useState<
    { owner_id: string; email: string; user_account_id?: string }[]
  >([]);
  const [bindLoading, setBindLoading] = useState(false);
  const [binding, setBinding] = useState<string | null>(null);

  const openBind = useCallback(async (accountId: string, ownerId: string | null) => {
    setBindFor({ id: accountId, ownerId });
    setBindCandidates([]);
    setBindLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "list_ru_candidates" },
      });
      if (error || !data?.success) {
        toast.error(data?.error?.message || error?.message || "Could not load RU sub-users");
        return;
      }
      setBindCandidates(data.users || []);
    } finally {
      setBindLoading(false);
    }
  }, []);

  const bindAccount = useCallback(
    async (ruOwnerId: string, loginEmail: string) => {
      if (!bindFor) return;
      setBinding(ruOwnerId);
      try {
        const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
          body: {
            action: "bind_ru_account",
            account_id: bindFor.id,
            ru_owner_id: ruOwnerId,
            login_email: loginEmail,
          },
        });
        if (error || !data?.success) {
          toast.error(data?.error?.message || error?.message || "Could not bind the RU account");
          return;
        }
        toast.success(`Bound to OwnerID ${ruOwnerId}`);
        setBindFor(null);
        await queryClient.invalidateQueries({ queryKey: ["ru-owner-accounts"] });
      } finally {
        setBinding(null);
      }
    },
    [bindFor, queryClient],
  );

  const openReset = useCallback((accountId: string, email: string) => {
    setResetFor({ id: accountId, email });
    setResetEmail(email);
    setResetPassword("");
  }, []);

  const saveResetPassword = useCallback(async () => {
    if (!resetFor) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: {
          action: "save_login_password",
          account_id: resetFor.id,
          password: resetPassword,
          login_email: resetEmail,
        },
      });
      if (error || !data?.success) {
        toast.error(
          data?.error?.message || (error ? await extractFunctionError(error, "Could not store the password") : "Could not store the password"),
        );
        return;
      }
      if (data.api_access_verified) {
        toast.success("RU portal password stored; API access verified");
      } else {
        toast.warning("RU portal password stored", { description: data.api_warning });
      }
      setResetFor(null);
      setResetPassword("");
      await queryClient.invalidateQueries({ queryKey: ["ru-owner-accounts"] });
    } finally {
      setSaving(false);
    }
  }, [queryClient, resetEmail, resetFor, resetPassword]);





  const { data: accounts = [], isLoading } = useQuery({
    queryKey: ["ru-owner-accounts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ru_owner_accounts")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as RuAccount[];
    },
  });

  const { data: portfolios = [] } = useQuery({
    queryKey: ["ru-portfolios-lite"],
    queryFn: async () => {
      const { data } = await supabase.from("property_portfolios").select("id, name, slug");
      return (data || []) as { id: string; name: string; slug: string }[];
    },
  });

  const { data: members = [] } = useQuery({
    queryKey: ["ru-portfolio-members"],
    queryFn: async () => {
      const { data } = await supabase.from("property_portfolio_members").select("portfolio_id, property_id");
      return (data || []) as { portfolio_id: string; property_id: string }[];
    },
  });

  const { data: properties = [] } = useQuery({
    queryKey: ["ru-properties-lite"],
    queryFn: async () => {
      const { data } = await supabase
        .from("properties")
        .select("id, name, owner_email, city, ru_push_enabled, ru_archived")
        .eq("is_active", true)
        .order("name");
      return (data || []) as PropRow[];
    },
  });

  const propById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const portfolioById = useMemo(() => new Map(portfolios.map((p) => [p.id, p])), [portfolios]);

  const rows = useMemo(() => {
    return accounts.map((acc) => {
      let scopeLabel = "Owner";
      let scopeName = acc.owner_email;
      let linked: PropRow[] = [];

      if (acc.portfolio_id) {
        scopeLabel = "Portfolio";
        scopeName = portfolioById.get(acc.portfolio_id)?.name || "Unknown portfolio";
        linked = members
          .filter((m) => m.portfolio_id === acc.portfolio_id)
          .map((m) => propById.get(m.property_id))
          .filter((p): p is PropRow => !!p);
      } else if (acc.property_id) {
        scopeLabel = "Property";
        const p = propById.get(acc.property_id);
        scopeName = p?.name || "Unknown property";
        linked = p ? [p] : [];
      } else {
        linked = properties.filter(
          (p) => (p.owner_email || "").toLowerCase() === acc.owner_email.toLowerCase()
        );
      }

      return { acc, scopeLabel, scopeName, linked };
    });
  }, [accounts, members, portfolioById, propById, properties]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) =>
        r.scopeName.toLowerCase().includes(q) ||
        r.acc.owner_email.toLowerCase().includes(q) ||
        (r.acc.ru_user_id || "").toLowerCase().includes(q) ||
        (r.acc.ru_owner_id || "").toLowerCase().includes(q) ||
        r.linked.some((p) => p.name.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const totalPushEnabled = useMemo(
    () => properties.filter((p) => p.ru_push_enabled).length,
    [properties]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">{accounts.length}</div>
            <p className="text-xs text-muted-foreground">RU sub-accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">
              {rows.reduce((sum, r) => sum + r.linked.length, 0)}
            </div>
            <p className="text-xs text-muted-foreground">Properties under sub-accounts</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-4">
            <div className="text-2xl font-semibold">{totalPushEnabled}</div>
            <p className="text-xs text-muted-foreground">RU push enabled</p>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Input
          placeholder="Search sub-account, owner email, RU ID or property…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm text-sm"
        />
        <Button asChild size="sm" variant="outline" className="gap-1.5">
          <RouterLink to="/admin/integrations/rentals-united">
            Certification console <ChevronRight className="h-4 w-4" />
          </RouterLink>
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ShieldCheck className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="text-sm">
            No Rentals United sub-accounts yet. Create one from Phase 1 of the RU onboarding pipeline.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(({ acc, scopeLabel, scopeName, linked }) => {
            const open = expanded === acc.id;
            return (
              <Card key={acc.id}>
                <CardHeader
                  className="py-3 cursor-pointer"
                  onClick={() => setExpanded(open ? null : acc.id)}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-start gap-2 min-w-0">
                      {open ? (
                        <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      ) : (
                        <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                      )}
                      <div className="min-w-0">
                        <CardTitle className="text-sm flex items-center gap-2 flex-wrap">
                          {scopeLabel === "Portfolio" ? (
                            <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          ) : scopeLabel === "Property" ? (
                            <Building2 className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <User2 className="h-4 w-4 text-muted-foreground" />
                          )}
                          {scopeName}
                          <Badge variant="outline" className="text-[10px]">
                            {scopeLabel}
                          </Badge>
                        </CardTitle>
                        <p className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1 truncate">
                          <Mail className="h-3 w-3" />
                          {acc.ru_login_email || acc.owner_email}
                        </p>
                      </div>
                    </div>
                    <div
                      className="flex items-center gap-1.5 flex-wrap"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={revealing === acc.id}
                        onClick={() =>
                          revealed[acc.id] ? hideCredentials(acc.id) : revealCredentials(acc.id)
                        }
                      >
                        {revealing === acc.id ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : revealed[acc.id] ? (
                          <EyeOff className="h-3 w-3" />
                        ) : (
                          <Eye className="h-3 w-3" />
                        )}
                        <span className="ml-1.5">{revealed[acc.id] ? "Hide" : "Reveal password"}</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => openReset(acc.id, acc.ru_login_email || acc.owner_email)}
                      >
                        <RotateCcw className="h-3 w-3" />
                        <span className="ml-1.5">Store portal password</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        disabled={verifying === acc.id}
                        onClick={() => verifyCredentials(acc.id)}
                      >
                        {verifying === acc.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
                        <span className="ml-1.5">Verify API access</span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => openBind(acc.id, acc.ru_owner_id)}
                      >
                        <Link2 className="h-3 w-3" />
                        <span className="ml-1.5">
                          {acc.ru_owner_id ? "Rebind RU account" : "Bind RU account"}
                        </span>
                      </Button>

                      {acc.ru_user_id && (
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          UID {acc.ru_user_id}
                        </Badge>
                      )}
                      {acc.ru_owner_id && (
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          OwnerID {acc.ru_owner_id}
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={
                          acc.company_details_sent
                            ? "text-success border-success/40 text-[10px]"
                            : "text-muted-foreground text-[10px]"
                        }
                      >
                        {acc.company_details_sent ? "Company details sent" : "Company details pending"}
                      </Badge>
                      {!acc.company_details_sent && (
                        <Badge
                          variant="outline"
                          className={
                            acc.company_details_status === "api_access_verified"
                              ? "text-success border-success/40 text-[10px]"
                              : acc.company_details_status === "api_access_failed" || acc.company_details_status === "failed"
                                ? "text-destructive border-destructive/40 text-[10px]"
                                : "text-muted-foreground text-[10px]"
                          }
                        >
                          {acc.company_details_status === "api_access_verified"
                            ? "API access verified"
                            : acc.company_details_status === "api_access_failed" || acc.company_details_status === "failed"
                              ? "API access failed"
                              : "Portal password stored"}
                        </Badge>
                      )}
                      <Badge variant="secondary" className="text-[10px]">
                        {linked.length} {linked.length === 1 ? "property" : "properties"}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                {(open || revealed[acc.id]) && (

                  <CardContent className="pt-0 pb-4 space-y-3">
                    {acc.ru_login_url && (
                      <a
                        href={acc.ru_login_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-primary inline-flex items-center gap-1 hover:underline"
                      >
                        {acc.ru_login_url} <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-medium flex items-center gap-1.5">
                          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                          RU portal credentials
                        </p>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          disabled={revealing === acc.id}
                          onClick={() =>
                            revealed[acc.id] ? hideCredentials(acc.id) : revealCredentials(acc.id)
                          }
                        >
                          {revealing === acc.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : revealed[acc.id] ? (
                            <EyeOff className="h-3 w-3" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          <span className="ml-1.5">{revealed[acc.id] ? "Hide" : "Reveal password"}</span>
                        </Button>
                      </div>
                      {revealed[acc.id] ? (
                        <div className="space-y-1 text-xs">
                          <p className="font-mono break-all">
                            {revealed[acc.id].login_email}
                          </p>
                          <div className="flex items-center gap-2">
                            <code className="font-mono px-2 py-1 rounded bg-background border border-border break-all">
                              {revealed[acc.id].password}
                            </code>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-[10px]"
                              onClick={() => {
                                navigator.clipboard.writeText(revealed[acc.id].password);
                                toast.success("Password copied");
                              }}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                          <p className="text-[10px] text-muted-foreground">
                            Stored encrypted at rest — every reveal is audit-logged.
                          </p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">
                          The generated sub-user password is kept encrypted so you can sign in to the
                          Rentals United portal later. Admin only.
                        </p>
                      )}
                    </div>

                    {linked.length === 0 ? (
                      <p className="text-xs text-muted-foreground">
                        No properties are currently linked to this sub-account.
                      </p>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {linked.map((p) => (
                          <div
                            key={p.id}
                            className="flex items-center gap-2 p-2 rounded-md bg-muted/30 border border-border"
                          >
                            <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-medium truncate">{p.name}</p>
                              <p className="text-[10px] text-muted-foreground truncate">
                                {p.owner_email || "No owner"} {p.city ? `· ${p.city}` : ""}
                              </p>
                            </div>
                            {p.ru_archived ? (
                              <Badge
                                variant="outline"
                                className="text-[9px] text-amber-700 border-amber-500/50 dark:text-amber-300"
                              >
                                Archived
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className={
                                  p.ru_push_enabled
                                    ? "text-success border-success/40 text-[9px]"
                                    : "text-muted-foreground text-[9px]"
                                }
                              >
                                {p.ru_push_enabled ? "Push on" : "Off"}
                              </Badge>
                            )}

                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={!!resetFor} onOpenChange={(o) => !o && setResetFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Store RU portal password</DialogTitle>
            <DialogDescription>
              Rentals United has no password-change API. Reset the password in the RU portal first,
              then store the same value here. It is encrypted at rest. API access to the bound
              OwnerID is checked separately using the configured integration credentials.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">RU login email</Label>
              <Input
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                className="text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">New password</Label>
              <Input
                type="text"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                placeholder="Minimum 8 characters"
                className="text-sm font-mono"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              size="sm"
              disabled={resetPassword.trim().length < 8 || saving}
              onClick={saveResetPassword}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
               Store password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bindFor} onOpenChange={(o) => !o && setBindFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Bind Rentals United sub-user</DialogTitle>
            <DialogDescription>
              These are the sub-users Rentals United currently holds under our master account.
              Pick the one this record should use — Phase 1 then reconnects to it instead of trying
              to create a duplicate.
            </DialogDescription>
          </DialogHeader>
          {bindLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : bindCandidates.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              Rentals United returned no sub-users under our master account.
            </p>
          ) : (
            <div className="space-y-2">
              {bindCandidates.map((u) => {
                const isCurrent = bindFor?.ownerId === u.owner_id;
                return (
                  <div
                    key={u.owner_id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono">OwnerID {u.owner_id}</p>
                      <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                    </div>
                    <Button
                      size="sm"
                      variant={isCurrent ? "secondary" : "outline"}
                      className="h-7 text-xs shrink-0"
                      disabled={isCurrent || binding === u.owner_id}
                      onClick={() => bindAccount(u.owner_id, u.email)}
                    >
                      {binding === u.owner_id && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                      {isCurrent ? "Bound" : "Bind"}
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

    </div>
  );
}

