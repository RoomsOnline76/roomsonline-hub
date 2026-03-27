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

const sourceConfig: Record<string, { label: string; icon: string; color: string }> = {
  google: { label: 'Google', icon: 'G', color: 'bg-blue-50 text-blue-700 border-blue-200' },
  tripadvisor: { label: 'TripAdvisor', icon: 'TA', color: 'bg-green-50 text-green-700 border-green-200' },
  booking_com: { label: 'Booking.com', icon: 'B', color: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};

export function ShowcaseReviewsBadge({ badges }: ShowcaseReviewsBadgeProps) {
  if (!badges.length) return null;

  return (
    <div className="flex flex-wrap items-center gap-3">
      {badges.map((badge) => {
        const config = sourceConfig[badge.source] || { label: badge.source, icon: '★', color: 'bg-muted text-foreground border-border' };
        return (
          <a
            key={badge.source}
            href={badge.url}
            target="_blank"
            rel="noopener noreferrer"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all hover:shadow-sm hover:scale-[1.02] ${config.color}`}
          >
            <span className="font-bold text-xs">{config.icon}</span>
            <Star className="h-3.5 w-3.5 fill-current" />
            <span className="font-semibold">{badge.rating.toFixed(1)}</span>
            {badge.totalReviews > 0 && (
              <span className="text-xs opacity-70">({badge.totalReviews})</span>
            )}
          </a>
        );
      })}
    </div>
  );
}
