import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useBehavioralMemory } from '@/hooks/useBehavioralMemory';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

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

  const fetchRecommendations = async () => {
    setLoading(true);
    try {
      const preferences = getInferredPreferences();
      const viewedPropertyIds = state.viewedProperties.map(v => v.propertyId);

      // Build query based on behavioral memory
      let query = supabase
        .from('public_properties')
        .select('id, name, slug, city, country, price_per_night, images')
        .eq('is_active', true)
        .limit(maxItems + 5); // Fetch extra for filtering

      // Exclude current and already viewed properties
      const excludeIds = [currentPropertyId, ...viewedPropertyIds].filter(Boolean);
      if (excludeIds.length > 0) {
        query = query.not('id', 'in', `(${excludeIds.join(',')})`);
      }

      // Apply preference-based filters
      if (preferences.preferredLocations.length > 0) {
        query = query.in('city', preferences.preferredLocations);
      }

      const { data: properties, error } = await query;

      if (error) {
        console.error('Error fetching recommendations:', error);
        setRecommendations([]);
        return;
      }

      if (!properties || properties.length === 0) {
        // Fallback: fetch any active properties
        const { data: fallbackProperties } = await supabase
          .from('public_properties')
          .select('id, name, slug, city, country, price_per_night, images')
          .eq('is_active', true)
          .neq('id', currentPropertyId || '')
          .limit(maxItems);

        if (fallbackProperties) {
          setRecommendations(
            fallbackProperties.map(p => ({
              id: p.id,
              name: p.name,
              slug: p.slug,
              city: p.city,
              country: p.country,
              price_per_night: p.price_per_night,
              images: Array.isArray(p.images) ? p.images as string[] : [],
              matchReason: 'Featured property'
            }))
          );
        }
        return;
      }

      // Score and rank properties based on preferences
      const scored = properties.map(p => {
        let score = 0;
        let reason = '';

        // Location match
        if (preferences.preferredLocations.includes(p.city)) {
          score += 30;
          reason = `Popular in ${p.city}`;
        }

        // Price match - use budgetRange from preferences if available
        if (preferences.preferredPriceRange) {
          const priceMax = parseInt(preferences.preferredPriceRange) || 5000;
          const priceRatio = p.price_per_night / priceMax;
          if (priceRatio >= 0.7 && priceRatio <= 1.3) {
            score += 25;
            reason = reason || 'Within your budget range';
          }
        }

        // Amenity preferences
        if (preferences.preferredAmenities.length > 0) {
          score += 15;
          reason = reason || 'Matches your preferences';
        }

        // Flexible dates bonus
        if (preferences.flexibleDates) {
          score += 10;
          reason = reason || 'Great for flexible travel';
        }

        return {
          id: p.id,
          name: p.name,
          slug: p.slug,
          city: p.city,
          country: p.country,
          price_per_night: p.price_per_night,
          images: Array.isArray(p.images) ? p.images as string[] : [],
          score,
          matchReason: reason || 'You might also like'
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
                        <p className="text-sm font-medium">{formatPrice(property.price_per_night)}</p>
                        <p className="text-xs text-muted-foreground">per night</p>
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
                        <span className="font-medium">
                          {formatPrice(property.price_per_night)}
                        </span>
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
