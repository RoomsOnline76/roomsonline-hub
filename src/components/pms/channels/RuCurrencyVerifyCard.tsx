/**
 * Currency verification action for the channel wizard.
 *
 * The currency step is graded from `ru_currency_state`. Nothing in the wizard used to WRITE that
 * row, so a property whose currency is perfectly correct in the channel portal sat on
 * "No currency state recorded" forever with no way forward. This card runs the existing read-back
 * (`verify_ru_currency` — it asks the channel what currency it actually holds for each listing and
 * records the answer) and re-grades the step. It fires itself once when no state exists yet, so the
 * common case verifies automatically.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Coins, Loader2, RefreshCw, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ListingResult {
  ru_property_id: number;
  ru_reported_iso: string | null;
  on_master_account?: boolean;
  matches: boolean;
  deferred?: boolean;
  error?: string | null;
}

interface VerifyResult {
  property_id: string;
  name?: string | null;
  success?: boolean;
  reason?: string | null;
  listings?: ListingResult[];
  notes?: string[];
  rate_deferred?: boolean;
  retry_after_ms?: number;
}

interface Props {
  propertyId: string;
  disabled?: boolean;
}

export function RuCurrencyVerifyCard({ propertyId, disabled }: Props) {
  const queryClient = useQueryClient();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<VerifyResult | null>(null);
  /** null while unknown, so the auto-verify below never fires against a verified property. */
  const [verified, setVerified] = useState<boolean | null>(null);
  const autoRan = useRef<string | null>(null);
  const retryTimer = useRef<number | null>(null);
  const [deferredUntil, setDeferredUntil] = useState<number | null>(null);

  const loadState = useCallback(async () => {
    const { data } = await supabase
      .from("ru_currency_state")
      .select("verified_at, published_currency_iso, ru_reported_currency_iso")
      .eq("property_id", propertyId)
      .maybeSingle();
    const row = data as { verified_at: string | null; published_currency_iso: string | null; ru_reported_currency_iso: string | null } | null;
    setVerified(
      !!row?.verified_at &&
        (!row.ru_reported_currency_iso ||
          !row.published_currency_iso ||
          row.ru_reported_currency_iso === row.published_currency_iso),
    );
  }, [propertyId]);

  useEffect(() => {
    void loadState();
  }, [loadState]);

  const verify = useCallback(
    async (auto: boolean) => {
      setRunning(true);
      try {
        const { data, error } = await supabase.functions.invoke("push-property-to-ru", {
          body: { action: "verify_ru_currency", property_ids: [propertyId] },
        });
        if (error) throw error;
        const rows = ((data as { results?: VerifyResult[] } | null)?.results ?? []).filter(
          (r) => r.property_id === propertyId,
        );
        const row = rows[0] ?? null;
        setResult(row);

        const listings = row?.listings ?? [];
        const mismatched = listings.filter((l) => l.ru_reported_iso && !l.matches);
        if (!row) {
          if (!auto) toast.error("The channel has no listing to read a currency from yet");
        } else if (row.reason === "no_ru_listing_id") {
          if (!auto) toast.error("Publish the listing first — currency is read back from the live listing");
        } else if (row.rate_deferred) {
          // The channel allows one identical read per sliding minute. A second run fired
          // straight after a successful one is HELD, not failed — say so and retry it.
          const waitMs = Math.max(5_000, Number(row.retry_after_ms) || 60_000);
          setDeferredUntil(Date.now() + waitMs);
          if (!auto) toast.info("Already checked a moment ago — the channel limits repeat reads. Re-checking automatically in a minute.");
          if (retryTimer.current) window.clearTimeout(retryTimer.current);
          retryTimer.current = window.setTimeout(() => {
            setDeferredUntil(null);
            void verifyRef.current?.(true);
          }, waitMs + 1_000);
        } else if (mismatched.length > 0) {
          toast.warning(
            `The channel reports ${mismatched.map((l) => l.ru_reported_iso).join(", ")} on ${mismatched.length} listing(s)`,
          );
        } else if (listings.some((l) => l.matches)) {
          toast.success("Published currency verified against the channel");
        } else if (!auto) {
          toast.error("The channel did not answer with a currency — try again in a minute");
        }

        // Re-grade the step from the row that was just written.
        await loadState();
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ["rolos-onboarding-distribution", propertyId] }),
          queryClient.invalidateQueries({ queryKey: ["channel-step-ledger", propertyId] }),
        ]);
      } catch (e) {
        if (!auto) toast.error(e instanceof Error ? e.message : "Could not verify the published currency");
      } finally {
        setRunning(false);
      }
    },
    [propertyId, queryClient, loadState],
  );

  const verifyRef = useRef<typeof verify | null>(null);
  verifyRef.current = verify;
  useEffect(() => () => { if (retryTimer.current) window.clearTimeout(retryTimer.current); }, []);

  // Auto-verify once per property when nothing has been recorded — this is a read-back, so it is
  // safe to run unattended and it is what the operator would click anyway.
  useEffect(() => {
    if (verified !== false || disabled) return;
    if (autoRan.current === propertyId) return;
    autoRan.current = propertyId;
    void verify(true);
  }, [propertyId, verified, disabled, verify]);

  const listings = result?.listings ?? [];

  return (
    <div className="space-y-2 rounded-md border px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-2 text-xs font-medium">
          <Coins className="h-3.5 w-3.5 text-muted-foreground" />
          {deferredUntil
            ? "Checked a moment ago — the channel limits repeat reads, re-checking shortly…"
            : verified
            ? "Published currency verified against the channel"
            : running
              ? "Reading the currency the channel holds…"
              : "Verify the currency the channel holds for this listing"}
        </p>
        <Button
          type="button"
          size="sm"
          variant={verified ? "outline" : "default"}
          className="h-7 text-xs"
          disabled={running || disabled || deferredUntil !== null}
          onClick={() => void verify(false)}
        >
          {running ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <RefreshCw className="mr-1 h-3 w-3" />}
          {verified ? "Re-verify" : "Verify now"}
        </Button>
      </div>

      {listings.length > 0 && (
        <ul className="space-y-1">
          {listings.map((l) => (
            <li key={l.ru_property_id} className="flex flex-wrap items-center gap-2 text-[11px]">
              {l.matches ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-600" />
              ) : l.deferred ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : (
                <TriangleAlert className="h-3 w-3 text-amber-600" />
              )}
              <span className="font-mono text-muted-foreground">{l.ru_property_id}</span>
              <Badge variant="outline" className="text-[10px]">
                {l.ru_reported_iso ?? (l.deferred ? "queued" : "no answer")}
              </Badge>
              {l.on_master_account && <span className="text-amber-600">listing sits on the master account</span>}
              {l.deferred && <span className="text-muted-foreground">waiting out the channel's one-read-per-minute limit</span>}
              {l.error && !l.on_master_account && !l.deferred && <span className="text-muted-foreground">{l.error}</span>}
            </li>
          ))}
        </ul>
      )}

      {result?.reason === "no_ru_listing_id" && (
        <p className="text-[11px] text-muted-foreground">
          No channel listing ID is stored yet — publish the property first, then verify.
        </p>
      )}
      {(result?.notes ?? []).map((n) => (
        <p key={n} className="text-[11px] text-muted-foreground">
          {n}
        </p>
      ))}
    </div>
  );
}

export default RuCurrencyVerifyCard;
