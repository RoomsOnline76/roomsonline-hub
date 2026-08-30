import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2, Unlink } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface BoundAccount {
  ownerId: string;
  label: string;
  scopeLabel: string;
}

interface RetireResult {
  success?: boolean;
  stopped_after?: string;
  account_label?: string;
  archived_listings?: string[];
  failed_listings?: { listing_id: string; label: string; message: string }[];
  disconnected_properties?: string[];
  total_listings?: number;
  account_closed_at_channel?: boolean;
  account_close?: { status: string; code: string; message: string; confirmed: boolean };
  error?: { code?: string; message?: string } | string;
}

const BOUND_QUERY_KEY = ["channel-bound-sub-accounts"] as const;

/**
 * Retire a bound distribution account: archive its listings at the channel, archive
 * the sub-account so nothing reads it again, then disconnect the properties. The
 * property afterwards has no distribution login, so Step A must provision a fresh
 * one before it can be pushed again.
 */
export function RetireBoundAccountPanel() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [note, setNote] = useState("");
  /** Held for the run only — the channel close authenticates as the sub-account itself. */
  const [portalPassword, setPortalPassword] = useState("");
  const [result, setResult] = useState<RetireResult | null>(null);

  const { data: accounts, isLoading } = useQuery({
    queryKey: BOUND_QUERY_KEY,
    staleTime: 60_000,
    queryFn: async (): Promise<BoundAccount[]> => {
      const { data: rows } = await supabase
        .from("ru_owner_accounts")
        .select("ru_owner_id, ru_login_email, owner_email, property_id, portfolio_id");
      const live = (rows ?? []).filter((r) => String(r.ru_owner_id ?? "").trim());
      const propertyIds = live.map((r) => r.property_id).filter(Boolean) as string[];
      const portfolioIds = live.map((r) => r.portfolio_id).filter(Boolean) as string[];

      const [{ data: props }, { data: portfolios }] = await Promise.all([
        propertyIds.length
          ? supabase.from("properties").select("id, name").in("id", propertyIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
        portfolioIds.length
          ? supabase.from("property_portfolios").select("id, name").in("id", portfolioIds)
          : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      ]);
      const propName = new Map((props ?? []).map((p) => [p.id, p.name]));
      const portfolioName = new Map((portfolios ?? []).map((p) => [p.id, p.name]));

      return live.map((r) => ({
        ownerId: String(r.ru_owner_id).trim(),
        label: r.ru_login_email || r.owner_email || "(no login recorded)",
        scopeLabel: r.portfolio_id
          ? `Portfolio: ${portfolioName.get(r.portfolio_id as string) ?? "unknown"}`
          : r.property_id
            ? `Property: ${propName.get(r.property_id as string) ?? "unknown"}`
            : "No property or portfolio",
      }));
    },
  });

  const chosen = useMemo(
    () => (accounts ?? []).find((a) => a.ownerId === selected) ?? null,
    [accounts, selected],
  );

  const refreshDependents = () => {
    void queryClient.invalidateQueries({ queryKey: BOUND_QUERY_KEY });
    void queryClient.invalidateQueries({ queryKey: ["channel-orphan-sub-accounts"] });
    void queryClient.invalidateQueries({ queryKey: ["channel-cost-monitor"] });
    void queryClient.invalidateQueries({ queryKey: ["channel-reconciliation"] });
  };

  const retire = useMutation({
    mutationFn: async ({ ownerId, force }: { ownerId: string; force: boolean }) => {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: {
          action: "retire_owner_account",
          ru_owner_id: ownerId,
          reason: note.trim() || undefined,
          password: portalPassword.trim() || undefined,
          force,
        },
      });
      // A refusal comes back as a structured payload, not a thrown error, so it can
      // be shown honestly with a "Retire anyway" choice.
      if (data && typeof data === "object") return data as RetireResult;
      if (error) throw error;
      return {} as RetireResult;
    },
    onSuccess: (res) => {
      setResult(res);
      if (res.success) {
        toast.success(
          `${res.account_label ?? "Account"} retired — ${res.archived_listings?.length ?? 0} listing(s) archived, ${res.disconnected_properties?.length ?? 0} property(ies) disconnected, ${res.account_closed_at_channel ? "account closed at the channel" : "account close not confirmed"}`,
        );
        setOpen(false);
        setSelected("");
        setConfirmText("");
        setNote("");
        setPortalPassword("");
        refreshDependents();
      } else {
        const message = typeof res.error === "string" ? res.error : res.error?.message;
        toast.error(message ?? "The retirement did not complete");
      }
    },
    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not retire this account");
    },
  });

  const busy = retire.isPending;
  const confirmed = chosen ? confirmText.trim() === chosen.ownerId : false;
  const refused = (result?.failed_listings?.length ?? 0) > 0 && result?.success !== true;

  if (isLoading) return <Skeleton className="h-24 w-full" />;

  return (
    <div className="mt-4 space-y-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <Unlink className="h-4 w-4 text-muted-foreground" />
        <p className="text-sm font-medium">Retire a bound sub-account</p>
      </div>
      <p className="text-xs text-muted-foreground">
        Archives the listings at the channel first, then disconnects the property, then closes
        the sub-account at the channel so its portal login stops working. The property will need
        a fresh distribution account from Step A before it can be pushed again.
      </p>

      {(accounts ?? []).length === 0 ? (
        <p className="text-xs text-muted-foreground">No distribution account is bound right now.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <Select
            value={selected}
            onValueChange={(v) => {
              setSelected(v);
              setConfirmText("");
              setResult(null);
            }}
          >
            <SelectTrigger className="h-8 w-full max-w-md text-xs">
              <SelectValue placeholder="Choose a bound distribution account" />
            </SelectTrigger>
            <SelectContent>
              {(accounts ?? []).map((a) => (
                <SelectItem key={`${a.ownerId}-${a.scopeLabel}`} value={a.ownerId} className="text-xs">
                  {a.label} · OwnerID {a.ownerId} · {a.scopeLabel}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="h-8 gap-1.5 text-[11px]"
            disabled={!chosen || busy}
            onClick={() => {
              setResult(null);
              setConfirmText("");
              setOpen(true);
            }}
          >
            <Unlink className="h-3.5 w-3.5" />
            Retire account
          </Button>
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-sm">Retire {chosen?.label}</DialogTitle>
            <DialogDescription className="text-xs">
              OwnerID {chosen?.ownerId} · {chosen?.scopeLabel}
            </DialogDescription>
          </DialogHeader>

          <ol className="space-y-1.5 text-xs">
            <li className="flex items-start gap-2">
              <StepIcon
                state={busy ? "running" : result ? ((result.failed_listings?.length ?? 0) === 0 ? "done" : "failed") : "idle"}
              />
              <span>
                Archive every listing at the channel (property and units)
                {result?.total_listings != null && (
                  <span className="text-muted-foreground">
                    {" "}
                    — {result.archived_listings?.length ?? 0} of {result.total_listings} archived
                  </span>
                )}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <StepIcon state={busy ? "running" : result?.success ? "done" : "idle"} />
              <span>Record the retirement so nothing reads, counts or bills it again</span>
            </li>
            <li className="flex items-start gap-2">
              <StepIcon state={busy ? "running" : result?.success ? "done" : "idle"} />
              <span>
                Disconnect the property and remove the binding
                {result?.disconnected_properties?.length ? (
                  <span className="text-muted-foreground"> — {result.disconnected_properties.length} property(ies)</span>
                ) : null}
              </span>
            </li>
            <li className="flex items-start gap-2">
              <StepIcon
                state={busy ? "running" : result ? (result.account_closed_at_channel ? "done" : "failed") : "idle"}
              />
              <span>
                Close the account at the channel — the portal login stops working
                {result?.account_close ? (
                  <span className="text-muted-foreground"> — {result.account_close.message}</span>
                ) : null}
              </span>
            </li>
          </ol>

          {refused && (
            <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/5 p-2">
              <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                <AlertTriangle className="h-3.5 w-3.5" />
                The channel refused {result?.failed_listings?.length} listing(s)
              </p>
              {(result?.failed_listings ?? []).map((f) => (
                <p key={f.listing_id} className="text-[11px] text-muted-foreground">
                  {f.label} (listing {f.listing_id}): {f.message}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="retire-reason" className="text-xs">
              Reason (optional)
            </Label>
            <Input
              id="retire-reason"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Why this account is being retired"
              className="h-8 text-xs"
            />
            <Label htmlFor="retire-password" className="text-xs">
              Sub-account portal password (only needed when no key pair is stored)
            </Label>
            <Input
              id="retire-password"
              type="password"
              autoComplete="off"
              value={portalPassword}
              onChange={(e) => setPortalPassword(e.target.value)}
              placeholder="Used for this run only, never stored"
              className="h-8 text-xs"
            />
            <Label htmlFor="retire-confirm" className="text-xs">
              Type the OwnerID <span className="font-mono">{chosen?.ownerId}</span> to confirm
            </Label>
            <Input
              id="retire-confirm"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="h-8 font-mono text-xs"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={!confirmed || busy || !chosen}
              onClick={() => chosen && retire.mutate({ ownerId: chosen.ownerId, force: refused })}
            >
              {busy ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
              {refused ? "Retire anyway" : "Retire account"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StepIcon({ state }: { state: "idle" | "running" | "done" | "failed" }) {
  if (state === "running") return <Loader2 className="mt-0.5 h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground" />;
  if (state === "done") return <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />;
  if (state === "failed") return <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />;
  return <Badge variant="outline" className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded-full p-0" />;
}

export default RetireBoundAccountPanel;
