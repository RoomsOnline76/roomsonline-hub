import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

// Detect tone from booking context
function detectTone(itinerary: any, stays: any[]): JourneyTone {
  const specialRequests = (itinerary.special_requests || '').toLowerCase();
  const guestEmail = (itinerary.guest_email || '').toLowerCase();
  
  // Check special requests for signals
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
  
  // Check email domain for business travel
  const businessDomains = ['.com', '.co.za', '.org', '.net'];
  const personalDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'icloud.com'];
  if (guestEmail && !personalDomains.some(d => guestEmail.includes(d)) && 
      businessDomains.some(d => guestEmail.endsWith(d))) {
    return 'professional';
  }
  
  // Check property types and pricing for luxury signals
  const avgPrice = stays.length > 0 
    ? stays.reduce((sum, s) => sum + (s.price || 0), 0) / stays.length 
    : 0;
  
  if (avgPrice > 5000) {
    return 'luxury';
  }
  
  // Check for luxury tags in property names
  const luxuryKeywords = ['spa', 'resort', 'lodge', 'manor', 'estate', 'boutique'];
  const hasLuxuryProperty = stays.some(s => 
    luxuryKeywords.some(kw => (s.propertyName || '').toLowerCase().includes(kw))
  );
  
  if (hasLuxuryProperty) {
    return 'luxury';
  }
  
  // Default to relaxation for leisure travel
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

function generateExperiencesHTML(experiences: LocalExperience[]): string {
  if (!experiences || experiences.length === 0) return '';
  
  const otherExperiences = experiences.filter(e => e.category !== 'dining').slice(0, 4);
  
  if (otherExperiences.length === 0) return '';
  
  const experienceItems = otherExperiences.map(exp => `
    <div class="experience-item">
      <span class="experience-icon">${categoryIcons[exp.category] || '✨'}</span>
      <div class="experience-content">
        <span class="experience-title">${exp.title}</span>
        ${exp.duration_hours ? `<span class="experience-duration">${exp.duration_hours}h</span>` : ''}
      </div>
    </div>
  `).join('');
  
  return `
    <div class="experiences-section">
      <h4>✨ Top Experiences Nearby</h4>
      ${experienceItems}
    </div>
  `;
}

function generateDiningHTML(dining: LocalExperience | undefined): string {
  if (!dining) return '';
  
  return `
    <div class="dining-section">
      <h4>🍷 Where to Dine</h4>
      <div class="dining-card">
        <h5 class="dining-name">${dining.title}</h5>
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

function generateBrochureHTML(itinerary: any, stays: EnrichedStay[], tone: JourneyTone): string {
  const toneIntro = TONE_INTROS[tone];
  
  const staysHTML = stays.map((stay, index) => {
    const diningExp = stay.experiences?.find(e => e.category === 'dining');
    const stayIntro = getTonePhrase(tone);
    
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
        ${generateDiningHTML(diningExp)}
        ${stay.propertyDetails ? generatePracticalHTML(stay.propertyDetails) : ''}
      </div>
    </div>
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
      body {
        padding: 20px;
      }
      
      .stay-card {
        page-break-inside: avoid;
      }
      
      .share-section {
        page-break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <img src="https://book.sleepinafrica.roomsonline.co.za/images/rol-logo-email.png" alt="RoomsOnline" />
    <p class="tagline">Curated African Hospitality</p>
  </div>
  
  <!-- Title -->
  <h1>${itinerary.title || 'Your Journey'}</h1>
  <p class="subtitle">${itinerary.total_nights} nights across ${stays.length} destination${stays.length > 1 ? 's' : ''}</p>
  ${toneSubtitle}
  
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
      <strong>RoomsOnline</strong> – Curated African Hospitality<br />
      <a href="https://sleepinafrica.roomsonline.co.za" style="color: #e91e8c;">sleepinafrica.roomsonline.co.za</a>
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

    // Parse stays
    const stays: Stay[] = typeof itinerary.stays === 'string' 
      ? JSON.parse(itinerary.stays) 
      : itinerary.stays || [];

    // Get unique property IDs
    const propertyIds = [...new Set(stays.map(s => s.propertyId))];
    
    // Fetch property details including practical info
    const { data: properties } = await supabase
      .from("properties")
      .select("id, name, main_image, city, country, address, check_in_time, check_out_time, contact_phone, contact_email")
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
        // Non-blocking call to enrich experiences
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
    console.log(`Detected journey tone: ${tone}`);

    // Generate HTML brochure with tone-adaptive content
    const html = generateBrochureHTML(itinerary, enrichedStays, tone);

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
