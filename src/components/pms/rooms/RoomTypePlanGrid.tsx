import { useState } from "react";
import { format, isSameDay, parseISO } from "date-fns";
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, Users } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getSaHolidayName, isWeekendDay } from "@/lib/saPublicHolidays";
import {
  buildRoomTypePlan,
  cellHeatClass,
  groupIntoWeeks,
  paxLabel,
  stayNights,
  type PlanRoom,
  type PlanRoomType,
  type RoomsBooking,
} from "./roomTypePlanLayout";
import { buildUnitRows, SELECTABLE_ROOM_STATUSES, statusMeta } from "./roomUnitStatus";

const COL_W = 62;
const LABEL_W = 190;

interface Props {
  dates: Date[];
  roomTypes: PlanRoomType[];
  rooms: PlanRoom[];
  bookings: RoomsBooking[];
  onSelectBooking: (booking: RoomsBooking) => void;
  onShiftWindow?: (direction: -1 | 1) => void;
  onToday?: () => void;
  /** Header label, e.g. "August 2026 · Week 32". */
  title?: string;
  /** Resolves the status shown for a physical room (occupied overrides available). */
  displayStatusFor?: (room: PlanRoom) => string;
  /** Persists a housekeeping status change made inside a room line. */
  onStatusChange?: (roomId: string, status: string) => void;
  /** Opens the room edit dialog from a room line. */
  onEditRoom?: (room: PlanRoom) => void;
}

/**
 * Protel-style Room Type Plan: room types down, nights across, free units in each
 * cell with heat colouring, and a hover card listing the reservations on that night.
 * Each type expands into its physical room lines with inline status control and
 * colour-coded night strips (available / occupied / dirty / maintenance).
 */
