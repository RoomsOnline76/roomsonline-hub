import { motion } from 'framer-motion';
import { useScrollReveal } from '@/hooks/useScrollReveal';
import { staggerRunway, quoteReveal } from '@/lib/motion';
import { getEditorialRatingDisplay } from '@/lib/editorialUtils';
import { Star, Quote } from 'lucide-react';

interface Review {
  text: string;
  author?: string;
  rating?: number;
  source?: string;
}

interface RunwayReviewsProps {
  reviews?: Review[];
  editorialRating?: string | null;
  tripadvisorId?: string;
}

/**
 * Act IV: The Social Proof
 * Quote cards styled as editorial pull-quotes
 */
export function RunwayReviews({
  reviews = [],
  editorialRating,
}: RunwayReviewsProps) {
  const { ref, isVisible } = useScrollReveal({ threshold: 0.2 });
  
  const ratingDisplay = getEditorialRatingDisplay(editorialRating);
  const hasContent = reviews.length > 0 || ratingDisplay;

  if (!hasContent) return null;

  return (
    <section 
      ref={ref}
      className="runway-section-spacing px-6 sm:px-10 md:px-16 lg:px-20"
    >
      <div className="max-w-5xl mx-auto">
        {/* Section Header */}
        <div className="text-center mb-10 sm:mb-14">
          <span className="runway-section">Runway Reviews</span>
        </div>

        {/* Editorial Rating as Art Piece */}
        {ratingDisplay && reviews.length === 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={isVisible ? { opacity: 1, scale: 1 } : {}}
            transition={{ duration: 0.6 }}
            className="text-center"
          >
            <div className="inline-flex flex-col items-center gap-4 p-8 sm:p-12 bg-card border border-border/50 rounded-2xl">
              <span className="runway-rating">
                <Star className="h-4 w-4 fill-primary text-primary" />
                {ratingDisplay.label}
              </span>
              {ratingDisplay.description && (
                <p className="runway-facts max-w-sm">
                  {ratingDisplay.description}
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* Reviews Grid */}
        {reviews.length > 0 && (
          <motion.div
            initial="initial"
            animate={isVisible ? "animate" : "initial"}
            variants={staggerRunway}
            className="grid gap-6 sm:gap-8 md:grid-cols-2"
          >
            {reviews.slice(0, 4).map((review, index) => (
              <motion.blockquote
                key={index}
                variants={quoteReveal}
                className="relative p-6 sm:p-8 bg-card border border-border/40 rounded-xl"
              >
                <Quote className="absolute top-4 left-4 h-6 w-6 text-primary/20" />
                
                <p className="runway-quote pl-8 mb-4">
                  "{review.text}"
                </p>

                <footer className="flex items-center justify-between pt-4 border-t border-border/30">
                  <div>
                    {review.author && (
                      <cite className="not-italic font-medium text-sm">
                        {review.author}
                      </cite>
                    )}
                    {review.source && (
                      <span className="block text-xs text-muted-foreground">
                        via {review.source}
                      </span>
                    )}
                  </div>

                  {review.rating && (
                    <div className="flex items-center gap-0.5">
                      {Array.from({ length: review.rating }).map((_, i) => (
                        <Star 
                          key={i} 
                          className="h-3.5 w-3.5 fill-primary text-primary" 
                        />
                      ))}
                    </div>
                  )}
                </footer>
              </motion.blockquote>
            ))}

            {/* Editorial Rating alongside reviews */}
            {ratingDisplay && reviews.length > 0 && (
              <motion.div
                variants={quoteReveal}
                className="flex items-center justify-center p-6 sm:p-8 bg-primary/5 border border-primary/20 rounded-xl"
              >
                <div className="text-center">
                  <span className="runway-rating mb-3">
                    <Star className="h-4 w-4 fill-primary text-primary" />
                    {ratingDisplay.label}
                  </span>
                  {ratingDisplay.description && (
                    <p className="runway-facts text-sm mt-3">
                      {ratingDisplay.description}
                    </p>
                  )}
                </div>
              </motion.div>
            )}
          </motion.div>
        )}
      </div>
    </section>
  );
}
