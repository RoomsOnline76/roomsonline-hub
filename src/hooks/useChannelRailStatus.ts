import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { onRuAccountsChanged } from "@/lib/ruAccountsSignal";

/**
 * Read-only readiness snapshot shared by the Channel Monitor status strip and the
 * left-rail status chips. The three queries below were previously issued inside
 * the removed Channel Monitor status strip; kept here so every surface reads the same
 * snapshot from a single fetch instead of duplicating it.
 */
export interface CertRunLite {
  id: string;
  suite: string | null;
  status: string | null;
  passed: number | null;
  failed: number | null;
  total: number | null;
  started_at: string | null;
  steps: unknown;
}

interface AccountLite {
  id: string;
  ru_owner_id: string | null;
  ru_api_access_key: string | null;
  ru_api_keys_verified_at: string | null;
}

interface CredLite {
  ru_owner_id: string | number | null;
  access_key: string | null;
  verified_at: string | null;
}

export interface ChannelRailStatus {
  loading: boolean;
  keys: { total: number; withKeys: number; verified: number };
  runs: CertRunLite[];
  latestRun: CertRunLite | null;
  reload: () => void;
}

export function useChannelRailStatus(): ChannelRailStatus {
  const [accounts, setAccounts] = useState<AccountLite[]>([]);
  const [creds, setCreds] = useState<CredLite[]>([]);
  const [runs, setRuns] = useState<CertRunLite[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [accRes, credRes, runRes] = await Promise.all([
      supabase.from("ru_owner_accounts").select("id, ru_owner_id, ru_api_access_key, ru_api_keys_verified_at"),
      supabase.from("ru_api_credentials").select("ru_owner_id, access_key, verified_at"),
      supabase
        .from("ru_cert_runs")
        .select("id, suite, status, passed, failed, total, started_at, steps")
        .order("created_at", { ascending: false })
        .limit(12),
    ]);
    setAccounts((accRes.data ?? []) as AccountLite[]);
    setCreds((credRes.data ?? []) as CredLite[]);
    setRuns((runRes.data ?? []) as CertRunLite[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Storing / verifying / rebinding keys happens on the Accounts tab; without this the
  // snapshot would keep reporting the state it read when the page first mounted.
  useEffect(() => onRuAccountsChanged(() => void load()), [load]);

  // Sub-user keys are normally stored in the credentials table keyed by OwnerID; only
  // older accounts carry them inline, so both sources count towards readiness.
  const keys = useMemo(() => {
    const credByOwner = new Map(creds.map((c) => [String(c.ru_owner_id ?? ""), c]));
    let withKeys = 0;
    let verified = 0;
    for (const a of accounts) {
      const cred = credByOwner.get(String(a.ru_owner_id ?? ""));
      const hasKey = !!a.ru_api_access_key || !!cred?.access_key;
      const isVerified = !!a.ru_api_keys_verified_at || !!cred?.verified_at;
      if (hasKey) withKeys += 1;
      if (hasKey && isVerified) verified += 1;
    }
    return { total: accounts.length, withKeys, verified };
  }, [accounts, creds]);

  const reload = useCallback(() => void load(), [load]);

  return { loading, keys, runs, latestRun: runs[0] ?? null, reload };
}
