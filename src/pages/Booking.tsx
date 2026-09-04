import { useParams, useSearchParams, Link, useNavigate } from "react-router-dom";
import { AnnouncementBanner } from "@/components/showcase/AnnouncementBanner";
import { SpecialsBanner } from "@/components/showcase/SpecialsBanner";
import { PackageCards } from "@/components/showcase/PackageCards";
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
import { Calendar, Users, ArrowLeft, Minus, Plus, Loader2, CheckCircle, AlertCircle, Info, CalendarDays, PawPrint, CreditCard, Lock, ChevronRight, BedDouble, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { ShowcaseAvailabilityCalendar } from "@/components/showcase/ShowcaseAvailabilityCalendar";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { format, parseISO, differenceInDays, addDays } from "date-fns";
import { getPropertyUrl } from "@/lib/config";
import { getAccommodationLabel } from "@/lib/accommodationLabels";
import { cn } from "@/lib/utils";
import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { FormattedPrice } from "@/components/FormattedPrice";
import { useItinerary } from "@/contexts/ItineraryContext";
import { usePropertyPaymentMode } from "@/hooks/usePropertyPaymentMode";
import { resolveReservationTerms, type HouseRulesDepositBlock } from "@/lib/reservationTerms";
import { reservationHoldExpiry } from "@/lib/paymentMode";
import { ReservationPaymentNotice } from "@/components/booking/ReservationPaymentNotice";
import { PaymentGatewayRouter } from "@/components/booking/PaymentGatewayRouter";
import { PaymentMethodSelector } from "@/components/booking/PaymentMethodSelector";
import { useActivePaymentGateways } from "@/hooks/useActivePaymentGateway";
import type { PaymentGateway } from "@/hooks/useActivePaymentGateway";
import { motion, AnimatePresence } from "framer-motion";
import { TobiJourneyAssistant } from "@/components/booking/TobiJourneyAssistant";
import { BottomSheetDatePicker } from "@/components/booking/BottomSheetDatePicker";
import { FluentStepIndicator } from "@/components/booking/FluentStepIndicator";
import { FluentBookingHeader } from "@/components/booking/FluentBookingHeader";
import { FluentGuestForm } from "@/components/booking/FluentGuestForm";
import type { VoucherStatus, VoucherResult } from "@/components/booking/FluentGuestForm";
import { GuestCountStepper } from "@/components/booking/GuestCountStepper";
import { AddOnSelector, type SelectedAddOn } from "@/components/booking/AddOnSelector";
import { AgeVerificationUpload } from "@/components/booking/AgeVerificationUpload";
import { useChargesForBooking } from "@/hooks/usePropertyCharges";
import { calculateCharges, getChargeTotals } from "@/components/charges/ChargeCalculator";
import type { ChargeCalculationContext } from "@/components/charges/ChargeCalculator";
import { formatCancellationPolicy, type CancellationRule } from "@/lib/policyFormatter";
import { captureCommissionOrigin } from "@/lib/bookingOrigin";
import { SpecialOfferPicker, type CheckoutOffer } from "@/components/booking/SpecialOfferPicker";
import { isSpecialEligible, type SpecialRecord } from "@/lib/specialsResolver";
import { useResolvedCancellationPolicy } from "@/hooks/useResolvedCancellationPolicy";
import { stayQuotedTotal } from "@/lib/stayQuotedTotal";
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
  /** Guest-chosen rate plan for this room (falls back to the property default). */
  rateTypeId?: string;
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
  minStay?: number;   // minimum nights
  maxStay?: number;   // maximum nights (0 = unlimited)
  maxAdults?: number; // adult-specific cap if defined
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
  const [searchParams] = useSearchParams();
  // Brand rules:
  //  • Canonical checkout (no wl=1, no brand_color) → ROL pink, no DB brand fetch.
  //  • White-label (wl=1) or explicit brand_color passed → apply property brand.
  const urlHasBrand = !!searchParams.get("brand_color");
  const isWlCheckout = urlHasBrand || searchParams.get("wl") === "1";
  const { brandReady } = useBrandOverride(isWlCheckout && !urlHasBrand ? id : null);
  const { gateways: activeGateways } = useActivePaymentGateways(id);
  const [selectedGateway, setSelectedGateway] = useState<PaymentGateway | null>(null);
  const effectiveGateway = selectedGateway || activeGateways[0] || "payfast";
  // Reservation-only properties collect payment themselves — no gateway is offered.
  const { isReservationOnly, banking: propertyBanking } = usePropertyPaymentMode(id);

  
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
  const { guestDetails, setGuestDetails, stays, addStay, totalPrice: itineraryTotalPrice } = useItinerary();
  
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
  const [appliedPromotions, setAppliedPromotions] = useState<{ name: string; type: string; discount: number; description?: string; imageUrl?: string }[]>([]);
  // Compat alias for single-promo consumers
  const appliedPromotion = appliedPromotions.length > 0 ? appliedPromotions[0] : null;
  const setAppliedPromotion = (p: { name: string; type: string; discount: number; description?: string; imageUrl?: string } | null) => setAppliedPromotions(p ? [p] : []);
  const [pendingAgeSpecial, setPendingAgeSpecial] = useState<any | null>(null);
  const [ageVerified, setAgeVerified] = useState(false);
  // Phase 4 — eligible specials the guest must choose between (one-of-N)
  const [specialOffers, setSpecialOffers] = useState<CheckoutOffer[]>([]);
  const [selectedSpecialId, setSelectedSpecialId] = useState<string | null>(null);
  const [appliedSpecialPolicyId, setAppliedSpecialPolicyId] = useState<string | null>(null);
  const hfRoomsRef = useRef<{ id: string; name: string; linked_rolos_id?: string | null }[]>([]);

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

  // Cancellation policy resolution (Phase 4):
  // selected special's policy -> rate-plan linked policy -> property master -> legacy row
  const { data: resolvedPolicy } = useResolvedCancellationPolicy(
    property?.id,
    appliedSpecialPolicyId,
    selectedRateType || null,
  );
  const cancellationPolicyRule = resolvedPolicy?.rule ?? null;

  /** Deposit / due-date terms for reservation-only (pay-the-property) checkouts. */
  const buildReservationTerms = useCallback(
    (total: number) =>
      resolveReservationTerms({
        total,
        checkIn: checkIn || new Date().toISOString().slice(0, 10),
        houseRules:
          ((property as { amenities?: { house_rules?: HouseRulesDepositBlock } } | null)?.amenities
            ?.house_rules) ?? null,
        cancellationRule: cancellationPolicyRule,
      }),
    [checkIn, property, cancellationPolicyRule],
  );


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
        minStay: r.minStayDays || r.min_stay || undefined,
        maxStay: r.maxStayDays || r.max_stay || undefined,
        maxAdults: r.maxAdults || r.max_adults || undefined,
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
        minStay: (rt as any).min_stay || undefined,
        maxStay: (rt as any).max_stay || undefined,
        maxAdults: (rt as any).max_adults || undefined,
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
        // Manual / ROLOS-native properties: use property_availability + per-room
        // seasonal rates from the admin rates calendar, falling back to rate plan.
        const wizardRooms: any[] = amenitiesData.room_types || [];
        const pmsRateTypes: any[] = amenitiesData.pms_rate_types || [];
        const seasons: any[] = amenitiesData?.seasons || [];
        const seasonRates: Record<string, any> = amenitiesData?.season_rates || {};

        // Filter to preselected room if any, else consider all wizard rooms
        const normalizeId = (s: string) => (s || "").toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
        const targetRooms = (() => {
          if (preSelectedRoomTypeId || preSelectedRoomTypeName) {
            const match = wizardRooms.find((r: any) =>
              r.id === preSelectedRoomTypeId ||
              r.room_type_id === preSelectedRoomTypeId ||
              normalizeId(r.name) === normalizeId(preSelectedRoomTypeName || "")
            );
            if (match) return [match];
          }
          return wizardRooms.length ? wizardRooms : [null];
        })();

        // Resolve fallback per-room base rate (linked rate type → wizard base → property default)
        const roomFallbackRate = (room: any): number => {
          const linkedId = room?.linkedRateTypes?.[0];
          const rt = linkedId ? pmsRateTypes.find((r: any) => r.id === linkedId) : null;
          return rt?.baseRate || room?.baseRate || room?.base_rate || property.price_per_night || 0;
        };

        const { data: blockedData } = await supabase
          .from("property_availability")
          .select("date, available_units, is_stop_sell")
          .eq("property_id", property.id)
          .gte("date", todayStr)
          .lte("date", endStr);

        const blockedDates = new Set<string>();
        if (blockedData) {
          blockedData.forEach((item) => {
            if (item.is_stop_sell || item.available_units === 0) blockedDates.add(item.date);
          });
        }

        const resolveSeasonalRate = (room: any, dateStr: string): number | null => {
          if (!room) return null;
          const season = seasons.find((s: any) => {
            const periods = Array.isArray(s.periods) && s.periods.length > 0
              ? s.periods
              : [{ from: s.from || s.start_date || s.startDate, to: s.to || s.end_date || s.endDate }];
            return periods.some((period: any) => {
              const from = period?.from || period?.start_date || period?.startDate;
              const to = period?.to || period?.end_date || period?.endDate;
              return from && to && dateStr >= from && dateStr <= to;
            });
          });
          if (!season) return null;
          const seasonId = String(season.id);
          const amenityIdByName = wizardRooms.find((wr: any) => String(wr?.name || "").trim().toLowerCase() === String(room.name || "").trim().toLowerCase())?.id;
          const keys = [room.id, room.room_type_id, amenityIdByName, room.name].filter(Boolean).map(String);
          const preferredRateTypeId = room?.linkedRateTypes?.[0];
          for (const k of keys) {
            const bucket = seasonRates[k];
            if (!bucket || typeof bucket !== "object") continue;
            if (preferredRateTypeId) {
              const v = bucket[`${seasonId}-${preferredRateTypeId}`];
              if (v && Number(v.roomAmount) > 0) return Number(v.roomAmount);
            }
            for (const subKey of Object.keys(bucket)) {
              if (!subKey.startsWith(`${seasonId}-`)) continue;
              const v = bucket[subKey];
              if (v && Number(v.roomAmount) > 0) return Number(v.roomAmount);
            }
          }
          return null;
        };

        for (let i = 0; i < 395; i++) {
          const date = addDays(today, i);
          const dateStr = format(date, "yyyy-MM-dd");
          const isBlocked = blockedDates.has(dateStr);
          // Lowest rate across the applicable rooms
          let bestRate: number | undefined;
          for (const room of targetRooms) {
            const fallback = roomFallbackRate(room);
            const seasonal = resolveSeasonalRate(room, dateStr);
            const dayRate = seasonal ?? fallback;
            if (dayRate && (bestRate === undefined || dayRate < bestRate)) bestRate = dayRate;
          }
          calendarMap.set(dateStr, { available: !isBlocked, rate: bestRate });
        }
      } else {
        // PMS-backed properties: fetch from pms_availability_cache
        const { data: cacheData } = await supabase
          .from("pms_availability_cache")
          .select("date, available_units, rates, external_room_type_id")
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

        // Filter cache to selected room if one is pre-selected, otherwise aggregate across rooms
        const normalizeId = (s: string) => s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const selectedRoomName = preSelectedRoomTypeName;
        const roomMatchIds = new Set<string>();
        if (preSelectedRoomTypeId) {
          roomMatchIds.add(preSelectedRoomTypeId);
          if (selectedRoomName) roomMatchIds.add(normalizeId(selectedRoomName));
        }

        // Aggregate by date: available = any room available, rate = lowest across rooms
        const dateAgg = new Map<string, { available: boolean; rate?: number }>();
        const cachedDates = new Set<string>();

        if (cacheData) {
          for (const row of cacheData) {
            // If a room is pre-selected, only use rows matching that room
            if (roomMatchIds.size > 0) {
              const eid = row.external_room_type_id;
              if (eid && !roomMatchIds.has(eid)) continue;
            }

            cachedDates.add(row.date);
            const isBlocked = manualBlockedDates.has(row.date) || (row.available_units != null && row.available_units <= 0);
            const ratesData = row.rates as any;
            const rate = ratesData?.room_amount || (Array.isArray(ratesData) ? ratesData[0]?.room_amount : undefined);

            const existing = dateAgg.get(row.date);
            if (!existing) {
              dateAgg.set(row.date, { available: !isBlocked, rate });
            } else {
              // Aggregate: available if ANY room is available, rate = lowest
              if (!isBlocked) existing.available = true;
              if (rate && (!existing.rate || rate < existing.rate)) existing.rate = rate;
            }
          }
        }

        for (const [date, agg] of dateAgg) {
          calendarMap.set(date, agg);
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

    // TOBI proposed a voucher during the concierge conversation — carry it into checkout
    try {
      const tobiVoucher = sessionStorage.getItem(`rol_tobi_voucher_${property.id}`);
      if (tobiVoucher) setVoucher(tobiVoucher);
    } catch { /* storage unavailable */ }


    if (preSelectedRoomTypeId && preSelectedRoomTypeName) {
      // If linked_rolos_id is present (Benson embed), resolve canonical room UUID
      const initPreSelectedRoom = async () => {
        let resolvedRoomTypeId = preSelectedRoomTypeId;
        let resolvedRoomTypeName = preSelectedRoomTypeName;
        if (embedLinkedRolosId && property) {
          const { data: hfRoomsEarly } = await supabase
            .from("hostfully_room_types")
            .select("id, name, linked_rolos_id")
            .eq("property_id", property.id)
            .eq("is_active", true);
          if (hfRoomsEarly && hfRoomsEarly.length > 0) {
            hfRoomsRef.current = hfRoomsEarly.map(r => ({ id: r.id, name: r.name, linked_rolos_id: r.linked_rolos_id }));
            const linkedRoom = hfRoomsEarly.find(r => r.linked_rolos_id === embedLinkedRolosId);
            if (linkedRoom) {
              console.log('[Booking] Resolved Benson room via linked_rolos_id:', preSelectedRoomTypeId, '→', linkedRoom.id, linkedRoom.name);
              resolvedRoomTypeId = linkedRoom.id;
              resolvedRoomTypeName = linkedRoom.name;
            }
          }
        }
        const hasPreSelectedGuests = searchParams.has("adults");
        const fallbackAdults = urlMaxGuests > 0 ? Math.max(1, Math.min(2, urlMaxGuests)) : 2;
        setRooms([{
          roomTypeId: resolvedRoomTypeId,
          roomTypeName: resolvedRoomTypeName,
          numberOfAdults: hasPreSelectedGuests ? Math.max(1, preSelectedAdults) : fallbackAdults,
          numberOfTeens: preSelectedTeens,
          numberOfChildren: preSelectedChildren,
          numberOfInfants: preSelectedInfants,
          numberOfPets: preSelectedPets,
          checkIn: urlCheckIn || undefined,
          checkOut: urlCheckOut || undefined,
        }]);
      };
      initPreSelectedRoom();
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

  // GUARDRAIL: If itinerary has multiple stays, redirect to journey review
  // This prevents the legacy single-property checkout from silently ignoring other stays
  useEffect(() => {
    if (stays.length >= 2 && property) {
      // Current property is already in the itinerary — redirect to journey review
      const currentStayExists = stays.some(
        s => s.property_id === property.id || s.property_slug === property.slug
      );
      if (currentStayExists) {
        console.log('[Booking] Multi-stay itinerary detected with', stays.length, 'stays — redirecting to journey review');
        navigate('/journey/review', { replace: true });
      }
    }
  }, [stays.length, property, navigate]);

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
        // Single orchestrator call — replaces all PMS adapter branching
        const { data: orchData, error: orchError } = await supabase.functions.invoke("booking-orchestrator-api", {
          body: {
            action: "fetch_availability",
            property_id: property.id,
            start_date: checkIn,
            end_date: checkOut,
            embed_rate: embedRate || undefined,
            embed_room_type_id: preSelectedRoomTypeId || undefined,
            embed_pricing_model: embedPricingModel || undefined,
            embed_linked_rolos_id: embedLinkedRolosId || undefined,
            room_types: roomTypes.map(rt => ({ id: rt.id, name: rt.name })),
            adults: rooms.reduce((s, r) => s + (r.numberOfAdults || 0), 0) || 2,
            teens: rooms.reduce((s, r) => s + (r.numberOfTeens || 0), 0),
            children: rooms.reduce((s, r) => s + (r.numberOfChildren || 0), 0),
            units: Math.max(1, rooms.length),
          },
        });

        if (orchError) throw orchError;
        availability = orchData?.data || orchData;

        // Capture hf_rooms reference if returned (ROL'OS path)
        if (availability?.hf_rooms) {
          hfRoomsRef.current = availability.hf_rooms;
        }

        setAvailabilityData(availability);
      }

      const lineItems: CostLineItem[] = [];
      let runningTotal = 0;

      // Get room types array - handle both snake_case (contract) and camelCase (legacy)
      let roomTypesArray = availability?.room_types || availability?.roomTypes || [];
      
      // If PMS returned empty room_types but we have embed_rate, build synthetic availability
      if (roomTypesArray.length === 0 && embedRate && embedRate > 0 && checkIn && checkOut) {
        console.log('[Booking] PMS returned empty availability — using embed_rate fallback:', embedRate);
        const dailyRates: any[] = [];
        const availArr: any[] = [];
        const cur = new Date(checkIn);
        const end = new Date(checkOut);
        while (cur < end) {
          const dateStr = cur.toISOString().split('T')[0];
          dailyRates.push({ date: dateStr, room_amount: embedRate });
          availArr.push({ date: dateStr, available_units: 1 });
          cur.setDate(cur.getDate() + 1);
        }
        const fallbackRoom = rooms[0];
        roomTypesArray = [{
          room_type_id: fallbackRoom?.roomTypeId || 'embed-room',
          room_type_name: fallbackRoom?.roomTypeName || 'Room',
          rate_types: [{
            rate_type_id: 'embed-fallback',
            rate_type_name: 'Standard Rate',
            price_type: 'PER_NIGHT',
            rates: dailyRates,
          }],
          rooms_available_per_night: availArr,
        }];
      }

      // Calculate cost for each room
      for (const room of rooms) {
        // Use room's custom dates or fall back to main booking dates
        const roomCheckIn = room.checkIn || checkIn;
        const roomCheckOut = room.checkOut || checkOut;
        const roomNights = roomCheckIn && roomCheckOut 
          ? Math.ceil((new Date(roomCheckOut).getTime() - new Date(roomCheckIn).getTime()) / (1000 * 60 * 60 * 24))
          : nights;

        // Find room type using multi-strategy matching
        // Build alias set: DB UUID + external PMS ID + normalized name + linked_rolos_id resolution
        const roomDef = roomTypes.find(r => String(r.id) === room.roomTypeId);
        const targetAliases = new Set<string>([room.roomTypeId]);
        if (roomDef) {
          targetAliases.add(slugifyRoomName(roomDef.name));
          const hfRoom = (hfRoomsRef.current as any[])?.find((hr: any) => 
            String(hr.id) === room.roomTypeId || hr.name === roomDef.name
          );
          if (hfRoom?.hostfully_room_id) targetAliases.add(hfRoom.hostfully_room_id);
          if (hfRoom?.external_room_type_id) targetAliases.add(hfRoom.external_room_type_id);
        }

        // Expand aliases via linked_rolos_id (Benson embeds pass native IDs but orchestrator returns ROL'OS UUIDs)
        if (embedLinkedRolosId) {
          const linkedHfRoom = (hfRoomsRef.current as any[])?.find((hr: any) => hr.linked_rolos_id === embedLinkedRolosId);
          if (linkedHfRoom) {
            targetAliases.add(linkedHfRoom.id);
            targetAliases.add(slugifyRoomName(linkedHfRoom.name));
            if (linkedHfRoom.hostfully_room_id) targetAliases.add(linkedHfRoom.hostfully_room_id);
            console.log('[Booking] Expanded aliases via linked_rolos_id:', embedLinkedRolosId, '→', linkedHfRoom.id, linkedHfRoom.name);
          }
        }
        // Also expand: if preSelectedRoomTypeId (original Benson ID) differs from room.roomTypeId, add it
        if (preSelectedRoomTypeId && preSelectedRoomTypeId !== room.roomTypeId) {
          targetAliases.add(preSelectedRoomTypeId);
        }
        if (preSelectedRoomTypeName) {
          targetAliases.add(slugifyRoomName(preSelectedRoomTypeName));
        }
        
        console.log('[Booking] Looking for room:', room.roomTypeId, 'aliases:', [...targetAliases], 'in', roomTypesArray.map((rt: any) => rt.room_type_id || rt.roomTypeId));

        let roomType = roomTypesArray.find(
          (rt: any) => {
            const rtId = String(rt.room_type_id || rt.roomTypeId);
            if (targetAliases.has(rtId)) return true;
            if (rt.room_type_aliases?.some((a: string) => targetAliases.has(a))) return true;
            const rtName = String(rt.room_type_name || rt.roomTypeName || rt.name || '');
            if (rtName && targetAliases.has(slugifyRoomName(rtName))) return true;
            for (const alias of targetAliases) {
              if (alias === rtId) return true;
            }
            return false;
          }
        );
        
        // Fallback: try matching by linked_rolos_id directly against orchestrator room IDs
        if (!roomType && embedLinkedRolosId) {
          const linkedHfRoom = (hfRoomsRef.current as any[])?.find((hr: any) => hr.linked_rolos_id === embedLinkedRolosId);
          if (linkedHfRoom) {
            roomType = roomTypesArray.find((rt: any) => {
              const rtId = String(rt.room_type_id || rt.roomTypeId);
              return rtId === linkedHfRoom.id;
            });
            if (roomType) {
              console.log('[Booking] Room matched via linked_rolos_id fallback:', embedLinkedRolosId, '→', linkedHfRoom.id);
            }
          }
        }

        // Fallback: try matching by exact room name
        if (!roomType) {
          roomType = roomTypesArray.find((rt: any) => {
            const rtName = rt.room_type_name || rt.roomTypeName || '';
            return rtName === room.roomTypeName;
          });
          if (roomType) {
            console.log('[Booking] Room matched by name fallback:', room.roomTypeName);
          }
        }
        
        // Last resort: if embed_rate is available and no room matched, create synthetic room type
        if (!roomType && embedRate && embedRate > 0) {
          console.log('[Booking] No room match — using embed_rate fallback:', embedRate);
          const dailyRates: any[] = [];
          const currentDate = new Date(roomCheckIn!);
          const endDate = new Date(roomCheckOut!);
          while (currentDate < endDate) {
            dailyRates.push({ date: currentDate.toISOString().split('T')[0], room_amount: embedRate });
            currentDate.setDate(currentDate.getDate() + 1);
          }
          roomType = {
            room_type_id: room.roomTypeId,
            room_type_name: room.roomTypeName,
            rate_types: [{
              rate_type_id: 'embed-fallback',
              rate_type_name: 'Standard Rate',
              price_type: 'PER_NIGHT',
              rates: dailyRates,
            }],
            rooms_available_per_night: dailyRates.map(r => ({ date: r.date, available_units: 1 })),
          };
        }
        
        console.log('[Booking] Room match result:', roomType ? 'found' : 'NOT FOUND');

        if (!roomType) continue;

        // Get rate types array - handle both formats
        const rateTypesArray = roomType.rate_types || roomType.rateTypes || [];
        
        // Find rate type - the guest's chosen offer for this room wins, then the
        // property default, then the fallbacks below.
        const desiredRateTypeId = room.rateTypeId || selectedRateType;
        const availableRateTypeIds = rateTypesArray.map((rt: any) => String(rt.rate_type_id || rt.rateTypeId));
        console.log('[Booking] Looking for rate type:', desiredRateTypeId, 'Available:', availableRateTypeIds);

        // Step 1: Try exact match with the desired rate plan
        let rateType = rateTypesArray.find((rt: any) => {
          const rtId = String(rt.rate_type_id || rt.rateTypeId);
          return rtId === desiredRateTypeId;
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
          // Full Stay plans price the whole stay; nightly/LOS keep the sum.
          totalRoomAmount = stayQuotedTotal(rateType.stay_quote, totalRoomAmount);

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
            // Also handle nested adult_amounts object (HotelBeds/Benson cache) or flat structure
            const adultAmounts = rate.adult_amounts || rate.adultAmounts || {};
            const adultAmount1 = adultAmounts.adult_amount_1 || adultAmounts.adultAmount1 || rate.adult_amount_1 || rate.adultAmount1 || rate.adult_amount || rate.adultAmount || 0;
            const adultAmount2 = adultAmounts.adult_amount_2 || adultAmounts.adultAmount2 || rate.adult_amount_2 || rate.adultAmount2 || rate.adult_amount || rate.adultAmount || 0;
            const teenAmount = rate.teen_amount || rate.teenAmount || 0;
            const childAmount = rate.child_amount || rate.childAmount || 0;
            const infantAmount = rate.infant_amount || rate.infantAmount || 0;

            // Per person sharing publishes an explicit extra-adult amount: the base
            // covers 2 guests and each additional adult is billed at that rate.
            const extraAdultAmount = rate.extra_adult_amount ?? rate.extraAdultAmount ?? adultAmount1;

            if (room.numberOfAdults === 1) {
              totalAdultAmount += adultAmount1;
            } else if (room.numberOfAdults === 2) {
              totalAdultAmount += adultAmount2;
            } else if (room.numberOfAdults > 2) {
              totalAdultAmount += adultAmount2 + (extraAdultAmount * (room.numberOfAdults - 2));
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
        const seasons: any[] = amenitiesData?.seasons || [];
        const seasonRates: Record<string, any> = amenitiesData?.season_rates || {};

        const seasonalRoomAmount = (wizRoom: any, dateStr: string): number | null => {
          if (!wizRoom) return null;
          const season = seasons.find((s: any) => {
            const periods = Array.isArray(s.periods) && s.periods.length > 0
              ? s.periods
              : [{ from: s.from || s.start_date || s.startDate, to: s.to || s.end_date || s.endDate }];
            return periods.some((period: any) => {
              const from = period?.from || period?.start_date || period?.startDate;
              const to = period?.to || period?.end_date || period?.endDate;
              return from && to && dateStr >= from && dateStr <= to;
            });
          });
          if (!season) return null;
          const seasonId = String(season.id);
          const amenityIdByName = wizardRooms.find((wr: any) => String(wr?.name || "").trim().toLowerCase() === String(wizRoom.name || "").trim().toLowerCase())?.id;
          const keys = [wizRoom.id, wizRoom.room_type_id, amenityIdByName, wizRoom.name].filter(Boolean).map(String);
          const preferredRateTypeId = wizRoom?.linkedRateTypes?.[0];
          for (const k of keys) {
            const bucket = seasonRates[k];
            if (!bucket || typeof bucket !== "object") continue;
            if (preferredRateTypeId) {
              const v = bucket[`${seasonId}-${preferredRateTypeId}`];
              if (v && Number(v.roomAmount) > 0) return Number(v.roomAmount);
            }
            for (const subKey of Object.keys(bucket)) {
              if (!subKey.startsWith(`${seasonId}-`)) continue;
              const v = bucket[subKey];
              if (v && Number(v.roomAmount) > 0) return Number(v.roomAmount);
            }
          }
          return null;
        };

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

          if (wizRoom && roomNights > 0 && roomCheckIn) {
            // Rate plan / wizard fallback
            let fallbackRate = 0;
            if (wizRoom.linkedRateTypes?.length > 0) {
              const linkedRT = pmsRateTypes.find((rt: any) => rt.id === wizRoom.linkedRateTypes[0]);
              if (linkedRT?.baseRate) fallbackRate = linkedRT.baseRate;
            }
            if (!fallbackRate) {
              fallbackRate = wizRoom.baseRate || wizRoom.base_rate || wizRoom.daily_rate || 0;
            }

            // Sum per-night seasonal rates first, falling back per date
            let total = 0;
            const start = new Date(roomCheckIn);
            for (let i = 0; i < roomNights; i++) {
              const d = new Date(start);
              d.setDate(start.getDate() + i);
              const ds = format(d, "yyyy-MM-dd");
              const seasonal = seasonalRoomAmount(wizRoom, ds);
              const dayRate = seasonal ?? fallbackRate;
              total += dayRate || 0;
            }

            if (total > 0) {
              const avg = total / roomNights;
              lineItems.push({
                description: `${room.roomTypeName} (${room.numberOfAdults + room.numberOfTeens + room.numberOfChildren + room.numberOfInfants} guests)`,
                nights: roomNights,
                quantity: 1,
                unitPrice: avg,
                total,
              });
              runningTotal += total;
              console.log('[Booking] Fallback rate applied (seasonal-aware):', room.roomTypeName, 'total', total, 'avg', avg);
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

      // Auto-apply matching packages AND specials (they stack)
      const appliedPromos: typeof appliedPromotions = [];
      if (property && checkIn && checkOut && runningTotal > 0) {
        const amenitiesData = property.amenities as Record<string, any> | null;
        const packages = amenitiesData?.packages || [];
        const bookingCheckIn = checkIn;
        const bookingCheckOut = checkOut;

        // Check packages first
        for (const pkg of packages) {
          if (!pkg.is_active && pkg.is_active !== undefined) continue;
          const pkgStart = (pkg.periodFrom || pkg.valid_from || pkg.start_date || '').split('T')[0];
          const pkgEnd = (pkg.periodTo || pkg.valid_to || pkg.end_date || '').split('T')[0];
          if (!pkgStart || !pkgEnd) continue;

          if (bookingCheckIn >= pkgStart && bookingCheckOut <= pkgEnd) {
            const minStay = pkg.minimumStay || pkg.min_nights || pkg.min_stay || 0;
            if (minStay > 0 && nights < minStay) continue;

            if (pkg.package_price && pkg.package_price > 0) {
              const discount = runningTotal - pkg.package_price;
              if (discount > 0) {
                appliedPromos.push({
                  name: pkg.name || 'Package Deal',
                  type: 'package',
                  discount,
                  description: pkg.description,
                  imageUrl: pkg.images?.[0]?.url || pkg.images?.[0] || pkg.image_url || undefined,
                });
                lineItems.push({
                  description: `📦 ${pkg.name || 'Package Deal'}`,
                  nights: 0,
                  quantity: 1,
                  unitPrice: -discount,
                  total: -discount,
                });
                runningTotal -= discount;
              }
            } else {
              const pctVal = pkg.discount_percentage || pkg.discountPercent || 0;
              if (pctVal > 0) {
                const accommodationSubtotal = lineItems.filter(i => i.nights > 0).reduce((s, i) => s + i.total, 0);
                const discount = Math.round(accommodationSubtotal * (pctVal / 100));
                if (discount > 0) {
                  appliedPromos.push({
                    name: pkg.name || 'Package Deal',
                    type: 'package',
                    discount,
                    description: pkg.description,
                    imageUrl: pkg.images?.[0]?.url || pkg.images?.[0] || pkg.image_url || undefined,
                  });
                  lineItems.push({
                    description: `📦 ${pkg.name || 'Package Deal'} (-${pctVal}%)`,
                    nights: 0,
                    quantity: 1,
                    unitPrice: -discount,
                    total: -discount,
                  });
                  runningTotal -= discount;
                }
              }
            }
            break; // Only apply first matching package
          }
        }

        // Always check specials (stack with packages)
        try {
          // Fetch specials where stay dates overlap valid period
          // OR today is within the booking window (book now, stay later deals)
          const todayForBookWindow = new Date().toISOString().split('T')[0];
          const { data: specials } = await supabase
            .from("property_specials" as any)
            .select("*")
            .eq("property_id", property.id)
            .eq("is_active", true)
            .or(
              `and(valid_from.lte.${bookingCheckOut},valid_to.gte.${bookingCheckIn}),` +
              `and(book_from.lte.${todayForBookWindow},book_until.gte.${todayForBookWindow})`
            );

          if (specials && specials.length > 0) {
            // Ensure hfRoomsRef is populated for UUID→legacy bridging
            if (hfRoomsRef.current.length === 0 && property.id) {
              const { data: hfRoomsFallback } = await supabase
                .from("hostfully_room_types")
                .select("id, name, linked_rolos_id")
                .eq("property_id", property.id)
                .eq("is_active", true);
              hfRoomsRef.current = (hfRoomsFallback || []).map(r => ({ id: r.id, name: r.name, linked_rolos_id: r.linked_rolos_id }));
            }
            let nextPendingAgeSpecial: any | null = null;
            type Candidate = CheckoutOffer & { stackable: boolean; priority: number };
            const candidates: Candidate[] = [];
            const accommodationSubtotal = lineItems
              .filter((item) => item.nights > 0 && item.total > 0)
              .reduce((sum, item) => sum + item.total, 0);
            const packageDiscountTotal = appliedPromos
              .filter((promo) => promo.type === 'package')
              .reduce((sum, promo) => sum + promo.discount, 0);
            const basisForSpecial = Math.max(0, accommodationSubtotal - packageDiscountTotal);

            for (const special of specials as any[]) {
              const minStay = special.min_stay || 0;
              if (minStay > 0 && nights < minStay) continue;

              if (special.applicable_room_ids?.length > 0) {
                const bookedRoomIds = rooms.map(r => r.roomTypeId);
                const embedRoomTypeName = searchParams.get('roomTypeName')?.replace(/\+/g, ' ');
                const amenitiesRooms = (property.amenities as any)?.room_types || (property.amenities as any)?.rooms || [];

                // Build UUID → legacy amenity ID bridge via hostfully_room_types name matching
                const uuidToLegacyIds: Record<string, (string | number)[]> = {};
                for (const hfRoom of hfRoomsRef.current) {
                  const matchingAmenity = amenitiesRooms.find((ar: any) =>
                    ar.name && hfRoom.name && ar.name.trim().toLowerCase() === hfRoom.name.trim().toLowerCase()
                  );
                  if (matchingAmenity) {
                    uuidToLegacyIds[hfRoom.id] = [String(matchingAmenity.id), Number(matchingAmenity.id)];
                  }
                }

                const hasMatchingRoom = bookedRoomIds.some(uuid => {
                  // Direct UUID match
                  if (special.applicable_room_ids.includes(uuid)) return true;
                  if (special.applicable_room_ids.includes(String(uuid))) return true;
                  // Bridge: UUID → legacy amenity ID
                  const legacyIds = uuidToLegacyIds[uuid];
                  if (legacyIds) {
                    for (const lid of legacyIds) {
                      if (special.applicable_room_ids.includes(lid)) return true;
                    }
                  }
                  // Direct name match — find the room name for this UUID
                  const bookedRoom = rooms.find(r => r.roomTypeId === uuid);
                  const bookedName = bookedRoom?.roomTypeName || embedRoomTypeName;
                  if (bookedName) {
                    const amenityByName = amenitiesRooms.find((r: any) =>
                      r.name && r.name.trim().toLowerCase() === bookedName.trim().toLowerCase()
                    );
                    if (amenityByName && (
                      special.applicable_room_ids.includes(String(amenityByName.id)) ||
                      special.applicable_room_ids.includes(Number(amenityByName.id))
                    )) {
                      console.log(`[Specials] Name match: "${bookedName}" → amenity ${amenityByName.id} for special "${special.name}"`);
                      return true;
                    }
                  }
                  return false;
                });
                if (!hasMatchingRoom) continue;
              }

              // Lead time, weekday mask, stay ranges, audience & booking window (Phase 4 resolver)
              if (!isSpecialEligible(special as SpecialRecord, {
                checkIn: bookingCheckIn,
                checkOut: bookingCheckOut,
                subtotal: basisForSpecial,
                isSubscriber: false,
                ageVerified: true, // handled separately below so we can prompt for proof
              })) continue;

              let discount = 0;
              const sType = special.special_type || special.discount_type || '';

              if (sType === 'discount' || sType === 'percentage') {
                const pct = special.discount_percent || special.discount_value || 0;
                if (pct > 0) discount = Math.round(basisForSpecial * (pct / 100));
              } else if (sType === 'fixed_amount') {
                const amt = special.fixed_amount || special.discount_value || 0;
                if (amt > 0) discount = amt;
              } else if (sType === 'fixed_price') {
                const price = special.fixed_price || special.discount_value || 0;
                if (price > 0) discount = Math.max(0, basisForSpecial - price);
              }

              if (discount > 0) {
                const pctLabel = (sType === 'discount' || sType === 'percentage') ? special.discount_percent || special.discount_value : null;
                const specialName = special.title || special.name || 'Special Offer';

                if (special.age_restricted && !ageVerified) {
                  if (!nextPendingAgeSpecial) {
                    nextPendingAgeSpecial = {
                      ...special,
                      calculatedDiscount: discount,
                      pctLabel,
                    };
                  }
                  continue;
                }

                candidates.push({
                  id: String(special.id),
                  name: specialName,
                  description: special.description ?? null,
                  label: pctLabel ? `${pctLabel}% off` : 'Special offer',
                  dealType: special.deal_type ?? null,
                  discount,
                  cancellationPolicyId: special.cancellation_policy_id ?? null,
                  stackable: special.is_stackable === true,
                  priority: Number(special.priority ?? 0),
                });
              }
            }

            setPendingAgeSpecial(nextPendingAgeSpecial);

            // De-duplicate by name (legacy specials can be mirrored per room type)
            const seenNames = new Set<string>();
            const unique = candidates.filter((c) => {
              const key = c.name.toLowerCase();
              if (seenNames.has(key)) return false;
              seenNames.add(key);
              return true;
            });

            const exclusive = unique
              .filter((c) => !c.stackable)
              .sort((a, b) => b.discount - a.discount || b.priority - a.priority);
            const stackable = unique.filter((c) => c.stackable);

            // Exactly one eligible offer -> auto-apply. Two or more -> guest picks one.
            const chosen =
              exclusive.find((c) => c.id === selectedSpecialId) ?? exclusive[0] ?? null;

            const offerList: CheckoutOffer[] = exclusive.map(({ stackable: _s, priority: _p, ...rest }) => rest);
            setSpecialOffers(offerList);
            setSelectedSpecialId(chosen ? chosen.id : null);
            setAppliedSpecialPolicyId(chosen?.cancellationPolicyId ?? null);

            for (const applied of [...(chosen ? [chosen] : []), ...stackable]) {
              appliedPromos.push({
                name: applied.name,
                type: 'special',
                discount: applied.discount,
                description: applied.description ?? undefined,
              });
              lineItems.push({
                description: `🏷️ ${applied.name} (${applied.label})`,
                nights: 0,
                quantity: 1,
                unitPrice: -applied.discount,
                total: -applied.discount,
              });
              runningTotal -= applied.discount;
            }
          } else {
            setSpecialOffers([]);
            setAppliedSpecialPolicyId(null);
          }
        } catch (err) {
          console.warn('[Booking] Failed to fetch specials:', err);
        }
      }
      setAppliedPromotions(appliedPromos);

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
  }, [property?.id, rooms, selectedRateType, checkIn, checkOut, propertyCharges, ageVerified, selectedSpecialId]);

  // Form validation for required fields
  const isFormValid = guestName.trim().length >= 2 && 
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guestEmail) && 
    guestPhone.trim().length >= 10 &&
    stayRuleBlocks.length === 0;


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

  // Portfolio slug for journey routing — resolved from URL or DB
  const [portfolioSlug, setPortfolioSlug] = useState<string | null>(searchParams.get("portfolio_slug") || null);
  const [showJourneyAssistant, setShowJourneyAssistant] = useState(false);
  const isPortfolioEmbed = integrationParam === "portfolio_embed";

  // Resolve portfolio slug from DB if not in URL
  useEffect(() => {
    if (portfolioSlug || !property?.id || !isPortfolioEmbed) return;
    (async () => {
      try {
        const { data: memberships } = await supabase
          .from("property_portfolio_members" as any)
          .select("portfolio_id")
          .eq("property_id", property.id);
        if (memberships && memberships.length > 0) {
          const { data: portfolio } = await supabase
            .from("property_portfolios" as any)
            .select("slug")
            .eq("id", (memberships as any)[0].portfolio_id)
            .maybeSingle();
          if (portfolio && (portfolio as any).slug) {
            setPortfolioSlug((portfolio as any).slug);
          }
        }
      } catch (e) {
        console.error("Failed to resolve portfolio slug:", e);
      }
    })();
  }, [property?.id, isPortfolioEmbed, portfolioSlug]);

  // Extend stay - navigate to portfolio overview (journey) or property page (standalone)
  const addRoom = () => {
    const quotedTotal = totalCost || preSelectedTotalCost || (embedRate && checkIn && checkOut
      ? embedRate * Math.max(differenceInDays(parseISO(checkOut), parseISO(checkIn)), 1)
      : 0);
    if (calculatingCost || quotedTotal <= 0) {
      toast.info(calculatingCost ? "Still calculating your stay price…" : "A valid rate is required before adding this stay.");
      return;
    }

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

    // Persist current booking as a stay in the itinerary context (prevents loss on navigation)
    const currentRoomIds = roomsWithDates.map(r => r.roomTypeId || '').filter(Boolean);
    const alreadyInItinerary = stays.some(
      s => s.property_id === property?.id &&
        s.dates.check_in === checkIn &&
        s.dates.check_out === checkOut &&
        (currentRoomIds.length === 0 || s.rooms.some(r => currentRoomIds.includes(r.room_type_id)))
    );

    if (!alreadyInItinerary && property) {
      const numNights = checkIn && checkOut ? differenceInDays(parseISO(checkOut), parseISO(checkIn)) || 1 : 1;
      // Use preSelectedTotalCost or embed_rate as fallback when totalCost is 0 (Benson/ARI flows)
      const effectiveTotal = quotedTotal;
      const perRoomTotal = effectiveTotal / (roomsWithDates.length || 1);
      const roomSelections = roomsWithDates.map(r => ({
        room_type_id: r.roomTypeId || '',
        room_type_name: r.roomTypeName || '',
        quantity: 1,
        rate_per_night: perRoomTotal / numNights,
        total_price: perRoomTotal,
      }));
      addStay({
        property_id: property.id,
        property_name: property.name || '',
        property_slug: property.slug || id || '',
        property_image: property.images?.[0] || '',
        external_system: property.external_system || integrationParam || '',
        dates: { check_in: checkIn || '', check_out: checkOut || '' },
        rooms: roomSelections,
        guests: { adults: rooms[0]?.numberOfAdults || 2, children: rooms[0]?.numberOfChildren || 0, infants: rooms[0]?.numberOfInfants || 0 },
        rate_type_id: selectedRateType || undefined,
        rate_type_name: preSelectedRateTypeName || undefined,
        price_breakdown: {
          subtotal: effectiveTotal,
          fees: [],
          taxes: [],
          total: effectiveTotal,
        },
        availability_status: 'available',
        nights: checkIn && checkOut ? differenceInDays(parseISO(checkOut), parseISO(checkIn)) : 0,
        portfolio_slug: portfolioSlug || undefined,
      });
    }

    // Property belongs to a portfolio: send the guest to the portfolio overview so
    // they can pick a different house/unit. Sending them back to the same property
    // page just re-showed the house they had already booked.
    if (portfolioSlug) {
      const params = new URLSearchParams({
        journey_mode: 'true',
        current_property_id: property?.id || '',
        checkIn: checkOut || '', // Next stay starts after current checkout
        checkOut: '',
      });
      if (urlBrandColor) params.set('brand_color', urlBrandColor);
      if (urlBrandSecondary) params.set('brand_secondary_color', urlBrandSecondary);
      if (urlBrandFont) params.set('brand_font_color', urlBrandFont);
      
      if (window.parent !== window) {
        window.location.href = `/embed/portfolio/${portfolioSlug}?${params.toString()}`;
      } else {
        navigate(`/embed/portfolio/${portfolioSlug}?${params.toString()}`);
      }
      return;
    }
    
    // Standalone or same-property: navigate back to property page with addRoom flag
    const params = new URLSearchParams({
      addRoom: 'true',
      checkIn: checkIn || '',
      checkOut: checkOut || '',
    });
    if (selectedRateType) {
      params.set('rateTypeId', selectedRateType);
    }

    // If we're in an integration/embed context, navigate back to the branded embed page
    if (isIntegration && property) {
      // Forward brand params so the property page stays branded
      if (urlBrandColor) params.set('brand_color', urlBrandColor);
      if (urlBrandSecondary) params.set('brand_secondary_color', urlBrandSecondary);
      if (urlBrandFont) params.set('brand_font_color', urlBrandFont);
      params.set('integration', integrationParam || 'portfolio_embed');
      navigate(`/embed/property/${property.slug || id}?${params.toString()}`);
    } else {
      navigate(`/property/${id}?${params.toString()}`);
    }
  };

  // Journey assistant: handle property selection from TOBI suggestions
  const handleJourneyPropertySelect = (suggestion: { property_slug: string; check_in: string; check_out: string }) => {
    // Save booking state first
    addRoom(); // This saves state
    // Then navigate to the suggested property
    const params = new URLSearchParams({
      checkIn: suggestion.check_in,
      checkOut: suggestion.check_out,
      integration: 'portfolio_embed',
    });
    if (urlBrandColor) params.set('brand_color', urlBrandColor);
    if (urlBrandSecondary) params.set('brand_secondary_color', urlBrandSecondary);
    if (urlBrandFont) params.set('brand_font_color', urlBrandFont);
    if (window.parent !== window) {
      window.location.href = `/embed/property/${suggestion.property_slug}?${params.toString()}`;
    } else {
      navigate(`/embed/property/${suggestion.property_slug}?${params.toString()}`);
    }
  };

  // Remove room
  const removeRoom = (index: number) => {
    if (rooms.length > 1) {
      setRooms(rooms.filter((_, i) => i !== index));
    }
  };

  // Rate plans on offer for a room, given the searched stay length. The backend
  // only publishes plans whose minimum-stay rules accept this stay.
  const offersForRoom = useCallback((room: RoomBooking) => {
    const list: any[] = availabilityData?.room_types || availabilityData?.roomTypes || [];
    const match = list.find((rt: any) =>
      String(rt.room_type_id ?? rt.id) === String(room.roomTypeId) ||
      (rt.room_type_name || rt.name || '').toLowerCase() === (room.roomTypeName || '').toLowerCase()
    );
    const rateTypes: any[] = match?.rate_types || match?.rateTypes || [];
    return rateTypes.map((rt: any) => {
      const rates: any[] = Array.isArray(rt.rates) ? rt.rates : [];
      const perNight = Number(rt.stay_quote?.display_per_night ?? rates[0]?.room_amount ?? 0);
      const total = Number(
        rt.stay_quote?.stay_total ?? rates.reduce((s: number, r: any) => s + Number(r.room_amount || 0), 0)
      );
      return {
        id: String(rt.rate_type_id ?? rt.rateTypeId ?? ''),
        name: rt.rate_type_name || rt.rateTypeName || 'Rate',
        minStay: rt.min_stay ? Number(rt.min_stay) : null,
        perNight,
        total,
      };
    }).filter((o) => o.id);
  }, [availabilityData]);

  // Update room
  const updateRoom = (index: number, field: keyof RoomBooking, value: string | number) => {
    const newRooms = [...rooms];
    if (field === 'roomTypeId') {
      const roomType = roomTypes.find(rt => String(rt.id) === value);
      newRooms[index] = {
        ...newRooms[index],
        roomTypeId: String(value),
        roomTypeName: roomType?.name || '',
        rateTypeId: undefined,
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

      // Where did this booking come from? Drives the commission rate applied later.
      const commissionOrigin = captureCommissionOrigin();

      const bookingData = {
        property_id: property!.id,
        user_id: user?.id || null, // Null for anonymous/guest bookings
        ...commissionOrigin,
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

      // Snapshot pricing metadata for invoice rendering in confirmation email
      const accommodationLineItems = costBreakdown.filter(i => i.nights > 0 && i.total > 0);
      const chargeLineItems = costBreakdown.filter(i => i.nights === 0 && i.total > 0);
      bookingData.ai_metadata = {
        cost_breakdown: accommodationLineItems.map(item => ({
          description: item.description,
          nights: item.nights,
          unitPrice: item.unitPrice,
          total: item.total,
        })),
        applied_specials: appliedPromotions.filter(p => p.type === 'special').map(p => ({
          name: p.name,
          discount: p.discount,
        })),
        applied_packages: appliedPromotions.filter(p => p.type === 'package').map(p => ({
          name: p.name,
          discount: p.discount,
        })),
        selected_addons: selectedAddons.map(a => ({
          name: a.addon.name,
          quantity: a.quantity,
          unit_price: a.addon.price || 0,
          total: a.total,
        })),
        voucher_discount: voucherDiscount > 0 ? voucherDiscount : undefined,
        charge_items: chargeLineItems.map(item => ({
          description: item.description,
          total: item.total,
        })),
        cancellation_policy: resolvedPolicy?.rule
          ? {
              id: resolvedPolicy.id,
              name: resolvedPolicy.name,
              source: resolvedPolicy.source,
              summary: formatCancellationPolicy(
                resolvedPolicy.rule as CancellationRule,
                checkIn || undefined,
                totalCost || undefined,
              ).summaryText,
            }
          : undefined,
        vat: vatConfig.isVat ? {
          rate: vatConfig.rate,
          number: vatConfig.number,
        } : undefined,
      };

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
      // Reservation-only properties collect payment themselves: hold the
      // reservation, email the pro forma with banking details, no gateway.
      if (isReservationOnly) {
        const terms = buildReservationTerms(data.total_price);
        await supabase
          .from('bookings')
          .update({
            payment_status: 'awaiting_eft',
            payment_method: 'eft',
            reservation_hold: true,
            hold_expires_at: reservationHoldExpiry(),
            deposit_amount: terms.amountDueNow,
            deposit_due_date: terms.dueDate,
          } as never)
          .eq('id', data.id);

        await supabase.functions.invoke('send-booking-email', {
          body: { booking_id: data.id, email_type: 'reservation_only' },
        }).catch(() => undefined);

        return { ...data, requiresPayment: false, reservationOnly: true, paymentAmount: 0 };
      }

      // All other bookings use the onsite payment modal (stays in ROL UI)
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

      if (data.reservationOnly) {
        toast.success("Reservation confirmed — payment details emailed to you");
      } else {
        toast.success("Booking request submitted successfully!");
      }
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
  const hideRolBranding = searchParams.get("wl") === "1";
  const wrapLayout = useCallback((children: React.ReactNode) =>
    isWhiteLabel ? (
      <WhiteLabelLayout propertyName={property?.name} propertyLogoUrl={propertyLogoUrl} hideRolBranding={hideRolBranding}>
        {children}
      </WhiteLabelLayout>
    ) : (
      <PublicLayout
        backLabel="Back to Property"
        backTo={property ? `/property/${property.slug || property.id}` : "/"}
      >
        {children}
      </PublicLayout>
    ), [isWhiteLabel, hideRolBranding, property?.name, propertyLogoUrl, property?.slug, property?.id]);

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
                        <div key={index} className="pl-3 border-l-2 border-border ml-1">
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
          {/* Announcements */}
          {property?.amenities && (property.amenities as any)?.announcements?.length > 0 && (
            <AnnouncementBanner
              announcements={((property.amenities as any).announcements || []).map((a: any) => ({
                id: String(a.id || ''),
                title: a.announcement || a.title || '',
                message: a.message || '',
                enabled: a.enabled !== false,
                validFrom: a.startDate ? a.startDate.split('T')[0] : undefined,
                validTo: a.endDate ? a.endDate.split('T')[0] : undefined,
                link: a.link,
                linkText: a.linkText,
              }))}
              brandColor={urlBrandColor || undefined}
            />
          )}
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

            {/* NightsBridge-style availability & rates grid (collapsed by default) */}
            {property?.id && (
              <ShowcaseAvailabilityCalendar
                propertyId={property.id}
                amenities={amenities}
                startDate={checkIn || undefined}
                className="mb-1"
              />
            )}



            {/* Date Picker — always available for editing */}
            <div className={cn(
              "rounded-xl border p-4 space-y-3",
              checkIn && checkOut ? "border-border/50 bg-card" : "border-border bg-card"
            )}>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                <CalendarDays className="h-4 w-4 text-primary" />
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
                  <span className="ml-auto text-xs text-[hsl(var(--primary-text-safe,var(--primary)))] font-medium">Change</span>
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
                minNights={(() => {
                  // Resolve strictest min stay across all selected rooms
                  const mins = rooms.map(r => {
                    const rt = roomTypes.find(t => String(t.id) === r.roomTypeId);
                    return rt?.minStay || 1;
                  });
                  return Math.max(...mins, 1);
                })()}
                maxNights={(() => {
                  // Resolve strictest max stay across all selected rooms (0 = unlimited)
                  const maxes = rooms.map(r => {
                    const rt = roomTypes.find(t => String(t.id) === r.roomTypeId);
                    return rt?.maxStay || 0;
                  }).filter(m => m > 0);
                  return maxes.length > 0 ? Math.min(...maxes) : undefined;
                })()}
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
                            <span className="text-[hsl(var(--primary-text-safe,var(--primary)))] ml-1">(custom dates)</span>
                          )}
                        </span>
                      )}
                      {/* Rule summary - show constraints that differ from defaults */}
                      {roomType && (
                        <div className="flex items-center gap-2 mt-0.5">
                          {(roomType.minStay && roomType.minStay > 1) && (
                            <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                              Min {roomType.minStay} nights
                            </span>
                          )}
                          {(roomType.maxStay && roomType.maxStay > 0) && (
                            <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                              Max {roomType.maxStay} nights
                            </span>
                          )}
                          {maxGuestsForRoom < 99 && (
                            <span className="text-[10px] text-muted-foreground bg-muted/60 px-1.5 py-0.5 rounded">
                              Max {maxGuestsForRoom} guests
                            </span>
                          )}
                        </div>
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

                  {/* Rate plan offers available for this stay length */}
                  {(() => {
                    const offers = offersForRoom(room);
                    if (offers.length < 2) return null;
                    const activeId = room.rateTypeId || offers[0].id;
                    return (
                      <div className="space-y-1.5">
                        <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Rate options</p>
                        <div className="grid gap-1.5">
                          {offers.map((offer) => {
                            const isActive = String(activeId) === offer.id;
                            return (
                              <button
                                key={offer.id}
                                type="button"
                                onClick={() => updateRoom(index, 'rateTypeId', offer.id)}
                                className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors ${
                                  isActive
                                    ? 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))]/10'
                                    : 'border-border hover:border-[hsl(var(--primary))]/50'
                                }`}
                              >
                                <span className="min-w-0">
                                  <span className="block truncate font-medium">{offer.name}</span>
                                  {offer.minStay && offer.minStay > 1 && (
                                    <span className="text-[10px] text-muted-foreground">Min {offer.minStay} nights</span>
                                  )}
                                </span>
                                {offer.total > 0 && (
                                  <span className="shrink-0 text-right text-sm font-semibold">
                                    <FormattedPrice amount={offer.total} />
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })()}



          {/* Specials Banner */}
          {property?.id && (
            <SpecialsBanner
              propertyId={property.id}
              brandColor={urlBrandColor || undefined}
            />
          )}

          {/* Package Cards */}
          {property?.amenities && ((property.amenities as any)?.packages?.length > 0) && (
            <PackageCards
              packages={((property.amenities as any).packages || []).map((pkg: any) => ({
                id: pkg.id,
                name: pkg.name || 'Package',
                description: pkg.description,
                category: pkg.category,
                inclusions: pkg.inclusions,
                stays: pkg.stays,
                price: pkg.package_price || pkg.fixedPrice || 0,
                validFrom: (pkg.periodFrom || pkg.valid_from || '').split('T')[0] || undefined,
                validTo: (pkg.periodTo || pkg.valid_to || '').split('T')[0] || undefined,
                images: pkg.images,
              }))}
              brandColor={urlBrandColor || undefined}
            />
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

            {portfolioSlug ? (
              <div className="space-y-2 w-full">
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => setShowJourneyAssistant(!showJourneyAssistant)} className="text-xs flex-1">
                    <Sparkles className="h-3 w-3 mr-1" /> {showJourneyAssistant ? "Hide journey builder" : "Extend your journey"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={addRoom} disabled={calculatingCost} className="text-xs">
                    <Plus className="h-3 w-3 mr-1" /> Browse properties
                  </Button>
                </div>
                <AnimatePresence>
                  {showJourneyAssistant && property && checkIn && checkOut && (
                    <TobiJourneyAssistant
                      currentPropertyId={property.id}
                      currentPropertyName={property.name}
                      currentCheckIn={checkIn}
                      currentCheckOut={checkOut}
                      portfolioSlug={portfolioSlug}
                      brandColor={urlBrandColor || undefined}
                      brandFontColor={urlBrandFont || undefined}
                      onSelectProperty={(s) => handleJourneyPropertySelect(s)}
                      onBrowsePortfolio={addRoom}
                      onClose={() => setShowJourneyAssistant(false)}
                    />
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <Button variant="outline" size="sm" onClick={addRoom} disabled={calculatingCost} className="text-xs">
                <Plus className="h-3 w-3 mr-1" /> Add another room
              </Button>
            )}
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

                  {/* Add-on / Extras line items */}
                  {selectedAddons.length > 0 && (
                    <div className="border-t border-dashed border-border/30 pt-2 space-y-1">
                      <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Extras</p>
                      {selectedAddons.map((sa, idx) => (
                        <div key={idx} className="flex justify-between text-sm items-center">
                          <p className="text-foreground flex items-center gap-1.5">
                            <span className="text-[hsl(var(--primary-text-safe,var(--primary)))] text-xs">＋</span>
                            {sa.addon.name} × {sa.quantity}
                          </p>
                          <span className="font-medium"><FormattedPrice amount={sa.total} /></span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* One-of-N special offer selection (two or more qualifying specials) */}
                  <SpecialOfferPicker
                    offers={specialOffers}
                    selectedId={selectedSpecialId}
                    onSelect={setSelectedSpecialId}
                    renderAmount={(amount) => <FormattedPrice amount={amount} />}
                  />

                  {/* Applied promotions banners */}
                  {appliedPromotions.length > 0 && appliedPromotions.map((promo, idx) => (
                    <div key={idx} className="border border-dashed border-border bg-card rounded-lg p-3 mt-2">
                      <div className="flex items-center gap-2">
                        {promo.imageUrl && (
                          <img src={promo.imageUrl} alt={promo.name} className="w-10 h-10 rounded object-cover flex-shrink-0" />
                        )}
                        <span className="text-sm">{promo.type === 'package' ? '📦' : '🏷️'}</span>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">{promo.name}</p>
                          {promo.description && (
                            <p className="text-xs text-muted-foreground mt-0.5">{promo.description}</p>
                          )}
                        </div>
                        <span className="text-sm font-semibold text-[hsl(var(--primary-text-safe,var(--primary)))]">
                          -<FormattedPrice amount={promo.discount} />
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* Age verification for age-restricted specials */}
                  {pendingAgeSpecial && !ageVerified && property && (
                    <div className="mt-2">
                      <AgeVerificationUpload
                        special={{
                          name: pendingAgeSpecial.title || pendingAgeSpecial.name || 'Special Offer',
                          min_age: pendingAgeSpecial.min_age,
                          max_age: pendingAgeSpecial.max_age,
                          age_label: pendingAgeSpecial.age_label,
                          discount_percent: pendingAgeSpecial.discount_percent,
                        }}
                        propertyId={property.id}
                        onVerified={(eligible) => {
                          if (eligible) {
                            setAgeVerified(true);
                            setPendingAgeSpecial(null);
                          } else {
                            setPendingAgeSpecial(null);
                          }
                        }}
                      />
                    </div>
                  )}


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
                  <p className="text-xs font-medium">
                    Cancellation Policy
                    {resolvedPolicy?.name ? ` — ${resolvedPolicy.name}` : ""}
                  </p>
                  {(() => {
                    const amenityText = ((property as any)?.amenities?.cancellation_policy || "").toString().trim();
                    const rule = cancellationPolicyRule as CancellationRule | null | undefined;
                    const hasRule = !!(rule && (rule.non_refundable || (rule.tiers && rule.tiers.length > 0) || rule.days_before !== undefined));
                    const policyText = hasRule
                      ? formatCancellationPolicy(rule!, checkIn || undefined, totalCost || undefined).summaryText
                      : amenityText;
                    return (
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">
                        {policyText || "Contact property for cancellation terms"}
                      </p>
                    );
                  })()}
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {isReservationOnly ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="max-w-2xl mx-auto mt-4"
          >
            <ReservationPaymentNotice
              banking={propertyBanking}
              terms={buildReservationTerms(
                Math.max(0, (totalCost || preSelectedTotalCost || 0) + selectedAddons.reduce((s, a) => s + a.total, 0) - voucherDiscount),
              )}
              total={Math.max(0, (totalCost || preSelectedTotalCost || 0) + selectedAddons.reduce((s, a) => s + a.total, 0) - voucherDiscount)}
              policySummary={
                cancellationPolicyRule
                  ? formatCancellationPolicy(cancellationPolicyRule as CancellationRule, checkIn || undefined, totalCost || undefined).summaryText
                  : null
              }
            />
          </motion.div>
        ) : activeGateways.length > 1 ? (
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
        ) : null}


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
              ) : isReservationOnly ? (
                <>
                  <CreditCard className="h-5 w-5" />
                  Confirm reservation
                </>
              ) : (
                <>
                  <CreditCard className="h-5 w-5" />
                  Confirm & Pay {totalCost > 0 ? <FormattedPrice amount={Math.max(0, totalCost + selectedAddons.reduce((s, a) => s + a.total, 0) - voucherDiscount)} /> : (preSelectedTotalCost ? <FormattedPrice amount={preSelectedTotalCost} /> : '')}
                </>
              )}
            </Button>
            <div className="flex items-center justify-center gap-2 mt-2 text-[10px] sm:text-xs text-muted-foreground">
              <Lock className="h-3 w-3" />
              <span>
                {isReservationOnly
                  ? "Reservation held for 3 days · pay the property directly"
                  : "Secured payment · 256-bit SSL"}
              </span>
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
      />
      </>)
  );
};

export default Booking;