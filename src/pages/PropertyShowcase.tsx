import { useState, useEffect, useCallback } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getNightsBridgeBookingUrl } from "@/lib/config";
import { Button } from "@/components/ui/button";
import { useCurrency } from "@/contexts/CurrencyContext";
import { useMobileBooking } from "@/contexts/MobileBookingContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { useNightsBridgeTracking } from "@/hooks/useNightsBridgeTracking";
import { useBehavioralMemory } from "@/hooks/useBehavioralMemory";
import LeavingRoomsOnlineModal from "@/components/LeavingRoomsOnlineModal";
import TripAdvisorReviews from "@/components/TripAdvisorReviews";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { FloatingDateGuestPicker } from "@/components/booking/FloatingDateGuestPicker";
import { QuickBookDrawer } from "@/components/booking/QuickBookDrawer";
import { PropertyRecommendations } from "@/components/booking/PropertyRecommendations";
import rolWreathLogo from "@/assets/rol-wreath-logo.jpg";
import { ChevronLeft, ChevronRight, ExternalLink, Info } from "lucide-react";

// Showcase Components - Paris Fashion Week Edition
import {
  RunwayHero,
  QuietFacts,
  RoomCollection,
  ProseFacilities,
  RunwayReviews,
  InvitationMap,
  StickyBookingCTA,
  EditorialSkeleton,
} from "@/components/showcase";

