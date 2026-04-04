import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { usePageSEO } from "@/hooks/usePageSEO";
import { format, addDays } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { getNightsBridgeBookingUrl } from "@/lib/config";
import { getAccommodationLabel } from "@/lib/accommodationLabels";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useMobileBooking } from "@/contexts/MobileBookingContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNightsBridgeTracking } from "@/hooks/useNightsBridgeTracking";
import { useBehavioralMemory } from "@/hooks/useBehavioralMemory";
import LeavingRoomsOnlineModal from "@/components/LeavingRoomsOnlineModal";
import TripAdvisorReviews from "@/components/TripAdvisorReviews";
import { usePropertyReviews } from "@/hooks/usePropertyReviews";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { WhiteLabelLayout } from "@/components/layout/WhiteLabelLayout";
import { QuickBookDrawer } from "@/components/booking/QuickBookDrawer";
import { PropertyRecommendations } from "@/components/booking/PropertyRecommendations";
import { AIConciergePanel } from "@/components/booking/AIConciergePanel";
import { SmartCart } from "@/components/booking/SmartCart";
import { InlineCheckoutPanel } from "@/components/booking/InlineCheckoutPanel";
import { ConciergeErrorBoundary } from "@/components/booking/ConciergeErrorBoundary";
import { useAIConciergeEnabled } from "@/hooks/useFeatureFlags";
import { useItinerary } from "@/contexts/ItineraryContext";
import { toast } from "sonner";
import rolWreathLogo from "@/assets/rol-wreath-logo.jpg";
import { ChevronLeft, ChevronRight, ExternalLink, Info } from "lucide-react";

// Showcase Components - Fluent-Inspired Edition
import {
  RunwayHero,
  QuietFacts,
  RoomCollection,
  CategoryCollection,
  BuildingIntro,
  BuildingGallery,
  ProseFacilities,
  RunwayReviews,
  InvitationMap,
  ShowcaseReviewsBadge,
  ShowcaseReviewCarousel,
  BookingSidebar,
  EditorialSkeleton,
  SpaceDescription,
  NeighborhoodGuide,
  HouseRulesSection,
} from "@/components/showcase";

// Editorial Utilities
import {
  composeTagline,
  getHeroMedia,
  composeProseFacts,
  getEditorialBlurb,
} from "@/lib/editorialUtils";
import { applyBrandToDocument, saveBrandToSession, clearBrandFromSession, type PropertyBrand } from "@/lib/brandOverride";

interface Property {
  id: string;
  name: string;
  description: string | null;
  property_type: string;
  address: string;
  city: string;
  country: string;
  latitude: number | null;
  longitude: number | null;
  price_per_night: number;
  max_guests: number;
  bedrooms: number | null;
  bathrooms: number | null;
  amenities: any;
  images: string[];
  is_active: boolean;
  external_system: string | null;
  external_id: string | null;
  slug: string | null;
  editorial_rating?: string | null;
  why_we_chose_this_place?: string | null;
  who_this_suits?: string | null;
  what_its_really_like?: string | null;
  why_this_place_matters?: string | null;
  hero_video_url?: string | null;
  brand_override_enabled?: boolean;
  brand_primary_color?: string | null;
  brand_secondary_color?: string | null;
  brand_font_color?: string | null;
  brand_logo_url?: string | null;
}

// Brand CSS utilities moved to src/lib/brandOverride.ts

interface RoomType {
  id: string;
  name: string;
  url?: string;
  maxPeople?: number;
  maxAdults?: number;
  maxChildren?: number;
  description?: string;
  pmsRoomId?: string;
  bathrooms?: number;
  bedConfiguration?: string | { type: string; count: number }[];
  roomSize?: number;
  images?: string[];
}

interface AvailabilityData {
  external_room_type_id: string;
  available_units: number;
  rates: any;
  date: string;
}

interface BookingRoom {
  roomTypeId: string;
  roomTypeName: string;
  [key: string]: any;
}

const slugifyRoomName = (name: string) => {
  return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
};

