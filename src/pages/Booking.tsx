import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Users, ArrowLeft, Minus, Plus, Loader2, CheckCircle, AlertCircle, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, differenceInDays } from "date-fns";
import { getPropertyUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { FormattedPrice } from "@/components/FormattedPrice";

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
  // Per-room date overrides (optional - uses default dates if not set)
  checkIn?: string;
  checkOut?: string;
}

interface RoomType {
  id: string;
  name: string;
  maxGuests?: number;
  maxPeople?: number; // Alternative field name from amenities
  allowTeens?: boolean;
  allowChildren?: boolean;
  allowInfants?: boolean;
  minGuests?: number;
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
  const [externalReservationId, setExternalReservationId] = useState<string | null>(null);
  
  // Date state - can be restored from sessionStorage
  const [checkIn, setCheckIn] = useState<string | null>(urlCheckIn);
  const [checkOut, setCheckOut] = useState<string | null>(urlCheckOut);
  
  // Cost calculation state
  const [availabilityData, setAvailabilityData] = useState<any>(null);
  const [costBreakdown, setCostBreakdown] = useState<CostLineItem[]>([]);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [calculatingCost, setCalculatingCost] = useState(false);

  // Fetch property by ID or slug using public view for anonymous access
  const { data: property, isLoading } = useQuery({
    queryKey: ["property-booking", id],
    queryFn: async () => {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "");
      
      let query = supabase
        .from("public_properties")
        .select("*");
      
      if (isUuid) {
        query = query.eq("id", id);
      } else {
        query = query.eq("slug", id);
      }
      
      const { data, error } = await query.maybeSingle();
      
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
  
  // Map cached data to expected format - normalize field names from either source
  // Check both amenities.rooms and amenities.room_types (different sources use different keys)
  const amenityRooms = amenities?.rooms || amenities?.room_types || [];
  
  const roomTypes: RoomType[] = (amenityRooms.length > 0 
    ? amenityRooms.map((r: any) => ({
        id: String(r.pmsRoomId || r.id), // Prefer pmsRoomId for matching
        name: r.name,
        maxGuests: r.maxGuests || r.maxPeople || r.max_guests,
        maxPeople: r.maxPeople || r.maxGuests || r.max_guests,
        allowTeens: r.allowTeens ?? r.allow_teens ?? true,
        allowChildren: r.allowChildren ?? r.allow_children ?? true,
        allowInfants: r.allowInfants ?? r.allow_infants ?? true,
        minGuests: r.minGuests || r.min_guests,
      }))
    : cachedRoomTypes?.map(rt => ({
        id: rt.external_room_type_id,
        name: rt.name,
        maxGuests: rt.max_guests,
        maxPeople: rt.max_guests,
        allowTeens: rt.allow_teens ?? true,
        allowChildren: rt.allow_children ?? true,
        allowInfants: rt.allow_infants ?? true,
        minGuests: rt.min_guests,
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
          // Use URL dates for this specific room (they may differ from default dates)
          const newRoom: RoomBooking = {
            roomTypeId: preSelectedRoomTypeId,
            roomTypeName: preSelectedRoomTypeName || '',
            numberOfAdults: Math.max(1, preSelectedAdults),
            numberOfTeens: preSelectedTeens,
            numberOfChildren: preSelectedChildren,
            numberOfInfants: preSelectedInfants,
            // Store this room's dates if they differ from the saved default dates
            checkIn: urlCheckIn || parsedState.defaultCheckIn,
            checkOut: urlCheckOut || parsedState.defaultCheckOut,
          };
          
          setRooms([...existingRooms, newRoom]);
          
          // Restore default dates from saved state (not URL params for new room)
          if (parsedState.defaultCheckIn) setCheckIn(parsedState.defaultCheckIn);
          if (parsedState.defaultCheckOut) setCheckOut(parsedState.defaultCheckOut);
        } else {
          // Returning to booking without adding a new room (e.g., "Check Out Now")
          setRooms(existingRooms);
          
          // Restore dates from saved state
          if (parsedState.defaultCheckIn) setCheckIn(parsedState.defaultCheckIn);
          if (parsedState.defaultCheckOut) setCheckOut(parsedState.defaultCheckOut);
        }
        
        // Restore form state
        if (parsedState.guestName) setGuestName(parsedState.guestName);
        if (parsedState.guestEmail) setGuestEmail(parsedState.guestEmail);
        if (parsedState.guestPhone) setGuestPhone(parsedState.guestPhone);
        if (parsedState.voucher) setVoucher(parsedState.voucher);
        if (parsedState.specialRequests) setSpecialRequests(parsedState.specialRequests);
        if (parsedState.selectedRateType) setSelectedRateType(parsedState.selectedRateType);
        
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
          // Store dates for first room
          checkIn: urlCheckIn || undefined,
          checkOut: urlCheckOut || undefined,
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
          checkIn: urlCheckIn || undefined,
          checkOut: urlCheckOut || undefined,
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
        // Unwrap adapter response - data may be in data.data or data directly
        availability = data?.data || data;
        setAvailabilityData(availability);
      }

      const lineItems: CostLineItem[] = [];
      let runningTotal = 0;

      // Get room types array - handle both snake_case (contract) and camelCase (legacy)
      const roomTypesArray = availability?.room_types || availability?.roomTypes || [];

      // Calculate cost for each room
      for (const room of rooms) {
        // Use room's custom dates or fall back to main booking dates
        const roomCheckIn = room.checkIn || checkIn;
        const roomCheckOut = room.checkOut || checkOut;
        const roomNights = roomCheckIn && roomCheckOut 
          ? Math.ceil((new Date(roomCheckOut).getTime() - new Date(roomCheckIn).getTime()) / (1000 * 60 * 60 * 24))
          : nights;

        // Find room type - handle both snake_case and camelCase field names
        const roomType = roomTypesArray.find(
          (rt: any) => String(rt.room_type_id || rt.roomTypeId) === room.roomTypeId
        );

        if (!roomType) continue;

        // Get rate types array - handle both formats
        const rateTypesArray = roomType.rate_types || roomType.rateTypes || [];
        
        // Find rate type - handle both formats
        const rateType = rateTypesArray.find(
          (rt: any) => String(rt.rate_type_id || rt.rateTypeId) === selectedRateType
        );

        if (!rateType) continue;

        const allRates = rateType.rates || [];
        
        // Filter rates to only include dates within the room's date range
        const rates = allRates.filter((rate: any) => {
          if (!rate.date) return false;
          const rateDate = rate.date;
          // Include rate if it's >= checkIn and < checkOut (nights, not including checkout date)
          return rateDate >= roomCheckIn && rateDate < roomCheckOut;
        });
        
        // Handle both snake_case and camelCase for priceType
        const priceType = (rateType.price_type || rateType.priceType || 'PER ROOM').toUpperCase();
        const roomTotalGuests = room.numberOfAdults + room.numberOfTeens + room.numberOfChildren + room.numberOfInfants;

        if (priceType === 'PER ROOM' || priceType === 'PERROOM') {
          let totalRoomAmount = 0;
          rates.forEach((rate: any) => {
            // Handle both snake_case and camelCase
            totalRoomAmount += rate.room_amount || rate.roomAmount || 0;
          });

          if (totalRoomAmount > 0) {
            lineItems.push({
              description: `${room.roomTypeName} (${roomTotalGuests} guests)`,
              nights: roomNights,
              quantity: 1,
              unitPrice: totalRoomAmount / roomNights,
              total: totalRoomAmount,
            });
            runningTotal += totalRoomAmount;
          }
        } else {
          // Per person pricing - sum rates for each date in range
          let totalAdultAmount = 0;
          let totalTeenAmount = 0;
          let totalChildAmount = 0;
          let totalInfantAmount = 0;

          rates.forEach((rate: any) => {
            // Handle both snake_case (contract) and camelCase (legacy)
            const adultAmount1 = rate.adult_amount_1 || rate.adultAmount1 || rate.adult_amount || rate.adultAmount || 0;
            const adultAmount2 = rate.adult_amount_2 || rate.adultAmount2 || rate.adult_amount || rate.adultAmount || 0;
            const teenAmount = rate.teen_amount || rate.teenAmount || 0;
            const childAmount = rate.child_amount || rate.childAmount || 0;
            const infantAmount = rate.infant_amount || rate.infantAmount || 0;

            if (room.numberOfAdults === 1) {
              totalAdultAmount += adultAmount1;
            } else if (room.numberOfAdults === 2) {
              totalAdultAmount += adultAmount2;
            } else if (room.numberOfAdults > 2) {
              totalAdultAmount += adultAmount2 + (adultAmount1 * (room.numberOfAdults - 2));
            }

            if (room.numberOfTeens > 0) {
              totalTeenAmount += teenAmount * room.numberOfTeens;
            }
            if (room.numberOfChildren > 0) {
              totalChildAmount += childAmount * room.numberOfChildren;
            }
            if (room.numberOfInfants > 0) {
              totalInfantAmount += infantAmount * room.numberOfInfants;
            }
          });

          if (totalAdultAmount > 0) {
            lineItems.push({
              description: `${room.roomTypeName} - Adult Rate (${room.numberOfAdults} adult${room.numberOfAdults > 1 ? 's' : ''})`,
              nights: roomNights,
              quantity: 1,
              unitPrice: totalAdultAmount / roomNights,
              total: totalAdultAmount,
            });
            runningTotal += totalAdultAmount;
          }

          if (totalTeenAmount > 0) {
            lineItems.push({
              description: `${room.roomTypeName} - Teen Rate (${room.numberOfTeens} teen${room.numberOfTeens > 1 ? 's' : ''})`,
              nights: roomNights,
              quantity: room.numberOfTeens,
              unitPrice: totalTeenAmount / roomNights / room.numberOfTeens,
              total: totalTeenAmount,
            });
            runningTotal += totalTeenAmount;
          }

          if (totalChildAmount > 0) {
            lineItems.push({
              description: `${room.roomTypeName} - Child Rate (${room.numberOfChildren} child${room.numberOfChildren > 1 ? 'ren' : ''})`,
              nights: roomNights,
              quantity: room.numberOfChildren,
              unitPrice: totalChildAmount / roomNights / room.numberOfChildren,
              total: totalChildAmount,
            });
            runningTotal += totalChildAmount;
          }

          if (totalInfantAmount > 0) {
            lineItems.push({
              description: `${room.roomTypeName} - Infant Rate (${room.numberOfInfants} infant${room.numberOfInfants > 1 ? 's' : ''})`,
              nights: roomNights,
              quantity: room.numberOfInfants,
              unitPrice: totalInfantAmount / roomNights / room.numberOfInfants,
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

  // Get list of missing required fields for tooltip
  const getMissingFields = (): string[] => {
    const missing: string[] = [];
    if (guestName.trim().length < 2) missing.push("Full name (min 2 characters)");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail)) missing.push("Valid email address");
    if (guestPhone.trim().length < 10) missing.push("Phone number (min 10 digits)");
    return missing;
  };

  const missingFields = getMissingFields();

  // Add room - navigate back to property page to select another room
  const addRoom = () => {
    // Ensure all existing rooms have their dates saved (use their custom dates or fall back to default)
    const roomsWithDates = rooms.map(room => ({
      ...room,
      checkIn: room.checkIn || checkIn || undefined,
      checkOut: room.checkOut || checkOut || undefined,
    }));
    
    // Save current rooms and form state to sessionStorage including availability data
    const bookingState = {
      rooms: roomsWithDates,
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

      // Get current user or sign in anonymously for guest bookings
      let { data: { user } } = await supabase.auth.getUser();
      
      // If no user, sign in anonymously to satisfy RLS
      if (!user) {
        const { data: anonData, error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) {
          console.error('Anonymous sign-in failed:', anonError);
          // Continue without user - will rely on RLS policy
        } else {
          user = anonData.user;
        }
      }

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

      let externalRefIds: string[] = [];

      // Push to external system if configured (which also sends email)
      if (property?.external_system) {
        try {
          const pushResponse = await supabase.functions.invoke('push-booking', {
            body: { booking_id: data.id },
          });
          // Extract all external reservation IDs from push response
          // For multi-room bookings with different dates, there may be multiple reservation IDs
          if (pushResponse.data?.external_reservation_ids && Array.isArray(pushResponse.data.external_reservation_ids)) {
            externalRefIds = pushResponse.data.external_reservation_ids.map((id: any) => String(id));
          } else {
            // Fallback: check individual results
            const successfulResults = pushResponse.data?.results?.filter((r: any) => r.success && r.external_booking_id) || [];
            externalRefIds = successfulResults.map((r: any) => String(r.external_booking_id));
          }
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

      // Return comma-separated IDs or null
      const combinedExternalId = externalRefIds.length > 0 ? externalRefIds.join(', ') : null;
      return { ...data, externalReservationId: combinedExternalId };
    },
    onSuccess: (data) => {
      setBookingId(data.id);
      setExternalReservationId(data.externalReservationId || null);
      setBookingSuccess(true);
      toast.success("Booking request submitted successfully!");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to create booking");
    },
  });

  if (isLoading) {
    return (
      <PublicLayout backLabel="Back" backTo="/">
        <div className="container mx-auto px-4 py-12">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      </PublicLayout>
    );
  }

  if (!property) {
    return (
      <PublicLayout>
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="font-display text-2xl sm:text-3xl mb-4">Property Not Found</h1>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            The property you're looking for doesn't exist or is no longer available.
          </p>
          <Button asChild>
            <Link to="/">Return to Home</Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  // Check if this is a Benson property - the booking flow is specific to Benson PMS
  const isBensonProperty = property.external_system?.toLowerCase() === 'benson';
  
  // For non-Benson properties, show a message and redirect to property page
  if (!isBensonProperty) {
    return (
      <PublicLayout backLabel="Back to Property" backTo={`/property/${property.slug || property.id}`}>
        <div className="container mx-auto px-4 py-24 text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground/30 mx-auto mb-6" />
          <h1 className="font-display text-2xl sm:text-3xl mb-4">Online Booking Not Available</h1>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            Online booking is not currently available for this property. 
            Please contact the property directly for reservations.
          </p>
          <div className="flex gap-4 justify-center">
            <Button asChild variant="outline">
              <Link to={`/property/${property.slug || property.id}`}>View Property</Link>
            </Button>
            <Button asChild>
              <Link to="/">Return to Home</Link>
            </Button>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // Success state
  if (bookingSuccess) {
    // Check if there are per-room custom dates
    const hasMultipleRoomDates = rooms.some(room => room.checkIn && room.checkOut && (room.checkIn !== checkIn || room.checkOut !== checkOut));
    
    return (
      <PublicLayout>
        <div className="container mx-auto px-3 sm:px-4 py-12 sm:py-20">
          <Card className="max-w-lg mx-auto text-center border-border/50">
            <CardContent className="pt-8 pb-8 sm:pt-10 sm:pb-10 px-6 sm:px-8">
              <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-6">
                <CheckCircle className="h-8 w-8 text-green-500" />
              </div>
              <h2 className="font-display text-2xl sm:text-3xl mb-3">Reservation Submitted!</h2>
              <p className="text-muted-foreground mb-6">
                Your reservation for <span className="font-medium text-foreground">{property.name}</span> has been submitted. 
                A confirmation email will be sent to {guestEmail}.
              </p>
              <div className="space-y-2 text-sm text-left bg-muted/30 rounded-lg p-4 sm:p-5 mb-6">
                <p><strong>Reference:</strong> {externalReservationId || bookingId?.slice(0, 8).toUpperCase()}</p>
                
                {/* Show per-room itinerary if rooms have different dates */}
                {rooms.length > 0 && (hasMultipleRoomDates || rooms.length > 1) ? (
                  <div className="space-y-2 mt-3">
                    <p className="font-semibold">Itinerary:</p>
                    {rooms.map((room, index) => {
                      const roomCheckIn = room.checkIn || checkIn;
                      const roomCheckOut = room.checkOut || checkOut;
                      return (
                        <div key={index} className="pl-3 border-l-2 border-primary/30 ml-1">
                          <p className="font-medium">Room {index + 1}: {room.roomTypeName}</p>
                          <p className="text-muted-foreground">
                            {roomCheckIn && format(parseISO(roomCheckIn), "MMM d, yyyy")} – {roomCheckOut && format(parseISO(roomCheckOut), "MMM d, yyyy")}
                          </p>
                          <p className="text-muted-foreground">
                            {room.numberOfAdults} Adult{room.numberOfAdults !== 1 ? 's' : ''}
                            {room.numberOfTeens > 0 && `, ${room.numberOfTeens} Teen${room.numberOfTeens !== 1 ? 's' : ''}`}
                            {room.numberOfChildren > 0 && `, ${room.numberOfChildren} Child${room.numberOfChildren !== 1 ? 'ren' : ''}`}
                            {room.numberOfInfants > 0 && `, ${room.numberOfInfants} Infant${room.numberOfInfants !== 1 ? 's' : ''}`}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <>
                    <p><strong>Check-in:</strong> {checkIn && format(parseISO(checkIn), "MMM d, yyyy")}</p>
                    <p><strong>Check-out:</strong> {checkOut && format(parseISO(checkOut), "MMM d, yyyy")}</p>
                    <p><strong>Guests:</strong> {totalGuests}</p>
                  </>
                )}
              </div>
              <Button onClick={() => navigate("/")} className="w-full sm:w-auto">
                Return to Home
              </Button>
            </CardContent>
          </Card>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout 
      backLabel="Back to Property" 
      backTo={`${getPropertyUrl(property.slug || property.id)}${searchParams.toString() ? `?${searchParams.toString()}` : ''}`}
    >
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-10">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="font-display text-2xl sm:text-3xl mb-2">Complete Your Booking</h1>
          <p className="text-muted-foreground">
            {property.name} • {property.city}, {property.country}
          </p>
        </div>

        <div className="grid lg:grid-cols-3 gap-6 lg:gap-8">
          {/* Booking Form */}
          <div className="lg:col-span-2 space-y-6">
            {/* Guest Details */}
            <Card className="border-border/50">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Guest Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:gap-4">
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="guest_name" className="text-xs sm:text-sm">Full Name *</Label>
                    <Input
                      id="guest_name"
                      value={guestName}
                      onChange={(e) => setGuestName(e.target.value)}
                      placeholder="John Smith"
                      className={cn("h-9 sm:h-10 text-sm", formErrors.guest_name && "border-destructive")}
                    />
                    {formErrors.guest_name && (
                      <p className="text-xs text-destructive">{formErrors.guest_name}</p>
                    )}
                  </div>
                  <div className="space-y-1.5 sm:space-y-2">
                    <Label htmlFor="guest_email" className="text-xs sm:text-sm">Email Address *</Label>
                    <Input
                      id="guest_email"
                      type="email"
                      value={guestEmail}
                      onChange={(e) => setGuestEmail(e.target.value)}
                      placeholder="john@example.com"
                      className={cn("h-9 sm:h-10 text-sm", formErrors.guest_email && "border-destructive")}
                    />
                    {formErrors.guest_email && (
                      <p className="text-xs text-destructive">{formErrors.guest_email}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-1.5 sm:space-y-2">
                  <Label htmlFor="guest_phone" className="text-xs sm:text-sm">Phone Number *</Label>
                  <Input
                    id="guest_phone"
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="+27 12 345 6789"
                    className={cn("h-9 sm:h-10 text-sm", formErrors.guest_phone && "border-destructive")}
                  />
                  {formErrors.guest_phone && (
                    <p className="text-xs text-destructive">{formErrors.guest_phone}</p>
                  )}
                  <p className="text-[10px] sm:text-xs text-muted-foreground">
                    Include country code (e.g., +27)
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
                        <div>
                          <h4 className="font-medium">
                            {roomType?.name || room.roomTypeName || `Room ${index + 1}`}
                          </h4>
                          {/* Show per-room dates or fallback to default dates */}
                          {(room.checkIn || checkIn) && (room.checkOut || checkOut) && (
                            <span className="text-sm text-muted-foreground">
                              {format(parseISO(room.checkIn || checkIn!), "d MMM")} - {format(parseISO(room.checkOut || checkOut!), "d MMM yyyy")}
                              {room.checkIn && room.checkOut && (room.checkIn !== checkIn || room.checkOut !== checkOut) && (
                                <span className="text-xs ml-2 text-primary">(custom dates)</span>
                              )}
                            </span>
                          )}
                        </div>
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

                      {/* Guest Counts - Respect room rules */}
                      {(() => {
                        // Get room type constraints
                        const maxGuestsForRoom = roomType?.maxGuests || roomType?.maxPeople || 10;
                        const allowTeens = roomType?.allowTeens !== false; // Default true if undefined
                        const allowChildren = roomType?.allowChildren !== false;
                        const allowInfants = roomType?.allowInfants !== false;
                        
                        // Calculate current total for this room
                        const currentRoomTotal = room.numberOfAdults + room.numberOfTeens + room.numberOfChildren + room.numberOfInfants;
                        const isAtMaxCapacity = currentRoomTotal >= maxGuestsForRoom;
                        
                        return (
                          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
                            {/* Adults (required, min 1) */}
                            <div className="space-y-2">
                              <Label className="text-xs sm:text-sm">Adults *</Label>
                              <div className="flex items-center gap-2">
                                <Button 
                                  variant="outline" 
                                  size="icon" 
                                  className="h-10 w-10 sm:h-8 sm:w-8"
                                  onClick={() => adjustGuestCount(index, 'numberOfAdults', -1)}
                                  disabled={room.numberOfAdults <= 1}
                                >
                                  <Minus className="h-4 w-4" />
                                </Button>
                                <span className="w-8 text-center font-medium text-sm sm:text-base">{room.numberOfAdults}</span>
                                <Button 
                                  variant="outline" 
                                  size="icon" 
                                  className="h-10 w-10 sm:h-8 sm:w-8"
                                  onClick={() => adjustGuestCount(index, 'numberOfAdults', 1)}
                                  disabled={isAtMaxCapacity}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>

                            {/* Teens - only show if allowed */}
                            {allowTeens && (
                              <div className="space-y-2">
                                <Label className="text-xs sm:text-sm">Teens</Label>
                                <div className="flex items-center gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-10 w-10 sm:h-8 sm:w-8"
                                    onClick={() => adjustGuestCount(index, 'numberOfTeens', -1)}
                                    disabled={room.numberOfTeens <= 0}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <span className="w-8 text-center font-medium text-sm sm:text-base">{room.numberOfTeens}</span>
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-10 w-10 sm:h-8 sm:w-8"
                                    onClick={() => adjustGuestCount(index, 'numberOfTeens', 1)}
                                    disabled={isAtMaxCapacity}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Children - only show if allowed */}
                            {allowChildren && (
                              <div className="space-y-2">
                                <Label className="text-xs sm:text-sm">Children</Label>
                                <div className="flex items-center gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-10 w-10 sm:h-8 sm:w-8"
                                    onClick={() => adjustGuestCount(index, 'numberOfChildren', -1)}
                                    disabled={room.numberOfChildren <= 0}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <span className="w-8 text-center font-medium text-sm sm:text-base">{room.numberOfChildren}</span>
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-10 w-10 sm:h-8 sm:w-8"
                                    onClick={() => adjustGuestCount(index, 'numberOfChildren', 1)}
                                    disabled={isAtMaxCapacity}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}

                            {/* Infants - only show if allowed */}
                            {allowInfants && (
                              <div className="space-y-2">
                                <Label className="text-xs sm:text-sm">Infants</Label>
                                <div className="flex items-center gap-2">
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-10 w-10 sm:h-8 sm:w-8"
                                    onClick={() => adjustGuestCount(index, 'numberOfInfants', -1)}
                                    disabled={room.numberOfInfants <= 0}
                                  >
                                    <Minus className="h-4 w-4" />
                                  </Button>
                                  <span className="w-8 text-center font-medium text-sm sm:text-base">{room.numberOfInfants}</span>
                                  <Button 
                                    variant="outline" 
                                    size="icon" 
                                    className="h-10 w-10 sm:h-8 sm:w-8"
                                    onClick={() => adjustGuestCount(index, 'numberOfInfants', 1)}
                                    disabled={isAtMaxCapacity}
                                  >
                                    <Plus className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })()}
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

            {/* Mobile Sticky Footer - Submit Button */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-card border-t border-border p-4 z-40 safe-area-bottom">
              <div className="flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">
                    {totalCost > 0 ? <FormattedPrice amount={totalCost} /> : 'Price on request'}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {nights} night{nights !== 1 ? 's' : ''} • {totalGuests} guest{totalGuests !== 1 ? 's' : ''}
                  </p>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="flex-shrink-0">
                        <Button 
                          className="h-12 px-6 text-base" 
                          onClick={() => createBookingMutation.mutate()}
                          disabled={createBookingMutation.isPending || !isFormValid}
                        >
                          {createBookingMutation.isPending ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Processing
                            </>
                          ) : (
                            'Confirm'
                          )}
                        </Button>
                      </span>
                    </TooltipTrigger>
                    {!isFormValid && missingFields.length > 0 && (
                      <TooltipContent side="top" className="max-w-xs">
                        <div className="space-y-1">
                          <p className="font-medium text-xs">Missing required fields:</p>
                          <ul className="text-xs list-disc pl-3 space-y-0.5">
                            {missingFields.map((field, i) => (
                              <li key={i}>{field}</li>
                            ))}
                          </ul>
                        </div>
                      </TooltipContent>
                    )}
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            {/* Spacer for mobile sticky footer */}
            <div className="lg:hidden h-24" />
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
                    {rooms.map((room, i) => {
                      const roomCheckIn = room.checkIn || checkIn;
                      const roomCheckOut = room.checkOut || checkOut;
                      const hasCustomDates = room.checkIn && room.checkOut && (room.checkIn !== checkIn || room.checkOut !== checkOut);
                      return (
                        <div key={i} className="text-muted-foreground text-xs">
                          <p>
                            Room {i + 1}: {room.roomTypeName || 'Standard'} 
                            ({room.numberOfAdults}A
                            {room.numberOfTeens > 0 && `, ${room.numberOfTeens}T`}
                            {room.numberOfChildren > 0 && `, ${room.numberOfChildren}C`}
                            {room.numberOfInfants > 0 && `, ${room.numberOfInfants}I`})
                          </p>
                          {hasCustomDates && roomCheckIn && roomCheckOut && (
                            <p className="text-primary text-[10px]">
                              {format(parseISO(roomCheckIn), "d MMM")} - {format(parseISO(roomCheckOut), "d MMM")}
                            </p>
                          )}
                        </div>
                      );
                    })}
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
                              <p className="text-xs">{item.nights} nights × <FormattedPrice amount={item.unitPrice} /></p>
                            </div>
                            <span className="font-medium"><FormattedPrice amount={item.total} /></span>
                          </div>
                        ))}
                      </div>
                      
                      {/* Other Charges (not from API) */}
                      <div className="space-y-2">
                        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Other Charges</p>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Service fee</span>
                          <span><FormattedPrice amount={0} /></span>
                        </div>
                        <div className="flex justify-between text-sm text-muted-foreground">
                          <span>Tourism levy</span>
                          <span>Included</span>
                        </div>
                      </div>
                      
                      {/* Total */}
                      <div className="border-t pt-3 flex justify-between items-center">
                        <span className="font-semibold">Total</span>
                        <span className="text-xl font-bold"><FormattedPrice amount={totalCost} /></span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total</span>
                      <span className="text-xl font-bold">
                        {preSelectedTotalCost !== null 
                          ? <FormattedPrice amount={preSelectedTotalCost} />
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
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="block">
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
                        </span>
                      </TooltipTrigger>
                      {!isFormValid && missingFields.length > 0 && (
                        <TooltipContent side="top" className="max-w-xs">
                          <div className="space-y-1">
                            <p className="font-medium text-xs">Missing required fields:</p>
                            <ul className="text-xs list-disc pl-3 space-y-0.5">
                              {missingFields.map((field, i) => (
                                <li key={i}>{field}</li>
                              ))}
                            </ul>
                          </div>
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
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
    </PublicLayout>
  );
};

export default Booking;