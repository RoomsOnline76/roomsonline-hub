import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { CHANNEL_MANAGER } from "@/lib/channelVocabulary";

/**
 * Owner-facing content quality prompts.
 *
 * The channel manager runs a minimum content quality check on every listing before
 * onboarding. Where it fails, the specific data points come back in the result
 * notification — those are surfaced here as things the owner can act on. Vendor
 * naming stays out of this surface (see src/lib/channelVocabulary.ts).
 */

interface McqOrderRow {
  id: string;
  ru_property_id: string | null;
  status: string | null;
  ordered_at: string | null;
  response_preview: string | null;
}

interface Prompt {
  listing: string;
  points: string[];
}

function extractPoints(raw: string | null): { points: string[]; result: string | null } {
  if (!raw) return { points: [], result: null };
  try {
    const parsed = JSON.parse(raw);
    const note = parsed?.mcq_notification;
    const points: string[] = Array.isArray(note?.failing_points) ? note.failing_points : [];
    return { points, result: typeof note?.result === "string" ? note.result : null };
  } catch {
    return { points: [], result: null };
  }
}

export function RuMcqPrompts({ propertyId }: { propertyId: string }) {
  const [rows, setRows] = useState<McqOrderRow[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("ru_mcq_orders")
        .select("id, ru_property_id, status, ordered_at, response_preview")
        .eq("property_id", propertyId)
        .order("ordered_at", { ascending: false })
        .limit(40);
      if (!cancelled) setRows((data ?? []) as McqOrderRow[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [propertyId]);

  /** Newest order per listing — an older pass must not mask a newer failure. */
  const newest = useMemo(() => {
    const byListing = new Map<string, McqOrderRow>();
    for (const r of rows ?? []) {
      const key = String(r.ru_property_id ?? "-");
      if (!byListing.has(key)) byListing.set(key, r);
    }
    return Array.from(byListing.values());
  }, [rows]);

  const failing: Prompt[] = useMemo(
    () =>
      newest
        .filter((r) => r.status === "failed")
        .map((r) => {
          const { points, result } = extractPoints(r.response_preview);
          return {
            listing: r.ru_property_id ?? "Listing",
            points: points.length > 0 ? points : result ? [result] : ["Content did not meet the minimum quality bar."],
          };
        }),
    [newest],
  );

  if (!rows || newest.length === 0) return null;

  const pending = newest.filter((r) => r.status === "ordered").length;
  const passed = newest.filter((r) => r.status === "passed").length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          Listing content quality
          {failing.length === 0 && pending === 0 && (
            <Badge variant="default" className="gap-1">
              <CheckCircle2 className="h-3 w-3" /> Approved
            </Badge>
          )}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          The {CHANNEL_MANAGER} reviews your listing content before it can be distributed.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {failing.length > 0 &&
          failing.map((prompt) => (
            <div key={prompt.listing} className="rounded-md border border-destructive/40 p-3">
              <p className="flex items-center gap-2 text-sm font-medium text-foreground">
                <AlertTriangle className="h-4 w-4 text-destructive" /> Needs attention
              </p>
              <ul className="mt-1 list-disc pl-5 text-xs text-muted-foreground">
                {prompt.points.map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
              </ul>
            </div>
          ))}

        {pending > 0 && (
          <p className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" /> {pending} listing{pending === 1 ? "" : "s"} awaiting the review result.
          </p>
        )}

        {failing.length === 0 && pending === 0 && passed > 0 && (
          <p className="text-xs text-muted-foreground">
            {passed} listing{passed === 1 ? "" : "s"} passed the content review — nothing to fix.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
