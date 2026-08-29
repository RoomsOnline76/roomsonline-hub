import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBehavioralMemory } from '@/hooks/useBehavioralMemory';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

const RADIUS_KM = 350;

// Haversine formula to calculate distance between two points in km
const calculateDistanceKm = (
  lat1: number, lon1: number,
  lat2: number, lon2: number
): number => {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

interface RecommendedProperty {
  id: string;
  name: string;
  slug: string | null;
  city: string;
  country: string;
  price_per_night: number;
  images: string[];
  matchReason: string;
}

/** Row shape pinned on the recommendation query (select string is untyped). */
interface RecommendationRow {
  id: string;
  name: string;
  slug: string | null;
  city: string;
  country: string;
  price_per_night: number;
  images: unknown;
  amenities: unknown;
  latitude: number | null;
  longitude: number | null;
}



interface PropertyRecommendationsProps {
  currentPropertyId?: string;
  className?: string;
  maxItems?: number;
  variant?: 'compact' | 'full';
}

export function PropertyRecommendations({
  currentPropertyId,
  className,
  maxItems = 3,
  variant = 'compact'
}: PropertyRecommendationsProps) {
  const [recommendations, setRecommendations] = useState<RecommendedProperty[]>([]);
  const [loading, setLoading] = useState(true);
  const { state, getInferredPreferences } = useBehavioralMemory();

  useEffect(() => {
    fetchRecommendations();
  }, [currentPropertyId]);

  // Helper to extract actual rate from amenities (since price_per_night is often 0)
  const getPropertyRate = (property: any): number => {
    // Priority 1: Direct price_per_night if non-zero
    if (property.price_per_night && property.price_per_night > 0) {
      return property.price_per_night;
    }
    
    // Priority 2: pms_rate_types baseRate
    const rateTypes = property.amenities?.pms_rate_types || [];
    if (rateTypes.length > 0 && rateTypes[0].baseRate) {
      return rateTypes[0].baseRate;
    }
    
    // Priority 3: First room_type baseRate
    const roomTypes = property.amenities?.room_types || [];
    if (roomTypes.length > 0) {
      const room = roomTypes[0];
      if (room.baseRate || room.base_rate) {
        return room.baseRate || room.base_rate;
      }
      // Check linked rate type
      const linkedRateId = room.linkedRateTypes?.[0];
      if (linkedRateId && rateTypes.length > 0) {
        const linkedRate = rateTypes.find((rt: any) => rt.id === linkedRateId);
        if (linkedRate?.baseRate) return linkedRate.baseRate;
      }
    }
    
    return 0; // No rate found
  };

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const preferences = getInferredPreferences();
      const viewedPropertyIds = state.viewedProperties.map(v => v.propertyId);

      // First, get current property's coordinates
      let currentLat: number | null = null;
      let currentLng: number | null = null;

      if (currentPropertyId) {
        const { data: currentProperty } = await supabase
          .from('public_properties')
          .select('latitude, longitude')
          .eq('id', currentPropertyId)
          .single();

        if (currentProperty) {
          currentLat = currentProperty.latitude;
          currentLng = currentProperty.longitude;
        }
      }

      // If current property has no coordinates, hide recommendations
      if (!currentLat || !currentLng) {
        setRecommendations([]);
        return;
      }

      // Build query - include coordinates for distance filtering.
      // The select string is typed as plain `string` so supabase-js does not
      // re-parse it on every conditional reassignment of the builder.
      const sel = (s: string): string => s;
      const query = supabase
        .from('public_properties')
        .select(sel('id, name, slug, city, country, price_per_night, images, amenities, latitude, longitude'))
        .eq('is_active', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)
        .limit(50); // Fetch more for distance filtering

      // Exclude current and already viewed properties. The builder is widened to
      // a thenable of the row shape so the conditional `.not()` reassignment does
      // not make supabase-js re-derive its (very deep) generic type.
      const excludeIds = [currentPropertyId, ...viewedPropertyIds].filter(Boolean);
      const filtered = (
        excludeIds.length > 0 ? query.not('id', 'in', `(${excludeIds.join(',')})`) : query
      ) as unknown as PromiseLike<{ data: RecommendationRow[] | null; error: { message: string } | null }>;

      const { data: properties, error } = await filtered;



      if (error) {
        console.error('Error fetching recommendations:', error);
        setRecommendations([]);
        return;
      }

      if (!properties || properties.length === 0) {
        setRecommendations([]);
        return;
      }

      // Filter by distance - only show properties within 350km radius
      const nearbyProperties = properties.filter(p => {
        if (!p.latitude || !p.longitude) return false;
        const distance = calculateDistanceKm(currentLat, currentLng, p.latitude, p.longitude);
        return distance <= RADIUS_KM;
      });

      // If no nearby properties, hide the section entirely
      if (nearbyProperties.length === 0) {
        setRecommendations([]);
        return;
      }

      // Score and rank properties based on preferences + distance
      const scored = nearbyProperties.map(p => {
        let score = 0;
        const distance = calculateDistanceKm(currentLat!, currentLng!, p.latitude!, p.longitude!);
        
        // Distance bonus - closer properties score higher
        if (distance < 50) score += 40;
        else if (distance < 100) score += 30;
        else if (distance < 200) score += 20;
        else score += 10;

        // Location match
        if (preferences.preferredLocations.includes(p.city)) {
          score += 30;
        }

        // Price match
        if (preferences.preferredPriceRange) {
          const priceMax = parseInt(preferences.preferredPriceRange) || 5000;
          const priceRatio = p.price_per_night / priceMax;
          if (priceRatio >= 0.7 && priceRatio <= 1.3) {
            score += 25;
          }
        }

        // Amenity preferences
        if (preferences.preferredAmenities.length > 0) {
          score += 15;
        }

        // Generate distance-based reason
        const distanceReason = distance < 50
          ? `${Math.round(distance)}km away`
          : `About ${Math.round(distance / 10) * 10}km away`;

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          city: p.city,
          country: p.country,
          price_per_night: getPropertyRate(p),
          images: Array.isArray(p.images) ? p.images as string[] : [],
          score,
          matchReason: distanceReason
        };
      });

      // Sort by score and take top items
      const ranked = scored
        .sort((a, b) => b.score - a.score)
        .slice(0, maxItems);

      setRecommendations(ranked);
    } catch (error) {
      console.error('Recommendation error:', error);
      setRecommendations([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading || recommendations.length === 0) {
    return null;
  }

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(price);
  };

  if (variant === 'compact') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.2 }}
        className={cn('space-y-3', className)}
      >
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>You might also like</span>
        </div>

        <div className="grid gap-3">
          <AnimatePresence>
            {recommendations.map((property, index) => (
              <motion.div
                key={property.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.1 }}
              >
                <Link to={`/property/${property.slug || property.id}`}>
                  <Card className="hover:bg-muted/50 transition-colors cursor-pointer">
                    <CardContent className="p-3 flex items-center gap-3">
                      {property.images[0] && (
                        <img
                          src={property.images[0]}
                          alt={property.name}
                          className="w-16 h-12 object-cover rounded"
                        />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{property.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {property.city}, {property.country}
                        </p>
                      </div>
                      <div className="text-right">
                        {property.price_per_night > 0 ? (
                          <>
                            <p className="text-sm font-medium">{formatPrice(property.price_per_night)}</p>
                            <p className="text-xs text-muted-foreground">per night</p>
                          </>
                        ) : (
                          <p className="text-xs text-muted-foreground italic">Inquire for rates</p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground" />
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </motion.div>
    );
  }

  // Full variant for showcase pages
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className={cn('py-12', className)}
    >
      <div className="container">
        <div className="flex items-center gap-3 mb-6">
          <Sparkles className="h-5 w-5 text-primary" />
          <h2 className="font-serif text-2xl font-semibold">You Might Also Love</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-6">
          <AnimatePresence>
            {recommendations.map((property, index) => (
              <motion.div
                key={property.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.15 }}
              >
                <Link to={`/property/${property.slug || property.id}`}>
                  <Card className="group overflow-hidden hover:shadow-lg transition-shadow">
                    <div className="relative aspect-[4/3] overflow-hidden">
                      {property.images[0] && (
                        <img
                          src={property.images[0]}
                          alt={property.name}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                      )}
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-medium mb-1 group-hover:text-primary transition-colors">
                        {property.name}
                      </h3>
                      <p className="text-sm text-muted-foreground mb-2">
                        {property.city}, {property.country}
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-sm italic text-muted-foreground">
                          {property.matchReason}
                        </span>
                        {property.price_per_night > 0 ? (
                          <span className="font-medium">
                            {formatPrice(property.price_per_night)}
                          </span>
                        ) : (
                          <span className="text-sm text-muted-foreground italic">Inquire</span>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </motion.section>
  );
}
