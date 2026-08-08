import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ArchiveEventRow } from "@/hooks/useChannelCostMonitor";

interface Props {
  events: ArchiveEventRow[];
}

export function ChannelArchiveLog({ events }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">Archive activity</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {events.length === 0 && (
          <p className="text-sm text-muted-foreground">No properties have been archived or re-activated yet.</p>
        )}
        {events.map((e) => (
          <div
            key={e.id}
            className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border pb-2 text-xs last:border-0 last:pb-0"
          >
            <Badge variant={e.direction === "archived" ? "outline" : "default"} className="text-[10px]">
              {e.direction === "archived" ? "Archived" : "Re-activated"}
            </Badge>
            <span className="font-medium">{e.property_name || e.property_id}</span>
            <span className="text-muted-foreground">
              {e.listing_count} listing{e.listing_count === 1 ? "" : "s"} · {e.unit_count} unit
              {e.unit_count === 1 ? "" : "s"}
            </span>
            <span className="text-muted-foreground">{e.actor_email || "unknown"}</span>
            <span className="ml-auto text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
