// ============================================================================
// DELIGHT ENGINE - Value-Based, Destination-Aware Surprise System
// ============================================================================
// Quantifies the "1-2 delights per session" concept with logic based on
// booking value > R5,000 and enriches with destination-specific content.
// ============================================================================

export type DelightTier = 'none' | 'bronze' | 'silver' | 'gold' | 'platinum';

export interface DelightConfig {
  bookingValue: number;      // Total in ZAR
  destinationCity: string;
  destinationCountry: string;
  propertyId: string;
  guestName: string;
  sessionId: string;
  delightsDelivered: number; // Current count for session
}

export interface Delight {
  type: 'tip' | 'upgrade' | 'amenity' | 'voucher' | 'experience';
  message: string;
  code?: string;
  destinationContext?: string;
  icon: string;
  tier: DelightTier;
}

export interface LocalExperience {
  id: string;
  title: string;
  description: string | null;
  category: string;
  why_locals_love_it: string | null;
  best_time: string | null;
  venue_type: string | null;
  cuisine_type: string | null;
  price_indicator: string | null;
  display_order?: number | null;
  // Extended fields used by PDF generation
  distance_km?: number | null;
  duration_hours?: number | null;
  reservation_required?: boolean | null;
  dress_code?: string | null;
}

// ============================================================================
// DINING EXPERIENCE HELPER
// ============================================================================

/**
 * Find dining experience with restaurant fallback
 * Priority: dining category > restaurant venue_type (sorted by display_order)
 */
export function findDiningExperience(
  experiences: LocalExperience[] | undefined
): LocalExperience | undefined {
  if (!experiences || experiences.length === 0) return undefined;
  
  // First: look for explicit dining category
  const diningCategory = experiences.find(e => e.category === 'dining');
  if (diningCategory) return diningCategory;
  
  // Fallback: look for restaurant venue_type, pick highest rated (lowest display_order)
  const restaurants = experiences
    .filter(e => e.venue_type === 'restaurant')
    .sort((a, b) => (a.display_order ?? 999) - (b.display_order ?? 999));
  
  return restaurants[0] || undefined;
}

// ============================================================================
// TIER CALCULATION
// ============================================================================

/**
 * Calculate delight tier based on booking value in ZAR
 * 
 * | Tier     | Booking Value     | Delight Strategy                      |
 * |----------|-------------------|---------------------------------------|
 * | NONE     | < R5,000          | No AI delights (standard flow)        |
 * | BRONZE   | R5,000 – R9,999   | 1 delight: destination tip OR amenity |
 * | SILVER   | R10,000 – R24,999 | 1-2 delights: tip + small upgrade     |
 * | GOLD     | R25,000 – R49,999 | 2 delights: upgrade + local voucher   |
 * | PLATINUM | R50,000+          | 2 delights: premium surprise package  |
 */
export function calculateDelightTier(bookingValue: number): DelightTier {
  if (bookingValue < 5000) return 'none';
  if (bookingValue < 10000) return 'bronze';
  if (bookingValue < 25000) return 'silver';
  if (bookingValue < 50000) return 'gold';
  return 'platinum';
}

/**
 * Get maximum number of delights allowed for a tier
 */
export function getMaxDelightsForTier(tier: DelightTier): number {
  switch (tier) {
    case 'none': return 0;
    case 'bronze': return 1;
    case 'silver': return 2;
    case 'gold': return 2;
    case 'platinum': return 2;
    default: return 0;
  }
}

/**
 * Check if session can receive more delights
 */
export function canDeliverDelight(
  bookingValue: number,
  delightsDelivered: number
): boolean {
  const tier = calculateDelightTier(bookingValue);
  const maxDelights = getMaxDelightsForTier(tier);
  return delightsDelivered < maxDelights;
}

// ============================================================================
// REAL VOUCHER RESOLUTION
// ============================================================================

/**
 * Look up a REAL, currently usable promo code for a property (or a global one).
 * Codes are never invented — returns null when the property has not loaded one,
 * in which case delights are delivered without a code.
 */
export async function findRealVoucherCode(
  supabase: any,
  propertyId: string
): Promise<{ code: string; description: string } | null> {
  try {
    const today = new Date().toISOString().split('T')[0];
    const { data: promos } = await supabase
      .from('promo_codes')
      .select('code, description, discount_type, discount_value, property_id, valid_from, valid_until, max_uses, current_uses')
      .eq('is_active', true);

    const usable = (promos || []).filter((p: any) => {
      if (p.property_id !== null && p.property_id !== propertyId) return false;
      if (p.valid_from && today < p.valid_from) return false;
      if (p.valid_until && today > p.valid_until) return false;
      if (p.max_uses !== null && (p.current_uses || 0) >= p.max_uses) return false;
      return true;
    });

    const match = usable.find((p: any) => p.property_id !== null) || usable[0];
    if (!match) return null;

    const discountText = match.discount_type === 'percentage'
      ? `${match.discount_value}% off`
      : `${match.discount_value} off`;
    return { code: match.code, description: match.description || discountText };
  } catch (error) {
    console.error('[DelightEngine] Voucher lookup error:', error);
    return null;
  }
}

// ============================================================================
// DESTINATION-AWARE DELIGHT GENERATION
// ============================================================================

/**
 * Generate a delight based on tier and local experiences
 */
