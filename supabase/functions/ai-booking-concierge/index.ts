import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { findDiningExperience } from "../_shared/delight-engine.ts";

// ============================================================================
// AI BOOKING CONCIERGE
// Parses natural language booking queries, fetches live PMS availability,
// and returns intelligent suggestions with room/date recommendations.
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Request/Response interfaces
interface ConciergeRequest {
  property_id: string;
  user_query: string;
  current_dates?: { check_in: string; check_out: string };
  current_guests?: { adults: number; children: number; infants: number };
  room_types?: { id: string; name: string; max_guests: number }[];
  session_id?: string;
  // NEW: Value-based delight parameters
  current_booking_value?: number;
  session_delight_count?: number;
}

interface ConciergeSuggestion {
  id: string;
  type: 'dates' | 'room' | 'upsell' | 'date_alternative';
  dates?: { check_in: string; check_out: string };
  room?: { id: string; name: string; price_per_night: number; total: number };
  message: string;
  savings?: number;
  is_best_value?: boolean;
}

interface ConciergeResponse {
  suggestions: ConciergeSuggestion[];
  narrative_response: string;
  surprise_gift?: {
    type: 'voucher' | 'upgrade' | 'amenity';
    code?: string;
    description: string;
  };
  proactive_tip?: string;
  parsed_intent?: {
    nights?: number;
    guests?: { adults: number; children: number; infants: number };
    month?: string;
    date_range?: { start: string; end: string };
    preferences?: string[];
  };
}

// ============================================================================
// NLP DATE/GUEST PARSING
// ============================================================================

interface ParsedIntent {
  nights?: number;
  guests?: { adults: number; children: number; infants: number };
  month?: string;
  date_range?: { start: string; end: string };
  preferences?: string[];
}

function parseUserQuery(query: string): ParsedIntent {
  const normalizedQuery = query.toLowerCase();
  const intent: ParsedIntent = {};

  // Parse number of nights
  const nightsMatch = normalizedQuery.match(/(\d+)\s*nights?/);
  if (nightsMatch) {
    intent.nights = parseInt(nightsMatch[1], 10);
  }

  // Parse weekend
  if (normalizedQuery.includes('weekend')) {
    intent.nights = intent.nights || 2;
    intent.preferences = [...(intent.preferences || []), 'weekend'];
  }

  // Parse week/week-long
  if (normalizedQuery.includes('week') && !normalizedQuery.includes('weekend')) {
    intent.nights = 7;
  }

  // Parse guests - "2 adults", "2 adults and 1 child", etc.
  const adultsMatch = normalizedQuery.match(/(\d+)\s*adults?/);
  const childrenMatch = normalizedQuery.match(/(\d+)\s*(?:child(?:ren)?|kids?)/);
  const infantsMatch = normalizedQuery.match(/(\d+)\s*(?:infants?|bab(?:y|ies))/);

  if (adultsMatch || childrenMatch || infantsMatch) {
    intent.guests = {
      adults: adultsMatch ? parseInt(adultsMatch[1], 10) : 2,
      children: childrenMatch ? parseInt(childrenMatch[1], 10) : 0,
      infants: infantsMatch ? parseInt(infantsMatch[1], 10) : 0,
    };
  }

  // Parse "for X people/guests"
  const peopleMatch = normalizedQuery.match(/for\s*(\d+)\s*(?:people|guests?|persons?)/);
  if (peopleMatch && !intent.guests) {
    intent.guests = {
      adults: parseInt(peopleMatch[1], 10),
      children: 0,
      infants: 0,
    };
  }

  // Parse month names
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june',
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  for (const month of months) {
    if (normalizedQuery.includes(month)) {
      intent.month = month;
      break;
    }
  }

  // Parse relative time references
  if (normalizedQuery.includes('next week')) {
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + ((8 - today.getDay()) % 7) || 7);
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    
    intent.date_range = {
      start: nextMonday.toISOString().split('T')[0],
      end: nextSunday.toISOString().split('T')[0],
    };
    intent.nights = intent.nights || 7;
  }

  if (normalizedQuery.includes('this weekend')) {
    const today = new Date();
    const friday = new Date(today);
    friday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7) || 7);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    
    intent.date_range = {
      start: friday.toISOString().split('T')[0],
      end: sunday.toISOString().split('T')[0],
    };
    intent.nights = 2;
  }

  if (normalizedQuery.includes('next weekend')) {
    const today = new Date();
    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7) + 7);
    const nextSunday = new Date(nextFriday);
    nextSunday.setDate(nextFriday.getDate() + 2);
    
    intent.date_range = {
      start: nextFriday.toISOString().split('T')[0],
      end: nextSunday.toISOString().split('T')[0],
    };
    intent.nights = 2;
  }

  // Parse preferences
  const preferenceKeywords = ['quiet', 'romantic', 'luxury', 'budget', 'family', 'pet', 'pool', 'view', 'ocean', 'mountain'];
  intent.preferences = preferenceKeywords.filter(kw => normalizedQuery.includes(kw));

  return intent;
}

