import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { useBrandOverride } from "@/hooks/useBrandOverride";
import { applyBrandToDocument, saveBrandToSession, type PropertyBrand } from "@/lib/brandOverride";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { WhiteLabelLayout } from "@/components/layout/WhiteLabelLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, Users, ArrowLeft, Minus, Plus, Loader2, CheckCircle, AlertCircle, Info, CalendarDays, PawPrint, CreditCard, Lock, ChevronRight, BedDouble } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, differenceInDays, addDays } from "date-fns";
import { getPropertyUrl } from "@/lib/config";
import { getAccommodationLabel } from "@/lib/accommodationLabels";
import { cn } from "@/lib/utils";
import { useState, useEffect, useMemo, useCallback } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { FormattedPrice } from "@/components/FormattedPrice";
import { useItinerary } from "@/contexts/ItineraryContext";
import { PaymentGatewayRouter } from "@/components/booking/PaymentGatewayRouter";
import { PaymentMethodSelector } from "@/components/booking/PaymentMethodSelector";
import { useActivePaymentGateways } from "@/hooks/useActivePaymentGateway";
import type { PaymentGateway } from "@/hooks/useActivePaymentGateway";
import { motion } from "framer-motion";
import { BottomSheetDatePicker } from "@/components/booking/BottomSheetDatePicker";
import { FluentStepIndicator } from "@/components/booking/FluentStepIndicator";
import { FluentBookingHeader } from "@/components/booking/FluentBookingHeader";
import { FluentGuestForm } from "@/components/booking/FluentGuestForm";
import type { VoucherStatus, VoucherResult } from "@/components/booking/FluentGuestForm";
import { GuestCountStepper } from "@/components/booking/GuestCountStepper";
import { AddOnSelector, type SelectedAddOn } from "@/components/booking/AddOnSelector";
import { useChargesForBooking } from "@/hooks/usePropertyCharges";
import { calculateCharges, getChargeTotals } from "@/components/charges/ChargeCalculator";
import type { ChargeCalculationContext } from "@/components/charges/ChargeCalculator";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

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
  numberOfPets: number;
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
  allowPets?: boolean;
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
  isRefundable?: boolean;
}

