import { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw, ChevronsLeft, ChevronsRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { BulkRateRuleDialog } from "@/components/BulkRateRuleDialog";
import { BulkAvailabilityRuleDialog } from "@/components/BulkAvailabilityRuleDialog";
import { BulkStopSellDialog } from "@/components/BulkStopSellDialog";
import { BulkMinimumStayDialog } from "@/components/BulkMinimumStayDialog";
import { BulkMaximumStayDialog } from "@/components/BulkMaximumStayDialog";
import { BulkLeadDaysAdvanceDialog } from "@/components/BulkLeadDaysAdvanceDialog";
import { BulkLeadDaysPostDialog } from "@/components/BulkLeadDaysPostDialog";

const CalendarAccommodation = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [selectedProperty, setSelectedProperty] = useState<string>("");
  const [selectedRoomType, setSelectedRoomType] = useState<string>("");
  const [viewMode, setViewMode] = useState<"week" | "month" | "year">("month");
  const [currentDate, setCurrentDate] = useState(new Date(2025, 10, 19)); // Nov 19, 2025
  const [bulkRateOpen, setBulkRateOpen] = useState(false);
  const [bulkAvailabilityOpen, setBulkAvailabilityOpen] = useState(false);
  const [stopSellOpen, setStopSellOpen] = useState(false);
  const [minStayOpen, setMinStayOpen] = useState(false);
  const [maxStayOpen, setMaxStayOpen] = useState(false);
  const [leadDaysAdvanceOpen, setLeadDaysAdvanceOpen] = useState(false);
  const [leadDaysPostOpen, setLeadDaysPostOpen] = useState(false);
  const [properties, setProperties] = useState<any[]>([]);
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchProperties();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      fetchRoomTypes(selectedProperty);
      setSelectedRoomType("");
    }
  }, [selectedProperty]);

  const fetchProperties = async () => {
    try {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .eq("is_active", true)
        .order("name");

      if (error) throw error;
      setProperties(data || []);
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

  const fetchRoomTypes = async (propertyId: string) => {
    try {
      // TODO: Implement room types fetching when room_types table/field is available
      // For now, using placeholder data
      setRoomTypes([
        { name: "Deluxe Room" },
        { name: "Standard Room" },
        { name: "Suite" },
      ]);
    } catch (error) {
      console.error("Error fetching room types:", error);
      setRoomTypes([]);
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

  const formatDate = (date: Date) => {
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

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

  // Generate calendar days for month view
  const generateMonthDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();
    
    const days = [];
    // Add empty cells for days before month starts
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }
    // Add days of month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day);
    }
    return days;
  };

  const monthDays = generateMonthDays();

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        {/* Tabs */}
        <Tabs value="accommodation" className="mb-6">
          <TabsList className="grid w-full max-w-md grid-cols-3">
            <TabsTrigger value="accommodation">Accommodation</TabsTrigger>
            <TabsTrigger value="event" onClick={() => navigate("/admin/calendar/event-wedding")}>
              Event/Wedding
            </TabsTrigger>
            <TabsTrigger value="conference" onClick={() => navigate("/admin/calendar/conference")}>
              Conference
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold mb-1">Accommodation Calendar</h1>
          <p className="text-muted-foreground">Manage accommodation bookings</p>
        </div>

        <Card>
          <CardContent className="p-6">
            {/* Filters and Actions */}
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

              <Select value={selectedRoomType} onValueChange={setSelectedRoomType} disabled={!selectedProperty}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Room Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Rooms</SelectItem>
                  {roomTypes.map((room, index) => (
                    <SelectItem key={index} value={room.name || room}>
                      {room.name || room}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Meal Types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Meals</SelectItem>
                  <SelectItem value="full-board">Full Board</SelectItem>
                  <SelectItem value="room-only">Room Only</SelectItem>
                  <SelectItem value="self-catering">Self Catering</SelectItem>
                  <SelectItem value="breakfast">Breakfast</SelectItem>
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
                    <DropdownMenuItem onClick={() => setBulkRateOpen(true)}>
                      Bulk Rate
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setBulkAvailabilityOpen(true)}>
                      Bulk Availability
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setStopSellOpen(true)}>
                      Stop Sell
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMinStayOpen(true)}>
                      Minimum Stay
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setMaxStayOpen(true)}>
                      Maximum Stay
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLeadDaysAdvanceOpen(true)}>
                      Lead Days Advance
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setLeadDaysPostOpen(true)}>
                      Lead Days Post
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* No Property Selected Message */}
            {!selectedProperty && (
              <div className="text-center py-8 text-muted-foreground">
                Select a property to begin.
              </div>
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
                      {currentDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
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
                    <Button
                      variant={viewMode === "week" ? "default" : "outline"}
                      onClick={() => setViewMode("week")}
                    >
                      Week
                    </Button>
                    <Button
                      variant={viewMode === "month" ? "default" : "outline"}
                      onClick={() => setViewMode("month")}
                    >
                      Month
                    </Button>
                    <Button
                      variant={viewMode === "year" ? "default" : "outline"}
                      onClick={() => setViewMode("year")}
                    >
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
                    {/* Day headers */}
                    <div className="grid grid-cols-7 bg-muted">
                      {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                        <div key={day} className="p-2 text-center font-semibold text-sm border">
                          {day}
                        </div>
                      ))}
                    </div>
                    {/* Calendar days */}
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
                                    {/* Sample color indicators */}
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

                {/* Week View Placeholder */}
                {viewMode === "week" && (
                  <div className="border rounded-lg p-8 text-center text-muted-foreground">
                    Week view calendar grid will be displayed here
                  </div>
                )}

                {/* Year View Placeholder */}
                {viewMode === "year" && (
                  <div className="border rounded-lg p-8 text-center text-muted-foreground">
                    Year view calendar grid will be displayed here
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <BulkRateRuleDialog open={bulkRateOpen} onOpenChange={setBulkRateOpen} />
      <BulkAvailabilityRuleDialog open={bulkAvailabilityOpen} onOpenChange={setBulkAvailabilityOpen} />
      <BulkStopSellDialog open={stopSellOpen} onOpenChange={setStopSellOpen} />
      <BulkMinimumStayDialog open={minStayOpen} onOpenChange={setMinStayOpen} />
      <BulkMaximumStayDialog open={maxStayOpen} onOpenChange={setMaxStayOpen} />
      <BulkLeadDaysAdvanceDialog open={leadDaysAdvanceOpen} onOpenChange={setLeadDaysAdvanceOpen} />
      <BulkLeadDaysPostDialog open={leadDaysPostOpen} onOpenChange={setLeadDaysPostOpen} />
    </div>
  );
};

export default CalendarAccommodation;
