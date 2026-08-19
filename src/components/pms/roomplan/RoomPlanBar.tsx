import { memo, useCallback } from "react";
import { format, parseISO } from "date-fns";
import { AlertTriangle, CalendarClock, LogIn, LogOut, Radio, XCircle } from "lucide-react";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { CHANNEL_SOURCE_BADGE } from "@/lib/channelVocabulary";
import { displayBookingReference } from "@/lib/bookingReference";

import { resolveRuSourceChannel, ChannelLogo } from "@/lib/ruChannelDisplay";
import {
  BarGeometry,
  ROOM_PLAN_ROW_H,
  bookingNights,
  getBarColor,
  isBookingDraggable,
} from "./roomPlanLayout";

export interface RoomPlanBooking {
  id: string;
  guest_name: string;
  check_in_date: string;
  check_out_date: string;
  status: string;
  adults?: number | null;
  children?: number | null;
  teens?: number | null;
  infants?: number | null;
  pets?: number | null;
  total_price: number;
  payment_status?: string | null;
  booking_channel?: string | null;
  integration_type?: string | null;
  requires_intervention?: boolean | null;
  special_requests?: string | null;
  rolos_room_ids?: string[] | null;
  room_type_id?: string | null;
  /** Room types referenced by the booking's per-unit lines (multi-room stays). */
  line_room_type_ids?: string[] | null;
  rol_reference?: string | null;
  rol_reference_legacy?: string | null;
  external_reservation_id?: string | null;
  property_id?: string | null;
  modification_notes?: Record<string, unknown>[] | null;
}


/** Which unit line a bar represents, so Cancel can target just that unit. */
export interface RoomPlanCancelContext {
  lineId: string;
  roomLabel: string;
  unitCount: number;
}

/** Occupancy of one unit line of a multi-unit stay. */
export interface RoomPlanUnitLine {
  id: string;
  adults?: number | null;
  children?: number | null;
  teens?: number | null;
  infants?: number | null;
  pets?: number | null;
}

interface RoomPlanBarProps {
  booking: RoomPlanBooking;
  geometry: BarGeometry;
  colWidth: number;
  lane: number;
  roomLabel: string;
  propertyName?: string | null;
  dragging?: boolean;
  /** The stay's line for this row — drives per-unit pax and per-unit cancel. */
  unitLine?: RoomPlanUnitLine | null;
  /** Total active unit lines on the booking (1 = ordinary single-unit stay). */
  unitCount?: number;
  onOpen: (booking: RoomPlanBooking) => void;
  onQuickAction?: (booking: RoomPlanBooking, action: "check_in" | "check_out") => void;
  onModify?: (booking: RoomPlanBooking) => void;
  onCancel?: (booking: RoomPlanBooking, context?: RoomPlanCancelContext) => void;
  onDragStart?: (booking: RoomPlanBooking, event: React.PointerEvent) => void;
  /** True when the click currently firing is the tail of a drag gesture. */
  wasDragGesture?: () => boolean;
}

interface PaxSource {
  adults?: number | null;
  children?: number | null;
  teens?: number | null;
  infants?: number | null;
  pets?: number | null;
}

const paxLine = (b: PaxSource) => {
  const parts: string[] = [];
  if (b.adults) parts.push(`${b.adults} adult${b.adults === 1 ? "" : "s"}`);
  if (b.teens) parts.push(`${b.teens} teen${b.teens === 1 ? "" : "s"}`);
  if (b.children) parts.push(`${b.children} child${b.children === 1 ? "" : "ren"}`);
  if (b.infants) parts.push(`${b.infants} infant${b.infants === 1 ? "" : "s"}`);
  if (b.pets) parts.push(`${b.pets} pet${b.pets === 1 ? "" : "s"}`);
  return parts.join(" · ") || "No pax captured";
};


const isChannelBooking = (b: RoomPlanBooking) =>
  !!b.integration_type && b.integration_type !== "rolos" && b.integration_type !== "manual";

