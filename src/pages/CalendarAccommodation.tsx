import React, { useState, useEffect } from "react";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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
import { ChevronLeft, ChevronRight, ChevronDown, RefreshCw, ChevronsLeft, ChevronsRight, Building2 } from "lucide-react";
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

const displayOptions = [
  { id: "stop_sell", label: "Stop Sell", color: "bg-red-500" },
  { id: "rates", label: "Rates", color: "bg-gray-500" },
  { id: "lead_days_advance", label: "Lead Days Advance", color: "bg-yellow-500" },
  { id: "lead_days_post", label: "Lead Days Post", color: "bg-orange-500" },
  { id: "max_stay", label: "Max Stay", color: "bg-pink-500" },
  { id: "min_stay", label: "Min Stay", color: "bg-blue-500" },
];

// South African Public Holidays (including observed days when holiday falls on Sunday)
const getSouthAfricanHolidays = (year: number): { [key: string]: string } => {
  const holidays: { [key: string]: string } = {
    [`${year}-01-01`]: "New Year's Day",
    [`${year}-03-21`]: "Human Rights Day",
    [`${year}-04-27`]: "Freedom Day",
    [`${year}-05-01`]: "Workers' Day",
    [`${year}-06-16`]: "Youth Day",
    [`${year}-08-09`]: "National Women's Day",
    [`${year}-09-24`]: "Heritage Day",
    [`${year}-12-16`]: "Day of Reconciliation",
    [`${year}-12-25`]: "Christmas Day",
    [`${year}-12-26`]: "Day of Goodwill",
  };
  
  // Easter dates (approximate - Good Friday and Family Day)
  // 2024: March 29 (Good Friday), April 1 (Family Day)
  // 2025: April 18 (Good Friday), April 21 (Family Day)
  // 2026: April 3 (Good Friday), April 6 (Family Day)
  const easterDates: { [key: number]: { goodFriday: string; familyDay: string } } = {
    2024: { goodFriday: "2024-03-29", familyDay: "2024-04-01" },
    2025: { goodFriday: "2025-04-18", familyDay: "2025-04-21" },
    2026: { goodFriday: "2026-04-03", familyDay: "2026-04-06" },
    2027: { goodFriday: "2027-03-26", familyDay: "2027-03-29" },
  };
  
  if (easterDates[year]) {
    holidays[easterDates[year].goodFriday] = "Good Friday";
    holidays[easterDates[year].familyDay] = "Family Day";
  }
  
  return holidays;
};

const getHolidayName = (date: Date): string | null => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const dateStr = `${year}-${month}-${day}`;
  const holidays = getSouthAfricanHolidays(year);
  return holidays[dateStr] || null;
};

interface RoomData {
  name: string;
  rates: {
    rateType: string;
    mealType: string;
    values: { [date: string]: number };
  }[];
  availability: { [date: string]: number };
}

// Mock data for demonstration - would come from property/room information/rate info
const mockRoomData: RoomData[] = [
  {
    name: "Petite Hotel Room",
    rates: [
      { rateType: "SingleRate", mealType: "Breakfast", values: {} },
      { rateType: "PerPersonRate", mealType: "Breakfast", values: {} },
    ],
    availability: {},
  },
  {
    name: "Two Bedroom Suite",
    rates: [
      { rateType: "UnitRate", mealType: "Breakfast", values: {} },
    ],
    availability: {},
  },
  {
    name: "One Bedroom Suite",
    rates: [
      { rateType: "SingleRate", mealType: "Breakfast", values: {} },
      { rateType: "PerPersonRate", mealType: "Breakfast", values: {} },
    ],
    availability: {},
  },
  {
    name: "Holiday House",
    rates: [
      { rateType: "UnitRate", mealType: "Self Catering", values: {} },
    ],
    availability: {},
  },
];


