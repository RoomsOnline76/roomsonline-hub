import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { findDiningExperience } from "../_shared/delight-engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tone types for adaptive narrative generation
type JourneyTone = 'luxury' | 'romantic' | 'adventure' | 'relaxation' | 'professional' | 'family';

// Tone-specific introduction templates
const TONE_INTROS: Record<JourneyTone, string> = {
  luxury: 'An exquisite collection of Africa\'s finest retreats, curated for the discerning traveller.',
  romantic: 'A journey crafted for two, where every moment becomes a cherished memory.',
  adventure: 'An expedition through Africa\'s most extraordinary landscapes and experiences.',
  relaxation: 'A sanctuary of calm awaits – your escape to tranquility begins here.',
  professional: 'Your itinerary has been confirmed. All arrangements are in place.',
  family: 'Adventures for all ages – creating memories that will last a lifetime.',
};

// Tone-specific stay intro phrases
const TONE_STAY_PHRASES: Record<JourneyTone, string[]> = {
  luxury: ['Arrive in style at', 'Experience unparalleled elegance at', 'Indulge in the refined atmosphere of'],
  romantic: ['Begin your love story at', 'Let romance blossom at', 'Create intimate moments at'],
  adventure: ['Your adventure awaits at', 'Discover the thrill of', 'Explore from your base at'],
  relaxation: ['Unwind in the serenity of', 'Find your peace at', 'Restore your spirit at'],
  professional: ['Check in at', 'Your accommodation:', 'Confirmed booking at'],
  family: ['Fun for everyone at', 'The whole family will love', 'Create memories together at'],
};

// Weather code descriptions
const WEATHER_CODES: Record<number, { icon: string; desc: string }> = {
  0: { icon: '☀️', desc: 'Clear sky' },
  1: { icon: '🌤️', desc: 'Mostly clear' },
  2: { icon: '⛅', desc: 'Partly cloudy' },
  3: { icon: '☁️', desc: 'Overcast' },
  45: { icon: '🌫️', desc: 'Fog' },
  48: { icon: '🌫️', desc: 'Depositing rime fog' },
  51: { icon: '🌦️', desc: 'Light drizzle' },
  53: { icon: '🌦️', desc: 'Moderate drizzle' },
  55: { icon: '🌧️', desc: 'Dense drizzle' },
  61: { icon: '🌧️', desc: 'Slight rain' },
  63: { icon: '🌧️', desc: 'Moderate rain' },
  65: { icon: '🌧️', desc: 'Heavy rain' },
  71: { icon: '❄️', desc: 'Slight snow' },
  73: { icon: '❄️', desc: 'Moderate snow' },
  75: { icon: '❄️', desc: 'Heavy snow' },
  80: { icon: '🌦️', desc: 'Slight showers' },
  81: { icon: '🌧️', desc: 'Moderate showers' },
  82: { icon: '⛈️', desc: 'Violent showers' },
  95: { icon: '⛈️', desc: 'Thunderstorm' },
};

// Detect tone from booking context
function detectTone(itinerary: any, stays: any[]): JourneyTone {
  const specialRequests = (itinerary.special_requests || '').toLowerCase();
  const guestEmail = (itinerary.guest_email || '').toLowerCase();
  
  if (specialRequests.includes('anniversary') || specialRequests.includes('honeymoon') || 
      specialRequests.includes('romantic') || specialRequests.includes('proposal')) {
    return 'romantic';
  }
  
  if (specialRequests.includes('child') || specialRequests.includes('kid') || 
      specialRequests.includes('family') || specialRequests.includes('children')) {
    return 'family';
  }
  
  if (specialRequests.includes('spa') || specialRequests.includes('wellness') || 
      specialRequests.includes('relax') || specialRequests.includes('peaceful')) {
    return 'relaxation';
  }
  
  if (specialRequests.includes('adventure') || specialRequests.includes('safari') || 
      specialRequests.includes('hiking') || specialRequests.includes('explore')) {
    return 'adventure';
  }
  
  const businessDomains = ['.com', '.co.za', '.org', '.net'];
  const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
  if (guestEmail && !personalDomains.some(d => guestEmail.includes(d)) && 
      businessDomains.some(d => guestEmail.endsWith(d))) {
    return 'professional';
  }
  
  const avgPrice = stays.length > 0 
    ? stays.reduce((sum, s) => sum + (s.price || 0), 0) / stays.length 
    : 0;
  
  if (avgPrice > 5000) {
    return 'luxury';
  }
  
  const luxuryKeywords = ['spa', 'resort', 'lodge', 'manor', 'estate', 'boutique'];
  const hasLuxuryProperty = stays.some(s => 
    luxuryKeywords.some(kw => (s.propertyName || '').toLowerCase().includes(kw))
  );
  
  if (hasLuxuryProperty) {
    return 'luxury';
  }
  
  return 'relaxation';
}

// Get random phrase from tone array
function getTonePhrase(tone: JourneyTone): string {
  const phrases = TONE_STAY_PHRASES[tone];
  return phrases[Math.floor(Math.random() * phrases.length)];
}

// Format currency
function formatCurrency(amount: number, currency: string = "ZAR"): string {
  return new Intl.NumberFormat("en-ZA", {
    style: "currency",
    currency,
  }).format(amount);
}

// Format date
function formatDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Format short date for compact display
function formatShortDate(dateString: string): string {
  return new Date(dateString).toLocaleDateString("en-ZA", {
    month: "short",
    day: "numeric",
  });
}

interface Stay {
  propertyId: string;
  propertyName: string;
  propertyImage?: string;
  roomTypeId?: string;
  roomTypeName?: string;
  rateTypeId?: string;
  rateTypeName?: string;
  checkIn: string;
  checkOut: string;
  guests: {
    adults: number;
    children?: number;
    infants?: number;
  };
  price: number;
  nights: number;
  city?: string;
  country?: string;
}

interface LocalExperience {
  id: string;
  title: string;
  description: string | null;
  category: string;
  distance_km: number | null;
  duration_hours: number | null;
  price_indicator: string | null;
  why_locals_love_it: string | null;
  best_time: string | null;
  venue_type: string | null;
  cuisine_type: string | null;
  reservation_required: boolean | null;
  dress_code: string | null;
  display_order?: number | null;
}

