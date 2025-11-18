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

const Admin = () => {
  const navigate = useNavigate();
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [currency, setCurrency] = useState("USD");

  const { data: properties, isLoading } = useQuery({
    queryKey: ["properties"],
    queryFn: async () => {
      const { data: propertiesData, error: propertiesError } = await supabase
        .from("properties")
        .select("*")
        .order("created_at", { ascending: false });
      
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

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    toast.success("Settings saved successfully!");
  };

  const handleDeleteProperty = async (id: string) => {
    try {
      const { error } = await supabase
        .from("properties")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
      toast.success("Property deleted successfully!");
    } catch (error) {
      toast.error("Failed to delete property");
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
                {properties?.length || 0} properties in your system
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
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Property Management</CardTitle>
                    <CardDescription>
                      Manage properties synced from your connected systems
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
                ) : !properties || properties.length === 0 ? (
                  <div className="text-center py-12">
                    <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <h3 className="text-lg font-semibold mb-2">No Properties Yet</h3>
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
                      {properties.map((property) => (
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
                              variant={property.is_active ? "default" : "secondary"}
                              className={property.is_active ? "bg-green-100 text-green-800 hover:bg-green-100" : ""}
                            >
                              {property.is_active ? "Active" : "Inactive"}
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
