import { useState, useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useToast } from "@/hooks/use-toast";
import { ExpandableDataViewer } from "@/components/ExpandableDataViewer";
import { 
  CalendarDays, Users, Loader2, Send, Calculator, 
  ArrowLeft, Plus, Minus, CheckCircle2, AlertCircle, RefreshCw 
} from "lucide-react";
import { format, addDays, differenceInDays, startOfDay, formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";

interface Property {
  id: string;
  name: string;
  benson_property_code: string | null;
}

interface RoomType {
  id: string;
  external_room_type_id: string;
  name: string;
  max_guests: number | null;
  min_guests: number | null;
  allow_teens: boolean | null;
  allow_children: boolean | null;
  allow_infants: boolean | null;
}

interface RateType {
  id: string;
  external_rate_type_id: string;
  name: string;
  price_type: string | null;
  min_stay?: number;
  max_stay?: number;
}

interface CostLineItem {
  description: string;
  nights: number;
  quantity: number;
  unitPrice: number;
  total: number;
}

interface BookingTest {
  id: string;
  timestamp: string;
  property: string;
  roomType: string;
  rateType: string;
  dates: string;
  guests: string;
  totalCost: number;
  status: 'pending' | 'success' | 'error';
  response?: any;
  error?: string;
}

const TestBookingBenson = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const today = startOfDay(new Date());

  // State
  const [selectedPropertyId, setSelectedPropertyId] = useState<string>("");
  const [checkInDate, setCheckInDate] = useState<Date | undefined>(addDays(today, 1));
  const [checkOutDate, setCheckOutDate] = useState<Date | undefined>(addDays(today, 3));
  const [selectedRoomTypeId, setSelectedRoomTypeId] = useState<string>("");
  const [selectedRateTypeId, setSelectedRateTypeId] = useState<string>("");
  const [adults, setAdults] = useState(2);
  const [teens, setTeens] = useState(0);
  const [children, setChildren] = useState(0);
  const [infants, setInfants] = useState(0);
  const [guestName, setGuestName] = useState("Test Guest");
  const [guestEmail, setGuestEmail] = useState("test@example.com");
  const [guestPhone, setGuestPhone] = useState("+27000000000");
  const [voucher, setVoucher] = useState("");
  const [notes, setNotes] = useState("");
  
  // Loading states
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchingAvailability, setFetchingAvailability] = useState(false);
  
  // Results
  const [costBreakdown, setCostBreakdown] = useState<CostLineItem[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [bookingTests, setBookingTests] = useState<BookingTest[]>([]);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [availabilityData, setAvailabilityData] = useState<any>(null);
  const [availabilityCache, setAvailabilityCache] = useState<Record<string, any>>({});

  // Fetch Benson properties only
  const { data: properties = [], isLoading: propertiesLoading } = useQuery({
    queryKey: ["benson-properties"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("properties")
        .select("id, name, benson_property_code")
        .eq("external_system", "benson")
        .not("benson_property_code", "is", null)
        .order("name");
      
      if (error) throw error;
      return data as Property[];
    },
  });

  // Derive room types from availability data
  const roomTypes = useMemo(() => {
    if (!availabilityData?.roomTypes) return [];
    return availabilityData.roomTypes.map((rt: any) => ({
      id: String(rt.roomTypeId),
      external_room_type_id: String(rt.roomTypeId),
      name: rt.name,
      max_guests: rt.maxGuests || rt.maxPeople || 10,
      min_guests: rt.minGuests || 1,
      allow_teens: rt.allowTeens ?? true,
      allow_children: rt.allowChildren ?? true,
      allow_infants: rt.allowInfants ?? true,
    }));
  }, [availabilityData]);

  // Derive rate types from the SELECTED room type only
  // Only include rate types that have rates for the selected date range
  const rateTypes = useMemo(() => {
    if (!availabilityData?.roomTypes || !selectedRoomTypeId) return [];
    
    // Find the selected room type in availability data
    const selectedRoom = availabilityData.roomTypes.find(
      (rt: any) => String(rt.roomTypeId) === selectedRoomTypeId
    );
    
    if (!selectedRoom?.rateTypes) return [];
    
    const rateList: (RateType & { min_stay?: number; max_stay?: number; hasRates: boolean })[] = [];
    
    selectedRoom.rateTypes.forEach((rate: any) => {
      const rateTypeId = String(rate.rateTypeId);
      
      // Check if this rate type has any rates with values > 0
      // For per-room: check roomAmount
      // For per-person: check adultAmount1, adultAmount2, adultAmount, teenAmount, childAmount, infantAmount
      const hasRates = rate.rates?.some((r: any) => {
        const roomAmount = r.roomAmount || 0;
        const adultAmount1 = r.adultAmount1 || 0;
        const adultAmount2 = r.adultAmount2 || 0;
        const adultAmount = r.adultAmount || 0;
        const teenAmount = r.teenAmount || 0;
        const childAmount = r.childAmount || 0;
        const infantAmount = r.infantAmount || 0;
        return roomAmount > 0 || adultAmount1 > 0 || adultAmount2 > 0 || adultAmount > 0 || teenAmount > 0 || childAmount > 0 || infantAmount > 0;
      }) ?? false;
      
      rateList.push({
        id: rateTypeId,
        external_rate_type_id: rateTypeId,
        name: rate.name,
        price_type: rate.priceType,
        min_stay: rate.minStayDays || rate.minNights || 1,
        max_stay: rate.maxStayDays || rate.maxNights || 365,
        hasRates,
      });
    });
    
    // Filter to only rate types that have rates available
    return rateList.filter(rt => rt.hasRates);
  }, [availabilityData, selectedRoomTypeId]);

  // Get selected room and rate type for validation
  const selectedRoomType = roomTypes.find(rt => rt.external_room_type_id === selectedRoomTypeId);
  const selectedRateType = rateTypes.find(rt => rt.external_rate_type_id === selectedRateTypeId);

  // Calculate number of nights
  const nights = useMemo(() => {
    if (!checkInDate || !checkOutDate) return 0;
    return differenceInDays(checkOutDate, checkInDate);
  }, [checkInDate, checkOutDate]);

  // Calculate total guests for occupancy validation
  const totalGuests = adults + teens + children + infants;
  const maxGuests = selectedRoomType?.max_guests || 10;
  const minGuests = selectedRoomType?.min_guests || 1;
  const isOverCapacity = totalGuests > maxGuests;
  const isUnderCapacity = totalGuests < minGuests;

  // Min/max stay validation
  const minStay = selectedRateType?.min_stay || 1;
  const maxStay = selectedRateType?.max_stay || 365;
  const isUnderMinStay = nights > 0 && nights < minStay;
  const isOverMaxStay = nights > maxStay;

  // Restore cached data or reset form when property changes
  useEffect(() => {
    setSelectedRoomTypeId("");
    setSelectedRateTypeId("");
    setCostBreakdown([]);
    setTotalCost(0);
    setAdults(2);
    setTeens(0);
    setChildren(0);
    setInfants(0);
    
    // Restore cached availability data for this property if available
    if (selectedPropertyId && availabilityCache[selectedPropertyId]) {
      setAvailabilityData(availabilityCache[selectedPropertyId]);
    } else {
      setAvailabilityData(null);
    }
  }, [selectedPropertyId]);

  // Reset disallowed guest types and enforce max occupancy when room type changes
  useEffect(() => {
    if (!selectedRoomType) return;
    
    // Reset disallowed guest types to 0
    if (!selectedRoomType.allow_teens) setTeens(0);
    if (!selectedRoomType.allow_children) setChildren(0);
    if (!selectedRoomType.allow_infants) setInfants(0);
    
    // Enforce max occupancy by reducing adults if needed
    const currentTotal = adults + 
      (selectedRoomType.allow_teens ? teens : 0) + 
      (selectedRoomType.allow_children ? children : 0) + 
      (selectedRoomType.allow_infants ? infants : 0);
    
    if (currentTotal > selectedRoomType.max_guests) {
      const excess = currentTotal - selectedRoomType.max_guests;
      setAdults(Math.max(1, adults - excess));
    }
  }, [selectedRoomTypeId, selectedRoomType]);

  // Fetch fresh availability from Benson
  const fetchAvailability = async () => {
    if (!selectedPropertyId || !checkInDate || !checkOutDate) {
      toast({ title: "Missing data", description: "Select property and dates first", variant: "destructive" });
      return;
    }

    setFetchingAvailability(true);
    try {
      const { data, error } = await supabase.functions.invoke("benson-api", {
        body: {
          action: "fetch_availability",
          property_id: selectedPropertyId,
          start_date: format(checkInDate, "yyyy-MM-dd"),
          end_date: format(checkOutDate, "yyyy-MM-dd"),
        },
      });

      if (error) throw error;

      // Add fetch timestamp and date range to the data
      const enrichedData = { 
        ...data, 
        fetchedAt: new Date().toISOString(),
        fetchedForDates: {
          checkIn: format(checkInDate, "yyyy-MM-dd"),
          checkOut: format(checkOutDate, "yyyy-MM-dd"),
        }
      };
      setAvailabilityData(enrichedData);
      
      // Cache the data for this property
      setAvailabilityCache(prev => ({
        ...prev,
        [selectedPropertyId]: enrichedData
      }));
      
      toast({ title: "Availability fetched", description: `Retrieved data for ${data.roomTypes?.length || 0} room types` });
    } catch (error: any) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
    setFetchingAvailability(false);
  };

  // Calculate cost based on availability data
  const calculateCost = async () => {
    if (!selectedPropertyId || !selectedRoomTypeId || !selectedRateTypeId || !checkInDate || !checkOutDate) {
      toast({ title: "Missing data", description: "Fill in all required fields", variant: "destructive" });
      return;
    }

    setCalculating(true);
    try {
      // Fetch availability if not already fetched
      let availability = availabilityData;
      if (!availability) {
        const { data, error } = await supabase.functions.invoke("benson-api", {
          body: {
            action: "fetch_availability",
            property_id: selectedPropertyId,
            start_date: format(checkInDate, "yyyy-MM-dd"),
            end_date: format(checkOutDate, "yyyy-MM-dd"),
          },
        });

        if (error) throw error;
        availability = data;
        setAvailabilityData(data);
      }

      // Find the selected room type
      const roomType = availability?.roomTypes?.find(
        (rt: any) => String(rt.roomTypeId) === selectedRoomTypeId
      );

      if (!roomType) {
        toast({ title: "Room type not found", description: "Selected room type not in availability data", variant: "destructive" });
        setCostBreakdown([]);
        setTotalCost(0);
        setCalculating(false);
        return;
      }

      // Find the selected rate type
      const rateType = roomType.rateTypes?.find(
        (rt: any) => String(rt.rateTypeId) === selectedRateTypeId
      );

      if (!rateType) {
        toast({ title: "Rate type not found", description: "Selected rate type not available for this room", variant: "destructive" });
        setCostBreakdown([]);
        setTotalCost(0);
        setCalculating(false);
        return;
      }

      // Calculate cost line items
      const lineItems: CostLineItem[] = [];
      let runningTotal = 0;

      // Process rates - only use rates for the selected nights (first N entries)
      const allRates = rateType.rates || [];
      const rates = allRates.slice(0, nights); // Only take rates for the selected nights
      const priceType = (rateType.priceType || 'PER ROOM').toUpperCase();
      
      if (priceType === 'PER ROOM' || priceType === 'PERROOM') {
        // Per room pricing - total is just sum of roomAmount for each night
        // NOT multiplied by number of guests
        let totalRoomAmount = 0;
        rates.forEach((rate: any) => {
          totalRoomAmount += rate.roomAmount || 0;
        });
        
        if (totalRoomAmount > 0) {
          lineItems.push({
            description: `Room Rate (${rateType.name}) - ${totalGuests} guests`,
            nights: nights,
            quantity: 1, // Room rate is per room, not per person
            unitPrice: totalRoomAmount / nights,
            total: totalRoomAmount,
          });
          runningTotal += totalRoomAmount;
        }
      } else {
        // Per person pricing
        // adultAmount1 = rate for 1 adult (or adultAmount2 / 2 if not available)
        // adultAmount2 = TOTAL rate for 2 adults (NOT per person - it's the combined rate)
        // teenAmount, childAmount, infantAmount = per person rates
        let totalAdultAmount = 0;
        let totalTeenAmount = 0;
        let totalChildAmount = 0;
        let totalInfantAmount = 0;

        rates.forEach((rate: any) => {
          // Adult rates: adultAmount2 is the TOTAL for 2 adults, not per-person
          if (adults === 1) {
            totalAdultAmount += rate.adultAmount1 || rate.adultAmount || 0;
          } else if (adults === 2) {
            // adultAmount2 is the total rate for 2 adults sharing (not multiplied)
            totalAdultAmount += rate.adultAmount2 || rate.adultAmount || 0;
          } else if (adults > 2) {
            // For more than 2 adults, use adultAmount2 as base + additional adults at adultAmount1 rate
            const baseRate = rate.adultAmount2 || rate.adultAmount || 0;
            const additionalAdultRate = rate.adultAmount1 || rate.adultAmount || 0;
            totalAdultAmount += baseRate + (additionalAdultRate * (adults - 2));
          }
          
          // Teen, child, infant rates ARE per-person
          if (teens > 0) {
            totalTeenAmount += (rate.teenAmount || 0) * teens;
          }
          if (children > 0) {
            totalChildAmount += (rate.childAmount || 0) * children;
          }
          if (infants > 0) {
            totalInfantAmount += (rate.infantAmount || 0) * infants;
          }
        });

        if (totalAdultAmount > 0) {
          // For 2 adults, adultAmount2 is a combined rate (Qty=1), not per-person
          // For 1 adult, adultAmount1 is also a single rate (Qty=1)
          lineItems.push({
            description: `Adult Rate (${adults} adult${adults > 1 ? 's' : ''})`,
            nights: nights,
            quantity: 1, // Combined rate, not per-person
            unitPrice: totalAdultAmount / nights,
            total: totalAdultAmount,
          });
          runningTotal += totalAdultAmount;
        }

        if (totalTeenAmount > 0 && teens > 0) {
          // Unit price is the per-person rate from API
          const perPersonPerNight = totalTeenAmount / nights / teens;
          lineItems.push({
            description: `Teen Rate (${teens} teen${teens > 1 ? 's' : ''})`,
            nights: nights,
            quantity: teens,
            unitPrice: perPersonPerNight,
            total: totalTeenAmount,
          });
          runningTotal += totalTeenAmount;
        }

        if (totalChildAmount > 0 && children > 0) {
          const perPersonPerNight = totalChildAmount / nights / children;
          lineItems.push({
            description: `Child Rate (${children} child${children > 1 ? 'ren' : ''})`,
            nights: nights,
            quantity: children,
            unitPrice: perPersonPerNight,
            total: totalChildAmount,
          });
          runningTotal += totalChildAmount;
        }

        if (totalInfantAmount > 0 && infants > 0) {
          const perPersonPerNight = totalInfantAmount / nights / infants;
          lineItems.push({
            description: `Infant Rate (${infants} infant${infants > 1 ? 's' : ''})`,
            nights: nights,
            quantity: infants,
            unitPrice: perPersonPerNight,
            total: totalInfantAmount,
          });
          runningTotal += totalInfantAmount;
        }
      }

      setCostBreakdown(lineItems);
      setTotalCost(runningTotal);
      toast({ title: "Cost calculated", description: `Total: R${runningTotal.toFixed(2)}` });
    } catch (error: any) {
      toast({ title: "Calculation error", description: error.message, variant: "destructive" });
    }
    setCalculating(false);
  };

  // Submit booking to Benson
  const submitBooking = async () => {
    if (!selectedPropertyId || !selectedRoomTypeId || !selectedRateTypeId || !checkInDate || !checkOutDate) {
      toast({ title: "Missing data", description: "Fill in all required fields", variant: "destructive" });
      return;
    }

    if (!guestName || !guestEmail || !guestPhone) {
      toast({ title: "Missing guest info", description: "Fill in guest name, email and phone", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const testId = `test-${Date.now()}`;
    const property = properties.find(p => p.id === selectedPropertyId);
    const roomType = roomTypes.find(rt => rt.external_room_type_id === selectedRoomTypeId);
    const rateType = rateTypes.find(rt => rt.external_rate_type_id === selectedRateTypeId);

    // Add to tracking table
    const newTest: BookingTest = {
      id: testId,
      timestamp: new Date().toISOString(),
      property: property?.name || 'Unknown',
      roomType: roomType?.name || selectedRoomTypeId,
      rateType: rateType?.name || selectedRateTypeId,
      dates: `${format(checkInDate, "yyyy-MM-dd")} to ${format(checkOutDate, "yyyy-MM-dd")}`,
      guests: `${adults}A ${teens}T ${children}C ${infants}I`,
      totalCost: totalCost,
      status: 'pending',
    };
    setBookingTests(prev => [newTest, ...prev]);

    try {
      const reservationData = {
        arrivalDate: format(checkInDate, "yyyy-MM-dd"),
        departureDate: format(checkOutDate, "yyyy-MM-dd"),
        rateTypeId: parseInt(selectedRateTypeId),
        contactName: guestName,
        contactNumber: guestPhone,
        contactEmail: guestEmail,
        voucher: voucher || undefined,
        note: notes || undefined,
        rooms: [{
          roomTypeId: parseInt(selectedRoomTypeId),
          numberOfAdults: adults,
          numberOfTeens: teens,
          numberOfChildren: children,
          numberOfInfants: infants,
        }],
      };

      const { data, error } = await supabase.functions.invoke("benson-api", {
        body: {
          action: "create_reservation",
          property_id: selectedPropertyId,
          reservation_data: reservationData,
        },
      });

      if (error) throw error;

      setLastResponse(data);
      setBookingTests(prev => prev.map(t => 
        t.id === testId 
          ? { ...t, status: 'success' as const, response: data }
          : t
      ));

      toast({ 
        title: "Booking submitted!", 
        description: `Reservation ID: ${data.id || 'Created'}`,
      });
    } catch (error: any) {
      setBookingTests(prev => prev.map(t => 
        t.id === testId 
          ? { ...t, status: 'error' as const, error: error.message }
          : t
      ));
      toast({ title: "Submission error", description: error.message, variant: "destructive" });
    }
    setSubmitting(false);
  };

  // selectedRoomType is defined above with other validations

  return (
    <>
      <Navbar />
      <div className="container mx-auto px-4 py-8">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="flex items-center gap-4 mb-6">
            <Button variant="ghost" size="icon" onClick={() => navigate("/admin/benson-config")}>
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-bold">Test Booking - Benson</h1>
                <Badge variant="outline" className="text-xs">Dev Only</Badge>
              </div>
              <p className="text-muted-foreground">
                Create test bookings to Benson API and analyze responses
              </p>
            </div>
          </div>

          <Tabs defaultValue="create" className="space-y-6">
            <TabsList>
              <TabsTrigger value="create">Create Booking</TabsTrigger>
              <TabsTrigger value="history">Test History ({bookingTests.length})</TabsTrigger>
              <TabsTrigger value="raw">Raw Response</TabsTrigger>
            </TabsList>

            {/* Create Booking Tab */}
            <TabsContent value="create" className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column - Input Form */}
                <div className="space-y-6">
                  {/* Property Selection */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Property Selection</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Select value={selectedPropertyId} onValueChange={setSelectedPropertyId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select Benson property..." />
                        </SelectTrigger>
                        <SelectContent>
                          {properties.map((prop) => (
                            <SelectItem key={prop.id} value={prop.id}>
                              {prop.name}
                              <span className="text-muted-foreground text-xs ml-2">
                                ({prop.benson_property_code})
                              </span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </CardContent>
                  </Card>

                  {/* Dates */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Dates</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Check-in</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start">
                                <CalendarDays className="mr-2 h-4 w-4" />
                                {checkInDate ? format(checkInDate, "PP") : "Select"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={checkInDate}
                                onSelect={setCheckInDate}
                                disabled={(date) => date < today}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div>
                          <Label>Check-out</Label>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button variant="outline" className="w-full justify-start">
                                <CalendarDays className="mr-2 h-4 w-4" />
                                {checkOutDate ? format(checkOutDate, "PP") : "Select"}
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent className="w-auto p-0">
                              <Calendar
                                mode="single"
                                selected={checkOutDate}
                                onSelect={setCheckOutDate}
                                disabled={(date) => !checkInDate || date <= checkInDate}
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">
                            {nights} night{nights !== 1 ? 's' : ''}
                          </span>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={fetchAvailability}
                            disabled={!selectedPropertyId || !checkInDate || !checkOutDate || fetchingAvailability}
                          >
                            {fetchingAvailability ? (
                              <Loader2 className="h-4 w-4 animate-spin mr-2" />
                            ) : (
                              <RefreshCw className="h-4 w-4 mr-2" />
                            )}
                            Fetch Availability
                          </Button>
                        </div>
                        {availabilityData && (
                          <div className="text-xs p-2 bg-muted/50 rounded-md space-y-1">
                            <div className="flex items-center justify-between">
                              <span className="font-medium">
                                {availabilityData.roomTypes?.length || 0} room types available
                              </span>
                              {availabilityData.fetchedAt && (
                                <span className="text-muted-foreground">
                                  {formatDistanceToNow(new Date(availabilityData.fetchedAt), { addSuffix: true })}
                                </span>
                              )}
                            </div>
                            {availabilityData.fetchedForDates && (
                              <>
                                <div className="text-muted-foreground">
                                  Data for: {availabilityData.fetchedForDates.checkIn} → {availabilityData.fetchedForDates.checkOut}
                                </div>
                                {checkInDate && checkOutDate && (
                                  availabilityData.fetchedForDates.checkIn !== format(checkInDate, "yyyy-MM-dd") ||
                                  availabilityData.fetchedForDates.checkOut !== format(checkOutDate, "yyyy-MM-dd")
                                ) && (
                                  <div className="text-amber-600 dark:text-amber-400 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Dates changed - re-fetch recommended
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Room & Rate Selection */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Room & Rate</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Room Type</Label>
                        <Select 
                          value={selectedRoomTypeId} 
                          onValueChange={setSelectedRoomTypeId}
                          disabled={!availabilityData || !selectedPropertyId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select room type..." />
                          </SelectTrigger>
                          <SelectContent>
                            {roomTypes.map((rt) => (
                              <SelectItem key={rt.id} value={rt.external_room_type_id}>
                                {rt.name}
                                <span className="text-muted-foreground text-xs ml-2">
                                  (ID: {rt.external_room_type_id})
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Rate Type</Label>
                        <Select 
                          value={selectedRateTypeId} 
                          onValueChange={setSelectedRateTypeId}
                          disabled={!availabilityData || !selectedPropertyId}
                        >
                          <SelectTrigger className={cn((isUnderMinStay || isOverMaxStay) && "border-destructive")}>
                            <SelectValue placeholder="Select rate type..." />
                          </SelectTrigger>
                          <SelectContent>
                            {rateTypes.map((rt) => (
                              <SelectItem key={rt.id} value={rt.external_rate_type_id}>
                                {rt.name}
                                <span className="text-muted-foreground text-xs ml-2">
                                  ({rt.price_type || 'N/A'}{rt.min_stay && rt.min_stay > 1 ? `, min ${rt.min_stay} nights` : ''})
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        {selectedRateType && (isUnderMinStay || isOverMaxStay) && (
                          <p className="text-sm text-destructive mt-1">
                            <AlertCircle className="h-4 w-4 inline mr-1" />
                            {isUnderMinStay && `Minimum stay is ${minStay} nights (selected ${nights})`}
                            {isOverMaxStay && `Maximum stay is ${maxStay} nights (selected ${nights})`}
                          </p>
                        )}
                        {selectedRateType && !isUnderMinStay && !isOverMaxStay && minStay > 1 && (
                          <p className="text-xs text-muted-foreground mt-1">
                            Min stay: {minStay} nights
                          </p>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Guests */}
                  <Card className={cn((isOverCapacity || isUnderCapacity) && "border-destructive")}>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center justify-between">
                        <span>Guests</span>
                        {selectedRoomType && (
                          <div className="flex gap-2">
                            {minGuests > 1 && (
                              <Badge variant={isUnderCapacity ? "destructive" : "outline"}>
                                min {minGuests}
                              </Badge>
                            )}
                            <Badge variant={isOverCapacity ? "destructive" : "secondary"}>
                              {totalGuests}/{maxGuests} max
                            </Badge>
                          </div>
                        )}
                      </CardTitle>
                      {isUnderCapacity && (
                        <p className="text-sm text-destructive">
                          <AlertCircle className="h-4 w-4 inline mr-1" />
                          Minimum {minGuests} guests required
                        </p>
                      )}
                      {isOverCapacity && (
                        <p className="text-sm text-destructive">
                          <AlertCircle className="h-4 w-4 inline mr-1" />
                          Exceeds max occupancy of {maxGuests} guests
                        </p>
                      )}
                      {selectedRateType && minStay > 1 && (
                        <p className="text-xs text-muted-foreground">
                          Min stay rules apply ({minStay} nights required)
                        </p>
                      )}
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Adults */}
                        <div>
                          <Label>Adults</Label>
                          <p className="text-xs text-muted-foreground mb-1">18+ years</p>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="icon" 
                              onClick={() => setAdults(Math.max(1, adults - 1))}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{adults}</span>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              onClick={() => setAdults(adults + 1)}
                              disabled={totalGuests >= maxGuests}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Teens - only show if allowed */}
                        {selectedRoomType?.allow_teens !== false && (
                          <div>
                            <Label>Teens</Label>
                            <p className="text-xs text-muted-foreground mb-1">13-17 years</p>
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="outline" 
                                size="icon" 
                                onClick={() => setTeens(Math.max(0, teens - 1))}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="w-8 text-center font-medium">{teens}</span>
                              <Button 
                                variant="outline" 
                                size="icon" 
                                onClick={() => setTeens(teens + 1)}
                                disabled={totalGuests >= maxGuests}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {/* Children - only show if allowed */}
                        {selectedRoomType?.allow_children !== false && (
                          <div>
                            <Label>Children</Label>
                            <p className="text-xs text-muted-foreground mb-1">2-12 years</p>
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="outline" 
                                size="icon" 
                                onClick={() => setChildren(Math.max(0, children - 1))}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="w-8 text-center font-medium">{children}</span>
                              <Button 
                                variant="outline" 
                                size="icon" 
                                onClick={() => setChildren(children + 1)}
                                disabled={totalGuests >= maxGuests}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {/* Infants - only show if allowed */}
                        {selectedRoomType?.allow_infants !== false && (
                          <div>
                            <Label>Infants</Label>
                            <p className="text-xs text-muted-foreground mb-1">Under 2 years</p>
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="outline" 
                                size="icon" 
                                onClick={() => setInfants(Math.max(0, infants - 1))}
                              >
                                <Minus className="h-4 w-4" />
                              </Button>
                              <span className="w-8 text-center font-medium">{infants}</span>
                              <Button 
                                variant="outline" 
                                size="icon" 
                                onClick={() => setInfants(infants + 1)}
                                disabled={totalGuests >= maxGuests}
                              >
                                <Plus className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  {/* Guest Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Guest Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div>
                        <Label>Name *</Label>
                        <Input value={guestName} onChange={(e) => setGuestName(e.target.value)} />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Email *</Label>
                          <Input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
                        </div>
                        <div>
                          <Label>Phone *</Label>
                          <Input value={guestPhone} onChange={(e) => setGuestPhone(e.target.value)} />
                        </div>
                      </div>
                      <div>
                        <Label>Voucher Code (optional)</Label>
                        <Input value={voucher} onChange={(e) => setVoucher(e.target.value)} />
                      </div>
                      <div>
                        <Label>Notes (optional)</Label>
                        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Right Column - Cost & Actions */}
                <div className="space-y-6">
                  {/* Cost Calculation */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Calculator className="h-5 w-5" />
                        Cost Breakdown
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <Button 
                        onClick={calculateCost} 
                        disabled={calculating || !selectedPropertyId || !selectedRoomTypeId || !selectedRateTypeId}
                        className="w-full mb-4"
                        variant="outline"
                      >
                        {calculating ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Calculator className="h-4 w-4 mr-2" />
                        )}
                        Calculate Cost
                      </Button>

                      {costBreakdown.length > 0 ? (
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Description</TableHead>
                              <TableHead className="text-right">Nights</TableHead>
                              <TableHead className="text-right">Qty</TableHead>
                              <TableHead className="text-right">Unit</TableHead>
                              <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {costBreakdown.map((item, idx) => (
                              <TableRow key={idx}>
                                <TableCell>{item.description}</TableCell>
                                <TableCell className="text-right">{item.nights}</TableCell>
                                <TableCell className="text-right">{item.quantity}</TableCell>
                                <TableCell className="text-right">R{item.unitPrice.toFixed(2)}</TableCell>
                                <TableCell className="text-right font-medium">R{item.total.toFixed(2)}</TableCell>
                              </TableRow>
                            ))}
                            <TableRow className="border-t-2">
                              <TableCell colSpan={4} className="font-bold">Total</TableCell>
                              <TableCell className="text-right font-bold text-lg">R{totalCost.toFixed(2)}</TableCell>
                            </TableRow>
                          </TableBody>
                        </Table>
                      ) : (
                        <p className="text-muted-foreground text-center py-8">
                          Click "Calculate Cost" to see breakdown
                        </p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Submit Button */}
                  <Card>
                    <CardContent className="pt-6 space-y-3">
                      {/* Validation warnings */}
                      {(isOverCapacity || isUnderCapacity || isUnderMinStay || isOverMaxStay) && (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md space-y-1">
                          {isUnderCapacity && (
                            <p className="text-sm text-destructive flex items-center gap-2">
                              <AlertCircle className="h-4 w-4" />
                              Below min occupancy ({totalGuests}/{minGuests} guests required)
                            </p>
                          )}
                          {isOverCapacity && (
                            <p className="text-sm text-destructive flex items-center gap-2">
                              <AlertCircle className="h-4 w-4" />
                              Exceeds max occupancy ({totalGuests}/{maxGuests})
                            </p>
                          )}
                          {isUnderMinStay && (
                            <p className="text-sm text-destructive flex items-center gap-2">
                              <AlertCircle className="h-4 w-4" />
                              Below min stay ({nights}/{minStay} nights required)
                            </p>
                          )}
                          {isOverMaxStay && (
                            <p className="text-sm text-destructive flex items-center gap-2">
                              <AlertCircle className="h-4 w-4" />
                              Exceeds max stay ({nights}/{maxStay} nights)
                            </p>
                          )}
                        </div>
                      )}
                      <Button 
                        onClick={submitBooking} 
                        disabled={submitting || !selectedPropertyId || !selectedRoomTypeId || !selectedRateTypeId || isOverCapacity || isUnderCapacity || isUnderMinStay || isOverMaxStay}
                        className="w-full"
                        size="lg"
                      >
                        {submitting ? (
                          <Loader2 className="h-5 w-5 animate-spin mr-2" />
                        ) : (
                          <Send className="h-5 w-5 mr-2" />
                        )}
                        Submit Booking to Benson
                      </Button>
                      <p className="text-xs text-muted-foreground text-center">
                        This will create a real reservation in Benson
                      </p>
                    </CardContent>
                  </Card>

                  {/* Availability Data Preview */}
                  {availabilityData && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Availability Data</CardTitle>
                        <CardDescription>
                          {availabilityData.roomTypes?.length || 0} room types found
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <ExpandableDataViewer 
                          data={availabilityData} 
                          label="API Response" 
                          defaultExpanded={false}
                        />
                      </CardContent>
                    </Card>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Test History Tab */}
            <TabsContent value="history">
              <Card>
                <CardHeader>
                  <CardTitle>Test Booking History</CardTitle>
                  <CardDescription>Track all test bookings submitted during this session</CardDescription>
                </CardHeader>
                <CardContent>
                  {bookingTests.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">
                      No test bookings yet. Create one to see it here.
                    </p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Timestamp</TableHead>
                          <TableHead>Property</TableHead>
                          <TableHead>Room</TableHead>
                          <TableHead>Rate</TableHead>
                          <TableHead>Dates</TableHead>
                          <TableHead>Guests</TableHead>
                          <TableHead className="text-right">Cost</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {bookingTests.map((test) => (
                          <TableRow key={test.id}>
                            <TableCell className="text-xs">
                              {format(new Date(test.timestamp), "HH:mm:ss")}
                            </TableCell>
                            <TableCell className="max-w-32 truncate">{test.property}</TableCell>
                            <TableCell className="max-w-24 truncate">{test.roomType}</TableCell>
                            <TableCell className="max-w-24 truncate">{test.rateType}</TableCell>
                            <TableCell className="text-xs">{test.dates}</TableCell>
                            <TableCell>{test.guests}</TableCell>
                            <TableCell className="text-right">R{test.totalCost.toFixed(2)}</TableCell>
                            <TableCell>
                              {test.status === 'pending' && (
                                <Badge variant="secondary">
                                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                                  Pending
                                </Badge>
                              )}
                              {test.status === 'success' && (
                                <Badge className="bg-green-500">
                                  <CheckCircle2 className="h-3 w-3 mr-1" />
                                  Success
                                </Badge>
                              )}
                              {test.status === 'error' && (
                                <Badge variant="destructive">
                                  <AlertCircle className="h-3 w-3 mr-1" />
                                  Error
                                </Badge>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              {/* Detailed responses */}
              {bookingTests.filter(t => t.response || t.error).map((test) => (
                <Card key={test.id} className="mt-4">
                  <CardHeader>
                    <CardTitle className="text-sm flex items-center gap-2">
                      Test: {format(new Date(test.timestamp), "HH:mm:ss")} - {test.property}
                      {test.status === 'success' ? (
                        <Badge className="bg-green-500">Success</Badge>
                      ) : (
                        <Badge variant="destructive">Error</Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {test.error ? (
                      <pre className="text-sm text-destructive bg-destructive/10 p-4 rounded overflow-auto">
                        {test.error}
                      </pre>
                    ) : (
                      <ExpandableDataViewer data={test.response} label="Response" defaultExpanded={true} />
                    )}
                  </CardContent>
                </Card>
              ))}
            </TabsContent>

            {/* Raw Response Tab */}
            <TabsContent value="raw">
              <Card>
                <CardHeader>
                  <CardTitle>Last API Response</CardTitle>
                  <CardDescription>Raw response from the most recent Benson API call</CardDescription>
                </CardHeader>
                <CardContent>
                  {lastResponse ? (
                    <ExpandableDataViewer data={lastResponse} label="Last Response" defaultExpanded={true} />
                  ) : (
                    <p className="text-muted-foreground text-center py-8">
                      No response yet. Submit a booking to see the raw response.
                    </p>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </>
  );
};

export default TestBookingBenson;
