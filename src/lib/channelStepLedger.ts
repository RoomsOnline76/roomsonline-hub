import { supabase } from "@/integrations/supabase/client";
import { CHANNEL_STEP_LEDGER_SETTING_KEY } from "@/config/channelStepLedger";

/**
 * Is the channel step ledger rollout enabled?
 *
 * Phase 0: no caller switches behaviour on this. Default and every failure mode
 * resolve to `false`, so a missing row, a denied read or a network error keeps
 * the production path exactly as it is today.
 */
export async function isChannelStepLedgerEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("ru_platform_settings")
      .select("value")
      .eq("key", CHANNEL_STEP_LEDGER_SETTING_KEY)
      .maybeSingle();
    if (error) return false;
    return (data?.value as { enabled?: boolean } | null)?.enabled === true;
  } catch {
    return false;
  }
}
