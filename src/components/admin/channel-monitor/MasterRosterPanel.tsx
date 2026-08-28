import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, KeyRound, Loader2, RefreshCw, Trash2, Users, XCircle } from "lucide-react";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface RosterUser {
  owner_id?: string | null;
  email?: string | null;
  login_email?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  archived?: boolean | null;
}

interface StoredKey {
  id: string;
  ru_owner_id: string | null;
  login_email: string | null;
  access_key: string | null;
  key_label: string | null;
  key_scope: string | null;
}

interface RosterResult {
  users: RosterUser[];
  retiredIds: Set<string>;
  boundIds: Set<string>;
  storedKeys: StoredKey[];
  /** Accounts the channel reports as archived/closed — excluded from the list and the counts. */
  archivedExcluded: number;
  readAt: Date;
}

type CloseState = "queued" | "running" | "closed" | "pending" | "blocked" | "failed";

interface CloseOutcome {
  state: CloseState;
  message: string;
}

type KeyGenState = "queued" | "running" | "minted" | "already_held" | "master_pair" | "rate_limited" | "refused";

interface KeyGenOutcome {
  state: KeyGenState;
  message: string;
}

const KEYGEN_LABEL: Record<KeyGenState, string> = {
  queued: "Waiting",
  running: "Minting…",
  minted: "Key minted & stored",
  already_held: "Key already held",
  master_pair: "Channel issued a master pair — discarded",
  rate_limited: "Rate limited — retry shortly",
  refused: "Channel refused the mint",
};

const KEYGEN_VARIANT: Record<KeyGenState, "secondary" | "outline" | "destructive"> = {
  queued: "outline",
  running: "outline",
  minted: "secondary",
  already_held: "secondary",
  master_pair: "destructive",
  rate_limited: "outline",
  refused: "destructive",
};

type RematchOutcome = "queued" | "running" | "already_correct" | "rematched" | "master_pair" | "duplicate" | "orphan" | "failed";

interface RematchResult {
  outcome: RematchOutcome;
  message: string;
  ownerId: string | null;
}


const REMATCH_LABEL: Record<RematchOutcome, string> = {
  queued: "Waiting",
  running: "Probing…",
  already_correct: "Already correct",
  rematched: "Rematched",
  master_pair: "Master pair (unusable)",
  duplicate: "Duplicate — not moved",
  orphan: "Orphan — no account accepts it",
  failed: "Probe failed",
};

const REMATCH_VARIANT: Record<RematchOutcome, "secondary" | "outline" | "destructive"> = {
  queued: "outline",
  running: "outline",
  already_correct: "secondary",
  rematched: "secondary",
  master_pair: "destructive",
  duplicate: "destructive",
  orphan: "destructive",
  failed: "destructive",
};

/** The channel closes accounts one at a time; this is the gap we leave between them. */
const DEFAULT_COOLDOWN_SECONDS = 60;
const MIN_COOLDOWN_SECONDS = 30;
const MAX_COOLDOWN_SECONDS = 300;

function label(user: RosterUser): string {
  return user.login_email || user.email || "(no login recorded)";
}

const STATE_LABEL: Record<CloseState, string> = {
  queued: "Waiting",
  running: "Closing…",
  closed: "Closed at channel",
  pending: "Close sent — confirming",
  blocked: "Cannot close via API",
  failed: "Close failed",
};

const STATE_VARIANT: Record<CloseState, "secondary" | "outline" | "destructive"> = {
  queued: "outline",
  running: "outline",
  closed: "secondary",
  pending: "outline",
  blocked: "destructive",
  failed: "destructive",
};

/**
 * Third section of the Advanced orphan tooling: a live read of the master account's
 * own sub-account roster (Pull_ListMyUsers_RQ, include_retired), so an operator can
 * see exactly what the channel holds under our master — including entries we have
 * retired locally — next to whether ROLOS has a binding for each one.
 *
 * Unbound rows can also be CLOSED at the channel from here. The channel's close verb is
 * irreversible and resource-heavy, so closes run strictly one at a time with a cooldown
 * between them, and the backend refuses any account that still has a ROLOS binding.
 */
