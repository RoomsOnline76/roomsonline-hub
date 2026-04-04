import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { findDiningExperience } from "../_shared/delight-engine.ts";

// ============================================================================
// AI BOOKING CONCIERGE — Intelligent Sales Agent
// Uses Lovable AI to generate persuasive, context-aware responses.
// Fetches live PMS availability, property context, local experiences,
// and cross-sells owner's other properties when unavailable.
// ============================================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const AI_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

interface ConciergeRequest {
  property_id: string;
  user_query: string;
  current_dates?: { check_in: string; check_out: string };
  current_guests?: { adults: number; children: number; infants: number };
  room_types?: { id: string; name: string; max_guests: number }[];
  session_id?: string;
  current_booking_value?: number;
  session_delight_count?: number;
  conversation_history?: { role: string; content: string }[];
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
  parsed_intent?: ParsedIntent;
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
  budget?: { max?: number; min?: number; currency?: string };
  room_preference?: string;
}

function parseUserQuery(query: string): ParsedIntent {
  const normalizedQuery = query.toLowerCase();
  const intent: ParsedIntent = {};

  const nightsMatch = normalizedQuery.match(/(\d+)\s*nights?/);
  if (nightsMatch) intent.nights = parseInt(nightsMatch[1], 10);

  if (normalizedQuery.includes('weekend')) {
    intent.nights = intent.nights || 2;
    intent.preferences = [...(intent.preferences || []), 'weekend'];
  }
  if (normalizedQuery.includes('week') && !normalizedQuery.includes('weekend')) {
    intent.nights = 7;
  }

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

  const peopleMatch = normalizedQuery.match(/for\s*(\d+)\s*(?:people|guests?|persons?)/);
  if (peopleMatch && !intent.guests) {
    intent.guests = { adults: parseInt(peopleMatch[1], 10), children: 0, infants: 0 };
  }

  const months = ['january','february','march','april','may','june','july','august','september','october','november','december'];
  for (const month of months) {
    if (normalizedQuery.includes(month)) { intent.month = month; break; }
  }

  if (normalizedQuery.includes('next week')) {
    const today = new Date();
    const nextMonday = new Date(today);
    nextMonday.setDate(today.getDate() + ((8 - today.getDay()) % 7) || 7);
    const nextSunday = new Date(nextMonday);
    nextSunday.setDate(nextMonday.getDate() + 6);
    intent.date_range = { start: nextMonday.toISOString().split('T')[0], end: nextSunday.toISOString().split('T')[0] };
    intent.nights = intent.nights || 7;
  }
  if (normalizedQuery.includes('this weekend')) {
    const today = new Date();
    const friday = new Date(today);
    friday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7) || 7);
    const sunday = new Date(friday);
    sunday.setDate(friday.getDate() + 2);
    intent.date_range = { start: friday.toISOString().split('T')[0], end: sunday.toISOString().split('T')[0] };
    intent.nights = 2;
  }
  if (normalizedQuery.includes('next weekend')) {
    const today = new Date();
    const nextFriday = new Date(today);
    nextFriday.setDate(today.getDate() + ((5 - today.getDay() + 7) % 7) + 7);
    const nextSunday = new Date(nextFriday);
    nextSunday.setDate(nextFriday.getDate() + 2);
    intent.date_range = { start: nextFriday.toISOString().split('T')[0], end: nextSunday.toISOString().split('T')[0] };
    intent.nights = 2;
  }

  const preferenceKeywords = ['quiet','romantic','luxury','family','pet','pool','view','ocean','mountain','spa','breakfast','wifi','parking','gym','kitchen','balcony','garden','beach','sunset'];
  intent.preferences = preferenceKeywords.filter(kw => normalizedQuery.includes(kw));

  // Budget parsing: "under R2000", "max R3000/night", "budget R1000-R1500", "less than $150"
  const budgetUnderMatch = normalizedQuery.match(/(?:under|max|less than|below|up to|maximum)\s*[r$€£]?\s*(\d[\d,]*)/i);
  const budgetRangeMatch = normalizedQuery.match(/(?:budget|between)\s*[r$€£]?\s*(\d[\d,]*)\s*[-–to]+\s*[r$€£]?\s*(\d[\d,]*)/i);
  if (budgetRangeMatch) {
    const currency = normalizedQuery.match(/[$€£]/) ? (normalizedQuery.includes('$') ? 'USD' : normalizedQuery.includes('€') ? 'EUR' : 'GBP') : 'ZAR';
    intent.budget = { min: parseInt(budgetRangeMatch[1].replace(/,/g, ''), 10), max: parseInt(budgetRangeMatch[2].replace(/,/g, ''), 10), currency };
  } else if (budgetUnderMatch) {
    const currency = normalizedQuery.match(/[$€£]/) ? (normalizedQuery.includes('$') ? 'USD' : normalizedQuery.includes('€') ? 'EUR' : 'GBP') : 'ZAR';
    intent.budget = { max: parseInt(budgetUnderMatch[1].replace(/,/g, ''), 10), currency };
  }

  // Room type/size parsing: "2 bedroom", "studio", "suite", "penthouse", "family room"
  const roomTypeMatch = normalizedQuery.match(/(\d+)\s*[-\s]?(?:bed(?:room)?s?|br)\b/);
  if (roomTypeMatch) {
    intent.room_preference = `${roomTypeMatch[1]} bedroom`;
  } else {
    const roomKeywords = ['studio', 'suite', 'penthouse', 'family room', 'apartment', 'cottage', 'chalet', 'villa', 'loft', 'bungalow'];
    for (const kw of roomKeywords) {
      if (normalizedQuery.includes(kw)) { intent.room_preference = kw; break; }
    }
  }

  return intent;
}

