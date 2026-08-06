import { format, parseISO } from "date-fns";
import { Pencil, Trash2, Users, CalendarCheck, ExternalLink } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { cn } from "@/lib/utils";
import { paxLabel, stayNights, type PlanRoom, type RoomsBooking } from "./roomTypePlanLayout";

export const ROOM_STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500/10 text-success border-emerald-500/20",
  occupied: "bg-blue-500/10 text-info border-blue-500/20",
  dirty: "bg-amber-500/10 text-warning border-amber-500/20",
  maintenance: "bg-red-500/10 text-destructive border-red-500/20",
  out_of_order: "bg-destructive/10 text-destructive border-destructive/20",
};

const STATUS_STRIP: Record<string, string> = {
  available: "bg-emerald-500",
  occupied: "bg-blue-500",
  dirty: "bg-amber-500",
  maintenance: "bg-red-500",
  out_of_order: "bg-destructive",
};

interface Props {
  room: PlanRoom;
  displayStatus: string;
  activeBooking?: RoomsBooking;
  nextBooking?: RoomsBooking;
  onEdit: (room: PlanRoom) => void;
  onDelete: (room: PlanRoom) => void;
  onStatusChange: (roomId: string, status: string) => void;
  onOpenBooking: (booking: RoomsBooking) => void;
}

/** A single physical room tile with hover detail and quick actions. */
export function RoomCard({
  room,
  displayStatus,
  activeBooking,
  nextBooking,
  onEdit,
  onDelete,
  onStatusChange,
  onOpenBooking,
}: Props) {
  return (
    <HoverCard openDelay={140} closeDelay={80}>
      <HoverCardTrigger asChild>
        <Card className="relative group overflow-hidden">
          <div className={cn("absolute left-0 top-0 h-full w-1", STATUS_STRIP[displayStatus] || "bg-muted")} />
          <CardHeader className="pb-2 pl-4">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-lg font-bold truncate">{room.room_number}</CardTitle>
              <div className="flex items-center gap-1">
                {room.max_occupancy != null && (
                  <Badge
                    variant="outline"
                    className="text-[10px] gap-1 group-hover:opacity-0 transition-opacity"
                    title={`Sleeps up to ${room.max_occupancy} guests`}
                  >
                    <Users className="h-3 w-3" />
                    {room.max_occupancy}
                  </Badge>
                )}
                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {activeBooking && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      title="Open reservation"
                      onClick={() => onOpenBooking(activeBooking)}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </Button>
                  )}
                  <Button variant="ghost" size="icon" className="h-6 w-6" title="Edit room" onClick={() => onEdit(room)}>
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 text-destructive"
                    title="Delete room"
                    onClick={() => onDelete(room)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            </div>
            {room.room_name && <p className="text-xs text-muted-foreground truncate">{room.room_name}</p>}
          </CardHeader>
          <CardContent className="space-y-2 pl-4">
            <Badge className={ROOM_STATUS_COLORS[displayStatus] || ""} variant="outline">
              {displayStatus.replace(/_/g, " ")}
            </Badge>
            {activeBooking ? (
              <button
                type="button"
                onClick={() => onOpenBooking(activeBooking)}
                className="block w-full text-left text-xs text-info dark:text-blue-300 truncate hover:underline"
              >
                {activeBooking.guest_name} · out {format(parseISO(activeBooking.check_out_date), "d MMM")}
              </button>
            ) : nextBooking ? (
              <p className="text-xs text-muted-foreground truncate">
                Next: {format(parseISO(nextBooking.check_in_date), "d MMM")}
              </p>
            ) : null}
            {room.room_type_name && <p className="text-xs text-muted-foreground truncate">{room.room_type_name}</p>}
            <Select value={displayStatus} onValueChange={(value) => onStatusChange(room.id, value)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(ROOM_STATUS_COLORS).map((status) => (
                  <SelectItem key={status} value={status}>{status.replace(/_/g, " ")}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      </HoverCardTrigger>
      <HoverCardContent align="start" className="w-72 p-3 space-y-2">
        <div>
          <p className="text-sm font-semibold">
            {room.room_number}
            {room.room_name ? ` · ${room.room_name}` : ""}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {room.room_type_name || "No room type"}
            {room.floor != null && ` · Floor ${room.floor}`}
            {room.max_occupancy != null && ` · Sleeps ${room.max_occupancy}`}
          </p>
        </div>
        {activeBooking ? (
          <button
            type="button"
            onClick={() => onOpenBooking(activeBooking)}
            className="w-full rounded-md border border-border px-2 py-1.5 text-left hover:border-primary hover:bg-muted/50 transition-colors"
          >
            <p className="text-xs font-medium">{activeBooking.guest_name}</p>
            <p className="text-[10px] text-muted-foreground">
              {format(parseISO(activeBooking.check_in_date), "d MMM")} → {format(parseISO(activeBooking.check_out_date), "d MMM")} ·{" "}
              {stayNights(activeBooking)} night{stayNights(activeBooking) === 1 ? "" : "s"}
            </p>
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Users className="h-3 w-3" />{paxLabel(activeBooking)}
            </p>
            <p className="text-[10px] text-primary mt-0.5">Open reservation →</p>
          </button>
        ) : (
          <p className="text-[11px] text-muted-foreground">No guest in house right now.</p>
        )}
        {nextBooking && (
          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
            <CalendarCheck className="h-3 w-3" />
            Next arrival {format(parseISO(nextBooking.check_in_date), "d MMM")} — {nextBooking.guest_name}
          </p>
        )}
      </HoverCardContent>
    </HoverCard>
  );
}
