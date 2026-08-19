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
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { formatBlockedTooltip, type BlockDetail } from "@/lib/blockAttribution";
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
import { RoomPlanMoveDrag, RoomPlanMoveVerdict, useRoomPlanDrag } from "./useRoomPlanDrag";

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
  /** Room type of the target unit — differs from the booking's when moved across types. */
  roomTypeId: string;
  roomTypeChanged: boolean;
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

/** A group room block still holding inventory for a room type / date range. */
export interface RoomPlanGroupBlock {
  id: string;
  group_name: string | null;
  room_type_id: string;
  start_date: string;
  end_date: string;
  blocked_count: number;
  picked_up_count: number;
}

interface RoomPlanGridProps {
  dates: Date[];
  roomTypes: RoomPlanRoomType[];
  roomsByType: Map<string, RoomPlanRoom[]>;
  bookings: RoomPlanBooking[];
  /** Held (not yet picked up) group inventory, drawn as hatching on the type header. */
  groupBlocks?: RoomPlanGroupBlock[];
  propertyName?: string | null;
  bookingsLoading?: boolean;
  compact?: boolean;
  /** Disable both drag interactions (touch / read-only contexts). */
  dragDisabled?: boolean;
  getRateForDate?: (roomTypeId: string, date: Date) => number | null;
  /**
   * Stop-sell / blocked nights per room type — hatched and refused for new stays.
   * May return attribution details (who blocked it) for the tooltip; any truthy
   * value means "blocked".
   */
  isBlocked?: (roomTypeId: string, date: Date) => BlockDetail | boolean | null;
  isHoliday?: (date: Date) => string | null;
  /** Right-click / long-press on a blocked night — opens the restriction editor. */
  onEditBlock?: (roomTypeId: string, date: Date) => void;
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
  hideLabel?: boolean;
  bookings: RoomPlanBooking[];
}

const bookingBelongsToType = (
  booking: RoomPlanBooking,
  type: RoomPlanRoomType,
  typeRooms: RoomPlanRoom[],
  placedRoomIds?: Set<string>
) => {
  const assigned = booking.rolos_room_ids || [];
  // Once a stay sits in known units, those units are the only place it may draw.
  // A stale room_type_id must not paint a second bar under another type — that
  // reads as a cloned reservation after a drag between units.
  if (placedRoomIds && assigned.some((roomId) => placedRoomIds.has(roomId))) {
    return assigned.some((roomId) => typeRooms.some((room) => room.id === roomId));
  }
  if (booking.room_type_id && (booking.room_type_id === type.id || booking.room_type_id === type.linked_overview_id)) return true;
  // Multi-room stays carry one line per unit; each line's room type gets a bar.
  if (booking.line_room_type_ids?.some((id) => id === type.id || id === type.linked_overview_id)) return true;
  return !!assigned.some((roomId) => typeRooms.some((room) => room.id === roomId));
};


const shiftDate = (value: string, days: number) => format(addDays(parseISO(value), days), "yyyy-MM-dd");

const overlaps = (aIn: string, aOut: string, bIn: string, bOut: string) => aIn < bOut && bIn < aOut;