interface PropertyDetails {
  id: string;
  name: string;
  main_image: string | null;
  city: string | null;
  country: string | null;
  address: string | null;
  check_in_time: string | null;
  check_out_time: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

interface WeatherDay {
  date: string;
  icon: string;
  desc: string;
  high: number;
  low: number;
}

// Category icons for experiences
const categoryIcons: Record<string, string> = {
  nature: '🌿',
  culture: '🎨',
  adventure: '🏃',
  relaxation: '🧘',
  wellness: '💆',
  food: '🍴',
  dining: '🍷'
};

// Generate AI poem using Lovable AI
async function generatePersonalPoem(
  guestName: string,
  propertyNames: string[],
  tone: JourneyTone
): Promise<string | null> {
  try {
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      console.log("[PDF] LOVABLE_API_KEY not set, skipping poem generation");
      return null;
    }

    const toneDescriptions: Record<JourneyTone, string> = {
      luxury: 'elegant and refined',
      romantic: 'romantic and intimate',
      adventure: 'exciting and adventurous',
      relaxation: 'peaceful and serene',
      professional: 'professional yet warm',
      family: 'joyful and family-friendly',
    };

    const prompt = `Create a beautiful 4-line poem for a guest named ${guestName || 'our guest'} who is visiting ${propertyNames.join(' and ')} in Africa. 
    
The tone should be ${toneDescriptions[tone]}. 
Make it warm, personal, and memorable. 
The poem should evoke the magic of African hospitality and the anticipation of their journey.
Only return the poem, no explanations or titles.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${lovableApiKey}`,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 200,
        temperature: 0.8,
      }),
    });

    if (!response.ok) {
      console.error("[PDF] Poem generation failed:", response.status);
      return null;
    }

    const data = await response.json();
    const poem = data.choices?.[0]?.message?.content?.trim();
    console.log("[PDF] Generated poem:", poem?.substring(0, 50) + "...");
    return poem || null;
  } catch (error) {
    console.error("[PDF] Error generating poem:", error);
    return null;
  }
}