// ============================================================================
// DATE GENERATION HELPERS
// ============================================================================

function generateDateSuggestions(
  intent: ParsedIntent,
  nights: number = 3
): { check_in: string; check_out: string }[] {
  const suggestions: { check_in: string; check_out: string }[] = [];
  const today = new Date();
  const targetNights = intent.nights || nights;

  // If specific date range was parsed
  if (intent.date_range) {
    suggestions.push({
      check_in: intent.date_range.start,
      check_out: intent.date_range.end,
    });
    return suggestions;
  }

  // If month specified, find good dates in that month
  if (intent.month) {
    const monthIndex = [
      'january', 'february', 'march', 'april', 'may', 'june',
      'july', 'august', 'september', 'october', 'november', 'december'
    ].indexOf(intent.month);
    
    if (monthIndex >= 0) {
      let year = today.getFullYear();
      // If the month has passed this year, use next year
      if (monthIndex < today.getMonth()) {
        year += 1;
      }
      
      // Generate 3 suggestions within the month
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      const startDays = [1, 10, 20].filter(d => d + targetNights <= daysInMonth);
      
      for (const startDay of startDays.slice(0, 3)) {
        const checkIn = new Date(year, monthIndex, startDay);
        const checkOut = new Date(checkIn);
        checkOut.setDate(checkIn.getDate() + targetNights);
        
        // Skip past dates
        if (checkIn > today) {
          suggestions.push({
            check_in: checkIn.toISOString().split('T')[0],
            check_out: checkOut.toISOString().split('T')[0],
          });
        }
      }
    }
  }

  // Fallback: generate suggestions starting from next week
  if (suggestions.length === 0) {
    for (let offset = 7; offset <= 28; offset += 7) {
      const checkIn = new Date(today);
      checkIn.setDate(today.getDate() + offset);
      const checkOut = new Date(checkIn);
      checkOut.setDate(checkIn.getDate() + targetNights);
      
      suggestions.push({
        check_in: checkIn.toISOString().split('T')[0],
        check_out: checkOut.toISOString().split('T')[0],
      });
      
      if (suggestions.length >= 3) break;
    }
  }

  return suggestions.slice(0, 3);
}

// ============================================================================
// PMS AVAILABILITY FETCHING (LIVE - RULE #1)
// ============================================================================