export const RoomPlanBar = memo(function RoomPlanBar({
  booking,
  geometry,
  colWidth,
  lane,
  roomLabel,
  propertyName,
  dragging,
  onOpen,
  onQuickAction,
  onModify,
  onCancel,
  onDragStart,
  wasDragGesture,
}: RoomPlanBarProps) {
  const nights = bookingNights(booking);
  const draggable = isBookingDraggable(booking) && !!onDragStart;
  const needsAttention = !!booking.requires_intervention || !!booking.special_requests?.trim();
  const isLead = (booking.integration_type ?? "").endsWith("_lead");

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (!draggable) return;
      onDragStart?.(booking, event);
    },
    [booking, draggable, onDragStart]
  );

  const handleClick = useCallback(() => {
    // A drag always ends with a click on this bar — opening the booking sheet
    // then would cover the move confirmation, so swallow that click.
    if (wasDragGesture?.()) return;
    onOpen(booking);
  }, [booking, onOpen, wasDragGesture]);

  return (
    <HoverCard openDelay={150} closeDelay={80} open={dragging ? false : undefined}>
      <HoverCardTrigger asChild>
        <button
          type="button"
          data-booking-bar={booking.id}
          onPointerDown={handlePointerDown}
          onClick={handleClick}
          style={{
            left: geometry.startCol * colWidth + colWidth * 0.28,
            width: geometry.cols * colWidth - colWidth * 0.56,
            top: lane * (ROOM_PLAN_ROW_H - 4) + 3,
            height: ROOM_PLAN_ROW_H - 8,
          }}
          className={cn(
            "absolute z-20 flex items-center gap-1 overflow-hidden rounded-full border px-2 text-[10px] font-medium leading-none shadow-sm transition-colors",
            getBarColor(booking.status),
            geometry.clippedStart && "rounded-l-none",
            geometry.clippedEnd && "rounded-r-none",
            draggable ? "cursor-grab active:cursor-grabbing" : "cursor-pointer",
            dragging && "opacity-40"
          )}
          title={`${booking.guest_name} · ${nights} night${nights === 1 ? "" : "s"}`}
        >
          {isChannelBooking(booking) && <Radio className="h-2.5 w-2.5 shrink-0 opacity-90" />}
          <span className="truncate">{booking.guest_name}</span>
          {geometry.cols > 2 && <span className="shrink-0 opacity-80">· {nights}n</span>}
          {needsAttention && <AlertTriangle className="ml-auto h-2.5 w-2.5 shrink-0" />}
        </button>
      </HoverCardTrigger>
      <HoverCardContent
        side="top"
        align="start"
        className="w-72 border-slate-700 bg-slate-900 p-3 text-slate-100"
      >
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{booking.guest_name}</p>
              <p className="truncate font-mono text-[10px] text-slate-300">{displayBookingReference(booking)}</p>
              <p className="text-[11px] text-slate-400">
                {propertyName ? `${propertyName} · ` : ""}
                {roomLabel}
              </p>
            </div>
            <span className="shrink-0 rounded-full border border-slate-600 px-2 py-0.5 text-[10px] capitalize">
              {isLead ? "lead" : booking.status.replace(/_/g, " ")}
            </span>
          </div>


          <div className="space-y-0.5 text-[11px] text-slate-300">
            <p>
              {format(parseISO(booking.check_in_date), "EEE d MMM")} → {format(parseISO(booking.check_out_date), "EEE d MMM yyyy")}
              <span className="text-slate-400"> · {nights} night{nights === 1 ? "" : "s"}</span>
            </p>
            <p>{paxLine(booking)}</p>
            <p>
              R{Number(booking.total_price || 0).toLocaleString()}
              <span className="text-slate-400"> · {(booking.payment_status || "unpaid").replace(/_/g, " ")}</span>
            </p>
            {isChannelBooking(booking) && (
              <div className="flex items-center gap-1.5 pt-0.5">
                {(() => {
                  const source = resolveRuSourceChannel(booking.modification_notes, booking.booking_channel, booking.integration_type);
                  if (!source.hasSpecificSource) return null;
                  return (
                    <>
                      <ChannelLogo channelName={source.channelLogoKey} size="sm" />
                      <span className="text-slate-200">{source.label}</span>
                    </>
                  );
                })()}
                <Badge className="bg-orange-500 hover:bg-orange-600 text-white text-[10px] px-1.5 py-0 font-bold">{CHANNEL_SOURCE_BADGE}</Badge>
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1 pt-1">
            <Button size="sm" className="h-6 px-2 text-[10px]" onClick={() => onOpen(booking)}>
              Open
            </Button>
            {booking.status !== "checked_in" && booking.status !== "checked_out" && onQuickAction && (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 px-2 text-[10px]"
                onClick={() => onQuickAction(booking, "check_in")}
              >
                <LogIn className="mr-1 h-3 w-3" />Check in
              </Button>
            )}
            {booking.status === "checked_in" && onQuickAction && (
              <Button
                size="sm"
                variant="secondary"
                className="h-6 px-2 text-[10px]"
                onClick={() => onQuickAction(booking, "check_out")}
              >
                <LogOut className="mr-1 h-3 w-3" />Check out
              </Button>
            )}
            {onModify && !isLead && (
              <Button
                size="sm"
                variant="outline"
                className="h-6 border-slate-600 bg-transparent px-2 text-[10px] text-slate-100 hover:bg-slate-800"
                onClick={() => onModify(booking)}
              >
                <CalendarClock className="mr-1 h-3 w-3" />Modify
              </Button>
            )}
            {onCancel && (
              <Button
                size="sm"
                variant="destructive"
                className="h-6 px-2 text-[10px]"
                onClick={() => onCancel(booking)}
              >
                <XCircle className="mr-1 h-3 w-3" />Cancel
              </Button>
            )}
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
});
