import { useEffect, useState, useCallback, useMemo } from "react";
import { addDays, format, startOfDay } from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { useRealtimeBookings } from "@/hooks/useRealtimeBookings";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, BedDouble, RefreshCw, LayoutGrid, Building2, Users, AlertTriangle, SlidersHorizontal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { BlockDetail } from "@/lib/blockAttribution";
import { syncRolosRoomTypesFromOverview } from "@/lib/pmsRoomTypeSync";
import { autoAssignBookings } from "@/lib/bookingAssignment";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { PmsPageSkeleton } from "@/components/pms/PmsPageSkeleton";
import { PmsNoPropertyState } from "@/components/pms/PmsNoPropertyState";
import { BookingQuickViewSheet } from "@/components/pms/BookingQuickViewSheet";
import { RoomTypePlanLabelHeader, RoomTypePlanLegend, RoomTypePlanRows } from "@/components/pms/rooms/RoomTypePlanGrid";
import { MultiCalendarSurface, type MultiCalendarGroup } from "@/components/pms/calendar/MultiCalendarSurface";
import { ReservationFinder } from "@/components/pms/rooms/ReservationFinder";
import { RestrictionsManagerDialog } from "@/components/restrictions/RestrictionsManagerDialog";
import { RoomCard, ROOM_STATUS_COLORS } from "@/components/pms/rooms/RoomCard";
import { BLOCKED_ROOM_STATUSES, buildRoomTypePlan, groupIntoWeeks, occupiesNight, overbookedNights, stopSellKey, type PlanRoom, type PlanRoomType, type RoomsBooking } from "@/components/pms/rooms/roomTypePlanLayout";

/** Nights loaded into the multi-calendar. Scrolling to the right edge extends it. */
const PLAN_NIGHTS = 45;
const PLAN_NIGHTS_STEP = 30;
const PLAN_NIGHTS_MAX = 180;
/** Extra days of reservations loaded beyond the plan so search finds future stays. */
const SEARCH_LOOKAHEAD_DAYS = 60;

const ACTIVE_BOOKING_STATUSES = ["confirmed", "checked_in", "in_house", "pending"];

type RoomForm = { room_number: string; room_name: string; floor: string; room_type_id: string; max_occupancy: string };
const emptyForm: RoomForm = { room_number: "", room_name: "", floor: "", room_type_id: "", max_occupancy: "" };

const SLEEPS_OPTIONS = ["any", "2", "3", "4", "6"];