// Fetch weather forecast for travel dates
async function fetchWeatherForecast(
  latitude: number,
  longitude: number,
  startDate: string,
  endDate: string
): Promise<WeatherDay[]> {
  try {
    // Open-Meteo only provides 16-day forecast, so check if dates are within range
    const today = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    
    // If start date is more than 16 days away, return empty
    const daysUntilStart = Math.floor((start.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (daysUntilStart > 16) {
      console.log("[PDF] Travel dates too far in future for weather forecast");
      return [];
    }

    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=auto&start_date=${startDate}&end_date=${endDate}`;
    
    const response = await fetch(url);
    if (!response.ok) {
      console.error("[PDF] Weather API error:", response.status);
      return [];
    }

    const data = await response.json();
    
    if (!data.daily) {
      return [];
    }

    const weatherDays: WeatherDay[] = [];
    const dates = data.daily.time || [];
    const maxTemps = data.daily.temperature_2m_max || [];
    const minTemps = data.daily.temperature_2m_min || [];
    const codes = data.daily.weathercode || [];

    for (let i = 0; i < Math.min(dates.length, 5); i++) {
      const code = codes[i] || 0;
      const weather = WEATHER_CODES[code] || { icon: '🌡️', desc: 'Variable' };
      
      weatherDays.push({
        date: dates[i],
        icon: weather.icon,
        desc: weather.desc,
        high: Math.round(maxTemps[i] || 0),
        low: Math.round(minTemps[i] || 0),
      });
    }

    console.log(`[PDF] Fetched ${weatherDays.length} days of weather data`);
    return weatherDays;
  } catch (error) {
    console.error("[PDF] Error fetching weather:", error);
    return [];
  }
}

// Generate surprise voucher
async function generateSurpriseVoucher(
  supabase: any,
  itineraryId: string,
  propertyNames: string[]
): Promise<{ code: string; description: string } | null> {
  try {
    // Check if voucher already exists for this itinerary
    const { data: existing } = await supabase
      .from("experience_vouchers")
      .select("code, description")
      .eq("itinerary_id", itineraryId)
      .single();
    
    if (existing) {
      console.log("[PDF] Existing voucher found:", existing.code);
      return existing;
    }

    // Generate unique voucher code
    const prefixes = ['SUNSET', 'SAFARI', 'AFRICA', 'JOURNEY', 'EXPLORE', 'WONDER'];
    const prefix = prefixes[Math.floor(Math.random() * prefixes.length)];
    const randomPart = Math.random().toString(36).substring(2, 6).toUpperCase();
    const code = `${prefix}-${randomPart}`;

    // Create voucher
    const validUntil = new Date();
    validUntil.setMonth(validUntil.getMonth() + 6); // Valid for 6 months

    const descriptions = [
      `25% off your next local experience at ${propertyNames[0] || 'any partner property'}`,
      `Complimentary sunset drinks for two on your next visit`,
      `25% discount on spa treatments or local tours`,
      `A special gift awaits you at reception – mention this code!`,
    ];
    
    const description = descriptions[Math.floor(Math.random() * descriptions.length)];

    const { error } = await supabase
      .from("experience_vouchers")
      .insert({
        itinerary_id: itineraryId,
        code,
        discount_percent: 25,
        description,
        valid_until: validUntil.toISOString(),
      });

    if (error) {
      console.error("[PDF] Error creating voucher:", error);
      return null;
    }

    console.log("[PDF] Created surprise voucher:", code);
    return { code, description };
  } catch (error) {
    console.error("[PDF] Error in voucher generation:", error);
    return null;
  }
}

function generateExperiencesHTML(experiences: LocalExperience[]): string {
  if (!experiences || experiences.length === 0) return '';
  
  const otherExperiences = experiences.filter(e => e.category !== 'dining').slice(0, 4);
  
  if (otherExperiences.length === 0) return '';
  
  const experienceItems = otherExperiences.map(exp => {
    // Build meta info: prefer distance (how far), then duration (how long the activity takes)
    const metaParts: string[] = [];
    if (exp.distance_km) {
      metaParts.push(`${exp.distance_km}km away`);
    }
    if (exp.duration_hours) {
      metaParts.push(`${exp.duration_hours}h activity`);
    }
    const metaText = metaParts.join(' · ');
    
    return `
      <div class="experience-item">
        <span class="experience-icon">${categoryIcons[exp.category] || '✨'}</span>
        <div class="experience-content">
          <span class="experience-title">${exp.title}</span>
          ${metaText ? `<span class="experience-meta">${metaText}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  return `
    <div class="experiences-section">
      <h4>✨ Top Experiences Nearby</h4>
      ${experienceItems}
    </div>
  `;
}

function generateDiningHTML(dining: LocalExperience | undefined, propertyCity?: string): string {
  if (!dining) return '';
  
  // Build Google Maps search URL with restaurant name and city context
  const searchQuery = propertyCity 
    ? encodeURIComponent(`${dining.title}, ${propertyCity}`)
    : encodeURIComponent(dining.title);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${searchQuery}`;
  
  return `
    <div class="dining-section">
      <h4>🍷 Where to Dine</h4>
      <div class="dining-card">
        <h5 class="dining-name">
          <a href="${mapsUrl}" target="_blank" style="color: inherit; text-decoration: none;">
            ${dining.title} 📍
          </a>
        </h5>
        <p class="dining-cuisine">${dining.cuisine_type || dining.description || ''}</p>
        ${dining.why_locals_love_it ? `<p class="dining-tip">"${dining.why_locals_love_it}"</p>` : ''}
        <div class="dining-meta">
          ${dining.dress_code ? `<span class="dining-dress">👔 ${dining.dress_code}</span>` : ''}
          ${dining.reservation_required ? '<span class="dining-reserve">📞 Reservations recommended</span>' : ''}
          ${dining.price_indicator ? `<span class="price-badge">${dining.price_indicator}</span>` : ''}
        </div>
      </div>
    </div>
  `;
}

function generatePracticalHTML(property: PropertyDetails): string {
  const hasInfo = property.address || property.check_in_time || property.check_out_time || property.contact_phone;
  if (!hasInfo) return '';
  
  return `
    <div class="practical-section">
      <h4>📍 Practical Info</h4>
      <div class="practical-info">
        ${property.address ? `<p class="practical-address">${property.address}</p>` : ''}
        <div class="practical-times">
          ${property.check_in_time ? `<span>Check-in: ${property.check_in_time}</span>` : ''}
          ${property.check_out_time ? `<span>Check-out: ${property.check_out_time}</span>` : ''}
        </div>
        ${property.contact_phone ? `<p class="practical-contact">📞 ${property.contact_phone}</p>` : ''}
      </div>
    </div>
  `;
}

function generateWeatherHTML(weather: WeatherDay[]): string {
  if (!weather || weather.length === 0) return '';
  
  const weatherItems = weather.map(day => `
    <div class="weather-day">
      <span class="weather-date">${new Date(day.date).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric' })}</span>
      <span class="weather-icon">${day.icon}</span>
      <span class="weather-temps">${day.high}° / ${day.low}°</span>
    </div>
  `).join('');
  
  return `
    <div class="weather-section">
      <h4>🌤️ Weather Forecast</h4>
      <div class="weather-grid">
        ${weatherItems}
      </div>
      <p class="weather-note">Forecast provided by Open-Meteo</p>
    </div>
  `;
}

function generatePoemHTML(poem: string | null): string {
  if (!poem) return '';
  
  const lines = poem.split('\n').filter(l => l.trim()).map(l => `<span>${l}</span>`).join('');
  
  return `
    <div class="poem-section">
      <div class="poem-content">
        ${lines}
      </div>
      <p class="poem-attribution">— Written just for you ✨</p>
    </div>
  `;
}

function generateVoucherHTML(voucher: { code: string; description: string } | null): string {
  if (!voucher) return '';
  
  return `
    <div class="voucher-section">
      <div class="voucher-card">
        <div class="voucher-header">
          <span class="voucher-gift">🎁</span>
          <span class="voucher-title">A Special Gift For You</span>
        </div>
        <p class="voucher-description">${voucher.description}</p>
        <div class="voucher-code-box">
          <span class="voucher-label">Your Code:</span>
          <span class="voucher-code">${voucher.code}</span>
        </div>
        <p class="voucher-terms">Valid for 6 months. Present this code at reception.</p>
      </div>
    </div>
  `;
}

function generateShareHTML(itineraryId: string): string {
  const shareUrl = `https://book.sleepinafrica.roomsonline.co.za/journey/confirmation/${itineraryId}`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=${encodeURIComponent(shareUrl)}`;
  
  return `
    <div class="share-section">
      <h2>Share Your Adventure</h2>
      <div class="share-content">
        <img src="${qrCodeUrl}" alt="QR Code" class="qr-code" />
        <p>Scan to view online and share with friends!</p>
      </div>
    </div>
  `;
}

interface EnrichedStay extends Stay {
  experiences: LocalExperience[];
  propertyDetails: PropertyDetails | null;
}

interface BrochureEnhancements {
  poem: string | null;
  weather: WeatherDay[];
  voucher: { code: string; description: string } | null;
  destinationElaboration?: string; // NEW: Tiered destination content
}

// ============================================================================
// DELIGHT ENGINE - Tiered Destination Sections
// ============================================================================

type DelightTier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';

function calculateDelightTier(bookingValue: number): DelightTier {
  if (bookingValue < 5000) return 'none';
  if (bookingValue < 10000) return 'bronze';
  if (bookingValue < 25000) return 'silver';
  if (bookingValue < 50000) return 'gold';
  return 'platinum';
}

function generateHiddenGemsHTML(experiences: LocalExperience[]): string {
  if (!experiences || experiences.length === 0) return '';
  
  const gems = experiences
    .filter(e => e.category === 'nature' || e.category === 'culture')
    .slice(0, 3);
  
  if (gems.length === 0) return '';

  return `
    <div class="hidden-gems-section">
      <h2>💎 Hidden Gems Near Your Stay</h2>
      <p class="section-intro">These are the spots locals don't share with just anyone...</p>
      ${gems.map(e => `
        <div class="gem-item">
          <span class="gem-icon">${categoryIcons[e.category] || '✨'}</span>
          <div class="gem-content">
            <h4>${e.title}</h4>
            <p>${e.why_locals_love_it || e.description || 'A local favourite.'}</p>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function generateInsiderTipsHTML(experiences: LocalExperience[]): string {
  if (!experiences || experiences.length === 0) return '';
  
  const tips = experiences
    .filter(e => e.why_locals_love_it)
    .slice(0, 4);
  
  if (tips.length === 0) return '';

  return `
    <div class="insider-tips-section">
      <h2>🗝️ Insider Knowledge</h2>
      <p class="section-intro">What the locals know that guidebooks don't...</p>
      ${tips.map(e => `
        <div class="tip-item">
          <span class="tip-icon">${categoryIcons[e.category] || '✨'}</span>
          <div class="tip-content">
            <strong>${e.title}</strong>
            <p class="tip-secret">"${e.why_locals_love_it}"</p>
            ${e.best_time ? `<span class="tip-time">Best time: ${e.best_time}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function generateCuratedGuideHTML(
  experiences: LocalExperience[],
  stayCount: number,
  cities: string[]
): string {
  if (!experiences || experiences.length === 0) return '';

  const byCategory: Record<string, LocalExperience[]> = {};
  experiences.forEach(e => {
    if (!byCategory[e.category]) {
      byCategory[e.category] = [];
    }
    byCategory[e.category].push(e);
  });

  const categories = Object.keys(byCategory).slice(0, 4);
  const cityList = cities.filter(Boolean).join(' & ') || 'your destinations';

  return `
    <div class="curated-guide-section">
      <h2>✨ Your Curated Journey Guide</h2>
      <p class="section-intro">A personal selection of ${cityList}'s finest experiences, chosen for your ${stayCount}-property journey.</p>
      
      ${categories.map(category => `
        <div class="guide-category">
          <h4>${categoryIcons[category] || '✨'} ${category.charAt(0).toUpperCase() + category.slice(1)}</h4>
          <div class="category-items">
            ${byCategory[category].slice(0, 2).map(e => `
              <div class="guide-item">
                <strong>${e.title}</strong>
                ${e.price_indicator ? `<span class="price-tag">${e.price_indicator}</span>` : ''}
                <p>${e.why_locals_love_it || e.description || ''}</p>
              </div>
            `).join('')}
          </div>
        </div>
      `).join('')}
      
      <p class="guide-footer">🎁 As a Platinum guest, mention code VIP-JOURNEY for priority reservations.</p>
    </div>
  `;
}

function generateDestinationElaborationHTML(
  experiences: LocalExperience[],
  bookingValue: number,
  stayCount: number,
  cities: string[]
): string {
  const tier = calculateDelightTier(bookingValue);
  
  console.log(`[PDF] Generating destination elaboration for tier: ${tier} (R${bookingValue})`);
  
  if (tier === 'none' || tier === 'bronze') {
    return ''; // No elaborate section for lower tiers
  }

  if (tier === 'silver') {
    return generateHiddenGemsHTML(experiences);
  }

  if (tier === 'gold') {
    return generateInsiderTipsHTML(experiences);
  }

  if (tier === 'platinum') {
    return generateCuratedGuideHTML(experiences, stayCount, cities);
  }

  return '';
}

function getDelightSectionStyles(): string {
  return `
    /* Hidden Gems Section */
    .hidden-gems-section {
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border-radius: 12px;
      padding: 24px;
      margin: 30px 0;
      border: 1px solid #86efac;
      page-break-inside: avoid;
    }
    
    .hidden-gems-section h2 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 16pt;
      color: #166534;
      margin-bottom: 8px;
      border: none;
      padding: 0;
    }
    
    .section-intro {
      color: #666;
      font-style: italic;
      margin-bottom: 16px;
      font-size: 11pt;
    }
    
    .gem-item {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      padding: 12px;
      background: white;
      border-radius: 8px;
    }
    
    .gem-icon {
      font-size: 20pt;
      line-height: 1;
    }
    
    .gem-content h4 {
      font-size: 12pt;
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .gem-content p {
      font-size: 10pt;
      color: #666;
      margin: 0;
    }
    
    /* Insider Tips Section */
    .insider-tips-section {
      background: linear-gradient(135deg, #fef3c7 0%, #fde68a 100%);
      border-radius: 12px;
      padding: 24px;
      margin: 30px 0;
      border: 1px solid #fbbf24;
      page-break-inside: avoid;
    }
    
    .insider-tips-section h2 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 16pt;
      color: #92400e;
      margin-bottom: 8px;
      border: none;
      padding: 0;
    }
    
    .tip-item {
      display: flex;
      gap: 12px;
      margin-bottom: 16px;
      padding: 12px;
      background: white;
      border-radius: 8px;
    }
    
    .tip-icon {
      font-size: 20pt;
      line-height: 1;
    }
    
    .tip-content strong {
      display: block;
      font-size: 12pt;
      margin-bottom: 4px;
    }
    
    .tip-secret {
      font-size: 10pt;
      color: #78350f;
      font-style: italic;
      margin: 0 0 4px;
    }
    
    .tip-time {
      font-size: 9pt;
      color: #92400e;
      background: #fef3c7;
      padding: 2px 8px;
      border-radius: 4px;
    }
    
    /* Curated Guide Section */
    .curated-guide-section {
      background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%);
      border-radius: 12px;
      padding: 24px;
      margin: 30px 0;
      border: 2px solid #f9a8d4;
      page-break-inside: avoid;
    }
    
    .curated-guide-section h2 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 18pt;
      color: #be185d;
      margin-bottom: 8px;
      border: none;
      padding: 0;
    }
    
    .guide-category {
      margin-bottom: 20px;
    }
    
    .guide-category h4 {
      font-size: 12pt;
      font-weight: 600;
      color: #831843;
      margin-bottom: 12px;
    }
    
    .category-items {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    
    .guide-item {
      background: white;
      border-radius: 8px;
      padding: 12px;
    }
    
    .guide-item strong {
      font-size: 11pt;
    }
    
    .guide-item .price-tag {
      float: right;
      font-size: 9pt;
      color: #666;
    }
    
    .guide-item p {
      font-size: 10pt;
      color: #666;
      margin: 4px 0 0;
    }
    
    .guide-footer {
      text-align: center;
      font-size: 11pt;
      color: #be185d;
      font-weight: 500;
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #f9a8d4;
    }
    
    /* Per-Stay Highlights (Multi-Stay Journeys) */
    .per-stay-highlights {
      background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
      border-radius: 10px;
      padding: 16px;
      margin-top: 16px;
      border: 1px solid #7dd3fc;
    }
    
    .per-stay-highlights h4 {
      font-size: 11pt;
      font-weight: 600;
      color: #0369a1;
      margin-bottom: 12px;
    }
    
    .highlight-item {
      display: flex;
      gap: 10px;
      margin-bottom: 10px;
      padding: 10px;
      background: white;
      border-radius: 6px;
    }
    
    .highlight-item:last-child {
      margin-bottom: 0;
    }
    
    .highlight-icon {
      font-size: 16pt;
      line-height: 1;
    }
    
    .highlight-content strong {
      display: block;
      font-size: 10pt;
      margin-bottom: 2px;
    }
    
    .highlight-content p {
      font-size: 9pt;
      color: #666;
      margin: 0;
      font-style: italic;
    }
    
    /* Journey Transition (Between Stays) */
    .journey-transition {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin: 24px 0;
      padding: 16px 24px;
      background: linear-gradient(90deg, transparent, #f1f5f9, transparent);
      border-radius: 8px;
    }
    
    .journey-icon {
      font-size: 20pt;
    }
    
    .journey-transition p {
      font-size: 11pt;
      color: #475569;
      font-style: italic;
      margin: 0;
    }
    
    .journey-transition strong {
      color: #1e293b;
    }
  `;
}

// Generate per-stay highlights for multi-stay journeys
function generatePerStayHighlights(
  experiences: LocalExperience[],
  city: string | undefined,
  stayNumber: number
): string {
  if (!experiences || experiences.length < 2) return '';
  
  const highlights = experiences
    .filter(e => e.why_locals_love_it && e.category !== 'dining')
    .slice(0, 2);
  
  if (highlights.length === 0) return '';
  
  return `
    <div class="per-stay-highlights">
      <h4>🌟 ${city || 'Destination'} Highlights</h4>
      ${highlights.map(e => `
        <div class="highlight-item">
          <span class="highlight-icon">${categoryIcons[e.category] || '✨'}</span>
          <div class="highlight-content">
            <strong>${e.title}</strong>
            <p>${e.why_locals_love_it}</p>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

// Generate journey transition narrative between stays
function generateJourneyTransition(
  nextStay: EnrichedStay,
  stayIndex: number
): string {
  const transitionPhrases = [
    `Continue your adventure to`,
    `Your journey leads you to`,
    `Next, discover the magic of`,
    `The road awaits – onwards to`,
  ];
  const phrase = transitionPhrases[stayIndex % transitionPhrases.length];
  const destination = nextStay.city || nextStay.propertyName;
  
  return `
    <div class="journey-transition">
      <span class="journey-icon">🚗</span>
      <p>${phrase} <strong>${destination}</strong>...</p>
    </div>
  `;
}

function generateBrochureHTML(
  itinerary: any,
  stays: EnrichedStay[],
  tone: JourneyTone,
  enhancements: BrochureEnhancements
): string {
  const toneIntro = TONE_INTROS[tone];
  const guestFirstName = (itinerary.guest_name || 'Guest').split(' ')[0];
  const isMultiStay = stays.length > 1;
  
  const staysHTML = stays.map((stay, index) => {
    const diningExp = findDiningExperience(stay.experiences) as LocalExperience | undefined;
    const stayIntro = getTonePhrase(tone);
    
    // Per-stay curated content (for multi-stay journeys)
    const perStayHighlights = isMultiStay 
      ? generatePerStayHighlights(stay.experiences, stay.city || stay.propertyDetails?.city || undefined, index + 1)
      : '';
    
    // Journey transition to next stay (not for the last stay)
    const journeyTransition = (isMultiStay && index < stays.length - 1)
      ? generateJourneyTransition(stays[index + 1], index)
      : '';
    
    return `
    <div class="stay-card">
      <div class="stay-header">
        <span class="stay-number">Stay ${index + 1}</span>
        <span class="stay-dates">${formatShortDate(stay.checkIn)} – ${formatShortDate(stay.checkOut)}</span>
      </div>
      ${stay.propertyImage ? `<img src="${stay.propertyImage}" alt="${stay.propertyName}" class="stay-image" />` : ''}
      <div class="stay-content">
        <p class="stay-intro">${stayIntro}</p>
        <h3 class="property-name">${stay.propertyName}</h3>
        ${stay.city ? `<p class="property-location">${stay.city}${stay.country ? `, ${stay.country}` : ''}</p>` : ''}
        <div class="stay-details">
          <div class="detail-row">
            <span class="detail-label">Duration</span>
            <span class="detail-value">${stay.nights} night${stay.nights > 1 ? 's' : ''}</span>
          </div>
          ${stay.roomTypeName ? `
          <div class="detail-row">
            <span class="detail-label">Room</span>
            <span class="detail-value">${stay.roomTypeName}</span>
          </div>
          ` : ''}
          <div class="detail-row">
            <span class="detail-label">Guests</span>
            <span class="detail-value">${stay.guests.adults} Adult${stay.guests.adults > 1 ? 's' : ''}${stay.guests.children ? `, ${stay.guests.children} Child${stay.guests.children > 1 ? 'ren' : ''}` : ''}${stay.guests.infants ? `, ${stay.guests.infants} Infant${stay.guests.infants > 1 ? 's' : ''}` : ''}</span>
          </div>
          <div class="detail-row price-row">
            <span class="detail-label">Price</span>
            <span class="detail-value">${formatCurrency(stay.price, itinerary.currency || 'ZAR')}</span>
          </div>
        </div>
        
        ${generateExperiencesHTML(stay.experiences)}
        ${generateDiningHTML(diningExp, stay.city || stay.propertyDetails?.city || undefined)}
        ${perStayHighlights}
        ${stay.propertyDetails ? generatePracticalHTML(stay.propertyDetails) : ''}
      </div>
    </div>
    ${journeyTransition}
  `}).join('');
  
  // Add tone-specific intro to subtitle
  const toneSubtitle = `<p class="tone-intro">${toneIntro}</p>`;

  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Your Journey – ${itinerary.title || 'Travel Itinerary'}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');
    
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #1a1a1a;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
      background: #fff;
    }
    
    /* Header */
    .header {
      text-align: center;
      margin-bottom: 40px;
      padding-bottom: 24px;
      border-bottom: 2px solid #1a1a1a;
    }
    
    .header img {
      max-width: 180px;
      height: auto;
      margin: 0 auto 12px auto;
      display: block;
    }
    
    .tagline {
      font-size: 9pt;
      letter-spacing: 3px;
      color: #666;
      text-transform: uppercase;
      margin-top: 4px;
    }
    
    /* Welcome Hero */
    .welcome-hero {
      text-align: center;
      background: linear-gradient(135deg, #1a1a1a 0%, #333 100%);
      color: white;
      padding: 40px 30px;
      border-radius: 12px;
      margin-bottom: 30px;
    }
    
    .welcome-hero h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 32pt;
      font-weight: 600;
      margin: 0 0 10px;
      color: white;
      border: none;
    }
    
    .welcome-subtitle {
      color: rgba(255,255,255,0.8);
      font-size: 14pt;
      margin-bottom: 0;
    }
    
    /* Title */
    h1 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 28pt;
      font-weight: 600;
      text-align: center;
      margin: 30px 0 10px;
      letter-spacing: -0.5px;
    }
    
    .subtitle {
      text-align: center;
      color: #666;
      font-size: 12pt;
      margin-bottom: 10px;
    }
    
    .tone-intro {
      text-align: center;
      color: #e91e8c;
      font-size: 11pt;
      font-style: italic;
      margin-bottom: 30px;
      padding: 12px;
      background: linear-gradient(135deg, #fdf2f8 0%, #fff 100%);
      border-radius: 6px;
    }
    
    /* Poem Section */
    .poem-section {
      background: linear-gradient(135deg, #fef3c7 0%, #fff7ed 100%);
      border-radius: 12px;
      padding: 30px;
      margin-bottom: 30px;
      text-align: center;
      border: 1px solid #fcd34d;
    }
    
    .poem-content {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 14pt;
      font-style: italic;
      line-height: 2;
      color: #78350f;
    }
    
    .poem-content span {
      display: block;
    }
    
    .poem-attribution {
      margin-top: 16px;
      font-size: 10pt;
      color: #92400e;
    }
    
    /* Weather Section */
    .weather-section {
      background: linear-gradient(135deg, #e0f2fe 0%, #f0f9ff 100%);
      border-radius: 12px;
      padding: 20px;
      margin-bottom: 30px;
      border: 1px solid #7dd3fc;
    }
    
    .weather-section h4 {
      font-size: 12pt;
      font-weight: 600;
      color: #0369a1;
      margin-bottom: 16px;
      text-align: center;
    }
    
    .weather-grid {
      display: flex;
      justify-content: center;
      gap: 16px;
      flex-wrap: wrap;
    }
    
    .weather-day {
      background: white;
      border-radius: 8px;
      padding: 12px 16px;
      text-align: center;
      min-width: 80px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.05);
    }
    
    .weather-date {
      display: block;
      font-size: 9pt;
      color: #666;
      margin-bottom: 4px;
    }
    
    .weather-icon {
      display: block;
      font-size: 24pt;
      margin: 4px 0;
    }
    
    .weather-temps {
      display: block;
      font-size: 10pt;
      font-weight: 600;
      color: #333;
    }
    
    .weather-note {
      text-align: center;
      font-size: 8pt;
      color: #666;
      margin-top: 12px;
    }
    
    /* Voucher Section */
    .voucher-section {
      margin-bottom: 30px;
    }
    
    .voucher-card {
      background: linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%);
      border: 2px dashed #e91e8c;
      border-radius: 12px;
      padding: 24px;
      text-align: center;
    }
    
    .voucher-header {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      margin-bottom: 12px;
    }
    
    .voucher-gift {
      font-size: 28pt;
    }
    
    .voucher-title {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 18pt;
      font-weight: 600;
      color: #be185d;
    }
    
    .voucher-description {
      color: #666;
      font-size: 11pt;
      margin-bottom: 16px;
    }
    
    .voucher-code-box {
      background: white;
      border-radius: 8px;
      padding: 12px 24px;
      display: inline-block;
      margin-bottom: 12px;
    }
    
    .voucher-label {
      font-size: 9pt;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
      display: block;
      margin-bottom: 4px;
    }
    
    .voucher-code {
      font-family: monospace;
      font-size: 20pt;
      font-weight: 700;
      color: #e91e8c;
      letter-spacing: 2px;
    }
    
    .voucher-terms {
      font-size: 9pt;
      color: #999;
    }
    
    .stay-intro {
      color: #666;
      font-size: 10pt;
      font-style: italic;
      margin-bottom: 8px;
    }
    
    h2 {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 16pt;
      font-weight: 600;
      margin: 30px 0 16px;
      padding-bottom: 8px;
      border-bottom: 2px solid #e91e8c;
    }
    
    /* Guest Info */
    .guest-info {
      background: #f8f9fa;
      border-radius: 8px;
      padding: 20px;
      margin-bottom: 30px;
    }
    
    .guest-info h3 {
      font-size: 11pt;
      font-weight: 600;
      margin-bottom: 12px;
    }
    
    .guest-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    
    .guest-field {
      display: flex;
      flex-direction: column;
    }
    
    .guest-label {
      font-size: 9pt;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    
    .guest-value {
      font-size: 11pt;
      font-weight: 500;
    }
    
    /* Stay Cards */
    .stays-container {
      margin-bottom: 30px;
    }
    
    .stay-card {
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      margin-bottom: 24px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    
    .stay-header {
      background: linear-gradient(135deg, #1a1a1a 0%, #333 100%);
      color: white;
      padding: 12px 16px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    
    .stay-number {
      font-weight: 600;
      font-size: 12pt;
    }
    
    .stay-dates {
      font-size: 10pt;
      opacity: 0.9;
    }
    
    .stay-image {
      width: 100%;
      height: 180px;
      object-fit: cover;
    }
    
    .stay-content {
      padding: 16px;
    }
    
    .property-name {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 16pt;
      font-weight: 600;
      margin-bottom: 4px;
    }
    
    .property-location {
      color: #666;
      font-size: 10pt;
      margin-bottom: 16px;
    }
    
    .stay-details {
      border-top: 1px solid #eee;
      padding-top: 12px;
    }
    
    .detail-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
    }
    
    .detail-label {
      color: #666;
    }
    
    .detail-value {
      font-weight: 500;
    }
    
    .price-row {
      border-top: 1px solid #eee;
      margin-top: 8px;
      padding-top: 12px;
    }
    
    .price-row .detail-value {
      color: #e91e8c;
      font-weight: 600;
      font-size: 12pt;
    }
    
    /* Experiences Section */
    .experiences-section {
      margin-top: 20px;
      padding-top: 16px;
      border-top: 1px solid #eee;
    }
    
    .experiences-section h4 {
      font-size: 11pt;
      font-weight: 600;
      color: #333;
      margin-bottom: 12px;
    }
    
    .experience-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 0;
      border-bottom: 1px solid #f5f5f5;
    }
    
    .experience-item:last-child {
      border-bottom: none;
    }
    
    .experience-icon {
      font-size: 16pt;
      width: 28px;
      text-align: center;
    }
    
    .experience-content {
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex: 1;
    }
    
    .experience-title {
      font-weight: 500;
    }
    
    .experience-duration {
      color: #666;
      font-size: 9pt;
      background: #f5f5f5;
      padding: 2px 8px;
      border-radius: 4px;
    }
    
    /* Dining Section */
    .dining-section {
      background: linear-gradient(135deg, #fdf2f8 0%, #fff 100%);
      border-radius: 8px;
      padding: 16px;
      margin-top: 16px;
    }
    
    .dining-section h4 {
      font-size: 11pt;
      font-weight: 600;
      color: #333;
      margin-bottom: 12px;
    }
    
    .dining-card {
      background: white;
      border-radius: 6px;
      padding: 12px;
    }
    
    .dining-name {
      font-family: 'Playfair Display', serif;
      font-size: 14pt;
      margin-bottom: 4px;
    }
    
    .dining-cuisine {
      color: #666;
      font-size: 10pt;
      margin-bottom: 8px;
    }
    
    .dining-tip {
      font-style: italic;
      color: #e91e8c;
      font-size: 10pt;
      margin-bottom: 8px;
      padding: 8px;
      background: #fdf2f8;
      border-radius: 4px;
    }
    
    .dining-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 12px;
      font-size: 9pt;
      color: #666;
    }
    
    .dining-dress, .dining-reserve {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    
    .price-badge {
      background: #333;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      text-transform: capitalize;
    }
    
    /* Practical Info */
    .practical-section {
      margin-top: 16px;
      padding-top: 16px;
      border-top: 1px solid #eee;
    }
    
    .practical-section h4 {
      font-size: 11pt;
      font-weight: 600;
      color: #333;
      margin-bottom: 12px;
    }
    
    .practical-info {
      font-size: 10pt;
      color: #666;
    }
    
    .practical-address {
      margin-bottom: 8px;
    }
    
    .practical-times {
      display: flex;
      gap: 16px;
      margin-bottom: 8px;
    }
    
    .practical-contact {
      font-weight: 500;
      color: #333;
    }
    
    /* Summary */
    .summary-box {
      background: linear-gradient(135deg, #f8f9fa 0%, #fff 100%);
      border: 2px solid #1a1a1a;
      border-radius: 8px;
      padding: 24px;
      margin-bottom: 30px;
    }
    
    .summary-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
    }
    
    .summary-label {
      font-size: 11pt;
    }
    
    .summary-value {
      font-weight: 500;
    }
    
    .total-row {
      border-top: 2px solid #1a1a1a;
      margin-top: 12px;
      padding-top: 16px;
    }
    
    .total-row .summary-label {
      font-family: 'Playfair Display', Georgia, serif;
      font-size: 14pt;
      font-weight: 600;
    }
    
    .total-row .summary-value {
      color: #e91e8c;
      font-size: 18pt;
      font-weight: 700;
    }
    
    /* Share Section */
    .share-section {
      text-align: center;
      margin-top: 40px;
      padding: 24px;
      background: #f8f9fa;
      border-radius: 8px;
      page-break-inside: avoid;
    }
    
    .share-section h2 {
      border-bottom: none;
      margin: 0 0 8px 0;
      padding: 0;
    }
    
    .share-content {
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    
    .qr-code {
      width: 120px;
      height: 120px;
      margin: 16px auto;
    }
    
    .share-content p {
      color: #666;
      font-size: 10pt;
    }
    
    /* Footer */
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #ddd;
      text-align: center;
    }
    
    .footer p {
      font-size: 9pt;
      color: #666;
      margin-bottom: 8px;
    }
    
    .footer .brochure-id {
      font-family: monospace;
      font-size: 8pt;
      color: #999;
    }
    
    @media print {
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
        color-adjust: exact !important;
      }
      
      body {
        padding: 20px;
        background: #fff !important;
      }
      
      .stay-card {
        page-break-inside: avoid;
      }
      
      .share-section {
        page-break-inside: avoid;
      }
      
      /* Preserve gradient backgrounds */
      .welcome-hero,
      .poem-section,
      .weather-section,
      .voucher-card,
      .hidden-gems-section,
      .insider-tips-section,
      .curated-guide-section,
      .stay-header,
      .tone-intro,
      .dining-section,
      .summary-box {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" />
    <p class="tagline">Sleep in Africa like never before</p>
  </div>
  
  <!-- Welcome Hero -->
  <div class="welcome-hero">
    <h1>Welcome, ${guestFirstName}!</h1>
    <p class="welcome-subtitle">${itinerary.total_nights} nights across ${stays.length} destination${stays.length > 1 ? 's' : ''}</p>
  </div>
  
  ${toneSubtitle}
  
  <!-- AI-Generated Poem -->
  ${generatePoemHTML(enhancements.poem)}
  
  <!-- Weather Forecast -->
  ${generateWeatherHTML(enhancements.weather)}
  
  <!-- Surprise Voucher -->
  ${generateVoucherHTML(enhancements.voucher)}
  
  <!-- Guest Information -->
  <div class="guest-info">
    <h3>Guest Information</h3>
    <div class="guest-grid">
      <div class="guest-field">
        <span class="guest-label">Name</span>
        <span class="guest-value">${itinerary.guest_name || 'Guest'}</span>
      </div>
      <div class="guest-field">
        <span class="guest-label">Email</span>
        <span class="guest-value">${itinerary.guest_email || '-'}</span>
      </div>
      ${itinerary.guest_phone ? `
      <div class="guest-field">
        <span class="guest-label">Phone</span>
        <span class="guest-value">${itinerary.guest_phone}</span>
      </div>
      ` : ''}
    </div>
  </div>
  
  <!-- Itinerary -->
  <h2>Your Itinerary</h2>
  <div class="stays-container">
    ${staysHTML}
  </div>
  
  <!-- Tiered Destination Elaboration (Silver+) -->
  ${enhancements.destinationElaboration || ''}
  
  <!-- Summary -->
  <div class="summary-box">
    <div class="summary-row">
      <span class="summary-label">Total Nights</span>
      <span class="summary-value">${itinerary.total_nights} night${itinerary.total_nights > 1 ? 's' : ''}</span>
    </div>
    <div class="summary-row">
      <span class="summary-label">Properties</span>
      <span class="summary-value">${stays.length} destination${stays.length > 1 ? 's' : ''}</span>
    </div>
    <div class="summary-row total-row">
      <span class="summary-label">Total Price</span>
      <span class="summary-value">${formatCurrency(itinerary.total_price, itinerary.currency || 'ZAR')}</span>
    </div>
  </div>
  
  ${itinerary.special_requests ? `
  <h2>Special Requests</h2>
  <p style="font-style: italic; color: #666;">"${itinerary.special_requests}"</p>
  ` : ''}
  
  <!-- Share Section -->
  ${generateShareHTML(itinerary.id)}
  
  <!-- Footer -->
  <div class="footer">
    <p>This brochure was generated on ${new Date().toLocaleDateString('en-ZA', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
    <p class="brochure-id">Itinerary ID: ${itinerary.id}</p>
    <p style="margin-top: 16px;">
      Thank you for booking with <strong>Sleep in Africa by RoomsOnline</strong><br />
      <a href="https://book.sleepinafrica.roomsonline.co.za" style="color: #e91e8c;">book.sleepinafrica.roomsonline.co.za</a>
    </p>
  </div>
</body>
</html>
  `;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { itinerary_id } = await req.json();

    if (!itinerary_id) {
      return new Response(
        JSON.stringify({ error: "itinerary_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch itinerary
    const { data: itinerary, error: itineraryError } = await supabase
      .from("itineraries")
      .select("*")
      .eq("id", itinerary_id)
      .single();

    if (itineraryError || !itinerary) {
      return new Response(
        JSON.stringify({ error: "Itinerary not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse stays - handle both snake_case and camelCase field names
    const rawStays = typeof itinerary.stays === 'string' 
      ? JSON.parse(itinerary.stays) 
      : itinerary.stays || [];

    // Normalize stay data to handle snake_case from DB and camelCase from frontend
    const normalizeStay = (s: any): Stay => ({
      propertyId: s.propertyId || s.property_id,
      propertyName: s.propertyName || s.property_name || 'Property',
      propertyImage: s.propertyImage || s.property_image,
      roomTypeId: s.roomTypeId || s.room_type_id,
      roomTypeName: s.roomTypeName || s.rooms?.[0]?.room_type_name,
      rateTypeId: s.rateTypeId || s.rate_type_id,
      rateTypeName: s.rateTypeName,
      checkIn: s.checkIn || s.dates?.check_in,
      checkOut: s.checkOut || s.dates?.check_out,
      guests: s.guests || { adults: 2, children: 0, infants: 0 },
      price: s.price || s.price_breakdown?.total || 0,
      nights: s.nights || (s.dates ? Math.ceil((new Date(s.dates.check_out).getTime() - new Date(s.dates.check_in).getTime()) / (1000 * 60 * 60 * 24)) : 1),
      city: s.city,
      country: s.country,
    });

    const stays: Stay[] = rawStays.map(normalizeStay)
      .sort((a, b) => (a.checkIn || '').localeCompare(b.checkIn || ''));

    // Get unique property IDs (filter out undefined)
    const propertyIds = [...new Set(stays.map(s => s.propertyId).filter(Boolean))];
    
    // Fetch property details including practical info and coordinates
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, main_image, city, country, address, check_in_time, check_out_time, contact_phone, contact_email, latitude, longitude")
      .in("id", propertyIds);

    const propertyMap = new Map(properties?.map(p => [p.id, p]) || []);
    
    // Fetch local experiences for all properties
    const { data: allExperiences } = await supabase
      .from("local_experiences")
      .select("*")
      .in("property_id", propertyIds)
      .eq("is_active", true)
      .order("display_order");
    
    // Group experiences by property
    const experiencesMap = new Map<string, LocalExperience[]>();
    allExperiences?.forEach(exp => {
      const existing = experiencesMap.get(exp.property_id) || [];
      existing.push(exp);
      experiencesMap.set(exp.property_id, existing);
    });
    
    // Check for properties needing enrichment and trigger async
    for (const propertyId of propertyIds) {
      const experiences = experiencesMap.get(propertyId) || [];
      if (experiences.length < 3) {
        console.log(`Auto-enriching experiences for property ${propertyId}`);
        supabase.functions.invoke('enrich-property-experiences', {
          body: { property_id: propertyId }
        }).catch(err => console.error(`Enrichment failed for ${propertyId}:`, err));
      }
    }
    
    // Enrich stays with property details and experiences
    const enrichedStays: EnrichedStay[] = stays.map(stay => ({
      ...stay,
      propertyImage: propertyMap.get(stay.propertyId)?.main_image || stay.propertyImage,
      city: stay.city || propertyMap.get(stay.propertyId)?.city,
      country: stay.country || propertyMap.get(stay.propertyId)?.country,
      experiences: experiencesMap.get(stay.propertyId) || [],
      propertyDetails: propertyMap.get(stay.propertyId) || null,
    }));

    // Detect tone from booking context
    const tone = detectTone(itinerary, stays);
    console.log(`[PDF] Detected journey tone: ${tone}`);

    // Get property names for AI and voucher generation
    const propertyNames = enrichedStays.map(s => s.propertyName);

    // === PHASE 3 ENHANCEMENTS ===
    
    // 1. Generate AI poem (non-blocking, with timeout)
    const poemPromise = generatePersonalPoem(
      itinerary.guest_name || 'Guest',
      propertyNames,
      tone
    ).catch(err => {
      console.error("[PDF] Poem generation failed:", err);
      return null;
    });

    // 2. Fetch weather for first property (if coordinates available)
    let weatherPromise: Promise<WeatherDay[]> = Promise.resolve([]);
    const firstPropertyWithCoords = properties?.find(p => p.latitude && p.longitude);
    if (firstPropertyWithCoords && stays.length > 0) {
      const firstStay = stays[0];
      weatherPromise = fetchWeatherForecast(
        firstPropertyWithCoords.latitude!,
        firstPropertyWithCoords.longitude!,
        firstStay.checkIn,
        firstStay.checkOut
      ).catch(err => {
        console.error("[PDF] Weather fetch failed:", err);
        return [];
      });
    }

    // 3. Generate surprise voucher (always for Phase 3)
    const voucherPromise = generateSurpriseVoucher(
      supabase,
      itinerary_id,
      propertyNames
    ).catch(err => {
      console.error("[PDF] Voucher generation failed:", err);
      return null;
    });

    // Wait for all enhancements (with timeout for poem)
    const [poem, weather, voucher] = await Promise.all([
      Promise.race([
        poemPromise,
        new Promise<null>(resolve => setTimeout(() => resolve(null), 5000))
      ]),
      weatherPromise,
      voucherPromise,
    ]);

    // Collect all experiences from all properties for tiered content
    const allPropertyExperiences = enrichedStays.flatMap(s => s.experiences);
    const cities = enrichedStays.map(s => s.city || s.propertyDetails?.city).filter(Boolean) as string[];

    // Generate tiered destination content based on booking value (Silver+ bookings R10,000+)
    const destinationElaborationHTML = generateDestinationElaborationHTML(
      allPropertyExperiences,
      itinerary.total_price || 0,
      enrichedStays.length,
      cities
    );

    const enhancements: BrochureEnhancements = {
      poem,
      weather,
      voucher,
      destinationElaboration: destinationElaborationHTML,
    };

    console.log(`[PDF] Enhancements: poem=${!!poem}, weather=${weather.length}d, voucher=${voucher?.code || 'none'}, destinationTier=${calculateDelightTier(itinerary.total_price || 0)}`);

    // Generate HTML brochure with tone-adaptive content and enhancements
    const html = generateBrochureHTML(itinerary, enrichedStays, tone, enhancements);

    // Store HTML in storage bucket for client-side PDF generation
    const fileName = `brochures/itinerary-${itinerary_id}-${Date.now()}.html`;
    
    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(fileName, html, {
        contentType: "text/html",
        upsert: true,
      });

    if (uploadError) {
      console.error("Upload error:", uploadError);
      // Return HTML directly if storage fails
      return new Response(
        JSON.stringify({ 
          html,
          message: "HTML generated successfully (storage unavailable)"
        }),
        { 
          status: 200, 
          headers: { ...corsHeaders, "Content-Type": "application/json" } 
        }
      );
    }

    // Get public URL
    const { data: urlData } = supabase.storage
      .from("documents")
      .getPublicUrl(fileName);

    // Update itinerary with brochure URL
    await supabase
      .from("itineraries")
      .update({ 
        brochure_pdf_url: urlData.publicUrl,
        brochure_generated_at: new Date().toISOString()
      })
      .eq("id", itinerary_id);

    return new Response(
      JSON.stringify({ 
        html,
        html_url: urlData.publicUrl,
        enhancements: {
          has_poem: !!poem,
          weather_days: weather.length,
          voucher_code: voucher?.code || null,
        },
        message: "Brochure generated successfully"
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, "Content-Type": "application/json" } 
      }
    );

  } catch (error: unknown) {
    console.error("Error generating brochure:", error);
    const message = error instanceof Error ? error.message : "Failed to generate brochure";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