async function fetchLiveAvailability(
  supabase: any,
  propertyId: string,
  dates: { check_in: string; check_out: string }
): Promise<{ available: boolean; rates: { room_type_id: string; name: string; rate: number; total: number }[] } | null> {
  try {
    // Get property info to determine external system
    const { data: property } = await supabase
      .from("properties")
      .select("external_system, external_id, owner_pms_credential_id, currency")
      .eq("id", propertyId)
      .maybeSingle();

    if (!property) {
      console.log("[Concierge] Property not found:", propertyId);
      return null;
    }

    const externalSystem = property.external_system || 'none';
    console.log(`[Concierge] Fetching live availability from ${externalSystem} for ${dates.check_in} - ${dates.check_out}`);

    // Route to appropriate PMS adapter
    let pmsResponse;
    
    switch (externalSystem) {
      case 'hostfully':
        pmsResponse = await supabase.functions.invoke('hostfully-api', {
          body: {
            action: 'fetch_availability',
            property_id: propertyId,
            start_date: dates.check_in,
            end_date: dates.check_out,
          }
        });
        break;
        
      case 'benson':
        pmsResponse = await supabase.functions.invoke('benson-api', {
          body: {
            action: 'get_availability',
            property_id: propertyId,
            start_date: dates.check_in,
            end_date: dates.check_out,
          }
        });
        break;
        
      case 'hotelbeds':
        pmsResponse = await supabase.functions.invoke('hotelbeds-api', {
          body: {
            action: 'fetch_availability',
            property_id: propertyId,
            start_date: dates.check_in,
            end_date: dates.check_out,
          }
        });
        break;
        
      default:
        // For native/manual properties, check pms_availability_cache
        const { data: cacheData } = await supabase
          .from("pms_availability_cache")
          .select("*")
          .eq("property_id", propertyId)
          .gte("date", dates.check_in)
          .lte("date", dates.check_out);
        
        if (cacheData && cacheData.length > 0) {
          const nights = Math.ceil(
            (new Date(dates.check_out).getTime() - new Date(dates.check_in).getTime()) / (1000 * 60 * 60 * 24)
          );
          
          // Check if all nights are available
          const allAvailable = cacheData.every((day: any) => day.is_available && day.available_units > 0);
          const avgRate = cacheData.reduce((sum: number, day: any) => sum + (day.rate || 0), 0) / cacheData.length;
          
          return {
            available: allAvailable,
            rates: [{
              room_type_id: 'default',
              name: 'Standard Room',
              rate: avgRate,
              total: avgRate * nights,
            }]
          };
        }
        
        // No cache data, return unavailable
        return { available: false, rates: [] };
    }

    // Parse PMS response
    if (pmsResponse?.error) {
      console.error("[Concierge] PMS error:", pmsResponse.error);
      return null;
    }

    const data = pmsResponse?.data;
    if (!data?.success && !data?.room_types) {
      console.log("[Concierge] No availability data from PMS");
      return null;
    }

    // Extract room types and rates
    const roomTypes = data?.data?.room_types || data?.room_types || [];
    const nights = Math.ceil(
      (new Date(dates.check_out).getTime() - new Date(dates.check_in).getTime()) / (1000 * 60 * 60 * 24)
    );

    const rates = roomTypes.map((rt: any) => {
      // Find rate for date range
      const rateTypes = rt.rate_types || [];
      const firstRateType = rateTypes[0] || {};
      const ratesList = firstRateType.rates || [];
      
      // Calculate average rate across nights
      let totalRate = 0;
      let rateCount = 0;
      for (const r of ratesList) {
        if (r.room_amount) {
          totalRate += r.room_amount;
          rateCount++;
        }
      }
      const avgRate = rateCount > 0 ? totalRate / rateCount : 0;

      // Check availability
      const availPerNight = rt.availability_per_night || [];
      const allAvailable = availPerNight.every((a: any) => 
        (a.available_units > 0) && !a.restrictions?.stop_sell
      );

      return {
        room_type_id: rt.room_type_id || rt.id,
        name: rt.name || 'Room',
        rate: avgRate,
        total: avgRate * nights,
        available: allAvailable,
      };
    }).filter((r: any) => r.available && r.rate > 0);

    return {
      available: rates.length > 0,
      rates,
    };

  } catch (error) {
    console.error("[Concierge] Error fetching availability:", error);
    return null;
  }
}

// ============================================================================
// AI NARRATIVE GENERATION
// ============================================================================

async function generateNarrativeResponse(
  intent: ParsedIntent,
  suggestions: ConciergeSuggestion[],
  propertyName: string
): Promise<string> {
  // Build a friendly narrative based on what we found
  const parts: string[] = [];

  if (suggestions.length === 0) {
    return `I couldn't find any available dates matching your request at ${propertyName}. Try adjusting your dates or guest count, or select dates manually below.`;
  }

  // Opening based on intent
  if (intent.month) {
    parts.push(`Great choice! Here's what I found for ${intent.month.charAt(0).toUpperCase() + intent.month.slice(1)}:`);
  } else if (intent.nights) {
    parts.push(`I found ${suggestions.length} lovely ${intent.nights}-night options for you:`);
  } else {
    parts.push(`Here are some perfect dates for your stay at ${propertyName}:`);
  }

  // Highlight best value
  const bestValue = suggestions.find(s => s.is_best_value);
  if (bestValue && bestValue.savings && bestValue.savings > 0) {
    parts.push(`The highlighted option saves you R${bestValue.savings}!`);
  }

  return parts.join(' ');
}

