import { useState, useEffect, useMemo } from "react";
import { format } from "date-fns";
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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Shield, User, Search, Trash2, Building2, Plus, KeyRound, Users, ChevronDown, ChevronRight, Link, Pencil, X } from "lucide-react";
import { AddUserModal } from "@/components/AddUserModal";
import { AddPMSModal } from "@/components/AddPMSModal";
import { EditUserModal } from "@/components/EditUserModal";
import { getPMSSystemByKey } from "@/lib/pmsSystemsConfig";
import { OwnerPMSConnectionCard } from "@/components/pms/OwnerPMSConnectionCard";

interface PMSCredential {
  id: string;
  owner_id: string;
  system_type: string;
  api_key: string | null;
  environment: string;
  external_account_id: string | null;
  external_account_name: string | null;
  available_listings: any[] | null;
  last_sync_at: string | null;
  sync_status: string | null;
  sync_error: string | null;
  is_active: boolean;
}

interface UserProfile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: string;
  created_at: string;
  property_count?: number;
  pms_credentials?: PMSCredential[];
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
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());
  
  // Add PMS modal state
  const [addPMSModalOpen, setAddPMSModalOpen] = useState(false);
  const [addPMSForUser, setAddPMSForUser] = useState<UserProfile | null>(null);
  
  // Edit user modal state
  const [editUserModalOpen, setEditUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null);

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

      // Get all PMS credentials with full data
      const { data: pmsCredentials, error: pmsError } = await supabase
        .from("owner_pms_credentials")
        .select("*");

      if (pmsError) throw pmsError;

      // Get property counts for each user
      const usersWithData = await Promise.all(
        (profiles || []).map(async (profile) => {
          // Get all roles for this user and prioritize: dev > fearless_leader > admin > user
          const userRoles = roles?.filter(r => r.user_id === profile.id).map(r => r.role) || [];
          let primaryRole = "user";
          if (userRoles.includes("dev")) {
            primaryRole = "dev";
          } else if (userRoles.includes("fearless_leader")) {
            primaryRole = "fearless_leader";
          } else if (userRoles.includes("admin")) {
            primaryRole = "admin";
          } else if (userRoles.includes("user")) {
            primaryRole = "user";
          }
          
          // Get PMS credentials for this user
          const userPMSCredentials = pmsCredentials?.filter(c => c.owner_id === profile.id) || [];
          
          // Count properties owned by this user (only active, non-deleted)
          const { count } = await supabase
            .from("properties")
            .select("*", { count: "exact", head: true })
            .eq("owner_email", profile.email)
            .eq("is_active", true)
            .is("permanently_deleted_at", null);

          return {
            ...profile,
            role: primaryRole,
            property_count: count || 0,
            pms_credentials: userPMSCredentials.map(c => ({
              id: c.id,
              owner_id: c.owner_id,
              system_type: c.system_type,
              api_key: c.api_key,
              environment: c.environment || 'production',
              external_account_id: c.external_account_id,
              external_account_name: c.external_account_name,
              available_listings: c.available_listings as any[] | null,
              last_sync_at: c.last_sync_at,
              sync_status: c.sync_status,
              sync_error: c.sync_error,
              is_active: c.is_active ?? false,
            })),
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
      const term = searchTerm.toLowerCase();
      const filtered = users.filter((user) => {
        // Get PMS system names for this user
        const pmsNames = user.pms_credentials?.map(c => {
          const pmsSystem = getPMSSystemByKey(c.system_type);
          return pmsSystem?.name?.toLowerCase() || c.system_type.toLowerCase();
        }).join(' ') || '';
        
        // Format joined date for search
        const joinedDate = format(new Date(user.created_at), "MMM d, yyyy").toLowerCase();
        
        return (
          user.full_name?.toLowerCase().includes(term) ||
          user.email.toLowerCase().includes(term) ||
          user.role.toLowerCase().includes(term) ||
          pmsNames.includes(term) ||
          String(user.property_count || 0).includes(term) ||
          joinedDate.includes(term)
        );
      });
      setFilteredUsers(filtered);
    } else {
      setFilteredUsers(users);
    }
  }, [searchTerm, users]);

  const handleRoleChange = async (userId: string, newRole: string) => {
    try {
      // Delete all existing non-protected roles (keep dev/fearless_leader intact)
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId)
        .in("role", ["admin", "user"]);

      if (deleteError) throw deleteError;

      // Insert the new role
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role: newRole as "admin" | "user" });

      if (insertError) throw insertError;

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

  const handleDeletePMSCredential = async (credentialId: string, systemType: string) => {
    try {
      const { error } = await supabase
        .from("owner_pms_credentials")
        .delete()
        .eq("id", credentialId);

      if (error) throw error;

      toast.success(`${systemType} connection removed`);
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to remove PMS connection");
    }
  };

  const getInitials = (user: UserProfile) => {
    if (user.full_name) {
      return user.full_name.split(" ").map(n => n[0]).join("").toUpperCase();
    }
    return user.email.substring(0, 2).toUpperCase();
  };

  const toggleUserExpanded = (userId: string) => {
    setExpandedUsers(prev => {
      const newSet = new Set(prev);
      if (newSet.has(userId)) {
        newSet.delete(userId);
      } else {
        newSet.add(userId);
      }
      return newSet;
    });
  };

  const getPMSBadgeVariant = (syncStatus: string | null): "default" | "secondary" | "destructive" | "outline" => {
    switch (syncStatus) {
      case 'connected':
        return 'default';
      case 'pending':
        return 'secondary';
      case 'error':
        return 'destructive';
      default:
        return 'outline';
    }
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 xl:gap-6 mb-6">
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
                {/* Hidden decoy input to absorb browser autofill */}
                <input 
                  type="text" 
                  name="fake-email" 
                  autoComplete="username" 
                  className="hidden" 
                  tabIndex={-1}
                  aria-hidden="true"
                />
                <Input
                  placeholder="Search all columns..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9 h-9"
                  autoComplete="new-password"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  name="filter-query-x1"
                  data-form-type="other"
                  data-lpignore="true"
                />
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/30 hover:bg-muted/30">
                  <TableHead className="py-3 px-5 text-xs font-medium w-8"></TableHead>
                  <TableHead className="py-3 text-xs font-medium">User</TableHead>
                  <TableHead className="py-3 text-xs font-medium">Role</TableHead>
                  <TableHead className="py-3 text-xs font-medium">PMS</TableHead>
                  <TableHead className="text-center py-3 text-xs font-medium">Properties</TableHead>
                  <TableHead className="py-3 text-xs font-medium">Joined</TableHead>
                  <TableHead className="text-right py-3 px-5 text-xs font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredUsers.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground text-xs py-4">
                      {searchTerm ? "No users found" : "No users yet"}
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredUsers.map((user) => {
                    const hasPMSCredentials = user.pms_credentials && user.pms_credentials.length > 0;
                    const hasPendingPMS = user.pms_credentials?.some(c => c.sync_status === 'pending');
                    const isExpanded = expandedUsers.has(user.id);

                    return (
                      <Collapsible key={user.id} open={isExpanded} onOpenChange={() => toggleUserExpanded(user.id)} asChild>
                        <>
                          <TableRow className="h-10 group hover:bg-muted/30">
                            <TableCell className="py-1 px-2 w-8">
                              {hasPMSCredentials && (
                                <CollapsibleTrigger asChild>
                                  <Button variant="ghost" size="icon" className="h-6 w-6">
                                    {isExpanded ? (
                                      <ChevronDown className="h-3 w-3" />
                                    ) : (
                                      <ChevronRight className="h-3 w-3" />
                                    )}
                                  </Button>
                                </CollapsibleTrigger>
                              )}
                            </TableCell>
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
                              ) : user.role === "fearless_leader" ? (
                                <div className="flex items-center gap-1 px-2 py-1 border rounded bg-muted/50 w-fit">
                                  <Shield className="h-3 w-3 text-accent" />
                                  <span className="text-xs font-medium">Fearless Leader</span>
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
                            <TableCell className="py-1">
                              <div className="flex items-center gap-1">
                                {hasPMSCredentials ? (
                                  <div className="flex flex-wrap gap-1">
                                    {user.pms_credentials!.map((cred) => {
                                      const pmsInfo = getPMSSystemByKey(cred.system_type);
                                      return (
                                        <div key={cred.id} className="flex items-center gap-0.5 group/pms">
                                          <Badge 
                                            variant={getPMSBadgeVariant(cred.sync_status)}
                                            className="text-[10px] py-0 px-1.5"
                                          >
                                            {pmsInfo?.name || cred.system_type}
                                            {cred.sync_status === 'connected' && ' ✓'}
                                            {cred.sync_status === 'pending' && ' ⏳'}
                                            {cred.sync_status === 'pending_key' && ' 🔑'}
                                            {cred.sync_status === 'error' && ' ✗'}
                                          </Badge>
                                          <AlertDialog>
                                            <AlertDialogTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-4 w-4 opacity-0 group-hover/pms:opacity-100 transition-opacity"
                                                onClick={(e) => e.stopPropagation()}
                                                title={`Remove ${pmsInfo?.name || cred.system_type}`}
                                              >
                                                <X className="h-2.5 w-2.5 text-muted-foreground hover:text-destructive" />
                                              </Button>
                                            </AlertDialogTrigger>
                                            <AlertDialogContent onClick={(e) => e.stopPropagation()}>
                                              <AlertDialogHeader>
                                                <AlertDialogTitle>Remove PMS Connection</AlertDialogTitle>
                                                <AlertDialogDescription>
                                                  Are you sure you want to remove the {pmsInfo?.name || cred.system_type} connection for {user.full_name || user.email}?
                                                  This will not delete any imported properties.
                                                </AlertDialogDescription>
                                              </AlertDialogHeader>
                                              <AlertDialogFooter>
                                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                                <AlertDialogAction
                                                  onClick={() => handleDeletePMSCredential(cred.id, pmsInfo?.name || cred.system_type)}
                                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                                >
                                                  Remove
                                                </AlertDialogAction>
                                              </AlertDialogFooter>
                                            </AlertDialogContent>
                                          </AlertDialog>
                                        </div>
                                      );
                                    })}
                                  </div>
                                ) : (
                                  <span className="text-xs text-muted-foreground">—</span>
                                )}
                                {/* Add PMS button for owners */}
                                {user.role === "user" && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="h-5 w-5 ml-1"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setAddPMSForUser(user);
                                      setAddPMSModalOpen(true);
                                    }}
                                    title="Add PMS connection"
                                  >
                                    <Plus className="h-3 w-3" />
                                  </Button>
                                )}
                              </div>
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
                                  onClick={() => {
                                    setEditingUser(user);
                                    setEditUserModalOpen(true);
                                  }}
                                  title="Edit profile"
                                >
                                  <Pencil className="h-3 w-3" />
                                </Button>
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
                          {hasPMSCredentials && (
                            <CollapsibleContent asChild>
                              <TableRow className="bg-muted/20 hover:bg-muted/30">
                                <TableCell colSpan={7} className="p-4">
                                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                                    {user.pms_credentials!.filter(c => c.system_type === 'hostfully').map((cred) => (
                                      <OwnerPMSConnectionCard
                                        key={cred.id}
                                        ownerId={user.id}
                                        ownerName={user.full_name || user.email}
                                        ownerEmail={user.email}
                                        existingCredential={cred}
                                        onCredentialChange={loadUsers}
                                      />
                                    ))}
                                  </div>
                                </TableCell>
                              </TableRow>
                            </CollapsibleContent>
                          )}
                        </>
                      </Collapsible>
                    );
                  })
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
      
      {/* Add PMS Modal */}
      {addPMSForUser && (
        <AddPMSModal
          open={addPMSModalOpen}
          onOpenChange={(open) => {
            setAddPMSModalOpen(open);
            if (!open) setAddPMSForUser(null);
          }}
          ownerId={addPMSForUser.id}
          ownerName={addPMSForUser.full_name || addPMSForUser.email}
          ownerEmail={addPMSForUser.email}
          existingPMSSystems={addPMSForUser.pms_credentials?.map(c => c.system_type) || []}
          onCredentialAdded={loadUsers}
        />
      )}
      
      {/* Edit User Modal */}
      <EditUserModal
        open={editUserModalOpen}
        onOpenChange={(open) => {
          setEditUserModalOpen(open);
          if (!open) setEditingUser(null);
        }}
        user={editingUser}
        onUserUpdated={loadUsers}
      />
    </AppLayout>
  );
}
