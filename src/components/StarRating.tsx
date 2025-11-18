import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps {
  rating: number;
  onRatingChange: (rating: number) => void;
  maxRating?: number;
}

export function StarRating({ rating, onRatingChange, maxRating = 5 }: StarRatingProps) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: maxRating }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          onClick={() => onRatingChange(star)}
          className="transition-colors hover:scale-110"
        >
          <Star
            className={cn(
              "h-8 w-8",
              star <= rating
                ? "fill-yellow-400 text-yellow-400"
                : "fill-muted text-muted stroke-muted-foreground"
            )}
          />
        </button>
      ))}
    </div>
  );
}
