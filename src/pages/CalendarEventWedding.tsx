import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const CalendarEventWedding = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [viewMode, setViewMode] = useState<"week" | "month" | "year">("month");
  const [currentDate, setCurrentDate] = useState(new Date(2025, 10, 19));
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");

  useEffect(() => {
    checkUserRoleAndFetchProperties();
  }, []);

  const checkUserRoleAndFetchProperties = async () => {
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      // Check if user is admin
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      const adminStatus = !!roleData;
      setIsAdmin(adminStatus);

      // Get user profile for owner email
      const { data: profileData } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .single();

      const email = profileData?.email || "";
      setUserEmail(email);

      // Fetch properties based on role
      await fetchProperties(adminStatus, email);
    } catch (error) {
      console.error("Error checking user role:", error);
      toast({
        title: "Error",
        description: "Failed to verify user permissions",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const fetchProperties = async (adminStatus: boolean, email: string) => {
    try {
      let query = supabase
        .from("properties")
        .select("id, name, amenities, owner_email")
        .eq("is_active", true);

      // Filter by owner email if not admin
      if (!adminStatus && email) {
        query = query.eq("owner_email", email);
      }

      const { data, error } = await query.order("name");

      if (error) throw error;

      // Filter properties with event/wedding offering
      const eventProperties = (data || []).filter((property: any) => {
        return property.amenities?.offerings?.event_wedding === true;
      });

      setProperties(eventProperties);
    } catch (error) {
      console.error("Error fetching properties:", error);
      toast({
        title: "Error",
        description: "Failed to load properties",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        <Tabs value="event" className="mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="accommodation" onClick={() => navigate("/admin/calendar")}>
              Accommodation
            </TabsTrigger>
            <TabsTrigger value="event">Event/Wedding</TabsTrigger>
            <TabsTrigger value="conference" onClick={() => navigate("/admin/calendar/conference")}>
              Conference
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">Event/Wedding Calendar</h1>
          <p className="text-muted-foreground">Manage event and wedding bookings</p>
        </div>

        <Card>
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4 mb-6">
              <Select value={selectedProperty} onValueChange={setSelectedProperty} disabled={loading}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Select Property" />
                </SelectTrigger>
                <SelectContent>
                  {properties.map((property) => (
                    <SelectItem key={property.id} value={property.id}>
                      {property.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button variant="default" className="gap-2">
                <RefreshCw className="h-4 w-4" />
                Refresh
              </Button>

              <div className="ml-auto flex gap-2">
                <Button variant="default">Save</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" className="gap-2">
                      Rules/Bulk Updates
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem>Bulk Rate</DropdownMenuItem>
                    <DropdownMenuItem>Bulk Availability</DropdownMenuItem>
                    <DropdownMenuItem>Stop Sell</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {!selectedProperty ? (
              <div className="text-center py-8 text-muted-foreground">
                Select a property to view the calendar
              </div>
            ) : (
              <div className="border rounded-lg p-8 text-center text-muted-foreground">
                Event/Wedding calendar view coming soon...
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default CalendarEventWedding;
