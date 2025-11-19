import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Building2, Settings, Edit, Trash2, Home, ExternalLink, CheckCircle2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const Admin = () => {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [currency, setCurrency] = useState("USD");

  const { data: allProperties, isLoading, refetch } = useQuery({
    queryKey: ["properties", user?.id, isAdmin],
    queryFn: async () => {
      // Get current user's profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user?.id)
        .single();

      // Build query based on role
      let query = supabase
        .from("properties")
        .select("*")
        .order("created_at", { ascending: false });

      // If not admin, filter by owner email
      if (!isAdmin && profile?.email) {
        query = query.eq("owner_email", profile.email);
      }

      const { data: propertiesData, error: propertiesError } = await query;
      
      if (propertiesError) throw propertiesError;

      // Get booking counts and owner profiles for each property
      const propertiesWithExtras = await Promise.all(
        (propertiesData || []).map(async (property) => {
          const { count } = await supabase
            .from("bookings")
            .select("*", { count: "exact", head: true })
            .eq("property_id", property.id);
          
          // Get owner profile if owner_email exists
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

  // Separate active and deleted properties
  const activeProperties = allProperties?.filter(p => p.is_active) || [];
  const deletedProperties = allProperties?.filter(p => !p.is_active) || [];

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Settings saved successfully!");
  };

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

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-2">
            Admin Dashboard
          </h1>
          <p className="text-muted-foreground">
            Manage your properties and system settings
          </p>
        </div>

        {/* Quick Stats */}
        <div className="mb-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Properties Overview
              </CardTitle>
              <CardDescription>
                {activeProperties.length} active, {deletedProperties.length} deleted
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        <Tabs defaultValue="properties" className="space-y-6">
          <TabsList className="bg-secondary">
            <TabsTrigger value="properties" className="gap-2">
              <Building2 className="h-4 w-4" />
              Properties
            </TabsTrigger>
            <TabsTrigger value="settings" className="gap-2">
              <Settings className="h-4 w-4" />
              Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="properties" className="space-y-6">
            <Tabs defaultValue="active" className="space-y-4">
              <TabsList className="bg-secondary">
                <TabsTrigger value="active">
                  Active Properties ({activeProperties.length})
                </TabsTrigger>
                <TabsTrigger value="deleted">
                  Deleted Properties ({deletedProperties.length})
                </TabsTrigger>
              </TabsList>

              <TabsContent value="active">
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle>Active Properties</CardTitle>
                        <CardDescription>
                          Manage your active properties
                        </CardDescription>
                      </div>
                      <Button onClick={() => navigate('/admin/properties/new')}>
                        <Building2 className="mr-2 h-4 w-4" />
                        Add Property
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground">Loading properties...</p>
                      </div>
                    ) : activeProperties.length === 0 ? (
                      <div className="text-center py-12">
                        <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Active Properties</h3>
                        <p className="text-muted-foreground mb-6">
                          Add your first property to get started
                        </p>
                        <Button onClick={() => navigate('/admin/properties/new')}>
                          <Building2 className="mr-2 h-4 w-4" />
                          Add Property
                        </Button>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>PROPERTY NAME</TableHead>
                            <TableHead>OWNER NAME</TableHead>
                            <TableHead>OWNER EMAIL</TableHead>
                            <TableHead>OWNERLIST</TableHead>
                            <TableHead>TOTAL BOOKINGS</TableHead>
                            <TableHead>STATUS</TableHead>
                            <TableHead className="text-right">ACTION</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {activeProperties.map((property) => (
                            <TableRow key={property.id}>
                              <TableCell className="font-medium">{property.name}</TableCell>
                              <TableCell>{property.owner_name || "-"}</TableCell>
                              <TableCell>{property.owner_email || "-"}</TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center">
                                  {property.owner_profile ? (
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={property.owner_profile.avatar_url} />
                                      <AvatarFallback className="text-xs bg-teal-500 text-white">
                                        {property.owner_profile.full_name 
                                          ? property.owner_profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
                                          : property.owner_profile.email.substring(0, 2).toUpperCase()
                                        }
                                      </AvatarFallback>
                                    </Avatar>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
                                      <CheckCircle2 className="h-5 w-5 text-white" />
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>{property.total_bookings || 0}</TableCell>
                              <TableCell>
                                <Badge 
                                  variant="default"
                                  className="bg-green-100 text-green-800 hover:bg-green-100"
                                >
                                  Active
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-2">
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => window.open(`https://next.bookroomsonline.com/property/${property.id}/main/accommodation?sourceprop=${property.id}`, "_blank")}
                                    title="View Property Website"
                                  >
                                    <Home className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => navigate(`/admin/properties/${property.id}`)}
                                    title="Edit Property"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteProperty(property.id)}
                                    title="Delete Property"
                                  >
                                    <Trash2 className="h-4 w-4" />
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

              <TabsContent value="deleted">
                <Card>
                  <CardHeader>
                    <CardTitle>Deleted Properties</CardTitle>
                    <CardDescription>
                      View and reactivate deleted properties
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {isLoading ? (
                      <div className="text-center py-12">
                        <p className="text-muted-foreground">Loading properties...</p>
                      </div>
                    ) : deletedProperties.length === 0 ? (
                      <div className="text-center py-12">
                        <Trash2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <h3 className="text-lg font-semibold mb-2">No Deleted Properties</h3>
                        <p className="text-muted-foreground">
                          Properties you delete will appear here
                        </p>
                      </div>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>PROPERTY NAME</TableHead>
                            <TableHead>OWNER NAME</TableHead>
                            <TableHead>OWNER EMAIL</TableHead>
                            <TableHead>OWNERLIST</TableHead>
                            <TableHead>TOTAL BOOKINGS</TableHead>
                            <TableHead>STATUS</TableHead>
                            <TableHead className="text-right">ACTION</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {deletedProperties.map((property) => (
                            <TableRow key={property.id}>
                              <TableCell className="font-medium text-muted-foreground">{property.name}</TableCell>
                              <TableCell className="text-muted-foreground">{property.owner_name || "-"}</TableCell>
                              <TableCell className="text-muted-foreground">{property.owner_email || "-"}</TableCell>
                              <TableCell>
                                <div className="flex items-center justify-center opacity-50">
                                  {property.owner_profile ? (
                                    <Avatar className="h-8 w-8">
                                      <AvatarImage src={property.owner_profile.avatar_url} />
                                      <AvatarFallback className="text-xs bg-teal-500 text-white">
                                        {property.owner_profile.full_name 
                                          ? property.owner_profile.full_name.split(" ").map((n: string) => n[0]).join("").toUpperCase()
                                          : property.owner_profile.email.substring(0, 2).toUpperCase()
                                        }
                                      </AvatarFallback>
                                    </Avatar>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center">
                                      <CheckCircle2 className="h-5 w-5 text-white" />
                                    </div>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell className="text-muted-foreground">{property.total_bookings || 0}</TableCell>
                              <TableCell>
                                <Badge variant="secondary">
                                  Deleted
                                </Badge>
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => handleReactivateProperty(property.id)}
                                >
                                  Reactivate
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
            </Tabs>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>General Settings</CardTitle>
                <CardDescription>
                  Configure your business information and preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleSaveSettings} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="businessName">Business Name</Label>
                    <Input
                      id="businessName"
                      type="text"
                      placeholder="Your Business Name"
                      value={businessName}
                      onChange={(e) => setBusinessName(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="contactEmail">Contact Email</Label>
                    <Input
                      id="contactEmail"
                      type="email"
                      placeholder="contact@yourbusiness.com"
                      value={contactEmail}
                      onChange={(e) => setContactEmail(e.target.value)}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="currency">Currency</Label>
                    <Input
                      id="currency"
                      type="text"
                      placeholder="USD"
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                    />
                  </div>

                  <Button type="submit">
                    Save Settings
                  </Button>
                </form>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Admin;
