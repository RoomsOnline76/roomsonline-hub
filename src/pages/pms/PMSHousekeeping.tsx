import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import {
  CheckCircle, Sparkles, Wrench, RefreshCw, Plus, AlertTriangle, ShieldCheck, ChevronLeft, ChevronRight, LayoutGrid, Building2, ChevronDown, ChevronUp, BedDouble, Check, ChevronsUpDown,
} from "lucide-react";


import { callPmsApi } from "@/hooks/usePmsApi";
import { supabase } from "@/integrations/supabase/client";
import { autoAssignBookings } from "@/lib/bookingAssignment";
import { toast } from "sonner";
import { PmsPageSkeleton } from "@/components/pms/PmsPageSkeleton";

// ── Types ──────────────────────────────────────────────────────────────────

interface Room {
  id: string;
  property_id: string;
  room_number: string;
  room_name: string | null;
  floor: number | null;
  status: string;
  room_type_id: string | null;
}

interface RoomType {
  id: string;
  name: string;
  property_id: string;
}

interface InHouseBooking {
  id: string;
  rolos_room_ids: string[] | null;
  guest_name: string | null;
  property_id: string;
  status: string;
  check_in_date: string;
  check_out_date: string;
  room_type_id: string | null;
}

interface HKTask {
  id: string;
  room_id: string;
  task_type: string;
  priority: string;
  status: string;
  notes: string | null;
  assigned_to: string | null;
}

interface MaintenanceRequest {
  id: string;
  room_id: string | null;
  property_id: string | null;
  issue_type: string | null;
  priority: string | null;
  description: string;
  status: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  completion_notes: string | null;
  room_ready_confirmed: boolean;
  completed_date: string | null;
}

const ISSUE_TYPES = [
  "plumbing", "electrical", "hvac", "furniture", "appliance", "structural", "other",
];

const PRIORITIES = ["low", "normal", "high", "emergency"];
const STATUSES_OPEN = ["reported", "assigned", "in_progress"];

const PRIORITY_BADGE: Record<string, string> = {
  emergency: "bg-destructive text-destructive-foreground",
  high: "bg-destructive/80 text-destructive-foreground",
  normal: "bg-amber-500 text-white",
  low: "bg-muted text-muted-foreground",
};

const STATUS_BORDER: Record<string, string> = {
  available: "border-l-emerald-500",
  occupied: "border-l-blue-500",
  dirty: "border-l-amber-500",
  maintenance: "border-l-red-500",
  out_of_order: "border-l-destructive",
  in_house: "border-l-blue-500",
};


// ── Component ──────────────────────────────────────────────────────────────

