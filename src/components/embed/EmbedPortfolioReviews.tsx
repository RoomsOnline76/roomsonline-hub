import { Star, Quote } from 'lucide-react';

interface PortfolioReview {
  author: string;
  text: string;
  rating: number;
  date: string | null;
  photo_url: string | null;
  source: string;
  property_name: string;
  relative_time?: string;
  title?: string;
}

interface EmbedPortfolioReviewsProps {
  reviews: PortfolioReview[];
  tobiBlurbs: { property_name: string; blurb: string }[];
  brandColor: string;
}

const sourceLabels: Record<string, string> = {
  google: 'Google',
  tripadvisor: 'TripAdvisor',
  booking_com: 'Booking.com',
};

function getInitials(name: string) {
  return name.split(' ').map(w => w[0]).join('').substring(0, 2).toUpperCase();
}

export function EmbedPortfolioReviews({ reviews, tobiBlurbs, brandColor }: EmbedPortfolioReviewsProps) {
  if (reviews.length === 0 && tobiBlurbs.length === 0) return null;

  return (
    <div className="w-full">
      <div className="flex items-center gap-2 mb-4">
        <Star className="h-4 w-4" style={{ color: brandColor }} />
        <h2 className="text-sm font-semibold text-gray-900">What guests are saying</h2>
      </div>

      {/* TOBI blurbs */}
      {tobiBlurbs.length > 0 && (
        <div className="mb-5 space-y-3">
          {tobiBlurbs.map((tb, i) => (
            <div key={i} className="p-4 rounded-xl border border-gray-100" style={{ backgroundColor: `${brandColor}06` }}>
              <p className="text-sm text-gray-700 italic leading-relaxed">"{tb.blurb}"</p>
              <p className="text-xs text-gray-400 mt-2">— {tb.property_name}</p>
            </div>
          ))}
        </div>
      )}

      {/* Review cards - horizontal scroll */}
      {reviews.length > 0 && (
        <div className="flex gap-4 overflow-x-auto snap-x snap-mandatory scrollbar-hide pb-2">
          {reviews.map((review, i) => (
            <div
              key={i}
              className="snap-start shrink-0 w-[280px] sm:w-[300px] bg-white border border-gray-200 rounded-xl p-4 flex flex-col gap-2.5"
            >
              <div className="flex items-center gap-2.5">
                {review.photo_url ? (
                  <img
                    src={review.photo_url}
                    alt={review.author}
                    className="w-9 h-9 rounded-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
                    <span className="text-xs font-semibold text-gray-500">{getInitials(review.author)}</span>
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900 truncate">{review.author}</p>
                  <div className="flex items-center gap-1.5">
                    <div className="flex gap-0.5">
                      {[1, 2, 3, 4, 5].map(s => (
                        <Star key={s} className={`h-3 w-3 ${s <= review.rating ? 'text-amber-400 fill-amber-400' : 'text-gray-200'}`} />
                      ))}
                    </div>
                    <span className="text-[10px] text-gray-400">{sourceLabels[review.source] || review.source}</span>
                  </div>
                </div>
              </div>

              {review.title && (
                <p className="text-xs font-medium text-gray-800">{review.title}</p>
              )}

              <div className="relative flex-1">
                <Quote className="absolute -top-0.5 -left-0.5 h-3.5 w-3.5 text-gray-200" />
                <p className="text-xs text-gray-600 leading-relaxed line-clamp-4 pl-4">{review.text}</p>
              </div>

              <div className="flex items-center justify-between mt-auto">
                <span className="text-[10px] text-gray-400 font-medium" style={{ color: brandColor }}>
                  {review.property_name}
                </span>
                {review.relative_time && (
                  <span className="text-[10px] text-gray-300">{review.relative_time}</span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
