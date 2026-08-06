import { useCallback, useMemo, useState } from "react";
import { addDays, format, isSameDay, isWeekend, parseISO } from "date-fns";
import { BedDouble, Loader2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { RoomPlanBar, RoomPlanBooking } from "./RoomPlanBar";
import {
  ROOM_PLAN_COL_W,
  ROOM_PLAN_COL_W_COMPACT,
  ROOM_PLAN_LABEL_W,
  ROOM_PLAN_ROW_H,
  assignLanes,
  bookingNights,
  getBarGeometry,
} from "./roomPlanLayout";
import { RoomPlanMoveDrag, useRoomPlanDrag } from "./useRoomPlanDrag";

interface RoomPlanRoomType {
  id: string;
  name: string;
  linked_overview_id?: string | null;
}

interface RoomPlanRoom {
  id: string;
  room_number: string;
  room_name: string | null;
  room_type_id: string | null;
  status: string;
}

export interface RoomPlanMovePayload {
  booking: RoomPlanBooking;
  roomId: string | null;
  checkIn: string;
  checkOut: string;
  datesChanged: boolean;
}

export interface RoomPlanCreatePayload {
  roomTypeId: string;
  roomId: string | null;
  checkIn: Date;
  checkOut: Date;
}

interface RoomPlanGridProps {
  dates: Date[];
  roomTypes: RoomPlanRoomType[];
  roomsByType: Map<string, RoomPlanRoom[]>;
  bookings: RoomPlanBooking[];
  propertyName?: string | null;
  bookingsLoading?: boolean;
  compact?: boolean;
  /** Disable both drag interactions (touch / read-only contexts). */
  dragDisabled?: boolean;
  getRateForDate?: (roomTypeId: string, date: Date) => number | null;
  isHoliday?: (date: Date) => string | null;
  onSelectBooking: (booking: RoomPlanBooking) => void;
  onQuickAction?: (booking: RoomPlanBooking, action: "check_in" | "check_out") => void;
  onModifyBooking?: (booking: RoomPlanBooking) => void;
  onCancelBooking?: (booking: RoomPlanBooking) => void;
  onCreateBooking?: (payload: RoomPlanCreatePayload) => void;
  onMoveBooking?: (payload: RoomPlanMovePayload) => Promise<void> | void;
}

interface PlanRow {
  key: string;
  roomId: string | null;
  roomTypeId: string;
  label: string;
  sublabel?: string;
  bookings: RoomPlanBooking[];
}

const bookingBelongsToType = (booking: RoomPlanBooking, type: RoomPlanRoomType, typeRooms: RoomPlanRoom[]) => {
  if (booking.room_type_id && (booking.room_type_id === type.id || booking.room_type_id === type.linked_overview_id)) return true;
  return !!booking.rolos_room_ids?.some((roomId) => typeRooms.some((room) => room.id === roomId));
};

const shiftDate = (value: string, days: number) => format(addDays(parseISO(value), days), "yyyy-MM-dd");

const overlaps = (aIn: string, aOut: string, bIn: string, bOut: string) => aIn < bOut && bIn < aOut;

export function RoomPlanGrid({
  dates,
  roomTypes,
  roomsByType,
  bookings,
  propertyName,
  bookingsLoading,
  compact,
  dragDisabled,
  getRateForDate,
  isHoliday,
  onSelectBooking,
  onQuickAction,
  onModifyBooking,
  onCancelBooking,
  onCreateBooking,
  onMoveBooking,
}: RoomPlanGridProps) {
  const colWidth = compact ? ROOM_PLAN_COL_W_COMPACT : ROOM_PLAN_COL_W;
  const [pendingMove, setPendingMove] = useState<(RoomPlanMovePayload & { fromLabel: string; toLabel: string }) | null>(null);
  const [saving, setSaving] = useState(false);

  // Rows, grouped per room type: an "Unassigned" row plus one row per unit.
  const groups = useMemo(() => {
    return roomTypes.map((type) => {
      const typeRooms = (roomsByType.get(type.id) || []).filter((room) => room.status !== "out_of_service");
      const typeBookings = bookings.filter((booking) => bookingBelongsToType(booking, type, typeRooms));
      const rows: PlanRow[] = [];

      const assignedIds = new Set<string>();
      for (const room of typeRooms) {
        const roomBookings = typeBookings.filter((booking) => booking.rolos_room_ids?.includes(room.id));
        roomBookings.forEach((booking) => assignedIds.add(booking.id));
        rows.push({
          key: `${type.id}:${room.id}`,
          roomId: room.id,
          roomTypeId: type.id,
          label: room.room_name || room.room_number,
          sublabel: room.room_name ? room.room_number : undefined,
          bookings: roomBookings,
        });
      }

      const unassigned = typeBookings.filter((booking) => !assignedIds.has(booking.id));
      if (unassigned.length > 0 || typeRooms.length === 0) {
        rows.unshift({
          key: `${type.id}:unassigned`,
          roomId: null,
          roomTypeId: type.id,
          label: typeRooms.length === 0 ? type.name : "Unassigned",
          bookings: unassigned,
        });
      }

      return { type, rows, bookingCount: typeBookings.length, unitCount: typeRooms.length };
    });
  }, [roomTypes, roomsByType, bookings]);

  const rowByKey = useMemo(() => {
    const map = new Map<string, PlanRow>();
    groups.forEach((group) => group.rows.forEach((row) => map.set(row.key, row)));
    return map;
  }, [groups]);

  const bookingById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  const validateMove = useCallback(
    (drag: Omit<RoomPlanMoveDrag, "valid">) => {
      if (drag.target.roomTypeId !== drag.roomTypeId) return false;
      const booking = bookingById.get(drag.bookingId);
      if (!booking) return false;
      const nextIn = shiftDate(booking.check_in_date, drag.deltaCols);
      const nextOut = shiftDate(booking.check_out_date, drag.deltaCols);
      const targetRow = rowByKey.get(drag.target.rowKey);
      if (!targetRow) return false;
      return !targetRow.bookings.some(
        (other) =>
          other.id !== booking.id &&
          !["cancelled", "no_show"].includes(other.status) &&
          overlaps(nextIn, nextOut, other.check_in_date, other.check_out_date)
      );
    },
    [bookingById, rowByKey]
  );

  const handleCreateCommit = useCallback(
    (drag: { roomTypeId: string; roomId: string | null; startCol: number; endCol: number }) => {
      if (!onCreateBooking) return;
      const from = Math.min(drag.startCol, drag.endCol);
      const to = Math.max(drag.startCol, drag.endCol);
      const checkIn = dates[from];
      const lastNight = dates[to];
      if (!checkIn || !lastNight) return;
      onCreateBooking({
        roomTypeId: drag.roomTypeId,
        roomId: drag.roomId,
        checkIn,
        checkOut: addDays(lastNight, 1),
      });
    },
    [dates, onCreateBooking]
  );

  const handleMoveCommit = useCallback(
    (drag: RoomPlanMoveDrag) => {
      const booking = bookingById.get(drag.bookingId);
      if (!booking || !onMoveBooking) return;
      const originRow = rowByKey.get(drag.originRowKey);
      const targetRow = rowByKey.get(drag.target.rowKey);
      const checkIn = shiftDate(booking.check_in_date, drag.deltaCols);
      const checkOut = shiftDate(booking.check_out_date, drag.deltaCols);
      setPendingMove({
        booking,
        roomId: drag.target.roomId,
        checkIn,
        checkOut,
        datesChanged: drag.deltaCols !== 0,
        fromLabel: originRow?.label || "Unassigned",
        toLabel: targetRow?.label || "Unassigned",
      });
    },
    [bookingById, onMoveBooking, rowByKey]
  );

  const { drag, bodyRef, beginCreate, beginMove } = useRoomPlanDrag({
    colWidth,
    colCount: dates.length,
    enabled: !dragDisabled,
    validateMove,
    onCreateCommit: handleCreateCommit,
    onMoveCommit: handleMoveCommit,
  });

  const confirmMove = async () => {
    if (!pendingMove || !onMoveBooking) return;
    setSaving(true);
    try {
      const { fromLabel: _from, toLabel: _to, ...payload } = pendingMove;
      await onMoveBooking(payload);
      setPendingMove(null);
    } finally {
      setSaving(false);
    }
  };

  const todayIndex = dates.findIndex((date) => isSameDay(date, new Date()));
  const gridWidth = dates.length * colWidth;

  if (dates.length === 0 || roomTypes.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border bg-muted/20 py-10 text-sm text-muted-foreground">
        Nothing to show for this period.
      </div>
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border">
        <div ref={bodyRef} className="overflow-x-auto">
          <div style={{ width: ROOM_PLAN_LABEL_W + gridWidth, minWidth: "100%" }}>
            {/* Date header */}
            <div className="sticky top-0 z-30 flex border-b bg-background">
              <div
                className="sticky left-0 z-40 shrink-0 border-r bg-background px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground"
                style={{ width: ROOM_PLAN_LABEL_W }}
              >
                Unit
              </div>
              {dates.map((date, index) => {
                const holiday = isHoliday?.(date) || null;
                return (
                  <div
                    key={date.toISOString()}
                    className={cn(
                      "shrink-0 border-r py-0.5 text-center last:border-r-0",
                      isWeekend(date) && "bg-muted/40",
                      holiday && "bg-amber-500/15",
                      index === todayIndex && "bg-primary/15"
                    )}
                    style={{ width: colWidth }}
                    title={holiday || undefined}
                  >
                    <div className="text-[9px] uppercase text-muted-foreground">{format(date, "EEEEE")}</div>
                    <div className="text-[11px] font-semibold tabular-nums leading-none">{format(date, "d")}</div>
                  </div>
                );
              })}
            </div>

            {/* Room type groups */}
            {bookingsLoading && bookings.length === 0 ? (
              <div className="space-y-1 p-2">
                {[0, 1, 2, 3, 4].map((i) => (
                  <Skeleton key={i} className="h-[22px] w-full" />
                ))}
              </div>
            ) : (
              groups.map((group) => (
                <div key={group.type.id}>
                  {/* Type header */}
                  <div className="flex border-b bg-muted/60">
                    <div
                      className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r bg-muted/60 px-2"
                      style={{ width: ROOM_PLAN_LABEL_W, height: 22 }}
                    >
                      <BedDouble className="h-3 w-3 shrink-0 text-primary" />
                      <span className="truncate text-[11px] font-semibold">{group.type.name}</span>
                      <span className="ml-auto shrink-0 text-[9px] text-muted-foreground">
                        {group.unitCount || 1}u · {group.bookingCount}
                      </span>
                    </div>
                    {dates.map((date) => {
                      const rate = getRateForDate?.(group.type.id, date) ?? null;
                      return (
                        <div
                          key={date.toISOString()}
                          className={cn(
                            "shrink-0 border-r text-center text-[9px] leading-[22px] text-muted-foreground last:border-r-0",
                            isWeekend(date) && "bg-muted/40"
                          )}
                          style={{ width: colWidth, height: 22 }}
                        >
                          {rate ? Math.round(rate).toLocaleString() : ""}
                        </div>
                      );
                    })}
                  </div>

                  {/* Unit rows */}
                  {group.rows.map((row) => {
                    const placed = assignLanes(row.bookings, dates);
                    const lanes = Math.max(1, ...placed.map((entry) => entry.lane + 1));
                    const rowHeight = lanes * (ROOM_PLAN_ROW_H - 4) + 6;
                    const createDrag = drag?.kind === "create" && drag.rowKey === row.key ? drag : null;
                    const moveDrag = drag?.kind === "move" ? drag : null;
                    const ghostOnRow = moveDrag && moveDrag.target.rowKey === row.key ? moveDrag : null;
                    const ghostBooking = ghostOnRow ? bookingById.get(ghostOnRow.bookingId) : null;
                    const ghostGeometry = ghostBooking ? getBarGeometry(ghostBooking, dates) : null;

                    return (
                      <div
                        key={row.key}
                        data-row-key={row.key}
                        data-room-id={row.roomId || ""}
                        data-room-type-id={row.roomTypeId}
                        className="relative flex border-b last:border-b-0 hover:bg-muted/20"
                        style={{ height: rowHeight }}
                      >
                        <div
                          className="sticky left-0 z-20 flex shrink-0 items-center gap-1 border-r bg-background px-2"
                          style={{ width: ROOM_PLAN_LABEL_W }}
                        >
                          <span className={cn("truncate text-[11px]", !row.roomId && "italic text-muted-foreground")}>
                            {row.label}
                          </span>
                          {row.sublabel && <span className="shrink-0 text-[9px] text-muted-foreground">{row.sublabel}</span>}
                        </div>

                        {/* Day cells (drag surface) */}
                        <div
                          className="relative flex"
                          style={{ width: gridWidth }}
                          onPointerDown={(event) => {
                            if (dragDisabled || !onCreateBooking) return;
                            if ((event.target as HTMLElement).closest("[data-booking-bar]")) return;
                            beginCreate({ rowKey: row.key, roomId: row.roomId, roomTypeId: row.roomTypeId }, event.clientX);
                          }}
                        >
                          {dates.map((date, index) => (
                            <div
                              key={date.toISOString()}
                              className={cn(
                                "shrink-0 border-r last:border-r-0",
                                isWeekend(date) && "bg-muted/30",
                                index === todayIndex && "bg-primary/10"
                              )}
                              style={{ width: colWidth }}
                            />
                          ))}

                          {/* Create-drag selection */}
                          {createDrag && (
                            <div
                              className="pointer-events-none absolute top-1 rounded-md border-2 border-dashed border-primary bg-primary/15"
                              style={{
                                left: Math.min(createDrag.startCol, createDrag.endCol) * colWidth + 2,
                                width: (Math.abs(createDrag.endCol - createDrag.startCol) + 1) * colWidth - 4,
                                height: ROOM_PLAN_ROW_H - 8,
                              }}
                            />
                          )}

                          {/* Move ghost */}
                          {ghostOnRow && ghostGeometry && (
                            <div
                              className={cn(
                                "pointer-events-none absolute top-1 rounded-full border-2 border-dashed",
                                ghostOnRow.valid ? "border-primary bg-primary/20" : "border-destructive bg-destructive/20"
                              )}
                              style={{
                                left: (ghostGeometry.startCol + ghostOnRow.deltaCols) * colWidth + colWidth * 0.28,
                                width: ghostGeometry.cols * colWidth - colWidth * 0.56,
                                height: ROOM_PLAN_ROW_H - 8,
                              }}
                            />
                          )}

                          {placed.map(({ booking, lane, geometry }) => (
                            <RoomPlanBar
                              key={booking.id}
                              booking={booking}
                              geometry={geometry}
                              colWidth={colWidth}
                              lane={lane}
                              roomLabel={row.roomId ? row.label : "No unit assigned"}
                              propertyName={propertyName}
                              dragging={moveDrag?.bookingId === booking.id}
                              onOpen={onSelectBooking}
                              onQuickAction={onQuickAction}
                              onModify={onModifyBooking}
                              onCancel={onCancelBooking}
                              onDragStart={
                                dragDisabled || !onMoveBooking
                                  ? undefined
                                  : (target, event) =>
                                      beginMove(
                                        {
                                          bookingId: target.id,
                                          roomTypeId: row.roomTypeId,
                                          originRowKey: row.key,
                                          originRoomId: row.roomId,
                                          startCol: geometry.startCol,
                                          cols: geometry.cols,
                                        },
                                        event.clientX
                                      )
                              }
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <AlertDialog open={!!pendingMove} onOpenChange={(open) => !open && !saving && setPendingMove(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Move this reservation?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1 text-sm">
                <p className="font-medium text-foreground">{pendingMove?.booking.guest_name}</p>
                {pendingMove && pendingMove.fromLabel !== pendingMove.toLabel && (
                  <p>
                    Unit: {pendingMove.fromLabel} → {pendingMove.toLabel}
                  </p>
                )}
                {pendingMove?.datesChanged && (
                  <p>
                    Dates: {format(parseISO(pendingMove.booking.check_in_date), "d MMM")} –{" "}
                    {format(parseISO(pendingMove.booking.check_out_date), "d MMM")} →{" "}
                    {format(parseISO(pendingMove.checkIn), "d MMM")} – {format(parseISO(pendingMove.checkOut), "d MMM")}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {pendingMove ? bookingNights(pendingMove.booking) : 0} nights stay length is unchanged.
                  {pendingMove?.datesChanged ? " Availability and any channel push are updated." : ""}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Keep as is</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                void confirmMove();
              }}
              disabled={saving}
            >
              {saving && <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" />}
              Move reservation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
