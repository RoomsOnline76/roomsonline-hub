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
import { Building2, Key, Settings, ArrowRight, Edit, Trash2 } from "lucide-react";
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
      const { data, error } = await supabase
        .from("properties")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data;
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

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <Card className="cursor-pointer hover:shadow-lg transition-shadow" onClick={() => navigate('/admin/keys')}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Key className="h-5 w-5 text-primary" />
                  API Keys
                </span>
                <ArrowRight className="h-5 w-5 text-muted-foreground" />
              </CardTitle>
              <CardDescription>
                Manage integration keys for external services
              </CardDescription>
            </CardHeader>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-primary" />
                Properties
              </CardTitle>
              <CardDescription>
                {properties?.length || 0} properties synced
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
                      Add your first property or sync from your property management system
                    </p>
                    <div className="flex gap-4 justify-center">
                      <Button onClick={() => navigate('/admin/properties/new')}>
                        <Building2 className="mr-2 h-4 w-4" />
                        Add Property
                      </Button>
                      <Button variant="outline" onClick={() => navigate('/admin/keys')}>
                        <Key className="mr-2 h-4 w-4" />
                        Configure API Keys
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Property Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>City</TableHead>
                        <TableHead>Country</TableHead>
                        <TableHead>Max Guests</TableHead>
                        <TableHead>Price/Night</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {properties.map((property) => (
                        <TableRow key={property.id}>
                          <TableCell className="font-medium">{property.name}</TableCell>
                          <TableCell className="capitalize">{property.property_type}</TableCell>
                          <TableCell>{property.city}</TableCell>
                          <TableCell>{property.country}</TableCell>
                          <TableCell>{property.max_guests}</TableCell>
                          <TableCell>${property.price_per_night}</TableCell>
                          <TableCell>
                            <Badge variant={property.is_active ? "default" : "secondary"}>
                              {property.is_active ? "Active" : "Inactive"}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-2">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => navigate(`/admin/properties/${property.id}`)}
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteProperty(property.id)}
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
