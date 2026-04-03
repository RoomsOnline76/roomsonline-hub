import { useState, useEffect, useMemo } from "react";
import { getStaffLoginUrl, getPortfolioStaffLoginUrl } from "@/lib/config";

import { usePmsPropertyId } from "@/hooks/usePmsPropertyId";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { UserPlus, KeyRound, UserX, UserCheck, Shield, MoreHorizontal, Copy, Link2, CalendarDays, Clock, Activity, Pencil, Trash2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type PmsStaffRole } from "@/lib/pmsPermissions";
import { useStaffShifts, useCreateShift, useUpdateShift, useDeleteShift, useStaffActivityLog } from "@/hooks/usePmsFinancial";
import { format, addDays, startOfWeek, isSameDay, parseISO } from "date-fns";

interface StaffMember {
  id: string;
  user_id: string;
  staff_role: PmsStaffRole;
  display_name: string;
  email: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
}

const ASSIGNABLE_ROLES: PmsStaffRole[] = [
  "general_manager", "front_desk", "housekeeping", "maintenance", "accountant", "auditor"
];

const SHIFT_TYPES = [
  { value: "morning", label: "Morning", color: "bg-amber-500/10 text-amber-700 border-amber-200" },
  { value: "afternoon", label: "Afternoon", color: "bg-blue-500/10 text-blue-700 border-blue-200" },
  { value: "night", label: "Night", color: "bg-indigo-500/10 text-indigo-700 border-indigo-200" },
  { value: "full_day", label: "Full Day", color: "bg-emerald-500/10 text-emerald-700 border-emerald-200" },
  { value: "custom", label: "Custom", color: "bg-muted text-muted-foreground border-border" },
];

