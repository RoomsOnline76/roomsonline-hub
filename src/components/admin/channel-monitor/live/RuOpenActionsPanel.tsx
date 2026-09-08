import { useCallback, useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { toast } from "sonner";

/**
 * Open action items: the short list of things the channel will not let us fix from here.
 *
 * Everything the sync can heal itself never appears here. What lands is the residue — a held
 * request whose own nights the channel insists are closed, a listing it no longer serves — with the
 * evidence we captured when we stopped retrying. Clearing an item is a deliberate act, so a fixed
 * problem stops reading as an open incident.
 */

interface OpenActionRow {
  id: string;
  kind: string;
  title: string;
  detail: string | null;
  reservation_id: string | null;
  verb: string | null;
  evidence: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

const KIND_LABELS: Record<string, string> = {
  confirm_request_blocked_dates: "Request cannot be accepted",
  listing_missing: "Listing not found at the channel",
  price_push_notice: "Price write returned a notice",
};

export function RuOpenActionsPanel() {
  const [rows, setRows] = useState<OpenActionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: readError } = await supabase
      .from("ru_open_actions")
      .select("id, kind, title, detail, reservation_id, verb, evidence, created_at, updated_at")
      .eq("status", "open")
      .order("created_at", { ascending: false })
      .limit(50);
    if (readError) setError(readError.message);
    else {
      setError(null);
      setRows((data ?? []) as unknown as OpenActionRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolve = useCallback(
    async (id: string) => {
      const { error: writeError } = await supabase
        .from("ru_open_actions")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id);
      if (writeError) {
        toast.error(`Could not clear this item: ${writeError.message}`);
        return;
      }
      toast.success("Cleared — it will come back only if the channel refuses again.");
      void load();
    },
    [load],
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-2">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              Needs someone at the channel
              <Badge variant={rows.length ? "destructive" : "outline"}>{rows.length}</Badge>
            </CardTitle>
            <CardDescription>
              Only what the sync cannot fix on its own. Retrying these has been stopped on purpose.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {error ? (
          <p className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            Could not read the open items: {error}
          </p>
        ) : null}
        {!loading && rows.length === 0 && !error ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            Nothing open — every refusal in the log resolved itself.
          </p>
        ) : null}
        {rows.map((row) => (
          <div key={row.id} className="rounded-md border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.title}</p>
                <p className="text-xs text-muted-foreground">
                  {KIND_LABELS[row.kind] ?? row.kind}
                  {row.reservation_id ? ` · reservation ${row.reservation_id}` : ""}
                  {` · raised ${formatDistanceToNow(new Date(row.created_at))} ago`}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={() => void resolve(row.id)}>
                Mark handled
              </Button>
            </div>
            {row.detail ? <p className="mt-2 text-sm text-muted-foreground">{row.detail}</p> : null}
            {row.evidence && Object.keys(row.evidence).length > 0 ? (
              <div className="mt-2 rounded bg-muted/40 p-2 font-mono text-[11px] text-muted-foreground">
                {Object.entries(row.evidence).map(([key, value]) => (
                  <div key={key} className="truncate">
                    <span className="font-semibold">{key}:</span> {String(value)}
                  </div>
                ))}
              </div>
            ) : null}
            {row.verb ? (
              <p className="mt-2 flex items-center gap-1 text-[11px] text-muted-foreground">
                <ExternalLink className="h-3 w-3" />
                Last attempted call: {row.verb}
              </p>
            ) : null}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
