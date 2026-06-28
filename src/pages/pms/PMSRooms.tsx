import { useEffect, useState, useCallback, useMemo } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, BedDouble, RefreshCw, Pencil, Trash2, ChevronLeft, ChevronRight, LayoutGrid, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { syncRolosRoomTypesFromOverview } from "@/lib/pmsRoomTypeSync";
import { autoAssignBookings } from "@/lib/bookingAssignment";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  occupied: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  dirty: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  maintenance: "bg-red-500/10 text-red-700 border-red-500/20",
  out_of_order: "bg-destructive/10 text-destructive border-destructive/20",
};

interface RoomType { id: string; name: string; property_id: string; }

interface ActiveBooking {
  id: string;
  guest_name: string | null;
  property_id: string | null;
  check_in_date: string;
  check_out_date: string;
  status: string;
  room_type_id: string | null;
  rolos_room_ids: string[] | null;
}

interface Room {
  id: string;
  property_id: string;
  room_number: string;
  room_name: string | null;
  floor: number | null;
  status: string;
  max_occupancy: number | null;
  room_type_id: string | null;
  room_type_name?: string;
}

type ViewMode = "portfolio" | "single";

type RoomForm = { room_number: string; room_name: string; floor: string; room_type_id: string; max_occupancy: string };
const emptyForm: RoomForm = { room_number: "", room_name: "", floor: "", room_type_id: "", max_occupancy: "" };

