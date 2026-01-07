import { useState, useEffect } from "react";
import { AppLayout } from "@/components/layout/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  ChevronsLeft,
  ChevronsRight,
  Building2,
} from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { BulkRateRuleDialog } from "@/components/BulkRateRuleDialog";
import { BulkAvailabilityRuleDialog } from "@/components/BulkAvailabilityRuleDialog";
import { BulkStopSellDialog } from "@/components/BulkStopSellDialog";
import { BulkMinimumStayDialog } from "@/components/BulkMinimumStayDialog";
import { BulkMaximumStayDialog } from "@/components/BulkMaximumStayDialog";
import { BulkLeadDaysAdvanceDialog } from "@/components/BulkLeadDaysAdvanceDialog";
import { BulkLeadDaysPostDialog } from "@/components/BulkLeadDaysPostDialog";

interface Property {
  id: string;
  name: string;
  amenities: any;
  owner_email: string | null;
}

const CalendarConference = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [selectedProperty, setSelectedProperty] = useState<string>(searchParams.get("property") || "");
  const [viewMode, setViewMode] = useState<"week" | "month" | "year">("month");
  const [currentDate, setCurrentDate] = useState(new Date(2025, 10, 19));
  const [bulkRateOpen, setBulkRateOpen] = useState(false);
  const [bulkAvailabilityOpen, setBulkAvailabilityOpen] = useState(false);
  const [stopSellOpen, setStopSellOpen] = useState(false);
  const [minStayOpen, setMinStayOpen] = useState(false);
  const [maxStayOpen, setMaxStayOpen] = useState(false);
  const [leadDaysAdvanceOpen, setLeadDaysAdvanceOpen] = useState(false);
  const [leadDaysPostOpen, setLeadDaysPostOpen] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");

  const selectedPropertyData = properties.find((p) => p.id === selectedProperty);
  const hasAccommodation = selectedPropertyData?.amenities?.offerings?.accommodation === true;
  const hasEventWedding = selectedPropertyData?.amenities?.offerings?.event_wedding === true;
  const hasConference = selectedPropertyData?.amenities?.offerings?.conference === true;

  useEffect(() => {
    checkUserRoleAndFetchProperties();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      setSearchParams({ property: selectedProperty });
    }
  }, [selectedProperty]);

  const checkUserRoleAndFetchProperties = async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: roleData } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();

      const adminStatus = !!roleData;
      setIsAdmin(adminStatus);

      const { data: profileData } = await supabase.from("profiles").select("email").eq("id", user.id).single();

      const email = profileData?.email || "";
      setUserEmail(email);

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
      let query = supabase.from("properties").select("id, name, amenities, owner_email").eq("is_active", true);

      if (!adminStatus && email) {
        query = query.eq("owner_email", email);
      }

      const { data, error } = await query.order("name");

      if (error) throw error;

      const conferenceProperties = (data || []).filter((property: any) => {
        return property.amenities?.offerings?.conference === true;
      });

      setProperties(conferenceProperties);

      const urlProperty = searchParams.get("property");
      if (urlProperty && conferenceProperties.find((p: Property) => p.id === urlProperty)) {
        setSelectedProperty(urlProperty);
      }
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

  const handlePropertyChange = (propertyId: string) => {
    setSelectedProperty(propertyId);
  };

  const navigateToTab = (tab: string) => {
    const params = selectedProperty ? `?property=${selectedProperty}` : "";
    if (tab === "accommodation") {
      navigate(`/admin/calendar/accommodation${params}`);
    } else if (tab === "event") {
      navigate(`/admin/calendar/event-wedding${params}`);
    }
  };

  const legend = [
    { label: "Stop Sell", color: "bg-red-500" },
    { label: "Rates", color: "bg-gray-500" },
    { label: "Lead Days Advance", color: "bg-yellow-500" },
    { label: "Lead Days Post", color: "bg-orange-500" },
    { label: "Max Stay", color: "bg-pink-500" },
    { label: "Min Stay", color: "bg-blue-500" },
  ];

  const goToPrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "week") newDate.setDate(newDate.getDate() - 7);
    else if (viewMode === "month") newDate.setMonth(newDate.getMonth() - 1);
    else newDate.setFullYear(newDate.getFullYear() - 1);
    setCurrentDate(newDate);
  };

  const goToNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "week") newDate.setDate(newDate.getDate() + 7);
    else if (viewMode === "month") newDate.setMonth(newDate.getMonth() + 1);
    else newDate.setFullYear(newDate.getFullYear() + 1);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const goToStart = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "year") newDate.setFullYear(newDate.getFullYear() - 5);
    else if (viewMode === "month") newDate.setMonth(newDate.getMonth() - 6);
    else newDate.setDate(newDate.getDate() - 28);
    setCurrentDate(newDate);
  };

  const goToEnd = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "year") newDate.setFullYear(newDate.getFullYear() + 5);
    else if (viewMode === "month") newDate.setMonth(newDate.getMonth() + 6);
    else newDate.setDate(newDate.getDate() + 28);
    setCurrentDate(newDate);
  };

  const generateMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    return days;
  };

  const monthDays = generateMonthDays();

  return (
    <AppLayout>
      {/* Property Indicator */}
        {selectedPropertyData && (
          <div className="mb-4 p-4 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <span className="text-sm text-muted-foreground">Currently managing:</span>
              <h2 className="text-lg font-semibold text-primary">{selectedPropertyData.name}</h2>
            </div>
            <div className="ml-auto flex gap-2">
              {hasAccommodation && <Badge variant="outline">Accommodation</Badge>}
              {hasEventWedding && <Badge variant="outline">Event/Wedding</Badge>}
              <Badge variant="default">Conference</Badge>
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value="conference" className="mb-6">
          <TabsList
            className="grid w-full max-w-md"
            style={{
              gridTemplateColumns: `repeat(${(hasAccommodation ? 1 : 0) + (hasEventWedding ? 1 : 0) + 1}, 1fr)`,
            }}
          >
            {hasAccommodation && (
              <TabsTrigger value="accommodation" onClick={() => navigateToTab("accommodation")}>
                Accommodation
              </TabsTrigger>
            )}
            {hasEventWedding && (
              <TabsTrigger value="event" onClick={() => navigateToTab("event")}>
                Event/Wedding
              </TabsTrigger>
            )}
            <TabsTrigger value="conference">Conference</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">Calendar</h1>
          <p className="text-muted-foreground"></p>
        </div>

        <Card>
          <CardContent className="p-6">
            {/* Filters and Actions */}
            <div className="flex flex-wrap gap-4 mb-6">
              <Select value={selectedProperty} onValueChange={handlePropertyChange} disabled={loading}>
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
                <Button variant="default" disabled className="opacity-50 cursor-not-allowed">Save</Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="default" disabled className="gap-2 opacity-50 cursor-not-allowed">
                      Rules/Bulk Updates
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={() => setBulkRateOpen(true)} disabled>Bulk Rate</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBulkAvailabilityOpen(true)} disabled>Bulk Availability</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStopSellOpen(true)} disabled>Stop Sell</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMinStayOpen(true)} disabled>Minimum Stay</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMaxStayOpen(true)} disabled>Maximum Stay</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLeadDaysAdvanceOpen(true)} disabled>Lead Days Advance</DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLeadDaysPostOpen(true)} disabled>Lead Days Post</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* No Property Selected Message */}
            {!selectedProperty && (
              <div className="text-center py-8 text-muted-foreground">Select a property to begin.</div>
            )}

            {/* Calendar Section */}
            {selectedProperty && (
              <>
                {/* Calendar Navigation */}
                <div className="flex items-center justify-between mb-6">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="icon" onClick={goToStart}>
                      <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={goToPrevious}>
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <span className="text-lg font-semibold min-w-[150px] text-center">
                      {currentDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}
                    </span>
                    <Button variant="outline" size="icon" onClick={goToNext}>
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" size="icon" onClick={goToEnd}>
                      <ChevronsRight className="h-4 w-4" />
                    </Button>
                    <Button variant="outline" onClick={goToToday}>
                      Today
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button variant={viewMode === "week" ? "default" : "outline"} onClick={() => setViewMode("week")}>
                      Week
                    </Button>
                    <Button variant={viewMode === "month" ? "default" : "outline"} onClick={() => setViewMode("month")}>
                      Month
                    </Button>
                    <Button variant={viewMode === "year" ? "default" : "outline"} onClick={() => setViewMode("year")}>
                      Year
                    </Button>
                  </div>
                </div>

                {/* Legend */}
                <div className="flex flex-wrap gap-4 mb-6">
                  {legend.map((item) => (
                    <div key={item.label} className="flex items-center gap-2">
                      <div className={`w-4 h-4 ${item.color} rounded`} />
                      <span className="text-sm">{item.label}</span>
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                {viewMode === "month" && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="grid grid-cols-7 bg-muted">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="p-2 text-center font-semibold text-sm border">
                          {day}
                        </div>
                      ))}
                    </div>
                    <div className="grid grid-cols-7">
                      <TooltipProvider>
                        {monthDays.map((day, index) => (
                          <Tooltip key={index}>
                            <TooltipTrigger asChild>
                              <div
                                className={`min-h-[100px] p-2 border relative ${
                                  day ? "bg-background hover:bg-muted/50 cursor-pointer" : "bg-muted/30"
                                }`}
                              >
                                {day && (
                                  <>
                                    <div className="font-semibold text-sm mb-2">{day}</div>
                                    {day === 15 && (
                                      <div className="absolute bottom-2 left-2 right-2 flex gap-1">
                                        <div className="h-2 flex-1 bg-red-500 rounded" />
                                        <div className="h-2 flex-1 bg-yellow-500 rounded" />
                                      </div>
                                    )}
                                    {day === 20 && (
                                      <div className="absolute bottom-2 left-2 right-2 flex gap-1">
                                        <div className="h-2 flex-1 bg-blue-500 rounded" />
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </TooltipTrigger>
                            {day && day === 15 && (
                              <TooltipContent>
                                <div className="text-sm">
                                  <p className="font-semibold">November {day}, 2025</p>
                                  <p className="text-xs">Stop Sell: Active</p>
                                  <p className="text-xs">Lead Days Advance: 7 days</p>
                                </div>
                              </TooltipContent>
                            )}
                            {day && day === 20 && (
                              <TooltipContent>
                                <div className="text-sm">
                                  <p className="font-semibold">November {day}, 2025</p>
                                  <p className="text-xs">Minimum Stay: 2 nights</p>
                                </div>
                              </TooltipContent>
                            )}
                          </Tooltip>
                        ))}
                      </TooltipProvider>
                    </div>
                  </div>
                )}

                {viewMode === "week" && (
                  <div className="border rounded-lg p-8 text-center text-muted-foreground">
                    Week view calendar grid will be displayed here
                  </div>
                )}

                {viewMode === "year" && (
                  <div className="border rounded-lg p-8 text-center text-muted-foreground">
                    Year view calendar grid will be displayed here
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>

        <BulkRateRuleDialog open={bulkRateOpen} onOpenChange={setBulkRateOpen} />
        <BulkAvailabilityRuleDialog open={bulkAvailabilityOpen} onOpenChange={setBulkAvailabilityOpen} />
        <BulkStopSellDialog open={stopSellOpen} onOpenChange={setStopSellOpen} />
        <BulkMinimumStayDialog open={minStayOpen} onOpenChange={setMinStayOpen} />
        <BulkMaximumStayDialog open={maxStayOpen} onOpenChange={setMaxStayOpen} />
        <BulkLeadDaysAdvanceDialog open={leadDaysAdvanceOpen} onOpenChange={setLeadDaysAdvanceOpen} />
        <BulkLeadDaysPostDialog open={leadDaysPostOpen} onOpenChange={setLeadDaysPostOpen} />
    </AppLayout>
  );
};

export default CalendarConference;