// ============================================================================
// DATE GENERATION
// ============================================================================

function generateDateSuggestions(
  intent: ParsedIntent,
  nights: number = 3
): { check_in: string; check_out: string }[] {
  const suggestions: { check_in: string; check_out: string }[] = [];
  const today = new Date();
  const targetNights = intent.nights || nights;

  if (intent.date_range) {
    suggestions.push({ check_in: intent.date_range.start, check_out: intent.date_range.end });
    return suggestions;
  }

  if (intent.month) {
    const monthIndex = ['january','february','march','april','may','june','july','august','september','october','november','december'].indexOf(intent.month);
    if (monthIndex >= 0) {
      let year = today.getFullYear();
      if (monthIndex < today.getMonth()) year += 1;
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      for (const startDay of [1, 10, 20].filter(d => d + targetNights <= daysInMonth)) {
        const checkIn = new Date(year, monthIndex, startDay);
        const checkOut = new Date(checkIn);
        checkOut.setDate(checkIn.getDate() + targetNights);
        if (checkIn > today) {
          suggestions.push({ check_in: checkIn.toISOString().split('T')[0], check_out: checkOut.toISOString().split('T')[0] });
        }
      }
    }
  }

  if (suggestions.length === 0) {
    for (let offset = 7; offset <= 28; offset += 7) {
      const checkIn = new Date(today);
      checkIn.setDate(today.getDate() + offset);
      const checkOut = new Date(checkIn);
      checkOut.setDate(checkIn.getDate() + targetNights);
      suggestions.push({ check_in: checkIn.toISOString().split('T')[0], check_out: checkOut.toISOString().split('T')[0] });
      if (suggestions.length >= 3) break;
    }
  }

  return suggestions.slice(0, 3);
}

// ============================================================================
// PMS AVAILABILITY
// ============================================================================