// NightsBridge responsive booking content component
const NightsBridgeBookingContent = ({ 
  iframeUrl, 
  propertyName,
  tripadvisorId,
  currency 
}: { 
  iframeUrl: string; 
  propertyName: string;
  tripadvisorId?: string;
  currency: string;
}) => {
  const isMobile = useIsMobile();
  
  const CurrencyIndicator = () => (
    <div className="bg-muted/50 border-b border-border px-4 py-1.5 flex items-center justify-center gap-2">
      <Info className="h-3 w-3 text-muted-foreground" />
      <span className="text-xs text-muted-foreground">
        Requesting prices in <span className="font-medium text-foreground">{currency}</span>
      </span>
    </div>
  );
  
  if (isMobile) {
    return (
      <div className="flex-1 flex flex-col w-full">
        <CurrencyIndicator />
        <div className="flex-1 relative" style={{ minHeight: 'calc(100vh - 150px)' }}>
          <iframe
            key={iframeUrl}
            src={iframeUrl}
            title={`Book ${propertyName} on NightsBridge`}
            className="absolute inset-0 w-full h-full border-0"
            allow="payment"
          />
        </div>
        {tripadvisorId && (
          <div className="border-t border-border bg-muted/30 p-3">
            <details className="group">
              <summary className="flex items-center justify-between cursor-pointer text-sm font-medium">
                <span>TripAdvisor Reviews</span>
                <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
              </summary>
              <div className="mt-3 max-h-[50vh] overflow-y-auto">
                <TripAdvisorReviews tripadvisorId={tripadvisorId} />
              </div>
            </details>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div className="flex-1 flex flex-col max-w-7xl mx-auto w-full">
      <CurrencyIndicator />
      <div className="flex-1 flex flex-row">
        <div className="flex-1 relative min-h-[calc(100vh-130px)]">
          <iframe
            key={iframeUrl}
            src={iframeUrl}
            title={`Book ${propertyName} on NightsBridge`}
            className="absolute inset-0 w-full h-full border-0"
            allow="payment"
          />
        </div>
        {tripadvisorId && (
          <div className="w-80 xl:w-96 border-l border-border bg-muted/30 p-4 overflow-y-auto">
            <TripAdvisorReviews tripadvisorId={tripadvisorId} />
          </div>
        )}
      </div>
    </div>
  );
};

export default function PropertyShowcase() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { currency } = useCurrency();
  const { setProperty, state: mobileBookingState } = useMobileBooking();
  const { createBookingSession } = useNightsBridgeTracking();
  const { trackPropertyView } = useBehavioralMemory();
  const [property, setPropertyData] = useState<Property | null>(null);
  const [availability, setAvailability] = useState<Map<string, AvailabilityData>>(new Map());
  const [nextAvailableDay, setNextAvailableDay] = useState<Map<string, { date: string; dayName: string; units: number }>>(new Map());
  const [nightsBridgeAgentCode, setNightsBridgeAgentCode] = useState<string | null>(null);
  const [nbTrackingRef, setNbTrackingRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookedRooms, setBookedRooms] = useState<BookingRoom[]>([]);
  const [showLeavingModal, setShowLeavingModal] = useState(false);
  const [externalBookingUrl, setExternalBookingUrl] = useState<string>("");
  const [quickBookDrawerOpen, setQuickBookDrawerOpen] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  // Calendar availability for 90-day range
  const [calendarAvailability, setCalendarAvailability] = useState<Map<string, { available: boolean; rate?: number }>>(new Map());
  
  // AI Concierge state
  const { enabled: aiConciergeEnabled, isLoading: aiConciergeLoading } = useAIConciergeEnabled();
  const [aiFailed, setAiFailed] = useState(false);
  const { hasStays } = useItinerary();
  const { data: reviewData } = usePropertyReviews(property?.id);

  // Auto-open checkout when navigated with #checkout hash (e.g. from RoomShowcase)
  useEffect(() => {
    if (window.location.hash === '#checkout' && hasStays) {
      setCheckoutOpen(true);
      window.history.replaceState(null, '', window.location.pathname + window.location.search);
    }
  }, [hasStays]);

  // Handle AI concierge error - gracefully fall back to legacy flow
  const handleAIError = useCallback(() => {
    setAiFailed(true);
    toast.info("Switching to manual booking...");
  }, []);

  // Handle fallback from error boundary
  const handleFallbackToLegacy = useCallback(() => {
    setAiFailed(true);
  }, []);

  // Payment callbacks removed - unified checkout at /journey/checkout handles these

  // SEO: inject structured data for property (memoized to prevent unnecessary re-renders)
  const seoConfig = useMemo(() => ({
    title: property ? `${property.name} — ${property.city}, ${property.country}` : "Loading Property",
    description: property
      ? `Book ${property.name} in ${property.city}, ${property.country}. ${property.description?.slice(0, 120) || "Extraordinary accommodation in Africa."}`
      : "Discover extraordinary accommodation across Africa.",
    ogType: "place" as const,
    ogImage: property?.images?.[0] || undefined,
    breadcrumbs: property
      ? [
          { name: "Home", url: "/" },
          { name: "Properties", url: "/property_listing" },
          { name: property.name, url: `/property/${property.slug || property.id}` },
        ]
      : undefined,
    jsonLd: property
      ? {
          "@context": "https://schema.org",
          "@type": "LodgingBusiness",
          name: property.name,
          description: property.description || undefined,
          url: `https://book.sleepinafrica.roomsonline.co.za/property/${property.slug || property.id}`,
          image: property.images?.slice(0, 5) || [],
          address: {
            "@type": "PostalAddress",
            addressLocality: property.city,
            addressCountry: property.country,
            streetAddress: property.address,
          },
          ...(property.latitude && property.longitude
            ? {
                geo: {
                  "@type": "GeoCoordinates",
                  latitude: property.latitude,
                  longitude: property.longitude,
                },
              }
            : {}),
          priceRange: property.price_per_night > 5000 ? "$$$$" : property.price_per_night > 2000 ? "$$$" : "$$",
        }
      : undefined,
  }), [property?.id, property?.name, property?.city, property?.country, property?.description, property?.images, property?.slug, property?.address, property?.latitude, property?.longitude, property?.price_per_night]);

  usePageSEO(seoConfig);

  // Track property view in behavioral memory
  useEffect(() => {
    if (property) {
      trackPropertyView({
        propertyId: property.id,
        propertyName: property.name,
        location: property.city,
        priceRange: property.price_per_night > 5000 ? 'luxury' : property.price_per_night > 2000 ? 'mid' : 'budget',
        tags: property.amenities?.facilities?.slice(0, 5) || [],
      });
    }
  }, [property?.id]);

  useEffect(() => {
    if (id) fetchPropertyData();
  }, [id]);

  useEffect(() => {
    const isAddRoomMode = searchParams.get('addRoom') === 'true';
    if (isAddRoomMode && property?.id) {
      const storedData = sessionStorage.getItem(`booking_state_${property.id}`);
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          if (parsed.rooms && Array.isArray(parsed.rooms)) {
            setBookedRooms(parsed.rooms);
          }
        } catch (e) {
          console.error('Error parsing booking state:', e);
        }
      }
    } else {
      setBookedRooms([]);
    }
  }, [searchParams, property?.id]);

  const fetchPropertyData = async () => {
    setLoading(true);
    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id || "");
      const today = new Date().toISOString().split('T')[0];
      
      let propertyQuery = supabase.from("public_properties").select("*");
      propertyQuery = isUuid ? propertyQuery.eq("id", id) : propertyQuery.eq("slug", id);
      
      // Fire property + NB config in parallel
      const [propertyResult, nbConfigResult] = await Promise.all([
        propertyQuery.maybeSingle(),
        supabase.from("public_nightsbridge_config").select("agent_code").maybeSingle()
      ]);

      const { data: propertyData, error: propertyError } = propertyResult;
      if (propertyError) throw propertyError;
      if (!propertyData) return;
      
      if (nbConfigResult.data?.agent_code) {
        setNightsBridgeAgentCode(nbConfigResult.data.agent_code);
      }
      
      const images = Array.isArray(propertyData.images) ? propertyData.images as string[] : [];
      setPropertyData({ ...propertyData, images });
      
      if (propertyData.id && propertyData.name) {
        setProperty(propertyData.id, propertyData.name, propertyData.slug || propertyData.id);
      }

      // Fire cache availability fetch immediately — 7-day window for next-available labels
      const sevenDaysOut = new Date();
      sevenDaysOut.setDate(sevenDaysOut.getDate() + 7);
      const endDate = sevenDaysOut.toISOString().split("T")[0];

      const availPromise = supabase
        .from("pms_availability_cache")
        .select("external_room_type_id, available_units, rates, date")
        .eq("property_id", propertyData.id)
        .gte("date", today)
        .lte("date", endDate);

      const { data: availData } = await availPromise;

      if (availData && availData.length > 0) {
        // Today's availability map (existing behaviour)
        const availMap = new Map<string, AvailabilityData>();
        // Next-available-day map: roomTypeId → { date, dayName, units }
        const nextAvailMap = new Map<string, { date: string; dayName: string; units: number }>();

        // Group by room type
        const byRoom = new Map<string, typeof availData>();
        availData.forEach((item) => {
          if (!byRoom.has(item.external_room_type_id)) byRoom.set(item.external_room_type_id, []);
          byRoom.get(item.external_room_type_id)!.push(item);
        });

        byRoom.forEach((rows, roomId) => {
          // Today row
          const todayRow = rows.find((r) => r.date === today);
          if (todayRow) availMap.set(roomId, todayRow);

          // First future date with availability > 0 (skip today)
          const futureRows = rows
            .filter((r) => r.date !== today && r.available_units > 0)
            .sort((a, b) => a.date.localeCompare(b.date));
          if (futureRows.length > 0) {
            const first = futureRows[0];
            nextAvailMap.set(roomId, {
              date: first.date,
              dayName: new Date(first.date + "T12:00:00").toLocaleDateString("en", { weekday: "long" }),
              units: first.available_units,
            });
          }
        });

        setAvailability(availMap);
        setNextAvailableDay(nextAvailMap);
        
        // Preload availability to sessionStorage for Booking page
        try {
          sessionStorage.setItem(`avail_preload_${propertyData.id}`, JSON.stringify({
            data: availData,
            fetchedAt: Date.now(),
          }));
        } catch (_) { /* sessionStorage full — ignore */ }
      } else if (!propertyData.external_system) {
        // No PMS connected - build synthetic availability from wizard rates
        const amenitiesData = propertyData.amenities as Record<string, any> | null;
        const wizardRooms = amenitiesData?.room_types || [];
        const syntheticAvailMap = new Map<string, AvailabilityData>();
        
        wizardRooms.forEach((room: any) => {
          const roomId = room.id || room.room_type_id || `wizard-room-${room.name}`;
          syntheticAvailMap.set(roomId, {
            external_room_type_id: roomId,
            available_units: 99,
            rates: [{
              rate_type_id: 'wizard-rate',
              room_amount: room.base_rate || room.baseRate || room.daily_rate,
              price_type: (room.rate_unit || room.rateUnit) === 'per_stay' ? 'PerStay' : 'UnitRate',
            }],
            date: today,
          });
        });
        
        if (syntheticAvailMap.size > 0) {
          console.log('[PropertyShowcase] Built synthetic availability from wizard rates:', syntheticAvailMap.size, 'rooms');
          setAvailability(syntheticAvailMap);
        }
      }
    } catch (error) {
      console.error("Error fetching property:", error);
    } finally {
      setLoading(false);
    }
  };

  // HotelBeds properties: fetch availability on-demand
  const isHotelBedsProperty = property?.external_system === "hotelbeds";
  const isNightsBridgeProperty = property?.external_system === "nightsbridge";
  const isHostfullyProperty = property?.external_system === "hostfully";
  
  // Dynamic terminology based on property configuration
  const accommodationLabel = getAccommodationLabel(property);
  const unitLabel = accommodationLabel.singular.toLowerCase();
  const unitLabelPlural = accommodationLabel.plural.toLowerCase();
  
  // NightsBridge tracking: create session when property loads
  useEffect(() => {
    if (isNightsBridgeProperty && property?.id && nightsBridgeAgentCode && !nbTrackingRef) {
      createBookingSession({
        propertyId: property.id,
        propertyName: property.name,
        currency,
      }).then((trackingRef) => {
        if (trackingRef) {
          setNbTrackingRef(trackingRef);
        }
      });
    }
  }, [isNightsBridgeProperty, property?.id, nightsBridgeAgentCode, currency, createBookingSession, nbTrackingRef]);
  
  useEffect(() => {
    if ((isHotelBedsProperty || isHostfullyProperty) && property?.id) {
      fetchLivePMSAvailability();
    }
  }, [property?.id, isHotelBedsProperty, isHostfullyProperty]);

  const fetchLivePMSAvailability = async () => {
    if (!property?.id) return;
    
    // Determine which API to use based on property type
    const apiName = isHostfullyProperty ? 'hostfully-api' : 'hotelbeds-api';
    
    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 14);
    const end = endDate.toISOString().split('T')[0];

    try {
      // HotelBeds uses camelCase params, Hostfully uses snake_case
      const body = isHotelBedsProperty 
        ? {
            action: 'fetch_availability',
            property_id: property.id,
            startDate: today,
            endDate: end,
          }
        : {
            action: 'fetch_availability',
            property_id: property.id,
            start_date: today,
            end_date: end,
          };
      
      const { data, error } = await supabase.functions.invoke(apiName, { body });
      
      console.log(`[PropertyShowcase] ${apiName} response:`, data?.success, data?.data?.room_types?.length || 0, 'rooms');
      
      if (data?.success && data?.data?.room_types) {
        const availMap = new Map<string, AvailabilityData>();
        data.data.room_types.forEach((rt: any) => {
          const roomId = rt.room_type_id || rt.id || rt.name;
          // Handle different PMS response formats
          const availabilityArray = rt.rooms_available_per_night || 
                                    rt.daily_availability || 
                                    rt.availability_per_night || [];
          const todayData = availabilityArray.find((d: any) => d.date === today) || availabilityArray[0];
          
          // Always set availability, even if no daily data (default to available)
          availMap.set(roomId, {
            external_room_type_id: roomId,
            available_units: todayData?.available_units ?? 1,
            rates: rt.rate_types || [],
            date: todayData?.date || today,
          });
          
          // Also map by slugified name for matching with local room types
          const slugName = slugifyRoomName(rt.name || roomId);
          if (slugName !== roomId) {
            availMap.set(slugName, {
              external_room_type_id: roomId,
              available_units: todayData?.available_units ?? 1,
              rates: rt.rate_types || [],
              date: todayData?.date || today,
            });
          }
        });
        setAvailability(availMap);
      }
    } catch (error) {
      console.error(`Failed to fetch ${apiName} availability:`, error);
    }
  };

  // Fetch calendar availability for the floating picker (90-day range)
  useEffect(() => {
    const fetchCalendarAvailability = async () => {
      if (!property?.id) return;
      
      const isManual = !property.external_system;
      const amenitiesData = property.amenities as Record<string, any> | null;
      
      // For manual properties, synthesize availability from property_availability table
      if (isManual && amenitiesData) {
        const today = new Date();
        const endDate = addDays(today, 395);
        const todayStr = format(today, "yyyy-MM-dd");
        const endStr = format(endDate, "yyyy-MM-dd");
        
        // Get base rate from wizard data
        const wizardRooms = amenitiesData.room_types || [];
        const firstRoom = wizardRooms[0];
        const linkedRateTypeId = firstRoom?.linkedRateTypes?.[0];
        const pmsRateTypes = amenitiesData.pms_rate_types || [];
        const rateType = pmsRateTypes.find((rt: any) => rt.id === linkedRateTypeId);
        const baseRate = rateType?.baseRate || firstRoom?.baseRate || firstRoom?.base_rate || property.price_per_night;
        
        // Fetch blocked dates from property_availability
        const { data: blockedData } = await supabase
          .from("property_availability")
          .select("date, available_units, is_stop_sell")
          .eq("property_id", property.id)
          .gte("date", todayStr)
          .lte("date", endStr);
        
        // Build availability map - all dates available by default except explicit blocks
        const blockedDates = new Set<string>();
        if (blockedData) {
          blockedData.forEach((item) => {
            if (item.is_stop_sell || item.available_units === 0) {
              blockedDates.add(item.date);
            }
          });
        }
        
        // Generate 13 months (395 days) of availability
        const calendarMap = new Map<string, { available: boolean; rate?: number }>();
        for (let i = 0; i < 395; i++) {
          const date = addDays(today, i);
          const dateStr = format(date, "yyyy-MM-dd");
          const isBlocked = blockedDates.has(dateStr);
          
          // Check season rates for this date
          let dayRate = baseRate;
          const seasons = amenitiesData.seasons || [];
          const seasonRates = amenitiesData.season_rates || {};
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
          
          calendarMap.set(dateStr, {
            available: !isBlocked,
            rate: dayRate,
          });
        }
        
        setCalendarAvailability(calendarMap);
        console.log('[PropertyShowcase] Calendar availability built:', calendarMap.size, 'days, blocked:', blockedDates.size);
      }
    };
    
    fetchCalendarAvailability();
  }, [property?.id, property?.external_system, property?.amenities]);

  // Apply brand override to document root (affects ALL portals: calendar drawers, modals, etc.)
  const brandCleanupRef = useRef<(() => void) | null>(null);
  const brandedMode = searchParams.get("branded") === "true";

  useEffect(() => {
    brandCleanupRef.current?.();
    brandCleanupRef.current = null;

    // Force brand in branded mode even if property-level toggle is off
    const shouldApplyBrand = Boolean(
      (property?.brand_override_enabled || brandedMode) && property?.brand_primary_color
    );

    if (shouldApplyBrand) {
      const brand: PropertyBrand = {
        enabled: true,
        primaryColor: property.brand_primary_color!,
        secondaryColor: property.brand_secondary_color,
        fontColor: property.brand_font_color,
        logoUrl: property.brand_logo_url,
        propertyId: property.id,
      };
      brandCleanupRef.current = applyBrandToDocument(brand);
      saveBrandToSession(brand);
    } else {
      clearBrandFromSession();
    }

    return () => {
      brandCleanupRef.current?.();
      clearBrandFromSession();
    };
  }, [brandedMode, property?.id, property?.brand_override_enabled, property?.brand_primary_color, property?.brand_secondary_color, property?.brand_font_color, property?.brand_logo_url]);

  const scrollToRooms = () => {
    document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth" });
  };

  const getRoomTypes = (): RoomType[] => {
    const rawRooms = property?.amenities?.room_types || [];
    return rawRooms
      .filter((rt: any) => rt.is_active !== false)
      .map((rt: any) => ({
        ...rt,
        // Normalize ID fields for HotelBeds compatibility
        id: rt.id || rt.room_type_id,
        pmsRoomId: rt.pmsRoomId || rt.room_type_id,
        maxPeople: rt.maxPeople || rt.max_guests,
        // Normalize images: convert {url, alt} objects to string URLs
        images: Array.isArray(rt.images) 
          ? rt.images.map((img: any) => typeof img === 'string' ? img : img?.url).filter(Boolean)
          : [],
      }));
  };
  
  const getAvailabilityForRoom = (room: RoomType): AvailabilityData | undefined => {
    // Try multiple ID formats: pmsRoomId, id, slugified name
    const primaryId = room.pmsRoomId || room.id;
    const slugifiedName = slugifyRoomName(room.name);
    
    // First try the primary ID
    let result = availability.get(primaryId);
    
    // If not found, try slugified room name
    if (!result && slugifiedName !== primaryId) {
      result = availability.get(slugifiedName);
    }
    
    return result;
  };

  const getBookedCountForRoom = (room: RoomType): number => {
    return bookedRooms.filter(br => br.roomTypeId === room.id).length;
  };

  const getRemainingAvailability = (room: RoomType): number | undefined => {
    const availData = getAvailabilityForRoom(room);
    if (availData?.available_units === undefined) return undefined;
    return Math.max(0, availData.available_units - getBookedCountForRoom(room));
  };

  const getNextAvailableDayForRoom = (room: RoomType): { date: string; dayName: string; units: number } | undefined => {
    const primaryId = room.pmsRoomId || room.id;
    const slugifiedName = slugifyRoomName(room.name);
    return nextAvailableDay.get(primaryId) || nextAvailableDay.get(slugifiedName);
  };

  const getLowestRateForRoom = (room: RoomType): number | null => {
    // Priority 1: Check linked rate types FIRST (wizard-configured rates for manual properties)
    const roomData = property?.amenities?.room_types?.find((rt: any) => 
      (rt.id || rt.room_type_id) === room.id
    );
    
    if (roomData?.linkedRateTypes?.length > 0) {
      const pmsRateTypes = property?.amenities?.pms_rate_types || [];
      for (const rateTypeId of roomData.linkedRateTypes) {
        const rateType = pmsRateTypes.find((rt: any) => rt.id === rateTypeId);
        if (rateType?.baseRate) {
          return rateType.baseRate;
        }
      }
    }
    
    // Priority 2: Direct room rate (wizard data)
    if (roomData?.baseRate || roomData?.base_rate || roomData?.daily_rate) {
      return roomData.baseRate || roomData.base_rate || roomData.daily_rate;
    }
    
    // Priority 3: Check availability cache
    const availData = getAvailabilityForRoom(room);
    if (availData?.rates) {
      const rateTypes = Array.isArray(availData.rates) ? availData.rates : [availData.rates];
      let lowest: number | null = null;
      
      rateTypes.forEach((rateType: any) => {
        // Direct rate fields (standard formats)
        if (rateType.room_amount && (lowest === null || rateType.room_amount < lowest)) {
          lowest = rateType.room_amount;
        }
        if (rateType.adult_amounts) {
          Object.values(rateType.adult_amounts).forEach((amount: any) => {
            if (typeof amount === 'number' && (lowest === null || amount < lowest)) lowest = amount;
          });
        }
        
        // HotelBeds format: rate_types[].rates[] array with daily rates
        if (rateType.rates?.length > 0) {
          rateType.rates.forEach((dailyRate: any) => {
            const amt = dailyRate.room_amount || dailyRate.adult_amounts?.adult_amount_1;
            if (typeof amt === 'number' && (lowest === null || amt < lowest)) lowest = amt;
          });
        }
        
        // Legacy format: daily_rates (fallback)
        if (rateType.daily_rates?.length > 0) {
          rateType.daily_rates.forEach((dr: any) => {
            const amt = dr.room_amount || dr.adult_amounts?.adult_amount_1;
            if (typeof amt === 'number' && (lowest === null || amt < lowest)) lowest = amt;
          });
        }
      });
      
      if (lowest !== null) return lowest;
    }
    
    // Priority 4: Fallback to pms_rates
    if (roomData?.pms_rates) {
      let lowest: number | null = null;
      roomData.pms_rates.forEach((rate: any) => {
        if (rate.roomAmount && (lowest === null || rate.roomAmount < lowest)) lowest = rate.roomAmount;
        if (rate.adultAmount1 && (lowest === null || rate.adultAmount1 < lowest)) lowest = rate.adultAmount1;
      });
      if (lowest !== null) return lowest;
    }
    
    return null;
  };

  const getOverallLowestRate = (): number | null => {
    let lowest: number | null = null;
    getRoomTypes().forEach((room) => {
      const rate = getLowestRateForRoom(room);
      if (rate !== null && (lowest === null || rate < lowest)) lowest = rate;
    });
    return lowest;
  };

  const getFacilities = (): string[] => property?.amenities?.facilities || [];
  
  const isBensonProperty = property?.external_system?.toLowerCase() === "benson";
  const isManualRatesProperty = !property?.external_system && getRoomTypes().length > 0;
  
  const getNightsBridgeBBID = (): string | null => {
    if (!property) return null;
    return property.external_id || property.amenities?.external_ids?.nightsbridge_bb_id || null;
  };

  const handleBookProperty = () => {
    if (isNightsBridgeProperty) {
      const bbid = getNightsBridgeBBID();
      if (bbid && nightsBridgeAgentCode) {
        setExternalBookingUrl(getNightsBridgeBookingUrl(bbid, nightsBridgeAgentCode));
        setShowLeavingModal(true);
        return;
      }
    }
    
    // For PMS or manual rates properties with booked rooms, open inline checkout
    if ((isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && bookedRooms.length > 0) {
      setCheckoutOpen(true);
      return;
    }
    
    // If SmartCart has items, open inline checkout panel
    if (hasStays) {
      setCheckoutOpen(true);
      return;
    }
    
    // When AI Concierge is active
    const aiConciergeIsActive = aiConciergeEnabled && !aiFailed && (isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty);
    if (aiConciergeIsActive) {
      // If dates already selected, skip date picker — go straight to room selection / single-room auto-add
      const hasDates = mobileBookingState.checkIn && mobileBookingState.checkOut;
      if (hasDates) {
        const rooms = getRoomTypes();
        if (rooms.length === 1) {
          // Single room: let AIConciergePanel's handleBookNowClick handle auto-add
          window.dispatchEvent(new CustomEvent('conciergeBookNow'));
        } else {
          scrollToRooms();
        }
        return;
      }
      // No dates yet — open date picker
      scrollToRooms();
      setTimeout(() => {
        window.dispatchEvent(new CustomEvent('openConciergeDatePicker'));
      }, 300);
      return;
    }
    
    // For single-room properties (including manual rates), open quick book drawer directly
    const rooms = getRoomTypes();
    if (rooms.length === 1 && (isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty)) {
      setQuickBookDrawerOpen(true);
      return;
    }
    
    // For manual rates properties with multiple rooms, open QuickBookDrawer
    // (scrollToRooms was a no-op when already at rooms section)
    if (isManualRatesProperty) {
      setQuickBookDrawerOpen(true);
      return;
    }
    
    // Otherwise scroll to rooms section
    scrollToRooms();
  };

  const handleQuickBook = (roomId?: string) => {
    // Open drawer with optional pre-selected room
    setQuickBookDrawerOpen(true);
  };

  const handleRoomClick = (room: RoomType) => {
    const propertySlug = property?.slug || property?.id;
    const roomSlug = slugifyRoomName(room.name);
    const queryString = searchParams.toString();
    navigate(`/property/${propertySlug}/room/${roomSlug}${queryString ? `?${queryString}` : ''}`);
  };

  // Loading state
  // Determine if this property should use white-label layout
  const isWhiteLabel = Boolean(property?.brand_override_enabled && property?.brand_primary_color);
  const propertyLogoUrl = property?.brand_logo_url || null;

  // Brand is "ready" once property is loaded (brand vars are applied synchronously in the effect above)
  // For the initial load, the inline script in index.html handles cached brands
  const brandReady = !loading && (isWhiteLabel ? Boolean(property?.brand_primary_color) : true);

  if (loading || (isWhiteLabel && !brandReady)) {
    return (
      <PublicLayout hideHeader hideFooter>
        <EditorialSkeleton />
      </PublicLayout>
    );
  }

  // Not found
  if (!property) {
    return (
      <PublicLayout>
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="text-center">
            <h1 className="font-serif text-2xl font-light mb-4">Property Not Found</h1>
            <Link to="/"><Button>Return Home</Button></Link>
          </div>
        </div>
      </PublicLayout>
    );
  }

  // NightsBridge properties: iframe view
  const bbid = getNightsBridgeBBID();
  if (property.external_system === "nightsbridge" && bbid && nightsBridgeAgentCode) {
    const iframeUrl = getNightsBridgeBookingUrl(bbid, nightsBridgeAgentCode, undefined, undefined, currency, nbTrackingRef || undefined);
    return (
      <div className="min-h-screen bg-background flex flex-col">
        <div className="bg-background border-b border-border px-4 py-2 shrink-0">
          <div className="max-w-7xl mx-auto flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => navigate("/")} className="gap-1.5 h-8">
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline text-xs">Back</span>
            </Button>
            {!isWhiteLabel && (
              <div className="flex items-center gap-2 px-2 border-l border-border">
                <img src={rolWreathLogo} alt="RoomsOnline" className="h-8 w-8 object-contain" />
                <span className="text-xs sm:text-sm font-semibold text-primary italic">proudly presenting</span>
              </div>
            )}
            <div className="border-l border-border pl-3">
              <h1 className="font-semibold text-xs sm:text-sm truncate">{property.name}</h1>
            </div>
          </div>
        </div>
        <NightsBridgeBookingContent 
          iframeUrl={iframeUrl} 
          propertyName={property.name}
          tripadvisorId={property.amenities?.external_ids?.tripadvisor_id || property.amenities?.tripadvisor_id}
          currency={currency}
        />
      </div>
    );
  }

  // Prepare editorial content
  const tagline = composeTagline(property);
  const heroMedia = getHeroMedia(property);
  const proseFacts = composeProseFacts(property);
  const editorialBlurb = getEditorialBlurb(property);
  const roomTypes = getRoomTypes();
  const facilities = getFacilities();
  const lowestRate = getOverallLowestRate();



  const LayoutWrapper = isWhiteLabel ? WhiteLabelLayout : PublicLayout;
  const layoutProps = isWhiteLabel
    ? { propertyName: property.name, propertyLogoUrl }
    : { hideHeader: true, hideFooter: true };

  return (
    <LayoutWrapper {...layoutProps as any}>
      <div>
      {/* Hero - Fluent-style with price badge */}
      <RunwayHero
        name={property.name}
        tagline={tagline}
        images={heroMedia.type === 'image' ? heroMedia.images : undefined}
        videoUrl={heroMedia.type === 'video' ? heroMedia.src : null}
        gradientFallback={heroMedia.type === 'gradient' ? heroMedia.fallbackGradient : undefined}
        onScrollDown={scrollToRooms}
        lowestRate={lowestRate}
        city={property.city}
        country={property.country}
      />

      {/* 2-Column Layout: Content + Booking Sidebar */}
      <div className="max-w-7xl mx-auto px-6 sm:px-10 lg:px-14">
        <div className="flex flex-col lg:flex-row gap-8 lg:gap-12 py-8 sm:py-12">
          {/* Left: Property Content */}
          <div className="flex-1 min-w-0">
            {/* Building Introduction — universal for all property types */}
            <BuildingIntro
              description={property.description}
              address={property.address}
              city={property.city}
              checkInTime={property.amenities?.check_in_time}
              checkOutTime={property.amenities?.check_out_time}
              totalUnits={isHostfullyProperty ? roomTypes.length : undefined}
              bedrooms={property.bedrooms || undefined}
              bathrooms={property.bathrooms || undefined}
              maxGuests={property.max_guests || undefined}
              reviewBadges={reviewData?.badges?.length ? <ShowcaseReviewsBadge badges={reviewData.badges} /> : undefined}
            />

            {/* Quick Facts (non-Hostfully — additional context) */}
            {!isHostfullyProperty && proseFacts.length > 0 && (
              <QuietFacts
                facts={proseFacts}
                editorialBlurb={editorialBlurb?.content}
              />
            )}


            {/* Building Photo Gallery (Hostfully multi-unit) */}
            {isHostfullyProperty && property.images && property.images.length > 1 && (
              <BuildingGallery
                images={property.images}
                propertyName={property.name}
              />
            )}

            {/* Room/Unit Cards */}
            {isHostfullyProperty && roomTypes.length > 4 ? (
              <CategoryCollection
                rooms={roomTypes}
                getLowestRate={getLowestRateForRoom}
                getAvailability={getRemainingAvailability}
                getNextAvailableDay={getNextAvailableDayForRoom}
                onRoomClick={handleRoomClick}
                propertyImages={property.images}
                unitLabel={unitLabel}
                unitLabelPlural={unitLabelPlural}
              />
            ) : (
              <RoomCollection
                rooms={roomTypes}
                getLowestRate={getLowestRateForRoom}
                getAvailability={getRemainingAvailability}
                getNextAvailableDay={getNextAvailableDayForRoom}
                onRoomClick={handleRoomClick}
                propertyImages={property.images}
                unitLabel={unitLabel}
                unitLabelPlural={unitLabelPlural}
              />
            )}

            {/* Amenities */}
            <ProseFacilities facilities={facilities} />

            {/* The Space */}
            <SpaceDescription
              spaceDescription={property.amenities?.space_description}
              keyHighlights={property.amenities?.key_highlights}
            />

            {/* Neighbourhood & Getting Around */}
            <NeighborhoodGuide
              neighbourhoodDescription={property.amenities?.neighbourhood_description}
              gettingAround={property.amenities?.getting_around}
              poi={{
                restaurants_cafes: property.amenities?.restaurants_cafes,
                restaurants_cafes_distance: property.amenities?.restaurants_cafes_distance,
                public_transport: property.amenities?.public_transport,
                public_transport_distance: property.amenities?.public_transport_distance,
                closest_airport: property.amenities?.closest_airport,
                closest_airport_distance: property.amenities?.closest_airport_distance,
              }}
            />

            {/* House Rules & Things to Know */}
            <HouseRulesSection
              checkInTime={property.amenities?.check_in_time || property.amenities?.check_in_from}
              checkOutTime={property.amenities?.check_out_time || property.amenities?.check_out_from}
              maxGuests={property.max_guests}
              houseRules={property.amenities?.house_rules}
              cancellationPolicy={property.amenities?.cancellation_policy || property.amenities?.cancellation_policies?.[0]?.description}
              thingsToKnow={property.amenities?.things_to_know}
            />

            {/* Reviews — Cached from Google + TripAdvisor */}
            {reviewData && (reviewData.badges.length > 0 || reviewData.reviews.length > 0) ? (
              <>
                <ShowcaseReviewsBadge badges={reviewData.badges} />
                <ShowcaseReviewCarousel reviews={reviewData.reviews} tobiBlurb={reviewData.tobiBlurb} />
              </>
            ) : (
              <>
                <RunwayReviews editorialRating={property.editorial_rating} />
                {property.amenities?.external_ids?.tripadvisor_id && (
                  <section className="py-10">
                    <TripAdvisorReviews tripadvisorId={property.amenities.external_ids.tripadvisor_id} />
                  </section>
                )}
              </>
            )}
          </div>

          {/* Right: Sticky Booking Sidebar (desktop only - mobile gets bottom bar) */}
          <div className="hidden lg:block w-[340px] shrink-0">
            <BookingSidebar
              lowestRate={lowestRate}
              propertyName={property.name}
              onBook={handleBookProperty}
              onViewJourney={() => navigate('/journey/review')}
              availabilityMap={calendarAvailability}
              isExternal={isNightsBridgeProperty}
            />
          </div>
        </div>
      </div>

      {/* Map & Location */}
      <InvitationMap
        propertyName={property.name}
        city={property.city}
        country={property.country}
        latitude={property.latitude}
        longitude={property.longitude}
        onBookNow={handleBookProperty}
        bookingLabel={isNightsBridgeProperty ? "Book Now" : bookedRooms.length > 0 ? "Checkout" : roomTypes.length === 1 ? "Book Now" : `Select a ${unitLabel.charAt(0).toUpperCase() + unitLabel.slice(1)}`}
      />

      {/* Recommendations */}
      <PropertyRecommendations 
        currentPropertyId={property.id} 
        variant="full"
        className="py-12 sm:py-16"
      />
      
      {/* Spacer for mobile bottom bar */}
      <div className="h-24 lg:h-0" aria-hidden="true" />

      {/* Mobile Booking Bar (replaces StickyBookingCTA + FloatingDateGuestPicker) */}
      <div className="lg:hidden">
        <BookingSidebar
          lowestRate={lowestRate}
          propertyName={property.name}
          onBook={handleBookProperty}
          onViewJourney={() => navigate('/journey/review')}
          availabilityMap={calendarAvailability}
          isExternal={isNightsBridgeProperty}
        />
      </div>

      {/* NightsBridge Leaving Modal */}
      <LeavingRoomsOnlineModal
        open={showLeavingModal}
        onOpenChange={setShowLeavingModal}
        externalUrl={externalBookingUrl}
        propertyName={property?.name}
      />
      
      {/* SmartCart */}
      {hasStays && (
        <SmartCart 
          onCheckout={() => setCheckoutOpen(true)}
        />
      )}

      {/* Inline Checkout Panel */}
      <InlineCheckoutPanel
        open={checkoutOpen}
        onClose={() => setCheckoutOpen(false)}
        onPaymentSuccess={(bookingId) => {
          setCheckoutOpen(false);
          navigate(`/booking-confirmation/${bookingId}?payment=success`);
        }}
        onPaymentCancelled={() => setCheckoutOpen(false)}
      />

      {/* AI Concierge Mode */}
      {aiConciergeEnabled && !aiFailed && (isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && !hasStays && (
        <ConciergeErrorBoundary 
          onFallback={handleFallbackToLegacy}
          fallbackMessage="The booking assistant is having trouble"
        >
          <AIConciergePanel
            propertyId={property.id}
            propertyName={property.name}
            propertySlug={property.slug || property.id}
            propertyImage={property.images?.[0]}
            externalSystem={property.external_system || undefined}
            roomTypes={roomTypes}
            availabilityMap={calendarAvailability}
            onError={handleAIError}
          />
        </ConciergeErrorBoundary>
      )}
      
      {/* Legacy Quick Book Drawer */}
      {(!aiConciergeEnabled || aiFailed) && (isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && (
        <QuickBookDrawer
          open={quickBookDrawerOpen}
          onOpenChange={setQuickBookDrawerOpen}
          propertyId={property.id}
          propertySlug={property.slug || property.id}
          propertyName={property.name}
          propertyImage={property.images?.[0]}
          externalSystem={property.external_system || undefined}
          roomTypes={roomTypes}
          defaultRoomId={roomTypes.length === 1 ? roomTypes[0].id : undefined}
        />
      )}
      </div>
    </LayoutWrapper>
  );
}