export default function PMSStaff() {
  const { propertyId, portfolioProperties, portfolioIds } = usePmsPropertyId();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState<StaffMember | null>(null);
  const [showShiftDialog, setShowShiftDialog] = useState(false);
  const [editingShift, setEditingShift] = useState<any>(null);
  const [propertySlug, setPropertySlug] = useState<string | null>(null);
  const [portfolioSlug, setPortfolioSlug] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("roster");
  const [weekOffset, setWeekOffset] = useState(0);
  const [activityFilter, setActivityFilter] = useState("");

  // Add form state
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState<PmsStaffRole>("front_desk");
  const [addPassword, setAddPassword] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Reset password state
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Shift form state
  const [shiftForm, setShiftForm] = useState({ staff_id: "", shift_type: "morning" as string, start_time: "", end_time: "", notes: "" });

  // Hooks for shifts and activity
  const { data: shifts = [] } = useStaffShifts(propertyId);
  const createShift = useCreateShift(propertyId);
  const updateShift = useUpdateShift(propertyId);
  const deleteShift = useDeleteShift(propertyId);
  const { data: activityLog = [] } = useStaffActivityLog(propertyId);

  // Week days for shift calendar
  const weekStart = useMemo(() => {
    const today = startOfWeek(new Date(), { weekStartsOn: 1 }); // Monday
    return addDays(today, weekOffset * 7);
  }, [weekOffset]);

  const weekDays = useMemo(() =>
    Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  // Fetch property slug
  useEffect(() => {
    if (!propertyId) return;
    supabase.from("properties").select("slug").eq("id", propertyId).single()
      .then(({ data }) => setPropertySlug(data?.slug || null));
  }, [propertyId]);

  // Fetch portfolio slug
  useEffect(() => {
    if (!portfolioIds?.length) { setPortfolioSlug(null); return; }
    supabase.from("property_portfolios" as any).select("slug").eq("id", portfolioIds[0]).single()
      .then(({ data }: any) => setPortfolioSlug(data?.slug || null));
  }, [portfolioIds]);

  const portfolioLoginUrl = portfolioSlug ? getPortfolioStaffLoginUrl(portfolioSlug) : null;
  const staffLoginUrl = propertySlug ? getStaffLoginUrl(propertySlug) : null;

  const copyUrl = (url: string, label: string) => {
    navigator.clipboard.writeText(url);
    toast.success(`${label} URL copied`);
  };

  const fetchStaff = async () => {
    if (!propertyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("property_staff")
      .select("*")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    else setStaff(data || []);
    setLoading(false);
  };

  useEffect(() => { fetchStaff(); }, [propertyId]);

  const invokeStaffAction = async (payload: Record<string, any>) => {
    const { data, error } = await supabase.functions.invoke("manage-property-staff", {
      body: { ...payload, property_id: propertyId },
    });
    if (error) throw new Error(error.message || "Request failed");
    if (data?.error) throw new Error(data.error);
    return data;
  };

  const handleAddStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!propertyId) return;
    setAddLoading(true);
    try {
      await invokeStaffAction({ action: "create", email: addEmail, full_name: addName, staff_role: addRole, password: addPassword });
      toast.success(`Staff member ${addName} created`);
      setShowAddDialog(false);
      setAddEmail(""); setAddName(""); setAddRole("front_desk"); setAddPassword("");
      fetchStaff();
    } catch (err: any) { toast.error(err.message); }
    finally { setAddLoading(false); }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResetDialog) return;
    setResetLoading(true);
    try {
      await invokeStaffAction({ action: "reset-password", staff_id: showResetDialog.id, password: resetPassword });
      toast.success("Password reset successfully");
      setShowResetDialog(null); setResetPassword(""); fetchStaff();
    } catch (err: any) { toast.error(err.message); }
    finally { setResetLoading(false); }
  };

  const handleToggleActive = async (member: StaffMember) => {
    try {
      await invokeStaffAction({ action: member.is_active ? "deactivate" : "activate", staff_id: member.id });
      toast.success(member.is_active ? "Staff deactivated" : "Staff reactivated");
      fetchStaff();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleRoleChange = async (member: StaffMember, newRole: PmsStaffRole) => {
    try {
      await invokeStaffAction({ action: "update-role", staff_id: member.id, staff_role: newRole });
      toast.success(`Role updated to ${ROLE_LABELS[newRole]}`);
      fetchStaff();
    } catch (err: any) { toast.error(err.message); }
  };

  const handleCreateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createShift.mutateAsync({
        staff_id: shiftForm.staff_id,
        shift_type: shiftForm.shift_type,
        start_time: shiftForm.start_time,
        end_time: shiftForm.end_time,
        notes: shiftForm.notes || undefined,
      });
      setShowShiftDialog(false);
      setShiftForm({ staff_id: "", shift_type: "morning", start_time: "", end_time: "", notes: "" });
    } catch (err: any) { toast.error(err.message); }
  };

  const handleEditShift = (shift: any) => {
    setEditingShift(shift);
    setShiftForm({
      staff_id: shift.staff_id,
      shift_type: shift.shift_type,
      start_time: shift.start_time ? format(parseISO(shift.start_time), "yyyy-MM-dd'T'HH:mm") : "",
      end_time: shift.end_time ? format(parseISO(shift.end_time), "yyyy-MM-dd'T'HH:mm") : "",
      notes: shift.notes || "",
    });
    setShowShiftDialog(true);
  };

  const handleUpdateShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingShift) return;
    try {
      await updateShift.mutateAsync({
        id: editingShift.id,
        staff_id: shiftForm.staff_id,
        shift_type: shiftForm.shift_type,
        start_time: shiftForm.start_time,
        end_time: shiftForm.end_time,
        notes: shiftForm.notes || undefined,
      });
      setShowShiftDialog(false);
      setEditingShift(null);
      setShiftForm({ staff_id: "", shift_type: "morning", start_time: "", end_time: "", notes: "" });
    } catch (err: any) { toast.error(err.message); }
  };

  const handleDeleteShift = async (shiftId: string) => {
    try {
      await deleteShift.mutateAsync(shiftId);
    } catch (err: any) { toast.error(err.message); }
  };

  const openNewShiftDialog = () => {
    setEditingShift(null);
    setShiftForm({ staff_id: "", shift_type: "morning", start_time: "", end_time: "", notes: "" });
    setShowShiftDialog(true);
  };

  const getShiftsForStaffDay = (staffId: string, day: Date) => {
    return shifts.filter((s: any) => {
      if (s.staff_id !== staffId) return false;
      const shiftDate = parseISO(s.start_time);
      return isSameDay(shiftDate, day);
    });
  };

  const getShiftBadgeClass = (shiftType: string) => {
    return SHIFT_TYPES.find(t => t.value === shiftType)?.color || SHIFT_TYPES[4].color;
  };

  const filteredActivity = activityFilter
    ? activityLog.filter((a: any) => a.action.toLowerCase().includes(activityFilter.toLowerCase()) || a.staff?.display_name?.toLowerCase().includes(activityFilter.toLowerCase()))
    : activityLog;

  const activeStaff = staff.filter(s => s.is_active);

  return (
    <>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Staff Management</h1>
            <p className="text-sm text-muted-foreground">Manage users, shifts, and activity for your property</p>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" /> Add Staff
          </Button>
        </div>

        {/* Staff Login URLs */}
        {(portfolioLoginUrl || staffLoginUrl) && (
          <Card className="border-dashed">
            <CardContent className="py-4 px-5 space-y-3">
              {portfolioLoginUrl && (
                <div className="flex items-center gap-3">
                  <Link2 className="h-4 w-4 text-primary shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-primary mb-1">Portfolio Staff Login (Primary)</p>
                    <code className="text-sm text-foreground bg-muted px-2 py-1 rounded block truncate">{portfolioLoginUrl}</code>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyUrl(portfolioLoginUrl, "Portfolio login")}><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy</Button>
                </div>
              )}
              {staffLoginUrl && (
                <div className="flex items-center gap-3">
                  <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-1">Property Staff Login</p>
                    <code className="text-sm text-foreground bg-muted px-2 py-1 rounded block truncate">{staffLoginUrl}</code>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copyUrl(staffLoginUrl, "Property login")}><Copy className="h-3.5 w-3.5 mr-1.5" /> Copy</Button>
                </div>
              )}
            </CardContent>
          </Card>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="roster"><Shield className="h-3.5 w-3.5 mr-1.5" /> Roster</TabsTrigger>
            <TabsTrigger value="shifts"><CalendarDays className="h-3.5 w-3.5 mr-1.5" /> Shifts</TabsTrigger>
            <TabsTrigger value="activity"><Activity className="h-3.5 w-3.5 mr-1.5" /> Activity</TabsTrigger>
          </TabsList>

          {/* Roster Tab */}
          <TabsContent value="roster">
            <Card>
              <CardHeader><CardTitle className="text-base">Property Staff</CardTitle></CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground py-8 text-center">Loading staff…</p>
                ) : staff.length === 0 ? (
                  <div className="text-center py-12 space-y-2">
                    <Shield className="h-10 w-10 mx-auto text-muted-foreground/50" />
                    <p className="text-sm text-muted-foreground">No staff members yet</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
                      <UserPlus className="h-4 w-4 mr-2" /> Add your first staff member
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[60px]" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {staff.map((member) => (
                        <TableRow key={member.id}>
                          <TableCell className="font-medium">{member.display_name}</TableCell>
                          <TableCell className="text-muted-foreground">{member.email || "—"}</TableCell>
                          <TableCell>
                            <Badge variant="secondary" className="text-xs">{ROLE_LABELS[member.staff_role] || member.staff_role}</Badge>
                          </TableCell>
                          <TableCell>
                            {member.is_active ? (
                              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Active</Badge>
                            ) : (
                              <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                            )}
                            {member.must_change_password && (
                              <Badge variant="outline" className="ml-1 text-amber-600 border-amber-200 text-[10px]">Needs PW Change</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8"><MoreHorizontal className="h-4 w-4" /></Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setShowResetDialog(member)}>
                                  <KeyRound className="h-4 w-4 mr-2" /> Reset Password
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleToggleActive(member)}>
                                  {member.is_active ? <><UserX className="h-4 w-4 mr-2" /> Deactivate</> : <><UserCheck className="h-4 w-4 mr-2" /> Reactivate</>}
                                </DropdownMenuItem>
                                {ASSIGNABLE_ROLES.filter(r => r !== member.staff_role).map(role => (
                                  <DropdownMenuItem key={role} onClick={() => handleRoleChange(member, role)}>
                                    Change to {ROLE_LABELS[role]}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Shifts Tab */}
          <TabsContent value="shifts">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w - 1)}>← Prev</Button>
                  <span className="text-sm font-medium px-2">
                    {format(weekDays[0], "MMM d")} – {format(weekDays[6], "MMM d, yyyy")}
                  </span>
                  <Button variant="outline" size="sm" onClick={() => setWeekOffset(w => w + 1)}>Next →</Button>
                  {weekOffset !== 0 && <Button variant="ghost" size="sm" onClick={() => setWeekOffset(0)}>Today</Button>}
                </div>
                <Button size="sm" onClick={openNewShiftDialog}>
                  <Clock className="h-4 w-4 mr-1.5" /> Add Shift
                </Button>
              </div>

              {activeStaff.length === 0 ? (
                <Card><CardContent className="py-12 text-center text-muted-foreground">
                  <Shield className="h-10 w-10 mx-auto mb-3 opacity-40" />
                  <p>Add staff members first to schedule shifts</p>
                </CardContent></Card>
              ) : (
                <div className="border rounded-lg overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="sticky left-0 bg-background z-10 min-w-[140px]">Staff Member</TableHead>
                        {weekDays.map(d => (
                          <TableHead key={d.toISOString()} className="text-center min-w-[100px] text-xs">
                            <div>{format(d, "EEE")}</div>
                            <div className="text-muted-foreground">{format(d, "d MMM")}</div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeStaff.map(member => (
                        <TableRow key={member.id}>
                          <TableCell className="sticky left-0 bg-background z-10">
                            <div className="font-medium text-sm">{member.display_name}</div>
                            <div className="text-[10px] text-muted-foreground">{ROLE_LABELS[member.staff_role]}</div>
                          </TableCell>
                          {weekDays.map(d => {
                            const dayShifts = getShiftsForStaffDay(member.id, d);
                            return (
                              <TableCell key={d.toISOString()} className="text-center p-1">
                                {dayShifts.length > 0 ? (
                                  <div className="space-y-0.5">
                                    {dayShifts.map((s: any) => (
                                      <DropdownMenu key={s.id}>
                                        <DropdownMenuTrigger asChild>
                                          <button className={`text-[10px] w-full rounded-md border px-1.5 py-0.5 cursor-pointer hover:ring-1 hover:ring-primary/40 transition-all ${getShiftBadgeClass(s.shift_type)}`}>
                                            {s.shift_type === "custom"
                                              ? `${format(parseISO(s.start_time), "HH:mm")}–${format(parseISO(s.end_time), "HH:mm")}`
                                              : SHIFT_TYPES.find(t => t.value === s.shift_type)?.label || s.shift_type
                                            }
                                          </button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="center" className="min-w-[140px]">
                                          <DropdownMenuItem onClick={() => handleEditShift(s)} className="text-xs gap-2">
                                            <Pencil className="h-3 w-3" /> Edit Shift
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem onClick={() => handleDeleteShift(s.id)} className="text-xs gap-2 text-destructive focus:text-destructive">
                                            <Trash2 className="h-3 w-3" /> Delete Shift
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    ))}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground/30 text-xs">—</span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              {/* Shift Legend */}
              <div className="flex flex-wrap gap-3 text-xs">
                {SHIFT_TYPES.map(t => (
                  <div key={t.value} className="flex items-center gap-1.5">
                    <Badge variant="outline" className={`text-[10px] ${t.color}`}>{t.label}</Badge>
                  </div>
                ))}
              </div>
            </div>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <div className="space-y-4">
              <Input
                placeholder="Filter by action or staff name…"
                value={activityFilter}
                onChange={e => setActivityFilter(e.target.value)}
                className="max-w-sm"
              />
              <Card>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Staff</TableHead>
                      <TableHead>Action</TableHead>
                      <TableHead>Details</TableHead>
                      <TableHead>Time</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredActivity.length === 0 ? (
                      <TableRow><TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                        <Activity className="h-8 w-8 mx-auto mb-2 opacity-40" />
                        No activity recorded yet
                      </TableCell></TableRow>
                    ) : filteredActivity.map((a: any) => (
                      <TableRow key={a.id}>
                        <TableCell className="text-sm font-medium">{a.staff?.display_name || "—"}</TableCell>
                        <TableCell><Badge variant="outline" className="text-[10px] capitalize">{a.action.replace(/_/g, " ")}</Badge></TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                          {a.details ? JSON.stringify(a.details) : "—"}
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                          {format(new Date(a.created_at), "MMM d, HH:mm")}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Add Staff Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Staff Member</DialogTitle>
            <DialogDescription>Create a new user account. They must change password on first login.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddStaff} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input value={addName} onChange={e => setAddName(e.target.value)} required placeholder="John Doe" />
            </div>
            <div className="space-y-2">
              <Label>Email Address</Label>
              <Input type="email" value={addEmail} onChange={e => setAddEmail(e.target.value)} required placeholder="john@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={addRole} onValueChange={(v) => setAddRole(v as PmsStaffRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ASSIGNABLE_ROLES.map(role => (
                    <SelectItem key={role} value={role}>
                      <div>
                        <span className="font-medium">{ROLE_LABELS[role]}</span>
                        <span className="block text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[role]}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Initial Password</Label>
              <Input type="password" value={addPassword} onChange={e => setAddPassword(e.target.value)} required minLength={8} placeholder="Minimum 8 characters" />
              <p className="text-xs text-muted-foreground">User will be forced to change this on first login.</p>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
              <Button type="submit" disabled={addLoading}>{addLoading ? "Creating…" : "Create Staff Member"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog */}
      <Dialog open={!!showResetDialog} onOpenChange={() => setShowResetDialog(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set a new password for {showResetDialog?.display_name}.</DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} required minLength={8} placeholder="Minimum 8 characters" />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowResetDialog(null)}>Cancel</Button>
              <Button type="submit" disabled={resetLoading}>{resetLoading ? "Resetting…" : "Reset Password"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Create / Edit Shift Dialog */}
      <Dialog open={showShiftDialog} onOpenChange={(open) => { setShowShiftDialog(open); if (!open) setEditingShift(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editingShift ? "Edit Shift" : "Add Shift"}</DialogTitle>
            <DialogDescription>{editingShift ? "Update shift details." : "Schedule a shift for a staff member."}</DialogDescription>
          </DialogHeader>
          <form onSubmit={editingShift ? handleUpdateShift : handleCreateShift} className="space-y-4">
            <div className="space-y-2">
              <Label>Staff Member</Label>
              <Select value={shiftForm.staff_id} onValueChange={v => setShiftForm(f => ({ ...f, staff_id: v }))}>
                <SelectTrigger><SelectValue placeholder="Select staff" /></SelectTrigger>
                <SelectContent>
                  {activeStaff.map(s => (
                    <SelectItem key={s.id} value={s.id}>{s.display_name} ({ROLE_LABELS[s.staff_role]})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Shift Type</Label>
              <Select value={shiftForm.shift_type} onValueChange={v => setShiftForm(f => ({ ...f, shift_type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {SHIFT_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start</Label>
                <Input type="datetime-local" value={shiftForm.start_time} onChange={e => setShiftForm(f => ({ ...f, start_time: e.target.value }))} required />
              </div>
              <div className="space-y-2">
                <Label>End</Label>
                <Input type="datetime-local" value={shiftForm.end_time} onChange={e => setShiftForm(f => ({ ...f, end_time: e.target.value }))} required />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea value={shiftForm.notes} onChange={e => setShiftForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setShowShiftDialog(false); setEditingShift(null); }}>Cancel</Button>
              {editingShift ? (
                <Button type="submit" disabled={updateShift.isPending || !shiftForm.staff_id}>
                  {updateShift.isPending ? "Saving…" : "Save Changes"}
                </Button>
              ) : (
                <Button type="submit" disabled={createShift.isPending || !shiftForm.staff_id}>
                  {createShift.isPending ? "Creating…" : "Create Shift"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