export async function generateDestinationDelight(
  supabase: any,
  propertyId: string,
  city: string,
  country: string,
  tier: DelightTier
): Promise<Delight | null> {
  if (tier === 'none') return null;

  try {
    // Fetch local experiences for this property
    const { data: experiences } = await supabase
      .from('local_experiences')
      .select('*')
      .eq('property_id', propertyId)
      .eq('is_active', true)
      .limit(10);

    // Fetch property highlights for context
    const { data: property } = await supabase
      .from('properties')
      .select('city, country, highlights, tagline')
      .eq('id', propertyId)
      .single();

    const actualCity = property?.city || city || 'Africa';
    const actualCountry = property?.country || country || '';

    // BRONZE: Simple destination tip from local experiences
    if (tier === 'bronze') {
      const nature = experiences?.find((e: LocalExperience) => e.category === 'nature');
      const culture = experiences?.find((e: LocalExperience) => e.category === 'culture');
      const experience = nature || culture;
      
      if (experience) {
        return {
          type: 'tip',
          icon: nature ? '🌿' : '🎨',
          message: `Local tip: Don't miss ${experience.title}!`,
          destinationContext: experience.why_locals_love_it || experience.description || 
            `A must-see experience in ${actualCity}.`,
          tier,
        };
      }
      
      // Fallback tip
      return {
        type: 'tip',
        icon: '✨',
        message: `Welcome to ${actualCity}! You're in for a treat.`,
        destinationContext: `${actualCity}${actualCountry ? `, ${actualCountry}` : ''} offers unforgettable experiences.`,
        tier,
      };
    }

    // Silver and above may carry a code — but only a real, redeemable one.
    const realVoucher = await findRealVoucherCode(supabase, propertyId);

    // SILVER: Experience highlight, with a real offer code when one exists
    if (tier === 'silver') {
      const adventure = experiences?.find((e: LocalExperience) => e.category === 'adventure');
      const activity = experiences?.find((e: LocalExperience) => 
        e.category === 'nature' || e.category === 'culture' || e.category === 'wellness'
      );
      const experience = adventure || activity;

      return {
        type: realVoucher ? 'experience' : 'tip',
        icon: realVoucher ? '🎁' : '🌿',
        message: realVoucher
          ? `I've arranged something special – ${realVoucher.description}, applied at checkout.`
          : `A local favourite while you're here: ${experience?.title || `plenty to explore around ${actualCity}`}.`,
        ...(realVoucher ? { code: realVoucher.code } : {}),
        destinationContext: experience?.why_locals_love_it || 
          `${actualCity} is known for its ${experience?.category || 'natural beauty'}.`,
        tier,
      };
    }

    // GOLD: Premium experience with upgrade
    if (tier === 'gold') {
      const dining = findDiningExperience(experiences);
      const wellness = experiences?.find((e: LocalExperience) => e.category === 'wellness');
      const premium = dining || wellness;

      return {
        type: realVoucher ? 'voucher' : 'upgrade',
        icon: '🌟',
        message: realVoucher
          ? `VIP treatment: ${realVoucher.description}, applied at checkout.`
          : premium
            ? `VIP touch: I'll let the property know you'd love ${premium.title}.`
            : `VIP treatment: I've flagged your booking for a warm welcome.`,
        ...(realVoucher ? { code: realVoucher.code } : {}),
        destinationContext: premium?.why_locals_love_it || 
          `Enjoy the finest ${actualCity} has to offer.`,
        tier,
      };
    }

    // PLATINUM: Premium package with dining
    if (tier === 'platinum') {
      const dining = findDiningExperience(experiences);
      
      return {
        type: realVoucher ? 'voucher' : 'upgrade',
        icon: '✨',
        message: realVoucher
          ? `VIP treatment awaits – ${realVoucher.description}, applied at checkout.`
          : dining
            ? `VIP treatment awaits – I'll let the property know you'd love a table at ${dining.title}.`
            : `VIP treatment awaits – I've flagged your stay so the property can look after you.`,
        ...(realVoucher ? { code: realVoucher.code } : {}),
        destinationContext: dining?.why_locals_love_it || 
          `A signature ${actualCity} dining experience curated just for you.`,
        tier,
      };
    }

    return null;
  } catch (error) {
    console.error('[DelightEngine] Error generating destination delight:', error);
    return null;
  }
}

// ============================================================================
// PDF ENHANCEMENT SECTIONS (Tiered)
// ============================================================================

const categoryIcons: Record<string, string> = {
  nature: '🌿',
  culture: '🎨',
  adventure: '🏃',
  relaxation: '🧘',
  wellness: '💆',
  food: '🍴',
  dining: '🍷',
};

/**
 * Generate "Hidden Gems" section HTML for Silver tier
 */
export function generateHiddenGemsHTML(experiences: LocalExperience[]): string {
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

/**
 * Generate "Insider Tips" section HTML for Gold tier
 */
export function generateInsiderTipsHTML(experiences: LocalExperience[]): string {
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

/**
 * Generate "Curated Journey Guide" section HTML for Platinum tier
 */
export function generateCuratedGuideHTML(
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

/**
 * Generate destination elaboration HTML based on booking tier
 */
export function generateDestinationElaborationHTML(
  experiences: LocalExperience[],
  bookingValue: number,
  stayCount: number,
  cities: string[]
): string {
  const tier = calculateDelightTier(bookingValue);
  
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

/**
 * Get CSS styles for delight sections in PDF
 */
export function getDelightSectionStyles(): string {
  return `
    /* Hidden Gems Section */
    .hidden-gems-section {
      background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
      border-radius: 12px;
      padding: 24px;
      margin: 30px 0;
      border: 1px solid #86efac;
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
  `;
}
