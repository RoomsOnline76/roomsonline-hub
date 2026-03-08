import { useState } from "react";
import { PMSLayout } from "@/components/layout/PMSLayout";
import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { usePmsStaffRole } from "@/hooks/usePmsStaffRole";
import { getModuleAccess } from "@/lib/pmsPermissions";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { UsersRound, Plus, UserPlus, CalendarRange, MoreHorizontal, Building2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { format } from "date-fns";

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
  const [form, setForm] = useState({ name: "", group_type: "corporate", contact_name: "", contact_email: "", contact_phone: "", total_rooms: "1", notes: "", check_in_date: "", check_out_date: "" });

  const { data: groups = [], isLoading } = useQuery({
    queryKey: ["pms-groups", propertyId],
    enabled: !!propertyId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("rolos_groups" as any)
        .select("*")
        .eq("property_id", propertyId!)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
  });

  const createGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("rolos_groups" as any).insert({
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
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-groups", propertyId] });
      toast.success("Group created");
      setShowCreate(false);
      setForm({ name: "", group_type: "corporate", contact_name: "", contact_email: "", contact_phone: "", total_rooms: "1", notes: "", check_in_date: "", check_out_date: "" });
    },
    onError: (err: any) => toast.error("Failed to create group", { description: err.message }),
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("rolos_groups" as any).update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["pms-groups", propertyId] });
      toast.success("Status updated");
    },
  });

  return (
    <PMSLayout>
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
            <p className="text-xs mt-1">Create a group for weddings, corporate events, or tour groups.</p>
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
                  <TableHead>Status</TableHead>
                  {!readOnly && <TableHead className="w-12" />}
                </TableRow>
              </TableHeader>
              <TableBody>
                {groups.map((g: any) => (
                  <TableRow key={g.id}>
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
                    <TableCell>
                      <Badge variant={STATUS_BADGES[g.status] ?? "outline"} className="text-[10px] capitalize">{g.status}</Badge>
                    </TableCell>
                    {!readOnly && (
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {g.status === "inquiry" && (
                              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: g.id, status: "tentative" })}>Mark Tentative</DropdownMenuItem>
                            )}
                            {(g.status === "inquiry" || g.status === "tentative") && (
                              <DropdownMenuItem onClick={() => updateStatus.mutate({ id: g.id, status: "confirmed" })}>Confirm</DropdownMenuItem>
                            )}
                            {g.status !== "cancelled" && (
                              <DropdownMenuItem className="text-destructive" onClick={() => updateStatus.mutate({ id: g.id, status: "cancelled" })}>Cancel</DropdownMenuItem>
                            )}
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
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>Cancel</Button>
              <Button type="submit" disabled={createGroup.isPending}>{createGroup.isPending ? "Creating…" : "Create Group"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </PMSLayout>
  );
}
