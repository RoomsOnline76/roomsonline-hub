import { useState } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { AlertTriangle, ChevronDown, ChevronUp, Pencil, Users } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getSaHolidayName, isWeekendDay } from "@/lib/saPublicHolidays";
import { MC_COL_W, MC_LABEL_W } from "@/components/pms/calendar/MultiCalendarSurface";
import {
  buildRoomTypePlan,
  cellHeatClass,
  overbookedNights,
  paxLabel,
  stayNights,
  type PlanRoom,
  type PlanRoomType,
  type RoomsBooking,
} from "./roomTypePlanLayout";
import { buildUnitRows, SELECTABLE_ROOM_STATUSES, statusMeta } from "./roomUnitStatus";

interface Props {
  dates: Date[];
  roomTypes: PlanRoomType[];
  rooms: PlanRoom[];
  bookings: RoomsBooking[];
  onSelectBooking: (booking: RoomsBooking) => void;
  /** Resolves the status shown for a physical room (occupied overrides available). */
  displayStatusFor?: (room: PlanRoom) => string;
  /** Persists a housekeeping status change made inside a room line. */
  onStatusChange?: (roomId: string, status: string) => void;
  /** Opens the room edit dialog from a room line. */
  onEditRoom?: (room: PlanRoom) => void;
  colW?: number;
  labelW?: number;
}

/** Sticky label-column header for the room type plan. */
export function RoomTypePlanLabelHeader() {
  return (
    <div className="flex items-center justify-between text-[10px] font-semibold text-muted-foreground">
      <span>Room type</span>
      <span className="font-normal">Units</span>
    </div>
  );
}

/** Status colour legend + hint, rendered once beneath the shared surface. */
export function RoomTypePlanLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border bg-muted/20 px-3 py-1.5">
      {SELECTABLE_ROOM_STATUSES.map((status) => (
        <span key={status} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className={cn("h-2 w-2 rounded-full", statusMeta(status).dot)} />
          {statusMeta(status).label}
        </span>
      ))}
      <span className="flex items-center gap-1.5 text-[10px] font-medium text-destructive">
        <span className="h-2 w-2 rounded-full bg-destructive" />
        Overbooked
      </span>
      <span className="ml-auto text-[10px] text-muted-foreground">Click a room type to open its room lines</span>
    </div>
  );
}

/**
 * Protel-style Room Type Plan rows: room types down, nights across, free units in
 * each cell with heat colouring, and a hover card listing the reservations on that
 * night. Rendered *inside* `MultiCalendarSurface`, which owns the single shared
 * horizontal scroller and the sticky date header for every property at once.
 */
