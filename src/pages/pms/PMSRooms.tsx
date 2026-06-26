import { useEffect, useState, useCallback } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Plus, BedDouble, RefreshCw, Pencil, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { syncRolosRoomTypesFromOverview } from "@/lib/pmsRoomTypeSync";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  occupied: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  dirty: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  maintenance: "bg-red-500/10 text-red-700 border-red-500/20",
  out_of_order: "bg-destructive/10 text-destructive border-destructive/20",
};

interface RoomType { id: string; name: string; }

interface Room {
  id: string;
  room_number: string;
  room_name: string | null;
  floor: number | null;
  status: string;
  max_occupancy: number | null;
  room_type_id: string | null;
  room_type_name?: string;
}

type RoomForm = { room_number: string; room_name: string; floor: string; room_type_id: string; max_occupancy: string };
const emptyForm: RoomForm = { room_number: "", room_name: "", floor: "", room_type_id: "", max_occupancy: "" };

export default function PMSRooms() {
  const { propertyId, properties, switchProperty, loading: propertyLoading } = usePmsPropertyId();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [form, setForm] = useState<RoomForm>(emptyForm);
  const [deleteRoom, setDeleteRoom] = useState<Room | null>(null);

  // Auto-sync room types from the true Property Overview source
  const syncRoomTypesFromOverview = useCallback(async () => {
    if (!propertyId) return;

    await syncRolosRoomTypesFromOverview(propertyId);

    const { data: allRolosTypes } = await supabase
      .from("rolos_room_types")
      .select("id, name")
      .eq("property_id", propertyId)
      .eq("is_active", true);

    if (allRolosTypes && allRolosTypes.length > 0) {
      const { data: existingPhysical } = await supabase
        .from("rolos_rooms")
        .select("room_type_id")
        .eq("property_id", propertyId);

      const hasPhysical = new Set((existingPhysical || []).map((room) => room.room_type_id).filter(Boolean));
      const missingPhysical = allRolosTypes.filter((roomType) => !hasPhysical.has(roomType.id));

      if (missingPhysical.length > 0) {
        const backfillRooms = missingPhysical.map((roomType) => ({
          property_id: propertyId,
          room_number: roomType.name,
          room_name: roomType.name,
          room_type_id: roomType.id,
          status: "available",
        }));
        await supabase.from("rolos_rooms").insert(backfillRooms);
      }
    }
  }, [propertyId]);

  const fetchData = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    await syncRoomTypesFromOverview();

    const [roomsRes, typesRes] = await Promise.all([
      supabase
        .from("rolos_rooms")
        .select("id, room_number, room_name, floor, status, max_occupancy, room_type_id")
        .eq("property_id", propertyId)
        .order("floor", { ascending: true })
        .order("room_number", { ascending: true }),
      supabase
        .from("rolos_room_types")
        .select("id, name")
        .eq("property_id", propertyId)
        .eq("is_active", true)
        .order("name"),
    ]);

    const types = (typesRes.data || []) as RoomType[];
    setRoomTypes(types);

    // Build set of active room type IDs to filter out rooms linked to inactive types
    const activeTypeIds = new Set(types.map(t => t.id));
    const typeMap = new Map(types.map(t => [t.id, t.name]));

    setRooms((roomsRes.data || [])
      .filter((r: any) => !r.room_type_id || activeTypeIds.has(r.room_type_id))
      .map((r: any) => ({
        ...r,
        room_type_name: r.room_type_id ? typeMap.get(r.room_type_id) : undefined,
      })));
    setLoading(false);
  }, [propertyId, syncRoomTypesFromOverview]);

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
    if (!propertyId || !form.room_number) return;

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
    const { error } = await supabase.from("rolos_rooms").update({ status }).eq("id", roomId);
    if (error) { toast.error(error.message); return; }
    toast.success("Status updated");
    fetchData();
  };

  if (propertyLoading) return <p className="text-muted-foreground">Loading property…</p>;
  if (!propertyId) return <p className="text-muted-foreground">Select a property first.</p>;

  const currentIdx = properties.findIndex((p) => p.id === propertyId);
  const canCycle = properties.length > 1;
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

  return (
    <>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Room Inventory</h1>
            <p className="text-sm text-muted-foreground">Physical rooms linked to room types from Property Overview.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {properties.length > 0 && (
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
            <Button onClick={openCreateDialog}><Plus className="h-4 w-4 mr-2" />Add Room</Button>
          </div>
        </div>

        {/* Room type summary */}
        {roomTypes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {roomTypes.map(rt => {
              const count = rooms.filter(r => r.room_type_id === rt.id).length;
              return (
                <Badge key={rt.id} variant="outline" className="text-xs">
                  {rt.name}: {count} room{count !== 1 ? 's' : ''}
                </Badge>
              );
            })}
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <BedDouble className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No rooms configured yet.</p>
              <p className="text-sm text-muted-foreground">
                {roomTypes.length === 0
                  ? "Configure room types in Property Overview first, then add physical rooms here."
                  : `You have ${roomTypes.length} room type${roomTypes.length !== 1 ? 's' : ''} synced. Add physical rooms to get started.`}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
            {rooms.map((room) => (
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
                  <Badge className={STATUS_COLORS[room.status] || ""} variant="outline">{room.status}</Badge>
                  {room.room_type_name && <p className="text-xs text-muted-foreground">{room.room_type_name}</p>}
                  <Select value={room.status} onValueChange={(v) => handleStatusChange(room.id, v)}>
                    <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Object.keys(STATUS_COLORS).map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            ))}
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
              <Input value={form.room_number} onChange={e => setForm(p => ({ ...p, room_number: e.target.value }))} placeholder="e.g. 101" />
            </div>
            <div>
              <Label>Room Name</Label>
              <Input value={form.room_name} onChange={e => setForm(p => ({ ...p, room_name: e.target.value }))} placeholder="e.g. Ocean Suite" />
            </div>
            <div>
              <Label>Room Type</Label>
              <Select value={form.room_type_id} onValueChange={v => setForm(p => ({ ...p, room_type_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select room type" /></SelectTrigger>
                <SelectContent>
                  {roomTypes.length === 0 ? (
                    <SelectItem value="none" disabled>No room types — add them in Property Overview first</SelectItem>
                  ) : (
                    roomTypes.map(rt => <SelectItem key={rt.id} value={rt.id}>{rt.name}</SelectItem>)
                  )}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-1">Room types are synced from Property Overview configuration.</p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Floor</Label><Input type="number" value={form.floor} onChange={e => setForm(p => ({ ...p, floor: e.target.value }))} /></div>
              <div><Label>Max Occupancy</Label><Input type="number" value={form.max_occupancy} onChange={e => setForm(p => ({ ...p, max_occupancy: e.target.value }))} /></div>
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