// ============================================================================
// SURPRISE & DELIGHT - VALUE-BASED, DESTINATION-AWARE
// ============================================================================

type DelightTier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';

interface Delight {
  type: 'tip' | 'upgrade' | 'amenity' | 'voucher' | 'experience';
  message: string;
  code?: string;
  destinationContext?: string;
  icon: string;
  tier: DelightTier;
}

/**
 * Calculate delight tier based on booking value in ZAR
 * NONE: < R5,000 | BRONZE: R5k-9.9k | SILVER: R10k-24.9k | GOLD: R25k-49.9k | PLATINUM: R50k+
 */
function calculateDelightTier(bookingValue: number): DelightTier {
  if (bookingValue < 5000) return 'none';
  if (bookingValue < 10000) return 'bronze';
  if (bookingValue < 25000) return 'silver';
  if (bookingValue < 50000) return 'gold';
  return 'platinum';
}

function getMaxDelightsForTier(tier: DelightTier): number {
  switch (tier) {
    case 'none': return 0;
    case 'bronze': return 1;
    case 'silver': return 2;
    case 'gold': return 2;
    case 'platinum': return 2;
    default: return 0;
  }
}

function generateVoucherCode(city: string, tier: DelightTier): string {
  const prefix = tier === 'platinum' ? 'VIP' : 'EXPLORE';
  const cityCode = (city || 'AFR').substring(0, 3).toUpperCase();
  const random = Date.now().toString(36).slice(-4).toUpperCase();
  return `${prefix}-${cityCode}-${random}`;
}

/**
 * Generate destination-aware delight based on booking value and local experiences
 */
