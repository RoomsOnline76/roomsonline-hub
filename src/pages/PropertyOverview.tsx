import { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Building2, Edit, Trash2, Home, CheckCircle2, AlertTriangle, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getPropertyUrl } from "@/lib/config";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type SortDirection = "asc" | "desc" | null;
type SortColumn = "name" | "external_system" | "owner_name" | "property_type" | "total_bookings" | null;

const PropertyOverview = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [propertyToDelete, setPropertyToDelete] = useState<{ id: string; name: string } | null>(null);

  // Search filters state
  const [searchName, setSearchName] = useState("");
  const [searchPms, setSearchPms] = useState("");
  const [searchOwnerName, setSearchOwnerName] = useState("");
  const [searchPropertyType, setSearchPropertyType] = useState("");

  // Sort state
  const [sortColumn, setSortColumn] = useState<SortColumn>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [homeIconOpenNewTab, setHomeIconOpenNewTab] = useState(true);

  // Load home icon new tab setting
  useEffect(() => {
    const loadHomeIconSetting = async () => {
      const { data } = await supabase
        .from("api_keys")
        .select("key_value")
        .eq("key_name", "HOME_ICON_OPEN_NEW_TAB")
        .maybeSingle();
      
      if (data?.key_value) {
        setHomeIconOpenNewTab(data.key_value === "true");
      }
    };
    loadHomeIconSetting();
  }, []);

  const { data: allProperties, isLoading, refetch } = useQuery({
    queryKey: ["properties", user?.id, isAdmin],
    queryFn: async () => {
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user?.id)
        .single();

      let query = supabase
        .from("properties")
        .select("*")
        .is("permanently_deleted_at", null)
        .order("created_at", { ascending: false });

      if (!isAdmin && profile?.email) {
        query = query.eq("owner_email", profile.email);
      }

      const { data: propertiesData, error: propertiesError } = await query;
      
      if (propertiesError) throw propertiesError;

      const propertiesWithExtras = await Promise.all(
        (propertiesData || []).map(async (property) => {
          const { count } = await supabase
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .eq("property_id", property.id);
          
          let ownerProfile = null;
          if (property.owner_email) {
            const { data: profileData } = await supabase
              .from("profiles")
              .select("*")
              .eq("email", property.owner_email)
              .single();
            ownerProfile = profileData;
          }
          
          return {
            ...property,
            total_bookings: count || 0,
            owner_profile: ownerProfile,
          };
        })
      );
      
      return propertiesWithExtras;
    },
  });

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortColumn(null);
        setSortDirection(null);
      } else {
        setSortDirection("asc");
      }
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const getSortIcon = (column: SortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
    if (sortDirection === "asc") return <ArrowUp className="h-3 w-3 ml-1" />;
    if (sortDirection === "desc") return <ArrowDown className="h-3 w-3 ml-1" />;
    return <ArrowUpDown className="h-3 w-3 ml-1 opacity-50" />;
  };

  // Filter and sort active properties
  const activeProperties = useMemo(() => {
    let filtered = (allProperties || []).filter(p => p.is_active);

    // Apply search filters
    if (searchName) {
      filtered = filtered.filter(p => 
        p.name?.toLowerCase().includes(searchName.toLowerCase())
      );
    }
    if (searchPms) {
      filtered = filtered.filter(p => 
        p.external_system?.toLowerCase().includes(searchPms.toLowerCase())
      );
    }
    if (searchOwnerName) {
      filtered = filtered.filter(p => 
        p.owner_name?.toLowerCase().includes(searchOwnerName.toLowerCase())
      );
    }
    if (searchPropertyType) {
      filtered = filtered.filter(p => 
        p.property_type?.toLowerCase().includes(searchPropertyType.toLowerCase())
      );
    }

    // Apply sorting
    if (sortColumn && sortDirection) {
      filtered = [...filtered].sort((a, b) => {
        let aVal: any = a[sortColumn];
        let bVal: any = b[sortColumn];

        // Handle null/undefined
        if (aVal == null) aVal = "";
        if (bVal == null) bVal = "";

        // String comparison
        if (typeof aVal === "string") {
          aVal = aVal.toLowerCase();
          bVal = bVal.toLowerCase();
        }

        if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
        return 0;
      });
    }

    return filtered;
  }, [allProperties, searchName, searchPms, searchOwnerName, searchPropertyType, sortColumn, sortDirection]);

  const deletedProperties = allProperties?.filter(p => !p.is_active) || [];

  const handleDeleteProperty = async (id: string) => {
    try {
      const { error } = await supabase
        .from("properties")
        .update({ is_active: false })
        .eq("id", id);
      
      if (error) throw error;
      toast.success("Property moved to deleted");
      refetch();
    } catch (error) {
      toast.error("Failed to delete property");
    }
  };

  const handleReactivateProperty = async (id: string) => {
    try {
      const { error } = await supabase
        .from("properties")
        .update({ is_active: true })
        .eq("id", id);
      
      if (error) throw error;
      toast.success("Property reactivated successfully!");
      refetch();
    } catch (error) {
      toast.error("Failed to reactivate property");
    }
  };

  const handlePermanentDelete = async () => {
    if (!propertyToDelete) return;
    
    try {
      const { error } = await supabase
        .from("properties")
        .update({ permanently_deleted_at: new Date().toISOString() })
        .eq("id", propertyToDelete.id);
      
      if (error) throw error;
      toast.success("Property permanently deleted. Historical data retained.");
      setPropertyToDelete(null);
      refetch();
    } catch (error) {
      toast.error("Failed to permanently delete property");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-3">
        <div className="flex items-baseline gap-2 mb-3">
          <h1 className="text-xl font-bold text-foreground">Property Overview</h1>
          <span className="text-xs text-muted-foreground">— Manage your properties</span>
        </div>

        <Tabs defaultValue="active" className="space-y-2">
          <TabsList className="bg-secondary h-8">
            <TabsTrigger value="active" className="gap-1 text-xs py-1">
              Active
              <Badge className="h-4 min-w-4 px-1 text-[10px] font-medium bg-primary/20 text-primary hover:bg-primary/20">
                {activeProperties.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="deleted" className="gap-1 text-xs py-1">
              Deleted
              <Badge className="h-4 min-w-4 px-1 text-[10px] font-medium bg-primary/20 text-primary hover:bg-primary/20">
                {deletedProperties.length}
              </Badge>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            <Card>
              <CardHeader className="py-3 px-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-sm">Active Properties</CardTitle>
                    <CardDescription className="text-xs">
                      Manage your active properties
                    </CardDescription>
                  </div>
                  <Button onClick={() => navigate('/admin/properties/new')} className="h-7 text-xs px-2">
                    <Building2 className="mr-1 h-3 w-3" />
                    Add Property
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="py-2 px-4">
                {isLoading ? (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground text-xs">Loading properties...</p>
                  </div>
                ) : activeProperties.length === 0 ? (
                  <div className="text-center py-6">
                    <Building2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <h3 className="text-sm font-semibold mb-1">No Active Properties</h3>
                    <p className="text-muted-foreground text-xs mb-3">
                      Add your first property to get started
                    </p>
                    <Button onClick={() => navigate('/admin/properties/new')} className="h-7 text-xs px-2">
                      <Building2 className="mr-1 h-3 w-3" />
                      Add Property
                    </Button>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="h-8">
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none py-1 text-xs"
                          onClick={() => handleSort("name")}
                        >
                          <div className="flex items-center">
                            NAME
                            {getSortIcon("name")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none py-1 text-xs"
                          onClick={() => handleSort("external_system")}
                        >
                          <div className="flex items-center">
                            PMS
                            {getSortIcon("external_system")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none py-1 text-xs"
                          onClick={() => handleSort("owner_name")}
                        >
                          <div className="flex items-center">
                            OWNER
                            {getSortIcon("owner_name")}
                          </div>
                        </TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none py-1 text-xs"
                          onClick={() => handleSort("property_type")}
                        >
                          <div className="flex items-center">
                            TYPE
                            {getSortIcon("property_type")}
                          </div>
                        </TableHead>
                        <TableHead className="py-1 text-xs">OWNER</TableHead>
                        <TableHead 
                          className="cursor-pointer hover:bg-muted/50 select-none py-1 text-xs"
                          onClick={() => handleSort("total_bookings")}
                        >
                          <div className="flex items-center">
                            BOOKINGS
                            {getSortIcon("total_bookings")}
                          </div>
                        </TableHead>
                        <TableHead className="py-1 text-xs">EXT ID</TableHead>
                        <TableHead className="text-right py-1 text-xs">ACTION</TableHead>
                      </TableRow>
                      {/* Search row */}
                      <TableRow className="hover:bg-transparent h-7">
                        <TableCell className="py-1">
                          <Input
                            placeholder="Search"
                            value={searchName}
                            onChange={(e) => setSearchName(e.target.value)}
                            className="h-6 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            placeholder="Search"
                            value={searchPms}
                            onChange={(e) => setSearchPms(e.target.value)}
                            className="h-6 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            placeholder="Search"
                            value={searchOwnerName}
                            onChange={(e) => setSearchOwnerName(e.target.value)}
                            className="h-6 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1">
                          <Input
                            placeholder="Search"
                            value={searchPropertyType}
                            onChange={(e) => setSearchPropertyType(e.target.value)}
                            className="h-6 text-xs"
                          />
                        </TableCell>
                        <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1"></TableCell>
                        <TableCell className="py-1"></TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {activeProperties.map((property) => (
                        <TableRow key={property.id} className="h-8">
                          <TableCell className="font-medium py-1 text-xs">
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => {
                                  const url = getPropertyUrl(property.slug || property.id);
                                  if (homeIconOpenNewTab) {
                                    window.open(url, "_blank");
                                  } else {
                                    navigate(`/property/${property.slug || property.id}`);
                                  }
                                }}
                                title="View Property Showcase"
                              >
                                <Home className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-6 w-6"
                                onClick={() => navigate(`/admin/properties/${property.slug || property.id}`)}
                                title="Edit Property"
                              >
                                <Edit className="h-3 w-3" />
                              </Button>
                              <span>{property.name}</span>
                            </div>
                          </TableCell>
                          <TableCell className="py-1 text-xs">
                            {property.external_system ? (
                              <Badge variant="outline" className="capitalize text-[10px] px-1 py-0">
                                {property.external_system}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1 text-xs">{property.owner_name || "-"}</TableCell>
                          <TableCell className="py-1 text-xs">
                            <span className="capitalize">{property.property_type?.replace(/_/g, ' ') || "-"}</span>
                          </TableCell>
                          <TableCell className="py-1">
                            <div className="flex items-center justify-center">
                              {property.owner_profile ? (
                                <Avatar className="h-6 w-6">
                                  <AvatarImage src={property.owner_profile.avatar_url} />
                                  <AvatarFallback className="text-[10px] bg-teal-500 text-white">
                                    {property.owner_profile.full_name 
                                      ? property.owner_profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
                                      : property.owner_profile.email.substring(0, 2).toUpperCase()
                                    }
                                  </AvatarFallback>
                                </Avatar>
                              ) : (
                                <div className="w-6 h-6 rounded-full bg-teal-500 flex items-center justify-center">
                                  <CheckCircle2 className="h-3 w-3 text-white" />
                                </div>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="py-1 text-xs">{property.total_bookings || 0}</TableCell>
                          <TableCell className="py-1">
                            {(() => {
                              const externalId = property.external_id || 
                                property.benson_property_code || 
                                property.checkfront_property_code || 
                                property.siteminder_property_code;
                              return externalId ? (
                                <span className="font-mono text-[10px]">{externalId}</span>
                              ) : (
                                <span className="text-muted-foreground text-xs">—</span>
                              );
                            })()}
                          </TableCell>
                          <TableCell className="text-right py-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6"
                              onClick={() => handleDeleteProperty(property.id)}
                              title="Delete Property"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="deleted">
            <Card>
              <CardHeader className="py-3 px-4">
                <CardTitle className="text-sm">Deleted Properties</CardTitle>
                <CardDescription className="text-xs">
                  View and reactivate deleted properties
                </CardDescription>
              </CardHeader>
              <CardContent className="py-2 px-4">
                {isLoading ? (
                  <div className="text-center py-6">
                    <p className="text-muted-foreground text-xs">Loading properties...</p>
                  </div>
                ) : deletedProperties.length === 0 ? (
                  <div className="text-center py-6">
                    <Trash2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                    <h3 className="text-sm font-semibold mb-1">No Deleted Properties</h3>
                    <p className="text-muted-foreground text-xs">
                      Properties you delete will appear here
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow className="h-8">
                        <TableHead className="py-1 text-xs">NAME</TableHead>
                        <TableHead className="py-1 text-xs">PMS</TableHead>
                        <TableHead className="py-1 text-xs">OWNER</TableHead>
                        <TableHead className="py-1 text-xs">EMAIL</TableHead>
                        <TableHead className="py-1 text-xs">BOOKINGS</TableHead>
                        <TableHead className="py-1 text-xs">STATUS</TableHead>
                        <TableHead className="text-right py-1 text-xs">ACTION</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {deletedProperties.map((property) => (
                        <TableRow key={property.id} className="h-8">
                          <TableCell className="font-medium py-1 text-xs">{property.name}</TableCell>
                          <TableCell className="py-1 text-xs">
                            {property.external_system ? (
                              <Badge variant="outline" className="capitalize text-[10px] px-1 py-0">
                                {property.external_system}
                              </Badge>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="py-1 text-xs">{property.owner_name || "-"}</TableCell>
                          <TableCell className="py-1 text-xs">{property.owner_email || "-"}</TableCell>
                          <TableCell className="py-1 text-xs">{property.total_bookings || 0}</TableCell>
                          <TableCell className="py-1">
                            <Badge 
                              variant="secondary"
                              className="bg-red-100 text-red-800 text-[10px] px-1 py-0"
                            >
                              Deleted
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right py-1">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => handleReactivateProperty(property.id)}
                              >
                                Reactivate
                              </Button>
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-6 text-xs px-2"
                                onClick={() => setPropertyToDelete({ id: property.id, name: property.name })}
                              >
                                <Trash2 className="h-3 w-3 mr-1" />
                                Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Permanent Delete Confirmation Dialog */}
        <AlertDialog open={!!propertyToDelete} onOpenChange={(open) => !open && setPropertyToDelete(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                Permanently Delete Property
              </AlertDialogTitle>
              <AlertDialogDescription className="space-y-3">
                <p>
                  Are you sure you want to permanently delete <strong>"{propertyToDelete?.name}"</strong>?
                </p>
                <p className="text-sm">
                  This action will:
                </p>
                <ul className="list-disc pl-5 text-sm space-y-1">
                  <li>Remove the property from all listings</li>
                  <li>The property cannot be reactivated after this action</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  <strong>Note:</strong> Historical data including bookings and revenue will be retained for reporting purposes.
                </p>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handlePermanentDelete}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                Permanently Delete
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
};

export default PropertyOverview;