export default function PMSRooms() {
  const {
    propertyId,
    properties,
    portfolioProperties,
    switchProperty,
    showPortfolioToggle,
    loading: propertyLoading,
  } = usePmsPropertyId();
  // Property scope is controlled by a Portfolio | Property toggle in the header.
  // The active property itself is chosen from the sidebar switcher (top-left).
  // Default scope is always the selected property — never the whole portfolio.
  const [viewMode, setViewMode] = useState<"single" | "portfolio">("single");

  // Switching the property (sidebar switcher / URL) re-scopes the page to it.
  useEffect(() => {
    setViewMode("single");
  }, [propertyId]);

  const portfolioList = useMemo(() => portfolioProperties ?? [], [portfolioProperties]);
  const isPortfolio = viewMode === "portfolio" && portfolioList.length > 1;
  const selectSingleProperty = useCallback((id: string) => {
    setViewMode("single");
    switchProperty(id);
  }, [switchProperty]);
  const activePropertyIds = useMemo(
    () => (isPortfolio ? portfolioList.map((p) => p.id) : propertyId ? [propertyId] : []),
    [isPortfolio, portfolioList, propertyId]
  );


  const [rooms, setRooms] = useState<PlanRoom[]>([]);
  const [roomTypes, setRoomTypes] = useState<PlanRoomType[]>([]);
  const [allRoomTypes, setAllRoomTypes] = useState<PlanRoomType[]>([]);
  const [bookings, setBookings] = useState<RoomsBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<PlanRoom | null>(null);
  const [form, setForm] = useState<RoomForm>(emptyForm);
  const [deleteRoom, setDeleteRoom] = useState<PlanRoom | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<RoomsBooking | null>(null);

  // ─── Plan window & filters ───
  // Deep links from the Command Centre clash alert land on the affected nights
  // with the conflict filter already applied.
  const [anchorDate, setAnchorDate] = useState<Date>(() => {
    const from = new URLSearchParams(window.location.search).get("from");
    const parsed = from ? new Date(`${from}T00:00:00`) : null;
    return parsed && !Number.isNaN(parsed.getTime()) ? startOfDay(parsed) : startOfDay(new Date());
  });
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [overbookedOnly, setOverbookedOnly] = useState(
    () => new URLSearchParams(window.location.search).get("conflicts") === "1"
  );
  const [sleepsFilter, setSleepsFilter] = useState<string>("any");
  const [showCards, setShowCards] = useState(false);
  const [manageRestrictionsOpen, setManageRestrictionsOpen] = useState(false);
  const [focusBlock, setFocusBlock] = useState<{ propertyId: string; roomType: string; date: string } | null>(null);


  const [planNights, setPlanNights] = useState(PLAN_NIGHTS);
  const dates = useMemo(
    () => Array.from({ length: planNights }, (_, i) => addDays(anchorDate, i)),
    [anchorDate, planNights]
  );
  const weeks = useMemo(() => groupIntoWeeks(dates), [dates]);
  const extendWindow = useCallback(() => {
    setPlanNights((current) => (current >= PLAN_NIGHTS_MAX ? current : current + PLAN_NIGHTS_STEP));
  }, []);
  const windowStart = format(dates[0], "yyyy-MM-dd");
  const windowEnd = format(addDays(dates[dates.length - 1], SEARCH_LOOKAHEAD_DAYS), "yyyy-MM-dd");

  /* Blocked (stop-sell) nights live in property_availability, keyed by room type NAME. */
  const { data: stopSellData, refetch: refetchStopSell } = useQuery({
    queryKey: ["pms-rooms-stop-sell", activePropertyIds, windowStart, windowEnd],
    queryFn: async () => {
      const set = new Set<string>();
      const details = new Map<string, BlockDetail>();
      if (activePropertyIds.length === 0) return { set, details };
      const { data } = await supabase
        .from("property_availability")
        .select(
          "property_id, room_type, date, is_stop_sell, available_units, blocked_by_label, blocked_reason, blocked_at, external_system",
        )
        .in("property_id", activePropertyIds)
        .gte("date", windowStart)
        .lte("date", windowEnd);
      (data || []).forEach((row: any) => {
        if (!(row.is_stop_sell === true || row.available_units === 0)) return;
        const key = stopSellKey(row.property_id, String(row.room_type || ""), row.date);
        set.add(key);
        details.set(key, {
          label: row.blocked_by_label ?? null,
          at: row.blocked_at ?? null,
          reason: row.blocked_reason ?? null,
          source: row.external_system ?? null,
        });
      });
      return { set, details };
    },
    enabled: activePropertyIds.length > 0,
  });


  const shiftWindow = useCallback((direction: -1 | 1) => {
    setAnchorDate((current) => addDays(current, direction * 7));
  }, []);
  const goToday = useCallback(() => {
    setAnchorDate(startOfDay(new Date()));
    setPlanNights(PLAN_NIGHTS);
  }, []);

  // Auto-sync room types from the true Property Overview source for every
  // property currently in scope (single OR portfolio view).
  const syncRoomTypesFromOverview = useCallback(async () => {
    if (activePropertyIds.length === 0) return;

    await Promise.all(
      activePropertyIds.map(async (pid) => {
        try {
          await syncRolosRoomTypesFromOverview(pid);

          const { data: allRolosTypes } = await supabase
            .from("rolos_room_types")
            .select("id, name")
            .eq("property_id", pid)
            .eq("is_active", true);

          if (allRolosTypes && allRolosTypes.length > 0) {
            const { data: existingPhysical } = await supabase
              .from("rolos_rooms")
              .select("room_type_id, room_number")
              .eq("property_id", pid);

            const hasPhysical = new Set(
              (existingPhysical || []).map((room) => room.room_type_id).filter(Boolean)
            );
            // Never create a second unit for a duplicate room type that shares a
            // name with an existing unit — that is how archived duplicates leak in.
            const takenNames = new Set(
              (existingPhysical || [])
                .map((room) => (room.room_number || "").trim().toLowerCase())
                .filter(Boolean)
            );
            const missingPhysical = allRolosTypes.filter(
              (roomType) =>
                !hasPhysical.has(roomType.id) &&
                !takenNames.has((roomType.name || "").trim().toLowerCase())
            );

            if (missingPhysical.length > 0) {
              const backfillRooms = missingPhysical.map((roomType) => ({
                property_id: pid,
                room_number: roomType.name,
                room_name: roomType.name,
                room_type_id: roomType.id,
                status: "available",
              }));
              await supabase.from("rolos_rooms").insert(backfillRooms);
            }
          }

        } catch (err) {
          console.warn(`[PMSRooms] sync failed for property ${pid}:`, err);
        }
      })
    );
  }, [activePropertyIds]);

  const fetchData = useCallback(async () => {
    if (activePropertyIds.length === 0) return;
    setLoading(true);
    await syncRoomTypesFromOverview();

    const [roomsRes, typesRes, allTypesRes, bookingsRes] = await Promise.all([
      supabase
        .from("rolos_rooms")
        .select("id, property_id, room_number, room_name, floor, status, max_occupancy, room_type_id")
        .in("property_id", activePropertyIds)
        .order("floor", { ascending: true })
        .order("room_number", { ascending: true }),
      supabase
        .from("rolos_room_types")
        .select("id, name, property_id")
        .in("property_id", activePropertyIds)
        .eq("is_active", true)
        .order("name"),
      supabase
        .from("rolos_room_types")
        .select("id, name, property_id")
        .in("property_id", activePropertyIds),
      (supabase.from("bookings") as any)
        .select(
          "id, property_id, guest_name, guest_email, guest_phone, rol_reference, external_reservation_id, check_in_date, check_out_date, status, adults, children, teens, infants, pets, total_price, special_requests, requires_intervention, payment_status, room_type_id, rolos_room_ids"
        )
        .in("property_id", activePropertyIds)
        .gte("check_out_date", windowStart)
        .lte("check_in_date", windowEnd)
        .in("status", ACTIVE_BOOKING_STATUSES),
    ]);

    if (bookingsRes.error) {
      console.error("[PMSRooms] reservation query failed:", bookingsRes.error);
      toast.error("Reservations could not be loaded. Please refresh and try again.");
    }

    const rawBookings = (bookingsRes.data || []) as RoomsBooking[];
    const bookingIds = rawBookings.map((b) => b.id);
    const { data: bookingRoomLinks } = bookingIds.length
      ? await (supabase.from("rolos_booking_rooms") as any)
          .select("booking_id, room_id")
          .neq("status", "cancelled")
          .in("booking_id", bookingIds)
      : { data: [] };
    const linkedRoomIdsByBooking = new Map<string, string[]>();
    for (const link of (bookingRoomLinks || []) as any[]) {
      if (!link.booking_id || !link.room_id) continue;
      linkedRoomIdsByBooking.set(link.booking_id, [...(linkedRoomIdsByBooking.get(link.booking_id) || []), link.room_id]);
    }

    // `allTypes` (incl. archived) is only used for legacy booking → type matching.
    const allTypes = (allTypesRes.data || []) as PlanRoomType[];
    setAllRoomTypes(allTypes);
    const activeTypes = (typesRes.data || []) as PlanRoomType[];
    const roomRows = (roomsRes.data || []) as any[];

    // Collapse same-named duplicates per property, preferring the record that
    // actually owns physical units — archived/duplicate leftovers drop out.
    const typeIdsWithUnits = new Set(
      roomRows.map((r) => r.room_type_id).filter(Boolean) as string[]
    );
    const dedupedTypes: PlanRoomType[] = [];
    const seenByKey = new Map<string, number>();
    for (const type of activeTypes) {
      const key = `${type.property_id}::${(type.name || "").trim().toLowerCase()}`;
      const existingIndex = seenByKey.get(key);
      if (existingIndex === undefined) {
        seenByKey.set(key, dedupedTypes.length);
        dedupedTypes.push(type);
        continue;
      }
      const existing = dedupedTypes[existingIndex];
      if (!typeIdsWithUnits.has(existing.id) && typeIdsWithUnits.has(type.id)) {
        dedupedTypes[existingIndex] = type;
      }
    }

    const types = dedupedTypes;
    setRoomTypes(types);

    const activeTypeIds = new Set(types.map((t) => t.id));
    const typeMap = new Map(types.map((t) => [t.id, t.name]));

    const visibleRooms = roomRows
      .filter((r: any) => !r.room_type_id || activeTypeIds.has(r.room_type_id))
      .map((r: any) => ({
        ...r,
        room_type_name: r.room_type_id ? typeMap.get(r.room_type_id) : undefined,
      })) as PlanRoom[];
    setRooms(visibleRooms);


    const assignedBookings = autoAssignBookings(
      rawBookings.map((booking) => {
        // The booking's own unit ids win: room lines only fill in stays that have
        // none, otherwise a stale line places a moved stay in two units at once.
        const ownIds = booking.rolos_room_ids || [];
        if (ownIds.length) return booking;
        const linkedIds = linkedRoomIdsByBooking.get(booking.id) || [];
        return linkedIds.length ? { ...booking, rolos_room_ids: linkedIds } : booking;
      }),
      visibleRooms,
      (allTypes.length ? allTypes : types)
    ) as RoomsBooking[];
    setBookings(assignedBookings);
    setLoading(false);
  }, [activePropertyIds, syncRoomTypesFromOverview, windowStart, windowEnd]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Live channel requests: repaint the grid the moment a booking lands, no refresh needed.
  useRealtimeBookings({
    propertyIds: activePropertyIds,
    onChange: (event) => {
      fetchData();
      if (event?.isNew) {
        const stay = event.checkIn && event.checkOut ? ` ${event.checkIn} → ${event.checkOut}` : "";
        toast.info(`New reservation${stay}`, { description: event.guestName || undefined });
      }
    },
  });

  // Room types offered in the create/edit dialog: scoped to the room being
  // edited (portfolio view can mix properties) and always including the room's
  // currently assigned type even if it was deduped/archived out of the plan.
  const dialogRoomTypeOptions = useMemo(() => {
    const scopeId = editingRoom?.property_id || propertyId || null;
    const inScope = (rt: PlanRoomType) => !scopeId || rt.property_id === scopeId;
    const options = roomTypes.filter(inScope);
    const currentId = form.room_type_id;
    if (currentId && !options.some((rt) => rt.id === currentId)) {
      const current = allRoomTypes.find((rt) => rt.id === currentId);
      if (current) options.unshift(current);
    }
    return options;
  }, [roomTypes, allRoomTypes, editingRoom, propertyId, form.room_type_id]);


  const openCreateDialog = () => {
    setEditingRoom(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (room: PlanRoom) => {
    setEditingRoom(room);
    setForm({
      room_number: room.room_number,
      room_name: room.room_name || "",
      floor: room.floor != null ? String(room.floor) : "",
      room_type_id: room.room_type_id || "",
      max_occupancy: room.max_occupancy != null ? String(room.max_occupancy) : "",
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.room_number) return;
    const payload = {
      room_number: form.room_number,
      room_name: form.room_name || null,
      floor: form.floor ? parseInt(form.floor) : null,
      room_type_id: form.room_type_id || null,
      max_occupancy: form.max_occupancy ? parseInt(form.max_occupancy) : null,
    };

    if (editingRoom) {
      const { error } = await supabase.from("rolos_rooms").update(payload).eq("id", editingRoom.id);
      if (error) { toast.error(error.message); return; }
      toast.success("Room updated");
    } else {
      if (!propertyId) { toast.error("Select a property to add a room"); return; }
      const { error } = await supabase.from("rolos_rooms").insert({ ...payload, property_id: propertyId });
      if (error) { toast.error(error.message); return; }
      toast.success("Room created");
    }

    setDialogOpen(false);
    setForm(emptyForm);
    setEditingRoom(null);
    fetchData();
  };

  const handleDelete = async () => {
    if (!deleteRoom) return;
    const { error } = await supabase.from("rolos_rooms").delete().eq("id", deleteRoom.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Room deleted");
    setDeleteRoom(null);
    fetchData();
  };

  const handleStatusChange = async (roomId: string, status: string) => {
    // Optimistic update so the dropdown reflects the new state immediately.
    const previous = rooms;
    setRooms((rs) => rs.map((r) => (r.id === roomId ? { ...r, status } : r)));
    const { data, error } = await supabase
      .from("rolos_rooms")
      .update({ status })
      .eq("id", roomId)
      .select("id, status");
    if (error) {
      setRooms(previous);
      toast.error(error.message);
      return;
    }
    if (!data || data.length === 0) {
      setRooms(previous);
      toast.error("Status update was blocked (no permission on this room).");
      return;
    }
    toast.success("Status updated");
  };

  const propertyNames = useMemo(() => new Map(properties.map((p) => [p.id, p.name])), [properties]);

  const today = useMemo(() => startOfDay(new Date()), []);

  const activeBookingForRoom = useCallback(
    (roomId: string) => bookings.find((b) => (b.rolos_room_ids || []).includes(roomId) && occupiesNight(b, today)),
    [bookings, today]
  );

  const nextBookingForRoom = useCallback(
    (roomId: string) => {
      const todayStr = format(today, "yyyy-MM-dd");
      return bookings
        .filter((b) => (b.rolos_room_ids || []).includes(roomId) && b.check_in_date > todayStr)
        .sort((a, b) => a.check_in_date.localeCompare(b.check_in_date))[0];
    },
    [bookings, today]
  );

  const displayStatusForRoom = useCallback(
    (room: PlanRoom) => {
      const hasActiveBooking = !!activeBookingForRoom(room.id);
      if (hasActiveBooking && !BLOCKED_ROOM_STATUSES.includes(room.status)) return "occupied";
      return room.status;
    },
    [activeBookingForRoom]
  );

  // ─── Filtering ───
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const room of rooms) {
      const status = displayStatusForRoom(room);
      counts.set(status, (counts.get(status) || 0) + 1);
    }
    return counts;
  }, [rooms, displayStatusForRoom]);

  const filtersActive = statusFilter !== "all" || typeFilter !== "all" || sleepsFilter !== "any";

  const matchesFilters = useCallback(
    (room: PlanRoom) => {
      if (statusFilter !== "all" && displayStatusForRoom(room) !== statusFilter) return false;
      if (typeFilter !== "all" && room.room_type_id !== typeFilter) return false;
      if (sleepsFilter !== "any" && (room.max_occupancy ?? 0) < Number(sleepsFilter)) return false;
      return true;
    },
    [statusFilter, typeFilter, sleepsFilter, displayStatusForRoom]
  );

  // Oversold nights in the visible window, grouped per room type, so the toolbar
  // can surface double bookings even when the offending row is scrolled away.
  const overbooking = useMemo(() => {
    const typeIds = new Set<string>();
    let nights = 0;
    const propertyIds = Array.from(new Set(roomTypes.map((t) => t.property_id)));
    for (const pid of propertyIds) {
      const planRows = buildRoomTypePlan(
        dates,
        roomTypes.filter((t) => t.property_id === pid),
        rooms.filter((r) => r.property_id === pid),
        bookings.filter((b) => b.property_id === pid)
      );
      for (const row of planRows) {
        const affected = overbookedNights(row);
        if (affected.length > 0) {
          typeIds.add(row.roomType.id);
          nights += affected.length;
        }
      }
    }
    return { typeIds, nights };
  }, [dates, roomTypes, rooms, bookings]);

  const visibleTypes = useCallback(
    (types: PlanRoomType[]) =>
      types.filter((t) => {
        if (overbookedOnly && !overbooking.typeIds.has(t.id)) return false;
        if (typeFilter !== "all" && t.id !== typeFilter) return false;
        return true;
      }),
    [overbookedOnly, overbooking.typeIds, typeFilter]
  );


  if (propertyLoading) return <PmsPageSkeleton rows={4} />;
  if (!propertyId && !isPortfolio) return <PmsNoPropertyState description="No property is assigned to this account yet, so there is no room inventory to show. Rooms appear here once a property is linked." />;

  // Group rooms & types per property for portfolio mode
  const propertySections = isPortfolio
    ? properties.map((p) => ({
        property: p,
        rooms: rooms.filter((r) => r.property_id === p.id),
        roomTypes: roomTypes.filter((t) => t.property_id === p.id),
        bookings: bookings.filter((b) => b.property_id === p.id),
      }))
    : [{
        property: properties.find((p) => p.id === propertyId) || { id: propertyId!, name: "" },
        rooms,
        roomTypes,
        bookings,
      }];

  const planTitle = `${format(dates[0], "d MMM")} – ${format(dates[dates.length - 1], "d MMM yyyy")}`;

  const renderRoomGrid = (items: PlanRoom[]) => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {items.map((room) => (
        <RoomCard
          key={room.id}
          room={room}
          displayStatus={displayStatusForRoom(room)}
          activeBooking={activeBookingForRoom(room.id)}
          nextBooking={nextBookingForRoom(room.id)}
          onEdit={openEditDialog}
          onDelete={setDeleteRoom}
          onStatusChange={handleStatusChange}
          onOpenBooking={setSelectedBooking}
        />
      ))}
    </div>
  );

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Room Inventory</h1>
            <p className="text-sm text-muted-foreground">
              {isPortfolio
                ? `Portfolio view — ${portfolioList.length} properties`
                : "Availability plan, reservations and physical rooms in one view."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {showPortfolioToggle && (
              <div className="inline-flex rounded-md border bg-muted/40 p-0.5">
                <Button
                  size="sm"
                  variant={viewMode === "portfolio" ? "default" : "ghost"}
                  className="h-8 px-3 text-xs"
                  onClick={() => setViewMode("portfolio")}
                >
                  Portfolio
                </Button>
                <Button
                  size="sm"
                  variant={viewMode === "single" ? "default" : "ghost"}
                  className="h-8 px-3 text-xs"
                  onClick={() => setViewMode("single")}
                >
                  Property
                </Button>
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => { setFocusBlock(null); setManageRestrictionsOpen(true); }}
            >
              <SlidersHorizontal className="h-4 w-4 mr-2" />Restrictions
            </Button>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
            {!isPortfolio && (
              <Button onClick={openCreateDialog}><Plus className="h-4 w-4 mr-2" />Add Room</Button>
            )}
          </div>
        </div>

        {/* Find a reservation in one keystroke */}
        <ReservationFinder
          bookings={bookings}
          rooms={rooms}
          propertyNames={propertyNames}
          onSelectBooking={setSelectedBooking}
        />

        {/* Filter strip — chips narrow both the plan and the room grid */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            <Button
              variant={statusFilter === "all" ? "default" : "outline"}
              size="sm"
              className="h-7 text-xs px-2 shrink-0"
              onClick={() => setStatusFilter("all")}
            >
              All <span className="ml-1 tabular-nums opacity-70">{rooms.length}</span>
            </Button>
            {Object.keys(ROOM_STATUS_COLORS).map((status) => {
              const count = statusCounts.get(status) || 0;
              return (
                <Button
                  key={status}
                  variant={statusFilter === status ? "default" : "outline"}
                  size="sm"
                  disabled={count === 0 && statusFilter !== status}
                  className={cn("h-7 text-xs px-2 shrink-0 capitalize", statusFilter !== status && count > 0 && ROOM_STATUS_COLORS[status])}
                  onClick={() => setStatusFilter((current) => (current === status ? "all" : status))}
                >
                  {status.replace(/_/g, " ")} <span className="ml-1 tabular-nums opacity-70">{count}</span>
                </Button>
              );
            })}
          </div>
          <Select value={typeFilter} onValueChange={setTypeFilter}>
            <SelectTrigger className="h-7 w-[170px] text-xs"><SelectValue placeholder="Room type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All room types</SelectItem>
              {roomTypes.map((rt) => (
                <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sleepsFilter} onValueChange={setSleepsFilter}>
            <SelectTrigger className="h-7 w-[130px] text-xs">
              <Users className="h-3 w-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SLEEPS_OPTIONS.map((option) => (
                <SelectItem key={option} value={option}>
                  {option === "any" ? "Any size" : `Sleeps ${option}+`}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {overbooking.nights > 0 && (
            <Button
              variant={overbookedOnly ? "destructive" : "outline"}
              size="sm"
              className={cn("h-7 px-2 text-xs", !overbookedOnly && "border-destructive text-destructive")}
              onClick={() => setOverbookedOnly((prev) => !prev)}
              title="Nights sold beyond available units in this window"
            >
              <AlertTriangle className="mr-1 h-3 w-3" />
              {overbooking.nights} overbooked night{overbooking.nights === 1 ? "" : "s"}
            </Button>
          )}
          {(filtersActive || overbookedOnly) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs px-2"
              onClick={() => { setStatusFilter("all"); setTypeFilter("all"); setSleepsFilter("any"); setOverbookedOnly(false); }}
            >
              Clear filters
            </Button>
          )}
          <Button
            variant={showCards ? "default" : "outline"}
            size="sm"
            className="h-7 text-xs px-2 ml-auto"
            onClick={() => setShowCards((v) => !v)}
          >
            <LayoutGrid className="h-3 w-3 mr-1" />
            {showCards ? "Hide room cards" : "Room cards"}
          </Button>
        </div>


        {loading ? (
          <PmsPageSkeleton rows={4} />
        ) : (
          <div className="space-y-4">
            {/* One continuous multi-calendar: every property stacked, nights running sideways */}
            <MultiCalendarSurface
              dates={dates}
              weeks={weeks}
              title="Room type plan"
              subtitle={planTitle}
              labelHeader={<RoomTypePlanLabelHeader />}
              onShiftWindow={shiftWindow}
              onToday={goToday}
              onExtend={extendWindow}
              emptyMessage="No room types configured yet — add them in Property Overview to see the plan."
              groups={propertySections.map(({ property, rooms: pRooms, roomTypes: pTypes, bookings: pBookings }) => ({
                id: property.id,
                name: isPortfolio ? property.name : undefined,
                meta: isPortfolio ? `${pRooms.length} room${pRooms.length !== 1 ? "s" : ""}` : undefined,
                action: isPortfolio ? (
                  <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px]" onClick={() => selectSingleProperty(property.id)}>
                    Manage →
                  </Button>
                ) : undefined,
                rows: (
                  <RoomTypePlanRows
                    dates={dates}
                    roomTypes={visibleTypes(pTypes)}
                    rooms={pRooms.filter(matchesFilters)}
                    bookings={pBookings}
                    onSelectBooking={setSelectedBooking}
                    displayStatusFor={displayStatusForRoom}
                    onStatusChange={handleStatusChange}
                    onEditRoom={openEditDialog}
                    stopSellNights={stopSellData?.set}
                    blockDetails={stopSellData?.details}
                    onEditBlock={(propId, roomTypeName, date) => {
                      setFocusBlock({ propertyId: propId, roomType: roomTypeName, date: format(date, "yyyy-MM-dd") });
                      setManageRestrictionsOpen(true);
                    }}
                  />
                ),
              }))}
            />
            <RoomTypePlanLegend />

            {propertySections.map(({ property, rooms: pRooms, roomTypes: pTypes }) => {
              const filteredRooms = pRooms.filter(matchesFilters);
              const grouped = new Map<string, number>();
              for (const rt of pTypes) {
                const count = pRooms.filter((r) => r.room_type_id === rt.id).length;
                grouped.set(rt.name, (grouped.get(rt.name) || 0) + count);
              }
              return (
                <section key={property.id} className="space-y-3">
                  {isPortfolio && (pTypes.length > 0 || showCards) && (
                    <h2 className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border pb-1 text-sm font-semibold">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 break-words">{property.name}</span>
                    </h2>
                  )}

                  {pTypes.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2">
                      {Array.from(grouped.entries()).map(([name, count]) => (
                        <Badge key={name} variant="outline" className="text-xs">
                          {name}: {count} room{count !== 1 ? "s" : ""}
                        </Badge>
                      ))}
                    </div>
                  )}

                  {pRooms.length === 0 ? (
                    <Card>
                      <CardContent className="py-8 text-center">
                        <BedDouble className="h-10 w-10 mx-auto text-muted-foreground mb-3" />
                        <p className="text-muted-foreground text-sm">
                          {pTypes.length === 0
                            ? "No room types configured."
                            : `${pTypes.length} room type${pTypes.length !== 1 ? "s" : ""} — no physical rooms yet.`}
                        </p>
                      </CardContent>
                    </Card>
                  ) : !showCards ? null : filteredRooms.length === 0 ? (
                    <Card>
                      <CardContent className="py-6 text-center text-sm text-muted-foreground">
                        No rooms match the current filters.
                      </CardContent>
                    </Card>
                  ) : (
                    renderRoomGrid(filteredRooms)
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

      {/* Reservation detail — same sheet the dashboard uses */}
      <BookingQuickViewSheet
        booking={selectedBooking}
        propertyId={propertyId}
        onOpenChange={(open) => { if (!open) setSelectedBooking(null); }}
      />

      {/* Edit / move / remove existing restrictions */}
      <RestrictionsManagerDialog
        open={manageRestrictionsOpen}
        onOpenChange={(v) => { setManageRestrictionsOpen(v); if (!v) setFocusBlock(null); }}
        propertyIds={activePropertyIds}
        propertyNames={Object.fromEntries(properties.map((p) => [p.id, p.name]))}
        windowStart={dates[0]}
        focusBlock={focusBlock}
        onChanged={() => { refetchStopSell(); fetchData(); }}
      />



      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setEditingRoom(null); setForm(emptyForm); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editingRoom ? "Edit Room" : "Add Physical Room"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Room Number *</Label>
              <Input value={form.room_number} onChange={(e) => setForm((p) => ({ ...p, room_number: e.target.value }))} placeholder="e.g. 101" />
            </div>
            <div>
              <Label>Room Name</Label>
              <Input value={form.room_name} onChange={(e) => setForm((p) => ({ ...p, room_name: e.target.value }))} placeholder="e.g. Ocean Suite" />
            </div>
            <div>
              <Label>Room Type</Label>
              <Select value={form.room_type_id} onValueChange={(v) => setForm((p) => ({ ...p, room_type_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select room type" /></SelectTrigger>
                <SelectContent>
                  {dialogRoomTypeOptions.length === 0 ? (
                    <SelectItem value="none" disabled>No room types — add them in Property Overview first</SelectItem>
                  ) : (
                    dialogRoomTypeOptions.map((rt) => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Room types are synced from Property Overview configuration.</p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div><Label>Floor</Label><Input type="number" value={form.floor} onChange={(e) => setForm((p) => ({ ...p, floor: e.target.value }))} /></div>
              <div><Label>Max Occupancy</Label><Input type="number" value={form.max_occupancy} onChange={(e) => setForm((p) => ({ ...p, max_occupancy: e.target.value }))} /></div>
            </div>
            <Button onClick={handleSave} className="w-full">{editingRoom ? "Update Room" : "Create Room"}</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteRoom} onOpenChange={(open) => { if (!open) setDeleteRoom(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Room {deleteRoom?.room_number}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this physical room. Any bookings assigned to this room will not be affected but will lose room assignment.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