async function generateValueBasedDelight(
  supabase: any,
  propertyId: string,
  bookingValue: number,
  sessionId: string,
  sessionDelightCount: number
): Promise<ConciergeResponse['surprise_gift'] | undefined> {
  const tier = calculateDelightTier(bookingValue);
  const maxDelights = getMaxDelightsForTier(tier);
  
  // Check if we've hit the limit for this session
  if (sessionDelightCount >= maxDelights) {
    console.log(`[Concierge] Session ${sessionId} has reached max delights (${maxDelights})`);
    return undefined;
  }

  if (tier === 'none') {
    console.log(`[Concierge] Booking value R${bookingValue} below R5k threshold - no delight`);
    return undefined;
  }

  try {
    // Get property destination info
    const { data: property } = await supabase
      .from('properties')
      .select('city, country, highlights, tagline')
      .eq('id', propertyId)
      .single();

    const city = property?.city || 'Africa';
    const country = property?.country || '';

    // Fetch local experiences for this destination
    const { data: experiences } = await supabase
      .from('local_experiences')
      .select('*')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .limit(10);

    console.log(`[Concierge] Generating ${tier} tier delight for R${bookingValue} booking in ${city}`);

    let delight: Delight | null = null;

    // BRONZE: Simple destination tip
    if (tier === 'bronze') {
      const nature = experiences?.find((e: any) => e.category === 'nature');
      const culture = experiences?.find((e: any) => e.category === 'culture');
      const experience = nature || culture;
      
      if (experience) {
        delight = {
          type: 'tip',
          icon: nature ? '🌿' : '🎨',
          message: `Local tip: Don't miss ${experience.title}!`,
          destinationContext: experience.why_locals_love_it || `A must-see experience in ${city}.`,
          tier,
        };
      } else {
        delight = {
          type: 'tip',
          icon: '✨',
          message: `Welcome to ${city}! You're in for a treat.`,
          destinationContext: `${city}${country ? `, ${country}` : ''} offers unforgettable experiences.`,
          tier,
        };
      }
    }

    // SILVER: Experience voucher
    if (tier === 'silver') {
      const adventure = experiences?.find((e: any) => e.category === 'adventure');
      const activity = experiences?.find((e: any) => 
        e.category === 'nature' || e.category === 'culture' || e.category === 'wellness'
      );
      const experience = adventure || activity;

      delight = {
        type: 'experience',
        icon: '🎁',
        message: `I've arranged something special – 15% off ${experience?.title || 'a local adventure'}!`,
        code: generateVoucherCode(city, tier),
        destinationContext: experience?.why_locals_love_it || 
          `${city} is known for its ${experience?.category || 'natural beauty'}.`,
        tier,
      };
    }

    // GOLD: Premium upgrade
    if (tier === 'gold') {
      const dining = findDiningExperience(experiences);
      const wellness = experiences?.find((e: any) => e.category === 'wellness');
      const premium = dining || wellness;

      delight = {
        type: 'upgrade',
        icon: '🌟',
        message: premium 
          ? `VIP upgrade: Complimentary experience at ${premium.title}!`
          : `VIP treatment: I've flagged your booking for a room upgrade!`,
        code: generateVoucherCode(city, tier),
        destinationContext: premium?.why_locals_love_it || `Enjoy the finest ${city} has to offer.`,
        tier,
      };
    }

    // PLATINUM: Premium package with dining
    if (tier === 'platinum') {
      const dining = findDiningExperience(experiences);
      
      delight = {
        type: 'voucher',
        icon: '✨',
        message: dining
          ? `VIP treatment awaits – complimentary dinner for two at ${dining.title}!`
          : `VIP treatment awaits – complimentary dinner for two at our partner restaurant!`,
        code: generateVoucherCode(city, tier),
        destinationContext: dining?.why_locals_love_it || 
          `A signature ${city} dining experience curated just for you.`,
        tier,
      };
    }

    if (delight) {
      console.log(`[Concierge] Generated ${tier} delight: ${delight.type}`);
      return {
        type: delight.type as 'voucher' | 'upgrade' | 'amenity',
        code: delight.code,
        description: `${delight.icon} ${delight.message}${delight.destinationContext ? `\n\n${delight.destinationContext}` : ''}`,
      };
    }

    return undefined;
  } catch (error) {
    console.error('[Concierge] Error generating value-based delight:', error);
    return undefined;
  }
}