export function MasterRosterPanel() {
  const [result, setResult] = useState<RosterResult | null>(null);
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [outcomes, setOutcomes] = useState<Record<string, CloseOutcome>>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [reason, setReason] = useState("");
  const [cooldownSeconds, setCooldownSeconds] = useState(DEFAULT_COOLDOWN_SECONDS);
  const [closing, setClosing] = useState(false);
  const [waitSeconds, setWaitSeconds] = useState(0);
  const [rematching, setRematching] = useState(false);
  const [rematchResults, setRematchResults] = useState<Record<string, RematchResult>>({});
  const [keySelected, setKeySelected] = useState<Set<string>>(new Set());
  const [keyOutcomes, setKeyOutcomes] = useState<Record<string, KeyGenOutcome>>({});
  const [generating, setGenerating] = useState(false);
  const cancelled = useRef(false);
  const rematchCancelled = useRef(false);
  const keyGenCancelled = useRef(false);

  const read = useMutation({
    mutationFn: async (): Promise<RosterResult> => {
      const [{ data, error }, { data: accounts }, { data: retiredRows }, { data: keyData }] =
        await Promise.all([
          supabase.functions.invoke("rentalsunited-api", {
            body: { action: "list_users", include_retired: true },
          }),
          supabase.from("ru_owner_accounts").select("ru_owner_id"),
          supabase.from("ru_retired_accounts").select("ru_owner_id"),
          supabase.functions.invoke("ru-cert-portal", { body: { action: "list_stored_api_keys" } }),
        ]);
      if (error) throw error;
      if (data?.success === false) {
        throw new Error(data?.error?.message || "The channel refused the roster read");
      }
      const all = Array.isArray(data?.users) ? (data.users as RosterUser[]) : [];
      /**
       * Accounts already archived/closed at the channel are dead weight here: they cannot be
       * closed again, they hold no usable keys, and they inflate every count. Drop them from
       * the list entirely and only report how many were excluded.
       */
      const users = all.filter((u) => !u.archived);
      return {
        users,
        archivedExcluded: all.length - users.length,
        boundIds: new Set(
          (accounts ?? []).map((a) => String(a.ru_owner_id ?? "").trim()).filter(Boolean),
        ),
        retiredIds: new Set(
          (retiredRows ?? []).map((r) => String(r.ru_owner_id ?? "").trim()).filter(Boolean),
        ),
        storedKeys: Array.isArray(keyData?.credentials)
          ? (keyData.credentials as StoredKey[]).filter((k) => !!k?.id)
          : [],
        readAt: new Date(),
      };
    },
    onSuccess: (r) => {
      setResult(r);
      toast.success(`Master account holds ${r.users.length} live sub-account(s)`);
    },

    onError: (e: unknown) => {
      toast.error(e instanceof Error ? e.message : "Could not read the master account roster");
    },
  });

  const needle = filter.trim().toLowerCase();
  const rows = useMemo(
    () =>
      (result?.users ?? []).filter((u) => {
        if (!needle) return true;
        return `${label(u)} ${u.owner_id ?? ""}`.toLowerCase().includes(needle);
      }),
    [needle, result],
  );

  /** Only unbound, not-yet-archived accounts can be closed. */
  const closableIds = useMemo(() => {
    const ids = new Set<string>();
    for (const u of result?.users ?? []) {
      const ownerId = String(u.owner_id ?? "").trim();
      if (!ownerId || u.archived) continue;
      if (result?.boundIds.has(ownerId)) continue;
      ids.add(ownerId);
    }
    return ids;
  }, [result]);

  const selectedList = useMemo(
    () => [...selected].filter((id) => closableIds.has(id)),
    [closableIds, selected],
  );

  const accountLabel = useCallback(
    (ownerId: string) => {
      const match = (result?.users ?? []).find((u) => String(u.owner_id ?? "").trim() === ownerId);
      return match ? label(match) : `OwnerID ${ownerId}`;
    },
    [result],
  );

  const toggle = (ownerId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });
  };

  useEffect(() => {
    if (waitSeconds <= 0) return;
    const t = setTimeout(() => setWaitSeconds((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [waitSeconds]);

  const expectedConfirm = selectedList.length === 1 ? selectedList[0] : "CLOSE";

  const closeOne = useCallback(
    async (ownerId: string): Promise<CloseOutcome> => {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: {
          action: "close_unbound_account",
          ru_owner_id: ownerId,
          reason: reason.trim() || null,
          cooldown_seconds: cooldownSeconds,
        },
      });
      if (data?.success === true) {
        return {
          state: data.confirmed ? "closed" : "pending",
          message: data.confirmed
            ? "The channel confirmed the account is archived and its keys are gone."
            : "The channel accepted the close — it can take several minutes to show on the roster.",
        };
      }
      const code = String(data?.error?.code ?? "");
      const message = data?.error?.message ?? error?.message ?? "The close did not complete";
      if (code === "NEEDS_KEYS") return { state: "blocked", message };
      if (code === "RATE_LIMITED" || code === "CLOSE_COOLDOWN" || code === "CLOSE_IN_PROGRESS") {
        return { state: "failed", message: `${message} Run it again in a moment.` };
      }
      return { state: "failed", message };
    },
    [cooldownSeconds, reason],
  );

  const runCloses = useCallback(async () => {
    const queue = [...selectedList];
    if (queue.length === 0) return;
    cancelled.current = false;
    setClosing(true);
    setConfirmOpen(false);
    setOutcomes(
      Object.fromEntries(
        queue.map((id) => [id, { state: "queued" as CloseState, message: "Waiting its turn" }]),
      ),
    );

    let closed = 0;
    for (let i = 0; i < queue.length; i += 1) {
      if (cancelled.current) break;
      const ownerId = queue[i];
      setOutcomes((prev) => ({
        ...prev,
        [ownerId]: { state: "running", message: "Closing at the channel — this can take minutes" },
      }));
      let outcome: CloseOutcome;
      try {
        outcome = await closeOne(ownerId);
      } catch (e) {
        outcome = { state: "failed", message: e instanceof Error ? e.message : String(e) };
      }
      setOutcomes((prev) => ({ ...prev, [ownerId]: outcome }));
      if (outcome.state === "closed" || outcome.state === "pending") closed += 1;

      // Honour the gap between closes: the channel treats this verb as resource-heavy.
      const isLast = i === queue.length - 1;
      if (!isLast && !cancelled.current) {
        setWaitSeconds(cooldownSeconds);
        for (let s = 0; s < cooldownSeconds && !cancelled.current; s += 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
        setWaitSeconds(0);
      }
    }

    setClosing(false);
    setSelected(new Set());
    setConfirmText("");
    if (closed > 0) {
      toast.success(`${closed} sub-account${closed === 1 ? "" : "s"} closed at the channel`);
      read.mutate();
    } else {
      toast.error("No sub-account was closed");
    }
    // read.mutate is stable for a mutation instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [closeOne, cooldownSeconds, selectedList]);

  /** Which OwnerID currently holds which stored pair — drives the per-row key badge. */
  const keyByOwner = useMemo(() => {
    const map = new Map<string, StoredKey>();
    for (const key of result?.storedKeys ?? []) {
      const id = String(key.ru_owner_id ?? "").trim();
      if (id) map.set(id, key);
    }
    return map;
  }, [result]);

  /**
   * Rematch every stored pair against this roster read.
   *
   * One pair per call, paced, so the channel's read limits are respected and the operator
   * can stop after the current pair. Candidates are the roster's unarchived accounts; the
   * backend probes them in order and stops on the first account that accepts the pair.
   */
  const runRematch = useCallback(async () => {
    const pairs = result?.storedKeys ?? [];
    if (pairs.length === 0) {
      toast.info("No stored key pairs to rematch");
      return;
    }
    const candidates = (result?.users ?? [])
      .filter((u) => !u.archived && String(u.owner_id ?? "").trim())
      .map((u) => ({ owner_id: String(u.owner_id).trim(), login_email: label(u) }));

    rematchCancelled.current = false;
    setRematching(true);
    setRematchResults(
      Object.fromEntries(
        pairs.map((p) => [p.id, { outcome: "queued" as RematchOutcome, message: "Waiting its turn", ownerId: p.ru_owner_id }]),
      ),
    );

    let moved = 0;
    for (const pair of pairs) {
      if (rematchCancelled.current) break;
      setRematchResults((prev) => ({
        ...prev,
        [pair.id]: { outcome: "running", message: "Probing the roster for its real owner", ownerId: pair.ru_owner_id },
      }));
      try {
        const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
          body: { action: "rematch_stored_keys", credential_id: pair.id, candidates },
        });
        if (data?.success === true) {
          const outcome = String(data.outcome ?? "failed") as RematchOutcome;
          if (outcome === "rematched") moved += 1;
          setRematchResults((prev) => ({
            ...prev,
            [pair.id]: {
              outcome: REMATCH_LABEL[outcome] ? outcome : "failed",
              message: String(data.message ?? ""),
              ownerId: String(data.ru_owner_id ?? pair.ru_owner_id ?? "") || null,
            },
          }));
        } else {
          setRematchResults((prev) => ({
            ...prev,
            [pair.id]: {
              outcome: "failed",
              message: data?.error?.message ?? error?.message ?? "The probe did not complete",
              ownerId: pair.ru_owner_id,
            },
          }));
        }
      } catch (e) {
        setRematchResults((prev) => ({
          ...prev,
          [pair.id]: { outcome: "failed", message: e instanceof Error ? e.message : String(e), ownerId: pair.ru_owner_id },
        }));
      }
      if (!rematchCancelled.current) await new Promise((r) => setTimeout(r, 1200));
    }

    setRematching(false);
    if (moved > 0) toast.success(`${moved} key pair${moved === 1 ? "" : "s"} refiled against the right sub-account`);
    else toast.success("Rematch finished — no pair needed moving");
    read.mutate();
    // read.mutate is stable for a mutation instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);

  /**
   * Generate a child key pair for accounts that hold none (or hold an unusable master pair).
   *
   * The backend authenticates AS the sub-account (its own login + the operator password),
   * verifies the issued pair really belongs to that OwnerID, tests it and stores it — which
   * is exactly the prerequisite the close verb was missing. Paced, one account at a time.
   */
  const generateKeys = useCallback(
    async (ownerIds: string[]) => {
      const queue = ownerIds.filter(Boolean);
      if (queue.length === 0) return;
      keyGenCancelled.current = false;
      setGenerating(true);
      setKeyOutcomes((prev) => {
        const next = { ...prev };
        for (const id of queue) next[id] = { state: "queued", message: "Waiting its turn" };
        return next;
      });

      let minted = 0;
      for (const ownerId of queue) {
        if (keyGenCancelled.current) break;
        const match = (result?.users ?? []).find((u) => String(u.owner_id ?? "").trim() === ownerId);
        setKeyOutcomes((prev) => ({
          ...prev,
          [ownerId]: { state: "running", message: "Asking the channel to issue this sub-account's key pair" },
        }));
        try {
          const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
            body: {
              action: "generate_child_key",
              ru_owner_id: ownerId,
              login_email: match ? label(match) : undefined,
            },
          });
          const status = String(data?.status ?? "") as KeyGenState;
          if (data?.success === true && (status === "minted" || status === "already_held")) {
            if (status === "minted") minted += 1;
            setKeyOutcomes((prev) => ({
              ...prev,
              [ownerId]: {
                state: status,
                message: String(data.message ?? "Key pair stored for this sub-account"),
              },
            }));
          } else {
            setKeyOutcomes((prev) => ({
              ...prev,
              [ownerId]: {
                state: KEYGEN_LABEL[status] ? status : "refused",
                message: data?.error?.message ?? error?.message ?? "The channel did not issue a key pair",
              },
            }));
          }
        } catch (e) {
          setKeyOutcomes((prev) => ({
            ...prev,
            [ownerId]: { state: "refused", message: e instanceof Error ? e.message : String(e) },
          }));
        }
        if (!keyGenCancelled.current && queue.length > 1) await new Promise((r) => setTimeout(r, 1500));
      }

      setGenerating(false);
      setKeySelected(new Set());
      if (minted > 0) {
        toast.success(`${minted} sub-account key pair${minted === 1 ? "" : "s"} minted, verified and stored`);
        read.mutate();
      } else {
        toast.error("No key pair was issued — see the per-account reason");
      }
      // read.mutate is stable for a mutation instance.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [result],
  );


  const forgetKey = useCallback(async (credentialId: string) => {
    const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
      body: { action: "forget_stored_key", credential_id: credentialId },
    });
    if (data?.success !== true) {
      toast.error(data?.error?.message ?? error?.message ?? "Could not remove the local copy");
      return;
    }
    toast.success("Local copy removed — any key still at the channel is untouched");
    setRematchResults((prev) => {
      const next = { ...prev };
      delete next[credentialId];
      return next;
    });
    read.mutate();
    // read.mutate is stable for a mutation instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);


  return (
    <div className="mt-4 rounded-md border border-border bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-xs font-medium">
            <Users className="h-3.5 w-3.5" />
            Master account roster
            {result ? (
              <Badge variant="secondary" className="text-[10px]">
                {result.users.length} live sub-account{result.users.length === 1 ? "" : "s"}
              </Badge>
            ) : null}
          </p>
          <p className="text-[11px] text-muted-foreground">
            Live read of every sub-account still open at the channel under our master account, with
            the ROLOS binding state for each. Accounts already archived or closed at the channel are
            excluded from this list and its counts. Unbound accounts can be closed at the channel —
            one at a time, with a pause between each.
            {result && result.archivedExcluded > 0
              ? ` ${result.archivedExcluded} archived account${result.archivedExcluded === 1 ? "" : "s"} excluded.`
              : ""}
            {result && ` Read ${result.readAt.toLocaleTimeString()}.`}
          </p>

        </div>
        <span className="flex flex-wrap items-center gap-2">
          {result ? (
            rematching ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => {
                  rematchCancelled.current = true;
                  toast.info("Stopping after the current key pair");
                }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Stop after this pair
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px]"
                disabled={closing || read.isPending || (result.storedKeys.length === 0)}
                onClick={() => void runRematch()}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Rematch stored keys ({result.storedKeys.length})
              </Button>
            )
          ) : null}
          {result && missingKeyIds.length > 0 ? (
            generating ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px]"
                onClick={() => {
                  keyGenCancelled.current = true;
                  toast.info("Stopping after the current account");
                }}
              >
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Stop after this account
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 text-[11px]"
                disabled={closing || rematching || read.isPending}
                onClick={() => void generateKeys(missingKeyIds)}
              >
                <KeyRound className="h-3.5 w-3.5" />
                Generate missing keys ({missingKeyIds.length})
              </Button>
            )
          ) : null}

          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 gap-1.5 text-[11px]"
            disabled={read.isPending || closing || rematching}
            onClick={() => read.mutate()}
          >
            {read.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {result ? "Re-read master" : "Read master account"}
          </Button>
        </span>
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

          {Object.keys(rematchResults).length > 0 && (
            <div className="space-y-1 rounded-md border border-border bg-background p-2">
              <p className="text-[11px] font-medium">
                Stored key pairs {rematching ? "— probing…" : "— last rematch"}
              </p>
              {(result.storedKeys.length > 0 ? result.storedKeys : []).map((pair) => {
                const res = rematchResults[pair.id];
                if (!res) return null;
                return (
                  <div key={pair.id} className="rounded-md border border-border/60 px-2 py-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex flex-wrap items-center gap-2 text-[11px]">
                        <span className="font-mono">····{String(pair.access_key ?? "").slice(-4)}</span>
                        <span className="text-muted-foreground">
                          {pair.login_email || "no login recorded"}
                        </span>
                        <Badge variant={REMATCH_VARIANT[res.outcome]} className="text-[10px]">
                          {res.outcome === "running" ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : null}
                          {REMATCH_LABEL[res.outcome]}
                        </Badge>
                      </span>
                      <span className="flex items-center gap-2">
                        <span className="font-mono text-[10px] text-muted-foreground">
                          OwnerID {res.ownerId || pair.ru_owner_id || "—"}
                        </span>
                        {res.outcome === "orphan" && !rematching ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-6 gap-1 text-[10px]"
                            onClick={() => void forgetKey(pair.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                            Remove locally
                          </Button>
                        ) : null}
                      </span>
                    </div>
                    {res.message ? (
                      <p className="mt-0.5 text-[10px] text-muted-foreground">{res.message}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}


          {closableIds.size > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2">
              <span className="text-[11px] text-muted-foreground">
                {selectedList.length === 0
                  ? `${closableIds.size} unbound account${closableIds.size === 1 ? "" : "s"} can be closed at the channel.`
                  : `${selectedList.length} selected for closing.`}
                {closing && waitSeconds > 0 ? ` Pausing ${waitSeconds}s before the next close.` : ""}
              </span>
              <span className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  Gap
                  <Input
                    type="number"
                    min={MIN_COOLDOWN_SECONDS}
                    max={MAX_COOLDOWN_SECONDS}
                    value={cooldownSeconds}
                    disabled={closing}
                    onChange={(e) =>
                      setCooldownSeconds(
                        Math.min(
                          MAX_COOLDOWN_SECONDS,
                          Math.max(MIN_COOLDOWN_SECONDS, Number(e.target.value) || DEFAULT_COOLDOWN_SECONDS),
                        ),
                      )
                    }
                    className="h-6 w-16 text-[11px]"
                  />
                  s
                </label>
                {closing ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px]"
                    onClick={() => {
                      cancelled.current = true;
                      toast.info("Stopping after the current account");
                    }}
                  >
                    Stop after this one
                  </Button>
                ) : (
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    className="h-7 gap-1.5 text-[11px]"
                    disabled={selectedList.length === 0}
                    onClick={() => {
                      setConfirmText("");
                      setConfirmOpen(true);
                    }}
                  >
                    <XCircle className="h-3.5 w-3.5" />
                    Close {selectedList.length || ""} account{selectedList.length === 1 ? "" : "s"}
                  </Button>
                )}
              </span>
            </div>
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
              const closable = closableIds.has(ownerId);
              const outcome = outcomes[ownerId];
              const storedKey = keyByOwner.get(ownerId);
              const keyOutcome = keyOutcomes[ownerId];
              const keyBadge = !storedKey
                ? { text: "No key", variant: "outline" as const }
                : storedKey.key_scope === "child"
                  ? { text: `Child key held ····${String(storedKey.access_key ?? "").slice(-4)}`, variant: "secondary" as const }
                  : storedKey.key_scope === "master_pair"
                    ? { text: "Master pair (unusable)", variant: "destructive" as const }
                    : { text: "Key held — unverified", variant: "outline" as const };
              /** Anything but a verified child pair means the close verb has no usable identity. */
              const needsKey = !storedKey || storedKey.key_scope !== "child";

              return (
                <div
                  key={ownerId || label(u)}
                  className="rounded-md border border-border bg-background px-3 py-1.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2 text-xs">
                      {closable ? (
                        <Checkbox
                          checked={selected.has(ownerId)}
                          disabled={closing}
                          onCheckedChange={() => toggle(ownerId)}
                          aria-label={`Select ${label(u)} for closing`}
                        />
                      ) : null}
                      {label(u)}
                      {retired ? (
                        <Badge variant="outline" className="text-[10px]">
                          Retired in ROLOS
                        </Badge>
                      ) : null}
                      <Badge variant={bound ? "secondary" : "destructive"} className="text-[10px]">
                        {bound ? "Bound" : "No binding"}
                      </Badge>
                      <Badge variant={keyBadge.variant} className="text-[10px]">
                        {keyBadge.text}
                      </Badge>
                      {keyOutcome ? (
                        <Badge variant={KEYGEN_VARIANT[keyOutcome.state]} className="text-[10px]">
                          {keyOutcome.state === "running" ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : null}
                          {KEYGEN_LABEL[keyOutcome.state]}
                        </Badge>
                      ) : null}
                      {outcome ? (
                        <Badge variant={STATE_VARIANT[outcome.state]} className="text-[10px]">
                          {outcome.state === "running" ? (
                            <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                          ) : null}
                          {STATE_LABEL[outcome.state]}
                        </Badge>
                      ) : null}
                    </span>
                    <span className="flex items-center gap-2">
                      {needsKey && ownerId ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-6 gap-1 text-[10px]"
                          disabled={generating || closing || rematching}
                          onClick={() => void generateKeys([ownerId])}
                        >
                          <KeyRound className="h-3 w-3" />
                          Generate key
                        </Button>
                      ) : null}
                      <span className="font-mono text-[10px] text-muted-foreground">
                        Sub-account: {ownerId || "—"}
                      </span>
                    </span>
                  </div>
                  {keyOutcome && keyOutcome.state !== "queued" ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">{keyOutcome.message}</p>
                  ) : null}
                  {outcome && outcome.state !== "queued" ? (
                    <p className="mt-1 text-[10px] text-muted-foreground">{outcome.message}</p>
                  ) : null}
                </div>

              );
            })
          )}
        </div>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={(next) => (!next ? setConfirmOpen(false) : undefined)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Close {selectedList.length} sub-account{selectedList.length === 1 ? "" : "s"} at the channel</DialogTitle>
            <DialogDescription>
              This is the channel's own close-account action and it cannot be undone. For each
              account the channel removes portal access, drops every channel connection, archives
              all of its listings and destroys its API keys. The account is then recorded as retired
              in ROLOS so every roster read, listing count and cost attribution skips it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <ul className="max-h-40 space-y-1 overflow-auto rounded-md border border-border p-2 text-xs">
              {selectedList.map((id) => (
                <li key={id} className="flex items-center justify-between gap-2">
                  <span className="truncate">{accountLabel(id)}</span>
                  <span className="font-mono text-[10px] text-muted-foreground">{id}</span>
                </li>
              ))}
            </ul>

            <p className="flex gap-2 rounded-md border border-destructive/40 p-2 text-[11px] text-destructive">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Only accounts with no ROLOS binding are offered here, and the backend refuses any
              account that is still bound. Closes run one at a time with a {cooldownSeconds}s gap.
            </p>

            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional) — stored with the retirement record"
              className="min-h-[60px] text-xs"
            />

            <div className="space-y-1">
              <p className="text-[11px] text-muted-foreground">
                Type <span className="font-mono">{expectedConfirm}</span> to confirm.
              </p>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder={expectedConfirm}
                className="h-8 text-xs"
              />
            </div>
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={confirmText.trim() !== expectedConfirm || selectedList.length === 0}
              onClick={() => void runCloses()}
            >
              Close {selectedList.length === 1 ? "this account" : "these accounts"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default MasterRosterPanel;