async function fetchLiveAvailability(
  supabase: any,
  propertyId: string,
  dates: { check_in: string; check_out: string }
): Promise<{ available: boolean; rates: { room_type_id: string; name: string; rate: number; total: number; description?: string }[] } | null> {
  try {
    const { data: property } = await supabase
      .from("properties")
      .select("external_system, external_id, owner_pms_credential_id, currency")
      .eq("id", propertyId)
      .maybeSingle();

    if (!property) return null;

    const externalSystem = property.external_system || 'none';
    console.log(`[Concierge] Fetching live availability from ${externalSystem} for ${dates.check_in} - ${dates.check_out}`);

    let pmsResponse;
    switch (externalSystem) {
      case 'hostfully':
        pmsResponse = await supabase.functions.invoke('hostfully-api', {
          body: { action: 'fetch_availability', property_id: propertyId, start_date: dates.check_in, end_date: dates.check_out }
        });
        break;
      case 'benson':
        pmsResponse = await supabase.functions.invoke('benson-api', {
          body: { action: 'get_availability', property_id: propertyId, start_date: dates.check_in, end_date: dates.check_out }
        });
        break;
      case 'hotelbeds':
        pmsResponse = await supabase.functions.invoke('hotelbeds-api', {
          body: { action: 'fetch_availability', property_id: propertyId, start_date: dates.check_in, end_date: dates.check_out }
        });
        break;
      default: {
        const { data: cacheData } = await supabase
          .from("pms_availability_cache")
          .select("*")
          .eq("property_id", propertyId)
          .gte("date", dates.check_in)
          .lte("date", dates.check_out);

        if (cacheData && cacheData.length > 0) {
          const nights = Math.ceil((new Date(dates.check_out).getTime() - new Date(dates.check_in).getTime()) / (1000 * 60 * 60 * 24));
          const allAvailable = cacheData.every((day: any) => day.is_available && day.available_units > 0);
          const avgRate = cacheData.reduce((sum: number, day: any) => sum + (day.rate || 0), 0) / cacheData.length;
          return { available: allAvailable, rates: [{ room_type_id: 'default', name: 'Standard Room', rate: avgRate, total: avgRate * nights }] };
        }
        return { available: false, rates: [] };
      }
    }

    if (pmsResponse?.error) { console.error("[Concierge] PMS error:", pmsResponse.error); return null; }

    const data = pmsResponse?.data;
    if (!data?.success && !data?.room_types) return null;

    const roomTypes = data?.data?.room_types || data?.room_types || [];
    const nights = Math.ceil((new Date(dates.check_out).getTime() - new Date(dates.check_in).getTime()) / (1000 * 60 * 60 * 24));

    const rates = roomTypes.map((rt: any) => {
      const rateTypes = rt.rate_types || [];
      const firstRateType = rateTypes[0] || {};
      const ratesList = firstRateType.rates || [];
      let totalRate = 0, rateCount = 0;
      for (const r of ratesList) { if (r.room_amount) { totalRate += r.room_amount; rateCount++; } }
      const avgRate = rateCount > 0 ? totalRate / rateCount : 0;
      const availPerNight = rt.availability_per_night || [];
      const allAvailable = availPerNight.every((a: any) => (a.available_units > 0) && !a.restrictions?.stop_sell);
      return {
        room_type_id: rt.room_type_id || rt.id,
        name: rt.name || 'Room',
        rate: avgRate,
        total: avgRate * nights,
        available: allAvailable,
        description: rt.description || '',
      };
    }).filter((r: any) => r.available && r.rate > 0);

    return { available: rates.length > 0, rates };
  } catch (error) {
    console.error("[Concierge] Error fetching availability:", error);
    return null;
  }
}

// ============================================================================
// PROPERTY CONTEXT ENRICHMENT
// ============================================================================

interface PropertyContext {
  name: string;
  description: string;
  tagline: string;
  city: string;
  country: string;
  highlights: string[];
  amenities: string[];
  currency: string;
  owner_id: string;
  experiences: any[];
  slug: string;
}

async function fetchPropertyContext(supabase: any, propertyId: string): Promise<PropertyContext> {
  const [propertyResult, experiencesResult] = await Promise.all([
    supabase
      .from("properties")
      .select("name, description, tagline, city, country, highlights, amenities, currency, owner_id, slug, external_system")
      .eq("id", propertyId)
      .maybeSingle(),
    supabase
      .from("local_experiences")
      .select("title, category, description, why_locals_love_it, price_indicator, duration_hours")
      .eq("property_id", propertyId)
      .eq("is_active", true)
      .limit(8),
  ]);

  const p = propertyResult.data || {};
  return {
    name: p.name || "this property",
    description: p.description || "",
    tagline: p.tagline || "",
    city: p.city || "",
    country: p.country || "",
    highlights: p.highlights || [],
    amenities: p.amenities || [],
    currency: p.currency || "ZAR",
    owner_id: p.owner_id || "",
    experiences: experiencesResult.data || [],
    slug: p.slug || "",
  };
}

// ============================================================================
// CROSS-SELL: OWNER'S OTHER PROPERTIES
// ============================================================================

