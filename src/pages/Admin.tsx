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
import { Building2, Settings, Edit, Trash2, Home, ExternalLink, CheckCircle2, Calendar, Megaphone, BookOpen, PieChart } from "lucide-react";
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
  const [selectedSection, setSelectedSection] = useState<"properties" | "calendar" | "promotion" | "bookings" | "reports">("properties");

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

        {/* Quick Stats Banner */}
        <div className="mb-8 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <Card 
            className={`border-2 cursor-pointer transition-all ${
              selectedSection === "properties" 
                ? "border-primary bg-primary/5" 
                : "border-primary/20 hover:border-primary/40"
            }`}
            onClick={() => setSelectedSection("properties")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-5 w-5 text-primary" />
                Properties Overview
              </CardTitle>
              <CardDescription className="text-sm">
                {activeProperties.length} active, {deletedProperties.length} deleted
              </CardDescription>
            </CardHeader>
          </Card>

          <Card 
            className={`border-2 cursor-pointer transition-all ${
              selectedSection === "calendar" 
                ? "border-primary bg-primary/5" 
                : "border-primary/20 hover:border-primary/40"
            }`}
            onClick={() => setSelectedSection("calendar")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Calendar className="h-5 w-5 text-primary" />
                Calendar
              </CardTitle>
              <CardDescription className="text-sm">
                Manage bookings calendar
              </CardDescription>
            </CardHeader>
          </Card>

          <Card 
            className={`border-2 cursor-pointer transition-all ${
              selectedSection === "promotion" 
                ? "border-primary bg-primary/5" 
                : "border-primary/20 hover:border-primary/40"
            }`}
            onClick={() => setSelectedSection("promotion")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Megaphone className="h-5 w-5 text-primary" />
                Promotion
              </CardTitle>
              <CardDescription className="text-sm">
                Marketing campaigns
              </CardDescription>
            </CardHeader>
          </Card>

          <Card 
            className={`border-2 cursor-pointer transition-all ${
              selectedSection === "bookings" 
                ? "border-primary bg-primary/5" 
                : "border-primary/20 hover:border-primary/40"
            }`}
            onClick={() => setSelectedSection("bookings")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookOpen className="h-5 w-5 text-primary" />
                Bookings
              </CardTitle>
              <CardDescription className="text-sm">
                View all reservations
              </CardDescription>
            </CardHeader>
          </Card>

          <Card 
            className={`border-2 cursor-pointer transition-all ${
              selectedSection === "reports" 
                ? "border-primary bg-primary/5" 
                : "border-primary/20 hover:border-primary/40"
            }`}
            onClick={() => setSelectedSection("reports")}
          >
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <PieChart className="h-5 w-5 text-primary" />
                Reports
              </CardTitle>
              <CardDescription className="text-sm">
                Analytics & insights
              </CardDescription>
            </CardHeader>
          </Card>
        </div>

        {/* Dynamic Content Based on Selected Section */}
        {selectedSection === "properties" && (
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
        )}

        {/* Calendar Section */}
        {selectedSection === "calendar" && (
          <Tabs defaultValue="accommodation" className="space-y-4">
            <TabsList className="bg-secondary">
              <TabsTrigger value="accommodation">Accommodation</TabsTrigger>
              <TabsTrigger value="event">Event/Wedding</TabsTrigger>
              <TabsTrigger value="conference">Conference</TabsTrigger>
            </TabsList>

            <TabsContent value="accommodation">
              <Card>
                <CardHeader>
                  <CardTitle>Accommodation Calendar</CardTitle>
                  <CardDescription>Manage accommodation bookings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Accommodation calendar coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="event">
              <Card>
                <CardHeader>
                  <CardTitle>Event/Wedding Calendar</CardTitle>
                  <CardDescription>Manage event and wedding bookings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Event/Wedding calendar coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="conference">
              <Card>
                <CardHeader>
                  <CardTitle>Conference Calendar</CardTitle>
                  <CardDescription>Manage conference bookings</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Conference calendar coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Promotion Section */}
        {selectedSection === "promotion" && (
          <Tabs defaultValue="accommodation" className="space-y-4">
            <TabsList className="bg-secondary">
              <TabsTrigger value="accommodation">Accommodation</TabsTrigger>
              <TabsTrigger value="event">Event/Wedding</TabsTrigger>
              <TabsTrigger value="conference">Conference</TabsTrigger>
            </TabsList>

            <TabsContent value="accommodation">
              <Card>
                <CardHeader>
                  <CardTitle>Accommodation Promotions</CardTitle>
                  <CardDescription>Manage accommodation marketing campaigns</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Accommodation promotions coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="event">
              <Card>
                <CardHeader>
                  <CardTitle>Event/Wedding Promotions</CardTitle>
                  <CardDescription>Manage event and wedding marketing campaigns</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Event/Wedding promotions coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="conference">
              <Card>
                <CardHeader>
                  <CardTitle>Conference Promotions</CardTitle>
                  <CardDescription>Manage conference marketing campaigns</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Conference promotions coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Bookings Section */}
        {selectedSection === "bookings" && (
          <Tabs defaultValue="accommodation" className="space-y-4">
            <TabsList className="bg-secondary">
              <TabsTrigger value="accommodation">Accommodation</TabsTrigger>
              <TabsTrigger value="event">Event/Wedding</TabsTrigger>
              <TabsTrigger value="conference">Conference</TabsTrigger>
            </TabsList>

            <TabsContent value="accommodation">
              <Card>
                <CardHeader>
                  <CardTitle>Accommodation Bookings</CardTitle>
                  <CardDescription>View all accommodation reservations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Accommodation bookings coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="event">
              <Card>
                <CardHeader>
                  <CardTitle>Event/Wedding Bookings</CardTitle>
                  <CardDescription>View all event and wedding reservations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Event/Wedding bookings coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="conference">
              <Card>
                <CardHeader>
                  <CardTitle>Conference Bookings</CardTitle>
                  <CardDescription>View all conference reservations</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Conference bookings coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Reports Section */}
        {selectedSection === "reports" && (
          <Tabs defaultValue="accommodation" className="space-y-4">
            <TabsList className="bg-secondary">
              <TabsTrigger value="accommodation">Accommodation</TabsTrigger>
              <TabsTrigger value="venue">Venue</TabsTrigger>
            </TabsList>

            <TabsContent value="accommodation">
              <Card>
                <CardHeader>
                  <CardTitle>Accommodation Reports</CardTitle>
                  <CardDescription>View accommodation analytics & insights</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <PieChart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Accommodation reports coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="venue">
              <Card>
                <CardHeader>
                  <CardTitle>Venue Reports</CardTitle>
                  <CardDescription>View venue analytics & insights</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="text-center py-12">
                    <PieChart className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Venue reports coming soon</p>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}

        {/* Settings Section - Always visible at bottom */}
        <div className="mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5 text-primary" />
                General Settings
              </CardTitle>
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
        </div>
      </div>
    </div>
  );
};

export default Admin;
