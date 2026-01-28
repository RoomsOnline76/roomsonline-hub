import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { 
  Search, 
  MapPin, 
  Plus, 
  ArrowRight, 
  X, 
  Calendar,
  Users,
  Map
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { supabase } from '@/integrations/supabase/client';
import { useItinerary, ItineraryStay } from '@/contexts/ItineraryContext';
import { TimelineVisualizer, StayCard } from '@/components/journey';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { format, addDays } from 'date-fns';

interface Property {
  id: string;
  name: string;
  slug: string;
  city: string;
  country: string;
  images: any[] | null;
  property_type: string;
}

export default function ItineraryBuilder() {
  const navigate = useNavigate();
  const { 
    stays, 
    removeStay, 
    totalPrice, 
    totalNights, 
    hasStays, 
    stayCount,
    guestDetails
  } = useItinerary();
  
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Fetch properties for search
  const { data: properties, isLoading: propertiesLoading } = useQuery({
    queryKey: ['itinerary-properties', searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('public_properties')
        .select('id, name, slug, city, country, images, property_type')
        .eq('is_active', true)
        .limit(20);

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,city.ilike.%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Property[];
    },
    enabled: true
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-ZA', {
      style: 'currency',
      currency: 'ZAR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Get suggested next check-in date based on last stay
  const getNextAvailableDate = (): Date => {
    if (stays.length === 0) return addDays(new Date(), 7);
    const lastStay = stays[stays.length - 1];
    return new Date(lastStay.dates.check_out);
  };

  // Filter out properties already in itinerary
  const availableProperties = properties?.filter(
    p => !stays.some(s => s.property_id === p.id)
  ) || [];

  const handleAddProperty = (property: Property) => {
    // Navigate to property page with itinerary mode flag
    navigate(`/property/${property.slug}?itinerary=true&suggestedDate=${format(getNextAvailableDate(), 'yyyy-MM-dd')}`);
  };

  const handleProceedToCheckout = () => {
    if (stays.length === 0) return;
    navigate('/journey/review');
  };

  return (
    <PublicLayout hideFooter>
      <div className="min-h-screen bg-background">
        {/* Header */}
        <header className="sticky top-0 z-40 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 border-b border-border">
          <div className="container flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Map className="h-5 w-5 text-primary" />
              <h1 className="font-serif text-lg font-medium">Build Your Journey</h1>
            </div>
            {hasStays && (
              <div className="flex items-center gap-4">
                <span className="text-sm text-muted-foreground">
                  {stayCount} {stayCount === 1 ? 'destination' : 'destinations'} · {totalNights} nights
                </span>
                <Button onClick={handleProceedToCheckout}>
                  Continue to Review
                  <ArrowRight className="h-4 w-4 ml-2" />
                </Button>
              </div>
            )}
          </div>
        </header>

        <main className="container py-8">
          <div className="grid lg:grid-cols-12 gap-8">
            {/* Left Column: Current Itinerary */}
            <div className="lg:col-span-5 space-y-6">
              <div>
                <h2 className="text-xl font-serif font-semibold mb-1">Your Itinerary</h2>
                <p className="text-sm text-muted-foreground">
                  {hasStays 
                    ? 'Drag to reorder, click to edit'
                    : 'Start by adding your first destination'}
                </p>
              </div>

              {hasStays && (
                <TimelineVisualizer stays={stays} compact className="mb-4" />
              )}

              <div className="space-y-4">
                {stays.map((stay, index) => (
                  <motion.div
                    key={stay.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <StayCard
                      stay={stay}
                      index={index}
                      onEditDates={() => {
                        navigate(`/property/${stay.property_slug}?editStay=${stay.id}`);
                      }}
                      onEditRooms={() => {
                        navigate(`/property/${stay.property_slug}?editStay=${stay.id}`);
                      }}
                      onRemove={() => removeStay(stay.id)}
                    />
                  </motion.div>
                ))}

                {!hasStays && (
                  <Card className="border-dashed">
                    <CardContent className="py-12 text-center">
                      <MapPin className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                      <h3 className="font-medium mb-2">No destinations yet</h3>
                      <p className="text-sm text-muted-foreground mb-4">
                        Search for properties and add them to your journey
                      </p>
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Summary Card */}
              {hasStays && (
                <Card className="bg-muted/30">
                  <CardContent className="pt-6">
                    <div className="space-y-3">
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Destinations</span>
                        <span>{stayCount}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-muted-foreground">Total Nights</span>
                        <span>{totalNights}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-semibold text-lg">
                        <span>Estimated Total</span>
                        <span className="text-primary">{formatCurrency(totalPrice)}</span>
                      </div>
                    </div>
                    <Button 
                      onClick={handleProceedToCheckout}
                      className="w-full mt-6"
                      size="lg"
                    >
                      Continue to Review
                    </Button>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Right Column: Property Search */}
            <div className="lg:col-span-7 space-y-6">
              <div>
                <h2 className="text-xl font-serif font-semibold mb-1">Add Destinations</h2>
                <p className="text-sm text-muted-foreground">
                  {hasStays 
                    ? `Properties available from ${format(getNextAvailableDate(), 'MMM d')}`
                    : 'Browse our collection of extraordinary properties'}
                </p>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by property name or location..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>

              {/* Property Grid */}
              <div className="grid sm:grid-cols-2 gap-4">
                {propertiesLoading ? (
                  Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="animate-pulse">
                      <div className="h-40 bg-muted rounded-t-lg" />
                      <CardContent className="pt-4">
                        <div className="h-4 bg-muted rounded w-3/4 mb-2" />
                        <div className="h-3 bg-muted rounded w-1/2" />
                      </CardContent>
                    </Card>
                  ))
                ) : availableProperties.length === 0 ? (
                  <div className="col-span-2 text-center py-12">
                    <MapPin className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
                    <p className="text-muted-foreground">
                      {searchQuery 
                        ? 'No properties match your search'
                        : 'All available properties are in your itinerary'}
                    </p>
                  </div>
                ) : (
                  availableProperties.map((property) => (
                    <motion.div
                      key={property.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      whileHover={{ y: -4 }}
                      transition={{ duration: 0.2 }}
                    >
                      <Card 
                        className="cursor-pointer overflow-hidden group"
                        onClick={() => handleAddProperty(property)}
                      >
                        <div className="relative h-40 overflow-hidden">
                          <img
                            src={(property.images && property.images[0]?.url) || '/placeholder.svg'}
                            alt={property.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                          <Badge 
                            variant="secondary" 
                            className="absolute top-3 right-3 bg-white/90 text-foreground"
                          >
                            {property.property_type || 'Property'}
                          </Badge>
                          <Button
                            size="sm"
                            className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Add
                          </Button>
                        </div>
                        <CardContent className="pt-4">
                          <h3 className="font-medium truncate">{property.name}</h3>
                          <p className="text-sm text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {property.city}, {property.country}
                          </p>
                        </CardContent>
                      </Card>
                    </motion.div>
                  ))
                )}
              </div>

              {/* Browse All Link */}
              <div className="text-center">
                <Button variant="outline" onClick={() => navigate('/')}>
                  Browse All Properties
                </Button>
              </div>
            </div>
          </div>
        </main>
      </div>
    </PublicLayout>
  );
}
