import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RuLastSentPanel } from "@/components/portfolio/RuLastSentPanel";
import { PortfolioChannelPushPanel } from "@/components/portfolio/PortfolioChannelPushPanel";

import { companySyncEligible, pushReportedOn } from "@/lib/channelDistributionGate";
import { resetBillingForScope } from "@/lib/ownerBillingReset";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Link as RouterLink } from "react-router-dom";
import { toast } from "sonner";
import { extractFunctionError } from "@/lib/functionError";
import { notifyRuAccountsChanged } from "@/lib/ruAccountsSignal";

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
  Archive,
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
  Trash2,
  Unlink,
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
  ru_login_password_enc?: unknown;
  ru_api_access_key?: string | null;
  ru_api_key_label?: string | null;
  ru_api_keys_verified_at?: string | null;
  company_payload?: Record<string, unknown> | null;
  company_profile?: Record<string, unknown> | null;
  company_filled_at?: string | null;
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
  is_trading?: boolean | null;
  is_sandbox?: boolean | null;
}

export interface RuAccountManagerPanelProps {
  /** Scope the list to the accounts that serve this property. */
  propertyId?: string | null;
  /** Scope the list to this portfolio's account (inherited by all its members). */
  portfolioId?: string | null;
  /** Property ids in the scoped portfolio — used to match owner-email-only accounts. */
  memberIds?: string[];
  /** Hide the KPI cards and cross-links when embedded in a dialog. */
  embedded?: boolean;
}

/**
 * Rentals United distribution account manager.
 * Lists every RU sub-user created under the RoomsOnline master account and the
 * properties that sit beneath it (portfolio members, direct property scope, or
 * owner-email match). Rendered full-page on the Portfolios page and embedded —
 * scoped to one property/portfolio — inside the Step A account dialog.
 */
