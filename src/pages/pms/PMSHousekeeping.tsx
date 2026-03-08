import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CheckCircle, Sparkles } from "lucide-react";
import { callPmsApi } from "@/hooks/usePmsApi";
import { toast } from "sonner";

const STATUS_STYLE: Record<string, string> = {
  available: "border-l-emerald-500",
  occupied: "border-l-blue-500",
  dirty: "border-l-amber-500",
  maintenance: "border-l-red-500",
  out_of_order: "border-l-destructive",
};

interface HousekeepingRoom {
  id: string;
  room_number: string;
  room_name: string | null;
  floor: number | null;
  status: string;
  room_type: { name: string } | null;
  tasks: Array<{
    id: string;
    task_type: string;
    priority: string;
    status: string;
    assigned_profile: { full_name: string } | null;
  }>;
}

export default function PMSHousekeeping() {
  const [searchParams] = useSearchParams();
  const propertyId = searchParams.get("property");
  const [rooms, setRooms] = useState<HousekeepingRoom[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBoard = async () => {
    if (!propertyId) return;
    setLoading(true);
    try {
      const res = await callPmsApi<{ rooms: HousekeepingRoom[] }>("get_housekeeping_board", { propertyId });
      if (res.success) setRooms(res.data?.rooms || []);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetchBoard(); }, [propertyId]);

  const completeTask = async (taskId: string) => {
    try {
      await callPmsApi("complete_housekeeping_task", { task_id: taskId });
      toast.success("Task completed — room available");
      fetchBoard();
    } catch (e: any) { toast.error(e.message); }
  };

  if (!propertyId) return <PMSLayout><p className="text-muted-foreground">Select a property first.</p></PMSLayout>;

  const dirtyRooms = rooms.filter(r => r.status === "dirty");
  const maintenanceRooms = rooms.filter(r => r.status === "maintenance" || r.status === "out_of_order");
  const cleanRooms = rooms.filter(r => r.status === "available");

  return (
    <PMSLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight">Housekeeping Board</h1>

        <div className="grid md:grid-cols-3 gap-6">
          {/* Needs Cleaning */}
          <div className="space-y-3">
            <h2 className="font-semibold text-amber-700 flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Needs Cleaning ({dirtyRooms.length})
            </h2>
            {dirtyRooms.map(room => (
              <Card key={room.id} className={`border-l-4 ${STATUS_STYLE[room.status]}`}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-bold">{room.room_number}</p>
                      <p className="text-xs text-muted-foreground">{room.room_type?.name}</p>
                    </div>
                    {room.tasks?.filter(t => t.status !== "completed").map(task => (
                      <Button key={task.id} size="sm" variant="outline" onClick={() => completeTask(task.id)}>
                        <CheckCircle className="h-3 w-3 mr-1" />Done
                      </Button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
            {dirtyRooms.length === 0 && <p className="text-sm text-muted-foreground">All clean!</p>}
          </div>

          {/* Maintenance */}
          <div className="space-y-3">
            <h2 className="font-semibold text-red-700">Maintenance ({maintenanceRooms.length})</h2>
            {maintenanceRooms.map(room => (
              <Card key={room.id} className={`border-l-4 ${STATUS_STYLE[room.status]}`}>
                <CardContent className="py-3">
                  <p className="font-bold">{room.room_number}</p>
                  <p className="text-xs text-muted-foreground">{room.room_type?.name}</p>
                  <Badge variant="destructive" className="text-xs mt-1">{room.status}</Badge>
                </CardContent>
              </Card>
            ))}
            {maintenanceRooms.length === 0 && <p className="text-sm text-muted-foreground">No issues.</p>}
          </div>

          {/* Ready */}
          <div className="space-y-3">
            <h2 className="font-semibold text-emerald-700">Ready ({cleanRooms.length})</h2>
            {cleanRooms.map(room => (
              <Card key={room.id} className={`border-l-4 ${STATUS_STYLE[room.status]}`}>
                <CardContent className="py-3">
                  <p className="font-bold">{room.room_number}</p>
                  <p className="text-xs text-muted-foreground">{room.room_type?.name}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </PMSLayout>
  );
}
