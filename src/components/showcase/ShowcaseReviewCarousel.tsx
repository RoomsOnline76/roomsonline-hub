import { Star, Quote } from 'lucide-react';
import { useRef, useState } from 'react';

interface Review {
  author: string;
  text: string;
  rating: number;
  date: string | null;
  photo_url: string | null;
  source: string;
  relative_time?: string;
  title?: string;
}

interface ShowcaseReviewCarouselProps {
  reviews: Review[];
  tobiBlurb?: string | null;
}

const sourceLabels: Record<string, string> = {
  google: 'Google',
  tripadvisor: 'TripAdvisor',
  booking_com: 'Booking.com',
};

function ReviewStars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          className={`h-3.5 w-3.5 ${i <= rating ? 'text-amber-400 fill-amber-400' : 'text-muted-foreground/30'}`}
        />
      ))}
    </div>
  );
}

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

export function ShowcaseReviewCarousel({ reviews, tobiBlurb }: ShowcaseReviewCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!reviews.length && !tobiBlurb) return null;

  return (
    <section className="py-10 sm:py-14">
      <h2 className="text-xl sm:text-2xl font-semibold text-foreground mb-6">
        What guests are saying
      </h2>

      {/* TOBI Blurb */}
      {tobiBlurb && (
        <div className="mb-8 p-5 rounded-2xl bg-primary/5 border border-primary/10">
          <p className="text-sm text-foreground/80 leading-relaxed italic">
            "{tobiBlurb}"
          </p>
        </div>
      )}

      {/* Review Cards — horizontal scroll on mobile, grid on desktop */}
      {reviews.length > 0 && (
        <div
          ref={scrollRef}
          className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2 md:grid md:grid-cols-2 lg:grid-cols-3 md:overflow-visible"
        >
          {reviews.map((review, i) => (
            <div
              key={i}
              className="snap-start shrink-0 w-[300px] md:w-auto bg-card border border-border rounded-2xl p-5 flex flex-col gap-3"
            >
              {/* Header: Avatar + Author + Source */}
              <div className="flex items-center gap-3">
                {review.photo_url ? (
                  <img
                    src={review.photo_url}
                    alt={review.author}
                    className="w-10 h-10 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
                    <span className="text-sm font-semibold text-muted-foreground">
                      {getInitials(review.author)}
                    </span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground truncate">{review.author}</p>
                  <div className="flex items-center gap-2">
                    <ReviewStars rating={review.rating} />
                    <span className="text-xs text-muted-foreground">
                      {sourceLabels[review.source] || review.source}
                    </span>
                  </div>
                </div>
              </div>

              {/* Review Title */}
              {review.title && (
                <p className="text-sm font-medium text-foreground">{review.title}</p>
              )}

              {/* Review Text */}
              <div className="relative flex-1">
                <Quote className="absolute -top-1 -left-1 h-4 w-4 text-muted-foreground/20" />
                <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4 pl-4">
                  {review.text}
                </p>
              </div>

              {/* Date */}
              {(review.relative_time || review.date) && (
                <p className="text-xs text-muted-foreground/60">
                  {review.relative_time || (review.date ? new Date(review.date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }) : '')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
