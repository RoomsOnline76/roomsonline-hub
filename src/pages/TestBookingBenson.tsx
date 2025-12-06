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
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useToast } from "@/hooks/use-toast";
import { ExpandableDataViewer } from "@/components/ExpandableDataViewer";
import { 
  CalendarDays, Users, Loader2, Send, Calculator, 
  ArrowLeft, Plus, Minus, CheckCircle2, AlertCircle, RefreshCw, Trash2, BedDouble, ChevronDown
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

interface BookingRoom {
  id: string;
  roomTypeId: string;
  rateTypeId: string;
  adults: number;
  teens: number;
  children: number;
  infants: number;
  // Optional per-room dates (uses main dates if not set)
  customCheckIn?: Date;
  customCheckOut?: Date;
}

interface RoomCostBreakdown {
  roomId: string;
  roomIndex: number;
  roomName: string;
  rateName: string;
  dates: { checkIn: Date; checkOut: Date; nights: number };
  lineItems: CostLineItem[];
  roomTotal: number;
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
  // Multi-room booking state
  const [bookingRooms, setBookingRooms] = useState<BookingRoom[]>([
    { id: crypto.randomUUID(), roomTypeId: "", rateTypeId: "", adults: 2, teens: 0, children: 0, infants: 0 }
  ]);
  
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [voucher, setVoucher] = useState("");
  const [notes, setNotes] = useState("");
  
  // Loading states
  const [calculating, setCalculating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fetchingAvailability, setFetchingAvailability] = useState(false);
  
  // Results
  const [costBreakdown, setCostBreakdown] = useState<CostLineItem[]>([]);
  const [roomCostBreakdowns, setRoomCostBreakdowns] = useState<RoomCostBreakdown[]>([]);
  const [totalCost, setTotalCost] = useState(0);
  const [bookingTests, setBookingTests] = useState<BookingTest[]>([]);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [availabilityData, setAvailabilityData] = useState<any>(null);
  const [availabilityCache, setAvailabilityCache] = useState<Record<string, any>>({});
  
  // Calendar open states for main dates
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [checkOutOpen, setCheckOutOpen] = useState(false);
  
  // Per-room calendar open states
  const [roomCalendarOpen, setRoomCalendarOpen] = useState<Record<string, { checkIn: boolean; checkOut: boolean }>>({});
  
  // Expandable cost breakdowns state
  const [expandedRoomCosts, setExpandedRoomCosts] = useState<Record<string, boolean>>({});

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
    return availabilityData.roomTypes.map((rt: any) => {
      // Get available units from roomsAvailablePerNight array (Benson structure)
      // Calculate minimum available units across all dates in the range
      let availableUnits = 0;
      
      if (rt.roomsAvailablePerNight && rt.roomsAvailablePerNight.length > 0) {
        // Get minimum units across all nights in the range
        availableUnits = rt.roomsAvailablePerNight.reduce((min: number, night: any) => {
          const units = night.numberOfRoomsAvailable ?? 0;
          return Math.min(min, units);
        }, rt.roomsAvailablePerNight[0]?.numberOfRoomsAvailable ?? 0);
      }
      
      return {
        id: String(rt.roomTypeId),
        external_room_type_id: String(rt.roomTypeId),
        name: rt.name,
        max_guests: rt.maxGuests || rt.maxPeople || 10,
        min_guests: rt.minGuests || 1,
        allow_teens: rt.allowTeens ?? true,
        allow_children: rt.allowChildren ?? true,
        allow_infants: rt.allowInfants ?? true,
        available_units: availableUnits,
      };
    });
  }, [availabilityData]);

  // Get rate types for a specific room type
  const getRateTypesForRoom = (roomTypeId: string) => {
    if (!availabilityData?.roomTypes || !roomTypeId) return [];
    
    const selectedRoom = availabilityData.roomTypes.find(
      (rt: any) => String(rt.roomTypeId) === roomTypeId
    );
    
    if (!selectedRoom?.rateTypes) return [];
    
    const rateList: (RateType & { min_stay?: number; max_stay?: number; hasRates: boolean })[] = [];
    
    selectedRoom.rateTypes.forEach((rate: any) => {
      const rateTypeId = String(rate.rateTypeId);
      
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
    
    return rateList.filter(rt => rt.hasRates);
  };

  // Calculate number of nights
  const nights = useMemo(() => {
    if (!checkInDate || !checkOutDate) return 0;
    return differenceInDays(checkOutDate, checkInDate);
  }, [checkInDate, checkOutDate]);

  // Helper to get effective dates for a room (uses custom dates or falls back to main dates)
  const getRoomDates = (room: BookingRoom) => {
    const effectiveCheckIn = room.customCheckIn || checkInDate;
    const effectiveCheckOut = room.customCheckOut || checkOutDate;
    const roomNights = effectiveCheckIn && effectiveCheckOut 
      ? differenceInDays(effectiveCheckOut, effectiveCheckIn) 
      : 0;
    return { checkIn: effectiveCheckIn, checkOut: effectiveCheckOut, nights: roomNights };
  };

  // Helper functions for multi-room management
  const addRoom = () => {
    // New rooms inherit rate type from first room
    const firstRoomRateTypeId = bookingRooms[0]?.rateTypeId || "";
    setBookingRooms(prev => [...prev, {
      id: crypto.randomUUID(),
      roomTypeId: "",
      rateTypeId: firstRoomRateTypeId, // Inherit from first room
      adults: 2,
      teens: 0,
      children: 0,
      infants: 0,
      // New rooms default to main dates (undefined = use main)
      customCheckIn: undefined,
      customCheckOut: undefined,
    }]);
  };

  const removeRoom = (roomId: string) => {
    if (bookingRooms.length <= 1) return;
    setBookingRooms(prev => prev.filter(r => r.id !== roomId));
  };

  const updateRoom = (roomId: string, updates: Partial<BookingRoom>) => {
    setBookingRooms(prev => prev.map(room => {
      if (room.id !== roomId) return room;
      
      const updatedRoom = { ...room, ...updates };
      
      // If room type changed, reset rate type and enforce guest restrictions
      if (updates.roomTypeId !== undefined && updates.roomTypeId !== room.roomTypeId) {
        updatedRoom.rateTypeId = "";
        const roomType = roomTypes.find(rt => rt.external_room_type_id === updates.roomTypeId);
        if (roomType) {
          if (!roomType.allow_teens) updatedRoom.teens = 0;
          if (!roomType.allow_children) updatedRoom.children = 0;
          if (!roomType.allow_infants) updatedRoom.infants = 0;
        }
      }
      
      return updatedRoom;
    }));
  };

  // Validation helpers per room
  const getRoomValidation = (room: BookingRoom, roomIndex: number) => {
    const roomType = roomTypes.find(rt => rt.external_room_type_id === room.roomTypeId);
    
    // For rate type validation, always use the first room's rate type since it's global
    // But look up the rate in the CURRENT room's available rates (since same rate ID may have different constraints per room type)
    const firstRoomRateTypeId = bookingRooms[0]?.rateTypeId;
    const rateType = getRateTypesForRoom(room.roomTypeId).find(rt => rt.external_rate_type_id === firstRoomRateTypeId);
    
    // Check if the selected global rate type is available for this room type
    const rateTypeAvailableForRoom = roomIndex === 0 || !firstRoomRateTypeId || 
      getRateTypesForRoom(room.roomTypeId).some(rt => rt.external_rate_type_id === firstRoomRateTypeId);
    
    const totalGuests = room.adults + room.teens + room.children + room.infants;
    const maxGuests = roomType?.max_guests || 10;
    const minGuests = roomType?.min_guests || 1;
    const minStay = rateType?.min_stay || 1;
    const maxStay = rateType?.max_stay || 365;
    
    // Use room-specific nights for validation
    const { nights: roomNights } = getRoomDates(room);
    
    return {
      roomType,
      rateType,
      totalGuests,
      maxGuests,
      minGuests,
      isOverCapacity: totalGuests > maxGuests,
      isUnderCapacity: totalGuests < minGuests,
      isUnderMinStay: roomNights > 0 && roomNights < minStay,
      isOverMaxStay: roomNights > maxStay,
      rateTypeUnavailable: !rateTypeAvailableForRoom,
      minStay,
      maxStay,
      roomNights,
    };
  };

  // Check if any room has validation errors
  const hasValidationErrors = bookingRooms.some((room, index) => {
    const validation = getRoomValidation(room, index);
    // For rate type check, use first room's rate type since it's global
    const effectiveRateTypeId = index === 0 ? room.rateTypeId : bookingRooms[0]?.rateTypeId;
    return !room.roomTypeId || !effectiveRateTypeId || validation.isOverCapacity || validation.isUnderCapacity || validation.isUnderMinStay || validation.isOverMaxStay || validation.rateTypeUnavailable;
  });

  // Calculate grand totals across all rooms
  const grandTotalGuests = bookingRooms.reduce((sum, room) => sum + room.adults + room.teens + room.children + room.infants, 0);

  // Reset booking rooms when property changes
  useEffect(() => {
    setBookingRooms([{ id: crypto.randomUUID(), roomTypeId: "", rateTypeId: "", adults: 2, teens: 0, children: 0, infants: 0 }]);
    setCostBreakdown([]);
    setRoomCostBreakdowns([]);
    setExpandedRoomCosts({});
    setTotalCost(0);
    
    if (selectedPropertyId && availabilityCache[selectedPropertyId]) {
      setAvailabilityData(availabilityCache[selectedPropertyId]);
    } else {
      setAvailabilityData(null);
    }
  }, [selectedPropertyId]);

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

  // Calculate cost based on availability data - for ALL rooms
  const calculateCost = async () => {
    // Check all rooms have required selections
    // Rate type is global (from first room), so only check first room's rateTypeId
    const firstRoomRateTypeId = bookingRooms[0]?.rateTypeId;
    const hasIncompleteRooms = bookingRooms.some(room => !room.roomTypeId) || !firstRoomRateTypeId;
    if (!selectedPropertyId || hasIncompleteRooms || !checkInDate || !checkOutDate) {
      toast({ title: "Missing data", description: "Fill in all required fields for all rooms", variant: "destructive" });
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

      const allLineItems: CostLineItem[] = [];
      const roomBreakdowns: RoomCostBreakdown[] = [];
      let runningTotal = 0;

      // Calculate cost for each room
      for (let roomIndex = 0; roomIndex < bookingRooms.length; roomIndex++) {
        const bookingRoom = bookingRooms[roomIndex];
        const roomDates = getRoomDates(bookingRoom);
        const roomNights = roomDates.nights;
        
        const roomType = availability?.roomTypes?.find(
          (rt: any) => String(rt.roomTypeId) === bookingRoom.roomTypeId
        );

        if (!roomType) continue;

        const rateType = roomType.rateTypes?.find(
          (rt: any) => String(rt.rateTypeId) === bookingRoom.rateTypeId
        );

        if (!rateType) continue;

        const roomLabel = `Room ${roomIndex + 1}: ${roomType.name}`;
        const allRates = rateType.rates || [];
        const rates = allRates.slice(0, roomNights);
        const priceType = (rateType.priceType || 'PER ROOM').toUpperCase();
        const roomTotalGuests = bookingRoom.adults + bookingRoom.teens + bookingRoom.children + bookingRoom.infants;

        const roomLineItems: CostLineItem[] = [];
        let roomTotal = 0;

        if (priceType === 'PER ROOM' || priceType === 'PERROOM') {
          let totalRoomAmount = 0;
          rates.forEach((rate: any) => {
            totalRoomAmount += rate.roomAmount || 0;
          });

          if (totalRoomAmount > 0) {
            const lineItem = {
              description: `${roomLabel} (${rateType.name}) - ${roomTotalGuests} guests`,
              nights: roomNights,
              quantity: 1,
              unitPrice: totalRoomAmount / roomNights,
              total: totalRoomAmount,
            };
            allLineItems.push(lineItem);
            roomLineItems.push({ ...lineItem, description: `Room Rate (${roomTotalGuests} guests)` });
            roomTotal += totalRoomAmount;
            runningTotal += totalRoomAmount;
          }
        } else {
          // Per person pricing
          let totalAdultAmount = 0;
          let totalTeenAmount = 0;
          let totalChildAmount = 0;
          let totalInfantAmount = 0;

          rates.forEach((rate: any) => {
            if (bookingRoom.adults === 1) {
              totalAdultAmount += rate.adultAmount1 || rate.adultAmount || 0;
            } else if (bookingRoom.adults === 2) {
              totalAdultAmount += rate.adultAmount2 || rate.adultAmount || 0;
            } else if (bookingRoom.adults > 2) {
              const baseRate = rate.adultAmount2 || rate.adultAmount || 0;
              const additionalAdultRate = rate.adultAmount1 || rate.adultAmount || 0;
              totalAdultAmount += baseRate + (additionalAdultRate * (bookingRoom.adults - 2));
            }

            if (bookingRoom.teens > 0) {
              totalTeenAmount += (rate.teenAmount || 0) * bookingRoom.teens;
            }
            if (bookingRoom.children > 0) {
              totalChildAmount += (rate.childAmount || 0) * bookingRoom.children;
            }
            if (bookingRoom.infants > 0) {
              totalInfantAmount += (rate.infantAmount || 0) * bookingRoom.infants;
            }
          });

          if (totalAdultAmount > 0) {
            const lineItem = {
              description: `${roomLabel} - Adult Rate (${bookingRoom.adults} adult${bookingRoom.adults > 1 ? 's' : ''})`,
              nights: roomNights,
              quantity: 1,
              unitPrice: totalAdultAmount / roomNights,
              total: totalAdultAmount,
            };
            allLineItems.push(lineItem);
            roomLineItems.push({ ...lineItem, description: `Adult Rate (${bookingRoom.adults} adult${bookingRoom.adults > 1 ? 's' : ''})` });
            roomTotal += totalAdultAmount;
            runningTotal += totalAdultAmount;
          }

          if (totalTeenAmount > 0 && bookingRoom.teens > 0) {
            const perPersonPerNight = totalTeenAmount / roomNights / bookingRoom.teens;
            const lineItem = {
              description: `${roomLabel} - Teen Rate (${bookingRoom.teens} teen${bookingRoom.teens > 1 ? 's' : ''})`,
              nights: roomNights,
              quantity: bookingRoom.teens,
              unitPrice: perPersonPerNight,
              total: totalTeenAmount,
            };
            allLineItems.push(lineItem);
            roomLineItems.push({ ...lineItem, description: `Teen Rate (${bookingRoom.teens} teen${bookingRoom.teens > 1 ? 's' : ''})` });
            roomTotal += totalTeenAmount;
            runningTotal += totalTeenAmount;
          }

          if (totalChildAmount > 0 && bookingRoom.children > 0) {
            const perPersonPerNight = totalChildAmount / roomNights / bookingRoom.children;
            const lineItem = {
              description: `${roomLabel} - Child Rate (${bookingRoom.children} child${bookingRoom.children > 1 ? 'ren' : ''})`,
              nights: roomNights,
              quantity: bookingRoom.children,
              unitPrice: perPersonPerNight,
              total: totalChildAmount,
            };
            allLineItems.push(lineItem);
            roomLineItems.push({ ...lineItem, description: `Child Rate (${bookingRoom.children} child${bookingRoom.children > 1 ? 'ren' : ''})` });
            roomTotal += totalChildAmount;
            runningTotal += totalChildAmount;
          }

          if (totalInfantAmount > 0 && bookingRoom.infants > 0) {
            const perPersonPerNight = totalInfantAmount / roomNights / bookingRoom.infants;
            const lineItem = {
              description: `${roomLabel} - Infant Rate (${bookingRoom.infants} infant${bookingRoom.infants > 1 ? 's' : ''})`,
              nights: roomNights,
              quantity: bookingRoom.infants,
              unitPrice: perPersonPerNight,
              total: totalInfantAmount,
            };
            allLineItems.push(lineItem);
            roomLineItems.push({ ...lineItem, description: `Infant Rate (${bookingRoom.infants} infant${bookingRoom.infants > 1 ? 's' : ''})` });
            roomTotal += totalInfantAmount;
            runningTotal += totalInfantAmount;
          }
        }

        // Store room breakdown
        roomBreakdowns.push({
          roomId: bookingRoom.id,
          roomIndex: roomIndex + 1,
          roomName: roomType.name,
          rateName: rateType.name,
          dates: {
            checkIn: roomDates.checkIn!,
            checkOut: roomDates.checkOut!,
            nights: roomNights,
          },
          lineItems: roomLineItems,
          roomTotal,
        });
      }

      setCostBreakdown(allLineItems);
      setRoomCostBreakdowns(roomBreakdowns);
      setTotalCost(runningTotal);
      toast({ title: "Cost calculated", description: `Total: R${runningTotal.toFixed(2)} for ${bookingRooms.length} room(s)` });
    } catch (error: any) {
      toast({ title: "Calculation error", description: error.message, variant: "destructive" });
    }
    setCalculating(false);
  };

  // Submit booking to Benson - with all rooms
  const submitBooking = async () => {
    // Rate type is global (from first room), so only check first room's rateTypeId
    const firstRoomRateTypeId = bookingRooms[0]?.rateTypeId;
    const hasIncompleteRooms = bookingRooms.some(room => !room.roomTypeId) || !firstRoomRateTypeId;
    if (!selectedPropertyId || hasIncompleteRooms || !checkInDate || !checkOutDate) {
      toast({ title: "Missing data", description: "Fill in all required fields for all rooms", variant: "destructive" });
      return;
    }

    if (!guestName.trim() || !guestEmail.trim() || !guestPhone.trim()) {
      toast({ title: "Missing guest info", description: "Fill in guest name, email and phone", variant: "destructive" });
      return;
    }

    setSubmitting(true);
    const testId = `test-${Date.now()}`;
    const property = properties.find(p => p.id === selectedPropertyId);
    
    // Build guests summary
    const guestsSummary = bookingRooms.map((room, idx) => 
      `R${idx + 1}: ${room.adults}A ${room.teens}T ${room.children}C ${room.infants}I`
    ).join(' | ');

    // Add to tracking table
    const newTest: BookingTest = {
      id: testId,
      timestamp: new Date().toISOString(),
      property: property?.name || 'Unknown',
      roomType: `${bookingRooms.length} room(s)`,
      rateType: 'Multiple',
      dates: `${format(checkInDate, "yyyy-MM-dd")} to ${format(checkOutDate, "yyyy-MM-dd")}`,
      guests: guestsSummary,
      totalCost: totalCost,
      status: 'pending',
    };
    setBookingTests(prev => [newTest, ...prev]);

    try {
      // Build rooms array for API with per-room dates
      const roomsPayload = bookingRooms.map(room => {
        const roomDates = getRoomDates(room);
        return {
          roomTypeId: parseInt(room.roomTypeId),
          rateTypeId: parseInt(room.rateTypeId),
          numberOfAdults: room.adults,
          numberOfTeens: room.teens,
          numberOfChildren: room.children,
          numberOfInfants: room.infants,
          // Include per-room dates if different from main
          arrivalDate: roomDates.checkIn ? format(roomDates.checkIn, "yyyy-MM-dd") : undefined,
          departureDate: roomDates.checkOut ? format(roomDates.checkOut, "yyyy-MM-dd") : undefined,
        };
      });

      // Use first room's dates as primary reservation dates
      const primaryRoomDates = getRoomDates(bookingRooms[0]);
      
      const reservationData = {
        arrivalDate: format(primaryRoomDates.checkIn || checkInDate, "yyyy-MM-dd"),
        departureDate: format(primaryRoomDates.checkOut || checkOutDate, "yyyy-MM-dd"),
        rateTypeId: parseInt(bookingRooms[0].rateTypeId), // Use first room's rate type as primary
        contactName: guestName,
        contactNumber: guestPhone,
        contactEmail: guestEmail,
        voucher: voucher || undefined,
        note: notes || undefined,
        rooms: roomsPayload,
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
                          <Popover open={checkInOpen} onOpenChange={setCheckInOpen}>
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
                                onSelect={(date) => {
                                  setCheckInDate(date);
                                  setCheckInOpen(false);
                                }}
                                disabled={(date) => date < today}
                                className="pointer-events-auto"
                              />
                            </PopoverContent>
                          </Popover>
                        </div>
                        <div>
                          <Label>Check-out</Label>
                          <Popover open={checkOutOpen} onOpenChange={setCheckOutOpen}>
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
                                onSelect={(date) => {
                                  setCheckOutDate(date);
                                  setCheckOutOpen(false);
                                }}
                                disabled={(date) => !checkInDate || date <= checkInDate}
                                className="pointer-events-auto"
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

                  {/* Rooms Section - Multi-Room */}
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg flex items-center justify-between">
                        <span className="flex items-center gap-2">
                          <BedDouble className="h-5 w-5" />
                          Rooms ({bookingRooms.length})
                        </span>
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary">
                            {grandTotalGuests} total guests
                          </Badge>
                          <Button
                            variant="default"
                            size="sm"
                            onClick={addRoom}
                            disabled={!availabilityData}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add Room
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {bookingRooms.map((room, index) => {
                        const validation = getRoomValidation(room, index);
                        const rateTypesForRoom = getRateTypesForRoom(room.roomTypeId);
                        const hasErrors = validation.isOverCapacity || validation.isUnderCapacity || validation.isUnderMinStay || validation.isOverMaxStay || validation.rateTypeUnavailable;
                        const roomDates = getRoomDates(room);
                        const hasCustomDates = room.customCheckIn || room.customCheckOut;
                        
                        return (
                          <Card key={room.id} className={cn("p-4", hasErrors && "border-destructive")}>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">Room {index + 1}</span>
                                {hasCustomDates && (
                                  <Badge variant="outline" className="text-xs">
                                    Custom dates
                                  </Badge>
                                )}
                                {validation.roomNights > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    ({validation.roomNights} night{validation.roomNights !== 1 ? 's' : ''})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                {validation.roomType && (
                                  <Badge variant={hasErrors ? "destructive" : "secondary"}>
                                    {room.adults + room.teens + room.children + room.infants}/{validation.maxGuests} guests
                                  </Badge>
                                )}
                                {bookingRooms.length > 1 && (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => removeRoom(room.id)}
                                    className="h-8 w-8 text-destructive hover:text-destructive"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                )}
                              </div>
                            </div>

                            {/* Per-Room Date Override */}
                            <div className="mb-4 p-3 bg-muted/30 rounded-lg">
                              <div className="flex items-center justify-between mb-2">
                                <Label className="text-xs font-medium">Dates for this room</Label>
                                {hasCustomDates && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-xs"
                                    onClick={() => updateRoom(room.id, { customCheckIn: undefined, customCheckOut: undefined })}
                                  >
                                    Reset to default
                                  </Button>
                                )}
                              </div>
                              <div className="grid grid-cols-2 gap-2">
                                <Popover 
                                  open={roomCalendarOpen[room.id]?.checkIn || false}
                                  onOpenChange={(open) => setRoomCalendarOpen(prev => ({
                                    ...prev,
                                    [room.id]: { ...prev[room.id], checkIn: open }
                                  }))}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        "justify-start text-left font-normal h-9",
                                        !roomDates.checkIn && "text-muted-foreground"
                                      )}
                                    >
                                      <CalendarDays className="h-3.5 w-3.5 mr-2" />
                                      {roomDates.checkIn ? format(roomDates.checkIn, "MMM d, yyyy") : "Check-in"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={roomDates.checkIn}
                                      onSelect={(date) => {
                                        updateRoom(room.id, { customCheckIn: date });
                                        setRoomCalendarOpen(prev => ({
                                          ...prev,
                                          [room.id]: { ...prev[room.id], checkIn: false }
                                        }));
                                      }}
                                      disabled={(date) => date < today}
                                      initialFocus
                                      className="pointer-events-auto"
                                    />
                                  </PopoverContent>
                                </Popover>
                                <Popover
                                  open={roomCalendarOpen[room.id]?.checkOut || false}
                                  onOpenChange={(open) => setRoomCalendarOpen(prev => ({
                                    ...prev,
                                    [room.id]: { ...prev[room.id], checkOut: open }
                                  }))}
                                >
                                  <PopoverTrigger asChild>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className={cn(
                                        "justify-start text-left font-normal h-9",
                                        !roomDates.checkOut && "text-muted-foreground"
                                      )}
                                    >
                                      <CalendarDays className="h-3.5 w-3.5 mr-2" />
                                      {roomDates.checkOut ? format(roomDates.checkOut, "MMM d, yyyy") : "Check-out"}
                                    </Button>
                                  </PopoverTrigger>
                                  <PopoverContent className="w-auto p-0" align="start">
                                    <Calendar
                                      mode="single"
                                      selected={roomDates.checkOut}
                                      onSelect={(date) => {
                                        updateRoom(room.id, { customCheckOut: date });
                                        setRoomCalendarOpen(prev => ({
                                          ...prev,
                                          [room.id]: { ...prev[room.id], checkOut: false }
                                        }));
                                      }}
                                      disabled={(date) => date <= (roomDates.checkIn || today)}
                                      initialFocus
                                      className="pointer-events-auto"
                                    />
                                  </PopoverContent>
                                </Popover>
                              </div>
                              {!hasCustomDates && checkInDate && checkOutDate && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  Using default: {format(checkInDate, "MMM d")} – {format(checkOutDate, "MMM d")}
                                </p>
                              )}
                            </div>

                            {/* Room Type Selection */}
                            <div className="grid gap-4 mb-4">
                              <div className="grid grid-cols-2 gap-4">
                                <div>
                                  <Label className="text-xs">Room Type</Label>
                                  <Select 
                                    value={room.roomTypeId} 
                                    onValueChange={(value) => updateRoom(room.id, { roomTypeId: value })}
                                    disabled={!availabilityData}
                                  >
                                    <SelectTrigger className="h-9">
                                      <SelectValue placeholder="Select room..." />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {roomTypes.map((rt) => (
                                        <SelectItem key={rt.id} value={rt.external_room_type_id}>
                                          <div className="flex items-center gap-2">
                                            <span>{rt.name}</span>
                                            <span className={cn(
                                              "text-xs px-1 py-0.5 rounded",
                                              rt.available_units > 0 
                                                ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" 
                                                : "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                                            )}>
                                              {rt.available_units}
                                            </span>
                                          </div>
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                </div>
                                <div>
                                  <Label className="text-xs">
                                    Rate Type
                                    {index === 0 && <span className="text-muted-foreground ml-1">(applies to all rooms)</span>}
                                  </Label>
                                  {index === 0 ? (
                                    // First room - show rate type selector
                                    <Select 
                                      value={room.rateTypeId} 
                                      onValueChange={(value) => {
                                        // Update all rooms with this rate type in a single state update
                                        setBookingRooms(prev => prev.map(r => ({ ...r, rateTypeId: value })));
                                      }}
                                      disabled={!room.roomTypeId}
                                    >
                                      <SelectTrigger className={cn("h-9", validation.isUnderMinStay && "border-destructive")}>
                                        <SelectValue placeholder="Select rate..." />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {rateTypesForRoom.map((rt) => (
                                          <SelectItem key={rt.id} value={rt.external_rate_type_id}>
                                            {rt.name}
                                            <span className="text-muted-foreground text-xs ml-1">
                                              ({rt.price_type?.substring(0, 4) || 'N/A'})
                                            </span>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    // Subsequent rooms - show read-only badge with first room's rate type
                                    <div className="h-9 flex items-center">
                                      <Badge variant="secondary" className="font-normal">
                                        {getRateTypesForRoom(bookingRooms[0]?.roomTypeId).find(rt => rt.external_rate_type_id === bookingRooms[0]?.rateTypeId)?.name || "Select in Room 1"}
                                      </Badge>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {/* Validation warnings */}
                              {hasErrors && (
                                <div className="text-xs text-destructive space-y-0.5">
                                  {validation.isUnderCapacity && (
                                    <p><AlertCircle className="h-3 w-3 inline mr-1" />Min {validation.minGuests} guests required</p>
                                  )}
                                  {validation.isOverCapacity && (
                                    <p><AlertCircle className="h-3 w-3 inline mr-1" />Max {validation.maxGuests} guests exceeded</p>
                                  )}
                                  {validation.isUnderMinStay && (
                                    <p><AlertCircle className="h-3 w-3 inline mr-1" />Min stay: {validation.minStay} nights (this room has {validation.roomNights})</p>
                                  )}
                                  {validation.rateTypeUnavailable && (
                                    <p><AlertCircle className="h-3 w-3 inline mr-1" />Selected rate type not available for this room type</p>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Guest Counts */}
                            {room.roomTypeId && (
                              <div className="grid grid-cols-4 gap-2">
                                {/* Adults */}
                                <div>
                                  <Label className="text-xs">Adults</Label>
                                  <div className="flex items-center gap-1 mt-1">
                                    <Button 
                                      variant="outline" 
                                      size="icon" 
                                      className="h-7 w-7"
                                      onClick={() => updateRoom(room.id, { adults: Math.max(1, room.adults - 1) })}
                                    >
                                      <Minus className="h-3 w-3" />
                                    </Button>
                                    <span className="w-6 text-center text-sm font-medium">{room.adults}</span>
                                    <Button 
                                      variant="outline" 
                                      size="icon" 
                                      className="h-7 w-7"
                                      onClick={() => updateRoom(room.id, { adults: room.adults + 1 })}
                                      disabled={room.adults + room.teens + room.children + room.infants >= validation.maxGuests}
                                    >
                                      <Plus className="h-3 w-3" />
                                    </Button>
                                  </div>
                                </div>
                                
                                {/* Teens */}
                                {validation.roomType?.allow_teens !== false && (
                                  <div>
                                    <Label className="text-xs">Teens</Label>
                                    <div className="flex items-center gap-1 mt-1">
                                      <Button 
                                        variant="outline" 
                                        size="icon" 
                                        className="h-7 w-7"
                                        onClick={() => updateRoom(room.id, { teens: Math.max(0, room.teens - 1) })}
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <span className="w-6 text-center text-sm font-medium">{room.teens}</span>
                                      <Button 
                                        variant="outline" 
                                        size="icon" 
                                        className="h-7 w-7"
                                        onClick={() => updateRoom(room.id, { teens: room.teens + 1 })}
                                        disabled={room.adults + room.teens + room.children + room.infants >= validation.maxGuests}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Children */}
                                {validation.roomType?.allow_children !== false && (
                                  <div>
                                    <Label className="text-xs">Children</Label>
                                    <div className="flex items-center gap-1 mt-1">
                                      <Button 
                                        variant="outline" 
                                        size="icon" 
                                        className="h-7 w-7"
                                        onClick={() => updateRoom(room.id, { children: Math.max(0, room.children - 1) })}
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <span className="w-6 text-center text-sm font-medium">{room.children}</span>
                                      <Button 
                                        variant="outline" 
                                        size="icon" 
                                        className="h-7 w-7"
                                        onClick={() => updateRoom(room.id, { children: room.children + 1 })}
                                        disabled={room.adults + room.teens + room.children + room.infants >= validation.maxGuests}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                )}
                                
                                {/* Infants */}
                                {validation.roomType?.allow_infants !== false && (
                                  <div>
                                    <Label className="text-xs">Infants</Label>
                                    <div className="flex items-center gap-1 mt-1">
                                      <Button 
                                        variant="outline" 
                                        size="icon" 
                                        className="h-7 w-7"
                                        onClick={() => updateRoom(room.id, { infants: Math.max(0, room.infants - 1) })}
                                      >
                                        <Minus className="h-3 w-3" />
                                      </Button>
                                      <span className="w-6 text-center text-sm font-medium">{room.infants}</span>
                                      <Button 
                                        variant="outline" 
                                        size="icon" 
                                        className="h-7 w-7"
                                        onClick={() => updateRoom(room.id, { infants: room.infants + 1 })}
                                        disabled={room.adults + room.teens + room.children + room.infants >= validation.maxGuests}
                                      >
                                        <Plus className="h-3 w-3" />
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            )}
                          </Card>
                        );
                      })}
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
                        <Input 
                          value={guestName} 
                          onChange={(e) => setGuestName(e.target.value)} 
                          className={cn(!guestName.trim() && "border-destructive")}
                          placeholder="Guest full name"
                        />
                        {!guestName.trim() && (
                          <p className="text-xs text-destructive mt-1">Name is required</p>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Email *</Label>
                          <Input 
                            type="email" 
                            value={guestEmail} 
                            onChange={(e) => setGuestEmail(e.target.value)} 
                            className={cn(!guestEmail.trim() && "border-destructive")}
                            placeholder="email@example.com"
                          />
                          {!guestEmail.trim() && (
                            <p className="text-xs text-destructive mt-1">Email is required</p>
                          )}
                        </div>
                        <div>
                          <Label>Phone *</Label>
                          <Input 
                            value={guestPhone} 
                            onChange={(e) => setGuestPhone(e.target.value)} 
                            className={cn(!guestPhone.trim() && "border-destructive")}
                            placeholder="+27..."
                          />
                          {!guestPhone.trim() && (
                            <p className="text-xs text-destructive mt-1">Phone is required</p>
                          )}
                        </div>
                      </div>
                      <div>
                        <Label>Voucher Code (optional)</Label>
                        <Input value={voucher} onChange={(e) => setVoucher(e.target.value)} placeholder="Enter voucher code" />
                      </div>
                      <div>
                        <Label>Notes (optional)</Label>
                        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Special requests or notes..." />
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
                        disabled={calculating || !selectedPropertyId || hasValidationErrors}
                        className="w-full mb-4"
                        variant="outline"
                      >
                        {calculating ? (
                          <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        ) : (
                          <Calculator className="h-4 w-4 mr-2" />
                        )}
                        Calculate Cost ({bookingRooms.length} room{bookingRooms.length > 1 ? 's' : ''})
                      </Button>

                      {roomCostBreakdowns.length > 0 ? (
                        <div className="space-y-3">
                          {/* Per-room expandable breakdowns */}
                          {roomCostBreakdowns.map((roomBreakdown) => (
                            <Collapsible
                              key={roomBreakdown.roomId}
                              open={expandedRoomCosts[roomBreakdown.roomId] || false}
                              onOpenChange={(open) => setExpandedRoomCosts(prev => ({
                                ...prev,
                                [roomBreakdown.roomId]: open
                              }))}
                            >
                              <CollapsibleTrigger asChild>
                                <Button
                                  variant="ghost"
                                  className="w-full justify-between p-3 h-auto hover:bg-muted/50"
                                >
                                  <div className="flex items-center gap-2">
                                    <Plus className={cn(
                                      "h-4 w-4 transition-transform",
                                      expandedRoomCosts[roomBreakdown.roomId] && "rotate-45"
                                    )} />
                                    <div className="text-left">
                                      <div className="font-medium">
                                        Room {roomBreakdown.roomIndex}: {roomBreakdown.roomName}
                                      </div>
                                      <div className="text-xs text-muted-foreground">
                                        {format(roomBreakdown.dates.checkIn, "MMM d")} – {format(roomBreakdown.dates.checkOut, "MMM d")} ({roomBreakdown.dates.nights} nights) • {roomBreakdown.rateName}
                                      </div>
                                    </div>
                                  </div>
                                  <div className="font-bold text-right">
                                    R{roomBreakdown.roomTotal.toFixed(2)}
                                  </div>
                                </Button>
                              </CollapsibleTrigger>
                              <CollapsibleContent>
                                <div className="px-3 pb-3">
                                  <Table>
                                    <TableHeader>
                                      <TableRow>
                                        <TableHead className="text-xs">Description</TableHead>
                                        <TableHead className="text-right text-xs">Nights</TableHead>
                                        <TableHead className="text-right text-xs">Qty</TableHead>
                                        <TableHead className="text-right text-xs">Unit</TableHead>
                                        <TableHead className="text-right text-xs">Total</TableHead>
                                      </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                      {roomBreakdown.lineItems.map((item, idx) => (
                                        <TableRow key={idx}>
                                          <TableCell className="text-sm">{item.description}</TableCell>
                                          <TableCell className="text-right text-sm">{item.nights}</TableCell>
                                          <TableCell className="text-right text-sm">{item.quantity}</TableCell>
                                          <TableCell className="text-right text-sm">R{item.unitPrice.toFixed(2)}</TableCell>
                                          <TableCell className="text-right text-sm font-medium">R{item.total.toFixed(2)}</TableCell>
                                        </TableRow>
                                      ))}
                                    </TableBody>
                                  </Table>
                                </div>
                              </CollapsibleContent>
                            </Collapsible>
                          ))}
                          
                          {/* Grand Total */}
                          <div className="border-t-2 pt-3 flex items-center justify-between px-3">
                            <span className="font-bold text-lg">Grand Total</span>
                            <span className="font-bold text-lg">R{totalCost.toFixed(2)}</span>
                          </div>
                        </div>
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
                      {hasValidationErrors && (
                        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-md">
                          <p className="text-sm text-destructive flex items-center gap-2">
                            <AlertCircle className="h-4 w-4" />
                            Please fix room validation errors before submitting
                          </p>
                        </div>
                      )}
                      <Button 
                        onClick={submitBooking} 
                        disabled={submitting || !selectedPropertyId || hasValidationErrors || !guestName.trim() || !guestEmail.trim() || !guestPhone.trim()}
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
