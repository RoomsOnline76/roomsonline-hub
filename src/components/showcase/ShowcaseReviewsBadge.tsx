import { Star } from 'lucide-react';

interface ReviewBadge {
  source: string;
  rating: number;
  totalReviews: number;
  url: string;
}

interface ShowcaseReviewsBadgeProps {
  badges: ReviewBadge[];
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
    </svg>
  );
}

function TripAdvisorIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#34E0A1"/>
      <text x="12" y="16" textAnchor="middle" fill="#fff" fontSize="12" fontWeight="800" fontFamily="sans-serif">TA</text>
    </svg>
  );
}

function BookingIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
      <rect width="24" height="24" rx="4" fill="#003580"/>
      <text x="12" y="17" textAnchor="middle" fill="#fff" fontSize="14" fontWeight="800" fontFamily="sans-serif">B</text>
    </svg>
  );
}

const sourceConfig: Record<string, { label: string; Icon: React.FC }> = {
  google: { label: 'Google Reviews', Icon: GoogleIcon },
  tripadvisor: { label: 'TripAdvisor', Icon: TripAdvisorIcon },
  booking_com: { label: 'Booking.com', Icon: BookingIcon },
};

function RatingStars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5">
      {Array.from({ length: 5 }, (_, i) => {
        const filled = i < Math.round(rating);
        return (
          <Star
            key={i}
            className={`h-4 w-4 ${filled ? 'fill-amber-400 text-amber-400' : 'fill-white/20 text-white/30'}`}
          />
        );
      })}
    </div>
  );
}

export function ShowcaseReviewsBadge({ badges }: ShowcaseReviewsBadgeProps) {
  if (!badges.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {badges.map((badge) => {
        const config = sourceConfig[badge.source] || { label: badge.source, Icon: GoogleIcon };
        const { Icon } = config;
        return (
          <a
            key={badge.source}
            href={badge.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl bg-black/40 backdrop-blur-md border border-white/10 text-white transition-all hover:bg-black/50 hover:scale-[1.02] hover:shadow-lg"
          >
            <Icon />
            <div className="flex flex-col gap-0.5">
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold leading-none">{badge.rating.toFixed(1)}</span>
                <RatingStars rating={badge.rating} />
              </div>
              {badge.totalReviews > 0 && (
                <span className="text-xs text-white/70 leading-none">{badge.totalReviews} reviews</span>
              )}
            </div>
          </a>
        );
      })}
    </div>
  );
}
