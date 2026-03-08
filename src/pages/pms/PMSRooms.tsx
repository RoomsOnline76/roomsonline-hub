import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, BedDouble } from "lucide-react";
import { callPmsApi } from "@/hooks/usePmsApi";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  available: "bg-emerald-100 text-emerald-800 border-emerald-200",
  occupied: "bg-blue-100 text-blue-800 border-blue-200",
  dirty: "bg-amber-100 text-amber-800 border-amber-200",
  maintenance: "bg-red-100 text-red-800 border-red-200",
  out_of_order: "bg-destructive/10 text-destructive border-destructive/20",
};

interface Room {
  id: string;
  room_number: string;
  room_name: string | null;
  floor: number | null;
  status: string;
  max_occupancy: number | null;
  room_type: { name: string } | null;
}

export default function PMSRooms() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property");
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newRoom, setNewRoom] = useState({ room_number: "", room_name: "", floor: "" });

  const fetchRooms = async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const res = await callPmsApi<{ rooms: Room[] }>("get_physical_rooms", { propertyId });
      if (res.success) setRooms(res.data?.rooms || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchRooms(); }, [propertyId]);

  const handleCreate = async () => {
    if (!propertyId || !newRoom.room_number) return;
    try {
      const res = await callPmsApi("create_physical_room", {
        propertyId,
        room_number: newRoom.room_number,
        room_name: newRoom.room_name || null,
        floor: newRoom.floor ? parseInt(newRoom.floor) : null,
      });
      if (res.success) {
        toast.success("Room created");
        setDialogOpen(false);
        setNewRoom({ room_number: "", room_name: "", floor: "" });
        fetchRooms();
      }
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const handleStatusChange = async (roomId: string, status: string) => {
    try {
      await callPmsApi("update_room_status", { room_id: roomId, status });
      toast.success("Status updated");
      fetchRooms();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  if (!propertyId) return <AppLayout><p className="text-muted-foreground">Select a property first.</p></AppLayout>;

  return (
    <AppLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold tracking-tight">Room Inventory</h1>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="h-4 w-4 mr-2" />Add Room</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Add Physical Room</DialogTitle></DialogHeader>
              <div className="space-y-4">
                <div><Label>Room Number *</Label><Input value={newRoom.room_number} onChange={e => setNewRoom(p => ({ ...p, room_number: e.target.value }))} /></div>
                <div><Label>Room Name</Label><Input value={newRoom.room_name} onChange={e => setNewRoom(p => ({ ...p, room_name: e.target.value }))} /></div>
                <div><Label>Floor</Label><Input type="number" value={newRoom.floor} onChange={e => setNewRoom(p => ({ ...p, floor: e.target.value }))} /></div>
                <Button onClick={handleCreate} className="w-full">Create Room</Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading rooms...</p>
        ) : rooms.length === 0 ? (
          <Card><CardContent className="py-12 text-center"><BedDouble className="h-12 w-12 mx-auto text-muted-foreground mb-4" /><p className="text-muted-foreground">No rooms configured yet.</p></CardContent></Card>
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
                  {room.room_type && <p className="text-xs text-muted-foreground">{room.room_type.name}</p>}
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
    </AppLayout>
  );
}
