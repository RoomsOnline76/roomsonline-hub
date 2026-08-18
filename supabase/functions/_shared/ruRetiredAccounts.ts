import { createClient } from 'npm:@supabase/supabase-js@2';

/**
 * Retired channel sub-accounts.
 *
 * Test/abandoned sub-accounts still exist in the channel's own sub-user roster, so
 * every roster read used to pick them up and then count, label, read listings for
 * and alert on them. They are retired in `ru_retired_accounts` and filtered out at
 * the source (the roster read itself), so no consumer needs its own guard and no
 * call is ever addressed to them again.
 */
export interface RetiredRuAccount {
  ru_owner_id: string;
  portal_email: string | null;
  reason: string | null;
  retired_at: string | null;
}

function adminClient() {
  return createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
    { auth: { persistSession: false } },
  );
}

/** Full retired list, for reporting the exclusion honestly in the UI. */
export async function fetchRetiredRuAccounts(): Promise<RetiredRuAccount[]> {
  try {
    const { data, error } = await adminClient()
      .from('ru_retired_accounts')
      .select('ru_owner_id, portal_email, reason, retired_at')
      .order('ru_owner_id');
    if (error) throw error;
    return ((data ?? []) as RetiredRuAccount[]).map((r) => ({
      ...r,
      ru_owner_id: String(r.ru_owner_id).trim(),
    }));
  } catch (e) {
    // A registry read failure must never widen the blast radius into "read everything":
    // callers treat an empty list as "nothing retired", which is the pre-existing
    // behaviour, and the failure is logged rather than silently swallowed.
    console.warn('[ruRetiredAccounts] Could not read the retired sub-account registry:', e instanceof Error ? e.message : e);
    return [];
  }
}

/** OwnerIDs that must never be read, counted, pushed to or reported. */
export async function fetchRetiredRuOwnerIds(): Promise<Set<string>> {
  const rows = await fetchRetiredRuAccounts();
  return new Set(rows.map((r) => r.ru_owner_id).filter(Boolean));
}
