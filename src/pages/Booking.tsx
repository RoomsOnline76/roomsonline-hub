import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Navbar } from "@/components/Navbar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Users, ArrowLeft, Minus, Plus, Loader2, CheckCircle, AlertCircle } from "lucide-react";
import { format, parseISO, differenceInDays } from "date-fns";
import { getPropertyUrl } from "@/lib/config";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";

// Booking form validation schema
const bookingSchema = z.object({
  guest_name: z.string().min(2, "Name must be at least 2 characters"),
  guest_email: z.string().email("Invalid email address"),
  guest_phone: z.string().min(10, "Phone must be at least 10 digits").regex(/^\+?[0-9\s-]+$/, "Invalid phone format"),
  special_requests: z.string().optional(),
});

interface RoomBooking {
  roomTypeId: string;
  roomTypeName: string;
  numberOfAdults: number;
  numberOfTeens: number;
  numberOfChildren: number;
  numberOfInfants: number;
}

interface RoomType {
  id: string;
  name: string;
  maxGuests?: number;
  allowTeens?: boolean;
  allowChildren?: boolean;
  allowInfants?: boolean;
}

interface RateType {
  id: string;
  name: string;
  priceType?: string;
}

interface CostLineItem {
  description: string;
  nights: number;
  quantity: number;
  unitPrice: number;
  total: number;
}

