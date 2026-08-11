import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActivePackages } from "@/hooks/useActivePackages";
import { callGroupsApi } from "@/lib/groupsApi";
import { supabase } from "@/integrations/supabase/client";
import type { GroupBlock } from "./GroupBlockGrid";

interface UnitOption {
  id: string;
  label: string;
  maxOccupancy: number | null;
  status: string | null;
  busy: boolean;
}


export interface RoomingLine {
  id: string;
  guest_name: string | null;
  guest_email: string | null;
  guest_phone: string | null;
  arrival_date: string | null;
  departure_date: string | null;
  room_preference: string | null;
  special_requests: string | null;
  adults: number;
  children: number;
  block_id: string | null;
}

interface GroupPickupDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  propertyId: string;
  groupId: string;
  block: GroupBlock | null;
  roomingLine?: RoomingLine | null;
  onDone: () => void;
}

export default function GroupPickupDialog({
  open,
  onOpenChange,
  propertyId,
  groupId,
  block,
  roomingLine,
  onDone,
}: GroupPickupDialogProps) {
  const [saving, setSaving] = useState(false);
  const { packages } = useActivePackages(propertyId);
  const [packageId, setPackageId] = useState("none");
  const [roomId, setRoomId] = useState("auto");
  const [form, setForm] = useState({
    guest_name: "",
    guest_email: "",
    guest_phone: "",
    arrival_date: "",
    departure_date: "",
    adults: "1",
    children: "0",
    room_preference: "",
    special_requests: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm({
      guest_name: roomingLine?.guest_name || "",
      guest_email: roomingLine?.guest_email || "",
      guest_phone: roomingLine?.guest_phone || "",
      arrival_date: roomingLine?.arrival_date || block?.start_date || "",
      departure_date: roomingLine?.departure_date || block?.end_date || "",
      adults: String(roomingLine?.adults ?? 1),
      children: String(roomingLine?.children ?? 0),
      room_preference: roomingLine?.room_preference || "",
      special_requests: roomingLine?.special_requests || "",
    });
    setPackageId(block?.package_id || "none");
    setRoomId(roomingLine?.room_id || "auto");
  }, [open, block, roomingLine]);

  const arrival = form.arrival_date || block?.start_date || null;
  const departure = form.departure_date || block?.end_date || null;

  // Named units belonging to the blocked room type, flagged busy when another
  // live booking already overlaps the requested dates.
  const { data: units = [], isFetching: unitsLoading } = useQuery({
    queryKey: ["group-pickup-units", propertyId, block?.room_type_id, arrival, departure],
    enabled: open && !!propertyId && !!block?.room_type_id,
    queryFn: async (): Promise<UnitOption[]> => {
      const { data: rooms, error } = await supabase
        .from("rolos_rooms")
        .select("id, room_name, room_number, max_occupancy, status")
        .eq("property_id", propertyId)
        .eq("room_type_id", block!.room_type_id)
        .order("room_number", { ascending: true });
      if (error) throw error;
      const ids = (rooms || []).map((r) => r.id);
      const busy = new Set<string>();
      if (ids.length && arrival && departure) {
        const { data: assigned } = await supabase
          .from("rolos_booking_rooms")
          .select("room_id, booking:bookings!booking_id(check_in_date, check_out_date, status)")
          .in("room_id", ids);
        (assigned || []).forEach((row: { room_id: string | null; booking: { check_in_date: string | null; check_out_date: string | null; status: string | null } | null }) => {
          const b = row.booking;
          if (!row.room_id || !b?.check_in_date || !b?.check_out_date) return;
          if (["cancelled", "no_show"].includes(String(b.status || "").toLowerCase())) return;
          if (b.check_in_date < departure && b.check_out_date > arrival) busy.add(row.room_id);
        });
      }
      return (rooms || []).map((r) => ({
        id: r.id,
        label: r.room_name || r.room_number || "Unit",
        maxOccupancy: r.max_occupancy ?? null,
        status: r.status ?? null,
        busy: busy.has(r.id),
      }));
    },
  });

  const freeUnits = useMemo(() => units.filter((u) => !u.busy), [units]);

  const submit = useCallback(async () => {
    if (!block) return;
    setSaving(true);
    try {
      await callGroupsApi("group_pickup_room", {
        property_id: propertyId,
        group_id: groupId,
        block_id: block.id,
        rooming_list_id: roomingLine?.id ?? null,
        guest_name: form.guest_name.trim(),
        guest_email: form.guest_email.trim() || null,
        guest_phone: form.guest_phone.trim() || null,
        arrival_date: form.arrival_date || null,
        departure_date: form.departure_date || null,
        adults: parseInt(form.adults, 10) || 1,
        children: parseInt(form.children, 10) || 0,
        room_preference: form.room_preference.trim() || null,
        room_id: roomId === "auto" ? null : roomId,
        special_requests: form.special_requests.trim() || null,
        package_id: packageId === "none" ? null : packageId,
      });
      toast.success("Room picked up — booking created");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error("Pickup failed", { description: err instanceof Error ? err.message : String(err) });
    } finally {
      setSaving(false);
    }
  }, [block, propertyId, groupId, roomingLine, form, roomId, packageId, onOpenChange, onDone]);


  const remaining = block ? Math.max(0, block.blocked_count - block.picked_up_count) : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Pick up a room</DialogTitle>
          <DialogDescription>
            {block?.room_type?.name || "Room type"} · {remaining} room{remaining === 1 ? "" : "s"} still held. This creates a
            confirmed booking and converts the held room to booked.
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label>Guest Name</Label>
            <Input value={form.guest_name} onChange={(e) => setForm((f) => ({ ...f, guest_name: e.target.value }))} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.guest_email} onChange={(e) => setForm((f) => ({ ...f, guest_email: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Phone</Label>
              <Input value={form.guest_phone} onChange={(e) => setForm((f) => ({ ...f, guest_phone: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Arrival</Label>
              <Input type="date" value={form.arrival_date} onChange={(e) => setForm((f) => ({ ...f, arrival_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Departure</Label>
              <Input type="date" value={form.departure_date} onChange={(e) => setForm((f) => ({ ...f, departure_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Adults</Label>
              <Input type="number" min="1" value={form.adults} onChange={(e) => setForm((f) => ({ ...f, adults: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Children</Label>
              <Input type="number" min="0" value={form.children} onChange={(e) => setForm((f) => ({ ...f, children: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Room Preference</Label>
            <Input
              placeholder="e.g. ground floor, twin beds"
              value={form.room_preference}
              onChange={(e) => setForm((f) => ({ ...f, room_preference: e.target.value }))}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Package (optional)</Label>
            <Select value={packageId} onValueChange={setPackageId}>
              <SelectTrigger><SelectValue placeholder={packages.length ? "No package" : "No packages configured"} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No package</SelectItem>
                {packages.map((pkg) => (
                  <SelectItem key={pkg.id} value={pkg.id}>{pkg.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Package components post to the folio split by revenue stream.</p>
          </div>
          <div className="space-y-1.5">
            <Label>Special Requests</Label>
            <Textarea
              rows={2}
              value={form.special_requests}
              onChange={(e) => setForm((f) => ({ ...f, special_requests: e.target.value }))}
            />
          </div>


          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || !form.guest_name.trim() || remaining <= 0}>
              {saving ? "Creating…" : "Create booking"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