const Booking = () => {
  const { id } = useParams<{ id: string }>();
  const { brandReady } = useBrandOverride(id);
  const { gateways: activeGateways } = useActivePaymentGateways(id);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
  const effectiveGateway = selectedGateway || activeGateways[0] || "payfast";
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Integration detection — when present, use white-label layout
  const integrationParam = searchParams.get("integration");
  const isIntegration = !!integrationParam;
  // Will be set after property loads — also triggers white-label for brand-override properties

  // Apply brand colors from URL params (embed flow passes these explicitly)
  const urlBrandColor = searchParams.get("brand_color");
  const urlBrandSecondary = searchParams.get("brand_secondary_color");
  const urlBrandFont = searchParams.get("brand_font_color");

  useEffect(() => {
    if (!urlBrandColor) return;
    const brand: PropertyBrand = {
      enabled: true,
      primaryColor: urlBrandColor,
      secondaryColor: urlBrandSecondary,
      fontColor: urlBrandFont,
      propertyId: id || "",
    };
    saveBrandToSession(brand);
    const cleanup = applyBrandToDocument(brand);
    return cleanup;
  }, [urlBrandColor, urlBrandSecondary, urlBrandFont, id]);
  
  // Get sticky guest details from context
  const { guestDetails, setGuestDetails, stays, totalPrice: itineraryTotalPrice } = useItinerary();
  
  const urlCheckIn = searchParams.get("checkIn") || searchParams.get("checkin");
  const urlCheckOut = searchParams.get("checkOut") || searchParams.get("checkout");
  const initialGuests = parseInt(searchParams.get("guests") || "2");
  const urlMaxGuests = parseInt(searchParams.get("max_guests") || "0");
  
  // Pre-selected values from URL (from staging booking flow or embed)
  const preSelectedRoomTypeId = searchParams.get("roomTypeId") || searchParams.get("room_type");
  const preSelectedRoomTypeName = searchParams.get("roomTypeName");
  const preSelectedRateTypeId = searchParams.get("rateTypeId");
  const preSelectedRateTypeName = searchParams.get("rateTypeName");
  const preSelectedAdults = parseInt(searchParams.get("adults") || "0");
  const preSelectedTeens = parseInt(searchParams.get("teens") || "0");
  const preSelectedChildren = parseInt(searchParams.get("children") || "0");
  const preSelectedInfants = parseInt(searchParams.get("infants") || "0");
  const preSelectedPets = parseInt(searchParams.get("pets") || "0");
  const preSelectedTotalCost = searchParams.get("totalCost") ? parseFloat(searchParams.get("totalCost")!) : null;
  
  // Embed-specific params: pre-resolved rate data from EmbedProperty
  const embedRate = searchParams.get("embed_rate") ? parseFloat(searchParams.get("embed_rate")!) : null;
  const embedPricingModel = searchParams.get("embed_pricing_model");
  const embedLinkedRolosId = searchParams.get("linked_rolos_id");

  // Form state - initialize from sticky context
  const [guestName, setGuestName] = useState(guestDetails.name || "");
  const [guestEmail, setGuestEmail] = useState(guestDetails.email || "");
  const [guestPhone, setGuestPhone] = useState(guestDetails.phone || "");
  const [guestNationality, setGuestNationality] = useState("");
  const [voucher, setVoucher] = useState("");
  const [specialRequests, setSpecialRequests] = useState("");
  const [selectedRateType, setSelectedRateType] = useState<string>("");
  const [rooms, setRooms] = useState<RoomBooking[]>([]);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [bookingSuccess, setBookingSuccess] = useState(false);
  
  // Voucher validation state
  const [voucherStatus, setVoucherStatus] = useState<VoucherStatus>("idle");
  const [voucherResult, setVoucherResult] = useState<VoucherResult | null>(null);
  const [voucherDiscount, setVoucherDiscount] = useState<number>(0);
  const [bookingId, setBookingId] = useState<string | null>(null);
  const [externalReservationId, setExternalReservationId] = useState<string | null>(null);
  
  // Payment modal state
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [pendingBookingId, setPendingBookingId] = useState<string | null>(null);
  const [pendingPaymentAmount, setPendingPaymentAmount] = useState<number>(0);
  
  // Date state - can be restored from sessionStorage
  const [checkIn, setCheckIn] = useState<string | null>(urlCheckIn);
  const [checkOut, setCheckOut] = useState<string | null>(urlCheckOut);
  
  // Cost calculation state
  const [availabilityData, setAvailabilityData] = useState<any>(null);
  const [costBreakdown, setCostBreakdown] = useState<CostLineItem[]>([]);
  const [totalCost, setTotalCost] = useState<number>(0);
  const [calculatingCost, setCalculatingCost] = useState(false);
  
  // Date re-selection dialog state (for AVAILABILITY_CHANGED errors)
  const [showDateReselectDialog, setShowDateReselectDialog] = useState(false);
  const [pendingCheckIn, setPendingCheckIn] = useState<Date | undefined>();
  const [pendingCheckOut, setPendingCheckOut] = useState<Date | undefined>();
  
  // Availability calendar map (rates + blocked dates)
  const [calendarAvailability, setCalendarAvailability] = useState<Map<string, { available: boolean; rate?: number }>>(new Map());
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [selectedAddons, setSelectedAddons] = useState<SelectedAddOn[]>([]);
  const [vatConfig, setVatConfig] = useState<{ isVat: boolean; rate: number; number: string }>({ isVat: false, rate: 15, number: "" });

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
    staleTime: 5 * 60 * 1000, // 5 min — avoid refetching on navigation
  });

  // Fetch property charges (taxes, fees, deposits, surcharges)
  const { data: propertyCharges } = useChargesForBooking(property?.id || null);

  // Fetch VAT config from brand config, with amenities fallback
  useEffect(() => {
    if (!property?.id) return;
    supabase
      .from("rolos_brand_config" as any)
      .select("is_vat_registered, vat_rate, vat_number")
      .eq("property_id", property.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          const d = data as any;
          const brandIsVat = d.is_vat_registered ?? false;
          const brandVatNumber = d.vat_number || "";
          // Fallback: if brand config doesn't have VAT enabled, check amenities
          const amenities = property.amenities as any;
          const amenityVatNumber = amenities?.vat_number || "";
          const hasVat = brandIsVat || !!amenityVatNumber;
          setVatConfig({
            isVat: hasVat,
            rate: d.vat_rate ?? 15,
            number: brandVatNumber || amenityVatNumber,
          });
        } else {
          // No brand config at all — check amenities directly
          const amenities = property.amenities as any;
          const amenityVatNumber = amenities?.vat_number || "";
          if (amenityVatNumber) {
            setVatConfig({
              isVat: true,
              rate: 15,
              number: amenityVatNumber,
            });
          }
        }
      });
  }, [property?.id, property?.amenities]);

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
    staleTime: 5 * 60 * 1000, // 5 min cache
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
    staleTime: 5 * 60 * 1000, // 5 min cache
  });

  // Extract room types and rate types - prefer amenities, fallback to cached tables
  const amenities = property?.amenities as Record<string, any> | null;
  const accommodationLabel = getAccommodationLabel(property ? { ...property, amenities: property.amenities as Record<string, unknown> | null } : null);
  
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

  // Fetch calendar availability for date picker (rates + blocked dates)
  useEffect(() => {
    const fetchAvailability = async () => {
      if (!property?.id) return;
      const amenitiesData = property.amenities as Record<string, any> | null;
      const externalSystem = property.external_system?.toLowerCase();
      const isManual = !externalSystem || externalSystem === 'none' || externalSystem === 'roomsonline';

      const today = new Date();
      const endDate = addDays(today, 395);
      const todayStr = format(today, "yyyy-MM-dd");
      const endStr = format(endDate, "yyyy-MM-dd");

      const calendarMap = new Map<string, { available: boolean; rate?: number }>();

      if (isManual && amenitiesData) {
        // Manual properties: use property_availability + wizard rates
        const wizardRooms = amenitiesData.room_types || [];
        const firstRoom = wizardRooms[0];
        const linkedRateTypeId = firstRoom?.linkedRateTypes?.[0];
        const pmsRateTypes = amenitiesData.pms_rate_types || [];
        const rateType = pmsRateTypes.find((rt: any) => rt.id === linkedRateTypeId);
        const baseRate = rateType?.baseRate || firstRoom?.baseRate || firstRoom?.base_rate || property.price_per_night;

        const { data: blockedData } = await supabase
          .from("property_availability")
          .select("date, available_units, is_stop_sell")
          .eq("property_id", property.id)
          .gte("date", todayStr)
          .lte("date", endStr);

        const blockedDates = new Set<string>();
        if (blockedData) {
          blockedData.forEach((item) => {
            if (item.is_stop_sell || item.available_units === 0) {
              blockedDates.add(item.date);
            }
          });
        }

        for (let i = 0; i < 395; i++) {
          const date = addDays(today, i);
          const dateStr = format(date, "yyyy-MM-dd");
          const isBlocked = blockedDates.has(dateStr);
          let dayRate = baseRate;
          const seasons = amenitiesData?.seasons || [];
          const seasonRates = amenitiesData?.season_rates || {};
          for (const season of seasons) {
            if (dateStr >= season.from && dateStr <= season.to) {
              const seasonRateKey = `${firstRoom?.id || 'default'}-${linkedRateTypeId}`;
              const seasonRateData = seasonRates[season.id]?.[seasonRateKey];
              if (seasonRateData?.roomAmount) {
                dayRate = seasonRateData.roomAmount;
              }
              break;
            }
          }
          calendarMap.set(dateStr, { available: !isBlocked, rate: dayRate });
        }
      } else {
        // PMS-backed properties: fetch from pms_availability_cache
        const { data: cacheData } = await supabase
          .from("pms_availability_cache")
          .select("date, available_units, rates")
          .eq("property_id", property.id)
          .gte("date", todayStr)
          .lte("date", endStr)
          .order("date");

        // Also check property_availability for manual stop-sells
        const { data: manualBlocks } = await supabase
          .from("property_availability")
          .select("date, available_units, is_stop_sell")
          .eq("property_id", property.id)
          .gte("date", todayStr)
          .lte("date", endStr);

        const manualBlockedDates = new Set<string>();
        if (manualBlocks) {
          manualBlocks.forEach((item) => {
            if (item.is_stop_sell || item.available_units === 0) {
              manualBlockedDates.add(item.date);
            }
          });
        }

        // Build map from cache data
        const cachedDates = new Set<string>();
        if (cacheData) {
          for (const row of cacheData) {
            cachedDates.add(row.date);
            const isBlocked = manualBlockedDates.has(row.date) || (row.available_units != null && row.available_units <= 0);
            const ratesData = row.rates as any;
            const rate = ratesData?.room_amount || (Array.isArray(ratesData) ? ratesData[0]?.room_amount : undefined);
            calendarMap.set(row.date, { available: !isBlocked, rate });
          }
        }

        // Fill in gaps (dates not in cache) — mark as available by default
        for (let i = 0; i < 395; i++) {
          const date = addDays(today, i);
          const dateStr = format(date, "yyyy-MM-dd");
          if (!cachedDates.has(dateStr)) {
            calendarMap.set(dateStr, { available: !manualBlockedDates.has(dateStr) });
          }
        }
      }

      setCalendarAvailability(calendarMap);
    };
    fetchAvailability();
  }, [property?.id, property?.external_system, property?.amenities]);

  useEffect(() => {
    if (!property || rooms.length !== 0) return;

    const isAddRoomMode = searchParams.get("addRoom") === "true";
    const savedState = sessionStorage.getItem(`booking_state_${property.id}`);

    if (isAddRoomMode && savedState) {
      const parsedState = JSON.parse(savedState);
      const existingRooms = parsedState.rooms || [];

      if (preSelectedRoomTypeId) {
        // Explicit add-room flow: append the newly selected room to the saved booking
        const newRoom: RoomBooking = {
          roomTypeId: preSelectedRoomTypeId,
          roomTypeName: preSelectedRoomTypeName || "",
          numberOfAdults: Math.max(1, preSelectedAdults),
          numberOfTeens: preSelectedTeens,
          numberOfChildren: preSelectedChildren,
          numberOfInfants: preSelectedInfants,
          numberOfPets: preSelectedPets,
          checkIn: urlCheckIn || parsedState.defaultCheckIn,
          checkOut: urlCheckOut || parsedState.defaultCheckOut,
        };

        setRooms([...existingRooms, newRoom]);

        if (parsedState.defaultCheckIn) setCheckIn(parsedState.defaultCheckIn);
        if (parsedState.defaultCheckOut) setCheckOut(parsedState.defaultCheckOut);
      } else {
        // Resume existing multi-room checkout state only for explicit add-room returns
        setRooms(existingRooms);

        if (parsedState.defaultCheckIn) setCheckIn(parsedState.defaultCheckIn);
        if (parsedState.defaultCheckOut) setCheckOut(parsedState.defaultCheckOut);
      }

      if (parsedState.guestName) setGuestName(parsedState.guestName);
      if (parsedState.guestEmail) setGuestEmail(parsedState.guestEmail);
      if (parsedState.guestPhone) setGuestPhone(parsedState.guestPhone);
      if (parsedState.voucher) setVoucher(parsedState.voucher);
      if (parsedState.specialRequests) setSpecialRequests(parsedState.specialRequests);
      if (parsedState.selectedRateType) setSelectedRateType(parsedState.selectedRateType);
      if (parsedState.availabilityData) setAvailabilityData(parsedState.availabilityData);
      if (parsedState.costBreakdown) setCostBreakdown(parsedState.costBreakdown);
      if (parsedState.totalCost) setTotalCost(parsedState.totalCost);

      sessionStorage.removeItem(`booking_state_${property.id}`);
      return;
    }

    // Fresh embed/property booking: ignore stale saved state and trust the URL selection
    if (savedState) {
      sessionStorage.removeItem(`booking_state_${property.id}`);
    }

    if (preSelectedRoomTypeId && preSelectedRoomTypeName) {
      const hasPreSelectedGuests = searchParams.has("adults");
      const fallbackAdults = urlMaxGuests > 0 ? Math.max(1, Math.min(2, urlMaxGuests)) : 2;
      setRooms([{
        roomTypeId: preSelectedRoomTypeId,
        roomTypeName: preSelectedRoomTypeName,
        numberOfAdults: hasPreSelectedGuests ? Math.max(1, preSelectedAdults) : fallbackAdults,
        numberOfTeens: preSelectedTeens,
        numberOfChildren: preSelectedChildren,
        numberOfInfants: preSelectedInfants,
        numberOfPets: preSelectedPets,
        checkIn: urlCheckIn || undefined,
        checkOut: urlCheckOut || undefined,
      }]);
    } else if (roomTypes.length > 0) {
      // For ROL'OS properties without a pre-selected room, try to use hfRoom IDs
      // which match the synthetic availability builder (avoids ID mismatch)
      const initRoom = async () => {
        const firstRoom = roomTypes[0];
        let bestId = String(firstRoom.id);
        let bestName = firstRoom.name;
        let bestMax = firstRoom.maxGuests || 2;

        if (property) {
          const { data: hfRooms } = await supabase
            .from("hostfully_room_types")
            .select("id, name, linked_rolos_id, max_guests, is_active")
            .eq("property_id", property.id)
            .eq("is_active", true)
            .limit(1);

          if (hfRooms && hfRooms.length > 0) {
            bestId = hfRooms[0].id;
            bestName = hfRooms[0].name;
            bestMax = hfRooms[0].max_guests || bestMax;
            console.log('[Booking] Using hfRoom ID for initialization:', bestId, bestName);
          }
        }

        setRooms([{
          roomTypeId: bestId,
          roomTypeName: bestName,
          numberOfAdults: Math.min(initialGuests, bestMax),
          numberOfTeens: 0,
          numberOfChildren: 0,
          numberOfInfants: 0,
          numberOfPets: 0,
          checkIn: urlCheckIn || undefined,
          checkOut: urlCheckOut || undefined,
        }]);
      };
      initRoom();
    }

    if (preSelectedRateTypeId && !selectedRateType) {
      setSelectedRateType(preSelectedRateTypeId);
    } else if (rateTypes.length > 0 && !selectedRateType) {
      setSelectedRateType(String(rateTypes[0].id));
    } else if (rateTypes.length === 0 && !selectedRateType) {
      setSelectedRateType('default');
    }
  }, [property, roomTypes, rateTypes, initialGuests, preSelectedRoomTypeId, preSelectedRoomTypeName, preSelectedRateTypeId, preSelectedAdults, preSelectedTeens, preSelectedChildren, preSelectedInfants, preSelectedPets, rooms.length, searchParams, selectedRateType, urlCheckIn, urlCheckOut]);

  // Fix timing race: When cachedRateTypes loads AFTER selectedRateType was set to 'default',
  // update to use the actual rate type from the database
  useEffect(() => {
    if (cachedRateTypes && cachedRateTypes.length > 0 && selectedRateType === 'default') {
      const firstRateType = cachedRateTypes[0];
      const betterRateTypeId = firstRateType.external_rate_type_id || 'default';
      console.log('[Booking] Updating selectedRateType from default to:', betterRateTypeId);
      setSelectedRateType(betterRateTypeId);
    }
  }, [cachedRateTypes, selectedRateType]);

  // Initialize rooms and cost from ItineraryContext when available (for non-PMS properties)
  // This ensures the pre-calculated price from QuickBookDrawer carries through to checkout
  useEffect(() => {
    if (property && stays.length > 0) {
      // Find the stay for this property
      const currentStay = stays.find(s => 
        s.property_id === property.id || s.property_slug === property.slug
      );
      
      if (currentStay) {
        // Initialize rooms if not already set
        if (rooms.length === 0) {
          console.log('[Booking] Initializing rooms from ItineraryContext stay:', currentStay);
          
          // Initialize rooms from itinerary context
          const mappedRooms: RoomBooking[] = currentStay.rooms.map(r => ({
            roomTypeId: r.room_type_id,
            roomTypeName: r.room_type_name,
            numberOfAdults: currentStay.guests.adults,
            numberOfTeens: 0,
            numberOfChildren: currentStay.guests.children,
            numberOfInfants: currentStay.guests.infants,
            numberOfPets: 0,
            checkIn: currentStay.dates.check_in,
            checkOut: currentStay.dates.check_out,
          }));
          setRooms(mappedRooms);
          setCheckIn(currentStay.dates.check_in);
          setCheckOut(currentStay.dates.check_out);
          
          // Set rate type if available
          if (currentStay.rate_type_id) {
            setSelectedRateType(currentStay.rate_type_id);
          }
        }
        
        // ALWAYS copy price from context if we don't have it calculated locally
        // This ensures QuickBookDrawer's calculation carries through even when rooms were initialized by URL params
        if (currentStay.price_breakdown.total > 0 && totalCost === 0 && costBreakdown.length === 0) {
          console.log('[Booking] Using price from ItineraryContext:', currentStay.price_breakdown.total);
          setTotalCost(currentStay.price_breakdown.total);
          // Build cost breakdown from rooms
          setCostBreakdown(currentStay.rooms.map(r => ({
            description: `${r.room_type_name} (${currentStay.guests.adults + currentStay.guests.children} guest${(currentStay.guests.adults + currentStay.guests.children) !== 1 ? 's' : ''})`,
            nights: currentStay.nights,
            quantity: r.quantity,
            unitPrice: r.rate_per_night,
            total: r.total_price,
          })));
        }
      }
    }
  }, [property, stays, rooms.length, totalCost, costBreakdown.length]);

  // Calculate totals
  const totalGuests = rooms.reduce((sum, room) => 
    sum + room.numberOfAdults + room.numberOfTeens + room.numberOfChildren + room.numberOfInfants, 0
  );
  const nights = checkIn && checkOut ? differenceInDays(parseISO(checkOut), parseISO(checkIn)) : 0;

  // Helper to slugify room name for fallback matching (same as in RoomShowcase)
  const slugifyRoomName = (name: string) => 
    name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  // Transform pms_availability_cache rows into the availability format expected by cost calculator
  // Now includes aliases for room type ID matching (original ID + slugified name)
  const transformCacheToAvailability = (cacheData: any[], roomAliases: Map<string, string[]>) => {
    // Group by room type
    const roomTypeMap = new Map<string, any>();
    
    for (const row of cacheData) {
      const rtId = row.external_room_type_id;
      if (!roomTypeMap.has(rtId)) {
        // Find all alias IDs that should map to this room type
        const aliases: string[] = [rtId];
        for (const [originalId, slugAliases] of roomAliases) {
          if (slugAliases.includes(rtId)) {
            aliases.push(originalId);
          }
        }
        
        roomTypeMap.set(rtId, {
          room_type_id: rtId,
          room_type_aliases: aliases, // Include all IDs that should match this room
          room_type_name: row.raw_data?.roomTypeName || rtId,
          rooms_available_per_night: [],
          rate_types: [],
        });
      }
      
      const rt = roomTypeMap.get(rtId)!;
      
      // Add availability
      rt.rooms_available_per_night.push({
        date: row.date,
        available_units: row.available_units,
        ...(row.restrictions || {}),
      });
      
      // Add rates - handle both array and object formats
      const ratesData = row.rates;
      if (ratesData) {
        // If rates is an object (like {currency, room_amount}), wrap in array
        const ratesArray = Array.isArray(ratesData) ? ratesData : [ratesData];
        
        for (const rate of ratesArray) {
          // For simple rate objects (no rate_type_id), create a default rate type
          const rateTypeId = rate.rate_type_id || 'default';
          let rateType = rt.rate_types.find((r: any) => r.rate_type_id === rateTypeId);
          if (!rateType) {
            rateType = {
              rate_type_id: rateTypeId,
              rate_type_name: rate.rate_type_name || 'Standard',
              price_type: rate.price_type || 'PER_ROOM',
              rate_key: rate.rate_key,
              rates: [],
            };
            rt.rate_types.push(rateType);
          }
          rateType.rates.push({
            date: row.date,
            room_amount: rate.room_amount,
            adult_amounts: rate.adult_amounts,
            teen_amount: rate.teen_amount,
            child_amount: rate.child_amount,
            infant_amount: rate.infant_amount,
            currency: rate.currency,
          });
        }
      }
    }
    
    return { room_types: Array.from(roomTypeMap.values()) };
  };

  // Helper: Generate daily rates from wizard base rate with seasonal adjustments
  const generateDailyRates = (
    startDate: string, 
    endDate: string, 
    baseRate: number, 
    seasons: any[], 
    seasonRates: any[],
    roomId: string
  ) => {
    const rates: any[] = [];
    const currentDate = new Date(startDate);
    const end = new Date(endDate);
    
    while (currentDate < end) {
      const dateStr = currentDate.toISOString().split('T')[0];
      let dayRate = baseRate;
      
      // Check if date falls within any season and apply adjustment
      if (seasons.length > 0) {
        for (const season of seasons) {
          const seasonStart = season.start_date || season.startDate;
          const seasonEnd = season.end_date || season.endDate;
          
          if (seasonStart && seasonEnd && dateStr >= seasonStart && dateStr <= seasonEnd) {
            // Look for season-specific rate for this room
            const seasonRate = seasonRates?.find((sr: any) => 
              (sr.room_id === roomId || sr.room_type_id === roomId) && 
              sr.season_id === season.id
            );
            
            if (seasonRate?.rate || seasonRate?.daily_rate) {
              dayRate = seasonRate.rate || seasonRate.daily_rate;
            } else if (season.rate_multiplier) {
              // Apply multiplier if defined
              dayRate = baseRate * (season.rate_multiplier || 1);
            }
            break;
          }
        }
      }
      
      rates.push({
        date: dateStr,
        room_amount: dayRate,
      });
      
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return rates;
  };

  // Helper: Generate availability array for date range (all available)
  const generateAvailabilityArray = (startDate: string, endDate: string, availableUnits: number) => {
    const availability: any[] = [];
    const currentDate = new Date(startDate);
    const end = new Date(endDate);
    
    while (currentDate < end) {
      availability.push({
        date: currentDate.toISOString().split('T')[0],
        available_units: availableUnits,
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return availability;
  };

  // Calculate cost based on availability data
  const calculateCost = async () => {
    if (!property?.id || !checkIn || !checkOut || rooms.length === 0 || !selectedRateType) {
      return;
    }

    // Skip cost calculation for NightsBridge (uses external booking)
    const externalSystem = property.external_system?.toLowerCase();
    if (externalSystem === 'nightsbridge') {
      return;
    }

    setCalculatingCost(true);
    try {
      // Try preloaded availability from sessionStorage first (set by PropertyShowcase)
      let availability = availabilityData;
      // Skip sessionStorage preload for live-API PMS systems — preloaded data only has today's snapshot,
      // not the full booking date range, which causes zero-rate calculations ("On Request")
      const skipPreload = ['hostfully', 'benson', 'hotelbeds', 'hyperguest'].includes(externalSystem || '');
      if (!availability && property?.id && !skipPreload) {
        try {
          const preloaded = sessionStorage.getItem(`avail_preload_${property.id}`);
          if (preloaded) {
            const parsed = JSON.parse(preloaded);
            // Use if less than 5 minutes old
            if (Date.now() - parsed.fetchedAt < 5 * 60 * 1000 && parsed.data?.length > 0) {
              console.log('[Booking] Using preloaded availability from PropertyShowcase');
              const roomAliases = new Map<string, string[]>();
              for (const rt of roomTypes) {
                roomAliases.set(String(rt.id), [slugifyRoomName(rt.name)]);
              }
              availability = transformCacheToAvailability(parsed.data, roomAliases);
            }
          }
        } catch (_) { /* parse error — fall through to live fetch */ }
      }
      if (!availability) {
        if (externalSystem === 'benson') {
          // Benson: fetch from API directly
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
        } else if (externalSystem === 'hostfully') {
          // Hostfully: fetch from API directly
          const { data, error } = await supabase.functions.invoke("hostfully-api", {
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
        } else if (externalSystem === 'hotelbeds') {
          // HotelBeds: fetch from API directly with camelCase params
          console.log('[Booking] Fetching HotelBeds live availability for', property.id, checkIn, checkOut);
          const { data, error } = await supabase.functions.invoke("hotelbeds-api", {
            body: {
              action: "fetch_availability",
              property_id: property.id,
              startDate: checkIn,
              endDate: checkOut,
            },
          });

          if (error) throw error;
          // Unwrap adapter response - data may be in data.data or data directly
          availability = data?.data || data;
          console.log('[Booking] HotelBeds availability response:', availability);
        } else if (externalSystem === 'hyperguest') {
          // HyperGuest: fetch from API directly
          console.log('[Booking] Fetching HyperGuest live availability for', property.id, checkIn, checkOut);
          const { data, error } = await supabase.functions.invoke("hyperguest-api", {
            body: {
              action: "fetch_availability",
              property_id: property.id,
              start_date: checkIn,
              end_date: checkOut,
            },
          });

          if (error) throw error;
          availability = data?.data || data;
          console.log('[Booking] HyperGuest availability response:', availability);
        } else {
          // Other PMS systems or no PMS: fetch from pms_availability_cache
          const { data: cacheData, error } = await supabase
            .from("pms_availability_cache")
            .select("*")
            .eq("property_id", property.id)
            .gte("date", checkIn)
            .lt("date", checkOut)
            .order("date");
          
          if (error) throw error;
          
          // Build room aliases map: original ID -> [slugified name]
          // This allows matching room IDs like "4" to cache keys like "two-bedroom-suite"
          const roomAliases = new Map<string, string[]>();
          for (const rt of roomTypes) {
            const origId = String(rt.id);
            const slugName = slugifyRoomName(rt.name);
            roomAliases.set(origId, [slugName]);
          }
          
          if (cacheData && cacheData.length > 0) {
            // Transform cache data into availability format with aliases
            availability = transformCacheToAvailability(cacheData, roomAliases);
          } else if (!externalSystem || externalSystem === 'none' || externalSystem === 'roomsonline') {
            // No PMS — check for ROL'OS rate plans first, then wizard rates
            const isRolProperty = !!(property as any).is_rol_property;
            
            // Also detect ROL'OS capability by checking for hfRooms with linked_rolos_id
            let hasLinkedRolos = false;
            if (!isRolProperty && !embedRate) {
              const { data: linkedCheck } = await supabase
                .from("hostfully_room_types")
                .select("id")
                .eq("property_id", property.id)
                .eq("is_active", true)
                .not("linked_rolos_id", "is", null)
                .limit(1);
              hasLinkedRolos = !!(linkedCheck && linkedCheck.length > 0);
              if (hasLinkedRolos) console.log('[Booking] Detected ROL\'OS-linked rooms without is_rol_property flag');
            }
            
            if (isRolProperty || embedRate || hasLinkedRolos) {
              // ROL'OS property or embed with pre-resolved rate: query rate plans
              console.log('[Booking] ROL\'OS property — resolving rates from rolos_rate_plans');
              
              // Fetch room types for this property (hostfully_room_types serves as overview)
              const { data: hfRooms } = await supabase
                .from("hostfully_room_types")
                .select("id, name, linked_rolos_id, daily_rate, max_guests, is_active")
                .eq("property_id", property.id)
                .eq("is_active", true);
              
              // Fetch rate plans via rolos_rate_plan_room_types
              const rolosIds = (hfRooms || []).filter(r => r.linked_rolos_id).map(r => r.linked_rolos_id!);
              let ratePlanMap: Record<string, { base_rate: number; pricing_model: string; adult_1_rate?: number; adult_2_rate?: number }> = {};
              
              if (rolosIds.length > 0) {
                const { data: rpRoomTypes } = await supabase
                  .from("rolos_rate_plan_room_types")
                  .select("room_type_id, rate_plan_id, rolos_rate_plans!inner(id, base_rate, pricing_model, adult_1_rate, adult_2_rate, is_active)")
                  .in("room_type_id", rolosIds)
                  .eq("rolos_rate_plans.is_active", true);
                
                if (rpRoomTypes) {
                  for (const entry of rpRoomTypes) {
                    const plan = (entry as any).rolos_rate_plans;
                    if (plan?.base_rate != null) {
                      ratePlanMap[entry.room_type_id] = {
                        base_rate: Number(plan.base_rate),
                        pricing_model: plan.pricing_model || "per_unit",
                        adult_1_rate: plan.adult_1_rate ? Number(plan.adult_1_rate) : undefined,
                        adult_2_rate: plan.adult_2_rate ? Number(plan.adult_2_rate) : undefined,
                      };
                    }
                  }
                }
              }
              
              // Also honor embed_rate passed via URL (overrides DB lookup for the specific room)
              if (embedRate && preSelectedRoomTypeId) {
                // Find the hfRoom matching the preSelected ID
                const matchedRoom = (hfRooms || []).find(r => r.id === preSelectedRoomTypeId);
                if (matchedRoom?.linked_rolos_id) {
                  ratePlanMap[matchedRoom.linked_rolos_id] = {
                    base_rate: embedRate,
                    pricing_model: embedPricingModel || "per_unit",
                  };
                } else if (embedLinkedRolosId) {
                  ratePlanMap[embedLinkedRolosId] = {
                    base_rate: embedRate,
                    pricing_model: embedPricingModel || "per_unit",
                  };
                }
              }
              
              // Build aliases: map amenities room IDs to hfRoom IDs by name match
              const amenityIdAliases: string[] = [];
              for (const rt of roomTypes) {
                const hfMatch = (hfRooms || []).find((h: any) => h.name === rt.name);
                if (hfMatch && String(rt.id) !== hfMatch.id) {
                  amenityIdAliases.push(String(rt.id));
                }
              }
              
              // Build synthetic availability from resolved rates
              const syntheticRoomTypes = (hfRooms || []).map((room: any) => {
                const rolosPlan = room.linked_rolos_id ? ratePlanMap[room.linked_rolos_id] : null;
                const effectiveRate = room.daily_rate ? Number(room.daily_rate) : (rolosPlan?.base_rate ?? 0);
                const pricingModel = rolosPlan?.pricing_model || "per_unit";
                const isPerPerson = pricingModel === "per_person";
                
                // Collect all IDs that should match this room
                const aliases: string[] = [];
                for (const rt of roomTypes) {
                  if (rt.name === room.name && String(rt.id) !== room.id) {
                    aliases.push(String(rt.id));
                  }
                }
                
                const dailyRates: any[] = [];
                const availArr: any[] = [];
                const currentDate = new Date(checkIn!);
                const end = new Date(checkOut!);
                while (currentDate < end) {
                  const dateStr = currentDate.toISOString().split('T')[0];
                  dailyRates.push({ date: dateStr, room_amount: effectiveRate });
                  availArr.push({ date: dateStr, available_units: 99 });
                  currentDate.setDate(currentDate.getDate() + 1);
                }
                
                return {
                  room_type_id: room.id,
                  room_type_name: room.name,
                  room_type_aliases: aliases,
                  rate_types: [{
                    rate_type_id: 'rolos-rate',
                    rate_type_name: 'Standard Rate',
                    price_type: isPerPerson ? 'PER_PERSON' : 'PER_NIGHT',
                    rates: dailyRates,
                  }],
                  rooms_available_per_night: availArr,
                };
              });
              
              if (syntheticRoomTypes.length > 0 && syntheticRoomTypes.some((rt: any) => rt.rate_types[0].rates[0]?.room_amount > 0)) {
                availability = { room_types: syntheticRoomTypes };
                console.log('[Booking] ROL\'OS synthetic availability:', availability);
              }
            }
            
            // Fallback to wizard rates if ROL'OS didn't produce results
            if (!availability) {
              console.log('[Booking] No PMS - building synthetic availability from wizard rates');
              const wizardRooms = amenities?.room_types || [];
              const seasons = amenities?.seasons || [];
              const seasonRates = amenities?.season_rates || [];
            
              if (wizardRooms.length === 0) {
                console.warn("No wizard room types found for this property");
                setCalculatingCost(false);
                return;
              }
            
            // Fetch manual availability overrides for this date range
            const { data: manualOverrides } = await supabase
              .from("property_availability")
              .select("*")
              .eq("property_id", property.id)
              .gte("date", checkIn)
              .lt("date", checkOut);
            
            // Create a map of blocked dates per room
            const blockedDatesMap = new Map<string, Set<string>>();
            if (manualOverrides && manualOverrides.length > 0) {
              for (const override of manualOverrides) {
                if (override.is_stop_sell || override.available_units === 0) {
                  const roomKey = override.room_type;
                  if (!blockedDatesMap.has(roomKey)) {
                    blockedDatesMap.set(roomKey, new Set());
                  }
                  blockedDatesMap.get(roomKey)!.add(override.date);
                }
              }
            }
            
            // Generate synthetic room types with daily rates
            const pmsRateTypes = amenities?.pms_rate_types || [];
            const syntheticRoomTypes = wizardRooms.map((room: any) => {
              const roomId = room.id || room.room_type_id || `wizard-room-${room.name}`;
              
              // Resolve rate: check linkedRateTypes first, then direct baseRate
              let baseRate = 0;
              let rateUnit = room.rate_unit || room.rateUnit || 'per_night';
              let pricingModel = '';
              let adult1Rate = 0;
              let adult2Rate = 0;
              let childRate = 0;
              let teenRate = 0;
              let infantRate = 0;
              
              if (room.linkedRateTypes?.length > 0 && pmsRateTypes.length > 0) {
                const linkedRT = pmsRateTypes.find((rt: any) => rt.id === room.linkedRateTypes[0]);
                if (linkedRT) {
                  baseRate = linkedRT.baseRate || 0;
                  pricingModel = linkedRT.pricingModel || linkedRT.priceType || '';
                  adult1Rate = linkedRT.adult1Rate || 0;
                  adult2Rate = linkedRT.adult2Rate || 0;
                  childRate = linkedRT.childRate || 0;
                  teenRate = linkedRT.teenRate || 0;
                  infantRate = linkedRT.infantRate || 0;
                  if (pricingModel.toLowerCase().includes('person')) {
                    rateUnit = 'per_person';
                  }
                }
              }
              if (!baseRate) {
                baseRate = room.base_rate || room.baseRate || room.daily_rate || 0;
              }
              
              // Generate daily rates with season adjustments or per-person rates
              const isPerPerson = rateUnit === 'per_person';
              let dailyRates: any[];
              
              if (isPerPerson && (adult1Rate > 0 || adult2Rate > 0)) {
                // Per-person: generate rates with adult/child/teen/infant amounts
                dailyRates = [];
                const currentDate = new Date(checkIn!);
                const end = new Date(checkOut!);
                while (currentDate < end) {
                  const dateStr = currentDate.toISOString().split('T')[0];
                  dailyRates.push({
                    date: dateStr,
                    room_amount: baseRate,
                    adult_amount_1: adult1Rate || baseRate,
                    adult_amount_2: adult2Rate || baseRate * 2,
                    teen_amount: teenRate,
                    child_amount: childRate,
                    infant_amount: infantRate,
                  });
                  currentDate.setDate(currentDate.getDate() + 1);
                }
              } else {
                dailyRates = generateDailyRates(checkIn!, checkOut!, baseRate, seasons, seasonRates, roomId);
              }
              
              // Generate availability, but respect manual blocks
              const blockedDates = blockedDatesMap.get(room.name) || new Set();
              const availabilityArray = [];
              const currentDate2 = new Date(checkIn!);
              const end2 = new Date(checkOut!);
              
              while (currentDate2 < end2) {
                const dateStr = currentDate2.toISOString().split('T')[0];
                availabilityArray.push({
                  date: dateStr,
                  available_units: blockedDates.has(dateStr) ? 0 : 99,
                });
                currentDate2.setDate(currentDate2.getDate() + 1);
              }
              
              return {
                room_type_id: roomId,
                room_type_name: room.name,
                rate_types: [{
                  rate_type_id: 'wizard-rate',
                  rate_type_name: 'Standard Rate',
                  price_type: isPerPerson ? 'PER_PERSON' : (rateUnit === 'per_stay' ? 'PerStay' : 'PER_NIGHT'),
                  rates: dailyRates,
                }],
                rooms_available_per_night: availabilityArray,
              };
            });
            
            availability = { room_types: syntheticRoomTypes };
            console.log('[Booking] Synthetic availability with manual blocks:', availability);
            }
          } else {
            console.warn("No cached availability data found for this property");
            setCalculatingCost(false);
            return;
          }
        }
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
        // Also check room_type_aliases for slugified name matching (e.g., "4" matches "two-bedroom-suite")
        // Debug: log available room types and the room we're trying to match
        console.log('[Booking] Looking for room:', room.roomTypeId, 'in', roomTypesArray.map((rt: any) => rt.room_type_id || rt.roomTypeId));
        
        let roomType = roomTypesArray.find(
          (rt: any) => {
            const rtId = String(rt.room_type_id || rt.roomTypeId);
            // Direct ID match
            if (rtId === room.roomTypeId) return true;
            // Check aliases if available (cache-based matching)
            if (rt.room_type_aliases?.includes(room.roomTypeId)) return true;
            // Forward match: room definition name slugified matches cache ID
            const roomDef = roomTypes.find(r => String(r.id) === room.roomTypeId);
            if (roomDef && slugifyRoomName(roomDef.name) === rtId) return true;
            // Reverse match: cache ID (slugified) matches any room definition
            const reverseMatch = roomTypes.find(r => slugifyRoomName(r.name) === rtId);
            if (reverseMatch && String(reverseMatch.id) === room.roomTypeId) return true;
            return false;
          }
        );
        
        // Fallback: try matching by room name (wizard rooms use wizard-room-{name} IDs)
        if (!roomType) {
          roomType = roomTypesArray.find((rt: any) => {
            const rtName = rt.room_type_name || rt.roomTypeName || '';
            return rtName === room.roomTypeName;
          });
          if (roomType) {
            console.log('[Booking] Room matched by name fallback:', room.roomTypeName);
          }
        }
        
        console.log('[Booking] Room match result:', roomType ? 'found' : 'NOT FOUND');

        if (!roomType) continue;

        // Get rate types array - handle both formats
        const rateTypesArray = roomType.rate_types || roomType.rateTypes || [];
        
        // Find rate type - use flexible matching with fallbacks
        const availableRateTypeIds = rateTypesArray.map((rt: any) => String(rt.rate_type_id || rt.rateTypeId));
        console.log('[Booking] Looking for rate type:', selectedRateType, 'Available:', availableRateTypeIds);
        
        // Step 1: Try exact match with selectedRateType
        let rateType = rateTypesArray.find((rt: any) => {
          const rtId = String(rt.rate_type_id || rt.rateTypeId);
          return rtId === selectedRateType;
        });

        // Step 2: Fallback to universal rate types ('default' or 'per-unit')
        if (!rateType) {
          rateType = rateTypesArray.find((rt: any) => {
            const rtId = String(rt.rate_type_id || rt.rateTypeId);
            return rtId === 'default' || rtId === 'per-unit';
          });
          if (rateType) {
            console.log('[Booking] Using fallback rate type:', String(rateType.rate_type_id || rateType.rateTypeId));
          }
        }

        // Step 3: Last resort - use first available rate type
        if (!rateType && rateTypesArray.length > 0) {
          rateType = rateTypesArray[0];
          console.warn('[Booking] Using first available rate type as last resort:', String(rateType.rate_type_id || rateType.rateTypeId));
        }

        // Safety check: skip this room if no rate type found
        if (!rateType) {
          console.warn('[Booking] No rate type found for room:', room.roomTypeName, '- skipping calculation');
          continue;
        }

        const allRates = rateType.rates || [];
        
        // Filter rates to only include dates within the room's date range
        const rates = allRates.filter((rate: any) => {
          if (!rate.date) return false;
          const rateDate = rate.date;
          // Include rate if it's >= checkIn and < checkOut (nights, not including checkout date)
          return rateDate >= roomCheckIn && rateDate < roomCheckOut;
        });
        
        // Debug: Log when rates filter to empty (common failure point)
        if (rates.length === 0 && allRates.length > 0) {
          console.warn('[Booking] No rates found for date range:', roomCheckIn, 'to', roomCheckOut);
          console.warn('[Booking] Available rate dates:', allRates.slice(0, 10).map((r: any) => r.date));
        }
        
        // Handle both snake_case and camelCase for priceType
        const priceType = (rateType.price_type || rateType.priceType || 'PER ROOM').toUpperCase();
        const roomTotalGuests = room.numberOfAdults + room.numberOfTeens + room.numberOfChildren + room.numberOfInfants;

        // UnitRate from HotelBeds means per-room pricing, PER_NIGHT from Hostfully is also per-room
        if (priceType === 'PER ROOM' || priceType === 'PERROOM' || priceType === 'UNITRATE' || priceType === 'PER_NIGHT' || priceType === 'PER NIGHT') {
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
            // Also handle nested adult_amounts object (HotelBeds) or flat structure (Benson)
            const adultAmounts = rate.adult_amounts || {};
            const adultAmount1 = adultAmounts.adult_amount_1 || rate.adult_amount_1 || rate.adultAmount1 || rate.adult_amount || rate.adultAmount || 0;
            const adultAmount2 = adultAmounts.adult_amount_2 || rate.adult_amount_2 || rate.adultAmount2 || rate.adult_amount || rate.adultAmount || 0;
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

      // Fallback: if total is 0 but wizard amenities have base_rate, compute simple rate × nights
      if (runningTotal === 0 && rooms.length > 0 && property) {
        const amenitiesData = property.amenities as Record<string, any> | null;
        const wizardRooms = amenitiesData?.room_types || [];
        const pmsRateTypes = amenitiesData?.pms_rate_types || [];
        
        for (const room of rooms) {
          const roomCheckIn = room.checkIn || checkIn;
          const roomCheckOut = room.checkOut || checkOut;
          const roomNights = roomCheckIn && roomCheckOut 
            ? Math.ceil((new Date(roomCheckOut).getTime() - new Date(roomCheckIn).getTime()) / (1000 * 60 * 60 * 24))
            : nights;
          
          // Find wizard room by ID or name
          const wizRoom = wizardRooms.find((wr: any) => 
            (wr.id || wr.room_type_id) === room.roomTypeId || wr.name === room.roomTypeName
          );
          
          if (wizRoom) {
            // Check linked rate types first
            let baseRate = 0;
            if (wizRoom.linkedRateTypes?.length > 0) {
              const linkedRT = pmsRateTypes.find((rt: any) => rt.id === wizRoom.linkedRateTypes[0]);
              if (linkedRT?.baseRate) baseRate = linkedRT.baseRate;
            }
            if (!baseRate) {
              baseRate = wizRoom.baseRate || wizRoom.base_rate || wizRoom.daily_rate || 0;
            }
            
            if (baseRate > 0 && roomNights > 0) {
              const total = baseRate * roomNights;
              lineItems.push({
                description: `${room.roomTypeName} (${room.numberOfAdults + room.numberOfTeens + room.numberOfChildren + room.numberOfInfants} guests)`,
                nights: roomNights,
                quantity: 1,
                unitPrice: baseRate,
                total,
              });
              runningTotal += total;
              console.log('[Booking] Fallback rate applied:', room.roomTypeName, baseRate, '×', roomNights, '=', total);
            }
          }
        }
      }

      // Apply property charges (taxes, fees, deposits, surcharges)
      if (propertyCharges && propertyCharges.length > 0 && runningTotal > 0) {
        const totalAdults = rooms.reduce((s, r) => s + r.numberOfAdults, 0);
        const totalChildren = rooms.reduce((s, r) => s + r.numberOfChildren, 0);
        const totalInfants = rooms.reduce((s, r) => s + r.numberOfInfants, 0);
        const chargeContext: ChargeCalculationContext = {
          subtotal: runningTotal,
          nights: nights,
          rooms: rooms.length,
          adults: totalAdults,
          children: totalChildren,
          infants: totalInfants,
          roomTypeId: rooms[0]?.roomTypeId,
          rateTypeId: selectedRateType || undefined,
        };
        const calculatedCharges = calculateCharges(propertyCharges, chargeContext);
        for (const cc of calculatedCharges) {
          const label = cc.charge.is_refundable
            ? `${cc.charge.name} (refundable)`
            : cc.charge.name;
          lineItems.push({
            description: label,
            nights: 0,
            quantity: 1,
            unitPrice: cc.calculatedAmount,
            total: cc.calculatedAmount,
            isRefundable: cc.charge.is_refundable,
          });
          runningTotal += cc.calculatedAmount;
        }
        console.log('[Booking] Applied', calculatedCharges.length, 'property charges, new total:', runningTotal);
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
  }, [property?.id, rooms, selectedRateType, checkIn, checkOut, propertyCharges]);

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

  // Voucher validation handler
  const handleApplyVoucher = async () => {
    if (!voucher.trim() || !property?.id) return;
    setVoucherStatus("loading");
    setVoucherResult(null);
    setVoucherDiscount(0);

    try {
      const accommodationSubtotal = costBreakdown
        .filter(i => i.nights > 0)
        .reduce((s, i) => s + i.total, 0) || totalCost;

      const { data, error } = await supabase.functions.invoke("validate-voucher", {
        body: {
          code: voucher.trim(),
          property_id: property.id,
          subtotal: accommodationSubtotal,
        },
      });

      if (error) throw error;

      if (data?.valid) {
        setVoucherStatus("valid");
        setVoucherResult(data as VoucherResult);
        setVoucherDiscount(data.discount_amount || 0);
        toast.success(`Voucher applied: ${data.discount_type === 'percentage' ? `${data.discount_value}% off` : `R ${data.discount_value} off`}`);
      } else {
        setVoucherStatus("invalid");
        setVoucherResult({ reason: data?.reason, discount_type: "percentage", discount_value: 0, discount_amount: 0, conditions: {} });
        setVoucherDiscount(0);
      }
    } catch (err) {
      console.error("Voucher validation error:", err);
      setVoucherStatus("invalid");
      setVoucherResult({ reason: "Failed to validate voucher", discount_type: "percentage", discount_value: 0, discount_amount: 0, conditions: {} });
      setVoucherDiscount(0);
    }
  };

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
  const adjustGuestCount = (roomIndex: number, field: 'numberOfAdults' | 'numberOfTeens' | 'numberOfChildren' | 'numberOfInfants' | 'numberOfPets', delta: number) => {
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
        throw new Error(`At least one ${accommodationLabel.singular.toLowerCase()} is required`);
      }

      // Use calculated total cost or pre-selected total
      // CRITICAL: Ensure we have a valid price (except for explicitly free bookings)
      let totalPrice = totalCost || preSelectedTotalCost || 0;
      
      // If price is 0 but we have availability data, something went wrong with calculation
      // Try to calculate a fallback price from the availability data
      if (totalPrice === 0 && availabilityData) {
        console.warn('Price is 0 but availability data exists - calculating fallback...');
        const roomTypesArray = availabilityData?.room_types || [];
        let fallbackPrice = 0;
        
        for (const room of rooms) {
          const roomType = roomTypesArray.find((rt: any) => String(rt.room_type_id) === room.roomTypeId);
          if (roomType?.rate_types) {
            // Try selected rate type first, then fall back to first rate type
            const rateType = roomType.rate_types.find((rt: any) => String(rt.rate_type_id) === selectedRateType) 
              || roomType.rate_types[0];
            if (rateType?.rates) {
              const roomCheckIn = room.checkIn || checkIn;
              const roomCheckOut = room.checkOut || checkOut;
              rateType.rates.forEach((rate: any) => {
                if (rate.date >= roomCheckIn && rate.date < roomCheckOut) {
                  fallbackPrice += rate.room_amount || 0;
                }
              });
            }
          }
        }
        
        if (fallbackPrice > 0) {
          console.log('Using fallback price:', fallbackPrice);
          totalPrice = fallbackPrice;
        }
      }

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
        pets: rooms.reduce((sum, r) => sum + r.numberOfPets, 0),
        total_price: Math.max(0, totalPrice + selectedAddons.reduce((s, a) => s + a.total, 0) - voucherDiscount),
        status: 'pending',
      } as any;

      // Add new columns (not yet in generated types)
      bookingData.teens = rooms.reduce((sum: number, r: RoomBooking) => sum + r.numberOfTeens, 0);
      bookingData.room_type_id = rooms[0]?.roomTypeId || null;
      bookingData.rate_type_id = selectedRateType;
      bookingData.voucher = voucher || null;
      bookingData.guest_nationality = guestNationality || null;

      // Snapshot charges breakdown for the booking record
      if (propertyCharges && propertyCharges.length > 0) {
        const totalAdults = rooms.reduce((s, r) => s + r.numberOfAdults, 0);
        const totalChildren = rooms.reduce((s, r) => s + r.numberOfChildren, 0);
        const totalInfants = rooms.reduce((s, r) => s + r.numberOfInfants, 0);
        const chargeItems = costBreakdown.filter(i => i.nights === 0);
        const accommodationSubtotal = totalPrice - chargeItems.reduce((s, i) => s + i.total, 0);
        const chargeCtx: ChargeCalculationContext = {
          subtotal: accommodationSubtotal > 0 ? accommodationSubtotal : totalPrice,
          nights,
          rooms: rooms.length,
          adults: totalAdults,
          children: totalChildren,
          infants: totalInfants,
          roomTypeId: rooms[0]?.roomTypeId,
          rateTypeId: selectedRateType || undefined,
        };
        const snapshotCharges = calculateCharges(propertyCharges, chargeCtx);
        if (snapshotCharges.length > 0) {
          bookingData.charges_breakdown = snapshotCharges.map(cc => ({
            name: cc.charge.name,
            category: cc.charge.category,
            calculation_method: cc.charge.calculation_method,
            amount: cc.calculatedAmount,
            is_refundable: cc.charge.is_refundable,
            breakdown: cc.breakdown,
          }));
        }
      }
      
      // For HotelBeds, include the rate_key in rooms array for push-booking to extract
      const pmsSystem = property?.external_system?.toLowerCase();
      const roomsWithRateKey = rooms.map((room) => {
        const roomData = { ...room } as any;
        if (pmsSystem === 'hotelbeds' && availabilityData?.room_types) {
          const roomType = availabilityData.room_types.find(
            (rt: any) => String(rt.room_type_id) === room.roomTypeId
          );
          const rateType = roomType?.rate_types?.find(
            (rt: any) => String(rt.rate_type_id) === selectedRateType
          );
          if (rateType?.rate_key) {
            roomData.rate_key = rateType.rate_key;
          }
        }
        return roomData;
      });
      bookingData.rooms = roomsWithRateKey;

      // DEDUPLICATION: Check for existing pending booking for same property/dates/email
      // to prevent orphaned pending records on retry
      const { data: existingPending } = await supabase
        .from('bookings')
        .select('id')
        .eq('property_id', property!.id)
        .eq('check_in_date', checkIn)
        .eq('check_out_date', checkOut)
        .eq('guest_email', guestEmail)
        .eq('status', 'pending')
        .eq('payment_status', 'pending')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let data;
      if (existingPending) {
        console.log('[Booking] Reusing existing pending booking:', existingPending.id);
        // Update the existing pending booking with latest data
        const { data: updated, error: updateError } = await supabase
          .from('bookings')
          .update({
            ...bookingData,
            status: 'pending', // keep pending
          })
          .eq('id', existingPending.id)
          .select()
          .single();
        if (updateError) throw updateError;
        data = updated;
      } else {
        const { data: inserted, error: insertError } = await supabase
          .from('bookings')
          .insert(bookingData)
          .select()
          .single();
        if (insertError) throw insertError;
        data = inserted;
      }

      // --- PAYMENT GATE ---
      // All bookings use PayFast onsite modal (stays in ROL UI)
      // The ITN handler in payfast-api will trigger push-booking after successful payment
      
      console.log('[Booking] Created booking, opening payment modal:', data.id);
      
      // Return booking data - payment modal will be triggered in onSuccess
      return { 
        ...data, 
        requiresPayment: true,
        paymentAmount: data.total_price,
      };
    },
    onSuccess: (data) => {
      // Open payment modal for onsite payment
      if (data.requiresPayment) {
        setPendingBookingId(data.id);
        setPendingPaymentAmount(data.paymentAmount);
        setShowPaymentModal(true);
        return;
      }
      
      // Fallback: direct navigation (shouldn't happen with payment gate)
      toast.success("Booking request submitted successfully!");
      const confirmParams = new URLSearchParams();
      if (integrationParam) confirmParams.set("integration", integrationParam);
      navigate(`/booking-confirmation/${data.id}${confirmParams.toString() ? `?${confirmParams.toString()}` : ""}`);
    },
    onError: (error) => {
      const message = error instanceof Error ? error.message : "Failed to create booking";
      
      // Special handling for availability errors (RULE #1: PMS is source of truth)
      if (message.includes('AVAILABILITY_CHANGED')) {
        // Show date re-selection dialog instead of just a toast
        setShowDateReselectDialog(true);
      } else {
        toast.error(message);
      }
    },
  });
  
  // Handler for date re-selection after availability error
  const handleDateReselection = () => {
    if (pendingCheckIn && pendingCheckOut) {
      // Update form state with new dates
      setCheckIn(format(pendingCheckIn, "yyyy-MM-dd"));
      setCheckOut(format(pendingCheckOut, "yyyy-MM-dd"));
      
      // Close dialog
      setShowDateReselectDialog(false);
      
      // Clear pending dates
      setPendingCheckIn(undefined);
      setPendingCheckOut(undefined);
      
      // Reset cost calculation to trigger recalculation
      setTotalCost(0);
      setCostBreakdown([]);
      
      // Show success toast
      toast.success("Dates updated! Please review the new pricing and try again.");
    }
  };

  // Layout wrapper — white-label for integration flows or brand-override properties
  const propertyLogoUrl = property?.brand_logo_url || (property?.amenities as any)?.brand_logo_url || null;
  const isWhiteLabel = isIntegration || Boolean(property?.brand_override_enabled);
  const wrapLayout = useCallback((children: React.ReactNode) =>
    isWhiteLabel ? (
      <WhiteLabelLayout propertyName={property?.name} propertyLogoUrl={propertyLogoUrl}>
        {children}
      </WhiteLabelLayout>
    ) : (
      <PublicLayout
        backLabel="Back to Property"
        backTo={property ? `/property/${property.slug || property.id}` : "/"}
        hideJourneyBuilder
      >
        {children}
      </PublicLayout>
    ), [isWhiteLabel, property?.name, propertyLogoUrl, property?.slug, property?.id]);

  if (isLoading || !brandReady) {
    return (
      wrapLayout(
        <div className="container mx-auto px-4 py-12">
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-96 w-full rounded-lg" />
        </div>
      )
    );
  }

  if (!property) {
    return (
      wrapLayout(
        <div className="container mx-auto px-4 py-24 text-center">
          <h1 className="font-display text-2xl sm:text-3xl mb-4">Property Not Found</h1>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            The property you're looking for doesn't exist or is no longer available.
          </p>
          <Button asChild>
            <Link to="/">Return to Home</Link>
          </Button>
        </div>
      )
    );
  }

  // NightsBridge uses its own iframe-based booking flow - redirect if somehow landed here
  const externalSystem = property.external_system?.toLowerCase();
  if (externalSystem === 'nightsbridge') {
    return (
      wrapLayout(
        <div className="container mx-auto px-4 py-24 text-center">
          <AlertCircle className="h-16 w-16 text-muted-foreground/30 mx-auto mb-6" />
          <h1 className="font-display text-2xl sm:text-3xl mb-4">NightsBridge Booking</h1>
          <p className="text-muted-foreground mb-8 max-w-md mx-auto">
            This property uses NightsBridge for bookings. Please use the property page to book.
          </p>
          <Button asChild>
            <Link to={`/property/${property.slug || property.id}`}>Go to Property Page</Link>
          </Button>
        </div>
      )
    );
  }

  // Success state
  if (bookingSuccess) {
    // Check if there are per-room custom dates
    const hasMultipleRoomDates = rooms.some(room => room.checkIn && room.checkOut && (room.checkIn !== checkIn || room.checkOut !== checkOut));
    
    return (
      wrapLayout(
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
              <Button onClick={() => {
                if (isIntegration) {
                  window.close();
                } else {
                  navigate("/");
                }
              }} className="w-full sm:w-auto">
                {isIntegration ? "Close" : "Return to Home"}
              </Button>
            </CardContent>
          </Card>
        </div>
      )
    );
  }

  // Get property image for header
  const propertyImages = Array.isArray(property.images) ? property.images : [];
  const firstImage = propertyImages.length > 0
    ? (typeof propertyImages[0] === 'string' ? propertyImages[0] : (propertyImages[0] as any)?.url)
    : null;

  const STEPS = [
    { number: 1, label: "Your Stay" },
    { number: 2, label: "Your Details" },
    { number: 3, label: "Payment" },
  ];

  // Determine current step based on form state
  const currentStep = isFormValid ? 3 : (rooms.length > 0 ? 2 : 1);

  return (
    wrapLayout(
      <><div className="container mx-auto px-3 sm:px-4 py-6 sm:py-10 max-w-2xl">
        {/* Fluent Step Indicator */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <FluentStepIndicator steps={STEPS} currentStep={currentStep} />
        </motion.div>

        {/* Property Header */}
        <FluentBookingHeader
          propertyName={property.name}
          propertyImage={firstImage}
          location={[property.city, property.country].filter(Boolean).join(", ")}
          checkIn={checkIn}
          checkOut={checkOut}
          totalGuests={totalGuests}
          rooms={rooms.length}
          className="mb-6"
        />

        <div className="space-y-6 pb-32 lg:pb-6">
          {/* ── Step 1: Your Stay (Room Summary) ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">1</span>
              <h3 className="font-medium">Your Stay</h3>
            </div>

            {/* Date Picker — always available for editing */}
            <div className={cn(
              "rounded-xl border p-4 space-y-3",
              checkIn && checkOut ? "border-border/50 bg-card" : "border-primary/30 bg-primary/5"
            )}>
              <div className="flex items-center gap-2 text-sm font-medium text-primary">
                <CalendarDays className="h-4 w-4" />
                {checkIn && checkOut ? "Your dates" : "Select your dates"}
              </div>
              <Button
                variant="outline"
                className="w-full justify-start text-left font-normal"
                onClick={() => setDatePickerOpen(true)}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {checkIn && checkOut ? (
                  <>{format(parseISO(checkIn), "d MMM yyyy")} – {format(parseISO(checkOut), "d MMM yyyy")}</>
                ) : (
                  <span className="text-muted-foreground">Pick check-in & check-out dates</span>
                )}
                {checkIn && checkOut && (
                  <span className="ml-auto text-xs text-primary font-medium">Change</span>
                )}
              </Button>
              <BottomSheetDatePicker
                open={datePickerOpen}
                onOpenChange={setDatePickerOpen}
                checkIn={checkIn ? parseISO(checkIn) : null}
                checkOut={checkOut ? parseISO(checkOut) : null}
                onDatesChange={(ci, co) => {
                  setCheckIn(format(ci, "yyyy-MM-dd"));
                  setCheckOut(format(co, "yyyy-MM-dd"));
                  setDatePickerOpen(false);
                }}
                availabilityMap={calendarAvailability}
              />
              {checkIn && !checkOut && (
                <p className="text-xs text-muted-foreground">Now select your check-out date</p>
              )}
            </div>

            {/* Rate type is determined by room type — not guest-selectable */}

            {/* Room Cards */}
            {rooms.map((room, index) => {
              const roomType = roomTypes.find(rt => String(rt.id) === room.roomTypeId);
              const maxGuestsForRoom = roomType?.maxGuests || roomType?.maxPeople || 10;
              const allowTeens = roomType?.allowTeens !== false;
              const allowChildren = roomType?.allowChildren !== false;
              const allowInfants = roomType?.allowInfants !== false;
              const currentRoomTotal = room.numberOfAdults + room.numberOfTeens + room.numberOfChildren + room.numberOfInfants;
              const isAtMaxCapacity = currentRoomTotal >= maxGuestsForRoom;
              const roomCheckIn = room.checkIn || checkIn;
              const roomCheckOut = room.checkOut || checkOut;

              return (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, x: 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="rounded-xl border border-border/50 bg-card p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-sm">{roomType?.name || room.roomTypeName || `${accommodationLabel.singular} ${index + 1}`}</h4>
                      {roomCheckIn && roomCheckOut && (
                        <span className="text-xs text-muted-foreground">
                          {format(parseISO(roomCheckIn), "d MMM")} – {format(parseISO(roomCheckOut), "d MMM yyyy")}
                          {room.checkIn && room.checkOut && (room.checkIn !== checkIn || room.checkOut !== checkOut) && (
                            <span className="text-primary ml-1">(custom dates)</span>
                          )}
                        </span>
                      )}
                    </div>
                    {rooms.length > 1 && (
                      <Button variant="ghost" size="sm" onClick={() => removeRoom(index)} className="text-destructive hover:text-destructive text-xs h-7">
                        Remove
                      </Button>
                    )}
                  </div>

                  {/* Room Type Selection (if multiple) */}
                  {roomTypes.length > 1 && (
                    <Select value={room.roomTypeId} onValueChange={(v) => updateRoom(index, 'roomTypeId', v)}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue placeholder={`Select ${accommodationLabel.singular.toLowerCase()} type`} />
                      </SelectTrigger>
                      <SelectContent>
                        {roomTypes.map((rt) => (
                          <SelectItem key={rt.id} value={String(rt.id)}>
                            {rt.name} {rt.maxGuests ? `(Max ${rt.maxGuests})` : ''}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Guest Steppers (Fluent style) */}
                  <div className="divide-y divide-border/30">
                    <GuestCountStepper
                      label="Adults"
                      sublabel="Ages 13+"
                      value={room.numberOfAdults}
                      min={1}
                      max={isAtMaxCapacity ? room.numberOfAdults : maxGuestsForRoom}
                      onChange={(v) => {
                        const newRooms = [...rooms];
                        newRooms[index] = { ...newRooms[index], numberOfAdults: v };
                        setRooms(newRooms);
                      }}
                    />
                    {allowTeens && (
                      <GuestCountStepper
                        label="Teens"
                        sublabel="Ages 13-17"
                        value={room.numberOfTeens}
                        max={isAtMaxCapacity ? room.numberOfTeens : maxGuestsForRoom - currentRoomTotal + room.numberOfTeens}
                        onChange={(v) => {
                          const newRooms = [...rooms];
                          newRooms[index] = { ...newRooms[index], numberOfTeens: v };
                          setRooms(newRooms);
                        }}
                      />
                    )}
                    {allowChildren && (
                      <GuestCountStepper
                        label="Children"
                        sublabel="Ages 2-12"
                        value={room.numberOfChildren}
                        max={isAtMaxCapacity ? room.numberOfChildren : maxGuestsForRoom - currentRoomTotal + room.numberOfChildren}
                        onChange={(v) => {
                          const newRooms = [...rooms];
                          newRooms[index] = { ...newRooms[index], numberOfChildren: v };
                          setRooms(newRooms);
                        }}
                      />
                    )}
                    {allowInfants && (
                      <GuestCountStepper
                        label="Infants"
                        sublabel="Under 2"
                        value={room.numberOfInfants}
                        max={isAtMaxCapacity ? room.numberOfInfants : maxGuestsForRoom - currentRoomTotal + room.numberOfInfants}
                        onChange={(v) => {
                          const newRooms = [...rooms];
                          newRooms[index] = { ...newRooms[index], numberOfInfants: v };
                          setRooms(newRooms);
                        }}
                      />
                    )}
                    {(amenities?.pets_allowed || roomType?.allowPets) && (
                      <GuestCountStepper
                        label="Pets"
                        sublabel="Service animals always welcome"
                        value={room.numberOfPets}
                        max={4}
                        onChange={(v) => {
                          const newRooms = [...rooms];
                          newRooms[index] = { ...newRooms[index], numberOfPets: v };
                          setRooms(newRooms);
                        }}
                      />
                    )}
                  </div>
                </motion.div>
              );
            })}

            <Button variant="outline" size="sm" onClick={addRoom} className="text-xs">
              <Plus className="h-3 w-3 mr-1" /> Add another {accommodationLabel.singular.toLowerCase()}
            </Button>
          </motion.div>

          {/* ── Extras & Add-ons ── */}
          {(property?.amenities as any)?.addons?.length > 0 && checkIn && checkOut && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
            >
              <AddOnSelector
                addons={(property.amenities as any).addons}
                nights={nights}
                guests={totalGuests}
                selectedAddons={selectedAddons}
                onSelectionChange={setSelectedAddons}
              />
            </motion.div>
          )}

          {/* ── Step 2: Your Details ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">2</span>
              <h3 className="font-medium">Your Details</h3>
            </div>

            <FluentGuestForm
              guestName={guestName}
              guestEmail={guestEmail}
              guestPhone={guestPhone}
              guestNationality={guestNationality}
              specialRequests={specialRequests}
              voucher={voucher}
              onNameChange={setGuestName}
              onEmailChange={setGuestEmail}
              onPhoneChange={setGuestPhone}
              onNationalityChange={setGuestNationality}
              onSpecialRequestsChange={setSpecialRequests}
              onVoucherChange={(v) => {
                setVoucher(v);
                // Reset voucher state when code changes
                if (voucherStatus !== "idle") {
                  setVoucherStatus("idle");
                  setVoucherResult(null);
                  setVoucherDiscount(0);
                }
              }}
              onBlur={() => setGuestDetails({ name: guestName, email: guestEmail, phone: guestPhone })}
              errors={formErrors}
              showVoucher
              voucherStatus={voucherStatus}
              voucherResult={voucherResult}
              onApplyVoucher={handleApplyVoucher}
            />
          </motion.div>

          {/* ── Step 3: Payment Summary ── */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="space-y-3"
          >
            <div className="flex items-center gap-2">
              <span className="h-6 w-6 rounded-full bg-primary text-primary-foreground text-xs font-semibold flex items-center justify-center">3</span>
              <h3 className="font-medium">Payment</h3>
            </div>

            <div className="rounded-xl border border-border/50 bg-card p-4 space-y-3">
              {calculatingCost ? (
                <div className="flex items-center justify-center py-6">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Calculating price...</span>
                </div>
              ) : costBreakdown.length > 0 ? (
                <>
                  {costBreakdown.map((item, idx) => {
                    const isCharge = item.nights === 0;
                    const prevItem = idx > 0 ? costBreakdown[idx - 1] : null;
                    const showDivider = isCharge && prevItem && prevItem.nights > 0;
                    return (
                      <div key={idx}>
                        {showDivider && (
                          <div className="border-t border-border/30 my-2 pt-2">
                            <p className="text-xs font-medium text-muted-foreground mb-1">Taxes & Fees</p>
                          </div>
                        )}
                        <div className="flex justify-between text-sm">
                          <div>
                            <p className="text-foreground">{item.description}</p>
                            {!isCharge && (
                              <p className="text-xs text-muted-foreground">
                                {item.nights} night{item.nights !== 1 ? "s" : ""} × <FormattedPrice amount={item.unitPrice} />
                              </p>
                            )}
                          </div>
                          <span className="font-medium"><FormattedPrice amount={item.total} /></span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Voucher discount line */}
                  {voucherDiscount > 0 && voucherResult && (
                    <div className="border-t border-dashed border-border/30 pt-2">
                      <div className="flex justify-between text-sm">
                        <div>
                          <p className="text-green-600 font-medium">
                            Voucher: {voucher.toUpperCase()} ({voucherResult.discount_type === "percentage" ? `-${voucherResult.discount_value}%` : `- R ${voucherResult.discount_value}`})
                          </p>
                          {voucherResult.conditions?.non_refundable && (
                            <p className="text-xs text-amber-600">⚠️ This booking is non-refundable</p>
                          )}
                        </div>
                        <span className="font-medium text-green-600">- <FormattedPrice amount={voucherDiscount} /></span>
                      </div>
                    </div>
                  )}

                  {/* Add-on line items */}
                  {selectedAddons.length > 0 && (
                    <div className="border-t border-dashed border-border/30 pt-2 space-y-1">
                      {selectedAddons.map((sa, idx) => (
                        <div key={idx} className="flex justify-between text-sm">
                          <p className="text-foreground">{sa.addon.name} × {sa.quantity}</p>
                          <span className="font-medium"><FormattedPrice amount={sa.total} /></span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* VAT breakdown */}
                  {(() => {
                    const grandTotal = Math.max(0, totalCost + selectedAddons.reduce((s, a) => s + a.total, 0) - voucherDiscount);
                    // Refundable deposits are excluded from VAT
                    const refundableDepositTotal = costBreakdown
                      .filter(item => item.isRefundable)
                      .reduce((s, item) => s + item.total, 0);
                    const vatableAmount = Math.max(0, grandTotal - refundableDepositTotal);
                    if (vatConfig.isVat && grandTotal > 0) {
                      const vatRate = vatConfig.rate / 100;
                      const exclAmount = vatableAmount / (1 + vatRate);
                      const vatAmount = vatableAmount - exclAmount;
                      return (
                        <div className="border-t border-border/50 pt-3 space-y-1">
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>Subtotal (excl. VAT)</span>
                            <span><FormattedPrice amount={exclAmount + refundableDepositTotal} /></span>
                          </div>
                          <div className="flex justify-between text-sm text-muted-foreground">
                            <span>VAT ({vatConfig.rate}%)</span>
                            <span><FormattedPrice amount={vatAmount} /></span>
                          </div>
                          {refundableDepositTotal > 0 && (
                            <p className="text-[10px] text-muted-foreground">
                              Refundable deposits excluded from VAT
                            </p>
                          )}
                          {vatConfig.number && (
                            <p className="text-[10px] text-muted-foreground">VAT No: {vatConfig.number}</p>
                          )}
                          <div className="flex justify-between items-center pt-1">
                            <span className="font-semibold">Total (incl. VAT)</span>
                            <span className="text-xl font-bold"><FormattedPrice amount={grandTotal} /></span>
                          </div>
                        </div>
                      );
                    }
                    return (
                      <div className="border-t border-border/50 pt-3 flex justify-between items-center">
                        <span className="font-semibold">Total</span>
                        <span className="text-xl font-bold"><FormattedPrice amount={grandTotal} /></span>
                      </div>
                    );
                  })()}
                </>
              ) : (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total</span>
                  <span className="text-xl font-bold">
                    {preSelectedTotalCost !== null
                      ? <FormattedPrice amount={preSelectedTotalCost} />
                      : totalCost > 0
                      ? <FormattedPrice amount={totalCost} />
                      : 'On request'}
                  </span>
                </div>
              )}
              {costBreakdown.length === 0 && preSelectedTotalCost === null && totalCost === 0 && (
                <p className="text-xs text-muted-foreground">
                  Final price will be confirmed by the property
                </p>
              )}
            </div>
          </motion.div>
        </div>

        {/* ── Cancellation Policy Info ── */}
        {property && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto mt-4"
          >
            <div className="rounded-lg border border-border/50 bg-card p-3">
              <div className="flex items-start gap-2">
                <svg className="h-4 w-4 text-primary mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
                <div>
                  <p className="text-xs font-medium">Cancellation Policy</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {(property as any)?.amenities?.cancellation_policy || "Contact property for cancellation terms"}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeGateways.length > 1 && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto mt-4"
          >
            <PaymentMethodSelector
              gateways={activeGateways}
              selected={effectiveGateway}
              onSelect={setSelectedGateway}
            />
          </motion.div>
        )}

        {/* ── Sticky Footer CTA ── */}
        <div className="fixed bottom-0 left-0 right-0 lg:static lg:mt-6 border-t lg:border-t-0 border-border p-3 sm:p-4 bg-card/98 pb-[calc(0.75rem+env(safe-area-inset-bottom))] lg:pb-4 z-40">
          <div className="max-w-2xl mx-auto">
            <Button
              onClick={() => createBookingMutation.mutate()}
              disabled={createBookingMutation.isPending || !isFormValid}
              className="w-full h-12 text-base font-medium rounded-xl gap-2"
            >
              {createBookingMutation.isPending ? (
                <>
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <CreditCard className="h-5 w-5" />
                  Confirm & Pay {totalCost > 0 ? <FormattedPrice amount={Math.max(0, totalCost - voucherDiscount)} /> : (preSelectedTotalCost ? <FormattedPrice amount={preSelectedTotalCost} /> : '')}
                </>
              )}
            </Button>
            <div className="flex items-center justify-center gap-2 mt-2 text-[10px] sm:text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              <span>Secured payment · 256-bit SSL</span>
            </div>
            {createBookingMutation.isError && (
              <div className="flex items-center gap-2 text-sm text-destructive bg-destructive/10 p-3 rounded-lg mt-3">
                <AlertCircle className="h-4 w-4" />
                <span>Please check the form for errors</span>
              </div>
            )}
          </div>
        </div>
      </div>
      
      {/* Date Re-selection Dialog (shown on AVAILABILITY_CHANGED error) */}
      <Dialog open={showDateReselectDialog} onOpenChange={setShowDateReselectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Dates No Longer Available
            </DialogTitle>
            <DialogDescription>
              The dates you selected are no longer available. Please choose new dates to continue with your booking.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label className="text-sm font-medium">Check-in</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {pendingCheckIn ? format(pendingCheckIn, "MMM d, yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50 bg-background" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={pendingCheckIn}
                      onSelect={setPendingCheckIn}
                      disabled={(date) => date < new Date()}
                      className="pointer-events-auto"
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium">Check-out</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal">
                      <CalendarDays className="mr-2 h-4 w-4" />
                      {pendingCheckOut ? format(pendingCheckOut, "MMM d, yyyy") : "Select date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0 z-50 bg-background" align="start">
                    <CalendarComponent
                      mode="single"
                      selected={pendingCheckOut}
                      onSelect={setPendingCheckOut}
                      disabled={(date) => !pendingCheckIn || date <= pendingCheckIn}
                      className="pointer-events-auto"
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setShowDateReselectDialog(false)}>Cancel</Button>
            <Button onClick={handleDateReselection} disabled={!pendingCheckIn || !pendingCheckOut}>Update Dates</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Gateway */}
      <PaymentGatewayRouter
        gateway={effectiveGateway}
        isOpen={showPaymentModal}
        onClose={() => { setShowPaymentModal(false); setPendingBookingId(null); }}
        onPaymentSuccess={() => {
          setShowPaymentModal(false);
          if (pendingBookingId) {
            const cp = new URLSearchParams({ payment: "success" });
            if (integrationParam) cp.set("integration", integrationParam);
            navigate(`/booking-confirmation/${pendingBookingId}?${cp.toString()}`);
          }
        }}
        onPaymentCancelled={() => {
          setShowPaymentModal(false);
          toast.info("Payment cancelled. Your booking is saved - you can pay later.");
        }}
        onPaymentInitiated={() => setShowPaymentModal(false)}
        bookingId={pendingBookingId || ""}
        amount={pendingPaymentAmount}
        propertyName={property?.name || ""}
        propertyId={property?.id}
        isSandbox={true}
      />
      </>)
  );
};

export default Booking;