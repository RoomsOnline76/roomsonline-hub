import { useState, useEffect } from "react";
import { PMSLayout } from "@/components/layout/PMSLayout";
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
import { UserPlus, KeyRound, UserX, UserCheck, Shield, MoreHorizontal, Copy, Link2 } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { ROLE_LABELS, ROLE_DESCRIPTIONS, type PmsStaffRole } from "@/lib/pmsPermissions";

interface StaffMember {
  id: string;
  user_id: string;
  staff_role: PmsStaffRole;
  display_name: string;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  profiles?: { email: string } | null;
}

const ASSIGNABLE_ROLES: PmsStaffRole[] = [
  "general_manager", "front_desk", "housekeeping", "maintenance", "accountant", "auditor"
];

export default function PMSStaff() {
  const { propertyId, properties } = usePmsPropertyId();
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showResetDialog, setShowResetDialog] = useState<StaffMember | null>(null);
  const [propertySlug, setPropertySlug] = useState<string | null>(null);

  // Add form state
  const [addEmail, setAddEmail] = useState("");
  const [addName, setAddName] = useState("");
  const [addRole, setAddRole] = useState<PmsStaffRole>("front_desk");
  const [addPassword, setAddPassword] = useState("");
  const [addLoading, setAddLoading] = useState(false);

  // Reset password state
  const [resetPassword, setResetPassword] = useState("");
  const [resetLoading, setResetLoading] = useState(false);

  // Fetch property slug for login URL
  useEffect(() => {
    if (!propertyId) return;
    supabase
      .from("properties")
      .select("slug")
      .eq("id", propertyId)
      .single()
      .then(({ data }) => setPropertySlug(data?.slug || null));
  }, [propertyId]);

  const staffLoginUrl = propertySlug
    ? `${window.location.origin}/staff-login/${propertySlug}`
    : null;

  const copyLoginUrl = () => {
    if (staffLoginUrl) {
      navigator.clipboard.writeText(staffLoginUrl);
      toast.success("Staff login URL copied to clipboard");
    }
  };

  const fetchStaff = async () => {
    if (!propertyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("property_staff")
      .select("*, profiles:user_id(email)")
      .eq("property_id", propertyId)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching staff:", error);
    } else {
      setStaff((data as any) || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchStaff();
  }, [propertyId]);

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
      await invokeStaffAction({
        action: "create",
        email: addEmail,
        full_name: addName,
        staff_role: addRole,
        password: addPassword,
      });
      toast.success(`Staff member ${addName} created`);
      setShowAddDialog(false);
      setAddEmail(""); setAddName(""); setAddRole("front_desk"); setAddPassword("");
      fetchStaff();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!showResetDialog) return;
    setResetLoading(true);
    try {
      await invokeStaffAction({
        action: "reset-password",
        staff_id: showResetDialog.id,
        password: resetPassword,
      });
      toast.success("Password reset successfully");
      setShowResetDialog(null);
      setResetPassword("");
      fetchStaff();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setResetLoading(false);
    }
  };

  const handleToggleActive = async (member: StaffMember) => {
    try {
      await invokeStaffAction({
        action: member.is_active ? "deactivate" : "activate",
        staff_id: member.id,
      });
      toast.success(member.is_active ? "Staff deactivated" : "Staff reactivated");
      fetchStaff();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleRoleChange = async (member: StaffMember, newRole: PmsStaffRole) => {
    try {
      await invokeStaffAction({
        action: "update-role",
        staff_id: member.id,
        staff_role: newRole,
      });
      toast.success(`Role updated to ${ROLE_LABELS[newRole]}`);
      fetchStaff();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  return (
    <PMSLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Staff Management</h1>
            <p className="text-sm text-muted-foreground">Create and manage users for your property</p>
          </div>
          <Button onClick={() => setShowAddDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            Add Staff
          </Button>
        </div>

        {/* Staff Login URL */}
        {staffLoginUrl && (
          <Card className="border-dashed">
            <CardContent className="py-4 px-5 flex items-center gap-3">
              <Link2 className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-muted-foreground mb-1">Branded Staff Login URL</p>
                <code className="text-sm text-foreground bg-muted px-2 py-1 rounded block truncate">
                  {staffLoginUrl}
                </code>
              </div>
              <Button variant="outline" size="sm" onClick={copyLoginUrl}>
                <Copy className="h-3.5 w-3.5 mr-1.5" />
                Copy
              </Button>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Property Staff</CardTitle>
          </CardHeader>
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
                      <TableCell className="text-muted-foreground">
                        {(member.profiles as any)?.email || "—"}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="text-xs">
                          {ROLE_LABELS[member.staff_role] || member.staff_role}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {member.is_active ? (
                          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-200">Active</Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">Inactive</Badge>
                        )}
                        {member.must_change_password && (
                          <Badge variant="outline" className="ml-1 text-amber-600 border-amber-200 text-[10px]">
                            Needs PW Change
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setShowResetDialog(member)}>
                              <KeyRound className="h-4 w-4 mr-2" /> Reset Password
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => handleToggleActive(member)}>
                              {member.is_active ? (
                                <><UserX className="h-4 w-4 mr-2" /> Deactivate</>
                              ) : (
                                <><UserCheck className="h-4 w-4 mr-2" /> Reactivate</>
                              )}
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

        {/* Add Staff Dialog */}
        <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Add Staff Member</DialogTitle>
              <DialogDescription>
                Create a new user account for your property. They will be required to change their password on first login.
              </DialogDescription>
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
                <p className="text-xs text-muted-foreground">The user will be forced to change this on their first login.</p>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button type="submit" disabled={addLoading}>
                  {addLoading ? "Creating…" : "Create Staff Member"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>

        {/* Reset Password Dialog */}
        <Dialog open={!!showResetDialog} onOpenChange={() => setShowResetDialog(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Reset Password</DialogTitle>
              <DialogDescription>
                Set a new password for {showResetDialog?.display_name}. They will be required to change it on next login.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div className="space-y-2">
                <Label>New Password</Label>
                <Input type="password" value={resetPassword} onChange={e => setResetPassword(e.target.value)} required minLength={8} placeholder="Minimum 8 characters" />
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowResetDialog(null)}>Cancel</Button>
                <Button type="submit" disabled={resetLoading}>
                  {resetLoading ? "Resetting…" : "Reset Password"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </PMSLayout>
  );
}
