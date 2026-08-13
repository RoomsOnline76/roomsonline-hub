import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, RefreshCw, Link2Off } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useChannelRequestBacklog, type StuckChannelRequest } from "@/hooks/useChannelRequestBacklog";

interface Props {
  propertyIds?: string[];
  propertyNames?: Record<string, string>;
}

function stateLabel(item: StuckChannelRequest): { label: string; tone: "warn" | "error" } {
  if (item.state === "unmapped") return { label: "Listing not mapped", tone: "error" };
  if (item.state === "retrying") return { label: "Retrying", tone: "warn" };
  return { label: "Needs attention", tone: "error" };
}

/**
 * Unresolved channel reservation requests. A request that the channel could not serve yet
 * used to disappear without a trace — this keeps it visible until it becomes a stay.
 */
export function ChannelRequestBacklogCard({ propertyIds, propertyNames = {} }: Props) {
  const { items, loading, retry, retryingId, reload } = useChannelRequestBacklog({ propertyIds });
  const [expanded, setExpanded] = useState(false);

  if (loading && items.length === 0) return null;
  if (items.length === 0) return null;

  const visible = expanded ? items : items.slice(0, 3);

  const handleRetry = async (item: StuckChannelRequest) => {
    try {
      const result = await retry(item.id);
      if (result?.success) toast.success("Request pulled through and saved as a reservation");
      else toast.warning(result?.error || `Still unresolved (${result?.outcome ?? "no match"})`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  };

  return (
    <Card className="border-destructive/40">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-sm flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              Unresolved channel requests
              <Badge variant="destructive">{items.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">
              Requests the channel notified us about that have not become a reservation yet.
            </CardDescription>
          </div>
          <Button variant="ghost" size="sm" onClick={() => reload()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {visible.map((item) => {
          const tone = stateLabel(item);
          return (
            <div key={item.id} className="rounded-md border p-3 flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium truncate">
                  {item.guestName || `Request ${item.reservationId ?? "(no id)"}`}
                  {item.propertyId && propertyNames[item.propertyId] ? (
                    <span className="text-muted-foreground font-normal"> · {propertyNames[item.propertyId]}</span>
                  ) : null}
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                  {item.attempts > 0 ? ` · ${item.attempts} attempt${item.attempts === 1 ? "" : "s"}` : ""}
                  {item.error ? ` · ${item.error}` : ""}
                </div>
              </div>
              <Badge variant={tone.tone === "error" ? "destructive" : "secondary"} className="gap-1">
                {item.state === "unmapped" ? <Link2Off className="h-3 w-3" /> : null}
                {tone.label}
              </Badge>
              <Button size="sm" variant="outline" onClick={() => handleRetry(item)} disabled={retryingId === item.id}>
                <RefreshCw className={`h-3.5 w-3.5 mr-1 ${retryingId === item.id ? "animate-spin" : ""}`} />
                Retry
              </Button>
            </div>
          );
        })}
        {items.length > 3 ? (
          <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
            {expanded ? "Show fewer" : `Show all ${items.length}`}
          </Button>
        ) : null}
      </CardContent>
    </Card>
  );
}