async function fetchOwnerAlternatives(
  supabase: any,
  ownerId: string,
  currentPropertyId: string,
  dates: { check_in: string; check_out: string }
): Promise<{ name: string; slug: string; city: string; available: boolean }[]> {
  if (!ownerId) return [];
  try {
    const { data: otherProps } = await supabase
      .from("properties")
      .select("id, name, slug, city, is_published")
      .eq("owner_id", ownerId)
      .eq("is_published", true)
      .neq("id", currentPropertyId)
      .limit(3);

    if (!otherProps || otherProps.length === 0) return [];

    const results = await Promise.all(
      otherProps.map(async (prop: any) => {
        const avail = await fetchLiveAvailability(supabase, prop.id, dates);
        return { name: prop.name, slug: prop.slug, city: prop.city || "", available: !!(avail?.available) };
      })
    );
    return results;
  } catch (e) {
    console.error("[Concierge] Cross-sell error:", e);
    return [];
  }
}

// ============================================================================
// LOVABLE AI NARRATIVE GENERATION
// ============================================================================

async function generateAINarrative(
  userQuery: string,
  context: PropertyContext,
  suggestions: ConciergeSuggestion[],
  intent: ParsedIntent,
  crossSellProperties: { name: string; slug: string; city: string; available: boolean }[],
  allRoomDetails: { name: string; rate: number; total: number; description?: string }[],
  conversationHistory?: { role: string; content: string }[]
): Promise<string> {
  const hasAiKey = Deno.env.get("XAI_API_KEY") || Deno.env.get("LOVABLE_API_KEY");
  if (!hasAiKey) {
    console.warn("[Concierge] No AI keys configured — falling back to template");
    return fallbackNarrative(suggestions, context.name);
  }

  const availableRooms = allRoomDetails.length > 0
    ? allRoomDetails.sort((a, b) => b.rate - a.rate).map(r =>
        `- ${r.name}: ${context.currency} ${Math.round(r.rate)}/night (total ${context.currency} ${Math.round(r.total)})${r.description ? ` — ${r.description.substring(0, 120)}` : ''}`
      ).join('\n')
    : 'No rooms available for the requested dates.';

  const experiencesText = context.experiences.length > 0
    ? context.experiences.map(e => `- ${e.title} (${e.category}): ${e.why_locals_love_it || e.description || ''}`).join('\n')
    : '';

  const crossSellText = crossSellProperties.filter(p => p.available).length > 0
    ? crossSellProperties.filter(p => p.available).map(p => `- ${p.name} in ${p.city} (has availability)`).join('\n')
    : '';

  const systemPrompt = `You are TOBI 🐱, a passionate, warm, and persuasive travel concierge for "${context.name}" — a property in ${context.city || 'a beautiful destination'}${context.country ? `, ${context.country}` : ''}.

Your personality: Enthusiastic but genuine. You LOVE this property and the destination. You speak with warmth, light emoji, and infectious excitement. You create urgency subtly ("these dates fill up fast!"). You are a friction-reducer — your goal is to get the guest to BOOK.

PROPERTY DETAILS:
${context.tagline ? `Tagline: "${context.tagline}"` : ''}
${context.description ? `Description: ${context.description.substring(0, 300)}` : ''}
${context.highlights?.length ? `Highlights: ${context.highlights.join(', ')}` : ''}
${context.amenities?.length ? `Amenities: ${context.amenities.join(', ')}` : ''}

AVAILABLE ROOMS FOR REQUESTED DATES:
${availableRooms}

${experiencesText ? `LOCAL EXPERIENCES & THINGS TO DO:\n${experiencesText}` : ''}

${crossSellText ? `ALTERNATIVE PROPERTIES (same owner, with availability):\n${crossSellText}` : ''}

RULES:
1. If rooms ARE available: Lead with excitement. Recommend the BEST (most premium) room first, explaining WHY it's worth it (view, space, amenities). Mention the value option too. Create desire.
2. If user mentions preferences (pool, quiet, romantic, etc): Confirm the property has it (check amenities) or redirect honestly. Weave it into your pitch.
3. If NO rooms available: Don't just say "sorry". Suggest trying different dates. If alternative properties exist, enthusiastically recommend them.
4. Always mention 1-2 amazing things about the destination (food, nature, culture) using the local experiences data.
5. Keep response under 150 words. Use markdown for emphasis. Be conversational, not robotic.
6. NEVER make up amenities or features not listed above. If unsure, be vague ("this area is known for...").
7. If only one room type exists, don't compare — just sell it with passion.
8. If the guest mentioned a budget constraint, acknowledge it and only highlight rooms within their range. If nothing fits, say so honestly and suggest alternatives.
9. If they asked for a specific room type (e.g. "2 bedroom", "studio"), match it against available room names and highlight the best fit.`;

  const userMessage = `Guest asked: "${userQuery}"
${intent.preferences?.length ? `They mentioned preferences: ${intent.preferences.join(', ')}` : ''}
${intent.budget ? `Budget constraint: ${intent.budget.min ? `min ${intent.budget.currency || 'ZAR'} ${intent.budget.min}` : ''}${intent.budget.max ? ` max ${intent.budget.currency || 'ZAR'} ${intent.budget.max}/night` : ''}` : ''}
${intent.room_preference ? `Room preference: ${intent.room_preference}` : ''}
${suggestions.length > 0 ? `I found ${suggestions.length} available options.` : 'No availability found for the requested dates.'}`;

  // Primary: xAI Grok
  const XAI_API_KEY = Deno.env.get("XAI_API_KEY");
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  
  // Build messages with conversation history for multi-turn context
  const aiMessages: { role: string; content: string }[] = [
    { role: "system", content: systemPrompt },
  ];
  if (conversationHistory && conversationHistory.length > 0) {
    // Include last 10 messages for context
    const recentHistory = conversationHistory.slice(-10);
    for (const msg of recentHistory) {
      aiMessages.push({ role: msg.role === 'assistant' ? 'assistant' : 'user', content: msg.content });
    }
  }
  aiMessages.push({ role: "user", content: userMessage });

  const aiPayload = {
    messages: aiMessages,
    max_tokens: 300,
  };

  try {
    if (XAI_API_KEY) {
      const resp = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${XAI_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "grok-3-mini-fast", ...aiPayload }),
      });
      if (resp.ok) {
        const result = await resp.json();
        const content = result.choices?.[0]?.message?.content;
        if (content) return content;
      }
      console.error("[Concierge] xAI error:", resp.status, "falling back to Lovable AI");
    }

    // Fallback: Lovable AI Gateway
    if (LOVABLE_API_KEY) {
      const resp = await fetch(AI_GATEWAY, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model: "google/gemini-3-flash-preview", ...aiPayload }),
      });
      if (resp.ok) {
        const result = await resp.json();
        const content = result.choices?.[0]?.message?.content;
        if (content) return content;
      }
      console.error("[Concierge] Lovable AI fallback error:", resp.status);
    }
  } catch (e) {
    console.error("[Concierge] AI narrative error:", e);
  }

  return fallbackNarrative(suggestions, context.name);
}

