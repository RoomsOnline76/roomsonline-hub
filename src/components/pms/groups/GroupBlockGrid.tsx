import { useMemo } from "react";
import { differenceInCalendarDays, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BedDouble, CalendarClock, UserPlus, Undo2 } from "lucide-react";

export interface GroupBlock {
  id: string;
  group_id: string;
  property_id: string | null;
  room_type_id: string;
  blocked_count: number;
  picked_up_count: number;
  rate_override: number | null;
  start_date: string;
  end_date: string;
  release_date: string | null;
  status: string;
  attrition_charged: boolean;
  room_type?: { name: string } | null;
}

interface GroupBlockGridProps {
  blocks: GroupBlock[];
  readOnly: boolean;
  busyBlockId?: string | null;
  onPickup: (block: GroupBlock) => void;
  onRelease: (block: GroupBlock) => void;
}

function releaseLabel(releaseDate: string | null): { text: string; urgent: boolean } | null {
  if (!releaseDate) return null;
  const days = differenceInCalendarDays(new Date(releaseDate), new Date());
  if (days < 0) return { text: "Release date passed", urgent: true };
  if (days === 0) return { text: "Releases today", urgent: true };
  return { text: `Releases in ${days} day${days === 1 ? "" : "s"}`, urgent: days <= 3 };
}

export default function GroupBlockGrid({ blocks, readOnly, busyBlockId, onPickup, onRelease }: GroupBlockGridProps) {
  const totals = useMemo(() => {
    const blocked = blocks.reduce((s, b) => s + (b.blocked_count || 0), 0);
    const picked = blocks.reduce((s, b) => s + (b.picked_up_count || 0), 0);
    return { blocked, picked, remaining: Math.max(0, blocked - picked) };
  }, [blocks]);

  if (blocks.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No room blocks allocated</p>;
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md border bg-muted/40 p-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Blocked</p>
          <p className="text-lg font-semibold text-foreground">{totals.blocked}</p>
        </div>
        <div className="rounded-md border bg-muted/40 p-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Picked up</p>
          <p className="text-lg font-semibold text-foreground">{totals.picked}</p>
        </div>
        <div className="rounded-md border bg-muted/40 p-2">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Remaining</p>
          <p className="text-lg font-semibold text-foreground">{totals.remaining}</p>
        </div>
      </div>

      {blocks.map((b) => {
        const remaining = Math.max(0, (b.blocked_count || 0) - (b.picked_up_count || 0));
        const pct = b.blocked_count ? Math.round(((b.picked_up_count || 0) / b.blocked_count) * 100) : 0;
        const rel = b.status === "blocked" ? releaseLabel(b.release_date) : null;
        const busy = busyBlockId === b.id;

        return (
          <Card key={b.id} className={b.status === "released" ? "opacity-70" : undefined}>
            <CardContent className="p-3 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-medium flex items-center gap-1.5">
                    <BedDouble className="h-3.5 w-3.5 text-muted-foreground" />
                    {b.room_type?.name || "Room Type"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {b.blocked_count} rooms · {format(new Date(b.start_date), "MMM d")} – {format(new Date(b.end_date), "MMM d")}
                    {b.rate_override ? ` · R${Number(b.rate_override).toFixed(2)}/night` : ""}
                  </p>
                  {rel && (
                    <p className={`text-xs flex items-center gap-1 mt-0.5 ${rel.urgent ? "text-destructive" : "text-muted-foreground"}`}>
                      <CalendarClock className="h-3 w-3" /> {rel.text}
                    </p>
                  )}
                  {b.attrition_charged && (
                    <p className="text-xs text-muted-foreground mt-0.5">Attrition charged to master folio</p>
                  )}
                </div>
                <Badge
                  variant={b.status === "blocked" ? "default" : b.status === "picked_up" ? "outline" : "secondary"}
                  className="text-[10px] capitalize shrink-0"
                >
                  {b.status.replace("_", " ")}
                </Badge>
              </div>

              <div className="space-y-1">
                <Progress value={pct} className="h-1.5" />
                <p className="text-[11px] text-muted-foreground">
                  {b.picked_up_count || 0} of {b.blocked_count} picked up · {remaining} still held
                </p>
              </div>

              {!readOnly && b.status !== "released" && (
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" disabled={busy || remaining <= 0} onClick={() => onPickup(b)}>
                    <UserPlus className="h-3.5 w-3.5 mr-1" /> Pick up room
                  </Button>
                  {b.status === "blocked" && (
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => onRelease(b)}>
                      <Undo2 className="h-3.5 w-3.5 mr-1" /> Release
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
