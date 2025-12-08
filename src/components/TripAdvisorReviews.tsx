import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ExternalLink } from "lucide-react";

interface TripAdvisorReviewsProps {
  tripadvisorId: string | null | undefined;
}

interface LocationDetails {
  location_id: string;
  name: string;
  rating: number;
  rating_image_url: string;
  num_reviews: string;
  review_rating_count: {
    "1"?: string;
    "2"?: string;
    "3"?: string;
    "4"?: string;
    "5"?: string;
  };
  subratings?: {
    [key: string]: {
      name: string;
      rating_image_url: string;
      value: string;
    };
  };
  web_url: string;
}

interface Review {
  id: number;
  title: string;
  text: string;
  rating: number;
  rating_image_url: string;
  published_date: string;
  url: string;
  user: {
    username: string;
    user_location?: {
      name: string;
    };
  };
}

interface ReviewsResponse {
  data: Review[];
}

export default function TripAdvisorReviews({ tripadvisorId }: TripAdvisorReviewsProps) {
  const [locationDetails, setLocationDetails] = useState<LocationDetails | null>(null);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tripadvisorId) {
      setLoading(false);
      return;
    }

    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Fetch location details and reviews in parallel
        const [detailsRes, reviewsRes] = await Promise.all([
          supabase.functions.invoke('tripadvisor-api', {
            body: { action: 'get_location_details', locationId: tripadvisorId }
          }),
          supabase.functions.invoke('tripadvisor-api', {
            body: { action: 'get_location_reviews', locationId: tripadvisorId, limit: 5 }
          })
        ]);

        if (detailsRes.error) {
          console.error('Location details error:', detailsRes.error);
          throw new Error(detailsRes.error.message);
        }
        if (reviewsRes.error) {
          console.error('Reviews error:', reviewsRes.error);
          throw new Error(reviewsRes.error.message);
        }

        setLocationDetails(detailsRes.data);
        setReviews((reviewsRes.data as ReviewsResponse)?.data || []);
      } catch (err) {
        console.error('TripAdvisor fetch error:', err);
        setError(err instanceof Error ? err.message : 'Failed to load reviews');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [tripadvisorId]);

  // Don't render anything if no TripAdvisor ID
  if (!tripadvisorId) return null;

  if (loading) {
    return (
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-6 uppercase tracking-wide text-foreground/80">Guest Reviews</h2>
        <Card>
          <CardContent className="p-6">
            <Skeleton className="h-8 w-48 mb-4" />
            <Skeleton className="h-24 w-full mb-4" />
            <Skeleton className="h-32 w-full" />
          </CardContent>
        </Card>
      </section>
    );
  }

  if (error || !locationDetails) return null;

  const totalReviews = parseInt(locationDetails.num_reviews || '0');
  const ratingCounts = locationDetails.review_rating_count || {};
  
  // Get subratings if available
  const subratings = locationDetails.subratings || {};
  const subratingEntries = Object.entries(subratings);

  // Calculate review distribution
  const reviewDistribution = [
    { label: 'Excellent', count: parseInt(ratingCounts['5'] || '0'), color: 'bg-green-600' },
    { label: 'Very Good', count: parseInt(ratingCounts['4'] || '0'), color: 'bg-green-500' },
    { label: 'Average', count: parseInt(ratingCounts['3'] || '0'), color: 'bg-yellow-500' },
    { label: 'Poor', count: parseInt(ratingCounts['2'] || '0'), color: 'bg-orange-500' },
    { label: 'Terrible', count: parseInt(ratingCounts['1'] || '0'), color: 'bg-red-500' },
  ];

  const maxCount = Math.max(...reviewDistribution.map(d => d.count), 1);

  return (
    <section className="mb-12">
      <h2 className="text-2xl font-semibold mb-6 uppercase tracking-wide text-foreground/80">Guest Reviews</h2>
      
      <Card className="overflow-hidden">
        {/* TripAdvisor Header */}
        <div className="bg-muted/50 border-b px-4 py-3 flex items-center justify-end">
          <span className="text-sm text-muted-foreground mr-2">Traveler Reviews brought to you by</span>
          <a 
            href={locationDetails.web_url} 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-1 hover:opacity-80 transition-opacity"
          >
            <img 
              src="https://www.tripadvisor.com/img/cdsi/img2/branding/v2/Tripadvisor_lockup_horizontal_secondary_registered-18034-2.svg" 
              alt="TripAdvisor" 
              className="h-6"
            />
          </a>
        </div>

        <CardContent className="p-6">
          {/* Rating Overview */}
          <div className="flex items-center gap-3 mb-4">
            {locationDetails.rating_image_url && (
              <img 
                src={locationDetails.rating_image_url} 
                alt={`${locationDetails.rating} rating`}
                className="h-6"
              />
            )}
            <span className="text-sm text-muted-foreground">
              {totalReviews.toLocaleString()} Reviews
            </span>
          </div>

          <h3 className="text-lg font-semibold mb-4">Tripadvisor Traveler Rating:</h3>

          {/* Rating Grid */}
          <div className="grid md:grid-cols-2 gap-6 mb-8">
            {/* Subratings */}
            {subratingEntries.length > 0 && (
              <div className="space-y-2">
                {subratingEntries.map(([key, subrating]) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-sm w-24 capitalize">{subrating.name}</span>
                    {subrating.rating_image_url && (
                      <img 
                        src={subrating.rating_image_url} 
                        alt={`${subrating.name} rating`}
                        className="h-4"
                      />
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Review Distribution */}
            <div className="space-y-2">
              {reviewDistribution.map((item) => (
                <div key={item.label} className="flex items-center gap-3">
                  <span className="text-sm w-20">{item.label}</span>
                  <div className="flex-1 h-4 bg-muted rounded-sm overflow-hidden">
                    <div 
                      className={`h-full ${item.color} transition-all duration-500`}
                      style={{ width: `${(item.count / maxCount) * 100}%` }}
                    />
                  </div>
                  <span className="text-sm w-10 text-right text-muted-foreground">
                    {item.count.toLocaleString()}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Reviews */}
          {reviews.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold mb-4">Recent Reviews:</h3>
              <div className="space-y-6">
                {reviews.map((review) => (
                  <div key={review.id} className="border-b pb-6 last:border-b-0 last:pb-0">
                    <div className="flex gap-4">
                      {/* User Info */}
                      <div className="w-28 flex-shrink-0">
                        <p className="text-sm font-medium text-muted-foreground truncate">
                          {review.user?.username || 'Anonymous'}
                        </p>
                        {review.user?.user_location?.name && (
                          <p className="text-xs text-muted-foreground/70 truncate">
                            {review.user.user_location.name}
                          </p>
                        )}
                      </div>

                      {/* Review Content */}
                      <div className="flex-1 min-w-0">
                        <h4 className="font-semibold mb-1">{review.title}</h4>
                        <div className="flex items-center gap-2 mb-2">
                          {review.rating_image_url && (
                            <img 
                              src={review.rating_image_url} 
                              alt={`${review.rating} rating`}
                              className="h-4"
                            />
                          )}
                          <span className="text-xs text-muted-foreground">
                            {new Date(review.published_date).toLocaleDateString('en-US', {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground line-clamp-3">
                          {review.text}
                          {review.text && review.text.length > 200 && (
                            <a 
                              href={review.url} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-primary hover:underline ml-1"
                            >
                              more »
                            </a>
                          )}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* View All Link */}
              <div className="mt-6 text-center">
                <a 
                  href={locationDetails.web_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-primary hover:underline text-sm font-medium"
                >
                  View all {totalReviews.toLocaleString()} reviews on TripAdvisor
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
