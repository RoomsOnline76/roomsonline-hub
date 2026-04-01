import { useState, useEffect } from "react";
import { useParams, Link, useNavigate, useSearchParams } from "react-router-dom";
import { useBrandOverride } from "@/hooks/useBrandOverride";
import { supabase } from "@/integrations/supabase/client";
import { getAccommodationLabel } from "@/lib/accommodationLabels";
import { getPropertyUrl, getNightsBridgeBookingUrl } from "@/lib/config";
import { useCurrency } from "@/contexts/CurrencyContext";
import { formatBedConfiguration, hasBedConfiguration } from "@/lib/bedConfig";
import { useItinerary } from "@/contexts/ItineraryContext";
import { useMobileBooking } from "@/contexts/MobileBookingContext";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { FormattedPrice } from "@/components/FormattedPrice";
import { PublicLayout } from "@/components/layout/PublicLayout";
import { WhiteLabelLayout } from "@/components/layout/WhiteLabelLayout";
import { toast } from "sonner";
import { 
  Bed, 
  Bath, 
  Users, 
  Maximize, 
  ChevronLeft, 
  ChevronRight,
  ArrowLeft,
  Check,
  Calendar,
  Baby,
  UserRound,
  Moon,
  Wifi,
  Tv,
  Wind,
  Coffee,
  UtensilsCrossed,
  Sparkles,
  ShowerHead,
  Sofa,
  Mountain,
  ExternalLink
} from "lucide-react";
import { ChevronDown as CollapseIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import LeavingRoomsOnlineModal from "@/components/LeavingRoomsOnlineModal";

interface PmsRate {
  date: string;
  rateTypeId: number;
  rateTypeName: string;
  roomAmount?: number | null;
  adultAmount1?: number | null;
  adultAmount2?: number | null;
}

interface RoomType {
  id: string;
  name: string;
  url?: string;
  description?: string;
  numRooms?: number;
  bedConfiguration?: string | { type: string; count: number }[];
  roomSize?: number;
  bathrooms?: number;
  maxPeople?: number;
  maxAdults?: number;
  maxChildren?: number;
  minStay?: number;
  maxStay?: number;
  rateType?: string;
  splitPercent?: number;
  images?: string[];
  facilities?: string[];
  amenities?: string[];
  extraPersonPolicy?: string;
  pmsRoomType?: string;
  pmsRoomId?: string;
  mealTypes?: string[];
  pms_rates?: PmsRate[];
}

interface Property {
  id: string;
  name: string;
  slug: string;
  address: string;
  city: string;
  country: string;
  amenities: any;
  external_system: string | null;
  external_id: string | null;
  property_type?: string | null;
  brand_override_enabled?: boolean;
  brand_primary_color?: string | null;
  brand_secondary_color?: string | null;
  brand_font_color?: string | null;
  brand_logo_url?: string | null;
}

interface RateData {
  room_type: string;
  rate_type: string;
  meal_type: string | null;
  amount: number;
  currency: string;
}

interface AvailabilityData {
  available_units: number;
  date: string;
}

interface CachedRateData {
  currency: string;
  room_amount?: number;
  adult_amount_1?: number;
  adult_amount_2?: number;
}

const facilityIcons: Record<string, any> = {
  wifi: Wifi,
  "air conditioning": Wind,
  aircon: Wind,
  tv: Tv,
  television: Tv,
  coffee: Coffee,
  "coffee maker": Coffee,
  minibar: UtensilsCrossed,
  bathroom: ShowerHead,
  "en-suite": ShowerHead,
  "living area": Sofa,
  balcony: Mountain,
  view: Mountain,
};

// Bed config labels are now handled by the bedConfig utility

export default function RoomShowcase() {
  const navigate = useNavigate();
  const { propertySlug, roomSlug } = useParams<{ propertySlug: string; roomSlug: string }>();
  const { brandReady } = useBrandOverride(propertySlug);
  
  // Pre-detect branding from sessionStorage to avoid FOUC
  const [earlyWhiteLabel] = useState(() => {
    try {
      const cached = sessionStorage.getItem('rol_property_brand');
      if (cached) {
        const brand = JSON.parse(cached);
        return Boolean(brand?.enabled && brand?.primaryColor);
      }
    } catch {}
    return false;
  });
  const [searchParams] = useSearchParams();
  const { currency } = useCurrency();
  const { addStay } = useItinerary();
  const [property, setProperty] = useState<Property | null>(null);
  const [room, setRoom] = useState<RoomType | null>(null);
  const [rates, setRates] = useState<RateData[]>([]);
  const [availableUnits, setAvailableUnits] = useState<number | null>(null);
  const [cachedRate, setCachedRate] = useState<CachedRateData | null>(null);
  const [nightsBridgeAgentCode, setNightsBridgeAgentCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [showLeavingModal, setShowLeavingModal] = useState(false);
  const [externalBookingUrl, setExternalBookingUrl] = useState("");
  
  // Real-time rates from API (HotelBeds, etc.)
  const [liveRates, setLiveRates] = useState<any[]>([]);
  const [liveAvailability, setLiveAvailability] = useState<number | null>(null);
  const [fetchingLiveRates, setFetchingLiveRates] = useState(false);

  // Helper to create slug from room name
  const slugifyRoomName = (name: string) => {
    return name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
  };

  // Scroll to top when page loads
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [propertySlug, roomSlug]);

  useEffect(() => {
    if (propertySlug && roomSlug) {
      fetchData();
    }
  }, [propertySlug, roomSlug]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Check if propertySlug is a UUID or slug
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(propertySlug || "");
      
      // Use public view for unauthenticated access
      let query = supabase.from("public_properties").select("*");
      
      if (isUuid) {
        query = query.eq("id", propertySlug);
      } else {
        query = query.eq("slug", propertySlug);
      }
      
      const { data: propertyData, error: propertyError } = await query.single();

      if (propertyError) throw propertyError;
      
      setProperty(propertyData);

      // Find the room type by matching slugified name
      const amenitiesData = propertyData.amenities as any;
      const roomTypes = amenitiesData?.room_types || [];
      const foundRoom = roomTypes.find((r: RoomType) => 
        slugifyRoomName(r.name) === roomSlug || r.id === roomSlug
      );
      
      if (foundRoom) {
        setRoom(foundRoom);
        
        // Fetch rates for this room
        const { data: ratesData } = await supabase
          .from("property_rates")
          .select("room_type, rate_type, meal_type, amount, currency")
          .eq("property_id", propertyData.id)
          .eq("room_type", foundRoom.name)
          .order("rate_type");

        if (ratesData) {
          setRates(ratesData);
        }

        // Fetch availability AND rates for today from pms_availability_cache
        // Try multiple ID formats: pmsRoomId, id, slugified name
        const roomId = foundRoom.pmsRoomId || foundRoom.id;
        const slugifiedName = slugifyRoomName(foundRoom.name);
        const today = new Date().toISOString().split('T')[0];
        
        // Try with roomId first
        let { data: availData } = await supabase
          .from("pms_availability_cache")
          .select("available_units, date, rates")
          .eq("property_id", propertyData.id)
          .eq("external_room_type_id", roomId)
          .gte("date", today)
          .order("date", { ascending: true })
          .limit(1);

        // If no data found, try with slugified room name
        if ((!availData || availData.length === 0) && slugifiedName !== roomId) {
          const { data: slugAvailData } = await supabase
            .from("pms_availability_cache")
            .select("available_units, date, rates")
            .eq("property_id", propertyData.id)
            .eq("external_room_type_id", slugifiedName)
            .gte("date", today)
            .order("date", { ascending: true })
            .limit(1);
          
          availData = slugAvailData;
        }

        if (availData && availData.length > 0) {
          setAvailableUnits(availData[0].available_units);
          // Extract rates from cache if available
          if (availData[0].rates) {
            const ratesObj = availData[0].rates as any;
            setCachedRate({
              currency: ratesObj.currency || 'ZAR',
              room_amount: ratesObj.room_amount,
              adult_amount_1: ratesObj.adult_amount_1,
              adult_amount_2: ratesObj.adult_amount_2,
            });
          }
        }
      }

      // Fetch NightsBridge agent code if this is a NightsBridge property
      if (propertyData.external_system === "nightsbridge") {
        // Use public view that doesn't require authentication
        const { data: nbConfig } = await supabase
          .from("public_nightsbridge_config")
          .select("agent_code")
          .maybeSingle();
        
        if (nbConfig?.agent_code) {
          setNightsBridgeAgentCode(nbConfig.agent_code);
        }
      }
    } catch (error) {
      console.error("Error fetching room:", error);
    } finally {
      setLoading(false);
    }
  };

  const nextImage = () => {
    if (room?.images?.length) {
      setCurrentImageIndex((prev) => 
        prev === (room.images?.length || 1) - 1 ? 0 : prev + 1
      );
    }
  };

  const prevImage = () => {
    if (room?.images?.length) {
      setCurrentImageIndex((prev) => 
        prev === 0 ? (room.images?.length || 1) - 1 : prev - 1
      );
    }
  };

  // Check if this is a NightsBridge property
  const isNightsBridgeProperty = property?.external_system === "nightsbridge";
  
  // Check if this is a Benson property (supports direct booking)
  const isBensonProperty = property?.external_system?.toLowerCase() === "benson";
  
  // Check if this is a HotelBeds property
  const isHotelBedsProperty = property?.external_system === "hotelbeds";
  
  // Check if this is a Hostfully property
  const isHostfullyProperty = property?.external_system === "hostfully";
  
  // Fetch real-time rates for HotelBeds or Hostfully properties
  const fetchLiveRates = async () => {
    if (!property?.id || !room) return;
    
    setFetchingLiveRates(true);
    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + 14);
    const end = endDate.toISOString().split('T')[0];

    try {
      // Determine which API to call based on external_system
      const apiName = isHostfullyProperty ? 'hostfully-api' : 'hotelbeds-api';
      
      const { data, error } = await supabase.functions.invoke(apiName, {
        body: {
          action: 'fetch_availability',
          property_id: property.id,
          start_date: today,
          end_date: end,
        }
      });
      
      if (error) {
        console.error(`${apiName} API error:`, error);
        return;
      }
      
      if (data?.success && data?.data?.room_types) {
        // Include hostfullyId in room matching for Hostfully properties
        const roomAny = room as any;
        const roomId = room.pmsRoomId || roomAny.hostfullyId || room.id;
        const matchedRoom = data.data.room_types.find((rt: any) => 
          (rt.room_type_id || rt.id) === roomId || 
          rt.name === room.name
        );
        
        if (matchedRoom) {
          // Extract availability - include availability_per_night for Hostfully
          const availArray = matchedRoom.rooms_available_per_night || matchedRoom.dailyAvailability || matchedRoom.availability_per_night || [];
          const todayData = availArray.find((d: any) => d.date === today) || availArray[0];
          if (todayData) {
            setLiveAvailability(todayData.available_units ?? todayData.availableUnits ?? 1);
          }
          
          // Extract rates
          const rateTypes = matchedRoom.rate_types || matchedRoom.rateTypes || [];
          setLiveRates(rateTypes);
        }
      }
    } catch (error) {
      console.error('Failed to fetch live rates:', error);
    } finally {
      setFetchingLiveRates(false);
    }
  };
  
  // Fetch live rates for HotelBeds or Hostfully on load
  useEffect(() => {
    if ((isHotelBedsProperty || isHostfullyProperty) && property?.id && room && !fetchingLiveRates && liveRates.length === 0) {
      fetchLiveRates();
    }
  }, [property?.id, room, isHotelBedsProperty, isHostfullyProperty]);
  
  // Get NightsBridge BBID from property
  const getNightsBridgeBBID = (): string | null => {
    if (!property) return null;
    // Check external_id first (primary location when external_system is nightsbridge)
    if (property.external_id) return property.external_id;
    // Fallback to amenities.external_ids.nightsbridge_bb_id
    return property.amenities?.external_ids?.nightsbridge_bb_id || null;
  };

  // Check if this is a manual/self-managed property (including native ROL'OS)
  const normalizedExternalSystem = property?.external_system?.toLowerCase() || null;
  const isManualRatesProperty = normalizedExternalSystem === 'none' || normalizedExternalSystem === 'roomsonline' || (!normalizedExternalSystem && !!room);
  
  const handleCheckAvailability = () => {
    // For NightsBridge properties, show modal then redirect to NightsBridge booking
    if (isNightsBridgeProperty) {
      const bbid = getNightsBridgeBBID();
      if (bbid && nightsBridgeAgentCode) {
        const bookingUrl = getNightsBridgeBookingUrl(bbid, nightsBridgeAgentCode, undefined, undefined, currency);
        setExternalBookingUrl(bookingUrl);
        setShowLeavingModal(true);
        return;
      }
    }
    
    // For Benson, HotelBeds, or Hostfully properties: navigate to availability calendar
    if ((isBensonProperty || isHotelBedsProperty || isHostfullyProperty) && property && room) {
      const roomSlugName = slugifyRoomName(room.name);
      const params = new URLSearchParams(window.location.search);
      const queryString = params.toString();
      navigate(`/property/${property.slug || property.id}/room/${roomSlugName}/availability${queryString ? `?${queryString}` : ''}`);
      return;
    }
    
    // For manual rates properties, check if we have dates in URL params
    if (isManualRatesProperty && property && room) {
      const checkInParam = searchParams.get('checkIn');
      const checkOutParam = searchParams.get('checkOut');
      
      // If we have dates in URL, auto-add to cart and navigate to checkout
      if (checkInParam && checkOutParam) {
        const checkIn = new Date(checkInParam);
        const checkOut = new Date(checkOutParam);
        const nights = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
        const roomRate = getLowestRate() || 0;
        
        addStay({
          property_id: property.id,
          property_name: property.name,
          property_slug: property.slug || property.id,
          property_image: (property.amenities as any)?.images?.[0] || '',
          external_system: property.external_system || 'none',
          dates: {
            check_in: checkInParam,
            check_out: checkOutParam,
          },
          rooms: [{
            room_type_id: room.id,
            room_type_name: room.name,
            quantity: 1,
            rate_per_night: roomRate,
            total_price: roomRate * nights,
          }],
          guests: { adults: 2, children: 0, infants: 0 },
          price_breakdown: {
            subtotal: roomRate * nights,
            fees: [],
            taxes: [],
            total: roomRate * nights,
          },
          availability_status: 'available',
          nights,
        });
        
        toast.success(`Added ${room.name} to your journey!`);
        navigate(`/property/${property.slug || property.id}#checkout`);
        return;
      }
      
      // No dates - navigate to property page and trigger date picker
      navigate(`/property/${property.slug || property.id}?selectDates=true&roomTypeId=${room.id}&roomTypeName=${encodeURIComponent(room.name)}`);
      return;
    }
    
    // Fallback: go back to property page
    if (property) {
      navigate(`/property/${property.slug || property.id}`);
    }
  };

  if (loading) {
    const LoadingLayout = earlyWhiteLabel ? WhiteLabelLayout : PublicLayout;
    return (
      <LoadingLayout>
        <div className="h-[50vh] bg-muted animate-pulse" />
        <div className="container mx-auto px-4 py-8">
          <Skeleton className="h-10 w-1/3 mb-4" />
          <Skeleton className="h-6 w-1/4 mb-8" />
          <div className="grid md:grid-cols-2 gap-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-48" />
          </div>
        </div>
      </LoadingLayout>
    );
  }

  if (!property || !room) {
    const NotFoundLayout = earlyWhiteLabel ? WhiteLabelLayout : PublicLayout;
    return (
      <NotFoundLayout>
        <div className="flex-1 flex items-center justify-center py-16">
          <div className="text-center">
            <Bed className="h-16 w-16 mx-auto mb-4 text-muted-foreground/30" />
            <h1 className="font-display text-2xl font-light mb-4">Room Not Found</h1>
            <p className="text-muted-foreground mb-6">The room you're looking for doesn't exist.</p>
            <Link to="/">
              <Button>Return Home</Button>
            </Link>
          </div>
        </div>
      </NotFoundLayout>
    );
  }

  const images = Array.isArray(room.images) 
    ? room.images.map((img: any) => typeof img === 'string' ? img : img?.url).filter(Boolean)
    : [];
  const facilities = room.facilities || [];
  const amenities = room.amenities || [];
  // Use liveAvailability if available, fallback to cached
  const displayedAvailability = liveAvailability ?? availableUnits;
  
  // Calculate lowest rate from linked rate types first, then live rates, cachedRate, dailyRate, pms_rates, property_rates
  const getLowestRate = (): number | null => {
    const roomAny = room as any;
    
    // First check linked rate types (wizard-configured rates for manual properties)
    if (roomAny?.linkedRateTypes?.length > 0) {
      const pmsRateTypes = property?.amenities?.pms_rate_types || [];
      for (const rateTypeId of roomAny.linkedRateTypes) {
        const rateType = pmsRateTypes.find((rt: any) => rt.id === rateTypeId);
        if (rateType?.baseRate && typeof rateType.baseRate === 'number' && rateType.baseRate > 0) {
          return rateType.baseRate;
        }
      }
    }
    
    // Check direct room rates (baseRate, base_rate, daily_rate)
    if (roomAny?.baseRate && typeof roomAny.baseRate === 'number' && roomAny.baseRate > 0) {
      return roomAny.baseRate;
    }
    if (roomAny?.base_rate && typeof roomAny.base_rate === 'number' && roomAny.base_rate > 0) {
      return roomAny.base_rate;
    }
    
    // Then check live rates (real-time from API for HotelBeds, Hostfully, etc.)
    if (liveRates.length > 0) {
      let lowest: number | null = null;
      liveRates.forEach((rateType: any) => {
        // Check direct rate fields
        if (rateType.room_amount && (lowest === null || rateType.room_amount < lowest)) {
          lowest = rateType.room_amount;
        }
        // Check adult_amounts
        if (rateType.adult_amounts) {
          Object.values(rateType.adult_amounts).forEach((amt: any) => {
            if (typeof amt === 'number' && amt > 0 && (lowest === null || amt < lowest)) lowest = amt;
          });
        }
        // Check nested rates array (HotelBeds format)
        if (rateType.rates?.length > 0) {
          rateType.rates.forEach((dr: any) => {
            const amt = dr.room_amount || dr.adult_amounts?.adult_amount_1;
            if (typeof amt === 'number' && amt > 0 && (lowest === null || amt < lowest)) lowest = amt;
          });
        }
      });
      if (lowest !== null) return lowest;
    }
    
    // Check cached rates from pms_availability_cache (Benson, test data, etc.)
    if (cachedRate) {
      const amt = cachedRate.room_amount || cachedRate.adult_amount_1 || cachedRate.adult_amount_2;
      if (typeof amt === 'number' && amt > 0) {
        return amt;
      }
    }
    
    // Check room.dailyRate (Hostfully cached rate from sync)
    if (roomAny?.dailyRate && typeof roomAny.dailyRate === 'number' && roomAny.dailyRate > 0) {
      return roomAny.dailyRate;
    }
    
    // Then check pms_rates from room data
    if (room.pms_rates && room.pms_rates.length > 0) {
      const validRates = room.pms_rates
        .filter(r => r.roomAmount != null || r.adultAmount1 != null || r.adultAmount2 != null)
        .map(r => r.roomAmount || r.adultAmount1 || r.adultAmount2)
        .filter((amt): amt is number => amt != null && amt > 0);
      
      if (validRates.length > 0) {
        return Math.min(...validRates);
      }
    }
    // Fallback to property_rates table
    if (rates.length > 0) {
      return Math.min(...rates.map(r => r.amount));
    }
    return null;
  };
  const lowestRate = getLowestRate();
  
  // Get room-specific meal types, not property-wide
  const roomMealTypes = room.mealTypes || [];

  // Build occupancy display string - clarify whether it's adults AND children or adults OR children
  const buildOccupancyString = () => {
    const maxPeople = room.maxPeople || 2;
    
    // If both maxAdults and maxChildren are defined and non-zero
    if (room.maxAdults && room.maxChildren !== undefined && room.maxChildren > 0) {
      // Check if combined or separate capacity
      const combined = room.maxAdults + room.maxChildren;
      if (combined === maxPeople) {
        // It's maxAdults + maxChildren = total
        return `Max ${maxPeople} guests (${room.maxAdults} adult${room.maxAdults > 1 ? 's' : ''} + ${room.maxChildren} child${room.maxChildren > 1 ? 'ren' : ''})`;
      } else if (room.maxAdults === maxPeople || room.maxChildren === maxPeople) {
        // It's either/or scenario
        return `Max ${maxPeople} guests (${room.maxAdults} adult${room.maxAdults > 1 ? 's' : ''} or ${room.maxChildren} child${room.maxChildren > 1 ? 'ren' : ''})`;
      }
      // Default combined display
      return `Max ${maxPeople} guests (${room.maxAdults} adult${room.maxAdults > 1 ? 's' : ''} + ${room.maxChildren} child${room.maxChildren > 1 ? 'ren' : ''})`;
    } else if (room.maxAdults) {
      return `Max ${maxPeople} guests (${room.maxAdults} adult${room.maxAdults > 1 ? 's' : ''})`;
    }
    return `Max ${maxPeople} guests`;
  };

  const isWhiteLabel = Boolean(property.brand_override_enabled && property.brand_primary_color);

  const wrapLayout = (content: React.ReactNode) => {
    if (isWhiteLabel) {
      return (
        <WhiteLabelLayout
          propertyName={property.name}
          propertyLogoUrl={property.brand_logo_url}
        >
          {content}
        </WhiteLabelLayout>
      );
    }
    return (
      <PublicLayout 
        transparentHeader 
        backLabel={`Back to ${property.name}`} 
        backTo={`/property/${property.slug || property.id}`}
        hideHeader
      >
        {content}
      </PublicLayout>
    );
  };

  return wrapLayout(
    <>
      {/* Hero Section with Image Gallery - shorter on mobile */}
      <section className="relative h-[40vh] sm:h-[45vh] md:h-[50vh] min-h-[250px] sm:min-h-[300px] max-h-[500px] bg-muted overflow-hidden">
        {images.length > 0 ? (
          <>
            <img
              src={images[currentImageIndex]}
              alt={`${room.name} - Image ${currentImageIndex + 1}`}
              className="w-full h-full object-cover transition-opacity duration-500"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-background/80 via-transparent to-transparent" />
            
            {images.length > 1 && (
              <>
                <button
                  onClick={prevImage}
                  className="absolute left-2 sm:left-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background p-1.5 sm:p-2 rounded-full shadow-lg transition-all"
                >
                  <ChevronLeft className="h-4 w-4 sm:h-6 sm:w-6" />
                </button>
                <button
                  onClick={nextImage}
                  className="absolute right-2 sm:right-4 top-1/2 -translate-y-1/2 bg-background/80 hover:bg-background p-1.5 sm:p-2 rounded-full shadow-lg transition-all"
                >
                  <ChevronRight className="h-4 w-4 sm:h-6 sm:w-6" />
                </button>
                
                <div className="absolute bottom-16 sm:bottom-20 left-1/2 -translate-x-1/2 flex gap-1.5 sm:gap-2">
                  {images.slice(0, 8).map((_, idx) => (
                    <button
                      key={idx}
                      onClick={() => setCurrentImageIndex(idx)}
                      className={cn(
                        "w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full transition-all",
                        idx === currentImageIndex 
                          ? "bg-primary w-4 sm:w-6" 
                          : "bg-background/60 hover:bg-background"
                      )}
                    />
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-muted">
            <div className="text-center text-muted-foreground">
              <Bed className="h-12 w-12 sm:h-20 sm:w-20 mx-auto mb-3 sm:mb-4 opacity-30" />
              <p className="text-xs sm:text-base">No images available</p>
            </div>
          </div>
        )}

        {/* Back Button */}
        <Link 
          to={`/property/${property.slug || property.id}`}
          className="absolute top-3 left-3 sm:top-4 sm:left-4 bg-background/80 hover:bg-background p-1.5 sm:p-2 rounded-full shadow-lg transition-all"
        >
          <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
        </Link>

        {/* Hero Content Overlay */}
        <div className="absolute bottom-0 left-0 right-0 p-4 sm:p-6 md:p-10">
          <div className="container mx-auto">
            <div className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
              <div className="w-full sm:w-auto">
                <Link 
                  to={`/property/${property.slug || property.id}`}
                  className="text-[10px] sm:text-sm text-muted-foreground hover:text-foreground transition-colors mb-1 inline-block"
                >
                  ← {property.name}
                </Link>
                <h1 className="font-display text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-light text-foreground">
                  {room.name}
                </h1>
              </div>
              {room.rateType && (
                <Badge variant="secondary" className="text-[10px] sm:text-xs">
                  {room.rateType}
                </Badge>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Quick Info Bar */}
      <section className="border-b bg-card">
        <div className="container mx-auto px-3 sm:px-4 py-2.5 sm:py-4">
          <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 md:gap-10 text-xs sm:text-sm">
            {room.maxPeople != null && room.maxPeople > 0 && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Users className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                <span>Sleeps {room.maxPeople}</span>
              </div>
            )}
            {room.roomSize != null && room.roomSize > 0 && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Maximize className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                <span>{room.roomSize} m²</span>
              </div>
            )}
            {room.bathrooms != null && room.bathrooms > 0 && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                <Bath className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-primary" />
                <span>{room.bathrooms} bath</span>
              </div>
            )}
            {hasBedConfiguration(room.bedConfiguration) && (
              <Badge variant="secondary" className="capitalize text-[10px] sm:text-xs">
                <Bed className="h-3 w-3 mr-1" />
                {formatBedConfiguration(room.bedConfiguration)}
              </Badge>
            )}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <div className="container mx-auto px-3 sm:px-4 py-6 sm:py-10 pb-24 sm:pb-10">
        <div className="grid lg:grid-cols-3 gap-4 sm:gap-6 lg:gap-8">
          {/* Left Column - Details */}
          <div className="lg:col-span-2 space-y-4 sm:space-y-8">
            {/* Room Summary Card */}
            <Card className="overflow-hidden border-l-4 border-l-primary">
              <CardContent className="p-4 sm:p-6">
                <h2 className="text-lg sm:text-xl md:text-2xl font-bold mb-3 sm:mb-4">{room.name}</h2>
                
                {room.description && (
                  <p className="text-sm sm:text-base text-muted-foreground leading-relaxed mb-4 sm:mb-6 italic">
                    {room.description}
                  </p>
                )}

                {/* Key Info */}
                <div className="space-y-2 sm:space-y-3">

                  {/* Stay Requirements - only show if minStay > 1, hide maxStay if 0 or unavailable */}
                  {(room.minStay && room.minStay > 1) && (
                    <div className="flex items-center gap-3">
                      <Moon className="h-5 w-5 text-primary" />
                      <span className="font-medium">
                        Min Stay {room.minStay} night{room.minStay > 1 ? 's' : ''}
                        {room.maxStay && room.maxStay > 0 && ` | Max Stay ${room.maxStay} night${room.maxStay > 1 ? 's' : ''}`}
                      </span>
                    </div>
                  )}

                  {/* Available Units */}
                  {availableUnits !== null && (
                    <div className="flex items-center gap-3">
                      <Bed className="h-5 w-5 text-primary" />
                      <span className="font-medium">{availableUnits} unit{availableUnits !== 1 ? 's' : ''} available</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Occupancy & Bed Details */}
            <section>
              <h2 className="text-xl font-semibold mb-4">Occupancy & Bed Configuration</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                {/* Bed Configuration Card */}
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Bed className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold">Bed Configuration</h3>
                    </div>
                    <p className="text-muted-foreground">
                      {formatBedConfiguration(room.bedConfiguration)}
                    </p>
                  </CardContent>
                </Card>


                {/* Room Size Card */}
                {room.roomSize != null && room.roomSize > 0 && (
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Maximize className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="font-semibold">Room Size</h3>
                      </div>
                      <p className="text-muted-foreground">
                        <strong className="text-foreground text-2xl">{room.roomSize}</strong> m²
                      </p>
                    </CardContent>
                  </Card>
                )}

                {/* Bathrooms Card */}
                {room.bathrooms != null && room.bathrooms > 0 && (
                  <Card>
                    <CardContent className="p-5">
                      <div className="flex items-center gap-3 mb-3">
                        <div className="p-2 bg-primary/10 rounded-lg">
                          <Bath className="h-5 w-5 text-primary" />
                        </div>
                        <h3 className="font-semibold">Bathrooms</h3>
                      </div>
                      <p className="text-muted-foreground">
                        <strong className="text-foreground">{room.bathrooms}</strong> private en-suite bathroom{room.bathrooms > 1 ? 's' : ''}
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </section>

            {/* Rate Type Info */}
            {room.rateType && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Rate Information</h2>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-3">
                      <Badge variant="secondary" className="text-sm">
                        {room.rateType}
                      </Badge>
                      {room.splitPercent !== undefined && room.splitPercent > 0 && (
                        <span className="text-sm text-muted-foreground">
                          Split: {room.splitPercent}%
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      This {getAccommodationLabel(property).singular.toLowerCase()} uses the <strong>{room.rateType}</strong> rate structure for pricing.
                    </p>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Meal Options - only show if room has meal types */}
            {roomMealTypes.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Meal Options</h2>
                <Card>
                  <CardContent className="p-5">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <UtensilsCrossed className="h-5 w-5 text-primary" />
                      </div>
                      <h3 className="font-semibold">Available Meal Plans</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {roomMealTypes.map((meal, idx) => (
                        <Badge key={idx} variant="outline" className="px-3 py-1.5">
                          {meal}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </section>
            )}

            {/* Facilities */}
            {facilities.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Room Facilities</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {facilities.map((facility, idx) => {
                    const IconComponent = facilityIcons[facility.toLowerCase()] || Sparkles;
                    return (
                      <div 
                        key={idx}
                        className="flex items-center gap-3 p-3 bg-card border rounded-lg"
                      >
                        <IconComponent className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium">{facility}</span>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Amenities */}
            {amenities.length > 0 && (
              <section>
                <h2 className="text-xl font-semibold mb-4">In-Room Amenities</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                  {amenities.map((amenity, idx) => (
                    <div 
                      key={idx}
                      className="flex items-center gap-3 p-3 bg-card border rounded-lg"
                    >
                      <Check className="h-4 w-4 text-primary" />
                      <span className="text-sm font-medium">{amenity}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Extra Person Policy */}
            {room.extraPersonPolicy && (
              <section>
                <h2 className="text-xl font-semibold mb-4">Extra Person Policy</h2>
                <Card>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">{room.extraPersonPolicy}</p>
                  </CardContent>
                </Card>
              </section>
            )}
          </div>

          {/* Right Column - Rates & Booking */}
          <div className="space-y-6">
            {/* Rates Card */}
            <Card className="sticky top-4">
              <CardContent className="p-6">
                {/* Prominent Rate Display */}
                {lowestRate && (
                  <div className="text-center mb-4">
                    <span className="text-sm text-muted-foreground">From </span>
                    <FormattedPrice amount={lowestRate} className="text-3xl font-bold text-primary" />
                    <span className="text-sm text-muted-foreground"> / night</span>
                  </div>
                )}

                {/* Room Quick Facts */}
                <div className="grid grid-cols-2 gap-3 mb-4">
                  {hasBedConfiguration(room.bedConfiguration) && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Bed className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs font-medium truncate">
                        {formatBedConfiguration(room.bedConfiguration)}
                      </span>
                    </div>
                  )}
                  {room.bathrooms != null && room.bathrooms > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Bath className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs font-medium">{room.bathrooms} Bathroom{room.bathrooms > 1 ? 's' : ''}</span>
                    </div>
                  )}
                  {room.roomSize != null && room.roomSize > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Maximize className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs font-medium">{room.roomSize} m²</span>
                    </div>
                  )}
                  {room.maxPeople != null && room.maxPeople > 0 && (
                    <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg">
                      <Users className="h-4 w-4 text-primary shrink-0" />
                      <span className="text-xs font-medium">Sleeps {room.maxPeople}</span>
                    </div>
                  )}
                </div>

                {/* Facilities & Amenities Preview */}
                {(facilities.length > 0 || amenities.length > 0) && (
                  <div className="mb-4">
                    <div className="flex flex-wrap gap-1.5">
                      {[...facilities.slice(0, 4), ...amenities.slice(0, 4)].slice(0, 6).map((item, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs px-2 py-0.5">
                          {item}
                        </Badge>
                      ))}
                      {(facilities.length + amenities.length) > 6 && (
                        <Badge variant="secondary" className="text-xs px-2 py-0.5">
                          +{facilities.length + amenities.length - 6} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <Button className="w-full" size="lg" onClick={handleCheckAvailability}>
                  {isNightsBridgeProperty ? (
                    <>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      Book Now
                    </>
                  ) : (isBensonProperty || isHotelBedsProperty || isHostfullyProperty) ? (
                    <>
                      <Calendar className="mr-2 h-4 w-4" />
                      Check Availability
                    </>
                  ) : isManualRatesProperty ? (
                    <>
                      <Calendar className="mr-2 h-4 w-4" />
                      Select Dates & Book
                    </>
                  ) : (
                    <>
                      <ArrowLeft className="mr-2 h-4 w-4" />
                      View Property
                    </>
                  )}
                </Button>
                
                <p className="text-xs text-center text-muted-foreground mt-3">
                  Contact us for group bookings and special requests
                </p>
              </CardContent>
            </Card>

            {/* Property Link */}
            <Card>
              <CardContent className="p-4">
                <p className="text-sm text-muted-foreground mb-2">This {getAccommodationLabel(property).singular.toLowerCase()} is part of</p>
                <a 
                  href={getPropertyUrl(property.slug || property.id)}
                  className="font-semibold text-primary hover:underline"
                >
                  {property.name}
                </a>
                <p className="text-xs text-muted-foreground mt-1">
                  {property.address}, {property.city}
                </p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Image Gallery Thumbnails - Collapsible Carousel */}
        {images.length > 1 && (
          <GalleryCollapsible
            images={images}
            roomName={room.name}
            currentImageIndex={currentImageIndex}
            onSelect={setCurrentImageIndex}
          />
        )}
      </div>

      {/* Leaving RoomsOnline Modal for NightsBridge */}
      <LeavingRoomsOnlineModal
        open={showLeavingModal}
        onOpenChange={setShowLeavingModal}
        externalUrl={externalBookingUrl}
        propertyName={property.name}
      />
    </>
  );
}

/** Collapsible gallery strip — shows 5 thumbs, expandable */
function GalleryCollapsible({
  images,
  roomName,
  currentImageIndex,
  onSelect,
}: {
  images: string[];
  roomName: string;
  currentImageIndex: number;
  onSelect: (idx: number) => void;
}) {
  const [open, setOpen] = useState(false);
  const previewCount = 5;
  const visibleImages = open ? images : images.slice(0, previewCount);
  const hasMore = images.length > previewCount;

  return (
    <section className="mt-12">
      <Collapsible open={open} onOpenChange={setOpen}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Gallery</h2>
          {hasMore && (
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground">
                {open ? 'Show less' : `+${images.length - previewCount} more`}
                <CollapseIcon className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
              </Button>
            </CollapsibleTrigger>
          )}
        </div>

        {/* Always-visible strip */}
        <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
          {images.slice(0, previewCount).map((img, idx) => (
            <button
              key={idx}
              onClick={() => onSelect(idx)}
              className={cn(
                "flex-shrink-0 w-20 h-20 sm:w-24 sm:h-24 rounded-lg overflow-hidden border-2 transition-all",
                idx === currentImageIndex
                  ? "border-primary ring-2 ring-primary/20"
                  : "border-transparent hover:border-muted-foreground/30"
              )}
            >
              <img src={img} alt={`${roomName} ${idx + 1}`} className="w-full h-full object-cover" />
            </button>
          ))}
        </div>

        {/* Collapsible extra images */}
        <CollapsibleContent>
          <div className="grid grid-cols-4 sm:grid-cols-6 gap-3 mt-3">
            {images.slice(previewCount).map((img, idx) => {
              const realIdx = idx + previewCount;
              return (
                <button
                  key={realIdx}
                  onClick={() => onSelect(realIdx)}
                  className={cn(
                    "aspect-square rounded-lg overflow-hidden border-2 transition-all",
                    realIdx === currentImageIndex
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-transparent hover:border-muted-foreground/30"
                  )}
                >
                  <img src={img} alt={`${roomName} ${realIdx + 1}`} className="w-full h-full object-cover" />
                </button>
              );
            })}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </section>
  );
}