function fallbackNarrative(suggestions: ConciergeSuggestion[], propertyName: string): string {
  if (suggestions.length === 0) {
    return `I couldn't find availability at ${propertyName} for those dates. Try adjusting your dates — or select manually below!`;
  }
  return `Great news! I found ${suggestions.length} option${suggestions.length > 1 ? 's' : ''} for you at ${propertyName} 🎉 Check them out below!`;
}

// ============================================================================
// SURPRISE & DELIGHT
// ============================================================================

type DelightTier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';

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

async function generateValueBasedDelight(
  supabase: any,
  propertyId: string,
  bookingValue: number,
  sessionId: string,
  sessionDelightCount: number
): Promise<ConciergeResponse['surprise_gift'] | undefined> {
  const tier = calculateDelightTier(bookingValue);
  const maxDelights = getMaxDelightsForTier(tier);
  if (sessionDelightCount >= maxDelights || tier === 'none') return undefined;

  try {
    const { data: property } = await supabase.from('properties').select('city, country').eq('id', propertyId).single();
    const city = property?.city || 'Africa';
    const { data: experiences } = await supabase.from('local_experiences').select('*').eq('property_id', propertyId).eq('is_active', true).limit(10);

    if (tier === 'bronze') {
      const exp = experiences?.find((e: any) => e.category === 'nature') || experiences?.find((e: any) => e.category === 'culture');
      return exp
        ? { type: 'amenity', description: `🌿 Local tip: Don't miss ${exp.title}! ${exp.why_locals_love_it || ''}` }
        : { type: 'amenity', description: `✨ Welcome to ${city}! You're in for a treat.` };
    }
    if (tier === 'silver') {
      const exp = experiences?.find((e: any) => e.category === 'adventure') || experiences?.[0];
      return { type: 'voucher', code: generateVoucherCode(city, tier), description: `🎁 Special offer: 15% off ${exp?.title || 'a local adventure'}!` };
    }
    if (tier === 'gold') {
      const dining = findDiningExperience(experiences);
      return { type: 'upgrade', code: generateVoucherCode(city, tier), description: dining ? `🌟 VIP: Complimentary experience at ${dining.title}!` : `🌟 VIP: Flagged for a room upgrade!` };
    }
    if (tier === 'platinum') {
      const dining = findDiningExperience(experiences);
      return { type: 'voucher', code: generateVoucherCode(city, tier), description: dining ? `✨ VIP: Complimentary dinner for two at ${dining.title}!` : `✨ VIP: Complimentary dinner for two at our partner restaurant!` };
    }
  } catch (e) {
    console.error('[Concierge] Delight error:', e);
  }
  return undefined;
}