const CalendarAccommodation = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const [selectedProperty, setSelectedProperty] = useState<string>(searchParams.get("property") || "");
  const [viewMode, setViewMode] = useState<"week" | "month">("month");
  const [currentDate, setCurrentDate] = useState(new Date(2025, 10, 19));
  const [bulkRateOpen, setBulkRateOpen] = useState(false);
  const [bulkAvailabilityOpen, setBulkAvailabilityOpen] = useState(false);
  const [stopSellOpen, setStopSellOpen] = useState(false);
  const [minStayOpen, setMinStayOpen] = useState(false);
  const [maxStayOpen, setMaxStayOpen] = useState(false);
  const [leadDaysAdvanceOpen, setLeadDaysAdvanceOpen] = useState(false);
  const [leadDaysPostOpen, setLeadDaysPostOpen] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [roomTypes, setRoomTypes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userEmail, setUserEmail] = useState<string>("");

  // Multi-select states - all true by default
  const [selectedDisplayOptions, setSelectedDisplayOptions] = useState<string[]>(
    displayOptions.map(o => o.id)
  );
  const [selectedRoomTypes, setSelectedRoomTypes] = useState<string[]>([]);
  const [selectedMealTypes, setSelectedMealTypes] = useState<string[]>([]);

  const selectedPropertyData = properties.find(p => p.id === selectedProperty);
  const hasAccommodation = selectedPropertyData?.amenities?.offerings?.accommodation === true;
  const hasEventWedding = selectedPropertyData?.amenities?.offerings?.event_wedding === true;
  const hasConference = selectedPropertyData?.amenities?.offerings?.conference === true;

  // Get meal types from property amenities
  const mealTypeOptions = React.useMemo(() => {
    if (!selectedPropertyData?.amenities?.meal_types) return [];
    const mealTypes = selectedPropertyData.amenities.meal_types as string[];
    return mealTypes.map(mt => ({
      id: mt.toLowerCase().replace(/ /g, "_"),
      label: mt
    }));
  }, [selectedPropertyData]);

  useEffect(() => {
    checkUserRoleAndFetchProperties();
  }, []);

  useEffect(() => {
    if (selectedProperty) {
      fetchRoomTypes(selectedProperty);
      setSearchParams({ property: selectedProperty });
    }
  }, [selectedProperty]);

  // Set all room types selected when roomTypes changes
  useEffect(() => {
    if (roomTypes.length > 0) {
      setSelectedRoomTypes(roomTypes.map(r => r.name || r));
    }
  }, [roomTypes]);

  // Set all meal types selected when mealTypeOptions changes
  useEffect(() => {
    if (mealTypeOptions.length > 0) {
      setSelectedMealTypes(mealTypeOptions.map(m => m.id));
    }
  }, [mealTypeOptions.length]);

  const checkUserRoleAndFetchProperties = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
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

      const { data: profileData } = await supabase
        .from("profiles")
        .select("email")
        .eq("id", user.id)
        .maybeSingle();

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
      let query = supabase
        .from("properties")
        .select("id, name, amenities, owner_email")
        .eq("is_active", true);

      if (!adminStatus && email) {
        query = query.eq("owner_email", email);
      }

      const { data, error } = await query.order("name");

      if (error) throw error;

      const accommodationProperties = (data || []).filter((property: any) => {
        return property.amenities?.offerings?.accommodation === true;
      });

      setProperties(accommodationProperties);

      const urlProperty = searchParams.get("property");
      if (urlProperty && accommodationProperties.find((p: Property) => p.id === urlProperty)) {
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

  const fetchRoomTypes = async (propertyId: string) => {
    try {
      // Use room names from mockRoomData for the dropdown
      setRoomTypes(mockRoomData.map(r => ({ name: r.name })));
    } catch (error) {
      console.error("Error fetching room types:", error);
      setRoomTypes([]);
    }
  };

  const handlePropertyChange = (propertyId: string) => {
    setSelectedProperty(propertyId);
  };

  const navigateToTab = (tab: string) => {
    const params = selectedProperty ? `?property=${selectedProperty}` : "";
    if (tab === "event") {
      navigate(`/admin/calendar/event-wedding${params}`);
    } else if (tab === "conference") {
      navigate(`/admin/calendar/conference${params}`);
    }
  };

  const toggleDisplayOption = (optionId: string) => {
    setSelectedDisplayOptions(prev =>
      prev.includes(optionId)
        ? prev.filter(id => id !== optionId)
        : [...prev, optionId]
    );
  };

  const toggleRoomType = (roomName: string) => {
    setSelectedRoomTypes(prev =>
      prev.includes(roomName)
        ? prev.filter(name => name !== roomName)
        : [...prev, roomName]
    );
  };

  const toggleMealType = (mealId: string) => {
    setSelectedMealTypes(prev =>
      prev.includes(mealId)
        ? prev.filter(id => id !== mealId)
        : [...prev, mealId]
    );
  };


  const goToPrevious = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "week") newDate.setDate(newDate.getDate() - 7);
    else newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  const goToNext = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "week") newDate.setDate(newDate.getDate() + 7);
    else newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  const goToToday = () => {
    setCurrentDate(new Date());
  };

  const goToStart = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "month") newDate.setMonth(newDate.getMonth() - 6);
    else newDate.setDate(newDate.getDate() - 28);
    setCurrentDate(newDate);
  };

  const goToEnd = () => {
    const newDate = new Date(currentDate);
    if (viewMode === "month") newDate.setMonth(newDate.getMonth() + 6);
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

  const generateWeekDates = () => {
    const dates: Date[] = [];
    const startOfWeek = new Date(currentDate);
    // Start from Saturday
    const day = startOfWeek.getDay();
    const diff = day === 6 ? 0 : -(day + 1);
    startOfWeek.setDate(startOfWeek.getDate() + diff);
    
    for (let i = 0; i < 9; i++) { // 9 days for the grid view
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      dates.push(date);
    }
    return dates;
  };

  const generateMonthDates = () => {
    const dates: Date[] = [];
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    
    for (let day = 1; day <= daysInMonth; day++) {
      dates.push(new Date(year, month, day));
    }
    return dates;
  };

  const weekDates = generateWeekDates();
  const monthDates = generateMonthDates();
  const calendarDates = viewMode === "week" ? weekDates : monthDates;

  // Generate mock rate data for dates
  const getMockRateValue = (rateType: string) => {
    const rateValues: { [key: string]: number } = {
      "SingleRate": 3267,
      "PerPersonRate": 1875,
      "UnitRate": 6651,
    };
    return rateValues[rateType] || 2000;
  };

  const getMockAvailability = (roomName: string) => {
    const availValues: { [key: string]: number } = {
      "Petite Hotel Room": 14,
      "Two Bedroom Suite": 6,
      "One Bedroom Suite": 14,
      "Holiday House": 9,
    };
    return availValues[roomName] || 10;
  };

  const isWeekend = (date: Date) => {
    const day = date.getDay();
    return day === 0 || day === 6;
  };

  const formatDayHeader = (date: Date) => {
    const days = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    return {
      day: days[date.getDay()],
      date: date.getDate(),
      month: months[date.getMonth()],
    };
  };

  // Filter rooms based on selected room types
  const filteredRooms = mockRoomData.filter(room => 
    selectedRoomTypes.includes(room.name)
  );

  // Filter rates based on selected meal types
  const getMealTypeId = (mealType: string) => {
    const map: { [key: string]: string } = {
      "Breakfast": "breakfast",
      "Self Catering": "self_catering",
      "Full Board": "full_board",
      "Room Only": "room_only",
    };
    return map[mealType] || mealType.toLowerCase().replace(" ", "_");
  };

  const getSelectedCount = (selected: string[], total: number) => {
    return selected.length === total ? "All" : `${selected.length}/${total}`;
  };

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="container mx-auto px-4 py-8">
        {/* Property Indicator */}
        {selectedPropertyData && (
          <div className="mb-4 p-4 bg-primary/10 border border-primary/20 rounded-lg flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            <div>
              <span className="text-sm text-muted-foreground">Currently managing:</span>
              <h2 className="text-lg font-semibold text-primary">{selectedPropertyData.name}</h2>
            </div>
            <div className="ml-auto flex gap-2">
              <Badge variant="default">Accommodation</Badge>
              {hasEventWedding && <Badge variant="outline">Event/Wedding</Badge>}
              {hasConference && <Badge variant="outline">Conference</Badge>}
            </div>
          </div>
        )}

        {/* Tabs */}
        <Tabs value="accommodation" className="mb-6">
          <TabsList className="grid w-full max-w-md" style={{ gridTemplateColumns: `repeat(${1 + (hasEventWedding ? 1 : 0) + (hasConference ? 1 : 0)}, 1fr)` }}>
            <TabsTrigger value="accommodation">Accommodation</TabsTrigger>
            {hasEventWedding && (
              <TabsTrigger value="event" onClick={() => navigateToTab("event")}>
                Event/Wedding
              </TabsTrigger>
            )}
            {hasConference && (
              <TabsTrigger value="conference" onClick={() => navigateToTab("conference")}>
                Conference
              </TabsTrigger>
            )}
          </TabsList>
        </Tabs>

        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold">Calendar</h1>
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


              {/* Room Types Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-between" disabled={!selectedProperty}>
                    Room Types ({getSelectedCount(selectedRoomTypes, roomTypes.length)})
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-2 bg-popover" align="start">
                  <div className="space-y-2">
                    {roomTypes.map((room, index) => {
                      const roomName = room.name || room;
                      return (
                        <div key={index} className="flex items-center space-x-2">
                          <Checkbox
                            id={`room-${index}`}
                            checked={selectedRoomTypes.includes(roomName)}
                            onCheckedChange={() => toggleRoomType(roomName)}
                          />
                          <label htmlFor={`room-${index}`} className="text-sm cursor-pointer flex-1">
                            {roomName}
                          </label>
                        </div>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* Meal Types Dropdown */}
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[200px] justify-between">
                    Meal Types ({getSelectedCount(selectedMealTypes, mealTypeOptions.length)})
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[200px] p-2 bg-popover" align="start">
                  <div className="space-y-2">
                    {mealTypeOptions.map((meal) => (
                      <div key={meal.id} className="flex items-center space-x-2">
                        <Checkbox
                          id={meal.id}
                          checked={selectedMealTypes.includes(meal.id)}
                          onCheckedChange={() => toggleMealType(meal.id)}
                        />
                        <label htmlFor={meal.id} className="text-sm cursor-pointer flex-1">
                          {meal.label}
                        </label>
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>

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
                  <DropdownMenuContent align="end" className="w-48 bg-popover">
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
                  </div>
                </div>

                {/* Display Options as colored checkboxes */}
                <div className="flex flex-wrap gap-4 mb-6">
                  {displayOptions.map((option) => (
                    <div key={option.id} className="flex items-center gap-2">
                      <Checkbox
                        id={`legend-${option.id}`}
                        checked={selectedDisplayOptions.includes(option.id)}
                        onCheckedChange={() => toggleDisplayOption(option.id)}
                        className={`${option.color} border-0 data-[state=checked]:${option.color} data-[state=checked]:text-white`}
                      />
                      <label htmlFor={`legend-${option.id}`} className="text-sm cursor-pointer">
                        {option.label}
                      </label>
                    </div>
                  ))}
                </div>

                {/* Calendar Grid */}
                <TooltipProvider>
                {viewMode === "week" && (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full border-collapse min-w-[800px]">
                      {/* Date Header Row */}
                      <thead>
                        <tr>
                          <th className="border bg-muted/50 p-2 min-w-[200px] sticky left-0 bg-background z-10"></th>
                          {calendarDates.map((date, index) => {
                            const header = formatDayHeader(date);
                            const weekend = isWeekend(date);
                            const holidayName = getHolidayName(date);
                            const isHoliday = !!holidayName;
                            
                            const headerContent = (
                              <th
                                key={index}
                                className={`border p-2 text-center min-w-[80px] ${
                                  isHoliday 
                                    ? "bg-green-100 dark:bg-green-950/30" 
                                    : weekend 
                                      ? "bg-red-50 dark:bg-red-950/20" 
                                      : "bg-muted/50"
                                }`}
                              >
                                <div className={`text-xs font-semibold ${
                                  isHoliday 
                                    ? "text-green-700 dark:text-green-400" 
                                    : weekend 
                                      ? "text-red-600" 
                                      : "text-muted-foreground"
                                }`}>
                                  {header.day}
                                </div>
                                <div className={`text-lg font-bold ${
                                  isHoliday 
                                    ? "text-green-700 dark:text-green-400" 
                                    : weekend 
                                      ? "text-red-600" 
                                      : ""
                                }`}>
                                  {header.date}
                                </div>
                                <div className={`text-xs ${
                                  isHoliday 
                                    ? "text-green-700 dark:text-green-400" 
                                    : weekend 
                                      ? "text-red-600" 
                                      : "text-muted-foreground"
                                }`}>
                                  {header.month}
                                </div>
                              </th>
                            );
                            
                            return isHoliday ? (
                              <Tooltip key={index}>
                                <TooltipTrigger asChild>
                                  {headerContent}
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-semibold">{holidayName}</p>
                                  <p className="text-xs text-muted-foreground">SA Public Holiday</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : headerContent;
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRooms.map((room) => {
                          const filteredRates = room.rates.filter(rate =>
                            selectedMealTypes.includes(getMealTypeId(rate.mealType))
                          );
                          
                          if (filteredRates.length === 0 && !selectedDisplayOptions.includes("rates")) {
                            return null;
                          }

                          return (
                            <React.Fragment key={room.name}>
                              {/* Room Name Row with Availability */}
                              <tr className="bg-slate-100 dark:bg-slate-800">
                                <td className="border p-2 font-bold text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
                                  {room.name}
                                </td>
                                {calendarDates.map((date, index) => {
                                  const weekend = isWeekend(date);
                                  const isHoliday = !!getHolidayName(date);
                                  return (
                                    <td
                                      key={index}
                                      className={`border p-2 text-center font-semibold ${
                                        isHoliday 
                                          ? "bg-green-100 dark:bg-green-950/30" 
                                          : weekend 
                                            ? "bg-red-50 dark:bg-red-950/20" 
                                            : ""
                                      }`}
                                    >
                                      {getMockAvailability(room.name)}
                                    </td>
                                  );
                                })}
                              </tr>
                              {/* Rate Rows */}
                              {selectedDisplayOptions.includes("rates") && filteredRates.map((rate, rateIndex) => (
                                <tr key={`${room.name}-${rateIndex}`}>
                                  <td className="border p-2 pl-4 text-sm text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-foreground">{rate.rateType}</span>
                                    <span className="mx-1">-</span>
                                    <span>{rate.mealType}</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-2 text-center text-sm ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {getMockRateValue(rate.rateType)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {viewMode === "month" && (
                  <div className="border rounded-lg overflow-x-auto">
                    <table className="w-full border-collapse">
                      {/* Date Header Row */}
                      <thead>
                        <tr>
                          <th className="border bg-muted/50 p-2 min-w-[200px] sticky left-0 bg-background z-10"></th>
                          {calendarDates.map((date, index) => {
                            const header = formatDayHeader(date);
                            const weekend = isWeekend(date);
                            const holidayName = getHolidayName(date);
                            const isHoliday = !!holidayName;
                            
                            const headerContent = (
                              <th
                                key={index}
                                className={`border p-1 text-center min-w-[50px] ${
                                  isHoliday 
                                    ? "bg-green-100 dark:bg-green-950/30" 
                                    : weekend 
                                      ? "bg-red-50 dark:bg-red-950/20" 
                                      : "bg-muted/50"
                                }`}
                              >
                                <div className={`text-xs font-semibold ${
                                  isHoliday 
                                    ? "text-green-700 dark:text-green-400" 
                                    : weekend 
                                      ? "text-red-600" 
                                      : "text-muted-foreground"
                                }`}>
                                  {header.day}
                                </div>
                                <div className={`text-sm font-bold ${
                                  isHoliday 
                                    ? "text-green-700 dark:text-green-400" 
                                    : weekend 
                                      ? "text-red-600" 
                                      : ""
                                }`}>
                                  {header.date}
                                </div>
                              </th>
                            );
                            
                            return isHoliday ? (
                              <Tooltip key={index}>
                                <TooltipTrigger asChild>
                                  {headerContent}
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p className="font-semibold">{holidayName}</p>
                                  <p className="text-xs text-muted-foreground">SA Public Holiday</p>
                                </TooltipContent>
                              </Tooltip>
                            ) : headerContent;
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredRooms.map((room) => {
                          const filteredRates = room.rates.filter(rate =>
                            selectedMealTypes.includes(getMealTypeId(rate.mealType))
                          );
                          
                          if (filteredRates.length === 0 && !selectedDisplayOptions.includes("rates")) {
                            return null;
                          }

                          return (
                            <React.Fragment key={room.name}>
                              {/* Room Name Row with Availability */}
                              <tr className="bg-slate-100 dark:bg-slate-800">
                                <td className="border p-2 font-bold text-foreground sticky left-0 bg-slate-100 dark:bg-slate-800 z-10">
                                  {room.name}
                                </td>
                                {calendarDates.map((date, index) => {
                                  const weekend = isWeekend(date);
                                  const isHoliday = !!getHolidayName(date);
                                  return (
                                    <td
                                      key={index}
                                      className={`border p-1 text-center text-sm font-semibold ${
                                        isHoliday 
                                          ? "bg-green-100 dark:bg-green-950/30" 
                                          : weekend 
                                            ? "bg-red-50 dark:bg-red-950/20" 
                                            : ""
                                      }`}
                                    >
                                      {getMockAvailability(room.name)}
                                    </td>
                                  );
                                })}
                              </tr>
                              {/* Rate Rows */}
                              {selectedDisplayOptions.includes("rates") && filteredRates.map((rate, rateIndex) => (
                                <tr key={`${room.name}-${rateIndex}`}>
                                  <td className="border p-1 pl-4 text-xs text-muted-foreground sticky left-0 bg-background z-10">
                                    <span className="text-foreground">{rate.rateType}</span>
                                    <span className="mx-1">-</span>
                                    <span>{rate.mealType}</span>
                                  </td>
                                  {calendarDates.map((date, index) => {
                                    const weekend = isWeekend(date);
                                    const isHoliday = !!getHolidayName(date);
                                    return (
                                      <td
                                        key={index}
                                        className={`border p-1 text-center text-xs ${
                                          isHoliday 
                                            ? "bg-green-100 dark:bg-green-950/30" 
                                            : weekend 
                                              ? "bg-red-50 dark:bg-red-950/20" 
                                              : ""
                                        }`}
                                      >
                                        {getMockRateValue(rate.rateType)}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                </TooltipProvider>
              </>
            )}
          </CardContent>
        </Card>
      </div>

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