export function RoomTypePlanGrid({
  dates,
  roomTypes,
  rooms,
  bookings,
  onSelectBooking,
  onShiftWindow,
  onToday,
  title,
  displayStatusFor,
  onStatusChange,
  onEditRoom,
}: Props) {
  const rows = buildRoomTypePlan(dates, roomTypes, rooms, bookings);
  const weeks = groupIntoWeeks(dates);
  const today = new Date();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const resolveStatus = displayStatusFor || ((room: PlanRoom) => room.status);
  const toggleType = (id: string) => setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));


  if (roomTypes.length === 0) {
    return (
      <div className="rounded-lg border border-border bg-muted/20 py-6 text-center text-sm text-muted-foreground">
        No room types configured yet — add them in Property Overview to see the plan.
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border overflow-hidden">
      <div className="flex items-center justify-between gap-2 bg-primary/10 px-3 py-1.5 border-b border-border">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">Room Type Plan</p>
          {title && <p className="text-[11px] text-muted-foreground truncate">{title}</p>}
        </div>
        {(onShiftWindow || onToday) && (
          <div className="flex items-center gap-1 shrink-0">
            {onShiftWindow && (
              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => onShiftWindow(-1)} aria-label="Previous nights">
                <ChevronLeft className="h-3 w-3" />
              </Button>
            )}
            {onToday && (
              <Button variant="outline" size="sm" className="h-6 px-2 text-[11px]" onClick={onToday}>
                Today
              </Button>
            )}
            {onShiftWindow && (
              <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => onShiftWindow(1)} aria-label="Next nights">
                <ChevronRight className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      <div className="overflow-x-auto">
        <div style={{ minWidth: LABEL_W + dates.length * COL_W }}>
          {/* Week band */}
          <div className="flex border-b border-border bg-muted/40">
            <div className="shrink-0 sticky left-0 z-20 bg-muted/40" style={{ width: LABEL_W }} />
            {weeks.map((week, idx) => (
              <div
                key={`${week.label}-${idx}`}
                className="text-[10px] font-medium text-muted-foreground text-center border-l border-border py-0.5"
                style={{ width: week.span * COL_W }}
              >
                {week.label}
              </div>
            ))}
          </div>

          {/* Date header */}
          <div className="flex border-b border-border bg-card">
            <div
              className="shrink-0 sticky left-0 z-20 bg-card px-2 py-1 text-[11px] font-semibold text-muted-foreground flex items-center justify-between"
              style={{ width: LABEL_W }}
            >
              <span>Room type</span>
              <span className="text-[10px] font-normal">Units</span>
            </div>
            {dates.map((date) => {
              const holiday = getSaHolidayName(date);
              const isToday = isSameDay(date, today);
              return (
                <div
                  key={date.toISOString()}
                  title={holiday || undefined}
                  className={cn(
                    "shrink-0 border-l border-border text-center py-0.5",
                    isWeekendDay(date) && "bg-muted/40",
                    holiday && "bg-primary/10",
                    isToday && "border-l-2 border-l-primary"
                  )}
                  style={{ width: COL_W }}
                >
                  <p className="text-[10px] text-muted-foreground leading-tight">{format(date, "EEE")}</p>
                  <p className={cn("text-[11px] font-semibold leading-tight tabular-nums", isToday && "text-primary")}>
                    {format(date, "dd.MM")}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Rows */}
          {rows.map((row) => (
            <div key={row.roomType.id} className="flex border-b border-border last:border-b-0 hover:bg-muted/20">
              <div
                className="shrink-0 sticky left-0 z-10 bg-card px-2 py-1 flex items-center justify-between gap-2"
                style={{ width: LABEL_W }}
              >
                <span className="text-xs font-medium truncate" title={row.roomType.name}>{row.roomType.name}</span>
                <span className="text-xs font-semibold tabular-nums text-muted-foreground shrink-0">
                  {row.units}
                  {row.blocked > 0 && <span className="text-destructive"> −{row.blocked}</span>}
                </span>
              </div>
              {row.cells.map((cell) => {
                const isToday = isSameDay(cell.date, today);
                return (
                  <HoverCard key={cell.date.toISOString()} openDelay={80} closeDelay={60}>
                    <HoverCardTrigger asChild>
                      <div
                        className={cn(
                          "shrink-0 border-l border-border text-center text-xs tabular-nums py-1 cursor-default",
                          isWeekendDay(cell.date) && "bg-muted/20",
                          cellHeatClass(cell),
                          isToday && "border-l-2 border-l-primary"
                        )}
                        style={{ width: COL_W }}
                      >
                        {cell.sellable === 0 ? "–" : cell.free}
                      </div>
                    </HoverCardTrigger>
                    <HoverCardContent align="center" className="w-72 p-3">
                      <p className="text-xs font-semibold">{row.roomType.name}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {format(cell.date, "EEE d MMM yyyy")} · {cell.free} of {cell.sellable} free
                        {row.blocked > 0 && ` · ${row.blocked} blocked`}
                      </p>
                      {getSaHolidayName(cell.date) && (
                        <Badge variant="outline" className="mt-1 text-[10px]">{getSaHolidayName(cell.date)}</Badge>
                      )}
                      <div className="mt-2 space-y-1.5 max-h-56 overflow-y-auto">
                        {cell.bookings.length === 0 ? (
                          <p className="text-[11px] text-muted-foreground">No reservations on this night.</p>
                        ) : (
                          cell.bookings.map((booking) => (
                            <button
                              key={booking.id}
                              type="button"
                              onClick={() => onSelectBooking(booking)}
                              className="w-full rounded-md border border-border px-2 py-1.5 text-left hover:border-primary hover:bg-muted/50 transition-colors"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-xs font-medium truncate">{booking.guest_name}</span>
                                <Badge variant="secondary" className="text-[9px] capitalize shrink-0">
                                  {booking.status.replace(/_/g, " ")}
                                </Badge>
                              </div>
                              <p className="text-[10px] text-muted-foreground">
                                {format(parseISO(booking.check_in_date), "d MMM")} → {format(parseISO(booking.check_out_date), "d MMM")} ·{" "}
                                {stayNights(booking)} night{stayNights(booking) === 1 ? "" : "s"}
                              </p>
                              <p className="text-[10px] text-muted-foreground flex items-center gap-1">
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
                      <div
                        className="shrink-0 sticky left-0 z-10 bg-card px-2 py-1 flex items-center gap-1.5"
                        style={{ width: LABEL_W }}
                      >
                        <span className={cn("h-2.5 w-2.5 rounded-full shrink-0", meta.dot)} aria-hidden />
                        <span className="text-[11px] font-medium truncate" title={unit.room.room_name || unit.room.room_number}>
                          {unit.room.room_number}
                          {unit.room.room_name ? ` · ${unit.room.room_name}` : ""}
                        </span>
                        <div className="ml-auto flex items-center gap-1 shrink-0">
                          {unit.room.max_occupancy != null && (
                            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                              <Users className="h-3 w-3" />
                              {unit.room.max_occupancy}
                            </span>
                          )}
                          {onStatusChange ? (
                            <Select value={unit.displayStatus} onValueChange={(v) => onStatusChange(unit.room.id, v)}>
                              <SelectTrigger
                                className={cn("h-6 w-[104px] px-1.5 text-[10px] capitalize border", meta.chip)}
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
                              className="h-6 w-6"
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
                              "shrink-0 border-l border-border h-6 text-[10px] truncate px-1 text-left",
                              isWeekendDay(cell.date) && !cell.booking && "bg-muted/20",
                              cellMeta.cell,
                              cell.booking && "font-medium hover:brightness-110",
                              isToday && "border-l-2 border-l-primary"
                            )}
                            style={{ width: COL_W }}
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
        </div>
      </div>

      {/* Colour legend */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border bg-muted/20 px-3 py-1.5">
        {SELECTABLE_ROOM_STATUSES.map((status) => (
          <span key={status} className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className={cn("h-2 w-2 rounded-full", statusMeta(status).dot)} />
            {statusMeta(status).label}
          </span>
        ))}
        <span className="text-[10px] text-muted-foreground ml-auto">Click a room type to open its room lines</span>
      </div>
    </div>

  );
}