export function RuAccountManagerPanel({
  propertyId = null,
  portfolioId = null,
  memberIds,
  embedded = false,
}: RuAccountManagerPanelProps = {}) {
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

  const refreshAccounts = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: ["ru-owner-accounts"] });
    notifyRuAccountsChanged();
  }, [queryClient]);

  // Company details are no longer pushed by hand from here — Step A of the channel
  // onboarding is the only author, and it skips an already-accepted profile.




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
      await refreshAccounts();
    } finally {
      setVerifying(null);
    }
  }, [refreshAccounts]);

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
  // Unbind clears the local link entirely so Phase 1 can create a new sub-user.
  const [bindFor, setBindFor] = useState<{ id: string; ownerId: string | null } | null>(null);
  const [bindCandidates, setBindCandidates] = useState<
    { owner_id: string; email: string; user_account_id?: string; archived?: boolean }[]
  >([]);
  const [bindLoading, setBindLoading] = useState(false);
  const [binding, setBinding] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  // Archived sub-users can never authenticate again, so they stay hidden unless asked for.
  const [showArchivedCandidates, setShowArchivedCandidates] = useState(false);

  // Archiving a listed RU sub-user (Push_ArchiveUser_RQ, child auth). RU requires the sub-user's
  // own credentials, so when no password is stored locally the admin is prompted for it.
  const [archiving, setArchiving] = useState<string | null>(null);
  const [archivePrompt, setArchivePrompt] = useState<{ ownerId: string; email: string } | null>(null);
  const [archiveAccessKey, setArchiveAccessKey] = useState("");
  const [archiveSecretKey, setArchiveSecretKey] = useState("");

  // RU API keys per sub-user. Since RU's Nov-2025 rollout every sub-account must authenticate
  // API calls with its own AccessKey/SecretKey — the first pair is generated by the admin in the
  // RU dashboard (Security settings) and captured here; later pairs can be minted via the API.
  // Keys are stored against the RU OwnerID, so saving one sub-user never wipes another's.
  const [keysFor, setKeysFor] = useState<{ id: string; email: string; ownerId: string | null } | null>(null);
  const [keyAccess, setKeyAccess] = useState("");
  const [keySecret, setKeySecret] = useState("");
  const [keyLabel, setKeyLabel] = useState("ROLOS");
  const [keyOwnerId, setKeyOwnerId] = useState("");
  const [keyCandidates, setKeyCandidates] = useState<
    { owner_id: string; email: string; archived?: boolean }[]
  >([]);
  const [keyCandidatesLoading, setKeyCandidatesLoading] = useState(false);
  const [savingKeys, setSavingKeys] = useState(false);
  const [verifyingKeys, setVerifyingKeys] = useState<string | null>(null);
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [removingKeys, setRemovingKeys] = useState<string | null>(null);
  const [removeKeysFor, setRemoveKeysFor] = useState<{ id: string; ownerId: string | null; label: string } | null>(null);
  const [closeAsk, setCloseAsk] = useState(false);
  const [archiveAsk, setArchiveAsk] = useState<{ ownerId: string; email: string } | null>(null);




  // Unbinding clears the complete RU identity and the portfolio owner email, then prompts the
  // admin to choose the email that Phase 1 must use for the next RU sub-user login.
  // Extra RU company / legal-representative profile fields.

  const [ownerEmailFor, setOwnerEmailFor] = useState<{ portfolioId: string } | null>(null);
  const [ownerEmailChoice, setOwnerEmailChoice] = useState("");
  const [savingOwnerEmail, setSavingOwnerEmail] = useState(false);

  const openBind = useCallback(async (accountId: string, ownerId: string | null) => {
    setBindFor({ id: accountId, ownerId });
    setBindCandidates([]);
    setBindLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "list_ru_candidates" },
      });
      if (error || !data?.success) {
        const message =
          data?.error?.message ||
          (error ? await extractFunctionError(error, "Could not load RU sub-users") : "Could not load RU sub-users");
        // A rate-deferred sub-user list is "unknown", not "empty" — say so instead of
        // showing an empty picker that looks like the master account holds no logins.
        if (data?.rate_deferred || /rate limit/i.test(message)) toast.warning(message);
        else toast.error(message);
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
          toast.error(
            data?.error?.message ||
              (error ? await extractFunctionError(error, "Could not bind the RU account") : "Could not bind the RU account"),
          );
          return;
        }

        toast.success(`Bound to OwnerID ${ruOwnerId}`);
        setBindFor(null);
        await refreshAccounts();
      } finally {
        setBinding(null);
      }
    },
    [bindFor, refreshAccounts],
  );

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

  /** Clear the local RU OwnerID bind so Phase 1 can create a new sub-user. */
  const unbindAccount = useCallback(async () => {
    if (!bindFor) return;
    const acc = accounts.find((a) => a.id === bindFor.id);
    if (!acc) {
      toast.error("Account not found");
      return;
    }
    if (!acc.portfolio_id && !acc.property_id) {
      toast.error(
        "This account has no portfolio or property scope, so identity reset cannot target it.",
      );
      return;
    }
    setBinding("unbind");
    try {
      const billingScope = acc.portfolio_id ? "portfolio" : acc.property_id ? "property" : null;
      const billingEntity = acc.portfolio_id || acc.property_id;
      if (billingScope && billingEntity) {
        const reset = await resetBillingForScope(billingScope, billingEntity, "owner_unbound");
        if (!reset.ok) {
          toast.error(
            reset.message ||
              "The existing subscription could not be cancelled. Unbind was not completed.",
          );
          return;
        }
      }

      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: {
          action: "reset_phase1",
          mode: "identity",
          ...(acc.portfolio_id
            ? { portfolio_id: acc.portfolio_id }
            : { property_id: acc.property_id }),
        },
      });
      if (error || !data?.success) {
        toast.error(
          data?.error?.message ||
            (error
              ? await extractFunctionError(error, "Could not unbind the RU account")
              : "Could not unbind the RU account"),
        );
        return;
      }
      if (acc.portfolio_id) {
        await supabase
          .from("property_portfolios")
          .update({ owner_email: null } as never)
          .eq("id", acc.portfolio_id);
        queryClient.invalidateQueries({ queryKey: ["ru-portfolios-lite"] });
        setOwnerEmailFor({ portfolioId: acc.portfolio_id });
        setOwnerEmailChoice("");
      }
      toast.success("RU account unbound — login and OwnerID cleared. Choose the new RU login email.");
      hideCredentials(acc.id);
      setBindFor(null);
      await Promise.all([
        refreshAccounts(),
        queryClient.invalidateQueries({ queryKey: ["ru-properties-lite"] }),
      ]);
    } finally {
      setBinding(null);
    }
  }, [bindFor, accounts, refreshAccounts, hideCredentials, queryClient]);

  /** Archive the RU sub-user via Push_ArchiveUser_RQ (child auth only) then clear local bind. */
  const closeRuAccount = useCallback(async () => {
    if (!bindFor?.id) return;
    const acc = accounts.find((a) => a.id === bindFor.id);
    if (!acc?.ru_owner_id) {
      toast.error("No OwnerID bound — nothing to archive on Rentals United");
      return;
    }
    setCloseAsk(false);
    setClosing(true);

    try {
      const { data, error } = await supabase.functions.invoke("ru-close-user", {
        body: { account_id: bindFor.id },
      });
      if (error || !data?.success) {
        toast.error(
          data?.error?.message ||
            (error
              ? await extractFunctionError(error, "Could not archive the RU sub-user")
              : "Could not archive the RU sub-user"),
        );
        return;
      }
      toast.success(data.message || `OwnerID ${acc.ru_owner_id} archived on Rentals United`);
      hideCredentials(acc.id);
      setBindFor(null);
      await refreshAccounts();
    } finally {
      setClosing(false);
    }
  }, [bindFor, accounts, refreshAccounts, hideCredentials]);

  /**
   * Archive any RU sub-user listed under our master account (Push_ArchiveUser_RQ, child auth).
   * https://developer.rentalsunited.com/#close-user-account
   */
  const archiveCandidate = useCallback(
    async (
      ownerId: string,
      email: string,
      creds?: { access_key?: string; secret_key?: string },
      confirmed?: boolean,
    ) => {
      const hasCreds = Boolean(creds?.access_key && creds?.secret_key);
      if (!hasCreds && !confirmed) {
        setArchiveAsk({ ownerId, email });
        return;
      }
      setArchiveAsk(null);

      setArchiving(ownerId);

      try {
        const { data, error } = await supabase.functions.invoke("ru-close-user", {
          body: {
            ru_owner_id: ownerId,
            login_email: email,
            ...(hasCreds ? { access_key: creds!.access_key, secret_key: creds!.secret_key } : {}),
          },
        });
        if (error || !data?.success) {
          if (
            data?.error?.code === "API_KEYS_REQUIRED" ||
            data?.error?.code === "PASSWORD_REQUIRED" ||
            data?.error?.code === "RU_CHILD_LOGIN_REJECTED"
          ) {
            setArchivePrompt({ ownerId, email });
            setArchiveAccessKey("");
            setArchiveSecretKey("");
            toast.warning(data.error.message);
            return;
          }
          toast.error(
            data?.error?.message ||
              (error
                ? await extractFunctionError(error, "Could not archive the RU sub-user")
                : "Could not archive the RU sub-user"),
          );
          return;
        }
        toast.success(data.message || `OwnerID ${ownerId} archived on Rentals United`);
        setArchivePrompt(null);
        setArchiveAccessKey("");
        setArchiveSecretKey("");
        setBindCandidates((prev) => prev.filter((c) => c.owner_id !== ownerId));
        if (data.local_cleared) {
          setBindFor(null);
        }
        await refreshAccounts();
      } finally {
        setArchiving(null);
      }
    },
    [refreshAccounts],
  );




  /** Which RU OwnerIDs we already hold a key pair for (no secrets returned). */
  const { data: storedKeys = [] } = useQuery({
    queryKey: ["ru-stored-api-keys"],
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "list_stored_api_keys" },
      });
      if (error || !data?.success) return [];
      return (data.credentials ?? []) as {
        ru_owner_id: string;
        login_email: string | null;
        access_key: string;
        key_label: string | null;
        verified_at: string | null;
        shared_with_other_account?: boolean;
      }[];
    },
    staleTime: 60_000,
  });

  const storedKeyByOwner = useMemo(() => {
    const map = new Map<string, (typeof storedKeys)[number]>();
    for (const row of storedKeys) map.set(String(row.ru_owner_id), row);
    return map;
  }, [storedKeys]);

  const refreshStoredKeys = useCallback(async () => {
    await queryClient.refetchQueries({ queryKey: ["ru-stored-api-keys"] });
    notifyRuAccountsChanged();
  }, [queryClient]);


  const openKeys = useCallback(async (acc: RuAccount) => {
    setKeysFor({ id: acc.id, email: acc.ru_login_email || acc.owner_email, ownerId: acc.ru_owner_id });
    setKeyAccess("");
    setKeySecret("");
    setKeyLabel(acc.ru_api_key_label || "ROLOS");
    setKeyOwnerId(acc.ru_owner_id ?? "");
    // Keys are captured for the sub-account this dialog was opened for. Listing other
    // sub-users here invited saving a pair onto the wrong OwnerID, so only the bound
    // account is offered; when the row is not bound yet the picker still loads.
    setKeyCandidates([]);
    if (acc.ru_owner_id) return;
    setKeyCandidatesLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "list_ru_candidates" },
      });
      if (!error && data?.success) {
        setKeyCandidates(
          ((data.users ?? []) as { owner_id: string; email: string; archived?: boolean }[]).filter(
            (u) => !u.archived,
          ),
        );
      }
    } finally {
      setKeyCandidatesLoading(false);
    }
  }, []);


  /** Store (and validate) the sub-user's own RU API key pair, keyed on its RU OwnerID. */
  const saveApiKeys = useCallback(async () => {
    if (!keysFor) return;
    if (!keyOwnerId.trim()) {
      toast.error("Pick the RU sub-user (OwnerID) these keys belong to");
      return;
    }
    setSavingKeys(true);
    try {
      const targetEmail =
        keyCandidates.find((u) => u.owner_id === keyOwnerId.trim())?.email || keysFor.email;
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: {
          action: "save_api_keys",
          account_id: keysFor.id,
          ru_owner_id: keyOwnerId.trim(),
          login_email: targetEmail,
          access_key: keyAccess.trim(),
          secret_key: keySecret.trim(),
          key_label: keyLabel.trim() || null,
        },
      });
      if (error || !data?.success) {
        const message =
          data?.error?.message ||
          (error ? await extractFunctionError(error, "Could not save the API keys") : "Could not save the API keys");
        // Rate-limited checks are not rejections: nothing was stored and nothing condemned.
        if (data?.state === "deferred") toast.warning(message);
        else toast.error(message);
        return;
      }
      toast.success(`API keys stored for OwnerID ${keyOwnerId.trim()} and verified against the channel`);
      setKeysFor(null);
      await Promise.all([refreshAccounts(), refreshStoredKeys()]);
    } finally {
      setSavingKeys(false);
    }
  }, [keysFor, keyOwnerId, keyCandidates, keyAccess, keySecret, keyLabel, refreshAccounts, refreshStoredKeys]);


  /** Re-test the stored key pair on RU's XML surface. */
  const verifyApiKeys = useCallback(async (accountId: string, ownerId?: string | null) => {
    setVerifyingKeys(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "verify_api_keys", account_id: accountId, ru_owner_id: ownerId ?? undefined },
      });
      if (error || !data?.success) {
        toast.error(
          data?.error?.message ||
            (error ? await extractFunctionError(error, "Could not verify the API keys") : "Could not verify the API keys"),
        );
      } else {
        toast.success("Rentals United accepted the sub-user API keys");
      }
      await Promise.all([refreshAccounts(), refreshStoredKeys()]);
    } finally {
      setVerifyingKeys(null);
    }
  }, [refreshAccounts, refreshStoredKeys]);

  /** Manual reset: drop the stored key pair locally so a fresh one can be captured. */
  const removeApiKeys = useCallback(async (accountId: string, ownerId?: string | null) => {
    setRemoveKeysFor(null);
    setRemovingKeys(accountId);

    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: { action: "delete_api_keys", account_id: accountId, ru_owner_id: ownerId ?? undefined },
      });
      if (error || !data?.success) {
        toast.error(
          data?.error?.message ||
            (error ? await extractFunctionError(error, "Could not remove the API keys") : "Could not remove the API keys"),
        );
        return;
      }
      toast.success("Stored API keys removed — capture a new pair when ready");
      await Promise.all([refreshAccounts(), refreshStoredKeys()]);
    } finally {
      setRemovingKeys(null);
    }
  }, [refreshAccounts, refreshStoredKeys]);

  /** Mint an additional key pair through the RU API (needs a working credential already). */
  const createApiKey = useCallback(async (accountId: string, ownerId?: string | null) => {
    setCreatingKey(accountId);
    try {
      const { data, error } = await supabase.functions.invoke("ru-cert-portal", {
        body: {
          action: "create_api_key",
          account_id: accountId,
          ru_owner_id: ownerId ?? undefined,
          key_label: "ROLOS",
        },
      });
      if (error || !data?.success) {
        toast.error(
          data?.error?.message ||
            (error ? await extractFunctionError(error, "Could not create an API key") : "Could not create an API key"),
        );
        return;
      }
      toast.success(`New API key created (${data.access_key})`);
      await Promise.all([refreshAccounts(), refreshStoredKeys()]);
    } finally {
      setCreatingKey(null);
    }
  }, [refreshAccounts, refreshStoredKeys]);


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
      await refreshAccounts();
    } finally {
      setSaving(false);
    }
  }, [refreshAccounts, resetEmail, resetFor, resetPassword]);

  const { data: portfolios = [] } = useQuery({
    queryKey: ["ru-portfolios-lite"],
    queryFn: async () => {
      const { data } = await supabase
        .from("property_portfolios")
        .select("id, name, slug, owner_email");
      return (data || []) as { id: string; name: string; slug: string; owner_email: string | null }[];
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
        .select("id, name, owner_email, city, ru_push_enabled, ru_archived, is_trading, is_sandbox")
        .eq("is_active", true)
        .order("name");
      return (data || []) as PropRow[];
    },
  });

  // Properties carrying a channel-manager listing (building-level or unit-level).
  const { data: channelFootprint = [] } = useQuery({
    queryKey: ["ru-channel-footprint"],
    queryFn: async () => {
      const [propRes, unitRes] = await Promise.all([
        supabase.from("properties").select("id").not("rentalsunited_property_id", "is", null),
        supabase
          .from("hostfully_room_types")
          .select("property_id")
          .not("rentalsunited_property_id", "is", null),
      ]);
      const ids = new Set<string>();
      ((propRes.data || []) as { id: string }[]).forEach((r) => ids.add(r.id));
      ((unitRes.data || []) as { property_id: string | null }[]).forEach((r) => {
        if (r.property_id) ids.add(r.property_id);
      });
      return Array.from(ids);
    },
  });
  const channelFootprintIds = useMemo(() => new Set(channelFootprint), [channelFootprint]);

  const propById = useMemo(() => new Map(properties.map((p) => [p.id, p])), [properties]);
  const portfolioById = useMemo(() => new Map(portfolios.map((p) => [p.id, p])), [portfolios]);

  const ownerEmailOptions = useMemo(() => {
    if (!ownerEmailFor) return [] as string[];
    return Array.from(
      new Set(
        members
          .filter((m) => m.portfolio_id === ownerEmailFor.portfolioId)
          .map((m) => propById.get(m.property_id)?.owner_email)
          .filter((e): e is string => !!e && e.trim().length > 0),
      ),
    );
  }, [ownerEmailFor, members, propById]);

  const savePortfolioOwnerEmail = useCallback(async () => {
    if (!ownerEmailFor || !ownerEmailChoice.trim()) return;
    setSavingOwnerEmail(true);
    try {
      const { error } = await supabase
        .from("property_portfolios")
        .update({ owner_email: ownerEmailChoice.trim() } as never)
        .eq("id", ownerEmailFor.portfolioId);
      if (error) {
        toast.error(error.message);
        return;
      }
      const { error: accountError } = await supabase
        .from("ru_owner_accounts")
        .update({
          owner_email: ownerEmailChoice.trim(),
          ru_login_email: null,
          ru_login_url: null,
        } as never)
        .eq("portfolio_id", ownerEmailFor.portfolioId)
        .is("ru_owner_id", null);
      if (accountError) {
        toast.error(accountError.message);
        return;
      }
      toast.success("New portfolio email saved for the next RU login");
      queryClient.invalidateQueries({ queryKey: ["ru-portfolios-lite"] });
      queryClient.invalidateQueries({ queryKey: ["ru-owner-accounts"] });
      setOwnerEmailFor(null);
    } finally {
      setSavingOwnerEmail(false);
    }
  }, [ownerEmailFor, ownerEmailChoice, queryClient]);

  /**
   * One channel sub-account is ONE account. If a stray second local row points at
   * the same OwnerID (e.g. a property-scoped twin of the portfolio row the property
   * already inherits), it must not be listed as a separate account. Portfolio scope
   * wins, because that is the row every member property inherits.
   */
  const uniqueAccounts = useMemo(() => {
    const byOwner = new Map<string, RuAccount>();
    const out: RuAccount[] = [];
    for (const acc of accounts) {
      const ownerId = (acc.ru_owner_id || "").trim();
      if (!ownerId) {
        out.push(acc);
        continue;
      }
      const held = byOwner.get(ownerId);
      if (!held) {
        byOwner.set(ownerId, acc);
        continue;
      }
      if (!held.portfolio_id && acc.portfolio_id) byOwner.set(ownerId, acc);
    }
    return [...out, ...byOwner.values()];
  }, [accounts]);

  const rows = useMemo(() => {
    return uniqueAccounts.map((acc) => {

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
  }, [uniqueAccounts, members, portfolioById, propById, properties]);

  // When embedded we only ever show the accounts that serve the selected
  // property/portfolio — an account is in scope when it is bound to the portfolio,
  // to the property itself, or reaches either through its linked properties.
  const scoped = useMemo(() => {
    if (!propertyId && !portfolioId) return rows;
    const inScope = new Set<string>([...(memberIds ?? []), ...(propertyId ? [propertyId] : [])]);
    return rows.filter(
      (r) =>
        (portfolioId && r.acc.portfolio_id === portfolioId) ||
        (propertyId && r.acc.property_id === propertyId) ||
        r.linked.some((p) => inScope.has(p.id)),
    );
  }, [rows, propertyId, portfolioId, memberIds]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(
      (r) =>
        r.scopeName.toLowerCase().includes(q) ||
        r.acc.owner_email.toLowerCase().includes(q) ||
        (r.acc.ru_user_id || "").toLowerCase().includes(q) ||
        (r.acc.ru_owner_id || "").toLowerCase().includes(q) ||
        r.linked.some((p) => p.name.toLowerCase().includes(q))
    );
  }, [scoped, search]);

  // Scoped to the sub-account footprint and trading properties only, so this
  // counter matches the Channel Monitor card it links to.
  const linkedPropertyIds = useMemo(
    () => new Set(rows.flatMap((r) => r.linked.map((p) => p.id))),
    [rows]
  );
  // Properties with nothing on the channel manager must not pad these counters.
  const footprintLinkedIds = useMemo(
    () => new Set([...linkedPropertyIds].filter((id) => channelFootprintIds.has(id))),
    [linkedPropertyIds, channelFootprintIds]
  );
  const totalPushEnabled = useMemo(() => {
    return properties.filter((p) => {
      if (p.is_trading !== true || !footprintLinkedIds.has(p.id)) return false;
      const acc = rows.find((r) => r.linked.some((l) => l.id === p.id))?.acc;
      const ownerKey = acc?.ru_owner_id ? storedKeyByOwner.get(String(acc.ru_owner_id)) : undefined;
      const keysCaptured = acc?.ru_owner_id
        ? !!ownerKey?.access_key
        : !!acc?.ru_api_access_key;
      return pushReportedOn({
        ruPushEnabled: p.ru_push_enabled,
        ruOwnerId: acc?.ru_owner_id,
        keysCaptured,
        companyDetailsSent: acc?.company_details_sent,
      });
    }).length;
  }, [properties, footprintLinkedIds, rows, storedKeyByOwner]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!embedded && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { value: uniqueAccounts.length, label: "RU sub-accounts", focus: "accounts" },
            {
              value: footprintLinkedIds.size,
              label: "Properties under sub-accounts",
              focus: "sub-account-properties",
            },
            { value: totalPushEnabled, label: "RU push enabled", focus: "push-enabled" },
          ].map((card) => (
            <RouterLink
              key={card.focus}
              to={`/admin/channel-monitor?focus=${card.focus}`}
              className="block focus-visible:outline-none"
            >
              <Card className="transition-colors hover:border-primary">
                <CardContent className="py-4">
                  <div className="text-2xl font-semibold">{card.value}</div>
                  <p className="text-xs text-muted-foreground">{card.label}</p>
                  <p className="mt-1 flex items-center gap-1 text-[10px] text-primary">
                    Channel Monitor <ChevronRight className="h-3 w-3" />
                  </p>
                </CardContent>
              </Card>
            </RouterLink>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Input
          placeholder="Search sub-account, owner email, RU ID or property…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm text-sm"
        />
        {!embedded && (
          <Button asChild size="sm" variant="outline" className="gap-1.5">
            <RouterLink to="/admin/channel-monitor?tab=cert">
              Certification console <ChevronRight className="h-4 w-4" />
            </RouterLink>
          </Button>
        )}
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
            const status = (acc.company_details_status ?? "").toLowerCase();
            // Keys live per RU OwnerID — never fall back to legacy row-level keys for a
            // bound account, or a rebind would show the previous sub-user's state.
            const ownerKey = acc.ru_owner_id
              ? storedKeyByOwner.get(String(acc.ru_owner_id))
              : undefined;
            const activeAccessKey = acc.ru_owner_id
              ? (ownerKey?.access_key ?? null)
              : (acc.ru_api_access_key ?? null);
            const activeLabel = acc.ru_owner_id
              ? (ownerKey?.key_label ?? null)
              : (acc.ru_api_key_label ?? null);
            const activeVerified = acc.ru_owner_id
              ? (ownerKey?.verified_at ?? null)
              : (acc.ru_api_keys_verified_at ?? null);
            const apiVerified = Boolean(activeVerified);
            const showCredentialBadge =
              !acc.company_details_sent &&
              (apiVerified ||
                status === "api_access_failed" ||
                status === "failed" ||
                status === "credentials_failed" ||
                status === "password_stored" ||
                Boolean(acc.ru_login_password_enc));


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
                          {acc.ru_login_email || (acc.ru_owner_id ? acc.owner_email : "New RU login not created")}
                          <span className="text-[10px] opacity-70">· RU login</span>
                        </p>
                        {acc.portfolio_id && (
                          <p
                            className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-1 truncate"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <User2 className="h-3 w-3" />
                            {portfolioById.get(acc.portfolio_id)?.owner_email || "No portfolio owner email"}
                            <span className="text-[10px] opacity-70">· portfolio owner</span>
                            <button
                              type="button"
                              className="text-[10px] underline underline-offset-2"
                              onClick={() => {
                                setOwnerEmailChoice(
                                  portfolioById.get(acc.portfolio_id!)?.owner_email || ""
                                );
                                setOwnerEmailFor({ portfolioId: acc.portfolio_id! });
                              }}
                            >
                              change
                            </button>
                          </p>
                        )}
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
                        variant={activeAccessKey ? "outline" : "default"}
                        className="h-7 text-xs"
                        onClick={() => openKeys(acc)}
                      >
                        <KeyRound className="h-3 w-3" />
                        <span className="ml-1.5">
                          {activeAccessKey ? "API keys" : "Add API keys"}
                        </span>
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => openBind(acc.id, acc.ru_owner_id)}
                      >
                        <Link2 className="h-3 w-3" />
                        <span className="ml-1.5">
                          {acc.ru_owner_id ? "Rebind / Unbind / Close" : "Bind RU account"}
                        </span>
                      </Button>

                      {acc.ru_user_id && (
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          UID {acc.ru_user_id}
                        </Badge>
                      )}
                      {acc.ru_owner_id ? (
                        <Badge variant="secondary" className="font-mono text-[10px]">
                          OwnerID {acc.ru_owner_id}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          Not bound
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={
                          acc.ru_owner_id && acc.company_details_sent
                            ? "text-success border-success/40 text-[10px]"
                            : "text-muted-foreground text-[10px]"
                        }
                      >
                        {acc.ru_owner_id && acc.company_details_sent
                          ? "Company details sent"
                          : "Company details pending"}
                      </Badge>
                      {acc.ru_owner_id && !activeAccessKey && (
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">
                          API keys missing
                        </Badge>
                      )}
                      {showCredentialBadge && (
                        <Badge
                          variant="outline"
                          className={
                            apiVerified
                              ? "text-success border-success/40 text-[10px]"
                              : status === "api_access_failed" || status === "credentials_failed" || status === "failed"
                                ? "text-destructive border-destructive/40 text-[10px]"
                                : "text-muted-foreground text-[10px]"
                          }
                        >
                          {apiVerified
                            ? "API access verified"
                            : status === "api_access_failed" || status === "credentials_failed" || status === "failed"
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
                    {(() => {
                      return (
                    <div className="rounded-md border border-border bg-muted/20 p-3 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <p className="text-xs font-medium flex items-center gap-1.5">
                          <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />
                          RU sub-user API keys
                          {acc.ru_owner_id && (
                            <span className="text-[10px] font-normal text-muted-foreground font-mono">
                              OwnerID {acc.ru_owner_id}
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            onClick={() => openKeys(acc)}
                          >
                            <KeyRound className="h-3 w-3" />
                            <span className="ml-1.5">{activeAccessKey ? "Replace keys" : "Add keys"}</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={!activeAccessKey || verifyingKeys === acc.id}
                            onClick={() => verifyApiKeys(acc.id, acc.ru_owner_id)}
                          >
                            {verifyingKeys === acc.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <ShieldCheck className="h-3 w-3" />}
                            <span className="ml-1.5">Verify keys</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={creatingKey === acc.id}
                            onClick={() => createApiKey(acc.id, acc.ru_owner_id)}
                            title="Mint an additional key pair through the RU API"
                          >
                            {creatingKey === acc.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <RotateCcw className="h-3 w-3" />}
                            <span className="ml-1.5">New key via API</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs text-destructive border-destructive/40 hover:bg-destructive/10"
                            disabled={!activeAccessKey || removingKeys === acc.id}
                            onClick={() =>
                              setRemoveKeysFor({
                                id: acc.id,
                                ownerId: acc.ru_owner_id,
                                label: acc.ru_login_email || acc.owner_email,
                              })
                            }

                            title="Clear the stored key pair so a correct one can be captured"
                          >
                            {removingKeys === acc.id
                              ? <Loader2 className="h-3 w-3 animate-spin" />
                              : <Trash2 className="h-3 w-3" />}
                            <span className="ml-1.5">Remove keys</span>
                          </Button>
                        </div>
                      </div>
                      {activeAccessKey ? (
                        <div className="space-y-1 text-xs">
                          <p className="font-mono break-all">{activeAccessKey}</p>
                          {ownerKey?.shared_with_other_account ? (
                            <p className="text-[10px] font-medium text-destructive">
                              This AccessKey is also stored against another sub-account. One of the two is
                              wrong — every scoped call for it authenticates as the other RU account. Replace it
                              with a pair generated while signed in as this sub-user.
                            </p>
                          ) : null}
                          <p className="text-[10px] text-muted-foreground">
                            {activeLabel ? `Label "${activeLabel}". ` : ""}
                            {activeVerified
                              ? `Verified ${new Date(activeVerified).toLocaleString()}.`
                              : "Not verified yet."}{" "}
                            Stored against OwnerID {acc.ru_owner_id ?? "—"}; the secret is encrypted at
                            rest and never displayed.
                          </p>
                        </div>
                      ) : (
                        <p className="text-[10px] text-muted-foreground">
                          Rentals United requires each sub-user to authenticate with its own
                          AccessKey + SecretKey. Generate the first pair in the RU dashboard under
                          Security settings, then save it here — company details, building pushes and
                          archiving all use it. Keys are held per OwnerID, so adding one sub-user's
                          pair never replaces another's.
                        </p>
                      )}
                    </div>
                      );
                    })()}

                    {/*
                      The manual "Push company details" action is retired. Step A of the
                      channel onboarding owns the company profile: it pushes only when the
                      profile is missing or not yet accepted, and a property edit marks it
                      un-accepted so the next run re-sends it.
                    */}
                    {acc.company_filled_at && (
                      <div className="rounded-md border border-border bg-muted/20 p-3">
                        <p className="text-xs font-medium flex items-center gap-1.5">
                          <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                          Company details accepted {new Date(acc.company_filled_at).toLocaleString()}
                        </p>
                      </div>
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
                          {acc.ru_login_password_enc
                            ? "The generated sub-user password is kept encrypted so you can sign in to the Rentals United portal later. Admin only."
                            : "No password stored for this row. After Phase 1 creates a sub-user, the password is retained here automatically."}
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
                                  pushReportedOn({
                                    ruPushEnabled: p.ru_push_enabled,
                                    ruOwnerId: acc.ru_owner_id,
                                    keysCaptured: !!activeAccessKey,
                                    companyDetailsSent: acc.company_details_sent,
                                  })
                                    ? "text-success border-success/40 text-[9px]"
                                    : "text-muted-foreground text-[9px]"
                                }
                              >
                                {pushReportedOn({
                                  ruPushEnabled: p.ru_push_enabled,
                                  ruOwnerId: acc.ru_owner_id,
                                  keysCaptured: !!activeAccessKey,
                                  companyDetailsSent: acc.company_details_sent,
                                })
                                  ? "Push on"
                                  : "Off"}
                              </Badge>
                            )}

                          </div>
                        ))}
                      </div>
                    )}

                    <PortfolioChannelPushPanel
                      properties={linked}
                      ownerId={acc.ru_owner_id}
                      keysCaptured={!!activeAccessKey}
                      onDone={() => {
                        void queryClient.invalidateQueries({ queryKey: ["ru-properties-lite"] });
                      }}
                    />


                    <RuLastSentPanel
                      sentPayload={acc.company_payload ?? null}
                      currentProfile={acc.company_profile ?? null}
                      sentAt={acc.company_filled_at ?? null}
                      syncEligible={
                        companySyncEligible({
                          ruOwnerId: acc.ru_owner_id,
                          keysCaptured: !!activeAccessKey,
                          companyDetailsSent: acc.company_details_sent,
                          companyFilledAt: acc.company_filled_at,
                          ruPushEnabled: linked.some((p) =>
                            pushReportedOn({
                              ruPushEnabled: p.ru_push_enabled,
                              ruOwnerId: acc.ru_owner_id,
                              keysCaptured: !!activeAccessKey,
                              companyDetailsSent: acc.company_details_sent,
                            }),
                          ),
                        })
                      }
                    />
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

      <Dialog open={!!ownerEmailFor} onOpenChange={(o) => !o && setOwnerEmailFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Choose the portfolio owner email</DialogTitle>
            <DialogDescription>
              Set the owner email for{" "}
              {(ownerEmailFor && portfolioById.get(ownerEmailFor.portfolioId)?.name) || "this portfolio"}. Pick one of the
               member properties' owners (or type another) — Phase 1 uses this as the new RU sub-user login and contact email.

            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            {ownerEmailOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No member property has an owner email yet. Set one on a property first, or type an
                email below.
              </p>
            ) : (
              <div className="space-y-1">
                {ownerEmailOptions.map((email) => (
                  <Button
                    key={email}
                    type="button"
                    size="sm"
                    variant={ownerEmailChoice === email ? "secondary" : "outline"}
                    className="w-full justify-start h-8 text-xs"
                    onClick={() => setOwnerEmailChoice(email)}
                  >
                    <Mail className="h-3 w-3 mr-2" />
                    {email}
                  </Button>
                ))}
              </div>
            )}
            <div className="space-y-1 pt-1">
              <Label className="text-xs">Owner email</Label>
              <Input
                type="email"
                value={ownerEmailChoice}
                onChange={(e) => setOwnerEmailChoice(e.target.value)}
                placeholder="owner@example.com"
                className="text-sm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setOwnerEmailFor(null)}>
              Decide later
            </Button>
            <Button
              size="sm"
              disabled={!ownerEmailChoice.trim() || savingOwnerEmail}
              onClick={savePortfolioOwnerEmail}
            >
              {savingOwnerEmail && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
              Save owner email
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bindFor} onOpenChange={(o) => !o && setBindFor(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {bindFor?.ownerId ? "Rebind, unbind or close RU sub-user" : "Bind Rentals United sub-user"}
            </DialogTitle>
            <DialogDescription>
              {bindFor?.ownerId
                ? "Unbind clears the local OwnerID so Phase 1 can create a new sub-user. Close archives the sub-user on Rentals United via Push_ArchiveUser_RQ (child auth). Or pick a different existing RU account below to rebind."
                : "These are the sub-users Rentals United currently holds under our master account. Pick the one this record should use — Phase 1 then reconnects to it instead of trying to create a duplicate."}
            </DialogDescription>
          </DialogHeader>

          {bindFor?.ownerId && (() => {
            const boundAcc = accounts.find((a) => a.id === bindFor.id);
            const boundEmail = boundAcc?.ru_login_email || boundAcc?.owner_email || "—";
            return (
              <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-medium">Currently bound</p>
                  <p className="text-sm font-mono">
                    OwnerID <span className="font-semibold">{bindFor.ownerId}</span>
                  </p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {boundEmail}
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Unbind only clears the local link. Close archives the sub-user on Rentals United
                  (Push_ArchiveUser_RQ, child auth) and then clears the local bind.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={binding === "unbind" || closing}
                    onClick={unbindAccount}
                  >
                    {binding === "unbind" ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Unlink className="h-3 w-3 mr-1" />
                    )}
                    Unbind (local only)
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-xs"
                    disabled={closing || binding === "unbind"}
                    onClick={() => setCloseAsk(true)}
                  >
                    {closing ? (
                      <Loader2 className="h-3 w-3 animate-spin mr-1" />
                    ) : (
                      <Archive className="h-3 w-3 mr-1" />
                    )}
                    Close / Archive on RU
                  </Button>
                </div>
              </div>
            );
          })()}

          {bindLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : bindCandidates.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4">
              Rentals United returned no sub-users under our master account.
              {bindFor?.ownerId
                ? " You can still Unbind or Close above, then run Phase 1 to create a new sub-user."
                : ""}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-[11px] text-muted-foreground font-medium uppercase tracking-wide">
                  Or bind to an existing RU account
                </p>
                {bindCandidates.some((u) => u.archived) && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6 text-[11px]"
                    onClick={() => setShowArchivedCandidates((v) => !v)}
                  >
                    {showArchivedCandidates ? <EyeOff className="h-3 w-3 mr-1" /> : <Eye className="h-3 w-3 mr-1" />}
                    {showArchivedCandidates
                      ? "Hide archived"
                      : `Show archived (${bindCandidates.filter((u) => u.archived).length})`}
                  </Button>
                )}
              </div>
              {bindCandidates
                .filter((u) => showArchivedCandidates || !u.archived)
                .map((u) => {
                const isCurrent = bindFor?.ownerId === u.owner_id;

                return (
                  <div
                    key={u.owner_id}
                    className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-mono flex items-center gap-1.5">
                        OwnerID {u.owner_id}
                        {u.archived && (
                          <Badge variant="outline" className="text-[10px] px-1 py-0">Archived</Badge>
                        )}
                        {storedKeyByOwner.has(String(u.owner_id)) && (
                          <Badge variant="secondary" className="text-[10px] px-1 py-0">Keys stored</Badge>
                        )}
                      </p>
                      <p className="text-[11px] text-muted-foreground truncate">{u.email}</p>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant={isCurrent ? "secondary" : "outline"}
                        className="h-7 text-xs"
                        disabled={isCurrent || binding === u.owner_id || closing || archiving === u.owner_id}
                        onClick={() => bindAccount(u.owner_id, u.email)}
                      >
                        {binding === u.owner_id && <Loader2 className="h-3 w-3 animate-spin mr-1" />}
                        {isCurrent ? "Bound" : "Bind"}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        className="h-7 text-xs"
                        disabled={!!archiving || binding === u.owner_id || closing}
                        onClick={() => archiveCandidate(u.owner_id, u.email)}
                        title="Close / archive this sub-user on Rentals United"
                      >
                        {archiving === u.owner_id ? (
                          <Loader2 className="h-3 w-3 animate-spin mr-1" />
                        ) : (
                          <Archive className="h-3 w-3 mr-1" />
                        )}
                        Archive
                      </Button>
                    </div>
                  </div>

                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!keysFor} onOpenChange={(o) => !o && setKeysFor(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Distribution sub-account API keys</DialogTitle>
            <DialogDescription>
              {keysFor?.ownerId ? (
                <>
                  Capturing the AccessKey + SecretKey for{" "}
                  <span className="font-medium text-foreground">{keysFor.email ?? "this sub-account"}</span> (OwnerID{" "}
                  {keysFor.ownerId}). Sign in to the channel portal <em>as that account</em>, open Security settings,
                  create a key with the XmlApi scope and paste both values here. The pair is checked against this
                  account's own inventory before it is stored, and the secret is encrypted at rest.
                </>
              ) : (
                <>
                  This row is not bound to a sub-account yet — pick the sub-user the pair belongs to, then paste the
                  AccessKey + SecretKey generated while signed in as that account (Security settings, scope XmlApi).
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {keysFor?.ownerId ? (
              <div className="rounded-md border border-border bg-muted/40 p-2 text-xs">
                <p className="font-mono">OwnerID {keysFor.ownerId}</p>
                <p className="text-[11px] text-muted-foreground truncate">{keysFor.email ?? "no login email on file"}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label className="text-xs">Sub-account (OwnerID)</Label>
                {keyCandidatesLoading ? (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> Loading active sub-accounts…
                  </div>
                ) : (
                  <div className="max-h-40 overflow-y-auto rounded-md border border-border divide-y divide-border">
                    {keyCandidates.length === 0 && (
                      <p className="p-2 text-[11px] text-muted-foreground">
                        No active sub-accounts returned — bind one to this row first.
                      </p>
                    )}
                    {keyCandidates.map((u) => {
                      const selected = keyOwnerId === u.owner_id;
                      const hasKeys = storedKeyByOwner.has(String(u.owner_id));
                      return (
                        <button
                          key={u.owner_id}
                          type="button"
                          onClick={() => setKeyOwnerId(u.owner_id)}
                          className={`w-full text-left p-2 text-xs flex items-center justify-between gap-2 transition-colors ${
                            selected ? "bg-primary text-primary-foreground" : "hover:bg-muted/50"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="font-mono">OwnerID {u.owner_id}</span>
                            <span className="block text-[11px] opacity-80 truncate">{u.email}</span>
                          </span>
                          {hasKeys && (
                            <Badge variant={selected ? "secondary" : "outline"} className="text-[10px] px-1 py-0 shrink-0">
                              Keys stored
                            </Badge>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-1.5">

              <Label className="text-xs">AccessKey</Label>
              <Input
                autoComplete="off"
                className="font-mono text-sm"
                value={keyAccess}
                onChange={(e) => setKeyAccess(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">SecretKey</Label>
              <Input
                type="password"
                autoComplete="off"
                className="font-mono text-sm"
                value={keySecret}
                onChange={(e) => setKeySecret(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Label</Label>
              <Input value={keyLabel} onChange={(e) => setKeyLabel(e.target.value)} className="text-sm" />
            </div>
            <a
              href="https://new.rentalsunited.com/My/SecuritySettings"
              target="_blank"
              rel="noreferrer"
              className="text-[11px] text-primary inline-flex items-center gap-1"
            >
              Open RU security settings <ExternalLink className="h-3 w-3" />
            </a>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setKeysFor(null)}>Cancel</Button>
            <Button
              size="sm"
              disabled={!keyAccess.trim() || !keySecret.trim() || !keyOwnerId.trim() || savingKeys}
              onClick={saveApiKeys}
            >
              {savingKeys && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              Verify &amp; store
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!archivePrompt}
        onOpenChange={(o) => {
          if (!o) {
            setArchivePrompt(null);
            setArchiveAccessKey("");
            setArchiveSecretKey("");
          }
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Sub-user API keys required</DialogTitle>
            <DialogDescription>
              Rentals United closes an account only when the request is authenticated as that
              sub-user, using that sub-user's own API keys. Generate a pair in the RU dashboard
              (Security settings) while signed in as{" "}
              <span className="font-mono">{archivePrompt?.email}</span> (OwnerID{" "}
              {archivePrompt?.ownerId}) and paste it here. Used for this request only.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="ru-archive-access" className="text-xs">AccessKey</Label>
              <Input
                id="ru-archive-access"
                autoComplete="off"
                className="font-mono text-sm"
                value={archiveAccessKey}
                onChange={(e) => setArchiveAccessKey(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ru-archive-secret" className="text-xs">SecretKey</Label>
              <Input
                id="ru-archive-secret"
                type="password"
                autoComplete="off"
                className="font-mono text-sm"
                value={archiveSecretKey}
                onChange={(e) => setArchiveSecretKey(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setArchivePrompt(null);
                setArchiveAccessKey("");
                setArchiveSecretKey("");
              }}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!archiveAccessKey.trim() || !archiveSecretKey.trim() || !!archiving}
              onClick={() =>
                archivePrompt &&
                archiveCandidate(archivePrompt.ownerId, archivePrompt.email, {
                  access_key: archiveAccessKey.trim(),
                  secret_key: archiveSecretKey.trim(),
                })
              }
            >
              {archiving ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Archive className="h-3 w-3 mr-1" />
              )}
              Archive on RU
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={closeAsk} onOpenChange={(o) => !o && setCloseAsk(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-destructive" />
              Close distribution sub-account
            </DialogTitle>
            <DialogDescription>
              This closes the sub-account on the channel and clears the local bind. Properties under it are
              archived and channel connections removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setCloseAsk(false)}>
              Cancel
            </Button>
            <Button size="sm" variant="destructive" disabled={closing} onClick={closeRuAccount}>
              {closing ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Archive className="h-3 w-3 mr-1" />
              )}
              Close / Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!archiveAsk} onOpenChange={(o) => !o && setArchiveAsk(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-destructive" />
              Archive sub-account
            </DialogTitle>
            <DialogDescription>
              {archiveAsk
                ? `Archive OwnerID ${archiveAsk.ownerId} (${archiveAsk.email}) on the channel? Properties are archived and channel connections removed.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setArchiveAsk(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!!archiving}
              onClick={() => archiveAsk && archiveCandidate(archiveAsk.ownerId, archiveAsk.email, undefined, true)}
            >
              {archiving ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Archive className="h-3 w-3 mr-1" />
              )}
              Archive
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>


      <Dialog open={!!removeKeysFor} onOpenChange={(o) => !o && setRemoveKeysFor(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-destructive" />
              Remove stored API keys
            </DialogTitle>
            <DialogDescription>
              {removeKeysFor
                ? `Clear the stored Channel Manager API key pair${removeKeysFor.ownerId ? ` for OwnerID ${removeKeysFor.ownerId}` : ""} (${removeKeysFor.label}). Nothing changes on the channel — the pair is cleared here so a correct pair can be captured again.`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setRemoveKeysFor(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              variant="destructive"
              disabled={!!removingKeys}
              onClick={() => removeKeysFor && removeApiKeys(removeKeysFor.id, removeKeysFor.ownerId)}
            >
              {removingKeys ? (
                <Loader2 className="h-3 w-3 animate-spin mr-1" />
              ) : (
                <Trash2 className="h-3 w-3 mr-1" />
              )}
              Remove keys
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



    </div>
  );
}
