import { useEffect, useState } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, BedDouble, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-500/10 text-emerald-700 border-emerald-500/20",
  occupied: "bg-blue-500/10 text-blue-700 border-blue-500/20",
  dirty: "bg-amber-500/10 text-amber-700 border-amber-500/20",
  maintenance: "bg-red-500/10 text-red-700 border-red-500/20",
  out_of_order: "bg-destructive/10 text-destructive border-destructive/20",
};

interface RoomType {
  id: string;
  name: string;
}

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

export default function PMSRooms() {
  const { propertyId, loading: propertyLoading } = usePmsPropertyId();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRoom, setNewRoom] = useState({ room_number: "", room_name: "", floor: "", room_type_id: "", max_occupancy: "" });

  const fetchData = async () => {
    if (!propertyId) return;
    setLoading(true);

    // Fetch room types from rolos_room_types (synced with overview)
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

    // Map room type names onto rooms
    const typeMap = new Map(types.map(t => [t.id, t.name]));
    const roomsData = (roomsRes.data || []).map((r: any) => ({
      ...r,
      room_type_name: r.room_type_id ? typeMap.get(r.room_type_id) : undefined,
    }));
    setRooms(roomsData);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [propertyId]);

  const handleCreate = async () => {
    if (!propertyId || !newRoom.room_number) return;

    const { error } = await supabase.from("rolos_rooms").insert({
      property_id: propertyId,
      room_number: newRoom.room_number,
      room_name: newRoom.room_name || null,
      floor: newRoom.floor ? parseInt(newRoom.floor) : null,
      room_type_id: newRoom.room_type_id || null,
      max_occupancy: newRoom.max_occupancy ? parseInt(newRoom.max_occupancy) : null,
    });

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Room created");
    setDialogOpen(false);
    setNewRoom({ room_number: "", room_name: "", floor: "", room_type_id: "", max_occupancy: "" });
    fetchData();
  };

  const handleStatusChange = async (roomId: string, status: string) => {
    const { error } = await supabase
      .from("rolos_rooms")
      .update({ status })
      .eq("id", roomId);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Status updated");
    fetchData();
  };

  if (propertyLoading) return <PMSLayout><p className="text-muted-foreground">Loading property…</p></PMSLayout>;
  if (!propertyId) return <PMSLayout><p className="text-muted-foreground">Select a property first.</p></PMSLayout>;

  return (
    <PMSLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Room Inventory</h1>
            <p className="text-sm text-muted-foreground">
              Physical rooms linked to room types from Property Overview.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
              <DialogTrigger asChild>
                <Button><Plus className="h-4 w-4 mr-2" />Add Room</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>Add Physical Room</DialogTitle></DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Room Number *</Label>
                    <Input value={newRoom.room_number} onChange={e => setNewRoom(p => ({ ...p, room_number: e.target.value }))} placeholder="e.g. 101" />
                  </div>
                  <div>
                    <Label>Room Name</Label>
                    <Input value={newRoom.room_name} onChange={e => setNewRoom(p => ({ ...p, room_name: e.target.value }))} placeholder="e.g. Ocean Suite" />
                  </div>
                  <div>
                    <Label>Room Type</Label>
                    <Select value={newRoom.room_type_id} onValueChange={v => setNewRoom(p => ({ ...p, room_type_id: v }))}>
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
                    <div><Label>Floor</Label><Input type="number" value={newRoom.floor} onChange={e => setNewRoom(p => ({ ...p, floor: e.target.value }))} /></div>
                    <div><Label>Max Occupancy</Label><Input type="number" value={newRoom.max_occupancy} onChange={e => setNewRoom(p => ({ ...p, max_occupancy: e.target.value }))} /></div>
                  </div>
                  <Button onClick={handleCreate} className="w-full">Create Room</Button>
                </div>
              </DialogContent>
            </Dialog>
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
              <Card key={room.id} className="relative">
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg font-bold">{room.room_number}</CardTitle>
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
    </PMSLayout>
  );
}