export default function PMSRooms() {
  const { propertyId, properties, switchProperty, loading: propertyLoading } = usePmsPropertyId();
  const [viewMode, setViewMode] = useState<ViewMode>("single");
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
  const [activeBookings, setActiveBookings] = useState<ActiveBooking[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [form, setForm] = useState<RoomForm>(emptyForm);
  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null);

  // Auto-sync room types from the true Property Overview source for every
  // property currently in scope (single OR portfolio view). Without this,
  // properties never opened individually had no rolos_room_types / rolos_rooms
  // hydrated and the portfolio grid appeared empty for them.
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
              .select("room_type_id")
              .eq("property_id", pid);

            const hasPhysical = new Set(
              (existingPhysical || []).map((room) => room.room_type_id).filter(Boolean)
            );
            const missingPhysical = allRolosTypes.filter((roomType) => !hasPhysical.has(roomType.id));

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

    const today = new Date().toLocaleDateString("en-CA");
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
        .select("id, guest_name, check_in_date, check_out_date, status, room_type_id, rolos_room_ids, property_id")
        .in("property_id", activePropertyIds)
        .lte("check_in_date", today)
        .gt("check_out_date", today)
        .in("status", ["confirmed", "checked_in", "in_house"]),
    ]);

    const types = (typesRes.data || []) as RoomType[];
    setRoomTypes(types);

    const activeTypeIds = new Set(types.map((t) => t.id));
    const typeMap = new Map(types.map((t) => [t.id, t.name]));

    const visibleRooms = ((roomsRes.data || []) as any[])
      .filter((r: any) => !r.room_type_id || activeTypeIds.has(r.room_type_id))
      .map((r: any) => ({
        ...r,
        room_type_name: r.room_type_id ? typeMap.get(r.room_type_id) : undefined,
      }));
    setRooms(visibleRooms);

    const assignedBookings = autoAssignBookings(
      ((bookingsRes.data || []) as ActiveBooking[]),
      visibleRooms,
      ((allTypesRes.data || types) as RoomType[])
    );
    setActiveBookings(assignedBookings);
    setLoading(false);
  }, [activePropertyIds, syncRoomTypesFromOverview]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const openCreateDialog = () => {
    setEditingRoom(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEditDialog = (room: Room) => {
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

  if (propertyLoading) return <p className="text-muted-foreground">Loading property…</p>;
  if (!propertyId && !isPortfolio) return <p className="text-muted-foreground">Select a property first.</p>;

  const currentIdx = properties.findIndex((p) => p.id === propertyId);
  const canCycle = !isPortfolio && properties.length > 1;
  const goPrev = () => {
    if (!canCycle) return;
    const next = properties[(currentIdx - 1 + properties.length) % properties.length];
    if (next) switchProperty(next.id);
  };
  const goNext = () => {
    if (!canCycle) return;
    const next = properties[(currentIdx + 1) % properties.length];
    if (next) switchProperty(next.id);
  };

  // Group rooms & types per property for portfolio mode
  const propertySections = isPortfolio
    ? properties.map((p) => ({
        property: p,
        rooms: rooms.filter((r) => r.property_id === p.id),
        roomTypes: roomTypes.filter((t) => t.property_id === p.id),
      }))
    : [{
        property: properties.find((p) => p.id === propertyId) || { id: propertyId!, name: "" },
        rooms,
        roomTypes,
      }];

  const activeBookingForRoom = (roomId: string) =>
    activeBookings.find((booking) => (booking.rolos_room_ids || []).includes(roomId));

  const displayStatusForRoom = (room: Room) => {
    const hasActiveBooking = !!activeBookingForRoom(room.id);
    if (hasActiveBooking && !["maintenance", "out_of_order", "out_of_service"].includes(room.status)) return "occupied";
    return room.status;
  };

  const renderRoomGrid = (items: Room[]) => (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
      {items.map((room) => {
        const displayStatus = displayStatusForRoom(room);
        const activeBooking = activeBookingForRoom(room.id);
        return (
        <Card key={room.id} className="relative group">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-bold">{room.room_number}</CardTitle>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEditDialog(room)}>
                  <Pencil className="h-3 w-3" />
                </Button>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => setDeleteRoom(room)}>
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </div>
            {room.room_name && <p className="text-xs text-muted-foreground">{room.room_name}</p>}
          </CardHeader>
          <CardContent className="space-y-2">
            <Badge className={STATUS_COLORS[displayStatus] || ""} variant="outline">{displayStatus}</Badge>
            {activeBooking?.guest_name && <p className="text-xs text-blue-700 dark:text-blue-300 truncate">Guest: {activeBooking.guest_name}</p>}
            {room.room_type_name && <p className="text-xs text-muted-foreground">{room.room_type_name}</p>}
            <Select value={displayStatus} onValueChange={(v) => handleStatusChange(room.id, v)}>
              <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.keys(STATUS_COLORS).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Room Inventory</h1>
            <p className="text-sm text-muted-foreground">
              {isPortfolio
                ? `Portfolio view — ${properties.length} properties`
                : "Physical rooms linked to room types from Property Overview."}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {properties.length > 1 && (
              <div className="inline-flex rounded-md border border-border overflow-hidden">
                <Button
                  variant={isPortfolio ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none h-9"
                  onClick={() => setViewMode("portfolio")}
                >
                  <LayoutGrid className="h-4 w-4 mr-1" />Portfolio
                </Button>
                <Button
                  variant={!isPortfolio ? "default" : "ghost"}
                  size="sm"
                  className="rounded-none h-9"
                  onClick={() => setViewMode("single")}
                >
                  <Building2 className="h-4 w-4 mr-1" />Single
                </Button>
              </div>
            )}
            {!isPortfolio && properties.length > 0 && (
              <div className="flex items-center gap-1">
                {canCycle && (
                  <Button variant="outline" size="icon" className="h-9 w-9" onClick={goPrev} aria-label="Previous property">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                )}
                <Select value={propertyId ?? undefined} onValueChange={(v) => switchProperty(v)}>
                  <SelectTrigger className="h-9 min-w-[220px]">
                    <SelectValue placeholder="Select property" />
                  </SelectTrigger>
                  <SelectContent>
                    {properties.map((p) => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {canCycle && (
                  <>
                    <Button variant="outline" size="icon" className="h-9 w-9" onClick={goNext} aria-label="Next property">
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <span className="text-xs text-muted-foreground ml-1 tabular-nums">
                      {currentIdx + 1} / {properties.length}
                    </span>
                  </>
                )}
              </div>
            )}
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
            {!isPortfolio && (
              <Button onClick={openCreateDialog}><Plus className="h-4 w-4 mr-2" />Add Room</Button>
            )}
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading rooms...</p>
        ) : (
          <div className="space-y-8">
            {propertySections.map(({ property, rooms: pRooms, roomTypes: pTypes }) => {
              const grouped = new Map<string, number>();
              for (const rt of pTypes) {
                const count = pRooms.filter((r) => r.room_type_id === rt.id).length;
                grouped.set(rt.name, (grouped.get(rt.name) || 0) + count);
              }

              return (
                <section key={property.id} className="space-y-3">
                  {isPortfolio && (
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <h2 className="text-lg font-semibold flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                        {property.name}
                        <span className="text-xs font-normal text-muted-foreground">
                          ({pRooms.length} room{pRooms.length !== 1 ? "s" : ""})
                        </span>
                      </h2>
                      <Button variant="ghost" size="sm" onClick={() => { switchProperty(property.id); setViewMode("single"); }}>
                        Manage →
                      </Button>
                    </div>
                  )}

                  {pTypes.length > 0 && (
                    <div className="flex flex-wrap gap-2">
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
                  ) : (
                    renderRoomGrid(pRooms)
                  )}
                </section>
              );
            })}
          </div>
        )}
      </div>

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
                  {roomTypes.length === 0 ? (
                    <SelectItem value="none" disabled>No room types — add them in Property Overview first</SelectItem>
                  ) : (
                    roomTypes
                      .filter((rt) => !propertyId || rt.property_id === propertyId)
                      .map((rt) => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Room types are synced from Property Overview configuration.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
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
