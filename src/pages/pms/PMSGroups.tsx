import { useCallback, useState } from "react";

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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { UsersRound, Plus, MoreHorizontal, BedDouble } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { callGroupsApi } from "@/lib/groupsApi";
import GroupBlockGrid, { type GroupBlock } from "@/components/pms/groups/GroupBlockGrid";
import GroupPickupDialog from "@/components/pms/groups/GroupPickupDialog";
import RoomingListTable, { type RoomingRow } from "@/components/pms/groups/RoomingListTable";
import GroupBillingPanel, { type GroupRecord } from "@/components/pms/groups/GroupBillingPanel";

const GROUP_TYPES = ["corporate", "wedding", "tour", "conference", "family", "other"];
const STATUS_BADGES: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  inquiry: "outline",
  tentative: "secondary",
  confirmed: "default",
  cancelled: "destructive",
};

export default function PMSGroups() {
  const { propertyId } = usePmsPropertyId();
  const { staffRole } = usePmsStaffRole(propertyId);
  const access = getModuleAccess(staffRole, "groups");
  const readOnly = access.readOnly;
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<GroupRecord | null>(null);
  const [showBlockDialog, setShowBlockDialog] = useState(false);
  const [pickupBlock, setPickupBlock] = useState<GroupBlock | null>(null);
  const [pickupLine, setPickupLine] = useState<RoomingRow | null>(null);
  const [busyBlockId, setBusyBlockId] = useState<string | null>(null);
  const [blockForm, setBlockForm] = useState({ room_type_id: "", blocked_count: "1", rate_override: "", start_date: "", end_date: "", release_date: "" });
  const [form, setForm] = useState({ name: "", group_type: "corporate", contact_name: "", contact_email: "", contact_phone: "", total_rooms: "1", notes: "", check_in_date: "", check_out_date: "", attrition_rate: "0", release_date: "", billing_mode: "individual", cutoff_date: "" });

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["pms-groups", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolos_groups" as never)
        .select("*")
        .eq("property_id", propertyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as GroupRecord[];
    },
  });

  const { data: roomTypes = [] } = useQuery({
    queryKey: ["pms-room-types", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolos_room_types")
        .select("id, name, default_rate")
        .eq("property_id", propertyId!)
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
  });

  const { data: blocks = [], refetch: refetchBlocks } = useQuery({
    queryKey: ["pms-group-blocks", selectedGroup?.id],
    enabled: !!selectedGroup?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolos_group_room_blocks" as never)
        .select("*, room_type:rolos_room_types!room_type_id(name)")
        .eq("group_id", selectedGroup!.id)
        .order("start_date");
      if (error) throw error;
      return (data || []) as unknown as GroupBlock[];
    },
  });

  const { data: groupReservations = [], refetch: refetchReservations } = useQuery({
    queryKey: ["pms-group-reservations", selectedGroup?.id],
    enabled: !!selectedGroup?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolos_group_reservations" as never)
        .select("*")
        .eq("group_id", selectedGroup!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as RoomingRow[];
    },
  });

  const refreshGroupData = useCallback(() => {
    refetchBlocks();
    refetchReservations();
    qc.invalidateQueries({ queryKey: ["pms-groups", propertyId] });
    qc.invalidateQueries({ queryKey: ["group-master-folio"] });
    qc.invalidateQueries({ queryKey: ["group-master-folio-txns"] });
  }, [refetchBlocks, refetchReservations, qc, propertyId]);

  const createGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rolos_groups" as never).insert({
        property_id: propertyId,
        name: form.name,
        group_type: form.group_type,
        contact_name: form.contact_name || null,
        contact_email: form.contact_email || null,
        contact_phone: form.contact_phone || null,
        total_rooms: parseInt(form.total_rooms) || 1,
        notes: form.notes || null,
        check_in_date: form.check_in_date || null,
        check_out_date: form.check_out_date || null,
        attrition_rate: parseFloat(form.attrition_rate) || 0,
        release_date: form.release_date || null,
        billing_mode: form.billing_mode,
        cutoff_date: form.cutoff_date || null,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-groups", propertyId] });
      toast.success("Group created");
      setShowCreate(false);
      setForm({ name: "", group_type: "corporate", contact_name: "", contact_email: "", contact_phone: "", total_rooms: "1", notes: "", check_in_date: "", check_out_date: "", attrition_rate: "0", release_date: "", billing_mode: "individual", cutoff_date: "" });
    },
    onError: (err: Error) => toast.error("Failed to create group", { description: err.message }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (status === "cancelled") {
        await callGroupsApi("group_cancel", { property_id: propertyId, group_id: id });
        return;
      }
      const { error } = await supabase.from("rolos_groups" as never).update({ status } as never).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      refreshGroupData();
      toast.success("Status updated");
    },
    onError: (err: Error) => toast.error("Status change failed", { description: err.message }),
  });

  const addBlock = useMutation({
    mutationFn: async () => {
      if (!selectedGroup) return;
      await callGroupsApi("group_create_block", {
        property_id: selectedGroup.property_id,
        group_id: selectedGroup.id,
        room_type_id: blockForm.room_type_id,
        blocked_count: parseInt(blockForm.blocked_count) || 1,
        rate_override: blockForm.rate_override ? parseFloat(blockForm.rate_override) : null,
        start_date: blockForm.start_date || (selectedGroup as unknown as { check_in_date?: string }).check_in_date,
        end_date: blockForm.end_date || (selectedGroup as unknown as { check_out_date?: string }).check_out_date,
        release_date: blockForm.release_date || null,
      });
    },
    onSuccess: () => {
      refreshGroupData();
      toast.success("Rooms blocked — availability reduced");
      setShowBlockDialog(false);
      setBlockForm({ room_type_id: "", blocked_count: "1", rate_override: "", start_date: "", end_date: "", release_date: "" });
    },
    onError: (err: Error) => toast.error("Failed to add block", { description: err.message }),
  });

  const releaseBlock = useMutation({
    mutationFn: async (block: GroupBlock) => {
      setBusyBlockId(block.id);
      return await callGroupsApi<{ released: number; attrition: number }>("group_release_block", {
        property_id: selectedGroup?.property_id,
        block_id: block.id,
      });
    },
    onSuccess: (res) => {
      refreshGroupData();
      toast.success(`Released ${res?.released ?? 0} room(s) back to inventory`, {
        description: res?.attrition ? `Attrition of R${Number(res.attrition).toFixed(2)} posted to the master folio` : undefined,
      });
    },
    onError: (err: Error) => toast.error("Release failed", { description: err.message }),
    onSettled: () => setBusyBlockId(null),
  });


  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <UsersRound className="h-6 w-6" /> Group Bookings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Manage weddings, corporate blocks, and tour groups.</p>
          </div>
          {!readOnly && (
            <Button onClick={() => setShowCreate(true)}><Plus className="h-4 w-4 mr-1.5" /> New Group</Button>
          )}
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {(["inquiry", "tentative", "confirmed", "cancelled"] as const).map((status) => (
            <Card key={status}>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground capitalize">{status}</p>
                <p className="text-2xl font-bold text-foreground">{groups.filter((g: any) => g.status === status).length}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Groups Table */}
        {isLoading ? (
          <div className="flex justify-center py-12 text-muted-foreground">Loading…</div>
        ) : groups.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            <UsersRound className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p>No group bookings yet</p>
          </CardContent></Card>
        ) : (
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Dates</TableHead>
                  <TableHead>Rooms</TableHead>
                  <TableHead>Release</TableHead>
                  <TableHead>Status</TableHead>
                  {!readOnly && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g: any) => (
                  <TableRow key={g.id} className="cursor-pointer hover:bg-muted/50" onClick={() => setSelectedGroup(g)}>
                    <TableCell className="font-medium">{g.name}</TableCell>
                    <TableCell className="text-xs capitalize">{g.group_type}</TableCell>
                    <TableCell className="text-xs">
                      <div>{g.contact_name}</div>
                      <div className="text-muted-foreground">{g.contact_email}</div>
                    </TableCell>
                    <TableCell className="text-xs whitespace-nowrap">
                      {g.check_in_date && g.check_out_date
                        ? `${format(new Date(g.check_in_date), "MMM d")} – ${format(new Date(g.check_out_date), "MMM d, yyyy")}`
                        : "TBD"}
                    </TableCell>
                    <TableCell className="text-sm">{g.total_rooms}</TableCell>
                    <TableCell className="text-xs">{g.release_date ? format(new Date(g.release_date), "MMM d") : "—"}</TableCell>
                    <TableCell>
                      <Badge variant={STATUS_BADGES[g.status] ?? "outline"} className="text-[10px] capitalize">{g.status}</Badge>
                    </TableCell>
                    {!readOnly && (
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {g.status === "inquiry" && <DropdownMenuItem onClick={() => updateStatus.mutate({ id: g.id, status: "tentative" })}>Mark Tentative</DropdownMenuItem>}
                            {["inquiry", "tentative"].includes(g.status) && <DropdownMenuItem onClick={() => updateStatus.mutate({ id: g.id, status: "confirmed" })}>Confirm</DropdownMenuItem>}
                            {g.status !== "cancelled" && <DropdownMenuItem className="text-destructive" onClick={() => updateStatus.mutate({ id: g.id, status: "cancelled" })}>Cancel</DropdownMenuItem>}
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
      </div>

      {/* Group Detail Sheet */}
      <Sheet open={!!selectedGroup} onOpenChange={(o) => !o && setSelectedGroup(null)}>
        <SheetContent className="w-[500px] sm:w-[600px] overflow-y-auto">
          {selectedGroup && (
            <>
              <SheetHeader>
                <SheetTitle className="flex items-center gap-2">
                  <UsersRound className="h-5 w-5" /> {selectedGroup.name}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Status</span><Badge variant={STATUS_BADGES[selectedGroup.status] ?? "outline"} className="capitalize text-xs">{selectedGroup.status}</Badge></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Type</span><span className="capitalize">{selectedGroup.group_type}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Dates</span><span>{selectedGroup.check_in_date && selectedGroup.check_out_date ? `${format(new Date(selectedGroup.check_in_date), "MMM d")} – ${format(new Date(selectedGroup.check_out_date), "MMM d, yyyy")}` : "TBD"}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Rooms</span><span>{selectedGroup.total_rooms}</span></div>
                {selectedGroup.attrition_rate > 0 && <div className="flex justify-between"><span className="text-muted-foreground">Attrition Rate</span><span>{selectedGroup.attrition_rate}%</span></div>}
                {selectedGroup.release_date && <div className="flex justify-between"><span className="text-muted-foreground">Release Date</span><span>{format(new Date(selectedGroup.release_date), "MMM d, yyyy")}</span></div>}
              </div>

              <Tabs defaultValue="blocks" className="mt-6">
                <TabsList className="w-full">
                  <TabsTrigger value="blocks" className="flex-1">Room Blocks ({blocks.length})</TabsTrigger>
                  <TabsTrigger value="rooming" className="flex-1">Rooming List ({groupReservations.length})</TabsTrigger>
                  <TabsTrigger value="billing" className="flex-1">Billing</TabsTrigger>
                </TabsList>

                {/* Room Blocks */}
                <TabsContent value="blocks" className="space-y-3 mt-3">
                  {!readOnly && (
                    <Button size="sm" variant="outline" onClick={() => setShowBlockDialog(true)}>
                      <BedDouble className="h-4 w-4 mr-1" /> Add Room Block
                    </Button>
                  )}
                  <GroupBlockGrid
                    blocks={blocks}
                    readOnly={readOnly}
                    busyBlockId={busyBlockId}
                    onPickup={(b) => { setPickupLine(null); setPickupBlock(b); }}
                    onRelease={(b) => releaseBlock.mutate(b)}
                  />
                </TabsContent>

                {/* Rooming list */}
                <TabsContent value="rooming" className="space-y-3 mt-3">
                  <RoomingListTable
                    propertyId={selectedGroup.property_id}
                    groupId={selectedGroup.id}
                    rows={groupReservations}
                    blocks={blocks}
                    readOnly={readOnly}
                    onRefresh={refreshGroupData}
                    onPickup={(row) => {
                      const block = blocks.find((b) => b.id === row.block_id) || null;
                      if (!block) {
                        toast.error("Assign this guest to a room block first");
                        return;
                      }
                      setPickupLine(row);
                      setPickupBlock(block);
                    }}
                  />
                </TabsContent>

                {/* Billing & master folio */}
                <TabsContent value="billing" className="space-y-3 mt-3">
                  <GroupBillingPanel
                    group={selectedGroup}
                    readOnly={readOnly}
                    onSaved={() => {
                      refreshGroupData();
                      const fresh = groups.find((g) => g.id === selectedGroup.id);
                      if (fresh) setSelectedGroup(fresh);
                    }}
                  />
                </TabsContent>
              </Tabs>

            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Add Room Block Dialog */}
      <Dialog open={showBlockDialog} onOpenChange={setShowBlockDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add Room Block</DialogTitle>
            <DialogDescription>Allocate rooms for this group.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); addBlock.mutate(); }} className="space-y-4">
            <div className="space-y-1.5">
              <Label>Room Type</Label>
              <Select value={blockForm.room_type_id} onValueChange={(v) => setBlockForm((f) => ({ ...f, room_type_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select room type" /></SelectTrigger>
                <SelectContent>
                  {roomTypes.map((rt: any) => (
                    <SelectItem key={rt.id} value={rt.id}>{rt.name} (R{rt.default_rate})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Rooms</Label>
                <Input type="number" min="1" value={blockForm.blocked_count} onChange={(e) => setBlockForm((f) => ({ ...f, blocked_count: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Rate Override</Label>
                <Input type="number" step="0.01" placeholder="Default rate" value={blockForm.rate_override} onChange={(e) => setBlockForm((f) => ({ ...f, rate_override: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Start Date</Label>
                <Input type="date" value={blockForm.start_date || selectedGroup?.check_in_date || ""} onChange={(e) => setBlockForm((f) => ({ ...f, start_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>End Date</Label>
                <Input type="date" value={blockForm.end_date || selectedGroup?.check_out_date || ""} onChange={(e) => setBlockForm((f) => ({ ...f, end_date: e.target.value }))} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Release Date (optional)</Label>
              <Input type="date" value={blockForm.release_date} onChange={(e) => setBlockForm((f) => ({ ...f, release_date: e.target.value }))} />
              <p className="text-xs text-muted-foreground">Unsold rooms are released back to inventory after this date.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowBlockDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={addBlock.isPending || !blockForm.room_type_id}>{addBlock.isPending ? "Adding…" : "Add Block"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create Group Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>New Group Booking</DialogTitle>
            <DialogDescription>Create a group for weddings, corporate blocks, or tours.</DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => { e.preventDefault(); createGroup.mutate(); }} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1.5">
                <Label>Group Name</Label>
                <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} required />
              </div>
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select value={form.group_type} onValueChange={(v) => setForm((f) => ({ ...f, group_type: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{GROUP_TYPES.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Total Rooms</Label>
                <Input type="number" min="1" value={form.total_rooms} onChange={(e) => setForm((f) => ({ ...f, total_rooms: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Check-in</Label>
                <Input type="date" value={form.check_in_date} onChange={(e) => setForm((f) => ({ ...f, check_in_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Check-out</Label>
                <Input type="date" value={form.check_out_date} onChange={(e) => setForm((f) => ({ ...f, check_out_date: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Name</Label>
                <Input value={form.contact_name} onChange={(e) => setForm((f) => ({ ...f, contact_name: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Contact Email</Label>
                <Input type="email" value={form.contact_email} onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Attrition Rate %</Label>
                <Input type="number" min="0" max="100" value={form.attrition_rate} onChange={(e) => setForm((f) => ({ ...f, attrition_rate: e.target.value }))} />
              </div>
              <div className="space-y-1.5">
                <Label>Release Date</Label>
                <Input type="date" value={form.release_date} onChange={(e) => setForm((f) => ({ ...f, release_date: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createGroup.isPending}>{createGroup.isPending ? "Creating…" : "Create Group"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
