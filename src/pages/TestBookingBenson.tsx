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
import { format, addDays, differenceInDays, startOfDay } from "date-fns";
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

  // Fetch room types for selected property
  const { data: roomTypes = [], isLoading: roomTypesLoading } = useQuery({
    queryKey: ["benson-room-types", selectedPropertyId],
    queryFn: async () => {
      if (!selectedPropertyId) return [];
      
      const { data, error } = await supabase
        .from("pms_room_types_cache")
        .select("id, external_room_type_id, name, max_guests, min_guests, allow_teens, allow_children, allow_infants")
        .eq("property_id", selectedPropertyId)
        .eq("system_type", "benson")
        .order("name");
      
      if (error) throw error;
      return data as RoomType[];
    },
    enabled: !!selectedPropertyId,
  });

  // Fetch rate types for selected property
  const { data: rateTypes = [], isLoading: rateTypesLoading } = useQuery({
    queryKey: ["benson-rate-types", selectedPropertyId],
    queryFn: async () => {
      if (!selectedPropertyId) return [];
      
      const { data, error } = await supabase
        .from("pms_rate_types_cache")
        .select("id, external_rate_type_id, name, price_type")
        .eq("property_id", selectedPropertyId)
        .eq("system_type", "benson")
        .order("name");
      
      if (error) throw error;
      return data as RateType[];
    },
    enabled: !!selectedPropertyId,
  });

  // Reset form when property changes
  useEffect(() => {
    setSelectedRoomTypeId("");
    setSelectedRateTypeId("");
    setCostBreakdown([]);
    setTotalCost(0);
    setAvailabilityData(null);
  }, [selectedPropertyId]);

  // Calculate number of nights
  const nights = useMemo(() => {
    if (!checkInDate || !checkOutDate) return 0;
    return differenceInDays(checkOutDate, checkInDate);
  }, [checkInDate, checkOutDate]);

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

      setAvailabilityData(data);
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

      // Process each night
      const rates = rateType.rates || [];
      const priceType = rateType.priceType || 'PER ROOM';

      if (priceType === 'PER ROOM') {
        // Per room pricing
        let totalRoomAmount = 0;
        rates.forEach((rate: any) => {
          totalRoomAmount += rate.roomAmount || 0;
        });
        
        if (totalRoomAmount > 0) {
          lineItems.push({
            description: `Room Rate (${rateType.name})`,
            nights: nights,
            quantity: 1,
            unitPrice: totalRoomAmount / nights,
            total: totalRoomAmount,
          });
          runningTotal += totalRoomAmount;
        }
      } else {
        // Per person pricing
        let totalAdultAmount = 0;
        let totalTeenAmount = 0;
        let totalChildAmount = 0;
        let totalInfantAmount = 0;

        rates.forEach((rate: any) => {
          // Use appropriate adult rate based on number of adults
          if (adults === 1 && rate.adultAmount1) {
            totalAdultAmount += rate.adultAmount1;
          } else if (adults >= 2 && rate.adultAmount2) {
            totalAdultAmount += rate.adultAmount2 * adults;
          } else if (rate.adultAmount1) {
            totalAdultAmount += rate.adultAmount1 * adults;
          }
          
          if (teens > 0 && rate.teenAmount) {
            totalTeenAmount += rate.teenAmount * teens;
          }
          if (children > 0 && rate.childAmount) {
            totalChildAmount += rate.childAmount * children;
          }
          if (infants > 0 && rate.infantAmount) {
            totalInfantAmount += rate.infantAmount * infants;
          }
        });

        if (totalAdultAmount > 0) {
          lineItems.push({
            description: `Adult Rate (${adults} adult${adults > 1 ? 's' : ''})`,
            nights: nights,
            quantity: adults,
            unitPrice: totalAdultAmount / nights / adults,
            total: totalAdultAmount,
          });
          runningTotal += totalAdultAmount;
        }

        if (totalTeenAmount > 0) {
          lineItems.push({
            description: `Teen Rate (${teens} teen${teens > 1 ? 's' : ''})`,
            nights: nights,
            quantity: teens,
            unitPrice: totalTeenAmount / nights / teens,
            total: totalTeenAmount,
          });
          runningTotal += totalTeenAmount;
        }

        if (totalChildAmount > 0) {
          lineItems.push({
            description: `Child Rate (${children} child${children > 1 ? 'ren' : ''})`,
            nights: nights,
            quantity: children,
            unitPrice: totalChildAmount / nights / children,
            total: totalChildAmount,
          });
          runningTotal += totalChildAmount;
        }

        if (totalInfantAmount > 0) {
          lineItems.push({
            description: `Infant Rate (${infants} infant${infants > 1 ? 's' : ''})`,
            nights: nights,
            quantity: infants,
            unitPrice: totalInfantAmount / nights / infants,
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

  const selectedRoomType = roomTypes.find(rt => rt.external_room_type_id === selectedRoomTypeId);

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
                          disabled={roomTypesLoading || !selectedPropertyId}
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
                          disabled={rateTypesLoading || !selectedPropertyId}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select rate type..." />
                          </SelectTrigger>
                          <SelectContent>
                            {rateTypes.map((rt) => (
                              <SelectItem key={rt.id} value={rt.external_rate_type_id}>
                                {rt.name}
                                <span className="text-muted-foreground text-xs ml-2">
                                  ({rt.price_type || 'N/A'})
                                </span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Guests */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Guests</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 gap-4">
                        {/* Adults */}
                        <div>
                          <Label>Adults</Label>
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
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Teens */}
                        <div>
                          <Label className={cn(!selectedRoomType?.allow_teens && "text-muted-foreground")}>
                            Teens {!selectedRoomType?.allow_teens && "(N/A)"}
                          </Label>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="icon" 
                              onClick={() => setTeens(Math.max(0, teens - 1))}
                              disabled={!selectedRoomType?.allow_teens}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{teens}</span>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              onClick={() => setTeens(teens + 1)}
                              disabled={!selectedRoomType?.allow_teens}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Children */}
                        <div>
                          <Label className={cn(!selectedRoomType?.allow_children && "text-muted-foreground")}>
                            Children {!selectedRoomType?.allow_children && "(N/A)"}
                          </Label>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="icon" 
                              onClick={() => setChildren(Math.max(0, children - 1))}
                              disabled={!selectedRoomType?.allow_children}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{children}</span>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              onClick={() => setChildren(children + 1)}
                              disabled={!selectedRoomType?.allow_children}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Infants */}
                        <div>
                          <Label className={cn(!selectedRoomType?.allow_infants && "text-muted-foreground")}>
                            Infants {!selectedRoomType?.allow_infants && "(N/A)"}
                          </Label>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="icon" 
                              onClick={() => setInfants(Math.max(0, infants - 1))}
                              disabled={!selectedRoomType?.allow_infants}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{infants}</span>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              onClick={() => setInfants(infants + 1)}
                              disabled={!selectedRoomType?.allow_infants}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
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
                    <CardContent className="pt-6">
                      <Button 
                        onClick={submitBooking} 
                        disabled={submitting || !selectedPropertyId || !selectedRoomTypeId || !selectedRateTypeId}
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
                      <p className="text-xs text-muted-foreground text-center mt-2">
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
