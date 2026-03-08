import { useState } from "react";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { usePmsStaffRole } from "@/hooks/usePmsStaffRole";
import { getModuleAccess } from "@/lib/pmsPermissions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { CalendarHeart, Plus, MoreHorizontal, MapPin } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

const EVENT_TYPES = ["conference", "wedding", "meeting", "workshop", "gala", "private_dining", "other"];
const STATUS_BADGES: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  inquiry: "outline",
  tentative: "secondary",
  confirmed: "default",
  in_progress: "default",
  completed: "secondary",
  cancelled: "destructive",
};

export default function PMSEvents() {
  const { propertyId } = usePmsPropertyId();
  const { staffRole } = usePmsStaffRole(propertyId);
  const access = getModuleAccess(staffRole, "events");
  const readOnly = access.readOnly;
  const qc = useQueryClient();
  const [activeTab, setActiveTab] = useState("events");
  const [showCreateEvent, setShowCreateEvent] = useState(false);
  const [showCreateSpace, setShowCreateSpace] = useState(false);

  // Event Spaces
  const { data: spaces = [] } = useQuery({
    queryKey: ["pms-event-spaces", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_event_spaces" as any).select("*").eq("property_id", propertyId!).order("name");
      if (error) throw error;
      return data as any[];
    },
  });

  // Events
  const { data: events = [], isLoading } = useQuery({
    queryKey: ["pms-events", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase.from("rolos_events" as any).select("*, space:rolos_event_spaces!space_id(name)").eq("property_id", propertyId!).order("start_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const [eventForm, setEventForm] = useState({ name: "", event_type: "conference", space_id: "", contact_name: "", contact_email: "", contact_phone: "", start_at: "", end_at: "", expected_attendees: "", notes: "" });
  const [spaceForm, setSpaceForm] = useState({ name: "", description: "", capacity_min: "", capacity_max: "", hourly_rate: "", daily_rate: "" });

  const createEvent = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rolos_events" as any).insert({
        property_id: propertyId,
        name: eventForm.name,
        event_type: eventForm.event_type,
        space_id: eventForm.space_id || null,
        contact_name: eventForm.contact_name || null,
        contact_email: eventForm.contact_email || null,
        contact_phone: eventForm.contact_phone || null,
        start_at: eventForm.start_at,
        end_at: eventForm.end_at,
        expected_attendees: eventForm.expected_attendees ? parseInt(eventForm.expected_attendees) : null,
        notes: eventForm.notes || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-events", propertyId] });
      toast.success("Event created");
      setShowCreateEvent(false);
    },
    onError: (err: any) => toast.error("Failed to create event", { description: err.message }),
  });

  const createSpace = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rolos_event_spaces" as any).insert({
        property_id: propertyId,
        name: spaceForm.name,
        description: spaceForm.description || null,
        capacity_min: spaceForm.capacity_min ? parseInt(spaceForm.capacity_min) : null,
        capacity_max: spaceForm.capacity_max ? parseInt(spaceForm.capacity_max) : null,
        hourly_rate: spaceForm.hourly_rate ? parseFloat(spaceForm.hourly_rate) : null,
        daily_rate: spaceForm.daily_rate ? parseFloat(spaceForm.daily_rate) : null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-event-spaces", propertyId] });
      toast.success("Event space created");
      setShowCreateSpace(false);
      setSpaceForm({ name: "", description: "", capacity_min: "", capacity_max: "", hourly_rate: "", daily_rate: "" });
    },
    onError: (err: any) => toast.error("Failed to create space", { description: err.message }),
  });

  const updateEventStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("rolos_events" as any).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-events", propertyId] });
      toast.success("Event status updated");
    },
  });

  return (
    <PMSLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <CalendarHeart className="h-6 w-6" /> Event Management
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manage event spaces, conferences, and special occasions.</p>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList>
            <TabsTrigger value="events">Events</TabsTrigger>
            <TabsTrigger value="spaces">Spaces</TabsTrigger>
          </TabsList>

          {/* Events Tab */}
          <TabsContent value="events">
            <div className="flex justify-end mb-4">
              {!readOnly && <Button onClick={() => setShowCreateEvent(true)}><Plus className="h-4 w-4 mr-1.5" /> New Event</Button>}
            </div>
            {isLoading ? (
              <div className="flex justify-center py-12 text-muted-foreground">Loading…</div>
            ) : events.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <CalendarHeart className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No events yet</p>
              </CardContent></Card>
            ) : (
              <div className="border rounded-lg">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Space</TableHead>
                      <TableHead>Date & Time</TableHead>
                      <TableHead>Attendees</TableHead>
                      <TableHead>Status</TableHead>
                      {!readOnly && <TableHead className="w-12" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((ev: any) => (
                      <TableRow key={ev.id}>
                        <TableCell>
                          <div className="font-medium">{ev.name}</div>
                          {ev.contact_name && <div className="text-xs text-muted-foreground">{ev.contact_name}</div>}
                        </TableCell>
                        <TableCell className="text-xs capitalize">{ev.event_type.replace("_", " ")}</TableCell>
                        <TableCell className="text-xs">{ev.space?.name ?? "—"}</TableCell>
                        <TableCell className="text-xs whitespace-nowrap">
                          {format(new Date(ev.start_at), "MMM d, HH:mm")} – {format(new Date(ev.end_at), "HH:mm")}
                        </TableCell>
                        <TableCell className="text-sm">{ev.expected_attendees ?? "—"}</TableCell>
                        <TableCell>
                          <Badge variant={STATUS_BADGES[ev.status] ?? "outline"} className="text-[10px] capitalize">{ev.status.replace("_", " ")}</Badge>
                        </TableCell>
                        {!readOnly && (
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                {ev.status === "inquiry" && <DropdownMenuItem onClick={() => updateEventStatus.mutate({ id: ev.id, status: "tentative" })}>Mark Tentative</DropdownMenuItem>}
                                {["inquiry", "tentative"].includes(ev.status) && <DropdownMenuItem onClick={() => updateEventStatus.mutate({ id: ev.id, status: "confirmed" })}>Confirm</DropdownMenuItem>}
                                {ev.status === "confirmed" && <DropdownMenuItem onClick={() => updateEventStatus.mutate({ id: ev.id, status: "completed" })}>Complete</DropdownMenuItem>}
                                {!["cancelled", "completed"].includes(ev.status) && <DropdownMenuItem className="text-destructive" onClick={() => updateEventStatus.mutate({ id: ev.id, status: "cancelled" })}>Cancel</DropdownMenuItem>}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Spaces Tab */}
          <TabsContent value="spaces">
            <div className="flex justify-end mb-4">
              {!readOnly && <Button onClick={() => setShowCreateSpace(true)}><Plus className="h-4 w-4 mr-1.5" /> New Space</Button>}
            </div>
            {spaces.length === 0 ? (
              <Card><CardContent className="py-12 text-center text-muted-foreground">
                <MapPin className="h-10 w-10 mx-auto mb-3 opacity-40" />
                <p>No event spaces configured</p>
              </CardContent></Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {spaces.map((s: any) => (
                  <Card key={s.id}>
                    <CardContent className="p-5">
                      <h3 className="font-semibold text-foreground">{s.name}</h3>
                      {s.description && <p className="text-xs text-muted-foreground mt-1">{s.description}</p>}
                      <div className="flex gap-4 mt-3 text-xs text-muted-foreground">
                        {s.capacity_max && <span>Up to {s.capacity_max} guests</span>}
                        {s.daily_rate && <span>R{s.daily_rate}/day</span>}
                        {s.hourly_rate && <span>R{s.hourly_rate}/hr</span>}
                      </div>
                      <Badge variant={s.is_active ? "default" : "secondary"} className="mt-3 text-[10px]">{s.is_active ? "Active" : "Inactive"}</Badge>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Create Event Dialog */}
      <Dialog open={showCreateEvent} onOpenChange={setShowCreateEvent}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Event</DialogTitle>
            <DialogDescription>Schedule a conference, wedding, or special event.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createEvent.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Event Name</Label>
                <Input value={eventForm.name} onChange={(e) => setEventForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={eventForm.event_type} onValueChange={(v) => setEventForm((f) => ({ ...f, event_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{EVENT_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t.replace("_", " ")}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Space</Label>
                <Select value={eventForm.space_id} onValueChange={(v) => setEventForm((f) => ({ ...f, space_id: v }))}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{spaces.map((s: any) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Start</Label>
                <Input type="datetime-local" value={eventForm.start_at} onChange={(e) => setEventForm((f) => ({ ...f, start_at: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>End</Label>
                <Input type="datetime-local" value={eventForm.end_at} onChange={(e) => setEventForm((f) => ({ ...f, end_at: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Name</Label>
                <Input value={eventForm.contact_name} onChange={(e) => setEventForm((f) => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Attendees</Label>
                <Input type="number" value={eventForm.expected_attendees} onChange={(e) => setEventForm((f) => ({ ...f, expected_attendees: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateEvent(false)}>Cancel</Button>
              <Button type="submit" disabled={createEvent.isPending}>{createEvent.isPending ? "Creating…" : "Create Event"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Space Dialog */}
      <Dialog open={showCreateSpace} onOpenChange={setShowCreateSpace}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>New Event Space</DialogTitle>
            <DialogDescription>Add a venue or room for events.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createSpace.mutate(); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Name</Label>
              <Input value={spaceForm.name} onChange={(e) => setSpaceForm((f) => ({ ...f, name: e.target.value }))} required />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea value={spaceForm.description} onChange={(e) => setSpaceForm((f) => ({ ...f, description: e.target.value }))} rows={2} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Min Capacity</Label>
                <Input type="number" value={spaceForm.capacity_min} onChange={(e) => setSpaceForm((f) => ({ ...f, capacity_min: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Max Capacity</Label>
                <Input type="number" value={spaceForm.capacity_max} onChange={(e) => setSpaceForm((f) => ({ ...f, capacity_max: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Hourly Rate</Label>
                <Input type="number" step="0.01" value={spaceForm.hourly_rate} onChange={(e) => setSpaceForm((f) => ({ ...f, hourly_rate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Daily Rate</Label>
                <Input type="number" step="0.01" value={spaceForm.daily_rate} onChange={(e) => setSpaceForm((f) => ({ ...f, daily_rate: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateSpace(false)}>Cancel</Button>
              <Button type="submit" disabled={createSpace.isPending}>{createSpace.isPending ? "Creating…" : "Create Space"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PMSLayout>
  );
}