// Editorial Utilities
import {
  composeTagline,
  getHeroMedia,
  composeProseFacts,
  getEditorialBlurb,
} from "@/lib/editorialUtils";

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
}

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
  const { setProperty } = useMobileBooking();
  const { createBookingSession } = useNightsBridgeTracking();
  const { trackPropertyView } = useBehavioralMemory();
  const [property, setPropertyData] = useState<Property | null>(null);
  const [availability, setAvailability] = useState<Map<string, AvailabilityData>>(new Map());
  const [nightsBridgeAgentCode, setNightsBridgeAgentCode] = useState<string | null>(null);
  const [nbTrackingRef, setNbTrackingRef] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [bookedRooms, setBookedRooms] = useState<BookingRoom[]>([]);
  const [showLeavingModal, setShowLeavingModal] = useState(false);
  const [externalBookingUrl, setExternalBookingUrl] = useState<string>("");
  const [quickBookDrawerOpen, setQuickBookDrawerOpen] = useState(false);

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
      
      let propertyQuery = supabase.from("public_properties").select("*");
      propertyQuery = isUuid ? propertyQuery.eq("id", id) : propertyQuery.eq("slug", id);
      
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

      const today = new Date().toISOString().split('T')[0];
      const { data: availData } = await supabase
        .from("pms_availability_cache")
        .select("external_room_type_id, available_units, rates, date")
        .eq("property_id", propertyData.id)
        .eq("date", today);

      if (availData && availData.length > 0) {
        const availMap = new Map<string, AvailabilityData>();
        availData.forEach((item) => {
          availMap.set(item.external_room_type_id, item);
          // Also map by slugified name for easy lookup
          // This handles cases where room IDs don't match external_room_type_id
        });
        setAvailability(availMap);
      } else if (!propertyData.external_system) {
        // No PMS connected - build synthetic availability from wizard rates
        const amenitiesData = propertyData.amenities as Record<string, any> | null;
        const wizardRooms = amenitiesData?.room_types || [];
        const syntheticAvailMap = new Map<string, AvailabilityData>();
        
        wizardRooms.forEach((room: any) => {
          const roomId = room.id || room.room_type_id || `wizard-room-${room.name}`;
          syntheticAvailMap.set(roomId, {
            external_room_type_id: roomId,
            available_units: 99, // Unlimited availability for manual properties
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

  const scrollToRooms = () => {
    document.getElementById("rooms-section")?.scrollIntoView({ behavior: "smooth" });
  };

  const getRoomTypes = (): RoomType[] => {
    const rawRooms = property?.amenities?.room_types || [];
    return rawRooms.map((rt: any) => ({
      ...rt,
      // Normalize ID fields for HotelBeds compatibility
      id: rt.id || rt.room_type_id,
      pmsRoomId: rt.pmsRoomId || rt.room_type_id,
      maxPeople: rt.maxPeople || rt.max_guests,
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

  const getLowestRateForRoom = (room: RoomType): number | null => {
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
    // Fallback to pms_rates
    const roomData = property?.amenities?.room_types?.find((rt: any) => 
      (rt.id || rt.room_type_id) === room.id
    );
    if (roomData?.pms_rates) {
      let lowest: number | null = null;
      roomData.pms_rates.forEach((rate: any) => {
        if (rate.roomAmount && (lowest === null || rate.roomAmount < lowest)) lowest = rate.roomAmount;
        if (rate.adultAmount1 && (lowest === null || rate.adultAmount1 < lowest)) lowest = rate.adultAmount1;
      });
      return lowest;
    }
    
    // Final fallback: Check wizard base_rate directly (for non-PMS properties)
    const wizardRoom = property?.amenities?.room_types?.find((rt: any) => 
      (rt.id || rt.room_type_id) === room.id
    );
    if (wizardRoom?.base_rate || wizardRoom?.baseRate || wizardRoom?.daily_rate) {
      return wizardRoom.base_rate || wizardRoom.baseRate || wizardRoom.daily_rate;
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
    // For PMS or manual rates properties with booked rooms, go to checkout
    if ((isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && bookedRooms.length > 0) {
      navigate(`/booking/${property?.slug || property?.id}`);
      return;
    }
    // For single-room properties (including manual rates), open quick book drawer directly
    const rooms = getRoomTypes();
    if (rooms.length === 1 && (isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty)) {
      setQuickBookDrawerOpen(true);
      return;
    }
    // For manual rates properties with multiple rooms, go to rooms section
    if (isManualRatesProperty) {
      scrollToRooms();
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
  if (loading) {
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
            <div className="flex items-center gap-2 px-2 border-l border-border">
              <img src={rolWreathLogo} alt="RoomsOnline" className="h-8 w-8 object-contain" />
              <span className="text-xs sm:text-sm font-semibold text-primary italic">proudly presenting</span>
            </div>
            <div className="border-l border-border pl-3">
              <h1 className="font-semibold text-xs sm:text-sm truncate">{property.name}</h1>
            </div>
          </div>
        </div>
        <NightsBridgeBookingContent 
          iframeUrl={iframeUrl} 
          propertyName={property.name}
          tripadvisorId={property.amenities?.tripadvisor_id}
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

  return (
    <PublicLayout hideHeader hideFooter>
      {/* Act I: The Reveal */}
      <RunwayHero
        name={property.name}
        tagline={tagline}
        images={heroMedia.type === 'image' ? heroMedia.images : undefined}
        videoUrl={heroMedia.type === 'video' ? heroMedia.src : null}
        gradientFallback={heroMedia.type === 'gradient' ? heroMedia.fallbackGradient : undefined}
        onScrollDown={scrollToRooms}
      />

      {/* Act II: The Quiet Facts */}
      <QuietFacts
        facts={proseFacts}
        editorialBlurb={editorialBlurb?.content}
      />

      {/* Act III: The Collection */}
      <RoomCollection
        rooms={roomTypes}
        getLowestRate={getLowestRateForRoom}
        getAvailability={getRemainingAvailability}
        onRoomClick={handleRoomClick}
        propertyImages={property.images}
      />

      {/* Amenities as Prose */}
      <ProseFacilities facilities={facilities} />

      {/* Act IV: Reviews */}
      <RunwayReviews editorialRating={property.editorial_rating} />

      {/* TripAdvisor Integration */}
      {property.amenities?.external_ids?.tripadvisor_id && (
        <section className="runway-section-spacing px-6 sm:px-10 md:px-16 lg:px-20">
          <TripAdvisorReviews tripadvisorId={property.amenities.external_ids.tripadvisor_id} />
        </section>
      )}

      {/* Act V: The Invitation */}
      <InvitationMap
        propertyName={property.name}
        city={property.city}
        country={property.country}
        latitude={property.latitude}
        longitude={property.longitude}
        onBookNow={handleBookProperty}
        bookingLabel={isNightsBridgeProperty ? "Book Now" : bookedRooms.length > 0 ? "Checkout" : roomTypes.length === 1 ? "Book Now" : "Select a Room"}
      />

      {/* Personalized Recommendations */}
      <PropertyRecommendations 
        currentPropertyId={property.id} 
        variant="full"
        className="runway-section-spacing"
      />

      {/* Sticky Booking CTA */}
      <StickyBookingCTA
        onBook={handleBookProperty}
        lowestRate={lowestRate}
        isExternal={isNightsBridgeProperty}
        bookedRoomsCount={bookedRooms.length}
        propertyName={property.name}
        propertyId={property.id}
        propertySlug={property.slug || property.id}
        propertyImage={property.images?.[0]}
      />

      {/* NightsBridge Leaving Modal */}
      <LeavingRoomsOnlineModal
        open={showLeavingModal}
        onOpenChange={setShowLeavingModal}
        externalUrl={externalBookingUrl}
        propertyName={property?.name}
      />
      
      {/* Quick Book Drawer for streamlined booking (including manual rates properties) */}
      {(isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && (
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
      
      {/* Floating Date/Guest Picker for Benson, HotelBeds, Hostfully and manual rates properties */}
      {(isBensonProperty || isHotelBedsProperty || isHostfullyProperty || isManualRatesProperty) && (
        <FloatingDateGuestPicker
          onContinue={() => setQuickBookDrawerOpen(true)} 
          ctaLabel="Book Now" 
        />
      )}
    </PublicLayout>
  );
}