// Legacy fallback for sessions without booking value
function generateSurpriseGift(sessionId?: string): ConciergeResponse['surprise_gift'] | undefined {
  // 10% chance of surprise, tracked by session
  if (!sessionId) return undefined;
  
  // Use session ID as seed for deterministic randomness
  const hash = sessionId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const random = (hash % 100) / 100;
  
  if (random < 0.10) {
    const surprises = [
      { type: 'amenity' as const, description: "🎁 I've arranged a complimentary bottle of wine for your arrival!" },
      { type: 'amenity' as const, description: "🌸 I've noted a request for fresh flowers in your room!" },
      { type: 'upgrade' as const, description: "✨ I've flagged your booking for a possible room upgrade!" },
    ];
    
    const surprise = surprises[hash % surprises.length];
    return surprise;
  }
  
  return undefined;
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ConciergeRequest = await req.json();
    const { property_id, user_query, current_dates, current_guests, room_types, session_id, current_booking_value, session_delight_count } = body;

    if (!property_id || !user_query) {
      return new Response(
        JSON.stringify({ error: "property_id and user_query are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Concierge] Processing query for property ${property_id}: "${user_query}"`);

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get property info
    const { data: property } = await supabase
      .from("properties")
      .select("name, external_system, currency")
      .eq("id", property_id)
      .maybeSingle();

    const propertyName = property?.name || "this property";
    const currency = property?.currency || "ZAR";

    // Parse user intent
    const intent = parseUserQuery(user_query);
    console.log("[Concierge] Parsed intent:", intent);

    // Apply defaults from current context
    if (!intent.guests && current_guests) {
      intent.guests = current_guests;
    }

    // Generate date suggestions based on intent
    const dateSuggestions = generateDateSuggestions(intent, intent.nights || 3);
    console.log("[Concierge] Date suggestions:", dateSuggestions);

    // Fetch live availability for each date suggestion (RULE #1 - NO CACHE)
    const suggestions: ConciergeSuggestion[] = [];
    
    for (const dates of dateSuggestions) {
      const availability = await fetchLiveAvailability(supabase, property_id, dates);
      
      if (availability && availability.available && availability.rates.length > 0) {
        // Find best rate
        const sortedRates = [...availability.rates].sort((a, b) => a.total - b.total);
        const bestRate = sortedRates[0];
        
        // Find room name from provided room_types if available
        const roomInfo = room_types?.find(rt => rt.id === bestRate.room_type_id);
        const roomName = roomInfo?.name || bestRate.name;

        const nights = Math.ceil(
          (new Date(dates.check_out).getTime() - new Date(dates.check_in).getTime()) / (1000 * 60 * 60 * 24)
        );

        suggestions.push({
          id: crypto.randomUUID(),
          type: 'room',
          dates,
          room: {
            id: bestRate.room_type_id,
            name: roomName,
            price_per_night: bestRate.rate,
            total: bestRate.total,
          },
          message: `${roomName} · ${nights} nights · ${currency} ${Math.round(bestRate.rate).toLocaleString()}/night`,
          is_best_value: suggestions.length === 0, // First available option is "best value"
        });

        // If there's a more expensive room, add as upsell
        if (sortedRates.length > 1) {
          const premiumRate = sortedRates[sortedRates.length - 1];
          if (premiumRate.total > bestRate.total) {
            const premiumRoomInfo = room_types?.find(rt => rt.id === premiumRate.room_type_id);
            const premiumName = premiumRoomInfo?.name || premiumRate.name;
            const priceDiff = premiumRate.total - bestRate.total;

            suggestions.push({
              id: crypto.randomUUID(),
              type: 'upsell',
              dates,
              room: {
                id: premiumRate.room_type_id,
                name: premiumName,
                price_per_night: premiumRate.rate,
                total: premiumRate.total,
              },
              message: `Upgrade to ${premiumName} · +${currency} ${Math.round(priceDiff).toLocaleString()}`,
            });
          }
        }
      }
    }

    // Calculate savings if we have multiple suggestions
    if (suggestions.length >= 2) {
      const prices = suggestions.filter(s => s.room?.total).map(s => s.room!.total);
      const lowestPrice = Math.min(...prices);
      const highestPrice = Math.max(...prices);
      
      // Mark the cheapest as best value with savings
      suggestions.forEach(s => {
        if (s.room?.total === lowestPrice && highestPrice > lowestPrice) {
          s.is_best_value = true;
          s.savings = highestPrice - lowestPrice;
        }
      });
    }

    // Generate narrative response
    const narrativeResponse = await generateNarrativeResponse(intent, suggestions, propertyName);

    // Check for surprise gift - use value-based system if booking value provided
    let surpriseGift: ConciergeResponse['surprise_gift'] | undefined;
    
    if (current_booking_value !== undefined && current_booking_value > 0) {
      // NEW: Value-based, destination-aware delight system
      surpriseGift = await generateValueBasedDelight(
        supabase,
        property_id,
        current_booking_value,
        session_id || 'anonymous',
        session_delight_count || 0
      );
    } else {
      // Legacy: Random 10% chance fallback
      surpriseGift = generateSurpriseGift(session_id);
    }

    // Build response
    const response: ConciergeResponse = {
      suggestions: suggestions.slice(0, 5), // Max 5 suggestions
      narrative_response: narrativeResponse,
      parsed_intent: intent,
    };

    if (surpriseGift) {
      response.surprise_gift = surpriseGift;
    }

    // Add proactive tip based on property
    if (suggestions.length > 0 && property?.external_system === 'hostfully') {
      response.proactive_tip = "💡 This property offers flexible cancellation. Book with confidence!";
    }

    console.log(`[Concierge] Returning ${suggestions.length} suggestions`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Concierge] Error:", error);
    
    // Handle rate limiting
    if (error instanceof Error && error.message.includes('429')) {
      return new Response(
        JSON.stringify({ error: "I'm a bit busy right now. Please try again in a moment!" }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        error: "I'm having a moment – please try again!",
        narrative_response: "I'm having trouble right now. Try selecting dates manually below.",
        suggestions: [],
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