const Booking = () => {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const urlCheckIn = searchParams.get("checkIn");
  const urlCheckOut = searchParams.get("checkOut");
  const initialGuests = parseInt(searchParams.get("guests") || "2");
  
  // Pre-selected values from URL (from staging booking flow)
  const preSelectedRoomTypeId = searchParams.get("roomTypeId");
  const preSelectedRoomTypeName = searchParams.get("roomTypeName");
  const preSelectedRateTypeId = searchParams.get("rateTypeId");
  const preSelectedRateTypeName = searchParams.get("rateTypeName");
  const preSelectedAdults = parseInt(searchParams.get("adults") || "0");
  const preSelectedTeens = parseInt(searchParams.get("teens") || "0");
  const preSelectedChildren = parseInt(searchParams.get("children") || "0");
  const preSelectedInfants = parseInt(searchParams.get("infants") || "0");
  const preSelectedTotalCost = searchParams.get("totalCost") ? parseFloat(searchParams.get("totalCost")!) : null;

  // Form state
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [voucher, setVoucher] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [selectedRateType, setSelectedRateType] = useState<string>("");
  const [rooms, setRooms] = useState<RoomBooking[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [bookingSuccess, setBookingSuccess] = useState(false);
  const [bookingId, setBookingId] = useState<string | null>(null);
  
  // Date state - can be restored from sessionStorage
  const [checkIn, setCheckIn] = useState<string | null>(urlCheckIn);
  const [checkOut, setCheckOut] = useState<string | null>(urlCheckOut);
  
  // Cost calculation state
  const [availabilityData, setAvailabilityData] = useState<any>(null);
  const [costBreakdown, setCostBreakdown] = useState<CostLineItem[]>([]);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [calculatingCost, setCalculatingCost] = useState(false);

  // Fetch property by ID or slug
  const { data: property, isLoading } = useQuery({
    queryKey: ["property-booking", id],
    queryFn: async () => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "");
      
      let query = supabase
        .from("properties")
        .select("*")
        .eq("is_active", true);
      
      if (isUuid) {
        query = query.eq("id", id);
      } else {
        query = query.eq("slug", id);
      }
      
      const { data, error } = await query.single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!id,
  });

  // Fetch cached room types from database (fallback if not in amenities)
  const { data: cachedRoomTypes } = useQuery({
    queryKey: ["cached-room-types", property?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pms_room_types_cache")
        .select("*")
        .eq("property_id", property!.id)
        .order("name");
      
      if (error) {
        console.error("Error fetching cached room types:", error);
        return [];
      }
      return data || [];
    },
    enabled: !!property?.id,
  });

  // Fetch cached rate types from database (fallback if not in amenities)
  const { data: cachedRateTypes } = useQuery({
    queryKey: ["cached-rate-types", property?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pms_rate_types_cache")
        .select("*")
        .eq("property_id", property!.id)
        .order("name");
      
      if (error) {
        console.error("Error fetching cached rate types:", error);
        return [];
      }
      return data || [];
    },
    enabled: !!property?.id,
  });

  // Extract room types and rate types - prefer amenities, fallback to cached tables
  const amenities = property?.amenities as Record<string, any> | null;
  
  // Map cached data to expected format
  const roomTypes: RoomType[] = (amenities?.rooms?.length > 0 
    ? amenities.rooms 
    : cachedRoomTypes?.map(rt => ({
        id: rt.external_room_type_id,
        name: rt.name,
        maxGuests: rt.max_guests,
        allowTeens: rt.allow_teens,
        allowChildren: rt.allow_children,
        allowInfants: rt.allow_infants,
      }))
  ) || [];
  
  const rateTypes: RateType[] = (amenities?.pms_rate_types?.length > 0 
    ? amenities.pms_rate_types 
    : cachedRateTypes?.map(rt => ({
        id: rt.external_rate_type_id,
        name: rt.name,
      }))
  ) || [];

  // Initialize rooms with pre-selected or restore from session storage
  useEffect(() => {
    if (property && rooms.length === 0) {
      // Check for existing booking state in session storage (multi-room flow)
      const savedState = sessionStorage.getItem(`booking_state_${property.id}`);
      
      if (savedState) {
        const parsedState = JSON.parse(savedState);
        const existingRooms = parsedState.rooms || [];
        
        if (preSelectedRoomTypeId) {
          // We're adding a new room to existing booking
          const newRoom = {
            roomTypeId: preSelectedRoomTypeId,
            roomTypeName: preSelectedRoomTypeName || '',
            numberOfAdults: Math.max(1, preSelectedAdults),
            numberOfTeens: preSelectedTeens,
            numberOfChildren: preSelectedChildren,
            numberOfInfants: preSelectedInfants,
          };
          
          setRooms([...existingRooms, newRoom]);
        } else {
          // Returning to booking without adding a new room (e.g., "Check Out Now")
          setRooms(existingRooms);
        }
        
        // Restore form state
        if (parsedState.guestName) setGuestName(parsedState.guestName);
        if (parsedState.guestEmail) setGuestEmail(parsedState.guestEmail);
        if (parsedState.guestPhone) setGuestPhone(parsedState.guestPhone);
        if (parsedState.voucher) setVoucher(parsedState.voucher);
        if (parsedState.specialRequests) setSpecialRequests(parsedState.specialRequests);
        if (parsedState.selectedRateType) setSelectedRateType(parsedState.selectedRateType);
        
        // Restore dates if not provided in URL
        if (!urlCheckIn && parsedState.defaultCheckIn) setCheckIn(parsedState.defaultCheckIn);
        if (!urlCheckOut && parsedState.defaultCheckOut) setCheckOut(parsedState.defaultCheckOut);
        
        // Restore availability and cost data to avoid API calls
        if (parsedState.availabilityData) setAvailabilityData(parsedState.availabilityData);
        if (parsedState.costBreakdown) setCostBreakdown(parsedState.costBreakdown);
        if (parsedState.totalCost) setTotalCost(parsedState.totalCost);
        
        // Clear the session storage after restoring
        sessionStorage.removeItem(`booking_state_${property.id}`);
      } else if (preSelectedRoomTypeId && preSelectedRoomTypeName) {
        // New booking with pre-selected room from URL
        const hasPreSelectedGuests = searchParams.has("adults");
        setRooms([{
          roomTypeId: preSelectedRoomTypeId,
          roomTypeName: preSelectedRoomTypeName,
          numberOfAdults: hasPreSelectedGuests ? Math.max(1, preSelectedAdults) : 2,
          numberOfTeens: preSelectedTeens,
          numberOfChildren: preSelectedChildren,
          numberOfInfants: preSelectedInfants,
        }]);
      } else if (roomTypes.length > 0) {
        const firstRoom = roomTypes[0];
        setRooms([{
          roomTypeId: String(firstRoom.id),
          roomTypeName: firstRoom.name,
          numberOfAdults: Math.min(initialGuests, firstRoom.maxGuests || 2),
          numberOfTeens: 0,
          numberOfChildren: 0,
          numberOfInfants: 0,
        }]);
      }
    }
    // Use pre-selected rate type if available
    if (preSelectedRateTypeId && !selectedRateType) {
      setSelectedRateType(preSelectedRateTypeId);
    } else if (rateTypes.length > 0 && !selectedRateType) {
      setSelectedRateType(String(rateTypes[0].id));
    }
  }, [property, roomTypes, rateTypes, initialGuests, preSelectedRoomTypeId, preSelectedRateTypeId, searchParams]);

  // Calculate totals
  const totalGuests = rooms.reduce((sum, room) => 
    sum + room.numberOfAdults + room.numberOfTeens + room.numberOfChildren + room.numberOfInfants, 0
  );
  const nights = checkIn && checkOut ? differenceInDays(parseISO(checkOut), parseISO(checkIn)) : 0;

  // Calculate cost based on availability data
  const calculateCost = async () => {
    if (!property?.id || !checkIn || !checkOut || rooms.length === 0 || !selectedRateType) {
      return;
    }

    // Only calculate for Benson properties
    const isBensonProperty = property.external_system?.toLowerCase() === 'benson';
    if (!isBensonProperty) {
      return;
    }

    setCalculatingCost(true);
    try {
      // Fetch availability if not already fetched
      let availability = availabilityData;
      if (!availability) {
        const { data, error } = await supabase.functions.invoke("benson-api", {
          body: {
            action: "fetch_availability",
            property_id: property.id,
            start_date: checkIn,
            end_date: checkOut,
          },
        });

        if (error) throw error;
        availability = data;
        setAvailabilityData(data);
      }

      const lineItems: CostLineItem[] = [];
      let runningTotal = 0;

      // Calculate cost for each room
      for (const room of rooms) {
        const roomType = availability?.roomTypes?.find(
          (rt: any) => String(rt.roomTypeId) === room.roomTypeId
        );

        if (!roomType) continue;

        const rateType = roomType.rateTypes?.find(
          (rt: any) => String(rt.rateTypeId) === selectedRateType
        );

        if (!rateType) continue;

        const allRates = rateType.rates || [];
        const rates = allRates.slice(0, nights);
        const priceType = (rateType.priceType || 'PER ROOM').toUpperCase();
        const roomTotalGuests = room.numberOfAdults + room.numberOfTeens + room.numberOfChildren + room.numberOfInfants;

        if (priceType === 'PER ROOM' || priceType === 'PERROOM') {
          let totalRoomAmount = 0;
          rates.forEach((rate: any) => {
            totalRoomAmount += rate.roomAmount || 0;
          });

          if (totalRoomAmount > 0) {
            lineItems.push({
              description: `${room.roomTypeName} (${roomTotalGuests} guests)`,
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
            if (room.numberOfAdults === 1) {
              totalAdultAmount += rate.adultAmount1 || rate.adultAmount || 0;
            } else if (room.numberOfAdults === 2) {
              totalAdultAmount += rate.adultAmount2 || rate.adultAmount || 0;
            } else if (room.numberOfAdults > 2) {
              const baseRate = rate.adultAmount2 || rate.adultAmount || 0;
              const additionalAdultRate = rate.adultAmount1 || rate.adultAmount || 0;
              totalAdultAmount += baseRate + (additionalAdultRate * (room.numberOfAdults - 2));
            }

            if (room.numberOfTeens > 0) {
              totalTeenAmount += (rate.teenAmount || 0) * room.numberOfTeens;
            }
            if (room.numberOfChildren > 0) {
              totalChildAmount += (rate.childAmount || 0) * room.numberOfChildren;
            }
            if (room.numberOfInfants > 0) {
              totalInfantAmount += (rate.infantAmount || 0) * room.numberOfInfants;
            }
          });

          if (totalAdultAmount > 0) {
            lineItems.push({
              description: `Adult Rate (${room.numberOfAdults} adult${room.numberOfAdults > 1 ? 's' : ''})`,
              nights: nights,
              quantity: 1,
              unitPrice: totalAdultAmount / nights,
              total: totalAdultAmount,
            });
            runningTotal += totalAdultAmount;
          }

          if (totalTeenAmount > 0) {
            lineItems.push({
              description: `Teen Rate (${room.numberOfTeens} teen${room.numberOfTeens > 1 ? 's' : ''})`,
              nights: nights,
              quantity: room.numberOfTeens,
              unitPrice: totalTeenAmount / nights / room.numberOfTeens,
              total: totalTeenAmount,
            });
            runningTotal += totalTeenAmount;
          }

          if (totalChildAmount > 0) {
            lineItems.push({
              description: `Child Rate (${room.numberOfChildren} child${room.numberOfChildren > 1 ? 'ren' : ''})`,
              nights: nights,
              quantity: room.numberOfChildren,
              unitPrice: totalChildAmount / nights / room.numberOfChildren,
              total: totalChildAmount,
            });
            runningTotal += totalChildAmount;
          }

          if (totalInfantAmount > 0) {
            lineItems.push({
              description: `Infant Rate (${room.numberOfInfants} infant${room.numberOfInfants > 1 ? 's' : ''})`,
              nights: nights,
              quantity: room.numberOfInfants,
              unitPrice: totalInfantAmount / nights / room.numberOfInfants,
              total: totalInfantAmount,
            });
            runningTotal += totalInfantAmount;
          }
        }
      }

      setCostBreakdown(lineItems);
      setTotalCost(runningTotal);
    } catch (error: any) {
      console.error("Cost calculation error:", error);
    }
    setCalculatingCost(false);
  };

  // Recalculate cost when relevant data changes
  useEffect(() => {
    if (property && rooms.length > 0 && selectedRateType && checkIn && checkOut) {
      calculateCost();
    }
  }, [property?.id, rooms, selectedRateType, checkIn, checkOut]);

  // Form validation for required fields
  const isFormValid = guestName.trim().length >= 2 && 
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail) && 
    guestPhone.trim().length >= 10;

  // Add room - navigate back to property page to select another room
  const addRoom = () => {
    // Save current rooms and form state to sessionStorage including availability data
    const bookingState = {
      rooms,
      selectedRateType,
      guestName,
      guestEmail,
      guestPhone,
      voucher,
      specialRequests,
      defaultCheckIn: checkIn,
      defaultCheckOut: checkOut,
      availabilityData,
      costBreakdown,
      totalCost,
    };
    sessionStorage.setItem(`booking_state_${property?.id}`, JSON.stringify(bookingState));
    
    // Navigate to property page with addRoom flag, default dates, and rate type
    const params = new URLSearchParams({
      addRoom: 'true',
      checkIn: checkIn || '',
      checkOut: checkOut || '',
    });
    if (selectedRateType) {
      params.set('rateTypeId', selectedRateType);
    }
    navigate(`/property/${id}?${params.toString()}`);
  };

  // Remove room
  const removeRoom = (index: number) => {
    if (rooms.length > 1) {
      setRooms(rooms.filter((_, i) => i !== index));
    }
  };

  // Update room
  const updateRoom = (index: number, field: keyof RoomBooking, value: string | number) => {
    const newRooms = [...rooms];
    if (field === 'roomTypeId') {
      const roomType = roomTypes.find(rt => String(rt.id) === value);
      newRooms[index] = {
        ...newRooms[index],
        roomTypeId: String(value),
        roomTypeName: roomType?.name || '',
      };
    } else {
      newRooms[index] = { ...newRooms[index], [field]: value };
    }
    setRooms(newRooms);
  };

  // Increment/decrement guest count
  const adjustGuestCount = (roomIndex: number, field: 'numberOfAdults' | 'numberOfTeens' | 'numberOfChildren' | 'numberOfInfants', delta: number) => {
    const newRooms = [...rooms];
    const currentValue = newRooms[roomIndex][field];
    const newValue = Math.max(field === 'numberOfAdults' ? 1 : 0, currentValue + delta);
    newRooms[roomIndex][field] = newValue;
    setRooms(newRooms);
  };

  // Create booking mutation
  const createBookingMutation = useMutation({
    mutationFn: async () => {
      // Validate form
      const validation = bookingSchema.safeParse({
        guest_name: guestName,
        guest_email: guestEmail,
        guest_phone: guestPhone,
        special_requests: specialRequests,
      });

      if (!validation.success) {
        const errors: Record<string, string> = {};
        validation.error.errors.forEach(err => {
          errors[err.path[0]] = err.message;
        });
        setFormErrors(errors);
        throw new Error("Please fix the form errors");
      }

      setFormErrors({});

      if (!checkIn || !checkOut) {
        throw new Error("Check-in and check-out dates are required");
      }

      if (!selectedRateType) {
        throw new Error("Please select a rate type");
      }

      if (rooms.length === 0) {
        throw new Error("At least one room is required");
      }

      // Use calculated total cost or pre-selected total
      const totalPrice = totalCost || preSelectedTotalCost || 0;

      // Get current user or create anonymous booking
      const { data: { user } } = await supabase.auth.getUser();

      const bookingData = {
        property_id: property!.id,
        user_id: user?.id || null, // Null for anonymous/guest bookings
        check_in_date: checkIn,
        check_out_date: checkOut,
        guest_name: guestName,
        guest_email: guestEmail,
        guest_phone: guestPhone,
        special_requests: specialRequests || null,
        adults: rooms.reduce((sum, r) => sum + r.numberOfAdults, 0),
        children: rooms.reduce((sum, r) => sum + r.numberOfChildren, 0),
        infants: rooms.reduce((sum, r) => sum + r.numberOfInfants, 0),
        total_price: totalPrice,
        status: 'pending',
      } as any;

      // Add new columns (not yet in generated types)
      bookingData.teens = rooms.reduce((sum: number, r: RoomBooking) => sum + r.numberOfTeens, 0);
      bookingData.room_type_id = rooms[0]?.roomTypeId || null;
      bookingData.rate_type_id = selectedRateType;
      bookingData.rooms = rooms;
      bookingData.voucher = voucher || null;

      const { data, error } = await supabase
        .from('bookings')
        .insert(bookingData)
        .select()
        .single();

      if (error) throw error;

      // Push to external system if configured (which also sends email)
      if (property?.external_system) {
        try {
          await supabase.functions.invoke('push-booking', {
            body: { booking_id: data.id },
          });
        } catch (pushError) {
          console.error('Failed to push booking to external system:', pushError);
          // Don't fail the booking, just log the error
        }
      } else {
        // For non-PMS properties, send confirmation email directly
        try {
          await supabase.functions.invoke('send-booking-email', {
            body: { 
              booking_id: data.id,
              status: 'success'
            },
          });
        } catch (emailError) {
          console.error('Failed to send booking confirmation email:', emailError);
          // Don't fail the booking, just log the error
        }
      }

      return data;
    },
    onSuccess: (data) => {
      setBookingId(data.id);
      setBookingSuccess(true);
      toast.success("Booking request submitted successfully!");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create booking");
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!property) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-16 text-center">
          <h1 className="text-2xl font-bold mb-4">Property Not Found</h1>
          <p className="text-muted-foreground mb-8">
            The property you're looking for doesn't exist or is no longer available.
          </p>
          <Button asChild>
            <Link to="/">Return to Home</Link>
          </Button>
        </div>
      </div>
    );
  }

  // Success state
  if (bookingSuccess) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar />
        <div className="container mx-auto px-4 py-16">
          <Card className="max-w-lg mx-auto text-center">
            <CardContent className="pt-8 pb-8">
              <CheckCircle className="h-16 w-16 text-green-500 mx-auto mb-4" />
              <h2 className="text-2xl font-bold mb-2">Booking Request Submitted!</h2>
              <p className="text-muted-foreground mb-6">
                Your booking request for {property.name} has been submitted. 
                You will receive a confirmation email at {guestEmail} shortly.
              </p>
              <div className="space-y-2 text-sm text-left bg-muted/50 rounded-lg p-4 mb-6">
                <p><strong>Booking Reference:</strong> {bookingId?.slice(0, 8).toUpperCase()}</p>
                <p><strong>Check-in:</strong> {checkIn && format(parseISO(checkIn), "MMM d, yyyy")}</p>
                <p><strong>Check-out:</strong> {checkOut && format(parseISO(checkOut), "MMM d, yyyy")}</p>
                <p><strong>Guests:</strong> {totalGuests}</p>
              </div>
              <Button onClick={() => navigate("/")}>Return to Home</Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      
      <div className="container mx-auto px-4 py-8">
        {/* Back Link */}
        <a 
          href={`${getPropertyUrl(property.slug || property.id)}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to property
        </a>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Booking Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Guest Details */}
            <Card>
              <CardHeader>
                <CardTitle>Guest Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="guest_name">Full Name *</Label>
                    <Input
                      id="guest_name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="John Smith"
                      className={formErrors.guest_name ? "border-destructive" : ""}
                    />
                    {formErrors.guest_name && (
                      <p className="text-sm text-destructive">{formErrors.guest_name}</p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="guest_email">Email Address *</Label>
                    <Input
                      id="guest_email"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="john@example.com"
                      className={formErrors.guest_email ? "border-destructive" : ""}
                    />
                    {formErrors.guest_email && (
                      <p className="text-sm text-destructive">{formErrors.guest_email}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="guest_phone">Phone Number *</Label>
                  <Input
                    id="guest_phone"
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="+27 12 345 6789"
                    className={formErrors.guest_phone ? "border-destructive" : ""}
                  />
                  {formErrors.guest_phone && (
                    <p className="text-sm text-destructive">{formErrors.guest_phone}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Include country code (e.g., +27 for South Africa)
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Rate Type Selection */}
            {rateTypes.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Rate Type</CardTitle>
                </CardHeader>
                <CardContent>
                  <Select value={selectedRateType} onValueChange={setSelectedRateType}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select rate type" />
                    </SelectTrigger>
                    <SelectContent>
                      {rateTypes.map((rt) => (
                        <SelectItem key={rt.id} value={String(rt.id)}>
                          {rt.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </CardContent>
              </Card>
            )}

            {/* Room Selection */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <div>
                  <CardTitle>Rooms & Guests</CardTitle>
                  <div className="text-sm text-muted-foreground mt-1 space-y-0.5">
                    {rooms.map((room, index) => {
                      const roomType = roomTypes.find(rt => String(rt.id) === room.roomTypeId);
                      const roomGuestCount = room.numberOfAdults + room.numberOfTeens + room.numberOfChildren + room.numberOfInfants;
                      return (
                        <p key={index}>
                          {roomType?.name || room.roomTypeName || 'Select room type'} - {roomGuestCount} Guest{roomGuestCount !== 1 ? 's' : ''}
                        </p>
                      );
                    })}
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={addRoom}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Room
                </Button>
              </CardHeader>
              <CardContent className="space-y-6">
                {rooms.map((room, index) => {
                  const roomType = roomTypes.find(rt => String(rt.id) === room.roomTypeId);
                  
                  return (
                    <div key={index} className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">
                          {roomType?.name || room.roomTypeName || `Room ${index + 1}`}
                          {checkIn && checkOut && (
                            <span className="text-muted-foreground font-normal ml-2">
                              ({format(parseISO(checkIn), "d MMM")} - {format(parseISO(checkOut), "d MMM yyyy")})
                            </span>
                          )}
                        </h4>
                        {rooms.length > 1 && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => removeRoom(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            Remove
                          </Button>
                        )}
                      </div>

                      {/* Room Type Selection */}
                      {roomTypes.length > 0 && (
                        <div className="space-y-2">
                          <Label>Room Type</Label>
                          <Select 
                            value={room.roomTypeId} 
                            onValueChange={(value) => updateRoom(index, 'roomTypeId', value)}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Select room type" />
                            </SelectTrigger>
                            <SelectContent>
                              {roomTypes.map((rt) => (
                                <SelectItem key={rt.id} value={String(rt.id)}>
                                  {rt.name} {rt.maxGuests ? `(Max ${rt.maxGuests} guests)` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* Guest Counts - All required by Benson API */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                        {/* Adults (required, min 1) */}
                        <div className="space-y-2">
                          <Label className="text-sm">Adults *</Label>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => adjustGuestCount(index, 'numberOfAdults', -1)}
                              disabled={room.numberOfAdults <= 1}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{room.numberOfAdults}</span>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => adjustGuestCount(index, 'numberOfAdults', 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Teens (required) */}
                        <div className="space-y-2">
                          <Label className="text-sm">Teens *</Label>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => adjustGuestCount(index, 'numberOfTeens', -1)}
                              disabled={room.numberOfTeens <= 0}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{room.numberOfTeens}</span>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => adjustGuestCount(index, 'numberOfTeens', 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Children (required) */}
                        <div className="space-y-2">
                          <Label className="text-sm">Children *</Label>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => adjustGuestCount(index, 'numberOfChildren', -1)}
                              disabled={room.numberOfChildren <= 0}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{room.numberOfChildren}</span>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => adjustGuestCount(index, 'numberOfChildren', 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>

                        {/* Infants (required) */}
                        <div className="space-y-2">
                          <Label className="text-sm">Infants *</Label>
                          <div className="flex items-center gap-2">
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => adjustGuestCount(index, 'numberOfInfants', -1)}
                              disabled={room.numberOfInfants <= 0}
                            >
                              <Minus className="h-4 w-4" />
                            </Button>
                            <span className="w-8 text-center font-medium">{room.numberOfInfants}</span>
                            <Button 
                              variant="outline" 
                              size="icon" 
                              className="h-8 w-8"
                              onClick={() => adjustGuestCount(index, 'numberOfInfants', 1)}
                            >
                              <Plus className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            {/* Voucher & Special Requests (Optional) */}
            <Card>
              <CardHeader>
                <CardTitle>Additional Information</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="voucher">Voucher Code (Optional)</Label>
                  <Input
                    id="voucher"
                    value={voucher}
                    onChange={(e) => setVoucher(e.target.value)}
                    placeholder="Enter voucher or promo code if applicable"
                    maxLength={100}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="special_requests">Special Requests (Optional)</Label>
                  <Textarea
                    id="special_requests"
                    value={specialRequests}
                    onChange={(e) => setSpecialRequests(e.target.value)}
                    placeholder="Any special requests or dietary requirements..."
                    rows={4}
                  />
                  <p className="text-xs text-muted-foreground">
                    Special requests are subject to availability and may incur additional charges.
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Submit Button (Mobile) */}
            <div className="lg:hidden">
              <Button 
                className="w-full" 
                size="lg"
                onClick={() => createBookingMutation.mutate()}
                disabled={createBookingMutation.isPending || !isFormValid}
              >
                {createBookingMutation.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Confirm Booking'
                )}
              </Button>
              {!isFormValid && (
                <p className="text-xs text-muted-foreground mt-2 text-center">
                  Please fill in all required fields above
                </p>
              )}
            </div>
          </div>

          {/* Booking Summary */}
          <div>
            <Card className="sticky top-4">
              <CardHeader>
                <CardTitle className="text-lg">Booking Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <h4 className="font-medium">{property.name}</h4>
                  <p className="text-sm text-muted-foreground">{property.city}, {property.country}</p>
                </div>

                {checkIn && checkOut && (
                  <div className="flex items-center gap-2 text-sm">
                    <Calendar className="h-4 w-4 text-muted-foreground" />
                    <span>
                      {format(parseISO(checkIn), "MMM d, yyyy")} - {format(parseISO(checkOut), "MMM d, yyyy")}
                    </span>
                  </div>
                )}

                {nights > 0 && (
                  <p className="text-sm text-muted-foreground">{nights} night{nights !== 1 ? 's' : ''}</p>
                )}

                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{totalGuests} guest{totalGuests !== 1 ? 's' : ''}</span>
                </div>

                {rooms.length > 0 && (
                  <div className="space-y-1 text-sm">
                    <p className="font-medium">{rooms.length} Room{rooms.length !== 1 ? 's' : ''}</p>
                    {rooms.map((room, i) => (
                      <p key={i} className="text-muted-foreground text-xs">
                        Room {i + 1}: {room.roomTypeName || 'Standard'} 
                        ({room.numberOfAdults}A
                        {room.numberOfTeens > 0 && `, ${room.numberOfTeens}T`}
                        {room.numberOfChildren > 0 && `, ${room.numberOfChildren}C`}
                        {room.numberOfInfants > 0 && `, ${room.numberOfInfants}I`})
                      </p>
                    ))}
                  </div>
                )}

                {/* Rate Type */}
                {selectedRateType && rateTypes.length > 0 && (
                  <div className="text-sm">
                    <span className="text-muted-foreground">Rate:</span>{" "}
                    <span className="font-medium">
                      {rateTypes.find(rt => String(rt.id) === selectedRateType)?.name || preSelectedRateTypeName || 'Standard'}
                    </span>
                  </div>
                )}

                {/* Cost Breakdown */}
                <div className="border-t pt-4 space-y-4">
                  {calculatingCost ? (
                    <div className="flex items-center justify-center py-4">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <span className="ml-2 text-sm text-muted-foreground">Calculating...</span>
                    </div>
                  ) : costBreakdown.length > 0 ? (
                    <>
                      {/* Room Charges from API */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Room Charges</p>
                        {costBreakdown.map((item, idx) => (
                          <div key={idx} className="flex justify-between text-sm">
                            <div className="text-muted-foreground">
                              <p>{item.description}</p>
                              <p className="text-xs">{item.nights} nights × R{item.unitPrice.toFixed(2)}</p>
                            </div>
                            <span className="font-medium">R{item.total.toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                      
                      {/* Other Charges (not from API) */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Other Charges</p>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Service fee</span>
                          <span>R0.00</span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Tourism levy</span>
                          <span>Included</span>
                        </div>
                      </div>
                      
                      {/* Total */}
                      <div className="border-t pt-3 flex justify-between items-center">
                        <span className="font-semibold">Total</span>
                        <span className="text-xl font-bold">R {totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total</span>
                      <span className="text-xl font-bold">
                        {preSelectedTotalCost !== null 
                          ? `R ${preSelectedTotalCost.toLocaleString()}` 
                          : 'On request'}
                      </span>
                    </div>
                  )}
                  {costBreakdown.length === 0 && preSelectedTotalCost === null && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Final price will be confirmed by the property
                    </p>
                  )}
                </div>

                {/* Submit Button (Desktop) */}
                <div className="hidden lg:block pt-2">
                  <Button 
                    className="w-full" 
                    size="lg"
                    onClick={() => createBookingMutation.mutate()}
                    disabled={createBookingMutation.isPending || !isFormValid}
                  >
                    {createBookingMutation.isPending ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      'Confirm Booking'
                    )}
                  </Button>
                  {!isFormValid && (
                    <p className="text-xs text-muted-foreground mt-2 text-center">
                      Please fill in all required fields
                    </p>
                  )}
                </div>

                {createBookingMutation.isError && (
                  <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                    <AlertCircle className="h-4 w-4" />
                    <span>Please check the form for errors</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Booking;