function generateSurpriseGift(sessionId?: string): ConciergeResponse['surprise_gift'] | undefined {
  if (!sessionId) return undefined;
  const hash = sessionId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  if ((hash % 100) / 100 < 0.10) {
    const surprises = [
      { type: 'amenity' as const, description: "🎁 I've arranged a complimentary bottle of wine for your arrival!" },
      { type: 'amenity' as const, description: "🌸 I've noted a request for fresh flowers in your room!" },
      { type: 'upgrade' as const, description: "✨ I've flagged your booking for a possible room upgrade!" },
    ];
    return surprises[hash % surprises.length];
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
    const { property_id, user_query, current_dates, current_guests, room_types, session_id, current_booking_value, session_delight_count, conversation_history } = body;

    if (!property_id || !user_query) {
      return new Response(
        JSON.stringify({ error: "property_id and user_query are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[Concierge] Query for ${property_id}: "${user_query}"`);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch property context (rich data for AI)
    const context = await fetchPropertyContext(supabase, property_id);

    // Parse user intent from NLP
    const intent = parseUserQuery(user_query);
    if (!intent.guests && current_guests) intent.guests = current_guests;
    console.log("[Concierge] Parsed intent:", intent);

    // =====================================================================
    // FIX: Prioritize current_dates over NLP-generated dates
    // =====================================================================
    const dateSuggestions: { check_in: string; check_out: string }[] = [];

    // FIRST: Use the dates the user already selected on the calendar
    if (current_dates?.check_in && current_dates?.check_out) {
      dateSuggestions.push({ check_in: current_dates.check_in, check_out: current_dates.check_out });
    }

    // THEN: Add NLP-parsed date suggestions as fallbacks
    const nlpDates = generateDateSuggestions(intent, intent.nights || 3);
    for (const d of nlpDates) {
      // Don't duplicate the current_dates
      if (!dateSuggestions.some(existing => existing.check_in === d.check_in && existing.check_out === d.check_out)) {
        dateSuggestions.push(d);
      }
    }

    console.log("[Concierge] Date suggestions (current_dates first):", dateSuggestions);

    // Fetch live availability for each date range
    const suggestions: ConciergeSuggestion[] = [];
    const allRoomDetails: { name: string; rate: number; total: number; description?: string }[] = [];

    for (const dates of dateSuggestions) {
      const availability = await fetchLiveAvailability(supabase, property_id, dates);

      if (availability && availability.available && availability.rates.length > 0) {
        // =====================================================================
        // UPSELL: Sort by price DESCENDING — recommend premium first
        // =====================================================================
        const sortedRates = [...availability.rates].sort((a, b) => b.total - a.total);
        const premiumRate = sortedRates[0]; // Most expensive = recommended
        const valueRate = sortedRates[sortedRates.length - 1]; // Cheapest = value option

        const nights = Math.ceil(
          (new Date(dates.check_out).getTime() - new Date(dates.check_in).getTime()) / (1000 * 60 * 60 * 24)
        );

        // Collect all room details for AI context
        for (const r of sortedRates) {
          allRoomDetails.push({ name: r.name, rate: r.rate, total: r.total, description: r.description });
        }

        // Add premium room as primary recommendation
        const premiumRoomInfo = room_types?.find(rt => rt.id === premiumRate.room_type_id);
        suggestions.push({
          id: crypto.randomUUID(),
          type: 'room',
          dates,
          room: {
            id: premiumRate.room_type_id,
            name: premiumRoomInfo?.name || premiumRate.name,
            price_per_night: premiumRate.rate,
            total: premiumRate.total,
          },
          message: `⭐ ${premiumRoomInfo?.name || premiumRate.name} · ${nights} nights · ${context.currency} ${Math.round(premiumRate.rate).toLocaleString()}/night`,
          is_best_value: sortedRates.length === 1, // Only best value if it's the only option
        });

        // Add value option if different from premium
        if (sortedRates.length > 1 && valueRate.room_type_id !== premiumRate.room_type_id) {
          const valueRoomInfo = room_types?.find(rt => rt.id === valueRate.room_type_id);
          const savings = premiumRate.total - valueRate.total;
          suggestions.push({
            id: crypto.randomUUID(),
            type: 'room',
            dates,
            room: {
              id: valueRate.room_type_id,
              name: valueRoomInfo?.name || valueRate.name,
              price_per_night: valueRate.rate,
              total: valueRate.total,
            },
            message: `💰 ${valueRoomInfo?.name || valueRate.name} · ${nights} nights · ${context.currency} ${Math.round(valueRate.rate).toLocaleString()}/night`,
            is_best_value: true,
            savings,
          });
        }
      }
    }

    // =====================================================================
    // BUDGET FILTER: Remove suggestions outside budget range
    // =====================================================================
    let filteredSuggestions = suggestions;
    if (intent.budget) {
      filteredSuggestions = suggestions.filter(s => {
        if (!s.room) return true;
        const rate = s.room.price_per_night;
        if (intent.budget!.max && rate > intent.budget!.max) return false;
        if (intent.budget!.min && rate < intent.budget!.min) return false;
        return true;
      });
      console.log(`[Concierge] Budget filter: ${suggestions.length} → ${filteredSuggestions.length}`);
    }

    // =====================================================================
    // ROOM PREFERENCE FILTER: Boost rooms matching room_preference
    // =====================================================================
    if (intent.room_preference && filteredSuggestions.length > 1) {
      const pref = intent.room_preference.toLowerCase();
      const matching = filteredSuggestions.filter(s => s.room && s.room.name.toLowerCase().includes(pref));
      if (matching.length > 0) {
        // Put matching rooms first
        const nonMatching = filteredSuggestions.filter(s => !matching.includes(s));
        filteredSuggestions = [...matching, ...nonMatching];
      }
    }

    // =====================================================================
    // CROSS-SELL: If no availability, check owner's other properties
    // =====================================================================
    let crossSellProperties: { name: string; slug: string; city: string; available: boolean }[] = [];
    if (filteredSuggestions.length === 0 && current_dates?.check_in && current_dates?.check_out) {
      crossSellProperties = await fetchOwnerAlternatives(
        supabase, context.owner_id, property_id,
        { check_in: current_dates.check_in, check_out: current_dates.check_out }
      );
    }

    // =====================================================================
    // AI NARRATIVE: Replace templates with Lovable AI
    // =====================================================================
    const narrativeResponse = await generateAINarrative(
      user_query, context, filteredSuggestions, intent, crossSellProperties, allRoomDetails, conversation_history
    );

    // Surprise & Delight
    let surpriseGift: ConciergeResponse['surprise_gift'] | undefined;
    if (current_booking_value !== undefined && current_booking_value > 0) {
      surpriseGift = await generateValueBasedDelight(supabase, property_id, current_booking_value, session_id || 'anonymous', session_delight_count || 0);
    } else {
      surpriseGift = generateSurpriseGift(session_id);
    }

    const response: ConciergeResponse = {
      suggestions: filteredSuggestions.slice(0, 6),
      narrative_response: narrativeResponse,
      parsed_intent: intent,
    };

    if (surpriseGift) response.surprise_gift = surpriseGift;

    if (suggestions.length > 0) {
      const available = suggestions.filter(s => s.room);
      if (available.length > 0) {
        response.proactive_tip = "💡 These dates are popular — book now to secure your spot!";
      }
    }

    console.log(`[Concierge] Returning ${suggestions.length} suggestions with AI narrative`);

    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("[Concierge] Error:", error);

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
