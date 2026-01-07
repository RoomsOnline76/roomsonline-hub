import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { AppLayout } from "@/components/layout/AppLayout";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Shield, User, Search, Trash2, Building2, Plus, KeyRound, Users } from "lucide-react";
import { AddUserModal } from "@/components/AddUserModal";

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  property_count?: number;
}

export default function AdminUsers() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading, user: currentUser } = useAuth();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<UserProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [addAdminModalOpen, setAddAdminModalOpen] = useState(false);
  const [addOwnerModalOpen, setAddOwnerModalOpen] = useState(false);

  useEffect(() => {
    if (!authLoading && !isAdmin) {
      navigate("/");
      return;
    }
    if (!authLoading && isAdmin) {
      loadUsers();
    }
  }, [authLoading, isAdmin, navigate]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      
      // Get all profiles
      const { data: profiles, error: profilesError } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (profilesError) throw profilesError;

      // Get all user roles
      const { data: roles, error: rolesError } = await supabase
        .from("user_roles")
        .select("user_id, role");

      if (rolesError) throw rolesError;

      // Get property counts for each user
      const usersWithData = await Promise.all(
        (profiles || []).map(async (profile) => {
          // Get all roles for this user and prioritize: dev > admin > user
          const userRoles = roles?.filter(r => r.user_id === profile.id).map(r => r.role) || [];
          let primaryRole = "user";
          if (userRoles.includes("dev")) {
            primaryRole = "dev";
          } else if (userRoles.includes("admin")) {
            primaryRole = "admin";
          } else if (userRoles.includes("user")) {
            primaryRole = "user";
          }
          
          // Count properties owned by this user
          const { count } = await supabase
            .from("properties")
            .select("*", { count: "exact", head: true })
            .eq("owner_email", profile.email);

          return {
            ...profile,
            role: primaryRole,
            property_count: count || 0,
          };
        })
      );

      setUsers(usersWithData);
      setFilteredUsers(usersWithData);
    } catch (error: any) {
      toast.error(error.message || "Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (searchTerm) {
      const filtered = users.filter(
        (user) =>
          user.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          user.email.toLowerCase().includes(searchTerm.toLowerCase())
      );
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(users);
    }
  }, [searchTerm, users]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      // Check if user already has a role
      const { data: existingRole } = await supabase
        .from("user_roles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();

      if (existingRole) {
        // Update existing role
        const { error } = await supabase
          .from("user_roles")
          .update({ role: newRole as "admin" | "user" })
          .eq("user_id", userId);

        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from("user_roles")
          .insert({ user_id: userId, role: newRole as "admin" | "user" });

        if (error) throw error;
      }

      toast.success("User role updated successfully");
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to update user role");
    }
  };

  const devCount = useMemo(() => users.filter(u => u.role === "dev").length, [users]);

  const isLastDevUser = (user: UserProfile) => {
    return user.role === "dev" && devCount <= 1;
  };

  const handleDeleteUser = async (userId: string, userRole: string) => {
    // Prevent deleting the last dev user
    if (userRole === "dev" && devCount <= 1) {
      toast.error("Cannot delete the last dev user. Create another dev account first.");
      return;
    }

    try {
      // Delete user role first
      await supabase.from("user_roles").delete().eq("user_id", userId);

      // Delete user profile
      const { error } = await supabase
        .from("profiles")
        .delete()
        .eq("id", userId);

      if (error) throw error;

      toast.success("User deleted successfully");
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete user");
    }
  };

  const handleResetPassword = async (email: string) => {
    try {
      const { error } = await supabase.functions.invoke('reset-user-password', {
        body: { email }
      });

      if (error) throw error;

      toast.success(`Password reset email sent to ${email}`);
    } catch (error: any) {
      toast.error(error.message || "Failed to send reset email");
    }
  };

  const getInitials = (user: UserProfile) => {
    if (user.full_name) {
      return user.full_name.split(" ").map(n => n[0]).join("").toUpperCase();
    }
    return user.email.substring(0, 2).toUpperCase();
  };

  // Calculate counters based on current users state
  const totalUsers = useMemo(() => users.length, [users]);
  const adminCount = useMemo(() => users.filter(u => u.role === "admin").length, [users]);
  const ownerCount = useMemo(() => users.filter(u => u.role === "user").length, [users]);

  if (authLoading || loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="Team"
        subtitle={`${adminCount} admins · ${ownerCount} owners`}
        actions={
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAddOwnerModalOpen(true)}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Owner
            </Button>
            <Button
              size="sm"
              onClick={() => setAddAdminModalOpen(true)}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Admin
            </Button>
          </div>
        }
      />

        {/* Stats Cards - Refined */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="border-0 shadow-sm">
            <CardContent className="py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Users className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{totalUsers}</p>
                  <p className="text-xs text-muted-foreground">Total Users</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-accent/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-accent" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{adminCount}</p>
                  <p className="text-xs text-muted-foreground">Administrators</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardContent className="py-4 px-5">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-midnight/10 flex items-center justify-center">
                  <Building2 className="h-5 w-5 text-midnight" />
                </div>
                <div>
                  <p className="text-2xl font-semibold">{ownerCount}</p>
                  <p className="text-xs text-muted-foreground">Property Owners</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>


        {/* Users Table */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="py-4 px-5 border-b">
            <div className="flex items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base font-medium">All Users</CardTitle>
                <CardDescription className="text-xs mt-0.5">View and manage user accounts</CardDescription>
              </div>
              <div className="relative w-64">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="py-3 px-5 text-xs font-medium">User</TableHead>
                  <TableHead className="py-3 text-xs font-medium">Role</TableHead>
                  <TableHead className="text-center py-3 text-xs font-medium">Properties</TableHead>
                  <TableHead className="py-3 text-xs font-medium">Joined</TableHead>
                  <TableHead className="text-right py-3 px-5 text-xs font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground text-xs py-4">
                      {searchTerm ? "No users found" : "No users yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => (
                    <TableRow key={user.id} className="h-10 group hover:bg-muted/30">
                      <TableCell className="py-1">
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6">
                            <AvatarImage src={user.avatar_url || undefined} />
                            <AvatarFallback className="text-[10px]">{getInitials(user)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <p className="text-xs font-medium">
                              {user.full_name || "No name"}
                              {user.id === currentUser?.id && (
                                <Badge variant="outline" className="ml-1 text-[10px] py-0 px-1">You</Badge>
                              )}
                            </p>
                            <p className="text-[10px] text-muted-foreground">{user.email}</p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="py-1">
                        {user.role === "dev" ? (
                          <div className="flex items-center gap-1 px-2 py-1 border rounded bg-muted/50 w-fit">
                            <Shield className="h-3 w-3 text-primary" />
                            <span className="text-xs font-medium">Dev</span>
                          </div>
                        ) : (
                          <Select
                            value={user.role}
                            onValueChange={(value) => handleRoleChange(user.id, value)}
                            disabled={user.id === currentUser?.id}
                          >
                            <SelectTrigger className="w-[100px] h-7 text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="user">
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3" />
                                  <span className="text-xs">Owner</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="admin">
                                <div className="flex items-center gap-1">
                                  <Shield className="h-3 w-3" />
                                  <span className="text-xs">Admin</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        )}
                      </TableCell>
                      <TableCell className="text-center py-1">
                        <div className="flex items-center justify-center gap-1">
                          <Building2 className="h-3 w-3 text-muted-foreground" />
                          <span className="text-xs">{user.property_count || 0}</span>
                        </div>
                      </TableCell>
                      <TableCell className="py-1">
                        <span className="text-xs text-muted-foreground">
                          {new Date(user.created_at).toLocaleDateString()}
                        </span>
                      </TableCell>
                      <TableCell className="text-right py-1">
                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={() => handleResetPassword(user.email)}
                            disabled={user.id === currentUser?.id}
                            title="Reset password"
                          >
                            <KeyRound className="h-3 w-3" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                disabled={user.id === currentUser?.id || isLastDevUser(user)}
                                title={isLastDevUser(user) ? "Cannot delete the last dev user" : undefined}
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Delete User</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Are you sure you want to delete {user.full_name || user.email}? 
                                  This action cannot be undone and will remove all their data.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDeleteUser(user.id, user.role)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  Delete
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <AddUserModal
          open={addAdminModalOpen}
          onOpenChange={setAddAdminModalOpen}
          role="admin"
          onUserAdded={loadUsers}
        />

        <AddUserModal
          open={addOwnerModalOpen}
          onOpenChange={setAddOwnerModalOpen}
          role="user"
          onUserAdded={loadUsers}
        />
    </AppLayout>
  );
}