export function RoomTypePlanRows({
  dates,
  roomTypes,
  rooms,
  bookings,
  onSelectBooking,
  displayStatusFor,
  onStatusChange,
  onEditRoom,
  colW = MC_COL_W,
  labelW = MC_LABEL_W,
}: Props) {
  const rows = buildRoomTypePlan(dates, roomTypes, rooms, bookings);
  const today = new Date();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const resolveStatus = displayStatusFor || ((room: PlanRoom) => room.status);
  const toggleType = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));

  if (roomTypes.length === 0) {
    return (
      <div className="border-b border-border bg-muted/10 px-3 py-2 text-[11px] text-muted-foreground">
        No room types configured yet — add them in Property Overview to see the plan.
      </div>
    );
  }

  return (
    <>
      {rows.map((row) => (
        <div key={row.roomType.id}>
          <div className="flex border-b border-border hover:bg-muted/20">
            <button
              type="button"
              onClick={() => toggleType(row.roomType.id)}
              className="sticky left-0 z-10 flex shrink-0 items-center justify-between gap-2 bg-card px-2 py-0.5 text-left"
              style={{ width: labelW }}
              aria-expanded={!!expanded[row.roomType.id]}
            >
              <span className="flex min-w-0 items-center gap-1">
                {expanded[row.roomType.id] ? (
                  <ChevronUp className="h-3 w-3 shrink-0 text-muted-foreground" />
                ) : (
                  <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                )}
                <span className="truncate text-[11px] font-medium" title={row.roomType.name}>
                  {row.roomType.name}
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-[11px] font-semibold tabular-nums text-muted-foreground">
                {overbookedNights(row).length > 0 && (
                  <Badge
                    variant="destructive"
                    className="gap-0.5 px-1 py-0 text-[9px]"
                    title={`${overbookedNights(row).length} overbooked night(s) in view`}
                  >
                    <AlertTriangle className="h-2.5 w-2.5" />
                    {overbookedNights(row).length}
                  </Badge>
                )}
                {row.units}
                {row.blocked > 0 && <span className="text-destructive"> −{row.blocked}</span>}
              </span>
            </button>

            {row.cells.map((cell) => {
              const isToday = isSameDay(cell.date, today);
              return (
                <HoverCard key={cell.date.toISOString()} openDelay={80} closeDelay={60}>
                  <HoverCardTrigger asChild>
                    <div
                      className={cn(
                        "shrink-0 cursor-default border-l border-border py-0.5 text-center text-[11px] tabular-nums",
                        isWeekendDay(cell.date) && "bg-muted/20",
                        cellHeatClass(cell),
                        isToday && "border-l-2 border-l-primary"
                      )}
                      style={{ width: colW }}
                    >
                      {cell.overbooked > 0 ? (
                        <span className="flex items-center justify-center gap-0.5">
                          <AlertTriangle className="h-2.5 w-2.5" />−{cell.overbooked}
                        </span>
                      ) : cell.sellable === 0 ? (
                        "–"
                      ) : (
                        cell.free
                      )}
                    </div>
                  </HoverCardTrigger>
                  <HoverCardContent align="center" className="w-72 p-3">
                    <p className="text-xs font-semibold">{row.roomType.name}</p>
                    {cell.overbooked > 0 && (
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] font-semibold text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        Overbooked — {cell.used} reservation{cell.used === 1 ? "" : "s"} for {cell.sellable} unit
                        {cell.sellable === 1 ? "" : "s"}
                      </p>
                    )}
                    <p className="text-[11px] text-muted-foreground">
                      {format(cell.date, "EEE d MMM yyyy")} · {cell.free} of {cell.sellable} free
                      {row.blocked > 0 && ` · ${row.blocked} blocked`}
                    </p>
                    {getSaHolidayName(cell.date) && (
                      <Badge variant="outline" className="mt-1 text-[10px]">{getSaHolidayName(cell.date)}</Badge>
                    )}
                    <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
                      {cell.bookings.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground">No reservations on this night.</p>
                      ) : (
                        cell.bookings.map((booking) => (
                          <button
                            key={booking.id}
                            type="button"
                            onClick={() => onSelectBooking(booking)}
                            className="w-full rounded-md border border-border px-2 py-1.5 text-left transition-colors hover:border-primary hover:bg-muted/50"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="truncate text-xs font-medium">{booking.guest_name}</span>
                              <Badge variant="secondary" className="shrink-0 text-[9px] capitalize">
                                {booking.status.replace(/_/g, " ")}
                              </Badge>
                            </div>
                            <p className="text-[10px] text-muted-foreground">
                              {format(parseISO(booking.check_in_date), "d MMM")} → {format(parseISO(booking.check_out_date), "d MMM")} ·{" "}
                              {stayNights(booking)} night{stayNights(booking) === 1 ? "" : "s"}
                            </p>
                            <p className="flex items-center gap-1 text-[10px] text-muted-foreground">
                              <Users className="h-3 w-3" />
                              {paxLabel(booking)}
                            </p>
                          </button>
                        ))
                      )}
                    </div>
                  </HoverCardContent>
                </HoverCard>
              );
            })}
          </div>

          {/* Physical room lines — status control + colour-coded night strip */}
          {expanded[row.roomType.id] &&
            buildUnitRows(dates, rooms.filter((r) => r.room_type_id === row.roomType.id), bookings, resolveStatus).map((unit) => {
              const meta = statusMeta(unit.displayStatus);
              return (
                <div key={unit.room.id} className="flex border-b border-border bg-muted/10 last:border-b-0">
                  <div className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 bg-card px-2 py-0.5" style={{ width: labelW }}>
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", meta.dot)} aria-hidden />
                    <span className="truncate text-[10px] font-medium" title={unit.room.room_name || unit.room.room_number}>
                      {unit.room.room_number}
                      {unit.room.room_name ? ` · ${unit.room.room_name}` : ""}
                    </span>
                    <div className="ml-auto flex shrink-0 items-center gap-1">
                      {unit.room.max_occupancy != null && (
                        <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                          <Users className="h-3 w-3" />
                          {unit.room.max_occupancy}
                        </span>
                      )}
                      {onStatusChange ? (
                        <Select value={unit.displayStatus} onValueChange={(v) => onStatusChange(unit.room.id, v)}>
                          <SelectTrigger
                            className={cn("h-5 w-[84px] border px-1 text-[10px] capitalize", meta.chip)}
                            aria-label={`Status for room ${unit.room.room_number}`}
                          >
                            {meta.label}
                          </SelectTrigger>
                          <SelectContent>
                            {SELECTABLE_ROOM_STATUSES.map((status) => (
                              <SelectItem key={status} value={status} className="text-xs">
                                <span className="flex items-center gap-2">
                                  <span className={cn("h-2 w-2 rounded-full", statusMeta(status).dot)} />
                                  {statusMeta(status).label}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      ) : (
                        <Badge variant="outline" className={cn("text-[10px]", meta.chip)}>{meta.label}</Badge>
                      )}
                      {onEditRoom && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => onEditRoom(unit.room)}
                          aria-label={`Edit room ${unit.room.room_number}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                  {unit.cells.map((cell) => {
                    const isToday = isSameDay(cell.date, today);
                    const state = cell.booking ? "occupied" : unit.displayStatus === "occupied" ? "available" : unit.displayStatus;
                    const cellMeta = statusMeta(state);
                    return (
                      <button
                        key={cell.date.toISOString()}
                        type="button"
                        disabled={!cell.booking}
                        onClick={() => cell.booking && onSelectBooking(cell.booking)}
                        title={
                          cell.booking
                            ? `${cell.booking.guest_name} · ${format(parseISO(cell.booking.check_in_date), "d MMM")} → ${format(parseISO(cell.booking.check_out_date), "d MMM")}`
                            : `${unit.room.room_number} · ${cellMeta.label} · ${format(cell.date, "EEE d MMM")}`
                        }
                        className={cn(
                          "h-5 shrink-0 truncate border-l border-border px-1 text-left text-[10px]",
                          isWeekendDay(cell.date) && !cell.booking && "bg-muted/20",
                          cellMeta.cell,
                          cell.booking && "font-medium hover:brightness-110",
                          isToday && "border-l-2 border-l-primary"
                        )}
                        style={{ width: colW }}
                      >
                        {cell.booking && cell.isStart ? cell.booking.guest_name : ""}
                      </button>
                    );
                  })}
                </div>
              );
            })}
        </div>
      ))}
    </>
  );
}