export default function PMSHousekeeping() {
  const { propertyId, properties, switchProperty, loading: propertyLoading } = usePmsPropertyId();
  const currentIndex = properties.findIndex((p) => p.id === propertyId);
  const goToProperty = (offset: number) => {
    if (properties.length === 0) return;
    const next = (currentIndex + offset + properties.length) % properties.length;
    switchProperty(properties[next].id);
  };

  const [viewMode, setViewMode] = useState<"portfolio" | "single">("single");
  const [autoDefaulted, setAutoDefaulted] = useState(false);
  useEffect(() => {
    if (!autoDefaulted && properties.length > 1) {
      setViewMode("portfolio");
      setAutoDefaulted(true);
    }
  }, [properties.length, autoDefaulted]);

  const isPortfolio = viewMode === "portfolio" && properties.length > 1;
  const activePropertyIds = useMemo(
    () => (isPortfolio ? properties.map((p) => p.id) : propertyId ? [propertyId] : []),
    [isPortfolio, properties, propertyId]
  );

  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [hkTasks, setHkTasks] = useState<HKTask[]>([]);
  const [maintenanceReqs, setMaintenanceReqs] = useState<MaintenanceRequest[]>([]);
  // Active stays: drives the "In House" indicator regardless of room.status drift.
  const [inHouseBookings, setInHouseBookings] = useState<InHouseBooking[]>([]);
  const [docketRoomSearchOpen, setDocketRoomSearchOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // Dialog state
  const [showCreateDocket, setShowCreateDocket] = useState(false);
  const [docketRoomId, setDocketRoomId] = useState("");
  const [docketIssueType, setDocketIssueType] = useState("");
  const [docketPriority, setDocketPriority] = useState("normal");
  const [docketDescription, setDocketDescription] = useState("");
  const [docketMarkUnavailable, setDocketMarkUnavailable] = useState(false);
  const [docketEstCost, setDocketEstCost] = useState("");
  const [saving, setSaving] = useState(false);

  // Resolve dialog
  const [resolveReq, setResolveReq] = useState<MaintenanceRequest | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  // Per-property toggle to expand the otherwise-collapsed "Ready" column.
  const [readyExpanded, setReadyExpanded] = useState<Record<string, boolean>>({});
  // Room columns start collapsed — operators expand only the queue they are working.
  const [colOpen, setColOpen] = useState<Record<string, boolean>>({});
  const isColOpen = useCallback((key: string) => !!colOpen[key], [colOpen]);
  const toggleCol = useCallback((key: string) => setColOpen(prev => ({ ...prev, [key]: !prev[key] })), []);
  // Action-card queue drawer: which workload the user drilled into.
  const [queue, setQueue] = useState<null | "clean" | "tasks" | "maintenance" | "ready">(null);



  // ── Fetch all data ────────────────────────────────────────────────────

  const [usingFallback, setUsingFallback] = useState(false);

  const fetchAll = useCallback(async () => {
    if (propertyLoading) return;
    // Wait until we know whether a portfolio exists before firing, to avoid a
    // single-property fetch racing the auto-flipped portfolio fetch and
    // overwriting it.
    if (!autoDefaulted && properties.length > 1) return;
    if (activePropertyIds.length === 0) return;
    setLoading(true);
    const roomsQ = (supabase.from("rolos_rooms") as any).select("id, property_id, room_number, room_name, floor, status, room_type_id").in("property_id", activePropertyIds);
    const typesQ = (supabase.from("rolos_room_types") as any).select("id, name, property_id").in("property_id", activePropertyIds);
    const activeTypesQ = (supabase.from("rolos_room_types") as any).select("id, name, property_id").in("property_id", activePropertyIds).eq("is_active", true);
    const tasksQ = (supabase.from("rolos_housekeeping_tasks") as any).select("id, room_id, task_type, priority, status, notes, assigned_to, rolos_rooms!inner(property_id)").in("rolos_rooms.property_id", activePropertyIds);
    const maintQ = (supabase.from("rolos_maintenance_requests") as any).select("id, room_id, property_id, issue_type, priority, description, status, estimated_cost, actual_cost, completion_notes, room_ready_confirmed, completed_date").in("property_id", activePropertyIds);
    // Current in-house bookings: only guests that have actually been checked in.
    const todayIso = new Date().toLocaleDateString("en-CA");
    const bookingsQ = (supabase.from("bookings") as any)
      .select("id, rolos_room_ids, guest_name, property_id, status, check_in_date, check_out_date, room_type_id")
      .in("property_id", activePropertyIds)
      .lte("check_in_date", todayIso)
      .gte("check_out_date", todayIso)
      .in("status", ["checked_in", "in_house"]);
    const requestedIdsKey = activePropertyIds.slice().sort().join(",");
    const [roomsRes, typesRes, activeTypesRes, tasksRes, maintRes, bookingsRes] = await Promise.all([roomsQ, typesQ, activeTypesQ, tasksQ, maintQ, bookingsQ]);

    // Stale-response guard: if the active scope has changed since we kicked
    // off this request, discard the result so a newer fetch wins.
    if (latestFetchKey.current !== requestedIdsKey) return;

    const rawInHouseBookings = (bookingsRes.data || []) as InHouseBooking[];
    const bookingIds = rawInHouseBookings.map((b) => b.id);
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

    const allFetchedRoomTypes = (typesRes.data || []) as RoomType[];
    const activeRoomTypes = (activeTypesRes.data || []) as RoomType[];
    setRoomTypes(activeRoomTypes.length ? activeRoomTypes : allFetchedRoomTypes);
    setHkTasks((tasksRes.data || []) as HKTask[]);
    setMaintenanceReqs((maintRes.data || []) as MaintenanceRequest[]);
    const fetchedRooms = (roomsRes.data || []) as Room[];
    const activeTypeIds = new Set(activeRoomTypes.map((t) => t.id));
    const visibleRooms = activeTypeIds.size > 0
      ? fetchedRooms.filter((room) => !room.room_type_id || activeTypeIds.has(room.room_type_id))
      : fetchedRooms;
    const assignedInHouseBookings = autoAssignBookings(
      rawInHouseBookings.map((booking) => {
        // Booking row wins; room lines only fill in stays with no unit of their own.
        const ownIds = booking.rolos_room_ids || [];
        if (ownIds.length) return booking;
        const linkedIds = linkedRoomIdsByBooking.get(booking.id) || [];
        return linkedIds.length ? { ...booking, rolos_room_ids: linkedIds } : booking;
      }),
      visibleRooms,
      allFetchedRoomTypes
    );
    setInHouseBookings(assignedInHouseBookings);

    const fallbackRoomTypes = activeRoomTypes.length ? activeRoomTypes : allFetchedRoomTypes;
    if (fetchedRooms.length === 0 && fallbackRoomTypes.length > 0 && !isPortfolio) {
      // Fallback: derive synthetic rooms from room types (single-property only)
      const syntheticRooms: Room[] = fallbackRoomTypes.map((rt) => ({
        id: `fallback-${rt.id}`,
        property_id: rt.property_id,
        room_number: rt.name,
        room_name: rt.name,
        floor: null,
        status: "available",
        room_type_id: rt.id,
      }));
      setRooms(syntheticRooms);
      setUsingFallback(true);
    } else {
      setRooms(visibleRooms);
      setUsingFallback(false);
    }
    setLoading(false);
  }, [activePropertyIds, isPortfolio, propertyLoading, autoDefaulted, properties.length]);

  // Track the most recently requested scope so stale responses can be dropped.
  const latestFetchKey = useRef<string>("");
  useEffect(() => {
    latestFetchKey.current = activePropertyIds.slice().sort().join(",");
    fetchAll();
  }, [fetchAll, activePropertyIds]);

  // Auto-refresh every 30s
  useEffect(() => {
    if (!propertyId) return;
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [propertyId, fetchAll]);

  // ── Helpers ───────────────────────────────────────────────────────────

  const roomLabel = (roomId: string) => {
    const r = rooms.find(rm => rm.id === roomId);
    return r ? r.room_number : "—";
  };

  const roomTypeName = (roomTypeId: string | null) => {
    if (!roomTypeId) return "";
    return roomTypes.find(rt => rt.id === roomTypeId)?.name || "";
  };

  // ── Actions ───────────────────────────────────────────────────────────

  const completeCleanTask = async (taskId: string) => {
    try {
      await callPmsApi("complete_housekeeping_task", { task_id: taskId });
      toast.success("Cleaning task completed — room available");
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const createMaintenanceDocket = async () => {
    const selectedRoom = rooms.find(r => r.id === docketRoomId);
    const targetPropertyId = selectedRoom?.property_id || propertyId;
    if (!targetPropertyId || !docketRoomId || !docketDescription.trim()) {
      toast.error("Room and description required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("rolos_maintenance_requests").insert({
        property_id: targetPropertyId,
        room_id: docketRoomId,
        issue_type: docketIssueType || null,
        priority: docketPriority,
        description: docketDescription.trim(),
        estimated_cost: docketEstCost ? parseFloat(docketEstCost) : null,
        status: "reported",
      });
      if (error) throw error;
      // Only set room to maintenance/out_of_order if user opted to mark unavailable
      if (docketMarkUnavailable) {
        await supabase.from("rolos_rooms").update({ status: "maintenance" }).eq("id", docketRoomId);
      }
      toast.success("Maintenance docket created");
      setShowCreateDocket(false);
      resetDocketForm();
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const resolveMaintenanceRequest = async () => {
    if (!resolveReq || !resolveNotes.trim()) {
      toast.error("Completion notes required");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.from("rolos_maintenance_requests").update({
        status: "resolved",
        completion_notes: resolveNotes.trim(),
        completed_date: new Date().toISOString(),
      }).eq("id", resolveReq.id);
      if (error) throw error;
      toast.success("Maintenance resolved — confirm room readiness below");
      setResolveReq(null);
      setResolveNotes("");
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
    setSaving(false);
  };

  const toggleRoomReady = async (req: MaintenanceRequest, checked: boolean) => {
    try {
      const { error } = await supabase.from("rolos_maintenance_requests").update({
        room_ready_confirmed: checked,
      }).eq("id", req.id);
      if (error) throw error;
      // Update room status based on checkbox
      if (req.room_id) {
        await supabase.from("rolos_rooms").update({
          status: checked ? "available" : "out_of_order",
        }).eq("id", req.room_id);
      }
      toast.success(checked ? "Room marked as ready" : "Room marked unavailable");
      fetchAll();
    } catch (e: any) { toast.error(e.message); }
  };

  const resetDocketForm = () => {
    setDocketRoomId("");
    setDocketIssueType("");
    setDocketPriority("normal");
    setDocketDescription("");
    setDocketEstCost("");
    setDocketMarkUnavailable(false);
  };

  // ── Derived data ──────────────────────────────────────────────────────

  const tasksForRoom = (roomId: string) => hkTasks.filter(t => t.room_id === roomId);
  const openMaintenanceForRoom = (roomId: string) =>
    maintenanceReqs.filter(m => m.room_id === roomId && (STATUSES_OPEN.includes(m.status || "") || (m.status === "resolved" && !m.room_ready_confirmed)));

  // Rooms currently occupied by a guest, derived from active bookings (not just rolos_rooms.status).
  const inHouseRoomIds = useMemo(() => {
    const s = new Set<string>();
    for (const b of inHouseBookings) for (const id of b.rolos_room_ids || []) if (id) s.add(id);
    return s;
  }, [inHouseBookings]);
  const guestForRoom = (roomId: string) => inHouseBookings.find(b => (b.rolos_room_ids || []).includes(roomId))?.guest_name || null;
  const isInHouse = (room: Room) => inHouseRoomIds.has(room.id);

  // Open the create-docket dialog pre-scoped to a given room.
  const openDocketForRoom = (roomId: string) => {
    resetDocketForm();
    setDocketRoomId(roomId);
    setShowCreateDocket(true);
  };

  // Property name lookup for the docket combobox grouping.
  const propertyName = (pid: string) => properties.find(p => p.id === pid)?.name || "Property";

  // ── Workload summary (drives the action cards + queue drawer) ─────────
  const CLOSED_TASK_STATUSES = ["completed", "cancelled", "verified"];
  const dirtyRoomsAll = useMemo(() => rooms.filter(r => r.status === "dirty"), [rooms]);
  const openTasksAll = useMemo(
    () => hkTasks.filter(t => !CLOSED_TASK_STATUSES.includes((t.status || "").toLowerCase())),
    [hkTasks]
  );
  const openDocketsAll = useMemo(
    () => maintenanceReqs.filter(m => STATUSES_OPEN.includes(m.status || "")),
    [maintenanceReqs]
  );
  const awaitingReadyAll = useMemo(
    () => maintenanceReqs.filter(m => m.status === "resolved" && !m.room_ready_confirmed),
    [maintenanceReqs]
  );
  const totalActions = dirtyRoomsAll.length + openDocketsAll.length + awaitingReadyAll.length;

  const markRoomClean = async (roomId: string) => {
    const { error } = await supabase.from("rolos_rooms").update({ status: "available" }).eq("id", roomId);
    if (error) { toast.error(error.message); return; }
    toast.success("Room marked clean");
    fetchAll();
  };

  const roomPropertyName = (roomId: string | null) => {
    const room = rooms.find(r => r.id === roomId);
    return room ? propertyName(room.property_id) : "";
  };



  // ── Render ────────────────────────────────────────────────────────────

  if (propertyLoading) return <PmsPageSkeleton rows={4} />;
  if (!isPortfolio && !propertyId) return <p className="text-muted-foreground">Select a property first.</p>;

  const propertySections = isPortfolio
    ? properties.map((p) => ({ id: p.id, name: p.name, rooms: rooms.filter((r) => r.property_id === p.id) }))
    : [{ id: propertyId!, name: properties.find((p) => p.id === propertyId)?.name || "", rooms }];

  return (
    <>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-bold tracking-tight">Housekeeping Board</h1>
          <div className="flex flex-wrap items-center gap-2">
            {properties.length > 1 && (
              <div className="flex items-center gap-1">
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToProperty(-1)} title="Previous property">
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <Select value={propertyId ?? undefined} onValueChange={(v) => switchProperty(v)}>
                  <SelectTrigger className="h-8 w-[220px]">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => goToProperty(1)} title="Next property">
                  <ChevronRight className="h-4 w-4" />
                </Button>
                <span className="text-xs text-muted-foreground ml-1">
                  {currentIndex >= 0 ? currentIndex + 1 : "—"} / {properties.length}
                </span>
              </div>
            )}
            {properties.length > 1 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === "portfolio" ? "single" : "portfolio")}
                title={viewMode === "portfolio" ? "Switch to single property" : "Switch to portfolio view"}
              >
                {viewMode === "portfolio" ? <Building2 className="h-4 w-4 mr-1" /> : <LayoutGrid className="h-4 w-4 mr-1" />}
                {viewMode === "portfolio" ? "Portfolio" : "Single"}
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={fetchAll} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />Refresh
            </Button>
            <Button size="sm" onClick={() => setShowCreateDocket(true)}>
              <Plus className="h-4 w-4 mr-1" />Maintenance Docket
            </Button>
          </div>
        </div>

        {/* Fallback banner */}
        {usingFallback && (
          <Card className="border-warning-border bg-warning-surface dark:bg-amber-950/20 dark:border-amber-800">
            <CardContent className="py-3 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning shrink-0" />
              <p className="text-xs text-warning dark:text-amber-400">No physical rooms configured. Showing room types as fallback. Add rooms in the Room Inventory page for full housekeeping tracking.</p>
            </CardContent>
          </Card>
        )}

        {/* Action cards — click through to the due items */}
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-3">
          {[
            {
              key: "total" as const,
              label: "Jobs outstanding",
              value: totalActions,
              hint: "All actions & reviews",
              icon: LayoutGrid,
              tone: "text-foreground",
              onClick: () => setQueue(totalActions > 0 ? "clean" : null),
            },
            {
              key: "clean" as const,
              label: "Rooms to clean",
              value: dirtyRoomsAll.length,
              hint: "Marked dirty",
              icon: Sparkles,
              tone: "text-warning",
              onClick: () => setQueue("clean"),
            },
            {
              key: "tasks" as const,
              label: "Cleaning tasks",
              value: openTasksAll.length,
              hint: "Assigned & open",
              icon: CheckCircle,
              tone: "text-info",
              onClick: () => setQueue("tasks"),
            },
            {
              key: "maintenance" as const,
              label: "Open dockets",
              value: openDocketsAll.length,
              hint: "Maintenance to fix",
              icon: Wrench,
              tone: "text-destructive",
              onClick: () => setQueue("maintenance"),
            },
            {
              key: "ready" as const,
              label: "To review",
              value: awaitingReadyAll.length,
              hint: "Confirm room ready",
              icon: ShieldCheck,
              tone: "text-success",
              onClick: () => setQueue("ready"),
            },
          ].map((card) => (
            <Card
              key={card.key}
              role="button"
              tabIndex={0}
              onClick={card.onClick}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); card.onClick(); } }}
              className={cn(
                "cursor-pointer transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                card.value > 0 && card.key !== "total" && "border-l-4",
                card.value > 0 && card.key === "clean" && "border-l-amber-500",
                card.value > 0 && card.key === "tasks" && "border-l-blue-500",
                card.value > 0 && card.key === "maintenance" && "border-l-destructive",
                card.value > 0 && card.key === "ready" && "border-l-emerald-500"
              )}
            >
              <CardContent className="py-3 space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground truncate">{card.label}</span>
                  <card.icon className={cn("h-4 w-4 shrink-0", card.tone)} />
                </div>
                <p className={cn("text-2xl font-bold leading-none", card.value > 0 ? card.tone : "text-muted-foreground")}>{card.value}</p>
                <p className="text-[11px] text-muted-foreground">{card.hint}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Per-property boards */}
        {propertySections.map((section) => {
          const dirtyRooms = section.rooms.filter(r => r.status === "dirty");
          const sectionRoomIds = new Set(section.rooms.map(r => r.id));
          const maintenanceRooms = section.rooms.filter(r =>
            r.status === "maintenance" || r.status === "out_of_order" || openMaintenanceForRoom(r.id).length > 0
          );
          const maintenanceRoomIds = new Set(maintenanceRooms.map(r => r.id));
          // Dockets attributed to this property but whose room_id is missing/stale (e.g. deleted unit).
          const orphanedDockets = maintenanceReqs.filter(m =>
            (m.property_id === section.id || !m.property_id) &&
            (STATUSES_OPEN.includes(m.status || "") || (m.status === "resolved" && !m.room_ready_confirmed)) &&
            (!m.room_id || !sectionRoomIds.has(m.room_id))
          );
          const occupiedRooms = section.rooms.filter(r => isInHouse(r) && r.status !== "dirty");
          const cleanRooms = section.rooms.filter(r => ["available", "occupied"].includes(r.status) && !inHouseRoomIds.has(r.id) && !maintenanceRoomIds.has(r.id));
          return (
        <div key={section.id} className="space-y-3">
          {isPortfolio && (
            <div className="flex items-center gap-2 sticky top-0 z-10 bg-background/95 backdrop-blur py-2 border-b">
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <h2 className="text-lg font-semibold">{section.name}</h2>
              <Badge variant="outline" className="text-xs">{section.rooms.length} rooms</Badge>
            </div>
          )}
        <div className="grid md:grid-cols-2 xl:grid-cols-4 gap-6">

          {/* ─── Needs Cleaning ─────────────────────── */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => toggleCol(`${section.id}:dirty`)}
              className="w-full flex items-center justify-between font-semibold text-warning"
            >
              <span className="flex items-center gap-2"><Sparkles className="h-4 w-4" /> Needs Cleaning ({dirtyRooms.length})</span>
              {isColOpen(`${section.id}:dirty`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {isColOpen(`${section.id}:dirty`) && (<>
            {dirtyRooms.map(room => {
              const tasks = tasksForRoom(room.id);
              const openDockets = openMaintenanceForRoom(room.id);
              return (
                <Card key={room.id} className={`border-l-4 ${STATUS_BORDER[room.status]}`}>
                  <CardContent className="py-3 space-y-2">
                    <div
                      className="flex items-center justify-between cursor-pointer rounded -mx-1 px-1 py-0.5 hover:bg-muted/60"
                      role="button"
                      tabIndex={0}
                      title="Add a maintenance docket for this room"
                      onClick={() => openDocketForRoom(room.id)}
                    >
                      <div>
                        <p className="font-bold">{room.room_number}</p>
                        <p className="text-xs text-muted-foreground">{roomTypeName(room.room_type_id)}</p>
                      </div>
                      <Badge variant="outline" className="text-xs text-warning border-warning-border">dirty</Badge>
                    </div>
                    {/* Active cleaning tasks */}
                    {tasks.map(task => (
                      <div key={task.id} className="flex items-center justify-between gap-2 pt-1 border-t border-border">
                        <div className="text-xs">
                          <Badge variant="outline" className="text-xs mr-1">{task.task_type}</Badge>
                          <Badge className={`text-xs ${PRIORITY_BADGE[task.priority] || ""}`}>{task.priority}</Badge>
                        </div>
                        <Button size="sm" variant="outline" onClick={() => completeCleanTask(task.id)}>
                          <CheckCircle className="h-3 w-3 mr-1" />Done
                        </Button>
                      </div>
                    ))}
                    {tasks.length === 0 && (
                      <div className="flex items-center justify-between pt-1 border-t border-border">
                        <p className="text-xs text-muted-foreground italic">No active task — room marked dirty</p>
                        <Button size="sm" variant="outline" onClick={async () => {
                          const { error } = await supabase.from("rolos_rooms").update({ status: "available" }).eq("id", room.id);
                          if (error) { toast.error(error.message); return; }
                          toast.success("Room marked clean");
                          fetchAll();
                        }}>
                          <CheckCircle className="h-3 w-3 mr-1" />Mark Clean
                        </Button>
                      </div>
                    )}
                    {/* Open maintenance dockets on dirty rooms */}
                    {openDockets.map(req => (
                      <div key={req.id} className="border-t border-border pt-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                          <span className="text-xs font-medium capitalize">{req.issue_type || "General"}</span>
                          {req.priority && (
                            <Badge className={`text-xs ${PRIORITY_BADGE[req.priority] || ""}`}>{req.priority}</Badge>
                          )}
                          <Badge variant="outline" className="text-xs ml-auto">{req.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{req.description}</p>
                        {req.status === "resolved" && (
                          <div className="bg-muted/50 p-2 rounded space-y-1.5">
                            {req.completion_notes && (
                              <p className="text-xs"><span className="font-medium">Notes:</span> {req.completion_notes}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`ready-dirty-${req.id}`}
                                checked={req.room_ready_confirmed}
                                onCheckedChange={(checked) => toggleRoomReady(req, !!checked)}
                              />
                              <Label htmlFor={`ready-dirty-${req.id}`} className="text-xs cursor-pointer flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" /> Room ready after repairs
                              </Label>
                            </div>
                          </div>
                        )}
                        {STATUSES_OPEN.includes(req.status || "") && (
                          <Button size="sm" variant="outline" className="w-full" onClick={() => { setResolveReq(req); setResolveNotes(""); }}>
                            <CheckCircle className="h-3 w-3 mr-1" />Mark Resolved
                          </Button>
                        )}
                      </div>
                    ))}
                    {/* Report issue button for dirty rooms */}
                    <Button size="sm" variant="ghost" className="w-full text-xs" onClick={() => { setDocketRoomId(room.id); setShowCreateDocket(true); }}>
                      <Plus className="h-3 w-3 mr-1" />Report Issue
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
            {dirtyRooms.length === 0 && <p className="text-sm text-muted-foreground">All clean!</p>}
            </>)}
          </div>

          {/* ─── Maintenance ────────────────────────── */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => toggleCol(`${section.id}:maint`)}
              className="w-full flex items-center justify-between font-semibold text-destructive"
            >
              <span className="flex items-center gap-2"><Wrench className="h-4 w-4" /> Maintenance ({maintenanceRooms.length + (orphanedDockets.length > 0 ? 1 : 0)})</span>
              {isColOpen(`${section.id}:maint`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {isColOpen(`${section.id}:maint`) && (<>
            {orphanedDockets.length > 0 && (
              <Card className="border-l-4 border-l-destructive">
                <CardContent className="py-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold text-sm">Unlinked dockets</p>
                      <p className="text-xs text-muted-foreground">Docket's room no longer exists</p>
                    </div>
                    <Badge variant="destructive" className="text-xs">{orphanedDockets.length}</Badge>
                  </div>
                  {orphanedDockets.map(req => (
                    <div key={req.id} className="border-t border-border pt-2 space-y-1.5">
                      <div className="flex items-center gap-1.5">
                        <AlertTriangle className="h-3 w-3 text-destructive" />
                        <span className="text-xs font-medium capitalize">{req.issue_type || "General"}</span>
                        {req.priority && (
                          <Badge className={`text-xs ${PRIORITY_BADGE[req.priority] || ""}`}>{req.priority}</Badge>
                        )}
                        <Badge variant="outline" className="text-xs ml-auto">{req.status}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">{req.description}</p>
                      {STATUSES_OPEN.includes(req.status || "") && (
                        <Button size="sm" variant="outline" className="w-full" onClick={() => { setResolveReq(req); setResolveNotes(""); }}>
                          <CheckCircle className="h-3 w-3 mr-1" />Mark Resolved
                        </Button>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
            {maintenanceRooms.map(room => {
              const reqs = openMaintenanceForRoom(room.id);
              return (
                <Card key={room.id} className={`border-l-4 ${STATUS_BORDER[room.status]}`}>
                  <CardContent className="py-3 space-y-2">
                    <div
                      className="flex items-center justify-between cursor-pointer rounded -mx-1 px-1 py-0.5 hover:bg-muted/60"
                      role="button"
                      tabIndex={0}
                      title="Add another docket for this room"
                      onClick={() => openDocketForRoom(room.id)}
                    >
                      <div>
                        <p className="font-bold">{room.room_number}</p>
                        <p className="text-xs text-muted-foreground">{roomTypeName(room.room_type_id)}</p>
                      </div>
                      <Badge variant="destructive" className="text-xs">{room.status}</Badge>
                    </div>
                    {reqs.map(req => (
                      <div key={req.id} className="border-t border-border pt-2 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <AlertTriangle className="h-3 w-3 text-destructive" />
                          <span className="text-xs font-medium capitalize">{req.issue_type || "General"}</span>
                          {req.priority && (
                            <Badge className={`text-xs ${PRIORITY_BADGE[req.priority] || ""}`}>{req.priority}</Badge>
                          )}
                          <Badge variant="outline" className="text-xs ml-auto">{req.status}</Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{req.description}</p>
                        {req.estimated_cost != null && (
                          <p className="text-xs text-muted-foreground">Est. cost: ${req.estimated_cost.toFixed(2)}</p>
                        )}

                        {/* Resolved: show completion notes + room ready checkbox */}
                        {req.status === "resolved" && (
                          <div className="bg-muted/50 p-2 rounded space-y-1.5">
                            {req.completion_notes && (
                              <p className="text-xs"><span className="font-medium">Notes:</span> {req.completion_notes}</p>
                            )}
                            <div className="flex items-center gap-2">
                              <Checkbox
                                id={`ready-${req.id}`}
                                checked={req.room_ready_confirmed}
                                onCheckedChange={(checked) => toggleRoomReady(req, !!checked)}
                              />
                              <Label htmlFor={`ready-${req.id}`} className="text-xs cursor-pointer flex items-center gap-1">
                                <ShieldCheck className="h-3 w-3" /> Room ready after repairs
                              </Label>
                            </div>
                          </div>
                        )}

                        {/* Open: show resolve button */}
                        {STATUSES_OPEN.includes(req.status || "") && (
                          <Button size="sm" variant="outline" className="w-full" onClick={() => { setResolveReq(req); setResolveNotes(""); }}>
                            <CheckCircle className="h-3 w-3 mr-1" />Mark Resolved
                          </Button>
                        )}
                      </div>
                    ))}
                    {reqs.length === 0 && (
                      <p className="text-xs text-muted-foreground italic">No open dockets</p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {maintenanceRooms.length === 0 && orphanedDockets.length === 0 && <p className="text-sm text-muted-foreground">No issues.</p>}
            </>)}
          </div>

          {/* ─── In House (Occupied) ───────────────── */}
          <div className="space-y-3">
            <button
              type="button"
              onClick={() => toggleCol(`${section.id}:inhouse`)}
              className="w-full flex items-center justify-between font-semibold text-info"
            >
              <span className="flex items-center gap-2"><BedDouble className="h-4 w-4" /> In House ({occupiedRooms.length})</span>
              {isColOpen(`${section.id}:inhouse`) ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            {isColOpen(`${section.id}:inhouse`) && (<>
            {occupiedRooms.map(room => {
              const guest = guestForRoom(room.id);
              return (
                <Card
                  key={room.id}
                  className="border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => openDocketForRoom(room.id)}
                  role="button"
                  tabIndex={0}
                  title="Log a maintenance docket for this in-house room"
                >
                  <CardContent className="py-3 space-y-1.5">
                    <div className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="font-bold truncate">{room.room_number}</p>
                        <p className="text-xs text-muted-foreground truncate">{roomTypeName(room.room_type_id)}</p>
                        {guest && <p className="text-xs text-info dark:text-blue-300 truncate">Guest: {guest}</p>}
                      </div>
                      <Badge className="text-xs bg-blue-500/20 text-info dark:text-blue-300 border border-blue-500/40">in house</Badge>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {occupiedRooms.length === 0 && <p className="text-sm text-muted-foreground">No guests in house.</p>}
            </>)}
          </div>

          {/* ─── Ready ──────────────────────────────── */}

          {(() => {
            const expanded = !!readyExpanded[section.id];
            // Always show rooms with open dockets in full — they need attention.
            const readyWithDockets = cleanRooms.filter(r => openMaintenanceForRoom(r.id).length > 0);
            const readyClean = cleanRooms.filter(r => openMaintenanceForRoom(r.id).length === 0);
            return (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="font-semibold text-success flex items-center gap-2">
                    <ShieldCheck className="h-4 w-4" /> Ready ({cleanRooms.length})
                  </h2>
                  {readyClean.length > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setReadyExpanded(prev => ({ ...prev, [section.id]: !expanded }))}
                    >
                      {expanded ? <><ChevronUp className="h-3 w-3 mr-1" />Collapse</> : <><ChevronDown className="h-3 w-3 mr-1" />Expand</>}
                    </Button>
                  )}
                </div>

                {/* Always-full cards for ready rooms that still have open dockets */}
                {readyWithDockets.map(room => {
                  const openDockets = openMaintenanceForRoom(room.id);
                  return (
                    <Card key={room.id} className={`border-l-4 ${STATUS_BORDER[room.status]}`}>
                      <CardContent className="py-3 space-y-1.5">
                        <div
                          className="cursor-pointer rounded -mx-1 px-1 py-0.5 hover:bg-muted/60"
                          role="button"
                          tabIndex={0}
                          title="Add another docket for this room"
                          onClick={() => openDocketForRoom(room.id)}
                        >
                          <p className="font-bold">{room.room_number}</p>
                          <p className="text-xs text-muted-foreground">{roomTypeName(room.room_type_id)}</p>
                        </div>
                        <div className="mt-1 space-y-2">
                          <div className="flex items-center gap-1.5 bg-warning-surface dark:bg-amber-950/30 border border-warning-border dark:border-amber-800 rounded p-1.5">
                            <AlertTriangle className="h-3 w-3 text-warning shrink-0" />
                            <span className="text-xs text-warning dark:text-amber-400">
                              {openDockets.length} open docket{openDockets.length > 1 ? "s" : ""}
                            </span>
                          </div>
                          {openDockets.map(req => (
                            <div key={req.id} className="border-t border-border pt-2 space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <AlertTriangle className="h-3 w-3 text-destructive" />
                                <span className="text-xs font-medium capitalize">{req.issue_type || "General"}</span>
                                {req.priority && (
                                  <Badge className={`text-xs ${PRIORITY_BADGE[req.priority] || ""}`}>{req.priority}</Badge>
                                )}
                                <Badge variant="outline" className="text-xs ml-auto">{req.status}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground">{req.description}</p>
                              {req.status === "resolved" && (
                                <div className="bg-muted/50 p-2 rounded space-y-1.5">
                                  {req.completion_notes && (
                                    <p className="text-xs"><span className="font-medium">Notes:</span> {req.completion_notes}</p>
                                  )}
                                  <div className="flex items-center gap-2">
                                    <Checkbox
                                      id={`ready-clean-${req.id}`}
                                      checked={req.room_ready_confirmed}
                                      onCheckedChange={(checked) => toggleRoomReady(req, !!checked)}
                                    />
                                    <Label htmlFor={`ready-clean-${req.id}`} className="text-xs cursor-pointer flex items-center gap-1">
                                      <ShieldCheck className="h-3 w-3" /> Room ready after repairs
                                    </Label>
                                  </div>
                                </div>
                              )}
                              {STATUSES_OPEN.includes(req.status || "") && (
                                <Button size="sm" variant="outline" className="w-full" onClick={() => { setResolveReq(req); setResolveNotes(""); }}>
                                  <CheckCircle className="h-3 w-3 mr-1" />Mark Resolved
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}

                {/* Collapsed compact view for clean-and-clear ready rooms */}
                {readyClean.length > 0 && !expanded && (
                  <Card className="border-l-4 border-l-emerald-500">
                    <CardContent className="py-3">
                      <p className="text-xs text-muted-foreground mb-2">
                        {readyClean.length} room{readyClean.length === 1 ? "" : "s"} clean &amp; ready
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {readyClean.map(room => (
                          <Badge
                            key={room.id}
                            variant="outline"
                            className="text-xs font-medium border-success-border text-success dark:text-emerald-400 cursor-pointer hover:bg-emerald-500/10"
                            title={`${roomTypeName(room.room_type_id)} — click to add a maintenance docket`}
                            onClick={() => openDocketForRoom(room.id)}
                            role="button"
                            tabIndex={0}
                          >
                            {room.room_number}
                          </Badge>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Expanded — original full card per ready room */}
                {readyClean.length > 0 && expanded && readyClean.map(room => (
                  <Card
                    key={room.id}
                    className={`border-l-4 ${STATUS_BORDER[room.status]} cursor-pointer hover:shadow-md transition-shadow`}
                    onClick={() => openDocketForRoom(room.id)}
                    role="button"
                    tabIndex={0}
                    title="Add a maintenance docket for this room"
                  >
                    <CardContent className="py-3 space-y-1.5">
                      <p className="font-bold">{room.room_number}</p>
                      <p className="text-xs text-muted-foreground">{roomTypeName(room.room_type_id)}</p>
                    </CardContent>
                  </Card>
                ))}

                {cleanRooms.length === 0 && <p className="text-sm text-muted-foreground">No ready rooms.</p>}
              </div>
            );
          })()}
        </div>

        </div>
          );
        })}
      </div>

      {/* ─── Create Maintenance Docket Dialog ────────────────────────────── */}
      <Dialog open={showCreateDocket} onOpenChange={setShowCreateDocket}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Maintenance Docket</DialogTitle>
            <DialogDescription>Log a maintenance issue for a room. The room stays available unless you mark it unavailable.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Room *</Label>
              {(() => {
                const selected = rooms.find(r => r.id === docketRoomId);
                const selectedLabel = selected
                  ? `${propertyName(selected.property_id)} · ${selected.room_number}${selected.room_name ? ` — ${selected.room_name}` : ""}`
                  : "Select room";
                const grouped = propertySections
                  .map(s => ({ ...s, rooms: [...s.rooms].sort((a, b) => a.room_number.localeCompare(b.room_number, undefined, { numeric: true })) }))
                  .filter(s => s.rooms.length > 0);
                return (
                  <Popover open={docketRoomSearchOpen} onOpenChange={setDocketRoomSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" role="combobox" aria-expanded={docketRoomSearchOpen} className="w-full justify-between font-normal">
                        <span className={docketRoomId ? "" : "text-muted-foreground"}>{selectedLabel}</span>
                        <ChevronsUpDown className="h-4 w-4 opacity-50 ml-2 shrink-0" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                      <Command>
                        <CommandInput placeholder="Search property or room…" />
                        <CommandList>
                          <CommandEmpty>No room found.</CommandEmpty>
                          {grouped.map(section => (
                            <CommandGroup key={section.id} heading={section.name}>
                              {section.rooms.map(r => {
                                const label = `${r.room_number}${r.room_name ? ` — ${r.room_name}` : ""}`;
                                return (
                                  <CommandItem
                                    key={r.id}
                                    value={`${section.name} ${label} ${roomTypeName(r.room_type_id)}`}
                                    onSelect={() => { setDocketRoomId(r.id); setDocketRoomSearchOpen(false); }}
                                  >
                                    <Check className={`mr-2 h-4 w-4 ${docketRoomId === r.id ? "opacity-100" : "opacity-0"}`} />
                                    <div className="flex flex-col">
                                      <span>{label}</span>
                                      <span className="text-xs text-muted-foreground">{roomTypeName(r.room_type_id)}</span>
                                    </div>
                                  </CommandItem>
                                );
                              })}
                            </CommandGroup>
                          ))}
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                );
              })()}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Issue Type</Label>
                <Select value={docketIssueType} onValueChange={setDocketIssueType}>
                  <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                  <SelectContent>
                    {ISSUE_TYPES.map(t => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={docketPriority} onValueChange={setDocketPriority}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map(p => <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Description *</Label>
              <Textarea value={docketDescription} onChange={e => setDocketDescription(e.target.value)} placeholder="Describe the issue…" />
            </div>
            <div>
              <Label>Estimated Cost</Label>
              <Input type="number" step="0.01" value={docketEstCost} onChange={e => setDocketEstCost(e.target.value)} placeholder="0.00" />
            </div>
            <div className="flex items-center gap-2 pt-2 border-t border-border">
              <Checkbox
                id="docket-mark-unavailable"
                checked={docketMarkUnavailable}
                onCheckedChange={(checked) => setDocketMarkUnavailable(!!checked)}
              />
              <Label htmlFor="docket-mark-unavailable" className="text-sm cursor-pointer">
                Mark room as unavailable (takes room offline)
              </Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDocket(false); resetDocketForm(); }}>Cancel</Button>
            <Button onClick={createMaintenanceDocket} disabled={saving}>{saving ? "Saving…" : "Create Docket"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Resolve Maintenance Dialog ──────────────────────────────────── */}
      <Dialog open={!!resolveReq} onOpenChange={(open) => { if (!open) setResolveReq(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve Maintenance — Room {resolveReq?.room_id ? roomLabel(resolveReq.room_id) : ""}</DialogTitle>
            <DialogDescription>Provide completion notes. After resolving, use the "Room Ready" checkbox to confirm the room is usable.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {resolveReq && (
              <div className="text-sm">
                <p><span className="font-medium">Issue:</span> {resolveReq.issue_type || "General"} — {resolveReq.description}</p>
              </div>
            )}
            <div>
              <Label>Completion Notes *</Label>
              <Textarea value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} placeholder="What was done to fix the issue…" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveReq(null)}>Cancel</Button>
            <Button onClick={resolveMaintenanceRequest} disabled={saving || !resolveNotes.trim()}>
              {saving ? "Saving…" : "Mark Resolved"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Action queue drawer (from the top action cards) ─────────────── */}
      <Dialog open={!!queue} onOpenChange={(open) => { if (!open) setQueue(null); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {queue === "clean" && `Rooms to clean (${dirtyRoomsAll.length})`}
              {queue === "tasks" && `Cleaning tasks (${openTasksAll.length})`}
              {queue === "maintenance" && `Open maintenance dockets (${openDocketsAll.length})`}
              {queue === "ready" && `Awaiting room-ready review (${awaitingReadyAll.length})`}
            </DialogTitle>
            <DialogDescription>Action each item directly from here — the board refreshes automatically.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap gap-2 pb-2 border-b border-border">
            {([
              ["clean", `To clean ${dirtyRoomsAll.length}`],
              ["tasks", `Tasks ${openTasksAll.length}`],
              ["maintenance", `Dockets ${openDocketsAll.length}`],
              ["ready", `Review ${awaitingReadyAll.length}`],
            ] as const).map(([k, label]) => (
              <Button key={k} size="sm" variant={queue === k ? "default" : "outline"} className="h-7 text-xs" onClick={() => setQueue(k)}>
                {label}
              </Button>
            ))}
          </div>

          <div className="space-y-2">
            {queue === "clean" && (dirtyRoomsAll.length === 0
              ? <p className="text-sm text-muted-foreground">Nothing to clean — all rooms are ready.</p>
              : dirtyRoomsAll.map(room => (
                <div key={room.id} className="flex items-center justify-between gap-3 border border-border rounded-md p-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{room.room_number}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {roomTypeName(room.room_type_id)}{isPortfolio ? ` · ${propertyName(room.property_id)}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button size="sm" variant="ghost" className="text-xs" onClick={() => { setQueue(null); openDocketForRoom(room.id); }}>
                      <Plus className="h-3 w-3 mr-1" />Issue
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => markRoomClean(room.id)}>
                      <CheckCircle className="h-3 w-3 mr-1" />Mark clean
                    </Button>
                  </div>
                </div>
              )))}

            {queue === "tasks" && (openTasksAll.length === 0
              ? <p className="text-sm text-muted-foreground">No open cleaning tasks.</p>
              : openTasksAll.map(task => (
                <div key={task.id} className="flex items-center justify-between gap-3 border border-border rounded-md p-2">
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">Room {roomLabel(task.room_id)}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Badge variant="outline" className="text-xs">{task.task_type}</Badge>
                      <Badge className={cn("text-xs", PRIORITY_BADGE[task.priority] || "")}>{task.priority}</Badge>
                      <Badge variant="outline" className="text-xs">{task.status}</Badge>
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => completeCleanTask(task.id)}>
                    <CheckCircle className="h-3 w-3 mr-1" />Done
                  </Button>
                </div>
              )))}

            {queue === "maintenance" && (openDocketsAll.length === 0
              ? <p className="text-sm text-muted-foreground">No open dockets.</p>
              : openDocketsAll.map(req => (
                <div key={req.id} className="border border-border rounded-md p-2 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="h-3 w-3 text-destructive shrink-0" />
                    <span className="text-sm font-medium capitalize">{req.issue_type || "General"}</span>
                    {req.priority && <Badge className={cn("text-xs", PRIORITY_BADGE[req.priority] || "")}>{req.priority}</Badge>}
                    <Badge variant="outline" className="text-xs ml-auto">{req.status}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Room {req.room_id ? roomLabel(req.room_id) : "—"}
                    {isPortfolio ? ` · ${roomPropertyName(req.room_id) || (req.property_id ? propertyName(req.property_id) : "")}` : ""}
                  </p>
                  <p className="text-xs">{req.description}</p>
                  <Button size="sm" variant="outline" className="w-full" onClick={() => { setQueue(null); setResolveReq(req); setResolveNotes(""); }}>
                    <CheckCircle className="h-3 w-3 mr-1" />Mark resolved
                  </Button>
                </div>
              )))}

            {queue === "ready" && (awaitingReadyAll.length === 0
              ? <p className="text-sm text-muted-foreground">Nothing awaiting review.</p>
              : awaitingReadyAll.map(req => (
                <div key={req.id} className="border border-border rounded-md p-2 space-y-1.5">
                  <p className="text-sm font-medium">
                    Room {req.room_id ? roomLabel(req.room_id) : "—"}
                    <span className="text-xs text-muted-foreground font-normal"> — {req.issue_type || "General"}</span>
                  </p>
                  {req.completion_notes && <p className="text-xs text-muted-foreground">Notes: {req.completion_notes}</p>}
                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`queue-ready-${req.id}`}
                      checked={req.room_ready_confirmed}
                      onCheckedChange={(checked) => toggleRoomReady(req, !!checked)}
                    />
                    <Label htmlFor={`queue-ready-${req.id}`} className="text-xs cursor-pointer flex items-center gap-1">
                      <ShieldCheck className="h-3 w-3" /> Room ready after repairs
                    </Label>
                  </div>
                </div>
              )))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setQueue(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