export function RoomPlanGrid({
  dates,
  roomTypes,
  roomsByType,
  bookings,
  groupBlocks,
  propertyName,
  bookingsLoading,
  compact,
  dragDisabled,
  getRateForDate,
  isBlocked,
  onEditBlock,
  isHoliday,
  onSelectBooking,
  onQuickAction,
  onModifyBooking,
  onCancelBooking,
  onCreateBooking,
  onMoveBooking,
}: RoomPlanGridProps) {
  const colWidth = compact ? ROOM_PLAN_COL_W_COMPACT : ROOM_PLAN_COL_W;
  const [pendingMove, setPendingMove] = useState<
    | (RoomPlanMovePayload & { fromLabel: string; toLabel: string; fromTypeLabel: string; toTypeLabel: string })
    | null
  >(null);

  const [saving, setSaving] = useState(false);

  /** Rooms still held (blocked minus picked up) for this type on this night. */
  const heldOn = useCallback(
    (type: RoomPlanRoomType, date: Date): { rooms: number; labels: string } | null => {
      if (!groupBlocks?.length) return null;
      const day = format(date, "yyyy-MM-dd");
      let rooms = 0;
      const names: string[] = [];
      for (const block of groupBlocks) {
        if (block.room_type_id !== type.id && block.room_type_id !== type.linked_overview_id) continue;
        if (day < block.start_date || day >= block.end_date) continue;
        const remaining = Math.max(0, (block.blocked_count || 0) - (block.picked_up_count || 0));
        if (remaining <= 0) continue;
        rooms += remaining;
        names.push(block.group_name || "Group");
      }
      return rooms > 0 ? { rooms, labels: [...new Set(names)].join(", ") } : null;
    },
    [groupBlocks]
  );

  /** First blocked night in a stay window (check-out night excluded), if any. */
  const firstBlockedNight = useCallback(
    (roomTypeId: string, checkIn: string, checkOut: string): Date | null => {
      if (!isBlocked) return null;
      let cursor = parseISO(checkIn);
      const end = parseISO(checkOut);
      while (cursor < end) {
        if (isBlocked(roomTypeId, cursor)) return cursor;
        cursor = addDays(cursor, 1);
      }
      return null;
    },
    [isBlocked]
  );


  // Every unit currently on screen — used to keep a placed stay on its own unit only.
  const placedRoomIds = useMemo(() => {
    const ids = new Set<string>();
    roomTypes.forEach((type) =>
      (roomsByType.get(type.id) || []).forEach((room) => {
        if (room.status !== "out_of_service") ids.add(room.id);
      })
    );
    return ids;
  }, [roomTypes, roomsByType]);

  // Rows, grouped per room type: an "Unassigned" row plus one row per unit.
  const groups = useMemo(() => {
    return roomTypes.map((type) => {
      const typeRooms = (roomsByType.get(type.id) || []).filter((room) => room.status !== "out_of_service");
      const typeBookings = bookings.filter((booking) => bookingBelongsToType(booking, type, typeRooms, placedRoomIds));
      const rows: PlanRow[] = [];

      const assignedIds = new Set<string>();
      const norm = (value: string | null | undefined) => (value || "").trim().toLowerCase();
      const typeName = norm(type.name);
      for (const room of typeRooms) {
        const roomBookings = typeBookings.filter((booking) => booking.rolos_room_ids?.includes(room.id));
        roomBookings.forEach((booking) => assignedIds.add(booking.id));
        const name = room.room_name || room.room_number;
        // Don't repeat the room number when it duplicates the room name.
        const sublabel =
          room.room_name && norm(room.room_number) !== norm(room.room_name) ? room.room_number : undefined;
        // A single unit that carries the room type's own name adds no
        // information beyond the group header — render it unlabelled.
        const redundant = typeRooms.length === 1 && norm(name) === typeName && !sublabel;
        rows.push({
          key: `${type.id}:${room.id}`,
          roomId: room.id,
          roomTypeId: type.id,
          label: name,
          sublabel,
          hideLabel: redundant,
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
  }, [roomTypes, roomsByType, bookings, placedRoomIds]);

  const rowByKey = useMemo(() => {
    const map = new Map<string, PlanRow>();
    groups.forEach((group) => group.rows.forEach((row) => map.set(row.key, row)));
    return map;
  }, [groups]);

  const bookingById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings]);

  const typeNameById = useMemo(() => new Map(roomTypes.map((type) => [type.id, type.name])), [roomTypes]);

  const validateMove = useCallback(
    (drag: Omit<RoomPlanMoveDrag, "valid" | "reason">): RoomPlanMoveVerdict => {
      const booking = bookingById.get(drag.bookingId);
      if (!booking) return { valid: false, reason: "This reservation is no longer on the plan." };
      const nextIn = shiftDate(booking.check_in_date, drag.deltaCols);
      const nextOut = shiftDate(booking.check_out_date, drag.deltaCols);
      const targetRow = rowByKey.get(drag.target.rowKey);
      if (!targetRow) return { valid: false, reason: "Drop the reservation on a unit row." };
      // A move across room types is allowed — the unit, not the type, holds the
      // stay — so only real occupancy blocks the drop.
      const clash = targetRow.bookings.find(
        (other) =>
          other.id !== booking.id &&
          !["cancelled", "no_show"].includes(other.status) &&
          overlaps(nextIn, nextOut, other.check_in_date, other.check_out_date)
      );
      if (clash) {
        return {
          valid: false,
          reason: `${targetRow.label} is already taken by ${clash.guest_name} (${format(
            parseISO(clash.check_in_date),
            "d MMM"
          )} – ${format(parseISO(clash.check_out_date), "d MMM")}).`,
        };
      }
      const blocked = firstBlockedNight(targetRow.roomTypeId, nextIn, nextOut);
      if (blocked) {
        return {
          valid: false,
          reason: `${typeNameById.get(targetRow.roomTypeId) || targetRow.label} is blocked on ${format(
            blocked,
            "d MMM"
          )} — unblock those dates first.`,
        };
      }
      return { valid: true };
    },
    [bookingById, rowByKey, firstBlockedNight, typeNameById]

  );

  const handleMoveRejected = useCallback((drag: RoomPlanMoveDrag) => {
    toast({
      title: "Reservation not moved",
      description: drag.reason || "That unit cannot take this stay.",
      variant: "destructive",
    });
  }, []);


  const handleCreateCommit = useCallback(
    (drag: { roomTypeId: string; roomId: string | null; startCol: number; endCol: number }) => {
      if (!onCreateBooking) return;
      const from = Math.min(drag.startCol, drag.endCol);
      const to = Math.max(drag.startCol, drag.endCol);
      const checkIn = dates[from];
      const lastNight = dates[to];
      if (!checkIn || !lastNight) return;
      const checkOut = addDays(lastNight, 1);
      const blocked = firstBlockedNight(
        drag.roomTypeId,
        format(checkIn, "yyyy-MM-dd"),
        format(checkOut, "yyyy-MM-dd")
      );
      if (blocked) {
        toast({
          title: "Dates blocked",
          description: `${typeNameById.get(drag.roomTypeId) || "This room"} is blocked on ${format(
            blocked,
            "d MMM"
          )} — unblock those dates first.`,
          variant: "destructive",
        });
        return;
      }
      onCreateBooking({
        roomTypeId: drag.roomTypeId,
        roomId: drag.roomId,
        checkIn,
        checkOut,
      });
    },
    [dates, onCreateBooking, firstBlockedNight, typeNameById]

  );

  const handleMoveCommit = useCallback(
    (drag: RoomPlanMoveDrag) => {
      const booking = bookingById.get(drag.bookingId);
      if (!booking || !onMoveBooking) return;
      const originRow = rowByKey.get(drag.originRowKey);
      const targetRow = rowByKey.get(drag.target.rowKey);
      const checkIn = shiftDate(booking.check_in_date, drag.deltaCols);
      const checkOut = shiftDate(booking.check_out_date, drag.deltaCols);
      const targetTypeId = targetRow?.roomTypeId || drag.target.roomTypeId;
      const roomTypeChanged = targetTypeId !== drag.roomTypeId;
      setPendingMove({
        booking,
        roomId: drag.target.roomId,
        roomTypeId: targetTypeId,
        roomTypeChanged,
        checkIn,
        checkOut,
        datesChanged: drag.deltaCols !== 0,
        fromLabel: originRow?.label || "Unassigned",
        toLabel: targetRow?.label || "Unassigned",
        fromTypeLabel: typeNameById.get(drag.roomTypeId) || "",
        toTypeLabel: typeNameById.get(targetTypeId) || "",
      });
    },
    [bookingById, onMoveBooking, rowByKey, typeNameById]
  );

  const { drag, bodyRef, beginCreate, beginMove, consumeGestureDrag } = useRoomPlanDrag({
    colWidth,
    colCount: dates.length,
    labelWidth: ROOM_PLAN_LABEL_W,
    enabled: !dragDisabled,
    validateMove,
    onCreateCommit: handleCreateCommit,
    onMoveCommit: handleMoveCommit,
    onMoveRejected: handleMoveRejected,
  });


  // While a move is awaiting confirmation the dialog must stay the top surface,
  // so booking-sheet opens are ignored until it is resolved.
  const openBooking = useCallback(
    (booking: RoomPlanBooking) => {
      if (pendingMove) return;
      onSelectBooking(booking);
    },
    [onSelectBooking, pendingMove]
  );

  // Re-typing a stay can change what it should be charged — say so before saving.
  const moveRateNote = useMemo(() => {
    if (!pendingMove?.roomTypeChanged || !getRateForDate) return null;
    const night = parseISO(pendingMove.checkIn);
    const fromRate = getRateForDate(pendingMove.booking.room_type_id || "", night);
    const toRate = getRateForDate(pendingMove.roomTypeId, night);
    if (fromRate == null || toRate == null) return "Check the rate for the new room type — it may differ.";
    const delta = Math.round(toRate - fromRate);
    if (delta === 0) return null;
    return `${pendingMove.toTypeLabel || "The new room type"} is ${
      delta > 0 ? "dearer" : "cheaper"
    } by ${Math.abs(delta).toLocaleString()} per night — the reservation total is not adjusted automatically.`;
  }, [pendingMove, getRateForDate]);

  const confirmMove = async () => {

    if (!pendingMove || !onMoveBooking) return;
    setSaving(true);
    try {
      const { fromLabel: _from, toLabel: _to, fromTypeLabel: _ft, toTypeLabel: _tt, ...payload } = pendingMove;
      await onMoveBooking(payload);
      setPendingMove(null);
    } catch (error) {
      // Keep the dialog open so the move can be retried or abandoned deliberately.
      toast({
        title: "Move failed",
        description: error instanceof Error ? error.message : "The reservation could not be moved.",
        variant: "destructive",
      });
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
                      const held = heldOn(group.type, date);
                      const block = isBlocked?.(group.type.id, date) ?? null;
                      const blocked = !!block;
                      const blockDetail = typeof block === "object" ? block : null;
                      return (
                        <div
                          key={date.toISOString()}
                          onContextMenu={(event) => {
                            if (!blocked || !onEditBlock) return;
                            event.preventDefault();
                            onEditBlock(group.type.id, date);
                          }}
                          title={
                            blocked
                              ? `${group.type.name}\n${formatBlockedTooltip(date, blockDetail)}\nRight-click to edit`
                              : held
                                ? `${held.rooms} room${held.rooms === 1 ? "" : "s"} held — ${held.labels}`
                                : undefined
                          }
                          className={cn(
                            "relative shrink-0 border-r text-center text-[9px] leading-[22px] text-muted-foreground last:border-r-0",
                            isWeekend(date) && "bg-muted/40",
                            held && "text-foreground/80",
                            blocked && "text-destructive"
                          )}
                          style={{
                            width: colWidth,
                            height: 22,
                            ...(blocked
                              ? {
                                  backgroundImage:
                                    "repeating-linear-gradient(45deg, hsl(var(--destructive) / 0.3) 0 3px, transparent 3px 6px)",
                                }
                              : held
                                ? {
                                    backgroundImage:
                                      "repeating-linear-gradient(45deg, hsl(var(--warning) / 0.28) 0 3px, transparent 3px 6px)",
                                  }
                                : null),
                          }}
                        >
                          {blocked ? "×" : `${held ? `${held.rooms}·` : ""}${rate ? Math.round(rate).toLocaleString() : ""}`}
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
                          <span
                            className={cn(
                              "truncate text-[11px]",
                              !row.roomId && "italic text-muted-foreground",
                              row.hideLabel && "text-[9px] italic text-muted-foreground"
                            )}
                          >
                            {row.hideLabel ? "unit" : row.label}
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
                            beginCreate(
                              { rowKey: row.key, roomId: row.roomId, roomTypeId: row.roomTypeId },
                              event.clientX,
                              event.clientY
                            );
                          }}
                        >
                          {dates.map((date, index) => {
                            const block = isBlocked?.(row.roomTypeId, date) ?? null;
                            const blocked = !!block;
                            return (
                              <div
                                key={date.toISOString()}
                                onContextMenu={(event) => {
                                  if (!blocked || !onEditBlock) return;
                                  event.preventDefault();
                                  onEditBlock(row.roomTypeId, date);
                                }}
                                title={
                                  blocked
                                    ? `${formatBlockedTooltip(date, typeof block === "object" ? block : null)}\nRight-click to edit`
                                    : undefined
                                }
                                className={cn(
                                  "shrink-0 border-r last:border-r-0",
                                  isWeekend(date) && "bg-muted/30",
                                  index === todayIndex && "bg-primary/10"
                                )}
                                style={{
                                  width: colWidth,
                                  ...(blocked
                                    ? {
                                        backgroundImage:
                                          "repeating-linear-gradient(45deg, hsl(var(--destructive) / 0.22) 0 3px, transparent 3px 6px)",
                                      }
                                    : null),
                                }}
                              />
                            );
                          })}


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
                              onOpen={openBooking}
                              wasDragGesture={consumeGestureDrag}
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
                                        event.clientX,
                                        event.clientY
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
                {pendingMove?.roomTypeChanged && (
                  <p>
                    Room type: {pendingMove.fromTypeLabel || "—"} → {pendingMove.toTypeLabel || "—"}
                  </p>
                )}
                {pendingMove?.datesChanged && (
                  <p>
                    Dates: {format(parseISO(pendingMove.booking.check_in_date), "d MMM")} –{" "}
                    {format(parseISO(pendingMove.booking.check_out_date), "d MMM")} →{" "}
                    {format(parseISO(pendingMove.checkIn), "d MMM")} – {format(parseISO(pendingMove.checkOut), "d MMM")}
                  </p>
                )}
                {pendingMove?.roomTypeChanged && moveRateNote && (
                  <p className="text-xs text-status-warning">{moveRateNote}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {pendingMove ? bookingNights(pendingMove.booking) : 0} nights stay length is unchanged.
                  {pendingMove?.datesChanged ? " Availability and any channel push are updated." : ""}
                  {pendingMove?.roomTypeChanged
                    ? " The reservation is re-typed to the new unit and both room types are re-pushed to channels."
                    : ""}
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
