import { useEffect, useState, useCallback } from "react";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Layers, Users, DollarSign, Pencil, Trash2, Link2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RoomType {
  id: string;
  name: string;
  description: string | null;
  max_occupancy: number;
  default_rate: number | null;
  is_active: boolean;
  linked_overview_id: string | null;
}

export default function PMSRoomTypes() {
  const { propertyId, loading: propertyLoading } = usePmsPropertyId();
  const [roomTypes, setRoomTypes] = useState<RoomType[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingType, setEditingType] = useState<RoomType | null>(null);
  const [form, setForm] = useState({
    name: "",
    description: "",
    max_occupancy: "2",
    default_rate: "",
  });

  // Auto-sync: ensure all overview room types exist in rolos_room_types
  const syncFromOverview = useCallback(async () => {
    if (!propertyId) return;

    const { data: overviewTypes } = await supabase
      .from("hostfully_room_types")
      .select("id, name, description, max_guests, daily_rate, is_active")
      .eq("property_id", propertyId)
      .eq("is_active", true);

    if (!overviewTypes || overviewTypes.length === 0) return;

    const { data: existingRolos } = await supabase
      .from("rolos_room_types")
      .select("id, name, linked_overview_id")
      .eq("property_id", propertyId);

    const linkedIds = new Set((existingRolos || []).map(r => r.linked_overview_id).filter(Boolean));
    const existingNames = new Set((existingRolos || []).map(r => r.name.toLowerCase()));

    const missing = overviewTypes.filter(ot =>
      !linkedIds.has(ot.id) && !existingNames.has(ot.name.toLowerCase())
    );

    if (missing.length === 0) return;

    const rows = missing.map(ot => ({
      property_id: propertyId,
      name: ot.name,
      description: ot.description || null,
      max_occupancy: ot.max_guests || 2,
      default_rate: ot.daily_rate || null,
      is_active: true,
      linked_overview_id: ot.id,
    }));

    const { error } = await supabase.from("rolos_room_types").insert(rows);
    if (!error) {
      toast.success(`Synced ${missing.length} room type${missing.length !== 1 ? 's' : ''} from Property Overview`);
    }
  }, [propertyId]);

  const fetchRoomTypes = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);

    // Auto-sync from overview first
    await syncFromOverview();

    const { data, error } = await supabase
      .from("rolos_room_types")
      .select("id, name, description, max_occupancy, default_rate, is_active, linked_overview_id")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .order("name");

    if (!error) {
      setRoomTypes((data as RoomType[]) || []);
    }
    setLoading(false);
  }, [propertyId, syncFromOverview]);

  useEffect(() => { fetchRoomTypes(); }, [fetchRoomTypes]);

  const resetForm = () => {
    setForm({ name: "", description: "", max_occupancy: "2", default_rate: "" });
    setEditingType(null);
  };

  const handleOpenDialog = (roomType?: RoomType) => {
    if (roomType) {
      setEditingType(roomType);
      setForm({
        name: roomType.name,
        description: roomType.description || "",
        max_occupancy: String(roomType.max_occupancy || 2),
        default_rate: roomType.default_rate ? String(roomType.default_rate) : "",
      });
    } else {
      resetForm();
    }
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!propertyId || !form.name.trim()) {
      toast.error("Name is required");
      return;
    }

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      max_occupancy: parseInt(form.max_occupancy) || 2,
      default_rate: form.default_rate ? parseFloat(form.default_rate) : null,
    };

    let error;
    if (editingType) {
      ({ error } = await supabase
        .from("rolos_room_types")
        .update(payload)
        .eq("id", editingType.id));
    } else {
      ({ error } = await supabase
        .from("rolos_room_types")
        .insert({ ...payload, property_id: propertyId, is_active: true }));
    }

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editingType ? "Room type updated — syncing to Property Overview" : "Room type created — syncing to Property Overview");
    setDialogOpen(false);
    resetForm();
    fetchRoomTypes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this room type?")) return;

    const { error } = await supabase
      .from("rolos_room_types")
      .update({ is_active: false })
      .eq("id", id);

    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Room type deactivated");
    fetchRoomTypes();
  };

  if (propertyLoading) return <PMSLayout><p className="text-muted-foreground">Loading property…</p></PMSLayout>;
  if (!propertyId) return <PMSLayout><p className="text-muted-foreground">Select a property first.</p></PMSLayout>;

  return (
    <PMSLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Room Types</h1>
            <p className="text-sm text-muted-foreground">
              Manage room categories. Changes sync bidirectionally with Property Overview.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={fetchRoomTypes}>
              <RefreshCw className="h-4 w-4 mr-2" />Refresh
            </Button>
            <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
              <DialogTrigger asChild>
                <Button onClick={() => handleOpenDialog()}><Plus className="h-4 w-4 mr-2" />Add Room Type</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editingType ? "Edit Room Type" : "Create Room Type"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label>Name *</Label>
                    <Input
                      value={form.name}
                      onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                      placeholder="e.g., Deluxe Suite"
                    />
                  </div>
                  <div>
                    <Label>Description</Label>
                    <Textarea
                      value={form.description}
                      onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
                      placeholder="Room features and amenities"
                      rows={3}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Max Occupancy</Label>
                      <Input
                        type="number"
                        min={1}
                        max={20}
                        value={form.max_occupancy}
                        onChange={(e) => setForm((p) => ({ ...p, max_occupancy: e.target.value }))}
                      />
                    </div>
                    <div>
                      <Label>Default Rate (ZAR)</Label>
                      <Input
                        type="number"
                        min={0}
                        value={form.default_rate}
                        onChange={(e) => setForm((p) => ({ ...p, default_rate: e.target.value }))}
                        placeholder="0.00"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Changes will automatically sync to Property Overview via database triggers.
                  </p>
                  <Button onClick={handleSave} className="w-full">
                    {editingType ? "Update Room Type" : "Create Room Type"}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {loading ? (
          <p className="text-muted-foreground">Loading room types...</p>
        ) : roomTypes.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Layers className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground mb-2">No room types configured yet.</p>
              <p className="text-sm text-muted-foreground">
                Add room types here or in Property Overview — they sync automatically both ways.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {roomTypes.map((rt) => (
              <Card key={rt.id} className="group">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-lg">{rt.name}</CardTitle>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenDialog(rt)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => handleDelete(rt.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  {rt.description && (
                    <p className="text-sm text-muted-foreground line-clamp-2">{rt.description}</p>
                  )}
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-4 text-sm">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Users className="h-4 w-4" />
                      <span>{rt.max_occupancy} guests</span>
                    </div>
                    {rt.default_rate && (
                      <div className="flex items-center gap-1.5 text-muted-foreground">
                        <DollarSign className="h-4 w-4" />
                        <span>R{rt.default_rate.toLocaleString()}</span>
                      </div>
                    )}
                  </div>
                  {rt.linked_overview_id ? (
                    <Badge variant="outline" className="gap-1 text-xs">
                      <Link2 className="h-3 w-3" />
                      Synced with Overview
                    </Badge>
                  ) : (
                    <Badge variant="secondary" className="text-xs">PMS Only</Badge>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </PMSLayout>
  );
}
